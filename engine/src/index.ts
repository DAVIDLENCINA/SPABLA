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
export type { EngineDependencies } from "./engine/Engine.js";

// Errors that external code may want to catch
export { InvalidTransitionError } from "./state-machine/StateMachine.js";
