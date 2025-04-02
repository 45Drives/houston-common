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
} from "@/index";
import { storeEasySetupConfig } from './logConfig';
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

      await storeEasySetupConfig(config);

    } catch (error: any) {
      console.error("Error in setupStorage:", error);
      progressCallback({ message: `Error: ${error.message}`, step: -1, total: -1 });
    }

  }

  private async createUser(config: EasySetupConfig) {
    if (!config.smbUser || !config.smbPass) {
      throw new Error("user and password not set in config");
    }
    const smbUserLogin = config.smbUser;
    const smbUserPassword = config.smbPass;
    server
      .getUserByLogin(config.smbUser)
      .orElse(() => server.addUser({ login: smbUserLogin }))
      .andThen((user) =>
        server.createGroup("smbusers").map(() => user)
      )
      .andThen((user) => server.addUserToGroups(user, "wheel", "smbusers"))
      .andThen((user) => server.changePassword(user, smbUserPassword));
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

  private async deleteZFSPoolAndSMBShares(config: EasySetupConfig) {

    if (!config.zfsConfig) {
      return;
    }

    const poolName = config.zfsConfig.pool.name;
    const datasetName = config.zfsConfig.dataset.name;

    const allShares = await (this.sambaManager.getShares().unwrapOr(undefined));
    if (allShares) {

      console.log('existing samba shares:', allShares);
      for (let share of allShares) {
        if (share.path.startsWith("/" + poolName + "/" + datasetName)) {
          console.log('existing share found on pool:', share);
          try {
            await unwrap(this.sambaManager.closeSambaShare(share.name));
            await unwrap(this.sambaManager.removeShare(share));
          } catch (error) {
            console.log(error);
          }
        } else {
          console.log(`Share ${share} doesn't exist on pool/dataset ${poolName}/${datasetName} so we didn't removing it.`)
        }
      }
    } else {

      console.log(`No shares found!`)
    }

    console.log('existing pool found:', config.zfsConfig.pool);
    try {
      server.execute(new Command(["umount", poolName + "/" + datasetName], this.commandOptions))
    } catch (error) {
      console.log(error);
    }

    try {
      server.execute(new Command(["umount", poolName], this.commandOptions))
    } catch (error) {
      console.log(error);
    }

    try {
      await this.zfsManager.destroyPool(poolName, { force: true });
    } catch (error) {
      console.log(error);
    }

  }

  private async applyZFSConfig(_config: EasySetupConfig) {
    let zfsConfig = _config.zfsConfig;

    console.log(zfsConfig!.pool.vdevs[0]!.disks);

    await this.zfsManager.createPool(zfsConfig!.pool, zfsConfig!.poolOptions);
    await this.zfsManager.addDataset(
      zfsConfig!.pool.name,
      zfsConfig!.dataset.name,
      zfsConfig!.datasetOptions
    );
  }

  private async applySambaConfig(config: EasySetupConfig) {
    if (config.smbUser == undefined) {
      throw new ValueError("config.smbUser is undefined!");
    }
    if (config.smbPass == undefined) {
      throw new ValueError("config.smbPass is undefined!");
    }
    if (config.sambaConfig == undefined) {
      throw new ValueError("config.sambaConfig is undefined!");
    }

    await unwrap(this.sambaManager.setUserPassword(config.smbUser, config.smbPass));

    await unwrap(this.sambaManager.editGlobal(config.sambaConfig.global));

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

    // config.sambaConfig!.shares = [
    //   {
    //     ...SambaShareConfig.defaults(config.folderName),
    //     path: `/mnt/${config.folderName}`,
    //     description: `Auto-generated share for ${config.folderName}`,
    //     readOnly: false,
    //   },
    // ];


    // Apply share configurations and ensure correct ownership/permissions
    const shares = config.sambaConfig!.shares;
    for (let i = 0; i < shares.length; i++) {
      let share = shares[i];
      const sharePath = `/${config.zfsConfig!.pool.name}/${config.folderName!}`;
      if (share) {
        if (config.folderName && i === 0) {
          share.name = config.folderName;
          share.path = sharePath;
        }
        await unwrap(this.sambaManager.addShare(share));
        await this.setShareOwnershipAndPermissions(share.path);
      }
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
