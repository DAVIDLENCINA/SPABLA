import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONTRACT_PATH = path.resolve(__dirname, "CONTRACT.md");
const INDEX_PATH = path.resolve(__dirname, "index.ts");
const ENGINE_BARREL_PATH = path.resolve(__dirname, "..", "index.ts");

const readContract = (): string => fs.readFileSync(CONTRACT_PATH, "utf-8");
const readIndex = (): string => fs.readFileSync(INDEX_PATH, "utf-8");
const readBarrel = (): string => fs.readFileSync(ENGINE_BARREL_PATH, "utf-8");

describe("adapters domain — Hito 7.2 internal contract document (CONTRACT.md)", () => {
  it("§19.1 — normative document exists inside the domain", () => {
    expect(fs.existsSync(CONTRACT_PATH)).toBe(true);
    expect(fs.statSync(CONTRACT_PATH).isFile()).toBe(true);
  });

  it("§19.2 — document carries the INTERNAL marker in its header", () => {
    const head = readContract().split("\n").slice(0, 20).join("\n");
    expect(head).toMatch(/INTERNAL/);
  });

  it("§19.3 — document cites ADR-003", () => {
    expect(readContract()).toMatch(/ADR-003/);
  });

  it("§19.4 — document cites ADR-004 with §2.3, §2.6 and §2.7", () => {
    const src = readContract();
    expect(src).toMatch(/ADR-004 §2\.3/);
    expect(src).toMatch(/ADR-004 §2\.6/);
    expect(src).toMatch(/ADR-004 §2\.7/);
  });

  it("§19.5 — document cites ADR-005 with §5", () => {
    expect(readContract()).toMatch(/ADR-005 §5/);
  });

  it("§19.6 — document cites ADR-006 with §1, §2, §3, §4 and §5", () => {
    const src = readContract();
    expect(src).toMatch(/ADR-006 §1/);
    expect(src).toMatch(/ADR-006 §2/);
    expect(src).toMatch(/ADR-006 §3/);
    expect(src).toMatch(/ADR-006 §4/);
    expect(src).toMatch(/ADR-006 §5/);
  });

  it("§19.7 — document cites ADR-007 V1.1 with §4, §5, §6, §7, §8 and §9", () => {
    const src = readContract();
    expect(src).toMatch(/ADR-007 V1\.1 §4/);
    expect(src).toMatch(/ADR-007 V1\.1 §5/);
    expect(src).toMatch(/ADR-007 V1\.1 §6/);
    expect(src).toMatch(/ADR-007 V1\.1 §7/);
    expect(src).toMatch(/ADR-007 V1\.1 §8/);
    expect(src).toMatch(/ADR-007 V1\.1 §9/);
  });

  it("§19.8 — document enumerates options (a), (b), (c) of ADR-006 §2", () => {
    const src = readContract();
    expect(src).toMatch(/\(a\)/);
    expect(src).toMatch(/\(b\)/);
    expect(src).toMatch(/\(c\)/);
  });

  it("§19.9 — document references canonical forms F1, F2 and F3", () => {
    const src = readContract();
    expect(src).toMatch(/\bF1\b/);
    expect(src).toMatch(/\bF2\b/);
    expect(src).toMatch(/\bF3\b/);
  });

  it("§19.10 — document cites ADR-004 §2.7 (consumer rule) and §2.6 (no registry helper)", () => {
    const src = readContract();
    expect(src).toMatch(/ADR-004 §2\.7/);
    expect(src).toMatch(/ADR-004 §2\.6/);
    // The consumer rule must be textually present.
    expect(src.toLowerCase()).toMatch(/consumer/);
  });

  it("§19.11 — document cites the semantic equivalence with the source-of-truth predicate", () => {
    const src = readContract();
    // Both the identifier and the membership predicate must be cited.
    expect(src).toMatch(/getSupportedLanguages/);
    expect(src).toMatch(/\.has\(/);
    expect(src).toMatch(/equivalencia|equivalent/i);
  });

  it("§19.12 — document cites the hard prohibition of re-export from the engine public barrel", () => {
    const src = readContract();
    expect(src).toMatch(/re-export/i);
    expect(src).toMatch(/engine\/src\/index\.ts|barrel/i);
  });
});

describe("adapters domain — Hito 7.2 JSDoc of the domain entry point", () => {
  it("§19.13 — JSDoc of index.ts references CONTRACT.md and cites ADR-007 V1.1", () => {
    const src = readIndex();
    expect(src).toMatch(/CONTRACT\.md/);
    expect(src).toMatch(/ADR-007 V1\.1/);
  });

  it("index.ts module body remains a marker-only module (export {};)", () => {
    // The Hito 7.2 must not add any public export to the domain entry point.
    expect(readIndex()).toMatch(/export\s*\{\s*\}\s*;/);
  });
});

describe("adapters domain — Hito 7.2 public surface preservation", () => {
  it("§19.14 — engine public barrel does not import the internal contract nor its test", () => {
    const src = readBarrel();
    expect(src).not.toMatch(/CONTRACT\.md/);
    expect(src).not.toMatch(/contract\.test/);
    // Reaffirm Hito 7.1 invariant: no import from the adapters domain.
    expect(src).not.toMatch(/from\s+["']\.\/adapters["']/);
    expect(src).not.toMatch(/from\s+["']\.\/adapters\//);
  });
});
