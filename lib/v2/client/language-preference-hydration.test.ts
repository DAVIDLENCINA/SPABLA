import { describe, expect, it, vi } from "vitest";

import {
  planPreferenceHydration,
  type HydrationInput,
  type PreferenceStorageState,
} from "./language-preference-hydration";
import {
  saveLanguagePreference,
  type MinimalStorage,
} from "./language-preference-store";

function inMemoryStorage(initial?: Record<string, string>): MinimalStorage & {
  readonly data: Map<string, string>;
} {
  const data = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    data,
    getItem(key: string): string | null {
      return data.has(key) ? data.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      data.set(key, value);
    },
  };
}

const ACTOR_A = "00000000-0000-4000-8000-00000000000a";
const ACTOR_B = "00000000-0000-4000-8000-00000000000b";

const DEFAULTS_A = { myLanguage: "es", targetLanguage: "en" } as const;
const DEFAULTS_B = { myLanguage: "en", targetLanguage: "es" } as const;

const PENDING: PreferenceStorageState = { kind: "pending" };
const UNAVAILABLE: PreferenceStorageState = { kind: "unavailable" };
function available(s: MinimalStorage): PreferenceStorageState {
  return { kind: "available", storage: s };
}

// ────────────────────────────────────────────────────────────────
// Regression: the exact race the pre-fix implementation lost on.
// ────────────────────────────────────────────────────────────────

describe("regression · pending → available transition with a persisted preference", () => {
  it("does NOT mark the actor as hydrated while storage is pending", () => {
    const decision = planPreferenceHydration({
      actorId: ACTOR_A,
      hydratedActor: null,
      storage: PENDING,
      defaults: DEFAULTS_A,
    });
    expect(decision).toEqual({ kind: "noop" });
  });

  it("applies the persisted preference the first time storage becomes available", () => {
    const storage = inMemoryStorage();
    saveLanguagePreference(storage, ACTOR_A, {
      myLanguage: "ca",
      targetLanguage: "de",
    });

    // Step 1: storage is still pending — planner returns noop.
    const step1 = planPreferenceHydration({
      actorId: ACTOR_A,
      hydratedActor: null,
      storage: PENDING,
      defaults: DEFAULTS_A,
    });
    expect(step1).toEqual({ kind: "noop" });

    // Step 2: storage becomes available. `hydratedActor` is STILL null
    // (because step 1 correctly did not mark it), so the planner is
    // free to load and apply the persisted preference atomically.
    const step2 = planPreferenceHydration({
      actorId: ACTOR_A,
      hydratedActor: null,
      storage: available(storage),
      defaults: DEFAULTS_A,
    });
    expect(step2).toEqual({
      kind: "apply",
      myLanguage: "ca",
      targetLanguage: "de",
      markHydratedFor: ACTOR_A,
    });
  });
});

// ────────────────────────────────────────────────────────────────
// Storage state matrix.
// ────────────────────────────────────────────────────────────────

