/**
 * SPABLA V2 · Root route + app-tree structural barrier.
 *
 * Locks the two invariants that define the V2 app surface:
 *
 *   1. The root `/` route redirects to `/v2/chat`.
 *   2. The set of route directories under `app/` is exactly the
 *      authorised V2 surface (`v2`, `api`) plus Next standard files
 *      (`layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico`,
 *      `page.test.ts`). Any new route folder must be added here
 *      explicitly, keeping scope drift visible.
 *
 * Rather than mocking a Next navigation runtime just to observe the
 * argument to `redirect(...)`, the test reads the source of
 * `app/page.tsx` and asserts on the literal target.
 */

import { readdirSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIR = HERE;

const AUTHORISED_APP_ENTRIES = new Set([
  "api",
  "favicon.ico",
  "globals.css",
  "layout.tsx",
  "page.test.ts",
  "page.tsx",
  "v2",
]);

describe("SPABLA V2 · root route + app tree structure", () => {
  test("app/page.tsx redirects to /v2/chat", () => {
    const src = readFileSync(resolve(APP_DIR, "page.tsx"), "utf-8");
    expect(src).toContain('redirect("/v2/chat")');
  });

  test("app/** contains only the authorised V2 surface", () => {
    const entries = readdirSync(APP_DIR).filter((e) => !e.startsWith("."));
    for (const entry of entries) {
      expect(
        AUTHORISED_APP_ENTRIES.has(entry),
        `Unexpected entry under app/: ${entry} (extend AUTHORISED_APP_ENTRIES only for approved V2 surfaces)`,
      ).toBe(true);
    }
  });

  test("app/api/v2 is preserved with its authorised endpoints", () => {
    const apiV2 = resolve(APP_DIR, "api", "v2");
    expect(existsSync(apiV2)).toBe(true);
    const entries = readdirSync(apiV2).sort();
    // The V2 endpoint set is closed. Any additional folder here
    // indicates uncontrolled scope drift.
    expect(entries).toEqual(["bootstrap", "messages", "onboarding", "seed"]);
  });

  test("app/v2/chat page is preserved (the redirect target must exist)", () => {
    expect(existsSync(resolve(APP_DIR, "v2", "chat", "page.tsx"))).toBe(true);
  });
});
