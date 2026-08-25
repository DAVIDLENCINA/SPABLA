/**
 * SPABLA V2 · Hito 9.2.5-D · HTTP error helper for /api/v2/messages.
 *
 * Every product response goes through this helper so the contract is
 * uniform:
 *
 *   - Every response (2xx, 4xx, 5xx) carries a `X-SPABLA-Correlation-Id`
 *     header whose value is an RFC 4122 UUID generated server-side by
 *     `crypto.randomUUID()`.
 *   - Every 4xx/5xx JSON body has the shape `{ error, correlationId }`
 *     with the SAME correlation id echoed in body and header.
 *   - Success bodies are byte-preserved (no `correlationId` injected)
 *     so existing 200/201 contracts do not change.
 *   - Optional sanitized logging via `console.error`: whitelisted
 *     fields only, no secrets, no PII, no raw provider messages.
 *
 * The public error alphabet is a closed set of seven codes:
 *
 *   bad_request | unauthorized | forbidden | not_found | conflict
 *   | unavailable | internal
 *
 * Granular internal reasons (e.g. `invalid_conversation`, `empty_text`,
 * `hidden_by_rls`, `identity_invalid`) never leak to the public body;
 * they can only appear inside the sanitized log line as `internalKind`
 * from a rigid whitelist. Anything outside the whitelist degrades to
 * `unknown`.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

export const CORRELATION_HEADER = "X-SPABLA-Correlation-Id";

export type PublicErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "unavailable"
  | "internal";

/**
 * Coarse phase of the request lifecycle at which an error surfaced.
 * Used inside the internal log line only; never leaks to the client.
 */
export type ErrorPhase =
  | "structural"
  | "authentication"
  | "authorization"
  | "integrity"
  | "infrastructure"
  | "internal";

/**
 * Whitelist of internal reasons that may appear inside the sanitized
 * log line as `internalKind`. Any other value degrades to `"unknown"`.
 * The list is closed on purpose: introducing a new reason requires
 * extending the whitelist explicitly and reviewing whether the value
 * is safe to log.
 */
const KNOWN_INTERNAL_KINDS = new Set<string>([
  // Structural (400 · usually NOT logged, but permitted when a
  // structural failure originates server-side rather than from the
  // caller.)
  "invalid_json",
  "invalid_conversation",
  "invalid_target_language",
  "invalid_language",
  "invalid_client_id",
  "invalid_tenant",
  "empty_text",
  "text_too_long",
  "invalid_cursor",
  // Authentication (401)
  "missing_authorization",
  "invalid_authorization_scheme",
  "empty_bearer_token",
  "jwt_verification_failed",
  "jwt_rejected",
  "jwt_subject_invalid",
  "identity_invalid",
  // Authorization / visibility (404 on write, 200 [] on read)
  "hidden_by_rls",
  "not_found",
  // Authorization / explicit deny on a visible resource (403). Reserved
  // for a future role-based policy; the messages endpoint does not
  // emit it today because `saveMessage` intercepts SQLSTATE 42501 into
  // `not_found` for invisibility parity.
  "membership_denied",
  // Integrity (409)
  "unique_violation",
  // Infrastructure (503)
  "db_transient",
  "auth_transient",
  // Internal / uncaught (500)
  "unknown",
  "constraint_violation",
  // Hito 9.3.2-A-Q2 · atomic onboarding server-side (contract §10, §14
  // rows 10/48/53/56, §17-ter H). Whitelisted internal reasons for the
  // sanitized log line. Never leak to the public body.
  "orphan_mapping_detected",
  "deletion_pending_blocked",
  "legal_hold_blocked",
  "lifecycle_query_failed",
  "onboarding_env_missing",
  "onboarding_rpc_failed",
  "onboarding_rpc_empty_result",
  "onboarding_body_fields_ignored",
  "onboarding_locale_hint_rejected",
  "method_not_allowed",
  "supabase_env_missing",
  // Hito 9.3.2-A-Q2-R2 · Auth-actor existence check inside the RPC.
  // The JWT was cryptographically valid (signature + exp) but the
  // actor has been removed from `auth.users` after the token was
  // issued. Handler responds `401 unauthorized` opaque; this kind
  // is server-side observable only.
  "auth_actor_deleted",
]);

const KNOWN_PHASES = new Set<ErrorPhase>([
  "structural",
  "authentication",
  "authorization",
  "integrity",
  "infrastructure",
  "internal",
]);

/**
 * Server-side log entry for a request that produced an error worth
 * observing. Shape is intentionally minimal and rigidly whitelisted.
 */
export type ErrorLogInput = {
  readonly endpoint: string;
  readonly method: string;
  readonly status: number;
  readonly code: PublicErrorCode;
  readonly phase: ErrorPhase;
  readonly internalKind: string;
};

function normalizeInternalKind(value: string): string {
  return KNOWN_INTERNAL_KINDS.has(value) ? value : "unknown";
}

function normalizePhase(value: ErrorPhase): ErrorPhase {
  return KNOWN_PHASES.has(value) ? value : "internal";
}

export function newCorrelationId(): string {
  return randomUUID();
}

/**
 * Build a 4xx/5xx `NextResponse` with the uniform envelope
 * (`{error, correlationId}` in body + `X-SPABLA-Correlation-Id`
 * header). No sanitized log is emitted here — call `logSanitizedError`
 * explicitly when the failure is worth observing (per §LOGGING of the
 * hito order: routine 400s are NOT logged).
 */
export function opaqueError(
  status: number,
  code: PublicErrorCode,
  correlationId: string,
): Response {
  return NextResponse.json(
    { error: code, correlationId },
    {
      status,
      headers: {
        [CORRELATION_HEADER]: correlationId,
      },
    },
  );
}

/**
 * Build a 2xx `NextResponse` while emitting the correlation header.
 * The body remains untouched (no `correlationId` injected) to preserve
 * the existing success contracts of `/api/v2/messages`.
 */
export function successJson<TBody>(
  status: number,
  body: TBody,
  correlationId: string,
): Response {
  return NextResponse.json(body, {
    status,
    headers: {
      [CORRELATION_HEADER]: correlationId,
    },
  });
}

/**
 * Emit a single structured log line to `console.error`. Whitelist
 * enforced on `internalKind` and `phase`; anything outside the
 * whitelist degrades to `unknown` / `internal`.
 */
export function logSanitizedError(
  correlationId: string,
  input: ErrorLogInput,
): void {
  const payload = {
    event: "http_error",
    endpoint: input.endpoint,
    method: input.method,
    status: input.status,
    correlationId,
    code: input.code,
    phase: normalizePhase(input.phase),
    internalKind: normalizeInternalKind(input.internalKind),
  };
  console.error(JSON.stringify(payload));
}
