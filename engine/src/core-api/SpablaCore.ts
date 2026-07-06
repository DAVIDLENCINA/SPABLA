/**
 * SPABLA Core API — SpablaCore. Public facade for every consumer.
 * Wraps Engine; Engine, managers and EventBus are never exposed. STT
 * command orchestration lives in SttOps (thin delegators from here).
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
import type { STTSession, STTTurn } from "../types/stt.js";
import type { TranslationRequest, TranslationSession } from "../types/translation.js";
import { SttOps } from "./stt-ops.js";
import { TranslationOps } from "./translation-ops.js";
import {
  SpablaCoreError,
  type CallFlags, type CreateConversationInput,
  type GetMessagesInput, type GetMessagesResult,
  type JoinConversationInput, type MarkAsReadInput,
  type NotifyIncomingMessageInput, type PushAudioChunkInput,
  type SendMessageInput, type SendMessageResult,
  type SimulateSTTErrorInput, type SimulateSTTFinalInput, type SimulateSTTPartialInput,
  type SpablaCoreConfig, type StartCallInput, type StartCallResult,
  type StartSTTInput, type StartSTTResult, type StopSTTInput,
  type StartTranslationInput, type StartTranslationResult, type StopTranslationInput,
  type RequestTranslationInput, type RequestTranslationResult,
} from "./types.js";

export type SpablaEventName = EngineEventName;
export type SpablaEventHandler<N extends SpablaEventName> = EventHandler<N>;

export class SpablaCore {
  private readonly engine: Engine;
  private readonly bus: EventBus;
  private readonly clock: Clock;
  private readonly newId: () => UUID;
  private readonly messages: MessageManager;
  private readonly sttOps: SttOps;
  private readonly translationOps: TranslationOps;
  private readonly flagsByCall: Map<UUID, CallFlags> = new Map();

  constructor(config: SpablaCoreConfig = {}) {
    this.clock = config.clock ?? systemClock();
    this.newId = config.newId ?? defaultNewId;
    this.bus = new EventBus();
    this.engine = new Engine({ clock: this.clock, newId: this.newId, bus: this.bus });
    this.messages = this.engine.getMessageManager();
    const cid = () => this.correlation();
    this.sttOps = new SttOps(this.engine, this.engine.getSTTManager(), this.newId, cid);
    this.translationOps = new TranslationOps(
      this.engine, this.engine.getTranslationManager(), this.newId, cid);
  }

  // ── Conversation ────────────────────────────────────────────────────────

  createConversation(input: CreateConversationInput): void {
    if (!input?.conversationId) throw new SpablaCoreError("missing-conversationId");
    if (!input.local?.userId) throw new SpablaCoreError("missing-local-userId");
    const { userId, displayName, language } = input.local;
    this.engine.addParticipant({ userId, displayName, language, role: "local" });
    this.engine.loadConversation(input.conversationId);
  }

  joinConversation(input: JoinConversationInput): void {
    if (!this.engine.snapshotConversation()) throw new SpablaCoreError("no-conversation-loaded");
    if (!input?.remote?.userId) throw new SpablaCoreError("missing-remote-userId");
    const { userId, displayName, language } = input.remote;
    this.engine.addParticipant({ userId, displayName, language, role: "remote" });
  }

  leaveConversation(userId: UUID): void {
    if (!userId) throw new SpablaCoreError("missing-userId");
    this.engine.removeParticipant(userId);
  }

  // ── Messaging ───────────────────────────────────────────────────────────

  sendMessage(input: SendMessageInput): SendMessageResult {
    const conv = this.engine.snapshotConversation();
    if (!conv) throw new SpablaCoreError("no-conversation-loaded");
    const text = (input?.text ?? "").trim();
    if (text.length === 0) throw new SpablaCoreError("empty-message");
    const messageId = this.newId();
    const cid = this.correlation();
    const { userId: senderId, language } = conv.localParticipant;
    this.messages.createOutgoing(
      { messageId, conversationId: conv.id, senderId, text, language }, cid);
    this.messages.advance(messageId, "sent", cid);
    return Object.freeze({ messageId });
  }

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
        messageId, conversationId: conv.id, senderId: input.senderId, text,
        language: input.language ?? conv.remoteParticipant.language,
        ...(input.initialStatus !== undefined ? { initialStatus: input.initialStatus } : {}),
      },
      this.correlation(),
    );
    return Object.freeze({ messageId });
  }

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
    const thread = this.messages.getThread(conv.participants.map((p) => p.userId));
    return Object.freeze({ messages, thread });
  }

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
    this.flagsByCall.set(callId, { videoEnabled: mode === "video", interpreterEnabled: false });
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

  // ── STT (fase 3) — thin delegators to SttOps ────────────────────────────
  startSTT(input: StartSTTInput): StartSTTResult { return this.sttOps.start(input); }
  stopSTT(input: StopSTTInput): void { this.sttOps.stop(input); }
  pushAudioChunk(input: PushAudioChunkInput): void { this.sttOps.pushChunk(input); }
  simulateSTTPartial(input: SimulateSTTPartialInput): void { this.sttOps.simulatePartial(input); }
  simulateSTTFinal(input: SimulateSTTFinalInput): void { this.sttOps.simulateFinal(input); }
  simulateSTTError(input: SimulateSTTErrorInput): void { this.sttOps.simulateError(input); }
  getSTTSession(sid: UUID): STTSession | undefined { return this.sttOps.getSession(sid); }
  getSTTTurn(tid: UUID): STTTurn | undefined { return this.sttOps.getTurn(tid); }
  listActiveSTTSessions(cid: UUID): ReadonlyArray<STTSession> { return this.sttOps.listActive(cid); }

  // ── Translation (fase 4) — thin delegators to TranslationOps ────────────
  startTranslation(i: StartTranslationInput): StartTranslationResult { return this.translationOps.start(i); }
  stopTranslation(i: StopTranslationInput): void { this.translationOps.stop(i); }
  requestTranslation(i: RequestTranslationInput): RequestTranslationResult { return this.translationOps.request(i); }
  getTranslationSession(sid: UUID): TranslationSession | undefined { return this.translationOps.getSession(sid); }
  getTranslationRequest(rid: UUID): TranslationRequest | undefined { return this.translationOps.getRequest(rid); }
  listActiveTranslationSessions(cid: UUID): ReadonlyArray<TranslationSession> { return this.translationOps.listActive(cid); }

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
    return this.flagsByCall.get(callId) ?? { videoEnabled: false, interpreterEnabled: false };
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
