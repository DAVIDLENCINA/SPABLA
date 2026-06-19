import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { supabase } from "@/lib/supabase";
import { useTranslatedSpeech } from "./useTranslatedSpeech";

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

  const { speak, cancel: cancelTTS } = useTranslatedSpeech();
  const voiceEnabledRef = useRef(voiceEnabled);

  // Keep lang refs in sync when props change between renders
  useEffect(() => { myLangRef.current = myLang; },             [myLang]);
  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
    console.log("[TTS] voiceEnabled →", voiceEnabled);
  }, [voiceEnabled]);
  useEffect(() => {
    targetLangRef.current = targetLang;
    // Notificar al servidor cuando cambia el idioma destino (experimento server-side)
    if (socketRef.current?.connected) {
      socketRef.current.emit("update-target-lang", targetLang);
    }
  }, [targetLang]);

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
    if (endingRef.current) return;
    console.trace("[SPABLA][ENDCALL] called from:");
    endingRef.current = true;
    setCallEndedSignal(prev => prev + 1);

    // Stop watchdog
    if (watchdogRef.current) { clearInterval(watchdogRef.current); watchdogRef.current = null; }

    // Stop TTS if speaking
    cancelTTS();

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
    setCaptionsHistory([]);  // clear history only on hang-up, not on minimize
    startingRef.current = false;
    socketRef.current = null;
    pcRef.current = null;
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
    }
    audioCtxRef.current.resume().catch(() => {});
    console.log("[TRACE AUDIO CONTEXT] created in gesture | state=", audioCtxRef.current.state, "sampleRate=", audioCtxRef.current.sampleRate);

    // 1 — Acquire media
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: mode === 'video', audio: true });
    } catch (err: any) {
      startingRef.current = false;
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
      const audioTracks = e.streams[0]?.getAudioTracks() ?? [];
      console.log(`[SPABLA][WEBRTC][TRACK] kind:${e.track.kind} streams:${e.streams.length} audio:${audioTracks.length}`);
      setRemoteStream(e.streams[0]);
      setHasRemote(true);
      // Fix 5 — monitor remote track lifecycle to detect freeze source
      const ts = () => new Date().toISOString().slice(11, 23);
      e.track.onended  = () => { console.warn(`[SPABLA][TRACK] ${ts()} ended:`, e.track.kind);   setHasRemote(false); endCall(); };
      e.track.onmute   = () =>   console.warn(`[SPABLA][TRACK] ${ts()} muted:`,   e.track.kind);
      e.track.onunmute = () =>   console.log( `[SPABLA][TRACK] ${ts()} unmuted:`, e.track.kind);
    };

    // ICE diagnostics — visible in browser console during calls
    pc.oniceconnectionstatechange = () => {
      console.log("[SPABLA][ICE] iceConnectionState →", pc.iceConnectionState);
      if (pc.iceConnectionState === "failed") {
        console.error("[SPABLA][ICE] connection failed — likely missing TURN server for cross-network calls");
        endCall();
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

    // 3 — Signaling socket — token en el handshake para que el middleware lo valide
    const { data: { session: callSession } } = await supabase.auth.getSession();
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
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("offer", { roomId: conversationId, offer });
        console.log("[SPABLA][WEBRTC][OFFER_SENT]");
      } catch (err) {
        console.error("[SPABLA][WEBRTC][CREATE_OFFER_ERROR]:", err);
        hasCreatedOfferRef.current = false;
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        console.log("[SPABLA][WEBRTC][ICE_SENT]", e.candidate.type);
        socket.emit("ice-candidate", { roomId: conversationId, candidate: e.candidate });
      }
    };

    socket.on("connect", () => {
      const connTs = new Date().toISOString().slice(11, 23);
      console.log(`[SPABLA][SOCK] ${connTs} socket connected`);
      setConnected(true);
      console.log("[SPABLA][ROOM] emitting join-room", conversationId);
      socket.emit("join-room", conversationId, (ack: { ok: boolean; error?: string }) => {
        console.log("[SPABLA][ROOM] join-room ack:", ack);
      });

      // Start Deepgram transcription — incluir idiomas para experimento server-side
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

      // Log mic track health before building the pipeline
      const _audioTracks = stream.getAudioTracks();
      if (_audioTracks[0]) {
        const _t = _audioTracks[0];
        console.log(`[TRACE MIC TRACK] enabled=${_t.enabled} muted=${_t.muted} readyState=${_t.readyState}`);
      }

      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      let _lastAudioLog = 0;
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
        const _now = Date.now();
        if (_now - _lastAudioLog >= 2000) {
          _lastAudioLog = _now;
          let sumSq = 0, nonZero = 0;
          for (let i = 0; i < input.length; i++) { sumSq += input[i] * input[i]; if (input[i] !== 0) nonZero++; }
          const rms = Math.sqrt(sumSq / input.length);
          console.log(`[TRACE AUDIO CLIENT] sampleRate=${ctx.sampleRate} samples=${input.length} rms=${rms.toFixed(4)} nonZero=${Math.round(nonZero / input.length * 100)}%`);
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
      if (conversationId) socket.emit("join-room", conversationId);
      if (localStreamRef.current) {
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
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(d.offer));
        console.log(`[SPABLA][NEG] setRemoteDescription(offer) OK | signalingState:${pc.signalingState}`);
        const answer = await pc.createAnswer();
        console.log("[SPABLA][NEG] createAnswer OK — enviando answer");
        await pc.setLocalDescription(answer);
        socket.emit("answer", { roomId: conversationId, answer });
      } catch (err) {
        console.error("[SPABLA][NEG] offer handler ERROR:", err);
      }
    });

    socket.on("answer", async (d: { answer: RTCSessionDescriptionInit }) => {
      console.log(`[SPABLA][WEBRTC][ANSWER_RECEIVED] signalingState:${pc.signalingState}`);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(d.answer));
      } catch (err) {
        console.error("[SPABLA][NEG] answer handler ERROR:", err);
      }
    });

    socket.on("ice-candidate", async (d: { candidate: RTCIceCandidateInit }) => {
      console.log("[SPABLA][WEBRTC][ICE_RECEIVED]");
      try { await pc.addIceCandidate(d.candidate); } catch {}
    });

    // 5 — Local transcription → caption + emit subtitle to room
    socket.on("transcript-result", async ({
      text, isFinal, serverWillTranslate,
    }: { text: string; isFinal?: boolean; serverWillTranslate?: boolean }) => {
      console.log("[STT CLIENT] transcript-result received | isFinal:", isFinal, "| text:", (text ?? "").substring(0, 45));

      const original  = text?.trim();
      const fallback  = lastPartialTranscriptRef.current?.trim();
      const finalOriginal = original || (isFinal ? fallback : "");

      // Always clear the partial caption when a final arrives, even if text is empty.
      if (isFinal) {
        setLocalCaption(null);
      }

      if (!isFinal) {
        if (original) {
          lastPartialTranscriptRef.current = original;
          console.log("[STT CLIENT] partial stored:", original.substring(0, 45));
          setLocalCaption({ text: original, original, partial: true });
        }
        return;
      }

      // isFinal === true from here
      if (!finalOriginal) {
        console.log("[STT CLIENT] final ignored no fallback");
        return;
      }

      if (!original && fallback) {
        console.log("[STT CLIENT] empty final using fallback:", fallback.substring(0, 45));
      } else {
        console.log("[STT CLIENT] final processed:", finalOriginal.substring(0, 45));
      }

      lastPartialTranscriptRef.current = "";

      // ── Experimento server-side: servidor ya traducirá y emitirá subtitle ──
      if (serverWillTranslate) {
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

      console.log("[STT CLIENT] adding captionsHistory:", finalOriginal.substring(0, 45));
      setCaptionsHistory(prev => [...prev, {
        id: Date.now().toString(), speaker: "local", text: finalOriginal, original: finalOriginal,
      }]);

      console.log("[STT CLIENT] subtitle emitted | original:", finalOriginal.substring(0, 30), "translated:", translated.substring(0, 30));
      socket.emit("subtitle", { roomId: conversationId, original: finalOriginal, translated, fromLang: from });
    });

    // 6 — Incoming subtitle from remote participant (already translated by the sender)
    socket.on("subtitle", (payload: {
      original?: string; translated?: string;
      _timings?: { translateMs: number; serverEmitMs: number };
    }) => {
      // Timing del experimento server-side
      if (payload._timings) {
        const networkMs = Date.now() - payload._timings.serverEmitMs;
        console.log(`[TIMING:server] translate=${payload._timings.translateMs}ms network=${networkMs}ms total=${payload._timings.translateMs + networkMs}ms`);
      }

      const text      = (payload.translated || payload.original || "").trim();
      const rawSpoken = (payload.original || text).trim();
      if (!text) return;

      console.log(`[TRACE-4] remote received subtitle text="${text.substring(0,60)}"`);
      console.log("[STT CLIENT] subtitle received | text:", text.substring(0, 40));
      // TTS — sólo si está activado y hay texto traducido final (nunca parcial)
      console.log("[TTS] subtitle received | text:", text.substring(0, 40));
      console.log("[TTS] voiceEnabled:", voiceEnabledRef.current);
      if (voiceEnabledRef.current) {
        speak(text, myLangRef.current);
      }

      // Append to conversation history — remote speaker, text is already in our language
      console.log(`[TRACE-5] creating bubble text="${text.substring(0,60)}"`);
      setCaptionsHistory(prev => [...prev, {
        id:      Date.now().toString(),
        speaker: "remote",
        text,
        original: rawSpoken,
      }]);
      setRemoteCaption(null);
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
    localCaption, remoteCaption, captionsHistory,
    callEndedSignal,
    startCall, endCall, toggleMic, toggleCam,
  };
}
