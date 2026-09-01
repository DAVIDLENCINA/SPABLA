/**
 * SPABLA V2 · Hito 9.2.4 · External source of the language-preference
 * storage state.
 *
 * The browser sanity probe on `window.localStorage` runs ONCE per
 * page-load and its result is cached module-wide. `usePreferenceStorage`
 * subscribes via `useSyncExternalStore`, replacing the previous
 * `useEffect`-driven pattern that triggered
 * `react-hooks/set-state-in-effect`.
 *
 * The tri-valued state (`pending` | `available` | `unavailable`)
 * remains identical to the contract adopted in Hito 9.2.3 — only the
 * plumbing changes.
 */

import { useSyncExternalStore } from "react";

import type { MinimalStorage } from "./language-preference-store";
import type { PreferenceStorageState } from "./language-preference-hydration";

const PROBE_KEY = "__spabla_v2_pref_probe__" as const;
const SSR_STATE: PreferenceStorageState = { kind: "pending" };

let cachedState: PreferenceStorageState | null = null;

function subscribeNoop(): () => void {
  // The probe is one-shot; the resolved state never changes.
  return () => undefined;
}

function getClientSnapshot(): PreferenceStorageState {
  if (cachedState !== null) return cachedState;
  if (typeof window === "undefined") {
    cachedState = { kind: "unavailable" };
    return cachedState;
  }
  try {
    const ls = window.localStorage;
    ls.setItem(PROBE_KEY, "1");
    ls.removeItem(PROBE_KEY);
    const storage: MinimalStorage = {
      getItem: (k) => ls.getItem(k),
      setItem: (k, v) => ls.setItem(k, v),
    };
    cachedState = { kind: "available", storage };
  } catch {
    cachedState = { kind: "unavailable" };
  }
  return cachedState;
}

function getServerSnapshot(): PreferenceStorageState {
  return SSR_STATE;
}

export function usePreferenceStorage(): PreferenceStorageState {
  return useSyncExternalStore(subscribeNoop, getClientSnapshot, getServerSnapshot);
}

/**
 * @internal — test helper. Reset the cached probe so a test can
 * exercise the transition again.
 */
export function __resetPreferenceStorageForTests(): void {
  cachedState = null;
}
