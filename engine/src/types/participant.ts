/**
 * SPABLA Engine — Participant contract.
 *
 * A Participant is a member of a ConversationSession. Roles are exactly
 * "local" (the user running this engine instance) or "remote" (the peer).
 *
 * Participants are immutable snapshots. Mutations produce new snapshots
 * via ParticipantManager; consumers never mutate directly.
 */

import type { UUID, ISOTimestamp } from "./ids.js";
import type { LangCode } from "./language.js";

export type ParticipantRole = "local" | "remote";

export type Participant = Readonly<{
  userId: UUID;
  displayName: string;
  /**
   * `null` only allowed transiently before Supabase has loaded the user row.
   * Once set to a non-null LangCode, cannot revert to `null` in the same
   * ConversationSession (ParticipantManager enforces this).
   */
  language: LangCode | null;
  role: ParticipantRole;
  joinedAt: ISOTimestamp;
  isOnline: boolean;
}>;

/** Shallow structural equality of participant snapshots. */
export function participantEquals(a: Participant, b: Participant): boolean {
  return (
    a.userId === b.userId &&
    a.displayName === b.displayName &&
    a.language === b.language &&
    a.role === b.role &&
    a.joinedAt === b.joinedAt &&
    a.isOnline === b.isOnline
  );
}
