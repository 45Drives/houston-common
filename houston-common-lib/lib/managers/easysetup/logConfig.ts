import { EasySetupConfig, BackupLogEntry, BackupLog } from "./types";
import { server, File, Command } from "@/index";

function safeTimestamp() {
    return new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
}

export function makeEasySetupLogPath(ts = safeTimestamp()) {
    return `/var/log/45drives/easysetup-${ts}.log`;
}

function makeEasySetupTmpLogPath(ts = safeTimestamp()) {
    return `/tmp/45drives/easysetup-${ts}.log`;
}

export async function storeEasySetupConfig(config: EasySetupConfig, serverName: string) {
    const configSavePath = `/etc/45drives/simple-setup-log.json`;
    const configDir = `/etc/45drives`;
    const ipAddress = (await server.getIpAddress())._unsafeUnwrap();
    const configuredShare = config.sambaConfig?.shares?.find(
        (s) => s?.name && typeof s.name === "string"
    );
    if (!configuredShare) {
        console.error("Cannot log setup: Missing share.", { shares: config.sambaConfig?.shares });
        return false;
    }

    const newEntry: BackupLogEntry = {
        serverName,
        shareName: configuredShare.name,
        setupTime: new Date().toISOString(), // keep valid ISO for server.js Date parsing
    };

    try {
        // Ensure /etc/45drives exists (required for create/write)
        await server.execute(new Command(["mkdir", "-p", configDir], { superuser: "require" }), true);

        const logFile = new File(server, configSavePath);
        let backupLog: BackupLog = {};

        const exists = await logFile.exists();
        if (exists.isErr()) {
            console.error("Could not check if log file exists:", exists.error.message);
            return false;
        }

        if (exists.value) {
            const readResult = await logFile.read({ superuser: "require" } as any);
            if ((readResult as any).isOk?.() && (readResult as any).value.trim() !== "") {
                try {
                    backupLog = JSON.parse((readResult as any).value);
                } catch {
                    console.warn("Failed to parse existing log. Starting fresh.");
                    backupLog = {};
                }
            }
        }

        backupLog[ipAddress] = newEntry;

        const writeResult = await logFile.write(JSON.stringify(backupLog, null, 2), {
            superuser: "require",
        });

        if (writeResult.isOk()) {
            console.log(`Backup log saved at ${configSavePath}`);
            return true;
        } else {
            console.error("Failed to write backup log:", writeResult.error.message);
            return false;
        }
    } catch (error) {
        console.error("Error saving setup config:", error);
        return false;
    }
}

/* ------------------------------------------------------------------ */
/* Console -> file logger (supports repointing + flush)                 */
/* ------------------------------------------------------------------ */

type SuperuserMode = "try" | "require";

type LoggerState = {
    activePath: string;
    superuser: SuperuserMode;
    logFile: File;
    queue: Promise<void>;
    original: {
        log: typeof console.log;
        info: typeof console.info;
        warn: typeof console.warn;
        error: typeof console.error;
        debug: typeof console.debug;
    };
    patched: boolean;
};

let state: LoggerState | null = null;

function safeJson(v: unknown) {
    try {
        return JSON.stringify(v, null, 2);
    } catch (e) {
        return `[unserializable: ${String(e)}]`;
    }
}

async function ensureDirAndFile(path: string, superuser: SuperuserMode) {
    const dir = path.replace(/\/[^/]+$/, "");
    await server.execute(new Command(["mkdir", "-p", dir], { superuser }), true);
    await server.execute(new Command(["bash", "-lc", `test -e ${JSON.stringify(path)} || : > ${JSON.stringify(path)}`], { superuser }), true);
    await server.execute(new Command(["bash", "-lc", `chmod 0755 ${JSON.stringify(dir)} || true`], { superuser }), true);

    return new File(server, path);
}

function formatLine(level: string, args: unknown[]) {
    const stamp = new Date().toISOString();
    const msg = args.map((a) => (typeof a === "string" ? a : safeJson(a))).join(" ");
    return `[${stamp}] [${level}] ${msg}\n`;
}

export function patchConsoleToFile(logPath: string, superuser: SuperuserMode = "try") {
    if (!state) {
        const original = {
            log: console.log.bind(console),
            info: console.info.bind(console),
            warn: console.warn.bind(console),
            error: console.error.bind(console),
            debug: console.debug.bind(console),
        };

        state = {
            activePath: logPath,
            superuser,
            logFile: new File(server, logPath),
            queue: Promise.resolve(),
            original,
            patched: false,
        };
    } else {
        // Repoint existing logger (important for per-run files)
        state.activePath = logPath;
        state.superuser = superuser;
        state.logFile = new File(server, logPath);
    }

    if (state.patched) return;

    const s = state;

    function append(line: string) {
        s.queue = s.queue.then(async () => {
            try {
                // Best effort: ensure dir/file, then append
                s.logFile = await ensureDirAndFile(s.activePath, s.superuser);
                const res = await s.logFile.write(line, { append: true, superuser: s.superuser });
                if (res.isErr()) {
                    s.original.error("LOGGER-FS-ERROR:", res.error.message);
                }
            } catch (e) {
                s.original.error("LOGGER-UNEXPECTED:", (e as any)?.message ?? String(e));
            }
        });
    }

    (["log", "info", "warn", "error", "debug"] as const).forEach((lvl) => {
        console[lvl] = (...args: unknown[]) => {
            (s.original as any)[lvl](...args);

            if (!shouldSkipFileLog(args)) {
                append(formatLine(lvl.toUpperCase(), args));
            }
        };
    });

    s.patched = true;
}

export async function flushConsoleFileLogger() {
    if (!state) return;
    await state.queue;
}

/**
 * Start logging immediately to /tmp (works without admin), return both paths.
 * Later, after ensureAdminSession succeeds, call promoteEasySetupRunLogging().
 */
export function startEasySetupRunLogging(ts = safeTimestamp()) {
    const tmpPath = makeEasySetupTmpLogPath(ts);
    const varPath = makeEasySetupLogPath(ts);

    // Always start in /tmp with superuser: try
    patchConsoleToFile(tmpPath, "try");
    console.log("[EasySetup] Run log (tmp):", tmpPath);

    return { ts, tmpPath, varPath };
}

/**
 * Switch logging target to /var/log after you have admin.
 */
export async function promoteEasySetupRunLogging(varPath: string, tmpPath?: string) {
    patchConsoleToFile(varPath, "require");
    console.log("[EasySetup] Run log (var):", varPath);

    // Best-effort delete of the tmp log now that /var/log is active
    if (tmpPath) {
        await server.execute(
            new Command(["bash", "-lc", `rm -f ${JSON.stringify(tmpPath)} || true`], { superuser: "try" }),
            true
        );
    }
}

function shouldSkipFileLog(args: unknown[]) {
    // only filtering what gets written to the file
    const joined = args.map(a => (typeof a === "string" ? a : safeJson(a))).join(" ");

    // Drop the noisy warning(s)
    if (/sigmaRadians,\s*0\.05, is too large and will clip/i.test(joined)) return true;

    return false;
}
