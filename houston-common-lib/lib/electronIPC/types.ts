import {BackUpTask} from "../managers/backup"

export type IPCMessageTarget = "cockpit" | "renderer" | "backend";

/**
 * All IPC message types flowing through the IPCMessageRouter bus.
 *
 * The generic `action` channel is kept for backward compatibility with
 * existing backup/discovery handlers that send JSON-stringified blobs.
 * New features should define explicit typed channels instead.
 */
export type IPCMessageTypes = {
  // ── Legacy generic channel (backward compat) ──────────────────────
  action: string;

  // ── Backup (existing) ─────────────────────────────────────────────
  sendBackupTasks: BackUpTask[];
  mountSambaClient: { smb_host: string; smb_share: string; smb_user: string; smb_pass: string };

  // ── Push notifications (backend → renderer) ───────────────────────
  /** Progress update during a long-running restore/backup operation */
  restoreProgress: {
    operationId: string;
    phase: 'listing' | 'downloading' | 'staging' | 'copying' | 'complete' | 'error';
    currentFile?: string;
    filesProcessed?: number;
    filesTotal?: number;
    bytesProcessed?: number;
    bytesTotal?: number;
    message?: string;
    error?: string;
  };

  /** Notification pushed to renderer (toast / status bar) */
  notification: string;
};

export type IPCMessage<MessageTypes extends Record<string, any>, T extends keyof MessageTypes> = {
  source: IPCMessageTarget;
  destination: IPCMessageTarget;
  type: T;
  data: MessageTypes[T];
};

export function isIPCMessage<MessageTypes extends Record<string, any>>(
  message: any
): message is IPCMessage<MessageTypes, any> {
  const validTargets = ["cockpit", "renderer", "backend"];
  if (typeof message.type !== "string") {
    return false;
  }
  if (!validTargets.includes(message.source)) {
    return false;
  }
  if (!validTargets.includes(message.destination)) {
    return false;
  }
  return true;
}

export abstract class IPCMessageRouter<MessageTypes extends Record<string, any> = IPCMessageTypes> {
  private callbacks: {
    [Prop in keyof MessageTypes]?: ((data: MessageTypes[Prop]) => void)[];
  };

  constructor(private ownSource: IPCMessageTarget) {
    this.callbacks = {};
  }

  protected abstract forwardToBackend<
    T extends keyof MessageTypes,
    TMessage extends IPCMessage<MessageTypes, T>,
  >(message: TMessage): void;

  protected abstract forwardToRenderer<
    T extends keyof MessageTypes,
    TMessage extends IPCMessage<MessageTypes, T>,
  >(message: TMessage): void;

  protected abstract forwardToCockpit<
    T extends keyof MessageTypes,
    TMessage extends IPCMessage<MessageTypes, T>,
  >(message: TMessage): void;

  send<T extends keyof MessageTypes>(to: IPCMessageTarget, type: T, data: MessageTypes[T]): void {
    const message: IPCMessage<MessageTypes, T> = {
      source: this.ownSource,
      destination: to,
      type,
      data,
    };
    this.routeMessage(message);
  }

  protected routeMessage<
    T extends keyof MessageTypes,
    TMessage extends IPCMessage<MessageTypes, T>,
  >(message: TMessage): void {
    if (message.destination === this.ownSource) {
      return this.callbacks[message.type]?.forEach((cb) => cb(message.data));
    }
    switch (message.destination) {
      case "backend":
        return this.forwardToBackend(message);
      case "renderer":
        return this.forwardToRenderer(message);
      case "cockpit":
        return this.forwardToCockpit(message);
    }
  }

  addEventListener<T extends keyof MessageTypes>(
    type: T,
    callback: (data: MessageTypes[T]) => void
  ): void {
    this.callbacks[type] ??= [];
    this.callbacks[type]!.push(callback);
  }

  removeEventListener<T extends keyof MessageTypes>(
    type: T,
    callback: (data: MessageTypes[T]) => void
  ): void {
    this.callbacks[type] = this.callbacks[type]?.filter((cb) => cb !== callback);
  }

  /**
   * Send a message and wait for a correlated response on a different channel.
   * Useful when the message bus needs request/response semantics without
   * switching to ipcRenderer.invoke (e.g. for cockpit ↔ renderer flows).
   */
  request<
    TReq extends keyof MessageTypes,
    TRes extends keyof MessageTypes,
  >(
    to: IPCMessageTarget,
    requestType: TReq,
    data: MessageTypes[TReq],
    responseType: TRes,
    timeoutMs = 30_000,
  ): Promise<MessageTypes[TRes]> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.removeEventListener(responseType, handler);
        reject(new Error(`IPC request timed out waiting for "${String(responseType)}" (${timeoutMs}ms)`));
      }, timeoutMs);

      const handler = (responseData: MessageTypes[TRes]) => {
        clearTimeout(timer);
        this.removeEventListener(responseType, handler);
        resolve(responseData);
      };

      this.addEventListener(responseType, handler);
      this.send(to, requestType, data);
    });
  }
}
