import { describe, it, expect } from "vitest";
import { AdapterRegistry, AdapterRegistryError } from "./AdapterRegistry.js";
import { ADAPTER_KINDS, isAdapterKind } from "../types/adapters.js";
import type {
  STTAdapter,
  MTAdapter,
  TTSAdapter,
  WebRTCAdapter,
  SignalingAdapter,
  SupabaseAdapter,
} from "../types/adapters.js";

const stt: STTAdapter = { kind: "stt", displayName: "fake-stt" };
const mt: MTAdapter = { kind: "mt", displayName: "fake-mt" };
const tts: TTSAdapter = { kind: "tts", displayName: "fake-tts" };
const webrtc: WebRTCAdapter = { kind: "webrtc", displayName: "fake-webrtc" };
const signaling: SignalingAdapter = { kind: "signaling", displayName: "fake-signaling" };
const supabase: SupabaseAdapter = { kind: "supabase", displayName: "fake-supabase" };

describe("AdapterRegistry — register + get + has", () => {
  it("stores and retrieves each of the six kinds", () => {
    const reg = new AdapterRegistry();
    reg.register("stt", stt);
    reg.register("mt", mt);
    reg.register("tts", tts);
    reg.register("webrtc", webrtc);
    reg.register("signaling", signaling);
    reg.register("supabase", supabase);
    expect(reg.get("stt")).toBe(stt);
    expect(reg.get("mt")).toBe(mt);
    expect(reg.get("tts")).toBe(tts);
    expect(reg.get("webrtc")).toBe(webrtc);
    expect(reg.get("signaling")).toBe(signaling);
    expect(reg.get("supabase")).toBe(supabase);
  });

  it("has() returns true only when a kind is registered", () => {
    const reg = new AdapterRegistry();
    expect(reg.has("stt")).toBe(false);
    reg.register("stt", stt);
    expect(reg.has("stt")).toBe(true);
    expect(reg.has("mt")).toBe(false);
  });

  it("get() returns undefined for an unregistered kind", () => {
    const reg = new AdapterRegistry();
    expect(reg.get("stt")).toBeUndefined();
  });
});

describe("AdapterRegistry — validation", () => {
  it("rejects unknown kinds at register()", () => {
    const reg = new AdapterRegistry();
    expect(() =>
      reg.register("xxx" as never, { kind: "xxx", displayName: "n/a" } as never),
    ).toThrow(AdapterRegistryError);
  });

  it("rejects impl whose 'kind' does not match the slot", () => {
    const reg = new AdapterRegistry();
    expect(() => reg.register("stt", mt as unknown as STTAdapter)).toThrow(AdapterRegistryError);
  });

  it("rejects impl that is null / not an object", () => {
    const reg = new AdapterRegistry();
    expect(() => reg.register("stt", null as unknown as STTAdapter)).toThrow(AdapterRegistryError);
    expect(() => reg.register("stt", "hello" as unknown as STTAdapter)).toThrow(AdapterRegistryError);
  });

  it("rejects double-register of a different impl for the same kind", () => {
    const reg = new AdapterRegistry();
    reg.register("stt", stt);
    const other: STTAdapter = { kind: "stt", displayName: "other-stt" };
    expect(() => reg.register("stt", other)).toThrow(AdapterRegistryError);
  });

  it("is idempotent when re-registering the SAME instance", () => {
    const reg = new AdapterRegistry();
    reg.register("stt", stt);
    expect(() => reg.register("stt", stt)).not.toThrow();
    expect(reg.get("stt")).toBe(stt);
  });
});

describe("AdapterRegistry — unregister", () => {
  it("removes an existing registration and returns true", () => {
    const reg = new AdapterRegistry();
    reg.register("stt", stt);
    expect(reg.unregister("stt")).toBe(true);
    expect(reg.has("stt")).toBe(false);
    expect(reg.get("stt")).toBeUndefined();
  });

  it("returns false when nothing was registered", () => {
    const reg = new AdapterRegistry();
    expect(reg.unregister("mt")).toBe(false);
  });

  it("allows re-register after unregister", () => {
    const reg = new AdapterRegistry();
    reg.register("stt", stt);
    reg.unregister("stt");
    const replacement: STTAdapter = { kind: "stt", displayName: "replacement" };
    reg.register("stt", replacement);
    expect(reg.get("stt")).toBe(replacement);
  });

  it("returns false for unknown kinds without throwing", () => {
    const reg = new AdapterRegistry();
    expect(reg.unregister("xxx" as never)).toBe(false);
  });
});

describe("AdapterRegistry — introspection", () => {
  it("registeredKinds() lists currently-populated slots", () => {
    const reg = new AdapterRegistry();
    expect(reg.registeredKinds()).toEqual([]);
    reg.register("stt", stt);
    reg.register("mt", mt);
    expect(reg.registeredKinds().sort()).toEqual(["mt", "stt"]);
  });

  it("ADAPTER_KINDS exports all six documented kinds", () => {
    expect([...ADAPTER_KINDS].sort()).toEqual([
      "mt",
      "signaling",
      "stt",
      "supabase",
      "tts",
      "webrtc",
    ]);
  });

  it("isAdapterKind narrows correctly", () => {
    expect(isAdapterKind("stt")).toBe(true);
    expect(isAdapterKind("xxx")).toBe(false);
    expect(isAdapterKind(42)).toBe(false);
    expect(isAdapterKind(null)).toBe(false);
  });
});
