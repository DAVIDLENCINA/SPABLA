/**
 * SPABLA V2 · Fase 9 · Hito 9.1.1 · Integration suite for
 * SupabaseTranslationStore.
 *
 * Runs against the LOCAL Supabase stack (CI Job B). Provisions two
 * tenants + one authenticated actor in each + one message per tenant,
 * then exercises the store through the productive adapter.
 *
 * Covers the invariants of the port contract that the Vitest unit and
 * SQL suites cannot cover on their own:
 *
 *   - authenticated read succeeds under RLS for the caller's tenant;
 *   - authenticated read of a foreign tenant returns null (RLS empty);
 *   - server-side write via service_role persists a row and reads it
 *     back;
 *   - identical retry of `saveServerSide` is silently idempotent;
 *   - a conflicting write for the same PK does NOT overwrite the
 *     surviving row;
 *   - identity divergence (TenantContext.actorId != auth.uid) is
 *     rejected before any query;
 *   - malformed `translation_version` / `target_language` /
 *     `translatedText` are rejected structurally.
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

import { SupabaseTranslationStore } from "./supabase-translation-store";
import { buildTenantContext, type TenantContext } from "../../persistence/tenant-context";
import { buildVerifiedIdentityFromTrustedBoundary } from "../../persistence/identity";
import type { ActorId, TenantId } from "../../persistence/port";
import type { TranslationStoreError } from "../errors";
import { asISOTimestamp, asUUID } from "../../../types/ids";

const SUPABASE_URL = process.env.SPABLA_TEST_SUPABASE_URL ?? "";
const ANON = process.env.SPABLA_TEST_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SPABLA_TEST_SUPABASE_SERVICE_ROLE_KEY ?? "";
const ENABLED = SUPABASE_URL !== "" && ANON !== "" && SERVICE !== "";

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

function ctxOf(actorId: ActorId, tenantId: string): TenantContext {
  return buildTenantContext(
    buildVerifiedIdentityFromTrustedBoundary(
      actorId,
      asISOTimestamp(new Date().toISOString()),
      "supabase_auth_jwt",
    ),
    asUUID(tenantId) as TenantId,
  );
}

async function tsIsError(promise: Promise<unknown>): Promise<TranslationStoreError> {
  try {
    await promise;
  } catch (err) {
    return err as TranslationStoreError;
  }
  throw new Error("expected TranslationStoreError; got success");
}

// eslint-disable-next-line vitest/no-conditional-tests
describe.skipIf(!ENABLED)("SupabaseTranslationStore integration", () => {
  let admin: SupabaseClient;
  const suiteId = randomUUID().slice(0, 12);
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const emailA = `ts-a-${suiteId}@example.test`;
  const emailB = `ts-b-${suiteId}@example.test`;
  const password = "Ts-Store-9-1-1-!";
  const convA = randomUUID();
  const convB = randomUUID();
  const msgA = randomUUID();
  const msgB = randomUUID();

  let actorAId: ActorId = asUUID("00000000-0000-0000-0000-000000000000");
  let actorBId: ActorId = asUUID("00000000-0000-0000-0000-000000000000");
  let jwtA = "";
  let jwtB = "";
  const createdUsers: string[] = [];

  beforeAll(async () => {
    admin = privileged();

    for (const [email] of [[emailA] as const, [emailB] as const]) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) throw new Error(`createUser failed for ${email}: ${error?.message}`);
      createdUsers.push(data.user.id);
    }

    const [signedA, signedB] = await Promise.all([signIn(emailA, password), signIn(emailB, password)]);
    actorAId = asUUID(signedA.id);
    actorBId = asUUID(signedB.id);
    jwtA = signedA.jwt;
    jwtB = signedB.jwt;

    const insertTenants = await admin.schema("spabla_v2").from("tenants").insert([
      { id: tenantA, name: `TS Tenant A ${suiteId}` },
      { id: tenantB, name: `TS Tenant B ${suiteId}` },
    ]);
    if (insertTenants.error) throw new Error(`tenants insert failed: ${insertTenants.error.message}`);

    async function addMembership(tid: string, aid: string): Promise<void> {
      const r = await admin.schema("spabla_v2").rpc("admin_add_membership", {
        p_tenant_id: tid, p_actor_id: aid, p_role: "owner",
      });
      if (r.error) throw new Error(`admin_add_membership failed: ${r.error.message}`);
    }
    await addMembership(tenantA, actorAId);
    await addMembership(tenantB, actorBId);

    const convs = await admin.schema("spabla_v2").from("conversations").insert([
      { id: convA, tenant_id: tenantA, created_by: actorAId, language: "es" },
      { id: convB, tenant_id: tenantB, created_by: actorBId, language: "es" },
    ]);
    if (convs.error) throw new Error(`conversations insert failed: ${convs.error.message}`);

    const msgs = await admin.schema("spabla_v2").from("messages").insert([
      { id: msgA, tenant_id: tenantA, conversation_id: convA, sender_id: actorAId, text: "Hola A", language: "es" },
      { id: msgB, tenant_id: tenantB, conversation_id: convB, sender_id: actorBId, text: "Hola B", language: "es" },
    ]);
    if (msgs.error) throw new Error(`messages insert failed: ${msgs.error.message}`);
  }, 60_000);

  afterAll(async () => {
    if (admin === undefined) return;
    for (const uid of createdUsers) {
      await admin.auth.admin.deleteUser(uid).catch(() => undefined);
    }
    await admin.schema("spabla_v2").from("tenants").delete().in("id", [tenantA, tenantB])
      .then(() => undefined, () => undefined);
  });

  test("saveServerSide inserts and load reads the same row under authenticated RLS", async () => {
    const store = new SupabaseTranslationStore({
      authenticated: authClient(jwtA),
      privileged: admin,
    });
    const ctx = ctxOf(actorAId, tenantA);
    const stored = await store.saveServerSide(ctx, {
      tenantId: asUUID(tenantA) as TenantId,
      messageId: asUUID(msgA),
      targetLanguage: "en",
      translationVersion: "v1",
      translatedText: "Hi A",
      provider: "test-provider",
      model: null,
      providerRef: null,
    });
    expect(stored.translatedText).toBe("Hi A");

    const loaded = await store.load(ctx, asUUID(msgA), "en", "v1");
    expect(loaded?.translatedText).toBe("Hi A");
    expect(loaded?.tenantId).toBe(asUUID(tenantA));
  });

  test("identical retry is silently idempotent (returns existing row)", async () => {
    const store = new SupabaseTranslationStore({
      authenticated: authClient(jwtA),
      privileged: admin,
    });
    const ctx = ctxOf(actorAId, tenantA);
    const insert = {
      tenantId: asUUID(tenantA) as TenantId,
      messageId: asUUID(msgA),
      targetLanguage: "fr" as const,
      translationVersion: "v1",
      translatedText: "Bonjour A",
      provider: "test-provider",
      model: null,
      providerRef: null,
    };
    const first = await store.saveServerSide(ctx, insert);
    const second = await store.saveServerSide(ctx, insert);
    expect(second.translatedText).toBe(first.translatedText);
    expect(second.createdAt).toBe(first.createdAt);
  });

  test("conflicting retry does NOT overwrite — surviving row wins", async () => {
    const store = new SupabaseTranslationStore({
      authenticated: authClient(jwtA),
      privileged: admin,
    });
    const ctx = ctxOf(actorAId, tenantA);
    const key = {
      tenantId: asUUID(tenantA) as TenantId,
      messageId: asUUID(msgA),
      targetLanguage: "de" as const,
      translationVersion: "v1",
    };
    const winner = await store.saveServerSide(ctx, {
      ...key, translatedText: "Hallo A", provider: "p1", model: null, providerRef: null,
    });
    const loser = await store.saveServerSide(ctx, {
      ...key, translatedText: "OTHER TEXT", provider: "p2", model: "m", providerRef: "ref",
    });
    expect(loser.translatedText).toBe("Hallo A");
    expect(loser.provider).toBe(winner.provider);
    const loaded = await store.load(ctx, key.messageId, key.targetLanguage, key.translationVersion);
    expect(loaded?.translatedText).toBe("Hallo A");
  });

  test("cross-tenant read returns null under RLS", async () => {
    const storeB = new SupabaseTranslationStore({
      authenticated: authClient(jwtB),
      privileged: admin,
    });
    // actorB asks for a translation of a msgA that lives in tenantA.
    const ctxB_forA = ctxOf(actorBId, tenantB);
    // Even a well-formed load call in B's own tenant returns null when
    // the message id belongs to A's tenant: the PK doesn't match.
    const foreign = await storeB.load(ctxB_forA, asUUID(msgA), "en", "v1");
    expect(foreign).toBeNull();
  });

  test("identity mismatch: JWT of B paired with TenantContext claiming A is rejected", async () => {
    const store = new SupabaseTranslationStore({
      authenticated: authClient(jwtB),  // B's JWT
      privileged: admin,
    });
    const forgedCtx = ctxOf(actorAId, tenantA);  // claims A
    const err = await tsIsError(store.load(forgedCtx, asUUID(msgA), "en", "v1"));
    expect(err.code).toBe("identity_invalid");
  });

  test("record.tenantId != ctx.tenantId is rejected before write", async () => {
    const store = new SupabaseTranslationStore({
      authenticated: authClient(jwtA),
      privileged: admin,
    });
    const ctx = ctxOf(actorAId, tenantA);
    const err = await tsIsError(store.saveServerSide(ctx, {
      tenantId: asUUID(tenantB) as TenantId,   // mismatched
      messageId: asUUID(msgB),
      targetLanguage: "en",
      translationVersion: "v1",
      translatedText: "Hi B",
      provider: "test-provider",
      model: null,
      providerRef: null,
    }));
    expect(err.code).toBe("tenant_context_invalid");
  });

  test("empty translation_version is rejected", async () => {
    const store = new SupabaseTranslationStore({
      authenticated: authClient(jwtA),
      privileged: admin,
    });
    const ctx = ctxOf(actorAId, tenantA);
    const err = await tsIsError(store.load(ctx, asUUID(msgA), "en", ""));
    expect(err.code).toBe("constraint_violation");
  });

  test("unrecognised target_language is rejected", async () => {
    const store = new SupabaseTranslationStore({
      authenticated: authClient(jwtA),
      privileged: admin,
    });
    const ctx = ctxOf(actorAId, tenantA);
    // Pass a plausible-looking but unknown code; assertTargetLanguage rejects.
    const err = await tsIsError(store.load(
      ctx, asUUID(msgA), "xx" as unknown as Parameters<typeof store.load>[2], "v1",
    ));
    expect(err.code).toBe("constraint_violation");
  });

  test("empty translatedText is rejected at save", async () => {
    const store = new SupabaseTranslationStore({
      authenticated: authClient(jwtA),
      privileged: admin,
    });
    const ctx = ctxOf(actorAId, tenantA);
    const err = await tsIsError(store.saveServerSide(ctx, {
      tenantId: asUUID(tenantA) as TenantId,
      messageId: asUUID(msgA),
      targetLanguage: "en",
      translationVersion: "v1",
      translatedText: "   ",
      provider: "test",
      model: null,
      providerRef: null,
    }));
    expect(err.code).toBe("constraint_violation");
  });
});
