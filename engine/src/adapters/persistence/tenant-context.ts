/**
 * SPABLA Engine — TenantContext contract (Fase 8 · Hito 8.1).
 *
 * `TenantContext` is the "explicit selection of the tenant the caller is
 * asking to operate on", bundled with the caller's `VerifiedIdentity`. It
 * is NOT proof of authorisation. The final authority for tenant isolation
 * is PostgreSQL / RLS via `auth.uid()` + `tenant_memberships` (Plan Fase 8
 * V1.2 §5.2, §7.1, §7.1bis).
 *
 * Consequences for this contract:
 *  - no `role` field (roles are data in the DB, not client-side authority);
 *  - no client-side membership-check boolean (the DB, not the client, decides);
 *  - no default tenant (every operation must pick a tenant explicitly).
 *
 * The brand is materialised by a private, module-scoped `unique symbol`.
 * External code cannot forge a `TenantContext` via object literal.
 *
 * @internal Not part of the public engine surface. MUST NOT be re-exported
 * from `engine/src/index.ts` nor from `engine/src/adapters/index.ts`.
 */

import type { TenantId } from "./port";
import { type VerifiedIdentity, isVerifiedIdentity } from "./identity";
import { persistenceError, type PersistenceError } from "./errors";

const tenantContextBrand: unique symbol = Symbol("SPABLA.TenantContext");

export type TenantContext = {
  readonly identity: VerifiedIdentity;
  readonly tenantId: TenantId;
  readonly [tenantContextBrand]: "TenantContext";
};

/**
 * Only sanctioned entry point to build a `TenantContext`. Rejects
 * structurally-invalid input with a typed `PersistenceError`. Does NOT
 * verify membership — that is PostgreSQL/RLS's job at query time.
 */
export function buildTenantContext(
  identity: VerifiedIdentity,
  tenantId: TenantId,
): TenantContext {
  if (!isVerifiedIdentity(identity)) {
    throw persistenceError(
      "tenant_context_invalid",
      "buildTenantContext: identity is not a VerifiedIdentity",
    );
  }
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    throw persistenceError(
      "tenant_context_invalid",
      "buildTenantContext: tenantId must be a non-empty UUID",
    );
  }
  return Object.freeze({
    identity,
    tenantId,
    [tenantContextBrand]: "TenantContext" as const,
  });
}

/**
 * Runtime shape guard. Verifies the private brand key and the presence
 * of a valid nested `VerifiedIdentity` and non-empty `tenantId`.
 */
export function isTenantContext(value: unknown): value is TenantContext {
  if (typeof value !== "object" || value === null) return false;
  const rec = value as Record<string | symbol, unknown>;
  if (rec[tenantContextBrand] !== "TenantContext") return false;
  if (typeof rec.tenantId !== "string" || (rec.tenantId as string).length === 0) return false;
  if (!isVerifiedIdentity(rec.identity)) return false;
  return true;
}

/**
 * Convenience raiser for tenant-context-invalid errors.
 */
export function tenantContextInvalid(message: string): PersistenceError {
  return persistenceError("tenant_context_invalid", message);
}
