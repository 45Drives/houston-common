import { EasySetupConfig } from "./types";
import {
  Command,
  SambaConfParser,
  SambaManagerNet,
  server,
  File,
  unwrap,
  ZFSConfig,
  CommandOptions,
  ValueError,
  Scheduler,
  ZFSReplicationTaskTemplate,
  SambaShareConfig,
  LocalUser
} from "@/index";
import {
  storeEasySetupConfig,
  startEasySetupRunLogging,
  promoteEasySetupRunLogging,
  flushConsoleFileLogger,
} from "./logConfig";
import { ZFSManager } from "@/index";
import * as defaultConfigs from "@/defaultconfigs";
import { okAsync } from "neverthrow";
import {
  AutomatedSnapshotTaskTemplate,
  ScrubTaskTemplate,
  generateAllDefaultConfigs,
} from "@/scheduler";

// List of required Samba ports
const sambaPorts = [
  { port: 137, protocol: "udp" },
  { port: 138, protocol: "udp" },
  { port: 139, protocol: "tcp" },
  { port: 445, protocol: "tcp" },
];

const decode = (buf: Uint8Array) => new TextDecoder().decode(buf);

/** Only paths matching this are ever passed to the destructive wipe script. */
const DEVICE_PATH_REGEX = /^\/dev\/[A-Za-z0-9._\/-]+$/;

/** How many drives are erased concurrently in "full" mode. */
const FULL_WIPE_CONCURRENCY = 8;

/**
 * Shell helpers shared by the guard and the wipe script so both judge "is this a
 * system disk?" identically. Emits nothing on its own.
 */
const systemDiskProbe = `
# Canonical whole-disk node for a path that may be a symlink, a partition, or a disk.
canon() {
  p=$(readlink -f "$1" 2>/dev/null) || return 0
  [ -b "$p" ] || return 0
  if [ "$(lsblk -ndo TYPE "$p" 2>/dev/null)" = "part" ]; then
    parent=$(lsblk -ndo PKNAME "$p" 2>/dev/null)
    [ -n "$parent" ] && p="/dev/$parent"
  fi
  printf '%s\\n' "$p"
}

# Every whole disk underneath a device, walking down through md/LVM/LUKS stacks
# so both halves of a mirrored boot device are reported, not just the array node.
holders() {
  lsblk -nrso NAME,TYPE "$1" 2>/dev/null | awk '$2=="disk"{print "/dev/" $1}'
}

# Disks the running OS depends on, as "<device><TAB><reason>".
system_disks() {
  for mp in / /boot /boot/efi /usr /etc /var; do
    src=$(findmnt -nvo SOURCE --target "$mp" 2>/dev/null | head -n1)
    [ -n "$src" ] || continue
    case "$src" in
      /dev/*)
        for d in $(holders "$src"); do printf '%s\\t%s\\n' "$d" "holds $mp"; done
        ;;
      *)
        # ZFS root: SOURCE is a dataset, so expand the pool to its leaf vdevs.
        pool=\${src%%/*}
        case "$pool" in ""|*[!A-Za-z0-9_.:-]*) continue ;; esac
        for leaf in $(zpool list -vHPL "$pool" 2>/dev/null | awk '$1 ~ /^\\/dev\\//{print $1}'); do
          for d in $(holders "$leaf"); do
            printf '%s\\t%s\\n' "$d" "is a member of root pool '$pool' holding $mp"
          done
        done
        ;;
    esac
  done
  if [ -r /proc/swaps ]; then
    for s in $(awk 'NR>1 && $1 ~ /^\\/dev\\//{print $1}' /proc/swaps); do
      for d in $(holders "$s"); do printf '%s\\t%s\\n' "$d" "holds active swap"; done
    done
  fi
}
`;

/**
 * Run as \`bash -c <script> disk-guard <devicePath...>\`.
 * Prints one \`<severity><TAB><path><TAB><reason>\` line per problem drive and nothing for clean ones.
 */
const systemDiskGuardScript = `
set -u
${systemDiskProbe}
protected=$(system_disks)

for arg in "$@"; do
  dev=$(canon "$arg")
  if [ -z "$dev" ]; then
    printf 'missing\\t%s\\t%s\\n' "$arg" "does not resolve to a block device"
    continue
  fi

  reason=$(printf '%s\\n' "$protected" | awk -F'\\t' -v d="$dev" '$1==d{print $2; exit}')
  if [ -n "$reason" ]; then
    printf 'system\\t%s\\t%s (resolves to %s)\\n' "$arg" "$reason" "$dev"
    continue
  fi

  parttypes=$(lsblk -nro PARTTYPE "$dev" 2>/dev/null | tr 'A-Z' 'a-z')
  case "$parttypes" in
    *c12a7328-f81f-11d2-ba4b-00a0c93ec93b*)
      printf 'boot\\t%s\\t%s\\n' "$arg" "carries an EFI System Partition ($dev)"
      ;;
    *21686148-6449-6e6f-744e-656564454649*)
      printf 'boot\\t%s\\t%s\\n' "$arg" "carries a BIOS boot partition ($dev)"
      ;;
  esac
done
`;

