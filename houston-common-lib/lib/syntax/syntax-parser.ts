import { Transformer } from "./transformer";

export type SyntaxParser<T extends {}> = Transformer<T, string>;
