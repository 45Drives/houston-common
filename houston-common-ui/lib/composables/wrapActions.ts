import { ResultAsync } from "neverthrow";
import { globalProcessingWrapResult } from "@/composables/useGlobalProcessingState";
import { reportError } from "@/components/NotificationView.vue";
import { ref, reactive, type Ref, watchEffect } from "vue";

export type Action<TParams extends Array<any>, TOk, TErr extends Error> = (
  ..._: TParams
) => ResultAsync<TOk, TErr>;

export type WrappedAction<TParams extends Array<any>, TOk, TErr extends Error> = Action<
  TParams,
  TOk,
  TErr
> & {
  /**
   * Tracks whether the action is executing
   */
  processing: Ref<boolean>;
};

export type WrappedActions<
  Actions extends {
    [action: string]: Action<any, any, any>;
  },
> = {
  [Prop in keyof Actions]: Actions[Prop] extends Action<infer TParams, infer TOk, infer TErr>
    ? WrappedAction<TParams, TOk, TErr>
    : never;
};

/**
 * Make an action affect global processing state (loading spinners) and report errors as notifications
 * @param action
 * @returns
 */
export function wrapAction<TParams extends Array<any>, TOk, TErr extends Error>(
  action: Action<TParams, TOk, TErr>
): WrappedAction<TParams, TOk, TErr> {
  const wrappedAction = (...params: TParams) => {
    wrappedAction.processing.value = true;
    return globalProcessingWrapResult(action)(...params)
      .map((r: TOk) => {
        wrappedAction.processing.value = false;
        return r;
      })
      .mapErr((e) => {
        wrappedAction.processing.value = false;
        e.message = `Error in ${action.name}: ${e.message}`;
        return reportError(e);
      });
  };
  wrappedAction.processing = ref(false);
  Object.defineProperty(wrappedAction, "name", {
    value: `${action.name} (wrapped)`,
    writable: false,
  });
  return wrappedAction;
}

/**
 * Transparently make actions provide feedback to the user.
 * i.e. affect global processing state (loading spinners) and report errors as notifications.
 *
 * @param actions
 * @returns actions
 *
 * @example
 * ```html
 * <script setup lang="ts">
 * import { getServer } from "@45drives/houston-common-lib";
 * import { wrapActions } from "@45drives/houston-common-ui";
 * import { ref, onMounted } from "vue";
 *
 * const settings = ref<Settings>();
 *
 * const loadSettings = () =>
 *    getServer().andThen(loadSettingsFromServer).map(s => settings.value = s);
 *
 * const updateSettings = (settings) =>
 *    getServer()
 *      .andThen(server => updateSettingsOnServer(server, settings))
 *      .andThen(loadSettings);
 *
 * const actions = wrapActions({
 *    loadSettings,
 *    updateSettings,
 * });
 *
 * onMounted(() => actions.loadSettings());
 *
 * // call actions.loadSettings() and actions.updateSettings(settings) when you want user feedback
 * // plain non-wrapped loadSettings() and updateSettings(settings) still available to call from other actions
 * </script>
 *
 * <template>
 *  <button @click="actions.updateSettings(settings)">Apply</button>
 * </template>
 * ```
 */
export const wrapActions = <
  Actions extends {
    [action: string]: Action<any, any, any>;
  },
>(
  actions: Actions
) =>
  Object.fromEntries(
    Object.entries(actions).map(([funcName, func]) => [funcName, wrapAction(func)])
  ) as WrappedActions<Actions>;

export function wrapPromise<TParams extends Array<any>, TResult>(
  func: (..._: TParams) => PromiseLike<TResult>
): WrappedAction<TParams, TResult, Error> {
  return wrapAction((...args: TParams) =>
    ResultAsync.fromPromise(func(...args), (e) =>
      e instanceof Error ? e : new Error(`unknown error: ${e}`)
    )
  );
}
