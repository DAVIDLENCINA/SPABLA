/**
 * SPABLA Engine — VerifiedIdentity contract (Fase 8 · Hito 8.1).
 *
 * Represents a server-side verified identity. The brand is materialised by
 * a private, module-scoped `unique symbol` so external code cannot forge
 * a `VerifiedIdentity` via object literal: only the factories in this
 * module can attach the brand key.
 *
 * The brand is a compile-time and runtime type-shape barrier. It is NOT a
 * cryptographic guarantee. Real verification (JWT signature / JWKS,
 * `service_role` presence) is performed by the concrete adapter (Hito 8.3)
 * and by the harness. Plan Fase 8 V1.2 §5.1 and §5.3.
 *
 * @internal Not part of the public engine surface. MUST NOT be re-exported
 * from `engine/src/index.ts` nor from `engine/src/adapters/index.ts`.
 */

import type { ISOTimestamp } from "../../types/ids";
import type { ActorId } from "./port";
import { persistenceError, type PersistenceError } from "./errors";

// ────────────────────────────────────────────────────────────────
// Brand: private symbol; type uses `typeof` to reference the key.
// Because the symbol is not exported, no code outside this module can
// synthesise an object with this key — the compiler forbids `readonly
// [typeof verifiedIdentityBrand]` outside this module.
// ────────────────────────────────────────────────────────────────

const verifiedIdentityBrand: unique symbol = Symbol("SPABLA.VerifiedIdentity");

export type VerifiedIdentitySource =
  | "supabase_auth_jwt"
  | "backend_admin_service_role"
  | "test_fixture";

export type VerifiedIdentity = {
  readonly actorId: ActorId;
  readonly issuedAt: ISOTimestamp;
  readonly source: VerifiedIdentitySource;
  readonly [verifiedIdentityBrand]: "VerifiedIdentity";
};

// ────────────────────────────────────────────────────────────────
// Trusted-boundary factory — Plan Fase 8 V1.2 §5.1.
//
// Provider-agnostic, productive factory. It is the ONLY sanctioned way
// to materialise a `VerifiedIdentity` brand. It does NOT verify a JWT,
// does NOT contact a JWKS, does NOT authorise the caller, and does NOT
// take a client-supplied payload as proof of identity. Its precondition
// is that a server-side trusted boundary (JWT-verifying adapter in Hito
// 8.3, admin service-role backend, or a test harness) has ALREADY
// verified the identity by whatever means its `source` denotes, and is
// simply promoting the verified `(actorId, issuedAt, source)` tuple
// into the brand-protected type consumed by the port.
//
// The runtime checks below are structural sanity guards (non-empty
// strings, source ∈ closed union) — they never substitute for the
// upstream verification. Any invalidity raises a typed
// `PersistenceError({code:"identity_invalid"})`.
// ────────────────────────────────────────────────────────────────

/**
 * @internal Only invocable by a trusted server-side boundary that has
 * already verified the identity through its `source`-specific mechanism.
 * Callers that do not correspond to such a boundary MUST NOT invoke this
 * factory. Never accepts a client-supplied payload as identity proof.
 * Never imports a concrete provider SDK.
 */
export function buildVerifiedIdentityFromTrustedBoundary(
  actorId: ActorId,
  issuedAt: ISOTimestamp,
  source: VerifiedIdentitySource,
): VerifiedIdentity {
  if (typeof actorId !== "string" || actorId.length === 0) {
    throw persistenceError("identity_invalid", "buildVerifiedIdentityFromTrustedBoundary: actorId must be non-empty");
  }
  if (typeof issuedAt !== "string" || issuedAt.length === 0) {
    throw persistenceError("identity_invalid", "buildVerifiedIdentityFromTrustedBoundary: issuedAt must be non-empty");
  }
  if (source !== "supabase_auth_jwt"
      && source !== "backend_admin_service_role"
      && source !== "test_fixture") {
    throw persistenceError("identity_invalid", "buildVerifiedIdentityFromTrustedBoundary: source not in closed union");
  }
  return Object.freeze({
    actorId,
    issuedAt,
    source,
    [verifiedIdentityBrand]: "VerifiedIdentity" as const,
  });
}

/**
 * Runtime shape guard. Returns `true` only when `value` carries the
 * private brand key. Because the key symbol is scoped to this module,
 * only values built here can pass. Useful at unknown-value boundaries
 * and for structural assertions in tests.
 */
export function isVerifiedIdentity(value: unknown): value is VerifiedIdentity {
  if (typeof value !== "object" || value === null) return false;
  const rec = value as Record<string | symbol, unknown>;
  if (rec[verifiedIdentityBrand] !== "VerifiedIdentity") return false;
  if (typeof rec.actorId !== "string" || (rec.actorId as string).length === 0) return false;
  if (typeof rec.issuedAt !== "string" || (rec.issuedAt as string).length === 0) return false;
  if (rec.source !== "supabase_auth_jwt"
      && rec.source !== "backend_admin_service_role"
      && rec.source !== "test_fixture") {
    return false;
  }
  return true;
}

/**
 * Convenience raiser for identity-invalid errors, so adapters (Hito 8.3
 * and beyond) throw the exact same shape used by the port contract.
 */
export function identityInvalid(message: string): PersistenceError {
  return persistenceError("identity_invalid", message);
}
