import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventBus } from "../event-bus/EventBus.js";
import { ParticipantManager, ParticipantInvariantError } from "./ParticipantManager.js";
import { asUUID, asCorrelationId, asISOTimestamp, type Clock } from "../types/ids.js";

function fixedClock(tsMs = 1_700_000_000_000): Clock {
  return {
    nowISO: () => asISOTimestamp(new Date(tsMs).toISOString()),
    nowMs: () => tsMs,
  };
}

const CID = asCorrelationId("test-corr");

describe("ParticipantManager — add", () => {
  let bus: EventBus;
  let mgr: ParticipantManager;

  beforeEach(() => {
    bus = new EventBus();
    mgr = new ParticipantManager(bus, fixedClock());
  });

  it("adds a local participant and emits participant.joined", () => {
    const handler = vi.fn();
    bus.on("participant.joined", handler);
    const p = mgr.add(
      { userId: asUUID("u-1"), displayName: "Ana", language: "es", role: "local" },
      CID,
    );
    expect(p.userId).toBe("u-1");
    expect(p.role).toBe("local");
    expect(p.isOnline).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0].participant.userId).toBe("u-1");
  });

  it("refuses to add a duplicate userId", () => {
    mgr.add({ userId: asUUID("u-1"), displayName: "Ana", language: "es", role: "local" }, CID);
    expect(() =>
      mgr.add({ userId: asUUID("u-1"), displayName: "Ana", language: "es", role: "remote" }, CID),
    ).toThrow(ParticipantInvariantError);
  });

  it("refuses a second local (single-local-role invariant)", () => {
    mgr.add({ userId: asUUID("u-1"), displayName: "Ana", language: "es", role: "local" }, CID);
    expect(() =>
      mgr.add({ userId: asUUID("u-2"), displayName: "Bea", language: "en", role: "local" }, CID),
    ).toThrow(ParticipantInvariantError);
  });

  it("allows one local + one remote", () => {
    mgr.add({ userId: asUUID("u-1"), displayName: "Ana", language: "es", role: "local" }, CID);
    mgr.add({ userId: asUUID("u-2"), displayName: "Bea", language: "en", role: "remote" }, CID);
    expect(mgr.list()).toHaveLength(2);
    expect(mgr.local()?.userId).toBe("u-1");
    expect(mgr.remote()?.userId).toBe("u-2");
  });

  it("allows language=null on add (loading state)", () => {
    const p = mgr.add(
      { userId: asUUID("u-2"), displayName: "?", language: null, role: "remote" },
      CID,
    );
    expect(p.language).toBeNull();
  });

  it("freezes each snapshot", () => {
    const p = mgr.add(
      { userId: asUUID("u-1"), displayName: "Ana", language: "es", role: "local" },
      CID,
    );
    expect(Object.isFrozen(p)).toBe(true);
  });
});

describe("ParticipantManager — updateLanguage", () => {
  let bus: EventBus;
  let mgr: ParticipantManager;

  beforeEach(() => {
    bus = new EventBus();
    mgr = new ParticipantManager(bus, fixedClock());
  });

  it("sets language from null → LangCode and emits participant.updated", () => {
    mgr.add({ userId: asUUID("u-2"), displayName: "Bea", language: null, role: "remote" }, CID);
    const handler = vi.fn();
    bus.on("participant.updated", handler);
    const p = mgr.updateLanguage(asUUID("u-2"), "en", CID);
    expect(p.language).toBe("en");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("allows changing language between non-null codes", () => {
    mgr.add({ userId: asUUID("u-1"), displayName: "Ana", language: "es", role: "local" }, CID);
    const p = mgr.updateLanguage(asUUID("u-1"), "en", CID);
    expect(p.language).toBe("en");
  });

  it("throws on unknown participant", () => {
    expect(() => mgr.updateLanguage(asUUID("nope"), "en", CID)).toThrow(ParticipantInvariantError);
  });

  it("returned snapshot is a new frozen object, not the same reference", () => {
    const before = mgr.add(
      { userId: asUUID("u-1"), displayName: "Ana", language: null, role: "local" },
      CID,
    );
    const after = mgr.updateLanguage(asUUID("u-1"), "es", CID);
    expect(after).not.toBe(before);
    expect(Object.isFrozen(after)).toBe(true);
  });
});

describe("ParticipantManager — updateOnline", () => {
  it("toggles isOnline and emits participant.updated", () => {
    const bus = new EventBus();
    const mgr = new ParticipantManager(bus, fixedClock());
    mgr.add({ userId: asUUID("u-2"), displayName: "Bea", language: "en", role: "remote" }, CID);
    const handler = vi.fn();
    bus.on("participant.updated", handler);
    const p = mgr.updateOnline(asUUID("u-2"), false, CID);
    expect(p.isOnline).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("throws on unknown participant", () => {
    const mgr = new ParticipantManager(new EventBus(), fixedClock());
    expect(() => mgr.updateOnline(asUUID("nope"), false, CID)).toThrow(ParticipantInvariantError);
  });
});

describe("ParticipantManager — remove", () => {
  it("emits participant.left and removes from list", () => {
    const bus = new EventBus();
    const mgr = new ParticipantManager(bus, fixedClock());
    mgr.add({ userId: asUUID("u-2"), displayName: "Bea", language: "en", role: "remote" }, CID);
    const handler = vi.fn();
    bus.on("participant.left", handler);
    mgr.remove(asUUID("u-2"), CID);
    expect(mgr.list()).toHaveLength(0);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0].participantId).toBe("u-2");
  });

  it("throws when removing an unknown participant", () => {
    const mgr = new ParticipantManager(new EventBus(), fixedClock());
    expect(() => mgr.remove(asUUID("nope"), CID)).toThrow(ParticipantInvariantError);
  });
});

describe("ParticipantManager — queries", () => {
  it("list() returns an array-view of current participants", () => {
    const mgr = new ParticipantManager(new EventBus(), fixedClock());
    mgr.add({ userId: asUUID("u-1"), displayName: "Ana", language: "es", role: "local" }, CID);
    mgr.add({ userId: asUUID("u-2"), displayName: "Bea", language: "en", role: "remote" }, CID);
    const arr = mgr.list();
    expect(arr).toHaveLength(2);
    expect(arr.map((p) => p.userId).sort()).toEqual(["u-1", "u-2"]);
  });

  it("get(unknown) returns undefined", () => {
    const mgr = new ParticipantManager(new EventBus(), fixedClock());
    expect(mgr.get(asUUID("nope"))).toBeUndefined();
  });

  it("local() and remote() return undefined when absent", () => {
    const mgr = new ParticipantManager(new EventBus(), fixedClock());
    expect(mgr.local()).toBeUndefined();
    expect(mgr.remote()).toBeUndefined();
  });
});
