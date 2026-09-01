/**
 * SPABLA Engine — PipelineOrchestrator (Fase 6). Único conector eventos →
 * comandos entre managers de dominio y `TurnPipelineManager`. Aplica las
 * políticas del pipeline (elección de `initialStage` por trigger, FIFO por
 * participante, agregación de `PipelineTurnResult`, cleanup al `call.ended`).
 * Emite la capa semántica `pipeline.turn.*`; la mecánica `turn.*` la sigue
 * emitiendo el `TurnPipelineManager`. Cero conocimiento de proveedores.
 */

import type { Clock, UUID } from "../types/ids.js";
import type { EventBus, EventHandler, Unsubscribe } from "../event-bus/EventBus.js";
import type { EngineEventName } from "../types/events.js";
import type { LangCode } from "../types/language.js";
import type { TurnSpeaker } from "../types/turn.js";
import type { TranslationRequest, TranslationSession } from "../types/translation.js";
import type { TTSSession, TTSSynthesisRequest, TTSSynthesisResult } from "../types/tts.js";
import type { Message } from "../types/message.js";
import type { STTManager } from "../stt/STTManager.js";
import type { TranslationManager } from "../translation/TranslationManager.js";
import type { TTSManager } from "../tts/TTSManager.js";
import type { MessageManager } from "../messaging/MessageManager.js";
import type { TurnPipelineManager } from "../pipeline/TurnPipelineManager.js";
import { asCorrelationId } from "../types/ids.js";
import { PipelineTurnTracker, type PendingTurn } from "./pipeline-turn-tracker.js";

export type PipelineOrchestratorOptions = Readonly<{
  /** Default true. Opens text turns on outgoing `message.sent` when exactly
   * one active translation session exists. */
  textTurnsEnabled?: boolean;
  /** Default true. Text turns request TTS after translation; when false the
   * ADR-001-FOUNDATION-EVOLUTION route `translating → completed` is taken. */
  textWantsTts?: boolean;
}>;

/** Dependencies injected by `Engine`. All read-only references. */
export type PipelineOrchestratorDeps = Readonly<{
  bus: EventBus;
  clock: Clock;
  newId: () => UUID;
  stt: STTManager;
  translation: TranslationManager;
  tts: TTSManager;
  messages: MessageManager;
  turns: TurnPipelineManager;
}>;

export class PipelineOrchestrator {
  private readonly bus: EventBus;
  private readonly clock: Clock;
  private readonly newId: () => UUID;
  private readonly stt: STTManager;
  private readonly translation: TranslationManager;
  private readonly tts: TTSManager;
  private readonly tracker: PipelineTurnTracker;
  private readonly textEnabled: boolean;
  private readonly textWantsTts: boolean;
  private readonly relaunch = (i: PendingTurn) => this.launchFromQueue(i);
  private readonly translationSessionByCall: Map<UUID, UUID> = new Map();
  private readonly ttsSessionByCall: Map<UUID, UUID> = new Map();
  private readonly unsubs: Unsubscribe[] = [];

  constructor(deps: PipelineOrchestratorDeps, opts: PipelineOrchestratorOptions = {}) {
    this.bus = deps.bus;
    this.clock = deps.clock;
    this.newId = deps.newId;
    this.stt = deps.stt;
    this.translation = deps.translation;
    this.tts = deps.tts;
    this.tracker = new PipelineTurnTracker(deps.bus, deps.clock, deps.newId, deps.turns);
    this.textEnabled = opts.textTurnsEnabled ?? true;
    this.textWantsTts = opts.textWantsTts ?? true;
    void deps.messages;
    this.wire();
  }

  dispose(): void {
    for (const off of this.unsubs) off();
    this.unsubs.length = 0;
  }

  private sub<N extends EngineEventName>(n: N, h: EventHandler<N>): void {
    this.unsubs.push(this.bus.on(n, h));
  }

  private wire(): void {
    this.sub("stt.final", (e) => this.onSttFinal(e.session, e.final));
    this.sub("stt.failed", (e) => this.onSttFailed(e.session.callSessionId));
    this.sub("translation.session.started", (e) => this.onTrStarted(e.session));
    this.sub("translation.session.ended", (e) => this.onTrEnded(e.session));
    this.sub("translation.completed",
      (e) => this.onTrCompleted(e.request, e.result.translatedText, e.result.targetLanguage));
    this.sub("translation.failed", (e) => this.onTrFailed(e.request, e.error.code));
    this.sub("tts.session.started", (e) => this.onTtsStarted(e.session));
    this.sub("tts.session.ended", (e) => this.onTtsEnded(e.session));
    this.sub("tts.chunk.generated", (e) => this.onTtsChunk(e.request, e.chunk.audioBytes.byteLength));
    this.sub("tts.completed", (e) => this.onTtsCompleted(e.request, e.result));
    this.sub("tts.failed", (e) => this.onTtsFailed(e.request, e.error.code));
    this.sub("message.sent", (e) => this.onMessageSent(e.message));
    this.sub("call.ended", (e) => this.onCallEnded(e.session.id));
  }

