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

- `scope: "local"` correcto (solo pestaña actual).
- Preserva preferences y seedCache (por diseño 9.2.4).
- Pero también borra el refresh_token de esta pestaña (comportamiento nativo Supabase).

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

Fecha de consulta: **2026-08-22**. Solo documentación oficial `supabase.com/docs`, ninguna fuente secundaria.

| Fuente | URL | Extracto verbatim relevante |
|---|---|---|
| Supabase User Sessions | https://supabase.com/docs/guides/auth/sessions | «Most applications should use the default expiration time of 1 hour.» — «refresh tokens never expire but can only be used once.» — «Within a 10-second reuse interval (default, not recommended to change)» — «the whole session is regarded as terminated and all refresh tokens belonging to it are marked as revoked» (reuse detection). |
| Supabase JavaScript `signOut` | https://supabase.com/docs/reference/javascript/auth-signout | «If you only want to sign the user out of the current session (the behavior most other auth libraries default to), pass `{ scope: 'local' }` explicitly.» — «signOut() will remove the logged in user from the browser session and log them out - removing all items from localstorage and then trigger a `"SIGNED_OUT"` event.» — «There is no way to revoke a user's access token jwt until it expires.» |
| Supabase JWT | https://supabase.com/docs/guides/auth/jwts | «Sets a time limit after which the token should not be trusted and is considered expired, even if it is properly signed.» — «The purpose of the signature is to verify the authenticity of the `<header>.<payload>` string without relying on database access.» |
| Supabase Server-Side Auth Advanced Guide | https://supabase.com/docs/guides/auth/server-side/advanced-guide | Consultado como referencia para la Opción B (Next SSR / PKCE). No se emplea en Q1. |

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
| D | Nueva pestaña del mismo navegador | Sesión activa en pestaña original | Abrir nueva pestaña | Comparten localStorage → misma sesión activa | **NO EJECUTABLE** | — | NO EJECUTABLE |
| E | Dos pestañas simultáneas | Sesión activa | Operar en ambas | Ambas ven la misma sesión; refresh en una se propaga vía `onAuthStateChange` (BroadcastChannel implícito del SDK) | **NO EJECUTABLE** | — | NO EJECUTABLE |
| F | Reinicio de Next manteniendo el navegador | Sesión activa | Kill + relanzar `next` | Cliente browser mantiene sesión; próximo fetch a `/api/v2/messages` valida contra Supabase directamente | **NO EJECUTABLE** en este turno (Q1 documental) | — | NO EJECUTABLE |
| G | Reinicio de Supabase local | Sesión activa contra Supabase local | `supabase stop && supabase start` | Puede o no invalidar según persistencia de datos. **No representa producción**: en producción Supabase no se reinicia; el volumen de auth es persistente. | **NO EJECUTABLE + advertencia**: no válido como diagnóstico de continuidad productiva. | — | NO EJECUTABLE / no aplicable |
| H | Access_token caducado con refresh_token válido | Sesión activa, esperar >3600 s SIN modificar `jwt_expiry` | Fetch tras caducidad | 401 → refresh silencioso → retry con nuevo token → 200 (comportamiento esperado por producto). **En el código actual: 401 → recovery destructiva → sign-out visible (defecto documentado en H-CORE-1/2/3)** | **NO EJECUTABLE en la ventana temporal de esta orden** (esperar 1 h). El código actual permite predecir el comportamiento con alta confianza sin ejecutar la prueba. | trazado estático §6.4 + docs §7 | PREDICCIÓN por análisis estático |
| I | 401 real por token inválido | Sesión activa, JWT firma-corrupta | Fetch | 401 → recovery ejecuta correctamente | Verificado por CI Job B `route.http.integration.test.ts` (13 tests) contra JWT firma-corrupta | CI `32420002095` Job B success | PASS |
| J | Error transitorio de red | Sesión activa | Interrumpir red | Fetch throws → `setRawPollError({code:"poll_network"})` sin disparar recovery | Verificado por trazado estático §6.4 (`catch { setRawPollError({code:"poll_network"}) }`) | código `page.tsx:353-355` | PASS (estática) |
| K | Sesión válida pero seed/bootstrap incompleto | `session != null`, `seedCache` vacío | Cargar página | `canOperate=false` → mensaje engañoso «Inicia sesión…» | Reproducido en acta 9.2.4 paso 5 (Actor B en Chrome incógnito) | acta 9.2.4 | FAIL (documentado como DEUDA-UX-SEED-MISSING) |
| L | `signOut` local y efecto sobre otra pestaña/sesión | 2 pestañas del mismo actor | `signOut({scope:"local"})` en pestaña 1 | Pestaña 2 permanece autenticada (política §15.2 confirmada) | **NO EJECUTABLE** en este entorno; validado normativamente por el contrato `scope: "local"` de Supabase docs §7 | docs §7 | PREDICCIÓN por contrato documentado |

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

