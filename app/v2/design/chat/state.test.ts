/**
 * SPABLA · UX-01 · Prototype state parser tests.
 *
 * Pure unit tests — the parser has no React or DOM deps so it can
 * run under the node environment of the client vitest project.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_STATE, parsePrototypeState } from "./state";

describe("UX-01 · parsePrototypeState", () => {
  it("returns defaults on empty input", () => {
    expect(parsePrototypeState(new URLSearchParams())).toEqual(DEFAULT_STATE);
    expect(parsePrototypeState({})).toEqual(DEFAULT_STATE);
  });

  it("maps every documented URL to its state shape", () => {
    expect(parsePrototypeState({ view: "translator", turn: "other", swap: "1" })).toMatchObject({
      view: "translator",
      translatorTurn: "other",
      swapped: true,
    });
    expect(parsePrototypeState({ call: "voice" }).call).toBe("voice");
    expect(parsePrototypeState({ call: "voice-ended" }).call).toBe("voice-ended");
    expect(parsePrototypeState({ call: "video" }).call).toBe("video");
    expect(parsePrototypeState({ call: "video-ended" }).call).toBe("video-ended");
    expect(parsePrototypeState({ call: "video-min" }).call).toBe("video-min");
    expect(parsePrototypeState({ subs: "off" }).subs).toBe("off");
    expect(parsePrototypeState({ original: "visible" }).original).toBe("visible");
    expect(parsePrototypeState({ device: "mobile" }).device).toBe("mobile");
    expect(parsePrototypeState({ device: "tablet" }).device).toBe("tablet");
  });

  it("falls back to defaults for unknown values", () => {
    expect(parsePrototypeState({ view: "hacker" }).view).toBe("chat");
    expect(parsePrototypeState({ call: "cosmic" }).call).toBe("none");
    expect(parsePrototypeState({ subs: "sometimes" }).subs).toBe("on");
    expect(parsePrototypeState({ device: "smartwatch" }).device).toBe("desktop");
    expect(parsePrototypeState({ turn: "audience" }).translatorTurn).toBe("self");
    expect(parsePrototypeState({ swap: "true" }).swapped).toBe(false);
  });

  it("accepts URLSearchParams and plain records interchangeably", () => {
    const sp = new URLSearchParams({ call: "video", subs: "off", device: "mobile" });
    const rec = { call: "video", subs: "off", device: "mobile" } as Record<string, string>;
    expect(parsePrototypeState(sp)).toEqual(parsePrototypeState(rec));
  });
});
