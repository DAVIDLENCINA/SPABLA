import type {
  AdapterBase,
  AdapterKind,
} from "../types/adapters";
import type { LangCode } from "../types/language";

/**
 * SPABLA Engine — internal materializer of the default
 * `supports(lang)` semantics (Fase 7 · Hito 7.3).
 *
 * Internal, non-public helper of the adapters domain that resolves
 * whether an adapter declares support for a language, honouring the
 * precedence and fail-closed default fixed by ADR-007 V1.1.
 *
 * ## Precedence (ADR-007 V1.1 §5)
 *
 *  - **(a)** If `adapter.supports(lang)` is defined, its return value
 *    is final — even when `false`; the resolver does NOT fall back
 *    to the derivation.
 *  - **(b)** If `supports` is absent and `getSupportedLanguages()` is
 *    defined, the resolver derives the answer through the canonical
 *    form F1 (ADR-007 V1.1 §9.3): read the `ReadonlySet<LangCode>`
 *    into a named intermediate variable and test membership.
 *  - **(c)** If neither declaration exists, the resolver returns
 *    `false` (fail-closed, ADR-007 V1.1 §6).
 *
 * ## Non-responsibilities (ADR-007 V1.1 §7)
 *
 * The resolver is purely resolutory. It does NOT validate coherence
 * between `supports` and `getSupportedLanguages`, does NOT throw on
 * observed divergence, and does NOT know about
 * `capabilities.languages`, providers or `AdapterRegistry`. Coherence
 * validation is the responsibility of adapter conformance tests
 * (ADR-006 §5) and documentary audit.
 *
 * ## References
 *
 *  - ADR-006 §1 — location of the materialization.
 *  - ADR-006 §2(b) — authorised option for the derivation.
 *  - ADR-007 V1.1 §5 — precedence.
 *  - ADR-007 V1.1 §6 — fail-closed default.
 *  - ADR-007 V1.1 §7 — no runtime validation.
 *  - ADR-007 V1.1 §8 — authorised materializer.
 *  - ADR-007 V1.1 §9.3 — canonical form F1.
 *  - `engine/src/adapters/CONTRACT.md` — internal domain contract.
 *
 * @internal This symbol MUST NOT be re-exported from
 * `engine/src/index.ts` (ADR-006 §3, §4; ADR-007 V1.1 §9.1, §12).
 */
export function resolveLanguageSupport<K extends AdapterKind>(
  adapter: AdapterBase<K>,
  lang: LangCode,
): boolean {
  if (typeof adapter.supports === "function") {
    return adapter.supports(lang);
  }

  if (typeof adapter.getSupportedLanguages === "function") {
    const supported = adapter.getSupportedLanguages();
    return supported.has(lang);
  }

  return false;
}
