import { Transformer } from "./transformer";

export type SyntaxParser<T extends {}> = Transformer<T, string>;

export type SyntaxParserType<T extends SyntaxParser<any>> =
  T extends SyntaxParser<infer U> ? U : never;
