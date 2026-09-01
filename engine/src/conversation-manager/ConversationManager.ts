/**
 * SPABLA Engine — ConversationManager.
 *
 * Composes ParticipantManager + LanguageManager into the ConversationSession
 * snapshot. Owns the id / createdAt / createdCallSessions collection.
 * Emits: conversation.loaded (once per load).
 *
 * Does NOT own CallSessions themselves — SessionManager does. This module
 * only tracks the id list for auditability of the ConversationSession.
 */

import type { UUID, Clock, CorrelationId, ISOTimestamp } from "../types/ids.js";
import type { ConversationSession } from "../types/conversation.js";
import type { EventBus } from "../event-bus/EventBus.js";
import type { ParticipantManager } from "../participant-manager/ParticipantManager.js";
import type { LanguageManager } from "../language-manager/LanguageManager.js";
import type { Participant } from "../types/participant.js";

export class ConversationInvariantError extends Error {
  public readonly invariant: string;
  constructor(invariant: string) {
    super(`Conversation invariant violated: ${invariant}`);
    this.name = "ConversationInvariantError";
    this.invariant = invariant;
  }
}

export class ConversationManager {
  private readonly bus: EventBus;
  private readonly clock: Clock;
  private readonly participants: ParticipantManager;
  private readonly languages: LanguageManager;
  private loaded = false;
  private id: UUID | undefined = undefined;
  private createdAt: ISOTimestamp | undefined = undefined;
  private callSessionIds: UUID[] = [];

  constructor(
    bus: EventBus,
    clock: Clock,
    participants: ParticipantManager,
    languages: LanguageManager,
  ) {
    this.bus = bus;
    this.clock = clock;
    this.participants = participants;
    this.languages = languages;
  }

  /**
   * Marks the conversation as loaded. Must be called after the local
   * participant is added via ParticipantManager (Engine sequences this).
   */
  load(id: UUID, correlationId: CorrelationId): ConversationSession {
    if (this.loaded) {
      throw new ConversationInvariantError("already-loaded");
    }
    if (!this.participants.local()) {
      throw new ConversationInvariantError("local-participant-required-before-load");
    }
    this.loaded = true;
    this.id = id;
    this.createdAt = this.clock.nowISO();
    const snap = this.buildSnapshot();
    this.bus.emit({
      name: "conversation.loaded",
      conversation: snap,
      meta: { ts: this.clock.nowISO(), correlationId },
    });
    return snap;
  }

  /** Records a CallSession id in the conversation's history. */
  registerCallSessionId(callId: UUID): void {
    if (!this.loaded) {
      throw new ConversationInvariantError("not-loaded");
    }
    if (this.callSessionIds.includes(callId)) return;
    this.callSessionIds = [...this.callSessionIds, callId];
  }

  /** Current snapshot; undefined until load() is called. */
  snapshot(): ConversationSession | undefined {
    if (!this.loaded) return undefined;
    return this.buildSnapshot();
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  private buildSnapshot(): ConversationSession {
    if (!this.id || !this.createdAt) {
      throw new ConversationInvariantError("snapshot-before-load");
    }
    const local = this.participants.local();
    if (!local) {
      throw new ConversationInvariantError("local-participant-missing-at-snapshot");
    }
    const remote = this.participants.remote();
    const all: ReadonlyArray<Participant> = Object.freeze(this.participants.list());
    const snap: ConversationSession = Object.freeze({
      id: this.id,
      createdAt: this.createdAt,
      participants: all,
      localParticipant: local,
      remoteParticipant: remote,
      languagePair: this.languages.snapshot().pair,
      createdCallSessions: Object.freeze([...this.callSessionIds]),
    });
    return snap;
  }
}