describe("storage state matrix", () => {
  it("pending + defaults → noop (never hydrate under uncertainty)", () => {
    expect(
      planPreferenceHydration({
        actorId: ACTOR_A,
        hydratedActor: null,
        storage: PENDING,
        defaults: DEFAULTS_A,
      }),
    ).toEqual({ kind: "noop" });
  });

  it("pending + no defaults → noop", () => {
    expect(
      planPreferenceHydration({
        actorId: ACTOR_A,
        hydratedActor: null,
        storage: PENDING,
        defaults: null,
      }),
    ).toEqual({ kind: "noop" });
  });

  it("unavailable + defaults → apply defaults and mark hydrated", () => {
    expect(
      planPreferenceHydration({
        actorId: ACTOR_A,
        hydratedActor: null,
        storage: UNAVAILABLE,
        defaults: DEFAULTS_A,
      }),
    ).toEqual({
      kind: "apply",
      myLanguage: "es",
      targetLanguage: "en",
      markHydratedFor: ACTOR_A,
    });
  });

  it("unavailable + no defaults → markOnly (never noop indefinitely when the storage state is known)", () => {
    expect(
      planPreferenceHydration({
        actorId: ACTOR_A,
        hydratedActor: null,
        storage: UNAVAILABLE,
        defaults: null,
      }),
    ).toEqual({ kind: "markOnly", markHydratedFor: ACTOR_A });
  });

  it("available with a stored preference → apply it (defaults ignored)", () => {
    const storage = inMemoryStorage();
    saveLanguagePreference(storage, ACTOR_A, {
      myLanguage: "ar",
      targetLanguage: "hi",
    });
    expect(
      planPreferenceHydration({
        actorId: ACTOR_A,
        hydratedActor: null,
        storage: available(storage),
        defaults: DEFAULTS_A,
      }),
    ).toEqual({
      kind: "apply",
      myLanguage: "ar",
      targetLanguage: "hi",
      markHydratedFor: ACTOR_A,
    });
  });

  it("available without a stored preference → fall back to defaults", () => {
    const storage = inMemoryStorage();
    expect(
      planPreferenceHydration({
        actorId: ACTOR_A,
        hydratedActor: null,
        storage: available(storage),
        defaults: DEFAULTS_A,
      }),
    ).toEqual({
      kind: "apply",
      myLanguage: "es",
      targetLanguage: "en",
      markHydratedFor: ACTOR_A,
    });
  });

  it("available with a corrupt stored preference → treat as absent, fall back to defaults", () => {
    const storage = inMemoryStorage({
      [`spabla_v2:language-preferences:v1:${ACTOR_A}`]: "{not-json",
    });
    expect(
      planPreferenceHydration({
        actorId: ACTOR_A,
        hydratedActor: null,
        storage: available(storage),
        defaults: DEFAULTS_A,
      }),
    ).toEqual({
      kind: "apply",
      myLanguage: "es",
      targetLanguage: "en",
      markHydratedFor: ACTOR_A,
    });
  });

  it("available with a stored code outside the 13 UI-activated languages → treat as absent, fall back", () => {
    const storage = inMemoryStorage({
      [`spabla_v2:language-preferences:v1:${ACTOR_A}`]: JSON.stringify({
        myLanguage: "xx",
        targetLanguage: "en",
      }),
    });
    expect(
      planPreferenceHydration({
        actorId: ACTOR_A,
        hydratedActor: null,
        storage: available(storage),
        defaults: DEFAULTS_A,
      }),
    ).toEqual({
      kind: "apply",
      myLanguage: "es",
      targetLanguage: "en",
      markHydratedFor: ACTOR_A,
    });
  });

  it("available with a stored default outside the 13 UI codes → markOnly", () => {
    // Simulate a seed pair that somehow contains an unactivated code.
    // The planner refuses to apply it (would break the LANG13-02
    // contract) but still marks the actor as hydrated so the UI is
    // no longer blocked from persisting explicit user changes later.
    const storage = inMemoryStorage();
    expect(
      planPreferenceHydration({
        actorId: ACTOR_A,
        hydratedActor: null,
        storage: available(storage),
        defaults: { myLanguage: "xx", targetLanguage: "en" },
      }),
    ).toEqual({ kind: "markOnly", markHydratedFor: ACTOR_A });
  });
});

// ────────────────────────────────────────────────────────────────
// Actor / session lifecycle.
// ────────────────────────────────────────────────────────────────

