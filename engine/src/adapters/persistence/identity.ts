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
// Test-only fixture factory — Plan Fase 8 V1.2 §5.1.
// Restricted BY CONVENTION to `*.test.ts` files. A static grep test in
// `identity.test.ts` asserts that no productive file under
// `engine/src/adapters/persistence/` imports this name outside tests.
// The JWT and service-role factories will live in the concrete Supabase
// adapter (Hito 8.3); this hito never touches JWT, RLS or network.
// ────────────────────────────────────────────────────────────────

export const TEST_FIXTURE_FACTORY_NAME = "verifyIdentityForTestFixture";

/**
 * @internal Test-only. Promotes an already-known `ActorId` + `ISOTimestamp`
 * pair into a `VerifiedIdentity` labelled `source: "test_fixture"`.
 * Rejects empty strings so mistakes surface immediately. Throws a
 * structured `PersistenceError` (via `throwIdentityInvalid`) — never a
 * generic error.
 */
export function verifyIdentityForTestFixture(
  actorId: ActorId,
  issuedAt: ISOTimestamp,
): VerifiedIdentity {
  if (typeof actorId !== "string" || actorId.length === 0) {
    throw persistenceError("identity_invalid", "verifyIdentityForTestFixture: actorId must be non-empty");
  }
  if (typeof issuedAt !== "string" || issuedAt.length === 0) {
    throw persistenceError("identity_invalid", "verifyIdentityForTestFixture: issuedAt must be non-empty");
  }
  return Object.freeze({
    actorId,
    issuedAt,
    source: "test_fixture" as const,
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
