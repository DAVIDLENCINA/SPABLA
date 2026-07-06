/**
 * SPABLA Engine — Event contract. Discriminated union de todos los
 * eventos que el Engine emite. El scope se extendió por fase:
 * Fase 1 foundation + Fase 2 messaging + Fase 3 STT + Fase 4 translation
 * + Fase 5 TTS.
 */

import type { UUID, ISOTimestamp, CorrelationId } from "./ids.js";
import type { Participant } from "./participant.js";
import type { LanguagePair } from "./language.js";
import type { ConversationSession, LanguagePairUnresolvableReason } from "./conversation.js";
import type { CallSession, CallState } from "./call.js";
import type { TurnPipeline, TurnStage } from "./turn.js";
import type { Message, MessageStatus } from "./message.js";
import type {
  STTError,
  STTFinal,
  STTPartial,
  STTSession,
  STTSessionState,
  STTTurn,
} from "./stt.js";
import type {
  TranslationError,
  TranslationRequest,
  TranslationResult,
  TranslationSession,
} from "./translation.js";
import type {
  TTSAudioChunk,
  TTSError,
  TTSSession,
  TTSSynthesisRequest,
  TTSSynthesisResult,
} from "./tts.js";

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

// ── Core API layer (fase 1.6) ───────────────────────────────────────────────
// Emitted by SpablaCore. Kept in the same discriminated union so consumers
// only ever see one event surface via SpablaCore.subscribe().

// ── Messaging (fase 2) ──────────────────────────────────────────────────────
// Fase 2 replaces the Fase 1.6 shape of `message.sent`. The old flat payload
// `{ messageId, senderId, text }` is superseded by the richer `{ message }`.
// This is an intentional break — no external consumer of the Engine event
// surface exists yet.

export type MessageCreatedEvent   = { name: "message.created";   message: Message };
export type MessageSentEvent      = { name: "message.sent";      message: Message };
export type MessageDeliveredEvent = {
  name: "message.delivered";
  message: Message;
  previousStatus: MessageStatus;
};
export type MessageReadEvent = {
  name: "message.read";
  message: Message;
  previousStatus: MessageStatus;
};
export type MessageFailedEvent = {
  name: "message.failed";
  message: Message;
  stage: MessageStatus;
  reason: string;
};

// ── STT (fase 3) ────────────────────────────────────────────────────────────

export type STTSessionStartedEvent = { name: "stt.session.started"; session: STTSession };
export type STTPartialEvent = {
  name: "stt.partial";
  session: STTSession;
  turn: STTTurn;
  partial: STTPartial;
};
export type STTFinalEvent = {
  name: "stt.final";
  session: STTSession;
  turn: STTTurn;
  final: STTFinal;
};
export type STTFailedEvent = {
  name: "stt.failed";
  session: STTSession;
  error: STTError;
  previousState: STTSessionState;
};
export type STTSessionEndedEvent = { name: "stt.session.ended"; session: STTSession };

// ── Translation (fase 4) ────────────────────────────────────────────────────

export type TranslationSessionStartedEvent = {
  name: "translation.session.started";
  session: TranslationSession;
};
export type TranslationRequestCreatedEvent = {
  name: "translation.request.created";
  session: TranslationSession;
  request: TranslationRequest;
};
export type TranslationRequestDispatchedEvent = {
  name: "translation.request.dispatched";
  session: TranslationSession;
  request: TranslationRequest;
};
export type TranslationCompletedEvent = {
  name: "translation.completed";
  session: TranslationSession;
  request: TranslationRequest;
  result: TranslationResult;
};
export type TranslationFailedEvent = {
  name: "translation.failed";
  session: TranslationSession;
  request: TranslationRequest;
  error: TranslationError;
};
export type TranslationSessionEndedEvent = {
  name: "translation.session.ended";
  session: TranslationSession;
};

// ── TTS (fase 5) ────────────────────────────────────────────────────────────

export type TTSSessionStartedEvent = { name: "tts.session.started"; session: TTSSession };
export type TTSRequestCreatedEvent = {
  name: "tts.request.created"; session: TTSSession; request: TTSSynthesisRequest;
};
export type TTSRequestDispatchedEvent = {
  name: "tts.request.dispatched"; session: TTSSession; request: TTSSynthesisRequest;
};
export type TTSChunkGeneratedEvent = {
  name: "tts.chunk.generated"; session: TTSSession; request: TTSSynthesisRequest; chunk: TTSAudioChunk;
};
export type TTSCompletedEvent = {
  name: "tts.completed"; session: TTSSession; request: TTSSynthesisRequest; result: TTSSynthesisResult;
};
export type TTSFailedEvent = {
  name: "tts.failed"; session: TTSSession; request: TTSSynthesisRequest; error: TTSError;
};
export type TTSSessionEndedEvent = { name: "tts.session.ended"; session: TTSSession };

// ── Video / Interpreter toggles (Fase 1.6) ──────────────────────────────────

export type VideoEnabledEvent  = { name: "video.enabled";  callId: UUID };
export type VideoDisabledEvent = { name: "video.disabled"; callId: UUID };
export type InterpreterEnabledEvent  = { name: "interpreter.enabled";  callId: UUID };
export type InterpreterDisabledEvent = { name: "interpreter.disabled"; callId: UUID };

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
  | MessageCreatedEvent
  | MessageSentEvent
  | MessageDeliveredEvent
  | MessageReadEvent
  | MessageFailedEvent
  | STTSessionStartedEvent
  | STTPartialEvent
  | STTFinalEvent
  | STTFailedEvent
  | STTSessionEndedEvent
  | TranslationSessionStartedEvent
  | TranslationRequestCreatedEvent
  | TranslationRequestDispatchedEvent
  | TranslationCompletedEvent
  | TranslationFailedEvent
  | TranslationSessionEndedEvent
  | TTSSessionStartedEvent
  | TTSRequestCreatedEvent
  | TTSRequestDispatchedEvent
  | TTSChunkGeneratedEvent
  | TTSCompletedEvent
  | TTSFailedEvent
  | TTSSessionEndedEvent
  | VideoEnabledEvent
  | VideoDisabledEvent
  | InterpreterEnabledEvent
  | InterpreterDisabledEvent
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
