"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { GLOTConnection } from "@/lib/webrtc";

const C = "#00D4E8";
const R = "#FF5C6A";

const LANGS: Record<string, { flag: string; label: string; deepgram: string }> = {
  es: { flag: "🇪🇸", label: "Español",  deepgram: "es"    },
  en: { flag: "🇬🇧", label: "English",  deepgram: "en-US" },
  fr: { flag: "🇫🇷", label: "Français", deepgram: "fr"    },
  de: { flag: "🇩🇪", label: "Deutsch",  deepgram: "de"    },
};

async function translate(text: string, from: string, to: string): Promise<string> {
  if (!text.trim() || from === to) return text;
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`
    );
    const data = await res.json();
    return data.responseData.translatedText || text;
  } catch { return text; }
}

interface SubtitleEntry {
  id: number;
  speaker: "local" | "remote";
  original: string;
  translated: string;
  flag: string;
  time: string;
}

export default function CallPage() {
  const { roomId } = useParams<{ roomId: string }>();

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef  = useRef<HTMLVideoElement>(null);
  const glotRef        = useRef<GLOTConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const socketRef      = useRef<Socket | null>(null);
  const audioCtxRef    = useRef<AudioContext | null>(null);
  const processorRef   = useRef<ScriptProcessorNode | null>(null);
  const subtitleIdRef  = useRef(0);
  const callStartRef   = useRef(Date.now());

  const [fromLang, setFromLang] = useState("es");
  const [toLang,   setToLang]   = useState("en");
  const [micOn,    setMicOn]    = useState(true);
  const [camOn,    setCamOn]    = useState(true);
  const [ccOn,     setCcOn]     = useState(true);
  const [subtitles, setSubtitles] = useState<SubtitleEntry[]>([]);
  const [elapsed,  setElapsed]  = useState("0:00");
  const [showLangModal, setShowLangModal] = useState(false);
  const [toast,    setToast]    = useState("");

  useEffect(() => {
    callStartRef.current = Date.now();
    const id = setInterval(() => {
      const s = Math.floor((Date.now() - callStartRef.current) / 1000);
      setElapsed(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  function nowTime() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  function share() {
    const url = window.location.href;
    if (navigator.share) navigator.share({ title: "SPABLA", url });
    else { navigator.clipboard.writeText(url); showToast("Enlace copiado"); }
  }

  function toggleMic() {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setMicOn(p => !p);
  }

  function toggleCam() {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setCamOn(p => !p);
  }

  function hangUp() {
    stopDeepgram();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    glotRef.current?.close();
    socketRef.current?.disconnect();
    window.location.href = "/";
  }

  function startDeepgram(lang: string) {
    const socket = socketRef.current;
    if (!socket || !localStreamRef.current) return;
    socket.emit("transcribe-start", { lang: LANGS[lang].deepgram });
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx({ sampleRate: 48000 });
    ctx.resume();
    audioCtxRef.current = ctx;
    const source    = ctx.createMediaStreamSource(localStreamRef.current);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;
    processor.onaudioprocess = (e) => {
      const f32 = e.inputBuffer.getChannelData(0);
      const i16 = new Int16Array(f32.length);
      for (let i = 0; i < f32.length; i++) i16[i] = Math.max(-32768, Math.min(32767, f32[i] * 32768));
      socket.emit("audio-chunk", i16.buffer);
    };
    source.connect(processor);
    processor.connect(ctx.destination);
  }

  function stopDeepgram() {
    socketRef.current?.emit("transcribe-stop");
    processorRef.current?.disconnect();
    audioCtxRef.current?.close();
    processorRef.current = null;
    audioCtxRef.current  = null;
  }

  function addSubtitle(entry: SubtitleEntry) {
    setSubtitles(prev => [...prev.slice(-2), entry]);
    setTimeout(() => setSubtitles(prev => prev.filter(s => s.id !== entry.id)), 5000);
  }

  useEffect(() => {
    if (!roomId) return;
    const socket = io(process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001", { transports: ["polling"] });
    socketRef.current = socket;
    const glot = new GLOTConnection();
    glotRef.current = glot;
    const pc = glot.getConnection();
    let remoteUserId: string | null = null;

    pc.ontrack = (e) => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0]; };
    pc.onicecandidate = (e) => {
      if (e.candidate && remoteUserId)
        socket.emit("ice-candidate", { to: remoteUserId, candidate: e.candidate });
    };

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
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      glot.addLocalStream(stream);
      socket.emit("join-room", roomId);
    }

    socket.on("user-joined", async (userId: string) => {
      remoteUserId = userId;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("offer", { to: userId, offer });
    });
    socket.on("offer", async ({ from, offer }: any) => {
      remoteUserId = from;
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("answer", { to: from, answer });
    });
    socket.on("answer", async ({ answer }: any) => { await pc.setRemoteDescription(answer); });
    socket.on("ice-candidate", async ({ candidate }: any) => { await pc.addIceCandidate(candidate); });

    start().then(() => startDeepgram(fromLang));

    return () => {
      stopDeepgram();
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      glot.close();
      socket.disconnect();
    };
  }, [roomId]);

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        html, body { width:100%; height:100%; overflow:hidden; overflow-x:hidden; background:#000; }
        @keyframes subIn { from{opacity:0;transform:translateY(10px) scale(.98)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes pulse  { 0%,100%{opacity:.4} 50%{opacity:1} }
        @keyframes toastIn { from{opacity:0;transform:translateX(-50%) translateY(8px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
        @keyframes breatheMic { 0%,100%{box-shadow:0 0 0 0 rgba(0,212,232,0)} 50%{box-shadow:0 0 0 8px rgba(0,212,232,.15)} }
        select { -webkit-appearance:none; appearance:none; }
        select option { background:#0d0e1a; color:#fff; }
      `}</style>

      <div style={{
        position:"fixed", inset:0,
        width:"100%", height:"100%",
        overflow:"hidden", overflowX:"hidden",
        fontFamily:"-apple-system,'SF Pro Display','Helvetica Neue',sans-serif",
        WebkitFontSmoothing:"antialiased",
        background:"#000",
        isolation:"isolate",
      }}>

        {/* Remote video fullscreen */}
        <video ref={remoteVideoRef} autoPlay playsInline style={{
          position:"absolute", inset:0,
          width:"100%", height:"100%",
          objectFit:"cover",
          filter:"brightness(.80) contrast(.90) saturate(.72)",
          transform:"scale(1.02)",
          zIndex:0,
        }}/>

        {/* Cinematic gradient */}
        <div style={{
          position:"absolute", inset:0, zIndex:1, pointerEvents:"none",
          background:`linear-gradient(to bottom,
            rgba(0,0,0,.20) 0%,
            rgba(0,0,0,.04) 18%,
            rgba(0,0,0,.0)  38%,
            rgba(0,0,0,.40) 62%,
            rgba(0,0,0,.80) 82%,
            rgba(0,0,0,.95) 100%)`,
        }}/>

        {/* Vignette */}
        <div style={{
          position:"absolute", inset:0, zIndex:1, pointerEvents:"none",
          background:"radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,.50) 100%)",
        }}/>

        {/* Self-view top right */}
        <div style={{
          position:"absolute", top:68, right:16,
          width:"clamp(90px,22vw,140px)",
          aspectRatio:"3/4",
          borderRadius:"clamp(12px,3vw,18px)",
          overflow:"hidden",
          border:`2px solid rgba(0,212,232,.60)`,
          boxShadow:`0 0 0 1px rgba(0,212,232,.18), 0 12px 40px rgba(0,0,0,.85), 0 0 28px rgba(0,212,232,.15)`,
          zIndex:20,
          animation:"breatheMic 3s ease-in-out infinite",
        }}>
          <video ref={localVideoRef} autoPlay muted playsInline
            style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
          {!camOn && (
            <div style={{
              position:"absolute", inset:0,
              background:"linear-gradient(135deg,#0a0b14,#111320)",
              display:"flex", alignItems:"center", justifyContent:"center",
              flexDirection:"column", gap:4,
            }}>
              <span style={{ fontSize:"clamp(16px,4vw,24px)" }}>{LANGS[fromLang]?.flag}</span>
              <span style={{ fontSize:9, color:"rgba(255,255,255,.3)" }}>Sin cámara</span>
            </div>
          )}
          <div style={{
            position:"absolute", bottom:6, right:6,
            width:7, height:7, borderRadius:"50%",
            background:micOn ? "#4ade80" : R,
            boxShadow:micOn ? "0 0 8px rgba(74,222,128,.9)" : `0 0 8px ${R}`,
          }}/>
        </div>

        {/* Top bar */}
        <div style={{
          position:"absolute", top:0, left:0, right:0,
          padding:"14px 16px",
          display:"flex", alignItems:"center", justifyContent:"space-between",
          zIndex:20, maxWidth:"100vw", overflow:"hidden",
        }}>
          <img src="/SPABLA_LOGO.png" alt="SPABLA" style={{ height:"clamp(20px,5vw,26px)", opacity:.95, flexShrink:0 }}/>
          <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
            <div style={{
              display:"flex", alignItems:"center", gap:5,
              background:"rgba(0,0,0,.58)", backdropFilter:"blur(20px)",
              border:`1px solid rgba(0,212,232,.30)`,
              borderRadius:999, padding:"5px clamp(8px,2vw,13px)",
            }}>
              <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
                {[2,3,2,5,3,4,2,3,2].map((h,i) => (
                  <rect key={i} x={i*1.3} y={(8-h)/2} width=".9" height={h} rx=".4"
                    fill={C} style={{ animation:`pulse ${1+i*.18}s ease-in-out ${i*.1}s infinite` }}/>
                ))}
              </svg>
              <span style={{ fontSize:"clamp(9px,2.5vw,11px)", color:C, whiteSpace:"nowrap" }}>Traducción activa</span>
              <div style={{ width:5, height:5, borderRadius:"50%", background:C, animation:"pulse 2s ease-in-out infinite" }}/>
            </div>
            <div style={{
              background:"rgba(0,0,0,.52)", backdropFilter:"blur(20px)",
              border:"1px solid rgba(255,255,255,.12)",
              borderRadius:999, padding:"5px clamp(8px,2vw,12px)",
              fontSize:"clamp(10px,2.5vw,12px)", color:"rgba(255,255,255,.65)", whiteSpace:"nowrap",
            }}>{elapsed}</div>
            <button onClick={share} style={{
              background:"rgba(0,0,0,.52)", backdropFilter:"blur(20px)",
              border:"1px solid rgba(255,255,255,.14)",
              borderRadius:999, padding:"5px clamp(8px,2vw,13px)",
              fontSize:"clamp(10px,2.5vw,12px)", color:"rgba(255,255,255,.75)",
              cursor:"pointer", whiteSpace:"nowrap",
            }}>Compartir</button>
          </div>
        </div>

        {/* Subtitles */}
        {ccOn && subtitles.length > 0 && (
          <div style={{
            position:"absolute",
            bottom:"clamp(155px,22vh,215px)",
            left:0, right:0,
            padding:"0 clamp(16px,4vw,24px)",
            maxWidth:"100vw",
            display:"flex", flexDirection:"column",
            gap:"clamp(8px,2vw,12px)",
            zIndex:15,
          }}>
            {subtitles.map((s,i) => {
              const isLocal = s.speaker === "local";
              const accent  = isLocal ? C : R;
              const isLast  = i === subtitles.length - 1;
              return (
                <div key={s.id} style={{
                  animation: isLast ? "subIn .3s ease" : "none",
                  opacity: isLast ? 1 : .38,
                  transform: isLast ? "none" : "scale(.97)",
                  transition:"opacity .3s, transform .3s",
                  maxWidth:"calc(100vw - 48px)",
                }}>
                  <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:4, paddingLeft:2 }}>
                    <span style={{ fontSize:"clamp(10px,2.5vw,12px)", fontWeight:700, color:accent, letterSpacing:".05em", textTransform:"uppercase" }}>
                      {isLocal ? "Tú" : "Participante"}
                    </span>
                    <span style={{ fontSize:"clamp(9px,2vw,10px)", color:"rgba(255,255,255,.30)" }}>· {s.time}</span>
                  </div>
                  <div style={{
                    background:"rgba(0,0,0,.65)",
                    backdropFilter:"blur(28px) saturate(180%)",
                    WebkitBackdropFilter:"blur(28px) saturate(180%)",
                    borderRadius:"clamp(12px,3vw,18px)",
                    padding:"clamp(10px,2.5vw,14px) clamp(12px,3vw,18px)",
                    borderLeft:`3px solid ${accent}`,
                    boxShadow:`0 4px 32px rgba(0,0,0,.45)`,
                  }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                      <span style={{ fontSize:"clamp(16px,4vw,22px)", lineHeight:1, flexShrink:0 }}>{s.flag}</span>
                      <p style={{ fontSize:"clamp(11px,2.8vw,13px)", color:"rgba(255,255,255,.42)", fontStyle:"italic", lineHeight:1.35 }}>
                        {s.original}
                      </p>
                    </div>
                    <p style={{ fontSize:"clamp(16px,4.5vw,22px)", fontWeight:700, color:"#fff", lineHeight:1.3, letterSpacing:"-.01em", textShadow:`0 0 40px ${accent}55`, paddingLeft:"clamp(24px,5.5vw,30px)" }}>
                      {s.translated}
                    </p>
                    <div style={{ marginTop:8, height:1.5, background:`linear-gradient(to right,${accent}80,transparent)`, borderRadius:1 }}/>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom controls */}
        <div style={{
          position:"absolute", bottom:0, left:0, right:0,
          zIndex:20, padding:"0 16px clamp(24px,6vh,40px)",
          display:"flex", flexDirection:"column", alignItems:"center",
          gap:"clamp(10px,2vh,16px)",
          maxWidth:"100vw", overflow:"hidden",
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
              {[2,3,2,5,3,4,2,3,2].map((h,i) => (
                <rect key={i} x={i*1.3} y={(8-h)/2} width=".9" height={h} rx=".4"
                  fill={C} style={{ animation:`pulse ${1+i*.18}s ease-in-out ${i*.1}s infinite` }}/>
              ))}
            </svg>
            <span style={{ fontSize:"clamp(10px,2.5vw,12px)", color:"rgba(0,212,232,.8)" }}>
              Hablando en {LANGS[fromLang]?.label}
            </span>
          </div>

          <div style={{
            display:"flex", alignItems:"center",
            gap:"clamp(8px,2.5vw,14px)",
            background:"rgba(8,9,18,.80)",
            backdropFilter:"blur(32px) saturate(200%)",
            WebkitBackdropFilter:"blur(32px) saturate(200%)",
            border:"1px solid rgba(255,255,255,.10)",
            borderRadius:"clamp(20px,5vw,32px)",
            padding:"clamp(12px,3vw,16px) clamp(14px,4vw,24px)",
            boxShadow:"0 -4px 48px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.07)",
            maxWidth:"calc(100vw - 32px)",
            overflow:"hidden",
          }}>

            <Btn onClick={toggleMic} label="Micrófono" danger={!micOn}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                {micOn
                  ? <><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0014 0M12 19v3M9 22h6"/></>
                  : <><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/><path d="M17 16.95A7 7 0 015 10v-1m14 0v1a7 7 0 01-.11 1.23M12 19v3M9 22h6"/></>
                }
              </svg>
            </Btn>

            <Btn onClick={toggleCam} label="Cámara" danger={!camOn}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                {camOn
                  ? <><path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14"/><rect x="2" y="7" width="13" height="10" rx="2"/></>
                  : <><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 01-2-2V8m3-3h10l2 3h1a2 2 0 012 2v6.5"/></>
                }
              </svg>
            </Btn>

            {/* Hang up */}
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5 }}>
              <button onClick={hangUp} style={{
                width:"clamp(52px,14vw,68px)", height:"clamp(52px,14vw,68px)",
                borderRadius:"50%",
                background:`linear-gradient(145deg,#ff3f55,${R})`,
                border:"none",
                boxShadow:`0 0 0 1px rgba(255,92,106,.35), 0 6px 28px rgba(255,60,80,.55)`,
                display:"flex", alignItems:"center", justifyContent:"center",
                cursor:"pointer", flexShrink:0,
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2A19.79 19.79 0 0111.82 19a19.5 19.5 0 01-6-6A19.79 19.79 0 013 4.18 2 2 0 015 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L9.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
                </svg>
              </button>
              <span style={{ fontSize:"clamp(9px,2vw,10px)", color:"rgba(255,255,255,.40)", letterSpacing:".04em" }}>Colgar</span>
            </div>

            <Btn onClick={() => setCcOn(p => !p)} label="Subtítulos" accent={ccOn ? C : undefined}>
              <span style={{ fontSize:12, fontWeight:800, color:ccOn ? C : "rgba(255,255,255,.5)", letterSpacing:".06em" }}>CC</span>
            </Btn>

            <Btn onClick={() => setShowLangModal(true)} label="Cambiar idioma">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.75)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3L4 7l4 4M16 21l4-4-4-4M4 7h16M4 17h16"/>
              </svg>
            </Btn>

          </div>

          <p style={{ fontSize:"clamp(9px,2vw,11px)", color:"rgba(255,255,255,.20)", letterSpacing:".04em" }}>
            🔒 Conversación privada y segura
          </p>
        </div>

        {/* Lang modal */}
        {showLangModal && (
          <div onClick={() => setShowLangModal(false)} style={{
            position:"absolute", inset:0, zIndex:30,
            background:"rgba(0,0,0,.72)", backdropFilter:"blur(14px)",
            display:"flex", alignItems:"flex-end", justifyContent:"center",
            padding:"0 16px 40px",
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background:"rgba(11,12,22,.97)",
              border:"1px solid rgba(255,255,255,.10)",
              borderRadius:28, padding:"24px 20px",
              width:"min(420px,calc(100vw - 32px))",
              boxShadow:"0 -8px 64px rgba(0,0,0,.65)",
            }}>
              <p style={{ fontSize:11, color:"rgba(255,255,255,.30)", marginBottom:20, textAlign:"center", letterSpacing:".10em", textTransform:"uppercase" }}>Idiomas</p>
              {(["fromLang","toLang"] as const).map(key => (
                <div key={key} style={{ marginBottom:18 }}>
                  <p style={{ fontSize:11, color:"rgba(255,255,255,.28)", marginBottom:10, letterSpacing:".05em" }}>
                    {key === "fromLang" ? "Tú hablas" : "Traducir a"}
                  </p>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    {Object.entries(LANGS).map(([k,v]) => {
                      const active = key === "fromLang" ? fromLang === k : toLang === k;
                      const accent = key === "fromLang" ? C : R;
                      return (
                        <button key={k} onClick={() => key === "fromLang" ? setFromLang(k) : setToLang(k)} style={{
                          padding:"9px 15px", borderRadius:999, fontSize:14,
                          background: active ? `${accent}22` : "rgba(255,255,255,.06)",
                          border:`1.5px solid ${active ? accent : "rgba(255,255,255,.10)"}`,
                          color: active ? "#fff" : "rgba(255,255,255,.45)",
                          cursor:"pointer",
                          boxShadow: active ? `0 0 18px ${accent}30` : "none",
                        }}>{v.flag} {v.label}</button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <button onClick={() => setShowLangModal(false)} style={{
                width:"100%", marginTop:6, padding:"13px",
                borderRadius:16, background:"rgba(255,255,255,.07)",
                border:"1px solid rgba(255,255,255,.10)",
                color:"rgba(255,255,255,.80)", fontSize:15, cursor:"pointer",
              }}>Listo</button>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div style={{
            position:"absolute", bottom:160, left:"50%",
            transform:"translateX(-50%)",
            background:"rgba(0,0,0,.92)", backdropFilter:"blur(20px)",
            border:"1px solid rgba(255,255,255,.12)",
            borderRadius:999, padding:"9px 22px",
            fontSize:13, color:"#fff", zIndex:40,
            animation:"toastIn .25s ease", whiteSpace:"nowrap",
          }}>{toast}</div>
        )}

      </div>
    </>
  );
}

function Btn({ onClick, label, danger, accent, children }: {
  onClick: () => void;
  label?: string;
  danger?: boolean;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5, flexShrink:0 }}>
      <button onClick={onClick} style={{
        width:"clamp(46px,11vw,56px)", height:"clamp(46px,11vw,56px)",
        borderRadius:"50%",
        background: danger ? "rgba(255,50,70,.80)" : accent ? `${accent}20` : "rgba(255,255,255,.10)",
        border:`1.5px solid ${danger ? "rgba(255,60,80,.55)" : accent ? `${accent}60` : "rgba(255,255,255,.14)"}`,
        backdropFilter:"blur(16px)", WebkitBackdropFilter:"blur(16px)",
        display:"flex", alignItems:"center", justifyContent:"center", gap:3,
        cursor:"pointer",
        boxShadow: accent ? `0 0 20px ${accent}28` : "none",
        flexShrink:0,
      }}>
        {children}
      </button>
      {label && (
        <span style={{ fontSize:"clamp(9px,2vw,10px)", color:"rgba(255,255,255,.38)", letterSpacing:".03em", whiteSpace:"nowrap" }}>
          {label}
        </span>
      )}
    </div>
  );
}
