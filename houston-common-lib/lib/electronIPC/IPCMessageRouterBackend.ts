import { IPCMessageRouter, IPCMessageTypes, IPCMessage, isIPCMessage } from "./types";

export class IPCMessageRouterBackend<
  MessageTypes extends Record<string, any> = IPCMessageTypes,
> extends IPCMessageRouter<MessageTypes> {
  constructor() {
    super("backend");

    // set up event listeners here to call this.routeMessage when message received
  }

  protected forwardToBackend<
    T extends keyof MessageTypes,
    TMessage extends IPCMessage<MessageTypes, T>,
  >(message: TMessage): void {
    throw new Error("not implemented");
  }

  protected forwardToRenderer<
    T extends keyof MessageTypes,
    TMessage extends IPCMessage<MessageTypes, T>,
  >(message: TMessage): void {
    throw new Error("not implemented");
  }

  protected forwardToCockpit<
    T extends keyof MessageTypes,
    TMessage extends IPCMessage<MessageTypes, T>,
  >(message: TMessage): void {
    throw new Error("not implemented");
  }
}
