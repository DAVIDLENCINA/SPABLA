/**
 * SPABLA Engine — SupabasePersistence (Fase 8 · Hito 8.3).
 *
 * Productive adapter that implements the five operations of
 * `PersistencePort` against Supabase (`spabla_v2` schema + `admin_append_usage`
 * SECURITY DEFINER function). This is the ONLY module in the engine that is
 * allowed to import `@supabase/supabase-js` (Plan Fase 8 V1.2 §10.4).
 *
 * Construction model:
 *  - The adapter is a plain class with an explicit constructor. Zero global
 *    singleton, zero mutable module state, zero direct `process.env`
 *    reads. Every capability required to operate is passed in explicitly by
 *    the caller (harness E2E or trusted server-side backend).
 *  - `authenticated` — Supabase client already carrying the actor's JWT
 *    (`sub` === `TenantContext.identity.actorId`). It runs under RLS as the
 *    Supabase role `authenticated`. Used for `saveConversation`,
 *    `loadConversation`, `saveMessage`, `listMessages`.
 *  - `privileged` — optional Supabase client built with the `service_role`
 *    credential, inject exclusively in trusted server-side contexts. Used
 *    only to invoke the `spabla_v2.admin_append_usage` SECURITY DEFINER
 *    function from `appendUsage`. Zero grants to `authenticated`/`anon` on
 *    the ledger prevent any bypass (Plan Fase 8 §7.1ter).
 *
 * Identity coherence (Plan Fase 8 §5.1 A2nuevo + §10.4):
 *  - Before executing any tenant-scoped operation, the adapter verifies
 *    that `TenantContext.identity.actorId === auth.uid()` observed by the
 *    authenticated client. Divergence produces `identity_invalid` before
 *    any DB write occurs. The actual `auth.uid()` is queried once per
 *    adapter instance via `authenticated.auth.getUser()` and cached; the
 *    caller is responsible for building a fresh adapter when the JWT
 *    rotates.
 *
 * @internal Not part of the public engine surface. MUST NOT be re-exported
 * from `engine/src/index.ts` nor from `engine/src/adapters/index.ts`
 * (Plan Fase 8 §16.1, Plan Hito 8.2 §9).
 */

import type {
  PostgrestError,
  SupabaseClient,
} from "@supabase/supabase-js";

import type {
  ActorId,
  ConversationId,
  ConversationRecord,
  MessageCursor,
  MessagePage,
  MessagePageRequest,
  MessageRecord,
  PersistencePort,
  UsageEntry,
} from "../port";
import { makeMessageCursor } from "../port";
import type { TenantContext } from "../tenant-context";
import {
  persistenceError,
  persistenceErrorWithRetry,
  type PersistenceError,
} from "../errors";
import { asUUID, asISOTimestamp } from "../../../types/ids";
import { isLangCode, type LangCode } from "../../../types/language";

const MAX_PAGE_LIMIT = 500;

const MESSAGE_COLUMNS =
  "id,tenant_id,conversation_id,sender_id,text,language,created_at" as const;

// Strict runtime validation for cursor components before interpolating into
// PostgREST `.or(...)` filters. TypeScript brands are compile-time only; a
// hostile caller could bypass them with `as MessageCursor`. These regexes
// reject any character sequence that could inject PostgREST operators.
const ISO_8601_STRICT_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const UUID_STRICT_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidIsoTimestamp(raw: string): boolean {
  if (!ISO_8601_STRICT_RE.test(raw)) return false;
  const t = Date.parse(raw);
  return Number.isFinite(t);
}

function isValidUuid(raw: string): boolean {
  return UUID_STRICT_RE.test(raw);
}

// Semantic timestamp equality. Postgres normalises `TIMESTAMPTZ` on the wire
// (e.g. `2026-08-05T10:00:00.000Z` may come back as `2026-08-05T10:00:00+00:00`),
// so string comparison of `created_at` is not stable across insert/read. We
// compare the underlying instant via `Date.parse`, requiring both operands to
// parse to finite numbers and to represent the same absolute point in time.
function sameInstant(a: string, b: string): boolean {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false;
  return ta === tb;
}

