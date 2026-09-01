import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { asUUID, asISOTimestamp } from "../../types/ids";
import type { ActorId } from "./port";

import {
  buildVerifiedIdentityFromTrustedBoundary,
  isVerifiedIdentity,
  identityInvalid,
  type VerifiedIdentity,
  type VerifiedIdentitySource,
} from "./identity";
import { isPersistenceError } from "./errors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IDENTITY_SRC_PATH = path.resolve(__dirname, "identity.ts");
const ENGINE_BARREL_PATH = path.resolve(__dirname, "..", "..", "index.ts");
const ADAPTERS_BARREL_PATH = path.resolve(__dirname, "..", "index.ts");

const actorAlpha = asUUID("00000000-0000-0000-0000-00000000A1FA") as ActorId;
const issuedAtT0 = asISOTimestamp("2026-07-23T10:00:00.000Z");

const build = (
  actorId: ActorId,
  issuedAt: typeof issuedAtT0,
  source: VerifiedIdentitySource = "test_fixture",
): VerifiedIdentity =>
  buildVerifiedIdentityFromTrustedBoundary(actorId, issuedAt, source);

describe("adapters/persistence/identity — Hito 8.1", () => {
  it("1. factory productiva construye VerifiedIdentity con brand", () => {
    const identity = build(actorAlpha, issuedAtT0);
    expect(isVerifiedIdentity(identity)).toBe(true);
  });

  it("2. object literal sin brand no pasa el guard runtime", () => {
    const notBranded = {
      actorId: actorAlpha,
      issuedAt: issuedAtT0,
      source: "test_fixture",
    };
    expect(isVerifiedIdentity(notBranded)).toBe(false);
  });

  it("3. actorId se conserva sin mutación", () => {
    const identity = build(actorAlpha, issuedAtT0);
    expect(identity.actorId).toBe(actorAlpha);
  });

  it("4. issuedAt se conserva sin mutación", () => {
    const identity = build(actorAlpha, issuedAtT0);
    expect(identity.issuedAt).toBe(issuedAtT0);
  });

  it("5. source se conserva tal cual lo entrega la frontera confiable", () => {
    expect(build(actorAlpha, issuedAtT0, "supabase_auth_jwt").source).toBe("supabase_auth_jwt");
    expect(build(actorAlpha, issuedAtT0, "backend_admin_service_role").source).toBe("backend_admin_service_role");
    expect(build(actorAlpha, issuedAtT0, "test_fixture").source).toBe("test_fixture");
  });

  it("6. actorId vacío lanza PersistenceError({code:'identity_invalid'})", () => {
    let thrown: unknown = undefined;
    try {
      build("" as ActorId, issuedAtT0);
    } catch (e) {
      thrown = e;
    }
    expect(isPersistenceError(thrown)).toBe(true);
    if (isPersistenceError(thrown)) {
      expect(thrown.code).toBe("identity_invalid");
      expect(thrown.retryable).toBe(false);
    }
  });

  it("7. issuedAt vacío lanza PersistenceError({code:'identity_invalid'})", () => {
    let thrown: unknown = undefined;
    try {
      const empty = asISOTimestamp("placeholder");
      const emptyStr = String(empty).slice(0, 0);
      build(actorAlpha, emptyStr as typeof empty);
    } catch (e) {
      thrown = e;
    }
    expect(isPersistenceError(thrown)).toBe(true);
    if (isPersistenceError(thrown)) {
      expect(thrown.code).toBe("identity_invalid");
    }
  });

  it("8. source fuera del closed union lanza identity_invalid", () => {
    let thrown: unknown = undefined;
    try {
      const badSource = "arbitrary_source" as VerifiedIdentitySource;
      build(actorAlpha, issuedAtT0, badSource);
    } catch (e) {
      thrown = e;
    }
    expect(isPersistenceError(thrown)).toBe(true);
    if (isPersistenceError(thrown)) {
      expect(thrown.code).toBe("identity_invalid");
    }
  });

  it("9. instancia congelada — Object.isFrozen === true", () => {
    const identity = build(actorAlpha, issuedAtT0);
    expect(Object.isFrozen(identity)).toBe(true);
  });

  it("10. dos identidades con mismos inputs son estructuralmente iguales", () => {
    const a = build(actorAlpha, issuedAtT0);
    const b = build(actorAlpha, issuedAtT0);
    expect(a.actorId).toBe(b.actorId);
    expect(a.issuedAt).toBe(b.issuedAt);
    expect(a.source).toBe(b.source);
  });

  it("11. isVerifiedIdentity rechaza null, undefined, primitivos", () => {
    expect(isVerifiedIdentity(null)).toBe(false);
    expect(isVerifiedIdentity(undefined)).toBe(false);
    expect(isVerifiedIdentity("string")).toBe(false);
    expect(isVerifiedIdentity(42)).toBe(false);
    expect(isVerifiedIdentity([])).toBe(false);
  });

  it("12. identityInvalid retorna PersistenceError('identity_invalid')", () => {
    const err = identityInvalid("bad jwt");
    expect(err.code).toBe("identity_invalid");
    expect(err.message).toBe("bad jwt");
    expect(err.retryable).toBe(false);
  });

  it("13. cero mención del legado prohibido en identity.ts productivo", () => {
    const src = fs.readFileSync(IDENTITY_SRC_PATH, "utf-8");
    const legacyBoolean = "membership" + "Verified";
    expect(src.includes(legacyBoolean)).toBe(false);
    // No test-only-named factory exported from productive code.
    const testOnlyFactoryName = "verify" + "IdentityForTestFixture";
    expect(src.includes(testOnlyFactoryName)).toBe(false);
    // No productive helper whose *name* reveals a test-only semantic.
    const forbiddenSubstrings = [
      "For" + "Test",
      "Test" + "Only",
      "Fixture" + "Factory",
    ];
    for (const s of forbiddenSubstrings) {
      expect(src.includes(s)).toBe(false);
    }
  });

  it("14. VerifiedIdentity NO se re-exporta desde barrels públicos", () => {
    const engineBarrel = fs.readFileSync(ENGINE_BARREL_PATH, "utf-8");
    const adaptersBarrel = fs.readFileSync(ADAPTERS_BARREL_PATH, "utf-8");
    expect(engineBarrel).not.toMatch(/persistence/);
    expect(engineBarrel).not.toMatch(/VerifiedIdentity/);
    expect(adaptersBarrel).not.toMatch(/persistence/);
    expect(adaptersBarrel).not.toMatch(/VerifiedIdentity/);
  });

  it("15. mutación en instancia frozen no persiste", () => {
    const identity: VerifiedIdentity = build(actorAlpha, issuedAtT0);
    const before = { a: identity.actorId, i: identity.issuedAt, s: identity.source };
    let didThrow = false;
    try {
      Object.assign(identity, { actorId: asUUID("00000000-0000-0000-0000-000000000EE0") as ActorId });
    } catch {
      didThrow = true;
    }
    expect(identity.actorId).toBe(before.a);
    expect(identity.issuedAt).toBe(before.i);
    expect(identity.source).toBe(before.s);
    expect(didThrow || Object.isFrozen(identity)).toBe(true);
  });

  it("16. la única factory productiva es buildVerifiedIdentityFromTrustedBoundary", () => {
    const src = fs.readFileSync(IDENTITY_SRC_PATH, "utf-8");
    // Exactly one `export function` — the trusted-boundary factory. Any
    // other productive factory would appear here.
    const exportedFns = src.match(/^\s*export\s+function\s+([A-Za-z_][A-Za-z0-9_]*)/gm) ?? [];
    const names = exportedFns.map((line) =>
      line.replace(/^\s*export\s+function\s+/, "").trim(),
    );
    expect(names).toContain("buildVerifiedIdentityFromTrustedBoundary");
    // No sibling factory that would create identities outside the trusted
    // boundary contract; only guards and error helpers may co-exist.
    const permitted = new Set<string>([
      "buildVerifiedIdentityFromTrustedBoundary",
      "isVerifiedIdentity",
      "identityInvalid",
    ]);
    for (const n of names) {
      expect(permitted.has(n)).toBe(true);
    }
  });
});