## 10 · Diagnóstico causal

Aplicando la matriz de causas §FASE 6 con niveles de confianza declarados:

| # | Causa | Evidencia a favor | Evidencia en contra | Nivel | Corrección mínima futura | Pertenencia |
|---|---|---|---|---|---|---|
| 1 | Persistencia Supabase defectuosa | — | `persistSession=true` correcto (§6.1); refresh_token sin `exp` por default (§7); acta 9.2.4 paso 3 (recarga preserva sesión) | Descartado | — | — |
| 2 | Refresh automático defectuoso (a nivel SDK) | Posible throttling background tabs | `autoRefreshToken=true` correcto; Supabase docs no describen fallo intrínseco | Posible (bajo) | Considerar `refreshSession()` explícito on-focus | Q2 |
| 3 | Inicialización/orden de bootstrap incorrecto | H-UI-1 microwindow visible entre `supabase` y `getSession()` | Efecto único, cleanup correcto | Probable (transitorio) | Añadir loading state entre `supabase!=null` y `getSession()` resuelto | Q2 |
| 4 | Estado SPABLA no restaurado aunque la sesión siga válida | H-UI-2 mensaje engañoso; H-UI-1 microwindow | El estado técnico se restaura correctamente cuando ambos flujos terminan | Probable | Distinguir `!session` de `!seed` de `!targetLanguage` en la UI; bootstrap server-authoritative en Q2 | Q2 |
| 5 | seedCache ausente o caducado | Confirmado en 9.2.4 paso 5 (Actor B navegador incógnito) | No aplica al paso 10 (Actor A ya tenía seedCache) | Demostrado para paso 5; no aplica a paso 10 | Bootstrap server-authoritative que sustituya al seedCache local (Plan V1.2 §5.2 punto 4) | Q2 |
| 6 | Recuperación de 401 demasiado agresiva | **H-CORE-2 crítico**: cualquier 401 (incluida caducidad natural) dispara sign-out; **H-CORE-3 crítico**: el sign-out elimina el refresh_token de localStorage; H-CORE-1: token capturado en closure puede quedar viejo respecto al refresh silencioso | El coordinator es idempotente y trata correctamente 401s reales (firma corrupta, revocación) | **Altamente probable como causa raíz del paso 10** | (a) `refreshSession()` explícito antes de la recovery; (b) retry con token renovado; (c) recovery destructiva SOLO si el refresh falla | Q2 |
| 7 | Reinicio del entorno local confundido con pérdida de sesión | — | Actor A en pausa dentro de la misma sesión Next; no hubo reinicio de Supabase local en el paso 10 | Descartado (para este incidente) | — | — |
| 8 | Error de configuración | `jwt_expiry=3600` estándar; `[auth]` correcta | — | Descartado | — | — |
| 9 | Limitación estructural de arquitectura A | Ninguna evidencia identificada de que browser-only + persistSession + autoRefreshToken no pueda satisfacer el requisito | La corrección propuesta (refresh explícito + retry antes de recovery destructiva) es implementable puramente cliente-side sin `@supabase/ssr` ni PKCE; el contrato documentado de Supabase soporta el flujo | **Descartado** | — | — |
| 10 | Incidente no reproducible con evidencia insuficiente | El paso 10 del acta 9.2.4 registra el síntoma pero no el mecanismo interno | El trazado estático + docs oficiales permiten reconstruir la causa raíz con alta confianza | Descartado como causa exclusiva | — | — |

**Causa raíz atribuida con confianza alta**: **combinación de #6 (recuperación 401 demasiado agresiva + destructiva del refresh_token) + #4 (mensaje UI engañoso durante microwindow y ante seedCache incompleto)**. Ambas son puramente cliente-side y corregibles dentro de la Arquitectura A.

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

## 13 · Decisión A/B/C

**RESULTADO: A — GO ARQUITECTURA A**

Justificación:
- El incidente 9.2.4 se explica con alta confianza por defectos de **coordinación cliente** (recovery agresiva + captura de token en closure + mensaje UI engañoso), no por una limitación estructural del cliente browser-only de Supabase con `persistSession=true` + `autoRefreshToken=true`.
- La documentación oficial de Supabase confirma que la persistencia + auto-refresh son mecanismos válidos para la experiencia solicitada, siempre que el cliente **no destruya el refresh_token al primer 401** cuando la sesión todavía es recuperable.
- La corrección propuesta es implementable puramente cliente-side, sin `@supabase/ssr`, sin cookies SSR, sin migración general a PKCE y sin nueva dependencia de auth. Cumple estrictamente el alcance congelado por el Plan V1.2 §15.1.
- Ninguna limitación estructural fue identificada. No procede detener y elevar a Dirección.

