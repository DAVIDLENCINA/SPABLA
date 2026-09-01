import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type { AdapterBase } from "../types/adapters";
import type { LangCode } from "../types/language";

import { resolveLanguageSupport } from "./resolve-language-support";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENGINE_BARREL_PATH = path.resolve(__dirname, "..", "index.ts");

// ─── Fakes local to this test file (not exported) ──────────────────

class FakeSupportsFixed implements AdapterBase<"mt"> {
  readonly kind = "mt" as const;
  public supportsCallCount = 0;
  private readonly value: boolean;
  constructor(value: boolean) {
    this.value = value;
  }
  supports(_lang: LangCode): boolean {
    this.supportsCallCount++;
    return this.value;
  }
}

class FakeBothDivergent implements AdapterBase<"mt"> {
  readonly kind = "mt" as const;
  public supportsCallCount = 0;
  public gslCallCount = 0;
  private readonly supportsValue: boolean;
  private readonly supportedSet: ReadonlySet<LangCode>;
  constructor(supportsValue: boolean, supportedSet: ReadonlySet<LangCode>) {
    this.supportsValue = supportsValue;
    this.supportedSet = supportedSet;
  }
  supports(_lang: LangCode): boolean {
    this.supportsCallCount++;
    return this.supportsValue;
  }
  getSupportedLanguages(): ReadonlySet<LangCode> {
    this.gslCallCount++;
    return this.supportedSet;
  }
}

class FakeGSLOnly implements AdapterBase<"mt"> {
  readonly kind = "mt" as const;
  public gslCallCount = 0;
  private readonly supportedSet: ReadonlySet<LangCode>;
  constructor(supportedSet: ReadonlySet<LangCode>) {
    this.supportedSet = supportedSet;
  }
  getSupportedLanguages(): ReadonlySet<LangCode> {
    this.gslCallCount++;
    return this.supportedSet;
  }
}

class FakeLegacy implements AdapterBase<"mt"> {
  readonly kind = "mt" as const;
}

// ─── Tests §20.1 (14 dedicated functional tests) ────────────────────

describe("resolveLanguageSupport — Hito 7.3 (§20.1)", () => {
  it("§20.1.1 — supports returns true → resolver returns true", () => {
    const adapter = new FakeSupportsFixed(true);
    expect(resolveLanguageSupport(adapter, "es")).toBe(true);
  });

  it("§20.1.2 — supports returns false → resolver returns false", () => {
    const adapter = new FakeSupportsFixed(false);
    expect(resolveLanguageSupport(adapter, "es")).toBe(false);
  });

  it("§20.1.3 — precedence: both declarations exist, supports prevails", () => {
    // supports says true; set holds only "en". Result must match supports.
    const adapter = new FakeBothDivergent(true, new Set<LangCode>(["en"]));
    expect(resolveLanguageSupport(adapter, "es")).toBe(true);
  });

  it("§20.1.4 — getSupportedLanguages is NOT invoked when supports exists", () => {
    const adapter = new FakeBothDivergent(true, new Set<LangCode>(["es"]));
    resolveLanguageSupport(adapter, "es");
    expect(adapter.supportsCallCount).toBe(1);
    expect(adapter.gslCallCount).toBe(0);
  });

  it("§20.1.5 — F1 positive derivation: lang present in set → true", () => {
    const adapter = new FakeGSLOnly(new Set<LangCode>(["es", "en"]));
    expect(resolveLanguageSupport(adapter, "es")).toBe(true);
  });

  it("§20.1.6 — F1 negative derivation: lang absent from set → false", () => {
    const adapter = new FakeGSLOnly(new Set<LangCode>(["es", "en"]));
    expect(resolveLanguageSupport(adapter, "fr")).toBe(false);
  });

  it("§20.1.7 — empty set → false", () => {
    const adapter = new FakeGSLOnly(new Set<LangCode>());
    expect(resolveLanguageSupport(adapter, "es")).toBe(false);
  });

  it("§20.1.8 — legacy adapter (no supports, no getSupportedLanguages) → false (fail-closed)", () => {
    const adapter = new FakeLegacy();
    expect(resolveLanguageSupport(adapter, "es")).toBe(false);
  });

  it("§20.1.9 — positive incoherence: supports=true & lang not in set → true (no fallback)", () => {
    const adapter = new FakeBothDivergent(true, new Set<LangCode>(["en"]));
    expect(resolveLanguageSupport(adapter, "es")).toBe(true);
    // Confirmed: derivation was never invoked, so the value came from supports.
    expect(adapter.gslCallCount).toBe(0);
  });

  it("§20.1.10 — negative incoherence: supports=false & lang in set → false (no fallback)", () => {
    const adapter = new FakeBothDivergent(false, new Set<LangCode>(["es"]));
    expect(resolveLanguageSupport(adapter, "es")).toBe(false);
    // Critical: the resolver did NOT fall back to derivation after supports=false.
    expect(adapter.gslCallCount).toBe(0);
  });

  it("§20.1.11 — adapter is not mutated during resolution", () => {
    const adapter = new FakeGSLOnly(new Set<LangCode>(["es", "en"]));
    const originalKind = adapter.kind;
    const gslBefore = adapter.gslCallCount;
    resolveLanguageSupport(adapter, "es");
    // Only the internal counter of the fake changes (it is instrumentation,
    // not the adapter's observable state). The adapter's shape is preserved.
    expect(adapter.kind).toBe(originalKind);
    expect(adapter.gslCallCount).toBe(gslBefore + 1);
  });

  it("§20.1.12 — the Set returned by getSupportedLanguages is not mutated", () => {
    const source = new Set<LangCode>(["es", "en"]);
    const adapter = new FakeGSLOnly(source);
    const sizeBefore = source.size;
    const snapshotBefore = Array.from(source).sort();
    resolveLanguageSupport(adapter, "fr");
    resolveLanguageSupport(adapter, "es");
    resolveLanguageSupport(adapter, "de");
    expect(source.size).toBe(sizeBefore);
    expect(Array.from(source).sort()).toEqual(snapshotBefore);
  });

  it("§20.1.13 — purity/determinism: same inputs → same result across repeated invocations", () => {
    const supportsAdapter = new FakeSupportsFixed(true);
    expect(resolveLanguageSupport(supportsAdapter, "es")).toBe(true);
    expect(resolveLanguageSupport(supportsAdapter, "es")).toBe(true);
    expect(resolveLanguageSupport(supportsAdapter, "es")).toBe(true);

    const gslAdapter = new FakeGSLOnly(new Set<LangCode>(["es"]));
    expect(resolveLanguageSupport(gslAdapter, "es")).toBe(true);
    expect(resolveLanguageSupport(gslAdapter, "es")).toBe(true);
    expect(resolveLanguageSupport(gslAdapter, "fr")).toBe(false);
    expect(resolveLanguageSupport(gslAdapter, "fr")).toBe(false);

    const legacyAdapter = new FakeLegacy();
    expect(resolveLanguageSupport(legacyAdapter, "es")).toBe(false);
    expect(resolveLanguageSupport(legacyAdapter, "es")).toBe(false);
  });

  it("§20.1.14 — symbol is NOT re-exported from engine/src/index.ts", () => {
    const source = fs.readFileSync(ENGINE_BARREL_PATH, "utf-8");
    expect(source).not.toMatch(/resolveLanguageSupport/);
    expect(source).not.toMatch(/resolve-language-support/);
  });
});
