/**
 * SPABLA V2 · Hito 9.2.3 · Race-safe hydration planner (client).
 *
 * Pure reconciliation between (a) the persisted local preference for
 * the currently authenticated actor and (b) the canonical defaults
 * emitted by `initialLanguagesFor` on the seeded actor. The planner
 * NEVER writes anywhere and NEVER dispatches React state directly;
 * it returns a decision the React layer applies.
 *
 * Why a tri-valued storage state
 * ==============================
 * The chat page owns two async signals that resolve independently:
 *   - Supabase Auth's `getSession()` promise → sets `session`;
 *   - The browser sanity probe on `window.localStorage` → sets the
 *     storage adapter.
 * React gives no ordering guarantee between them, so the storage
 * adapter can still be `null` when the first authenticated render
 * fires. Modelling the adapter as `Storage | null` collapses two
 * fundamentally different situations — "not yet probed" and
 * "definitively unavailable" — into one, which is exactly how the
 * pre-fix implementation lost the persisted preference.
 *
 * The three explicit kinds are:
 *   - `pending`     — probe not yet completed. NEVER mark the actor
 *                     as hydrated in this state.
 *   - `available`   — probe succeeded, storage is usable.
 *   - `unavailable` — probe failed (private mode, blocked, SSR).
 *                     Fall back to defaults; persistence disabled.
 */

import { loadLanguagePreference, type MinimalStorage } from "./language-preference-store";
import { isUiLanguageCode, type UiLanguageCode } from "./ui-languages";

export type PreferenceStorageState =
  | { readonly kind: "pending" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "available"; readonly storage: MinimalStorage };

/**
 * Loose default pair — typed as strings so the caller can forward
 * whatever `initialLanguagesFor` (or a similar seed-derived helper)
 * emits without pre-narrowing. Values outside the 13 UI-activated
 * codes are filtered inside the planner.
 */
export type DefaultsPair = {
  readonly myLanguage: string;
  readonly targetLanguage: string;
};

export type HydrationInput = {
  readonly actorId: string | null;
  readonly hydratedActor: string | null;
  readonly storage: PreferenceStorageState;
  readonly defaults: DefaultsPair | null;
};

export type HydrationDecision =
  | { readonly kind: "noop" }
  | {
      readonly kind: "apply";
      readonly myLanguage: UiLanguageCode;
      readonly targetLanguage: UiLanguageCode;
      readonly markHydratedFor: string;
    }
  | { readonly kind: "markOnly"; readonly markHydratedFor: string };

/**
 * Compute the next hydration action.
 *
 *  - No authenticated actor → noop (never touch state).
 *  - Actor already hydrated → noop (idempotent).
 *  - Storage `pending`     → noop (WAIT; do NOT mark hydrated).
 *  - Storage `available`   → load persisted preference; if valid,
 *                            apply it and mark hydrated. If none,
 *                            fall through to defaults.
 *  - Storage `unavailable` → skip the load; use defaults.
 *  - Defaults valid within the 13 UI-activated codes → apply +
 *    mark hydrated.
 *  - No defaults (unknown seed match) → mark hydrated only, without
 *    touching the selectors, so downstream persistence stays gated
 *    and the UI keeps whatever initial value it had.
 */
export function planPreferenceHydration(input: HydrationInput): HydrationDecision {
  const actor = input.actorId;
  if (typeof actor !== "string" || actor.length === 0) return { kind: "noop" };
  if (input.hydratedActor === actor) return { kind: "noop" };
  if (input.storage.kind === "pending") return { kind: "noop" };

  if (input.storage.kind === "available") {
    const stored = loadLanguagePreference(input.storage.storage, actor);
    if (stored !== null) {
      return {
        kind: "apply",
        myLanguage: stored.myLanguage,
        targetLanguage: stored.targetLanguage,
        markHydratedFor: actor,
      };
    }
  }

  if (
    input.defaults !== null
    && isUiLanguageCode(input.defaults.myLanguage)
    && isUiLanguageCode(input.defaults.targetLanguage)
  ) {
    return {
      kind: "apply",
      myLanguage: input.defaults.myLanguage,
      targetLanguage: input.defaults.targetLanguage,
      markHydratedFor: actor,
    };
  }

  return { kind: "markOnly", markHydratedFor: actor };
}
