import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "https://spabla-server.onrender.com";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "turn:openrelay.metered.ca:80",               username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443",              username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
];

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
  useEffect(() => { myLangRef.current = myLang; },       [myLang]);
  useEffect(() => { targetLangRef.current = targetLang; }, [targetLang]);

  const endCall = useCallback(() => {
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

    // 2 — PeerConnection
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    pc.ontrack = (e) => {
      setRemoteStream(e.streams[0]);
      setHasRemote(true);
    };

    // 3 — Signaling socket
    const socket = io(SERVER_URL, { transports: ["polling", "websocket"] });
    socketRef.current = socket;

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit("ice-candidate", { roomId: conversationId, candidate: e.candidate });
    };

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join-room", conversationId);

      // Start Deepgram transcription session for this user's language
      socket.emit("transcribe-start", {
        lang: DEEPGRAM_LANG[myLangRef.current] ?? myLangRef.current,
      });

      // Start audio capture → PCM chunks → socket
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx({ sampleRate: 48000 });
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (e) => {
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
