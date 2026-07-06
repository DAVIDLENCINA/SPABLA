import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../event-bus/EventBus.js";
import { AdapterRegistry } from "../adapter-registry/AdapterRegistry.js";
import { TranslationManager, TranslationManagerError } from "./TranslationManager.js";
import { asCorrelationId, asISOTimestamp, asUUID, type Clock } from "../types/ids.js";
import { makeLanguagePair, type LangCode } from "../types/language.js";
import type {
  TranslationAdapter,
  TranslationAdapterRequest,
  TranslationAdapterResponse,
} from "../types/translation.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

function clock(): Clock {
  let n = 1_700_000_000_000;
  return { nowISO: () => asISOTimestamp(new Date(n++).toISOString()), nowMs: () => n };
}

let idCounter = 0;
function newId(): ReturnType<typeof asUUID> {
  return asUUID(`req-${++idCounter}`);
}

const CID = asCorrelationId("test-corr");
const CALL = asUUID("call-1");
const SESSION = asUUID("t-1");
const PAIR = makeLanguagePair("es", "en");

class FakeTranslationAdapter implements TranslationAdapter {
  readonly kind = "mt" as const;
  readonly displayName: string;
  private readonly responder: (req: TranslationAdapterRequest) =>
    Promise<TranslationAdapterResponse>;
  public calls: TranslationAdapterRequest[] = [];

  constructor(
    responder: (req: TranslationAdapterRequest) => Promise<TranslationAdapterResponse>,
    displayName = "fake-translator",
  ) {
    this.responder = responder;
    this.displayName = displayName;
  }
  translate(req: TranslationAdapterRequest): Promise<TranslationAdapterResponse> {
    this.calls.push(req);
    return this.responder(req);
  }
}

function echoAdapter(prefix = "[EN] "): FakeTranslationAdapter {
  return new FakeTranslationAdapter(async (r) => ({ translatedText: `${prefix}${r.text}` }));
}

function makeMgr(adapter?: TranslationAdapter): {
  bus: EventBus; mgr: TranslationManager; adapters: AdapterRegistry;
} {
  idCounter = 0;
  const bus = new EventBus();
  const adapters = new AdapterRegistry();
  if (adapter) adapters.register("mt", adapter);
  return { bus, adapters, mgr: new TranslationManager(bus, clock(), newId, adapters) };
}

