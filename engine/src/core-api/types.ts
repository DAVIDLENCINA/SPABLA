/**
 * SPABLA Core API — public-facing input/output types.
 *
 * Kept separate from SpablaCore.ts to respect the 300-line cap and to give
 * external consumers a stable import surface for method arguments.
 */

import type { UUID, ISOTimestamp } from "../types/ids.js";
import type { LangCode, LanguagePair } from "../types/language.js";
import type { CallMode } from "../types/call.js";
import type { Message, MessageThread } from "../types/message.js";
import type { STTSpeaker } from "../types/stt.js";

/** Participant identity + language, as it enters the Core API. */
export type ParticipantInput = Readonly<{
  userId: UUID;
  displayName: string;
  language: LangCode;
}>;

/** Argument for `createConversation`. */
export type CreateConversationInput = Readonly<{
  conversationId: UUID;
  local: ParticipantInput;
}>;

/** Argument for `joinConversation`. */
export type JoinConversationInput = Readonly<{
  remote: ParticipantInput;
}>;

/** Argument for `sendMessage`. */
export type SendMessageInput = Readonly<{
  text: string;
}>;

/** Argument for `startCall`. Mode defaults to "voice". */
export type StartCallInput = Readonly<{
  mode?: CallMode;
}>;

/** Return of `startCall`. */
export type StartCallResult = Readonly<{
  callId: UUID;
}>;

/** Return of `sendMessage`. */
export type SendMessageResult = Readonly<{
  messageId: UUID;
}>;

/** Read-only flags tracked per call by the Core API layer. */
export type CallFlags = Readonly<{
  videoEnabled: boolean;
  interpreterEnabled: boolean;
}>;

/** SpablaCore constructor config. */
export type SpablaCoreConfig = Readonly<{
  clock?: import("../types/ids.js").Clock;
  newId?: () => UUID;
}>;

/** Argument for `getMessages`. */
export type GetMessagesInput = Readonly<{
  /** Maximum number of messages to return (most recent kept if truncating). */
  limit?: number;
  /** Only include messages with `createdAt < before`. */
  before?: ISOTimestamp;
}>;

/** Return of `getMessages`. */
export type GetMessagesResult = Readonly<{
  messages: ReadonlyArray<Message>;
  thread: MessageThread | undefined;
}>;

/** Argument for `markAsRead`. */
export type MarkAsReadInput = Readonly<{
  messageId: UUID;
}>;

/** Argument for `notifyIncomingMessage`. */
export type NotifyIncomingMessageInput = Readonly<{
  messageId?: UUID;
  senderId: UUID;
  text: string;
  language?: LangCode | null;
  /** Initial status for the incoming message. Default: `"sent"`. */
  initialStatus?: "sent" | "delivered";
}>;

// ── STT (fase 3) ────────────────────────────────────────────────────────────

export type StartSTTInput = Readonly<{ callId: UUID; speaker: STTSpeaker }>;
export type StartSTTResult = Readonly<{ sessionId: UUID }>;
export type StopSTTInput = Readonly<{ sessionId: UUID }>;
export type PushAudioChunkInput = Readonly<{ sessionId: UUID; chunk: Uint8Array }>;
export type SimulateSTTPartialInput = Readonly<{ sessionId: UUID; text: string }>;
export type SimulateSTTFinalInput = Readonly<{
  sessionId: UUID; text: string; language?: LangCode | null;
}>;
export type SimulateSTTErrorInput = Readonly<{
  sessionId: UUID; code: string; message: string;
}>;

// ── Translation (fase 4) ────────────────────────────────────────────────────

export type StartTranslationInput = Readonly<{
  callId: UUID;
  /**
   * Optional override. If omitted, the call's own `languagePair` is used.
   * Provide it to open a translation session in the reverse direction of the
   * call (bilingual conversations need one session per direction).
   */
  languagePair?: LanguagePair;
}>;
export type StartTranslationResult = Readonly<{ sessionId: UUID }>;
export type StopTranslationInput = Readonly<{ sessionId: UUID }>;
export type RequestTranslationInput = Readonly<{
  sessionId: UUID;
  text: string;
  sourceLanguage: LangCode;
  sourceTurnId?: UUID;
}>;
export type RequestTranslationResult = Readonly<{ requestId: UUID }>;

// ── TTS (fase 5) ────────────────────────────────────────────────────────────

export type StartTTSInput = Readonly<{
  callId: UUID;
  voice: {
    language: LangCode;
    voiceId: string;
    rate?: number;
    pitch?: number;
  };
}>;
export type StartTTSResult = Readonly<{ sessionId: UUID }>;
export type StopTTSInput = Readonly<{ sessionId: UUID }>;
export type RequestSpeechInput = Readonly<{
  sessionId: UUID;
  text: string;
  language?: LangCode;
  voiceId?: string;
  sourceTranslationRequestId?: UUID;
}>;
export type RequestSpeechResult = Readonly<{ requestId: UUID }>;

/** Typed error thrown by Core-API precondition checks. */
export class SpablaCoreError extends Error {
  public readonly reason: string;
  public readonly details: Record<string, unknown>;
  constructor(reason: string, details: Record<string, unknown> = {}) {
    super(`SpablaCore: ${reason}`);
    this.name = "SpablaCoreError";
    this.reason = reason;
    this.details = details;
  }
}
