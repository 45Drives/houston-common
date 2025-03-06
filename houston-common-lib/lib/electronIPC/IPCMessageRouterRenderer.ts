import { IPCMessageRouter, IPCMessageTypes, IPCMessage, isIPCMessage } from "./types";

interface ElectronApi {
  ipcRenderer: {
    send: (channel: string, data: any) => void;
    on: (channel: string, callback: (...args: any[]) => void) => void;
  };
}

declare global {
  interface Window {
    electron: ElectronApi;
  }
}

export class IPCMessageRouterRenderer<
  MessageTypes extends Record<string, any> = IPCMessageTypes,
> extends IPCMessageRouter<MessageTypes> {
  webviewElement: any;
  constructor() {
    super("renderer");
    // from backend to renderer
    window.electron.ipcRenderer.on("IPCMessage", (_event, message: any) => {
      try {
        message = JSON.parse(message);
      } catch (error) {
      }
      if (!isIPCMessage<MessageTypes>(message)) {
        return;
      }
      this.routeMessage(message);
    });
  }

  setCockpitWebView(webviewElement: any) {
    this.webviewElement = webviewElement;
    this.webviewElement.addEventListener("console-message", (event: any) => {
      let message = event.message;
      try {
        message = JSON.parse(message);
      } catch (error) {
      }

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
    window.electron.ipcRenderer.send("IPCMessage", message);
  }

  protected forwardToRenderer<
    T extends keyof MessageTypes,
    TMessage extends IPCMessage<MessageTypes, T>,
  >(_message: TMessage): void {
    throw new Error("not implemented");
  }

  protected forwardToCockpit<
    T extends keyof MessageTypes,
    TMessage extends IPCMessage<MessageTypes, T>,
  >(message: TMessage): void {
    this.webviewElement.value.executeJavaScript(`
        console.log(${JSON.stringify(message)});
        `);
  }
}
