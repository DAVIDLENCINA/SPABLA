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
  } catch {
    return text;
  }
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
        await navigator.share({
          title: "SPABLA",
          text: "Únete a mi conversación traducida en tiempo real.",
          url: inviteUrl,
        });
      } else {
        await navigator.clipboard.writeText(inviteUrl);
        showToast("Enlace copiado");
      }
    } catch {}
  }
  function toggleMic() {
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
      setMicOn(track.enabled);
    });
  }
  function toggleCam() {
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !track.enabled;
      setCamOn(track.enabled);
    });
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
    window.setTimeout(() => {
      setSubtitles((prev) => prev.filter((item) => item.id !== entry.id));
    }, 6000);
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
      for (let i = 0; i < f32.length; i += 1) {
        i16[i] = Math.max(-32768, Math.min(32767, f32[i] * 32768));
      }
      socket.emit("audio-chunk", i16.buffer);
    };
    source.connect(processor);
    processor.connect(ctx.destination);
  }
  useEffect(() => {
    if (!roomId) return;
    let mounted = true;
    let remoteUserId: string | null = null;
    const socket = io(process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001", {
      transports: ["polling"],
    });
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
      if (event.candidate && remoteUserId) {
        socket.emit("ice-candidate", { to: remoteUserId, candidate: event.candidate });
      }
    };
    socket.on("connect", () => setConnectionState("waiting"));
    socket.on("transcript-result", async ({ text, isFinal }: { text: string; isFinal: boolean }) => {
      if (!text.trim() || !isFinal) return;
      const translated = await translate(text, fromLang, toLang);
      addSubtitle({
        id: ++subtitleIdRef.current,
        speaker: "local",
        original: text,
        translated,
        flag: LANGS[fromLang]?.flag,
        time: nowTime(),
      });
    });
    socket.on("subtitle", async ({ text, lang }: { text: string; lang: string }) => {
      if (!text.trim()) return;
      const translated = await translate(text, lang, toLang);
      addSubtitle({
        id: ++subtitleIdRef.current,
        speaker: "remote",
        original: text,
        translated,
        flag: LANGS[lang]?.flag || "🌐",
        time: nowTime(),
      });
    });
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: mode === "video",
          audio: true,
        });
        if (!mounted) return;
        localStreamRef.current = stream;
        setCamOn(mode === "video" && stream.getVideoTracks().some((track) => track.enabled));
        if (localPreviewRef.current) localPreviewRef.current.srcObject = stream;
        if (localBackgroundRef.current) localBackgroundRef.current.srcObject = stream;
        glot.addLocalStream(stream);
        socket.emit("join-room", roomId);
        startDeepgram(fromLang);
      } catch {
        showToast("No se pudo acceder a cámara o micrófono");
      }
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
    socket.on("answer", async ({ answer }: any) => {
      await pc.setRemoteDescription(answer);
    });
    socket.on("ice-candidate", async ({ candidate }: any) => {
      await pc.addIceCandidate(candidate);
    });
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
    <main className="fixed inset-0 isolate h-[100svh] w-screen overflow-hidden bg-black text-white antialiased">
      <CallStyles />
      <VideoLayer
        mode={mode}
        remoteVideoRef={remoteVideoRef}
        localBackgroundRef={localBackgroundRef}
        hasRemoteVideo={hasRemoteVideo}
        connectionState={connectionState}
      />
      <TopBar elapsed={elapsed} onShare={share} />
      <LocalPreview
        refVideo={localPreviewRef}
        mode={mode}
        camOn={camOn}
        micOn={micOn}
        flag={LANGS[fromLang]?.flag}
      />
      {ccOn && (
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
function VideoLayer({
  mode,
  remoteVideoRef,
  localBackgroundRef,
  hasRemoteVideo,
  connectionState,
}: {
  mode: CallMode;
  remoteVideoRef: React.RefObject<HTMLVideoElement>;
  localBackgroundRef: React.RefObject<HTMLVideoElement>;
  hasRemoteVideo: boolean;
  connectionState: ConnectionState;
}) {
  return (
    <section className="absolute inset-0 z-0 overflow-hidden">
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className={`absolute inset-0 h-full w-full scale-[1.02] object-cover transition-opacity duration-500 ${
          hasRemoteVideo ? "opacity-100" : "opacity-0"
        }`}
        style={{ filter: "brightness(.75) contrast(.92) saturate(.70)" }}
      />
      <video
        ref={localBackgroundRef}
        autoPlay
        muted
        playsInline
        className={`absolute inset-0 h-full w-full scale-110 object-cover transition-opacity duration-500 ${
          hasRemoteVideo || mode === "voice" ? "opacity-35 blur-xl" : "opacity-60 blur-md"
        }`}
        style={{ filter: "brightness(.5) contrast(.85) saturate(.55)" }}
      />
      {mode === "voice" && <VoiceOnlyAura />}

      {/* CAMBIO 1: overlay más oscuro con más peso en el bottom */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,.30)_0%,rgba(0,0,0,.04)_22%,rgba(0,0,0,.55)_60%,rgba(0,0,0,.97)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,.60)_100%)]" />

      {/* CAMBIO 4: ambient glow suave en esquinas inferiores */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_92%,rgba(0,212,232,.07),transparent_26%),radial-gradient(circle_at_88%_95%,rgba(255,92,106,.06),transparent_24%)]" />

      {!hasRemoteVideo && (
        <div className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full border border-white/10 bg-white/[.06] backdrop-blur-xl shadow-[0_0_60px_rgba(0,212,232,.16)]" />
          <p className="text-sm font-medium text-white/70">
            {connectionState === "connecting" ? "Conectando…" : "Esperando participante"}
          </p>
          <p className="mt-2 text-xs text-white/35">Comparte el enlace para empezar.</p>
        </div>
      )}
    </section>
  );
}
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
  refVideo,
  mode,
  camOn,
  micOn,
  flag,
}: {
  refVideo: React.RefObject<HTMLVideoElement>;
  mode: CallMode;
  camOn: boolean;
  micOn: boolean;
  flag: string;
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
    // CAMBIO 2: glow cyan reducido ~60% (de .18/.15 a .07/.06)
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
function SubtitleStack({
  subtitles,
  fallbackState,
  fromLabel,
}: {
  subtitles: SubtitleEntry[];
  fallbackState: ConnectionState;
  fromLabel: string;
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
        <SubtitleCard
          key={subtitle.id}
          subtitle={subtitle}
          isLast={index === subtitles.length - 1}
        />
      ))}
    </section>
  );
}
function SubtitleCard({ subtitle, isLast }: { subtitle: SubtitleEntry; isLast: boolean }) {
  const isLocal = subtitle.speaker === "local";
  const accent = isLocal ? C : R;
  return (
    <article
      className={`max-w-[calc(100vw-48px)] transition duration-300 ${
        isLast ? "animate-subIn opacity-100" : "scale-[.97] opacity-40"
      }`}
    >
      <div className="mb-1 flex items-center gap-1.5 pl-0.5">
        <span
          className="text-[clamp(10px,2.5vw,12px)] font-bold uppercase tracking-[.05em]"
          style={{ color: accent }}
        >
          {isLocal ? "Tú" : "Participante"}
        </span>
        <span className="text-[clamp(9px,2vw,10px)] text-white/30">· {subtitle.time}</span>
      </div>
      {/* CAMBIO 3: padding reducido, border-radius más compacto, sombra más suave */}
      <div
        className="rounded-[clamp(10px,2.5vw,14px)] border-l-[3px] bg-black/60 px-[clamp(10px,2.5vw,14px)] py-[clamp(7px,1.8vw,10px)] shadow-[0_2px_16px_rgba(0,0,0,.40)] backdrop-blur-2xl"
        style={{ borderLeftColor: accent }}
      >
        <div className="mb-1 flex items-center gap-2">
          <span className="shrink-0 text-[clamp(14px,3.5vw,18px)] leading-none">{subtitle.flag}</span>
          <p className="text-[clamp(10px,2.5vw,12px)] italic leading-snug text-white/40">
            {subtitle.original}
          </p>
        </div>
        <p
          className="pl-[clamp(20px,4.5vw,26px)] text-[clamp(15px,4vw,20px)] font-bold leading-snug tracking-[-.01em] text-white"
          style={{ textShadow: `0 0 20px ${accent}30` }}
        >
          {subtitle.translated}
        </p>
        <div className="mt-1.5 h-[1px] rounded-full" style={{ background: `linear-gradient(to right, ${accent}60, transparent)` }} />
      </div>
    </article>
  );
}
function BottomControls({
  micOn,
  camOn,
  ccOn,
  mode,
  fromLabel,
  onToggleMic,
  onToggleCam,
  onHangUp,
  onToggleCc,
  onChangeLanguage,
}: {
  micOn: boolean;
  camOn: boolean;
  ccOn: boolean;
  mode: CallMode;
  fromLabel: string;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onHangUp: () => void;
  onToggleCc: () => void;
  onChangeLanguage: () => void;
}) {
  return (
    <footer className="absolute bottom-0 left-0 right-0 z-30 flex max-w-[100vw] flex-col items-center gap-[clamp(10px,2vh,16px)] overflow-hidden px-4 pb-[max(24px,calc(env(safe-area-inset-bottom)+18px))]">
      <div className="flex items-center gap-1.5">
        <WaveIcon color={C} />
        <span className="text-[clamp(10px,2.5vw,12px)] text-cyan-300/80">
          Hablando en {fromLabel}
        </span>
      </div>
      <nav className="flex max-w-[calc(100vw-32px)] items-center gap-[clamp(8px,2.5vw,14px)] overflow-hidden rounded-[clamp(20px,5vw,32px)] border border-white/10 bg-[#080912]/80 px-[clamp(14px,4vw,24px)] py-[clamp(12px,3vw,16px)] shadow-[0_-4px_48px_rgba(0,0,0,.55),inset_0_1px_0_rgba(255,255,255,.07)] backdrop-blur-3xl">
        <RoundButton onClick={onToggleMic} label="Micrófono" danger={!micOn}>
          <MicIcon muted={!micOn} />
        </RoundButton>
        <RoundButton onClick={onToggleCam} label="Cámara" danger={!camOn} disabled={mode === "voice"}>
          <CameraIcon off={!camOn || mode === "voice"} />
        </RoundButton>
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <button
            onClick={onHangUp}
            className="flex h-[clamp(52px,14vw,68px)] w-[clamp(52px,14vw,68px)] items-center justify-center rounded-full bg-gradient-to-br from-[#ff3f55] to-[#ff5c6a] shadow-[0_0_0_1px_rgba(255,92,106,.35),0_6px_28px_rgba(255,60,80,.55)] active:scale-95"
          >
            <PhoneIcon />
          </button>
          <span className="whitespace-nowrap text-[clamp(9px,2vw,10px)] tracking-[.04em] text-white/40">Colgar</span>
        </div>
        <RoundButton onClick={onToggleCc} label="Subtítulos" accent={ccOn ? C : undefined}>
          <span className="text-xs font-extrabold tracking-[.06em]" style={{ color: ccOn ? C : "rgba(255,255,255,.5)" }}>
            CC
          </span>
        </RoundButton>
        <RoundButton onClick={onChangeLanguage} label="Idioma">
          <LanguageIcon />
        </RoundButton>
      </nav>
      <p className="text-[clamp(9px,2vw,11px)] tracking-[.04em] text-white/20">🔒 Conversación privada y segura</p>
    </footer>
  );
}
function RoundButton({
  onClick,
  label,
  danger,
  accent,
  disabled,
  children,
}: {
  onClick: () => void;
  label: string;
  danger?: boolean;
  accent?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <button
        onClick={onClick}
        disabled={disabled}
        className="flex h-[clamp(46px,11vw,56px)] w-[clamp(46px,11vw,56px)] items-center justify-center rounded-full border-[1.5px] backdrop-blur-xl active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
        style={{
          background: danger ? "rgba(255,50,70,.80)" : accent ? `${accent}20` : "rgba(255,255,255,.10)",
          borderColor: danger ? "rgba(255,60,80,.55)" : accent ? `${accent}60` : "rgba(255,255,255,.14)",
          boxShadow: accent ? `0 0 20px ${accent}28` : "none",
        }}
      >
        {children}
      </button>
      <span className="whitespace-nowrap text-[clamp(9px,2vw,10px)] tracking-[.03em] text-white/40">
        {label}
      </span>
    </div>
  );
}
function LanguageModal({
  fromLang,
  toLang,
  onFromLang,
  onToLang,
  onClose,
}: {
  fromLang: string;
  toLang: string;
  onFromLang: (lang: string) => void;
  onToLang: (lang: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      className="absolute inset-0 z-40 flex items-end justify-center bg-black/70 px-4 pb-[max(40px,env(safe-area-inset-bottom))] backdrop-blur-xl"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-[min(420px,calc(100vw-32px))] rounded-[28px] border border-white/10 bg-[#0b0c16]/95 px-5 py-6 shadow-[0_-8px_64px_rgba(0,0,0,.65)]"
      >
        <p className="mb-5 text-center text-[11px] uppercase tracking-[.10em] text-white/30">Idiomas</p>
        <LanguageGroup label="Tú hablas" value={fromLang} accent={C} onChange={onFromLang} />
        <LanguageGroup label="Traducir a" value={toLang} accent={R} onChange={onToLang} />
        <button
          onClick={onClose}
          className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[.07] py-3 text-[15px] text-white/80"
        >
          Listo
        </button>
      </div>
    </div>
  );
}
function LanguageGroup({
  label,
  value,
  accent,
  onChange,
}: {
  label: string;
  value: string;
  accent: string;
  onChange: (lang: string) => void;
}) {
  return (
    <div className="mb-4">
      <p className="mb-2.5 text-[11px] tracking-[.05em] text-white/30">{label}</p>
      <div className="flex flex-wrap gap-2">
        {Object.entries(LANGS).map(([key, lang]) => {
          const active = value === key;
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className="rounded-full border-[1.5px] px-4 py-2 text-sm"
              style={{
                background: active ? `${accent}22` : "rgba(255,255,255,.06)",
                borderColor: active ? accent : "rgba(255,255,255,.10)",
                color: active ? "#fff" : "rgba(255,255,255,.48)",
                boxShadow: active ? `0 0 18px ${accent}30` : "none",
              }}
            >
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
        <rect
          key={i}
          x={i * 1.3}
          y={(8 - h) / 2}
          width=".9"
          height={h}
          rx=".4"
          fill={color}
          className="animate-wavePulse"
          style={{ animationDuration: `${1 + i * 0.18}s`, animationDelay: `${i * 0.1}s` }}
        />
      ))}
    </svg>
  );
}
function MicIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {muted ? (
        <>
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
          <path d="M17 16.95A7 7 0 015 10v-1m14 0v1a7 7 0 01-.11 1.23M12 19v3M9 22h6" />
        </>
      ) : (
        <>
          <rect x="9" y="2" width="6" height="11" rx="3" />
          <path d="M5 10a7 7 0 0014 0M12 19v3M9 22h6" />
        </>
      )}
    </svg>
  );
}
function CameraIcon({ off }: { off: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {off ? (
        <>
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M21 21H3a2 2 0 01-2-2V8m3-3h10l2 3h1a2 2 0 012 2v6.5" />
        </>
      ) : (
        <>
          <path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14" />
          <rect x="2" y="7" width="13" height="10" rx="2" />
        </>
      )}
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
      @keyframes subIn {
        from { opacity: 0; transform: translateY(10px) scale(.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes wavePulse {
        0%, 100% { opacity: .38; }
        50% { opacity: 1; }
      }
      @keyframes toastIn {
        from { opacity: 0; transform: translateX(-50%) translateY(8px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
      @keyframes spablaPulse {
        0%, 100% { transform: scale(1); opacity: .45; }
        50% { transform: scale(1.08); opacity: .75; }
      }
      @keyframes spablaPulseSlow {
        0%, 100% { transform: scale(1); opacity: .35; }
        50% { transform: scale(1.12); opacity: .62; }
      }
      .animate-subIn { animation: subIn .3s ease both; }
      .animate-wavePulse { animation-name: wavePulse; animation-timing-function: ease-in-out; animation-iteration-count: infinite; }
      .animate-toastIn { animation: toastIn .25s ease both; }
      .animate-spablaPulse { animation: spablaPulse 4s ease-in-out infinite; }
      .animate-spablaPulseSlow { animation: spablaPulseSlow 5.5s ease-in-out infinite; }
    `}</style>
  );
}
