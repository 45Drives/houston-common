
// type AnyDefined = {} | null;

// export type Ok<T> = {
//     value: T;
//     error: undefined;
// };

// export type Err<E extends AnyDefined> = {
//     value: undefined;
//     error: E;
// };

// export type Result<T, E extends AnyDefined> = Ok<T> | Err<E>;

// export function Ok<T>(something: T): Ok<T> {
//     return {
//         value: something,
//         error: undefined
//     };
// }

// export function Err<E extends AnyDefined>(error: E): Err<E> {
//     return {
//         value: undefined,
//         error: error
//     };
// }

// export function isError<T, E extends AnyDefined>(result: Result<T, E>): result is Err<E> {
//     return result.error !== null;
// }

// export function isOk<T, E extends AnyDefined>(result: Result<T, E>): result is Ok<T> {
//     return result.error === null;
// }
