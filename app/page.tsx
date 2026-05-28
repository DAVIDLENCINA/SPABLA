"use client";
import { useState, useEffect } from "react";

const slides = [
  { img: "/hero1.jpg", title: "Habla con el mundo.", sub: "Videollamadas con traducción en tiempo real." },
  { img: "/hero2.jpg", title: "Entiende cualquier idioma.", sub: "Comunícate al instante en cualquier país." },
  { img: "/hero3.jpg", title: "Tu voz sin fronteras.", sub: "Reuniones globales con traducción instantánea." },
];

export default function Home() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setCurrent(c => (c + 1) % 3), 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ background: "#0d1117", minHeight: "100vh", color: "#fff", fontFamily: "Inter, sans-serif" }}>
      <div style={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden" }}>
        {slides.map((s, i) => (
          <div key={i} style={{ position: "absolute", inset: 0, opacity: i === current ? 1 : 0, transition: "opacity 1s ease", zIndex: i === current ? 1 : 0 }}>
            <img src={s.img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }} />
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 24px", zIndex: 2 }}>
              <h1 style={{ fontSize: "clamp(40px,7vw,90px)", fontWeight: 800, margin: "0 0 16px", color: "#fff" }}>{s.title}</h1>
              <p style={{ fontSize: "clamp(16px,2vw,22px)", color: "rgba(255,255,255,0.75)", margin: 0 }}>{s.sub}</p>
            </div>
          </div>
        ))}
        <div style={{ position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 10, zIndex: 10 }}>
          {slides.map((_, i) => (
            <div key={i} onClick={() => setCurrent(i)} style={{ width: i === current ? 28 : 8, height: 8, borderRadius: 4, background: i === current ? "#3ec6c6" : "rgba(255,255,255,0.4)", cursor: "pointer", transition: "all 0.3s" }} />
          ))}
        </div>
      </div>
    </div>
  );
}
