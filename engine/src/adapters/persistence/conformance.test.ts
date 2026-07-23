import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type { ISOTimestamp, UUID } from "../../types/ids";
import { asUUID, asISOTimestamp } from "../../types/ids";

import type {
  ActorId,
  ConversationId,
  ConversationRecord,
  MessageCursor,
  MessageId,
  MessagePage,
  MessagePageRequest,
  MessageRecord,
  PersistencePort,
  TenantContext,
  TenantId,
  UsageEntry,
  VerifiedIdentity,
} from "./port";
import { makeMessageCursor } from "./port";

import {
  buildVerifiedIdentityFromTrustedBoundary,
} from "./identity";
import { buildTenantContext } from "./tenant-context";
import { persistenceError } from "./errors";

import {
  buildPersistenceConformanceCases,
  evaluatePersistenceConformanceCase,
  type PersistenceConformanceProfile,
} from "./conformance";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFORMANCE_SRC_PATH = path.resolve(__dirname, "conformance.ts");
const ENGINE_BARREL_PATH = path.resolve(__dirname, "..", "..", "index.ts");
const ADAPTERS_BARREL_PATH = path.resolve(__dirname, "..", "index.ts");

// ────────────────────────────────────────────────────────────────
// In-memory fake — Plan §8.3 "fake in-memory local (fixture de test)".
// Emulates tenant isolation, idempotency, ordered pagination and conflict
// semantics. NOT a productive module: exists only in this test file.
// ────────────────────────────────────────────────────────────────

type ConvKey = string;

function convKey(tenantId: TenantId, convId: ConversationId): ConvKey {
  return `${String(tenantId)}::${String(convId)}`;
}

function messagesEqual(a: MessageRecord, b: MessageRecord): boolean {
  return a.tenantId === b.tenantId
    && a.conversationId === b.conversationId
    && a.messageId === b.messageId
    && a.senderId === b.senderId
    && a.text === b.text
    && a.language === b.language
    && a.createdAt === b.createdAt;
}

function usageEqual(a: UsageEntry, b: UsageEntry): boolean {
  return a.tenantId === b.tenantId
    && a.metricKind === b.metricKind
    && a.quantity === b.quantity
    && a.unit === b.unit
    && a.occurredAt === b.occurredAt
    && a.source === b.source
    && a.idempotencyKey === b.idempotencyKey
    && a.entryKind === b.entryKind
    && a.correlationId === b.correlationId;
}

