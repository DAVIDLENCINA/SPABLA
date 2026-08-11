/**
 * SPABLA V2 — Fase 9 · Hito 9.1.1 · Polling response classifier.
 *
 * Pure decision helper for the /v2/chat polling loop. Given an HTTP
 * status and an optional parsed error body, tells the UI what to do
 * next: keep going, surface a transient error, or treat the session
 * as expired.
 *
 * The `expire` action is reserved EXCLUSIVELY for HTTP 401. Every
 * other non-2xx code — 403 (forbidden), 404 (not_found), 409
 * (conflict), 429 (rate limited), 5xx — is a transient or
 * business-level condition that must NOT force a sign-out; it is
 * surfaced through `pollError` so the user sees it without losing
 * their session.
 *
 * @internal Not part of the public engine surface.
 */

export type PollingResponseView = {
  readonly status: number;
};

export type PollingErrorBody = {
  readonly error?: string;
};

export type PollingAction =
  | { readonly kind: "ok" }
  | { readonly kind: "expire" }
  | { readonly kind: "surface"; readonly pollError: string };

export function classifyPollingResponse(
  res: PollingResponseView,
  body: PollingErrorBody | null | undefined,
): PollingAction {
  if (!res || typeof res.status !== "number") {
    return { kind: "surface", pollError: "poll_status_unknown" };
  }
  if (res.status >= 200 && res.status < 300) {
    return { kind: "ok" };
  }
  if (res.status === 401) {
    return { kind: "expire" };
  }
  const symbolic = body && typeof body.error === "string" && body.error.length > 0
    ? body.error
    : `poll_status_${res.status}`;
  return { kind: "surface", pollError: symbolic };
}

/**
 * Sentinel copy displayed to the user when the client has decided the
 * session must be re-established. Kept as a constant so the UI, tests
 * and any future notification path share the same wording.
 */
export const SESSION_EXPIRED_MESSAGE =
  "Tu sesión ha caducado. Vuelve a iniciar sesión." as const;
