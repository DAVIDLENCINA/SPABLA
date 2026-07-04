/**
 * SPABLA Engine — public entry point.
 *
 * Consumers import from this file only. Internal managers are not exported.
 */

// Types
export type {
  UUID,
  ISOTimestamp,
  CorrelationId,
  Clock,
} from "./types/ids.js";
export { asUUID, asISOTimestamp, asCorrelationId, systemClock } from "./types/ids.js";

export type { LangCode, LanguagePair } from "./types/language.js";
export {
  isLangCode,
  makeLanguagePair,
  languagePairEquals,
  invertLanguagePair,
  LanguagePairInvalidError,
} from "./types/language.js";

export type { Participant, ParticipantRole } from "./types/participant.js";
export type {
  ConversationSession,
  LanguagePairUnresolvableReason,
} from "./types/conversation.js";
export type {
  CallSession,
  CallState,
  CallMode,
  CallEndedBy,
} from "./types/call.js";
export { isTerminalCallState, TERMINAL_CALL_STATES } from "./types/call.js";

export type {
  EngineEvent,
  EngineEventName,
  EmittedEvent,
  EventOf,
  EventMeta,
} from "./types/events.js";

// Engine facade
export { Engine } from "./engine/Engine.js";
export type { EngineDependencies, EngineComponents } from "./engine/Engine.js";

// Adapter registry — public surface for SDK consumers to plug in providers.
export { AdapterRegistry, AdapterRegistryError } from "./adapter-registry/AdapterRegistry.js";
export type {
  AdapterKind,
  AdapterBase,
  AdapterByKind,
  STTAdapter,
  MTAdapter,
  TTSAdapter,
  WebRTCAdapter,
  SignalingAdapter,
  SupabaseAdapter,
} from "./types/adapters.js";
export { ADAPTER_KINDS, isAdapterKind } from "./types/adapters.js";

// Turn pipeline primitives.
export { TurnPipelineManager, TurnPipelineError } from "./pipeline/TurnPipelineManager.js";
export type { TurnPipeline, TurnStage, TurnSpeaker } from "./types/turn.js";
export { isTerminalTurnStage, TERMINAL_TURN_STAGES } from "./types/turn.js";

// Errors that external code may want to catch
export { InvalidTransitionError } from "./state-machine/StateMachine.js";