/** Run as `bash -c <script> wipe-drive <devicePath> <quick|full>` so neither argument is interpolated into shell text. */
const wipeDriveScript = `
set -u
${systemDiskProbe}
disk="$1"
mode="$2"
method=""

if [ ! -b "$disk" ]; then
  echo "skipped (not a block device): $disk"
  exit 0
fi

# Re-checked here rather than trusting the caller: a full erase runs for hours,
# so the disk behind this path may not be the one that passed the earlier guard.
canonical=$(canon "$disk")
guard=$(system_disks | awk -F'\\t' -v d="$canonical" '$1==d{print $2; exit}')
if [ -n "$guard" ]; then
  echo "REFUSED: $disk resolves to $canonical which $guard" >&2
  exit 3
fi

# Metadata teardown, both modes: pool labels, RAID superblocks, filesystem magic, partition table.
for dev in "$disk" "$disk"?*; do
  [ -b "$dev" ] || continue
  zpool labelclear -f "$dev" >/dev/null 2>&1 || true
  wipefs -a -f "$dev" >/dev/null 2>&1 || true
  mdadm --zero-superblock --force "$dev" >/dev/null 2>&1 || true
done
sgdisk --zap-all "$disk" >/dev/null 2>&1 || true

if [ "$mode" = "full" ]; then
  case "$disk" in
    *nvme*)
      if nvme format "$disk" --ses=1 --force >/dev/null 2>&1; then method="nvme-format"; fi
      ;;
  esac
  if [ -z "$method" ] && blkdiscard -f "$disk" >/dev/null 2>&1; then method="blkdiscard"; fi
  if [ -z "$method" ] && blkdiscard "$disk" >/dev/null 2>&1; then method="blkdiscard"; fi
  if [ -z "$method" ]; then
    # oflag=direct is unsupported on some HBAs, so probe before committing to the long write
    if dd if=/dev/zero of="$disk" bs=4M count=1 oflag=direct >/dev/null 2>&1; then
      ddflags="oflag=direct"
    else
      ddflags=""
    fi
    dd if=/dev/zero of="$disk" bs=64M $ddflags >/dev/null 2>&1 || true
    sync
    method="zero-overwrite"
  fi
  sgdisk --zap-all "$disk" >/dev/null 2>&1 || true
else
  method="signatures-only"
  dd if=/dev/zero of="$disk" bs=1M count=16 conv=fsync >/dev/null 2>&1 || true
  sectors=$(blockdev --getsz "$disk" 2>/dev/null || echo 0)
  case "$sectors" in ''|*[!0-9]*) sectors=0 ;; esac
  if [ "$sectors" -gt 32768 ]; then
    dd if=/dev/zero of="$disk" bs=512 seek=$((sectors - 32768)) count=32768 conv=fsync >/dev/null 2>&1 || true
  fi
fi

partprobe "$disk" >/dev/null 2>&1 || true
udevadm settle >/dev/null 2>&1 || true
echo "wiped ($mode/$method): $disk"
`;

export interface EasySetupProgress {
  message: string;
  step: number;
  total: number;
  /** Non-fatal problem. Setup continues; step/total do not advance. */
  warning?: boolean;
}

export class EasySetupConfigurator {
  sambaManager: SambaManagerNet;
  zfsManager: ZFSManager;
  commandOptions: CommandOptions;

  /** Set for the duration of applyConfig so nested steps can surface non-fatal problems. */
  private reportWarning?: (message: string) => void;

  constructor() {
    this.sambaManager = new SambaManagerNet();
    this.zfsManager = new ZFSManager();
    this.commandOptions = { superuser: "require" };
  }

  private async ensureAdminSession(): Promise<void> {
    try {
      const proc = await unwrap(
        server.execute(
          new Command(["id", "-u"], { superuser: "require" })
        )
      );
      const uid = decode(proc.stdout).trim();
      // console.log("[EasySetup] elevated uid:", uid);

      if (uid !== "0") {
        throw new Error(`Expected uid 0, got ${uid}`);
      }
    } catch (err) {
      console.error("[EasySetup] failed to obtain admin session:", err);
      throw new Error("Administrative access denied or unavailable");
    }
  }

  private async getCurrentHostname(): Promise<string> {
    const p = await unwrap(server.execute(new Command(["hostname"], { superuser: "try" }), true));
    return decode(p.stdout).trim();
  }

  private resolveServerName(config: EasySetupConfig, currentHostname: string): string {
    const desired = (config.srvrName ?? "").trim();
    if (desired) return desired;
    return (currentHostname ?? "").trim();
  }

  async applyConfig(
    config: EasySetupConfig,
    progressCallback: (progress: EasySetupProgress) => void
  ) {
    // The optional drive wipe is a real step, so the count shifts with it.
    // `total` is one past the last announced step: a step report means that step is
    // *starting*, so completion is only signalled once all work has actually finished.
    const announcedSteps = config.wipeDrives ? 11 : 10;
    const total = announcedSteps + 1;

    let stepNumber = 0;
    const report = (message: string) =>
      progressCallback({ step: ++stepNumber, total, message });

    // step 0 never matches an advance, an error (< 0) or completion (=== total)
    const reportWarning = (message: string) => {
      console.warn(`[EasySetup] ${message}`);
      progressCallback({ step: 0, total, message, warning: true });
    };
    this.reportWarning = reportWarning;
    this.zfsManager.onWarning = reportWarning;


    // Start logging to /tmp immediately (works even if admin is denied)
    const run = startEasySetupRunLogging();

    try {
      report("Initializing Storage Setup...");

      try {
        await this.ensureAdminSession();
        // Now that admin is available, switch logs to /var/log/45drives/...
        await promoteEasySetupRunLogging(run.varPath, run.tmpPath);
      } catch (err) {
        progressCallback({
          message: "This setup requires administrative privileges. Please reconnect with a root or sudo-capable account.",
          step: -1,
          total: -1,
        });
        console.error("[EasySetup] Admin session unavailable:", err);
        // Ensure queued log writes make it to disk before returning
        await flushConsoleFileLogger();
        return;
      }

      // Fail before the first destructive step if the OS lives on a selected drive.
      await this.assertNoSystemDisks(config, "pre-flight");

      report("Configuring SSH Security and Root Access...");
      await this.applyServerConfig(config);

      report("Clearing any existing ZFS and Samba data...");
      if (config.skipClearExisting) {
        console.log("[EasySetup] Skipping pool/share destruction (skipClearExisting=true)");
      } else {
        await this.deleteZFSPoolAndSMBShares(config);
      }

      if (config.wipeDrives) {
        report(
          config.wipeMode === "full"
            ? "Erasing every block on the selected drives (this can take hours)..."
            : "Erasing partition tables and signatures on the selected drives..."
        );
        await this.wipeConfiguredDrives(config);
      }

      report("Updating Server Name (if changed)...");
      await this.updateHostname(config);

      report("Creating Users and Groups...");
      await this.applyUsersAndGroups(config);

      report("Configuring ZFS Storage with available drives...");
      await this.applyZFSConfig(config);

      report("Configuring Storage Sharing...");
      await this.applySambaConfig(config);

      report("Opening Samba Port...");
      await this.applyOpenSambaPorts();

      report("Scheduling Snapshot tasks...");
      await this.scheduleTasks(config);

      report("Checking Services and Storage...");

      // Post-setup verification: confirm critical services are active and pools are imported
      await this.verifyPostSetup(config);

      console.log("[EasySetup] About to write simple-setup-log.json");

      const currentHostname = await this.getCurrentHostname();
      const serverName = this.resolveServerName(config, currentHostname);

      const ok = await storeEasySetupConfig(config, serverName);
      console.log(`[EasySetup] simple-setup-log.json write ${ok ? "OK" : "FAILED"}`);

      // Every step has finished; only now is it safe to tell the UI setup is complete.
      progressCallback({ step: total, total, message: "Setup complete." });

    } catch (error: any) {
      console.error("Error in setupStorage:", error);
      progressCallback({ message: `Error: ${error.message}`, step: -1, total: -1 });
    } finally {
      await flushConsoleFileLogger();
    }

  }

