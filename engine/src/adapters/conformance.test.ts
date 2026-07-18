import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type { AdapterBase } from "../types/adapters";
import type { LangCode } from "../types/language";

import {
  buildConformanceCases,
  evaluateConformanceCase,
  type ConformanceCase,
  type ConformanceProfile,
} from "./conformance";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENGINE_BARREL_PATH = path.resolve(__dirname, "..", "index.ts");
const CONFORMANCE_SRC_PATH = path.resolve(__dirname, "conformance.ts");
const CONFORMANCE_TEST_PATH = path.resolve(__dirname, "conformance.test.ts");

// ─── Local fakes for Hito 7.4 tests (not exported) ─────────────────

class FakeMTSupports implements AdapterBase<"mt"> {
  readonly kind = "mt" as const;
  private readonly positive: ReadonlySet<LangCode>;
  constructor(positive: ReadonlyArray<LangCode>) {
    this.positive = new Set(positive);
  }
  supports(lang: LangCode): boolean {
    return this.positive.has(lang);
  }
}

class FakeMTGSL implements AdapterBase<"mt"> {
  readonly kind = "mt" as const;
  private readonly set: ReadonlySet<LangCode>;
  constructor(langs: ReadonlyArray<LangCode>) {
    this.set = new Set(langs);
  }
  getSupportedLanguages(): ReadonlySet<LangCode> {
    return this.set;
  }
}

class FakeMTBoth implements AdapterBase<"mt"> {
  readonly kind = "mt" as const;
  private readonly set: ReadonlySet<LangCode>;
  constructor(langs: ReadonlyArray<LangCode>) {
    this.set = new Set(langs);
  }
  supports(lang: LangCode): boolean {
    return this.set.has(lang);
  }
  getSupportedLanguages(): ReadonlySet<LangCode> {
    return this.set;
  }
}

class FakeMTNone implements AdapterBase<"mt"> {
  readonly kind = "mt" as const;
}

class FakeMTBothDivergent implements AdapterBase<"mt"> {
  readonly kind = "mt" as const;
  private readonly set: ReadonlySet<LangCode> = new Set<LangCode>(["es"]);
  supports(_lang: LangCode): boolean {
    return true;
  }
  getSupportedLanguages(): ReadonlySet<LangCode> {
    return this.set;
  }
}

class FakeMTMutatingRef implements AdapterBase<"mt"> {
  readonly kind = "mt" as const;
  supports(lang: LangCode): boolean {
    // Reassign the method reference — breaks the reference identity captured
    // in the evaluator's initial snapshot, triggering §14.8 adapter_mutated.
    this.supports = (_l: LangCode): boolean => false;
    return lang === "es";
  }
}

class FakeMTSetMutating implements AdapterBase<"mt"> {
  readonly kind = "mt" as const;
  private readonly set: Set<LangCode> = new Set<LangCode>(["es", "en"]);
  private observed = false;
  getSupportedLanguages(): ReadonlySet<LangCode> {
    if (this.observed) {
      // On subsequent invocations, grow the set — the evaluator's post
      // snapshot will diverge from its initial snapshot.
      this.set.add("fr");
    } else {
      this.observed = true;
    }
    return this.set;
  }
}

class FakeSTTBoth implements AdapterBase<"stt"> {
  readonly kind = "stt" as const;
  private readonly set: ReadonlySet<LangCode>;
  constructor(langs: ReadonlyArray<LangCode>) {
    this.set = new Set(langs);
  }
  supports(lang: LangCode): boolean {
    return this.set.has(lang);
  }
  getSupportedLanguages(): ReadonlySet<LangCode> {
    return this.set;
  }
}

// ─── Tests §22.1 (17 dedicated functional tests in fixed order) ────