  // Voice trigger.
  private onSttFinal(
    session: import("../types/stt.js").STTSession,
    final: import("../types/stt.js").STTFinal,
  ): void {
    if (session.state === "completed" || session.state === "failed") return;
    if (final.language === null) return;
    const key = this.tracker.keyFor(session.callSessionId, session.speaker);
    const translationSessionId = this.translationSessionByCall.get(session.callSessionId);
    if (!translationSessionId) return;
    if (this.tracker.hasActive(key)) {
      this.tracker.enqueue(key, {
        turnId: final.turnId, trigger: "voice",
        sourceText: final.text, sourceLanguage: final.language,
        callSessionId: session.callSessionId, speaker: session.speaker, wantsTts: true,
      });
      return;
    }
    this.launchVoice(final.turnId, session.callSessionId, session.speaker, final.text,
      final.language, translationSessionId);
  }

  private launchVoice(
    turnId: UUID, callSessionId: UUID, speaker: TurnSpeaker,
    text: string, sourceLanguage: LangCode, translationSessionId: UUID,
  ): void {
    const cid = asCorrelationId(this.newId() as string);
    this.tracker.open(turnId, callSessionId, speaker, "voice", "transcribing",
      text, true, translationSessionId, cid);
    const req = this.translation.requestTranslation(
      { sessionId: translationSessionId, text, sourceLanguage, sourceTurnId: turnId }, cid);
    const meta = this.tracker.getMeta(turnId);
    if (meta) meta.translationRequestId = req.id;
    this.tracker.turnByTranslationRequest.set(req.id, turnId);
  }

  // Text trigger.
  private onMessageSent(message: Message): void {
    if (!this.textEnabled) return;
    if (message.direction !== "outgoing") return;
    if (this.translationSessionByCall.size !== 1) return;
    if (message.language === null) return;
    const entry = this.translationSessionByCall.entries().next().value;
    if (!entry) return;
    const [callSessionId, translationSessionId] = entry;
    const speaker: TurnSpeaker = "local";
    const key = this.tracker.keyFor(callSessionId, speaker);
    const turnId = this.newId();
    const wantsTts = this.textWantsTts && this.ttsSessionByCall.has(callSessionId);
    if (this.tracker.hasActive(key)) {
      this.tracker.enqueue(key, {
        turnId, trigger: "text",
        sourceText: message.text, sourceLanguage: message.language,
        callSessionId, speaker, wantsTts,
      });
      return;
    }
    this.launchText(turnId, callSessionId, speaker, message.text, message.language,
      translationSessionId, wantsTts);
  }

  private launchText(
    turnId: UUID, callSessionId: UUID, speaker: TurnSpeaker,
    text: string, sourceLanguage: LangCode, translationSessionId: UUID, wantsTts: boolean,
  ): void {
    const cid = asCorrelationId(this.newId() as string);
    this.tracker.open(turnId, callSessionId, speaker, "text", "translating",
      text, wantsTts, translationSessionId, cid);
    const req = this.translation.requestTranslation(
      { sessionId: translationSessionId, text, sourceLanguage, sourceTurnId: turnId }, cid);
    const meta = this.tracker.getMeta(turnId);
    if (meta) meta.translationRequestId = req.id;
    this.tracker.turnByTranslationRequest.set(req.id, turnId);
  }

  private launchFromQueue(item: PendingTurn): void {
    const trSess = this.translationSessionByCall.get(item.callSessionId);
    if (!trSess) return; // translation session gone; drop.
    if (item.trigger === "voice") {
      this.launchVoice(item.turnId, item.callSessionId, item.speaker,
        item.sourceText, item.sourceLanguage, trSess);
    } else {
      const wantsTts = item.wantsTts && this.ttsSessionByCall.has(item.callSessionId);
      this.launchText(item.turnId, item.callSessionId, item.speaker,
        item.sourceText, item.sourceLanguage, trSess, wantsTts);
    }
  }

  // Translation session bookkeeping.
  private onTrStarted(session: TranslationSession): void {
    this.translationSessionByCall.set(session.callSessionId, session.id);
  }

  private onTrEnded(session: TranslationSession): void {
    if (this.translationSessionByCall.get(session.callSessionId) === session.id) {
      this.translationSessionByCall.delete(session.callSessionId);
    }
  }

