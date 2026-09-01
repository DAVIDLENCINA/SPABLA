import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type { AdapterBase } from "../types/adapters";
import type { LangCode } from "../types/language";

import {
  buildConformanceCases,
  evaluateConformanceCase,
  type ConformanceProfile,
} from "./conformance";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SELF_PATH = path.resolve(__dirname, "options-viability.test.ts");
const RESOLVER_PATH = path.resolve(__dirname, "resolve-language-support.ts");
const CONFORMANCE_PATH = path.resolve(__dirname, "conformance.ts");
const ADAPTERS_BARREL_PATH = path.resolve(__dirname, "index.ts");
const ENGINE_BARREL_PATH = path.resolve(__dirname, "..", "index.ts");

// ─── Synthetic fakes for Hito 7.5 (§6 of the brief plan) ───────────
// Local to this file. Not exported. Zero provider concreto. Zero I/O.

/**
 * Option (a) — ADR-006 §2(a).
 * Implements `supports(lang)` by delegating to an internal, self-owned
 * mechanism (a private Set). Omits `getSupportedLanguages`. The
 * adapter's `supports` is fully self-sufficient.
 */
class SyntheticAdapterOptionA implements AdapterBase<"mt"> {
  readonly kind = "mt" as const;
  private readonly internalCatalog: ReadonlySet<LangCode>;
  constructor(langs: ReadonlyArray<LangCode>) {
    this.internalCatalog = new Set(langs);
  }
  supports(lang: LangCode): boolean {
    return this.internalCatalog.has(lang);
  }
}

/**
 * Option (b) — ADR-006 §2(b).
 * Omits `supports(lang)`. Declares only `getSupportedLanguages()`. The
 * authorised in-domain consumer (`resolveLanguageSupport`, consumed
 * indirectly by `evaluateConformanceCase`) derives the result via the
 * frozen precedence of Hito 7.3. This test file does NOT import
 * `./resolve-language-support` directly (Plan §8).
 */
class SyntheticAdapterOptionB implements AdapterBase<"mt"> {
  readonly kind = "mt" as const;
  private readonly set: ReadonlySet<LangCode>;
  constructor(langs: ReadonlyArray<LangCode>) {
    this.set = new Set(langs);
  }
  getSupportedLanguages(): ReadonlySet<LangCode> {
    return this.set;
  }
}

/**
 * Option (c) — ADR-006 §2(c).
 * Implements `supports(lang)` with an optimisation distinct from
 * consulting the Set returned by `getSupportedLanguages()`: a frozen
 * `ReadonlyArray<LangCode>` scanned with `.includes()`. Both fuentes
 * are constructed from the same input, guaranteeing semantic
 * equivalence (ADR-006 §5) across every lang used in the scenario.
 */
class SyntheticAdapterOptionC implements AdapterBase<"mt"> {
  readonly kind = "mt" as const;
  private readonly optimizedArray: ReadonlyArray<LangCode>;
  private readonly set: ReadonlySet<LangCode>;
  constructor(langs: ReadonlyArray<LangCode>) {
    this.optimizedArray = Object.freeze([...langs]);
    this.set = new Set(langs);
  }
  supports(lang: LangCode): boolean {
    return this.optimizedArray.includes(lang);
  }
  getSupportedLanguages(): ReadonlySet<LangCode> {
    return this.set;
  }
}

// ─── The 5 tests (Plan §7) ─────────────────────────────────────────

