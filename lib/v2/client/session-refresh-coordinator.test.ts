/**
 * SPABLA V2 · Hito 9.3.1-Q3 · Tests unitarios del coordinator
 * single-flight de refresh. Verifican Q2 §6:
 *   - N llamadas concurrentes producen UN solo refresh subyacente.
 *   - Todos los awaiters comparten el mismo resultado.
 *   - La promesa se libera al resolver (éxito o fallo) de modo que
 *     una nueva llamada posterior puede iniciar un nuevo refresh.
 *   - La clasificación de errores es determinista y sanitizada.
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

function buildFakeClient(
  refreshImpl: () => Promise<RefreshShape>,
): SupabaseClient {
  return {
    auth: {
      refreshSession: vi.fn(refreshImpl),
    },
  } as unknown as SupabaseClient;
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

describe("session-refresh-coordinator · single-flight", () => {
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
    // While inner has not resolved, all callers share the same in-flight promise.
    expect(__sessionRefreshInFlightForTests()).toBe(true);
    resolveInner({ data: { session: fakeSession(), user: fakeSession().user }, error: null } as RefreshShape);

    const outcomes = await Promise.all(promises);
    expect(calls).toBe(1);
    for (const outcome of outcomes) {
      expect(outcome.kind).toBe("renewed");
    }
    // The shared promise must be released after settling.
    expect(__sessionRefreshInFlightForTests()).toBe(false);
  });

  test("returns { renewed, session } when refreshSession resolves with a session", async () => {
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

  test("returns { no_session } when refreshSession resolves without session and without error", async () => {
    const client = buildFakeClient(async () => ({
      data: { session: null, user: null },
      error: null,
    } as unknown as RefreshShape));

    const outcome = await refreshSessionOnce(client);
    expect(outcome.kind).toBe("no_session");
  });

  test("returns { failed, refresh_invalid } when SDK error mentions invalid/expired/refresh_token", async () => {
    const client = buildFakeClient(async () => ({
      data: { session: null, user: null },
      error: new Error("Invalid refresh_token"),
    } as unknown as RefreshShape));

    const outcome = await refreshSessionOnce(client);
    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") {
      expect(outcome.error.category).toBe("refresh_invalid");
    }
  });

  test("returns { failed, refresh_transient } when SDK error mentions network/timeout", async () => {
    const client = buildFakeClient(async () => ({
      data: { session: null, user: null },
      error: new Error("network timeout"),
    } as unknown as RefreshShape));

    const outcome = await refreshSessionOnce(client);
    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") {
      expect(outcome.error.category).toBe("refresh_transient");
    }
  });

  test("returns { failed, refresh_unknown } for unclassified errors", async () => {
    const client = buildFakeClient(async () => ({
      data: { session: null, user: null },
      error: new Error("unknown boom"),
    } as unknown as RefreshShape));

    const outcome = await refreshSessionOnce(client);
    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") {
      expect(outcome.error.category).toBe("refresh_unknown");
    }
  });

  test("releases the in-flight slot on failure so the next call can retry", async () => {
    const client = buildFakeClient(async () => ({
      data: { session: null, user: null },
      error: new Error("boom"),
    } as unknown as RefreshShape));

    const first = await refreshSessionOnce(client);
    expect(first.kind).toBe("failed");
    expect(__sessionRefreshInFlightForTests()).toBe(false);
    const second = await refreshSessionOnce(client);
    expect(second.kind).toBe("failed");
  });

  test("catches thrown errors and classifies as failed", async () => {
    const client = buildFakeClient(async () => {
      throw new Error("fetch failed");
    });
    const outcome = await refreshSessionOnce(client);
    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") {
      expect(outcome.error.category).toBe("refresh_transient");
    }
  });
});
