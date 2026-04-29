import { IPCMessageRouter, IPCMessageTypes, IPCMessage, isIPCMessage } from "./types";

interface ElectronApi {
  ipcRenderer: {
    send: (channel: string, data: any) => void;
    on: (channel: string, callback: (...args: any[]) => void) => void;
    once: (channel: string, callback: (...args: any[]) => void) => void;
    invoke: <T = any>(channel: string, ...args: any[]) => Promise<T>;
    removeListener: (channel: string, listener: (...args: any[]) => void) => void;
    removeAllListeners: (channel: string) => void;
  };
  selectFolder: () => Promise<string | null>;
  getOS: () => Promise<string>;
  isFirstRunNeeded: (host: string, share: string, smbUser: string) => Promise<boolean>;
  log: {
    debug: (...args: any[]) => void;
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
    log: (...args: any[]) => void;
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

  public async invoke<T = any>(channel: string, ...args: any[]): Promise<T> {
    return await window.electron.ipcRenderer.invoke<T>(channel, ...args);
  }

  setCockpitWebView(webviewElement: any) {
    this.webviewElement = webviewElement;
    // Legacy fallback: if the cockpit webview sends IPC messages via
    // console.log (old approach), pick them up here so nothing is lost.
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
    // Send through Electron IPC — the main process will forward to the
    // webview's webcontents, which delivers via webview-preload's
    // "IPCMessage" channel.  This replaces the old executeJavaScript hack.
    window.electron.ipcRenderer.send("IPCMessage", message);
  }
}
