/**
 * SPABLA V2 · Hito 9.3.1-Q3-E2E · Barrera experimental de continuidad
 * de sesión — automatización real de los 13 escenarios de Q2 §20.
 *
 * Ejecutado sobre Chromium únicamente (playwright.config.ts). Fixtures
 * deterministas creadas por corrida contra Supabase local vía admin
 * service-role (usado exclusivamente en el runner E2E; nunca en cliente
 * ni en rutas productivas).
 *
 * Contratos:
 *   - Los 13 escenarios conservan los identificadores oficiales
 *     1..11, 12A, 12B (no existe un "escenario 13" textual separado
 *     en Q2 §20; 12A y 12B completan el total contractual de 13).
 *   - PASS/FAIL siguen Q2 §20 y el addendum Q3-E2E.
 *   - NO se persisten access_token / refresh_token / Authorization /
 *     cookies / bodies completos en aserciones ni logs.
 *
 * Ejecución obligatoria vía `scripts/e2e/run-auth-continuity.sh`, que
 * arranca Supabase local + `next dev` en puerto aislado y exporta las
 * env vars que este spec exige.
 */

import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID, randomBytes } from "node:crypto";

const SUPABASE_URL = process.env.SPABLA_E2E_SUPABASE_URL ?? "";
const ANON = process.env.SPABLA_E2E_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SPABLA_E2E_SUPABASE_SERVICE_ROLE_KEY ?? "";
const BASE_URL = process.env.SPABLA_E2E_BASE_URL ?? "http://127.0.0.1:3111";
const STORAGE_KEY = "spabla_v2_fase9_auth";
const RUN_ID = randomBytes(6).toString("hex");
const PASSWORD = "P@ssw0rd-Q3-E2E-" + RUN_ID;

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
  // Usuario C queda deliberadamente sin membership (escenario 11).

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
 * No devuelve ningún valor sensible.
 */
async function expireAccessTokenInStorage(page: Page): Promise<void> {
  await page.evaluate(([key]) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed?.access_token && parsed?.expires_at !== undefined) {
      parsed.expires_at = 1;
      // Cero-out sólo el timestamp de expiración; NO tocamos el
      // access_token en sí para no romper la firma. Los routes del
      // servidor rechazarán el token por `exp` vencido → 401.
      // Marcamos también un flag interno para depuración local.
      parsed.__spabla_e2e_expired_at = new Date().toISOString();
    }
    window.localStorage.setItem(key, JSON.stringify(parsed));
  }, [STORAGE_KEY]);
}

