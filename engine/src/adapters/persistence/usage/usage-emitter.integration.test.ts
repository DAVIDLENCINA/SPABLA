/**
 * SPABLA Engine — UsageEmitter integration tests (Fase 8 · Hito 8.4).
 *
 * Runs against a LOCAL Supabase stack started by `supabase start` on the
 * CI runner (Job B). NEVER touches a productive project. Skipped locally
 * without env vars.
 *
 * Scope: exercise the emitter as the Fase 8 E2E harness would use it. The
 * matrix listed in Plan Fase 8 V1.3 §11.4 is largely covered by Hito 8.3
 * against the adapter and by the SQL suite `rls_bootstrap.test.sql`.
 * Here we validate only what is specific to the emitter layer:
 *   * emit and emitFromMessage happy paths write through the port;
 *   * pre-emission structural checks reject malformed inputs BEFORE the DB;
 *   * idempotency semantics survive when routed through the emitter;
 *   * cross-tenant and cross-source isolation of `idempotency_key`;
 *   * concurrency de-duplicates through the DB `UNIQUE` constraint;
 *   * the port's error codes are propagated verbatim (no rewrapping);
 *   * static safeguard: the emitter file mentions no `service_role`.
 */

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { SupabasePersistence } from "../supabase/supabase-persistence";
import { UsageEmitter } from "./usage-emitter";
import {
  buildTenantContext,
  type TenantContext,
} from "../tenant-context";
import { buildVerifiedIdentityFromTrustedBoundary } from "../identity";
import type { ActorId, TenantId, UsageEntry } from "../port";
import type { PersistenceError } from "../errors";
import { asISOTimestamp, asUUID } from "../../../types/ids";

const SUPABASE_URL = process.env.SPABLA_TEST_SUPABASE_URL ?? "";
const ANON = process.env.SPABLA_TEST_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SPABLA_TEST_SUPABASE_SERVICE_ROLE_KEY ?? "";
const ENABLED = SUPABASE_URL !== "" && ANON !== "" && SERVICE !== "";

type Actor = {
  id: ActorId;
  readonly email: string;
  readonly password: string;
  jwt: string;
};

async function signIn(email: string, password: string): Promise<{ id: string; jwt: string }> {
  const anon = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    throw new Error(`signIn failed for ${email}: ${error?.message ?? "no session"}`);
  }
  return { id: data.user.id, jwt: data.session.access_token };
}

