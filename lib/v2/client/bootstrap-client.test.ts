/**
 * SPABLA V2 · Hito 9.3.1-Q3 · Tests unitarios de `fetchBootstrap`.
 *
 * Verifican Q2 §10: interpretación tipada de respuestas del endpoint
 * `GET /api/v2/bootstrap`, mapeo a `BootstrapOutcome`, resistencia a
 * bodies malformados y integración con `fetchWithAuthRetry`.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Session, SupabaseClient } from "@supabase/supabase-js";

import { fetchBootstrap } from "./bootstrap-client";
import {
  __resetSessionRefreshCoordinatorForTests,
} from "./session-refresh-coordinator";

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

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const OK_PAYLOAD = {
  actor: { actorId: "00000000-0000-4000-8000-000000000001", email: "actor@example.test" },
  memberships: [
    {
      tenantId: "00000000-0000-4000-8000-00000000000a",
      tenantName: "Tenant A",
      role: "member",
      isActive: true,
    },
  ],
  selectedTenantId: "00000000-0000-4000-8000-00000000000a",
  conversations: [
    {
      conversationId: "00000000-0000-4000-8000-00000000000b",
      tenantId: "00000000-0000-4000-8000-00000000000a",
      language: "es",
      createdAt: "2026-08-22T12:00:00Z",
    },
  ],
  selectedConversationId: "00000000-0000-4000-8000-00000000000b",
  canOperate: true,
};

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch");
});

describe("fetchBootstrap", () => {
  test("200 con payload válido → ok", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("t") } })),
    };
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, OK_PAYLOAD));
    const outcome = await fetchBootstrap(buildFakeClient(auth));
    expect(outcome.kind).toBe("ok");
    if (outcome.kind === "ok") {
      expect(outcome.payload.canOperate).toBe(true);
      expect(outcome.payload.selectedTenantId).toBe("00000000-0000-4000-8000-00000000000a");
      expect(outcome.payload.memberships).toHaveLength(1);
      expect(outcome.payload.conversations).toHaveLength(1);
    }
  });

  test("401 con refresh terminal_invalid → unauthorized", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(async () => ({
        data: { session: null, user: null },
        error: new Error("invalid_grant: refresh_token has expired"),
      })),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("t") } })),
    };
    fetchSpy.mockResolvedValueOnce(jsonResponse(401, { error: "unauthorized" }));
    const outcome = await fetchBootstrap(buildFakeClient(auth));
    expect(outcome.kind).toBe("unauthorized");
  });

  test("401 con refresh transient_failure → transient (Q3-R: sesión preservada)", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(async () => ({
        data: { session: null, user: null },
        error: new Error("network timeout"),
      })),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("t") } })),
    };
    fetchSpy.mockResolvedValueOnce(jsonResponse(401, { error: "unauthorized" }));
    const outcome = await fetchBootstrap(buildFakeClient(auth));
    expect(outcome.kind).toBe("transient");
  });

  test("503 → transient con status", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("t") } })),
    };
    fetchSpy.mockResolvedValueOnce(jsonResponse(503, { error: "unavailable" }));
    const outcome = await fetchBootstrap(buildFakeClient(auth));
    expect(outcome.kind).toBe("transient");
    if (outcome.kind === "transient") {
      expect(outcome.status).toBe(503);
    }
  });

  test("500 → transient con status", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("t") } })),
    };
    fetchSpy.mockResolvedValueOnce(jsonResponse(500, { error: "internal" }));
    const outcome = await fetchBootstrap(buildFakeClient(auth));
    expect(outcome.kind).toBe("transient");
  });

  test("body no-JSON → malformed", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("t") } })),
    };
    fetchSpy.mockResolvedValueOnce(new Response("not-json", { status: 200 }));
    const outcome = await fetchBootstrap(buildFakeClient(auth));
    expect(outcome.kind).toBe("malformed");
  });

  test("payload sin campos requeridos → malformed", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("t") } })),
    };
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { actor: null }));
    const outcome = await fetchBootstrap(buildFakeClient(auth));
    expect(outcome.kind).toBe("malformed");
  });

  test("network error → network", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("t") } })),
    };
    fetchSpy.mockRejectedValueOnce(new Error("fetch failed"));
    const outcome = await fetchBootstrap(buildFakeClient(auth));
    expect(outcome.kind).toBe("network");
  });

  test("payload con canOperate=false y sin conversaciones → ok con canOperate=false", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("t") } })),
    };
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, {
        actor: { actorId: "00000000-0000-4000-8000-000000000001", email: "actor@example.test" },
        memberships: [],
        selectedTenantId: null,
        conversations: [],
        selectedConversationId: null,
        canOperate: false,
      }),
    );
    const outcome = await fetchBootstrap(buildFakeClient(auth));
    expect(outcome.kind).toBe("ok");
    if (outcome.kind === "ok") {
      expect(outcome.payload.canOperate).toBe(false);
      expect(outcome.payload.memberships).toHaveLength(0);
      expect(outcome.payload.selectedTenantId).toBe(null);
    }
  });
});
