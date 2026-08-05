/**
 * SPABLA Engine — SupabasePersistence integration tests (Fase 8 · Hito 8.3).
 *
 * These tests run against a LOCAL Supabase stack started by `supabase start`
 * on the CI runner (Job B). They NEVER touch a productive project.
 *
 * The suite is skipped automatically when the required environment variables
 * are not present, so `npx vitest run` continues to be safe in local dev
 * without Docker (Plan Fase 8 §10.4 forbids leaking `service_role` outside
 * trusted server-side contexts; the values here are ephemeral, provided by
 * the `supabase status -o json` output of the runner).
 *
 * Required env vars (set by `scripts/ci/run-integration-tests.sh`):
 *   SPABLA_TEST_SUPABASE_URL
 *   SPABLA_TEST_SUPABASE_ANON_KEY
 *   SPABLA_TEST_SUPABASE_SERVICE_ROLE_KEY
 */

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test,
} from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { SupabasePersistence } from "./supabase-persistence";
import {
  buildTenantContext,
  type TenantContext,
} from "../tenant-context";
import { buildVerifiedIdentityFromTrustedBoundary } from "../identity";
import { makeMessageCursor } from "../port";
import type {
  ActorId,
  ConversationId,
  ConversationRecord,
  MessageRecord,
  TenantId,
  UsageEntry,
} from "../port";
import type { PersistenceError } from "../errors";
import { asISOTimestamp, asUUID } from "../../../types/ids";
import type { LangCode } from "../../../types/language";

const URL = process.env.SPABLA_TEST_SUPABASE_URL ?? "";
const ANON = process.env.SPABLA_TEST_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SPABLA_TEST_SUPABASE_SERVICE_ROLE_KEY ?? "";
const ENABLED = URL !== "" && ANON !== "" && SERVICE !== "";

const ES: LangCode = "es";
const EN: LangCode = "en";

const TENANT_A_UUID = "10000000-0000-0000-0000-00000000000a";
const TENANT_B_UUID = "10000000-0000-0000-0000-00000000000b";

type Actor = {
  readonly id: ActorId;
  readonly email: string;
  readonly password: string;
  jwt: string;
};

async function signIn(email: string, password: string): Promise<{ id: string; jwt: string }> {
  const anonClient = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    throw new Error(`signIn failed for ${email}: ${error?.message ?? "no session"}`);
  }
  return { id: data.user.id, jwt: data.session.access_token };
}

