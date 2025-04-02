import { EasySetupConfig, BackupLogEntry, BackupLog } from "./types";
import { server, File } from "@/index";
// import * as fs from 'fs';
// import * as path from 'path';

export async function storeEasySetupConfig(config: EasySetupConfig) {
    const now = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const configSavePath = `/etc/45drives/simple-setup-log.json`;
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

