import { SyntaxParser } from "./syntax-parser";
import { Result, ok, err } from "neverthrow";
import { RegexSnippets } from "./regex-snippets";
import { KeyValueData, KeyValueSyntax } from "@/syntax/key-value-syntax";
import { ParsingError } from "@/errors";
import { Identity } from "@/functional";
import { StringUtils } from "./string-utils";
import { Maybe, None, Some } from "monet";

export type IniConfigData<TValue extends string | [string, ...string[]] = string> = Record<
  string,
  Record<string, TValue>
>;

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
  /**
   * default: "overwrite"
   */
  duplicateKey?: "overwrite" | "ignore" | "error" | "append";
};

export function IniSyntax(
  options?: IniSyntaxOptions & {
    duplicateKey?: "overwrite" | "ignore" | "error";
  }
): SyntaxParser<IniConfigData<string>>;
export function IniSyntax(
  options: IniSyntaxOptions & {
    duplicateKey: "append";
  }
): SyntaxParser<IniConfigData<string | [string, ...string[]]>>;

export function IniSyntax(
  opts: IniSyntaxOptions = {}
):
  | SyntaxParser<IniConfigData<string>>
  | SyntaxParser<IniConfigData<string | [string, ...string[]]>> {
  const {
    paramIndent = "",
    commentRegex = /^\s*[#;].*$/,
    trailingNewline = true,
    duplicateKey = "overwrite",
  } = opts;
  return {
    apply: (text) => {
      const data =
        duplicateKey === "append"
          ? ({} as IniConfigData<string | [string, ...string[]]>)
          : ({} as IniConfigData<string>);
      let currentSection: string | null = null;
      const lines = Identity(text)
        .map(StringUtils.splitBy(RegexSnippets.newlineSplitter))
        .map(
          StringUtils.filter(
            StringUtils.nonEmptyFilter(),
            StringUtils.regexFilter(commentRegex, true)
          )
        )
        .map(StringUtils.joinEscapedNewlines)
        .flatten();
      const sectionHeader = (line: string): Maybe<string> =>
        Some(line.trim()).flatMap((line) =>
          line.startsWith("[") && line.endsWith("]") ? Some(line.slice(1, -1)) : None()
        );
      const parameter = (line: string): Maybe<{ key: string; value: string }> =>
        line.includes("=")
          ? Some(line)
              .map(StringUtils.splitBy(RegexSnippets.keyValueSplitter))
              .flatMap(([key, value]) =>
                Maybe.fromEmpty(key).flatMap((key) =>
                  Maybe.fromUndefined(value).map((value) => ({
                    key: key.trim(),
                    value: value.trimStart(),
                  }))
                )
              )
          : None();
      const getSectionData = (section: string) => {
        if (data[section] === undefined) {
          data[section] = {};
        }
        return data[section]!;
      };
      for (const [index, line] of lines.entries()) {
        const maybeSection = sectionHeader(line);
        if (maybeSection.isSome()) {
          currentSection = maybeSection.some();
          continue;
        }
        const maybeParameter = parameter(line);
        if (maybeParameter.isSome() && currentSection !== null) {
          const { key, value } = maybeParameter.some();
          const currentKeyValues = getSectionData(currentSection);
          const currentValue = currentKeyValues[key];
          if (duplicateKey === "append") {
            if (currentValue === undefined) {
              currentKeyValues[key] = value;
            } else if (typeof currentValue === "string") {
              currentKeyValues[key] = [currentValue, value];
            } else if (Array.isArray(currentValue)) {
              currentKeyValues[key] = [...currentValue, value];
            }
          } else if (currentValue === undefined || duplicateKey === "overwrite") {
            currentKeyValues[key] = value;
          } else if (duplicateKey === "error") {
            return err(new ParsingError(`Duplicate key '${key}' at line ${index}:\n${line}`));
          } // else ignore
          continue;
        }
        return err(new ParsingError(`Invalid INI format at line ${index}:\n${line}`));
      }
      return ok(data);
    },
    unapply: (data: IniConfigData<string> | IniConfigData<string | [string, ...string[]]>) => {
      return Result.combine(
        Object.entries(data).map(([sectionName, params]) =>
          (duplicateKey === "append"
            ? KeyValueSyntax({
                indent: paramIndent,
                commentRegex,
                trailingNewline: false,
                duplicateKey: "append",
              }).unapply(params)
            : KeyValueSyntax({
                indent: paramIndent,
                commentRegex,
                trailingNewline: false,
                duplicateKey: duplicateKey,
              }).unapply(params as KeyValueData<string>)
          ).map((paramsText) => `[${sectionName}]\n${paramsText}`)
        )
      ).map((sections) => sections.join("\n\n") + (trailingNewline ? "\n" : ""));
    },
  };
}
