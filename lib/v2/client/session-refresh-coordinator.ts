/**
 * SPABLA V2 · Hito 9.3.1-Q3 · Single-flight session refresh coordinator.
 *
 * Guarantees that concurrent 401-triggered refresh attempts on the same
 * client instance share ONE `supabase.auth.refreshSession()` call. The
 * shared promise is cleared once resolved (or rejected) so a subsequent
 * refresh cycle can start fresh. There is NO cross-tab coordination: the
 * SDK's own `localStorage` + `onAuthStateChange` semantics are the only
 * cross-tab mechanism; anything beyond that is not in scope for Q3.
 *
 * Contract (Q2 §6):
 *   - `refreshSessionOnce(supabase)` returns a `RefreshOutcome` variant:
 *       - `renewed` (with `session`) when the refresh produced a fresh
 *         session containing an `access_token`.
 *       - `no_session` when the SDK returned `{ data: { session: null },
 *         error: null }` (rare but possible; treated as unrecoverable).
 *       - `failed` (with sanitized `error.category`) when the refresh
 *         threw or the SDK returned a non-null `error`.
 *   - Never logs the raw error message, never inspects tokens.
 *   - The coordinator holds NO retained references after resolution.
 *
 * @internal — no direct import from server code. This module is
 * strictly a client-side auxiliary of `page.tsx` and its tests.
 */

import type { Session, SupabaseClient } from "@supabase/supabase-js";

export type RefreshErrorCategory =
  | "refresh_invalid"
  | "refresh_transient"
  | "refresh_unknown";

export type RefreshError = {
  readonly category: RefreshErrorCategory;
};

export type RefreshOutcome =
  | { readonly kind: "renewed"; readonly session: Session }
  | { readonly kind: "no_session" }
  | { readonly kind: "failed"; readonly error: RefreshError };

let activePromise: Promise<RefreshOutcome> | null = null;

/**
 * Runs a single-flight `refreshSession()` per client instance. Concurrent
 * callers share the same promise; the promise is released on settle.
 */
export function refreshSessionOnce(
  supabase: SupabaseClient,
): Promise<RefreshOutcome> {
  if (activePromise !== null) {
    return activePromise;
  }
  const inFlight = runRefresh(supabase).finally(() => {
    // Release the shared reference only after the promise has settled.
    // A subsequent 401 cycle will start a brand-new refresh call.
    if (activePromise === inFlight) {
      activePromise = null;
    }
  });
  activePromise = inFlight;
  return inFlight;
}

async function runRefresh(
  supabase: SupabaseClient,
): Promise<RefreshOutcome> {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error !== null && error !== undefined) {
      return { kind: "failed", error: classifyRefreshError(error) };
    }
    if (data && data.session != null) {
      return { kind: "renewed", session: data.session };
    }
    return { kind: "no_session" };
  } catch (unexpected: unknown) {
    return { kind: "failed", error: classifyRefreshError(unexpected) };
  }
}

function classifyRefreshError(err: unknown): RefreshError {
  // Sanitised classification: we intentionally do NOT read `.message`,
  // `.status`, `.statusText` from the raw error into any log. The only
  // observable outcome is the coarse enum below.
  const description = describeError(err);
  if (description.includes("invalid") || description.includes("expired") || description.includes("revoked") || description.includes("refresh_token")) {
    return { category: "refresh_invalid" };
  }
  if (description.includes("network") || description.includes("timeout") || description.includes("fetch failed") || description.includes("unavailable")) {
    return { category: "refresh_transient" };
  }
  return { category: "refresh_unknown" };
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message.toLowerCase();
  if (typeof err === "string") return err.toLowerCase();
  if (err && typeof err === "object") {
    const candidate = (err as { message?: unknown }).message;
    if (typeof candidate === "string") return candidate.toLowerCase();
  }
  return "";
}

/**
 * @internal — test helper. Clears the shared promise between tests.
 * Never invoked from productive code.
 */
export function __resetSessionRefreshCoordinatorForTests(): void {
  activePromise = null;
}

/**
 * @internal — test helper. Introspects whether a refresh is currently
 * in flight. Used by concurrency tests to assert single-flight behaviour.
 */
export function __sessionRefreshInFlightForTests(): boolean {
  return activePromise !== null;
}
