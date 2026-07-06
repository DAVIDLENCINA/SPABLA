import { describe, it, expect, vi } from "vitest";
import { Engine } from "./Engine.js";
import { asUUID, asISOTimestamp, type Clock } from "../types/ids.js";
import { EventBus } from "../event-bus/EventBus.js";
import { AdapterRegistry } from "../adapter-registry/AdapterRegistry.js";

let counter = 0;
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

function makeEngine(overrides: Partial<Parameters<typeof Engine.prototype.constructor>[0]> = {}) {
  const { clock } = fakeClock();
  counter = 0;
  return new Engine({
    clock,
    newId: () => asUUID(`id-${++counter}`),
    ...overrides,
  });
}

const LOCAL = { userId: asUUID("u-local"), displayName: "Ana", language: "es", role: "local" } as const;
const REMOTE = { userId: asUUID("u-remote"), displayName: "Bea", language: "en", role: "remote" } as const;

describe("Engine — happy path", () => {
  it("resolves LanguagePair once both participants are added and loads the conversation", () => {
    const engine = makeEngine();
    const loaded = vi.fn();
    const resolved = vi.fn();
    engine.on("conversation.loaded", loaded);
    engine.on("languagePair.resolved", resolved);
    engine.addParticipant(LOCAL);
    engine.addParticipant(REMOTE);
    engine.loadConversation(asUUID("conv-1"));
    expect(resolved).toHaveBeenCalledTimes(1);
    expect(loaded).toHaveBeenCalledTimes(1);
    const conv = engine.snapshotConversation();
    expect(conv?.languagePair?.from).toBe("es");
    expect(conv?.languagePair?.to).toBe("en");
  });

  it("initiateCall creates a CallSession and returns its id", () => {
    const engine = makeEngine();
    engine.addParticipant(LOCAL);
    engine.addParticipant(REMOTE);
    engine.loadConversation(asUUID("conv-1"));
    const initiated = vi.fn();
    engine.on("call.initiated", initiated);
    const callId = engine.initiateCall({ mode: "voice" });
    expect(callId).toBeDefined();
    expect(initiated).toHaveBeenCalledTimes(1);
    expect(engine.snapshotCall(callId)?.state).toBe("ringing");
    expect(engine.snapshotConversation()?.createdCallSessions).toContain(callId);
  });

  it("full outgoing flow: initiate → accept → end", () => {
    const engine = makeEngine();
    engine.addParticipant(LOCAL);
    engine.addParticipant(REMOTE);
    engine.loadConversation(asUUID("conv-1"));
    const accepted = vi.fn();
    const ended = vi.fn();
    engine.on("call.accepted", accepted);
    engine.on("call.ended", ended);
    const id = engine.initiateCall({ mode: "voice" });
    engine.acceptCall(id);
    engine.endCall(id, "callee");
    expect(accepted).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(engine.snapshotCall(id)?.state).toBe("ended");
    expect(engine.snapshotCall(id)?.endedBy).toBe("callee");
  });

  it("full incoming flow: notifyIncoming → accept → end", () => {
    const engine = makeEngine();
    engine.addParticipant(LOCAL);
    engine.addParticipant(REMOTE);
    engine.loadConversation(asUUID("conv-1"));
    const incoming = vi.fn();
    engine.on("call.incoming", incoming);
    const callId = asUUID("incoming-1");
    engine.notifyIncomingCall(callId, "voice");
    engine.acceptCall(callId);
    engine.endCall(callId);
    expect(incoming).toHaveBeenCalledTimes(1);
    expect(engine.snapshotCall(callId)?.state).toBe("ended");
  });
});

describe("Engine — precondition enforcement", () => {
  it("initiateCall throws when LanguagePair is unresolved (no remote)", () => {
    const engine = makeEngine();
    engine.addParticipant(LOCAL);
    engine.loadConversation(asUUID("conv-1"));
    expect(() => engine.initiateCall({ mode: "voice" })).toThrow("cannot-initiate-without-resolved-pair");
  });

  it("initiateCall throws when both share language", () => {
    const engine = makeEngine();
    engine.addParticipant(LOCAL);
    engine.addParticipant({ ...REMOTE, language: "es" });
    engine.loadConversation(asUUID("conv-1"));
    expect(() => engine.initiateCall({ mode: "voice" })).toThrow();
  });

  it("notifyIncomingCall throws when LanguagePair is unresolved", () => {
    const engine = makeEngine();
    engine.addParticipant(LOCAL);
    engine.loadConversation(asUUID("conv-1"));
    expect(() => engine.notifyIncomingCall(asUUID("call-x"), "voice")).toThrow(
      "cannot-accept-without-resolved-pair",
    );
  });

  it("loadConversation requires local participant to be added first", () => {
    const engine = makeEngine();
    expect(() => engine.loadConversation(asUUID("conv-1"))).toThrow();
  });
});

