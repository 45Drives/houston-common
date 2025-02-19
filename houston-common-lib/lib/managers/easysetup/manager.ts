import { EasySetupConfig } from "./types";
import {
  Command,
  SambaConfParser,
  SambaManagerNet,
  server,
  unwrap,
  ZFSConfig,
  CommandOptions,
} from "@/index";
import { ZFSManager } from "@/index";
import * as defaultConfigs from "@/defaultconfigs";
import { okAsync } from "neverthrow";

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
    if (true) {
      try {
        const total = 6;
        progressCallback({ message: "Initializing Storage Setup... please wait", step: 1, total });

        await this.deleteZFSPoolAndSMBShares(config);
        progressCallback({ message: "Made sure your server is good to continue", step: 2, total });

        await this.updateHostname(config);
        progressCallback({ message: "Updated Server Name", step: 3, total });

        await this.createUser(config);
        progressCallback({ message: "Created your User", step: 4, total });

        await this.applyZFSConfig(config);
        progressCallback({ message: "Drive Configuration done", step: 5, total });

        await this.applySambaConfig(config);
        progressCallback({ message: "Network configured", step: 6, total });
      } catch (error: any) {
        console.error("Error in setupStorage:", error);
        progressCallback({ message: `Error: ${error.message}`, step: -1, total: -1 });
      }
    } else {
      /**
       * Simulated steps for setting up the storage system.
       * In a real app, you might run actual async tasks or poll a backend API.
       */
      const steps: EasySetupProgress[] = [
        { message: "Initializing", step: 1, total: 3 },
        { message: "Creating Pools", step: 2, total: 3 },
        { message: "Setting Network Storage", step: 3, total: 3 },
      ];
      let currentStep = 0;
      const stepInterval = setInterval(() => {
        if (currentStep < steps.length) {
          progressCallback(steps[currentStep++]!);
        } else {
          clearInterval(stepInterval);
        }
      }, 2000);
    }
  }

  private async checkAndCreateSmbUserGroup() {
    try {
      const groupExists = await unwrap(
        server.execute(new Command(["getent", "group", "smbusers"], this.commandOptions), true)
      );

      // Convert the output from Uint8Array to a string
      const stdoutString = new TextDecoder().decode(groupExists.stdout).trim();

      if (!stdoutString) {
        console.log("Group 'smbusers' does not exist. Creating it...");
        await unwrap(
          server.execute(new Command(["groupadd", "smbusers"], this.commandOptions), true)
        );
      } else {
        console.log("Group 'smbusers' already exists.");
      }
    } catch (error) {
      console.error("Error checking/creating smbusers group:", error);
    }
  }

  private async createUser(config: EasySetupConfig) {
    if (!config.smbUser || !config.smbPass) {
      throw new Error("User and password not set in config");
    }

    try {
      // Create the user if it doesn't exist
      await unwrap(
        server.execute(new Command(["id", config.smbUser], this.commandOptions), true)
      );
    } catch (error) {
      console.log(`User '${config.smbUser}' does not exist. Creating it...`);
      await unwrap(
        server.execute(new Command(["useradd", "-m", "-s", "/bin/bash", config.smbUser], this.commandOptions), true)
      );
    }

    // try {
    //   await unwrap(server.execute(new Command(["usermod", "-aG", "wheel", config.smbUser], this.commandOptions), true));
    // } catch (error) { }

    try {
      // Ensure user is added to smbusers group
      await unwrap(
        server.execute(new Command(["usermod", "-aG", "smbusers", config.smbUser], this.commandOptions), true)
      );
    } catch (error) {
      console.error(`Error adding user '${config.smbUser}' to smbusers group:`, error);
    }

    try {
      // Set user password
      await unwrap(
        server.execute(
          new Command(["echo", `${config.smbUser}:${config.smbPass}`, "|", "chpasswd"], this.commandOptions),
          true
        )
      );
    } catch (error) {
      console.error(`Error setting password for user '${config.smbUser}':`, error);
    }
  }

  private async setShareOwnershipAndPermissions(sharePath: string) {
    try {
      console.log(`Setting ownership of ${sharePath} to root:smbusers...`);
      await unwrap(
        server.execute(new Command(["chown", "-R", "root:smbusers", sharePath], this.commandOptions), true)
      );

      console.log(`Setting permissions for ${sharePath}...`);
      await unwrap(
        server.execute(new Command(["chmod", "-R", "g+rw", sharePath], this.commandOptions), true)
      );
    } catch (error) {
      console.error(`Error setting ownership and permissions for ${sharePath}:`, error);
    }
  }


  private async updateHostname(_config: EasySetupConfig) {
    //server.setHostname(config.hostname)
    await unwrap(server.execute(new Command(["systemctl", "restart", "avahi-daemon"], this.commandOptions), true));
  }

  private async deleteZFSPoolAndSMBShares(config: EasySetupConfig) {
    try {
      await this.sambaManager.stopSambaService();
    } catch (error) {
      console.log(error);
    }

    try {
      await this.zfsManager.destroyPool(config.zfsConfig!.pool, { force: true });
    } catch (error) {
      console.log(error);
    }

    for (let share of config.sambaConfig!.shares) {
      try {
        await this.sambaManager.removeShare(share);
      } catch (error) {
        console.log(error);
      }
    }

    try {
      await this.sambaManager.startSambaService();
    } catch (error) {
      console.log(error);
    }
  }

  private async applyZFSConfig(_config: EasySetupConfig) {
    let zfsConfig = _config.zfsConfig;

    let baseDisks = await this.zfsManager.getBaseDisks();
    console.log("baseDisks:", baseDisks);

    baseDisks = baseDisks.filter((b) => b.path.trim().length > 0);
    console.log("baseDisks filtered", baseDisks);

    zfsConfig!.pool.vdevs[0]!.disks = baseDisks;
    await this.zfsManager.createPool(zfsConfig!.pool, zfsConfig!.poolOptions);
    await this.zfsManager.addDataset(
      zfsConfig!.pool,
      zfsConfig!.dataset.name,
      zfsConfig!.datasetOptions
    );
  }

  private async applySambaConfig(config: EasySetupConfig) {
    // Ensure the smbusers group exists before configuring Samba
    await this.checkAndCreateSmbUserGroup();

    // Set the Samba password for the user
    await this.sambaManager.setUserPassword(config.smbUser!, config.smbPass!);

    // Edit the global Samba configuration
    await unwrap(this.sambaManager.editGlobal(config.sambaConfig!.global));

    // Ensure Samba configuration includes registry
    await unwrap(
      this.sambaManager
        .checkIfSambaConfIncludesRegistry("/etc/samba/smb.conf")
        .andThen((includesRegistry) =>
          includesRegistry
            ? okAsync({})
            : this.sambaManager.patchSambaConfIncludeRegistry("/etc/samba/smb.conf")
        )
    );

    // const shareSamabaResults = config.sambaConfig!.shares.map((share) =>
    //   this.sambaManager.addShare(share)
    // );
    // for (let i = 0; i < shareSamabaResults.length; i++) {
    //   const shareSamabaResult = shareSamabaResults[i];
    //   if (shareSamabaResult) {
    //     await unwrap(shareSamabaResult);
    //   }
    // }

    // Apply share configurations and ensure correct ownership/permissions
    for (const share of config.sambaConfig!.shares) {
      await unwrap(this.sambaManager.addShare(share));
      await this.setShareOwnershipAndPermissions(share.path);
    }
  }

  static async loadConfig(
    easyConfigName: keyof typeof defaultConfigs
  ): Promise<EasySetupConfig | null> {
    console.log("loading config for:", easyConfigName);
    console.log("list of defaultconfigs:", defaultConfigs);
    const dc = defaultConfigs[easyConfigName];
    return SambaConfParser()
      .apply(dc.smbconf)
      .map((sambaConfig): EasySetupConfig => {
        return {
          sambaConfig,
          zfsConfig: dc.zfsconf as ZFSConfig,
        };
      })
      .unwrapOr(null);
  }
}
