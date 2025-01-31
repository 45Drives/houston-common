import { EasySetupConfig } from "./types";
import { SambaConfParser, SambaManagerNet } from "@/index";
import { ZFSManager } from "@/index";
import * as defaultConfigs from "@/defaultconfigs";

export interface EasySetupProgress {
  message: string,
  step: number,
  total: number
}

export class EasySetupConfigurator  {
  sambaManager: SambaManagerNet;
  zfsManager: ZFSManager;
  constructor() {
    this.sambaManager = new SambaManagerNet();
    this.zfsManager = new ZFSManager();
  }

  applyConfig(_config: EasySetupConfig, progressCallback: (progress: EasySetupProgress) => void) {

    /**
     * Simulated steps for setting up the storage system.
     * In a real app, you might run actual async tasks or poll a backend API.
     */
    const steps: EasySetupProgress[] = [
      {message: 'Initializing', step: 1, total: 3},
      {message: 'Creating Pools', step: 2, total: 3},
      {message: 'Setting Network Storage', step: 3, total: 3},
    ]
    let currentStep = 0;
    const stepInterval = setInterval(() => {
      if (currentStep < steps.length) {
        progressCallback(steps[currentStep++]!)
      } else {
        clearInterval(stepInterval)
      }
    }, 2000)

    /*
    progressCallback({ message: "Initializing Storage", step: 1, total: 3 });
    this.applyZFSConfig(config)
    
    progressCallback({ message: "Setting Up Network Storage", step: 2, total: 3 });
    this.applySambaConfig(config);

    progressCallback({ message: "All Done", step: 3, total: 3 });
    */
  }

  // private async applyZFSConfig(_config: EasySetupConfig) {
  //   let zfsConfig = _config.zfsConfig;

  //   const baseDisks = await this.zfsManager.getBaseDisks();

  //   zfsConfig.pool.vdevs[0]!.disks = baseDisks;
  //   await this.zfsManager.createPool(zfsConfig.pool, zfsConfig.poolOptions);
  //   await this.zfsManager.addDataset(zfsConfig.pool, zfsConfig.dataset.name, zfsConfig.datasetOptions);
    
  // }

/*

  private async applySambaConfig(config: EasySetupConfig) {
    await this.sambaManager.editGlobal(config.sambaConfig.global).unwrapOr(null);

    const shareSamabaResults = config.sambaConfig.shares.map(share => this.sambaManager.addShare(share));
    for (let i = 0; i < shareSamabaResults.length; i++) {
      const shareSamabaResult = shareSamabaResults[i];
      if (shareSamabaResult) {

        await shareSamabaResult.unwrapOr(null)
      }
    }
  }
*/
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