/**
 * SPABLA Engine — facade. Public = commands + subscribe(). Managers hold
 * state; every command emits a telemetry event for causal auditing.
 */

import type { UUID, Clock, CorrelationId } from "../types/ids.js";
import { asCorrelationId, systemClock } from "../types/ids.js";
import type { LangCode } from "../types/language.js";
import type { CallMode, CallEndedBy } from "../types/call.js";
import type { EmittedEvent, EngineEventName, EventOf } from "../types/events.js";
import { EventBus, type EventHandler, type Unsubscribe } from "../event-bus/EventBus.js";
import { ParticipantManager, type AddParticipantInput } from "../participant-manager/ParticipantManager.js";
import { LanguageManager } from "../language-manager/LanguageManager.js";
import { ConversationManager } from "../conversation-manager/ConversationManager.js";
import { SessionManager, type CreateCallInput } from "../session-manager/SessionManager.js";
import { AdapterRegistry } from "../adapter-registry/AdapterRegistry.js";
import { TurnPipelineManager } from "../pipeline/TurnPipelineManager.js";
import { MessageManager } from "../messaging/MessageManager.js";
import { STTManager } from "../stt/STTManager.js";
import { TranslationManager } from "../translation/TranslationManager.js";
import { TTSManager } from "../tts/TTSManager.js";
import { PipelineOrchestrator } from "../pipeline-orchestrator/PipelineOrchestrator.js";
import { defaultNewId, type EngineDependencies } from "./types.js";

export type { EngineComponents, EngineDependencies } from "./types.js";

export class Engine {
  private readonly bus: EventBus;
  private readonly clock: Clock;
  private readonly newId: () => UUID;
  private readonly participants: ParticipantManager;
  private readonly languages: LanguageManager;
  private readonly conversation: ConversationManager;
  private readonly sessions: SessionManager;
  private readonly adapters: AdapterRegistry;
  private readonly turnPipelines: TurnPipelineManager;
  private readonly messages: MessageManager;
  private readonly stt: STTManager;
  private readonly translation: TranslationManager;
  private readonly tts: TTSManager;
  private readonly pipelineOrchestrator: PipelineOrchestrator;

  constructor(deps: EngineDependencies = {}) {
    this.clock = deps.clock ?? systemClock();
    this.newId = deps.newId ?? defaultNewId;
    this.bus = deps.bus ?? new EventBus();
    this.participants = deps.participants ?? new ParticipantManager(this.bus, this.clock);
    this.languages = deps.languages ?? new LanguageManager(this.bus, this.clock);
    this.conversation =
      deps.conversation ??
      new ConversationManager(this.bus, this.clock, this.participants, this.languages);
    this.sessions = deps.sessions ?? new SessionManager(this.bus, this.clock);
    this.adapters = deps.adapters ?? new AdapterRegistry();
    this.turnPipelines = deps.turnPipelines ?? new TurnPipelineManager(this.bus, this.clock);
    this.messages = deps.messages ?? new MessageManager(this.bus, this.clock);
    this.stt = deps.stt ?? new STTManager(this.bus, this.clock, this.newId);
    this.translation = deps.translation
      ?? new TranslationManager(this.bus, this.clock, this.newId, this.adapters);
    this.tts = deps.tts
      ?? new TTSManager(this.bus, this.clock, this.newId, this.adapters);
    this.pipelineOrchestrator = deps.pipelineOrchestrator ?? new PipelineOrchestrator({
      bus: this.bus, clock: this.clock, newId: this.newId,
      stt: this.stt, translation: this.translation, tts: this.tts,
      messages: this.messages, turns: this.turnPipelines,
    });
  }

  /** Read-only manager accessors. Command surface remains the Engine itself. */
  getMessageManager(): MessageManager { return this.messages; }
  getSTTManager(): STTManager { return this.stt; }
  getTranslationManager(): TranslationManager { return this.translation; }
  getTTSManager(): TTSManager { return this.tts; }
  getAdapterRegistry(): AdapterRegistry { return this.adapters; }
  getTurnPipelineManager(): TurnPipelineManager { return this.turnPipelines; }
  getPipelineOrchestrator(): PipelineOrchestrator { return this.pipelineOrchestrator; }

  /** Public read-only subscription surface. */
  on<N extends EngineEventName>(name: N, handler: EventHandler<N>): Unsubscribe {
    return this.bus.on(name, handler);
  }

  /** Read-only current state snapshots. */
  snapshotConversation() {
    return this.conversation.snapshot();
  }
  snapshotLanguage() {
    return this.languages.snapshot();
  }
  snapshotCall(id: UUID) {
    return this.sessions.get(id);
  }

  // ── Commands ─────────────────────────────────────────────────────────────

  /**
   * Load a conversation. Requires the local participant to have been added
   * beforehand via addParticipant().
   */
  loadConversation(conversationId: UUID): void {
    const cid = this.command("loadConversation");
    try {
      this.conversation.load(conversationId, cid);
    } catch (err) {
      this.rejectCommand(cid, err);
      throw err;
    }
  }

  addParticipant(input: AddParticipantInput): void {
    const cid = this.command("addParticipant");
    try {
      this.participants.add(input, cid);
      this.recomputeLanguage(cid);
    } catch (err) {
      this.rejectCommand(cid, err);
      throw err;
    }
  }