describe("adapters/options-viability — Hito 7.5 (§7)", () => {
  it("1. viabilidad opción (a) — perfil 'supports' → todos los casos ok", () => {
    const positive: ReadonlyArray<LangCode> = ["es", "en"];
    const negative: ReadonlyArray<LangCode> = ["fr"];
    const profile: ConformanceProfile<"mt"> = {
      kind: "mt",
      declares: "supports",
      positiveLangs: positive,
      negativeLangs: negative,
      production: true,
    };
    const factory = (): AdapterBase<"mt"> =>
      new SyntheticAdapterOptionA(positive);
    const cases = buildConformanceCases(profile, factory);
    const positiveCases = cases.filter(
      (c) => c.expectation !== null && c.expectation.expected === true,
    );
    const negativeCases = cases.filter(
      (c) => c.expectation !== null && c.expectation.expected === false,
    );
    expect(positiveCases.length).toBeGreaterThanOrEqual(1);
    expect(negativeCases.length).toBeGreaterThanOrEqual(1);
    for (const c of cases) {
      const result = evaluateConformanceCase(c);
      if (!result.ok) {
        throw new Error(
          `Opción (a) falló en caso "${c.name}" con reason=${result.reason} lang=${String(result.lang)} expected=${String(result.expected)} actual=${String(result.actual)}`,
        );
      }
      expect(result).toEqual({ ok: true });
    }
  });

  it("2. viabilidad opción (b) — perfil 'gsl' → todos los casos ok", () => {
    const positive: ReadonlyArray<LangCode> = ["es", "en"];
    const negative: ReadonlyArray<LangCode> = ["fr"];
    const profile: ConformanceProfile<"mt"> = {
      kind: "mt",
      declares: "gsl",
      positiveLangs: positive,
      negativeLangs: negative,
      production: true,
    };
    const factory = (): AdapterBase<"mt"> =>
      new SyntheticAdapterOptionB(positive);
    const cases = buildConformanceCases(profile, factory);
    const positiveCases = cases.filter(
      (c) => c.expectation !== null && c.expectation.expected === true,
    );
    const negativeCases = cases.filter(
      (c) => c.expectation !== null && c.expectation.expected === false,
    );
    expect(positiveCases.length).toBeGreaterThanOrEqual(1);
    expect(negativeCases.length).toBeGreaterThanOrEqual(1);
    for (const c of cases) {
      const result = evaluateConformanceCase(c);
      if (!result.ok) {
        throw new Error(
          `Opción (b) falló en caso "${c.name}" con reason=${result.reason} lang=${String(result.lang)} expected=${String(result.expected)} actual=${String(result.actual)}`,
        );
      }
      expect(result).toEqual({ ok: true });
    }
  });

  it("3. viabilidad opción (c) — perfil 'both' con equivalencia semántica → todos los casos ok", () => {
    const positive: ReadonlyArray<LangCode> = ["es", "en", "de"];
    const negative: ReadonlyArray<LangCode> = ["fr", "it"];
    const profile: ConformanceProfile<"mt"> = {
      kind: "mt",
      declares: "both",
      positiveLangs: positive,
      negativeLangs: negative,
      production: true,
    };
    const factory = (): AdapterBase<"mt"> =>
      new SyntheticAdapterOptionC(positive);
    const cases = buildConformanceCases(profile, factory);
    const positiveCases = cases.filter(
      (c) => c.expectation !== null && c.expectation.expected === true,
    );
    const negativeCases = cases.filter(
      (c) => c.expectation !== null && c.expectation.expected === false,
    );
    expect(positiveCases.length).toBeGreaterThanOrEqual(1);
    expect(negativeCases.length).toBeGreaterThanOrEqual(1);
    for (const c of cases) {
      const result = evaluateConformanceCase(c);
      if (!result.ok) {
        throw new Error(
          `Opción (c) falló en caso "${c.name}" con reason=${result.reason} lang=${String(result.lang)} expected=${String(result.expected)} actual=${String(result.actual)}`,
        );
      }
      expect(result).toEqual({ ok: true });
    }
  });

  it("4. SE1 — superficie e higiene (cero re-export, cero patrón prohibido, cero proveedor concreto)", () => {
    const engineBarrel = fs.readFileSync(ENGINE_BARREL_PATH, "utf-8");
    expect(engineBarrel).not.toMatch(/options-viability/);
    const domainBarrel = fs.readFileSync(ADAPTERS_BARREL_PATH, "utf-8");
    expect(domainBarrel).not.toMatch(/options-viability/);
    const self = fs.readFileSync(SELF_PATH, "utf-8");
    // ADR-004 §2.7 forbidden pattern.
    expect(self).not.toMatch(/getSupportedLanguages\s*\(\s*\)\s*\.\s*has\s*\(/);
    // ADR-006 §4 / Plan §5.
    expect(self).not.toMatch(/capabilities\.languages/);
    // Cero mención de proveedor concreto (§7 SE1 del Plan). Los nombres
    // se construyen en runtime para que la propia salvaguarda no forme
    // los literales completos en el fuente y se dispare sobre sí misma.
    const forbiddenProviders: ReadonlyArray<string> = [
      "open" + "ai",
      "goo" + "gle",
      "azu" + "re",
      "elev" + "enlabs",
      "whis" + "per",
      "deep" + "gram",
      "anthro" + "pic",
    ];
    const providerRegex = new RegExp(
      `\\b(${forbiddenProviders.join("|")})\\b`,
      "i",
    );
    expect(self).not.toMatch(providerRegex);
  });

  it("5. SE2 — preservación (verificación estática mínima de firmas distintivas de Hitos 7.3 y 7.4)", () => {
    const resolverSrc = fs.readFileSync(RESOLVER_PATH, "utf-8");
    expect(resolverSrc).toMatch(/export function resolveLanguageSupport/);
    const conformanceSrc = fs.readFileSync(CONFORMANCE_PATH, "utf-8");
    expect(conformanceSrc).toMatch(/export function evaluateConformanceCase/);
  });
});
