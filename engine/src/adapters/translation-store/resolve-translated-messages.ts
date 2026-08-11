/**
 * SPABLA Engine — GET orchestrator for the visible bilingual chat
 * (Fase 9 · Hito 9.1.1).
 *
 * Composes `PersistencePort.listMessages` with `TranslationStore.load` /
 * `saveServerSide` and a provider callback to produce a page of
 * translated messages while calling the underlying provider AT MOST
 * ONCE per new `(tenantId, messageId, targetLanguage, translationVersion)`
 * combination:
 *
 *   1. If the message is already in the target language → passthrough,
 *      no store lookup, no provider call.
 *   2. Otherwise look up the translation in the store; if present,
 *      serve it.
 *   3. If missing, translate — under a local single-flight guard so
 *      concurrent requests within the same process share the one call
 *      — and persist the result server-side. Return the persisted row.
 *
 * The orchestrator NEVER modifies the source message and never fails
 * the whole page because one translation failed: the failed item is
 * returned with `translation === null` + a symbolic reason. Success
 * items always carry `translation` non-null.
 *
 * `PersistencePort` is NOT modified by this hito; this file consumes
 * both ports through their existing structural contracts.
 *
 * @internal Not part of the public engine surface.
 */

import type {
  MessagePage,
  MessageRecord,
  PersistencePort,
  TenantContext,
} from "../persistence/port";
import type { LangCode } from "../../types/language";
import type {
  TranslationInsert,
  TranslationRecord,
  TranslationStore,
  TranslationVersion,
} from "./port";
import { runSingleFlight, type SingleFlightMap } from "./single-flight";

export type TranslationOutcomeReason =
  | "empty"
  | "too_long"
  | "provider_unavailable"
  | "provider_error";

export type TranslationProviderResult =
  | {
      readonly ok: true;
      readonly translatedText: string;
      readonly provider: string;
      readonly model?: string | null;
      readonly providerRef?: string | null;
    }
  | {
      readonly ok: false;
      readonly reason: TranslationOutcomeReason;
    };

export type TranslationProvider = (input: {
  readonly text: string;
  readonly from: LangCode;
  readonly to: LangCode;
}) => Promise<TranslationProviderResult>;

export type ResolvedItem = {
  readonly messageId: MessageRecord["messageId"];
  readonly senderId: MessageRecord["senderId"];
  readonly originalText: string;
  readonly originalLanguage: LangCode;
  readonly targetLanguage: LangCode;
  readonly translation: string | null;
  readonly translationError: TranslationOutcomeReason | null;
  readonly translationPassthrough: boolean;
  readonly translationCached: boolean;
  readonly createdAt: string;
};

export type ResolveTranslatedMessagesInput = {
  readonly persistence: PersistencePort;
  readonly translationStore: TranslationStore;
  readonly translate: TranslationProvider;
  readonly tenantContext: TenantContext;
  readonly conversationId: string;
  readonly targetLanguage: LangCode;
  readonly translationVersion: TranslationVersion;
  readonly pageLimit: number;
  readonly singleFlight: SingleFlightMap;
};

export type ResolveTranslatedMessagesResult = {
  readonly items: ReadonlyArray<ResolvedItem>;
  readonly actorId: string;
};

export async function resolveTranslatedMessages(
  input: ResolveTranslatedMessagesInput,
): Promise<ResolveTranslatedMessagesResult> {
  const page: MessagePage = await input.persistence.listMessages(input.tenantContext, {
    conversationId: input.conversationId as MessageRecord["conversationId"],
    limit: input.pageLimit,
    cursor: null,
  });

  const items = await Promise.all(page.items.map((msg) =>
    resolveOne({
      msg,
      translationStore: input.translationStore,
      translate: input.translate,
      tenantContext: input.tenantContext,
      targetLanguage: input.targetLanguage,
      translationVersion: input.translationVersion,
      singleFlight: input.singleFlight,
    }),
  ));

  return {
    items,
    actorId: input.tenantContext.identity.actorId,
  };
}

type ResolveOneInput = {
  readonly msg: MessageRecord;
  readonly translationStore: TranslationStore;
  readonly translate: TranslationProvider;
  readonly tenantContext: TenantContext;
  readonly targetLanguage: LangCode;
  readonly translationVersion: TranslationVersion;
  readonly singleFlight: SingleFlightMap;
};

async function resolveOne(inp: ResolveOneInput): Promise<ResolvedItem> {
  const {
    msg, translationStore, translate, tenantContext, targetLanguage, translationVersion, singleFlight,
  } = inp;

  const base = {
    messageId: msg.messageId,
    senderId: msg.senderId,
    originalText: msg.text,
    originalLanguage: msg.language,
    targetLanguage,
    createdAt: msg.createdAt,
  } as const;

  if (msg.language === targetLanguage) {
    return {
      ...base,
      translation: msg.text,
      translationError: null,
      translationPassthrough: true,
      translationCached: false,
    };
  }

  // 1. Cache lookup — the definitive source once a value exists.
  try {
    const cached = await translationStore.load(
      tenantContext, msg.messageId, targetLanguage, translationVersion,
    );
    if (cached !== null) {
      return {
        ...base,
        translation: cached.translatedText,
        translationError: null,
        translationPassthrough: false,
        translationCached: true,
      };
    }
  } catch {
    // Fall through to provider call — the store is best-effort on read.
  }

  // 2. Miss — translate under single-flight and persist the result.
  const key = singleFlightKey(tenantContext.tenantId, msg.messageId, targetLanguage, translationVersion);
  try {
    const translated: TranslationRecord = await runSingleFlight(singleFlight, key, async () => {
      const outcome = await translate({
        text: msg.text,
        from: msg.language,
        to: targetLanguage,
      });
      if (!outcome.ok) {
        throw providerFailure(outcome.reason);
      }
      const insert: TranslationInsert = {
        tenantId: msg.tenantId,
        messageId: msg.messageId,
        targetLanguage,
        translationVersion,
        translatedText: outcome.translatedText,
        provider: outcome.provider,
        model: outcome.model ?? null,
        providerRef: outcome.providerRef ?? null,
      };
      return translationStore.saveServerSide(tenantContext, insert);
    });
    return {
      ...base,
      translation: translated.translatedText,
      translationError: null,
      translationPassthrough: false,
      translationCached: false,
    };
  } catch (err) {
    const reason = extractProviderReason(err);
    return {
      ...base,
      translation: null,
      translationError: reason,
      translationPassthrough: false,
      translationCached: false,
    };
  }
}

function singleFlightKey(
  tenantId: string,
  messageId: string,
  targetLanguage: string,
  translationVersion: string,
): string {
  return `${tenantId}|${messageId}|${targetLanguage}|${translationVersion}`;
}

type ProviderFailure = { readonly __isProviderFailure: true; readonly reason: TranslationOutcomeReason };

function providerFailure(reason: TranslationOutcomeReason): ProviderFailure {
  return { __isProviderFailure: true, reason };
}

function extractProviderReason(err: unknown): TranslationOutcomeReason {
  if (typeof err === "object" && err !== null && (err as ProviderFailure).__isProviderFailure === true) {
    return (err as ProviderFailure).reason;
  }
  return "provider_error";
}
