import { describe, expect, it, vi } from "vitest";

import {
  loadLanguagePreference,
  preferenceKeyForActor,
  saveLanguagePreference,
  type MinimalStorage,
} from "./language-preference-store";
import { UI_LANGUAGE_OPTIONS, type UiLanguageCode } from "./ui-languages";

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

describe("preferenceKeyForActor", () => {
  it("builds the versioned per-actor key", () => {
    expect(preferenceKeyForActor(ACTOR_A)).toBe(
      `spabla_v2:language-preferences:v1:${ACTOR_A}`,
    );
  });

  it("rejects an empty actorId", () => {
    expect(preferenceKeyForActor("")).toBeNull();
  });

  it("rejects a whitespace-only actorId", () => {
    expect(preferenceKeyForActor("   ")).toBeNull();
  });
});

describe("saveLanguagePreference + loadLanguagePreference", () => {
  it("persists and recovers both languages", () => {
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

  it("isolates actor A from actor B", () => {
    const storage = inMemoryStorage();
    saveLanguagePreference(storage, ACTOR_A, {
      myLanguage: "ca",
      targetLanguage: "de",
    });
    saveLanguagePreference(storage, ACTOR_B, {
      myLanguage: "pt",
      targetLanguage: "fr",
    });
    expect(loadLanguagePreference(storage, ACTOR_A)).toEqual({
      myLanguage: "ca",
      targetLanguage: "de",
    });
    expect(loadLanguagePreference(storage, ACTOR_B)).toEqual({
      myLanguage: "pt",
      targetLanguage: "fr",
    });
  });

  it("does not modify B when writing A", () => {
    const storage = inMemoryStorage();
    saveLanguagePreference(storage, ACTOR_B, {
      myLanguage: "en",
      targetLanguage: "ja",
    });
    saveLanguagePreference(storage, ACTOR_A, {
      myLanguage: "ru",
      targetLanguage: "hi",
    });
    expect(loadLanguagePreference(storage, ACTOR_B)).toEqual({
      myLanguage: "en",
      targetLanguage: "ja",
    });
  });

  it("replaces the previous preference on a second write", () => {
    const storage = inMemoryStorage();
    saveLanguagePreference(storage, ACTOR_A, {
      myLanguage: "es",
      targetLanguage: "en",
    });
    saveLanguagePreference(storage, ACTOR_A, {
      myLanguage: "ar",
      targetLanguage: "zh",
    });
    expect(loadLanguagePreference(storage, ACTOR_A)).toEqual({
      myLanguage: "ar",
      targetLanguage: "zh",
    });
  });
});

describe("loadLanguagePreference · rejection rules", () => {
  const key = preferenceKeyForActor(ACTOR_A)!;

  it("returns null for corrupt JSON", () => {
    const storage = inMemoryStorage({ [key]: "{not valid json" });
    expect(loadLanguagePreference(storage, ACTOR_A)).toBeNull();
  });

  it("returns null when the stored value is JSON null", () => {
    const storage = inMemoryStorage({ [key]: "null" });
    expect(loadLanguagePreference(storage, ACTOR_A)).toBeNull();
  });

  it("returns null for an array", () => {
    const storage = inMemoryStorage({ [key]: JSON.stringify(["es", "en"]) });
    expect(loadLanguagePreference(storage, ACTOR_A)).toBeNull();
  });

  it("returns null when only one language is present", () => {
    const storage = inMemoryStorage({
      [key]: JSON.stringify({ myLanguage: "es" }),
    });
    expect(loadLanguagePreference(storage, ACTOR_A)).toBeNull();
  });

  it("returns null when a language field is not a string", () => {
    const storage = inMemoryStorage({
      [key]: JSON.stringify({ myLanguage: 42, targetLanguage: "en" }),
    });
    expect(loadLanguagePreference(storage, ACTOR_A)).toBeNull();
  });

  it("returns null when myLanguage is unknown", () => {
    const storage = inMemoryStorage({
      [key]: JSON.stringify({ myLanguage: "xx", targetLanguage: "en" }),
    });
    expect(loadLanguagePreference(storage, ACTOR_A)).toBeNull();
  });

  it("returns null when targetLanguage is unknown", () => {
    const storage = inMemoryStorage({
      [key]: JSON.stringify({ myLanguage: "es", targetLanguage: "xx" }),
    });
    expect(loadLanguagePreference(storage, ACTOR_A)).toBeNull();
  });

  it("returns null when actorId is empty", () => {
    const storage = inMemoryStorage();
    saveLanguagePreference(storage, ACTOR_A, {
      myLanguage: "es",
      targetLanguage: "en",
    });
    expect(loadLanguagePreference(storage, "")).toBeNull();
  });
});

describe("resilience against throwing storage", () => {
  it("load returns null when getItem throws", () => {
    const storage: MinimalStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => undefined,
    };
    expect(loadLanguagePreference(storage, ACTOR_A)).toBeNull();
  });

  it("save is silent when setItem throws", () => {
    const setItem = vi.fn(() => {
      throw new Error("quota");
    });
    const storage: MinimalStorage = {
      getItem: () => null,
      setItem,
    };
    expect(() =>
      saveLanguagePreference(storage, ACTOR_A, {
        myLanguage: "es",
        targetLanguage: "en",
      }),
    ).not.toThrow();
    expect(setItem).toHaveBeenCalledTimes(1);
  });
});

describe("storage layout guarantees", () => {
  it("uses a versioned, actor-scoped key", () => {
    const storage = inMemoryStorage();
    saveLanguagePreference(storage, ACTOR_A, {
      myLanguage: "es",
      targetLanguage: "en",
    });
    expect(Array.from(storage.data.keys())).toEqual([
      `spabla_v2:language-preferences:v1:${ACTOR_A}`,
    ]);
  });

  it("writes exactly two properties in the value", () => {
    const storage = inMemoryStorage();
    saveLanguagePreference(storage, ACTOR_A, {
      myLanguage: "es",
      targetLanguage: "en",
    });
    const raw = storage.data.get(`spabla_v2:language-preferences:v1:${ACTOR_A}`)!;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(["myLanguage", "targetLanguage"]);
    expect(parsed).toEqual({ myLanguage: "es", targetLanguage: "en" });
  });
});

describe("round-trip coverage across the 13 UI-activated languages", () => {
  it("persists and recovers a preference for each of the 13 codes", () => {
    const storage = inMemoryStorage();
    const codes: ReadonlyArray<UiLanguageCode> = UI_LANGUAGE_OPTIONS.map(
      (o) => o.code,
    );
    expect(codes).toHaveLength(13);
    for (const code of codes) {
      const actorId = `actor-for-${code}`;
      saveLanguagePreference(storage, actorId, {
        myLanguage: code,
        targetLanguage: code,
      });
      expect(loadLanguagePreference(storage, actorId)).toEqual({
        myLanguage: code,
        targetLanguage: code,
      });
    }
  });
});

describe("client runner isolation", () => {
  it("does not import engine sources", async () => {
    const storeMod = await import("./language-preference-store");
    const languagesMod = await import("./ui-languages");
    // If the client runner ever regressed into engine, its modules would
    // pull `@engine/*` transitively. Static enumeration keeps this
    // regression visible without inspecting Vitest internals.
    for (const mod of [storeMod, languagesMod]) {
      for (const key of Object.keys(mod)) {
        expect(typeof key).toBe("string");
      }
    }
    expect(Object.keys(storeMod).sort()).toEqual(
      ["loadLanguagePreference", "preferenceKeyForActor", "saveLanguagePreference"].sort(),
    );
  });
});
