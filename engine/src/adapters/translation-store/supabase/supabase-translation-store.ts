/**
 * SPABLA Engine — SupabaseTranslationStore (Fase 9 · Hito 9.1.1).
 *
 * Productive adapter for the internal `TranslationStore` port against
 * `spabla_v2.message_translations`. Explicitly independent of
 * `SupabasePersistence`: no shared class, no method reuse, no imports
 * between adapters. The two subdomains own their own SQL + their own
 * error mapping.
 *
 * Capabilities model:
 *  - `authenticated` — Supabase client carrying the actor's JWT. Used
 *    exclusively for `load` (SELECT under RLS). Sub === actor.
 *  - `privileged` — Supabase client built with `service_role`. Used
 *    exclusively for `saveServerSide` (INSERT). Never exposed to the
 *    client bundle.
 *
 * Identity coherence: both operations probe `authenticated.auth.getUser()`
 * once per call and compare against `ctx.identity.actorId`. A divergence
 * fails closed with `identity_invalid` before any SELECT or INSERT.
 *
 * @internal Not part of the public engine surface.
 */

import type {
  PostgrestError,
  SupabaseClient,
} from "@supabase/supabase-js";

import type {
  MessageId,
  TenantContext,
  TranslationInsert,
  TranslationRecord,
  TranslationStore,
  TranslationVersion,
} from "../port";
import {
  translationStoreError,
  translationStoreErrorWithRetry,
  type TranslationStoreError,
} from "../errors";
import { asISOTimestamp, asUUID } from "../../../types/ids";
import { isLangCode, type LangCode } from "../../../types/language";
import type { ActorId } from "../../persistence/port";

const TABLE = "message_translations" as const;
const SCHEMA = "spabla_v2" as const;
const COLUMNS =
  "tenant_id,message_id,target_language,translation_version,translated_text,provider,model,provider_ref,created_at" as const;

function translateAuthTransportOrIdentity(raw: unknown): TranslationStoreError {
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
    return translationStoreErrorWithRetry(
      "unavailable",
      "authentication service unavailable",
      true,
    );
  }
  return translationStoreError(
    "identity_invalid",
    "authenticated client has no valid session",
  );
}

type TranslationRow = {
  readonly tenant_id: string;
  readonly message_id: string;
  readonly target_language: string;
  readonly translation_version: string;
  readonly translated_text: string;
  readonly provider: string;
  readonly model: string | null;
  readonly provider_ref: string | null;
  readonly created_at: string;
};

export type SupabaseTranslationStoreCapabilities = {
  /** Client carrying the actor's JWT (`authenticated` role). */
  readonly authenticated: SupabaseClient;
  /** Client with `service_role`. Required for `saveServerSide`. */
  readonly privileged: SupabaseClient;
};

export class SupabaseTranslationStore implements TranslationStore {
  private readonly authenticated: SupabaseClient;
  private readonly privileged: SupabaseClient;

  constructor(capabilities: SupabaseTranslationStoreCapabilities) {
    if (!capabilities || typeof capabilities !== "object") {
      throw translationStoreError(
        "unauthorized",
        "SupabaseTranslationStore: capabilities object required",
      );
    }
    if (!capabilities.authenticated) {
      throw translationStoreError(
        "unauthorized",
        "SupabaseTranslationStore: authenticated client required",
      );
    }
    if (!capabilities.privileged) {
      throw translationStoreError(
        "unauthorized",
        "SupabaseTranslationStore: privileged client required",
      );
    }
    this.authenticated = capabilities.authenticated;
    this.privileged = capabilities.privileged;
  }

  async load(
    ctx: TenantContext,
    messageId: MessageId,
    targetLanguage: LangCode,
    translationVersion: TranslationVersion,
  ): Promise<TranslationRecord | null> {
    this.assertVersion(translationVersion);
    this.assertTargetLanguage(targetLanguage);
    await this.assertIdentity(ctx);
    const { data, error } = await this.authenticated
      .schema(SCHEMA)
      .from(TABLE)
      .select(COLUMNS)
      .eq("tenant_id", ctx.tenantId)
      .eq("message_id", messageId)
      .eq("target_language", targetLanguage)
      .eq("translation_version", translationVersion)
      .maybeSingle();
    if (error) {
      throw this.translatePostgrestError(error);
    }
    if (data === null || data === undefined) return null;
    return this.rowToRecord(data as TranslationRow);
  }

