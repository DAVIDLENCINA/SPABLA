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

  // ── Hero slider ──────────────────────────────────────────
  const [heroSlide,   setHeroSlide]   = useState(0);
  const [heroOpacity, setHeroOpacity] = useState(1);
  const [bgKey,       setBgKey]       = useState(0);
  const [scrolled,    setScrolled]    = useState(false);

  // ── Demo section ─────────────────────────────────────────
  const [tick,        setTick]        = useState(0);
  const [demoIdx,     setDemoIdx]     = useState(0);
  const [demoVisible, setDemoVisible] = useState(true);

  // Scroll → navbar blur
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  // Waveform tick
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 100);
    return () => clearInterval(id);
  }, []);

  // Demo cycling
  useEffect(() => {
    const id = setInterval(() => {
      setDemoVisible(false);
      setTimeout(() => { setDemoIdx(i => (i + 1) % DEMO_PAIRS.length); setDemoVisible(true); }, 380);
    }, 3800);
    return () => clearInterval(id);
  }, []);

  // Hero autoplay — fade out, switch, fade in
  useEffect(() => {
    const id = setInterval(() => {
      setHeroOpacity(0);
      setTimeout(() => {
        setHeroSlide(s => (s + 1) % 3);
        setBgKey(k => k + 1);
        setHeroOpacity(1);
      }, 650);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  function goSlide(i: number) {
    if (i === heroSlide) return;
    setHeroOpacity(0);
    setTimeout(() => { setHeroSlide(i); setBgKey(k => k + 1); setHeroOpacity(1); }, 400);
  }

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

  const demo  = DEMO_PAIRS[demoIdx];
  const slide = HERO_SLIDES[heroSlide];

  return (
    <>
      <style>{`
        @keyframes heroZoom { from{transform:scale(1)} to{transform:scale(1.07)} }
        @keyframes blink    { 0%,100%{opacity:1} 50%{opacity:.25} }
        @keyframes bob      { 0%,100%{transform:translateX(-50%) translateY(0)} 50%{transform:translateX(-50%) translateY(5px)} }
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
        .hdot { border:none; outline:none; cursor:pointer; padding:0; transition:all .35s ease; }
        .store-btn-s { transition:background .2s; }
        .store-btn-s:hover { background:rgba(255,255,255,.09) !important; }
      `}</style>

      <div style={{ background:BG, fontFamily:"-apple-system,'SF Pro Display','Helvetica Neue',sans-serif", WebkitFontSmoothing:"antialiased", color:"#fff" }}>

        {/* ══════════════════════════════════════════════════
            NAV — transparent over hero, blurs on scroll
        ══════════════════════════════════════════════════ */}
        <nav style={{
          position: "fixed", top:0, left:0, right:0, zIndex:300,
          transition: "background .4s ease, backdrop-filter .4s ease, border-color .4s ease",
          background:        scrolled ? "rgba(2,3,10,.88)"          : "transparent",
          backdropFilter:    scrolled ? "blur(20px)"                 : "none",
          WebkitBackdropFilter: scrolled ? "blur(20px)"              : "none",
          borderBottom:      scrolled ? "1px solid rgba(255,255,255,.06)" : "1px solid transparent",
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
            HERO SLIDER — fullscreen cinematográfico
        ══════════════════════════════════════════════════ */}
        <section style={{ position:"relative", width:"100%", minHeight:"92vh", overflow:"hidden", display:"flex", flexDirection:"column" }}>

          {/* ── Background scene (remounts on bgKey → restart zoom) ── */}
          <div key={bgKey} style={{ position:"absolute", inset:0, animation:"heroZoom 5.5s linear forwards", transformOrigin:"center center" }}>

            {/* SLIDE 0 — Dos personas en videollamada (europeo + asiática, luz cálida) */}
            {heroSlide === 0 && (
              <svg viewBox="0 0 1400 820" preserveAspectRatio="xMidYMid slice" style={{ width:"100%", height:"100%", display:"block" }}>
                <defs>
                  <radialGradient id="s0bg" cx="50%" cy="35%" r="80%"><stop offset="0%" stopColor="#0d1530"/><stop offset="100%" stopColor="#030810"/></radialGradient>
                  <radialGradient id="s0wa" cx="0%" cy="55%" r="65%"><stop offset="0%" stopColor="#e07828" stopOpacity=".3"/><stop offset="100%" stopColor="transparent" stopOpacity="0"/></radialGradient>
                  <radialGradient id="s0cb" cx="100%" cy="52%" r="65%"><stop offset="0%" stopColor="#00b4d8" stopOpacity=".22"/><stop offset="100%" stopColor="transparent" stopOpacity="0"/></radialGradient>
                  <radialGradient id="s0ct" cx="50%" cy="50%" r="28%"><stop offset="0%" stopColor="#4844a8" stopOpacity=".14"/><stop offset="100%" stopColor="transparent" stopOpacity="0"/></radialGradient>
                  <radialGradient id="s0f1" cx="50%" cy="36%" r="66%"><stop offset="0%" stopColor="#e8c49a"/><stop offset="55%" stopColor="#c89060" stopOpacity=".7"/><stop offset="100%" stopColor="transparent" stopOpacity="0"/></radialGradient>
                  <radialGradient id="s0h1" cx="50%" cy="10%" r="62%"><stop offset="0%" stopColor="#1c1008" stopOpacity=".96"/><stop offset="100%" stopColor="transparent" stopOpacity="0"/></radialGradient>
                  <radialGradient id="s0f2" cx="50%" cy="40%" r="63%"><stop offset="0%" stopColor="#f0d0b8"/><stop offset="52%" stopColor="#dba888" stopOpacity=".72"/><stop offset="100%" stopColor="transparent" stopOpacity="0"/></radialGradient>
                  <radialGradient id="s0h2" cx="50%" cy="8%"  r="66%"><stop offset="0%" stopColor="#090606" stopOpacity=".98"/><stop offset="100%" stopColor="transparent" stopOpacity="0"/></radialGradient>
                  <filter id="s0bk"><feGaussianBlur stdDeviation="24"/></filter>
                  <filter id="s0sf"><feGaussianBlur stdDeviation="10"/></filter>
                </defs>
                <rect width="100%" height="100%" fill="url(#s0bg)"/>
                <ellipse cx="0%"   cy="55%" rx="55%" ry="75%" fill="url(#s0wa)"/>
                <ellipse cx="100%" cy="52%" rx="55%" ry="75%" fill="url(#s0cb)"/>
                <ellipse cx="50%"  cy="50%" rx="28%" ry="55%" fill="url(#s0ct)"/>
                {/* bokeh accent lights */}
                <circle cx="7%"  cy="18%" r="72" fill="rgba(255,140,60,.16)"  filter="url(#s0bk)"/>
                <circle cx="11%" cy="82%" r="52" fill="rgba(255,110,40,.12)"  filter="url(#s0bk)"/>
                <circle cx="93%" cy="16%" r="68" fill="rgba(0,200,230,.15)"   filter="url(#s0bk)"/>
                <circle cx="89%" cy="84%" r="46" fill="rgba(0,170,200,.11)"   filter="url(#s0bk)"/>
                <circle cx="50%" cy="2%"  r="95" fill="rgba(80,60,180,.09)"   filter="url(#s0bk)"/>
                {/* tile frames */}
                <rect x="4%"  y="10%" width="44%" height="80%" rx="20" fill="rgba(255,255,255,.018)" stroke="rgba(255,255,255,.065)" strokeWidth="1"/>
                <rect x="52%" y="10%" width="44%" height="80%" rx="20" fill="rgba(255,255,255,.018)" stroke="rgba(255,255,255,.065)" strokeWidth="1"/>
                {/* Person 1 — European male */}
                <ellipse cx="26%" cy="88%" rx="22%" ry="15%" fill="rgba(22,15,8,.86)"   filter="url(#s0sf)"/>
                <ellipse cx="26%" cy="74%" rx="7%"  ry="8%"  fill="rgba(195,150,90,.55)" filter="url(#s0sf)"/>
                <ellipse cx="26%" cy="50%" rx="14%" ry="19%" fill="url(#s0f1)"          filter="url(#s0sf)"/>
                <ellipse cx="26%" cy="27%" rx="17%" ry="17%" fill="url(#s0h1)"          filter="url(#s0sf)"/>
                <ellipse cx="26%" cy="50%" rx="26%" ry="30%" fill="rgba(255,150,80,.07)" filter="url(#s0bk)"/>
                {/* Person 2 — Asian female */}
                <ellipse cx="74%" cy="88%" rx="19%" ry="15%" fill="rgba(18,10,16,.86)"   filter="url(#s0sf)"/>
                <ellipse cx="74%" cy="73%" rx="6.5%" ry="7.5%" fill="rgba(215,170,120,.5)" filter="url(#s0sf)"/>
                <ellipse cx="74%" cy="48%" rx="13%" ry="18%" fill="url(#s0f2)"          filter="url(#s0sf)"/>
                <ellipse cx="74%" cy="24%" rx="16%" ry="21%" fill="url(#s0h2)"          filter="url(#s0sf)"/>
                {/* side hair */}
                <ellipse cx="68%" cy="55%" rx="5%" ry="23%" fill="rgba(5,3,3,.86)"      filter="url(#s0sf)"/>
                <ellipse cx="80%" cy="55%" rx="5%" ry="23%" fill="rgba(5,3,3,.86)"      filter="url(#s0sf)"/>
                <ellipse cx="74%" cy="48%" rx="24%" ry="28%" fill="rgba(0,180,230,.07)" filter="url(#s0bk)"/>
                {/* center divider glow */}
                <line x1="50%" y1="0%" x2="50%" y2="100%" stroke="rgba(255,255,255,.03)" strokeWidth="1"/>
              </svg>
            )}

            {/* SLIDE 1 — Mujer en aeropuerto moderno (luz dorada + azul noche) */}
            {heroSlide === 1 && (
              <svg viewBox="0 0 1400 820" preserveAspectRatio="xMidYMid slice" style={{ width:"100%", height:"100%", display:"block" }}>
                <defs>
                  <linearGradient id="s1bg" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#05102a"/><stop offset="100%" stopColor="#020a14"/></linearGradient>
                  <radialGradient id="s1su" cx="78%" cy="0%" r="70%"><stop offset="0%" stopColor="#ff9a20" stopOpacity=".32"/><stop offset="40%" stopColor="#ff5a30" stopOpacity=".14"/><stop offset="100%" stopColor="transparent" stopOpacity="0"/></radialGradient>
                  <radialGradient id="s1sk" cx="50%" cy="0%" r="68%"><stop offset="0%" stopColor="#0a2050" stopOpacity=".9"/><stop offset="100%" stopColor="transparent" stopOpacity="0"/></radialGradient>
                  <radialGradient id="s1fl" cx="50%" cy="100%" r="55%"><stop offset="0%" stopColor="#102040" stopOpacity=".55"/><stop offset="100%" stopColor="transparent" stopOpacity="0"/></radialGradient>
                  <radialGradient id="s1fc" cx="50%" cy="40%" r="65%"><stop offset="0%" stopColor="#ecd0b0"/><stop offset="55%" stopColor="#d4a880" stopOpacity=".75"/><stop offset="100%" stopColor="transparent" stopOpacity="0"/></radialGradient>
                  <radialGradient id="s1hr" cx="50%" cy="15%" r="60%"><stop offset="0%" stopColor="#0a0806" stopOpacity=".96"/><stop offset="100%" stopColor="transparent" stopOpacity="0"/></radialGradient>
                  <filter id="s1bk"><feGaussianBlur stdDeviation="22"/></filter>
                  <filter id="s1sf"><feGaussianBlur stdDeviation="10"/></filter>
                </defs>
                <rect width="100%" height="100%" fill="url(#s1bg)"/>
                <ellipse cx="50%" cy="0%"   rx="90%" ry="62%" fill="url(#s1sk)"/>
                <ellipse cx="78%" cy="0%"   rx="65%" ry="72%" fill="url(#s1su)"/>
                <ellipse cx="50%" cy="100%" rx="80%" ry="38%" fill="url(#s1fl)"/>
                {/* terminal perspective lines */}
                {[0,14,28,50,72,86,100].map((x,i) => (
                  <line key={i} x1={`${x}%`} y1="0%" x2="50%" y2="58%" stroke="rgba(255,255,255,.022)" strokeWidth="1.5"/>
                ))}
                <line x1="0%" y1="24%" x2="100%" y2="24%" stroke="rgba(255,255,255,.022)" strokeWidth="1"/>
                <line x1="0%" y1="40%" x2="100%" y2="40%" stroke="rgba(255,255,255,.016)" strokeWidth=".8"/>
                {/* bokeh lights */}
                <circle cx="9%"  cy="42%" r="56"  fill="rgba(255,160,50,.18)"  filter="url(#s1bk)"/>
                <circle cx="91%" cy="38%" r="48"  fill="rgba(100,180,255,.15)" filter="url(#s1bk)"/>
                <circle cx="79%" cy="66%" r="38"  fill="rgba(255,200,60,.12)"  filter="url(#s1bk)"/>
                <circle cx="4%"  cy="70%" r="52"  fill="rgba(80,150,255,.1)"   filter="url(#s1bk)"/>
                <circle cx="96%" cy="74%" r="42"  fill="rgba(255,130,50,.12)"  filter="url(#s1bk)"/>
                <circle cx="40%" cy="88%" r="72"  fill="rgba(60,100,200,.07)"  filter="url(#s1bk)"/>
                {/* gate pillars */}
                <rect x="12%" y="60%" width="2.5%" height="40%" fill="rgba(200,220,255,.024)"/>
                <rect x="85%" y="60%" width="2.5%" height="40%" fill="rgba(200,220,255,.024)"/>
                <rect x="30%" y="64%" width="1.5%" height="36%" fill="rgba(200,220,255,.016)"/>
                <rect x="68%" y="64%" width="1.5%" height="36%" fill="rgba(200,220,255,.016)"/>
                {/* departure board */}
                <rect x="8%" y="10%" width="84%" height="18%" rx="4" fill="rgba(8,20,50,.58)" filter="url(#s1sf)"/>
                <rect x="12%" y="13.5%" width="18%" height="2%"   rx="1" fill="rgba(255,255,255,.07)"/>
                <rect x="33%" y="13.5%" width="28%" height="2%"   rx="1" fill="rgba(255,255,255,.055)"/>
                <rect x="64%" y="13.5%" width="20%" height="2%"   rx="1" fill="rgba(0,200,220,.09)"/>
                <rect x="12%" y="18.5%" width="22%" height="1.5%" rx="1" fill="rgba(255,255,255,.04)"/>
                <rect x="38%" y="18.5%" width="18%" height="1.5%" rx="1" fill="rgba(255,255,255,.035)"/>
                {/* woman figure */}
                <ellipse cx="50%" cy="86%" rx="8%"   ry="18%" fill="rgba(7,12,22,.92)"     filter="url(#s1sf)"/>
                <ellipse cx="50%" cy="66%" rx="4.5%" ry="6%"  fill="rgba(215,170,120,.52)" filter="url(#s1sf)"/>
                <ellipse cx="50%" cy="50%" rx="8.5%" ry="12%" fill="url(#s1fc)"            filter="url(#s1sf)"/>
                <ellipse cx="50%" cy="36%" rx="9.5%" ry="11%" fill="url(#s1hr)"            filter="url(#s1sf)"/>
                <ellipse cx="44%" cy="53%" rx="4%"   ry="17%" fill="rgba(8,5,3,.9)"        filter="url(#s1sf)"/>
                <ellipse cx="56%" cy="53%" rx="4%"   ry="17%" fill="rgba(8,5,3,.9)"        filter="url(#s1sf)"/>
                {/* phone glow */}
                <rect x="51.5%" y="61%" width="3.5%" height="6.5%" rx="1.5" fill="rgba(160,220,255,.68)" filter="url(#s1sf)"/>
                <rect x="51.5%" y="61%" width="3.5%" height="6.5%" rx="1.5" fill="rgba(0,200,240,.28)"   filter="url(#s1bk)"/>
                <ellipse cx="52%" cy="54%" rx="8%" ry="8%" fill="rgba(0,200,240,.14)"   filter="url(#s1bk)"/>
                <ellipse cx="50%" cy="100%" rx="22%" ry="10%" fill="rgba(200,200,255,.04)" filter="url(#s1bk)"/>
              </svg>
            )}

            {/* SLIDE 2 — Equipo internacional en videollamada profesional */}
            {heroSlide === 2 && (
              <svg viewBox="0 0 1400 820" preserveAspectRatio="xMidYMid slice" style={{ width:"100%", height:"100%", display:"block" }}>
                <defs>
                  <radialGradient id="s2bg" cx="50%" cy="50%" r="78%"><stop offset="0%" stopColor="#081428"/><stop offset="100%" stopColor="#030a10"/></radialGradient>
                  <radialGradient id="s2cg" cx="50%" cy="50%" r="48%"><stop offset="0%" stopColor="#1a3060" stopOpacity=".48"/><stop offset="100%" stopColor="transparent" stopOpacity="0"/></radialGradient>
                  <radialGradient id="s2f1" cx="50%" cy="36%" r="64%"><stop offset="0%" stopColor="#e0c4a0"/><stop offset="56%" stopColor="#c89870" stopOpacity=".72"/><stop offset="100%" stopColor="transparent" stopOpacity="0"/></radialGradient>
                  <radialGradient id="s2h1" cx="50%" cy="8%"  r="66%"><stop offset="0%" stopColor="#181008" stopOpacity=".95"/><stop offset="100%" stopColor="transparent" stopOpacity="0"/></radialGradient>
                  <radialGradient id="s2f2" cx="50%" cy="38%" r="62%"><stop offset="0%" stopColor="#c89878"/><stop offset="52%" stopColor="#a87050" stopOpacity=".7"/><stop offset="100%" stopColor="transparent" stopOpacity="0"/></radialGradient>
                  <radialGradient id="s2h2" cx="50%" cy="5%"  r="70%"><stop offset="0%" stopColor="#060404" stopOpacity=".98"/><stop offset="100%" stopColor="transparent" stopOpacity="0"/></radialGradient>
                  <radialGradient id="s2f3" cx="50%" cy="38%" r="62%"><stop offset="0%" stopColor="#f0d4bc"/><stop offset="52%" stopColor="#d8b090" stopOpacity=".68"/><stop offset="100%" stopColor="transparent" stopOpacity="0"/></radialGradient>
                  <radialGradient id="s2h3" cx="50%" cy="8%"  r="64%"><stop offset="0%" stopColor="#281808" stopOpacity=".9"/><stop offset="100%" stopColor="transparent" stopOpacity="0"/></radialGradient>
                  <radialGradient id="s2f4" cx="50%" cy="36%" r="64%"><stop offset="0%" stopColor="#d4a888"/><stop offset="56%" stopColor="#b88060" stopOpacity=".7"/><stop offset="100%" stopColor="transparent" stopOpacity="0"/></radialGradient>
                  <radialGradient id="s2h4" cx="50%" cy="6%"  r="66%"><stop offset="0%" stopColor="#0e0e0e" stopOpacity=".95"/><stop offset="100%" stopColor="transparent" stopOpacity="0"/></radialGradient>
                  <filter id="s2bk"><feGaussianBlur stdDeviation="20"/></filter>
                  <filter id="s2sf"><feGaussianBlur stdDeviation="8"/></filter>
                </defs>
                <rect width="100%" height="100%" fill="url(#s2bg)"/>
                <ellipse cx="50%" cy="50%" rx="68%" ry="68%" fill="url(#s2cg)"/>
                <circle cx="50%" cy="50%" r="220" fill="rgba(0,120,200,.05)"   filter="url(#s2bk)"/>
                <circle cx="14%" cy="24%" r="84"  fill="rgba(255,160,80,.1)"   filter="url(#s2bk)"/>
                <circle cx="86%" cy="22%" r="74"  fill="rgba(0,180,220,.1)"    filter="url(#s2bk)"/>
                <circle cx="16%" cy="76%" r="68"  fill="rgba(100,200,100,.08)" filter="url(#s2bk)"/>
                <circle cx="84%" cy="78%" r="78"  fill="rgba(180,100,255,.08)" filter="url(#s2bk)"/>
                {/* 4 tile frames */}
                <rect x="3%"  y="5%"  width="46%" height="43%" rx="16" fill="rgba(255,255,255,.022)" stroke="rgba(255,255,255,.07)" strokeWidth="1"/>
                <rect x="51%" y="5%"  width="46%" height="43%" rx="16" fill="rgba(255,255,255,.022)" stroke="rgba(255,255,255,.07)" strokeWidth="1"/>
                <rect x="3%"  y="52%" width="46%" height="43%" rx="16" fill="rgba(255,255,255,.022)" stroke="rgba(255,255,255,.07)" strokeWidth="1"/>
                <rect x="51%" y="52%" width="46%" height="43%" rx="16" fill="rgba(255,255,255,.022)" stroke="rgba(255,255,255,.07)" strokeWidth="1"/>
                {/* Tile 1 — top-left */}
                <ellipse cx="26%" cy="42%" rx="20%" ry="14%" fill="rgba(18,12,6,.9)"     filter="url(#s2sf)"/>
                <ellipse cx="26%" cy="32%" rx="6%"  ry="6.5%" fill="rgba(195,150,90,.5)" filter="url(#s2sf)"/>
                <ellipse cx="26%" cy="22%" rx="11%" ry="14%" fill="url(#s2f1)"           filter="url(#s2sf)"/>
                <ellipse cx="26%" cy="10%" rx="14%" ry="13%" fill="url(#s2h1)"           filter="url(#s2sf)"/>
                <ellipse cx="26%" cy="22%" rx="20%" ry="22%" fill="rgba(255,140,60,.06)" filter="url(#s2bk)"/>
                {/* Tile 2 — top-right */}
                <ellipse cx="74%" cy="42%" rx="19%" ry="14%" fill="rgba(12,8,10,.9)"     filter="url(#s2sf)"/>
                <ellipse cx="74%" cy="31%" rx="5.5%" ry="6%" fill="rgba(180,130,80,.5)"  filter="url(#s2sf)"/>
                <ellipse cx="74%" cy="21%" rx="10%" ry="13%" fill="url(#s2f2)"           filter="url(#s2sf)"/>
                <ellipse cx="74%" cy="9%"  rx="13%" ry="15%" fill="url(#s2h2)"           filter="url(#s2sf)"/>
                <ellipse cx="74%" cy="21%" rx="19%" ry="21%" fill="rgba(0,180,220,.06)"  filter="url(#s2bk)"/>
                {/* Tile 3 — bottom-left */}
                <ellipse cx="26%" cy="90%" rx="20%" ry="14%" fill="rgba(16,10,6,.9)"     filter="url(#s2sf)"/>
                <ellipse cx="26%" cy="80%" rx="5.5%" ry="6.5%" fill="rgba(205,165,120,.5)" filter="url(#s2sf)"/>
                <ellipse cx="26%" cy="70%" rx="11%" ry="14%" fill="url(#s2f3)"           filter="url(#s2sf)"/>
                <ellipse cx="26%" cy="58%" rx="13%" ry="12%" fill="url(#s2h3)"           filter="url(#s2sf)"/>
                <ellipse cx="26%" cy="70%" rx="20%" ry="22%" fill="rgba(100,200,100,.05)" filter="url(#s2bk)"/>
                {/* Tile 4 — bottom-right */}
                <ellipse cx="74%" cy="90%" rx="19%" ry="14%" fill="rgba(10,8,6,.9)"      filter="url(#s2sf)"/>
                <ellipse cx="74%" cy="79%" rx="5%"  ry="6%"  fill="rgba(190,145,100,.5)" filter="url(#s2sf)"/>
                <ellipse cx="74%" cy="69%" rx="10.5%" ry="13.5%" fill="url(#s2f4)"       filter="url(#s2sf)"/>
                <ellipse cx="74%" cy="57%" rx="14%" ry="14%" fill="url(#s2h4)"           filter="url(#s2sf)"/>
                <ellipse cx="74%" cy="69%" rx="19%" ry="22%" fill="rgba(180,100,255,.05)" filter="url(#s2bk)"/>
              </svg>
            )}
          </div>

          {/* ── Cinematic overlays ── */}
          {/* top vignette for nav */}
          <div style={{ position:"absolute", inset:0, zIndex:1, background:"linear-gradient(to bottom, rgba(2,3,10,.6) 0%, transparent 20%)", pointerEvents:"none" }}/>
          {/* base darkness + bottom gradient for text */}
          <div style={{ position:"absolute", inset:0, zIndex:1, background:"linear-gradient(to bottom, rgba(2,3,10,.18) 0%, rgba(2,3,10,.12) 40%, rgba(2,3,10,.55) 65%, rgba(2,3,10,.92) 100%)", pointerEvents:"none" }}/>

          {/* ── Content (fades with heroOpacity) ── */}
          <div style={{
            position: "relative", zIndex:2, flex:1,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: "80px 24px 96px",
            transition: "opacity .65s ease",
            opacity: heroOpacity,
          }}>

            {/* Headline */}
            <h1 style={{ fontSize:"clamp(52px, 8.5vw, 90px)", fontWeight:900, lineHeight:1.04, letterSpacing:"-.045em", textAlign:"center", marginBottom:18 }}>
              <span style={{ display:"block", color:"rgba(255,255,255,.92)" }}>{slide.headline[0]}</span>
              <span style={{ display:"block", background:`linear-gradient(130deg, ${CY} 0%, #ffffff 48%, ${CO} 100%)`, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text" }}>
                {slide.headline[1]}
              </span>
            </h1>

            {/* Subtext */}
            <p style={{ fontSize:"clamp(16px, 2vw, 20px)", color:"rgba(255,255,255,.6)", textAlign:"center", lineHeight:1.68, marginBottom:40, maxWidth:520, fontWeight:400 }}>
              {slide.sub}
            </p>

            {/* CTA buttons */}
            <div style={{ display:"flex", gap:14, flexWrap:"wrap", justifyContent:"center", marginBottom:52 }}>
              {slide.ctas.map(cta => (
                <button key={cta.label} onClick={() => handleCta(cta.id)}
                  className={cta.primary ? "pbtn-g" : "sbtn"}
                  style={cta.primary ? {
                    padding: "15px 34px",
                    background: `linear-gradient(135deg, ${CY} 0%, #a78bfa 52%, ${CO} 100%)`,
                    border: "none", borderRadius: 14, color: "#fff",
                    fontSize: 16, fontWeight: 700, cursor: "pointer",
                    outline: "none", WebkitTapHighlightColor: "transparent",
                    letterSpacing: "-.01em",
                    boxShadow: "0 4px 24px rgba(0,212,255,.22)",
                  } : {
                    padding: "15px 32px",
                    background: "rgba(255,255,255,.1)",
                    border: "1px solid rgba(255,255,255,.2)",
                    borderRadius: 14, color: "rgba(255,255,255,.88)",
                    fontSize: 16, fontWeight: 600, cursor: "pointer",
                    outline: "none", WebkitTapHighlightColor: "transparent",
                    backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
                    letterSpacing: "-.01em",
                  }}>
                  {cta.label}
                </button>
              ))}
            </div>

            {/* Slide dots */}
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              {[0,1,2].map(i => (
                <button key={i} className="hdot" onClick={() => goSlide(i)} style={{
                  width:  i === heroSlide ? 28 : 8,
                  height: 8,
                  borderRadius: 4,
                  background: i === heroSlide ? CY : "rgba(255,255,255,.28)",
                  boxShadow: i === heroSlide ? `0 0 12px rgba(0,212,255,.7)` : "none",
                }}/>
              ))}
            </div>
          </div>

          {/* scroll indicator */}
          <div style={{ position:"absolute", bottom:22, left:"50%", animation:"bob 2.6s ease-in-out infinite", display:"flex", flexDirection:"column", alignItems:"center", gap:5, opacity:.2, zIndex:3, pointerEvents:"none" }}>
            <span style={{ fontSize:10, letterSpacing:".1em", textTransform:"uppercase" }}>Descubrir</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════
            SECCIÓN 2 — Pruébalo en vivo (sin cambios)
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
            SECCIÓN 3 — 5 Features (sin cambios)
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
            SECCIÓN 4 — Llévalo contigo (sin cambios)
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
            SECCIÓN 5 — Privacy banner (sin cambios)
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
