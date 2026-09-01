/**
 * SPABLA Engine — ParticipantManager.
 *
 * Owns Participant records for the current ConversationSession. Enforces
 * role uniqueness (exactly one "local"), immutable snapshots, and the
 * language-monotonic invariant (once set, cannot revert to null).
 *
 * Emits: participant.joined, participant.left, participant.updated.
 * Does NOT emit language-related events — LanguageManager owns those.
 */

import type { UUID, Clock, CorrelationId } from "../types/ids.js";
import type { LangCode } from "../types/language.js";
import type { Participant, ParticipantRole } from "../types/participant.js";
import type { EventBus } from "../event-bus/EventBus.js";

export class ParticipantInvariantError extends Error {
  public readonly invariant: string;
  public readonly details: Record<string, unknown>;

  constructor(invariant: string, details: Record<string, unknown>) {
    super(`Participant invariant violated: ${invariant}`);
    this.name = "ParticipantInvariantError";
    this.invariant = invariant;
    this.details = details;
  }
}

export type AddParticipantInput = Readonly<{
  userId: UUID;
  displayName: string;
  language: LangCode | null;
  role: ParticipantRole;
}>;

export class ParticipantManager {
  private readonly bus: EventBus;
  private readonly clock: Clock;
  private readonly byId: Map<UUID, Participant> = new Map();

  constructor(bus: EventBus, clock: Clock) {
    this.bus = bus;
    this.clock = clock;
  }

  /** Add a participant and emit participant.joined. */
  add(input: AddParticipantInput, correlationId: CorrelationId): Participant {
    if (this.byId.has(input.userId)) {
      throw new ParticipantInvariantError("no-duplicate-userId", { userId: input.userId });
    }
    if (input.role === "local") {
      for (const existing of this.byId.values()) {
        if (existing.role === "local") {
          throw new ParticipantInvariantError("single-local-role", { existing: existing.userId });
        }
      }
    }
    const snapshot: Participant = Object.freeze({
      userId: input.userId,
      displayName: input.displayName,
      language: input.language,
      role: input.role,
      joinedAt: this.clock.nowISO(),
      isOnline: true,
    });
    this.byId.set(input.userId, snapshot);
    this.bus.emit({
      name: "participant.joined",
      participant: snapshot,
      meta: { ts: this.clock.nowISO(), correlationId },
    });
    return snapshot;
  }

  /** Update language. Enforces monotonic constraint: non-null → non-null. */
  updateLanguage(userId: UUID, language: LangCode, correlationId: CorrelationId): Participant {
    const current = this.requireExisting(userId);
    if (current.language !== null && language !== current.language) {
      // Language can CHANGE (different code) but cannot revert to null.
      // This branch handles the "change to different language" case.
    }
    const next = this.replace(current, { language });
    this.bus.emit({
      name: "participant.updated",
      participant: next,
      meta: { ts: this.clock.nowISO(), correlationId },
    });
    return next;
  }

  /** Update online presence. */
  updateOnline(userId: UUID, isOnline: boolean, correlationId: CorrelationId): Participant {
    const current = this.requireExisting(userId);
    const next = this.replace(current, { isOnline });
    this.bus.emit({
      name: "participant.updated",
      participant: next,
      meta: { ts: this.clock.nowISO(), correlationId },
    });
    return next;
  }

  /** Remove (emit participant.left). Does not delete history — snapshot is gone. */
  remove(userId: UUID, correlationId: CorrelationId): void {
    if (!this.byId.has(userId)) {
      throw new ParticipantInvariantError("cannot-remove-unknown", { userId });
    }
    this.byId.delete(userId);
    this.bus.emit({
      name: "participant.left",
      participantId: userId,
      meta: { ts: this.clock.nowISO(), correlationId },
    });
  }

  /** Snapshot of all participants. */
  list(): ReadonlyArray<Participant> {
    return Array.from(this.byId.values());
  }

  /** Get by id, or undefined. */
  get(userId: UUID): Participant | undefined {
    return this.byId.get(userId);
  }

  /** The (unique) local participant, or undefined if not yet added. */
  local(): Participant | undefined {
    for (const p of this.byId.values()) if (p.role === "local") return p;
    return undefined;
  }

  /** The remote participant (first with role "remote"), or undefined. */
  remote(): Participant | undefined {
    for (const p of this.byId.values()) if (p.role === "remote") return p;
    return undefined;
  }

  private requireExisting(userId: UUID): Participant {
    const current = this.byId.get(userId);
    if (!current) {
      throw new ParticipantInvariantError("unknown-participant", { userId });
    }
    return current;
  }

  private replace(current: Participant, patch: Partial<Participant>): Participant {
    const merged: Participant = Object.freeze({
      ...current,
      ...patch,
    });
    this.byId.set(current.userId, merged);
    return merged;
  }
}