function baseCreate() {
  return { sessionId: SESSION, callSessionId: CALL, languagePair: PAIR };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

// ─────────────────────────────────────────────────────────────────────────────
// createSession + stopSession (5)
// ─────────────────────────────────────────────────────────────────────────────
describe("TranslationManager — createSession + stop", () => {
  it("creates the session and transitions idle → active in one step", () => {
    const { bus, mgr } = makeMgr();
    const started = vi.fn();
    bus.on("translation.session.started", started);
    const s = mgr.createSession(baseCreate(), CID);
    expect(s.state).toBe("active");
    expect(s.startedAt).toBeDefined();
    expect(s.languagePair.from).toBe("es");
    expect(s.languagePair.to).toBe("en");
    expect(started).toHaveBeenCalledTimes(1);
    expect(started.mock.calls[0]?.[0].session.state).toBe("active");
  });

  it("rejects duplicate sessionId", () => {
    const { mgr } = makeMgr();
    mgr.createSession(baseCreate(), CID);
    expect(() => mgr.createSession(baseCreate(), CID)).toThrow(TranslationManagerError);
  });

  it("stores callSessionId and languagePair verbatim; snapshot is frozen", () => {
    const { mgr } = makeMgr();
    const s = mgr.createSession(baseCreate(), CID);
    expect(s.callSessionId).toBe(CALL);
    expect(Object.isFrozen(s)).toBe(true);
    expect(mgr.getSession(SESSION)).toEqual(s);
  });

  it("stop from active → completed and emits translation.session.ended", () => {
    const { bus, mgr } = makeMgr();
    mgr.createSession(baseCreate(), CID);
    const ended = vi.fn();
    bus.on("translation.session.ended", ended);
    const s = mgr.stop(SESSION, CID);
    expect(s.state).toBe("completed");
    expect(s.endedAt).toBeDefined();
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("stop on a terminal session throws", () => {
    const { mgr } = makeMgr();
    mgr.createSession(baseCreate(), CID);
    mgr.stop(SESSION, CID);
    expect(() => mgr.stop(SESSION, CID)).toThrow(TranslationManagerError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// requestTranslation happy path (6)
// ─────────────────────────────────────────────────────────────────────────────
describe("TranslationManager — requestTranslation happy path", () => {
  it("creates request in `dispatched` (state after sync return)", async () => {
    const { mgr } = makeMgr(echoAdapter());
    mgr.createSession(baseCreate(), CID);
    const req = mgr.requestTranslation(
      { sessionId: SESSION, text: "hola", sourceLanguage: "es" }, CID);
    expect(req.state).toBe("dispatched");
    expect(req.dispatchedAt).toBeDefined();
    await flush();
  });

  it("invokes adapter.translate with correct payload", async () => {
    const adapter = echoAdapter();
    const { mgr } = makeMgr(adapter);
    mgr.createSession(baseCreate(), CID);
    mgr.requestTranslation(
      { sessionId: SESSION, text: "hola mundo", sourceLanguage: "es" }, CID);
    await flush();
    expect(adapter.calls).toHaveLength(1);
    expect(adapter.calls[0]?.text).toBe("hola mundo");
    expect(adapter.calls[0]?.from).toBe("es");
    expect(adapter.calls[0]?.to).toBe("en");
  });

  it("adapter resolve → state=completed + result stored", async () => {
    const { mgr } = makeMgr(echoAdapter());
    mgr.createSession(baseCreate(), CID);
    const req = mgr.requestTranslation(
      { sessionId: SESSION, text: "hola", sourceLanguage: "es" }, CID);
    await flush();
    const done = mgr.getRequest(req.id)!;
    expect(done.state).toBe("completed");
    expect(done.result?.translatedText).toBe("[EN] hola");
    expect(done.result?.targetLanguage).toBe("en");
    expect(done.completedAt).toBeDefined();
  });

  it("emits request.created → request.dispatched → completed in order", async () => {
    const { bus, mgr } = makeMgr(echoAdapter());
    mgr.createSession(baseCreate(), CID);
    const order: string[] = [];
    bus.on("translation.request.created", () => order.push("created"));
    bus.on("translation.request.dispatched", () => order.push("dispatched"));
    bus.on("translation.completed", () => order.push("completed"));
    mgr.requestTranslation(
      { sessionId: SESSION, text: "hola", sourceLanguage: "es" }, CID);
    await flush();
    expect(order).toEqual(["created", "dispatched", "completed"]);
  });

  it("session.requestCount and completedCount increment", async () => {
    const { mgr } = makeMgr(echoAdapter());
    mgr.createSession(baseCreate(), CID);
    mgr.requestTranslation({ sessionId: SESSION, text: "a", sourceLanguage: "es" }, CID);
    mgr.requestTranslation({ sessionId: SESSION, text: "b", sourceLanguage: "es" }, CID);
    await flush();
    const s = mgr.getSession(SESSION)!;
    expect(s.requestCount).toBe(2);
    expect(s.completedCount).toBe(2);
    expect(s.failedCount).toBe(0);
  });

  it("returned request.id matches getRequest snapshot", () => {
    const { mgr } = makeMgr(echoAdapter());
    mgr.createSession(baseCreate(), CID);
    const req = mgr.requestTranslation(
      { sessionId: SESSION, text: "hola", sourceLanguage: "es" }, CID);
    expect(mgr.getRequest(req.id)?.id).toBe(req.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// requestTranslation with adapter (3)
// ─────────────────────────────────────────────────────────────────────────────
describe("TranslationManager — requestTranslation with adapter", () => {
  it("returns synchronously with `dispatched` before adapter resolves", () => {
    let resolveFn: (r: TranslationAdapterResponse) => void = () => {};
    const adapter = new FakeTranslationAdapter(
      () => new Promise<TranslationAdapterResponse>((res) => { resolveFn = res; }),
    );
    const { mgr } = makeMgr(adapter);
    mgr.createSession(baseCreate(), CID);
    const req = mgr.requestTranslation(
      { sessionId: SESSION, text: "hola", sourceLanguage: "es" }, CID);
    expect(req.state).toBe("dispatched");
    expect(mgr.getRequest(req.id)?.state).toBe("dispatched");
    resolveFn({ translatedText: "hi" });
  });

  it("event translation.completed arrives after the adapter resolves", async () => {
    const { bus, mgr } = makeMgr(echoAdapter());
    mgr.createSession(baseCreate(), CID);
    const completed = vi.fn();
    bus.on("translation.completed", completed);
    mgr.requestTranslation(
      { sessionId: SESSION, text: "hola", sourceLanguage: "es" }, CID);
    expect(completed).not.toHaveBeenCalled();
    await flush();
    expect(completed).toHaveBeenCalledTimes(1);
  });

  it("providerDisplayName preserved in result", async () => {
    const adapter = new FakeTranslationAdapter(
      async () => ({ translatedText: "hi" }), "provider-x");
    const { mgr } = makeMgr(adapter);
    mgr.createSession(baseCreate(), CID);
    const req = mgr.requestTranslation(
      { sessionId: SESSION, text: "hola", sourceLanguage: "es" }, CID);
    await flush();
    expect(mgr.getRequest(req.id)?.result?.providerDisplayName).toBe("provider-x");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Errors (7)
// ─────────────────────────────────────────────────────────────────────────────
describe("TranslationManager — errors", () => {
  it("no adapter registered → translation.failed(code: 'no-adapter')", async () => {
    const { bus, mgr } = makeMgr();
    mgr.createSession(baseCreate(), CID);
    const failed = vi.fn();
    bus.on("translation.failed", failed);
    const req = mgr.requestTranslation(
      { sessionId: SESSION, text: "hola", sourceLanguage: "es" }, CID);
    expect(req.state).toBe("failed");
    expect(failed).toHaveBeenCalledTimes(1);
    expect(failed.mock.calls[0]?.[0].error.code).toBe("no-adapter");
  });

  it("request in terminal session → failed with code 'session-terminal'", async () => {
    const { bus, mgr } = makeMgr(echoAdapter());
    mgr.createSession(baseCreate(), CID);
    mgr.stop(SESSION, CID);
    const failed = vi.fn();
    bus.on("translation.failed", failed);
    const req = mgr.requestTranslation(
      { sessionId: SESSION, text: "hola", sourceLanguage: "es" }, CID);
    expect(req.state).toBe("failed");
    expect(failed.mock.calls[0]?.[0].error.code).toBe("session-terminal");
  });

  it("request in unknown session → typed error", () => {
    const { mgr } = makeMgr(echoAdapter());
    expect(() =>
      mgr.requestTranslation(
        { sessionId: asUUID("nope"), text: "hola", sourceLanguage: "es" }, CID),
    ).toThrow(TranslationManagerError);
  });

  it("adapter rejects → translation.failed(code: 'provider-rejected')", async () => {
    const adapter = new FakeTranslationAdapter(
      async () => { throw new Error("upstream 503"); });
    const { bus, mgr } = makeMgr(adapter);
    mgr.createSession(baseCreate(), CID);
    const failed = vi.fn();
    bus.on("translation.failed", failed);
    mgr.requestTranslation(
      { sessionId: SESSION, text: "hola", sourceLanguage: "es" }, CID);
    await flush();
    expect(failed).toHaveBeenCalledTimes(1);
    expect(failed.mock.calls[0]?.[0].error.code).toBe("provider-rejected");
    expect(failed.mock.calls[0]?.[0].error.message).toContain("upstream 503");
  });

  it("stop() while adapter pending: request still resolves cleanly (no double-terminal)", async () => {
    let resolveFn: (r: TranslationAdapterResponse) => void = () => {};
    const adapter = new FakeTranslationAdapter(
      () => new Promise<TranslationAdapterResponse>((res) => { resolveFn = res; }),
    );
    const { mgr } = makeMgr(adapter);
    mgr.createSession(baseCreate(), CID);
    const req = mgr.requestTranslation(
      { sessionId: SESSION, text: "hola", sourceLanguage: "es" }, CID);
    mgr.stop(SESSION, CID);
    resolveFn({ translatedText: "hi" });
    await flush();
    // request completed even though session ended
    expect(mgr.getRequest(req.id)?.state).toBe("completed");
  });

  it("adapter rejects with non-Error value → message uses String(err)", async () => {
    const adapter = new FakeTranslationAdapter(async () => {
      // eslint-disable-next-line no-throw-literal
      throw "raw string reason";
    });
    const { bus, mgr } = makeMgr(adapter);
    mgr.createSession(baseCreate(), CID);
    const failed = vi.fn();
    bus.on("translation.failed", failed);
    mgr.requestTranslation(
      { sessionId: SESSION, text: "hola", sourceLanguage: "es" }, CID);
    await flush();
    expect(failed.mock.calls[0]?.[0].error.message).toBe("raw string reason");
  });

  it("session.failedCount increments on adapter rejection", async () => {
    const adapter = new FakeTranslationAdapter(async () => { throw new Error("boom"); });
    const { mgr } = makeMgr(adapter);
    mgr.createSession(baseCreate(), CID);
    mgr.requestTranslation(
      { sessionId: SESSION, text: "hola", sourceLanguage: "es" }, CID);
    await flush();
    expect(mgr.getSession(SESSION)?.failedCount).toBe(1);
  });

  it("empty text throws (defensive invariant on the manager)", () => {
    const { mgr } = makeMgr(echoAdapter());
    mgr.createSession(baseCreate(), CID);
    expect(() =>
      mgr.requestTranslation({ sessionId: SESSION, text: "", sourceLanguage: "es" }, CID),
    ).toThrow(TranslationManagerError);
  });

  it("error snapshot carries requestId and message correctly", async () => {
    const adapter = new FakeTranslationAdapter(async () => { throw new Error("hey"); });
    const { mgr } = makeMgr(adapter);
    mgr.createSession(baseCreate(), CID);
    const req = mgr.requestTranslation(
      { sessionId: SESSION, text: "hola", sourceLanguage: "es" }, CID);
    await flush();
    const finalReq = mgr.getRequest(req.id)!;
    expect(finalReq.error?.requestId).toBe(req.id);
    expect(finalReq.error?.message).toBe("hey");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Queries + immutability (4)
// ─────────────────────────────────────────────────────────────────────────────
describe("TranslationManager — queries and immutability", () => {
  it("getSession returns frozen snapshot", () => {
    const { mgr } = makeMgr(echoAdapter());
    mgr.createSession(baseCreate(), CID);
    const s = mgr.getSession(SESSION)!;
    expect(Object.isFrozen(s)).toBe(true);
  });

  it("getRequest returns frozen snapshot", async () => {
    const { mgr } = makeMgr(echoAdapter());
    mgr.createSession(baseCreate(), CID);
    const req = mgr.requestTranslation(
      { sessionId: SESSION, text: "hola", sourceLanguage: "es" }, CID);
    await flush();
    expect(Object.isFrozen(mgr.getRequest(req.id))).toBe(true);
  });

  it("listActiveSessions filters by callId and excludes terminals", () => {
    const { mgr } = makeMgr();
    mgr.createSession(baseCreate(), CID);
    mgr.createSession(
      { sessionId: asUUID("t-2"), callSessionId: CALL, languagePair: makeLanguagePair("en", "es") },
      CID);
    mgr.createSession(
      { sessionId: asUUID("t-3"), callSessionId: asUUID("call-2"), languagePair: PAIR },
      CID);
    mgr.stop(SESSION, CID);
    const active = mgr.listActiveSessions(CALL);
    expect(active.map((s) => s.id)).toEqual(["t-2"]);
  });

  it("mutations produce new frozen references", async () => {
    const { mgr } = makeMgr(echoAdapter());
    const created = mgr.createSession(baseCreate(), CID);
    const afterRequest = mgr.requestTranslation(
      { sessionId: SESSION, text: "hola", sourceLanguage: "es" }, CID);
    await flush();
    const afterCompletion = mgr.getSession(SESSION)!;
    expect(afterCompletion).not.toBe(created);
    expect(Object.isFrozen(afterCompletion)).toBe(true);
    expect(afterRequest).not.toBe(mgr.getRequest(afterRequest.id));
  });

  it("getSession undefined for unknown; listRequests works per session", async () => {
    const { mgr } = makeMgr(echoAdapter());
    expect(mgr.getSession(asUUID("nope"))).toBeUndefined();
    mgr.createSession(baseCreate(), CID);
    mgr.requestTranslation({ sessionId: SESSION, text: "a", sourceLanguage: "es" as LangCode }, CID);
    await flush();
    expect(mgr.listRequests(SESSION)).toHaveLength(1);
    expect(mgr.listRequests(asUUID("other"))).toEqual([]);
  });
});
