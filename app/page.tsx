"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

const CY = "#00D4FF";
const CO = "#FF5C8A";
const BG = "#02030A";
const MW = 1100;

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8);
}

const DEMO_PAIRS = [
  { es: "Me alegra mucho conocerte.",              en: "I'm very glad to meet you." },
  { es: "Llevo tiempo queriendo hablar contigo.",  en: "I've been wanting to talk to you for a while." },
  { es: "¿Cuándo vienes a visitarme?",             en: "When are you coming to visit me?" },
  { es: "Te echaba tanto de menos.",               en: "I've missed you so much." },
];

export default function Home() {
  const router = useRouter();
  const [tick, setTick]             = useState(0);
  const [demoIdx, setDemoIdx]       = useState(0);
  const [demoVisible, setDemoVisible] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 100);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setDemoVisible(false);
      setTimeout(() => { setDemoIdx(i => (i + 1) % DEMO_PAIRS.length); setDemoVisible(true); }, 380);
    }, 3800);
    return () => clearInterval(id);
  }, []);

  function startCall(mode: "voice" | "video") {
    router.push(`/call/${generateRoomId()}?mode=${mode}`);
  }

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }

  function waveH(i: number, bars: number, phase = 0) {
    const base = Math.sin(i * 0.85) * 8 + 10;
    return Math.max(3, base + Math.sin(tick * 0.14 + i * 0.55 + phase) * 6);
  }

  const demo = DEMO_PAIRS[demoIdx];

  return (
    <>
      <style>{`
        @keyframes floatUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes blink   { 0%,100%{opacity:1} 50%{opacity:.25} }
        @keyframes bob     { 0%,100%{transform:translateX(-50%) translateY(0)} 50%{transform:translateX(-50%) translateY(5px)} }
        * { box-sizing:border-box; margin:0; padding:0; }
        html { scroll-behavior:smooth; }
        body { background:${BG}; overflow-x:hidden; }
        ::selection { background:rgba(0,212,255,.2); }
        ::-webkit-scrollbar { width:5px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,.1); border-radius:3px; }
        a { text-decoration:none; }
        .nl { color:rgba(255,255,255,.48); font-size:14px; font-weight:500; cursor:pointer; transition:color .18s; }
        .nl:hover { color:rgba(255,255,255,.88); }
        .fc { transition:background .2s, transform .2s; }
        .fc:hover { background:rgba(255,255,255,.07) !important; transform:translateY(-3px); }
        .sbtn { transition:background .2s; }
        .sbtn:hover { background:rgba(255,255,255,.09) !important; }
        .pbtn:hover { opacity:.88; }
      `}</style>

      <div style={{ background:BG, fontFamily:"-apple-system,'SF Pro Display','Helvetica Neue',sans-serif", WebkitFontSmoothing:"antialiased", color:"#fff" }}>

        {/* ── NAV ── */}
        <nav style={{ position:"fixed", top:0, left:0, right:0, zIndex:200, background:"rgba(2,3,10,.88)", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)", borderBottom:"1px solid rgba(255,255,255,.05)" }}>
          <div style={{ maxWidth:MW, margin:"0 auto", padding:"0 40px", height:58, display:"flex", alignItems:"center", gap:36 }}>
            <img src="/SPABLA_LOGO.png" alt="SPABLA" style={{ height:24, flexShrink:0 }}/>
            <div style={{ display:"flex", gap:26, flex:1 }}>
              {(["Funciones","Cómo funciona","Seguridad","Precios","Descargar"] as const).map((l, i) => {
                const ids = ["features","demo","privacy","","descarga"];
                return (
                  <span key={l} className="nl" onClick={() => ids[i] && scrollTo(ids[i])}>{l}</span>
                );
              })}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.09)", borderRadius:8, padding:"5px 11px", cursor:"default" }}>
                <span style={{ fontSize:12 }}>🇪🇸</span>
                <span style={{ fontSize:13, color:"rgba(255,255,255,.6)", fontWeight:500 }}>ES</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="2.5" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
              </div>
              <button className="pbtn" onClick={() => startCall("video")} style={{ background:CY, border:"none", borderRadius:999, padding:"8px 20px", color:"#000", fontSize:13.5, fontWeight:700, cursor:"pointer", outline:"none", WebkitTapHighlightColor:"transparent", transition:"opacity .18s" }}>
                Iniciar llamada
              </button>
            </div>
          </div>
        </nav>

        {/* ── HERO ── */}
        <section style={{ paddingTop:118, paddingBottom:80, minHeight:"100vh", display:"flex", alignItems:"center" }}>
          <div style={{ maxWidth:MW, margin:"0 auto", padding:"0 40px", display:"flex", alignItems:"center", gap:56, width:"100%" }}>

            {/* Left */}
            <div style={{ flex:"0 0 auto", width:"clamp(300px, 42%, 460px)" }}>
              <h1 style={{ fontSize:"clamp(40px, 4.8vw, 60px)", fontWeight:800, lineHeight:1.06, letterSpacing:"-.04em", marginBottom:18, animation:"floatUp .6s ease .1s both" }}>
                Habla con<br/><span style={{ color:CY }}>el mundo.</span>
              </h1>
              <p style={{ fontSize:17, color:"rgba(255,255,255,.5)", lineHeight:1.7, marginBottom:34, maxWidth:400, animation:"floatUp .6s ease .2s both" }}>
                Traducción instantánea de voz en videollamadas. Habla en tu idioma, entiéndete con cualquier persona.
              </p>

              <div style={{ display:"flex", gap:12, marginBottom:22, flexWrap:"wrap", animation:"floatUp .6s ease .3s both" }}>
                {/* Iniciar llamada */}
                <button className="pbtn" onClick={() => startCall("video")} style={{ display:"flex", alignItems:"center", gap:8, padding:"13px 26px", background:CY, border:"none", borderRadius:12, cursor:"pointer", color:"#000", fontSize:15, fontWeight:700, outline:"none", WebkitTapHighlightColor:"transparent", transition:"opacity .18s" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14"/><rect x="2" y="7" width="13" height="10" rx="2"/>
                  </svg>
                  Iniciar llamada
                </button>
                {/* Descargar app */}
                <button className="sbtn" onClick={() => scrollTo("descarga")} style={{ display:"flex", alignItems:"center", gap:8, padding:"13px 22px", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.12)", borderRadius:12, cursor:"pointer", color:"rgba(255,255,255,.8)", fontSize:15, fontWeight:500, outline:"none", WebkitTapHighlightColor:"transparent" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                  </svg>
                  Descargar app
                </button>
              </div>

              <div style={{ display:"flex", alignItems:"center", gap:7, animation:"floatUp .6s ease .4s both" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span style={{ fontSize:12.5, color:"rgba(255,255,255,.3)" }}>Sin registro. Sin compartir datos. 100% privado.</span>
              </div>
            </div>

            {/* Right — video call mockup */}
            <div style={{ flex:1, display:"flex", justifyContent:"center", animation:"floatUp .7s ease .2s both" }}>
              <div style={{ width:"100%", maxWidth:500, background:"rgba(7,8,18,.98)", border:"1px solid rgba(255,255,255,.1)", borderRadius:20, overflow:"hidden", boxShadow:"0 32px 80px rgba(0,0,0,.55)" }}>

                {/* Call header */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"13px 18px", background:"rgba(255,255,255,.03)", borderBottom:"1px solid rgba(255,255,255,.06)" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ width:7, height:7, borderRadius:"50%", background:"#22c55e", display:"block", animation:"blink 2.2s ease-in-out infinite" }}/>
                    <span style={{ fontSize:12, color:"rgba(255,255,255,.42)", fontWeight:500 }}>En llamada · 04:32</span>
                  </div>
                  <img src="/SPABLA_LOGO.png" alt="" style={{ height:13, opacity:.3 }}/>
                </div>

                {/* Participant tiles */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:2, padding:2, background:"rgba(0,0,0,.25)" }}>
                  {/* María */}
                  <div style={{ background:"#07091a", borderRadius:8, padding:"22px 14px 36px", display:"flex", flexDirection:"column", alignItems:"center", position:"relative" }}>
                    <div style={{ width:54, height:54, borderRadius:"50%", background:"rgba(0,212,255,.09)", border:"1.5px solid rgba(0,212,255,.22)", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:9 }}>
                      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={CY} strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0112 0v2"/></svg>
                    </div>
                    <p style={{ fontSize:13, fontWeight:500, color:"rgba(255,255,255,.72)", marginBottom:7 }}>María</p>
                    <div style={{ display:"flex", alignItems:"center", gap:4, background:"rgba(255,255,255,.05)", borderRadius:999, padding:"2px 9px" }}>
                      <span style={{ fontSize:11 }}>🇪🇸</span>
                      <span style={{ fontSize:10.5, color:"rgba(255,255,255,.4)" }}>Español</span>
                    </div>
                    {/* waveform speaking indicator */}
                    <div style={{ position:"absolute", bottom:10, left:"50%", transform:"translateX(-50%)", display:"flex", alignItems:"center", gap:2 }}>
                      {[4,8,12,8,4,10,7,12,8,4,6,3].map((h, i) => (
                        <span key={i} suppressHydrationWarning style={{ display:"block", width:2, height:Math.max(2, h + Math.sin(tick*.18+i*.7)*4), borderRadius:2, background:"rgba(0,212,255,.6)", transition:"height .1s" }}/>
                      ))}
                    </div>
                  </div>

                  {/* James */}
                  <div style={{ background:"#0f0608", borderRadius:8, padding:"22px 14px 36px", display:"flex", flexDirection:"column", alignItems:"center", position:"relative" }}>
                    <div style={{ width:54, height:54, borderRadius:"50%", background:"rgba(255,92,138,.09)", border:"1.5px solid rgba(255,92,138,.22)", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:9 }}>
                      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={CO} strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0112 0v2"/></svg>
                    </div>
                    <p style={{ fontSize:13, fontWeight:500, color:"rgba(255,255,255,.72)", marginBottom:7 }}>James</p>
                    <div style={{ display:"flex", alignItems:"center", gap:4, background:"rgba(255,255,255,.05)", borderRadius:999, padding:"2px 9px" }}>
                      <span style={{ fontSize:11 }}>🇬🇧</span>
                      <span style={{ fontSize:10.5, color:"rgba(255,255,255,.4)" }}>English</span>
                    </div>
                    <p style={{ position:"absolute", bottom:12, fontSize:10.5, color:"rgba(255,255,255,.22)" }}>Escuchando...</p>
                  </div>
                </div>

                {/* Live subtitles */}
                <div style={{ padding:"12px 16px 10px", borderTop:"1px solid rgba(255,255,255,.05)" }}>
                  <div style={{ display:"flex", alignItems:"baseline", gap:6, marginBottom:5 }}>
                    <span style={{ fontSize:13 }}>🇪🇸</span>
                    <p style={{ fontSize:13, color:"rgba(255,255,255,.8)", lineHeight:1.5 }}>"Me alegra mucho poder hablar contigo."</p>
                  </div>
                  <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
                    <span style={{ fontSize:13 }}>🇬🇧</span>
                    <p style={{ fontSize:12.5, color:"rgba(255,255,255,.42)", fontStyle:"italic", lineHeight:1.5 }}>"I'm so glad to be able to talk to you."</p>
                  </div>
                </div>

                {/* Waveform */}
                <div style={{ padding:"8px 16px", display:"flex", alignItems:"center", justifyContent:"center", gap:2.5 }}>
                  {Array.from({ length:36 }, (_, i) => (
                    <span key={i} suppressHydrationWarning style={{ display:"block", width:2.5, height:waveH(i,36), borderRadius:2, background: i<18 ? `rgba(0,212,255,${.18+(i/18)*.65})` : `rgba(255,92,138,${.83-((i-18)/18)*.52})`, transition:"height .1s" }}/>
                  ))}
                </div>

                {/* Call controls */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10, padding:"10px 16px 16px" }}>
                  {[
                    { bg:"rgba(255,255,255,.08)", icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="1.8" strokeLinecap="round"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0014 0M12 19v3M9 22h6"/></svg> },
                    { bg:"rgba(255,255,255,.08)", icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14"/><rect x="2" y="7" width="13" height="10" rx="2"/></svg> },
                    { bg:"#dc2626",               icon:<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7 2 2 0 012 2v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.42 19.42 0 013.43 9.65 19.86 19.86 0 01.36 1a2 2 0 012-2h3a2 2 0 012 2 12.74 12.74 0 00.7 2.81 2 2 0 01-.45 2.11L6.34 5.18"/></svg> },
                    { bg:"rgba(255,255,255,.08)", icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg> },
                  ].map((b, i) => (
                    <div key={i} style={{ width:38, height:38, borderRadius:"50%", background:b.bg, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>
                      {b.icon}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* scroll indicator */}
          <div style={{ position:"absolute", bottom:28, left:"50%", animation:"bob 2.5s ease-in-out infinite", display:"flex", flexDirection:"column", alignItems:"center", gap:5, opacity:.2 }}>
            <span style={{ fontSize:10, letterSpacing:".1em", textTransform:"uppercase" }}>Descubrir</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
          </div>
        </section>

        {/* ── SECTION 2: Pruébalo en vivo ── */}
        <section id="demo" style={{ padding:"80px 0", background:"rgba(255,255,255,.014)", borderTop:"1px solid rgba(255,255,255,.05)", borderBottom:"1px solid rgba(255,255,255,.05)" }}>
          <div style={{ maxWidth:MW, margin:"0 auto", padding:"0 40px" }}>
            <div style={{ textAlign:"center", marginBottom:44 }}>
              <p style={{ fontSize:11.5, fontWeight:600, letterSpacing:".14em", color:"rgba(255,255,255,.28)", textTransform:"uppercase", marginBottom:12 }}>Demo</p>
              <h2 style={{ fontSize:"clamp(26px, 4vw, 44px)", fontWeight:700, letterSpacing:"-.03em", marginBottom:12, color:"#fff" }}>Pruébalo en vivo</h2>
              <p style={{ fontSize:16, color:"rgba(255,255,255,.42)", lineHeight:1.65, maxWidth:380, margin:"0 auto" }}>Escucha cómo suena la traducción en tiempo real.</p>
            </div>

            {/* Language selector */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:12, marginBottom:28 }}>
              {[{ flag:"🇪🇸", lang:"Español" }, null, { flag:"🇬🇧", lang:"English" }].map((item, i) =>
                item === null ? (
                  <div key="swap" style={{ width:34, height:34, borderRadius:"50%", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3L4 7l4 4M16 21l4-4-4-4M4 7h16M4 17h16"/></svg>
                  </div>
                ) : (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.1)", borderRadius:10, padding:"9px 15px", cursor:"pointer" }}>
                    <span style={{ fontSize:16 }}>{item.flag}</span>
                    <span style={{ fontSize:14, color:"rgba(255,255,255,.72)", fontWeight:500 }}>{item.lang}</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.32)" strokeWidth="2.5" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
                  </div>
                )
              )}
            </div>

            {/* Two translation boxes */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              {/* Original */}
              <div style={{ background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:16, overflow:"hidden" }}>
                <div style={{ padding:"11px 16px", borderBottom:"1px solid rgba(255,255,255,.06)", display:"flex", alignItems:"center", gap:7 }}>
                  <span style={{ fontSize:14 }}>🇪🇸</span>
                  <span style={{ fontSize:12, color:"rgba(255,255,255,.4)", fontWeight:500 }}>Español · Hablando</span>
                  <span style={{ marginLeft:"auto", width:6, height:6, borderRadius:"50%", background:"#22c55e", display:"block", animation:"blink 2.2s ease-in-out infinite" }}/>
                </div>
                <div style={{ padding:"20px 18px", minHeight:76, transition:"opacity .35s ease, transform .35s ease", opacity:demoVisible?1:0, transform:demoVisible?"translateY(0)":"translateY(6px)" }}>
                  <p style={{ fontSize:"clamp(14px, 1.8vw, 18px)", color:"rgba(255,255,255,.82)", lineHeight:1.55, fontStyle:"italic" }}>"{demo.es}"</p>
                </div>
                <div style={{ padding:"6px 16px 14px", display:"flex", alignItems:"center", gap:2 }}>
                  {Array.from({ length:30 }, (_, i) => (
                    <span key={i} suppressHydrationWarning style={{ display:"block", width:2, height:waveH(i,30), borderRadius:2, background:`rgba(0,212,255,${.18+(i/30)*.68})`, transition:"height .1s" }}/>
                  ))}
                </div>
              </div>

              {/* Translated */}
              <div style={{ background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:16, overflow:"hidden" }}>
                <div style={{ padding:"11px 16px", borderBottom:"1px solid rgba(255,255,255,.06)", display:"flex", alignItems:"center", gap:7 }}>
                  <span style={{ fontSize:14 }}>🇬🇧</span>
                  <span style={{ fontSize:12, color:"rgba(255,255,255,.4)", fontWeight:500 }}>English · Traducción</span>
                  <span style={{ marginLeft:"auto", width:6, height:6, borderRadius:"50%", background:CY, display:"block", animation:"blink 1.8s ease-in-out .3s infinite" }}/>
                </div>
                <div style={{ padding:"20px 18px", minHeight:76, transition:"opacity .35s ease .15s, transform .35s ease .15s", opacity:demoVisible?1:0, transform:demoVisible?"translateY(0)":"translateY(6px)" }}>
                  <p style={{ fontSize:"clamp(14px, 1.8vw, 18px)", color:"rgba(255,255,255,.6)", lineHeight:1.55, fontStyle:"italic" }}>"{demo.en}"</p>
                </div>
                <div style={{ padding:"6px 16px 14px", display:"flex", alignItems:"center", gap:2 }}>
                  {Array.from({ length:30 }, (_, i) => (
                    <span key={i} suppressHydrationWarning style={{ display:"block", width:2, height:waveH(i,30,1.4), borderRadius:2, background:`rgba(255,92,138,${.15+(i/30)*.58})`, transition:"height .1s" }}/>
                  ))}
                </div>
              </div>
            </div>

            {/* dots */}
            <div style={{ display:"flex", justifyContent:"center", gap:6, marginTop:18 }}>
              {DEMO_PAIRS.map((_, i) => (
                <span key={i} style={{ width:i===demoIdx?16:6, height:5, borderRadius:3, background:i===demoIdx?"rgba(255,255,255,.48)":"rgba(255,255,255,.12)", transition:"all .3s", display:"block" }}/>
              ))}
            </div>
          </div>
        </section>

        {/* ── SECTION 3: 5 Features ── */}
        <section id="features" style={{ padding:"68px 0" }}>
          <div style={{ maxWidth:MW, margin:"0 auto", padding:"0 40px" }}>
            <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
              {[
                { title:"Traducción en tiempo real", desc:"Cada frase, al instante.",
                  icon:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={CY} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg> },
                { title:"Voz cristalina",            desc:"Síntesis de voz con IA.",
                  icon:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={CY} strokeWidth="1.7" strokeLinecap="round"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0014 0M12 19v3M9 22h6"/></svg> },
                { title:"Privado y seguro",          desc:"Sin grabaciones, nunca.",
                  icon:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={CY} strokeWidth="1.7" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> },
                { title:"Baja latencia",             desc:"Menos de 500ms.",
                  icon:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={CY} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> },
                { title:"En todos tus dispositivos", desc:"Web, iOS y Android.",
                  icon:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={CY} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><rect x="2" y="7" width="6" height="11" rx="1"/><rect x="16" y="7" width="6" height="11" rx="1"/></svg> },
              ].map((f, i) => (
                <div key={i} className="fc" style={{ flex:"1 1 160px", maxWidth:196, background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.07)", borderRadius:16, padding:"24px 18px", textAlign:"center" }}>
                  <div style={{ display:"flex", justifyContent:"center", marginBottom:14 }}>{f.icon}</div>
                  <p style={{ fontSize:14, fontWeight:600, color:"#fff", marginBottom:6, letterSpacing:"-.01em", lineHeight:1.35 }}>{f.title}</p>
                  <p style={{ fontSize:12.5, color:"rgba(255,255,255,.36)", lineHeight:1.5 }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── SECTION 4: Llévalo contigo ── */}
        <section id="descarga" style={{ padding:"80px 0 96px", background:"rgba(255,255,255,.014)", borderTop:"1px solid rgba(255,255,255,.05)", borderBottom:"1px solid rgba(255,255,255,.05)" }}>
          <div style={{ maxWidth:MW, margin:"0 auto", padding:"0 40px", display:"flex", alignItems:"center", gap:60 }}>

            {/* Left */}
            <div style={{ flex:"0 0 auto", width:"clamp(280px, 40%, 400px)" }}>
              <p style={{ fontSize:11.5, fontWeight:600, letterSpacing:".14em", color:"rgba(255,255,255,.28)", textTransform:"uppercase", marginBottom:14 }}>App móvil</p>
              <h2 style={{ fontSize:"clamp(28px, 4vw, 46px)", fontWeight:700, letterSpacing:"-.04em", marginBottom:16, color:"#fff", lineHeight:1.1 }}>Llévalo<br/>contigo.</h2>
              <p style={{ fontSize:16, color:"rgba(255,255,255,.44)", lineHeight:1.7, marginBottom:36, maxWidth:340 }}>
                La misma experiencia en tu móvil, tablet o escritorio. Sin instalar nada si no quieres.
              </p>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {[
                  { label:"App Store",    sub:"Próximamente",        active:false, icon:<svg width="17" height="17" viewBox="0 0 24 24" fill="white"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg> },
                  { label:"Google Play",  sub:"Próximamente",        active:false, icon:<svg width="17" height="17" viewBox="0 0 24 24" fill="white"><path d="M3.18 23.76c.27.15.59.19.94.08l11.7-6.74-2.51-2.52-10.13 9.18zM20.4 10.55l-2.56-1.49-2.84 2.57 2.84 2.7 2.59-1.5c.74-.43.74-1.85-.03-2.28zM2.29.29C2.1.52 2 .86 2 1.29v21.42c0 .43.11.77.3 1l.09.07 12-11.88v-.28L2.29.29zM14.32 8.21L3.18.25l-.04-.02 10.17 9.24 1.01-.96-.93-.3z"/></svg> },
                  { label:"Usar en la Web", sub:"Gratis · Sin instalar nada", active:true, icon:<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg> },
                ].map(b => (
                  <button key={b.label} className={b.active ? "pbtn" : "sbtn"}
                    onClick={b.active ? () => startCall("video") : undefined}
                    style={{ display:"flex", alignItems:"center", gap:13, padding:"12px 18px", background: b.active ? CY : "rgba(255,255,255,.05)", border: b.active ? "none" : "1px solid rgba(255,255,255,.1)", borderRadius:12, cursor: b.active ? "pointer" : "default", opacity: b.active ? 1 : .5, outline:"none", WebkitTapHighlightColor:"transparent", maxWidth:260, transition:"opacity .18s" }}>
                    <div style={{ color: b.active ? "#000" : "white", display:"flex", flexShrink:0 }}>{b.icon}</div>
                    <div style={{ textAlign:"left" }}>
                      <p style={{ fontSize:10, color: b.active ? "rgba(0,0,0,.5)" : "rgba(255,255,255,.38)", margin:0 }}>{b.sub}</p>
                      <p style={{ fontSize:14, color: b.active ? "#000" : "rgba(255,255,255,.75)", fontWeight:600, margin:0 }}>{b.label}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Right — phone mockups */}
            <div style={{ flex:1, display:"flex", justifyContent:"center", alignItems:"center", gap:16, paddingTop:20 }}>

              {/* Phone 1 — call in progress */}
              <div style={{ width:172, background:"rgba(7,8,18,.97)", border:"1.5px solid rgba(255,255,255,.12)", borderRadius:30, overflow:"hidden", boxShadow:"0 24px 64px rgba(0,0,0,.55)", flexShrink:0, transform:"rotate(-4deg)", position:"relative" }}>
                {/* notch */}
                <div style={{ display:"flex", justifyContent:"center", padding:"10px 0 6px" }}>
                  <div style={{ width:44, height:4, background:"rgba(255,255,255,.12)", borderRadius:2 }}/>
                </div>
                {/* status bar */}
                <div style={{ display:"flex", justifyContent:"space-between", padding:"0 14px 8px" }}>
                  <span style={{ fontSize:9, color:"rgba(255,255,255,.3)" }}>9:41</span>
                  <span style={{ fontSize:9, color:"rgba(255,255,255,.3)" }}>●●●</span>
                </div>
                {/* tiles */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:2, margin:"0 8px" }}>
                  {[{ name:"María", flag:"🇪🇸", color:CY, bg:"rgba(0,212,255,.08)" }, { name:"James", flag:"🇬🇧", color:CO, bg:"rgba(255,92,138,.08)" }].map(p => (
                    <div key={p.name} style={{ background:p.bg, borderRadius:8, padding:"14px 8px 10px", display:"flex", flexDirection:"column", alignItems:"center" }}>
                      <div style={{ width:32, height:32, borderRadius:"50%", background:`rgba(255,255,255,.07)`, border:`1px solid ${p.color}44`, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:6 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={p.color} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0112 0v2"/></svg>
                      </div>
                      <p style={{ fontSize:9, color:"rgba(255,255,255,.6)", marginBottom:4 }}>{p.name}</p>
                      <span style={{ fontSize:10 }}>{p.flag}</span>
                    </div>
                  ))}
                </div>
                {/* subtitles */}
                <div style={{ margin:"8px 8px 0", background:"rgba(0,0,0,.45)", borderRadius:8, padding:"8px 10px" }}>
                  <p style={{ fontSize:8.5, color:"rgba(255,255,255,.72)", lineHeight:1.5, fontStyle:"italic" }}>"Me alegra hablar contigo."</p>
                  <p style={{ fontSize:8.5, color:"rgba(255,255,255,.38)", lineHeight:1.5, fontStyle:"italic" }}>"Glad to talk to you."</p>
                </div>
                {/* mini waveform */}
                <div style={{ display:"flex", justifyContent:"center", gap:1.5, padding:"8px 12px" }}>
                  {Array.from({length:22}, (_, i) => (
                    <span key={i} suppressHydrationWarning style={{ display:"block", width:1.5, height:waveH(i,22), borderRadius:2, background:`rgba(0,212,255,${.2+(i/22)*.6})`, transition:"height .1s" }}/>
                  ))}
                </div>
                {/* controls */}
                <div style={{ display:"flex", justifyContent:"space-around", padding:"8px 18px 14px" }}>
                  {["rgba(255,255,255,.08)","rgba(255,255,255,.08)","#dc2626"].map((bg, i) => (
                    <div key={i} style={{ width:32, height:32, borderRadius:"50%", background:bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={i===2?"white":"rgba(255,255,255,.65)"} strokeWidth="2" strokeLinecap="round">
                        {i===0 && <><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0014 0M12 19v3"/></>}
                        {i===1 && <><path d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14"/><rect x="2" y="7" width="13" height="10" rx="2"/></>}
                        {i===2 && <path d="M18 6L6 18M6 6l12 12"/>}
                      </svg>
                    </div>
                  ))}
                </div>
              </div>

              {/* Phone 2 — subtitle view */}
              <div style={{ width:172, background:"rgba(7,8,18,.97)", border:"1.5px solid rgba(255,255,255,.12)", borderRadius:30, overflow:"hidden", boxShadow:"0 24px 64px rgba(0,0,0,.55)", flexShrink:0, transform:"rotate(4deg) translateY(14px)", position:"relative" }}>
                <div style={{ display:"flex", justifyContent:"center", padding:"10px 0 6px" }}>
                  <div style={{ width:44, height:4, background:"rgba(255,255,255,.12)", borderRadius:2 }}/>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", padding:"0 14px 8px" }}>
                  <span style={{ fontSize:9, color:"rgba(255,255,255,.3)" }}>9:41</span>
                  <span style={{ fontSize:9, color:"rgba(255,255,255,.3)" }}>●●●</span>
                </div>
                <div style={{ padding:"0 10px" }}>
                  <img src="/SPABLA_LOGO.png" alt="" style={{ height:13, display:"block", margin:"0 auto 12px", opacity:.5 }}/>
                  {/* translation card */}
                  <div style={{ background:"rgba(255,255,255,.05)", borderRadius:10, padding:"10px", marginBottom:8 }}>
                    <p style={{ fontSize:8.5, color:"rgba(255,255,255,.28)", marginBottom:4 }}>ORIGEN · 🇩🇪</p>
                    <p style={{ fontSize:9.5, color:"rgba(255,255,255,.7)", lineHeight:1.45, fontStyle:"italic" }}>"Wie geht es Ihnen?"</p>
                  </div>
                  <div style={{ display:"flex", justifyContent:"center", marginBottom:8 }}>
                    <div style={{ width:18, height:18, borderRadius:"50%", background:`rgba(0,212,255,.1)`, border:`1px solid rgba(0,212,255,.25)`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={CY} strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                    </div>
                  </div>
                  <div style={{ background:"rgba(0,212,255,.06)", border:"1px solid rgba(0,212,255,.12)", borderRadius:10, padding:"10px", marginBottom:10 }}>
                    <p style={{ fontSize:8.5, color:`rgba(0,212,255,.55)`, marginBottom:4 }}>TRADUCCIÓN · 🇪🇸</p>
                    <p style={{ fontSize:9.5, color:"rgba(255,255,255,.72)", lineHeight:1.45, fontStyle:"italic" }}>"¿Cómo está usted?"</p>
                  </div>
                  <div style={{ display:"flex", justifyContent:"center", gap:1.5 }}>
                    {Array.from({length:22}, (_, i) => (
                      <span key={i} suppressHydrationWarning style={{ display:"block", width:1.5, height:waveH(i,22,2), borderRadius:2, background:`rgba(255,92,138,${.15+(i/22)*.5})`, transition:"height .1s" }}/>
                    ))}
                  </div>
                </div>
                <div style={{ height:16 }}/>
              </div>
            </div>
          </div>
        </section>

        {/* ── SECTION 5: Privacy banner ── */}
        <div id="privacy" style={{ background:"rgba(0,212,255,.045)", borderTop:"1px solid rgba(0,212,255,.1)", borderBottom:"1px solid rgba(0,212,255,.08)", padding:"16px 40px" }}>
          <div style={{ maxWidth:MW, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"center", gap:10, flexWrap:"wrap" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={CY} strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <p style={{ fontSize:13.5, color:"rgba(255,255,255,.52)" }}>Tu privacidad es nuestra prioridad. No almacenamos tu voz.</p>
            <a style={{ fontSize:13.5, color:CY, fontWeight:500, cursor:"pointer", borderBottom:`1px solid rgba(0,212,255,.3)`, lineHeight:1.2 }}>Saber más</a>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <footer style={{ padding:"22px 40px", borderTop:"1px solid rgba(255,255,255,.05)" }}>
          <div style={{ maxWidth:MW, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
            <img src="/SPABLA_LOGO.png" alt="SPABLA" style={{ height:18, opacity:.36 }}/>
            <p style={{ fontSize:12, color:"rgba(255,255,255,.18)" }}>© 2025 SPABLA · Traducción en tiempo real</p>
            <p style={{ fontSize:12, color:"rgba(255,255,255,.18)" }}>Hecho para conectar personas</p>
          </div>
        </footer>

      </div>
    </>
  );
}