  // Detect the Linux distro
  private async getLinuxDistro(): Promise<"rocky" | "ubuntu" | "unknown"> {
    const osReleaseFile = new File(server, "/etc/os-release");

    const exists = await osReleaseFile.exists();
    if (exists.isErr() || !exists.value) {
      return "unknown";
    }

    const readResult = await osReleaseFile.read();
    if (readResult.isErr()) {
      return "unknown";
    }

    const osRelease = readResult.value;

    if (/rocky/i.test(osRelease)) return "rocky";
    if (/ubuntu/i.test(osRelease)) return "ubuntu";

    return "unknown";
  }

  // Apply firewall rules
  private async applyOpenSambaPorts() {
    const distro = await this.getLinuxDistro();
    // console.log(`Detected distro: ${distro}`);

    if (distro === "rocky") {
      try {
        for (const { port, protocol } of sambaPorts) {
          await unwrap(
            server.execute(
              new Command(["firewall-cmd", "--permanent", `--add-port=${port}/${protocol}`], this.commandOptions)
            )
          );
        }
        await unwrap(
          server.execute(new Command(["firewall-cmd", "--reload"], this.commandOptions))
        );
        console.log(" Samba ports opened using firewalld (Rocky).");
      } catch (err) {
        console.error(" Failed to configure firewalld:", err);
        throw new Error(`Firewall configuration failed (firewalld): ${(err as any)?.message ?? err}`);
      }
    } else if (distro === "ubuntu") {
      try {
        const allowCmds = [
          ["ufw", "allow", "137/udp"],
          ["ufw", "allow", "138/udp"],
          ["ufw", "allow", "139/tcp"],
          ["ufw", "allow", "445/tcp"],
        ];
        for (const args of allowCmds) {
          await unwrap(server.execute(new Command(args, this.commandOptions)));
        }
        await unwrap(
          server.execute(new Command(["ufw", "reload"], this.commandOptions))
        );
        console.log(" Samba ports opened using ufw (Ubuntu).");
      } catch (err) {
        console.error(" Failed to configure ufw:", err);
        throw new Error(`Firewall configuration failed (ufw): ${(err as any)?.message ?? err}`);
      }
    } else {
      console.warn(" Unsupported Linux distribution. Please configure the firewall manually.");
    }
  }

  private async scheduleTasks(config: EasySetupConfig) {
    const storageZfsConfig = config.zfsConfigs![0]!;

    const taskTemplates = [
      new AutomatedSnapshotTaskTemplate(),
      new ScrubTaskTemplate(),
    ];

    const myScheduler = new Scheduler(taskTemplates, []);

    const taskConfig = generateAllDefaultConfigs({
      storagePool: {
        poolName: storageZfsConfig.pool.name,
        datasetName: storageZfsConfig.dataset.name,
      },
    });

    const result = await myScheduler.importTasksFromConfig(JSON.stringify(taskConfig));

    if (result.errors.length > 0) {
      console.error('Task import errors:', result.errors);
      this.reportWarning?.(
        `${result.errors.length} scheduled ${result.errors.length === 1 ? "task" : "tasks"} could not be created, ` +
          `so automatic snapshots and/or scrubs are not configured: ${result.errors.join(" ")}`
      );
    }
    if (result.imported.length > 0) {
      console.log('Tasks imported:', result.imported.join(', '));
    }
  }


  private static readonly HOSTNAME_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

  private async updateHostname(config: EasySetupConfig) {
    const desired = (config.srvrName ?? "").trim();
    if (!desired) return;

    // Validate hostname to prevent shell injection and invalid system hostnames
    if (!EasySetupConfigurator.HOSTNAME_RE.test(desired)) {
      throw new ValueError(`Invalid hostname '${desired}': must contain only letters, numbers, and hyphens, and cannot start or end with a hyphen.`);
    }

    const current = await this.getCurrentHostname();
    if (desired === current) return;

    const distro = await this.getLinuxDistro();

    // 1) Persist first (writes /etc/hostname and /etc/machine-info)
    await unwrap(server.writeHostnameFiles(desired));

    // 1b) Update /etc/hosts so services (samba, avahi) can resolve the new hostname
    await server.execute(
      new Command(
        [
          "sed", "-i",
          `s/127\\.0\\.1\\.1\\s.*/127.0.1.1\t${desired}/`,
          "/etc/hosts",
        ],
        this.commandOptions
      ),
      true
    );
    // If no 127.0.1.1 line existed, append one
    await server.execute(
      new Command(
        [
          "bash", "-c",
          `grep -q '^127\\.0\\.1\\.1' /etc/hosts || echo -e '127.0.1.1\\t${desired}' >> /etc/hosts`,
        ],
        this.commandOptions
      ),
      true
    );

    // 2) Best-effort runtime hostname without noisy DBus on Rocky
    if (distro === "ubuntu") {
      // setHostname swallows errors already; no unwrap so it won’t log failures
      await server.setHostname(desired);
    } else {
      // on Rocky, avoid hostnamectl (polkit noise); set kernel hostname directly, quietly
      await server.execute(new Command(["hostname", desired], this.commandOptions), true);
    }

    // 3) Bounce daemons that read hostname (quietly in case a unit is missing)
    await server.execute(new Command(["systemctl", "restart", "systemd-hostnamed"], this.commandOptions), true);
    await server.execute(new Command(["systemctl", "restart", "avahi-daemon"], this.commandOptions), true);
    await server.execute(new Command(["systemctl", "restart", "houston-broadcaster.service"], this.commandOptions), true);
  }

