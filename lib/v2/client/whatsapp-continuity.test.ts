/**
 * SPABLA V2 · Hito 9.3.1-Q3-R · §FASE 9 · Deterministic WhatsApp-like
 * continuity tests.
 *
 * Wires the three PRODUCTION coordinators (session-refresh, auth-retry,
 * auth-recovery) end-to-end with NO mocks between them, only the
 * `SupabaseClient` and the network `fetch`. Demonstrates the property
 * the Q3-R rectification exists to guarantee:
 *
 *   > A user who has authenticated once MUST NOT be forced back to
 *   > the sign-in surface by transient failures (network hiccup,
 *   > 429, 5xx, DNS blip, timed-out refresh). Only a concluyently
 *   > invalid refresh token — the same signal WhatsApp/Telegram use
 *   > to end a session — is allowed to destroy the local session.
 *
 * Each test acts as a scenario in the 13-scenario manual barrier, but
 * runs entirely inside vitest with predictable Supabase + fetch fakes.
 * The manual barrier itself remains PENDIENTE per Q3-R governance.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Session, SupabaseClient } from "@supabase/supabase-js";

import {
  __resetSessionRefreshCoordinatorForTests,
} from "./session-refresh-coordinator";
import { fetchWithAuthRetry } from "./fetch-with-auth-retry";
import {
  applyAuth401Recovery,
  shouldTriggerAuth401Recovery,
  type Auth401RecoveryDeps,
} from "./auth-recovery-coordinator";

afterEach(() => {
  __resetSessionRefreshCoordinatorForTests();
  vi.restoreAllMocks();
});

type FakeAuth = {
  refreshSession: ReturnType<typeof vi.fn>;
  getSession: ReturnType<typeof vi.fn>;
  signOut: ReturnType<typeof vi.fn>;
};

function fakeSession(token: string): Session {
  return {
    access_token: token,
    refresh_token: "REDACTED-refresh",
    expires_in: 3600,
    token_type: "bearer",
    user: { id: "00000000-0000-4000-8000-000000000001" },
  } as unknown as Session;
}

function buildClient(auth: FakeAuth): SupabaseClient {
  return { auth } as unknown as SupabaseClient;
}

function mockResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Miniature Page Chat state machine — mirrors the branch inside
 * `app/v2/chat/page.tsx#fetchMessages` (lines 397-441). Runs the
 * production coordinators verbatim; the ONLY thing we swap out is the
 * side-effect surfaces (setSessionExpired, signOut) so the test can
 * assert them.
 */
async function runPollingTick(deps: {
  supabase: SupabaseClient;
  markRecovered: () => void;
  hasAlreadyRecovered: () => boolean;
  notifyExpired: () => void;
  signOutLocalScope: () => Promise<void>;
}): Promise<{
  outcome:
    | { kind: "response"; status: number }
    | { kind: "transient_auth" }
    | { kind: "terminal_auth"; recoveryRan: boolean }
    | { kind: "network_error" };
}> {
  const authOutcome = await fetchWithAuthRetry(deps.supabase, "/api/v2/messages");
  if (authOutcome.kind === "transient_auth") {
    return { outcome: { kind: "transient_auth" } };
  }
  if (authOutcome.kind === "network_error") {
    return { outcome: { kind: "network_error" } };
  }
  if (authOutcome.kind === "terminal_auth") {
    const recovery: Auth401RecoveryDeps = {
      hasAlreadyRecovered: deps.hasAlreadyRecovered,
      markRecovered: deps.markRecovered,
      notifyExpired: deps.notifyExpired,
      signOutLocalScope: deps.signOutLocalScope,
    };
    const r = await applyAuth401Recovery(recovery);
    return { outcome: { kind: "terminal_auth", recoveryRan: r.ranTransition } };
  }
  const res = authOutcome.response;
  if (shouldTriggerAuth401Recovery(res)) {
    const recovery: Auth401RecoveryDeps = {
      hasAlreadyRecovered: deps.hasAlreadyRecovered,
      markRecovered: deps.markRecovered,
      notifyExpired: deps.notifyExpired,
      signOutLocalScope: deps.signOutLocalScope,
    };
    const r = await applyAuth401Recovery(recovery);
    return { outcome: { kind: "terminal_auth", recoveryRan: r.ranTransition } };
  }
  return { outcome: { kind: "response", status: res.status } };
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch");
});

