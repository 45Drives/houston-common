import { type ConfirmOptions } from "@/components/modals";
import { ResultAsync, okAsync } from "neverthrow";
import { type Action } from "@/composables/wrapActions";
import { ref } from "vue";
import { type CancelledByUser, type ValueElseUndefiend } from "@45drives/houston-common-lib";

export type GlobalModalConfirmFunctions = {
  confirm: (options: ConfirmOptions) => ResultAsync<boolean, never>;
  assertConfirm: <T>(
    options: ConfirmOptions,
    resultIfConfirmed?: T
  ) => ResultAsync<ValueElseUndefiend<T>, CancelledByUser>;
};

// const globalModalConfirmFuncs = ref<GlobalModalConfirmFunctions>();

let globalModalConfirmFuncsPromiseResolver: (funcs: GlobalModalConfirmFunctions) => void;

const globalModalConfirmFuncsPromise = new Promise<GlobalModalConfirmFunctions>(
  (resolve) => (globalModalConfirmFuncsPromiseResolver = resolve)
);

export namespace _internal {
  export const provideGlobalModalFuncs = (funcs: GlobalModalConfirmFunctions) => {
    globalModalConfirmFuncsPromiseResolver(funcs);
    // globalModalConfirmFuncs.value = funcs;
  };
}

const getGlobalModalConfirmFuncs = () => {
  // if (globalModalConfirmFuncs.value === undefined) {
  //   throw new Error("Global ModalConfirm methods not provided!");
  // }
  // return globalModalConfirmFuncs.value;
  return ResultAsync.fromSafePromise(globalModalConfirmFuncsPromise);
};

export const confirm = (
  ...args: Parameters<GlobalModalConfirmFunctions["confirm"]>
): ReturnType<GlobalModalConfirmFunctions["confirm"]> =>
  getGlobalModalConfirmFuncs().andThen(({ confirm }) => confirm(...args));
export const assertConfirm = (
  ...args: Parameters<GlobalModalConfirmFunctions["assertConfirm"]>
): ReturnType<GlobalModalConfirmFunctions["assertConfirm"]> =>
  getGlobalModalConfirmFuncs().andThen(({ assertConfirm }) => assertConfirm(...args));
export function confirmBeforeAction<TArgs extends any[], TOk, TErr extends Error>(
  options: ConfirmOptions,
  action: Action<TArgs, TOk, TErr>
) {
  return (...args: TArgs): ResultAsync<TOk, TErr | CancelledByUser> =>
    getGlobalModalConfirmFuncs().andThen(({ assertConfirm }) =>
      assertConfirm(options).andThen(() => action(...args))
    );
}
