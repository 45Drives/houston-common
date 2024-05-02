import { ref } from "vue";

const globalProcessingState = ref(0);

export function useGlobalProcessingState() {
  const incrementGlobalProcessingState = () => {
    globalProcessingState.value++;
  };
  const decrementGlobalProcessingState = () => {
    globalProcessingState.value--;
  };
  const globalProcessingWrapPromise = <T>(promise: Promise<T>): Promise<T> => {
    globalProcessingState.value++;
    promise.finally(() => globalProcessingState.value--);
    return promise;
  };
  return {
    globalProcessingState,
    incrementGlobalProcessingState,
    decrementGlobalProcessingState,
    globalProcessingWrapPromise,
  };
}
