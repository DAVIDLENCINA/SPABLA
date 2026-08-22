/**
 * SPABLA V2 · Hito 9.3.1-Q3 · Fetch helper with bounded auth retry.
 *
 * Wraps a `fetch(input, init)` call with a deterministic recovery path
 * for HTTP 401 responses on authenticated endpoints:
 *
 *   1. Attach `Authorization: Bearer <access_token>` from the current
 *      Supabase session (if any).
 *   2. Execute the fetch.
 *   3. If `res.status !== 401`, return the response verbatim.
 *   4. If `res.status === 401`, invoke the shared single-flight refresh
 *      coordinator (`refreshSessionOnce`). Depending on the outcome:
 *        - `renewed` → serialise the new `access_token` and retry the
 *          original request EXACTLY ONCE. Return the retry response
 *          (whatever its status).
 *        - `no_session` / `failed` → return the ORIGINAL 401 response
 *          untouched so the caller can trigger the destructive
 *          recovery transition.
 *
 * Contract (Q2 §7):
 *   - Maximum ONE retry per invocation. A second 401 after the retry
 *     is NEVER refreshed again in this helper; caller decides.
 *   - Body/headers/method/etc. from `init` are preserved byte-identical
 *     on the retry, only the `Authorization` header is rebuilt.
 *   - This helper is safe for idempotent GETs and for POST /api/v2/messages
 *     (which uses `clientMessageId` as idempotency key). Callers must
 *     NOT use it for non-idempotent operations without an idempotency
 *     contract, per Q2 §5.3 / §7.
 *   - No token, refresh token, JWT or Authorization header value is
 *     logged by this helper.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { refreshSessionOnce } from "./session-refresh-coordinator";

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
 * 401. Returns the final `Response`.
 */
export async function fetchWithAuthRetry(
  supabase: SupabaseClient,
  input: RequestInfo | URL,
  init: RequestInit = {},
  deps: AuthRetryDeps = {},
): Promise<Response> {
  const readAccessToken = deps.readAccessToken ?? (async () => {
    const { data } = await supabase.auth.getSession();
    return data.session != null ? data.session.access_token : null;
  });

  const initialToken = await readAccessToken();
  const firstInit = initialToken !== null
    ? applyAuthorization(init, initialToken)
    : init;

  const firstResponse = await fetch(input, firstInit);
  if (firstResponse.status !== 401) {
    return firstResponse;
  }

  // 401 — attempt a single-flight refresh.
  const outcome = await refreshSessionOnce(supabase);
  if (outcome.kind !== "renewed") {
    // Refresh could not produce a fresh session. Return the original
    // 401 so the caller triggers the destructive recovery.
    return firstResponse;
  }

  const retryInit = applyAuthorization(init, outcome.session.access_token);
  return fetch(input, retryInit);
}

function applyAuthorization(init: RequestInit, token: string): RequestInit {
  const nextHeaders = new Headers(init.headers ?? undefined);
  nextHeaders.set(AUTH_HEADER, `Bearer ${token}`);
  return { ...init, headers: nextHeaders };
}
