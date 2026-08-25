/**
 * Bridge for surfacing Cockpit-module activity in the desktop client's log viewer.
 *
 * Cockpit modules run inside an iframe inside the client's <webview>, so they
 * cannot reach Electron directly. Entries are posted to the top window, where
 * the client injects a relay that forwards them to the main process.
 * Outside the client (plain browser) the entry is written to console instead,
 * which the module's own file logger already captures.
 */

export type ClientLogLevel = "debug" | "info" | "warn" | "error";

export interface ClientLogEntry {
  /** Stable machine-readable identifier, e.g. "scheduler:task_create". */
  event: string;
  level: ClientLogLevel;
  /** One-line human summary shown in the log viewer. */
  summary?: string;
  /** Longer free-form text (command output, stack trace, …). */
  details?: string;
  /** Which module produced this, e.g. "scheduler", "setup", "wireshield". */
  module?: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export const CLIENT_LOG_MESSAGE_TYPE = "45d-client-log";

const SENSITIVE_KEY = /pass(word|wd)?|secret|token|authorization|auth|key/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[…]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

let defaultModule = "cockpit";

/** Tags every subsequent entry from this module. Call once at app startup. */
export function setClientLogModule(module: string): void {
  defaultModule = module;
}

export function logToClient(
  event: string,
  data: Record<string, unknown> = {},
  level: ClientLogLevel = "info",
  summary?: string
): void {
  const entry: ClientLogEntry = {
    event,
    level,
    module: defaultModule,
    timestamp: new Date().toISOString(),
    summary,
    data: redact(data) as Record<string, unknown>,
  };

  try {
    const target = window.top ?? window.parent;
    target?.postMessage({ type: CLIENT_LOG_MESSAGE_TYPE, entry }, "*");
  } catch {
    /* cross-origin top window — fall through to console */
  }

  const line = `[${entry.module}] ${event}${summary ? ` — ${summary}` : ""}`;
  if (level === "error") console.error(line, entry.data);
  else if (level === "warn") console.warn(line, entry.data);
  else console.log(line, entry.data);
}

/**
 * Wraps an async operation with start/done/error entries and a duration.
 * Re-throws so callers keep their existing error handling.
 */
export async function logClientStep<T>(
  event: string,
  data: Record<string, unknown>,
  fn: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now();
  logToClient(event, data);
  try {
    const result = await fn();
    logToClient(`${event}.done`, { ...data, durationMs: Date.now() - startedAt });
    return result;
  } catch (err) {
    logToClient(
      `${event}.error`,
      { ...data, durationMs: Date.now() - startedAt },
      "error",
      err instanceof Error ? err.message : String(err)
    );
    throw err;
  }
}
