import { describe, expect, test } from "vitest";

import { createSingleFlight, runSingleFlight } from "./single-flight";

async function delay(ms: number): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, ms));
}

describe("single-flight", () => {
  test("coalesces two concurrent calls for the same key into one execution", async () => {
    const map = createSingleFlight();
    let calls = 0;
    const work = async () => {
      calls += 1;
      await delay(15);
      return "v";
    };
    const [a, b] = await Promise.all([
      runSingleFlight(map, "k", work),
      runSingleFlight(map, "k", work),
    ]);
    expect(calls).toBe(1);
    expect(a).toBe("v");
    expect(b).toBe("v");
  });

  test("distinct keys run in parallel", async () => {
    const map = createSingleFlight();
    let calls = 0;
    const [a, b] = await Promise.all([
      runSingleFlight(map, "k1", async () => {
        calls += 1;
        await delay(5);
        return "one";
      }),
      runSingleFlight(map, "k2", async () => {
        calls += 1;
        await delay(5);
        return "two";
      }),
    ]);
    expect(calls).toBe(2);
    expect(a).toBe("one");
    expect(b).toBe("two");
  });

  test("map entry is cleared after settle so a new call re-runs the work", async () => {
    const map = createSingleFlight();
    let calls = 0;
    const work = async () => {
      calls += 1;
      return calls;
    };
    const a = await runSingleFlight(map, "k", work);
    const b = await runSingleFlight(map, "k", work);
    expect(a).toBe(1);
    expect(b).toBe(2);
    expect(map.size).toBe(0);
  });

  test("rejection is shared between concurrent callers and clears the entry", async () => {
    const map = createSingleFlight();
    let calls = 0;
    const work = async () => {
      calls += 1;
      await delay(5);
      throw new Error("boom");
    };
    const [a, b] = await Promise.allSettled([
      runSingleFlight(map, "k", work),
      runSingleFlight(map, "k", work),
    ]);
    expect(calls).toBe(1);
    expect(a.status).toBe("rejected");
    expect(b.status).toBe("rejected");
    expect(map.size).toBe(0);
  });
});
