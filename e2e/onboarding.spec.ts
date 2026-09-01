/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-A-Q3 · Browser barrier for atomic
 * personal-workspace onboarding.
 *
 * This suite drives the productive endpoint `POST /api/v2/onboarding`
 * from Chromium — real navigator, real Supabase local, real Auth
 * users, real sessions, real cookies (via Supabase SDK localStorage),
 * real PostgreSQL reads for post-conditions.
 *
 * Q3-R RECTIFICATION (2026-08-25):
 *   · All contract calls to `/api/v2/onboarding` are dispatched via
 *     `page.evaluate(() => fetch(...))` — i.e. `window.fetch` running
 *     INSIDE the Chromium renderer, whose request goes through
 *     Chromium's network stack. The prior Q3 revision used
 *     `page.request.post()`, which is Playwright's Node-side
 *     APIRequestContext (undici under the hood), NOT the browser
 *     network stack. That divergence was documented as a defect and
 *     is corrected here (`browserFetch(page, ...)`).
 *   · Anti-regression: the anti-false-positive test 12 refuses to
 *     let this spec regress to `page.request` / `context.request` /
 *     `APIRequestContext` for the onboarding endpoint.
 *   · Concurrency proof (test 3) is no longer a wall-clock upper
 *     bound. It coordinates with a control PostgreSQL connection
 *     that acquires the RPC's own `pg_advisory_xact_lock` and then
 *     observes `pg_stat_activity` until ≥2 backends are waiting on
 *     that lock. Only then does control release. Every request lands
 *     on the endpoint from Chromium; overlap is proven, not inferred.
 *
 * The suite is orchestrated by `scripts/e2e/run-onboarding-e2e.sh`
 * which brings up Supabase local + `next dev` on an isolated port
 * (3121 by default, distinct from the auth-continuity runner) and
 * exports the same env-var contract as auth-continuity so the SDK
 * hook (`window.__spablaSupabase`) is available when
 * `NEXT_PUBLIC_SPABLA_E2E_HOOK=1`.
 *
 * Governance: SPABLA V2 F9 · 9.3.2-A onboarding contract
 * (`docs/phases/SPABLA_V2_FASE_9_HITO_9_3_2_A_ONBOARDING_CONTRACT.md`),
 * §10 (HTTP contract), §14 rows 5-13, 17-24, 26-30, 39-43, 49-58,
 * §17-bis (localised label), §17-ter (lifecycle). Contract explicitly
 * mandates:
 *   · Success body = `{tenantId, role: "owner", label}`. `created`
 *     stays SERVER-SIDE — the browser MUST NOT see it and the tests
 *     verify creation via SQL COUNT deltas, not via response fields.
 *   · Verbs other than POST return `404 not_found` (not 405). The
 *     order that spawned Q3 mentioned "405" but the contract is the
 *     authoritative source (§10, §14 rows 26-30). The audit report
 *     documents this discrepancy explicitly.
 *
 * Zero mocks (no supabase, no auth, no cookies, no endpoint). Zero
 * fake JWTs. Zero test.skip, test.fixme, or retries. Every scenario
 * proves at least one post-condition against PostgreSQL directly.
 */

import { test, expect, chromium, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { Client as PgClient } from "pg";

// ─── Environment contract (set by scripts/e2e/run-onboarding-e2e.sh) ─
const BASE_URL = process.env.SPABLA_E2E_BASE_URL ?? "";
const SUPABASE_URL = process.env.SPABLA_E2E_SUPABASE_URL ?? "";
const ANON = process.env.SPABLA_E2E_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SPABLA_E2E_SUPABASE_SERVICE_ROLE_KEY ?? "";
const PG_URL =
  process.env.SPABLA_E2E_PG_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

if (BASE_URL === "" || SUPABASE_URL === "" || ANON === "" || SERVICE === "") {
  throw new Error(
    "SPABLA_E2E_* env vars missing. Run scripts/e2e/run-onboarding-e2e.sh instead of `npx playwright test`.",
  );
}

const RUN_ID = randomBytes(6).toString("hex");
const PASSWORD = "P@ssw0rd-Q3-Onboarding-" + RUN_ID;
const STORAGE_KEY = "spabla_v2_fase9_auth";
const INTERNAL_WORKSPACE_KEY = "workspace.personal.default";

// ─── Fixture bookkeeping ────────────────────────────────────────────
type UserFixture = {
  readonly id: string;
  readonly email: string;
  readonly access_token: string;
  readonly issued_at_epoch: number;
};

const createdUserIds = new Set<string>();
const createdTenantIds = new Set<string>();

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function createUser(emailTag: string): Promise<string> {
  const a = admin();
  const email = `e2e-onboarding-${emailTag}+${RUN_ID}@spabla.test`;
  const { data, error } = await a.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`createUser(${emailTag}) failed: ${error?.message ?? "no user"}`);
  }
  createdUserIds.add(data.user.id);
  return data.user.id;
}

