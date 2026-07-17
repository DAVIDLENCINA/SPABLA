import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("adapters domain — Hito 7.1 existence", () => {
  it("domain directory exists inside the engine tree", () => {
    const domainDir = path.resolve(__dirname);
    expect(fs.existsSync(domainDir)).toBe(true);
    expect(fs.statSync(domainDir).isDirectory()).toBe(true);
  });

  it("domain module is importable and exports nothing (no public surface)", async () => {
    const mod = await import("./index.js");
    expect(Object.keys(mod)).toEqual([]);
  });
});

describe("adapters domain — Hito 7.1 public surface preservation (ADR-006 §3, §4)", () => {
  it("engine public barrel does not re-export the adapters domain", () => {
    const engineIndexPath = path.resolve(__dirname, "..", "index.ts");
    const source = fs.readFileSync(engineIndexPath, "utf-8");
    // The public barrel must not import from `./adapters/` under any form.
    expect(source).not.toMatch(/from\s+["']\.\/adapters["']/);
    expect(source).not.toMatch(/from\s+["']\.\/adapters\//);
  });
});
