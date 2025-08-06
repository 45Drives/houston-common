import { IHoustonDriver } from "@/driver/types";

export * from "./types";

import { factory as cockpitDriverFactory } from "@/driver/cockpitDriver";
import { factory as nodeDriverFactory } from "@/driver/nodeDriver";
import { factory as webDriverFactory } from "@/driver/webDriver";

function determineHoustonDriver(): IHoustonDriver {
  if ("cockpit" in window) {
    return cockpitDriverFactory();
  }
  if (typeof process === "object" && process.release?.name === "node") {
    return nodeDriverFactory();
  }
  return webDriverFactory();
}

export const HoustonDriver = determineHoustonDriver();
