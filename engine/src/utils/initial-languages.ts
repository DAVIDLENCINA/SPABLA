/**
 * SPABLA V2 — Fase 9 · Hito 9.1.1 · Initial language selection for the
 * visible bilingual conversation surface.
 *
 * Pure function. Given the currently signed-in actor id and the seed
 * bootstrap (two known actors, each with a preferred language), returns
 * the pair of `(myLanguage, targetLanguage)` that should populate the
 * chat surface for that actor.
 *
 * Rule (Fase 9 · Hito 9.1.1 · D1):
 *   `targetLanguage === myLanguage`
 *
 * The "target" is what the user wants to READ in, not the counterpart's
 * language. Every message from another participant is translated to
 * `myLanguage`; messages the user wrote themselves become a passthrough.
 *
 * The function returns `null` for an unknown actor — the caller MUST
 * NOT invent an identity on their behalf. When `null`, the caller
 * should leave existing UI selections untouched.
 *
 * @internal Not part of the public engine surface.
 */

import type { LangCode } from "../types/language";

export type SeededActor = {
  readonly actorId: string;
  readonly language: LangCode;
};

export type SeedForInitialLanguages = {
  readonly actorA: SeededActor;
  readonly actorB: SeededActor;
};

export type InitialLanguages = {
  readonly myLanguage: LangCode;
  readonly targetLanguage: LangCode;
};

export function initialLanguagesFor(
  actorId: string | null | undefined,
  seed: SeedForInitialLanguages | null | undefined,
): InitialLanguages | null {
  if (typeof actorId !== "string" || actorId.length === 0) return null;
  if (!seed || !seed.actorA || !seed.actorB) return null;
  if (actorId === seed.actorA.actorId) {
    return { myLanguage: seed.actorA.language, targetLanguage: seed.actorA.language };
  }
  if (actorId === seed.actorB.actorId) {
    return { myLanguage: seed.actorB.language, targetLanguage: seed.actorB.language };
  }
  return null;
}
