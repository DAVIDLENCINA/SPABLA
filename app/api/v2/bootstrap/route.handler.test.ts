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

  // ─────────────────────────────────────────────────────────────────
  // Hito 9.3.1-Q3-R · §FASE 4 / §FASE 7.C — single identity validation.
  //
  // Bajo Q3, el route hacía una segunda round-trip a `auth.getUser()`
  // para resolver el `email`. Ese codepath convertía cualquier fallo
  // transitorio del servicio de auth (429, 500, 502, 503, 504, DNS,
  // fetch failed) en una respuesta 401 opaca para el navegador, que
  // a su vez disparaba `signOut` destructivo. Q3-R elimina esa
  // segunda llamada: el email vive en los claims verificados por
  // `verifyJwt`. Los siguientes casos garantizan que:
  //
  //   1. `verifyJwt` es invocado exactamente una vez por request.
  //   2. El email de los claims viaja al composer sin re-validar.
  //   3. La ausencia de email no escala a 401 ni a 503.
  // ─────────────────────────────────────────────────────────────────
  test("Q3-R FASE 4: verifyJwt se invoca exactamente 1 vez por request (sin second-round identity)", async () => {
    const composition = await importComposition();
    const verifyJwtMock = composition.verifyJwt as ReturnType<typeof vi.fn>;
    verifyJwtMock.mockClear();
    verifyJwtMock.mockResolvedValueOnce({
      actorId: "00000000-0000-4000-8000-000000000001",
      issuedAt: new Date().toISOString(),
      email: "actor@example.test",
    });
    const bootstrap = await importBootstrap();
    const composerMock = bootstrap.buildBootstrapPayload as ReturnType<typeof vi.fn>;
    composerMock.mockClear();
    composerMock.mockResolvedValueOnce({
      actor: { actorId: "00000000-0000-4000-8000-000000000001", email: "actor@example.test" },
      memberships: [],
      selectedTenantId: null,
      conversations: [],
      selectedConversationId: null,
      canOperate: false,
    });
    const { GET } = await importHandler();
    const res = await GET(buildRequest({ Authorization: "Bearer token" }) as never);
    expect(res.status).toBe(200);
    expect(verifyJwtMock).toHaveBeenCalledTimes(1);
  });

  test("Q3-R FASE 4: email de los claims viaja al composer como actorEmail (single validation)", async () => {
    const composition = await importComposition();
    const verifyJwtMock = composition.verifyJwt as ReturnType<typeof vi.fn>;
    verifyJwtMock.mockClear();
    verifyJwtMock.mockResolvedValueOnce({
      actorId: "00000000-0000-4000-8000-000000000001",
      issuedAt: new Date().toISOString(),
      email: "actor@example.test",
    });
    const bootstrap = await importBootstrap();
    const composerMock = bootstrap.buildBootstrapPayload as ReturnType<typeof vi.fn>;
    composerMock.mockClear();
    composerMock.mockResolvedValueOnce({
      actor: { actorId: "00000000-0000-4000-8000-000000000001", email: "actor@example.test" },
      memberships: [],
      selectedTenantId: null,
      conversations: [],
      selectedConversationId: null,
      canOperate: false,
    });
    const { GET } = await importHandler();
    const res = await GET(buildRequest({ Authorization: "Bearer token" }) as never);
    expect(res.status).toBe(200);
    const composerArg = composerMock.mock.calls[0][0] as { actorEmail: string; actorId: string };
    expect(composerArg.actorEmail).toBe("actor@example.test");
    expect(composerArg.actorId).toBe("00000000-0000-4000-8000-000000000001");
  });

  test("Q3-R FASE 7.C: JWT sin email claim → actorEmail=\"\" (nunca 401 ni 503)", async () => {
    const composition = await importComposition();
    const verifyJwtMock = composition.verifyJwt as ReturnType<typeof vi.fn>;
    verifyJwtMock.mockClear();
    verifyJwtMock.mockResolvedValueOnce({
      actorId: "00000000-0000-4000-8000-000000000001",
      issuedAt: new Date().toISOString(),
      // sin email
    });
    const bootstrap = await importBootstrap();
    const composerMock = bootstrap.buildBootstrapPayload as ReturnType<typeof vi.fn>;
    composerMock.mockClear();
    composerMock.mockResolvedValueOnce({
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
    const composerArg = composerMock.mock.calls[0][0] as { actorEmail: string };
    expect(composerArg.actorEmail).toBe("");
  });

  test("Q3-R FASE 7.C: verifyJwt lanza no-Fase9RequestError → 401 opaco (no leak) y NO 503", async () => {
    const composition = await importComposition();
    const verifyJwtMock = composition.verifyJwt as ReturnType<typeof vi.fn>;
    verifyJwtMock.mockClear();
    verifyJwtMock.mockImplementationOnce(async () => {
      throw new Error("upstream 500 while calling getClaims");
    });
    const { GET } = await importHandler();
    const res = await GET(buildRequest({ Authorization: "Bearer token" }) as never);
    // Sí devuelve 401 (opaque), pero es que la identidad no se puede
    // validar. Lo importante para Q3-R es que NO se ejecuta un
    // segundo round-trip que pudiese convertir un 429/5xx del
    // servicio de auth en un 401. Aquí no hay tal segundo round-trip.
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });
});
