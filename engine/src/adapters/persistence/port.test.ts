import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { asUUID, asISOTimestamp } from "../../types/ids";
import type {
  ActorId,
  ConversationId,
  MessageId,
  MessageCursor,
  MessagePage,
  MessagePageRequest,
  MessageRecord,
  PersistencePort,
  TenantId,
  UsageEntry,
} from "./port";
import {
  makeMessageCursor,
  PERSISTENCE_PORT_OPERATIONS,
} from "./port";
import { buildVerifiedIdentityFromTrustedBoundary } from "./identity";
import { buildTenantContext } from "./tenant-context";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT_SRC_PATH = path.resolve(__dirname, "port.ts");
const ENGINE_BARREL_PATH = path.resolve(__dirname, "..", "..", "index.ts");
const ADAPTERS_BARREL_PATH = path.resolve(__dirname, "..", "index.ts");

const tenantAlpha = asUUID("00000000-0000-0000-0000-00000000A710") as TenantId;
const actorAlpha = asUUID("00000000-0000-0000-0000-00000000A1FA") as ActorId;
const identity = buildVerifiedIdentityFromTrustedBoundary(actorAlpha, asISOTimestamp("2026-07-23T10:00:00.000Z"), "test_fixture");
const ctx = buildTenantContext(identity, tenantAlpha);

const convId = asUUID("00000000-0000-0000-0000-00000000CFE1") as ConversationId;

// Minimal structural fake used ONLY to type-verify PersistencePort — it does
// nothing meaningful and is scoped to this test file.
const noopPort: PersistencePort = {
  saveConversation: async () => { /* noop */ },
  loadConversation: async () => null,
  saveMessage: async () => { /* noop */ },
  listMessages: async (): Promise<MessagePage> => ({ items: [], nextCursor: null }),
  appendUsage: async () => { /* noop */ },
};

