/**
 * SPABLA · UX-01 · Prototype state parser.
 *
 * The 17 states demanded by §FASE 12 collapse into a small tuple of
 * URL parameters. This module is pure so the tests can drive it
 * directly without React.
 *
 * URL query params (all optional):
 *   ?view=chat|translator                         (default: chat)
 *   ?call=none|voice|voice-ended|video|video-ended|video-min
 *   ?subs=on|off                                  (video subtitle track)
 *   ?original=hidden|visible                      (message-level toggle)
 *   ?device=desktop|tablet|mobile                 (viewport hint used by
 *                                                  capture harness; the
 *                                                  layout responds via CSS)
 *   ?turn=self|other                              (translator active turn)
 *   ?swap=1                                       (translator lang swap)
 */

export type ViewMode = "chat" | "translator";
export type CallMode =
  | "none"
  | "voice"
  | "voice-ended"
  | "video"
  | "video-ended"
  | "video-min";
export type SubsMode = "on" | "off";
export type OriginalMode = "hidden" | "visible";
export type DeviceHint = "desktop" | "tablet" | "mobile";
export type TranslatorTurn = "self" | "other";

export type PrototypeState = {
  readonly view: ViewMode;
  readonly call: CallMode;
  readonly subs: SubsMode;
  readonly original: OriginalMode;
  readonly device: DeviceHint;
  readonly translatorTurn: TranslatorTurn;
  readonly swapped: boolean;
};

export const DEFAULT_STATE: PrototypeState = {
  view: "chat",
  call: "none",
  subs: "on",
  original: "hidden",
  device: "desktop",
  translatorTurn: "self",
  swapped: false,
};

function pick<T extends string>(raw: string | undefined | null, allowed: readonly T[], fallback: T): T {
  return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

export function parsePrototypeState(sp: URLSearchParams | Record<string, string | undefined>): PrototypeState {
  const get = (k: string): string | undefined => {
    if (typeof (sp as URLSearchParams).get === "function") {
      const v = (sp as URLSearchParams).get(k);
      return v === null ? undefined : v;
    }
    const rec = sp as Record<string, string | undefined>;
    return rec[k];
  };
  return {
    view: pick(get("view"), ["chat", "translator"] as const, "chat"),
    call: pick(
      get("call"),
      ["none", "voice", "voice-ended", "video", "video-ended", "video-min"] as const,
      "none",
    ),
    subs: pick(get("subs"), ["on", "off"] as const, "on"),
    original: pick(get("original"), ["hidden", "visible"] as const, "hidden"),
    device: pick(get("device"), ["desktop", "tablet", "mobile"] as const, "desktop"),
    translatorTurn: pick(get("turn"), ["self", "other"] as const, "self"),
    swapped: get("swap") === "1",
  };
}
