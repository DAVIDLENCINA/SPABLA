/**
 * SPABLA Engine — persistence conformance evaluator (Fase 8 · Hito 8.1).
 *
 * Reusable, provider-agnostic infrastructure for verifying that every
 * `PersistencePort` implementation upholds the contract. Same architectural
 * pattern as Hito 7.4 (`../conformance.ts`):
 *  - declarative profile,
 *  - lightweight factory (fresh port per case),
 *  - pure evaluator,
 *  - deterministic cases,
 *  - typed diagnostics,
 *  - zero global state,
 *  - zero dependency on Vitest,
 *  - zero concrete provider implementation,
 *  - zero productive fake.
 *
 * The concrete Supabase adapter (Hito 8.3) and the in-memory test fixture
 * (present ONLY in `*.test.ts`) can both be evaluated by these cases.
 *
 * @internal Not part of the public engine surface. MUST NOT be re-exported
 * from `engine/src/index.ts` nor from `engine/src/adapters/index.ts`.
 */

import type { ISOTimestamp, UUID } from "../../types/ids";
import {
  type TenantId,
  type ActorId,
  type ConversationId,
  type MessageId,
  type PersistencePort,
  type ConversationRecord,
  type MessageRecord,
  type UsageEntry,
  type MessagePage,
  makeMessageCursor,
} from "./port";
import type { VerifiedIdentity } from "./identity";
import type { TenantContext } from "./tenant-context";
import { isPersistenceError, type PersistenceErrorCode } from "./errors";

// ────────────────────────────────────────────────────────────────
// Diagnostic vocabulary — closed union of reasons.
// ────────────────────────────────────────────────────────────────

export type PersistenceConformanceReason =
  | "save_load_divergence"
  | "load_missing_not_null"
  | "idempotent_save_rejected"
  | "conflict_expected_not_raised"
  | "conflict_wrong_code"
  | "pagination_order_broken"
  | "pagination_duplicate"
  | "pagination_missing_items"
  | "list_returned_wrong_conversation"
  | "list_returned_wrong_tenant"
  | "cursor_from_other_conversation_accepted"
  | "cross_tenant_read_leak"
  | "usage_idempotency_broken"
  | "usage_conflict_expected_not_raised"
  | "usage_conflict_wrong_code"
  | "usage_cross_tenant_leak"
  | "nondeterministic"
  | "unexpected_throw"
  | "unexpected_shape";

export type PersistenceConformanceSuccess = {
  readonly ok: true;
  readonly name: string;
};

export type PersistenceConformanceFailure = {
  readonly ok: false;
  readonly name: string;
  readonly reason: PersistenceConformanceReason;
  readonly detail: string;
};

export type PersistenceConformanceDiagnostic =
  | PersistenceConformanceSuccess
  | PersistenceConformanceFailure;

// ────────────────────────────────────────────────────────────────
// Profile — everything the case builder needs to synthesise records
// without depending on a specific generator implementation detail.
// ────────────────────────────────────────────────────────────────

export type PersistenceConformanceProfile = {
  readonly production: boolean;
  readonly tenantA: TenantId;
  readonly tenantB: TenantId;
  readonly actorA: ActorId;
  readonly actorB: ActorId;
  readonly issuedAt: ISOTimestamp;
  readonly nowISO: () => ISOTimestamp;
  readonly newConversationId: () => ConversationId;
  readonly newMessageId: () => MessageId;
  readonly newUUID: () => UUID;
};

// Factory tuple accepted by the case builder — all factories are pure and
// receive the raw actor/tenant ids from the profile.
export type PersistenceConformanceFactories = {
  readonly portFactory: () => PersistencePort;
  readonly identityFactory: (actorId: ActorId, issuedAt: ISOTimestamp) => VerifiedIdentity;
  readonly contextFactory: (identity: VerifiedIdentity, tenantId: TenantId) => TenantContext;
};

export type PersistenceConformanceCase = {
  readonly name: string;
  readonly execute: () => Promise<PersistenceConformanceDiagnostic>;
};

// ────────────────────────────────────────────────────────────────
// Small local helpers — pure, module-private.
// ────────────────────────────────────────────────────────────────

function ok(name: string): PersistenceConformanceSuccess {
  return { ok: true, name };
}

