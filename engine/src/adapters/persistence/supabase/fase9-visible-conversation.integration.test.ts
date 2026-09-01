/**
 * SPABLA V2 — Fase 9 · Hito 9.1 · Integration test for the visible
 * bilingual conversation loop.
 *
 * Runs against the LOCAL Supabase stack (CI Job B). Bootstraps three
 * authenticated actors: two share a tenant (A, B) and one lives in a
 * separate tenant (X, isolated). The suite proves:
 *
 *   1. Actor A saves a message in ES; Actor B lists it as raw record.
 *   2. Actor B saves a message in EN; Actor A lists both.
 *   3. Actor X (foreign tenant) cannot read the shared conversation.
 *   4. TenantContext with mismatched (actor, tenant) is rejected by RLS.
 *   5. Round-trip preserves original text and language (no mutation).
 *   6. Identical retry of `saveMessage` is idempotent (no duplicate).
 *
 * Translation itself is exercised by the Next.js API layer and by the
 * visible criterion; this test focuses on the persistence contract that
 * the Fase 9 server composition wires up.
 */

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
import type {
  ActorId,
  MessageRecord,
  TenantId,
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

function makeMessage(
  tenantId: string,
  conversationId: string,
  messageId: string,
  senderId: ActorId,
  text: string,
  createdAt: string,
  language: LangCode,
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
describe.skipIf(!ENABLED)("Fase 9 visible bilingual conversation", () => {
  let admin: SupabaseClient;
  const suiteId = randomUUID().slice(0, 12);
  const tenantShared = randomUUID();
  const tenantForeign = randomUUID();
  const emailA = `spabla-9-a-${suiteId}@example.test`;
  const emailB = `spabla-9-b-${suiteId}@example.test`;
  const emailX = `spabla-9-x-${suiteId}@example.test`;
  const password = "Fase9-!-visible-2026";

  const actorA: Actor = { id: asUUID("00000000-0000-0000-0000-000000000000"), email: emailA, password, jwt: "" };
  const actorB: Actor = { id: asUUID("00000000-0000-0000-0000-000000000000"), email: emailB, password, jwt: "" };
  const actorX: Actor = { id: asUUID("00000000-0000-0000-0000-000000000000"), email: emailX, password, jwt: "" };

  const conversationId = randomUUID();
  const createdActorIds: string[] = [];
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    admin = privileged();

    for (const actor of [actorA, actorB, actorX]) {
      const { data, error } = await admin.auth.admin.createUser({
        email: actor.email,
        password: actor.password,
        email_confirm: true,
      });
      if (error || !data.user) throw new Error(`createUser failed for ${actor.email}: ${error?.message}`);
      actor.id = asUUID(data.user.id);
      createdActorIds.push(data.user.id);
    }

    const tenants = await admin.schema("spabla_v2").from("tenants").insert([
      { id: tenantShared, name: `Fase9 Shared ${suiteId}` },
      { id: tenantForeign, name: `Fase9 Foreign ${suiteId}` },
    ]);
    if (tenants.error) throw new Error(`tenants insert failed: ${tenants.error.message}`);
    createdTenantIds.push(tenantShared, tenantForeign);

    async function addMembership(tid: string, aid: string, role: string): Promise<void> {
      const r = await admin.schema("spabla_v2").rpc("admin_add_membership", {
        p_tenant_id: tid, p_actor_id: aid, p_role: role,
      });
      if (r.error) throw new Error(`admin_add_membership failed: ${r.error.message}`);
    }
    await addMembership(tenantShared, actorA.id, "member");
    await addMembership(tenantShared, actorB.id, "member");
    await addMembership(tenantForeign, actorX.id, "member");

    for (const actor of [actorA, actorB, actorX]) {
      const { id, jwt } = await signIn(actor.email, actor.password);
      if (id !== actor.id) throw new Error("signIn returned a different user id");
      actor.jwt = jwt;
    }

    // Actor A creates the shared conversation (RLS: active member of tenantShared).
    const adapterA = new SupabasePersistence({ authenticated: authClient(actorA.jwt) });
    await adapterA.saveConversation(ctxOf(actorA, tenantShared), {
      tenantId: asUUID(tenantShared),
      conversationId: asUUID(conversationId),
      createdBy: actorA.id,
      language: ES,
      createdAt: asISOTimestamp("2026-08-11T09:00:00.000Z"),
    });
  }, 60_000);

  afterAll(async () => {
    if (admin === undefined) return;
    for (const uid of createdActorIds) {
      await admin.auth.admin.deleteUser(uid).catch(() => undefined);
    }
    if (createdTenantIds.length > 0) {
      await admin.schema("spabla_v2").from("tenants").delete().in("id", createdTenantIds)
        .then(() => undefined, () => undefined);
    }
  });

  test("A saves ES message; B reads it verbatim from spabla_v2", async () => {
    const adapterA = new SupabasePersistence({ authenticated: authClient(actorA.jwt) });
    const mid = randomUUID();
    await adapterA.saveMessage(
      ctxOf(actorA, tenantShared),
      makeMessage(tenantShared, conversationId, mid, actorA.id, "Hola, ¿cómo estás?", "2026-08-11T09:05:00.000Z", ES),
    );

    const adapterB = new SupabasePersistence({ authenticated: authClient(actorB.jwt) });
    const page = await adapterB.listMessages(ctxOf(actorB, tenantShared), {
      conversationId: asUUID(conversationId),
      limit: 50,
      cursor: null,
    });
    const record = page.items.find((m) => m.messageId === mid);
    expect(record).toBeDefined();
    expect(record?.text).toBe("Hola, ¿cómo estás?");
    expect(record?.language).toBe(ES);
    expect(record?.senderId).toBe(actorA.id);
  });

  test("B replies in EN; A reads the full ordered history", async () => {
    const adapterB = new SupabasePersistence({ authenticated: authClient(actorB.jwt) });
    const mid = randomUUID();
    await adapterB.saveMessage(
      ctxOf(actorB, tenantShared),
      makeMessage(tenantShared, conversationId, mid, actorB.id, "I am fine, thank you.", "2026-08-11T09:06:00.000Z", EN),
    );

    const adapterA = new SupabasePersistence({ authenticated: authClient(actorA.jwt) });
    const page = await adapterA.listMessages(ctxOf(actorA, tenantShared), {
      conversationId: asUUID(conversationId),
      limit: 50,
      cursor: null,
    });
    const reply = page.items.find((m) => m.messageId === mid);
    expect(reply).toBeDefined();
    expect(reply?.text).toBe("I am fine, thank you.");
    expect(reply?.language).toBe(EN);
    expect(reply?.senderId).toBe(actorB.id);
    // Ordering by (created_at, id) ASC — the ES message precedes the EN reply.
    const esIdx = page.items.findIndex((m) => m.text === "Hola, ¿cómo estás?");
    const enIdx = page.items.findIndex((m) => m.messageId === mid);
    expect(esIdx).toBeGreaterThanOrEqual(0);
    expect(enIdx).toBeGreaterThan(esIdx);
  });

  test("Foreign actor X cannot list the shared conversation (RLS returns empty)", async () => {
    const adapterX = new SupabasePersistence({ authenticated: authClient(actorX.jwt) });
    const page = await adapterX.listMessages(
      // X uses their own tenant context; even asking for the shared conversation id under a foreign tenant returns empty.
      ctxOf(actorX, tenantForeign),
      { conversationId: asUUID(conversationId), limit: 50, cursor: null },
    );
    expect(page.items).toHaveLength(0);
  });

  test("Foreign actor cannot build a TenantContext for the shared tenant and read messages", async () => {
    // TenantContext is a client-side selection; the DB is the authority. When
    // X (not a member of tenantShared) asks Postgres for messages of tenantShared,
    // RLS returns 0 rows — no membership_denied error, just empty visibility.
    const adapterX = new SupabasePersistence({ authenticated: authClient(actorX.jwt) });
    const forgedCtx = ctxOf(actorX, tenantShared);
    const page = await adapterX.listMessages(forgedCtx, {
      conversationId: asUUID(conversationId),
      limit: 50,
      cursor: null,
    });
    expect(page.items).toHaveLength(0);
  });

  test("Identity mismatch (X's JWT paired with A's actorId) is rejected", async () => {
    // Simulate a malicious server that forges a TenantContext claiming actorA's identity
    // while presenting X's JWT. `assertIdentity` inside the adapter must catch it before
    // any write.
    const adapterUnderX = new SupabasePersistence({ authenticated: authClient(actorX.jwt) });
    const forgedCtx = buildTenantContext(
      buildVerifiedIdentityFromTrustedBoundary(
        actorA.id, // Claimed actor
        asISOTimestamp(new Date().toISOString()),
        "supabase_auth_jwt",
      ),
      asUUID(tenantShared) as TenantId,
    );
    const err = await pgIsError(adapterUnderX.listMessages(forgedCtx, {
      conversationId: asUUID(conversationId),
      limit: 10,
      cursor: null,
    }));
    expect(err.code).toBe("identity_invalid");
  });

  test("Identical retry of saveMessage is silently idempotent", async () => {
    const adapterA = new SupabasePersistence({ authenticated: authClient(actorA.jwt) });
    const mid = randomUUID();
    const msg = makeMessage(tenantShared, conversationId, mid, actorA.id, "Buenos días", "2026-08-11T09:07:00.000Z", ES);
    await adapterA.saveMessage(ctxOf(actorA, tenantShared), msg);
    await expect(adapterA.saveMessage(ctxOf(actorA, tenantShared), msg)).resolves.toBeUndefined();
    const page = await adapterA.listMessages(ctxOf(actorA, tenantShared), {
      conversationId: asUUID(conversationId),
      limit: 200,
      cursor: null,
    });
    const matches = page.items.filter((m) => m.messageId === mid);
    expect(matches).toHaveLength(1);
  });
});
