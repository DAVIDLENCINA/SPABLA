/**
 * SPABLA Engine — Translation contract (Fase 4).
 *
 * Session + Request snapshots plus the TranslationAdapter interface that any
 * provider (OpenAI, Gemini, DeepL, Claude, in-house model) must implement.
 * The Engine itself never imports a concrete provider — the adapter is
 * looked up at runtime from the AdapterRegistry.
 */

import type { UUID, ISOTimestamp } from "./ids.js";
import type { LangCode, LanguagePair } from "./language.js";
import type { AdapterBase } from "./adapters.js";

// ── State machines ─────────────────────────────────────────────────────────

export type TranslationSessionState =
  | "idle"          // transient after createSession
  | "active"        // accepting requests
  | "completed"     // terminal — stop() ran
  | "failed";       // terminal — critical failure

export type TranslationRequestState =
  | "created"       // registered, not yet dispatched
  | "dispatched"    // adapter.translate call in-flight
  | "completed"     // adapter resolved (terminal)
  | "failed";       // adapter rejected OR precondition failed (terminal)

export const TERMINAL_TRANSLATION_SESSION_STATES: ReadonlySet<TranslationSessionState> =
  new Set<TranslationSessionState>(["completed", "failed"]);

export const TERMINAL_TRANSLATION_REQUEST_STATES: ReadonlySet<TranslationRequestState> =
  new Set<TranslationRequestState>(["completed", "failed"]);

export function isTerminalTranslationSessionState(s: TranslationSessionState): boolean {
  return TERMINAL_TRANSLATION_SESSION_STATES.has(s);
}

export function isTerminalTranslationRequestState(s: TranslationRequestState): boolean {
  return TERMINAL_TRANSLATION_REQUEST_STATES.has(s);
}

// ── Result + Error ─────────────────────────────────────────────────────────

export type TranslationResult = Readonly<{
  requestId: UUID;
  translatedText: string;
  targetLanguage: LangCode;
  detectedSourceLanguage: LangCode | undefined;
  providerDisplayName: string;
  receivedAt: ISOTimestamp;
}>;

export type TranslationError = Readonly<{
  requestId: UUID;
  code: string;      // "no-adapter" | "provider-rejected" | "session-terminal" | ...
  message: string;
  receivedAt: ISOTimestamp;
}>;

// ── Snapshots ──────────────────────────────────────────────────────────────

export type TranslationSession = Readonly<{
  id: UUID;
  callSessionId: UUID;
  languagePair: LanguagePair;
  state: TranslationSessionState;
  createdAt: ISOTimestamp;
  startedAt: ISOTimestamp | undefined;
  endedAt: ISOTimestamp | undefined;
  failedAt: ISOTimestamp | undefined;
  failureReason: string | undefined;
  requestCount: number;
  completedCount: number;
  failedCount: number;
}>;

export type TranslationRequest = Readonly<{
  id: UUID;
  sessionId: UUID;
  callSessionId: UUID;
  sourceText: string;
  sourceLanguage: LangCode;
  targetLanguage: LangCode;
  sourceTurnId: UUID | undefined;
  state: TranslationRequestState;
  createdAt: ISOTimestamp;
  dispatchedAt: ISOTimestamp | undefined;
  completedAt: ISOTimestamp | undefined;
  failedAt: ISOTimestamp | undefined;
  result: TranslationResult | undefined;
  error: TranslationError | undefined;
}>;

// ── Adapter contract ───────────────────────────────────────────────────────

export type TranslationAdapterRequest = Readonly<{
  requestId: UUID;
  text: string;
  from: LangCode;
  to: LangCode;
}>;

export type TranslationAdapterResponse = Readonly<{
  translatedText: string;
  detectedSourceLanguage?: LangCode;
}>;

/**
 * Concrete shape any translation provider must implement. Extends the Fase 1.5
 * `AdapterBase<"mt">` marker with a bounded async `translate` operation.
 *
 * Requirements:
 *  - MUST resolve or reject the returned Promise in finite time.
 *  - MUST return text in the requested `to` language.
 *  - MUST NOT know the EventBus, ConversationSession, or any Engine internals.
 */
export interface TranslationAdapter extends AdapterBase<"mt"> {
  readonly displayName: string;
  translate(request: TranslationAdapterRequest): Promise<TranslationAdapterResponse>;
}
