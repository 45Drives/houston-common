import { KeyValueData } from "@/syntax";
import { Maybe, None, Some } from "monet";
import { Result } from "neverthrow";

export type ValueElseUndefiend<T> = T extends
  | string
  | number
  | boolean
  | symbol
  | object
  ? T
  : undefined;

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
  Container extends { unwrap: () => any } | { some: () => any },
>(exceptionFactory: (e?: any) => Error = (e) => e) {
  return (c: Container) => {
    try {
      return "unwrap" in c ? c.unwrap() : c.some();
    } catch (e) {
      throw exceptionFactory(e);
    }
  };
}

export function UnwrapperOr<
  Container extends { unwrapOr: (...args: any[]) => any },
  TParams extends Parameters<Container["unwrapOr"]>,
  Ret extends ReturnType<Container["unwrapOr"]>,
>(...args: TParams) {
  return (c: Container): Ret => c.unwrapOr(...args);
}

export type Caster<In extends {}, Out extends {}> = (input: In) => Maybe<Out>;

export const IdentityCaster =
  <T extends {}>(): Caster<T, T> =>
  (o: T) =>
    Some(o);

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
    Maybe.fromNull(
      truthyWords.includes(text)
        ? true
        : falsyWords.includes(text)
          ? false
          : null
    );
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

export function StringToIntCaster(radix?: number): Caster<string, number> {
  return (str) => {
    const val = parseInt(str, radix);
    return isNaN(val) ? None() : Some(val);
  };
}

export function IntToStringCaster(radix?: number): Caster<number, string> {
  const functor = MethodFunctor(Number, "toString", radix);
  return (num) => (isNaN(num) ? None() : Some(functor(num)));
}

export type KVMapper<
  InKey extends string | number | symbol,
  InValue extends {} | null,
  OutKey extends string | number | symbol,
  OutValue extends {} | null,
> = Caster<[InKey, InValue], [OutKey, OutValue]>;

export function KVMapper<
  InKeys extends [string | number | symbol, ...(string | number | symbol)[]],
  InValue extends {},
  OutKey extends string | number | symbol,
  OutValue extends {},
>(
  inKeys: InKeys,
  outKey: OutKey,
  caster: Caster<InValue, OutValue>
): KVMapper<InKeys[number], InValue, OutKey, OutValue> {
  return ([inKey, inValue]) =>
    inKeys.includes(inKey)
      ? caster(inValue).map((outValue) => [outKey, outValue])
      : None();
}

export type KVGrabber<
  InKey extends string | number | symbol,
  InValue extends {} | null,
> = ([key, value]: [InKey, InValue]) => boolean;

export function KVGrabber<
  InKeys extends [string | number | symbol, ...(string | number | symbol)[]],
  InValue extends {},
  TObj extends {
    [Key in OutKey]: {};
  },
  OutKey extends keyof TObj,
  OutValue extends TObj[OutKey],
>(
  obj: Partial<TObj>,
  destinationKey: OutKey,
  sourceKeys: InKeys,
  caster: Caster<InValue, OutValue>,
  duplicateBehaviour: "overwrite" | "ignore" = "overwrite"
): KVGrabber<InKeys[number], InValue> {
  const mapper = KVMapper(sourceKeys, destinationKey, caster);
  return (kv) =>
    mapper(kv)
      .map(([key, value]) => {
        if (duplicateBehaviour === "overwrite" || obj[key] === undefined) {
          obj[key] = value;
        }
        return true;
      })
      .orSome(false);
}

export function KVRemainderGrabber<
  InKey extends string | number | symbol,
  InValue extends TObj[OutKey][InKey] & ({} | null),
  TObj extends { [key in OutKey]: { [key in InKey]: InValue } },
  OutKey extends keyof TObj,
>(obj: TObj, destinationKey: OutKey): KVGrabber<InKey, InValue> {
  return ([key, value]) => {
    obj[destinationKey][key] = value;
    return true;
  };
}

export function KVGrabberCollection<InKeys extends string | number | symbol>(
  grabbers: KVGrabber<InKeys, any>[]
): KVGrabber<InKeys, any> {
  return ([key, value]) => grabbers.some((g) => g([key, value]));
}

export type KeyValueDiff = {
  added: KeyValueData;
  removed: KeyValueData;
  changed: KeyValueData;
  same: KeyValueData;
};

export function keyValueDiff(
  originalObj: KeyValueData,
  modifiedObj: KeyValueData
) {
  const added: KeyValueData = {};
  const removed: KeyValueData = {};
  const changed: KeyValueData = {};
  const same: KeyValueData = {};
  for (const [key, value] of Object.entries(modifiedObj)) {
    if (key in originalObj) {
      if (value !== originalObj[key]) {
        changed[key] = value;
      } else {
        same[key] = value;
      }
    } else {
      added[key] = value;
    }
  }
  for (const [key, value] of Object.entries(originalObj)) {
    if (!(key in modifiedObj)) {
      removed[key] = value;
    }
  }
  return {
    added,
    removed,
    changed,
    same,
  };
}

export const safeJsonParse = <T = any>(...args: Parameters<typeof JSON.parse>) =>
  Result.fromThrowable(
    (...args: Parameters<typeof JSON.parse>) => JSON.parse(...args) as Partial<T>,
    (e) => (e instanceof SyntaxError ? e : new SyntaxError(`${e}`))
  )(...args);
