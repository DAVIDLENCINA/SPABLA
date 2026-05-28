"use client";
import { useState, useEffect } from "react";

export default function Home() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const startCall = () => {
    const id = Math.random().toString(36).slice(2, 8).toUpperCase();
    window.location.href = `/call/${id}`;
  };

  return (
    <div style={{ background: "#0d1117", minHeight: "100vh", color: "#fff", fontFamily: "Inter, sans-serif" }}>

      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 40px", background: scrolled ? "rgba(2,3,10,0.92)" : "transparent", backdropFilter: scrolled ? "blur(20px)" : "none", transition: "all 0.3s" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/SPABLA_LOGO.png" alt="SPABLA" style={{ height: 32 }} />
        </div>
        <div style={{ display: "flex", gap: 32 }}>
          {["Funciones","Seguridad","Precios","Descargar"].map(l => (
            <a key={l} href="#" style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, textDecoration: "none" }}>{l}</a>
          ))}
        </div>
        <button onClick={startCall} style={{ background: "linear-gradient(135deg,#3ec6c6,#e8524a)", border: "none", borderRadius: 10, padding: "9px 22px", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          Iniciar llamada
        </button>
      </nav>

      <div style={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden" }}>
        <img src="/hero1.jpg" alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(0,0,0,0.75) 40%, rgba(0,0,0,0.2))" }} />
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 8vw", maxWidth: 680 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(62,198,198,0.15)", border: "1px solid rgba(62,198,198,0.3)", borderRadius: 20, padding: "6px 14px", marginBottom: 28, width: "fit-content" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#3ec6c6" }} />
            <span style={{ color: "#3ec6c6", fontSize: 12, fontWeight: 500, letterSpacing: "0.08em" }}>TRADUCCIÓN EN TIEMPO REAL</span>
          </div>
          <h1 style={{ fontSize: "clamp(48px,6vw,82px)", fontWeight: 800, lineHeight: 1.05, margin: "0 0 20px", letterSpacing: "-0.02em" }}>
            Habla con<br />
            <span style={{ color: "#3ec6c6" }}>el mundo</span><span style={{ color: "#e8524a" }}>.</span>
          </h1>
          <p style={{ fontSize: "clamp(16px,2vw,20px)", color: "rgba(255,255,255,0.7)", margin: "0 0 36px", lineHeight: 1.65, maxWidth: 460 }}>
            Videollamadas y llamadas con traducción de voz y subtítulos en tiempo real. Sin barreras. Sin límites.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button onClick={startCall} style={{ background: "linear-gradient(135deg,#3ec6c6,#e8524a)", border: "none", borderRadius: 12, padding: "14px 30px", color: "#fff", fontSize: 16, fontWeight: 600, cursor: "pointer" }}>
              Iniciar llamada
            </button>
            <button style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, padding: "14px 26px", color: "#fff", fontSize: 16, cursor: "pointer" }}>
              Descargar app
            </button>
          </div>
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, marginTop: 20 }}>🔒 Sin registro. Sin compartir datos. 100% privado.</p>
        </div>
      </div>

      <section style={{ padding: "80px 8vw", background: "#0d1117" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <p style={{ color: "#3ec6c6", fontSize: 11, letterSpacing: "0.15em", marginBottom: 14 }}>FUNCIONES</p>
          <h2 style={{ fontSize: "clamp(28px,4vw,48px)", fontWeight: 700, margin: 0 }}>Todo lo que necesitas</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16, maxWidth: 1100, margin: "0 auto" }}>
          {[
            { icon: "⚡", title: "Traducción instantánea", desc: "Cada frase traducida en menos de 500ms. Sin retrasos." },
            { icon: "🎙️", title: "Voz natural", desc: "Síntesis con IA. Suena como una persona real, no un robot." },
            { icon: "🔒", title: "100% privado", desc: "No almacenamos tu voz. Cifrado de extremo a extremo." },
            { icon: "🌍", title: "10 idiomas", desc: "Español, inglés, francés, alemán, italiano y más." },
            { icon: "📱", title: "Todos tus dispositivos", desc: "Web, iOS y Android. Sin instalar nada si no quieres." },
            { icon: "🤝", title: "Sin registro", desc: "Empieza a llamar en segundos. Sin cuenta, sin datos." },
          ].map(f => (
            <div key={f.title} style={{ background: "#111820", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "24px 20px" }}>
              <div style={{ fontSize: 28, marginBottom: 14 }}>{f.icon}</div>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>{f.title}</div>
              <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: "80px 8vw", background: "#080c12" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center" }}>
          <div>
            <p style={{ color: "#e8524a", fontSize: 11, letterSpacing: "0.15em", marginBottom: 16 }}>APP MÓVIL</p>
            <h2 style={{ fontSize: "clamp(28px,4vw,48px)", fontWeight: 700, margin: "0 0 20px" }}>
              Llévalo<br /><span style={{ color: "#3ec6c6" }}>contigo</span><span style={{ color: "#e8524a" }}>.</span>
            </h2>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 16, lineHeight: 1.65, marginBottom: 36 }}>
              La misma experiencia en tu móvil, tablet o escritorio.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[{ icon: "🍎", label: "App Store", sub: "Próximamente" }, { icon: "▶️", label: "Google Play", sub: "Próximamente" }].map(b => (
                <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 14, background: "#111820", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "12px 18px", opacity: 0.5 }}>
                  <span style={{ fontSize: 20 }}>{b.icon}</span>
                  <div>
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>{b.sub}</div>
                    <div style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>{b.label}</div>
                  </div>
                </div>
              ))}
              <button onClick={startCall} style={{ display: "flex", alignItems: "center", gap: 14, background: "rgba(62,198,198,0.1)", border: "1px solid rgba(62,198,198,0.3)", borderRadius: 12, padding: "12px 18px", cursor: "pointer" }}>
                <span style={{ fontSize: 20 }}>🌐</span>
                <div style={{ textAlign: "left" }}>
                  <div style={{ color: "#3ec6c6", fontSize: 10 }}>Gratis · Sin instalar nada</div>
                  <div style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>Usar en la Web</div>
                </div>
              </button>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
            <div style={{ background: "linear-gradient(135deg,rgba(62,198,198,0.1),rgba(232,82,74,0.1))", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 24, padding: 48, textAlign: "center" }}>
              <div style={{ fontSize: 80 }}>📱</div>
              <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 14, marginTop: 16 }}>App móvil próximamente</p>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ borderTop: "1px solid rgba(255,255,255,0.07)", padding: "24px 8vw", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>© 2025 SPABLA · Traducción en tiempo real</span>
        <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 12 }}>Hecho para conectar personas</span>
      </footer>
    </div>
  );
}
