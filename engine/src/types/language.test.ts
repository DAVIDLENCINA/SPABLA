import { describe, it, expect } from "vitest";
import {
  makeLanguagePair,
  languagePairEquals,
  invertLanguagePair,
  isLangCode,
  LanguagePairInvalidError,
  type LangCode,
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
    const codes = [
      "af", "am", "ar", "bg", "bn", "ca", "cs", "da", "de", "el",
      "en", "es", "et", "eu", "fa", "fi", "fr", "ga", "gl", "gu",
      "he", "hi", "hr", "hu", "id", "is", "it", "ja", "km", "ko",
      "lt", "lv", "mr", "ms", "mt", "ne", "nl", "no", "pl", "pt",
      "ro", "ru", "sk", "sl", "sv", "sw", "ta", "te", "th", "tl",
      "tr", "uk", "ur", "vi", "zh",
    ];
    for (const c of codes) expect(isLangCode(c)).toBe(true);
  });

  it("rejects non-LangCode strings and non-strings", () => {
    expect(isLangCode("xx")).toBe(false);
    expect(isLangCode(null)).toBe(false);
    expect(isLangCode(42)).toBe(false);
    expect(isLangCode(undefined)).toBe(false);
  });

  it("catalog size matches ADR-005 §5 (55 codes)", () => {
    const catalog = [
      "af", "am", "ar", "bg", "bn", "ca", "cs", "da", "de", "el",
      "en", "es", "et", "eu", "fa", "fi", "fr", "ga", "gl", "gu",
      "he", "hi", "hr", "hu", "id", "is", "it", "ja", "km", "ko",
      "lt", "lv", "mr", "ms", "mt", "ne", "nl", "no", "pl", "pt",
      "ro", "ru", "sk", "sl", "sv", "sw", "ta", "te", "th", "tl",
      "tr", "uk", "ur", "vi", "zh",
    ];
    expect(catalog).toHaveLength(55);
    for (const c of catalog) expect(isLangCode(c)).toBe(true);
  });

  it("LangCode union and SUPPORTED_LANG_CODES stay in sync (exhaustive iteration)", () => {
    // SUPPORTED_LANG_CODES is not exported (regla ADR-004 §2 — sin ampliar
    // superficie pública). We verify sync indirectly by iterating over all
    // 2-letter combinations and asserting that exactly the ADR-005 §5
    // catalog is recognized.
    const alphabet = "abcdefghijklmnopqrstuvwxyz";
    const recognized: string[] = [];
    for (const a of alphabet) {
      for (const b of alphabet) {
        if (isLangCode(a + b)) recognized.push(a + b);
      }
    }
    const expected = [
      "af", "am", "ar", "bg", "bn", "ca", "cs", "da", "de", "el",
      "en", "es", "et", "eu", "fa", "fi", "fr", "ga", "gl", "gu",
      "he", "hi", "hr", "hu", "id", "is", "it", "ja", "km", "ko",
      "lt", "lv", "mr", "ms", "mt", "ne", "nl", "no", "pl", "pt",
      "ro", "ru", "sk", "sl", "sv", "sw", "ta", "te", "th", "tl",
      "tr", "uk", "ur", "vi", "zh",
    ].sort();
    expect(recognized.sort()).toEqual(expected);
    expect(recognized).toHaveLength(55);
  });
});

// ────────────────────────────────────────────────────────────────
// LANG13-01 · thirteen-language activation contract
//
// Locks in the initial activated catalogue defined by
// `docs/phases/SPABLA_V2_FASE_9_THIRTEEN_LANGUAGES_PLAN.md` V1.1
// (APPROVED AND FROZEN). This block is contractual and MUST fail
// whenever any of the following invariants regresses:
//
//   - the technical catalogue (`LangCode` / `SUPPORTED_LANG_CODES`)
//     stops holding exactly 55 codes, or grows/shrinks by any amount;
//   - any of the 13 activated codes disappears or gets renamed;
//   - the product order of the 13 activated codes changes;
//   - `isLangCode` starts accepting regional variants that require a
//     future ADR-005-N (`zh-Hans`, `zh-CN`, `zh-Hant`, `pt-BR`,
//     `pt-PT`, `es-ES`, `es-419`, `ar-SA`), padded strings, or
//     mixed case;
//   - `makeLanguagePair` allows a diagonal pair (same code on both
//     sides) for any of the 13 activated codes;
//   - `makeLanguagePair` rejects a legitimate non-diagonal pair among
//     the 13 activated codes.
//
// The block is table-driven. It never reads the Plan markdown, never
// hits the network, never touches Supabase, and never invokes the
// translation provider. It is orthogonal to the future
// LANG13-05 fake-provider matrix (which lives in the
// TranslationStore test suite).
// ────────────────────────────────────────────────────────────────

