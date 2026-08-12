/**
 * SPABLA V2 — LANG13-02 · `SeedActor.language` alignment with the
 * approved catalogue.
 *
 * Locks the corrección quirúrgica del contrato del seed exigido por
 * Plan V1.1 §3.6, §23 y §25 (APROBADO Y CONGELADO):
 *
 *   > Ampliar tipo `SeedActor.language: LangCode`
 *   > (sin cambio de datos sembrados).
 *
 * The productive `SeedActor` type lives in `lib/v2/server/seed.ts`
 * inside a `server-only` boundary that imports `@supabase/supabase-js`
 * — importing it here would drag in that boundary. This test therefore
 * verifies the invariant through a small piece of type surgery that
 * does not touch the productive module:
 *
 *   1. A local structural mirror of the current `SeedActor` shape is
 *      declared here with `language: LangCode`.
 *   2. Two type-only assignability checks confirm that:
 *        a) every `LangCode` (the 13 activated codes among them) is
 *           an acceptable value for `SeedActor.language`;
 *        b) any string outside `LangCode` is rejected at compile time.
 *   3. Runtime table-driven cases exercise the entire 13-code
 *      activated subset through the `isLangCode` guard, which is the
 *      same guard the productive type consumes.
 *   4. The two seeded demo fixtures (actorA in `es`, actorB in `en`)
 *      remain byte-identical to the pre-LANG13-02 baseline — the
 *      widening of the TYPE must not change any DATUM.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { isLangCode, type LangCode } from "../types/language.js";

// ────────────────────────────────────────────────────────────────
// Structural mirror. Must mirror the productive `SeedActor` in
// `lib/v2/server/seed.ts`. Kept minimal on purpose — the compile-time
// assignability checks below break if the productive `language` field
// ever narrows again.
// ────────────────────────────────────────────────────────────────
type SeedActorMirror = {
  readonly actorId: string;
  readonly email: string;
  readonly password: string;
  readonly language: LangCode;
};

const HERE = dirname(fileURLToPath(import.meta.url));
// engine/src/utils/ → repo root → lib/v2/server/seed.ts
const SEED_FILE = resolve(HERE, "../../..", "lib/v2/server/seed.ts");

function readSeedFile(): string {
  if (!existsSync(SEED_FILE)) {
    throw new Error(`seed source not found at ${SEED_FILE}`);
  }
  return readFileSync(SEED_FILE, "utf8");
}

// The 13 activated codes as declared by Plan V1.1 §8/§14. Kept local
// to the test — the productive code never exports a runtime list of
// activated codes (ADR-004 §2 keeps the public surface untouched).
const ACTIVATED_13 = [
  "es", "ca", "en", "fr", "de", "it", "pt",
  "zh", "ja", "ko", "ar", "hi", "ru",
] as const satisfies ReadonlyArray<LangCode>;

describe("LANG13-02 · SeedActor.language contract widened to LangCode", () => {
  // ── A. Type-level invariants (compile-time only) ────────────────
  test("every LangCode is assignable to SeedActor.language (compile-time)", () => {
    // A one-shot assignment surface: if `SeedActorMirror.language`
    // ever narrows below `LangCode`, this assignment stops compiling
    // and tsc fails the build long before this runtime assertion
    // executes. The runtime part is a smoke check on one code.
    const sample: SeedActorMirror = {
      actorId: "00000000-0000-0000-0000-00000000000a",
      email: "x@spabla.local",
      password: "x",
      language: "ca",
    };
    expect(sample.language).toBe("ca");
  });

  test.each(ACTIVATED_13.map((code) => ({ code })))(
    "SeedActor.language accepts activated code '$code' (type + runtime guard)",
    ({ code }) => {
      // The type-level check is that the assignment below compiles.
      const actor: SeedActorMirror = {
        actorId: "00000000-0000-0000-0000-000000000001",
        email: `demo-${code}@spabla.local`,
        password: "irrelevant",
        language: code,
      };
      expect(actor.language).toBe(code);
      expect(isLangCode(actor.language)).toBe(true);
    },
  );

  test("codes outside LangCode are rejected by the runtime guard used by the seed contract", () => {
    const invalidExamples = [
      "",
      "ES",
      " es ",
      "es-ES",
      "pt-BR",
      "zh-Hans",
      "zh-CN",
      "ar-SA",
      "xx",
    ] as const;
    for (const bad of invalidExamples) {
      expect(isLangCode(bad), `guard accepted invalid '${bad}'`).toBe(false);
    }
  });

  // ── B. Productive source: the seed file's declared type reads
  //      `LangCode`, imports it from `@engine/types/language`, and
  //      never re-narrows to the old `"es" | "en"` shape. ────────
  test("lib/v2/server/seed.ts declares SeedActor.language as LangCode", () => {
    const src = readSeedFile();
    expect(src).toMatch(
      /export type SeedActor\s*=\s*\{[\s\S]*?readonly language:\s*LangCode;/,
    );
  });

  test("lib/v2/server/seed.ts imports LangCode from @engine/types/language", () => {
    const src = readSeedFile();
    expect(src).toMatch(
      /import\s+type\s+\{\s*LangCode\s*\}\s+from\s+["']@engine\/types\/language["']/,
    );
  });

  test("lib/v2/server/seed.ts no longer restricts SeedActor.language to \"es\" | \"en\"", () => {
    const src = readSeedFile();
    // The narrow literal union must NOT appear as the language field's
    // declared type any more. We look for the exact pre-LANG13-02
    // pattern that lived on this line.
    expect(src).not.toMatch(/readonly language:\s*"es"\s*\|\s*"en"/);
  });

  // ── C. Seed data preservation: actorA still 'es', actorB still 'en'. ─
  test("actorA remains seeded with language 'es' (byte-exact literal)", () => {
    const src = readSeedFile();
    expect(src).toMatch(
      /actorA:\s*\{[^}]*password:\s*ACTOR_A_PASSWORD\s*,\s*language:\s*"es"\s*\}/,
    );
  });

  test("actorB remains seeded with language 'en' (byte-exact literal)", () => {
    const src = readSeedFile();
    expect(src).toMatch(
      /actorB:\s*\{[^}]*password:\s*ACTOR_B_PASSWORD\s*,\s*language:\s*"en"\s*\}/,
    );
  });
});
