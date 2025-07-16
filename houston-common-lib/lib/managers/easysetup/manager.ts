import { EasySetupConfig } from "./types";
import {
  Command,
  SambaConfParser,
  SambaManagerNet,
  server,
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
  TaskScheduleInterval
} from "@/index";
import { storeEasySetupConfig } from './logConfig';
import { ZFSManager } from "@/index";
import * as defaultConfigs from "@/defaultconfigs";
import { okAsync } from "neverthrow";
import { AutomatedSnapshotTaskTemplate, ScrubTaskTemplate, TaskSchedule } from "@/scheduler";


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
    this.commandOptions = { superuser: "try" };
  }

  async applyConfig(
    config: EasySetupConfig,
    progressCallback: (progress: EasySetupProgress) => void
  ) {

    try {
      const total = 8;
      progressCallback({ message: "Initializing Storage Setup... please wait", step: 1, total });

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

      if (config.splitPools) {
        progressCallback({ message: "Scheduled Active Backup tasks", step: 8, total });
      } else {
        progressCallback({ message: "Scheduled Snapshot tasks", step: 8, total });
      }
      
      await storeEasySetupConfig(config);

    } catch (error: any) {
      console.error("Error in setupStorage:", error);
      progressCallback({ message: `Error: ${error.message}`, step: -1, total: -1 });
    }

  }

  private async updateHostname(config: EasySetupConfig) {
    if (config.srvrName) {
      await unwrap(server.setHostname(config.srvrName));
      await unwrap(server.writeHostnameFiles(config.srvrName));
      await unwrap(server.execute(new Command(["systemctl", "restart", "houston-broadcaster.service"], this.commandOptions)))
    }
    await unwrap(
      server.execute(
        new Command(["systemctl", "restart", "avahi-daemon"], this.commandOptions),
        true
      )
    );
  }

  private async setShareOwnershipAndPermissions(sharePath: string, smbUser: string) {
    try {
      console.log(` Setting ownership of ${sharePath} to ${smbUser}:smbusers...`);
      await unwrap(
        server.execute(
          new Command(["chown", `${smbUser}:smbusers`, sharePath], this.commandOptions),
          true
        )
      );

      console.log(`Setting permissions for ${sharePath} to 775...`);
      await unwrap(
        server.execute(
          new Command(["chmod", "775", sharePath], this.commandOptions),
          true
        )
      );
    } catch (error) {
      console.error(`Error setting ownership and permissions for ${sharePath}:`, error);
    }
  }

  private async deleteZFSPoolAndSMBShares(config: EasySetupConfig) {
    if (!config.zfsConfigs) return;

    const storageZfsConfig = config.zfsConfigs[0]!;
    const backupZfsConfig = config.zfsConfigs[1]!;

    const storagePoolName = storageZfsConfig!.pool.name;
    const backupPoolName = backupZfsConfig!.pool.name;

    const allShares = await this.sambaManager.getShares().unwrapOr(undefined);
    if (allShares) {
      for (let share of allShares) {
        if (share.path.startsWith(`/${storagePoolName}`)) {
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
    }

    console.log(`Unmounting and destroying ${storagePoolName}...`);
    await this.unmountAndRemovePoolIfExists(storageZfsConfig);

    console.log(`Unmounting and destroying ${backupPoolName}...`);
    await this.unmountAndRemovePoolIfExists(backupZfsConfig);
  }

  private async poolExists(poolName: string): Promise<boolean> {
    const result = await server.execute(
      new Command(["zpool", "list", "-H", "-o", "name", `${poolName}`], this.commandOptions)
    ).unwrapOr(null);
  
    const output = result?.stdout;
    if (!output) return false;
  
    const decoded = new TextDecoder().decode(output); // ← converts Uint8Array to string
    return decoded.includes(poolName);
  }
  

  private async isMountPoint(path: string): Promise<boolean> {
    const result = await server.execute(
      new Command(["mountpoint", "-q", path], this.commandOptions)
    );
    return result.isOk();
  }

  private async unmountAndRemovePoolIfExists(config: ZFSConfig) {
    const poolName = config.pool.name;
    const datasetName = config.dataset.name;

    if (!(await this.poolExists(poolName))) {
      console.log(`Skipping destruction. Pool '${poolName}' does not exist.`);
      return;
    }

    const datasetPath = `/${poolName}/${datasetName}`;
    const poolPath = `/${poolName}`;

    if (await this.isMountPoint(datasetPath)) {
      try {
        await unwrap(server.execute(new Command(["umount", datasetPath], this.commandOptions)));
      } catch (e) {
        console.warn(`Failed to unmount dataset ${datasetPath}:`, e);
      }
    }

    if (await this.isMountPoint(poolPath)) {
      try {
        await unwrap(server.execute(new Command(["umount", poolPath], this.commandOptions)));
      } catch (e) {
        console.warn(`Failed to unmount pool ${poolPath}:`, e);
      }
    }

    try {
      await this.zfsManager.destroyPool(poolName, { force: true });
      await this.tryDestroyPoolWithRetries(poolName);
    } catch (e) {
      console.warn(`Error destroying pool ${poolName}:`, e);
    }

    try {
      await unwrap(server.execute(new Command(["rm", "-rf", poolPath], this.commandOptions)));
    } catch (e) {
      console.warn(`Failed to clean up pool dir ${poolPath}:`, e);
    }
  }
  
  private async tryDestroyPoolWithRetries(poolName: string, maxRetries = 3, delayMs = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.zfsManager.destroyPool(poolName, { force: true });
        console.log(`Pool ${poolName} destroyed successfully on attempt ${attempt}`);
        return;
      } catch (error) {
        console.error(`Attempt ${attempt} failed to destroy pool:`, error);

        if (attempt < maxRetries) {
          console.log(`Retrying in ${delayMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        } else {
          console.error(`Failed to destroy pool ${poolName} after ${maxRetries} attempts.`);
          throw error; // rethrow after final failure if needed
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

  // private createUsersAndPasswords(users: { username: string; password: string }[]) {
  //   users.forEach(({ username, password }, index) => {
  //     const isAdmin = index === 0;

  //     server
  //       .getUserByLogin(username)
  //       .orElse(() => server.addUser({ login: username }))
  //       .andThen((user) =>
  //         server
  //           .getGroupByName("smbusers")
  //           .orElse(() => server.createGroup("smbusers"))
  //           .map(() => user)
  //       )
  //       .andThen((user) => {
  //         if (isAdmin) {
  //           return server.addUserToGroups(user, "wheel", "smbusers");
  //         } else {
  //           return server.addUserToGroups(user, "smbusers");
  //         }
  //       })
  //       .andThen((user) => server.changePassword(user, password));
  //   });
  // }
  private async createUsersAndPasswords(users: { username: string; password: string }[]) {
    for (const { username, password } of users) {
      const isAdmin = (username === users[0]!.username);

      // Check if user exists, else add
      let userResult = await server.getUserByLogin(username);
      if (userResult.isErr()) {
        userResult = await server.addUser({ login: username });
        if (userResult.isErr()) {
          console.error(`Failed to add user ${username}:`, userResult.error);
          continue;
        }
      }

      const user = userResult.value;

      // Ensure smbusers group exists
      const groupResult = await server.getGroupByName("smbusers");
      if (groupResult.isErr()) {
        const createGroupResult = await server.createGroup("smbusers");
        if (createGroupResult.isErr()) {
          console.error("Failed to create 'smbusers' group:", createGroupResult.error);
          continue;
        }
      }

      // Add user to groups
      const addGroupsResult = isAdmin
        ? await server.addUserToGroups(user, "wheel", "smbusers")
        : await server.addUserToGroups(user, "smbusers");

      if (addGroupsResult.isErr()) {
        console.error(`Failed to add ${username} to groups:`, addGroupsResult.error);
        continue;
      }

      // Set password
      const passResult = await server.changePassword(user, password);
      if (passResult.isErr()) {
        console.error(`Failed to set password for ${username}:`, passResult.error);
      }
    }
  }

  
  
  // private createGroupsAndAddMembers(groups: { name: string; members?: string[] }[]) {
  //   for (const { name, members = [] } of groups) {
  //     server
  //       .getGroupByName(name)
  //       .orElse(() => server.createGroup(name));

  //     for (const member of members) {
  //       server
  //         .getUserByLogin(member)
  //         .andThen((user) => server.addUserToGroups(user, name));
  //     }
  //   }
  // }
  private async createGroupsAndAddMembers(groups: { name: string; members?: string[] }[]) {
    for (const { name, members = [] } of groups) {
      let groupRes = await server.getGroupByName(name);
      if (groupRes.isErr()) {
        const createRes = await server.createGroup(name);
        if (createRes.isErr()) {
          console.error(`Failed to create group '${name}':`, createRes.error);
          continue;
        }
      }

      for (const member of members) {
        const userRes = await server.getUserByLogin(member);
        if (userRes.isOk()) {
          const addRes = await server.addUserToGroups(userRes.value, name);
          if (addRes.isErr()) {
            console.error(`Failed to add user '${member}' to group '${name}':`, addRes.error);
          }
        } else {
          console.error(`User '${member}' not found to add to group '${name}'`);
        }
      }
    }
  }

  
  
  // private assignGroupsToUsers(users: { username: string; groups: string[] }[]) {
  //   for (const { username, groups } of users) {
  //     server
  //       .getUserByLogin(username)
  //       .map((user) => {
  //         for (const groupName of groups) {
  //           server
  //             .getGroupByName(groupName)
  //             .orElse(() => server.createGroup(groupName))
  //             .map(() => user)
  //             .andThen((u) => server.addUserToGroups(u, groupName));
  //         }
  //       });
  //   }
  // }
  private async assignGroupsToUsers(users: { username: string; groups: string[] }[]) {
    for (const { username, groups } of users) {
      const userRes = await server.getUserByLogin(username);
      if (userRes.isErr()) {
        console.error(`User '${username}' not found for group assignment`);
        continue;
      }

      for (const groupName of groups) {
        let groupRes = await server.getGroupByName(groupName);
        if (groupRes.isErr()) {
          const createRes = await server.createGroup(groupName);
          if (createRes.isErr()) {
            console.error(`Failed to create group '${groupName}':`, createRes.error);
            continue;
          }
        }

        const addRes = await server.addUserToGroups(userRes.value, groupName);
        if (addRes.isErr()) {
          console.error(`Failed to add user '${username}' to group '${groupName}':`, addRes.error);
        }
      }
    }
  }


  
  private async applyUsersAndGroups(config: EasySetupConfig) {
    const userGroupCfg = {
      users: config.usersAndGroups?.users ?? [],
      groups: config.usersAndGroups?.groups ?? []
    };

    if (config.smbUser && config.smbPass) {
      userGroupCfg.users.push({
        username: config.smbUser,
        password: config.smbPass,
        groups: ["wheel", "smbusers"],
      });
    }

    const declaredUsers = new Set(userGroupCfg.users.map(u => u.username));
    for (const group of userGroupCfg.groups ?? []) {
      for (const member of group.members ?? []) {
        if (!declaredUsers.has(member)) {
          throw new ValueError(`Group '${group.name}' references unknown user '${member}'`);
        }
      }
    }

    await this.createUsersAndPasswords(userGroupCfg.users);
    await this.createGroupsAndAddMembers(userGroupCfg.groups ?? []);
    await this.assignGroupsToUsers(userGroupCfg.users);

    for (const user of userGroupCfg.users) {
      if (!user.sshKey || !/^(ssh-(rsa|ed25519)|ecdsa)-/.test(user.sshKey)) continue;

      const sshDir = `/home/${user.username}/.ssh`;
      const authFile = `${sshDir}/authorized_keys`;

      server.execute(new Command(["mkdir", "-p", sshDir], this.commandOptions));
      server.execute(new Command(["chmod", "700", sshDir], this.commandOptions));
      server.execute(new Command(["touch", authFile], this.commandOptions));
      server.execute(new Command(["bash", "-c", `echo "${user.sshKey}" >> ${authFile}`], this.commandOptions));
      server.execute(new Command(["chmod", "600", authFile], this.commandOptions));
      server.execute(new Command(["chown", "-R", `${user.username}:${user.username}`, sshDir], this.commandOptions));
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
      await this.clearReplicationTasks();
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
        console.log(`✅ Unregistered replication task: ${task.name}`);
      } catch (error) {
        console.error(`❌ Failed to unregister task ${task.name}:`, error);
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
        console.log(`✅ Unregistered replication task: ${task.name}`);
      } catch (error) {
        console.error(`❌ Failed to unregister task ${task.name}:`, error);
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
        console.log(`✅ Unregistered scrub task: ${task.name}`);
      } catch (error) {
        console.error(`❌ Failed to unregister task ${task.name}:`, error);
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

    // 🕐 Hourly snapshots retained for 1 day
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

    // 📆 Daily snapshots retained for 1 week
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

    // 📅 Weekly snapshots retained for 1 month (on Fridays at midnight)
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

    // 📅 Weekly snapshots retained for 1 month (on Fridays at midnight)
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

    // ✅ Ensure 'smbusers' group exists
    await unwrap(
      server.getGroupByName("smbusers")
        .orElse(() => server.createGroup("smbusers"))
    );

    // Apply shares
    const shares = config.sambaConfig.shares;
    for (let i = 0; i < shares.length; i++) {
      let share = shares[i];
      const sharePath = `/${config.zfsConfigs![0]!.pool.name}/${config.folderName!}`;
      if (share) {
        if (config.folderName && i === 0) {
          share.name = config.folderName;
          share.path = sharePath;
        }
        await unwrap(this.sambaManager.addShare(share));
        // await this.setShareOwnershipAndPermissions(share.path, config.smbUser);
        const adminUser = config.usersAndGroups?.users?.[0]?.username || config.smbUser;
        await this.setShareOwnershipAndPermissions(share.path, adminUser);

      }
    }
    await unwrap(server.execute(new Command(["systemctl", "start", "smb"])));
    await unwrap(server.execute(new Command(["systemctl", "restart", "smb"])));
    await unwrap(server.execute(new Command(["systemctl", "enable", "smb"])));
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
