"use client";
import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Phone, Video, ShieldCheck, Globe2, Zap, Lock, Smartphone, Star, ArrowRight, CheckCircle2, Languages, Captions, Mic2 } from "lucide-react";

const slides = [
  { image: "/hero1.jpg", eyebrow: "Traducción de voz en tiempo real", title: "Habla con el Mundo", subtitle: "Llamadas y videollamadas con traducción instantánea para comunicarte sin barreras.", cta: "Iniciar llamada", secondary: "Ver cómo funciona" },
  { image: "/hero2.jpg", eyebrow: "Comunicación global", title: "Tu voz sin Fronteras", subtitle: "Conecta con cualquier persona, estés donde estés, en el idioma que necesites.", cta: "Probar SPABLA", secondary: "Descargar app" },
  { image: "/hero3.jpg", eyebrow: "Más de 10 idiomas", title: "Entiende cualquier Idioma", subtitle: "Escucha, habla y comprende conversaciones reales con subtítulos y traducción de voz.", cta: "Empezar ahora", secondary: "Explorar idiomas" },
];

const features = [
  { icon: Zap, title: "Traducción instantánea", text: "La voz se traduce en tiempo real durante la conversación." },
  { icon: Globe2, title: "+10 idiomas", text: "Comunícate con personas de todo el mundo sin cambiar de app." },
  { icon: ShieldCheck, title: "Privado y seguro", text: "Diseñado para proteger tus llamadas, videollamadas y datos." },
  { icon: Captions, title: "Subtítulos en vivo", text: "Lee lo que se dice mientras SPABLA traduce la conversación." },
];

const security = [
  { icon: Lock, title: "Cifrado de extremo a extremo", text: "Tus llamadas y videollamadas están protegidas para que solo los participantes puedan escucharlas." },
  { icon: ShieldCheck, title: "Privacidad por diseño", text: "SPABLA minimiza los datos necesarios para ofrecer una experiencia rápida y segura." },
  { icon: Mic2, title: "Control de conversación", text: "Tú decides cuándo iniciar, pausar o finalizar la traducción." },
];

