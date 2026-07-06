/**
 * SPABLA Engine — TTS runtime (Fase 5). Encapsula la orquestación async
 * del stream del `TTSAdapter`: dispatch, consumo del AsyncIterable,
 * validación de invariantes (seq monotónico, mimeType estable), timeout
 * del primer chunk, cancelación cooperativa y emisión de eventos
 * terminales. Comparte los mapas `sessions`/`requests` con el `TTSManager`
 * para mantenerse dentro del cap de líneas.
 */

import type { Clock, CorrelationId, ISOTimestamp, UUID } from "../types/ids.js";
import type { EventBus } from "../event-bus/EventBus.js";
import {
  isTerminalTTSRequestState,
  type TTSAdapter,
  type TTSAdapterChunk,
  type TTSAudioChunk,
  type TTSError,
  type TTSErrorCode,
  type TTSRequestState,
  type TTSSession,
  type TTSSynthesisRequest,
  type TTSSynthesisResult,
} from "../types/tts.js";
import { ttsRequestMachine } from "./tts-machine.js";

export class TTSRuntime {
  private readonly controllers: Map<UUID, AbortController> = new Map();
  private readonly timers: Map<UUID, ReturnType<typeof setTimeout>> = new Map();

  constructor(
    private readonly bus: EventBus,
    private readonly clock: Clock,
    private readonly sessions: Map<UUID, TTSSession>,
    private readonly requests: Map<UUID, TTSSynthesisRequest>,
    private readonly firstChunkTimeoutMs: number,
  ) {}

  dispatch(request: TTSSynthesisRequest, adapter: TTSAdapter, cid: CorrelationId): TTSSynthesisRequest {
    const now = this.clock.nowISO();
    const controller = new AbortController();
    this.controllers.set(request.id, controller);
    const dispatched = this.transitionRequest(request.id, "dispatched", { dispatchedAt: now });
    this.emit("tts.request.dispatched",
      { session: this.sessions.get(request.sessionId)!, request: dispatched }, now, cid);
    this.timers.set(request.id, setTimeout(() => {
      this.timers.delete(request.id);
      const cur = this.requests.get(request.id);
      if (cur && cur.state === "dispatched") {
        controller.abort();
        this.failRequest(request.id, "timeout",
          `first chunk not received within ${this.firstChunkTimeoutMs}ms`, cid);
      }
    }, this.firstChunkTimeoutMs));
    let stream: AsyncIterable<TTSAdapterChunk>;
    try {
      stream = adapter.synthesize({
        requestId: request.id, text: request.text, language: request.language,
        voiceId: request.voiceId,
      }, controller.signal);
    } catch (err) {
      this.clearTimer(request.id);
      this.onAdapterError(request.id, err, cid);
      return this.requests.get(request.id)!;
    }
    this.consume(request.id, adapter, stream, cid).catch(() => { /* handled */ });
    return dispatched;
  }

  cancelRequest(requestId: UUID, cid: CorrelationId): void {
    this.clearTimer(requestId);
    this.controllers.get(requestId)?.abort();
    this.controllers.delete(requestId);
    const now = this.clock.nowISO();
    const error: TTSError = Object.freeze({ requestId, code: "cancelled",
      message: "stopTTS invoked while request was in-flight", receivedAt: now });
    const failed = this.transitionRequest(requestId, "cancelled", { cancelledAt: now, error });
    const session = this.patchSession(failed.sessionId, {
      cancelledCount: this.sessions.get(failed.sessionId)!.cancelledCount + 1,
    });
    this.emit("tts.failed", { session, request: failed, error }, now, cid);
  }

  failRequest(requestId: UUID, code: TTSErrorCode, message: string, cid: CorrelationId): TTSSynthesisRequest {
    this.clearTimer(requestId);
    this.controllers.delete(requestId);
    const now = this.clock.nowISO();
    const error: TTSError = Object.freeze({ requestId, code, message, receivedAt: now });
    const failed = this.transitionRequest(requestId, "failed", { failedAt: now, error });
    const session = this.patchSession(failed.sessionId, {
      failedCount: this.sessions.get(failed.sessionId)!.failedCount + 1,
    });
    this.emit("tts.failed", { session, request: failed, error }, now, cid);
    return failed;
  }

