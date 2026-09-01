import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requestOtpEmail, toProviderInput } from "./otp-request";

type SignInArgs = {
  email: string;
  options: { shouldCreateUser: boolean };
};

function makeSpy(): {
  calls: SignInArgs[];
  handler: (args: unknown) => Promise<{ error: unknown }>;
} {
  const calls: SignInArgs[] = [];
  return {
    calls,
    handler: async (args: unknown) => {
      calls.push(args as SignInArgs);
      return { error: null };
    },
  };
}

function makeSupabase(
  signInWithOtp: (args: unknown) => Promise<{ error: unknown }>,
): SupabaseClient {
  return {
    auth: { signInWithOtp },
  } as unknown as SupabaseClient;
}

describe("requestOtpEmail", () => {
  it("normaliza el email (trim + toLowerCase) antes de invocar el SDK", async () => {
    const spy = makeSpy();
    const client = makeSupabase(spy.handler);
    const outcome = await requestOtpEmail(client, "  USER@Example.COM  ");
    expect(outcome.kind).toBe("ok");
    if (outcome.kind === "ok") {
      expect(outcome.normalisedEmail).toBe("user@example.com");
    }
    expect(spy.calls.length).toBe(1);
    expect(spy.calls[0].email).toBe("user@example.com");
    expect(spy.calls[0].options.shouldCreateUser).toBe(true);
  });

  it("SIEMPRE pasa shouldCreateUser:true (uniformidad new vs existing)", async () => {
    const spy = makeSpy();
    const client = makeSupabase(spy.handler);
    await requestOtpEmail(client, "someone@spabla.test");
    expect(spy.calls[0].options.shouldCreateUser).toBe(true);
  });

  it("rechaza email inválido antes de golpear al SDK", async () => {
    const spy = makeSpy();
    const client = makeSupabase(spy.handler);
    const outcome = await requestOtpEmail(client, "not-an-email");
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.error.public).toBe("invalid_email");
    }
    expect(spy.calls.length).toBe(0);
  });

  it("clasifica error del proveedor conservando internalKind", async () => {
    const client = makeSupabase(async () => ({
      error: { error_code: "over_email_send_rate_limit", status: 429 },
    }));
    const outcome = await requestOtpEmail(client, "user@x.io");
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.error.public).toBe("cooldown_active");
      expect(outcome.error.internalKind).toBe("cooldown_active");
    }
  });

  it("respuesta usuario nuevo vs existente es idéntica (misma opaqueness)", async () => {
    const spy = makeSpy();
    const client = makeSupabase(spy.handler);
    const rNew = await requestOtpEmail(client, "new-user@x.io");
    const rExisting = await requestOtpEmail(client, "existing-user@x.io");
    expect(rNew.kind).toBe(rExisting.kind);
    expect(rNew.kind).toBe("ok");
    if (rNew.kind === "ok" && rExisting.kind === "ok") {
      // ambos devuelven `ok` con normalisedEmail; el SDK envía la
      // misma request con shouldCreateUser:true en ambos casos.
      expect(typeof rNew.normalisedEmail).toBe("string");
      expect(typeof rExisting.normalisedEmail).toBe("string");
    }
  });

  it("network errors del SDK se propagan como network_unavailable", async () => {
    const client = makeSupabase(async () => ({
      error: { name: "AbortError", message: "aborted" },
    }));
    const outcome = await requestOtpEmail(client, "user@x.io");
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.error.public).toBe("network_unavailable");
    }
  });
});

describe("toProviderInput", () => {
  it("extrae campos conocidos de un AuthError-like", () => {
    const p = toProviderInput({
      error_code: "some_code",
      status: 400,
      name: "AuthApiError",
      message: "some msg",
    });
    expect(p.error_code).toBe("some_code");
    expect(p.status).toBe(400);
    expect(p.name).toBe("AuthApiError");
  });

  it("devuelve objeto vacío para null/undefined/scalar", () => {
    expect(toProviderInput(null)).toEqual({});
    expect(toProviderInput(undefined)).toEqual({});
    expect(toProviderInput(42)).toEqual({});
    expect(toProviderInput("string")).toEqual({});
  });
});