  private async getAdminGroupName(): Promise<"wheel" | "sudo"> {
    const distro = await this.getLinuxDistro();
    return distro === "ubuntu" ? "sudo" : "wheel";
  }

  private normalizeAdminGroup(name: string, admin: string) {
    return (name === "wheel" || name === "sudo") ? admin : name;
  }

  private async setGroupOwnedTree(path: string, group = "smbusers") {
    // // Owner user = root (or a service account), group = smbusers
    // await unwrap(server.execute(new Command(["chown", "-R", `root:${group}`, path], this.commandOptions), true));
    // // rwx for user/group, rx for others; +setgid so children inherit group
    // await unwrap(server.execute(new Command(["chmod", "-R", "2775", path], this.commandOptions), true));

    // // Optional but helpful if ACLs are available; ignore errors if setfacl isn't present
    // await server.execute(new Command(["setfacl", "-m", `g:${group}:rwx`, path], this.commandOptions));
    // await server.execute(new Command(["setfacl", "-d", "-m", `g:${group}:rwx`, path], this.commandOptions)); // default ACL

    await unwrap(server.execute(new Command(["chown", `root:${group}`, path], this.commandOptions), true));
    // await unwrap(server.execute(new Command(["chmod", "2775", path], this.commandOptions), true));
    await unwrap(server.execute(new Command(["chmod", "2770", path], this.commandOptions), true));
    // defaults for future children
    await server.execute(new Command(["setfacl", "-m", `g:${group}:rwx`, path], this.commandOptions));
    await server.execute(new Command(["setfacl", "-d", "-m", `g:${group}:rwx`, path], this.commandOptions));

  }