function authClient(jwt: string): SupabaseClient {
  return createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

function privileged(): SupabaseClient {
  return createClient(URL, SERVICE, {
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

function makeConversation(
  tenantId: string,
  conversationId: string,
  createdBy: ActorId,
  language: LangCode = ES,
): ConversationRecord {
  return {
    tenantId: asUUID(tenantId),
    conversationId: asUUID(conversationId),
    createdAt: asISOTimestamp("2026-08-05T10:00:00.000Z"),
    createdBy,
    language,
  };
}

function makeMessage(
  tenantId: string,
  conversationId: string,
  messageId: string,
  senderId: ActorId,
  text: string,
  createdAt: string,
  language: LangCode = ES,
): MessageRecord {
  return {
    tenantId: asUUID(tenantId),
    conversationId: asUUID(conversationId),
    messageId: asUUID(messageId),
    senderId,
    text,
    language,
    createdAt: asISOTimestamp(createdAt),
  };
}

async function pgIsError(promise: Promise<unknown>): Promise<PersistenceError> {
  try {
    await promise;
  } catch (err) {
    return err as PersistenceError;
  }
  throw new Error("expected PersistenceError; got success");
}

// eslint-disable-next-line vitest/no-conditional-tests
describe.skipIf(!ENABLED)("SupabasePersistence integration", () => {
  let admin: SupabaseClient;
  const suiteId = `${Date.now().toString(16)}-${Math.floor(Math.random() * 1e9).toString(16)}`;
  const emailA = `spabla-a-${suiteId}@example.test`;
  const emailB = `spabla-b-${suiteId}@example.test`;
  const password = "P@ssw0rd-8-3-!";
  const actorA: Actor = { id: asUUID("00000000-0000-0000-0000-000000000000"), email: emailA, password, jwt: "" };
  const actorB: Actor = { id: asUUID("00000000-0000-0000-0000-000000000000"), email: emailB, password, jwt: "" };

  beforeAll(async () => {
    admin = privileged();
    // 1) create the two auth users with the service_role admin API.
    for (const actor of [actorA, actorB]) {
      const { data, error } = await admin.auth.admin.createUser({
        email: actor.email,
        password: actor.password,
        email_confirm: true,
      });
      if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
      (actor as { id: ActorId }).id = asUUID(data.user.id);
    }
    // 2) bootstrap tenants + memberships via service_role.
    const setup = await admin.schema("spabla_v2").from("tenants").insert([
      { id: TENANT_A_UUID, name: `Tenant A ${suiteId}` },
      { id: TENANT_B_UUID, name: `Tenant B ${suiteId}` },
    ]);
    if (setup.error) throw new Error(`tenants insert failed: ${setup.error.message}`);

    async function addMembership(tenantId: string, actorId: string, role: string): Promise<void> {
      const r = await admin.schema("spabla_v2").rpc("admin_add_membership", {
        p_tenant_id: tenantId,
        p_actor_id: actorId,
        p_role: role,
      });
      if (r.error) throw new Error(`admin_add_membership failed: ${r.error.message}`);
    }
    await addMembership(TENANT_A_UUID, actorA.id, "owner");
    await addMembership(TENANT_B_UUID, actorB.id, "owner");

    // 3) sign in both actors to obtain their JWTs.
    for (const actor of [actorA, actorB]) {
      const { id, jwt } = await signIn(actor.email, actor.password);
      if (id !== actor.id) throw new Error("signIn returned different user id");
      actor.jwt = jwt;
    }
  }, 60_000);

  afterAll(async () => {
    // Best-effort cleanup: remove auth users; tenants stay for post-mortem.
    for (const actor of [actorA, actorB]) {
      if (actor.id !== "00000000-0000-0000-0000-000000000000") {
        await admin.auth.admin.deleteUser(actor.id).catch(() => undefined);
      }
    }
    await admin.schema("spabla_v2").from("tenants").delete().in("id", [TENANT_A_UUID, TENANT_B_UUID]).then(() => undefined, () => undefined);
  });

  // ────────────────────────────────────────────────────────────────
  // Positive paths
  // ────────────────────────────────────────────────────────────────

  test("saveConversation → loadConversation returns the saved record", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const ctx = ctxOf(actorA, TENANT_A_UUID);
    const conv = makeConversation(TENANT_A_UUID, "20000000-0000-0000-0000-00000000ca01", actorA.id);
    await adapter.saveConversation(ctx, conv);
    const loaded = await adapter.loadConversation(ctx, conv.conversationId);
    expect(loaded).not.toBeNull();
    expect(loaded?.conversationId).toBe(conv.conversationId);
    expect(loaded?.tenantId).toBe(conv.tenantId);
    expect(loaded?.createdBy).toBe(conv.createdBy);
    expect(loaded?.language).toBe(conv.language);
  });

  test("saveMessage × N → listMessages paginates deterministically", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const ctx = ctxOf(actorA, TENANT_A_UUID);
    const convId = "20000000-0000-0000-0000-00000000ca02";
    await adapter.saveConversation(ctx, makeConversation(TENANT_A_UUID, convId, actorA.id));
    const seededIds: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const mid = `30000000-0000-0000-0000-0000000000${(i + 1).toString(16).padStart(2, "0")}`;
      seededIds.push(mid);
      const createdAt = new Date(Date.UTC(2026, 7, 5, 12, 0, i)).toISOString();
      await adapter.saveMessage(ctx, makeMessage(TENANT_A_UUID, convId, mid, actorA.id, `m${i}`, createdAt));
    }
    const page1 = await adapter.listMessages(ctx, {
      conversationId: asUUID(convId),
      limit: 3,
      cursor: null,
    });
    expect(page1.items.map((m) => m.messageId)).toEqual(seededIds.slice(0, 3).map(asUUID));
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await adapter.listMessages(ctx, {
      conversationId: asUUID(convId),
      limit: 3,
      cursor: page1.nextCursor,
    });
    expect(page2.items.map((m) => m.messageId)).toEqual(seededIds.slice(3).map(asUUID));
    expect(page2.nextCursor).toBeNull();
  });

  test("saveConversation idempotent identical retry succeeds silently", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const ctx = ctxOf(actorA, TENANT_A_UUID);
    const conv = makeConversation(TENANT_A_UUID, "20000000-0000-0000-0000-00000000ca03", actorA.id);
    await adapter.saveConversation(ctx, conv);
    await expect(adapter.saveConversation(ctx, conv)).resolves.toBeUndefined();
  });

  test("saveMessage idempotent identical retry succeeds silently", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const ctx = ctxOf(actorA, TENANT_A_UUID);
    const convId = "20000000-0000-0000-0000-00000000ca04";
    await adapter.saveConversation(ctx, makeConversation(TENANT_A_UUID, convId, actorA.id));
    const msg = makeMessage(TENANT_A_UUID, convId, "30000000-0000-0000-0000-0000000000f1", actorA.id, "hi", "2026-08-05T12:10:00.000Z");
    await adapter.saveMessage(ctx, msg);
    await expect(adapter.saveMessage(ctx, msg)).resolves.toBeUndefined();
  });

  test("appendUsage inserts and is idempotent tenant-scoped", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const ctx = ctxOf(actorA, TENANT_A_UUID);
    const entry: UsageEntry = {
      tenantId: ctx.tenantId,
      metricKind: "text_chars",
      quantity: 42,
      unit: "chars",
      occurredAt: asISOTimestamp("2026-08-05T13:00:00.000Z"),
      source: "hito_8_3_test",
      idempotencyKey: asUUID("40000000-0000-0000-0000-0000000000e1"),
      entryKind: "normal",
      correlationId: null,
    };
    await adapter.appendUsage(ctx, entry);
    await adapter.appendUsage(ctx, entry);
    const { count } = await admin
      .schema("spabla_v2")
      .from("usage_ledger")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", entry.tenantId)
      .eq("source", entry.source)
      .eq("idempotency_key", entry.idempotencyKey);
    expect(count).toBe(1);
  });

  // ────────────────────────────────────────────────────────────────
  // Negative paths — every rejection asserts a specific code.
  // ────────────────────────────────────────────────────────────────

  test("actorId ≠ auth.uid() fails identity_invalid", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const wrongCtx = buildTenantContext(
      buildVerifiedIdentityFromTrustedBoundary(
        asUUID("00000000-0000-0000-0000-00000000dead"),
        asISOTimestamp(new Date().toISOString()),
        "supabase_auth_jwt",
      ),
      asUUID(TENANT_A_UUID) as TenantId,
    );
    const err = await pgIsError(adapter.loadConversation(wrongCtx, asUUID("20000000-0000-0000-0000-00000000ca01")));
    expect(err.code).toBe("identity_invalid");
  });

  test("record.tenantId ≠ ctx.tenantId fails tenant_context_invalid", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const ctx = ctxOf(actorA, TENANT_A_UUID);
    const bad = makeConversation(TENANT_B_UUID, "20000000-0000-0000-0000-000000000baa", actorA.id);
    const err = await pgIsError(adapter.saveConversation(ctx, bad));
    expect(err.code).toBe("tenant_context_invalid");
  });

  test("actor A cannot see tenant B rows (cross-tenant read returns null)", async () => {
    const adapterA = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const adapterB = new SupabasePersistence({ authenticated: authClient(actorB.jwt), privileged: admin });
    const ctxB = ctxOf(actorB, TENANT_B_UUID);
    const conv = makeConversation(TENANT_B_UUID, "20000000-0000-0000-0000-000000000bbb", actorB.id);
    await adapterB.saveConversation(ctxB, conv);
    const ctxA_forB = buildTenantContext(
      buildVerifiedIdentityFromTrustedBoundary(actorA.id, asISOTimestamp(new Date().toISOString()), "supabase_auth_jwt"),
      asUUID(TENANT_B_UUID) as TenantId,
    );
    // Identity probe passes (JWT.sub == ctx.actorId); RLS then returns 0 rows.
    const loaded = await adapterA.loadConversation(ctxA_forB, asUUID("20000000-0000-0000-0000-000000000bbb"));
    expect(loaded).toBeNull();
  });

  test("saveMessage conflictive retry raises code:conflict", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const ctx = ctxOf(actorA, TENANT_A_UUID);
    const convId = "20000000-0000-0000-0000-00000000ca05";
    await adapter.saveConversation(ctx, makeConversation(TENANT_A_UUID, convId, actorA.id));
    const mid = "30000000-0000-0000-0000-0000000000f2";
    await adapter.saveMessage(ctx, makeMessage(TENANT_A_UUID, convId, mid, actorA.id, "hi", "2026-08-05T12:20:00.000Z"));
    const err = await pgIsError(adapter.saveMessage(ctx, makeMessage(TENANT_A_UUID, convId, mid, actorA.id, "DIFFERENT", "2026-08-05T12:20:00.000Z")));
    expect(err.code).toBe("conflict");
  });

  test("loadConversation of unknown id returns null (not_found is never leaked)", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const ctx = ctxOf(actorA, TENANT_A_UUID);
    const missing = await adapter.loadConversation(ctx, asUUID("20000000-0000-0000-0000-0000000missng"));
    expect(missing).toBeNull();
  });

  test("listMessages limit > 500 raises unauthorized", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const ctx = ctxOf(actorA, TENANT_A_UUID);
    const err = await pgIsError(adapter.listMessages(ctx, {
      conversationId: asUUID("20000000-0000-0000-0000-00000000ca02") as ConversationId,
      limit: 501,
      cursor: null,
    }));
    expect(err.code).toBe("unauthorized");
  });

  test("listMessages cursor from another conversation raises not_found", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const ctx = ctxOf(actorA, TENANT_A_UUID);
    const otherConvId = "20000000-0000-0000-0000-00000000ca06";
    await adapter.saveConversation(ctx, makeConversation(TENANT_A_UUID, otherConvId, actorA.id));
    const otherMid = "30000000-0000-0000-0000-0000000000f3";
    await adapter.saveMessage(ctx, makeMessage(TENANT_A_UUID, otherConvId, otherMid, actorA.id, "solo", "2026-08-05T12:30:00.000Z"));
    const foreignCursor = makeMessageCursor(
      asISOTimestamp("2026-08-05T12:30:00.000Z"),
      asUUID(otherMid),
    );
    const err = await pgIsError(adapter.listMessages(ctx, {
      conversationId: asUUID("20000000-0000-0000-0000-00000000ca02") as ConversationId,
      limit: 10,
      cursor: foreignCursor,
    }));
    expect(err.code).toBe("not_found");
  });

  test("appendUsage without privileged capability raises unauthorized", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: null });
    const ctx = ctxOf(actorA, TENANT_A_UUID);
    const entry: UsageEntry = {
      tenantId: ctx.tenantId,
      metricKind: "turns",
      quantity: 1,
      unit: "turns",
      occurredAt: asISOTimestamp("2026-08-05T13:10:00.000Z"),
      source: "hito_8_3_test_noprv",
      idempotencyKey: asUUID("40000000-0000-0000-0000-0000000000e2"),
      entryKind: "normal",
      correlationId: null,
    };
    const err = await pgIsError(adapter.appendUsage(ctx, entry));
    expect(err.code).toBe("unauthorized");
  });

  test("direct INSERT on usage_ledger with authenticated JWT is denied by RLS", async () => {
    const client = authClient(actorA.jwt);
    const { error } = await client.schema("spabla_v2").from("usage_ledger").insert({
      tenant_id: TENANT_A_UUID,
      source: "hito_8_3_test_bypass",
      metric_kind: "turns",
      quantity: 1,
      unit: "turns",
      occurred_at: "2026-08-05T13:20:00.000Z",
      idempotency_key: "40000000-0000-0000-0000-0000000000e3",
      entry_kind: "normal",
    });
    expect(error).not.toBeNull();
  });

  test("actor B (correct JWT) but no membership in tenant A cannot read tenant A rows", async () => {
    const adapterB = new SupabasePersistence({ authenticated: authClient(actorB.jwt), privileged: admin });
    const ctxB_forA = buildTenantContext(
      buildVerifiedIdentityFromTrustedBoundary(actorB.id, asISOTimestamp(new Date().toISOString()), "supabase_auth_jwt"),
      asUUID(TENANT_A_UUID) as TenantId,
    );
    const loaded = await adapterB.loadConversation(ctxB_forA, asUUID("20000000-0000-0000-0000-00000000ca01"));
    expect(loaded).toBeNull();
  });

  test("EN and ES languages round-trip without loss", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const ctx = ctxOf(actorA, TENANT_A_UUID);
    const conv = makeConversation(TENANT_A_UUID, "20000000-0000-0000-0000-00000000ca07", actorA.id, EN);
    await adapter.saveConversation(ctx, conv);
    const loaded = await adapter.loadConversation(ctx, conv.conversationId);
    expect(loaded?.language).toBe(EN);
  });
});