function fail(
  name: string,
  reason: PersistenceConformanceReason,
  detail: string,
): PersistenceConformanceFailure {
  return { ok: false, name, reason, detail };
}

function expectPersistenceCode(
  name: string,
  reasonMismatch: PersistenceConformanceReason,
  reasonMissing: PersistenceConformanceReason,
  expectedCode: PersistenceErrorCode,
  thrown: unknown,
): PersistenceConformanceFailure | null {
  if (!isPersistenceError(thrown)) {
    return fail(
      name,
      reasonMissing,
      `expected PersistenceError({code:"${expectedCode}"}), got ${describeThrown(thrown)}`,
    );
  }
  if (thrown.code !== expectedCode) {
    return fail(
      name,
      reasonMismatch,
      `expected code "${expectedCode}", got "${thrown.code}"`,
    );
  }
  return null;
}

function describeThrown(value: unknown): string {
  if (value === undefined) return "undefined (no throw)";
  if (value === null) return "null";
  if (value instanceof Error) return `Error(${value.message})`;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[unserialisable object]";
    }
  }
  return String(value);
}

// ────────────────────────────────────────────────────────────────
// Case builder — every case is fully self-contained: it creates a fresh
// port instance via `portFactory`, seeds the required state, and then
// verifies exactly one observable property.
// ────────────────────────────────────────────────────────────────