describe("adapters/conformance — Hito 7.4 (§22.1)", () => {
  it("1. supports conforme produce { ok: true }", () => {
    const profile: ConformanceProfile<"mt"> = {
      kind: "mt",
      declares: "supports",
      positiveLangs: ["es", "en"],
      negativeLangs: ["fr"],
      production: true,
    };
    const factory = (): AdapterBase<"mt"> => new FakeMTSupports(["es", "en"]);
    const cases = buildConformanceCases(profile, factory);
    for (const c of cases) {
      expect(evaluateConformanceCase(c)).toEqual({ ok: true });
    }
  });

  it("2. gsl conforme produce { ok: true }", () => {
    const profile: ConformanceProfile<"mt"> = {
      kind: "mt",
      declares: "gsl",
      positiveLangs: ["es", "en"],
      negativeLangs: ["fr"],
      production: true,
    };
    const factory = (): AdapterBase<"mt"> => new FakeMTGSL(["es", "en"]);
    const cases = buildConformanceCases(profile, factory);
    for (const c of cases) {
      expect(evaluateConformanceCase(c)).toEqual({ ok: true });
    }
  });

  it("3. both coherente produce { ok: true }", () => {
    const profile: ConformanceProfile<"mt"> = {
      kind: "mt",
      declares: "both",
      positiveLangs: ["es", "en"],
      negativeLangs: ["fr"],
      production: true,
    };
    const factory = (): AdapterBase<"mt"> => new FakeMTBoth(["es", "en"]);
    const cases = buildConformanceCases(profile, factory);
    for (const c of cases) {
      expect(evaluateConformanceCase(c)).toEqual({ ok: true });
    }
  });

  it("4. none no productivo produce { ok: true }", () => {
    const profile: ConformanceProfile<"mt"> = {
      kind: "mt",
      declares: "none",
      positiveLangs: [],
      negativeLangs: ["es"],
      production: false,
    };
    const factory = (): AdapterBase<"mt"> => new FakeMTNone();
    const cases = buildConformanceCases(profile, factory);
    for (const c of cases) {
      expect(evaluateConformanceCase(c)).toEqual({ ok: true });
    }
  });

  it("5. ausencia de supports exigido produce missing_supports", () => {
    const testCase: ConformanceCase<"mt"> = {
      name: "structural: missing supports",
      kind: "mt",
      declaration: "supports",
      expectation: null,
      adapterFactory: () => new FakeMTNone(),
    };
    const result = evaluateConformanceCase(testCase);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("missing_supports");
      expect(result.adapterKind).toBe("mt");
      expect(result.sourcesDeclared).toEqual({ supports: false, gsl: false });
      expect(result.lang).toBeNull();
      expect(result.expected).toBeNull();
      expect(result.actual).toBeNull();
    }
  });

  it("6. ausencia de gsl exigido produce missing_gsl", () => {
    const testCase: ConformanceCase<"mt"> = {
      name: "structural: missing gsl",
      kind: "mt",
      declaration: "gsl",
      expectation: null,
      adapterFactory: () => new FakeMTNone(),
    };
    const result = evaluateConformanceCase(testCase);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("missing_gsl");
      expect(result.sourcesDeclared).toEqual({ supports: false, gsl: false });
    }
  });

  it("7. declaración supports inesperada produce unexpected_supports", () => {
    const testCase: ConformanceCase<"mt"> = {
      name: "structural: unexpected supports (gsl profile)",
      kind: "mt",
      declaration: "gsl",
      expectation: null,
      adapterFactory: () => new FakeMTBoth(["es"]),
    };
    const result = evaluateConformanceCase(testCase);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unexpected_supports");
      expect(result.sourcesDeclared).toEqual({ supports: true, gsl: true });
    }
  });

  it("8. declaración gsl inesperada produce unexpected_gsl", () => {
    const testCase: ConformanceCase<"mt"> = {
      name: "structural: unexpected gsl (supports profile)",
      kind: "mt",
      declaration: "supports",
      expectation: null,
      adapterFactory: () => new FakeMTBoth(["es"]),
    };
    const result = evaluateConformanceCase(testCase);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unexpected_gsl");
    }
  });

  it("9. divergencia entre supports y gsl produce supports_gsl_divergence", () => {
    const testCase: ConformanceCase<"mt"> = {
      name: "both divergent: supports=true, set={es} for lang=fr",
      kind: "mt",
      declaration: "both",
      expectation: { lang: "fr", expected: true },
      adapterFactory: () => new FakeMTBothDivergent(),
    };
    const result = evaluateConformanceCase(testCase);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("supports_gsl_divergence");
      expect(result.lang).toBe("fr");
      expect(result.expected).toBe(true);
      expect(result.actual).toBe(false);
      expect(result.sourcesDeclared).toEqual({ supports: true, gsl: true });
    }
  });

  it("10. idioma positivo que resuelve false produce positive_resolves_false", () => {
    const testCase: ConformanceCase<"mt"> = {
      name: "supports: positive[es] should resolve true",
      kind: "mt",
      declaration: "supports",
      expectation: { lang: "es", expected: true },
      adapterFactory: () => new FakeMTSupports([]),
    };
    const result = evaluateConformanceCase(testCase);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("positive_resolves_false");
      expect(result.lang).toBe("es");
      expect(result.expected).toBe(true);
      expect(result.actual).toBe(false);
    }
  });

  it("11. idioma negativo que resuelve true produce negative_resolves_true", () => {
    const testCase: ConformanceCase<"mt"> = {
      name: "supports: negative[fr] should resolve false",
      kind: "mt",
      declaration: "supports",
      expectation: { lang: "fr", expected: false },
      adapterFactory: () => new FakeMTSupports(["fr"]),
    };
    const result = evaluateConformanceCase(testCase);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("negative_resolves_true");
      expect(result.lang).toBe("fr");
      expect(result.expected).toBe(false);
      expect(result.actual).toBe(true);
    }
  });

  it("12. factory produce instancia fresca por evaluación", () => {
    const instances: Array<AdapterBase<"mt">> = [];
    const factory = (): AdapterBase<"mt"> => {
      const a = new FakeMTBoth(["es"]);
      instances.push(a);
      return a;
    };
    const testCase: ConformanceCase<"mt"> = {
      name: "factory freshness probe",
      kind: "mt",
      declaration: "both",
      expectation: { lang: "es", expected: true },
      adapterFactory: factory,
    };
    const before = instances.length;
    const result = evaluateConformanceCase(testCase);
    expect(result).toEqual({ ok: true });
    // Expectation non-null → nondeterminism probe requires a second instance.
    expect(instances.length - before).toBeGreaterThanOrEqual(2);
    const identitySet = new Set(instances);
    expect(identitySet.size).toBe(instances.length);
  });

  it("13. mutación del adapter produce adapter_mutated", () => {
    const testCase: ConformanceCase<"mt"> = {
      name: "adapter mutation probe",
      kind: "mt",
      declaration: "supports",
      expectation: { lang: "es", expected: true },
      adapterFactory: () => new FakeMTMutatingRef(),
    };
    const result = evaluateConformanceCase(testCase);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("adapter_mutated");
    }
  });

  it("14. mutación del Set produce set_mutated", () => {
    const testCase: ConformanceCase<"mt"> = {
      name: "set mutation probe",
      kind: "mt",
      declaration: "gsl",
      expectation: null,
      adapterFactory: () => new FakeMTSetMutating(),
    };
    const result = evaluateConformanceCase(testCase);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("set_mutated");
    }
  });

  it("15. LangCode inválido de runtime produce invalid_langcode_declared", () => {
    const testCase: ConformanceCase<"mt"> = {
      name: "invalid lang probe",
      kind: "mt",
      declaration: "supports",
      expectation: { lang: "xx" as LangCode, expected: true },
      adapterFactory: () => new FakeMTSupports(["es"]),
    };
    const result = evaluateConformanceCase(testCase);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_langcode_declared");
    }
  });

  it("16. cero re-export público y cero patrón prohibido en conformance.ts", () => {
    const barrel = fs.readFileSync(ENGINE_BARREL_PATH, "utf-8");
    expect(barrel).not.toMatch(/conformance/);
    const conformanceSrc = fs.readFileSync(CONFORMANCE_SRC_PATH, "utf-8");
    // ADR-004 §2.7 forbidden pattern (Plan §14.5.15 + Plan §18).
    expect(conformanceSrc).not.toMatch(/getSupportedLanguages\s*\(\s*\)\s*\.\s*has\s*\(/);
    // Plan §14.5.16 — no capabilities.languages access.
    expect(conformanceSrc).not.toMatch(/capabilities\.languages/);
    // Plan §15.1 — the test file itself must not import resolve-language-support.
    const testSrc = fs.readFileSync(CONFORMANCE_TEST_PATH, "utf-8");
    expect(testSrc).not.toMatch(/from\s+["']\.\/resolve-language-support["']/);
  });

  it("17. misma infraestructura reutilizada sobre 2 AdapterKind sin duplicar lógica", () => {
    const mtProfile: ConformanceProfile<"mt"> = {
      kind: "mt",
      declares: "both",
      positiveLangs: ["es"],
      negativeLangs: ["fr"],
      production: true,
    };
    const sttProfile: ConformanceProfile<"stt"> = {
      kind: "stt",
      declares: "both",
      positiveLangs: ["es"],
      negativeLangs: ["fr"],
      production: true,
    };
    const mtCases = buildConformanceCases(
      mtProfile,
      (): AdapterBase<"mt"> => new FakeMTBoth(["es"]),
    );
    const sttCases = buildConformanceCases(
      sttProfile,
      (): AdapterBase<"stt"> => new FakeSTTBoth(["es"]),
    );
    for (const c of mtCases) {
      expect(evaluateConformanceCase(c)).toEqual({ ok: true });
    }
    for (const c of sttCases) {
      expect(evaluateConformanceCase(c)).toEqual({ ok: true });
    }
    expect(mtCases.length).toBeGreaterThan(0);
    expect(sttCases.length).toBeGreaterThan(0);
  });
});
