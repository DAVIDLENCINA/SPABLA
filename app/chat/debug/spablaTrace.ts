"use client";

// SPABLA V1 · Diagnostic tracer — audit/v1-debug branch only.
// Instrumentation-only. Never gates or alters behaviour.
// Emit format: single-line JSON prefixed with [SPABLA_TRACE] for grep/filter.

let sessionCallId: string | null = null;
let sessionRoomId: string | null = null;
let sessionUserId: string | null = null;

export function setTraceContext(ctx: {
  callId?: string | null;
  roomId?: string | null;
  userId?: string | null;
}) {
  if (ctx.callId !== undefined) sessionCallId = ctx.callId;
  if (ctx.roomId !== undefined) sessionRoomId = ctx.roomId;
  if (ctx.userId !== undefined) sessionUserId = ctx.userId;
}

let envDetected = false;
let browser = "unknown";
let platform = "unknown";

function detectEnv() {
  if (envDetected || typeof navigator === "undefined") return;
  envDetected = true;
  const ua = navigator.userAgent || "";
  // Platform detection — iOS before other Apple variants (iPad on iPadOS reports Mac UA sometimes).
  if (/iPhone|iPad|iPod/i.test(ua)) platform = "iOS";
  else if ((navigator as any).userAgentData?.platform === "iOS") platform = "iOS";
  else if (/Android/i.test(ua)) platform = "Android";
  else if (/Mac/i.test(ua)) platform = "macOS";
  else if (/Win/i.test(ua)) platform = "Windows";
  else if (/Linux/i.test(ua)) platform = "Linux";
  // Browser detection — order matters: Edge/Opera before Chrome; Safari after Chrome (iOS UA is Chrome-like).
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\//.test(ua) || /Opera/.test(ua)) browser = "Opera";
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";
}

export function spablaTrace(event: string, payload?: Record<string, unknown>) {
  detectEnv();
  const line: Record<string, unknown> = {
    ts: new Date().toISOString(),
    event,
    callId: sessionCallId,
    roomId: sessionRoomId,
    userId: sessionUserId,
    browser,
    platform,
  };
  if (payload !== undefined) line.payload = payload;
  try {
    // eslint-disable-next-line no-console
    console.log(`[SPABLA_TRACE] ${JSON.stringify(line)}`);
  } catch {
    // Payload may hold circular references; fall back to a shallow tag.
    // eslint-disable-next-line no-console
    console.log(`[SPABLA_TRACE] ts=${line.ts as string} event=${event} (payload not serialisable)`);
  }
}

// ── Media summarisers (safe against nulls and thrown getters) ──────────────

export function traceTrack(t: MediaStreamTrack | null | undefined) {
  if (!t) return null;
  let settings: MediaTrackSettings | null = null;
  let constraints: MediaTrackConstraints | null = null;
  try { settings = t.getSettings?.() ?? null; } catch { /* noop */ }
  try { constraints = t.getConstraints?.() ?? null; } catch { /* noop */ }
  return {
    id: t.id,
    kind: t.kind,
    label: t.label,
    enabled: t.enabled,
    muted: t.muted,
    readyState: t.readyState,
    settings,
    constraints,
  };
}

export function traceStream(s: MediaStream | null | undefined) {
  if (!s) return null;
  return {
    id: s.id,
    audioTracks: s.getAudioTracks().length,
    videoTracks: s.getVideoTracks().length,
    tracks: s.getTracks().map(traceTrack),
  };
}

export function traceVideoElement(v: HTMLVideoElement | null | undefined) {
  if (!v) return null;
  return {
    autoplay: v.autoplay,
    muted: v.muted,
    playsInline: v.playsInline,
    paused: v.paused,
    readyState: v.readyState,
    videoWidth: v.videoWidth,
    videoHeight: v.videoHeight,
    currentTime: v.currentTime,
    hasSrcObject: !!v.srcObject,
  };
}
