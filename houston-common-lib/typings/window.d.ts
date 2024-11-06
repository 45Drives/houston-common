interface Window {
  reportHoustonError: <TErr extends Error | Error[]>(e: TErr, context: string = "") => TErr;
}
