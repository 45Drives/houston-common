import { IPCMessageRouter, IPCMessageTypes, IPCMessage, isIPCMessage } from "./types";

export class IPCMessageRouterBackend<
  MessageTypes extends Record<string, any> = IPCMessageTypes,
> extends IPCMessageRouter<MessageTypes> {

  webcontents: Electron.WebContents;

  constructor(webcontents: Electron.WebContents, ipcMain: Electron.IpcMain) {
    super("backend");

    this.webcontents = webcontents;
    
    // Receive messages from both the renderer and the cockpit webview
    // (both send on the "IPCMessage" channel via their respective preloads)
    ipcMain.on("IPCMessage", (_event, message: any) => {
      let parsed = message;
      try {
        if (typeof parsed === "string") parsed = JSON.parse(parsed);
      } catch { /* not JSON — pass through */ }

      if (!isIPCMessage<MessageTypes>(parsed)) {
        return;
      }
      this.routeMessage(parsed);
    });

  }

  protected forwardToBackend<
    T extends keyof MessageTypes,
    TMessage extends IPCMessage<MessageTypes, T>,
  >(_message: TMessage): void {
    // Backend → Backend: message is already here; deliver locally.
    throw new Error("Cannot forward to backend from backend — use routeMessage directly");
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
    // Route through the renderer process — it will forward to the webview
    this.webcontents.send("IPCMessage", JSON.stringify(message))
  }
}
