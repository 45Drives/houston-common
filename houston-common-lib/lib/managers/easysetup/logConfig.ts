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

        const exists = await logFile.exists();

        if (exists.isErr()) {
            console.error("❌ Could not check if log file exists:", exists.error.message);
            return;
        }

        if (!exists.value) {
            // File doesn't exist — create it
            const createRes = await logFile.create(true); // true = recursive
            if (createRes.isErr()) {
                console.error("❌ Failed to create log file:", createRes.error.message);
                return;
            }
        } else {
            // File exists — try to read it
            const readResult = await logFile.read();
            if (readResult.isOk() && readResult.value.trim() !== '') {
                try {
                    backupLog = JSON.parse(readResult.value);
                } catch (e) {
                    console.warn('⚠ Failed to parse existing log. Starting fresh.');
                }
            }
        }

        // Update log entry for this IP
        backupLog[ipAddress] = newEntry;

        // Write updated log
        const writeResult = await logFile.write(JSON.stringify(backupLog, null, 2), {
            superuser: "try",
        });

        if (writeResult.isOk()) {
            console.log(`✅ Backup log saved at ${configSavePath}`);
        } else {
            console.error("❌ Failed to write backup log:", writeResult.error.message);
        }

    } catch (error) {
        console.error("❌ Error saving setup config:", error);
    }
}

/**
 * Patch global console so every console.* call is ALSO appended
 * to `logPath` on the same host the app is configuring.
 */
export function patchConsoleToFile(
    logPath = "/var/log/45drives/simple-setup.log"
) {
    const logFile = new File(server, logPath);

    /** Serialise writes so they never overlap */
    let queue: Promise<void> = Promise.resolve();

    function append(line: string) {
        queue = queue.then(async () => {
            try {
                // Make sure the log file exists once; ignore errors if it already does
                const exists = await logFile.exists();
                if (exists.isErr()) return; // can't do much

                if (!exists.value) {
                    await logFile.create(true);
                }

                const res = await logFile
                    .write(line, { append: true, superuser: "try" });

                if (res.isErr()) {
                    // Surface but don't crash
                    originalConsole.error("LOGGER-FS-ERROR:", res.error.message);
                }
            } catch (err) {
                originalConsole.error("LOGGER-UNEXPECTED:", (err as Error).message);
            }
        });
    }

    /** Preserve originals so we can still print to DevTools/terminal */
    const originalConsole = {
        log: console.log.bind(console),
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        debug: console.debug.bind(console),
    };

    (["log", "info", "warn", "error", "debug"] as const).forEach((lvl) => {
        console[lvl] = (...args: unknown[]) => {
            // 1 ▸ echo to original console
            (originalConsole as any)[lvl](...args);

            // 2 ▸ build a text line and queue the append
            const stamp = new Date().toISOString();
            const line =
                `[${stamp}] [${lvl.toUpperCase()}] ` +
                args
                    .map((a) => (typeof a === "string" ? a : JSON.stringify(a, null, 2)))
                    .join(" ") +
                "\n";

            append(line);        // fire-and-forget
        };
    });
  }