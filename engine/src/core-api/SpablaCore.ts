/**
 * SPABLA Core API — SpablaCore.
 *
 * Public facade for every consumer (web / mobile / desktop / SDK / API).
 * Wraps Engine internally; Engine, managers and EventBus are never exposed.
 * Precondition validation via SpablaCoreError before any Engine call.
 * Fase 2 wires the messaging module (createOutgoing / advance / getThread).
 */

import { Engine } from "../engine/Engine.js";
import { defaultNewId } from "../engine/types.js";
import { EventBus, type EventHandler, type Unsubscribe } from "../event-bus/EventBus.js";
import type { EngineEventName } from "../types/events.js";
import type { UUID, Clock, CorrelationId } from "../types/ids.js";
import { asCorrelationId, systemClock } from "../types/ids.js";
import type { CallSession } from "../types/call.js";
import type { ConversationSession } from "../types/conversation.js";
import type { Message, MessageThread } from "../types/message.js";
import type { MessageManager } from "../messaging/MessageManager.js";
import {
  SpablaCoreError,
  type CallFlags,
  type CreateConversationInput,
  type GetMessagesInput,
  type GetMessagesResult,
  type JoinConversationInput,
  type MarkAsReadInput,
  type NotifyIncomingMessageInput,
  type SendMessageInput,
  type SendMessageResult,
  type SpablaCoreConfig,
  type StartCallInput,
  type StartCallResult,
} from "./types.js";

export type SpablaEventName = EngineEventName;
export type SpablaEventHandler<N extends SpablaEventName> = EventHandler<N>;

export class SpablaCore {
  private readonly engine: Engine;
  private readonly bus: EventBus;
  private readonly clock: Clock;
  private readonly newId: () => UUID;
  private readonly messages: MessageManager;
  private readonly flagsByCall: Map<UUID, CallFlags> = new Map();

  constructor(config: SpablaCoreConfig = {}) {
    this.clock = config.clock ?? systemClock();
    this.newId = config.newId ?? defaultNewId;
    // Core owns the bus; Engine is constructed with it so Engine + Core events
    // share one channel. External code reaches the bus only via subscribe().
    this.bus = new EventBus();
    this.engine = new Engine({ clock: this.clock, newId: this.newId, bus: this.bus });
    this.messages = this.engine.getMessageManager();
  }

  // ── Conversation ────────────────────────────────────────────────────────

  /** Sets up the local participant and loads the conversation. */
  createConversation(input: CreateConversationInput): void {
    if (!input?.conversationId) throw new SpablaCoreError("missing-conversationId");
    if (!input.local?.userId) throw new SpablaCoreError("missing-local-userId");
    this.engine.addParticipant({
      userId: input.local.userId,
      displayName: input.local.displayName,
      language: input.local.language,
      role: "local",
    });
    this.engine.loadConversation(input.conversationId);
  }

  /** Adds a remote participant to the loaded conversation. */
  joinConversation(input: JoinConversationInput): void {
    if (!this.engine.snapshotConversation()) {
      throw new SpablaCoreError("no-conversation-loaded");
    }
    if (!input?.remote?.userId) throw new SpablaCoreError("missing-remote-userId");
    this.engine.addParticipant({
      userId: input.remote.userId,
      displayName: input.remote.displayName,
      language: input.remote.language,
      role: "remote",
    });
  }

  /** Removes a participant. Idempotent for unknown ids? No — throws. */
  leaveConversation(userId: UUID): void {
    if (!userId) throw new SpablaCoreError("missing-userId");
    this.engine.removeParticipant(userId);
  }

  // ── Messaging ───────────────────────────────────────────────────────────

  /** Creates an outgoing Message and advances it to "sent". No network. */
  sendMessage(input: SendMessageInput): SendMessageResult {
    const conv = this.engine.snapshotConversation();
    if (!conv) throw new SpablaCoreError("no-conversation-loaded");
    const text = (input?.text ?? "").trim();
    if (text.length === 0) throw new SpablaCoreError("empty-message");
    const messageId = this.newId();
    const cid = this.correlation();
    this.messages.createOutgoing(
      {
        messageId,
        conversationId: conv.id,
        senderId: conv.localParticipant.userId,
        text,
        language: conv.localParticipant.language,
      },
      cid,
    );
    this.messages.advance(messageId, "sent", cid);
    return Object.freeze({ messageId });
  }

  /** Inject an incoming Message (transport-adapter target in Fase 4+). */
  notifyIncomingMessage(input: NotifyIncomingMessageInput): SendMessageResult {
    const conv = this.engine.snapshotConversation();
    if (!conv) throw new SpablaCoreError("no-conversation-loaded");
    if (!conv.remoteParticipant) throw new SpablaCoreError("no-remote-participant");
    if (input?.senderId !== conv.remoteParticipant.userId) {
      throw new SpablaCoreError("sender-not-remote", { senderId: input?.senderId });
    }
    const text = (input?.text ?? "").trim();
    if (text.length === 0) throw new SpablaCoreError("empty-message");
    const messageId = input.messageId ?? this.newId();
    this.messages.createIncoming(
      {
        messageId,
        conversationId: conv.id,
        senderId: input.senderId,
        text,
        language: input.language ?? conv.remoteParticipant.language,
        ...(input.initialStatus !== undefined ? { initialStatus: input.initialStatus } : {}),
      },
      this.correlation(),
    );
    return Object.freeze({ messageId });
  }

