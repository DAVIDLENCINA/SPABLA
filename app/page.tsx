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
  { es: "Me alegra mucho conocerte.",             en: "I'm very glad to meet you." },
  { es: "Llevo tiempo queriendo hablar contigo.", en: "I've been wanting to talk to you for a while." },
  { es: "¿Cuándo vienes a visitarme?",            en: "When are you coming to visit me?" },
  { es: "Te echaba tanto de menos.",              en: "I've missed you so much." },
];

type CtaId = "video-call" | "scroll-demo" | "scroll-descarga";
interface HeroCta   { label: string; id: CtaId; primary: boolean; }
interface HeroSlide { headline: [string, string]; sub: string; ctas: HeroCta[]; }

const HERO_SLIDES: HeroSlide[] = [
  {
    headline: ["Habla con", "el mundo."],
    sub: "Videollamadas con traducción de voz y subtítulos en tiempo real.",
    ctas: [
      { label: "Iniciar llamada", id: "video-call",        primary: true  },
      { label: "Descargar app",   id: "scroll-descarga",   primary: false },
    ],
  },
  {
    headline: ["Entiende", "cualquier idioma."],
    sub: "Comunícate al instante en cualquier país.",
    ctas: [
      { label: "Ver cómo funciona", id: "scroll-demo", primary: true },
    ],
  },
  {
    headline: ["Tu voz.", "Sin fronteras."],
    sub: "Reuniones globales con traducción instantánea y baja latencia.",
    ctas: [
      { label: "Descargar app", id: "scroll-descarga", primary: true },
    ],
  },
];

