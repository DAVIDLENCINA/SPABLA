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

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

import { createPollingRunner } from "@engine/utils/polling";

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

const LANGUAGE_OPTIONS: ReadonlyArray<{ readonly code: string; readonly label: string }> = [
  { code: "es", label: "Español" },
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
];

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

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
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
  const [myLanguage, setMyLanguage] = useState<string>("es");
  const [targetLanguage, setTargetLanguage] = useState<string>("en");

  const [messages, setMessages] = useState<ReadonlyArray<Message>>([]);
  const [pollError, setPollError] = useState<string | null>(null);
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
  }, [sessionUserId]);

  // When we recognise the signed-in user as one of the seeded actors, pre-select their preferred language.
  useEffect(() => {
    if (!session || !seed) return;
    if (session.user.id === seed.actorA.actorId) {
      setMyLanguage(seed.actorA.language);
      setTargetLanguage(seed.actorB.language);
    } else if (session.user.id === seed.actorB.actorId) {
      setMyLanguage(seed.actorB.language);
      setTargetLanguage(seed.actorA.language);
    }
  }, [session, seed]);

  const canOperate = useMemo(
    () => Boolean(session && tenantId && conversationId && targetLanguage),
    [session, tenantId, conversationId, targetLanguage],
  );

  const fetchMessages = useCallback(async () => {
    if (!supabase || !session) return;
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
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setPollError(body.error ?? `poll_status_${res.status}`);
        return;
      }
      const body = (await res.json()) as { items: ReadonlyArray<Message>; actorId?: string };
      // Guard against a late response from an obsolete session: drop the
      // payload if the server-verified actorId no longer matches the
      // current client-side session. This complements the runner-level
      // cancellation and eliminates any residual UI flicker.
      if (body.actorId !== undefined && body.actorId !== session.user.id) {
        return;
      }
      setMessages(body.items);
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
    // effect and unmounts the polling runner.
    await supabase.auth.signOut({ scope: "local" });
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
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "1.5rem", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "1.6rem", marginBottom: "0.25rem" }}>SPABLA V2 · Fase 9 · Chat traducido</h1>
      <p style={{ color: "#334155", fontSize: "0.9rem", marginTop: 0 }}>
        Escribe en tu idioma, tu contertulio lo verá en el suyo. Persistencia
        en <code>spabla_v2</code>, traducción vía servidor.
      </p>

      <section style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: 8, padding: "0.75rem 1rem", marginTop: "1rem" }}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Contexto</h2>
        {!seed && (
          <button onClick={runSeed} disabled={seedBusy} style={{ padding: "0.5rem 0.75rem" }}>
            {seedBusy ? "Cargando…" : "Cargar contexto de demo (crea usuarios y conversación)"}
          </button>
        )}
        {seed && (
          <div style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem", color: "#1e293b" }}>
            <div>tenant: <code>{seed.tenantId}</code></div>
            <div>conversación: <code>{seed.conversationId}</code></div>
            <div>
              actorA: <code>{seed.actorA.email}</code> · <code>{seed.actorA.password}</code> (idioma {seed.actorA.language})
            </div>
            <div>
              actorB: <code>{seed.actorB.email}</code> · <code>{seed.actorB.password}</code> (idioma {seed.actorB.language})
            </div>
            <button onClick={runSeed} disabled={seedBusy} style={{ marginTop: "0.35rem", padding: "0.35rem 0.75rem", width: "fit-content" }}>
              {seedBusy ? "Actualizando…" : "Regenerar demo"}
            </button>
          </div>
        )}
        {seedError && <p style={{ color: "#b91c1c", fontSize: "0.85rem" }}>Error de seed: {seedError}</p>}
      </section>

      <section style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: 8, padding: "0.75rem 1rem", marginTop: "1rem" }}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Sesión</h2>
        {!session && (
          <div style={{ display: "grid", gap: "0.5rem" }}>
            <input
              type="email"
              placeholder="email"
              value={signInEmail}
              onChange={(e) => setSignInEmail(e.target.value)}
              style={{ padding: "0.4rem", fontSize: "0.9rem" }}
            />
            <input
              type="password"
              placeholder="contraseña"
              value={signInPassword}
              onChange={(e) => setSignInPassword(e.target.value)}
              style={{ padding: "0.4rem", fontSize: "0.9rem" }}
            />
            <button onClick={() => signIn()} disabled={signInBusy} style={{ padding: "0.5rem" }}>
              {signInBusy ? "Entrando…" : "Iniciar sesión"}
            </button>
            {seed && (
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  onClick={() => signIn(seed.actorA.email, seed.actorA.password)}
                  disabled={signInBusy}
                  style={{ padding: "0.35rem 0.65rem" }}
                >
                  Entrar como actorA (ES)
                </button>
                <button
                  onClick={() => signIn(seed.actorB.email, seed.actorB.password)}
                  disabled={signInBusy}
                  style={{ padding: "0.35rem 0.65rem" }}
                >
                  Entrar como actorB (EN)
                </button>
              </div>
            )}
            {signInError && <p style={{ color: "#b91c1c", fontSize: "0.85rem" }}>{signInError}</p>}
          </div>
        )}
        {session && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
            <div style={{ fontSize: "0.9rem" }}>
              Autenticado como <code>{session.user.email ?? session.user.id}</code>
            </div>
            <button onClick={signOut} style={{ padding: "0.35rem 0.65rem" }}>Cerrar sesión</button>
          </div>
        )}
      </section>

      <section style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: 8, padding: "0.75rem 1rem", marginTop: "1rem" }}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Idiomas</h2>
        <div style={{ display: "flex", gap: "1rem", fontSize: "0.9rem" }}>
          <label>
            Yo escribo en{" "}
            <select value={myLanguage} onChange={(e) => setMyLanguage(e.target.value)}>
              {LANGUAGE_OPTIONS.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </label>
          <label>
            Ver traducciones en{" "}
            <select value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value)}>
              {LANGUAGE_OPTIONS.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: 8, padding: "0.75rem 1rem", marginTop: "1rem", minHeight: 240 }}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Conversación</h2>
        {!canOperate && <p style={{ color: "#334155", fontSize: "0.9rem" }}>Inicia sesión y carga el contexto para conversar.</p>}
        {pollError && <p style={{ color: "#b91c1c", fontSize: "0.85rem" }}>Polling: {pollError}</p>}
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.6rem" }}>
          {messages.map((m) => (
            <li key={m.messageId} style={{ borderLeft: "3px solid #059669", paddingLeft: "0.6rem" }}>
              <div style={{ fontSize: "0.78rem", color: "#475569" }}>
                {m.senderId === session?.user.id ? "Yo" : m.senderId}
                {" · "}{formatTime(m.createdAt)}
              </div>
              <div style={{ marginTop: "0.15rem", fontSize: "0.95rem", color: "#0f172a" }}>
                <strong style={{ color: "#0f172a" }}>[{m.originalLanguage}]</strong> {m.originalText}
              </div>
              <div style={{ marginTop: "0.15rem", fontSize: "0.95rem", color: m.translation ? "#047857" : "#b91c1c" }}>
                {m.translation !== null && (
                  <>
                    <strong>[{m.targetLanguage}]</strong> {m.translation}
                    {m.translationPassthrough && (
                      <span style={{ color: "#64748b" }}> · sin traducción (mismo idioma)</span>
                    )}
                  </>
                )}
                {m.translation === null && (
                  <>Error de traducción: {m.translationError ?? "desconocido"}</>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: 8, padding: "0.75rem 1rem", marginTop: "1rem" }}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Enviar mensaje</h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Escribe en ${myLanguage.toUpperCase()}…`}
            disabled={!canOperate || sending}
            style={{ flex: 1, padding: "0.5rem", fontSize: "0.95rem" }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendMessage();
              }
            }}
          />
          <button onClick={() => void sendMessage()} disabled={!canOperate || sending || draft.trim().length === 0} style={{ padding: "0.5rem 0.9rem" }}>
            {sending ? "Enviando…" : "Enviar"}
          </button>
        </div>
        {sendError && <p style={{ color: "#b91c1c", fontSize: "0.85rem" }}>Error al enviar: {sendError}</p>}
      </section>
    </main>
  );
}
