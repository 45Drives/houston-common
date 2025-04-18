<!--
Copyright (C) 2022 Josh Boudreau <jboudreau@45drives.com>

This file is part of Cockpit File Sharing.

Cockpit File Sharing is free software: you can redistribute it and/or modify it under the terms
of the GNU General Public License as published by the Free Software Foundation, either version 3
of the License, or (at your option) any later version.

Cockpit File Sharing is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with Cockpit File Sharing.
If not, see <https://www.gnu.org/licenses/>. 
-->

<script lang="ts">
import { ref, reactive, computed, type ComputedRef } from "vue";
import {
  InformationCircleIcon,
  ExclamationCircleIcon,
  MinusCircleIcon,
  CheckCircleIcon,
} from "@heroicons/vue/24/outline";
import { XMarkIcon } from "@heroicons/vue/20/solid";
import { SilentError, HoustonDriver } from "@45drives/houston-common-lib";

const _ = HoustonDriver.gettext;

/** Notification passed to showNotification
 *
 * @typedef {Object} Notification
 * @property {string} title -  Header text
 * @property {string} body - Notification content
 * @property {string} level - 'info'|'warning'|'error'|'success'
 * @property {number} timeout - time to display notification
 * @property {function} addAction - add action to notification
 */

interface NotificationAction {
  key: symbol;
  label: string;
  callback: () => void;
  processing: boolean;
}

export type NotificationLevel = "info" | "warning" | "error" | "success" | "denied";

export class Notification {
  public readonly title: string;
  public readonly body: string;
  public readonly level: NotificationLevel;
  public readonly timeout: number | "never";
  public readonly actions: NotificationAction[];
  public readonly key: symbol;
  public remove: () => void;
  public removerTimeout?: number;
  private removerStartTime?: number;
  public timeLeftPercent: number;
  public timeLeftUpdaterInterval?: number;
  constructor(
    title: string,
    body: string,
    level: NotificationLevel = "info",
    timeout: number | "never" = 10_000
  ) {
    this.title = title;
    this.body = body;
    this.level = level;
    this.timeout = timeout;
    this.actions = [];
    this.key = Symbol();
    this.remove = () => {};
    this.timeLeftPercent = 0;
  }

  addAction(
    label: string,
    callback: () => void | PromiseLike<void>,
    removesNotification: boolean = true
  ): this {
    const action = reactive<NotificationAction>({
      key: Symbol(),
      label,
      callback: async () => {
        action.processing = true;
        await callback();
        action.processing = false;
        if (removesNotification) {
          this.remove();
        }
      },
      processing: false,
    });
    this.actions.push(action);
    return this;
  }

  startRemoveTimeout() {
    if (this.timeout !== "never") {
      this.removerStartTime = Date.now();
      this.timeLeftUpdaterInterval = window.setInterval(() => {
        if (this.removerStartTime === undefined || this.timeout === "never") {
          return;
        }
        this.timeLeftPercent = 100 - ((Date.now() - this.removerStartTime) / this.timeout) * 100;
      }, 1000 / 60);
      this.removerTimeout = window.setTimeout(() => this.remove(), this.timeout);
    }
  }

  stopRemoveTimeout() {
    if (this.removerTimeout !== undefined) {
      this.removerStartTime = undefined;
      this.timeLeftPercent = 100;
      window.clearTimeout(this.removerTimeout);
      window.clearTimeout(this.timeLeftUpdaterInterval);
    }
  }
}

const notificationList = ref<Notification[]>([]);

/**
 * Push a notification
 *
 * @example
 * ```ts
 * pushNotification(new Notification("Test Notification", "Hello, world!"));
 * pushNotification(new Notification("Question", "Would you like to nuke your system?")
 *      .addAction("Yes", () =>
 *          server.execute(new Command(["rm", "-rf", "/"]))));
 * ```
 * @param notif Notification to show
 */
export function pushNotification(notif: Notification): Notification {
  notif = reactive(notif);
  notif.startRemoveTimeout();
  notif.remove = () => {
    notif.stopRemoveTimeout();
    notificationList.value = notificationList.value.filter((n) => n.key !== notif.key);
  };
  notificationList.value = [notif, ...notificationList.value];
  return notif;
}

/**
 * Push a notification reporting the given error. To be used with {@link Result.mapErr}.
 * @param e Error to report
 *
 * @example
 * ```ts
 * server.execute(new Command(["false"])).mapError(reportError);
 * ```
 */
