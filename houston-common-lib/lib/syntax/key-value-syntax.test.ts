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
  test("catches error", () => {
    const errorInputs = ["Hello, world!", "=value", "===="];
    for (const input of errorInputs) {
      expect(kvSyntax.apply(input).isErr()).toEqual(true);
    }
  });
  suite("duplicateKeys:", () => {
    const input = `key = value1
key = value2
key = value3
`;
    test("overwrite", () => {
      const kvSyntax = KeyValueSyntax({ duplicateKey: "overwrite" });
      const applyResult = kvSyntax.apply(input);
      expect(applyResult).toEqual(ok({ key: "value3" }));
      expect(applyResult.andThen(kvSyntax.unapply)).toEqual(
        ok("key = value3\n")
      );
    });
    test("ignore", () => {
      const kvSyntax = KeyValueSyntax({ duplicateKey: "ignore" });
      const applyResult = kvSyntax.apply(input);
      expect(applyResult).toEqual(ok({ key: "value1" }));
      expect(applyResult.andThen(kvSyntax.unapply)).toEqual(
        ok("key = value1\n")
      );
    });
    test("append", () => {
      const kvSyntax = KeyValueSyntax({ duplicateKey: "append" });
      const applyResult = kvSyntax.apply(input);
      expect(applyResult).toEqual(ok({ key: ["value1", "value2", "value3"] }));
      expect(applyResult.andThen(kvSyntax.unapply)).toEqual(ok(input));
    });
    test("error", () => {
      const kvSyntax = KeyValueSyntax({ duplicateKey: "error" });
      const applyResult = kvSyntax.apply(input);
      expect(applyResult.isErr()).toEqual(true);
    });
  });
});
