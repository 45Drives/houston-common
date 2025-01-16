import { Result, ResultAsync } from "neverthrow";

/**
 * 
 * @param result Result to unwrap
 * @returns 
 */
export function unwrap<T, E extends Error>(result: Result<T, E> | ResultAsync<T, E>): Promise<T> {
  return Promise.resolve(result).then((result) =>
    result.match(
      (okValue) => Promise.resolve(okValue),
      (errValue) => Promise.reject(errValue)
    )
  );
}
