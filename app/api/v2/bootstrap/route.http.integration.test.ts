/**
 * SPABLA V2 · Hito 9.3.1-Q3-R · HTTP-FRONTIER integration test for
 * `GET /api/v2/bootstrap`.
 *
 * Boots `next dev` on an isolated port (3110 by default) and issues
 * real `fetch()` calls to the endpoint against a live Supabase local
 * stack. Fixture isolation mirrors the messages HTTP-frontier suite:
 * unique tenant + actor + membership + empty conversation per run.
 *
 * Skipped locally when Supabase env vars are absent (as with the
 * messages suite). Runs in CI Job B where env vars are exported from
 * `supabase status -o json`.
 */

import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { resolve as resolvePath } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SPABLA_TEST_SUPABASE_URL ?? "";
const ANON = process.env.SPABLA_TEST_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SPABLA_TEST_SUPABASE_SERVICE_ROLE_KEY ?? "";
const ENABLED = SUPABASE_URL !== "" && ANON !== "" && SERVICE !== "";

const PORT = Number(process.env.SPABLA_TEST_BOOTSTRAP_PORT ?? "3110");
const BASE_URL = `http://127.0.0.1:${PORT}`;
const REPO_ROOT = resolvePath(__dirname, "../../../..");
const READINESS_TIMEOUT_MS = 60_000;

