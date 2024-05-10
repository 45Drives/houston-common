import { expect, test, suite } from "vitest";

import { KeyValueSyntax } from "@/syntax/key-value-syntax";

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
      expect(kvSyntax.apply(raw).unwrap()).toEqual(data);
    });
    test("unparsing", () => {
      expect(kvSyntax.unapply(data).unwrap()).toEqual(cleanRaw);
    });
    test("apply(unapply(data)) == data", () => {
      expect(kvSyntax.apply(kvSyntax.unapply(data).unwrap()).unwrap()).toEqual(data);
    });
    test("unapply(apply(raw)) == cleanRaw", () => {
      expect(kvSyntax.unapply(kvSyntax.apply(raw).unwrap()).unwrap()).toEqual(cleanRaw);
    });
  }
});