  updateParticipantLanguage(userId: UUID, language: LangCode): void {
    const cid = this.command("updateParticipantLanguage");
    try {
      this.participants.updateLanguage(userId, language, cid);
      this.recomputeLanguage(cid);
    } catch (err) {
      this.rejectCommand(cid, err);
      throw err;
    }
  }

  updateParticipantOnline(userId: UUID, isOnline: boolean): void {
    const cid = this.command("updateParticipantOnline");
    try {
      this.participants.updateOnline(userId, isOnline, cid);
    } catch (err) {
      this.rejectCommand(cid, err);
      throw err;
    }
  }

  removeParticipant(userId: UUID): void {
    const cid = this.command("removeParticipant");
    try {
      this.participants.remove(userId, cid);
      this.recomputeLanguage(cid);
    } catch (err) {
      this.rejectCommand(cid, err);
      throw err;
    }
  }

  /** Initiate an outgoing call. Requires resolved LanguagePair. */
  initiateCall(input: Readonly<{ mode: CallMode }>): UUID {
    const cid = this.command("initiateCall");
    try {
      const conv = this.requireConversation();
      const remote = conv.remoteParticipant;
      const pair = conv.languagePair;
      if (!remote || !pair) {
        this.rejectCommand(cid, new Error("cannot-initiate-without-resolved-pair"));
        throw new Error("cannot-initiate-without-resolved-pair");
      }
      const id = this.newId();
      const createInput: CreateCallInput = {
        id,
        conversationId: conv.id,
        caller: conv.localParticipant,
        callee: remote,
        languagePair: pair,
        mode: input.mode,
        initialState: "ringing",
      };
      this.sessions.create(createInput, cid);
      this.conversation.registerCallSessionId(id);
      return id;
    } catch (err) {
      this.rejectCommand(cid, err);
      throw err;
    }
  }

  /** Callee side — notify that a call is incoming. Same preconditions. */
  notifyIncomingCall(callId: UUID, mode: CallMode): void {
    const cid = this.command("notifyIncomingCall");
    try {
      const conv = this.requireConversation();
      const remote = conv.remoteParticipant;
      const pair = conv.languagePair;
      if (!remote || !pair) {
        this.rejectCommand(cid, new Error("cannot-accept-without-resolved-pair"));
        throw new Error("cannot-accept-without-resolved-pair");
      }
      const createInput: CreateCallInput = {
        id: callId,
        conversationId: conv.id,
        caller: remote, // from callee's perspective, remote is the caller
        callee: conv.localParticipant,
        languagePair: pair,
        mode,
        initialState: "incoming",
      };
      this.sessions.create(createInput, cid);
      this.conversation.registerCallSessionId(callId);
    } catch (err) {
      this.rejectCommand(cid, err);
      throw err;
    }
  }

  acceptCall(callId: UUID): void {
    this.applyTransition("acceptCall", callId, "accepted");
  }

  rejectCall(callId: UUID): void {
    this.applyTransition("rejectCall", callId, "rejected", { endedBy: "callee" });
  }

  cancelCall(callId: UUID): void {
    this.applyTransition("cancelCall", callId, "cancelled", { endedBy: "caller" });
  }

  endCall(callId: UUID, endedBy: CallEndedBy = "caller"): void {
    this.applyTransition("endCall", callId, "ended", { endedBy });
  }

  /** External scheduler pings this to expire stale ringing/incoming sessions. */
  tickTimeouts(timeoutMs: number = 30_000): number {
    const cid = this.command("tickTimeouts");
    let expired = 0;
    for (const s of this.sessions.active()) {
      if (this.sessions.expireIfStale(s.id, timeoutMs, cid)) expired++;
    }
    return expired;
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private requireConversation() {
    const conv = this.conversation.snapshot();
    if (!conv) throw new Error("conversation-not-loaded");
    return conv;
  }

  private recomputeLanguage(cid: CorrelationId): void {
    this.languages.recompute(this.participants.list(), cid);
  }

  private applyTransition(
    commandName: string,
    callId: UUID,
    to: import("../types/call.js").CallState,
    opts: Readonly<{ endedBy?: CallEndedBy }> = {},
  ): void {
    const cid = this.command(commandName);
    try {
      this.sessions.transition(callId, to, cid, opts);
    } catch (err) {
      this.rejectCommand(cid, err);
      throw err;
    }
  }

  private command(commandName: string): CorrelationId {
    const cid = asCorrelationId(this.newId() as string);
    const evt: EmittedEvent = {
      name: "telemetry.command.received",
      commandName,
      commandId: cid,
      meta: { ts: this.clock.nowISO(), correlationId: cid },
    };
    this.bus.emit(evt);
    return cid;
  }

  private rejectCommand(commandId: CorrelationId, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    const evt: EmittedEvent = {
      name: "telemetry.command.rejected",
      commandId,
      reason: message,
      meta: { ts: this.clock.nowISO(), correlationId: commandId },
    };
    this.bus.emit(evt);
  }

  /**
   * Test-only convenience: get typed access to a specific event's meta for
   * assertions. Not part of the intended public API.
   */
  _testOnlyEventOf<N extends EngineEventName>(name: N): EventOf<N> | undefined {
    void name;
    return undefined;
  }
}
