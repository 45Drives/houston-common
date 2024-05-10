import {
  BooleanToStringCaster,
  MethodFunctor,
  StringToBooleanCaster,
  Unwrapper,
} from "./utils";
import { Some, None } from "@thames/monads";

import { suite, expect, test } from "vitest";

suite("utils", () => {
  suite("MethodFunctor", () => {
    const toLowerCase = MethodFunctor(String, "toLowerCase");
    const toUpperCase = MethodFunctor(String, "toUpperCase");
    test("parameterless methods", () => {
      const testStrings = [
        {
          raw: "HeLlO, WoRlD!",
          upper: "HELLO, WORLD!",
          lower: "hello, world!",
        },
        { raw: "lorem ipsum", upper: "LOREM IPSUM", lower: "lorem ipsum" },
        { raw: "LOREM IPSUM", upper: "LOREM IPSUM", lower: "lorem ipsum" },
      ];
      testStrings.forEach(({ raw, upper, lower }) => {
        expect(toLowerCase(raw)).toEqual(lower);
        expect(toUpperCase(raw)).toEqual(upper);
      });
    });
    test("Mapping functor", () => {
      const testStrings = ["HeLlO, WoRlD!", "lorem ipsum", "LOREM IPSUM"];
      expect(testStrings.map(toLowerCase)).toEqual(
        testStrings.map((s) => s.toLowerCase())
      );
      expect(testStrings.map(toUpperCase)).toEqual(
        testStrings.map((s) => s.toUpperCase())
      );
    });
    test("with bound args", () => {
      const testStrings = ["HeLlO, WoRlD!", "lorem ipsum", "LOREM IPSUM"];
      const firstChar = MethodFunctor(String, "charAt", 0);
      const slicer = (start: number, end: number) =>
        MethodFunctor(String, "slice", start, end);
      expect(testStrings.map(firstChar)).toEqual(testStrings.map((s) => s[0]));
      expect(testStrings.map(slicer(1, 3))).toEqual(
        testStrings.map((s) => s.slice(1, 3))
      );
    });
  });
  suite("Caster", () => {
    test("default StringToBooleanCaster", () => {
      const caster = StringToBooleanCaster();
      const trueValues = ["true", "yes", "1"];
      const falseValues = ["false", "no", "0"];
      const invalidValues = ["hello", "world", ":3"];
      const trueValuesUpper = trueValues.map(
        MethodFunctor(String, "toUpperCase")
      );
      const falseValuesUpper = falseValues.map(
        MethodFunctor(String, "toUpperCase")
      );
      expect(trueValues.map(caster)).toEqual([
        Some(true),
        Some(true),
        Some(true),
      ]);
      expect(falseValues.map(caster)).toEqual([
        Some(false),
        Some(false),
        Some(false),
      ]);
      expect(invalidValues.map(caster)).toEqual([None, None, None]);
      expect(trueValuesUpper.map(caster)).toEqual([
        Some(true),
        Some(true),
        Some(true),
      ]);
      expect(falseValuesUpper.map(caster)).toEqual([
        Some(false),
        Some(false),
        Some(false),
      ]);
    });
    test("case sensitive StringToBooleanCaster", () => {
      const caster = StringToBooleanCaster({ ignoreCase: false });
      const trueValues = ["true", "yes", "1"];
      const falseValues = ["false", "no", "0"];
      const invalidValues = ["hello", "world", ":3"];
      const trueValuesUpper = trueValues.map(
        MethodFunctor(String, "toUpperCase")
      );
      const falseValuesUpper = falseValues.map(
        MethodFunctor(String, "toUpperCase")
      );
      expect(trueValues.map(caster)).toEqual([
        Some(true),
        Some(true),
        Some(true),
      ]);
      expect(falseValues.map(caster)).toEqual([
        Some(false),
        Some(false),
        Some(false),
      ]);
      expect(invalidValues.map(caster)).toEqual([None, None, None]);
      expect(trueValuesUpper.map(caster)).toEqual([None, None, Some(true)]); // "1" is case insensitive
      expect(falseValuesUpper.map(caster)).toEqual([None, None, Some(false)]); // "0" is case insensitive
    });
    test("Custom truthy/falsy StringToBooleanCaster", () => {
      const caster = StringToBooleanCaster({
        truthyWords: ["on"],
        falsyWords: ["off"],
      });
      expect(["on", "off", "true", "false", "1", "0"].map(caster)).toEqual([
        Some(true),
        Some(false),
        None,
        None,
        None,
        None,
      ]);
    });
    test("BooleanToStringCaster", () => {
      const trueFalseCaster = BooleanToStringCaster("true", "false");
      const yesNoCaster = BooleanToStringCaster("yes", "no");
      const testPattern = [true, false, true];
      expect(testPattern.map(trueFalseCaster)).toEqual([
        Some("true"),
        Some("false"),
        Some("true"),
      ]);
      expect(testPattern.map(yesNoCaster)).toEqual([
        Some("yes"),
        Some("no"),
        Some("yes"),
      ]);
      expect(
        testPattern
          .map(yesNoCaster)
          .map(Unwrapper())
          .map(StringToBooleanCaster())
          .map(Unwrapper())
      ).toEqual(testPattern);
    });
  });
});
