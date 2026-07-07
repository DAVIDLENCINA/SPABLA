import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../event-bus/EventBus.js";
import { TurnPipelineManager, TurnPipelineError } from "./TurnPipelineManager.js";
import { InvalidTransitionError } from "../state-machine/StateMachine.js";
import { asCorrelationId, asISOTimestamp, asUUID, type Clock } from "../types/ids.js";
import type { TurnStage } from "../types/turn.js";

function clock(): Clock {
  let n = 1_700_000_000_000;
  return {
    nowISO: () => asISOTimestamp(new Date(n++).toISOString()),
    nowMs: () => n,
  };
}

const CID = asCorrelationId("test-corr");
const CALL_ID = asUUID("call-1");
const TURN_ID = asUUID("turn-1");

function baseInput() {
  return { turnId: TURN_ID, callSessionId: CALL_ID, speaker: "local" as const };
}

describe("TurnPipelineManager — create", () => {
  it("creates a turn in stage 'created' and emits turn.started", () => {
    const bus = new EventBus();
    const mgr = new TurnPipelineManager(bus, clock());
    const handler = vi.fn();
    bus.on("turn.started", handler);
    const t = mgr.create(baseInput(), CID);
    expect(t.stage).toBe("created");
    expect(t.turnId).toBe(TURN_ID);
    expect(t.speaker).toBe("local");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(t)).toBe(true);
  });

  it("rejects duplicate turnId", () => {
    const mgr = new TurnPipelineManager(new EventBus(), clock());
    mgr.create(baseInput(), CID);
    expect(() => mgr.create(baseInput(), CID)).toThrow(TurnPipelineError);
  });

  it("accepts initialStage 'transcribing' (voice arrangement, ADR-001)", () => {
    const bus = new EventBus();
    const mgr = new TurnPipelineManager(bus, clock());
    const started = vi.fn();
    bus.on("turn.started", started);
    const t = mgr.create({ ...baseInput(), initialStage: "transcribing" }, CID);
    expect(t.stage).toBe("transcribing");
    expect(started.mock.calls[0]?.[0].turn.stage).toBe("transcribing");
  });

  it("accepts initialStage 'translating' (text arrangement, ADR-001)", () => {
    const mgr = new TurnPipelineManager(new EventBus(), clock());
    const t = mgr.create({ ...baseInput(), initialStage: "translating" }, CID);
    expect(t.stage).toBe("translating");
  });

  it("rejects terminal initialStage 'completed'", () => {
    const mgr = new TurnPipelineManager(new EventBus(), clock());
    expect(() =>
      mgr.create({ ...baseInput(), initialStage: "completed" }, CID),
    ).toThrow(TurnPipelineError);
  });

  it("rejects terminal initialStage 'failed'", () => {
    const mgr = new TurnPipelineManager(new EventBus(), clock());
    expect(() =>
      mgr.create({ ...baseInput(), initialStage: "failed" }, CID),
    ).toThrow(TurnPipelineError);
  });
});

describe("TurnPipelineManager — advance (happy path)", () => {
  it("walks the full pipeline created → completed and emits turn.completed", () => {
    const bus = new EventBus();
    const mgr = new TurnPipelineManager(bus, clock());
    mgr.create(baseInput(), CID);
    const stageChanged = vi.fn();
    const completed = vi.fn();
    bus.on("turn.stage.changed", stageChanged);
    bus.on("turn.completed", completed);
    mgr.advance(TURN_ID, "capturing", CID);
    mgr.advance(TURN_ID, "transcribing", CID);
    mgr.advance(TURN_ID, "translating", CID);
    mgr.advance(TURN_ID, "synthesizing", CID);
    mgr.advance(TURN_ID, "completed", CID);
    expect(stageChanged).toHaveBeenCalledTimes(5);
    expect(completed).toHaveBeenCalledTimes(1);
    const final = mgr.get(TURN_ID);
    expect(final?.stage).toBe("completed");
    expect(final?.completedAt).toBeDefined();
  });

  it("returned snapshot is frozen and different reference from previous", () => {
    const mgr = new TurnPipelineManager(new EventBus(), clock());
    const before = mgr.create(baseInput(), CID);
    const after = mgr.advance(TURN_ID, "capturing", CID);
    expect(after).not.toBe(before);
    expect(Object.isFrozen(after)).toBe(true);
  });

  it("supports the text-without-TTS terminal route: translating → completed (ADR-001)", () => {
    const bus = new EventBus();
    const mgr = new TurnPipelineManager(bus, clock());
    const completed = vi.fn();
    bus.on("turn.completed", completed);
    mgr.create({ ...baseInput(), initialStage: "translating" }, CID);
    mgr.advance(TURN_ID, "completed", CID);
    expect(completed).toHaveBeenCalledTimes(1);
    expect(mgr.get(TURN_ID)?.stage).toBe("completed");
    expect(mgr.get(TURN_ID)?.completedAt).toBeDefined();
  });
});

