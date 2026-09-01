/**
 * SPABLA Engine — PipelineTurnTracker (Fase 6).
 *
 * Estado transiente + operaciones de ciclo de vida del `TurnPipeline` que
 * usa el `PipelineOrchestrator`. Mantiene los mapas de "turno activo por
 * (call, speaker)", cola FIFO, correlación turn↔request y `TurnMeta`
 * (timestamps parciales + acumuladores). Aplica las transiciones vía
 * `TurnPipelineManager` y emite la capa semántica `pipeline.turn.*`.
 *
 * Cero conocimiento de proveedores. Cero import cross-módulo hacia
 * `stt/`, `translation/`, `tts/`, `messaging/` (solo `import type`).
 */

import type { Clock, CorrelationId, UUID } from "../types/ids.js";
import { asCorrelationId } from "../types/ids.js";
import type { EventBus } from "../event-bus/EventBus.js";
import type { LangCode } from "../types/language.js";
import type { TurnPipeline, TurnStage, TurnSpeaker } from "../types/turn.js";
import type {
  PipelineTurnResult, PipelineTurnTrigger,
} from "../types/pipeline.js";
import type { TurnPipelineManager } from "../pipeline/TurnPipelineManager.js";

export type TurnMeta = {
  callSessionId: UUID;
  speaker: TurnSpeaker;
  trigger: PipelineTurnTrigger;
  wantsTts: boolean;
  translationSessionId: UUID | undefined;
  translationRequestId: UUID | undefined;
  ttsSessionId: UUID | undefined;
  ttsRequestId: UUID | undefined;
  sourceText: string | undefined;
  translatedText: string | undefined;
  ttsChunkCount: number;
  ttsTotalBytes: number;
  startedAtMs: number;
  sttEndAtMs: number | undefined;
  translationEndAtMs: number | undefined;
  ttsEndAtMs: number | undefined;
};

export type PendingTurn = Readonly<{
  turnId: UUID;
  trigger: PipelineTurnTrigger;
  sourceText: string;
  sourceLanguage: LangCode;
  callSessionId: UUID;
  speaker: TurnSpeaker;
  wantsTts: boolean;
}>;

/** Called back when a queued turn is ready to be launched. */
export type OpenTurnFn = (item: PendingTurn) => void;

export class PipelineTurnTracker {
  private readonly bus: EventBus;
  private readonly clock: Clock;
  private readonly newId: () => UUID;
  private readonly turns: TurnPipelineManager;
  private readonly meta: Map<UUID, TurnMeta> = new Map();
  private readonly activeByKey: Map<string, UUID> = new Map();
  private readonly queueByKey: Map<string, PendingTurn[]> = new Map();
  readonly turnByTranslationRequest: Map<UUID, UUID> = new Map();
  readonly turnByTTSRequest: Map<UUID, UUID> = new Map();

  constructor(bus: EventBus, clock: Clock, newId: () => UUID, turns: TurnPipelineManager) {
    this.bus = bus;
    this.clock = clock;
    this.newId = newId;
    this.turns = turns;
  }

  keyFor(callSessionId: UUID, speaker: TurnSpeaker): string {
    return `${callSessionId}:${speaker}`;
  }

  getMeta(turnId: UUID): TurnMeta | undefined {
    return this.meta.get(turnId);
  }

  hasActive(key: string): boolean {
    return this.activeByKey.has(key);
  }

  enqueue(key: string, item: PendingTurn): void {
    const q = this.queueByKey.get(key) ?? [];
    q.push(item);
    this.queueByKey.set(key, q);
  }

  /** Peek + drain the queue for a given (call, speaker) — used by call.ended. */
  drainQueue(callSessionId: UUID): Array<{ speaker: TurnSpeaker; count: number }> {
    const drained: Array<{ speaker: TurnSpeaker; count: number }> = [];
    for (const [key, queue] of this.queueByKey.entries()) {
      if (!key.startsWith(`${callSessionId}:`) || queue.length === 0) continue;
      const speaker = key.split(":")[1] as TurnSpeaker;
      drained.push({ speaker, count: queue.length });
      queue.length = 0;
    }
    return drained;
  }

  activeTurnsForCall(callSessionId: UUID): UUID[] {
    const out: UUID[] = [];
    for (const [, turnId] of this.activeByKey) {
      const m = this.meta.get(turnId);
      if (m && m.callSessionId === callSessionId) out.push(turnId);
    }
    return out;
  }

  /** Create the pipeline snapshot, register meta, emit pipeline.turn.started. */
  open(
    turnId: UUID, callSessionId: UUID, speaker: TurnSpeaker,
    trigger: PipelineTurnTrigger, initialStage: TurnStage,
    sourceText: string, wantsTts: boolean,
    translationSessionId: UUID, cid: CorrelationId,
  ): TurnPipeline {
    this.turns.create({ turnId, callSessionId, speaker, initialStage }, cid);
    const now = this.clock.nowMs();
    const meta: TurnMeta = {
      callSessionId, speaker, trigger, wantsTts,
      translationSessionId, translationRequestId: undefined,
      ttsSessionId: undefined, ttsRequestId: undefined,
      sourceText, translatedText: undefined,
      ttsChunkCount: 0, ttsTotalBytes: 0,
      startedAtMs: now,
      sttEndAtMs: trigger === "voice" ? now : undefined,
      translationEndAtMs: undefined, ttsEndAtMs: undefined,
    };
    this.meta.set(turnId, meta);
    this.activeByKey.set(this.keyFor(callSessionId, speaker), turnId);
    const turn = this.turns.get(turnId)!;
    this.emit({ name: "pipeline.turn.started", turn, trigger }, cid);
    return turn;
  }

