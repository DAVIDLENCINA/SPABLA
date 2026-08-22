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
import type { Session } from "@supabase/supabase-js";

import { createPollingRunner } from "@engine/utils/polling";
import { initialLanguagesFor } from "@engine/utils/initial-languages";
import {
  classifyPollingResponse,
  SESSION_EXPIRED_MESSAGE,
} from "@engine/utils/polling-response-classifier";
import { isLangCode, type LangCode } from "@engine/types/language";

// Hito 9.2.3/9.2.4 · Persistencia local del par de idiomas por actor.
// El catálogo de 13 idiomas activados vive en `lib/v2/client/ui-languages.ts`
// para que la página y el store consuman la misma fuente sin duplicarla.
// Hito 9.2.4 elimina los seis `setState`-in-effect estructuralmente
// usando `useSyncExternalStore` para las tres fuentes externas
// (cliente Supabase, probe de localStorage, cache del seed) y
// derivación en render + resets event-driven para el estado
// actor-scoped y la reconciliación de preferencias.
import { UI_LANGUAGE_OPTIONS } from "@/lib/v2/client/ui-languages";
import { saveLanguagePreference } from "@/lib/v2/client/language-preference-store";
import { planPreferenceHydration } from "@/lib/v2/client/language-preference-hydration";
import { useSupabaseBrowserClient } from "@/lib/v2/client/supabase-browser-client";
import { usePreferenceStorage } from "@/lib/v2/client/preference-storage-source";
import {
  useSeedCache,
  writeSeedToCache,
  type SeedResponse,
} from "@/lib/v2/client/seed-cache";
import {
  applyAuth401Recovery,
  shouldTriggerAuth401Recovery,
} from "@/lib/v2/client/auth-recovery-coordinator";
// Hito 9.3.1-Q3 · continuidad autenticada · el gate productivo del
// contexto ahora proviene del bootstrap server-authoritative; el fetch
// autenticado pasa por el retry helper para recuperar 401s sin destruir
// la sesión al primer fallo.
import { fetchBootstrap, type BootstrapPayload } from "@/lib/v2/client/bootstrap-client";
import { fetchWithAuthRetry } from "@/lib/v2/client/fetch-with-auth-retry";

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

// LANG13-02 · Activación de 13 idiomas en el selector del chat.
// Orden de producto obligatorio fijado por Plan V1.1 §14 (APROBADO Y
// CONGELADO). NO reordenar alfabéticamente. Etiquetas visibles en la
// lengua propia de cada idioma (§8, regla de coherencia 1). El catálogo
// vive en `lib/v2/client/ui-languages.ts` (Hito 9.2.3) para compartir
// una única fuente entre la página y el store de preferencias locales.
const LANGUAGE_OPTIONS: ReadonlyArray<{ readonly code: string; readonly label: string }> =
  UI_LANGUAGE_OPTIONS;

// Hito 9.2.2 · Etiqueta humana para un código ISO — se usa en la
// cabecera de conversación y en el placeholder del compositor para no
// exponer códigos técnicos en la interfaz visible. Fallback al código
// en mayúsculas si el idioma no está en `LANGUAGE_OPTIONS` (esta rama
// no debería alcanzarse dado el guard `isLangCode` río arriba).
function labelOf(code: string): string {
  return LANGUAGE_OPTIONS.find((l) => l.code === code)?.label ?? code.toUpperCase();
}

