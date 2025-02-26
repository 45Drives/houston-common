import { IHoustonDriver } from "@/driver/types";

export * from "./types";

import { factory as cockpitDriverFactory } from "@/driver/cockpitDriver";
import { factory as nodeDriverFactory } from "@/driver/nodeDriver";

function determineHoustonDriver(): IHoustonDriver {
  if (typeof window !== "undefined") {
    if ("cockpit" in window) {
      return cockpitDriverFactory();
    }
  }
  if (typeof process === "object" && process.release?.name === "node") {
    return nodeDriverFactory();
  }
  throw new Error("Unable to determine Houston driver!");
}

export const HoustonDriver = determineHoustonDriver();