async function signInAsUserInPage(page: Page, email: string): Promise<UserFixture> {
  // Load the productive V2 chat UI so the SDK singleton
  // (`window.__spablaSupabase`) mounts under
  // `NEXT_PUBLIC_SPABLA_E2E_HOOK=1`. The runner exports the flag.
  await page.goto("/v2/chat", { waitUntil: "domcontentloaded" });
  // Hito 9.3.2-B-Q2-R · OTP es el método principal. Cambiamos a la
  // vista password (via botón "Acceder con contraseña") si visible.
  const switchToPassword = page.getByRole("button", { name: "Acceder con contraseña" });
  try {
    await switchToPassword.waitFor({ timeout: 5_000, state: "visible" });
    await switchToPassword.click();
  } catch {
    // La vista password ya estaba activa — seguimos.
  }
  await expect(page.locator('section[aria-label="Iniciar sesión"]')).toBeVisible({
    timeout: 30_000,
  });
  await page.locator("#spabla-session-email").fill(email);
  await page.locator("#spabla-session-password").fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  // Wait until the SDK cached its session in localStorage under the
  // productive storageKey; this proves the login was real (not
  // fabricated) and the session is in the same place the productive
  // client uses.
  await page.waitForFunction(
    (k) => !!window.localStorage.getItem(k),
    STORAGE_KEY,
    { timeout: 30_000 },
  );
  const session = await page.evaluate(async () => {
    const w = window as unknown as {
      __spablaSupabase?: {
        auth: {
          getSession: () => Promise<{
            data: {
              session:
                | { access_token: string; user: { id: string; email: string | null } }
                | null;
            };
          }>;
        };
      };
    };
    if (!w.__spablaSupabase) throw new Error("__spablaSupabase hook missing");
    const s = await w.__spablaSupabase.auth.getSession();
    if (!s.data.session) throw new Error("no session after login");
    return {
      access_token: s.data.session.access_token,
      user_id: s.data.session.user.id,
      user_email: s.data.session.user.email,
    };
  });
  const [, payloadB64] = session.access_token.split(".");
  const payload = JSON.parse(
    Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
  ) as { iat: number; sub: string };
  return {
    id: session.user_id,
    email: session.user_email ?? email,
    access_token: session.access_token,
    issued_at_epoch: payload.iat,
  };
}

/**
 * Dispatches a request to the onboarding endpoint from INSIDE the
 * Chromium renderer via `window.fetch`. Returns status, text,
 * parsed JSON and correlation id. Optional body may be an object
 * (JSON.stringified) or a raw string; optional Accept-Language
 * header is passed through.
 *
 * This helper is the sole authorised transport for contract calls
 * to `/api/v2/onboarding` in this spec. Any regression to
 * `page.request` / `context.request` / `APIRequestContext` is
 * caught by the anti-false-positive test 12.
 */
async function browserFetchOnboarding(
  page: Page,
  token: string,
  opts: {
    readonly body?: unknown;
    readonly acceptLanguage?: string;
    readonly method?: "POST" | "GET" | "PUT" | "PATCH" | "DELETE";
  } = {},
): Promise<{ status: number; json: unknown; correlationId: string | null; text: string }> {
  const method = opts.method ?? "POST";
  const bodyRaw =
    opts.body === undefined
      ? null
      : typeof opts.body === "string"
        ? opts.body
        : JSON.stringify(opts.body);
  const result = await page.evaluate(
    async ({ baseUrl, token, method, bodyRaw, acceptLanguage }) => {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (acceptLanguage) headers["Accept-Language"] = acceptLanguage;
      if (bodyRaw !== null) headers["Content-Type"] = "application/json";
      const init: RequestInit = { method, headers };
      if (method !== "GET" && method !== "DELETE" && bodyRaw !== null) {
        init.body = bodyRaw;
      }
      const res = await fetch(`${baseUrl}/api/v2/onboarding`, init);
      const text = await res.text();
      return {
        status: res.status,
        text,
        correlationId: res.headers.get("x-spabla-correlation-id"),
      };
    },
    { baseUrl: BASE_URL, token, method, bodyRaw, acceptLanguage: opts.acceptLanguage ?? null },
  );
  let json: unknown = null;
  try {
    json = JSON.parse(result.text);
  } catch {
    json = null;
  }
  return {
    status: result.status,
    text: result.text,
    correlationId: result.correlationId ?? null,
    json,
  };
}

