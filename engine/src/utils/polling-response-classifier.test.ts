import { describe, expect, test } from "vitest";

import {
  classifyPollingResponse,
  SESSION_EXPIRED_MESSAGE,
} from "./polling-response-classifier";

describe("classifyPollingResponse", () => {
  test("HTTP 200 → ok", () => {
    expect(classifyPollingResponse({ status: 200 }, null)).toEqual({ kind: "ok" });
  });

  test("HTTP 201 / 204 → ok (any 2xx)", () => {
    expect(classifyPollingResponse({ status: 201 }, null).kind).toBe("ok");
    expect(classifyPollingResponse({ status: 204 }, null).kind).toBe("ok");
  });

  test("HTTP 401 → expire (unique trigger for session recovery)", () => {
    expect(classifyPollingResponse({ status: 401 }, { error: "unauthorized" })).toEqual({
      kind: "expire",
    });
    expect(classifyPollingResponse({ status: 401 }, null)).toEqual({ kind: "expire" });
  });

  test("HTTP 403 → surface, NEVER expire", () => {
    const action = classifyPollingResponse({ status: 403 }, { error: "forbidden" });
    expect(action.kind).toBe("surface");
    if (action.kind === "surface") expect(action.pollError).toBe("forbidden");
  });

  test("HTTP 404 → surface, NEVER expire", () => {
    const action = classifyPollingResponse({ status: 404 }, { error: "not_found" });
    expect(action.kind).toBe("surface");
    if (action.kind === "surface") expect(action.pollError).toBe("not_found");
  });

  test("HTTP 409 → surface, NEVER expire", () => {
    const action = classifyPollingResponse({ status: 409 }, { error: "conflict" });
    expect(action.kind).toBe("surface");
    if (action.kind === "surface") expect(action.pollError).toBe("conflict");
  });

  test("HTTP 429 → surface, NEVER expire", () => {
    const action = classifyPollingResponse({ status: 429 }, { error: "rate_limited" });
    expect(action.kind).toBe("surface");
    if (action.kind === "surface") expect(action.pollError).toBe("rate_limited");
  });

  test("HTTP 500 → surface, NEVER expire", () => {
    const action = classifyPollingResponse({ status: 500 }, { error: "internal" });
    expect(action.kind).toBe("surface");
    if (action.kind === "surface") expect(action.pollError).toBe("internal");
  });

  test("non-401 with no body falls back to symbolic code", () => {
    const action = classifyPollingResponse({ status: 503 }, null);
    expect(action.kind).toBe("surface");
    if (action.kind === "surface") expect(action.pollError).toBe("poll_status_503");
  });

  test("missing / malformed response is surfaced, never expire", () => {
    const badResponse = { status: undefined as unknown as number };
    expect(classifyPollingResponse(badResponse, null).kind).toBe("surface");
  });

  test("SESSION_EXPIRED_MESSAGE is the exact human-facing string", () => {
    expect(SESSION_EXPIRED_MESSAGE).toBe("Tu sesión ha caducado. Vuelve a iniciar sesión.");
  });
});