const CORRELATION_HEADER = "x-spabla-correlation-id";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function privileged(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function waitForServerReady(): Promise<void> {
  const start = Date.now();
  let lastError: unknown = null;
  while (Date.now() - start < READINESS_TIMEOUT_MS) {
    try {
      const res = await fetch(`${BASE_URL}/api/v2/bootstrap`, { method: "GET" });
      // Any status proves the server is up. Unauthenticated request
      // returns 401 quickly.
      if (res.status !== 0) return;
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Next dev on ${BASE_URL} did not become ready within ${READINESS_TIMEOUT_MS} ms. Last error: ${String(lastError)}`);
}

describe.skipIf(!ENABLED)("BOOTSTRAP · HTTP-frontier integration (Hito 9.3.1-Q3-R)", () => {
  let nextProcess: ChildProcessByStdio<null, Readable, Readable> | null = null;
  let admin: SupabaseClient;
  const suiteId = randomUUID().slice(0, 12);
  const tenantId = randomUUID();
  const conversationId = randomUUID();
  const email = `spabla-bootstrap-${suiteId}@example.test`;
  const password = "P@ssw0rd-9-3-1-Q3R-bootstrap";
  const emailOther = `spabla-other-${suiteId}@example.test`;
  const passwordOther = "P@ssw0rd-9-3-1-Q3R-bootstrap-other";
  const tenantOther = randomUUID();
  const conversationOther = randomUUID();
  let actorId = "";
  let actorIdOther = "";
  let validJwt = "";
  let validJwtOther = "";
  const createdActorIds: string[] = [];
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    if (!ENABLED) return;
    admin = privileged();

    // Actor A (con membership)
    const { data: userA, error: userAErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (userAErr || !userA.user) throw new Error(`createUser A failed: ${userAErr?.message ?? "no user"}`);
    actorId = userA.user.id;
    createdActorIds.push(actorId);

    const tenantIns = await admin.schema("spabla_v2").from("tenants").insert([{ id: tenantId, name: `Bootstrap tenant ${suiteId}` }]);
    if (tenantIns.error) throw new Error(`tenant insert failed: ${tenantIns.error.message}`);
    createdTenantIds.push(tenantId);

    const memb = await admin.schema("spabla_v2").rpc("admin_add_membership", {
      p_tenant_id: tenantId, p_actor_id: actorId, p_role: "owner",
    });
    if (memb.error) throw new Error(`admin_add_membership A failed: ${memb.error.message}`);

    const conv = await admin.schema("spabla_v2").from("conversations").insert([
      { id: conversationId, tenant_id: tenantId, created_by: actorId, language: "es" },
    ]);
    if (conv.error) throw new Error(`conversation insert failed: ${conv.error.message}`);

    // Actor B (otro tenant, aislado)
    const { data: userB, error: userBErr } = await admin.auth.admin.createUser({
      email: emailOther, password: passwordOther, email_confirm: true,
    });
    if (userBErr || !userB.user) throw new Error(`createUser B failed: ${userBErr?.message ?? "no user"}`);
    actorIdOther = userB.user.id;
    createdActorIds.push(actorIdOther);
    const tenantBIns = await admin.schema("spabla_v2").from("tenants").insert([{ id: tenantOther, name: `Bootstrap tenant OTHER ${suiteId}` }]);
    if (tenantBIns.error) throw new Error(`tenant B insert failed: ${tenantBIns.error.message}`);
    createdTenantIds.push(tenantOther);
    const membB = await admin.schema("spabla_v2").rpc("admin_add_membership", {
      p_tenant_id: tenantOther, p_actor_id: actorIdOther, p_role: "owner",
    });
    if (membB.error) throw new Error(`admin_add_membership B failed: ${membB.error.message}`);
    const convB = await admin.schema("spabla_v2").from("conversations").insert([
      { id: conversationOther, tenant_id: tenantOther, created_by: actorIdOther, language: "en" },
    ]);
    if (convB.error) throw new Error(`conversation B insert failed: ${convB.error.message}`);

    // JWTs
    const signA = await anonClient().auth.signInWithPassword({ email, password });
    if (signA.error || !signA.data.session) throw new Error(`signIn A failed: ${signA.error?.message ?? "no session"}`);
    validJwt = signA.data.session.access_token;
    const signB = await anonClient().auth.signInWithPassword({ email: emailOther, password: passwordOther });
    if (signB.error || !signB.data.session) throw new Error(`signIn B failed: ${signB.error?.message ?? "no session"}`);
    validJwtOther = signB.data.session.access_token;

    // Spawn Next dev
    const child = spawn("npx", ["next", "dev", "-p", String(PORT), "-H", "127.0.0.1"], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        NODE_ENV: "development",
        NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
        SUPABASE_SERVICE_ROLE_KEY: SERVICE,
        SPABLA_V2_ENABLE_DEV_SEED: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    nextProcess = child;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    const log: string[] = [];
    child.stdout.on("data", (chunk: string) => log.push(`stdout: ${chunk}`));
    child.stderr.on("data", (chunk: string) => log.push(`stderr: ${chunk}`));
    try {
      await waitForServerReady();
    } catch (readyErr) {
      const tail = log.slice(-40).join("");
      throw new Error(`${String(readyErr)}\n---next log tail---\n${tail}`);
    }
  }, 120_000);

  afterAll(async () => {
    if (nextProcess !== null) {
      nextProcess.kill("SIGTERM");
      await new Promise<void>((r) => {
        if (!nextProcess) return r();
        nextProcess.on("exit", () => r());
        setTimeout(() => r(), 5_000);
      });
    }
    if (!admin) return;
    // Cleanup fixtures (idempotente).
    try {
      await admin.schema("spabla_v2").from("conversations").delete().eq("id", conversationId);
      await admin.schema("spabla_v2").from("conversations").delete().eq("id", conversationOther);
      await admin.schema("spabla_v2").from("tenant_memberships").delete().eq("tenant_id", tenantId).eq("actor_id", actorId);
      await admin.schema("spabla_v2").from("tenant_memberships").delete().eq("tenant_id", tenantOther).eq("actor_id", actorIdOther);
      for (const tid of createdTenantIds) await admin.schema("spabla_v2").from("tenants").delete().eq("id", tid);
      for (const uid of createdActorIds) await admin.auth.admin.deleteUser(uid);
    } catch {
      // best-effort
    }
  }, 60_000);

  test("GET sin Authorization → 401 opaque + correlation-id header", async () => {
    const res = await fetch(`${BASE_URL}/api/v2/bootstrap`, { method: "GET" });
    expect(res.status).toBe(401);
    const cid = res.headers.get(CORRELATION_HEADER);
    expect(cid).not.toBeNull();
    expect(cid).toMatch(UUID_RE);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
    expect(body.correlationId).toBe(cid);
  });

  test("GET con Authorization firma corrupta → 401", async () => {
    const parts = validJwt.split(".");
    const flipped = `${parts[0]}.${parts[1]}.${parts[2].startsWith("A") ? "B" + parts[2].slice(1) : "A" + parts[2].slice(1)}`;
    const res = await fetch(`${BASE_URL}/api/v2/bootstrap`, {
      method: "GET",
      headers: { Authorization: `Bearer ${flipped}` },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  test("GET con JWT válido → 200 con canOperate=true y contexto propio", async () => {
    const res = await fetch(`${BASE_URL}/api/v2/bootstrap`, {
      method: "GET",
      headers: { Authorization: `Bearer ${validJwt}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.canOperate).toBe(true);
    expect(body.selectedTenantId).toBe(tenantId);
    expect(body.selectedConversationId).toBe(conversationId);
    expect(body.actor.actorId).toBe(actorId);
    expect(body.memberships.some((m: { tenantId: string }) => m.tenantId === tenantId)).toBe(true);
    // RLS: nunca ver el tenant del actor B
    expect(body.memberships.every((m: { tenantId: string }) => m.tenantId !== tenantOther)).toBe(true);
    expect(body.conversations.every((c: { conversationId: string }) => c.conversationId !== conversationOther)).toBe(true);
    // Ausencia de tokens en el body
    const raw = JSON.stringify(body);
    expect(raw.includes(validJwt)).toBe(false);
    expect(raw.includes("access_token")).toBe(false);
    expect(raw.includes("refresh_token")).toBe(false);
  });

  test("RLS efectivo: actor B nunca ve datos del actor A", async () => {
    const res = await fetch(`${BASE_URL}/api/v2/bootstrap`, {
      method: "GET",
      headers: { Authorization: `Bearer ${validJwtOther}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // B tiene su propio membership y su propia conversación
    expect(body.selectedTenantId).toBe(tenantOther);
    expect(body.selectedConversationId).toBe(conversationOther);
    // Cero fuga cross-tenant
    expect(body.memberships.every((m: { tenantId: string }) => m.tenantId !== tenantId)).toBe(true);
    expect(body.conversations.every((c: { conversationId: string }) => c.conversationId !== conversationId)).toBe(true);
  });

  test("POST /api/v2/bootstrap → 404 not_found opaco", async () => {
    const res = await fetch(`${BASE_URL}/api/v2/bootstrap`, {
      method: "POST",
      headers: { Authorization: `Bearer ${validJwt}` },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });
});