export function reportError<TErr extends Error | Error[]>(e: TErr, context: string = ""): TErr {
  if (Array.isArray(e)) {
    return e.map((e) => reportError(e)) as TErr;
  }
  console.error(context, e);
  if (!(e instanceof SilentError)) {
    pushNotification(
      new Notification(_(e.name), [context, e.message].join("\n").trim(), "error", 20_000)
    );
  }
  return e;
}

export function reportSuccess(message: string = "") {
  pushNotification(new Notification(_("Success"), message, "success"));
}

export default {
  setup() {
    return {
      notificationList,
      _: HoustonDriver.gettext,
    };
  },
  components: {
    InformationCircleIcon,
    ExclamationCircleIcon,
    MinusCircleIcon,
    CheckCircleIcon,
    XMarkIcon,
  },
};
</script>

<template>
  <Teleport to="body" :disabled="$slots.default !== undefined">
    <div :class="$slots.default ? 'relative' : 'fixed z-20'">
      <slot></slot>
      <div
        aria-live="assertive"
        class="inset-0 flex items-end px-4 py-6 pointer-events-none sm:p-6 sm:items-start z-20 overflow-y-auto"
        :class="$slots.default ? 'absolute' : 'fixed h-screen'"
      >
        <transition-group
          tag="div"
          class="w-full flex flex-col-reverse items-center sm:items-end sm:flex-col space-y-content"
          enter-active-class="transition-all transform ease-out duration-300"
          enter-from-class="translate-y-8 opacity-0 scale-95 sm:translate-y-0 sm:translate-x-8"
          enter-to-class="translate-y-0 opacity-100 scale-100 sm:translate-x-0"
          leave-active-class="transition-all transform ease-in duration-100"
          leave-from-class="opacity-100 scale-100 sm:translate-x-0"
          leave-to-class="opacity-0 scale-95 sm:translate-x-8"
        >
          <div
            v-for="notification in notificationList"
            :key="notification.key"
            class="max-w-sm w-full shadow-lg pointer-events-auto overflow-hidden bg-default text-default"
            @mouseenter="notification.stopRemoveTimeout()"
            @mouseleave="notification.startRemoveTimeout()"
          >
            <div>
              <div class="flex items-start p-4">
                <div class="flex-shrink-0" aria-hidden="true">
                  <ExclamationCircleIcon
                    v-if="notification.level === 'error'"
                    class="icon-error size-icon-lg"
                    aria-hidden="true"
                  />
                  <ExclamationCircleIcon
                    v-else-if="notification.level === 'warning'"
                    class="icon-warning size-icon-lg"
                    aria-hidden="true"
                  />
                  <CheckCircleIcon
                    v-else-if="notification.level === 'success'"
                    class="icon-success size-icon-lg"
                    aria-hidden="true"
                  />
                  <MinusCircleIcon
                    v-else-if="notification.level === 'denied'"
                    class="icon-error size-icon-lg"
                    aria-hidden="true"
                  />
                  <InformationCircleIcon v-else class="icon-info size-icon-lg" />
                </div>
                <div class="ml-3 w-0 flex-1 pt-0.5">
                  <p class="text-sm font-medium">{{ notification.title }}</p>
                  <p
                    class="mt-1 text-sm text-muted whitespace-pre-wrap"
                    v-html="notification.body"
                  ></p>
                  <div v-if="notification.actions?.length" class="mt-3 flex space-x-7">
                    <button
                      v-for="action in notification.actions"
                      :key="action.key"
                      @click="action.callback()"
                      class="rounded-md text-sm font-medium"
                      :class="action.processing ? 'text-muted cursor-wait' : 'text-primary'"
                      :disabled="action.processing"
                    >
                      {{ action.label }}
                    </button>
                    <button
                      @click="notification.remove()"
                      type="button"
                      class="rounded-md text-sm font-medium text-secondary"
                    >
                      {{ _("Dismiss") }}
                    </button>
                  </div>
                </div>
                <div class="ml-4 flex-shrink-0 flex">
                  <button @click="notification.remove()" class="icon-default">
                    <span class="sr-only">Close</span>
                    <XMarkIcon class="size-icon" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div class="flex justify-end">
                <div
                  v-if="notification.timeout !== 'never'"
                  class="border-t-4 border-default"
                  :style="{ width: `${notification.timeLeftPercent}%` }"
                />
              </div>
            </div>
          </div>
        </transition-group>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
