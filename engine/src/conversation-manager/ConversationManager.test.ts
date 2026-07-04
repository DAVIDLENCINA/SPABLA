import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventBus } from "../event-bus/EventBus.js";
import { ParticipantManager } from "../participant-manager/ParticipantManager.js";
import { LanguageManager } from "../language-manager/LanguageManager.js";
import {
  ConversationManager,
  ConversationInvariantError,
} from "./ConversationManager.js";
import { asCorrelationId, asISOTimestamp, asUUID, type Clock } from "../types/ids.js";

function clock(): Clock {
  return {
    nowISO: () => asISOTimestamp(new Date(1_700_000_000_000).toISOString()),
    nowMs: () => 1_700_000_000_000,
  };
}

const CID = asCorrelationId("test-corr");
const CONV_ID = asUUID("conv-1");

function setup() {
  const bus = new EventBus();
  const ck = clock();
  const participants = new ParticipantManager(bus, ck);
  const languages = new LanguageManager(bus, ck);
  const conversation = new ConversationManager(bus, ck, participants, languages);
  return { bus, participants, languages, conversation };
}

describe("ConversationManager — load", () => {
  it("emits conversation.loaded with the current snapshot", () => {
    const { bus, participants, conversation } = setup();
    participants.add(
      { userId: asUUID("u-1"), displayName: "Ana", language: "es", role: "local" },
      CID,
    );
    const handler = vi.fn();
    bus.on("conversation.loaded", handler);
    const snap = conversation.load(CONV_ID, CID);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(snap.id).toBe(CONV_ID);
    expect(snap.localParticipant.userId).toBe("u-1");
    expect(snap.remoteParticipant).toBeUndefined();
    expect(snap.languagePair).toBeUndefined();
  });

  it("requires a local participant before load", () => {
    const { conversation } = setup();
    expect(() => conversation.load(CONV_ID, CID)).toThrow(ConversationInvariantError);
  });

  it("cannot be loaded twice", () => {
    const { participants, conversation } = setup();
    participants.add(
      { userId: asUUID("u-1"), displayName: "Ana", language: "es", role: "local" },
      CID,
    );
    conversation.load(CONV_ID, CID);
    expect(() => conversation.load(CONV_ID, CID)).toThrow(ConversationInvariantError);
  });

  it("includes remote and pair when both are known before snapshot", () => {
    const { participants, languages, conversation } = setup();
    participants.add(
      { userId: asUUID("u-1"), displayName: "Ana", language: "es", role: "local" },
      CID,
    );
    participants.add(
      { userId: asUUID("u-2"), displayName: "Bea", language: "en", role: "remote" },
      CID,
    );
    languages.recompute(participants.list(), CID);
    const snap = conversation.load(CONV_ID, CID);
    expect(snap.remoteParticipant?.userId).toBe("u-2");
    expect(snap.languagePair?.from).toBe("es");
    expect(snap.languagePair?.to).toBe("en");
  });
});

describe("ConversationManager — call session registry", () => {
  let conversation: ConversationManager;
  let participants: ParticipantManager;

  beforeEach(() => {
    const s = setup();
    conversation = s.conversation;
    participants = s.participants;
    participants.add(
      { userId: asUUID("u-1"), displayName: "Ana", language: "es", role: "local" },
      CID,
    );
    conversation.load(CONV_ID, CID);
  });

  it("registers a call session id in history", () => {
    conversation.registerCallSessionId(asUUID("call-1"));
    conversation.registerCallSessionId(asUUID("call-2"));
    expect(conversation.snapshot()?.createdCallSessions).toEqual(["call-1", "call-2"]);
  });

  it("registering the same id twice is a no-op", () => {
    conversation.registerCallSessionId(asUUID("call-1"));
    conversation.registerCallSessionId(asUUID("call-1"));
    expect(conversation.snapshot()?.createdCallSessions).toEqual(["call-1"]);
  });

  it("throws when registering before load()", () => {
    const fresh = setup();
    expect(() => fresh.conversation.registerCallSessionId(asUUID("x"))).toThrow(
      ConversationInvariantError,
    );
  });
});

describe("ConversationManager — snapshot()", () => {
  it("returns undefined before load()", () => {
    const { conversation } = setup();
    expect(conversation.snapshot()).toBeUndefined();
  });

  it("returns a frozen snapshot after load()", () => {
    const { participants, conversation } = setup();
    participants.add(
      { userId: asUUID("u-1"), displayName: "Ana", language: "es", role: "local" },
      CID,
    );
    const snap = conversation.load(CONV_ID, CID);
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.participants)).toBe(true);
    expect(Object.isFrozen(snap.createdCallSessions)).toBe(true);
  });

  it("reflects language changes on subsequent snapshots", () => {
    const { participants, languages, conversation } = setup();
    participants.add(
      { userId: asUUID("u-1"), displayName: "Ana", language: "es", role: "local" },
      CID,
    );
    conversation.load(CONV_ID, CID);
    expect(conversation.snapshot()?.languagePair).toBeUndefined();
    participants.add(
      { userId: asUUID("u-2"), displayName: "Bea", language: "en", role: "remote" },
      CID,
    );
    languages.recompute(participants.list(), CID);
    expect(conversation.snapshot()?.languagePair?.to).toBe("en");
  });
});
