/**
 * SPABLA Engine — LanguageManager.
 *
 * Owns the LanguagePair resolution sub-machine. Observes participants and
 * emits the correct languagePair.* events when the pair becomes viable,
 * changes, or fails.
 *
 * The Engine calls `recompute` whenever ParticipantManager reports a change
 * that could affect the pair. LanguageManager is a pure derivation over the
 * current participants + clock; it does not subscribe to the bus itself
 * (the Engine orchestrates the wiring so there's no circular flow).
 */

import type { Clock, CorrelationId } from "../types/ids.js";
import type { LanguagePair } from "../types/language.js";
import { languagePairEquals, makeLanguagePair } from "../types/language.js";
import type { Participant } from "../types/participant.js";
import type { EventBus } from "../event-bus/EventBus.js";
import {
  languageResolutionMachine,
  type LanguageResolutionState,
} from "../state-machine/language-resolution.js";
import type { LanguagePairUnresolvableReason } from "../types/conversation.js";

export type LanguageResolutionSnapshot = Readonly<{
  state: LanguageResolutionState;
  pair: LanguagePair | undefined;
  reason: LanguagePairUnresolvableReason | undefined;
}>;

export class LanguageManager {
  private readonly bus: EventBus;
  private readonly clock: Clock;
  private state: LanguageResolutionState = "unresolved";
  private currentPair: LanguagePair | undefined = undefined;
  private currentReason: LanguagePairUnresolvableReason | undefined = undefined;

  constructor(bus: EventBus, clock: Clock) {
    this.bus = bus;
    this.clock = clock;
  }

  /**
   * Given the current list of participants, derive the LanguagePair state
   * and emit the appropriate event when it changes.
   *
   * Called by the Engine on every participant.joined / .updated / .left.
   */
  recompute(participants: ReadonlyArray<Participant>, correlationId: CorrelationId): LanguageResolutionSnapshot {
    const local = participants.find((p) => p.role === "local");
    const remote = participants.find((p) => p.role === "remote");

    // Move into "resolving" as our working state (but only when the current
    // state permits — from resolved back to resolving is allowed).
    this.transition("resolving");

    // No remote yet — cannot resolve.
    if (!remote) {
      return this.applyUnresolvable("no-remote", correlationId);
    }
    if (!local || local.language === null || remote.language === null) {
      // Not enough info yet — stay in resolving; caller will trigger again.
      // We do not emit a public event here.
      return this.snapshot();
    }
    if (local.language === remote.language) {
      return this.applyUnresolvable("same-language", correlationId);
    }

    // Both known and different — build a pair from local's perspective.
    const nextPair = makeLanguagePair(local.language, remote.language);
    if (this.currentPair && languagePairEquals(this.currentPair, nextPair)) {
      // Same as before — no change, no emit.
      this.transition("resolved");
      return this.snapshot();
    }
    if (this.currentPair) {
      // Pair changed — emit languagePair.changed.
      const previousPair = this.currentPair;
      this.currentPair = nextPair;
      this.currentReason = undefined;
      this.transition("resolved");
      this.bus.emit({
        name: "languagePair.changed",
        from: previousPair,
        to: nextPair,
        meta: { ts: this.clock.nowISO(), correlationId },
      });
      return this.snapshot();
    }
    // First-time resolution.
    this.currentPair = nextPair;
    this.currentReason = undefined;
    this.transition("resolved");
    this.bus.emit({
      name: "languagePair.resolved",
      pair: nextPair,
      meta: { ts: this.clock.nowISO(), correlationId },
    });
    return this.snapshot();
  }

  /**
   * Forces the state to a specific unresolvable and emits the corresponding
   * event. Currently only "timeout" is externally-triggered; other reasons
   * are computed inside recompute().
   */
  markTimeout(correlationId: CorrelationId): LanguageResolutionSnapshot {
    return this.applyUnresolvable("timeout", correlationId);
  }

  snapshot(): LanguageResolutionSnapshot {
    return Object.freeze({
      state: this.state,
      pair: this.currentPair,
      reason: this.currentReason,
    });
  }

  private applyUnresolvable(
    reason: LanguagePairUnresolvableReason,
    correlationId: CorrelationId,
  ): LanguageResolutionSnapshot {
    // Only emit if it's a new reason (avoid noise).
    const isNew = this.currentReason !== reason || this.currentPair !== undefined;
    this.currentPair = undefined;
    this.currentReason = reason;
    if (reason === "same-language") this.transition("unresolvable-same");
    else if (reason === "timeout") this.transition("unresolvable-timeout");
    else this.transition("resolving"); // "no-remote" stays as resolving (not a terminal problem)
    if (isNew && reason !== "no-remote") {
      this.bus.emit({
        name: "languagePair.unresolvable",
        reason,
        meta: { ts: this.clock.nowISO(), correlationId },
      });
    }
    return this.snapshot();
  }

  private transition(next: LanguageResolutionState): void {
    if (this.state === next) return;
    if (!languageResolutionMachine.canTransition(this.state, next)) {
      // Fall back silently — the sub-machine is internal. Emit a telemetry
      // invariant violation so we still get visibility if this ever fires.
      this.bus.emit({
        name: "telemetry.invariant.violated",
        primitive: "LanguageResolution",
        invariant: "sub-machine-transition",
        details: { from: this.state, to: next },
        meta: { ts: this.clock.nowISO(), correlationId: "internal" as CorrelationId },
      });
      return;
    }
    this.state = next;
  }
}
