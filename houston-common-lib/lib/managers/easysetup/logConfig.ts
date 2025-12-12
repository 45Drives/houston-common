import { EasySetupConfig, BackupLogEntry, BackupLog } from "./types";
import { server, File, Command } from "@/index";

function safeTimestamp() {
    // 2025-12-12T15-04-33Z
    return new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
}

export function makeEasySetupLogPath(ts = safeTimestamp()) {
    return `/var/log/45drives/easysetup-${ts}.log`;
}

/**
 * Stores the small JSON map at:
 *   /etc/45drives/simple-setup-log.json
 */
export async function storeEasySetupConfig(config: EasySetupConfig) {
    const now = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
    const configSavePath = `/etc/45drives/simple-setup-log.json`;
    const ipAddress = (await server.getIpAddress())._unsafeUnwrap();

    if (!config.sambaConfig) console.error("Missing sambaConfig");
    if (!config.sambaConfig?.shares?.[0]) console.error("No shares found in sambaConfig");
    if (!config.sambaConfig?.shares?.[0]!.name) console.error("First share has no name");
    if (!config.srvrName) console.error("Missing srvrName");

    const configuredShare = config.sambaConfig?.shares?.find((s) => s?.name && typeof s.name === "string");
    if (!configuredShare || !config.srvrName) {
        console.error(" Cannot log setup: Missing share or server name.", {
            shares: config.sambaConfig?.shares,
            srvrName: config.srvrName,
        });
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
            console.error(" Could not check if log file exists:", exists.error.message);
            return;
        }

        if (!exists.value) {
            const createRes = await logFile.create(true);
            if (createRes.isErr()) {
                console.error(" Failed to create log file:", createRes.error.message);
                return;
            }
        } else {
            const readResult = await logFile.read();
            if (readResult.isOk() && readResult.value.trim() !== "") {
                try {
                    backupLog = JSON.parse(readResult.value);
                } catch {
                    console.warn(" Failed to parse existing log. Starting fresh.");
                }
            }
        }

        backupLog[ipAddress] = newEntry;

        const writeResult = await logFile.write(JSON.stringify(backupLog, null, 2), {
            // keep behavior consistent; /etc usually needs privilege, but your environment may already be elevated
            superuser: "try",
        });

        if (writeResult.isOk()) {
            console.log(` Backup log saved at ${configSavePath}`);
        } else {
            console.error(" Failed to write backup log:", writeResult.error.message);
        }
    } catch (error) {
        console.error(" Error saving setup config:", error);
    }
}

type PatchConsoleOptions = {
    logPath?: string;
    fallbackDir?: string;
    superuser?: "try" | "require";
    alsoPatchStdErr?: boolean;
};

let alreadyPatched = false;

/**
 * Patch global console so every console.* call is ALSO appended to a log on the target host.
 * - Tries /var/log/45drives first (default)
 * - Falls back to /tmp/45drives if it can't write
 * - Serializes appends to avoid interleaving
 */
export function patchConsoleToFile(options?: PatchConsoleOptions) {
    if (alreadyPatched) return;

    const primaryPath = options?.logPath ?? "/var/log/45drives/simple-setup.log";
    const fallbackDir = options?.fallbackDir ?? "/tmp/45drives";
    const superuser = options?.superuser ?? "require";

    const originalConsole = {
        log: console.log.bind(console),
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        debug: console.debug.bind(console),
    };

    let activePath = primaryPath;
    let logFile = new File(server, activePath);

    let queue: Promise<void> = Promise.resolve();
    let initialized = false;
    let initFailed = false;
    let usedFallback = false;

    async function ensureDirAndFile(path: string) {
        const dir = path.replace(/\/[^/]+$/, "");
        try {
            await server.execute(new Command(["mkdir", "-p", dir], { superuser }));
            // ensure file exists
            const lf = new File(server, path);
            const ex = await lf.exists();
            if (ex.isOk() && !ex.value) {
                await lf.create(true);
            }
        } catch (e) {
            throw e;
        }
    }

    async function switchToFallback() {
        if (usedFallback) return;
        usedFallback = true;

        const fileName = activePath.split("/").pop() || "simple-setup.log";
        activePath = `${fallbackDir}/${fileName}`;
        logFile = new File(server, activePath);

        try {
            await ensureDirAndFile(activePath);
            originalConsole.warn(`[EasySetup] Logging fallback enabled: ${activePath}`);
        } catch (e) {
            initFailed = true;
            originalConsole.error("[EasySetup] Logging failed (fallback init also failed):", e);
        }
    }

    function formatLine(lvl: string, args: unknown[]) {
        const stamp = new Date().toISOString();
        const msg = args
            .map((a) => (typeof a === "string" ? a : safeJson(a)))
            .join(" ");
        return `[${stamp}] [${lvl}] ${msg}\n`;
    }

    function safeJson(v: unknown) {
        try {
            return JSON.stringify(v, null, 2);
        } catch (e) {
            return `[unserializable: ${String(e)}]`;
        }
    }

    function append(line: string) {
        queue = queue.then(async () => {
            if (initFailed) return;

            try {
                if (!initialized) {
                    initialized = true;
                    await ensureDirAndFile(activePath);
                }

                const res = await logFile.write(line, { append: true, superuser });
                if (res.isErr()) {
                    // If /var/log fails (permissions), fallback to /tmp
                    if (!usedFallback) {
                        await switchToFallback();
                        // try again once on fallback
                        const res2 = await logFile.write(line, { append: true, superuser: "try" });
                        if (res2.isErr()) {
                            initFailed = true;
                            originalConsole.error("LOGGER-FS-ERROR:", res2.error.message);
                        }
                    } else {
                        initFailed = true;
                        originalConsole.error("LOGGER-FS-ERROR:", res.error.message);
                    }
                }
            } catch (err) {
                if (!usedFallback) {
                    await switchToFallback();
                } else {
                    initFailed = true;
                    originalConsole.error("LOGGER-UNEXPECTED:", (err as Error)?.message ?? String(err));
                }
            }
        });
    }

    (["log", "info", "warn", "error", "debug"] as const).forEach((lvl) => {
        console[lvl] = (...args: unknown[]) => {
            (originalConsole as any)[lvl](...args);
            append(formatLine(lvl.toUpperCase(), args));
        };
    });

    if (options?.alsoPatchStdErr) {
        try {
            const origWrite = process.stderr.write.bind(process.stderr);
            process.stderr.write = ((chunk: any, ...rest: any[]) => {
                try {
                    append(formatLine("STDERR", [String(chunk)]));
                } catch { }
                return (origWrite as any)(chunk, ...rest);
            }) as any;
        } catch {
            // ignore if process is unavailable
        }
    }

    alreadyPatched = true;
}

/**
 * Convenience that patches console to a new per-run file and returns the final path used.
 * If /var/log isn't writable, it will fall back to /tmp/45drives/...
 */
export function startEasySetupRunLogging(ts = safeTimestamp()) {
    const logPath = makeEasySetupLogPath(ts);
    patchConsoleToFile({ logPath, superuser: "require" });
    return logPath;
}
