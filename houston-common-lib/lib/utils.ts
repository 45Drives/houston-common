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
  Ret extends ReturnType<Container["unwrap"]>,
>(exceptionFactory: (e?: any) => Error = (e) => e) {
  return (c: Container): Ret => {
    try {
      return c.unwrap();
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

export type Caster<In extends {} | null, Out extends {} | null> = (
  input: In
) => Option<Out>;

export const IdentityCaster =
  <T extends {} | null>(): Caster<T, T> =>
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

export function StringToIntCaster(radix?: number): Caster<string, number> {
  return (str) => {
    const val = parseInt(str, radix);
    return isNaN(val) ? None : Some(val);
  };
}

export function IntToStringCaster(radix?: number): Caster<number, string> {
  const functor = MethodFunctor(Number, "toString", radix);
  return (num) => (isNaN(num) ? None : Some(functor(num)));
}

export type KVMapper<
  InKey extends string | number | symbol,
  InValue extends {} | null,
  OutKey extends string | number | symbol,
  OutValue extends {} | null,
> = Caster<[InKey, InValue], [OutKey, OutValue]>;

export function KVMapper<
  InKeys extends [string | number | symbol, ...(string | number | symbol)[]],
  InValue extends {} | null,
  OutKey extends string | number | symbol,
  OutValue extends {} | null,
>(
  inKeys: InKeys,
  outKey: OutKey,
  caster: Caster<InValue, OutValue>
): KVMapper<InKeys[number], InValue, OutKey, OutValue> {
  return ([inKey, inValue]) =>
    inKeys.includes(inKey)
      ? caster(inValue).map((outValue) => [outKey, outValue])
      : None;
}

export type KVGrabber<
  InKey extends string | number | symbol,
  InValue extends {} | null,
> = ([key, value]: [InKey, InValue]) => boolean;

export function KVGrabber<
  InKeys extends [string | number | symbol, ...(string | number | symbol)[]],
  InValue extends {} | null,
  TObj extends {
    [Key in OutKey]: {} | null;
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
    mapper(kv).match({
      some: ([key, value]) => {
        if (duplicateBehaviour === "overwrite" || obj[key] === undefined) {
          obj[key] = value;
        }
        return true;
      },
      none: false,
    });
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

export function KVGrabberCollection<
  InKeys extends string | number | symbol,
>(grabbers: KVGrabber<InKeys, any>[]): KVGrabber<InKeys, any> {
  return ([key, value]) => grabbers.some((g) => g([key, value]));
}
