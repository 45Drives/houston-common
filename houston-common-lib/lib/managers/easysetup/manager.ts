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
  TaskInstance,
  ParameterNode,
  ZfsDatasetParameter,
  BoolParameter,
  IntParameter,
  StringParameter,
  SnapshotRetentionParameter,
  TaskScheduleInterval,
  SambaShareConfig,
  LocalUser
} from "@/index";
import { storeEasySetupConfig } from './logConfig';
import { ZFSManager } from "@/index";
import * as defaultConfigs from "@/defaultconfigs";
import { okAsync } from "neverthrow";
import { AutomatedSnapshotTaskTemplate, ScrubTaskTemplate, TaskSchedule } from "@/scheduler";

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
      console.log("[EasySetup] elevated uid:", uid);

      if (uid !== "0") {
        throw new Error(`Expected uid 0, got ${uid}`);
      }
    } catch (err) {
      console.error("[EasySetup] failed to obtain admin session:", err);
      throw new Error("Administrative access denied or unavailable");
    }
  }

  async applyConfig(
    config: EasySetupConfig,
    progressCallback: (progress: EasySetupProgress) => void
  ) {

    try {
      const total = 10;
      progressCallback({ message: "Initializing Storage Setup... please wait", step: 1, total });

      try {
        await this.ensureAdminSession();
      } catch (err) {
        progressCallback({
          message: "This setup requires administrative privileges. Please reconnect with a root or sudo-capable account.",
          step: -1,
          total: -1,
        });
        return;
      }

      await this.applyServerConfig(config);
      progressCallback({ message: "Configured SSH Security and Root Access", step: 2, total });

      await this.deleteZFSPoolAndSMBShares(config);
      progressCallback({ message: "Cleared any existing ZFS and Samba data", step: 3, total });

      await this.updateHostname(config);
      progressCallback({ message: "Updated Server Name", step: 4, total });

      await this.applyUsersAndGroups(config);
      progressCallback({ message: "Created Users and Groups", step: 5, total });

      await this.applyZFSConfig(config);
      progressCallback({ message: "Configured ZFS Storage with available drives", step: 6, total });

      await this.applySambaConfig(config);
      progressCallback({ message: "Configured Storage Sharing", step: 7, total });

      await this.applyOpenSambaPorts();
      progressCallback({ message: "Opening Samba Port", step: 8, total });

      const version = await this.getNodeVersion();
      if (version?.startsWith("18.")) {
        console.log(` Node.js v${version} is already in use.`);
      } else {
        console.log(` Current Node.js version: ${version ?? "Not installed"}`);
        await this.ensureNode18();
      }
      progressCallback({ message: `Ensure Required Node Version (18)`, step: 9, total });

      if (config.splitPools) {
        progressCallback({ message: "Scheduled Active Backup tasks", step: 10, total });
      } else {
        progressCallback({ message: "Scheduled Snapshot tasks", step: 10, total });
      }

      await storeEasySetupConfig(config);

    } catch (error: any) {
      console.error("Error in setupStorage:", error);
      progressCallback({ message: `Error: ${error.message}`, step: -1, total: -1 });
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
    console.log(`Detected distro: ${distro}`);

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
        console.warn(" Failed to configure firewalld; continuing:", err);
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
        console.warn(" Failed to configure ufw; continuing:", err);
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
    try {
      await unwrap(server.execute(new Command(["bash", "-c", "command -v nvm"], this.commandOptions)));
    } catch {
      console.log(" Installing NVM...");
      await unwrap(
        server.execute(
          new Command(["bash", "-c", "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"], this.commandOptions)
        )
      );
      console.log(" NVM installed. Reloading shell...");
    }
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

  private async updateHostname(config: EasySetupConfig) {
    if (!config.srvrName) {
      // still refresh mDNS if no change; ignore failure quietly
      await server.execute(new Command(["systemctl", "restart", "avahi-daemon"], this.commandOptions), true);
      return;
    }

    const name = config.srvrName;
    const distro = await this.getLinuxDistro();

    // 1) Persist first (your helper writes /etc/hostname and /etc/machine-info)
    await unwrap(server.writeHostnameFiles(name));

    // 2) Best-effort runtime hostname without noisy DBus on Rocky
    if (distro === "ubuntu") {
      // setHostname swallows errors already; no unwrap so it won’t log failures
      await server.setHostname(name);
    } else {
      // on Rocky, avoid hostnamectl (polkit noise); set kernel hostname directly, quietly
      await server.execute(new Command(["hostname", name], this.commandOptions), true);
    }

    // 3) Bounce daemons that read hostname (quietly in case a unit is missing)
    await server.execute(new Command(["systemctl", "restart", "systemd-hostnamed"], this.commandOptions), true);
    await server.execute(new Command(["systemctl", "restart", "avahi-daemon"], this.commandOptions), true);
    await server.execute(new Command(["systemctl", "restart", "houston-broadcaster-legacy.service"], this.commandOptions), true);
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
    const backupZfsConfig = config.zfsConfigs[1]!;
    const storagePoolName = storageZfsConfig.pool.name;
    const backupPoolName = backupZfsConfig.pool.name;

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
    if (allPools.includes(backupPoolName)) {
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
      await unwrap(server.execute(
        new Command([
          "sed", "-i", "s/^#*PermitRootLogin.*/PermitRootLogin no/", "/etc/ssh/sshd_config"
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
      await unwrap(
        server.execute(
          new Command(
            ["bash", "-c", `echo 'root:${serverCfg.newRootPass}' | chpasswd`],
            this.commandOptions
          ),
          true
        )
      );
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
      await server.execute(new Command(["bash", "-c", `echo "${u.sshKey}" >> ${authFile}`], this.commandOptions));
      await server.execute(new Command(["chmod", "600", authFile], this.commandOptions));
      await server.execute(new Command(["chown", "-R", `${u.username}:${u.username}`, sshDir], this.commandOptions));
    }
  }

  private async applyZFSConfig(_config: EasySetupConfig) {
    let storageZfsConfig = _config!.zfsConfigs![0];
    let backupZfsConfig = _config!.zfsConfigs![1];

    const taskTemplates = [new ZFSReplicationTaskTemplate()]
    const taskInstances: TaskInstance[] = [];

    const myScheduler = new Scheduler(taskTemplates, taskInstances);

    await this.zfsManager.createPool(storageZfsConfig!.pool, storageZfsConfig!.poolOptions);
    await this.zfsManager.addDataset(
      storageZfsConfig!.pool.name,
      storageZfsConfig!.dataset.name,
      storageZfsConfig!.datasetOptions
    );

    if (_config.splitPools) {
      await this.zfsManager.createPool(backupZfsConfig!.pool, backupZfsConfig!.poolOptions);
      await this.zfsManager.addDataset(
        backupZfsConfig!.pool.name,
        backupZfsConfig!.dataset.name,
        backupZfsConfig!.datasetOptions
      );
      await this.clearReplicationTasks();
      await this.clearScrubTasks();
      const repTasks = await this.createReplicationTasks(storageZfsConfig!, backupZfsConfig!);
      repTasks.forEach(task => {
        console.log('new Task created:', task);
        taskInstances.push(task);
        myScheduler.registerTaskInstance(task);
      });
      const scrubTasks = await this.createScrubTasks(storageZfsConfig!, backupZfsConfig!)
      scrubTasks.forEach(task => {
        console.log('new Task created:', task);
        taskInstances.push(task);
        myScheduler.registerTaskInstance(task);
      });
    } else {
      await this.clearSnapshotTasks();
      await this.clearScrubTasks();
      const snapTasks = await this.createAutoSnapshotTasks(storageZfsConfig!);
      snapTasks.forEach(task => {
        console.log('new Task created:', task);
        taskInstances.push(task);
        myScheduler.registerTaskInstance(task);
      });
      const scrubTasks = await this.createScrubTasks(storageZfsConfig!)
      scrubTasks.forEach(task => {
        console.log('new Task created:', task);
        taskInstances.push(task);
        myScheduler.registerTaskInstance(task);
      });
    }

  }

  private async clearReplicationTasks() {
    const scheduler = new Scheduler([new ZFSReplicationTaskTemplate()], []);
    await scheduler.loadTaskInstances();

    const replicationTasks = scheduler.taskInstances.filter(
      task => task.template instanceof ZFSReplicationTaskTemplate
    );

    for (const task of replicationTasks) {
      try {
        await scheduler.unregisterTaskInstance(task);
        console.log(` Unregistered replication task: ${task.name}`);
      } catch (error) {
        console.error(` Failed to unregister task ${task.name}:`, error);
      }
    }
  }

  private async clearSnapshotTasks() {
    const scheduler = new Scheduler([new AutomatedSnapshotTaskTemplate()], []);
    await scheduler.loadTaskInstances();

    const replicationTasks = scheduler.taskInstances.filter(
      task => task.template instanceof AutomatedSnapshotTaskTemplate
    );

    for (const task of replicationTasks) {
      try {
        await scheduler.unregisterTaskInstance(task);
        console.log(` Unregistered replication task: ${task.name}`);
      } catch (error) {
        console.error(` Failed to unregister task ${task.name}:`, error);
      }
    }
  }


  private async clearScrubTasks() {
    const scheduler = new Scheduler([new ScrubTaskTemplate()], []);
    await scheduler.loadTaskInstances();

    const scrubTasks = scheduler.taskInstances.filter(
      task => task.template instanceof ScrubTaskTemplate
    );

    for (const task of scrubTasks) {
      try {
        await scheduler.unregisterTaskInstance(task);
        console.log(` Unregistered scrub task: ${task.name}`);
      } catch (error) {
        console.error(` Failed to unregister task ${task.name}:`, error);
      }
    }
  }

  private async createReplicationTasks(sourceData: ZFSConfig, destData: ZFSConfig): Promise<TaskInstance[]> {
    const tasks: TaskInstance[] = []

    // Create HourlyForADay Task
    const hourlyParams = new ParameterNode("ZFS Replication Task Config", "zfsRepConfig")
      .addChild(new ZfsDatasetParameter('Source Dataset', 'sourceDataset', '', 0, '', sourceData.pool.name, `${sourceData.pool.name}/${sourceData.dataset.name}`))
      .addChild(new ZfsDatasetParameter('Destination Dataset', 'destDataset', '', 0, '', destData.pool.name, `${destData.pool.name}/${destData.dataset.name}`))
      .addChild(new ParameterNode('Send Options', 'sendOptions')
        .addChild(new BoolParameter('Compressed', 'compressed_flag', false))
        .addChild(new BoolParameter('Raw', 'raw_flag', false))
        .addChild(new BoolParameter('Recursive', 'recursive_flag', false))
        .addChild(new IntParameter('MBuffer Size', 'mbufferSize', 1))
        .addChild(new StringParameter('MBuffer Unit', 'mbufferUnit', 'G'))
        .addChild(new BoolParameter('Custom Name Flag', 'customName_flag', false))
        .addChild(new StringParameter('Custom Name', 'customName', ''))
        .addChild(new StringParameter('Transfer Method', 'transferMethod', 'local'))
      )
      .addChild(new ParameterNode('Snapshot Retention', 'snapshotRetention')
        .addChild(new SnapshotRetentionParameter('Source', 'source', 1, 'days'))  // Hourly task keeps snapshots for 1 day
        .addChild(new SnapshotRetentionParameter('Destination', 'destination', 1, 'days'))  // Hourly task keeps snapshots for 1 day
      );

    const hourlyTask = new TaskInstance(
      'ActiveBackup_HourlyForADay',
      new ZFSReplicationTaskTemplate(),
      hourlyParams,
      new TaskSchedule(true, [
        new TaskScheduleInterval({
          minute: { value: '0' }, // At 0 minutes
          hour: { value: '*' }, // Every hour
          day: { value: '*' }, // Every day
          month: { value: '*' }, // Every month
          year: { value: '*' }, // Every year
        }) // Every hour
      ]),
      'Take snapshots hourly and save for a day.'
    );

    // Create DailyForAWeek Task
    const dailyParams = new ParameterNode("ZFS Replication Task Config", "zfsRepConfig")
      .addChild(new ZfsDatasetParameter('Source Dataset', 'sourceDataset', '', 0, '', sourceData.pool.name, `${sourceData.pool.name}/${sourceData.dataset.name}`))
      .addChild(new ZfsDatasetParameter('Destination Dataset', 'destDataset', '', 0, '', destData.pool.name, `${destData.pool.name}/${destData.dataset.name}`))
      .addChild(new ParameterNode('Send Options', 'sendOptions')
        .addChild(new BoolParameter('Compressed', 'compressed_flag', false))
        .addChild(new BoolParameter('Raw', 'raw_flag', false))
        .addChild(new BoolParameter('Recursive', 'recursive_flag', false))
        .addChild(new IntParameter('MBuffer Size', 'mbufferSize', 1))
        .addChild(new StringParameter('MBuffer Unit', 'mbufferUnit', 'G'))
        .addChild(new BoolParameter('Custom Name Flag', 'customName_flag', false))
        .addChild(new StringParameter('Custom Name', 'customName', ''))
        .addChild(new StringParameter('Transfer Method', 'transferMethod', 'local'))
      )
      .addChild(new ParameterNode('Snapshot Retention', 'snapshotRetention')
        .addChild(new SnapshotRetentionParameter('Source', 'source', 1, 'weeks'))  // Daily task keeps snapshots for 1 week
        .addChild(new SnapshotRetentionParameter('Destination', 'destination', 1, 'weeks'))  // Daily task keeps snapshots for 1 week
      );

    const dailyTask = new TaskInstance(
      'ActiveBackup_DailyForAWeek',
      new ZFSReplicationTaskTemplate(),
      dailyParams,
      new TaskSchedule(true, [
        new TaskScheduleInterval({
          minute: { value: '0' }, // At 0 minutes
          hour: { value: '0' }, // At midnight
          day: { value: '*' }, // Every day
          month: { value: '*' }, // Every month
          year: { value: '*' }, // Every year
        }) // Daily at midnight
      ]),
      'Take snapshots daily and save for a week.'
    );

    // Create WeeklyForAMonth Task
    const weeklyParams = new ParameterNode("ZFS Replication Task Config", "zfsRepConfig")
      .addChild(new ZfsDatasetParameter('Source Dataset', 'sourceDataset', '', 0, '', sourceData.pool.name, `${sourceData.pool.name}/${sourceData.dataset.name}`))
      .addChild(new ZfsDatasetParameter('Destination Dataset', 'destDataset', '', 0, '', destData.pool.name, `${destData.pool.name}/${destData.dataset.name}`))
      .addChild(new ParameterNode('Send Options', 'sendOptions')
        .addChild(new BoolParameter('Compressed', 'compressed_flag', false))
        .addChild(new BoolParameter('Raw', 'raw_flag', false))
        .addChild(new BoolParameter('Recursive', 'recursive_flag', false))
        .addChild(new IntParameter('MBuffer Size', 'mbufferSize', 1))
        .addChild(new StringParameter('MBuffer Unit', 'mbufferUnit', 'G'))
        .addChild(new BoolParameter('Custom Name Flag', 'customName_flag', false))
        .addChild(new StringParameter('Custom Name', 'customName', ''))
        .addChild(new StringParameter('Transfer Method', 'transferMethod', 'local'))
      )
      .addChild(new ParameterNode('Snapshot Retention', 'snapshotRetention')
        .addChild(new SnapshotRetentionParameter('Source', 'source', 1, 'months'))  // Weekly task keeps snapshots for 1 month
        .addChild(new SnapshotRetentionParameter('Destination', 'destination', 1, 'months'))  // Weekly task keeps snapshots for 1 month
      );

    const weeklyTask = new TaskInstance(
      'ActiveBackup_WeeklyForAMonth',
      new ZFSReplicationTaskTemplate(),
      weeklyParams,
      new TaskSchedule(true, [
        new TaskScheduleInterval({
          minute: { value: '0' }, // At 0 minutes
          hour: { value: '0' }, // At midnight
          day: { value: '*' }, // Every day
          month: { value: '*' }, // Every month
          year: { value: '*' }, // Every year
          dayOfWeek: ['Fri'] // on Friday
        }) // Weekly on Friday at midnight
      ]),
      'Take snapshots weekly and save for a month.'
    );

    // Push all tasks to the array
    tasks.push(hourlyTask, dailyTask, weeklyTask);
    console.log('tasks:', tasks);
    return tasks;
  }

  private async createAutoSnapshotTasks(zfsData: ZFSConfig): Promise<TaskInstance[]> {
    //  .addChild(new ZfsDatasetParameter('Source Dataset', 'sourceDataset', '', 0, '', sourceData.pool.name, `${sourceData.pool.name}/${sourceData.dataset.name}`))
    const tasks: TaskInstance[] = [];

    const baseParams = (
      retentionValue: number,
      retentionUnit: 'days' | 'weeks' | 'months',
      taskName: string,
      schedule: TaskSchedule,
      notes: string
    ): TaskInstance => {
      const autoSnapParams = new ParameterNode("Automated Snapshot Task Config", "autoSnapConfig")
        .addChild(new ZfsDatasetParameter('Filesystem', 'filesystem', '', 0, '', zfsData.pool.name, `${zfsData.pool.name}/${zfsData.dataset.name}`))
        .addChild(new BoolParameter('Recursive', 'recursive_flag', false))
        .addChild(new BoolParameter('Custom Name Flag', 'customName_flag', false))
        .addChild(new StringParameter('Custom Name', 'customName', ''))
        .addChild(new SnapshotRetentionParameter('Snapshot Retention', 'snapshotRetention', retentionValue, retentionUnit));

      return new TaskInstance(
        taskName,
        new AutomatedSnapshotTaskTemplate(),
        autoSnapParams,
        schedule,
        notes
      );
    };

    // Hourly snapshots retained for 1 day
    const hourlySchedule = new TaskSchedule(true, [
      new TaskScheduleInterval({
        minute: { value: '0' },
        hour: { value: '*' },
        day: { value: '*' },
        month: { value: '*' },
        year: { value: '*' },
      }),
    ]);
    const hourlyTask = baseParams(
      1,
      'days',
      'AutoSnapshot_HourlyForADay',
      hourlySchedule,
      'Take snapshots every hour and keep them for 1 day.'
    );

    // Daily snapshots retained for 1 week
    const dailySchedule = new TaskSchedule(true, [
      new TaskScheduleInterval({
        minute: { value: '0' },
        hour: { value: '0' },
        day: { value: '*' },
        month: { value: '*' },
        year: { value: '*' },
      }),
    ]);
    const dailyTask = baseParams(
      1,
      'weeks',
      'AutoSnapshot_DailyForAWeek',
      dailySchedule,
      'Take snapshots daily and keep them for 1 week.'
    );

    // Weekly snapshots retained for 1 month (on Fridays at midnight)
    const weeklySchedule = new TaskSchedule(true, [
      new TaskScheduleInterval({
        minute: { value: '0' },
        hour: { value: '0' },
        day: { value: '*' },
        month: { value: '*' },
        year: { value: '*' },
        dayOfWeek: ['Fri'],
      }),
    ]);
    const weeklyTask = baseParams(
      1,
      'months',
      'AutoSnapshot_WeeklyForAMonth',
      weeklySchedule,
      'Take snapshots every Friday and keep them for 1 month.'
    );

    tasks.push(hourlyTask, dailyTask, weeklyTask);
    console.log('autoSnapshotTasks:', tasks);
    return tasks;
  }

  private async createScrubTasks(zfsData: ZFSConfig, backupZfsData?: ZFSConfig) {
    const tasks: TaskInstance[] = [];

    const baseParams = (
      taskName: string,
      schedule: TaskSchedule,
      notes: string
    ): TaskInstance => {
      const scrubParams = new ParameterNode('Scrub Task Config', 'scrubConfig')
        .addChild(new ZfsDatasetParameter('Pool', 'pool', '', 0, '', zfsData.pool.name, `${zfsData.pool.name}`))

      return new TaskInstance(
        taskName,
        new ScrubTaskTemplate(),
        scrubParams,
        schedule,
        notes
      );
    };

    //  Weekly snapshots retained for 1 month (on Fridays at midnight)
    const weeklySchedule = new TaskSchedule(true, [
      new TaskScheduleInterval({
        minute: { value: '0' },
        hour: { value: '0' },
        day: { value: '*' },
        month: { value: '*' },
        year: { value: '*' },
        dayOfWeek: ['Fri'],
      }),
    ]);
    const weeklyScrub = baseParams(
      'WeeklyScrub',
      weeklySchedule,
      'Scrub storage pool weekly to ensure data integrity.'
    );

    tasks.push(weeklyScrub);

    if (backupZfsData) {
      const baseParams = (
        taskName: string,
        schedule: TaskSchedule,
        notes: string
      ): TaskInstance => {
        const scrubParams = new ParameterNode('Scrub Task Config', 'scrubConfig')
          .addChild(new ZfsDatasetParameter('Pool', 'pool', '', 0, '', backupZfsData.pool.name, `${backupZfsData.pool.name}`))

        return new TaskInstance(
          taskName,
          new ScrubTaskTemplate(),
          scrubParams,
          schedule,
          notes
        );
      };

      const weeklyBackupScrub = baseParams(
        'WeeklyScrub-Backup',
        weeklySchedule,
        'Scrub backup pool weekly to ensure data integrity.'
      );

      tasks.push(weeklyBackupScrub);
    }

    console.log('scrubtasks:', tasks);
    return tasks;
  }

  private withSmbusersSemantics(share: SambaShareConfig): SambaShareConfig {
    return {
      ...share,
      // typed boolean that maps to "inherit permissions = yes"
      inheritPermissions: true,
      // free-form samba options live here:
      advancedOptions: {
        ...(share.advancedOptions ?? {}),
        "valid users": "@smbusers",
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
        // optional (stronger than masks): uncomment if you want to force bits
        // "force create mode": "0664",
        // "force directory mode": "2775",
        
        // ensure Samba respects/propagates default ACLs
        "inherit acls": "yes",
        // (Optional, if you rely on NT ACLs/xattrs:)
        // "vfs objects": "acl_xattr",
        // "map acl inherit": "yes",
      }, */
    };
  }

  private async restartSambaServices() {
    const distro = await this.getLinuxDistro();
    const services = distro === "ubuntu" ? ["smbd", "nmbd"] : ["smb", "nmb"];

    for (const svc of services) {
      try {
        await unwrap(server.execute(new Command(["systemctl", "start", svc], this.commandOptions)));
        await unwrap(server.execute(new Command(["systemctl", "restart", svc], this.commandOptions)));
        await unwrap(server.execute(new Command(["systemctl", "enable", svc], this.commandOptions)));
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

      const sharePath = `/${config.zfsConfigs![0]!.pool.name}/${config.folderName!}`;

      // Build a concrete share object first (no undefined), then apply semantics
      let share: SambaShareConfig = {
        ...raw,
        ...(config.folderName && i === 0
          ? { name: config.folderName, path: sharePath, readOnly: false }
          : {}),
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
    console.log("loading config for:", easyConfigName);
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
