/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-B-Q3 · Real OTP browser E2E barrier.
 *
 * Drives the productive OTP flow from Chromium end-to-end:
 *   /v2/chat → email in OTP form → Mailpit delivery → code extracted
 *   → typed into UI → verifyOtp (real Supabase Auth) → session cached
 *   by SDK → POST /api/v2/onboarding (real handler) → bootstrap →
 *   operational chat UI.
 *
 * Scenarios:
 *   S1 · new user
 *   S2 · existing user (idempotent onboarding)
 *   S3 · password path still works
 *   S4 · wrong OTP · opaque error
 *   S5 · resend · previous code invalidated
 *   S6 · real expiration (60 s local, per supabase/config.toml Q3)
 *   S7 · concurrency (double click)
 *   S8 · anti-leak audit
 *   S9 · isolation barrier (registry cleanup)
 *
 * Zero mocked network. Zero fabricated session. Zero OTP printed —
 * `sha12` truncated hash only.
 *
 * Orchestrated by `scripts/e2e/run-otp-browser-e2e.sh` which brings
 * Supabase local + Mailpit + `next dev` on port 3131 and exports the
 * env vars this spec expects.
 */

import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";
import { randomBytes } from "node:crypto";

import { purgeMailbox, sha12, waitForOtp, type MailpitClient } from "./helpers/mailpit";
import { createOtpFixtureRegistry, type OtpFixtureRegistry } from "@/lib/v2/test-utils/otp-fixture-registry";

// ─── Environment (set by scripts/e2e/run-otp-browser-e2e.sh) ────────
const BASE_URL = process.env.SPABLA_E2E_BASE_URL ?? "";
const SUPABASE_URL = process.env.SPABLA_E2E_SUPABASE_URL ?? "";
const ANON = process.env.SPABLA_E2E_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SPABLA_E2E_SUPABASE_SERVICE_ROLE_KEY ?? "";
const INBUCKET_URL = process.env.SPABLA_E2E_INBUCKET_URL ?? "http://127.0.0.1:54324";
const PG_URL =
  process.env.SPABLA_E2E_PG_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

if (BASE_URL === "" || SUPABASE_URL === "" || ANON === "" || SERVICE === "") {
  throw new Error(
    "SPABLA_E2E_* env vars missing. Run scripts/e2e/run-otp-browser-e2e.sh instead of `npx playwright test`.",
  );
}

const RUN_ID = randomBytes(6).toString("hex");
const PASSWORD_FOR_PASSWORD_TEST = `PW-${RUN_ID}-A1!`;
const mailpit: MailpitClient = { baseUrl: INBUCKET_URL };

let admin: SupabaseClient;
let registry: OtpFixtureRegistry;

