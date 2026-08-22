/**
 * SPABLA V2 · Hito 9.2.4 · External source of the local seed cache.
 * SPABLA V2 · Hito 9.3.1-Q3 · Retired from the productive bootstrap
 *   path. `useSeedCache` remains as a DEV-ONLY convenience for the
 *   `DeveloperPanel` (which invokes `runSeed()` and consumes
 *   `writeSeedToCache`), but the productive chat page no longer
 *   depends on this snapshot: `GET /api/v2/bootstrap` (Q3, Q2 §10)
 *   is the server-authoritative source of `tenantId`,
 *   `conversationId`, memberships and selected conversation.
 *
 * The `/api/v2/seed` response is persisted to `window.localStorage` so
 * that the two demo browsers used during dev/demo stay aligned on the
 * same tenant + conversation + demo actor credentials. Previously this
 * was loaded from `useEffect`, which triggered
 * `react-hooks/set-state-in-effect`. This module publishes the cache
 * as an external source; components consume it with
 * `useSyncExternalStore`.
 *
 * Writes go through `writeSeedToCache` (invalidates snapshot + notifies
 * subscribers). Reads through `useSeedCache`. SSR yields the empty
 * snapshot.
 *
 * @dev-only — as of Q3 no productive code path reads this snapshot.
 */

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "spabla_v2_fase9_seed" as const;

export type SeedActor = {
  readonly actorId: string;
  readonly email: string;
  readonly password: string;
  readonly language: "es" | "en";
};

export type SeedResponse = {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly actorA: SeedActor;
  readonly actorB: SeedActor;
};

export type SeedSnapshot = {
  readonly seed: SeedResponse | null;
  readonly tenantId: string;
  readonly conversationId: string;
};

const EMPTY_SNAPSHOT: SeedSnapshot = { seed: null, tenantId: "", conversationId: "" };

const listeners = new Set<() => void>();
let cachedSnapshot: SeedSnapshot | null = null;

function notifyListeners(): void {
  for (const listener of listeners) listener();
}

function readFromStorage(): SeedSnapshot {
  if (typeof window === "undefined") return EMPTY_SNAPSHOT;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return EMPTY_SNAPSHOT;
  try {
    const parsed = JSON.parse(raw) as SeedResponse;
    if (
      typeof parsed.tenantId !== "string"
      || typeof parsed.conversationId !== "string"
    ) {
      return EMPTY_SNAPSHOT;
    }
    return { seed: parsed, tenantId: parsed.tenantId, conversationId: parsed.conversationId };
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

function subscribeToSeed(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSeedSnapshot(): SeedSnapshot {
  if (cachedSnapshot !== null) return cachedSnapshot;
  cachedSnapshot = readFromStorage();
  return cachedSnapshot;
}

function getServerSeedSnapshot(): SeedSnapshot {
  return EMPTY_SNAPSHOT;
}

export function useSeedCache(): SeedSnapshot {
  return useSyncExternalStore(subscribeToSeed, getSeedSnapshot, getServerSeedSnapshot);
}

export function writeSeedToCache(next: SeedResponse | null): void {
  if (typeof window !== "undefined") {
    if (next === null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  }
  cachedSnapshot = next === null
    ? EMPTY_SNAPSHOT
    : { seed: next, tenantId: next.tenantId, conversationId: next.conversationId };
  notifyListeners();
}

/**
 * @internal — test helper. Reset the cached snapshot so a test can
 * force a re-read (or simulate a fresh mount).
 */
export function __resetSeedCacheForTests(): void {
  cachedSnapshot = null;
  listeners.clear();
}
