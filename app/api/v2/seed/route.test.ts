/**
 * SPABLA V2 · Hito 9.2.5-C · Direct-handler tests for /api/v2/seed.
 *
 * Verifies:
 *   - Gate off ⇒ every method returns 404 (no reference to /api/v2/seed
 *     leaks) and `runFase9Seed` is NEVER invoked.
 *   - Gate MIXED (NODE_ENV=development but SPABLA_V2_ENABLE_DEV_SEED
 *     absent or equal to "0") ⇒ every method returns 404, `runFase9Seed`
 *     is NEVER invoked, no correlation header is emitted and no
 *     `seed_failed` log line is ever written. Locks down the boolean
 *     AND semantics of the guard so a future refactor cannot silently
 *     open the endpoint by relaxing the flag check.
 *   - Gate on, GET/HEAD ⇒ 405 with `Allow: POST`; `runFase9Seed` is
 *     NEVER invoked.
 *   - Gate on, POST success ⇒ 200 + JSON body + `X-SPABLA-Correlation-Id`
 *     UUID header; contract preserved.
 *   - Gate on, POST failure ⇒ 500 + exact public body
 *     `{"error":"seed_failed"}` + correlation header + sanitized log
 *     line (no secrets, no user data).
 *   - Second POST call still invokes the seed exactly once (idempotency
 *     of results lives in the data layer; the endpoint stays stateless).
 *
 * Notes on isolation:
 *   - `runFase9Seed` is mocked with `vi.mock` so no Supabase or network
 *     call happens. NODE_ENV / SPABLA_V2_ENABLE_DEV_SEED are toggled
 *     per test and restored in `afterEach`.
 *   - `console.error` is spied on; we assert that the JSON log line
 *     contains only whitelisted fields.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/v2/server/seed", () => ({
  runFase9Seed: vi.fn(),
}));

import { runFase9Seed } from "@/lib/v2/server/seed";
import { GET, HEAD, POST } from "@/app/api/v2/seed/route";

const CORRELATION_HEADER = "x-spabla-correlation-id";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const runFase9SeedMock = vi.mocked(runFase9Seed);

const SEED_FIXTURE = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  conversationId: "00000000-0000-0000-0000-000000000002",
  actorA: {
    actorId: "00000000-0000-0000-0000-00000000000a",
    email: "fase9.actor.a@spabla.local",
    password: "fase9-actor-a-pass",
    language: "es" as const,
  },
  actorB: {
    actorId: "00000000-0000-0000-0000-00000000000b",
    email: "fase9.actor.b@spabla.local",
    password: "fase9-actor-b-pass",
    language: "en" as const,
  },
};

// `@types/node` types `process.env.NODE_ENV` as a read-only literal
// union. Bracket-notation writes go through the generic index
// signature and remain type-checked without cast tricks.
const env: Record<string, string | undefined> = process.env;
const ORIGINAL_NODE_ENV = env["NODE_ENV"];
const ORIGINAL_GATE = env["SPABLA_V2_ENABLE_DEV_SEED"];

function enableGate(): void {
  env["NODE_ENV"] = "development";
  env["SPABLA_V2_ENABLE_DEV_SEED"] = "1";
}

function disableGate(): void {
  env["NODE_ENV"] = "production";
  delete env["SPABLA_V2_ENABLE_DEV_SEED"];
}

beforeEach(() => {
  runFase9SeedMock.mockReset();
});

afterEach(() => {
  if (ORIGINAL_NODE_ENV === undefined) {
    delete env["NODE_ENV"];
  } else {
    env["NODE_ENV"] = ORIGINAL_NODE_ENV;
  }
  if (ORIGINAL_GATE === undefined) {
    delete env["SPABLA_V2_ENABLE_DEV_SEED"];
  } else {
    env["SPABLA_V2_ENABLE_DEV_SEED"] = ORIGINAL_GATE;
  }
  vi.restoreAllMocks();
});

describe("/api/v2/seed · gate OFF", () => {
  beforeEach(() => { disableGate(); });

  test("GET returns 404 and never calls the seed", async () => {
    const res = await GET();
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "not_found" });
    expect(runFase9SeedMock).not.toHaveBeenCalled();
  });

  test("HEAD returns 404 with an empty body and never calls the seed", async () => {
    const res = await HEAD();
    expect(res.status).toBe(404);
    // Response body must be empty on HEAD.
    const body = await res.text();
    expect(body).toBe("");
    expect(runFase9SeedMock).not.toHaveBeenCalled();
  });

  test("POST returns 404 and never calls the seed", async () => {
    const res = await POST();
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "not_found" });
    expect(runFase9SeedMock).not.toHaveBeenCalled();
  });
});

/**
 * Gate MIXED — `NODE_ENV=development` but the flag is either absent or
 * set to a value distinct from the canonical `"1"`. The endpoint must
 * remain fully invisible in these cases: no leakage through GET/HEAD,
 * no mutation through POST, no correlation header, no `seed_failed`
 * log. These scenarios were originally verified through an ephemeral
 * probe; committing them to the suite prevents a regression where a
 * future refactor accidentally weakens the boolean AND in
 * `seedEnabled()`.
 */
