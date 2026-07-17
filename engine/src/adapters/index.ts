/**
 * SPABLA Engine — real adapters domain (Fase 7, Hito 7.1).
 *
 * Root of the real adapters domain established by ADR-006 §1. The
 * domain is INTERNAL to the engine and MUST NOT be re-exported from
 * `engine/src/index.ts` (ADR-006 §3, §4).
 *
 * Hito 7.1 establishes only the domain's existence within the
 * engine tree, participating in the build and test systems without
 * degrading the baseline nor enlarging the public surface. No
 * functional logic, no real adapters, no provider integration.
 * Subsequent hitos materialize the internal contract per ADR-006.
 */

export {};