// Distinguish transport failures from actual authentication failures when
// probing `authenticated.auth.getUser()`. Any HTTP 5xx, network error,
// timeout, DNS failure or synchronous transport throw normalises to
// `unavailable` (retryable). Only genuine credential problems (401/403,
// malformed JWT, missing session) normalise to `identity_invalid`. In both
// paths the outgoing message is opaque — the raw error text is discarded
// so it cannot leak URLs, tokens, headers or body content.
function translateAuthTransportOrIdentity(raw: unknown): PersistenceError {
  const anyErr = raw as {
    status?: number;
    name?: string;
    message?: string;
  } | null | undefined;
  const status = typeof anyErr?.status === "number" ? anyErr.status : 0;
  const name = typeof anyErr?.name === "string" ? anyErr.name : "";
  const rawMessage = typeof anyErr?.message === "string" ? anyErr.message : "";
  const lower = rawMessage.toLowerCase();
  const transportName =
    name === "AuthRetryableFetchError" || name === "FetchError" || name === "TypeError";
  const transportStatus = status === 0 || status >= 500;
  const transportMessage =
    lower.startsWith("fetch failed")
    || lower.includes("enotfound")
    || lower.includes("econnreset")
    || lower.includes("econnrefused")
    || lower.includes("etimedout")
    || lower.startsWith("network")
    || lower.includes("timeout")
    || lower.includes("socket hang up");
  if (transportName || transportStatus || transportMessage) {
    return persistenceErrorWithRetry(
      "unavailable",
      "authentication service unavailable",
      true,
    );
  }
  return persistenceError(
    "identity_invalid",
    "authenticated client has no valid session",
  );
}

type ConversationRow = {
  readonly id: string;
  readonly tenant_id: string;
  readonly created_at: string;
  readonly created_by: string;
  readonly language: string;
};

type MessageRow = {
  readonly id: string;
  readonly tenant_id: string;
  readonly conversation_id: string;
  readonly sender_id: string;
  readonly text: string;
  readonly language: string;
  readonly created_at: string;
};

export type SupabasePersistenceCapabilities = {
  /** Supabase client carrying the actor's JWT (`authenticated` role). */
  readonly authenticated: SupabaseClient;
  /**
   * Optional Supabase client with `service_role` capability. Required to
   * invoke `appendUsage`. If absent, `appendUsage` fails closed with
   * `unauthorized` without attempting any write.
   */
  readonly privileged?: SupabaseClient | null;
};

export class SupabasePersistence implements PersistencePort {
  private readonly authenticated: SupabaseClient;
  private readonly privileged: SupabaseClient | null;

  constructor(capabilities: SupabasePersistenceCapabilities) {
    if (!capabilities || typeof capabilities !== "object") {
      throw persistenceError(
        "unauthorized",
        "SupabasePersistence: capabilities object required",
      );
    }
    if (!capabilities.authenticated) {
      throw persistenceError(
        "unauthorized",
        "SupabasePersistence: authenticated client required",
      );
    }
    this.authenticated = capabilities.authenticated;
    this.privileged = capabilities.privileged ?? null;
  }

  // ────────────────────────────────────────────────────────────────
  // saveConversation — INSERT under RLS with idempotent semantics.
  // ────────────────────────────────────────────────────────────────
  async saveConversation(
    ctx: TenantContext,
    record: ConversationRecord,
  ): Promise<void> {
    await this.assertIdentity(ctx);
    if (record.tenantId !== ctx.tenantId) {
      throw persistenceError(
        "tenant_context_invalid",
        "saveConversation: record.tenantId does not match TenantContext",
      );
    }
    const existing = await this.fetchConversationRow(ctx, record.conversationId);
    if (existing !== null) {
      if (this.conversationEquals(existing, record)) {
        return;
      }
      throw persistenceError(
        "conflict",
        "saveConversation: existing conversation differs on normative fields",
      );
    }
    const { error } = await this.authenticated
      .schema("spabla_v2")
      .from("conversations")
      .insert({
        id: record.conversationId,
        tenant_id: record.tenantId,
        created_by: record.createdBy,
        language: record.language,
        created_at: record.createdAt,
      });
    if (error) {
      throw this.translatePostgrestError(error);
    }
  }

