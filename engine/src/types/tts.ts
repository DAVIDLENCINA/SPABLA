/**
 * SPABLA Engine — TTS contract (Fase 5).
 *
 * Contratos de síntesis de voz. Los cuerpos son los definitivos; el
 * `TTSAdapter` queda alineado con el patrón MTAdapter (Fase 4.1): el
 * `AdapterRegistry` acepta solo implementaciones con `synthesize` en
 * tipo y en runtime.
 */

import type { UUID, ISOTimestamp } from "./ids.js";
import type { LangCode } from "./language.js";
import type {
  TTSAdapter as MarkerTTSAdapter,
  TTSAdapterRequest as MarkerTTSAdapterRequest,
  TTSAdapterChunk as MarkerTTSAdapterChunk,
} from "./adapters.js";

// ── State machines ─────────────────────────────────────────────────────────

export type TTSSessionState =
  | "idle"          // transitorio interno tras createSession
  | "active"        // aceptando requests
  | "completed"     // terminal — stop() ran
  | "failed";       // terminal — critical failure

export type TTSRequestState =
  | "created"       // registrada, no despachada
  | "dispatched"    // adapter.synthesize in-flight, sin primer chunk
  | "streaming"     // primer chunk recibido, más pueden llegar
  | "completed"     // isFinal=true recibido (terminal)
  | "failed"        // adapter rechazó, timeout o invariant (terminal)
  | "cancelled";    // stopTTS durante dispatched/streaming (terminal)

export const TERMINAL_TTS_SESSION_STATES: ReadonlySet<TTSSessionState> =
  new Set<TTSSessionState>(["completed", "failed"]);

export const TERMINAL_TTS_REQUEST_STATES: ReadonlySet<TTSRequestState> =
  new Set<TTSRequestState>(["completed", "failed", "cancelled"]);

export function isTerminalTTSSessionState(s: TTSSessionState): boolean {
  return TERMINAL_TTS_SESSION_STATES.has(s);
}

export function isTerminalTTSRequestState(s: TTSRequestState): boolean {
  return TERMINAL_TTS_REQUEST_STATES.has(s);
}

// ── Voice config ───────────────────────────────────────────────────────────

export type TTSVoiceConfig = Readonly<{
  language: LangCode;
  voiceId: string;               // opaco al Engine; identificador del proveedor
  rate?: number;                 // 0.5..2.0; el manager no valida
  pitch?: number;                // opcional; opaco
}>;

// ── Error code ─────────────────────────────────────────────────────────────

export type TTSErrorCode =
  | "no-adapter"
  | "session-terminal"
  | "provider-rejected"
  | "timeout"
  | "cancelled"
  | "invariant";

export type TTSError = Readonly<{
  requestId: UUID;
  code: TTSErrorCode;
  message: string;
  receivedAt: ISOTimestamp;
}>;

// ── Result ─────────────────────────────────────────────────────────────────

export type TTSSynthesisResult = Readonly<{
  requestId: UUID;
  chunkCount: number;
  totalBytes: number;
  mimeType: string;
  providerDisplayName: string;
  completedAt: ISOTimestamp;
}>;

// ── Chunk (bus event payload) ──────────────────────────────────────────────

export type TTSAudioChunk = Readonly<{
  requestId: UUID;
  sessionId: UUID;
  seq: number;                   // 0-based, monotónico por request
  audioBytes: Uint8Array;        // opaco al Engine
  mimeType: string;              // "audio/mpeg" | "audio/wav" | ...
  isFinal: boolean;
  receivedAt: ISOTimestamp;
}>;

// ── Snapshots ──────────────────────────────────────────────────────────────

export type TTSSession = Readonly<{
  id: UUID;
  callSessionId: UUID;
  voice: TTSVoiceConfig;
  state: TTSSessionState;
  createdAt: ISOTimestamp;
  startedAt: ISOTimestamp | undefined;
  endedAt: ISOTimestamp | undefined;
  failedAt: ISOTimestamp | undefined;
  failureReason: string | undefined;
  requestCount: number;
  completedCount: number;
  failedCount: number;
  cancelledCount: number;
}>;

export type TTSSynthesisRequest = Readonly<{
  id: UUID;
  sessionId: UUID;
  callSessionId: UUID;
  text: string;
  language: LangCode;
  voiceId: string;
  sourceTranslationRequestId: UUID | undefined;   // link opcional a translation
  state: TTSRequestState;
  createdAt: ISOTimestamp;
  dispatchedAt: ISOTimestamp | undefined;
  firstChunkAt: ISOTimestamp | undefined;         // TTFB del adaptador
  completedAt: ISOTimestamp | undefined;
  failedAt: ISOTimestamp | undefined;
  cancelledAt: ISOTimestamp | undefined;
  chunkCount: number;
  totalBytes: number;
  mimeType: string | undefined;                   // fijado por el primer chunk
  error: TTSError | undefined;
}>;

// ── Adapter contract ───────────────────────────────────────────────────────

/**
 * Concreta el marker `MTAdapter`-style para TTS. Adapters devuelven un
 * `AsyncIterable<TTSAdapterChunk>` que honra `signal.aborted` para
 * permitir cancelación cooperativa desde `stopTTS`. El adapter debe
 * emitir seq monotónico creciente desde 0 y exactamente un chunk con
 * `isFinal=true` al final del stream exitoso.
 */
export type TTSAdapter = MarkerTTSAdapter;
export type TTSAdapterRequest = MarkerTTSAdapterRequest;
export type TTSAdapterChunk = MarkerTTSAdapterChunk;
