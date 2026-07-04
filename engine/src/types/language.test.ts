import { describe, it, expect } from "vitest";
import {
  makeLanguagePair,
  languagePairEquals,
  invertLanguagePair,
  isLangCode,
  LanguagePairInvalidError,
} from "./language.js";

describe("LanguagePair — invariants", () => {
  it("constructs a valid directional pair", () => {
    const pair = makeLanguagePair("es", "en");
    expect(pair.from).toBe("es");
    expect(pair.to).toBe("en");
  });

  it("rejects same-language pair (V1 root defect)", () => {
    expect(() => makeLanguagePair("es", "es")).toThrow(LanguagePairInvalidError);
  });

  it("rejects unsupported code on 'from'", () => {
    expect(() => makeLanguagePair("xx" as never, "en")).toThrow(LanguagePairInvalidError);
  });

  it("rejects unsupported code on 'to'", () => {
    expect(() => makeLanguagePair("es", "yy" as never)).toThrow(LanguagePairInvalidError);
  });

  it("carries the offending values inside the error", () => {
    try {
      makeLanguagePair("es", "es");
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(LanguagePairInvalidError);
      const e = err as LanguagePairInvalidError;
      expect(e.from).toBe("es");
      expect(e.to).toBe("es");
    }
  });

  it("is frozen — mutation attempts silently fail in strict mode", () => {
    const pair = makeLanguagePair("es", "en");
    expect(Object.isFrozen(pair)).toBe(true);
  });
});

describe("LanguagePair — helpers", () => {
  it("structurally compares two pairs", () => {
    const a = makeLanguagePair("es", "en");
    const b = makeLanguagePair("es", "en");
    const c = makeLanguagePair("en", "es");
    expect(languagePairEquals(a, b)).toBe(true);
    expect(languagePairEquals(a, c)).toBe(false);
  });

  it("inverts direction", () => {
    const pair = makeLanguagePair("es", "en");
    const inverted = invertLanguagePair(pair);
    expect(inverted.from).toBe("en");
    expect(inverted.to).toBe("es");
  });

  it("recognizes every documented LangCode", () => {
    const codes = ["es", "en", "fr", "de", "it", "pt", "ja", "zh", "ar", "ru"];
    for (const c of codes) expect(isLangCode(c)).toBe(true);
  });

  it("rejects non-LangCode strings and non-strings", () => {
    expect(isLangCode("xx")).toBe(false);
    expect(isLangCode(null)).toBe(false);
    expect(isLangCode(42)).toBe(false);
    expect(isLangCode(undefined)).toBe(false);
  });
});
