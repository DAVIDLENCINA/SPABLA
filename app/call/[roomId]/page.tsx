"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { io, Socket } from "socket.io-client";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "https://spabla-server.onrender.com";

const LANGS = {
  es: { emoji: "🇪🇸", label: "Español", deepgram: "es" },
  en: { emoji: "🇬🇧", label: "English", deepgram: "en-US" },
} as const;

type LangCode = keyof typeof LANGS;

type Caption = {
  id: number;
  speaker: "local" | "remote";
  original: string;
  translated: string;
  from: LangCode;
  to: LangCode;
  partial?: boolean;
  time: string;
};

function otherLang(lang: LangCode): LangCode { return lang === "es" ? "en" : "es"; }
function normalizeLang(lang?: string): LangCode { return lang?.startsWith("en") ? "en" : "es"; }
function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

async function translate(text: string, from: LangCode, to: LangCode): Promise<string> {
  if (!text.trim() || from === to) return text;
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`
    );
    const data = await res.json();
    return data?.responseData?.translatedText || text;
  } catch { return text; }
}

const FLAG: Record<LangCode, string> = { es: "🇪🇸", en: "🇬🇧" };

export default function CallPage() {
  const { roomId } = useParams<{ roomId: string }>();

  const localVideoRef  = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const socketRef      = useRef<Socket | null>(null);
  const pcRef          = useRef<RTCPeerConnection | null>(null);
  const streamRef      = useRef<MediaStream | null>(null);
  const audioCtxRef    = useRef<AudioContext | null>(null);
  const processorRef   = useRef<ScriptProcessorNode | null>(null);
  const sourceRef      = useRef<MediaStreamAudioSourceNode | null>(null);
  const hideLocalRef   = useRef<number | null>(null);
  const hideRemoteRef  = useRef<number | null>(null);

  const [myLang,        setMyLang]        = useState<LangCode>("es");
  const [localCaption,  setLocalCaption]  = useState<Caption | null>(null);
  const [remoteCaption, setRemoteCaption] = useState<Caption | null>(null);
  const [micOn,         setMicOn]         = useState(true);
  const [camOn,         setCamOn]         = useState(true);
  const [connected,     setConnected]     = useState(false);
  const [hasRemote,     setHasRemote]     = useState(false);

  function showLocal(next: Caption) {
    setLocalCaption(next);
    if (hideLocalRef.current) window.clearTimeout(hideLocalRef.current);
    if (!next.partial) hideLocalRef.current = window.setTimeout(() => setLocalCaption(null), 6500);
  }

  function showRemote(next: Caption) {
    setRemoteCaption(next);
    if (hideRemoteRef.current) window.clearTimeout(hideRemoteRef.current);
    if (!next.partial) hideRemoteRef.current = window.setTimeout(() => setRemoteCaption(null), 6500);
  }

  function stopDeepgram() {
    socketRef.current?.emit("transcribe-stop");
    try { processorRef.current?.disconnect(); sourceRef.current?.disconnect(); audioCtxRef.current?.close(); } catch {}
    processorRef.current = null; sourceRef.current = null; audioCtxRef.current = null;
  }

  function startDeepgram(lang: LangCode) {
    const socket = socketRef.current;
    const stream = streamRef.current;
    if (!socket || !stream) return;
    stopDeepgram();
    socket.emit("transcribe-start", { roomId, lang: LANGS[lang].deepgram });
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx({ sampleRate: 48000 });
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    audioCtxRef.current = ctx; sourceRef.current = source; processorRef.current = processor;
    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) { const s = Math.max(-1, Math.min(1, input[i])); pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
      socket.emit("audio-chunk", pcm.buffer);
    };
    source.connect(processor); processor.connect(ctx.destination); ctx.resume().catch(() => {});
  }

  useEffect(() => {
    let cancelled = false;

    async function startCall() {
      const socket = io(SERVER_URL, { transports: ["websocket", "polling"] });
      socketRef.current = socket;
      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      pcRef.current = pc;
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (cancelled) return;
      streamRef.current = stream;
      setMicOn(stream.getAudioTracks().some((t) => t.enabled));
      setCamOn(stream.getVideoTracks().some((t) => t.enabled));
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      if (localVideoRef.current) { localVideoRef.current.srcObject = stream; localVideoRef.current.play().catch(() => {}); }

      pc.ontrack = (e) => {
        const rs = e.streams[0];
        if (remoteVideoRef.current) { remoteVideoRef.current.srcObject = rs; remoteVideoRef.current.play().catch(() => {}); setHasRemote(true); }
      };
      pc.onicecandidate = (e) => { if (e.candidate) socket.emit("ice-candidate", { roomId, candidate: e.candidate }); };

      socket.on("connect", () => { setConnected(true); socket.emit("join-room", roomId); startDeepgram(myLang); });
      socket.on("disconnect", () => setConnected(false));
      socket.on("user-joined", async () => { const o = await pc.createOffer(); await pc.setLocalDescription(o); socket.emit("offer", { roomId, offer: o }); });
      socket.on("offer", async (d) => { await pc.setRemoteDescription(new RTCSessionDescription(d.offer)); const a = await pc.createAnswer(); await pc.setLocalDescription(a); socket.emit("answer", { roomId, answer: a }); });
      socket.on("answer", async (d) => { await pc.setRemoteDescription(new RTCSessionDescription(d.answer)); });
      socket.on("ice-candidate", async (d) => { try { await pc.addIceCandidate(d.candidate); } catch {} });

      socket.on("transcript-result", async ({ text, isFinal, lang }: { text: string; isFinal?: boolean; lang?: string }) => {
        const original = text?.trim();
        if (!original) return;
        const from = normalizeLang(lang || myLang);
        const to = otherLang(from);
        if (!isFinal) {
          showLocal({ id: Date.now(), speaker: "local", original, translated: original, from, to, partial: true, time: nowTime() });
          return;
        }
        const translated = await translate(original, from, to);
        showLocal({ id: Date.now(), speaker: "local", original, translated, from, to, time: nowTime() });
        socket.emit("subtitle", { roomId, original, lang: from });
      });

      socket.on("subtitle", async (payload: { original?: string; text?: string; lang?: string }) => {
        const original = (payload.original || payload.text || "").trim();
        if (!original) return;
        const from = normalizeLang(payload.lang || otherLang(myLang));
        const translated = await translate(original, from, myLang);
        showRemote({ id: Date.now(), speaker: "remote", original, translated, from, to: myLang, time: nowTime() });
      });
    }

    startCall();
    return () => {
      cancelled = true;
      if (hideLocalRef.current) window.clearTimeout(hideLocalRef.current);
      if (hideRemoteRef.current) window.clearTimeout(hideRemoteRef.current);
      stopDeepgram();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      socketRef.current?.disconnect();
      pcRef.current?.close();
    };
  }, [roomId, myLang]);

  function toggleMic() { streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; setMicOn(t.enabled); }); }
  function toggleCam() { streamRef.current?.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; setCamOn(t.enabled); }); }
  function hangUp() { stopDeepgram(); streamRef.current?.getTracks().forEach((t) => t.stop()); socketRef.current?.disconnect(); pcRef.current?.close(); window.location.href = "/"; }
  function switchLang() { setMyLang(otherLang(myLang)); }
  function share() {
    if (navigator.share) navigator.share({ title: "SPABLA", url: window.location.href }).catch(() => {});
    else { navigator.clipboard.writeText(window.location.href); }
  }

  return (
    <main style={{ background: "#000", width: "100vw", height: "100svh", overflow: "hidden", position: "relative", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" }}>

      {/* Vídeo remoto fullscreen */}
      <video ref={remoteVideoRef} autoPlay playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: hasRemote ? 1 : 0, transition: "opacity .5s", zIndex: 1 }}/>

      {/* Vídeo local */}
      <video ref={localVideoRef} autoPlay muted playsInline style={{
        position: "absolute",
        inset: hasRemote ? "auto" : 0,
        top: hasRemote ? 22 : 0, right: hasRemote ? 22 : 0,
        width: hasRemote ? "min(28vw, 180px)" : "100%",
        height: hasRemote ? "auto" : "100%",
        aspectRatio: hasRemote ? "3 / 4" : "auto",
        objectFit: "cover",
        borderRadius: hasRemote ? 24 : 0,
        border: hasRemote ? "2px solid rgba(0,212,255,.75)" : "none",
        filter: hasRemote ? "none" : "brightness(.62) saturate(.85)",
        zIndex: hasRemote ? 20 : 2,
        boxShadow: hasRemote ? "0 16px 40px rgba(0,0,0,.55)" : "none",
        transition: "all .4s ease",
      }}/>

      {/* Overlay */}
      <div style={{ position: "absolute", inset: 0, zIndex: 3, pointerEvents: "none", background: "linear-gradient(to bottom, rgba(0,0,0,.28) 0%, rgba(0,0,0,.0) 30%, rgba(0,0,0,.60) 68%, rgba(0,0,0,.97) 100%)" }}/>

      {/* Waiting state */}
      {!hasRemote && (
        <section style={{ position: "absolute", inset: 0, zIndex: 8, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
          <div>
            <h1 style={{ color: "#fff", fontSize: "clamp(28px, 7vw, 56px)", fontWeight: 900, margin: 0, letterSpacing: "-.04em" }}>Esperando participante</h1>
            <p style={{ color: "rgba(255,255,255,.6)", fontSize: "clamp(14px, 3.5vw, 22px)", marginTop: 12 }}>Comparte el enlace para empezar</p>
          </div>
        </section>
      )}

      {/* Header top */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "max(14px, env(safe-area-inset-top)) 16px 0" }}>
        {/* Badge idioma */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#fff", fontSize: 13, fontWeight: 700, background: "rgba(0,0,0,.52)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 999, padding: "8px 14px", backdropFilter: "blur(18px)" }}>
          <span>{LANGS[myLang].emoji}</span>
          <span>{LANGS[myLang].label}</span>
          <span style={{ color: connected ? "#41ff9d" : "#ff5c6a", fontSize: 10 }}>●</span>
        </div>
        {/* Compartir */}
        <button onClick={share} style={{ background: "rgba(0,0,0,.52)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 999, padding: "8px 16px", color: "rgba(255,255,255,.80)", fontSize: 13, fontWeight: 600, cursor: "pointer", backdropFilter: "blur(18px)" }}>
          Compartir
        </button>
      </div>

      {/* SUBTÍTULOS */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: "clamp(130px, 19vh, 200px)", zIndex: 65, pointerEvents: "none", display: "flex", flexDirection: "column", gap: 20, padding: "0 clamp(16px, 4vw, 28px)" }}>
        {[localCaption, remoteCaption].map((cap) => {
          if (!cap) return null;
          const isLocal = cap.speaker === "local";
          const accent = isLocal ? "#00E5FF" : "#FF6B8A";
          const flagTo = FLAG[cap.to] ?? FLAG[cap.from];
          const flagFrom = FLAG[cap.from];
          return (
            <div key={cap.speaker} style={{ animation: "captionIn .22s ease-out both" }}>
              {/* nombre · hora */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ color: accent, fontWeight: 800, fontSize: "clamp(13px, 3vw, 16px)" }}>{isLocal ? "Tú" : "Participante"}</span>
                <span style={{ color: "#8E8E93", fontSize: 9 }}>•</span>
                <span style={{ color: "#8E8E93", fontSize: "clamp(11px, 2.5vw, 14px)", fontVariantNumeric: "tabular-nums" }}>{cap.time}</span>
              </div>
              {/* emoji bandera + texto */}
              <div style={{ display: "flex", alignItems: "center", gap: "clamp(10px, 2.5vw, 14px)" }}>
                <span style={{ fontSize: "clamp(28px, 7vw, 40px)", lineHeight: 1, flexShrink: 0 }}>{flagTo}</span>
                <span style={{ color: "#fff", fontSize: "clamp(22px, 5.5vw, 36px)", lineHeight: 1.1, fontWeight: 650, letterSpacing: "-.03em", textShadow: "0 3px 20px rgba(0,0,0,.70)", opacity: cap.partial ? 0.6 : 1, transition: "opacity .2s" }}>
                  {cap.partial ? cap.original : cap.translated}
                </span>
              </div>
              {/* original en cursiva */}
              {!cap.partial && cap.original !== cap.translated && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, paddingLeft: "clamp(38px, 9vw, 54px)", color: "rgba(255,255,255,.45)", fontSize: "clamp(12px, 2.8vw, 16px)", fontStyle: "italic" }}>
                  <span style={{ fontSize: "clamp(14px, 3.5vw, 20px)" }}>{flagFrom}</span>
                  <span>{cap.original}</span>
                </div>
              )}
              {/* línea */}
              <div style={{ marginTop: 8, height: 2, borderRadius: 999, background: isLocal ? "linear-gradient(90deg, transparent, #00E5FF, transparent)" : "linear-gradient(90deg, transparent, #FF6B8A, transparent)", animation: "wave 2s ease-in-out infinite" }}/>
            </div>
          );
        })}
      </div>

      {/* CONTROLES FLOTANTES */}
      <nav style={{ position: "absolute", bottom: "max(28px, env(safe-area-inset-bottom, 28px))", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "flex-end", gap: "clamp(14px, 3.5vw, 24px)", zIndex: 70, maxWidth: "calc(100vw - 32px)" }}>

        <CtrlBtn onClick={toggleMic} label="Micrófono" danger={!micOn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            {micOn ? <><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0014 0M12 19v3M9 22h6"/></> : <><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/><path d="M17 16.95A7 7 0 015 10v-1m14 0v1a7 7 0 01-.11 1.23M12 19v3M9 22h6"/></>}
          </svg>
        </CtrlBtn>

        <CtrlBtn onClick={toggleCam} label="Cámara" danger={!camOn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            {camOn ? <><path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14"/><rect x="2" y="7" width="13" height="10" rx="2"/></> : <><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 01-2-2V8m3-3h10l2 3h1a2 2 0 012 2v6.5"/></>}
          </svg>
        </CtrlBtn>

        {/* Colgar — central más grande */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
          <button onClick={hangUp} style={{ width: "clamp(64px, 16vw, 78px)", height: "clamp(64px, 16vw, 78px)", borderRadius: "50%", background: "radial-gradient(circle at 38% 35%, #ff5569, #e8162e)", border: "none", boxShadow: "0 0 0 1px rgba(255,92,106,.40), 0 0 32px rgba(255,40,60,.60), 0 8px 28px rgba(0,0,0,.65)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 01-2.18 2A19.79 19.79 0 0111.82 19a19.5 19.5 0 01-6-6A19.79 19.79 0 013 4.18 2 2 0 015 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L9.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
            </svg>
          </button>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,.45)", letterSpacing: ".04em" }}>Colgar</span>
        </div>

        <CtrlBtn onClick={switchLang} label="Cambiar idioma">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.80)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3L4 7l4 4M16 21l4-4-4-4M4 7h16M4 17h16"/>
          </svg>
        </CtrlBtn>

      </nav>

      <style>{`
        @keyframes captionIn { from { opacity:0; transform:translateY(10px) scale(.98); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes wave { 0%,100% { opacity:.5; } 50% { opacity:1; } }
      `}</style>
    </main>
  );
}

function CtrlBtn({ onClick, label, danger, children }: { onClick: () => void; label: string; danger?: boolean; children: React.ReactNode; }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, flexShrink: 0 }}>
      <button onClick={onClick} style={{ width: "clamp(52px, 13vw, 64px)", height: "clamp(52px, 13vw, 64px)", borderRadius: "50%", background: danger ? "rgba(255,50,70,.80)" : "rgba(255,255,255,.10)", border: `1.5px solid ${danger ? "rgba(255,60,80,.55)" : "rgba(255,255,255,.18)"}`, backdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, boxShadow: "0 4px 20px rgba(0,0,0,.40)" }}>
        {children}
      </button>
      <span style={{ fontSize: 10, color: "rgba(255,255,255,.42)", letterSpacing: ".03em", whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}
