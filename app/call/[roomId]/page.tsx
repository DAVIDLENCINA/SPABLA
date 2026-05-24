"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { io } from "socket.io-client";
import { GLOTConnection } from "@/lib/webrtc";

/* ─── translation ─────────────────────────────────────────── */
async function translate(text: string, from: string, to: string): Promise<string> {
  if (!text.trim()) return "";
  try {
    const res  = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`);
    const data = await res.json();
    return data.responseData.translatedText || text;
  } catch { return text; }
}

/* ─── language metadata ───────────────────────────────────── */
const LANG: Record<string, { label: string; flag: string; full: string }> = {
  es: { label: "ES", flag: "🇪🇸", full: "español" },
  en: { label: "EN", flag: "🇬🇧", full: "inglés" },
  fr: { label: "FR", flag: "🇫🇷", full: "francés" },
  de: { label: "DE", flag: "🇩🇪", full: "alemán" },
};

/* ─── tokens ──────────────────────────────────────────────── */
const C   = "#00D4E8";
const R   = "#FF5C6A";
const C15 = "rgba(0,212,232,0.12)";
const C30 = "rgba(0,212,232,0.22)";
const R15 = "rgba(255,92,106,0.15)";

/* ═══════════════════════════════════════════════════════════ */
export default function CallPage() {
  const { roomId } = useParams<{ roomId: string }>();

  const localVideoRef        = useRef<HTMLVideoElement>(null);
  const remoteVideoRef       = useRef<HTMLVideoElement>(null);
  const localVideoMobileRef  = useRef<HTMLVideoElement>(null);
  const remoteVideoMobileRef = useRef<HTMLVideoElement>(null);
  const glotRef              = useRef<GLOTConnection | null>(null);
  const localStreamRef       = useRef<MediaStream | null>(null);
  const timerRef             = useRef<ReturnType<typeof setInterval> | null>(null);
  const socketRef            = useRef<ReturnType<typeof io> | null>(null);
  const audioContextRef      = useRef<AudioContext | null>(null);
  const processorRef         = useRef<ScriptProcessorNode | null>(null);
  const dgLangRef            = useRef<string>("es");

  const [subtitle,      setSubtitle]      = useState("");
  const [rawSubtitle,   setRawSubtitle]   = useState("");
  const [remoteSubtitle,setRemoteSubtitle]= useState("");
  const [remoteRaw,     setRemoteRaw]     = useState("");
  const [listening,     setListening]     = useState(false);
  const [fromLang,      setFromLang]      = useState("es");
  const [toLang,        setToLang]        = useState("en");
  const [copied,        setCopied]        = useState(false);
  const [toastVisible,  setToastVisible]  = useState(false);
  const [micOn,         setMicOn]         = useState(true);
  const [camOn,         setCamOn]         = useState(true);
  const [showLang,      setShowLang]      = useState(false);
  const [callDuration,  setCallDuration]  = useState(0);
  const [waveActive,    setWaveActive]    = useState(false);

  /* timer */
  useEffect(() => {
    timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  function fmt(s: number) {
    return `${Math.floor(s / 60).toString().padStart(2,"0")}:${(s % 60).toString().padStart(2,"0")}`;
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  function shareConversation() {
    const url  = window.location.href;
    const text = "Únete a mi conversación en SPABLA. Podemos hablar en nuestros idiomas y entendernos en tiempo real.";
    if (navigator.share) {
      navigator.share({ title: "SPABLA — Conversación en tiempo real", text, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setToastVisible(true);
        setTimeout(() => setToastVisible(false), 2200);
      });
    }
  }

  function toggleMic() {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setMicOn(p => !p);
  }

  function toggleCam() {
    if (!localStreamRef.current) return;
    localStreamRef.current.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setCamOn(p => !p);
  }

  function teardownAudio() {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    socketRef.current?.emit("transcribe-stop");
    socketRef.current?.off("transcript-result");
  }

  function hangUp() {
    teardownAudio();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    glotRef.current?.close(); glotRef.current = null;
    window.location.href = "/";
  }

  function startSpeechRecognition() {
    if (!localStreamRef.current || !socketRef.current) return;
    dgLangRef.current = fromLang;
    const langMap: Record<string,string> = { es:"es", en:"en", fr:"fr", de:"de" };
    socketRef.current.emit("transcribe-start", { lang: langMap[fromLang] ?? "es" });
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx({ sampleRate: 48000 });
    audioContextRef.current = ctx;
    ctx.resume().then(() => {
      if (!localStreamRef.current) return;
      const source    = ctx.createMediaStreamSource(localStreamRef.current);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (e) => {
        if (!socketRef.current) return;
        const float32 = e.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          const s = Math.max(-1, Math.min(1, float32[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        socketRef.current.emit("audio-chunk", int16.buffer);
      };
      source.connect(processor);
      processor.connect(ctx.destination);
    });
    socketRef.current.off("transcript-result");
    socketRef.current.on("transcript-result", async ({ text, isFinal, error }: { text: string; isFinal: boolean; error?: boolean }) => {
      if (error || !text.trim()) return;
      const lang = dgLangRef.current;
      if (isFinal) {
        setWaveActive(true);
        setSubtitle(""); setRawSubtitle("");
        const tr = lang !== toLang ? await translate(text, lang, toLang) : text;
        setRawSubtitle(text);
        setSubtitle(tr);
        setTimeout(() => { setSubtitle(""); setRawSubtitle(""); setWaveActive(false); }, 5000);
        socketRef.current?.emit("subtitle", { roomId, originalText: text, translatedText: tr, fromLang: lang, toLang, ts: Date.now() });
      }
    });
    setListening(true);
  }

  function stopSpeechRecognition() {
    teardownAudio();
    setListening(false); setSubtitle(""); setRawSubtitle(""); setWaveActive(false);
  }

  /* WebRTC */
  useEffect(() => {
    if (!roomId) return;
    const socket = io(process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001", { transports: ["polling"] });
    socketRef.current = socket;
    const glot = new GLOTConnection(); glotRef.current = glot;
    const pc = glot.getConnection(); let remoteUserId: string | null = null;
    pc.ontrack = (e) => {
      if (remoteVideoRef.current)       remoteVideoRef.current.srcObject       = e.streams[0];
      if (remoteVideoMobileRef.current) remoteVideoMobileRef.current.srcObject = e.streams[0];
    };
    pc.onicecandidate = (e) => {
      if (e.candidate && remoteUserId) socket.emit("ice-candidate", { to: remoteUserId, candidate: e.candidate });
    };
    async function start() {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current)       localVideoRef.current.srcObject       = stream;
      if (localVideoMobileRef.current) localVideoMobileRef.current.srcObject = stream;
      glot.addLocalStream(stream); socket.emit("join-room", roomId);
    }
    socket.on("user-joined", async (userId: string) => {
      remoteUserId = userId;
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      socket.emit("offer", { to: userId, offer });
    });
    socket.on("offer", async ({ from, offer }: { from: string; offer: RTCSessionDescriptionInit }) => {
      remoteUserId = from; await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
      socket.emit("answer", { to: from, answer });
    });
    socket.on("answer", async ({ answer }: { answer: RTCSessionDescriptionInit }) => { await pc.setRemoteDescription(answer); });
    socket.on("ice-candidate", async ({ candidate }: { candidate: RTCIceCandidateInit }) => { await pc.addIceCandidate(candidate); });
    socket.on("subtitle", (data: { translatedText: string; originalText: string; fromLang: string }) => {
      setRemoteRaw(data.originalText);
      setRemoteSubtitle(data.translatedText);
      setTimeout(() => { setRemoteSubtitle(""); setRemoteRaw(""); }, 5000);
    });
    start();
    return () => {
      teardownAudio();
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      glot.close(); socket.disconnect();
    };
  }, [roomId]);

  const WAVE_H = [4,7,12,18,24,20,14,9,5,9,16,22,18,12,6];

  /* ═══════════════════════════════════ RENDER ══════════════ */
  return (
    <>
      <style>{`
        @keyframes sway    { 0%,100%{transform:scaleY(.4);opacity:.35} 50%{transform:scaleY(1);opacity:1} }
        @keyframes rise    { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes halo    { 0%,100%{opacity:.5;transform:scale(1)} 50%{opacity:1;transform:scale(1.03)} }
        @keyframes pip     { 0%,100%{box-shadow:0 4px 20px rgba(0,0,0,.6)} 50%{box-shadow:0 4px 20px rgba(0,0,0,.6),0 0 0 1px rgba(0,212,232,.18)} }
        @keyframes livedot { 0%,100%{opacity:.3;transform:scale(.7)} 50%{opacity:1;transform:scale(1)} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse   { 0%,100%{opacity:.5} 50%{opacity:1} }
      `}</style>

      {/* ═══════════════ MOBILE ════════════════════════════ */}
      <div className="md:hidden" style={{
        position:"fixed", inset:0, background:"#03040d", overflow:"hidden",
        fontFamily:"-apple-system,'SF Pro Display',sans-serif",
        WebkitFontSmoothing:"antialiased",
      }}>

        {/* remote video */}
        <video ref={remoteVideoMobileRef} autoPlay playsInline style={{
          position:"absolute", top:0, left:0,
          width:"100%", height:"100%",
          objectFit:"cover", zIndex:0,
          filter:"brightness(.88) contrast(1.02) saturate(.9)",
        }}/>

        {/* vignette */}
        <div style={{ position:"absolute",inset:0,pointerEvents:"none",zIndex:1,
          background:"radial-gradient(ellipse 75% 65% at 50% 38%, transparent 0%, rgba(3,4,13,.65) 100%)" }}/>
        {/* top scrim */}
        <div style={{ position:"absolute",top:0,left:0,right:0,height:200,pointerEvents:"none",zIndex:1,
          background:"linear-gradient(to bottom, rgba(3,4,13,.82) 0%, rgba(3,4,13,.12) 70%, transparent 100%)" }}/>
        {/* bottom scrim */}
        <div style={{ position:"absolute",bottom:0,left:0,right:0,height:420,pointerEvents:"none",zIndex:1,
          background:"linear-gradient(to top, rgba(3,4,13,.98) 0%, rgba(3,4,13,.85) 38%, rgba(3,4,13,.38) 65%, transparent 100%)" }}/>
        {/* ambient glows — reduced 30% */}
        <div style={{ position:"absolute",bottom:-50,left:-40,width:220,height:220,borderRadius:"50%",
          background:"radial-gradient(circle, rgba(0,212,232,.04) 0%, transparent 70%)",pointerEvents:"none",zIndex:1 }}/>
        <div style={{ position:"absolute",bottom:-30,right:-50,width:200,height:200,borderRadius:"50%",
          background:"radial-gradient(circle, rgba(255,92,106,.035) 0%, transparent 70%)",pointerEvents:"none",zIndex:1 }}/>

        {/* ── TOP BAR ── */}
        <div style={{
          position:"absolute",top:0,left:0,right:0,zIndex:30,
          paddingTop:"env(safe-area-inset-top,50px)",
          padding:"env(safe-area-inset-top,50px) 16px 0",
          display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:6,
          flexWrap:"nowrap",
        }}>
          {/* back chevron */}
          {/* logo */}
          <img src="/SPABLA_LOGO.png" alt="SPABLA" style={{
            height:26, width:"auto", opacity:.92, flexShrink:0,
          }}/>

          {/* centre pill: traducción en tiempo real */}
          <div style={{
            display:"flex",alignItems:"center",gap:6,
            background:"rgba(255,255,255,.09)",
            backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",
            border:"0.5px solid rgba(255,255,255,.14)",
            borderRadius:999,padding:"7px 13px",
            flex:1,justifyContent:"center",minWidth:0,
          }}>
            {/* mini waveform */}
            <div style={{display:"flex",alignItems:"center",gap:2,height:12,flexShrink:0}}>
              {[4,8,12,8,4].map((h,i)=>(
                <span key={i} style={{
                  display:"block",width:2,height:h,borderRadius:1,background:C,
                  opacity: listening ? 1 : 0.45,
                  animation: listening ? `sway .8s ease-in-out ${i*.1}s infinite` : "none",
                }}/>
              ))}
            </div>
            <span style={{fontSize:11,fontWeight:500,color:"rgba(255,255,255,.75)",letterSpacing:".02em",whiteSpace:"nowrap"}}>
              Traducción activa
            </span>
            {/* live dot */}
            <span style={{
              width:5,height:5,borderRadius:"50%",background:C,flexShrink:0,
              boxShadow:`0 0 3px ${C}`,animation:"livedot 2s ease-in-out infinite",display:"inline-block",
            }}/>
          </div>

          {/* compartir button — dark premium pill */}
          <button onClick={shareConversation} style={{
            display:"flex",alignItems:"center",gap:6,flexShrink:0,
            background:"rgba(255,255,255,.08)",
            backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",
            border:"0.5px solid rgba(255,255,255,.16)",
            borderRadius:999,padding:"7px 13px",
            cursor:"pointer",WebkitTapHighlightColor:"transparent",
          }}>
            {/* iOS-style share icon */}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="rgba(255,255,255,.82)" strokeWidth="1.9"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/>
              <polyline points="16 6 12 2 8 6"/>
              <line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
            <span style={{fontSize:12,fontWeight:500,color:"rgba(255,255,255,.82)",letterSpacing:".01em"}}>
              Compartir
            </span>
          </button>
        </div>

        {/* ── SELF VIEW ── */}
        <div style={{
          position:"absolute",
          top:"calc(env(safe-area-inset-top,50px) + 62px)",
          right:14,width:82,aspectRatio:"3/4",
          borderRadius:16,overflow:"hidden",
          border:"1px solid rgba(255,255,255,.16)",
          zIndex:25,animation:"pip 3.5s ease-in-out infinite",
        }}>
          <video ref={localVideoMobileRef} autoPlay muted playsInline
            style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          {!camOn && (
            <div style={{position:"absolute",inset:0,background:"#0a0a12",
              display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="rgba(255,255,255,.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="2" y1="2" x2="22" y2="22"/>
                <path d="M10.29 7H6a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-.71M15 10l4.55-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.45.894L15 14"/>
              </svg>
            </div>
          )}
          {/* flag of my language in corner */}
          <div style={{
            position:"absolute",bottom:4,left:4,
            fontSize:10,lineHeight:1,
          }}>{LANG[fromLang]?.flag}</div>
          {/* mic dot */}
          <div style={{
            position:"absolute",bottom:4,right:4,
            width:5,height:5,borderRadius:"50%",
            background: micOn ? C : R,
            boxShadow: micOn ? `0 0 4px ${C}` : `0 0 4px ${R}`,
          }}/>
        </div>

        {/* ── CONVERSATION / SUBTITLE AREA ── */}
        <div style={{
          position:"absolute",bottom:165,left:0,right:0,zIndex:30,
          padding:"0 24px",
        }}>
        {/* ── MI MENSAJE: mi idioma arriba, traducción abajo ── */}
          {(rawSubtitle || subtitle) && (
            <div style={{marginBottom:20,animation:"rise .25s ease"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                <span style={{fontSize:11,fontWeight:500,color:C,opacity:.75}}>Tú</span>
                <span style={{fontSize:10,color:"rgba(255,255,255,.2)"}}>·</span>
                <span style={{fontSize:10,color:"rgba(255,255,255,.2)",fontVariantNumeric:"tabular-nums"}}>{fmt(callDuration)}</span>
              </div>
              {/* línea 1: lo que dije (mi idioma) */}
              {rawSubtitle && (
                <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:6}}>
                  <span style={{fontSize:15,flexShrink:0,marginTop:1}}>{LANG[fromLang]?.flag}</span>
                  <p style={{
                    margin:0,fontSize:15,fontWeight:400,lineHeight:1.4,
                    color:"rgba(255,255,255,.55)",fontStyle:"italic",
                    filter:"drop-shadow(0 1px 4px rgba(0,0,0,.8))",
                  }}>{rawSubtitle}</p>
                </div>
              )}
              {/* línea 2: la traducción (idioma del participante) */}
              {subtitle && (
                <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
                  <span style={{fontSize:15,flexShrink:0,marginTop:1}}>{LANG[toLang]?.flag}</span>
                  <p style={{
                    margin:0,fontSize:18,fontWeight:600,lineHeight:1.3,letterSpacing:"-.02em",
                    background:`linear-gradient(130deg, ${C} 0%, rgba(255,255,255,.95) 45%, ${R} 100%)`,
                    WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",
                    filter:"drop-shadow(0 1px 6px rgba(0,0,0,.9))",
                  }}>{subtitle}</p>
                </div>
              )}
              <div style={{height:1,marginTop:10,background:`linear-gradient(90deg, transparent, ${C}66, transparent)`}}/>
            </div>
          )}

          {/* ── PARTICIPANTE: su idioma arriba, traducción abajo ── */}
          {(remoteRaw || remoteSubtitle) && (
            <div style={{marginBottom:16,animation:"rise .25s ease"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                <span style={{fontSize:11,fontWeight:500,color:R,opacity:.75}}>Participante</span>
                <span style={{fontSize:10,color:"rgba(255,255,255,.2)"}}>·</span>
                <span style={{fontSize:10,color:"rgba(255,255,255,.2)",fontVariantNumeric:"tabular-nums"}}>{fmt(callDuration)}</span>
              </div>
              {/* línea 1: lo que dijo (su idioma) */}
              {remoteRaw && (
                <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:6}}>
                  <span style={{fontSize:15,flexShrink:0,marginTop:1}}>{LANG[toLang]?.flag}</span>
                  <p style={{
                    margin:0,fontSize:15,fontWeight:400,lineHeight:1.4,
                    color:"rgba(255,255,255,.55)",fontStyle:"italic",
                    filter:"drop-shadow(0 1px 4px rgba(0,0,0,.8))",
                  }}>{remoteRaw}</p>
                </div>
              )}
              {/* línea 2: la traducción (mi idioma) */}
              {remoteSubtitle && (
                <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
                  <span style={{fontSize:15,flexShrink:0,marginTop:1}}>{LANG[fromLang]?.flag}</span>
                  <p style={{
                    margin:0,fontSize:18,fontWeight:600,lineHeight:1.3,letterSpacing:"-.02em",
                    background:`linear-gradient(130deg, ${R} 0%, rgba(255,255,255,.95) 45%, ${C} 100%)`,
                    WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",
                    filter:"drop-shadow(0 1px 6px rgba(0,0,0,.9))",opacity:.9,
                  }}>{remoteSubtitle}</p>
                </div>
              )}
              <div style={{height:1,marginTop:10,background:`linear-gradient(90deg, transparent, ${R}66, transparent)`}}/>
            </div>
          )}

          {/* waveform when listening but no text yet */}
          {listening && !rawSubtitle && !subtitle && !remoteRaw && !remoteSubtitle && (
            <div style={{display:"flex",alignItems:"center",gap:2.5,height:28,justifyContent:"center"}}>
              {WAVE_H.map((h,i)=>(
                <span key={i} style={{
                  display:"block",width:2.5,height:h,borderRadius:2,
                  background: i<7 ? `rgba(0,212,232,${.2+(i/7)*.6})` : `rgba(255,92,106,${.75-((i-7)/8)*.45})`,
                  animation:`sway ${.55+(i%4)*.12}s ease-in-out ${i*.04}s infinite`,
                  transformOrigin:"center bottom",
                }}/>
              ))}
            </div>
          )}

          {/* status line removed for cleaner UI */}
        </div>

        {/* ── LANGUAGE SHEET ── */}
        {showLang && (
          <div onClick={()=>setShowLang(false)} style={{
            position:"absolute",inset:0,zIndex:60,
            background:"rgba(0,0,0,.55)",
            backdropFilter:"blur(6px)",WebkitBackdropFilter:"blur(6px)",
            display:"flex",alignItems:"flex-end",animation:"fadeIn .18s ease",
          }}>
            <div onClick={e=>e.stopPropagation()} style={{
              width:"100%",background:"rgba(8,9,14,.97)",
              backdropFilter:"blur(40px)",WebkitBackdropFilter:"blur(40px)",
              borderRadius:"22px 22px 0 0",paddingTop:10,
              paddingBottom:"max(32px,env(safe-area-inset-bottom))",
              paddingLeft:22,paddingRight:22,
              border:"0.5px solid rgba(255,255,255,.07)",animation:"slideUp .22s ease",
            }}>
              <div style={{width:36,height:3.5,borderRadius:2,background:"rgba(255,255,255,.14)",margin:"0 auto 20px"}}/>
              <div style={{height:.5,background:`linear-gradient(90deg,${C},${R})`,opacity:.3,marginBottom:20}}/>
              <SheetSection label="Yo hablo" codes={["es","en","fr","de"]}
                selected={fromLang} accent={C} onSelect={setFromLang}/>
              <div style={{height:20}}/>
              <SheetSection label="Traducir a" codes={["es","en","fr","de"]}
                selected={toLang} accent={R} onSelect={setToLang}/>
            </div>
          </div>
        )}

        {/* ── CONTROLS ── */}
        <div style={{
          position:"absolute",bottom:0,left:0,right:0,zIndex:40,
          paddingBottom:"max(28px,env(safe-area-inset-bottom))",
          paddingLeft:20,paddingRight:20,paddingTop:6,
        }}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>

            {/* Micrófono */}
            <Btn onPress={toggleMic}
              bg={micOn?"rgba(22,24,32,.88)":"rgba(255,59,48,.85)"}
              glow={!micOn?"rgba(255,59,48,.3)":undefined}
              label={micOn?"Silenciar":"Activar"}>
              {micOn?<IcoMic/>:<IcoMicOff/>}
            </Btn>

            {/* Cámara */}
            <Btn onPress={toggleCam}
              bg={camOn?"rgba(22,24,32,.88)":"rgba(255,59,48,.85)"}
              glow={!camOn?"rgba(255,59,48,.3)":undefined}
              label="Cámara">
              {camOn?<IcoCam/>:<IcoCamOff/>}
            </Btn>

            {/* Colgar — centro dominante */}
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:7}}>
              <button onClick={hangUp} style={{
                width:64,height:64,borderRadius:"50%",
                background:"linear-gradient(150deg,#ff4e5f,#e5303e)",
                border:"none",display:"flex",alignItems:"center",justifyContent:"center",
                cursor:"pointer",WebkitTapHighlightColor:"transparent",
                boxShadow:"0 4px 18px rgba(229,48,62,.35), 0 2px 6px rgba(229,48,62,.18)",
                animation:"halo 3.2s ease-in-out infinite",
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                  stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"
                  style={{transform:"rotate(135deg)"}}>
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
                </svg>
              </button>
              <span style={{fontSize:10.5,color:"rgba(255,255,255,.35)"}}>Colgar</span>
            </div>

            {/* Traducción viva */}
            <Btn onPress={listening?stopSpeechRecognition:startSpeechRecognition}
              bg={listening?C15:"rgba(22,24,32,.88)"}
              glow={listening?C30:undefined}
              border={listening?C30:undefined}
              label="Subtítulos"
              labelColor={listening?C:undefined}>
              <IcoCC color={listening?C:"rgba(255,255,255,.82)"}/>
            </Btn>

            {/* Cambiar idioma */}
            <Btn onPress={()=>setShowLang(true)}
              bg="rgba(22,24,32,.88)"
              label={`${LANG[fromLang]?.label}→${LANG[toLang]?.label}`}
              labelColor={C}>
              <IcoLang/>
            </Btn>

          </div>

          {/* footer privacidad */}
          <div style={{
            display:"flex",alignItems:"center",justifyContent:"center",gap:5,
            marginTop:10,
          }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
              stroke="rgba(255,255,255,.2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
            <span style={{fontSize:10,color:"rgba(255,255,255,.2)",letterSpacing:".02em"}}>
              Conversación privada y segura
            </span>
          </div>
        </div>

        {/* toast — enlace copiado */}
        {toastVisible && (
          <div style={{
            position:"absolute",
            top:"calc(env(safe-area-inset-top,50px) + 58px)",
            left:"50%",transform:"translateX(-50%)",
            zIndex:50,
            background:"rgba(20,22,32,.88)",
            backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
            border:"0.5px solid rgba(255,255,255,.14)",
            borderRadius:999,padding:"9px 18px",
            display:"flex",alignItems:"center",gap:7,
            animation:"rise .2s ease",whiteSpace:"nowrap",
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
              stroke={C} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span style={{fontSize:12,fontWeight:500,color:"rgba(255,255,255,.82)"}}>
              Enlace copiado
            </span>
          </div>
        )}

      </div>
      {/* end mobile */}

      {/* ═══════════════ DESKTOP ═══════════════════════════ */}
      <div className="hidden md:block" style={{
        position:"fixed", inset:0,
        background:"#03040d",
        fontFamily:"-apple-system,'SF Pro Display',sans-serif",
        WebkitFontSmoothing:"antialiased",
      }}>

        {/* remote video — fullscreen background */}
        <video ref={remoteVideoRef} autoPlay playsInline style={{
          position:"absolute", top:0, left:0,
          width:"100%", height:"100%",
          objectFit:"cover", zIndex:0,
          filter:"brightness(.85) contrast(1.02) saturate(.9)",
        }}/>

        {/* vignette */}
        <div style={{ position:"absolute",inset:0,pointerEvents:"none",zIndex:1,
          background:"radial-gradient(ellipse 80% 70% at 50% 40%, transparent 0%, rgba(3,4,13,.6) 100%)" }}/>
        {/* top scrim */}
        <div style={{ position:"absolute",top:0,left:0,right:0,height:180,pointerEvents:"none",zIndex:1,
          background:"linear-gradient(to bottom, rgba(3,4,13,.85) 0%, transparent 100%)" }}/>
        {/* bottom scrim */}
        <div style={{ position:"absolute",bottom:0,left:0,right:0,height:380,pointerEvents:"none",zIndex:1,
          background:"linear-gradient(to top, rgba(3,4,13,.98) 0%, rgba(3,4,13,.82) 40%, transparent 100%)" }}/>
        {/* ambient glows */}
        <div style={{ position:"absolute",bottom:-80,left:-60,width:400,height:400,borderRadius:"50%",
          background:"radial-gradient(circle, rgba(0,212,232,.04) 0%, transparent 70%)",pointerEvents:"none",zIndex:1 }}/>
        <div style={{ position:"absolute",bottom:-60,right:-80,width:360,height:360,borderRadius:"50%",
          background:"radial-gradient(circle, rgba(255,92,106,.03) 0%, transparent 70%)",pointerEvents:"none",zIndex:1 }}/>

        {/* ── TOP BAR ── */}
        <div style={{
          position:"absolute",top:0,left:0,right:0,zIndex:30,
          padding:"20px 28px 0",
          display:"flex",alignItems:"center",justifyContent:"space-between",
        }}>
          {/* logo */}
          <img src="/SPABLA_LOGO.png" alt="SPABLA" style={{height:28,width:"auto",opacity:.95}}/>

          {/* centre pill */}
          <div style={{
            display:"flex",alignItems:"center",gap:6,
            background:"rgba(255,255,255,.08)",
            backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",
            border:"0.5px solid rgba(255,255,255,.12)",
            borderRadius:999,padding:"7px 16px",
          }}>
            <div style={{display:"flex",alignItems:"center",gap:2,height:12}}>
              {[4,8,12,8,4].map((h,i)=>(
                <span key={i} style={{
                  display:"block",width:2,height:h,borderRadius:1,background:C,
                  opacity:listening?1:.4,
                  animation:listening?`sway .8s ease-in-out ${i*.1}s infinite`:"none",
                }}/>
              ))}
            </div>
            <span style={{fontSize:12,fontWeight:500,color:"rgba(255,255,255,.75)",letterSpacing:".02em"}}>
              Traducción activa
            </span>
            <span style={{
              width:5,height:5,borderRadius:"50%",background:C,
              boxShadow:`0 0 4px ${C}`,animation:"livedot 2s ease-in-out infinite",display:"inline-block",
            }}/>
          </div>

          {/* right actions */}
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <button onClick={shareConversation} style={{
              display:"flex",alignItems:"center",gap:6,
              background:"rgba(255,255,255,.08)",
              backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",
              border:"0.5px solid rgba(255,255,255,.15)",
              borderRadius:999,padding:"7px 14px",
              cursor:"pointer",WebkitTapHighlightColor:"transparent",
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="rgba(255,255,255,.8)" strokeWidth="1.9"
                strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/>
                <polyline points="16 6 12 2 8 6"/>
                <line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
              <span style={{fontSize:12,fontWeight:500,color:"rgba(255,255,255,.8)"}}>Compartir</span>
            </button>
            <button onClick={() => {
              const url = window.location.href;
              const msg = `¡Únete a mi conversación en SPABLA! Podemos hablar en nuestros idiomas en tiempo real.\n\n${url}`;
              window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
            }} style={{
              display:"flex",alignItems:"center",gap:6,
              background:"rgba(18,130,65,.75)",
              backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",
              border:"0.5px solid rgba(37,211,102,.2)",
              borderRadius:999,padding:"7px 14px",
              cursor:"pointer",WebkitTapHighlightColor:"transparent",
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>
              </svg>
              <span style={{fontSize:12,fontWeight:500,color:"rgba(255,255,255,.85)"}}>WhatsApp</span>
            </button>
          </div>
        </div>

        {/* ── LOCAL SELF VIEW ── */}
        <div style={{
          position:"absolute",top:72,right:28,
          width:200,aspectRatio:"16/9",
          borderRadius:16,overflow:"hidden",
          border:"1px solid rgba(255,255,255,.14)",
          boxShadow:"0 8px 32px rgba(0,0,0,.6)",
          zIndex:25,
        }}>
          <video ref={localVideoRef} autoPlay muted playsInline
            style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          {!camOn && (
            <div style={{position:"absolute",inset:0,background:"#0a0a12",
              display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="rgba(255,255,255,.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="2" y1="2" x2="22" y2="22"/>
                <path d="M10.29 7H6a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-.71M15 10l4.55-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.45.894L15 14"/>
              </svg>
            </div>
          )}
          <div style={{
            position:"absolute",bottom:6,left:6,
            display:"flex",alignItems:"center",gap:4,
          }}>
            <div style={{
              width:6,height:6,borderRadius:"50%",
              background:micOn?C:R,
              boxShadow:micOn?`0 0 4px ${C}`:`0 0 4px ${R}`,
            }}/>
            <span style={{fontSize:10,color:"rgba(255,255,255,.55)",fontWeight:500}}>
              {LANG[fromLang]?.flag} Tú
            </span>
          </div>
        </div>

        {/* ── TRANSLATION AREA ── */}
        <div style={{
          position:"absolute",bottom:160,left:0,right:0,zIndex:30,
          padding:"0 10%",maxWidth:900,margin:"0 auto",
          display:"flex",flexDirection:"column",gap:0,
        }}>
          {/* my message */}
          {(rawSubtitle||subtitle) && (
            <div style={{marginBottom:20,animation:"rise .25s ease"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                <span style={{fontSize:12,fontWeight:500,color:C,opacity:.75}}>Tú</span>
                <span style={{fontSize:11,color:"rgba(255,255,255,.2)"}}>·</span>
                <span style={{fontSize:11,color:"rgba(255,255,255,.2)",fontVariantNumeric:"tabular-nums"}}>{fmt(callDuration)}</span>
              </div>
              {rawSubtitle && (
                <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:8}}>
                  <span style={{fontSize:18,flexShrink:0,marginTop:2}}>{LANG[fromLang]?.flag}</span>
                  <p style={{
                    margin:0,fontSize:17,fontWeight:400,lineHeight:1.5,
                    color:"rgba(255,255,255,.5)",fontStyle:"italic",
                    filter:"drop-shadow(0 1px 4px rgba(0,0,0,.9))",
                  }}>{rawSubtitle}</p>
                </div>
              )}
              {subtitle && (
                <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                  <span style={{fontSize:18,flexShrink:0,marginTop:2}}>{LANG[toLang]?.flag}</span>
                  <p style={{
                    margin:0,fontSize:28,fontWeight:600,lineHeight:1.25,letterSpacing:"-.02em",
                    background:`linear-gradient(130deg, ${C} 0%, rgba(255,255,255,.95) 45%, ${R} 100%)`,
                    WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",
                    filter:"drop-shadow(0 2px 8px rgba(0,0,0,.9))",
                  }}>{subtitle}</p>
                </div>
              )}
              <div style={{height:1,marginTop:14,background:`linear-gradient(90deg, transparent, ${C}55, transparent)`}}/>
            </div>
          )}

          {/* remote message */}
          {(remoteRaw||remoteSubtitle) && (
            <div style={{marginBottom:16,animation:"rise .25s ease"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                <span style={{fontSize:12,fontWeight:500,color:R,opacity:.75}}>Participante</span>
                <span style={{fontSize:11,color:"rgba(255,255,255,.2)"}}>·</span>
                <span style={{fontSize:11,color:"rgba(255,255,255,.2)",fontVariantNumeric:"tabular-nums"}}>{fmt(callDuration)}</span>
              </div>
              {remoteRaw && (
                <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:8}}>
                  <span style={{fontSize:18,flexShrink:0,marginTop:2}}>{LANG[toLang]?.flag}</span>
                  <p style={{
                    margin:0,fontSize:17,fontWeight:400,lineHeight:1.5,
                    color:"rgba(255,255,255,.5)",fontStyle:"italic",
                    filter:"drop-shadow(0 1px 4px rgba(0,0,0,.9))",
                  }}>{remoteRaw}</p>
                </div>
              )}
              {remoteSubtitle && (
                <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                  <span style={{fontSize:18,flexShrink:0,marginTop:2}}>{LANG[fromLang]?.flag}</span>
                  <p style={{
                    margin:0,fontSize:28,fontWeight:600,lineHeight:1.25,letterSpacing:"-.02em",
                    background:`linear-gradient(130deg, ${R} 0%, rgba(255,255,255,.95) 45%, ${C} 100%)`,
                    WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",
                    filter:"drop-shadow(0 2px 8px rgba(0,0,0,.9))",opacity:.9,
                  }}>{remoteSubtitle}</p>
                </div>
              )}
              <div style={{height:1,marginTop:14,background:`linear-gradient(90deg, transparent, ${R}55, transparent)`}}/>
            </div>
          )}

          {/* waveform idle */}
          {listening && !rawSubtitle && !subtitle && !remoteRaw && !remoteSubtitle && (
            <div style={{display:"flex",alignItems:"center",gap:3,height:32,justifyContent:"center"}}>
              {WAVE_H.map((h,i)=>(
                <span key={i} style={{
                  display:"block",width:3,height:h,borderRadius:2,
                  background:i<7?`rgba(0,212,232,${.2+(i/7)*.6})`:`rgba(255,92,106,${.75-((i-7)/8)*.45})`,
                  animation:`sway ${.55+(i%4)*.12}s ease-in-out ${i*.04}s infinite`,
                  transformOrigin:"center bottom",
                }}/>
              ))}
            </div>
          )}
        </div>

        {/* ── LANGUAGE SHEET DESKTOP ── */}
        {showLang && (
          <div onClick={()=>setShowLang(false)} style={{
            position:"absolute",inset:0,zIndex:60,
            background:"rgba(0,0,0,.55)",
            backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",
            display:"flex",alignItems:"center",justifyContent:"center",
            animation:"fadeIn .18s ease",
          }}>
            <div onClick={e=>e.stopPropagation()} style={{
              background:"rgba(10,11,18,.96)",
              backdropFilter:"blur(40px)",WebkitBackdropFilter:"blur(40px)",
              borderRadius:24,padding:"32px 36px",width:420,
              border:"0.5px solid rgba(255,255,255,.08)",
              animation:"rise .22s ease",
            }}>
              <div style={{height:.5,background:`linear-gradient(90deg,${C},${R})`,opacity:.3,marginBottom:28}}/>
              <SheetSection label="Yo hablo" codes={["es","en","fr","de"]}
                selected={fromLang} accent={C} onSelect={setFromLang}/>
              <div style={{height:24}}/>
              <SheetSection label="Traducir a" codes={["es","en","fr","de"]}
                selected={toLang} accent={R} onSelect={setToLang}/>
              <button onClick={()=>setShowLang(false)} style={{
                marginTop:28,width:"100%",padding:"12px",borderRadius:14,
                background:"rgba(255,255,255,.06)",border:"0.5px solid rgba(255,255,255,.1)",
                color:"rgba(255,255,255,.6)",fontSize:13,cursor:"pointer",
              }}>Cerrar</button>
            </div>
          </div>
        )}

        {/* ── CONTROLS ── */}
        <div style={{
          position:"absolute",bottom:0,left:0,right:0,zIndex:40,
          paddingBottom:32,paddingLeft:28,paddingRight:28,paddingTop:6,
          display:"flex",flexDirection:"column",alignItems:"center",gap:0,
        }}>
          <div style={{display:"flex",alignItems:"center",gap:16}}>

            <Btn onPress={toggleMic}
              bg={micOn?"rgba(22,24,32,.88)":"rgba(255,59,48,.85)"}
              glow={!micOn?"rgba(255,59,48,.28)":undefined}
              label={micOn?"Silenciar":"Activar"}>
              {micOn?<IcoMic/>:<IcoMicOff/>}
            </Btn>

            <Btn onPress={toggleCam}
              bg={camOn?"rgba(22,24,32,.88)":"rgba(255,59,48,.85)"}
              glow={!camOn?"rgba(255,59,48,.28)":undefined}
              label="Cámara">
              {camOn?<IcoCam/>:<IcoCamOff/>}
            </Btn>

            {/* hangup */}
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:7}}>
              <button onClick={hangUp} style={{
                width:64,height:64,borderRadius:"50%",
                background:"linear-gradient(150deg,#ff4e5f,#e5303e)",
                border:"none",display:"flex",alignItems:"center",justifyContent:"center",
                cursor:"pointer",WebkitTapHighlightColor:"transparent",
                boxShadow:"0 4px 18px rgba(229,48,62,.35), 0 2px 6px rgba(229,48,62,.18)",
                animation:"halo 3.2s ease-in-out infinite",
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                  stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"
                  style={{transform:"rotate(135deg)"}}>
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
                </svg>
              </button>
              <span style={{fontSize:11,color:"rgba(255,255,255,.35)"}}>Colgar</span>
            </div>

            <Btn onPress={listening?stopSpeechRecognition:startSpeechRecognition}
              bg={listening?C15:"rgba(22,24,32,.88)"}
              glow={listening?C30:undefined}
              border={listening?C30:undefined}
              label="Subtítulos"
              labelColor={listening?C:undefined}>
              <IcoCC color={listening?C:"rgba(255,255,255,.82)"}/>
            </Btn>

            <Btn onPress={()=>setShowLang(true)}
              bg="rgba(22,24,32,.88)"
              label={`${LANG[fromLang]?.label}→${LANG[toLang]?.label}`}
              labelColor={C}>
              <IcoLang/>
            </Btn>

          </div>

          {/* footer */}
          <div style={{
            display:"flex",alignItems:"center",justifyContent:"center",gap:5,marginTop:10,
          }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
              stroke="rgba(255,255,255,.2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
            <span style={{fontSize:11,color:"rgba(255,255,255,.2)",letterSpacing:".02em"}}>
              Conversación privada y segura
            </span>
          </div>
        </div>

      </div>
      {/* end desktop */}

    </>
  );
}

/* ─── sub-components ────────────────────────────────────── */
function SheetSection({ label, codes, selected, accent, onSelect }: {
  label: string; codes: string[]; selected: string; accent: string; onSelect: (c:string)=>void;
}) {
  return (
    <>
      <p style={{margin:"0 0 10px",fontSize:11,color:"rgba(255,255,255,.28)",textTransform:"uppercase",letterSpacing:".08em"}}>{label}</p>
      <div style={{display:"flex",gap:9}}>
        {codes.map(c=>(
          <button key={c} onClick={()=>onSelect(c)} style={{
            flex:1,padding:"12px 0",borderRadius:14,
            border: selected===c ? `1px solid ${accent}55` : "0.5px solid rgba(255,255,255,.07)",
            background: selected===c ? `${accent}14` : "rgba(255,255,255,.025)",
            color: selected===c ? accent : "rgba(255,255,255,.32)",
            fontSize:13,fontWeight: selected===c ? 600 : 400,cursor:"pointer",
            display:"flex",flexDirection:"column",alignItems:"center",gap:4,
          }}>
            <span style={{fontSize:20}}>{LANG[c]?.flag}</span>
            <span>{LANG[c]?.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function Btn({ onPress, children, label, bg, glow, border, labelColor }: {
  onPress:()=>void; children:React.ReactNode; label:string; bg:string;
  glow?:string; border?:string; labelColor?:string;
}) {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:7}}>
      <button onClick={onPress} style={{
        width:52,height:52,borderRadius:"50%",background:bg,
        backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
        border:`0.5px solid ${border??"rgba(255,255,255,.09)"}`,
        boxShadow: glow ? `0 0 12px ${glow}, 0 3px 10px rgba(0,0,0,.38)` : "0 3px 10px rgba(0,0,0,.38)",
        display:"flex",alignItems:"center",justifyContent:"center",
        cursor:"pointer",WebkitTapHighlightColor:"transparent",
      }}>{children}</button>
      <span style={{fontSize:10.5,letterSpacing:".01em",fontWeight:400,whiteSpace:"nowrap",
        color:labelColor??"rgba(255,255,255,.32)"}}>{label}</span>
    </div>
  );
}

/* ─── icons ─────────────────────────────────────────────── */
const ip = (c="rgba(255,255,255,.82)") => ({
  width:20, height:20, viewBox:"0 0 24 24",
  fill:"none" as const, stroke:c, strokeWidth:1.75,
  strokeLinecap:"round" as const, strokeLinejoin:"round" as const,
});
function IcoMic()    { return <svg {...ip()}><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0014 0M12 19v3M9 22h6"/></svg>; }
function IcoMicOff() { return <svg {...ip()}><line x1="2" y1="2" x2="22" y2="22"/><path d="M18.89 13.23A7 7 0 0019 12v-2M5 10a7 7 0 0010.17 6.38M15 9.34V5a3 3 0 00-5.68-1.33M9 9v3a3 3 0 005.12 2.12M12 19v3M9 22h6"/></svg>; }
function IcoCam()    { return <svg {...ip()}><path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14"/><rect x="2" y="7" width="13" height="10" rx="2"/></svg>; }
function IcoCamOff() { return <svg {...ip()}><line x1="2" y1="2" x2="22" y2="22"/><path d="M10.29 7H6a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-.71M15 10l4.55-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.45.894L15 14"/></svg>; }
function IcoCC({ color="rgba(255,255,255,.85)" }:{ color?:string }) {
  return <svg {...ip(color)}><rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M7 12.5c.45-.9 1.4-1.5 2.5-1.5s2.05.6 2.5 1.5M14 12.5c.45-.9 1.4-1.5 2.5-1.5s2.05.6 2.5 1.5"/></svg>;
}
function IcoLang() {
  return <svg {...ip()}><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>;
}
