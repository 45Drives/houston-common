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
 * Make actions affect global processing state (loading spinners) and report errors as notifications
 * @param actions
 * @returns actions
 */
export const defineActions = <
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