export function buildPersistenceConformanceCases(
  profile: PersistenceConformanceProfile,
  factories: PersistenceConformanceFactories,
): ReadonlyArray<PersistenceConformanceCase> {
  const { portFactory, identityFactory, contextFactory } = factories;

  const identityA = (): VerifiedIdentity => identityFactory(profile.actorA, profile.issuedAt);
  const identityB = (): VerifiedIdentity => identityFactory(profile.actorB, profile.issuedAt);
  const ctxA = (): TenantContext => contextFactory(identityA(), profile.tenantA);
  const ctxB = (): TenantContext => contextFactory(identityB(), profile.tenantB);

  const cases: Array<PersistenceConformanceCase> = [];

  // ── 1. save_then_load_conversation_matches ──────────────────
  cases.push({
    name: "save_then_load_conversation_matches",
    execute: async (): Promise<PersistenceConformanceDiagnostic> => {
      const port = portFactory();
      const context = ctxA();
      const conv: ConversationRecord = {
        tenantId: profile.tenantA,
        conversationId: profile.newConversationId(),
        createdAt: profile.nowISO(),
        createdBy: profile.actorA,
        language: "es",
      };
      await port.saveConversation(context, conv);
      const loaded = await port.loadConversation(context, conv.conversationId);
      if (loaded === null) {
        return fail("save_then_load_conversation_matches", "save_load_divergence", "loadConversation returned null after save");
      }
      if (loaded.conversationId !== conv.conversationId
          || loaded.tenantId !== conv.tenantId
          || loaded.createdBy !== conv.createdBy
          || loaded.language !== conv.language
          || loaded.createdAt !== conv.createdAt) {
        return fail(
          "save_then_load_conversation_matches",
          "save_load_divergence",
          `field mismatch: expected ${JSON.stringify(conv)}, got ${JSON.stringify(loaded)}`,
        );
      }
      return ok("save_then_load_conversation_matches");
    },
  });

  // ── 2. load_unknown_conversation_returns_null ───────────────
  cases.push({
    name: "load_unknown_conversation_returns_null",
    execute: async (): Promise<PersistenceConformanceDiagnostic> => {
      const port = portFactory();
      const context = ctxA();
      const unknownId = profile.newConversationId();
      const loaded = await port.loadConversation(context, unknownId);
      if (loaded !== null) {
        return fail(
          "load_unknown_conversation_returns_null",
          "load_missing_not_null",
          `loadConversation returned non-null for unknown id: ${JSON.stringify(loaded)}`,
        );
      }
      return ok("load_unknown_conversation_returns_null");
    },
  });

  // ── 3. save_message_then_list_includes_it ───────────────────
  cases.push({
    name: "save_message_then_list_includes_it",
    execute: async (): Promise<PersistenceConformanceDiagnostic> => {
      const port = portFactory();
      const context = ctxA();
      const conv = await seedConversation(port, context, profile);
      const msg: MessageRecord = {
        tenantId: profile.tenantA,
        conversationId: conv.conversationId,
        messageId: profile.newMessageId(),
        senderId: profile.actorA,
        text: "hello",
        language: "es",
        createdAt: profile.nowISO(),
      };
      await port.saveMessage(context, msg);
      const page = await port.listMessages(context, {
        conversationId: conv.conversationId,
        limit: 50,
        cursor: null,
      });
      if (!page.items.some((it) => it.messageId === msg.messageId)) {
        return fail(
          "save_message_then_list_includes_it",
          "pagination_missing_items",
          "listMessages did not include the just-saved message",
        );
      }
      const wrongConv = page.items.find((it) => it.conversationId !== conv.conversationId);
      if (wrongConv !== undefined) {
        return fail(
          "save_message_then_list_includes_it",
          "list_returned_wrong_conversation",
          `listMessages returned message from another conversation: ${JSON.stringify(wrongConv)}`,
        );
      }
      const wrongTenant = page.items.find((it) => it.tenantId !== profile.tenantA);
      if (wrongTenant !== undefined) {
        return fail(
          "save_message_then_list_includes_it",
          "list_returned_wrong_tenant",
          `listMessages returned message from another tenant: ${JSON.stringify(wrongTenant)}`,
        );
      }
      return ok("save_message_then_list_includes_it");
    },
  });

  // ── 4. save_message_idempotent_on_identical_repeat ──────────
  cases.push({
    name: "save_message_idempotent_on_identical_repeat",
    execute: async (): Promise<PersistenceConformanceDiagnostic> => {
      const port = portFactory();
      const context = ctxA();
      const conv = await seedConversation(port, context, profile);
      const msg: MessageRecord = {
        tenantId: profile.tenantA,
        conversationId: conv.conversationId,
        messageId: profile.newMessageId(),
        senderId: profile.actorA,
        text: "same",
        language: "es",
        createdAt: profile.nowISO(),
      };
      await port.saveMessage(context, msg);
      try {
        await port.saveMessage(context, msg);
      } catch (e) {
        return fail(
          "save_message_idempotent_on_identical_repeat",
          "idempotent_save_rejected",
          `identical repeat threw: ${describeThrown(e)}`,
        );
      }
      const page = await port.listMessages(context, {
        conversationId: conv.conversationId,
        limit: 50,
        cursor: null,
      });
      const occurrences = page.items.filter((it) => it.messageId === msg.messageId).length;
      if (occurrences !== 1) {
        return fail(
          "save_message_idempotent_on_identical_repeat",
          "idempotent_save_rejected",
          `expected exactly 1 row, got ${occurrences}`,
        );
      }
      return ok("save_message_idempotent_on_identical_repeat");
    },
  });

  // ── 5. save_message_conflict_on_divergent_content ───────────
  cases.push({
    name: "save_message_conflict_on_divergent_content",
    execute: async (): Promise<PersistenceConformanceDiagnostic> => {
      const port = portFactory();
      const context = ctxA();
      const conv = await seedConversation(port, context, profile);
      const messageId = profile.newMessageId();
      const first: MessageRecord = {
        tenantId: profile.tenantA,
        conversationId: conv.conversationId,
        messageId,
        senderId: profile.actorA,
        text: "first",
        language: "es",
        createdAt: profile.nowISO(),
      };
      const divergent: MessageRecord = { ...first, text: "second" };
      await port.saveMessage(context, first);
      let thrown: unknown = undefined;
      try {
        await port.saveMessage(context, divergent);
      } catch (e) {
        thrown = e;
      }
      const problem = expectPersistenceCode(
        "save_message_conflict_on_divergent_content",
        "conflict_wrong_code",
        "conflict_expected_not_raised",
        "conflict",
        thrown,
      );
      if (problem !== null) return problem;
      return ok("save_message_conflict_on_divergent_content");
    },
  });

  // ── 6. list_messages_stable_order_by_created_at_and_id ──────
  cases.push({
    name: "list_messages_stable_order_by_created_at_and_id",
    execute: async (): Promise<PersistenceConformanceDiagnostic> => {
      const port = portFactory();
      const context = ctxA();
      const conv = await seedConversation(port, context, profile);
      const created: Array<MessageRecord> = [];
      const base = profile.nowISO();
      const pairs: Array<[ISOTimestamp, MessageId]> = [
        [base, profile.newMessageId()],
        [base, profile.newMessageId()],
        [nextISO(base, 1), profile.newMessageId()],
        [nextISO(base, 2), profile.newMessageId()],
      ];
      for (const [createdAt, messageId] of pairs) {
        const m: MessageRecord = {
          tenantId: profile.tenantA,
          conversationId: conv.conversationId,
          messageId,
          senderId: profile.actorA,
          text: `t-${String(messageId)}`,
          language: "es",
          createdAt,
        };
        await port.saveMessage(context, m);
        created.push(m);
      }
      const page = await port.listMessages(context, {
        conversationId: conv.conversationId,
        limit: 50,
        cursor: null,
      });
      const expectedIds = [...created]
        .sort((a, b) => {
          if (a.createdAt < b.createdAt) return -1;
          if (a.createdAt > b.createdAt) return 1;
          if (a.messageId < b.messageId) return -1;
          if (a.messageId > b.messageId) return 1;
          return 0;
        })
        .map((m) => m.messageId);
      const actualIds = page.items.map((it) => it.messageId);
      if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
        return fail(
          "list_messages_stable_order_by_created_at_and_id",
          "pagination_order_broken",
          `expected ${JSON.stringify(expectedIds)}, got ${JSON.stringify(actualIds)}`,
        );
      }
      return ok("list_messages_stable_order_by_created_at_and_id");
    },
  });

  // ── 7. list_messages_pagination_no_duplicates ───────────────
  cases.push({
    name: "list_messages_pagination_no_duplicates",
    execute: async (): Promise<PersistenceConformanceDiagnostic> => {
      const port = portFactory();
      const context = ctxA();
      const conv = await seedConversation(port, context, profile);
      const N = 7;
      const savedIds: Array<MessageId> = [];
      for (let i = 0; i < N; i += 1) {
        const id = profile.newMessageId();
        savedIds.push(id);
        await port.saveMessage(context, {
          tenantId: profile.tenantA,
          conversationId: conv.conversationId,
          messageId: id,
          senderId: profile.actorA,
          text: `t-${i}`,
          language: "es",
          createdAt: nextISO(profile.nowISO(), i),
        });
      }
      const seen: Array<MessageId> = [];
      let cursor: MessagePage["nextCursor"] = null;
      for (let iterations = 0; iterations < N + 3; iterations += 1) {
        const page: MessagePage = await port.listMessages(context, {
          conversationId: conv.conversationId,
          limit: 3,
          cursor,
        });
        for (const it of page.items) {
          if (seen.includes(it.messageId)) {
            return fail(
              "list_messages_pagination_no_duplicates",
              "pagination_duplicate",
              `duplicate message ${String(it.messageId)} across pages`,
            );
          }
          seen.push(it.messageId);
        }
        if (page.nextCursor === null) break;
        cursor = page.nextCursor;
      }
      if (seen.length !== N) {
        return fail(
          "list_messages_pagination_no_duplicates",
          "pagination_missing_items",
          `expected ${N} items across pages, got ${seen.length}`,
        );
      }
      const missing = savedIds.filter((id) => !seen.includes(id));
      if (missing.length > 0) {
        return fail(
          "list_messages_pagination_no_duplicates",
          "pagination_missing_items",
          `missing ids: ${JSON.stringify(missing)}`,
        );
      }
      return ok("list_messages_pagination_no_duplicates");
    },
  });

  // ── 8. list_messages_cursor_from_other_conversation_rejected ─
  cases.push({
    name: "list_messages_cursor_from_other_conversation_rejected",
    execute: async (): Promise<PersistenceConformanceDiagnostic> => {
      const port = portFactory();
      const context = ctxA();
      const convA = await seedConversation(port, context, profile);
      const convB = await seedConversation(port, context, profile);
      const stray = makeMessageCursor(profile.nowISO(), profile.newMessageId());
      let thrown: unknown = undefined;
      try {
        await port.listMessages(context, {
          conversationId: convA.conversationId,
          limit: 10,
          cursor: stray,
        });
      } catch (e) {
        thrown = e;
      }
      // Two acceptable behaviours per Plan §10.6: raise `not_found`, or
      // silently return an empty first page (no leakage). Any leak is a
      // failure. We accept both silent-empty and `not_found` throw.
      if (thrown !== undefined) {
        const problem = expectPersistenceCode(
          "list_messages_cursor_from_other_conversation_rejected",
          "cursor_from_other_conversation_accepted",
          "cursor_from_other_conversation_accepted",
          "not_found",
          thrown,
        );
        if (problem !== null) return problem;
      }
      // Reference convB so the fixture cannot elide it and thereby hide a
      // possible cross-conversation leak in a future refactor.
      if (convA.conversationId === convB.conversationId) {
        return fail(
          "list_messages_cursor_from_other_conversation_rejected",
          "unexpected_shape",
          "newConversationId returned duplicate id — non-deterministic profile",
        );
      }
      return ok("list_messages_cursor_from_other_conversation_rejected");
    },
  });

  // ── 9. append_usage_idempotent_on_identical_repeat ──────────
  cases.push({
    name: "append_usage_idempotent_on_identical_repeat",
    execute: async (): Promise<PersistenceConformanceDiagnostic> => {
      const port = portFactory();
      const context = ctxA();
      const entry: UsageEntry = {
        tenantId: profile.tenantA,
        metricKind: "text_chars",
        quantity: 5,
        unit: "chars",
        occurredAt: profile.nowISO(),
        source: "harness",
        idempotencyKey: profile.newUUID(),
        entryKind: "normal",
        correlationId: null,
      };
      await port.appendUsage(context, entry);
      try {
        await port.appendUsage(context, entry);
      } catch (e) {
        return fail(
          "append_usage_idempotent_on_identical_repeat",
          "usage_idempotency_broken",
          `identical repeat threw: ${describeThrown(e)}`,
        );
      }
      return ok("append_usage_idempotent_on_identical_repeat");
    },
  });

  // ── 10. append_usage_conflict_on_divergent_content ──────────
  cases.push({
    name: "append_usage_conflict_on_divergent_content",
    execute: async (): Promise<PersistenceConformanceDiagnostic> => {
      const port = portFactory();
      const context = ctxA();
      const key = profile.newUUID();
      const first: UsageEntry = {
        tenantId: profile.tenantA,
        metricKind: "text_chars",
        quantity: 5,
        unit: "chars",
        occurredAt: profile.nowISO(),
        source: "harness",
        idempotencyKey: key,
        entryKind: "normal",
        correlationId: null,
      };
      const divergent: UsageEntry = { ...first, quantity: 99 };
      await port.appendUsage(context, first);
      let thrown: unknown = undefined;
      try {
        await port.appendUsage(context, divergent);
      } catch (e) {
        thrown = e;
      }
      const problem = expectPersistenceCode(
        "append_usage_conflict_on_divergent_content",
        "usage_conflict_wrong_code",
        "usage_conflict_expected_not_raised",
        "conflict",
        thrown,
      );
      if (problem !== null) return problem;
      return ok("append_usage_conflict_on_divergent_content");
    },
  });

  // ── 11. cross_tenant_load_yields_null_or_error ──────────────
  cases.push({
    name: "cross_tenant_load_yields_null_or_error",
    execute: async (): Promise<PersistenceConformanceDiagnostic> => {
      const port = portFactory();
      const contextA = ctxA();
      const contextB = ctxB();
      const convA = await seedConversation(port, contextA, profile);
      // Attempt to load A's conversation under tenant B's context.
      let loaded: ConversationRecord | null = null;
      let thrown: unknown = undefined;
      try {
        loaded = await port.loadConversation(contextB, convA.conversationId);
      } catch (e) {
        thrown = e;
      }
      if (loaded !== null) {
        return fail(
          "cross_tenant_load_yields_null_or_error",
          "cross_tenant_read_leak",
          `loadConversation returned tenant A's row under tenant B: ${JSON.stringify(loaded)}`,
        );
      }
      // If throw path was taken, must be a typed PersistenceError; else
      // the null return is equally acceptable.
      if (thrown !== undefined && !isPersistenceError(thrown)) {
        return fail(
          "cross_tenant_load_yields_null_or_error",
          "unexpected_throw",
          `cross-tenant load threw non-PersistenceError: ${describeThrown(thrown)}`,
        );
      }
      return ok("cross_tenant_load_yields_null_or_error");
    },
  });

  // ── 12. cross_tenant_list_yields_empty_or_error ─────────────
  cases.push({
    name: "cross_tenant_list_yields_empty_or_error",
    execute: async (): Promise<PersistenceConformanceDiagnostic> => {
      const port = portFactory();
      const contextA = ctxA();
      const contextB = ctxB();
      const convA = await seedConversation(port, contextA, profile);
      await port.saveMessage(contextA, {
        tenantId: profile.tenantA,
        conversationId: convA.conversationId,
        messageId: profile.newMessageId(),
        senderId: profile.actorA,
        text: "private",
        language: "es",
        createdAt: profile.nowISO(),
      });
      let page: MessagePage | null = null;
      let thrown: unknown = undefined;
      try {
        page = await port.listMessages(contextB, {
          conversationId: convA.conversationId,
          limit: 50,
          cursor: null,
        });
      } catch (e) {
        thrown = e;
      }
      if (page !== null && page.items.length > 0) {
        return fail(
          "cross_tenant_list_yields_empty_or_error",
          "usage_cross_tenant_leak",
          `listMessages returned ${page.items.length} items from tenant A under tenant B`,
        );
      }
      if (thrown !== undefined && !isPersistenceError(thrown)) {
        return fail(
          "cross_tenant_list_yields_empty_or_error",
          "unexpected_throw",
          `cross-tenant list threw non-PersistenceError: ${describeThrown(thrown)}`,
        );
      }
      return ok("cross_tenant_list_yields_empty_or_error");
    },
  });

  // ── 13. deterministic across two fresh instances ────────────
  cases.push({
    name: "deterministic_across_fresh_instances",
    execute: async (): Promise<PersistenceConformanceDiagnostic> => {
      const portOne = portFactory();
      const portTwo = portFactory();
      const context = ctxA();
      const convId = profile.newConversationId();
      const record: ConversationRecord = {
        tenantId: profile.tenantA,
        conversationId: convId,
        createdAt: profile.nowISO(),
        createdBy: profile.actorA,
        language: "en",
      };
      await portOne.saveConversation(context, record);
      const loadedInOne = await portOne.loadConversation(context, convId);
      const loadedInTwo = await portTwo.loadConversation(context, convId);
      if (loadedInOne === null) {
        return fail(
          "deterministic_across_fresh_instances",
          "save_load_divergence",
          "portOne could not read back its own write",
        );
      }
      if (loadedInTwo !== null) {
        return fail(
          "deterministic_across_fresh_instances",
          "nondeterministic",
          "portTwo (fresh factory) leaked state from portOne",
        );
      }
      return ok("deterministic_across_fresh_instances");
    },
  });

  return Object.freeze(cases);
}