function createInMemoryPort(): PersistencePort {
  const conversations = new Map<ConvKey, ConversationRecord>();
  const messages = new Map<ConvKey, Array<MessageRecord>>();
  const usage: Array<UsageEntry> = [];

  const orderMessages = (arr: ReadonlyArray<MessageRecord>): ReadonlyArray<MessageRecord> => {
    return [...arr].sort((a, b) => {
      if (a.createdAt < b.createdAt) return -1;
      if (a.createdAt > b.createdAt) return 1;
      if (a.messageId < b.messageId) return -1;
      if (a.messageId > b.messageId) return 1;
      return 0;
    });
  };

  return {
    async saveConversation(ctx: TenantContext, record: ConversationRecord): Promise<void> {
      if (record.tenantId !== ctx.tenantId) {
        throw persistenceError("membership_denied", "record.tenantId !== ctx.tenantId");
      }
      const key = convKey(record.tenantId, record.conversationId);
      const existing = conversations.get(key);
      if (existing !== undefined) {
        const identical = existing.conversationId === record.conversationId
          && existing.tenantId === record.tenantId
          && existing.createdAt === record.createdAt
          && existing.createdBy === record.createdBy
          && existing.language === record.language;
        if (!identical) {
          throw persistenceError("conflict", "saveConversation: divergent content for same conversationId");
        }
        return;
      }
      conversations.set(key, record);
    },

    async loadConversation(ctx: TenantContext, conversationId: ConversationId): Promise<ConversationRecord | null> {
      const key = convKey(ctx.tenantId, conversationId);
      const found = conversations.get(key);
      return found ?? null;
    },

    async saveMessage(ctx: TenantContext, record: MessageRecord): Promise<void> {
      if (record.tenantId !== ctx.tenantId) {
        throw persistenceError("membership_denied", "record.tenantId !== ctx.tenantId");
      }
      const key = convKey(record.tenantId, record.conversationId);
      const bucket = messages.get(key) ?? [];
      const existing = bucket.find((m) => m.messageId === record.messageId);
      if (existing !== undefined) {
        if (messagesEqual(existing, record)) return;
        throw persistenceError("conflict", "saveMessage: divergent content for same messageId");
      }
      bucket.push(record);
      messages.set(key, bucket);
    },

    async listMessages(ctx: TenantContext, request: MessagePageRequest): Promise<MessagePage> {
      const key = convKey(ctx.tenantId, request.conversationId);
      const bucket = messages.get(key) ?? [];
      const ordered = orderMessages(bucket);
      let startIdx = 0;
      if (request.cursor !== null) {
        // Cursor semantics: return items strictly greater than the cursor
        // in `(createdAt, messageId)` order. If the cursor does not
        // correspond to a known row, we still return items greater than
        // the cursor's (createdAt, messageId) — cross-conversation cursors
        // therefore yield empty results silently (Plan §10.6 accepts
        // silent-empty when no leak is possible).
        for (let i = 0; i < ordered.length; i += 1) {
          const item = ordered[i]!;
          if (item.createdAt > request.cursor.createdAt) { startIdx = i; break; }
          if (item.createdAt === request.cursor.createdAt && item.messageId > request.cursor.messageId) {
            startIdx = i;
            break;
          }
          startIdx = i + 1;
        }
      }
      const slice = ordered.slice(startIdx, startIdx + Math.max(0, request.limit));
      const nextCursor: MessageCursor | null = startIdx + slice.length < ordered.length && slice.length > 0
        ? makeMessageCursor(slice[slice.length - 1]!.createdAt, slice[slice.length - 1]!.messageId)
        : null;
      return { items: slice, nextCursor };
    },

    async appendUsage(ctx: TenantContext, entry: UsageEntry): Promise<void> {
      if (entry.tenantId !== ctx.tenantId) {
        throw persistenceError("membership_denied", "entry.tenantId !== ctx.tenantId");
      }
      const dup = usage.find((u) => u.tenantId === entry.tenantId
        && u.source === entry.source
        && u.idempotencyKey === entry.idempotencyKey);
      if (dup !== undefined) {
        if (usageEqual(dup, entry)) return;
        throw persistenceError("conflict", "appendUsage: divergent content for same (tenant, source, key)");
      }
      usage.push(entry);
    },
  };
}

// ────────────────────────────────────────────────────────────────
// Deterministic id/timestamp generators — increment counters per test.
// ────────────────────────────────────────────────────────────────

function makeProfile(): PersistenceConformanceProfile {
  let convCounter = 0;
  let msgCounter = 0;
  let uuidCounter = 0;
  let clockMs = Date.parse("2026-07-23T10:00:00.000Z");
  const hex = (n: number, width: number): string => n.toString(16).padStart(width, "0");
  return {
    production: false,
    tenantA: asUUID("00000000-0000-0000-0000-00000000A710") as TenantId,
    tenantB: asUUID("00000000-0000-0000-0000-00000000B710") as TenantId,
    actorA: asUUID("00000000-0000-0000-0000-00000000A1FA") as ActorId,
    actorB: asUUID("00000000-0000-0000-0000-00000000B1FA") as ActorId,
    issuedAt: asISOTimestamp("2026-07-23T10:00:00.000Z"),
    nowISO: (): ISOTimestamp => {
      clockMs += 1000;
      return new Date(clockMs).toISOString() as ISOTimestamp;
    },
    newConversationId: (): ConversationId => {
      convCounter += 1;
      return asUUID(`00000000-0000-0000-0000-${hex(convCounter, 12)}`) as ConversationId;
    },
    newMessageId: (): MessageId => {
      msgCounter += 1;
      return asUUID(`00000000-0000-0000-0000-1${hex(msgCounter, 11)}`) as MessageId;
    },
    newUUID: (): UUID => {
      uuidCounter += 1;
      return asUUID(`00000000-0000-0000-0000-2${hex(uuidCounter, 11)}`);
    },
  };
}

const factories = {
  portFactory: (): PersistencePort => createInMemoryPort(),
  identityFactory: (actorId: ActorId, issuedAt: ISOTimestamp): VerifiedIdentity =>
    buildVerifiedIdentityFromTrustedBoundary(actorId, issuedAt, "test_fixture"),
  contextFactory: (identity: VerifiedIdentity, tenantId: TenantId): TenantContext =>
    buildTenantContext(identity, tenantId),
};

// ────────────────────────────────────────────────────────────────
// Tests §8.3 — 15–20 dedicated conformance tests.
// ────────────────────────────────────────────────────────────────

