/**
 * SPABLA V2 · Hito 9.3.1-Q3-R · Tests del coordinator single-flight
 * con la taxonomía discriminada de 4 resultados. Cubre §FASE 7.A del
 * hito Q3-R:
 *   - N llamadas concurrentes producen UN solo refresh.
 *   - `renewed`, `no_session`, `terminal_invalid`, `transient_failure`
 *     se distinguen deterministamente.
 *   - Errores concluyentes de invalidez (invalid_grant, refresh_token
 *     expired/revoked, session_not_found) → `terminal_invalid`.
 *   - Errores ambiguos (network, timeout, DNS, 429, 5xx, unknown) →
 *     `transient_failure` (principio de seguridad).
 *   - La promesa in-flight se libera tras fallo transitorio y no
 *     bloquea ciclos posteriores.
 *   - Ningún token, ningún mensaje raw, ninguna Authorization aparecen
 *     como return de este helper.
 */

import { afterEach, describe, expect, test, vi } from "vitest";

import type { Session, SupabaseClient } from "@supabase/supabase-js";

import {
  __resetSessionRefreshCoordinatorForTests,
  __sessionRefreshInFlightForTests,
  refreshSessionOnce,
} from "./session-refresh-coordinator";

afterEach(() => {
  __resetSessionRefreshCoordinatorForTests();
});

type RefreshShape = Awaited<
  ReturnType<SupabaseClient["auth"]["refreshSession"]>
>;

function buildFakeClient(refreshImpl: () => Promise<RefreshShape>): SupabaseClient {
  return { auth: { refreshSession: vi.fn(refreshImpl) } } as unknown as SupabaseClient;
}

function fakeSession(): Session {
  return {
    access_token: "REDACTED-token",
    refresh_token: "REDACTED-refresh",
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: "00000000-0000-4000-8000-000000000001",
      email: "actor@example.test",
      aud: "authenticated",
      role: "authenticated",
    },
  } as unknown as Session;
}

describe("session-refresh-coordinator · single-flight (Q3-R)", () => {
  test("N concurrent calls invoke supabase.auth.refreshSession exactly once", async () => {
    let calls = 0;
    let resolveInner: (v: RefreshShape) => void = () => undefined;
    const inner = new Promise<RefreshShape>((r) => {
      resolveInner = r;
    });
    const client = buildFakeClient(async () => {
      calls += 1;
      return inner;
    });

    const promises = Array.from({ length: 5 }, () => refreshSessionOnce(client));
    expect(__sessionRefreshInFlightForTests()).toBe(true);
    resolveInner({ data: { session: fakeSession(), user: fakeSession().user }, error: null } as RefreshShape);

    const outcomes = await Promise.all(promises);
    expect(calls).toBe(1);
    for (const outcome of outcomes) {
      expect(outcome.kind).toBe("renewed");
    }
    expect(__sessionRefreshInFlightForTests()).toBe(false);
  });

  test("returns renewed when refresh resolves with a session", async () => {
    const client = buildFakeClient(async () => ({
      data: { session: fakeSession(), user: fakeSession().user },
      error: null,
    } as RefreshShape));

    const outcome = await refreshSessionOnce(client);
    expect(outcome.kind).toBe("renewed");
    if (outcome.kind === "renewed") {
      expect(outcome.session.access_token).toBe("REDACTED-token");
    }
  });

  test("returns no_session when SDK returns null session and null error", async () => {
    const client = buildFakeClient(async () => ({
      data: { session: null, user: null },
      error: null,
    } as unknown as RefreshShape));

    const outcome = await refreshSessionOnce(client);
    expect(outcome.kind).toBe("no_session");
  });

  test("terminal_invalid when SDK error message mentions invalid_grant", async () => {
    const client = buildFakeClient(async () => ({
      data: { session: null, user: null },
      error: new Error("invalid_grant: refresh token expired"),
    } as unknown as RefreshShape));
    const outcome = await refreshSessionOnce(client);
    expect(outcome.kind).toBe("terminal_invalid");
  });

  test("terminal_invalid when SDK error has code=invalid_grant", async () => {
    const client = buildFakeClient(async () => ({
      data: { session: null, user: null },
      error: { code: "invalid_grant", message: "auth failed" } as unknown as Error,
    } as unknown as RefreshShape));
    const outcome = await refreshSessionOnce(client);
    expect(outcome.kind).toBe("terminal_invalid");
  });

  test("terminal_invalid when message says refresh_token_not_found", async () => {
    const client = buildFakeClient(async () => ({
      data: { session: null, user: null },
      error: new Error("refresh_token_not_found"),
    } as unknown as RefreshShape));
    expect((await refreshSessionOnce(client)).kind).toBe("terminal_invalid");
  });

  test("terminal_invalid when message says refresh token has been used", async () => {
    const client = buildFakeClient(async () => ({
      data: { session: null, user: null },
      error: new Error("Refresh Token has been used"),
    } as unknown as RefreshShape));
    expect((await refreshSessionOnce(client)).kind).toBe("terminal_invalid");
  });

  test("transient_failure for network errors (thrown fetch)", async () => {
    const client = buildFakeClient(async () => {
      throw new Error("fetch failed");
    });
    const outcome = await refreshSessionOnce(client);
    expect(outcome.kind).toBe("transient_failure");
  });

  test("transient_failure for timeout messages", async () => {
    const client = buildFakeClient(async () => ({
      data: { session: null, user: null },
      error: new Error("network timeout"),
    } as unknown as RefreshShape));
    expect((await refreshSessionOnce(client)).kind).toBe("transient_failure");
  });

  test("transient_failure for 429 rate-limit errors", async () => {
    const client = buildFakeClient(async () => ({
      data: { session: null, user: null },
      error: { status: 429, message: "Too Many Requests" } as unknown as Error,
    } as unknown as RefreshShape));
    expect((await refreshSessionOnce(client)).kind).toBe("transient_failure");
  });

  test("transient_failure for 500/502/503/504 upstream errors", async () => {
    for (const status of [500, 502, 503, 504]) {
      __resetSessionRefreshCoordinatorForTests();
      const client = buildFakeClient(async () => ({
        data: { session: null, user: null },
        error: { status, message: `HTTP ${status}` } as unknown as Error,
      } as unknown as RefreshShape));
      const outcome = await refreshSessionOnce(client);
      expect(outcome.kind).toBe("transient_failure");
    }
  });

  test("transient_failure for unknown/ambiguous errors (safety-first)", async () => {
    const client = buildFakeClient(async () => ({
      data: { session: null, user: null },
      error: new Error("boom something unexpected"),
    } as unknown as RefreshShape));
    expect((await refreshSessionOnce(client)).kind).toBe("transient_failure");
  });

  test("in-flight slot is released after transient failure so next cycle can retry", async () => {
    const client = buildFakeClient(async () => ({
      data: { session: null, user: null },
      error: new Error("fetch failed"),
    } as unknown as RefreshShape));
    await refreshSessionOnce(client);
    expect(__sessionRefreshInFlightForTests()).toBe(false);
    const second = await refreshSessionOnce(client);
    expect(second.kind).toBe("transient_failure");
  });
});
