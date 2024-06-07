import { Result /* Ok, Err, Option, Some, None */ } from "neverthrow";
import { ParsingError } from "@/errors";
// import { Transformer } from "./transformer";

export type PropertyTransformSchema<
  From extends {} | null,
  To extends {} | null,
  InputKeys extends readonly [string, ...string[]],
> = {
  inputKeys: InputKeys;
  parse: (text: From) => Result<To, ParsingError>;
  unparse: (prop: To) => Result<From, ParsingError>;
  _type: "PropertyTransformSchema";
};

export function definePropertyTransformSchema<
  From extends {} | null,
  To extends {} | null,
  const InputKeys extends readonly [string, ...string[]],
>(
  propertyTransformSchema: Omit<PropertyTransformSchema<From, To, InputKeys>, "_type">
): PropertyTransformSchema<From, To, InputKeys> {
  return {
    ...propertyTransformSchema,
    _type: "PropertyTransformSchema",
  };
}

export type ObjectTransformSchema<
  TKey extends string,
  PropertyTypes extends
    | PropertyTransformSchema<any, any, any>
    | NestedObjectTransformSchema<any, any, any>,
> = {
  [key in TKey]: key extends "_type" ? "ObjectTransformSchema" : PropertyTypes;
};

export type NestedObjectTransformSchema<
  TKey extends string,
  PropertyTypes extends
    | PropertyTransformSchema<any, any, any>
    | NestedObjectTransformSchema<any, any, any>,
  InputKeys extends readonly [string, ...string[]],
> =
  | ObjectTransformSchema<TKey, PropertyTypes>
  | {
      inputKeys: InputKeys;
    };

export function defineObjectTransformSchema<
  const TKey extends Exclude<string, "inputKeys">,
  const PropertyTypes extends
    | PropertyTransformSchema<any, any, any>
    | NestedObjectTransformSchema<any, any, any>,
  const T extends ObjectTransformSchema<TKey, PropertyTypes>,
>(schema: T): T {
  return {
    ...schema,
    _type: "ObjectTransformSchema",
  };
}

export function defineNestedObjectTransformSchema<
  const TKey extends string,
  const PropertyTypes extends
    | PropertyTransformSchema<any, any, any>
    | NestedObjectTransformSchema<any, any, any>,
  const InputKeys extends readonly [string, ...string[]],
  const T extends NestedObjectTransformSchema<TKey, PropertyTypes, InputKeys>,
>(schema: T): T {
  return {
    ...schema,
    _type: "ObjectTransformSchema",
  };
}

export type ParsedType<
  S extends
    | ObjectTransformSchema<any, any>
    | NestedObjectTransformSchema<any, any, any>
    | PropertyTransformSchema<any, any, any>,
> =
  S extends PropertyTransformSchema<any, infer To, any>
    ? To
    : S extends ObjectTransformSchema<infer TKey, any>
      ? {
          [P in TKey as P extends "inputKeys" | "_type" ? never : P]: ParsedType<S[P]>;
        }
      : never;

export type UnparsedKeys<
  Schema extends
    | PropertyTransformSchema<any, any, any>
    | NestedObjectTransformSchema<any, any, any>,
> =
  Schema extends PropertyTransformSchema<any, any, infer InputKeys>
    ? InputKeys[number]
    : Schema extends NestedObjectTransformSchema<any, any, infer InputKeys>
      ? InputKeys[number]
      : never;

export type UnparsedType<
  S extends ObjectTransformSchema<any, any> | PropertyTransformSchema<any, any, any>,
> =
  S extends PropertyTransformSchema<infer From, any, any>
    ? From
    : S extends ObjectTransformSchema<any, any>
      ? {
          [P in keyof S as P extends "inputKeys" | "_type"
            ? never
            : UnparsedKeys<S[P]>]: UnparsedType<S[P]>;
        }
      : never;

// const test = defineObjectTransformSchema({
//   testOut: definePropertyTransformSchema({
//     inputKeys: ["testIn"],
//     parse(text: string) {
//       return Ok(text);
//     },
//     unparse(text: string) {
//       return Ok(text);
//     },
//   }),
// });

// function isPropertyTransformSchema<
//   From extends {} | null,
//   To extends {} | null,
//   InputKeys extends readonly [string, ...string[]],
// >(
//   s:
//     | PropertyTransformSchema<From, To, InputKeys>
//     | ObjectTransformSchema<any, any>
// ): s is PropertyTransformSchema<From, To, InputKeys> {
//   return s._type === "PropertyTransformSchema";
// }

// function isObjectTransformSchema<
//   TKey extends string,
//   PropertyTypes extends
//     | PropertyTransformSchema<any, any, any>
//     | NestedObjectTransformSchema<any, any, any>,
// >(
//   s:
//     | PropertyTransformSchema<any, any, any>
//     | ObjectTransformSchema<TKey, PropertyTypes>
// ): s is ObjectTransformSchema<TKey, PropertyTypes> {
//   return !isPropertyTransformSchema(s);
// }

// export type SchemaTransformer<
//   To extends {} | null,
//   From extends {} | null,
// > = Transformer<To, From>;

// export function SchemaTransformer<
//   const TKey extends string,
//   const PropertyTypes extends
//     | PropertyTransformSchema<any, any, any>
//     | NestedObjectTransformSchema<any, any, any>,
//   const From extends {} | null,
//   const To extends {} | null,
// >(
//   schema:
//     | ObjectTransformSchema<TKey, PropertyTypes>
//     | PropertyTransformSchema<From, To, any>
// ) {
//   if (isPropertyTransformSchema(schema)) {
//     return {
//       apply: (unparsed: UnparsedType<typeof schema>) => schema.parse(unparsed),
//       unapply: (parsed: ParsedType<typeof schema>) => schema.unparse(parsed),
//     } as SchemaTransformer<To, From>;
//   }
//   if (isObjectTransformSchema(schema)) {
//     const tfmr: SchemaTransformer<
//       ParsedType<typeof schema>,
//       UnparsedType<typeof schema>
//     > = {
//       apply: (unparsed) => {
//         if (unparsed === null) {
//           return Err(new ParsingError("Null object"));
//         }
//         return Ok(
//           Object.entries(schema)
//             .filter(
//               (kv): kv is [string, PropertyTypes] => kv[0] !== "inputKeys"
//             )
//             .map(([outKey, subSchema]) => {
//               for (const inKey of subSchema.inputKeys as [string, ...string[]]) {
//                 const subTransformer = SchemaTransformer(subSchema);
//                 if (inKey in unparsed) {
//                   return [outKey, subTransformer?.apply(unparsed[inKey as Exclude<string, "_type" | "inputKeys">])]
//                 }
//               }
//             })
//         );
//       },
//       unapply: (parsed) => {},
//     };
//     return tfmr;
//   }
// }
