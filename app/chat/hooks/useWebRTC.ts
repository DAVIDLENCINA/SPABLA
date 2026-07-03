import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { supabase } from "@/lib/supabase";
import { useTranslatedSpeech, playTranslatedPcmChunk } from "./useTranslatedSpeech";
import { spablaTrace, traceStream, traceTrack } from "@/app/chat/debug/spablaTrace";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "https://spabla-server.onrender.com";

const STUN_ONLY = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

async function fetchIceServers(): Promise<RTCIceServer[]> {
  try {
    const res = await fetch("/api/ice-servers");
    if (!res.ok) throw new Error(`ice-servers ${res.status}`);
    const { iceServers } = await res.json();
    const hasTurn = iceServers.some((s: RTCIceServer) =>
      [s.urls].flat().some((u) => typeof u === "string" && u.startsWith("turn:"))
    );
    console.log(
      `[SPABLA][ICE] servers fetched — TURN: ${hasTurn ? "✅ configured" : "⚠️ not configured (STUN only)"}`
    );
    return iceServers;
  } catch (err) {
    console.warn("[SPABLA][ICE] failed to fetch ice-servers, falling back to STUN only:", err);
    return STUN_ONLY;
  }
}

// Deepgram language codes differ from our internal codes in some cases
const DEEPGRAM_LANG: Record<string, string> = {
  es: "es", en: "en-US", fr: "fr", de: "de",
  pt: "pt", it: "it", ja: "ja", ko: "ko", zh: "zh", ar: "ar", ru: "ru",
};

export type Caption = {
  text:     string;   // text to display (translated when final, original when partial)
  original: string;   // always the raw spoken text
  partial:  boolean;
};

export type CaptionEntry = {
  id:      string;              // Date.now() string — stable React key
  speaker: "local" | "remote";
  text:    string;              // primary display text
  original: string;             // secondary text (shown if different from text)
};

export type WebRTCState = {
  localStream:   MediaStream | null;
  remoteStream:  MediaStream | null;
  connected:     boolean;
  hasRemote:     boolean;
  micOn:         boolean;
  camOn:         boolean;
  error:         string | null;
  localCaption:    Caption | null;
  remoteCaption:   Caption | null;
  captionsHistory: CaptionEntry[];
  callEndedSignal: number;
  startCall:       (mode?: 'voice' | 'video') => Promise<void>;
  endCall:       () => void;
  toggleMic:     () => void;
  toggleCam:     () => void;
  // iOS Safari: create/resume the capture AudioContext inside a synchronous user gesture
  // (button click handler). Without this, the ctx is created later in startCall from a
  // useEffect callback (async, no gesture) and stays state=suspended → ScriptProcessor
  // reads all-zero buffers → translation gets silence.
  unlockCapture: () => void;
  // In-call video upgrade: add a camera track to the existing RTCPeerConnection
  // without tearing down the audio path. Returns true if the renegotiation started
  // cleanly, false on permission denial / missing state / signalingState churn.
  enableVideo: () => Promise<boolean>;
  // Peer emitted video-enabled → the other side should mount its VideoOverlay
  // so the incoming video track that will arrive via renegotiation becomes visible.
  remoteHasVideo: boolean;
};

