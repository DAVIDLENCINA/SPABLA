/**
 * SPABLA Engine — Adapter marker contracts.
 *
 * These interfaces define the shape that external adapters must implement.
 * The Engine itself does not depend on any concrete adapter — they exist so
 * the AdapterRegistry can be typed and so future fases have a stable target
 * to code against.
 *
 * Each interface has a `readonly kind` discriminator matching the registry
 * key.
 */

import type { LangCode } from "./language.js";
import type { UUID } from "./ids.js";

export type AdapterKind =
  | "stt"
  | "mt"
  | "tts"
  | "webrtc"
  | "signaling"
  | "supabase";

/** All adapters carry a discriminator for runtime narrowing. */
export interface AdapterBase<K extends AdapterKind> {
  readonly kind: K;
}

/** Speech-to-Text adapter. Concrete methods defined in later fases. */
export interface STTAdapter extends AdapterBase<"stt"> {
  readonly displayName: string;
}

/** Payload the Engine hands to any translation adapter. */
export type MTAdapterRequest = Readonly<{
  requestId: UUID;
  text: string;
  from: LangCode;
  to: LangCode;
}>;

/** Response expected back from any translation adapter. */
export type MTAdapterResponse = Readonly<{
  translatedText: string;
  detectedSourceLanguage?: LangCode;
}>;

/**
 * Machine translation adapter (text-to-text). Fase 4 elevates this from a
 * pure marker to the working contract: `translate` is required so the
 * TranslationManager can rely on it without an unsafe cast.
 */
export interface MTAdapter extends AdapterBase<"mt"> {
  readonly displayName: string;
  translate(request: MTAdapterRequest): Promise<MTAdapterResponse>;
}

/** Payload the Engine hands to any TTS adapter. */
export type TTSAdapterRequest = Readonly<{
  requestId: UUID;
  text: string;
  language: LangCode;
  voiceId: string;
  rate?: number;
  pitch?: number;
}>;

/** Chunk emitted by any TTS adapter through its async iterable. */
export type TTSAdapterChunk = Readonly<{
  seq: number;
  audioBytes: Uint8Array;
  mimeType: string;
  isFinal: boolean;
}>;

/**
 * Text-to-Speech adapter. Fase 5 promotes this marker to the working
 * contract: `synthesize` is required so the TTSManager can rely on it
 * without an unsafe cast, and the AdapterRegistry rejects at register()
 * any impl that lacks it (tipo + runtime).
 */
export interface TTSAdapter extends AdapterBase<"tts"> {
  readonly displayName: string;
  synthesize(request: TTSAdapterRequest, signal: AbortSignal): AsyncIterable<TTSAdapterChunk>;
}

/** WebRTC transport adapter (RTCPeerConnection wrapper). */
export interface WebRTCAdapter extends AdapterBase<"webrtc"> {
  readonly displayName: string;
}

/** Signaling transport adapter (Socket.IO / WebSocket / RTC data channel). */
export interface SignalingAdapter extends AdapterBase<"signaling"> {
  readonly displayName: string;
}

/** Supabase (or equivalent) persistence + realtime adapter. */
export interface SupabaseAdapter extends AdapterBase<"supabase"> {
  readonly displayName: string;
}

/** Compile-time lookup from AdapterKind to concrete interface. */
export interface AdapterByKind {
  stt: STTAdapter;
  mt: MTAdapter;
  tts: TTSAdapter;
  webrtc: WebRTCAdapter;
  signaling: SignalingAdapter;
  supabase: SupabaseAdapter;
}

export const ADAPTER_KINDS: ReadonlyArray<AdapterKind> = Object.freeze([
  "stt",
  "mt",
  "tts",
  "webrtc",
  "signaling",
  "supabase",
]);

export function isAdapterKind(value: unknown): value is AdapterKind {
  return typeof value === "string" && (ADAPTER_KINDS as ReadonlyArray<string>).includes(value);
}