  /** Advance the FSM (and emit pipeline.turn.stage.changed / .completed). */
  advance(turnId: UUID, to: TurnStage, openNext: OpenTurnFn): void {
    const current = this.turns.get(turnId);
    if (!current) return;
    const previousStage = current.stage;
    const cid = this.correlation();
    const next = this.turns.advance(turnId, to, cid);
    this.emit({ name: "pipeline.turn.stage.changed", turn: next, previousStage }, cid);
    if (to === "completed") this.finalize(turnId, next, cid, openNext);
  }

  /** Fail the turn — emit pipeline.turn.stage.changed + pipeline.turn.failed. */
  fail(turnId: UUID, reason: string, openNext: OpenTurnFn): void {
    const current = this.turns.get(turnId);
    if (!current) return;
    const previousStage = current.stage;
    const cid = this.correlation();
    const next = this.turns.fail(turnId, reason, cid);
    this.emit({ name: "pipeline.turn.stage.changed", turn: next, previousStage }, cid);
    this.emit({ name: "pipeline.turn.failed", turn: next, stage: previousStage, reason }, cid);
    this.cleanup(turnId, openNext);
  }

  private finalize(turnId: UUID, next: TurnPipeline, cid: CorrelationId, openNext: OpenTurnFn): void {
    const meta = this.meta.get(turnId);
    if (!meta) return;
    const result = this.buildResult(turnId, meta);
    this.emit({ name: "pipeline.turn.completed", turn: next, result }, cid);
    this.cleanup(turnId, openNext);
  }

  private buildResult(turnId: UUID, meta: TurnMeta): PipelineTurnResult {
    const now = this.clock.nowMs();
    const translationStart = meta.sttEndAtMs ?? meta.startedAtMs;
    const sttDuration = meta.trigger === "voice" && meta.sttEndAtMs !== undefined
      ? meta.sttEndAtMs - meta.startedAtMs : undefined;
    const trDuration = meta.translationEndAtMs !== undefined
      ? meta.translationEndAtMs - translationStart : undefined;
    const ttsDuration = meta.ttsEndAtMs !== undefined && meta.translationEndAtMs !== undefined
      ? meta.ttsEndAtMs - meta.translationEndAtMs : undefined;
    const durations = Object.freeze({
      ...(sttDuration !== undefined ? { stt: sttDuration } : {}),
      ...(trDuration !== undefined ? { translation: trDuration } : {}),
      ...(ttsDuration !== undefined ? { tts: ttsDuration } : {}),
      total: now - meta.startedAtMs,
    });
    return Object.freeze({
      turnId,
      sourceText: meta.sourceText,
      translatedText: meta.translatedText,
      ttsChunkCount: meta.wantsTts ? meta.ttsChunkCount : undefined,
      ttsTotalBytes: meta.wantsTts ? meta.ttsTotalBytes : undefined,
      durations,
    });
  }

  private cleanup(turnId: UUID, openNext: OpenTurnFn): void {
    const meta = this.meta.get(turnId);
    if (!meta) return;
    const key = this.keyFor(meta.callSessionId, meta.speaker);
    this.activeByKey.delete(key);
    this.meta.delete(turnId);
    if (meta.translationRequestId) this.turnByTranslationRequest.delete(meta.translationRequestId);
    if (meta.ttsRequestId) this.turnByTTSRequest.delete(meta.ttsRequestId);
    const queue = this.queueByKey.get(key);
    if (queue && queue.length > 0) {
      const nextItem = queue.shift()!;
      openNext(nextItem);
    }
  }

  emitTelemetryDrained(callSessionId: UUID, count: number, speaker: TurnSpeaker): void {
    const cid = this.correlation();
    this.bus.emit({
      name: "telemetry.invariant.violated",
      primitive: "pipeline",
      invariant: "queue-drained-on-call-ended",
      details: { callSessionId, turnCount: count, participantId: speaker },
      meta: { ts: this.clock.nowISO(), correlationId: cid },
    });
  }

  private emit(
    partial:
      | { name: "pipeline.turn.started"; turn: TurnPipeline; trigger: PipelineTurnTrigger }
      | { name: "pipeline.turn.stage.changed"; turn: TurnPipeline; previousStage: TurnStage }
      | { name: "pipeline.turn.completed"; turn: TurnPipeline; result: PipelineTurnResult }
      | { name: "pipeline.turn.failed"; turn: TurnPipeline; stage: TurnStage; reason: string },
    cid: CorrelationId,
  ): void {
    this.bus.emit({ ...partial, meta: { ts: this.clock.nowISO(), correlationId: cid } });
  }

  private correlation(): CorrelationId {
    return asCorrelationId(this.newId() as string);
  }
}
