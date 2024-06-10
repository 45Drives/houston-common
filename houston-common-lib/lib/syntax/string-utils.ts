export namespace StringUtils {
  export function trim<T extends string>(text: T): string;
  export function trim<T extends string[]>(lines: T): string[];
  export function trim<T extends string | string[]>(text: T) {
    if (Array.isArray(text)) {
      return text.map((s) => s.trim());
    }
    return text.trim();
  }

  export function joinEscapedNewlines(lines: string[]): string[] {
    return lines.reduce<string[]>((lines, line) => {
      const previousLine = lines[lines.length - 1];
      if (previousLine?.endsWith("\\")) {
        lines[lines.length - 1] = `${previousLine.slice(0, -1)}${line.trimStart()}`;
      } else {
        lines.push(line);
      }
      return lines;
    }, []);
  }

  export function splitBy(splitter: string | RegExp) {
    return (text: string) => text.split(splitter);
  }

  export function filter<T>(...filters: ((s: T) => boolean)[]) {
    return (a: T[]) => a.filter((e) => filters.every((f) => f(e)));
  }

  export function commentFilter(delimiter: string = "#") {
    return (s: string) => s.trimStart().startsWith(delimiter);
  }

  export function nonEmptyFilter() {
    return (s: string) => !!s.trim();
  }

  export function regexFilter(re: RegExp, negate: boolean = false) {
    return (s: string) => re.test(s) != negate;
  }
}
