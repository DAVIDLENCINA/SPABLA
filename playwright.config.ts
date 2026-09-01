/**
 * SPABLA V2 · Hito 9.3.1-Q3-E2E · Playwright configuration.
 *
 * Boots ONLY Chromium. The runner script
 * `scripts/e2e/run-auth-continuity.sh` orchestrates Supabase local +
 * `next dev` on an isolated port before invoking `npx playwright test`
 * with the env vars this config expects:
 *
 *   SPABLA_E2E_BASE_URL          — http://127.0.0.1:<port>
 *   SPABLA_E2E_SUPABASE_URL      — http://127.0.0.1:54321
 *   SPABLA_E2E_SUPABASE_ANON_KEY — from `supabase status -o json`
 *   SPABLA_E2E_SUPABASE_SERVICE_ROLE_KEY — for fixture creation only
 *
 * Absolute constraints of Hito 9.3.1-Q3-E2E:
 *   - Only Chromium.
 *   - workers: 1 (serialize to avoid races against Supabase local).
 *   - retries: 0 (contract §12 forbids hiding flakiness).
 *   - No traces, no video, no HAR — traces can carry Authorization
 *     headers and refresh tokens.
 *   - Screenshots only on failure, no HTML report volume, no bodies
 *     dumped by the reporter.
 *   - test-results / playwright-report / .playwright are gitignored.
 */

import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.SPABLA_E2E_BASE_URL ?? "http://127.0.0.1:3111";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
  outputDir: "./test-results/e2e",
  use: {
    baseURL: BASE_URL,
    screenshot: "only-on-failure",
    video: "off",
    trace: "off",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
