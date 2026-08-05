/**
 * SPABLA Engine — SupabasePersistence integration tests (Fase 8 · Hito 8.3).
 *
 * These tests run against a LOCAL Supabase stack started by `supabase start`
 * on the CI runner (Job B). They NEVER touch a productive project. The suite
 * is skipped automatically when the required environment variables are not
 * present, so `npx vitest run` continues to be safe in local dev without
 * Docker.
 *
 * Every identifier used by the suite is generated per-run with
 * `crypto.randomUUID()` — no fixed tenant/actor IDs are reused across runs,
 * so concurrent CI runs against the same stack cannot collide.
 *
 * Required env vars (set by `.github/workflows/ci.yml`):
 *   SPABLA_TEST_SUPABASE_URL
 *   SPABLA_TEST_SUPABASE_ANON_KEY
 *   SPABLA_TEST_SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

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

const SUPABASE_URL = process.env.SPABLA_TEST_SUPABASE_URL ?? "";
const ANON = process.env.SPABLA_TEST_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SPABLA_TEST_SUPABASE_SERVICE_ROLE_KEY ?? "";
const ENABLED = SUPABASE_URL !== "" && ANON !== "" && SERVICE !== "";

const ES: LangCode = "es";
const EN: LangCode = "en";

type Actor = {
  id: ActorId;
  readonly email: string;
  readonly password: string;
  jwt: string;
};

async function signIn(email: string, password: string): Promise<{ id: string; jwt: string }> {
  const anonClient = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
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

function makeConversation(
  tenantId: string,
  conversationId: string,
  createdBy: ActorId,
  language: LangCode = ES,
  createdAt: string = "2026-08-05T10:00:00.000Z",
): ConversationRecord {
  return {
    tenantId: asUUID(tenantId),
    conversationId: asUUID(conversationId),
    createdAt: asISOTimestamp(createdAt),
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
  const suiteId = randomUUID().slice(0, 12);
  // Unique per-run identifiers. No collision across concurrent runs.
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const emailA = `spabla-a-${suiteId}@example.test`;
  const emailB = `spabla-b-${suiteId}@example.test`;
  const password = "P@ssw0rd-8-3-!";
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
      { id: tenantA, name: `Tenant A ${suiteId}` },
      { id: tenantB, name: `Tenant B ${suiteId}` },
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
    // Tolerate partial setup: only touch resources we actually created.
    if (admin === undefined) return;
    for (const uid of createdActorIds) {
      await admin.auth.admin.deleteUser(uid).catch(() => undefined);
    }
    if (createdTenantIds.length > 0) {
      await admin.schema("spabla_v2").from("tenants").delete().in("id", createdTenantIds).then(() => undefined, () => undefined);
    }
  });

  const conv = (n: string): string => `${tenantA.slice(0, 24)}${n.padStart(12, "0")}`;

  // ────────────────────────────────────────────────────────────────
  // Positive paths
  // ────────────────────────────────────────────────────────────────

  test("saveConversation → loadConversation returns the saved record", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const ctx = ctxOf(actorA, tenantA);
    const cid = randomUUID();
    const c = makeConversation(tenantA, cid, actorA.id);
    await adapter.saveConversation(ctx, c);
    const loaded = await adapter.loadConversation(ctx, c.conversationId);
    expect(loaded?.conversationId).toBe(c.conversationId);
    expect(loaded?.tenantId).toBe(c.tenantId);
    expect(loaded?.createdBy).toBe(c.createdBy);
    expect(loaded?.language).toBe(c.language);
  });

  test("saveMessage × N → listMessages paginates deterministically", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const ctx = ctxOf(actorA, tenantA);
    const cid = randomUUID();
    await adapter.saveConversation(ctx, makeConversation(tenantA, cid, actorA.id));
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const mid = randomUUID();
      ids.push(mid);
      const createdAt = new Date(Date.UTC(2026, 7, 5, 12, 0, i)).toISOString();
      await adapter.saveMessage(ctx, makeMessage(tenantA, cid, mid, actorA.id, `m${i}`, createdAt));
    }
    const page1 = await adapter.listMessages(ctx, {
      conversationId: asUUID(cid),
      limit: 3,
      cursor: null,
    });
    expect(page1.items.map((m) => m.messageId)).toEqual(ids.slice(0, 3).map(asUUID));
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await adapter.listMessages(ctx, {
      conversationId: asUUID(cid),
      limit: 3,
      cursor: page1.nextCursor,
    });
    expect(page2.items.map((m) => m.messageId)).toEqual(ids.slice(3).map(asUUID));
    expect(page2.nextCursor).toBeNull();
  });

  test("saveConversation idempotent identical retry succeeds silently", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const ctx = ctxOf(actorA, tenantA);
    const c = makeConversation(tenantA, randomUUID(), actorA.id);
    await adapter.saveConversation(ctx, c);
    await expect(adapter.saveConversation(ctx, c)).resolves.toBeUndefined();
  });

  test("saveMessage idempotent identical retry succeeds silently", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const ctx = ctxOf(actorA, tenantA);
    const cid = randomUUID();
    await adapter.saveConversation(ctx, makeConversation(tenantA, cid, actorA.id));
    const m = makeMessage(tenantA, cid, randomUUID(), actorA.id, "hi", "2026-08-05T12:10:00.000Z");
    await adapter.saveMessage(ctx, m);
    await expect(adapter.saveMessage(ctx, m)).resolves.toBeUndefined();
  });

  test("appendUsage inserts and is idempotent tenant-scoped", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const ctx = ctxOf(actorA, tenantA);
    const key = randomUUID();
    const source = `hito_8_3_test_${suiteId}`;
    const entry: UsageEntry = {
      tenantId: ctx.tenantId,
      metricKind: "text_chars",
      quantity: 42,
      unit: "chars",
      occurredAt: asISOTimestamp("2026-08-05T13:00:00.000Z"),
      source,
      idempotencyKey: asUUID(key),
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
      .eq("source", source)
      .eq("idempotency_key", key);
    expect(count).toBe(1);
  });

  test("EN and ES languages round-trip without loss", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const ctx = ctxOf(actorA, tenantA);
    const c = makeConversation(tenantA, randomUUID(), actorA.id, EN);
    await adapter.saveConversation(ctx, c);
    const loaded = await adapter.loadConversation(ctx, c.conversationId);
    expect(loaded?.language).toBe(EN);
  });

  // ────────────────────────────────────────────────────────────────
  // Negative paths — each assertion asserts the exact code.
  // ────────────────────────────────────────────────────────────────

  test("actorId ≠ auth.uid() fails identity_invalid", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const wrongCtx = buildTenantContext(
      buildVerifiedIdentityFromTrustedBoundary(
        asUUID(randomUUID()),
        asISOTimestamp(new Date().toISOString()),
        "supabase_auth_jwt",
      ),
      asUUID(tenantA) as TenantId,
    );
    const err = await pgIsError(adapter.loadConversation(wrongCtx, asUUID(randomUUID())));
    expect(err.code).toBe("identity_invalid");
  });

  test("record.tenantId ≠ ctx.tenantId fails tenant_context_invalid", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const ctx = ctxOf(actorA, tenantA);
    const bad = makeConversation(tenantB, randomUUID(), actorA.id);
    const err = await pgIsError(adapter.saveConversation(ctx, bad));
    expect(err.code).toBe("tenant_context_invalid");
  });

  test("cross-tenant read returns null under RLS", async () => {
    const adapterB = new SupabasePersistence({ authenticated: authClient(actorB.jwt), privileged: admin });
    const ctxB = ctxOf(actorB, tenantB);
    const c = makeConversation(tenantB, randomUUID(), actorB.id);
    await adapterB.saveConversation(ctxB, c);
    const adapterA = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const ctxA_forB = buildTenantContext(
      buildVerifiedIdentityFromTrustedBoundary(actorA.id, asISOTimestamp(new Date().toISOString()), "supabase_auth_jwt"),
      asUUID(tenantB) as TenantId,
    );
    const loaded = await adapterA.loadConversation(ctxA_forB, c.conversationId);
    expect(loaded).toBeNull();
  });

  test("saveMessage conflictive retry raises code:conflict", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const ctx = ctxOf(actorA, tenantA);
    const cid = randomUUID();
    await adapter.saveConversation(ctx, makeConversation(tenantA, cid, actorA.id));
    const mid = randomUUID();
    await adapter.saveMessage(ctx, makeMessage(tenantA, cid, mid, actorA.id, "hi", "2026-08-05T12:20:00.000Z"));
    const err = await pgIsError(adapter.saveMessage(ctx, makeMessage(tenantA, cid, mid, actorA.id, "DIFFERENT", "2026-08-05T12:20:00.000Z")));
    expect(err.code).toBe("conflict");
  });

  test("loadConversation of unknown id returns null", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const ctx = ctxOf(actorA, tenantA);
    const missing = await adapter.loadConversation(ctx, asUUID(randomUUID()));
    expect(missing).toBeNull();
  });

  test("listMessages limit 0 raises constraint_violation", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const ctx = ctxOf(actorA, tenantA);
    const err = await pgIsError(adapter.listMessages(ctx, {
      conversationId: asUUID(randomUUID()) as ConversationId,
      limit: 0,
      cursor: null,
    }));
    expect(err.code).toBe("constraint_violation");
  });

  test("listMessages limit 501 raises constraint_violation", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const ctx = ctxOf(actorA, tenantA);
    const err = await pgIsError(adapter.listMessages(ctx, {
      conversationId: asUUID(randomUUID()) as ConversationId,
      limit: 501,
      cursor: null,
    }));
    expect(err.code).toBe("constraint_violation");
  });

  test("listMessages cursor malformed raises constraint_violation", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const ctx = ctxOf(actorA, tenantA);
    const malformed = {
      createdAt: "not-a-timestamp",
      messageId: "not-a-uuid",
    } as unknown as ReturnType<typeof makeMessageCursor>;
    const err = await pgIsError(adapter.listMessages(ctx, {
      conversationId: asUUID(randomUUID()) as ConversationId,
      limit: 10,
      cursor: malformed,
    }));
    expect(err.code).toBe("constraint_violation");
  });

  test("listMessages cursor from another conversation raises not_found", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const ctx = ctxOf(actorA, tenantA);
    const otherCid = randomUUID();
    await adapter.saveConversation(ctx, makeConversation(tenantA, otherCid, actorA.id));
    const otherMid = randomUUID();
    await adapter.saveMessage(ctx, makeMessage(tenantA, otherCid, otherMid, actorA.id, "solo", "2026-08-05T12:30:00.000Z"));
    const foreignCursor = makeMessageCursor(
      asISOTimestamp("2026-08-05T12:30:00.000Z"),
      asUUID(otherMid),
    );
    const targetCid = randomUUID();
    await adapter.saveConversation(ctx, makeConversation(tenantA, targetCid, actorA.id));
    const err = await pgIsError(adapter.listMessages(ctx, {
      conversationId: asUUID(targetCid) as ConversationId,
      limit: 10,
      cursor: foreignCursor,
    }));
    expect(err.code).toBe("not_found");
  });

  test("appendUsage without privileged capability raises unauthorized", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: null });
    const ctx = ctxOf(actorA, tenantA);
    const entry: UsageEntry = {
      tenantId: ctx.tenantId,
      metricKind: "turns",
      quantity: 1,
      unit: "turns",
      occurredAt: asISOTimestamp("2026-08-05T13:10:00.000Z"),
      source: `hito_8_3_test_noprv_${suiteId}`,
      idempotencyKey: asUUID(randomUUID()),
      entryKind: "normal",
      correlationId: null,
    };
    const err = await pgIsError(adapter.appendUsage(ctx, entry));
    expect(err.code).toBe("unauthorized");
  });

  test("direct INSERT on usage_ledger with authenticated JWT is denied by RLS", async () => {
    const client = authClient(actorA.jwt);
    const { error } = await client.schema("spabla_v2").from("usage_ledger").insert({
      tenant_id: tenantA,
      source: `hito_8_3_test_bypass_${suiteId}`,
      metric_kind: "turns",
      quantity: 1,
      unit: "turns",
      occurred_at: "2026-08-05T13:20:00.000Z",
      idempotency_key: randomUUID(),
      entry_kind: "normal",
    });
    expect(error).not.toBeNull();
  });

  test("actor B (correct JWT) but no membership in tenant A cannot read tenant A rows", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const ctxA = ctxOf(actorA, tenantA);
    const cid = randomUUID();
    await adapter.saveConversation(ctxA, makeConversation(tenantA, cid, actorA.id));
    const adapterB = new SupabasePersistence({ authenticated: authClient(actorB.jwt), privileged: admin });
    const ctxB_forA = buildTenantContext(
      buildVerifiedIdentityFromTrustedBoundary(actorB.id, asISOTimestamp(new Date().toISOString()), "supabase_auth_jwt"),
      asUUID(tenantA) as TenantId,
    );
    const loaded = await adapterB.loadConversation(ctxB_forA, asUUID(cid));
    expect(loaded).toBeNull();
  });

  test("membership deactivated → previously-authorised actor loses access", async () => {
    // Create a fresh user and give it active membership on tenantA. It should
    // see tenantA rows; after admin_deactivate_membership, it must not.
    const tempEmail = `spabla-tmp-${suiteId}-${randomUUID().slice(0,8)}@example.test`;
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

    const adapter = new SupabasePersistence({ authenticated: authClient(tempJwt), privileged: admin });
    const ctx = buildTenantContext(
      buildVerifiedIdentityFromTrustedBoundary(tempAid, asISOTimestamp(new Date().toISOString()), "supabase_auth_jwt"),
      asUUID(tenantA) as TenantId,
    );
    // active → creating a conversation succeeds under RLS
    const cid = randomUUID();
    await adapter.saveConversation(ctx, makeConversation(tenantA, cid, tempAid));

    // deactivate
    await admin.schema("spabla_v2").rpc("admin_deactivate_membership", {
      p_tenant_id: tenantA, p_actor_id: tempAid,
    });

    // now the same actor cannot read the row via RLS (0 rows visible)
    const missing = await adapter.loadConversation(ctx, asUUID(cid));
    expect(missing).toBeNull();
  });

  test("identity mismatch between two operations of the same instance fails identity_invalid", async () => {
    // Same instance, second operation carries the wrong actorId → probe by
    // operation detects the divergence.
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const ctxA = ctxOf(actorA, tenantA);
    await adapter.loadConversation(ctxA, asUUID(randomUUID()));
    const badCtx = buildTenantContext(
      buildVerifiedIdentityFromTrustedBoundary(
        asUUID(randomUUID()),
        asISOTimestamp(new Date().toISOString()),
        "supabase_auth_jwt",
      ),
      asUUID(tenantA) as TenantId,
    );
    const err = await pgIsError(adapter.loadConversation(badCtx, asUUID(randomUUID())));
    expect(err.code).toBe("identity_invalid");
  });

  test("privileged client is used only inside appendUsage (structural check)", () => {
    // Read the compiled TS source and verify every occurrence of
    // `this.privileged` appears inside the appendUsage method body.
    const src = readFileSync(
      new URL("./supabase-persistence.ts", import.meta.url),
      "utf-8",
    );
    const idx = [...src.matchAll(/this\.privileged/g)].map((m) => m.index ?? 0);
    // Ignore the private-field declaration and constructor assignment; those
    // do not constitute "use". Locate the appendUsage body and require every
    // remaining usage to fall inside it.
    const appendStart = src.indexOf("async appendUsage(");
    if (appendStart === -1) throw new Error("appendUsage not found in source");
    const appendEnd = src.indexOf("\n  }\n", appendStart);
    if (appendEnd === -1) throw new Error("appendUsage body end not found");
    // Constructor assignment `this.privileged = capabilities.privileged`:
    const ctorAssign = src.indexOf("this.privileged = capabilities.privileged");
    const declOccurrence = src.indexOf("private readonly privileged");
    const allowed = new Set<number>([declOccurrence, ctorAssign]);
    for (const i of idx) {
      if (allowed.has(i)) continue;
      if (i >= appendStart && i <= appendEnd) continue;
      throw new Error(`privileged used outside appendUsage at offset ${i}`);
    }
    expect(idx.length).toBeGreaterThan(0);
  });

  test("service unavailable is normalised to code:unavailable retryable:true", async () => {
    // Build a client whose fetch always throws a transport error.
    const failingFetch = () => Promise.reject(new Error("fetch failed: ENOTFOUND supabase.example"));
    const broken = createClient(SUPABASE_URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: failingFetch as unknown as typeof fetch,
        headers: { Authorization: `Bearer ${actorA.jwt}` },
      },
    });
    const adapter = new SupabasePersistence({ authenticated: broken, privileged: admin });
    const ctx = ctxOf(actorA, tenantA);
    const err = await pgIsError(adapter.loadConversation(ctx, asUUID(randomUUID())));
    expect(err.code).toBe("unavailable");
    expect(err.retryable).toBe(true);
    // The opaque message must not leak transport details or credentials.
    for (const forbidden of [
      "ENOTFOUND",
      "Service Unavailable",
      "supabase.example",
      "Bearer",
      "Authorization",
      "JWT",
      "token",
      actorA.jwt,
    ]) {
      expect(err.message).not.toContain(forbidden);
    }
  });

  test("transient 503 response normalises to code:unavailable retryable:true", async () => {
    // Simulate a transient 503 via a stub fetch. The 503 body contains
    // sensitive-looking strings that must never surface in err.message.
    const oneShot503 = ((): typeof fetch => {
      return (async () => {
        return new Response(
          "Service Unavailable 503 — Bearer leaked-token-payload JWT=abc.def.ghi",
          { status: 503, statusText: "Service Unavailable" },
        );
      }) as unknown as typeof fetch;
    })();
    const broken = createClient(SUPABASE_URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: oneShot503,
        headers: { Authorization: `Bearer ${actorA.jwt}` },
      },
    });
    const adapter = new SupabasePersistence({ authenticated: broken, privileged: admin });
    const ctx = ctxOf(actorA, tenantA);
    const err = await pgIsError(adapter.loadConversation(ctx, asUUID(randomUUID())));
    expect(err.code).toBe("unavailable");
    expect(err.retryable).toBe(true);
    for (const forbidden of [
      "Service Unavailable",
      "leaked-token-payload",
      "Bearer",
      "Authorization",
      "JWT",
      "token",
      "abc.def.ghi",
      actorA.jwt,
      SUPABASE_URL,
    ]) {
      expect(err.message).not.toContain(forbidden);
    }
  });

  test("invalid JWT / no session normalises to code:identity_invalid retryable:false", async () => {
    // Build an authenticated client with a JWT that Supabase Auth will
    // reject with 401. `auth.getUser()` must return an auth error, not a
    // transport failure. The adapter must classify this as identity, not
    // unavailable.
    const bogusJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAifQ.invalid-signature";
    const client = authClient(bogusJwt);
    const adapter = new SupabasePersistence({ authenticated: client, privileged: admin });
    const ctx = ctxOf(actorA, tenantA);
    const err = await pgIsError(adapter.loadConversation(ctx, asUUID(randomUUID())));
    expect(err.code).toBe("identity_invalid");
    expect(err.retryable).toBe(false);
    for (const forbidden of [bogusJwt, "Bearer", "Authorization", SUPABASE_URL]) {
      expect(err.message).not.toContain(forbidden);
    }
  });

  test("two identical concurrent saveMessage inserts both resolve without duplication", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const ctx = ctxOf(actorA, tenantA);
    const cid = randomUUID();
    await adapter.saveConversation(ctx, makeConversation(tenantA, cid, actorA.id));
    const mid = randomUUID();
    const m = makeMessage(tenantA, cid, mid, actorA.id, "concurrent", "2026-08-05T12:40:00.000Z");
    const results = await Promise.allSettled([adapter.saveMessage(ctx, m), adapter.saveMessage(ctx, m)]);
    for (const r of results) {
      expect(r.status).toBe("fulfilled");
    }
    const { count } = await admin
      .schema("spabla_v2")
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("id", mid);
    expect(count).toBe(1);
  });

  test("two conflicting concurrent saveMessage inserts: one succeeds, the other fails with conflict", async () => {
    const adapter = new SupabasePersistence({ authenticated: authClient(actorA.jwt), privileged: admin });
    const ctx = ctxOf(actorA, tenantA);
    const cid = randomUUID();
    await adapter.saveConversation(ctx, makeConversation(tenantA, cid, actorA.id));
    const mid = randomUUID();
    const m1 = makeMessage(tenantA, cid, mid, actorA.id, "A", "2026-08-05T12:50:00.000Z");
    const m2 = makeMessage(tenantA, cid, mid, actorA.id, "B", "2026-08-05T12:50:00.000Z");
    const results = await Promise.allSettled([adapter.saveMessage(ctx, m1), adapter.saveMessage(ctx, m2)]);
    const successes = results.filter((r) => r.status === "fulfilled").length;
    const failures = results.filter((r) => r.status === "rejected");
    expect(successes).toBe(1);
    expect(failures.length).toBe(1);
    const reason = (failures[0] as PromiseRejectedResult).reason as PersistenceError;
    expect(reason.code).toBe("conflict");
  });
});
