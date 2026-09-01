/**
 * SPABLA V2 · Hito 9.3.1-Q3-R · §FASE 7.D · Tests del coordinator
 * de recuperación destructiva. Cubre:
 *   - Idempotencia (una sola transición por lifecycle).
 *   - notifyExpired() se dispara exactamente una vez.
 *   - signOutLocalScope() se dispara exactamente una vez.
 *   - signOut fallando NUNCA cascadea a error UI.
 *   - shouldTriggerAuth401Recovery: solo status===401.
 *
 * Documenta las machine states que consume `app/v2/chat/page.tsx`
 * (Q1 §7 / Q3-R §FASE 5-6):
 *
 *   SessionReady  ── 401 terminal   ─▶ Expired  (aplica recovery)
 *   SessionReady  ── 401 transient  ─▶ TransientError (NO recovery)
 *   SessionReady  ── refresh renewed ─▶ SessionReady (NO recovery)
 *
 * El caller decide cuándo invocar el coordinator; los tests aquí
 * verifican que UNA VEZ invocado, el coordinator siempre respeta el
 * contrato Q1 §7 (idempotente, no toca preferencias, tolera
 * signOut throwing).
 */

import { afterEach, describe, expect, test, vi } from "vitest";

import {
  applyAuth401Recovery,
  shouldTriggerAuth401Recovery,
  type Auth401RecoveryDeps,
} from "./auth-recovery-coordinator";

afterEach(() => {
  vi.restoreAllMocks();
});

function buildDeps(overrides: Partial<Auth401RecoveryDeps> = {}): {
  deps: Auth401RecoveryDeps;
  state: {
    recovered: boolean;
    notifyExpiredCalls: number;
    signOutCalls: number;
  };
} {
  const state = { recovered: false, notifyExpiredCalls: 0, signOutCalls: 0 };
  const deps: Auth401RecoveryDeps = {
    hasAlreadyRecovered: () => state.recovered,
    markRecovered: () => {
      state.recovered = true;
    },
    notifyExpired: () => {
      state.notifyExpiredCalls += 1;
    },
    signOutLocalScope: async () => {
      state.signOutCalls += 1;
    },
    ...overrides,
  };
  return { deps, state };
}

describe("auth-recovery-coordinator (Q3-R FASE 7.D)", () => {
  test("primer disparo → ranTransition=true, totalAttempts=1", async () => {
    const { deps, state } = buildDeps();
    const outcome = await applyAuth401Recovery(deps);
    expect(outcome.ranTransition).toBe(true);
    expect(outcome.totalAttempts).toBe(1);
    expect(state.recovered).toBe(true);
    expect(state.notifyExpiredCalls).toBe(1);
    expect(state.signOutCalls).toBe(1);
  });

  test("disparo posterior → ranTransition=false, totalAttempts=1 (idempotente)", async () => {
    const { deps, state } = buildDeps();
    await applyAuth401Recovery(deps);
    const outcome = await applyAuth401Recovery(deps);
    expect(outcome.ranTransition).toBe(false);
    expect(outcome.totalAttempts).toBe(1);
    // notifyExpired y signOut NO se re-ejecutan
    expect(state.notifyExpiredCalls).toBe(1);
    expect(state.signOutCalls).toBe(1);
  });

  test("burst concurrente de 3 disparos → 1 sola transición", async () => {
    const { deps, state } = buildDeps();
    const results = await Promise.all([
      applyAuth401Recovery(deps),
      applyAuth401Recovery(deps),
      applyAuth401Recovery(deps),
    ]);
    const ran = results.filter((r) => r.ranTransition).length;
    expect(ran).toBe(1);
    expect(state.notifyExpiredCalls).toBe(1);
    expect(state.signOutCalls).toBe(1);
  });

  test("signOutLocalScope throwing NO cascada a error", async () => {
    const { deps, state } = buildDeps({
      signOutLocalScope: async () => {
        throw new Error("network");
      },
    });
    const outcome = await applyAuth401Recovery(deps);
    expect(outcome.ranTransition).toBe(true);
    // notifyExpired se llamó ANTES del signOut fallido
    expect(state.notifyExpiredCalls).toBe(1);
  });

  test("shouldTriggerAuth401Recovery: 401 → true", () => {
    expect(shouldTriggerAuth401Recovery({ status: 401 })).toBe(true);
  });

  test("shouldTriggerAuth401Recovery: 200/400/403/404/500/503 → false", () => {
    for (const status of [200, 400, 403, 404, 500, 503]) {
      expect(shouldTriggerAuth401Recovery({ status })).toBe(false);
    }
  });
});