export function useWebRTC(
  conversationId: string | null,
  myLang: string,
  targetLang: string | null,
  voiceEnabled: boolean = false,
): WebRTCState {
  // Core WebRTC refs
  const socketRef      = useRef<Socket | null>(null);
  const pcRef          = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  // iOS Safari quirk fix: a SEPARATE audio stream (or cloned mic track) is used to feed
  // the AudioContext capture graph, independent of the stream added to the RTCPeerConnection.
  // Sharing one stream between pc.addTrack and ctx.createMediaStreamSource makes iOS route
  // the audio into the WebRTC voice-mode pipeline and delivers all-zero buffers to the
  // AudioContext side (confirmed empirically: rms=0.0000 nonZero=0% on iPhone Safari).
  const captureStreamRef = useRef<MediaStream | null>(null);

  // Audio processing refs (Deepgram pipeline)
  const audioCtxRef  = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef    = useRef<MediaStreamAudioSourceNode | null>(null);

  // Lang refs — always reflect the latest prop value inside socket event closures
  const myLangRef    = useRef(myLang);
  const targetLangRef = useRef(targetLang);

  // Caption auto-hide timers
  const hideLocalRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideRemoteRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Last non-empty partial transcript — fallback when speech_final fires with empty text
  const lastPartialTranscriptRef = useRef<string>("");

  // STT warm-up: timestamp after which transcript-result events are processed
  const sttWarmupUntilRef  = useRef<number>(0);
  // Dedup: last subtitle emitted locally and last subtitle received remotely
  const lastLocalEmitRef   = useRef<{ text: string; ts: number } | null>(null);
  const lastRemoteRecvRef  = useRef<{ text: string; ts: number } | null>(null);

  // Fix 6 — watchdog interval for connection health monitoring
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Guard: prevents endCall() re-entering when socket.disconnect() triggers a "disconnect" event
  const endingRef = useRef(false);
  const hasCreatedOfferRef = useRef(false);
  // Guard: prevents concurrent startCall() executions (e.g. double-tap before socket connects)
  const startingRef = useRef(false);

  const [localStream,   setLocalStream]   = useState<MediaStream | null>(null);
  const [remoteStream,  setRemoteStream]  = useState<MediaStream | null>(null);
  const [connected,     setConnected]     = useState(false);
  const [hasRemote,     setHasRemote]     = useState(false);
  const [micOn,         setMicOn]         = useState(true);
  const [camOn,         setCamOn]         = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [localCaption,    setLocalCaption]    = useState<Caption | null>(null);
  const [remoteCaption,   setRemoteCaption]   = useState<Caption | null>(null);
  const [captionsHistory, setCaptionsHistory] = useState<CaptionEntry[]>([]);
  const [callEndedSignal, setCallEndedSignal] = useState(0);
  // In-call video upgrade signal from the peer. Flips true when peer emits
  // "video-enabled" via the signaling socket. Consumers use it to setVideoActive(true)
  // so their <VideoOverlay> mounts to display the incoming video track.
  const [remoteHasVideo, setRemoteHasVideo] = useState(false);

  const { speak, cancel: cancelTTS, isSpeakingRef } = useTranslatedSpeech();
  const voiceEnabledRef = useRef(voiceEnabled);

  // Keep lang refs in sync when props change between renders
  useEffect(() => { myLangRef.current = myLang; },             [myLang]);
  useEffect(() => {
    const wasEnabled = voiceEnabledRef.current;
    voiceEnabledRef.current = voiceEnabled;
    if (voiceEnabled && !wasEnabled) {
      sttWarmupUntilRef.current = Date.now() + 2000;
      console.log("[STT] warmup started — ignoring results for 2000ms");
    }
    console.log("[TTS] voiceEnabled →", voiceEnabled);
  }, [voiceEnabled]);
  useEffect(() => {
    targetLangRef.current = targetLang;
    // Notificar al servidor cuando cambia el idioma destino (experimento server-side)
    if (socketRef.current?.connected) {
      spablaTrace("TARGET_LANG_UPDATE_EMIT", { targetLang, socketConnected: true });
      socketRef.current.emit("update-target-lang", targetLang);
    } else {
      spablaTrace("TARGET_LANG_UPDATE_EMIT", { targetLang, socketConnected: false, skipped: true });
    }
  }, [targetLang]);

  // Fix A — restart Deepgram when the user changes language during an active call.
  // Without this, Deepgram keeps transcribing in the old language and produces
  // empty/wrong transcripts → no captions, no translation, no subtitles for the remote.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return; // no active call — nothing to restart
    spablaTrace("REALTIME_START_REQUEST", { from: "myLang-change-useEffect", myLang, targetLang: targetLangRef.current });
    spablaTrace("TR_SOURCE_LANGUAGE", { from: "myLang-change", value: myLang });
    spablaTrace("TR_TARGET_LANGUAGE", { from: "myLang-change", value: targetLangRef.current });
    spablaTrace("TR_SHOULD_TRANSLATE", { from: "myLang-change", myLang, targetLang: targetLangRef.current, decision: !!targetLangRef.current && targetLangRef.current !== myLang });
    socket.emit("transcribe-stop");
    socket.emit("transcribe-start", { lang: DEEPGRAM_LANG[myLang] ?? myLang });
    console.log("[SPABLA][DG] language changed →", myLang, "— Deepgram session restarted");
  }, [myLang]);

  const endCall = useCallback(() => {
    if (endingRef.current) return;
    endingRef.current = true;
    spablaTrace("END_CALL_START", {
      hasSocket: !!socketRef.current,
      hasPc: !!pcRef.current,
      hasLocalStream: !!localStreamRef.current,
      hasCaptureStream: !!captureStreamRef.current,
      audioCtxState: audioCtxRef.current?.state ?? null,
    });

    // Stop TTS immediately — must be first so no audio plays during teardown
    cancelTTS();
    spablaTrace("TTS_CANCEL", {});

    console.trace("[SPABLA][ENDCALL] called from:");
    setCallEndedSignal(prev => prev + 1);

    // Stop watchdog
    if (watchdogRef.current) { clearInterval(watchdogRef.current); watchdogRef.current = null; }

    // Stop Deepgram and audio processing
    socketRef.current?.emit("transcribe-stop");
    try {
      processorRef.current?.disconnect();
      sourceRef.current?.disconnect();
      spablaTrace("PROCESSOR_DISCONNECT", {});
      audioCtxRef.current?.close();
      spablaTrace("AUDIO_CONTEXT_CLOSE", {});
    } catch (err: any) {
      spablaTrace("AUDIO_CONTEXT_CLOSE", { threw: true, errorMessage: err?.message ?? String(err) });
    }
    processorRef.current = null;
    sourceRef.current    = null;
    audioCtxRef.current  = null;

    // Clear caption timers
    if (hideLocalRef.current)  clearTimeout(hideLocalRef.current);
    if (hideRemoteRef.current) clearTimeout(hideRemoteRef.current);

    // Remove ALL socket listeners before disconnect so in-flight events
    // (transcript-result / subtitle buffered in the event queue) have no handler to fire.
    socketRef.current?.removeAllListeners();
    spablaTrace("SOCKET_REMOVE_LISTENERS", {});

    // Stop tracks, socket, peer connection
    const localTracksSummary = localStreamRef.current?.getTracks().map(t => ({ kind: t.kind, id: t.id, readyState: t.readyState })) ?? [];
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    spablaTrace("LOCAL_TRACK_STOP", { count: localTracksSummary.length, tracks: localTracksSummary });
    // Also stop the dedicated capture stream so the mic indicator turns off on iOS
    // and no phantom capture stays alive across calls.
    const captureTracksSummary = captureStreamRef.current?.getTracks().map(t => ({ kind: t.kind, id: t.id, readyState: t.readyState })) ?? [];
    captureStreamRef.current?.getTracks().forEach((t) => t.stop());
    spablaTrace("CAPTURE_TRACK_STOP", { count: captureTracksSummary.length, tracks: captureTracksSummary });
    socketRef.current?.disconnect();
    spablaTrace("SOCKET_DISCONNECT", { from: "endCall" });
    pcRef.current?.close();
    spablaTrace("PC_CLOSE", {});

    // Reset all state
    localStreamRef.current = null;
    captureStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setHasRemote(false);
    // Without this, the useEffect in page.tsx that watches remoteHasVideo would
    // re-flip videoActive=true right after the callStatus reset, leaving
    // VideoOverlay mounted on top of the chat with camera-off placeholders.
    setRemoteHasVideo(false);
    setConnected(false);
    setLocalCaption(null);
    setRemoteCaption(null);
    setCaptionsHistory([]);  // clear history only on hang-up, not on minimize
    setMicOn(true);          // reset so next call doesn't show stale "Muted"
    startingRef.current = false;
    socketRef.current = null;
    pcRef.current = null;
    spablaTrace("END_CALL_DONE", {});
  }, [cancelTTS]);

  const startCall = useCallback(async (mode: 'voice' | 'video' = 'video') => {
    console.log("[SPABLA][STARTCALL]", {
      conversationId,
      mode,
      voiceEnabled,
    });
    if (socketRef.current?.connected) return;
    if (!conversationId) return;
    if (startingRef.current) return;
    startingRef.current = true;

    endingRef.current = false;
    hasCreatedOfferRef.current = false;
    setError(null);

    // Create and unlock AudioContext synchronously within the user gesture.
    // iOS Safari suspends any AudioContext created or resumed outside a
    // synchronous gesture handler — resume() in async callbacks is silently ignored,
    // which makes ScriptProcessor read all-zero buffers (silence → Deepgram empty).
    // Must happen before the first await.
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioCtx({ sampleRate: 48000 });
      spablaTrace("AUDIO_CONTEXT_CREATE", { from: "startCall", sampleRate: audioCtxRef.current.sampleRate, state: audioCtxRef.current.state });
      try { (audioCtxRef.current as AudioContext).onstatechange = () => spablaTrace("AUDIO_CONTEXT_STATE_CHANGE", { state: audioCtxRef.current?.state ?? null }); } catch { /* noop */ }
    }
    {
      const _ctx = audioCtxRef.current;
      spablaTrace("AUDIO_CONTEXT_RESUME_REQUEST", { from: "startCall", stateBefore: _ctx.state });
      _ctx.resume().then(
        () => spablaTrace("AUDIO_CONTEXT_RESUME_SUCCESS", { from: "startCall", stateAfter: _ctx.state }),
        (err: any) => spablaTrace("AUDIO_CONTEXT_RESUME_ERROR", { from: "startCall", errorMessage: err?.message ?? String(err) }),
      ).catch(() => {});
    }
    console.log("[TRACE AUDIO CONTEXT] created in gesture | state=", audioCtxRef.current.state, "sampleRate=", audioCtxRef.current.sampleRate);

    // 1 — Acquire media
    let stream: MediaStream;
    const mainConstraints = {
      video: mode === 'video',
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    };
    spablaTrace("GUM_MAIN_REQUEST", { constraints: mainConstraints, mode });
    try {
      stream = await navigator.mediaDevices.getUserMedia(mainConstraints as MediaStreamConstraints);
      spablaTrace("GUM_MAIN_SUCCESS", { stream: traceStream(stream) });
    } catch (err: any) {
      startingRef.current = false;
      setError(`Sin acceso a cámara/micrófono: ${err?.name} — ${err?.message}`);
      spablaTrace("GUM_MAIN_ERROR", { errorName: err?.name ?? null, errorMessage: err?.message ?? String(err) });
      return;
    }
    localStreamRef.current = stream;
    setLocalStream(stream);
    setMicOn(true);
    setCamOn(true);

    // 1b — Dedicated capture stream for the AudioContext pipeline (iOS Safari fix).
    // Try a separate getUserMedia first (fully independent MediaStreamTrack instances,
    // best case for iOS). If iOS refuses concurrent capture, fall back to cloning the
    // mic track from the WebRTC stream — a clone still gives us a track object independent
    // from the pc's track, which is enough on most iOS versions to bypass the routing quirk.
    // Enable echoCancellation + noiseSuppression + autoGainControl on this branch: the peer
    // still gets the "raw" main-stream audio via WebRTC, and STT quality improves noticeably.
    let captureStream: MediaStream | null = null;
    const captureConstraints = {
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    };
    spablaTrace("GUM_CAPTURE_REQUEST", { constraints: captureConstraints });
    try {
      captureStream = await navigator.mediaDevices.getUserMedia(captureConstraints as MediaStreamConstraints);
      console.log("[TRACE CAPTURE STREAM] dedicated getUserMedia OK — using independent stream");
      spablaTrace("GUM_CAPTURE_SUCCESS", { stream: traceStream(captureStream), sameAsMain: captureStream === stream });
    } catch (err: any) {
      console.warn("[TRACE CAPTURE STREAM] dedicated getUserMedia failed:", err?.name, err?.message, "→ falling back to track.clone()");
      spablaTrace("GUM_CAPTURE_ERROR", { errorName: err?.name ?? null, errorMessage: err?.message ?? String(err) });
      const micTrack = stream.getAudioTracks()[0];
      if (micTrack) {
        try {
          captureStream = new MediaStream([micTrack.clone()]);
          console.log("[TRACE CAPTURE STREAM] track.clone() OK — using cloned mic track");
          spablaTrace("GUM_CLONE_FALLBACK", { stream: traceStream(captureStream), clonedFromTrack: traceTrack(micTrack) });
        } catch (cloneErr: any) {
          console.warn("[TRACE CAPTURE STREAM] track.clone() failed:", cloneErr?.message, "→ reusing shared stream (may give rms=0 on iOS)");
          spablaTrace("GUM_SHARED_FALLBACK", { reason: "clone-failed", errorMessage: cloneErr?.message ?? String(cloneErr) });
          captureStream = stream;
        }
      } else {
        spablaTrace("GUM_SHARED_FALLBACK", { reason: "no-mic-track-to-clone" });
        captureStream = stream;
      }
    }
    captureStreamRef.current = captureStream;

    // 2 — PeerConnection (ICE servers fetched server-side — no credentials in client bundle)
    const iceServers = await fetchIceServers();
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;
    spablaTrace("PC_CREATE", { iceServersCount: Array.isArray(iceServers) ? iceServers.length : null });
    stream.getTracks().forEach((t) => {
      pc.addTrack(t, stream);
      spablaTrace("PC_ADD_TRACK", { track: traceTrack(t), streamId: stream.id });
    });

    pc.ontrack = (e) => {
      const audioTracks = e.streams[0]?.getAudioTracks() ?? [];
      console.log(`[SPABLA][WEBRTC][TRACK] kind:${e.track.kind} streams:${e.streams.length} audio:${audioTracks.length}`);
      spablaTrace("PC_ON_TRACK", { track: traceTrack(e.track), streamsCount: e.streams.length, audioTracksInStream: audioTracks.length });
      // Wrap in a new MediaStream so React re-renders when a video track is added
      // to an already-established connection via renegotiation. Same track refs
      // internally — no leaks, no duplicated streams.
      const stream = e.streams[0];
      if (stream) setRemoteStream(new MediaStream(stream.getTracks()));
      setHasRemote(true);
      // Fix 5 — monitor remote track lifecycle to detect freeze source
      const ts = () => new Date().toISOString().slice(11, 23);
      e.track.onended  = () => {
        console.warn(`[SPABLA][TRACK] ${ts()} ended:`, e.track.kind);
        spablaTrace("PC_TRACK_ENDED", { kind: e.track.kind, id: e.track.id, side: "remote" });
        if (e.track.kind === "video") {
          // Peer stopped video mid-call. Do NOT tear down — keep audio+call alive.
          setRemoteHasVideo(false);
          return;
        }
        setHasRemote(false);
        endCall();
      };
      e.track.onmute   = () =>   console.warn(`[SPABLA][TRACK] ${ts()} muted:`,   e.track.kind);
      e.track.onunmute = () =>   console.log( `[SPABLA][TRACK] ${ts()} unmuted:`, e.track.kind);
    };

    // ICE diagnostics — visible in browser console during calls
    pc.oniceconnectionstatechange = () => {
      console.log("[SPABLA][ICE] iceConnectionState →", pc.iceConnectionState);
      spablaTrace("PC_ICE_CONNECTION_STATE", { state: pc.iceConnectionState });
      if (pc.iceConnectionState === "failed") {
        console.error("[SPABLA][ICE] connection failed — likely missing TURN server for cross-network calls");
        endCall();
      }
    };
    pc.onconnectionstatechange = () => {
      console.log("[SPABLA][ICE] connectionState →", pc.connectionState);
      spablaTrace("PC_CONNECTION_STATE", { state: pc.connectionState });
    };
    pc.onsignalingstatechange = () => {
      spablaTrace("PC_SIGNALING_STATE", { state: pc.signalingState });
    };
    pc.onicecandidateerror = (e: RTCPeerConnectionIceErrorEvent) => {
      // 701 = TURN allocation failed (wrong credentials or server unreachable)
      if (e.errorCode >= 700) {
        console.warn("[SPABLA][ICE] candidate error", e.errorCode, e.errorText, e.url);
      }
    };
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === "complete") {
        // Log the selected candidate pair type when gathering finishes
        pc.getStats().then((stats) => {
          stats.forEach((report) => {
            if (report.type === "candidate-pair" && report.state === "succeeded") {
              const local = (stats.get(report.localCandidateId) as any);
              console.log(
                "[SPABLA][ICE] selected pair — local:",
                local?.candidateType ?? "?",
                "| remote:",
                (stats.get(report.remoteCandidateId) as any)?.candidateType ?? "?"
              );
            }
          });
        }).catch(() => {});
      }
    };

    // 3 — Signaling socket — token en el handshake para que el middleware lo valide
    const { data: { session: callSession } } = await supabase.auth.getSession();
    spablaTrace("SOCKET_CONNECT_START", { serverUrl: SERVER_URL, hasToken: !!callSession?.access_token });
    const socket = io(SERVER_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 500,
      auth: { token: callSession?.access_token ?? "" },
    });
    socketRef.current = socket;

    const doCreateOffer = async () => {
      if (hasCreatedOfferRef.current) return;
      hasCreatedOfferRef.current = true;
      console.log(`[SPABLA][WEBRTC][CREATE_OFFER] signalingState:${pc.signalingState}`);
      spablaTrace("PC_CREATE_OFFER", { signalingState: pc.signalingState });
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        spablaTrace("PC_SET_LOCAL_OFFER", { signalingState: pc.signalingState, hasSdp: !!offer.sdp });
        socket.emit("offer", { roomId: conversationId, offer });
        console.log("[SPABLA][WEBRTC][OFFER_SENT]");
      } catch (err: any) {
        console.error("[SPABLA][WEBRTC][CREATE_OFFER_ERROR]:", err);
        spablaTrace("PC_CREATE_OFFER", { error: true, errorMessage: err?.message ?? String(err) });
        hasCreatedOfferRef.current = false;
      }
    };

    // Throttle ICE candidate spam
    let _iceSentThrottle = 0;
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        console.log("[SPABLA][WEBRTC][ICE_SENT]", e.candidate.type);
        const now = performance.now();
        if (now - _iceSentThrottle >= 2000) {
          spablaTrace("PC_ICE_CANDIDATE", { direction: "outgoing", type: e.candidate.type, protocol: e.candidate.protocol, throttled: true });
          _iceSentThrottle = now;
        }
        socket.emit("ice-candidate", { roomId: conversationId, candidate: e.candidate });
      }
    };

    socket.on("connect", () => {
      const connTs = new Date().toISOString().slice(11, 23);
      console.log(`[SPABLA][SOCK] ${connTs} socket connected`);
      spablaTrace("SOCKET_CONNECTED", { id: socket.id ?? null });
      setConnected(true);
      console.log("[SPABLA][ROOM] emitting join-room", conversationId);
      spablaTrace("ROOM_JOIN", { conversationId });
      socket.emit("join-room", conversationId, (ack: { ok: boolean; error?: string }) => {
        console.log("[SPABLA][ROOM] join-room ack:", ack);
      });

      // Start Deepgram transcription — incluir idiomas para experimento server-side
      spablaTrace("REALTIME_START_REQUEST", { from: "socket-connect", myLang: myLangRef.current, targetLang: targetLangRef.current });
      spablaTrace("TR_SOURCE_LANGUAGE", { from: "socket-connect", value: myLangRef.current });
      spablaTrace("TR_TARGET_LANGUAGE", { from: "socket-connect", value: targetLangRef.current });
      spablaTrace("TR_SHOULD_TRANSLATE", { from: "socket-connect", myLang: myLangRef.current, targetLang: targetLangRef.current, decision: !!targetLangRef.current && targetLangRef.current !== myLangRef.current });
      socket.emit("transcribe-start", {
        lang:       DEEPGRAM_LANG[myLangRef.current] ?? myLangRef.current,
        fromLang:   myLangRef.current,
        targetLang: targetLangRef.current,
      });

      // Fix 1 — teardown processor/source only. Do NOT close the AudioContext:
      // it was created and resumed in startCall() within the user gesture.
      // Closing it here (async network callback) would require a new user gesture
      // to reopen it on iOS Safari, resulting in silence again.
      try {
        processorRef.current?.disconnect();
        sourceRef.current?.disconnect();
      } catch {}
      processorRef.current = null;
      sourceRef.current    = null;

      // Reuse the AudioContext created in startCall() (inside user gesture).
      const ctx = audioCtxRef.current;
      if (!ctx) { console.error("[TRACE AUDIO CONTEXT] null — AudioContext missing"); return; }
      console.log("[TRACE AUDIO CONTEXT] reused | state=", ctx.state, "sampleRate=", ctx.sampleRate);
      ctx.resume().catch(() => {});

      // Log mic track health before building the pipeline.
      // We now feed the AudioContext from the DEDICATED capture stream (see 1b), not from
      // the shared WebRTC stream. On iOS Safari this is what unlocks non-zero samples.
      const captureSrc = captureStreamRef.current ?? stream;
      const _captureAudio = captureSrc.getAudioTracks()[0];
      if (_captureAudio) {
        console.log(`[TRACE MIC TRACK] (capture) enabled=${_captureAudio.enabled} muted=${_captureAudio.muted} readyState=${_captureAudio.readyState} sharedWithPc=${captureSrc === stream}`);
      }

      spablaTrace("AUDIO_SOURCE_CREATE", { ctxState: ctx.state, sampleRate: ctx.sampleRate, captureStreamId: captureSrc.id, captureTrackId: _captureAudio?.id ?? null, sharedWithPc: captureSrc === stream });
      const source = ctx.createMediaStreamSource(captureSrc);
      sourceRef.current = source;
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      spablaTrace("SCRIPT_PROCESSOR_CREATE", { bufferSize: 4096, channelsIn: 1, channelsOut: 1 });
      let _lastAudioLog = 0;
      let _lastTraceMs = 0;
      let _procFired = false;
      let _sentCount = 0;
      let _skipBySocket = 0;
      let _skipByEnding = 0;
      let _skipBySpeaking = 0;
      let _skipTotal = 0;
      let _rmsZeroSent = 0;
      processor.onaudioprocess = (e) => {
        if (!_procFired) {
          _procFired = true;
          spablaTrace("AUDIO_PROCESS_START", { ctxState: ctx.state, bufferLength: e.inputBuffer.length });
        }
        // Fix 2 — drop chunks while socket is offline or call is ending
        const socketConnected = socket.connected;
        const isEnding = endingRef.current;
        const isSpeaking = isSpeakingRef.current;
        const skipped = !socketConnected || isEnding || isSpeaking;
        if (skipped) {
          _skipTotal++;
          if (!socketConnected) _skipBySocket++;
          if (isEnding) _skipByEnding++;
          if (isSpeaking) _skipBySpeaking++;
        }
        // Compute a lightweight rms even when skipping so we know if the mic was actually feeding.
        const input = e.inputBuffer.getChannelData(0);
        let sumSq = 0, nonZero = 0, mn = 0, mx = 0;
        for (let i = 0; i < input.length; i++) { const v = input[i]; sumSq += v * v; if (v !== 0) nonZero++; if (v < mn) mn = v; if (v > mx) mx = v; }
        const rms = Math.sqrt(sumSq / input.length);
        if (!skipped) {
          const pcm = new Int16Array(input.length);
          for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          socket.emit("audio-chunk", pcm.buffer);
          _sentCount++;
          if (rms === 0) _rmsZeroSent++;
        }
        const _now = Date.now();
        if (_now - _lastAudioLog >= 2000) {
          _lastAudioLog = _now;
          console.log(`[TRACE AUDIO CLIENT] sampleRate=${ctx.sampleRate} samples=${input.length} rms=${rms.toFixed(4)} nonZero=${Math.round(nonZero / input.length * 100)}%`);
        }
        // AUDIO_RMS_SAMPLE + AUDIO_CHUNK_SEND + AUDIO_CHUNK_SKIPPED: 1 log every 1 s.
        if (_now - _lastTraceMs >= 1000) {
          _lastTraceMs = _now;
          spablaTrace("AUDIO_RMS_SAMPLE", {
            rms: Number(rms.toFixed(4)),
            nonZeroPct: Math.round((nonZero / input.length) * 100),
            min: Number(mn.toFixed(4)),
            max: Number(mx.toFixed(4)),
            contextState: ctx.state,
            captureStreamId: captureSrc.id,
            captureTrackId: _captureAudio?.id ?? null,
            sharedWithPc: captureSrc === stream,
          });
          spablaTrace("AUDIO_CHUNK_SEND", { sentPerSec: _sentCount, rmsZeroSent: _rmsZeroSent });
          if (_skipTotal > 0) {
            spablaTrace("AUDIO_CHUNK_SKIPPED", {
              totalSkipped: _skipTotal,
              bySocketDisconnected: _skipBySocket,
              byEnding: _skipByEnding,
              byIsSpeaking: _skipBySpeaking,
              contextStateAtSample: ctx.state,
            });
          }
          _sentCount = 0; _skipBySocket = 0; _skipByEnding = 0; _skipBySpeaking = 0; _skipTotal = 0; _rmsZeroSent = 0;
        }
      };
      source.connect(processor);
      processor.connect(ctx.destination);
      ctx.resume().catch(() => {});

      // Fix 6 — watchdog: log connection health every 15s for post-mortem diagnosis
      if (watchdogRef.current) clearInterval(watchdogRef.current);
      watchdogRef.current = setInterval(() => {
        const currentPc = pcRef.current;
        if (!currentPc) return;
        const wdTs = new Date().toISOString().slice(11, 23);
        console.log(
          `[SPABLA][WD] ${wdTs} | ice:${currentPc.iceConnectionState} | conn:${currentPc.connectionState} | socket:${socket.connected}`
        );
        currentPc.getStats().then((stats) => {
          stats.forEach((r: any) => {
            if (r.type === "inbound-rtp" && r.kind === "video") {
              console.log(`[SPABLA][WD]  video in — frames:${r.framesDecoded ?? "?"} lost:${r.packetsLost ?? "?"} jitter:${r.jitter?.toFixed(3) ?? "?"}s`);
            }
            if (r.type === "inbound-rtp" && r.kind === "audio") {
              console.log(`[SPABLA][WD]  audio in — packets:${r.packetsReceived ?? "?"} lost:${r.packetsLost ?? "?"}`);
            }
            if (r.type === "remote-inbound-rtp" && r.kind === "video") {
              console.log(`[SPABLA][WD]  video RTT:${r.roundTripTime?.toFixed(3) ?? "?"}s`);
            }
          });
        }).catch(() => {});
      }, 15_000);
    });

    socket.on("disconnect", (reason: string) => {
      console.warn("[SPABLA][SOCK] disconnected:", reason);
      spablaTrace("SOCKET_DISCONNECTED", { reason });
      setConnected(false);
      if (reason === "io server disconnect" || reason === "io client disconnect") {
        // Intentional close — tear down the call.
        endCall();
      }
      // "transport close" | "transport error" | "ping timeout":
      // Socket.IO will auto-reconnect — keep the call alive.
    });

    socket.on("connect_error", (err: Error) => {
      console.error("[SPABLA][SOCK] connect_error:", err.message);
    });

    socket.on("reconnect_attempt", (attempt: number) => {
      console.log(`[SPABLA][SOCK] reconnect_attempt #${attempt}`);
    });

    socket.on("reconnect", (attempt: number) => {
      console.log(`[SPABLA][SOCK] reconnected after ${attempt} attempt(s) — re-joining room`);
      spablaTrace("SOCKET_RECONNECTED", { attempt });
      if (conversationId) socket.emit("join-room", conversationId);
      if (localStreamRef.current) {
        spablaTrace("REALTIME_START_REQUEST", { from: "socket-reconnect", myLang: myLangRef.current, targetLang: targetLangRef.current });
        spablaTrace("TR_SOURCE_LANGUAGE", { from: "socket-reconnect", value: myLangRef.current });
        spablaTrace("TR_TARGET_LANGUAGE", { from: "socket-reconnect", value: targetLangRef.current });
        spablaTrace("TR_SHOULD_TRANSLATE", { from: "socket-reconnect", myLang: myLangRef.current, targetLang: targetLangRef.current, decision: !!targetLangRef.current && targetLangRef.current !== myLangRef.current });
        socket.emit("transcribe-start", {
          lang:       DEEPGRAM_LANG[myLangRef.current] ?? myLangRef.current,
          fromLang:   myLangRef.current,
          targetLang: targetLangRef.current,
        });
        console.log("[SPABLA][DG] transcribe-start re-emitted after reconnect");
      }
    });

    socket.on("reconnect_error", (err: Error) => {
      console.warn("[SPABLA][SOCK] reconnect_error:", err.message);
    });

    socket.on("reconnect_failed", () => {
      console.error("[SPABLA][SOCK] reconnect_failed — all attempts exhausted");
      endCall();
    });

    socket.on("join-error", ({ message }: { message: string }) => {
      console.error("[SPABLA][ROOM] join-error:", message);
      setError(`No autorizado para esta sala: ${message}`);
      endCall();
    });

    socket.on("room-users", async (otherSocketIds: string[]) => {
      console.log(`[SPABLA][ROOM_USERS] recibido | others: ${JSON.stringify(otherSocketIds)}`);
      spablaTrace("ROOM_USERS", { count: otherSocketIds.length, othersIds: otherSocketIds });
      if (otherSocketIds.length > 0) {
        await doCreateOffer();
      }
    });

    // 4 — WebRTC negotiation
    // user-joined: the remote peer joined. We are the existing peer — we do NOT create an offer.
    // The joiner will receive room-users with our socket ID and create the offer from their side.
    socket.on("user-joined", () => {
      console.log(`[SPABLA][NEG] user-joined — remote joined, awaiting their offer | signalingState:${pc.signalingState}`);
    });

    socket.on("offer", async (d: { offer: RTCSessionDescriptionInit }) => {
      console.log(`[SPABLA][NEG] offer recibido — SOY EL ANSWERER | signalingState:${pc.signalingState}`);
      spablaTrace("PC_RECEIVE_OFFER", { signalingState: pc.signalingState });
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(d.offer));
        console.log(`[SPABLA][NEG] setRemoteDescription(offer) OK | signalingState:${pc.signalingState}`);
        spablaTrace("PC_CREATE_ANSWER", { signalingState: pc.signalingState });
        const answer = await pc.createAnswer();
        console.log("[SPABLA][NEG] createAnswer OK — enviando answer");
        await pc.setLocalDescription(answer);
        spablaTrace("PC_SET_LOCAL_ANSWER", { signalingState: pc.signalingState });
        socket.emit("answer", { roomId: conversationId, answer });
      } catch (err: any) {
        console.error("[SPABLA][NEG] offer handler ERROR:", err);
        spablaTrace("PC_RECEIVE_OFFER", { error: true, errorMessage: err?.message ?? String(err) });
      }
    });

    socket.on("answer", async (d: { answer: RTCSessionDescriptionInit }) => {
      console.log(`[SPABLA][WEBRTC][ANSWER_RECEIVED] signalingState:${pc.signalingState}`);
      spablaTrace("PC_RECEIVE_ANSWER", { signalingState: pc.signalingState });
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(d.answer));
      } catch (err: any) {
        console.error("[SPABLA][NEG] answer handler ERROR:", err);
        spablaTrace("PC_RECEIVE_ANSWER", { error: true, errorMessage: err?.message ?? String(err) });
      }
    });

    let _iceRecvThrottle = 0;
    socket.on("ice-candidate", async (d: { candidate: RTCIceCandidateInit }) => {
      console.log("[SPABLA][WEBRTC][ICE_RECEIVED]");
      const now = performance.now();
      if (now - _iceRecvThrottle >= 2000) {
        spablaTrace("PC_ICE_CANDIDATE", { direction: "incoming", throttled: true });
        _iceRecvThrottle = now;
      }
      try { await pc.addIceCandidate(d.candidate); } catch {}
    });

    // 5 — Local transcription → caption + emit subtitle to room
    socket.on("transcript-result", async ({
      text, isFinal, serverWillTranslate,
    }: { text: string; isFinal?: boolean; serverWillTranslate?: boolean }) => {
      if (endingRef.current) return;
      if (Date.now() < sttWarmupUntilRef.current) {
        console.log("[STT] warmup — ignoring result isFinal:", isFinal, "text:", (text ?? "").substring(0, 45));
        return;
      }
      spablaTrace("TRANSCRIPT_RESULT", { isFinal: !!isFinal, serverWillTranslate: !!serverWillTranslate, textLength: (text ?? "").length });
      spablaTrace("TR_SERVER_WILL_TRANSLATE", {
        serverWillTranslate: !!serverWillTranslate,
        isFinal: !!isFinal,
        textLength: (text ?? "").length,
        myLang: myLangRef.current,
        targetLang: targetLangRef.current,
      });
      console.log("[STT CLIENT] transcript-result received | isFinal:", isFinal, "| text:", (text ?? "").substring(0, 45));
      console.log(`[R2-AUDIT] CLIENT_RECV isFinal=${isFinal} text="${(text ?? "").substring(0,80)}"`); // [R2-AUDIT]

      const original = text?.trim();

      // Partial: update local caption only, do not translate
      if (!isFinal) {
        if (original) {
          setLocalCaption({ text: original, original, partial: true });
        }
        return;
      }

      // isFinal === true from here
      setLocalCaption(null);
      lastPartialTranscriptRef.current = "";

      if (!original) {
        console.log("[STT CLIENT] final ignored no fallback");
        return;
      }

      const finalOriginal = original;
      console.log("[STT CLIENT] final processed:", finalOriginal.substring(0, 45));

      // ── Experimento server-side: servidor ya traducirá y emitirá subtitle ──
      if (serverWillTranslate) {
        if (endingRef.current) return;
        console.log(`[R2-AUDIT] BUBBLE_CREATE speaker=local path=server text="${finalOriginal.substring(0,80)}"`); // [R2-AUDIT]
        spablaTrace("TR_BUBBLE_TEXT", {
          speaker: "local",
          path: "server",
          textLength: finalOriginal.length,
          textPreview: finalOriginal.substring(0, 60),
          myLang: myLangRef.current,
          targetLang: targetLangRef.current,
        });
        setCaptionsHistory(prev => [...prev, {
          id: Date.now().toString(), speaker: "local", text: finalOriginal, original: finalOriginal,
        }]);
        return;
      }

      // ── Flujo actual (cliente traduce) ──────────────────────────────────────
      const from = myLangRef.current;
      const to   = targetLangRef.current;
      let translated = finalOriginal;

      if (to && from !== to) {
        const _tStart = Date.now();
        console.log("[STT CLIENT] translating final | from:", from, "to:", to);
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const res = await fetch("/api/translate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session?.access_token ?? ""}`,
            },
            body: JSON.stringify({ text: finalOriginal, from, to }),
          });
          const data = await res.json();
          translated = data.translation || finalOriginal;
          console.log("[STT CLIENT] translation ok:", translated.substring(0, 45));
        } catch { }
        console.log(`[STT CLIENT] [TIMING] translate=${Date.now()-_tStart}ms`);
      }

      // Guard 3 — re-check after awaits: endCall() may have run during translate fetch
      if (endingRef.current) return;

      // Dedup — skip if this exact text was emitted locally within the last 4 s
      const _nowLocal = Date.now();
      const _lastLocal = lastLocalEmitRef.current;
      if (_lastLocal && _lastLocal.text === finalOriginal && _nowLocal - _lastLocal.ts < 4000) {
        console.log("[STT] dedup-skip local:", finalOriginal.substring(0, 45));
        return;
      }
      lastLocalEmitRef.current = { text: finalOriginal, ts: _nowLocal };

      console.log("[STT CLIENT] adding captionsHistory:", finalOriginal.substring(0, 45));
      console.log(`[R2-AUDIT] BUBBLE_CREATE speaker=local path=client text="${finalOriginal.substring(0,80)}"`); // [R2-AUDIT]
      spablaTrace("TR_BUBBLE_TEXT", {
        speaker: "local",
        path: "client",
        textLength: finalOriginal.length,
        textPreview: finalOriginal.substring(0, 60),
        myLang: myLangRef.current,
        targetLang: targetLangRef.current,
      });
      setCaptionsHistory(prev => [...prev, {
        id: Date.now().toString(), speaker: "local", text: finalOriginal, original: finalOriginal,
      }]);

      console.log("[STT CLIENT] subtitle emitted | original:", finalOriginal.substring(0, 30), "translated:", translated.substring(0, 30));
      spablaTrace("TR_TEXT_OUT", {
        from: "client-subtitle-emit",
        originalLength: finalOriginal.length,
        originalPreview: finalOriginal.substring(0, 60),
        translatedLength: translated.length,
        translatedPreview: translated.substring(0, 60),
        fromLang: from,
        targetLang: to,
        wasTranslated: translated !== finalOriginal,
      });
      socket.emit("subtitle", { roomId: conversationId, original: finalOriginal, translated, fromLang: from });
    });

    // 6 — Incoming subtitle from remote participant (already translated by the sender)
    socket.on("subtitle", (payload: {
      original?: string; translated?: string;
      _timings?: { translateMs: number; serverEmitMs: number };
      // B1: when true, the server is streaming translated audio via translated-audio-chunk,
      // so the local TTS speak() must NOT fire (avoids dual playback / overlap).
      serverWillStreamAudio?: boolean;
    }) => {
      if (endingRef.current) return;
      spablaTrace("SUBTITLE_RECEIVED", {
        hasOriginal: !!payload.original,
        hasTranslated: !!payload.translated,
        translatedLength: (payload.translated ?? "").length,
        serverWillStreamAudio: !!payload.serverWillStreamAudio,
      });
      spablaTrace("TR_TEXT_IN", {
        from: "subtitle-received",
        originalLength: (payload.original ?? "").length,
        originalPreview: (payload.original ?? "").substring(0, 60),
        translatedLength: (payload.translated ?? "").length,
        translatedPreview: (payload.translated ?? "").substring(0, 60),
        looksLikeEcho: !!payload.original && !!payload.translated && payload.original.trim() === payload.translated.trim(),
        myLang: myLangRef.current,
        targetLang: targetLangRef.current,
      });
      // Timing del experimento server-side
      if (payload._timings) {
        const networkMs = Date.now() - payload._timings.serverEmitMs;
        console.log(`[TIMING:server] translate=${payload._timings.translateMs}ms network=${networkMs}ms total=${payload._timings.translateMs + networkMs}ms`);
      }

      const text      = (payload.translated || payload.original || "").trim();
      const rawSpoken = (payload.original || text).trim();
      if (!text) return;

      // Dedup — skip if this exact text was received remotely within the last 4 s
      const _nowRemote = Date.now();
      const _lastRemote = lastRemoteRecvRef.current;
      if (_lastRemote && _lastRemote.text === text && _nowRemote - _lastRemote.ts < 4000) {
        console.log("[STT] dedup-skip remote:", text.substring(0, 45));
        return;
      }
      lastRemoteRecvRef.current = { text, ts: _nowRemote };

      console.log(`[TRACE-4] remote received subtitle text="${text.substring(0,60)}"`);
      console.log("[STT CLIENT] subtitle received | text:", text.substring(0, 40));
      // Guard before TTS + bubble — subtitle handler entry already checks endingRef,
      // but re-check here in case any async microtask ran between entry and this point.
      if (endingRef.current) return;

      // TTS — sólo si está activado y hay texto traducido final (nunca parcial)
      console.log("[TTS] subtitle received | text:", text.substring(0, 40));
      console.log("[TTS] voiceEnabled:", voiceEnabledRef.current, "serverWillStreamAudio:", !!payload.serverWillStreamAudio);
      if (voiceEnabledRef.current && !payload.serverWillStreamAudio) {
        console.log("[TTS] speak() invoked | text:", text.substring(0, 40));
        speak(text, myLangRef.current);
      } else {
        console.log("[TTS] speak() skipped — voiceEnabled=false or serverWillStreamAudio=true");
      }

      // Append to conversation history — remote speaker, text is already in our language
      console.log(`[TRACE-5] creating bubble text="${text.substring(0,60)}"`);
      spablaTrace("TR_BUBBLE_TEXT", {
        speaker: "remote",
        path: "subtitle-in",
        textLength: text.length,
        textPreview: text.substring(0, 60),
        originalLength: rawSpoken.length,
        originalPreview: rawSpoken.substring(0, 60),
        looksLikeEcho: text.trim() === rawSpoken.trim(),
        myLang: myLangRef.current,
        targetLang: targetLangRef.current,
      });
      setCaptionsHistory(prev => [...prev, {
        id:      Date.now().toString(),
        speaker: "remote",
        text,
        original: rawSpoken,
      }]);
      setRemoteCaption(null);
    });

    // 7 — B1: streaming translated audio (only emitted by server when USE_REALTIME_SPEECH=true).
    // With the flag off, this handler is registered but never fires — zero behavioural change.
    let _tacCount = 0;
    let _tacBytes = 0;
    let _tacLastTrace = 0;
    socket.on("translated-audio-chunk", (payload: { audio?: string }) => {
      if (endingRef.current) return;
      if (!voiceEnabledRef.current) return;
      if (!payload?.audio) return;
      _tacCount++;
      _tacBytes += payload.audio.length;
      const now = performance.now();
      if (now - _tacLastTrace >= 1000) {
        spablaTrace("TRANSLATED_AUDIO_CHUNK_RECEIVED", { chunksPerSec: _tacCount, bytesPerSec: _tacBytes, throttled: true });
        _tacCount = 0; _tacBytes = 0; _tacLastTrace = now;
      }
      playTranslatedPcmChunk(payload.audio);
    });

    // In-call video upgrade signal: peer added a video track and renegotiated.
    // We flip remoteHasVideo so page.tsx can setVideoActive(true) and mount the
    // <VideoOverlay>. The actual video track arrives via pc.ontrack from the
    // offer/answer exchange that the peer initiated in parallel.
    socket.on("video-enabled", () => {
      spablaTrace("VIDEO_ENABLED_FROM_PEER", {});
      setRemoteHasVideo(true);
    });

  }, [conversationId]);

  // iOS Safari: this MUST run synchronously inside a user gesture (button click) or the
  // AudioContext will be created but stay state=suspended, silencing ScriptProcessor
  // buffers. Call this from handlePhoneButton / handleCameraButton alongside unlockAudio().
  // On desktop it is a cheap no-op equivalent.
  const unlockCapture = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      let created = false;
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        audioCtxRef.current = new AudioCtx({ sampleRate: 48000 });
        created = true;
        spablaTrace("AUDIO_CONTEXT_CREATE", { from: "unlockCapture", sampleRate: audioCtxRef.current.sampleRate, state: audioCtxRef.current.state });
        try { (audioCtxRef.current as AudioContext).onstatechange = () => spablaTrace("AUDIO_CONTEXT_STATE_CHANGE", { state: audioCtxRef.current?.state ?? null }); } catch { /* noop */ }
      }
      const ctx = audioCtxRef.current;
      spablaTrace("AUDIO_CONTEXT_RESUME_REQUEST", { from: "unlockCapture", stateBefore: ctx.state, created });
      ctx.resume().then(
        () => spablaTrace("AUDIO_CONTEXT_RESUME_SUCCESS", { from: "unlockCapture", stateAfter: ctx.state }),
        (err: any) => spablaTrace("AUDIO_CONTEXT_RESUME_ERROR", { from: "unlockCapture", errorMessage: err?.message ?? String(err) }),
      ).catch(() => {});
      // iOS unlock trick: schedule a 1-sample silent buffer inside this same gesture.
      // Without this, iOS keeps the ctx nominally "running" but the graph does not fire.
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      console.log("[TRACE AUDIO CONTEXT] unlockCapture (in-gesture) | state=", ctx.state, "sampleRate=", ctx.sampleRate);
    } catch (err: any) {
      console.warn("[TRACE AUDIO CONTEXT] unlockCapture failed:", err?.message ?? err);
      spablaTrace("AUDIO_CONTEXT_RESUME_ERROR", { from: "unlockCapture", threw: true, errorMessage: err?.message ?? String(err) });
    }
  }, []);

  // iOS Safari: AudioContext suspends when the tab backgrounds (home button / lock).
  // On return, resume() from an event handler works because visibilitychange counts
  // as a user-attention event on iOS 16+. Without this, the mic goes permanently silent
  // for the rest of the call after any background/foreground cycle.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handler = () => {
      if (document.visibilityState !== "visible") return;
      const ctx = audioCtxRef.current;
      if (!ctx || ctx.state === "closed") return;
      spablaTrace("AUDIO_CONTEXT_RESUME_REQUEST", { from: "visibilitychange", stateBefore: ctx.state });
      ctx.resume().then(
        () => { console.log("[SPABLA][iOS] visibilitychange → ctx resumed | state=", ctx.state); spablaTrace("AUDIO_CONTEXT_RESUME_SUCCESS", { from: "visibilitychange", stateAfter: ctx.state }); },
        (err) => { console.warn("[SPABLA][iOS] visibilitychange resume failed:", err?.message ?? err); spablaTrace("AUDIO_CONTEXT_RESUME_ERROR", { from: "visibilitychange", errorMessage: err?.message ?? String(err) }); },
      );
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const mainTrack = stream.getAudioTracks()[0];
    if (!mainTrack) return;
    const newEnabled = !mainTrack.enabled;
    // Mute the WebRTC track (what the peer hears in raw) AND the dedicated capture stream
    // (what feeds the translation pipeline). Both must flip together or "Muted" would still
    // send audio to translation, or vice versa.
    stream.getAudioTracks().forEach((t) => { t.enabled = newEnabled; });
    captureStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = newEnabled; });
    setMicOn(newEnabled);
  }, []);

  const toggleCam = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; setCamOn(t.enabled); });
  }, []);

  // In-call video upgrade. Adds a video track to the EXISTING PeerConnection
  // without touching the audio path (B1 mic capture + translated audio remain
  // untouched — they live on a separate Socket.IO channel, not on the PC).
  //
  // Flow:
  //   1. getUserMedia({ video: true, audio: false }) — camera only.
  //   2. Add the video track to the shared localStream and to the PC via
  //      pc.addTrack (creates a new sender for the video m-section).
  //   3. Emit a NEW offer via socket — the peer's existing socket.on("offer")
  //      handler will setRemoteDescription + createAnswer + emit answer.
  //   4. Emit "video-enabled" so the peer flips remoteHasVideo → mounts
  //      <VideoOverlay> to display the incoming video track.
  //
  // Returns false and logs if: no active PC / socket, or the pc.signalingState
  // is not "stable" (glare guard — caller can try again shortly).
  const enableVideo = useCallback(async (): Promise<boolean> => {
    const pc = pcRef.current;
    const socket = socketRef.current;
    const existingStream = localStreamRef.current;
    if (!pc || !socket?.connected || !existingStream) {
      spablaTrace("ENABLE_VIDEO", { aborted: "no-active-call", hasPc: !!pc, socketConnected: !!socket?.connected, hasStream: !!existingStream });
      return false;
    }
    if (existingStream.getVideoTracks().length > 0) {
      spablaTrace("ENABLE_VIDEO", { aborted: "already-has-video" });
      return true;
    }
    if (pc.signalingState !== "stable") {
      spablaTrace("ENABLE_VIDEO", { aborted: "signaling-not-stable", state: pc.signalingState });
      return false;
    }
    spablaTrace("ENABLE_VIDEO", { step: "gum-request" });
    let camStream: MediaStream;
    try {
      camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch (err: any) {
      spablaTrace("ENABLE_VIDEO", { aborted: "gum-error", errorName: err?.name ?? null, errorMessage: err?.message ?? String(err) });
      setError(`Sin acceso a cámara: ${err?.name} — ${err?.message}`);
      return false;
    }
    const videoTrack = camStream.getVideoTracks()[0];
    if (!videoTrack) {
      spablaTrace("ENABLE_VIDEO", { aborted: "no-video-track-in-gum" });
      return false;
    }
    spablaTrace("ENABLE_VIDEO", { step: "add-track", track: traceTrack(videoTrack) });
    existingStream.addTrack(videoTrack);
    try {
      pc.addTrack(videoTrack, existingStream);
    } catch (err: any) {
      spablaTrace("ENABLE_VIDEO", { aborted: "addTrack-error", errorMessage: err?.message ?? String(err) });
      return false;
    }
    // Force a React re-render of consumers watching localStream so <video srcObject>
    // rebinds and shows the new video track in the local pip.
    setLocalStream(new MediaStream(existingStream.getTracks()));
    setCamOn(true);
    spablaTrace("ENABLE_VIDEO", { step: "renegotiate", signalingState: pc.signalingState });
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("offer", { roomId: conversationId, offer });
    } catch (err: any) {
      spablaTrace("ENABLE_VIDEO", { aborted: "renegotiate-error", errorMessage: err?.message ?? String(err) });
      return false;
    }
    socket.emit("video-enabled", { roomId: conversationId });
    spablaTrace("ENABLE_VIDEO", { step: "done" });
    return true;
  }, [conversationId]);

  // Cleanup on unmount
  useEffect(() => () => endCall(), [endCall]);

  return {
    localStream, remoteStream, connected, hasRemote, micOn, camOn, error,
    localCaption, remoteCaption, captionsHistory,
    callEndedSignal,
    startCall, endCall, toggleMic, toggleCam, unlockCapture,
    enableVideo, remoteHasVideo,
  };
}
