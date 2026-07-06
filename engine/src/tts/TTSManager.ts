/**
 * SPABLA Engine — TTSManager (Fase 5). Owner de Session + Request
 * snapshots. Delega la orquestación del stream (dispatch, consumo del
 * AsyncIterable, timeout, cancel, invariantes) al `TTSRuntime`
 * hermano.
 */

import type { Clock, CorrelationId, UUID } from "../types/ids.js";
import type { LangCode } from "../types/language.js";
import type { EventBus } from "../event-bus/EventBus.js";
import type { AdapterRegistry } from "../adapter-registry/AdapterRegistry.js";
import {
  isTerminalTTSRequestState,
  isTerminalTTSSessionState,
  type TTSAdapter,
  type TTSSession,
  type TTSSessionState,
  type TTSSynthesisRequest,
  type TTSVoiceConfig,
} from "../types/tts.js";
import { ttsSessionMachine } from "./tts-machine.js";
import { TTSRuntime } from "./tts-runtime.js";

export class TTSManagerError extends Error {
  public readonly invariant: string;
  public readonly details: Record<string, unknown>;
  constructor(invariant: string, details: Record<string, unknown> = {}) {
    super(`TTS invariant violated: ${invariant}`);
    this.name = "TTSManagerError";
    this.invariant = invariant;
    this.details = details;
  }
}

export type CreateTTSSessionInput = Readonly<{
  sessionId: UUID; callSessionId: UUID; voice: TTSVoiceConfig;
}>;

export type RequestSpeechInput = Readonly<{
  sessionId: UUID; text: string; language?: LangCode; voiceId?: string;
  sourceTranslationRequestId?: UUID;
}>;

export type TTSManagerOptions = Readonly<{ firstChunkTimeoutMs?: number }>;

export const DEFAULT_FIRST_CHUNK_TIMEOUT_MS = 10_000;

export class TTSManager {
  private readonly bus: EventBus;
  private readonly clock: Clock;
  private readonly newId: () => UUID;
  private readonly adapters: AdapterRegistry;
  private readonly sessions: Map<UUID, TTSSession> = new Map();
  private readonly requests: Map<UUID, TTSSynthesisRequest> = new Map();
  private readonly runtime: TTSRuntime;

  constructor(
    bus: EventBus, clock: Clock, newId: () => UUID,
    adapters: AdapterRegistry, opts: TTSManagerOptions = {},
  ) {
    this.bus = bus;
    this.clock = clock;
    this.newId = newId;
    this.adapters = adapters;
    this.runtime = new TTSRuntime(bus, clock, this.sessions, this.requests,
      opts.firstChunkTimeoutMs ?? DEFAULT_FIRST_CHUNK_TIMEOUT_MS);
  }

  // ── Session lifecycle ───────────────────────────────────────────────────

  createSession(input: CreateTTSSessionInput, cid: CorrelationId): TTSSession {
    if (this.sessions.has(input.sessionId)) {
      throw new TTSManagerError("duplicate-sessionId", { sessionId: input.sessionId });
    }
    const now = this.clock.nowISO();
    this.sessions.set(input.sessionId, Object.freeze({
      id: input.sessionId, callSessionId: input.callSessionId, voice: input.voice,
      state: "idle", createdAt: now,
      startedAt: undefined, endedAt: undefined, failedAt: undefined, failureReason: undefined,
      requestCount: 0, completedCount: 0, failedCount: 0, cancelledCount: 0,
    }) as TTSSession);
    const active = this.transitionSession(input.sessionId, "active", { startedAt: now });
    this.bus.emit({ name: "tts.session.started", session: active,
      meta: { ts: now, correlationId: cid } });
    return active;
  }