  // ────────────────────────────────────────────────────────────────
  // loadConversation — SELECT under RLS; null on unknown/foreign.
  // ────────────────────────────────────────────────────────────────
  async loadConversation(
    ctx: TenantContext,
    conversationId: ConversationId,
  ): Promise<ConversationRecord | null> {
    await this.assertIdentity(ctx);
    const row = await this.fetchConversationRow(ctx, conversationId);
    if (row === null) {
      return null;
    }
    return {
      tenantId: asUUID(row.tenant_id),
      conversationId: asUUID(row.id),
      createdAt: asISOTimestamp(row.created_at),
      createdBy: asUUID(row.created_by),
      language: this.narrowLangCode(row.language),
    };
  }

  // ────────────────────────────────────────────────────────────────
  // saveMessage — semantic idempotency (§10.5).
  // ────────────────────────────────────────────────────────────────
  async saveMessage(
    ctx: TenantContext,
    record: MessageRecord,
  ): Promise<void> {
    await this.assertIdentity(ctx);
    if (record.tenantId !== ctx.tenantId) {
      throw persistenceError(
        "tenant_context_invalid",
        "saveMessage: record.tenantId does not match TenantContext",
      );
    }
    const existing = await this.fetchMessageRow(ctx, record.messageId);
    if (existing !== null) {
      if (this.messageEquals(existing, record)) {
        return;
      }
      throw persistenceError(
        "conflict",
        "saveMessage: existing message differs on normative fields",
      );
    }
    const { error } = await this.authenticated
      .schema("spabla_v2")
      .from("messages")
      .insert({
        id: record.messageId,
        tenant_id: record.tenantId,
        conversation_id: record.conversationId,
        sender_id: record.senderId,
        text: record.text,
        language: record.language,
        created_at: record.createdAt,
      });
    if (error) {
      // Concurrent identical insert: another writer won the race → return the
      // canonical row semantically. Only escalate on true content divergence.
      const raced = await this.fetchMessageRow(ctx, record.messageId);
      if (raced !== null && this.messageEquals(raced, record)) {
        return;
      }
      throw this.translatePostgrestError(error);
    }
  }

