import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../event-bus/EventBus.js";
import { SessionManager, CallInvariantError } from "./SessionManager.js";
import { InvalidTransitionError } from "../state-machine/StateMachine.js";
import { asCorrelationId, asISOTimestamp, asUUID, type Clock } from "../types/ids.js";
import { makeLanguagePair } from "../types/language.js";
import type { Participant } from "../types/participant.js";
import type { CallState } from "../types/call.js";

function fakeClock(): { clock: Clock; advance: (ms: number) => void } {
  let current = 1_700_000_000_000;
  return {
    clock: {
      nowMs: () => current,
      nowISO: () => asISOTimestamp(new Date(current).toISOString()),
    },
    advance: (ms: number) => {
      current += ms;
    },
  };
}

const CID = asCorrelationId("test-corr");
const CONV_ID = asUUID("conv-1");
const CALL_ID = asUUID("call-1");

function mkParticipant(role: "local" | "remote", suffix: string): Participant {
  return Object.freeze({
    userId: asUUID(`u-${suffix}`),
    displayName: `p-${suffix}`,
    language: role === "local" ? "es" : "en",
    role,
    joinedAt: asISOTimestamp("2026-07-04T00:00:00.000Z"),
    isOnline: true,
  });
}

function baseInput() {
  return {
    id: CALL_ID,
    conversationId: CONV_ID,
    caller: mkParticipant("local", "1"),
    callee: mkParticipant("remote", "2"),
    languagePair: makeLanguagePair("es", "en"),
    mode: "voice" as const,
    initialState: "ringing" as const,
  };
}

describe("SessionManager — create", () => {
  it("stores the session and emits call.initiated + call.state.changed", () => {
    const bus = new EventBus();
    const { clock } = fakeClock();
    const sm = new SessionManager(bus, clock);
    const named = vi.fn();
    const generic = vi.fn();
    bus.on("call.initiated", named);
    bus.on("call.state.changed", generic);
    const s = sm.create(baseInput(), CID);
    expect(s.state).toBe("ringing");
    expect(sm.get(CALL_ID)).toEqual(s);
    expect(named).toHaveBeenCalledTimes(1);
    expect(generic).toHaveBeenCalledTimes(1);
  });

  it("emits call.incoming when initialState is 'incoming'", () => {
    const bus = new EventBus();
    const { clock } = fakeClock();
    const sm = new SessionManager(bus, clock);
    const incoming = vi.fn();
    bus.on("call.incoming", incoming);
    sm.create({ ...baseInput(), initialState: "incoming" }, CID);
    expect(incoming).toHaveBeenCalledTimes(1);
  });

  it("rejects duplicate call id", () => {
    const sm = new SessionManager(new EventBus(), fakeClock().clock);
    sm.create(baseInput(), CID);
    expect(() => sm.create(baseInput(), CID)).toThrow(CallInvariantError);
  });

  it("rejects when caller.userId === callee.userId", () => {
    const sm = new SessionManager(new EventBus(), fakeClock().clock);
    const same = mkParticipant("local", "1");
    expect(() =>
      sm.create({ ...baseInput(), callee: { ...same, role: "remote" } }, CID),
    ).toThrow(CallInvariantError);
  });

  it("freezes the snapshot", () => {
    const sm = new SessionManager(new EventBus(), fakeClock().clock);
    const s = sm.create(baseInput(), CID);
    expect(Object.isFrozen(s)).toBe(true);
  });
});

