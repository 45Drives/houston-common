import { type ConfirmOptions } from "@/components/modals";
import { ResultAsync } from "neverthrow";
import { type Action } from "@/composables/wrapActions";
import { ref } from "vue";

export type GlobalModalConfirmFunctions = {
  confirm: (options: ConfirmOptions) => ResultAsync<boolean, never>;
  confirmBeforeAction: (
    options: ConfirmOptions,
    action: Action<any, any, any>
  ) => typeof action;
  assertConfirm: (
    options: ConfirmOptions,
    resultIfConfirmed?: unknown
  ) => ResultAsync<typeof resultIfConfirmed, Error>;
};

const globalModalConfirmFuncs = ref<GlobalModalConfirmFunctions>();

export namespace _internal {
  export const provideGlobalModalFuncs = (
    funcs: GlobalModalConfirmFunctions
  ) => {
    globalModalConfirmFuncs.value = funcs;
  };
}

const getGlobalModalConfirmFuncs = () => {
  if (globalModalConfirmFuncs.value === undefined) {
    throw new Error("Global ModalConfirm methods not provided!");
  }
  return globalModalConfirmFuncs.value;
};

export const confirm = (
  ...args: Parameters<GlobalModalConfirmFunctions["confirm"]>
): ReturnType<GlobalModalConfirmFunctions["confirm"]> =>
  getGlobalModalConfirmFuncs().confirm(...args);
export const confirmBeforeAction = (
  ...args: Parameters<GlobalModalConfirmFunctions["confirmBeforeAction"]>
): ReturnType<GlobalModalConfirmFunctions["confirmBeforeAction"]> =>
  getGlobalModalConfirmFuncs().confirmBeforeAction(...args);
export const assertConfirm = (
  ...args: Parameters<GlobalModalConfirmFunctions["assertConfirm"]>
): ReturnType<GlobalModalConfirmFunctions["assertConfirm"]> =>
  getGlobalModalConfirmFuncs().assertConfirm(...args);