describe("adapters/persistence/conformance — Hito 8.1", () => {
  it("1. buildPersistenceConformanceCases produce el conjunto fijado de casos", () => {
    const cases = buildPersistenceConformanceCases(makeProfile(), factories);
    expect(cases.length).toBeGreaterThanOrEqual(12);
    const names = cases.map((c) => c.name).sort();
    expect(names).toContain("save_then_load_conversation_matches");
    expect(names).toContain("load_unknown_conversation_returns_null");
    expect(names).toContain("save_message_idempotent_on_identical_repeat");
    expect(names).toContain("save_message_conflict_on_divergent_content");
    expect(names).toContain("list_messages_stable_order_by_created_at_and_id");
    expect(names).toContain("list_messages_pagination_no_duplicates");
    expect(names).toContain("append_usage_idempotent_on_identical_repeat");
    expect(names).toContain("append_usage_conflict_on_divergent_content");
    expect(names).toContain("cross_tenant_load_yields_null_or_error");
    expect(names).toContain("cross_tenant_list_yields_empty_or_error");
    expect(names).toContain("deterministic_across_fresh_instances");
  });

  it("2. fake in-memory conforme produce ok en TODOS los casos", async () => {
    const cases = buildPersistenceConformanceCases(makeProfile(), factories);
    for (const c of cases) {
      const result = await evaluatePersistenceConformanceCase(c);
      if (!result.ok) {
        throw new Error(`case ${c.name} failed: ${result.reason} — ${result.detail}`);
      }
      expect(result.ok).toBe(true);
    }
  });

  it("3. save_then_load: fake correcto produce ok, y datos divergentes disparan save_load_divergence", async () => {
    const profile = makeProfile();
    // Broken port: swaps createdBy on load.
    const brokenPort: PersistencePort = {
      ...createInMemoryPort(),
      async loadConversation(): Promise<ConversationRecord | null> {
        return {
          tenantId: profile.tenantA,
          conversationId: profile.newConversationId(),
          createdAt: profile.nowISO(),
          createdBy: profile.actorB,
          language: "en",
        };
      },
    };
    const cases = buildPersistenceConformanceCases(profile, {
      ...factories,
      portFactory: (): PersistencePort => brokenPort,
    });
    const target = cases.find((c) => c.name === "save_then_load_conversation_matches");
    expect(target).toBeDefined();
    if (target === undefined) return;
    const result = await evaluatePersistenceConformanceCase(target);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("save_load_divergence");
    }
  });

  it("4. save_message_idempotent: fake que rechaza el repeat idéntico dispara idempotent_save_rejected", async () => {
    const profile = makeProfile();
    const brokenPort: PersistencePort = createInMemoryPort();
    let saveCalls = 0;
    const originalSave = brokenPort.saveMessage.bind(brokenPort);
    brokenPort.saveMessage = async (ctx: TenantContext, record: MessageRecord): Promise<void> => {
      saveCalls += 1;
      if (saveCalls === 1) {
        await originalSave(ctx, record);
        return;
      }
      // The second (identical) call must be an idempotent silent success;
      // this broken port raises conflict instead.
      throw persistenceError("conflict", "broken: rejects idempotent repeat");
    };
    const cases = buildPersistenceConformanceCases(profile, {
      ...factories,
      portFactory: (): PersistencePort => brokenPort,
    });
    const target = cases.find((c) => c.name === "save_message_idempotent_on_identical_repeat");
    expect(target).toBeDefined();
    if (target === undefined) return;
    const result = await evaluatePersistenceConformanceCase(target);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("idempotent_save_rejected");
    }
  });

  it("5. save_message_conflict: fake que NO lanza dispara conflict_expected_not_raised", async () => {
    const profile = makeProfile();
    const permissivePort: PersistencePort = createInMemoryPort();
    permissivePort.saveMessage = async (): Promise<void> => { /* silently accept everything */ };
    const cases = buildPersistenceConformanceCases(profile, {
      ...factories,
      portFactory: (): PersistencePort => permissivePort,
    });
    const target = cases.find((c) => c.name === "save_message_conflict_on_divergent_content");
    expect(target).toBeDefined();
    if (target === undefined) return;
    const result = await evaluatePersistenceConformanceCase(target);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("conflict_expected_not_raised");
    }
  });

  it("6. save_message_conflict: fake que lanza código erróneo dispara conflict_wrong_code", async () => {
    const profile = makeProfile();
    const wrongCodePort: PersistencePort = createInMemoryPort();
    let calls = 0;
    wrongCodePort.saveMessage = async (): Promise<void> => {
      calls += 1;
      if (calls > 1) throw persistenceError("unavailable", "wrong code");
    };
    const cases = buildPersistenceConformanceCases(profile, {
      ...factories,
      portFactory: (): PersistencePort => wrongCodePort,
    });
    const target = cases.find((c) => c.name === "save_message_conflict_on_divergent_content");
    expect(target).toBeDefined();
    if (target === undefined) return;
    const result = await evaluatePersistenceConformanceCase(target);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("conflict_wrong_code");
    }
  });

  it("7. list_messages_stable_order: fake que devuelve orden inverso dispara pagination_order_broken", async () => {
    const profile = makeProfile();
    const badOrderPort: PersistencePort = createInMemoryPort();
    const originalList = badOrderPort.listMessages.bind(badOrderPort);
    badOrderPort.listMessages = async (ctx: TenantContext, req: MessagePageRequest): Promise<MessagePage> => {
      const page = await originalList(ctx, req);
      return { items: [...page.items].reverse(), nextCursor: page.nextCursor };
    };
    const cases = buildPersistenceConformanceCases(profile, {
      ...factories,
      portFactory: (): PersistencePort => badOrderPort,
    });
    const target = cases.find((c) => c.name === "list_messages_stable_order_by_created_at_and_id");
    expect(target).toBeDefined();
    if (target === undefined) return;
    const result = await evaluatePersistenceConformanceCase(target);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("pagination_order_broken");
    }
  });

  it("8. append_usage_idempotent: fake que rechaza el repeat idéntico dispara usage_idempotency_broken", async () => {
    const profile = makeProfile();
    const brokenPort: PersistencePort = createInMemoryPort();
    let usageCalls = 0;
    const originalAppend = brokenPort.appendUsage.bind(brokenPort);
    brokenPort.appendUsage = async (ctx: TenantContext, entry: UsageEntry): Promise<void> => {
      usageCalls += 1;
      if (usageCalls === 1) {
        await originalAppend(ctx, entry);
        return;
      }
      throw persistenceError("conflict", "broken: rejects idempotent repeat");
    };
    const cases = buildPersistenceConformanceCases(profile, {
      ...factories,
      portFactory: (): PersistencePort => brokenPort,
    });
    const target = cases.find((c) => c.name === "append_usage_idempotent_on_identical_repeat");
    expect(target).toBeDefined();
    if (target === undefined) return;
    const result = await evaluatePersistenceConformanceCase(target);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("usage_idempotency_broken");
    }
  });

  it("9. append_usage_conflict: fake que acepta silenciosamente dispara usage_conflict_expected_not_raised", async () => {
    const profile = makeProfile();
    const permissivePort: PersistencePort = createInMemoryPort();
    permissivePort.appendUsage = async (): Promise<void> => { /* silently accept */ };
    const cases = buildPersistenceConformanceCases(profile, {
      ...factories,
      portFactory: (): PersistencePort => permissivePort,
    });
    const target = cases.find((c) => c.name === "append_usage_conflict_on_divergent_content");
    expect(target).toBeDefined();
    if (target === undefined) return;
    const result = await evaluatePersistenceConformanceCase(target);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("usage_conflict_expected_not_raised");
    }
  });

  it("10. cross_tenant_load: fake que filtra tenant ajeno dispara cross_tenant_read_leak", async () => {
    const profile = makeProfile();
    const leakyPort: PersistencePort = createInMemoryPort();
    leakyPort.loadConversation = async (_ctx: TenantContext, conversationId: ConversationId): Promise<ConversationRecord | null> => {
      return {
        tenantId: profile.tenantA,
        conversationId,
        createdAt: profile.nowISO(),
        createdBy: profile.actorA,
        language: "es",
      };
    };
    const cases = buildPersistenceConformanceCases(profile, {
      ...factories,
      portFactory: (): PersistencePort => leakyPort,
    });
    const target = cases.find((c) => c.name === "cross_tenant_load_yields_null_or_error");
    expect(target).toBeDefined();
    if (target === undefined) return;
    const result = await evaluatePersistenceConformanceCase(target);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("cross_tenant_read_leak");
    }
  });

  it("11. factory produce port fresco por caso (portFactory llamado múltiples veces)", async () => {
    const profile = makeProfile();
    let creations = 0;
    const trackedFactories = {
      ...factories,
      portFactory: (): PersistencePort => {
        creations += 1;
        return createInMemoryPort();
      },
    };
    const cases = buildPersistenceConformanceCases(profile, trackedFactories);
    for (const c of cases) {
      const result = await evaluatePersistenceConformanceCase(c);
      expect(result.ok).toBe(true);
    }
    // At least one port per case — the deterministic case constructs two.
    expect(creations).toBeGreaterThanOrEqual(cases.length);
  });

  it("12. evaluator captura throws inesperados en unexpected_throw", async () => {
    const profile = makeProfile();
    const throwingCase = {
      name: "boom",
      execute: async (): Promise<never> => {
        throw new Error("boom detail");
      },
    };
    const result = await evaluatePersistenceConformanceCase(throwingCase);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unexpected_throw");
      expect(result.detail).toContain("boom detail");
    }
    // profile is unused in this case; consume it to keep the reference.
    expect(profile.tenantA).toBeDefined();
  });

  it("13. cero re-export desde barrels públicos y cero import de proveedor concreto", () => {
    const src = fs.readFileSync(CONFORMANCE_SRC_PATH, "utf-8");
    expect(src).not.toMatch(/@supabase\/supabase-js/);
    expect(src).not.toMatch(/createClient/);
    const engineBarrel = fs.readFileSync(ENGINE_BARREL_PATH, "utf-8");
    const adaptersBarrel = fs.readFileSync(ADAPTERS_BARREL_PATH, "utf-8");
    expect(engineBarrel).not.toMatch(/persistence\/conformance/);
    expect(adaptersBarrel).not.toMatch(/persistence\/conformance/);
  });

  it("14. conformance.ts NO usa constructos prohibidos", () => {
    const src = fs.readFileSync(CONFORMANCE_SRC_PATH, "utf-8");
    const escapeHatchRe = new RegExp("\\b" + "a" + "ny" + "\\b");
    const doubleCastRe = new RegExp("as\\s+" + "unknown" + "\\s+as");
    const tsIgnoreRe = new RegExp("@ts-" + "ignore");
    const tsExpectErrorRe = new RegExp("@ts-expect" + "-error");
    expect(src).not.toMatch(escapeHatchRe);
    expect(src).not.toMatch(doubleCastRe);
    expect(src).not.toMatch(tsIgnoreRe);
    expect(src).not.toMatch(tsExpectErrorRe);
  });

  it("15. diagnósticos son deterministas — misma entrada, mismo veredicto", async () => {
    const profile = makeProfile();
    const cases = buildPersistenceConformanceCases(profile, factories);
    const first: Array<string> = [];
    const second: Array<string> = [];
    for (const c of cases) {
      const r1 = await evaluatePersistenceConformanceCase(c);
      const r2 = await evaluatePersistenceConformanceCase(c);
      first.push(r1.ok ? `OK:${r1.name}` : `FAIL:${r1.name}:${r1.reason}`);
      second.push(r2.ok ? `OK:${r2.name}` : `FAIL:${r2.name}:${r2.reason}`);
    }
    expect(first).toEqual(second);
  });

  it("16. reasons se restringen al closed union documentado", async () => {
    const validReasons: ReadonlySet<string> = new Set<string>([
      "save_load_divergence",
      "load_missing_not_null",
      "idempotent_save_rejected",
      "conflict_expected_not_raised",
      "conflict_wrong_code",
      "pagination_order_broken",
      "pagination_duplicate",
      "pagination_missing_items",
      "list_returned_wrong_conversation",
      "list_returned_wrong_tenant",
      "cursor_from_other_conversation_accepted",
      "cross_tenant_read_leak",
      "usage_idempotency_broken",
      "usage_conflict_expected_not_raised",
      "usage_conflict_wrong_code",
      "usage_cross_tenant_leak",
      "nondeterministic",
      "unexpected_throw",
      "unexpected_shape",
    ]);
    const profile = makeProfile();
    const brokenPort: PersistencePort = createInMemoryPort();
    brokenPort.saveMessage = async (): Promise<void> => { /* accept anything */ };
    const cases = buildPersistenceConformanceCases(profile, {
      ...factories,
      portFactory: (): PersistencePort => brokenPort,
    });
    const target = cases.find((c) => c.name === "save_message_conflict_on_divergent_content");
    if (target === undefined) throw new Error("case missing");
    const result = await evaluatePersistenceConformanceCase(target);
    if (result.ok) throw new Error("expected failure");
    expect(validReasons.has(result.reason)).toBe(true);
  });
});
