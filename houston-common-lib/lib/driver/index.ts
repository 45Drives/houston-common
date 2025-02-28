import { IHoustonDriver } from "@/driver/types";

export * from "./types";

import { factory as cockpitDriverFactory } from "@/driver/cockpitDriver";
import { factory as nodeDriverFactory } from "@/driver/nodeDriver";
import { factory as stubDriverFactory } from "@/driver/stubDriver";

function determineHoustonDriver(): IHoustonDriver {
  if (typeof window !== "undefined") {
    if ("cockpit" in window) {
      return cockpitDriverFactory();
    }
  }
  if (typeof process === "object" && process.release?.name === "node") {
    return nodeDriverFactory();
  }

  // throw new Error("Unable to determine Houston driver!");
  return stubDriverFactory();
}

export const HoustonDriver = determineHoustonDriver();