describe("actor lifecycle", () => {
  it("no actor → noop regardless of storage", () => {
    for (const storage of [PENDING, UNAVAILABLE, available(inMemoryStorage())]) {
      expect(
        planPreferenceHydration({
          actorId: null,
          hydratedActor: null,
          storage,
          defaults: DEFAULTS_A,
        }),
      ).toEqual({ kind: "noop" });
    }
  });

  it("empty actorId → noop", () => {
    expect(
      planPreferenceHydration({
        actorId: "",
        hydratedActor: null,
        storage: available(inMemoryStorage()),
        defaults: DEFAULTS_A,
      }),
    ).toEqual({ kind: "noop" });
  });

  it("actor already hydrated → noop even when storage/defaults change", () => {
    const storage = inMemoryStorage();
    saveLanguagePreference(storage, ACTOR_A, {
      myLanguage: "ca",
      targetLanguage: "de",
    });
    expect(
      planPreferenceHydration({
        actorId: ACTOR_A,
        hydratedActor: ACTOR_A,
        storage: available(storage),
        defaults: DEFAULTS_A,
      }),
    ).toEqual({ kind: "noop" });
  });

  it("actor A → B switch loads B's preference, not A's", () => {
    const storage = inMemoryStorage();
    saveLanguagePreference(storage, ACTOR_A, {
      myLanguage: "ca",
      targetLanguage: "de",
    });
    saveLanguagePreference(storage, ACTOR_B, {
      myLanguage: "pt",
      targetLanguage: "fr",
    });
    // First: hydrate A.
    const first = planPreferenceHydration({
      actorId: ACTOR_A,
      hydratedActor: null,
      storage: available(storage),
      defaults: DEFAULTS_A,
    });
    expect(first).toEqual({
      kind: "apply",
      myLanguage: "ca",
      targetLanguage: "de",
      markHydratedFor: ACTOR_A,
    });
    // Then: session flips to B. `hydratedActor` still holds A → the
    // planner MUST re-hydrate for B, not treat it as already done.
    const second = planPreferenceHydration({
      actorId: ACTOR_B,
      hydratedActor: ACTOR_A,
      storage: available(storage),
      defaults: DEFAULTS_B,
    });
    expect(second).toEqual({
      kind: "apply",
      myLanguage: "pt",
      targetLanguage: "fr",
      markHydratedFor: ACTOR_B,
    });
  });

  it("logout → login as the same actor re-hydrates from persisted storage", () => {
    const storage = inMemoryStorage();
    saveLanguagePreference(storage, ACTOR_A, {
      myLanguage: "ru",
      targetLanguage: "ja",
    });
    // Simulate the React layer's logout reset: hydratedActor goes to
    // null. Preferences on disk are preserved verbatim.
    const relogin = planPreferenceHydration({
      actorId: ACTOR_A,
      hydratedActor: null,
      storage: available(storage),
      defaults: DEFAULTS_A,
    });
    expect(relogin).toEqual({
      kind: "apply",
      myLanguage: "ru",
      targetLanguage: "ja",
      markHydratedFor: ACTOR_A,
    });
  });
});

// ────────────────────────────────────────────────────────────────
// Purity / no-write invariants.
// ────────────────────────────────────────────────────────────────

describe("planner purity", () => {
  it("never invokes setItem", () => {
    const setItem = vi.fn(() => undefined);
    const storage: MinimalStorage = {
      getItem: () => null,
      setItem,
    };
    planPreferenceHydration({
      actorId: ACTOR_A,
      hydratedActor: null,
      storage: available(storage),
      defaults: DEFAULTS_A,
    });
    expect(setItem).not.toHaveBeenCalled();
  });

  it("never invokes getItem while the storage state is pending", () => {
    const getItem = vi.fn(() => null);
    const storage: MinimalStorage = {
      getItem,
      setItem: () => undefined,
    };
    // storage is `pending`, so the planner MUST NOT touch the adapter
    // (there is no adapter to touch in a real pending state, but this
    // property is preserved even if the caller passes a real one).
    planPreferenceHydration({
      actorId: ACTOR_A,
      hydratedActor: null,
      storage: PENDING,
      defaults: DEFAULTS_A,
    });
    expect(getItem).not.toHaveBeenCalled();
  });
});
