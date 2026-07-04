/**
 * SPABLA Engine — TurnPipeline contract.
 *
 * A TurnPipeline represents one utterance flowing through the translation
 * pipeline (capture → transcription → translation → synthesis → playback).
 * Fase 1.5 only implements the STATE tracker + snapshot; the real stages
 * connect to STT/MT/TTS adapters in later fases.
 *
 * turnId is the stable identifier that ties partial STT events, final STT
 * output, translation, and TTS chunks together. It never changes for a
 * given turn.
 */

import type { UUID, ISOTimestamp } from "./ids.js";

export type TurnStage =
  | "created"
  | "capturing"
  | "transcribing"
  | "translating"
  | "synthesizing"
  | "completed"
  | "failed";

export type TurnSpeaker = "local" | "remote";

/** Terminal stages — no further transitions permitted. */
export const TERMINAL_TURN_STAGES: ReadonlySet<TurnStage> = new Set<TurnStage>([
  "completed",
  "failed",
]);

export function isTerminalTurnStage(stage: TurnStage): boolean {
  return TERMINAL_TURN_STAGES.has(stage);
}

/**
 * Immutable per-turn snapshot. Consumers receive this via events; they must
 * not mutate. Optional fields are populated at their respective transitions.
 */
export type TurnPipeline = Readonly<{
  turnId: UUID;
  callSessionId: UUID;
  speaker: TurnSpeaker;
  stage: TurnStage;
  createdAt: ISOTimestamp;
  completedAt: ISOTimestamp | undefined;
  failedAt: ISOTimestamp | undefined;
  /** The stage the pipeline was in when it failed (undefined if not failed). */
  failedStage: TurnStage | undefined;
  failureReason: string | undefined;
}>;
