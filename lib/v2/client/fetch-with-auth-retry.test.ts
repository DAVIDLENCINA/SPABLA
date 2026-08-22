/**
 * SPABLA V2 · Hito 9.3.1-Q3 · Tests unitarios de `fetchWithAuthRetry`.
 *
 * Verifican Q2 §7:
 *   - 200 no dispara refresh ni retry.
 *   - 401 dispara un refresh single-flight y, si es renewed, reintenta
 *     una única vez con el nuevo access_token.
 *   - Un segundo 401 tras el retry NO refresca de nuevo.
 *   - Errores 400/403/404/409/5xx no disparan refresh.
 *   - El body/method/headers custom del `init` se preservan en el retry.
 */

import { afterEach, describe, expect, test, vi, beforeEach } from "vitest";

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
    user: {
      id: "00000000-0000-4000-8000-000000000001",
    },
  } as unknown as Session;
}

function mockResponse(status: number): Response {
  return new Response("{}", { status, headers: { "content-type": "application/json" } });
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch");
});

describe("fetchWithAuthRetry", () => {
  test("200 primer intento no dispara refresh ni retry", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("t1") } })),
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(200));
    const client = buildFakeClient(auth);
    const res = await fetchWithAuthRetry(client, "/api/v2/messages");
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });

  test("401 → refresh renewed → retry con nuevo token → 200", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(async () => ({
        data: { session: fakeSession("NEW-token"), user: null },
        error: null,
      })),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("OLD-token") } })),
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(401));
    fetchSpy.mockResolvedValueOnce(mockResponse(200));
    const client = buildFakeClient(auth);
    const res = await fetchWithAuthRetry(client, "/api/v2/messages");
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    const retryHeaders = new Headers(
      (fetchSpy.mock.calls[1][1] as RequestInit).headers,
    );
    expect(retryHeaders.get("Authorization")).toBe("Bearer NEW-token");
  });

  test("401 → refresh no_session → devuelve el 401 original sin retry", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(async () => ({
        data: { session: null, user: null },
        error: null,
      })),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("OLD") } })),
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(401));
    const client = buildFakeClient(auth);
    const res = await fetchWithAuthRetry(client, "/api/v2/messages");
    expect(res.status).toBe(401);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("401 → refresh failed → devuelve el 401 original sin retry", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(async () => ({
        data: { session: null, user: null },
        error: new Error("Invalid refresh_token"),
      })),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("OLD") } })),
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(401));
    const client = buildFakeClient(auth);
    const res = await fetchWithAuthRetry(client, "/api/v2/messages");
    expect(res.status).toBe(401);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("401 → refresh renewed → retry devuelve 401 → devuelve el 401 del retry sin refrescar de nuevo", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(async () => ({
        data: { session: fakeSession("NEW"), user: null },
        error: null,
      })),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("OLD") } })),
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(401));
    fetchSpy.mockResolvedValueOnce(mockResponse(401));
    const client = buildFakeClient(auth);
    const res = await fetchWithAuthRetry(client, "/api/v2/messages");
    expect(res.status).toBe(401);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  test("400/403/404/409/500/503 no disparan refresh", async () => {
    for (const status of [400, 403, 404, 409, 500, 503]) {
      const auth: FakeAuth = {
        refreshSession: vi.fn(),
        getSession: vi.fn(async () => ({ data: { session: fakeSession("t") } })),
      };
      fetchSpy.mockResolvedValueOnce(mockResponse(status));
      const client = buildFakeClient(auth);
      const res = await fetchWithAuthRetry(client, "/api/v2/messages");
      expect(res.status).toBe(status);
      expect(auth.refreshSession).not.toHaveBeenCalled();
    }
  });

  test("preserva body y método POST en el retry con el token nuevo", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(async () => ({
        data: { session: fakeSession("NEW"), user: null },
        error: null,
      })),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("OLD") } })),
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(401));
    fetchSpy.mockResolvedValueOnce(mockResponse(200));
    const client = buildFakeClient(auth);
    const body = JSON.stringify({
      tenantId: "00000000-0000-4000-8000-00000000000a",
      conversationId: "00000000-0000-4000-8000-00000000000b",
      text: "hola",
      language: "es",
      clientMessageId: "00000000-0000-4000-8000-00000000000c",
    });
    const res = await fetchWithAuthRetry(client, "/api/v2/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    expect(res.status).toBe(200);
    const retryInit = fetchSpy.mock.calls[1][1] as RequestInit;
    expect(retryInit.method).toBe("POST");
    expect(retryInit.body).toBe(body);
    const retryHeaders = new Headers(retryInit.headers);
    expect(retryHeaders.get("Content-Type")).toBe("application/json");
    expect(retryHeaders.get("Authorization")).toBe("Bearer NEW");
  });

  test("sin sesión activa, no atacha Authorization y devuelve el resultado directo", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(),
      getSession: vi.fn(async () => ({ data: { session: null } })),
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(401));
    const client = buildFakeClient(auth);
    const res = await fetchWithAuthRetry(client, "/api/v2/messages");
    expect(res.status).toBe(401);
    // 401 without a session must still trigger refresh (spec: single-
    // flight refresh runs regardless of whether the initial request had
    // a token). The refresh will return no_session and the caller
    // downstream will trigger recovery.
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
  });
});
