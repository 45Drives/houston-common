import { SyntaxParser } from "./syntax-parser";
import { Ok, Err } from "@thames/monads";
import { newlineSplitterRegex } from "./regex-snippets";
import { KeyValueSyntax } from "@/syntax/key-value-syntax";
import { ParsingError } from "@/syntax/errors";

export type IniConfigData = Record<string, Record<string, string>>;

export type IniSyntaxOptions = {
  paramIndent?: number | string;
  /**
   * default: `/^\s*[#;]/`
   */
  commentRegex?: RegExp;
  /**
   * default: true
   */
  trailingNewline?: boolean;
};

export function IniSyntax({
  paramIndent = "",
  commentRegex = /^\s*[#;].*$/,
  trailingNewline = true,
}: IniSyntaxOptions = {}): SyntaxParser<IniConfigData> {
  const sectionRegex = /^\s*\[\s*(?<name>[^\]]*?)\s*\]\s*$/;
  const paramRegex = /^\s*(?<key>[^=]+?)\s*=\s*(?<value>.*?)\s*$/;
  const kvSyntax = KeyValueSyntax({
    indent: paramIndent,
    commentRegex,
    trailingNewline: false,
  });
  return {
    apply: (text) => {
      const data: IniConfigData = {};
      let currentSection: string | null = null;
      for (const line of text.split(newlineSplitterRegex)) {
        if (commentRegex.test(line)) {
          continue;
        }
        if (sectionRegex.test(line)) {
          const match = line.match(sectionRegex);
          if (match !== null && match.groups !== undefined) {
            currentSection = match.groups["name"] as string;
            if (data[currentSection] === undefined) {
              data[currentSection] = {};
            }
          }
        } else if (paramRegex.test(line)) {
          const match = line.match(paramRegex);
          if (
            currentSection !== null &&
            match !== null &&
            match.groups !== undefined
          ) {
            const key = match.groups["key"] as string;
            const value = match.groups["value"] as string;
            data[currentSection]![key] = value;
          }
        }
      }
      return Ok(data);
    },
    unapply: (data) => {
      try {
        return Ok(
          Object.entries(data)
            .map(([sectionName, params]) => {
              return kvSyntax.unapply(params).match({
                ok: (paramsText) => `[${sectionName}]\n${paramsText}`,
                err: (e) => {
                  throw e;
                },
              });
            })
            .join("\n\n") + (trailingNewline ? "\n" : "")
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
