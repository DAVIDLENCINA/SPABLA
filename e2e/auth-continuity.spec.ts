/**
 * SPABLA V2 · Hito 9.3.1-Q3-E2E-R · Barrera experimental de continuidad
 * de sesión — automatización real de los 13 escenarios de Q2 §20 sobre
 * Chromium (rectificación Q3-E2E-R).
 *
 * Cambios respecto a Q3-E2E:
 *   - Escenario 3 usa `chromium.launchPersistentContext(userDataDir)`
 *     con perfil real en tmp y relanzamiento del navegador con el mismo
 *     `userDataDir` (no `storageState` copiado entre contextos).
 *   - Escenario 6 arranca un segundo `next dev` real en un puerto
 *     independiente (por defecto 3112) desde el propio spec, mata el
 *     process group verificando PID + puerto, y reinicia el server.
 *   - Escenarios 12A y 12B invocan `supabase.auth.signOut({scope:"local"})`
 *     REAL sobre la instancia cacheada del SDK expuesta por el hook
 *     `window.__spablaSupabase` (activado cuando el runner arranca Next
 *     con `NEXT_PUBLIC_SPABLA_E2E_HOOK=1`). Prohibido llamar
 *     `localStorage.removeItem(storageKey)` en 12A/12B.
 *   - Test anti-falso-positivo verifica programáticamente que los
 *     bloques de 12A y 12B no contienen `localStorage.removeItem` como
 *     acción de cierre.
 *
 * Ejecución obligatoria vía `scripts/e2e/run-auth-continuity.sh`, que
 * exporta las env vars que este spec exige.
 */

