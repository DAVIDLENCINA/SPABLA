# SPABLA V2 · Hito 9.3.1-Q1 — Auditoría técnica de continuidad de sesión web

**Fecha del acta**: 2026-08-22.
**Rama de auditoría**: `spabla-v2/hito-9-3-1-q1-auth-continuity-audit`.
**Base exacta**: `ec31ecc147a6312af27e8f29906aeaf64ff317a9` (rama oficial `spabla-v2/thirteen-languages-activation` tras la promoción del Plan 9.3 V1.2).
**CI oficial basal**: [`32420002095`](https://github.com/DAVIDLENCINA/SPABLA/actions/runs/32420002095) — completed / success / attempt=1 / Jobs A/B/C todos verdes / PostgreSQL 17.11 / restore drill PASS.
**Plan gobernante**: `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_PLAN.md` V1.2 — CONGELADO Y APROBADO POR DIRECCIÓN — SHA-256 `d063510e6d9729843be443ea33b26329ad1c07494cce313842f5f886fabb2cd4`.

---

## 1 · Identidad del ejecutor

Auditoría técnica ejecutada por el agente **Claude Opus 4.7 (contexto 1M)** operando dentro de Claude Code sobre `~/SPABLA`. La ejecución de esta orden ocurre en la misma sesión que promovió el Plan V1.2, es decir, **no equivale a una reproducción independiente §16.F del Hito 9.2.5-F**. La independencia requerida para 9.2.5-F ya fue satisfecha por la reproducción externa del Hito 9.2.5-J promovida en la oficial (`86d60c46…`). Este hito 9.3.1-Q1 es **auditoría técnica**, no reproducción independiente.

## 2 · Base y CI basal

- Rama base: `spabla-v2/thirteen-languages-activation` @ `ec31ecc147a6312af27e8f29906aeaf64ff317a9`.
- Rama de auditoría: `spabla-v2/hito-9-3-1-q1-auth-continuity-audit` creada limpiamente desde el SHA base.
- CI basal `32420002095` verde en attempt=1; Jobs A/B/C todos success; `psql`/`pg_dump` 17.11; restore drill PASS.

## 3 · Plan gobernante

Plan 9.3 V1.2 §5.2, §8.1, §15.1 y §15.2 fijan la Arquitectura A (`persistSession=true`, `autoRefreshToken=true`, `storageKey="spabla_v2_fase9_auth"`, sin `@supabase/ssr`, sin PKCE general, sin nueva dependencia de auth) y la política de sesiones simultáneas (`signOut` local afecta solo al dispositivo actual). La barrera §5.2 exige que si esta Q1 demuestra insuficiencia estructural, se detenga y eleve la decisión a Dirección — prohibido migrar silenciosamente a B.

## 4 · Alcance y exclusiones

**Incluido**:
- Reconstrucción factual del incidente 9.2.4 a partir del acta primaria.
- Trazado estático completo del flujo cliente/servidor de auth y bootstrap.
- Consulta de fuentes primarias oficiales de Supabase Auth (§17 del Plan).
- Diagnóstico causal con niveles de confianza declarados.
- Recomendación de decisión A / B / C.

**Excluido explícitamente por la orden**:
- Instalación de Playwright/Puppeteer o cualquier dependencia nueva.
- Edición de `package.json`, locks, `supabase/config.toml`, `jwt_expiry`.
- Instrumentación persistente en código productivo.
- Implementación de la corrección (queda para Q2).
- Reproducción con navegador real (no disponible en este entorno agéntico).

## 5 · Cronología del incidente 9.2.4

Reconstruida a partir del acta primaria `docs/audit_reports/AUDIT_2026-08-14_pref-acceptance-jefe.md` (PREF-ACCEPTANCE, aprobada por Dirección):

| Momento | Actor | Estado previo | Acción | Síntoma | Respuesta del sistema | Intervención | Resultado |
|---|---|---|---|---|---|---|---|
| Paso 1 | A | fresh Chrome, sin seedCache local | Sign-in con `email + password` | — | Chat operable con defaults `es/es` (o preferencias persistidas) | — | OK |
| Paso 2 | A | autenticado, chat operable | Cambiar selectores a `Català / Deutsch` | — | Selectores actualizados sin errores | — | OK |
| Paso 3 | A | preferencias `ca/de` guardadas | `Cmd+R` (recarga completa) | — | Selectores restauran `ca/de` sin flicker | — | OK |
| Paso 4 | A | recarga OK | Pulsar «Cerrar sesión» | — | `signOut({scope:"local"})` → formulario de sign-in visible | — | OK |
| Paso 5 | B (Chrome incógnito) | fresh sin `seedCache` local | Sign-in con `email + password` de B | UI muestra literal «Inicia sesión para ver la conversación» **aunque la sesión de Supabase está activa** | `session != null` pero `tenantId=""` y `conversationId=""` en localStorage → `canOperate=false` → gate UI activa el mensaje `!session-y-!seed` | Paso 5.5 ejecutar seed manual desde DeveloperPanel | Resuelto → chat operable con defaults canónicos `en/en` de B |
| Paso 6-8 | ambos | flujos B y coordinador | ver acta primaria | — | — | — | OK |
| Paso 7-γ / 7-γ-bis | B | autenticado con `en/en` | signOut normal + re-login | — | Preferencias `en/en` sobreviven | — | OK |
| **Paso 10** | **A** | **preferencias `ca/de` persistidas, sesión Supabase supuestamente activa** | **Pausa prolongada** | **La interfaz presentó al Actor A como no autenticado** | **Desconocido** (no observado directamente; §5.4 del acta 9.2.4 lo declara compatible con: caducidad natural del `access_token`, 401 en polling, recovery del coordinator, u otras cadenas) | Re-login manual con credenciales de A | Preferencias `ca/de` sobreviven al re-login |

**Hechos demostrados** por el acta primaria:
- Actor A perdió estado autenticado en la UI tras una pausa prolongada.
- Las preferencias `ca/de` de A sobrevivieron al re-login.
- Ni el número exacto de HTTP 401 emitidos durante la pausa ni el mecanismo interno que produjo el estado «no autenticado» fueron observados en tiempo real.

**Hipótesis** compatibles con la evidencia visual del acta:
- (H1) Caducidad natural del `access_token` (`jwt_expiry = 3600` = 1 hora); refresh silencioso interceptado por un tick de polling que envió el token viejo antes de la renovación.
- (H2) Refresh_token del navegador borrado por la propia recovery (`signOut({scope:"local"})`).
- (H3) Pausa suficientemente larga para que también el `refresh_token` deje de ser usable por alguna razón (rotación single-use consumida por un tick concurrente, reuse-detection revocando la cadena, etc.).
- (H4) Combinación H1 + H2: 401 real por caducidad → recovery borra refresh_token → siguiente restauración imposible sin credenciales.

**Elementos no reproducibles en este entorno**: no puedo abrir un navegador con localStorage real ni observar Network devtools; puedo verificar solo hipótesis por trazado estático + docs oficiales + tests existentes.

## 6 · Trazado estático completo

### 6.1 Creación del cliente Supabase (browser)

Archivo `lib/v2/client/supabase-browser-client.ts`, líneas 20-39:

```typescript
const STORAGE_KEY = "spabla_v2_fase9_auth" as const;
let cachedClient: SupabaseClient | null = null;
function getClientSnapshot(): SupabaseClient | null {
  if (cachedClient !== null) return cachedClient;
  if (typeof window === "undefined") return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  cachedClient = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: STORAGE_KEY },
  });
  return cachedClient;
}
```

- **Singleton estricto** cacheado a nivel módulo (`cachedClient`).
- Se crea **una única vez por page-load** en el navegador.
- SSR-safe: `getServerSnapshot()` devuelve `null` en el servidor.
- **Sin inicializaciones múltiples** detectadas.
- **Sin storageKey divergente** — literal constante.

### 6.2 Bootstrap de sesión en la página

Archivo `app/v2/chat/page.tsx`, líneas 197-204:

```typescript
useEffect(() => {
  if (!supabase) return;
  supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
  const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s));
  return () => {
    sub.subscription.unsubscribe();
  };
}, [supabase]);
```

- Un único `useEffect` con dep `[supabase]`.
- `getSession()` es la llamada inicial (una vez al montar cuando `supabase` está disponible).
- `onAuthStateChange` cubre eventos posteriores, incluidos **refresh silencioso, sign-in, sign-out y token refresh**.
- **HALLAZGO H-UI-1** — entre "supabase disponible" y "getSession() resuelve", `session` es `null` durante ese microwindow. La UI puede mostrar transitoriamente el formulario de login o el mensaje `!canOperate` incluso cuando la sesión ES persistente.

### 6.3 Gate `canOperate`

Líneas 294-297:

```typescript
const canOperate = useMemo(
  () => Boolean(session && tenantId && conversationId && targetLanguage),
  [session, tenantId, conversationId, targetLanguage],
);
```

Y el gate UI (líneas 476, 516):

```typescript
{!session && (<SessionArea .../>)}          // formulario de sign-in visible cuando !session
{!canOperate ? (
  <section>Inicia sesión para ver la conversación.</section>
) : (...)}
```

- **HALLAZGO H-UI-2 (DEUDA-UX-SEED-MISSING confirmada)** — el mensaje literal «Inicia sesión para ver la conversación» aparece por `!canOperate`, que se activa por **tres motivos distintos** que la UI no distingue:
  - `!session` (real: sin autenticar).
  - `!tenantId || !conversationId` (`seedCache` vacío o ausente aunque `session != null`).
  - `!targetLanguage` (defensivo; en render el default es `"es"`, así que raramente).

- El **formulario visible** de sign-in solo aparece con `!session`. Pero el **texto engañoso** aparece con `!canOperate`. En una restauración correcta de sesión + seedCache poblado, la UI transita brevemente por `!canOperate` mientras `getSession()` resuelve y el seedCache se lee.

### 6.4 Polling y captura de token en closure

Líneas 299-356:

```typescript
const fetchMessages = useCallback(async () => {
  if (!supabase || !session) return;
  if (sessionExpiredRef.current) return;
  const token = session.access_token;          // ← capturado del closure
  const actor = session.user.id;
  try {
    const res = await fetch(
      `/api/v2/messages?...`,
      { method: "GET", headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );
    const body = ...;
    const action = classifyPollingResponse({ status: res.status }, body);
    if (action.kind === "expire" || shouldTriggerAuth401Recovery(res)) {
      await applyAuth401Recovery({
        hasAlreadyRecovered: () => sessionExpiredRef.current,
        markRecovered: () => { sessionExpiredRef.current = true; },
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
    // ...
  } catch { setRawPollError({ code: "poll_network", forActor: actor }); }
}, [supabase, session, tenantId, conversationId, targetLanguage]);
```

- **HALLAZGO H-CORE-1 (crítico)** — cada tick captura `session.access_token` en el closure de `useCallback`. Cuando el SDK renueva silenciosamente el token, `onAuthStateChange` emite `TOKEN_REFRESHED` → `setSession(s)` → `session` cambia → `fetchMessages` se recrea. Un tick que quedó en vuelo antes del refresh, sin embargo, sigue usando el token capturado (el viejo).
- **HALLAZGO H-CORE-2 (crítico)** — ante cualquier 401 (`shouldTriggerAuth401Recovery(res) => res.status === 401`), el coordinator dispara la transición **sin distinguir**:
  - 401 por firma inválida / JWT revocado / claim inválido → sesión realmente inválida.
  - 401 por `access_token` caducado (`exp` en el pasado) con `refresh_token` todavía válido y renovable → sesión recuperable silenciosamente.
- **HALLAZGO H-CORE-3 (crítico)** — la transición ejecuta `supabase.auth.signOut({ scope: "local" })`. Según la documentación oficial de Supabase (§7 fuentes), `signOut()` en el navegador «removes all items from localStorage», **incluyendo el `refresh_token`**. Consecuencia: aunque el refresh_token estuviera vivo y hubiera podido renovar la sesión, la recovery lo **borra**, imposibilitando la restauración silenciosa hasta el próximo sign-in manual.

### 6.5 `applyAuth401Recovery`

Archivo `lib/v2/client/auth-recovery-coordinator.ts`, líneas 75-91:

```typescript
export async function applyAuth401Recovery(deps: Auth401RecoveryDeps): Promise<RecoveryOutcome> {
  if (deps.hasAlreadyRecovered()) {
    return { ranTransition: false, totalAttempts: 1 };
  }
  deps.markRecovered();
  deps.notifyExpired();
  try {
    await deps.signOutLocalScope();
  } catch { /* silent */ }
  return { ranTransition: true, totalAttempts: 1 };
}
```

- Idempotente (`hasAlreadyRecovered` guardián).
- **No intenta refresh explícito antes de la recovery**. Cualquier 401 se trata como sesión definitivamente inválida.
- **No consulta `session.expires_at`** para distinguir "token caducado por naturaleza" de "token revocado".
- **No hay retry con token renovado**.

### 6.6 `signOut` en la cabecera

Líneas 416-431:

```typescript
const signOut = useCallback(async () => {
  if (!supabase) return;
  await supabase.auth.signOut({ scope: "local" });   // borra refresh_token de localStorage
  sessionExpiredRef.current = false;
  setSessionExpired(false);
  setSession(null);
  setRawMessages({ items: [], forActor: null });
  setRawPollError(null);
  setRawSendError(null);
}, [supabase]);
```

- `scope: "local"` (documentación oficial: cierre de la sesión local del navegador/dispositivo, ver §7-bis). **No** equivale a «solo esta pestaña»: el efecto exacto entre pestañas del mismo navegador debe verificarse experimentalmente en Q3.
- Preserva preferences y seedCache en `localStorage` (invariante de diseño 9.2.4 explícitamente documentado por el comentario del código): la eliminación por `signOut` afecta a las claves de sesión Supabase (`spabla_v2_fase9_auth`), no a `spabla_v2_fase9_seed` ni a `spabla_v2:language-preferences:v1:*`.
- Como consecuencia documental, remueve el `refresh_token` de la sesión local (comportamiento nativo Supabase: «removing all items from localstorage» — se refiere a los items propios de la sesión Supabase bajo su `storageKey`).

### 6.7 `seedCache` y bootstrap del contexto

Archivo `lib/v2/client/seed-cache.ts`:

- Clave localStorage: `spabla_v2_fase9_seed`.
- Populado únicamente por `runSeed()` en `page.tsx:369` que llama a `POST /api/v2/seed` (endpoint dev-only con doble gate).
- En producción, un navegador nuevo sin este cache **no puede operar** aunque la sesión Supabase esté activa, por §6.3 (§HALLAZGO H-UI-2).

### 6.8 Servidor y `verifyJwt`

Archivos `lib/v2/server/composition.ts:80/83/106`, `seed.ts:178`, `translation-runtime.ts:73`:

- Clientes efímeros server-side con `persistSession: false, autoRefreshToken: false`. Correcto: el servidor solo verifica JWT, no cede sesión al navegador.
- `verifyJwt` invoca `supabase.auth.getClaims(token)` que valida firma + `exp` contra JWKS. **No consulta `auth.sessions`** — comportamiento estándar Supabase Auth. Consecuencia: **un `access_token` caducado (`exp` en el pasado) produce 401 exclusivamente por `exp`, no por revocación server-side**.

### 6.9 Diferencia entre capas

| Capa | Fuente de verdad | Persistencia | Ciclo de vida |
|---|---|---|---|
| Sesión Supabase (SDK) | `localStorage["spabla_v2_fase9_auth"]` | Persistente entre reload/reapertura | Vive mientras refresh_token sea usable |
| `access_token` | Dentro de la sesión Supabase | Se refresca silenciosamente | 3600 s de `exp` |
| `refresh_token` | Dentro de la sesión Supabase | Single-use, rotación 10 s | Sin `exp`, revocable |
| Estado React `session` | En memoria (useState) | Se pierde en reload; se re-hidrata vía `getSession()` | Vida de la pestaña |
| `seedCache` | `localStorage["spabla_v2_fase9_seed"]` | Persistente entre reload | Vida arbitraria (no vinculada a sesión) |
| Contexto activo (`canOperate`) | Derivado de session ∧ seed ∧ targetLanguage | En render | Reactivo a las fuentes |

**HALLAZGO H-DES-1** — la coherencia entre estas 6 capas se restaura correctamente cuando `getSession()` resuelve, `useSeedCache()` lee localStorage y las preferencias se aplican. El punto de fallo es la **coordinación entre polling y refresh silencioso** (H-CORE-1/2/3), no la persistencia en sí.

### 6.10 Escaneo dirigido de anomalías del listado §FASE 2

| Anomalía buscada | Resultado |
|---|---|
| Inicializaciones múltiples del cliente | 0 (singleton confirmado) |
| Llamadas prematuras a `signOut` | 0 (solo desde recovery o botón usuario) |
| Borrado no autorizado de `localStorage`/`sessionStorage` | 0 (recovery solo llama a `signOut`, que borra tokens Supabase por diseño; preferencias y seedCache preservadas por documentación explícita §5.2 de 9.2.4) |
| `storageKey` divergente | 0 (constante literal) |
| Condiciones de carrera en bootstrap | H-UI-1 (microwindow entre `supabase` y `getSession()`); H-CORE-1 (token capturado en closure vs refresh en background) |
| Bootstrap ejecutado antes de restaurar sesión | Parcial: `canOperate` gate depende del seedCache local, no de un bootstrap server-authoritative |
| Listeners duplicados o ausentes | 0 (un solo `onAuthStateChange`, cleanup correcto) |
| Caché que sobreviva más o menos que la sesión | seedCache sobrevive independientemente de la sesión (H-UI-2 confusión) |
| 401 tratado como sesión definitivamente inválida | H-CORE-2 (SÍ, sin distinguir) |
| Errores de red confundidos con pérdida de auth | 0 (network errors van a `setRawPollError({code: "poll_network"})`, no a recovery) |
| Actor/tenant faltante confundido con sesión perdida | H-UI-2 (mensaje UI engañoso, pero el estado técnico no confunde) |
| Estado React no restaurado | H-UI-1 (transitorio, se restaura al resolver `getSession()`) |
| Tokens leídos una única vez y reutilizados tras expirar | H-CORE-1 (captura en closure de tick de polling) |
| Efectos que reinicien estado al montar | 0 (el `useEffect` de auth solo suscribe, no resetea) |

## 7 · Fuentes primarias oficiales consultadas

Fechas de consulta: **2026-08-22** (Q1 inicial) + **2026-08-22 rectificación R2** (guía de signout + reference JS signOut + `onAuthStateChange` revisitadas). Solo documentación oficial `supabase.com/docs`, ninguna fuente secundaria.

| Fuente | URL | Extracto verbatim relevante |
|---|---|---|
| Supabase User Sessions | https://supabase.com/docs/guides/auth/sessions | «Most applications should use the default expiration time of 1 hour.» — «refresh tokens never expire but can only be used once.» — «Within a 10-second reuse interval (default, not recommended to change)» — «the whole session is regarded as terminated and all refresh tokens belonging to it are marked as revoked» (reuse detection). |
| Supabase Sign Out (guide) — R2 | https://supabase.com/docs/guides/auth/signout | Tres scopes: **global (default)** «all sessions active for the user are terminated»; **local** «only terminates the current session for the user but keep sessions on **other devices or browsers** active»; **others** «terminate all but the current session for the user». — Contrato del `access_token` tras `signOut`: «Access Tokens of revoked sessions remain valid until their expiry time, encoded in the `exp` claim. The user won't be immediately logged out and will only be logged out when the Access Token expires.» — La granularidad del scope local se expresa en términos de «other devices or browsers», **no en pestañas**. |
| Supabase JavaScript `signOut` | https://supabase.com/docs/reference/javascript/auth-signout | «If you only want to sign the user out of the current session (the behavior most other auth libraries default to), pass `{ scope: 'local' }` explicitly.» — «signOut() will remove the logged in user from the browser session and log them out - removing all items from localstorage and then trigger a `"SIGNED_OUT"` event.» — «There is no way to revoke a user's access token jwt until it expires.» |
| Supabase JavaScript `onAuthStateChange` — R2 | https://supabase.com/docs/reference/javascript/auth-onauthstatechange | Eventos oficialmente listados: `INITIAL_SESSION`, `SIGNED_IN`, `SIGNED_OUT`, `PASSWORD_RECOVERY`, `TOKEN_REFRESHED`, `USER_UPDATED`. La documentación consultada **no** describe explícitamente propagación entre pestañas del mismo navegador ni menciona `BroadcastChannel` / `storage` events como mecanismo cross-tab. Cualquier propagación cross-tab es comportamiento no documentado oficialmente y debe verificarse experimentalmente. |
| Supabase JWT | https://supabase.com/docs/guides/auth/jwts | «Sets a time limit after which the token should not be trusted and is considered expired, even if it is properly signed.» — «The purpose of the signature is to verify the authenticity of the `<header>.<payload>` string without relying on database access.» |
| Supabase Server-Side Auth Advanced Guide | https://supabase.com/docs/guides/auth/server-side/advanced-guide | Consultado como referencia para la Opción B (Next SSR / PKCE). No se emplea en Q1. |

### 7-bis · Contrato oficial de `signOut({scope:"local"})` — precisión introducida por R2

La documentación oficial expresa el aislamiento de `local` en términos de **sesiones que residen en el almacenamiento local del navegador o dispositivo**, no en términos de pestañas individuales. En consecuencia:

- **`scope:"local"` termina la sesión local del navegador/dispositivo** en el que se ejecuta y **remueve del `localStorage` los tokens de esa sesión** («removing all items from localstorage»).
- **Las pestañas del mismo navegador y origen que comparten `localStorage` comparten la misma sesión persistida** (mismo `storageKey`); una `signOut({scope:"local"})` en cualquier pestaña **elimina el `refresh_token` que las demás pestañas comparten**. **No se puede prometer** que una segunda pestaña del mismo navegador permanezca autenticada tras esa operación.
- **La propagación del evento `SIGNED_OUT` a otras pestañas del mismo navegador no está documentada** por Supabase (ver `onAuthStateChange` arriba). Si el SDK implementa una propagación (por `BroadcastChannel`, `storage` event u otro mecanismo), es comportamiento no garantizado por la documentación consultada. Debe verificarse experimentalmente en Q3.
- **Otros navegadores, perfiles de navegador, ventanas de incógnito con almacenamiento independiente y dispositivos separados conservan sus propias sesiones**; el scope `local` no las afecta.
- **Los `access_token` ya emitidos antes de la `signOut` pueden continuar siendo válidos hasta su `exp` natural**, aunque la sesión renovable haya sido terminada («Access Tokens of revoked sessions remain valid until their expiry time, encoded in the `exp` claim»).

Clasificación de afirmaciones técnicas usadas en el diagnóstico:

- **Respaldadas por documentación oficial**:
  - `jwt_expiry` por defecto 3600 s.
  - `refresh_token` sin expiración pero single-use con reuse interval de 10 s.
  - `signOut()` en el navegador «removes all items from localstorage».
  - `access_token` no revocable hasta su `exp` natural.
  - JWT verification usa firma + `exp` sin consultar `auth.sessions`.
- **Comprobadas experimentalmente** (por trazado estático en el repo actual):
  - `persistSession=true` + `autoRefreshToken=true` + `storageKey="spabla_v2_fase9_auth"` (código en `supabase-browser-client.ts:36`).
  - `applyAuth401Recovery` dispara `signOut({scope:"local"})` en cualquier 401 (código en `page.tsx:315-337` + `auth-recovery-coordinator.ts:75-91`).
  - Un único `getSession()` + `onAuthStateChange` en el bootstrap (`page.tsx:197-204`).
  - `jwt_expiry = 3600` en `supabase/config.toml:70`.
- **Inferencia** (basada en documentación + código pero no reproducida experimentalmente):
  - El `signOut` de la recovery elimina el `refresh_token` local aunque estuviera vivo (inferido del contrato documentado de `signOut` + la línea `signOutLocalScope: async () => await supabase.auth.signOut({ scope: "local" })`).
  - El throttling de background tabs puede retrasar el `setTimeout` del auto-refresh (comportamiento estándar de navegadores modernos; no citado por Supabase docs explícitamente).
- **Hipótesis pendiente de prueba experimental**:
  - Que en la pausa observada del acta 9.2.4, el `access_token` caducó específicamente antes del refresh silencioso (compatible con `jwt_expiry=3600` pero no verificado con timestamps concretos).

## 8 · Matriz experimental (§FASE 4)

| # | Escenario | Precondición | Acción | Resultado esperado | Resultado observado | Evidencia | Clasificación |
|---|---|---|---|---|---|---|---|
| A | Login válido → navegación normal | Cliente Supabase inicializado, credenciales válidas | `signInWithPassword` + operar | Chat operable, `session != null`, `access_token` en `Authorization: Bearer` | **NO EJECUTABLE** (requiere navegador real) | — | NO EJECUTABLE |
| B | Login válido → recarga de `/v2/chat` | Sesión activa | `Cmd+R` | `getSession()` restaura sesión desde `localStorage["spabla_v2_fase9_auth"]`; UI operable | Verificado indirectamente por acta 9.2.4 paso 3 (recarga preservó `ca/de` para Actor A) | acta 9.2.4 | PASS (indirecta) |
| C | Cerrar pestaña → reabrir | Sesión activa | Close tab, open new | Igual que B (mismo mecanismo `persistSession` en localStorage) | **NO EJECUTABLE** en este entorno | — | NO EJECUTABLE |
| D | Nueva pestaña del mismo navegador | Sesión activa en pestaña original | Abrir nueva pestaña | Comparten `localStorage` bajo el mismo `storageKey` → misma sesión persistida activa | **NO EJECUTABLE** | — | NO EJECUTABLE |
| E | Dos pestañas simultáneas | Sesión activa | Operar en ambas | Ambas leen la misma sesión persistida; la propagación cross-tab del refresh silencioso vía `onAuthStateChange` **no está documentada** por Supabase (§7-bis) y debe verificarse experimentalmente en Q3 | **NO EJECUTABLE** | — | NO EJECUTABLE |
| F | Reinicio de Next manteniendo el navegador | Sesión activa | Kill + relanzar `next` | Cliente browser mantiene sesión; próximo fetch a `/api/v2/messages` valida contra Supabase directamente | **NO EJECUTABLE** en este turno (Q1 documental) | — | NO EJECUTABLE |
| G | Reinicio de Supabase local | Sesión activa contra Supabase local | `supabase stop && supabase start` | Puede o no invalidar según persistencia de datos. **No representa producción**: en producción Supabase no se reinicia; el volumen de auth es persistente. | **NO EJECUTABLE + advertencia**: no válido como diagnóstico de continuidad productiva. | — | NO EJECUTABLE / no aplicable |
| H | Access_token caducado con refresh_token válido | Sesión activa, esperar >3600 s SIN modificar `jwt_expiry` | Fetch tras caducidad | 401 → refresh silencioso → retry con nuevo token → 200 (comportamiento esperado por producto). **En el código actual: 401 → recovery destructiva → sign-out visible (defecto documentado en H-CORE-1/2/3)** | **NO EJECUTABLE en la ventana temporal de esta orden** (esperar 1 h). El código actual permite predecir el comportamiento con alta confianza sin ejecutar la prueba. | trazado estático §6.4 + docs §7 | PREDICCIÓN por análisis estático |
| I | 401 real por token inválido | Sesión activa, JWT firma-corrupta | Fetch | 401 → recovery ejecuta correctamente | Verificado por CI Job B `route.http.integration.test.ts` (13 tests) contra JWT firma-corrupta | CI `32420002095` Job B success | PASS |
| J | Error transitorio de red | Sesión activa | Interrumpir red | Fetch throws → `setRawPollError({code:"poll_network"})` sin disparar recovery | Verificado por trazado estático §6.4 (`catch { setRawPollError({code:"poll_network"}) }`) | código `page.tsx:353-355` | PASS (estática) |
| K | Sesión válida pero seed/bootstrap incompleto | `session != null`, `seedCache` vacío | Cargar página | `canOperate=false` → mensaje engañoso «Inicia sesión…» | Reproducido en acta 9.2.4 paso 5 (Actor B en Chrome incógnito) | acta 9.2.4 | FAIL (documentado como DEUDA-UX-SEED-MISSING) |
| L-navegador | `signOut` local entre navegadores/dispositivos independientes | Sesión activa en navegador A y en navegador/perfil/dispositivo B (almacenamiento independiente) | `signOut({scope:"local"})` en A | B permanece renovable y operable (el scope local NO afecta sesiones en «other devices or browsers», §7-bis) | **NO EJECUTABLE** en este entorno | docs §7-bis | PREDICCIÓN por contrato documentado |
| L-pestañas | `signOut` local entre pestañas del mismo navegador | 2 pestañas del mismo navegador+origen compartiendo la misma sesión persistida | `signOut({scope:"local"})` en pestaña A | La sesión persistida se elimina del `localStorage`. La pestaña B pierde acceso al `refresh_token`; **no puede prometerse que B permanezca operable indefinidamente**. La propagación cross-tab del evento `SIGNED_OUT` no está documentada oficialmente y debe verificarse experimentalmente en Q3 | **NO EJECUTABLE** en este entorno; contrato reformulado por R2 | docs §7-bis | NO EJECUTABLE (Q3) |

**Nota sobre NO EJECUTABLE**: la orden §FASE 4 prohíbe expresamente instalar Playwright/Puppeteer y no autoriza un navegador que este entorno agéntico no puede abrir. Los escenarios `A, C, D, E, F, H, L` requieren un navegador real y un observador humano; su clasificación como NO EJECUTABLE **no** cuenta como PASS. Se recomienda para Q2 (o para una verificación complementaria de Dirección) reproducir A/B/C/D/E/H/L manualmente o con un runner ya presente en el repo si aparece uno adecuado.

## 9 · Tests ejecutados

| Suite | Comando | Exit | Detalle | Interpretación |
|---|---|---|---|---|
| tsc raíz | `npx tsc --noEmit` | 0 | — | ✓ El repo compila |
| ESLint sobre archivos inspeccionados | `npx eslint --max-warnings 0 lib/v2/client/supabase-browser-client.ts lib/v2/client/auth-recovery-coordinator.ts lib/v2/client/seed-cache.ts app/v2/chat/page.tsx` | 0 | 0 warnings | ✓ Sin regresión de lint en la superficie auditada |
| Cliente Vitest completo | `npm run test:client` | 0 | 112 pass + **24 skipped** (13 HTTP-frontier + 11 direct-integration; ambos requieren Supabase local up) | ✓ Tests unitarios locales verdes; los skipped no son fallos, son suites que dependen de servicios externos y las ejecuta CI Job B |

**No re-ejecutados** en esta orden (por §FASE 5 «no ejecutar una revalidación integral completa de 9.2.5 salvo evidencia de regresión transversal»):
- Engine Vitest (1120 tests).
- HTTP-frontier con Supabase local levantado.
- SQL integration completa.
- Restore drill.

Todos verdes en el CI basal `32420002095`.

## 10 · Diagnóstico causal (rectificado en Q1-R1)

Aplicando la matriz de causas §FASE 6 con niveles de confianza **calibrados** para reflejar fielmente las limitaciones experimentales de esta auditoría. Esta tabla sustituye la versión inicial de Q1; los cambios de confianza quedan trazables en el commit de rectificación.

| # | Causa | Evidencia a favor | Evidencia en contra | Nivel (rectificado) | Corrección mínima futura | Pertenencia |
|---|---|---|---|---|---|---|
| 1 | Persistencia Supabase defectuosa | — | `persistSession=true` correcto en `supabase-browser-client.ts:36`; `refresh_token` sin `exp` por default (§7); acta 9.2.4 paso 3 confirma que la recarga preserva sesión y preferencias | **No se detectó defecto mediante trazado estático, documentación oficial o tests existentes; no demostrado experimentalmente en navegador real.** No se afirma que la persistencia funcione correctamente en todos los escenarios (recarga, reapertura, dos pestañas, renovación) hasta que existan pruebas experimentales reales. | Ninguna corrección propuesta en Q2; sujeto a validación experimental de Q3. | Q3 (verificación experimental) |
| 2 | Refresh automático defectuoso (a nivel SDK) | Posible throttling de background tabs (comportamiento estándar de navegadores modernos, no citado por Supabase docs) | `autoRefreshToken=true` correcto; Supabase docs no describen fallo intrínseco del mecanismo | **Posible.** No se reprodujo la caducidad natural del `access_token`, no se observó rotación del `refresh_token`, no se probó `supabase.auth.refreshSession()` en navegador. La recomendación de refresh explícito antes del logout destructivo (Vector 1 de §14) es una **corrección propuesta, todavía no validada experimentalmente**. | Diseñar en Q2 el contrato de refresh explícito on-focus / on-401 y validarlo en Q3 en navegador real. | Q2 (contrato) + Q3 (validación) |
| 3 | Inicialización/orden de bootstrap incorrecto | H-UI-1 microwindow visible por trazado estático entre `supabase!=null` y resolución de `getSession()` | Efecto único, cleanup correcto | Probable (transitorio); no reproducido en navegador. | Añadir loading state entre `supabase!=null` y `getSession()` resuelto; diseño en Q2, verificación en Q3. | Q2 + Q3 |
| 4 | Estado SPABLA no restaurado aunque la sesión siga válida | H-UI-2 mensaje engañoso confirmado por trazado (`page.tsx:516-530`); H-UI-1 microwindow por trazado estático | El estado técnico se restaura correctamente cuando ambos flujos terminan (deducido por trazado, no observado en navegador) | Probable por análisis estático; **no observado en navegador real**. | Distinguir `!session` / `!seed` / `!targetLanguage` en la UI; bootstrap server-authoritative en Q2, verificación en Q3. | Q2 + Q3 |
| 5 | seedCache ausente o caducado | **Confirmado en 9.2.4 paso 5** (Actor B navegador incógnito, observación directa aprobada por Dirección) | No aplica al paso 10 (Actor A ya tenía seedCache poblado) | **Demostrado experimentalmente para paso 5**; no aplica al paso 10. | Bootstrap server-authoritative que sustituya al `seedCache` local (Plan V1.2 §5.2 punto 4). | Q2 (contrato) + Q3 (validación) |
| 6 | Recuperación de 401 demasiado agresiva y destructiva | H-CORE-2 (por trazado estático): `applyAuth401Recovery` dispara `signOut({scope:"local"})` en cualquier 401 sin distinguir naturaleza del 401; H-CORE-3 (por trazado + docs oficiales §7): `signOut` en el navegador «removes all items from localstorage», eliminando el `refresh_token` local; H-CORE-1 (por trazado): el `access_token` se captura en el closure del `useCallback` de `fetchMessages`, permitiendo que un tick en vuelo use el token viejo tras un refresh silencioso | El coordinator es idempotente y trata correctamente 401s reales de firma corrupta o JWT revocado (CI Job B verde) | **Defecto de diseño demostrado por trazado estático + documentación oficial**: cualquier 401 conduce directamente a `signOut` local destructivo sin intentar `refreshSession()` explícito. **Causalidad histórica del paso 10 NO demostrada**: es hipótesis principal altamente plausible por el trazado, pero no se observó experimentalmente cuál cadena exacta produjo el estado «no autenticado» de A tras la pausa. | (a) `refreshSession()` explícito antes de la recovery; (b) retry con token renovado si el refresh produce sesión válida; (c) recovery destructiva SOLO si el refresh falla. Contrato en Q2, validación en Q3. | Q2 (contrato) + Q3 (validación) |
| 7 | Reinicio del entorno local confundido con pérdida de sesión | — | Actor A en pausa dentro de la misma sesión Next; no hubo reinicio de Supabase local en el paso 10 | Descartado para este incidente específico por evidencia del acta 9.2.4. | — | — |
| 8 | Error de configuración | `jwt_expiry=3600` estándar; bloque `[auth]` de `supabase/config.toml` correcto | — | Descartado por inspección estática de `supabase/config.toml`. | — | — |
| 9 | Limitación estructural de arquitectura A | La corrección propuesta (refresh explícito + retry antes de la recovery destructiva) es implementable puramente cliente-side sin `@supabase/ssr` ni PKCE; el contrato documentado de Supabase soporta el flujo | Ninguna limitación específica identificada mediante análisis estático ni documentación oficial | **No identificada mediante análisis estático ni documentación oficial; pendiente de validación experimental en navegador (Q3).** La confirmación definitiva de que A basta requiere ejecutar en navegador real la matriz de escenarios de §11 (barrera de Q3). | — | Q3 (verificación experimental) |
| 10 | Incidente no reproducible con evidencia insuficiente | El paso 10 del acta 9.2.4 registra el síntoma pero no el mecanismo interno; §5.4 del acta lo declara compatible con múltiples cadenas | El trazado estático + docs oficiales permiten formular una hipótesis principal plausible sobre la causa raíz | **El mecanismo exacto del incidente histórico continúa sin reproducirse.** Existe evidencia suficiente para diseñar la siguiente fase (Q2 contrato) y establecer barreras experimentales para Q3, pero **no para atribuir causalidad definitiva** al paso 10 sin reproducción en navegador. | — | Q3 (reproducción intentada de H sin modificar config; si irreproducible con seguridad, aceptar limitación histórica) |

**Reformulación de la causa raíz (Q1-R1)**:

- **Defecto de diseño demostrado por trazado estático + documentación oficial** (independiente del incidente histórico del paso 10): la recuperación ante cualquier 401 es directamente destructiva del `refresh_token` local, sin intento previo de renovación silenciosa. Este defecto es corregible en Q2 dentro de A.
- **Causalidad histórica no demostrada**: no se observó experimentalmente el mecanismo exacto del paso 10; múltiples cadenas siguen siendo compatibles con la evidencia visual del acta 9.2.4.

Ambas afirmaciones son distintas y esta acta las separa expresamente.

## 11 · Riesgos de seguridad y privacidad

- **No se han identificado nuevos vectores de seguridad** durante esta auditoría.
- **Reafirmación**: el `refresh_token` en `localStorage` es la superficie de riesgo conocida y aceptada por el Plan V1.2 §8.1 dentro de A. El robo de `localStorage` (por XSS o acceso físico) permitiría replay del `refresh_token` hasta que se rote o revoque; el atacante no podría, sin embargo, obtener el `service_role` (que jamás llega al navegador, §5.4 acta 9.2.4).
- **`applyAuth401Recovery` cumple correctamente** su función defensiva ante 401 real (firma corrupta / JWT revocado); el defecto identificado no es de seguridad sino de UX/coordinación.
- **Rotación de refresh_token** activa por defecto en Supabase (single-use). La corrección propuesta (refresh explícito antes de recovery) no la desactiva ni la debilita.
- **Detección de reuse** activa (docs §7). No hay evidencia de que la recovery actual la infrinja.
- **Zero secrets** filtrados durante esta auditoría: no se imprimieron access_token, refresh_token, JWT, service-role keys ni contraseñas en el acta.

## 12 · Limitaciones

- **Sin navegador real** en el entorno agéntico. Escenarios de la matriz §8 que requieren observación visual/DOM/Network devtools son NO EJECUTABLES.
- **Sin espera real de 1 hora** para reproducir caducidad natural del `access_token` (H): el diagnóstico se apoya en trazado estático + docs oficiales, no en reproducción experimental temporal.
- **Sin capacidad de instalar Playwright/Puppeteer** (prohibido por §FASE 4).
- **La reproducción independiente §16.F del Hito 9.2.5-F ya está satisfecha** por el commit externo `86d60c46…` (Hito 9.2.5-J); esta auditoría Q1 NO es reproducción independiente sino análisis técnico ejecutado por el mismo actor que promovió el Plan V1.2.
- **Fuentes secundarias descartadas**: no se ha consultado Stack Overflow, Reddit, blogs ni documentación de terceros; solo `supabase.com/docs` en fecha 2026-08-22.

## 13 · Decisión A/B/C (rectificada en Q1-R1)

**RESULTADO: A — GO CONDICIONADO PARA CONTINUAR CON LA ARQUITECTURA A**

Fundamento calibrado:

- **No existe evidencia actual que justifique migrar a B**. Ningún hallazgo del trazado estático ni de las fuentes primarias oficiales apunta a una limitación estructural del cliente browser-only con `persistSession=true` + `autoRefreshToken=true`. La barrera §5.2 del Plan V1.2 **no se activa**.
- **Los defectos identificados pueden abordarse dentro de A**. El defecto de diseño demostrado (recovery destructiva del `refresh_token` ante cualquier 401) y la anomalía UI (mensaje engañoso durante microwindow o ante seedCache incompleto) son corregibles puramente cliente-side, sin `@supabase/ssr`, sin cookies SSR, sin migración general a PKCE y sin nueva dependencia de auth.
- **La suficiencia final de A no está demostrada todavía**. No se reprodujo en navegador real ninguno de los escenarios A/C/D/E/F/H/L de la matriz §8, y la causalidad histórica del paso 10 del acta 9.2.4 sigue sin observarse experimentalmente. La documentación oficial de Supabase es compatible con el flujo propuesto, pero la compatibilidad documentada no equivale a validación experimental.
- **Q2 puede definir el contrato** (recuperación 401 no destructiva, refresh explícito + único retry, clasificación de errores, máquina de estados de bootstrap, bootstrap server-authoritative, mensajes UI diferenciados, observabilidad sin tokens, criterios de aceptación experimentales).
- **Q3 no podrá cerrarse sin pruebas reales de navegador** que ejecuten la matriz de barrera experimental de §14-bis. Un PASS documental o basado en trazado estático **no** basta para promocionar Q3.

Consecuencia operativa: Dirección puede autorizar Q2 (contrato) sin migrar a B. Q3 (implementación) queda condicionado a la barrera experimental de §14-bis.

## 14 · Recomendación para Q2 (rectificada en Q1-R1)

**Q2 se define como fase de CONTRATO, no de implementación.** Q2 diseña los contratos y los criterios de aceptación experimentales; la implementación técnica de la corrección pertenece a Q3.

Q2 debe redactarse como orden operativa separada que produzca los siguientes contratos:

### Vector 1 — contrato de recuperación 401 no destructiva

Diseñar (no implementar en Q2) el contrato que:

1. Ante el primer 401, **no** llama directamente a `notifyExpired`/`signOutLocalScope`.
2. Intenta `supabase.auth.refreshSession()` explícito.
3. Si el refresh produce una nueva sesión válida, ejecuta **un único retry** del fetch original con el nuevo `access_token`.
4. Si el refresh falla (error o `session === null` retornado), entonces ejecuta la recovery destructiva actual (`notifyExpired` + `signOutLocalScope`).
5. Preserva la idempotencia estructural del coordinator (contador global de intentos, guardián `hasAlreadyRecovered`).

**Nota sobre umbrales**: cualquier umbral temporal (por ejemplo, refresh proactivo cuando falte menos de X segundos para `session.expires_at`) debe tratarse como **parámetro a justificar con fuentes y pruebas experimentales en Q3**, no como contrato definitivo cerrado en Q2. La cifra de 60 s mencionada como ilustración en el borrador inicial de Q1 **no** es todavía valor normativo.

### Vector 2 — contrato de clasificación de errores del path autenticado

Diseñar la máquina de estados que distinga:

- 401 recuperable (access_token caducado con refresh_token válido).
- 401 irrecuperable (refresh_token revocado / cadena `reuse detection` disparada / cuenta bloqueada).
- 4xx no relacionados con auth (400 bad_request, 403 forbidden, 404 not_found, 409 conflict).
- 5xx (unavailable, internal).
- Error de red (`poll_network`) — nunca es señal de pérdida de auth.

Cada rama debe tener acción determinista y observabilidad sin exposición de tokens.

### Vector 3 — contrato de máquina de estados de bootstrap

Diseñar los estados de arranque:

- `Loading` (durante microwindow entre `supabase!=null` y resolución de `getSession()`).
- `SessionRestored` (sesión válida, esperando bootstrap de contexto).
- `ContextReady` (session + tenant + conversation + preferencias todo listo — `canOperate=true`).
- `SessionMissing` (sesión inexistente tras `getSession()` resuelto — mostrar formulario de sign-in).
- `Expired` (session revocada durante uso — mostrar notice de expiración).

Cada estado debe tener mensaje UI diferenciado y transiciones deterministas.

### Vector 4 — contrato de bootstrap server-authoritative

Diseñar (sin implementar en Q2) el endpoint que sustituya a `runSeed`+`seedCache` productivo:

- Recibe JWT del usuario autenticado.
- Devuelve `{tenantId, conversationId, conversaciones accesibles, conversación seleccionada, preferencias actor-scoped}`.
- No depende de `NODE_ENV=development` ni de `SPABLA_V2_ENABLE_DEV_SEED=1`.
- No expone service-role al navegador.
- Compatible con RLS FORCED del `spabla_v2.*` schema.

### Vector 5 — contrato de mensajes UI diferenciados

Cumple Plan V1.2 §5.2 punto 3 y §6.1:

- «Cargando…» durante `Loading`.
- «Preparando tu conversación…» durante `SessionRestored → ContextReady`.
- Formulario de sign-in solo cuando estado = `SessionMissing`.
- Notice de expiración cuando estado = `Expired`.

### Vector 6 — contrato de observabilidad sin exposición de tokens

Diseñar la telemetría del path autenticado:

- Ningún `access_token`, `refresh_token`, JWT, service-role, contraseña ni OTP en logs.
- Métricas: nº de refresh silenciosos, nº de retry tras 401, nº de recovery destructiva, nº de bootstrap failures.
- Correlation-id ya existente (`X-SPABLA-Correlation-Id`) reutilizado.

### Vector 7 — criterios de aceptación experimentales

Q2 debe redactar los criterios de aceptación **de forma que sean verificables experimentalmente en navegador real** por Q3. La barrera de §14-bis define el mínimo experimental que Q3 debe superar.

### Vector 8 — contrato de `SIGNED_OUT` cross-tab (añadido por R2)

Diseñar (sin implementar en Q2) el manejo del evento `SIGNED_OUT` a nivel navegador+origen:

- Todas las pestañas del mismo navegador+origen que tengan una instancia activa del SDK **deben** manejar el evento `SIGNED_OUT` (documentado como uno de los seis eventos oficiales de `onAuthStateChange`, §7). La propagación cross-tab del evento no está garantizada por la documentación consultada; Q2 debe diseñar la política que evite estados incoherentes tanto si la propagación ocurre automáticamente como si no.
- **Evitar** que una pestaña restaure una sesión eliminada por otra en la misma origen (no reinstanciar el cliente Supabase con `access_token`/`refresh_token` obsoletos ni consultar `localStorage["spabla_v2_fase9_auth"]` después de un evento `SIGNED_OUT` detectado).
- **Actualizar la máquina de estados de forma determinista** ante `SIGNED_OUT`: transitar a `SessionMissing` o `Expired` con los mismos criterios de UI del Vector 5.
- **Preservar las preferencias actor-scoped** (`spabla_v2:language-preferences:v1:*`) y el `seedCache` (`spabla_v2_fase9_seed`) que deban conservarse por el invariante 9.2.4: la eliminación de items del `localStorage` debe limitarse a los propios de la sesión Supabase bajo su `storageKey`; el resto de claves de la aplicación **no** deben tocarse por el signOut.
- **Observabilidad del evento sin registrar tokens**: emitir métrica de `signOutObserved` con `origen` (self / cross-tab / storage-event / manual), `correlation-id` y timestamps; nunca serializar `access_token`, `refresh_token`, JWT ni contraseña en el log.

---

## 14-bis · Barrera experimental obligatoria para Q3

La implementación (Q3) **no podrá promocionarse como cerrada** hasta verificar en navegador real, con PASS/FAIL basado en evidencia observada (Network devtools, DOM, localStorage inspection, timers reales), como mínimo los siguientes escenarios:

| # | Escenario | Criterio PASS |
|---|---|---|
| 1 | Login inicial y restauración | Sign-in con `email + password`; UI operable; `session != null`; `Authorization: Bearer` presente en fetch |
| 2 | Recarga (`Cmd+R`) | Sesión persiste; UI vuelve a operable sin flicker; preferencias y contexto restaurados |
| 3 | Cierre y reapertura de pestaña | Nueva pestaña restaura la sesión desde `localStorage["spabla_v2_fase9_auth"]`; UI operable |
| 4 | Segunda pestaña simultánea del mismo navegador | Ambas pestañas leen la misma sesión persistida bajo el mismo `storageKey`. La propagación cross-tab de eventos (`SIGNED_IN` / `TOKEN_REFRESHED`) es comportamiento no documentado oficialmente por Supabase (§7-bis) y debe demostrarse experimentalmente; la evidencia mínima es que ambas pestañas terminan operables tras un refresh silencioso |
| 5 | Dos pestañas operando concurrentemente | Sin race conditions; ambos polling loops usan el mismo `access_token` (post-refresh, ya sea propagado o releído desde `localStorage`); cero 401 espurios |
| 6 | Reinicio de Next (`kill next-server` + relanzar) manteniendo el navegador | Navegador mantiene sesión; próximo fetch a `/api/v2/messages` valida contra Supabase sin re-login |
| 7 | `access_token` caducado con `refresh_token` válido | El SDK renueva silenciosamente o el vector 1 dispara `refreshSession()` explícito; cero login visible; UI operable |
| 8 | Error transitorio de red | Fetch falla → `poll_network` mostrado; **cero logout**; al recuperarse la red, próximo tick opera sin re-login |
| 9 | 401 recuperable con refresh + retry | 401 dispara `refreshSession()`; retry con nuevo token devuelve 200; cero logout; UI operable |
| 10 | 401 irrecuperable con logout controlado | 401 con refresh_token inválido dispara recovery destructiva; formulario de sign-in visible con mensaje inequívoco de expiración; preferencias y (si se decide) seedCache preservados |
| 11 | seed/bootstrap ausente con sesión válida | Estado UI = «Preparando tu conversación…», **nunca** «Inicia sesión para ver la conversación»; endpoint server-authoritative de Q2 resuelve el contexto sin necesidad de `runSeed` dev-only |
| 12A | `signOut` local entre pestañas del mismo navegador | Precondición: 2 pestañas del mismo navegador+origen comparten la misma sesión persistida bajo el mismo `storageKey`. Criterio PASS: ejecutar `signOut({scope:"local"})` en pestaña A **elimina la sesión renovable del `localStorage` compartido**; la pestaña A pasa a `SessionMissing` / `Expired` según el contrato de Q2; la pestaña B detecta el cierre mediante `onAuthStateChange`, sincronización del SDK o la siguiente comprobación de sesión (el mecanismo específico se documenta con la evidencia observada, no se asume propagación automática); la pestaña B **no permanece indefinidamente operable con un `refresh_token` eliminado**; no se promete invalidación instantánea del `access_token` ya emitido antes de la `signOut`; no se produce bucle, race condition ni restauración fantasma de la sesión |
| 12B | `signOut` local con sesión independiente en otro navegador/dispositivo | Precondición: misma cuenta autenticada en navegador/perfil/dispositivo B con almacenamiento independiente. Criterio PASS: `signOut({scope:"local"})` en A termina únicamente la sesión de A; la sesión independiente en B permanece renovable y operable; **no se realiza `signOut` global**; no se revocan otras sesiones |

**Reglas de aceptación de la barrera**:

- Cada escenario debe producir **PASS o FAIL con evidencia observada**. `NO EJECUTABLE` no es aceptable para promocionar Q3.
- La evidencia mínima incluye: registro observable de red (Network devtools o equivalente), inspección de `localStorage`, captura de estado UI, correlation-ids.
- No se acepta trazado estático como sustituto de la observación experimental.
- No se acepta documentación oficial de terceros como sustituto de la observación experimental (aunque sigue siendo requisito para el diseño en Q2).
- Los escenarios que requieran manipulación temporal (7) pueden ejecutarse con el reloj del sistema, con expiración de token generada por medios legítimos (por ejemplo, esperar realmente los 3600 s, o expirar sesiones vía admin API sin modificar `supabase/config.toml` versionado), o con instrumentación de test que no altere código productivo.

## 15 · Criterios de aceptación propuestos para la implementación (Q2)

Sujetos a la orden operativa Q2 que redactará Dirección o su designado:

1. Ante `access_token` caducado con `refresh_token` válido, la sesión se renueva silenciosamente y el tick de polling reintenta con el nuevo token. Cero login visible.
2. Ante `refresh_token` inválido/expirado/revocado, la recovery destructiva se ejecuta con la misma idempotencia que hoy y el usuario ve el formulario de sign-in con mensaje inequívoco de expiración.
3. Cero bucle 401 (invariante heredado 9.2.4 preservado).
4. Preferencias actor-scoped y seedCache **preservados** en todo el flujo (invariante heredado 9.2.4).
5. Recarga completa, cierre/reapertura de pestaña, apertura de nueva pestaña del mismo navegador y reinicio del stack Next mantienen la sesión mientras el `refresh_token` sea usable.
6. Mensaje UI durante bootstrap distingue «Cargando sesión», «Preparando conversación» y «Sesión expirada, inicia sesión».
7. Bootstrap server-authoritative recupera `tenant / conversación / preferencias` a partir del JWT sin depender del `seedCache` local (`spabla_v2_fase9_seed`) en producción.
8. `signOut({scope:"local"})` termina la sesión local del navegador/dispositivo actual (política §15.2 de Dirección); otros navegadores, perfiles y dispositivos con almacenamiento independiente conservan sus sesiones. El efecto sobre otras pestañas del mismo navegador+origen se documenta según el contrato §7-bis y se verifica experimentalmente en Q3 (escenario 12A).
9. Cero llamadas a OpenAI durante las pruebas.
10. CI Jobs A/B/C verdes.

## 16 · Estado final del repositorio y servicios

- Rama activa: `spabla-v2/hito-9-3-1-q1-auth-continuity-audit` (creada limpiamente desde `ec31ecc…`).
- HEAD: `ec31ecc147a6312af27e8f29906aeaf64ff317a9` **(a modificarse por el commit documental de este acta)**.
- Ramas protegidas: sin cambios (oficial `ec31ecc…`, main `e6128433…`, etc. — inspección al cierre).
- Plan V1.2 intacto (SHA-256 `d063510e…7cd4`).
- AGENTS.md intacto (SHA-256 `63f2c503…e3bb`).
- Cero servicios activos (Next, Supabase, contenedores SPABLA todos detenidos).
- Puertos 3000, 54321, 54322 libres.

## 17 · SHA-256 del acta

Este apartado se completa mecánicamente tras el commit; el hash del blob quedará registrado en el mensaje del commit y verificado en el reporte final del hito.

---

## Veredicto del acta (rectificado en Q1-R1)

**HITO 9.3.1-Q1 · AUDITORÍA CERRADA — GO CONDICIONADO PARA CONTINUAR CON LA ARQUITECTURA A**

Fundamento consolidado:

- **La Arquitectura A congelada por el Plan V1.2 §15.1 permanece como única arquitectura autorizada.** La barrera §5.2 del Plan **NO se activa**. La Opción B (Next SSR / PKCE con `@supabase/ssr`) sigue prohibida sin nueva autorización expresa de Dirección.
- **Defecto de diseño demostrado** por trazado estático + documentación oficial: la recuperación ante cualquier 401 es directamente destructiva del `refresh_token` local, sin intento previo de refresh silencioso. Corregible en Q2 (contrato) + Q3 (implementación).
- **Causalidad histórica del paso 10 no demostrada**: no se observó experimentalmente el mecanismo exacto; múltiples cadenas siguen siendo compatibles con la evidencia visual del acta 9.2.4. La hipótesis principal (defecto de recovery) es altamente plausible por trazado, pero no se afirma como causa histórica definitiva.
- **La suficiencia final de A no está demostrada todavía**. No se reprodujeron en navegador real los escenarios A/C/D/E/F/H/L de la matriz §8. La confirmación definitiva requiere ejecutar la barrera experimental de §14-bis en Q3.
- **Q2 puede redactarse y ejecutarse como fase de contrato** con los 7 vectores de §14. La implementación técnica pertenece a Q3.
- **Q3 no podrá cerrarse sin PASS/FAIL experimental** en los **13 escenarios** de §14-bis (rectificados por R2, con el antiguo escenario 12 dividido en 12A pestañas del mismo navegador + 12B navegador/dispositivo independiente), con evidencia observada en navegador real. `NO EJECUTABLE` no es aceptable para promocionar Q3.

Trazabilidad de la rectificación: esta versión sustituye el veredicto inicial «GO ARQUITECTURA A» por «GO CONDICIONADO PARA CONTINUAR CON LA ARQUITECTURA A» para reflejar fielmente las limitaciones experimentales de la auditoría (ver §10 y §13 rectificados; §14 rediseñado como fase de contrato; §14-bis añadido con la barrera experimental obligatoria de Q3).
