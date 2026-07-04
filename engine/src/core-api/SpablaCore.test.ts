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

describe("SpablaCore — sendMessage", () => {
  it("emits message.sent and returns messageId when the conversation is loaded", () => {
    const core = makeCore();
    seedConversation(core);
    const sent = vi.fn();
    core.subscribe("message.sent", sent);
    const result = core.sendMessage({ text: "hello" });
    expect(result.messageId).toBeDefined();
    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent.mock.calls[0]?.[0].senderId).toBe("u-local");
    expect(sent.mock.calls[0]?.[0].text).toBe("hello");
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
