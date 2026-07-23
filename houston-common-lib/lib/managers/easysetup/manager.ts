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

export interface EasySetupProgress {
  message: string;
  step: number;
  total: number;
}

export class EasySetupConfigurator {
  sambaManager: SambaManagerNet;
  zfsManager: ZFSManager;
  commandOptions: CommandOptions;

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
    const total = 10;

    const report = (step: number, message: string) =>
      progressCallback({ step, total, message });


    // Start logging to /tmp immediately (works even if admin is denied)
    const run = startEasySetupRunLogging();

    try {
      report(1, "Initializing Storage Setup...");

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

      report(2, "Configuring SSH Security and Root Access...");
      await this.applyServerConfig(config);

      report(3, "Clearing any existing ZFS and Samba data...");
      if (config.skipClearExisting) {
        console.log("[EasySetup] Skipping pool/share destruction (skipClearExisting=true)");
      } else {
        await this.deleteZFSPoolAndSMBShares(config);
      }
      
      report(4, "Updating Server Name (if changed)...");
      await this.updateHostname(config);

      report(5, "Creating Users and Groups...");
      await this.applyUsersAndGroups(config);

      report(6, "Configuring ZFS Storage with available drives...");
      await this.applyZFSConfig(config);

      report(7, "Configuring Storage Sharing...");
      await this.applySambaConfig(config);

      report(8, "Opening Samba Port...");
      await this.applyOpenSambaPorts();

      report(9, "Ensuring Required Node Version (18)...");
      const version = await this.getNodeVersion();
      if (!version?.startsWith("18.")) await this.ensureNode18();

      report(10, config.splitPools ? "Scheduling Active Backup tasks..." : "Scheduling Snapshot tasks...");
      await this.scheduleTasks(config);

      // Post-setup verification: confirm critical services are active and pools are imported
      await this.verifyPostSetup(config);

      console.log("[EasySetup] About to write simple-setup-log.json");

      const currentHostname = await this.getCurrentHostname();
      const serverName = this.resolveServerName(config, currentHostname);

      const ok = await storeEasySetupConfig(config, serverName);
      console.log(`[EasySetup] simple-setup-log.json write ${ok ? "OK" : "FAILED"}`);

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

  // Check current Node.js version
  private async getNodeVersion(): Promise<string | null> {
    try {
      const result = await unwrap(
        server.execute(new Command(["node", "-v"], { superuser: "try" }))
      );
      const output = new TextDecoder().decode(result.stdout);
      return output.replace(/^v/, "");
    } catch {
      return null;
    }
  }

  // Ensure NVM is installed
  private async ensureNvmInstalled(): Promise<void> {
    const check = `export NVM_DIR="$HOME/.nvm"; test -s "$NVM_DIR/nvm.sh"`;
    const has: any = await server.execute(new Command(["bash", "-lc", check], this.commandOptions), true);

    if (has.exited === 0) return;

    const installGit = `
if ! command -v git >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    if [ "$(id -u)" -ne 0 ]; then sudo apt-get update && sudo apt-get install -y git; else apt-get update && apt-get install -y git; fi
  elif command -v dnf >/dev/null 2>&1; then
    if [ "$(id -u)" -ne 0 ]; then sudo dnf install -y git; else dnf install -y git; fi
  elif command -v yum >/dev/null 2>&1; then
    if [ "$(id -u)" -ne 0 ]; then sudo yum install -y git; else yum install -y git; fi
  else
    echo "git is required to install nvm" >&2
    exit 1
  fi
fi
`;

    await unwrap(
      server.execute(
        new Command(["bash", "-lc", installGit], this.commandOptions)
      )
    );

    await unwrap(
      server.execute(
        new Command(["bash", "-lc", "rm -rf \"$HOME/.nvm\" && git clone --depth 1 --branch v0.39.7 https://github.com/nvm-sh/nvm.git \"$HOME/.nvm\""], this.commandOptions)
      )
    );
  }

  // Load NVM into the current shell
  private loadNvm() {
    return 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"';
  }

  // Ensure Node.js v18 is installed and set as default
  private async ensureNode18() {
    await this.ensureNvmInstalled();

    const shellLoadNvm = this.loadNvm();

    // Install Node 18 if not present
    try {
      await unwrap(
        server.execute(new Command(["bash", "-c", `${shellLoadNvm} && nvm ls 18`], this.commandOptions))
      );
      console.log(" Node 18 is already installed.");
    } catch {
      console.log(" Installing Node.js v18...");
      await unwrap(
        server.execute(new Command(["bash", "-c", `${shellLoadNvm} && nvm install 18`], this.commandOptions))
      );
    }

    // Set Node 18 as default
    await unwrap(
      server.execute(new Command(["bash", "-c", `${shellLoadNvm} && nvm alias default 18`], this.commandOptions))
    );
    console.log(" Node.js v18 set as default.");
  }

  private async scheduleTasks(config: EasySetupConfig) {
    const storageZfsConfig = config.zfsConfigs![0]!;
    const backupZfsConfig = config.zfsConfigs![1]!;

    const taskTemplates = [
      new ZFSReplicationTaskTemplate(),
      new AutomatedSnapshotTaskTemplate(),
      new ScrubTaskTemplate(),
    ];

    const myScheduler = new Scheduler(taskTemplates, []);

    const taskConfig = generateAllDefaultConfigs({
      splitPools: !!config.splitPools,
      storagePool: {
        poolName: storageZfsConfig.pool.name,
        datasetName: storageZfsConfig.dataset.name,
      },
      backupPool: config.splitPools ? {
        poolName: backupZfsConfig.pool.name,
        datasetName: backupZfsConfig.dataset.name,
      } : undefined,
    });

    const result = await myScheduler.importTasksFromConfig(JSON.stringify(taskConfig));

    if (result.errors.length > 0) {
      console.error('Task import errors:', result.errors);
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
    await this.stopSambaIfRunning();

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

    // Pools from config (e.g., tank, tank-backup)
    const storageZfsConfig = config.zfsConfigs[0]!;
    const backupZfsConfig = config.zfsConfigs[1];
    const storagePoolName = storageZfsConfig.pool.name;
    const backupPoolName = backupZfsConfig?.pool?.name;

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
    if (backupPoolName && allPools.includes(backupPoolName)) {
      console.log(`Verified destruction of backup pool '${backupPoolName}'.`);
    }
  }


  private async stopSambaIfRunning() {
    const distro = await this.getLinuxDistro();
    const services = (distro === "ubuntu") ? ["smbd", "nmbd"] : ["smb", "nmb"];

    for (const svc of services) {
      // ignore if not present
      await server.execute(new Command(["systemctl", "stop", svc], { superuser: "try" }), true);
    }
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

  private async tryDestroyPoolWithRetries(poolName: string, maxRetries = 3, delayMs = 1000) {
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

    if (serverCfg?.disableRootSSH !== false) {
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

    if (serverCfg?.newRootPass) {
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
    let storageZfsConfig = config!.zfsConfigs![0];
    let backupZfsConfig = config!.zfsConfigs![1];

    await this.zfsManager.createPool(storageZfsConfig!.pool, storageZfsConfig!.poolOptions);
    await this.zfsManager.addDataset(
      storageZfsConfig!.pool.name,
      storageZfsConfig!.dataset.name,
      storageZfsConfig!.datasetOptions
    );
    // Create additional datasets on the storage pool
    if (storageZfsConfig!.additionalDatasets) {
      for (const extra of storageZfsConfig!.additionalDatasets) {
        await this.zfsManager.addDataset(
          storageZfsConfig!.pool.name,
          extra.dataset.name,
          extra.datasetOptions
        );
      }
    }

    if (config.splitPools) {
      await this.zfsManager.createPool(backupZfsConfig!.pool, backupZfsConfig!.poolOptions);
      await this.zfsManager.addDataset(
        backupZfsConfig!.pool.name,
        backupZfsConfig!.dataset.name,
        backupZfsConfig!.datasetOptions
      );
      // Create additional datasets on the backup pool
      if (backupZfsConfig!.additionalDatasets) {
        for (const extra of backupZfsConfig!.additionalDatasets) {
          await this.zfsManager.addDataset(
            backupZfsConfig!.pool.name,
            extra.dataset.name,
            extra.datasetOptions
          );
        }
      }
      await this.clearAllSchedulerTasks();
    } else {
      await this.clearAllSchedulerTasks();
    }

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

    // Verify samba services are active
    for (const svc of sambaServices) {
      try {
        const result = await unwrap(
          server.execute(new Command(["systemctl", "is-active", svc], this.commandOptions), true)
        );
        const status = new TextDecoder().decode(result.stdout).trim();
        if (status !== "active") {
          console.error(`[EasySetup] Service ${svc} is not active (status: ${status}), attempting restart...`);
          await unwrap(server.execute(new Command(["systemctl", "restart", svc], this.commandOptions)));
        }
      } catch (err) {
        console.error(`[EasySetup] Service ${svc} verification failed:`, err);
        // Attempt recovery
        try {
          await unwrap(server.execute(new Command(["systemctl", "restart", svc], this.commandOptions)));
          console.log(`[EasySetup] Service ${svc} recovered after restart.`);
        } catch (restartErr) {
          console.error(`[EasySetup] Service ${svc} could not be recovered:`, restartErr);
        }
      }
    }

    // Verify ZFS pools are imported and share paths exist
    const zfsConfigs = config.zfsConfigs ?? [];
    for (let i = 0; i < zfsConfigs.length; i++) {
      // Skip the backup pool (index 1) when splitPools is not enabled
      if (i === 1 && !config.splitPools) continue;
      const poolName = zfsConfigs[i]!.pool.name;
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