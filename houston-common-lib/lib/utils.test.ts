import {
  BooleanToStringCaster,
  MethodFunctor,
  StringToBooleanCaster,
  Unwrapper,
  StringToIntCaster,
  IntToStringCaster,
  KVMapper,
  KVGrabber,
  KVRemainderGrabber,
  IdentityCaster,
  KVGrabberCollection,
  joinStringArrayWithAnd,
} from "./utils";
import { Some, None } from "monet";

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
      expect(testStrings.map(toLowerCase)).toEqual(testStrings.map((s) => s.toLowerCase()));
      expect(testStrings.map(toUpperCase)).toEqual(testStrings.map((s) => s.toUpperCase()));
    });
    test("with bound args", () => {
      const testStrings = ["HeLlO, WoRlD!", "lorem ipsum", "LOREM IPSUM"];
      const firstChar = MethodFunctor(String, "charAt", 0);
      const slicer = (start: number, end: number) => MethodFunctor(String, "slice", start, end);
      expect(testStrings.map(firstChar)).toEqual(testStrings.map((s) => s[0]));
      expect(testStrings.map(slicer(1, 3))).toEqual(testStrings.map((s) => s.slice(1, 3)));
    });
  });
  suite("Caster", () => {
    test("default StringToBooleanCaster", () => {
      const caster = StringToBooleanCaster();
      const trueValues = ["true", "yes", "1"];
      const falseValues = ["false", "no", "0"];
      const invalidValues = ["hello", "world", ":3"];
      const trueValuesUpper = trueValues.map(MethodFunctor(String, "toUpperCase"));
      const falseValuesUpper = falseValues.map(MethodFunctor(String, "toUpperCase"));
      expect(trueValues.map(caster)).toEqual([Some(true), Some(true), Some(true)]);
      expect(falseValues.map(caster)).toEqual([Some(false), Some(false), Some(false)]);
      expect(invalidValues.map(caster)).toEqual([None(), None(), None()]);
      expect(trueValuesUpper.map(caster)).toEqual([Some(true), Some(true), Some(true)]);
      expect(falseValuesUpper.map(caster)).toEqual([Some(false), Some(false), Some(false)]);
    });
    test("case sensitive StringToBooleanCaster", () => {
      const caster = StringToBooleanCaster({ ignoreCase: false });
      const trueValues = ["true", "yes", "1"];
      const falseValues = ["false", "no", "0"];
      const invalidValues = ["hello", "world", ":3"];
      const trueValuesUpper = trueValues.map(MethodFunctor(String, "toUpperCase"));
      const falseValuesUpper = falseValues.map(MethodFunctor(String, "toUpperCase"));
      expect(trueValues.map(caster)).toEqual([Some(true), Some(true), Some(true)]);
      expect(falseValues.map(caster)).toEqual([Some(false), Some(false), Some(false)]);
      expect(invalidValues.map(caster)).toEqual([None(), None(), None()]);
      expect(trueValuesUpper.map(caster)).toEqual([None(), None(), Some(true)]); // "1" is case insensitive
      expect(falseValuesUpper.map(caster)).toEqual([None(), None(), Some(false)]); // "0" is case insensitive
    });
    test("Custom truthy/falsy StringToBooleanCaster", () => {
      const caster = StringToBooleanCaster({
        truthyWords: ["on"],
        falsyWords: ["off"],
      });
      expect(["on", "off", "true", "false", "1", "0"].map(caster)).toEqual([
        Some(true),
        Some(false),
        None(),
        None(),
        None(),
        None(),
      ]);
    });
    test("BooleanToStringCaster", () => {
      const trueFalseCaster = BooleanToStringCaster("true", "false");
      const yesNoCaster = BooleanToStringCaster("yes", "no");
      const testPattern = [true, false, true];
      expect(testPattern.map(trueFalseCaster)).toEqual([Some("true"), Some("false"), Some("true")]);
      expect(testPattern.map(yesNoCaster)).toEqual([Some("yes"), Some("no"), Some("yes")]);
      expect(
        testPattern.map(yesNoCaster).map(Unwrapper()).map(StringToBooleanCaster()).map(Unwrapper())
      ).toEqual(testPattern);
    });
    test("StringToIntCaster", () => {
      const input = ["0", "1", "10", "100"];
      const inputHex = ["0x0", "0x1", "0x10", "0x100"];
      const anyCaster = StringToIntCaster();
      const decCaster = StringToIntCaster(10);
      const hexCaster = StringToIntCaster(16);
      const octCaster = StringToIntCaster(8);
      expect(input.map(anyCaster)).toEqual([Some(0), Some(1), Some(10), Some(100)]);
      expect(input.map(decCaster)).toEqual([Some(0), Some(1), Some(10), Some(100)]);
      expect(input.map(hexCaster)).toEqual([Some(0), Some(1), Some(16), Some(256)]);
      expect(input.map(octCaster)).toEqual([Some(0), Some(1), Some(8), Some(64)]);
      [decCaster, hexCaster, octCaster].forEach((caster) => {
        const invalidInput = ["hello", "lorem ipsum", ";4lkjdf()"];
        expect(invalidInput.map(caster)).toEqual(Array(invalidInput.length).fill(None()));
      });
      expect(inputHex.map(hexCaster)).toEqual(input.map(hexCaster));
      expect(inputHex.map(anyCaster)).toEqual(input.map(hexCaster));
    });
    test("IntToStringCaster", () => {
      const input = [0, 1, 10, 100];
      const defaultCaster = IntToStringCaster();
      const decCaster = IntToStringCaster(10);
      const hexCaster = IntToStringCaster(16);
      const octCaster = IntToStringCaster(8);
      expect(input.map(decCaster)).toEqual([Some("0"), Some("1"), Some("10"), Some("100")]);
      expect(input.map(hexCaster)).toEqual([Some("0"), Some("1"), Some("a"), Some("64")]);
      expect(input.map(octCaster)).toEqual([Some("0"), Some("1"), Some("12"), Some("144")]);
      expect(input.map(defaultCaster)).toEqual(input.map(decCaster));
      [defaultCaster, decCaster, hexCaster, octCaster].forEach((caster) => {
        expect(caster(NaN)).toEqual(None());
      });
    });
    test("KVMapper", () => {
      const numMapper = KVMapper(["a number"], "aNumber", StringToIntCaster());
      const boolMapper = KVMapper(["a boolean"], "aBoolean", StringToBooleanCaster());
      expect(numMapper(["a number", "1234"])).toEqual(Some(["aNumber", 1234]));
      expect(numMapper(["anumber", "1234"])).toEqual(None());
      expect(numMapper(["a number", "asdv1234"])).toEqual(None());
      expect(boolMapper(["a boolean", "yes"])).toEqual(Some(["aBoolean", true]));
      expect(boolMapper(["a boolean", "true"])).toEqual(Some(["aBoolean", true]));
      expect(boolMapper(["a boolean", "1"])).toEqual(Some(["aBoolean", true]));
      expect(boolMapper(["a boolean", "no"])).toEqual(Some(["aBoolean", false]));
      expect(boolMapper(["a boolean", "false"])).toEqual(Some(["aBoolean", false]));
      expect(boolMapper(["a boolean", "0"])).toEqual(Some(["aBoolean", false]));
      expect(boolMapper(["aboolean", "0"])).toEqual(None());
      expect(boolMapper(["a boolean", "lkjsdlfjksdf"])).toEqual(None());
    });
  });
  suite("KVGrabber", () => {
    type Output = {
      aNumber: number;
      aBoolean: boolean;
      aString: string;
      adv: Record<string, string>;
    };
    test("one prop at a time", () => {
      const output: Partial<Output> & Pick<Output, "adv"> = {
        adv: {},
      };
      const numGrabber = KVGrabber(output, "aNumber", ["a number"], StringToIntCaster());
      const boolGrabber = KVGrabber(output, "aBoolean", ["a boolean"], StringToBooleanCaster());
      const stringGrabber = KVGrabber(output, "aString", ["a string"], IdentityCaster<string>());
      const advGrabber = KVRemainderGrabber(output, "adv");
      expect(
        [numGrabber, boolGrabber, stringGrabber].map((grabber) =>
          grabber(["lorem ipsum", "whatever"])
        )
      ).toEqual([false, false, false]);
      expect(numGrabber(["a number", "sdlkj"])).toEqual(false);
      expect(boolGrabber(["a boolean", "okay"])).toEqual(false);
      expect(numGrabber(["a number", "1234"])).toEqual(true);
      expect(boolGrabber(["a boolean", "yes"])).toEqual(true);
      expect(stringGrabber(["a string", "the quick brown fox"])).toEqual(true);
      expect(output).toEqual({
        aNumber: 1234,
        aBoolean: true,
        aString: "the quick brown fox",
        adv: {},
      });
      expect(advGrabber(["advKey1", "some advanced value"])).toEqual(true);
      expect(advGrabber(["advKey2", "some other advanced value"])).toEqual(true);
      expect(output).toEqual({
        aNumber: 1234,
        aBoolean: true,
        aString: "the quick brown fox",
        adv: {
          advKey1: "some advanced value",
          advKey2: "some other advanced value",
        },
      });
    });
    test("all at once", () => {
      const input = {
        "a number": "1234",
        "a boolean": "yes",
        "a string": "Hello, world!",
        advKey1: "some advanced value",
        advKey2: "some other advanced value",
      };
      const expectedOutput: Output = {
        aNumber: 1234,
        aBoolean: true,
        aString: "Hello, world!",
        adv: {
          advKey1: "some advanced value",
          advKey2: "some other advanced value",
        },
      };
      const output: Partial<Output> & Pick<Output, "adv"> = {
        adv: {},
      };
      const grabbers = [
        KVGrabber(output, "aNumber", ["a number"], StringToIntCaster()),
        KVGrabber(output, "aBoolean", ["a boolean"], StringToBooleanCaster()),
        KVGrabber(output, "aString", ["a string"], IdentityCaster<string>()),
        KVRemainderGrabber(output, "adv"),
      ];
      Object.entries(input).forEach(([key, value]) => {
        expect(grabbers.some((g) => g([key, value]))).toEqual(true);
      });
      expect(output).toEqual(expectedOutput);
    });
    test("overwrite/ignore duplicate params", () => {
      const input = {
        "a number 0": "0",
        "a number 1": "1",
        "a number 2": "2",
      };
      const overwriteOutput: Partial<{ aNumber: number }> = {};
      const overwriteGrabber = KVGrabber(
        overwriteOutput,
        "aNumber",
        ["a number 0", "a number 1", "a number 2"],
        StringToIntCaster(),
        "overwrite"
      );
      const ignoreOutput: Partial<{ aNumber: number }> = {};
      const ignoreGrabber = KVGrabber(
        ignoreOutput,
        "aNumber",
        ["a number 0", "a number 1", "a number 2"],
        StringToIntCaster(),
        "ignore"
      );
      Object.entries(input).forEach(([key, value]) => {
        expect([overwriteGrabber, ignoreGrabber].every((g) => g([key, value]))).toEqual(true);
      });
      expect(overwriteOutput).toEqual({ aNumber: 2 });
      expect(ignoreOutput).toEqual({ aNumber: 0 });
    });
    test("KVGrabberCollection", () => {
      const input = {
        "a number": "1234",
        "a boolean": "yes",
        "a string": "Hello, world!",
        advKey1: "some advanced value",
        advKey2: "some other advanced value",
      };
      const expectedOutput: Output = {
        aNumber: 1234,
        aBoolean: true,
        aString: "Hello, world!",
        adv: {
          advKey1: "some advanced value",
          advKey2: "some other advanced value",
        },
      };
      const output: Partial<Output> & Pick<Output, "adv"> = {
        adv: {},
      };
      const grabber = KVGrabberCollection([
        KVGrabber(output, "aNumber", ["a number"], StringToIntCaster()),
        KVGrabber(output, "aBoolean", ["a boolean"], StringToBooleanCaster()),
        KVGrabber(output, "aString", ["a string"], IdentityCaster<string>()),
        KVRemainderGrabber(output, "adv"),
      ]);
      Object.entries(input).forEach(([key, value]) => {
        expect(grabber([key, value])).toEqual(true);
      });
      expect(output).toEqual(expectedOutput);
    });
  });
  suite("joinStringArrayWithAnd", () => {
    test("empty", () => {
      expect(joinStringArrayWithAnd([])).toEqual("");
    })
    test("length = 1", () => {
      expect(joinStringArrayWithAnd(["hello"])).toEqual("hello");
    })
    test("length = 2", () => {
      expect(joinStringArrayWithAnd(["hello", "world"])).toEqual("hello and world");
    })
    test("length = 3", () => {
      expect(joinStringArrayWithAnd(["hello", "world", "yeet"])).toEqual("hello, world, and yeet");
    })
  })
});
