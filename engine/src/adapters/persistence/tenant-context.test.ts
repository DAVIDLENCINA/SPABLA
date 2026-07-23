import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { asUUID, asISOTimestamp } from "../../types/ids";
import type { ActorId, TenantId } from "./port";

import { buildVerifiedIdentityFromTrustedBoundary, type VerifiedIdentity } from "./identity";
import {
  buildTenantContext,
  isTenantContext,
  tenantContextInvalid,
} from "./tenant-context";
import { isPersistenceError } from "./errors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TENANT_CTX_SRC_PATH = path.resolve(__dirname, "tenant-context.ts");

const actorAlpha = asUUID("00000000-0000-0000-0000-00000000A1FA") as ActorId;
const tenantAlpha = asUUID("00000000-0000-0000-0000-00000000A710") as TenantId;
const tenantBeta = asUUID("00000000-0000-0000-0000-00000000B710") as TenantId;
const issuedAt = asISOTimestamp("2026-07-23T10:00:00.000Z");
const identity: VerifiedIdentity = buildVerifiedIdentityFromTrustedBoundary(actorAlpha, issuedAt, "test_fixture");

describe("adapters/persistence/tenant-context — Hito 8.1", () => {
  it("1. factory autorizada produce TenantContext estructural válido", () => {
    const ctx = buildTenantContext(identity, tenantAlpha);
    expect(isTenantContext(ctx)).toBe(true);
  });

  it("2. object literal sin brand no pasa el guard runtime", () => {
    const notBranded = { identity, tenantId: tenantAlpha };
    expect(isTenantContext(notBranded)).toBe(false);
  });

  it("3. conserva la identity provista", () => {
    const ctx = buildTenantContext(identity, tenantAlpha);
    expect(ctx.identity).toBe(identity);
    expect(ctx.identity.actorId).toBe(actorAlpha);
    expect(ctx.identity.source).toBe("test_fixture");
  });

  it("4. conserva el tenantId provisto", () => {
    const ctx = buildTenantContext(identity, tenantAlpha);
    expect(ctx.tenantId).toBe(tenantAlpha);
  });

  it("5. tenants distintos producen contextos observablemente distintos", () => {
    const ctxA = buildTenantContext(identity, tenantAlpha);
    const ctxB = buildTenantContext(identity, tenantBeta);
    expect(ctxA.tenantId).not.toBe(ctxB.tenantId);
    expect(ctxA).not.toBe(ctxB);
  });

  it("6. no existe factory por defecto (tenantId es requerido)", () => {
    // Compile-time verification: buildTenantContext requires two args.
    // Runtime verification: passing an empty string must throw a typed
    // PersistenceError.
    let thrown: unknown = undefined;
    try {
      buildTenantContext(identity, "" as TenantId);
    } catch (e) {
      thrown = e;
    }
    expect(isPersistenceError(thrown)).toBe(true);
    if (isPersistenceError(thrown)) {
      expect(thrown.code).toBe("tenant_context_invalid");
      expect(thrown.retryable).toBe(false);
    }
  });

  it("7. identity no verificada (object literal) es rechazada", () => {
    const fakeIdentity = {
      actorId: actorAlpha,
      issuedAt,
      source: "test_fixture" as const,
    };
    let thrown: unknown = undefined;
    try {
      // Runtime shape mismatches the brand — the guard inside the factory
      // rejects it before construction.
      buildTenantContext(fakeIdentity as VerifiedIdentity, tenantAlpha);
    } catch (e) {
      thrown = e;
    }
    expect(isPersistenceError(thrown)).toBe(true);
    if (isPersistenceError(thrown)) {
      expect(thrown.code).toBe("tenant_context_invalid");
    }
  });

  it("8. instancia congelada — Object.isFrozen === true", () => {
    const ctx = buildTenantContext(identity, tenantAlpha);
    expect(Object.isFrozen(ctx)).toBe(true);
  });

  it("9. cero campo 'role' en el resultado", () => {
    const ctx = buildTenantContext(identity, tenantAlpha);
    expect(Object.prototype.hasOwnProperty.call(ctx, "role")).toBe(false);
    expect(Object.keys(ctx)).not.toContain("role");
  });

  it("10. cero campo legado prohibido en el resultado", () => {
    const ctx = buildTenantContext(identity, tenantAlpha);
    const legacyToken = "membership" + "Verified";
    expect(Object.prototype.hasOwnProperty.call(ctx, legacyToken)).toBe(false);
    expect(Object.keys(ctx)).not.toContain(legacyToken);
  });

  it("11. cero campo `role` ni campo legado en shape declarada de tenant-context.ts", () => {
    const src = fs.readFileSync(TENANT_CTX_SRC_PATH, "utf-8");
    const roleFieldRe = new RegExp("^\\s*role\\s*:", "m");
    const legacyToken = "membership" + "Verified";
    const legacyFieldRe = new RegExp("^\\s*" + legacyToken + "\\s*:", "m");
    expect(src).not.toMatch(roleFieldRe);
    expect(src).not.toMatch(legacyFieldRe);
  });

  it("12. tenantContextInvalid retorna PersistenceError('tenant_context_invalid')", () => {
    const err = tenantContextInvalid("no membership");
    expect(err.code).toBe("tenant_context_invalid");
    expect(err.message).toBe("no membership");
    expect(err.retryable).toBe(false);
  });

  it("13. isTenantContext rechaza null, undefined, primitivos y arrays", () => {
    expect(isTenantContext(null)).toBe(false);
    expect(isTenantContext(undefined)).toBe(false);
    expect(isTenantContext("string")).toBe(false);
    expect(isTenantContext(42)).toBe(false);
    expect(isTenantContext([])).toBe(false);
    expect(isTenantContext({})).toBe(false);
  });

  it("14. dos contextos con mismos inputs son estructuralmente iguales", () => {
    const a = buildTenantContext(identity, tenantAlpha);
    const b = buildTenantContext(identity, tenantAlpha);
    expect(a.tenantId).toBe(b.tenantId);
    expect(a.identity).toBe(b.identity);
  });
});
