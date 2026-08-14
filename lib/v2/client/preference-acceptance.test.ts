/**
 * SPABLA V2 · Hito 9.2.4 · PREF-ACCEPTANCE checklist tests.
 *
 * These tests codify the 8-point checklist of §5.3 of the Plan Hito
 * 9.2 V1.1 using only the deterministic primitives already available
 * in the client suite:
 *   - `loadLanguagePreference` / `saveLanguagePreference` with an
 *     injected `MinimalStorage`;
 *   - `planPreferenceHydration` with the tri-valued `PreferenceStorageState`.
 *
 * The 3 fresh browser-level checks that require a human observer
 * (real page reload, real logout/login through the UI, verification
 * that the Network tab shows zero calls to `api.openai.com`) live in
 * the companion acta at
 *   docs/audit_reports/AUDIT_2026-08-14_pref-acceptance.md
 * so that the automation covers the semantic invariants and the
 * operator only signs the visual ones — exactly the split §5.3
 * mandates.
 *
 * Zero call to OpenAI. Zero productive Supabase. Zero DOM. Zero
 * Playwright / Puppeteer / jsdom. Every ID and value is generated
 * or fixed in this file; no shared fixtures with other tests.
 */

import { describe, expect, it } from "vitest";

import {
  loadLanguagePreference,
  saveLanguagePreference,
  type MinimalStorage,
} from "./language-preference-store";
import {
  planPreferenceHydration,
  type PreferenceStorageState,
} from "./language-preference-hydration";

function inMemoryStorage(): MinimalStorage & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem(key) { return data.has(key) ? data.get(key)! : null; },
    setItem(key, value) { data.set(key, value); },
  };
}

const UNAVAILABLE_STORAGE: PreferenceStorageState = { kind: "unavailable" };

const ACTOR_A = "00000000-0000-4000-8000-00000000a0a0";
const ACTOR_B = "00000000-0000-4000-8000-00000000b0b0";

// Canonical seeded defaults for each actor. Represent what
// `initialLanguagesFor(actor, seed)` would emit in production; the
// planner uses them as fallback when there is no persisted preference.
const DEFAULTS_A = { myLanguage: "es", targetLanguage: "en" } as const;
const DEFAULTS_B = { myLanguage: "en", targetLanguage: "es" } as const;

/**
 * End-to-end verification that mirrors the productive flow:
 *   1. user opens the chat with a fresh browser (storage empty);
 *   2. planner falls back to the seeded defaults;
 *   3. user picks a preference through the UI, which triggers
 *      `saveLanguagePreference` under the hood;
 *   4. reload (simulated by rebuilding the storage adapter around
 *      the same underlying key/value bag) → planner reads the
 *      stored preference and applies it verbatim.
 */
