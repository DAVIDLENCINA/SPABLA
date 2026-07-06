/**
 * SPABLA Engine — TTS state machines (Fase 5).
 *
 * Dos máquinas basadas en la primitiva `StateMachine`:
 *  - ttsSessionMachine: idle → active → completed | failed.
 *  - ttsRequestMachine: created → dispatched → streaming → completed |
 *    failed | cancelled. Self-loop `streaming → streaming` autorizado
 *    para chunks intermedios.
 */

import { buildTransitions, StateMachine } from "../state-machine/StateMachine.js";
import {
  TERMINAL_TTS_REQUEST_STATES,
  TERMINAL_TTS_SESSION_STATES,
  type TTSRequestState,
  type TTSSessionState,
} from "../types/tts.js";

const SESSION_TRANSITIONS = buildTransitions<TTSSessionState>({
  idle:      ["active", "failed"],
  active:    ["completed", "failed"],
  completed: [],
  failed:    [],
});

const REQUEST_TRANSITIONS = buildTransitions<TTSRequestState>({
  created:    ["dispatched", "failed"],
  dispatched: ["streaming", "completed", "failed", "cancelled"],
  streaming:  ["streaming", "completed", "failed", "cancelled"],
  completed:  [],
  failed:     [],
  cancelled:  [],
});

export const ttsSessionMachine = new StateMachine<TTSSessionState>(
  "TTSSession",
  SESSION_TRANSITIONS,
  TERMINAL_TTS_SESSION_STATES as ReadonlySet<TTSSessionState>,
);

export const ttsRequestMachine = new StateMachine<TTSRequestState>(
  "TTSRequest",
  REQUEST_TRANSITIONS,
  TERMINAL_TTS_REQUEST_STATES as ReadonlySet<TTSRequestState>,
);
