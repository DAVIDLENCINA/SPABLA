import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { AdapterBase, AdapterCapabilities } from "./adapters.js";
import type { LangCode } from "./language.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Fake adapters for contract tests ────────────────────────────────────────

class LegacyAdapter implements AdapterBase<"mt"> {
  readonly kind = "mt" as const;
}

class ProductionAdapterOnlyGSL implements AdapterBase<"mt"> {
  readonly kind = "mt" as const;
  private readonly supported = new Set<LangCode>(["es", "en", "fr"]);
  getSupportedLanguages(): ReadonlySet<LangCode> {
    return this.supported;
  }
}

class ProductionAdapterCoherent implements AdapterBase<"mt"> {
  readonly kind = "mt" as const;
  private readonly supported = new Set<LangCode>(["es", "en"]);
  getSupportedLanguages(): ReadonlySet<LangCode> {
    return this.supported;
  }
  supports(lang: LangCode): boolean {
    return this.supported.has(lang);
  }
}

class ProductionAdapterDivergent implements AdapterBase<"mt"> {
  readonly kind = "mt" as const;
  private readonly supported = new Set<LangCode>(["es", "en"]);
  getSupportedLanguages(): ReadonlySet<LangCode> {
    return this.supported;
  }
  supports(lang: LangCode): boolean {
    // Intentionally inconsistent: returns true for "fr" though not in set.
    return lang === "fr" ? true : this.supported.has(lang);
  }
}

class AdapterWithEmptyCapabilities implements AdapterBase<"mt"> {
  readonly kind = "mt" as const;
  readonly capabilities: AdapterCapabilities = {};
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("AdapterBase — legacy compatibility (ADR-004 §2.4)", () => {
  it("adapter without new members compiles and is valid at the type level", () => {
    const adapter = new LegacyAdapter();
    expect(adapter.kind).toBe("mt");
    expect(adapter.getSupportedLanguages).toBeUndefined();
    expect(adapter.supports).toBeUndefined();
    expect(adapter.capabilities).toBeUndefined();
  });
});

describe("AdapterBase — getSupportedLanguages as source of truth (ADR-004 §2.2, §2.3)", () => {
  it("exposes the set of supported languages", () => {
    const adapter = new ProductionAdapterOnlyGSL();
    const set = adapter.getSupportedLanguages();
    expect(set.has("es")).toBe(true);
    expect(set.has("en")).toBe(true);
    expect(set.has("fr")).toBe(true);
    expect(set.has("zh")).toBe(false);
  });

  it("allows discovery without knowing the global catalog", () => {
    const adapter = new ProductionAdapterOnlyGSL();
    const supported = Array.from(adapter.getSupportedLanguages());
    expect(supported.sort()).toEqual(["en", "es", "fr"]);
  });

  it("supports?() may be omitted; default derivation is deferred to Fase 7 or SDK plan", () => {
    const adapter = new ProductionAdapterOnlyGSL();
    expect(adapter.supports).toBeUndefined();
    // Consumer materialization of supports(lang) via getSupportedLanguages()
    // lives outside Foundation Evolution 2 (ADR-004 §2.3).
  });
});

describe("AdapterBase — supports() coherent with getSupportedLanguages() (ADR-004 §2.3)", () => {
  it("returns identical results for every lang when adapter implements both coherently", () => {
    const adapter = new ProductionAdapterCoherent();
    const probe: LangCode[] = ["es", "en", "fr", "zh", "de", "ja"];
    for (const lang of probe) {
      const bySupports = adapter.supports!(lang);
      const bySet = adapter.getSupportedLanguages!().has(lang);
      expect(bySupports).toBe(bySet);
    }
  });
});

describe("AdapterBase — divergence detection (ADR-004 §2.3)", () => {
  it("divergent supports() is detectable via coherence checker", () => {
    const adapter = new ProductionAdapterDivergent();
    const probe: LangCode[] = ["es", "en", "fr", "zh"];
    const divergent: LangCode[] = [];
    for (const lang of probe) {
      const bySupports = adapter.supports!(lang);
      const bySet = adapter.getSupportedLanguages!().has(lang);
      if (bySupports !== bySet) divergent.push(lang);
    }
    // Adapter is invalid for production (ADR-004 §2.3): supports("fr")
    // returns true but "fr" is not in the source of truth.
    expect(divergent.length).toBeGreaterThan(0);
    expect(divergent).toContain("fr");
  });
});

describe("AdapterCapabilities — empty extensible socket (ADR-004 §2.5)", () => {
  it("empty capabilities object is valid and structurally satisfies AdapterCapabilities", () => {
    const adapter = new AdapterWithEmptyCapabilities();
    expect(adapter.capabilities).toEqual({});
  });

  it("has no keys defined by ADR-004", () => {
    const caps: AdapterCapabilities = {};
    expect(Object.keys(caps)).toHaveLength(0);
  });
});

describe("AdapterCapabilities — no dynamic state allowed (ADR-004 §2.5, source-level)", () => {
  it("adapters.ts JSDoc enumerates the prohibited dynamic categories", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "adapters.ts"), "utf-8");
    // Verify normative JSDoc lists the ADR-004 §2.5 prohibitions. The
    // regex allows whitespace/newlines between adjacent tokens because
    // JSDoc lines wrap.
    expect(source).toMatch(/Prohibited\s+(?:\*\s*)?categories/i);
    expect(source).toMatch(/runtime\s+(?:\*\s*)?state/i);
    expect(source).toMatch(/active\s+(?:\*\s*)?sessions/i);
    expect(source).toMatch(/real-time\s+(?:\*\s*)?metrics/i);
    expect(source).toMatch(/user\s+(?:\*\s*)?data/i);
  });

  it("adapters.ts imports no runtime session/message/participant types", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "adapters.ts"), "utf-8");
    // No import from runtime modules that carry dynamic session state.
    const forbidden = source.match(
      /import[^"']*["'](?:\.\.\/)+(?:stt|translation|tts|messaging|session-manager|participant-manager)\/[^"']*["']/g,
    );
    expect(forbidden).toBeNull();
  });
});

describe("§2.7 rule — consumers never manually call getSupportedLanguages().has() outside authorized context", () => {
  it("no ad-hoc usage in the engine source tree", () => {
    const engineSrc = path.resolve(__dirname, "..");
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(p));
        else if (entry.name.endsWith(".ts")) out.push(p);
      }
      return out;
    };
    const files = walk(engineSrc);
    const violations: string[] = [];
    for (const f of files) {
      // Authorized context: adapters.ts (contract) + adapters.test.ts (contract tests).
      if (f.endsWith("types/adapters.ts") || f.endsWith("types/adapters.test.ts")) continue;
      const body = fs.readFileSync(f, "utf-8");
      if (body.match(/getSupportedLanguages\s*\(\s*\)\s*\.\s*has\s*\(/)) {
        violations.push(path.relative(engineSrc, f));
      }
    }
    expect(violations).toEqual([]);
  });
});
