/**
 * SPABLA V2 · Hito 9.2.4 · Singleton Supabase browser client + hook.
 *
 * The client is instantiated ONCE per page-load using the anon env
 * variables that Next.js exposes at build time. `useSupabaseBrowserClient`
 * subscribes via `useSyncExternalStore` so the component consumes a
 * cached, stable reference without ever calling `setState` inside a
 * `useEffect` (previous implementation triggered the
 * `react-hooks/set-state-in-effect` rule).
 *
 * SSR safety: on the server the snapshot resolves to `null` and no
 * client is created. The first client render calls `createClient` and
 * memoises the result for the lifetime of the tab.
 */

import { useSyncExternalStore } from "react";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const STORAGE_KEY = "spabla_v2_fase9_auth" as const;

let cachedClient: SupabaseClient | null = null;

function subscribeNoop(): () => void {
  // The client instance never changes over time; no subscription needed.
  return () => undefined;
}

function getClientSnapshot(): SupabaseClient | null {
  if (cachedClient !== null) return cachedClient;
  if (typeof window === "undefined") return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  cachedClient = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: STORAGE_KEY },
  });
  return cachedClient;
}

function getServerSnapshot(): SupabaseClient | null {
  return null;
}

export function useSupabaseBrowserClient(): SupabaseClient | null {
  return useSyncExternalStore(subscribeNoop, getClientSnapshot, getServerSnapshot);
}

/**
 * @internal — test helpers. Reset the cached client between tests to
 * avoid cross-suite leakage. Never invoked from productive code.
 */
export function __resetSupabaseBrowserClientForTests(): void {
  cachedClient = null;
}
