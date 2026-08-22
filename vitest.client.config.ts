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
    // Hito 9.3.1-Q3-R · §FASE 8 · Los tests HTTP-frontier de
    // `app/api/v2/**/route.http.integration.test.ts` spawnean cada uno
    // su propio `next dev` sobre un puerto distinto (3109, 3110, …).
    // Aunque los puertos no se pisan, dos procesos `next dev` en el
    // mismo cwd compiten por el directorio `.next/` y el HMR runtime.
    // Ejecutar los archivos secuencialmente elimina la carrera sin
    // afectar el paralelismo intra-archivo (test.concurrent sigue en
    // pie donde se declare). El coste es ~500 ms adicionales sobre la
    // suite completa; garantiza determinismo en CI Job B.
    fileParallelism: false,
    reporters: ["default"],
  },
});
