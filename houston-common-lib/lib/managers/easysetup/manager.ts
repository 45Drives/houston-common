import { EasySetupConfig } from "./types";
import { SambaConfParser, SambaManagerNet, unwrap } from "@/index";
import { ZFSManager } from "@/index";
import * as defaultConfigs from "@/defaultconfigs";
import { okAsync } from "neverthrow";

export interface EasySetupProgress {
  message: string,
  step: number,
  total: number
}

export class EasySetupConfigurator {
  sambaManager: SambaManagerNet;
  zfsManager: ZFSManager;

  constructor() {
    this.sambaManager = new SambaManagerNet();
    this.zfsManager = new ZFSManager();
  }

  async applyConfig(config: EasySetupConfig, progressCallback: (progress: EasySetupProgress) => void) {
    if (true) {
      try {

        progressCallback({ message: "Initializing Storage", step: 1, total: 4 });
        await this.deleteZFSPoolAndSMBShares(config);

        progressCallback({ message: "Setting up Storage Configuration", step: 2, total: 4 });
        await this.applyZFSConfig(config)

        progressCallback({ message: "Setting Up Network Storage", step: 3, total: 4 });
        await this.applySambaConfig(config);

        progressCallback({ message: "All Done", step: 4, total: 4 });

      } catch (error: any) {
        console.error("Error in setupStorage:", error);
        progressCallback({ message: `Error: ${error.message}`, step: -1, total: 4 });
      }
    }
    else {
      /**
          * Simulated steps for setting up the storage system.
          * In a real app, you might run actual async tasks or poll a backend API.
          */
      const steps: EasySetupProgress[] = [
        { message: 'Initializing', step: 1, total: 3 },
        { message: 'Creating Pools', step: 2, total: 3 },
        { message: 'Setting Network Storage', step: 3, total: 3 },
      ]
      let currentStep = 0;
      const stepInterval = setInterval(() => {
        if (currentStep < steps.length) {
          progressCallback(steps[currentStep++]!)
        } else {
          clearInterval(stepInterval)
        }
      }, 2000)
    }
  }

  private async deleteZFSPoolAndSMBShares(config: EasySetupConfig) {
    await this.zfsManager.destroyPool(config.zfsConfig.pool, { force: true });

    for (let share of config.sambaConfig.shares) {
      await this.sambaManager.removeShare(share);
    }
  }

  private async applyZFSConfig(_config: EasySetupConfig) {
    let zfsConfig = _config.zfsConfig;

    const baseDisks = await this.zfsManager.getBaseDisks();

    console.log("baseDisks:", baseDisks)

    zfsConfig.pool.vdevs[0]!.disks = baseDisks;
    await this.zfsManager.createPool(zfsConfig.pool, zfsConfig.poolOptions);
    await this.zfsManager.addDataset(zfsConfig.pool.name, zfsConfig.dataset.name, zfsConfig.datasetOptions);

  }

  private async applySambaConfig(config: EasySetupConfig) {

    await this.sambaManager.setUserPassword(config.smbUser, config.smbPass);

    await unwrap(this.sambaManager.editGlobal(config.sambaConfig.global));

    await unwrap(this.sambaManager.checkIfSambaConfIncludesRegistry("/etc/samba/smb.conf")
      .andThen((includesRegistry) => includesRegistry ? okAsync({}) : this.sambaManager.patchSambaConfIncludeRegistry("/etc/samba/smb.conf"))
    )

    const shareSamabaResults = config.sambaConfig.shares.map(share => this.sambaManager.addShare(share));
    for (let i = 0; i < shareSamabaResults.length; i++) {
      const shareSamabaResult = shareSamabaResults[i];
      if (shareSamabaResult) {

        await unwrap(shareSamabaResult)

      }
    }

  }

  static async loadConfig(easyConfigName: keyof typeof defaultConfigs): Promise<EasySetupConfig | null> {
    console.log("loading config for:", easyConfigName);
    console.log("list of defaultconfigs:", defaultConfigs)
    const dc = defaultConfigs[easyConfigName];
    return SambaConfParser()
      .apply(dc.smbconf)
      .map((sambaConfig) => {
        return {
          sambaConfig,
          zfsConfig: dc.zfsconf
        } as EasySetupConfig
      })
      .unwrapOr(null);
  }
}