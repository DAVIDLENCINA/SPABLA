"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

const CY = "#3ec6c6";
const CO = "#e8524a";
const BG = "#0d1117";

const slides = [
  { img: "/hero1.jpg", title: "Habla con el mundo.", sub: "Videollamadas con traducción de voz en tiempo real." },
  { img: "/hero2.jpg", title: "Entiende cualquier idioma.", sub: "Comunícate al instante en cualquier país." },
  { img: "/hero3.jpg", title: "Tu voz sin fronteras.", sub: "Reuniones globales con traducción instantánea." },
];

const features = [
  {
    title: "Traducción en tiempo real",
    desc: "Cada frase, al instante.",
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={CY} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>,
  },
  {
    title: "Voz cristalina",
    desc: "Síntesis de voz con IA.",
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={CY} strokeWidth="1.7" strokeLinecap="round"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0014 0M12 19v3M9 22h6"/></svg>,
  },
  {
    title: "Privado y seguro",
    desc: "Sin grabaciones, nunca.",
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={CY} strokeWidth="1.7" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  },
  {
    title: "Baja latencia",
    desc: "Menos de 500 ms.",
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={CY} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  },
  {
    title: "Todos tus dispositivos",
    desc: "Web, iOS y Android.",
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={CY} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><rect x="2" y="7" width="6" height="11" rx="1"/><rect x="16" y="7" width="6" height="11" rx="1"/></svg>,
  },
];

