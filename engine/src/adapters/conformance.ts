import type {
  AdapterBase,
  AdapterKind,
} from "../types/adapters";
import {
  isLangCode,
  type LangCode,
} from "../types/language";
import { resolveLanguageSupport } from "./resolve-language-support";

/**
 * SPABLA Engine — internal, reusable adapter conformance infrastructure
 * (Fase 7 · Hito 7.4).
 *
 * Materialises the semantic contract fixed by ADR-006 §5, ADR-007 V1.1
 * §4–§8 and `engine/src/adapters/CONTRACT.md` for the adapters domain.
 * Enables any future real adapter to be verified against the same rules
 * without duplicating verification logic per adapter.
 *
 * Consumes `resolveLanguageSupport` (Hito 7.3, frozen in `0c17872`) as a
 * black box; never re-implements its precedence algorithm.
 *
 * @internal Not part of the public engine surface. MUST NOT be re-exported
 * from `engine/src/index.ts` nor from `engine/src/adapters/index.ts`
 * (ADR-006 §3, §4; ADR-007 V1.1 §9.1, §12; Plan Hito 7.4 §17).
 */

// ────────────────────────────────────────────────────────────────
// Public internal types — Plan Hito 7.4 §14.2 / §14.3
// ────────────────────────────────────────────────────────────────

export type ConformanceDeclaration =
  | "supports"
  | "gsl"
  | "both"
  | "none";

export type ConformanceReason =
  | "missing_supports"
  | "missing_gsl"
  | "unexpected_supports"
  | "unexpected_gsl"
  | "supports_gsl_divergence"
  | "positive_resolves_false"
  | "negative_resolves_true"
  | "invalid_langcode_declared"
  | "adapter_mutated"
  | "set_mutated"
  | "kind_mismatch"
  | "nondeterministic";

export type ConformanceProfile<K extends AdapterKind> = {
  readonly kind: K;
  readonly declares: ConformanceDeclaration;
  readonly positiveLangs: ReadonlyArray<LangCode>;
  readonly negativeLangs: ReadonlyArray<LangCode>;
  readonly production: boolean;
};

export type ConformanceSourceState = {
  readonly supports: boolean;
  readonly gsl: boolean;
};

export type ConformanceExpectation = {
  readonly lang: LangCode;
  readonly expected: boolean;
};

export type ConformanceCase<K extends AdapterKind> = {
  readonly name: string;
  readonly kind: K;
  readonly declaration: ConformanceDeclaration;
  readonly expectation: ConformanceExpectation | null;
  readonly adapterFactory: () => AdapterBase<K>;
};

export type ConformanceSuccess = {
  readonly ok: true;
};

export type ConformanceFailure<K extends AdapterKind> = {
  readonly ok: false;
  readonly reason: ConformanceReason;
  readonly adapterKind: K;
  readonly lang: LangCode | null;
  readonly expected: boolean | null;
  readonly actual: boolean | null;
  readonly sourcesDeclared: ConformanceSourceState;
};

export type ConformanceDiagnostic<K extends AdapterKind> =
  | ConformanceSuccess
  | ConformanceFailure<K>;

// ────────────────────────────────────────────────────────────────
// buildConformanceCases — Plan Hito 7.4 §14.4
// ────────────────────────────────────────────────────────────────

export function buildConformanceCases<K extends AdapterKind>(
  profile: ConformanceProfile<K>,
  adapterFactory: () => AdapterBase<K>,
): ReadonlyArray<ConformanceCase<K>> {
  // Structural translation for the "none + production === true" violation
  // documented in §14.6: a productive profile declaring "none" is a
  // structural incumplimiento; each generated case carries the declaration
  // that the adapter is failing to meet (supports), so the evaluator emits
  // `missing_supports` via §14.8 precedence.
  const declarationForCase: ConformanceDeclaration =
    profile.declares === "none" && profile.production
      ? "supports"
      : profile.declares;

  const cases: Array<ConformanceCase<K>> = [];
  const push = (
    name: string,
    expectation: ConformanceExpectation | null,
  ): void => {
    cases.push({
      name: `${profile.kind}/${profile.declares}: ${name}`,
      kind: profile.kind,
      declaration: declarationForCase,
      expectation,
      adapterFactory,
    });
  };

  push("kind matches profile", null);
  push("declaration structure matches profile", null);
  for (const lang of profile.positiveLangs) {
    push(`positive[${lang}] resolves true`, { lang, expected: true });
  }
  for (const lang of profile.negativeLangs) {
    push(`negative[${lang}] resolves false`, { lang, expected: false });
  }
  push("resolver is deterministic across fresh instances", null);
  push("adapter is not mutated during evaluation", null);
  push("supported Set is not mutated during evaluation", null);

  return Object.freeze(cases);
}

// ────────────────────────────────────────────────────────────────
// evaluateConformanceCase — Plan Hito 7.4 §14.5 / §14.6 / §14.7 / §14.8
// ────────────────────────────────────────────────────────────────

