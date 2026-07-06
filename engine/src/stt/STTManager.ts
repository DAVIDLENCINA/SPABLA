/**
 * SPABLA Engine — STTManager (Fase 3).
 *
 * Owner of STTSession + STTTurn snapshots. Applies the session state machine
 * and emits lifecycle events. Fase 3 is 100% in-memory: chunks are opaque
 * bytes counted only; partial/final/error injection is done via simulate*
 * methods (target of the STTAdapter in later fases). At most one active turn
 * per session — partial opens one, final closes it, error abandons it.
 */

import type { Clock, CorrelationId, UUID } from "../types/ids.js";
import type { LangCode } from "../types/language.js";
import type { EventBus } from "../event-bus/EventBus.js";
import {
  isTerminalSTTState,
  type STTError,
  type STTFinal,
  type STTPartial,
  type STTSession,
  type STTSessionState,
  type STTSpeaker,
  type STTTurn,
} from "../types/stt.js";
import { sttSessionMachine } from "./stt-session-machine.js";

export class STTManagerError extends Error {
  public readonly invariant: string;
  public readonly details: Record<string, unknown>;
  constructor(invariant: string, details: Record<string, unknown> = {}) {
    super(`STT invariant violated: ${invariant}`);
    this.name = "STTManagerError";
    this.invariant = invariant;
    this.details = details;
  }
}

export type CreateSTTSessionInput = Readonly<{
  sessionId: UUID;
  callSessionId: UUID;
  speaker: STTSpeaker;
}>;

export class STTManager {
  private readonly bus: EventBus;
  private readonly clock: Clock;
  private readonly newId: () => UUID;
  private readonly sessions: Map<UUID, STTSession> = new Map();
  private readonly turns: Map<UUID, STTTurn> = new Map();
  private readonly turnsBySession: Map<UUID, UUID[]> = new Map();

  constructor(bus: EventBus, clock: Clock, newId: () => UUID) {
    this.bus = bus;
    this.clock = clock;
    this.newId = newId;
  }

  // ── Session lifecycle ───────────────────────────────────────────────────

  createSession(input: CreateSTTSessionInput, cid: CorrelationId): STTSession {
    if (this.sessions.has(input.sessionId)) {
      throw new STTManagerError("duplicate-sessionId", { sessionId: input.sessionId });
    }
    const now = this.clock.nowISO();
    // Born idle, immediately transitioned to listening so consumers never see idle.
    const idle: STTSession = this.freezeSession({
      id: input.sessionId, callSessionId: input.callSessionId, speaker: input.speaker,
      state: "idle", createdAt: now,
      startedAt: undefined, endedAt: undefined, failedAt: undefined, failureReason: undefined,
      currentTurnId: undefined, turnCount: 0, bytesReceived: 0,
    });
    this.sessions.set(input.sessionId, idle);
    this.turnsBySession.set(input.sessionId, []);
    const listening = this.transition(input.sessionId, "listening", { startedAt: now });
    this.bus.emit({
      name: "stt.session.started",
      session: listening,
      meta: { ts: now, correlationId: cid },
    });
    return listening;
  }

  stop(sessionId: UUID, cid: CorrelationId): STTSession {
    const current = this.require(sessionId);
    if (isTerminalSTTState(current.state)) {
      throw new STTManagerError("cannot-stop-terminal", { sessionId, state: current.state });
    }
    // Close any active turn without emitting a final.
    if (current.currentTurnId !== undefined) this.closeTurn(current.currentTurnId, false);
    const now = this.clock.nowISO();
    const next = this.transition(sessionId, "completed", { endedAt: now, currentTurnId: undefined });
    this.bus.emit({
      name: "stt.session.ended",
      session: next,
      meta: { ts: now, correlationId: cid },
    });
    return next;
  }

  // ── Audio ingestion ─────────────────────────────────────────────────────

  pushChunk(sessionId: UUID, bytes: number): STTSession {
    const current = this.require(sessionId);
    if (isTerminalSTTState(current.state)) {
      throw new STTManagerError("chunk-on-terminal", { sessionId, state: current.state });
    }
    const patched = this.freezeSession({ ...current, bytesReceived: current.bytesReceived + bytes });
    this.sessions.set(sessionId, patched);
    return patched.state === "listening" ? this.transition(sessionId, "transcribing", {}) : patched;
  }

  // ── Partial / final / error injection ───────────────────────────────────

  simulatePartial(sessionId: UUID, text: string, cid: CorrelationId): STTPartial {
    const session = this.require(sessionId);
    if (isTerminalSTTState(session.state)) {
      throw new STTManagerError("partial-on-terminal", { sessionId, state: session.state });
    }
    const activated = session.state === "listening"
      ? this.transition(sessionId, "transcribing", {})
      : session;
    const turn = this.ensureActiveTurn(activated);
    const now = this.clock.nowISO();
    const partial: STTPartial = Object.freeze({
      turnId: turn.turnId,
      sessionId,
      seq: turn.partials.length,
      text,
      receivedAt: now,
    });
    const nextTurn: STTTurn = Object.freeze({
      ...turn,
      partials: Object.freeze([...turn.partials, partial]) as ReadonlyArray<STTPartial>,
    });
    this.turns.set(turn.turnId, nextTurn);
    this.bus.emit({
      name: "stt.partial",
      session: this.require(sessionId),
      turn: nextTurn,
      partial,
      meta: { ts: now, correlationId: cid },
    });
    return partial;
  }

