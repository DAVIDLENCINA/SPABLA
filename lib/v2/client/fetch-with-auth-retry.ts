/**
 * SPABLA V2 · Hito 9.3.1-Q3 · Fetch helper with bounded auth retry.
 * SPABLA V2 · Hito 9.3.1-Q3-R · Devuelve `AuthRetryResult` discriminado
 *   para que el caller distinga entre `response` (procesar normal),
 *   `terminal_auth` (recovery destructiva autorizada) y `transient_auth`
 *   (conservar sesión, mostrar TransientError).
 *
 * Contract (Q3-R):
 *
 *   1. Attach `Authorization: Bearer <access_token>` from the current
 *      Supabase session (if any).
 *   2. Execute the fetch.
 *   3. If `res.status !== 401` → `{ kind: "response", response: res }`.
 *   4. If `res.status === 401`, invoke the shared single-flight refresh:
 *      - `renewed` → retry ONCE with the new token; return the retry
 *        response as `{ kind: "response", response }` if it is not a
 *        401, or `{ kind: "terminal_auth", response }` if the retry
 *        also returned 401 (concluding authentication failure).
 *      - `no_session` → `{ kind: "terminal_auth", response: first401 }`.
 *      - `terminal_invalid` → `{ kind: "terminal_auth", response: first401 }`.
 *      - `transient_failure` → `{ kind: "transient_auth", error }`.
 *        NEVER returns a 401 response in this branch: the caller MUST
 *        conserve the persisted session and MUST NOT invoke signOut.
 *   5. If the initial `fetch` throws (network error), returns
 *      `{ kind: "network_error", error }`. Caller must NOT invoke
 *      signOut.
 *
 * Maximum ONE retry per invocation. Body/method/headers preserved
 * byte-identical on the retry — only Authorization is rebuilt.
 *
 * No token, refresh token, JWT or Authorization header value is
 * logged by this helper.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { refreshSessionOnce, type RefreshError } from "./session-refresh-coordinator";

export type AuthRetryOutcome =
  | { readonly kind: "response"; readonly response: Response }
  | { readonly kind: "terminal_auth"; readonly response: Response }
  | { readonly kind: "transient_auth"; readonly error: RefreshError }
  | { readonly kind: "network_error"; readonly error: unknown };

export type AuthRetryDeps = {
  /**
   * Overrides the default session lookup. If omitted, uses
   * `supabase.auth.getSession()`. Exposed for tests.
   */
  readonly readAccessToken?: () => Promise<string | null>;
};

const AUTH_HEADER = "Authorization";

/**
 * Executes `fetch(input, init)` with a single bounded auth retry on
 * 401. Returns a tagged `AuthRetryOutcome` so the caller can classify
 * the result deterministically without inspecting HTTP status alone.
 */
export async function fetchWithAuthRetry(
  supabase: SupabaseClient,
  input: RequestInfo | URL,
  init: RequestInit = {},
  deps: AuthRetryDeps = {},
): Promise<AuthRetryOutcome> {
  const readAccessToken = deps.readAccessToken ?? (async () => {
    const { data } = await supabase.auth.getSession();
    return data.session != null ? data.session.access_token : null;
  });

  const initialToken = await readAccessToken();
  const firstInit = initialToken !== null
    ? applyAuthorization(init, initialToken)
    : init;

  let firstResponse: Response;
  try {
    firstResponse = await fetch(input, firstInit);
  } catch (networkErr) {
    // Network-level failure BEFORE any HTTP status. Treat as transient;
    // never trigger destructive recovery.
    return { kind: "network_error", error: networkErr };
  }

  if (firstResponse.status !== 401) {
    return { kind: "response", response: firstResponse };
  }

  // 401 — attempt a single-flight refresh.
  const outcome = await refreshSessionOnce(supabase);

  if (outcome.kind === "renewed") {
    const retryInit = applyAuthorization(init, outcome.session.access_token);
    let retryResponse: Response;
    try {
      retryResponse = await fetch(input, retryInit);
    } catch (networkErr) {
      // Retry itself hit a network error. Report transient — caller
      // preserves the session (which was just successfully refreshed).
      return { kind: "network_error", error: networkErr };
    }
    if (retryResponse.status === 401) {
      // Second 401 after a successful refresh: authentication is
      // concluding invalid. Caller may recover destructively.
      return { kind: "terminal_auth", response: retryResponse };
    }
    return { kind: "response", response: retryResponse };
  }

  if (outcome.kind === "transient_failure") {
    return { kind: "transient_auth", error: outcome.error };
  }

  // `no_session` or `terminal_invalid` — the caller is authorised to
  // trigger the destructive recovery. The original 401 response is
  // returned for observability (headers, correlation-id, etc.).
  return { kind: "terminal_auth", response: firstResponse };
}

function applyAuthorization(init: RequestInit, token: string): RequestInit {
  const nextHeaders = new Headers(init.headers ?? undefined);
  nextHeaders.set(AUTH_HEADER, `Bearer ${token}`);
  return { ...init, headers: nextHeaders };
}
