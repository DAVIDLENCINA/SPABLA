import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Mirror `tsconfig.json` paths so client-integration tests can
      // import productive modules with the same specifiers the app
      // uses at runtime (`@/lib/v2/...`, `@engine/...`).
      "@": HERE,
      "@engine": resolve(HERE, "engine/src"),
      // Next intercepts `server-only` at bundle time; Vitest cannot
      // resolve it. Point it at a local no-op so route handlers can
      // be imported and exercised in integration tests. Production
      // builds are unaffected — Next continues to enforce the
      // server-only invariant.
      "server-only": resolve(HERE, "lib/v2/test-utils/server-only-shim.ts"),
    },
  },
  test: {
    environment: "node",
    include: [
      "app/**/*.test.ts",
      "lib/v2/client/**/*.test.ts",
      // Hito 9.2.5-C: server-side V2 helpers (e.g. the log sanitizer
      // used by /api/v2/seed) also run under this Node-environment
      // vitest project so they share the same aliases and shims.
      "lib/v2/server/**/*.test.ts",
    ],
    exclude: [
      "node_modules/**",
      "engine/**",
      ".next/**",
      "supabase/**",
    ],
    reporters: ["default"],
  },
});