  // ────────────────────────────────────────────────────────────────
  // listMessages — cursor-paginated, total-stable order (§10.6).
  // ────────────────────────────────────────────────────────────────
  async listMessages(
    ctx: TenantContext,
    request: MessagePageRequest,
  ): Promise<MessagePage> {
    await this.assertIdentity(ctx);
    if (!Number.isInteger(request.limit) || request.limit <= 0 || request.limit > MAX_PAGE_LIMIT) {
      throw persistenceError(
        "constraint_violation",
        `listMessages: limit must be integer in (0, ${MAX_PAGE_LIMIT}]`,
      );
    }
    if (typeof request.conversationId !== "string" || !isValidUuid(request.conversationId)) {
      throw persistenceError(
        "constraint_violation",
        "listMessages: conversationId is not a valid UUID",
      );
    }
    let cursorCreatedAt: string | null = null;
    let cursorMessageId: string | null = null;
    if (request.cursor !== null) {
      const rawCa = request.cursor.createdAt as unknown;
      const rawMid = request.cursor.messageId as unknown;
      if (typeof rawCa !== "string" || !isValidIsoTimestamp(rawCa)
       || typeof rawMid !== "string" || !isValidUuid(rawMid)) {
        throw persistenceError(
          "constraint_violation",
          "listMessages: cursor is malformed",
        );
      }
      cursorCreatedAt = rawCa;
      cursorMessageId = rawMid;
      const anchor = await this.fetchMessageRow(ctx, cursorMessageId);
      if (anchor === null || anchor.conversation_id !== request.conversationId) {
        throw persistenceError(
          "not_found",
          "listMessages: cursor does not belong to the requested conversation",
        );
      }
    }
    let query = this.authenticated
      .schema("spabla_v2")
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("tenant_id", ctx.tenantId)
      .eq("conversation_id", request.conversationId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(request.limit + 1);
    if (cursorCreatedAt !== null && cursorMessageId !== null) {
      // (created_at, id) > (cursor.createdAt, cursor.messageId), lexicographic.
      // Both components are already validated with strict regexes above; no
      // PostgREST metacharacter can reach this interpolation.
      query = query.or(
        `created_at.gt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.gt.${cursorMessageId})`,
      );
    }
    const { data, error } = await query;
    if (error) {
      throw this.translatePostgrestError(error);
    }
    const rows = (data ?? []) as ReadonlyArray<MessageRow>;
    const hasMore = rows.length > request.limit;
    const pageRows = hasMore ? rows.slice(0, request.limit) : rows;
    const items = pageRows.map((row) => this.rowToMessageRecord(row));
    let nextCursor: MessageCursor | null = null;
    if (hasMore) {
      const last = pageRows[pageRows.length - 1];
      if (last !== undefined) {
        nextCursor = makeMessageCursor(
          asISOTimestamp(last.created_at),
          asUUID(last.id),
        );
      }
    }
    return { items, nextCursor };
  }

  // ────────────────────────────────────────────────────────────────
  // appendUsage — sole path to `usage_ledger`; requires `service_role`
  // capability + delegates to `spabla_v2.admin_append_usage` (§7.1ter).
  // ────────────────────────────────────────────────────────────────
  async appendUsage(ctx: TenantContext, entry: UsageEntry): Promise<void> {
    await this.assertIdentity(ctx);
    if (entry.tenantId !== ctx.tenantId) {
      throw persistenceError(
        "tenant_context_invalid",
        "appendUsage: entry.tenantId does not match TenantContext",
      );
    }
    if (this.privileged === null) {
      throw persistenceError(
        "unauthorized",
        "appendUsage: privileged capability required",
      );
    }
    const { error } = await this.privileged.schema("spabla_v2").rpc("admin_append_usage", {
      p_tenant_id: entry.tenantId,
      p_actor_id: ctx.identity.actorId,
      p_source: entry.source,
      p_metric_kind: entry.metricKind,
      p_quantity: entry.quantity,
      p_unit: entry.unit,
      p_idempotency_key: entry.idempotencyKey,
      p_correlation_id: entry.correlationId,
      p_entry_kind: entry.entryKind,
      p_occurred_at: entry.occurredAt,
      p_require_membership: true,
    });
    if (error) {
      throw this.translatePostgrestError(error);
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Private helpers
  // ────────────────────────────────────────────────────────────────

  private async assertIdentity(ctx: TenantContext): Promise<void> {
    // No caching. Each public operation probes the authenticated session
    // (Plan Fase 8 §5.1 A2nuevo, §10.4). A rotated JWT or a re-instantiated
    // client observed by the same adapter cannot silently reuse a stale
    // identity — the check runs before every SELECT/INSERT/RPC.
    const observed = await this.probeAuthenticatedActor();
    if (ctx.identity.actorId !== observed) {
      throw persistenceError(
        "identity_invalid",
        "identity mismatch: TenantContext.actorId differs from authenticated auth.uid()",
      );
    }
  }

  private async probeAuthenticatedActor(): Promise<ActorId> {
    let response: Awaited<ReturnType<SupabaseClient["auth"]["getUser"]>>;
    try {
      response = await this.authenticated.auth.getUser();
    } catch (raw) {
      // Transport threw synchronously before returning an object; this is
      // never authentication — always infrastructure.
      throw translateAuthTransportOrIdentity(raw);
    }
    if (response.error) {
      throw translateAuthTransportOrIdentity(response.error);
    }
    const uid = response.data?.user?.id;
    if (typeof uid !== "string" || uid.length === 0) {
      throw persistenceError(
        "identity_invalid",
        "identity probe: authenticated session missing user id",
      );
    }
    return asUUID(uid);
  }

  private async fetchConversationRow(
    ctx: TenantContext,
    conversationId: ConversationId,
  ): Promise<ConversationRow | null> {
    const { data, error } = await this.authenticated
      .schema("spabla_v2")
      .from("conversations")
      .select("id,tenant_id,created_at,created_by,language")
      .eq("tenant_id", ctx.tenantId)
      .eq("id", conversationId)
      .maybeSingle();
    if (error) {
      throw this.translatePostgrestError(error);
    }
    if (data === null || data === undefined) {
      return null;
    }
    return data as ConversationRow;
  }

  private async fetchMessageRow(
    ctx: TenantContext,
    messageId: string,
  ): Promise<MessageRow | null> {
    const { data, error } = await this.authenticated
      .schema("spabla_v2")
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("tenant_id", ctx.tenantId)
      .eq("id", messageId)
      .maybeSingle();
    if (error) {
      throw this.translatePostgrestError(error);
    }
    if (data === null || data === undefined) {
      return null;
    }
    return data as MessageRow;
  }

  private rowToMessageRecord(row: MessageRow): MessageRecord {
    return {
      tenantId: asUUID(row.tenant_id),
      conversationId: asUUID(row.conversation_id),
      messageId: asUUID(row.id),
      senderId: asUUID(row.sender_id),
      text: row.text,
      language: this.narrowLangCode(row.language),
      createdAt: asISOTimestamp(row.created_at),
    };
  }

  private narrowLangCode(raw: string): LangCode {
    if (!isLangCode(raw)) {
      throw persistenceError(
        "constraint_violation",
        "row.language is not a recognised LangCode",
      );
    }
    return raw;
  }

  private conversationEquals(
    row: ConversationRow,
    record: ConversationRecord,
  ): boolean {
    return (
      row.tenant_id === record.tenantId
      && row.id === record.conversationId
      && row.created_by === record.createdBy
      && row.language === record.language
      && sameInstant(row.created_at, record.createdAt)
    );
  }

  private messageEquals(row: MessageRow, record: MessageRecord): boolean {
    return (
      row.tenant_id === record.tenantId
      && row.id === record.messageId
      && row.conversation_id === record.conversationId
      && row.sender_id === record.senderId
      && row.text === record.text
      && row.language === record.language
      && sameInstant(row.created_at, record.createdAt)
    );
  }

  private translatePostgrestError(error: PostgrestError): PersistenceError {
    const code = typeof error.code === "string" ? error.code : "";
    // PostgreSQL SQLSTATE codes we care about.
    if (code === "23505") {
      return persistenceError("conflict", "unique_violation");
    }
    if (code === "23503") {
      return persistenceError("constraint_violation", "foreign_key_violation");
    }
    if (code === "23514") {
      return persistenceError("constraint_violation", "check_violation");
    }
    if (code === "42501") {
      return persistenceError("unauthorized", "insufficient_privilege");
    }
    // PostgREST convention: "PGRST116" = "The result contains 0 rows" (used
    // when a `single()` returns nothing). We map it to `not_found`.
    if (code === "PGRST116") {
      return persistenceError("not_found", "no rows");
    }
    // Network / transient errors surface as objects without `code` from
    // PostgREST but with `message`. Any unrecognised transport-layer symptom
    // is treated as `unavailable` and retryable.
    const message = typeof error.message === "string" ? error.message : "";
    const transient =
      message.startsWith("fetch failed")
      || message.startsWith("network")
      || message.startsWith("timeout")
      || message.includes("ECONNRESET")
      || message.includes("ETIMEDOUT")
      || message.includes("503")
      || message.includes("504");
    if (transient) {
      return persistenceErrorWithRetry(
        "unavailable",
        "transport unavailable",
        true,
      );
    }
    // Fallback: opaque database error surfaced as constraint_violation with
    // zero leak of internal messages.
    return persistenceError("constraint_violation", "database error");
  }
}
