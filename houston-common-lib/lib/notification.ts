/** Notification passed to showNotification
 *
 * @typedef {Object} Notification
 * @property {string} title -  Header text
 * @property {string} body - Notification content
 * @property {string} level - 'info'|'warning'|'error'|'success'
 * @property {number} timeout - time to display notification
 * @property {function} addAction - add action to notification
 */

export interface INotification {
  addAction(
    label: string,
    callback: () => void | PromiseLike<void>,
    removesNotification?: boolean
  ): this;

  startRemoveTimeout(): void;

  stopRemoveTimeout(): void;
}

export type NotificationLevel = "info" | "warning" | "error" | "success" | "denied";

type pushNotificationFunction = (
     title: string,
  body: string,
  level?: NotificationLevel,
  timeout?: number | "never"
) => INotification;

declare global {
  var _pushNotificationBackend: pushNotificationFunction | undefined;
}

export const pushNotificationBackend = (...args: Parameters<pushNotificationFunction>) => {
  if (!globalThis._pushNotificationBackend) {
    throw new Error("No pushNotification backend registered");
  }
  return globalThis._pushNotificationBackend(...args);
}

