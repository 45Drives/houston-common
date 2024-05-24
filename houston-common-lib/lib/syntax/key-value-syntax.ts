import { SyntaxParser } from "@/syntax/syntax-parser";
import { ParsingError } from "@/errors";
import { Result, ok, err } from "neverthrow";
import { newlineSplitterRegex } from "./regex-snippets";

export type KeyValueData<TValue extends string | string[] = string> = Record<
  string,
  TValue
>;

export type KeyValueSyntaxOptions = {
  indent?: number | string;
  /**
   * default: `/^\s*[#;]/`
   */
  commentRegex?: RegExp;
  /**
   * default: true
   */
  trailingNewline?: boolean;
  /**
   * default: "overwrite"
   */
  duplicateKey?: "overwrite" | "ignore" | "error" | "append";
};

export function KeyValueSyntax(
  options?: KeyValueSyntaxOptions & {
    duplicateKey?: "overwrite" | "ignore" | "error";
  }
): SyntaxParser<KeyValueData<string>>;
export function KeyValueSyntax(
  options: KeyValueSyntaxOptions & {
    duplicateKey: "append";
  }
): SyntaxParser<KeyValueData<string | string[]>>;

export function KeyValueSyntax(
  opts: KeyValueSyntaxOptions = {}
):
  | SyntaxParser<KeyValueData<string>>
  | SyntaxParser<KeyValueData<string | string[]>> {
  let {
    indent = "",
    commentRegex = /^\s*[#;]/,
    trailingNewline = true,
    duplicateKey = "overwrite",
  } = opts;
  if (typeof indent === "number") {
    indent = " ".repeat(indent);
  }
  return {
    apply: (text) =>
      Result.combine(
        text
          // split lines
          .split(newlineSplitterRegex)
          .map(
            (
              line,
              lineIndex
            ): Result<{ key: string; value: string } | null, ParsingError> => {
              if (commentRegex.test(line) || line.trim() === "") {
                return ok(null);
              }
              const [key, value] = line.split(/=(.*)/).map((s) => s.trim());
              if (key === undefined || value === undefined || key === "") {
                return err(
                  new ParsingError(
                    `Invalid key = value format at line ${lineIndex}:\n${line}`
                  )
                );
              }
              return ok({ key, value });
            }
          )
      ).andThen((keyValuePairs) => {
        const data =
          opts.duplicateKey === "append"
            ? ({} as KeyValueData<string | string[]>)
            : ({} as KeyValueData<string>);
        for (const [index, { key, value }] of keyValuePairs
          .filter((kv): kv is { key: string; value: string } => kv !== null)
          .entries()) {
          const currentValue = data[key];
          if (duplicateKey === "append") {
            if (currentValue === undefined) {
              data[key] = value;
            } else if (typeof currentValue === "string") {
              data[key] = [currentValue, value];
            } else if (Array.isArray(currentValue)) {
              data[key] = [...currentValue, value];
            }
          } else if (
            currentValue === undefined ||
            duplicateKey === "overwrite"
          ) {
            data[key] = value;
          } else if (duplicateKey === "error") {
            return err(
              new ParsingError(`Duplicate key '${key}' at line ${index}`)
            );
          } // else ignore
        }
        return ok(data);
      }),
    unapply: (data: KeyValueData<string> | KeyValueData<string | string[]>) =>
      ok(
        Object.entries(data)
          .map(([key, values]) =>
            [values].flat().map((value) => `${indent}${key} = ${value}`)
          )
          .flat()
          .join("\n") + (trailingNewline ? "\n" : "")
      ),
  };
}
