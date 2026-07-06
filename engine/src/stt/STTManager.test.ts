import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../event-bus/EventBus.js";
import { STTManager, STTManagerError } from "./STTManager.js";
import { InvalidTransitionError } from "../state-machine/StateMachine.js";
import { asCorrelationId, asISOTimestamp, asUUID, type Clock } from "../types/ids.js";
import type { STTSession } from "../types/stt.js";

function clock(): Clock {
  let n = 1_700_000_000_000;
  return { nowISO: () => asISOTimestamp(new Date(n++).toISOString()), nowMs: () => n };
}
let idCounter = 0;
function newId(): ReturnType<typeof asUUID> {
  return asUUID(`turn-${++idCounter}`);
}
function makeManager() {
  idCounter = 0;
  return new STTManager(new EventBus(), clock(), newId);
}
function makeManagerWithBus() {
  const bus = new EventBus();
  idCounter = 0;
  return { bus, mgr: new STTManager(bus, clock(), newId) };
}

const CID = asCorrelationId("test-corr");
const CALL = asUUID("call-1");
const SESSION = asUUID("s-1");

function baseCreate() {
  return { sessionId: SESSION, callSessionId: CALL, speaker: "local" as const };
}

// ─────────────────────────────────────────────────────────────────────────────
// createSession (5)
// ─────────────────────────────────────────────────────────────────────────────
describe("STTManager — createSession", () => {
  it("creates the session and transitions idle → listening in one step", () => {
    const mgr = makeManager();
    const s = mgr.createSession(baseCreate(), CID);
    expect(s.state).toBe("listening");
    expect(s.startedAt).toBeDefined();
    expect(s.turnCount).toBe(0);
    expect(s.bytesReceived).toBe(0);
  });

  it("emits stt.session.started with the listening snapshot", () => {
    const { bus, mgr } = makeManagerWithBus();
    const started = vi.fn();
    bus.on("stt.session.started", started);
    mgr.createSession(baseCreate(), CID);
    expect(started).toHaveBeenCalledTimes(1);
    expect(started.mock.calls[0]?.[0].session.state).toBe("listening");
  });

  it("rejects duplicate sessionId", () => {
    const mgr = makeManager();
    mgr.createSession(baseCreate(), CID);
    expect(() => mgr.createSession(baseCreate(), CID)).toThrow(STTManagerError);
  });

  it("stores callSessionId and speaker verbatim", () => {
    const mgr = makeManager();
    const s = mgr.createSession(baseCreate(), CID);
    expect(s.callSessionId).toBe(CALL);
    expect(s.speaker).toBe("local");
  });

  it("returned snapshot is frozen", () => {
    const mgr = makeManager();
    const s = mgr.createSession(baseCreate(), CID);
    expect(Object.isFrozen(s)).toBe(true);
    expect(mgr.getSession(SESSION)).toEqual(s);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// pushChunk / open turn (5)
// ─────────────────────────────────────────────────────────────────────────────
describe("STTManager — pushChunk", () => {
  it("first chunk transitions listening → transcribing", () => {
    const mgr = makeManager();
    mgr.createSession(baseCreate(), CID);
    const s = mgr.pushChunk(SESSION, 128);
    expect(s.state).toBe("transcribing");
    expect(s.bytesReceived).toBe(128);
  });

  it("subsequent chunks accumulate bytesReceived without state change", () => {
    const mgr = makeManager();
    mgr.createSession(baseCreate(), CID);
    mgr.pushChunk(SESSION, 100);
    const s = mgr.pushChunk(SESSION, 50);
    expect(s.state).toBe("transcribing");
    expect(s.bytesReceived).toBe(150);
  });

  it("does not open a turn by itself (partial does)", () => {
    const mgr = makeManager();
    mgr.createSession(baseCreate(), CID);
    mgr.pushChunk(SESSION, 100);
    expect(mgr.getSession(SESSION)?.currentTurnId).toBeUndefined();
    expect(mgr.listTurns(SESSION)).toHaveLength(0);
  });

  it("rejects chunk on unknown session", () => {
    const mgr = makeManager();
    expect(() => mgr.pushChunk(asUUID("nope"), 1)).toThrow(STTManagerError);
  });

  it("rejects chunk once the session is terminal", () => {
    const mgr = makeManager();
    mgr.createSession(baseCreate(), CID);
    mgr.stop(SESSION, CID);
    expect(() => mgr.pushChunk(SESSION, 1)).toThrow(STTManagerError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// partial + final (6)
// ─────────────────────────────────────────────────────────────────────────────
describe("STTManager — partial + final", () => {
  it("simulatePartial emits stt.partial with monotonic seq", () => {
    const { bus, mgr } = makeManagerWithBus();
    mgr.createSession(baseCreate(), CID);
    const partial = vi.fn();
    bus.on("stt.partial", partial);
    mgr.simulatePartial(SESSION, "hola", CID);
    mgr.simulatePartial(SESSION, "hola mundo", CID);
    expect(partial).toHaveBeenCalledTimes(2);
    expect(partial.mock.calls[0]?.[0].partial.seq).toBe(0);
    expect(partial.mock.calls[1]?.[0].partial.seq).toBe(1);
  });

  it("multiple partials share the same turnId", () => {
    const mgr = makeManager();
    mgr.createSession(baseCreate(), CID);
    const a = mgr.simulatePartial(SESSION, "hi", CID);
    const b = mgr.simulatePartial(SESSION, "hi there", CID);
    expect(a.turnId).toBe(b.turnId);
  });

  it("simulateFinal emits stt.final with text and language", () => {
    const { bus, mgr } = makeManagerWithBus();
    mgr.createSession(baseCreate(), CID);
    mgr.simulatePartial(SESSION, "hola", CID);
    const final = vi.fn();
    bus.on("stt.final", final);
    mgr.simulateFinal(SESSION, "hola mundo", "es", CID);
    expect(final).toHaveBeenCalledTimes(1);
    expect(final.mock.calls[0]?.[0].final.text).toBe("hola mundo");
    expect(final.mock.calls[0]?.[0].final.language).toBe("es");
  });

  it("simulateFinal transitions transcribing → listening and closes the turn", () => {
    const mgr = makeManager();
    mgr.createSession(baseCreate(), CID);
    mgr.simulatePartial(SESSION, "hi", CID);
    const turnBefore = mgr.getSession(SESSION)!.currentTurnId!;
    mgr.simulateFinal(SESSION, "hi world", "en", CID);
    const session = mgr.getSession(SESSION)!;
    expect(session.state).toBe("listening");
    expect(session.currentTurnId).toBeUndefined();
    expect(mgr.getTurn(turnBefore)?.isActive).toBe(false);
    expect(mgr.getTurn(turnBefore)?.endedAt).toBeDefined();
  });

  it("closed turn preserves its partials and final", () => {
    const mgr = makeManager();
    mgr.createSession(baseCreate(), CID);
    mgr.simulatePartial(SESSION, "one", CID);
    mgr.simulatePartial(SESSION, "one two", CID);
    mgr.simulateFinal(SESSION, "one two three", "en", CID);
    const turns = mgr.listTurns(SESSION);
    expect(turns).toHaveLength(1);
    expect(turns[0]?.partials).toHaveLength(2);
    expect(turns[0]?.final?.text).toBe("one two three");
  });

  it("simulateFinal without an active turn throws", () => {
    const mgr = makeManager();
    mgr.createSession(baseCreate(), CID);
    expect(() => mgr.simulateFinal(SESSION, "no-turn", "en", CID)).toThrow(STTManagerError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// stop + errors (5)
// ─────────────────────────────────────────────────────────────────────────────
describe("STTManager — stop and errors", () => {
  it("stop from listening → completed and emits stt.session.ended", () => {
    const { bus, mgr } = makeManagerWithBus();
    mgr.createSession(baseCreate(), CID);
    const ended = vi.fn();
    bus.on("stt.session.ended", ended);
    const s = mgr.stop(SESSION, CID);
    expect(s.state).toBe("completed");
    expect(s.endedAt).toBeDefined();
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("stop from transcribing closes the active turn without a final", () => {
    const mgr = makeManager();
    mgr.createSession(baseCreate(), CID);
    mgr.simulatePartial(SESSION, "half", CID);
    const turnId = mgr.getSession(SESSION)!.currentTurnId!;
    mgr.stop(SESSION, CID);
    expect(mgr.getTurn(turnId)?.isActive).toBe(false);
    expect(mgr.getTurn(turnId)?.final).toBeUndefined();
  });

  it("stop on a terminal session throws", () => {
    const mgr = makeManager();
    mgr.createSession(baseCreate(), CID);
    mgr.stop(SESSION, CID);
    expect(() => mgr.stop(SESSION, CID)).toThrow(STTManagerError);
  });

  it("simulateError transitions to failed with previousState in the event", () => {
    const { bus, mgr } = makeManagerWithBus();
    mgr.createSession(baseCreate(), CID);
    mgr.simulatePartial(SESSION, "x", CID);
    const failed = vi.fn();
    bus.on("stt.failed", failed);
    mgr.simulateError(SESSION, "provider-timeout", "network hiccup", CID);
    expect(mgr.getSession(SESSION)?.state).toBe("failed");
    expect(failed).toHaveBeenCalledTimes(1);
    expect(failed.mock.calls[0]?.[0].previousState).toBe("transcribing");
    expect(failed.mock.calls[0]?.[0].error.code).toBe("provider-timeout");
  });

  it("simulateError on a terminal session throws", () => {
    const mgr = makeManager();
    mgr.createSession(baseCreate(), CID);
    mgr.stop(SESSION, CID);
    expect(() => mgr.simulateError(SESSION, "x", "y", CID)).toThrow(STTManagerError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Queries + immutability (4)
// ─────────────────────────────────────────────────────────────────────────────
describe("STTManager — queries and immutability", () => {
  it("listTurns returns turns in chronological order", () => {
    const mgr = makeManager();
    mgr.createSession(baseCreate(), CID);
    mgr.simulatePartial(SESSION, "one", CID);
    mgr.simulateFinal(SESSION, "one done", "en", CID);
    mgr.simulatePartial(SESSION, "two", CID);
    mgr.simulateFinal(SESSION, "two done", "en", CID);
    const turns = mgr.listTurns(SESSION);
    expect(turns).toHaveLength(2);
    expect(turns[0]!.final?.text).toBe("one done");
    expect(turns[1]!.final?.text).toBe("two done");
  });

  it("mutations produce new frozen references", () => {
    const mgr = makeManager();
    const created = mgr.createSession(baseCreate(), CID);
    const afterChunk = mgr.pushChunk(SESSION, 10);
    expect(afterChunk).not.toBe(created);
    expect(Object.isFrozen(afterChunk)).toBe(true);
  });

  it("getTurn returns undefined for an unknown turnId", () => {
    const mgr = makeManager();
    expect(mgr.getTurn(asUUID("nope"))).toBeUndefined();
  });

  it("listActiveSessions filters by callSessionId and excludes terminals", () => {
    const mgr = makeManager();
    mgr.createSession(baseCreate(), CID);
    mgr.createSession({ sessionId: asUUID("s-2"), callSessionId: CALL, speaker: "remote" }, CID);
    mgr.createSession({ sessionId: asUUID("s-3"), callSessionId: asUUID("call-2"), speaker: "local" }, CID);
    mgr.stop(SESSION, CID);
    const active = mgr.listActiveSessions(CALL);
    expect(active.map((s: STTSession) => s.id).sort()).toEqual(["s-2"]);
  });
});
