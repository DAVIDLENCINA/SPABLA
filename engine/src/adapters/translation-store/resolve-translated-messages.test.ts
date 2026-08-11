/**
 * SPABLA Engine — resolveTranslatedMessages behaviour tests.
 *
 * These tests use in-memory fakes for `PersistencePort` and
 * `TranslationStore` plus a counting provider callback. They cover the
 * D2 acceptance criteria:
 *
 *   - passthrough for same-language pairs (zero provider calls);
 *   - miss → translate → persist → return;
 *   - subsequent GETs read from the store (zero provider calls);
 *   - two audiences with different target languages yield distinct rows;
 *   - concurrent identical GETs coalesce to one provider call
 *     (single-flight);
 *   - a provider failure leaves the message intact.
 *
 * This is the load-bearing regression suite for the coste
 * requirement (`provider_calls_after_cache_fill = 0`).
 */

import { describe, expect, test } from "vitest";

import { resolveTranslatedMessages, type TranslationProvider } from "./resolve-translated-messages";
import { createSingleFlight } from "./single-flight";
import type {
  ConversationRecord,
  ConversationId,
  MessagePage,
  MessagePageRequest,
  MessageRecord,
  PersistencePort,
  TenantContext,
  UsageEntry,
} from "../persistence/port";
import { buildTenantContext } from "../persistence/tenant-context";
import { buildVerifiedIdentityFromTrustedBoundary } from "../persistence/identity";
import type {
  TranslationInsert,
  TranslationRecord,
  TranslationStore,
} from "./port";
import { asISOTimestamp, asUUID } from "../../types/ids";
import type { LangCode } from "../../types/language";

const TENANT = asUUID("00000000-0000-0000-0000-00000000000a");
const OTHER_TENANT = asUUID("00000000-0000-0000-0000-00000000000b");
const ACTOR_A = asUUID("00000000-0000-0000-0000-000000000001");
const ACTOR_B = asUUID("00000000-0000-0000-0000-000000000002");
const CONV = asUUID("00000000-0000-0000-0000-000000000010");
const VERSION = "v1";

function ctxOf(actorId: string, tenantId: string): TenantContext {
  return buildTenantContext(
    buildVerifiedIdentityFromTrustedBoundary(
      asUUID(actorId),
      asISOTimestamp("2026-08-12T00:00:00.000Z"),
      "test_fixture",
    ),
    asUUID(tenantId) as MessageRecord["tenantId"],
  );
}

function makeMessage(id: string, sender: string, text: string, lang: LangCode, at: string): MessageRecord {
  return {
    tenantId: TENANT,
    conversationId: CONV,
    messageId: asUUID(id),
    senderId: asUUID(sender),
    text,
    language: lang,
    createdAt: asISOTimestamp(at),
  };
}

class FakePersistence implements PersistencePort {
  constructor(private readonly rows: ReadonlyArray<MessageRecord>) {}
  async saveConversation(_ctx: TenantContext, _r: ConversationRecord): Promise<void> {
    return;
  }
  async loadConversation(_ctx: TenantContext, _id: ConversationId): Promise<ConversationRecord | null> {
    return null;
  }
  async saveMessage(_ctx: TenantContext, _r: MessageRecord): Promise<void> {
    return;
  }
  async listMessages(_ctx: TenantContext, _r: MessagePageRequest): Promise<MessagePage> {
    return { items: this.rows, nextCursor: null };
  }
  async appendUsage(_ctx: TenantContext, _e: UsageEntry): Promise<void> {
    return;
  }
}

class FakeStore implements TranslationStore {
  readonly rows: Map<string, TranslationRecord> = new Map();
  private readonly saveEvents: Array<TranslationInsert> = [];
  private readonly loadEvents: Array<string> = [];
  static key(t: string, m: string, l: string, v: string): string {
    return `${t}|${m}|${l}|${v}`;
  }
  async load(
    ctx: TenantContext,
    messageId: MessageRecord["messageId"],
    targetLanguage: LangCode,
    translationVersion: string,
  ): Promise<TranslationRecord | null> {
    const k = FakeStore.key(ctx.tenantId, messageId, targetLanguage, translationVersion);
    this.loadEvents.push(k);
    return this.rows.get(k) ?? null;
  }
  async saveServerSide(ctx: TenantContext, insert: TranslationInsert): Promise<TranslationRecord> {
    if (insert.tenantId !== ctx.tenantId) {
      throw new Error("tenant_context_invalid");
    }
    this.saveEvents.push(insert);
    const k = FakeStore.key(ctx.tenantId, insert.messageId, insert.targetLanguage, insert.translationVersion);
    const existing = this.rows.get(k);
    if (existing !== undefined) return existing;
    const record: TranslationRecord = {
      tenantId: insert.tenantId,
      messageId: insert.messageId,
      targetLanguage: insert.targetLanguage,
      translationVersion: insert.translationVersion,
      translatedText: insert.translatedText,
      provider: insert.provider,
      model: insert.model,
      providerRef: insert.providerRef,
      createdAt: asISOTimestamp("2026-08-12T00:00:00.000Z"),
    };
    this.rows.set(k, record);
    return record;
  }
  countSaves(): number { return this.saveEvents.length; }
  countLoads(): number { return this.loadEvents.length; }
}

