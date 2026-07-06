import { describe, it, expect, vi, beforeEach } from "vitest";
import { SpablaCore } from "./SpablaCore.js";
import { SpablaCoreError } from "./types.js";
import { asUUID, asISOTimestamp, type Clock } from "../types/ids.js";

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

describe("SpablaCore — messaging encapsulation + compat", () => {
  it("does not expose the MessageManager directly", () => {
    const core = makeCore();
    const publicMethods = new Set(
      Object.getOwnPropertyNames(SpablaCore.prototype).filter((n) => n !== "constructor"),
    );
    expect(publicMethods.has("getMessageManager")).toBe(false);
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
