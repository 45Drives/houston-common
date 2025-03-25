// import { BackupLogEntry, EasySetupConfig } from "./types";
// import { server } from "@/index";
// import * as fs from 'fs';
// import * as path from 'path';

// export async function storeEasySetupConfig(config: EasySetupConfig) {
//   const now = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
//   const ipAddress = (await server.getIpAddress())._unsafeUnwrap();
//   const configSavePath = `/etc/45drives/simple-setup-log.json`;

//   const newEntry: BackupLogEntry = {
//     serverName: config.srvrName!,
//     shareName: config.folderName!,
//     setupTime: now,
//   };

//   try {
//     fs.mkdirSync(path.dirname(configSavePath), { recursive: true });

//     let existingLog: Record<string, BackupLogEntry> = {};
//     if (fs.existsSync(configSavePath)) {
//       existingLog = JSON.parse(fs.readFileSync(configSavePath, 'utf-8'));
//     }

//     // Add or update entry for this IP
//     existingLog[ipAddress] = newEntry;

//     // Write updated log
//     fs.writeFileSync(configSavePath, JSON.stringify(existingLog, null, 2));
//     console.log(`✅ EasySetupConfig appended/updated for ${ipAddress} at ${configSavePath}`);
//   } catch (error) {
//     console.error('Error saving EasySetupConfig:', error);
//   }
// }
import { EasySetupConfig, BackupLogEntry } from "./types";
import { server } from "@/index";
import * as fs from 'fs';
import * as path from 'path';

export async function storeEasySetupConfig(config: EasySetupConfig) {
    const now = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const configSavePath = `/etc/45drives/simple-setup-current.json`;
    const ipAddress = (await server.getIpAddress())._unsafeUnwrap();

    const configuredShare = config.sambaConfig?.shares[0];
    if (!configuredShare) {
        console.error('No configured share found to store.');
        return;
    }

    const newEntry: BackupLogEntry = {
        serverName: config.srvrName!,
        shareName: configuredShare.name,
        setupTime: now,
    };

    const record = {
        hostname: config.srvrName!,
        ipAddress,
        configuredShare: newEntry,
    };

    try {
        fs.mkdirSync(path.dirname(configSavePath), { recursive: true });
        fs.writeFileSync(configSavePath, JSON.stringify(record, null, 2));
        console.log(`✅ Setup share saved at ${configSavePath}`);
    } catch (error) {
        console.error('Error writing setup share info:', error);
    }
}

