"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const LANGUAGES = [
  { code: "es", flag: "🇪🇸", name: "Español" },
  { code: "en", flag: "🇬🇧", name: "English" },
  { code: "fr", flag: "🇫🇷", name: "Français" },
  { code: "de", flag: "🇩🇪", name: "Deutsch" },
  { code: "it", flag: "🇮🇹", name: "Italiano" },
  { code: "pt", flag: "🇧🇷", name: "Português" },
  { code: "ja", flag: "🇯🇵", name: "日本語" },
  { code: "zh", flag: "🇨🇳", name: "中文" },
  { code: "ar", flag: "🇸🇦", name: "العربية" },
  { code: "ru", flag: "🇷🇺", name: "Русский" },
];

export default function Onboarding() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("es");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Escribe tu nombre"); return; }
    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
      if (authError || !authData.user) throw authError ?? new Error("No auth");
      const uid = authData.user.id;
      const { data, error } = await supabase
        .from("users")
        .insert({ id: uid, name: name.trim(), language_primary: language })
        .select()
        .single();
      if (error) throw error;
      localStorage.setItem("spabla_user", JSON.stringify(data));
      router.push("/chat");
    } catch (e) {
      setError("Error al crear usuario. Inténtalo de nuevo.");
    }
    setLoading(false);
  };

  return (
    <div style={{ background: "#0d1117", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <svg width="48" height="48" viewBox="0 0 28 28" fill="none" style={{ margin: "0 auto 16px" }}>
            <ellipse cx="11" cy="13" rx="9" ry="9" fill="#3ec6c6" opacity="0.9"/>
            <ellipse cx="17" cy="15" rx="9" ry="9" fill="#e8524a" opacity="0.9"/>
            <path d="M14 8 C16 10, 12 14, 14 18 C12 16, 16 12, 14 8Z" fill="white"/>
          </svg>
          <h1 style={{ color: "#fff", fontSize: 28, fontWeight: 700, margin: "0 0 8px" }}>Bienvenido a SPABLA</h1>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 15, margin: 0 }}>Habla con el mundo en tu idioma</p>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, display: "block", marginBottom: 8 }}>Tu nombre</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            placeholder="¿Cómo te llamas?"
            style={{ width: "100%", background: "#111820", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "14px 16px", color: "#fff", fontSize: 16, outline: "none", boxSizing: "border-box" }}
          />
        </div>

        <div style={{ marginBottom: 32 }}>
          <label style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, display: "block", marginBottom: 8 }}>Tu idioma</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
            {LANGUAGES.map(l => (
              <button
                key={l.code}
                onClick={() => setLanguage(l.code)}
                style={{
                  background: language === l.code ? "rgba(62,198,198,0.15)" : "#111820",
                  border: `1px solid ${language === l.code ? "#3ec6c6" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 14,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 8, textAlign: "left"
                }}
              >
                <span>{l.flag}</span> {l.name}
              </button>
            ))}
          </div>
        </div>

        {error && <p style={{ color: "#e8524a", fontSize: 14, marginBottom: 16, textAlign: "center" }}>{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{ width: "100%", background: "linear-gradient(135deg,#3ec6c6,#e8524a)", border: "none", borderRadius: 12, padding: "15px", color: "#fff", fontSize: 16, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}
        >
          {loading ? "Entrando..." : "Empezar →"}
        </button>
      </div>
    </div>
  );
}
