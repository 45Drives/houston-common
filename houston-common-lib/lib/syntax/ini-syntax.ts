import { SyntaxParser } from "./syntax-parser";
import { Result, ok, err } from "neverthrow";
import { newlineSplitterRegex } from "./regex-snippets";
import { KeyValueSyntax } from "@/syntax/key-value-syntax";
import { ParsingError } from "@/errors";

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
      for (const [index, line] of text.split(newlineSplitterRegex).entries()) {
        if (line.trim() === "" || commentRegex.test(line)) {
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
        } else {
          return err(new ParsingError(`Invalid INI format at line ${index}:\n${line}`));
        }
      }
      return ok(data);
    },
    unapply: (data) => {
      return Result.combine(
        Object.entries(data).map(([sectionName, params]) =>
          kvSyntax
            .unapply(params)
            .map((paramsText) => `[${sectionName}]\n${paramsText}`)
        )
      ).map(
        (sections) => sections.join("\n\n") + (trailingNewline ? "\n" : "")
      );
    },
  };
}
