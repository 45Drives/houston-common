export * from "@/components";
export * from "@/composables";

import { reportError } from ".";

window.onerror = (event) => {
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
