import { IPCMessageRouterBackend } from "./IPCMessageRouterBackend";
import { IPCMessageRouterCockpit } from "./IPCMessageRouterCockpit";
import { IPCMessageRouterRenderer } from "./IPCMessageRouterRenderer";
import { IPCMessageRouter, IPCWebContentsLike, IPCMainLike } from "./types";

export class IPCRouter {
  private static instance: IPCMessageRouter | null = null;

  private constructor() {}

  public static initRenderer() {
    IPCRouter.instance = new IPCMessageRouterRenderer();
  }

  public static initBackend(webcontents: IPCWebContentsLike, ipcMain: IPCMainLike) {
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

