import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

import { onlyDigits, verifyOtpAndOnboard } from "./otp-verify";

function makeSupabase(
  verifyOtp: (args: unknown) => Promise<{
    data: { session: Session | null };
    error: unknown;
  }>,
): SupabaseClient {
  return {
    auth: { verifyOtp },
  } as unknown as SupabaseClient;
}

function fakeSession(id = "aaa", token = "session-access-token"): Session {
  return {
    access_token: token,
    refresh_token: "refresh",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: { id, email: "u@x.io", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "" },
  } as unknown as Session;
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  // Silence unhandled fetch calls unless a test overrides it.
  globalThis.fetch = vi.fn(async () => new Response("{}", { status: 200 })) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("onlyDigits", () => {
  it("elimina caracteres no numéricos y trunca a 6", () => {
    expect(onlyDigits("123-456")).toBe("123456");
    expect(onlyDigits("  1 2 3 4 5 6  ")).toBe("123456");
    expect(onlyDigits("abc123456xyz")).toBe("123456");
    expect(onlyDigits("1234567890")).toBe("123456");
    expect(onlyDigits("")).toBe("");
    expect(onlyDigits("abcdef")).toBe("");
  });
});

describe("verifyOtpAndOnboard", () => {
  it("rechaza tokens de longitud distinta a 6 sin invocar al SDK", async () => {
    const spy = vi.fn(async () => ({ data: { session: null }, error: null }));
    const client = makeSupabase(spy);
    const outcome = await verifyOtpAndOnboard(client, "user@x.io", "1234");
    expect(outcome.kind).toBe("verify_error");
    expect(spy).not.toHaveBeenCalled();
  });

  it("propaga error de verifyOtp como verify_error opaco", async () => {
    const client = makeSupabase(async () => ({
      data: { session: null },
      error: { error_code: "otp_expired", status: 403 },
    }));
    const outcome = await verifyOtpAndOnboard(client, "user@x.io", "123456");
    expect(outcome.kind).toBe("verify_error");
    if (outcome.kind === "verify_error") {
      expect(outcome.error.public).toBe("code_invalid_or_expired");
    }
  });

  it("degrada a verify_unavailable si el proveedor no devuelve sesión", async () => {
    const client = makeSupabase(async () => ({
      data: { session: null },
      error: null,
    }));
    const outcome = await verifyOtpAndOnboard(client, "user@x.io", "123456");
    expect(outcome.kind).toBe("verify_error");
    if (outcome.kind === "verify_error") {
      expect(outcome.error.public).toBe("verify_unavailable");
    }
  });

  it("éxito completo: verifyOtp + onboarding 200 → kind='ok'", async () => {
    const session = fakeSession();
    const client = makeSupabase(async () => ({
      data: { session },
      error: null,
    }));
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ tenantId: "t-1", role: "owner", label: "My space" }),
        { status: 200 },
      ),
    ) as typeof fetch;
    const outcome = await verifyOtpAndOnboard(client, "user@x.io", "123456");
    expect(outcome.kind).toBe("ok");
    if (outcome.kind === "ok") {
      expect(outcome.tenantId).toBe("t-1");
      expect(outcome.role).toBe("owner");
      expect(outcome.session).toBe(session);
    }
  });

  it("verifyOtp OK + onboarding 503 → onboarding_error, sesión preservada", async () => {
    const session = fakeSession();
    const client = makeSupabase(async () => ({
      data: { session },
      error: null,
    }));
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "unavailable" }), { status: 503 }),
    ) as typeof fetch;
    const outcome = await verifyOtpAndOnboard(client, "user@x.io", "123456");
    expect(outcome.kind).toBe("onboarding_error");
    if (outcome.kind === "onboarding_error") {
      expect(outcome.session).toBe(session);
      expect(outcome.error.public).toBe("onboarding_unavailable");
      expect(outcome.error.internalKind).toBe("onboarding_status_503");
    }
  });

  it("verifyOtp OK + onboarding body malformado → onboarding_error", async () => {
    const session = fakeSession();
    const client = makeSupabase(async () => ({
      data: { session },
      error: null,
    }));
    globalThis.fetch = vi.fn(async () =>
      new Response("<html>maintenance</html>", { status: 200 }),
    ) as typeof fetch;
    const outcome = await verifyOtpAndOnboard(client, "user@x.io", "123456");
    expect(outcome.kind).toBe("onboarding_error");
    if (outcome.kind === "onboarding_error") {
      expect(outcome.error.internalKind).toBe("onboarding_body_malformed");
    }
  });

  it("verifyOtp OK + onboarding network error → onboarding_error", async () => {
    const session = fakeSession();
    const client = makeSupabase(async () => ({
      data: { session },
      error: null,
    }));
    globalThis.fetch = vi.fn(async () => {
      throw new Error("Failed to fetch");
    }) as typeof fetch;
    const outcome = await verifyOtpAndOnboard(client, "user@x.io", "123456");
    expect(outcome.kind).toBe("onboarding_error");
    if (outcome.kind === "onboarding_error") {
      expect(outcome.error.internalKind).toBe("onboarding_network");
    }
  });

  it("pasa el access_token del session como Authorization Bearer", async () => {
    const session = fakeSession("actor-uuid", "the-real-access-token");
    const client = makeSupabase(async () => ({ data: { session }, error: null }));
    const seenCalls: Array<{ url: unknown; init: RequestInit | undefined }> = [];
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      seenCalls.push({ url, init });
      return new Response(JSON.stringify({ tenantId: "t", role: "owner", label: "L" }), { status: 200 });
    }) as typeof fetch;
    await verifyOtpAndOnboard(client, "user@x.io", "123456");
    expect(seenCalls.length).toBe(1);
    const first = seenCalls[0];
    expect(first.url).toBe("/api/v2/onboarding");
    const headers = (first.init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer the-real-access-token");
  });

  it("segunda verificación con mismo código retorna verify_error opaco (post-uso)", async () => {
    // Simula el server: primera vez OK, segunda vez otp_expired.
    let calls = 0;
    const client = makeSupabase(async () => {
      calls += 1;
      if (calls === 1) {
        return { data: { session: fakeSession() }, error: null };
      }
      return { data: { session: null }, error: { error_code: "otp_expired", status: 403 } };
    });
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ tenantId: "t", role: "owner", label: "L" }), { status: 200 }),
    ) as typeof fetch;
    const first = await verifyOtpAndOnboard(client, "u@x.io", "123456");
    expect(first.kind).toBe("ok");
    const second = await verifyOtpAndOnboard(client, "u@x.io", "123456");
    expect(second.kind).toBe("verify_error");
    if (second.kind === "verify_error") {
      expect(second.error.public).toBe("code_invalid_or_expired");
    }
  });
});
