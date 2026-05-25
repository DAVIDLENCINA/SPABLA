"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { GLOTConnection } from "@/lib/webrtc";
const C = "#00D4E8";
const R = "#FF5C6A";
const LANGS: Record<string, { flag: string; label: string; deepgram: string }> = {
  es: { flag: "🇪🇸", label: "Español", deepgram: "es" },
  en: { flag: "🇬🇧", label: "English", deepgram: "en-US" },
  fr: { flag: "🇫🇷", label: "Français", deepgram: "fr" },
  de: { flag: "🇩🇪", label: "Deutsch", deepgram: "de" },
};
type Speaker = "local" | "remote";
type CallMode = "video" | "voice";
type ConnectionState = "connecting" | "waiting" | "connected" | "reconnecting" | "ended";
interface SubtitleEntry {
  id: number;
  speaker: Speaker;
  original: string;
  translated: string;
  flag: string;
  time: string;
}
async function translate(text: string, from: string, to: string): Promise<string> {
  if (!text.trim() || from === to) return text;
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`
    );
    const data = await res.json();
    return data?.responseData?.translatedText || text;
  } catch { return text; }
}
function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
export default function CallPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const searchParams = useSearchParams();
  const mode = (searchParams.get("mode") === "voice" ? "voice" : "video") as CallMode;
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localPreviewRef = useRef<HTMLVideoElement>(null);
  const localBackgroundRef = useRef<HTMLVideoElement>(null);
  const glotRef = useRef<GLOTConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const subtitleIdRef = useRef(0);
  const callStartRef = useRef(Date.now());
  const [fromLang, setFromLang] = useState("es");
  const [toLang, setToLang] = useState("en");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(mode === "video");
  const [ccOn, setCcOn] = useState(true);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [subtitles, setSubtitles] = useState<SubtitleEntry[]>([]);
  const [elapsed, setElapsed] = useState("0:00");
  const [showLangModal, setShowLangModal] = useState(false);
  const [toast, setToast] = useState("");
  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.href;
  }, []);
  useEffect(() => {
    callStartRef.current = Date.now();
    const id = window.setInterval(() => {
      const s = Math.floor((Date.now() - callStartRef.current) / 1000);
      setElapsed(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2400);
  }
  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: "SPABLA", text: "Únete a mi conversación traducida en tiempo real.", url: inviteUrl });
      } else {
        await navigator.clipboard.writeText(inviteUrl);
        showToast("Enlace copiado");
      }
    } catch {}
  }
  function toggleMic() {
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !track.enabled; setMicOn(track.enabled); });
  }
  function toggleCam() {
    localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = !track.enabled; setCamOn(track.enabled); });
  }
  function stopDeepgram() {
    socketRef.current?.emit("transcribe-stop");
    processorRef.current?.disconnect();
    audioCtxRef.current?.close();
    processorRef.current = null;
    audioCtxRef.current = null;
  }
  function hangUp() {
    setConnectionState("ended");
    stopDeepgram();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    glotRef.current?.close();
    socketRef.current?.disconnect();
    window.location.href = "/";
  }
  function addSubtitle(entry: SubtitleEntry) {
    setSubtitles((prev) => [...prev.slice(-1), entry]);
    window.setTimeout(() => { setSubtitles((prev) => prev.filter((item) => item.id !== entry.id)); }, 6000);
  }
  function startDeepgram(lang: string) {
    const socket = socketRef.current;
    const stream = localStreamRef.current;
    if (!socket || !stream) return;
    socket.emit("transcribe-start", { lang: LANGS[lang].deepgram });
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx({ sampleRate: 48000 });
    ctx.resume();
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;
    processor.onaudioprocess = (event) => {
      const f32 = event.inputBuffer.getChannelData(0);
      const i16 = new Int16Array(f32.length);
      for (let i = 0; i < f32.length; i += 1) { i16[i] = Math.max(-32768, Math.min(32767, f32[i] * 32768)); }
      socket.emit("audio-chunk", i16.buffer);
    };
    source.connect(processor);
    processor.connect(ctx.destination);
  }
  useEffect(() => {
    if (!roomId) return;
    let mounted = true;
    let remoteUserId: string | null = null;
    const socket = io(process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001", { transports: ["polling"] });
    socketRef.current = socket;
    const glot = new GLOTConnection();
    glotRef.current = glot;
    const pc = glot.getConnection();
    pc.onconnectionstatechange = () => {
      if (!mounted) return;
      if (pc.connectionState === "connected") setConnectionState("connected");
      if (pc.connectionState === "connecting") setConnectionState("connecting");
      if (pc.connectionState === "disconnected") setConnectionState("reconnecting");
      if (pc.connectionState === "failed") setConnectionState("reconnecting");
    };
    pc.ontrack = (event) => {
      if (!mounted) return;
      const [stream] = event.streams;
      if (remoteVideoRef.current && stream) {
        remoteVideoRef.current.srcObject = stream;
        setHasRemoteVideo(true);
        setConnectionState("connected");
      }
    };
    pc.onicecandidate = (event) => {
      if (event.candidate && remoteUserId) { socket.emit("ice-candidate", { to: remoteUserId, candidate: event.candidate }); }
    };
    socket.on("connect", () => setConnectionState("waiting"));
    socket.on("transcript-result", async ({ text, isFinal }: { text: string; isFinal: boolean }) => {
      if (!text.trim() || !isFinal) return;
      const translated = await translate(text, fromLang, toLang);
      addSubtitle({ id: ++subtitleIdRef.current, speaker: "local", original: text, translated, flag: LANGS[fromLang]?.flag, time: nowTime() });
    });
    socket.on("subtitle", async ({ text, lang }: { text: string; lang: string }) => {
      if (!text.trim()) return;
      const translated = await translate(text, lang, toLang);
      addSubtitle({ id: ++subtitleIdRef.current, speaker: "remote", original: text, translated, flag: LANGS[lang]?.flag || "🌐", time: nowTime() });
    });
    async function start() {
<<<<<<< HEAD
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: mode === "video", audio: true });
        if (!mounted) return;
        localStreamRef.current = stream;
        setCamOn(mode === "video" && stream.getVideoTracks().some((track) => track.enabled));
        if (localPreviewRef.current) localPreviewRef.current.srcObject = stream;
        if (localBackgroundRef.current) localBackgroundRef.current.srcObject = stream;
        glot.addLocalStream(stream);
        socket.emit("join-room", roomId);
        startDeepgram(fromLang);
      } catch { showToast("No se pudo acceder a cámara o micrófono"); }
=======
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
    if (localVideoRef.current) {
  localVideoRef.current.srcObject = stream;
  localVideoRef.current.play().catch(() => {});
}

if (localVideoMobileRef.current) {
  localVideoMobileRef.current.srcObject = stream;
  localVideoMobileRef.current.play().catch(() => {});
}
if (remoteVideoRef.current && !remoteVideoRef.current.srcObject) {
  remoteVideoRef.current.srcObject = stream;
  remoteVideoRef.current.play().catch(() => {});
}
      glot.addLocalStream(stream);
      socket.emit("join-room", roomId);
>>>>>>> 80ceafa (fix: show local video as waiting background)
    }
    socket.on("user-joined", async (userId: string) => {
      remoteUserId = userId;
      setConnectionState("connecting");
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("offer", { to: userId, offer });
    });
    socket.on("offer", async ({ from, offer }: any) => {
      remoteUserId = from;
      setConnectionState("connecting");
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("answer", { to: from, answer });
    });
    socket.on("answer", async ({ answer }: any) => { await pc.setRemoteDescription(answer); });
    socket.on("ice-candidate", async ({ candidate }: any) => { await pc.addIceCandidate(candidate); });
    start();
    return () => {
      mounted = false;
      stopDeepgram();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      glot.close();
      socket.disconnect();
    };
  }, [roomId, mode]);

  return (
<<<<<<< HEAD
    <main className="fixed inset-0 isolate h-[100svh] w-screen overflow-hidden bg-black text-white antialiased">
      <CallStyles />

      {/* WaitingLayer: visible cuando no hay vídeo remoto */}
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{ opacity: hasRemoteVideo ? 0 : 1, pointerEvents: hasRemoteVideo ? "none" : "auto", zIndex: hasRemoteVideo ? 0 : 10 }}
      >
        <WaitingLayer localBackgroundRef={localBackgroundRef} mode={mode} onShare={share} />
      </div>

      {/* ActiveLayer: visible cuando hay vídeo remoto */}
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{ opacity: hasRemoteVideo ? 1 : 0, pointerEvents: hasRemoteVideo ? "auto" : "none", zIndex: hasRemoteVideo ? 10 : 0 }}
      >
        <ActiveLayer remoteVideoRef={remoteVideoRef} />
      </div>

      <TopBar elapsed={elapsed} onShare={share} />

      <LocalPreview
        refVideo={localPreviewRef}
        mode={mode}
        camOn={camOn}
        micOn={micOn}
        flag={LANGS[fromLang]?.flag}
      />

      {ccOn && hasRemoteVideo && (
        <SubtitleStack
          subtitles={subtitles}
          fallbackState={connectionState}
          fromLabel={LANGS[fromLang]?.label}
        />
      )}

      <BottomControls
        micOn={micOn}
        camOn={camOn}
        ccOn={ccOn}
        mode={mode}
        fromLabel={LANGS[fromLang]?.label}
        onToggleMic={toggleMic}
        onToggleCam={toggleCam}
        onHangUp={hangUp}
        onToggleCc={() => setCcOn((prev) => !prev)}
        onChangeLanguage={() => setShowLangModal(true)}
      />

      {showLangModal && (
        <LanguageModal
          fromLang={fromLang}
          toLang={toLang}
          onFromLang={setFromLang}
          onToLang={setToLang}
          onClose={() => setShowLangModal(false)}
        />
      )}
      {toast && <Toast>{toast}</Toast>}
    </main>
  );
}

// ── WAITING LAYER ──────────────────────────────────────────────────────────────
function WaitingLayer({
  localBackgroundRef,
  mode,
  onShare,
}: {
  localBackgroundRef: React.RefObject<HTMLVideoElement>;
  mode: CallMode;
  onShare: () => void;
}) {
  return (
    <section className="absolute inset-0 overflow-hidden">
      {/* Local video as full-screen background */}
      <video
        ref={localBackgroundRef}
        autoPlay
        muted
        playsInline
        className="absolute inset-0 h-full w-full scale-105 object-cover"
        style={{ filter: "brightness(.55) contrast(.88) saturate(.65)" }}
      />
      {/* Cinematic overlays */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,.40)_0%,rgba(0,0,0,.10)_30%,rgba(0,0,0,.60)_68%,rgba(0,0,0,.97)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,.65)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_80%,rgba(0,212,232,.09),transparent_32%),radial-gradient(circle_at_80%_85%,rgba(255,92,106,.07),transparent_28%)]" />

      {/* Center content */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-6 text-center px-6 w-full max-w-sm">
        {/* Animated rings */}
        <div className="relative flex items-center justify-center">
          <div className="h-20 w-20 rounded-full border border-white/10 bg-white/[.04] backdrop-blur-xl shadow-[0_0_80px_rgba(0,212,232,.18)]" />
          <div className="absolute h-32 w-32 animate-spablaPulse rounded-full border border-cyan-300/10" />
          <div className="absolute h-44 w-44 animate-spablaPulseSlow rounded-full border border-cyan-300/[.05]" />
          <svg className="absolute" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.45)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-lg font-semibold text-white/90 tracking-tight">Esperando participante</p>
          <p className="text-sm text-white/40 leading-relaxed">
            Comparte el enlace para iniciar<br />la conversación traducida
          </p>
        </div>

        {/* Share CTA */}
        <button
          onClick={onShare}
          className="flex items-center gap-2.5 rounded-full border border-cyan-300/35 bg-cyan-400/15 px-6 py-3 text-sm font-medium text-cyan-200 shadow-[0_0_32px_rgba(0,212,232,.18)] backdrop-blur-xl transition-transform active:scale-95"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
          Compartir enlace
        </button>
      </div>
    </section>
  );
}

// ── ACTIVE LAYER ───────────────────────────────────────────────────────────────
function ActiveLayer({
  remoteVideoRef,
}: {
  remoteVideoRef: React.RefObject<HTMLVideoElement>;
}) {
  return (
    <section className="absolute inset-0 overflow-hidden">
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className="absolute inset-0 h-full w-full scale-[1.02] object-cover"
        style={{ filter: "brightness(.75) contrast(.92) saturate(.70)" }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,.30)_0%,rgba(0,0,0,.04)_22%,rgba(0,0,0,.55)_60%,rgba(0,0,0,.97)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,.60)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_92%,rgba(0,212,232,.07),transparent_26%),radial-gradient(circle_at_88%_95%,rgba(255,92,106,.06),transparent_24%)]" />
    </section>
  );
}

// ── REST OF COMPONENTS (unchanged) ────────────────────────────────────────────
function VoiceOnlyAura() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="h-[44vmin] w-[44vmin] rounded-full border border-cyan-300/15 bg-white/[.03] blur-[1px]" />
      <div className="absolute h-[34vmin] w-[34vmin] animate-spablaPulse rounded-full bg-cyan-300/10 blur-3xl" />
      <div className="absolute h-[28vmin] w-[28vmin] animate-spablaPulseSlow rounded-full bg-rose-400/10 blur-3xl" />
    </div>
  );
}
function TopBar({ elapsed, onShare }: { elapsed: string; onShare: () => void }) {
  return (
    <header className="absolute left-0 right-0 top-0 z-30 flex max-w-[100vw] items-center justify-between gap-2 overflow-hidden px-4 pt-[max(14px,env(safe-area-inset-top))]">
      <img src="/SPABLA_LOGO.png" alt="SPABLA" className="h-[clamp(20px,5vw,26px)] shrink-0 opacity-95" />
      <div className="flex min-w-0 shrink-0 items-center gap-1.5">
        <StatusPill />
        <span className="rounded-full border border-white/10 bg-black/50 px-[clamp(8px,2vw,12px)] py-1.5 text-[clamp(10px,2.5vw,12px)] text-white/65 backdrop-blur-xl">
          {elapsed}
        </span>
        <button
          onClick={onShare}
          className="rounded-full border border-white/15 bg-black/50 px-[clamp(8px,2vw,13px)] py-1.5 text-[clamp(10px,2.5vw,12px)] text-white/75 backdrop-blur-xl active:scale-95"
        >
          Compartir
        </button>
      </div>
    </header>
  );
}
function StatusPill() {
  return (
    <div className="hidden items-center gap-1.5 rounded-full border border-cyan-300/30 bg-black/55 px-3 py-1.5 backdrop-blur-xl min-[390px]:flex">
      <WaveIcon color={C} />
      <span className="whitespace-nowrap text-[11px] text-cyan-300">Traducción activa</span>
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
    </div>
  );
}
function LocalPreview({
  refVideo, mode, camOn, micOn, flag,
}: {
  refVideo: React.RefObject<HTMLVideoElement>;
  mode: CallMode; camOn: boolean; micOn: boolean; flag: string;
}) {
  if (mode === "voice") {
    return (
      <aside className="absolute right-4 top-[max(68px,calc(env(safe-area-inset-top)+54px))] z-30 flex h-[clamp(90px,22vw,140px)] w-[clamp(90px,22vw,140px)] items-center justify-center rounded-[clamp(16px,4vw,22px)] border border-cyan-300/30 bg-black/45 backdrop-blur-2xl shadow-[0_12px_44px_rgba(0,0,0,.7)]">
        <span className="text-3xl">{flag}</span>
        <MicDot active={micOn} />
      </aside>
    );
  }
  return (
    <aside className="absolute right-4 top-[max(68px,calc(env(safe-area-inset-top)+54px))] z-30 aspect-[3/4] w-[clamp(90px,22vw,140px)] overflow-hidden rounded-[clamp(12px,3vw,18px)] border-2 border-cyan-300/40 shadow-[0_0_0_1px_rgba(0,212,232,.07),0_12px_40px_rgba(0,0,0,.85),0_0_12px_rgba(0,212,232,.06)]">
      <video ref={refVideo} autoPlay muted playsInline className="h-full w-full object-cover" />
      {!camOn && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-[#0a0b14] to-[#111320]">
          <span className="text-[clamp(16px,4vw,24px)]">{flag}</span>
          <span className="text-[9px] text-white/30">Sin cámara</span>
        </div>
      )}
      <MicDot active={micOn} />
    </aside>
  );
}
function MicDot({ active }: { active: boolean }) {
  return (
    <span
      className={`absolute bottom-1.5 right-1.5 h-2 w-2 rounded-full ${active ? "bg-green-400" : "bg-rose-400"}`}
      style={{ boxShadow: active ? "0 0 8px rgba(74,222,128,.9)" : `0 0 8px ${R}` }}
    />
  );
}
function SubtitleStack({ subtitles, fallbackState, fromLabel }: {
  subtitles: SubtitleEntry[]; fallbackState: ConnectionState; fromLabel: string;
}) {
  if (subtitles.length === 0) {
    return (
      <section className="pointer-events-none absolute bottom-[clamp(160px,23vh,225px)] left-0 right-0 z-20 flex justify-center px-5">
        <div className="max-w-[calc(100vw-48px)] rounded-3xl border border-white/10 bg-black/35 px-5 py-3 text-center backdrop-blur-2xl">
          <p className="text-sm font-medium text-white/60">
            {fallbackState === "connected" ? "Habla para comenzar" : "Preparando traducción"}
          </p>
          <p className="mt-1 text-xs text-cyan-200/45">{fromLabel}</p>
        </div>
      </section>
    );
  }
  return (
    <section className="pointer-events-none absolute bottom-[clamp(155px,22vh,215px)] left-0 right-0 z-20 flex flex-col gap-[clamp(6px,1.5vw,10px)] px-[clamp(16px,4vw,24px)]">
      {subtitles.map((subtitle, index) => (
        <SubtitleCard key={subtitle.id} subtitle={subtitle} isLast={index === subtitles.length - 1} />
      ))}
    </section>
  );
}
function SubtitleCard({ subtitle, isLast }: { subtitle: SubtitleEntry; isLast: boolean }) {
  const isLocal = subtitle.speaker === "local";
  const accent = isLocal ? C : R;
  return (
    <article className={`max-w-[calc(100vw-48px)] transition duration-300 ${isLast ? "animate-subIn opacity-100" : "scale-[.97] opacity-40"}`}>
      <div className="mb-1 flex items-center gap-1.5 pl-0.5">
        <span className="text-[clamp(10px,2.5vw,12px)] font-bold uppercase tracking-[.05em]" style={{ color: accent }}>
          {isLocal ? "Tú" : "Participante"}
        </span>
        <span className="text-[clamp(9px,2vw,10px)] text-white/30">· {subtitle.time}</span>
      </div>
      <div className="rounded-[clamp(10px,2.5vw,14px)] border-l-[3px] bg-black/60 px-[clamp(10px,2.5vw,14px)] py-[clamp(7px,1.8vw,10px)] shadow-[0_2px_16px_rgba(0,0,0,.40)] backdrop-blur-2xl" style={{ borderLeftColor: accent }}>
        <div className="mb-1 flex items-center gap-2">
          <span className="shrink-0 text-[clamp(14px,3.5vw,18px)] leading-none">{subtitle.flag}</span>
          <p className="text-[clamp(10px,2.5vw,12px)] italic leading-snug text-white/40">{subtitle.original}</p>
        </div>
        <p className="pl-[clamp(20px,4.5vw,26px)] text-[clamp(15px,4vw,20px)] font-bold leading-snug tracking-[-.01em] text-white" style={{ textShadow: `0 0 20px ${accent}30` }}>
          {subtitle.translated}
        </p>
        <div className="mt-1.5 h-[1px] rounded-full" style={{ background: `linear-gradient(to right, ${accent}60, transparent)` }} />
      </div>
    </article>
  );
}
function BottomControls({
  micOn, camOn, ccOn, mode, fromLabel,
  onToggleMic, onToggleCam, onHangUp, onToggleCc, onChangeLanguage,
}: {
  micOn: boolean; camOn: boolean; ccOn: boolean; mode: CallMode; fromLabel: string;
  onToggleMic: () => void; onToggleCam: () => void; onHangUp: () => void;
  onToggleCc: () => void; onChangeLanguage: () => void;
}) {
  return (
    <footer className="absolute bottom-0 left-0 right-0 z-30 flex max-w-[100vw] flex-col items-center gap-[clamp(10px,2vh,16px)] overflow-hidden px-4 pb-[max(24px,calc(env(safe-area-inset-bottom)+18px))]">
      <div className="flex items-center gap-1.5">
        <WaveIcon color={C} />
        <span className="text-[clamp(10px,2.5vw,12px)] text-cyan-300/80">Hablando en {fromLabel}</span>
      </div>
      <nav className="flex max-w-[calc(100vw-32px)] items-center gap-[clamp(8px,2.5vw,14px)] overflow-hidden rounded-[clamp(20px,5vw,32px)] border border-white/10 bg-[#080912]/80 px-[clamp(14px,4vw,24px)] py-[clamp(12px,3vw,16px)] shadow-[0_-4px_48px_rgba(0,0,0,.55),inset_0_1px_0_rgba(255,255,255,.07)] backdrop-blur-3xl">
        <RoundButton onClick={onToggleMic} label="Micrófono" danger={!micOn}><MicIcon muted={!micOn} /></RoundButton>
        <RoundButton onClick={onToggleCam} label="Cámara" danger={!camOn} disabled={mode === "voice"}><CameraIcon off={!camOn || mode === "voice"} /></RoundButton>
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <button onClick={onHangUp} className="flex h-[clamp(52px,14vw,68px)] w-[clamp(52px,14vw,68px)] items-center justify-center rounded-full bg-gradient-to-br from-[#ff3f55] to-[#ff5c6a] shadow-[0_0_0_1px_rgba(255,92,106,.35),0_6px_28px_rgba(255,60,80,.55)] active:scale-95">
            <PhoneIcon />
          </button>
          <span className="whitespace-nowrap text-[clamp(9px,2vw,10px)] tracking-[.04em] text-white/40">Colgar</span>
        </div>
        <RoundButton onClick={onToggleCc} label="Subtítulos" accent={ccOn ? C : undefined}>
          <span className="text-xs font-extrabold tracking-[.06em]" style={{ color: ccOn ? C : "rgba(255,255,255,.5)" }}>CC</span>
        </RoundButton>
        <RoundButton onClick={onChangeLanguage} label="Idioma"><LanguageIcon /></RoundButton>
      </nav>
      <p className="text-[clamp(9px,2vw,11px)] tracking-[.04em] text-white/20">🔒 Conversación privada y segura</p>
    </footer>
  );
}
function RoundButton({ onClick, label, danger, accent, disabled, children }: {
  onClick: () => void; label: string; danger?: boolean; accent?: string; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <button onClick={onClick} disabled={disabled}
        className="flex h-[clamp(46px,11vw,56px)] w-[clamp(46px,11vw,56px)] items-center justify-center rounded-full border-[1.5px] backdrop-blur-xl active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
        style={{
          background: danger ? "rgba(255,50,70,.80)" : accent ? `${accent}20` : "rgba(255,255,255,.10)",
          borderColor: danger ? "rgba(255,60,80,.55)" : accent ? `${accent}60` : "rgba(255,255,255,.14)",
          boxShadow: accent ? `0 0 20px ${accent}28` : "none",
        }}>
        {children}
      </button>
      <span className="whitespace-nowrap text-[clamp(9px,2vw,10px)] tracking-[.03em] text-white/40">{label}</span>
    </div>
  );
}
function LanguageModal({ fromLang, toLang, onFromLang, onToLang, onClose }: {
  fromLang: string; toLang: string; onFromLang: (l: string) => void; onToLang: (l: string) => void; onClose: () => void;
}) {
  return (
    <div onClick={onClose} className="absolute inset-0 z-40 flex items-end justify-center bg-black/70 px-4 pb-[max(40px,env(safe-area-inset-bottom))] backdrop-blur-xl">
      <div onClick={(e) => e.stopPropagation()} className="w-[min(420px,calc(100vw-32px))] rounded-[28px] border border-white/10 bg-[#0b0c16]/95 px-5 py-6 shadow-[0_-8px_64px_rgba(0,0,0,.65)]">
        <p className="mb-5 text-center text-[11px] uppercase tracking-[.10em] text-white/30">Idiomas</p>
        <LanguageGroup label="Tú hablas" value={fromLang} accent={C} onChange={onFromLang} />
        <LanguageGroup label="Traducir a" value={toLang} accent={R} onChange={onToLang} />
        <button onClick={onClose} className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[.07] py-3 text-[15px] text-white/80">Listo</button>
      </div>
    </div>
  );
}
function LanguageGroup({ label, value, accent, onChange }: {
  label: string; value: string; accent: string; onChange: (l: string) => void;
}) {
  return (
    <div className="mb-4">
      <p className="mb-2.5 text-[11px] tracking-[.05em] text-white/30">{label}</p>
      <div className="flex flex-wrap gap-2">
        {Object.entries(LANGS).map(([key, lang]) => {
          const active = value === key;
          return (
            <button key={key} onClick={() => onChange(key)} className="rounded-full border-[1.5px] px-4 py-2 text-sm"
              style={{
                background: active ? `${accent}22` : "rgba(255,255,255,.06)",
                borderColor: active ? accent : "rgba(255,255,255,.10)",
                color: active ? "#fff" : "rgba(255,255,255,.48)",
                boxShadow: active ? `0 0 18px ${accent}30` : "none",
              }}>
              {lang.flag} {lang.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
function Toast({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute bottom-40 left-1/2 z-50 -translate-x-1/2 animate-toastIn whitespace-nowrap rounded-full border border-white/10 bg-black/90 px-5 py-2.5 text-sm text-white backdrop-blur-xl">
      {children}
    </div>
  );
}
function WaveIcon({ color }: { color: string }) {
  return (
    <svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden="true">
      {[2, 3, 2, 5, 3, 4, 2, 3, 2].map((h, i) => (
        <rect key={i} x={i * 1.3} y={(8 - h) / 2} width=".9" height={h} rx=".4" fill={color}
          className="animate-wavePulse"
          style={{ animationDuration: `${1 + i * 0.18}s`, animationDelay: `${i * 0.1}s` }} />
      ))}
    </svg>
  );
}
function MicIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {muted ? (<><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" /><path d="M17 16.95A7 7 0 015 10v-1m14 0v1a7 7 0 01-.11 1.23M12 19v3M9 22h6" /></>)
        : (<><rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 10a7 7 0 0014 0M12 19v3M9 22h6" /></>)}
    </svg>
  );
}
function CameraIcon({ off }: { off: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {off ? (<><line x1="1" y1="1" x2="23" y2="23" /><path d="M21 21H3a2 2 0 01-2-2V8m3-3h10l2 3h1a2 2 0 012 2v6.5" /></>)
        : (<><path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14" /><rect x="2" y="7" width="13" height="10" rx="2" /></>)}
    </svg>
  );
}
function PhoneIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2A19.79 19.79 0 0111.82 19a19.5 19.5 0 01-6-6A19.79 19.79 0 013 4.18 2 2 0 015 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L9.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}
function LanguageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.75)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3L4 7l4 4M16 21l4-4-4-4M4 7h16M4 17h16" />
    </svg>
  );
}
function CallStyles() {
  return (
    <style>{`
      *, *::before, *::after { box-sizing: border-box; }
      html, body { width: 100%; min-height: 100%; overflow-x: hidden; background: #000; }
      body { overscroll-behavior: none; }
      @keyframes subIn { from { opacity: 0; transform: translateY(10px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes wavePulse { 0%, 100% { opacity: .38; } 50% { opacity: 1; } }
      @keyframes toastIn { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
      @keyframes spablaPulse { 0%, 100% { transform: scale(1); opacity: .45; } 50% { transform: scale(1.08); opacity: .75; } }
      @keyframes spablaPulseSlow { 0%, 100% { transform: scale(1); opacity: .35; } 50% { transform: scale(1.12); opacity: .62; } }
      .animate-subIn { animation: subIn .3s ease both; }
      .animate-wavePulse { animation-name: wavePulse; animation-timing-function: ease-in-out; animation-iteration-count: infinite; }
      .animate-toastIn { animation: toastIn .25s ease both; }
      .animate-spablaPulse { animation: spablaPulse 4s ease-in-out infinite; }
      .animate-spablaPulseSlow { animation: spablaPulseSlow 5.5s ease-in-out infinite; }
    `}</style>
  );
}
=======
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        html, body { overflow: hidden; overscroll-behavior: none; background: #000; }
        @keyframes subIn {
          from { opacity: 0; transform: translateY(8px) scale(.98); }
          to   { opacity: 1; transform: translateY(0)   scale(1);   }
        }
        @keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:1} }
        .sub-in { animation: subIn .28s ease both; }
        .wave-bar { animation: pulse ease-in-out infinite; }
        select { -webkit-appearance: none; appearance: none; }
        select option { background: #0d0e1a; color: #fff; }
      `}</style>

      {/* ── ROOT ── */}
      <div style={{
        position: "fixed", inset: 0,
        width: "100%", height: "100%",
        fontFamily: "-apple-system,'SF Pro Display','Helvetica Neue',sans-serif",
        WebkitFontSmoothing: "antialiased",
        background: "#000", overflow: "hidden",
      }}>

        {/* ── REMOTE VIDEO fullscreen ── */}
        <video
          ref={remoteVideoRef}
          autoPlay playsInline
          style={{
            position: "absolute", inset: 0,
            width: "100%", height: "100%",
            objectFit: "cover",
            filter: "brightness(.75) contrast(.92) saturate(.70)",
            transform: "scale(1.02)",
            zIndex: 0,
          }}
        />

        {/* mobile remote (same stream, same slot) */}
        <video
          ref={remoteVideoMobileRef}
          autoPlay playsInline
          style={{ display: "none" }}
        />

        {/* ── CINEMATIC OVERLAYS ── */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none",
          background: "linear-gradient(to bottom, rgba(0,0,0,.32) 0%, rgba(0,0,0,.04) 22%, rgba(0,0,0,.52) 60%, rgba(0,0,0,.97) 100%)",
        }}/>
        <div style={{
          position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none",
          background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,.60) 100%)",
        }}/>
        {/* ambient glow corners */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none",
          background: "radial-gradient(circle at 12% 92%, rgba(0,212,232,.07), transparent 26%), radial-gradient(circle at 88% 95%, rgba(255,92,106,.06), transparent 24%)",
        }}/>

        {/* ── TOP BAR ── */}
        <header style={{
          position: "absolute", top: 0, left: 0, right: 0,
          zIndex: 20,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "max(14px, env(safe-area-inset-top)) 16px 0",
        }}>
          <img src="/SPABLA_LOGO.png" alt="SPABLA"
            style={{ height: "clamp(20px,5vw,26px)", opacity: .95 }}/>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {/* translation status pill */}
            <div style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "rgba(0,0,0,.55)", backdropFilter: "blur(20px)",
              border: "1px solid rgba(0,212,232,.30)",
              borderRadius: 999, padding: "5px 12px",
            }}>
              {/* mini waveform */}
              <svg width="12" height="8" viewBox="0 0 12 8" fill="none" style={{ flexShrink: 0 }}>
                {[2,3,2,5,3,4,2,3,2].map((h,i) => (
                  <rect key={i} x={i*1.3} y={(8-h)/2} width=".9" height={h} rx=".4"
                    fill="#00D4E8" className="wave-bar"
                    style={{ animationDuration: `${1+i*.18}s`, animationDelay: `${i*.1}s` }}/>
                ))}
              </svg>
              <span style={{ fontSize: 11, color: "#00D4E8", whiteSpace: "nowrap" }}>
                {listening ? "Traduciendo" : "Traducción activa"}
              </span>
              <div style={{
                width: 5, height: 5, borderRadius: "50%",
                background: listening ? "#4ade80" : "#00D4E8",
                animation: "pulse 2s ease-in-out infinite",
              }}/>
            </div>
            {/* share */}
            <button onClick={copyLink} style={{
              background: "rgba(0,0,0,.52)", backdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,.14)",
              borderRadius: 999, padding: "5px 13px",
              fontSize: 11, color: "rgba(255,255,255,.75)",
              cursor: "pointer", whiteSpace: "nowrap",
            }}>
              {copied ? "✓ Copiado" : "Compartir"}
            </button>
          </div>
        </header>

        {/* ── LOCAL SELF-VIEW (top right) ── */}
        <aside style={{
          position: "absolute",
          top: "max(68px, calc(env(safe-area-inset-top) + 54px))",
          right: 16,
          width: "clamp(90px,22vw,140px)",
          aspectRatio: "3/4",
          borderRadius: "clamp(12px,3vw,18px)",
          overflow: "hidden",
          border: "2px solid rgba(0,212,232,.40)",
          boxShadow: "0 0 0 1px rgba(0,212,232,.07), 0 12px 40px rgba(0,0,0,.85), 0 0 12px rgba(0,212,232,.06)",
          zIndex: 20,
        }}>
          {/* desktop ref */}
          <video ref={localVideoRef} autoPlay muted playsInline
            style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
          {/* mobile ref (hidden, same visual slot handled above) */}
          <video ref={localVideoMobileRef} autoPlay muted playsInline
            style={{ display: "none" }}/>
          {!camOn && (
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(135deg,#0a0b14,#111320)",
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 4,
            }}>
              <span style={{ fontSize: 20 }}>🎙</span>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,.3)" }}>Sin cámara</span>
            </div>
          )}
          {/* mic dot */}
          <span style={{
            position: "absolute", bottom: 6, right: 6,
            width: 7, height: 7, borderRadius: "50%",
            background: micOn ? "#4ade80" : "#FF5C6A",
            boxShadow: micOn ? "0 0 8px rgba(74,222,128,.9)" : "0 0 8px #FF5C6A",
          }}/>
        </aside>

        {/* ── SUBTITLES ── */}
        {listening && subtitle && (
          <section style={{
            position: "absolute",
            bottom: "clamp(155px,22vh,215px)",
            left: 0, right: 0,
            padding: "0 clamp(16px,4vw,24px)",
            zIndex: 15, pointerEvents: "none",
          }}>
            <div className="sub-in" style={{
              background: "rgba(5,6,16,.72)",
              backdropFilter: "blur(32px) saturate(200%)",
              WebkitBackdropFilter: "blur(32px) saturate(200%)",
              borderRadius: "clamp(10px,2.5vw,14px)",
              borderLeft: "3px solid #00D4E8",
              padding: "clamp(7px,1.8vw,10px) clamp(10px,2.5vw,14px)",
              boxShadow: "0 2px 16px rgba(0,0,0,.40)",
              maxWidth: "calc(100vw - 48px)",
            }}>
              <p style={{
                fontSize: "clamp(15px,4vw,20px)",
                fontWeight: 700, color: "#fff", lineHeight: 1.3,
                letterSpacing: "-.01em",
                textShadow: "0 0 20px rgba(0,212,232,.30)",
              }}>{subtitle}</p>
              <div style={{
                marginTop: 6, height: 1,
                background: "linear-gradient(to right, rgba(0,212,232,.60), transparent)",
                borderRadius: 1,
              }}/>
            </div>
          </section>
        )}

        {/* ── BOTTOM CONTROLS ── */}
        <footer style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          zIndex: 20,
          display: "flex", flexDirection: "column", alignItems: "center",
          gap: "clamp(10px,2vh,14px)",
          padding: "0 16px max(24px, calc(env(safe-area-inset-bottom) + 18px))",
        }}>

          {/* language selectors row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {[
              { val: fromLang, set: setFromLang },
              null,
              { val: toLang,   set: setToLang   },
            ].map((item, i) =>
              item === null ? (
                <svg key="arrow" width="16" height="10" viewBox="0 0 16 10" fill="none">
                  <path d="M1 5h14M10 1l4 4-4 4" stroke="rgba(255,255,255,.35)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <div key={i} style={{ position: "relative" }}>
                  <select
                    value={item.val}
                    onChange={e => item.set(e.target.value)}
                    style={{
                      background: "rgba(0,0,0,.55)", backdropFilter: "blur(20px)",
                      border: "1px solid rgba(255,255,255,.14)",
                      borderRadius: 999, padding: "5px 28px 5px 12px",
                      fontSize: 12, color: "#fff", cursor: "pointer",
                    }}
                  >
                    <option value="es">🇪🇸 Español</option>
                    <option value="en">🇬🇧 English</option>
                    <option value="fr">🇫🇷 Français</option>
                    <option value="de">🇩🇪 Deutsch</option>
                  </select>
                  <svg width="8" height="5" viewBox="0 0 8 5" fill="none" style={{
                    position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                    pointerEvents: "none",
                  }}>
                    <path d="M1 1l3 3 3-3" stroke="rgba(255,255,255,.45)" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                </div>
              )
            )}
          </div>

          {/* status label */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
              {[2,3,2,5,3,4,2,3,2].map((h,i) => (
                <rect key={i} x={i*1.3} y={(8-h)/2} width=".9" height={h} rx=".4"
                  fill="#00D4E8" className="wave-bar"
                  style={{ animationDuration: `${1+i*.18}s`, animationDelay: `${i*.1}s` }}/>
              ))}
            </svg>
            <span style={{ fontSize: 11, color: "rgba(0,212,232,.80)", fontWeight: 500 }}>
              {listening ? "Escuchando…" : "Listo para traducir"}
            </span>
          </div>

          {/* buttons dock — glassmorphism pill */}
          <nav style={{
            display: "flex", alignItems: "center",
            gap: "clamp(10px,3vw,18px)",
            background: "rgba(8,9,18,.82)",
            backdropFilter: "blur(32px) saturate(200%)",
            WebkitBackdropFilter: "blur(32px) saturate(200%)",
            border: "1px solid rgba(255,255,255,.10)",
            borderRadius: "clamp(20px,5vw,32px)",
            padding: "clamp(12px,3vw,16px) clamp(16px,4vw,26px)",
            boxShadow: "0 -4px 48px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.07)",
            maxWidth: "calc(100vw - 32px)",
          }}>

            {/* Mic */}
            <CtrlBtn onClick={toggleMic} label="Micrófono" danger={!micOn}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                {micOn
                  ? <><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0014 0M12 19v3M9 22h6"/></>
                  : <><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/><path d="M17 16.95A7 7 0 015 10v-1m14 0v1a7 7 0 01-.11 1.23M12 19v3M9 22h6"/></>
                }
              </svg>
            </CtrlBtn>

            {/* Camera */}
            <CtrlBtn onClick={toggleCam} label="Cámara" danger={!camOn}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                {camOn
                  ? <><path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14"/><rect x="2" y="7" width="13" height="10" rx="2"/></>
                  : <><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 01-2-2V8m3-3h10l2 3h1a2 2 0 012 2v6.5"/></>
                }
              </svg>
            </CtrlBtn>

            {/* Hang up — central, bigger */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <button onClick={hangUp} style={{
                width: "clamp(58px,15vw,72px)", height: "clamp(58px,15vw,72px)",
                borderRadius: "50%",
                background: "radial-gradient(circle at 38% 35%, #ff5569, #e8162e)",
                border: "none",
                boxShadow: "0 0 0 1px rgba(255,92,106,.40), 0 0 28px rgba(255,40,60,.55), 0 8px 28px rgba(0,0,0,.65)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", flexShrink: 0,
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2A19.79 19.79 0 0111.82 19a19.5 19.5 0 01-6-6A19.79 19.79 0 013 4.18 2 2 0 015 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L9.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
                </svg>
              </button>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,.40)", letterSpacing: ".04em" }}>Colgar</span>
            </div>

            {/* CC / Subtitles */}
            <CtrlBtn
              onClick={listening ? stopSpeechRecognition : startSpeechRecognition}
              label="Subtítulos"
              accent={listening ? "#00D4E8" : undefined}
            >
              <span style={{
                fontSize: 12, fontWeight: 800, letterSpacing: ".06em",
                color: listening ? "#00D4E8" : "rgba(255,255,255,.50)",
              }}>CC</span>
            </CtrlBtn>

            {/* Language swap hint */}
            <CtrlBtn onClick={() => { const t = fromLang; setFromLang(toLang); setToLang(t); }} label="Swap">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.75)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3L4 7l4 4M16 21l4-4-4-4M4 7h16M4 17h16"/>
              </svg>
            </CtrlBtn>

          </nav>

          <p style={{ fontSize: 10, color: "rgba(255,255,255,.18)", letterSpacing: ".05em" }}>
            🔒 Conversación privada y segura
          </p>
        </footer>

      </div>
    </>
  );
}

function CtrlBtn({ onClick, label, danger, accent, children }: {
  onClick: () => void;
  label: string;
  danger?: boolean;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
      <button onClick={onClick} style={{
        width: "clamp(48px,12vw,58px)", height: "clamp(48px,12vw,58px)",
        borderRadius: "50%",
        background: danger ? "rgba(255,50,70,.80)" : accent ? `${accent}20` : "rgba(255,255,255,.10)",
        border: `1.5px solid ${danger ? "rgba(255,60,80,.55)" : accent ? `${accent}55` : "rgba(255,255,255,.15)"}`,
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", flexShrink: 0,
        boxShadow: accent ? `0 0 20px ${accent}28` : "none",
      }}>
        {children}
      </button>
      <span style={{ fontSize: 10, color: "rgba(255,255,255,.38)", letterSpacing: ".03em", whiteSpace: "nowrap" }}>
        {label}
      </span>
    </div>
  );
}
>>>>>>> 80ceafa (fix: show local video as waiting background)
