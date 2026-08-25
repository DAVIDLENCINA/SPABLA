/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-B-Q2 · OTP flow integration test.
 *
 * Exercises the full OTP client-side flow against Supabase local:
 * `requestOtpEmail` → email lands in Mailpit → extract 6-digit code
 * → `verifyOtpAndOnboard` → onboarding endpoint invoked (skipped by
 * environment — we cannot reach the productive handler without a
 * `next dev`, so this integration test verifies the client helpers
 * against the real Supabase Auth surface up to the point of getting
 * a valid session).
 *
 * Auto-skips silently when the required environment variables are
 * absent (Job A engine runs without them; Job B integration exports
 * them). Never prints the OTP code — uses SHA-256 truncated hashes
 * in logs (contract §11 audit, orden Q2 §7 & §13).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";

import { requestOtpEmail } from "./otp-request";
import { onlyDigits } from "./otp-verify";

const SUPABASE_URL = process.env.SPABLA_TEST_SUPABASE_URL ?? "";
const ANON = process.env.SPABLA_TEST_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SPABLA_TEST_SUPABASE_SERVICE_ROLE_KEY ?? "";
const INBUCKET = process.env.SPABLA_TEST_INBUCKET_URL ?? "http://127.0.0.1:54324";

const SUITE_SHOULD_RUN =
  SUPABASE_URL !== "" && ANON !== "" && SERVICE !== "";

const RUN_ID = new Date().toISOString().replace(/[^0-9]/g, "") + "-" + randomBytes(4).toString("hex");

function sha12(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 12);
}

async function inbucketSearchByRecipient(mailbox: string): Promise<Array<{ ID: string }>> {
  const url = `${INBUCKET}/api/v1/search?query=${encodeURIComponent(`to:${mailbox}`)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const body = (await res.json()) as { messages?: Array<{ ID: string }> };
  return body.messages ?? [];
}

async function inbucketFetchMessage(id: string): Promise<{ Text?: string; HTML?: string; Subject?: string }> {
  const res = await fetch(`${INBUCKET}/api/v1/message/${id}`);
  if (!res.ok) throw new Error(`inbucket fetch ${res.status}`);
  return (await res.json()) as { Text?: string; HTML?: string; Subject?: string };
}

async function inbucketDelete(id: string): Promise<void> {
  await fetch(`${INBUCKET}/api/v1/message/${id}`, { method: "DELETE" }).catch(() => undefined);
}

async function waitForOtp(mailbox: string, timeoutMs = 8000): Promise<{ code: string; id: string; subject: string; hasVerifyUrl: boolean }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const messages = await inbucketSearchByRecipient(mailbox);
    if (messages.length > 0) {
      const m = await inbucketFetchMessage(messages[0].ID);
      const src = (m.Text ?? "") + "\n" + (m.HTML ?? "");
      const codeMatch = src.match(/\b(\d{6})\b/);
      const verifyMatch = src.match(/\/auth\/v1\/verify/);
      if (codeMatch) {
        return {
          code: codeMatch[1],
          id: messages[0].ID,
          subject: m.Subject ?? "",
          hasVerifyUrl: !!verifyMatch,
        };
      }
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("OTP did not arrive within timeout");
}

describe.runIf(SUITE_SHOULD_RUN)("otp signin · integration against Supabase local + Mailpit", () => {
  let client: SupabaseClient;
  let admin: SupabaseClient;

  beforeAll(() => {
    client = createClient(SUPABASE_URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    admin = createClient(SUPABASE_URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  it("plantilla local: correo entregado contiene 6 dígitos y NO magic-link URL", async () => {
    const email = `otp-int-tmpl-${RUN_ID}@spabla.test`;
    const outcome = await requestOtpEmail(client, email);
    expect(outcome.kind).toBe("ok");
    const arrived = await waitForOtp(email);
    // Hash truncado del código; el código en sí NUNCA se loguea.
    // eslint-disable-next-line no-console
    console.log(`[otp-int] email_hash=${sha12(email)} code_hash=${sha12(arrived.code)}`);
    expect(arrived.code).toMatch(/^\d{6}$/);
    expect(arrived.hasVerifyUrl).toBe(false); // plantilla custom no incluye magic link
    expect(arrived.subject).toMatch(/SPABLA/);
    await inbucketDelete(arrived.id);
  });

  it("verifyOtp con código válido retorna sesión real", async () => {
    const email = `otp-int-verify-${RUN_ID}@spabla.test`;
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
    }
    // Cleanup
    if (verifyRes.data.session) {
      await admin.auth.admin.deleteUser(verifyRes.data.session.user.id).catch(() => undefined);
    }
    await inbucketDelete(arrived.id);
  });

  it("cooldown: segunda solicitud consecutiva devuelve error clasificado como cooldown_active", async () => {
    const email = `otp-int-cool-${RUN_ID}@spabla.test`;
    const r1 = await requestOtpEmail(client, email);
    expect(r1.kind).toBe("ok");
    const r2 = await requestOtpEmail(client, email);
    // Puede que la segunda sea `ok` si transcurrió >1s. En ese caso
    // realizamos un tercer intento inmediato que sí debe ser cooldown.
    if (r2.kind === "ok") {
      const r3 = await requestOtpEmail(client, email);
      expect(r3.kind).toBe("error");
      if (r3.kind === "error") {
        expect(r3.error.public).toBe("cooldown_active");
      }
    } else {
      expect(r2.error.public).toBe("cooldown_active");
    }
    // Limpieza Mailpit
    const msgs = await inbucketSearchByRecipient(email);
    for (const m of msgs) await inbucketDelete(m.ID);
  });

  it("misma respuesta pública para email nuevo y existente (create_user:true)", async () => {
    // Existente vía admin.createUser
    const emailExisting = `otp-int-exists-${RUN_ID}@spabla.test`;
    const create = await admin.auth.admin.createUser({
      email: emailExisting,
      email_confirm: true,
    });
    expect(create.error).toBeNull();
    const rExisting = await requestOtpEmail(client, emailExisting);
    expect(rExisting.kind).toBe("ok");

    // Nuevo
    const emailNew = `otp-int-new-${RUN_ID}@spabla.test`;
    const rNew = await requestOtpEmail(client, emailNew);
    expect(rNew.kind).toBe("ok");

    // Ambas respuestas son `kind: "ok"` — la enumeración por status
    // queda mitigada gracias a `shouldCreateUser: true` (contract §5).
    // Cleanup:
    if (create.data.user) {
      await admin.auth.admin.deleteUser(create.data.user.id).catch(() => undefined);
    }
    // Nuevos ghost usuarios creados por signInWithOtp con create_user:true
    // se acumularían; limpiamos por email via admin listUsers.
    const list = await admin.auth.admin.listUsers();
    if (list.data.users) {
      for (const u of list.data.users) {
        if (u.email && (u.email === emailNew || u.email === emailExisting)) {
          await admin.auth.admin.deleteUser(u.id).catch(() => undefined);
        }
      }
    }
    // Limpieza Mailpit
    for (const e of [emailExisting, emailNew]) {
      const msgs = await inbucketSearchByRecipient(e);
      for (const m of msgs) await inbucketDelete(m.ID);
    }
  });
});
