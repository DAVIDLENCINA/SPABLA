import { describe, it, expect } from "vitest";
import {
  StateMachine,
  buildTransitions,
  InvalidTransitionError,
} from "./StateMachine.js";
import { callStateMachine } from "./call-state.js";
import { languageResolutionMachine } from "./language-resolution.js";
import type { CallState } from "../types/call.js";
import type { LanguageResolutionState } from "./language-resolution.js";

describe("StateMachine — generic primitive", () => {
  type Toy = "a" | "b" | "c";
  const toy = new StateMachine<Toy>(
    "Toy",
    buildTransitions<Toy>({ a: ["b"], b: ["c"], c: [] }),
    new Set<Toy>(["c"]),
  );

  it("allows declared transitions", () => {
    expect(toy.canTransition("a", "b")).toBe(true);
    expect(toy.canTransition("b", "c")).toBe(true);
  });

  it("rejects undeclared transitions", () => {
    expect(toy.canTransition("a", "c")).toBe(false);
    expect(toy.canTransition("b", "a")).toBe(false);
  });

  it("rejects any transition out of a terminal state", () => {
    expect(toy.canTransition("c", "a")).toBe(false);
    expect(toy.canTransition("c", "b")).toBe(false);
  });

  it("assertTransition throws with typed error carrying context", () => {
    try {
      toy.assertTransition("a", "c");
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidTransitionError);
      const e = err as InvalidTransitionError;
      expect(e.primitive).toBe("Toy");
      expect(e.from).toBe("a");
      expect(e.to).toBe("c");
    }
  });

  it("assertTransition returns the target on success", () => {
    expect(toy.assertTransition("a", "b")).toBe("b");
  });

  it("isTerminal reports terminal set membership", () => {
    expect(toy.isTerminal("c")).toBe(true);
    expect(toy.isTerminal("a")).toBe(false);
  });

  it("allStates enumerates every reachable state", () => {
    const states = toy.allStates();
    expect(states.has("a")).toBe(true);
    expect(states.has("b")).toBe(true);
    expect(states.has("c")).toBe(true);
    expect(states.size).toBe(3);
  });
});

describe("callStateMachine — every documented transition", () => {
  const cases: Array<[CallState, CallState, boolean]> = [
    // From §9 of SPABLA_V2_ENGINE.md
    ["idle", "ringing", true],
    ["idle", "incoming", true],
    ["ringing", "accepted", true],
    ["ringing", "cancelled", true],
    ["ringing", "missed", true],
    ["ringing", "rejected", true],
    ["ringing", "ended", true],
    ["incoming", "accepted", true],
    ["incoming", "rejected", true],
    ["incoming", "cancelled", true],
    ["incoming", "missed", true],
    ["accepted", "ended", true],
    // Invalid transitions
    ["idle", "accepted", false],
    ["idle", "ended", false],
    ["ringing", "incoming", false],
    ["accepted", "ringing", false],
    ["accepted", "cancelled", false],
    // Terminals cannot leave
    ["ended", "accepted", false],
    ["rejected", "idle", false],
    ["missed", "ringing", false],
    ["cancelled", "accepted", false],
  ];

  it.each(cases)("%s → %s allowed=%s", (from, to, expected) => {
    expect(callStateMachine.canTransition(from, to)).toBe(expected);
  });

  it("marks terminals correctly", () => {
    expect(callStateMachine.isTerminal("ended")).toBe(true);
    expect(callStateMachine.isTerminal("rejected")).toBe(true);
    expect(callStateMachine.isTerminal("missed")).toBe(true);
    expect(callStateMachine.isTerminal("cancelled")).toBe(true);
    expect(callStateMachine.isTerminal("accepted")).toBe(false);
    expect(callStateMachine.isTerminal("idle")).toBe(false);
  });
});

describe("languageResolutionMachine — sub-machine transitions", () => {
  const cases: Array<[LanguageResolutionState, LanguageResolutionState, boolean]> = [
    ["unresolved", "resolving", true],
    ["resolving", "resolved", true],
    ["resolving", "unresolvable-same", true],
    ["resolving", "unresolvable-timeout", true],
    ["resolved", "resolving", true],
    ["unresolvable-same", "resolving", true],
    ["unresolvable-timeout", "resolving", true],
    // Invalid
    ["unresolved", "resolved", false],
    ["resolving", "unresolved", false],
    ["resolved", "unresolvable-same", false],
  ];

  it.each(cases)("%s → %s allowed=%s", (from, to, expected) => {
    expect(languageResolutionMachine.canTransition(from, to)).toBe(expected);
  });

  it("has no terminal states — resolution can always retry", () => {
    for (const s of languageResolutionMachine.allStates()) {
      expect(languageResolutionMachine.isTerminal(s)).toBe(false);
    }
  });
});
