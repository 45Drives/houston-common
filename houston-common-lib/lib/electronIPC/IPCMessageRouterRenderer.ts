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
      console.log(message)
      if (!isIPCMessage<MessageTypes>(message)) {
        return;
      }
      this.routeMessage(message);
    });
  }

  setCockpitWebView(webviewElement: any) {
    // from cockpit to renderer
    if (!this.webviewElement) {
      this.webviewElement = webviewElement;
      this.webviewElement.addEventListener("console-message", (event: any) => {
        const message = event.message;
        if (!isIPCMessage<MessageTypes>(message)) {
          return;
        }
        this.routeMessage(message);
      });
    } else {
      // I guess it could be set more than once but maybe we should clean up the listener and readd
      throw new Error("Setting the cockpit webview can only be done once.");
    }

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
