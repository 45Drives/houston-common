import { pushNotification, Notification } from "@/.";

export function useHint(header: string, body: string) {
  const key = `houston-hint-disable-${globalThis.btoa(header + body)}`;
  if (globalThis.localStorage.getItem(key)) return;
  const n = new Notification(header, body, "info", 30_000).addAction("Don't show again", () =>
    globalThis.localStorage.setItem(key, "1")
  );
  pushNotification(n);
  return n;
}
