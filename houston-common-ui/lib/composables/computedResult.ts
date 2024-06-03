import { ResultAsync, Result } from "neverthrow";
import { watchEffect, ref, type Ref } from "vue";

/**
 * Create a computed ref that grabs it's value from a {@link Result} or {@link ResultAsync},
 * returning computed ref and a manual update trigger function.
 * @param getter function that returns a result of T
 * @returns [reference: ComputedRef\<T | undefined\>, triggerUpdate: () => void]
 * 
 * @example
 * const path = ref("/tmp");
 * 
 * const listDirectory = () =>
 *  server.execute(new Command(["ls", path.value])).map((proc) => proc.getStdout().trim().split(RegexSnippets.newlineSplitter))
 * 
 * const [dirContents, refetchDirContents] = computedResult(listDirectory);
 * // dirContents automatically refreshes whenever path changes, or when refetchDirContents() is called
 * // dirContents.value is undefined until listDirectory() finishes
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
 * 
 * @example
 * const path = ref("/tmp");
 * 
 * const listDirectory = () =>
 *  server.execute(new Command(["ls", path.value])).map((proc) => proc.getStdout().trim().split(RegexSnippets.newlineSplitter))
 * 
 * const [dirContents, refetchDirContents] = computedResult(listDirectory, []);
 * // dirContents automatically refreshes whenever path changes, or when refetchDirContents() is called
 * // dirContents.value defaults to [] until listDirectory() finishes
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
