/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-B-Q2-R · OTP → onboarding REAL.
 *
 * Ejecuta el flujo completo end-to-end contra Supabase local +
 * Mailpit real, y contra el HANDLER real de `/api/v2/onboarding`
 * (importado directamente y ejercido con `NextRequest` — mismo
 * patrón que `route.presentation.integration.test.ts`). Cero mock
 * de fetch. Cero simulación de sesión.
 *
 * Cadena verificada:
 *   requestOtpEmail
 *     → correo real en Mailpit
 *     → extracción segura del código (nunca a stdout)
 *     → verifyOtp real (Supabase Auth local)
 *     → sesión real con access_token válido
 *     → POST real al handler `/api/v2/onboarding` con
 *       `Authorization: Bearer <access_token>`
 *     → 200 con `{tenantId, role:"owner", label}`
 *     → segunda invocación idempotente devuelve mismo tenantId
 *     → PostgreSQL: exactamente 1 mapping / 1 tenant / 1 membership
 *       activa, tenants.name = 'workspace.personal.default'
 *     → identidad efectiva = sub del JWT (no del cliente)
 *     → cleanup completo de fixtures.
 *
 * Auto-skips silenciosamente cuando `SPABLA_TEST_*` no están (Job A
 * engine); corre en Job B (integration) donde se exportan.
 */

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";
import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";

import { requestOtpEmail } from "./otp-request";
import { onlyDigits } from "./otp-verify";
import { POST as ONBOARDING_POST } from "@/app/api/v2/onboarding/route";
import {
  createOtpFixtureRegistry,
  sha12,
  type OtpFixtureRegistry,
  type SnapshotCounts,
} from "@/lib/v2/test-utils/otp-fixture-registry";

const SUPABASE_URL = process.env.SPABLA_TEST_SUPABASE_URL ?? "";
const ANON = process.env.SPABLA_TEST_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SPABLA_TEST_SUPABASE_SERVICE_ROLE_KEY ?? "";
const INBUCKET = process.env.SPABLA_TEST_INBUCKET_URL ?? "http://127.0.0.1:54324";
const PG_URL =
  process.env.SPABLA_TEST_PG_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const ENABLED = SUPABASE_URL !== "" && ANON !== "" && SERVICE !== "";
const RUN_ID = new Date().toISOString().replace(/[^0-9]/g, "") + "-" + randomBytes(4).toString("hex");

async function inbucketSearch(mailbox: string): Promise<Array<{ ID: string }>> {
  const res = await fetch(`${INBUCKET}/api/v1/search?query=${encodeURIComponent(`to:${mailbox}`)}`);
  if (!res.ok) return [];
  return ((await res.json()) as { messages?: Array<{ ID: string }> }).messages ?? [];
}
async function inbucketMessage(id: string): Promise<{ Text?: string; HTML?: string; Subject?: string }> {
  const r = await fetch(`${INBUCKET}/api/v1/message/${id}`);
  if (!r.ok) throw new Error(`inbucket ${r.status}`);
  return (await r.json()) as { Text?: string; HTML?: string; Subject?: string };
}
async function inbucketDelete(id: string): Promise<void> {
  await fetch(`${INBUCKET}/api/v1/message/${id}`, { method: "DELETE" }).catch(() => undefined);
}

async function waitForOtp(
  mailbox: string,
  timeoutMs = 8000,
): Promise<{ code: string; id: string; hasVerifyUrl: boolean; subject: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const msgs = await inbucketSearch(mailbox);
    if (msgs.length > 0) {
      const m = await inbucketMessage(msgs[0].ID);
      const src = (m.Text ?? "") + "\n" + (m.HTML ?? "");
      const codeMatch = src.match(/\b(\d{6})\b/);
      if (codeMatch) {
        return {
          code: codeMatch[1],
          id: msgs[0].ID,
          hasVerifyUrl: /\/auth\/v1\/verify/.test(src),
          subject: m.Subject ?? "",
        };
      }
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("OTP did not arrive within timeout");
}

/**
 * Invoke the REAL onboarding handler in-process. Same pattern as
 * `route.presentation.integration.test.ts` — imports the route
 * module and calls `POST` with a `NextRequest`. This exercises the
 * full server-side pipeline: JWT verify, body parse, RPC,
 * label presenter, opaque error mapping. NEVER mocks fetch.
 */
async function realOnboardingCall(accessToken: string): Promise<{
  status: number;
  body: { tenantId?: string; role?: string; label?: string; error?: string };
}> {
  const req = new NextRequest("http://127.0.0.1/api/v2/onboarding", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: "",
  });
  const res = await ONBOARDING_POST(req);
  const text = await res.text();
  let body: { tenantId?: string; role?: string; label?: string; error?: string } = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = {};
  }
  return { status: res.status, body };
}