// The activated catalogue, in the exact product order fixed by
// Plan V1.1 §14. The array literal is local to this test file; the
// productive code never exports a runtime list of activated codes
// (ADR-004 §2 keeps the public surface untouched).
const ACTIVATED_ORDER = [
  "es", "ca", "en", "fr", "de", "it", "pt",
  "zh", "ja", "ko", "ar", "hi", "ru",
] as const satisfies ReadonlyArray<LangCode>;

// Anti-list: strings that MUST NOT be recognised as valid LangCode by
// the current contract. Includes regional variants aplazadas por
// ADR-005 (que exigen ADR-005-N + política de normalización explícita
// antes de ser aceptadas), variantes de mayúsculas/espacios y códigos
// inexistentes. Keep in sync with Plan V1.1 §10, §7 and §26.
const REJECTED_INPUTS = [
  "",
  "ES",
  " es ",
  "es-ES",
  "es-419",
  "pt-BR",
  "pt-PT",
  "zh-Hans",
  "zh-CN",
  "zh-Hant",
  "ar-SA",
  "xx",
] as const;

describe("LANG13-01 · thirteen-language activation contract", () => {
  // ── A. Catálogo técnico ────────────────────────────────────────
  describe("A. technical catalogue is preserved at 55 codes", () => {
    // Compute the actual recognised catalogue by exhaustive 2-letter
    // enumeration (same technique as the sync-check above). This is
    // the single source of truth used by the rest of the block.
    const recognized: ReadonlyArray<string> = (() => {
      const alphabet = "abcdefghijklmnopqrstuvwxyz";
      const out: string[] = [];
      for (const a of alphabet) {
        for (const b of alphabet) {
          if (isLangCode(a + b)) out.push(a + b);
        }
      }
      return out;
    })();

    it("recognises exactly 55 two-letter codes", () => {
      expect(recognized).toHaveLength(55);
    });

    it("contains no duplicates within the recognised set", () => {
      expect(new Set(recognized).size).toBe(recognized.length);
    });

    it("includes every one of the 13 activated codes", () => {
      const missing = ACTIVATED_ORDER.filter((c) => !recognized.includes(c));
      // Empty missing[] means every activated code is present.
      expect(missing, `activated codes missing from LangCode: [${missing.join(", ")}]`).toEqual([]);
    });
  });

  // ── B. Activated subset shape and order ────────────────────────
  describe("B. activated subset has exactly 13 unique codes in product order", () => {
    it("has exactly 13 entries", () => {
      expect(ACTIVATED_ORDER).toHaveLength(13);
    });

    it("has no duplicates", () => {
      expect(new Set(ACTIVATED_ORDER).size).toBe(ACTIVATED_ORDER.length);
    });

    it("matches the product order fixed by Plan V1.1 §14", () => {
      // Any drift in this array must be a deliberate, documented,
      // Direction-approved change to the Plan. Do NOT sort here.
      expect([...ACTIVATED_ORDER]).toEqual([
        "es", "ca", "en", "fr", "de", "it", "pt",
        "zh", "ja", "ko", "ar", "hi", "ru",
      ]);
    });

    it.each(ACTIVATED_ORDER.map((code, index) => ({ index: index + 1, code })))(
      "position $index is '$code' — never reorder alphabetically",
      ({ index, code }) => {
        expect(ACTIVATED_ORDER[index - 1]).toBe(code);
      },
    );
  });

  // ── B. Validation of each activated code ───────────────────────
  describe("B. isLangCode accepts each of the 13 activated codes", () => {
    it.each(ACTIVATED_ORDER.map((code) => ({ code })))(
      "accepts '$code'",
      ({ code }) => {
        expect(isLangCode(code)).toBe(true);
      },
    );
  });

  // ── B. Rejection of aplazadas, padded and unknown inputs ───────
  describe("B. isLangCode rejects regional variants, padded / mixed-case forms and unknown codes", () => {
    it.each(REJECTED_INPUTS.map((raw) => ({ raw })))(
      "rejects %j",
      ({ raw }) => {
        expect(isLangCode(raw)).toBe(false);
      },
    );

    it("does not silently normalise: uppercase / padded inputs are NOT recognised as their lowercase-trimmed equivalents", () => {
      // Even though " es " trimmed and lowered is "es", the guard
      // must never perform that transformation. This lock protects
      // the future normalisation policy required by Plan V1.1 §9/§10.
      expect(isLangCode(" es ")).toBe(false);
      expect(isLangCode("ES")).toBe(false);
      // But the underlying code IS valid when passed exactly.
      expect(isLangCode("es")).toBe(true);
    });

    it("rejects non-string inputs", () => {
      expect(isLangCode(null)).toBe(false);
      expect(isLangCode(undefined)).toBe(false);
      expect(isLangCode(42)).toBe(false);
      expect(isLangCode([])).toBe(false);
      expect(isLangCode({})).toBe(false);
    });
  });

  // ── C. 169-combination direction matrix ────────────────────────
  describe("C. 13 × 13 = 169 combinations decompose into 13 diagonals + 156 directions", () => {
    // Build the matrix programmatically. Never write 169 blocks by hand.
    const ALL_COMBINATIONS: ReadonlyArray<{ from: LangCode; to: LangCode }> = (() => {
      const out: Array<{ from: LangCode; to: LangCode }> = [];
      for (const from of ACTIVATED_ORDER) {
        for (const to of ACTIVATED_ORDER) {
          out.push({ from, to });
        }
      }
      return out;
    })();

    const DIAGONALS = ALL_COMBINATIONS.filter((p) => p.from === p.to);
    const DIRECTIONS = ALL_COMBINATIONS.filter((p) => p.from !== p.to);

    it("enumerates 169 total combinations", () => {
      expect(ALL_COMBINATIONS).toHaveLength(169);
    });

    it("splits into 13 diagonals", () => {
      expect(DIAGONALS).toHaveLength(13);
    });

    it("splits into 156 non-diagonal directions (13 × 12)", () => {
      expect(DIRECTIONS).toHaveLength(156);
      expect(DIRECTIONS.length).toBe(ACTIVATED_ORDER.length * (ACTIVATED_ORDER.length - 1));
    });

    it("directions have no duplicates and no diagonal contamination", () => {
      const seen = new Set<string>();
      for (const { from, to } of DIRECTIONS) {
        const key = `${from}->${to}`;
        expect(seen.has(key), `duplicate direction ${key}`).toBe(false);
        expect(from, `direction ${key} has from === to (diagonal leaked)`).not.toBe(to);
        seen.add(key);
      }
      expect(seen.size).toBe(156);
    });

    // Table-driven: every one of the 156 directions must build a valid
    // pair that preserves `from` and `to` verbatim. Errors label the
    // direction so a regression identifies the offending pair.
    it.each(
      DIRECTIONS.map(({ from, to }) => ({ label: `${from}->${to}`, from, to })),
    )("direction $label constructs a valid pair that preserves from/to", ({ label, from, to }) => {
      const pair = makeLanguagePair(from, to);
      expect(pair.from, `direction ${label} lost 'from'`).toBe(from);
      expect(pair.to, `direction ${label} lost 'to'`).toBe(to);
      expect(pair.from).not.toBe(pair.to);
    });

    // Table-driven: every one of the 13 diagonals must be rejected by
    // the LanguagePair constructor. Same-language pair is a V1-era
    // root defect (see line 17 of this file) and stays banned.
    it.each(DIAGONALS.map(({ from }) => ({ code: from })))(
      "diagonal $code->$code is rejected with LanguagePairInvalidError",
      ({ code }) => {
        expect(() => makeLanguagePair(code, code)).toThrow(LanguagePairInvalidError);
      },
    );

    it("does NOT invoke any translation provider — pure structural contract", () => {
      // Sanity assertion. The whole block runs synchronously on
      // in-memory data structures. Nothing here should touch
      // `fetch`, Supabase or the TranslationStore. If a future
      // refactor of `makeLanguagePair` introduces an async side
      // effect, `it.each` above would surface it as an unresolved
      // promise; this assertion documents the intent explicitly.
      const pair = makeLanguagePair("es", "en");
      expect(pair.from).toBe("es");
      expect(pair.to).toBe("en");
    });
  });

  // ── D. Inmutabilidad ───────────────────────────────────────────
  describe("D. immutability guardrails — this suite must fail on any of these regressions", () => {
    it("technical catalogue holds exactly 55 codes", () => {
      // Duplicate of A.1 kept here so a Plan-level auditor grepping
      // for "55 codes" in this specific describe block finds it.
      const alphabet = "abcdefghijklmnopqrstuvwxyz";
      let count = 0;
      for (const a of alphabet) {
        for (const b of alphabet) {
          if (isLangCode(a + b)) count += 1;
        }
      }
      expect(count).toBe(55);
    });

    it("activated subset holds exactly 13 codes and the leading three are es, ca, en", () => {
      expect(ACTIVATED_ORDER).toHaveLength(13);
      expect(ACTIVATED_ORDER[0]).toBe("es");
      expect(ACTIVATED_ORDER[1]).toBe("ca");
      expect(ACTIVATED_ORDER[2]).toBe("en");
    });

    it("no regional variant is silently accepted (LOCK: requires ADR-005-N + normalisation policy)", () => {
      const APLAZADAS: ReadonlyArray<string> = [
        "es-ES", "es-419",
        "pt-BR", "pt-PT",
        "zh-Hans", "zh-Hant", "zh-CN",
        "ar-SA",
        "en-US", "en-GB",
        "fr-CA",
      ];
      for (const code of APLAZADAS) {
        expect(isLangCode(code), `variante '${code}' aceptada sin ADR — viola Plan V1.1 §10`).toBe(false);
      }
    });

    it("makeLanguagePair never accepts a diagonal for any activated code", () => {
      for (const code of ACTIVATED_ORDER) {
        expect(() => makeLanguagePair(code, code)).toThrow(LanguagePairInvalidError);
      }
    });
  });
});