export default function SpablaLandingPage() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActive(c => (c + 1) % slides.length), 5000);
    return () => clearInterval(t);
  }, []);

  const slide = slides[active];

  return (
    <main className="min-h-screen bg-[#f7f9ff] text-slate-950">
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-slate-950/25 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <img src="/spabla-logo.png" alt="SPABLA" className="h-9 w-auto" />
          </div>
          <nav className="hidden items-center gap-8 text-sm font-medium text-white/80 md:flex">
            <a href="#funciona" className="hover:text-white">Cómo funciona</a>
            <a href="#seguridad" className="hover:text-white">Seguridad</a>
            <a href="#app" className="hover:text-white">App móvil</a>
          </nav>
          <a href="#app" className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg transition hover:scale-[1.02]">
            Descargar app
          </a>
        </div>
      </header>

      <section className="relative h-screen min-h-[760px] overflow-hidden bg-slate-950">
        {slides.map((s, i) => (
          <div key={i} style={{ position: "absolute", inset: 0, opacity: i === active ? 1 : 0, transition: "opacity 1s ease", zIndex: 0 }}>
            <img src={s.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }} />
          </div>
        ))}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/55 to-slate-950/20" style={{ zIndex: 1 }} />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#f7f9ff]" style={{ zIndex: 1 }} />

        <div className="relative flex h-full max-w-7xl mx-auto items-center px-6 pt-20" style={{ zIndex: 2 }}>
          <motion.div key={active} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="max-w-2xl">
            <div className="mb-6 inline-flex items-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/85 backdrop-blur">
              <span className="mr-2 h-2 w-2 rounded-full bg-[#ff5b6b]" /> {slide.eyebrow}
            </div>
            <h1 className="text-6xl font-black tracking-tight text-white md:text-8xl">
              {slide.title.split(" ").slice(0, -1).join(" ")}{" "}
              <span className="bg-gradient-to-r from-[#18c8df] via-[#8a7cff] to-[#ff5b6b] bg-clip-text text-transparent">
                {slide.title.split(" ").slice(-1)}
              </span>
            </h1>
            <p className="mt-7 max-w-xl text-xl leading-8 text-white/80">{slide.subtitle}</p>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <a href="/call/new" className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-[#18c8df] to-[#ff5b6b] px-7 py-4 font-bold text-white shadow-xl transition hover:scale-[1.02]">
                {slide.cta} <ArrowRight className="ml-2 h-5 w-5" />
              </a>
              <a href="#funciona" className="inline-flex items-center justify-center rounded-2xl border border-white/18 bg-white/10 px-7 py-4 font-bold text-white backdrop-blur transition hover:bg-white/15">
                {slide.secondary}
              </a>
            </div>
          </motion.div>
        </div>

        <div className="absolute bottom-12 left-1/2 z-20 flex -translate-x-1/2 gap-3">
          {slides.map((_, i) => (
            <button key={i} onClick={() => setActive(i)} className={`h-2.5 rounded-full transition-all ${active === i ? "w-10 bg-white" : "w-2.5 bg-white/40"}`} />
          ))}
        </div>
      </section>

      <section id="funciona" className="relative z-10 mx-auto -mt-8 max-w-7xl px-6 pb-24">
        <div className="rounded-[2.5rem] border border-slate-200/80 bg-white p-8 shadow-2xl md:p-12">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="mb-4 text-sm font-bold uppercase tracking-[0.25em] text-[#18aecd]">Llamada o videollamada</p>
              <h2 className="text-4xl font-black tracking-tight md:text-6xl">Comunícate <span className="bg-gradient-to-r from-[#18c8df] to-[#ff5b6b] bg-clip-text text-transparent">sin límites</span></h2>
              <p className="mt-5 max-w-lg text-lg leading-8 text-slate-600">Elige cómo quieres conectar. SPABLA traduce tu voz y muestra subtítulos en tiempo real.</p>
              <div className="mt-8 flex items-center gap-3 text-sm font-semibold text-slate-600">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" /> Sin registro complejo · Sin barreras · En segundos
              </div>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="rounded-[2rem] bg-gradient-to-br from-sky-50 to-blue-100 p-7 shadow-inner">
                <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-[#1687ff] shadow-sm"><Phone className="h-8 w-8" /></div>
                <h3 className="text-3xl font-black">Llamada</h3>
                <p className="mt-3 text-slate-600">Llamadas de voz con traducción instantánea entre idiomas.</p>
                <button className="mt-6 w-full rounded-2xl bg-[#1687ff] px-5 py-4 font-bold text-white">Iniciar llamada</button>
              </div>
              <div className="rounded-[2rem] bg-gradient-to-br from-fuchsia-50 to-violet-100 p-7 shadow-inner">
                <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-[#7c3aed] shadow-sm"><Video className="h-8 w-8" /></div>
                <h3 className="text-3xl font-black">Videollamada</h3>
                <p className="mt-3 text-slate-600">Videollamadas con voz traducida y subtítulos en vivo.</p>
                <button className="mt-6 w-full rounded-2xl bg-[#7c3aed] px-5 py-4 font-bold text-white">Iniciar videollamada</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="grid gap-5 md:grid-cols-4">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-[#1687ff]"><Icon className="h-6 w-6" /></div>
              <h3 className="text-xl font-black">{title}</h3>
              <p className="mt-3 leading-7 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="seguridad" className="bg-white py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div>
              <div className="mb-5 inline-flex items-center rounded-full bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700"><ShieldCheck className="mr-2 h-4 w-4" /> Privacidad y seguridad</div>
              <h2 className="text-5xl font-black tracking-tight md:text-6xl">Tu privacidad es nuestra <span className="bg-gradient-to-r from-[#1687ff] to-[#ff5b6b] bg-clip-text text-transparent">prioridad</span></h2>
              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">SPABLA transmite confianza. La seguridad es clara, verificable y fácil de entender.</p>
            </div>
            <div className="rounded-[3rem] bg-gradient-to-br from-blue-50 via-white to-violet-100 p-8 shadow-inner">
              <div className="mx-auto flex h-56 w-56 items-center justify-center rounded-full bg-white shadow-xl">
                <ShieldCheck className="h-28 w-28 text-[#4f46e5]" />
              </div>
              <div className="mt-8 grid gap-5 md:grid-cols-3">
                {security.map(({ icon: Icon, title, text }) => (
                  <div key={title} className="rounded-3xl bg-white p-5 shadow-sm">
                    <Icon className="mb-4 h-7 w-7 text-[#4f46e5]" />
                    <h3 className="font-black">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="app" className="relative overflow-hidden py-24">
        <div className="relative mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <div className="mb-5 inline-flex items-center rounded-full bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700"><Smartphone className="mr-2 h-4 w-4" /> Disponible en móvil</div>
            <h2 className="text-5xl font-black tracking-tight md:text-6xl">Lleva <span className="bg-gradient-to-r from-[#1687ff] to-[#ff5b6b] bg-clip-text text-transparent">SPABLA</span> a donde vayas</h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">Comunícate desde tu móvil con llamadas, videollamadas y traducción en tiempo real.</p>
            <div className="mt-10 flex flex-wrap gap-3">
              <button className="rounded-2xl bg-slate-950 px-6 py-3 font-bold text-white">App Store</button>
              <button className="rounded-2xl bg-slate-950 px-6 py-3 font-bold text-white">Google Play</button>
            </div>
          </div>
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="rounded-[3rem] bg-gradient-to-br from-cyan-50 to-violet-100 p-12 shadow-inner">
              <Smartphone className="h-48 w-48 text-[#4f46e5]" />
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-24">
        <div className="mx-auto max-w-7xl rounded-[3rem] bg-slate-950 p-10 text-center text-white md:p-16">
          <Star className="mx-auto mb-6 h-10 w-10 text-[#ff5b6b]" />
          <h2 className="text-4xl font-black tracking-tight md:text-6xl">Empieza a hablar sin barreras</h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/70">SPABLA convierte cada llamada en una conversación clara, natural y global.</p>
          <div className="mt-10 flex justify-center">
            <a href="/call/new" className="rounded-2xl bg-gradient-to-r from-[#18c8df] to-[#ff5b6b] px-8 py-4 font-black text-white">Descargar SPABLA</a>
          </div>
        </div>
      </section>
    </main>
  );
}