describe("Engine — telemetry", () => {
  it("emits telemetry.command.received for every command", () => {
    const engine = makeEngine();
    const received = vi.fn();
    engine.on("telemetry.command.received", received);
    engine.addParticipant(LOCAL);
    engine.addParticipant(REMOTE);
    engine.loadConversation(asUUID("conv-1"));
    const id = engine.initiateCall({ mode: "voice" });
    engine.acceptCall(id);
    engine.endCall(id);
    const names = received.mock.calls.map((c) => c[0].commandName);
    expect(names).toEqual([
      "addParticipant",
      "addParticipant",
      "loadConversation",
      "initiateCall",
      "acceptCall",
      "endCall",
    ]);
  });

  it("emits telemetry.command.rejected when a precondition fails", () => {
    const engine = makeEngine();
    const rejected = vi.fn();
    engine.on("telemetry.command.rejected", rejected);
    expect(() => engine.loadConversation(asUUID("conv-1"))).toThrow();
    expect(rejected).toHaveBeenCalledTimes(1);
  });
});

describe("Engine — participant lifecycle", () => {
  it("updateParticipantLanguage re-triggers language resolution", () => {
    const engine = makeEngine();
    engine.addParticipant(LOCAL);
    engine.addParticipant({ ...REMOTE, language: null });
    const resolved = vi.fn();
    engine.on("languagePair.resolved", resolved);
    engine.updateParticipantLanguage(REMOTE.userId, "en");
    expect(resolved).toHaveBeenCalledTimes(1);
  });

  it("updateParticipantOnline emits participant.updated", () => {
    const engine = makeEngine();
    engine.addParticipant(LOCAL);
    engine.addParticipant(REMOTE);
    const updated = vi.fn();
    engine.on("participant.updated", updated);
    engine.updateParticipantOnline(REMOTE.userId, false);
    expect(updated).toHaveBeenCalledTimes(1);
  });

  it("removeParticipant emits participant.left and clears language resolution", () => {
    const engine = makeEngine();
    engine.addParticipant(LOCAL);
    engine.addParticipant(REMOTE);
    engine.loadConversation(asUUID("conv-1"));
    engine.removeParticipant(REMOTE.userId);
    expect(engine.snapshotConversation()?.remoteParticipant).toBeUndefined();
  });
});

describe("Engine — component injection (fase 1.5)", () => {
  it("uses the injected EventBus so external subscribers still receive events", () => {
    const bus = new EventBus();
    counter = 0;
    const engine = new Engine({
      clock: fakeClock().clock,
      newId: () => asUUID(`id-${++counter}`),
      bus,
    });
    const handler = vi.fn();
    bus.on("participant.joined", handler);
    engine.addParticipant(LOCAL);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("exposes getAdapterRegistry() with default empty registry", () => {
    const engine = makeEngine();
    const reg = engine.getAdapterRegistry();
    expect(reg.registeredKinds()).toEqual([]);
    reg.register("stt", { kind: "stt", displayName: "fake" });
    expect(reg.has("stt")).toBe(true);
  });

  it("accepts a pre-populated AdapterRegistry via injection", () => {
    const custom = new AdapterRegistry();
    custom.register("mt", { kind: "mt", displayName: "custom-mt" });
    counter = 0;
    const engine = new Engine({
      clock: fakeClock().clock,
      newId: () => asUUID(`id-${++counter}`),
      adapters: custom,
    });
    expect(engine.getAdapterRegistry().has("mt")).toBe(true);
    expect(engine.getAdapterRegistry().get("mt")?.displayName).toBe("custom-mt");
  });

  it("exposes getTurnPipelineManager()", () => {
    const engine = makeEngine();
    expect(engine.getTurnPipelineManager()).toBeDefined();
    expect(engine.getTurnPipelineManager().activeForCall(asUUID("nope"))).toEqual([]);
  });

  it("exposes getMessageManager() with default empty state", () => {
    const engine = makeEngine();
    expect(engine.getMessageManager()).toBeDefined();
    expect(engine.getMessageManager().list()).toEqual([]);
  });

  it("exposes getSTTManager() with default empty state", () => {
    const engine = makeEngine();
    expect(engine.getSTTManager()).toBeDefined();
    expect(engine.getSTTManager().listActiveSessions(asUUID("nope"))).toEqual([]);
  });

  it("does NOT alter existing command behaviour when defaults are used", () => {
    const engine = makeEngine();
    const initiated = vi.fn();
    engine.on("call.initiated", initiated);
    engine.addParticipant(LOCAL);
    engine.addParticipant(REMOTE);
    engine.loadConversation(asUUID("conv-1"));
    engine.initiateCall({ mode: "voice" });
    expect(initiated).toHaveBeenCalledTimes(1);
  });
});

describe("Engine — timeouts", () => {
  it("tickTimeouts expires stale ringing sessions to missed", () => {
    const { clock, advance } = fakeClock();
    counter = 0;
    const engine = new Engine({ clock, newId: () => asUUID(`id-${++counter}`) });
    engine.addParticipant(LOCAL);
    engine.addParticipant(REMOTE);
    engine.loadConversation(asUUID("conv-1"));
    const id = engine.initiateCall({ mode: "voice" });
    const missed = vi.fn();
    engine.on("call.missed", missed);
    advance(30_001);
    const expired = engine.tickTimeouts(30_000);
    expect(expired).toBe(1);
    expect(engine.snapshotCall(id)?.state).toBe("missed");
    expect(missed).toHaveBeenCalledTimes(1);
  });

  it("tickTimeouts returns 0 when no sessions are stale", () => {
    const engine = makeEngine();
    engine.addParticipant(LOCAL);
    engine.addParticipant(REMOTE);
    engine.loadConversation(asUUID("conv-1"));
    engine.initiateCall({ mode: "voice" });
    expect(engine.tickTimeouts(30_000)).toBe(0);
  });
});
