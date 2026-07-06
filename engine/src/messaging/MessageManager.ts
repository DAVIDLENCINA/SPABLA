/**
 * SPABLA Engine — MessageManager (Fase 2).
 *
 * Owner of `Message` snapshots and the derived `MessageThread`. Enforces the
 * MessageStatus state machine and emits the lifecycle events. Purely
 * in-memory in Fase 2 — persistence adapters arrive in Fase 7 without
 * touching this module.
 *
 * Events emitted:
 *   message.created      (outgoing only)
 *   message.sent         (outgoing sent OR incoming birthed)
 *   message.delivered    (advance to delivered)
 *   message.read         (advance to read)
 *   message.failed       (fail from any non-terminal)
 *
 * Ownership rules:
 *  - `participants` in `MessageThread` is filled by the caller (SpablaCore)
 *    from the ConversationSession snapshot; MessageManager does not depend
 *    on ParticipantManager to stay decoupled.
 *  - The thread `id` equals `conversationId` in V2 (product decision 1-a-1).
 */

import type { Clock, CorrelationId, UUID } from "../types/ids.js";
import type { LangCode } from "../types/language.js";
import type { EventBus } from "../event-bus/EventBus.js";
import {
  isTerminalMessageStatus,
  type Message,
  type MessageDirection,
  type MessageStatus,
  type MessageThread,
} from "../types/message.js";
import { messageStatusMachine } from "./message-status-machine.js";

export class MessageManagerError extends Error {
  public readonly invariant: string;
  public readonly details: Record<string, unknown>;
  constructor(invariant: string, details: Record<string, unknown> = {}) {
    super(`Message invariant violated: ${invariant}`);
    this.name = "MessageManagerError";
    this.invariant = invariant;
    this.details = details;
  }
}

export type CreateOutgoingInput = Readonly<{
  messageId: UUID;
  conversationId: UUID;
  senderId: UUID;
  text: string;
  language: LangCode | null;
}>;

export type CreateIncomingInput = Readonly<{
  messageId: UUID;
  conversationId: UUID;
  senderId: UUID;
  text: string;
  language: LangCode | null;
  /** Initial status for an incoming message. Default: `"sent"`. */
  initialStatus?: "sent" | "delivered";
}>;

export class MessageManager {
  private readonly bus: EventBus;
  private readonly clock: Clock;
  private readonly messages: Map<UUID, Message> = new Map();
  private readonly order: UUID[] = [];
  private threadCreatedAt: import("../types/ids.js").ISOTimestamp | undefined = undefined;
  private threadConversationId: UUID | undefined = undefined;

  constructor(bus: EventBus, clock: Clock) {
    this.bus = bus;
    this.clock = clock;
  }

  // ── Creation ─────────────────────────────────────────────────────────────

  /** Create an outgoing message in `created`. Emits `message.created`. */
  createOutgoing(input: CreateOutgoingInput, cid: CorrelationId): Message {
    this.assertNoDuplicate(input.messageId);
    const now = this.clock.nowISO();
    const msg = this.freeze(this.baseMessage(input, "outgoing", "created", now));
    this.store(msg);
    this.bus.emit({
      name: "message.created",
      message: msg,
      meta: { ts: now, correlationId: cid },
    });
    return msg;
  }

  /**
   * Create an incoming message. Initial status defaults to `"sent"`. When
   * initial is `"delivered"`, emits `message.sent` first then advances and
   * emits `message.delivered` to keep the causal chain observable.
   */
  createIncoming(input: CreateIncomingInput, cid: CorrelationId): Message {
    this.assertNoDuplicate(input.messageId);
    const now = this.clock.nowISO();
    const initial = input.initialStatus ?? "sent";
    const base = this.baseMessage(input, "incoming", "sent", now);
    const asSent = this.freeze({ ...base, sentAt: now });
    this.store(asSent);
    this.bus.emit({
      name: "message.sent",
      message: asSent,
      meta: { ts: now, correlationId: cid },
    });
    if (initial === "delivered") {
      const advanced = this.freeze({ ...asSent, status: "delivered", deliveredAt: now });
      this.messages.set(advanced.id, advanced);
      this.bus.emit({
        name: "message.delivered",
        message: advanced,
        previousStatus: "sent" as MessageStatus,
        meta: { ts: now, correlationId: cid },
      });
      return advanced;
    }
    return asSent;
  }

  // ── Transitions ──────────────────────────────────────────────────────────