export function evaluateConformanceCase<K extends AdapterKind>(
  testCase: ConformanceCase<K>,
): ConformanceDiagnostic<K> {
  const adapter = testCase.adapterFactory();
  const supportsFn = typeof adapter.supports === "function";
  const gslFn = typeof adapter.getSupportedLanguages === "function";
  const sourcesDeclared: ConformanceSourceState = {
    supports: supportsFn,
    gsl: gslFn,
  };
  const fail = (
    reason: ConformanceReason,
    lang: LangCode | null,
    expected: boolean | null,
    actual: boolean | null,
  ): ConformanceFailure<K> => ({
    ok: false,
    reason,
    adapterKind: testCase.kind,
    lang,
    expected,
    actual,
    sourcesDeclared,
  });

  // §14.8 precedence 1: invalid_langcode_declared.
  if (
    testCase.expectation !== null
    && !isLangCode(testCase.expectation.lang)
  ) {
    return fail("invalid_langcode_declared", null, null, null);
  }

  // §14.8 precedence 2: kind_mismatch.
  if (adapter.kind !== testCase.kind) {
    return fail("kind_mismatch", null, null, null);
  }

  // §14.8 precedence 3–6: declaration presence/absence.
  const decl = testCase.declaration;
  if ((decl === "supports" || decl === "both") && !supportsFn) {
    return fail("missing_supports", null, null, null);
  }
  if ((decl === "gsl" || decl === "both") && !gslFn) {
    return fail("missing_gsl", null, null, null);
  }
  if ((decl === "gsl" || decl === "none") && supportsFn) {
    return fail("unexpected_supports", null, null, null);
  }
  if ((decl === "supports" || decl === "none") && gslFn) {
    return fail("unexpected_gsl", null, null, null);
  }

  // Snapshot for §14.8 precedence 10–11 (adapter_mutated / set_mutated).
  const kindInitial = adapter.kind;
  const supportsRefInitial = adapter.supports;
  const gslRefInitial = adapter.getSupportedLanguages;
  const capabilitiesRefInitial = adapter.capabilities;
  let setSizeInitial: number | null = null;
  let setSnapshotInitial: string | null = null;
  if (gslFn && adapter.getSupportedLanguages !== undefined) {
    const supported = adapter.getSupportedLanguages();
    setSizeInitial = supported.size;
    setSnapshotInitial = Array.from(supported).sort().join(",");
  }

  // §14.8 precedence 7: supports_gsl_divergence (only for "both" with lang).
  if (
    decl === "both"
    && testCase.expectation !== null
    && adapter.supports !== undefined
    && adapter.getSupportedLanguages !== undefined
  ) {
    const lang = testCase.expectation.lang;
    const supportsResult = adapter.supports(lang);
    const supported = adapter.getSupportedLanguages();
    const gslResult = supported.has(lang);
    if (supportsResult !== gslResult) {
      return fail("supports_gsl_divergence", lang, supportsResult, gslResult);
    }
  }

  // §14.8 precedence 8–9: resolution expectations.
  if (testCase.expectation !== null) {
    const lang = testCase.expectation.lang;
    const expected = testCase.expectation.expected;
    const actual = resolveLanguageSupport(adapter, lang);
    if (expected && actual !== true) {
      return fail("positive_resolves_false", lang, true, actual);
    }
    if (!expected && actual !== false) {
      return fail("negative_resolves_true", lang, false, actual);
    }
  }

  // §14.8 precedence 10: adapter_mutated.
  if (
    adapter.kind !== kindInitial
    || adapter.supports !== supportsRefInitial
    || adapter.getSupportedLanguages !== gslRefInitial
    || adapter.capabilities !== capabilitiesRefInitial
  ) {
    return fail("adapter_mutated", null, null, null);
  }

  // §14.8 precedence 11: set_mutated.
  if (
    gslFn
    && adapter.getSupportedLanguages !== undefined
    && setSizeInitial !== null
    && setSnapshotInitial !== null
  ) {
    const supportedAfter = adapter.getSupportedLanguages();
    const sizeAfter = supportedAfter.size;
    const snapshotAfter = Array.from(supportedAfter).sort().join(",");
    if (sizeAfter !== setSizeInitial || snapshotAfter !== setSnapshotInitial) {
      return fail("set_mutated", null, null, null);
    }
  }

  // §14.8 precedence 12: nondeterministic (fresh second instance per §14.5).
  if (testCase.expectation !== null) {
    const secondAdapter = testCase.adapterFactory();
    const lang = testCase.expectation.lang;
    const first = resolveLanguageSupport(adapter, lang);
    const second = resolveLanguageSupport(secondAdapter, lang);
    if (first !== second) {
      return fail("nondeterministic", lang, first, second);
    }
  }

  return { ok: true };
}
