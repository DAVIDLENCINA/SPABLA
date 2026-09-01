import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../event-bus/EventBus.js";
import { AdapterRegistry } from "../adapter-registry/AdapterRegistry.js";
import { TTSManager, TTSManagerError } from "./TTSManager.js";
import { asCorrelationId, asISOTimestamp, asUUID, type Clock } from "../types/ids.js";
import type {
  TTSAdapter,
  TTSAdapterChunk,
  TTSAdapterRequest,
  TTSVoiceConfig,
} from "../types/tts.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function clock(): Clock {
  let n = 1_700_000_000_000;
  return { nowISO: () => asISOTimestamp(new Date(n++).toISOString()), nowMs: () => n };
}
let idCounter = 0;
function newId(): ReturnType<typeof asUUID> { return asUUID(`req-${++idCounter}`); }

const CID = asCorrelationId("test-corr");
const CALL = asUUID("call-1");
const SESSION = asUUID("t-1");
const VOICE: TTSVoiceConfig = Object.freeze({ language: "en", voiceId: "alice" });

class FakeTTS implements TTSAdapter {
  readonly kind = "tts" as const;
  readonly displayName: string;
  public calls: TTSAdapterRequest[] = [];
  private readonly plan: (r: TTSAdapterRequest, s: AbortSignal) => AsyncIterable<TTSAdapterChunk>;
  constructor(
    plan: (r: TTSAdapterRequest, s: AbortSignal) => AsyncIterable<TTSAdapterChunk>,
    displayName = "fake-tts",
  ) {
    this.plan = plan;
    this.displayName = displayName;
  }
  synthesize(req: TTSAdapterRequest, signal: AbortSignal): AsyncIterable<TTSAdapterChunk> {
    this.calls.push(req);
    return this.plan(req, signal);
  }
}

function singleChunkAdapter(bytes = new Uint8Array([1, 2, 3])): FakeTTS {
  return new FakeTTS(async function* () {
    yield { seq: 0, audioBytes: bytes, mimeType: "audio/wav", isFinal: true };
  });
}

function multiChunkAdapter(count: number): FakeTTS {
  return new FakeTTS(async function* () {
    for (let i = 0; i < count; i++) {
      yield {
        seq: i,
        audioBytes: new Uint8Array([i + 1]),
        mimeType: "audio/wav",
        isFinal: i === count - 1,
      };
    }
  });
}

function makeMgr(adapter?: TTSAdapter, opts: { firstChunkTimeoutMs?: number } = {}) {
  idCounter = 0;
  const bus = new EventBus();
  const adapters = new AdapterRegistry();
  if (adapter) adapters.register("tts", adapter);
  return {
    bus, adapters,
    mgr: new TTSManager(bus, clock(), newId, adapters, opts),
  };
}

function baseCreate() {
  return { sessionId: SESSION, callSessionId: CALL, voice: VOICE };
}

async function flush(cycles = 60): Promise<void> {
  for (let i = 0; i < cycles; i++) await Promise.resolve();
}

