/**
 * SPABLA Engine — Translation state machines (Fase 4).
 *
 * Two machines using the generic `StateMachine` primitive:
 *  - TranslationSession lifecycle (idle → active → completed | failed).
 *  - TranslationRequest lifecycle (created → dispatched → completed | failed).
 *
 * TranslationManager is the sole consumer.
 */

import { buildTransitions, StateMachine } from "../state-machine/StateMachine.js";
import {
  TERMINAL_TRANSLATION_REQUEST_STATES,
  TERMINAL_TRANSLATION_SESSION_STATES,
  type TranslationRequestState,
  type TranslationSessionState,
} from "../types/translation.js";

const SESSION_TRANSITIONS = buildTransitions<TranslationSessionState>({
  idle:      ["active", "failed"],
  active:    ["completed", "failed"],
  completed: [],
  failed:    [],
});

const REQUEST_TRANSITIONS = buildTransitions<TranslationRequestState>({
  created:    ["dispatched", "failed"],
  dispatched: ["completed", "failed"],
  completed:  [],
  failed:     [],
});

export const translationSessionMachine = new StateMachine<TranslationSessionState>(
  "TranslationSession",
  SESSION_TRANSITIONS,
  TERMINAL_TRANSLATION_SESSION_STATES as ReadonlySet<TranslationSessionState>,
);

export const translationRequestMachine = new StateMachine<TranslationRequestState>(
  "TranslationRequest",
  REQUEST_TRANSITIONS,
  TERMINAL_TRANSLATION_REQUEST_STATES as ReadonlySet<TranslationRequestState>,
);
