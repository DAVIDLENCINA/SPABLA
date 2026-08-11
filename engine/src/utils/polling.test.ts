/**
 * SPABLA Engine — regression tests for `createPollingRunner`.
 *
 * These tests protect the invariant broken by the Fase 9 UI's original
 * shared-ref cancellation flag: after `cancel()` no further ticks may
 * run, even if a second runner is created concurrently. Without a
 * per-instance flag, the previous loop kept scheduling ticks with a
 * stale closure and produced spurious 401s on Safari after
 * sign-out / sign-in.
 */

import { describe, expect, test } from "vitest";

import { createPollingRunner } from "./polling";

async function wait(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

describe("createPollingRunner", () => {
  test("runs immediately when runImmediately is default", async () => {
    let count = 0;
    const runner = createPollingRunner(async () => { count += 1; }, { intervalMs: 1000 });
    await wait(15);
    runner.cancel();
    expect(count).toBe(1);
  });

  test("delays first tick when runImmediately is false", async () => {
    let count = 0;
    const runner = createPollingRunner(async () => { count += 1; }, {
      intervalMs: 25,
      runImmediately: false,
    });
    await wait(10);
    expect(count).toBe(0);
    await wait(30);
    runner.cancel();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("cancel prevents further scheduled ticks", async () => {
    let count = 0;
    const runner = createPollingRunner(async () => { count += 1; }, { intervalMs: 10 });
    await wait(35);
    const before = count;
    runner.cancel();
    await wait(60);
    expect(count).toBe(before);
  });

  test("cancel during in-flight tick prevents scheduling next tick", async () => {
    let count = 0;
    const runner = createPollingRunner(async () => {
      await wait(30);
      count += 1;
    }, { intervalMs: 5 });
    await wait(5);
    runner.cancel();
    await wait(50);
    const first = count;
    await wait(40);
    expect(count).toBe(first);
    expect(count).toBeLessThanOrEqual(1);
  });

  test("two runners created back-to-back are independent — cancelling the first does not stop the second", async () => {
    // Direct regression: mimics the effect re-mount pattern. The first
    // runner is created, then immediately cancelled by "cleanup"; the
    // second runner starts fresh and MUST keep polling.
    let firstCount = 0;
    let secondCount = 0;
    const first = createPollingRunner(async () => { firstCount += 1; }, { intervalMs: 15 });
    first.cancel();
    const second = createPollingRunner(async () => { secondCount += 1; }, { intervalMs: 15 });
    await wait(50);
    second.cancel();
    // firstCount can be at most 1 (the immediate tick if it fired before cancel).
    expect(firstCount).toBeLessThanOrEqual(1);
    // secondCount must have accumulated multiple ticks.
    expect(secondCount).toBeGreaterThanOrEqual(2);
  });

  test("cancelling first runner does not leak ticks even after second runner starts", async () => {
    // The critical case from the Safari bug: an old loop must never fire
    // after `cancel()`, regardless of whether a subsequent runner exists.
    let firstTicks = 0;
    const first = createPollingRunner(async () => { firstTicks += 1; }, { intervalMs: 10 });
    await wait(5);
    first.cancel();
    const firstAtCancel = firstTicks;
    // Now create a fresh runner that keeps calling into unrelated work.
    let secondTicks = 0;
    const second = createPollingRunner(async () => { secondTicks += 1; }, { intervalMs: 10 });
    await wait(80);
    second.cancel();
    expect(firstTicks).toBe(firstAtCancel);
    expect(secondTicks).toBeGreaterThanOrEqual(3);
  });

  test("tick errors are swallowed and loop continues", async () => {
    let count = 0;
    const runner = createPollingRunner(async () => {
      count += 1;
      throw new Error("boom");
    }, { intervalMs: 10 });
    await wait(45);
    runner.cancel();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test("intervalMs <= 0 or NaN rejects at construction", () => {
    expect(() => createPollingRunner(async () => undefined, { intervalMs: 0 }))
      .toThrow(/positive number/);
    expect(() => createPollingRunner(async () => undefined, { intervalMs: -5 }))
      .toThrow(/positive number/);
    expect(() => createPollingRunner(async () => undefined, { intervalMs: Number.NaN }))
      .toThrow(/positive number/);
  });
});