function countingProvider(
  translations: Record<string, string>,
  behaviour: "ok" | "fail" = "ok",
): { fn: TranslationProvider; calls: () => number } {
  let calls = 0;
  const fn: TranslationProvider = async ({ text, to }) => {
    calls += 1;
    if (behaviour === "fail") {
      return { ok: false as const, reason: "provider_error" };
    }
    const forced = translations[`${text}|${to}`];
    return {
      ok: true as const,
      translatedText: forced ?? `[${to}] ${text}`,
      provider: "test-provider",
      model: null,
      providerRef: `ref-${calls}`,
    };
  };
  return { fn, calls: () => calls };
}

describe("resolveTranslatedMessages", () => {
  test("passthrough for same-language pairs — zero provider calls, zero store IO", async () => {
    const persistence = new FakePersistence([
      makeMessage("00000000-0000-0000-0000-000000000101", ACTOR_A, "Hola", "es", "2026-08-12T00:00:00.000Z"),
    ]);
    const store = new FakeStore();
    const provider = countingProvider({});
    const result = await resolveTranslatedMessages({
      persistence,
      translationStore: store,
      translate: provider.fn,
      tenantContext: ctxOf(ACTOR_A, TENANT),
      conversationId: CONV,
      targetLanguage: "es",
      translationVersion: VERSION,
      pageLimit: 50,
      singleFlight: createSingleFlight(),
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.translation).toBe("Hola");
    expect(result.items[0]?.translationPassthrough).toBe(true);
    expect(provider.calls()).toBe(0);
    expect(store.countLoads()).toBe(0);
    expect(store.countSaves()).toBe(0);
  });

  test("miss → translate once → persist → serve", async () => {
    const persistence = new FakePersistence([
      makeMessage("00000000-0000-0000-0000-000000000201", ACTOR_A, "Hola", "es", "2026-08-12T00:00:00.000Z"),
    ]);
    const store = new FakeStore();
    const provider = countingProvider({});
    const first = await resolveTranslatedMessages({
      persistence,
      translationStore: store,
      translate: provider.fn,
      tenantContext: ctxOf(ACTOR_B, TENANT),
      conversationId: CONV,
      targetLanguage: "en",
      translationVersion: VERSION,
      pageLimit: 50,
      singleFlight: createSingleFlight(),
    });
    expect(first.items[0]?.translation).toBe("[en] Hola");
    expect(first.items[0]?.translationCached).toBe(false);
    expect(provider.calls()).toBe(1);
    expect(store.countSaves()).toBe(1);
    // Row present in the store.
    expect(store.rows.size).toBe(1);
  });

  test("polling — second and further GETs make zero provider calls once the row exists", async () => {
    const persistence = new FakePersistence([
      makeMessage("00000000-0000-0000-0000-000000000301", ACTOR_A, "Hola", "es", "2026-08-12T00:00:00.000Z"),
    ]);
    const store = new FakeStore();
    const provider = countingProvider({});
    const sf = createSingleFlight();
    const args = {
      persistence,
      translationStore: store,
      translate: provider.fn,
      tenantContext: ctxOf(ACTOR_B, TENANT),
      conversationId: CONV,
      targetLanguage: "en" as LangCode,
      translationVersion: VERSION,
      pageLimit: 50,
      singleFlight: sf,
    };
    await resolveTranslatedMessages(args); // miss
    const providerCallsAfterFill = provider.calls();
    for (let i = 0; i < 20; i += 1) {
      const r = await resolveTranslatedMessages(args);
      expect(r.items[0]?.translation).toBe("[en] Hola");
      expect(r.items[0]?.translationCached).toBe(true);
    }
    // Load-bearing invariant: `provider_calls_after_cache_fill = 0`.
    expect(provider.calls() - providerCallsAfterFill).toBe(0);
    expect(store.countSaves()).toBe(1);
  });

  test("two audiences with different target languages yield distinct rows", async () => {
    const persistence = new FakePersistence([
      makeMessage("00000000-0000-0000-0000-000000000401", ACTOR_A, "Hola", "es", "2026-08-12T00:00:00.000Z"),
    ]);
    const store = new FakeStore();
    const provider = countingProvider({});
    const sf = createSingleFlight();
    await resolveTranslatedMessages({
      persistence,
      translationStore: store,
      translate: provider.fn,
      tenantContext: ctxOf(ACTOR_B, TENANT),
      conversationId: CONV,
      targetLanguage: "en",
      translationVersion: VERSION,
      pageLimit: 50,
      singleFlight: sf,
    });
    await resolveTranslatedMessages({
      persistence,
      translationStore: store,
      translate: provider.fn,
      tenantContext: ctxOf(ACTOR_A, TENANT),
      conversationId: CONV,
      targetLanguage: "fr",
      translationVersion: VERSION,
      pageLimit: 50,
      singleFlight: sf,
    });
    expect(store.rows.size).toBe(2);
    expect(provider.calls()).toBe(2);
  });

  test("single-flight coalesces concurrent identical GETs into one provider call", async () => {
    const persistence = new FakePersistence([
      makeMessage("00000000-0000-0000-0000-000000000501", ACTOR_A, "Hola", "es", "2026-08-12T00:00:00.000Z"),
    ]);
    const store = new FakeStore();
    let provCalls = 0;
    const provider: TranslationProvider = async ({ text, to }) => {
      provCalls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return {
        ok: true as const,
        translatedText: `[${to}] ${text}`,
        provider: "test-provider",
        model: null,
        providerRef: null,
      };
    };
    const sf = createSingleFlight();
    const args = {
      persistence,
      translationStore: store,
      translate: provider,
      tenantContext: ctxOf(ACTOR_B, TENANT),
      conversationId: CONV,
      targetLanguage: "en" as LangCode,
      translationVersion: VERSION,
      pageLimit: 50,
      singleFlight: sf,
    };
    const results = await Promise.all(Array.from({ length: 6 }, () => resolveTranslatedMessages(args)));
    expect(results).toHaveLength(6);
    for (const r of results) {
      expect(r.items[0]?.translation).toBe("[en] Hola");
    }
    // All six concurrent calls shared the ONE in-flight provider invocation.
    expect(provCalls).toBe(1);
    // Only one row was persisted.
    expect(store.rows.size).toBe(1);
  });

  test("provider failure leaves the original message intact — translation=null, error set", async () => {
    const persistence = new FakePersistence([
      makeMessage("00000000-0000-0000-0000-000000000601", ACTOR_A, "Hola", "es", "2026-08-12T00:00:00.000Z"),
    ]);
    const store = new FakeStore();
    const provider = countingProvider({}, "fail");
    const result = await resolveTranslatedMessages({
      persistence,
      translationStore: store,
      translate: provider.fn,
      tenantContext: ctxOf(ACTOR_B, TENANT),
      conversationId: CONV,
      targetLanguage: "en",
      translationVersion: VERSION,
      pageLimit: 50,
      singleFlight: createSingleFlight(),
    });
    expect(result.items[0]?.translation).toBeNull();
    expect(result.items[0]?.translationError).toBe("provider_error");
    expect(result.items[0]?.originalText).toBe("Hola");
    // Nothing persisted, no data loss.
    expect(store.rows.size).toBe(0);
  });

  test("distinct translationVersion produces distinct keys", async () => {
    const persistence = new FakePersistence([
      makeMessage("00000000-0000-0000-0000-000000000701", ACTOR_A, "Hola", "es", "2026-08-12T00:00:00.000Z"),
    ]);
    const store = new FakeStore();
    const provider = countingProvider({});
    const sf = createSingleFlight();
    await resolveTranslatedMessages({
      persistence,
      translationStore: store,
      translate: provider.fn,
      tenantContext: ctxOf(ACTOR_B, TENANT),
      conversationId: CONV,
      targetLanguage: "en",
      translationVersion: "v1",
      pageLimit: 50,
      singleFlight: sf,
    });
    await resolveTranslatedMessages({
      persistence,
      translationStore: store,
      translate: provider.fn,
      tenantContext: ctxOf(ACTOR_B, TENANT),
      conversationId: CONV,
      targetLanguage: "en",
      translationVersion: "v2",
      pageLimit: 50,
      singleFlight: sf,
    });
    expect(store.rows.size).toBe(2);
    expect(provider.calls()).toBe(2);
  });

  test("cross-tenant isolation preserved — ctx.tenantId flows to the store key", async () => {
    const persistence = new FakePersistence([
      makeMessage("00000000-0000-0000-0000-000000000801", ACTOR_A, "Hola", "es", "2026-08-12T00:00:00.000Z"),
    ]);
    const store = new FakeStore();
    const provider = countingProvider({});
    const sf = createSingleFlight();
    // Cannot call with a different-tenant context because the fake persistence
    // returns rows tagged for TENANT, and the store's saveServerSide asserts
    // record.tenantId === ctx.tenantId (mirrors the productive adapter). This
    // test asserts that path defensively.
    const foreignCtx = ctxOf(ACTOR_B, OTHER_TENANT);
    const result = await resolveTranslatedMessages({
      persistence,
      translationStore: store,
      translate: provider.fn,
      tenantContext: foreignCtx,
      conversationId: CONV,
      targetLanguage: "en",
      translationVersion: VERSION,
      pageLimit: 50,
      singleFlight: sf,
    });
    // The provider was invoked and the store rejected the save (tenant
    // mismatch). The item is served as a provider_error to the caller
    // rather than as a successful translation with leaked cross-tenant data.
    expect(result.items[0]?.translation).toBeNull();
    expect(result.items[0]?.translationError).toBe("provider_error");
    expect(store.rows.size).toBe(0);
  });
});