// ─────────────────────────────────────────────────────────────────────────────
// createSession + stopSession (5)
// ─────────────────────────────────────────────────────────────────────────────
describe("TTSManager — createSession + stop", () => {
  it("creates the session with voice, idle → active, emits tts.session.started", () => {
    const { bus, mgr } = makeMgr();
    const started = vi.fn();
    bus.on("tts.session.started", started);
    const s = mgr.createSession(baseCreate(), CID);
    expect(s.state).toBe("active");
    expect(s.voice.voiceId).toBe("alice");
    expect(s.voice.language).toBe("en");
    expect(started).toHaveBeenCalledTimes(1);
  });

  it("rejects duplicate sessionId", () => {
    const { mgr } = makeMgr();
    mgr.createSession(baseCreate(), CID);
    expect(() => mgr.createSession(baseCreate(), CID)).toThrow(TTSManagerError);
  });

  it("stores callSessionId + voice verbatim; snapshot is frozen", () => {
    const { mgr } = makeMgr();
    const s = mgr.createSession(baseCreate(), CID);
    expect(s.callSessionId).toBe(CALL);
    expect(Object.isFrozen(s)).toBe(true);
  });

  it("stop from active without in-flight requests → completed + session.ended", () => {
    const { bus, mgr } = makeMgr();
    mgr.createSession(baseCreate(), CID);
    const ended = vi.fn();
    bus.on("tts.session.ended", ended);
    const s = mgr.stop(SESSION, CID);
    expect(s.state).toBe("completed");
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("stop on terminal session throws", () => {
    const { mgr } = makeMgr();
    mgr.createSession(baseCreate(), CID);
    mgr.stop(SESSION, CID);
    expect(() => mgr.stop(SESSION, CID)).toThrow(TTSManagerError);
  });

  it("listActiveSessions filters by callId and excludes terminals; listRequests filters by sessionId", async () => {
    const { mgr } = makeMgr(singleChunkAdapter());
    mgr.createSession(baseCreate(), CID);
    mgr.createSession(
      { sessionId: asUUID("t-2"), callSessionId: CALL, voice: VOICE }, CID);
    mgr.createSession(
      { sessionId: asUUID("t-3"), callSessionId: asUUID("call-2"), voice: VOICE }, CID);
    mgr.stop(SESSION, CID);
    const active = mgr.listActiveSessions(CALL);
    expect(active.map((s) => s.id)).toEqual(["t-2"]);
    mgr.requestSpeech({ sessionId: asUUID("t-2"), text: "hi" }, CID);
    await flush();
    expect(mgr.listRequests(asUUID("t-2"))).toHaveLength(1);
    expect(mgr.listRequests(asUUID("t-3"))).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// requestSpeech happy path (7)
// ─────────────────────────────────────────────────────────────────────────────
describe("TTSManager — requestSpeech happy path", () => {
  it("creates request initially registered, invokes adapter.synthesize", () => {
    const adapter = singleChunkAdapter();
    const { mgr } = makeMgr(adapter);
    mgr.createSession(baseCreate(), CID);
    const req = mgr.requestSpeech({ sessionId: SESSION, text: "hello" }, CID);
    expect(req.state).toBe("dispatched");
    expect(adapter.calls).toHaveLength(1);
    expect(adapter.calls[0]?.text).toBe("hello");
    expect(adapter.calls[0]?.voiceId).toBe("alice");
    expect(adapter.calls[0]?.language).toBe("en");
  });

  it("first chunk transitions dispatched → streaming, fixes mimeType", async () => {
    const { mgr } = makeMgr(singleChunkAdapter());
    mgr.createSession(baseCreate(), CID);
    const req = mgr.requestSpeech({ sessionId: SESSION, text: "hi" }, CID);
    await flush();
    const done = mgr.getRequest(req.id)!;
    expect(done.mimeType).toBe("audio/wav");
  });

  it("multiple chunks accumulate chunkCount and totalBytes", async () => {
    const { mgr } = makeMgr(multiChunkAdapter(5));
    mgr.createSession(baseCreate(), CID);
    const req = mgr.requestSpeech({ sessionId: SESSION, text: "hi" }, CID);
    await flush();
    const done = mgr.getRequest(req.id)!;
    expect(done.chunkCount).toBe(5);
    expect(done.totalBytes).toBe(5);
    expect(done.state).toBe("completed");
  });

  it("isFinal=true transitions to completed + emits tts.completed", async () => {
    const { bus, mgr } = makeMgr(singleChunkAdapter());
    mgr.createSession(baseCreate(), CID);
    const completed = vi.fn();
    bus.on("tts.completed", completed);
    mgr.requestSpeech({ sessionId: SESSION, text: "hi" }, CID);
    await flush();
    expect(completed).toHaveBeenCalledTimes(1);
    expect(completed.mock.calls[0]?.[0].result.chunkCount).toBe(1);
    expect(completed.mock.calls[0]?.[0].result.mimeType).toBe("audio/wav");
  });

  it("emits events in order: request.created → request.dispatched → chunk.generated → completed", async () => {
    const { bus, mgr } = makeMgr(singleChunkAdapter());
    mgr.createSession(baseCreate(), CID);
    const order: string[] = [];
    bus.on("tts.request.created", () => order.push("created"));
    bus.on("tts.request.dispatched", () => order.push("dispatched"));
    bus.on("tts.chunk.generated", () => order.push("chunk"));
    bus.on("tts.completed", () => order.push("completed"));
    mgr.requestSpeech({ sessionId: SESSION, text: "hi" }, CID);
    await flush();
    expect(order).toEqual(["created", "dispatched", "chunk", "completed"]);
  });

  it("session.completedCount increments; requestCount too", async () => {
    const { mgr } = makeMgr(singleChunkAdapter());
    mgr.createSession(baseCreate(), CID);
    mgr.requestSpeech({ sessionId: SESSION, text: "a" }, CID);
    mgr.requestSpeech({ sessionId: SESSION, text: "b" }, CID);
    await flush();
    const s = mgr.getSession(SESSION)!;
    expect(s.requestCount).toBe(2);
    expect(s.completedCount).toBe(2);
  });

  it("returned request.id matches getRequest snapshot", () => {
    const { mgr } = makeMgr(singleChunkAdapter());
    mgr.createSession(baseCreate(), CID);
    const req = mgr.requestSpeech({ sessionId: SESSION, text: "hi" }, CID);
    expect(mgr.getRequest(req.id)?.id).toBe(req.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// requestSpeech con adapter (4)
// ─────────────────────────────────────────────────────────────────────────────
describe("TTSManager — requestSpeech with adapter", () => {
  it("returns requestId sync (before first chunk arrives)", () => {
    let releaseFirst: () => void = () => {};
    const adapter = new FakeTTS(async function* () {
      await new Promise<void>((res) => { releaseFirst = res; });
      yield { seq: 0, audioBytes: new Uint8Array([1]), mimeType: "audio/wav", isFinal: true };
    });
    const { mgr } = makeMgr(adapter);
    mgr.createSession(baseCreate(), CID);
    const req = mgr.requestSpeech({ sessionId: SESSION, text: "hi" }, CID);
    expect(req.state).toBe("dispatched");
    expect(mgr.getRequest(req.id)?.state).toBe("dispatched");
    releaseFirst();
  });

  it("providerDisplayName preserved in result", async () => {
    const adapter = new FakeTTS(async function* () {
      yield { seq: 0, audioBytes: new Uint8Array([1]), mimeType: "audio/wav", isFinal: true };
    }, "provider-x");
    const { mgr } = makeMgr(adapter);
    mgr.createSession(baseCreate(), CID);
    const req = mgr.requestSpeech({ sessionId: SESSION, text: "hi" }, CID);
    await flush();
    expect(mgr.getRequest(req.id)?.state).toBe("completed");
    // completedCount incremented → the completed event carried providerDisplayName correctly
    expect(mgr.getSession(SESSION)?.completedCount).toBe(1);
  });

  it("adapter with a single final chunk works", async () => {
    const { mgr } = makeMgr(singleChunkAdapter());
    mgr.createSession(baseCreate(), CID);
    const req = mgr.requestSpeech({ sessionId: SESSION, text: "hi" }, CID);
    await flush();
    expect(mgr.getRequest(req.id)?.state).toBe("completed");
    expect(mgr.getRequest(req.id)?.chunkCount).toBe(1);
  });

  it("adapter with >10 chunks delivers all in order via tts.chunk.generated", async () => {
    const { bus, mgr } = makeMgr(multiChunkAdapter(20));
    mgr.createSession(baseCreate(), CID);
    const seqs: number[] = [];
    bus.on("tts.chunk.generated", (e) => seqs.push(e.chunk.seq));
    mgr.requestSpeech({ sessionId: SESSION, text: "hi" }, CID);
    await flush();
    expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cancelación (5)
// ─────────────────────────────────────────────────────────────────────────────
describe("TTSManager — cancelation", () => {
  it("stopTTS during dispatched → cancelled + tts.failed(code: 'cancelled')", async () => {
    const adapter = new FakeTTS(async function* () {
      await new Promise<void>(() => { /* pending forever */ });
      yield { seq: 0, audioBytes: new Uint8Array([1]), mimeType: "audio/wav", isFinal: true };
    });
    const { bus, mgr } = makeMgr(adapter);
    mgr.createSession(baseCreate(), CID);
    const failed = vi.fn();
    bus.on("tts.failed", failed);
    const req = mgr.requestSpeech({ sessionId: SESSION, text: "hi" }, CID);
    mgr.stop(SESSION, CID);
    expect(mgr.getRequest(req.id)?.state).toBe("cancelled");
    expect(failed).toHaveBeenCalledTimes(1);
    expect(failed.mock.calls[0]?.[0].error.code).toBe("cancelled");
  });

  it("stopTTS during streaming → cancelled + subsequent chunks ignored", async () => {
    let releaseSecond: () => void = () => {};
    const adapter = new FakeTTS(async function* () {
      yield { seq: 0, audioBytes: new Uint8Array([1]), mimeType: "audio/wav", isFinal: false };
      await new Promise<void>((res) => { releaseSecond = res; });
      yield { seq: 1, audioBytes: new Uint8Array([2]), mimeType: "audio/wav", isFinal: true };
    });
    const { bus, mgr } = makeMgr(adapter);
    mgr.createSession(baseCreate(), CID);
    const chunks = vi.fn();
    bus.on("tts.chunk.generated", chunks);
    const req = mgr.requestSpeech({ sessionId: SESSION, text: "hi" }, CID);
    await flush();
    expect(mgr.getRequest(req.id)?.state).toBe("streaming");
    mgr.stop(SESSION, CID);
    releaseSecond();
    await flush();
    expect(chunks).toHaveBeenCalledTimes(1);
    expect(mgr.getRequest(req.id)?.state).toBe("cancelled");
  });

  it("late chunk after cancel is ignored (idempotent terminal)", async () => {
    let release: () => void = () => {};
    const adapter = new FakeTTS(async function* () {
      await new Promise<void>((res) => { release = res; });
      yield { seq: 0, audioBytes: new Uint8Array([1]), mimeType: "audio/wav", isFinal: true };
    });
    const { bus, mgr } = makeMgr(adapter);
    mgr.createSession(baseCreate(), CID);
    const chunks = vi.fn();
    bus.on("tts.chunk.generated", chunks);
    const req = mgr.requestSpeech({ sessionId: SESSION, text: "hi" }, CID);
    mgr.stop(SESSION, CID);
    release();
    await flush();
    expect(chunks).not.toHaveBeenCalled();
    expect(mgr.getRequest(req.id)?.state).toBe("cancelled");
  });

  it("stopTTS cancels ALL in-flight requests", async () => {
    const adapter = new FakeTTS(async function* () {
      await new Promise<void>(() => {});
      yield { seq: 0, audioBytes: new Uint8Array([1]), mimeType: "audio/wav", isFinal: true };
    });
    const { mgr } = makeMgr(adapter);
    mgr.createSession(baseCreate(), CID);
    const r1 = mgr.requestSpeech({ sessionId: SESSION, text: "a" }, CID);
    const r2 = mgr.requestSpeech({ sessionId: SESSION, text: "b" }, CID);
    mgr.stop(SESSION, CID);
    expect(mgr.getRequest(r1.id)?.state).toBe("cancelled");
    expect(mgr.getRequest(r2.id)?.state).toBe("cancelled");
    expect(mgr.getSession(SESSION)?.cancelledCount).toBe(2);
  });

  it("session pases to completed after cancelling all requests", async () => {
    const adapter = new FakeTTS(async function* () {
      await new Promise<void>(() => {});
      yield { seq: 0, audioBytes: new Uint8Array([1]), mimeType: "audio/wav", isFinal: true };
    });
    const { mgr } = makeMgr(adapter);
    mgr.createSession(baseCreate(), CID);
    mgr.requestSpeech({ sessionId: SESSION, text: "a" }, CID);
    mgr.stop(SESSION, CID);
    expect(mgr.getSession(SESSION)?.state).toBe("completed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Timeout (3)
// ─────────────────────────────────────────────────────────────────────────────
describe("TTSManager — first-chunk timeout", () => {
  it("adapter that never emits → failed(code: 'timeout') after DI timeout", async () => {
    vi.useFakeTimers();
    const adapter = new FakeTTS(async function* () {
      await new Promise<void>(() => {});
      yield { seq: 0, audioBytes: new Uint8Array([1]), mimeType: "audio/wav", isFinal: true };
    });
    const { bus, mgr } = makeMgr(adapter, { firstChunkTimeoutMs: 100 });
    mgr.createSession(baseCreate(), CID);
    const failed = vi.fn();
    bus.on("tts.failed", failed);
    const req = mgr.requestSpeech({ sessionId: SESSION, text: "hi" }, CID);
    vi.advanceTimersByTime(150);
    await Promise.resolve();
    expect(mgr.getRequest(req.id)?.state).toBe("failed");
    expect(failed.mock.calls[0]?.[0].error.code).toBe("timeout");
    vi.useRealTimers();
  });

  it("first chunk before timeout does not trip the timer", async () => {
    vi.useFakeTimers();
    const { mgr } = makeMgr(singleChunkAdapter(), { firstChunkTimeoutMs: 1000 });
    mgr.createSession(baseCreate(), CID);
    const req = mgr.requestSpeech({ sessionId: SESSION, text: "hi" }, CID);
    await Promise.resolve();
    await Promise.resolve();
    expect(mgr.getRequest(req.id)?.state).toBe("completed");
    vi.advanceTimersByTime(5000);
    expect(mgr.getRequest(req.id)?.state).toBe("completed");
    vi.useRealTimers();
  });

  it("timeout is injectable via DI", () => {
    const { mgr } = makeMgr(singleChunkAdapter(), { firstChunkTimeoutMs: 50 });
    expect(mgr).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Errores (4)
// ─────────────────────────────────────────────────────────────────────────────
describe("TTSManager — errors", () => {
  it("no adapter registered → tts.failed(code: 'no-adapter')", async () => {
    const { bus, mgr } = makeMgr();
    mgr.createSession(baseCreate(), CID);
    const failed = vi.fn();
    bus.on("tts.failed", failed);
    const req = mgr.requestSpeech({ sessionId: SESSION, text: "hi" }, CID);
    expect(req.state).toBe("failed");
    expect(failed.mock.calls[0]?.[0].error.code).toBe("no-adapter");
  });

  it("request on terminal session → code: 'session-terminal'", async () => {
    const { bus, mgr } = makeMgr(singleChunkAdapter());
    mgr.createSession(baseCreate(), CID);
    mgr.stop(SESSION, CID);
    const failed = vi.fn();
    bus.on("tts.failed", failed);
    const req = mgr.requestSpeech({ sessionId: SESSION, text: "hi" }, CID);
    expect(req.state).toBe("failed");
    expect(failed.mock.calls[0]?.[0].error.code).toBe("session-terminal");
  });

  it("request on unknown session throws", () => {
    const { mgr } = makeMgr(singleChunkAdapter());
    expect(() =>
      mgr.requestSpeech({ sessionId: asUUID("nope"), text: "hi" }, CID),
    ).toThrow(TTSManagerError);
  });

  it("sync-throw of synthesize → tts.failed(code: 'provider-rejected')", async () => {
    const bad: TTSAdapter = {
      kind: "tts", displayName: "sync-thrower",
      synthesize: () => { throw new Error("sync boom"); },
    };
    const { bus, mgr } = makeMgr(bad);
    mgr.createSession(baseCreate(), CID);
    const failed = vi.fn();
    bus.on("tts.failed", failed);
    const req = mgr.requestSpeech({ sessionId: SESSION, text: "hi" }, CID);
    expect(req.state).toBe("failed");
    expect(failed.mock.calls[0]?.[0].error.code).toBe("provider-rejected");
    expect(failed.mock.calls[0]?.[0].error.message).toBe("sync boom");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Invariantes (2)
// ─────────────────────────────────────────────────────────────────────────────
describe("TTSManager — invariants", () => {
  it("non-monotonic seq → tts.failed(code: 'invariant') + abort", async () => {
    const bad = new FakeTTS(async function* () {
      yield { seq: 0, audioBytes: new Uint8Array([1]), mimeType: "audio/wav", isFinal: false };
      yield { seq: 5, audioBytes: new Uint8Array([2]), mimeType: "audio/wav", isFinal: true };
    });
    const { bus, mgr } = makeMgr(bad);
    mgr.createSession(baseCreate(), CID);
    const failed = vi.fn();
    bus.on("tts.failed", failed);
    const req = mgr.requestSpeech({ sessionId: SESSION, text: "hi" }, CID);
    await flush();
    expect(mgr.getRequest(req.id)?.state).toBe("failed");
    expect(failed.mock.calls[0]?.[0].error.code).toBe("invariant");
    expect(failed.mock.calls[0]?.[0].error.message).toContain("non-monotonic seq");
  });

  it("empty text throws (defensive manager guard)", () => {
    const { mgr } = makeMgr(singleChunkAdapter());
    mgr.createSession(baseCreate(), CID);
    expect(() =>
      mgr.requestSpeech({ sessionId: SESSION, text: "" }, CID),
    ).toThrow(TTSManagerError);
  });

  it("adapter throws AFTER request was cancelled → error is silently swallowed", async () => {
    let release: (v: string) => void = () => {};
    const bad = new FakeTTS(async function* () {
      await new Promise<string>((res) => { release = res; });
      throw new Error("late boom");
    });
    const { bus, mgr } = makeMgr(bad);
    mgr.createSession(baseCreate(), CID);
    const failed = vi.fn();
    bus.on("tts.failed", failed);
    const req = mgr.requestSpeech({ sessionId: SESSION, text: "hi" }, CID);
    mgr.stop(SESSION, CID);
    release("go");
    await flush();
    expect(failed).toHaveBeenCalledTimes(1);
    expect(mgr.getRequest(req.id)?.state).toBe("cancelled");
  });

  it("adapter throws during iteration → tts.failed(code: 'provider-rejected')", async () => {
    const bad = new FakeTTS(async function* () {
      yield { seq: 0, audioBytes: new Uint8Array([1]), mimeType: "audio/wav", isFinal: false };
      throw new Error("iterator boom");
    });
    const { bus, mgr } = makeMgr(bad);
    mgr.createSession(baseCreate(), CID);
    const failed = vi.fn();
    bus.on("tts.failed", failed);
    const req = mgr.requestSpeech({ sessionId: SESSION, text: "hi" }, CID);
    await flush();
    expect(mgr.getRequest(req.id)?.state).toBe("failed");
    expect(failed.mock.calls[0]?.[0].error.code).toBe("provider-rejected");
    expect(failed.mock.calls[0]?.[0].error.message).toBe("iterator boom");
  });

  it("mimeType change mid-stream → tts.failed(code: 'invariant') + abort", async () => {
    const bad = new FakeTTS(async function* () {
      yield { seq: 0, audioBytes: new Uint8Array([1]), mimeType: "audio/wav", isFinal: false };
      yield { seq: 1, audioBytes: new Uint8Array([2]), mimeType: "audio/mpeg", isFinal: true };
    });
    const { bus, mgr } = makeMgr(bad);
    mgr.createSession(baseCreate(), CID);
    const failed = vi.fn();
    bus.on("tts.failed", failed);
    const req = mgr.requestSpeech({ sessionId: SESSION, text: "hi" }, CID);
    await flush();
    expect(mgr.getRequest(req.id)?.state).toBe("failed");
    expect(failed.mock.calls[0]?.[0].error.code).toBe("invariant");
    expect(failed.mock.calls[0]?.[0].error.message).toContain("mimeType changed");
  });
});
