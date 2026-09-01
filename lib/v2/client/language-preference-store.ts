/**
 * SPABLA V2 · Hito 9.2.3 · Local language-preference store (client).
 *
 * Persists the two UI selectors ("Yo escribo en" / "Leer mensajes en")
 * per actor in the browser's own storage. Local to the browser and
 * the device — this is NOT account-level sync and NOT cross-device.
 *
 * The store is a pure module with an injected `MinimalStorage` port,
 * so it can be unit-tested with a deterministic in-memory fake and
 * driven from a real `window.localStorage` at the React layer.
 *
 * Storage key format (versioned + actor-scoped):
 *   spabla_v2:language-preferences:v1:<actorId>
 *
 * Stored JSON value (exactly two properties):
 *   { "myLanguage": "<UiLanguageCode>", "targetLanguage": "<UiLanguageCode>" }
 *
 * Failure policy:
 *  - Corrupt JSON, wrong shape, unknown codes, arrays, nulls, versions
 *    other than v1 → `load` returns null (no throw).
 *  - `getItem` / `setItem` throwing → swallowed silently so the chat
 *    keeps working even when storage is blocked (private mode, quota
 *    exceeded, security policy).
 *  - Empty actorId is rejected in both load and save (returns null /
 *    no-op) so a signed-out user can never read or overwrite another
 *    actor's preference.
 *
 * Privacy note: the storage key contains the actor's UUID (technical
 * identifier issued by Supabase Auth). The value never carries email,
 * password, JWT, tenant id or conversation id — only two ISO 639-1
 * codes drawn from the 13 UI-activated languages.
 */

import { isUiLanguageCode, type UiLanguageCode } from "./ui-languages";

export type LanguagePreference = {
  readonly myLanguage: UiLanguageCode;
  readonly targetLanguage: UiLanguageCode;
};

export type MinimalStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const KEY_PREFIX = "spabla_v2:language-preferences:v1:";

/**
 * Build the storage key for the given actor. Returns null when the
 * actorId is empty/blank — callers treat that as "no persistence".
 */
export function preferenceKeyForActor(actorId: string): string | null {
  if (typeof actorId !== "string") return null;
  const trimmed = actorId.trim();
  if (trimmed.length === 0) return null;
  return `${KEY_PREFIX}${trimmed}`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePreference(raw: string): LanguagePreference | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isPlainRecord(parsed)) return null;
  const my = parsed["myLanguage"];
  const target = parsed["targetLanguage"];
  if (!isUiLanguageCode(my) || !isUiLanguageCode(target)) return null;
  return { myLanguage: my, targetLanguage: target };
}

/**
 * Read the persisted preference for `actorId`. Returns null when:
 *   - actorId is empty;
 *   - storage has no entry for that actor;
 *   - the stored value is corrupt, has the wrong shape, or references
 *     a language outside the 13 UI-activated codes;
 *   - `storage.getItem` throws.
 * Never throws.
 */
export function loadLanguagePreference(
  storage: MinimalStorage,
  actorId: string,
): LanguagePreference | null {
  const key = preferenceKeyForActor(actorId);
  if (key === null) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  return parsePreference(raw);
}

/**
 * Persist `preference` for `actorId`. No-op (silent) when:
 *   - actorId is empty;
 *   - either language is outside the 13 UI-activated codes;
 *   - `storage.setItem` throws.
 * Writes exactly `{ "myLanguage": "...", "targetLanguage": "..." }`,
 * with no extra fields.
 *
 * The input is typed as loose strings so callers holding a broader
 * `LangCode` (55 ISO codes) can pass values directly; the runtime
 * check silently rejects anything outside the 13 UI-activated codes.
 */
export function saveLanguagePreference(
  storage: MinimalStorage,
  actorId: string,
  preference: { readonly myLanguage: string; readonly targetLanguage: string },
): void {
  const key = preferenceKeyForActor(actorId);
  if (key === null) return;
  if (!isUiLanguageCode(preference.myLanguage)) return;
  if (!isUiLanguageCode(preference.targetLanguage)) return;
  const serialized = JSON.stringify({
    myLanguage: preference.myLanguage,
    targetLanguage: preference.targetLanguage,
  });
  try {
    storage.setItem(key, serialized);
  } catch {
    // Silent degradation: storage blocked / quota exceeded. The chat
    // continues to work; the selection simply won't survive a reload.
  }
}
