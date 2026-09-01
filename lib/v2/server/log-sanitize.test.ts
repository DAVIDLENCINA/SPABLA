/**
 * SPABLA V2 · Hito 9.2.5-C · Unit tests for the log sanitizer.
 */

import { describe, expect, test } from "vitest";

import { sanitizeError } from "@/lib/v2/server/log-sanitize";

describe("sanitizeError", () => {
  test.each([
    "seed_env_missing",
    "seed_create_user_failed",
    "seed_list_users_failed",
    "seed_update_password_failed",
    "seed_list_users_too_many_pages",
    "seed_create_tenant_failed",
    "seed_create_conversation_failed",
  ])("preserves whitelisted code %s and derives a coarse phase", (code) => {
    const s = sanitizeError(new Error(code));
    expect(s.code).toBe(code);
    expect(s.name).toBe("Error");
    expect(["env", "user_setup", "user_lookup", "tenant_setup", "conversation_setup", "unknown"]).toContain(s.phase);
    expect(s.phase).not.toBe("unknown");
  });

  test("buckets unknown message to unknown_error and never echoes it", () => {
    const secretish = "invalid api key: sk-supersecret-1234567890abcdef";
    const s = sanitizeError(new Error(secretish));
    expect(s.code).toBe("unknown_error");
    expect(s.phase).toBe("unknown");
    expect(s.name).toBe("Error");
    // Sanity: the sanitized object must not contain the original message
    // as a substring of any field.
    const serialized = JSON.stringify(s);
    expect(serialized).not.toContain("sk-supersecret");
    expect(serialized).not.toContain("invalid api key");
  });

  test("returns NonError bucket when the thrown value is not an Error", () => {
    expect(sanitizeError("string payload with password=hunter2")).toEqual({
      name: "NonError",
      code: "unknown_error",
      phase: "unknown",
    });
    expect(sanitizeError({ some: "object" })).toEqual({
      name: "NonError",
      code: "unknown_error",
      phase: "unknown",
    });
    expect(sanitizeError(undefined)).toEqual({
      name: "NonError",
      code: "unknown_error",
      phase: "unknown",
    });
  });

  test("handles Error subclasses by preserving their constructor name", () => {
    class SeedError extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = "SeedError";
      }
    }
    const s = sanitizeError(new SeedError("seed_env_missing"));
    expect(s.name).toBe("SeedError");
    expect(s.code).toBe("seed_env_missing");
  });

  test("empty error message degrades to unknown_error safely", () => {
    const s = sanitizeError(new Error(""));
    expect(s.code).toBe("unknown_error");
    expect(s.phase).toBe("unknown");
  });
});
