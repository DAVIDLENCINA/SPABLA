/**
 * SPABLA Core API — STT companion class.
 *
 * Holds the STT command orchestration so `SpablaCore` can stay under the
 * 300-line cap with thin one-line delegators. External code touches STT
 * ONLY through the `SpablaCore.startSTT / stopSTT / …` methods; this class
 * is not exported from `index.ts`.
 */

import type { Engine } from "../engine/Engine.js";
import type { STTManager } from "../stt/STTManager.js";
import type { STTSession, STTTurn } from "../types/stt.js";
import type { UUID, CorrelationId } from "../types/ids.js";
import { SpablaCoreError } from "./types.js";
import type {
  StartSTTInput, StartSTTResult, StopSTTInput,
  PushAudioChunkInput,
  SimulateSTTPartialInput, SimulateSTTFinalInput, SimulateSTTErrorInput,
} from "./types.js";

export class SttOps {
  constructor(
    private readonly engine: Engine,
    private readonly stt: STTManager,
    private readonly newId: () => UUID,
    private readonly correlation: () => CorrelationId,
  ) {}

  start(input: StartSTTInput): StartSTTResult {
    const call = this.engine.snapshotCall(input.callId);
    if (!call) throw new SpablaCoreError("unknown-callId", { callId: input.callId });
    if (call.state !== "accepted") {
      throw new SpablaCoreError("call-not-accepted", { callId: input.callId, state: call.state });
    }
    for (const existing of this.stt.listActiveSessions(input.callId)) {
      if (existing.speaker === input.speaker) {
        throw new SpablaCoreError("stt-session-already-active", { existing: existing.id });
      }
    }
    const sessionId = this.newId();
    this.stt.createSession(
      { sessionId, callSessionId: input.callId, speaker: input.speaker },
      this.correlation(),
    );
    return Object.freeze({ sessionId });
  }

  stop(input: StopSTTInput): void {
    this.requireSession(input.sessionId);
    this.stt.stop(input.sessionId, this.correlation());
  }

  pushChunk(input: PushAudioChunkInput): void {
    this.requireSession(input.sessionId);
    const bytes = input.chunk.byteLength;
    this.stt.pushChunk(input.sessionId, bytes);
  }

  simulatePartial(input: SimulateSTTPartialInput): void {
    this.requireSession(input.sessionId);
    this.stt.simulatePartial(input.sessionId, input.text, this.correlation());
  }

  simulateFinal(input: SimulateSTTFinalInput): void {
    this.requireSession(input.sessionId);
    this.stt.simulateFinal(
      input.sessionId,
      input.text,
      input.language ?? null,
      this.correlation(),
    );
  }

  simulateError(input: SimulateSTTErrorInput): void {
    this.requireSession(input.sessionId);
    this.stt.simulateError(input.sessionId, input.code, input.message, this.correlation());
  }

  getSession(sessionId: UUID): STTSession | undefined { return this.stt.getSession(sessionId); }
  getTurn(turnId: UUID): STTTurn | undefined { return this.stt.getTurn(turnId); }
  listActive(callId: UUID): ReadonlyArray<STTSession> {
    return this.stt.listActiveSessions(callId);
  }

  private requireSession(sessionId: UUID): STTSession {
    const s = this.stt.getSession(sessionId);
    if (!s) throw new SpablaCoreError("unknown-stt-sessionId", { sessionId });
    return s;
  }
}
