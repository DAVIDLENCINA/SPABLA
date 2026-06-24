"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useWebRTC, type CaptionEntry } from "./hooks/useWebRTC";
import { unlockAudio } from "./hooks/useTranslatedSpeech";
import { useCallSignaling } from "./hooks/useCallSignaling";
import { useRingTone } from "./hooks/useRingTone";
import { useVoiceTranscription } from "./hooks/useVoiceTranscription";
import { useDictation } from "./hooks/useDictation";
import VideoOverlay from "./components/VideoOverlay";
import VoiceCaptionsOverlay from "./components/VoiceCaptionsOverlay";

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
  source: 'text' | 'voice';
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
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [showAttachMsg, setShowAttachMsg] = useState(false);
  const [voiceChatEntries, setVoiceChatEntries] = useState<CaptionEntry[]>([]);
  const [callStartTime, setCallStartTime]       = useState(0);
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const convIdRef = useRef<string | null>(null);
  const persistedVoiceIdsRef = useRef<Set<string>>(new Set());
  const seenVoiceEntryIdsRef = useRef<Set<string>>(new Set());
  const channelCleanupRef    = useRef<(() => void) | null>(null);

  // Mode deferred until acceptance (receiver doesn't know mode from DB schema)
  const pendingCallModeRef = useRef<'voice' | 'video'>('voice');
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const callHandlerInFlightRef = useRef(false);

  const webrtc = useWebRTC(conversationId, user?.language_primary ?? "es", otherLang, voiceEnabled);
  const signaling = useCallSignaling(conversationId, user?.id ?? null);
  const ring = useRingTone();

  // Derived call state — single source of truth is signaling
  const isRinging      = signaling.callStatus === 'ringing';
  const isIncoming     = signaling.callStatus === 'incoming';
  const isInCall       = signaling.callStatus === 'accepted';
  const voiceActive    = isRinging || isInCall;
  const isIncomingVideo = isIncoming && signaling.incomingCall?.mode === 'video';
  // Show voice controls whenever there is an active call, regardless of video state or webrtc timing
  const showVoiceControls = isInCall || webrtc.connected || webrtc.hasRemote || videoActive;

  // Auto-enable voice when a call becomes active — user should not need to tap Escuchar.
  // Auto-enable voice state when call becomes active.
  // unlockAudio() is NOT called here — useEffect is async and not a user gesture,
  // so iOS Safari would abort the play(). Unlock happens in handlePhoneButton instead.
  useEffect(() => {
    if (showVoiceControls) {
      setVoiceEnabled(true);
    }
  }, [showVoiceControls]);

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
      router.push(`/onboarding?redirect=${encodeURIComponent(window.location.href)}`);
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT" || !session) {
        hasRedirected.current = true;
        localStorage.removeItem("spabla_user");
        router.push("/onboarding");
      }
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return;
      if (!session) {
        hasRedirected.current = true;
        router.push("/onboarding");
        return;
      }

      const sessionUserId = session.user.id;
      const localUser = JSON.parse(stored) as User;
      console.log("[AUTH] SESSION_USER", sessionUserId);
      console.log("[AUTH] LOCAL_USER", localUser?.id ?? "null");

      let u: User = localUser;
      if (localUser?.id !== sessionUserId) {
        const { data: dbUser } = await supabase
          .from("users")
          .select("*")
          .eq("id", sessionUserId)
          .single();
        if (!dbUser) {
          hasRedirected.current = true;
          router.push("/onboarding");
          return;
        }
        localStorage.setItem("spabla_user", JSON.stringify(dbUser));
        u = dbUser as User;
        console.log("[AUTH] USER_MISMATCH_FIXED", { stale: localUser?.id, real: sessionUserId });
      }

      if (cancelled) return;
      setUser(u);
      initConversation(u);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      if (pollingRef.current) clearInterval(pollingRef.current);
      channelCleanupRef.current?.();
    };
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, voiceChatEntries]);

  // Accumulate caption finals and persist remote entries (receptor inserta, sin doble traducción)
  useEffect(() => {
    if (webrtc.captionsHistory.length === 0) return;

    // Calculate outside setState so toInsert is reliable regardless of React batching
    const newEntries = webrtc.captionsHistory.filter(e => !seenVoiceEntryIdsRef.current.has(e.id));
    if (newEntries.length === 0) return;

    newEntries.forEach(e => seenVoiceEntryIdsRef.current.add(e.id));
    setVoiceChatEntries(prev => [...prev, ...newEntries]);

    const toInsert = newEntries.filter(e => e.speaker === "remote" && !persistedVoiceIdsRef.current.has(e.id));

    if (toInsert.length && conversationId && user) {
      toInsert.forEach(async (entry) => {
        if (persistedVoiceIdsRef.current.has(entry.id)) return;
        // Lazy-resolve: otherUserId puede ser null si este usuario abrió la conversación primero
        let senderId = otherUserId;
        if (!senderId) {
          const { data: parts } = await supabase
            .from("conversation_participants")
            .select("user_id")
            .eq("conversation_id", conversationId)
            .neq("user_id", user.id)
            .limit(1);
          senderId = parts?.[0]?.user_id ?? null;
          if (senderId) setOtherUserId(senderId);
        }
        if (!senderId) return;
        const { error } = await supabase.from("messages").insert({
          conversation_id:     conversationId,
          sender_id:           senderId,
          original_text:       entry.original,
          translated_text:     entry.text,
          original_language:   otherLang ?? "unknown",
          translated_language: user.language_primary,
          source:              "voice",
        });
        if (error) { console.error("[VOICE] persist failed, will retry:", error.message); return; }
        persistedVoiceIdsRef.current.add(entry.id);
      });
    }
  }, [webrtc.captionsHistory, conversationId, user, otherUserId, otherLang]);

  // Manage voice entries across call lifecycle
  const prevIsInCallRef = useRef(false);
  useEffect(() => {
    if (!prevIsInCallRef.current && isInCall) {
      // New call starting: snapshot the start time and reset live entries.
      // callStartTime is used by combinedTimeline to exclude DB voice records
      // from this session (they're already in voiceChatEntries with correct alignment).
      setCallStartTime(Date.now());
      setVoiceChatEntries([]);
      seenVoiceEntryIdsRef.current = new Set();
    }
    if (prevIsInCallRef.current && !isInCall) {
      // Call ended: keep voiceChatEntries so alignment (entry.speaker) is preserved.
      // DB voice records from this session are filtered out in combinedTimeline.
      loadMessages();
    }
    prevIsInCallRef.current = isInCall;
  }, [isInCall, loadMessages]);

  // Remote audio for voice calls — assign stream when it arrives
  useEffect(() => {
    if (!remoteAudioRef.current || !webrtc.remoteStream) return;
    remoteAudioRef.current.srcObject = webrtc.remoteStream;
    remoteAudioRef.current.play().catch(() => {});
  }, [webrtc.remoteStream]);

  // Ring tones + WebRTC trigger on signaling state transitions
  useEffect(() => {
    const status = signaling.callStatus;
    if (status === 'ringing') {
      ring.startRingback();
    } else if (status === 'incoming') {
      ring.startRingtone();
    } else if (status === 'accepted') {
      console.log("[CALL][ACCEPTED] triggering WebRTC startCall", {
        conversationId,
        userId: user?.id,
        mode: pendingCallModeRef.current,
        callStatus: signaling.callStatus,
        outgoingCallId: signaling.outgoingCallId,
        incomingCall: signaling.incomingCall?.id,
      });
      ring.stop();
      webrtc.startCall(pendingCallModeRef.current);
      if (pendingCallModeRef.current === 'video') {
        setVideoActive(true);
      }
    } else {
      ring.stop();
      setVideoActive(false);
      setVideoExpanded(false);
      // rejected / missed / cancelled / ended → tear down WebRTC if it was up
      // idle means no call was active, skip endCall to avoid spurious teardown
      if (status !== 'idle') {
        webrtc.endCall();
      }
    }
  // ring/webrtc refs are stable — only re-run on callStatus change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signaling.callStatus]);

  // WebRTC ended externally (remote disconnected) → clean up signaling too
  useEffect(() => {
    if (webrtc.callEndedSignal === 0) return;
    const sigId = signaling.outgoingCallId ?? signaling.incomingCall?.id ?? null;
    if (sigId && signaling.callStatus === 'accepted') signaling.endCall(sigId);
    setVideoActive(false);
    setVideoExpanded(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webrtc.callEndedSignal]);

  useEffect(() => {
    console.log("[PAGE] videoUpgradeSignal changed:", webrtc.videoUpgradeSignal);
    if (webrtc.videoUpgradeSignal === 0) return;
    console.log("[PAGE] setVideoActive true from upgrade");
    setVideoActive(true);
  }, [webrtc.videoUpgradeSignal]);

  useEffect(() => {
    console.log("[PAGE] videoActive changed:", videoActive);
  }, [videoActive]);

  useEffect(() => {
    const vt = webrtc.remoteStream?.getVideoTracks().length ?? 0;
    const at = webrtc.remoteStream?.getAudioTracks().length ?? 0;
    console.log(`[PAGE] remoteStream changed; videoTracks: ${vt}; audioTracks: ${at}`);
  }, [webrtc.remoteStream]);

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
    setVoiceChatEntries([]);
    setOtherUserId(null);
    persistedVoiceIdsRef.current = new Set();
    seenVoiceEntryIdsRef.current = new Set();
    await loadMessages();
    const { data: participants } = await supabase
      .from("conversation_participants").select("user_id")
      .eq("conversation_id", convId).neq("user_id", u.id);
    if (participants?.length) {
      const { data: otherUsers } = await supabase
        .from("users").select("id, language_primary")
        .in("id", participants.map((p: { user_id: string }) => p.user_id))
        .neq("language_primary", u.language_primary).limit(1);
      if (otherUsers?.[0]) {
        setOtherLang(otherUsers[0].language_primary);
        setOtherUserId(otherUsers[0].id);
      }
    }
    const channel = supabase.channel(`messages:${convId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${convId}` },
        (payload) => setMessages(prev => [...prev, payload.new as Message]))
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") startPolling();
        if (status === "SUBSCRIBED") stopPolling();
      });
    const cleanup = () => { supabase.removeChannel(channel); };
    channelCleanupRef.current = cleanup;
    return cleanup;
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
    console.log("[TR] from/to/text:", from, "→", to, "|", text);
    if (from === to || !text.trim()) return text;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      console.log("[TR] token exists:", !!session?.access_token);
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
      console.log("[TR] HTTP status:", res.status);
      if (!res.ok) return text;
      const data = await res.json();
      console.log("[TR] response body:", data);
      return data.translation || text;
    } catch (e) { console.error("[TR] catch error:", e); return text; }
  };

  const sendMessage = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || !user || !conversationId || loading) return;
    setLoading(true);
    if (!textOverride) setInput("");
    let translated = text;
    let translatedLanguage = user.language_primary;
    console.log("[SM] user language:", user.language_primary);
    try {
      const { data: participants } = await supabase
        .from("conversation_participants").select("user_id")
        .eq("conversation_id", conversationId).neq("user_id", user.id);
      const uniqueOtherIds = [...new Set((participants || []).map((p: { user_id: string }) => p.user_id))];
      if (uniqueOtherIds.length > 0) {
        const { data: otherUsers } = await supabase
          .from("users").select("id, language_primary")
          .in("id", uniqueOtherIds).neq("language_primary", user.language_primary).limit(1);
        console.log("[SM] other users:", otherUsers);
        const otherUser = otherUsers?.[0];
        if (otherUser?.language_primary) {
          translatedLanguage = otherUser.language_primary;
          console.log("[SM] before translate:", { text, from: user.language_primary, to: otherUser.language_primary });
          translated = await translate(text, user.language_primary, otherUser.language_primary);
          console.log("[SM] after translate:", translated);
          setOtherLang(otherUser.language_primary);
          if (otherUser.id && !otherUserId) setOtherUserId(otherUser.id);
        }
      }
    } catch {}
    try {
      console.log("[SM] insert payload:", { original_text: text, translated_text: translated, original_language: user.language_primary, translated_language: translatedLanguage });
      await supabase.from("messages").insert({
        conversation_id: conversationId, sender_id: user.id,
        original_text: text, translated_text: translated,
        original_language: user.language_primary, translated_language: translatedLanguage,
      });
      if (pollingRef.current) await loadMessages();
    } finally {
      setLoading(false);
    }
  };

  // Always-current ref: lets queue effects call the latest sendMessage without stale closure
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  // Voice queue: holds transcripts that arrived while sendMessage was loading
  const voiceQueueRef = useRef<string[]>([]);

  // Drain one queued transcript each time loading completes
  useEffect(() => {
    if (loading || voiceQueueRef.current.length === 0) return;
    sendMessageRef.current(voiceQueueRef.current.shift());
  }, [loading]);

  // Enqueue callback passed to the hook — serializes voice messages, ignores loading state
  const enqueueTranscript = useCallback((text: string) => {
    const q = voiceQueueRef.current;
    if (q.length > 0 && q[q.length - 1] === text) return; // dedupe last queued item
    if (!loading) {
      sendMessageRef.current(text); // idle: send immediately
    } else {
      q.push(text); // busy: queue for later
    }
  }, [loading]);

  useVoiceTranscription(
    signaling.callStatus,
    webrtc.localStream,
    user?.language_primary ?? "es",
    enqueueTranscript
  );

  const dictation = useDictation(
    signaling.callStatus,
    user?.language_primary ?? "es",
    enqueueTranscript
  );

  const shareLink = () => { navigator.clipboard.writeText(window.location.href); alert("Link copiado."); };

  // ── Call handlers ─────────────────────────────────────────────────────────

  const handlePhoneButton = async () => {
    if (callHandlerInFlightRef.current) return;
    // Unlock TTS audio context synchronously inside the user gesture,
    // before any await — iOS Safari requires this before getUserMedia activates
    // the audio session in record mode.
    unlockAudio();
    ring.prepare();
    callHandlerInFlightRef.current = true;
    try {
      const status = signaling.callStatus;
      if (status === 'idle') {
        // Initiate outgoing voice call — no getUserMedia yet
        pendingCallModeRef.current = 'voice';
        await signaling.initiateCall();
      } else if (status === 'ringing' && signaling.outgoingCallId) {
        // Cancel while still ringing
        await signaling.cancelCall(signaling.outgoingCallId);
      } else if (status === 'incoming' && signaling.incomingCall) {
        // Accept incoming call — WebRTC starts via callStatus effect
        pendingCallModeRef.current = signaling.incomingCall.mode ?? 'voice';
        await signaling.acceptCall(signaling.incomingCall.id);
      } else if (status === 'accepted') {
        // Hang up active call
        const sigId = signaling.outgoingCallId ?? signaling.incomingCall?.id;
        if (sigId) await signaling.endCall(sigId);
        webrtc.endCall();
      }
    } finally {
      callHandlerInFlightRef.current = false;
    }
  };

  const handleDeclineButton = async () => {
    if (signaling.callStatus === 'incoming' && signaling.incomingCall) {
      await signaling.rejectCall(signaling.incomingCall.id);
    }
  };

  const startVideo = async () => {
    unlockAudio();
    ring.prepare();
    pendingCallModeRef.current = 'video';
    await signaling.initiateCall('video');
  };
  const stopVideo  = () => { webrtc.endCall(); setVideoActive(false); setVideoExpanded(false); };

  const handleCameraButton = async () => {
    if (isIncomingVideo && signaling.incomingCall) {
      unlockAudio();
      ring.prepare();
      pendingCallModeRef.current = 'video';
      await signaling.acceptCall(signaling.incomingCall.id);
    } else if (videoActive) {
      stopVideo();
    } else if (isInCall) {
      unlockAudio();
      const result = await webrtc.upgradeToVideo();
      if (result === 'ok') setVideoActive(true);
    } else {
      await startVideo();
    }
  };

  // Combined timeline — messages from DB and live voice captions sorted by timestamp
  const combinedTimeline = useMemo(() => [
    ...messages
      .filter(msg => {
        // Hide DB voice records while in call (voiceChatEntries covers them live)
        if (isInCall && msg.source === 'voice') return false;
        // Hide DB voice records from the current session after hang-up:
        // they are already in voiceChatEntries with correct speaker alignment.
        // Only show DB voice records older than when this call session started.
        if (msg.source === 'voice' && callStartTime > 0) {
          return new Date(msg.created_at).getTime() < callStartTime;
        }
        return true;
      })
      .map(msg => ({
        kind: "msg" as const,
        ts:   new Date(msg.created_at).getTime(),
        payload: msg,
      })),
    ...voiceChatEntries.map(e => ({
      kind: "voice" as const,
      ts:   Number(e.id),
      payload: e,
    })),
  ].sort((a, b) => a.ts - b.ts), [messages, voiceChatEntries, isInCall, callStartTime]);

  if (!user) return null;
  const myLang   = LANGUAGES[user.language_primary] ?? { flag: "🌐", name: user.language_primary };
  const theirLang = otherLang ? (LANGUAGES[otherLang] ?? { flag: "🌐", name: otherLang }) : null;

  return (
    <>
      <style>{`
        @keyframes msgIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        @keyframes phonePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(65,255,157,0.5); }
          50% { box-shadow: 0 0 0 9px rgba(65,255,157,0); }
        }
        @keyframes micPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(232,22,46,0.6); }
          50% { box-shadow: 0 0 0 7px rgba(232,22,46,0); }
        }
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
              {/* Llamada de voz — estado visual según signaling */}
              <button
                className="action-btn"
                onClick={handlePhoneButton}
                title={voiceActive ? "Colgar" : isIncoming ? "Aceptar llamada" : "Llamar"}
                style={{
                  width: 38, height: 38, borderRadius: "50%",
                  background: voiceActive
                    ? "rgba(232,22,46,0.85)"
                    : (isIncoming && !isIncomingVideo)
                    ? "rgba(65,255,157,0.18)"
                    : "rgba(62,198,198,0.12)",
                  border: `1px solid ${
                    voiceActive ? "rgba(232,22,46,0.6)"
                    : (isIncoming && !isIncomingVideo) ? "rgba(65,255,157,0.5)"
                    : "rgba(62,198,198,0.22)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                  transition: "background .2s, border .2s, transform .12s",
                  animation: (isIncoming && !isIncomingVideo) ? "phonePulse 1s ease-in-out infinite" : undefined,
                }}
              >
                {voiceActive ? (
                  /* Icono colgar */
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.42 19.42 0 01-3.33-2.67m-2.67-3.34a19.79 19.79 0 01-3.07-8.63A2 2 0 014.11 2H7a2 2 0 011.72 1.24c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L7.7 9.41"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : isIncoming ? (
                  /* Icono aceptar — verde */
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#41ff9d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013 4.18 2 2 0 015 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L9.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
                  </svg>
                ) : (
                  /* Icono llamar — cyan */
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3ec6c6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013 4.18 2 2 0 015 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L9.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
                  </svg>
                )}
              </button>

              {/* Videollamada */}
              <button className="action-btn" onClick={handleCameraButton} title={videoActive ? "Colgar vídeo" : isIncomingVideo ? "Aceptar videollamada" : "Videollamada"} style={{
                width: 38, height: 38, borderRadius: "50%",
                background: videoActive
                  ? "rgba(232,22,46,0.85)"
                  : isIncomingVideo
                  ? "rgba(65,255,157,0.18)"
                  : "rgba(62,198,198,0.12)",
                border: `1px solid ${
                  videoActive ? "rgba(232,22,46,0.6)"
                  : isIncomingVideo ? "rgba(65,255,157,0.5)"
                  : "rgba(62,198,198,0.22)"}`,
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                transition: "background .2s, border .2s, transform .12s",
                animation: isIncomingVideo ? "phonePulse 1s ease-in-out infinite" : undefined,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={videoActive || isIncomingVideo ? "#fff" : "#3ec6c6"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

          {/* Pastilla de estado de llamada */}
          {(voiceActive || isIncoming || showVoiceControls) && (
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "4px 10px", marginBottom: 8, borderRadius: 20,
              background: isIncoming ? "rgba(65,255,157,0.08)" : "rgba(232,22,46,0.12)",
              border: `1px solid ${isIncoming ? "rgba(65,255,157,0.25)" : "rgba(232,22,46,0.3)"}`,
              alignSelf: "flex-start",
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: isIncoming ? "#41ff9d" : "#e8162e",
                display: "block",
                boxShadow: `0 0 6px ${isIncoming ? "#41ff9d" : "#e8162e"}`,
              }}/>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", fontWeight: 600, letterSpacing: "0.04em" }}>
                {isIncoming
                  ? (signaling.incomingCall?.mode === "video" ? "VIDEOLLAMADA ENTRANTE" : "LLAMADA ENTRANTE")
                  : isInCall && webrtc.hasRemote
                  ? "EN LLAMADA"
                  : "LLAMANDO…"}
              </span>
              {isIncoming && (
                <button
                  onClick={handleDeclineButton}
                  style={{
                    marginLeft: 4,
                    background: "rgba(232,22,46,0.22)",
                    border: "1px solid rgba(232,22,46,0.4)",
                    borderRadius: 10, padding: "2px 8px",
                    fontSize: 10, color: "rgba(255,255,255,0.75)",
                    cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
                  }}
                >
                  Rechazar
                </button>
              )}
              {showVoiceControls && (
                <button
                  onClick={() => {
                    const next = !voiceEnabled;
                    setVoiceEnabled(next);
                    // Unlock HTMLAudioElement on iOS: play() must be called synchronously
                    // inside a user gesture before async play() calls are allowed.
                    if (next) unlockAudio();
                  }}
                  title={voiceEnabled ? "Silenciar traducción" : "Escuchar traducción"}
                  style={{
                    marginLeft: 4, display: "flex", alignItems: "center", gap: 4,
                    background: voiceEnabled ? "rgba(62,198,198,0.18)" : "rgba(255,255,255,0.08)",
                    border: `1px solid ${voiceEnabled ? "rgba(62,198,198,0.5)" : "rgba(255,255,255,0.18)"}`,
                    borderRadius: 10, padding: "2px 8px",
                    fontSize: 10, color: voiceEnabled ? "#3ec6c6" : "rgba(255,255,255,0.65)",
                    cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
                    transition: "background .15s, border .15s, color .15s",
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                    stroke={voiceEnabled ? "#3ec6c6" : "rgba(255,255,255,0.65)"}
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                    {voiceEnabled
                      ? <><path d="M19.07 4.93a10 10 0 010 14.14"/><path d="M15.54 8.46a5 5 0 010 7.07"/></>
                      : <line x1="23" y1="9" x2="17" y2="15"/>}
                  </svg>
                  Escuchar
                </button>
              )}
              {showVoiceControls && (
                <button
                  onClick={webrtc.toggleMic}
                  title={webrtc.micOn ? "Silenciar micrófono" : "Activar micrófono"}
                  style={{
                    marginLeft: 4, display: "flex", alignItems: "center", gap: 4,
                    background: webrtc.micOn ? "rgba(255,255,255,0.08)" : "rgba(232,22,46,0.22)",
                    border: `1px solid ${webrtc.micOn ? "rgba(255,255,255,0.18)" : "rgba(232,22,46,0.5)"}`,
                    borderRadius: 10, padding: "2px 8px",
                    fontSize: 10, color: webrtc.micOn ? "rgba(255,255,255,0.65)" : "#ff6b7a",
                    cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
                    transition: "background .15s, border .15s, color .15s",
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                    stroke={webrtc.micOn ? "rgba(255,255,255,0.65)" : "#ff6b7a"}
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {webrtc.micOn
                      ? <><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0014 0M12 19v3M9 22h6"/></>
                      : <><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/><path d="M17 16.95A7 7 0 015 10v-1m14 0v1a7 7 0 01-.11 1.23M12 19v3M9 22h6"/></>}
                  </svg>
                  {webrtc.micOn ? "Mic" : "Muted"}
                </button>
              )}
            </div>
          )}

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
          {combinedTimeline.length === 0 && (
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

          {/* Timeline — mensajes DB y subtítulos de voz en vivo ordenados por timestamp */}
          {combinedTimeline.map(item => {
            if (item.kind === "msg") {
              const msg = item.payload;

              if (msg.source === 'voice') {
                const isLocal     = msg.sender_id === user.id;
                const showOrig    = msg.original_text !== msg.translated_text;
                const displayText = isLocal ? msg.original_text : (msg.translated_text || msg.original_text);
                const secondary   = isLocal ? msg.translated_text : msg.original_text;
                return (
                  <div key={`vm-${msg.id}`} className="msg" style={{ display: "flex", justifyContent: isLocal ? "flex-end" : "flex-start" }}>
                    <div style={{ maxWidth: "80%" }}>
                      <div style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 3,
                        color:        isLocal ? "rgba(62,198,198,0.6)"  : "rgba(232,82,74,0.6)",
                        textAlign:    isLocal ? "right" : "left",
                        paddingRight: isLocal ? 4 : 0,
                        paddingLeft:  isLocal ? 0 : 4,
                      }}>VOZ</div>
                      <div style={{
                        background:           isLocal ? "rgba(62,198,198,0.10)"  : "rgba(232,82,74,0.07)",
                        border:               `1px solid ${isLocal ? "rgba(62,198,198,0.22)" : "rgba(232,82,74,0.18)"}`,
                        borderRadius:         isLocal ? "20px 20px 5px 20px" : "5px 20px 20px 20px",
                        padding:              "11px 15px",
                        backdropFilter:       "blur(12px)",
                        WebkitBackdropFilter: "blur(12px)",
                      }}>
                        <p style={{ color: "#fff", fontSize: 15, margin: 0, lineHeight: 1.55, fontWeight: 450 }}>{displayText}</p>
                        {showOrig && (
                          <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, margin: 0, lineHeight: 1.45, fontStyle: "italic" }}>{secondary}</p>
                          </div>
                        )}
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.32)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{fmtTime(msg.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              const isMe = msg.sender_id === user.id;
              const displayText = isMe
                ? msg.original_text
                : (msg.translated_language === user.language_primary ? (msg.translated_text || msg.original_text) : msg.original_text);
              const wasTranslated = !isMe && msg.original_text !== displayText;
              const fromLang = LANGUAGES[msg.original_language];
              return (
                <div key={`t-${msg.id}`} className="msg" style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
                  <div style={{ maxWidth: "80%" }}>
                    {isMe ? (
                      <div style={{
                        background: "linear-gradient(135deg, #1c7a7a 0%, #3ec6c6 100%)",
                        borderRadius: "20px 20px 5px 20px",
                        padding: "11px 15px",
                        boxShadow: "0 3px 16px rgba(62,198,198,0.18)",
                      }}>
                        <p style={{ color: "#fff", fontSize: 15, margin: 0, lineHeight: 1.55, fontWeight: 450 }}>{displayText}</p>
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.32)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{fmtTime(msg.created_at)}</span>
                        </div>
                      </div>
                    ) : (
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
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.32)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{fmtTime(msg.created_at)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            const entry   = item.payload;
            const isLocal = entry.speaker === "local";
            const showOrig = !!entry.original && entry.original !== entry.text;
            return (
              <div key={`v-${entry.id}`} className="msg" style={{ display: "flex", justifyContent: isLocal ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "80%" }}>
                  <div style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 3,
                    color:        isLocal ? "rgba(62,198,198,0.6)"  : "rgba(232,82,74,0.6)",
                    textAlign:    isLocal ? "right" : "left",
                    paddingRight: isLocal ? 4 : 0,
                    paddingLeft:  isLocal ? 0 : 4,
                  }}>VOZ</div>
                  <div style={{
                    background:           isLocal ? "rgba(62,198,198,0.10)"  : "rgba(232,82,74,0.07)",
                    border:               `1px solid ${isLocal ? "rgba(62,198,198,0.22)" : "rgba(232,82,74,0.18)"}`,
                    borderRadius:         isLocal ? "20px 20px 5px 20px" : "5px 20px 20px 20px",
                    padding:              "11px 15px",
                    backdropFilter:       "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                  }}>
                    <p style={{ color: "#fff", fontSize: 15, margin: 0, lineHeight: 1.55, fontWeight: 450 }}>
                      {entry.text}
                    </p>
                    {showOrig && (
                      <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, margin: 0, lineHeight: 1.45, fontStyle: "italic" }}>
                          {entry.original}
                        </p>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.32)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{fmtTime(Number(entry.id))}</span>
                    </div>
                  </div>
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
          <div style={{ display: "flex", gap: 8, alignItems: "center", position: "relative" }}>
            {showAttachMsg && (
              <div style={{
                position: "absolute", bottom: 52, left: 0,
                background: "rgba(13,19,34,0.97)", border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 10, padding: "8px 14px", whiteSpace: "nowrap", zIndex: 10,
                fontSize: 12, color: "rgba(255,255,255,0.7)", boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
              }}>
                Próximamente: envío de imágenes, documentos y archivos.
              </div>
            )}
            <button
              onClick={() => { setShowAttachMsg(v => !v); setTimeout(() => setShowAttachMsg(false), 3000); }}
              style={{
                width: 40, height: 40, borderRadius: "50%",
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)",
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>
            {dictation.isSupported && (
              <button
                onMouseDown={dictation.startDictation}
                onMouseUp={dictation.stopDictation}
                onMouseLeave={dictation.stopDictation}
                onTouchStart={(e) => { e.preventDefault(); dictation.startDictation(); }}
                onTouchEnd={dictation.stopDictation}
                onTouchCancel={dictation.stopDictation}
                onContextMenu={(e) => e.preventDefault()}
                disabled={signaling.callStatus !== "idle"}
                title={dictation.isDictating ? "Escuchando…" : "Mantén para dictar"}
                style={{
                  width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                  background: dictation.isDictating
                    ? "rgba(232,22,46,0.85)"
                    : "rgba(255,255,255,0.06)",
                  border: `1px solid ${dictation.isDictating ? "rgba(232,22,46,0.6)" : "rgba(255,255,255,0.09)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: signaling.callStatus !== "idle" ? "not-allowed" : "pointer",
                  opacity: signaling.callStatus !== "idle" ? 0.35 : 1,
                  transition: "background .15s, border .15s",
                  animation: dictation.isDictating ? "micPulse 1s ease-in-out infinite" : undefined,
                  userSelect: "none",
                  WebkitUserSelect: "none",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke={dictation.isDictating ? "#fff" : "rgba(255,255,255,0.45)"}
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="22"/>
                  <line x1="8" y1="22" x2="16" y2="22"/>
                </svg>
              </button>
            )}
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
              onClick={() => sendMessage()}
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

        {/* Audio remoto para llamadas de voz */}
        <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: "none" }} />

        {/* ── VOICE CAPTIONS (solo voz, sin video) ── */}
        {isInCall && !videoActive && (
          <VoiceCaptionsOverlay localCaption={webrtc.localCaption} />
        )}

        {/* ── VIDEO OVERLAY ── */}
        {videoActive && (
          <VideoOverlay
            webrtc={webrtc}
            onClose={stopVideo}
            expanded={videoExpanded}
            onToggleExpand={() => setVideoExpanded(e => !e)}
            voiceEnabled={voiceEnabled}
            onToggleVoice={() => setVoiceEnabled(e => !e)}
          />
        )}
      </div>
    </>
  );
}

function fmtTime(ts: string | number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
