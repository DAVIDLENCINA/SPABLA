/**
 * SPABLA Engine — TurnPipeline stage machine.
 *
 * Encodes the exact stage transition table for TurnPipeline. Uses the
 * generic StateMachine primitive so behaviour is consistent with CallState.
 *
 * Any non-terminal stage may transition to `failed`. Once `completed` or
 * `failed`, no further transitions are allowed.
 */

import { buildTransitions, StateMachine } from "../state-machine/StateMachine.js";
import { TERMINAL_TURN_STAGES, type TurnStage } from "../types/turn.js";

const TURN_STAGE_TRANSITIONS = buildTransitions<TurnStage>({
  created: ["capturing", "failed"],
  capturing: ["transcribing", "failed"],
  transcribing: ["translating", "failed"],
  // `translating → completed` added by ADR-001-FOUNDATION-EVOLUTION to
  // close text turns that skip synthesis; the classical route
  // `translating → synthesizing → completed` remains canonical for
  // voice and text-with-TTS.
  translating: ["synthesizing", "completed", "failed"],
  synthesizing: ["completed", "failed"],
  completed: [],
  failed: [],
});

export const turnStageMachine = new StateMachine<TurnStage>(
  "TurnPipeline",
  TURN_STAGE_TRANSITIONS,
  TERMINAL_TURN_STAGES as ReadonlySet<TurnStage>,
);
