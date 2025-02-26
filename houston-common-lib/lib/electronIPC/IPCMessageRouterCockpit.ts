import { IPCMessageRouter, IPCMessageTypes, IPCMessage, isIPCMessage } from "./types";

export class IPCMessageRouterCockpit<
  MessageTypes extends Record<string, any> = IPCMessageTypes,
> extends IPCMessageRouter<MessageTypes> {
  constructor() {
    super("cockpit");

    // from renderer to cockpit
    window.addEventListener("console-message", (event: any) => {
      const message = JSON.parse(event.message);
      if (!isIPCMessage<MessageTypes>(message)) {
        return;
      }
      this.routeMessage(message);
    });
    
  }

  protected forwardToBackend<
    T extends keyof MessageTypes,
    TMessage extends IPCMessage<MessageTypes, T>,
  >(message: TMessage): void {
    console.log(JSON.stringify(message));
  }

  protected forwardToRenderer<
    T extends keyof MessageTypes,
    TMessage extends IPCMessage<MessageTypes, T>,
  >(message: TMessage): void {
    console.log(JSON.stringify(message));
  }

  protected forwardToCockpit<
    T extends keyof MessageTypes,
    TMessage extends IPCMessage<MessageTypes, T>,
  >(_message: TMessage): void {
    throw new Error("not implemented");
  }
}