  private async listAllPools(): Promise<string[]> {
    const cmd = new Command(
      ["bash", "-lc", "zpool list -H -o name 2>/dev/null || true"],
      { superuser: "try" }
    );

    const proc = await unwrap(server.execute(cmd, true));
    return decode(proc.stdout)
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  private async unmountAndRemovePoolByName(poolName: string) {
    const poolPath = `/${poolName}`;

    if (!(await this.poolExists(poolName))) {
      console.log(`Skipping destruction. Pool '${poolName}' does not exist.`);
      return;
    }

    console.log(`Unmounting and destroying ${poolName}...`);
    await this.stopServicesUsingPool();

    // Kill any processes using the pool mountpoint (lsof/fuser)
    await this.killProcessesOnMount(poolPath);

    await this.tryDestroyPoolWithRetries(poolName);

    // Final sanity check: pool must be gone or we abort
    if (await this.poolExists(poolName)) {
      throw new Error(`Pool ${poolName} still exists after destroy attempts; aborting.`);
    }

    // Best-effort cleanup of the mountpoint
    await server.execute(new Command(["rm", "-rf", poolPath], this.commandOptions), true);
  }


  private async deleteZFSPoolAndSMBShares(config: EasySetupConfig) {
    if (!config.zfsConfigs) return;

    const storageZfsConfig = config.zfsConfigs[0]!;
    const storagePoolName = storageZfsConfig.pool.name;

    // 1) Enumerate all existing pools
    const allPools = await this.listAllPools();
    console.log("Existing ZFS pools:", allPools);

    // 2) Close/remove any Samba share whose path lives under ANY pool mountpoint
    const allShares = await this.sambaManager.getShares().unwrapOr(undefined);
    console.log("Existing Samba shares:", allShares);

    if (allShares && allShares.length > 0) {
      for (const share of allShares) {
        // Match if path starts with /<poolName> for any current pool
        const owningPool = allPools.find(p => share.path.startsWith(`/${p}`));
        if (!owningPool) continue;

        try {
          await unwrap(this.sambaManager.closeSambaShare(share.name));
        } catch (e) {
          console.warn(`Close share failed for ${share.name}:`, e);
        }
        try {
          await unwrap(this.sambaManager.removeShare(share));
        } catch (e) {
          console.warn(`Remove share failed for ${share.name}:`, e);
        }
      }
    }

    // 3) Destroy all pools we found
    for (const poolName of allPools) {

      console.log(`Unmounting and destroying pool '${poolName}'...`);
      await this.unmountAndRemovePoolByName(poolName);
    }

    if (allPools.includes(storagePoolName)) {
      console.log(`Verified destruction of storage pool '${storagePoolName}'.`);
    }
  }


  /**
   * Every disk path that will be handed to `zpool create`, de-duplicated.
   */
  private collectConfiguredDiskPaths(config: EasySetupConfig): string[] {
    const zfsConfigs = config.zfsConfigs ?? [];
    const paths = new Set<string>();
    for (const zfsConfig of zfsConfigs) {
      for (const vdev of zfsConfig?.pool?.vdevs ?? []) {
        for (const disk of vdev.disks ?? []) {
          // Same order ZFSManager.formatVDevArgv uses, so the wipe and the pool
          // always target the identical device rather than an unstable /dev/sdX.
          const path = [disk.path, disk.vdev_path, disk.sd_path, disk.phy_path].find(
            (candidate) => candidate && candidate !== "N/A"
          );
          if (!path) continue;
          if (!DEVICE_PATH_REGEX.test(path)) {
            console.warn(`[EasySetup] Ignoring unexpected device path: ${path}`);
            continue;
          }
          paths.add(path);
        }
      }
    }
    return [...paths];
  }

  /**
   * Refuse to touch any configured drive that backs the running OS.
   *
   * The wizard only lists bay-aliased drives, so on a normal install this never
   * fires. It exists so an unusual OS location fails loudly instead of silently
   * being erased, and it is re-run immediately before `zpool create` because a
   * full wipe can leave hours between the first check and the destructive step.
   */
  private async assertNoSystemDisks(config: EasySetupConfig, stage: string) {
    const diskPaths = this.collectConfiguredDiskPaths(config);
    if (diskPaths.length === 0) return;

    let findings: string[];
    try {
      const proc = await unwrap(
        server.execute(
          new Command(["bash", "-c", systemDiskGuardScript, "disk-guard", ...diskPaths], this.commandOptions),
          true
        )
      );
      findings = decode(proc.stdout).split("\n").filter((line) => line.trim() !== "");
    } catch (err) {
      console.error(`[EasySetup] System-disk guard failed to run (${stage}):`, err);
      throw new Error(
        "Could not verify that the selected drives are safe to erase. Aborting before any destructive step."
      );
    }

    const blocked: string[] = [];
    for (const line of findings) {
      const [severity, path, reason] = line.split("\t");
      if (!severity || !path || !reason) continue;
      if (severity === "system") {
        blocked.push(`${path} — ${reason}`);
      } else if (severity === "boot") {
        console.warn(
          `[EasySetup] WARNING (${stage}): ${path} ${reason}, but nothing is mounted from it. ` +
            `Treating it as a leftover from a previous OS install; it will be erased.`
        );
      } else {
        console.warn(`[EasySetup] WARNING (${stage}): ${path} ${reason}`);
      }
    }

    if (blocked.length > 0) {
      const detail = blocked.map((entry) => `  • ${entry}`).join("\n");
      console.error(`[EasySetup] ABORT (${stage}): system disks are in the storage configuration:\n${detail}`);
      throw new Error(
        `Refusing to continue: ${blocked.length} selected drive(s) are part of the running system, ` +
          `and erasing them would destroy this installation.\n${detail}\n\n` +
          `Remove these drives from the storage configuration and run setup again.`
      );
    }
  }

  /**
   * Destroy all on-disk metadata for the configured drives so `zpool create` sees blank media.
   */
  private async wipeConfiguredDrives(config: EasySetupConfig) {
    const diskPaths = this.collectConfiguredDiskPaths(config);
    if (diskPaths.length === 0) {
      console.warn("[EasySetup] wipeDrives requested but no drives were resolved from the config");
      return;
    }

    await this.assertNoSystemDisks(config, "pre-wipe");

    const mode = config.wipeMode === "full" ? "full" : "quick";
    console.log(`[EasySetup] Wiping ${diskPaths.length} drive(s) in "${mode}" mode:`, diskPaths);
    await this.stopServicesUsingPool();

    const wipeOne = async (diskPath: string) => {
      const startedAt = Date.now();
      try {
        const proc = await unwrap(
          server.execute(
            new Command(["bash", "-c", wipeDriveScript, "wipe-drive", diskPath, mode], this.commandOptions),
            true
          )
        );
        const elapsed = Math.round((Date.now() - startedAt) / 1000);
        console.log(`[EasySetup] ${decode(proc.stdout).trim()} (${elapsed}s)`);
      } catch (err) {
        console.error(`[EasySetup] Failed to wipe ${diskPath}:`, err);
        throw new Error(`Failed to wipe drive ${diskPath}. Aborting before pool creation.`);
      }
    };

    if (mode === "quick") {
      for (const diskPath of diskPaths) {
        await wipeOne(diskPath);
      }
      return;
    }

    // A full erase is bound by per-drive throughput, so overlap drives instead of serializing hours of writes.
    const queue = [...diskPaths];
    const workers = Array.from(
      { length: Math.min(FULL_WIPE_CONCURRENCY, queue.length) },
      async () => {
        for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
          await wipeOne(next);
        }
      }
    );
    await Promise.all(workers);
  }

  /**
   * Stop services that may hold open files on pool mountpoints.
   */
  private async stopServicesUsingPool() {    const distro = await this.getLinuxDistro();
    const sambaServices = (distro === "ubuntu") ? ["smbd", "nmbd"] : ["smb", "nmb"];
    const allServices = ["houston-broadcaster", ...sambaServices];

    for (const svc of allServices) {
      // ignore if not present
      await server.execute(new Command(["systemctl", "stop", svc], { superuser: "try" }), true);
    }
    // Brief delay to let file handles be released
    await new Promise(r => setTimeout(r, 500));
  }

  /**
   * Kill any processes with open files/cwd under the given mountpoint.
   * Best-effort — fuser may not be installed on all distros.
   */
  private async killProcessesOnMount(mountPath: string) {
    // Try fuser first (sends SIGKILL to all processes using the mount)
    try {
      await server.execute(
        new Command(["fuser", "-km", mountPath], { superuser: "try" }), true
      );
      console.log(`fuser killed processes on ${mountPath}`);
    } catch {
      // fuser not installed or no processes found — that's fine
    }
    // Also try lsof-based kill as fallback
    try {
      await server.execute(
        new Command(["bash", "-c", `lsof +D "${mountPath}" 2>/dev/null | awk 'NR>1{print $2}' | sort -u | xargs -r kill -9`], { superuser: "try" }), true
      );
    } catch {
      // best effort
    }
    // Give processes a moment to die
    await new Promise(r => setTimeout(r, 500));
  }

