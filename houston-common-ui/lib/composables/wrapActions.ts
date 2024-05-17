import { ResultAsync } from "neverthrow";
import { globalProcessingWrapResult } from "@/composables/useGlobalProcessingState";
import { reportError } from "@/components/NotificationView.vue";

export type Action<TParams extends Array<any>, TOk, TErr extends Error> = (
  ..._: TParams
) => ResultAsync<TOk, TErr>;

/**
 * Make an action affect global processing state (loading spinners) and report errors as notifications
 * @param action
 * @returns
 */
export function wrapAction<TParams extends Array<any>, TOk, TErr extends Error>(
  action: Action<TParams, TOk, TErr>
) {
  return (...params: TParams) =>
    globalProcessingWrapResult(action)(...params).mapErr(reportError);
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
    Object.entries(actions).map(([funcName, func]) => [
      funcName,
      wrapAction(func),
    ])
  ) as Actions;
