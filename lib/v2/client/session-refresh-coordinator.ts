/**
 * SPABLA V2 · Hito 9.3.1-Q3 · Single-flight session refresh coordinator.
 * SPABLA V2 · Hito 9.3.1-Q3-R · Nueva taxonomía discriminada de 4
 *   resultados para evitar la recuperación destructiva ante fallos
 *   transitorios (network / timeout / 429 / 5xx / desconocido).
 *
 * Guarantees that concurrent 401-triggered refresh attempts on the same
 * client instance share ONE `supabase.auth.refreshSession()` call. The
 * shared promise is cleared once resolved (or rejected) so a subsequent
 * refresh cycle can start fresh. There is NO cross-tab coordination.
 *
 * Contract (Q3-R):
 *
 *   `refreshSessionOnce(supabase)` returns a `RefreshOutcome` variant:
 *     - `renewed` (with `session`): the SDK produced a fresh session
 *       with an `access_token`. Caller may execute the bounded retry.
 *     - `no_session`: the SDK returned `{ data: { session: null },
 *       error: null }` — no material to refresh. Caller may transition
 *       to `SessionMissing` ONLY after the initial restoration is
 *       resolved; otherwise treat as transitional.
 *     - `terminal_invalid` (with sanitized `error`): concluding
 *       evidence that the `refresh_token` is expired, revoked or
 *       invalid. Caller may transition to `Expired`.
 *     - `transient_failure` (with sanitized `error`): network,
 *       timeout, DNS, 429, 5xx, or unclassified failure that does
 *       NOT prove invalidity. Caller MUST preserve the persisted
 *       session, MUST NOT call `signOut`, MUST NOT show login, and
 *       may transition to `TransientError` (Q2 §9).
 *
 *   Ambiguous errors default to `transient_failure` (safety-first
 *   principle: never destroy a renewable session without evidence).
 *
 *   Never logs the raw error message. Only the coarse category is
 *   observable via the returned enum.
 *
 * @internal — client-side auxiliary only.
 */

import type { Session, SupabaseClient } from "@supabase/supabase-js";

export type RefreshErrorCategory = "terminal_invalid" | "transient_failure";

export type RefreshError = {
  readonly category: RefreshErrorCategory;
};

export type RefreshOutcome =
  | { readonly kind: "renewed"; readonly session: Session }
  | { readonly kind: "no_session" }
  | { readonly kind: "terminal_invalid"; readonly error: RefreshError }
  | { readonly kind: "transient_failure"; readonly error: RefreshError };

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
      return classifyErrorOutcome(error);
    }
    if (data && data.session != null) {
      return { kind: "renewed", session: data.session };
    }
    return { kind: "no_session" };
  } catch (unexpected: unknown) {
    return classifyErrorOutcome(unexpected);
  }
}

// Structured status/name matchers for terminal invalidity. The Supabase
// SDK error shape is intentionally not part of the exported public
// surface, so we defensively read a few well-known fields.
type ErrorShape = {
  readonly status?: number;
  readonly name?: string;
  readonly code?: string;
  readonly message?: string;
};

function readErrorShape(err: unknown): ErrorShape {
  if (err && typeof err === "object") {
    const anyErr = err as Record<string, unknown>;
    return {
      status: typeof anyErr.status === "number" ? anyErr.status : undefined,
      name: typeof anyErr.name === "string" ? anyErr.name : undefined,
      code: typeof anyErr.code === "string" ? anyErr.code : undefined,
      message: typeof anyErr.message === "string" ? anyErr.message : undefined,
    };
  }
  if (typeof err === "string") return { message: err };
  return {};
}

// Terminal keywords: only match on tokens that concretely prove the
// refresh_token itself is unusable. `invalid_grant` is the OAuth2
// standard error for "refresh token expired/revoked".
const TERMINAL_KEYWORDS = [
  "invalid_grant",
  "refresh_token_not_found",
  "refresh token not found",
  "refresh_token has expired",
  "refresh_token has been revoked",
  "refresh token has been used",
  "session_not_found",
];

function classifyErrorOutcome(err: unknown): RefreshOutcome {
  const shape = readErrorShape(err);
  const lower = (shape.message ?? "").toLowerCase();
  const code = (shape.code ?? "").toLowerCase();

  // Explicit terminal signals — never destroy a session without one.
  if (code === "invalid_grant" || code === "refresh_token_not_found" || code === "session_not_found") {
    return { kind: "terminal_invalid", error: { category: "terminal_invalid" } };
  }
  for (const keyword of TERMINAL_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { kind: "terminal_invalid", error: { category: "terminal_invalid" } };
    }
  }
  // 401 with an explicit `invalid_grant`-like payload from Supabase Auth
  // (rare in JS SDK, but defensively covered).
  if (shape.status === 401 && (lower.includes("invalid") && lower.includes("refresh"))) {
    return { kind: "terminal_invalid", error: { category: "terminal_invalid" } };
  }

  // Everything else — network, timeout, DNS, rate-limit, 5xx or
  // unclassified — is treated as transient. The safety-first default
  // guarantees we never destroy a still-usable session because a
  // temporary infrastructure hiccup surfaced as an ambiguous error.
  return { kind: "transient_failure", error: { category: "transient_failure" } };
}

/**
 * @internal — test helper. Clears the shared promise between tests.
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
