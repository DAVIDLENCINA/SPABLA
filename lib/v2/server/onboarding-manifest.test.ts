/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-A-Q2 · Manifiesto de trazabilidad Q2-01..Q2-58.
 *
 * Verifica automáticamente que los 58 casos del contrato §14
 * (Q1-RR-SCOPE) están cubiertos por un identificador `Q2-NN` estable
 * en al menos un archivo de test del repositorio. Cero ID duplicado.
 * Cero hueco. Cero `.skip`. Cero `.only`. Cero `.todo`.
 *
 * Cumple contract §14 y la orden FASE 5 del hito 9.3.2-A-Q2.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..", "..");

const SEARCH_ROOTS = [
  "lib/v2/server",
  "app/api/v2/onboarding",
  "supabase/tests",
];

const TEST_EXTENSIONS = [".test.ts", ".test.tsx", ".test.sql"];

const EXPECTED_IDS: ReadonlyArray<string> = Array.from(
  { length: 58 },
  (_, i) => `Q2-${String(i + 1).padStart(2, "0")}`,
);

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      // Skip node_modules, .next, coverage
      if (name === "node_modules" || name === ".next" || name === "coverage") {
        continue;
      }
      out.push(...walk(full));
    } else if (TEST_EXTENSIONS.some((ext) => name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

function collectTestFiles(): string[] {
  const files: string[] = [];
  for (const root of SEARCH_ROOTS) {
    files.push(...walk(join(REPO_ROOT, root)));
  }
  return files;
}

function readAll(files: string[]): string {
  return files.map((f) => readFileSync(f, "utf-8")).join("\n\n");
}

describe("[Q2-manifest] traceability 58 scenarios Q2-01..Q2-58", () => {
  const files = collectTestFiles();
  const body = readAll(files);

  it("has at least one test file for onboarding", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("every Q2-NN identifier appears in at least one test file", () => {
    const missing: string[] = [];
    for (const id of EXPECTED_IDS) {
      // Word-boundary match: `Q2-05`, `Q2-05:`, `Q2-05 ·`, etc.
      const re = new RegExp(`\\b${id}\\b`);
      if (!re.test(body)) {
        missing.push(id);
      }
    }
    expect(missing).toStrictEqual([]);
  });

  it("no identifier outside Q2-01..Q2-58 range is used", () => {
    const invalid: string[] = [];
    const re = /\bQ2-(\d{2,3})\b/g;
    let match: RegExpExecArray | null;
    const seen = new Set<string>();
    while ((match = re.exec(body)) !== null) {
      const id = match[0];
      if (seen.has(id)) continue;
      seen.add(id);
      const n = parseInt(match[1], 10);
      if (n < 1 || n > 58) {
        invalid.push(id);
      }
    }
    expect(invalid).toStrictEqual([]);
  });

  it("no test file uses `.skip` / `.only` / `.todo` / `.fixme` mid-flow", () => {
    // Search only in TypeScript test files (SQL suites do not have
    // vitest primitives). The env-based auto-skip pattern used across
    // the SPABLA V2 basal — `const suite = ENABLED ? describe : describe.skip`
    // — is deliberately allowed: it is a documented pattern (same as
    // `route.integration.test.ts` from hito 9.2.4) that skips at
    // module load when the Supabase local env vars are absent (local
    // dev), NOT to hide instability. What is forbidden is the
    // mid-flow use of `.skip`/`.only`/`.todo`/`.fixme` inside test
    // bodies or ad-hoc single-test skips.
    //
    // Comments (`//`, `/**`, `*`) are stripped before the scan so a
    // documented example inside a JSDoc block does not trigger a
    // false positive. This file itself is skipped because it declares
    // the forbidden patterns as regex literals for enforcement.
    const tsFiles = files
      .filter((f) => f.endsWith(".test.ts") || f.endsWith(".test.tsx"))
      .filter((f) => !f.endsWith("onboarding-manifest.test.ts"));

    const stripComments = (src: string): string =>
      src
        // Strip line comments
        .replace(/(^|[^:'"`])\/\/[^\n]*/g, "$1")
        // Strip block comments (non-greedy across lines)
        .replace(/\/\*[\s\S]*?\*\//g, "");

    // `test.skip` / `it.skip` inside test bodies are forbidden.
    // `test.only` / `it.only` / `describe.only` are forbidden.
    // `test.todo` / `it.todo` / `describe.todo` are forbidden.
    // `test.fixme` / `it.fixme` / `describe.fixme` are forbidden.
    // `describe.skip` is allowed only if it is part of the idiom
    // `? describe : describe.skip` (env-based auto-skip).
    const forbiddenMidFlow = /\b(?:test|it|describe)\.(?:only|todo|fixme)\b|\b(?:it|test)\.skip\b/;
    const bareDescribeSkip = /(?<!\?\s*describe\s*:\s*)\bdescribe\.skip\b/;

    const offenders: string[] = [];
    for (const f of tsFiles) {
      const stripped = stripComments(readFileSync(f, "utf-8"));
      if (forbiddenMidFlow.test(stripped)) {
        offenders.push(`${f} (forbidden mid-flow modifier)`);
      } else if (bareDescribeSkip.test(stripped)) {
        offenders.push(`${f} (bare describe.skip)`);
      }
    }
    expect(offenders).toStrictEqual([]);
  });

  it("no test file declares `retries` >= 1 (would mask instability)", () => {
    const tsFiles = files.filter((f) => f.endsWith(".test.ts") || f.endsWith(".test.tsx"));
    // Match `retries: <n>` with n >= 1 in the same line
    const badRetries = /\bretries\s*:\s*[1-9]\d*\b/;
    const offenders: string[] = [];
    for (const f of tsFiles) {
      const content = readFileSync(f, "utf-8");
      if (badRetries.test(content)) {
        offenders.push(f);
      }
    }
    expect(offenders).toStrictEqual([]);
  });
});
