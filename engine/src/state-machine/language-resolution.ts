/**
 * SPABLA Engine — LanguagePair resolution sub-machine.
 *
 * Internal-only state used by LanguageManager to track resolution attempts.
 * Not surfaced directly to consumers; they see the higher-level events
 * (languagePair.resolved, .unresolvable, .changed).
 */

import { buildTransitions, StateMachine } from "./StateMachine.js";

export type LanguageResolutionState =
  | "unresolved"
  | "resolving"
  | "resolved"
  | "unresolvable-same"
  | "unresolvable-timeout";

/**
 * From SPABLA_V2_ENGINE.md §9 — sub-machine table.
 * `resolved` can go back to `resolving` when a participant.language.changed
 * triggers re-computation.
 * The `unresolvable-*` states are recoverable: if a new participant joins
 * or an existing one updates their language, we retry.
 */
const RESOLUTION_TRANSITIONS = buildTransitions<LanguageResolutionState>({
  unresolved: ["resolving"],
  resolving: ["resolved", "unresolvable-same", "unresolvable-timeout"],
  resolved: ["resolving"],
  "unresolvable-same": ["resolving"],
  "unresolvable-timeout": ["resolving"],
});

export const languageResolutionMachine = new StateMachine<LanguageResolutionState>(
  "LanguageResolution",
  RESOLUTION_TRANSITIONS,
  new Set(), // no terminal states — resolution can always retry
);