export default function Home() {
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setCurrent(c => (c + 1) % slides.length), 5000);
    return () => clearInterval(t);
  }, []);

  function startCall() {
    const id = Math.random().toString(36).substring(2, 8);
    router.push(`/call/${id}?mode=video`);
  }

  function scrollTo(anchor: string) {
    document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { background: ${BG}; font-family: -apple-system, 'Helvetica Neue', sans-serif; -webkit-font-smoothing: antialiased; overflow-x: hidden; color: #fff; }
        .nav-link { font-size: 14px; font-weight: 500; color: rgba(255,255,255,.55); cursor: pointer; background: none; border: none; padding: 0; transition: color .18s; white-space: nowrap; font-family: inherit; }
        .nav-link:hover { color: rgba(255,255,255,.92); }
        .btn-p { background: linear-gradient(135deg, ${CY}, ${CO}); border: none; border-radius: 10px; color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; padding: 13px 28px; letter-spacing: -.01em; transition: opacity .18s, transform .18s; font-family: inherit; }
        .btn-p:hover { opacity: .85; transform: translateY(-1px); }
        .btn-s { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.15); border-radius: 10px; color: rgba(255,255,255,.85); font-size: 15px; font-weight: 600; cursor: pointer; padding: 13px 28px; letter-spacing: -.01em; backdrop-filter: blur(10px); transition: background .18s, border-color .18s; font-family: inherit; }
        .btn-s:hover { background: rgba(255,255,255,.13); border-color: rgba(255,255,255,.25); }
        .dot { border: none; cursor: pointer; padding: 0; height: 8px; border-radius: 4px; background: rgba(255,255,255,.35); transition: all .35s ease; }
        .dot:hover { background: rgba(255,255,255,.65); }
        .fc { background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.07); border-radius: 16px; padding: 28px 20px; text-align: center; flex: 1 1 160px; max-width: 200px; transition: background .2s, transform .2s; }
        .fc:hover { background: rgba(255,255,255,.06); transform: translateY(-3px); }
        .sbtn { display: flex; align-items: center; gap: 12px; padding: 13px 20px; border-radius: 12px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.05); transition: background .18s; width: 220px; font-family: inherit; }
        .sbtn:hover { background: rgba(255,255,255,.1); }
        .sbtn.on { background: ${CY}; border-color: transparent; cursor: pointer; }
        .sbtn.on:hover { opacity: .88; }
      `}</style>

      {/* NAV */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        background: scrolled ? "rgba(13,17,23,.9)" : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(20px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(255,255,255,.07)" : "1px solid transparent",
        transition: "background .3s, border-color .3s",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 40px", height: 60, display: "flex", alignItems: "center", gap: 32 }}>
          <img src="/SPABLA_LOGO.png" alt="SPABLA" style={{ height: 24, flexShrink: 0 }} />
          <div style={{ display: "flex", gap: 24, flex: 1 }}>
            {(["Funciones", "Seguridad", "Descargar"] as const).map((label, i) => {
              const anchors = ["features", "privacy", "descarga"];
              return <button key={label} className="nav-link" onClick={() => scrollTo(anchors[i])}>{label}</button>;
            })}
          </div>
          <button className="btn-p" onClick={startCall} style={{ padding: "8px 20px", fontSize: 13.5 }}>Iniciar llamada</button>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>

        {/* CAPA 1 — imágenes con crossfade */}
        {slides.map((s, i) => (
          <img
            key={i}
            src={s.img}
            alt=""
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%",
              objectFit: "cover", objectPosition: "center",
              opacity: i === current ? 1 : 0,
              transition: "opacity 1s ease",
              zIndex: 0,
            }}
          />
        ))}

        {/* Overlay fijo */}
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1, pointerEvents: "none" }} />

        {/* CAPA 2 — texto único, React lo reemplaza al instante sin overlap */}
        <div
          key={current}
          style={{
            position: "absolute", inset: 0, zIndex: 2,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "80px 24px",
          }}
        >
          <h1 style={{
            fontSize: "clamp(44px, 8vw, 88px)",
            fontWeight: 800, lineHeight: 1.05,
            letterSpacing: "-.04em", textAlign: "center",
            color: "#fff", marginBottom: 20,
            textShadow: "0 2px 32px rgba(0,0,0,.5)",
          }}>
            {slides[current].title}
          </h1>
          <p style={{
            fontSize: "clamp(16px, 2vw, 20px)",
            color: "rgba(255,255,255,.72)",
            textAlign: "center", lineHeight: 1.65,
            maxWidth: 520, fontWeight: 400,
          }}>
            {slides[current].sub}
          </p>
        </div>

        {/* Dots */}
        <div style={{ position: "absolute", bottom: 36, left: "50%", transform: "translateX(-50%)", zIndex: 3, display: "flex", gap: 8 }}>
          {slides.map((_, i) => (
            <button
              key={i}
              className="dot"
              onClick={() => setCurrent(i)}
              style={{
                width: i === current ? 28 : 8,
                background: i === current ? CY : undefined,
                boxShadow: i === current ? `0 0 12px rgba(62,198,198,.6)` : "none",
              }}
            />
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: BG, padding: "96px 40px", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, letterSpacing: "-.04em", marginBottom: 18, lineHeight: 1.12 }}>
            Traducción instantánea,<br />en cualquier idioma.
          </h2>
          <p style={{ fontSize: 17, color: "rgba(255,255,255,.42)", lineHeight: 1.7, marginBottom: 44 }}>
            Sin barreras. Sin instalación. Solo conexión.
          </p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", marginBottom: 32 }}>
            <button className="btn-p" onClick={startCall}>Iniciar llamada</button>
            <button className="btn-s" onClick={() => scrollTo("descarga")}>Descargar app</button>
          </div>
          <p id="privacy" style={{ fontSize: 13, color: "rgba(255,255,255,.22)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            No almacenamos tu voz. Sin grabaciones.
          </p>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" style={{ padding: "80px 40px", background: BG, borderBottom: "1px solid rgba(255,255,255,.05)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".15em", color: "rgba(255,255,255,.25)", textTransform: "uppercase", textAlign: "center", marginBottom: 12 }}>Por qué SPABLA</p>
          <h2 style={{ fontSize: "clamp(24px, 3.5vw, 38px)", fontWeight: 800, letterSpacing: "-.035em", textAlign: "center", marginBottom: 52 }}>Todo lo que necesitas.</h2>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            {features.map(f => (
              <div key={f.title} className="fc">
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>{f.icon}</div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 6, letterSpacing: "-.01em", lineHeight: 1.35 }}>{f.title}</p>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,.35)", lineHeight: 1.5 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MOBILE */}
      <section id="descarga" style={{ padding: "96px 40px", background: "rgba(255,255,255,.015)", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
        <div style={{ maxWidth: 440, margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".15em", color: "rgba(255,255,255,.25)", textTransform: "uppercase", marginBottom: 12 }}>App móvil</p>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 46px)", fontWeight: 800, letterSpacing: "-.04em", marginBottom: 16, lineHeight: 1.1 }}>Llévalo contigo.</h2>
          <p style={{ fontSize: 16, color: "rgba(255,255,255,.38)", lineHeight: 1.7, marginBottom: 44 }}>
            La misma experiencia en tu móvil, tablet o escritorio. Sin instalar nada si no quieres.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
            {[
              {
                label: "App Store", sub: "Próximamente", active: false,
                icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>,
              },
              {
                label: "Google Play", sub: "Próximamente", active: false,
                icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M3.18 23.76c.27.15.59.19.94.08l11.7-6.74-2.51-2.52-10.13 9.18zM20.4 10.55l-2.56-1.49-2.84 2.57 2.84 2.7 2.59-1.5c.74-.43.74-1.85-.03-2.28zM2.29.29C2.1.52 2 .86 2 1.29v21.42c0 .43.11.77.3 1l.09.07 12-11.88v-.28L2.29.29zM14.32 8.21L3.18.25l-.04-.02 10.17 9.24 1.01-.96-.93-.3z"/></svg>,
              },
              {
                label: "Usar en la Web", sub: "Gratis · Sin instalar nada", active: true,
                icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>,
              },
            ].map(b => (
              <button
                key={b.label}
                className={`sbtn${b.active ? " on" : ""}`}
                onClick={b.active ? startCall : undefined}
                style={{ opacity: b.active ? 1 : 0.45, cursor: b.active ? "pointer" : "default" }}
              >
                <span style={{ flexShrink: 0, display: "flex", color: b.active ? "#000" : "white" }}>{b.icon}</span>
                <span style={{ textAlign: "left" }}>
                  <span style={{ display: "block", fontSize: 10, color: b.active ? "rgba(0,0,0,.5)" : "rgba(255,255,255,.38)", marginBottom: 1 }}>{b.sub}</span>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: b.active ? "#000" : "rgba(255,255,255,.75)" }}>{b.label}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: "28px 40px", borderTop: "1px solid rgba(255,255,255,.05)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <img src="/SPABLA_LOGO.png" alt="SPABLA" style={{ height: 18, opacity: 0.35 }} />
          <p style={{ fontSize: 12, color: "rgba(255,255,255,.18)" }}>© 2025 SPABLA · Traducción en tiempo real</p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,.18)" }}>Hecho para conectar personas</p>
        </div>
      </footer>
    </>
  );
}