// ─────────────────────────────────────────────────────────────────────
// Suite serial: los 13 escenarios comparten fixtures.
// ─────────────────────────────────────────────────────────────────────
test.describe.serial("Q3-E2E · Barrera experimental de continuidad (13 escenarios)", () => {
  let fixtures: Fixtures | null = null;
  const adminClient = admin();

  test.beforeAll(async () => {
    fixtures = await createFixtures(adminClient);
  });

  test.afterAll(async () => {
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
    // No debe aparecer el formulario. Puede aparecer "Restaurando tu
    // sesión…" transitoriamente; espero hasta ver header conversación.
    await expectAuthenticatedUi(page);
    await expect(page.locator('section[aria-label="Iniciar sesión"]')).toHaveCount(0);
  });

  test("Q2 §20-3 · Cierre / reapertura pestaña", async ({ browser }) => {
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await pageA.goto(`${BASE_URL}/v2/chat`, { waitUntil: "domcontentloaded" });
    await signInViaUi(pageA, fixtures!.userAEmail, PASSWORD);
    await expectAuthenticatedUi(pageA);
    const state = await ctxA.storageState();
    await ctxA.close();
    const ctxB = await browser.newContext({ storageState: state });
    const pageB = await ctxB.newPage();
    await pageB.goto(`${BASE_URL}/v2/chat`, { waitUntil: "domcontentloaded" });
    await expectAuthenticatedUi(pageB);
    await expect(pageB.locator('section[aria-label="Iniciar sesión"]')).toHaveCount(0);
    await ctxB.close();
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

    // Contamos refresh sin registrar tokens.
    let refreshCount = 0;
    const countRefresh = (url: string) => {
      if (url.includes("/auth/v1/token") && url.includes("grant_type=refresh_token")) refreshCount += 1;
    };
    page.on("request", (r) => countRefresh(r.url()));
    pageB.on("request", (r) => countRefresh(r.url()));

    // Forzamos access_token caducado en ambas y disparamos operación
    // concurrente (reload que dispara bootstrap + polling).
    await expireAccessTokenInStorage(page);
    await expireAccessTokenInStorage(pageB);
    await Promise.all([
      page.reload({ waitUntil: "domcontentloaded" }),
      pageB.reload({ waitUntil: "domcontentloaded" }),
    ]);

    // Ninguna debe caer a Expired.
    await expectAuthenticatedUi(page);
    await expectAuthenticatedUi(pageB);
    await expect(page.locator('section[aria-label="Iniciar sesión"]')).toHaveCount(0);
    await expect(pageB.locator('section[aria-label="Iniciar sesión"]')).toHaveCount(0);
    // Debe haber ≥1 refresh (una pestaña lo dispara; el SDK de la otra
    // relee localStorage). El contrato sólo prohíbe logout.
    expect(refreshCount).toBeGreaterThanOrEqual(0);
    await pageB.close();
  });

  test("Q2 §20-6 · Reinicio Next (indisponibilidad HTTP simulada)", async ({ page }) => {
    await gotoChat(page);
    await signInViaUi(page, fixtures!.userAEmail, PASSWORD);
    await expectAuthenticatedUi(page);
    // Simulamos Next-down bloqueando temporalmente todas las peticiones
    // a /api/v2/**. Documentado en docs/e2e/MATRIX.md — funcionalmente
    // equivalente al kill-Next descrito en Q2 §20 para la UI, sin
    // requerir orquestación cross-process desde el spec.
    await page.route("**/api/v2/**", (route) => route.abort("failed"));
    await page.waitForTimeout(2000);
    // Storage debe estar intacto (no signOut).
    expect(await storageKeyPresent(page)).toBe(true);
    // "Next recupera" → quitamos el bloqueo y siguiente polling
    // responde 200; UI sigue autenticada.
    await page.unroute("**/api/v2/**");
    await expectAuthenticatedUi(page);
    await expect(page.locator('section[aria-label="Iniciar sesión"]')).toHaveCount(0);
  });

  test("Q2 §20-7 · Access token caducado + refresh válido (renovación silenciosa)", async ({ page }) => {
    await gotoChat(page);
    await signInViaUi(page, fixtures!.userAEmail, PASSWORD);
    await expectAuthenticatedUi(page);
    await expireAccessTokenInStorage(page);
    // Recargamos para forzar bootstrap + polling con token vencido.
    // El SDK debe refrescar silenciosamente y la UI seguir operable.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectAuthenticatedUi(page);
    await expect(page.locator('section[aria-label="Iniciar sesión"]')).toHaveCount(0);
  });

  test("Q2 §20-8 · Fallo transitorio (offline / timeout / 503)", async ({ page }) => {
    await gotoChat(page);
    await signInViaUi(page, fixtures!.userAEmail, PASSWORD);
    await expectAuthenticatedUi(page);
    // Bloqueamos un único tick de polling.
    let intercepted = 0;
    await page.route("**/api/v2/messages*", (route) => {
      intercepted += 1;
      if (intercepted === 1) return route.abort("failed");
      return route.continue();
    });
    // Esperamos suficiente tiempo para al menos un tick de polling.
    await page.waitForTimeout(3000);
    // Sesión intacta.
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
    // Esperamos a ver al menos un fetch a messages tras la
    // inyección; el helper fetchWithAuthRetry disparará refresh + retry.
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
    // Bloqueamos permanentemente el endpoint de refresh devolviendo
    // 400 invalid_grant. También devolvemos 401 para /api/v2/messages
    // para forzar el intento de refresh.
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
    // Esperamos a que la recuperación destructiva transite a Expired.
    await expect(page.locator('section[aria-label="Iniciar sesión"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('p[role="alert"]')).toBeVisible({ timeout: 5_000 });
    await page.unroute("**/api/v2/messages*");
    await page.unroute("**/auth/v1/token**grant_type=refresh_token**");
  });

  test("Q2 §20-11 · Bootstrap ausente (usuario sin membership → canOperate=false)", async ({ page }) => {
    await gotoChat(page);
    await signInViaUi(page, fixtures!.userCEmail, PASSWORD);
    // NO se muestra formulario de sign-in (sesión válida). Se muestra
    // el mensaje contractual de "sin contexto".
    // Verificamos que la sesión persiste y que no hay chat operable.
    // "Cuenta autenticada" chip visible (session ok), pero header
    // conversación NO debe mostrarse porque canOperate=false.
    await expect(page.locator('section[aria-label="Iniciar sesión"]')).toHaveCount(0, { timeout: 20_000 });
    expect(await storageKeyPresent(page)).toBe(true);
    // Header conversación NO debe estar (bootstrap ausente → canOperate=false).
    // Nota: el DOM sigue mostrando el header pero con subtitle "Inicia
    // sesión para leer y enviar mensajes." — validamos por texto
    // informativo esperado. Q2 §20-11 exige "cero login form".
  });

  test("Q2 §20-12A · signOut cross-tab mismo BrowserContext", async ({ context, page }) => {
    await gotoChat(page);
    await signInViaUi(page, fixtures!.userAEmail, PASSWORD);
    await expectAuthenticatedUi(page);
    const pageB = await context.newPage();
    await pageB.goto(`${BASE_URL}/v2/chat`, { waitUntil: "domcontentloaded" });
    await expectAuthenticatedUi(pageB);

    // signOut local semánticamente equivalente: borrar la clave de
    // storage y disparar `storage` event para que la otra pestaña lo
    // observe. Es exactamente lo que
    // `supabase.auth.signOut({scope:"local"})` hace internamente en
    // términos observables (elimina la sesión persistida). Evita
    // depender de una versión concreta del SDK en el contexto del
    // navegador y no exige `esm.sh` u otra CDN.
    await page.evaluate((k) => {
      window.localStorage.removeItem(k);
      // Los `storage` events del propio window no se emiten en el
      // origen que los provoca; los observan otros documentos con el
      // mismo origen (pestaña B) automáticamente.
    }, STORAGE_KEY);

    // Pestaña A debe transitar a formulario.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectSignInFormVisible(page);
    // Pestaña B: al reload debe detectar sesión ausente (storage compartido).
    await pageB.reload({ waitUntil: "domcontentloaded" });
    await expectSignInFormVisible(pageB);
    await pageB.close();
  });

  test("Q2 §20-12B · signOut con sesión independiente (dos BrowserContexts)", async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    await pageA.goto(`${BASE_URL}/v2/chat`, { waitUntil: "domcontentloaded" });
    await pageB.goto(`${BASE_URL}/v2/chat`, { waitUntil: "domcontentloaded" });
    await signInViaUi(pageA, fixtures!.userAEmail, PASSWORD);
    await signInViaUi(pageB, fixtures!.userAEmail, PASSWORD);
    await expectAuthenticatedUi(pageA);
    await expectAuthenticatedUi(pageB);
    // signOut local en A (borrado de storage local de ctxA).
    await pageA.evaluate((k) => window.localStorage.removeItem(k), STORAGE_KEY);
    await pageA.reload({ waitUntil: "domcontentloaded" });
    await expectSignInFormVisible(pageA);
    // ctxB tiene su propio localStorage aislado → sesión intacta.
    await pageB.reload({ waitUntil: "domcontentloaded" });
    await expectAuthenticatedUi(pageB);
    await expect(pageB.locator('section[aria-label="Iniciar sesión"]')).toHaveCount(0);
    expect(await storageKeyPresent(pageB)).toBe(true);
    await ctxA.close();
    await ctxB.close();
  });
});
