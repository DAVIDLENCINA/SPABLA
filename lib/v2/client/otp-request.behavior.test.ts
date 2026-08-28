/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-B-Q2-R2 · Behavioural guarantees on the
 * productive `requestOtpEmail` helper via a real Supabase-shaped spy.
 *
 * Q2-R2 cierra dos brechas de evidencia detectadas en Q2-R:
 *
 *   1. "Email inválido no alcanza `signInWithOtp`" se acreditaba
 *      solamente por inspección del código; aquí se demuestra
 *      ejecutando `requestOtpEmail` con un cliente Supabase espía y
 *      observando que `signInWithOtp` recibe **cero** llamadas.
 *
 *   2. Normalización cliente-side (`trim().toLowerCase()`) y
 *      `shouldCreateUser:true` se atribuyen conscientemente al
 *      HELPER PRODUCTIVO — no al DOM. Este archivo lo prueba
 *      ejecutando el helper directamente y capturando los
 *      argumentos con los que se invoca al SDK.
 *
 * `otp-form.behavioral.test.tsx` sigue siendo la fuente de verdad
 * conductual del componente; este fichero es su complemento a nivel
 * de helper para atribuciones honestas en el acta.
 */

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requestOtpEmail } from "./otp-request";

/**
 * Cliente Supabase espía tipado. Registra cada llamada a
 * `signInWithOtp` con sus argumentos completos y devuelve una
 * respuesta configurable.
 */
type SpyCall = {
  email: string;
  options?: { shouldCreateUser?: boolean; emailRedirectTo?: unknown };
  raw: unknown;
};
function makeSupabaseSpy(response: { error: unknown } = { error: null }): {
  client: SupabaseClient;
  calls: SpyCall[];
} {
  const calls: SpyCall[] = [];
  const client = {
    auth: {
      signInWithOtp: async (args: unknown) => {
        const rec = args as { email: string; options?: { shouldCreateUser?: boolean; emailRedirectTo?: unknown } };
        calls.push({ email: rec.email, options: rec.options, raw: args });
        return response;
      },
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("requestOtpEmail · email inválido NO alcanza signInWithOtp", () => {
  it("cadena vacía → invalid_email + 0 llamadas al SDK", async () => {
    const { client, calls } = makeSupabaseSpy();
    const outcome = await requestOtpEmail(client, "");
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") expect(outcome.error.public).toBe("invalid_email");
    expect(calls.length).toBe(0);
  });

  it("sin '@' → invalid_email + 0 llamadas al SDK", async () => {
    const { client, calls } = makeSupabaseSpy();
    const outcome = await requestOtpEmail(client, "not-an-email");
    expect(outcome.kind).toBe("error");
    expect(calls.length).toBe(0);
  });

  it("dominio sin punto → invalid_email + 0 llamadas al SDK", async () => {
    const { client, calls } = makeSupabaseSpy();
    const outcome = await requestOtpEmail(client, "user@localhost");
    expect(outcome.kind).toBe("error");
    expect(calls.length).toBe(0);
  });

  it("con espacios internos → invalid_email + 0 llamadas al SDK", async () => {
    const { client, calls } = makeSupabaseSpy();
    const outcome = await requestOtpEmail(client, "a b@c.d");
    expect(outcome.kind).toBe("error");
    expect(calls.length).toBe(0);
  });

  it("dominio terminando en punto → invalid_email + 0 llamadas al SDK", async () => {
    const { client, calls } = makeSupabaseSpy();
    const outcome = await requestOtpEmail(client, "user@dom.");
    expect(outcome.kind).toBe("error");
    expect(calls.length).toBe(0);
  });
});

describe("requestOtpEmail · normalización + shouldCreateUser:true (atribuido al HELPER)", () => {
  it("email con mayúsculas y espacios → SDK recibe trim().toLowerCase() y shouldCreateUser:true", async () => {
    const { client, calls } = makeSupabaseSpy();
    const outcome = await requestOtpEmail(client, "  USER@Example.COM  ");
    expect(outcome.kind).toBe("ok");
    if (outcome.kind === "ok") expect(outcome.normalisedEmail).toBe("user@example.com");
    expect(calls.length).toBe(1);
    expect(calls[0].email).toBe("user@example.com");
    expect(calls[0].options?.shouldCreateUser).toBe(true);
  });

  it("email todo minúsculas y sin espacios → misma normalización estable", async () => {
    const { client, calls } = makeSupabaseSpy();
    const outcome = await requestOtpEmail(client, "user@example.com");
    expect(outcome.kind).toBe("ok");
    expect(calls[0].email).toBe("user@example.com");
    expect(calls[0].options?.shouldCreateUser).toBe(true);
  });

  it("NO se envía redirectTo (cero magic link en la solicitud)", async () => {
    const { client, calls } = makeSupabaseSpy();
    await requestOtpEmail(client, "user@example.com");
    expect(calls.length).toBe(1);
    // Ni `emailRedirectTo` ni claves relacionadas con redirect.
    expect(calls[0].options?.emailRedirectTo).toBeUndefined();
    const rawObj = calls[0].raw as Record<string, unknown>;
    for (const k of Object.keys(rawObj)) {
      expect(k).not.toMatch(/redirect/i);
    }
  });

  it("respuesta idéntica para usuario nuevo vs existente (misma opaqueness)", async () => {
    // Simulamos que Supabase responde OK para ambos. La opaqueness
    // efectiva la garantiza `shouldCreateUser:true` — ambos casos
    // producen `kind: "ok"`.
    const spyA = makeSupabaseSpy({ error: null });
    const spyB = makeSupabaseSpy({ error: null });
    const rA = await requestOtpEmail(spyA.client, "new-user@example.com");
    const rB = await requestOtpEmail(spyB.client, "existing-user@example.com");
    expect(rA.kind).toBe("ok");
    expect(rB.kind).toBe("ok");
    // Los dos llamados con la misma forma
    expect(spyA.calls[0].options?.shouldCreateUser).toBe(true);
    expect(spyB.calls[0].options?.shouldCreateUser).toBe(true);
  });

  it("error transitorio del proveedor NO expone shape interno al llamador", async () => {
    const { client } = makeSupabaseSpy({
      error: { error_code: "over_email_send_rate_limit", status: 429 },
    });
    const outcome = await requestOtpEmail(client, "user@example.com");
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.error.public).toBe("cooldown_active");
      // El internalKind es sanitizado; nunca contiene el mensaje raw
      // del proveedor.
      expect(outcome.error.internalKind).toBe("cooldown_active");
      // Ni `error.message`, ni `status`, ni códigos numéricos.
      expect(JSON.stringify(outcome.error)).not.toMatch(/429/);
    }
  });
});