  /** History of messages in the loaded conversation. */
  getMessages(input: GetMessagesInput = {}): GetMessagesResult {
    const conv = this.engine.snapshotConversation();
    if (!conv) throw new SpablaCoreError("no-conversation-loaded");
    let messages: ReadonlyArray<Message> = this.messages.list();
    if (input.before !== undefined) {
      const cutoff = input.before;
      messages = Object.freeze(messages.filter((m) => m.createdAt < cutoff));
    }
    if (input.limit !== undefined && messages.length > input.limit) {
      messages = Object.freeze(messages.slice(messages.length - input.limit));
    }
    const participants = conv.participants.map((p) => p.userId);
    return Object.freeze({
      messages,
      thread: this.messages.getThread(participants),
    });
  }

  /** Mark an INCOMING message as read (outgoing reads come from peer). */
  markAsRead(input: MarkAsReadInput): void {
    const conv = this.engine.snapshotConversation();
    if (!conv) throw new SpablaCoreError("no-conversation-loaded");
    const msg = this.messages.get(input.messageId);
    if (!msg) throw new SpablaCoreError("unknown-messageId", { messageId: input.messageId });
    if (msg.direction !== "incoming") {
      throw new SpablaCoreError("cannot-mark-outgoing-as-read", { messageId: input.messageId });
    }
    this.messages.advance(input.messageId, "read", this.correlation());
  }

  // ── Call control ────────────────────────────────────────────────────────

  startCall(input: StartCallInput = {}): StartCallResult {
    const conv = this.engine.snapshotConversation();
    if (!conv) throw new SpablaCoreError("no-conversation-loaded");
    if (!conv.remoteParticipant) throw new SpablaCoreError("no-remote-participant");
    if (!conv.languagePair) throw new SpablaCoreError("no-language-pair");
    const mode = input?.mode ?? "voice";
    const callId = this.engine.initiateCall({ mode });
    this.flagsByCall.set(callId, {
      videoEnabled: mode === "video",
      interpreterEnabled: false,
    });
    return Object.freeze({ callId });
  }

  acceptCall(callId: UUID): void {
    this.requireCall(callId);
    this.engine.acceptCall(callId);
    if (!this.flagsByCall.has(callId)) {
      this.flagsByCall.set(callId, { videoEnabled: false, interpreterEnabled: false });
    }
  }

  rejectCall(callId: UUID): void {
    this.requireCall(callId);
    this.engine.rejectCall(callId);
    this.flagsByCall.delete(callId);
  }

  endCall(callId: UUID): void {
    this.requireCall(callId);
    this.engine.endCall(callId);
    this.flagsByCall.delete(callId);
  }

  // ── Video toggle ────────────────────────────────────────────────────────

  startVideo(callId: UUID): void {
    const flags = this.requireActiveCall(callId);
    if (flags.videoEnabled) return; // idempotent
    this.flagsByCall.set(callId, { ...flags, videoEnabled: true });
    this.emitCore({ name: "video.enabled", callId });
  }

  stopVideo(callId: UUID): void {
    const flags = this.requireActiveCall(callId);
    if (!flags.videoEnabled) return; // idempotent
    this.flagsByCall.set(callId, { ...flags, videoEnabled: false });
    this.emitCore({ name: "video.disabled", callId });
  }

  // ── Interpreter mode toggle ─────────────────────────────────────────────

  startInterpreter(callId: UUID): void {
    const flags = this.requireActiveCall(callId);
    if (flags.interpreterEnabled) return;
    this.flagsByCall.set(callId, { ...flags, interpreterEnabled: true });
    this.emitCore({ name: "interpreter.enabled", callId });
  }

  stopInterpreter(callId: UUID): void {
    const flags = this.requireActiveCall(callId);
    if (!flags.interpreterEnabled) return;
    this.flagsByCall.set(callId, { ...flags, interpreterEnabled: false });
    this.emitCore({ name: "interpreter.disabled", callId });
  }

  // ── Subscription + read-only snapshots ──────────────────────────────────

  subscribe<N extends SpablaEventName>(name: N, handler: SpablaEventHandler<N>): Unsubscribe {
    return this.bus.on(name, handler);
  }
  getConversation(): ConversationSession | undefined { return this.engine.snapshotConversation(); }
  getCall(callId: UUID): CallSession | undefined { return this.engine.snapshotCall(callId); }
  getCallFlags(callId: UUID): CallFlags | undefined { return this.flagsByCall.get(callId); }
  getMessage(messageId: UUID): Message | undefined { return this.messages.get(messageId); }
  getThread(): MessageThread | undefined {
    const conv = this.engine.snapshotConversation();
    return conv ? this.messages.getThread(conv.participants.map((p) => p.userId)) : undefined;
  }

  // ── Internals (not exported) ────────────────────────────────────────────

  private requireCall(callId: UUID): CallSession {
    if (!callId) throw new SpablaCoreError("missing-callId");
    const call = this.engine.snapshotCall(callId);
    if (!call) throw new SpablaCoreError("unknown-callId", { callId });
    return call;
  }

  private requireActiveCall(callId: UUID): CallFlags {
    const call = this.requireCall(callId);
    if (call.state !== "accepted") {
      throw new SpablaCoreError("call-not-active", { callId, state: call.state });
    }
    return (
      this.flagsByCall.get(callId) ?? { videoEnabled: false, interpreterEnabled: false }
    );
  }

  private emitCore(
    partial:
      | { name: "video.enabled"; callId: UUID }
      | { name: "video.disabled"; callId: UUID }
      | { name: "interpreter.enabled"; callId: UUID }
      | { name: "interpreter.disabled"; callId: UUID },
  ): void {
    const correlationId = this.correlation();
    const meta = { ts: this.clock.nowISO(), correlationId };
    this.bus.emit({ ...partial, meta });
  }

  private correlation(): CorrelationId {
    return asCorrelationId(this.newId() as string);
  }
}
