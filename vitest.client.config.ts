import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "app/**/*.test.ts",
      "lib/v2/client/**/*.test.ts",
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
