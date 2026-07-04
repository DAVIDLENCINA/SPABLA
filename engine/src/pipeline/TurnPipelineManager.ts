/**
 * SPABLA Engine — TurnPipelineManager.
 *
 * Owns TurnPipeline snapshots. Applies the turn stage machine. Emits the
 * lifecycle events (turn.started, turn.stage.changed, turn.completed,
 * turn.failed). Does NOT invoke STT/MT/TTS — later fases wire adapters to
 * feed advance() at the right moments.
 *
 * A TurnPipeline is created for one call session and speaker. Multiple
 * turns can coexist across call sessions (unbounded lifetime, bounded by
 * completion or failure).
 */

import type { Clock, CorrelationId, UUID } from "../types/ids.js";
import type { EventBus } from "../event-bus/EventBus.js";
import {
  isTerminalTurnStage,
  type TurnPipeline,
  type TurnSpeaker,
  type TurnStage,
} from "../types/turn.js";
import { turnStageMachine } from "./turn-stage-machine.js";

export class TurnPipelineError extends Error {
  public readonly invariant: string;
  public readonly details: Record<string, unknown>;
  constructor(invariant: string, details: Record<string, unknown>) {
    super(`TurnPipeline invariant violated: ${invariant}`);
    this.name = "TurnPipelineError";
    this.invariant = invariant;
    this.details = details;
  }
}

export type CreateTurnInput = Readonly<{
  turnId: UUID;
  callSessionId: UUID;
  speaker: TurnSpeaker;
}>;

export class TurnPipelineManager {
  private readonly bus: EventBus;
  private readonly clock: Clock;
  private readonly turns: Map<UUID, TurnPipeline> = new Map();

  constructor(bus: EventBus, clock: Clock) {
    this.bus = bus;
    this.clock = clock;
  }

  /** Create a fresh TurnPipeline in stage 'created' and emit turn.started. */
  create(input: CreateTurnInput, correlationId: CorrelationId): TurnPipeline {
    if (this.turns.has(input.turnId)) {
      throw new TurnPipelineError("duplicate-turnId", { turnId: input.turnId });
    }
    const now = this.clock.nowISO();
    const turn: TurnPipeline = Object.freeze({
      turnId: input.turnId,
      callSessionId: input.callSessionId,
      speaker: input.speaker,
      stage: "created" as TurnStage,
      createdAt: now,
      completedAt: undefined,
      failedAt: undefined,
      failedStage: undefined,
      failureReason: undefined,
    });
    this.turns.set(input.turnId, turn);
    this.bus.emit({
      name: "turn.started",
      turn,
      meta: { ts: now, correlationId },
    });
    return turn;
  }

  /**
   * Advance the pipeline to the next stage. Validated by the stage machine.
   * When the target stage is 'completed', emits turn.completed in addition
   * to turn.stage.changed.
   */
  advance(turnId: UUID, to: TurnStage, correlationId: CorrelationId): TurnPipeline {
    if (to === "failed") {
      throw new TurnPipelineError("use-fail-for-failure", { turnId });
    }
    const current = this.require(turnId);
    turnStageMachine.assertTransition(current.stage, to);
    const now = this.clock.nowISO();
    const next: TurnPipeline = Object.freeze({
      ...current,
      stage: to,
      completedAt: to === "completed" ? now : current.completedAt,
    });
    this.turns.set(turnId, next);
    const meta = { ts: now, correlationId };
    this.bus.emit({
      name: "turn.stage.changed",
      turn: next,
      previousStage: current.stage,
      meta,
    });
    if (to === "completed") {
      this.bus.emit({ name: "turn.completed", turn: next, meta });
    }
    return next;
  }

  /**
   * Fail the pipeline. Records the stage it was in when it failed so
   * consumers can attribute the error (STT vs MT vs TTS).
   */
  fail(turnId: UUID, reason: string, correlationId: CorrelationId): TurnPipeline {
    const current = this.require(turnId);
    if (isTerminalTurnStage(current.stage)) {
      throw new TurnPipelineError("cannot-fail-terminal-turn", {
        turnId,
        stage: current.stage,
      });
    }
    const now = this.clock.nowISO();
    turnStageMachine.assertTransition(current.stage, "failed");
    const next: TurnPipeline = Object.freeze({
      ...current,
      stage: "failed" as TurnStage,
      failedAt: now,
      failedStage: current.stage,
      failureReason: reason,
    });
    this.turns.set(turnId, next);
    const meta = { ts: now, correlationId };
    this.bus.emit({
      name: "turn.stage.changed",
      turn: next,
      previousStage: current.stage,
      meta,
    });
    this.bus.emit({
      name: "turn.failed",
      turn: next,
      stage: current.stage,
      reason,
      meta,
    });
    return next;
  }

  get(turnId: UUID): TurnPipeline | undefined {
    return this.turns.get(turnId);
  }

  /** Non-terminal turns for a given call session. */
  activeForCall(callSessionId: UUID): ReadonlyArray<TurnPipeline> {
    const out: TurnPipeline[] = [];
    for (const t of this.turns.values()) {
      if (t.callSessionId === callSessionId && !isTerminalTurnStage(t.stage)) {
        out.push(t);
      }
    }
    return out;
  }

  /** All turns (any stage) for a given call session. */
  allForCall(callSessionId: UUID): ReadonlyArray<TurnPipeline> {
    const out: TurnPipeline[] = [];
    for (const t of this.turns.values()) {
      if (t.callSessionId === callSessionId) out.push(t);
    }
    return out;
  }

  private require(turnId: UUID): TurnPipeline {
    const t = this.turns.get(turnId);
    if (!t) throw new TurnPipelineError("unknown-turnId", { turnId });
    return t;
  }
}
