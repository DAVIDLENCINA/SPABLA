/**
 * SPABLA Engine — STT contract (Fase 3).
 *
 * Speech-to-Text session and turn snapshots. Fase 3 is 100% in-memory: chunks
 * arrive as opaque bytes and partials/finals are injected by tests or by a
 * future `STTAdapter` via `simulate*` methods. No real audio processing.
 *
 * A `STTSession` is bound to exactly one `CallSession` and one speaker.
 * Within a session the manager tracks a rolling series of `STTTurn`s; at any
 * moment there is at most one active turn. Partials share the same `turnId`;
 * a final closes the turn and the session returns to `listening`.
 */

import type { UUID, ISOTimestamp } from "./ids.js";
import type { LangCode } from "./language.js";

/** Origin of the audio being transcribed. */
export type STTSpeaker = "local" | "remote";

/** Lifecycle status of an STT session. Terminals: `completed`, `failed`. */
export type STTSessionState =
  | "idle"          // just constructed, no commands yet (transient internal)
  | "listening"     // ready to receive audio / between turns
  | "transcribing"  // actively processing a turn
  | "completed"     // stop() ran cleanly (terminal)
  | "failed";       // provider error (terminal)

export const TERMINAL_STT_STATES: ReadonlySet<STTSessionState> = new Set<STTSessionState>([
  "completed",
  "failed",
]);

export function isTerminalSTTState(s: STTSessionState): boolean {
  return TERMINAL_STT_STATES.has(s);
}

/** One partial hypothesis received during a turn. seq is 0-based monotonic. */
export type STTPartial = Readonly<{
  turnId: UUID;
  sessionId: UUID;
  seq: number;
  text: string;
  receivedAt: ISOTimestamp;
}>;

/** Final transcription of a turn. Emitted once per turn, closes it. */
export type STTFinal = Readonly<{
  turnId: UUID;
  sessionId: UUID;
  text: string;
  language: LangCode | null;
  receivedAt: ISOTimestamp;
}>;

/** Error surfaced by the provider (or `simulateError`). */
export type STTError = Readonly<{
  sessionId: UUID;
  turnId: UUID | undefined;
  code: string;
  message: string;
  receivedAt: ISOTimestamp;
}>;

/** Immutable turn snapshot. `isActive` flips to false when a final closes it. */
export type STTTurn = Readonly<{
  turnId: UUID;
  sessionId: UUID;
  callSessionId: UUID;
  startedAt: ISOTimestamp;
  endedAt: ISOTimestamp | undefined;
  partials: ReadonlyArray<STTPartial>;
  final: STTFinal | undefined;
  isActive: boolean;
}>;

/** Immutable session snapshot. */
export type STTSession = Readonly<{
  id: UUID;
  callSessionId: UUID;
  speaker: STTSpeaker;
  state: STTSessionState;
  createdAt: ISOTimestamp;
  startedAt: ISOTimestamp | undefined;
  endedAt: ISOTimestamp | undefined;
  failedAt: ISOTimestamp | undefined;
  failureReason: string | undefined;
  currentTurnId: UUID | undefined;
  turnCount: number;
  bytesReceived: number;
}>;
