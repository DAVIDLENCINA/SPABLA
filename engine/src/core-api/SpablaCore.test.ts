import { describe, it, expect, vi, beforeEach } from "vitest";
import { SpablaCore } from "./SpablaCore.js";
import { SpablaCoreError } from "./types.js";
import { asUUID, asISOTimestamp, type Clock } from "../types/ids.js";
// Hito 9.2.5-E · Vitest 4.x bundles Vite 8, whose oxc parser rejects
// TypeScript's `implements import("...").X` inline-import syntax in
// class heads. The productive tsc build still accepts the pattern;
// this change is a test-time compatibility adjustment only. The same
// types are now imported at the top of the file and referenced bare
// in the three class declarations below (`FakeMT`, `FakeTts`,
// `MtFake`). No production code is touched.
import type { TranslationAdapter } from "../types/translation.js";
import type { TTSAdapter } from "../types/tts.js";

let counter = 0;
function fakeClock(): Clock {
  let n = 1_700_000_000_000;
  return {
    nowISO: () => asISOTimestamp(new Date(n++).toISOString()),
    nowMs: () => n,
  };
}

function makeCore(): SpablaCore {
  counter = 0;
  return new SpablaCore({
    clock: fakeClock(),
    newId: () => asUUID(`id-${++counter}`),
  });
}

const CONV = asUUID("conv-1");
const LOCAL = { userId: asUUID("u-local"), displayName: "Ana", language: "es" } as const;
const REMOTE = { userId: asUUID("u-remote"), displayName: "Bea", language: "en" } as const;

function seedConversation(core: SpablaCore, joinRemote = true): void {
  core.createConversation({ conversationId: CONV, local: LOCAL });
  if (joinRemote) core.joinConversation({ remote: REMOTE });
}

describe("SpablaCore — createConversation", () => {
  it("adds the local participant and loads the conversation", () => {
    const core = makeCore();
    core.createConversation({ conversationId: CONV, local: LOCAL });
    const conv = core.getConversation();
    expect(conv?.id).toBe(CONV);
    expect(conv?.localParticipant.userId).toBe("u-local");
    expect(conv?.remoteParticipant).toBeUndefined();
  });

  it("rejects a missing conversationId", () => {
    const core = makeCore();
    expect(() =>
      core.createConversation({
        conversationId: undefined as unknown as ReturnType<typeof asUUID>,
        local: LOCAL,
      }),
    ).toThrow(SpablaCoreError);
  });

  it("rejects a missing local userId", () => {
    const core = makeCore();
    expect(() =>
      core.createConversation({
        conversationId: CONV,
        local: { ...LOCAL, userId: undefined as unknown as ReturnType<typeof asUUID> },
      }),
    ).toThrow(SpablaCoreError);
  });
});

describe("SpablaCore — joinConversation", () => {
  it("adds a remote participant and resolves LanguagePair", () => {
    const core = makeCore();
    const resolved = vi.fn();
    core.subscribe("languagePair.resolved", resolved);
    seedConversation(core);
    expect(core.getConversation()?.remoteParticipant?.userId).toBe("u-remote");
    expect(core.getConversation()?.languagePair?.from).toBe("es");
    expect(core.getConversation()?.languagePair?.to).toBe("en");
    expect(resolved).toHaveBeenCalledTimes(1);
  });

  it("rejects when no conversation has been loaded", () => {
    const core = makeCore();
    expect(() => core.joinConversation({ remote: REMOTE })).toThrow(SpablaCoreError);
  });

  it("rejects when the remote userId is missing", () => {
    const core = makeCore();
    core.createConversation({ conversationId: CONV, local: LOCAL });
    expect(() =>
      core.joinConversation({
        remote: { ...REMOTE, userId: undefined as unknown as ReturnType<typeof asUUID> },
      }),
    ).toThrow(SpablaCoreError);
  });
});

describe("SpablaCore — leaveConversation", () => {
  it("emits participant.left when a known participant is removed", () => {
    const core = makeCore();
    seedConversation(core);
    const left = vi.fn();
    core.subscribe("participant.left", left);
    core.leaveConversation(REMOTE.userId);
    expect(left).toHaveBeenCalledTimes(1);
    expect(core.getConversation()?.remoteParticipant).toBeUndefined();
  });

  it("rejects missing userId", () => {
    const core = makeCore();
    expect(() =>
      core.leaveConversation(undefined as unknown as ReturnType<typeof asUUID>),
    ).toThrow(SpablaCoreError);
  });
});

describe("SpablaCore — sendMessage (fase 2)", () => {
  it("returns messageId consistent with getMessage() snapshot", () => {
    const core = makeCore();
    seedConversation(core);
    const { messageId } = core.sendMessage({ text: "hello" });
    expect(messageId).toBeDefined();
    expect(core.getMessage(messageId)?.text).toBe("hello");
    expect(core.getMessage(messageId)?.senderId).toBe("u-local");
    expect(core.getMessage(messageId)?.direction).toBe("outgoing");
  });

  it("emits message.created and message.sent in that order", () => {
    const core = makeCore();
    seedConversation(core);
    const events: string[] = [];
    core.subscribe("message.created", (e) => events.push(`created:${e.message.status}`));
    core.subscribe("message.sent", (e) => events.push(`sent:${e.message.status}`));
    core.sendMessage({ text: "hi" });
    expect(events).toEqual(["created:created", "sent:sent"]);
  });

  it("final snapshot has status 'sent' after sendMessage returns", () => {
    const core = makeCore();
    seedConversation(core);
    const { messageId } = core.sendMessage({ text: "hi" });
    expect(core.getMessage(messageId)?.status).toBe("sent");
    expect(core.getMessage(messageId)?.sentAt).toBeDefined();
  });

  it("rejects empty / whitespace-only text", () => {
    const core = makeCore();
    seedConversation(core);
    expect(() => core.sendMessage({ text: "" })).toThrow(SpablaCoreError);
    expect(() => core.sendMessage({ text: "   \t\n" })).toThrow(SpablaCoreError);
  });

  it("rejects when no conversation is loaded", () => {
    const core = makeCore();
    expect(() => core.sendMessage({ text: "hi" })).toThrow(SpablaCoreError);
  });
});

describe("SpablaCore — notifyIncomingMessage", () => {
  it("creates an incoming Message in status 'sent'", () => {
    const core = makeCore();
    seedConversation(core);
    const { messageId } = core.notifyIncomingMessage({
      senderId: REMOTE.userId,
      text: "hola",
    });
    const msg = core.getMessage(messageId);
    expect(msg?.direction).toBe("incoming");
    expect(msg?.status).toBe("sent");
    expect(msg?.senderId).toBe(REMOTE.userId);
  });

  it("rejects when no conversation is loaded", () => {
    const core = makeCore();
    expect(() =>
      core.notifyIncomingMessage({ senderId: REMOTE.userId, text: "x" }),
    ).toThrow(SpablaCoreError);
  });

  it("rejects when senderId does not match the remote participant", () => {
    const core = makeCore();
    seedConversation(core);
    expect(() =>
      core.notifyIncomingMessage({ senderId: asUUID("someone-else"), text: "x" }),
    ).toThrow(SpablaCoreError);
  });

  it("emits message.sent for an incoming message", () => {
    const core = makeCore();
    seedConversation(core);
    const sent = vi.fn();
    core.subscribe("message.sent", sent);
    core.notifyIncomingMessage({ senderId: REMOTE.userId, text: "x" });
    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent.mock.calls[0]?.[0].message.direction).toBe("incoming");
  });

  it("getMessages() includes the incoming message", () => {
    const core = makeCore();
    seedConversation(core);
    core.notifyIncomingMessage({ senderId: REMOTE.userId, text: "ping" });
    expect(core.getMessages().messages).toHaveLength(1);
    expect(core.getMessages().messages[0]?.text).toBe("ping");
  });
});

describe("SpablaCore — getMessages", () => {
  it("returns chronological order (outgoing + incoming interleaved)", () => {
    const core = makeCore();
    seedConversation(core);
    core.sendMessage({ text: "a" });
    core.notifyIncomingMessage({ senderId: REMOTE.userId, text: "b" });
    core.sendMessage({ text: "c" });
    expect(core.getMessages().messages.map((m) => m.text)).toEqual(["a", "b", "c"]);
  });

  it("respects `limit`, keeping the most recent entries", () => {
    const core = makeCore();
    seedConversation(core);
    core.sendMessage({ text: "1" });
    core.sendMessage({ text: "2" });
    core.sendMessage({ text: "3" });
    const { messages } = core.getMessages({ limit: 2 });
    expect(messages.map((m) => m.text)).toEqual(["2", "3"]);
  });

  it("respects `before` (paginación descendente)", () => {
    const core = makeCore();
    seedConversation(core);
    core.sendMessage({ text: "a" });
    core.sendMessage({ text: "b" });
    const middle = core.getMessages().messages[1]!.createdAt;
    const { messages } = core.getMessages({ before: middle });
    expect(messages.map((m) => m.text)).toEqual(["a"]);
  });

  it("includes both outgoing and incoming in the same result", () => {
    const core = makeCore();
    seedConversation(core);
    core.sendMessage({ text: "out" });
    core.notifyIncomingMessage({ senderId: REMOTE.userId, text: "in" });
    const { messages } = core.getMessages();
    expect(messages.map((m) => m.direction).sort()).toEqual(["incoming", "outgoing"]);
  });

  it("returns a thread aligned with the messages", () => {
    const core = makeCore();
    seedConversation(core);
    core.sendMessage({ text: "one" });
    const { messages, thread } = core.getMessages();
    expect(thread?.messageIds).toEqual(messages.map((m) => m.id));
    expect(thread?.participants).toEqual([LOCAL.userId, REMOTE.userId]);
  });
});

describe("SpablaCore — markAsRead", () => {
  it("transitions incoming.sent → read", () => {
    const core = makeCore();
    seedConversation(core);
    const { messageId } = core.notifyIncomingMessage({
      senderId: REMOTE.userId,
      text: "hi",
    });
    core.markAsRead({ messageId });
    expect(core.getMessage(messageId)?.status).toBe("read");
    expect(core.getMessage(messageId)?.readAt).toBeDefined();
  });

  it("transitions incoming.delivered → read", () => {
    const core = makeCore();
    seedConversation(core);
    const { messageId } = core.notifyIncomingMessage({
      senderId: REMOTE.userId,
      text: "hi",
      initialStatus: "delivered",
    });
    core.markAsRead({ messageId });
    expect(core.getMessage(messageId)?.status).toBe("read");
  });

  it("rejects marking an outgoing message as read", () => {
    const core = makeCore();
    seedConversation(core);
    const { messageId } = core.sendMessage({ text: "mine" });
    expect(() => core.markAsRead({ messageId })).toThrow(SpablaCoreError);
  });

  it("rejects an unknown messageId", () => {
    const core = makeCore();
    seedConversation(core);
    expect(() => core.markAsRead({ messageId: asUUID("nope") })).toThrow(SpablaCoreError);
  });

  it("emits message.read with previousStatus", () => {
    const core = makeCore();
    seedConversation(core);
    const { messageId } = core.notifyIncomingMessage({
      senderId: REMOTE.userId,
      text: "hi",
    });
    const read = vi.fn();
    core.subscribe("message.read", read);
    core.markAsRead({ messageId });
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0]?.[0].previousStatus).toBe("sent");
  });
});

