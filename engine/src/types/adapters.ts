/**
 * SPABLA Engine — Adapter marker contracts.
 *
 * These interfaces define ONLY the shape that external adapters must
 * implement. The Engine itself does not depend on any concrete adapter in
 * Fase 1.5 — they exist so the AdapterRegistry can be typed and so future
 * fases have a stable target to code against.
 *
 * Each interface has a `readonly kind` discriminator matching the registry
 * key.
 */

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

/** Machine translation adapter (text-to-text). */
export interface MTAdapter extends AdapterBase<"mt"> {
  readonly displayName: string;
}

/** Text-to-Speech adapter. */
export interface TTSAdapter extends AdapterBase<"tts"> {
  readonly displayName: string;
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
