/**
 * SPABLA Engine — polling runner utility.
 *
 * Runs an async callback repeatedly on a fixed interval, with per-instance
 * cancellation. Each `createPollingRunner` call has its OWN `cancelled`
 * flag captured in the local closure. This is the critical invariant that
 * prevents cross-instance leaks when a React effect re-mounts (or any
 * other framework re-creates the runner): calling `cancel()` on the old
 * instance is guaranteed to stop the old loop even if a new instance has
 * already started, because each instance owns a distinct flag.
 *
 * A shared cancellation ref (e.g. `useRef`) reused across effect mounts
 * violates this invariant: the second mount resets the ref to `false`
 * and the first mount's in-flight tick observes `false` on its
 * post-await check, scheduling one more iteration with a stale closure.
 * That defect surfaces as duplicate concurrent polls — for the visible
 * conversation flow it was observed as a second polling loop still using
 * the previous user's JWT after sign-out / sign-in.
 *
 * The runner never rejects; if the callback throws it is silently
 * swallowed after the current tick so the loop keeps rhythm.
 *
 * @internal Not part of the public engine surface. MUST NOT be re-exported
 * from `engine/src/index.ts`.
 */

export type PollingRunner = {
  readonly cancel: () => void;
};

export type PollingRunnerOptions = {
  readonly intervalMs: number;
  readonly runImmediately?: boolean;
};

export function createPollingRunner(
  tick: () => Promise<void>,
  options: PollingRunnerOptions,
): PollingRunner {
  if (!Number.isFinite(options.intervalMs) || options.intervalMs <= 0) {
    throw new Error("createPollingRunner: intervalMs must be a positive number");
  }
  const runImmediately = options.runImmediately ?? true;

  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = (): void => {
    if (cancelled) return;
    timer = setTimeout(() => {
      timer = null;
      void loop();
    }, options.intervalMs);
  };

  const loop = async (): Promise<void> => {
    if (cancelled) return;
    try {
      await tick();
    } catch {
      // Swallow — the callback owns error surfacing; keep the loop steady.
    }
    if (cancelled) return;
    schedule();
  };

  if (runImmediately) {
    void loop();
  } else {
    schedule();
  }

  return {
    cancel(): void {
      cancelled = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