const POLL_INTERVAL_MS = 1500;

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
  // Hito 9.2.4 · Fuentes externas expuestas vía `useSyncExternalStore`.
  // Cero `setState` dentro de `useEffect` para el cliente Supabase, el
  // probe de `window.localStorage` y la carga del seed persistido.
  const supabase = useSupabaseBrowserClient();
  const preferenceStorage = usePreferenceStorage();
  // Hito 9.3.1-Q3 · el `seedCache` local queda como fallback dev-only
  // (`DeveloperPanel` sigue pudiendo poblarlo). La verdad productiva es
  // el snapshot de bootstrap server-authoritative.
  const { seed, tenantId: seedTenantId, conversationId: seedConversationId } = useSeedCache();

  const [session, setSession] = useState<Session | null>(null);
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [signInError, setSignInError] = useState<string | null>(null);
  const [signInBusy, setSignInBusy] = useState(false);

  const [seedError, setSeedError] = useState<string | null>(null);
  const [seedBusy, setSeedBusy] = useState(false);

  // Hito 9.3.1-Q3 · Bootstrap server-authoritative. Sustituye la
  // dependencia productiva del `seedCache` local (que sigue disponible
  // como fallback dev-only para el `DeveloperPanel`). El fetch se
  // dispara al alcanzar `SessionReady` y se acompaña con phase para
  // que la UI diferencie los estados de la máquina de Q2 §9.
  type BootstrapPhase =
    | "idle"
    | "loading"
    | "ok"
    | "unauthorized"
    | "transient"
    | "malformed"
    | "network";
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [bootstrapPhase, setBootstrapPhase] = useState<BootstrapPhase>("idle");
  const tenantId = bootstrap?.selectedTenantId ?? seedTenantId;
  const conversationId = bootstrap?.selectedConversationId ?? seedConversationId;
  // Guardián para evitar disparos concurrentes del bootstrap.
  const bootstrapInFlightRef = useRef<boolean>(false);
  // Actor para el que se cacheó el bootstrap actual. Si cambia el actor,
  // el snapshot se descarta.
  const [bootstrapForActor, setBootstrapForActor] = useState<string | null>(null);
  // Marca la resolución inicial de `getSession()` para diferenciar el
  // estado `Initializing`/`RestoringSession` del `SessionMissing` real.
  const [sessionRestored, setSessionRestored] = useState<boolean>(false);

  // Hito 9.2.4 · Sustituye la reconciliación en efecto por derivación
  // en render. `manualLangs.forActor` marca al dueño del par manual;
  // al cambiar de actor la selección manual queda invalidada y el
  // planner puro vuelve a decidir a partir de defaults canónicos +
  // preferencia persistida. Cero `setState` en efecto.
  const [manualLangs, setManualLangs] = useState<{
    readonly myLanguage: LangCode | null;
    readonly targetLanguage: LangCode | null;
    readonly forActor: string | null;
  }>({ myLanguage: null, targetLanguage: null, forActor: null });

  // Hito 9.2.4 · Estado actor-scoped derivado en render. El polling
  // adjunta `forActor` a cada actualización; si `session.user.id`
  // deja de coincidir, el valor efectivo cae a vacío sin necesidad
  // de un `useEffect` de reset (elimina un `setState`-in-effect).
  const [rawMessages, setRawMessages] = useState<{
    readonly items: ReadonlyArray<Message>;
    readonly forActor: string | null;
  }>({ items: [], forActor: null });
  const [rawPollError, setRawPollError] = useState<{
    readonly code: string;
    readonly forActor: string | null;
  } | null>(null);
  const [rawSendError, setRawSendError] = useState<{
    readonly code: string;
    readonly forActor: string | null;
  } | null>(null);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);
  // Immediate short-circuit for in-flight polling ticks that started
  // before the runner cleanup fired. Once true, `fetchMessages`
  // returns early and never re-uses the invalid token. `useRef` never
  // triggers the set-state-in-effect rule.
  const sessionExpiredRef = useRef<boolean>(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      // Hito 9.3.1-Q3 · marcamos la resolución inicial de la sesión
      // para que la UI transite de `RestoringSession` al estado
      // resultante (`SessionMissing` o `SessionReady`) sin mostrar el
      // formulario de login durante el microwindow.
      setSessionRestored(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      setSession(s);
      // Cualquier evento auth cuenta como resolución de la sesión
      // (INITIAL_SESSION, SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, …).
      setSessionRestored(true);
      // SIGNED_OUT · limpiar el snapshot de bootstrap para evitar
      // reutilizar contexto de un actor cerrado.
      if (evt === "SIGNED_OUT") {
        setBootstrap(null);
        setBootstrapPhase("idle");
        setBootstrapForActor(null);
      }
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  // Hito 9.3.1-Q3 · Dispara el bootstrap server-authoritative en cuanto
  // exista una sesión válida y no tengamos un snapshot para el actor
  // vigente. Un solo bootstrap in-flight por vez.
  useEffect(() => {
    if (!supabase || !session) return;
    const actorId = session.user.id;
    if (bootstrap !== null && bootstrapForActor === actorId) return;
    if (bootstrapInFlightRef.current) return;
    bootstrapInFlightRef.current = true;
    setBootstrapPhase("loading");
    void fetchBootstrap(supabase).then((outcome) => {
      bootstrapInFlightRef.current = false;
      if (outcome.kind === "ok") {
        setBootstrap(outcome.payload);
        setBootstrapForActor(actorId);
        setBootstrapPhase("ok");
      } else if (outcome.kind === "unauthorized") {
        setBootstrapPhase("unauthorized");
      } else if (outcome.kind === "transient") {
        setBootstrapPhase("transient");
      } else if (outcome.kind === "malformed") {
        setBootstrapPhase("malformed");
      } else {
        setBootstrapPhase("network");
      }
    });
  }, [supabase, session, bootstrap, bootstrapForActor]);

  const sessionUserId = session?.user.id ?? null;
  // Actor-scoped derivations. Reads only; no state mutations.
  const messages: ReadonlyArray<Message> = rawMessages.forActor === sessionUserId
    ? rawMessages.items
    : [];
  const pollError: string | null = rawPollError !== null && rawPollError.forActor === sessionUserId
    ? rawPollError.code
    : null;
  const sendError: string | null = rawSendError !== null && rawSendError.forActor === sessionUserId
    ? rawSendError.code
    : null;

  // Hito 9.2.4 · Planner puro invocado en render sobre el mismo estado
  // usado por Hito 9.2.3, pero con la guardia `hydratedActor` derivada
  // de `manualLangs.forActor` — la aplicación de la decisión no vive
  // en un efecto, sino directamente en las variables `myLanguage` /
  // `targetLanguage` calculadas más abajo.
  const hydrationDecision = useMemo(() => {
    const actorId = sessionUserId;
    const defaultsPair = actorId && seed
      ? initialLanguagesFor(actorId, seed)
      : null;
    // `hydratedActor` = `manualLangs.forActor` cuando el usuario ya
    // hizo una selección manual para el actor vigente; de lo contrario
    // `null` (el planner devuelve `apply` si hay algo que aplicar y el
    // resultado se materializa en `myLanguage`/`targetLanguage` abajo).
    const hydratedActor = manualLangs.forActor === actorId ? actorId : null;
    return planPreferenceHydration({
      actorId,
      hydratedActor,
      storage: preferenceStorage,
      defaults: defaultsPair,
    });
  }, [sessionUserId, seed, preferenceStorage, manualLangs.forActor]);

  // Valores efectivos de los selectores en render (D1 preservado):
  //   - Si el usuario ha elegido manualmente para el actor actual, sus
  //     valores prevalecen.
  //   - Si el planner puede aplicar (preferencia guardada o defaults),
  //     esos valores se usan.
  //   - En cualquier otro caso, `es`/`es` (default histórico).
  let myLanguage: LangCode = "es";
  let targetLanguage: LangCode = "es";
  if (manualLangs.forActor === sessionUserId && manualLangs.myLanguage && manualLangs.targetLanguage) {
    myLanguage = manualLangs.myLanguage;
    targetLanguage = manualLangs.targetLanguage;
  } else if (hydrationDecision.kind === "apply") {
    myLanguage = hydrationDecision.myLanguage as LangCode;
    targetLanguage = hydrationDecision.targetLanguage as LangCode;
  }

  const persistIfWritable = useCallback(
    (pref: { readonly myLanguage: string; readonly targetLanguage: string }) => {
      if (preferenceStorage.kind !== "available") return;
      const actor = sessionUserId;
      if (actor === null) return;
      saveLanguagePreference(preferenceStorage.storage, actor, pref);
    },
    [preferenceStorage, sessionUserId],
  );

  const onMyLanguageChange = useCallback((next: string) => {
    if (!isLangCode(next)) return;
    const actor = sessionUserId;
    if (actor === null) return;
    setManualLangs((prev) => ({
      myLanguage: next,
      targetLanguage: prev.forActor === actor && prev.targetLanguage
        ? prev.targetLanguage
        : targetLanguage,
      forActor: actor,
    }));
    persistIfWritable({ myLanguage: next, targetLanguage });
  }, [persistIfWritable, sessionUserId, targetLanguage]);
  const onTargetLanguageChange = useCallback((next: string) => {
    if (!isLangCode(next)) return;
    const actor = sessionUserId;
    if (actor === null) return;
    setManualLangs((prev) => ({
      myLanguage: prev.forActor === actor && prev.myLanguage
        ? prev.myLanguage
        : myLanguage,
      targetLanguage: next,
      forActor: actor,
    }));
    persistIfWritable({ myLanguage, targetLanguage: next });
  }, [persistIfWritable, sessionUserId, myLanguage]);

  const canOperate = useMemo(
    () => Boolean(session && tenantId && conversationId && targetLanguage),
    [session, tenantId, conversationId, targetLanguage],
  );

  const fetchMessages = useCallback(async () => {
    if (!supabase || !session) return;
    if (sessionExpiredRef.current) return;
    const actor = session.user.id;
    try {
      // Hito 9.3.1-Q3 · el fetch autenticado pasa por el retry helper
      // (`fetchWithAuthRetry`), que atacha `Authorization: Bearer …`
      // con la sesión actual, reintenta una única vez tras un refresh
      // single-flight ante 401 y devuelve la respuesta final. Si el
      // retry devuelve 401 nuevamente o el refresh falla, el flujo
      // desemboca en `applyAuth401Recovery` más abajo.
      const res = await fetchWithAuthRetry(
        supabase,
        `/api/v2/messages?tenantId=${encodeURIComponent(tenantId)}&conversationId=${encodeURIComponent(conversationId)}&to=${encodeURIComponent(targetLanguage)}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );
      const body = (await res.json().catch(() => ({}))) as { error?: string; items?: ReadonlyArray<Message>; actorId?: string };
      const action = classifyPollingResponse({ status: res.status }, body);
      if (action.kind === "expire" || shouldTriggerAuth401Recovery(res)) {
        // AUTH-RECOVERY (Hito 9.2.4): delegated to the coordinator
        // (`applyAuth401Recovery`) so the transition is idempotent,
        // testable and mirrors byte-for-byte what the integration
        // suite drives. The coordinator NEVER touches the
        // preference store, so `spabla_v2:language-preferences:v1:*`
        // and the seed cache (`spabla_v2_fase9_seed`) survive.
        await applyAuth401Recovery({
          hasAlreadyRecovered: () => sessionExpiredRef.current,
          markRecovered: () => {
            sessionExpiredRef.current = true;
          },
          notifyExpired: () => {
            setSessionExpired(true);
            setRawPollError(null);
            setRawMessages({ items: [], forActor: null });
            setSession(null);
          },
          signOutLocalScope: async () => {
            await supabase.auth.signOut({ scope: "local" });
          },
        });
        return;
      }
      if (action.kind === "surface") {
        setRawPollError({ code: action.pollError, forActor: actor });
        return;
      }
      const items = Array.isArray(body.items) ? body.items : [];
      // Guard against a late response from an obsolete session: drop the
      // payload if the server-verified actorId no longer matches the
      // current client-side session. This complements the runner-level
      // cancellation and eliminates any residual UI flicker.
      if (body.actorId !== undefined && body.actorId !== actor) {
        return;
      }
      setRawMessages({ items, forActor: actor });
      setRawPollError(null);
    } catch {
      setRawPollError({ code: "poll_network", forActor: actor });
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
      // Hito 9.2.4 · Escritura + notificación centralizada. El external
      // store (`useSeedCache`) actualiza `tenantId`/`conversationId` en
      // el próximo render sin ningún `setState` en efecto.
      writeSeedToCache(body);
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
      if (error) {
        setSignInError(error.message);
        return;
      }
      // AUTH-RECOVERY (Hito 9.2.4): un login exitoso siempre limpia el
      // aviso de expiración y re-arma el guardia — resets event-driven
      // en lugar de un `useEffect` que observe `sessionUserId`.
      sessionExpiredRef.current = false;
      setSessionExpired(false);
    },
    [supabase, signInEmail, signInPassword],
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    // AUTH-RECOVERY (Hito 9.2.4) · SIGNOUT-SEMANTICS (Hito 9.3.1-Q3):
    // `scope: "local"` cierra la sesión local del navegador/dispositivo
    // actual — es decir, elimina del `localStorage` los items propios
    // de la sesión Supabase (`spabla_v2_fase9_auth`). Otras pestañas
    // del mismo navegador y origen comparten ese almacenamiento y por
    // tanto quedan afectadas (Q2 §14 + acta Q1 §7-bis); otros
    // navegadores, perfiles independientes o dispositivos conservan
    // sus sesiones. NO borra las claves del preference store
    // (`spabla_v2:language-preferences:v1:*`) ni del seed cache
    // (`spabla_v2_fase9_seed`) — se preservan íntegras.
    await supabase.auth.signOut({ scope: "local" });
    sessionExpiredRef.current = false;
    setSessionExpired(false);
    setSession(null);
    setRawMessages({ items: [], forActor: null });
    setRawPollError(null);
    setRawSendError(null);
    // Hito 9.3.1-Q3 · descartamos el snapshot de bootstrap para que la
    // próxima sign-in vuelva a solicitar el contexto server-authoritative.
    setBootstrap(null);
    setBootstrapForActor(null);
    setBootstrapPhase("idle");
  }, [supabase]);

  const sendMessage = useCallback(async () => {
    if (!supabase || !session || !draft.trim()) return;
    const actor = session.user.id;
    setSending(true);
    setRawSendError(null);
    // Hito 9.3.1-Q3 · autorizado por Q2 §5.3: el POST usa
    // `clientMessageId` como idempotency key, por lo que un retry
    // tras refresh silencioso con el mismo cuerpo es seguro y no
    // duplica el mensaje (el servidor devuelve 409 conflict si el
    // ID ya está persistido).
    const clientMessageId = randomMessageId();
    try {
      const res = await fetchWithAuthRetry(
        supabase,
        "/api/v2/messages",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantId,
            conversationId,
            text: draft.trim(),
            language: myLanguage,
            clientMessageId,
          }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setRawSendError({ code: body.error ?? `send_status_${res.status}`, forActor: actor });
        return;
      }
      setDraft("");
      await fetchMessages();
    } catch {
      setRawSendError({ code: "send_network", forActor: actor });
    } finally {
      setSending(false);
    }
  }, [supabase, session, draft, tenantId, conversationId, myLanguage, fetchMessages]);

  return (
    <ChatPageFrame header={<AppHeader />}>
      <ConversationHeader
        authenticatedEmail={session?.user.email ?? null}
        myLanguageLabel={labelOf(myLanguage)}
        targetLanguageLabel={labelOf(targetLanguage)}
        onSignOut={session ? signOut : undefined}
      />

      {/*
        Hito 9.3.1-Q3 · el formulario de sign-in solo aparece cuando ya
        hemos resuelto que no hay sesión (`SessionMissing`/`Expired` de
        la máquina Q2 §9). Durante el microwindow de restauración
        (`Initializing`/`RestoringSession`) mostramos un aviso neutro
        para no confundir al usuario.
      */}
      {!session && sessionRestored && (
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
      {!session && !sessionRestored && (
        <section
          aria-label="Restaurando sesión"
          style={{
            marginTop: "0.75rem",
            padding: "1.25rem 1rem",
            background: "#F8FAFC",
            border: "1px solid #E2E8F0",
            borderRadius: 10,
            color: "#475569",
            fontSize: "0.9rem",
            textAlign: "center",
          }}
        >
          Restaurando tu sesión…
        </section>
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
        Timeline inline · Hito 9.2.2 (fix compactación 9.2.2b).
        Se mantiene aquí (no en un componente hijo) para preservar los
        contratos LANG13-03 sobre los <span lang={...} dir="auto"> —
        engine/src/utils/chat-message-semantics.test.ts los localiza
        exclusivamente en este fichero.

        Compactación del estado sin sesión: cuando `!canOperate`, la
        sección no reserva `minHeight` de timeline; su altura la
        determina el contenido (hint humano). Con sesión sin mensajes
        se reserva una altura moderada (160px). Con mensajes se
        preserva el minHeight original (280px) para no colapsar la
        primera burbuja.
      */}
      {!canOperate ? (
        <section
          aria-label="Historial de mensajes"
          style={{
            marginTop: "0.75rem",
            padding: "2.25rem 1rem",
            background: "#F8FAFC",
            border: "1px solid #E2E8F0",
            borderRadius: 10,
            color: "#475569",
            fontSize: "0.9rem",
            textAlign: "center",
          }}
        >
          {/*
            Hito 9.3.1-Q3 · mensajes UI diferenciados por motivo real de
            `!canOperate` (Q2 §9 máquina de estados):
              - `!session` post-restauración → «Inicia sesión…» (con
                formulario visible arriba).
              - `session` + bootstrap en marcha → «Preparando tu
                conversación…».
              - `session` + bootstrap error transitorio → aviso de reintento.
              - `session` + bootstrap sin memberships/conversaciones →
                aviso informativo sin acción.
          */}
          {!session
            ? (sessionRestored ? "Inicia sesión para ver la conversación." : "Restaurando tu sesión…")
            : bootstrapPhase === "loading" || bootstrapPhase === "idle"
              ? "Preparando tu conversación…"
              : bootstrapPhase === "transient" || bootstrapPhase === "network" || bootstrapPhase === "malformed"
                ? "Reintentando cargar tu contexto…"
                : bootstrap && !bootstrap.canOperate
                  ? "Tu cuenta todavía no tiene una conversación disponible."
                  : "Preparando tu conversación…"}
        </section>
      ) : (
      <section
        aria-label="Historial de mensajes"
        style={{
          marginTop: "0.75rem",
          padding: "0.75rem 1rem",
          background: "#F8FAFC",
          border: "1px solid #E2E8F0",
          borderRadius: 10,
          minHeight: messages.length === 0 ? 160 : 280,
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
        {messages.length === 0 && (
          <div style={{ padding: "1.75rem 1rem", textAlign: "center", color: "#475569" }} aria-live="polite">
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
      )}

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