  private async poolExists(poolName: string): Promise<boolean> {
    // Run a command that never fails (even if there are no pools)
    const cmd = new Command(
      ["bash", "-lc", "zpool list -H -o name 2>/dev/null || true"],
      { superuser: "try" }
    );

    // Quiet execution to avoid console noise; unwrap to get ExitedProcess
    const proc = await unwrap(server.execute(cmd, true));
    const names = decode(proc.stdout)
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);

    if (names.some(n => n === poolName)) return true;

    // Tiny retry to smooth over import/export races
    await new Promise(r => setTimeout(r, 200));

    const proc2 = await unwrap(server.execute(cmd, true));
    const names2 = decode(proc2.stdout)
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);

    return names2.some(n => n === poolName);
  }

  private async logPoolUsers(poolName: string) {
    const mountPath = `/${poolName}`;

    // best-effort; ignore failures
    const cmds = [
      ["bash", "-lc", `echo '--- mount ---'; mount | grep " ${mountPath}" || true`],
      ["bash", "-lc", `echo '--- lsof ---'; which lsof && lsof +D ${mountPath} || true`],
      ["bash", "-lc", `echo '--- fuser ---'; which fuser && fuser -vm ${mountPath} || true`],
    ];

    for (const argv of cmds) {
      try {
        const proc = await unwrap(server.execute(new Command(argv, { superuser: "try" }), true));
        console.log(new TextDecoder().decode(proc.stdout));
      } catch { }
    }
  }

  private async tryDestroyPoolWithRetries(poolName: string, maxRetries = 3, delayMs = 2000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (!(await this.poolExists(poolName))) {
        console.log(`Pool ${poolName} already gone (before attempt ${attempt}).`);
        return;
      }
      try {
        await this.zfsManager.destroyPool(poolName, { force: true });
        console.log(`Pool ${poolName} destroyed on attempt ${attempt}`);
        return;
      } catch (err) {
        console.error(`Attempt ${attempt} failed to destroy pool:`, err);
        if (attempt < maxRetries) {
          // Kill any lingering processes and retry
          await this.killProcessesOnMount(`/${poolName}`);
          await new Promise((r) => setTimeout(r, delayMs));
        } else {
          await this.logPoolUsers(poolName);   // <- key addition
          console.error(`Failed to destroy pool ${poolName} after ${maxRetries} attempts.`);
          throw err;
        }
      }
    }
  }


  private async applyServerConfig(config: EasySetupConfig) {
    const serverCfg = config.serverConfig;

    if (serverCfg?.disableRootSSH === true) {
      // Replace existing line (commented or uncommented)
      await unwrap(server.execute(
        new Command([
          "sed", "-i", "s/^#*PermitRootLogin.*/PermitRootLogin no/", "/etc/ssh/sshd_config"
        ], this.commandOptions)
      ));
      // If no PermitRootLogin line existed at all, append one
      await unwrap(server.execute(
        new Command([
          "bash", "-c",
          "grep -q '^PermitRootLogin' /etc/ssh/sshd_config || echo 'PermitRootLogin no' >> /etc/ssh/sshd_config"
        ], this.commandOptions)
      ));
      await unwrap(server.execute(new Command(["systemctl", "reload", "sshd"], this.commandOptions)));
    }

    if (serverCfg?.setTimezone && serverCfg.timezone) {
      await unwrap(server.execute(new Command(["timedatectl", "set-timezone", serverCfg.timezone], this.commandOptions)));
    }

    if (serverCfg?.useNTP !== false) {
      await unwrap(server.execute(new Command(["timedatectl", "set-ntp", "true"], this.commandOptions)));
    }

    if (serverCfg?.changeRootPassword && serverCfg.newRootPass) {
      const chpasswdProc = server.spawnProcess(
        new Command(["chpasswd"], this.commandOptions)
      );
      chpasswdProc.write(`root:${serverCfg.newRootPass}\n`, false);
      await unwrap(chpasswdProc.wait(true));
    }

  }

  private async ensureGroupsExist(groups: string[]) {
    for (const g of groups) {
      const exists = await server.getGroupByName(g);
      if (exists.isErr()) await server.createGroup(g);
    }
  }

  private isNotFoundErr(e: any): boolean {
    return e?.name === "ValueError" || /User not found/i.test(String(e?.message ?? e));
  }

  private async retryGetUser(login: string, attempts = 12, delayMs = 250): Promise<LocalUser> {
    for (let i = 0; i < attempts; i++) {
      const r = await server.getUserByLogin(login, false);
      if (r.isOk()) return r.value;
      await new Promise(res => setTimeout(res, delayMs));
    }
    throw new ValueError(`User not visible after creation: ${login}`);
  }

  private async applyUsersAndGroups(config: EasySetupConfig) {
    const userGroupCfg = {
      users: config.usersAndGroups?.users ?? [],
      groups: config.usersAndGroups?.groups ?? []
    };

    if (!userGroupCfg.groups.some(g => g.name === "smbusers")) {
      userGroupCfg.groups.push({ name: "smbusers", members: [] });
    }

    // ADD SMB USER BEFORE VALIDATION
    if (config.smbUser && config.smbPass && !userGroupCfg.users.some(u => u.username === config.smbUser)) {
      userGroupCfg.users.push({
        username: config.smbUser,
        password: config.smbPass,
        groups: ["smbusers"],
      });
    }

    // Validate members exist
    const declaredUsers = new Set(userGroupCfg.users.map(u => u.username));
    for (const g of userGroupCfg.groups) {
      for (const m of g.members ?? []) {
        if (!declaredUsers.has(m)) throw new ValueError(`Group '${g.name}' references unknown user '${m}'`);
      }
    }

    const adminGroup = await this.getAdminGroupName();

    userGroupCfg.groups = userGroupCfg.groups.map(g => ({
      ...g,
      name: this.normalizeAdminGroup(g.name, adminGroup),
    }));

    // Map: user -> groups (from group objects)
    const groupsByUser = new Map<string, Set<string>>();
    for (const g of userGroupCfg.groups) {
      for (const m of g.members ?? []) {
        if (!groupsByUser.has(m)) groupsByUser.set(m, new Set());
        groupsByUser.get(m)!.add(g.name);
      }
    }

    for (const u0 of userGroupCfg.users) {
      const username = u0.username.trim();
      const u = { ...u0, username };

      // First, try to get
      const got = await server.getUserByLogin(u.username, false);
      let userObj: LocalUser;

      if (got.isOk()) {
        userObj = got.value;
      } else if (this.isNotFoundErr(got.error)) {
        // Then, try to add (but DO NOT unwrap)
        const added = await server.addUser({ login: u.username });

        if (added.isOk()) {
          userObj = added.value; // addUser returned the LocalUser directly
        } else if (this.isNotFoundErr(added.error)) {
          // addUser likely created the user but its internal getUserByLogin raced; retry fetch
          userObj = await this.retryGetUser(u.username, 20, 200);
        } else {
          throw added.error; // real failure (ProcessError etc.)
        }
      } else {
        throw got.error; // non-ValueError (e.g., transport)
      }

      if (u.password) {
        await unwrap(server.changePassword(userObj, u.password));
      }

      const normalizedUserGroups = (u.groups ?? []).map(g => this.normalizeAdminGroup(g, adminGroup));
      const finalGroupsSet = new Set<string>(["smbusers", ...normalizedUserGroups]);
      for (const g of (groupsByUser.get(u.username) ?? [])) finalGroupsSet.add(g);

      const finalGroups = [...finalGroupsSet] as [string, ...string[]];
      await this.ensureGroupsExist(finalGroups);
      await unwrap(server.addUserToGroups(userObj, ...finalGroups));

      const idOut = await unwrap(server.execute(new Command(["id", "-nG", u.username], this.commandOptions)));
      console.log(`${u.username} groups: ${new TextDecoder().decode(idOut.stdout).trim()}`);
    }

    // SSH keys 
    for (const u of userGroupCfg.users) {
      if (!u.sshKey || !/^(ssh-(rsa|ed25519)|ecdsa)-/.test(u.sshKey)) continue;
      const sshDir = `/home/${u.username}/.ssh`;
      const authFile = `${sshDir}/authorized_keys`;
      await server.execute(new Command(["mkdir", "-p", sshDir], this.commandOptions));
      await server.execute(new Command(["chmod", "700", sshDir], this.commandOptions));
      await server.execute(new Command(["touch", authFile], this.commandOptions));
      await server.execute(new Command(["bash", "-c", `printf '%s\n' '${u.sshKey.replace(/'/g, "'\\''")}' >> '${authFile}'`], this.commandOptions));
      await server.execute(new Command(["chmod", "600", authFile], this.commandOptions));
      await server.execute(new Command(["chown", "-R", `${u.username}:${u.username}`, sshDir], this.commandOptions));
    }
  }

  private async applyZFSConfig(config: EasySetupConfig) {
    const storageZfsConfig = config!.zfsConfigs![0]!;

    await this.assertNoSystemDisks(config, "pre-pool-create");

    await this.zfsManager.createPool(storageZfsConfig.pool, storageZfsConfig.poolOptions);
    await this.zfsManager.addDataset(
      storageZfsConfig.pool.name,
      storageZfsConfig.dataset.name,
      storageZfsConfig.datasetOptions
    );
    for (const extra of storageZfsConfig.additionalDatasets ?? []) {
      await this.zfsManager.addDataset(
        storageZfsConfig.pool.name,
        extra.dataset.name,
        extra.datasetOptions
      );
    }

    await this.clearAllSchedulerTasks();
  }

  private async clearAllSchedulerTasks() {
    const taskTemplates = [
      new ZFSReplicationTaskTemplate(),
      new AutomatedSnapshotTaskTemplate(),
      new ScrubTaskTemplate(),
    ];
    const scheduler = new Scheduler(taskTemplates, []);
    await scheduler.loadTaskInstances();

    if (scheduler.taskInstances.length === 0) return;

    const result = await scheduler.batchDeleteTasks(scheduler.taskInstances);

    if (result.deleted.length > 0) {
      console.log(`Cleared ${result.deleted.length} scheduler tasks: ${result.deleted.join(', ')}`);
    }
    if (result.errors.length > 0) {
      for (const err of result.errors) {
        console.error(`Failed to unregister task ${err.task}: ${err.error}`);
      }
    }
  }

  private withSmbusersSemantics(share: SambaShareConfig): SambaShareConfig {
    // If per-share valid users were configured in the wizard, preserve them;
    // otherwise default to the entire smbusers group.
    const validUsers = share.advancedOptions?.["valid users"] || "@smbusers";
    return {
      ...share,
      // typed boolean that maps to "inherit permissions = yes"
      inheritPermissions: true,
      // free-form samba options live here:
      advancedOptions: {
        ...(share.advancedOptions ?? {}),
        "valid users": validUsers,
        "inherit acls": "yes",
        "force group": "smbusers",
        "create mask": "0660",
        "directory mask": "2770",
        // optional hard guarantees:
        // "force create mode": "0660",
        // "force directory mode": "2770",
      }

      /* advancedOptions: {
        ...(share.advancedOptions ?? {}),
        // keep files/dirs in smbusers
        "force group": "smbusers",
        // typical group-writable defaults
        "create mask": "0660",
        "directory mask": "2770",
        // optional (stronger than masks): uncomment to force bits
        // "force create mode": "0664",
        // "force directory mode": "2775",
        
        // ensure Samba respects/propagates default ACLs
        "inherit acls": "yes",
        // (Optional, for NT ACLs/xattrs:)
        // "vfs objects": "acl_xattr",
        // "map acl inherit": "yes",
      }, */
    };
  }

  private async verifyPostSetup(config: EasySetupConfig) {
    const distro = await this.getLinuxDistro();
    const sambaServices = distro === "ubuntu" ? ["smbd"] : ["smb"];
    const criticalServices = [...sambaServices, "houston-broadcaster"];

    // Verify critical services are active
    for (const svc of criticalServices) {
      try {
        const result = await unwrap(
          server.execute(new Command(["systemctl", "is-active", svc], this.commandOptions), true)
        );
        const status = new TextDecoder().decode(result.stdout).trim();
        if (status !== "active") {
          console.error(`[EasySetup] Service ${svc} is not active (status: ${status}), attempting restart...`);
          await unwrap(server.execute(new Command(["systemctl", "enable", "--now", svc], this.commandOptions)));
        }
      } catch (err) {
        console.error(`[EasySetup] Service ${svc} verification failed:`, err);
        // Attempt recovery
        try {
          await unwrap(server.execute(new Command(["systemctl", "enable", "--now", svc], this.commandOptions)));
          console.log(`[EasySetup] Service ${svc} recovered after restart.`);
        } catch (restartErr) {
          console.error(`[EasySetup] Service ${svc} could not be recovered:`, restartErr);
        }
      }
    }

    // Verify ZFS pools are imported and share paths exist
    for (const zfsConfig of config.zfsConfigs ?? []) {
      const poolName = zfsConfig.pool.name;
      if (!await this.poolExists(poolName)) {
        console.error(`[EasySetup] ZFS pool '${poolName}' is not imported after setup!`);
        throw new Error(`ZFS pool '${poolName}' failed to import after creation.`);
      }
    }

    console.log("[EasySetup] Post-setup verification passed.");
  }

  private async restartSambaServices() {
    const distro = await this.getLinuxDistro();
    const services = distro === "ubuntu" ? ["smbd", "nmbd"] : ["smb", "nmb"];

    for (const svc of services) {
      try {
        await unwrap(server.execute(new Command(["systemctl", "enable", "--now", svc], this.commandOptions)));
        await unwrap(server.execute(new Command(["systemctl", "restart", svc], this.commandOptions)));
      } catch (err) {
        const msg = String((err as any)?.message ?? err);
        if (/nmbd?\.service.*not found/i.test(msg) || /Unit nmb.*could not be found/i.test(msg)) {
          console.warn(` ${svc} missing; continuing without it.`);
        } else {
          throw err;
        }
      }
    }
  }

  /**
   * Strip the distro's stock auto-shares from /etc/samba/smb.conf. `[homes]`
   * surfaces as a share named after the logged-in user, which users mistake for
   * the share the wizard created.
   */
  private async removeStockSambaSections() {
    const script = [
      `conf=/etc/samba/smb.conf`,
      `[ -f "$conf" ] || exit 0`,
      `awk '`,
      `  /^[[:space:]]*\\[/ {`,
      `    s = $0`,
      `    gsub(/[[:space:]]/, "", s)`,
      `    drop = (s == "[homes]" || s == "[printers]" || s == "[print$]")`,
      `  }`,
      `  !drop`,
      `' "$conf" > "$conf.45d.tmp" && mv "$conf.45d.tmp" "$conf"`,
    ].join("\n");

    await server.execute(new Command(["bash", "-c", script], this.commandOptions), true);
  }

  private async applySambaConfig(config: EasySetupConfig) {
    if (!config.smbUser) throw new ValueError("config.smbUser is undefined!");
    if (!config.smbPass) throw new ValueError("config.smbPass is undefined!");
    if (!config.sambaConfig) throw new ValueError("config.sambaConfig is undefined!");
    if (!config.folderName) {
      config.folderName = config.sambaConfig?.shares?.[0]?.name ?? "backup"; // fallback
    }
    await unwrap(this.sambaManager.setUserPassword(config.smbUser, config.smbPass));
    await unwrap(this.sambaManager.editGlobal(config.sambaConfig.global));

    // Ensure config includes 'include registry'
    await unwrap(
      this.sambaManager
        .checkIfSambaConfIncludesRegistry("/etc/samba/smb.conf")
        .andThen((includesRegistry) =>
          includesRegistry
            ? okAsync({})
            : this.sambaManager.patchSambaConfIncludeRegistry("/etc/samba/smb.conf")
        )
    );

    await this.removeStockSambaSections();

    // Apply shares
    const shares = config.sambaConfig.shares ?? [];
    for (let i = 0; i < shares.length; i++) {
      const raw = shares[i];
      if (!raw) continue; // narrow: from (SambaShareConfig | undefined) to SambaShareConfig

      const primaryPath = `/${config.zfsConfigs![0]!.pool.name}/${config.folderName!}`;

      // Build a concrete share object: primary share uses folderName/pool path;
      // additional shares must have their own path pre-set or get a derived default.
      let share: SambaShareConfig = {
        ...raw,
        ...(i === 0 && config.folderName
          ? { name: config.folderName, path: primaryPath, readOnly: false }
          : {
              name: raw.name || `share${i}`,
              path: raw.path || `/${config.zfsConfigs![0]!.pool.name}/${raw.name || `share${i}`}`,
            }),
      };

      // enforce group semantics via advancedOptions
      share = this.withSmbusersSemantics(share);

      await unwrap(this.sambaManager.addShare(share));

      // filesystem ownership: group-owned by smbusers (not a specific user)
      await this.setGroupOwnedTree(share.path, "smbusers");
    }

    await this.restartSambaServices();
  }


  static async loadConfig(
    easyConfigName: keyof typeof defaultConfigs
  ): Promise<EasySetupConfig | null> {
    // console.log("loading config for:", easyConfigName);
    // console.log("list of defaultconfigs:", defaultConfigs);
    const dc = defaultConfigs[easyConfigName];
    return SambaConfParser()
      .apply(dc.smbconf)
      .map((sambaConfig): EasySetupConfig => {
        return {
          sambaConfig,
          zfsConfigs: dc.zfsconf as ZFSConfig[],
        };
      })
      .unwrapOr(null);
  }

}