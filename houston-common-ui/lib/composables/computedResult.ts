import { ResultAsync, Result } from "neverthrow";
import { watchEffect, ref, type Ref } from "vue";

/**
 * Create a computed ref that grabs it's value from a {@link Result} or {@link ResultAsync},
 * returning computed ref and a manual update trigger function.
 * @param getter function that returns a result of T
 * @returns [reference: ComputedRef\<T | undefined\>, triggerUpdate: () => void]
 */
export function computedResult<T>(
  getter: () => Result<T, any> | ResultAsync<T, any>
): [reference: Readonly<Ref<T | undefined>>, triggerUpdate: () => void];
/**
 * Create a computed ref with default value that grabs it's value from a {@link Result} or {@link ResultAsync},
 * returning computed ref and a manual update trigger function.
 * @param getter function that returns a result of T
 * @param defaultValue the default value before the Result is determined
 * @returns [reference: ComputedRef\<T\>, triggerUpdate: () => void]
 */
export function computedResult<T>(
  getter: () => Result<T, any> | ResultAsync<T, any>,
  defaultValue: T
): [reference: Readonly<Ref<T>>, triggerUpdate: () => void];
export function computedResult<T>(
  getter: () => Result<T, any> | ResultAsync<T, any>,
  defaultValue?: T
): [reference: Readonly<Ref<T | undefined>>, triggerUpdate: () => void] {
  const reference = ref<T>();
  reference.value = defaultValue;
  const triggerUpdate = () => getter().map((v) => (reference.value = v));
  watchEffect(triggerUpdate);
  return [reference, triggerUpdate];
}