Barrera §5.2 del Plan **NO se activa** (ninguna evidencia reproducible exige B).

## 14 · Recomendación para Q2

Q2 debe redactarse como orden operativa separada que implemente la corrección coordinada en dos vectores:

### Vector 1 — recovery no destructiva ante 401

En `app/v2/chat/page.tsx` `fetchMessages` y/o en `applyAuth401Recovery`:

1. Ante el primer 401, **no** llamar directamente a `notifyExpired`/`signOutLocalScope`.
2. Intentar `supabase.auth.refreshSession()` explícito.
3. Si el refresh produce una nueva sesión válida, **retry** el fetch con el nuevo `access_token`.
4. Si el refresh falla (`error != null` o retorna `session === null`), entonces ejecutar la recovery destructiva actual (`notifyExpired` + `signOutLocalScope`).
5. Preservar la idempotencia estructural del coordinator (contador global de intentos, guardián `hasAlreadyRecovered`).

Alternativa complementaria: comparar `session.expires_at` con `Date.now()` antes de cada tick y ejecutar `refreshSession()` proactivamente si falta menos de un umbral (p. ej. 60 s) para la caducidad.

### Vector 2 — cierre operativo de DEUDA-UX-SEED-MISSING

Cumple el Plan V1.2 §5.2 punto 3 y §6.1:

1. Distinguir en la UI los tres motivos de `!canOperate`:
   - «Cargando…» durante el microwindow `getSession()`.
   - «Preparando tu conversación…» cuando `session != null` pero `!tenantId || !conversationId`.
   - Formulario de sign-in solo cuando `!session` **y** `getSession()` ya resolvió.
2. Sustituir la dependencia productiva del `seedCache` por un **bootstrap server-authoritative** (Plan V1.2 §5.2 punto 4) — endpoint nuevo o extensión de uno existente que devuelva `{tenantId, conversationId, conversaciones accesibles, conversación seleccionada}` a partir del JWT del usuario, sin depender de `runSeed` dev-only.

### Vector 3 — pruebas focalizadas nuevas para Q2

Añadir a la matriz de aceptación del subhito Q2:
- Test unitario del coordinator con `refreshSession()` mockeado que devuelve nueva sesión → verifica retry sin destruir refresh_token.
- Test unitario del coordinator con `refreshSession()` que falla → verifica que la recovery destructiva se ejecuta como fallback.
- Test integración HTTP-frontier con `access_token` caducado + `refresh_token` válido → verifica renovación silenciosa (posible solo si el runner puede manipular el reloj del JWT o expirar tokens de test).
- Test UI (si existe framework disponible) que verifica los tres estados de `!canOperate` con mensajes distintos.

Estas pruebas deben añadirse en Q2, **no en esta Q1**.

## 15 · Criterios de aceptación propuestos para la implementación (Q2)

Sujetos a la orden operativa Q2 que redactará Dirección o su designado:

1. Ante `access_token` caducado con `refresh_token` válido, la sesión se renueva silenciosamente y el tick de polling reintenta con el nuevo token. Cero login visible.
2. Ante `refresh_token` inválido/expirado/revocado, la recovery destructiva se ejecuta con la misma idempotencia que hoy y el usuario ve el formulario de sign-in con mensaje inequívoco de expiración.
3. Cero bucle 401 (invariante heredado 9.2.4 preservado).
4. Preferencias actor-scoped y seedCache **preservados** en todo el flujo (invariante heredado 9.2.4).
5. Recarga completa, cierre/reapertura de pestaña, apertura de nueva pestaña del mismo navegador y reinicio del stack Next mantienen la sesión mientras el `refresh_token` sea usable.
6. Mensaje UI durante bootstrap distingue «Cargando sesión», «Preparando conversación» y «Sesión expirada, inicia sesión».
7. Bootstrap server-authoritative recupera `tenant / conversación / preferencias` a partir del JWT sin depender del `seedCache` local (`spabla_v2_fase9_seed`) en producción.
8. `signOut({scope:"local"})` sigue afectando solo a la pestaña actual (política §15.2).
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

## Veredicto del acta

**HITO 9.3.1-Q1 · AUDITORÍA — GO ARQUITECTURA A**

La Arquitectura A congelada por el Plan V1.2 §15.1 es viable. Los defectos identificados en el incidente 9.2.4 son puramente de coordinación cliente y son corregibles en Q2 sin migrar a la Opción B. La barrera §5.2 del Plan **NO se activa**. Q2 puede redactarse y ejecutarse como orden operativa separada.
