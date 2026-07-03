"use client";

// SPABLA V1 · Diagnostic tracer — audit/v1-debug branch only.
// Instrumentation-only. Never gates or alters behaviour.
// Emit format: single-line JSON prefixed with [SPABLA_TRACE] for grep/filter.

let sessionCallId: string | null = null;
let sessionRoomId: string | null = null;
let sessionUserId: string | null = null;

// Stable per-page-load session identifier — lets us group all traces of one test
// even after they land on a server log page.
const sessionId: string = ((): string => {
  if (typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function") {
    try { return (crypto as any).randomUUID(); } catch { /* noop */ }
  }
  return "sess_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
})();

// Ring buffer holding the last N trace lines so we can export them from
// inside the app when Safari Web Inspector is not available.
const TRACE_BUFFER_MAX = 2000;
const traceBuffer: string[] = [];

// Auto-dump wiring: when spablaTrace() sees END_CALL_DONE (or the exported
// dumpSpablaTraceBuffer is called manually), the buffer is POSTed to
// /api/debug-trace via fetch keepalive + sendBeacon fallback.
let autoDumpInFlight = false;

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
    sessionId,
    callId: sessionCallId,
    roomId: sessionRoomId,
    userId: sessionUserId,
    browser,
    platform,
  };
  if (payload !== undefined) line.payload = payload;
  let serialised: string;
  try {
    serialised = JSON.stringify(line);
  } catch {
    serialised = JSON.stringify({ ts: line.ts, event, sessionId, note: "payload not serialisable" });
  }
  // eslint-disable-next-line no-console
  console.log(`[SPABLA_TRACE] ${serialised}`);
  // Ring buffer for in-app export.
  traceBuffer.push(serialised);
  if (traceBuffer.length > TRACE_BUFFER_MAX) traceBuffer.shift();
  // Auto-dump: when the call finishes, ship the buffer server-side so Vercel
  // Function Logs capture it even if the CEO's device has no accessible console.
  if (event === "END_CALL_DONE") {
    // Fire-and-forget; failure is non-blocking.
    void dumpSpablaTraceBuffer("auto/END_CALL_DONE");
  }
}

// ── Export API ─────────────────────────────────────────────────────────────

export function getSpablaTraceBuffer(): string[] {
  return traceBuffer.slice();
}

export function getSpablaSessionId(): string {
  return sessionId;
}

function buildDumpPayload(reason: string) {
  detectEnv();
  return {
    header: true,
    reason,
    sessionId,
    timestamp: new Date().toISOString(),
    roomId: sessionRoomId,
    userId: sessionUserId,
    callId: sessionCallId,
    browser,
    platform,
    traceCount: traceBuffer.length,
    traces: traceBuffer.slice(),
  };
}

// Serialise the buffer as JSONL text (header line + one trace per line).
export function exportSpablaTraceBuffer(reason: string = "manual"): string {
  const payload = buildDumpPayload(reason);
  const header = JSON.stringify({
    header: true,
    reason: payload.reason,
    sessionId: payload.sessionId,
    timestamp: payload.timestamp,
    roomId: payload.roomId,
    userId: payload.userId,
    callId: payload.callId,
    browser: payload.browser,
    platform: payload.platform,
    traceCount: payload.traceCount,
  });
  return [header, ...payload.traces].join("\n");
}

// POST the buffer to /api/debug-trace so it lands in Vercel Function Logs.
// Primary: fetch({keepalive:true}). Fallback: navigator.sendBeacon.
// Both are best-effort; a failure never throws.
export async function dumpSpablaTraceBuffer(reason: string = "manual"): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (autoDumpInFlight) return false;
  autoDumpInFlight = true;
  const payload = buildDumpPayload(reason);
  const body = JSON.stringify(payload);
  try {
    const res = await fetch("/api/debug-trace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
    autoDumpInFlight = false;
    return res.ok;
  } catch {
    try {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon?.("/api/debug-trace", blob) === true;
      autoDumpInFlight = false;
      return ok;
    } catch {
      autoDumpInFlight = false;
      return false;
    }
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
