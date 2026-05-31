import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

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

export type WebRTCState = {
  localStream:   MediaStream | null;
  remoteStream:  MediaStream | null;
  connected:     boolean;
  hasRemote:     boolean;
  micOn:         boolean;
  camOn:         boolean;
  error:         string | null;
  localCaption:  Caption | null;
  remoteCaption: Caption | null;
  startCall:     () => Promise<void>;
  endCall:       () => void;
  toggleMic:     () => void;
  toggleCam:     () => void;
};

export function useWebRTC(
  conversationId: string | null,
  myLang: string,
  targetLang: string | null,
): WebRTCState {
  // Core WebRTC refs
  const socketRef      = useRef<Socket | null>(null);
  const pcRef          = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

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

  // Fix 6 — watchdog interval for connection health monitoring
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [localStream,   setLocalStream]   = useState<MediaStream | null>(null);
  const [remoteStream,  setRemoteStream]  = useState<MediaStream | null>(null);
  const [connected,     setConnected]     = useState(false);
  const [hasRemote,     setHasRemote]     = useState(false);
  const [micOn,         setMicOn]         = useState(true);
  const [camOn,         setCamOn]         = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [localCaption,  setLocalCaption]  = useState<Caption | null>(null);
  const [remoteCaption, setRemoteCaption] = useState<Caption | null>(null);

  // Keep lang refs in sync when props change between renders
  useEffect(() => { myLangRef.current = myLang; },         [myLang]);
  useEffect(() => { targetLangRef.current = targetLang; }, [targetLang]);

  // Fix A — restart Deepgram when the user changes language during an active call.
  // Without this, Deepgram keeps transcribing in the old language and produces
  // empty/wrong transcripts → no captions, no translation, no subtitles for the remote.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return; // no active call — nothing to restart
    socket.emit("transcribe-stop");
    socket.emit("transcribe-start", { lang: DEEPGRAM_LANG[myLang] ?? myLang });
    console.log("[SPABLA][DG] language changed →", myLang, "— Deepgram session restarted");
  }, [myLang]);

  const endCall = useCallback(() => {
    // Stop watchdog
    if (watchdogRef.current) { clearInterval(watchdogRef.current); watchdogRef.current = null; }

    // Stop Deepgram and audio processing
    socketRef.current?.emit("transcribe-stop");
    try {
      processorRef.current?.disconnect();
      sourceRef.current?.disconnect();
      audioCtxRef.current?.close();
    } catch {}
    processorRef.current = null;
    sourceRef.current    = null;
    audioCtxRef.current  = null;

    // Clear caption timers
    if (hideLocalRef.current)  clearTimeout(hideLocalRef.current);
    if (hideRemoteRef.current) clearTimeout(hideRemoteRef.current);

    // Stop tracks, socket, peer connection
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    socketRef.current?.disconnect();
    pcRef.current?.close();

    // Reset all state
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setHasRemote(false);
    setConnected(false);
    setLocalCaption(null);
    setRemoteCaption(null);
  }, []);

  const startCall = useCallback(async () => {
    if (socketRef.current?.connected) return;
    if (!conversationId) return;

    setError(null);

    // 1 — Acquire media
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (err: any) {
      setError(`Sin acceso a cámara/micrófono: ${err?.name} — ${err?.message}`);
      return;
    }
    localStreamRef.current = stream;
    setLocalStream(stream);
    setMicOn(true);
    setCamOn(true);

    // 2 — PeerConnection (ICE servers fetched server-side — no credentials in client bundle)
    const iceServers = await fetchIceServers();
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    pc.ontrack = (e) => {
      setRemoteStream(e.streams[0]);
      setHasRemote(true);
      // Fix 5 — monitor remote track lifecycle to detect freeze source
      const ts = () => new Date().toISOString().slice(11, 23);
      e.track.onended  = () => { console.warn(`[SPABLA][TRACK] ${ts()} ended:`, e.track.kind);   setHasRemote(false); };
      e.track.onmute   = () =>   console.warn(`[SPABLA][TRACK] ${ts()} muted:`,   e.track.kind);
      e.track.onunmute = () =>   console.log( `[SPABLA][TRACK] ${ts()} unmuted:`, e.track.kind);
    };

    // ICE diagnostics — visible in browser console during calls
    pc.oniceconnectionstatechange = () => {
      console.log("[SPABLA][ICE] iceConnectionState →", pc.iceConnectionState);
      if (pc.iceConnectionState === "failed") {
        console.error("[SPABLA][ICE] connection failed — likely missing TURN server for cross-network calls");
      }
    };
    pc.onconnectionstatechange = () => {
      console.log("[SPABLA][ICE] connectionState →", pc.connectionState);
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

    // 3 — Signaling socket
    const socket = io(SERVER_URL, { transports: ["polling", "websocket"] });
    socketRef.current = socket;

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit("ice-candidate", { roomId: conversationId, candidate: e.candidate });
    };

    socket.on("connect", () => {
      const connTs = new Date().toISOString().slice(11, 23);
      console.log(`[SPABLA][SOCK] ${connTs} socket connected`);
      setConnected(true);
      socket.emit("join-room", conversationId);

      // Start Deepgram transcription session for this user's language
      socket.emit("transcribe-start", {
        lang: DEEPGRAM_LANG[myLangRef.current] ?? myLangRef.current,
      });

      // Fix 1 — close any existing audio pipeline BEFORE creating a new one.
      // socket.on("connect") fires on every (re)connection. Without this, each
      // reconnect adds a new AudioContext that keeps running in parallel,
      // multiplying the audio-chunk emission rate and saturating the socket buffer.
      try {
        processorRef.current?.disconnect();
        sourceRef.current?.disconnect();
        audioCtxRef.current?.close();
      } catch {}
      processorRef.current = null;
      sourceRef.current    = null;
      audioCtxRef.current  = null;

      // Start audio capture → PCM chunks → socket
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx({ sampleRate: 48000 });
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (e) => {
        // Fix 2 — drop chunks while socket is offline to prevent buffer accumulation
        if (!socket.connected) return;
        const input = e.inputBuffer.getChannelData(0);
        const pcm = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
          const s = Math.max(-1, Math.min(1, input[i]));
          pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        socket.emit("audio-chunk", pcm.buffer);
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

    socket.on("disconnect", () => setConnected(false));

    // 4 — WebRTC negotiation
    socket.on("user-joined", async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("offer", { roomId: conversationId, offer });
    });

    socket.on("offer", async (d: { offer: RTCSessionDescriptionInit }) => {
      await pc.setRemoteDescription(new RTCSessionDescription(d.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("answer", { roomId: conversationId, answer });
    });

    socket.on("answer", async (d: { answer: RTCSessionDescriptionInit }) => {
      await pc.setRemoteDescription(new RTCSessionDescription(d.answer));
    });

    socket.on("ice-candidate", async (d: { candidate: RTCIceCandidateInit }) => {
      try { await pc.addIceCandidate(d.candidate); } catch {}
    });

    // 5 — Local transcription → caption + emit subtitle to room
    socket.on("transcript-result", async ({ text, isFinal }: { text: string; isFinal?: boolean }) => {
      const original = text?.trim();
      if (!original) return;

      // Partial result: show as live feedback, no translation yet
      if (!isFinal) {
        setLocalCaption({ text: original, original, partial: true });
        return;
      }

      // Final result: show original immediately, then translate and emit
      setLocalCaption({ text: original, original, partial: false });
      if (hideLocalRef.current) clearTimeout(hideLocalRef.current);
      hideLocalRef.current = setTimeout(() => setLocalCaption(null), 6500);

      const from = myLangRef.current;
      const to   = targetLangRef.current;
      let translated = original;

      if (to && from !== to) {
        try {
          const res = await fetch("/api/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: original, from, to }),
          });
          const data = await res.json();
          translated = data.translation || original;
        } catch {
          // translation failed — emit original so the other participant sees something
        }
      }

      socket.emit("subtitle", {
        roomId:   conversationId,
        original,
        translated,
        fromLang: from,
      });
    });

    // 6 — Incoming subtitle from remote participant (already translated by the sender)
    socket.on("subtitle", (payload: { original?: string; translated?: string }) => {
      const text = (payload.translated || payload.original || "").trim();
      if (!text) return;
      setRemoteCaption({ text, original: (payload.original || text).trim(), partial: false });
      if (hideRemoteRef.current) clearTimeout(hideRemoteRef.current);
      hideRemoteRef.current = setTimeout(() => setRemoteCaption(null), 6500);
    });

  }, [conversationId]);

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; setMicOn(t.enabled); });
  }, []);

  const toggleCam = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; setCamOn(t.enabled); });
  }, []);

  // Cleanup on unmount
  useEffect(() => () => endCall(), [endCall]);

  return {
    localStream, remoteStream, connected, hasRemote, micOn, camOn, error,
    localCaption, remoteCaption,
    startCall, endCall, toggleMic, toggleCam,
  };
}
