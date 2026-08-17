/**
 * SPABLA V2 · Hito 9.2.5-D · Direct-handler unit tests for
 * `GET /api/v2/messages` and `POST /api/v2/messages`.
 *
 * This suite mocks the composition layer and the translation runtime
 * so it exercises route.ts in isolation — no Supabase, no network, no
 * OpenAI, no env vars required. It complements the integration suite
 * (`route.integration.test.ts`), which runs against a live Supabase
 * local when env vars are present.
 *
 * The suite locks the canonical 9.2.5-D semantics:
 *
 *   - Every response carries `X-SPABLA-Correlation-Id: <UUID v4>`.
 *   - 4xx/5xx bodies echo the same UUID as `correlationId`.
 *   - 2xx bodies preserve their existing shape (no `correlationId`
 *     injected).
 *   - Public error codes are drawn from a closed 7-item alphabet:
 *     `bad_request | unauthorized | forbidden | not_found | conflict |
 *      unavailable | internal`.
 *   - The three POST scenarios that were previously distinguishable
 *     (persistence throws `not_found`, `unauthorized`, or a bare
 *     "hidden" error) all produce the same 404 body — closes the
 *     enumeration channel.
 *   - Only 401 emits `X-SPABLA-Correlation-Id` on a body whose `error`
 *     is `unauthorized`; every other 4xx/5xx keeps the same envelope
 *     shape, so `shouldTriggerAuth401Recovery` triggers ONLY on true
 *     authentication failures.
 *   - Routine 400 responses do NOT emit a server log line.
 *   - 401, 404 (from persistence), 409, 503 and 500 emit a single
 *     structured `console.error` line with whitelisted fields.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { Fase9RequestError } from "@/lib/v2/server/composition";

// Mock all server-only collaborators so route.ts is exercised in
// pure form. The mocks are stateful across a `describe` — reset in
// `beforeEach`.
vi.mock("@/lib/v2/server/composition", async () => {
  const actual = await vi.importActual<typeof import("@/lib/v2/server/composition")>(
    "@/lib/v2/server/composition",
  );
  return {
    ...actual,
    buildRequestScopedPersistence: vi.fn(),
  };
});

vi.mock("@/lib/v2/server/translation-runtime", () => ({
  buildTranslationStore: vi.fn(() => ({})),
  getProcessSingleFlight: vi.fn(() => ({})),
  openAIProviderForTranslationStore: vi.fn(),
  CURRENT_TRANSLATION_VERSION: "v-test",
}));

vi.mock("@engine/adapters/translation-store/resolve-translated-messages", () => ({
  resolveTranslatedMessages: vi.fn(),
}));

import { NextRequest } from "next/server";

import { buildRequestScopedPersistence } from "@/lib/v2/server/composition";
import { resolveTranslatedMessages } from "@engine/adapters/translation-store/resolve-translated-messages";

import { CORRELATION_HEADER, GET, POST } from "./route";

const buildScope = vi.mocked(buildRequestScopedPersistence);
const resolve = vi.mocked(resolveTranslatedMessages);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const A_UUID = "00000000-0000-0000-0000-000000000001";
const B_UUID = "00000000-0000-0000-0000-000000000002";
const C_UUID = "00000000-0000-0000-0000-000000000003";

function getRequest(query: string, token: string | null = "valid.jwt.token"): NextRequest {
  const url = `http://localhost/api/v2/messages${query}`;
  const headers: Record<string, string> = {};
  if (token !== null) headers["Authorization"] = `Bearer ${token}`;
  return new NextRequest(url, { method: "GET", headers });
}

function postRequest(
  body: unknown,
  { token = "valid.jwt.token", raw = false }: { token?: string | null; raw?: boolean } = {},
): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token !== null) headers["Authorization"] = `Bearer ${token}`;
  return new NextRequest("http://localhost/api/v2/messages", {
    method: "POST",
    headers,
    body: raw ? (body as BodyInit) : JSON.stringify(body),
  });
}

function scopeStub(actorId = A_UUID) {
  return {
    persistence: { saveMessage: vi.fn().mockResolvedValue(undefined) } as unknown as Parameters<typeof resolve>[0]["persistence"],
    tenantContext: { tenantId: A_UUID, identity: { actorId } } as unknown as Parameters<typeof resolve>[0]["tenantContext"],
    actor: { actorId, issuedAt: "2026-08-17T00:00:00.000Z" },
    authenticated: {} as never,
  };
}

const VALID_GET_QUERY = `?tenantId=${A_UUID}&conversationId=${B_UUID}&to=en`;

beforeEach(() => {
  buildScope.mockReset();
  resolve.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ────────────────────────────────────────────────────────────────
// Correlation invariant — present on EVERY response
// ────────────────────────────────────────────────────────────────

describe("X-SPABLA-Correlation-Id envelope", () => {
  test("GET success carries a UUID header but does NOT inject correlationId into the 2xx body", async () => {
    const scope = scopeStub();
    buildScope.mockResolvedValueOnce(scope as never);
    resolve.mockResolvedValueOnce({ items: [], actorId: A_UUID } as never);

    const res = await GET(getRequest(VALID_GET_QUERY));
    expect(res.status).toBe(200);
    const cid = res.headers.get(CORRELATION_HEADER);
    expect(cid).toMatch(UUID_RE);
    const body = await res.json();
    expect(body).toEqual({ items: [], actorId: A_UUID });
    expect(Object.keys(body).sort()).toEqual(["actorId", "items"]);
  });

  test("POST success carries a UUID header but does NOT inject correlationId into the 2xx body", async () => {
    const scope = scopeStub();
    buildScope.mockResolvedValueOnce(scope as never);
    const req = postRequest({
      tenantId: A_UUID,
      conversationId: B_UUID,
      text: "hola",
      language: "es",
      clientMessageId: C_UUID,
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(res.headers.get(CORRELATION_HEADER)).toMatch(UUID_RE);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["createdAt", "messageId", "senderId"]);
  });

  test("Every error response echoes the same correlation id in body and header", async () => {
    // Trigger a structural 400 (no persistence involvement).
    const res = await GET(getRequest("?tenantId=not-a-uuid&conversationId=x&to=en"));
    expect(res.status).toBe(400);
    const cid = res.headers.get(CORRELATION_HEADER);
    expect(cid).toMatch(UUID_RE);
    const body = await res.json();
    expect(body).toEqual({ error: "bad_request", correlationId: cid });
  });
});

// ────────────────────────────────────────────────────────────────
// Structural 400 — unified `bad_request`, NO server log
// ────────────────────────────────────────────────────────────────

describe("400 · structural failures are all bad_request and never emit a log", () => {
  test.each([
    ["GET · malformed conversation UUID", () => GET(getRequest(`?tenantId=${A_UUID}&conversationId=nope&to=en`))],
    ["GET · unsupported language", () => GET(getRequest(`?tenantId=${A_UUID}&conversationId=${B_UUID}&to=xx`))],
    ["POST · invalid JSON body", () => POST(postRequest("not-json", { raw: true }))],
    ["POST · malformed conversation UUID", () => POST(postRequest({
      tenantId: A_UUID, conversationId: "nope", text: "hi", language: "es", clientMessageId: C_UUID,
    }))],
    ["POST · unsupported language", () => POST(postRequest({
      tenantId: A_UUID, conversationId: B_UUID, text: "hi", language: "xx", clientMessageId: C_UUID,
    }))],
    ["POST · empty text", () => POST(postRequest({
      tenantId: A_UUID, conversationId: B_UUID, text: "   ", language: "es", clientMessageId: C_UUID,
    }))],
    ["POST · text too long", () => POST(postRequest({
      tenantId: A_UUID, conversationId: B_UUID, text: "x".repeat(1001), language: "es", clientMessageId: C_UUID,
    }))],
    ["POST · invalid clientMessageId", () => POST(postRequest({
      tenantId: A_UUID, conversationId: B_UUID, text: "hi", language: "es", clientMessageId: "nope",
    }))],
    ["POST · invalid tenantId via composition", async () => {
      buildScope.mockRejectedValueOnce(new Fase9RequestError({ kind: "invalid_tenant", reason: "tenant id malformed" }));
      return POST(postRequest({
        tenantId: "nope", conversationId: B_UUID, text: "hi", language: "es", clientMessageId: C_UUID,
      }));
    }],
  ])("%s → 400 bad_request + correlation, no console.error", async (_label, run) => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await run();
    expect(res.status).toBe(400);
    const cid = res.headers.get(CORRELATION_HEADER);
    expect(cid).toMatch(UUID_RE);
    await expect(res.json()).resolves.toEqual({ error: "bad_request", correlationId: cid });
    expect(errSpy).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────
// Authentication 401 — sanitized log emitted, opaque body
// ────────────────────────────────────────────────────────────────

describe("401 · authentication failures", () => {
  test.each([
    ["missing Authorization", { kind: "unauthorized" as const, reason: "missing authorization header" }],
    ["wrong scheme", { kind: "unauthorized" as const, reason: "invalid authorization scheme" }],
    ["empty bearer", { kind: "unauthorized" as const, reason: "empty bearer token" }],
    ["JWT malformed", { kind: "unauthorized" as const, reason: "jwt verification failed" }],
    ["JWT bad signature", { kind: "unauthorized" as const, reason: "jwt rejected" }],
    ["JWT expired", { kind: "unauthorized" as const, reason: "jwt verification failed" }],
    ["JWT subject invalid", { kind: "unauthorized" as const, reason: "jwt subject invalid" }],
  ])("GET %s → 401 unauthorized with correlation + sanitized log", async (_label, detail) => {
    buildScope.mockRejectedValueOnce(new Fase9RequestError(detail));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(getRequest(VALID_GET_QUERY));
    expect(res.status).toBe(401);
    const cid = res.headers.get(CORRELATION_HEADER);
    expect(cid).toMatch(UUID_RE);
    await expect(res.json()).resolves.toEqual({ error: "unauthorized", correlationId: cid });
    expect(errSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(errSpy.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(payload).toMatchObject({
      event: "http_error",
      endpoint: "/api/v2/messages",
      method: "GET",
      status: 401,
      code: "unauthorized",
      phase: "authentication",
      internalKind: "jwt_verification_failed",
      correlationId: cid,
    });
  });

  test("assertIdentity mismatch surfaces as 401 with correlation (identity_invalid path)", async () => {
    const scope = scopeStub();
    buildScope.mockResolvedValueOnce(scope as never);
    resolve.mockRejectedValueOnce({ code: "identity_invalid", message: "identity mismatch", retryable: false });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(getRequest(VALID_GET_QUERY));
    expect(res.status).toBe(401);
    const cid = res.headers.get(CORRELATION_HEADER);
    await expect(res.json()).resolves.toEqual({ error: "unauthorized", correlationId: cid });
    const payload = JSON.parse(errSpy.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(payload).toMatchObject({
      status: 401,
      phase: "authentication",
      internalKind: "identity_invalid",
    });
  });
});

// ────────────────────────────────────────────────────────────────
// Non-enumeration: three distinct persistence causes produce identical 404 body
// ────────────────────────────────────────────────────────────────

describe("404 · POST invisibility parity (non-enumeration)", () => {
  test("cross-tenant, inactive membership and missing conversation produce the SAME 404 body (differ only in correlationId)", async () => {
    const scope = scopeStub();
    // All three scenarios trigger the SAME persistence code (`not_found`),
    // which is the whole point: the port cannot let the boundary
    // distinguish "hidden by RLS" from "missing row".
    const bodies: Array<Record<string, unknown>> = [];
    const cids: string[] = [];
    const scenarios = ["cross-tenant", "inactive-membership", "missing-conversation"];
    for (let i = 0; i < scenarios.length; i++) {
      buildScope.mockResolvedValueOnce(scope as never);
      (scope.persistence.saveMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
        code: "not_found",
        message: "hidden_by_rls",
        retryable: false,
      });
      const res = await POST(postRequest({
        tenantId: A_UUID,
        conversationId: B_UUID,
        text: "hola",
        language: "es",
        clientMessageId: C_UUID,
      }));
      expect(res.status).toBe(404);
      const cid = res.headers.get(CORRELATION_HEADER);
      expect(cid).toMatch(UUID_RE);
      cids.push(cid!);
      const body = await res.json();
      bodies.push(body);
    }
    // Correlation ids differ across invocations.
    expect(new Set(cids).size).toBe(3);
    // Response bodies are byte-identical modulo `correlationId`.
    const stripped = bodies.map((b) => {
      const rest = { ...b };
      delete rest.correlationId;
      return rest;
    });
    expect(stripped[0]).toEqual({ error: "not_found" });
    expect(stripped[1]).toEqual(stripped[0]);
    expect(stripped[2]).toEqual(stripped[0]);
  });

  test("POST 404 emits sanitized log with phase=authorization and internalKind=hidden_by_rls", async () => {
    const scope = scopeStub();
    buildScope.mockResolvedValueOnce(scope as never);
    (scope.persistence.saveMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
      code: "not_found",
      message: "hidden_by_rls",
      retryable: false,
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(postRequest({
      tenantId: A_UUID,
      conversationId: B_UUID,
      text: "hola",
      language: "es",
      clientMessageId: C_UUID,
    }));
    expect(res.status).toBe(404);
    expect(errSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(errSpy.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(payload).toMatchObject({
      endpoint: "/api/v2/messages",
      method: "POST",
      status: 404,
      code: "not_found",
      phase: "authorization",
      internalKind: "hidden_by_rls",
    });
  });
});

// ────────────────────────────────────────────────────────────────
// 409 · idempotency collision, 503 · transient, 500 · unknown
// ────────────────────────────────────────────────────────────────

describe("Non-401/404 persistence codes", () => {
  test("conflict → 409 with correlation + sanitized log", async () => {
    const scope = scopeStub();
    buildScope.mockResolvedValueOnce(scope as never);
    (scope.persistence.saveMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
      code: "conflict",
      message: "unique_violation",
      retryable: false,
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(postRequest({
      tenantId: A_UUID,
      conversationId: B_UUID,
      text: "hola",
      language: "es",
      clientMessageId: C_UUID,
    }));
    expect(res.status).toBe(409);
    const cid = res.headers.get(CORRELATION_HEADER);
    await expect(res.json()).resolves.toEqual({ error: "conflict", correlationId: cid });
    expect(errSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(errSpy.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(payload).toMatchObject({ status: 409, phase: "integrity", internalKind: "unique_violation" });
  });

  test("unavailable → 503 with correlation + sanitized log", async () => {
    const scope = scopeStub();
    buildScope.mockResolvedValueOnce(scope as never);
    resolve.mockRejectedValueOnce({ code: "unavailable", message: "db down", retryable: true });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(getRequest(VALID_GET_QUERY));
    expect(res.status).toBe(503);
    const cid = res.headers.get(CORRELATION_HEADER);
    await expect(res.json()).resolves.toEqual({ error: "unavailable", correlationId: cid });
    expect(errSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(errSpy.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(payload).toMatchObject({ status: 503, phase: "infrastructure", internalKind: "db_transient" });
  });

  test("unknown persistence code → 500 with correlation + sanitized log", async () => {
    const scope = scopeStub();
    buildScope.mockResolvedValueOnce(scope as never);
    resolve.mockRejectedValueOnce({ code: "some_random_thing", message: "boom", retryable: false });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(getRequest(VALID_GET_QUERY));
    expect(res.status).toBe(500);
    const cid = res.headers.get(CORRELATION_HEADER);
    await expect(res.json()).resolves.toEqual({ error: "internal", correlationId: cid });
    expect(errSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(errSpy.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(payload).toMatchObject({ status: 500, phase: "internal", internalKind: "unknown" });
  });

  test("constraint_violation (e.g. cursor cross-conversation via persistence) → 400 without log", async () => {
    const scope = scopeStub();
    buildScope.mockResolvedValueOnce(scope as never);
    resolve.mockRejectedValueOnce({ code: "constraint_violation", message: "cursor error", retryable: false });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(getRequest(VALID_GET_QUERY));
    expect(res.status).toBe(400);
    const cid = res.headers.get(CORRELATION_HEADER);
    await expect(res.json()).resolves.toEqual({ error: "bad_request", correlationId: cid });
    expect(errSpy).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────
// Client auth-recovery interlock — only status 401 triggers it
// ────────────────────────────────────────────────────────────────

describe("403 · membership_denied defensive mapping (Hito 9.2.5-D corrective)", () => {
  test("persistence membership_denied → 403 forbidden with correlation + sanitized log", async () => {
    // Path: no current adapter path reaches this branch under the
    // messages endpoint (`saveMessage` intercepts SQLSTATE 42501 into
    // `not_found` for invisibility parity), but the mapper must not
    // silently degrade an incoming `membership_denied` to 500. Locks
    // the canonical 403 slot for future role-based policies.
    const scope = scopeStub();
    buildScope.mockResolvedValueOnce(scope as never);
    (scope.persistence.saveMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
      code: "membership_denied",
      message: "role denied",
      retryable: false,
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(postRequest({
      tenantId: A_UUID, conversationId: B_UUID, text: "hi", language: "es", clientMessageId: C_UUID,
    }));
    expect(res.status).toBe(403);
    const cid = res.headers.get(CORRELATION_HEADER);
    expect(cid).toMatch(UUID_RE);
    await expect(res.json()).resolves.toEqual({ error: "forbidden", correlationId: cid });
    expect(errSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(errSpy.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(payload).toMatchObject({
      status: 403,
      code: "forbidden",
      phase: "authorization",
      internalKind: "membership_denied",
    });
  });
});

describe("Correlation ID hardening (Hito 9.2.5-D corrective)", () => {
  test("emitted correlation id matches RFC 4122 UUID v4 (position 15 = '4', position 20 ∈ [89ab])", async () => {
    const res = await GET(getRequest("?tenantId=x&conversationId=nope&to=en"));
    const cid = res.headers.get(CORRELATION_HEADER) ?? "";
    expect(cid).toMatch(UUID_RE);
    // Version nibble explicitly.
    expect(cid.charAt(14)).toBe("4");
    // Variant nibble ∈ 8,9,a,b (case-insensitive).
    expect("89ab").toContain(cid.charAt(19).toLowerCase());
  });

  test("two consecutive requests generate two distinct correlation ids", async () => {
    const r1 = await GET(getRequest("?tenantId=x&conversationId=nope&to=en"));
    const r2 = await GET(getRequest("?tenantId=x&conversationId=nope&to=en"));
    const c1 = r1.headers.get(CORRELATION_HEADER);
    const c2 = r2.headers.get(CORRELATION_HEADER);
    expect(c1).toMatch(UUID_RE);
    expect(c2).toMatch(UUID_RE);
    expect(c1).not.toBe(c2);
  });

  test("a client-controlled X-SPABLA-Correlation-Id header is NOT reflected", async () => {
    const injected = "attacker-controlled-value";
    const url = "http://localhost/api/v2/messages?tenantId=x&conversationId=nope&to=en";
    const req = new NextRequest(url, {
      method: "GET",
      headers: {
        Authorization: "Bearer x",
        "X-SPABLA-Correlation-Id": injected,
      },
    });
    const res = await GET(req);
    const cid = res.headers.get(CORRELATION_HEADER);
    expect(cid).toMatch(UUID_RE);
    expect(cid).not.toBe(injected);
    const body = await res.json();
    expect(body.correlationId).toBe(cid);
    // The injected string never appears in the body either.
    expect(JSON.stringify(body)).not.toContain(injected);
  });
});

describe("Client auth-recovery interlock (shouldTriggerAuth401Recovery)", () => {
  test("only 401 responses match the coordinator predicate", async () => {
    const { shouldTriggerAuth401Recovery } = await import("@/lib/v2/client/auth-recovery-coordinator");
    // Build one response of each relevant status.
    const scope = scopeStub();

    buildScope.mockRejectedValueOnce(new Fase9RequestError({ kind: "unauthorized", reason: "missing authorization header" }));
    const r401 = await GET(getRequest(VALID_GET_QUERY));

    buildScope.mockResolvedValueOnce(scope as never);
    (scope.persistence.saveMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
      code: "not_found",
      message: "hidden_by_rls",
      retryable: false,
    });
    const r404 = await POST(postRequest({
      tenantId: A_UUID, conversationId: B_UUID, text: "hi", language: "es", clientMessageId: C_UUID,
    }));

    const r400 = await GET(getRequest(`?tenantId=nope&conversationId=nope&to=en`));

    expect(shouldTriggerAuth401Recovery(r401)).toBe(true);
    expect(shouldTriggerAuth401Recovery(r404)).toBe(false);
    expect(shouldTriggerAuth401Recovery(r400)).toBe(false);
  });
});
