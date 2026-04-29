import { IPCMessageRouter, IPCMessageTypes, IPCMessage, isIPCMessage } from "./types";

/**
 * IPC router for code running inside a Cockpit webview.
 *
 * Communication with the Electron host is limited by the webview sandbox.
 * The only reliable outbound path is `window.electron.ipcRenderer.send("IPCMessage")`
 * which is exposed by webview-preload.js.  Inbound messages arrive via the
 * same "IPCMessage" channel through `window.electron.ipcRenderer.on`.
 *
 * If the webview preload is not loaded (e.g. running in a normal Cockpit
 * browser context), the forward methods will warn and no-op.
 */
export class IPCMessageRouterCockpit<
  MessageTypes extends Record<string, any> = IPCMessageTypes,
> extends IPCMessageRouter<MessageTypes> {
  private hasElectronBridge: boolean;

  constructor() {
    super("cockpit");

    this.hasElectronBridge =
      typeof window !== "undefined" &&
      typeof (window as any).electron?.ipcRenderer?.send === "function";

    if (this.hasElectronBridge) {
      // Listen for messages forwarded from the Electron host
      (window as any).electron.ipcRenderer.on("IPCMessage", (_event: any, raw: any) => {
        let message = raw;
        try {
          if (typeof message === "string") message = JSON.parse(message);
        } catch { /* not JSON, ignore */ }

        if (!isIPCMessage<MessageTypes>(message)) return;
        this.routeMessage(message);
      });
    }
  }

  protected forwardToBackend<
    T extends keyof MessageTypes,
    TMessage extends IPCMessage<MessageTypes, T>,
  >(message: TMessage): void {
    if (!this.hasElectronBridge) {
      // Fallback: relay via console.log so the Electron renderer's
      // console-message listener on the <webview> element can pick it up.
      console.log(JSON.stringify(message));
      return;
    }
    (window as any).electron.ipcRenderer.send("IPCMessage", message);
  }

  protected forwardToRenderer<
    T extends keyof MessageTypes,
    TMessage extends IPCMessage<MessageTypes, T>,
  >(message: TMessage): void {
    // In the webview context, "renderer" means the Electron renderer process.
    // Route through the same IPC channel — the Electron main process will
    // forward it to the renderer's webcontents.
    if (!this.hasElectronBridge) {
      // Fallback: relay via console.log so the Electron renderer's
      // console-message listener on the <webview> element can pick it up.
      console.log(JSON.stringify(message));
      return;
    }
    (window as any).electron.ipcRenderer.send("IPCMessage", message);
  }

  protected forwardToCockpit<
    T extends keyof MessageTypes,
    TMessage extends IPCMessage<MessageTypes, T>,
  >(_message: TMessage): void {
    // Cockpit → Cockpit: deliver locally
    throw new Error("Cockpit-to-Cockpit forwarding is not applicable");
  }
}
