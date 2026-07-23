import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { asUUID, asISOTimestamp } from "../../types/ids";
import type { ActorId } from "./port";

import {
  verifyIdentityForTestFixture,
  isVerifiedIdentity,
  identityInvalid,
  TEST_FIXTURE_FACTORY_NAME,
  type VerifiedIdentity,
} from "./identity";
import { isPersistenceError } from "./errors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PERSISTENCE_DIR = path.resolve(__dirname);
const IDENTITY_SRC_PATH = path.resolve(__dirname, "identity.ts");
const ENGINE_BARREL_PATH = path.resolve(__dirname, "..", "..", "index.ts");
const ADAPTERS_BARREL_PATH = path.resolve(__dirname, "..", "index.ts");

const actorAlpha = asUUID("00000000-0000-0000-0000-00000000A1FA") as ActorId;
const issuedAtT0 = asISOTimestamp("2026-07-23T10:00:00.000Z");

describe("adapters/persistence/identity — Hito 8.1", () => {
  it("1. factory autorizada produce VerifiedIdentity con brand", () => {
    const identity = verifyIdentityForTestFixture(actorAlpha, issuedAtT0);
    expect(isVerifiedIdentity(identity)).toBe(true);
  });

  it("2. object literal sin brand no pasa el guard runtime", () => {
    const notBranded = {
      actorId: actorAlpha,
      issuedAt: issuedAtT0,
      source: "test_fixture" as const,
    };
    expect(isVerifiedIdentity(notBranded)).toBe(false);
  });

  it("3. actorId se conserva sin mutación", () => {
    const identity = verifyIdentityForTestFixture(actorAlpha, issuedAtT0);
    expect(identity.actorId).toBe(actorAlpha);
  });

  it("4. issuedAt se conserva sin mutación", () => {
    const identity = verifyIdentityForTestFixture(actorAlpha, issuedAtT0);
    expect(identity.issuedAt).toBe(issuedAtT0);
  });

  it("5. source es siempre 'test_fixture' desde esta factory", () => {
    const identity = verifyIdentityForTestFixture(actorAlpha, issuedAtT0);
    expect(identity.source).toBe("test_fixture");
  });

  it("6. actorId vacío lanza PersistenceError({code:'identity_invalid'})", () => {
    let thrown: unknown = undefined;
    try {
      verifyIdentityForTestFixture("" as ActorId, issuedAtT0);
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
      // Empty ISOTimestamp built via the Foundation coercion path with a
      // subsequent runtime overwrite to the empty string. Zero forbidden
      // casts.
      const empty = asISOTimestamp("placeholder");
      const emptyStr = String(empty).slice(0, 0);
      verifyIdentityForTestFixture(actorAlpha, emptyStr as typeof empty);
    } catch (e) {
      thrown = e;
    }
    expect(isPersistenceError(thrown)).toBe(true);
    if (isPersistenceError(thrown)) {
      expect(thrown.code).toBe("identity_invalid");
    }
  });

  it("8. instancia congelada — Object.isFrozen === true", () => {
    const identity = verifyIdentityForTestFixture(actorAlpha, issuedAtT0);
    expect(Object.isFrozen(identity)).toBe(true);
  });

  it("9. dos identidades con mismos inputs son estructuralmente iguales", () => {
    const a = verifyIdentityForTestFixture(actorAlpha, issuedAtT0);
    const b = verifyIdentityForTestFixture(actorAlpha, issuedAtT0);
    expect(a.actorId).toBe(b.actorId);
    expect(a.issuedAt).toBe(b.issuedAt);
    expect(a.source).toBe(b.source);
  });

  it("10. isVerifiedIdentity rechaza null, undefined, primitivos", () => {
    expect(isVerifiedIdentity(null)).toBe(false);
    expect(isVerifiedIdentity(undefined)).toBe(false);
    expect(isVerifiedIdentity("string")).toBe(false);
    expect(isVerifiedIdentity(42)).toBe(false);
    expect(isVerifiedIdentity([])).toBe(false);
  });

  it("11. identityInvalid retorna PersistenceError('identity_invalid')", () => {
    const err = identityInvalid("bad jwt");
    expect(err.code).toBe("identity_invalid");
    expect(err.message).toBe("bad jwt");
    expect(err.retryable).toBe(false);
  });

  it("12. cero mención del legado prohibido en identity.ts productivo", () => {
    const src = fs.readFileSync(IDENTITY_SRC_PATH, "utf-8");
    // Legacy prohibited token (Plan Fase 8 V1.2 §5.2 rejects the client-side
    // membership-verified boolean). Construct the literal at runtime so this
    // test's own source does not contain it.
    const legacyToken = "membership" + "Verified";
    expect(src.includes(legacyToken)).toBe(false);
  });

  it("13. helper test-only sólo aparece en archivos *.test.ts bajo persistence/", () => {
    const files = fs.readdirSync(PERSISTENCE_DIR);
    const productiveHits: Array<string> = [];
    for (const file of files) {
      const full = path.join(PERSISTENCE_DIR, file);
      if (!fs.statSync(full).isFile()) continue;
      if (!file.endsWith(".ts")) continue;
      if (file === "identity.ts") continue; // export site
      const isTest = file.endsWith(".test.ts");
      const src = fs.readFileSync(full, "utf-8");
      if (src.includes(TEST_FIXTURE_FACTORY_NAME) && !isTest) {
        productiveHits.push(file);
      }
    }
    expect(productiveHits).toEqual([]);
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
    const identity: VerifiedIdentity = verifyIdentityForTestFixture(actorAlpha, issuedAtT0);
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
});
