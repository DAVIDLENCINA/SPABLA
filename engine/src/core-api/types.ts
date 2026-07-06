/**
 * SPABLA Core API — public-facing input/output types.
 *
 * Kept separate from SpablaCore.ts to respect the 300-line cap and to give
 * external consumers a stable import surface for method arguments.
 */

import type { UUID, ISOTimestamp } from "../types/ids.js";
import type { LangCode } from "../types/language.js";
import type { CallMode } from "../types/call.js";
import type { Message, MessageThread } from "../types/message.js";

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