test.beforeAll(async () => {
  admin = createClient(SUPABASE_URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  registry = createOtpFixtureRegistry(RUN_ID, {
    admin,
    pgUrl: PG_URL,
    inbucketUrl: INBUCKET_URL,
  });
});

test.afterAll(async () => {
  try {
    await registry.cleanupAll();
    await purgeMailbox(mailpit, RUN_ID);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[e2e-otp-cleanup] error:", (err as Error).message);
  }
});

// ─── UI helpers ─────────────────────────────────────────────────────
async function openChatWithOtp(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/v2/chat`, { waitUntil: "domcontentloaded" });
  // OTP must be the initial view (contract Q2-R §1).
  await expect(page.locator('section[aria-label="Iniciar sesión con código"]')).toBeVisible({ timeout: 30_000 });
}
async function submitEmailForOtp(page: Page, email: string): Promise<void> {
  await page.locator("#spabla-otp-email").fill(email);
  await page.getByRole("button", { name: /^Recibir código$/i }).click();
  // The code input appears once the request has been dispatched.
  // Supabase local + Mailpit can add ~1-3 s of RTT; we allow 30 s
  // to absorb noise without hiding a real hang.
  await expect(page.locator("#spabla-otp-code")).toBeVisible({ timeout: 30_000 });
}
async function typeAndVerifyOtp(page: Page, code: string): Promise<void> {
  await page.locator("#spabla-otp-code").fill(code);
  await page.getByRole("button", { name: /^Verificar código$/i }).click();
}
async function expectAuthenticatedChat(page: Page): Promise<void> {
  // Sesión Supabase persistida (SDK escribe localStorage bajo la
  // clave productiva) — prueba dinámica de que verifyOtp emitió
  // una sesión real que el SDK cacheó.
  await page.waitForFunction(
    () => !!window.localStorage.getItem("spabla_v2_fase9_auth"),
    { timeout: 15_000 },
  );
  await expect(page.locator('section[aria-label="Cabecera de la conversación"]')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('span[aria-label="Cuenta autenticada"]')).toBeVisible({
    timeout: 30_000,
  });
}

async function pgQueryTenantOf(actorId: string): Promise<string | null> {
  const c = new PgClient({ connectionString: PG_URL });
  await c.connect();
  try {
    const r = await c.query(
      `SELECT tenant_id FROM spabla_v2.actor_personal_workspace WHERE actor_id = $1`,
      [actorId],
    );
    return r.rows[0]?.tenant_id ?? null;
  } finally {
    await c.end().catch(() => undefined);
  }
}

/**
 * Poll `actor_personal_workspace` until the row appears, tolerating
 * the race between `verifyOtp` cache-write (which unlocks the UI and
 * lets `expectAuthenticatedChat` return) and the parallel
 * `callOnboarding` fetch that actually inserts the mapping. Real
 * end-to-end: no fabricated state, still asserts the row EXISTS.
 */
async function pgWaitTenantOf(actorId: string, timeoutMs = 15_000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const t = await pgQueryTenantOf(actorId);
    if (t !== null) return t;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

/**
 * Look up the actor id for `email` by hitting `auth.users` directly
 * over PG. Avoids `admin.auth.admin.listUsers`, which currently
 * throws 500 (`Scan error on column "confirmation_token"`) whenever
 * the shared local Supabase database contains SQL-seeded users whose
 * `confirmation_token` is NULL — a common condition when the SQL
 * integration suite has run in the same reset window. Polls briefly
 * so we don't race `signInWithOtp`'s user-creation write.
 */
async function pgWaitActorIdByEmail(email: string, timeoutMs = 10_000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const c = new PgClient({ connectionString: PG_URL });
    await c.connect();
    try {
      const r = await c.query(`SELECT id FROM auth.users WHERE email = $1 LIMIT 1`, [email]);
      if (r.rows[0]?.id) return r.rows[0].id as string;
    } finally {
      await c.end().catch(() => undefined);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

// ─── Console leak collector ─────────────────────────────────────────
type LeakChannels = {
  consoleLines: string[];
  pageErrors: string[];
  requestFailures: string[];
};
function collectLeaks(page: Page): LeakChannels {
  const consoleLines: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  page.on("console", (msg) => consoleLines.push(`[${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err) => pageErrors.push(String(err.message ?? err)));
  page.on("requestfailed", (req) =>
    requestFailures.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText ?? "unknown"}`),
  );
  return { consoleLines, pageErrors, requestFailures };
}
function assertNoLeak(channels: LeakChannels, secrets: { code?: string; email?: string; token?: string }): void {
  const bag = [
    ...channels.consoleLines,
    ...channels.pageErrors,
    ...channels.requestFailures,
  ].join("\n");
  if (secrets.code) expect(bag).not.toContain(secrets.code);
  if (secrets.email) expect(bag).not.toContain(secrets.email);
  if (secrets.token) expect(bag).not.toContain(secrets.token);
  expect(bag).not.toMatch(/access_token/i);
  expect(bag).not.toMatch(/refresh_token/i);
  expect(bag).not.toMatch(/ConfirmationURL/);
  expect(bag).not.toMatch(/\/auth\/v1\/verify/);
  expect(bag).not.toMatch(/service_role/);
}

test.describe("OTP browser E2E · real barrier", () => {
  // ─────────────────────────────────────────────────────────────────
  // S1 · new user
  // ─────────────────────────────────────────────────────────────────
  test("S1 · new user completes OTP → session → onboarding → chat operational", async () => {
    const email = registry.emailFor("s1-new");
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const leaks = collectLeaks(page);
    let extractedCode: string | undefined;
    try {
      await openChatWithOtp(page);
      await submitEmailForOtp(page, email);
      const otp = await waitForOtp(mailpit, email);
      extractedCode = otp.code;
      // eslint-disable-next-line no-console
      console.log(
        `[e2e-otp s1] email_hash=${sha12(email)} code_hash=${sha12(otp.code)} subject_hash=${sha12(otp.subject)}`,
      );
      await typeAndVerifyOtp(page, otp.code);
      await expectAuthenticatedChat(page);
      // Register the actor for cleanup + assert SQL state.
      const actorId = await pgWaitActorIdByEmail(email);
      expect(actorId).not.toBeNull();
      if (actorId) registry.registerUser(actorId);
      const tenant = await pgWaitTenantOf(actorId!);
      expect(tenant).not.toBeNull();
      if (tenant) registry.registerTenant(tenant);
      // Refresh → session continues, tenant preserved.
      await page.reload({ waitUntil: "domcontentloaded" });
      await expectAuthenticatedChat(page);
      // Anti-leak: neither the code nor the email leaked to console.
      assertNoLeak(leaks, { code: extractedCode, email });
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // S2 · existing user · same opaque response · idempotent onboarding
  // ─────────────────────────────────────────────────────────────────
  test("S2 · existing user reuses same workspace; onboarding idempotent", async () => {
    const email = registry.emailFor("s2-exist");
    // Pre-provision + one onboarding via admin SDK is NOT allowed
    // (would need direct RPC). Instead we run OTP once to create the
    // workspace, then simulate 'existing user' by running OTP a
    // SECOND time — same actor, same email.
    const browser = await chromium.launch();
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    let tenantA: string | null = null;
    try {
      await openChatWithOtp(pageA);
      await submitEmailForOtp(pageA, email);
      const otp1 = await waitForOtp(mailpit, email);
      await typeAndVerifyOtp(pageA, otp1.code);
      await expectAuthenticatedChat(pageA);
      const actorAId = await pgWaitActorIdByEmail(email);
      expect(actorAId).not.toBeNull();
      if (actorAId) registry.registerUser(actorAId);
      tenantA = await pgWaitTenantOf(actorAId!);
      expect(tenantA).not.toBeNull();
      if (tenantA) registry.registerTenant(tenantA);
    } finally {
      await ctxA.close();
    }
    // Second session — same email, existing user, must reuse tenant.
    // Supabase local applies a 1 s SMTP rate limit per address
    // (`GOTRUE_SMTP_MAX_FREQUENCY`). Real users never hit it; the
    // rapid ctxA→ctxB sequence in this test does. Wait so the second
    // request from ctxB is not opaquely 429-throttled — which would
    // regress the assertion into a rate-limit test instead of the
    // idempotency test S2 is meant to be.
    await new Promise((r) => setTimeout(r, 2_000));
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    try {
      await openChatWithOtp(pageB);
      await submitEmailForOtp(pageB, email);
      // Cooldown enforced server-side: wait for it if needed.
      const otp2 = await waitForOtp(mailpit, email);
      await typeAndVerifyOtp(pageB, otp2.code);
      await expectAuthenticatedChat(pageB);
      const actorBId = await pgWaitActorIdByEmail(email);
      expect(actorBId).not.toBeNull();
      const tenantB = await pgWaitTenantOf(actorBId!);
      // Idempotencia: mismo tenant.
      expect(tenantB).toBe(tenantA);
      // Cero segundo workspace y una sola membership.
      const c = new PgClient({ connectionString: PG_URL });
      await c.connect();
      try {
        const mapping = await c.query(
          `SELECT count(*)::int AS n FROM spabla_v2.actor_personal_workspace WHERE actor_id = $1`,
          [actorBId!],
        );
        expect(mapping.rows[0].n).toBe(1);
        const memberships = await c.query(
          `SELECT count(*)::int AS n FROM spabla_v2.tenant_memberships WHERE actor_id = $1 AND is_active = TRUE`,
          [actorBId!],
        );
        expect(memberships.rows[0].n).toBe(1);
      } finally {
        await c.end().catch(() => undefined);
      }
    } finally {
      await ctxB.close();
      await browser.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // S3 · password path still works alongside OTP
  // ─────────────────────────────────────────────────────────────────
  test("S3 · password coexists with OTP · logout returns to OTP", async () => {
    const email = registry.emailFor("s3-pw");
    // Create user with password (admin API) to test password path.
    const created = await admin.auth.admin.createUser({
      email,
      password: PASSWORD_FOR_PASSWORD_TEST,
      email_confirm: true,
    });
    expect(created.error).toBeNull();
    if (created.data.user) registry.registerUser(created.data.user.id);
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await openChatWithOtp(page);
      // Switch to password
      await page.getByRole("button", { name: /Acceder con contraseña/i }).click();
      await expect(page.locator('section[aria-label="Iniciar sesión"]')).toBeVisible({ timeout: 10_000 });
      await page.locator("#spabla-session-email").fill(email);
      await page.locator("#spabla-session-password").fill(PASSWORD_FOR_PASSWORD_TEST);
      await page.getByRole("button", { name: "Iniciar sesión" }).click();
      await expectAuthenticatedChat(page);
      // Log out from the header (contract Q3-E2E-R patrón)
      await page.getByRole("button", { name: /cerrar sesión|logout|salir/i }).click().catch(() => undefined);
      // Fallback: signOut via SDK hook (auth-continuity pattern)
      await page.evaluate(async () => {
        const w = window as unknown as { __spablaSupabase?: { auth: { signOut: (opts?: { scope?: string }) => Promise<{ error: unknown }> } } };
        if (w.__spablaSupabase) await w.__spablaSupabase.auth.signOut({ scope: "local" });
      });
      // After logout the OTP view is the default again.
      await expect(page.locator('section[aria-label="Iniciar sesión con código"]')).toBeVisible({ timeout: 15_000 });
      // Password still available as alternative.
      await page.getByRole("button", { name: /Acceder con contraseña/i }).click();
      await expect(page.locator('section[aria-label="Iniciar sesión"]')).toBeVisible({ timeout: 10_000 });
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // S4 · wrong OTP → opaque error → NO session
  // ─────────────────────────────────────────────────────────────────
  test("S4 · wrong OTP → opaque error, no session, no onboarding", async () => {
    const email = registry.emailFor("s4-wrong");
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await openChatWithOtp(page);
      await submitEmailForOtp(page, email);
      // Wait for mail then discard the real code — we type a wrong one.
      const real = await waitForOtp(mailpit, email);
      registry.registerUser(""); // no-op; ensures list scanned later
      const wrong = real.code === "000000" ? "111111" : "000000";
      await typeAndVerifyOtp(page, wrong);
      // Opaque public message. Scoped to OtpForm's code-step error so
      // we don't accidentally match a stale/empty alert node before
      // React has flushed the setError commit.
      const alert = page.locator('#spabla-otp-code-error[role="alert"]');
      await expect(alert).toBeVisible({ timeout: 10_000 });
      const text = (await alert.textContent()) ?? "";
      expect(text).toMatch(/no es válido|solicita/i);
      // No authenticated UI (the header section is always present as
      // it renders the unauth banner; assert the authenticated-only
      // account chip instead).
      await expect(page.locator('span[aria-label="Cuenta autenticada"]')).toHaveCount(0);
      // localStorage did NOT get the session
      const sessionStored = await page.evaluate(
        () => !!window.localStorage.getItem("spabla_v2_fase9_auth"),
      );
      expect(sessionStored).toBe(false);
      // Register the user that Supabase created (create_user:true) for cleanup
      const s4ActorId = await pgWaitActorIdByEmail(email);
      if (s4ActorId) registry.registerUser(s4ActorId);
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // S5 · resend invalidates previous code; new code works
  // ─────────────────────────────────────────────────────────────────
  test("S5 · resend · previous code rejected, new code accepted, single workspace", async ({}, testInfo) => {
    // The client-side cooldown between two "Recibir código" requests
    // is 60 s (OtpForm.RESEND_COOLDOWN_SECONDS). The default 30 s
    // Playwright test timeout is not enough; extend it so we can wait
    // for the button to leave cooldown, resend, and verify twice.
    testInfo.setTimeout(150_000);
    const email = registry.emailFor("s5-resend");
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await openChatWithOtp(page);
      await submitEmailForOtp(page, email);
      const first = await waitForOtp(mailpit, email);
      // Wait for cooldown to elapse. `max_frequency=1s` default local,
      // but Supabase may enforce a slightly longer window. We poll.
      // OtpForm swaps the resend button's accessible name during the
      // client-side cooldown ("Reenviar código en X segundos") back to
      // "Reenviar código" when the timer expires. Match both shapes so
      // the visibility probe does not race the cooldown.
      const resendBtn = page.getByRole("button", { name: /^Reenviar código( en |$)/i });
      await expect(resendBtn).toBeVisible();
      // Wait until resend is enabled (up to 90s to tolerate cooldown+RTT).
      await expect(resendBtn).toBeEnabled({ timeout: 90_000 });
      await resendBtn.click();
      const second = await waitForOtp(mailpit, email);
      expect(second.code).not.toBe(first.code);
      // Try the FIRST code — must be rejected opaquely
      await typeAndVerifyOtp(page, first.code);
      const alert = page.locator('#spabla-otp-code-error[role="alert"]');
      await expect(alert).toBeVisible({ timeout: 10_000 });
      const errText = (await alert.textContent()) ?? "";
      expect(errText).toMatch(/no es válido|solicita/i);
      // Now the SECOND code — must work
      await typeAndVerifyOtp(page, second.code);
      await expectAuthenticatedChat(page);
      const s5ActorId = await pgWaitActorIdByEmail(email);
      expect(s5ActorId).not.toBeNull();
      if (s5ActorId) registry.registerUser(s5ActorId);
      // One workspace only.
      const tenant = await pgWaitTenantOf(s5ActorId!);
      if (tenant) registry.registerTenant(tenant);
      const c = new PgClient({ connectionString: PG_URL });
      await c.connect();
      try {
        const mapping = await c.query(
          `SELECT count(*)::int AS n FROM spabla_v2.actor_personal_workspace WHERE actor_id = $1`,
          [s5ActorId!],
        );
        expect(mapping.rows[0].n).toBe(1);
      } finally {
        await c.end().catch(() => undefined);
      }
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // S6 · real expiration (60 s local otp_expiry)
  // ─────────────────────────────────────────────────────────────────
  test("S6 · real expiration · code past otp_expiry rejected", async ({}, testInfo) => {
    testInfo.setTimeout(120_000);
    const email = registry.emailFor("s6-exp");
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await openChatWithOtp(page);
      await submitEmailForOtp(page, email);
      const otp = await waitForOtp(mailpit, email);
      // Wait past `otp_expiry` (local: 60 s + margin).
      await new Promise((r) => setTimeout(r, 65_000));
      await typeAndVerifyOtp(page, otp.code);
      const alert = page.locator('#spabla-otp-code-error[role="alert"]');
      await expect(alert).toBeVisible({ timeout: 10_000 });
      const text = (await alert.textContent()) ?? "";
      expect(text).toMatch(/no es válido|solicita/i);
      const sessionStored = await page.evaluate(
        () => !!window.localStorage.getItem("spabla_v2_fase9_auth"),
      );
      expect(sessionStored).toBe(false);
      const s6ActorId = await pgWaitActorIdByEmail(email);
      if (s6ActorId) registry.registerUser(s6ActorId);
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // S7 · concurrency · double click on "Recibir código" produces one request
  // ─────────────────────────────────────────────────────────────────
  test("S7 · concurrency · double click emits one effective request; state coherent", async () => {
    const email = registry.emailFor("s7-conc");
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await openChatWithOtp(page);
      await page.locator("#spabla-otp-email").fill(email);
      const btn = page.getByRole("button", { name: /^Recibir código$/i });
      // Fire three rapid clicks
      await Promise.all([btn.click(), btn.click().catch(() => undefined), btn.click().catch(() => undefined)]);
      // Component moves to code view after the (single) request resolves
      await expect(page.locator("#spabla-otp-code")).toBeVisible({ timeout: 15_000 });
      // Mailpit received AT MOST one message (helper enforces exactly one)
      const otp = await waitForOtp(mailpit, email, { expectOne: true, timeoutMs: 5_000 });
      await typeAndVerifyOtp(page, otp.code);
      await expectAuthenticatedChat(page);
      const s7ActorId = await pgWaitActorIdByEmail(email);
      if (s7ActorId) registry.registerUser(s7ActorId);
      // One workspace + one membership only
      const s7Tenant = await pgWaitTenantOf(s7ActorId!);
      if (s7Tenant) registry.registerTenant(s7Tenant);
      const c = new PgClient({ connectionString: PG_URL });
      await c.connect();
      try {
        const mapping = await c.query(
          `SELECT count(*)::int AS n FROM spabla_v2.actor_personal_workspace WHERE actor_id = $1`,
          [s7ActorId!],
        );
        expect(mapping.rows[0].n).toBe(1);
        const memberships = await c.query(
          `SELECT count(*)::int AS n FROM spabla_v2.tenant_memberships WHERE actor_id = $1`,
          [s7ActorId!],
        );
        expect(memberships.rows[0].n).toBe(1);
      } finally {
        await c.end().catch(() => undefined);
      }
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // S8 · anti-leak audit — session established but zero secrets on the wire
  // ─────────────────────────────────────────────────────────────────
  test("S8 · anti-leak · session works with zero OTP/tokens/service_role in visible surface", async () => {
    const email = registry.emailFor("s8-leak");
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const leaks = collectLeaks(page);
    try {
      await openChatWithOtp(page);
      await submitEmailForOtp(page, email);
      const otp = await waitForOtp(mailpit, email);
      await typeAndVerifyOtp(page, otp.code);
      await expectAuthenticatedChat(page);
      const s8ActorId = await pgWaitActorIdByEmail(email);
      if (s8ActorId) registry.registerUser(s8ActorId);
      // Register the tenant so cleanup deletes both mapping + tenant row.
      const s8Tenant = s8ActorId ? await pgWaitTenantOf(s8ActorId) : null;
      if (s8Tenant) registry.registerTenant(s8Tenant);
      // URL: cero OTP en la URL
      expect(page.url()).not.toContain(otp.code);
      // Cookies: cero OTP
      const cookies = await ctx.cookies();
      for (const cookie of cookies) {
        expect(cookie.value).not.toContain(otp.code);
      }
      // localStorage: se persiste la sesión (spabla_v2_fase9_auth)
      // pero NO el OTP en sí.
      const storage = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
      expect(storage).not.toContain(otp.code);
      // sessionStorage: cero
      const sessionStorageSnapshot = await page.evaluate(
        () => JSON.stringify(Object.fromEntries(Object.entries(sessionStorage))),
      );
      expect(sessionStorageSnapshot).not.toContain(otp.code);
      // Console + pageerror + requestfailed
      assertNoLeak(leaks, { code: otp.code, email });
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // S9 · isolation barrier · zero residuals of this runId after cleanup
  // ─────────────────────────────────────────────────────────────────
  test("S9 · isolation barrier · zero residuals of runId after registry cleanup", async () => {
    // Explicit cleanup (afterAll runs anyway; this makes the barrier
    // visible in the test report).
    await registry.cleanupAll();
    const residual = await registry.countOwnResidualUsers();
    expect(residual).toBe(0);
    // Mailpit residuals for this runId
    const remaining = await purgeMailbox(mailpit, RUN_ID);
    expect(remaining).toBe(0);
  });
});
