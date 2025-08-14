import {BackUpTask} from "../managers/backup"

export type IPCMessageTarget = "cockpit" | "renderer" | "backend";

export type IPCMessageTypes = {
  action: string;
  action2: { prop: "val" };
  sendBackupTasks: BackUpTask[],
  mountSambaClient: {smb_host: string, smb_share: string, smb_user: string, smb_pass: string}
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
}







// export function IPCMessageRouterAuto<
//   MessageTypes extends Record<string, any> = IPCMessageTypes,
// >(): new () => IPCMessageRouter<MessageTypes> {
//   if ("cockpit" in window) {
//     return IPCMessageRouterCockpit<MessageTypes>;
//   }
//   if (typeof process === "object" && process.release?.name === "node") {
//     return IPCMessageRouterBackend<MessageTypes>;
//   }
//   return IPCMessageRouterRenderer<MessageTypes>;
// }
