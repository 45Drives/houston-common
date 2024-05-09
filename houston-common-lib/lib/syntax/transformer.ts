import { Result, Ok, Err, Option, Some, None } from "@thames/monads";
import { ParsingError } from "@/syntax/errors";

export type MaybeOption<
  UseOption extends boolean,
  T extends {},
> = UseOption extends true ? Option<T> : T;

export type Transformer<
  TParsed extends {},
  TUnparsed extends {},
  ReturnsOption extends boolean = false,
> = {
  apply: (
    unparsed: TUnparsed
  ) => Result<MaybeOption<ReturnsOption, TParsed>, ParsingError>;
  unapply: (
    parsed: TParsed
  ) => Result<MaybeOption<ReturnsOption, TUnparsed>, ParsingError>;
};

export type PropertyMapper<
  TMappedObject extends {
    [Property in keyof TMappedObject]: TMappedObject[Property] & ({} | null);
  },
  TUnmappedObject extends {
    [Property in keyof TUnmappedObject]: TUnmappedObject[Property] &
      ({} | null);
  },
  TMappedKey extends keyof TMappedObject,
  TUnmappedKey extends keyof TUnmappedObject,
  TMappedValue extends TMappedObject[TMappedKey],
  TUnmappedValue extends TUnmappedObject[TUnmappedKey],
> = Transformer<
  [key: TMappedKey, value: TMappedValue],
  [key: TUnmappedKey, value: TUnmappedValue],
  true
>;

export function PropertyMapper<
  TMappedObject extends {
    [Property in keyof TMappedObject]: TMappedObject[Property] & ({} | null);
  },
  TUnmappedObject extends {
    [Property in keyof TUnmappedObject]: TUnmappedObject[Property] &
      ({} | null);
  },
  TMappedKey extends keyof TMappedObject,
  TUnmappedKey extends keyof TUnmappedObject,
  TMappedValue extends TMappedObject[TMappedKey],
  TUnmappedValue extends TUnmappedObject[TUnmappedKey],
>(
  mappedKey: TMappedKey,
  unmappedKey: TUnmappedKey,
  modifier: (unmapped: TUnmappedValue) => Result<TMappedValue, ParsingError>,
  unmodifier: (mapped: TMappedValue) => Result<TUnmappedValue, ParsingError>
): PropertyMapper<
  TMappedObject,
  TUnmappedObject,
  TMappedKey,
  TUnmappedKey,
  NoInfer<TMappedValue>,
  NoInfer<TUnmappedValue>
> {
  return {
    apply: ([key, unmappedValue]) => {
      if (key !== unmappedKey) {
        return Ok(None);
      }
      return modifier(unmappedValue).match({
        ok: (mappedValue) => Ok(Some([mappedKey, mappedValue])),
        err: (e) => Err(e),
      });
    },
    unapply: ([key, mappedValue]) => {
      if (key !== mappedKey) {
        return Ok(None);
      }
      return unmodifier(mappedValue).match({
        ok: (unmappedValue) => Ok(Some([unmappedKey, unmappedValue])),
        err: (e) => Err(e),
      });
    },
  };
}

// type PickByType<TObj, TProp> = {
//   [P in keyof TObj as TObj[P] extends TProp ? P : never]: TObj[P];
// };

// export function BooleanPropertyMapper<
//   TMappedObject extends PickByType<TMappedObject, boolean>,
//   TUnmappedObject extends PickByType<TUnmappedObject, string>,
//   TMappedKey extends keyof PickByType<TMappedObject, boolean>,
//   TUnmappedKey extends keyof PickByType<TUnmappedObject, string>,
//   TMappedValue extends TMappedObject[TMappedKey],
//   TUnmappedValue extends TUnmappedObject[TUnmappedKey]
// >(
//   mappedKey: TMappedKey,
//   unmappedKey: TUnmappedKey,
//   truthyWords: [string, ...string[]] = ["true", "yes", "1"],
//   falsyWords: [string, ...string[]] = ["false", "no", "0"]
// ) {
//   return PropertyMapper<TMappedObject & {[TMappedKey]: boolean}, TUnmappedObject & {[key: TUnmappedKey]: string}, TMappedKey, TUnmappedKey, TMappedValue, TUnmappedValue>(
//     mappedKey,
//     unmappedKey,
//     (text: boolean) => {
//       if (truthyWords.includes(text)) return Ok(true);
//       if (falsyWords.includes(text)) return Ok(false);
//       return Err(new ParsingError(`Invaid boolean value: ${text}`));
//     },
//     (bool) => {}
//   );
// }

export function ObjectMapper<
  TMapped extends {
    [Property in keyof TMapped]: TMapped[Property] & ({} | null);
  },
  TUnmapped extends {
    [Property in keyof TUnmapped]: TUnmapped[Property] & ({} | null);
  },
