import { IHoustonDriver } from "@/driver/types";

import { factory as linuxProcessFactory } from "./nodeDriverLinuxProcess";

export function factory(): IHoustonDriver {
  const localstorage = require("node-localstorage") as typeof import("node-localstorage");
  const fs = require("fs") as typeof import("fs");
  const os = require("os") as typeof import("os");
  const path = require("path") as typeof import("path");

  let Process: IHoustonDriver["Process"];

  switch (process.platform) {
    case "linux":
      Process = linuxProcessFactory();
      break;
    default:
      throw new Error("No Process implementation for platform " + process.platform);
  }

  const datadir = path.join(os.homedir(), ".houston");
  if (!fs.existsSync(datadir)) {
    fs.mkdirSync(datadir, { mode: 0o700 });
  }
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "houston"));
  const cleanup = () => {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  };
  process.on("exit", cleanup);

  // cleanup for tests, for some reason "exit" is never triggered
  import("vitest").then((vitest) => {
    vitest.afterAll(() => {
      cleanup();
    });
  });

  const gettext = (...args: [string] | [string, string]) => args.at(-1)!;
  const localStorage = new localstorage.LocalStorage(path.join(datadir, "localStorage"));
  const sessionStorage = new localstorage.LocalStorage(path.join(tmpdir, "sessionStorage"));

  return {
    Process,
    downloadCommandOutputURL(..._: any[]) {
      throw new Error("not implemented");
    },
    localStorage,
    sessionStorage,
    gettext,
  };
}
