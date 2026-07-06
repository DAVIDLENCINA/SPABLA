/**
 * SPABLA Engine — public dependency types for the Engine facade.
 *
 * Split out of Engine.ts to keep the class file under the 300-line cap.
 * Everything here is metadata/types + tiny factory helpers; the actual
 * orchestration lives in Engine.ts.
 */

import type { UUID, Clock } from "../types/ids.js";
import type { EventBus } from "../event-bus/EventBus.js";
import type { ParticipantManager } from "../participant-manager/ParticipantManager.js";
import type { LanguageManager } from "../language-manager/LanguageManager.js";
import type { ConversationManager } from "../conversation-manager/ConversationManager.js";
import type { SessionManager } from "../session-manager/SessionManager.js";
import type { AdapterRegistry } from "../adapter-registry/AdapterRegistry.js";
import type { TurnPipelineManager } from "../pipeline/TurnPipelineManager.js";
import type { MessageManager } from "../messaging/MessageManager.js";
import type { STTManager } from "../stt/STTManager.js";
import type { TranslationManager } from "../translation/TranslationManager.js";
import type { TTSManager } from "../tts/TTSManager.js";

/**
 * Fully-injectable component surface. Consumers may replace any of these
 * (via Partial passed to `new Engine({...})`); missing pieces are constructed
 * with the standard defaults.
 */
export interface EngineComponents {
  clock: Clock;
  newId: () => UUID;
  bus: EventBus;
  participants: ParticipantManager;
  languages: LanguageManager;
  conversation: ConversationManager;
  sessions: SessionManager;
  adapters: AdapterRegistry;
  turnPipelines: TurnPipelineManager;
  messages: MessageManager;
  stt: STTManager;
  translation: TranslationManager;
  tts: TTSManager;
}

/** Public dependency surface — backward-compatible with Fase 1's shape. */
export type EngineDependencies = Partial<EngineComponents>;

/**
 * Default UUID generator used when the caller does not provide one.
 * Production wiring should pass `crypto.randomUUID`. Fine-grained enough
 * for tests without needing an external mock.
 */
export function defaultNewId(): UUID {
  const n = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return n as UUID;
}
