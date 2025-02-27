import { BackUpSetupConfig } from "./types";
import {
  CommandOptions,
} from "@/index";

export interface BackUpSetupProgress {
  message: string;
  step: number;
  total: number;
}

export class BackupSetupConfigurator {
  commandOptions: CommandOptions;

  constructor() {
    this.commandOptions = { superuser: "try" };
  }

  async applyConfig(
    config: BackUpSetupConfig,
    progressCallback: (progress: BackUpSetupProgress) => void
  ) {

    try {
      const total = 6;
      progressCallback({ message: "Initializing Backup Setup... please wait", step: 1, total });

      console.log(config);

    } catch (error: any) {
      console.error("Error in setting up backups:", error);
      progressCallback({ message: `Error: ${error.message}`, step: -1, total: -1 });
    }

  }

}
