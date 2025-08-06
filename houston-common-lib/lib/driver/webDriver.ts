
import { IHoustonDriver } from "@/driver/types";
import { factory as webProcessFactory } from "./webDriverProcess";

export function factory(): IHoustonDriver {
  const Process = webProcessFactory();

  const gettext = (...args: [string] | [string, string]) => args.at(-1)!;

  return {
    Process,
    downloadCommandOutputURL(..._: any[]) {
      throw new Error("Not implemented in browser");
    },
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    gettext,
  };
}
