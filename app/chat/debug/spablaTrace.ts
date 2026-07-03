"use client";

// SPABLA V1 · Diagnostic tracer — audit/v1-debug branch only.
// Instrumentation-only. Never gates or alters behaviour.
// Emit format: single-line JSON prefixed with [SPABLA_TRACE] for grep/filter.

let sessionCallId: string | null = null;
let sessionRoomId: string | null = null;
let sessionUserId: string | null = null;
let sessionMyLang: string | null = null;
let sessionTargetLang: string | null = null;

// Build id — Vercel injects the git SHA at build time. Falls back to "local".
const BUILD_ID: string =
  (typeof process !== "undefined" && (process as any).env?.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA) ||
  (typeof process !== "undefined" && (process as any).env?.NEXT_PUBLIC_BUILD_ID) ||
  "local";

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
  myLang?: string | null;
  targetLang?: string | null;
}) {
  if (ctx.callId !== undefined) sessionCallId = ctx.callId;
  if (ctx.roomId !== undefined) sessionRoomId = ctx.roomId;
  if (ctx.userId !== undefined) sessionUserId = ctx.userId;
  if (ctx.myLang !== undefined) sessionMyLang = ctx.myLang;
  if (ctx.targetLang !== undefined) sessionTargetLang = ctx.targetLang;
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
  const traces = traceBuffer.slice();
  return {
    header: true,
    reason,
    sessionId,
    timestamp: new Date().toISOString(),
    buildId: BUILD_ID,
    roomId: sessionRoomId,
    userId: sessionUserId,
    callId: sessionCallId,
    myLang: sessionMyLang,
    targetLang: sessionTargetLang,
    browser,
    platform,
    traceCount: traces.length,
    summary: computeSummary(traces),
    traces,
  };
}

// ── Trace summary derived from the buffer ──────────────────────────────────
// Purely functional. Reads the JSONL strings without mutating them and returns
// a plain object with PASS/FAIL indicators for each subsystem, so a human can
// diagnose in < 1 minute without reading every event.

type ParsedTrace = { ts?: string; event?: string; payload?: any };

function safeParse(line: string): ParsedTrace | null {
  try { return JSON.parse(line) as ParsedTrace; } catch { return null; }
}

