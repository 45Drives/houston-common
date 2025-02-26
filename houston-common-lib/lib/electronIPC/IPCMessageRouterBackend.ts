import { IPCMessageRouter, IPCMessageTypes, IPCMessage, isIPCMessage } from "./types";

export class IPCMessageRouterBackend<
  MessageTypes extends Record<string, any> = IPCMessageTypes,
> extends IPCMessageRouter<MessageTypes> {

  webcontents: Electron.WebContents;

  constructor(webcontents: Electron.WebContents, ipcMain: Electron.IpcMain) {
    super("backend");

    this.webcontents = webcontents;
    
    // from backend to renderer
    ipcMain.on("IPCMessage", (message: any) => {
      if (!isIPCMessage<MessageTypes>(message)) {
        return;
      }
      this.routeMessage(message);
    });

  }

  protected forwardToBackend<
    T extends keyof MessageTypes,
    TMessage extends IPCMessage<MessageTypes, T>,
  >(_message: TMessage): void {
    throw new Error("not implemented");
  }

  protected forwardToRenderer<
    T extends keyof MessageTypes,
    TMessage extends IPCMessage<MessageTypes, T>,
  >(message: TMessage): void {
    this.webcontents.send("IPCMessage", JSON.stringify(message))
  }

  protected forwardToCockpit<
    T extends keyof MessageTypes,
    TMessage extends IPCMessage<MessageTypes, T>,
  >(message: TMessage): void {
    this.webcontents.send("IPCMessage", JSON.stringify(message))
  }
}
