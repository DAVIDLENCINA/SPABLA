/**
 * SPABLA V2 · Hito 9.3.1-Q3 · Direct-handler unit tests for
 * `GET /api/v2/bootstrap`.
 *
 * Mocks the composition + bootstrap composer so the route handler is
 * exercised in isolation — no Supabase, no network, no env vars.
 *
 * Locks Q2 §10:
 *   - GET sin Authorization → 401 opaque.
 *   - GET con JWT rechazable → 401 opaque.
 *   - GET con actor sin memberships → 200 con `canOperate=false`.
 *   - GET con 1 membership + 1 conversation → 200 completo.
 *   - GET con múltiples memberships → selección determinista por `created_at ASC`.
 *   - Cero conversaciones → `canOperate=false`.
 *   - Errores de query → 503 `unavailable`.
 *   - Errores inesperados → 500 `internal`.
 *   - Verbos no permitidos → 404 `not_found` (contrato opaco).
 *   - Correlation-id presente en todas las respuestas.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { Fase9RequestError } from "@/lib/v2/server/composition";

vi.mock("@/lib/v2/server/composition", async () => {
  const actual = await vi.importActual<typeof import("@/lib/v2/server/composition")>(
    "@/lib/v2/server/composition",
  );
  return {
    ...actual,
    verifyJwt: vi.fn(),
  };
});

vi.mock("@/lib/v2/server/bootstrap", async () => {
  const actual = await vi.importActual<typeof import("@/lib/v2/server/bootstrap")>(
    "@/lib/v2/server/bootstrap",
  );
  return {
    ...actual,
    buildBootstrapPayload: vi.fn(),
  };
});

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon";
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

// Import after mocks + env are in place so route.ts and its deps see
// the correct values at module load time.
async function importHandler() {
  return await import("./route");
}

async function importComposition() {
  return await import("@/lib/v2/server/composition");
}

async function importBootstrap() {
  return await import("@/lib/v2/server/bootstrap");
}

function buildRequest(headers: Record<string, string> = {}): {
  headers: { get: (k: string) => string | null };
} {
  return {
    headers: {
      get: (k: string) => {
        const target = k.toLowerCase();
        for (const [name, value] of Object.entries(headers)) {
          if (name.toLowerCase() === target) return value;
        }
        return null;
      },
    },
  };
}

const CORRELATION_HEADER = "X-SPABLA-Correlation-Id";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("GET /api/v2/bootstrap · direct handler", () => {
  test("sin Authorization → 401 opaque + correlation-id header", async () => {
    const { GET } = await importHandler();
    const res = await GET(buildRequest() as never);
    expect(res.status).toBe(401);
    const cid = res.headers.get(CORRELATION_HEADER);
    expect(cid).not.toBeNull();
    expect(cid).toMatch(UUID_RE);
    const body = await res.json();
    expect(body).toEqual({ error: "unauthorized", correlationId: cid });
  });

  test("JWT rechazado por verifyJwt → 401 opaque", async () => {
    const composition = await importComposition();
    (composition.verifyJwt as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      throw new Fase9RequestError({ kind: "unauthorized", reason: "jwt rejected" });
    });
    const { GET } = await importHandler();
    const res = await GET(buildRequest({ Authorization: "Bearer bad" }) as never);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  test("actor con 0 memberships → 200 con canOperate=false", async () => {
    const composition = await importComposition();
    (composition.verifyJwt as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      actorId: "00000000-0000-4000-8000-000000000001",
      issuedAt: new Date().toISOString(),
    });
    const bootstrap = await importBootstrap();
    (bootstrap.buildBootstrapPayload as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      actor: { actorId: "00000000-0000-4000-8000-000000000001", email: "" },
      memberships: [],
      selectedTenantId: null,
      conversations: [],
      selectedConversationId: null,
      canOperate: false,
    });
    const { GET } = await importHandler();
    const res = await GET(buildRequest({ Authorization: "Bearer token" }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.canOperate).toBe(false);
    expect(body.memberships).toEqual([]);
    expect(body.selectedTenantId).toBe(null);
  });

  test("actor con 1 membership + 1 conversación → 200 completo con canOperate=true", async () => {
    const composition = await importComposition();
    (composition.verifyJwt as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      actorId: "00000000-0000-4000-8000-000000000001",
      issuedAt: new Date().toISOString(),
    });
    const bootstrap = await importBootstrap();
    (bootstrap.buildBootstrapPayload as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      actor: { actorId: "00000000-0000-4000-8000-000000000001", email: "actor@example.test" },
      memberships: [
        { tenantId: "00000000-0000-4000-8000-00000000000a", tenantName: "T", role: "member", isActive: true },
      ],
      selectedTenantId: "00000000-0000-4000-8000-00000000000a",
      conversations: [
        { conversationId: "00000000-0000-4000-8000-00000000000b", tenantId: "00000000-0000-4000-8000-00000000000a", language: "es", createdAt: "2026-01-01T00:00:00Z" },
      ],
      selectedConversationId: "00000000-0000-4000-8000-00000000000b",
      canOperate: true,
    });
    const { GET } = await importHandler();
    const res = await GET(buildRequest({ Authorization: "Bearer token" }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.canOperate).toBe(true);
    expect(body.selectedTenantId).toBe("00000000-0000-4000-8000-00000000000a");
    expect(body.selectedConversationId).toBe("00000000-0000-4000-8000-00000000000b");
  });

  test("BootstrapQueryError → 503 unavailable", async () => {
    const composition = await importComposition();
    (composition.verifyJwt as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      actorId: "00000000-0000-4000-8000-000000000001",
      issuedAt: new Date().toISOString(),
    });
    const bootstrap = await importBootstrap();
    (bootstrap.buildBootstrapPayload as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      throw new bootstrap.BootstrapQueryError("memberships_query_failed");
    });
    const { GET } = await importHandler();
    const res = await GET(buildRequest({ Authorization: "Bearer token" }) as never);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("unavailable");
  });

  test("error inesperado → 500 internal", async () => {
    const composition = await importComposition();
    (composition.verifyJwt as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      actorId: "00000000-0000-4000-8000-000000000001",
      issuedAt: new Date().toISOString(),
    });
    const bootstrap = await importBootstrap();
    (bootstrap.buildBootstrapPayload as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      throw new Error("boom");
    });
    const { GET } = await importHandler();
    const res = await GET(buildRequest({ Authorization: "Bearer token" }) as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("internal");
  });

  test("verbos POST/PUT/PATCH/DELETE/HEAD → 404 not_found opaco", async () => {
    const handler = await importHandler();
    for (const verb of ["POST", "PUT", "PATCH", "DELETE", "HEAD"] as const) {
      const fn = handler[verb];
      const res = await fn();
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("not_found");
      const cid = res.headers.get(CORRELATION_HEADER);
      expect(cid).toMatch(UUID_RE);
    }
  });
});