function computeSummary(rawTraces: string[]) {
  const parsed: ParsedTrace[] = [];
  for (const line of rawTraces) {
    const p = safeParse(line);
    if (p && p.event) parsed.push(p);
  }
  const byEvent = new Map<string, ParsedTrace[]>();
  for (const p of parsed) {
    const bucket = byEvent.get(p.event!) ?? [];
    bucket.push(p);
    byEvent.set(p.event!, bucket);
  }
  const has = (name: string): boolean => byEvent.has(name);
  const count = (name: string): number => byEvent.get(name)?.length ?? 0;
  const last = (name: string): ParsedTrace | null => {
    const b = byEvent.get(name);
    return b && b.length ? b[b.length - 1] : null;
  };
  const anyWith = (name: string, predicate: (p: any) => boolean): boolean => {
    const b = byEvent.get(name);
    if (!b) return false;
    return b.some((tr) => tr.payload && predicate(tr.payload));
  };

  // Role inference: last of INCOMING_CALL vs START_VOICE_REQUEST/START_VIDEO_REQUEST with inserted=true.
  let role: "caller" | "callee" | "unknown" = "unknown";
  if (has("INCOMING_CALL")) role = "callee";
  if (anyWith("START_VOICE_REQUEST", (p) => p.inserted === true) ||
      anyWith("START_VIDEO_REQUEST", (p) => p.inserted === true)) role = "caller";

  // Call duration in ms (first to last trace).
  const firstTs = parsed[0]?.ts ? Date.parse(parsed[0].ts) : NaN;
  const lastTs  = parsed[parsed.length - 1]?.ts ? Date.parse(parsed[parsed.length - 1]!.ts!) : NaN;
  const durationMs = Number.isFinite(firstTs) && Number.isFinite(lastTs) ? (lastTs - firstTs) : NaN;

  // VOICE — mic capture / chunk emit.
  const anyRmsNonZero = anyWith("AUDIO_RMS_SAMPLE", (p) => (p.rms ?? 0) > 0);
  const anySentChunk  = anyWith("AUDIO_CHUNK_SEND", (p) => (p.sentPerSec ?? 0) > 0);
  const anySkippedIsSpeaking = anyWith("AUDIO_CHUNK_SKIPPED", (p) => (p.byIsSpeaking ?? 0) > 0);
  const anySkippedSocketDown = anyWith("AUDIO_CHUNK_SKIPPED", (p) => (p.bySocketDisconnected ?? 0) > 0);

  // TRANSLATION — outgoing (I speak → server processes my audio) / incoming (peer speaks → I hear translation).
  const outgoingTranscriptOk = anyWith("TRANSCRIPT_RESULT", (p) => p.isFinal === true && p.serverWillTranslate === true);
  const outgoingTranscriptAny = has("TRANSCRIPT_RESULT");
  const incomingChunksOk = anyWith("TRANSLATED_AUDIO_CHUNK_RECEIVED", (p) => (p.chunksPerSec ?? 0) > 0);
  const incomingChunksAny = has("TRANSLATED_AUDIO_CHUNK_RECEIVED");
  const incomingPlaybackStarted = has("PLAY_TRANSLATED_START");
  const incomingPlaybackAny = has("PLAY_TRANSLATED_SAMPLE");

  // VIDEO — local/remote play + enableVideo state.
  const localPlayOk = has("VIDEO_LOCAL_PLAY_SUCCESS");
  const localPlayErr = has("VIDEO_LOCAL_PLAY_ERROR");
  const remotePlayOk = has("VIDEO_REMOTE_PLAY_SUCCESS");
  const remotePlayErr = has("VIDEO_REMOTE_PLAY_ERROR");
  const enableVideoAttempted = has("ENABLE_VIDEO");
  const enableVideoDone = anyWith("ENABLE_VIDEO", (p) => p.step === "done");
  const enableVideoAborted = byEvent.get("ENABLE_VIDEO")?.find((tr) => tr.payload && tr.payload.aborted)?.payload?.aborted ?? null;

  // Renegotiation state.
  const renegotiateOk = has("PC_RECEIVE_ANSWER");
  const remoteRenegotiate = has("PC_RECEIVE_OFFER") && has("PC_SET_LOCAL_ANSWER");

  // CONNECTIVITY — last states.
  const lastSocketConnected = has("SOCKET_CONNECTED") &&
    ((last("SOCKET_DISCONNECTED")?.ts ?? "") < (last("SOCKET_CONNECTED")?.ts ?? "") || !has("SOCKET_DISCONNECTED"));
  const lastIceState = (last("PC_ICE_CONNECTION_STATE")?.payload as any)?.state ?? null;
  const lastConnState = (last("PC_CONNECTION_STATE")?.payload as any)?.state ?? null;
  const lastSignalingState = (last("PC_SIGNALING_STATE")?.payload as any)?.state ?? null;
  const lastAudioCtxState = (last("AUDIO_CONTEXT_STATE_CHANGE")?.payload as any)?.state
    ?? (last("AUDIO_CONTEXT_RESUME_SUCCESS")?.payload as any)?.stateAfter
    ?? null;

  // Language context — prefer explicit LANG_CONTEXT, fallback to REALTIME_START_REQUEST.
  const langCtx = last("LANG_CONTEXT")?.payload as any;
  const rtStart = last("REALTIME_START_REQUEST")?.payload as any;
  const effectiveMyLang = langCtx?.myLang ?? rtStart?.myLang ?? sessionMyLang ?? null;
  const effectiveTargetLang = langCtx?.targetLang ?? rtStart?.targetLang ?? sessionTargetLang ?? null;

  return {
    build: BUILD_ID,
    conversation: sessionRoomId,
    call: sessionCallId,
    role,
    browser,
    platform,
    durationMs,
    voice: {
      micCapture:    anyRmsNonZero ? "OK" : "FAIL",
      chunkEmit:     anySentChunk  ? "OK" : "FAIL",
      skipIsSpeaking: anySkippedIsSpeaking,
      skipSocketDown: anySkippedSocketDown,
    },
    translationOutgoing: {
      transcript: outgoingTranscriptOk ? "OK" : (outgoingTranscriptAny ? "PARTIAL" : "FAIL"),
    },
    translationIncoming: {
      chunksReceived: incomingChunksOk ? "OK" : (incomingChunksAny ? "PARTIAL" : "FAIL"),
      playbackStarted: incomingPlaybackStarted ? "OK" : (incomingPlaybackAny ? "PARTIAL" : "FAIL"),
    },
    video: {
      localPlay:  localPlayOk  ? "OK" : (localPlayErr  ? "FAIL" : "NOT_ATTEMPTED"),
      remotePlay: remotePlayOk ? "OK" : (remotePlayErr ? "FAIL" : "NOT_ATTEMPTED"),
      enableVideo: enableVideoDone ? "OK" : (enableVideoAttempted ? "FAIL" : "NOT_ATTEMPTED"),
      enableVideoAborted,
      renegotiateInitiator: renegotiateOk ? "OK" : (has("PC_CREATE_OFFER") ? "PARTIAL" : "NOT_ATTEMPTED"),
      renegotiateReceiver:  remoteRenegotiate ? "OK" : (has("PC_RECEIVE_OFFER") ? "PARTIAL" : "NOT_ATTEMPTED"),
    },
    connectivity: {
      socket:          lastSocketConnected ? "CONNECTED" : "DISCONNECTED",
      webrtcIce:       lastIceState,
      webrtcConn:      lastConnState,
      webrtcSignaling: lastSignalingState,
      audioContext:    lastAudioCtxState,
    },
    language: {
      myLang: effectiveMyLang,
      targetLang: effectiveTargetLang,
    },
    counts: {
      audioRmsSamples: count("AUDIO_RMS_SAMPLE"),
      audioChunkSend:  count("AUDIO_CHUNK_SEND"),
      audioChunkSkipped: count("AUDIO_CHUNK_SKIPPED"),
      transcriptResults: count("TRANSCRIPT_RESULT"),
      subtitlesReceived: count("SUBTITLE_RECEIVED"),
      translatedAudioChunkReceived: count("TRANSLATED_AUDIO_CHUNK_RECEIVED"),
      playbackSamples: count("PLAY_TRANSLATED_SAMPLE"),
      enableVideoEvents: count("ENABLE_VIDEO"),
    },
  };
}