// ─── PostgreSQL post-condition helpers ───────────────────────────────
async function withPg<T>(fn: (c: PgClient) => Promise<T>): Promise<T> {
  const c = new PgClient({ connectionString: PG_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

type WorkspaceRow = {
  mappingCount: number;
  tenantCount: number;
  activeMembershipCount: number;
  inactiveMembershipCount: number;
  tenantId: string | null;
  tenantName: string | null;
};

async function readWorkspaceState(actorId: string): Promise<WorkspaceRow> {
  return withPg(async (c) => {
    const q = await c.query(
      `
        SELECT
          (SELECT count(*)::int FROM spabla_v2.actor_personal_workspace WHERE actor_id = $1) AS mapping_count,
          (SELECT tenant_id FROM spabla_v2.actor_personal_workspace WHERE actor_id = $1) AS tenant_id
      `,
      [actorId],
    );
    const mappingCount = q.rows[0]?.mapping_count ?? 0;
    const tenantId = q.rows[0]?.tenant_id ?? null;
    let tenantCount = 0;
    let tenantName: string | null = null;
    let activeMembershipCount = 0;
    let inactiveMembershipCount = 0;
    if (tenantId) {
      const t = await c.query(`SELECT id, name FROM spabla_v2.tenants WHERE id = $1`, [tenantId]);
      tenantCount = t.rowCount ?? 0;
      tenantName = t.rows[0]?.name ?? null;
      const m = await c.query(
        `
          SELECT
            count(*) FILTER (WHERE is_active = TRUE)::int AS active,
            count(*) FILTER (WHERE is_active = FALSE)::int AS inactive
          FROM spabla_v2.tenant_memberships
          WHERE actor_id = $1 AND tenant_id = $2
        `,
        [actorId, tenantId],
      );
      activeMembershipCount = m.rows[0]?.active ?? 0;
      inactiveMembershipCount = m.rows[0]?.inactive ?? 0;
    }
    return {
      mappingCount,
      tenantCount,
      activeMembershipCount,
      inactiveMembershipCount,
      tenantId,
      tenantName,
    };
  });
}

async function trackTenantIfPresent(actorId: string): Promise<void> {
  const s = await readWorkspaceState(actorId);
  if (s.tenantId) createdTenantIds.add(s.tenantId);
}

async function setLifecycleFlag(
  actorId: string,
  flags: { deletionPending?: boolean; legalHold?: boolean },
): Promise<void> {
  await withPg(async (c) => {
    await c.query(
      `
        INSERT INTO spabla_v2.actor_lifecycle_state (actor_id, deletion_pending, legal_hold)
        VALUES ($1, COALESCE($2, FALSE), COALESCE($3, FALSE))
        ON CONFLICT (actor_id) DO UPDATE
        SET deletion_pending = COALESCE($2, spabla_v2.actor_lifecycle_state.deletion_pending),
            legal_hold       = COALESCE($3, spabla_v2.actor_lifecycle_state.legal_hold)
      `,
      [actorId, flags.deletionPending ?? null, flags.legalHold ?? null],
    );
  });
}

async function clearLifecycleFlags(actorId: string): Promise<void> {
  await withPg(async (c) => {
    await c.query(`DELETE FROM spabla_v2.actor_lifecycle_state WHERE actor_id = $1`, [actorId]);
  });
}

async function deactivateMembership(actorId: string, tenantId: string): Promise<void> {
  await withPg(async (c) => {
    await c.query(
      `UPDATE spabla_v2.tenant_memberships SET is_active = FALSE WHERE actor_id = $1 AND tenant_id = $2`,
      [actorId, tenantId],
    );
  });
}

// ─── Global cleanup ─────────────────────────────────────────────────
test.afterAll(async () => {
  await withPg(async (c) => {
    if (createdUserIds.size > 0) {
      const ids = Array.from(createdUserIds);
      await c.query(
        `DELETE FROM spabla_v2.actor_lifecycle_state WHERE actor_id = ANY($1::uuid[])`,
        [ids],
      );
      await c.query(
        `DELETE FROM spabla_v2.tenant_memberships WHERE actor_id = ANY($1::uuid[])`,
        [ids],
      );
      await c.query(
        `DELETE FROM spabla_v2.actor_personal_workspace WHERE actor_id = ANY($1::uuid[])`,
        [ids],
      );
    }
    if (createdTenantIds.size > 0) {
      const ids = Array.from(createdTenantIds);
      await c.query(`DELETE FROM spabla_v2.tenant_memberships WHERE tenant_id = ANY($1::uuid[])`, [ids]);
      await c.query(`DELETE FROM spabla_v2.tenants WHERE id = ANY($1::uuid[])`, [ids]);
    }
  });
  const a = admin();
  for (const uid of Array.from(createdUserIds)) {
    await a.auth.admin.deleteUser(uid).catch(() => undefined);
  }
});

test.describe.serial("[Q3-onboarding-e2e] atomic personal workspace, browser barrier", () => {
  // ─────────────────────────────────────────────────────────────────
  // 1 · New user
  //   Contract §14 row 5: `200 OK {tenantId, role:'owner'}` — creates
  //   exactly one mapping / tenant (name=workspace.personal.default) /
  //   active membership. `created` server-side is TRUE (verified via
  //   COUNT deltas, NOT via response body).
  // ─────────────────────────────────────────────────────────────────
  test("1 · new user → 200 creates exactly one mapping/tenant/membership", async () => {
    const userId = await createUser("s1");
    const before = await readWorkspaceState(userId);
    expect(before.mappingCount).toBe(0);

    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      const fx = await signInAsUserInPage(page, `e2e-onboarding-s1+${RUN_ID}@spabla.test`);
      const res = await browserFetchOnboarding(page, fx.access_token);
      expect(res.status).toBe(200);
      const body = res.json as { tenantId: string; role: string; label: string };
      expect(body.role).toBe("owner");
      expect(typeof body.tenantId).toBe("string");
      expect(body.tenantId).toMatch(/^[0-9a-f-]{36}$/);
      expect(typeof body.label).toBe("string");
      expect(body.label.length).toBeGreaterThan(0);
      // Anti-leak: response body MUST NOT expose `created`, internal
      // key, actorId, or SQL identifiers.
      expect(res.text).not.toMatch(/"created"/);
      expect(res.text).not.toMatch(/workspace\.personal\.default/);
      expect(res.text).not.toMatch(/actor_id/);
      expect(res.text).not.toMatch(/actor_personal_workspace/);
      expect(res.correlationId).toMatch(/^[0-9a-f-]{36}$/);
      await trackTenantIfPresent(userId);

      const after = await readWorkspaceState(userId);
      expect(after.mappingCount).toBe(1);
      expect(after.tenantId).toBe(body.tenantId);
      expect(after.tenantCount).toBe(1);
      expect(after.tenantName).toBe(INTERNAL_WORKSPACE_KEY);
      expect(after.activeMembershipCount).toBe(1);
      expect(after.inactiveMembershipCount).toBe(0);
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // 2 · Idempotence
  //   §14 row 6: second POST returns same tenantId, zero new rows.
  // ─────────────────────────────────────────────────────────────────
  test("2 · idempotent second call returns same tenant, zero duplicates", async () => {
    const userId = await createUser("s2");
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      const fx = await signInAsUserInPage(page, `e2e-onboarding-s2+${RUN_ID}@spabla.test`);
      const r1 = await browserFetchOnboarding(page, fx.access_token);
      expect(r1.status).toBe(200);
      const tenantId1 = (r1.json as { tenantId: string }).tenantId;
      await trackTenantIfPresent(userId);
      const stateAfter1 = await readWorkspaceState(userId);
      expect(stateAfter1.mappingCount).toBe(1);

      const r2 = await browserFetchOnboarding(page, fx.access_token);
      expect(r2.status).toBe(200);
      const body2 = r2.json as { tenantId: string; role: string; label: string };
      expect(body2.tenantId).toBe(tenantId1);
      expect(body2.role).toBe("owner");

      const stateAfter2 = await readWorkspaceState(userId);
      expect(stateAfter2.mappingCount).toBe(1);
      expect(stateAfter2.tenantCount).toBe(1);
      expect(stateAfter2.activeMembershipCount).toBe(1);
      expect(stateAfter2.tenantId).toBe(tenantId1);
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // 3 · Concurrency of the same actor — DETERMINISTIC proof (Q3-R)
  //
  //   §14 rows 12-13. The prior wall-clock threshold has been
  //   removed. Overlap is now PROVEN via a control PostgreSQL
  //   connection that holds the same advisory lock the RPC will try
  //   to acquire:
  //
  //     pg_advisory_xact_lock(hashtextextended($actor::text, 9321))
  //
  //   Sequence:
  //     (a) control BEGIN + acquire the advisory lock for the actor.
  //     (b) dispatch N `window.fetch` requests from Chromium.
  //     (c) poll `pg_stat_activity` until we see ≥2 backends whose
  //         wait_event = 'advisory' (i.e. RPC calls stuck behind the
  //         control lock). Snapshot their PIDs, wait events, and
  //         `pg_blocking_pids`.
  //     (d) COMMIT control (releases the lock).
  //     (e) await all fetches. All must be 200 with the same tenantId.
  //     (f) DB post-condition: COUNT=1 for mapping / tenant / active.
  //
  //   This proves the requests OVERLAP (they were all in-flight
  //   simultaneously at step (c)) and does not depend on any
  //   wall-clock heuristic. It also proves the endpoint went all the
  //   way through the RPC path from Chromium.
  // ─────────────────────────────────────────────────────────────────
  test("3 · N concurrent same-actor fetches from Chromium proven to overlap via PostgreSQL advisory lock", async () => {
    const userId = await createUser("s3");
    const N = 8;
    const control = new PgClient({ connectionString: PG_URL });
    await control.connect();
    let controlOpen = true;
    let dispatchPromise: Promise<{ status: number; text: string }[]> | null = null;
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      const fx = await signInAsUserInPage(page, `e2e-onboarding-s3+${RUN_ID}@spabla.test`);

      // (a) Acquire the same advisory lock the RPC will contend on.
      await control.query("BEGIN");
      // Capture the control backend PID so we can filter it out of
      // pg_stat_activity scans.
      const ctrlPidRes = await control.query("SELECT pg_backend_pid()::int AS pid");
      const controlPid: number = ctrlPidRes.rows[0].pid;
      await control.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 9321))",
        [userId],
      );

      // (b) Dispatch N requests from Chromium. Do NOT await here —
      // we need to observe them piling up on the lock first.
      dispatchPromise = page.evaluate(
        async ({ baseUrl, token, n }) => {
          const jobs = Array.from({ length: n }, () =>
            fetch(`${baseUrl}/api/v2/onboarding`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
              body: "",
            }).then(async (r) => ({
              status: r.status,
              text: await r.text(),
            })),
          );
          return Promise.all(jobs);
        },
        { baseUrl: BASE_URL, token: fx.access_token, n: N },
      );

      // (c) Poll pg_stat_activity until ≥2 backends are waiting on
      // the advisory lock. Poll uses a SEPARATE connection so a
      // blocked or in-transaction control does not shadow its own
      // view. Cap the poll to 6 s so a genuine failure does not
      // hang; PostgREST's statement_timeout on service_role is
      // effectively unlimited on this schema, so waiters would
      // remain until we COMMIT the control transaction.
      const poll = new PgClient({ connectionString: PG_URL });
      await poll.connect();
      const pollDeadline = Date.now() + 6_000;
      let waiters: Array<{ pid: number; wait_event_type: string; wait_event: string; blockers: number[] }> = [];
      let lastSnapshot: unknown[] = [];
      try {
        while (Date.now() < pollDeadline) {
          const rows = await poll.query(
            `
              SELECT pid, state, wait_event_type, wait_event, query,
                     pg_blocking_pids(pid) AS blockers
                FROM pg_catalog.pg_stat_activity
               WHERE pid <> pg_backend_pid()
                 AND state IS NOT NULL
                 AND state <> 'idle'
            `,
          );
          lastSnapshot = rows.rows;
          waiters = rows.rows
            .filter(
              (r: { wait_event: string | null }) =>
                r.wait_event === "advisory",
            )
            .map((r: { pid: number; wait_event_type: string; wait_event: string; blockers: number[] }) => ({
              pid: r.pid,
              wait_event_type: r.wait_event_type,
              wait_event: r.wait_event,
              blockers: r.blockers ?? [],
            }));
          if (waiters.length >= 2) break;
          await new Promise((r) => setTimeout(r, 100));
        }
      } finally {
        await poll.end().catch(() => undefined);
      }
      if (waiters.length < 2) {
        // eslint-disable-next-line no-console
        console.log(
          `[Q3-R concurrency DIAG] no waiters found; last activity snapshot=${JSON.stringify(
            lastSnapshot,
            null,
            2,
          )}`,
        );
        // Peek dispatch outcomes to see if requests failed early
        // (e.g. 401 before reaching the RPC).
        const peek = await Promise.race([
          dispatchPromise!.then((v) => ({ done: true, v })),
          new Promise<{ done: false }>((r) => setTimeout(() => r({ done: false }), 200)),
        ]);
        // eslint-disable-next-line no-console
        console.log(`[Q3-R concurrency DIAG] dispatch peek=${JSON.stringify(peek)}`);
      }

      // Log observed waiters for the audit trail (Playwright captures
      // stdout of the test worker in the CI job log).
      // eslint-disable-next-line no-console
      console.log(
        `[Q3-R concurrency] control_pid=${controlPid} waiters=${JSON.stringify(waiters)}`,
      );

      // Assertion A: at least two RPC backends were simultaneously
      // waiting on the advisory lock. This is the deterministic
      // proof of overlap.
      expect(waiters.length).toBeGreaterThanOrEqual(2);

      // Assertion B: every waiter is blocked by the control PID.
      for (const w of waiters) {
        expect(w.wait_event).toBe("advisory");
        expect(w.blockers).toContain(controlPid);
      }

      // Assertion C: no dispatched request has resolved yet. If any
      // did before we released the lock, they would not have executed
      // the RPC — a hidden failure mode we must reject.
      let anyResolved = false;
      const raceCheck = Promise.race([
        dispatchPromise.then(() => "resolved" as const),
        new Promise<"pending">((r) => setTimeout(() => r("pending"), 50)),
      ]);
      const raceResult = await raceCheck;
      if (raceResult === "resolved") anyResolved = true;
      expect(anyResolved).toBe(false);

      // (d) Release the control lock.
      await control.query("COMMIT");
      controlOpen = false;

      // (e) Now await all responses.
      const outcomes = await dispatchPromise;
      dispatchPromise = null;
      for (const r of outcomes) {
        expect(r.status).toBe(200);
      }
      const tenantIds = outcomes.map(
        (r) => (JSON.parse(r.text) as { tenantId: string }).tenantId,
      );
      const uniqueTenants = Array.from(new Set(tenantIds));
      expect(uniqueTenants.length).toBe(1);
      await trackTenantIfPresent(userId);

      // (f) Post-condition on DB.
      const state = await readWorkspaceState(userId);
      expect(state.mappingCount).toBe(1);
      expect(state.tenantCount).toBe(1);
      expect(state.activeMembershipCount).toBe(1);
      expect(state.inactiveMembershipCount).toBe(0);
    } finally {
      // Safety net: if we bailed out before COMMIT, release the lock
      // so subsequent tests are not blocked.
      if (controlOpen) {
        try {
          await control.query("ROLLBACK");
        } catch {
          /* connection already closed */
        }
      }
      if (dispatchPromise) {
        // Await pending fetches to prevent unhandled rejections.
        await dispatchPromise.catch(() => undefined);
      }
      await control.end().catch(() => undefined);
      await ctx.close();
      await browser.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // 4 · Server authority
  //   §14 rows 17-24, 52: client-supplied tenantId/role/actorId/name/
  //   label/created are ignored. Response tenantId is the actor's own
  //   personal tenant; `role` is `owner`; `label` is drawn from the
  //   server-owned catalog. `tenants.name` persists the internal key.
  // ─────────────────────────────────────────────────────────────────
  test("4 · client-supplied fields have zero authority", async () => {
    const userId = await createUser("s4");
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      const fx = await signInAsUserInPage(page, `e2e-onboarding-s4+${RUN_ID}@spabla.test`);
      const injected = {
        tenantId: "00000000-0000-0000-0000-000000000000",
        actorId: "11111111-1111-1111-1111-111111111111",
        role: "admin",
        created: true,
        name: "pwn-name",
        label: "<script>alert(1)</script>",
        workspaceName: "pwn-workspace",
        internal_key: "workspace.personal.attacker",
      };
      const res = await browserFetchOnboarding(page, fx.access_token, { body: injected });
      expect(res.status).toBe(200);
      const body = res.json as { tenantId: string; role: string; label: string };
      expect(body.role).toBe("owner");
      expect(body.tenantId).not.toBe(injected.tenantId);
      expect(body.label).not.toBe(injected.label);
      // Server-owned label catalog: for the default locale (en) the
      // label MUST be "My space". The important assertion is that the
      // client's `label` field never surfaces.
      expect(res.text).not.toContain("<script>");
      expect(res.text).not.toContain("pwn");
      expect(res.text).not.toContain(injected.actorId);
      expect(res.text).not.toContain(injected.tenantId);
      await trackTenantIfPresent(userId);

      const state = await readWorkspaceState(userId);
      expect(state.mappingCount).toBe(1);
      expect(state.tenantId).toBe(body.tenantId);
      // The internal key ALWAYS persists in `tenants.name`, never the
      // client-supplied text.
      expect(state.tenantName).toBe(INTERNAL_WORKSPACE_KEY);
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // 5 · Auth absent / invalid
  //   §14 rows 1-3: missing header, malformed Bearer, corrupt JWT.
  // ─────────────────────────────────────────────────────────────────
  test("5 · missing/invalid Authorization → 401 opaque, zero side-effects", async () => {
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      // All four probes dispatch from Chromium's `window.fetch`. We
      // load an HTML page first so `page.evaluate` has a document to
      // run in (the Supabase SDK singleton is not needed here).
      await page.goto("/v2/chat", { waitUntil: "domcontentloaded" });
      // (a) No Authorization header at all.
      const r1 = await page.evaluate(async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/v2/onboarding`, {
          method: "POST",
          body: "",
        });
        return res.status;
      }, BASE_URL);
      expect(r1).toBe(401);
      // (b) Malformed Bearer.
      const r2 = await page.evaluate(async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/v2/onboarding`, {
          method: "POST",
          headers: { Authorization: "Bearer bogus" },
          body: "",
        });
        return res.status;
      }, BASE_URL);
      expect(r2).toBe(401);
      // (c) Corrupt JWT structure (three dots, garbage payload).
      const r3 = await page.evaluate(async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/v2/onboarding`, {
          method: "POST",
          headers: { Authorization: "Bearer aaa.bbb.ccc" },
          body: "",
        });
        return res.status;
      }, BASE_URL);
      expect(r3).toBe(401);
      // (d) Alien signature (valid structure, wrong key).
      const alien =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
        "eyJzdWIiOiJhbGllbi1zdWIiLCJpYXQiOjE1MTYyMzkwMjJ9." +
        "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
      const r4 = await page.evaluate(
        async ({ baseUrl, token }) => {
          const res = await fetch(`${baseUrl}/api/v2/onboarding`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: "",
          });
          return res.status;
        },
        { baseUrl: BASE_URL, token: alien },
      );
      expect(r4).toBe(401);

      // Prove zero side-effect in DB: any actor id that might have
      // been fabricated from the alien JWT (`alien-sub`) MUST have
      // zero rows in the mapping table.
      const state = await withPg((c) =>
        c
          .query(
            `SELECT count(*)::int AS c FROM spabla_v2.actor_personal_workspace
              WHERE actor_id::text ILIKE 'alien%'`,
          )
          .then((r) => (r.rows[0]?.c ?? 0) as number),
      );
      expect(state).toBe(0);
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // 6 · Actor Auth deleted while JWT still non-expired
  //   §14 row 54, Q2-R2 + Q2-R3 protection. The JWT captured in step
  //   1 is REUSED byte-for-byte after `admin.deleteUser`. Anti-false-
  //   positive: (a) verify `iat` predates deletion; (b) verify browser
  //   localStorage still holds the pre-delete session; (c) verify
  //   server does NOT create any workspace for the deleted actor.
  // ─────────────────────────────────────────────────────────────────
  test("6 · deleted actor with original non-expired JWT → 401, zero writes", async () => {
    const userId = await createUser("s6");
    const email = `e2e-onboarding-s6+${RUN_ID}@spabla.test`;
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      const fx = await signInAsUserInPage(page, email);
      expect(fx.id).toBe(userId);
      const deletionEpoch = Math.floor(Date.now() / 1000);

      const a = admin();
      const del = await a.auth.admin.deleteUser(userId);
      expect(del.error).toBeNull();
      createdUserIds.delete(userId); // already deleted

      // Anti-false-positive #1: the JWT we are about to use was
      // issued at or before the deletion instant. The stricter
      // guarantee against silent refresh comes from #2 (byte-level
      // localStorage comparison); Supabase's `iat` is second-
      // granular, so equality at the same second is legitimate.
      expect(fx.issued_at_epoch).toBeLessThanOrEqual(deletionEpoch);
      // Anti-false-positive #2: localStorage still holds the
      // pre-delete session verbatim (proof we didn't sign the user
      // out artificially and Playwright did not silently refresh
      // the access_token — any refresh would rotate the token).
      const storedRaw = await page.evaluate(
        (k) => window.localStorage.getItem(k),
        STORAGE_KEY,
      );
      expect(storedRaw).not.toBeNull();
      const stored = JSON.parse(storedRaw as string) as { access_token: string };
      expect(stored.access_token).toBe(fx.access_token);

      const res = await browserFetchOnboarding(page, fx.access_token);
      expect(res.status).toBe(401);
      const body = res.json as { error: string; correlationId: string };
      expect(body.error).toBe("unauthorized");
      expect(body.correlationId).toMatch(/^[0-9a-f-]{36}$/);

      // Zero side-effect in DB.
      const state = await readWorkspaceState(userId);
      expect(state.mappingCount).toBe(0);
      expect(state.tenantCount).toBe(0);
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // 7 · Membership deactivated → reactivated
  //   §14 row 9, §17-ter B: existing mapping + inactive membership
  //   gets `is_active = TRUE` and returns the same tenantId.
  // ─────────────────────────────────────────────────────────────────
  test("7 · inactive membership is reactivated by second onboarding", async () => {
    const userId = await createUser("s7");
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      const fx = await signInAsUserInPage(page, `e2e-onboarding-s7+${RUN_ID}@spabla.test`);
      const r1 = await browserFetchOnboarding(page, fx.access_token);
      expect(r1.status).toBe(200);
      const tenantId = (r1.json as { tenantId: string }).tenantId;
      await trackTenantIfPresent(userId);

      // Deactivate the membership via SQL admin (fixture path).
      await deactivateMembership(userId, tenantId);
      const inactiveState = await readWorkspaceState(userId);
      expect(inactiveState.activeMembershipCount).toBe(0);
      expect(inactiveState.inactiveMembershipCount).toBe(1);

      // Second onboarding reactivates.
      const r2 = await browserFetchOnboarding(page, fx.access_token);
      expect(r2.status).toBe(200);
      expect((r2.json as { tenantId: string }).tenantId).toBe(tenantId);
      const reactivated = await readWorkspaceState(userId);
      expect(reactivated.activeMembershipCount).toBe(1);
      expect(reactivated.inactiveMembershipCount).toBe(0);
      expect(reactivated.mappingCount).toBe(1);
      expect(reactivated.tenantCount).toBe(1);
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // 8 · Lifecycle: deletion_pending / legal_hold
  //   §14 rows 53 + 56, §17-ter H: both flags return 503 opaque
  //   without invoking the RPC. Zero side-effects in either case.
  // ─────────────────────────────────────────────────────────────────
  test("8a · deletion_pending → 503 opaque, zero side-effects", async () => {
    const userId = await createUser("s8a");
    await setLifecycleFlag(userId, { deletionPending: true });
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      const fx = await signInAsUserInPage(page, `e2e-onboarding-s8a+${RUN_ID}@spabla.test`);
      const res = await browserFetchOnboarding(page, fx.access_token);
      expect(res.status).toBe(503);
      const body = res.json as { error: string };
      expect(body.error).toBe("unavailable");
      const state = await readWorkspaceState(userId);
      expect(state.mappingCount).toBe(0);
      expect(state.tenantCount).toBe(0);
    } finally {
      await ctx.close();
      await browser.close();
      await clearLifecycleFlags(userId);
    }
  });

  test("8b · legal_hold → 503 opaque, zero side-effects", async () => {
    const userId = await createUser("s8b");
    await setLifecycleFlag(userId, { legalHold: true });
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      const fx = await signInAsUserInPage(page, `e2e-onboarding-s8b+${RUN_ID}@spabla.test`);
      const res = await browserFetchOnboarding(page, fx.access_token);
      expect(res.status).toBe(503);
      const body = res.json as { error: string };
      expect(body.error).toBe("unavailable");
      const state = await readWorkspaceState(userId);
      expect(state.mappingCount).toBe(0);
      expect(state.tenantCount).toBe(0);
    } finally {
      await ctx.close();
      await browser.close();
      await clearLifecycleFlags(userId);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // 9 · Localization & presentation
  //   §14 rows 49-52, §17-bis 5-7: the label is drawn from the
  //   server-owned catalog. `Accept-Language` is normalised (`ja-JP`
  //   → `ja`); unknown locales fall back to `en`; injection-shaped
  //   values are rejected. Client cannot impose the label via body.
  //   `tenants.name` is invariant.
  // ─────────────────────────────────────────────────────────────────
  test("9 · locale-aware label from server catalog; client cannot impose", async () => {
    const userId = await createUser("s9");
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      const fx = await signInAsUserInPage(page, `e2e-onboarding-s9+${RUN_ID}@spabla.test`);

      // Default (no Accept-Language) → en → "My space"
      const rDefault = await browserFetchOnboarding(page, fx.access_token);
      expect(rDefault.status).toBe(200);
      expect((rDefault.json as { label: string }).label).toBe("My space");
      await trackTenantIfPresent(userId);

      // `es` → "Mi espacio"
      const rEs = await browserFetchOnboarding(page, fx.access_token, { acceptLanguage: "es" });
      expect((rEs.json as { label: string }).label).toBe("Mi espacio");

      // `ja-JP` normalises to `ja` → "マイスペース"
      const rJa = await browserFetchOnboarding(page, fx.access_token, { acceptLanguage: "ja-JP" });
      expect((rJa.json as { label: string }).label).toBe("マイスペース");

      // Unknown locale → default "My space"
      const rXx = await browserFetchOnboarding(page, fx.access_token, { acceptLanguage: "xx-YY" });
      expect((rXx.json as { label: string }).label).toBe("My space");

      // Injection-shaped locale → default "My space"; MUST NOT surface header text
      const rInj = await browserFetchOnboarding(page, fx.access_token, {
        acceptLanguage: "'); DROP TABLE tenants; --",
      });
      expect((rInj.json as { label: string }).label).toBe("My space");
      expect(rInj.text).not.toContain("DROP TABLE");

      // Client body attempting to impose the label
      const rBody = await browserFetchOnboarding(page, fx.access_token, {
        body: { label: "hijacked", locale: "en" },
        acceptLanguage: "fr",
      });
      expect((rBody.json as { label: string }).label).toBe("Mon espace"); // from header, not body
      expect(rBody.text).not.toContain("hijacked");

      // tenants.name invariant across all calls above
      const state = await readWorkspaceState(userId);
      expect(state.tenantName).toBe(INTERNAL_WORKSPACE_KEY);
      expect(state.mappingCount).toBe(1);
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // 10 · HTTP methods
  //   §14 rows 26-30, §10: verbs other than POST return 404
  //   `not_found` opaque. NOTE: the Q3 order text used "405"; the
  //   contract mandates 404 (this suite honours the contract, per
  //   the audit report).
  // ─────────────────────────────────────────────────────────────────
  test("10 · GET/PUT/PATCH/DELETE → 404 not_found; zero side-effects", async () => {
    const userId = await createUser("s10");
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      const fx = await signInAsUserInPage(page, `e2e-onboarding-s10+${RUN_ID}@spabla.test`);
      for (const method of ["GET", "PUT", "PATCH", "DELETE"] as const) {
        const res = await browserFetchOnboarding(page, fx.access_token, { method });
        expect(res.status).toBe(404);
        const body = res.json as { error: string; correlationId: string };
        expect(body.error).toBe("not_found");
        expect(body.correlationId).toMatch(/^[0-9a-f-]{36}$/);
      }
      // Zero side-effect on the actor
      const state = await readWorkspaceState(userId);
      expect(state.mappingCount).toBe(0);
      expect(state.tenantCount).toBe(0);
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // 11 · Isolation between two actors
  //   §14 row 57: two real users, two real sessions, distinct
  //   tenants, distinct mappings. Neither can reach the other's
  //   personal tenant via the endpoint.
  // ─────────────────────────────────────────────────────────────────
  test("11 · two actors → two distinct personal tenants, no cross-access", async () => {
    const userAId = await createUser("s11a");
    const userBId = await createUser("s11b");
    const browser = await chromium.launch();
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    try {
      const fxA = await signInAsUserInPage(pageA, `e2e-onboarding-s11a+${RUN_ID}@spabla.test`);
      const fxB = await signInAsUserInPage(pageB, `e2e-onboarding-s11b+${RUN_ID}@spabla.test`);
      const rA = await browserFetchOnboarding(pageA, fxA.access_token);
      const rB = await browserFetchOnboarding(pageB, fxB.access_token);
      expect(rA.status).toBe(200);
      expect(rB.status).toBe(200);
      const tA = (rA.json as { tenantId: string }).tenantId;
      const tB = (rB.json as { tenantId: string }).tenantId;
      expect(tA).not.toBe(tB);
      await trackTenantIfPresent(userAId);
      await trackTenantIfPresent(userBId);

      // Post-condition in DB: each actor maps to a different tenant,
      // and their memberships do NOT cross.
      const cross = await withPg(async (c) => {
        const q = await c.query(
          `
            SELECT count(*)::int AS c
              FROM spabla_v2.tenant_memberships
             WHERE (actor_id = $1 AND tenant_id = $4)
                OR (actor_id = $2 AND tenant_id = $3)
          `,
          [userAId, userBId, tA, tB],
        );
        return (q.rows[0]?.c ?? 0) as number;
      });
      expect(cross).toBe(0);

      // Repeating actor A's onboarding does not create anything on B.
      const rA2 = await browserFetchOnboarding(pageA, fxA.access_token);
      expect(rA2.status).toBe(200);
      expect((rA2.json as { tenantId: string }).tenantId).toBe(tA);
      const stateB = await readWorkspaceState(userBId);
      expect(stateB.tenantId).toBe(tB);
      expect(stateB.mappingCount).toBe(1);
    } finally {
      await ctxA.close();
      await ctxB.close();
      await browser.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // 12 · Anti-false-positive audit
  //   Static + runtime checks that prove the barrier itself is real.
  //   Fails the suite if any of these guards degrade.
  // ─────────────────────────────────────────────────────────────────
  test("12 · anti-false-positive guards on the suite itself", async () => {
    const specText = await import("node:fs").then((m) =>
      m.readFileSync(__filename, "utf8"),
    );

    // (a) Concurrency test uses fetch inside Promise.all in a
    // browser context, not a Node-sequential loop.
    expect(specText).toMatch(/Promise\.all\(jobs\)/);
    expect(specText).not.toMatch(/for \(const j of jobs\) await j/);

    // (a-bis · Q3-R) The concurrency test coordinates with a
    // control PostgreSQL connection that acquires the RPC's own
    // advisory lock. Presence of the exact lock expression is
    // required — the test cannot silently degrade to a wall-clock
    // heuristic.
    expect(specText).toMatch(
      /pg_advisory_xact_lock\(hashtextextended\(\$1::text, 9321\)\)/,
    );
    expect(specText).toMatch(/wait_event = 'advisory'/);
    expect(specText).toMatch(/pg_blocking_pids/);
    // The wall-clock upper bound heuristic must NOT reappear.
    expect(specText).not.toMatch(/wall.*toBeLessThan\(10_000\)/);

    // (a-tris · Q3-R) Every contract call to /api/v2/onboarding
    // MUST dispatch from Chromium via `window.fetch` in a
    // `page.evaluate`. `page.request` / `context.request` /
    // `APIRequestContext` are Node-side transports and are
    // forbidden for the endpoint itself.
    const contractLineForbidden = specText
      .split(/\r?\n/)
      .map((line, i) => ({ line, i }))
      .filter(
        ({ line }) =>
          /\/api\/v2\/onboarding/.test(line) &&
          /page\.request|context\.request|APIRequestContext|request\.newContext/.test(line),
      );
    expect(contractLineForbidden).toEqual([]);
    // Positive proof: every dispatcher is a `fetch(...)` inside
    // `page.evaluate(...)`. The helper `browserFetchOnboarding`
    // encapsulates this pattern.
    expect(specText).toMatch(/async function browserFetchOnboarding/);
    expect(specText).toMatch(
      /const res = await fetch\(`\$\{baseUrl\}\/api\/v2\/onboarding`/,
    );

    // (b) Deleted-actor test reuses the pre-delete access_token; it
    // never calls `signIn` after `deleteUser`. We isolate the
    // region between `admin.deleteUser` and the closing `finally`
    // and assert that no fresh sign-in appears in it.
    const s6Body = specText.split(
      /test\("6 · deleted actor with original non-expired JWT/,
    )[1]?.split(/^\s{2}\}\);/m)[0];
    expect(s6Body).toBeDefined();
    const postDelete = s6Body!.split(/const del = await a\.auth\.admin\.deleteUser/)[1];
    expect(postDelete).toBeDefined();
    expect(postDelete).not.toMatch(/signInAsUserInPage\(/);
    expect(postDelete).toMatch(/browserFetchOnboarding\(page, fx\.access_token\)/);

    // (c) Post-conditions consult PostgreSQL directly (via `pg`
    //     Client + service_role credentials), never via the endpoint
    //     itself.
    expect(specText).toMatch(/new PgClient/);
    expect(specText).toMatch(/spabla_v2\.actor_personal_workspace/);

    // (d) Zero test.skip / test.fixme / retries in this spec.
    expect(specText).not.toMatch(/test\.skip\(/);
    expect(specText).not.toMatch(/test\.fixme\(/);
    expect(specText).not.toMatch(/\.retry\(/);

    // (e) Post-condition helper is reachable and returns the current
    //     state — a smoke ping to confirm the pg connection works
    //     even without an active fixture (no rows expected for a
    //     random UUID).
    const rand = randomUUID();
    const st = await readWorkspaceState(rand);
    expect(st.mappingCount).toBe(0);
    expect(st.tenantCount).toBe(0);
  });
});
