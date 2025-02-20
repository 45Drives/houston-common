import { IHoustonDriver } from "@/driver/types";

export * from "./types";

import { HoustonDriverCockpit } from "@/driver/cockpitDriver";

function determineHoustonDriver(): IHoustonDriver {
  if ("cockpit" in window) {
    return HoustonDriverCockpit;
  }
  // if (typeof process === "object" && process.release?.name === "node") {
  //     return HoustonDriverNode;
  // }
  throw new Error("Unable to determine Houston driver!");
}

export const HoustonDriver = determineHoustonDriver();
