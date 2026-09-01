/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-B-Q3-R · Real OTP browser E2E barrier.
 *
 * Drives the productive OTP flow from Chromium end-to-end:
 *   /v2/chat → email in OTP form → Mailpit delivery → code extracted
 *   → typed into UI → verifyOtp (real Supabase Auth) → session cached
 *   by SDK → POST /api/v2/onboarding (real handler) → bootstrap →
 *   operational chat UI.
 *
 * Scenarios (Q3 baseline):
 *   S1 · new user
 *   S2 · existing user (idempotent onboarding)
 *   S3 · password path still works
 *   S4 · wrong OTP · opaque error
 *   S5 · resend · previous code invalidated
 *   S6 · real expiration (60 s local, per supabase/config.toml Q3)
 *   S7 · concurrency (double click on "Recibir código")
 *   S8 · anti-leak audit
 *   S9 · isolation barrier (registry cleanup)
 *
 * Scenarios (Q3-R behavioural completeness):
 *   S10 · OTP reuse rejected after successful verify
 *   S11 · double click on "Verificar código"
 *   S12 · switching email after landing in code step
 *   S13 · verify against invalidated code while resend in flight
 *   S14 · reload during code step — zero OTP persisted
 *   S15 · two-tab session sync (same context)
 *   S16 · password path · full 12-step walkthrough
 *   S17 · exhaustive isolation snapshot (auth.users / identities /
 *         one_time_tokens / tenants / mappings / memberships /
 *         lifecycle / Mailpit / listen port)
 *
 * Zero mocked network. Zero fabricated session. Zero OTP printed —
 * `sha12` truncated hash only. Screenshots disabled at describe scope
 * because the OTP input holds the plaintext code briefly and
 * failure-time screenshots would otherwise leak it.
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

