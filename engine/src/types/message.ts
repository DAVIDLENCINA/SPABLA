/**
 * SPABLA Engine — Message contract (Fase 2).
 *
 * A `Message` is one text unit exchanged in a conversation. Outgoing messages
 * originate from the local participant; incoming ones arrive from the remote
 * peer via the transport layer (Fase 4+; in Fase 2 the arrival is simulated
 * by `notifyIncomingMessage`).
 *
 * Snapshots are immutable. Consumers receive them through events emitted by
 * MessageManager (`message.created`, `.sent`, `.delivered`, `.read`,
 * `.failed`). Direct mutation is impossible — every transition produces a
 * new frozen snapshot.
 *
 * V2 is 1-a-1: every conversation has exactly one MessageThread whose
 * `id === conversationId`. When V3 introduces groups, `threadId` may diverge.
 */

import type { UUID, ISOTimestamp } from "./ids.js";
import type { LangCode } from "./language.js";

/** Whether the local participant authored the message or received it. */
export type MessageDirection = "outgoing" | "incoming";

/** Lifecycle status of a message. Terminals: `read`, `failed`. */
export type MessageStatus =
  | "created"    // outgoing message just constructed, not yet acknowledged locally
  | "sent"       // transport confirmed dispatch (or incoming just arrived)
  | "delivered"  // peer confirmed receipt
  | "read"       // peer confirmed reading (terminal)
  | "failed";    // failure at any stage (terminal)

export const TERMINAL_MESSAGE_STATUSES: ReadonlySet<MessageStatus> = new Set<MessageStatus>([
  "read",
  "failed",
]);

export function isTerminalMessageStatus(status: MessageStatus): boolean {
  return TERMINAL_MESSAGE_STATUSES.has(status);
}

/** Immutable per-message snapshot. */
export type Message = Readonly<{
  id: UUID;
  conversationId: UUID;
  /** In V2, `threadId === conversationId`. Kept as a distinct field for V3+. */
  threadId: UUID;
  senderId: UUID;
  text: string;
  language: LangCode | null;
  direction: MessageDirection;
  status: MessageStatus;
  createdAt: ISOTimestamp;
  sentAt: ISOTimestamp | undefined;
  deliveredAt: ISOTimestamp | undefined;
  readAt: ISOTimestamp | undefined;
  failedAt: ISOTimestamp | undefined;
  /** Status that was current at the moment `failed` was recorded. */
  failedStage: MessageStatus | undefined;
  failureReason: string | undefined;
}>;

/**
 * Immutable thread snapshot. `messageIds` are ordered chronologically by
 * `Message.createdAt`. `participants` list is composed at snapshot time by
 * the caller (SpablaCore) from the ConversationSession.
 */
export type MessageThread = Readonly<{
  id: UUID;
  conversationId: UUID;
  participants: ReadonlyArray<UUID>;
  messageIds: ReadonlyArray<UUID>;
  createdAt: ISOTimestamp;
}>;
