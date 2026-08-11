/**
 * SPABLA V2 — Fase 9 · Hito 9.1.1 · Regression tests for
 * `initialLanguagesFor`.
 *
 * Locks in the D1 fix: the read language matches the write language, so
 * reloading the page never inverts the actors' choices. The helper also
 * refuses to invent an identity for unknown actors.
 */

import { describe, expect, test } from "vitest";

import { initialLanguagesFor, type SeedForInitialLanguages } from "./initial-languages";

const seed: SeedForInitialLanguages = {
  actorA: { actorId: "00000000-0000-0000-0000-00000000000a", language: "es" },
  actorB: { actorId: "00000000-0000-0000-0000-00000000000b", language: "en" },
};

describe("initialLanguagesFor", () => {
  test("actorA (es): myLanguage = es and targetLanguage = es", () => {
    expect(initialLanguagesFor(seed.actorA.actorId, seed)).toEqual({
      myLanguage: "es",
      targetLanguage: "es",
    });
  });

  test("actorB (en): myLanguage = en and targetLanguage = en", () => {
    expect(initialLanguagesFor(seed.actorB.actorId, seed)).toEqual({
      myLanguage: "en",
      targetLanguage: "en",
    });
  });

  test("target never derives from the counterpart's language", () => {
    // Regression against the D1 bug (target used to be the other actor's
    // language). If this assertion ever flips, we've reintroduced the
    // inverted default that broke the visible test after page reload.
    const a = initialLanguagesFor(seed.actorA.actorId, seed);
    const b = initialLanguagesFor(seed.actorB.actorId, seed);
    expect(a?.targetLanguage).not.toBe(seed.actorB.language);
    expect(b?.targetLanguage).not.toBe(seed.actorA.language);
  });

  test("unknown actor returns null (no invented identity)", () => {
    expect(initialLanguagesFor("00000000-0000-0000-0000-000000000099", seed)).toBeNull();
  });

  test("missing / malformed actorId returns null", () => {
    expect(initialLanguagesFor(null, seed)).toBeNull();
    expect(initialLanguagesFor(undefined, seed)).toBeNull();
    expect(initialLanguagesFor("", seed)).toBeNull();
  });

  test("missing seed returns null", () => {
    expect(initialLanguagesFor(seed.actorA.actorId, null)).toBeNull();
    expect(initialLanguagesFor(seed.actorA.actorId, undefined)).toBeNull();
  });

  test("seed with different language pairs produces matching pairs", () => {
    const alt: SeedForInitialLanguages = {
      actorA: { actorId: "aaa", language: "fr" },
      actorB: { actorId: "bbb", language: "de" },
    };
    expect(initialLanguagesFor("aaa", alt)).toEqual({ myLanguage: "fr", targetLanguage: "fr" });
    expect(initialLanguagesFor("bbb", alt)).toEqual({ myLanguage: "de", targetLanguage: "de" });
  });
});
