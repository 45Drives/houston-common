import { Option, Some, None } from "@thames/monads";

export type MethodFunctor<T extends {}, R> = (v: T) => R;
export function MethodFunctor<
  T extends { [P in TMethod]: (..._: any[]) => any },
  TMethod extends keyof T,
  TParams extends Parameters<T[TMethod]>,
>(
  _ctor: (..._: any[]) => T | (new (..._: any[]) => T),
  method: TMethod,
  ...args: TParams
): MethodFunctor<T, ReturnType<T[TMethod]>> {
  return (obj: T) => obj[method](...args);
}

export const IdentityFunctor = <T>(o: T): T => o;

export function Unwrapper<
  Container extends { unwrap: () => any },
  Ret extends ReturnType<Container["unwrap"]>
>(exceptionFactory: (e?: any) => Error = (e) => e) {
  return (c: Container): Ret => {
    try {
      return c.unwrap();
    } catch (e) {
      throw exceptionFactory(e);
    }
  }
}

export function UnwrapperOr<
  Container extends { unwrapOr: (...args: any[]) => any },
  TParams extends Parameters<Container["unwrapOr"]>,
  Ret extends ReturnType<Container["unwrapOr"]>,
>(...args: TParams) {
  return (c: Container): Ret => c.unwrapOr(...args);
}

export type Caster<In extends {} | null, Out extends {} | null> = (
  input: In
) => Option<Out>;
export function StringToBooleanCaster(
  opts: {
    truthyWords?: string[];
    falsyWords?: string[];
    ignoreCase?: boolean;
  } = {}
): Caster<string, boolean> {
  const ignoreCase = opts.ignoreCase ?? true;
  const truthyWords = (opts.truthyWords ?? ["true", "yes", "1"]).map(
    ignoreCase ? MethodFunctor(String, "toLowerCase") : IdentityFunctor
  );
  const falsyWords = (opts.falsyWords ?? ["false", "no", "0"]).map(
    ignoreCase ? MethodFunctor(String, "toLowerCase") : IdentityFunctor
  );
  const caster = (text: string) =>
    truthyWords.includes(text)
      ? Some(true)
      : falsyWords.includes(text)
        ? Some(false)
        : None;
  if (ignoreCase) {
    return (text: string) => caster(text.toLowerCase());
  }
  return caster;
}

export function BooleanToStringCaster<
  TruthyWord extends string,
  FalsyWord extends string,
>(
  truthyWord: TruthyWord,
  falsyWord: FalsyWord
): Caster<boolean, TruthyWord | FalsyWord> {
  return (b) => Some(b ? truthyWord : falsyWord);
}

export type KVProcessor = ([key, value]: [string, string]) => boolean;
