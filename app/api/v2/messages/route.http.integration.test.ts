/**
 * SPABLA V2 · Hito 9.2.4 · HTTP-FRONTIER AUTH-RECOVERY integration
 * test for `GET /api/v2/messages`.
 *
 * SCOPE (BLOQUE 3 of the final closure order): this suite boots
 * `next dev` on an isolated port (3109), waits for the server to
 * be ready, and issues real `fetch()` calls to the endpoint. That
 * exercises the FULL boundary — TCP socket, HTTP header parsing,
 * body serialization — that the in-process direct-handler suite
 * (`route.integration.test.ts`) deliberately skips.
 *
 * Both suites are kept:
 *   - `route.integration.test.ts` — fast (~1 s), in-process,
 *     invokes `GET(request)` directly. Runs on every commit.
 *   - `route.http.integration.test.ts` (this file) — heavier
 *     (~30 s), spawns Next dev, fetches over the socket. Runs
 *     in CI Job B and locally when a Supabase local stack is up.
 *
 * The suite is aisled and non-destructive: unique tenant + actor
 * + membership + empty conversation per run; cleanup limited to
 * those fixtures; Next child process is torn down in `afterAll`
 * even if any assertion fails. Zero `supabase db reset`, zero
 * volume wipe, zero reuse of pre-existing data, zero productive
 * Supabase, zero OpenAI.
 */

import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { resolve as resolvePath } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  applyAuth401Recovery,
  shouldTriggerAuth401Recovery,
} from "@/lib/v2/client/auth-recovery-coordinator";
import {
  loadLanguagePreference,
  saveLanguagePreference,
  type MinimalStorage,
} from "@/lib/v2/client/language-preference-store";

const SUPABASE_URL = process.env.SPABLA_TEST_SUPABASE_URL ?? "";
const ANON = process.env.SPABLA_TEST_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SPABLA_TEST_SUPABASE_SERVICE_ROLE_KEY ?? "";
const ENABLED = SUPABASE_URL !== "" && ANON !== "" && SERVICE !== "";

const PORT = Number(process.env.SPABLA_TEST_NEXT_PORT ?? "3109");
const BASE_URL = `http://127.0.0.1:${PORT}`;
const REPO_ROOT = resolvePath(__dirname, "../../../..");
const READINESS_TIMEOUT_MS = 60_000;

