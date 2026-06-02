"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type User = { id: string; name: string; language_primary: string };

const LANGUAGES: Record<string, { flag: string; name: string }> = {
  es: { flag: "🇪🇸", name: "Español" },
  en: { flag: "🇬🇧", name: "English" },
  fr: { flag: "🇫🇷", name: "Français" },
  de: { flag: "🇩🇪", name: "Deutsch" },
  it: { flag: "🇮🇹", name: "Italiano" },
  pt: { flag: "🇵🇹", name: "Português" },
  ja: { flag: "🇯🇵", name: "日本語" },
  zh: { flag: "🇨🇳", name: "中文" },
  ar: { flag: "🇸🇦", name: "العربية" },
  ru: { flag: "🇷🇺", name: "Русский" },
};

const CARDS = [
  { icon: "📞", title: "Llamada traducida",      sub: "Habla en tu idioma",       href: "/chat?mode=voice", accent: "#3ec6c6" },
  { icon: "📹", title: "Videollamada traducida",  sub: "Cara a cara sin barreras", href: "/chat?mode=video", accent: "#e8524a" },
  { icon: "💬", title: "Mensajes",                sub: "Chat en tiempo real",      href: "/chat",            accent: "#a78bfa" },
];

const TABS = [
  { id: "home",  icon: "🏠", label: "Inicio",   href: ""                },
  { id: "chats", icon: "💬", label: "Chats",    href: "/chat"           },
  { id: "calls", icon: "📞", label: "Llamadas", href: "/chat?mode=voice"},
];

export default function Home() {
  const router = useRouter();
  const hasRedirected = useRef(false);
  const [user, setUser]         = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState("home");

  useEffect(() => {
    let cancelled = false;
    if (hasRedirected.current) return;
    const stored = localStorage.getItem("spabla_user");
    if (!stored) {
      hasRedirected.current = true;
      router.push("/onboarding");
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (!session) {
        hasRedirected.current = true;
        router.push("/onboarding");
        return;
      }
      setUser(JSON.parse(stored));
    });
    return () => { cancelled = true; };
  }, []);

  if (!user) return null;

  const myLang = LANGUAGES[user.language_primary] ?? { flag: "🌐", name: user.language_primary };

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 18px 14px; cursor: pointer; transition: background 0.15s, transform 0.12s; display: flex; flex-direction: column; gap: 8px; }
        .card:active { transform: scale(0.97); background: rgba(255,255,255,0.07); }
        .tab-btn { background: none; border: none; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 6px 8px; }
      `}</style>
      <div style={{ background: "#0d1117", minHeight: "100svh", display: "flex", flexDirection: "column", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, sans-serif", maxWidth: 480, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ padding: "48px 20px 24px", textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 14 }}>
            <svg width="32" height="32" viewBox="0 0 28 28" fill="none">
              <ellipse cx="11" cy="13" rx="9" ry="9" fill="#3ec6c6" opacity="0.9"/>
              <ellipse cx="17" cy="15" rx="9" ry="9" fill="#e8524a" opacity="0.9"/>
              <path d="M14 8 C16 10, 12 14, 14 18 C12 16, 16 12, 14 8Z" fill="white"/>
            </svg>
            <span style={{ color: "#fff", fontSize: 24, fontWeight: 700, letterSpacing: "-0.03em" }}>SPABLA</span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 15, lineHeight: 1.5 }}>
            El idioma desaparece.<br/>
            <span style={{ color: "rgba(255,255,255,0.8)" }}>La conversación permanece.</span>
          </p>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 99, padding: "5px 12px" }}>
            <span style={{ fontSize: 13 }}>{myLang.flag}</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{myLang.name}</span>
            <div style={{ width: 5, height: 5, background: "#41ff9d", borderRadius: "50%" }}/>
          </div>
        </div>

        {/* Cards — solo funcionalidades reales */}
        <div style={{ padding: "0 16px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {CARDS.map(card => (
            <div key={card.href} className="card" onClick={() => router.push(card.href)}>
              <div style={{ fontSize: 24, lineHeight: 1 }}>{card.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", lineHeight: 1.3 }}>{card.title}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)" }}>{card.sub}</div>
              <div style={{ height: 2, width: 20, borderRadius: 99, background: card.accent, marginTop: 2, opacity: 0.7 }}/>
            </div>
          ))}
        </div>

        {/* Conversaciones recientes — vacías hasta que se implemente el historial real */}
        <div style={{ padding: "28px 16px 0" }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12 }}>
            Conversaciones recientes
          </p>
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "28px 20px", textAlign: "center" }}>
            <p style={{ color: "rgba(255,255,255,0.28)", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
              Aún no tienes conversaciones.<br/>
              <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>
                Inicia una nueva o comparte tu link de invitación.
              </span>
            </p>
            <button
              onClick={() => router.push("/chat")}
              style={{ marginTop: 16, background: "linear-gradient(135deg,#3ec6c6,#e8524a)", border: "none", borderRadius: 10, padding: "10px 22px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              Nueva conversación
            </button>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 80 }}/>

        {/* Tab bar — solo tabs con rutas reales */}
        <div style={{ position: "sticky", bottom: 0, background: "rgba(13,17,23,0.97)", borderTop: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)", display: "flex", justifyContent: "space-around", padding: "8px 0 max(8px, env(safe-area-inset-bottom))", zIndex: 50 }}>
          {TABS.map(tab => (
            <button key={tab.id} className="tab-btn" onClick={() => { setActiveTab(tab.id); if (tab.href) router.push(tab.href); }}>
              <span style={{ fontSize: 20 }}>{tab.icon}</span>
              <span style={{ fontSize: 10, color: activeTab === tab.id ? "#3ec6c6" : "rgba(255,255,255,0.35)", fontWeight: activeTab === tab.id ? 600 : 400 }}>
                {tab.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
