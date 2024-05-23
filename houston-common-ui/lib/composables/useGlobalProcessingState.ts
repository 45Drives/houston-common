import { ref } from "vue";
import { ResultAsync } from "neverthrow";

const globalProcessingState = ref(0);

export const globalProcessingWrapPromise = <T>(
  promise: Promise<T>
): Promise<T> => {
  globalProcessingState.value++;
  promise.finally(() => globalProcessingState.value--);
  return promise;
};

export const globalProcessingWrapResult =
  <TParams extends Array<any>, TOk, TErr>(func: (..._: TParams) => ResultAsync<TOk, TErr>): typeof func =>
  (...params: TParams) => {
    globalProcessingState.value++;
    return func(...params)
      .map((v) => {
        globalProcessingState.value--;
        return v;
      })
      .mapErr((e) => {
        globalProcessingState.value--;
        return e;
      });
  };

export function useGlobalProcessingState() {
  return globalProcessingState;
}
