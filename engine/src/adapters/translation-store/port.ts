/**
 * SPABLA Engine — TranslationStore contract (Fase 9 · Hito 9.1.1).
 *
 * Independent internal port. Persists server-side translations of
 * `spabla_v2.messages` keyed by
 * `(tenantId, messageId, targetLanguage, translationVersion)`.
 *
 * This module is intentionally NOT a part of `PersistencePort`. The
 * Fase 8 persistence contract is frozen and MUST NOT be modified;
 * translations live in their own subdomain with their own errors,
 * their own tests and their own adapter implementations. The two ports
 * may share types from Foundation (`UUID`, `LangCode`, ...) and the
 * neutral `TenantContext` / `VerifiedIdentity` types, but neither
 * re-exports the other.
 *
 * Trust model:
 *   - `load` runs under the caller's `authenticated` JWT (RLS is the
 *     authority; a foreign tenant sees empty).
 *   - `saveServerSide` requires the trusted server composition
 *     (service_role capability). The port MUST enforce that the record
 *     under insert belongs to the tenant selected in `TenantContext`
 *     BEFORE the underlying write.
 *   - Adapters MUST verify the caller's live `auth.uid()` against
 *     `ctx.identity.actorId` on both operations to prevent a forged
 *     `TenantContext` from routing writes for a different actor.
 *
 * Idempotency:
 *   - The primary key
 *     `(tenant_id, message_id, target_language, translation_version)`
 *     provides deterministic idempotency. Two concurrent writers of the
 *     SAME `translatedText` MUST both succeed (silently). Two writers
 *     of DIFFERENT text for the same key MUST resolve deterministically
 *     by returning the row that survived the race (Plan §7.11) — the
 *     later writer never overwrites the winner.
 *
 * @internal Not part of the public engine surface. MUST NOT be re-exported
 * from `engine/src/index.ts`.
 */

import type { UUID, ISOTimestamp } from "../../types/ids";
import type { LangCode } from "../../types/language";
import type { VerifiedIdentity } from "../persistence/identity";
import type { TenantContext } from "../persistence/tenant-context";
import type { TranslationStoreError, TranslationStoreErrorCode } from "./errors";

// Aliases — all UUID under the hood.
export type TenantId = UUID;
export type MessageId = UUID;

/**
 * Opaque provider version marker. A single string that identifies the
 * translation pipeline that produced a stored row: model, prompt,
 * post-processing, whatever the operator chooses to compose into the
 * key. Callers pick a value; the port only enforces non-emptiness.
 */
export type TranslationVersion = string;

/**
 * Fully materialised translation row.
 */
export type TranslationRecord = {
  readonly tenantId: TenantId;
  readonly messageId: MessageId;
  readonly targetLanguage: LangCode;
  readonly translationVersion: TranslationVersion;
  readonly translatedText: string;
  readonly provider: string;
  readonly model: string | null;
  readonly providerRef: string | null;
  readonly createdAt: ISOTimestamp;
};

/**
 * Argument bundle for `saveServerSide`. `createdAt` is assigned by the
 * store (or the database default) — callers do not provide it.
 */
export type TranslationInsert = {
  readonly tenantId: TenantId;
  readonly messageId: MessageId;
  readonly targetLanguage: LangCode;
  readonly translationVersion: TranslationVersion;
  readonly translatedText: string;
  readonly provider: string;
  readonly model: string | null;
  readonly providerRef: string | null;
};

/**
 * TranslationStore — structural type. Exactly two operations.
 *
 * `load` returns the record when present, `null` when absent, and
 * throws a `TranslationStoreError` on structural or identity failure.
 *
 * `saveServerSide` requires the trusted server-side composition (the
 * adapter builds it with a `service_role` capability at construction
 * time). Returns the surviving row semantically:
 *   - if no row exists, inserts and returns the new row;
 *   - if an identical row already exists, returns the stored row
 *     (silent success on retry);
 *   - if a DIFFERENT row already exists for the same PK, returns the
 *     surviving row and does not overwrite (`conflict` semantics are
 *     resolved in favour of the winner).
 */
export type TranslationStore = {
  load(
    ctx: TenantContext,
    messageId: MessageId,
    targetLanguage: LangCode,
    translationVersion: TranslationVersion,
  ): Promise<TranslationRecord | null>;
  saveServerSide(
    ctx: TenantContext,
    record: TranslationInsert,
  ): Promise<TranslationRecord>;
};

export const TRANSLATION_STORE_OPERATIONS = Object.freeze([
  "load",
  "saveServerSide",
] as const);

export type TranslationStoreOperation = typeof TRANSLATION_STORE_OPERATIONS[number];

// Re-exports for consumers that only import from this file.
export type {
  VerifiedIdentity,
  TenantContext,
  TranslationStoreError,
  TranslationStoreErrorCode,
};
