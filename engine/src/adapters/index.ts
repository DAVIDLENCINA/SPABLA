/**
 * SPABLA Engine — real adapters domain (Fase 7).
 *
 * Root of the real adapters domain established by ADR-006 §1. The
 * domain is INTERNAL to the engine and MUST NOT be re-exported from
 * `engine/src/index.ts` (ADR-006 §3, §4).
 *
 * ## Hito 7.1 — Domain existence
 *
 * Establishes only the domain's existence within the engine tree,
 * participating in the build and test systems without degrading the
 * baseline nor enlarging the public surface. No functional logic,
 * no real adapters, no provider integration.
 *
 * ## Hito 7.2 — Internal contract stabilised
 *
 * The normative contract of the domain is consolidated in the
 * INTERNAL document `CONTRACT.md` co-located in this directory. Any
 * adapter placed within this domain must consult it as its single
 * source of internal reference.
 *
 * The contract derives literally from:
 * - ADR-006 §§1–5 — location, options (a)/(b)/(c), public surface,
 *   hard prohibitions, semantic equivalence.
 * - ADR-004 §§2.3, 2.6, 2.7 — canonical semantics, no helper in the
 *   adapter registry, consumers always use `supports(lang)`.
 * - ADR-005 §5 — canonical language catalog.
 * - ADR-007 V1.1 §§4–9 — valid sources, precedence, fail-closed
 *   default, incoherences, materializer authorization, canonical
 *   forms F1/F2/F3, in-domain safeguard.
 *
 * Consumers of `AdapterBase` outside this domain (Managers, the
 * `AdapterRegistry`, the Engine, the Pipeline, Core API, V1, the
 * future SDK) MUST always call `adapter.supports(lang)` and MUST
 * NOT derive support manually — see ADR-004 §2.7 and ADR-007 V1.1
 * §8.
 *
 * No functional logic, no runtime resolver, no provider integration
 * are introduced by the Hito 7.2. The runtime materialization of
 * the default `supports(lang)` — including the concrete choice of
 * one of the canonical forms F1, F2 or F3 — belongs to the Hito 7.3
 * per the Plan Oficial de Fase 7 §7.
 */

export {};