  private async consume(
    requestId: UUID, adapter: TTSAdapter,
    stream: AsyncIterable<TTSAdapterChunk>, cid: CorrelationId,
  ): Promise<void> {
    try {
      for await (const chunk of stream) {
        const cur = this.requests.get(requestId);
        if (!cur || isTerminalTTSRequestState(cur.state)) return;
        this.clearTimer(requestId);
        if (chunk.seq !== cur.chunkCount) {
          return this.failInvariant(requestId,
            `non-monotonic seq: expected ${cur.chunkCount}, got ${chunk.seq}`, cid);
        }
        if (cur.mimeType !== undefined && cur.mimeType !== chunk.mimeType) {
          return this.failInvariant(requestId,
            `mimeType changed mid-stream: had ${cur.mimeType}, got ${chunk.mimeType}`, cid);
        }
        this.applyChunk(requestId, adapter, chunk, cid);
        if (chunk.isFinal) return;
      }
    } catch (err) {
      this.clearTimer(requestId);
      this.onAdapterError(requestId, err, cid);
    }
  }

  private applyChunk(
    requestId: UUID, adapter: TTSAdapter, chunk: TTSAdapterChunk, cid: CorrelationId,
  ): void {
    const cur = this.requests.get(requestId)!;
    const receivedAt = this.clock.nowISO();
    const busChunk: TTSAudioChunk = Object.freeze({
      requestId, sessionId: cur.sessionId, seq: chunk.seq,
      audioBytes: chunk.audioBytes, mimeType: chunk.mimeType,
      isFinal: chunk.isFinal, receivedAt,
    });
    const isFirst = cur.chunkCount === 0;
    const patched = isFirst
      ? this.transitionRequest(requestId, "streaming", {
          firstChunkAt: receivedAt, mimeType: chunk.mimeType,
          chunkCount: 1, totalBytes: chunk.audioBytes.length })
      : this.patchRequest(requestId, {
          chunkCount: cur.chunkCount + 1,
          totalBytes: cur.totalBytes + chunk.audioBytes.length });
    this.emit("tts.chunk.generated",
      { session: this.sessions.get(cur.sessionId)!, request: patched, chunk: busChunk },
      receivedAt, cid);
    if (chunk.isFinal) this.completeRequest(requestId, adapter, receivedAt, cid);
  }

  private completeRequest(
    requestId: UUID, adapter: TTSAdapter, receivedAt: ISOTimestamp, cid: CorrelationId,
  ): void {
    const cur = this.requests.get(requestId)!;
    const result: TTSSynthesisResult = Object.freeze({
      requestId, chunkCount: cur.chunkCount, totalBytes: cur.totalBytes,
      mimeType: cur.mimeType!, providerDisplayName: adapter.displayName,
      completedAt: receivedAt,
    });
    const completed = this.transitionRequest(requestId, "completed", { completedAt: receivedAt });
    const session = this.patchSession(cur.sessionId, {
      completedCount: this.sessions.get(cur.sessionId)!.completedCount + 1,
    });
    this.controllers.delete(requestId);
    this.emit("tts.completed", { session, request: completed, result }, receivedAt, cid);
  }

  private onAdapterError(requestId: UUID, err: unknown, cid: CorrelationId): void {
    const cur = this.requests.get(requestId);
    if (!cur || isTerminalTTSRequestState(cur.state)) return;
    this.failRequest(requestId, "provider-rejected",
      err instanceof Error ? err.message : String(err), cid);
  }

  private failInvariant(requestId: UUID, message: string, cid: CorrelationId): void {
    this.controllers.get(requestId)?.abort();
    this.controllers.delete(requestId);
    this.failRequest(requestId, "invariant", message, cid);
  }

  private clearTimer(requestId: UUID): void {
    const t = this.timers.get(requestId);
    if (t !== undefined) { clearTimeout(t); this.timers.delete(requestId); }
  }

  private transitionRequest(
    requestId: UUID, to: TTSRequestState, patch: Partial<TTSSynthesisRequest>,
  ): TTSSynthesisRequest {
    const current = this.requests.get(requestId)!;
    ttsRequestMachine.assertTransition(current.state, to);
    const next = Object.freeze({ ...current, ...patch, state: to }) as TTSSynthesisRequest;
    this.requests.set(requestId, next);
    return next;
  }

  private patchSession(sessionId: UUID, patch: Partial<TTSSession>): TTSSession {
    const current = this.sessions.get(sessionId)!;
    const next = Object.freeze({ ...current, ...patch }) as TTSSession;
    this.sessions.set(sessionId, next);
    return next;
  }

  private patchRequest(
    requestId: UUID, patch: Partial<TTSSynthesisRequest>,
  ): TTSSynthesisRequest {
    const current = this.requests.get(requestId)!;
    const next = Object.freeze({ ...current, ...patch }) as TTSSynthesisRequest;
    this.requests.set(requestId, next);
    return next;
  }

  private emit(
    name: "tts.request.dispatched" | "tts.chunk.generated" | "tts.completed" | "tts.failed",
    payload: Record<string, unknown>, ts: ISOTimestamp, correlationId: CorrelationId,
  ): void {
    this.bus.emit({ name, ...payload, meta: { ts, correlationId } } as never);
  }
}
