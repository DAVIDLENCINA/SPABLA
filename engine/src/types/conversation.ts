/**
 * SPABLA Engine — ConversationSession contract.
 *
 * A ConversationSession is the load-time context: which conversation the
 * user is inside, who is in it, whether translation is viable.
 *
 * Immutable snapshot; produced by ConversationManager, consumed via events.
 */

import type { UUID, ISOTimestamp } from "./ids.js";
import type { Participant } from "./participant.js";
import type { LanguagePair } from "./language.js";

/**
 * Load-time state for a single conversation. V2 constrains to exactly two
 * participants (local + optional remote), consistent with SPABLA product
 * decision "SPABLA is 1-a-1" (Product Core §8).
 */
export type ConversationSession = Readonly<{
  id: UUID;
  createdAt: ISOTimestamp;
  participants: ReadonlyArray<Participant>;
  /** Shortcut lookup; guaranteed present in every ConversationSession. */
  localParticipant: Participant;
  /** Undefined until the remote peer joins. */
  remoteParticipant: Participant | undefined;
  /** Undefined until LanguageManager can compute a valid pair. */
  languagePair: LanguagePair | undefined;
  /** History of CallSession ids created inside this ConversationSession. */
  createdCallSessions: ReadonlyArray<UUID>;
}>;

/** Reasons LanguagePair resolution can fail. */
export type LanguagePairUnresolvableReason =
  | "same-language"
  | "timeout"
  | "no-remote";