describe("TurnPipelineManager — advance (rejections)", () => {
  it("rejects skipping stages (created → transcribing)", () => {
    const mgr = new TurnPipelineManager(new EventBus(), clock());
    mgr.create(baseInput(), CID);
    expect(() => mgr.advance(TURN_ID, "transcribing", CID)).toThrow(InvalidTransitionError);
  });

  it("rejects advancing to 'failed' — must use fail() instead", () => {
    const mgr = new TurnPipelineManager(new EventBus(), clock());
    mgr.create(baseInput(), CID);
    expect(() => mgr.advance(TURN_ID, "failed", CID)).toThrow(TurnPipelineError);
  });

  it("cannot advance from a terminal stage", () => {
    const mgr = new TurnPipelineManager(new EventBus(), clock());
    mgr.create(baseInput(), CID);
    mgr.advance(TURN_ID, "capturing", CID);
    mgr.advance(TURN_ID, "transcribing", CID);
    mgr.advance(TURN_ID, "translating", CID);
    mgr.advance(TURN_ID, "synthesizing", CID);
    mgr.advance(TURN_ID, "completed", CID);
    expect(() => mgr.advance(TURN_ID, "capturing", CID)).toThrow(InvalidTransitionError);
  });

  it("throws on unknown turnId", () => {
    const mgr = new TurnPipelineManager(new EventBus(), clock());
    expect(() => mgr.advance(asUUID("nope"), "capturing", CID)).toThrow(TurnPipelineError);
  });
});

describe("TurnPipelineManager — fail", () => {
  it("marks the pipeline failed and records stage + reason", () => {
    const bus = new EventBus();
    const mgr = new TurnPipelineManager(bus, clock());
    mgr.create(baseInput(), CID);
    mgr.advance(TURN_ID, "capturing", CID);
    mgr.advance(TURN_ID, "transcribing", CID);
    const failed = vi.fn();
    bus.on("turn.failed", failed);
    const t = mgr.fail(TURN_ID, "deepgram-timeout", CID);
    expect(t.stage).toBe("failed");
    expect(t.failedStage).toBe("transcribing");
    expect(t.failureReason).toBe("deepgram-timeout");
    expect(t.failedAt).toBeDefined();
    expect(failed).toHaveBeenCalledTimes(1);
    expect(failed.mock.calls[0]?.[0].stage).toBe("transcribing");
  });

  it("cannot fail an already-completed turn", () => {
    const mgr = new TurnPipelineManager(new EventBus(), clock());
    mgr.create(baseInput(), CID);
    mgr.advance(TURN_ID, "capturing", CID);
    mgr.advance(TURN_ID, "transcribing", CID);
    mgr.advance(TURN_ID, "translating", CID);
    mgr.advance(TURN_ID, "synthesizing", CID);
    mgr.advance(TURN_ID, "completed", CID);
    expect(() => mgr.fail(TURN_ID, "reason", CID)).toThrow(TurnPipelineError);
  });

  it("cannot fail an already-failed turn", () => {
    const mgr = new TurnPipelineManager(new EventBus(), clock());
    mgr.create(baseInput(), CID);
    mgr.fail(TURN_ID, "reason-1", CID);
    expect(() => mgr.fail(TURN_ID, "reason-2", CID)).toThrow(TurnPipelineError);
  });

  it("throws on unknown turnId", () => {
    const mgr = new TurnPipelineManager(new EventBus(), clock());
    expect(() => mgr.fail(asUUID("nope"), "reason", CID)).toThrow(TurnPipelineError);
  });

  const failableFrom: TurnStage[] = ["created", "capturing", "transcribing", "translating", "synthesizing"];
  it.each(failableFrom)("can fail from stage '%s'", (stage) => {
    const mgr = new TurnPipelineManager(new EventBus(), clock());
    mgr.create(baseInput(), CID);
    if (stage !== "created") mgr.advance(TURN_ID, "capturing", CID);
    if (stage === "transcribing" || stage === "translating" || stage === "synthesizing")
      mgr.advance(TURN_ID, "transcribing", CID);
    if (stage === "translating" || stage === "synthesizing")
      mgr.advance(TURN_ID, "translating", CID);
    if (stage === "synthesizing") mgr.advance(TURN_ID, "synthesizing", CID);
    const t = mgr.fail(TURN_ID, "err", CID);
    expect(t.failedStage).toBe(stage);
  });
});

describe("TurnPipelineManager — queries", () => {
  it("activeForCall excludes completed and failed turns", () => {
    const mgr = new TurnPipelineManager(new EventBus(), clock());
    const T1 = asUUID("t-1");
    const T2 = asUUID("t-2");
    const T3 = asUUID("t-3");
    mgr.create({ turnId: T1, callSessionId: CALL_ID, speaker: "local" }, CID);
    mgr.create({ turnId: T2, callSessionId: CALL_ID, speaker: "remote" }, CID);
    mgr.create({ turnId: T3, callSessionId: CALL_ID, speaker: "local" }, CID);
    mgr.advance(T1, "capturing", CID);
    mgr.advance(T1, "transcribing", CID);
    mgr.advance(T1, "translating", CID);
    mgr.advance(T1, "synthesizing", CID);
    mgr.advance(T1, "completed", CID);
    mgr.fail(T2, "boom", CID);
    const active = mgr.activeForCall(CALL_ID);
    expect(active).toHaveLength(1);
    expect(active[0]?.turnId).toBe(T3);
  });

  it("allForCall includes every turn regardless of stage", () => {
    const mgr = new TurnPipelineManager(new EventBus(), clock());
    const T1 = asUUID("t-1");
    mgr.create({ turnId: T1, callSessionId: CALL_ID, speaker: "local" }, CID);
    mgr.fail(T1, "err", CID);
    expect(mgr.allForCall(CALL_ID)).toHaveLength(1);
  });

  it("get returns undefined for unknown turnId", () => {
    const mgr = new TurnPipelineManager(new EventBus(), clock());
    expect(mgr.get(asUUID("nope"))).toBeUndefined();
  });
});