function formatSummaryBlock(summary: ReturnType<typeof computeSummary>): string {
  const l: string[] = [];
  l.push("===== SPABLA TRACE SUMMARY =====");
  l.push("");
  l.push(`Build: ${summary.build}`);
  l.push(`Conversation: ${summary.conversation ?? "?"}`);
  l.push(`Call: ${summary.call ?? "?"}`);
  l.push(`Role: ${summary.role}`);
  l.push(`Browser: ${summary.browser}`);
  l.push(`Platform: ${summary.platform}`);
  l.push(`Duration: ${Number.isFinite(summary.durationMs) ? summary.durationMs + "ms" : "?"}`);
  l.push("");
  l.push("VOICE:");
  l.push(`  Mic capture:     ${summary.voice.micCapture}`);
  l.push(`  Chunk emit:      ${summary.voice.chunkEmit}`);
  l.push(`  Skip isSpeaking: ${summary.voice.skipIsSpeaking ? "YES (chunks were suppressed by TTS gate)" : "no"}`);
  l.push(`  Skip socketDown: ${summary.voice.skipSocketDown ? "YES (chunks dropped by disconnected socket)" : "no"}`);
  l.push("");
  l.push("TRANSLATION OUTGOING (my audio → peer language):");
  l.push(`  Transcript:      ${summary.translationOutgoing.transcript}`);
  l.push("");
  l.push("TRANSLATION INCOMING (peer audio → my language):");
  l.push(`  Chunks received: ${summary.translationIncoming.chunksReceived}`);
  l.push(`  Playback:        ${summary.translationIncoming.playbackStarted}`);
  l.push("");
  l.push("VIDEO:");
  l.push(`  Local play:      ${summary.video.localPlay}`);
  l.push(`  Remote play:     ${summary.video.remotePlay}`);
  l.push(`  enableVideo:     ${summary.video.enableVideo}${summary.video.enableVideoAborted ? " (aborted: " + summary.video.enableVideoAborted + ")" : ""}`);
  l.push(`  Renegotiate mine: ${summary.video.renegotiateInitiator}`);
  l.push(`  Renegotiate peer: ${summary.video.renegotiateReceiver}`);
  l.push("");
  l.push("CONNECTIVITY:");
  l.push(`  Socket:          ${summary.connectivity.socket}`);
  l.push(`  WebRTC ICE:      ${summary.connectivity.webrtcIce ?? "?"}`);
  l.push(`  WebRTC conn:     ${summary.connectivity.webrtcConn ?? "?"}`);
  l.push(`  WebRTC signal:   ${summary.connectivity.webrtcSignaling ?? "?"}`);
  l.push(`  AudioContext:    ${summary.connectivity.audioContext ?? "?"}`);
  l.push("");
  l.push("LANGUAGE:");
  l.push(`  Source: ${summary.language.myLang ?? "?"}`);
  l.push(`  Target: ${summary.language.targetLang ?? "?"}`);
  l.push("");
  l.push("COUNTS:");
  l.push(`  audio.rms.samples:            ${summary.counts.audioRmsSamples}`);
  l.push(`  audio.chunk.send:             ${summary.counts.audioChunkSend}`);
  l.push(`  audio.chunk.skipped:          ${summary.counts.audioChunkSkipped}`);
  l.push(`  transcript.results:           ${summary.counts.transcriptResults}`);
  l.push(`  subtitle.received:            ${summary.counts.subtitlesReceived}`);
  l.push(`  translated.audio.chunk.recv:  ${summary.counts.translatedAudioChunkReceived}`);
  l.push(`  playback.samples:             ${summary.counts.playbackSamples}`);
  l.push(`  enableVideo.events:           ${summary.counts.enableVideoEvents}`);
  l.push("");
  l.push("================================");
  return l.join("\n");
}

// Serialise the buffer as text: the SPABLA TRACE SUMMARY block first (human-readable),
// then the JSONL header line, then one trace per line.
export function exportSpablaTraceBuffer(reason: string = "manual"): string {
  const payload = buildDumpPayload(reason);
  const summaryBlock = formatSummaryBlock(payload.summary);
  const header = JSON.stringify({
    header: true,
    reason: payload.reason,
    sessionId: payload.sessionId,
    timestamp: payload.timestamp,
    buildId: payload.buildId,
    roomId: payload.roomId,
    userId: payload.userId,
    callId: payload.callId,
    myLang: payload.myLang,
    targetLang: payload.targetLang,
    browser: payload.browser,
    platform: payload.platform,
    traceCount: payload.traceCount,
  });
  return [summaryBlock, "", header, ...payload.traces].join("\n");
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
