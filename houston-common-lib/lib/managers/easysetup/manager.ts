import { Result, ResultAsync } from "neverthrow";
import { EasySetupConfig, EasySetupResult } from "./types";
import { ParsingError, ProcessError, SambaConfParser, SambaManagerNet } from "@/index";
import * as defaultConfigs from "@/defaultconfigs";

export interface IEasySetupConfigurator {

  applyConfig(config: EasySetupConfig): ResultAsync<EasySetupResult, ProcessError>;
}

export class EasySetupConfigurator implements IEasySetupConfigurator {
  sambaManager: SambaManagerNet;

  constructor() {
    this.sambaManager = new SambaManagerNet();
  }

  applyConfig(config: EasySetupConfig): ResultAsync<EasySetupResult, ProcessError> {
    const globalSambaUpdateResult = this.sambaManager.editGlobal(config.sambaConfig.global);
    const shareSamabaResults = config.sambaConfig.shares.map(share => this.sambaManager.addShare(share));

    return ResultAsync.combine([globalSambaUpdateResult, ...shareSamabaResults])
      .map(() => ({}))
  }

  static loadConfig(easyConfigName: keyof typeof defaultConfigs): Result<EasySetupConfig, ParsingError> {
    const dc = defaultConfigs[easyConfigName];
    return SambaConfParser()
      .apply(dc.smbconf)
      .map((sambaConfig) => {
        return {
          sambaConfig,
          zfsConfig: dc.zfsconf
        }
      })

  }
}