  stop(sessionId: UUID, cid: CorrelationId): TTSSession {
    const current = this.requireSession(sessionId);
    if (isTerminalTTSSessionState(current.state)) {
      throw new TTSManagerError("cannot-stop-terminal", { sessionId, state: current.state });
    }
    for (const req of this.requests.values()) {
      if (req.sessionId === sessionId && !isTerminalTTSRequestState(req.state)) {
        this.runtime.cancelRequest(req.id, cid);
      }
    }
    const now = this.clock.nowISO();
    const next = this.transitionSession(sessionId, "completed", { endedAt: now });
    this.bus.emit({ name: "tts.session.ended", session: next,
      meta: { ts: now, correlationId: cid } });
    return next;
  }

  // ── Request lifecycle ───────────────────────────────────────────────────

  requestSpeech(input: RequestSpeechInput, cid: CorrelationId): TTSSynthesisRequest {
    const session = this.requireSession(input.sessionId);
    if (input.text.length === 0) {
      throw new TTSManagerError("empty-text", { sessionId: input.sessionId });
    }
    const now = this.clock.nowISO();
    const requestId = this.newId();
    const created: TTSSynthesisRequest = Object.freeze({
      id: requestId, sessionId: input.sessionId, callSessionId: session.callSessionId,
      text: input.text, language: input.language ?? session.voice.language,
      voiceId: input.voiceId ?? session.voice.voiceId,
      sourceTranslationRequestId: input.sourceTranslationRequestId,
      state: "created", createdAt: now,
      dispatchedAt: undefined, firstChunkAt: undefined,
      completedAt: undefined, failedAt: undefined, cancelledAt: undefined,
      chunkCount: 0, totalBytes: 0, mimeType: undefined, error: undefined,
    }) as TTSSynthesisRequest;
    this.requests.set(requestId, created);
    const withCounter = Object.freeze({
      ...session, requestCount: session.requestCount + 1,
    }) as TTSSession;
    this.sessions.set(input.sessionId, withCounter);
    this.bus.emit({ name: "tts.request.created", session: withCounter, request: created,
      meta: { ts: now, correlationId: cid } });
    if (isTerminalTTSSessionState(withCounter.state)) {
      return this.runtime.failRequest(requestId, "session-terminal",
        `session ${input.sessionId} is ${withCounter.state}`, cid);
    }
    const adapter = this.adapters.get("tts") as TTSAdapter | undefined;
    if (!adapter) {
      return this.runtime.failRequest(requestId, "no-adapter",
        "no TTSAdapter registered for kind 'tts'", cid);
    }
    return this.runtime.dispatch(created, adapter, cid);
  }

  // ── Queries ─────────────────────────────────────────────────────────────

  getSession(id: UUID): TTSSession | undefined { return this.sessions.get(id); }
  getRequest(id: UUID): TTSSynthesisRequest | undefined { return this.requests.get(id); }
  listActiveSessions(callId: UUID): ReadonlyArray<TTSSession> {
    const out: TTSSession[] = [];
    for (const s of this.sessions.values()) {
      if (s.callSessionId === callId && !isTerminalTTSSessionState(s.state)) out.push(s);
    }
    return Object.freeze(out);
  }
  listRequests(sessionId: UUID): ReadonlyArray<TTSSynthesisRequest> {
    const out: TTSSynthesisRequest[] = [];
    for (const r of this.requests.values()) if (r.sessionId === sessionId) out.push(r);
    return Object.freeze(out);
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private requireSession(sessionId: UUID): TTSSession {
    const s = this.sessions.get(sessionId);
    if (!s) throw new TTSManagerError("unknown-sessionId", { sessionId });
    return s;
  }

  private transitionSession(
    sessionId: UUID, to: TTSSessionState, patch: Partial<TTSSession>,
  ): TTSSession {
    const current = this.sessions.get(sessionId)!;
    ttsSessionMachine.assertTransition(current.state, to);
    const next = Object.freeze({ ...current, ...patch, state: to }) as TTSSession;
    this.sessions.set(sessionId, next);
    return next;
  }
}