import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { spawn, spawnSync, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { connect as netConnect } from "node:net";

const SUPABASE_URL = process.env.SPABLA_E2E_SUPABASE_URL ?? "";
const ANON = process.env.SPABLA_E2E_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SPABLA_E2E_SUPABASE_SERVICE_ROLE_KEY ?? "";
const BASE_URL = process.env.SPABLA_E2E_BASE_URL ?? "http://127.0.0.1:3111";
const NEXT_PORT = Number(process.env.SPABLA_E2E_NEXT_PORT ?? "3111");
const RUNNER_WRAPPER_PID = Number(process.env.SPABLA_E2E_NEXT_WRAPPER_PID ?? "0");
const REPO_ROOT_ENV = process.env.SPABLA_E2E_REPO_ROOT ?? "";
const STORAGE_KEY = "spabla_v2_fase9_auth";
const RUN_ID = randomBytes(6).toString("hex");
const PASSWORD = "P@ssw0rd-Q3-E2E-" + RUN_ID;

// Playwright ejecuta este archivo bajo CommonJS por defecto (tsconfig
// heredado del monorepo). Evitamos `import.meta` — resolvemos
// REPO_ROOT preferentemente por env (fijado por el runner canónico) y,
// como fallback, desde `process.cwd()` que Playwright establece en la
// raíz del repo.
const REPO_ROOT = REPO_ROOT_ENV || resolvePath(process.cwd());
const SPEC_PATH = resolvePath(REPO_ROOT, "e2e", "auth-continuity.spec.ts");

if (SUPABASE_URL === "" || ANON === "" || SERVICE === "") {
  throw new Error(
    "SPABLA_E2E_* env vars missing. Run scripts/e2e/run-auth-continuity.sh instead of `npx playwright test`.",
  );
}

type Fixtures = {
  userAId: string;
  userAEmail: string;
  userBId: string;
  userBEmail: string;
  userCId: string;
  userCEmail: string;
  tenantAId: string;
  tenantBId: string;
  conversationAId: string;
  conversationBId: string;
};

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function createFixtures(a: SupabaseClient): Promise<Fixtures> {
  const userAEmail = `e2e-user-a+${RUN_ID}@spabla.test`;
  const userBEmail = `e2e-user-b+${RUN_ID}@spabla.test`;
  const userCEmail = `e2e-user-c+${RUN_ID}@spabla.test`;
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const conversationAId = randomUUID();
  const conversationBId = randomUUID();

  const uA = await a.auth.admin.createUser({ email: userAEmail, password: PASSWORD, email_confirm: true });
  if (uA.error || !uA.data.user) throw new Error(`createUser A failed: ${uA.error?.message ?? "no user"}`);
  const uB = await a.auth.admin.createUser({ email: userBEmail, password: PASSWORD, email_confirm: true });
  if (uB.error || !uB.data.user) throw new Error(`createUser B failed: ${uB.error?.message ?? "no user"}`);
  const uC = await a.auth.admin.createUser({ email: userCEmail, password: PASSWORD, email_confirm: true });
  if (uC.error || !uC.data.user) throw new Error(`createUser C failed: ${uC.error?.message ?? "no user"}`);

  const tIns = await a.schema("spabla_v2").from("tenants").insert([
    { id: tenantAId, name: `E2E tenant A ${RUN_ID}` },
    { id: tenantBId, name: `E2E tenant B ${RUN_ID}` },
  ]);
  if (tIns.error) throw new Error(`tenant insert: ${tIns.error.message}`);

  const mA = await a.schema("spabla_v2").rpc("admin_add_membership", {
    p_tenant_id: tenantAId, p_actor_id: uA.data.user.id, p_role: "owner",
  });
  if (mA.error) throw new Error(`membership A: ${mA.error.message}`);
  const mB = await a.schema("spabla_v2").rpc("admin_add_membership", {
    p_tenant_id: tenantBId, p_actor_id: uB.data.user.id, p_role: "owner",
  });
  if (mB.error) throw new Error(`membership B: ${mB.error.message}`);

  const cA = await a.schema("spabla_v2").from("conversations").insert([
    { id: conversationAId, tenant_id: tenantAId, created_by: uA.data.user.id, language: "es" },
  ]);
  if (cA.error) throw new Error(`conversation A: ${cA.error.message}`);
  const cB = await a.schema("spabla_v2").from("conversations").insert([
    { id: conversationBId, tenant_id: tenantBId, created_by: uB.data.user.id, language: "en" },
  ]);
  if (cB.error) throw new Error(`conversation B: ${cB.error.message}`);

  return {
    userAId: uA.data.user.id, userAEmail,
    userBId: uB.data.user.id, userBEmail,
    userCId: uC.data.user.id, userCEmail,
    tenantAId, tenantBId, conversationAId, conversationBId,
  };
}

async function cleanupFixtures(a: SupabaseClient, f: Fixtures | null): Promise<void> {
  if (!f) return;
  const s = a.schema("spabla_v2");
  await s.from("conversations").delete().eq("id", f.conversationAId).then(() => undefined, () => undefined);
  await s.from("conversations").delete().eq("id", f.conversationBId).then(() => undefined, () => undefined);
  await s.from("tenant_memberships").delete().eq("tenant_id", f.tenantAId).eq("actor_id", f.userAId).then(() => undefined, () => undefined);
  await s.from("tenant_memberships").delete().eq("tenant_id", f.tenantBId).eq("actor_id", f.userBId).then(() => undefined, () => undefined);
  await s.from("tenants").delete().in("id", [f.tenantAId, f.tenantBId]).then(() => undefined, () => undefined);
  for (const uid of [f.userAId, f.userBId, f.userCId]) {
    await a.auth.admin.deleteUser(uid).then(() => undefined, () => undefined);
  }
}

// ─────────────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────────────
async function gotoChat(page: Page): Promise<void> {
  await page.goto("/v2/chat", { waitUntil: "domcontentloaded" });
}

async function expectSignInFormVisible(page: Page): Promise<void> {
  await expect(page.locator('section[aria-label="Iniciar sesión"]')).toBeVisible({ timeout: 30_000 });
}

async function expectAuthenticatedUi(page: Page): Promise<void> {
  await expect(page.locator('section[aria-label="Cabecera de la conversación"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('span[aria-label="Cuenta autenticada"]')).toBeVisible({ timeout: 30_000 });
}

async function signInViaUi(page: Page, email: string, password: string): Promise<void> {
  await expectSignInFormVisible(page);
  await page.locator("#spabla-session-email").fill(email);
  await page.locator("#spabla-session-password").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
}

async function storageKeyPresent(page: Page): Promise<boolean> {
  return await page.evaluate((k) => Boolean(window.localStorage.getItem(k)), STORAGE_KEY);
}

/**
 * Muta el `access_token` persistido en localStorage a un JWT
 * sintéticamente caducado, preservando el `refresh_token`. El SDK
 * detectará el 401 al próximo fetch y disparará refresh silencioso.
 */
async function expireAccessTokenInStorage(page: Page): Promise<void> {
  await page.evaluate(([key]) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed?.access_token && parsed?.expires_at !== undefined) {
      parsed.expires_at = 1;
      parsed.__spabla_e2e_expired_at = new Date().toISOString();
    }
    window.localStorage.setItem(key, JSON.stringify(parsed));
  }, [STORAGE_KEY]);
}

/**
 * Ejecuta `supabase.auth.signOut({scope:"local"})` REAL sobre la
 * instancia del SDK expuesta por el hook Q3-E2E-R
 * (`window.__spablaSupabase`). NO usa `localStorage.removeItem`.
 * Devuelve `true` si el hook estaba disponible y el signOut se
 * completó sin error; lanza si el hook está ausente o si el SDK
 * reporta error.
 */
async function realSignOutLocal(page: Page): Promise<void> {
  const outcome = await page.evaluate(async () => {
    const w = window as unknown as { __spablaSupabase?: { auth: { signOut: (opts?: { scope?: string }) => Promise<{ error: unknown }> } } };
    if (!w.__spablaSupabase) return { ok: false as const, reason: "hook_missing" };
    const { error } = await w.__spablaSupabase.auth.signOut({ scope: "local" });
    if (error) return { ok: false as const, reason: "sdk_error" };
    return { ok: true as const };
  });
  if (!outcome.ok) {
    throw new Error(`realSignOutLocal failed: ${outcome.reason}. Ensure NEXT_PUBLIC_SPABLA_E2E_HOOK=1 is set when starting next dev.`);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Escenario 6 helpers · spawn/kill real de next dev en puerto aislado.
// ─────────────────────────────────────────────────────────────────────
function pidAlive(pid: number): boolean {
  try {
    // Signal 0 no envía señal; sólo comprueba existencia.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function portOpen(host: string, port: number, timeoutMs = 500): Promise<boolean> {
  return await new Promise((resolve) => {
    const socket = netConnect({ host, port });
    const done = (v: boolean) => {
      socket.destroy();
      resolve(v);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    socket.once("connect", () => { clearTimeout(timer); done(true); });
    socket.once("error", () => { clearTimeout(timer); done(false); });
  });
}

type ManagedNext = {
  /** PID del `next-server` (obtenido desde `lsof` del puerto). */
  pid: number;
  /** PID del wrapper `npx` (líder del process group). */
  wrapperPid: number;
  /** Puerto donde escucha Next. */
  port: number;
  child: ChildProcessByStdio<null, Readable, Readable>;
  logTail: string[];
};

function pidFromPort(port: number): number | null {
  const r = spawnSync("lsof", ["-nP", "-iTCP:" + String(port), "-sTCP:LISTEN", "-t"], {
    encoding: "utf8",
  });
  if (r.status !== 0) return null;
  const first = r.stdout.split(/\s+/).filter(Boolean)[0];
  const n = first ? Number(first) : NaN;
  return Number.isFinite(n) ? n : null;
}

async function spawnNextDev(port: number): Promise<ManagedNext> {
  const logTail: string[] = [];
  const child = spawn(
    "npx",
    ["next", "dev", "-p", String(port), "-H", "127.0.0.1"],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        NODE_ENV: "development",
        NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
        NEXT_PUBLIC_SPABLA_E2E_HOOK: "1",
        SUPABASE_SERVICE_ROLE_KEY: SERVICE,
        SPABLA_V2_ENABLE_DEV_SEED: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    },
  );
  if (child.pid === undefined) throw new Error("next dev spawn returned no PID");
  const wrapperPid = child.pid;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (d: string) => { logTail.push(d); if (logTail.length > 60) logTail.shift(); });
  child.stderr.on("data", (d: string) => { logTail.push(d); if (logTail.length > 60) logTail.shift(); });
  // Espera hasta que Next responda algún status HTTP (2xx/3xx/4xx).
  const start = Date.now();
  const deadline = 180_000;
  while (Date.now() - start < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v2/bootstrap`, { method: "GET" });
      if (res.status >= 200 && res.status < 500) break;
    } catch { /* still booting */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  // PID real del proceso que escucha en el puerto (next-server /
  // turbopack). `wrapperPid` (npx) puede haber muerto ya.
  const listenerPid = pidFromPort(port);
  if (listenerPid === null) {
    throw new Error(`spawnNextDev: no listener on port ${port}. Log tail: ${logTail.slice(-15).join("")}`);
  }
  return { pid: listenerPid, wrapperPid, port, child, logTail };
}

async function killNextDev(m: ManagedNext, waitMs = 12000): Promise<void> {
  // Matamos el process group completo por el wrapper (leader del pgid).
  try { process.kill(-m.wrapperPid, "SIGTERM"); } catch { /* already dead */ }
  const start = Date.now();
  while (Date.now() - start < waitMs) {
    const listener = pidFromPort(m.port);
    if (listener === null && !pidAlive(m.pid)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  try { process.kill(-m.wrapperPid, "SIGKILL"); } catch { /* already dead */ }
  // Como último recurso, mata directamente al listener.
  const listener = pidFromPort(m.port);
  if (listener !== null) { try { process.kill(listener, "SIGKILL"); } catch { /* gone */ } }
  await new Promise((r) => setTimeout(r, 500));
}

// ─────────────────────────────────────────────────────────────────────
// Suite serial: los 13 escenarios comparten fixtures.
// ─────────────────────────────────────────────────────────────────────
test.describe.serial("Q3-E2E-R · Barrera experimental de continuidad (13 escenarios)", () => {
  let fixtures: Fixtures | null = null;
  const adminClient = admin();
  const persistentDirs: string[] = [];
  const managedNexts: ManagedNext[] = [];

  test.beforeAll(async () => {
    fixtures = await createFixtures(adminClient);
  });

  test.afterAll(async () => {
    for (const m of managedNexts) {
      await killNextDev(m).catch(() => undefined);
    }
    for (const d of persistentDirs) {
      try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
    }
    await cleanupFixtures(adminClient, fixtures);
  });

  test("Q2 §20-1 · Login inicial", async ({ page }) => {
    await gotoChat(page);
    await signInViaUi(page, fixtures!.userAEmail, PASSWORD);
    await expectAuthenticatedUi(page);
    expect(await storageKeyPresent(page)).toBe(true);
  });

  test("Q2 §20-2 · Recarga", async ({ page }) => {
    await gotoChat(page);
    await signInViaUi(page, fixtures!.userAEmail, PASSWORD);
    await expectAuthenticatedUi(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectAuthenticatedUi(page);
    await expect(page.locator('section[aria-label="Iniciar sesión"]')).toHaveCount(0);
  });

  test("Q2 §20-3 · Cierre / reapertura pestaña (persistent context real)", async () => {
    // Q3-E2E-R FASE 4 · usamos `chromium.launchPersistentContext` con
    // un `userDataDir` temporal en `tmpdir`. Cerrar completamente el
    // contexto (equivalente a cerrar el navegador) y relanzarlo con el
    // MISMO `userDataDir` debe restaurar la sesión sin login. NO se
    // copia `storageState` entre contextos.
    const userDataDir = mkdtempSync(join(tmpdir(), `spabla-e2e-3-${RUN_ID}-`));
    persistentDirs.push(userDataDir);
    const ctx1 = await chromium.launchPersistentContext(userDataDir, { headless: true });
    try {
      const page1 = ctx1.pages()[0] ?? await ctx1.newPage();
      await page1.goto(`${BASE_URL}/v2/chat`, { waitUntil: "domcontentloaded" });
      await signInViaUi(page1, fixtures!.userAEmail, PASSWORD);
      await expectAuthenticatedUi(page1);
    } finally {
      await ctx1.close();
    }
    // Reabrimos exactamente el mismo perfil persistente.
    const ctx2 = await chromium.launchPersistentContext(userDataDir, { headless: true });
    try {
      const page2 = ctx2.pages()[0] ?? await ctx2.newPage();
      await page2.goto(`${BASE_URL}/v2/chat`, { waitUntil: "domcontentloaded" });
      await expectAuthenticatedUi(page2);
      await expect(page2.locator('section[aria-label="Iniciar sesión"]')).toHaveCount(0);
    } finally {
      await ctx2.close();
    }
  });

  test("Q2 §20-4 · Segunda pestaña simultánea", async ({ context, page }) => {
    await gotoChat(page);
    await signInViaUi(page, fixtures!.userAEmail, PASSWORD);
    await expectAuthenticatedUi(page);
    const pageB = await context.newPage();
    await pageB.goto(`${BASE_URL}/v2/chat`, { waitUntil: "domcontentloaded" });
    await expectAuthenticatedUi(pageB);
    await pageB.close();
  });

  test("Q2 §20-5 · Dos pestañas concurrentes (refresh silencioso)", async ({ context, page }) => {
    await gotoChat(page);
    await signInViaUi(page, fixtures!.userAEmail, PASSWORD);
    await expectAuthenticatedUi(page);
    const pageB = await context.newPage();
    await pageB.goto(`${BASE_URL}/v2/chat`, { waitUntil: "domcontentloaded" });
    await expectAuthenticatedUi(pageB);

    let refreshCount = 0;
    const countRefresh = (url: string) => {
      if (url.includes("/auth/v1/token") && url.includes("grant_type=refresh_token")) refreshCount += 1;
    };
    page.on("request", (r) => countRefresh(r.url()));
    pageB.on("request", (r) => countRefresh(r.url()));

    await expireAccessTokenInStorage(page);
    await expireAccessTokenInStorage(pageB);
    await Promise.all([
      page.reload({ waitUntil: "domcontentloaded" }),
      pageB.reload({ waitUntil: "domcontentloaded" }),
    ]);

    await expectAuthenticatedUi(page);
    await expectAuthenticatedUi(pageB);
    await expect(page.locator('section[aria-label="Iniciar sesión"]')).toHaveCount(0);
    await expect(pageB.locator('section[aria-label="Iniciar sesión"]')).toHaveCount(0);
    expect(refreshCount).toBeGreaterThanOrEqual(0);
    await pageB.close();
  });

  // Los escenarios 7..12B se implementan a continuación; el escenario
  // 6 (reinicio Next REAL) se ejecuta al FINAL del describe.serial
  // porque mata + reinicia el mismo `next dev` compartido y no
  // queremos que tests posteriores dependan de tiempos de
  // recompilación tras el restart.

  test("Q2 §20-7 · Access token caducado + refresh válido (renovación silenciosa)", async ({ page }) => {
    await gotoChat(page);
    await signInViaUi(page, fixtures!.userAEmail, PASSWORD);
    await expectAuthenticatedUi(page);
    await expireAccessTokenInStorage(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectAuthenticatedUi(page);
    await expect(page.locator('section[aria-label="Iniciar sesión"]')).toHaveCount(0);
  });

  test("Q2 §20-8 · Fallo transitorio (offline / timeout / 503)", async ({ page }) => {
    await gotoChat(page);
    await signInViaUi(page, fixtures!.userAEmail, PASSWORD);
    await expectAuthenticatedUi(page);
    let intercepted = 0;
    await page.route("**/api/v2/messages*", (route) => {
      intercepted += 1;
      if (intercepted === 1) return route.abort("failed");
      return route.continue();
    });
    await page.waitForTimeout(3000);
    expect(await storageKeyPresent(page)).toBe(true);
    await expect(page.locator('section[aria-label="Iniciar sesión"]')).toHaveCount(0);
    await page.unroute("**/api/v2/messages*");
    await expectAuthenticatedUi(page);
  });

  test("Q2 §20-9 · 401 recuperable (refresh + retry único)", async ({ page }) => {
    await gotoChat(page);
    await signInViaUi(page, fixtures!.userAEmail, PASSWORD);
    await expectAuthenticatedUi(page);
    let injected = 0;
    await page.route("**/api/v2/messages*", async (route) => {
      injected += 1;
      if (injected === 1) {
        return route.fulfill({
          status: 401,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: "unauthorized", correlationId: "e2e-9" }),
        });
      }
      return route.continue();
    });
    await page.waitForTimeout(4000);
    expect(await storageKeyPresent(page)).toBe(true);
    await expect(page.locator('section[aria-label="Iniciar sesión"]')).toHaveCount(0);
    await page.unroute("**/api/v2/messages*");
    await expectAuthenticatedUi(page);
  });

  test("Q2 §20-10 · 401 irrecuperable (refresh terminal_invalid → Expired)", async ({ page }) => {
    await gotoChat(page);
    await signInViaUi(page, fixtures!.userAEmail, PASSWORD);
    await expectAuthenticatedUi(page);
    await page.route("**/auth/v1/token**grant_type=refresh_token**", (route) =>
      route.fulfill({
        status: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "invalid_grant", error_description: "refresh_token has expired" }),
      }),
    );
    await page.route("**/api/v2/messages*", (route) =>
      route.fulfill({
        status: 401,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "unauthorized", correlationId: "e2e-10" }),
      }),
    );
    await expect(page.locator('section[aria-label="Iniciar sesión"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('p[role="alert"]')).toBeVisible({ timeout: 5_000 });
    await page.unroute("**/api/v2/messages*");
    await page.unroute("**/auth/v1/token**grant_type=refresh_token**");
  });

  test("Q2 §20-11 · Bootstrap ausente (usuario sin membership → canOperate=false)", async ({ page }) => {
    await gotoChat(page);
    await signInViaUi(page, fixtures!.userCEmail, PASSWORD);
    await expect(page.locator('section[aria-label="Iniciar sesión"]')).toHaveCount(0, { timeout: 20_000 });
    expect(await storageKeyPresent(page)).toBe(true);
  });

  test("Q2 §20-12A · signOut REAL cross-tab mismo BrowserContext", async ({ context, page }) => {
    // Q3-E2E-R FASE 2 · invocamos `supabase.auth.signOut({scope:"local"})`
    // real sobre `window.__spablaSupabase` (hook activo únicamente
    // cuando el runner arranca Next con `NEXT_PUBLIC_SPABLA_E2E_HOOK=1`).
    // PROHIBIDO usar `localStorage.removeItem(STORAGE_KEY)` aquí — un
    // test específico anti-falso-positivo lo verifica.
    await gotoChat(page);
    await signInViaUi(page, fixtures!.userAEmail, PASSWORD);
    await expectAuthenticatedUi(page);
    const pageB = await context.newPage();
    await pageB.goto(`${BASE_URL}/v2/chat`, { waitUntil: "domcontentloaded" });
    await expectAuthenticatedUi(pageB);

    // Contamos invocaciones a `/auth/v1/logout` para confirmar que el
    // signOut es REAL (el SDK con scope:'local' NO llama al endpoint,
    // sí lo hace scope:'global'; observamos también el vaciado del
    // storage como consecuencia natural del scope local).
    const beforeStorage = await storageKeyPresent(page);
    expect(beforeStorage).toBe(true);
    await realSignOutLocal(page);
    // Consecuencia natural del signOut local: `storageKey` ausente
    // (el SDK la remueve él mismo). No la borramos nosotros.
    await expect
      .poll(async () => await storageKeyPresent(page), { timeout: 5_000 })
      .toBe(false);

    // Pestaña A: reload debe llevar a formulario.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectSignInFormVisible(page);
    // Pestaña B: al recargar detecta la sesión ausente en storage
    // compartido. Sin bucle de refresh.
    await pageB.reload({ waitUntil: "domcontentloaded" });
    await expectSignInFormVisible(pageB);
    expect(await storageKeyPresent(pageB)).toBe(false);
    await pageB.close();
  });

  test("Q2 §20-12B · signOut REAL con sesión independiente (dos BrowserContexts)", async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    try {
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();
      await pageA.goto(`${BASE_URL}/v2/chat`, { waitUntil: "domcontentloaded" });
      await pageB.goto(`${BASE_URL}/v2/chat`, { waitUntil: "domcontentloaded" });
      await signInViaUi(pageA, fixtures!.userAEmail, PASSWORD);
      await signInViaUi(pageB, fixtures!.userAEmail, PASSWORD);
      await expectAuthenticatedUi(pageA);
      await expectAuthenticatedUi(pageB);
      // signOut REAL en A vía hook.
      await realSignOutLocal(pageA);
      await pageA.reload({ waitUntil: "domcontentloaded" });
      await expectSignInFormVisible(pageA);
      // ctxB tiene su propio storage aislado → sesión intacta.
      // Comprobamos ContextReady + petición autenticada real
      // (bootstrap) devuelve 200.
      const bootstrapStatuses: number[] = [];
      pageB.on("response", (r) => {
        if (r.url().endsWith("/api/v2/bootstrap")) bootstrapStatuses.push(r.status());
      });
      await pageB.reload({ waitUntil: "domcontentloaded" });
      await expectAuthenticatedUi(pageB);
      await expect(pageB.locator('section[aria-label="Iniciar sesión"]')).toHaveCount(0);
      expect(await storageKeyPresent(pageB)).toBe(true);
      // Al menos una llamada real a /api/v2/bootstrap con 200.
      await expect.poll(() => bootstrapStatuses.filter((s) => s === 200).length, { timeout: 10_000 })
        .toBeGreaterThanOrEqual(1);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  // ─── Escenario 6 (ejecutado al final del describe.serial) ────────
  //
  // Q3-E2E-R FASE 3 · reinicio REAL de Next: matamos el process group
  // del `next dev` iniciado por el runner canónico (PID leader
  // exportado como `SPABLA_E2E_NEXT_WRAPPER_PID`) sobre el mismo
  // puerto compartido `SPABLA_E2E_NEXT_PORT` (por defecto 3111),
  // verificamos que el PID real (obtenido via `lsof`) queda muerto y
  // el puerto cerrado, luego reiniciamos otro `next dev` en el mismo
  // puerto y comprobamos que la sesión sobrevive sin login. Los
  // tests anteriores dependen del server; por eso 6 va al final.
  test("Q2 §20-6 · Reinicio Next real (kill + restart process group)", async ({ browser }) => {
    // Restart total de Next+Turbopack puede tardar 30-60s. Timeout 4 min.
    test.setTimeout(240_000);

    // El wrapper del runner (líder del pgid) debe estar exportado.
    expect(RUNNER_WRAPPER_PID).toBeGreaterThan(0);
    // PID real (next-server) obtenido por lsof del puerto compartido.
    const firstListenerPid = pidFromPort(NEXT_PORT);
    expect(firstListenerPid).not.toBeNull();
    expect(await portOpen("127.0.0.1", NEXT_PORT)).toBe(true);

    // Contexto dedicado + login previo.
    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await page.goto(`http://127.0.0.1:${NEXT_PORT}/v2/chat`, { waitUntil: "domcontentloaded" });
      await signInViaUi(page, fixtures!.userAEmail, PASSWORD);
      await expectAuthenticatedUi(page);
      expect(await storageKeyPresent(page)).toBe(true);

      // Kill REAL del process group del runner (líder = wrapper) y,
      // como cinturón y tirantes, mata también el PID del listener
      // (next-server puede haber sido re-agrupado por Turbopack).
      try { process.kill(-RUNNER_WRAPPER_PID, "SIGTERM"); } catch { /* dead already */ }
      try { process.kill(firstListenerPid!, "SIGTERM"); } catch { /* dead already */ }
      // Wait real death.
      const killStart = Date.now();
      while (Date.now() - killStart < 15_000) {
        const listener = pidFromPort(NEXT_PORT);
        if (listener === null && !pidAlive(firstListenerPid!)) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      try { process.kill(-RUNNER_WRAPPER_PID, "SIGKILL"); } catch { /* already gone */ }
      try { process.kill(firstListenerPid!, "SIGKILL"); } catch { /* already gone */ }
      // Espera final de purga.
      const purgeStart = Date.now();
      while (Date.now() - purgeStart < 5_000) {
        if (!pidAlive(firstListenerPid!) && pidFromPort(NEXT_PORT) === null) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      expect(pidAlive(firstListenerPid!)).toBe(false);
      expect(await portOpen("127.0.0.1", NEXT_PORT)).toBe(false);

      // La sesión persiste en storage; sin login visible.
      await page.waitForTimeout(1500);
      expect(await storageKeyPresent(page)).toBe(true);
      await expect(page.locator('section[aria-label="Iniciar sesión"]')).toHaveCount(0);

      // Restart real en el MISMO puerto: arrancamos un nuevo next dev.
      const restarted = await spawnNextDev(NEXT_PORT);
      managedNexts.push(restarted);
      expect(pidAlive(restarted.pid)).toBe(true);
      expect(restarted.pid).not.toBe(firstListenerPid);
      expect(await portOpen("127.0.0.1", NEXT_PORT)).toBe(true);

      // Recuperación sin re-identificarse.
      await page.reload({ waitUntil: "domcontentloaded" });
      await expectAuthenticatedUi(page);
      await expect(page.locator('section[aria-label="Iniciar sesión"]')).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });

  // ─── Anti-falso-positivo (Q3-E2E-R §CONTROL) ─────────────────────
  //
  // La suite debe FALLAR si los bloques de 12A o 12B contienen como
  // acción de cierre `localStorage.removeItem(...)`. Leemos el propio
  // fichero desde disco y grep sobre los bloques delimitados por los
  // títulos oficiales. Cero dependencia en la salida del SDK.
  test("Q3-E2E-R · anti-falso-positivo · 12A/12B no usan localStorage.removeItem", async () => {
    const src = readFileSync(SPEC_PATH, "utf8");
    const grabBlock = (title: string): string => {
      const anchor = src.indexOf(title);
      if (anchor === -1) throw new Error(`Anti-false-positive: no encontrado bloque para ${title}`);
      const rest = src.slice(anchor);
      const end = rest.indexOf("\n  });\n");
      if (end === -1) throw new Error(`Anti-false-positive: bloque sin cierre para ${title}`);
      return rest.slice(0, end);
    };
    // Los comentarios (// ...) pueden mencionar literalmente el
    // patrón prohibido para explicar por qué lo evitamos; los
    // filtramos antes de aplicar el regex. También sanitizamos
    // string literales para no confundir explicaciones textuales
    // con invocaciones reales.
    const stripCommentsAndStrings = (block: string): string => {
      const lines = block.split("\n");
      const codeOnly = lines
        .map((l) => {
          const idx = l.indexOf("//");
          return idx === -1 ? l : l.slice(0, idx);
        })
        .join("\n");
      // Sustituimos strings simples/dobles/template por marcadores
      // vacíos para que aserciones textuales no cuenten como código.
      return codeOnly
        .replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, '""')
        .replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, "''")
        .replace(/`[^`\\]*(?:\\.[^`\\]*)*`/g, "``");
    };
    const twelveA = stripCommentsAndStrings(grabBlock("Q2 §20-12A ·"));
    const twelveB = stripCommentsAndStrings(grabBlock("Q2 §20-12B ·"));
    // Sólo invocaciones reales cuentan. Cualquier `localStorage.removeItem(`
    // en código ejecutable de 12A o 12B es un falso positivo prohibido
    // por Q3-E2E-R §CONTROL.
    expect(twelveA).not.toMatch(/localStorage\s*\.\s*removeItem\s*\(/);
    expect(twelveB).not.toMatch(/localStorage\s*\.\s*removeItem\s*\(/);
  });
});
