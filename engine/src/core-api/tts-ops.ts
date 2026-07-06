/**
 * SPABLA Core API — TTS companion class. Guarda la orquestación de los
 * comandos TTS para que `SpablaCore` mantenga solo delegators de una
 * línea (patrón STT/Translation).
 */

import type { Engine } from "../engine/Engine.js";
import type { TTSManager } from "../tts/TTSManager.js";
import type {
  TTSSession,
  TTSSynthesisRequest,
  TTSVoiceConfig,
} from "../types/tts.js";
import type { UUID, CorrelationId } from "../types/ids.js";
import { SpablaCoreError } from "./types.js";
import type {
  RequestSpeechInput, RequestSpeechResult,
  StartTTSInput, StartTTSResult, StopTTSInput,
} from "./types.js";

export class TtsOps {
  constructor(
    private readonly engine: Engine,
    private readonly tts: TTSManager,
    private readonly newId: () => UUID,
    private readonly correlation: () => CorrelationId,
  ) {}

  start(input: StartTTSInput): StartTTSResult {
    const call = this.engine.snapshotCall(input.callId);
    if (!call) throw new SpablaCoreError("unknown-callId", { callId: input.callId });
    if (call.state !== "accepted") {
      throw new SpablaCoreError("call-not-accepted",
        { callId: input.callId, state: call.state });
    }
    if (!input.voice || typeof input.voice.voiceId !== "string" || input.voice.voiceId.length === 0) {
      throw new SpablaCoreError("empty-voiceId", { callId: input.callId });
    }
    const sessionId = this.newId();
    const voice: TTSVoiceConfig = Object.freeze({
      language: input.voice.language,
      voiceId: input.voice.voiceId,
      ...(input.voice.rate !== undefined ? { rate: input.voice.rate } : {}),
      ...(input.voice.pitch !== undefined ? { pitch: input.voice.pitch } : {}),
    });
    this.tts.createSession(
      { sessionId, callSessionId: input.callId, voice }, this.correlation(),
    );
    return Object.freeze({ sessionId });
  }

  stop(input: StopTTSInput): void {
    this.requireSession(input.sessionId);
    this.tts.stop(input.sessionId, this.correlation());
  }

  request(input: RequestSpeechInput): RequestSpeechResult {
    this.requireSession(input.sessionId);
    if (typeof input.text !== "string" || input.text.length === 0) {
      throw new SpablaCoreError("empty-text", { sessionId: input.sessionId });
    }
    const req = this.tts.requestSpeech(
      {
        sessionId: input.sessionId,
        text: input.text,
        ...(input.language !== undefined ? { language: input.language } : {}),
        ...(input.voiceId !== undefined ? { voiceId: input.voiceId } : {}),
        ...(input.sourceTranslationRequestId !== undefined
          ? { sourceTranslationRequestId: input.sourceTranslationRequestId } : {}),
      },
      this.correlation(),
    );
    return Object.freeze({ requestId: req.id });
  }

  getSession(sid: UUID): TTSSession | undefined { return this.tts.getSession(sid); }
  getRequest(rid: UUID): TTSSynthesisRequest | undefined { return this.tts.getRequest(rid); }
  listActive(callId: UUID): ReadonlyArray<TTSSession> {
    return this.tts.listActiveSessions(callId);
  }

  private requireSession(sessionId: UUID): TTSSession {
    const s = this.tts.getSession(sessionId);
    if (!s) throw new SpablaCoreError("unknown-tts-sessionId", { sessionId });
    return s;
  }
}
