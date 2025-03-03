// global.d.ts
declare global {
  var reportHoustonError: <TErr extends Error | Error[]>(e: TErr, context: string = "") => TErr;
}

export {};