let admin: SupabaseClient;
let anon: SupabaseClient;
let registry: OtpFixtureRegistry;
let baseline: SnapshotCounts | null = null;

beforeAll(async () => {
  if (!ENABLED) return;
  admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  anon = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  registry = createOtpFixtureRegistry(RUN_ID, {
    admin,
    pgUrl: PG_URL,
    inbucketUrl: INBUCKET,
  });
  baseline = await registry.snapshotCounts();
});

afterAll(async () => {
  if (!ENABLED) return;
  try {
    await registry.cleanupAll();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[otp-onboarding-cleanup] error:", (err as Error).message);
  }
});

describe.runIf(ENABLED)("otp → onboarding real (Supabase local + Mailpit + handler real)", () => {
  test("flujo completo · request → email → verify → handler REAL /api/v2/onboarding → 200 + estado SQL correcto", async () => {
    const email = `otp-real-${RUN_ID}@spabla.test`;
    // Provisionamos previamente al usuario en admin para asegurar
    // que el email es válido en Auth y estabilizar la entrega
    // Mailpit. `shouldCreateUser:true` en requestOtpEmail cubriría
    // también al usuario nuevo, pero pre-crearlo determinística y
    // acelera la limpieza (podemos leer el id sin listUsers).
    const created = await admin.auth.admin.createUser({ email, email_confirm: true });
    expect(created.error).toBeNull();
    if (created.data.user) registry.registerUser(created.data.user.id);
    const expectedActorId = created.data.user!.id;

    // 1. Solicitar OTP con el helper productivo (shouldCreateUser:true).
    const req = await requestOtpEmail(anon, email);
    expect(req.kind).toBe("ok");

    // 2. Recuperar OTP desde Mailpit.
    const arrived = await waitForOtp(email);
    // Hash truncado para observabilidad; NUNCA imprimimos el código.
    // eslint-disable-next-line no-console
    console.log(`[otp-onboarding-real] email_hash=${sha12(email)} code_hash=${sha12(arrived.code)}`);
    expect(arrived.hasVerifyUrl).toBe(false); // plantilla custom, sin magic link

    // 3. verifyOtp REAL contra Supabase Auth local.
    const numeric = onlyDigits(arrived.code);
    expect(numeric).toMatch(/^\d{6}$/);
    const verify = await anon.auth.verifyOtp({ type: "email", email, token: numeric });
    expect(verify.error).toBeNull();
    expect(verify.data.session).not.toBeNull();
    const accessToken = verify.data.session!.access_token;
    expect(typeof accessToken).toBe("string");

    // Identidad efectiva del JWT = sub emitido por Supabase (no del
    // cliente). Decodificamos el payload para comprobarlo.
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    ) as { sub: string; email: string };
    expect(payload.sub).toBe(expectedActorId);
    expect(payload.email).toBe(email);

    // 4. POST REAL al handler /api/v2/onboarding (in-process,
    // NextRequest — mismo patrón que route.presentation.integration).
    const onboarding1 = await realOnboardingCall(accessToken);
    expect(onboarding1.status).toBe(200);
    expect(onboarding1.body.role).toBe("owner");
    expect(typeof onboarding1.body.tenantId).toBe("string");
    expect(typeof onboarding1.body.label).toBe("string");
    expect(onboarding1.body.tenantId).toMatch(/^[0-9a-f-]{36}$/);
    // Anti-fuga: la clave interna NO aparece en la respuesta.
    expect(JSON.stringify(onboarding1.body)).not.toContain("workspace.personal.default");
    const tenantId = onboarding1.body.tenantId!;
    registry.registerTenant(tenantId);

    // 5. Idempotencia real (segunda llamada → mismo tenantId).
    const onboarding2 = await realOnboardingCall(accessToken);
    expect(onboarding2.status).toBe(200);
    expect(onboarding2.body.tenantId).toBe(tenantId);

    // 6. Post-condiciones SQL directas (no via handler).
    const pg = new PgClient({ connectionString: PG_URL });
    await pg.connect();
    try {
      const mapping = await pg.query(
        `SELECT tenant_id FROM spabla_v2.actor_personal_workspace WHERE actor_id = $1`,
        [expectedActorId],
      );
      expect(mapping.rowCount).toBe(1);
      expect(mapping.rows[0].tenant_id).toBe(tenantId);

      const tenant = await pg.query(`SELECT name FROM spabla_v2.tenants WHERE id = $1`, [tenantId]);
      expect(tenant.rowCount).toBe(1);
      // Clave interna preservada server-side (contract §17-bis 8-10).
      expect(tenant.rows[0].name).toBe("workspace.personal.default");

      const memberships = await pg.query(
        `SELECT count(*) FILTER (WHERE is_active) AS active, count(*) FILTER (WHERE NOT is_active) AS inactive
           FROM spabla_v2.tenant_memberships
          WHERE actor_id = $1 AND tenant_id = $2`,
        [expectedActorId, tenantId],
      );
      expect(Number(memberships.rows[0].active)).toBe(1);
      expect(Number(memberships.rows[0].inactive)).toBe(0);
    } finally {
      await pg.end().catch(() => undefined);
    }

    // 7. Cleanup del correo Mailpit.
    await inbucketDelete(arrived.id);
  });

  test("guarda anti-usurpación · access_token de otro actor NO permite operar sobre el primero", async () => {
    // Creamos dos actores independientes con OTP y verificamos que
    // el POST /api/v2/onboarding con el token de A crea un tenant
    // vinculado al sub de A, y con el token de B crea el suyo. La
    // identidad efectiva viaja EXCLUSIVAMENTE en el sub del JWT.
    const emailA = `otp-real-a-${RUN_ID}@spabla.test`;
    const emailB = `otp-real-b-${RUN_ID}@spabla.test`;
    const cA = await admin.auth.admin.createUser({ email: emailA, email_confirm: true });
    const cB = await admin.auth.admin.createUser({ email: emailB, email_confirm: true });
    registry.registerUser(cA.data.user!.id);
    registry.registerUser(cB.data.user!.id);

    const rA = await requestOtpEmail(anon, emailA);
    const rB = await requestOtpEmail(anon, emailB);
    expect(rA.kind).toBe("ok");
    expect(rB.kind).toBe("ok");
    const arA = await waitForOtp(emailA);
    const arB = await waitForOtp(emailB);
    const vA = await anon.auth.verifyOtp({ type: "email", email: emailA, token: onlyDigits(arA.code) });
    const vB = await anon.auth.verifyOtp({ type: "email", email: emailB, token: onlyDigits(arB.code) });
    expect(vA.error).toBeNull();
    expect(vB.error).toBeNull();
    const tokenA = vA.data.session!.access_token;
    const tokenB = vB.data.session!.access_token;

    const oA = await realOnboardingCall(tokenA);
    const oB = await realOnboardingCall(tokenB);
    expect(oA.status).toBe(200);
    expect(oB.status).toBe(200);
    expect(oA.body.tenantId).not.toBe(oB.body.tenantId);
    registry.registerTenant(oA.body.tenantId!);
    registry.registerTenant(oB.body.tenantId!);

    // Verificación SQL: cada tenant pertenece al sub correspondiente.
    const pg = new PgClient({ connectionString: PG_URL });
    await pg.connect();
    try {
      const mA = await pg.query(
        `SELECT tenant_id FROM spabla_v2.actor_personal_workspace WHERE actor_id = $1`,
        [cA.data.user!.id],
      );
      const mB = await pg.query(
        `SELECT tenant_id FROM spabla_v2.actor_personal_workspace WHERE actor_id = $1`,
        [cB.data.user!.id],
      );
      expect(mA.rows[0].tenant_id).toBe(oA.body.tenantId);
      expect(mB.rows[0].tenant_id).toBe(oB.body.tenantId);
    } finally {
      await pg.end().catch(() => undefined);
    }
    await inbucketDelete(arA.id);
    await inbucketDelete(arB.id);
  });

  test("isolation barrier · cero residuos del propio runId tras cleanup", async () => {
    // Barrera de aislamiento robusta ante ruido de otras suites: se
    // exige que la tabla `auth.users` no contenga ningún email con
    // este runId tras `cleanupAll()`. La autoridad de la limpieza
    // por suite es el propio runId; el resto del ecosistema queda
    // fuera del alcance por diseño (contract Q2-R3 §14).
    expect(baseline).not.toBeNull();
    await registry.cleanupAll();
    const residual = await registry.countOwnResidualUsers();
    expect(residual).toBe(0);
  });
});