describe("WhatsApp-like continuity end-to-end (Q3-R FASE 9)", () => {
  test("Escenario 1 · sesión OK sostiene 3 polls consecutivos", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("TOK") } })),
      signOut: vi.fn(),
    };
    const client = buildClient(auth);
    const state = { recovered: false, notifyExpired: 0, signOut: 0 };
    for (let i = 0; i < 3; i++) {
      fetchSpy.mockResolvedValueOnce(mockResponse(200));
      const { outcome } = await runPollingTick({
        supabase: client,
        hasAlreadyRecovered: () => state.recovered,
        markRecovered: () => { state.recovered = true; },
        notifyExpired: () => { state.notifyExpired += 1; },
        signOutLocalScope: async () => { state.signOut += 1; },
      });
      expect(outcome).toEqual({ kind: "response", status: 200 });
    }
    // Sesión intacta: cero notificaciones de expirado, cero signOut
    expect(state.notifyExpired).toBe(0);
    expect(state.signOut).toBe(0);
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });

  test("Escenario 2 · 401 → refresh renewed → retry OK · sesión preservada", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(async () => ({
        data: { session: fakeSession("NEW"), user: null },
        error: null,
      })),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("OLD") } })),
      signOut: vi.fn(),
    };
    const client = buildClient(auth);
    const state = { recovered: false, notifyExpired: 0, signOut: 0 };
    fetchSpy.mockResolvedValueOnce(mockResponse(401));
    fetchSpy.mockResolvedValueOnce(mockResponse(200));
    const { outcome } = await runPollingTick({
      supabase: client,
      hasAlreadyRecovered: () => state.recovered,
      markRecovered: () => { state.recovered = true; },
      notifyExpired: () => { state.notifyExpired += 1; },
      signOutLocalScope: async () => { state.signOut += 1; },
    });
    expect(outcome).toEqual({ kind: "response", status: 200 });
    // Sesión NO fue destruida
    expect(state.notifyExpired).toBe(0);
    expect(state.signOut).toBe(0);
  });

  test("Escenario 3 · 401 → refresh transient_failure · sesión PRESERVADA (fix Q3-R)", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(async () => ({
        data: { session: null, user: null },
        error: new Error("network timeout"),
      })),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("OLD") } })),
      signOut: vi.fn(),
    };
    const client = buildClient(auth);
    const state = { recovered: false, notifyExpired: 0, signOut: 0 };
    fetchSpy.mockResolvedValueOnce(mockResponse(401));
    const { outcome } = await runPollingTick({
      supabase: client,
      hasAlreadyRecovered: () => state.recovered,
      markRecovered: () => { state.recovered = true; },
      notifyExpired: () => { state.notifyExpired += 1; },
      signOutLocalScope: async () => { state.signOut += 1; },
    });
    expect(outcome).toEqual({ kind: "transient_auth" });
    // Q3-R invariant: transient auth failure NUNCA destruye sesión
    expect(state.notifyExpired).toBe(0);
    expect(state.signOut).toBe(0);
  });

  test("Escenario 4 · 401 → refresh terminal_invalid · sesión DESTRUIDA (comportamiento WhatsApp)", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(async () => ({
        data: { session: null, user: null },
        error: new Error("invalid_grant: refresh_token has expired"),
      })),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("OLD") } })),
      signOut: vi.fn(),
    };
    const client = buildClient(auth);
    const state = { recovered: false, notifyExpired: 0, signOut: 0 };
    fetchSpy.mockResolvedValueOnce(mockResponse(401));
    const { outcome } = await runPollingTick({
      supabase: client,
      hasAlreadyRecovered: () => state.recovered,
      markRecovered: () => { state.recovered = true; },
      notifyExpired: () => { state.notifyExpired += 1; },
      signOutLocalScope: async () => { state.signOut += 1; },
    });
    expect(outcome).toEqual({ kind: "terminal_auth", recoveryRan: true });
    // Sesión destruida exactamente 1 vez
    expect(state.notifyExpired).toBe(1);
    expect(state.signOut).toBe(1);
  });

  test("Escenario 5 · network error inicial · sesión PRESERVADA (nunca 401 spurious)", async () => {
    const auth: FakeAuth = {
      refreshSession: vi.fn(),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("TOK") } })),
      signOut: vi.fn(),
    };
    const client = buildClient(auth);
    const state = { recovered: false, notifyExpired: 0, signOut: 0 };
    fetchSpy.mockRejectedValueOnce(new Error("fetch failed"));
    const { outcome } = await runPollingTick({
      supabase: client,
      hasAlreadyRecovered: () => state.recovered,
      markRecovered: () => { state.recovered = true; },
      notifyExpired: () => { state.notifyExpired += 1; },
      signOutLocalScope: async () => { state.signOut += 1; },
    });
    expect(outcome).toEqual({ kind: "network_error" });
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(state.notifyExpired).toBe(0);
    expect(state.signOut).toBe(0);
  });

  test("Escenario 6 · 5 ticks: transient/network/transient/renewed/OK · sesión PRESERVADA a lo largo", async () => {
    const state = { recovered: false, notifyExpired: 0, signOut: 0 };
    const runTick = async (
      auth: FakeAuth,
      fetchQueue: Array<() => void>,
    ): Promise<
      | { kind: "response"; status: number }
      | { kind: "transient_auth" }
      | { kind: "terminal_auth"; recoveryRan: boolean }
      | { kind: "network_error" }
    > => {
      const client = buildClient(auth);
      fetchQueue.forEach((f) => f());
      const { outcome } = await runPollingTick({
        supabase: client,
        hasAlreadyRecovered: () => state.recovered,
        markRecovered: () => { state.recovered = true; },
        notifyExpired: () => { state.notifyExpired += 1; },
        signOutLocalScope: async () => { state.signOut += 1; },
      });
      return outcome;
    };

    // Tick 1: transient auth failure
    __resetSessionRefreshCoordinatorForTests();
    let auth: FakeAuth = {
      refreshSession: vi.fn(async () => ({
        data: { session: null, user: null },
        error: new Error("network timeout"),
      })),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("T1") } })),
      signOut: vi.fn(),
    };
    let o = await runTick(auth, [() => fetchSpy.mockResolvedValueOnce(mockResponse(401))]);
    expect(o.kind).toBe("transient_auth");

    // Tick 2: network error
    __resetSessionRefreshCoordinatorForTests();
    auth = {
      refreshSession: vi.fn(),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("T1") } })),
      signOut: vi.fn(),
    };
    o = await runTick(auth, [() => fetchSpy.mockRejectedValueOnce(new Error("dns fail"))]);
    expect(o.kind).toBe("network_error");

    // Tick 3: transient auth failure de nuevo
    __resetSessionRefreshCoordinatorForTests();
    auth = {
      refreshSession: vi.fn(async () => ({
        data: { session: null, user: null },
        error: new Error("Upstream 503"),
      })),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("T1") } })),
      signOut: vi.fn(),
    };
    o = await runTick(auth, [() => fetchSpy.mockResolvedValueOnce(mockResponse(401))]);
    expect(o.kind).toBe("transient_auth");

    // Tick 4: refresh renewed
    __resetSessionRefreshCoordinatorForTests();
    auth = {
      refreshSession: vi.fn(async () => ({
        data: { session: fakeSession("T2"), user: null },
        error: null,
      })),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("T1") } })),
      signOut: vi.fn(),
    };
    o = await runTick(auth, [
      () => fetchSpy.mockResolvedValueOnce(mockResponse(401)),
      () => fetchSpy.mockResolvedValueOnce(mockResponse(200)),
    ]);
    expect(o).toEqual({ kind: "response", status: 200 });

    // Tick 5: OK sin refresh
    __resetSessionRefreshCoordinatorForTests();
    auth = {
      refreshSession: vi.fn(),
      getSession: vi.fn(async () => ({ data: { session: fakeSession("T2") } })),
      signOut: vi.fn(),
    };
    o = await runTick(auth, [() => fetchSpy.mockResolvedValueOnce(mockResponse(200))]);
    expect(o).toEqual({ kind: "response", status: 200 });

    // Sesión sobrevivió 5 ticks: cero destrucción
    expect(state.notifyExpired).toBe(0);
    expect(state.signOut).toBe(0);
  });
});
