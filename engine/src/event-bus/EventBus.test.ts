import { describe, it, expect, vi } from "vitest";
import { EventBus } from "./EventBus.js";
import type { EmittedEvent } from "../types/events.js";
import { asCorrelationId, asISOTimestamp, asUUID } from "../types/ids.js";
import { makeLanguagePair } from "../types/language.js";

const meta = {
  ts: asISOTimestamp("2026-07-04T00:00:00.000Z"),
  correlationId: asCorrelationId("corr-1"),
};

function makeResolvedEvent(): EmittedEvent {
  return {
    name: "languagePair.resolved",
    pair: makeLanguagePair("es", "en"),
    meta,
  };
}

function makeParticipantJoinedEvent(): EmittedEvent {
  return {
    name: "participant.joined",
    participant: {
      userId: asUUID("u-1"),
      displayName: "Ana",
      language: "es",
      role: "local",
      joinedAt: asISOTimestamp("2026-07-04T00:00:00.000Z"),
      isOnline: true,
    },
    meta,
  };
}

describe("EventBus — subscription and delivery", () => {
  it("delivers events only to matching subscribers", () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on("languagePair.resolved", a);
    bus.on("participant.joined", b);
    bus.emit(makeResolvedEvent());
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });

  it("delivers in subscription order", () => {
    const bus = new EventBus();
    const calls: string[] = [];
    bus.on("languagePair.resolved", () => calls.push("first"));
    bus.on("languagePair.resolved", () => calls.push("second"));
    bus.on("languagePair.resolved", () => calls.push("third"));
    bus.emit(makeResolvedEvent());
    expect(calls).toEqual(["first", "second", "third"]);
  });

  it("passes the emitted event verbatim to the handler", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("languagePair.resolved", handler);
    const event = makeResolvedEvent();
    bus.emit(event);
    expect(handler).toHaveBeenCalledWith(event);
  });
});

describe("EventBus — unsubscribe", () => {
  it("stops delivery after unsubscribe", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const off = bus.on("languagePair.resolved", handler);
    off();
    bus.emit(makeResolvedEvent());
    expect(handler).not.toHaveBeenCalled();
  });

  it("is idempotent when called multiple times", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const off = bus.on("languagePair.resolved", handler);
    off();
    off();
    off();
    bus.emit(makeResolvedEvent());
    expect(handler).not.toHaveBeenCalled();
  });

  it("removes empty buckets from the map", () => {
    const bus = new EventBus();
    const off = bus.on("languagePair.resolved", () => {});
    expect(bus.subscriberCount("languagePair.resolved")).toBe(1);
    off();
    expect(bus.subscriberCount("languagePair.resolved")).toBe(0);
  });

  it("supports unsubscribing during delivery without breaking other subscribers", () => {
    const bus = new EventBus();
    const calls: string[] = [];
    let off1: (() => void) | null = null;
    off1 = bus.on("languagePair.resolved", () => {
      calls.push("first");
      if (off1) off1();
    });
    bus.on("languagePair.resolved", () => calls.push("second"));
    bus.emit(makeResolvedEvent());
    expect(calls).toEqual(["first", "second"]);
  });
});

describe("EventBus — errors in subscribers", () => {
  it("routes handler exceptions to errorHandler and keeps delivering", () => {
    const errors: unknown[] = [];
    const bus = new EventBus((err) => errors.push(err));
    const second = vi.fn();
    bus.on("languagePair.resolved", () => {
      throw new Error("boom");
    });
    bus.on("languagePair.resolved", second);
    bus.emit(makeResolvedEvent());
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe("boom");
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("swallows exceptions thrown by the errorHandler itself", () => {
    const bus = new EventBus(() => {
      throw new Error("secondary");
    });
    bus.on("languagePair.resolved", () => {
      throw new Error("primary");
    });
    expect(() => bus.emit(makeResolvedEvent())).not.toThrow();
  });
});

describe("EventBus — utilities", () => {
  it("reports subscriberCount", () => {
    const bus = new EventBus();
    expect(bus.subscriberCount("participant.joined")).toBe(0);
    bus.on("participant.joined", () => {});
    bus.on("participant.joined", () => {});
    expect(bus.subscriberCount("participant.joined")).toBe(2);
  });

  it("clear() removes all handlers", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("languagePair.resolved", handler);
    bus.on("participant.joined", handler);
    bus.clear();
    bus.emit(makeResolvedEvent());
    bus.emit(makeParticipantJoinedEvent());
    expect(handler).not.toHaveBeenCalled();
  });

  it("emit is a no-op when there are no subscribers", () => {
    const bus = new EventBus();
    expect(() => bus.emit(makeResolvedEvent())).not.toThrow();
  });
});
