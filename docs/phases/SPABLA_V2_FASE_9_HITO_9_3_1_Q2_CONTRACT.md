# SPABLA V2 · Fase 9 · Hito 9.3.1-Q2 — Contrato de continuidad y bootstrap autenticado

**Versión**: V1.0 — CONGELADO PARA IMPLEMENTACIÓN Q3
**Fecha**: 2026-08-22
**Rama documental**: `spabla-v2/hito-9-3-1-q2-auth-continuity-contract`
**Autoría documental**: Claude Opus 4.7 (1M context) sobre `~/SPABLA` — este contrato **no autoriza implementación**; su aprobación autoriza el alcance normativo de Q3, cuya orden operativa se emitirá por separado.

---

## §1 · Autoridad, base y documentos gobernantes

- **Base oficial**: `spabla-v2/thirteen-languages-activation` @ `30749703eec6a716f0014567398de75f901dfb86`.
- **CI oficial basal**: [`32573479712`](https://github.com/DAVIDLENCINA/SPABLA/actions/runs/32573479712) — completed / success / attempt=1 / Jobs A/B/C todos verdes / PostgreSQL 17.11 / restore drill PASS.
- **Plan gobernante**: `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_PLAN.md` V1.2 CONGELADO — SHA-256 `d063510e6d9729843be443ea33b26329ad1c07494cce313842f5f886fabb2cd4`.
- **Auditoría Q1 rectificada** (fuente causal): `docs/audit_reports/AUDIT_2026-08-22_hito-9-3-1-q1-auth-continuity.md` — SHA-256 `05634cfc6622f8c7449b6c65658c5360acff0a202d1bc0515c54ff77686309f1`.
- **ADRs gobernantes intactos**: ADR-003 (Estratégica), ADR-005 (Catálogo de idiomas), ADR-008 (Persistencia y multi-tenancy).
- **Decisiones congeladas heredadas del Plan V1.2 §15.1/§15.2**: Arquitectura A (cliente Supabase browser existente, `persistSession=true`, `autoRefreshToken=true`, sin `@supabase/ssr`, sin cookies SSR, sin migración general a PKCE, sin nueva dependencia de auth); sesiones simultáneas permitidas; `signOut` local por sesión de navegador/dispositivo; gestión avanzada y revocación reservadas para 9.3.3.

## §2 · Alcance y exclusiones

**Dentro del alcance de Q2**:

- Contratos de recuperación 401, single-flight refresh, retry acotado.
- Taxonomía de errores del path autenticado.
- Máquina de estados de sesión y bootstrap.
- Contrato del endpoint bootstrap server-authoritative.
- Contrato de selección de tenant y conversación.
- Contrato de preferencias actor-scoped.
- Contrato cross-tab de eventos auth y `signOut`.
- Observabilidad sin exposición de tokens.
- Cambios previstos para Q3 desglosados por archivo.
- Barrera experimental de 13 escenarios (heredada del acta Q1 §14-bis).
- Criterio GO/NO-GO para Q3.

**Fuera del alcance de Q2**:

- Implementación de código (Q2 es documental exclusivamente).
- Redacción de tests reales (Q2 solo lista tests previstos).
- Migraciones nuevas (Q2 documenta si serían necesarias y las califica como decisión bloqueante en tal caso).
- Cambio de ADR-003 / ADR-005 / ADR-008.
- Introducción de `@supabase/ssr`, cookies SSR, PKCE general, nueva dependencia de auth (prohibido por Plan V1.2 §15.1).
- Modificación del acta Q1 promovida.
- Modificación del Plan V1.2.
- Multicuenta (§9.3.5, condicional).
- OTP, passkey, magic link (§9.3.2).
- Gestión de dispositivos y revocación individual (§9.3.3).

## §3 · Inventario del estado actual

Análisis read-only sobre el árbol `30749703…`:

**Cliente browser**:
- `lib/v2/client/supabase-browser-client.ts` — singleton module-level; `createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: STORAGE_KEY } })` donde `STORAGE_KEY = "spabla_v2_fase9_auth"`. SSR-safe. Cacheado con `useSyncExternalStore` + `subscribeNoop`.
- `lib/v2/client/auth-recovery-coordinator.ts` — `applyAuth401Recovery(deps)` idempotente; ejecuta `notifyExpired()` + `signOutLocalScope()` en cualquier 401; **no intenta refresh**.
- `lib/v2/client/seed-cache.ts` — snapshot en `useSyncExternalStore` sobre `localStorage["spabla_v2_fase9_seed"]`; populado únicamente por `writeSeedToCache()` invocado desde `runSeed()` (dev-only).
- `lib/v2/client/language-preference-store.ts` — clave `spabla_v2:language-preferences:v1:{actor_id}` en `localStorage`.
- `lib/v2/client/language-preference-hydration.ts`, `lib/v2/client/preference-storage-source.ts` — utilidades derivadas.
- `app/v2/chat/page.tsx` — bootstrap con `useEffect([supabase])` que llama `getSession()` + suscribe `onAuthStateChange`; `fetchMessages` captura `session.access_token` en el closure de `useCallback([supabase, session, tenantId, conversationId, targetLanguage])`; gate `canOperate = session && tenantId && conversationId && targetLanguage`; UI muestra literal «Inicia sesión para ver la conversación» ante `!canOperate` sin distinguir motivo.

**Endpoints V2 productivos**:
- `app/api/v2/messages/route.ts`:
  - `GET /api/v2/messages?tenantId&conversationId&to` — idempotente (lectura); 401 solo por fallo de autenticación (Hito 9.2.5-D); 404 por no-visibilidad RLS o cross-tenant (200 [] en LIST); 400 estructural (opaco); 409 conflict; 503 unavailable; 500 internal; 403 reservado.
  - `POST /api/v2/messages` — idempotencia por `clientMessageId` (UUID); nunca acepta `senderId` cliente.
- `app/api/v2/seed/route.ts` — dev-only (doble gate `NODE_ENV=development && SPABLA_V2_ENABLE_DEV_SEED=1`); GET/HEAD → 405 (Allow: POST); POST → bootstrap.

**Server-side**:
- `lib/v2/server/composition.ts` — `verifyJwt(token)` invoca `supabase.auth.getClaims(token)` que valida firma + `exp` contra JWKS; no consulta `auth.sessions`.
- `lib/v2/server/http-error.ts` — envelope uniforme `{error, correlationId}` con `X-SPABLA-Correlation-Id`; alfabeto público cerrado {bad_request, unauthorized, forbidden, not_found, conflict, unavailable, internal}; whitelist `internalKind` cerrada.
- `lib/v2/server/seed.ts`, `translation-runtime.ts` — clientes efímeros con `persistSession=false, autoRefreshToken=false`.
- `lib/v2/server/log-sanitize.ts` — sanitiza logs (whitelist).

**Config**:
- `supabase/config.toml:70`: `jwt_expiry = 3600` (1 hora).
- No hay `refresh_token_reuse_interval` explícito (default 10 s Supabase docs).

**Esquema `spabla_v2` productivo**:
- `tenants (id, name, ...)`.
- `tenant_memberships (tenant_id, actor_id, role, is_active, created_at)` — PK compuesta `(tenant_id, actor_id)`; `is_active` boolean.
- `conversations (id, tenant_id, created_by, language, created_at)` — PK `(id)`, UNIQUE `(tenant_id, id)`.
- `messages (…)`.
- `usage_ledger (…)`.
- `message_translations (…)`.

**Ausencias relevantes en el schema productivo**:
- **No existe persistencia server-side de preferencias de idioma actor-scoped**. Viven en `localStorage["spabla_v2:language-preferences:v1:*"]`.
- **No existe persistencia server-side de conversación seleccionada por actor**. Vive en `localStorage["spabla_v2_fase9_seed"]` (dev-only).
- **No existe tabla `spabla_v2.devices`** ni `auth_events`. Correcto per Plan V1.2 §5.3 (fuera de 9.3.1).

## §4 · Hallazgos sobre datos realmente persistidos

Reformulación clara para Q3:

| Dato | Fuente productiva actual | Alcance |
|---|---|---|
| `actor_id`, `email` | JWT de Supabase + `auth.users` (server) | Server-authoritative desde ADR-008 |
| `tenant_memberships` activas por actor | `spabla_v2.tenant_memberships WHERE actor_id = auth.uid() AND is_active` | Server-authoritative |
| `tenant_id` "seleccionado" | **No persistido**. Hoy se lee de `seedCache` local (dev) | Determinista computable desde memberships |
| `conversations` accesibles | `spabla_v2.conversations` bajo RLS del actor + tenant activo | Server-authoritative |
| `conversation_id` "seleccionada" | **No persistido**. Hoy se lee de `seedCache` local (dev) | Determinista computable desde conversations |
| Preferencias de idioma actor-scoped | `localStorage["spabla_v2:language-preferences:v1:{actor_id}"]` | **Local-only**. No hay tabla server-side. |

Consecuencia: **el bootstrap server-authoritative de Q3 puede implementarse sin migración nueva** leyendo únicamente el schema existente. Las preferencias de idioma permanecen locales; la conversación seleccionada se determina en el servidor mediante regla determinista (§11) sin persistir explícitamente el estado.

## §5 · Contrato de recuperación 401

Sustituye contractualmente el comportamiento actual (`page.tsx:315-337` + `auth-recovery-coordinator.ts:75-91`).

### 5.1 Primer 401 en petición autenticada

- **Prohibido** invocar `signOut` inmediatamente.
- **Obligatorio** iniciar (o compartir) una operación **single-flight** `refreshSession()` (§6).
- Si otra petición ya inició un refresh en curso, la petición actual **debe esperar** su resultado y no lanzar un refresh paralelo.

### 5.2 Refresh exitoso

- Recibir `{ data: { session, user }, error: null }` con `session.access_token` no nulo.
- Actualizar el estado React `session` mediante `setSession(newSession)` (idealmente ya notificado por `onAuthStateChange` `TOKEN_REFRESHED`, ver §13).
- **Reintentar la petición original una única vez** con el nuevo `access_token` (§7).

### 5.3 Retry autorizado

- Máximo **un** retry por petición.
- Sin bucles.
- Solo automático para operaciones **idempotentes**:
  - `GET /api/v2/messages` — idempotente por diseño.
  - `GET` del nuevo endpoint bootstrap (§10) — idempotente por diseño.
- Operaciones mutables (`POST /api/v2/messages`) requieren **contrato de idempotencia previa** que impida efectos duplicados por retry. Como el endpoint ya usa `clientMessageId` como idempotency key (Hito 9.1) y devuelve `409 conflict` ante reinserción con el mismo ID, **el retry automático está autorizado** para POST /api/v2/messages siempre que el mismo `clientMessageId` se reutilice en el retry (ya es el caso actual en `fetchMessages`/`sendMessage`).
- Operaciones mutables nuevas introducidas por Q3 sin contrato de idempotencia **no pueden reintentarse automáticamente** — deben propagar el error al UI.

### 5.4 Refresh fallido

- Clasificar el error según §8.
- Ejecutar la recovery destructiva **una única vez** (guardián `hasAlreadyRecovered`).
- Transitar a estado `Expired` (§9).
- Ejecutar `supabase.auth.signOut({ scope: "local" })` (elimina `spabla_v2_fase9_auth` del `localStorage`).
- **Preservar exclusivamente** las claves autorizadas: `spabla_v2_fase9_seed` (mantenido para compatibilidad hasta que el bootstrap server-authoritative lo reemplace en producción) y `spabla_v2:language-preferences:v1:*`.

### 5.5 Segundo 401 tras refresh exitoso + retry

- El retry falla con 401 nuevamente.
- **No refrescar de nuevo**: si el refresh acabó de dar sesión nueva y el servidor rechaza inmediatamente, es un fallo real de autenticación.
- Ejecutar recovery destructiva (§5.4).

### 5.6 Concurrencia

- Varios 401 simultáneos en distintas peticiones inflight comparten **una sola promesa** de `refreshSession()`.
- Un único resultado (éxito o fallo) alimenta a todos los awaiters.
- **Prohibido** disparar `refresh_token` reuse por lanzar dos `refreshSession` en paralelo.

### 5.7 Otros códigos HTTP — no disparan recovery

| Código | Semántica según handler `messages/route.ts` | Acción cliente |
|---|---|---|
| **400** bad_request | Fallo estructural cliente | Mostrar error al usuario; **no logout** |
| **403** forbidden | Reservado; no emitido hoy | Si Q3 empieza a recibirlo, tratar como authorization; **no logout** |
| **404** not_found | Recurso no visible por RLS o inexistente | Mostrar estado vacío; **no logout** |
| **409** conflict | Idempotencia/integrity collision | Log + no reintentar; **no logout** |
| **5xx** (500 internal, 503 unavailable) | Fallo servidor | Mostrar transient error; **no logout** |
| Network error | `fetch` throws | `poll_network`; **no logout** |
| Abort/cancel (AbortController) | Usuario o effect cleanup | `poll_aborted`; **no logout** |

## §6 · Contrato de single-flight refresh

- Debe existir un módulo `lib/v2/client/session-refresh-coordinator.ts` (nombre propuesto para Q3; Q2 solo fija el contrato).
- El módulo mantiene una **única promesa** `Promise<RefreshOutcome> | null` activa a la vez.
- `refreshSessionOnce(supabase): Promise<RefreshOutcome>` — API pública:
  - Si `activePromise` es null, invoca `supabase.auth.refreshSession()` sin argumento (usa la sesión almacenada; ver docs §16), asigna la promesa a `activePromise`, y en `finally` la limpia a null.
  - Si `activePromise` existe, retorna la misma promesa (join).
- Retorna:
  ```
  type RefreshOutcome =
    | { kind: "renewed"; session: Session }
    | { kind: "no_session" }        // refresh no produjo sesión
    | { kind: "failed"; error: RefreshError }
  ```
- **No** consume `refresh_token` explícitamente ni lo pasa como argumento (para no romper `single-use` accidentalmente).
- **No** invoca `getSession()` como sustituto de `refreshSession()` (getSession solo lee lo almacenado, no fuerza rotación).

## §7 · Contrato de retry

- Ámbito: peticiones autenticadas a `/api/v2/*`.
- Un helper `fetchWithAuthRetry(supabase, request, options?): Promise<Response>` (nombre propuesto para Q3):
  1. Obtener sesión actual del cliente (`supabase.auth.getSession()`; nunca decodificar JWT en cliente para elegir).
  2. Serializar `Authorization: Bearer ${session.access_token}` (si sesión existe).
  3. `fetch(request)`.
  4. Si `res.status !== 401` → devolver `res`.
  5. Si `res.status === 401`:
     - Si el helper ya reintentó esta petición individual (marca local, no ref-count global), devolver el `res` 401 al llamador (recovery destructiva en el caller).
     - Ejecutar `refreshSessionOnce(supabase)` (§6, single-flight).
     - Si `outcome.kind === "renewed"` → serializar nuevo `Authorization: Bearer ${outcome.session.access_token}` y reintentar **una única vez**; devolver el resultado del retry (sea 200, 401, 5xx, etc.).
     - Si `outcome.kind` es `no_session` o `failed` → devolver el `res` 401 al llamador (recovery destructiva).
- Contrato para operaciones mutables:
  - El caller declara si la operación es idempotente. Solo se usa `fetchWithAuthRetry` cuando el retry es seguro (idempotente o con `clientMessageId`).
  - Nuevas operaciones mutables sin idempotency key **no** deben pasar por el retry helper.

## §8 · Taxonomía de errores

Consolidada para uso en cliente y en `session-refresh-coordinator`:

```
type ErrorCategory =
  | "auth_missing"           // no hay Authorization; caller olvidó incluir
  | "auth_expired_refresh"   // 401 tras access caducado; se puede intentar refresh
  | "auth_hard_invalid"      // 401 tras refresh; refresh imposible; sesión terminada
  | "authorization"          // 403 forbidden (reservado; no emitido hoy)
  | "not_found"              // 404 (visibilidad RLS, cross-tenant, missing)
  | "bad_request"            // 400
  | "conflict"               // 409
  | "unavailable"            // 503 transient
  | "internal"               // 500
  | "network"                // fetch throws
  | "aborted"                // AbortController
```

**Reglas de mapeo**:
- El servidor emite exclusivamente el alfabeto `PublicErrorCode` (`http-error.ts:37`) — el cliente **no** debe inferir sub-tipos del body.
- 401 → auth_expired_refresh en el PRIMER intento; auth_hard_invalid tras un retry post-refresh que también responda 401.
- El coordinator emite `RefreshOutcome.error.category` con el mismo enum.

## §9 · Máquina de estados de sesión/bootstrap

Estados y transiciones:

```
[Initializing]
   │  (supabase client hidratado)
   ▼
[RestoringSession]
   │  getSession() completado
   ├── data.session !== null ──► [SessionReady]
   └── data.session === null ──► [SessionMissing]

[SessionReady]
   │  (bootstrap dispara automáticamente)
   ▼
[BootstrappingContext]
   │  GET /api/v2/bootstrap (§10)
   ├── 200 ─────────────────────► [ContextReady]
   ├── 401 recuperable ─────────► [Refreshing] → retry → 200/otra ──► [ContextReady] o [Expired]
   ├── 503 unavailable ─────────► [TransientError] (backoff → reintenta)
   └── 5xx no transient ────────► [TransientError] con UI de error

[ContextReady]
   │  operación normal, polling autorizado
   ├── evento SIGNED_OUT (§13) ────► [Expired]
   ├── 401 recuperable ────────────► [Refreshing]
   └── 401 hard/refresh_failed ────► [Recovering] → [Expired]

[Refreshing]
   │  single-flight refresh (§6)
   ├── renewed ───────────────────► volver al estado anterior con nuevo token
   ├── no_session / failed ───────► [Recovering]

[Recovering]
   │  ejecutar recovery destructiva (§5.4)
   ▼
[Expired]
   │  formulario de sign-in visible con notice de expiración
   │  usuario ejecuta sign-in → [Initializing]

[SessionMissing]
   │  formulario de sign-in visible (sin notice de expiración)
   │  usuario ejecuta sign-in → [Initializing]

[TransientError]
   │  ContextReady sigue "casi": UI muestra "reintentando"
   │  backoff → BootstrappingContext / fetch retry
```

Reglas invariantes:

- **El formulario de login solo puede aparecer en `SessionMissing` o `Expired`**, es decir, **después** de que `getSession()` haya resuelto y el estado se haya determinado. Nunca en `Initializing` ni en `RestoringSession`.
- **Nunca** `SessionReady → SessionMissing` sin pasar por `Refreshing` o `Recovering`.
- **Cero re-entrada** a `Refreshing` mientras ya haya un refresh in-flight (§6 single-flight).
- **`ContextReady → SessionMissing` prohibido**: cualquier pérdida de sesión operativa debe pasar por `Recovering → Expired` para que el usuario vea el notice.
- Mensajes UI por estado (§13 UI diferenciada del acta Q1):
  - `Initializing`: «Cargando SPABLA…» (spinner sutil, sin formulario).
  - `RestoringSession`: «Restaurando tu sesión…» (spinner, sin formulario).
  - `BootstrappingContext`: «Preparando tu conversación…».
  - `TransientError`: «Reintentando… (código X)».
  - `Refreshing`: idealmente invisible (background).
  - `Recovering`: transitorio, no requiere mensaje distintivo.
  - `SessionMissing`: formulario de sign-in, sin notice.
  - `Expired`: formulario de sign-in **con** notice «Tu sesión expiró. Vuelve a iniciar sesión.» (heredado del `SESSION_EXPIRED_MESSAGE` existente).
  - `SessionReady` (transitorio): no visible; UI compone según `ContextReady`.
  - `ContextReady`: UI operable estándar (LanguageControls + chat + composer).

## §10 · Contrato del bootstrap server-authoritative

**Endpoint**: `GET /api/v2/bootstrap` (nombre propuesto para Q3).

**Método**: `GET` (idempotente, seguro).

**Autenticación**: requiere `Authorization: Bearer <access_token>`. `verifyJwt` (ya existente en `composition.ts:80`) valida firma + `exp` contra JWKS.

**Petición**:
```
GET /api/v2/bootstrap
Authorization: Bearer <access_token>
```

Sin parámetros de query. Sin cuerpo.

**Respuesta 200 OK**:

```jsonc
{
  "actor": {
    "actorId": "uuid",
    "email": "string"
  },
  "memberships": [
    {
      "tenantId": "uuid",
      "tenantName": "string",
      "role": "string",
      "isActive": true
    }
    // orden: por created_at ASC de tenant_memberships
  ],
  "selectedTenantId": "uuid | null",         // primer membership activo (created_at ASC); null si no hay memberships activos
  "conversations": [
    {
      "conversationId": "uuid",
      "tenantId": "uuid",                    // igual a selectedTenantId
      "language": "es|en|...",
      "createdAt": "ISO-8601"
    }
    // solo las del selectedTenantId; orden: created_at ASC
  ],
  "selectedConversationId": "uuid | null",   // primera conversación (created_at ASC); null si selectedTenantId es null o no hay conversaciones
  "canOperate": true                          // = actor && selectedTenantId && selectedConversationId
}
```

Headers de respuesta: `X-SPABLA-Correlation-Id`. Body sin correlationId (contrato success ya existente en `http-error.ts:successJson`).

**Errores exactos** (mismo alfabeto opaco de `http-error.ts`):

- **401 unauthorized**: JWT ausente, malformado, firma inválida, expirado, identity mismatch. Body: `{ error: "unauthorized", correlationId }` + header.
- **400 bad_request**: reservado; no debería emitirse porque el endpoint no acepta parámetros de query ni body.
- **404 not_found**: reservado; no debería emitirse por diseño (el endpoint siempre existe si el usuario está autenticado).
- **500 internal**: fallo no clasificado.
- **503 unavailable**: fallo transient de dependencia (Supabase down, etc.).

**RLS y tenant isolation**:

- Todas las lecturas usan el JWT del actor.
- Cliente Supabase efímero server-side con `persistSession=false, autoRefreshToken=false` y `Authorization: Bearer ${access_token}` propagado a PostgREST (patrón heredado de `SupabasePersistence`).
- RLS `spabla_v2.tenant_memberships` filtra por `actor_id = auth.uid()`.
- RLS `spabla_v2.conversations` filtra por `tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE actor_id = auth.uid() AND is_active)` (según ADR-008; verificar en Q3 contra las policies aplicadas).
- **Prohibido** usar `service_role` en este endpoint.

**Reglas de selección determinista**:

- `selectedTenantId` = `memberships.filter(m => m.isActive).sort(created_at ASC)[0]?.tenantId ?? null`.
- `selectedConversationId` = `conversations.filter(c => c.tenantId === selectedTenantId).sort(created_at ASC)[0]?.conversationId ?? null`.

**Casos límite**:

| Situación | Respuesta |
|---|---|
| Cero memberships activas | `memberships=[]`, `selectedTenantId=null`, `conversations=[]`, `selectedConversationId=null`, `canOperate=false` |
| Exactamente 1 membership | Elegida como `selectedTenantId` |
| Varias memberships | Primera por `created_at ASC` (regla determinista; en 9.3.3 podrá parametrizarse) |
| Cero conversaciones en el tenant seleccionado | `conversations=[]`, `selectedConversationId=null`, `canOperate=false` |
| Conversación anteriormente "seleccionada" inaccesible | Ignorada; se elige por regla determinista |

**Preferencias**:

- **Preferencias de idioma actor-scoped permanecen locales** (`localStorage["spabla_v2:language-preferences:v1:{actor_id}"]`). Q3 lee del server únicamente `conversation.language` como default fallback.
- **NO se persisten en servidor en Q3**. Persistirlas server-side requeriría migración nueva (tabla `spabla_v2.actor_preferences` o extensión de `tenant_memberships`) que sería decisión bloqueante fuera del alcance actual.

**Sustitución de la dependencia productiva de `runSeed` + `seedCache`**:

- Q3 sustituye la lectura de `useSeedCache()` en `page.tsx` por una llamada a `GET /api/v2/bootstrap` al montar la sesión (transición `SessionReady → BootstrappingContext`).
- `useSeedCache` **permanece disponible como fallback dev-only** (compatibilidad con `runSeed` para desarrollo/test), pero **no** en el path productivo.
- `runSeed`/`POST /api/v2/seed` **permanecen dev-only** con los gates actuales (`NODE_ENV=development && SPABLA_V2_ENABLE_DEV_SEED=1`). No se modifican.

## §11 · Contrato de selección de tenant y conversación

Consolidado en §10 (endpoint bootstrap):

- Selección determinista por `created_at ASC` sin persistencia de "última conversación abierta".
- Cambio de tenant/conversación por el usuario **fuera del alcance de Q3** (queda para hitos posteriores donde la UI ofrezca selectores).
- Si en Q3 el usuario tiene varias conversaciones y sistemáticamente se le sirve la primera, es comportamiento esperado hasta que un hito posterior introduzca la selección manual persistida.

## §12 · Contrato de preferencias

- **Preferencias de idioma actor-scoped** (`myLanguage`, `targetLanguage`):
  - Persistencia: `localStorage["spabla_v2:language-preferences:v1:{actor_id}"]` (existente, sin cambios).
  - Lectura: `usePreferenceStorage()` + `language-preference-store.ts` (existentes).
  - Hidratación: `language-preference-hydration.ts` con defaults derivados de `initialLanguagesFor(actor, seed)` (existente).
  - Server-side no persiste preferencias en Q3.
- **`seedCache` local** (`spabla_v2_fase9_seed`):
  - Permanece disponible como fallback dev-only.
  - En producción, `page.tsx` prefiere el resultado de `GET /api/v2/bootstrap` sobre el `seedCache` local.
- **Cookies**: prohibidas por Plan V1.2 §15.1 (no `@supabase/ssr`, no SSR cookies).

## §13 · Contrato cross-tab

Aplica el contrato Q1 §7-bis + §14-bis 12A/12B:

**Eventos manejados** (`onAuthStateChange`, `page.tsx`):

- `INITIAL_SESSION`: primera resolución tras `getSession()`. Si `session != null` → transición `RestoringSession → SessionReady`; si `session == null` → `RestoringSession → SessionMissing`.
- `SIGNED_IN`: transición desde `SessionMissing` o `Expired` → `SessionReady`. Limpiar `sessionExpiredRef` (comportamiento actual preservado).
- `TOKEN_REFRESHED`: actualizar `session` reactivo; `fetchMessages` recompute su closure con el nuevo `access_token`; **no** disparar reflow del bootstrap (el `actor_id` es el mismo).
- `SIGNED_OUT`: transición forzada a `SessionMissing` (o `Expired` si viene de `Recovering`). Limpiar estado actor-scoped (`rawMessages`, `rawPollError`, `rawSendError`) manteniendo preferencias.
- `PASSWORD_RECOVERY`: fuera del alcance de Q3 (parte de 9.3.2).
- `USER_UPDATED`: si cambia `user.email` u otros campos, no requerir reautenticación; UI puede refrescar cabecera.

**Cross-tab**:

- **La propagación del evento `SIGNED_OUT` entre pestañas del mismo navegador+origen no está garantizada por la documentación oficial** (acta Q1 §7-bis).
- Q3 **debe** manejar el evento `SIGNED_OUT` cuando llegue (por cualquier vía: signOut manual, recovery destructiva, propagación del SDK si ocurre).
- Q3 **no debe** implementar coordinación cross-tab propia (BroadcastChannel, `storage` event, ni segunda fuente de verdad para la sesión). Si la propagación del SDK no ocurre en una pestaña B, la próxima petición autenticada de B fallará con 401 → Q3 pasa por el flujo estándar de refresh + recovery. Aceptable por Q2.
- Q3 **debe** verificar que la pestaña B **no restaure una sesión eliminada** desde `localStorage`:
  - `getSession()` en B tras un `signOut` en A leerá `localStorage` y encontrará la sesión eliminada → devolverá `data.session === null` → transición correcta a `SessionMissing`.
  - Si el SDK cachea la sesión en memoria en B, un tick posterior debe re-consultar `localStorage`. Este comportamiento del SDK Supabase se asume por diseño de `persistSession`; Q3 verifica experimentalmente en escenarios 12A.

**Refresh simultáneo entre pestañas**:

- Si ambas pestañas intentan refrescar simultáneamente y el `refresh_token` es single-use, la primera consume y la segunda falla → segunda pestaña entra en recovery destructiva.
- El single-flight coordinator (§6) es **por instancia del SDK, no cross-tab**. La coordinación cross-tab del refresh **no** está en el alcance de Q3.
- Aceptable: la pestaña que pierde la carrera del refresh transita a `Expired` y pide re-login. Esto es un comportamiento observado experimentalmente en Q3 (escenario 5).

## §14 · Contrato de signOut

- `signOut` desde botón cabecera: `supabase.auth.signOut({ scope: "local" })` (comportamiento actual, sin cambios). Limpieza post-signOut preserva preferencias y (transición) seedCache.
- `signOut` desde recovery destructiva: idem.
- **Prohibido** afirmar «solo esta pestaña» en cualquier reporte, PR, ADR, commit, log o mensaje al cliente. Reformulación autorizada: «cierre de la sesión local del navegador/dispositivo».
- Efecto sobre otras pestañas del mismo navegador: la sesión persistida en `localStorage` se elimina; otras pestañas pierden acceso al `refresh_token` compartido. Cualquier petición autenticada posterior en B fallará con 401 → recovery → `Expired`.

## §15 · Observabilidad

Todos los eventos con `X-SPABLA-Correlation-Id` reutilizado; ningún token/credencial en logs.

| Evento | Campos | Emisor |
|---|---|---|
| `auth_initial_session` | `correlation_id`, `has_session` (bool), `duration_ms` | Cliente `page.tsx` al resolver `getSession()` |
| `auth_refresh_started` | `correlation_id`, `trigger` (`401_recovery` / `on_focus` / `manual`) | Coordinator refresh |
| `auth_refresh_joined` | `correlation_id`, `join_count` (int) | Coordinator refresh cuando joins on-going |
| `auth_refresh_succeeded` | `correlation_id`, `duration_ms` | Coordinator refresh |
| `auth_refresh_failed` | `correlation_id`, `category` (sanitized enum §8), `duration_ms` | Coordinator refresh |
| `auth_retry_started` | `correlation_id`, `endpoint`, `attempt` (1) | Retry helper |
| `auth_retry_succeeded` | `correlation_id`, `endpoint`, `duration_ms` | Retry helper |
| `auth_retry_failed` | `correlation_id`, `endpoint`, `final_status`, `category` | Retry helper |
| `auth_recovery_destructive` | `correlation_id`, `trigger` (`401_hard` / `refresh_failed` / `manual_signout`) | Coordinator recovery |
| `bootstrap_started` | `correlation_id` | Cliente al iniciar `GET /api/v2/bootstrap` |
| `bootstrap_succeeded` | `correlation_id`, `duration_ms`, `has_selected_tenant`, `has_selected_conversation`, `conversations_count` | Cliente |
| `bootstrap_failed` | `correlation_id`, `status`, `category`, `duration_ms` | Cliente |
| `auth_signed_out` | `correlation_id`, `origin` (`self` / `cross_tab` / `storage_event` / `manual`) | `page.tsx` en `onAuthStateChange` SIGNED_OUT |

**Ausencia obligatoria**: `access_token`, `refresh_token`, JWT completo, contraseñas, OTPs, códigos, PII no esencial. Se aplica el patrón de `lib/v2/server/log-sanitize.ts` (whitelist).

## §16 · Seguridad y privacidad

- **`refresh_token` en `localStorage`**: superficie de riesgo conocida y aceptada por Plan V1.2 §8.1 dentro de Arquitectura A. Robo por XSS o acceso físico permite replay hasta rotación / revocación / reuse-detection. Q3 no debilita esta superficie; tampoco la endurece más allá de lo actual (endurecimiento adicional puede evaluarse en subhitos posteriores).
- **Rotación single-use del `refresh_token`**: activa por default en Supabase (docs §7). Q3 no la desactiva.
- **Reuse detection**: activa. Docs §7: «the whole session is regarded as terminated and all refresh tokens belonging to it are marked as revoked». Q3 la respeta (no lanzar dos `refreshSession` en paralelo; §6 single-flight).
- **`access_token` en flight tras `signOut`**: puede seguir válido hasta `exp` (docs §7-bis). Q3 no promete invalidación instantánea.
- **Cliente-side JWT decoding**: prohibido decodificar el JWT en cliente para lógica de negocio; sólo el servidor valida firma + `exp`. Cliente puede leer `session.expires_at` (campo público del Session) para refresh proactivo.
- **CORS y origin**: sin cambios respecto a Q1 (mismo origen).
- **Logs y bundle**: cero secretos. `.next/**` scan continúa siendo cero fingerprints V1 y cero credenciales productivas.
- **Producción**: cero conexión productiva durante Q3; todo el desarrollo y validación experimental usa Supabase local + `NEXT_PUBLIC_SUPABASE_URL=localhost`.

## §17 · Cambios previstos para Q3, por archivo

**Archivos nuevos**:

- `lib/v2/client/session-refresh-coordinator.ts` — implementa `refreshSessionOnce` (§6) + tests unitarios.
- `lib/v2/client/fetch-with-auth-retry.ts` — implementa `fetchWithAuthRetry` (§7) + tests unitarios.
- `lib/v2/client/bootstrap-client.ts` — cliente del endpoint bootstrap con clasificación de errores (§8, §10) + tests.
- `app/api/v2/bootstrap/route.ts` — endpoint `GET /api/v2/bootstrap` (§10) + tests handler + tests integración.
- `lib/v2/server/bootstrap.ts` — lógica server-side de composición del bootstrap.

**Archivos modificados**:

- `lib/v2/client/auth-recovery-coordinator.ts` — extendido para soportar refresh explícito antes de la recovery destructiva (§5). Preserva la idempotencia estructural. Los tests existentes deben seguir pasando; añadir nuevos tests para el vector refresh-first.
- `app/v2/chat/page.tsx`:
  - Sustituir el uso de `useSeedCache` en el path productivo por `bootstrap-client` (§10).
  - `useSeedCache` sigue disponible como fallback dev-only (`NODE_ENV=development`).
  - Sustituir el condicional `!canOperate → «Inicia sesión…»` por la máquina de estados de §9 con mensajes UI diferenciados.
  - Sustituir la llamada directa a `applyAuth401Recovery` en `fetchMessages` por `fetchWithAuthRetry` (§7).
  - `sendMessage` idem (POST /api/v2/messages, idempotente por `clientMessageId`).
- `lib/v2/client/seed-cache.ts` — sin cambios funcionales; documentar en el JSDoc que su papel productivo se retiró en Q3.

**Archivos no modificados**:

- `lib/v2/server/composition.ts`, `http-error.ts`, `translation-runtime.ts`, `seed.ts`, `translate.ts`, `log-sanitize.ts` — sin cambios.
- `app/api/v2/messages/route.ts` — sin cambios (contrato ya cubre idempotencia por `clientMessageId`).
- `app/api/v2/seed/route.ts` — sin cambios (dev-only permanece con doble gate).
- `supabase/migrations/*` — sin cambios (Q3 no requiere migración; ver §18).
- `supabase/config.toml` — sin cambios (`jwt_expiry=3600` mantenido; cualquier ajuste requeriría análisis de amenazas y decisión de Dirección).
- `.github/workflows/ci.yml` — sin cambios (CI actual ya cubre los tests que Q3 añadirá vía Jobs A/B).
- `engine/**` — sin cambios (Q3 es puramente cliente + un endpoint server).

## §18 · Migraciones previstas

**Ninguna**. Q3 puede implementarse leyendo únicamente el schema `spabla_v2` existente (§4 hallazgos). La selección de tenant y conversación es determinista por `created_at ASC` sin persistencia adicional; las preferencias de idioma permanecen en `localStorage`.

Si en subhitos posteriores (9.3.3, 9.3.5, etc.) se decide persistir preferencias server-side o soportar selección manual de conversación, esas migraciones serán autorizadas explícitamente en su propio contrato.

## §19 · Tests unitarios e integración previstos

**Tests unitarios cliente (Vitest cliente)**:

- `lib/v2/client/session-refresh-coordinator.test.ts`:
  - `refreshSessionOnce` invoca `supabase.auth.refreshSession()` una sola vez cuando se llama concurrentemente 5 veces.
  - Devuelve `renewed` cuando `refreshSession` retorna `{ data: { session } }`.
  - Devuelve `no_session` cuando `refreshSession` retorna `{ data: { session: null } }`.
  - Devuelve `failed` cuando `refreshSession` retorna `{ error: ... }`.
- `lib/v2/client/fetch-with-auth-retry.test.ts`:
  - 200 primer intento → no invoca refresh.
  - 401 → invoca refresh; refresh renewed → retry con nuevo token; el retry devuelve 200 → resultado 200.
  - 401 → refresh no_session → devuelve el 401 original.
  - 401 → refresh renewed → retry devuelve 401 → devuelve el 401 del retry (no vuelve a refrescar).
  - 500 → devuelve 500 sin refresh.
  - 400/403/404/409 → devuelve tal cual sin refresh.
  - Network error → propaga throw sin refresh.
- `lib/v2/client/bootstrap-client.test.ts`:
  - Parsea respuesta 200 correctamente.
  - Convierte 401 → `RestoringSession → SessionMissing` o `Refreshing` según contexto.
  - Convierte 5xx → `TransientError` con backoff.
- `lib/v2/client/auth-recovery-coordinator.test.ts` (extendido):
  - Verifica que la recovery destructiva **solo** se ejecuta si el refresh falla (nuevo vector).
  - Preserva la idempotencia existente.
  - Preserva las preferencias y el seedCache existente.

**Tests handler del endpoint (Vitest cliente)**:

- `app/api/v2/bootstrap/route.handler.test.ts`:
  - GET sin `Authorization` → 401 `unauthorized`.
  - GET con JWT firma-corrupta → 401.
  - GET con JWT válido y actor con 0 memberships → 200 con `memberships=[]`, `selectedTenantId=null`, `canOperate=false`.
  - GET con JWT válido y actor con 1 membership + 1 conversation → 200 completo con `canOperate=true`.
  - GET con JWT válido y actor con varias memberships → 200 selección determinista por `created_at ASC`.
  - Correlation-id emitido en respuesta 2xx y en errores.

**Tests integración HTTP frontier (Vitest cliente + Supabase local)**:

- `app/api/v2/bootstrap/route.http.integration.test.ts`:
  - Bootstrap end-to-end con Supabase local + fixture Actor A.
  - RLS: Actor A no ve conversaciones de Actor B.
  - Access_token caducado → 401 → refresh helper del test → retry → 200.

**Tests engine (Vitest engine)**:

- Ninguno nuevo. El engine no cambia.

## §20 · Barrera experimental de 13 escenarios

Copiada literalmente en sustancia del acta Q1 §14-bis (rectificada por R2). Cada escenario debe verificarse en Q3 con navegador real, PASS/FAIL con evidencia observada. `NO EJECUTABLE` no permite promoción de Q3.

| # | Escenario | Preparación | Acción | Resultado esperado | Evidencia exigida | Datos sensibles prohibidos |
|---|---|---|---|---|---|---|
| 1 | Login inicial | Cliente fresh, sin sesión | Sign-in email+password | UI ContextReady operable | Network devtools: `POST /auth/v1/token?grant_type=password` 200; DOM: chat visible | `access_token`, `refresh_token` en captura |
| 2 | Recarga | Sesión activa, UI operable | `Cmd+R` | Sesión persiste, ContextReady sin flicker | Network: `GET /api/v2/bootstrap` 200 con `Authorization: Bearer …`; DOM: chat visible | Idem |
| 3 | Cierre/reapertura pestaña | Sesión activa | Close tab; open new | Nueva pestaña restaura sesión desde localStorage | Network: `GET /api/v2/bootstrap` 200; localStorage: `spabla_v2_fase9_auth` presente | Idem |
| 4 | Segunda pestaña simultánea | Sesión activa en pestaña A | Abrir pestaña B con `/v2/chat` | Ambas leen misma sesión; ambas operables | Network en B: `GET /api/v2/bootstrap` 200 | Idem |
| 5 | Dos pestañas concurrentes | Idem | Operar simultáneamente en ambas | Sin race conditions; cero 401 espurios; refresh silencioso cross-tab detectado o ambas relean localStorage | Network en ambas: fetch 200 seguidos, un solo refresh detectable | Idem |
| 6 | Reinicio Next | Sesión activa; browser abierto | `kill next-server` + `npm run dev` | Navegador mantiene sesión; siguiente fetch 200 tras que Next arranque | Network: `/api/v2/bootstrap` 200 tras Next up | Idem |
| 7 | access_token caducado + refresh válido | Sesión activa; esperar >3600 s SIN modificar `jwt_expiry` | Intento normal de fetch | 401 recuperable → `refreshSession()` renueva → retry 200; cero login visible | Network: `POST /auth/v1/token?grant_type=refresh_token` 200; retry del fetch 200 | Idem |
| 8 | Error transitorio de red | Sesión activa | Desconectar red brevemente | Fetch falla → `poll_network`; cero logout; al reconectar → siguiente tick 200 | Network: fetch error; UI: notice transient; sin transición a `Expired` | Idem |
| 9 | 401 recuperable | Access_token caducado en flight (§7 stack) | Fetch dispara 401 recuperable | Refresh + retry → 200 | Network: 401 → refresh 200 → retry 200 | Idem |
| 10 | 401 irrecuperable | refresh_token revocado (admin API) | Fetch 401 → refresh fails | Recovery destructiva → `Expired` con notice | Network: 401 → refresh 400/401 → sin más peticiones; DOM: formulario con notice | Idem |
| 11 | Bootstrap ausente | Nuevo navegador sin `spabla_v2_fase9_seed`; sesión válida | Cargar `/v2/chat` | UI: «Preparando tu conversación…»; nunca «Inicia sesión…»; `GET /api/v2/bootstrap` resuelve contexto | Network: `GET /api/v2/bootstrap` 200; DOM: mensaje de preparación intermedio, luego chat | Idem |
| 12A | signOut entre pestañas mismo navegador | 2 pestañas del mismo navegador+origen | `signOut` en A | A → `Expired`; B detecta cierre (evento SDK o próxima petición); B no permanece indefinidamente operable con refresh_token borrado | localStorage: `spabla_v2_fase9_auth` ausente tras signOut; DOM en B: transición a formulario | Idem |
| 12B | signOut con sesión independiente | Sesión activa en navegador A y navegador/perfil B con almacenamiento independiente | `signOut` en A | A → `Expired`; B permanece operable indefinidamente (hasta caducidad natural) | localStorage de A: sin sesión; en B: sesión intacta; B sigue haciendo GET 200 | Idem |

**Reglas PASS/FAIL**:

- Cada evidencia debe capturarse **sin registrar valores de tokens** (redactar en captura).
- Un escenario es FAIL si:
  - No se ejecuta (`NO EJECUTABLE`).
  - Se ejecuta pero no coincide con "Resultado esperado".
  - La evidencia observada contradice el contrato.
- El PASS es válido solo con la evidencia declarada.

## §21 · Orden de implementación

Q3 se implementa en el siguiente orden lógico (subunidades de la orden operativa Q3 que Dirección redactará por separado):

1. **Q3.1 — Coordinator + retry helper** (backend cliente puro):
   - `session-refresh-coordinator.ts` con tests.
   - `fetch-with-auth-retry.ts` con tests.
   - No toca UI ni endpoints.
2. **Q3.2 — Endpoint bootstrap server-authoritative**:
   - `app/api/v2/bootstrap/route.ts` + `lib/v2/server/bootstrap.ts` con tests handler.
   - No toca cliente todavía.
3. **Q3.3 — Cliente bootstrap + máquina de estados UI**:
   - `bootstrap-client.ts` con tests.
   - Refactor `page.tsx`: sustituir `useSeedCache` productivo por `bootstrap-client`; introducir máquina de estados de §9; mensajes UI diferenciados.
   - `applyAuth401Recovery` extendido para el vector refresh-first.
4. **Q3.4 — Integración HTTP frontier**:
   - Test `app/api/v2/bootstrap/route.http.integration.test.ts`.
5. **Q3.5 — Barrera experimental §20**:
   - Ejecución manual/instrumentada de los 13 escenarios con evidencia.
   - Acta visual de Dirección (≤10 pasos, patrón heredado 9.2.4).
6. **Q3.6 — Promoción fast-forward** a la oficial tras CI verde.

## §22 · Rollback

- Cada subunidad Q3.N se implementa en rama de trabajo separada y se promociona por fast-forward tras CI verde (patrón heredado de Fases 7, 8, 9).
- Rollback = `git revert` del commit atómico de la subunidad antes de promoción, o abandono de la rama de trabajo.
- Migraciones: **no aplica** (Q3 no introduce migraciones).
- Endpoint bootstrap: idempotente (GET); ante fallo transient el cliente reintenta con backoff.
- Preferencias: preservadas en `localStorage` durante toda la transición Q3; ningún commit del hito debe borrar `spabla_v2:language-preferences:v1:*`.

## §23 · Riesgos y decisiones abiertas

**Riesgos técnicos** (no bloqueantes):

- **R1** — Comportamiento de `refreshSession()` bajo carrera cross-tab no documentado oficialmente. Mitigación: single-flight coordinator local por instancia (§6); la pestaña que pierde la carrera transita a Expired (aceptable per Plan V1.2 §15.2). Verificación experimental en escenario 5.
- **R2** — `TOKEN_REFRESHED` no propagado cross-tab por el SDK oficialmente. Mitigación: cada pestaña relee `localStorage` en el siguiente fetch (comportamiento estándar del SDK Supabase). Verificación experimental en escenario 4.
- **R3** — Rotación single-use del `refresh_token` en escenarios de refresh concurrente cross-tab (dos pestañas refrescan a la vez): reuse-detection podría revocar la sesión. Mitigación: aceptar el riesgo per Plan V1.2; la pestaña afectada pasa por recovery destructiva y re-login. Verificación experimental en escenario 5.
- **R4** — Latencia del endpoint bootstrap añade tiempo al time-to-first-content. Mitigación: bootstrap solo se ejecuta al montar `SessionReady → BootstrappingContext`, no en cada tick. Cache local del último bootstrap conocido puede evaluarse en subhitos posteriores.

**Decisiones abiertas** (documentadas, no requieren autorización adicional para Q3):

- **D1** — Umbral de refresh proactivo (comparar `session.expires_at` con `Date.now()`): Q2 **no fija** un umbral definitivo. Q3 puede o no implementar refresh proactivo on-focus; si lo hace, el umbral se justifica con fuentes y pruebas (ver acta Q1 §14 Vector 1).
- **D2** — Loading state UI durante `Initializing`/`RestoringSession`: Q3 decide la presentación visual concreta (spinner vs skeleton); Q2 fija solo que el formulario de sign-in **no** debe aparecer en estos estados.
- **D3** — Fallback dev-only del `seedCache`: Q3 mantiene `useSeedCache` compilado únicamente cuando `NODE_ENV=development`, o lo mantiene siempre pero lo llama solo en dev. Q2 no fuerza la decisión.

**Decisiones bloqueantes**: **NINGUNA**. Q3 puede implementarse dentro del alcance congelado del Plan V1.2 sin necesidad de:

- Nueva tabla o migración.
- Cambio de ADR-003, ADR-005 o ADR-008.
- Nueva dependencia npm.
- `@supabase/ssr` ni cookies SSR.
- PKCE general.
- Autorización adicional de Dirección.

## §24 · Criterio GO / NO-GO para Q3

**GO** requiere simultáneamente:

- Q2 aprobado por Dirección y congelado (V1.0 en este documento).
- Orden operativa Q3 redactada por separado que respete el alcance de este contrato.
- Sin necesidad de autorización adicional para migraciones o cambios de arquitectura (§23 confirma).

**NO-GO** si:

- El análisis de Q3 revela una limitación estructural no identificada en Q1-R2 que exija la Opción B (barrera §5.2 del Plan V1.2 se activa).
- Aparece un requisito no cubierto que exija migración o ADR nuevo.

**Estado actual**: GO Q3 según Q2. La orden operativa Q3 puede redactarse y ejecutarse; su cierre queda condicionado a superar la barrera experimental §20 con evidencia observada en navegador real.

---

## Veredicto del contrato

**HITO 9.3.1-Q2 · CONTRATO CONGELADO — GO Q3**

Q3 puede implementarse dentro del alcance congelado del Plan V1.2 §15.1/§15.2 sin decisiones bloqueantes. La barrera experimental §20 de 13 escenarios permanece como condición obligatoria para promocionar Q3.

---

## Addendum · Hito 9.3.1-Q3-E2E — Barrera automatizada en Chromium real

**Fecha del addendum**: 2026-08-22.
**Autorización**: Dirección aprueba, de manera excepcional y limitada,
la incorporación de `@playwright/test` **exclusivamente como
devDependency** con el único propósito de automatizar la ejecución de
los 13 escenarios contractuales de §20 sobre un navegador real
(Chromium). El addendum se emite tras la rectificación Q3-R (commit
`c27854e5cb6a1fa984c9184011ffa8d47cd24281`) y con CI Q3-R basal
[`32581065640`](https://github.com/DAVIDLENCINA/9SPABLA/actions/runs/32581065640)
verde (attempt=1 / Jobs A/B/C success).

### Alcance de la autorización

Dirección **permite exclusivamente**:

1. `@playwright/test` como devDependency (versión fijada por lockfile).
2. Ficheros de configuración y tests E2E (`playwright.config.ts`,
   `e2e/**`, `scripts/e2e/**`).
3. Un Job D específico (`Job D — auth continuity browser E2E`) en el
   workflow CI existente que instala **únicamente Chromium** de
   Playwright.
4. Registro de la barrera en el acta Q3 (sección Q3-E2E) y en este
   addendum, sin borrar el contrato original ni la matriz §20.

Dirección **NO autoriza**:

- Dependencias productivas nuevas.
- Cambios arquitectónicos de autenticación.
- Migraciones nuevas.
- Nuevas tablas o columnas.
- `@supabase/ssr`.
- Cookies SSR.
- PKCE general.
- BroadcastChannel productivo.
- Cambios funcionales ajenos a la barrera.
- Promoción a la rama oficial.

No se emite ADR: AGENTS.md/gobernanza vigente no lo exigen para una
devDep de testing.

### Matriz 13/13 (ver `docs/e2e/MATRIX.md`)

Los 13 escenarios contractuales conservan los identificadores **1..11,
12A, 12B**. NO existe un "escenario 13" textual separado en la tabla
§20; 12A y 12B son las dos variantes que completan la barrera. Cada
escenario tiene un test Playwright con el prefijo `Q2 §20-<id>` en
`e2e/auth-continuity.spec.ts`.

### Criterio de promoción a la rama oficial

Sólo puede declararse
`HITO 9.3.1-Q3-E2E · BARRERA DE CONTINUIDAD SUPERADA — GO PROMOCIÓN`
si se cumplen **simultáneamente** todos los ítems siguientes:

- 13/13 escenarios PASS en Chromium real vía Job D.
- 0 FAIL, 0 SKIP, 0 NO EJECUTABLE.
- Jobs A/B/C **y** D verdes, CI attempt=1, PostgreSQL 17 y restore
  drill PASS.
- Sesión persistente tras reapertura (§20-3).
- Renovación silenciosa del access token (§20-7).
- Fallos transitorios conservan sesión (§20-8).
- 12A sin sesión fantasma ni expulsión evitable.
- 12B mantiene sesión independiente entre BrowserContexts.
- Cero fugas cross-tenant.
- Cero secretos / tokens / bodies completos en logs, evidencias o
  aserciones.

### Impacto sobre §17

`§17.5 · Cambios previstos por archivo` no se modifica. La
implementación E2E vive exclusivamente en `e2e/`, `scripts/e2e/`,
`playwright.config.ts`, `docs/e2e/`, `.github/workflows/ci.yml`
(Job D adicional) y `package.json` / `package-lock.json` (devDep).

Cero cambio productivo. Cero migración. Cero workflow existente
reescrito (Jobs A/B/C intactos salvo el añadido del Job D como
nueva entrada de nivel superior).

### Estado tras el addendum

- Barrera §20: **AUTOMATIZADA y VERIFICABLE** vía Chromium real.
- Promoción: **BLOQUEADA** hasta que Job D reporte 13/13 PASS en CI
  attempt=1.
- Contrato original: **INTACTO**.

**HITO 9.3.1-Q2 · CONTRATO + ADDENDUM Q3-E2E — GO Q3-E2E BARRERA REAL**
