/**
 * SPABLA Engine — TranslationManager (Fase 4).
 *
 * Owner of TranslationSession + TranslationRequest snapshots. Applies both
 * state machines and emits `translation.*` events. Delegates the actual
 * text-to-text work to whichever adapter is registered under kind `"mt"` in
 * the AdapterRegistry. The manager never imports a concrete provider — the
 * adapter is looked up at command time.
 *
 * Async model: `requestTranslation` returns synchronously with the
 * TranslationRequest snapshot in `dispatched` state (or `failed` if a
 * precondition trips). The adapter Promise resolves later and drives the
 * terminal transition + `translation.completed | failed` event.
 */

import type { Clock, CorrelationId, UUID } from "../types/ids.js";
import type { LangCode, LanguagePair } from "../types/language.js";
import type { EventBus } from "../event-bus/EventBus.js";
import type { AdapterRegistry } from "../adapter-registry/AdapterRegistry.js";
import {
  isTerminalTranslationSessionState,
  type TranslationAdapter,
  type TranslationError,
  type TranslationRequest,
  type TranslationRequestState,
  type TranslationResult,
  type TranslationSession,
  type TranslationSessionState,
} from "../types/translation.js";
import {
  translationRequestMachine,
  translationSessionMachine,
} from "./translation-machine.js";

export class TranslationManagerError extends Error {
  public readonly invariant: string;
  public readonly details: Record<string, unknown>;
  constructor(invariant: string, details: Record<string, unknown> = {}) {
    super(`Translation invariant violated: ${invariant}`);
    this.name = "TranslationManagerError";
    this.invariant = invariant;
    this.details = details;
  }
}

export type CreateTranslationSessionInput = Readonly<{
  sessionId: UUID;
  callSessionId: UUID;
  languagePair: LanguagePair;
}>;

export type RequestTranslationInput = Readonly<{
  sessionId: UUID;
  text: string;
  sourceLanguage: LangCode;
  sourceTurnId?: UUID;
}>;

export class TranslationManager {
  private readonly bus: EventBus;
  private readonly clock: Clock;
  private readonly newId: () => UUID;
  private readonly adapters: AdapterRegistry;
  private readonly sessions: Map<UUID, TranslationSession> = new Map();
  private readonly requests: Map<UUID, TranslationRequest> = new Map();

  constructor(bus: EventBus, clock: Clock, newId: () => UUID, adapters: AdapterRegistry) {
    this.bus = bus;
    this.clock = clock;
    this.newId = newId;
    this.adapters = adapters;
  }

  // ── Session lifecycle ───────────────────────────────────────────────────

  createSession(input: CreateTranslationSessionInput, cid: CorrelationId): TranslationSession {
    if (this.sessions.has(input.sessionId)) {
      throw new TranslationManagerError("duplicate-sessionId", { sessionId: input.sessionId });
    }
    const now = this.clock.nowISO();
    const idle: TranslationSession = this.freezeSession({
      id: input.sessionId, callSessionId: input.callSessionId,
      languagePair: input.languagePair, state: "idle", createdAt: now,
      startedAt: undefined, endedAt: undefined, failedAt: undefined, failureReason: undefined,
      requestCount: 0, completedCount: 0, failedCount: 0,
    });
    this.sessions.set(input.sessionId, idle);
    const active = this.transitionSession(input.sessionId, "active", { startedAt: now });
    this.bus.emit({
      name: "translation.session.started",
      session: active,
      meta: { ts: now, correlationId: cid },
    });
    return active;
  }

  stop(sessionId: UUID, cid: CorrelationId): TranslationSession {
    const current = this.requireSession(sessionId);
    if (isTerminalTranslationSessionState(current.state)) {
      throw new TranslationManagerError("cannot-stop-terminal", { sessionId, state: current.state });
    }
    const now = this.clock.nowISO();
    const next = this.transitionSession(sessionId, "completed", { endedAt: now });
    this.bus.emit({
      name: "translation.session.ended",
      session: next,
      meta: { ts: now, correlationId: cid },
    });
    return next;
  }

  // ── Request lifecycle ───────────────────────────────────────────────────

  requestTranslation(input: RequestTranslationInput, cid: CorrelationId): TranslationRequest {
    const session = this.requireSession(input.sessionId);
    if (input.text.length === 0) {
      throw new TranslationManagerError("empty-text", { sessionId: input.sessionId });
    }
    const now = this.clock.nowISO();
    const requestId = this.newId();
    const created: TranslationRequest = this.freezeRequest({
      id: requestId, sessionId: input.sessionId, callSessionId: session.callSessionId,
      sourceText: input.text, sourceLanguage: input.sourceLanguage,
      targetLanguage: session.languagePair.to,
      sourceTurnId: input.sourceTurnId, state: "created", createdAt: now,
      dispatchedAt: undefined, completedAt: undefined, failedAt: undefined,
      result: undefined, error: undefined,
    });
    this.requests.set(requestId, created);
    const withCounter = this.patchSession(input.sessionId, {
      requestCount: session.requestCount + 1,
    });
    this.bus.emit({
      name: "translation.request.created",
      session: withCounter,
      request: created,
      meta: { ts: now, correlationId: cid },
    });
    if (isTerminalTranslationSessionState(withCounter.state)) {
      return this.failRequest(requestId, "session-terminal",
        `session ${input.sessionId} is ${withCounter.state}`, cid);
    }
    const adapter = this.adapters.get("mt") as TranslationAdapter | undefined;
    if (!adapter) {
      return this.failRequest(requestId, "no-adapter",
        "no TranslationAdapter registered for kind 'mt'", cid);
    }
    return this.dispatch(created, adapter, cid);
  }

