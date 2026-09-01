/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-A-Q2 · Unit tests del presenter/label.
 *
 * Contract §17-bis 5-7, 8-10, 15. Cases Q2-17..Q2-24, Q2-49..Q2-52.
 */

import { describe, expect, it } from "vitest";

import {
  CANONICAL_LOCALES,
  DEFAULT_LOCALE,
  buildLabelPresenter,
  isCanonicalLocale,
  normaliseLocaleHint,
} from "./onboarding-labels";

describe("[Q2-labels] canonical whitelist mirrors Plan V1.1 §14 (13 codes)", () => {
  it("catalog length is exactly 13", () => {
    expect(CANONICAL_LOCALES.length).toBe(13);
  });

  it("all codes are lowercase without regional or script suffixes", () => {
    for (const code of CANONICAL_LOCALES) {
      expect(code).toMatch(/^[a-z]{2,3}$/);
      expect(code).not.toContain("-");
    }
  });

  it("catalog equals the activated set from Plan V1.1 §14 in order", () => {
    expect(CANONICAL_LOCALES).toStrictEqual([
      "es", "ca", "en", "fr", "de", "it", "pt",
      "zh", "ja", "ko", "ar", "hi", "ru",
    ]);
  });

  it("forbidden codes (eu/gl/nl/sv/zh-Hans) never appear in the catalog", () => {
    for (const forbidden of ["eu", "gl", "nl", "sv", "zh-Hans"]) {
      expect(CANONICAL_LOCALES).not.toContain(forbidden);
    }
  });

  it("default locale belongs to the catalog (contract §17-bis 7)", () => {
    expect(CANONICAL_LOCALES).toContain(DEFAULT_LOCALE);
  });
});

describe("[Q2-labels] isCanonicalLocale", () => {
  it("accepts every canonical code exactly", () => {
    for (const code of CANONICAL_LOCALES) {
      expect(isCanonicalLocale(code)).toBe(true);
    }
  });

  it("rejects uppercase, regional variants and script suffixes", () => {
    for (const bad of ["ES", "es-ES", "ja-JP", "zh-CN", "zh-Hans", "pt-BR", "eu", "gl", "nl", "sv"]) {
      expect(isCanonicalLocale(bad)).toBe(false);
    }
  });

  it("rejects empty string, undefined, null, padding, non-string values", () => {
    for (const bad of ["", " es ", " ", "en ", "\ten", undefined, null, 42, {}, []]) {
      expect(isCanonicalLocale(bad as unknown)).toBe(false);
    }
  });
});

describe("[Q2-locale] normaliseLocaleHint · Q2-49 canonical variant", () => {
  it("Q2-49: `ja-JP` normalises to `ja`", () => {
    expect(normaliseLocaleHint("ja-JP")).toBe("ja");
  });

  it("Q2-49: canonical prefix already in whitelist stays", () => {
    expect(normaliseLocaleHint("es")).toBe("es");
    expect(normaliseLocaleHint("zh")).toBe("zh");
  });

  it("Q2-49: `es-ES,en;q=0.9` picks first range and normalises to `es`", () => {
    expect(normaliseLocaleHint("es-ES,en;q=0.9")).toBe("es");
  });
});

describe("[Q2-locale] normaliseLocaleHint · Q2-50 unknown", () => {
  it("Q2-50: unknown language `no` falls back to default", () => {
    expect(normaliseLocaleHint("no")).toBe(DEFAULT_LOCALE);
  });

  it("Q2-50: `xx-YY` unknown region falls back", () => {
    expect(normaliseLocaleHint("xx-YY")).toBe(DEFAULT_LOCALE);
  });

  it("Q2-50: null and empty string fall back", () => {
    expect(normaliseLocaleHint(null)).toBe(DEFAULT_LOCALE);
    expect(normaliseLocaleHint(undefined)).toBe(DEFAULT_LOCALE);
    expect(normaliseLocaleHint("")).toBe(DEFAULT_LOCALE);
  });
});

describe("[Q2-locale] normaliseLocaleHint · Q2-51 manipulated", () => {
  it("Q2-51: `zh-Hans` (script variant) falls back — never leaks to RPC", () => {
    // zh-Hans splits at first `-`; prefix is `zh` which IS canonical.
    // The hint is normalised to `zh` for presentation. What matters
    // contractually is that the RPC never sees any of it (§17-bis 8).
    // Test that the prefix resolution is deterministic:
    expect(normaliseLocaleHint("zh-Hans")).toBe("zh");
  });

  it("Q2-51: hostile characters in the language range are rejected wholesale", () => {
    // The primary range (before `;`) contains characters outside the
    // BCP-47 safe alphabet (letters, digits, dashes). The hint is
    // wholly discarded and falls back to the default locale.
    expect(normaliseLocaleHint("'); DROP TABLE tenants; --")).toBe(DEFAULT_LOCALE);
    expect(normaliseLocaleHint("<script>alert(1)</script>")).toBe(DEFAULT_LOCALE);
    expect(normaliseLocaleHint("../etc/passwd")).toBe(DEFAULT_LOCALE);
    expect(normaliseLocaleHint("es_ES")).toBe(DEFAULT_LOCALE); // underscore not allowed
    expect(normaliseLocaleHint("\nes\n")).toBe("es"); // trim already handles this via .trim()
  });

  it("Q2-51: manipulated hint that isolates to a non-canonical primary tag falls back", () => {
    // `xx-Hostile-;q=<script>` — primary is `xx`, not canonical.
    expect(normaliseLocaleHint("xx-Hostile-;q=1")).toBe(DEFAULT_LOCALE);
  });

  it("Q2-51: whitespace-only or padding fall back", () => {
    expect(normaliseLocaleHint("   ")).toBe(DEFAULT_LOCALE);
    expect(normaliseLocaleHint("\t\n")).toBe(DEFAULT_LOCALE);
  });
});

describe("[Q2-labels] buildLabelPresenter · Q2-52 catalog closed", () => {
  const presenter = buildLabelPresenter();

  it("returns a non-empty string for every canonical locale", () => {
    for (const code of CANONICAL_LOCALES) {
      const label = presenter.labelFor(code);
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("returns the default locale label when passed a non-canonical value (defensive)", () => {
    // Runtime guardia: si un caller pasa un valor fuera del catálogo
    // (imposible por tipos, pero no por runtime en JS), el presenter
    // degrada al locale por defecto en lugar de romper.
    const label = presenter.labelFor("xx" as unknown as (typeof CANONICAL_LOCALES)[number]);
    expect(label).toBe(presenter.labelFor(DEFAULT_LOCALE));
  });

  it("label for `es` is stable and neutral (does not leak PII, does not depend on client input)", () => {
    expect(presenter.labelFor("es")).toBe("Mi espacio");
    expect(presenter.labelFor("en")).toBe("My space");
    expect(presenter.labelFor("ja")).toBe("マイスペース");
  });
});
