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

if (typeof window !== 'undefined') {
  // Only run this in the renderer process (browser environment)
  window.reportHoustonError = reportError
} else if (typeof globalThis !== 'undefined') {
  // Fallback for main process (Node.js environment)
  global.reportHoustonError = reportError
}