// ────────────────────────────────────────────────────────────────
// Evaluator — trivial: run the case's `execute` and box unexpected throws.
// ────────────────────────────────────────────────────────────────

export async function evaluatePersistenceConformanceCase(
  testCase: PersistenceConformanceCase,
): Promise<PersistenceConformanceDiagnostic> {
  try {
    return await testCase.execute();
  } catch (e) {
    return {
      ok: false,
      name: testCase.name,
      reason: "unexpected_throw",
      detail: describeThrown(e),
    };
  }
}

// ────────────────────────────────────────────────────────────────
// Internal helpers.
// ────────────────────────────────────────────────────────────────

async function seedConversation(
  port: PersistencePort,
  context: TenantContext,
  profile: PersistenceConformanceProfile,
): Promise<ConversationRecord> {
  const conv: ConversationRecord = {
    tenantId: context.tenantId,
    conversationId: profile.newConversationId(),
    createdAt: profile.nowISO(),
    createdBy: context.identity.actorId,
    language: "es",
  };
  await port.saveConversation(context, conv);
  return conv;
}

function nextISO(base: ISOTimestamp, offsetSeconds: number): ISOTimestamp {
  const parsed = Date.parse(base);
  if (Number.isNaN(parsed)) {
    // Fallback for non-standard ISO strings — append microsecond suffix so
    // the returned value still sorts lexicographically after `base`.
    return (base + `+${offsetSeconds}s`) as ISOTimestamp;
  }
  return new Date(parsed + offsetSeconds * 1000).toISOString() as ISOTimestamp;
}