function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function privileged(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function corruptJwtSignature(jwt: string): string {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("unexpected JWT shape");
  const sig = parts[2] ?? "";
  if (sig.length === 0) throw new Error("empty JWT signature");
  const flipped = sig[0] === "A" ? `B${sig.slice(1)}` : `A${sig.slice(1)}`;
  return `${parts[0]}.${parts[1]}.${flipped}`;
}

function inMemoryStorage(): MinimalStorage {
  const data = new Map<string, string>();
  return {
    getItem(key) { return data.has(key) ? data.get(key)! : null; },
    setItem(key, value) { data.set(key, value); },
  };
}

async function waitForServerReady(): Promise<void> {
  const start = Date.now();
  let lastError: unknown = null;
  while (Date.now() - start < READINESS_TIMEOUT_MS) {
    try {
      // Any request that reaches the route handler proves the server
      // is up. A malformed conversationId (`bad`) yields a fast 400
      // (`invalid_conversation`), which is enough to signal readiness
      // without booting the auth layer.
      const res = await fetch(`${BASE_URL}/api/v2/messages?tenantId=x&conversationId=bad&to=es`, {
        method: "GET",
      });
      if (res.status !== 0) return;
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Next dev on ${BASE_URL} did not become ready within ${READINESS_TIMEOUT_MS} ms. Last error: ${String(lastError)}`);
}

type RecoverySpy = {
  readonly deps: Parameters<typeof applyAuth401Recovery>[0];
  notifyCount: number;
  signOutCount: number;
};

function makeRecoverySpy(): RecoverySpy {
  const recoveredRef = { current: false };
  const spy: RecoverySpy = {
    notifyCount: 0,
    signOutCount: 0,
    deps: {
      hasAlreadyRecovered: () => recoveredRef.current,
      markRecovered: () => { recoveredRef.current = true; },
      notifyExpired: () => { spy.notifyCount += 1; },
      signOutLocalScope: async () => { spy.signOutCount += 1; },
    },
  };
  return spy;
}

describe("AUTH-RECOVERY · HTTP-frontier integration (Hito 9.2.4)", () => {
  let nextProcess: ChildProcessByStdio<null, Readable, Readable> | null = null;
  let admin: SupabaseClient;
  const suiteId = randomUUID().slice(0, 12);
  const tenantId = randomUUID();
  const conversationId = randomUUID();
  const email = `spabla-http-${suiteId}@example.test`;
  const password = "P@ssw0rd-9-2-4-http-integration";
  let actorId = "";
  let validJwt = "";
  const createdActorIds: string[] = [];
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    if (!ENABLED) return; // skipIf on the tests short-circuits; belt-and-braces here.

    // Fixture setup mirrors the direct-handler suite: unique per-run
    // ids so parallel runs never collide.
    admin = privileged();
    const { data: userData, error: userErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (userErr || !userData.user) {
      throw new Error(`createUser failed: ${userErr?.message ?? "no user"}`);
    }
    actorId = userData.user.id;
    createdActorIds.push(actorId);

    const tenantInsert = await admin
      .schema("spabla_v2")
      .from("tenants")
      .insert([{ id: tenantId, name: `HTTP frontier tenant ${suiteId}` }]);
    if (tenantInsert.error) {
      throw new Error(`tenant insert failed: ${tenantInsert.error.message}`);
    }
    createdTenantIds.push(tenantId);

    const membership = await admin.schema("spabla_v2").rpc("admin_add_membership", {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_role: "owner",
    });
    if (membership.error) {
      throw new Error(`admin_add_membership failed: ${membership.error.message}`);
    }

    const convInsert = await admin.schema("spabla_v2").from("conversations").insert([
      { id: conversationId, tenant_id: tenantId, created_by: actorId, language: "es" },
    ]);
    if (convInsert.error) {
      throw new Error(`conversation insert failed: ${convInsert.error.message}`);
    }

    const { data: signInData, error: signInErr } = await anonClient().auth.signInWithPassword({
      email,
      password,
    });
    if (signInErr || !signInData.session) {
      throw new Error(`signIn failed: ${signInErr?.message ?? "no session"}`);
    }
    validJwt = signInData.session.access_token;

    // Spawn Next dev on the isolated port. Inherit only the local
    // Supabase env; everything else is scoped to the child.
    const child = spawn(
      "npx",
      ["next", "dev", "-p", String(PORT), "-H", "127.0.0.1"],
      {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          NODE_ENV: "development",
          NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
          SUPABASE_SERVICE_ROLE_KEY: SERVICE,
          // Never leak fixture creds through the dev seed gate in
          // this test; even if the endpoint responds, the test does
          // NOT touch it.
          SPABLA_V2_ENABLE_DEV_SEED: "0",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    nextProcess = child;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    // Consume streams so the pipe never blocks; keep them for debug
    // if the boot fails.
    const log: string[] = [];
    child.stdout.on("data", (chunk: string) => log.push(`stdout: ${chunk}`));
    child.stderr.on("data", (chunk: string) => log.push(`stderr: ${chunk}`));
    child.on("exit", (code, signal) => {
      log.push(`exit code=${code} signal=${signal}`);
    });

    try {
      await waitForServerReady();
    } catch (readyErr) {
      // Attach the log so CI failures include actionable output.
      const tail = log.slice(-40).join("");
      throw new Error(`${String(readyErr)}\n---next log tail---\n${tail}`);
    }
  }, 120_000);

  afterAll(async () => {
    // Fixture cleanup — exclusive to this suite.
    if (admin !== undefined) {
      await admin
        .schema("spabla_v2")
        .from("conversations")
        .delete()
        .eq("id", conversationId)
        .then(() => undefined, () => undefined);
      if (createdTenantIds.length > 0) {
        await admin
          .schema("spabla_v2")
          .from("tenants")
          .delete()
          .in("id", createdTenantIds)
          .then(() => undefined, () => undefined);
      }
      for (const uid of createdActorIds) {
        await admin.auth.admin.deleteUser(uid).catch(() => undefined);
      }
    }

    // Tear down Next dev — belt-and-braces so no residual process
    // holds the port if any test throws.
    if (nextProcess !== null) {
      const proc = nextProcess;
      nextProcess = null;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          proc.kill("SIGKILL");
          resolve();
        }, 5000);
        proc.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
        proc.kill("SIGTERM");
      });
    }
  }, 30_000);

  const endpointUrl = () =>
    `${BASE_URL}/api/v2/messages?tenantId=${tenantId}&conversationId=${conversationId}&to=es`;

  test.skipIf(!ENABLED)("baseline: real HTTP fetch with a valid session → 200 + actorId", async () => {
    const res = await fetch(endpointUrl(), {
      method: "GET",
      headers: { Authorization: `Bearer ${validJwt}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.actorId).toBe(actorId);
  }, 15_000);

  test.skipIf(!ENABLED)("HTTP 401 real: corrupted JWT via socket → 401 + unauthorized", async () => {
    const corrupted = corruptJwtSignature(validJwt);
    const res = await fetch(endpointUrl(), {
      method: "GET",
      headers: { Authorization: `Bearer ${corrupted}` },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
    expect(shouldTriggerAuth401Recovery(res)).toBe(true);
  }, 15_000);

  test.skipIf(!ENABLED)("HTTP 401 real fed to coordinator → EXACTLY ONE recovery, second 401 is a no-op, preferences preserved", async () => {
    const spy = makeRecoverySpy();
    const storage = inMemoryStorage();
    saveLanguagePreference(storage, actorId, {
      myLanguage: "ca",
      targetLanguage: "de",
    });

    const corrupted = corruptJwtSignature(validJwt);
    const res1 = await fetch(endpointUrl(), {
      method: "GET",
      headers: { Authorization: `Bearer ${corrupted}` },
    });
    expect(res1.status).toBe(401);
    const outcome1 = await applyAuth401Recovery(spy.deps);
    expect(outcome1).toEqual({ ranTransition: true, totalAttempts: 1 });
    expect(spy.notifyCount).toBe(1);
    expect(spy.signOutCount).toBe(1);

    // Second 401 through the wire → coordinator idempotent.
    const res2 = await fetch(endpointUrl(), {
      method: "GET",
      headers: { Authorization: `Bearer ${corrupted}` },
    });
    expect(res2.status).toBe(401);
    const outcome2 = await applyAuth401Recovery(spy.deps);
    expect(outcome2).toEqual({ ranTransition: false, totalAttempts: 1 });
    expect(spy.notifyCount).toBe(1);
    expect(spy.signOutCount).toBe(1);

    // Preferences preserved byte-identical after the recovery.
    expect(loadLanguagePreference(storage, actorId)).toEqual({
      myLanguage: "ca",
      targetLanguage: "de",
    });
  }, 20_000);

  // Hito 9.2.5-C · HTTP-frontier assertions for /api/v2/seed under the
  // exact spawn configuration this suite already pays for (Next dev on
  // the isolated port, `SPABLA_V2_ENABLE_DEV_SEED=0`). The seed
  // endpoint must never be discoverable when the gate is off — GET,
  // HEAD and POST all return 404. Gate-ON behaviour (405 + `Allow:
  // POST`, and POST success/failure with the correlation header) is
  // exhaustively covered by `app/api/v2/seed/route.test.ts` at the
  // direct-handler layer; reproducing it here would require a second
  // `next dev` spawn in the same repository directory, which Next
  // 16.3.1 blocks (see Plan Hito 9.2.5 V1.1 §5-bis
  // TEST-RUNNER-ISOLATION).

  const seedUrl = () => `${BASE_URL}/api/v2/seed`;

  test.skipIf(!ENABLED)("HTTP · seed GET with gate OFF → 404 and JSON error body", async () => {
    const res = await fetch(seedUrl(), { method: "GET" });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "not_found" });
  }, 15_000);

  test.skipIf(!ENABLED)("HTTP · seed HEAD with gate OFF → 404 empty body", async () => {
    const res = await fetch(seedUrl(), { method: "HEAD" });
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).toBe("");
  }, 15_000);

  test.skipIf(!ENABLED)("HTTP · seed POST with gate OFF → 404 (endpoint stays invisible)", async () => {
    const res = await fetch(seedUrl(), { method: "POST" });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "not_found" });
  }, 15_000);
});
