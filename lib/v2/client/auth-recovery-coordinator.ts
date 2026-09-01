/**
 * SPABLA V2 · Hito 9.2.4 · Deterministic auth-recovery coordinator.
 * SPABLA V2 · Hito 9.3.1-Q3 · Contract preserved; wired as the
 *   destructive tail of the refresh-first flow.
 *
 * Extracts the recovery transition that `app/v2/chat/page.tsx` runs
 * when a request against `/api/v2/*` observes an HTTP 401 that could
 * not be recovered via `refreshSessionOnce`. Hoisting the coordinator
 * lets us TEST the same code path that the production page uses,
 * instead of writing a mock in the test that pretends to be the
 * client — which is exactly what §5.2 of the plan and the corrective
 * operational order forbid.
 *
 * Q3 addition (Q2 §5): the coordinator is now the DESTRUCTIVE TAIL
 * of the recovery flow. The caller is expected to have first invoked
 * `refreshSessionOnce(supabase)` and, only when the refresh outcome
 * was `no_session` or `failed` (or when a retry after `renewed` also
 * returned 401), invoke `applyAuth401Recovery`. The coordinator
 * itself does NOT attempt to refresh; that responsibility belongs to
 * `session-refresh-coordinator.ts` + `fetch-with-auth-retry.ts` so the
 * three concerns remain independently testable.
 *
 * Contract:
 *   - `applyAuth401Recovery(deps)` is IDEMPOTENT: subsequent calls
 *     after the first one are no-ops. This guarantees that a burst
 *     of concurrent 401s (two in-flight ticks, a manual retry, a
 *     late completion) still produces at most ONE recovery action.
 *   - It calls `deps.notifyExpired()` — which sets the session to
 *     `null` and shows the expired banner — and then invokes
 *     `deps.signOutLocalScope()` (Supabase Auth `signOut({scope:
 *     "local"})`).
 *   - It NEVER touches the language-preference store. Preferences
 *     survive every recovery. This is a hard invariant of §5.2 and
 *     is enforced structurally by the coordinator receiving NO
 *     preference-storage dependency.
 *   - It returns a `RecoveryOutcome` so callers (and tests) can
 *     assert how many attempts were made and whether the current
 *     call was the one that ran the transition.
 */

export type Auth401RecoveryDeps = {
  /**
   * Returns `true` iff the coordinator has ALREADY run a recovery for
   * the current session lifecycle. Implementations back this by a
   * ref/flag; the coordinator uses it to guarantee idempotency.
   */
  readonly hasAlreadyRecovered: () => boolean;
  /**
   * Marks the flag returned by `hasAlreadyRecovered` as true. The
   * coordinator MUST be able to observe the flip on subsequent
   * calls within the same test / effect scope.
   */
  readonly markRecovered: () => void;
  /**
   * Client-side "session has just been invalidated" notification.
   * In production this sets `sessionExpired = true`, clears
   * actor-scoped state (messages / poll error / send error), and
   * sets `session = null` — which flips `canOperate` and cancels
   * the polling runner. Called at most once.
   */
  readonly notifyExpired: () => void;
  /**
   * Local-scope sign-out. In production, `supabase.auth.signOut({
   * scope: "local" })`. The `local` scope guarantees other tabs /
   * devices authenticated as the same actor are UNAFFECTED, and
   * that no preference key owned by the language-preference store
   * or the seed cache is touched. Called at most once.
   */
  readonly signOutLocalScope: () => Promise<void>;
};

export type RecoveryOutcome = {
  /** `true` if THIS call ran the transition; `false` if it was suppressed. */
  readonly ranTransition: boolean;
  /**
   * Total number of transitions the coordinator has performed for
   * the current session lifecycle after this call. Always 0 or 1.
   */
  readonly totalAttempts: 0 | 1;
};

/**
 * Runs the deterministic recovery. Idempotent by construction: after
 * the first call, subsequent calls short-circuit without touching
 * Supabase Auth or the client state.
 */
export async function applyAuth401Recovery(
  deps: Auth401RecoveryDeps,
): Promise<RecoveryOutcome> {
  if (deps.hasAlreadyRecovered()) {
    return { ranTransition: false, totalAttempts: 1 };
  }
  deps.markRecovered();
  deps.notifyExpired();
  try {
    await deps.signOutLocalScope();
  } catch {
    // Silent: sign-out failures NEVER cascade into a UI error. The
    // session has already been marked invalid; the user is on the
    // sign-in surface with an unambiguous expired notice.
  }
  return { ranTransition: true, totalAttempts: 1 };
}

/**
 * Detects whether an HTTP response should trigger the recovery
 * transition. Mirrors `classifyPollingResponse` for status 401 but
 * exposes the decision as a boolean the coordinator caller can wrap
 * around any fetch to `/api/v2/messages`.
 */
export function shouldTriggerAuth401Recovery(response: Pick<Response, "status">): boolean {
  return response.status === 401;
}
