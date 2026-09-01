/**
 * SPABLA Engine — MessageStatus state machine.
 *
 * Encodes the exact transition table from Fase 2 plan §5.2 using the generic
 * `StateMachine` primitive. Any transition outside this table throws
 * `InvalidTransitionError`.
 *
 * MessageManager is the only consumer.
 */

import { buildTransitions, StateMachine } from "../state-machine/StateMachine.js";
import { TERMINAL_MESSAGE_STATUSES, type MessageStatus } from "../types/message.js";

/**
 * Allowed transitions:
 *   created   → sent | failed
 *   sent      → delivered | read | failed   (sent → read skips delivered)
 *   delivered → read | failed
 *   read      → (terminal, no exits)
 *   failed    → (terminal, no exits)
 */
const MESSAGE_STATUS_TRANSITIONS = buildTransitions<MessageStatus>({
  created:   ["sent", "failed"],
  sent:      ["delivered", "read", "failed"],
  delivered: ["read", "failed"],
  read:      [],
  failed:    [],
});

export const messageStatusMachine = new StateMachine<MessageStatus>(
  "Message",
  MESSAGE_STATUS_TRANSITIONS,
  TERMINAL_MESSAGE_STATUSES as ReadonlySet<MessageStatus>,
);
