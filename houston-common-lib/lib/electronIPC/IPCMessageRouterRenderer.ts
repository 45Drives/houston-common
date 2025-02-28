import { Ref, watch } from "vue";
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
  constructor(private webviewElement: Ref<any>) {
    super("renderer");

    // set up event listeners here to call this.routeMessage when message received

    watch(webviewElement, () => {
      
      // from cockpit to renderer
      if (this.webviewElement.value) {

        this.webviewElement.value.addEventListener("console-message", (event: any) => {
          const message = JSON.parse(event.message);
          if (!isIPCMessage<MessageTypes>(message)) {
            return;
          }
          this.routeMessage(message);
        });

      }
    });
    
    
    // from backend to renderer
    window.electron.ipcRenderer.on("IPCMessage", (message: any) => {
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