  private onTrCompleted(request: TranslationRequest, translatedText: string, targetLanguage: LangCode): void {
    const turnId = this.tracker.turnByTranslationRequest.get(request.id);
    if (!turnId) return;
    this.tracker.turnByTranslationRequest.delete(request.id);
    const meta = this.tracker.getMeta(turnId);
    if (!meta) return;
    meta.translatedText = translatedText;
    meta.translationEndAtMs = this.clock.nowMs();
    if (meta.wantsTts) {
      if (meta.trigger === "voice") this.tracker.advance(turnId, "translating", this.relaunch);
      this.tracker.advance(turnId, "synthesizing", this.relaunch);
      const ttsSessionId = this.ttsSessionByCall.get(meta.callSessionId);
      if (!ttsSessionId) { this.tracker.fail(turnId, "no-tts-session-for-call", this.relaunch); return; }
      meta.ttsSessionId = ttsSessionId;
      const cid = asCorrelationId(this.newId() as string);
      const req = this.tts.requestSpeech(
        { sessionId: ttsSessionId, text: translatedText, language: targetLanguage,
          sourceTranslationRequestId: request.id },
        cid);
      meta.ttsRequestId = req.id;
      this.tracker.turnByTTSRequest.set(req.id, turnId);
    } else {
      // Text-without-TTS terminal route (ADR-001-FOUNDATION-EVOLUTION).
      this.tracker.advance(turnId, "completed", this.relaunch);
    }
  }

  private onTrFailed(request: TranslationRequest, code: string): void {
    const turnId = this.tracker.turnByTranslationRequest.get(request.id);
    if (!turnId) return;
    this.tracker.turnByTranslationRequest.delete(request.id);
    this.tracker.fail(turnId, code, this.relaunch);
  }

  // TTS session bookkeeping.
  private onTtsStarted(session: TTSSession): void {
    this.ttsSessionByCall.set(session.callSessionId, session.id);
  }

  private onTtsEnded(session: TTSSession): void {
    if (this.ttsSessionByCall.get(session.callSessionId) === session.id) {
      this.ttsSessionByCall.delete(session.callSessionId);
    }
  }

  private onTtsChunk(request: TTSSynthesisRequest, chunkBytes: number): void {
    const turnId = this.tracker.turnByTTSRequest.get(request.id);
    if (!turnId) return;
    const meta = this.tracker.getMeta(turnId);
    if (!meta) return;
    meta.ttsChunkCount++;
    meta.ttsTotalBytes += chunkBytes;
  }

  private onTtsCompleted(request: TTSSynthesisRequest, result: TTSSynthesisResult): void {
    const turnId = this.tracker.turnByTTSRequest.get(request.id);
    if (!turnId) return;
    this.tracker.turnByTTSRequest.delete(request.id);
    const meta = this.tracker.getMeta(turnId);
    if (!meta) return;
    meta.ttsEndAtMs = this.clock.nowMs();
    meta.ttsChunkCount = result.chunkCount;
    meta.ttsTotalBytes = result.totalBytes;
    this.tracker.advance(turnId, "completed", this.relaunch);
  }

  private onTtsFailed(request: TTSSynthesisRequest, code: string): void {
    const turnId = this.tracker.turnByTTSRequest.get(request.id);
    if (!turnId) return;
    this.tracker.turnByTTSRequest.delete(request.id);
    this.tracker.fail(turnId, code, this.relaunch);
  }

  // STT failure: fail matching voice turns still in transcribing.
  private onSttFailed(callSessionId: UUID): void {
    for (const turnId of this.tracker.activeTurnsForCall(callSessionId)) {
      const meta = this.tracker.getMeta(turnId);
      if (!meta || meta.trigger !== "voice") continue;
      this.tracker.fail(turnId, "stt-failed", this.relaunch);
    }
  }

  // call.ended cleanup — §14 orden estricto (0..4) + §13 queue-drain.
  private onCallEnded(callSessionId: UUID): void {
    const drained = this.tracker.drainQueue(callSessionId);
    for (const d of drained) this.tracker.emitTelemetryDrained(callSessionId, d.count, d.speaker);
    const cid = () => asCorrelationId(this.newId() as string);
    for (const s of this.tts.listActiveSessions(callSessionId)) this.tts.stop(s.id, cid());
    for (const s of this.translation.listActiveSessions(callSessionId)) this.translation.stop(s.id, cid());
    for (const s of this.stt.listActiveSessions(callSessionId)) this.stt.stop(s.id, cid());
    for (const turnId of this.tracker.activeTurnsForCall(callSessionId)) {
      this.tracker.fail(turnId, "call-ended", this.relaunch);
    }
  }

}