describe("SessionManager — transition", () => {
  it("applies ringing → accepted and emits both named + generic events", () => {
    const bus = new EventBus();
    const { clock } = fakeClock();
    const sm = new SessionManager(bus, clock);
    sm.create(baseInput(), CID);
    const accepted = vi.fn();
    const generic = vi.fn();
    bus.on("call.accepted", accepted);
    bus.on("call.state.changed", generic);
    const next = sm.transition(CALL_ID, "accepted", CID);
    expect(next.state).toBe("accepted");
    expect(next.acceptedAt).toBeDefined();
    expect(accepted).toHaveBeenCalledTimes(1);
    expect(generic).toHaveBeenCalledTimes(1);
    expect(generic.mock.calls[0]?.[0].previousState).toBe("ringing");
  });

  it("applies accepted → ended and stamps endedAt / endedBy", () => {
    const bus = new EventBus();
    const { clock } = fakeClock();
    const sm = new SessionManager(bus, clock);
    sm.create(baseInput(), CID);
    sm.transition(CALL_ID, "accepted", CID);
    const ended = vi.fn();
    bus.on("call.ended", ended);
    const s = sm.transition(CALL_ID, "ended", CID, { endedBy: "caller" });
    expect(s.state).toBe("ended");
    expect(s.endedAt).toBeDefined();
    expect(s.endedBy).toBe("caller");
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("rejects transitions not allowed by the machine", () => {
    const sm = new SessionManager(new EventBus(), fakeClock().clock);
    sm.create(baseInput(), CID);
    expect(() => sm.transition(CALL_ID, "incoming", CID)).toThrow(InvalidTransitionError);
  });

  it("cannot leave a terminal state", () => {
    const sm = new SessionManager(new EventBus(), fakeClock().clock);
    sm.create(baseInput(), CID);
    sm.transition(CALL_ID, "cancelled", CID, { endedBy: "caller" });
    expect(() => sm.transition(CALL_ID, "accepted", CID)).toThrow(InvalidTransitionError);
  });

  it("defaults endedBy to 'network' when terminal reached without opts", () => {
    const sm = new SessionManager(new EventBus(), fakeClock().clock);
    sm.create(baseInput(), CID);
    sm.transition(CALL_ID, "accepted", CID);
    const s = sm.transition(CALL_ID, "ended", CID);
    expect(s.endedBy).toBe("network");
  });

  it("throws on unknown id", () => {
    const sm = new SessionManager(new EventBus(), fakeClock().clock);
    expect(() => sm.transition(asUUID("nope"), "accepted", CID)).toThrow(CallInvariantError);
  });
});

describe("SessionManager — expireIfStale", () => {
  it("expires a ringing session to missed after timeout", () => {
    const bus = new EventBus();
    const { clock, advance } = fakeClock();
    const sm = new SessionManager(bus, clock);
    sm.create(baseInput(), CID);
    const missed = vi.fn();
    bus.on("call.missed", missed);
    advance(30_001);
    expect(sm.expireIfStale(CALL_ID, 30_000, CID)).toBe(true);
    expect(sm.get(CALL_ID)?.state).toBe("missed");
    expect(missed).toHaveBeenCalledTimes(1);
  });

  it("returns false when the session is still fresh", () => {
    const { clock, advance } = fakeClock();
    const sm = new SessionManager(new EventBus(), clock);
    sm.create(baseInput(), CID);
    advance(15_000);
    expect(sm.expireIfStale(CALL_ID, 30_000, CID)).toBe(false);
    expect(sm.get(CALL_ID)?.state).toBe("ringing");
  });

  it("returns false when the session is not in ringing/incoming", () => {
    const { clock, advance } = fakeClock();
    const sm = new SessionManager(new EventBus(), clock);
    sm.create(baseInput(), CID);
    sm.transition(CALL_ID, "accepted", CID);
    advance(30_001);
    expect(sm.expireIfStale(CALL_ID, 30_000, CID)).toBe(false);
  });

  it("returns false for unknown id", () => {
    const sm = new SessionManager(new EventBus(), fakeClock().clock);
    expect(sm.expireIfStale(asUUID("nope"), 30_000, CID)).toBe(false);
  });
});

describe("SessionManager — queries", () => {
  it("active() excludes terminal sessions", () => {
    const { clock } = fakeClock();
    const sm = new SessionManager(new EventBus(), clock);
    sm.create(baseInput(), CID);
    const ID2 = asUUID("call-2");
    sm.create({ ...baseInput(), id: ID2, initialState: "incoming" }, CID);
    sm.transition(CALL_ID, "cancelled", CID, { endedBy: "caller" });
    const active = sm.active();
    expect(active).toHaveLength(1);
    expect(active[0]?.id).toBe(ID2);
  });

  it("get() returns undefined for unknown id", () => {
    const sm = new SessionManager(new EventBus(), fakeClock().clock);
    expect(sm.get(asUUID("nope"))).toBeUndefined();
  });
});

describe("SessionManager — every valid state emits the correct named event", () => {
  const paths: Array<[CallState, string]> = [
    ["accepted", "call.accepted"],
    ["cancelled", "call.cancelled"],
    ["rejected", "call.rejected"],
    ["missed", "call.missed"],
    ["ended", "call.ended"],
  ];
  it.each(paths)("ringing → %s emits %s", (target, eventName) => {
    const bus = new EventBus();
    const sm = new SessionManager(bus, fakeClock().clock);
    sm.create(baseInput(), CID);
    if (target === "ended") sm.transition(CALL_ID, "accepted", CID);
    const handler = vi.fn();
    bus.on(
      eventName as
        | "call.accepted"
        | "call.cancelled"
        | "call.rejected"
        | "call.missed"
        | "call.ended",
      handler,
    );
    sm.transition(CALL_ID, target, CID, { endedBy: "caller" });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
