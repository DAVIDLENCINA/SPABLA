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

/**
 * Structural, static capabilities declared by an adapter.
 *
 * ADR-004 §2.5 rules:
 *  - Empty by design. Any future key requires a specific ADR that
 *    declares its semantics, default and authorized consumers.
 *  - Extended exclusively by additive editing of this file. Declaration
 *    merging from other modules or packages is prohibited.
 *  - Describes ONLY structural and static capabilities. Prohibited
 *    categories: runtime state, active sessions, current availability,
 *    real-time metrics, observed latency, recent errors, active
 *    language, mutable configuration, user data. Dynamic information
 *    belongs to runtime, telemetry or session state — never to this
 *    static contract.
 */
export interface AdapterCapabilities {}

/** All adapters carry a discriminator for runtime narrowing. */
export interface AdapterBase<K extends AdapterKind> {
  readonly kind: K;
  /**
   * Set of ISO 639-1 codes (ADR-005 §5) or BCP 47 identifiers
   * (ADR-005 §1.1) that this adapter can process in its primary mode.
   * **Canonical source of truth** for the adapter's language contract
   * (ADR-004 §2.2, §2.3).
   *
   * Optional at the type level for backward compatibility (ADR-004
   * §2.4). Real adapters registered from Fase 7 onward MUST implement
   * this method.
   */
  getSupportedLanguages?(): ReadonlySet<LangCode>;
  /**
   * Optional query for a single language. If implemented, MUST derive
   * from `getSupportedLanguages()` and remain semantically equivalent
   * to `getSupportedLanguages().has(lang)` for every lang (ADR-004
   * §2.3). Overrides are permitted only when a demonstrable
   * optimization justifies them; any divergence invalidates the
   * adapter for production.
   *
   * The runtime materialization of the default `supports(lang)` — for
   * the case in which an adapter implements `getSupportedLanguages` but
   * not `supports` — is deferred to the plan of real adapters (Fase 7)
   * or the SDK plan (Fase 9), because a TypeScript interface cannot
   * carry a default method implementation without exposing a second
   * public surface (ADR-004 §2.3). Foundation guarantees the contract
   * at the type and semantic level; the materialization pattern
   * (abstract class, factory, mixin, etc.) is chosen by the fase that
   * introduces the first production adapter.
   */
  supports?(lang: LangCode): boolean;
  /** Structural, static capabilities declared by the adapter (ADR-004 §2.5). */
  readonly capabilities?: AdapterCapabilities;
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
