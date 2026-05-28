"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

const CY = "#00D4FF";
const CO = "#FF5C8A";
const BG = "#02030A";

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8);
}

const FEATURES = [
  { title: "Suena como tú",          desc: "No suena a robot. La traducción mantiene tu tono, tu ritmo, tu emoción." },
  { title: "10 idiomas",             desc: "Español, inglés, francés, alemán, portugués, italiano, japonés, coreano, chino y árabe." },
  { title: "Sin complicaciones",     desc: "Comparte un enlace. Nada más. Sin apps, sin contraseñas, sin tutoriales." },
  { title: "Sin esperas",            desc: "La traducción llega antes de que termines la frase. Fluye como una conversación normal." },
  { title: "Nunca te pierdes nada",  desc: "Subtítulos en pantalla mientras hablas, para no perder ni una palabra." },
  { title: "Solo entre vosotros",    desc: "La conexión va directa entre los dos. Tu voz no pasa por ningún servidor." },
];

const DEMO_PHRASES = [
  { original: "Te echaba tanto de menos.",           translated: "I've missed you so much.",           from: "🇪🇸 Español", to: "🇬🇧 English" },
  { original: "¿Cuándo vienes a visitarme?",         translated: "When are you coming to visit me?",   from: "🇪🇸 Español", to: "🇬🇧 English" },
  { original: "Je suis tellement content de te parler.", translated: "Estoy muy feliz de hablar contigo.", from: "🇫🇷 Français", to: "🇪🇸 Español" },
  { original: "Können wir das morgen besprechen?",   translated: "Can we discuss this tomorrow?",      from: "🇩🇪 Deutsch",  to: "🇬🇧 English" },
];

const slides = [
  { img: "/hero1.jpg" },
  { img: "/hero2.jpg" },
  { img: "/hero3.jpg" },
];

