"use client";

/**
 * SPABLA V2 — Fase 9 · Hito 9.1 · Visible bilingual chat.
 *
 * Minimal UI that proves the end-to-end translated conversation loop:
 *   sign-in → send in language X → other session sees translation in Y.
 *
 * The client never sees service_role material. All writes and reads
 * flow through `/api/v2/*` which run the server-side composition
 * (JWT + TenantContext + PersistencePort).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

import { createPollingRunner } from "@engine/utils/polling";
import { initialLanguagesFor } from "@engine/utils/initial-languages";
import {
  classifyPollingResponse,
  SESSION_EXPIRED_MESSAGE,
} from "@engine/utils/polling-response-classifier";
import { isLangCode, type LangCode } from "@engine/types/language";

// Hito 9.2.1 · Shell corporativo SPABLA (cabecera + envoltura).
import { AppHeader } from "./components/AppHeader";
import { ChatPageFrame } from "./components/ChatPageFrame";

// Hito 9.2.2 · Interfaz real de conversación.
// Componentes presentacionales que reciben datos + callbacks por props.
// El timeline de mensajes y su estado vacío permanecen inline en
// `page.tsx` (bajo el return) para preservar los contratos LANG13-03
// (`<span lang={m.originalLanguage} dir="auto">{m.originalText}</span>`
// y su análogo para la traducción) locked en `engine/src/utils/
// chat-message-semantics.test.ts`. La lógica productiva (auth, seed,
// polling, envío, traducción) permanece en este mismo `page.tsx` sin
// cambios semánticos.
import { ConversationHeader } from "./components/ConversationHeader";
import { LanguageControls } from "./components/LanguageControls";
import { MessageComposer } from "./components/MessageComposer";
import { SessionArea } from "./components/SessionArea";
import { DeveloperPanel } from "./components/DeveloperPanel";

type Message = {
  readonly messageId: string;
  readonly senderId: string;
  readonly originalText: string;
  readonly originalLanguage: string;
  readonly targetLanguage: string;
  readonly translation: string | null;
  readonly translationError: string | null;
  readonly translationPassthrough: boolean;
  readonly createdAt: string;
};

type SeedResponse = {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly actorA: { readonly actorId: string; readonly email: string; readonly password: string; readonly language: "es" | "en" };
  readonly actorB: { readonly actorId: string; readonly email: string; readonly password: string; readonly language: "es" | "en" };
};

// LANG13-02 · Activación de 13 idiomas en el selector del chat.
// Orden de producto obligatorio fijado por Plan V1.1 §14 (APROBADO Y
// CONGELADO). NO reordenar alfabéticamente. Etiquetas visibles en la
// lengua propia de cada idioma (§8, regla de coherencia 1).
const LANGUAGE_OPTIONS: ReadonlyArray<{ readonly code: string; readonly label: string }> = [
  { code: "es", label: "Español" },
  { code: "ca", label: "Català" },
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
  { code: "zh", label: "中文（简体）" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "ar", label: "العربية" },
  { code: "hi", label: "हिन्दी" },
  { code: "ru", label: "Русский" },
];

// Hito 9.2.2 · Etiqueta humana para un código ISO — se usa en la
// cabecera de conversación y en el placeholder del compositor para no
// exponer códigos técnicos en la interfaz visible. Fallback al código
// en mayúsculas si el idioma no está en `LANGUAGE_OPTIONS` (esta rama
// no debería alcanzarse dado el guard `isLangCode` río arriba).
function labelOf(code: string): string {
  return LANGUAGE_OPTIONS.find((l) => l.code === code)?.label ?? code.toUpperCase();
}

const POLL_INTERVAL_MS = 1500;

function useSupabaseClient(): SupabaseClient | null {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    const c = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "spabla_v2_fase9_auth" },
    });
    setClient(c);
  }, []);
  return client;
}

function randomMessageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback deterministic-ish only for pathological runtimes.
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Hito 9.2.2 · Formato compacto de hora HH:MM para las burbujas.
function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

// Hito 9.2.2 · Mapa código → texto humano para errores de polling.
function humanizePollError(code: string): string {
  if (code === "poll_network") return "Sin conexión. Reintentaremos automáticamente.";
  return "Hemos tenido un problema para leer los mensajes. Reintentaremos.";
}

// Hito 9.2.2 · Mapa código → texto humano para razones del proveedor
// (LANG13-06 dejó el bloqueo `provider_budget_exhausted` clasificado
// como `provider_error` genérico; aquí lo diferenciamos si llegase).
function humanizeTranslationError(code: string | null): string {
  switch (code) {
    case "provider_unavailable":
      return "El servicio de traducción no responde. Reintentaremos.";
    case "empty":
      return "El mensaje está vacío.";
    case "too_long":
      return "El mensaje es demasiado largo para traducirse.";
    case "provider_error":
    default:
      return "No pudimos traducir este mensaje.";
  }
}

export default function VisibleConversationPage() {
  const supabase = useSupabaseClient();
  const [session, setSession] = useState<Session | null>(null);
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [signInError, setSignInError] = useState<string | null>(null);
  const [signInBusy, setSignInBusy] = useState(false);

  const [seed, setSeed] = useState<SeedResponse | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [seedBusy, setSeedBusy] = useState(false);

  const [tenantId, setTenantId] = useState<string>("");
  const [conversationId, setConversationId] = useState<string>("");
  // D1: both default to the same language; `initialLanguagesFor` overrides
  // them to the seeded actor's language when a session is recognised.
  const [myLanguage, setMyLanguage] = useState<LangCode>("es");
  const [targetLanguage, setTargetLanguage] = useState<LangCode>("es");

  const [messages, setMessages] = useState<ReadonlyArray<Message>>([]);
  const [pollError, setPollError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);
  // Immediate short-circuit for in-flight polling ticks that started
  // before the runner cleanup fired. Once true, `fetchMessages`
  // returns early and never re-uses the invalid token.
  const sessionExpiredRef = useRef<boolean>(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Restore any previously seeded context so both browsers stay aligned.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("spabla_v2_fase9_seed");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as SeedResponse;
      setSeed(parsed);
      setTenantId(parsed.tenantId);
      setConversationId(parsed.conversationId);
    } catch {
      // ignore corrupt cache
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s));
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  // Reset per-session view state whenever the authenticated user changes
  // (including sign-out → sign-in-as-different-actor). Prevents a stale
  // "unauthorized" banner from surviving a fresh session.
  const sessionUserId = session?.user.id ?? null;
  useEffect(() => {
    setMessages([]);
    setPollError(null);
    setSendError(null);
    if (sessionUserId !== null) {
      // A fresh, valid session invalidates any prior expiry notice and
      // re-arms the polling loop.
      sessionExpiredRef.current = false;
      setSessionExpired(false);
    }
  }, [sessionUserId]);

  // D1 fix (Hito 9.1.1): apply the seeded default (myLanguage === targetLanguage)
  // ONCE per actor change. A manual selection made during the session survives
  // subsequent effect re-runs; only signing out or switching actor re-arms the
  // default. Reloading the page with the same actor still re-arms because a
  // fresh mount starts with `lastSeenActorRef.current = null`.
  const lastSeenActorRef = useRef<string | null>(null);
  useEffect(() => {
    if (!session || !seed) return;
    const currentActor = session.user.id;
    if (lastSeenActorRef.current === currentActor) return;
    const pair = initialLanguagesFor(currentActor, seed);
    if (pair === null) return;
    lastSeenActorRef.current = currentActor;
    setMyLanguage(pair.myLanguage);
    setTargetLanguage(pair.targetLanguage);
  }, [session, seed]);

  const onMyLanguageChange = useCallback((next: string) => {
    if (!isLangCode(next)) return;
    setMyLanguage(next);
  }, []);
  const onTargetLanguageChange = useCallback((next: string) => {
    if (!isLangCode(next)) return;
    setTargetLanguage(next);
  }, []);

  const canOperate = useMemo(
    () => Boolean(session && tenantId && conversationId && targetLanguage),
    [session, tenantId, conversationId, targetLanguage],
  );

  const fetchMessages = useCallback(async () => {
    if (!supabase || !session) return;
    if (sessionExpiredRef.current) return;
    const token = session.access_token;
    try {
      const res = await fetch(
        `/api/v2/messages?tenantId=${encodeURIComponent(tenantId)}&conversationId=${encodeURIComponent(conversationId)}&to=${encodeURIComponent(targetLanguage)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );
      const body = (await res.json().catch(() => ({}))) as { error?: string; items?: ReadonlyArray<Message>; actorId?: string };
      const action = classifyPollingResponse({ status: res.status }, body);
      if (action.kind === "expire") {
        // Session expiry is the ONLY case where the polling loop is
        // torn down and the user forced back to sign-in. The `ref`
        // short-circuits any in-flight tick that might still be
        // queued behind this response; setting `session = null`
        // causes `canOperate` to flip and the effect's cleanup
        // cancels the runner. Local sign-out — never global — clears
        // the invalid token from Supabase's own storage.
        sessionExpiredRef.current = true;
        setSessionExpired(true);
        setPollError(null);
        setMessages([]);
        setSession(null);
        void supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        return;
      }
      if (action.kind === "surface") {
        setPollError(action.pollError);
        return;
      }
      const items = Array.isArray(body.items) ? body.items : [];
      // Guard against a late response from an obsolete session: drop the
      // payload if the server-verified actorId no longer matches the
      // current client-side session. This complements the runner-level
      // cancellation and eliminates any residual UI flicker.
      if (body.actorId !== undefined && body.actorId !== session.user.id) {
        return;
      }
      setMessages(items);
      setPollError(null);
    } catch {
      setPollError("poll_network");
    }
  }, [supabase, session, tenantId, conversationId, targetLanguage]);

  useEffect(() => {
    if (!canOperate) return;
    // A fresh runner per effect instance owns its own cancellation flag.
    // When `fetchMessages` changes (new session, new tenant, new target
    // language) the previous runner is cancelled and CANNOT enqueue any
    // further ticks — the leaked-loop path that caused stale-JWT 401s on
    // Safari after sign-out / sign-in is closed at its root.
    const runner = createPollingRunner(fetchMessages, { intervalMs: POLL_INTERVAL_MS });
    return () => runner.cancel();
  }, [canOperate, fetchMessages]);

  const runSeed = useCallback(async () => {
    setSeedBusy(true);
    setSeedError(null);
    try {
      const res = await fetch("/api/v2/seed", { method: "POST" });
      if (!res.ok) {
        setSeedError(`seed_status_${res.status}`);
        return;
      }
      const body = (await res.json()) as SeedResponse;
      setSeed(body);
      setTenantId(body.tenantId);
      setConversationId(body.conversationId);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("spabla_v2_fase9_seed", JSON.stringify(body));
      }
    } catch {
      setSeedError("seed_network");
    } finally {
      setSeedBusy(false);
    }
  }, []);

  const signIn = useCallback(
    async (emailOverride?: string, passwordOverride?: string) => {
      if (!supabase) return;
      const email = (emailOverride ?? signInEmail).trim();
      const password = passwordOverride ?? signInPassword;
      if (!email || !password) {
        setSignInError("Email y contraseña requeridos");
        return;
      }
      setSignInBusy(true);
      setSignInError(null);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setSignInBusy(false);
      if (error) setSignInError(error.message);
    },
    [supabase, signInEmail, signInPassword],
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    // `scope: "local"` clears only THIS tab's session; other browsers
    // authenticated as the same actor are left alone. The auth listener
    // then propagates `session = null`, which triggers the state reset
    // effect and unmounts the polling runner. A manual sign-out clears
    // the expiry notice too — it is a user-initiated action, not a
    // recovery from an invalidated JWT.
    await supabase.auth.signOut({ scope: "local" });
    sessionExpiredRef.current = false;
    setSessionExpired(false);
    setSession(null);
    setMessages([]);
    setPollError(null);
    setSendError(null);
  }, [supabase]);

  const sendMessage = useCallback(async () => {
    if (!session || !draft.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch("/api/v2/messages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantId,
          conversationId,
          text: draft.trim(),
          language: myLanguage,
          clientMessageId: randomMessageId(),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setSendError(body.error ?? `send_status_${res.status}`);
        return;
      }
      setDraft("");
      await fetchMessages();
    } catch {
      setSendError("send_network");
    } finally {
      setSending(false);
    }
  }, [session, draft, tenantId, conversationId, myLanguage, fetchMessages]);

  return (
    <ChatPageFrame header={<AppHeader />}>
      <ConversationHeader
        authenticatedEmail={session?.user.email ?? null}
        myLanguageLabel={labelOf(myLanguage)}
        targetLanguageLabel={labelOf(targetLanguage)}
        onSignOut={session ? signOut : undefined}
      />

      {!session && (
        <SessionArea
          sessionExpired={sessionExpired}
          sessionExpiredMessage={SESSION_EXPIRED_MESSAGE}
          signInEmail={signInEmail}
          signInPassword={signInPassword}
          onSignInEmailChange={setSignInEmail}
          onSignInPasswordChange={setSignInPassword}
          signInError={signInError}
          signInBusy={signInBusy}
          onSignIn={() => { void signIn(); }}
        />
      )}

      {session && (
        <LanguageControls
          options={LANGUAGE_OPTIONS}
          myLanguage={myLanguage}
          targetLanguage={targetLanguage}
          onMyLanguageChange={onMyLanguageChange}
          onTargetLanguageChange={onTargetLanguageChange}
          writeCaption="Yo escribo en"
          readCaption="Leer mensajes en"
        />
      )}

      {/*
        Timeline inline · Hito 9.2.2.
        Se mantiene aquí (no en un componente hijo) para preservar los
        contratos LANG13-03 sobre los <span lang={...} dir="auto"> —
        engine/src/utils/chat-message-semantics.test.ts los localiza
        exclusivamente en este fichero.
      */}
      <section
        aria-label="Historial de mensajes"
        style={{
          marginTop: "0.75rem",
          padding: "0.75rem 1rem",
          background: "#F8FAFC",
          border: "1px solid #E2E8F0",
          borderRadius: 10,
          minHeight: 280,
          display: "flex",
          flexDirection: "column",
          gap: "0.35rem",
        }}
      >
        {pollError !== null && (
          <p
            role="status"
            style={{
              margin: "0 0 0.35rem",
              padding: "0.4rem 0.6rem",
              fontSize: "0.8rem",
              color: "#FF6B7A",
              background: "rgba(255, 107, 122, 0.08)",
              border: "1px solid #FF6B7A",
              borderRadius: 6,
            }}
          >
            {humanizePollError(pollError)}
          </p>
        )}
        {!canOperate && messages.length === 0 && (
          <p style={{ padding: "2rem 1rem", textAlign: "center", color: "#475569", fontSize: "0.9rem", margin: 0 }}>
            Inicia sesión para ver la conversación.
          </p>
        )}
        {canOperate && messages.length === 0 && (
          <div style={{ padding: "2.5rem 1rem", textAlign: "center", color: "#475569" }} aria-live="polite">
            <p style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "#0B0F19" }}>Aún no hay mensajes.</p>
            <p style={{ margin: "0.4rem 0 0", fontSize: "0.9rem", color: "#64748B" }}>
              Escribe el primero para comenzar la conversación.
            </p>
          </div>
        )}
        {messages.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.3rem", minWidth: 0 }}>
            {messages.map((m) => {
              const isOwn = m.senderId === session?.user.id;
              const showTranslation = m.translation !== null && !m.translationPassthrough;
              const hasError = m.translation === null && m.translationError !== null;
              return (
                <li
                  key={m.messageId}
                  style={{
                    display: "flex",
                    justifyContent: isOwn ? "flex-end" : "flex-start",
                    padding: "0.15rem 0",
                  }}
                  aria-label={isOwn ? "Mensaje enviado" : "Mensaje recibido"}
                >
                  <div
                    style={{
                      maxWidth: "min(560px, 82%)",
                      padding: "0.65rem 0.85rem",
                      borderRadius: 12,
                      background: isOwn ? "rgba(30, 199, 255, 0.12)" : "#FFFFFF",
                      border: isOwn ? "1px solid rgba(30, 199, 255, 0.35)" : "1px solid #E2E8F0",
                      color: "#0B0F19",
                      minWidth: 0,
                      wordBreak: "break-word",
                      overflowWrap: "anywhere",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    <div style={{ fontSize: "0.95rem", lineHeight: 1.4, color: "#0B0F19" }}>
                      <span lang={m.originalLanguage} dir="auto">{m.originalText}</span>
                    </div>
                    {showTranslation && (
                      <div style={{ marginTop: "0.4rem", paddingTop: "0.4rem", borderTop: "1px dashed #E2E8F0" }}>
                        <div style={{ fontSize: "0.88rem", lineHeight: 1.4, color: "#334155" }}>
                          <span lang={m.targetLanguage} dir="auto">{m.translation}</span>
                        </div>
                      </div>
                    )}
                    {hasError && (
                      <div style={{ marginTop: "0.4rem", fontSize: "0.8rem", color: "#FF6B7A" }} role="status">
                        {humanizeTranslationError(m.translationError)}
                      </div>
                    )}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: isOwn ? "flex-end" : "flex-start",
                        gap: "0.4rem",
                        marginTop: "0.35rem",
                        fontSize: "0.72rem",
                        color: "#64748B",
                      }}
                    >
                      <time dateTime={m.createdAt}>{formatTime(m.createdAt)}</time>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {session && (
        <MessageComposer
          draft={draft}
          onDraftChange={setDraft}
          onSend={() => { void sendMessage(); }}
          disabled={!canOperate || sending}
          sending={sending}
          sendError={sendError}
          myLanguageLabel={labelOf(myLanguage)}
          canOperate={canOperate}
        />
      )}

      <DeveloperPanel
        enabled={process.env.NODE_ENV === "development"}
        seed={seed}
        seedBusy={seedBusy}
        seedError={seedError}
        onRunSeed={() => { void runSeed(); }}
        onSignInAs={(email, password) => { void signIn(email, password); }}
        isAuthenticated={session !== null}
      />
    </ChatPageFrame>
  );
}
