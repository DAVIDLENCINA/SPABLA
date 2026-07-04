/**
 * SPABLA Engine — Event contract.
 *
 * Discriminated union of every event the Engine emits. Consumers subscribe
 * to specific event names and receive the matching payload.
 *
 * Fase 1 scope: conversation lifecycle, participant lifecycle, language
 * resolution, call state machine, telemetry. NO adapter, STT, MT, TTS or
 * turn-level events yet (those arrive in later fases).
 */

import type { UUID, ISOTimestamp, CorrelationId } from "./ids.js";
import type { Participant } from "./participant.js";
import type { LanguagePair } from "./language.js";
import type { ConversationSession, LanguagePairUnresolvableReason } from "./conversation.js";
import type { CallSession, CallState } from "./call.js";
import type { TurnPipeline, TurnStage } from "./turn.js";

/** Common metadata attached to every emitted event. */
export type EventMeta = Readonly<{
  ts: ISOTimestamp;
  correlationId: CorrelationId;
}>;

// ── Conversation lifecycle ──────────────────────────────────────────────────

export type ConversationLoadedEvent = { name: "conversation.loaded"; conversation: ConversationSession };

// ── Participant lifecycle ───────────────────────────────────────────────────

export type ParticipantJoinedEvent = { name: "participant.joined"; participant: Participant };
export type ParticipantLeftEvent   = { name: "participant.left";   participantId: UUID };
export type ParticipantUpdatedEvent = { name: "participant.updated"; participant: Participant };

// ── Language resolution ─────────────────────────────────────────────────────

export type LanguagePairResolvedEvent      = { name: "languagePair.resolved";      pair: LanguagePair };
export type LanguagePairUnresolvableEvent  = { name: "languagePair.unresolvable";  reason: LanguagePairUnresolvableReason };
export type LanguagePairChangedEvent       = { name: "languagePair.changed";       from: LanguagePair; to: LanguagePair };

// ── Call lifecycle ──────────────────────────────────────────────────────────

export type CallInitiatedEvent    = { name: "call.initiated";    session: CallSession };
export type CallIncomingEvent     = { name: "call.incoming";     session: CallSession };
export type CallAcceptedEvent     = { name: "call.accepted";     session: CallSession };
export type CallRejectedEvent     = { name: "call.rejected";     session: CallSession };
export type CallCancelledEvent    = { name: "call.cancelled";    session: CallSession };
export type CallMissedEvent       = { name: "call.missed";       session: CallSession };
export type CallEndedEvent        = { name: "call.ended";        session: CallSession };
export type CallStateChangedEvent = {
  name: "call.state.changed";
  session: CallSession;
  previousState: CallState;
};

// ── Turn pipeline lifecycle ─────────────────────────────────────────────────

export type TurnStartedEvent = {
  name: "turn.started";
  turn: TurnPipeline;
};

export type TurnStageChangedEvent = {
  name: "turn.stage.changed";
  turn: TurnPipeline;
  previousStage: TurnStage;
};

export type TurnCompletedEvent = {
  name: "turn.completed";
  turn: TurnPipeline;
};

export type TurnFailedEvent = {
  name: "turn.failed";
  turn: TurnPipeline;
  stage: TurnStage;
  reason: string;
};

// ── Telemetry (always emitted) ──────────────────────────────────────────────

export type TelemetryCommandReceivedEvent = {
  name: "telemetry.command.received";
  commandName: string;
  commandId: CorrelationId;
};

export type TelemetryCommandRejectedEvent = {
  name: "telemetry.command.rejected";
  commandId: CorrelationId;
  reason: string;
};

export type TelemetryStateTransitionEvent = {
  name: "telemetry.state.transition";
  primitive: string;
  from: string;
  to: string;
  causedBy: CorrelationId;
};

export type TelemetryInvariantViolatedEvent = {
  name: "telemetry.invariant.violated";
  primitive: string;
  invariant: string;
  details: Record<string, unknown>;
};

/** Discriminated union of every domain event. */
export type EngineEvent =
  | ConversationLoadedEvent
  | ParticipantJoinedEvent
  | ParticipantLeftEvent
  | ParticipantUpdatedEvent
  | LanguagePairResolvedEvent
  | LanguagePairUnresolvableEvent
  | LanguagePairChangedEvent
  | CallInitiatedEvent
  | CallIncomingEvent
  | CallAcceptedEvent
  | CallRejectedEvent
  | CallCancelledEvent
  | CallMissedEvent
  | CallEndedEvent
  | CallStateChangedEvent
  | TurnStartedEvent
  | TurnStageChangedEvent
  | TurnCompletedEvent
  | TurnFailedEvent
  | TelemetryCommandReceivedEvent
  | TelemetryCommandRejectedEvent
  | TelemetryStateTransitionEvent
  | TelemetryInvariantViolatedEvent;

export type EngineEventName = EngineEvent["name"];

/** Payload for a specific event name — used for typed subscriptions. */
export type EventOf<N extends EngineEventName> =
  Extract<EngineEvent, { name: N }> & { meta: EventMeta };

/** Any emitted event carries meta. */
export type EmittedEvent = EngineEvent & { meta: EventMeta };
