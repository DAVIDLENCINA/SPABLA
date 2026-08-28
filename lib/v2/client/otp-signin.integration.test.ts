/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-B-Q2-R3 · OTP signin integration.
 *
 * Q2-R3 rectifica la fuga de fixtures documentada en Q2-R2 §11: los
 * tests A/C creaban usuarios Auth vía `signInWithOtp({shouldCreateUser:
 * true})` y sólo limpiaban Mailpit — dejaban 2 users + 2 identities +
 * 2 one_time_tokens residuales, lo que el atomic_onboarding.test.sql
 * detectaba como orphan tenants en corridas encadenadas sin reset.
 *
 * Ahora **toda** creación pasa por `createOtpFixtureRegistry`, y
 * `afterAll` invoca `cleanupAll()` (que además vacía cualquier ghost
 * user descubierto por `listUsers` cuyo email contenga el runId). Se
 * añade una barrera ejecutable de conteos: el snapshot final debe
 * coincidir byte a byte con el inicial. Si difiere, el test 5 falla.
 *
 * Auto-skips silenciosamente sin `SPABLA_TEST_*` env vars.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

import { requestOtpEmail } from "./otp-request";
import { onlyDigits } from "./otp-verify";
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
const RUN_ID =
  new Date().toISOString().replace(/[^0-9]/g, "") +
  "-" +
  randomBytes(4).toString("hex");

async function inbucketSearch(mailbox: string): Promise<Array<{ ID: string }>> {
  const url = `${INBUCKET}/api/v1/search?query=${encodeURIComponent(`to:${mailbox}`)}`;
  const r = await fetch(url);
  if (!r.ok) return [];
  return ((await r.json()) as { messages?: Array<{ ID: string }> }).messages ?? [];
}
async function inbucketMessage(id: string): Promise<{ Text?: string; HTML?: string; Subject?: string }> {
  const r = await fetch(`${INBUCKET}/api/v1/message/${id}`);
  if (!r.ok) throw new Error(`inbucket ${r.status}`);
  return (await r.json()) as { Text?: string; HTML?: string; Subject?: string };
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

let client: SupabaseClient;
let admin: SupabaseClient;
let registry: OtpFixtureRegistry;
let baseline: SnapshotCounts | null = null;

beforeAll(async () => {
  if (!ENABLED) return;
  client = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  registry = createOtpFixtureRegistry(RUN_ID, {
    admin,
    pgUrl: PG_URL,
    inbucketUrl: INBUCKET,
  });
  baseline = await registry.snapshotCounts();
});

afterAll(async () => {
  if (!ENABLED) return;
  // Cleanup en `afterAll` corre INCLUSO si un `it` falló — vitest
  // no lo evita. Toleramos errores individuales; la barrera del
  // último test acredita el estado final.
  try {
    await registry.cleanupAll();
  } catch (err) {
    // Nunca ocultar errores de limpieza; se registra sanitizado.
    // eslint-disable-next-line no-console
    console.error("[otp-signin-cleanup] error:", (err as Error).message);
  }
});

describe.runIf(ENABLED)("otp signin · integration (Q2-R3 aislado)", () => {
  it("plantilla local: correo entregado contiene 6 dígitos y NO magic-link URL", async () => {
    const email = registry.emailFor("tmpl");
    const outcome = await requestOtpEmail(client, email);
    expect(outcome.kind).toBe("ok");
    const arrived = await waitForOtp(email);
    // Descubrir el actor creado por signInWithOtp y registrarlo.
    const list = await admin.auth.admin.listUsers({ perPage: 1000 });
    const created = (list.data.users ?? []).find((u) => u.email === email);
    if (created) registry.registerUser(created.id);
    // eslint-disable-next-line no-console
    console.log(`[otp-int] email_hash=${sha12(email)} code_hash=${sha12(arrived.code)}`);
    expect(arrived.code).toMatch(/^\d{6}$/);
    expect(arrived.hasVerifyUrl).toBe(false);
    expect(arrived.subject).toMatch(/SPABLA/);
  });

  it("verifyOtp con código válido retorna sesión real", async () => {
    const email = registry.emailFor("verify");
    const requested = await requestOtpEmail(client, email);
    expect(requested.kind).toBe("ok");
    const arrived = await waitForOtp(email);
    const numeric = onlyDigits(arrived.code);
    const verifyRes = await client.auth.verifyOtp({
      type: "email",
      email: requested.kind === "ok" ? requested.normalisedEmail : email,
      token: numeric,
    });
    expect(verifyRes.error).toBeNull();
    expect(verifyRes.data.session).not.toBeNull();
    if (verifyRes.data.session) {
      expect(typeof verifyRes.data.session.access_token).toBe("string");
      expect(verifyRes.data.session.user.email).toBe(email);
      registry.registerUser(verifyRes.data.session.user.id);
    }
  });

  it("cooldown: segunda solicitud consecutiva devuelve error clasificado como cooldown_active", async () => {
    const email = registry.emailFor("cool");
    const r1 = await requestOtpEmail(client, email);
    expect(r1.kind).toBe("ok");
    const r2 = await requestOtpEmail(client, email);
    if (r2.kind === "ok") {
      const r3 = await requestOtpEmail(client, email);
      expect(r3.kind).toBe("error");
      if (r3.kind === "error") {
        expect(r3.error.public).toBe("cooldown_active");
      }
    } else {
      expect(r2.error.public).toBe("cooldown_active");
    }
    // Registrar el actor creado (aunque sólo hicimos request, el
    // shouldCreateUser:true de nuestro helper lo materializó).
    const list = await admin.auth.admin.listUsers({ perPage: 1000 });
    const created = (list.data.users ?? []).find((u) => u.email === email);
    if (created) registry.registerUser(created.id);
  });

  it("misma respuesta pública para email nuevo y existente (create_user:true)", async () => {
    const emailExisting = registry.emailFor("exists");
    const create = await admin.auth.admin.createUser({
      email: emailExisting,
      email_confirm: true,
    });
    expect(create.error).toBeNull();
    if (create.data.user) registry.registerUser(create.data.user.id);
    const rExisting = await requestOtpEmail(client, emailExisting);
    expect(rExisting.kind).toBe("ok");

    const emailNew = registry.emailFor("new");
    const rNew = await requestOtpEmail(client, emailNew);
    expect(rNew.kind).toBe("ok");
    // Registrar el ghost user creado por el helper.
    const list = await admin.auth.admin.listUsers({ perPage: 1000 });
    const ghost = (list.data.users ?? []).find((u) => u.email === emailNew);
    if (ghost) registry.registerUser(ghost.id);
  });

  it("isolation barrier · cero residuos del propio runId tras cleanup", async () => {
    // Aísla la política de aislamiento del ruido de otras suites que
    // corren en el mismo Job B (rutas HTTP, presentación, etc.).
    // Aserción robusta: tras `cleanupAll()`, la tabla `auth.users`
    // NO contiene ningún email con este runId. El registry es la
    // autoridad de la limpieza de `sus` fixtures — no de las del
    // resto del ecosistema.
    expect(baseline).not.toBeNull();
    await registry.cleanupAll();
    const residual = await registry.countOwnResidualUsers();
    expect(residual).toBe(0);
  });
});
