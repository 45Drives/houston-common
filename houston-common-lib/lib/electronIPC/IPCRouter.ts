import { Ref } from "vue";
import { IPCMessageRouterBackend } from "./IPCMessageRouterBackend";
import { IPCMessageRouterCockpit } from "./IPCMessageRouterCockpit";
import { IPCMessageRouterRenderer } from "./IPCMessageRouterRenderer";
import { IPCMessageRouter } from "./types";

export class IPCRouter {
  private static instance: IPCMessageRouter | null = null;

  private constructor() {}

  public static initRenderer(webview: Ref<any>) {
    IPCRouter.instance = new IPCMessageRouterRenderer(webview);
  }

  public static initBackend(webcontents: Electron.WebContents, ipcMain: Electron.IpcMain) {
    IPCRouter.instance = new IPCMessageRouterBackend(webcontents, ipcMain);
  }

  public static initCockpit() {
    IPCRouter.instance = new IPCMessageRouterCockpit();
  }

  public static getInstance(): IPCMessageRouter {
    if (!IPCRouter.instance) {
      throw new Error("IPCRouter not initialized. Please call init before use.")
    }
    return IPCRouter.instance;
  }
}

