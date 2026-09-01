/**
 * SPABLA Engine — CallSession contract.
 *
 * Immutable per-call snapshot. Created by SessionManager only when a valid
 * LanguagePair is present (enforced at construction time).
 *
 * State transitions are governed by the CallState machine in
 * state-machine/call-state.ts and cannot bypass invariants.
 */

import type { UUID, ISOTimestamp } from "./ids.js";
import type { LanguagePair } from "./language.js";
import type { Participant } from "./participant.js";

export type CallMode = "voice" | "video";

export type CallState =
  | "idle"
  | "ringing"
  | "incoming"
  | "accepted"
  | "ended"
  | "rejected"
  | "missed"
  | "cancelled";

export type CallEndedBy = "caller" | "callee" | "network" | "timeout";

/** Set of terminal states. Once reached, no further transitions allowed. */
export const TERMINAL_CALL_STATES: ReadonlySet<CallState> = new Set<CallState>([
  "ended",
  "rejected",
  "missed",
  "cancelled",
]);

export function isTerminalCallState(state: CallState): boolean {
  return TERMINAL_CALL_STATES.has(state);
}

/**
 * CallSession snapshot. Consumers receive this via events; they must not
 * mutate. Fields marked with `?` are populated at specific transitions.
 */
export type CallSession = Readonly<{
  id: UUID;
  conversationId: UUID;
  caller: Participant;
  callee: Participant;
  /**
   * Direction of translation for the caller's perspective.
   * `from` is caller.language, `to` is callee.language.
   * Present unconditionally — SessionManager rejects creation without it.
   */
  languagePair: LanguagePair;
  mode: CallMode;
  state: CallState;
  createdAt: ISOTimestamp;
  acceptedAt: ISOTimestamp | undefined;
  endedAt: ISOTimestamp | undefined;
  endedBy: CallEndedBy | undefined;
}>;
