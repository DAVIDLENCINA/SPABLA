/**
 * SPABLA V2 · Prototype isolation guard (permanent architectural invariant).
 *
 * The design/prototype tree (`app/v2/design/**`) is a design study.
 * The productive runtime MUST NOT depend on any file inside it —
 * neither as an import, nor as a provisional public asset URL.
 * This prevents the prototype from silently becoming a runtime
 * dependency of the shipping product.
 *
 * Concretely, this test asserts:
 *
 *   1. Every source file inside the productive trees
 *      (`app/v2/chat/**`, `app/api/v2/**`, `lib/v2/**`,
 *      `engine/src/**`) contains ZERO import specifier pointing
 *      into `app/v2/design/**` — whether the reference uses the
 *      `@/app/v2/design/…` alias, a relative path (`../design/…`),
 *      or the bare project-root form (`app/v2/design/…`).
 *
 *   2. Prototype fixtures (`app/v2/design/**\/fixtures/**`) are not
 *      imported by any productive file. Same detection.
 *
 *   3. Assets that live under `public/design/**` are considered
 *      provisional design assets. Productive code must not
 *      reference their URLs (`"/design/…"`). Productive assets
 *      live directly under `public/`.
 *
 * Detection is deterministic and file-system-only: it does NOT
 * read git history, does NOT compare against any branch, does NOT
 * execute any subprocess. Adding a new productive file or refactoring
 * an existing one never trips this guard as long as no productive
 * code reaches into the design tree.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, relative, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
// app/v2/design/chat/  →  repo root
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");

const PRODUCTIVE_ROOTS: ReadonlyArray<string> = [
  "app/v2/chat",
  "app/api/v2",
  "lib/v2",
  "engine/src",
];

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);

function walkSources(root: string): ReadonlyArray<string> {
  const acc: string[] = [];
  function visit(dir: string): void {
    let entries: ReadonlyArray<string>;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name === "node_modules" || name === ".next" || name === "dist" || name === "build") continue;
      const abs = resolve(dir, name);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        visit(abs);
        continue;
      }
      if (!st.isFile()) continue;
      const dot = name.lastIndexOf(".");
      if (dot < 0) continue;
      const ext = name.slice(dot);
      if (!SOURCE_EXTENSIONS.has(ext)) continue;
      acc.push(abs);
    }
  }
  visit(root);
  return acc;
}

function firstMatch(source: string, patterns: ReadonlyArray<RegExp>): string | null {
  for (const rx of patterns) {
    const m = rx.exec(source);
    if (m) return m[0];
  }
  return null;
}

// Import specifiers that point into the design tree. Matched only
// inside literal specifier positions (`from`, `import(`, `require(`)
// so narrative doc-comments that mention the path do not trip.
const IMPORT_INTO_DESIGN: ReadonlyArray<RegExp> = [
  /(?:from|import|require)\s*[(\s]?\s*["'`]@\/app\/v2\/design\//,
  /(?:from|import|require)\s*[(\s]?\s*["'`](?:\.{1,2}\/)+design\//,
  /(?:from|import|require)\s*[(\s]?\s*["'`]app\/v2\/design\//,
];

// URL literals that point at the provisional design public tree.
const PROVISIONAL_ASSET_URL = /["'`]\/design\/[^"'`\s]+["'`]/;

// Import specifiers that pull in a `design/**/fixtures/**` path.
const IMPORT_DESIGN_FIXTURE = /(?:from|import|require)\s*[(\s]?\s*["'`][^"'`]*\/design\/[^"'`]*\/fixtures\//;

function collectViolations(
  patterns: ReadonlyArray<RegExp>,
): ReadonlyArray<{ file: string; evidence: string }> {
  const violations: Array<{ file: string; evidence: string }> = [];
  for (const rootRel of PRODUCTIVE_ROOTS) {
    const rootAbs = resolve(REPO_ROOT, rootRel);
    for (const file of walkSources(rootAbs)) {
      const src = readFileSync(file, "utf-8");
      const evidence = firstMatch(src, patterns);
      if (evidence !== null) {
        violations.push({ file: relative(REPO_ROOT, file), evidence });
      }
    }
  }
  return violations;
}

describe("SPABLA V2 · prototype isolation (permanent architectural invariant)", () => {
  test("productive trees do not import anything under app/v2/design/**", () => {
    const violations = collectViolations(IMPORT_INTO_DESIGN);
    expect(
      violations,
      violations.length === 0
        ? "ok"
        : `Productive code imports from app/v2/design/**:\n${violations.map((v) => `  ${v.file} → ${v.evidence}`).join("\n")}`,
    ).toEqual([]);
  });

  test("productive trees do not reference provisional /design/** public assets", () => {
    const violations = collectViolations([PROVISIONAL_ASSET_URL]);
    expect(
      violations,
      violations.length === 0
        ? "ok"
        : `Productive code references provisional /design/** assets:\n${violations.map((v) => `  ${v.file} → ${v.evidence}`).join("\n")}`,
    ).toEqual([]);
  });

  test("design fixtures exist and are not consumed by productive code", () => {
    const designChatFixtures = resolve(REPO_ROOT, "app", "v2", "design", "chat", "fixtures");
    expect(statSync(designChatFixtures).isDirectory(), "design chat fixtures directory must exist").toBe(true);

    const violations = collectViolations([IMPORT_DESIGN_FIXTURE]);
    expect(
      violations,
      violations.length === 0
        ? "ok"
        : `Productive code imports design fixtures:\n${violations.map((v) => `  ${v.file} → ${v.evidence}`).join("\n")}`,
    ).toEqual([]);
  });
});
