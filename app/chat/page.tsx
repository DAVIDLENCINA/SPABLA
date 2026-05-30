"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useWebRTC } from "./hooks/useWebRTC";
import VideoOverlay from "./components/VideoOverlay";

const LANGUAGES: Record<string, string> = {
  es: "🇪🇸", en: "🇬🇧", fr: "🇫🇷", de: "🇩🇪",
  it: "🇮🇹", pt: "🇧🇷", ja: "🇯🇵", zh: "🇨🇳", ar: "🇸🇦", ru: "🇷🇺"
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
  const [roomId] = useState(() => Math.random().toString(36).substring(2, 8));
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const convIdRef = useRef<string | null>(null);
  const webrtc = useWebRTC(roomId);

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
    const channel = supabase.channel(`messages:${convId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${convId}` },
        (payload) => setMessages(prev => [...prev, payload.new as Message]))
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") startPolling();
        if (status === "SUBSCRIBED") stopPolling();
      });
    return () => { supabase.removeChannel(channel); };
  };

  const translate = async (text: string, from: string, to: string): Promise<string> => {
    if (from === to || !text.trim()) return text;
    try {
      const url = `${window.location.origin}/api/translate`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, from, to }),
      });
      if (!res.ok) return text;
      const data = await res.json();
      return data.translation || text;
    } catch {
      return text;
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !user || !conversationId || loading) return;
    setLoading(true);
    const text = input.trim();
    setInput("");

    let translated = text;
    let translatedLanguage = user.language_primary;

    try {
      // Obtener participantes únicos distintos al emisor
      const { data: participants } = await supabase
        .from("conversation_participants")
        .select("user_id")
        .eq("conversation_id", conversationId)
        .neq("user_id", user.id);

      // Obtener IDs únicos
      const uniqueOtherIds = [...new Set((participants || []).map(p => p.user_id))];

      if (uniqueOtherIds.length > 0) {
        // Buscar el receptor con idioma distinto al emisor
        const { data: otherUsers } = await supabase
          .from("users")
          .select("id, language_primary")
          .in("id", uniqueOtherIds)
          .neq("language_primary", user.language_primary)
          .limit(1);

        const otherUser = otherUsers?.[0];

        if (otherUser?.language_primary) {
          translatedLanguage = otherUser.language_primary;
          translated = await translate(text, user.language_primary, otherUser.language_primary);
        }
      }
    } catch {
      // Si falla, enviar sin traducción
    }

    await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: user.id,
      original_text: text,
      translated_text: translated,
      original_language: user.language_primary,
      translated_language: translatedLanguage,
    });

    if (pollingRef.current) await loadMessages();
    setLoading(false);
  };

  const shareLink = () => { navigator.clipboard.writeText(window.location.href); alert("Link copiado."); };
  const startVideo = async () => { await webrtc.startCall(); setVideoActive(true); };
  const stopVideo = () => { webrtc.endCall(); setVideoActive(false); setVideoExpanded(false); };

  if (!user) return null;

  return (
    <div style={{ background: "#0d1117", height: "100vh", display: "flex", flexDirection: "column", fontFamily: "Inter, sans-serif", position: "relative" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0d1117" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <ellipse cx="11" cy="13" rx="9" ry="9" fill="#3ec6c6" opacity="0.9"/>
            <ellipse cx="17" cy="15" rx="9" ry="9" fill="#e8524a" opacity="0.9"/>
            <path d="M14 8 C16 10, 12 14, 14 18 C12 16, 16 12, 14 8Z" fill="white"/>
          </svg>
          <span style={{ color: "#fff", fontWeight: 600 }}>Chat</span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 18 }}>{LANGUAGES[user.language_primary]}</span>
          <button onClick={videoActive ? stopVideo : startVideo} style={{ background: videoActive ? "rgba(62,198,198,0.20)" : "rgba(232,82,74,0.15)", border: `1px solid ${videoActive ? "rgba(62,198,198,0.5)" : "rgba(232,82,74,0.35)"}`, borderRadius: 8, padding: "6px 14px", color: videoActive ? "#3ec6c6" : "#e8524a", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            {videoActive ? "🔴 En llamada" : "📹 Videollamada"}
          </button>
          <button onClick={shareLink} style={{ background: "rgba(62,198,198,0.15)", border: "1px solid rgba(62,198,198,0.3)", borderRadius: 8, padding: "6px 14px", color: "#3ec6c6", fontSize: 13, cursor: "pointer" }}>Invitar</button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", marginTop: 60 }}>
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>Comparte el link para que alguien se una</p>
            <button onClick={shareLink} style={{ marginTop: 12, background: "linear-gradient(135deg,#3ec6c6,#e8524a)", border: "none", borderRadius: 10, padding: "10px 24px", color: "#fff", fontSize: 14, cursor: "pointer" }}>Copiar link</button>
          </div>
        )}
        {messages.map(msg => {
          const isMe = msg.sender_id === user.id;
          const displayText = isMe ? msg.original_text : (msg.translated_language === user.language_primary ? (msg.translated_text || msg.original_text) : msg.original_text);
          const originalText = isMe ? null : msg.original_text;
          const showToggle = !isMe && originalText && originalText !== displayText;
          return (
            <div key={msg.id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "75%", background: isMe ? "linear-gradient(135deg,#3ec6c6,#2aa8a8)" : "#1a2232", borderRadius: isMe ? "18px 18px 4px 18px" : "18px 18px 18px 4px", padding: "10px 14px" }}>
                <p style={{ color: "#fff", fontSize: 15, margin: 0, lineHeight: 1.5 }}>{displayText}</p>
                {showToggle && <button onClick={() => setShowOriginal(showOriginal === msg.id ? null : msg.id)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 11, cursor: "pointer", padding: "4px 0 0", display: "block" }}>{showOriginal === msg.id ? "Ocultar original" : "Ver original"}</button>}
                {showOriginal === msg.id && <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, margin: "6px 0 0", fontStyle: "italic" }}>{originalText}</p>}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: 10, background: "#0d1117" }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()} placeholder="Escribe un mensaje..." style={{ flex: 1, background: "#111820", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 24, padding: "12px 18px", color: "#fff", fontSize: 15, outline: "none" }} />
        <button onClick={sendMessage} disabled={loading || !input.trim()} style={{ background: "linear-gradient(135deg,#3ec6c6,#e8524a)", border: "none", borderRadius: 24, padding: "12px 20px", color: "#fff", fontSize: 15, cursor: "pointer", opacity: loading || !input.trim() ? 0.5 : 1 }}>→</button>
      </div>
      {videoActive && <VideoOverlay webrtc={webrtc} onClose={stopVideo} expanded={videoExpanded} onToggleExpand={() => setVideoExpanded(e => !e)} />}
    </div>
  );
}