describe("PREF-ACCEPTANCE · Checklist §5.3 (8 items)", () => {
  it("(1) Actor A guarda ca/de a través del store", () => {
    const storage = inMemoryStorage();
    saveLanguagePreference(storage, ACTOR_A, {
      myLanguage: "ca",
      targetLanguage: "de",
    });
    expect(loadLanguagePreference(storage, ACTOR_A)).toEqual({
      myLanguage: "ca",
      targetLanguage: "de",
    });
  });

  it("(2) Recarga lógica y recupera ca/de (planner sobrescribe defaults con la preferencia)", () => {
    const storage = inMemoryStorage();
    saveLanguagePreference(storage, ACTOR_A, {
      myLanguage: "ca",
      targetLanguage: "de",
    });
    // "Reload" the planner: fresh call, no hydrated actor, storage
    // available with the persisted preference.
    const decision = planPreferenceHydration({
      actorId: ACTOR_A,
      hydratedActor: null,
      storage: { kind: "available", storage },
      defaults: DEFAULTS_A,
    });
    expect(decision).toEqual({
      kind: "apply",
      myLanguage: "ca",
      targetLanguage: "de",
      markHydratedFor: ACTOR_A,
    });
  });

  it("(3) Logout/login del mismo actor conserva ca/de sin depender de estado en memoria", () => {
    const storage = inMemoryStorage();
    saveLanguagePreference(storage, ACTOR_A, {
      myLanguage: "ca",
      targetLanguage: "de",
    });
    // Simulate logout (session becomes null): planner returns noop
    // because there is no actor.
    const loggedOut = planPreferenceHydration({
      actorId: null,
      hydratedActor: null,
      storage: { kind: "available", storage },
      defaults: null,
    });
    expect(loggedOut).toEqual({ kind: "noop" });

    // Simulate login as the same actor: planner reads the persisted
    // value again — hydration is decoupled from any in-memory hydration
    // marker (that gets reset on logout by design in `page.tsx`).
    const loggedInAgain = planPreferenceHydration({
      actorId: ACTOR_A,
      hydratedActor: null,
      storage: { kind: "available", storage },
      defaults: DEFAULTS_A,
    });
    expect(loggedInAgain).toEqual({
      kind: "apply",
      myLanguage: "ca",
      targetLanguage: "de",
      markHydratedFor: ACTOR_A,
    });
  });

  it("(4) Actor B guarda pt/fr en el mismo storage compartido", () => {
    const storage = inMemoryStorage();
    saveLanguagePreference(storage, ACTOR_A, {
      myLanguage: "ca",
      targetLanguage: "de",
    });
    saveLanguagePreference(storage, ACTOR_B, {
      myLanguage: "pt",
      targetLanguage: "fr",
    });
    expect(loadLanguagePreference(storage, ACTOR_B)).toEqual({
      myLanguage: "pt",
      targetLanguage: "fr",
    });
  });

  it("(5) Actor B NO recibe ca/de (aislamiento por clave actor-scoped)", () => {
    const storage = inMemoryStorage();
    saveLanguagePreference(storage, ACTOR_A, {
      myLanguage: "ca",
      targetLanguage: "de",
    });
    saveLanguagePreference(storage, ACTOR_B, {
      myLanguage: "pt",
      targetLanguage: "fr",
    });
    // Simulate B logging in; planner sees B's preference, not A's.
    const decisionB = planPreferenceHydration({
      actorId: ACTOR_B,
      hydratedActor: null,
      storage: { kind: "available", storage },
      defaults: DEFAULTS_B,
    });
    expect(decisionB).toEqual({
      kind: "apply",
      myLanguage: "pt",
      targetLanguage: "fr",
      markHydratedFor: ACTOR_B,
    });
    // Independent probe: reading A's key directly still returns A's
    // preference, unaffected by B's write.
    expect(loadLanguagePreference(storage, ACTOR_A)).toEqual({
      myLanguage: "ca",
      targetLanguage: "de",
    });
  });

  it("(6) Volver a Actor A recupera exclusivamente ca/de tras el paso por B", () => {
    const storage = inMemoryStorage();
    // Full A → B → A cycle mimicking the manual acta.
    saveLanguagePreference(storage, ACTOR_A, {
      myLanguage: "ca",
      targetLanguage: "de",
    });
    saveLanguagePreference(storage, ACTOR_B, {
      myLanguage: "pt",
      targetLanguage: "fr",
    });
    // Login B, then login A.
    planPreferenceHydration({
      actorId: ACTOR_B,
      hydratedActor: null,
      storage: { kind: "available", storage },
      defaults: DEFAULTS_B,
    });
    const backToA = planPreferenceHydration({
      actorId: ACTOR_A,
      hydratedActor: null,
      storage: { kind: "available", storage },
      defaults: DEFAULTS_A,
    });
    expect(backToA).toEqual({
      kind: "apply",
      myLanguage: "ca",
      targetLanguage: "de",
      markHydratedFor: ACTOR_A,
    });
  });

  it("(7) Storage `unavailable` degrada a defaults sin romper la sesión ni el chat", () => {
    const decision = planPreferenceHydration({
      actorId: ACTOR_A,
      hydratedActor: null,
      storage: UNAVAILABLE_STORAGE,
      defaults: DEFAULTS_A,
    });
    // The planner marks the actor as hydrated and applies the
    // canonical defaults — the UI keeps working with `es/en`, and the
    // caller must NOT block on persistence being writable.
    expect(decision).toEqual({
      kind: "apply",
      myLanguage: "es",
      targetLanguage: "en",
      markHydratedFor: ACTOR_A,
    });
  });

  it("(7-bis) Save is a silent no-op when storage would throw (chat never crashes on write)", () => {
    const throwing: MinimalStorage = {
      getItem: () => null,
      setItem: () => { throw new Error("QuotaExceededError"); },
    };
    // Should not throw. `save` swallows the exception silently, so
    // the surrounding UI keeps working — the preference simply won't
    // survive a reload, which is the documented degradation mode
    // (§7.3 storage `unavailable`).
    expect(() =>
      saveLanguagePreference(throwing, ACTOR_A, {
        myLanguage: "ca",
        targetLanguage: "de",
      }),
    ).not.toThrow();
  });

  it("(8) Cero llamada a OpenAI: la reconciliación de preferencias no toca `spabla_v2.message_translations`", () => {
    // The planner is a pure function. It never issues HTTP, never
    // opens sockets, never spawns workers. The presence of this test
    // pins the invariant so a future edit that tries to fetch a
    // translation from within the hydration path fails obviously.
    const storage = inMemoryStorage();
    saveLanguagePreference(storage, ACTOR_A, {
      myLanguage: "ca",
      targetLanguage: "de",
    });
    let fetchCalls = 0;
    const originalFetch = globalThis.fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = () => {
      fetchCalls += 1;
      throw new Error("no fetch allowed during preference hydration");
    };
    try {
      planPreferenceHydration({
        actorId: ACTOR_A,
        hydratedActor: null,
        storage: { kind: "available", storage },
        defaults: DEFAULTS_A,
      });
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fetch = originalFetch;
    }
    expect(fetchCalls).toBe(0);
  });
});
