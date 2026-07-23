/**
 * SPABLA Engine — persistence port typed errors (Fase 8 · Hito 8.1).
 *
 * Provider-agnostic error contract for the internal persistence subdomain.
 * Every operation of `PersistencePort` that fails MUST reject with a
 * `PersistenceError` whose `code` belongs to the closed union
 * `PersistenceErrorCode` defined here.
 *
 * @internal Not part of the public engine surface. MUST NOT be re-exported
 * from `engine/src/index.ts` nor from `engine/src/adapters/index.ts`
 * (Plan Fase 8 V1.2 §6, §8.4, §14.1).
 */

// ────────────────────────────────────────────────────────────────
// Closed error-code union — Plan Fase 8 V1.2 §6.
// ────────────────────────────────────────────────────────────────

export type PersistenceErrorCode =
  | "identity_invalid"
  | "tenant_context_invalid"
  | "membership_denied"
  | "not_found"
  | "conflict"
  | "constraint_violation"
  | "unavailable"
  | "unauthorized";

export type PersistenceError = {
  readonly code: PersistenceErrorCode;
  readonly message: string;
  readonly retryable: boolean;
};

// ────────────────────────────────────────────────────────────────
// Retryability defaults — Plan Fase 8 V1.2 §6 / §10.7.
// Only `unavailable` is retryable by default (transient infrastructure
// failure). Every other code is a permanent semantic failure that a retry
// cannot resolve.
// ────────────────────────────────────────────────────────────────

const RETRYABLE_BY_CODE: Readonly<Record<PersistenceErrorCode, boolean>> = Object.freeze({
  identity_invalid: false,
  tenant_context_invalid: false,
  membership_denied: false,
  not_found: false,
  conflict: false,
  constraint_violation: false,
  unavailable: true,
  unauthorized: false,
});

/**
 * Constructs a frozen `PersistenceError` with the canonical `retryable`
 * value for the given code. Callers that must override retryability (e.g.
 * a transient `unauthorized` during token refresh) use `persistenceErrorWithRetry`.
 */
export function persistenceError(
  code: PersistenceErrorCode,
  message: string,
): PersistenceError {
  return Object.freeze({
    code,
    message,
    retryable: RETRYABLE_BY_CODE[code],
  });
}

export function persistenceErrorWithRetry(
  code: PersistenceErrorCode,
  message: string,
  retryable: boolean,
): PersistenceError {
  return Object.freeze({ code, message, retryable });
}

/**
 * Runtime type guard — validates that an unknown value is a
 * structurally-conformant `PersistenceError`. Used at unknown-value
 * boundaries (e.g. Promise rejection payloads); does not attempt to
 * fabricate errors from arbitrary shapes.
 */
export function isPersistenceError(value: unknown): value is PersistenceError {
  if (typeof value !== "object" || value === null) return false;
  const rec = value as Record<string, unknown>;
  if (typeof rec.code !== "string") return false;
  if (typeof rec.message !== "string") return false;
  if (typeof rec.retryable !== "boolean") return false;
  return rec.code in RETRYABLE_BY_CODE;
}

/**
 * The canonical retryability of a given code. Exposed so callers can
 * verify contract compliance without relying on private tables.
 */
export function defaultRetryableFor(code: PersistenceErrorCode): boolean {
  return RETRYABLE_BY_CODE[code];
}

export const PERSISTENCE_ERROR_CODES: ReadonlyArray<PersistenceErrorCode> = Object.freeze([
  "identity_invalid",
  "tenant_context_invalid",
  "membership_denied",
  "not_found",
  "conflict",
  "constraint_violation",
  "unavailable",
  "unauthorized",
]);
