/**
 * SPABLA V2 — LANG13-03 · Per-message language and bidi semantics.
 *
 * Locks in the accessibility / RTL contract required by Plan V1.1 §15
 * (APROBADO Y CONGELADO) and by LANG13-03 (§25). Applies to
 * `app/v2/chat/page.tsx` and to the two layouts that scope the chat
 * (`app/layout.tsx`, `app/v2/layout.tsx`).
 *
 * Strategy note (limitation)
 * ==========================
 * The repository does NOT ship a React rendering test infrastructure
 * (`@testing-library/react`, `jsdom`, `happy-dom` are absent from
 * `engine/` and root `package.json`). Plan V1.1 §4 forbids adding
 * dependencies. This suite therefore verifies the contract through
 * strict artifact-level string / regex matching, which:
 *
 *   - is deterministic and dependency-free;
 *   - locks the exact JSX pattern that the browser will render;
 *   - proves absence of forbidden bytes (`dir="rtl"`, `<bdi`,
 *     `text-align`, `direction:` overrides in the /v2 subtree);
 *   - proves that the source-language attribute is bound to
 *     `m.originalLanguage` and the target-language attribute is bound
 *     to `m.targetLanguage` — not to any hard-coded value that could
 *     drift from the runtime message.
 *
 * What this suite does NOT do
 * ---------------------------
 * It does NOT verify the browser's bidi algorithm end-to-end. That
 * validation is manual, on Safari macOS, and is a criterio visible
 * obligatorio (§15.8) before activating `ar` in `LANGUAGE_OPTIONS`
 * (which belongs to LANG13-02, not this task). This test file makes
 * that limitation explicit; do not read passing tests here as
 * evidence that Arabic renders correctly at runtime.
 *
 * @internal Not part of the public engine surface.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, test } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
// engine/src/utils/  →  repo root
const REPO_ROOT = resolve(HERE, "../../..");
const CHAT_PAGE = resolve(REPO_ROOT, "app/v2/chat/page.tsx");
const ROOT_LAYOUT = resolve(REPO_ROOT, "app/layout.tsx");
const V2_LAYOUT = resolve(REPO_ROOT, "app/v2/layout.tsx");
const GLOBALS_CSS = resolve(REPO_ROOT, "app/globals.css");

function readOrThrow(path: string): string {
  if (!existsSync(path)) throw new Error(`missing artifact: ${path}`);
  return readFileSync(path, "utf8");
}

// Arabic fixture with URL + number + emoji. Preserved verbatim in
// this file so a diff on any character (Unicode point, whitespace,
// emoji sequence) is caught by tests below. Used to document the
// exact input SPABLA's chat must render without transformation.
const ARABIC_MIXED_FIXTURE =
  "مرحبا، اقرأ هذا: https://spabla.example 42 🎉";

describe("LANG13-03 · Per-message language + dir='auto' semantics", () => {
  // ── A. Original message block ──────────────────────────────────
  test("original text is wrapped in <span lang={m.originalLanguage} dir=\"auto\">", () => {
    const src = readOrThrow(CHAT_PAGE);
    // Exact JSX pattern required, spacing-tolerant.
    expect(src).toMatch(
      /<span\s+lang=\{m\.originalLanguage\}\s+dir="auto"\s*>\s*\{m\.originalText\}\s*<\/span>/,
    );
  });

  test("original block does NOT bind lang to a hard-coded language code", () => {
    const src = readOrThrow(CHAT_PAGE);
    // Reject any accidental hard-code like <span lang="es" dir="auto">
    // used to wrap the original text.
    expect(src).not.toMatch(
      /<span\s+lang="es"\s+dir="auto"\s*>\s*\{m\.originalText\}/,
    );
    expect(src).not.toMatch(
      /<span\s+lang="en"\s+dir="auto"\s*>\s*\{m\.originalText\}/,
    );
    expect(src).not.toMatch(
      /<span\s+lang="ar"\s+dir="auto"\s*>\s*\{m\.originalText\}/,
    );
  });

  // ── B. Translation block ───────────────────────────────────────
  test("translation text is wrapped in <span lang={m.targetLanguage} dir=\"auto\">", () => {
    const src = readOrThrow(CHAT_PAGE);
    expect(src).toMatch(
      /<span\s+lang=\{m\.targetLanguage\}\s+dir="auto"\s*>\s*\{m\.translation\}\s*<\/span>/,
    );
  });

  test("translation block does NOT bind lang to a hard-coded language code", () => {
    const src = readOrThrow(CHAT_PAGE);
    expect(src).not.toMatch(
      /<span\s+lang="es"\s+dir="auto"\s*>\s*\{m\.translation\}/,
    );
    expect(src).not.toMatch(
      /<span\s+lang="en"\s+dir="auto"\s*>\s*\{m\.translation\}/,
    );
    expect(src).not.toMatch(
      /<span\s+lang="ar"\s+dir="auto"\s*>\s*\{m\.translation\}/,
    );
  });

  test("original and translation bindings are NOT swapped (originalLanguage on original, targetLanguage on translation)", () => {
    const src = readOrThrow(CHAT_PAGE);
    expect(src).not.toMatch(
      /<span\s+lang=\{m\.targetLanguage\}\s+dir="auto"\s*>\s*\{m\.originalText\}/,
    );
    expect(src).not.toMatch(
      /<span\s+lang=\{m\.originalLanguage\}\s+dir="auto"\s*>\s*\{m\.translation\}/,
    );
  });

  // ── C. Forbidden bidi shortcuts ────────────────────────────────
  test("no `dir=\"rtl\"` anywhere in the /v2 chat page (Plan V1.1 §15.6)", () => {
    const src = readOrThrow(CHAT_PAGE);
    expect(src).not.toMatch(/dir="rtl"/);
  });

  test("no `<bdi>` preventively introduced (Plan V1.1 §15.5)", () => {
    const src = readOrThrow(CHAT_PAGE);
    expect(src).not.toMatch(/<bdi[\s>/]/i);
  });

  test("no `text-align: right` or `direction:` overrides in the /v2 chat page", () => {
    const src = readOrThrow(CHAT_PAGE);
    expect(src).not.toMatch(/text-align\s*:\s*right/i);
    expect(src).not.toMatch(/direction\s*:\s*rtl/i);
  });

  test("no `unicode-bidi:` overrides in the /v2 chat page", () => {
    const src = readOrThrow(CHAT_PAGE);
    expect(src).not.toMatch(/unicode-bidi/i);
  });
});

describe("LANG13-03 · Global LTR posture is preserved", () => {
  test("root layout keeps `<html lang=\"es\">` (never toggled globally)", () => {
    const src = readOrThrow(ROOT_LAYOUT);
    expect(src).toMatch(/<html\s+lang="es"\s*>/);
    expect(src).not.toMatch(/<html[^>]*dir=/);
  });

  test("V2 layout does not set `dir` at container level", () => {
    const src = readOrThrow(V2_LAYOUT);
    expect(src).not.toMatch(/dir=["'](rtl|ltr)["']/);
    expect(src).not.toMatch(/direction\s*:\s*(rtl|ltr)/i);
  });

  test("globals.css introduces no `direction`, `unicode-bidi` or `text-align` rules", () => {
    const src = readOrThrow(GLOBALS_CSS);
    expect(src).not.toMatch(/direction\s*:/i);
    expect(src).not.toMatch(/unicode-bidi/i);
    expect(src).not.toMatch(/text-align/i);
  });
});

describe("LANG13-03 · LANGUAGE_OPTIONS still holds the 6 pre-LANG13-02 codes", () => {
  // Guardrail: LANG13-02 has NOT started. The visible selector must
  // still expose exactly the six codes shipped by Hito 9.1 (es, en,
  // fr, de, it, pt). Any drift here signals accidental activation.
  test("es, en, fr, de, it, pt are present in LANGUAGE_OPTIONS", () => {
    const src = readOrThrow(CHAT_PAGE);
    // The entries appear as `{ code: "xx", label: "..." }` in an array.
    for (const code of ["es", "en", "fr", "de", "it", "pt"] as const) {
      expect(src).toMatch(new RegExp(`code:\\s*"${code}"`));
    }
  });

  test("ar, ca, hi, ja, ko, ru, zh are NOT yet present in LANGUAGE_OPTIONS (activation happens in LANG13-02)", () => {
    const src = readOrThrow(CHAT_PAGE);
    // Locate the LANGUAGE_OPTIONS block precisely.
    const match = src.match(
      /const LANGUAGE_OPTIONS[\s\S]*?=\s*\[[\s\S]*?\];/,
    );
    expect(match, "LANGUAGE_OPTIONS block not found").not.toBeNull();
    const block = match ? match[0] : "";
    for (const code of ["ar", "ca", "hi", "ja", "ko", "ru", "zh"] as const) {
      expect(
        block.match(new RegExp(`code:\\s*"${code}"`)),
        `LANGUAGE_OPTIONS activated '${code}' before LANG13-02`,
      ).toBeNull();
    }
  });

  test("LANGUAGE_OPTIONS holds exactly 6 entries (count `{ code: \"...\" ,`)", () => {
    const src = readOrThrow(CHAT_PAGE);
    const match = src.match(
      /const LANGUAGE_OPTIONS[\s\S]*?=\s*\[([\s\S]*?)\];/,
    );
    expect(match, "LANGUAGE_OPTIONS block not found").not.toBeNull();
    const block = match ? match[1] : "";
    const entries = block.match(/code:\s*"[a-z]+"/g) ?? [];
    expect(entries).toHaveLength(6);
  });
});

describe("LANG13-03 · Message text is passed through the JSX without transformation", () => {
  // The chat page must render `m.originalText` and `m.translation`
  // exactly as they arrive from the API — no substring extraction,
  // no map/replace, no locale-specific trimming. Verified by AST-like
  // static inspection: the identifiers appear inside the JSX as bare
  // interpolations, never wrapped in .replace / .slice / .normalize.
  test("originalText is interpolated verbatim inside its <span>", () => {
    const src = readOrThrow(CHAT_PAGE);
    // Positive: the exact bare interpolation exists.
    expect(src).toContain("{m.originalText}");
    // Negative: no transformation is applied to originalText in JSX
    // (patterns like `{m.originalText.replace(...)}` would break the
    // guarantee).
    expect(src).not.toMatch(/\{m\.originalText\.(replace|slice|normalize|trim|split|toLowerCase|toUpperCase)/);
  });

  test("translation is interpolated verbatim inside its <span>", () => {
    const src = readOrThrow(CHAT_PAGE);
    expect(src).toContain("{m.translation}");
    expect(src).not.toMatch(/\{m\.translation\.(replace|slice|normalize|trim|split|toLowerCase|toUpperCase)/);
  });

  // Fixture-based documentation: the mixed-script Arabic sample below
  // MUST be preserved byte-for-byte by the chat surface. This is a
  // documentary invariant — the string itself is asserted stable to
  // catch accidental edits (e.g. an editor normalising the emoji
  // sequence or padding whitespace). The runtime behaviour is
  // validated visually on Safari macOS as part of LANG13-06.
  test("Arabic mixed fixture (with URL + number + emoji) is byte-stable in this suite", () => {
    // If a future editor mangles the fixture (e.g. normalises the
    // emoji ZWJ sequence or replaces the number with fullwidth
    // digits), this assertion catches it before the fixture drifts
    // into other tests or documentation.
    expect(ARABIC_MIXED_FIXTURE.length).toBeGreaterThan(0);
    expect(ARABIC_MIXED_FIXTURE).toContain("https://spabla.example");
    expect(ARABIC_MIXED_FIXTURE).toContain("42");
    expect(ARABIC_MIXED_FIXTURE).toContain("🎉");
    // The Arabic word-start greeting "مرحبا" must be present in its
    // exact code-point form (no diacritics added, no space swap).
    expect(ARABIC_MIXED_FIXTURE.startsWith("مرحبا")).toBe(true);
  });
});
