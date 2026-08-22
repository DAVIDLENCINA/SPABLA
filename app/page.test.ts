/**
 * SPABLA V2 · Hito 9.2.6 · V1-ERADICATION barrier test.
 *
 * Locks the two structural invariants that guarantee no V1 UI/API
 * surface can accidentally reappear from a future refactor:
 *
 *   1. The root `/` route redirects to the V2 conversation and NOT
 *      to any V1 URL (`/home`, `/chat`, `/onboarding`, `/call/**`).
 *   2. The set of route directories under `app/` contains only the
 *      V2 surfaces the hito authorises (`v2`, `api`) plus Next
 *      standard files (`layout.tsx`, `page.tsx`, `globals.css`,
 *      `favicon.ico`). Any resurrection of `app/chat`, `app/home`,
 *      `app/onboarding` or `app/call` fails this test.
 *
 * Rather than mocking a Next navigation runtime just to observe the
 * argument to `redirect(...)`, the test reads the source of
 * `app/page.tsx` and asserts on the literal target. This is
 * intentional: the barrier we want is that a source-level edit
 * pointing back at V1 fails immediately.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIR = HERE;

describe("V1-ERADICATION · root route + app tree structure (Hito 9.2.6)", () => {
  test("app/page.tsx redirects to /v2/chat (not to any V1 URL)", () => {
    const src = readFileSync(resolve(APP_DIR, "page.tsx"), "utf-8");
    expect(src).toContain('redirect("/v2/chat")');
    // Defence-in-depth: none of the retired V1 URLs must appear as a
    // navigation target in the root file.
    for (const forbidden of ["/home", "/chat", "/onboarding", "/call"]) {
      expect(
        src.includes(`redirect("${forbidden}")`)
        || src.includes(`redirect('${forbidden}')`),
      ).toBe(false);
    }
  });

  test("app/** contains no V1 route directory", () => {
    for (const forbidden of ["chat", "home", "onboarding", "call"]) {
      expect(existsSync(resolve(APP_DIR, forbidden))).toBe(false);
    }
    // `app/api/**` must not contain V1 endpoint folders either.
    for (const forbidden of ["translate", "tts", "ice-servers", "debug-trace"]) {
      expect(existsSync(resolve(APP_DIR, "api", forbidden))).toBe(false);
    }
  });

  test("app/api/v2 is preserved with its authorised endpoints", () => {
    const apiV2 = resolve(APP_DIR, "api", "v2");
    expect(existsSync(apiV2)).toBe(true);
    const entries = readdirSync(apiV2).sort();
    // The V2 endpoint set is closed. Any additional folder here
    // indicates uncontrolled scope drift. As of Hito 9.3.1-Q3 the
    // authorised set is `{bootstrap, messages, seed}`; `bootstrap`
    // was added to sustain the server-authoritative session bootstrap
    // that replaces the productive dependency on `runSeed` +
    // `spabla_v2_fase9_seed`.
    expect(entries).toEqual(["bootstrap", "messages", "seed"]);
  });

  test("app/v2/chat page is preserved (the redirect target must exist)", () => {
    expect(existsSync(resolve(APP_DIR, "v2", "chat", "page.tsx"))).toBe(true);
  });
});
