/**
 * SPABLA Engine — STTSession state machine (Fase 3).
 *
 * Encodes the transition table from §7 of SPABLA_V2_PHASE_3_STT_PLAN.md via
 * the generic `StateMachine` primitive.
 *
 *   idle          → listening | failed
 *   listening     → transcribing | completed | failed
 *   transcribing  → listening | completed | failed
 *   completed     → (terminal)
 *   failed        → (terminal)
 *
 * STTManager is the sole consumer.
 */

import { buildTransitions, StateMachine } from "../state-machine/StateMachine.js";
import { TERMINAL_STT_STATES, type STTSessionState } from "../types/stt.js";

const STT_SESSION_TRANSITIONS = buildTransitions<STTSessionState>({
  idle:         ["listening", "failed"],
  listening:    ["transcribing", "completed", "failed"],
  transcribing: ["listening", "completed", "failed"],
  completed:    [],
  failed:       [],
});

export const sttSessionMachine = new StateMachine<STTSessionState>(
  "STTSession",
  STT_SESSION_TRANSITIONS,
  TERMINAL_STT_STATES as ReadonlySet<STTSessionState>,
);
