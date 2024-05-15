import { SyntaxParser } from "@/syntax/syntax-parser";
import { ParsingError } from "@/errors";
import { Result, ok, err } from "neverthrow";
import { newlineSplitterRegex } from "./regex-snippets";

export type KeyValueData = Record<string, string>;

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
};

export function KeyValueSyntax({
  indent = "",
  commentRegex = /^\s*[#;]/,
  trailingNewline = true,
}: KeyValueSyntaxOptions = {}): SyntaxParser<KeyValueData> {
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
              line
            ): Result<{ key: string; value: string } | null, ParsingError> => {
              if (commentRegex.test(line) || line.trim() === "") {
                return ok(null);
              }
              const [key, value] = line.split(/=(.*)/).map((s) => s.trim());
              if (key === undefined || value === undefined || key === "") {
                return err(
                  new ParsingError(`Invalid key = value format:\n${line}`)
                );
              }
              return ok({ key, value });
            }
          )
      ).map((keyValuePairs) =>
        keyValuePairs
          .filter((kv): kv is { key: string; value: string } => kv !== null)
          .reduce((data, { key, value }) => {
            data[key] = value;
            return data;
          }, {} as KeyValueData)
      ),
    unapply: (data) =>
      ok(
        Object.entries(data)
          .map(([key, value]) => `${indent}${key} = ${value}`)
          .join("\n") + (trailingNewline ? "\n" : "")
      ),
  };
}