  /**
   * Advance a message to a non-terminal-error next status. `to` must be
   * `sent | delivered | read`. Use `fail()` to move to `failed`.
   */
  advance(messageId: UUID, to: MessageStatus, cid: CorrelationId): Message {
    if (to === "failed" || to === "created") {
      throw new MessageManagerError("advance-invalid-target", { messageId, to });
    }
    const current = this.require(messageId);
    messageStatusMachine.assertTransition(current.status, to);
    const now = this.clock.nowISO();
    const next = this.freeze({
      ...current,
      status: to,
      sentAt: to === "sent" ? now : current.sentAt,
      deliveredAt: to === "delivered" ? now : current.deliveredAt,
      readAt: to === "read" ? now : current.readAt,
    });
    this.messages.set(messageId, next);
    this.emitTransition(next, current.status, cid);
    return next;
  }

  /** Move to `failed`, recording the failed stage and reason. */
  fail(messageId: UUID, reason: string, cid: CorrelationId): Message {
    const current = this.require(messageId);
    if (isTerminalMessageStatus(current.status)) {
      throw new MessageManagerError("cannot-fail-terminal", { messageId, status: current.status });
    }
    messageStatusMachine.assertTransition(current.status, "failed");
    const now = this.clock.nowISO();
    const next = this.freeze({
      ...current,
      status: "failed" as MessageStatus,
      failedAt: now,
      failedStage: current.status,
      failureReason: reason,
    });
    this.messages.set(messageId, next);
    this.bus.emit({
      name: "message.failed",
      message: next,
      stage: current.status,
      reason,
      meta: { ts: now, correlationId: cid },
    });
    return next;
  }

  // ── Queries ──────────────────────────────────────────────────────────────

  get(messageId: UUID): Message | undefined {
    return this.messages.get(messageId);
  }

  /** Chronological order by createdAt (insertion order in V2). */
  list(): ReadonlyArray<Message> {
    return Object.freeze(this.order.map((id) => this.messages.get(id)!) as Message[]);
  }

  listByDirection(direction: MessageDirection): ReadonlyArray<Message> {
    return Object.freeze(this.list().filter((m) => m.direction === direction) as Message[]);
  }

  /**
   * Derived thread snapshot. Caller supplies `participants` (from
   * ConversationSession). Returns undefined until the first message exists.
   */
  getThread(participants: ReadonlyArray<UUID>): MessageThread | undefined {
    if (!this.threadConversationId || !this.threadCreatedAt) return undefined;
    return Object.freeze({
      id: this.threadConversationId,
      conversationId: this.threadConversationId,
      participants: Object.freeze([...participants]),
      messageIds: Object.freeze([...this.order]),
      createdAt: this.threadCreatedAt,
    });
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private assertNoDuplicate(messageId: UUID): void {
    if (this.messages.has(messageId)) {
      throw new MessageManagerError("duplicate-messageId", { messageId });
    }
  }

  private require(messageId: UUID): Message {
    const m = this.messages.get(messageId);
    if (!m) throw new MessageManagerError("unknown-messageId", { messageId });
    return m;
  }

  private baseMessage(
    input: Readonly<{
      messageId: UUID;
      conversationId: UUID;
      senderId: UUID;
      text: string;
      language: LangCode | null;
    }>,
    direction: MessageDirection,
    status: MessageStatus,
    createdAt: import("../types/ids.js").ISOTimestamp,
  ): Message {
    return {
      id: input.messageId,
      conversationId: input.conversationId,
      threadId: input.conversationId,
      senderId: input.senderId,
      text: input.text,
      language: input.language,
      direction,
      status,
      createdAt,
      sentAt: undefined,
      deliveredAt: undefined,
      readAt: undefined,
      failedAt: undefined,
      failedStage: undefined,
      failureReason: undefined,
    };
  }

  private freeze(m: Message): Message {
    return Object.freeze({ ...m });
  }

  private store(m: Message): void {
    this.messages.set(m.id, m);
    this.order.push(m.id);
    if (this.threadCreatedAt === undefined) {
      this.threadCreatedAt = m.createdAt;
      this.threadConversationId = m.conversationId;
    }
  }

  private emitTransition(next: Message, previousStatus: MessageStatus, cid: CorrelationId): void {
    const meta = { ts: this.clock.nowISO(), correlationId: cid };
    if (next.status === "sent") {
      this.bus.emit({ name: "message.sent", message: next, meta });
    } else if (next.status === "delivered") {
      this.bus.emit({ name: "message.delivered", message: next, previousStatus, meta });
    } else if (next.status === "read") {
      this.bus.emit({ name: "message.read", message: next, previousStatus, meta });
    }
  }
}