function authClient(jwt: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

function privileged(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function ctxOf(actor: Actor, tenantId: string): TenantContext {
  return buildTenantContext(
    buildVerifiedIdentityFromTrustedBoundary(
      actor.id,
      asISOTimestamp(new Date().toISOString()),
      "supabase_auth_jwt",
    ),
    asUUID(tenantId) as TenantId,
  );
}

async function catchPersistenceError(promise: Promise<unknown>): Promise<PersistenceError> {
  try {
    await promise;
  } catch (err) {
    return err as PersistenceError;
  }
  throw new Error("expected PersistenceError; got success");
}

// eslint-disable-next-line vitest/no-conditional-tests
describe.skipIf(!ENABLED)("UsageEmitter integration", () => {
  let admin: SupabaseClient;
  const suiteId = randomUUID().slice(0, 12);
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const emailA = `spabla-emit-a-${suiteId}@example.test`;
  const emailB = `spabla-emit-b-${suiteId}@example.test`;
  const password = "P@ssw0rd-8-4-!";
  const actorA: Actor = { id: asUUID("00000000-0000-0000-0000-000000000000"), email: emailA, password, jwt: "" };
  const actorB: Actor = { id: asUUID("00000000-0000-0000-0000-000000000000"), email: emailB, password, jwt: "" };
  const createdActorIds: string[] = [];
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    admin = privileged();
    for (const actor of [actorA, actorB]) {
      const { data, error } = await admin.auth.admin.createUser({
        email: actor.email,
        password: actor.password,
        email_confirm: true,
      });
      if (error || !data.user) throw new Error(`createUser failed for ${actor.email}: ${error?.message}`);
      actor.id = asUUID(data.user.id);
      createdActorIds.push(data.user.id);
    }
    const setup = await admin.schema("spabla_v2").from("tenants").insert([
      { id: tenantA, name: `Emitter Tenant A ${suiteId}` },
      { id: tenantB, name: `Emitter Tenant B ${suiteId}` },
    ]);
    if (setup.error) throw new Error(`tenants insert failed: ${setup.error.message}`);
    createdTenantIds.push(tenantA, tenantB);

    async function addMembership(tid: string, aid: string, role: string): Promise<void> {
      const r = await admin.schema("spabla_v2").rpc("admin_add_membership", {
        p_tenant_id: tid, p_actor_id: aid, p_role: role,
      });
      if (r.error) throw new Error(`admin_add_membership failed: ${r.error.message}`);
    }
    await addMembership(tenantA, actorA.id, "owner");
    await addMembership(tenantB, actorB.id, "owner");

    for (const actor of [actorA, actorB]) {
      const { id, jwt } = await signIn(actor.email, actor.password);
      if (id !== actor.id) throw new Error("signIn returned a different user id");
      actor.jwt = jwt;
    }
  }, 60_000);

  afterAll(async () => {
    if (admin === undefined) return;
    for (const uid of createdActorIds) {
      await admin.auth.admin.deleteUser(uid).catch(() => undefined);
    }
    if (createdTenantIds.length > 0) {
      await admin.schema("spabla_v2").from("tenants").delete().in("id", createdTenantIds).then(() => undefined, () => undefined);
    }
  });

  function buildEmitter(actor: Actor): UsageEmitter {
    const persistence = new SupabasePersistence({
      authenticated: authClient(actor.jwt),
      privileged: admin,
    });
    return new UsageEmitter({ persistence });
  }

  async function countLedgerRows(tenantId: string, source: string, key: string): Promise<number> {
    const { count, error } = await admin
      .schema("spabla_v2")
      .from("usage_ledger")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("source", source)
      .eq("idempotency_key", key);
    if (error) throw new Error(`count failed: ${error.message}`);
    return count ?? 0;
  }

  // ────────────────────────────────────────────────────────────────
  // Happy paths
  // ────────────────────────────────────────────────────────────────

  test("emit writes a usage_ledger row via the injected persistence port", async () => {
    const emitter = buildEmitter(actorA);
    const ctx = ctxOf(actorA, tenantA);
    const key = randomUUID();
    const source = `hito_8_4_emit_${suiteId}`;
    await emitter.emit(ctx, {
      metricKind: "text_chars",
      quantity: 12,
      unit: "chars",
      occurredAt: asISOTimestamp("2026-08-05T18:00:00.000Z"),
      source,
      idempotencyKey: asUUID(key),
      entryKind: "normal",
      correlationId: null,
    });
    expect(await countLedgerRows(tenantA, source, key)).toBe(1);
  });

  test("emitFromMessage records a text_chars metric derived from text.length", async () => {
    const emitter = buildEmitter(actorA);
    const ctx = ctxOf(actorA, tenantA);
    const key = randomUUID();
    const source = `hito_8_4_emitFromMessage_${suiteId}`;
    const text = "hola mundo";
    await emitter.emitFromMessage(ctx, {
      text,
      idempotencyKey: asUUID(key),
      occurredAt: asISOTimestamp("2026-08-05T18:01:00.000Z"),
      source,
      correlationId: null,
    });
    const { data, error } = await admin
      .schema("spabla_v2")
      .from("usage_ledger")
      .select("metric_kind, unit, quantity, entry_kind")
      .eq("tenant_id", tenantA).eq("source", source).eq("idempotency_key", key)
      .maybeSingle();
    if (error) throw error;
    expect(data).not.toBeNull();
    expect(data?.metric_kind).toBe("text_chars");
    expect(data?.unit).toBe("chars");
    expect(data?.quantity).toBe(text.length);
    expect(data?.entry_kind).toBe("normal");
  });

  // ────────────────────────────────────────────────────────────────
  // Idempotency, concurrency, isolation
  // ────────────────────────────────────────────────────────────────

  test("idempotent identical retry does not duplicate the ledger row", async () => {
    const emitter = buildEmitter(actorA);
    const ctx = ctxOf(actorA, tenantA);
    const key = randomUUID();
    const source = `hito_8_4_idem_${suiteId}`;
    const input = {
      metricKind: "turns" as const,
      quantity: 1,
      unit: "turns",
      occurredAt: asISOTimestamp("2026-08-05T18:02:00.000Z"),
      source,
      idempotencyKey: asUUID(key),
      entryKind: "normal" as const,
      correlationId: null,
    };
    await emitter.emit(ctx, input);
    await emitter.emit(ctx, input);
    expect(await countLedgerRows(tenantA, source, key)).toBe(1);
  });

  test("conflicting retry (same key, different quantity) raises code:conflict and leaves the first row intact", async () => {
    const emitter = buildEmitter(actorA);
    const ctx = ctxOf(actorA, tenantA);
    const key = randomUUID();
    const source = `hito_8_4_conflict_${suiteId}`;
    const occurredAt = asISOTimestamp("2026-08-05T18:03:00.000Z");
    await emitter.emit(ctx, {
      metricKind: "turns",
      quantity: 1,
      unit: "turns",
      occurredAt,
      source,
      idempotencyKey: asUUID(key),
      entryKind: "normal",
      correlationId: null,
    });
    const err = await catchPersistenceError(emitter.emit(ctx, {
      metricKind: "turns",
      quantity: 2,
      unit: "turns",
      occurredAt,
      source,
      idempotencyKey: asUUID(key),
      entryKind: "normal",
      correlationId: null,
    }));
    expect(err.code).toBe("conflict");
    expect(err.retryable).toBe(false);
    // Opaque message: no payload, URL, JWT, token or SQL identifiers leaked.
    for (const forbidden of ["quantity", "usage_ledger", "SELECT", "INSERT", "Bearer", "Authorization", SUPABASE_URL, actorA.jwt]) {
      expect(err.message).not.toContain(forbidden);
    }
    // First row survived intact.
    const { data } = await admin.schema("spabla_v2").from("usage_ledger")
      .select("quantity, entry_kind")
      .eq("tenant_id", tenantA).eq("source", source).eq("idempotency_key", key)
      .maybeSingle();
    expect(await countLedgerRows(tenantA, source, key)).toBe(1);
    expect(data?.quantity).toBe(1);
    expect(data?.entry_kind).toBe("normal");
  });

  test("concurrent divergent emits: one wins, at least one surfaces code:conflict, only one row persists", async () => {
    const emitter = buildEmitter(actorA);
    const ctx = ctxOf(actorA, tenantA);
    const key = randomUUID();
    const source = `hito_8_4_concurrent_divergent_${suiteId}`;
    const occurredAt = asISOTimestamp("2026-08-05T18:03:30.000Z");
    const attempts = [1, 2, 3].map((q) => emitter.emit(ctx, {
      metricKind: "turns",
      quantity: q,
      unit: "turns",
      occurredAt,
      source,
      idempotencyKey: asUUID(key),
      entryKind: "normal",
      correlationId: null,
    }));
    const results = await Promise.allSettled(attempts);
    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toBeGreaterThanOrEqual(1);
    expect(rejected.length).toBeGreaterThanOrEqual(1);
    for (const r of rejected) {
      const reason = (r as PromiseRejectedResult).reason as PersistenceError;
      expect(reason.code).toBe("conflict");
      expect(reason.retryable).toBe(false);
    }
    expect(await countLedgerRows(tenantA, source, key)).toBe(1);
  });

  test("concurrent emits with the same key resolve to a single row via DB UNIQUE", async () => {
    const emitter = buildEmitter(actorA);
    const ctx = ctxOf(actorA, tenantA);
    const key = randomUUID();
    const source = `hito_8_4_concurrent_${suiteId}`;
    const input = {
      metricKind: "voice_seconds" as const,
      quantity: 3.5,
      unit: "seconds",
      occurredAt: asISOTimestamp("2026-08-05T18:04:00.000Z"),
      source,
      idempotencyKey: asUUID(key),
      entryKind: "normal" as const,
      correlationId: null,
    };
    const results = await Promise.allSettled([
      emitter.emit(ctx, input),
      emitter.emit(ctx, input),
      emitter.emit(ctx, input),
    ]);
    for (const r of results) expect(r.status).toBe("fulfilled");
    expect(await countLedgerRows(tenantA, source, key)).toBe(1);
  });

  test("same idempotency_key across two tenants inserts one row per tenant", async () => {
    const emitterA = buildEmitter(actorA);
    const emitterB = buildEmitter(actorB);
    const key = randomUUID();
    const source = `hito_8_4_iso_tenant_${suiteId}`;
    const shape = {
      metricKind: "provider_call" as const,
      quantity: 1,
      unit: "calls",
      occurredAt: asISOTimestamp("2026-08-05T18:05:00.000Z"),
      source,
      idempotencyKey: asUUID(key),
      entryKind: "normal" as const,
      correlationId: null,
    };
    await emitterA.emit(ctxOf(actorA, tenantA), shape);
    await emitterB.emit(ctxOf(actorB, tenantB), shape);
    expect(await countLedgerRows(tenantA, source, key)).toBe(1);
    expect(await countLedgerRows(tenantB, source, key)).toBe(1);
  });

  test("same idempotency_key with two different sources inserts two rows in the same tenant", async () => {
    const emitter = buildEmitter(actorA);
    const ctx = ctxOf(actorA, tenantA);
    const key = randomUUID();
    const sourceX = `hito_8_4_iso_source_X_${suiteId}`;
    const sourceY = `hito_8_4_iso_source_Y_${suiteId}`;
    const shape = {
      metricKind: "text_chars" as const,
      quantity: 1,
      unit: "chars",
      occurredAt: asISOTimestamp("2026-08-05T18:06:00.000Z"),
      idempotencyKey: asUUID(key),
      entryKind: "normal" as const,
      correlationId: null,
    };
    await emitter.emit(ctx, { ...shape, source: sourceX });
    await emitter.emit(ctx, { ...shape, source: sourceY });
    expect(await countLedgerRows(tenantA, sourceX, key)).toBe(1);
    expect(await countLedgerRows(tenantA, sourceY, key)).toBe(1);
  });

  // ────────────────────────────────────────────────────────────────
  // Pre-DB structural validation (constraint_violation)
  // ────────────────────────────────────────────────────────────────

  test("idempotencyKey that is not a UUID is rejected before the DB", async () => {
    const emitter = buildEmitter(actorA);
    const ctx = ctxOf(actorA, tenantA);
    const err = await catchPersistenceError(emitter.emit(ctx, {
      metricKind: "turns",
      quantity: 1,
      unit: "turns",
      occurredAt: asISOTimestamp("2026-08-05T18:07:00.000Z"),
      source: `hito_8_4_bad_key_${suiteId}`,
      idempotencyKey: "not-a-uuid" as never,
      entryKind: "normal",
      correlationId: null,
    }));
    expect(err.code).toBe("constraint_violation");
  });

  test("correlationId that is not a UUID is rejected before the DB", async () => {
    const emitter = buildEmitter(actorA);
    const ctx = ctxOf(actorA, tenantA);
    const err = await catchPersistenceError(emitter.emit(ctx, {
      metricKind: "turns",
      quantity: 1,
      unit: "turns",
      occurredAt: asISOTimestamp("2026-08-05T18:07:30.000Z"),
      source: `hito_8_4_bad_corr_${suiteId}`,
      idempotencyKey: asUUID(randomUUID()),
      entryKind: "normal",
      correlationId: "not-a-uuid" as never,
    }));
    expect(err.code).toBe("constraint_violation");
  });

  test("empty source is rejected before the DB", async () => {
    const emitter = buildEmitter(actorA);
    const ctx = ctxOf(actorA, tenantA);
    const err = await catchPersistenceError(emitter.emit(ctx, {
      metricKind: "turns",
      quantity: 1,
      unit: "turns",
      occurredAt: asISOTimestamp("2026-08-05T18:08:00.000Z"),
      source: "   ",
      idempotencyKey: asUUID(randomUUID()),
      entryKind: "normal",
      correlationId: null,
    }));
    expect(err.code).toBe("constraint_violation");
  });

  test("empty unit is rejected before the DB", async () => {
    const emitter = buildEmitter(actorA);
    const ctx = ctxOf(actorA, tenantA);
    const err = await catchPersistenceError(emitter.emit(ctx, {
      metricKind: "turns",
      quantity: 1,
      unit: "",
      occurredAt: asISOTimestamp("2026-08-05T18:08:30.000Z"),
      source: `hito_8_4_empty_unit_${suiteId}`,
      idempotencyKey: asUUID(randomUUID()),
      entryKind: "normal",
      correlationId: null,
    }));
    expect(err.code).toBe("constraint_violation");
  });

  test("negative quantity in entryKind=normal is rejected before the DB", async () => {
    const emitter = buildEmitter(actorA);
    const ctx = ctxOf(actorA, tenantA);
    const err = await catchPersistenceError(emitter.emit(ctx, {
      metricKind: "turns",
      quantity: -1,
      unit: "turns",
      occurredAt: asISOTimestamp("2026-08-05T18:09:00.000Z"),
      source: `hito_8_4_negq_${suiteId}`,
      idempotencyKey: asUUID(randomUUID()),
      entryKind: "normal",
      correlationId: null,
    }));
    expect(err.code).toBe("constraint_violation");
  });

  test("negative quantity is accepted when entryKind=compensation", async () => {
    const emitter = buildEmitter(actorA);
    const ctx = ctxOf(actorA, tenantA);
    const key = randomUUID();
    const source = `hito_8_4_compensation_${suiteId}`;
    await emitter.emit(ctx, {
      metricKind: "turns",
      quantity: -3,
      unit: "turns",
      occurredAt: asISOTimestamp("2026-08-05T18:10:00.000Z"),
      source,
      idempotencyKey: asUUID(key),
      entryKind: "compensation",
      correlationId: null,
    });
    const { data } = await admin.schema("spabla_v2").from("usage_ledger")
      .select("quantity, entry_kind")
      .eq("tenant_id", tenantA).eq("source", source).eq("idempotency_key", key)
      .maybeSingle();
    expect(data?.quantity).toBe(-3);
    expect(data?.entry_kind).toBe("compensation");
  });

  test("non-finite quantity is rejected before the DB", async () => {
    const emitter = buildEmitter(actorA);
    const ctx = ctxOf(actorA, tenantA);
    const err = await catchPersistenceError(emitter.emit(ctx, {
      metricKind: "turns",
      quantity: Number.NaN,
      unit: "turns",
      occurredAt: asISOTimestamp("2026-08-05T18:11:00.000Z"),
      source: `hito_8_4_nan_${suiteId}`,
      idempotencyKey: asUUID(randomUUID()),
      entryKind: "normal",
      correlationId: null,
    }));
    expect(err.code).toBe("constraint_violation");
  });

  // ────────────────────────────────────────────────────────────────
  // Error propagation from the port
  // ────────────────────────────────────────────────────────────────

  test("actor without active membership propagates the port error verbatim", async () => {
    // actorB is a member of tenantB. Passing ctx that says tenantA (where
    // actorB has NO membership) must fail through admin_append_usage
    // membership check. The emitter must not swallow or rewrap the error.
    const emitter = buildEmitter(actorB);
    const foreignCtx = buildTenantContext(
      buildVerifiedIdentityFromTrustedBoundary(
        actorB.id,
        asISOTimestamp(new Date().toISOString()),
        "supabase_auth_jwt",
      ),
      asUUID(tenantA) as TenantId,
    );
    const err = await catchPersistenceError(emitter.emit(foreignCtx, {
      metricKind: "turns",
      quantity: 1,
      unit: "turns",
      occurredAt: asISOTimestamp("2026-08-05T18:12:00.000Z"),
      source: `hito_8_4_no_mship_${suiteId}`,
      idempotencyKey: asUUID(randomUUID()),
      entryKind: "normal",
      correlationId: null,
    }));
    // Hito 9.2.5-D · admin_append_usage raises SQLSTATE 42501
    // (insufficient_privilege) when membership is missing/inactive.
    // The adapter now maps that to `not_found` so the HTTP boundary
    // returns 404 (invisibility parity with reads) rather than 401,
    // which would incorrectly trigger client auth-recovery.
    expect(err.code).toBe("not_found");
    // No write must have reached the ledger for this source.
    const { count } = await admin.schema("spabla_v2").from("usage_ledger")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantA)
      .eq("source", `hito_8_4_no_mship_${suiteId}`);
    expect(count).toBe(0);
  });

  test("membership deactivated between two emits: second emit fails, first row persists", async () => {
    // Fresh temp user with active membership in tenantA. First emit succeeds.
    // Then admin deactivates membership. Second emit must fail.
    const tempEmail = `spabla-emit-tmp-${suiteId}-${randomUUID().slice(0, 8)}@example.test`;
    const tempPw = "P@ssw0rd-tmp-!";
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: tempEmail, password: tempPw, email_confirm: true,
    });
    if (cErr || !created.user) throw new Error(`temp createUser failed: ${cErr?.message}`);
    createdActorIds.push(created.user.id);
    const tempAid = asUUID(created.user.id);
    await admin.schema("spabla_v2").rpc("admin_add_membership", {
      p_tenant_id: tenantA, p_actor_id: tempAid, p_role: "member",
    });
    const { jwt: tempJwt } = await signIn(tempEmail, tempPw);
    const emitter = new UsageEmitter({
      persistence: new SupabasePersistence({
        authenticated: authClient(tempJwt),
        privileged: admin,
      }),
    });
    const ctx = buildTenantContext(
      buildVerifiedIdentityFromTrustedBoundary(tempAid, asISOTimestamp(new Date().toISOString()), "supabase_auth_jwt"),
      asUUID(tenantA) as TenantId,
    );
    const source = `hito_8_4_deactivate_${suiteId}`;
    await emitter.emit(ctx, {
      metricKind: "turns",
      quantity: 1,
      unit: "turns",
      occurredAt: asISOTimestamp("2026-08-05T18:13:00.000Z"),
      source,
      idempotencyKey: asUUID(randomUUID()),
      entryKind: "normal",
      correlationId: null,
    });
    await admin.schema("spabla_v2").rpc("admin_deactivate_membership", {
      p_tenant_id: tenantA, p_actor_id: tempAid,
    });
    const err = await catchPersistenceError(emitter.emit(ctx, {
      metricKind: "turns",
      quantity: 1,
      unit: "turns",
      occurredAt: asISOTimestamp("2026-08-05T18:13:30.000Z"),
      source,
      idempotencyKey: asUUID(randomUUID()),
      entryKind: "normal",
      correlationId: null,
    }));
    // Hito 9.2.5-D · Once membership is deactivated, subsequent writes
    // must be indistinguishable from writes against a non-existent
    // (tenant, actor) tuple. SQLSTATE 42501 → `not_found` at the port,
    // → HTTP 404 at the boundary.
    expect(err.code).toBe("not_found");
    const { count } = await admin.schema("spabla_v2").from("usage_ledger")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantA).eq("source", source);
    expect(count).toBe(1);
  });

  test("port that lacks privileged capability: emit surfaces unauthorized without writing", async () => {
    const persistence = new SupabasePersistence({
      authenticated: authClient(actorA.jwt),
      privileged: null,
    });
    const emitter = new UsageEmitter({ persistence });
    const key = randomUUID();
    const source = `hito_8_4_no_priv_${suiteId}`;
    const err = await catchPersistenceError(emitter.emit(ctxOf(actorA, tenantA), {
      metricKind: "turns",
      quantity: 1,
      unit: "turns",
      occurredAt: asISOTimestamp("2026-08-05T18:14:00.000Z"),
      source,
      idempotencyKey: asUUID(key),
      entryKind: "normal",
      correlationId: null,
    }));
    expect(err.code).toBe("unauthorized");
    expect(await countLedgerRows(tenantA, source, key)).toBe(0);
  });

  // ────────────────────────────────────────────────────────────────
  // Static safeguards
  // ────────────────────────────────────────────────────────────────

  test("emitter source file contains no reference to service_role or credential material", () => {
    const src = readFileSync(
      new URL("./usage-emitter.ts", import.meta.url),
      "utf-8",
    );
    for (const forbidden of [
      "service_role",
      "SERVICE_ROLE",
      "NEXT_PUBLIC",
      "@supabase/supabase-js",
      "createClient",
      "process.env",
    ]) {
      expect(src).not.toContain(forbidden);
    }
  });

  test("constructor rejects missing persistence port with unauthorized", async () => {
    let caught: PersistenceError | null = null;
    try {
      new UsageEmitter({ persistence: undefined as unknown as UsageEmitter["emit"] extends (ctx: infer _C, i: infer _I) => Promise<void> ? never : never } as never);
    } catch (err) {
      caught = err as PersistenceError;
    }
    expect(caught).not.toBeNull();
    expect(caught?.code).toBe("unauthorized");
  });

  test("UsageEntry shape emitted through emit matches the record persisted in the ledger", async () => {
    // End-to-end round-trip: build an entry via the emitter, then read the
    // row back with `service_role` and compare all normative fields.
    const emitter = buildEmitter(actorA);
    const ctx = ctxOf(actorA, tenantA);
    const key = randomUUID();
    const corr = randomUUID();
    const source = `hito_8_4_roundtrip_${suiteId}`;
    const shape: Omit<UsageEntry, "tenantId"> = {
      metricKind: "voice_seconds",
      quantity: 7.25,
      unit: "seconds",
      occurredAt: asISOTimestamp("2026-08-05T18:15:00.000Z"),
      source,
      idempotencyKey: asUUID(key),
      entryKind: "normal",
      correlationId: asUUID(corr),
    };
    await emitter.emit(ctx, shape);
    const { data } = await admin.schema("spabla_v2").from("usage_ledger")
      .select("tenant_id, metric_kind, unit, quantity, source, idempotency_key, entry_kind, correlation_id")
      .eq("tenant_id", tenantA).eq("source", source).eq("idempotency_key", key)
      .maybeSingle();
    expect(data).not.toBeNull();
    expect(data?.tenant_id).toBe(tenantA);
    expect(data?.metric_kind).toBe(shape.metricKind);
    expect(data?.unit).toBe(shape.unit);
    expect(Number(data?.quantity)).toBeCloseTo(shape.quantity, 6);
    expect(data?.source).toBe(shape.source);
    expect(data?.idempotency_key).toBe(key);
    expect(data?.entry_kind).toBe(shape.entryKind);
    expect(data?.correlation_id).toBe(corr);
  });
});
