import { SyntaxParser } from "@/syntax/syntax-parser";
import { Ok } from "@thames/monads";
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
      Ok(
        text
          // split lines
          .split(newlineSplitterRegex)
          // filter comments
          .filter((line) => !commentRegex.test(line))
          // keep lines containing '='
          .filter((line) => line.includes("="))
          // transform `${key}=${value}` strings to [key, value] tuples
          .map((line) => line.split(/=(.*)/).map((s) => s.trim()))
          // keep valid matches
          .filter((kvpair): kvpair is [string, string] => {
            const [key, value] = kvpair;
            return key !== undefined && value !== undefined;
          })
          .reduce((data, [key, value]) => {
            data[key] = value;
            return data;
          }, {} as KeyValueData)
      ),
    unapply: (data) =>
      Ok(
        Object.entries(data)
          .map(([key, value]) => `${indent}${key} = ${value}`)
          .join("\n") + (trailingNewline ? "\n" : "")
      ),
  };
}
