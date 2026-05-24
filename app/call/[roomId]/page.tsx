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
  es: { label: "ES", flag: "🇪🇸", full: "Español" },
  en: { label: "EN", flag: "🇬🇧", full: "English" },
  fr: { label: "FR", flag: "🇫🇷", full: "Français" },
  de: { label: "DE", flag: "🇩🇪", full: "Deutsch" },
};

/* ─── tokens ──────────────────────────────────────────────── */
const C   = "#00D4E8";
const R   = "#FF5C6A";
const C15 = "rgba(0,212,232,0.15)";
const C30 = "rgba(0,212,232,0.30)";
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
  const [remoteSubtitle,setRemoteSubtitle]= useState("");
  const [remoteRaw,     setRemoteRaw]     = useState("");
  const [listening,     setListening]     = useState(false);
  const [fromLang,      setFromLang]      = useState("es");
  const [toLang,        setToLang]        = useState("en");
  const [copied,        setCopied]        = useState(false);
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

  function shareWhatsApp() {
    const url = window.location.href;
    const msg = `¡Te invito a una llamada en SPABLA! Podemos hablar en nuestros idiomas y entendernos en tiempo real.\n\nÚnete aquí: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
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
        const tr = lang !== toLang ? await translate(text, lang, toLang) : text;
        setSubtitle(tr);
        setTimeout(() => setWaveActive(false), 2000);
        socketRef.current?.emit("subtitle", { roomId, originalText: text, translatedText: tr, fromLang: lang, toLang, ts: Date.now() });
      }
    });
    setListening(true);
  }

  function stopSpeechRecognition() {
    teardownAudio();
    setListening(false); setSubtitle(""); setWaveActive(false);
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
    socket.on("subtitle", (data: { translatedText: string; fromLang: string }) => {
      setRemoteSubtitle(data.translatedText);
      setTimeout(() => setRemoteSubtitle(""), 6000);
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
        @keyframes pip     { 0%,100%{box-shadow:0 4px 20px rgba(0,0,0,.6)} 50%{box-shadow:0 4px 20px rgba(0,0,0,.6),0 0 0 1.5px rgba(0,212,232,.3)} }
        @keyframes livedot { 0%,100%{opacity:.3;transform:scale(.7)} 50%{opacity:1;transform:scale(1)} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse   { 0%,100%{opacity:.5} 50%{opacity:1} }
      `}</style>

      {/* ═══════════════ MOBILE ════════════════════════════ */}
      <div className="md:hidden" style={{
        position:"fixed", inset:0, background:"#05050a", overflow:"hidden",
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
          background:"radial-gradient(ellipse 75% 65% at 50% 38%, transparent 0%, rgba(5,5,10,.6) 100%)" }}/>
        {/* top scrim */}
        <div style={{ position:"absolute",top:0,left:0,right:0,height:200,pointerEvents:"none",zIndex:1,
          background:"linear-gradient(to bottom, rgba(5,5,10,.78) 0%, rgba(5,5,10,.15) 70%, transparent 100%)" }}/>
        {/* bottom scrim */}
        <div style={{ position:"absolute",bottom:0,left:0,right:0,height:420,pointerEvents:"none",zIndex:1,
          background:"linear-gradient(to top, rgba(5,5,10,.98) 0%, rgba(5,5,10,.82) 38%, rgba(5,5,10,.35) 65%, transparent 100%)" }}/>
        {/* ambient glows */}
        <div style={{ position:"absolute",bottom:-50,left:-40,width:220,height:220,borderRadius:"50%",
          background:"radial-gradient(circle, rgba(0,212,232,.06) 0%, transparent 70%)",pointerEvents:"none",zIndex:1 }}/>
        <div style={{ position:"absolute",bottom:-30,right:-50,width:200,height:200,borderRadius:"50%",
          background:"radial-gradient(circle, rgba(255,92,106,.05) 0%, transparent 70%)",pointerEvents:"none",zIndex:1 }}/>

        {/* ── TOP BAR ── */}
        <div style={{
          position:"absolute",top:0,left:0,right:0,zIndex:30,
          paddingTop:"env(safe-area-inset-top,50px)",
          padding:"env(safe-area-inset-top,50px) 16px 0",
          display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:6,
          flexWrap:"nowrap",
        }}>
          {/* back chevron */}
          <button onClick={hangUp} style={{
            width:38,height:38,borderRadius:"50%",flexShrink:0,
            background:"rgba(255,255,255,.08)",
            backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",
            border:"0.5px solid rgba(255,255,255,.12)",
            display:"flex",alignItems:"center",justifyContent:"center",
            cursor:"pointer",WebkitTapHighlightColor:"transparent",
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="rgba(255,255,255,.8)" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>

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
              Traducción en tiempo real
            </span>
            {/* live dot */}
            <span style={{
              width:5,height:5,borderRadius:"50%",background:C,flexShrink:0,
              boxShadow:`0 0 5px ${C}`,animation:"livedot 2s ease-in-out infinite",display:"inline-block",
            }}/>
          </div>

          {/* invitar button */}
          <button onClick={shareWhatsApp} style={{
            display:"flex",alignItems:"center",gap:5,flexShrink:0,
            background:"rgba(37,211,102,0.88)",
            backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",
            border:"none",borderRadius:999,padding:"7px 12px",
            cursor:"pointer",WebkitTapHighlightColor:"transparent",
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>
            </svg>
            <span style={{fontSize:11,fontWeight:600,color:"#fff",letterSpacing:".01em"}}>Invitar</span>
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
            boxShadow: micOn ? `0 0 5px ${C}` : `0 0 5px ${R}`,
          }}/>
        </div>

        {/* ── CONVERSATION / SUBTITLE AREA ── */}
        <div style={{
          position:"absolute",bottom:158,left:0,right:0,zIndex:30,
          padding:"0 22px",
        }}>
          {/* User line — my speech translated */}
          {subtitle && (
            <div style={{marginBottom:16,animation:"rise .25s ease"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                <span style={{fontSize:11,fontWeight:500,color:C,opacity:.85}}>Tú</span>
                <span style={{fontSize:10,color:"rgba(255,255,255,.28)"}}>·</span>
                <span style={{fontSize:10,color:"rgba(255,255,255,.28)",fontVariantNumeric:"tabular-nums"}}>{fmt(callDuration)}</span>
              </div>
              <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
                <span style={{fontSize:16,flexShrink:0,marginTop:2}}>{LANG[fromLang]?.flag}</span>
                <p style={{
                  margin:0,fontSize:18,fontWeight:600,lineHeight:1.3,letterSpacing:"-.02em",
                  background:`linear-gradient(130deg, ${C} 0%, rgba(255,255,255,.95) 45%, ${R} 100%)`,
                  WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",
                  filter:"drop-shadow(0 1px 6px rgba(0,0,0,.9))",
                }}>{subtitle}</p>
              </div>
              {/* cyan divider */}
              <div style={{
                height:1,marginTop:10,
                background:`linear-gradient(90deg, transparent, ${C}88, transparent)`,
              }}/>
            </div>
          )}

          {/* Remote line — their speech translated */}
          {remoteSubtitle && (
            <div style={{marginBottom:12,animation:"rise .25s ease"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                <span style={{fontSize:11,fontWeight:500,color:R,opacity:.85}}>Participante</span>
                <span style={{fontSize:10,color:"rgba(255,255,255,.28)"}}>·</span>
                <span style={{fontSize:10,color:"rgba(255,255,255,.28)",fontVariantNumeric:"tabular-nums"}}>{fmt(callDuration)}</span>
              </div>
              <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
                <span style={{fontSize:16,flexShrink:0,marginTop:2}}>{LANG[toLang]?.flag}</span>
                <p style={{
                  margin:0,fontSize:18,fontWeight:600,lineHeight:1.3,letterSpacing:"-.02em",
                  background:`linear-gradient(130deg, ${R} 0%, rgba(255,255,255,.95) 45%, ${C} 100%)`,
                  WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",
                  filter:"drop-shadow(0 1px 6px rgba(0,0,0,.9))",
                  opacity:.9,
                }}>{remoteSubtitle}</p>
              </div>
              {/* coral divider */}
              <div style={{
                height:1,marginTop:10,
                background:`linear-gradient(90deg, transparent, ${R}88, transparent)`,
              }}/>
            </div>
          )}

          {/* waveform when listening but no text yet */}
          {listening && !subtitle && !remoteSubtitle && (
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

          {/* status */}
          {listening && (
            <div style={{display:"flex",alignItems:"center",gap:5,justifyContent:"center",marginTop:6}}>
              <div style={{display:"flex",alignItems:"center",gap:1.5,height:10}}>
                {[3,6,9,6,3].map((h,i)=>(
                  <span key={i} style={{
                    display:"block",width:1.5,height:h,borderRadius:1,background:C,
                    animation:`sway .9s ease-in-out ${i*.08}s infinite`,opacity:.7,
                  }}/>
                ))}
              </div>
              <span style={{fontSize:11,color:"rgba(255,255,255,.35)"}}>
                Hablando en {LANG[fromLang]?.full?.toLowerCase()}
              </span>
            </div>
          )}
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
                boxShadow:"0 5px 24px rgba(229,48,62,.45), 0 2px 8px rgba(229,48,62,.25)",
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
      </div>
      {/* end mobile */}

      {/* ═══════════════ DESKTOP ═══════════════════════════ */}
      <div className="hidden md:flex flex-col min-h-screen bg-gray-950 text-white">
        <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <img src="/LOGOTIPO_SPABLA.png" alt="SPABLA" className="h-10 w-auto"/>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">Sala:</span>
            <span className="text-sm font-mono bg-gray-800 px-3 py-1 rounded-lg text-gray-200">{roomId}</span>
            <button onClick={copyLink} className="text-xs bg-gray-800 hover:bg-gray-700 transition-colors px-3 py-1 rounded-lg text-gray-300">
              {copied?"Copiado!":"Copiar enlace"}
            </button>
            <button onClick={shareWhatsApp} className="text-xs bg-green-700 hover:bg-green-600 transition-colors px-3 py-1 rounded-lg text-white font-medium">
              WhatsApp
            </button>
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"/>
            <span className="text-xs text-green-400">En linea</span>
          </div>
        </nav>
        <main className="flex flex-col flex-1 items-center justify-center gap-6 p-6">
          <div className="flex gap-4 w-full max-w-5xl">
            <div className="flex-1 aspect-video bg-gray-900 rounded-2xl overflow-hidden relative shadow-lg">
              <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover"/>
              {!camOn&&<div className="absolute inset-0 bg-gray-900 flex items-center justify-center"><span className="text-gray-600 text-sm">Camara apagada</span></div>}
              <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-xl">
                <div className={`w-2 h-2 rounded-full ${micOn?"bg-green-400":"bg-red-400"}`}/>
                <span className="text-xs font-medium text-white">Tu</span>
              </div>
            </div>
            <div className="flex-1 aspect-video bg-gray-900 rounded-2xl overflow-hidden relative shadow-lg">
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover"/>
              <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-xl">
                <div className="w-2 h-2 rounded-full bg-gray-500"/>
                <span className="text-xs font-medium text-gray-400">Participante</span>
              </div>
            </div>
          </div>
          <div className="w-full max-w-5xl bg-gray-900 border border-gray-800 rounded-2xl px-6 py-4 min-h-20 flex flex-col gap-2 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600 font-medium uppercase tracking-widest">Subtitulos</span>
              <div className="flex items-center gap-2">
                <select value={fromLang} onChange={e=>setFromLang(e.target.value)} className="bg-gray-800 text-xs text-gray-300 px-2 py-1 rounded-lg border border-gray-700">
                  <option value="es">Espanol</option><option value="en">Ingles</option>
                  <option value="fr">Frances</option><option value="de">Aleman</option>
                </select>
                <span className="text-gray-600 text-xs">to</span>
                <select value={toLang} onChange={e=>setToLang(e.target.value)} className="bg-gray-800 text-xs text-gray-300 px-2 py-1 rounded-lg border border-gray-700">
                  <option value="en">Ingles</option><option value="es">Espanol</option>
                  <option value="fr">Frances</option><option value="de">Aleman</option>
                </select>
                {listening&&<span className="flex items-center gap-1 text-xs text-green-400"><span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"/>Escuchando</span>}
              </div>
            </div>
            <p className={`text-sm ${listening?"text-white":"text-gray-500 italic"}`}>{subtitle||remoteSubtitle}</p>
          </div>
          <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-2xl px-6 py-4 shadow-lg">
            <button onClick={toggleMic} className={`flex flex-col items-center gap-1 transition-colors px-5 py-3 rounded-xl ${micOn?"bg-gray-800 hover:bg-gray-700":"bg-red-900 hover:bg-red-800"}`}>
              <span className="text-lg">{micOn?"mic":"mute"}</span>
              <span className="text-xs text-gray-400">{micOn?"Silenciar":"Activar mic"}</span>
            </button>
            <button onClick={toggleCam} className={`flex flex-col items-center gap-1 transition-colors px-5 py-3 rounded-xl ${camOn?"bg-gray-800 hover:bg-gray-700":"bg-red-900 hover:bg-red-800"}`}>
              <span className="text-lg">{camOn?"cam":"off"}</span>
              <span className="text-xs text-gray-400">{camOn?"Camara":"Sin camara"}</span>
            </button>
            <button onClick={listening?stopSpeechRecognition:startSpeechRecognition}
              className={`flex flex-col items-center gap-1 transition-colors px-5 py-3 rounded-xl ${listening?"bg-green-600 hover:bg-green-500":"bg-gray-800 hover:bg-gray-700"}`}>
              <span className="text-lg">CC</span>
              <span className="text-xs text-gray-400">Subtitulos</span>
            </button>
            <div className="w-px h-10 bg-gray-700 mx-1"/>
            <button onClick={hangUp} className="flex flex-col items-center gap-1 bg-red-600 hover:bg-red-500 transition-colors px-5 py-3 rounded-xl">
              <span className="text-lg">X</span>
              <span className="text-xs text-red-200">Colgar</span>
            </button>
          </div>
        </main>
      </div>
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
        boxShadow: glow ? `0 0 18px ${glow}, 0 3px 10px rgba(0,0,0,.38)` : "0 3px 10px rgba(0,0,0,.38)",
        display:"flex",alignItems:"center",justifyContent:"center",
        cursor:"pointer",WebkitTapHighlightColor:"transparent",
      }}>{children}</button>
      <span style={{fontSize:10.5,letterSpacing:".01em",fontWeight:400,whiteSpace:"nowrap",
        color:labelColor??"rgba(255,255,255,.32)"}}>{label}</span>
    </div>
  );
}

/* ─── icons ─────────────────────────────────────────────── */
const ip = (c="rgba(255,255,255,.85)") => ({
  width:19,height:19,viewBox:"0 0 24 24",
  fill:"none" as const,stroke:c,strokeWidth:1.75,
  strokeLinecap:"round" as const,strokeLinejoin:"round" as const,
});
function IcoMic()    { return <svg {...ip()}><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0014 0M12 19v3M9 22h6"/></svg>; }
function IcoMicOff() { return <svg {...ip()}><line x1="2" y1="2" x2="22" y2="22"/><path d="M18.89 13.23A7 7 0 0019 12v-2M5 10a7 7 0 0010.17 6.38M15 9.34V5a3 3 0 00-5.68-1.33M9 9v3a3 3 0 005.12 2.12M12 19v3M9 22h6"/></svg>; }
function IcoCam()    { return <svg {...ip()}><path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14"/><rect x="2" y="7" width="13" height="10" rx="2"/></svg>; }
function IcoCamOff() { return <svg {...ip()}><line x1="2" y1="2" x2="22" y2="22"/><path d="M10.29 7H6a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-.71M15 10l4.55-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.45.894L15 14"/></svg>; }
function IcoCC({ color="rgba(255,255,255,.85)" }:{ color?:string }) {
  return <svg {...ip(color)}><rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M7 12.5c.45-.9 1.4-1.5 2.5-1.5s2.05.6 2.5 1.5M14 12.5c.45-.9 1.4-1.5 2.5-1.5s2.05.6 2.5 1.5"/></svg>;
}
function IcoLang() {
  return <svg {...ip()}><path d="M5 8l4 4-4 4M11 12h8M15 8l4 4-4 4"/></svg>;
}
