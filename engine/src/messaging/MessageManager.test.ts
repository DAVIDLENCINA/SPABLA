import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../event-bus/EventBus.js";
import { MessageManager, MessageManagerError } from "./MessageManager.js";
import { InvalidTransitionError } from "../state-machine/StateMachine.js";
import { asCorrelationId, asISOTimestamp, asUUID, type Clock } from "../types/ids.js";

function clock(): Clock {
  let n = 1_700_000_000_000;
  return {
    nowISO: () => asISOTimestamp(new Date(n++).toISOString()),
    nowMs: () => n,
  };
}

const CID = asCorrelationId("test-corr");
const CONV = asUUID("conv-1");
const M1 = asUUID("m-1");

function baseOutgoing() {
  return {
    messageId: M1,
    conversationId: CONV,
    senderId: asUUID("u-local"),
    text: "hello",
    language: "es" as const,
  };
}

function baseIncoming() {
  return {
    messageId: M1,
    conversationId: CONV,
    senderId: asUUID("u-remote"),
    text: "hola",
    language: "en" as const,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// createOutgoing (6 tests)
// ─────────────────────────────────────────────────────────────────────────────
describe("MessageManager — createOutgoing", () => {
  it("creates a Message with status 'created' and direction 'outgoing'", () => {
    const mgr = new MessageManager(new EventBus(), clock());
    const m = mgr.createOutgoing(baseOutgoing(), CID);
    expect(m.status).toBe("created");
    expect(m.direction).toBe("outgoing");
    expect(m.createdAt).toBeDefined();
    expect(m.sentAt).toBeUndefined();
    expect(m.threadId).toBe(CONV);
  });

  it("rejects duplicate messageId", () => {
    const mgr = new MessageManager(new EventBus(), clock());
    mgr.createOutgoing(baseOutgoing(), CID);
    expect(() => mgr.createOutgoing(baseOutgoing(), CID)).toThrow(MessageManagerError);
  });

  it("carries conversationId, senderId and text verbatim", () => {
    const mgr = new MessageManager(new EventBus(), clock());
    const m = mgr.createOutgoing(baseOutgoing(), CID);
    expect(m.conversationId).toBe(CONV);
    expect(m.senderId).toBe("u-local");
    expect(m.text).toBe("hello");
    expect(m.language).toBe("es");
  });

  it("returns a frozen snapshot", () => {
    const mgr = new MessageManager(new EventBus(), clock());
    const m = mgr.createOutgoing(baseOutgoing(), CID);
    expect(Object.isFrozen(m)).toBe(true);
  });

  it("emits message.created (not message.sent) with the snapshot", () => {
    const bus = new EventBus();
    const mgr = new MessageManager(bus, clock());
    const created = vi.fn();
    const sent = vi.fn();
    bus.on("message.created", created);
    bus.on("message.sent", sent);
    mgr.createOutgoing(baseOutgoing(), CID);
    expect(created).toHaveBeenCalledTimes(1);
    expect(sent).not.toHaveBeenCalled();
    expect(created.mock.calls[0]?.[0].message.status).toBe("created");
  });

  it("makes the message retrievable via get(id)", () => {
    const mgr = new MessageManager(new EventBus(), clock());
    const m = mgr.createOutgoing(baseOutgoing(), CID);
    expect(mgr.get(M1)).toEqual(m);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createIncoming (4 tests)
// ─────────────────────────────────────────────────────────────────────────────
describe("MessageManager — createIncoming", () => {
  it("creates with default status 'sent' and direction 'incoming'", () => {
    const mgr = new MessageManager(new EventBus(), clock());
    const m = mgr.createIncoming(baseIncoming(), CID);
    expect(m.status).toBe("sent");
    expect(m.direction).toBe("incoming");
    expect(m.sentAt).toBeDefined();
  });

  it("accepts initial status 'delivered' and emits BOTH sent + delivered", () => {
    const bus = new EventBus();
    const mgr = new MessageManager(bus, clock());
    const sent = vi.fn();
    const delivered = vi.fn();
    bus.on("message.sent", sent);
    bus.on("message.delivered", delivered);
    const m = mgr.createIncoming({ ...baseIncoming(), initialStatus: "delivered" }, CID);
    expect(m.status).toBe("delivered");
    expect(m.deliveredAt).toBeDefined();
    expect(sent).toHaveBeenCalledTimes(1);
    expect(delivered).toHaveBeenCalledTimes(1);
    expect(delivered.mock.calls[0]?.[0].previousStatus).toBe("sent");
  });

  it("emits message.sent (not message.created) for incoming", () => {
    const bus = new EventBus();
    const mgr = new MessageManager(bus, clock());
    const created = vi.fn();
    const sent = vi.fn();
    bus.on("message.created", created);
    bus.on("message.sent", sent);
    mgr.createIncoming(baseIncoming(), CID);
    expect(created).not.toHaveBeenCalled();
    expect(sent).toHaveBeenCalledTimes(1);
  });

  it("rejects duplicate messageId across directions", () => {
    const mgr = new MessageManager(new EventBus(), clock());
    mgr.createIncoming(baseIncoming(), CID);
    expect(() => mgr.createOutgoing({ ...baseOutgoing(), messageId: M1 }, CID)).toThrow(
      MessageManagerError,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Status transitions (7 tests)
// ─────────────────────────────────────────────────────────────────────────────
describe("MessageManager — transitions", () => {
  it("outgoing walks created → sent → delivered → read (happy path)", () => {
    const bus = new EventBus();
    const mgr = new MessageManager(bus, clock());
    mgr.createOutgoing(baseOutgoing(), CID);
    mgr.advance(M1, "sent", CID);
    expect(mgr.get(M1)?.status).toBe("sent");
    expect(mgr.get(M1)?.sentAt).toBeDefined();
    mgr.advance(M1, "delivered", CID);
    expect(mgr.get(M1)?.status).toBe("delivered");
    expect(mgr.get(M1)?.deliveredAt).toBeDefined();
    mgr.advance(M1, "read", CID);
    expect(mgr.get(M1)?.status).toBe("read");
    expect(mgr.get(M1)?.readAt).toBeDefined();
  });

  it("outgoing can skip delivered (sent → read)", () => {
    const mgr = new MessageManager(new EventBus(), clock());
    mgr.createOutgoing(baseOutgoing(), CID);
    mgr.advance(M1, "sent", CID);
    mgr.advance(M1, "read", CID);
    expect(mgr.get(M1)?.status).toBe("read");
    expect(mgr.get(M1)?.deliveredAt).toBeUndefined();
  });

  it("rejects a backwards transition (delivered → sent)", () => {
    const mgr = new MessageManager(new EventBus(), clock());
    mgr.createOutgoing(baseOutgoing(), CID);
    mgr.advance(M1, "sent", CID);
    mgr.advance(M1, "delivered", CID);
    expect(() => mgr.advance(M1, "sent", CID)).toThrow(InvalidTransitionError);
  });

  it("cannot leave a terminal state (read → anything)", () => {
    const mgr = new MessageManager(new EventBus(), clock());
    mgr.createOutgoing(baseOutgoing(), CID);
    mgr.advance(M1, "sent", CID);
    mgr.advance(M1, "read", CID);
    expect(() => mgr.advance(M1, "delivered", CID)).toThrow(InvalidTransitionError);
  });

  it("fail() from any non-terminal records failedStage + reason", () => {
    const mgr = new MessageManager(new EventBus(), clock());
    mgr.createOutgoing(baseOutgoing(), CID);
    mgr.advance(M1, "sent", CID);
    const m = mgr.fail(M1, "network-down", CID);
    expect(m.status).toBe("failed");
    expect(m.failedStage).toBe("sent");
    expect(m.failureReason).toBe("network-down");
    expect(m.failedAt).toBeDefined();
  });

  it("fail() rejected on already-terminal messages", () => {
    const mgr = new MessageManager(new EventBus(), clock());
    mgr.createOutgoing(baseOutgoing(), CID);
    mgr.advance(M1, "sent", CID);
    mgr.advance(M1, "read", CID);
    expect(() => mgr.fail(M1, "reason", CID)).toThrow(MessageManagerError);
  });

  it("emits the correct event for each transition", () => {
    const bus = new EventBus();
    const mgr = new MessageManager(bus, clock());
    const sent = vi.fn();
    const delivered = vi.fn();
    const read = vi.fn();
    const failed = vi.fn();
    bus.on("message.sent", sent);
    bus.on("message.delivered", delivered);
    bus.on("message.read", read);
    bus.on("message.failed", failed);
    mgr.createOutgoing(baseOutgoing(), CID);
    mgr.advance(M1, "sent", CID);
    mgr.advance(M1, "delivered", CID);
    mgr.advance(M1, "read", CID);
    expect(sent).toHaveBeenCalledTimes(1);
    expect(delivered).toHaveBeenCalledTimes(1);
    expect(delivered.mock.calls[0]?.[0].previousStatus).toBe("sent");
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0]?.[0].previousStatus).toBe("delivered");
    expect(failed).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Queries (4 tests)
// ─────────────────────────────────────────────────────────────────────────────
describe("MessageManager — queries", () => {
  it("list() returns chronological order", () => {
    const mgr = new MessageManager(new EventBus(), clock());
    mgr.createOutgoing({ ...baseOutgoing(), messageId: asUUID("m-1") }, CID);
    mgr.createIncoming({ ...baseIncoming(), messageId: asUUID("m-2") }, CID);
    mgr.createOutgoing({ ...baseOutgoing(), messageId: asUUID("m-3") }, CID);
    expect(mgr.list().map((m) => m.id)).toEqual(["m-1", "m-2", "m-3"]);
  });

  it("listByDirection filters correctly", () => {
    const mgr = new MessageManager(new EventBus(), clock());
    mgr.createOutgoing({ ...baseOutgoing(), messageId: asUUID("m-out") }, CID);
    mgr.createIncoming({ ...baseIncoming(), messageId: asUUID("m-in") }, CID);
    expect(mgr.listByDirection("outgoing").map((m) => m.id)).toEqual(["m-out"]);
    expect(mgr.listByDirection("incoming").map((m) => m.id)).toEqual(["m-in"]);
  });

  it("getThread returns MessageThread with messageIds aligned to list()", () => {
    const mgr = new MessageManager(new EventBus(), clock());
    const participants = [asUUID("u-local"), asUUID("u-remote")];
    expect(mgr.getThread(participants)).toBeUndefined();
    mgr.createOutgoing({ ...baseOutgoing(), messageId: asUUID("m-1") }, CID);
    mgr.createIncoming({ ...baseIncoming(), messageId: asUUID("m-2") }, CID);
    const thread = mgr.getThread(participants);
    expect(thread?.id).toBe(CONV);
    expect(thread?.conversationId).toBe(CONV);
    expect(thread?.messageIds).toEqual(["m-1", "m-2"]);
    expect(thread?.participants).toEqual(participants);
  });

  it("get() returns undefined for an unknown messageId", () => {
    const mgr = new MessageManager(new EventBus(), clock());
    expect(mgr.get(asUUID("nope"))).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Freeze / immutability (4 tests)
// ─────────────────────────────────────────────────────────────────────────────
describe("MessageManager — immutability", () => {
  it("MessageThread is frozen (participants + messageIds arrays)", () => {
    const mgr = new MessageManager(new EventBus(), clock());
    mgr.createOutgoing(baseOutgoing(), CID);
    const thread = mgr.getThread([asUUID("u-local")]);
    expect(Object.isFrozen(thread)).toBe(true);
    expect(Object.isFrozen(thread!.participants)).toBe(true);
    expect(Object.isFrozen(thread!.messageIds)).toBe(true);
  });

  it("each transition returns a NEW frozen reference", () => {
    const mgr = new MessageManager(new EventBus(), clock());
    const before = mgr.createOutgoing(baseOutgoing(), CID);
    const after = mgr.advance(M1, "sent", CID);
    expect(after).not.toBe(before);
    expect(Object.isFrozen(after)).toBe(true);
  });

  it("Message snapshots are frozen at every stage", () => {
    const mgr = new MessageManager(new EventBus(), clock());
    mgr.createOutgoing(baseOutgoing(), CID);
    expect(Object.isFrozen(mgr.get(M1))).toBe(true);
    mgr.advance(M1, "sent", CID);
    expect(Object.isFrozen(mgr.get(M1))).toBe(true);
    mgr.fail(M1, "err", CID);
    expect(Object.isFrozen(mgr.get(M1))).toBe(true);
  });

  it("list() is a frozen array — cannot be mutated by consumers", () => {
    const mgr = new MessageManager(new EventBus(), clock());
    mgr.createOutgoing(baseOutgoing(), CID);
    const arr = mgr.list();
    expect(Object.isFrozen(arr)).toBe(true);
  });
});
