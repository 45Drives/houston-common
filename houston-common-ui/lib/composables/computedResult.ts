import { reportError } from "@/components/NotificationView.vue";
import { ResultAsync, Result, ok, okAsync } from "neverthrow";
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
  getter: () => Result<T, Error>
): [reference: Ref<T | undefined>, triggerUpdate: typeof getter];
export function computedResult<T>(
  getter: () => ResultAsync<T, Error>
): [reference: Ref<T | undefined>, triggerUpdate: typeof getter];
/**
 * Create a computed ref with default value that grabs it's value from a {@link Result} or {@link ResultAsync},
 * returning computed ref and a manual update trigger function.
 * @param getter function that returns a result of T
 * @param defaultValue the default value before the Result is determined
 * @returns [reference: ComputedRef\<T\>, triggerUpdate: typeof getter]
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
  getter: () => Result<T, Error>,
  defaultValue: T
): [reference: Ref<T>, triggerUpdate: typeof getter];
export function computedResult<T>(
  getter: () => ResultAsync<T, Error>,
  defaultValue: T
): [reference: Ref<T>, triggerUpdate: typeof getter];
export function computedResult<T>(
  getter: (() => Result<T, Error>) | (() => ResultAsync<T, Error>),
  defaultValue?: T
): [reference: Ref<T | undefined>, triggerUpdate: typeof getter] {
  const reference = ref<T>();
  reference.value = defaultValue;
  const triggerUpdate = () =>
    getter()
      .mapErr((e) => {
        reference.value = defaultValue;
        return e;
      })
      .map((v) => {
        return (reference.value = v);
      });
  watchEffect(() => triggerUpdate().mapErr(reportError));
  return [reference, triggerUpdate as typeof getter];
}