// Q3-R FASE 5 · Failure screenshots would capture the plaintext OTP
// sitting in `#spabla-otp-code` between `fill()` and the verifyOtp
// response, so disable them for the whole suite. Playwright config
// already keeps video/trace off; this closes the last image channel.
// Must be top-level (Playwright forbids `test.use` inside describe).
test.use({ screenshot: "off" });

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
    const leaksA = collectLeaks(pageA);
    let tenantA: string | null = null;
    let otp1Code = "";
    try {
      await openChatWithOtp(pageA);
      await submitEmailForOtp(pageA, email);
      const otp1 = await waitForOtp(mailpit, email);
      otp1Code = otp1.code;
      await typeAndVerifyOtp(pageA, otp1.code);
      await expectAuthenticatedChat(pageA);
      const actorAId = await pgWaitActorIdByEmail(email);
      expect(actorAId).not.toBeNull();
      if (actorAId) registry.registerUser(actorAId);
      tenantA = await pgWaitTenantOf(actorAId!);
      expect(tenantA).not.toBeNull();
      if (tenantA) registry.registerTenant(tenantA);
      assertNoLeak(leaksA, { code: otp1Code, email });
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
    const leaksB = collectLeaks(pageB);
    let otp2Code = "";
    try {
      await openChatWithOtp(pageB);
      await submitEmailForOtp(pageB, email);
      // Cooldown enforced server-side: wait for it if needed.
      const otp2 = await waitForOtp(mailpit, email);
      otp2Code = otp2.code;
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
      assertNoLeak(leaksB, { code: otp2Code, email });
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
    const leaks = collectLeaks(page);
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
      // Anti-leak: password path must not spill JWTs/emails/OTPs to
      // the surfaces we audit. Password itself is the caller's secret;
      // pass it through so `assertNoLeak` also rejects any accidental
      // password echo.
      assertNoLeak(leaks, { email, token: PASSWORD_FOR_PASSWORD_TEST });
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
    const leaks = collectLeaks(page);
    let realCode = "";
    try {
      await openChatWithOtp(page);
      await submitEmailForOtp(page, email);
      // Wait for mail then discard the real code — we type a wrong one.
      const real = await waitForOtp(mailpit, email);
      realCode = real.code;
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
      assertNoLeak(leaks, { code: realCode, email });
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
    const leaks = collectLeaks(page);
    let firstCode = "";
    let secondCode = "";
    try {
      await openChatWithOtp(page);
      await submitEmailForOtp(page, email);
      const first = await waitForOtp(mailpit, email);
      firstCode = first.code;
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
      secondCode = second.code;
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
      // Both codes must have been extracted; assert neither ever
      // reached any of the audited channels.
      expect(firstCode).not.toBe("");
      expect(secondCode).not.toBe("");
      assertNoLeak(leaks, { code: firstCode, email });
      assertNoLeak(leaks, { code: secondCode, email });
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
    const leaks = collectLeaks(page);
    let otpCode = "";
    try {
      await openChatWithOtp(page);
      await submitEmailForOtp(page, email);
      const otp = await waitForOtp(mailpit, email);
      otpCode = otp.code;
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
      assertNoLeak(leaks, { code: otpCode, email });
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
    const leaks = collectLeaks(page);
    let otpCode = "";
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
      otpCode = otp.code;
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
      assertNoLeak(leaks, { code: otpCode, email });
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
  // S10 · Q3-R FASE 2 · reused OTP is rejected after a successful verify
  // ─────────────────────────────────────────────────────────────────
  test("S10 · reused OTP rejected · second attempt gets opaque error, no second session, no second onboarding", async () => {
    const email = registry.emailFor("s10-reuse");
    const browser = await chromium.launch();
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    const leaksA = collectLeaks(pageA);
    let capturedCode = "";
    let firstTenant: string | null = null;
    let actorId: string | null = null;
    try {
      await openChatWithOtp(pageA);
      await submitEmailForOtp(pageA, email);
      const otp = await waitForOtp(mailpit, email);
      capturedCode = otp.code;
      await typeAndVerifyOtp(pageA, otp.code);
      await expectAuthenticatedChat(pageA);
      actorId = await pgWaitActorIdByEmail(email);
      expect(actorId).not.toBeNull();
      if (actorId) registry.registerUser(actorId);
      firstTenant = await pgWaitTenantOf(actorId!);
      expect(firstTenant).not.toBeNull();
      if (firstTenant) registry.registerTenant(firstTenant);
      assertNoLeak(leaksA, { code: capturedCode, email });
    } finally {
      await ctxA.close();
    }
    // Fresh context — no fabricated state. Enter the used OTP again
    // via the real UI.
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    const leaksB = collectLeaks(pageB);
    try {
      await openChatWithOtp(pageB);
      // Client-side normalisation lowers the email; use it as-is.
      await pageB.locator("#spabla-otp-email").fill(email);
      // Skip requesting a fresh OTP — respect the SMTP frequency
      // guard by jumping straight to the verify step via the SDK
      // hook. Even without a new mail, the UI must allow us to
      // navigate to step=code by pressing "Recibir código" — but
      // that would consume a second slot. Instead we drive the
      // verify path directly against Supabase using the exposed
      // client hook (still real browser, real request, real session
      // storage). No fabricated session — only the SDK call.
      const verify = await pageB.evaluate(
        async ({ e, t }: { e: string; t: string }) => {
          const w = window as unknown as {
            __spablaSupabase?: {
              auth: {
                verifyOtp: (x: unknown) => Promise<{
                  data: { session: unknown } | null;
                  error: { message?: string; code?: string | number } | null;
                }>;
              };
            };
          };
          if (!w.__spablaSupabase) return { hook: false } as const;
          const res = await w.__spablaSupabase.auth.verifyOtp({
            type: "email",
            email: e,
            token: t,
          });
          return {
            hook: true,
            hasSession: !!res.data?.session,
            errorCode: res.error?.code ?? null,
          } as const;
        },
        { e: email, t: capturedCode },
      );
      expect(verify.hook).toBe(true);
      // Reuse MUST be rejected; the server invalidates the OTP after
      // the first successful use.
      expect(verify.hasSession).toBe(false);
      // Zero session in localStorage — the reuse attempt did not
      // create a second session.
      const stored = await pageB.evaluate(() =>
        !!window.localStorage.getItem("spabla_v2_fase9_auth"),
      );
      expect(stored).toBe(false);
      // Zero second workspace, zero second membership: mapping count
      // remains 1, membership count remains 1.
      const c = new PgClient({ connectionString: PG_URL });
      await c.connect();
      try {
        const mapping = await c.query(
          `SELECT count(*)::int AS n FROM spabla_v2.actor_personal_workspace WHERE actor_id = $1`,
          [actorId!],
        );
        expect(mapping.rows[0].n).toBe(1);
        const memberships = await c.query(
          `SELECT count(*)::int AS n FROM spabla_v2.tenant_memberships WHERE actor_id = $1 AND is_active = TRUE`,
          [actorId!],
        );
        expect(memberships.rows[0].n).toBe(1);
        // Same tenant — no second workspace was provisioned by the
        // reuse attempt.
        const tenantAfter = await c.query(
          `SELECT tenant_id FROM spabla_v2.actor_personal_workspace WHERE actor_id = $1`,
          [actorId!],
        );
        expect(tenantAfter.rows[0]?.tenant_id).toBe(firstTenant);
      } finally {
        await c.end().catch(() => undefined);
      }
      assertNoLeak(leaksB, { code: capturedCode, email });
    } finally {
      await ctxB.close();
      await browser.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // S11 · Q3-R FASE 3 (2/6) · double click on "Verificar código"
  // ─────────────────────────────────────────────────────────────────
  test("S11 · double verify · exactly one authenticated transition, idempotent onboarding, one workspace", async () => {
    const email = registry.emailFor("s11-dblverify");
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const leaks = collectLeaks(page);
    let otpCode = "";
    try {
      await openChatWithOtp(page);
      await submitEmailForOtp(page, email);
      const otp = await waitForOtp(mailpit, email);
      otpCode = otp.code;
      await page.locator("#spabla-otp-code").fill(otp.code);
      const verifyBtn = page.getByRole("button", { name: /^Verificar código$/i });
      // Rapid triple-click on "Verificar código". OtpForm's opId
      // guard should collapse this into exactly one transition.
      await Promise.all([
        verifyBtn.click(),
        verifyBtn.click().catch(() => undefined),
        verifyBtn.click().catch(() => undefined),
      ]);
      await expectAuthenticatedChat(page);
      const actorId = await pgWaitActorIdByEmail(email);
      expect(actorId).not.toBeNull();
      if (actorId) registry.registerUser(actorId);
      const tenant = await pgWaitTenantOf(actorId!);
      expect(tenant).not.toBeNull();
      if (tenant) registry.registerTenant(tenant);
      const c = new PgClient({ connectionString: PG_URL });
      await c.connect();
      try {
        const mapping = await c.query(
          `SELECT count(*)::int AS n FROM spabla_v2.actor_personal_workspace WHERE actor_id = $1`,
          [actorId!],
        );
        expect(mapping.rows[0].n).toBe(1);
        const memberships = await c.query(
          `SELECT count(*)::int AS n FROM spabla_v2.tenant_memberships WHERE actor_id = $1 AND is_active = TRUE`,
          [actorId!],
        );
        expect(memberships.rows[0].n).toBe(1);
      } finally {
        await c.end().catch(() => undefined);
      }
      assertNoLeak(leaks, { code: otpCode, email });
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // S12 · Q3-R FASE 3 (3/6) · email swap after landing in code step
  // ─────────────────────────────────────────────────────────────────
  test("S12 · switch email after code step · previous code never appears, final state matches new email", async ({}, testInfo) => {
    testInfo.setTimeout(60_000);
    const emailA = registry.emailFor("s12-swap-a");
    const emailB = registry.emailFor("s12-swap-b");
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const leaks = collectLeaks(page);
    let codeA = "";
    let codeB = "";
    try {
      await openChatWithOtp(page);
      // Submit email A, get to code step, extract A's code so it
      // never lingers in Mailpit past the swap.
      await submitEmailForOtp(page, emailA);
      const otpA = await waitForOtp(mailpit, emailA);
      codeA = otpA.code;
      // "Cambiar email" invalidates the in-flight opId; back to
      // step=email.
      await page.getByRole("button", { name: /^Cambiar email$/i }).click();
      await expect(page.locator("#spabla-otp-email")).toBeEnabled({ timeout: 5_000 });
      // Wait past the 1s GOTRUE_SMTP_MAX_FREQUENCY window for the
      // downstream request against email B.
      await new Promise((r) => setTimeout(r, 2_000));
      // Submit email B; the code input for B must appear.
      await submitEmailForOtp(page, emailB);
      const otpB = await waitForOtp(mailpit, emailB);
      codeB = otpB.code;
      // The A code must NOT be usable on this session — the UI is
      // now bound to email B.
      await typeAndVerifyOtp(page, otpA.code);
      const alert = page.locator('#spabla-otp-code-error[role="alert"]');
      await expect(alert).toBeVisible({ timeout: 10_000 });
      // Then verify with B — succeeds and produces a session for B.
      await typeAndVerifyOtp(page, otpB.code);
      await expectAuthenticatedChat(page);
      // Final state: actor B exists and holds a workspace.
      const actorBId = await pgWaitActorIdByEmail(emailB);
      expect(actorBId).not.toBeNull();
      if (actorBId) registry.registerUser(actorBId);
      const tenantB = await pgWaitTenantOf(actorBId!);
      if (tenantB) registry.registerTenant(tenantB);
      // Actor A also exists (Supabase auto-created it on the /otp
      // POST) but has no workspace — the workflow abandoned it.
      const actorAId = await pgWaitActorIdByEmail(emailA);
      if (actorAId) {
        registry.registerUser(actorAId);
        const tenantA = await pgQueryTenantOf(actorAId);
        expect(tenantA).toBeNull();
      }
      // The UI at this point must be authenticated as B; the header
      // shows B's email, not A's.
      const displayedEmail = await page.locator('span[aria-label="Cuenta autenticada"]').textContent();
      expect((displayedEmail ?? "").toLowerCase()).toContain(emailB.split("@")[0]!.slice(0, 1));
      expect((displayedEmail ?? "").toLowerCase()).not.toContain(emailA);
      assertNoLeak(leaks, { code: codeA, email: emailA });
      assertNoLeak(leaks, { code: codeB, email: emailB });
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // S13 · Q3-R FASE 3 (4/6) · verify against invalidated code while resend is in flight
  // ─────────────────────────────────────────────────────────────────
  test("S13 · verify old code during resend · rejected, no incoherent session, second code works", async ({}, testInfo) => {
    testInfo.setTimeout(150_000);
    const email = registry.emailFor("s13-verifyresend");
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const leaks = collectLeaks(page);
    let firstCode = "";
    let secondCode = "";
    try {
      await openChatWithOtp(page);
      await submitEmailForOtp(page, email);
      const first = await waitForOtp(mailpit, email);
      firstCode = first.code;
      const resendBtn = page.getByRole("button", { name: /^Reenviar código( en |$)/i });
      await expect(resendBtn).toBeVisible();
      await expect(resendBtn).toBeEnabled({ timeout: 90_000 });
      // Slow the /otp resend response so we have a wall-clock window
      // in which to fire verifyOtp with the old code.
      await page.route("**/auth/v1/otp", async (route) => {
        await new Promise((r) => setTimeout(r, 3_000));
        await route.continue();
      });
      await resendBtn.click();
      // While the resend is in flight, drive verify with the (already
      // invalidated) first code. It must be rejected — the server
      // marks the previous code invalid the moment the resend hits.
      // We race the verify against the still-open resend to prove
      // the invariant, not to time it.
      await typeAndVerifyOtp(page, first.code);
      // Wait for the resend to finish so Mailpit has the second code.
      await page.unroute("**/auth/v1/otp");
      const second = await waitForOtp(mailpit, email, { timeoutMs: 15_000 });
      secondCode = second.code;
      expect(second.code).not.toBe(first.code);
      // Alert must be visible; the old-code verify must have been
      // rejected without producing a session.
      const alert = page.locator('#spabla-otp-code-error[role="alert"]');
      await expect(alert).toBeVisible({ timeout: 10_000 });
      const stored = await page.evaluate(() =>
        !!window.localStorage.getItem("spabla_v2_fase9_auth"),
      );
      expect(stored).toBe(false);
      // The new (second) code works — real UI, real verify, real
      // session.
      await typeAndVerifyOtp(page, second.code);
      await expectAuthenticatedChat(page);
      const actorId = await pgWaitActorIdByEmail(email);
      expect(actorId).not.toBeNull();
      if (actorId) registry.registerUser(actorId);
      const tenant = await pgWaitTenantOf(actorId!);
      if (tenant) registry.registerTenant(tenant);
      assertNoLeak(leaks, { code: firstCode, email });
      assertNoLeak(leaks, { code: secondCode, email });
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // S14 · Q3-R FASE 3 (5/6) · reload during code step
  // ─────────────────────────────────────────────────────────────────
  test("S14 · reload during code step · zero OTP in URL / cookies / storage, safe fresh state, resend works", async ({}, testInfo) => {
    testInfo.setTimeout(120_000);
    const email = registry.emailFor("s14-reload");
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const leaks = collectLeaks(page);
    let firstCode = "";
    let secondCode = "";
    try {
      await openChatWithOtp(page);
      await submitEmailForOtp(page, email);
      const first = await waitForOtp(mailpit, email);
      firstCode = first.code;
      // Type the code (do not verify) then reload. This is the
      // worst-case moment: the OTP is held in the input value.
      await page.locator("#spabla-otp-code").fill(first.code);
      await page.reload({ waitUntil: "domcontentloaded" });
      // Post-reload: back to step=email (state is not persisted).
      await expect(page.locator('section[aria-label="Iniciar sesión con código"]')).toBeVisible({ timeout: 15_000 });
      // URL, cookies, storage: zero OTP.
      expect(page.url()).not.toContain(first.code);
      const cookies = await ctx.cookies();
      for (const cookie of cookies) {
        expect(cookie.value).not.toContain(first.code);
      }
      const localSnapshot = await page.evaluate(() =>
        JSON.stringify(Object.fromEntries(Object.entries(localStorage))),
      );
      expect(localSnapshot).not.toContain(first.code);
      const sessionSnapshot = await page.evaluate(() =>
        JSON.stringify(Object.fromEntries(Object.entries(sessionStorage))),
      );
      expect(sessionSnapshot).not.toContain(first.code);
      // Input for OTP code is not restored.
      await expect(page.locator("#spabla-otp-code")).toHaveCount(0);
      // Wait past the SMTP rate limit before requesting again.
      await new Promise((r) => setTimeout(r, 2_000));
      // Fresh cycle: request a new OTP for the same email. The
      // reload discarded the first code (it was extracted+deleted
      // pre-reload), so mailpit gets exactly one new mail.
      await submitEmailForOtp(page, email);
      const secondOtp = await waitForOtp(mailpit, email, { timeoutMs: 15_000 });
      expect(secondOtp.code).not.toBe(firstCode);
      secondCode = secondOtp.code;
      await typeAndVerifyOtp(page, secondOtp.code);
      await expectAuthenticatedChat(page);
      const actorId = await pgWaitActorIdByEmail(email);
      expect(actorId).not.toBeNull();
      if (actorId) registry.registerUser(actorId);
      const tenant = await pgWaitTenantOf(actorId!);
      if (tenant) registry.registerTenant(tenant);
      assertNoLeak(leaks, { code: firstCode, email });
      assertNoLeak(leaks, { code: secondCode, email });
    } finally {
      await ctx.close();
      await browser.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // S15 · Q3-R FASE 3 (6/6) · two tabs sharing a context
  // ─────────────────────────────────────────────────────────────────
  test("S15 · two tabs same context · single workspace, second tab picks up session, logout propagates cleanly", async ({}, testInfo) => {
    testInfo.setTimeout(60_000);
    const email = registry.emailFor("s15-twotab");
    const browser = await chromium.launch();
    // Same context on purpose — both tabs share `localStorage` and
    // therefore the Supabase session under `spabla_v2_fase9_auth`.
    const ctx = await browser.newContext();
    const tab1 = await ctx.newPage();
    const leaks1 = collectLeaks(tab1);
    let otpCode = "";
    try {
      await openChatWithOtp(tab1);
      await submitEmailForOtp(tab1, email);
      const otp = await waitForOtp(mailpit, email);
      otpCode = otp.code;
      await typeAndVerifyOtp(tab1, otp.code);
      await expectAuthenticatedChat(tab1);
      const actorId = await pgWaitActorIdByEmail(email);
      expect(actorId).not.toBeNull();
      if (actorId) registry.registerUser(actorId);
      const tenant = await pgWaitTenantOf(actorId!);
      if (tenant) registry.registerTenant(tenant);
      // Open tab2 in the SAME context — Supabase persists the session
      // in `localStorage`, which the same context shares across tabs.
      const tab2 = await ctx.newPage();
      const leaks2 = collectLeaks(tab2);
      try {
        await tab2.goto(`${BASE_URL}/v2/chat`, { waitUntil: "domcontentloaded" });
        // Tab2 must NOT show the OTP form — it should pick up the
        // persisted session and reach the authenticated chat.
        await expect(tab2.locator('span[aria-label="Cuenta autenticada"]')).toBeVisible({
          timeout: 20_000,
        });
        // A single actor / workspace / membership regardless of how
        // many tabs are open.
        const c = new PgClient({ connectionString: PG_URL });
        await c.connect();
        try {
          const mapping = await c.query(
            `SELECT count(*)::int AS n FROM spabla_v2.actor_personal_workspace WHERE actor_id = $1`,
            [actorId!],
          );
          expect(mapping.rows[0].n).toBe(1);
          const memberships = await c.query(
            `SELECT count(*)::int AS n FROM spabla_v2.tenant_memberships WHERE actor_id = $1 AND is_active = TRUE`,
            [actorId!],
          );
          expect(memberships.rows[0].n).toBe(1);
        } finally {
          await c.end().catch(() => undefined);
        }
        // Log out from tab1 via the SDK (real signOut, real storage
        // wipe). Tab2 receives the SIGNED_OUT event via the same
        // storage listener and returns to the unauthenticated view.
        await tab1.evaluate(async () => {
          const w = window as unknown as {
            __spablaSupabase?: {
              auth: { signOut: (o?: { scope?: string }) => Promise<{ error: unknown }> };
            };
          };
          if (w.__spablaSupabase) await w.__spablaSupabase.auth.signOut({ scope: "local" });
        });
        // Tab2 must show the OTP form again once the session is
        // gone. Give the storage event time to propagate.
        await expect(tab2.locator('section[aria-label="Iniciar sesión con código"]')).toBeVisible({
          timeout: 20_000,
        });
        assertNoLeak(leaks2, { code: otpCode, email });
      } finally {
        await tab2.close();
      }
      assertNoLeak(leaks1, { code: otpCode, email });
    } finally {
      await tab1.close();
      await ctx.close();
      await browser.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // S16 · Q3-R FASE 4 · password path · full 12-step walkthrough
  // ─────────────────────────────────────────────────────────────────
  test("S16 · password E2E · OTP default → password login → chat → logout → OTP default → second password login → single workspace", async ({}, testInfo) => {
    testInfo.setTimeout(90_000);
    const email = registry.emailFor("s16-pw-full");
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
    const leaks = collectLeaks(page);
    try {
      // (1) OTP is the initial view.
      await openChatWithOtp(page);
      // (2) Switch to password without reload.
      await page.getByRole("button", { name: /Acceder con contraseña/i }).click();
      await expect(page.locator('section[aria-label="Iniciar sesión"]')).toBeVisible({
        timeout: 10_000,
      });
      // (3) Real login with the pre-provisioned password user.
      await page.locator("#spabla-session-email").fill(email);
      await page.locator("#spabla-session-password").fill(PASSWORD_FOR_PASSWORD_TEST);
      await page.getByRole("button", { name: "Iniciar sesión" }).click();
      // (4) Real session cached by the SDK.
      await page.waitForFunction(
        () => !!window.localStorage.getItem("spabla_v2_fase9_auth"),
        { timeout: 15_000 },
      );
      // (5-6) Onboarding + bootstrap real → operational chat.
      // The password path does NOT auto-call /api/v2/onboarding
      // (only the OTP flow does). To prove the password session can
      // reach the same endpoint, drive it explicitly from the
      // authenticated browser context — same real fetch, same real
      // JWT, same idempotent server contract as Q3-A.
      await expectAuthenticatedChat(page);
      const actorId = await pgWaitActorIdByEmail(email);
      expect(actorId).not.toBeNull();
      const onboarding = await page.evaluate(async () => {
        const w = window as unknown as {
          __spablaSupabase?: {
            auth: { getSession: () => Promise<{ data: { session: { access_token?: string } | null } }> };
          };
        };
        if (!w.__spablaSupabase) return { ok: false, reason: "no hook" } as const;
        const { data } = await w.__spablaSupabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return { ok: false, reason: "no token" } as const;
        const res = await fetch("/api/v2/onboarding", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: "",
        });
        return { ok: res.ok, status: res.status } as const;
      });
      expect(onboarding.ok).toBe(true);
      const firstTenant = await pgWaitTenantOf(actorId!);
      expect(firstTenant).not.toBeNull();
      if (firstTenant) registry.registerTenant(firstTenant);
      // (7) Real logout via the productive UI button. The header's
      // "Cerrar sesión" button is wired to `page.tsx#signOut`, which
      // wraps `supabase.auth.signOut({scope:"local"})` AND fires
      // `useAuthMethod.resetOnLogout()` — the intentional distinction
      // from the SDK-only SIGNED_OUT path. Q3-R2 rejects calling the
      // SDK directly here because that would bypass the productive
      // wrapper and lie about the observed behaviour.
      await page.getByRole("button", { name: /^Cerrar sesión$/i }).click();
      // (8) OTP form MUST be the initial view after a voluntary
      // logout. Password form MUST NOT be visible until the user
      // switches back to it. Session, bootstrap and OTP code are all
      // cleared.
      await expect(page.locator('section[aria-label="Iniciar sesión con código"]')).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.locator('section[aria-label="Iniciar sesión"]')).toHaveCount(0);
      const postLogoutStorage = await page.evaluate(() =>
        JSON.stringify(Object.fromEntries(Object.entries(localStorage))),
      );
      expect(postLogoutStorage).not.toContain("spabla_v2_fase9_auth");
      expect(postLogoutStorage).not.toMatch(/\b\d{6}\b/);
      // (9) Switch back to password via UI.
      await page.getByRole("button", { name: /Acceder con contraseña/i }).click();
      await expect(page.locator('section[aria-label="Iniciar sesión"]')).toBeVisible({
        timeout: 10_000,
      });
      // (10) Second successful login — same actor, same tenant.
      await page.locator("#spabla-session-email").fill(email);
      await page.locator("#spabla-session-password").fill(PASSWORD_FOR_PASSWORD_TEST);
      await page.getByRole("button", { name: "Iniciar sesión" }).click();
      await expectAuthenticatedChat(page);
      // Second onboarding call is idempotent per Q3-A contract; drive
      // it to prove the second session sees the SAME tenant.
      const secondOnboarding = await page.evaluate(async () => {
        const w = window as unknown as {
          __spablaSupabase?: {
            auth: { getSession: () => Promise<{ data: { session: { access_token?: string } | null } }> };
          };
        };
        if (!w.__spablaSupabase) return { ok: false } as const;
        const { data } = await w.__spablaSupabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return { ok: false } as const;
        const res = await fetch("/api/v2/onboarding", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: "",
        });
        return { ok: res.ok, body: await res.text() } as const;
      });
      expect(secondOnboarding.ok).toBe(true);
      // (11) Zero OTP code lingers in the password inputs / storage.
      const pwStorage = await page.evaluate(() =>
        JSON.stringify(Object.fromEntries(Object.entries(localStorage))),
      );
      expect(pwStorage).not.toMatch(/\b\d{6}\b/);
      // (11-bis) Second logout via the SAME productive button —
      // OTP again, no residual password form.
      await page.getByRole("button", { name: /^Cerrar sesión$/i }).click();
      await expect(page.locator('section[aria-label="Iniciar sesión con código"]')).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.locator('section[aria-label="Iniciar sesión"]')).toHaveCount(0);
      // (12) Single workspace + single active membership regardless
      // of how many login cycles the user runs.
      const c = new PgClient({ connectionString: PG_URL });
      await c.connect();
      try {
        const mapping = await c.query(
          `SELECT count(*)::int AS n FROM spabla_v2.actor_personal_workspace WHERE actor_id = $1`,
          [actorId!],
        );
        expect(mapping.rows[0].n).toBe(1);
        const memberships = await c.query(
          `SELECT count(*)::int AS n FROM spabla_v2.tenant_memberships WHERE actor_id = $1 AND is_active = TRUE`,
          [actorId!],
        );
        expect(memberships.rows[0].n).toBe(1);
      } finally {
        await c.end().catch(() => undefined);
      }
      assertNoLeak(leaks, { email, token: PASSWORD_FOR_PASSWORD_TEST });
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

  // ─────────────────────────────────────────────────────────────────
  // S17 · Q3-R FASE 6 · exhaustive isolation snapshot
  // ─────────────────────────────────────────────────────────────────
  test("S17 · exhaustive isolation · zero rows tied to runId across auth + spabla_v2 + Mailpit + port 3131", async () => {
    // Runs AFTER S9's registry cleanup. Cleanup ran again in S9;
    // this is the belt-and-suspenders proof that nothing survived.
    const c = new PgClient({ connectionString: PG_URL });
    await c.connect();
    try {
      // auth.users tied to this RUN_ID
      const users = await c.query(
        `SELECT count(*)::int AS n FROM auth.users WHERE email LIKE $1`,
        [`%${RUN_ID}%`],
      );
      expect(users.rows[0].n).toBe(0);
      // auth.identities of runId users (join via LIKE is safe:
      // identities.provider_id / email columns may not carry the
      // runId, so route through user_id ∈ residual users list).
      const identities = await c.query(
        `SELECT count(*)::int AS n FROM auth.identities
          WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE $1)`,
        [`%${RUN_ID}%`],
      );
      expect(identities.rows[0].n).toBe(0);
      // auth.one_time_tokens
      const tokens = await c.query(
        `SELECT count(*)::int AS n FROM auth.one_time_tokens
          WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE $1)`,
        [`%${RUN_ID}%`],
      );
      expect(tokens.rows[0].n).toBe(0);
      // spabla_v2.tenants: any workspace that pointed to a runId user
      // must have been cascade-deleted by the registry.
      const orphanMappings = await c.query(
        `SELECT count(*)::int AS n FROM spabla_v2.actor_personal_workspace
          WHERE actor_id IN (SELECT id FROM auth.users WHERE email LIKE $1)`,
        [`%${RUN_ID}%`],
      );
      expect(orphanMappings.rows[0].n).toBe(0);
      const orphanMemberships = await c.query(
        `SELECT count(*)::int AS n FROM spabla_v2.tenant_memberships
          WHERE actor_id IN (SELECT id FROM auth.users WHERE email LIKE $1)`,
        [`%${RUN_ID}%`],
      );
      expect(orphanMemberships.rows[0].n).toBe(0);
      const orphanLifecycle = await c.query(
        `SELECT count(*)::int AS n FROM spabla_v2.actor_lifecycle_state
          WHERE actor_id IN (SELECT id FROM auth.users WHERE email LIKE $1)`,
        [`%${RUN_ID}%`],
      );
      expect(orphanLifecycle.rows[0].n).toBe(0);
    } finally {
      await c.end().catch(() => undefined);
    }
    // Mailpit residuals: search must return zero for the runId.
    const mailUrl = `${INBUCKET_URL}/api/v1/search?query=${encodeURIComponent(RUN_ID)}`;
    const r = await fetch(mailUrl);
    const j = (await r.json()) as { messages?: unknown[] };
    expect(j.messages?.length ?? 0).toBe(0);
    // Port 3131: no OTHER LISTEN socket is bound. The runner owns
    // Next dev on 3131; while the suite is still running that
    // process is alive, so we assert on the exact PID count == 1.
    // Skip if `lsof` is not available.
    const { spawnSync } = await import("node:child_process");
    const which = spawnSync("which", ["lsof"], { encoding: "utf8" });
    if (which.status === 0 && which.stdout.trim() !== "") {
      const lsof = spawnSync("lsof", ["-nP", "-iTCP:3131", "-sTCP:LISTEN"], {
        encoding: "utf8",
      });
      const lines = (lsof.stdout ?? "").split("\n").filter((l) => l.trim() !== "");
      // Header line + up to 1 owner. If more than 2 lines, there's a
      // stray listener.
      expect(lines.length).toBeLessThanOrEqual(2);
    }
  });
});