describe.each<{ label: string; setFlag: () => void }>([
  {
    label: "NODE_ENV=development · SPABLA_V2_ENABLE_DEV_SEED absent",
    setFlag: () => {
      env["NODE_ENV"] = "development";
      delete env["SPABLA_V2_ENABLE_DEV_SEED"];
    },
  },
  {
    label: "NODE_ENV=development · SPABLA_V2_ENABLE_DEV_SEED=\"0\"",
    setFlag: () => {
      env["NODE_ENV"] = "development";
      env["SPABLA_V2_ENABLE_DEV_SEED"] = "0";
    },
  },
])("/api/v2/seed · gate MIXED · $label", ({ setFlag }) => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setFlag();
    // Spy from the start of the scenario so we can prove `console.error`
    // was never invoked (i.e. no `seed_failed` log ever escaped).
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  test("GET returns 404 · seed never called · no correlation header · no seed_failed log", async () => {
    const res = await GET();
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "not_found" });
    expect(res.headers.get(CORRELATION_HEADER)).toBeNull();
    expect(runFase9SeedMock).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("HEAD returns 404 with an empty body · seed never called · no correlation header · no seed_failed log", async () => {
    const res = await HEAD();
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
    expect(res.headers.get(CORRELATION_HEADER)).toBeNull();
    expect(runFase9SeedMock).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("POST returns 404 · seed never called · no correlation header · no seed_failed log", async () => {
    const res = await POST();
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "not_found" });
    expect(res.headers.get(CORRELATION_HEADER)).toBeNull();
    expect(runFase9SeedMock).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe("/api/v2/seed · gate ON · non-mutating verbs", () => {
  beforeEach(() => { enableGate(); });

  test("GET returns 405 with Allow: POST and empty body; never calls the seed", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
    expect(await res.text()).toBe("");
    expect(runFase9SeedMock).not.toHaveBeenCalled();
  });

  test("HEAD returns 405 with Allow: POST and empty body; never calls the seed", async () => {
    const res = await HEAD();
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
    expect(await res.text()).toBe("");
    expect(runFase9SeedMock).not.toHaveBeenCalled();
  });

  test("no correlation header is emitted for non-mutating verbs", async () => {
    const getRes = await GET();
    const headRes = await HEAD();
    expect(getRes.headers.get(CORRELATION_HEADER)).toBeNull();
    expect(headRes.headers.get(CORRELATION_HEADER)).toBeNull();
  });
});

describe("/api/v2/seed · gate ON · POST success", () => {
  beforeEach(() => { enableGate(); });

  test("returns 200 with the seed body, calls seed exactly once, echoes a UUID correlation header", async () => {
    runFase9SeedMock.mockResolvedValueOnce(SEED_FIXTURE);
    const res = await POST();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(SEED_FIXTURE);
    expect(runFase9SeedMock).toHaveBeenCalledTimes(1);
    const cid = res.headers.get(CORRELATION_HEADER);
    expect(cid).not.toBeNull();
    expect(cid!).toMatch(UUID_RE);
  });

  test("consecutive POSTs both invoke the seed (stateless endpoint; idempotency lives in the data layer)", async () => {
    runFase9SeedMock.mockResolvedValue(SEED_FIXTURE);
    const first = await POST();
    const second = await POST();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(runFase9SeedMock).toHaveBeenCalledTimes(2);
    // Different correlation ids per invocation.
    const cid1 = first.headers.get(CORRELATION_HEADER);
    const cid2 = second.headers.get(CORRELATION_HEADER);
    expect(cid1).not.toBeNull();
    expect(cid2).not.toBeNull();
    expect(cid1).not.toBe(cid2);
  });
});

describe("/api/v2/seed · gate ON · POST failure", () => {
  beforeEach(() => { enableGate(); });

  test("returns 500 with exact public body and correlation header; logs sanitized code", async () => {
    runFase9SeedMock.mockRejectedValueOnce(new Error("seed_env_missing"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST();
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "seed_failed" });
    const cid = res.headers.get(CORRELATION_HEADER);
    expect(cid).toMatch(UUID_RE);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [payload] = errorSpy.mock.calls[0]!;
    expect(typeof payload).toBe("string");
    const parsed = JSON.parse(payload as string) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      event: "seed_failed",
      endpoint: "/api/v2/seed",
      correlationId: cid,
      name: "Error",
      code: "seed_env_missing",
      phase: "env",
    });
    // Only the whitelisted keys must appear.
    expect(Object.keys(parsed).sort()).toEqual([
      "code",
      "correlationId",
      "endpoint",
      "event",
      "name",
      "phase",
    ]);
  });

  test("unrecognised error message is bucketed and its text never appears in the log", async () => {
    const secretish = "invalid api key: sk-supersecret-1234567890abcdef";
    runFase9SeedMock.mockRejectedValueOnce(new Error(secretish));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST();
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "seed_failed" });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const payload = errorSpy.mock.calls[0]![0] as string;
    expect(payload).not.toContain("sk-supersecret");
    expect(payload).not.toContain("invalid api key");
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    expect(parsed.code).toBe("unknown_error");
    expect(parsed.phase).toBe("unknown");
  });

  test("non-Error rejection is bucketed as NonError", async () => {
    runFase9SeedMock.mockRejectedValueOnce("random string with password=hunter2");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST();
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "seed_failed" });
    const payload = errorSpy.mock.calls[0]![0] as string;
    expect(payload).not.toContain("hunter2");
    expect(payload).not.toContain("password=");
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    expect(parsed.name).toBe("NonError");
    expect(parsed.code).toBe("unknown_error");
  });

  test("public failure body never carries service-role artefacts or tokens", async () => {
    runFase9SeedMock.mockRejectedValueOnce(
      new Error("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy.signature"),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST();
    const body = await res.text();
    expect(body).toBe(JSON.stringify({ error: "seed_failed" }));
    const logPayload = errorSpy.mock.calls[0]![0] as string;
    expect(logPayload).not.toContain("eyJhbGciOi");
    expect(logPayload).not.toContain("Bearer ");
  });
});