  simulateFinal(
    sessionId: UUID,
    text: string,
    language: LangCode | null,
    cid: CorrelationId,
  ): STTFinal {
    const session = this.require(sessionId);
    if (isTerminalSTTState(session.state)) {
      throw new STTManagerError("final-on-terminal", { sessionId, state: session.state });
    }
    if (session.currentTurnId === undefined) {
      throw new STTManagerError("final-without-active-turn", { sessionId });
    }
    const now = this.clock.nowISO();
    const final: STTFinal = Object.freeze({
      turnId: session.currentTurnId,
      sessionId,
      text,
      language,
      receivedAt: now,
    });
    this.closeTurn(session.currentTurnId, true, final);
    const nextSession = this.transition(sessionId, "listening", { currentTurnId: undefined });
    const closedTurn = this.turns.get(final.turnId)!;
    this.bus.emit({
      name: "stt.final",
      session: nextSession,
      turn: closedTurn,
      final,
      meta: { ts: now, correlationId: cid },
    });
    return final;
  }

  simulateError(sessionId: UUID, code: string, message: string, cid: CorrelationId): STTError {
    const current = this.require(sessionId);
    if (isTerminalSTTState(current.state)) {
      throw new STTManagerError("error-on-terminal", { sessionId, state: current.state });
    }
    const previousState = current.state;
    const now = this.clock.nowISO();
    const error: STTError = Object.freeze({
      sessionId,
      turnId: current.currentTurnId,
      code,
      message,
      receivedAt: now,
    });
    // Abandon any active turn without a final.
    if (current.currentTurnId !== undefined) this.closeTurn(current.currentTurnId, false);
    const next = this.transition(sessionId, "failed", {
      failedAt: now, failureReason: message, currentTurnId: undefined,
    });
    this.bus.emit({
      name: "stt.failed",
      session: next,
      error,
      previousState,
      meta: { ts: now, correlationId: cid },
    });
    return error;
  }

  // ── Queries ─────────────────────────────────────────────────────────────

  getSession(sessionId: UUID): STTSession | undefined { return this.sessions.get(sessionId); }
  getTurn(turnId: UUID): STTTurn | undefined { return this.turns.get(turnId); }
  listTurns(sessionId: UUID): ReadonlyArray<STTTurn> {
    const ids = this.turnsBySession.get(sessionId) ?? [];
    return Object.freeze(ids.map((id) => this.turns.get(id)!) as STTTurn[]);
  }
  listActiveSessions(callSessionId: UUID): ReadonlyArray<STTSession> {
    const out: STTSession[] = [];
    for (const s of this.sessions.values()) {
      if (s.callSessionId === callSessionId && !isTerminalSTTState(s.state)) out.push(s);
    }
    return Object.freeze(out);
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private require(sessionId: UUID): STTSession {
    const s = this.sessions.get(sessionId);
    if (!s) throw new STTManagerError("unknown-sessionId", { sessionId });
    return s;
  }

  private transition(sessionId: UUID, to: STTSessionState, patch: Partial<STTSession>): STTSession {
    const current = this.sessions.get(sessionId)!;
    sttSessionMachine.assertTransition(current.state, to);
    const next = Object.freeze({ ...current, ...patch, state: to }) as STTSession;
    this.sessions.set(sessionId, next);
    return next;
  }

  private ensureActiveTurn(session: STTSession): STTTurn {
    if (session.currentTurnId !== undefined) {
      const existing = this.turns.get(session.currentTurnId);
      if (existing && existing.isActive) return existing;
    }
    const turnId = this.newId();
    const now = this.clock.nowISO();
    const turn: STTTurn = Object.freeze({
      turnId, sessionId: session.id, callSessionId: session.callSessionId,
      startedAt: now, endedAt: undefined,
      partials: Object.freeze([]) as ReadonlyArray<STTPartial>,
      final: undefined, isActive: true,
    });
    this.turns.set(turnId, turn);
    const list = this.turnsBySession.get(session.id) ?? [];
    list.push(turnId);
    this.turnsBySession.set(session.id, list);
    const updated = Object.freeze({
      ...session, currentTurnId: turnId, turnCount: session.turnCount + 1,
    }) as STTSession;
    this.sessions.set(session.id, updated);
    return turn;
  }

  private closeTurn(turnId: UUID, withFinal: boolean, final?: STTFinal): void {
    const turn = this.turns.get(turnId);
    if (!turn) return;
    this.turns.set(turnId, Object.freeze({
      ...turn, endedAt: this.clock.nowISO(), isActive: false,
      final: withFinal ? final : turn.final,
    }) as STTTurn);
  }

  private freezeSession(s: STTSession): STTSession { return Object.freeze({ ...s }) as STTSession; }
}
