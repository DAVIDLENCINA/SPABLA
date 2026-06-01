"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useWebRTC } from "./hooks/useWebRTC";
import VideoOverlay from "./components/VideoOverlay";

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

type Message = {
  id: string;
  sender_id: string;
  original_text: string;
  translated_text: string;
  original_language: string;
  translated_language: string;
  created_at: string;
};
type User = { id: string; name: string; language_primary: string };

export default function Chat() {
  const router = useRouter();
  const hasRedirected = useRef(false);
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showOriginal, setShowOriginal] = useState<string | null>(null);
  const [videoActive, setVideoActive] = useState(false);
  const [videoExpanded, setVideoExpanded] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [otherLang, setOtherLang] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const convIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const webrtc = useWebRTC(conversationId, user?.language_primary ?? "es", otherLang);

  const loadMessages = useCallback(async () => {
    const id = convIdRef.current;
    if (!id) return;
    const { data } = await supabase.from("messages").select("*").eq("conversation_id", id).order("created_at");
    if (data) setMessages(data);
  }, []);

  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    pollingRef.current = setInterval(loadMessages, 3000);
  }, [loadMessages]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (hasRedirected.current) return;

    const stored = localStorage.getItem("spabla_user");
    if (!stored) {
      hasRedirected.current = true;
      router.push("/onboarding");
      return;
    }

    // Redirigir a onboarding si la sesión expira o el usuario cierra sesión.
    // TOKEN_REFRESHED lo gestiona supabase-js automáticamente (actualiza el WS de Realtime).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT" || !session) {
        hasRedirected.current = true;
        localStorage.removeItem("spabla_user");
        router.push("/onboarding");
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (!session) {
        hasRedirected.current = true;
        router.push("/onboarding");
        return;
      }
      const u = JSON.parse(stored);
      setUser(u);
      initConversation(u);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const initConversation = async (u: User) => {
    const params = new URLSearchParams(window.location.search);
    const rawId = params.get("id");
    let convId: string;
    if (!rawId) {
      const { data } = await supabase.from("conversations").insert({}).select().single();
      convId = data.id as string;
      await supabase.from("conversation_participants").insert({ conversation_id: convId, user_id: u.id });
      window.history.replaceState({}, "", `/chat?id=${convId}`);
    } else {
      convId = rawId;
      const { data: existing } = await supabase.from("conversation_participants").select().eq("conversation_id", convId).eq("user_id", u.id);
      if (!existing?.length) await supabase.from("conversation_participants").insert({ conversation_id: convId, user_id: u.id });
    }
    convIdRef.current = convId;
    setConversationId(convId);
    await loadMessages();
    const { data: participants } = await supabase
      .from("conversation_participants").select("user_id")
      .eq("conversation_id", convId).neq("user_id", u.id);
    if (participants?.length) {
      const { data: otherUsers } = await supabase
        .from("users").select("language_primary")
        .in("id", participants.map((p: { user_id: string }) => p.user_id))
        .neq("language_primary", u.language_primary).limit(1);
      if (otherUsers?.[0]) setOtherLang(otherUsers[0].language_primary);
    }
    const channel = supabase.channel(`messages:${convId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${convId}` },
        (payload) => setMessages(prev => [...prev, payload.new as Message]))
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") startPolling();
        if (status === "SUBSCRIBED") stopPolling();
      });
    return () => { supabase.removeChannel(channel); };
  };

  const changeLang = async (lang: string) => {
    if (!user) return;
    const updated = { ...user, language_primary: lang };
    await supabase.from("users").update({ language_primary: lang }).eq("id", user.id);
    localStorage.setItem("spabla_user", JSON.stringify(updated));
    setUser(updated);
    setShowLangPicker(false);
  };

  const translate = async (text: string, from: string, to: string): Promise<string> => {
    if (from === to || !text.trim()) return text;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return text;
      const url = `${window.location.origin}/api/translate`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ text, from, to }),
      });
      if (!res.ok) return text;
      const data = await res.json();
      return data.translation || text;
    } catch { return text; }
  };

  const sendMessage = async () => {
    if (!input.trim() || !user || !conversationId || loading) return;
    setLoading(true);
    const text = input.trim();
    setInput("");
    let translated = text;
    let translatedLanguage = user.language_primary;
    try {
      const { data: participants } = await supabase
        .from("conversation_participants").select("user_id")
        .eq("conversation_id", conversationId).neq("user_id", user.id);
      const uniqueOtherIds = [...new Set((participants || []).map((p: { user_id: string }) => p.user_id))];
      if (uniqueOtherIds.length > 0) {
        const { data: otherUsers } = await supabase
          .from("users").select("id, language_primary")
          .in("id", uniqueOtherIds).neq("language_primary", user.language_primary).limit(1);
        const otherUser = otherUsers?.[0];
        if (otherUser?.language_primary) {
          translatedLanguage = otherUser.language_primary;
          translated = await translate(text, user.language_primary, otherUser.language_primary);
          setOtherLang(otherUser.language_primary);
        }
      }
    } catch {}
    await supabase.from("messages").insert({
      conversation_id: conversationId, sender_id: user.id,
      original_text: text, translated_text: translated,
      original_language: user.language_primary, translated_language: translatedLanguage,
    });
    if (pollingRef.current) await loadMessages();
    setLoading(false);
  };

  const shareLink = () => { navigator.clipboard.writeText(window.location.href); alert("Link copiado."); };

  const startVoice = async () => { await webrtc.startCall(); setVideoActive(true); };
  const startVideo = async () => { await webrtc.startCall(); setVideoActive(true); setVideoExpanded(true); };
  const stopVideo  = () => { webrtc.endCall(); setVideoActive(false); setVideoExpanded(false); };

  if (!user) return null;
  const myLang   = LANGUAGES[user.language_primary] ?? { flag: "🌐", name: user.language_primary };
  const theirLang = otherLang ? (LANGUAGES[otherLang] ?? { flag: "🌐", name: otherLang }) : null;

  return (
    <>
      <style>{`
        @keyframes msgIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        .msg { animation: msgIn 0.18s ease; }
        .action-btn:active { transform: scale(0.92); }
        .send-btn:active { transform: scale(0.94); }
        input::placeholder { color: rgba(255,255,255,0.28); }
      `}</style>

      <div style={{
        background: "linear-gradient(160deg, #0b1120 0%, #0d1927 45%, #0e1219 80%, #100d12 100%)",
        height: "100svh", width: "100%", maxWidth: "100vw",
        display: "flex", flexDirection: "column",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, sans-serif",
        position: "relative", overflow: "hidden",
      }}>

        {/* ── HEADER ── */}
        <div style={{
          background: "rgba(10,15,28,0.90)",
          backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          paddingTop: "max(14px, env(safe-area-inset-top, 14px))",
          paddingLeft: 16, paddingRight: 16, paddingBottom: 0,
        }}>
          {/* Logo row + action buttons */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 10 }}>
            <img src="/SPABLA_LOGO.png" alt="SPABLA" style={{ height: 26, opacity: 0.95 }} />

            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {/* Llamada de voz */}
              <button className="action-btn" onClick={startVoice} title="Llamar" style={{
                width: 38, height: 38, borderRadius: "50%",
                background: "rgba(62,198,198,0.12)", border: "1px solid rgba(62,198,198,0.22)",
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                transition: "transform .12s",
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3ec6c6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013 4.18 2 2 0 015 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L9.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
                </svg>
              </button>

              {/* Videollamada */}
              <button className="action-btn" onClick={startVideo} title="Videollamada" style={{
                width: 38, height: 38, borderRadius: "50%",
                background: "rgba(62,198,198,0.12)", border: "1px solid rgba(62,198,198,0.22)",
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                transition: "transform .12s",
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3ec6c6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
                </svg>
              </button>

              {/* Compartir link */}
              <button className="action-btn" onClick={shareLink} title="Invitar" style={{
                width: 38, height: 38, borderRadius: "50%",
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                transition: "transform .12s",
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Selector de idioma */}
          <button onClick={() => setShowLangPicker(true)} style={{
            width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 12, padding: "9px 14px", marginBottom: 10,
            display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, color: "#fff", fontWeight: 500 }}>{myLang.flag} {myLang.name}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(62,198,198,0.7)" strokeWidth="2.5" strokeLinecap="round">
                <path d="M8 3L4 7l4 4M16 21l4-4-4-4M4 7h16M4 17h16"/>
              </svg>
              {theirLang
                ? <span style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", fontWeight: 500 }}>{theirLang.flag} {theirLang.name}</span>
                : <span style={{ fontSize: 13, color: "rgba(255,255,255,0.28)" }}>Esperando participante...</span>
              }
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#41ff9d", display: "block", boxShadow: "0 0 6px #41ff9d" }}/>
              <span style={{ fontSize: 10, color: "#41ff9d", fontWeight: 600, letterSpacing: "0.04em" }}>EN VIVO</span>
            </div>
          </button>
        </div>

        {/* ── MENSAJES ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px 8px", display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Estado vacío */}
          {messages.length === 0 && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "40px 24px" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(62,198,198,0.08)", border: "1px solid rgba(62,198,198,0.15)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
                  <ellipse cx="11" cy="13" rx="9" ry="9" fill="#3ec6c6" opacity="0.7"/>
                  <ellipse cx="17" cy="15" rx="9" ry="9" fill="#e8524a" opacity="0.7"/>
                  <path d="M14 8 C16 10, 12 14, 14 18 C12 16, 16 12, 14 8Z" fill="white"/>
                </svg>
              </div>
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 15, marginBottom: 6, fontWeight: 500 }}>Conversación lista</p>
              <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>Comparte el link para que alguien se una y empieza a hablar en cualquier idioma.</p>
              <button onClick={shareLink} style={{
                background: "linear-gradient(135deg,#3ec6c6,#e8524a)", border: "none", borderRadius: 12,
                padding: "11px 28px", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer",
                boxShadow: "0 4px 20px rgba(62,198,198,0.25)",
              }}>
                Copiar link de invitación
              </button>
            </div>
          )}

          {/* Burbujas */}
          {messages.map(msg => {
            const isMe = msg.sender_id === user.id;
            const displayText = isMe
              ? msg.original_text
              : (msg.translated_language === user.language_primary ? (msg.translated_text || msg.original_text) : msg.original_text);
            const wasTranslated = !isMe && msg.original_text !== displayText;
            const fromLang = LANGUAGES[msg.original_language];
            return (
              <div key={msg.id} className="msg" style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "80%" }}>
                  {isMe ? (
                    // Mis mensajes — burbuja cyan
                    <div style={{
                      background: "linear-gradient(135deg, #1c7a7a 0%, #3ec6c6 100%)",
                      borderRadius: "20px 20px 5px 20px",
                      padding: "11px 15px",
                      boxShadow: "0 3px 16px rgba(62,198,198,0.18)",
                    }}>
                      <p style={{ color: "#fff", fontSize: 15, margin: 0, lineHeight: 1.55, fontWeight: 450 }}>{displayText}</p>
                    </div>
                  ) : (
                    // Mensajes recibidos — burbuja oscura + traducción siempre visible
                    <div style={{
                      background: "rgba(255,255,255,0.055)",
                      border: "1px solid rgba(255,255,255,0.09)",
                      borderRadius: "5px 20px 20px 20px",
                      padding: "11px 15px",
                      backdropFilter: "blur(12px)",
                      WebkitBackdropFilter: "blur(12px)",
                    }}>
                      <p style={{ color: "#fff", fontSize: 15, margin: 0, lineHeight: 1.55, fontWeight: 500 }}>{displayText}</p>
                      {wasTranslated && (
                        <div style={{ marginTop: 7, paddingTop: 7, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, margin: 0, lineHeight: 1.45 }}>
                            {fromLang?.flag ?? "🌐"} {msg.original_text}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* ── INPUT ── */}
        <div style={{
          padding: "8px 12px",
          paddingBottom: "max(16px, env(safe-area-inset-bottom, 16px))",
          background: "rgba(10,15,28,0.92)",
          backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}>
          <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={() => {}} />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => fileInputRef.current?.click()} style={{
              width: 40, height: 40, borderRadius: "50%",
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
            }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendMessage()}
              placeholder="Escribe un mensaje..."
              style={{
                flex: 1, minWidth: 0, boxSizing: "border-box",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.09)",
                borderRadius: 24, padding: "12px 18px",
                color: "#fff", fontSize: 16, outline: "none",
                fontFamily: "inherit",
              }}
            />
            <button
              className="send-btn"
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              style={{
                width: 44, height: 44, borderRadius: "50%",
                background: input.trim() ? "linear-gradient(135deg,#3ec6c6,#e8524a)" : "rgba(255,255,255,0.07)",
                border: "none", cursor: input.trim() ? "pointer" : "default",
                opacity: loading ? 0.5 : 1, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background .2s, transform .12s",
                boxShadow: input.trim() ? "0 3px 16px rgba(62,198,198,0.25)" : "none",
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={input.trim() ? "#fff" : "rgba(255,255,255,0.3)"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>

        {/* ── SELECTOR DE IDIOMA ── */}
        {showLangPicker && (
          <div onClick={() => setShowLangPicker(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", display: "flex", alignItems: "flex-end", zIndex: 100 }}>
            <div onClick={e => e.stopPropagation()} style={{
              width: "100%", background: "rgba(13,19,34,0.98)",
              borderRadius: "24px 24px 0 0", border: "1px solid rgba(255,255,255,0.1)",
              padding: "20px 16px max(32px, env(safe-area-inset-bottom, 32px))",
            }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.18)", margin: "0 auto 18px" }}/>
              <p style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.35)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>Tu idioma</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                {Object.entries(LANGUAGES).map(([code, lang]) => (
                  <button key={code} onClick={() => changeLang(code)} style={{
                    background: user.language_primary === code ? "rgba(62,198,198,0.13)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${user.language_primary === code ? "rgba(62,198,198,0.35)" : "rgba(255,255,255,0.08)"}`,
                    borderRadius: 12, padding: "11px 13px",
                    display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer",
                    fontFamily: "inherit",
                  }}>
                    <span style={{ fontSize: 14, color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
                      <span>{lang.flag}</span><span>{lang.name}</span>
                    </span>
                    {user.language_primary === code && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3ec6c6" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── VIDEO OVERLAY ── */}
        {videoActive && (
          <VideoOverlay
            webrtc={webrtc}
            onClose={stopVideo}
            expanded={videoExpanded}
            onToggleExpand={() => setVideoExpanded(e => !e)}
          />
        )}
      </div>
    </>
  );
}
