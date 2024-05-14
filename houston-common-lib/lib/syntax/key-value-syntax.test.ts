import { expect, test, suite } from "vitest";
import { KeyValueSyntax } from "@/syntax/key-value-syntax";
import { ok } from "neverthrow";

const testData = [
  {
    raw: `
key = value
  key with space = value

key2 = value with space
; comment 1
 ; comment 2


# comment 3
 \t# comment 4
    \t hello world \t  =     value1234\t\t
`,
    data: {
      key: "value",
      "key with space": "value",
      key2: "value with space",
      "hello world": "value1234",
    },
    cleanRaw: `key = value
key with space = value
key2 = value with space
hello world = value1234
`,
  },
];

suite("KeyValueSyntax", () => {
  const kvSyntax = KeyValueSyntax();
  for (const { raw, data, cleanRaw } of testData) {
    test("parsing", () => {
      expect(kvSyntax.apply(raw)).toEqual(ok(data));
    });
    test("unparsing", () => {
      expect(kvSyntax.unapply(data)).toEqual(ok(cleanRaw));
    });
    test("apply(unapply(data)) == data", () => {
      expect(
        ok(data).andThen(kvSyntax.unapply).andThen(kvSyntax.apply)
      ).toEqual(ok(data));
    });
    test("unapply(apply(raw)) == cleanRaw", () => {
      expect(ok(raw).andThen(kvSyntax.apply).andThen(kvSyntax.unapply)).toEqual(
        ok(cleanRaw)
      );
    });
  }
});
