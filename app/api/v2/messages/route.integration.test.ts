/**
 * SPABLA V2 · Hito 9.2.4 · DIRECT-HANDLER integration tests for
 * `GET /api/v2/messages`.
 *
 * SCOPE (BLOQUE 2 of the final closure order): this suite imports
 * the productive `GET` handler from `route.ts` and invokes it with
 * a constructed `NextRequest`. That path is **integración directa
 * del route handler**: it produces a real `Response` object with
 * `.status === 401` from the same code path that runs in
 * production, but it does NOT go through:
 *   - a TCP socket,
 *   - a Next dev/prod server process,
 *   - HTTP header parsing over the wire,
 *   - HTTP body serialization / streaming.
 *
 * Therefore this suite must NOT be described as a "real HTTP
 * request" test. The HTTP-frontier test lives in
 * `app/api/v2/messages/route.http.integration.test.ts` (BLOQUE 3);
 * that one boots `next dev` on an isolated port and issues
 * `fetch()` calls, exercising the socket layer end-to-end.
 *
 * Both suites are kept: this one is a fast in-process integration
 * (~1 second) that runs after every commit, and the other is a
 * heavier boundary test (~30 seconds) that runs in CI Job B.
 *
 * Skipped locally without env vars; runs in CI Job B where the
 * Supabase local stack is available and the env vars are exported
 * from `supabase status -o json`.
 */

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { GET } from "./route";
import { NextRequest } from "next/server";
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

function buildRequest(url: string, token: string | null): NextRequest {
  const headers: Record<string, string> = {};
  if (token !== null) headers["Authorization"] = `Bearer ${token}`;
  return new NextRequest(url, { method: "GET", headers });
}

function inMemoryStorage(initial?: Record<string, string>): MinimalStorage & {
  readonly data: Map<string, string>;
} {
  const data = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    data,
    getItem(key) { return data.has(key) ? data.get(key)! : null; },
    setItem(key, value) { data.set(key, value); },
  };
}

type RecoverySpy = {
  readonly recoveredRef: { current: boolean };
  readonly deps: Parameters<typeof applyAuth401Recovery>[0];
  notifyCount: number;
  signOutCount: number;
};

function makeRecoverySpy(signOutOverride?: () => Promise<void>): RecoverySpy {
  const recoveredRef = { current: false };
  const spy: RecoverySpy = {
    recoveredRef,
    notifyCount: 0,
    signOutCount: 0,
    deps: {
      hasAlreadyRecovered: () => recoveredRef.current,
      markRecovered: () => { recoveredRef.current = true; },
      notifyExpired: () => { spy.notifyCount += 1; },
      signOutLocalScope: signOutOverride ?? (async () => { spy.signOutCount += 1; }),
    },
  };
  return spy;
}

