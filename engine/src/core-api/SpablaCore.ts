/**
 * SPABLA Core API — SpablaCore.
 *
 * The ONLY public facade meant to be consumed by web, mobile, desktop, SDK,
 * and (later) the public HTTP/RPC API. Internally uses the Engine, but the
 * Engine, managers, adapter registry and EventBus are all hidden — external
 * code has no way to reach them via this class.
 *
 * Method surface (fase 1.6, all still stubs w.r.t. real transport / AI):
 *   createConversation, joinConversation, leaveConversation,
 *   sendMessage,
 *   startCall, acceptCall, rejectCall, endCall,
 *   startVideo, stopVideo,
 *   startInterpreter, stopInterpreter,
 *   subscribe.
 *
 * Every method validates preconditions with a typed SpablaCoreError before
 * touching the Engine. Every side effect that has no Engine counterpart
 * emits a Core-layer event via the shared bus.
 */

import { Engine } from "../engine/Engine.js";
import { defaultNewId } from "../engine/types.js";
import { EventBus, type EventHandler, type Unsubscribe } from "../event-bus/EventBus.js";
import type { EngineEventName } from "../types/events.js";
import type { UUID, Clock, CorrelationId } from "../types/ids.js";
import { asCorrelationId, systemClock } from "../types/ids.js";
import type { CallSession } from "../types/call.js";
import type { ConversationSession } from "../types/conversation.js";
import {
  SpablaCoreError,
  type CallFlags,
  type CreateConversationInput,
  type JoinConversationInput,
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
  private readonly flagsByCall: Map<UUID, CallFlags> = new Map();

  constructor(config: SpablaCoreConfig = {}) {
    this.clock = config.clock ?? systemClock();
    this.newId = config.newId ?? defaultNewId;
    // The Core owns a private bus; the Engine is injected with it so all
    // events flow through the same channel. External code cannot reach the
    // bus — only `subscribe()`.
    this.bus = new EventBus();
    this.engine = new Engine({ clock: this.clock, newId: this.newId, bus: this.bus });
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

  // ── Messaging (stub) ────────────────────────────────────────────────────

  /**
   * Emits `message.sent` after validating text. Does NOT send anything over
   * a network in Fase 1.6 — real transport is wired in later fases. Returns
   * the messageId so callers can correlate.
   */
  sendMessage(input: SendMessageInput): SendMessageResult {
    const conv = this.engine.snapshotConversation();
    if (!conv) throw new SpablaCoreError("no-conversation-loaded");
    const text = (input?.text ?? "").trim();
    if (text.length === 0) throw new SpablaCoreError("empty-message");
    const messageId = this.newId();
    this.emitCore({
      name: "message.sent",
      messageId,
      senderId: conv.localParticipant.userId,
      text,
    });
    return Object.freeze({ messageId });
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

  // ── Subscription surface ────────────────────────────────────────────────

  subscribe<N extends SpablaEventName>(name: N, handler: SpablaEventHandler<N>): Unsubscribe {
    return this.bus.on(name, handler);
  }

  // ── Read-only snapshots (no manager leakage) ────────────────────────────

  getConversation(): ConversationSession | undefined {
    return this.engine.snapshotConversation();
  }

  getCall(callId: UUID): CallSession | undefined {
    return this.engine.snapshotCall(callId);
  }

  getCallFlags(callId: UUID): CallFlags | undefined {
    return this.flagsByCall.get(callId);
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
      | { name: "message.sent"; messageId: UUID; senderId: UUID; text: string }
      | { name: "video.enabled"; callId: UUID }
      | { name: "video.disabled"; callId: UUID }
      | { name: "interpreter.enabled"; callId: UUID }
      | { name: "interpreter.disabled"; callId: UUID },
  ): void {
    const correlationId: CorrelationId = asCorrelationId(this.newId() as string);
    const meta = { ts: this.clock.nowISO(), correlationId };
    this.bus.emit({ ...partial, meta });
  }
}
