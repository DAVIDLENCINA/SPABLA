"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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
const LANG: Record<string, { label: string; flag: string }> = {
  es: { label: "ES", flag: "🇪🇸" },
  en: { label: "EN", flag: "🇬🇧" },
  fr: { label: "FR", flag: "🇫🇷" },
  de: { label: "DE", flag: "🇩🇪" },
};

/* ─── design tokens ───────────────────────────────────────── */
const C   = "#00D4E8";
const R   = "#FF5C6A";
const C8  = "rgba(0,212,232,0.08)";
const C15 = "rgba(0,212,232,0.15)";
const C30 = "rgba(0,212,232,0.30)";
const R8  = "rgba(255,92,106,0.08)";
const R15 = "rgba(255,92,106,0.15)";
const R30 = "rgba(255,92,106,0.30)";

/* ═══════════════════════════════════════════════════════════ */
export default function CallPage() {
  const { roomId } = useParams<{ roomId: string }>();

  /* ── video refs ── */
  const localVideoRef        = useRef<HTMLVideoElement>(null);
  const remoteVideoRef       = useRef<HTMLVideoElement>(null);
  const localVideoMobileRef  = useRef<HTMLVideoElement>(null);
  const remoteVideoMobileRef = useRef<HTMLVideoElement>(null);

  /* ── connection refs ── */
  const glotRef        = useRef<GLOTConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);           // kept for cleanup safety
  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const socketRef      = useRef<ReturnType<typeof io> | null>(null);

  /* ── Deepgram audio pipeline refs ── */
  const audioContextRef  = useRef<AudioContext | null>(null);
  const processorRef     = useRef<ScriptProcessorNode | null>(null);
  const dgLangRef        = useRef<string>("es");

  /* ── state ── */
  const [subtitle,      setSubtitle]      = useState("");
  const [rawSubtitle,   setRawSubtitle]   = useState("");
  const [remoteSubtitle,setRemoteSubtitle]= useState("");
  const [listening,     setListening]     = useState(false);
  const [fromLang,      setFromLang]      = useState("es");
  const [toLang,        setToLang]        = useState("en");
  const [copied,        setCopied]        = useState(false);
  const [micOn,         setMicOn]         = useState(true);
  const [camOn,         setCamOn]         = useState(true);
  const [showLang,      setShowLang]      = useState(false);
  const [callDuration,  setCallDuration]  = useState(0);
  const [waveActive,    setWaveActive]    = useState(false);

  /* ── timer ── */
  useEffect(() => {
    timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  function fmt(s: number) {
    return `${Math.floor(s / 60).toString().padStart(2,"0")}:${(s % 60).toString().padStart(2,"0")}`;
  }

  /* ── helpers ── */
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

  /* ── audio pipeline teardown (shared) ── */
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
    recognitionRef.current?.stop();
    window.location.href = "/";
  }

  /* ── Deepgram STT start ── */
  function startSpeechRecognition() {
    if (!localStreamRef.current) return;
    if (!socketRef.current)      return;

    // keep a stable ref to fromLang for the async translate callback
    dgLangRef.current = fromLang;

    // tell server to open a Deepgram session
    const langMap: Record<string,string> = { es:"es", en:"en", fr:"fr", de:"de" };
    socketRef.current.emit("transcribe-start", { lang: langMap[fromLang] ?? "es" });

    // tap the existing WebRTC mic stream non-destructively via AudioContext
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx({ sampleRate: 48000 });
    audioContextRef.current = ctx;

    // resume is required on Android Chrome — AudioContext starts suspended
    ctx.resume().then(() => {
      if (!localStreamRef.current) return;

      const source    = ctx.createMediaStreamSource(localStreamRef.current);
      // bufferSize 4096 → ~85ms chunks at 48kHz; good balance for mobile
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!socketRef.current) return;
        const float32 = e.inputBuffer.getChannelData(0);
        // convert Float32 → Int16 PCM (linear16, matching server Deepgram config)
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          const s = Math.max(-1, Math.min(1, float32[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        socketRef.current.emit("audio-chunk", int16.buffer);
      };

      // connect: source → processor → destination
      // must connect to destination even if we don't want speaker output,
      // otherwise Chrome silently drops the onaudioprocess callbacks
      source.connect(processor);
      processor.connect(ctx.destination);
    });

    // receive transcripts from server
    socketRef.current.off("transcript-result");
    socketRef.current.on("transcript-result", async ({
      text, isFinal, error,
    }: { text: string; isFinal: boolean; error?: boolean }) => {
      if (error || !text.trim()) return;
      const lang = dgLangRef.current;
      setRawSubtitle(text);
      if (isFinal) {
        setWaveActive(true);
        const tr = lang !== toLang ? await translate(text, lang, toLang) : text;
        setSubtitle(tr);
        setTimeout(() => setWaveActive(false), 2000);
        // emit translated subtitle to remote participant via existing socket event
        socketRef.current?.emit("subtitle", {
          roomId,
          originalText:   text,
          translatedText: tr,
          fromLang:       lang,
          toLang,
          ts: Date.now(),
        });
      }
    });

    setListening(true);
  }

  /* ── Deepgram STT stop ── */
  function stopSpeechRecognition() {
    teardownAudio();
    setListening(false);
    setSubtitle("");
    setRawSubtitle("");
    setWaveActive(false);
  }

  /* ── WebRTC + signaling (untouched logic) ── */
  useEffect(() => {
    if (!roomId) return;

    const socket = io(
      process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001",
      { transports: ["polling"] }
    );
    socketRef.current = socket;

    const glot = new GLOTConnection();
    glotRef.current = glot;
    const pc = glot.getConnection();
    let remoteUserId: string | null = null;

    pc.ontrack = (e) => {
      if (remoteVideoRef.current)       remoteVideoRef.current.srcObject       = e.streams[0];
      if (remoteVideoMobileRef.current) remoteVideoMobileRef.current.srcObject = e.streams[0];
    };
    pc.onicecandidate = (e) => {
      if (e.candidate && remoteUserId)
        socket.emit("ice-candidate", { to: remoteUserId, candidate: e.candidate });
    };

    async function start() {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current)       localVideoRef.current.srcObject       = stream;
      if (localVideoMobileRef.current) localVideoMobileRef.current.srcObject = stream;
      glot.addLocalStream(stream);
      socket.emit("join-room", roomId);
    }

    socket.on("user-joined", async (userId: string) => {
      remoteUserId = userId;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("offer", { to: userId, offer });
    });
    socket.on("offer", async ({ from, offer }: { from: string; offer: RTCSessionDescriptionInit }) => {
      remoteUserId = from;
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("answer", { to: from, answer });
    });
    socket.on("answer", async ({ answer }: { answer: RTCSessionDescriptionInit }) => {
      await pc.setRemoteDescription(answer);
    });
    socket.on("ice-candidate", async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      await pc.addIceCandidate(candidate);
    });

    /* receive remote subtitles */
    socket.on("subtitle", (data: { translatedText: string }) => {
      setRemoteSubtitle(data.translatedText);
      setTimeout(() => setRemoteSubtitle(""), 6000);
    });

    start();

    return () => {
      teardownAudio();
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      glot.close();
      socket.disconnect();
      recognitionRef.current?.stop();
    };
  }, [roomId]);

  /* waveform heights */
  const WAVE_H = [4,7,12,18,24,20,14,9,5,9,16,22,18,12,6];

  /* ═══════════════════════ RENDER ════════════════════════ */
  return (
    <>
      <style>{`
        @keyframes sway    { 0%,100%{transform:scaleY(.4);opacity:.35} 50%{transform:scaleY(1);opacity:1} }
        @keyframes rise    { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes halo    { 0%,100%{opacity:.45;transform:scale(1)} 50%{opacity:.9;transform:scale(1.035)} }
        @keyframes glow    { 0%,100%{box-shadow:0 0 0 0 rgba(0,212,232,.0),0 12px 36px rgba(0,0,0,.5)} 60%{box-shadow:0 0 20px 1px rgba(0,212,232,.09),0 12px 36px rgba(0,0,0,.5)} }
        @keyframes pip     { 0%,100%{box-shadow:0 4px 20px rgba(0,0,0,.6)} 50%{box-shadow:0 4px 20px rgba(0,0,0,.6),0 0 0 1.5px rgba(0,212,232,.22)} }
        @keyframes livedot { 0%,100%{opacity:.35;transform:scale(.72)} 50%{opacity:1;transform:scale(1)} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* ═══════════════ MOBILE ════════════════════════════ */}
      <div className="md:hidden" style={{
        position:"fixed", inset:0,
        background:"#05050a", overflow:"hidden",
        fontFamily:"-apple-system,'SF Pro Display','SF Pro Text',sans-serif",
        WebkitFontSmoothing:"antialiased",
      }}>

        {/* remote video — z:0, explicit, full screen */}
        <video
          ref={remoteVideoMobileRef}
          autoPlay
          playsInline
          style={{
            position:"absolute", inset:0,
            width:"100%", height:"100%",
            objectFit:"cover", zIndex:0,
            filter:"brightness(.9) contrast(1.02) saturate(.92)",
          }}
        />

        {/* overlays — z:1 */}
        <div style={{ position:"absolute",inset:0,pointerEvents:"none",zIndex:1,
          background:"radial-gradient(ellipse 70% 60% at 50% 36%, transparent 0%, rgba(5,5,10,.55) 100%)" }}/>
        <div style={{ position:"absolute",inset:0,pointerEvents:"none",zIndex:1,
          background:"radial-gradient(ellipse 55% 45% at 0% 0%, rgba(0,212,232,.04) 0%, transparent 60%), radial-gradient(ellipse 50% 40% at 100% 100%, rgba(255,92,106,.035) 0%, transparent 60%)" }}/>
        <div style={{ position:"absolute",top:0,left:0,right:0,height:220,pointerEvents:"none",zIndex:1,
          background:"linear-gradient(to bottom, rgba(5,5,10,.75) 0%, rgba(5,5,10,.18) 70%, transparent 100%)" }}/>
        <div style={{ position:"absolute",bottom:0,left:0,right:0,height:380,pointerEvents:"none",zIndex:1,
          background:"linear-gradient(to top, rgba(5,5,10,.97) 0%, rgba(5,5,10,.78) 35%, rgba(5,5,10,.32) 65%, transparent 100%)" }}/>

        {/* top bar — z:30 */}
        <div style={{
          position:"absolute", top:0, left:0, right:0, zIndex:30,
          paddingTop:"env(safe-area-inset-top,50px)",
          padding:"env(safe-area-inset-top,50px) 20px 0",
          display:"flex", alignItems:"flex-start", justifyContent:"space-between",
        }}>
          <Pill onPress={hangUp}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="rgba(255,255,255,.72)" strokeWidth="2.4"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </Pill>

          <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:3,flex:1,paddingTop:4 }}>
            <div style={{ display:"flex",alignItems:"center",gap:7 }}>
              <svg width="22" height="22" viewBox="0 0 32 22" fill="none">
                <ellipse cx="10" cy="11" rx="10" ry="10" fill={C} opacity=".88"/>
                <ellipse cx="22" cy="11" rx="10" ry="10" fill={R} opacity=".82"/>
                <ellipse cx="16" cy="11" rx="5.5" ry="5.5" fill="rgba(5,5,10,.6)"/>
              </svg>
              <span style={{ fontSize:16,fontWeight:700,letterSpacing:".11em",color:"#fff",textTransform:"uppercase" }}>
                SPABLA
              </span>
            </div>
            <div style={{ display:"flex",alignItems:"center",gap:5 }}>
              <span style={{
                width:5,height:5,borderRadius:"50%",background:C,
                boxShadow:`0 0 5px ${C}`,animation:"livedot 2s ease-in-out infinite",display:"inline-block",
              }}/>
              <span style={{ fontSize:12,fontWeight:400,color:"rgba(255,255,255,.42)",fontVariantNumeric:"tabular-nums",letterSpacing:".04em" }}>
                {fmt(callDuration)}
              </span>
            </div>
          </div>

          <button
            onClick={shareWhatsApp}
            style={{
              display:"flex", alignItems:"center", gap:6,
              background:"rgba(37,211,102,0.9)",
              backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)",
              border:"none",
              borderRadius:999, padding:"8px 14px",
              cursor:"pointer", WebkitTapHighlightColor:"transparent",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="#fff" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>
            </svg>
            <span style={{ fontSize:12,fontWeight:600,color:"#fff",letterSpacing:".01em" }}>Invitar</span>
          </button>
        </div>

        {/* local self-view — z:25 */}
        <div style={{
          position:"absolute",
          top:"calc(env(safe-area-inset-top,50px) + 68px)",
          right:16, width:82, aspectRatio:"3/4",
          borderRadius:16, overflow:"hidden",
          border:"1px solid rgba(255,255,255,.14)",
          zIndex:25, animation:"pip 3.5s ease-in-out infinite",
        }}>
          <video ref={localVideoMobileRef} autoPlay muted playsInline
            style={{ width:"100%",height:"100%",objectFit:"cover" }}/>
          {!camOn && (
            <div style={{ position:"absolute",inset:0,background:"#0a0a12",
              display:"flex",alignItems:"center",justifyContent:"center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="rgba(255,255,255,.22)" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round">
                <line x1="2" y1="2" x2="22" y2="22"/>
                <path d="M10.29 7H6a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-.71M15 10l4.55-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.45.894L15 14"/>
              </svg>
            </div>
          )}
          <div style={{
            position:"absolute", bottom:6, left:6,
            width:6, height:6, borderRadius:"50%",
            background: micOn ? C : R,
            boxShadow: micOn ? `0 0 6px ${C}` : `0 0 6px ${R}`,
          }}/>
        </div>

        {/* translation card — z:30 */}
        <div style={{ position:"absolute", bottom:148, left:28, right:28, zIndex:30 }}>
          <div style={{ padding:"0" }}>
            <div style={{ padding:"0 4px 0" }}>
              {/* lang row — compact and minimal */}
              <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:8 }}>
                <LangPill code={fromLang} accent={C} bg={C8} border={C30} onPress={()=>setShowLang(true)}/>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                  stroke="rgba(255,255,255,.3)" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
                <LangPill code={toLang} accent={R} bg={R8} border={R30} onPress={()=>setShowLang(true)}/>
              </div>

              {/* translated text / remote subtitle / waveform */}
              <div style={{ minHeight:32, display:"flex", alignItems:"center", justifyContent:"center" }}>
                {subtitle ? (
                  <p style={{
                    margin:0, fontSize:17, fontWeight:600, lineHeight:1.3,
                    letterSpacing:"-.02em", textAlign:"center",
                    background:`linear-gradient(130deg, ${C} 0%, rgba(255,255,255,.95) 42%, ${R} 100%)`,
                    WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
                    backgroundClip:"text", animation:"rise .28s ease",
                    filter:"drop-shadow(0 1px 4px rgba(0,0,0,0.8))",
                  }}>{subtitle}</p>
                ) : remoteSubtitle ? (
                  <p style={{
                    margin:0, fontSize:17, fontWeight:600, lineHeight:1.3,
                    letterSpacing:"-.02em", textAlign:"center",
                    background:`linear-gradient(130deg, ${R} 0%, rgba(255,255,255,.95) 42%, ${C} 100%)`,
                    WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
                    backgroundClip:"text", animation:"rise .28s ease", opacity:.85,
                    filter:"drop-shadow(0 1px 4px rgba(0,0,0,0.8))",
                  }}>{remoteSubtitle}</p>
                ) : (
                  <div style={{ display:"flex", alignItems:"center", gap:2.5, height:32 }}>
                    {WAVE_H.map((h,i) => (
                      <span key={i} style={{
                        display:"block", width:2.5, height:h, borderRadius:2,
                        background: i < 7
                          ? `rgba(0,212,232,${.2+(i/7)*.55})`
                          : `rgba(255,92,106,${.75-((i-7)/8)*.45})`,
                        opacity: listening ? 1 : .22,
                        animation: listening
                          ? `sway ${.55+(i%4)*.12}s ease-in-out ${i*.04}s infinite`
                          : "none",
                        transformOrigin:"center bottom",
                      }}/>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>

        {/* language sheet — z:60 */}
        {showLang && (
          <div onClick={()=>setShowLang(false)} style={{
            position:"absolute", inset:0, zIndex:60,
            background:"rgba(0,0,0,.5)",
            backdropFilter:"blur(6px)", WebkitBackdropFilter:"blur(6px)",
            display:"flex", alignItems:"flex-end",
            animation:"fadeIn .18s ease",
          }}>
            <div onClick={e=>e.stopPropagation()} style={{
              width:"100%",
              background:"rgba(8,9,14,.96)",
              backdropFilter:"blur(40px)", WebkitBackdropFilter:"blur(40px)",
              borderRadius:"22px 22px 0 0",
              paddingTop:10,
              paddingBottom:"max(32px,env(safe-area-inset-bottom))",
              paddingLeft:22, paddingRight:22,
              border:"0.5px solid rgba(255,255,255,.07)",
              animation:"slideUp .22s ease",
            }}>
              <div style={{ width:36,height:3.5,borderRadius:2,background:"rgba(255,255,255,.14)",margin:"0 auto 20px" }}/>
              <div style={{ height:.5,background:`linear-gradient(90deg,${C},${R})`,opacity:.3,marginBottom:20 }}/>
              <SheetSection label="Yo hablo" codes={["es","en","fr","de"]}
                selected={fromLang} accent={C} dimBg={C8} dimBorder={C30} onSelect={setFromLang}/>
              <div style={{ height:20 }}/>
              <SheetSection label="Traducir a" codes={["es","en","fr","de"]}
                selected={toLang} accent={R} dimBg={R8} dimBorder={R30} onSelect={setToLang}/>
            </div>
          </div>
        )}

        {/* controls — z:40 */}
        <div style={{
          position:"absolute", bottom:0, left:0, right:0, zIndex:40,
          paddingBottom:"max(32px,env(safe-area-inset-bottom))",
          paddingLeft:28, paddingRight:28, paddingTop:6,
        }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>

            <Btn onPress={toggleMic}
              bg={micOn ? "rgba(22,24,32,.85)" : "rgba(255,59,48,.82)"}
              glow={!micOn ? "rgba(255,59,48,.28)" : undefined}
              label={micOn ? "Silenciar" : "Activar"}>
              {micOn ? <IcoMic/> : <IcoMicOff/>}
            </Btn>

            <Btn onPress={toggleCam}
              bg={camOn ? "rgba(22,24,32,.85)" : "rgba(255,59,48,.82)"}
              glow={!camOn ? "rgba(255,59,48,.28)" : undefined}
              label={camOn ? "Cámara" : "Sin cám."}>
              {camOn ? <IcoCam/> : <IcoCamOff/>}
            </Btn>

            {/* hang up */}
            <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:7 }}>
              <button onClick={hangUp} style={{
                width:62, height:62, borderRadius:"50%",
                background:"linear-gradient(150deg,#ff4e5f,#e5303e)",
                border:"none",
                display:"flex", alignItems:"center", justifyContent:"center",
                cursor:"pointer", WebkitTapHighlightColor:"transparent",
                boxShadow:"0 5px 22px rgba(229,48,62,.42), 0 2px 6px rgba(229,48,62,.22)",
                animation:"halo 3.2s ease-in-out infinite",
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                  stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform:"rotate(135deg)" }}>
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
                </svg>
              </button>
              <span style={{ fontSize:10.5,color:"rgba(255,255,255,.35)",letterSpacing:".01em" }}>Colgar</span>
            </div>

            <Btn onPress={listening ? stopSpeechRecognition : startSpeechRecognition}
              bg={listening ? C15 : "rgba(22,24,32,.85)"}
              glow={listening ? C30 : undefined}
              border={listening ? C30 : undefined}
              label="Subtítulos"
              labelColor={listening ? C : undefined}>
              <IcoCC color={listening ? C : "rgba(255,255,255,.82)"}/>
            </Btn>

            <Btn onPress={()=>setShowLang(true)}
              bg="rgba(22,24,32,.85)"
              label={`${LANG[fromLang]?.label}→${LANG[toLang]?.label}`}
              labelColor={C}>
              <IcoGlobe/>
            </Btn>
          </div>
        </div>
      </div>
      {/* end mobile */}

      {/* ═══════════════ DESKTOP — unchanged ══════════════ */}
      <div className="hidden md:flex flex-col min-h-screen bg-gray-950 text-white">
        <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <img src="/LOGOTIPO_SPABLA.png" alt="SPABLA" className="h-10 w-auto"/>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">Sala:</span>
            <span className="text-sm font-mono bg-gray-800 px-3 py-1 rounded-lg text-gray-200">{roomId}</span>
            <button onClick={copyLink} className="text-xs bg-gray-800 hover:bg-gray-700 transition-colors px-3 py-1 rounded-lg text-gray-300">
              {copied ? "Copiado!" : "Copiar enlace"}
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
              {!camOn && <div className="absolute inset-0 bg-gray-900 flex items-center justify-center"><span className="text-gray-600 text-sm">Camara apagada</span></div>}
              <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-xl">
                <div className={`w-2 h-2 rounded-full ${micOn ? "bg-green-400" : "bg-red-400"}`}/>
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
                {listening && <span className="flex items-center gap-1 text-xs text-green-400"><span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"/>Escuchando</span>}
              </div>
            </div>
            <p className={`text-sm ${listening ? "text-white" : "text-gray-500 italic"}`}>{subtitle}</p>
          </div>
          <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-2xl px-6 py-4 shadow-lg">
            <button onClick={toggleMic} className={`flex flex-col items-center gap-1 transition-colors px-5 py-3 rounded-xl ${micOn ? "bg-gray-800 hover:bg-gray-700" : "bg-red-900 hover:bg-red-800"}`}>
              <span className="text-lg">{micOn ? "mic" : "mute"}</span>
              <span className="text-xs text-gray-400">{micOn ? "Silenciar" : "Activar mic"}</span>
            </button>
            <button onClick={toggleCam} className={`flex flex-col items-center gap-1 transition-colors px-5 py-3 rounded-xl ${camOn ? "bg-gray-800 hover:bg-gray-700" : "bg-red-900 hover:bg-red-800"}`}>
              <span className="text-lg">{camOn ? "cam" : "off"}</span>
              <span className="text-xs text-gray-400">{camOn ? "Camara" : "Sin camara"}</span>
            </button>
            <button onClick={listening ? stopSpeechRecognition : startSpeechRecognition}
              className={`flex flex-col items-center gap-1 transition-colors px-5 py-3 rounded-xl ${listening ? "bg-green-600 hover:bg-green-500" : "bg-gray-800 hover:bg-gray-700"}`}>
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

function Pill({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) {
  return (
    <button onClick={onPress} style={{
      display:"flex", alignItems:"center", gap:5,
      background:"rgba(255,255,255,.07)",
      backdropFilter:"blur(18px)", WebkitBackdropFilter:"blur(18px)",
      border:"0.5px solid rgba(255,255,255,.1)",
      borderRadius:999, padding:"7px 11px",
      cursor: onPress ? "pointer" : "default",
      WebkitTapHighlightColor:"transparent",
    }}>
      {children}
    </button>
  );
}

function LangPill({ code, accent, bg, border, onPress }: {
  code: string; accent: string; bg: string; border: string; onPress: () => void;
}) {
  return (
    <button onClick={onPress} style={{
      display:"flex", alignItems:"center", gap:5,
      background:"rgba(0,0,0,0.28)",
      backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)",
      border:"0.5px solid rgba(255,255,255,.18)",
      borderRadius:20, padding:"3px 8px",
      cursor:"pointer", WebkitTapHighlightColor:"transparent",
    }}>
      <span style={{ fontSize:10 }}>{LANG[code]?.flag}</span>
      <span style={{ fontSize:10,fontWeight:700,color:"rgba(255,255,255,.9)",letterSpacing:".06em" }}>
        {LANG[code]?.label}
      </span>
    </button>
  );
}

function SheetSection({ label, codes, selected, accent, dimBg, dimBorder, onSelect }: {
  label: string; codes: string[]; selected: string;
  accent: string; dimBg: string; dimBorder: string;
  onSelect: (c: string) => void;
}) {
  return (
    <>
      <p style={{ margin:"0 0 10px",fontSize:11,color:"rgba(255,255,255,.28)",textTransform:"uppercase",letterSpacing:".08em" }}>
        {label}
      </p>
      <div style={{ display:"flex",gap:9 }}>
        {codes.map(c => (
          <button key={c} onClick={() => onSelect(c)} style={{
            flex:1, padding:"12px 0", borderRadius:14,
            border: selected===c ? `1px solid ${accent}55` : "0.5px solid rgba(255,255,255,.07)",
            background: selected===c ? dimBg : "rgba(255,255,255,.025)",
            color: selected===c ? accent : "rgba(255,255,255,.32)",
            fontSize:13, fontWeight: selected===c ? 600 : 400,
            cursor:"pointer",
            display:"flex", flexDirection:"column", alignItems:"center", gap:4,
          }}>
            <span style={{ fontSize:20 }}>{LANG[c]?.flag}</span>
            <span>{LANG[c]?.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function Btn({ onPress, children, label, bg, glow, border, labelColor }: {
  onPress: () => void; children: React.ReactNode;
  label: string; bg: string;
  glow?: string; border?: string; labelColor?: string;
}) {
  return (
    <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:7 }}>
      <button onClick={onPress} style={{
        width:52, height:52, borderRadius:"50%",
        background:bg,
        backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)",
        border:`0.5px solid ${border ?? "rgba(255,255,255,.09)"}`,
        boxShadow: glow
          ? `0 0 18px ${glow}, 0 3px 10px rgba(0,0,0,.38)`
          : "0 3px 10px rgba(0,0,0,.38)",
        display:"flex", alignItems:"center", justifyContent:"center",
        cursor:"pointer", WebkitTapHighlightColor:"transparent",
      }}>
        {children}
      </button>
      <span style={{
        fontSize:10.5, letterSpacing:".01em", fontWeight:400, whiteSpace:"nowrap",
        color: labelColor ?? "rgba(255,255,255,.32)",
      }}>{label}</span>
    </div>
  );
}

/* ─── icons ─────────────────────────────────────────────── */
const ip = (c = "rgba(255,255,255,.85)") => ({
  width:19, height:19, viewBox:"0 0 24 24",
  fill:"none" as const, stroke:c,
  strokeWidth:1.75,
  strokeLinecap:"round" as const, strokeLinejoin:"round" as const,
});
function IcoMic()    { return <svg {...ip()}><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0014 0M12 19v3M9 22h6"/></svg>; }
function IcoMicOff() { return <svg {...ip()}><line x1="2" y1="2" x2="22" y2="22"/><path d="M18.89 13.23A7 7 0 0019 12v-2M5 10a7 7 0 0010.17 6.38M15 9.34V5a3 3 0 00-5.68-1.33M9 9v3a3 3 0 005.12 2.12M12 19v3M9 22h6"/></svg>; }
function IcoCam()    { return <svg {...ip()}><path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14"/><rect x="2" y="7" width="13" height="10" rx="2"/></svg>; }
function IcoCamOff() { return <svg {...ip()}><line x1="2" y1="2" x2="22" y2="22"/><path d="M10.29 7H6a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-.71M15 10l4.55-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.45.894L15 14"/></svg>; }
function IcoCC({ color = "rgba(255,255,255,.85)" }: { color?: string }) {
  return <svg {...ip(color)}><rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M7 12.5c.45-.9 1.4-1.5 2.5-1.5s2.05.6 2.5 1.5M14 12.5c.45-.9 1.4-1.5 2.5-1.5s2.05.6 2.5 1.5"/></svg>;
}
function IcoGlobe()  { return <svg {...ip()}><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>; }