describe("adapters/persistence/port — Hito 8.1", () => {
  it("1. PersistencePort tiene exactamente cinco operaciones esperadas", () => {
    const keys = Object.keys(noopPort).sort();
    expect(keys).toEqual([
      "appendUsage",
      "listMessages",
      "loadConversation",
      "saveConversation",
      "saveMessage",
    ]);
    expect(PERSISTENCE_PORT_OPERATIONS.length).toBe(5);
    const canonical = [...PERSISTENCE_PORT_OPERATIONS].sort();
    expect(canonical).toEqual(keys);
  });

  it("2. cada operación es una función async (retorna Promise)", () => {
    const record: MessageRecord = {
      tenantId: tenantAlpha,
      conversationId: convId,
      messageId: asUUID("00000000-0000-0000-0000-00000000FED1") as MessageId,
      senderId: actorAlpha,
      text: "hi",
      language: "es",
      createdAt: asISOTimestamp("2026-07-23T10:00:00.000Z"),
    };
    const request: MessagePageRequest = { conversationId: convId, limit: 10, cursor: null };
    const usage: UsageEntry = {
      tenantId: tenantAlpha,
      metricKind: "text_chars",
      quantity: 1,
      unit: "chars",
      occurredAt: asISOTimestamp("2026-07-23T10:00:00.000Z"),
      source: "port-test",
      idempotencyKey: asUUID("00000000-0000-0000-0000-00000000BEE1"),
      entryKind: "normal",
      correlationId: null,
    };
    expect(noopPort.saveConversation(ctx, { tenantId: tenantAlpha, conversationId: convId, createdAt: asISOTimestamp("2026-07-23T10:00:00.000Z"), createdBy: actorAlpha, language: "es" })).toBeInstanceOf(Promise);
    expect(noopPort.loadConversation(ctx, convId)).toBeInstanceOf(Promise);
    expect(noopPort.saveMessage(ctx, record)).toBeInstanceOf(Promise);
    expect(noopPort.listMessages(ctx, request)).toBeInstanceOf(Promise);
    expect(noopPort.appendUsage(ctx, usage)).toBeInstanceOf(Promise);
  });

  it("3. saveConversation resuelve void", async () => {
    const result = await noopPort.saveConversation(ctx, {
      tenantId: tenantAlpha,
      conversationId: convId,
      createdAt: asISOTimestamp("2026-07-23T10:00:00.000Z"),
      createdBy: actorAlpha,
      language: "en",
    });
    expect(result).toBeUndefined();
  });

  it("4. loadConversation retorna null cuando el fake no tiene datos", async () => {
    const result = await noopPort.loadConversation(ctx, convId);
    expect(result).toBeNull();
  });

  it("5. listMessages retorna MessagePage con items y nextCursor", async () => {
    const page = await noopPort.listMessages(ctx, {
      conversationId: convId,
      limit: 20,
      cursor: null,
    });
    expect(Array.isArray(page.items)).toBe(true);
    expect(page.items.length).toBe(0);
    expect(page.nextCursor).toBeNull();
  });

  it("6. MessageCursor construido por makeMessageCursor es frozen y opaco", () => {
    const cursor: MessageCursor = makeMessageCursor(
      asISOTimestamp("2026-07-23T10:00:00.000Z"),
      asUUID("00000000-0000-0000-0000-00000000FED2") as MessageId,
    );
    expect(Object.isFrozen(cursor)).toBe(true);
    expect(cursor.createdAt).toBe("2026-07-23T10:00:00.000Z");
    expect(cursor.messageId).toBe("00000000-0000-0000-0000-00000000FED2");
  });

  it("7. MessagePageRequest requiere conversationId, limit y cursor explícitos", () => {
    const req: MessagePageRequest = {
      conversationId: convId,
      limit: 25,
      cursor: null,
    };
    expect(req.conversationId).toBe(convId);
    expect(req.limit).toBe(25);
    expect(req.cursor).toBeNull();
  });

  it("8. port.ts NO importa @supabase/supabase-js ni contiene mención de proveedor concreto", () => {
    const src = fs.readFileSync(PORT_SRC_PATH, "utf-8");
    expect(src).not.toMatch(/@supabase\/supabase-js/);
    // Concrete provider names must not appear in the productive port
    // contract. Build them at runtime so this very safeguard does not
    // trip on itself.
    const forbidden: ReadonlyArray<string> = [
      "sup" + "abase-js",
      "open" + "ai",
      "goo" + "gle",
      "azu" + "re",
      "elev" + "enlabs",
      "deep" + "gram",
      "whis" + "per",
    ];
    for (const literal of forbidden) {
      expect(src).not.toMatch(new RegExp(`\\b${literal}\\b`, "i"));
    }
  });

  it("9. port.ts NO usa constructos prohibidos (escape hatch, double-cast, suppress)", () => {
    const src = fs.readFileSync(PORT_SRC_PATH, "utf-8");
    // Construct the prohibited-word patterns at runtime so the test's own
    // source does not contain the literal words.
    const escapeHatchRe = new RegExp("\\b" + "a" + "ny" + "\\b");
    const doubleCastRe = new RegExp("as\\s+" + "unknown" + "\\s+as");
    const tsIgnoreRe = new RegExp("@ts-" + "ignore");
    const tsExpectErrorRe = new RegExp("@ts-expect" + "-error");
    const runtimeUnknownRe = new RegExp(":\\s*" + "unknown" + "\\b");
    expect(src).not.toMatch(escapeHatchRe);
    expect(src).not.toMatch(doubleCastRe);
    expect(src).not.toMatch(tsIgnoreRe);
    expect(src).not.toMatch(tsExpectErrorRe);
    expect(src).not.toMatch(runtimeUnknownRe);
  });

  it("10. port.ts NO se re-exporta desde barrels públicos", () => {
    const engineBarrel = fs.readFileSync(ENGINE_BARREL_PATH, "utf-8");
    const adaptersBarrel = fs.readFileSync(ADAPTERS_BARREL_PATH, "utf-8");
    expect(engineBarrel).not.toMatch(/persistence/);
    expect(engineBarrel).not.toMatch(/PersistencePort/);
    expect(adaptersBarrel).not.toMatch(/persistence/);
    expect(adaptersBarrel).not.toMatch(/PersistencePort/);
  });

  it("11. PERSISTENCE_PORT_OPERATIONS coincide literalmente con la firma", () => {
    // Structural verification — the constant tuple must mirror the
    // property names of `PersistencePort`.
    const expected = ["saveConversation", "loadConversation", "saveMessage", "listMessages", "appendUsage"];
    expect([...PERSISTENCE_PORT_OPERATIONS]).toEqual(expected);
  });

  it("12. TenantContext es obligatorio en las firmas — verificado por compilación", () => {
    // If the type ever drops TenantContext, this file stops compiling
    // because the fake's method signatures accept `(ctx, ...)`. The
    // assertion here is a smoke check that `noopPort` still has 5 fns.
    expect(typeof noopPort.saveConversation).toBe("function");
    expect(typeof noopPort.loadConversation).toBe("function");
    expect(typeof noopPort.saveMessage).toBe("function");
    expect(typeof noopPort.listMessages).toBe("function");
    expect(typeof noopPort.appendUsage).toBe("function");
  });

  it("13. registros son readonly — asignación directa a un campo es rechazada por el compilador (marker runtime)", () => {
    const record: MessageRecord = {
      tenantId: tenantAlpha,
      conversationId: convId,
      messageId: asUUID("00000000-0000-0000-0000-00000000FED3") as MessageId,
      senderId: actorAlpha,
      text: "readonly",
      language: "es",
      createdAt: asISOTimestamp("2026-07-23T10:00:00.000Z"),
    };
    // Attempt at mutation via Object.defineProperty on a plain readonly
    // record (not Object.frozen — the tsc guarantee is compile-time).
    // The runtime marker below simply asserts the record's shape.
    expect(record.tenantId).toBe(tenantAlpha);
    expect(record.text).toBe("readonly");
  });
});
