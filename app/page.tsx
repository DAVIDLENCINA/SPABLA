"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8);
}

const C = "#00D4E8";
const R = "#FF5C6A";
const LANGS: Record<string, { flag: string; label: string }> = {
  es: { flag: "🇪🇸", label: "Español" },
  en: { flag: "🇬🇧", label: "English" },
  fr: { flag: "🇫🇷", label: "Français" },
  de: { flag: "🇩🇪", label: "Deutsch" },
};
const LANG_KEYS = Object.keys(LANGS);

export default function Home() {
  const router = useRouter();
  const [fromLang, setFromLang] = useState("es");
  const [toLang, setToLang] = useState("en");
  const [hoverVoice, setHoverVoice] = useState(false);
  const [hoverVideo, setHoverVideo] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 120);
    return () => clearInterval(id);
  }, []);

  function startCall(mode: "voice" | "video") {
    const roomId = generateRoomId();
    sessionStorage.setItem("callMode", mode);
    router.push(`/call/${roomId}`);
  }

  function swapLangs() { setFromLang(toLang); setToLang(fromLang); }

  const BARS = 18;
  const waveHeights = Array.from({ length: BARS }, (_, i) => {
    const base = [4,7,11,16,22,28,22,16,11,7,4,7,14,20,14,9,5,3][i] || 8;
    return Math.max(3, base + Math.sin((tick * 0.18) + i * 0.55) * 6);
  });

  return (
    <>
      <style>{`
        @keyframes breathe  { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
        @keyframes breathe2 { 0%,100%{transform:scale(1)} 50%{transform:scale(1.04)} }
        @keyframes floatUp  { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
        @keyframes glow     { 0%,100%{opacity:.4} 50%{opacity:.9} }
        * { box-sizing:border-box; margin:0; padding:0; }
        body { background:#03040d; }
        select { -webkit-appearance:none; }
        select option { background:#0d0e1a; color:white; }
      `}</style>
      <div style={{ minHeight:"100vh", background:"#03040d", fontFamily:"-apple-system,'SF Pro Display',sans-serif", WebkitFontSmoothing:"antialiased", position:"relative", overflow:"hidden", display:"flex", flexDirection:"column" }}>

        <div style={{ position:"absolute", top:"15%", left:"8%", width:500, height:500, borderRadius:"50%", background:"radial-gradient(circle, rgba(0,212,232,.07) 0%, transparent 70%)", pointerEvents:"none", animation:"glow 4s ease-in-out infinite" }}/>
        <div style={{ position:"absolute", top:"20%", right:"6%", width:420, height:420, borderRadius:"50%", background:"radial-gradient(circle, rgba(255,92,106,.06) 0%, transparent 70%)", pointerEvents:"none", animation:"glow 5s ease-in-out 1s infinite" }}/>

        <svg style={{ position:"absolute", bottom:0, left:0, right:0, pointerEvents:"none", opacity:.15 }} viewBox="0 0 1440 200" preserveAspectRatio="none" height="200">
          <path d="M0,100 C360,40 720,160 1080,100 C1260,70 1380,130 1440,100 L1440,200 L0,200 Z" fill="none" stroke={C} strokeWidth="1.5"/>
          <path d="M0,130 C400,70 800,190 1200,130 C1320,110 1400,150 1440,130 L1440,200 L0,200 Z" fill="none" stroke={R} strokeWidth="1" opacity=".7"/>
        </svg>

        <nav style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"24px 32px 0", position:"relative", zIndex:10, animation:"fadeIn .6s ease" }}>
          <img src="/SPABLA_LOGO.png" alt="SPABLA" style={{ height:30, width:"auto" }}/>
          <div style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(255,255,255,.06)", border:"0.5px solid rgba(255,255,255,.1)", borderRadius:999, padding:"6px 14px" }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            <span style={{ fontSize:12, color:"rgba(255,255,255,.45)", letterSpacing:".02em" }}>Privado y seguro</span>
          </div>
        </nav>

        <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"40px 24px 0", position:"relative", zIndex:10 }}>

          <p style={{ fontSize:11, fontWeight:600, letterSpacing:".18em", color:C, textTransform:"uppercase", marginBottom:18, animation:"floatUp .6s ease .1s both" }}>En tiempo real</p>

          <h1 style={{ fontSize:"clamp(36px, 7vw, 72px)", fontWeight:800, lineHeight:1.08, letterSpacing:"-.03em", textAlign:"center", marginBottom:18, animation:"floatUp .6s ease .2s both" }}>
            <span style={{ color:"#fff" }}>Habla con</span><br/>
            <span style={{ background:`linear-gradient(130deg, ${C} 0%, #fff 45%, ${R} 100%)`, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text" }}>el mundo.</span>
          </h1>

          <p style={{ fontSize:"clamp(14px, 2vw, 18px)", color:"rgba(255,255,255,.45)", textAlign:"center", lineHeight:1.6, marginBottom:36, maxWidth:440, animation:"floatUp .6s ease .3s both" }}>
            Traducción instantánea con voz natural.<br/>Sin barreras, sin límites.
          </p>

          <div style={{ display:"flex", alignItems:"center", gap:3, height:40, marginBottom:52, animation:"floatUp .6s ease .35s both" }}>
            {waveHeights.map((h, i) => (
              <span key={i} style={{ display:"block", width:3, height:h, borderRadius:2, background: i < BARS/2 ? `rgba(0,212,232,${.25+(i/(BARS/2))*.65})` : `rgba(255,92,106,${.9-((i-BARS/2)/(BARS/2))*.5})`, transition:"height .12s ease" }}/>
            ))}
          </div>

          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"center", gap:"clamp(24px, 6vw, 80px)", marginBottom:52, animation:"floatUp .7s ease .4s both" }}>

            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:20 }}>
              <button onClick={() => startCall("video")} onMouseEnter={() => setHoverVideo(true)} onMouseLeave={() => setHoverVideo(false)}
                style={{ width:"clamp(130px, 18vw, 200px)", height:"clamp(130px, 18vw, 200px)", borderRadius:"50%", background: hoverVideo ? `radial-gradient(circle, rgba(0,212,232,.22) 0%, rgba(0,212,232,.06) 100%)` : `radial-gradient(circle, rgba(0,212,232,.12) 0%, rgba(0,212,232,.02) 100%)`, border:`1.5px solid rgba(0,212,232,${hoverVideo?.8:.45})`, boxShadow: hoverVideo ? `0 0 60px rgba(0,212,232,.35), 0 0 120px rgba(0,212,232,.15)` : `0 0 30px rgba(0,212,232,.18)`, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", transition:"all .35s ease", animation:"breathe 4s ease-in-out infinite", transform: hoverVideo ? "scale(1.06)" : "scale(1)", WebkitTapHighlightColor:"transparent", outline:"none" }}>
                <svg width="40%" height="40%" viewBox="0 0 24 24" fill="none" stroke={C} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14"/><rect x="2" y="7" width="13" height="10" rx="2"/>
                </svg>
              </button>
              <div style={{ textAlign:"center" }}>
                <p style={{ fontSize:"clamp(16px, 2.5vw, 20px)", fontWeight:600, color:"#fff", marginBottom:6 }}>Videollamada</p>
                <p style={{ fontSize:"clamp(12px, 1.5vw, 14px)", color:C, lineHeight:1.5, maxWidth:180, textAlign:"center" }}>Traducción de voz en tiempo real y subtítulos en pantalla.</p>
              </div>
            </div>

            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8, paddingTop:"clamp(50px, 7vw, 90px)", color:"rgba(255,255,255,.18)", fontSize:12 }}>
              <div style={{ width:.5, height:24, background:"rgba(255,255,255,.12)" }}/>
              <span>o</span>
              <div style={{ width:.5, height:24, background:"rgba(255,255,255,.12)" }}/>
            </div>

            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:20 }}>
              <button onClick={() => startCall("voice")} onMouseEnter={() => setHoverVoice(true)} onMouseLeave={() => setHoverVoice(false)}
                style={{ width:"clamp(130px, 18vw, 200px)", height:"clamp(130px, 18vw, 200px)", borderRadius:"50%", background: hoverVoice ? `radial-gradient(circle, rgba(255,92,106,.22) 0%, rgba(255,92,106,.06) 100%)` : `radial-gradient(circle, rgba(255,92,106,.12) 0%, rgba(255,92,106,.02) 100%)`, border:`1.5px solid rgba(255,92,106,${hoverVoice?.8:.45})`, boxShadow: hoverVoice ? `0 0 60px rgba(255,92,106,.35), 0 0 120px rgba(255,92,106,.15)` : `0 0 30px rgba(255,92,106,.18)`, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", transition:"all .35s ease", animation:"breathe2 4.5s ease-in-out .8s infinite", transform: hoverVoice ? "scale(1.06)" : "scale(1)", WebkitTapHighlightColor:"transparent", outline:"none" }}>
                <svg width="38%" height="38%" viewBox="0 0 24 24" fill="none" stroke={R} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0014 0M12 19v3M9 22h6"/>
                </svg>
              </button>
              <div style={{ textAlign:"center" }}>
                <p style={{ fontSize:"clamp(16px, 2.5vw, 20px)", fontWeight:600, color:"#fff", marginBottom:6 }}>Llamada con voz</p>
                <p style={{ fontSize:"clamp(12px, 1.5vw, 14px)", color:R, lineHeight:1.5, maxWidth:180, textAlign:"center" }}>Traducción de voz en tiempo real.</p>
              </div>
            </div>

          </div>

          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:28, animation:"floatUp .6s ease .55s both" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,.06)", border:"0.5px solid rgba(255,255,255,.12)", borderRadius:999, padding:"10px 16px" }}>
              <span style={{ fontSize:18 }}>{LANGS[fromLang]?.flag}</span>
              <select value={fromLang} onChange={e => setFromLang(e.target.value)} style={{ background:"transparent", border:"none", outline:"none", color:"#fff", fontSize:14, fontWeight:500, cursor:"pointer", fontFamily:"inherit" }}>
                {LANG_KEYS.map(k => <option key={k} value={k}>{LANGS[k].label}</option>)}
              </select>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="2.5" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
            </div>
            <button onClick={swapLangs} style={{ width:36, height:36, borderRadius:"50%", background:"rgba(255,255,255,.06)", border:"0.5px solid rgba(255,255,255,.12)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", WebkitTapHighlightColor:"transparent" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3L4 7l4 4M16 21l4-4-4-4M4 7h16M4 17h16"/></svg>
            </button>
            <div style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,.06)", border:"0.5px solid rgba(255,255,255,.12)", borderRadius:999, padding:"10px 16px" }}>
              <span style={{ fontSize:18 }}>{LANGS[toLang]?.flag}</span>
              <select value={toLang} onChange={e => setToLang(e.target.value)} style={{ background:"transparent", border:"none", outline:"none", color:"#fff", fontSize:14, fontWeight:500, cursor:"pointer", fontFamily:"inherit" }}>
                {LANG_KEYS.map(k => <option key={k} value={k}>{LANGS[k].label}</option>)}
              </select>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="2.5" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
            </div>
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:40, animation:"floatUp .6s ease .65s both" }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            <span style={{ fontSize:12, color:"rgba(255,255,255,.25)", letterSpacing:".02em" }}>Conversaciones privadas y seguras sin almacenar tu voz.</span>
          </div>

        </div>
      </div>
    </>
  );
}
