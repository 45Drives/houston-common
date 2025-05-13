export * from "@/components";
export * from "@/composables";
export * from "@/directives";

import { reportError } from ".";

globalThis.onerror = (event) => {
  if (typeof event === "string") {
    reportError(new Error(event));
  } else {
    const errorEvent = event as ErrorEvent;
    reportError(
      new Error(
        `${errorEvent.filename}:${errorEvent.lineno}:${errorEvent.colno}: ${errorEvent.message}`
      )
    );
  }
  return false;
};

(globalThis as any).reportHoustonError = reportError;