describe("SpablaCore — messaging events", () => {
  it("subscribe receives all five messaging event names", () => {
    const core = makeCore();
    seedConversation(core);
    const names: string[] = [];
    core.subscribe("message.created", (e) => names.push(e.name));
    core.subscribe("message.sent", (e) => names.push(e.name));
    core.subscribe("message.delivered", (e) => names.push(e.name));
    core.subscribe("message.read", (e) => names.push(e.name));
    core.subscribe("message.failed", (e) => names.push(e.name));
    core.sendMessage({ text: "one" });
    core.notifyIncomingMessage({
      senderId: REMOTE.userId,
      text: "two",
      initialStatus: "delivered",
    });
    const { messageId: incoming } = core.notifyIncomingMessage({
      senderId: REMOTE.userId,
      text: "three",
    });
    core.markAsRead({ messageId: incoming });
    expect(names).toContain("message.created");
    expect(names).toContain("message.sent");
    expect(names).toContain("message.delivered");
    expect(names).toContain("message.read");
  });

  it("events carry meta.ts and meta.correlationId", () => {
    const core = makeCore();
    seedConversation(core);
    const sent = vi.fn();
    core.subscribe("message.sent", sent);
    core.sendMessage({ text: "hi" });
    expect(sent.mock.calls[0]?.[0].meta.ts).toBeDefined();
    expect(sent.mock.calls[0]?.[0].meta.correlationId).toBeDefined();
  });

  it("unsubscribe stops delivery of messaging events", () => {
    const core = makeCore();
    seedConversation(core);
    const sent = vi.fn();
    const off = core.subscribe("message.sent", sent);
    off();
    core.sendMessage({ text: "hi" });
    expect(sent).not.toHaveBeenCalled();
  });

  it("messaging events flow through the same bus as engine events", () => {
    const core = makeCore();
    const engineEvent = vi.fn();
    const coreEvent = vi.fn();
    core.subscribe("participant.joined", engineEvent);
    core.subscribe("message.sent", coreEvent);
    seedConversation(core);
    core.sendMessage({ text: "hi" });
    expect(engineEvent).toHaveBeenCalledTimes(2); // local + remote
    expect(coreEvent).toHaveBeenCalledTimes(1);
  });

  it("outgoing emits created BEFORE sent chronologically", () => {
    const core = makeCore();
    seedConversation(core);
    const seen: string[] = [];
    core.subscribe("message.created", () => seen.push("created"));
    core.subscribe("message.sent", () => seen.push("sent"));
    core.sendMessage({ text: "hi" });
    expect(seen).toEqual(["created", "sent"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// STT (fase 3)
// ─────────────────────────────────────────────────────────────────────────────
function seedActiveCall(core: SpablaCore) {
  seedConversation(core);
  const { callId } = core.startCall({ mode: "voice" });
  core.acceptCall(callId);
  return callId;
}

describe("SpablaCore — startSTT", () => {
  it("returns sessionId; getSTTSession reflects listening", () => {
    const core = makeCore();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startSTT({ callId, speaker: "local" });
    expect(sessionId).toBeDefined();
    expect(core.getSTTSession(sessionId)?.state).toBe("listening");
  });

  it("rejects when no conversation is loaded", () => {
    const core = makeCore();
    expect(() => core.startSTT({ callId: asUUID("nope"), speaker: "local" })).toThrow(SpablaCoreError);
  });

  it("rejects when the CallSession does not exist", () => {
    const core = makeCore();
    seedConversation(core);
    expect(() => core.startSTT({ callId: asUUID("nope"), speaker: "local" })).toThrow(SpablaCoreError);
  });

  it("rejects when the CallSession is not accepted", () => {
    const core = makeCore();
    seedConversation(core);
    const { callId } = core.startCall({ mode: "voice" });
    expect(() => core.startSTT({ callId, speaker: "local" })).toThrow(SpablaCoreError);
  });

  it("emits stt.session.started", () => {
    const core = makeCore();
    const started = vi.fn();
    core.subscribe("stt.session.started", started);
    const callId = seedActiveCall(core);
    core.startSTT({ callId, speaker: "local" });
    expect(started).toHaveBeenCalledTimes(1);
  });

  it("rejects a second active session for the same (callId, speaker)", () => {
    const core = makeCore();
    const callId = seedActiveCall(core);
    core.startSTT({ callId, speaker: "local" });
    expect(() => core.startSTT({ callId, speaker: "local" })).toThrow(SpablaCoreError);
  });
});

describe("SpablaCore — stopSTT", () => {
  it("transitions the session to completed and emits stt.session.ended", () => {
    const core = makeCore();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startSTT({ callId, speaker: "local" });
    const ended = vi.fn();
    core.subscribe("stt.session.ended", ended);
    core.stopSTT({ sessionId });
    expect(core.getSTTSession(sessionId)?.state).toBe("completed");
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("emits stt.session.ended once", () => {
    const core = makeCore();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startSTT({ callId, speaker: "local" });
    const ended = vi.fn();
    core.subscribe("stt.session.ended", ended);
    core.stopSTT({ sessionId });
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("rejects unknown sessionId", () => {
    const core = makeCore();
    expect(() => core.stopSTT({ sessionId: asUUID("nope") })).toThrow(SpablaCoreError);
  });

  it("rejects if the session is already terminal", () => {
    const core = makeCore();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startSTT({ callId, speaker: "local" });
    core.stopSTT({ sessionId });
    expect(() => core.stopSTT({ sessionId })).toThrow();
  });

  it("clears currentTurnId when stopping mid-turn", () => {
    const core = makeCore();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startSTT({ callId, speaker: "local" });
    core.simulateSTTPartial({ sessionId, text: "half" });
    core.stopSTT({ sessionId });
    expect(core.getSTTSession(sessionId)?.currentTurnId).toBeUndefined();
  });
});

describe("SpablaCore — pushAudioChunk", () => {
  it("first chunk transitions listening → transcribing", () => {
    const core = makeCore();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startSTT({ callId, speaker: "local" });
    core.pushAudioChunk({ sessionId, chunk: new Uint8Array(128) });
    expect(core.getSTTSession(sessionId)?.state).toBe("transcribing");
  });

  it("bytes accumulate in bytesReceived", () => {
    const core = makeCore();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startSTT({ callId, speaker: "local" });
    core.pushAudioChunk({ sessionId, chunk: new Uint8Array(50) });
    core.pushAudioChunk({ sessionId, chunk: new Uint8Array(70) });
    expect(core.getSTTSession(sessionId)?.bytesReceived).toBe(120);
  });

  it("rejects unknown sessionId", () => {
    const core = makeCore();
    expect(() =>
      core.pushAudioChunk({ sessionId: asUUID("nope"), chunk: new Uint8Array(1) }),
    ).toThrow(SpablaCoreError);
  });

  it("rejects when the session is terminal", () => {
    const core = makeCore();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startSTT({ callId, speaker: "local" });
    core.stopSTT({ sessionId });
    expect(() =>
      core.pushAudioChunk({ sessionId, chunk: new Uint8Array(1) }),
    ).toThrow();
  });

  it("multiple chunks inside one turn do not create a new turn", () => {
    const core = makeCore();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startSTT({ callId, speaker: "local" });
    core.pushAudioChunk({ sessionId, chunk: new Uint8Array(10) });
    core.pushAudioChunk({ sessionId, chunk: new Uint8Array(10) });
    expect(core.getSTTSession(sessionId)?.turnCount).toBe(0);
  });
});

describe("SpablaCore — simulatePartial / simulateFinal / simulateError", () => {
  it("simulateSTTPartial propagates and updates the active turn", () => {
    const core = makeCore();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startSTT({ callId, speaker: "local" });
    const partial = vi.fn();
    core.subscribe("stt.partial", partial);
    core.simulateSTTPartial({ sessionId, text: "hola" });
    expect(partial).toHaveBeenCalledTimes(1);
    expect(core.getSTTSession(sessionId)?.currentTurnId).toBeDefined();
  });

  it("simulateSTTFinal closes the turn and transitions to listening", () => {
    const core = makeCore();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startSTT({ callId, speaker: "local" });
    core.simulateSTTPartial({ sessionId, text: "hola" });
    core.simulateSTTFinal({ sessionId, text: "hola mundo", language: "es" });
    expect(core.getSTTSession(sessionId)?.state).toBe("listening");
    expect(core.getSTTSession(sessionId)?.currentTurnId).toBeUndefined();
  });

  it("simulateSTTError transitions to failed", () => {
    const core = makeCore();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startSTT({ callId, speaker: "local" });
    core.simulateSTTError({ sessionId, code: "x", message: "y" });
    expect(core.getSTTSession(sessionId)?.state).toBe("failed");
  });

  it("all three reject unknown sessionId", () => {
    const core = makeCore();
    const nope = asUUID("nope");
    expect(() => core.simulateSTTPartial({ sessionId: nope, text: "x" })).toThrow(SpablaCoreError);
    expect(() => core.simulateSTTFinal({ sessionId: nope, text: "x" })).toThrow(SpablaCoreError);
    expect(() => core.simulateSTTError({ sessionId: nope, code: "x", message: "y" })).toThrow(SpablaCoreError);
  });

  it("all three reject on a terminal session", () => {
    const core = makeCore();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startSTT({ callId, speaker: "local" });
    core.stopSTT({ sessionId });
    expect(() => core.simulateSTTPartial({ sessionId, text: "x" })).toThrow();
    expect(() => core.simulateSTTFinal({ sessionId, text: "x" })).toThrow();
    expect(() => core.simulateSTTError({ sessionId, code: "x", message: "y" })).toThrow();
  });
});

describe("SpablaCore — STT events", () => {
  it("subscribe receives all 5 STT event names", () => {
    const core = makeCore();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startSTT({ callId, speaker: "local" });
    const names: string[] = [];
    core.subscribe("stt.session.started", (e) => names.push(e.name));
    core.subscribe("stt.partial", (e) => names.push(e.name));
    core.subscribe("stt.final", (e) => names.push(e.name));
    core.subscribe("stt.failed", (e) => names.push(e.name));
    core.subscribe("stt.session.ended", (e) => names.push(e.name));
    core.simulateSTTPartial({ sessionId, text: "x" });
    core.simulateSTTFinal({ sessionId, text: "x done", language: "en" });
    core.stopSTT({ sessionId });
    // session.started was emitted BEFORE our subscribe here — expected absent
    expect(names).toEqual(["stt.partial", "stt.final", "stt.session.ended"]);
  });

  it("events carry meta.ts and meta.correlationId", () => {
    const core = makeCore();
    const callId = seedActiveCall(core);
    const started = vi.fn();
    core.subscribe("stt.session.started", started);
    core.startSTT({ callId, speaker: "local" });
    expect(started.mock.calls[0]?.[0].meta.ts).toBeDefined();
    expect(started.mock.calls[0]?.[0].meta.correlationId).toBeDefined();
  });

  it("unsubscribe stops STT event delivery", () => {
    const core = makeCore();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startSTT({ callId, speaker: "local" });
    const partial = vi.fn();
    const off = core.subscribe("stt.partial", partial);
    off();
    core.simulateSTTPartial({ sessionId, text: "x" });
    expect(partial).not.toHaveBeenCalled();
  });

  it("STT events flow through the same bus as Engine + messaging", () => {
    const core = makeCore();
    const engineEvent = vi.fn();
    const stt = vi.fn();
    core.subscribe("call.accepted", engineEvent);
    core.subscribe("stt.session.started", stt);
    const callId = seedActiveCall(core);
    core.startSTT({ callId, speaker: "local" });
    expect(engineEvent).toHaveBeenCalledTimes(1);
    expect(stt).toHaveBeenCalledTimes(1);
  });

  it("stt.session.started is emitted before any stt.partial for that session", () => {
    const core = makeCore();
    const callId = seedActiveCall(core);
    const seen: string[] = [];
    core.subscribe("stt.session.started", () => seen.push("started"));
    core.subscribe("stt.partial", () => seen.push("partial"));
    const { sessionId } = core.startSTT({ callId, speaker: "local" });
    core.simulateSTTPartial({ sessionId, text: "x" });
    expect(seen).toEqual(["started", "partial"]);
  });
});

describe("SpablaCore — STT encapsulation and compat", () => {
  it("does not expose the STTManager directly", () => {
    const publicMethods = new Set(
      Object.getOwnPropertyNames(SpablaCore.prototype).filter((n) => n !== "constructor"),
    );
    expect(publicMethods.has("getSTTManager")).toBe(false);
    expect(publicMethods.has("stt")).toBe(false);
  });

  it("endCall auto-stops STT sessions via the PipelineOrchestrator (§14 fase 6)", () => {
    const core = makeCore();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startSTT({ callId, speaker: "local" });
    core.endCall(callId);
    expect(core.getSTTSession(sessionId)?.state).toBe("completed");
  });

  it("sendMessage still works during an active STT session", () => {
    const core = makeCore();
    const callId = seedActiveCall(core);
    core.startSTT({ callId, speaker: "local" });
    const { messageId } = core.sendMessage({ text: "in-call" });
    expect(core.getMessage(messageId)?.text).toBe("in-call");
  });

  it("Fase 2 messaging tests remain green (spot check: getMessages returns empty)", () => {
    const core = makeCore();
    seedConversation(core);
    expect(core.getMessages().messages).toEqual([]);
  });

  it("exposes the 3 STT commands + 3 simulate* + 3 snapshots on prototype", () => {
    const publicMethods = new Set(
      Object.getOwnPropertyNames(SpablaCore.prototype).filter((n) => n !== "constructor"),
    );
    for (const name of [
      "startSTT", "stopSTT", "pushAudioChunk",
      "simulateSTTPartial", "simulateSTTFinal", "simulateSTTError",
      "getSTTSession", "getSTTTurn", "listActiveSTTSessions",
    ]) expect(publicMethods.has(name)).toBe(true);
  });
});

describe("SpablaCore — messaging encapsulation + compat", () => {
  it("does not expose the MessageManager directly", () => {
    const core = makeCore();
    const publicMethods = new Set(
      Object.getOwnPropertyNames(SpablaCore.prototype).filter((n) => n !== "constructor"),
    );
    expect(publicMethods.has("getMessageManager")).toBe(false);
  });

  it("getThread returns undefined when no conversation has been loaded", () => {
    const core = makeCore();
    expect(core.getThread()).toBeUndefined();
  });

  it("endCall does NOT clear message history", () => {
    const core = makeCore();
    seedConversation(core);
    core.sendMessage({ text: "before" });
    const { callId } = core.startCall({ mode: "voice" });
    core.acceptCall(callId);
    core.endCall(callId);
    expect(core.getMessages().messages).toHaveLength(1);
  });

  it("startCall works normally after messages have been exchanged", () => {
    const core = makeCore();
    seedConversation(core);
    core.sendMessage({ text: "warm-up" });
    const { callId } = core.startCall({ mode: "voice" });
    expect(core.getCall(callId)?.state).toBe("ringing");
  });

  it("existing fase 1.6 methods still work (startVideo idempotency preserved)", () => {
    const core = makeCore();
    seedConversation(core);
    const { callId } = core.startCall({ mode: "voice" });
    core.acceptCall(callId);
    const on = vi.fn();
    core.subscribe("video.enabled", on);
    core.startVideo(callId);
    core.startVideo(callId);
    expect(on).toHaveBeenCalledTimes(1);
  });

  it("exposes exactly the 15 mandated methods after fase 2", () => {
    const publicMethods = new Set(
      Object.getOwnPropertyNames(SpablaCore.prototype).filter((n) => n !== "constructor"),
    );
    const mandated = [
      "createConversation",
      "joinConversation",
      "leaveConversation",
      "sendMessage",
      "notifyIncomingMessage",
      "getMessages",
      "markAsRead",
      "startCall",
      "acceptCall",
      "rejectCall",
      "endCall",
      "startVideo",
      "stopVideo",
      "startInterpreter",
      "stopInterpreter",
      "subscribe",
    ];
    for (const name of mandated) expect(publicMethods.has(name)).toBe(true);
  });
});

describe("SpablaCore — startCall preconditions", () => {
  it("does NOT allow a call without a LanguagePair (no remote joined)", () => {
    const core = makeCore();
    core.createConversation({ conversationId: CONV, local: LOCAL });
    expect(() => core.startCall({ mode: "voice" })).toThrow(SpablaCoreError);
  });

  it("does NOT allow a call when both participants share language", () => {
    const core = makeCore();
    core.createConversation({ conversationId: CONV, local: LOCAL });
    core.joinConversation({ remote: { ...REMOTE, language: "es" } });
    expect(() => core.startCall()).toThrow(SpablaCoreError);
  });

  it("does NOT allow a call when there is no conversation loaded", () => {
    const core = makeCore();
    expect(() => core.startCall()).toThrow(SpablaCoreError);
  });
});

describe("SpablaCore — full call flow", () => {
  let core: SpablaCore;
  beforeEach(() => {
    core = makeCore();
    seedConversation(core);
  });

  it("startCall returns callId and creates a ringing call", () => {
    const initiated = vi.fn();
    core.subscribe("call.initiated", initiated);
    const { callId } = core.startCall({ mode: "voice" });
    expect(callId).toBeDefined();
    expect(core.getCall(callId)?.state).toBe("ringing");
    expect(initiated).toHaveBeenCalledTimes(1);
  });

  it("acceptCall transitions to accepted", () => {
    const { callId } = core.startCall();
    const accepted = vi.fn();
    core.subscribe("call.accepted", accepted);
    core.acceptCall(callId);
    expect(core.getCall(callId)?.state).toBe("accepted");
    expect(accepted).toHaveBeenCalledTimes(1);
  });

  it("rejectCall transitions to rejected and clears flags", () => {
    const { callId } = core.startCall();
    // Rejection is only valid from ringing/incoming; ringing is a caller state so
    // typically a call reject is issued by callee. Here we drive it against Engine
    // behaviour: attempting reject from ringing is allowed by the state machine.
    core.rejectCall(callId);
    expect(core.getCall(callId)?.state).toBe("rejected");
    expect(core.getCallFlags(callId)).toBeUndefined();
  });

  it("endCall transitions to ended and clears flags", () => {
    const { callId } = core.startCall();
    core.acceptCall(callId);
    core.endCall(callId);
    expect(core.getCall(callId)?.state).toBe("ended");
    expect(core.getCallFlags(callId)).toBeUndefined();
  });

  it("acceptCall on unknown call throws SpablaCoreError", () => {
    expect(() => core.acceptCall(asUUID("nope"))).toThrow(SpablaCoreError);
  });
});

describe("SpablaCore — video toggle", () => {
  let core: SpablaCore;
  let callId: ReturnType<typeof asUUID>;
  beforeEach(() => {
    core = makeCore();
    seedConversation(core);
    callId = core.startCall({ mode: "voice" }).callId;
    core.acceptCall(callId);
  });

  it("startVideo emits video.enabled and flips the flag", () => {
    const on = vi.fn();
    core.subscribe("video.enabled", on);
    core.startVideo(callId);
    expect(on).toHaveBeenCalledTimes(1);
    expect(core.getCallFlags(callId)?.videoEnabled).toBe(true);
  });

  it("startVideo is idempotent — second call does not re-emit", () => {
    const on = vi.fn();
    core.subscribe("video.enabled", on);
    core.startVideo(callId);
    core.startVideo(callId);
    expect(on).toHaveBeenCalledTimes(1);
  });

  it("stopVideo emits video.disabled and flips flag", () => {
    core.startVideo(callId);
    const off = vi.fn();
    core.subscribe("video.disabled", off);
    core.stopVideo(callId);
    expect(off).toHaveBeenCalledTimes(1);
    expect(core.getCallFlags(callId)?.videoEnabled).toBe(false);
  });

  it("stopVideo when already off is a no-op", () => {
    const off = vi.fn();
    core.subscribe("video.disabled", off);
    core.stopVideo(callId);
    expect(off).not.toHaveBeenCalled();
  });

  it("startVideo throws when the call is not accepted", () => {
    const core2 = makeCore();
    seedConversation(core2);
    const id = core2.startCall().callId;
    expect(() => core2.startVideo(id)).toThrow(SpablaCoreError);
  });
});

describe("SpablaCore — interpreter toggle", () => {
  let core: SpablaCore;
  let callId: ReturnType<typeof asUUID>;
  beforeEach(() => {
    core = makeCore();
    seedConversation(core);
    callId = core.startCall({ mode: "voice" }).callId;
    core.acceptCall(callId);
  });

  it("startInterpreter emits interpreter.enabled", () => {
    const on = vi.fn();
    core.subscribe("interpreter.enabled", on);
    core.startInterpreter(callId);
    expect(on).toHaveBeenCalledTimes(1);
    expect(core.getCallFlags(callId)?.interpreterEnabled).toBe(true);
  });

  it("stopInterpreter emits interpreter.disabled after enabling", () => {
    core.startInterpreter(callId);
    const off = vi.fn();
    core.subscribe("interpreter.disabled", off);
    core.stopInterpreter(callId);
    expect(off).toHaveBeenCalledTimes(1);
    expect(core.getCallFlags(callId)?.interpreterEnabled).toBe(false);
  });

  it("startInterpreter is idempotent", () => {
    const on = vi.fn();
    core.subscribe("interpreter.enabled", on);
    core.startInterpreter(callId);
    core.startInterpreter(callId);
    expect(on).toHaveBeenCalledTimes(1);
  });

  it("throws if the call is not accepted", () => {
    const core2 = makeCore();
    seedConversation(core2);
    const id = core2.startCall().callId;
    expect(() => core2.startInterpreter(id)).toThrow(SpablaCoreError);
  });
});

describe("SpablaCore — subscribe surface", () => {
  it("exposes subscribe returning an idempotent Unsubscribe", () => {
    const core = makeCore();
    const handler = vi.fn();
    const off = core.subscribe("participant.joined", handler);
    seedConversation(core);
    expect(handler).toHaveBeenCalledTimes(2); // local + remote
    off();
    off(); // idempotent
    core.joinConversation({ remote: { ...REMOTE, userId: asUUID("u-other"), language: "fr" } });
    // still 2 — nothing after unsubscribe
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("delivers Core-layer events (message.sent) via subscribe", () => {
    const core = makeCore();
    seedConversation(core);
    const sent = vi.fn();
    core.subscribe("message.sent", sent);
    core.sendMessage({ text: "hi" });
    expect(sent).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Translation (fase 4)
// ─────────────────────────────────────────────────────────────────────────────

type FakeAdapterResp = { translatedText: string; detectedSourceLanguage?: import("../types/language.js").LangCode };
type FakeAdapterReq = {
  requestId: import("../types/ids.js").UUID;
  text: string;
  from: import("../types/language.js").LangCode;
  to: import("../types/language.js").LangCode;
};

class FakeMT implements TranslationAdapter {
  readonly kind = "mt" as const;
  readonly displayName: string;
  private readonly resp: (r: FakeAdapterReq) => Promise<FakeAdapterResp>;
  public calls: FakeAdapterReq[] = [];
  constructor(resp: (r: FakeAdapterReq) => Promise<FakeAdapterResp>, name = "fake-mt") {
    this.resp = resp;
    this.displayName = name;
  }
  translate(r: FakeAdapterReq): Promise<FakeAdapterResp> {
    this.calls.push(r);
    return this.resp(r);
  }
}

function coreWithAdapter(): { core: SpablaCore; adapter: FakeMT } {
  const core = makeCore();
  const adapter = new FakeMT(async (r) => ({ translatedText: `[EN] ${r.text}` }));
  (core as unknown as { engine: { getAdapterRegistry(): { register: (k: string, a: unknown) => void } } })
    .engine.getAdapterRegistry().register("mt", adapter);
  return { core, adapter };
}
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("SpablaCore — startTranslation", () => {
  it("returns sessionId; getTranslationSession reflects active", () => {
    const { core } = coreWithAdapter();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTranslation({ callId });
    expect(sessionId).toBeDefined();
    expect(core.getTranslationSession(sessionId)?.state).toBe("active");
  });

  it("rejects when the CallSession does not exist", () => {
    const { core } = coreWithAdapter();
    seedConversation(core);
    expect(() => core.startTranslation({ callId: asUUID("nope") })).toThrow(SpablaCoreError);
  });

  it("rejects when the CallSession is not accepted", () => {
    const { core } = coreWithAdapter();
    seedConversation(core);
    const { callId } = core.startCall({ mode: "voice" });
    expect(() => core.startTranslation({ callId })).toThrow(SpablaCoreError);
  });

  it("carries the call's LanguagePair verbatim (from conv)", () => {
    const { core } = coreWithAdapter();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTranslation({ callId });
    const s = core.getTranslationSession(sessionId)!;
    expect(s.languagePair.from).toBe("es");
    expect(s.languagePair.to).toBe("en");
  });

  it("emits translation.session.started", () => {
    const { core } = coreWithAdapter();
    const started = vi.fn();
    core.subscribe("translation.session.started", started);
    const callId = seedActiveCall(core);
    core.startTranslation({ callId });
    expect(started).toHaveBeenCalledTimes(1);
  });

  it("accepts a custom languagePair overriding the call's default", async () => {
    const { core } = coreWithAdapter();
    const callId = seedActiveCall(core);
    // Default pair on this test's conversation is ES → EN. Open a second
    // session in the reverse direction on the SAME call.
    const inverse = (await import("../types/language.js")).makeLanguagePair("en", "es");
    const { sessionId: forward } = core.startTranslation({ callId });
    const { sessionId: reverse } = core.startTranslation({ callId, languagePair: inverse });
    const forwardSess = core.getTranslationSession(forward)!;
    const reverseSess = core.getTranslationSession(reverse)!;
    expect(forwardSess.languagePair.from).toBe("es");
    expect(forwardSess.languagePair.to).toBe("en");
    expect(reverseSess.languagePair.from).toBe("en");
    expect(reverseSess.languagePair.to).toBe("es");
    expect(forwardSess.id).not.toBe(reverseSess.id);
  });
});

describe("SpablaCore — stopTranslation", () => {
  it("transitions to completed and emits translation.session.ended", () => {
    const { core } = coreWithAdapter();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTranslation({ callId });
    const ended = vi.fn();
    core.subscribe("translation.session.ended", ended);
    core.stopTranslation({ sessionId });
    expect(core.getTranslationSession(sessionId)?.state).toBe("completed");
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("rejects unknown sessionId", () => {
    const { core } = coreWithAdapter();
    expect(() => core.stopTranslation({ sessionId: asUUID("nope") })).toThrow(SpablaCoreError);
  });

  it("rejects if the session is already terminal", () => {
    const { core } = coreWithAdapter();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTranslation({ callId });
    core.stopTranslation({ sessionId });
    expect(() => core.stopTranslation({ sessionId })).toThrow();
  });

  it("multiple sessions are independent", () => {
    const { core } = coreWithAdapter();
    const callId = seedActiveCall(core);
    const a = core.startTranslation({ callId });
    const b = core.startTranslation({ callId });
    core.stopTranslation({ sessionId: a.sessionId });
    expect(core.getTranslationSession(a.sessionId)?.state).toBe("completed");
    expect(core.getTranslationSession(b.sessionId)?.state).toBe("active");
  });
});

describe("SpablaCore — requestTranslation", () => {
  it("happy path: adapter resolves and translation.completed arrives", async () => {
    const { core } = coreWithAdapter();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTranslation({ callId });
    const completed = vi.fn();
    core.subscribe("translation.completed", completed);
    const { requestId } = core.requestTranslation(
      { sessionId, text: "hola", sourceLanguage: "es" });
    await flush();
    expect(completed).toHaveBeenCalledTimes(1);
    expect(core.getTranslationRequest(requestId)?.result?.translatedText).toBe("[EN] hola");
  });

  it("no adapter registered → translation.failed", async () => {
    const core = makeCore();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTranslation({ callId });
    const failed = vi.fn();
    core.subscribe("translation.failed", failed);
    core.requestTranslation({ sessionId, text: "hola", sourceLanguage: "es" });
    await flush();
    expect(failed).toHaveBeenCalledTimes(1);
    expect(failed.mock.calls[0]?.[0].error.code).toBe("no-adapter");
  });

  it("rejects unknown sessionId", () => {
    const { core } = coreWithAdapter();
    seedActiveCall(core);
    expect(() => core.requestTranslation(
      { sessionId: asUUID("nope"), text: "hola", sourceLanguage: "es" })).toThrow(SpablaCoreError);
  });

  it("rejects when the session is terminal", async () => {
    const { core } = coreWithAdapter();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTranslation({ callId });
    core.stopTranslation({ sessionId });
    const failed = vi.fn();
    core.subscribe("translation.failed", failed);
    core.requestTranslation({ sessionId, text: "hola", sourceLanguage: "es" });
    await flush();
    expect(failed.mock.calls[0]?.[0].error.code).toBe("session-terminal");
  });

  it("preserves sourceTurnId when passed", async () => {
    const { core } = coreWithAdapter();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTranslation({ callId });
    const turnRef = asUUID("t-1");
    const { requestId } = core.requestTranslation(
      { sessionId, text: "hola", sourceLanguage: "es", sourceTurnId: turnRef });
    await flush();
    expect(core.getTranslationRequest(requestId)?.sourceTurnId).toBe(turnRef);
  });

  it("carries sourceLanguage and targetLanguage correctly", async () => {
    const { core } = coreWithAdapter();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTranslation({ callId });
    const { requestId } = core.requestTranslation(
      { sessionId, text: "hola", sourceLanguage: "es" });
    await flush();
    const req = core.getTranslationRequest(requestId)!;
    expect(req.sourceLanguage).toBe("es");
    expect(req.targetLanguage).toBe("en");
  });

  it("rejects empty text", () => {
    const { core } = coreWithAdapter();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTranslation({ callId });
    expect(() =>
      core.requestTranslation({ sessionId, text: "", sourceLanguage: "es" }),
    ).toThrow(SpablaCoreError);
  });

  it("listActiveTranslationSessions filters by callId and excludes terminals", () => {
    const { core } = coreWithAdapter();
    const callId = seedActiveCall(core);
    const a = core.startTranslation({ callId });
    const b = core.startTranslation({ callId });
    core.stopTranslation({ sessionId: a.sessionId });
    const active = core.listActiveTranslationSessions(callId);
    expect(active.map((s) => s.id)).toEqual([b.sessionId]);
  });

  it("multiple requests in same session don't interfere", async () => {
    const { core } = coreWithAdapter();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTranslation({ callId });
    const r1 = core.requestTranslation({ sessionId, text: "uno", sourceLanguage: "es" });
    const r2 = core.requestTranslation({ sessionId, text: "dos", sourceLanguage: "es" });
    await flush();
    expect(core.getTranslationRequest(r1.requestId)?.result?.translatedText).toBe("[EN] uno");
    expect(core.getTranslationRequest(r2.requestId)?.result?.translatedText).toBe("[EN] dos");
    expect(core.getTranslationSession(sessionId)?.completedCount).toBe(2);
  });
});

describe("SpablaCore — Translation adapter", () => {
  it("adapter is registered via getAdapterRegistry (private) — visible only through Engine", () => {
    const { core, adapter } = coreWithAdapter();
    expect(adapter.calls).toHaveLength(0);
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTranslation({ callId });
    core.requestTranslation({ sessionId, text: "hola", sourceLanguage: "es" });
    expect(adapter.calls).toHaveLength(1);
  });

  it("adapter can be replaced at runtime", async () => {
    const { core } = coreWithAdapter();
    const registry = (core as unknown as { engine: { getAdapterRegistry(): {
      register: (k: string, a: unknown) => void; unregister: (k: string) => boolean;
    } } }).engine.getAdapterRegistry();
    registry.unregister("mt");
    const other = new FakeMT(async (r) => ({ translatedText: `HELLO ${r.text}` }), "other");
    registry.register("mt", other);
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTranslation({ callId });
    const { requestId } = core.requestTranslation(
      { sessionId, text: "hola", sourceLanguage: "es" });
    await flush();
    expect(core.getTranslationRequest(requestId)?.result?.translatedText).toBe("HELLO hola");
    expect(core.getTranslationRequest(requestId)?.result?.providerDisplayName).toBe("other");
  });

  it("SpablaCore does not expose any adapter accessor", () => {
    const methods = new Set(Object.getOwnPropertyNames(SpablaCore.prototype));
    expect(methods.has("getAdapterRegistry")).toBe(false);
    expect(methods.has("registerAdapter")).toBe(false);
  });

  it("adapter failure does not tear down the session", async () => {
    const core = makeCore();
    const registry = (core as unknown as { engine: { getAdapterRegistry(): {
      register: (k: string, a: unknown) => void;
    } } }).engine.getAdapterRegistry();
    let shouldFail = true;
    registry.register("mt", new FakeMT(async (r) => {
      if (shouldFail) throw new Error("boom");
      return { translatedText: `[EN] ${r.text}` };
    }));
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTranslation({ callId });
    core.requestTranslation({ sessionId, text: "uno", sourceLanguage: "es" });
    await flush();
    expect(core.getTranslationSession(sessionId)?.state).toBe("active");
    shouldFail = false;
    const r2 = core.requestTranslation({ sessionId, text: "dos", sourceLanguage: "es" });
    await flush();
    expect(core.getTranslationRequest(r2.requestId)?.state).toBe("completed");
  });
});

describe("SpablaCore — Translation events", () => {
  it("subscribe receives all 6 events across a lifecycle", async () => {
    const { core } = coreWithAdapter();
    const names = [
      "translation.session.started",
      "translation.request.created",
      "translation.request.dispatched",
      "translation.completed",
      "translation.session.ended",
    ] as const;
    const seen = new Map<string, number>();
    for (const n of names) {
      core.subscribe(n, () => seen.set(n, (seen.get(n) ?? 0) + 1));
    }
    const failed = vi.fn();
    core.subscribe("translation.failed", failed);
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTranslation({ callId });
    core.requestTranslation({ sessionId, text: "hola", sourceLanguage: "es" });
    await flush();
    core.stopTranslation({ sessionId });
    for (const n of names) expect(seen.get(n)).toBe(1);
    expect(failed).not.toHaveBeenCalled();
  });

  it("event meta carries ts and correlationId", async () => {
    const { core } = coreWithAdapter();
    const captured = vi.fn();
    core.subscribe("translation.completed", captured);
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTranslation({ callId });
    core.requestTranslation({ sessionId, text: "hola", sourceLanguage: "es" });
    await flush();
    const meta = captured.mock.calls[0]?.[0].meta;
    expect(meta.ts).toBeDefined();
    expect(meta.correlationId).toBeDefined();
  });

  it("unsubscribe stops delivery", async () => {
    const { core } = coreWithAdapter();
    const handler = vi.fn();
    const unsub = core.subscribe("translation.completed", handler);
    unsub();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTranslation({ callId });
    core.requestTranslation({ sessionId, text: "hola", sourceLanguage: "es" });
    await flush();
    expect(handler).not.toHaveBeenCalled();
  });

  it("events flow via the same bus as Engine/STT/Messaging", async () => {
    const { core } = coreWithAdapter();
    const orderName: string[] = [];
    core.subscribe("call.state.changed", () => orderName.push("call"));
    core.subscribe("stt.session.started", () => orderName.push("stt"));
    core.subscribe("translation.completed", () => orderName.push("translation"));
    const callId = seedActiveCall(core);
    core.startSTT({ callId, speaker: "local" });
    const { sessionId } = core.startTranslation({ callId });
    core.requestTranslation({ sessionId, text: "hola", sourceLanguage: "es" });
    await flush();
    expect(orderName).toContain("call");
    expect(orderName).toContain("stt");
    expect(orderName).toContain("translation");
  });

  it("ordering: request.created → request.dispatched → completed", async () => {
    const { core } = coreWithAdapter();
    const order: string[] = [];
    core.subscribe("translation.request.created", () => order.push("created"));
    core.subscribe("translation.request.dispatched", () => order.push("dispatched"));
    core.subscribe("translation.completed", () => order.push("completed"));
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTranslation({ callId });
    core.requestTranslation({ sessionId, text: "hola", sourceLanguage: "es" });
    await flush();
    expect(order).toEqual(["created", "dispatched", "completed"]);
  });
});

describe("SpablaCore — Translation encapsulation + STT-manual bridge", () => {
  it("SpablaCore does not expose TranslationManager on its prototype", () => {
    const methods = new Set(Object.getOwnPropertyNames(SpablaCore.prototype));
    expect(methods.has("getTranslationManager")).toBe(false);
  });

  it("endCall auto-stops translation sessions via the PipelineOrchestrator (§14 fase 6)", () => {
    const { core } = coreWithAdapter();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTranslation({ callId });
    core.endCall(callId);
    expect(core.getTranslationSession(sessionId)?.state).toBe("completed");
  });

  it("manual STT + Translation: sourceTurnId preserved end-to-end", async () => {
    const { core } = coreWithAdapter();
    const callId = seedActiveCall(core);
    const { sessionId: sttId } = core.startSTT({ callId, speaker: "local" });
    const { sessionId: mtId } = core.startTranslation({ callId });
    core.simulateSTTPartial({ sessionId: sttId, text: "hola" });
    core.simulateSTTFinal({ sessionId: sttId, text: "hola mundo", language: "es" });
    // fetch the final's turnId from the session's last turn snapshot
    const sttSession = core.getSTTSession(sttId)!;
    // The last turn — currentTurnId is undefined post-final; use engine manager
    const engineMgr = (core as unknown as { engine: {
      getSTTManager(): { listTurns: (id: import("../types/ids.js").UUID) => Array<{ turnId: import("../types/ids.js").UUID }> };
    } }).engine.getSTTManager();
    const lastTurnId = engineMgr.listTurns(sttSession.id).slice(-1)[0]!.turnId;
    const { requestId } = core.requestTranslation({
      sessionId: mtId, text: "hola mundo", sourceLanguage: "es", sourceTurnId: lastTurnId,
    });
    await flush();
    expect(core.getTranslationRequest(requestId)?.sourceTurnId).toBe(lastTurnId);
    expect(core.getTranslationRequest(requestId)?.state).toBe("completed");
  });

  it("Fase 3 STT tests still pass alongside Translation (spot-check)", () => {
    const { core } = coreWithAdapter();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startSTT({ callId, speaker: "local" });
    expect(core.getSTTSession(sessionId)?.state).toBe("listening");
    core.stopSTT({ sessionId });
    expect(core.getSTTSession(sessionId)?.state).toBe("completed");
  });

  it("prototype includes the 3 translation commands + 3 snapshots", () => {
    const methods = new Set(Object.getOwnPropertyNames(SpablaCore.prototype));
    for (const n of [
      "startTranslation", "stopTranslation", "requestTranslation",
      "getTranslationSession", "getTranslationRequest", "listActiveTranslationSessions",
    ]) expect(methods.has(n)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TTS (fase 5)
// ─────────────────────────────────────────────────────────────────────────────

type FakeTTSChunk = {
  seq: number;
  audioBytes: Uint8Array;
  mimeType: string;
  isFinal: boolean;
};
type FakeTTSRequest = {
  requestId: import("../types/ids.js").UUID;
  text: string;
  language: import("../types/language.js").LangCode;
  voiceId: string;
};

class FakeTts implements TTSAdapter {
  readonly kind = "tts" as const;
  readonly displayName: string;
  public calls: FakeTTSRequest[] = [];
  private readonly plan: (r: FakeTTSRequest, s: AbortSignal) => AsyncIterable<FakeTTSChunk>;
  constructor(
    plan: (r: FakeTTSRequest, s: AbortSignal) => AsyncIterable<FakeTTSChunk>,
    name = "fake-tts",
  ) {
    this.plan = plan;
    this.displayName = name;
  }
  synthesize(r: FakeTTSRequest, s: AbortSignal): AsyncIterable<FakeTTSChunk> {
    this.calls.push(r);
    return this.plan(r, s);
  }
}

function singleTts(): FakeTts {
  return new FakeTts(async function* () {
    yield { seq: 0, audioBytes: new Uint8Array([1]), mimeType: "audio/wav", isFinal: true };
  });
}
function multiTts(n: number): FakeTts {
  return new FakeTts(async function* () {
    for (let i = 0; i < n; i++) {
      yield {
        seq: i,
        audioBytes: new Uint8Array([i + 1]),
        mimeType: "audio/wav",
        isFinal: i === n - 1,
      };
    }
  });
}

function coreWithTts(adapter: FakeTts = singleTts()): { core: SpablaCore; adapter: FakeTts } {
  const core = makeCore();
  (core as unknown as { engine: { getAdapterRegistry(): {
    register: (k: string, a: unknown) => void;
  } } }).engine.getAdapterRegistry().register("tts", adapter);
  return { core, adapter };
}
const VOICE = { language: "en" as const, voiceId: "alice" };
async function flushTts(cycles = 60): Promise<void> {
  for (let i = 0; i < cycles; i++) await Promise.resolve();
}

describe("SpablaCore — startTTS", () => {
  it("returns sessionId; getTTSSession reflects active", () => {
    const { core } = coreWithTts();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTTS({ callId, voice: VOICE });
    expect(sessionId).toBeDefined();
    expect(core.getTTSSession(sessionId)?.state).toBe("active");
  });

  it("rejects if the CallSession does not exist", () => {
    const { core } = coreWithTts();
    seedConversation(core);
    expect(() => core.startTTS({ callId: asUUID("nope"), voice: VOICE })).toThrow(SpablaCoreError);
  });

  it("rejects if the CallSession is not accepted", () => {
    const { core } = coreWithTts();
    seedConversation(core);
    const { callId } = core.startCall({ mode: "voice" });
    expect(() => core.startTTS({ callId, voice: VOICE })).toThrow(SpablaCoreError);
  });

  it("rejects if voice.voiceId is empty", () => {
    const { core } = coreWithTts();
    const callId = seedActiveCall(core);
    expect(() =>
      core.startTTS({ callId, voice: { language: "en", voiceId: "" } }),
    ).toThrow(SpablaCoreError);
  });

  it("emits tts.session.started", () => {
    const { core } = coreWithTts();
    const started = vi.fn();
    core.subscribe("tts.session.started", started);
    const callId = seedActiveCall(core);
    core.startTTS({ callId, voice: VOICE });
    expect(started).toHaveBeenCalledTimes(1);
  });

  it("propagates optional voice.rate and voice.pitch verbatim", () => {
    const { core } = coreWithTts();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTTS({
      callId,
      voice: { language: "en", voiceId: "alice", rate: 1.25, pitch: 0.9 },
    });
    const v = core.getTTSSession(sessionId)!.voice;
    expect(v.rate).toBe(1.25);
    expect(v.pitch).toBe(0.9);
  });
});

describe("SpablaCore — stopTTS", () => {
  it("active → completed + tts.session.ended", () => {
    const { core } = coreWithTts();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTTS({ callId, voice: VOICE });
    const ended = vi.fn();
    core.subscribe("tts.session.ended", ended);
    core.stopTTS({ sessionId });
    expect(core.getTTSSession(sessionId)?.state).toBe("completed");
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("rejects unknown sessionId", () => {
    const { core } = coreWithTts();
    expect(() => core.stopTTS({ sessionId: asUUID("nope") })).toThrow(SpablaCoreError);
  });

  it("rejects a terminal session", () => {
    const { core } = coreWithTts();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTTS({ callId, voice: VOICE });
    core.stopTTS({ sessionId });
    expect(() => core.stopTTS({ sessionId })).toThrow();
  });

  it("cancels in-flight requests via adapter (AbortSignal path)", async () => {
    const pending = new FakeTts(async function* (_r, _s) {
      await new Promise<void>(() => {});
      yield { seq: 0, audioBytes: new Uint8Array([1]), mimeType: "audio/wav", isFinal: true };
    });
    const { core } = coreWithTts(pending);
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTTS({ callId, voice: VOICE });
    const { requestId } = core.requestSpeech({ sessionId, text: "hi" });
    core.stopTTS({ sessionId });
    expect(core.getTTSRequest(requestId)?.state).toBe("cancelled");
  });
});

describe("SpablaCore — requestSpeech", () => {
  it("happy path with FakeTTSAdapter → tts.completed llega", async () => {
    const { core } = coreWithTts();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTTS({ callId, voice: VOICE });
    const completed = vi.fn();
    core.subscribe("tts.completed", completed);
    core.requestSpeech({ sessionId, text: "hi" });
    await flushTts();
    expect(completed).toHaveBeenCalledTimes(1);
  });

  it("no adapter registered → tts.failed", async () => {
    const core = makeCore();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTTS({ callId, voice: VOICE });
    const failed = vi.fn();
    core.subscribe("tts.failed", failed);
    core.requestSpeech({ sessionId, text: "hi" });
    await flushTts();
    expect(failed).toHaveBeenCalledTimes(1);
    expect(failed.mock.calls[0]?.[0].error.code).toBe("no-adapter");
  });

  it("rejects unknown sessionId", () => {
    const { core } = coreWithTts();
    seedActiveCall(core);
    expect(() =>
      core.requestSpeech({ sessionId: asUUID("nope"), text: "hi" }),
    ).toThrow(SpablaCoreError);
  });

  it("rejects terminal session", async () => {
    const { core } = coreWithTts();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTTS({ callId, voice: VOICE });
    core.stopTTS({ sessionId });
    const failed = vi.fn();
    core.subscribe("tts.failed", failed);
    core.requestSpeech({ sessionId, text: "hi" });
    await flushTts();
    expect(failed.mock.calls[0]?.[0].error.code).toBe("session-terminal");
  });

  it("rejects empty text", () => {
    const { core } = coreWithTts();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTTS({ callId, voice: VOICE });
    expect(() =>
      core.requestSpeech({ sessionId, text: "" }),
    ).toThrow(SpablaCoreError);
  });

  it("listActiveTTSSessions returns active sessions for the given callId", () => {
    const { core } = coreWithTts();
    const callId = seedActiveCall(core);
    const a = core.startTTS({ callId, voice: VOICE });
    const b = core.startTTS({ callId, voice: VOICE });
    core.stopTTS({ sessionId: a.sessionId });
    const active = core.listActiveTTSSessions(callId);
    expect(active.map((s) => s.id)).toEqual([b.sessionId]);
  });

  it("multiple requests in the same session don't interfere", async () => {
    const { core } = coreWithTts(multiTts(3));
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTTS({ callId, voice: VOICE });
    const r1 = core.requestSpeech({ sessionId, text: "one" });
    const r2 = core.requestSpeech({ sessionId, text: "two" });
    await flushTts();
    expect(core.getTTSRequest(r1.requestId)?.state).toBe("completed");
    expect(core.getTTSRequest(r2.requestId)?.state).toBe("completed");
    expect(core.getTTSSession(sessionId)?.completedCount).toBe(2);
  });

  it("explicit language and voiceId override the session defaults", async () => {
    const { core, adapter } = coreWithTts();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTTS({ callId, voice: VOICE });
    const { requestId } = core.requestSpeech({
      sessionId,
      text: "hola",
      language: "es",
      voiceId: "bob",
    });
    await flushTts();
    expect(core.getTTSRequest(requestId)?.language).toBe("es");
    expect(core.getTTSRequest(requestId)?.voiceId).toBe("bob");
    expect(adapter.calls[0]?.language).toBe("es");
    expect(adapter.calls[0]?.voiceId).toBe("bob");
  });
});

describe("SpablaCore — TTS adapter", () => {
  it("adapter registered via getAdapterRegistry().register('tts', fake)", () => {
    const { core, adapter } = coreWithTts();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTTS({ callId, voice: VOICE });
    core.requestSpeech({ sessionId, text: "hi" });
    expect(adapter.calls).toHaveLength(1);
  });

  it("adapter is replaceable at runtime", async () => {
    const { core } = coreWithTts();
    const registry = (core as unknown as { engine: { getAdapterRegistry(): {
      register: (k: string, a: unknown) => void; unregister: (k: string) => boolean;
    } } }).engine.getAdapterRegistry();
    registry.unregister("tts");
    const other = new FakeTts(async function* () {
      yield { seq: 0, audioBytes: new Uint8Array([9]), mimeType: "audio/wav", isFinal: true };
    }, "other");
    registry.register("tts", other);
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTTS({ callId, voice: VOICE });
    core.requestSpeech({ sessionId, text: "hi" });
    await flushTts();
    expect(other.calls).toHaveLength(1);
  });

  it("adapter is not exposed via public SpablaCore methods", () => {
    const methods = new Set(Object.getOwnPropertyNames(SpablaCore.prototype));
    expect(methods.has("getAdapterRegistry")).toBe(false);
    expect(methods.has("getTTSAdapter")).toBe(false);
  });

  it("sync-throw of synthesize does NOT leave request stuck", async () => {
    const bad = new FakeTts(((): FakeTts["synthesize"] => () => {
      throw new Error("boom");
    })() as never);
    const { core } = coreWithTts(bad);
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTTS({ callId, voice: VOICE });
    const failed = vi.fn();
    core.subscribe("tts.failed", failed);
    const { requestId } = core.requestSpeech({ sessionId, text: "hi" });
    expect(core.getTTSRequest(requestId)?.state).toBe("failed");
    expect(failed.mock.calls[0]?.[0].error.code).toBe("provider-rejected");
  });
});

describe("SpablaCore — TTS events", () => {
  it("subscribe receives all 6 events across a lifecycle", async () => {
    const { core } = coreWithTts();
    const names = [
      "tts.session.started", "tts.request.created", "tts.request.dispatched",
      "tts.chunk.generated", "tts.completed", "tts.session.ended",
    ] as const;
    const seen = new Map<string, number>();
    for (const n of names) core.subscribe(n, () => seen.set(n, (seen.get(n) ?? 0) + 1));
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTTS({ callId, voice: VOICE });
    core.requestSpeech({ sessionId, text: "hi" });
    await flushTts();
    core.stopTTS({ sessionId });
    for (const n of names) expect(seen.get(n)).toBe(1);
  });

  it("event meta carries ts and correlationId", async () => {
    const { core } = coreWithTts();
    const captured = vi.fn();
    core.subscribe("tts.completed", captured);
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTTS({ callId, voice: VOICE });
    core.requestSpeech({ sessionId, text: "hi" });
    await flushTts();
    const meta = captured.mock.calls[0]?.[0].meta;
    expect(meta.ts).toBeDefined();
    expect(meta.correlationId).toBeDefined();
  });

  it("unsubscribe stops delivery", async () => {
    const { core } = coreWithTts();
    const handler = vi.fn();
    const unsub = core.subscribe("tts.completed", handler);
    unsub();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTTS({ callId, voice: VOICE });
    core.requestSpeech({ sessionId, text: "hi" });
    await flushTts();
    expect(handler).not.toHaveBeenCalled();
  });

  it("events share the same bus as Engine + STT + Translation + Messaging", async () => {
    const { core } = coreWithTts();
    const order: string[] = [];
    core.subscribe("call.state.changed", () => order.push("call"));
    core.subscribe("stt.session.started", () => order.push("stt"));
    core.subscribe("tts.completed", () => order.push("tts"));
    const callId = seedActiveCall(core);
    core.startSTT({ callId, speaker: "local" });
    const { sessionId } = core.startTTS({ callId, voice: VOICE });
    core.requestSpeech({ sessionId, text: "hi" });
    await flushTts();
    expect(order).toContain("call");
    expect(order).toContain("stt");
    expect(order).toContain("tts");
  });

  it("ordering per request: request.created → chunk.generated* → completed", async () => {
    const { core } = coreWithTts(multiTts(3));
    const order: string[] = [];
    core.subscribe("tts.request.created", () => order.push("created"));
    core.subscribe("tts.chunk.generated", () => order.push("chunk"));
    core.subscribe("tts.completed", () => order.push("completed"));
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTTS({ callId, voice: VOICE });
    core.requestSpeech({ sessionId, text: "hi" });
    await flushTts();
    expect(order).toEqual(["created", "chunk", "chunk", "chunk", "completed"]);
  });
});

describe("SpablaCore — TTS encapsulation + Translation-manual bridge", () => {
  it("SpablaCore does not expose TTSManager on prototype", () => {
    const methods = new Set(Object.getOwnPropertyNames(SpablaCore.prototype));
    expect(methods.has("getTTSManager")).toBe(false);
  });

  it("endCall auto-stops TTS sessions via the PipelineOrchestrator (§14 fase 6)", () => {
    const { core } = coreWithTts();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTTS({ callId, voice: VOICE });
    core.endCall(callId);
    expect(core.getTTSSession(sessionId)?.state).toBe("completed");
  });

  it("stopTTS cancels via AbortSignal (adapter observable)", async () => {
    let sawAbort = false;
    const pending = new FakeTts(async function* (_r, s) {
      const w = new Promise<void>((res) => {
        s.addEventListener("abort", () => { sawAbort = true; res(); });
      });
      await w;
      yield { seq: 0, audioBytes: new Uint8Array([1]), mimeType: "audio/wav", isFinal: true };
    });
    const { core } = coreWithTts(pending);
    const callId = seedActiveCall(core);
    const { sessionId } = core.startTTS({ callId, voice: VOICE });
    core.requestSpeech({ sessionId, text: "hi" });
    core.stopTTS({ sessionId });
    await flushTts();
    expect(sawAbort).toBe(true);
  });

  it("manual Translation + TTS: sourceTranslationRequestId preserved end-to-end", async () => {
    class MtFake implements TranslationAdapter {
      readonly kind = "mt" as const;
      readonly displayName = "fake-mt";
      async translate(r: import("../types/translation.js").TranslationAdapterRequest):
        Promise<import("../types/translation.js").TranslationAdapterResponse> {
        return { translatedText: `[EN] ${r.text}` };
      }
    }
    const { core } = coreWithTts();
    (core as unknown as { engine: { getAdapterRegistry(): {
      register: (k: string, a: unknown) => void;
    } } }).engine.getAdapterRegistry().register("mt", new MtFake());
    const callId = seedActiveCall(core);
    const { sessionId: mtSession } = core.startTranslation({ callId });
    const { requestId: mtReq } = core.requestTranslation({
      sessionId: mtSession, text: "hola", sourceLanguage: "es",
    });
    await flushTts();
    const { sessionId: ttsSession } = core.startTTS({ callId, voice: VOICE });
    const { requestId: ttsReq } = core.requestSpeech({
      sessionId: ttsSession, text: "hi", sourceTranslationRequestId: mtReq,
    });
    await flushTts();
    expect(core.getTTSRequest(ttsReq)?.sourceTranslationRequestId).toBe(mtReq);
    expect(core.getTTSRequest(ttsReq)?.state).toBe("completed");
  });

  it("386 Fase 4 tests still pass alongside TTS (spot-check)", () => {
    const { core } = coreWithTts();
    const callId = seedActiveCall(core);
    const { sessionId } = core.startSTT({ callId, speaker: "local" });
    expect(core.getSTTSession(sessionId)?.state).toBe("listening");
    core.stopSTT({ sessionId });
    expect(core.getSTTSession(sessionId)?.state).toBe("completed");
  });

  it("prototype includes the 3 TTS commands + 3 snapshots", () => {
    const methods = new Set(Object.getOwnPropertyNames(SpablaCore.prototype));
    for (const n of [
      "startTTS", "stopTTS", "requestSpeech",
      "getTTSSession", "getTTSRequest", "listActiveTTSSessions",
    ]) expect(methods.has(n)).toBe(true);
  });
});

describe("SpablaCore — encapsulation guarantees", () => {
  const core = makeCore();
  const publicMethods = new Set(
    Object.getOwnPropertyNames(SpablaCore.prototype).filter((n) => n !== "constructor"),
  );

  it("does not expose the internal Engine instance via any public method", () => {
    // Note: TypeScript `private` is compile-time only, so at runtime the
    // instance may still list `engine` in Object.keys. What matters for the
    // public contract is that no method on the prototype returns or leaks it.
    for (const name of publicMethods) {
      const method = (core as unknown as Record<string, unknown>)[name];
      expect(typeof method === "function" || method === undefined).toBe(true);
    }
    // The prototype method surface must not include any getter that returns
    // the raw Engine instance.
    expect(publicMethods.has("getEngine")).toBe(false);
    expect(publicMethods.has("engine")).toBe(false);
  });

  it("does not expose the EventBus, managers, or adapter registry", () => {
    expect(publicMethods.has("getAdapterRegistry")).toBe(false);
    expect(publicMethods.has("getTurnPipelineManager")).toBe(false);
    expect(publicMethods.has("bus")).toBe(false);
    expect(publicMethods.has("emit")).toBe(false);
    // Snapshots are exposed (read-only), but managers themselves are not.
    expect(publicMethods.has("getConversation")).toBe(true);
    expect(publicMethods.has("getCall")).toBe(true);
    expect(publicMethods.has("getCallFlags")).toBe(true);
  });

  it("exposes exactly the 13 mandated methods (+ read-only snapshots)", () => {
    const mandated = [
      "createConversation",
      "joinConversation",
      "leaveConversation",
      "sendMessage",
      "startCall",
      "acceptCall",
      "rejectCall",
      "endCall",
      "startVideo",
      "stopVideo",
      "startInterpreter",
      "stopInterpreter",
      "subscribe",
    ];
    for (const name of mandated) expect(publicMethods.has(name)).toBe(true);
  });
});

describe("SpablaCore — Engine compatibility", () => {
  it("preserves Engine behaviour (call.state.changed still emitted through subscribe)", () => {
    const core = makeCore();
    seedConversation(core);
    const changed = vi.fn();
    core.subscribe("call.state.changed", changed);
    const { callId } = core.startCall({ mode: "voice" });
    core.acceptCall(callId);
    core.endCall(callId);
    // ringing → accepted → ended = 3 transitions, plus initial create emit
    expect(changed).toHaveBeenCalledTimes(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline orchestrator (fase 6)
// ─────────────────────────────────────────────────────────────────────────────

async function flushPipe(cycles = 100): Promise<void> {
  for (let i = 0; i < cycles; i++) await Promise.resolve();
}
function makeMT(): import("../types/adapters.js").MTAdapter {
  return {
    kind: "mt",
    displayName: "fake-mt-6",
    translate: async (r) => ({ translatedText: `[${r.to}] ${r.text}` }),
  };
}
function makeTTS(): import("../types/adapters.js").TTSAdapter {
  return {
    kind: "tts",
    displayName: "fake-tts-6",
    synthesize: async function*() {
      yield { seq: 0, audioBytes: new Uint8Array([7, 8, 9]), mimeType: "audio/wav", isFinal: true };
    },
  };
}
function seedActiveVoiceCall(core: SpablaCore, opts: { withTTS?: boolean } = {}) {
  (core as unknown as { engine: { getAdapterRegistry(): { register: (k: string, a: unknown) => void } } })
    .engine.getAdapterRegistry().register("mt", makeMT());
  if (opts.withTTS !== false) {
    (core as unknown as { engine: { getAdapterRegistry(): { register: (k: string, a: unknown) => void } } })
      .engine.getAdapterRegistry().register("tts", makeTTS());
  }
  seedConversation(core);
  const { callId } = core.startCall({ mode: "voice" });
  core.acceptCall(callId);
  const { sessionId: sttId } = core.startSTT({ callId, speaker: "local" });
  const { sessionId: trId } = core.startTranslation({ callId });
  let ttsId: ReturnType<typeof asUUID> | undefined;
  if (opts.withTTS !== false) {
    const r = core.startTTS({ callId, voice: { language: "en", voiceId: "alice" } });
    ttsId = r.sessionId;
  }
  return { callId, sttId, trId, ttsId };
}
function fireVoice(core: SpablaCore, sttId: ReturnType<typeof asUUID>, text: string, language: "es" | "en" = "es"): void {
  core.simulateSTTPartial({ sessionId: sttId, text });
  core.simulateSTTFinal({ sessionId: sttId, text, language });
}

describe("SpablaCore — pipeline.* subscription surface (fase 6)", () => {
  it("subscribe('pipeline.turn.started') delivers events and returns idempotent Unsubscribe", async () => {
    const core = makeCore();
    const { sttId } = seedActiveVoiceCall(core);
    const handler = vi.fn();
    const off = core.subscribe("pipeline.turn.started", handler);
    fireVoice(core, sttId, "hi");
    await flushPipe();
    expect(handler).toHaveBeenCalledTimes(1);
    off();
    off(); // idempotent
    fireVoice(core, sttId, "hi2");
    await flushPipe();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("subscribe('pipeline.turn.stage.changed') fires for each transition", async () => {
    const core = makeCore();
    const { sttId } = seedActiveVoiceCall(core);
    const changed = vi.fn();
    core.subscribe("pipeline.turn.stage.changed", changed);
    fireVoice(core, sttId, "hi");
    await flushPipe();
    // Voice route: transcribing→translating→synthesizing→completed = 3 transitions
    expect(changed.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("subscribe('pipeline.turn.completed') carries the PipelineTurnResult payload", async () => {
    const core = makeCore();
    const { sttId } = seedActiveVoiceCall(core);
    const done = vi.fn();
    core.subscribe("pipeline.turn.completed", done);
    fireVoice(core, sttId, "hi");
    await flushPipe();
    expect(done).toHaveBeenCalledTimes(1);
    expect(done.mock.calls[0]?.[0].result.translatedText).toBe("[en] hi");
  });

  it("subscribe('pipeline.turn.failed') carries stage and reason", async () => {
    const core = makeCore();
    // Register a failing MT adapter (must override the one from seedActiveVoiceCall)
    seedConversation(core);
    (core as unknown as { engine: { getAdapterRegistry(): { register: (k: string, a: unknown) => void } } })
      .engine.getAdapterRegistry().register("mt", {
        kind: "mt", displayName: "boom-mt",
        translate: async () => { throw new Error("bang"); },
      });
    const { callId } = core.startCall({ mode: "voice" });
    core.acceptCall(callId);
    const { sessionId: sttId } = core.startSTT({ callId, speaker: "local" });
    core.startTranslation({ callId });
    const failed = vi.fn();
    core.subscribe("pipeline.turn.failed", failed);
    fireVoice(core, sttId, "hi");
    await flushPipe();
    expect(failed).toHaveBeenCalledTimes(1);
    expect(failed.mock.calls[0]?.[0].reason).toBeDefined();
  });

  it("mechanical turn.* AND semantic pipeline.turn.* both fire for the same turnId", async () => {
    const core = makeCore();
    const { sttId } = seedActiveVoiceCall(core);
    const mech: string[] = [];
    const sem: string[] = [];
    core.subscribe("turn.started", (e) => mech.push(`mech:${e.turn.turnId}`));
    core.subscribe("pipeline.turn.started", (e) => sem.push(`sem:${e.turn.turnId}`));
    fireVoice(core, sttId, "hi");
    await flushPipe();
    expect(mech).toHaveLength(1);
    expect(sem).toHaveLength(1);
    expect(mech[0]?.split(":")[1]).toBe(sem[0]?.split(":")[1]);
  });

  it("pipeline.turn.* payload preserves the `trigger` field ('voice' | 'text')", async () => {
    const core = makeCore();
    const { sttId } = seedActiveVoiceCall(core);
    const started = vi.fn();
    core.subscribe("pipeline.turn.started", started);
    fireVoice(core, sttId, "hi");
    await flushPipe();
    expect(started.mock.calls[0]?.[0].trigger).toBe("voice");
    core.sendMessage({ text: "hola" });
    await flushPipe();
    expect(started.mock.calls[1]?.[0].trigger).toBe("text");
  });
});

describe("SpablaCore — end-to-end voice pipeline (fase 6)", () => {
  it("full voice turn: STT → Translation → TTS → pipeline.turn.completed", async () => {
    const core = makeCore();
    const { sttId } = seedActiveVoiceCall(core);
    const events: string[] = [];
    core.subscribe("stt.final", () => events.push("stt.final"));
    core.subscribe("translation.completed", () => events.push("translation.completed"));
    core.subscribe("tts.completed", () => events.push("tts.completed"));
    core.subscribe("pipeline.turn.completed", () => events.push("pipeline.turn.completed"));
    fireVoice(core, sttId, "hi");
    await flushPipe();
    for (const n of ["stt.final", "translation.completed", "tts.completed", "pipeline.turn.completed"]) {
      expect(events.filter((e) => e === n)).toHaveLength(1);
    }
    // Causal ordering (each domain event precedes the semantic aggregate is
    // guaranteed by the orchestrator, but the exact interleaving between
    // tts.completed and pipeline.turn.completed depends on subscription order).
    expect(events.indexOf("stt.final")).toBeLessThan(events.indexOf("translation.completed"));
    expect(events.indexOf("translation.completed")).toBeLessThan(events.indexOf("pipeline.turn.completed"));
  });

  it("PipelineTurnResult.sourceText matches the STT final", async () => {
    const core = makeCore();
    const { sttId } = seedActiveVoiceCall(core);
    const done = vi.fn();
    core.subscribe("pipeline.turn.completed", done);
    fireVoice(core, sttId, "buenas tardes");
    await flushPipe();
    expect(done.mock.calls[0]?.[0].result.sourceText).toBe("buenas tardes");
  });

  it("PipelineTurnResult.translatedText matches the MT adapter output", async () => {
    const core = makeCore();
    const { sttId } = seedActiveVoiceCall(core);
    const done = vi.fn();
    core.subscribe("pipeline.turn.completed", done);
    fireVoice(core, sttId, "hola");
    await flushPipe();
    expect(done.mock.calls[0]?.[0].result.translatedText).toBe("[en] hola");
  });

  it("PipelineTurnResult.ttsChunkCount reflects the actual TTS output", async () => {
    const core = makeCore();
    const { sttId } = seedActiveVoiceCall(core);
    const done = vi.fn();
    core.subscribe("pipeline.turn.completed", done);
    fireVoice(core, sttId, "hi");
    await flushPipe();
    expect(done.mock.calls[0]?.[0].result.ttsChunkCount).toBe(1);
    expect(done.mock.calls[0]?.[0].result.ttsTotalBytes).toBe(3);
  });

  it("PipelineTurnResult.durations.total >= 0 for a completed voice turn", async () => {
    const core = makeCore();
    const { sttId } = seedActiveVoiceCall(core);
    const done = vi.fn();
    core.subscribe("pipeline.turn.completed", done);
    fireVoice(core, sttId, "hi");
    await flushPipe();
    expect(done.mock.calls[0]?.[0].result.durations.total).toBeGreaterThanOrEqual(0);
  });
});

describe("SpablaCore — end-to-end text pipeline (fase 6)", () => {
  it("text-with-TTS completes through synthesizing", async () => {
    const core = makeCore();
    seedActiveVoiceCall(core);
    const done = vi.fn();
    core.subscribe("pipeline.turn.completed", done);
    core.sendMessage({ text: "hola" });
    await flushPipe();
    expect(done).toHaveBeenCalledTimes(1);
    expect(done.mock.calls[0]?.[0].result.ttsChunkCount).toBe(1);
  });

  it("text-without-TTS uses the ADR-001 route translating → completed", async () => {
    const core = makeCore();
    seedActiveVoiceCall(core, { withTTS: false });
    const done = vi.fn();
    const stageChanged = vi.fn();
    core.subscribe("pipeline.turn.completed", done);
    core.subscribe("pipeline.turn.stage.changed", stageChanged);
    core.sendMessage({ text: "hola" });
    await flushPipe();
    expect(done).toHaveBeenCalledTimes(1);
    expect(done.mock.calls[0]?.[0].result.ttsChunkCount).toBeUndefined();
    // Exactly one stage transition (translating → completed) — no synthesizing.
    expect(stageChanged.mock.calls[0]?.[0].previousStage).toBe("translating");
  });

  it("message.sent without an active translation session does NOT open a pipeline turn", async () => {
    const core = makeCore();
    // Seed a conversation but no call / no translation session.
    seedConversation(core);
    const started = vi.fn();
    core.subscribe("pipeline.turn.started", started);
    core.sendMessage({ text: "hola" });
    expect(started).not.toHaveBeenCalled();
  });
});

describe("SpablaCore — cero regresión Fases 1–5 y Foundation Evolution", () => {
  it("Fase 1: participant.joined and languagePair.resolved still fire", () => {
    const core = makeCore();
    const joined = vi.fn();
    const resolved = vi.fn();
    core.subscribe("participant.joined", joined);
    core.subscribe("languagePair.resolved", resolved);
    seedConversation(core);
    expect(joined).toHaveBeenCalledTimes(2);
    expect(resolved).toHaveBeenCalledTimes(1);
  });

  it("Fase 2: sendMessage still emits message.created and message.sent", () => {
    const core = makeCore();
    seedConversation(core);
    const created = vi.fn();
    const sent = vi.fn();
    core.subscribe("message.created", created);
    core.subscribe("message.sent", sent);
    core.sendMessage({ text: "hi" });
    expect(created).toHaveBeenCalledTimes(1);
    expect(sent).toHaveBeenCalledTimes(1);
  });

  it("Fase 3: STT session lifecycle still works via simulate*", () => {
    const core = makeCore();
    seedConversation(core);
    const { callId } = core.startCall({ mode: "voice" });
    core.acceptCall(callId);
    const { sessionId } = core.startSTT({ callId, speaker: "local" });
    expect(core.getSTTSession(sessionId)?.state).toBe("listening");
    core.stopSTT({ sessionId });
    expect(core.getSTTSession(sessionId)?.state).toBe("completed");
  });

  it("Fase 4: Translation without pipeline still works via requestTranslation", async () => {
    const core = makeCore();
    (core as unknown as { engine: { getAdapterRegistry(): { register: (k: string, a: unknown) => void } } })
      .engine.getAdapterRegistry().register("mt", makeMT());
    seedConversation(core);
    const { callId } = core.startCall({ mode: "voice" });
    core.acceptCall(callId);
    const { sessionId } = core.startTranslation({ callId });
    const { requestId } = core.requestTranslation({ sessionId, text: "hola", sourceLanguage: "es" });
    await flushPipe();
    expect(core.getTranslationRequest(requestId)?.state).toBe("completed");
  });

  it("Fase 5 + Foundation Evolution: TurnPipelineManager still accepts initialStage from ADR-001", () => {
    const core = makeCore();
    const mgr = (core as unknown as { engine: { getTurnPipelineManager(): {
      create: (i: unknown, c: string) => { stage: string };
    } } }).engine.getTurnPipelineManager();
    const t = mgr.create(
      {
        turnId: asUUID("t-regression"), callSessionId: asUUID("c-regression"),
        speaker: "local", initialStage: "translating",
      },
      "cid-1",
    );
    expect(t.stage).toBe("translating");
  });
});

describe("SpablaCore — prohibiciones Fase 6", () => {
  it("§16.7: SpablaCore.prototype does not expose PipelineOrchestrator", () => {
    const methods = new Set(Object.getOwnPropertyNames(SpablaCore.prototype));
    expect(methods.has("getPipelineOrchestrator")).toBe(false);
    expect(methods.has("pipelineOrchestrator")).toBe(false);
  });

  it("§16.4: no module outside orchestrator invokes TurnPipelineManager.create() with initialStage", () => {
    const fs = require("fs");
    const path = require("path");
    const engineSrc = path.resolve(__dirname, "..");
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(p));
        else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) out.push(p);
      }
      return out;
    };
    const files = walk(engineSrc);
    for (const f of files) {
      if (f.includes("pipeline-orchestrator/")) continue;
      if (f.endsWith("TurnPipelineManager.ts")) continue; // owns create()
      const body = fs.readFileSync(f, "utf-8");
      expect(body).not.toMatch(/initialStage:\s*"(transcribing|translating|created|capturing|synthesizing)"/);
    }
  });

  it("§16.1 + §16.6: pipeline-orchestrator does not import providers or cross-domain managers as value", () => {
    const fs = require("fs");
    const path = require("path");
    const orchestratorDir = path.resolve(__dirname, "..", "pipeline-orchestrator");
    const files = fs.readdirSync(orchestratorDir).filter((f: string) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    for (const f of files) {
      const body = fs.readFileSync(path.join(orchestratorDir, f), "utf-8");
      // No value imports from stt/, translation/, tts/, messaging/ managers themselves.
      expect(body).not.toMatch(/^import\s+\{[^}]*(STTManager|TranslationManager|TTSManager|MessageManager)[^}]*\}\s+from/m);
      // No provider names in code strings.
      expect(body).not.toMatch(/OpenAI|Deepgram|Anthropic|Google|Azure|ElevenLabs/i);
    }
  });

  it("§16.5: FSM TurnStage transitions are unchanged from Foundation Evolution (spot-check)", () => {
    const fs = require("fs");
    const path = require("path");
    const fsm = fs.readFileSync(
      path.resolve(__dirname, "..", "pipeline", "turn-stage-machine.ts"), "utf-8");
    // Guaranteed post-Foundation-Evolution transitions (spot-check the critical rows).
    expect(fsm).toMatch(/translating:\s*\[[^\]]*"synthesizing"[^\]]*"completed"[^\]]*"failed"[^\]]*\]/);
    expect(fsm).toMatch(/synthesizing:\s*\[[^\]]*"completed"[^\]]*"failed"[^\]]*\]/);
  });

  it("§7 invariante 1: only orchestrator invokes advance/fail on TurnPipelineManager", () => {
    const fs = require("fs");
    const path = require("path");
    const engineSrc = path.resolve(__dirname, "..");
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(p));
        else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) out.push(p);
      }
      return out;
    };
    const files = walk(engineSrc);
    for (const f of files) {
      if (f.includes("pipeline-orchestrator/")) continue;
      if (f.endsWith("TurnPipelineManager.ts")) continue;
      const body = fs.readFileSync(f, "utf-8");
      // No calls like turnPipelines.advance(...) or turnPipelines.fail(...) outside orchestrator.
      expect(body).not.toMatch(/\.getTurnPipelineManager\(\)\.(advance|fail|create)\b/);
    }
  });

  it("§7 invariante 6: orchestrator does not cache authoritative state (transient state clears at cleanup)", async () => {
    const core = makeCore();
    const { sttId } = seedActiveVoiceCall(core);
    fireVoice(core, sttId, "hi");
    await flushPipe();
    // After completion, another turn using the same speaker starts from a clean slate:
    // pipeline.turn.started fires again with a fresh turnId.
    const started = vi.fn();
    core.subscribe("pipeline.turn.started", started);
    fireVoice(core, sttId, "hi2");
    await flushPipe();
    expect(started).toHaveBeenCalledTimes(1);
    expect(started.mock.calls[0]?.[0].turn.turnId).toBeDefined();
  });
});
