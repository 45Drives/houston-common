import { EasySetupConfig, BackupLogEntry, BackupLog } from "./types";
import { server, File } from "@/index";
// import * as fs from 'fs';
// import * as path from 'path';

export async function storeEasySetupConfig(config: EasySetupConfig) {
    const now = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const configSavePath = `/etc/45drives/simple-setup-log.json`;
    const ipAddress = (await server.getIpAddress())._unsafeUnwrap();

    if (!config.sambaConfig) {
        console.error("Missing sambaConfig");
    }
    if (!config.sambaConfig?.shares?.[0]) {
        console.error("No shares found in sambaConfig");
    }
    if (!config.sambaConfig?.shares?.[0]!.name) {
        console.error("First share has no name");
    }
    if (!config.srvrName) {
        console.error("Missing srvrName");
    }
      
    const configuredShare = config.sambaConfig?.shares?.find(s => s?.name && typeof s.name === 'string');
    if (!configuredShare || !config.srvrName) {
        console.error('❌ Cannot log setup: Missing share or server name.', {
            shares: config.sambaConfig?.shares,
            srvrName: config.srvrName
        });
        return;
    }

    if (!configuredShare) {
        console.error('No configured share found to store.');
        return;
    }

    const newEntry: BackupLogEntry = {
        serverName: config.srvrName!,
        shareName: configuredShare.name,
        setupTime: now,
    };

    try {
        const logFile = new File(server, configSavePath);
        let backupLog: BackupLog = {};

        // Check if file exists and read if so
        const exists = await logFile.exists();
        if (exists.isOk() && exists.value) {
            const readResult = await logFile.read();
            if (readResult.isOk() && readResult.value.trim() !== '') {
                try {
                    backupLog = JSON.parse(readResult.value);
                } catch (e) {
                    console.warn('⚠ Failed to parse existing log. Starting fresh.');
                }
            }
        }

        // Add or update entry for this IP
        backupLog[ipAddress] = newEntry;

        // Write back to file
        const writeResult = await logFile.write(JSON.stringify(backupLog, null, 2));

        if (writeResult.isOk()) {
            console.log(`✅ Backup log saved at ${configSavePath}`);
        } else {
            console.error('Failed to write backup log:', writeResult.error.message);
        }

    } catch (error) {
        console.error('Error saving setup config:', error);
    }
}