  async saveServerSide(
    ctx: TenantContext,
    record: TranslationInsert,
  ): Promise<TranslationRecord> {
    this.assertVersion(record.translationVersion);
    this.assertTargetLanguage(record.targetLanguage);
    if (typeof record.translatedText !== "string" || record.translatedText.trim().length === 0) {
      throw translationStoreError(
        "constraint_violation",
        "saveServerSide: translatedText must be non-empty",
      );
    }
    if (typeof record.provider !== "string" || record.provider.trim().length === 0) {
      throw translationStoreError(
        "constraint_violation",
        "saveServerSide: provider must be non-empty",
      );
    }
    if (record.tenantId !== ctx.tenantId) {
      throw translationStoreError(
        "tenant_context_invalid",
        "saveServerSide: record.tenantId does not match TenantContext",
      );
    }
    await this.assertIdentity(ctx);

    // Race-safe insert: if a concurrent writer already inserted the same
    // key, the second insert observes a PK conflict and we return the
    // surviving row. This gives deterministic "single winner" semantics
    // without ever overwriting an existing translation.
    const insertResult = await this.privileged
      .schema(SCHEMA)
      .from(TABLE)
      .insert({
        tenant_id: record.tenantId,
        message_id: record.messageId,
        target_language: record.targetLanguage,
        translation_version: record.translationVersion,
        translated_text: record.translatedText,
        provider: record.provider,
        model: record.model,
        provider_ref: record.providerRef,
      })
      .select(COLUMNS)
      .single();

    if (insertResult.error === null && insertResult.data !== null) {
      return this.rowToRecord(insertResult.data as TranslationRow);
    }

    if (insertResult.error) {
      const code = typeof insertResult.error.code === "string" ? insertResult.error.code : "";
      if (code === "23505") {
        // Unique/PK violation → someone else won the race. Serve the
        // surviving row through the privileged client (RLS bypass) so
        // the caller always gets the definitive text.
        const surviving = await this.privileged
          .schema(SCHEMA)
          .from(TABLE)
          .select(COLUMNS)
          .eq("tenant_id", record.tenantId)
          .eq("message_id", record.messageId)
          .eq("target_language", record.targetLanguage)
          .eq("translation_version", record.translationVersion)
          .maybeSingle();
        if (surviving.error === null && surviving.data !== null) {
          return this.rowToRecord(surviving.data as TranslationRow);
        }
        throw translationStoreError(
          "conflict",
          "saveServerSide: concurrent write raced and lost, could not read surviving row",
        );
      }
      throw this.translatePostgrestError(insertResult.error);
    }

    throw translationStoreError(
      "unavailable",
      "saveServerSide: insert returned no row and no error",
    );
  }

  // ────────────────────────────────────────────────────────────────
  // Private helpers
  // ────────────────────────────────────────────────────────────────

  private assertVersion(v: string): void {
    if (typeof v !== "string" || v.trim().length === 0) {
      throw translationStoreError(
        "constraint_violation",
        "translation_version must be non-empty",
      );
    }
  }

  private assertTargetLanguage(v: string): void {
    if (!isLangCode(v)) {
      throw translationStoreError(
        "constraint_violation",
        "target_language is not a recognised LangCode",
      );
    }
  }

  private async assertIdentity(ctx: TenantContext): Promise<void> {
    const observed = await this.probeAuthenticatedActor();
    if (ctx.identity.actorId !== observed) {
      throw translationStoreError(
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
      throw translateAuthTransportOrIdentity(raw);
    }
    if (response.error) {
      throw translateAuthTransportOrIdentity(response.error);
    }
    const uid = response.data?.user?.id;
    if (typeof uid !== "string" || uid.length === 0) {
      throw translationStoreError(
        "identity_invalid",
        "identity probe: authenticated session missing user id",
      );
    }
    return asUUID(uid);
  }

  private rowToRecord(row: TranslationRow): TranslationRecord {
    if (!isLangCode(row.target_language)) {
      throw translationStoreError(
        "constraint_violation",
        "row.target_language is not a recognised LangCode",
      );
    }
    return {
      tenantId: asUUID(row.tenant_id),
      messageId: asUUID(row.message_id),
      targetLanguage: row.target_language,
      translationVersion: row.translation_version,
      translatedText: row.translated_text,
      provider: row.provider,
      model: row.model,
      providerRef: row.provider_ref,
      createdAt: asISOTimestamp(row.created_at),
    };
  }

  private translatePostgrestError(error: PostgrestError): TranslationStoreError {
    const code = typeof error.code === "string" ? error.code : "";
    if (code === "23505") {
      return translationStoreError("conflict", "unique_violation");
    }
    if (code === "23503") {
      return translationStoreError("constraint_violation", "foreign_key_violation");
    }
    if (code === "23514") {
      return translationStoreError("constraint_violation", "check_violation");
    }
    if (code === "42501") {
      return translationStoreError("unauthorized", "insufficient_privilege");
    }
    if (code === "PGRST116") {
      return translationStoreError("not_found", "no rows");
    }
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
      return translationStoreErrorWithRetry(
        "unavailable",
        "transport unavailable",
        true,
      );
    }
    return translationStoreError("constraint_violation", "database error");
  }
}