export default function Home() {
  const router = useRouter();
  const [demoIdx, setDemoIdx] = useState(0);
  const [demoVisible, setDemoVisible] = useState(true);
  const [hoverVideo, setHoverVideo] = useState(false);
  const [hoverVoice, setHoverVoice] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setDemoVisible(false);
      setTimeout(() => {
        setDemoIdx(i => (i + 1) % DEMO_PHRASES.length);
        setDemoVisible(true);
      }, 380);
    }, 3800);
    return () => clearInterval(id);
  }, []);

  function startCall(mode: "voice" | "video") {
    const roomId = generateRoomId();
    router.push(`/call/${roomId}?mode=${mode}`);
  }

  const demo = DEMO_PHRASES[demoIdx];

  return (
    <>
      <style>{`
        @keyframes floatUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes blink   { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes bobDown { 0%,100%{transform:translateX(-50%) translateY(0)} 50%{transform:translateX(-50%) translateY(5px)} }
        * { box-sizing:border-box; margin:0; padding:0; }
        html { scroll-behavior:smooth; }
        body { background:${BG}; overflow-x:hidden; }
        select option { background:#0c0d1a; color:#fff; }
        ::selection { background:rgba(0,212,255,.2); }
        ::-webkit-scrollbar { width:5px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,.1); border-radius:3px; }
        .fc { transition:background .2s, border-color .2s, transform .2s; }
        .fc:hover { background:rgba(255,255,255,.06) !important; border-color:rgba(255,255,255,.12) !important; transform:translateY(-2px); }
        .store-pill { opacity:.35; transition:opacity .2s; cursor:default; }
        .store-pill:hover { opacity:.55; }
        .cta-btn-v:hover { background:rgba(0,212,255,.16) !important; }
        .cta-btn-o:hover { background:rgba(255,92,138,.16) !important; }
      `}</style>

      <div style={{ minHeight:"100vh", background:BG, fontFamily:"-apple-system,'SF Pro Display','Helvetica Neue',sans-serif", WebkitFontSmoothing:"antialiased", color:"#fff" }}>

        {/* ── NAV ── */}
        <nav style={{ position:"fixed", top:0, left:0, right:0, zIndex:200, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"20px 36px", background:"rgba(2,3,10,.82)", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)", borderBottom:"1px solid rgba(255,255,255,.05)" }}>
          <img src="/SPABLA_LOGO.png" alt="SPABLA" style={{ height:26, width:"auto" }}/>
          <button
            onClick={() => startCall("video")}
            className="cta-btn-v"
            style={{ background:"rgba(255,255,255,.09)", border:"1px solid rgba(255,255,255,.13)", borderRadius:999, padding:"8px 22px", color:"rgba(255,255,255,.82)", fontSize:13.5, fontWeight:500, cursor:"pointer", letterSpacing:"-.01em", outline:"none", WebkitTapHighlightColor:"transparent", transition:"background .2s" }}>
            Iniciar llamada
          </button>
        </nav>

        {/* ── HERO ── */}
        <section style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"120px 24px 80px", position:"relative", zIndex:1 }}>

          <h1 style={{ fontSize:"clamp(52px, 9vw, 96px)", fontWeight:800, lineHeight:1.04, letterSpacing:"-.04em", textAlign:"center", marginBottom:20, animation:"floatUp .6s ease .1s both" }}>
            <span style={{ color:"#fff" }}>Habla con</span><br/>
            <span style={{ color:CY }}>el mundo.</span>
          </h1>

          <p style={{ fontSize:"clamp(16px, 2.2vw, 20px)", color:"rgba(255,255,255,.5)", textAlign:"center", lineHeight:1.72, marginBottom:52, maxWidth:520, animation:"floatUp .6s ease .2s both", fontWeight:400 }}>
            Tu amigo en Tokio. Tu familia en Buenos Aires. Tu cliente en París.<br/>Ahora podéis llamaros y entenderos, cada uno en su idioma.
          </p>

          {/* Two-person illustration */}
          <div style={{ display:"flex", alignItems:"center", gap:"clamp(10px, 3vw, 28px)", marginBottom:52, flexWrap:"wrap", justifyContent:"center", animation:"floatUp .6s ease .3s both" }}>

            {/* Person left — Spanish */}
            <div style={{ background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:20, padding:"24px 20px 20px", width:"clamp(148px, 22vw, 190px)", display:"flex", flexDirection:"column", alignItems:"center" }}>
              <div style={{ width:56, height:56, borderRadius:"50%", background:"rgba(0,212,255,.08)", border:"1.5px solid rgba(0,212,255,.2)", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:10 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={CY} strokeWidth="1.6" strokeLinecap="round">
                  <circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0112 0v2"/>
                </svg>
              </div>
              <p style={{ fontSize:14, fontWeight:600, color:"#fff", marginBottom:6 }}>María</p>
              <div style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.07)", borderRadius:999, padding:"3px 10px", marginBottom:14 }}>
                <span style={{ fontSize:12 }}>🇪🇸</span>
                <span style={{ fontSize:11.5, color:"rgba(255,255,255,.48)" }}>Español</span>
              </div>
              <div style={{ background:"rgba(255,255,255,.04)", borderRadius:12, padding:"10px 13px", width:"100%" }}>
                <p style={{ fontSize:13, color:"rgba(255,255,255,.7)", fontStyle:"italic", lineHeight:1.5, textAlign:"center" }}>"Te echaba tanto de menos."</p>
              </div>
            </div>

            {/* Arrow */}
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, flexShrink:0 }}>
              <div style={{ background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.07)", borderRadius:999, padding:"4px 13px" }}>
                <span style={{ fontSize:11, color:"rgba(255,255,255,.36)", fontWeight:500, letterSpacing:".02em" }}>SPABLA</span>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="2" strokeLinecap="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>

            {/* Person right — English */}
            <div style={{ background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:20, padding:"24px 20px 20px", width:"clamp(148px, 22vw, 190px)", display:"flex", flexDirection:"column", alignItems:"center" }}>
              <div style={{ width:56, height:56, borderRadius:"50%", background:"rgba(255,92,138,.08)", border:"1.5px solid rgba(255,92,138,.2)", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:10 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={CO} strokeWidth="1.6" strokeLinecap="round">
                  <circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0112 0v2"/>
                </svg>
              </div>
              <p style={{ fontSize:14, fontWeight:600, color:"#fff", marginBottom:6 }}>James</p>
              <div style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.07)", borderRadius:999, padding:"3px 10px", marginBottom:14 }}>
                <span style={{ fontSize:12 }}>🇬🇧</span>
                <span style={{ fontSize:11.5, color:"rgba(255,255,255,.48)" }}>English</span>
              </div>
              <div style={{ background:"rgba(255,255,255,.04)", borderRadius:12, padding:"10px 13px", width:"100%" }}>
                <p style={{ fontSize:13, color:"rgba(255,255,255,.7)", fontStyle:"italic", lineHeight:1.5, textAlign:"center" }}>"I've missed you so much."</p>
              </div>
            </div>
          </div>

          {/* CTA buttons */}
          <div style={{ display:"flex", gap:12, marginBottom:32, flexWrap:"wrap", justifyContent:"center", animation:"floatUp .6s ease .4s both" }}>
            <button
              onClick={() => startCall("video")}
              onMouseEnter={() => setHoverVideo(true)}
              onMouseLeave={() => setHoverVideo(false)}
              style={{ display:"flex", alignItems:"center", gap:11, padding:"14px 24px", background: hoverVideo ? "rgba(0,212,255,.14)" : "rgba(0,212,255,.08)", border:"1.5px solid rgba(0,212,255,.3)", borderRadius:14, cursor:"pointer", transition:"background .2s", WebkitTapHighlightColor:"transparent", outline:"none" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={CY} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14"/><rect x="2" y="7" width="13" height="10" rx="2"/>
              </svg>
              <div style={{ textAlign:"left" }}>
                <p style={{ fontSize:15, fontWeight:600, color:"#fff", letterSpacing:"-.01em" }}>Videollamada</p>
                <p style={{ fontSize:11.5, color:"rgba(255,255,255,.42)" }}>Voz y subtítulos en vivo</p>
              </div>
            </button>

            <button
              onClick={() => startCall("voice")}
              onMouseEnter={() => setHoverVoice(true)}
              onMouseLeave={() => setHoverVoice(false)}
              style={{ display:"flex", alignItems:"center", gap:11, padding:"14px 24px", background: hoverVoice ? "rgba(255,92,138,.14)" : "rgba(255,92,138,.08)", border:"1.5px solid rgba(255,92,138,.3)", borderRadius:14, cursor:"pointer", transition:"background .2s", WebkitTapHighlightColor:"transparent", outline:"none" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={CO} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0014 0M12 19v3M9 22h6"/>
              </svg>
              <div style={{ textAlign:"left" }}>
                <p style={{ fontSize:15, fontWeight:600, color:"#fff", letterSpacing:"-.01em" }}>Solo voz</p>
                <p style={{ fontSize:11.5, color:"rgba(255,255,255,.42)" }}>Sin cámara, mismo resultado</p>
              </div>
            </button>
          </div>

          <p style={{ fontSize:12.5, color:"rgba(255,255,255,.2)", textAlign:"center", animation:"floatUp .6s ease .5s both" }}>
            Sin descarga · Sin registro · Funciona en el navegador
          </p>

          <div style={{ position:"absolute", bottom:28, left:"50%", animation:"bobDown 2.6s ease-in-out infinite", display:"flex", flexDirection:"column", alignItems:"center", gap:5, opacity:.2 }}>
            <span style={{ fontSize:10, letterSpacing:".1em", textTransform:"uppercase" }}>Descubrir</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section style={{ padding:"80px 24px 96px", position:"relative", zIndex:1, display:"flex", flexDirection:"column", alignItems:"center" }}>

          <p style={{ fontSize:11.5, fontWeight:600, letterSpacing:".14em", color:"rgba(255,255,255,.3)", textTransform:"uppercase", marginBottom:14 }}>Cómo funciona</p>
          <h2 style={{ fontSize:"clamp(26px, 4.5vw, 48px)", fontWeight:700, letterSpacing:"-.03em", textAlign:"center", marginBottom:14, color:"#fff", lineHeight:1.15 }}>Habláis. SPABLA traduce.</h2>
          <p style={{ fontSize:"clamp(14px, 1.8vw, 17px)", color:"rgba(255,255,255,.42)", textAlign:"center", lineHeight:1.72, marginBottom:52, maxWidth:440 }}>
            Tú hablas en tu idioma. La otra persona escucha en el suyo. Sin pausas, sin interrupciones, sin pensar en el idioma.
          </p>

          {/* Simplified call mockup */}
          <div style={{ width:"100%", maxWidth:740, background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.07)", borderRadius:22, overflow:"hidden" }}>
            <div style={{ display:"flex", minHeight:240 }}>

              {/* Tile left */}
              <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"32px 24px", borderRight:"1px solid rgba(255,255,255,.05)" }}>
                <div style={{ width:58, height:58, borderRadius:"50%", background:"rgba(0,212,255,.07)", border:"1.5px solid rgba(0,212,255,.18)", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:12 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={CY} strokeWidth="1.6" strokeLinecap="round">
                    <circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0112 0v2"/>
                  </svg>
                </div>
                <p style={{ fontSize:14, fontWeight:500, color:"rgba(255,255,255,.75)", marginBottom:8 }}>María</p>
                <div style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(255,255,255,.04)", borderRadius:999, padding:"3px 10px", marginBottom:12 }}>
                  <span>🇪🇸</span>
                  <span style={{ fontSize:11.5, color:"rgba(255,255,255,.42)" }}>Español</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ width:6, height:6, borderRadius:"50%", background:"#22c55e", display:"block", animation:"blink 2.2s ease-in-out infinite" }}/>
                  <span style={{ fontSize:11.5, color:"rgba(255,255,255,.35)" }}>Hablando</span>
                </div>
              </div>

              {/* Tile right */}
              <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"32px 24px" }}>
                <div style={{ width:58, height:58, borderRadius:"50%", background:"rgba(255,92,138,.07)", border:"1.5px solid rgba(255,92,138,.18)", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:12 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={CO} strokeWidth="1.6" strokeLinecap="round">
                    <circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0112 0v2"/>
                  </svg>
                </div>
                <p style={{ fontSize:14, fontWeight:500, color:"rgba(255,255,255,.75)", marginBottom:8 }}>James</p>
                <div style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(255,255,255,.04)", borderRadius:999, padding:"3px 10px", marginBottom:12 }}>
                  <span>🇬🇧</span>
                  <span style={{ fontSize:11.5, color:"rgba(255,255,255,.42)" }}>English</span>
                </div>
                <p style={{ fontSize:11.5, color:"rgba(255,255,255,.28)" }}>Escuchando...</p>
              </div>
            </div>

            {/* Translation line */}
            <div style={{ borderTop:"1px solid rgba(255,255,255,.05)", padding:"18px 26px" }}>
              <p style={{ fontSize:14, color:"rgba(255,255,255,.72)", lineHeight:1.6, marginBottom:5 }}>
                <span style={{ color:"rgba(255,255,255,.3)", fontSize:12.5 }}>María: </span>
                "Estoy muy emocionada de hablar contigo."
              </p>
              <p style={{ fontSize:13.5, color:"rgba(255,255,255,.4)", fontStyle:"italic" }}>
                "I'm so excited to talk to you."
              </p>
            </div>
          </div>
        </section>

        {/* ── DEMO ── */}
        <section style={{ padding:"80px 24px 96px", position:"relative", zIndex:1, display:"flex", flexDirection:"column", alignItems:"center", background:"rgba(255,255,255,.014)", borderTop:"1px solid rgba(255,255,255,.04)", borderBottom:"1px solid rgba(255,255,255,.04)" }}>

          <p style={{ fontSize:11.5, fontWeight:600, letterSpacing:".14em", color:"rgba(255,255,255,.3)", textTransform:"uppercase", marginBottom:14 }}>Escúchalo</p>
          <h2 style={{ fontSize:"clamp(26px, 4.5vw, 48px)", fontWeight:700, letterSpacing:"-.03em", textAlign:"center", marginBottom:14, color:"#fff", lineHeight:1.15 }}>Así suena la traducción</h2>
          <p style={{ fontSize:"clamp(14px, 1.8vw, 17px)", color:"rgba(255,255,255,.42)", textAlign:"center", lineHeight:1.72, marginBottom:52, maxWidth:380 }}>
            En tiempo real. Frase a frase. Como si el otro hablara tu idioma.
          </p>

          <div style={{ width:"100%", maxWidth:520, background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:20, overflow:"hidden" }}>

            {/* Header */}
            <div style={{ padding:"14px 20px", borderBottom:"1px solid rgba(255,255,255,.06)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                <span style={{ width:6, height:6, borderRadius:"50%", background:"#22c55e", display:"block", animation:"blink 2.2s ease-in-out infinite" }}/>
                <span style={{ fontSize:12, color:"rgba(255,255,255,.42)" }}>Traducción activa</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, color:"rgba(255,255,255,.28)", transition:"opacity .35s", opacity: demoVisible ? 1 : 0 }}>
                <span>{demo.from}</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                <span>{demo.to}</span>
              </div>
            </div>

            <div style={{ padding:"26px 20px" }}>

              {/* Original */}
              <div style={{ marginBottom:20, transition:"opacity .35s ease, transform .35s ease", opacity: demoVisible ? 1 : 0, transform: demoVisible ? "translateY(0)" : "translateY(8px)" }}>
                <p style={{ fontSize:10.5, fontWeight:600, letterSpacing:".09em", textTransform:"uppercase", color:"rgba(255,255,255,.2)", marginBottom:8 }}>Original</p>
                <p style={{ fontSize:"clamp(17px, 2.8vw, 22px)", fontWeight:500, color:"rgba(255,255,255,.88)", lineHeight:1.45, fontStyle:"italic" }}>"{demo.original}"</p>
              </div>

              {/* Divider */}
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
                <div style={{ height:"1px", flex:1, background:"rgba(255,255,255,.06)" }}/>
                <span style={{ fontSize:11, color:"rgba(255,255,255,.22)", fontWeight:500 }}>SPABLA</span>
                <div style={{ height:"1px", flex:1, background:"rgba(255,255,255,.06)" }}/>
              </div>

              {/* Translated */}
              <div style={{ transition:"opacity .35s ease .15s, transform .35s ease .15s", opacity: demoVisible ? 1 : 0, transform: demoVisible ? "translateY(0)" : "translateY(8px)" }}>
                <p style={{ fontSize:10.5, fontWeight:600, letterSpacing:".09em", textTransform:"uppercase", color:"rgba(255,255,255,.2)", marginBottom:8 }}>Traducción</p>
                <p style={{ fontSize:"clamp(17px, 2.8vw, 22px)", fontWeight:500, color:"rgba(255,255,255,.65)", lineHeight:1.45, fontStyle:"italic" }}>"{demo.translated}"</p>
              </div>
            </div>

            {/* Progress dots */}
            <div style={{ padding:"0 20px 16px", display:"flex", justifyContent:"center", gap:6 }}>
              {DEMO_PHRASES.map((_, i) => (
                <span key={i} style={{ width: i === demoIdx ? 16 : 6, height:5, borderRadius:3, background: i === demoIdx ? "rgba(255,255,255,.5)" : "rgba(255,255,255,.12)", transition:"all .3s ease", display:"block" }}/>
              ))}
            </div>
          </div>
        </section>

        {/* ── FEATURES ── */}
        <section style={{ padding:"80px 24px 96px", position:"relative", zIndex:1, display:"flex", flexDirection:"column", alignItems:"center" }}>

          <p style={{ fontSize:11.5, fontWeight:600, letterSpacing:".14em", color:"rgba(255,255,255,.3)", textTransform:"uppercase", marginBottom:14 }}>Por qué funciona</p>
          <h2 style={{ fontSize:"clamp(26px, 4.5vw, 48px)", fontWeight:700, letterSpacing:"-.03em", textAlign:"center", marginBottom:14, color:"#fff", lineHeight:1.15 }}>Hecho para personas,<br/>no para demos</h2>
          <p style={{ fontSize:"clamp(14px, 1.8vw, 17px)", color:"rgba(255,255,255,.42)", textAlign:"center", lineHeight:1.72, marginBottom:52, maxWidth:400 }}>
            Cada decisión de diseño parte de una pregunta:<br/>¿ayuda a que la conversación fluya mejor?
          </p>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(240px, 1fr))", gap:12, width:"100%", maxWidth:860 }}>
            {FEATURES.map((f, i) => (
              <div key={i} className="fc" style={{ background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.07)", borderRadius:16, padding:"22px 20px" }}>
                <p style={{ fontSize:15.5, fontWeight:600, color:"#fff", marginBottom:7, letterSpacing:"-.01em" }}>{f.title}</p>
                <p style={{ fontSize:13.5, color:"rgba(255,255,255,.44)", lineHeight:1.65 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── PRIVACY ── */}
        <section style={{ padding:"80px 24px 96px", position:"relative", zIndex:1, display:"flex", flexDirection:"column", alignItems:"center", background:"rgba(255,255,255,.014)", borderTop:"1px solid rgba(255,255,255,.04)", borderBottom:"1px solid rgba(255,255,255,.04)" }}>

          <h2 style={{ fontSize:"clamp(26px, 4.5vw, 48px)", fontWeight:700, letterSpacing:"-.03em", textAlign:"center", marginBottom:16, color:"#fff", lineHeight:1.15 }}>Lo que dices aquí,<br/>queda aquí.</h2>
          <p style={{ fontSize:"clamp(14px, 1.8vw, 17px)", color:"rgba(255,255,255,.42)", textAlign:"center", lineHeight:1.72, marginBottom:52, maxWidth:440 }}>
            No grabamos tus conversaciones. No las almacenamos. No las analizamos. Tu voz es solo vuestra.
          </p>

          <div style={{ display:"flex", gap:12, flexWrap:"wrap", justifyContent:"center", width:"100%", maxWidth:720 }}>
            {[
              { title:"Sin grabaciones",    desc:"Tu audio se procesa al momento y desaparece. Nadie puede acceder a él." },
              { title:"Solo entre vosotros", desc:"La conexión es directa entre los dos participantes. Sin servidores en medio." },
              { title:"Sin rastro",         desc:"Cuando cuelgas, la sala desaparece. Como si nunca hubiera existido en un servidor." },
            ].map((p, i) => (
              <div key={i} style={{ flex:"1 1 200px", maxWidth:228, background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.06)", borderRadius:16, padding:"22px 20px" }}>
                <p style={{ fontSize:15, fontWeight:600, color:"#fff", marginBottom:7, letterSpacing:"-.01em" }}>{p.title}</p>
                <p style={{ fontSize:13, color:"rgba(255,255,255,.4)", lineHeight:1.65 }}>{p.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── FINAL CTA ── */}
        <section style={{ padding:"96px 24px 112px", position:"relative", zIndex:1, display:"flex", flexDirection:"column", alignItems:"center" }}>

          <h2 style={{ fontSize:"clamp(32px, 6vw, 64px)", fontWeight:800, letterSpacing:"-.04em", textAlign:"center", marginBottom:16, color:"#fff", lineHeight:1.1 }}>
            ¿A quién quieres<br/>
            <span style={{ color:CY }}>llamar hoy?</span>
          </h2>
          <p style={{ fontSize:"clamp(14px, 1.8vw, 18px)", color:"rgba(255,255,255,.42)", textAlign:"center", lineHeight:1.72, marginBottom:40, maxWidth:340 }}>
            Genera un enlace en segundos y llama.<br/>Sin instalar nada.
          </p>

          <div style={{ display:"flex", gap:12, flexWrap:"wrap", justifyContent:"center", marginBottom:40 }}>
            <button onClick={() => startCall("video")} className="cta-btn-v"
              style={{ display:"flex", alignItems:"center", gap:9, padding:"14px 26px", background:"rgba(0,212,255,.1)", border:"1.5px solid rgba(0,212,255,.32)", borderRadius:14, cursor:"pointer", color:"#fff", fontSize:15, fontWeight:600, letterSpacing:"-.01em", transition:"background .2s", WebkitTapHighlightColor:"transparent", outline:"none" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={CY} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14"/><rect x="2" y="7" width="13" height="10" rx="2"/>
              </svg>
              Videollamada
            </button>
            <button onClick={() => startCall("voice")} className="cta-btn-o"
              style={{ display:"flex", alignItems:"center", gap:9, padding:"14px 26px", background:"rgba(255,92,138,.1)", border:"1.5px solid rgba(255,92,138,.32)", borderRadius:14, cursor:"pointer", color:"#fff", fontSize:15, fontWeight:600, letterSpacing:"-.01em", transition:"background .2s", WebkitTapHighlightColor:"transparent", outline:"none" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={CO} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0014 0M12 19v3M9 22h6"/>
              </svg>
              Solo voz
            </button>
          </div>

          {/* App store badges */}
          <div style={{ display:"flex", gap:10, flexWrap:"wrap", justifyContent:"center" }}>
            {[
              { label:"App Store",   icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg> },
              { label:"Google Play", icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M3.18 23.76c.27.15.59.19.94.08l11.7-6.74-2.51-2.52-10.13 9.18zM20.4 10.55l-2.56-1.49-2.84 2.57 2.84 2.7 2.59-1.5c.74-.43.74-1.85-.03-2.28zM2.29.29C2.1.52 2 .86 2 1.29v21.42c0 .43.11.77.3 1l.09.07 12-11.88v-.28L2.29.29zM14.32 8.21L3.18.25l-.04-.02 10.17 9.24 1.01-.96-.93-.3z"/></svg> },
            ].map(s => (
              <div key={s.label} className="store-pill" style={{ display:"flex", alignItems:"center", gap:9, padding:"9px 16px", background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.07)", borderRadius:11 }}>
                {s.icon}
                <div>
                  <p style={{ fontSize:9, color:"rgba(255,255,255,.32)", margin:0 }}>Próximamente</p>
                  <p style={{ fontSize:12, color:"rgba(255,255,255,.52)", fontWeight:500, margin:0 }}>{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer style={{ padding:"24px 36px", borderTop:"1px solid rgba(255,255,255,.05)", display:"flex", alignItems:"center", justifyContent:"space-between", position:"relative", zIndex:1, flexWrap:"wrap", gap:12 }}>
          <img src="/SPABLA_LOGO.png" alt="SPABLA" style={{ height:19, opacity:.38 }}/>
          <p style={{ fontSize:12, color:"rgba(255,255,255,.18)" }}>© 2025 SPABLA</p>
          <p style={{ fontSize:12, color:"rgba(255,255,255,.18)" }}>Sin almacenamiento de voz</p>
        </footer>

      </div>
    </>
  );
}
