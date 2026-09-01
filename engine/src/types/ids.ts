/**
 * SPABLA Engine — brand types for IDs and timestamps.
 *
 * Branded string aliases so the compiler catches accidental swaps (e.g.
 * passing a Participant.userId where a CallSession.id is expected).
 *
 * There is no runtime cost: `UUID` and `ISOTimestamp` are ordinary strings
 * at runtime. The `__brand` phantom field only exists in the type system.
 */

declare const brand: unique symbol;

/** Opaque identifier for entities managed by the Engine. Runtime = string. */
export type UUID = string & { readonly [brand]: "UUID" };

/** Wall-clock timestamp in ISO 8601 (UTC). Runtime = string. */
export type ISOTimestamp = string & { readonly [brand]: "ISOTimestamp" };

/** Correlation id groups events emitted as a causal chain from one command. */
export type CorrelationId = string & { readonly [brand]: "CorrelationId" };

/**
 * Runtime-safe factory: casts a string to UUID after minimal shape check.
 * The Engine assumes callers already produced UUIDs elsewhere (Supabase, crypto).
 */
export function asUUID(value: string): UUID {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("asUUID: expected non-empty string");
  }
  return value as UUID;
}

/** Cast a string to ISOTimestamp; caller guarantees ISO 8601 shape. */
export function asISOTimestamp(value: string): ISOTimestamp {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("asISOTimestamp: expected non-empty string");
  }
  return value as ISOTimestamp;
}

/** Cast a string to CorrelationId. */
export function asCorrelationId(value: string): CorrelationId {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("asCorrelationId: expected non-empty string");
  }
  return value as CorrelationId;
}

/**
 * Clock interface — injected into the Engine so tests can control time.
 * Production wiring passes a real clock; tests pass a fake to make timeouts
 * deterministic.
 */
export interface Clock {
  /** Current wall time as ISO 8601 UTC. */
  nowISO(): ISOTimestamp;
  /** Current wall time as ms since epoch. */
  nowMs(): number;
}

/** Default clock backed by Date. */
export function systemClock(): Clock {
  return {
    nowISO: () => new Date().toISOString() as ISOTimestamp,
    nowMs: () => Date.now(),
  };
}
