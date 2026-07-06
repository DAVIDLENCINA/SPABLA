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

// STT (fase 3) — contracts + manager error type.
export type {
  STTSession, STTTurn, STTPartial, STTFinal, STTError,
  STTSessionState, STTSpeaker,
} from "./types/stt.js";
export { isTerminalSTTState, TERMINAL_STT_STATES } from "./types/stt.js";
export { STTManager, STTManagerError } from "./stt/STTManager.js";
export type { CreateSTTSessionInput } from "./stt/STTManager.js";

// Messaging (fase 2) — Message contracts and manager error type.
export type {
  Message,
  MessageThread,
  MessageStatus,
  MessageDirection,
} from "./types/message.js";
export {
  isTerminalMessageStatus,
  TERMINAL_MESSAGE_STATUSES,
} from "./types/message.js";
export {
  MessageManager,
  MessageManagerError,
} from "./messaging/MessageManager.js";
export type {
  CreateOutgoingInput,
  CreateIncomingInput,
} from "./messaging/MessageManager.js";

// Core API layer — public facade for web, mobile, desktop, SDK and API.
export { SpablaCore } from "./core-api/SpablaCore.js";
export type { SpablaEventName, SpablaEventHandler } from "./core-api/SpablaCore.js";
export { SpablaCoreError } from "./core-api/types.js";
export type {
  SpablaCoreConfig,
  ParticipantInput,
  CreateConversationInput,
  JoinConversationInput,
  SendMessageInput,
  SendMessageResult,
  GetMessagesInput,
  GetMessagesResult,
  MarkAsReadInput,
  NotifyIncomingMessageInput,
  StartCallInput,
  StartCallResult,
  CallFlags,
  StartSTTInput,
  StartSTTResult,
  StopSTTInput,
  PushAudioChunkInput,
  SimulateSTTPartialInput,
  SimulateSTTFinalInput,
  SimulateSTTErrorInput,
} from "./core-api/types.js";

// Errors that external code may want to catch
export { InvalidTransitionError } from "./state-machine/StateMachine.js";
