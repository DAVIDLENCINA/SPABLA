/**
 * SPABLA Engine — SessionManager.
 *
 * Owns CallSession snapshots and applies the CallState machine.
 *
 * Preconditions enforced at construction time:
 *  - `caller` and `callee` participants must be provided.
 *  - `languagePair` must be provided (no CallSession without a valid pair —
 *    kills the V1 race condition at the type layer).
 *
 * Emits: call.initiated / .incoming / .accepted / .rejected / .cancelled /
 *        .missed / .ended / .state.changed.
 *
 * Timeouts (30 s ringing / incoming → missed) are triggered by an external
 * scheduler that calls `expireIfStale(id, correlationId)`. Keeping the
 * scheduling outside makes the manager fully deterministic and testable.
 */

import type { UUID, Clock, CorrelationId } from "../types/ids.js";
import type { LanguagePair } from "../types/language.js";
import type { Participant } from "../types/participant.js";
import type {
  CallSession,
  CallMode,
  CallState,
  CallEndedBy,
} from "../types/call.js";
import { isTerminalCallState } from "../types/call.js";
import type { EventBus } from "../event-bus/EventBus.js";
import { callStateMachine } from "../state-machine/call-state.js";

export class CallInvariantError extends Error {
  public readonly invariant: string;
  public readonly details: Record<string, unknown>;
  constructor(invariant: string, details: Record<string, unknown>) {
    super(`Call invariant violated: ${invariant}`);
    this.name = "CallInvariantError";
    this.invariant = invariant;
    this.details = details;
  }
}

export type CreateCallInput = Readonly<{
  id: UUID;
  conversationId: UUID;
  caller: Participant;
  callee: Participant;
  languagePair: LanguagePair;
  mode: CallMode;
  /** initial state — "ringing" for outgoing / "incoming" for callee side. */
  initialState: "ringing" | "incoming";
}>;

const NAME_BY_STATE: Readonly<Record<CallState, string>> = {
  idle: "call.state.changed",
  ringing: "call.initiated",
  incoming: "call.incoming",
  accepted: "call.accepted",
  ended: "call.ended",
  rejected: "call.rejected",
  cancelled: "call.cancelled",
  missed: "call.missed",
};

export class SessionManager {
  private readonly bus: EventBus;
  private readonly clock: Clock;
  private readonly sessions: Map<UUID, CallSession> = new Map();

  constructor(bus: EventBus, clock: Clock) {
    this.bus = bus;
    this.clock = clock;
  }

  /**
   * Create the CallSession. Rejects if id collides, if caller === callee,
   * or if the initial state is not one of the two documented entry points.
   */
  create(input: CreateCallInput, correlationId: CorrelationId): CallSession {
    if (this.sessions.has(input.id)) {
      throw new CallInvariantError("duplicate-call-id", { id: input.id });
    }
    if (input.caller.userId === input.callee.userId) {
      throw new CallInvariantError("caller-equals-callee", { userId: input.caller.userId });
    }
    const now = this.clock.nowISO();
    const session: CallSession = Object.freeze({
      id: input.id,
      conversationId: input.conversationId,
      caller: input.caller,
      callee: input.callee,
      languagePair: input.languagePair,
      mode: input.mode,
      state: input.initialState,
      createdAt: now,
      acceptedAt: undefined,
      endedAt: undefined,
      endedBy: undefined,
    });
    this.sessions.set(input.id, session);
    this.emitStateEvent(session, "idle", correlationId);
    return session;
  }

  /**
   * Apply a transition. Runs it through the CallState machine and emits the
   * matching event. Returns the new snapshot.
   *
   * `endedBy` is required whenever `to` is a terminal state.
   */
  transition(
    id: UUID,
    to: CallState,
    correlationId: CorrelationId,
    opts: Readonly<{ endedBy?: CallEndedBy }> = {},
  ): CallSession {
    const current = this.require(id);
    callStateMachine.assertTransition(current.state, to);

    const now = this.clock.nowISO();
    const next: CallSession = Object.freeze({
      ...current,
      state: to,
      acceptedAt: to === "accepted" ? now : current.acceptedAt,
      endedAt: isTerminalCallState(to) ? now : current.endedAt,
      endedBy: isTerminalCallState(to) ? opts.endedBy ?? "network" : current.endedBy,
    });
    this.sessions.set(id, next);
    this.emitStateEvent(next, current.state, correlationId);
    return next;
  }

  /**
   * Convenience: expire ringing/incoming sessions to "missed" if the delta
   * exceeds `timeoutMs` from createdAt. Returns true if it expired, false
   * otherwise. Idempotent-safe.
   */
  expireIfStale(id: UUID, timeoutMs: number, correlationId: CorrelationId): boolean {
    const current = this.sessions.get(id);
    if (!current) return false;
    if (current.state !== "ringing" && current.state !== "incoming") return false;
    const createdMs = Date.parse(current.createdAt);
    if (Number.isNaN(createdMs)) return false;
    if (this.clock.nowMs() - createdMs < timeoutMs) return false;
    this.transition(id, "missed", correlationId, { endedBy: "timeout" });
    return true;
  }

  get(id: UUID): CallSession | undefined {
    return this.sessions.get(id);
  }

  /** All active (non-terminal) sessions. */
  active(): ReadonlyArray<CallSession> {
    const out: CallSession[] = [];
    for (const s of this.sessions.values()) {
      if (!isTerminalCallState(s.state)) out.push(s);
    }
    return out;
  }

  private require(id: UUID): CallSession {
    const current = this.sessions.get(id);
    if (!current) throw new CallInvariantError("unknown-call-id", { id });
    return current;
  }

  private emitStateEvent(
    session: CallSession,
    previousState: CallState,
    correlationId: CorrelationId,
  ): void {
    const meta = { ts: this.clock.nowISO(), correlationId };
    // Named transition event (e.g. call.accepted).
    const eventName = NAME_BY_STATE[session.state];
    if (eventName === "call.state.changed") {
      // No named event for this state — emit the generic one only.
    } else {
      this.bus.emit({
        name: eventName as
          | "call.initiated"
          | "call.incoming"
          | "call.accepted"
          | "call.rejected"
          | "call.cancelled"
          | "call.missed"
          | "call.ended",
        session,
        meta,
      });
    }
    // Always also emit the generic state.changed event so subscribers that
    // don't care about specifics can still track transitions.
    this.bus.emit({
      name: "call.state.changed",
      session,
      previousState,
      meta,
    });
  }
}