  // ── Queries ─────────────────────────────────────────────────────────────

  getSession(sessionId: UUID): TranslationSession | undefined { return this.sessions.get(sessionId); }
  getRequest(requestId: UUID): TranslationRequest | undefined { return this.requests.get(requestId); }
  listActiveSessions(callSessionId: UUID): ReadonlyArray<TranslationSession> {
    const out: TranslationSession[] = [];
    for (const s of this.sessions.values()) {
      if (s.callSessionId === callSessionId && !isTerminalTranslationSessionState(s.state)) out.push(s);
    }
    return Object.freeze(out);
  }
  listRequests(sessionId: UUID): ReadonlyArray<TranslationRequest> {
    const out: TranslationRequest[] = [];
    for (const r of this.requests.values()) if (r.sessionId === sessionId) out.push(r);
    return Object.freeze(out);
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private requireSession(sessionId: UUID): TranslationSession {
    const s = this.sessions.get(sessionId);
    if (!s) throw new TranslationManagerError("unknown-sessionId", { sessionId });
    return s;
  }

  private dispatch(
    request: TranslationRequest,
    adapter: TranslationAdapter,
    cid: CorrelationId,
  ): TranslationRequest {
    const now = this.clock.nowISO();
    const dispatched = this.transitionRequest(request.id, "dispatched", { dispatchedAt: now });
    this.bus.emit({
      name: "translation.request.dispatched",
      session: this.requireSession(request.sessionId),
      request: dispatched,
      meta: { ts: now, correlationId: cid },
    });
    adapter
      .translate({ requestId: request.id, text: request.sourceText,
        from: request.sourceLanguage, to: request.targetLanguage })
      .then((response) => this.onAdapterResolved(request.id, adapter, response, cid))
      .catch((err: unknown) => this.onAdapterRejected(request.id, err, cid));
    return dispatched;
  }

  private onAdapterResolved(
    requestId: UUID,
    adapter: TranslationAdapter,
    response: { translatedText: string; detectedSourceLanguage?: LangCode },
    cid: CorrelationId,
  ): void {
    // Invariant: dispatch() only fires the adapter once and stores the request
    // in `dispatched`. No other code path can move it out of `dispatched`
    // before this callback runs, so the request is always present here.
    const current = this.requests.get(requestId)!;
    const receivedAt = this.clock.nowISO();
    const result: TranslationResult = Object.freeze({
      requestId, translatedText: response.translatedText,
      targetLanguage: current.targetLanguage,
      detectedSourceLanguage: response.detectedSourceLanguage,
      providerDisplayName: adapter.displayName, receivedAt,
    });
    const completed = this.transitionRequest(requestId, "completed", {
      completedAt: receivedAt, result,
    });
    const session = this.patchSession(current.sessionId, {
      completedCount: this.requireSession(current.sessionId).completedCount + 1,
    });
    this.bus.emit({
      name: "translation.completed",
      session, request: completed, result,
      meta: { ts: receivedAt, correlationId: cid },
    });
  }

  private onAdapterRejected(requestId: UUID, err: unknown, cid: CorrelationId): void {
    // Invariant matches onAdapterResolved: the request always exists in
    // `dispatched` when this callback fires.
    const message = err instanceof Error ? err.message : String(err);
    this.failRequest(requestId, "provider-rejected", message, cid);
  }

  private failRequest(
    requestId: UUID, code: string, message: string, cid: CorrelationId,
  ): TranslationRequest {
    const receivedAt = this.clock.nowISO();
    const error: TranslationError = Object.freeze({ requestId, code, message, receivedAt });
    const failed = this.transitionRequest(requestId, "failed", {
      failedAt: receivedAt, error,
    });
    const session = this.patchSession(failed.sessionId, {
      failedCount: this.requireSession(failed.sessionId).failedCount + 1,
    });
    this.bus.emit({
      name: "translation.failed",
      session, request: failed, error,
      meta: { ts: receivedAt, correlationId: cid },
    });
    return failed;
  }

  private transitionSession(
    sessionId: UUID, to: TranslationSessionState, patch: Partial<TranslationSession>,
  ): TranslationSession {
    const current = this.sessions.get(sessionId)!;
    translationSessionMachine.assertTransition(current.state, to);
    const next = Object.freeze({ ...current, ...patch, state: to }) as TranslationSession;
    this.sessions.set(sessionId, next);
    return next;
  }

  private transitionRequest(
    requestId: UUID, to: TranslationRequestState, patch: Partial<TranslationRequest>,
  ): TranslationRequest {
    const current = this.requests.get(requestId)!;
    translationRequestMachine.assertTransition(current.state, to);
    const next = Object.freeze({ ...current, ...patch, state: to }) as TranslationRequest;
    this.requests.set(requestId, next);
    return next;
  }

  private patchSession(
    sessionId: UUID, patch: Partial<TranslationSession>,
  ): TranslationSession {
    const current = this.sessions.get(sessionId)!;
    const next = Object.freeze({ ...current, ...patch }) as TranslationSession;
    this.sessions.set(sessionId, next);
    return next;
  }

  private freezeSession(s: TranslationSession): TranslationSession {
    return Object.freeze({ ...s }) as TranslationSession;
  }

  private freezeRequest(r: TranslationRequest): TranslationRequest {
    return Object.freeze({ ...r }) as TranslationRequest;
  }
}
