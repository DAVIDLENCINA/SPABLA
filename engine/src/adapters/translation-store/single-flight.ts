/**
 * SPABLA Engine — single-flight helper (Fase 9 · Hito 9.1.1).
 *
 * Coalesces concurrent async work by key within a single process. Two
 * callers asking for the same key while the first request is still
 * running share a single execution and observe the same result (or the
 * same rejection). The entry is removed on settle so long-running
 * processes do not accumulate stale promises.
 *
 * SCOPE — this helper is ONLY a local optimisation. It provides no
 * cross-process coordination. Two Next.js instances running in
 * parallel may each dedupe internally but WILL each call the underlying
 * work once. A truly "exactly-once" guarantee requires an outbox or a
 * distributed claim, which is out of scope for Hito 9.1.1.
 *
 * @internal Not part of the public engine surface.
 */

export type SingleFlightMap = Map<string, Promise<unknown>>;

export function createSingleFlight(): SingleFlightMap {
  return new Map();
}

export async function runSingleFlight<T>(
  map: SingleFlightMap,
  key: string,
  work: () => Promise<T>,
): Promise<T> {
  const existing = map.get(key);
  if (existing !== undefined) {
    return existing as Promise<T>;
  }
  const bareWork = work();
  const cleaned: Promise<T> = bareWork.finally(() => {
    // Only clear if the entry is still ours — a subsequent, faster runner
    // must not have its slot removed by our teardown.
    if (map.get(key) === cleaned) {
      map.delete(key);
    }
  });
  map.set(key, cleaned);
  return cleaned;
}
