/**
 * SPABLA Engine — internal PersistencePort contract (Fase 8 · Hito 8.1).
 *
 * Provider-agnostic, structural contract for the persistence subdomain.
 * The port owns exclusively types and one factory (`makeMessageCursor`)
 * whose sole purpose is to promote a plain `(createdAt, messageId)` pair
 * into an opaque `MessageCursor` brand — no business logic here.
 *
 * The concrete Supabase implementation lives in
 * `./supabase/supabase-persistence.ts` (Hito 8.3). Zero JWT logic, zero
 * SQL, zero network, and zero mention of a concrete provider in this
 * file (Plan Fase 8 V1.2 §6, §8.4).
 *
 * Strict-mode rules for this file (Plan Fase 8 V1.2 §6):
 *  - `export type` for every type;
 *  - the type-system escape hatch is prohibited;
 *  - double-cast phrasing is prohibited;
 *  - compiler-directive suppressions are prohibited;
 *  - opaque-value typing is prohibited here (belongs at real
 *    runtime-validation boundaries in the concrete adapter).
 *
 * @internal Not part of the public engine surface. MUST NOT be re-exported
 * from `engine/src/index.ts` nor from `engine/src/adapters/index.ts`.
 */

import type { UUID, ISOTimestamp } from "../../types/ids";
import type { LangCode } from "../../types/language";
import type { VerifiedIdentity } from "./identity";
import type { TenantContext } from "./tenant-context";
import type { PersistenceError, PersistenceErrorCode } from "./errors";

// ────────────────────────────────────────────────────────────────
// ID aliases (all UUID under the hood; branded via Foundation).
// ────────────────────────────────────────────────────────────────

export type TenantId = UUID;
export type ActorId = UUID;
export type ConversationId = UUID;
export type MessageId = UUID;

// ────────────────────────────────────────────────────────────────
// MessageCursor — opaque, brand-protected, ordered by (createdAt, messageId).
// The brand key is module-private; consumers must go through
// `makeMessageCursor` to obtain a cursor.
// ────────────────────────────────────────────────────────────────

const messageCursorBrand: unique symbol = Symbol("SPABLA.MessageCursor");

export type MessageCursor = {
  readonly createdAt: ISOTimestamp;
  readonly messageId: MessageId;
  readonly [messageCursorBrand]: "MessageCursor";
};

export function makeMessageCursor(
  createdAt: ISOTimestamp,
  messageId: MessageId,
): MessageCursor {
  return Object.freeze({
    createdAt,
    messageId,
    [messageCursorBrand]: "MessageCursor" as const,
  });
}

// ────────────────────────────────────────────────────────────────
// Domain records — all readonly, all `TenantContext`-carrying at the
// port operation level (the record itself echoes `tenantId` for
// structural coherence with FK compuestas in the schema, Plan §9.3).
// ────────────────────────────────────────────────────────────────

export type ConversationRecord = {
  readonly tenantId: TenantId;
  readonly conversationId: ConversationId;
  readonly createdAt: ISOTimestamp;
  readonly createdBy: ActorId;
  readonly language: LangCode;
};

export type MessageRecord = {
  readonly tenantId: TenantId;
  readonly conversationId: ConversationId;
  readonly messageId: MessageId;
  readonly senderId: ActorId;
  readonly text: string;
  readonly language: LangCode;
  readonly createdAt: ISOTimestamp;
};

// ────────────────────────────────────────────────────────────────
// Usage ledger — one appended entry per accountable event. Idempotency
// is structural via `UNIQUE(tenant_id, source, idempotency_key)` (Plan
// §9.3, §11.4). Compensations are explicit via `entry_kind`.
// ────────────────────────────────────────────────────────────────

export type UsageMetricKind =
  | "turns"
  | "voice_seconds"
  | "text_chars"
  | "provider_call";

export type UsageEntryKind = "normal" | "compensation";

export type UsageEntry = {
  readonly tenantId: TenantId;
  readonly metricKind: UsageMetricKind;
  readonly quantity: number;
  readonly unit: string;
  readonly occurredAt: ISOTimestamp;
  readonly source: string;
  readonly idempotencyKey: UUID;
  readonly entryKind: UsageEntryKind;
  readonly correlationId: UUID | null;
};

// ────────────────────────────────────────────────────────────────
// Pagination — opaque cursor, total-stable order, single signature
// (Plan §6, §10.6).
// ────────────────────────────────────────────────────────────────

export type MessagePageRequest = {
  readonly conversationId: ConversationId;
  readonly limit: number;
  readonly cursor: MessageCursor | null;
};

export type MessagePage = {
  readonly items: ReadonlyArray<MessageRecord>;
  readonly nextCursor: MessageCursor | null;
};

// ────────────────────────────────────────────────────────────────
// PersistencePort — structural type. Exactly five operations. Every
// operation takes `TenantContext` first. Errors are thrown as
// `PersistenceError` (see `./errors`).
// ────────────────────────────────────────────────────────────────

export type PersistencePort = {
  saveConversation(ctx: TenantContext, record: ConversationRecord): Promise<void>;
  loadConversation(ctx: TenantContext, conversationId: ConversationId): Promise<ConversationRecord | null>;
  saveMessage(ctx: TenantContext, record: MessageRecord): Promise<void>;
  listMessages(ctx: TenantContext, request: MessagePageRequest): Promise<MessagePage>;
  appendUsage(ctx: TenantContext, entry: UsageEntry): Promise<void>;
};

// ────────────────────────────────────────────────────────────────
// Re-exported convenience for downstream persistence modules — a
// closed enumeration of the port's operation names, so structural
// probes in tests do not string-literal-hardcode them scattered around.
// ────────────────────────────────────────────────────────────────

export const PERSISTENCE_PORT_OPERATIONS = Object.freeze([
  "saveConversation",
  "loadConversation",
  "saveMessage",
  "listMessages",
  "appendUsage",
] as const);

export type PersistencePortOperation = typeof PERSISTENCE_PORT_OPERATIONS[number];

// Re-export the surface types touched by the port so callers only import
// from `./port` — types-only, zero runtime.
export type {
  VerifiedIdentity,
  TenantContext,
  PersistenceError,
  PersistenceErrorCode,
};