export default function Home() {
  const router = useRouter();

  const [heroSlide, setHeroSlide] = useState(0);
  const [scrolled,  setScrolled]  = useState(false);
  const [tick,        setTick]        = useState(0);
  const [demoIdx,     setDemoIdx]     = useState(0);
  const [demoVisible, setDemoVisible] = useState(true);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

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

  useEffect(() => {
    const id = setInterval(() => setHeroSlide(s => (s + 1) % 3), 5000);
    return () => clearInterval(id);
  }, []);

  function handleCta(id: CtaId) {
    if      (id === "video-call")       startCall("video");
    else if (id === "scroll-demo")      scrollAnchor("demo");
    else if (id === "scroll-descarga")  scrollAnchor("descarga");
  }

  function startCall(mode: "voice" | "video") {
    router.push(`/call/${generateRoomId()}?mode=${mode}`);
  }

  function scrollAnchor(id: string) {
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
        @keyframes heroFadeIn { from{opacity:0} to{opacity:1} }
        @keyframes blink    { 0%,100%{opacity:1} 50%{opacity:.25} }
        * { box-sizing:border-box; margin:0; padding:0; }
        html { scroll-behavior:smooth; }
        body { background:${BG}; overflow-x:hidden; }
        ::selection { background:rgba(0,212,255,.2); }
        ::-webkit-scrollbar { width:5px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,.1); border-radius:3px; }
        a { text-decoration:none; }
        .nl  { color:rgba(255,255,255,.52); font-size:14px; font-weight:500; cursor:pointer; transition:color .18s; white-space:nowrap; }
        .nl:hover { color:rgba(255,255,255,.92); }
        .fc  { transition:background .2s, transform .2s; }
        .fc:hover  { background:rgba(255,255,255,.07) !important; transform:translateY(-3px); }
        .sbtn { transition:background .2s, border-color .2s; }
        .sbtn:hover { background:rgba(255,255,255,.14) !important; border-color:rgba(255,255,255,.25) !important; }
        .pbtn-g { transition:opacity .18s, transform .18s; }
        .pbtn-g:hover { opacity:.88; transform:translateY(-1px); }
        .pbtn { transition:opacity .18s; }
        .pbtn:hover { opacity:.88; }
.store-btn-s { transition:background .2s; }
        .store-btn-s:hover { background:rgba(255,255,255,.09) !important; }
      `}</style>

      <div style={{ background:BG, fontFamily:"-apple-system,'SF Pro Display','Helvetica Neue',sans-serif", WebkitFontSmoothing:"antialiased", color:"#fff" }}>

        {/* ══════════════════════════════════════════════════
            NAV
        ══════════════════════════════════════════════════ */}
        <nav style={{
          position: "fixed", top:0, left:0, right:0, zIndex:300,
          transition: "background .4s ease, backdrop-filter .4s ease, border-color .4s ease",
          background:           scrolled ? "rgba(2,3,10,.88)"               : "transparent",
          backdropFilter:       scrolled ? "blur(20px)"                     : "none",
          WebkitBackdropFilter: scrolled ? "blur(20px)"                     : "none",
          borderBottom:         scrolled ? "1px solid rgba(255,255,255,.06)" : "1px solid transparent",
        }}>
          <div style={{ maxWidth:MW, margin:"0 auto", padding:"0 40px", height:60, display:"flex", alignItems:"center", gap:32 }}>
            <img src="/SPABLA_LOGO.png" alt="SPABLA" style={{ height:24, flexShrink:0 }}/>
            <div style={{ display:"flex", gap:24, flex:1 }}>
              {(["Funciones","Cómo funciona","Seguridad","Empresas","Descargar"] as const).map((l, i) => {
                const anchors = ["features","demo","privacy","","descarga"];
                return <span key={l} className="nl" onClick={() => anchors[i] && scrollAnchor(anchors[i])}>{l}</span>;
              })}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
              <div style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(255,255,255,.08)", border:"1px solid rgba(255,255,255,.12)", borderRadius:8, padding:"5px 11px", cursor:"default" }}>
                <span style={{ fontSize:12 }}>🇪🇸</span>
                <span style={{ fontSize:13, color:"rgba(255,255,255,.65)", fontWeight:500 }}>ES</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="2.5" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
              </div>
              <button className="pbtn-g" onClick={() => startCall("video")} style={{ background:`linear-gradient(135deg, ${CY}, ${CO})`, border:"none", borderRadius:999, padding:"8px 20px", color:"#fff", fontSize:13.5, fontWeight:700, cursor:"pointer", outline:"none", WebkitTapHighlightColor:"transparent" }}>
                Iniciar llamada
              </button>
            </div>
          </div>
        </nav>

        {/* ══════════════════════════════════════════════════
            HERO SLIDER
        ══════════════════════════════════════════════════ */}
        <section style={{ position:"relative", width:"100vw", height:"100vh", overflow:"hidden" }}>

          {/* ── Capa 1: imágenes (crossfade CSS, siempre en DOM) ── */}
          {[1,2,3].map(n => (
            <img
              key={n}
              src={`/hero${n}.jpg`}
              alt=""
              style={{
                position:"absolute", top:0, left:0,
                width:"100%", height:"100%",
                objectFit:"cover", objectPosition:"center",
                zIndex:0,
                opacity: n - 1 === heroSlide ? 1 : 0,
                transition:"opacity 0.8s ease",
              }}
            />
          ))}

          {/* ── Capa 2: overlay único y fijo ── */}
          <div style={{ position:"absolute", inset:0, zIndex:1, background:"rgba(0,0,0,0.35)", pointerEvents:"none" }}/>

          {/* ── Capa 3: texto — key=heroSlide garantiza un único nodo en DOM ── */}
          <div
            key={heroSlide}
            style={{
              position:"absolute", inset:0, zIndex:2,
              display:"flex", flexDirection:"column",
              alignItems:"center", justifyContent:"center",
              padding:"80px 24px 96px",
              animation:"heroFadeIn 0.5s ease forwards",
            }}
          >
            {(() => {
              const s = HERO_SLIDES[heroSlide];
              return (
                <>
                  <h1 style={{ fontSize:"clamp(52px, 8.5vw, 90px)", fontWeight:900, lineHeight:1.04, letterSpacing:"-.045em", textAlign:"center", marginBottom:18 }}>
                    <span style={{ display:"block", color:"rgba(255,255,255,.92)" }}>{s.headline[0]}</span>
                    <span style={{ display:"block", background:`linear-gradient(130deg, ${CY} 0%, #ffffff 48%, ${CO} 100%)`, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text" }}>
                      {s.headline[1]}
                    </span>
                  </h1>

                  <p style={{ fontSize:"clamp(16px, 2vw, 20px)", color:"rgba(255,255,255,.6)", textAlign:"center", lineHeight:1.68, marginBottom:40, maxWidth:520, fontWeight:400 }}>
                    {s.sub}
                  </p>

                  <div style={{ display:"flex", gap:14, flexWrap:"wrap", justifyContent:"center" }}>
                    {s.ctas.map(cta => (
                      <button key={cta.label} onClick={() => handleCta(cta.id)}
                        className={cta.primary ? "pbtn-g" : "sbtn"}
                        style={cta.primary ? {
                          padding:"15px 34px",
                          background:`linear-gradient(135deg, ${CY} 0%, #a78bfa 52%, ${CO} 100%)`,
                          border:"none", borderRadius:14, color:"#fff",
                          fontSize:16, fontWeight:700, cursor:"pointer",
                          outline:"none", WebkitTapHighlightColor:"transparent",
                          letterSpacing:"-.01em",
                          boxShadow:"0 4px 24px rgba(0,212,255,.22)",
                        } : {
                          padding:"15px 32px",
                          background:"rgba(255,255,255,.1)",
                          border:"1px solid rgba(255,255,255,.2)",
                          borderRadius:14, color:"rgba(255,255,255,.88)",
                          fontSize:16, fontWeight:600, cursor:"pointer",
                          outline:"none", WebkitTapHighlightColor:"transparent",
                          backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)",
                          letterSpacing:"-.01em",
                        }}>
                        {cta.label}
                      </button>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>

        </section>

        {/* ══════════════════════════════════════════════════
            SECCIÓN 2 — Pruébalo en vivo
        ══════════════════════════════════════════════════ */}
        <section id="demo" style={{ padding:"80px 0", background:"rgba(255,255,255,.014)", borderTop:"1px solid rgba(255,255,255,.05)", borderBottom:"1px solid rgba(255,255,255,.05)" }}>
          <div style={{ maxWidth:MW, margin:"0 auto", padding:"0 40px" }}>
            <div style={{ textAlign:"center", marginBottom:44 }}>
              <p style={{ fontSize:11.5, fontWeight:600, letterSpacing:".14em", color:"rgba(255,255,255,.28)", textTransform:"uppercase", marginBottom:12 }}>Demo</p>
              <h2 style={{ fontSize:"clamp(26px, 4vw, 44px)", fontWeight:700, letterSpacing:"-.03em", marginBottom:12, color:"#fff" }}>Pruébalo en vivo</h2>
              <p style={{ fontSize:16, color:"rgba(255,255,255,.42)", lineHeight:1.65, maxWidth:380, margin:"0 auto" }}>Escucha cómo suena la traducción en tiempo real.</p>
            </div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:12, marginBottom:28 }}>
              {([{ flag:"🇪🇸", lang:"Español" }, null, { flag:"🇬🇧", lang:"English" }] as const).map((item, i) =>
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
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
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
            <div style={{ display:"flex", justifyContent:"center", gap:6, marginTop:18 }}>
              {DEMO_PAIRS.map((_, i) => (
                <span key={i} style={{ width:i===demoIdx?16:6, height:5, borderRadius:3, background:i===demoIdx?"rgba(255,255,255,.48)":"rgba(255,255,255,.12)", transition:"all .3s", display:"block" }}/>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════
            SECCIÓN 3 — 5 Features
        ══════════════════════════════════════════════════ */}
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

        {/* ══════════════════════════════════════════════════
            SECCIÓN 4 — Llévalo contigo
        ══════════════════════════════════════════════════ */}
        <section id="descarga" style={{ padding:"80px 0 96px", background:"rgba(255,255,255,.014)", borderTop:"1px solid rgba(255,255,255,.05)", borderBottom:"1px solid rgba(255,255,255,.05)" }}>
          <div style={{ maxWidth:MW, margin:"0 auto", padding:"0 40px", display:"flex", alignItems:"center", gap:60 }}>
            <div style={{ flex:"0 0 auto", width:"clamp(280px, 40%, 400px)" }}>
              <p style={{ fontSize:11.5, fontWeight:600, letterSpacing:".14em", color:"rgba(255,255,255,.28)", textTransform:"uppercase", marginBottom:14 }}>App móvil</p>
              <h2 style={{ fontSize:"clamp(28px, 4vw, 46px)", fontWeight:700, letterSpacing:"-.04em", marginBottom:16, color:"#fff", lineHeight:1.1 }}>Llévalo<br/>contigo.</h2>
              <p style={{ fontSize:16, color:"rgba(255,255,255,.44)", lineHeight:1.7, marginBottom:36, maxWidth:340 }}>
                La misma experiencia en tu móvil, tablet o escritorio. Sin instalar nada si no quieres.
              </p>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {[
                  { label:"App Store",      sub:"Próximamente",             active:false, icon:<svg width="17" height="17" viewBox="0 0 24 24" fill="white"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg> },
                  { label:"Google Play",    sub:"Próximamente",             active:false, icon:<svg width="17" height="17" viewBox="0 0 24 24" fill="white"><path d="M3.18 23.76c.27.15.59.19.94.08l11.7-6.74-2.51-2.52-10.13 9.18zM20.4 10.55l-2.56-1.49-2.84 2.57 2.84 2.7 2.59-1.5c.74-.43.74-1.85-.03-2.28zM2.29.29C2.1.52 2 .86 2 1.29v21.42c0 .43.11.77.3 1l.09.07 12-11.88v-.28L2.29.29zM14.32 8.21L3.18.25l-.04-.02 10.17 9.24 1.01-.96-.93-.3z"/></svg> },
                  { label:"Usar en la Web", sub:"Gratis · Sin instalar nada", active:true, icon:<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg> },
                ].map(b => (
                  <button key={b.label} className={b.active ? "pbtn" : "store-btn-s"}
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
            <div style={{ flex:1, display:"flex", justifyContent:"center", alignItems:"center", gap:16, paddingTop:20 }}>
              {/* Phone 1 */}
              <div style={{ width:172, background:"rgba(7,8,18,.97)", border:"1.5px solid rgba(255,255,255,.12)", borderRadius:30, overflow:"hidden", boxShadow:"0 24px 64px rgba(0,0,0,.55)", flexShrink:0, transform:"rotate(-4deg)", position:"relative" }}>
                <div style={{ display:"flex", justifyContent:"center", padding:"10px 0 6px" }}>
                  <div style={{ width:44, height:4, background:"rgba(255,255,255,.12)", borderRadius:2 }}/>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", padding:"0 14px 8px" }}>
                  <span style={{ fontSize:9, color:"rgba(255,255,255,.3)" }}>9:41</span>
                  <span style={{ fontSize:9, color:"rgba(255,255,255,.3)" }}>●●●</span>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:2, margin:"0 8px" }}>
                  {[{ name:"María", flag:"🇪🇸", color:CY, bg:"rgba(0,212,255,.08)" }, { name:"James", flag:"🇬🇧", color:CO, bg:"rgba(255,92,138,.08)" }].map(p => (
                    <div key={p.name} style={{ background:p.bg, borderRadius:8, padding:"14px 8px 10px", display:"flex", flexDirection:"column", alignItems:"center" }}>
                      <div style={{ width:32, height:32, borderRadius:"50%", background:"rgba(255,255,255,.07)", border:`1px solid ${p.color}44`, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:6 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={p.color} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0112 0v2"/></svg>
                      </div>
                      <p style={{ fontSize:9, color:"rgba(255,255,255,.6)", marginBottom:4 }}>{p.name}</p>
                      <span style={{ fontSize:10 }}>{p.flag}</span>
                    </div>
                  ))}
                </div>
                <div style={{ margin:"8px 8px 0", background:"rgba(0,0,0,.45)", borderRadius:8, padding:"8px 10px" }}>
                  <p style={{ fontSize:8.5, color:"rgba(255,255,255,.72)", lineHeight:1.5, fontStyle:"italic" }}>"Me alegra hablar contigo."</p>
                  <p style={{ fontSize:8.5, color:"rgba(255,255,255,.38)", lineHeight:1.5, fontStyle:"italic" }}>"Glad to talk to you."</p>
                </div>
                <div style={{ display:"flex", justifyContent:"center", gap:1.5, padding:"8px 12px" }}>
                  {Array.from({length:22}, (_, i) => (
                    <span key={i} suppressHydrationWarning style={{ display:"block", width:1.5, height:waveH(i,22), borderRadius:2, background:`rgba(0,212,255,${.2+(i/22)*.6})`, transition:"height .1s" }}/>
                  ))}
                </div>
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
              {/* Phone 2 */}
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
                  <div style={{ background:"rgba(255,255,255,.05)", borderRadius:10, padding:"10px", marginBottom:8 }}>
                    <p style={{ fontSize:8.5, color:"rgba(255,255,255,.28)", marginBottom:4 }}>ORIGEN · 🇩🇪</p>
                    <p style={{ fontSize:9.5, color:"rgba(255,255,255,.7)", lineHeight:1.45, fontStyle:"italic" }}>"Wie geht es Ihnen?"</p>
                  </div>
                  <div style={{ display:"flex", justifyContent:"center", marginBottom:8 }}>
                    <div style={{ width:18, height:18, borderRadius:"50%", background:"rgba(0,212,255,.1)", border:"1px solid rgba(0,212,255,.25)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={CY} strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                    </div>
                  </div>
                  <div style={{ background:"rgba(0,212,255,.06)", border:"1px solid rgba(0,212,255,.12)", borderRadius:10, padding:"10px", marginBottom:10 }}>
                    <p style={{ fontSize:8.5, color:"rgba(0,212,255,.55)", marginBottom:4 }}>TRADUCCIÓN · 🇪🇸</p>
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

        {/* ══════════════════════════════════════════════════
            SECCIÓN 5 — Privacy banner
        ══════════════════════════════════════════════════ */}
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
