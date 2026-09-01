/**
 * SPABLA V2 · Hito 9.3.1-Q3-R · Tests de `fetchWithAuthRetry` con
 * `AuthRetryOutcome` discriminado. Cubre §FASE 7.B del hito Q3-R:
 *   - `response`, `terminal_auth`, `transient_auth`, `network_error`
 *     se distinguen deterministamente.
 *   - Un solo retry por invocación.
 *   - Ni transient_failure ni network_error disparan signOut o borran
 *     sesión.
 *   - Body/method/headers/clientMessageId se preservan byte-idéntico en
 *     el retry.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Session, SupabaseClient } from "@supabase/supabase-js";

import {
  __resetSessionRefreshCoordinatorForTests,
} from "./session-refresh-coordinator";
import { fetchWithAuthRetry } from "./fetch-with-auth-retry";

afterEach(() => {
  __resetSessionRefreshCoordinatorForTests();
  vi.restoreAllMocks();
});

type FakeAuth = {
  refreshSession: ReturnType<typeof vi.fn>;
  getSession: ReturnType<typeof vi.fn>;
};

function buildFakeClient(auth: FakeAuth): SupabaseClient {
  return { auth } as unknown as SupabaseClient;
}

function fakeSession(token: string): Session {
  return {
    access_token: token,
    refresh_token: "REDACTED-refresh",
    expires_in: 3600,
    token_type: "bearer",
    user: { id: "00000000-0000-4000-8000-000000000001" },
  } as unknown as Session;
}

function mockResponse(status: number): Response {
  return new Response("{}", { status, headers: { "content-type": "application/json" } });
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch");
});

describe("fetchWithAuthRetry (Q3-R)", () => {
  test("200 → { response } sin refresh ni retry", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("t1") } })),
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(200));
    const outcome = await fetchWithAuthRetry(buildFakeClient(auth), "/api/v2/messages");
    expect(outcome.kind).toBe("response");
    if (outcome.kind === "response") expect(outcome.response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });

  test("401 → refresh renewed → retry 200 → { response 200 }", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(async () => ({
        data: { session: fakeSession("NEW"), user: null },
        error: null,
      })),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("OLD") } })),
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(401));
    fetchSpy.mockResolvedValueOnce(mockResponse(200));
    const outcome = await fetchWithAuthRetry(buildFakeClient(auth), "/api/v2/messages");
    expect(outcome.kind).toBe("response");
    if (outcome.kind === "response") expect(outcome.response.status).toBe(200);
    const retryInit = fetchSpy.mock.calls[1][1] as RequestInit;
    const retryHeaders = new Headers(retryInit.headers);
    expect(retryHeaders.get("Authorization")).toBe("Bearer NEW");
  });

  test("401 → refresh renewed → retry 401 → { terminal_auth response }", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(async () => ({
        data: { session: fakeSession("NEW"), user: null },
        error: null,
      })),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("OLD") } })),
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(401));
    fetchSpy.mockResolvedValueOnce(mockResponse(401));
    const outcome = await fetchWithAuthRetry(buildFakeClient(auth), "/api/v2/messages");
    expect(outcome.kind).toBe("terminal_auth");
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  test("401 → refresh no_session → { terminal_auth first401 }", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(async () => ({
        data: { session: null, user: null },
        error: null,
      })),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("OLD") } })),
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(401));
    const outcome = await fetchWithAuthRetry(buildFakeClient(auth), "/api/v2/messages");
    expect(outcome.kind).toBe("terminal_auth");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("401 → refresh terminal_invalid → { terminal_auth first401 }", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(async () => ({
        data: { session: null, user: null },
        error: new Error("invalid_grant"),
      })),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("OLD") } })),
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(401));
    const outcome = await fetchWithAuthRetry(buildFakeClient(auth), "/api/v2/messages");
    expect(outcome.kind).toBe("terminal_auth");
  });

  test("401 → refresh transient_failure → { transient_auth error } (sesión conservada)", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(async () => ({
        data: { session: null, user: null },
        error: new Error("network timeout"),
      })),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("OLD") } })),
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(401));
    const outcome = await fetchWithAuthRetry(buildFakeClient(auth), "/api/v2/messages");
    expect(outcome.kind).toBe("transient_auth");
    // Nunca returna un 401 en transient para evitar que un caller
    // ingenuo dispare signOut destructivo.
    if (outcome.kind === "transient_auth") {
      expect(outcome.error.category).toBe("transient_failure");
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("network error inicial → { network_error error }", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("t") } })),
    };
    fetchSpy.mockRejectedValueOnce(new Error("fetch failed"));
    const outcome = await fetchWithAuthRetry(buildFakeClient(auth), "/api/v2/messages");
    expect(outcome.kind).toBe("network_error");
    // network_error nunca dispara refresh
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });

  test("network error durante retry (post refresh renewed) → { network_error }", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(async () => ({
        data: { session: fakeSession("NEW"), user: null },
        error: null,
      })),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("OLD") } })),
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(401));
    fetchSpy.mockRejectedValueOnce(new Error("fetch failed"));
    const outcome = await fetchWithAuthRetry(buildFakeClient(auth), "/api/v2/messages");
    expect(outcome.kind).toBe("network_error");
  });

  test("400/403/404/409/500/503 no disparan refresh y devuelven { response }", async () => {
    for (const status of [400, 403, 404, 409, 500, 503]) {
      const auth: FakeAuth = {
        refreshSession: vi.fn(),
        getSession: vi.fn(async () => ({ data: { session: fakeSession("t") } })),
      };
      fetchSpy.mockResolvedValueOnce(mockResponse(status));
      const outcome = await fetchWithAuthRetry(buildFakeClient(auth), "/api/v2/messages");
      expect(outcome.kind).toBe("response");
      if (outcome.kind === "response") expect(outcome.response.status).toBe(status);
      expect(auth.refreshSession).not.toHaveBeenCalled();
    }
  });

  test("POST body y clientMessageId se preservan byte-idéntico en el retry", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(async () => ({
        data: { session: fakeSession("NEW"), user: null },
        error: null,
      })),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("OLD") } })),
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(401));
    fetchSpy.mockResolvedValueOnce(mockResponse(200));
    const body = JSON.stringify({
      tenantId: "00000000-0000-4000-8000-00000000000a",
      conversationId: "00000000-0000-4000-8000-00000000000b",
      text: "hola",
      language: "es",
      clientMessageId: "00000000-0000-4000-8000-00000000000c",
    });
    const outcome = await fetchWithAuthRetry(buildFakeClient(auth), "/api/v2/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    expect(outcome.kind).toBe("response");
    const retryInit = fetchSpy.mock.calls[1][1] as RequestInit;
    expect(retryInit.method).toBe("POST");
    expect(retryInit.body).toBe(body);
    const retryHeaders = new Headers(retryInit.headers);
    expect(retryHeaders.get("Content-Type")).toBe("application/json");
    expect(retryHeaders.get("Authorization")).toBe("Bearer NEW");
  });

  test("sin sesión activa, 401 → refresh no_session → { terminal_auth }", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(async () => ({
        data: { session: null, user: null },
        error: null,
      })),
      getSession: vi.fn(async () => ({ data: { session: null } })),
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(401));
    const outcome = await fetchWithAuthRetry(buildFakeClient(auth), "/api/v2/messages");
    expect(outcome.kind).toBe("terminal_auth");
  });

  test("máximo un refresh por invocación (segundo 401 tras retry no re-refresca)", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(async () => ({
        data: { session: fakeSession("NEW"), user: null },
        error: null,
      })),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("OLD") } })),
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(401));
    fetchSpy.mockResolvedValueOnce(mockResponse(401));
    await fetchWithAuthRetry(buildFakeClient(auth), "/api/v2/messages");
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
