"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
  { icon: "📞", title: "Llamada traducida",      sub: "Habla en tu idioma",       href: "/chat?mode=voice",  accent: "#3ec6c6" },
  { icon: "📹", title: "Videollamada traducida",  sub: "Cara a cara sin barreras", href: "/chat?mode=video",  accent: "#e8524a" },
  { icon: "💬", title: "Mensajes",                sub: "Chat en tiempo real",      href: "/chat",             accent: "#a78bfa" },
  { icon: "📄", title: "Documentos",              sub: "Traduce y comparte",       href: "/documents",        accent: "#34d399" },
  { icon: "📷", title: "Imágenes",                sub: "Comparte visualmente",     href: "/images",           accent: "#f59e0b" },
  { icon: "🎤", title: "Traductor",               sub: "Instantáneo en vivo",      href: "/interpreter",      accent: "#f472b6" },
];

const RECENT = [
  { name: "Sophia", lang: "en", last: "See you tomorrow!", time: "21:30" },
  { name: "Ahmed",  lang: "ar", last: "شكراً جزيلاً",      time: "20:15" },
  { name: "Marie",  lang: "fr", last: "Bonne nuit!",       time: "18:42" },
];

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState("home");

  useEffect(() => {
    const stored = localStorage.getItem("spabla_user");
    if (!stored) { router.push("/onboarding"); return; }
    setUser(JSON.parse(stored));
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
        .recent-row { display: flex; align-items: center; justify-content: space-between; padding: 11px 0; border-bottom: 1px solid rgba(255,255,255,0.06); cursor: pointer; }
        .recent-row:last-child { border-bottom: none; }
      `}</style>
      <div style={{ background: "#0d1117", minHeight: "100svh", display: "flex", flexDirection: "column", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, sans-serif", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ padding: "48px 20px 24px", textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 14 }}>
            <svg width="32" height="32" viewBox="0 0 28 28" fill="none">
              <ellipse cx="11" cy="13" rx="9" ry="9" fill="#3ec6c6" opacity="0.9"/>
              <ellipse cx="17" cy="15" rx="9" ry="9" fill="#e8524a" opacity="0.9"/>
              <path d="M14 8 C16 10, 12 14, 14 18 C12 16, 16 12, 14 8Z" fill="white"/>
            </svg>
            <span style={{ color: "#fff", fontSize: 24, fontWeight: 700, letterSpacing: "-0.03em" }}>SPABLA</span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 15, lineHeight: 1.5 }}>El idioma desaparece.<br/><span style={{ color: "rgba(255,255,255,0.8)" }}>La conversación permanece.</span></p>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 99, padding: "5px 12px" }}>
            <span style={{ fontSize: 13 }}>{myLang.flag}</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{myLang.name}</span>
            <div style={{ width: 5, height: 5, background: "#41ff9d", borderRadius: "50%" }}/>
          </div>
        </div>
        <div style={{ padding: "0 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {CARDS.map(card => (
            <div key={card.href} className="card" onClick={() => router.push(card.href)}>
              <div style={{ fontSize: 26, lineHeight: 1 }}>{card.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", lineHeight: 1.3 }}>{card.title}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)" }}>{card.sub}</div>
              <div style={{ height: 2, width: 24, borderRadius: 99, background: card.accent, marginTop: 2, opacity: 0.7 }}/>
            </div>
          ))}
        </div>
        <div style={{ padding: "24px 16px 0" }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>Conversaciones recientes</p>
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "0 14px" }}>
            {RECENT.map(r => {
              const lang = LANGUAGES[r.lang] ?? { flag: "🌐", name: r.lang };
              return (
                <div key={r.name} className="recent-row" onClick={() => router.push("/chat")}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,#3ec6c6,#e8524a)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 600, fontSize: 15, flexShrink: 0 }}>{r.name[0]}</div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: "#fff", fontSize: 14, fontWeight: 500 }}>{r.name}</span>
                        <span style={{ fontSize: 12 }}>{lang.flag}</span>
                      </div>
                      <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, marginTop: 1 }}>{r.last}</p>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>{r.time}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 80 }}/>
        <div style={{ position: "sticky", bottom: 0, background: "rgba(13,17,23,0.97)", borderTop: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)", display: "flex", justifyContent: "space-around", padding: "8px 0 max(8px, env(safe-area-inset-bottom))", zIndex: 50 }}>
          {[
            { id: "home",    icon: "🏠", label: "Inicio",       href: "" },
            { id: "chats",   icon: "💬", label: "Chats",        href: "/chat" },
            { id: "calls",   icon: "📞", label: "Llamadas",     href: "/chat?mode=voice" },
            { id: "files",   icon: "📁", label: "Archivos",     href: "/documents" },
            { id: "profile", icon: "👤", label: "Perfil",       href: "" },
          ].map(tab => (
            <button key={tab.id} className="tab-btn" onClick={() => { setActiveTab(tab.id); if (tab.href) router.push(tab.href); }}>
              <span style={{ fontSize: 20 }}>{tab.icon}</span>
              <span style={{ fontSize: 10, color: activeTab === tab.id ? "#3ec6c6" : "rgba(255,255,255,0.35)", fontWeight: activeTab === tab.id ? 600 : 400 }}>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
