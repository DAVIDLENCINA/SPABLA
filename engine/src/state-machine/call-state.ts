/**
 * SPABLA Engine — CallState state machine.
 *
 * Encodes the exact transition table from SPABLA_V2_ENGINE.md §9. Any
 * transition outside this table throws InvalidTransitionError.
 *
 * SessionManager is the only consumer.
 */

import { buildTransitions, StateMachine } from "./StateMachine.js";
import type { CallState } from "../types/call.js";
import { TERMINAL_CALL_STATES } from "../types/call.js";

/**
 * Exhaustive transition table for CallState.
 * Terminals (ended, rejected, missed, cancelled) admit no outgoing transitions
 * and are enforced by the terminalStates set passed to StateMachine.
 */
const CALL_STATE_TRANSITIONS = buildTransitions<CallState>({
  // Caller path
  idle: ["ringing", "incoming"],
  ringing: ["accepted", "cancelled", "missed", "rejected", "ended"],
  incoming: ["accepted", "rejected", "cancelled", "missed", "ended"],
  accepted: ["ended"],
  // Terminals — no outgoing edges. Listed with empty arrays for completeness.
  ended: [],
  rejected: [],
  missed: [],
  cancelled: [],
});

export const callStateMachine = new StateMachine<CallState>(
  "CallSession",
  CALL_STATE_TRANSITIONS,
  TERMINAL_CALL_STATES as ReadonlySet<CallState>,
);