>(
  propertyMappers: PropertyMapper<
    TMapped,
    TUnmapped,
    any,
    any,
    TMapped[any],
    TUnmapped[any]
  >[]
): Transformer<TMapped, TUnmapped> {
  return {
    apply: (unparsed: TUnmapped) => {
      try {
        return Ok(
          Object.fromEntries(
            Object.entries(unparsed)
              .filter(
                (kv): kv is [string, TUnmapped[keyof TUnmapped]] =>
                  typeof kv[1] !== undefined
              )
              .map(([key, value]) => {
                if (value === undefined) {
                  return null;
                }
                for (const mapper of propertyMappers) {
                  const result = mapper
                    .apply([key as keyof TUnmapped, value])
                    .match({
                      ok: (val) => val,
                      err: (e) => {
                        throw e;
                      },
                    });
                  if (result.isSome()) {
                    return result.unwrap();
                  }
                }
                return null;
              })
              .filter(
                (kv): kv is [keyof TMapped, TMapped[keyof TMapped]] =>
                  kv !== null
              )
          ) as TMapped
        );
      } catch (e) {
        if (e instanceof ParsingError) {
          return Err(e);
        }
        throw e;
      }
    },
    unapply: (parsed: TUnmapped) => {
      try {
        return Ok(
          Object.fromEntries(
            Object.entries(parsed)
              .filter(
                (kv): kv is [string, TMapped[keyof TMapped]] =>
                  typeof kv[1] !== undefined
              )
              .map(([key, value]) => {
                if (value === undefined) {
                  return null;
                }
                for (const mapper of propertyMappers) {
                  const result = mapper
                    .unapply([key as keyof TMapped, value])
                    .match({
                      ok: (val) => val,
                      err: (e) => {
                        throw e;
                      },
                    });
                  if (result.isSome()) {
                    return result.unwrap();
                  }
                }
                return null;
              })
              .filter(
                (kv): kv is [keyof TUnmapped, TUnmapped[keyof TUnmapped]] =>
                  kv !== null
              )
          ) as TUnmapped
        );
      } catch (e) {
        if (e instanceof ParsingError) {
          return Err(e);
        }
        throw e;
      }
    },
  };
}

export type PropertyTransformSchema<
  From extends {} | null,
  To extends {} | null,
  InputKeys extends readonly [string, ...string[]],
> = {
  inputKeys: InputKeys;
  parse: (text: From) => Result<To, ParsingError>;
  unparse: (prop: To) => Result<From, ParsingError>;
};

export function definePropertyTransformSchema<
  From extends {} | null,
  To extends {} | null,
  const InputKeys extends readonly [string, ...string[]],
>(
  propertyTransformSchema: PropertyTransformSchema<From, To, InputKeys>
): PropertyTransformSchema<From, To, InputKeys> {
  return propertyTransformSchema;
}

type ParsedPropertyType<
  PropSchema extends PropertyTransformSchema<any, any, any>,
> = PropSchema extends PropertyTransformSchema<any, infer To, any> ? To : never;

type UnparsedPropertyType<
  PropSchema extends PropertyTransformSchema<any, any, any>,
> =
  PropSchema extends PropertyTransformSchema<infer From, any, any>
    ? From
    : never;

export type ObjectTransformSchema<
  TKey extends string,
  TInputKeys extends readonly [string, ...string[]],
> = {
  [key in TKey]: key extends "inputKeys"
    ? TInputKeys
    : PropertyTransformSchema<any, any, any> | ObjectTransformSchema<any, any>;
} & {
  inputKeys?: TInputKeys;
};

export function defineObjectTransformSchema<
  const TKey extends string,
  const TInputKeys extends readonly [string, ...string[]],
>(
  schema: ObjectTransformSchema<TKey, TInputKeys>
): ObjectTransformSchema<TKey, TInputKeys> {
  return schema;
}

type ParsedObjectType<S extends ObjectTransformSchema<any, any>> = {
  [P in keyof S as P extends "inputKeys"
    ? never
    : P]: S[P] extends PropertyTransformSchema<any, infer To, any>
    ? To
    : S[P] extends ObjectTransformSchema<any, any>
      ? ParsedObjectType<S[P]>
      : never;
};

type UnparsedObjectType<S extends ObjectTransformSchema<any, any>> = {
  [P in keyof S as P extends "inputKeys"
    ? never
    : S[P] extends { inputKeys: [string, ...string[]] }
      ? S[P]["inputKeys"][number]
      : never]: S[P] extends PropertyTransformSchema<any, any, any>
    ? UnparsedPropertyType<S[P]>
    : S[P] extends ObjectTransformSchema<any, any>
      ? UnparsedObjectType<S[P]>
      : never;
};

type UnparsedKeys<
  Schema extends
    | PropertyTransformSchema<any, any, any>
    | ObjectTransformSchema<any, any>,
> =
  Schema extends PropertyTransformSchema<any, any, infer InputKeys>
    ? InputKeys[number]
    : Schema extends ObjectTransformSchema<any, infer InputKeys>
      ? InputKeys extends readonly [string, ...string[]]
        ? InputKeys[number]
        : never
      : never;

const testPropSchema = definePropertyTransformSchema({
  inputKeys: ["inKey", "in key"],
  parse: (v: string) => Ok(parseInt(v)),
  unparse: (v: number) => Ok(v.toString()),
});

type testt = UnparsedKeys<typeof testPropSchema>;

const testObjSchema = defineObjectTransformSchema({
  outKey: definePropertyTransformSchema({
    inputKeys: ["inKey"],
    parse: (t: string) => Ok(parseInt(t)),
    unparse: (n: number) => Ok(n.toString()),
  }),
  inputKeys: ["rootInKey"],
});

type p = UnparsedKeys<typeof testObjSchema>;
