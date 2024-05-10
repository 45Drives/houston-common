import { Result, Ok, Err, Option, Some, None } from "@thames/monads";
import { ParsingError } from "@/syntax/errors";

export type MaybeOption<
  UseOption extends boolean,
  T extends {} | null,
> = UseOption extends true ? Option<T> : T;

export type Transformer<
  TParsed extends {} | null,
  TUnparsed extends {} | null,
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
  TMappedValue extends TMappedObject[TMappedKey] & ({} | null),
  TUnmappedValue extends TUnmappedObject[TUnmappedKey] & ({} | null),
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
  TMappedValue,
  TUnmappedValue
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
