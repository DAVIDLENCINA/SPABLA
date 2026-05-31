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
    const stored = localStorage.getItem("spabla_user");
    if (!stored) { router.push("/onboarding"); return; }
    const u = JSON.parse(stored);
    setUser(u);
    initConversation(u);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
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
      const url = `${window.location.origin}/api/translate`;
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, from, to }) });
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

  // Starts call or restores overlay if call is already active (startCall is a no-op when connected)
  const startVoice = async () => { await webrtc.startCall(); setVideoActive(true); };
  const startVideo = async () => { await webrtc.startCall(); setVideoActive(true); setVideoExpanded(true); };

  // Ends the call completely
  const stopVideo = () => { webrtc.endCall(); setVideoActive(false); setVideoExpanded(false); };

  // Hides the overlay WITHOUT ending the call — user returns to chat, call stays active
  const minimizeVideo = () => { setVideoActive(false); setVideoExpanded(false); };

  if (!user) return null;
  const myLang = LANGUAGES[user.language_primary] ?? { flag: "🌐", name: user.language_primary };
  const theirLang = otherLang ? (LANGUAGES[otherLang] ?? { flag: "🌐", name: otherLang }) : null;

  return (
    <div style={{ background: "#0d1117", height: "100svh", width: "100%", maxWidth: "100vw", display: "flex", flexDirection: "column", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, sans-serif", position: "relative", overflow: "hidden" }}>

      <div style={{ padding: "48px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "#0d1117" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
            <ellipse cx="11" cy="13" rx="9" ry="9" fill="#3ec6c6" opacity="0.9"/>
            <ellipse cx="17" cy="15" rx="9" ry="9" fill="#e8524a" opacity="0.9"/>
            <path d="M14 8 C16 10, 12 14, 14 18 C12 16, 16 12, 14 8Z" fill="white"/>
          </svg>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 18, letterSpacing: "-0.02em" }}>SPABLA</span>
        </div>
        <button
          onClick={() => setShowLangPicker(true)}
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "8px 12px", width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 15, color: "#fff", fontWeight: 500 }}>{myLang.flag} {myLang.name}</span>
            <span style={{ color: "#3ec6c6", fontSize: 15, fontWeight: 700 }}>↔</span>
            {theirLang
              ? <span style={{ fontSize: 15, color: "rgba(255,255,255,0.75)", fontWeight: 500 }}>{theirLang.flag} {theirLang.name}</span>
              : <span style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>Esperando...</span>
            }
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 7, height: 7, background: "#41ff9d", borderRadius: "50%" }}/>
            <span style={{ fontSize: 11, color: "#41ff9d", fontWeight: 500 }}>Activa</span>
          </div>
        </button>
      </div>

      <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "#0d1117" }}>
        {[
          { icon: "📞", label: "Llamar",  action: startVoice },
          { icon: "📹", label: "Vídeo",   action: startVideo },
          { icon: "📎", label: "Archivo", action: () => fileInputRef.current?.click() },
          { icon: "👥", label: "Invitar", action: shareLink },
        ].map(btn => (
          <button
            key={btn.label}
            onClick={btn.action}
            style={{ flex: 1, background: "none", border: "none", cursor: "pointer", padding: "12px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, borderRight: "1px solid rgba(255,255,255,0.05)" }}
          >
            <span style={{ fontSize: 22 }}>{btn.icon}</span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>{btn.label}</span>
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ textAlign: "center", marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.04)", borderRadius: 99, padding: "4px 12px" }}>🌍 Traducción instantánea activa</span>
        </div>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", marginTop: 40 }}>
            <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 14, marginBottom: 16 }}>Comparte el link para que alguien se una</p>
            <button onClick={shareLink} style={{ background: "linear-gradient(135deg,#3ec6c6,#e8524a)", border: "none", borderRadius: 10, padding: "10px 24px", color: "#fff", fontSize: 14, cursor: "pointer" }}>Copiar link</button>
          </div>
        )}
        {messages.map(msg => {
          const isMe = msg.sender_id === user.id;
          const displayText = isMe
            ? msg.original_text
            : (msg.translated_language === user.language_primary ? (msg.translated_text || msg.original_text) : msg.original_text);
          const wasTranslated = !isMe && msg.original_text !== displayText;
          const fromLang = LANGUAGES[msg.original_language];
          return (
            <div key={msg.id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "78%" }}>
                <div style={{ background: isMe ? "linear-gradient(135deg,#3ec6c6,#2aa8a8)" : "#1a2232", borderRadius: isMe ? "18px 18px 4px 18px" : "18px 18px 18px 4px", padding: "10px 14px" }}>
                  <p style={{ color: "#fff", fontSize: 15, margin: 0, lineHeight: 1.5 }}>{displayText}</p>
                  {wasTranslated && (
                    <>
                      <button
                        onClick={() => setShowOriginal(showOriginal === msg.id ? null : msg.id)}
                        style={{ background: "none", border: "none", color: "rgba(255,255,255,0.45)", fontSize: 11, cursor: "pointer", padding: "5px 0 0", display: "flex", alignItems: "center", gap: 4 }}
                      >
                        <span>Traducido desde {fromLang ? fromLang.name : msg.original_language}</span>
                        <span style={{ fontSize: 10 }}>{showOriginal === msg.id ? "▲" : "▼"}</span>
                      </button>
                      {showOriginal === msg.id && (
                        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 6, paddingTop: 6 }}>
                          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, margin: "0 0 3px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Original:</p>
                          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, margin: 0, fontStyle: "italic" }}>{msg.original_text}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding: "8px 12px max(16px, env(safe-area-inset-bottom))", borderTop: "1px solid rgba(255,255,255,0.07)", background: "#0d1117" }}>
        <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={() => {}} />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontSize: 18, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
          >📎</button>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendMessage()}
            placeholder="Escribe un mensaje..."
            style={{ flex: 1, minWidth: 0, boxSizing: "border-box", background: "#111820", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 24, padding: "12px 16px", color: "#fff", fontSize: 16, outline: "none" }}
          />
          <button
            style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)", fontSize: 18, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
          >🎤</button>
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg,#3ec6c6,#e8524a)", border: "none", color: "#fff", fontSize: 18, cursor: "pointer", opacity: loading || !input.trim() ? 0.4 : 1, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
          >➤</button>
        </div>
      </div>

      {showLangPicker && (
        <div onClick={() => setShowLangPicker(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", background: "#111820", borderRadius: "20px 20px 0 0", border: "1px solid rgba(255,255,255,0.1)", padding: "16px 16px 32px" }}>
            <p style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>Tu idioma</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {Object.entries(LANGUAGES).map(([code, lang]) => (
                <button
                  key={code}
                  onClick={() => changeLang(code)}
                  style={{ background: user.language_primary === code ? "rgba(62,198,198,0.12)" : "rgba(255,255,255,0.03)", border: `1px solid ${user.language_primary === code ? "rgba(62,198,198,0.3)" : "rgba(255,255,255,0.07)"}`, borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
                >
                  <span style={{ fontSize: 14, color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
                    <span>{lang.flag}</span><span>{lang.name}</span>
                  </span>
                  {user.language_primary === code && <span style={{ color: "#3ec6c6", fontSize: 14 }}>✓</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {videoActive && (
        <VideoOverlay
          webrtc={webrtc}
          onClose={stopVideo}
          onMinimize={minimizeVideo}
          expanded={videoExpanded}
          onToggleExpand={() => setVideoExpanded(e => !e)}
        />
      )}

      {/* Call active but overlay minimized — tap any call button to restore */}
      {!videoActive && webrtc.connected && (
        <div
          onClick={() => setVideoActive(true)}
          style={{
            position: "fixed", bottom: 72, left: "50%", transform: "translateX(-50%)",
            zIndex: 50, background: "rgba(232,82,74,0.9)", borderRadius: 999,
            padding: "8px 20px", display: "flex", alignItems: "center", gap: 8,
            cursor: "pointer", boxShadow: "0 4px 20px rgba(232,82,74,.4)",
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff", display: "block" }}/>
          <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>Llamada activa — toca para volver</span>
        </div>
      )}
    </div>
  );
}
