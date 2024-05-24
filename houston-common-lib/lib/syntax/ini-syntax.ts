import { SyntaxParser } from "./syntax-parser";
import { Result, ok, err } from "neverthrow";
import { newlineSplitterRegex } from "./regex-snippets";
import { KeyValueData, KeyValueSyntax } from "@/syntax/key-value-syntax";
import { ParsingError } from "@/errors";

export type IniConfigData<TValue extends string | string[] = string> = Record<
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
): SyntaxParser<IniConfigData<string | string[]>>;

export function IniSyntax(
  opts: IniSyntaxOptions = {}
):
  | SyntaxParser<IniConfigData<string>>
  | SyntaxParser<IniConfigData<string | string[]>> {
  const {
    paramIndent = "",
    commentRegex = /^\s*[#;].*$/,
    trailingNewline = true,
    duplicateKey = "overwrite",
  } = opts;
  const sectionRegex = /^\s*\[\s*(?<name>[^\]]*?)\s*\]\s*$/;
  const paramRegex = /^\s*(?<key>[^=]+?)\s*=\s*(?<value>.*?)\s*$/;
  return {
    apply: (text) => {
      const data =
        duplicateKey === "append"
          ? ({} as IniConfigData<string | string[]>)
          : ({} as IniConfigData<string>);
      let currentSection: string | null = null;
      for (const [index, line] of text.split(newlineSplitterRegex).entries()) {
        if (line.trim() === "" || commentRegex.test(line)) {
          continue;
        }
        if (sectionRegex.test(line)) {
          const match = line.match(sectionRegex);
          if (match !== null && match.groups !== undefined) {
            currentSection = match.groups["name"] as string;
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
            if (data[currentSection] === undefined) {
              data[currentSection] = {};
            }
            const currentKeyValues = data[currentSection]!;
            const currentValue = currentKeyValues[key];
            if (duplicateKey === "append") {
              if (currentValue === undefined) {
                currentKeyValues[key] = value;
              } else if (typeof currentValue === "string") {
                currentKeyValues[key] = [currentValue, value];
              } else if (Array.isArray(currentValue)) {
                currentKeyValues[key] = [...currentValue, value];
              }
            } else if (
              currentValue === undefined ||
              duplicateKey === "overwrite"
            ) {
              currentKeyValues[key] = value;
            } else if (duplicateKey === "error") {
              return err(
                new ParsingError(
                  `Duplicate key '${key}' at line ${index}:\n${line}`
                )
              );
            } // else ignore
          }
        } else {
          return err(
            new ParsingError(`Invalid INI format at line ${index}:\n${line}`)
          );
        }
      }
      return ok(data);
    },
    unapply: (
      data: IniConfigData<string> | IniConfigData<string | string[]>
    ) => {
      return Result.combine(
        Object.entries(data
        ).map(([sectionName, params]) =>
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
            }).unapply(params as KeyValueData<string>))
            .map((paramsText) => `[${sectionName}]\n${paramsText}`)
        )
      ).map(
        (sections) => sections.join("\n\n") + (trailingNewline ? "\n" : "")
      );
    },
  };
}
