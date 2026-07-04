import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../event-bus/EventBus.js";
import { LanguageManager } from "./LanguageManager.js";
import { asCorrelationId, asISOTimestamp, asUUID, type Clock } from "../types/ids.js";
import type { Participant } from "../types/participant.js";

function clock(): Clock {
  return {
    nowISO: () => asISOTimestamp(new Date(1_700_000_000_000).toISOString()),
    nowMs: () => 1_700_000_000_000,
  };
}

const CID = asCorrelationId("test-corr");

function mkParticipant(
  role: "local" | "remote",
  language: Participant["language"],
  suffix: string,
): Participant {
  return Object.freeze({
    userId: asUUID(`u-${suffix}`),
    displayName: `p-${suffix}`,
    language,
    role,
    joinedAt: asISOTimestamp("2026-07-04T00:00:00.000Z"),
    isOnline: true,
  });
}

describe("LanguageManager — recompute", () => {
  it("stays silent when only local is present", () => {
    const bus = new EventBus();
    const mgr = new LanguageManager(bus, clock());
    const handler = vi.fn();
    bus.on("languagePair.resolved", handler);
    bus.on("languagePair.unresolvable", handler);
    const snap = mgr.recompute([mkParticipant("local", "es", "1")], CID);
    expect(handler).not.toHaveBeenCalled();
    expect(snap.pair).toBeUndefined();
    expect(snap.reason).toBe("no-remote");
  });

  it("stays silent when remote language is not loaded yet", () => {
    const bus = new EventBus();
    const mgr = new LanguageManager(bus, clock());
    const handler = vi.fn();
    bus.on("languagePair.resolved", handler);
    bus.on("languagePair.unresolvable", handler);
    mgr.recompute(
      [mkParticipant("local", "es", "1"), mkParticipant("remote", null, "2")],
      CID,
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it("emits languagePair.resolved when both known and different", () => {
    const bus = new EventBus();
    const mgr = new LanguageManager(bus, clock());
    const handler = vi.fn();
    bus.on("languagePair.resolved", handler);
    mgr.recompute(
      [mkParticipant("local", "es", "1"), mkParticipant("remote", "en", "2")],
      CID,
    );
    expect(handler).toHaveBeenCalledTimes(1);
    const pair = handler.mock.calls[0]?.[0].pair;
    expect(pair.from).toBe("es");
    expect(pair.to).toBe("en");
  });

  it("emits languagePair.unresolvable with reason 'same-language'", () => {
    const bus = new EventBus();
    const mgr = new LanguageManager(bus, clock());
    const handler = vi.fn();
    bus.on("languagePair.unresolvable", handler);
    mgr.recompute(
      [mkParticipant("local", "es", "1"), mkParticipant("remote", "es", "2")],
      CID,
    );
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0].reason).toBe("same-language");
  });

  it("does not re-emit resolved when the pair is unchanged", () => {
    const bus = new EventBus();
    const mgr = new LanguageManager(bus, clock());
    const handler = vi.fn();
    bus.on("languagePair.resolved", handler);
    bus.on("languagePair.changed", handler);
    const pair: Participant[] = [
      mkParticipant("local", "es", "1"),
      mkParticipant("remote", "en", "2"),
    ];
    mgr.recompute(pair, CID);
    mgr.recompute(pair, CID);
    mgr.recompute(pair, CID);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("emits languagePair.changed when the pair transitions to a different code", () => {
    const bus = new EventBus();
    const mgr = new LanguageManager(bus, clock());
    const resolved = vi.fn();
    const changed = vi.fn();
    bus.on("languagePair.resolved", resolved);
    bus.on("languagePair.changed", changed);
    mgr.recompute(
      [mkParticipant("local", "es", "1"), mkParticipant("remote", "en", "2")],
      CID,
    );
    mgr.recompute(
      [mkParticipant("local", "es", "1"), mkParticipant("remote", "fr", "2")],
      CID,
    );
    expect(resolved).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledTimes(1);
    const changeEvt = changed.mock.calls[0]?.[0];
    expect(changeEvt.from.to).toBe("en");
    expect(changeEvt.to.to).toBe("fr");
  });
});

describe("LanguageManager — markTimeout", () => {
  it("emits languagePair.unresolvable with reason 'timeout'", () => {
    const bus = new EventBus();
    const mgr = new LanguageManager(bus, clock());
    const handler = vi.fn();
    bus.on("languagePair.unresolvable", handler);
    mgr.markTimeout(CID);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0].reason).toBe("timeout");
  });
});

describe("LanguageManager — snapshot", () => {
  it("reflects current state after recompute cycles", () => {
    const bus = new EventBus();
    const mgr = new LanguageManager(bus, clock());
    expect(mgr.snapshot().state).toBe("unresolved");
    mgr.recompute([mkParticipant("local", "es", "1")], CID);
    expect(mgr.snapshot().state).toBe("resolving");
    mgr.recompute(
      [mkParticipant("local", "es", "1"), mkParticipant("remote", "en", "2")],
      CID,
    );
    expect(mgr.snapshot().state).toBe("resolved");
    expect(mgr.snapshot().pair).toBeDefined();
  });

  it("snapshot is frozen", () => {
    const mgr = new LanguageManager(new EventBus(), clock());
    expect(Object.isFrozen(mgr.snapshot())).toBe(true);
  });
});
