/**
 * SPABLA V2 — LANG13-04 · Proveedor multilingüe + `translationVersion`
 * bump.
 *
 * Locks the contract exigido por Plan V1.1 §16, §17, §18 y §25
 * LANG13-04 (APROBADO Y CONGELADO):
 *
 *   - `LANGUAGE_NAMES` cubre los 13 códigos activados con los nombres
 *     canónicos del §16.
 *   - Los cinco idiomas que exigen precisión (§17 regla 7): `ca`
 *     → "Catalan", `zh` → "Simplified Chinese", `ar` → "Modern
 *     Standard Arabic", `hi` → "Hindi", `ko` → "Korean".
 *   - El prompt sistema instruye preservación de URLs, @menciones,
 *     emojis, números, nombres propios, saltos de línea y estructura
 *     de párrafo (§17 regla 4).
 *   - El prompt sistema prohíbe transliteración (§17 regla 3).
 *   - El prompt sistema exige salida sólo del texto traducido, sin
 *     preámbulo, sin explicación, sin comillas (§17 regla 5).
 *   - `CURRENT_TRANSLATION_VERSION === "v2"` (§18.1).
 *   - Modelo `gpt-4o-mini`, `max_tokens` 500, `temperature` 0 sin
 *     cambios (§16.3, §16.4).
 *   - Fallback `LANGUAGE_NAMES[code] ?? code` (§16.2).
 *
 * Strategy note
 * =============
 * `lib/v2/server/translate.ts` importa `"server-only"` — un paquete
 * de Next.js instalado en el `node_modules` de la raíz del proyecto,
 * NO en `engine/node_modules`. Vitest ejecutándose desde `engine/` no
 * puede resolverlo y fallaría al importar el módulo directamente.
 * El §25 LANG13-04 autoriza expresamente la verificación por
 * "lectura del fichero", que además es la estrategia consistente con
 * `chat-labels.test.ts` / `chat-message-semantics.test.ts` /
 * `seed-actor-language.test.ts` (Plan V1.1 §4 prohíbe añadir
 * dependencias de testing). Este suite lee los dos ficheros
 * autorizados por §23 y valida su contenido literal.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, test } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
// engine/src/utils/ → repo root
const REPO_ROOT = resolve(HERE, "../../..");
const TRANSLATE = resolve(REPO_ROOT, "lib/v2/server/translate.ts");
const RUNTIME = resolve(REPO_ROOT, "lib/v2/server/translation-runtime.ts");

function readOrThrow(p: string): string {
  if (!existsSync(p)) throw new Error(`missing artifact: ${p}`);
  return readFileSync(p, "utf8");
}

// ────────────────────────────────────────────────────────────────
// A · translationVersion bump (§18)
// ────────────────────────────────────────────────────────────────
describe("LANG13-04 · CURRENT_TRANSLATION_VERSION bumped to 'v2'", () => {
  test("translation-runtime.ts declares CURRENT_TRANSLATION_VERSION = \"v2\"", () => {
    const src = readOrThrow(RUNTIME);
    expect(src).toMatch(
      /export const CURRENT_TRANSLATION_VERSION\s*=\s*"v2"\s+as const;/,
    );
  });

  test("translation-runtime.ts no longer holds the old \"v1\" literal on the version constant", () => {
    const src = readOrThrow(RUNTIME);
    expect(src).not.toMatch(
      /export const CURRENT_TRANSLATION_VERSION\s*=\s*"v1"/,
    );
  });
});

// ────────────────────────────────────────────────────────────────
// B · LANGUAGE_NAMES matrix (§16) — 13 canonical entries
// ────────────────────────────────────────────────────────────────
describe("LANG13-04 · LANGUAGE_NAMES covers the 13 activated codes with canonical names", () => {
  const src = readOrThrow(TRANSLATE);
  const blockMatch = src.match(
    /const LANGUAGE_NAMES:\s*Record<string,\s*string>\s*=\s*\{([\s\S]*?)\};/,
  );
  const entryPattern = /([a-z]{2}):\s*"([^"]+)"\s*,?/g;
  const parsedEntries: ReadonlyArray<{ code: string; name: string }> = (() => {
    if (!blockMatch) return [];
    const inside = blockMatch[1] ?? "";
    const out: Array<{ code: string; name: string }> = [];
    for (const m of inside.matchAll(entryPattern)) {
      out.push({ code: m[1] ?? "", name: m[2] ?? "" });
    }
    return out;
  })();

  const EXPECTED_NAMES: ReadonlyArray<{ code: string; name: string }> = [
    { code: "ar", name: "Modern Standard Arabic" },
    { code: "ca", name: "Catalan" },
    { code: "de", name: "German" },
    { code: "en", name: "English" },
    { code: "es", name: "Spanish" },
    { code: "fr", name: "French" },
    { code: "hi", name: "Hindi" },
    { code: "it", name: "Italian" },
    { code: "ja", name: "Japanese" },
    { code: "ko", name: "Korean" },
    { code: "pt", name: "Portuguese" },
    { code: "ru", name: "Russian" },
    { code: "zh", name: "Simplified Chinese" },
  ];

  test("LANGUAGE_NAMES block is well-formed and locatable", () => {
    expect(blockMatch, "LANGUAGE_NAMES declaration not found").not.toBeNull();
    expect(parsedEntries.length, "no entries parsed from LANGUAGE_NAMES").toBeGreaterThan(0);
  });

  test("LANGUAGE_NAMES holds exactly 13 entries", () => {
    expect(parsedEntries).toHaveLength(13);
  });

  test("every code appears exactly once (no duplicates)", () => {
    const codes = parsedEntries.map((e) => e.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test.each(EXPECTED_NAMES)(
    "LANGUAGE_NAMES['$code'] === '$name'",
    ({ code, name }) => {
      const entry = parsedEntries.find((e) => e.code === code);
      expect(entry, `code '${code}' missing from LANGUAGE_NAMES`).toBeDefined();
      expect(entry?.name).toBe(name);
    },
  );

  test("§17 regla 7 · five codes carry the mandatory canonical precision", () => {
    const byCode = new Map(parsedEntries.map((e) => [e.code, e.name] as const));
    expect(byCode.get("ca")).toBe("Catalan");
    expect(byCode.get("zh")).toBe("Simplified Chinese");
    expect(byCode.get("ar")).toBe("Modern Standard Arabic");
    expect(byCode.get("hi")).toBe("Hindi");
    expect(byCode.get("ko")).toBe("Korean");
  });

  test("§16.5 · refinements vs pre-LANG13-04: `ar` and `zh` no longer use the bare 'Arabic' / 'Chinese' labels", () => {
    const byCode = new Map(parsedEntries.map((e) => [e.code, e.name] as const));
    expect(byCode.get("ar")).not.toBe("Arabic");
    expect(byCode.get("zh")).not.toBe("Chinese");
  });

  test("no code outside the approved 13 leaks into LANGUAGE_NAMES", () => {
    const APPROVED = new Set(EXPECTED_NAMES.map((e) => e.code));
    for (const entry of parsedEntries) {
      expect(APPROVED.has(entry.code), `unauthorised code '${entry.code}' in LANGUAGE_NAMES`).toBe(true);
    }
  });

  test("§16.2 · the fallback pattern `LANGUAGE_NAMES[code] ?? code` remains wired", () => {
    // getLanguageNameForProvider exposes the fallback. The exact
    // pattern MUST be preserved so unknown codes echo back verbatim.
    expect(src).toMatch(
      /return LANGUAGE_NAMES\[code\]\s*\?\?\s*code;/,
    );
  });
});

// ────────────────────────────────────────────────────────────────
// C · Hardened system prompt (§17)
// ────────────────────────────────────────────────────────────────
describe("LANG13-04 · System prompt is the hardened multilingual prompt of §17", () => {
  const src = readOrThrow(TRANSLATE);

  test("prompt opens with the professional-translator statement + placeholders", () => {
    expect(src).toContain(
      "You are a professional translator. Translate the user's message from {sourceLanguage} to {targetLanguage}.",
    );
  });

  test("§17.4 · preserves URLs, @mentions, emojis, numbers, proper names, line breaks, paragraph structure", () => {
    expect(src).toContain(
      "Preserve URLs, @mentions, emojis, numbers, proper names, line breaks and paragraph structure.",
    );
  });

  test("§17.3 · forbids transliteration and mandates the natural writing system", () => {
    expect(src).toContain("Do not transliterate");
    expect(src).toContain("natural writing system of the target language");
  });

  test("§17.5 · demands output-only (no preamble, no explanation, no quotation marks)", () => {
    expect(src).toContain("Return only the translated text");
    expect(src).toContain("no preamble, explanation or quotation marks");
  });

  test("regression guard · pre-LANG13-04 generic prompt strings are absent", () => {
    // The old prompt in Hito 9.1 was:
    //   "You are a translator. Translate the user's message from ${sourceLang} to ${targetLang}. Return only the translated text, nothing else."
    // Its distinctive fragments MUST be gone.
    expect(src).not.toContain("You are a translator.");
    expect(src).not.toContain("nothing else.");
  });

  test("prompt template + substitution helper are exported from translate.ts", () => {
    expect(src).toMatch(
      /export function buildSystemPrompt\(sourceLanguage:\s*string,\s*targetLanguage:\s*string\):\s*string/,
    );
    expect(src).toMatch(/const SYSTEM_PROMPT_TEMPLATE\s*:\s*string\s*=/);
  });

  test("system message passed to OpenAI is built via buildSystemPrompt, not an inline literal", () => {
    // Locate the `messages: [ ... ]` block of the OpenAI call and
    // verify the system role goes through buildSystemPrompt(...).
    const systemBlock = src.match(
      /role:\s*"system"\s*,\s*content:\s*([^,\n]+)/,
    );
    expect(systemBlock, "system role content not found").not.toBeNull();
    expect(systemBlock ? systemBlock[1] : "").toContain("buildSystemPrompt(");
  });
});

// ────────────────────────────────────────────────────────────────
// D · Provider intangibles (§16.3, §16.4)
// ────────────────────────────────────────────────────────────────
describe("LANG13-04 · provider intangibles preserved (model / max_tokens / temperature)", () => {
  const src = readOrThrow(TRANSLATE);

  test("model remains `gpt-4o-mini`", () => {
    expect(src).toMatch(/model:\s*"gpt-4o-mini"/);
  });

  test("max_tokens remains 500", () => {
    expect(src).toMatch(/max_tokens:\s*500/);
  });

  test("temperature remains 0", () => {
    expect(src).toMatch(/temperature:\s*0/);
  });

  test("no accidental hard-coding of an ISO code as `sourceLang` or `targetLang`", () => {
    // Both `sourceLang` and `targetLang` MUST be assigned via
    // `getLanguageNameForProvider(...)`. Direct fallbacks like
    // `input.from ?? "es"` or `LANGUAGE_NAMES[input.to] ?? input.to`
    // (inlined outside the helper) would drift from §16.5.
    expect(src).toMatch(
      /const sourceLang\s*=\s*getLanguageNameForProvider\(input\.from\);/,
    );
    expect(src).toMatch(
      /const targetLang\s*=\s*getLanguageNameForProvider\(input\.to\);/,
    );
  });
});