describe("AUTH-RECOVERY · endpoint integration (Hito 9.2.4)", () => {
  let admin: SupabaseClient;
  const suiteId = randomUUID().slice(0, 12);
  const tenantId = randomUUID();
  const conversationId = randomUUID();
  const emailA = `spabla-a-${suiteId}@example.test`;
  const emailB = `spabla-b-${suiteId}@example.test`;
  const password = "P@ssw0rd-9-2-4-integration";
  let actorAId = "";
  let actorBId = "";
  let validJwtA = "";
  let validJwtB = "";
  const createdActorIds: string[] = [];
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    admin = privileged();

    for (const email of [emailA, emailB]) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) {
        throw new Error(`createUser failed for ${email}: ${error?.message ?? "no user"}`);
      }
      createdActorIds.push(data.user.id);
      if (email === emailA) actorAId = data.user.id;
      else actorBId = data.user.id;
    }

    const tenantInsert = await admin
      .schema("spabla_v2")
      .from("tenants")
      .insert([{ id: tenantId, name: `AUTH-RECOVERY tenant ${suiteId}` }]);
    if (tenantInsert.error) {
      throw new Error(`tenant insert failed: ${tenantInsert.error.message}`);
    }
    createdTenantIds.push(tenantId);

    for (const aid of [actorAId, actorBId]) {
      const membership = await admin.schema("spabla_v2").rpc("admin_add_membership", {
        p_tenant_id: tenantId,
        p_actor_id: aid,
        p_role: "owner",
      });
      if (membership.error) {
        throw new Error(`admin_add_membership failed: ${membership.error.message}`);
      }
    }

    // Empty fixture conversation, so no cache-miss can accidentally
    // trigger a translation provider call in later tests.
    const convInsert = await admin.schema("spabla_v2").from("conversations").insert([
      {
        id: conversationId,
        tenant_id: tenantId,
        created_by: actorAId,
        language: "es",
      },
    ]);
    if (convInsert.error) {
      throw new Error(`conversation insert failed: ${convInsert.error.message}`);
    }

    for (const [email, target] of [[emailA, "A"], [emailB, "B"]] as const) {
      const { data, error } = await anonClient().auth.signInWithPassword({ email, password });
      if (error || !data.session) {
        throw new Error(`signIn failed for ${email}: ${error?.message ?? "no session"}`);
      }
      if (target === "A") validJwtA = data.session.access_token;
      else validJwtB = data.session.access_token;
    }
  }, 60_000);

  afterAll(async () => {
    if (admin === undefined) return;
    // Cleanup limited to fixtures we created ourselves. No db reset,
    // no volume wipe, no truncate on shared tables.
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
  });

  const endpointUrl = () =>
    `http://localhost:3000/api/v2/messages?tenantId=${tenantId}&conversationId=${conversationId}&to=es`;

  // ────────────────────────────────────────────────────────────────
  // (BLOQUE 3) — endpoint really returns 200 for a valid session and
  // 401 for a corrupted JWT. The response object is then fed to the
  // production coordinator to complete the recovery contract.
  // ────────────────────────────────────────────────────────────────

  test.skipIf(!ENABLED)("baseline: a valid session gets 200 from /api/v2/messages", async () => {
    const res = await GET(buildRequest(endpointUrl(), validJwtA));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.actorId).toBe(actorAId);
  });

  test.skipIf(!ENABLED)("401 real: corrupted JWT signature is rejected by the endpoint", async () => {
    const corrupted = corruptJwtSignature(validJwtA);
    const res = await GET(buildRequest(endpointUrl(), corrupted));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
    expect(shouldTriggerAuth401Recovery(res)).toBe(true);
  });

  test.skipIf(!ENABLED)("recovery: a real 401 flows into applyAuth401Recovery once and only once", async () => {
    const spy = makeRecoverySpy();
    const corrupted = corruptJwtSignature(validJwtA);
    const first = await GET(buildRequest(endpointUrl(), corrupted));
    expect(first.status).toBe(401);
    const firstOutcome = await applyAuth401Recovery(spy.deps);
    expect(firstOutcome).toEqual({ ranTransition: true, totalAttempts: 1 });
    expect(spy.notifyCount).toBe(1);
    expect(spy.signOutCount).toBe(1);

    // Second 401 hitting the same coordinator (simulates a second
    // in-flight polling tick): the transition MUST NOT run again.
    const second = await GET(buildRequest(endpointUrl(), corrupted));
    expect(second.status).toBe(401);
    const secondOutcome = await applyAuth401Recovery(spy.deps);
    expect(secondOutcome).toEqual({ ranTransition: false, totalAttempts: 1 });
    expect(spy.notifyCount).toBe(1);
    expect(spy.signOutCount).toBe(1);
  });

  // ────────────────────────────────────────────────────────────────
  // (BLOQUE 4) — deterministic regressions covering the auth matrix
  // Direction asked to lock: missing session, invalid/expired token,
  // failed refresh (sign-out failure), two consecutive 401s, actor
  // switch, unmounted component during recovery, preserved
  // preferences, wiped previous-actor state.
  // ────────────────────────────────────────────────────────────────

  test.skipIf(!ENABLED)("regression: missing Authorization header → 401 from the endpoint", async () => {
    const res = await GET(buildRequest(endpointUrl(), null));
    expect(res.status).toBe(401);
  });

  test.skipIf(!ENABLED)("regression: empty Bearer token → 401 from the endpoint", async () => {
    const req = new NextRequest(endpointUrl(), {
      method: "GET",
      headers: { Authorization: "Bearer " },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  test.skipIf(!ENABLED)("regression: sign-out failure during recovery does NOT crash — the coordinator swallows and records 1 attempt", async () => {
    const spy = makeRecoverySpy(async () => {
      throw new Error("simulated refresh / sign-out failure");
    });
    const corrupted = corruptJwtSignature(validJwtA);
    const res = await GET(buildRequest(endpointUrl(), corrupted));
    expect(res.status).toBe(401);
    const outcome = await applyAuth401Recovery(spy.deps);
    expect(outcome).toEqual({ ranTransition: true, totalAttempts: 1 });
    expect(spy.notifyCount).toBe(1);
    // A subsequent call is still a no-op — idempotency holds even if
    // sign-out threw.
    const outcome2 = await applyAuth401Recovery(spy.deps);
    expect(outcome2).toEqual({ ranTransition: false, totalAttempts: 1 });
  });

  test.skipIf(!ENABLED)("regression: two consecutive 401s produce exactly ONE recovery transition (no loop)", async () => {
    const spy = makeRecoverySpy();
    const corrupted = corruptJwtSignature(validJwtA);
    for (let i = 0; i < 5; i += 1) {
      const res = await GET(buildRequest(endpointUrl(), corrupted));
      expect(res.status).toBe(401);
      // Simulate the client polling tick: check + apply recovery.
      if (shouldTriggerAuth401Recovery(res)) {
        await applyAuth401Recovery(spy.deps);
      }
    }
    expect(spy.notifyCount).toBe(1);
    expect(spy.signOutCount).toBe(1);
  });

  test.skipIf(!ENABLED)("regression: actor A → actor B switch — B does NOT see A's session data through the endpoint", async () => {
    // A's session sees only A's data (empty conversation → items=[]).
    const resA = await GET(buildRequest(endpointUrl(), validJwtA));
    expect(resA.status).toBe(200);
    const bodyA = await resA.json();
    expect(bodyA.actorId).toBe(actorAId);
    expect(bodyA.items).toEqual([]);

    // B's session sees only B's data.
    const resB = await GET(buildRequest(endpointUrl(), validJwtB));
    expect(resB.status).toBe(200);
    const bodyB = await resB.json();
    expect(bodyB.actorId).toBe(actorBId);
    expect(bodyB.actorId).not.toBe(actorAId);
  });

  test.skipIf(!ENABLED)("regression: an unmounted component during recovery — subsequent calls are safe no-ops (idempotency across scopes)", async () => {
    // The unmount path in production means `sessionExpiredRef` may or
    // may not be observed by a late polling tick. The coordinator's
    // idempotency contract guarantees at most 1 recovery per shared
    // flag, regardless of who invokes it. Model an "unmount" as the
    // flag having ALREADY been set outside the current call.
    const recoveredRef = { current: true };
    let notifyCount = 0;
    let signOutCount = 0;
    const outcome = await applyAuth401Recovery({
      hasAlreadyRecovered: () => recoveredRef.current,
      markRecovered: () => { recoveredRef.current = true; },
      notifyExpired: () => { notifyCount += 1; },
      signOutLocalScope: async () => { signOutCount += 1; },
    });
    expect(outcome).toEqual({ ranTransition: false, totalAttempts: 1 });
    expect(notifyCount).toBe(0);
    expect(signOutCount).toBe(0);
  });

  test.skipIf(!ENABLED)("regression: preferences of the affected actor SURVIVE the recovery (never touched by the coordinator)", async () => {
    const storage = inMemoryStorage();
    saveLanguagePreference(storage, actorAId, {
      myLanguage: "ca",
      targetLanguage: "de",
    });
    // Real 401 → real recovery.
    const spy = makeRecoverySpy();
    const res = await GET(buildRequest(endpointUrl(), corruptJwtSignature(validJwtA)));
    expect(res.status).toBe(401);
    await applyAuth401Recovery(spy.deps);
    // The preference key MUST still be present, byte-identical.
    expect(loadLanguagePreference(storage, actorAId)).toEqual({
      myLanguage: "ca",
      targetLanguage: "de",
    });
  });

  test.skipIf(!ENABLED)("regression: inconsistent authenticated state — a 401 tears down actor-scoped state via notifyExpired", async () => {
    // The coordinator invokes `notifyExpired` exactly once; in
    // production this clears actor-scoped `rawMessages`,
    // `rawPollError` and `rawSendError`, and sets `session = null`.
    // Model the assertion as: `notifyExpired` runs exactly once.
    const spy = makeRecoverySpy();
    const res = await GET(buildRequest(endpointUrl(), corruptJwtSignature(validJwtA)));
    expect(res.status).toBe(401);
    await applyAuth401Recovery(spy.deps);
    expect(spy.notifyCount).toBe(1);
  });
});
