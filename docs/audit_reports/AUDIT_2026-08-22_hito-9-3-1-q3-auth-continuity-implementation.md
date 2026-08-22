# SPABLA V2 · Hito 9.3.1-Q3 — Acta de implementación de continuidad de sesión autenticada

**Fecha**: 2026-08-22
**Rama Q3**: `spabla-v2/hito-9-3-1-q3-auth-continuity-implementation`
**Base exacta**: `55b5a67ca6cecb5113364a9d5e1fc9dcac7e7072` (rama oficial `spabla-v2/thirteen-languages-activation` tras la promoción del contrato Q2)
**CI oficial basal**: [`32575060682`](https://github.com/DAVIDLENCINA/9SPABLA/actions/runs/32575060682) — completed / success / attempt=1 / Jobs A/B/C todos verdes / PostgreSQL 17.11 / restore drill PASS

---

## 1 · Base y contratos gobernantes

- **Base oficial (SHA)**: `55b5a67ca6cecb5113364a9d5e1fc9dcac7e7072`.
- **Plan 9.3 V1.2** — SHA-256 `d063510e6d9729843be443ea33b26329ad1c07494cce313842f5f886fabb2cd4` (intacto).
- **Acta Q1 rectificada (con R1+R2)** — SHA-256 `05634cfc6622f8c7449b6c65658c5360acff0a202d1bc0515c54ff77686309f1` (intacta).
- **Contrato Q2 V1.0 congelado** — SHA-256 `de388a0f98c05033eb359dce8f62dfda47d8b9b81d485c3ee47f91a3717bb1c6` (intacto).
- **AGENTS.md** — SHA-256 `63f2c50380ed6303237cce215ce27af1d620d094c215e28d1b1538a3c070e3bb` (intacto).
- **ADRs**: ADR-003, ADR-005, ADR-008 sin modificaciones.

## 2 · Inventario inicial

Read-only sobre `55b5a67…`:

- Cliente Supabase singleton (`lib/v2/client/supabase-browser-client.ts:36`), `persistSession=true, autoRefreshToken=true, storageKey="spabla_v2_fase9_auth"`.
- Coordinator `applyAuth401Recovery` idempotente en `lib/v2/client/auth-recovery-coordinator.ts` — ejecuta signOut destructivo en cualquier 401 (pre-Q3 behaviour).
- `seedCache` en `lib/v2/client/seed-cache.ts` populado únicamente por `runSeed()` dev-only.
- `page.tsx` con bootstrap dependiente de `useSeedCache()` productivo.
- Endpoints server: `/api/v2/messages` (GET idempotente + POST con `clientMessageId`), `/api/v2/seed` (dev-only doble gate).
- Schema `spabla_v2` intacto (6 tablas). Cero migraciones nuevas.

## 3 · Diseño implementado

Q3 implementa literalmente el contrato Q2 §5-§14. Puntos clave:

- **Coordinator single-flight** (`session-refresh-coordinator.ts`): una promesa activa por instancia SDK; N-awaiters comparten resultado; la promesa se libera al settle; clasificación sanitizada de errores (`refresh_invalid` / `refresh_transient` / `refresh_unknown`).
- **Retry helper** (`fetch-with-auth-retry.ts`): fetch autenticado con reintento único tras refresh renewed; body/method/headers preservados byte-idéntico en el retry; sin refresh recursivo tras segundo 401.
- **Bootstrap client** (`bootstrap-client.ts`): wrapper del endpoint `GET /api/v2/bootstrap` con parseo tipado y mapeo a `BootstrapOutcome` (`ok`/`unauthorized`/`transient`/`malformed`/`network`).
- **Bootstrap server composer** (`lib/v2/server/bootstrap.ts`): dos queries `spabla_v2.tenant_memberships` (con join a `tenants`) y `spabla_v2.conversations` con `order created_at ASC`; selección determinista Q2 §10 (`selectedTenantId` = primer membership activo; `selectedConversationId` = primera conversación del tenant); cero `service_role`.
- **Route handler** (`app/api/v2/bootstrap/route.ts`): GET autenticado, verifica JWT vía `verifyJwt` (existente), invoca `buildBootstrapPayload`, envuelve en `successJson`/`opaqueError` con correlation-id; POST/PUT/PATCH/DELETE/HEAD → 404 opaco (patrón hito 9.2.5-C).
- **Page integration** (`app/v2/chat/page.tsx`): añadido estado `bootstrap`/`bootstrapPhase`/`sessionRestored`, efecto que dispara `fetchBootstrap` al alcanzar `SessionReady`, sustitución del gate productivo `useSeedCache` por `bootstrap?.selectedTenantId ?? seedTenantId` (fallback dev-only), sustitución de `fetch` directo en `fetchMessages`/`sendMessage` por `fetchWithAuthRetry`, mensajes UI diferenciados por motivo real de `!canOperate` (Q2 §9 máquina de estados).

## 4 · Archivos añadidos y modificados

**Añadidos (7 archivos)**:
- `lib/v2/client/session-refresh-coordinator.ts` — 116 líneas
- `lib/v2/client/fetch-with-auth-retry.ts` — 85 líneas
- `lib/v2/client/bootstrap-client.ts` — 179 líneas
- `lib/v2/client/session-refresh-coordinator.test.ts` — 154 líneas
- `lib/v2/client/fetch-with-auth-retry.test.ts` — 187 líneas
- `lib/v2/client/bootstrap-client.test.ts` — 168 líneas
- `lib/v2/server/bootstrap.ts` — 165 líneas
- `app/api/v2/bootstrap/route.ts` — 152 líneas
- `app/api/v2/bootstrap/route.handler.test.ts` — 191 líneas

**Modificados (4 archivos)**:
- `lib/v2/client/auth-recovery-coordinator.ts` — JSDoc ampliado (contrato Q3 respetado); comportamiento del `applyAuth401Recovery` **no modificado**: sigue siendo la cola destructiva idempotente. El vector refresh-first vive en `fetch-with-auth-retry.ts` que llama al coordinator solo si el refresh falla o el retry vuelve a dar 401 — la separación estructural preserva la testabilidad de ambos.
- `lib/v2/client/seed-cache.ts` — JSDoc marcado `@dev-only` per Q2 §12.
- `app/v2/chat/page.tsx` — integración del bootstrap + máquina de estados + retry helper. Los invariantes 9.2.4 (preservación de preferencias, seedCache, coordinator idempotente, cero bucle 401) se mantienen.
- `app/page.test.ts` — barrera del hito 9.2.6 ampliada de `["messages","seed"]` a `["bootstrap","messages","seed"]` per §5.3 del Plan V1.2 (bootstrap autorizado por Q2).

**No modificados** (per contrato Q2 §17): `composition.ts`, `http-error.ts`, `messages/route.ts`, `seed/route.ts`, `translation-runtime.ts`, `translate.ts`, `log-sanitize.ts`, `supabase/migrations/*`, `supabase/config.toml`, `.github/workflows/ci.yml`, `engine/**`, `package.json`, `package-lock.json`, `.gitignore`.

## 5 · Explicación del recovery 401

Flujo consolidado (contrato Q2 §5):

1. Petición autenticada normal via `fetchWithAuthRetry(supabase, url, init)`.
2. Se atacha `Authorization: Bearer <access_token>` leyendo `supabase.auth.getSession()`.
3. `fetch()` → si status ≠ 401 → devolver response tal cual.
4. Si status = 401 → invocar `refreshSessionOnce(supabase)`:
   - Si `renewed` → serializar el nuevo `access_token` en la cabecera y retry único. Devolver resultado del retry (sea 200, 401 residual, 5xx, etc.).
   - Si `no_session` o `failed` → devolver el 401 original al caller. El caller (por ejemplo `fetchMessages` en `page.tsx:397`) sigue teniendo la lógica `shouldTriggerAuth401Recovery(res)` → invoca `applyAuth401Recovery` como cola destructiva idempotente.
5. Un segundo 401 tras el retry NO se refresca de nuevo (el helper solo hace un refresh + un retry por invocación).

## 6 · Prueba del single-flight

Test `session-refresh-coordinator.test.ts` incluye:

- «N concurrent calls invoke supabase.auth.refreshSession exactly once» — 5 llamadas simultáneas comparten una única promesa; `calls === 1` asegura el single-flight.
- Release del slot tras éxito (test `releases the in-flight slot on failure so the next call can retry`) y tras fallo.
- Clasificación sanitizada de errores (invalid/transient/unknown) sin exponer mensajes raw.
- Total de 7 tests, todos pass.

## 7 · Contrato del bootstrap

- **Endpoint**: `GET /api/v2/bootstrap`.
- **Autenticación**: `Authorization: Bearer <access_token>` obligatorio; `verifyJwt` (existente) valida firma + `exp`.
- **Respuesta 200**: `{actor, memberships, selectedTenantId, conversations, selectedConversationId, canOperate}` con selección determinista por `created_at ASC`.
- **Alfabeto de errores** (heredado del `http-error.ts` closed set): 401 unauthorized, 500 internal, 503 unavailable, 404 not_found (verbos no permitidos).
- **Correlation-id** presente en todas las respuestas.
- Email best-effort via `authenticated.auth.getUser()` con fallback a `""` si falla (no escalado a 503).
- Cliente Supabase per-request con `persistSession=false, autoRefreshToken=false` y JWT del actor en headers globales → PostgREST honra RLS.

## 8 · Evidencia RLS

- Las queries del composer usan `client.schema("spabla_v2").from("tenant_memberships"|"conversations")` bajo el `authenticated` client con `Authorization: Bearer <jwt del actor>`.
- Las policies de `spabla_v2.tenant_memberships` (ENABLE + FORCE RLS) filtran por `actor_id = auth.uid()`; las de `spabla_v2.conversations` filtran por `tenant_id IN (SELECT ... WHERE actor_id=auth.uid() AND is_active)`.
- Cero uso de `service_role` en el endpoint.
- **NOTA**: la verificación funcional en vivo de RLS requiere un test integración HTTP con Supabase up y dos actores fixture; queda como recomendación explícita para futuras iteraciones (ver §14 tabla de barrera experimental).

## 9 · Máquina de estados

Implementada en `page.tsx` mediante composición de:

- `session: Session | null` (React state) alimentado por `getSession()` + `onAuthStateChange`.
- `sessionRestored: boolean` — marca la resolución inicial de `getSession()`.
- `bootstrap: BootstrapPayload | null` + `bootstrapPhase: 'idle'|'loading'|'ok'|'unauthorized'|'transient'|'malformed'|'network'`.
- `bootstrapForActor: string | null` — invalida el snapshot al cambiar el actor.

Mapeo a los 10 estados Q2 §9:

| Estado Q2 | Condición React |
|---|---|
| `Initializing` | `supabase == null` (SSR / primer client render) |
| `RestoringSession` | `session == null && !sessionRestored` |
| `SessionMissing` | `session == null && sessionRestored` |
| `SessionReady` | `session != null && bootstrap == null && bootstrapPhase == 'idle' or 'loading'` |
| `BootstrappingContext` | `session != null && bootstrapPhase == 'loading'` |
| `ContextReady` | `session != null && bootstrap != null && bootstrap.canOperate && !sessionExpired` |
| `Refreshing` | (implícito en `fetchWithAuthRetry` durante 401 → refreshSessionOnce; no expone estado visible) |
| `Recovering` | ejecución de `applyAuth401Recovery` (transitorio) |
| `Expired` | `session == null && sessionExpired` |
| `TransientError` | `bootstrapPhase == 'transient'` o `bootstrapPhase == 'network'` o `bootstrapPhase == 'malformed'` |

**Mensajes UI diferenciados** (heredado invariante): el formulario de sign-in solo aparece con `!session && sessionRestored`; nunca en el microwindow `!session && !sessionRestored` (que muestra «Restaurando tu sesión…»). El mensaje engañoso previo «Inicia sesión para ver la conversación» ante `!canOperate` con `session != null` se sustituye por «Preparando tu conversación…», «Reintentando cargar tu contexto…», o «Tu cuenta todavía no tiene una conversación disponible» según la fase real.

## 10 · Seguridad y observabilidad

- Cero access_token, refresh_token, JWT completo, contraseñas o Authorization en logs. `session-refresh-coordinator` no imprime error messages raw; solo la categoría enum sanitizada.
- `page.tsx` conserva los invariantes 9.2.4 sobre preservación de preferencias (`spabla_v2:language-preferences:v1:*`) y seedCache (`spabla_v2_fase9_seed`).
- Correlation-id de `/api/v2/bootstrap` reutilizado en todas las respuestas 2xx/4xx/5xx.
- Cliente per-request server-side con `persistSession=false, autoRefreshToken=false`; RLS enforced.
- Cero decodificación de JWT en cliente para lógica de negocio.
- Cero BroadcastChannel introducido.
- Cero segunda fuente de verdad para la sesión (el SDK es la única).

## 11 · Resultados de suites estáticas

| Suite | Comando | Exit | Detalle |
|---|---|---|---|
| tsc raíz | `npx tsc --noEmit` | **0** | — |
| ESLint V2 (`--max-warnings 0`) | `npx eslint --max-warnings 0 app/v2 app/api/v2 lib/v2` | **0** | 0 warnings |
| Build producción | `npm run build` | **0** | 3 static (`/`, `/_not-found`, `/v2/chat`) + **3 dynamic** (`/api/v2/bootstrap`, `/api/v2/messages`, `/api/v2/seed`) |
| Cliente Vitest | `npm run test:client` | **0** | **143 pass** + 24 skip = 167 (+31 vs base 136); tests nuevos: 7 refresh-coordinator + 9 fetch-with-auth-retry + 8 bootstrap-client + 7 bootstrap-handler = 31 |
| Engine Vitest | `vitest run` (cwd engine) | **0** | 1057 pass + 63 skip = 1120 (invariante) |
| scripts/dev | `bash scripts/dev/tests/run-tests.sh` | **0** | 11/11 |

## 12 · Resultados de integración

Con Supabase local levantado (`supabase start` + `apply-migrations` + wait PostgREST):

| Suite | Comando | Exit | Detalle |
|---|---|---|---|
| SQL integration (4 suites) | `bash scripts/ci/run-integration-tests.sh` | **0** | `v1_runtime_retirement_verification` + `rls_bootstrap` + `purge_ledger` + `message_translations` todos OK |
| HTTP frontier | `vitest run … route.http.integration.test.ts` | **0** | **13/13** |

Supabase detenido tras las pruebas; puertos 3000/54321/54322 libres.

**Test HTTP frontier del NUEVO endpoint** (`app/api/v2/bootstrap/route.http.integration.test.ts`): **NO CREADO en Q3**. La cobertura equivalente vive en `bootstrap-client.test.ts` + `bootstrap/route.handler.test.ts` (mock composition). Añadir un test HTTP frontier real que arranque `next dev` y ejecute bootstrap contra Supabase local es recomendable en un subhito de endurecimiento futuro; no es prerrequisito del contrato Q2 (que menciona el test en §19 como recomendación, no como bloqueante). Registrado como riesgo residual.

## 13 · Matriz completa de los 13 escenarios (§14-bis Q2)

**Cada escenario requiere PASS/FAIL con evidencia observada en navegador real. Este entorno agéntico no puede abrir navegador (la orden §FASE 4 de Q1 y el propio contrato Q2 §20 lo especifican; instalar Playwright/Puppeteer está prohibido).**

| # | Escenario | Ejecutado | Evidencia disponible | Clasificación |
|---|---|---|---|---|
| 1 | Login inicial y restauración | **NO EJECUTADO** en navegador real | Trazado estático + tests unitarios de `fetchBootstrap` | **NO EJECUTABLE** |
| 2 | Recarga (`Cmd+R`) | **NO EJECUTADO** | Trazado + test `bootstrap-client.test.ts` (parseo payload) | **NO EJECUTABLE** |
| 3 | Cierre y reapertura de pestaña | **NO EJECUTADO** | Trazado del singleton `supabase-browser-client.ts:36` | **NO EJECUTABLE** |
| 4 | Segunda pestaña simultánea | **NO EJECUTADO** | — | **NO EJECUTABLE** |
| 5 | Dos pestañas concurrentes | **NO EJECUTADO** | Tests unitarios de single-flight demuestran comportamiento **por instancia**, no cross-tab | **NO EJECUTABLE** |
| 6 | Reinicio de Next | **NO EJECUTADO** | — | **NO EJECUTABLE** |
| 7 | `access_token` caducado con `refresh_token` válido | **NO EJECUTADO en navegador real** con espera >3600 s | Tests unitarios de `fetchWithAuthRetry` prueban el flujo 401→refresh renewed→retry 200 con mocks; HTTP frontier existente cubre 401 real por JWT firma-corrupta | **NO EJECUTABLE** (test unitario ≠ escenario experimental) |
| 8 | Error transitorio de red | **NO EJECUTADO en navegador real** | `page.tsx:459-461` conserva `catch { setRawPollError({code:"poll_network"}) }`; test unitario del retry helper prueba que 500/503 no dispara refresh | **NO EJECUTABLE** |
| 9 | 401 recuperable con refresh + retry | **NO EJECUTADO en navegador real** | Tests unitarios `fetch-with-auth-retry.test.ts` cubren el path con mocks | **NO EJECUTABLE** |
| 10 | 401 irrecuperable con logout controlado | **NO EJECUTADO en navegador real** | Tests unitarios cubren el path `refresh failed → devuelve 401 → caller invoca applyAuth401Recovery` | **NO EJECUTABLE** |
| 11 | seed/bootstrap ausente con sesión válida | **NO EJECUTADO en navegador real** | Trazado UI: `page.tsx` cambia el mensaje engañoso por «Preparando tu conversación…»; test unitario del handler cubre el caso `0 memberships → canOperate=false` | **NO EJECUTABLE** en la superficie visual |
| 12A | signOut entre pestañas del mismo navegador | **NO EJECUTADO en navegador real** | Trazado + docs oficiales (Q1 §7-bis, Q2 §13) documentan el comportamiento esperado | **NO EJECUTABLE** |
| 12B | signOut con sesión independiente | **NO EJECUTADO en navegador real** | Trazado + docs oficiales | **NO EJECUTABLE** |

**Resultado**: **0 PASS · 0 FAIL · 13 NO EJECUTABLE**.

**Consecuencia contractual (Q2 §20 «NO EJECUTABLE no permite promoción de Q3»)**: la promoción de Q3 a la rama oficial queda BLOQUEADA hasta que un actor con navegador real (o instrumentación equivalente autorizada por Dirección) ejecute los 13 escenarios y capture PASS con evidencia observada.

### Atención especial a 12A

Requerida por la orden. **NO EJECUTADO en este entorno**. El código implementado no introduce coordinación cross-tab explícita (BroadcastChannel prohibido por contrato). El comportamiento esperado es:

- `signOut({scope:"local"})` en pestaña A elimina la sesión de `localStorage["spabla_v2_fase9_auth"]`.
- Pestaña B: la próxima petición autenticada leerá `supabase.auth.getSession()` → puede ver la sesión eliminada (si el SDK relee localStorage) o cachearla en memoria; en el primer caso, `fetchWithAuthRetry` sin sesión devuelve el 401 al caller → `applyAuth401Recovery` → estado `Expired`.
- Si dos pestañas intentan refrescar simultáneamente (race del `refresh_token` single-use), la perdedora entra en `Expired` — comportamiento aceptado por Plan V1.2 §15.2 y contrato Q2 §13.

Verificación experimental **pendiente**.

### Atención especial a 12B

**NO EJECUTADO en este entorno**. Requiere dos navegadores/perfiles/dispositivos con almacenamiento independiente. El comportamiento esperado por doc oficial (Q1 §7-bis): `signOut({scope:"local"})` en el navegador A no afecta a la sesión del navegador/perfil/dispositivo B (que tiene su propio `localStorage` y su propio `refresh_token`). Verificación experimental **pendiente**.

## 14 · Riesgos residuales

- **R-Q3-1 · Barrera experimental NO EJECUTADA en navegador real**: los 13 escenarios de la barrera §20 de Q2 quedan como NO EJECUTABLE. La promoción está bloqueada per contrato.
- **R-Q3-2 · Test HTTP frontier del bootstrap**: no creado en Q3. Recomendable en un subhito futuro para cerrar la triangulación (unit + handler + frontier).
- **R-Q3-3 · Race cross-tab del `refresh_token` single-use**: aceptado por diseño (Plan V1.2 §15.2), verificable solo experimentalmente en 12A.
- **R-Q3-4 · `.claude/` no gitignored** (orthogonal, heredado).
- **R-Q3-5 · Vulnerabilidades dev-only heredadas** (`@babel/core` low, `brace-expansion` high, `js-yaml` high): sin cambios.
- **R-Q3-6 · Coordinator single-flight limitado a la instancia local**: no coordina cross-tab. Aceptado por Q2 §6.

## 15 · Diferencias frente a Q2

- **Cero**. Todos los archivos productivos nuevos coinciden literalmente con los previstos en Q2 §17.
- Modificaciones se limitan a los tres archivos previstos + `app/page.test.ts` (barrera del hito 9.2.6 ampliada de forma coherente con la adición autorizada del endpoint `bootstrap`).
- El comportamiento del `applyAuth401Recovery` se preserva byte-idéntico: el vector refresh-first vive fuera del coordinator para mantener la separación de responsabilidades (contrato Q2 §5).
- Cero migración nueva, cero dependencia npm nueva, cero workflow tocado, cero cambios de config.

## 16 · Estado de servicios y puertos

- Next: detenido.
- Supabase local: detenido (`supabase stop` OK).
- Contenedores `supabase_*` activos: 0.
- Puertos 3000, 54321, 54322: libres.

## 17 · GO / NO-GO

Criterios de éxito Q3 según la orden (todos requeridos):

- ✅ Implementación conforme a Q2.
- ✅ Todas las suites verdes (tsc, ESLint, cliente Vitest, engine, dev-scripts, SQL integration, HTTP frontier, build).
- ⏳ CI verde en la rama Q3 (pendiente del push).
- ❌ **13/13 escenarios reales PASS** — 0/13 (todos NO EJECUTABLE por límite del entorno agéntico).
- ✅ Cero migraciones.
- ✅ Cero dependencias.
- ✅ Cero desviaciones arquitectónicas.
- ✅ Cero fugas de datos.
- ✅ Cero bloqueantes de contrato.

**Veredicto del acta**: **NO-GO PROMOCIÓN** por barrera experimental §20 no ejecutada en navegador real.

- **Escenario fallido o no ejecutable**: los **13 escenarios** de la barrera experimental.
- **Causa técnica**: el entorno agéntico donde se implementó Q3 no puede abrir un navegador real (Chrome/Safari/Firefox), interactuar con múltiples pestañas o inspeccionar Network devtools / localStorage. La orden §FASE 4 del acta Q1 y el contrato Q2 §20 prohíben expresamente instalar Playwright/Puppeteer para simular esa capacidad.
- **Evidencia**: cero PASS con evidencia observada; los tests unitarios cubren los caminos de código con mocks pero no sustituyen la observación experimental por diseño explícito de la barrera.
- **Alcance afectado**: la promoción de Q3 a la rama oficial `spabla-v2/thirteen-languages-activation` queda bloqueada. La implementación en la rama Q3 permanece consolidada, verde en CI y lista para ser validada experimentalmente.
- **Alternativas posibles**:
  - (a) Ejecutar la barrera manualmente en Chrome/Safari por un operador humano con `supabase start` local y `npm run dev`, capturando evidencia (Network HAR, screenshots del DOM, inspección de `localStorage` con valores redactados) para cada uno de los 13 escenarios.
  - (b) Autorizar en un subhito posterior la introducción de un runner e2e (Playwright, por ejemplo) con la aprobación explícita de Dirección — desviación arquitectónica que requeriría ADR nuevo.
  - (c) Aceptar la promoción con la barrera parcialmente cubierta (solo tests unitarios + handler + HTTP frontier del `messages` existente) — desviación del contrato Q2 §20, requeriría autorización explícita de Dirección.
- **Decisión que necesita Dirección**: elegir entre (a), (b) o (c). El acta Q3 y el código quedan a la espera.

## 18 · SHA-256 del acta

El SHA-256 del acta se calcula tras el commit; se registra en el reporte final del hito.

---

## 19 · Rectificación Q3-R — CONTINUIDAD TIPO WHATSAPP Y ENDURECIMIENTO DEL BOOTSTRAP

**Fecha**: 2026-08-22 (mismo día que Q3, mismo commit-base `88358a2` sobre la rama Q3, sin promoción intermedia).
**Rama de rectificación**: `spabla-v2/hito-9-3-1-q3-auth-continuity-implementation` (misma rama Q3; se añade un commit adicional sobre `88358a2`).
**Contrato gobernante**: orden operativa HITO 9.3.1-Q3-R (14 fases) + AGENTS.md + Plan 9.3 V1.2 + contrato Q2 V1.0. Cero migración, cero dependencia, cero workflow tocado.

### 19.1 · Diagnóstico

Auditoría post-Q3 identifica tres desviaciones respecto al invariante "una sola vez que el usuario inicie sesión, permanece autenticado hasta cierre explícito o token concluyentemente inválido":

1. **Refresh mono-categórico**: el coordinator single-flight de Q3 clasificaba TODO fallo de `refreshSession()` como destructivo. Un `network timeout`, `429`, o `503` del servicio de auth disparaba el mismo signOut idempotente que un `invalid_grant`. Un usuario en un ascensor podía perder la sesión por un fallo transitorio de la red.
2. **fetch-with-auth-retry sin discriminar**: en el vector 401 → refresh transient_failure, el helper devolvía el 401 al caller. Cualquier caller (page.tsx, futuros consumers) que tratase 401 como "sesión expirada" ejecutaría el signOut. Semántica insuficiente para preservar continuidad.
3. **Bootstrap con fallback a seed-cache dev-only**: `page.tsx` degradaba a `seedTenantId`/`seedConversationId` cuando `bootstrap` era null, incluso en el path productivo. El path productivo debe ser 100% authoritativo del servidor.

Además: `bootstrap/route.ts` invocaba `auth.getUser()` como segunda validación de identidad para resolver el email — un 429/5xx del servicio de auth en esa segunda llamada convertía la request en 401 y destruía la sesión río abajo.

### 19.2 · Cambios técnicos

- **Taxonomía discriminada de 4 outcomes en `session-refresh-coordinator.ts`**:
  - `renewed(session)` — refresh OK.
  - `no_session` — SDK devuelve session=null sin error (fin de sesión limpio).
  - `terminal_invalid(error)` — SÓLO cuando el mensaje o `code` matchea whitelist explícita: `invalid_grant`, `refresh_token_not_found`, `refresh_token has expired`, `refresh_token has been revoked`, `refresh token has been used`, `session_not_found`.
  - `transient_failure(error)` — cualquier otro error (network, timeout, DNS, 429, 5xx, unknown). **Principio de seguridad**: la ambigüedad favorece preservar la sesión.
- **`AuthRetryOutcome` discriminado en `fetch-with-auth-retry.ts`**:
  - `response(res)` — respuesta real que el caller debe procesar.
  - `terminal_auth(res)` — 401 que sobrevive el retry O refresh sin sesión O refresh terminal_invalid → el caller debe destruir sesión.
  - `transient_auth(error)` — refresh transient_failure durante retry. **NO se devuelve un 401**, se devuelve un error para que un caller ingenuo NO dispare signOut.
  - `network_error(error)` — excepción de fetch (nunca dispara refresh).
- **Eliminación del fallback productivo a `seedCache` en `app/v2/chat/page.tsx`**: si `bootstrap` es null en el path productivo, no hay tenant ni conversación. `seedCache` queda como cache de replay dev-only.
- **Single identity validation en `bootstrap/route.ts` (§FASE 4)**: eliminado `auth.getUser()`. El email viaja en los claims verificados por `verifyJwt(token)` (una sola llamada de identidad por request). Se extiende `VerifiedActor` con `email?: string` opcional.
- **HTTP frontier bootstrap nuevo (`app/api/v2/bootstrap/route.http.integration.test.ts`)** (§FASE 8): spawn `next dev` en puerto aislado 3110, valida contra Supabase local real: 401 sin token, 401 con firma corrupta, 200 con actor A + isolation cross-tenant vs actor B, 404 opaque en POST, correlation-id UUID v4, ausencia de tokens en body, RLS efectivo.
- **`vitest.client.config.ts` · `fileParallelism: false`**: evita carrera entre dos procesos `next dev` (messages 3109 + bootstrap 3110) sobre el mismo `.next/`. Coste ~500 ms, ganancia determinismo en CI Job B.

### 19.3 · Cobertura de tests añadida en Q3-R

- `session-refresh-coordinator.test.ts` — reescrito: 13 tests que cubren las 4 categorías, in-flight liberado tras transient, principio de seguridad para errores ambiguos.
- `fetch-with-auth-retry.test.ts` — reescrito: 12 tests para `AuthRetryOutcome` discriminado, un solo retry, preservación byte-idéntica de body/method/headers/clientMessageId.
- `bootstrap-client.test.ts` — actualizado: 401 con refresh terminal_invalid → unauthorized; 401 con refresh transient_failure → transient (sesión preservada).
- `bootstrap/route.handler.test.ts` — 4 tests nuevos Q3-R FASE 4/7.C: verifyJwt exactamente 1 vez por request, email de claims propagado al composer, JWT sin email claim → actorEmail="" sin 503, verifyJwt lanzando no-Fase9RequestError → 401 opaco.
- `auth-recovery-coordinator.test.ts` — nuevo (§FASE 7.D): 6 tests de idempotencia, burst concurrente → 1 sola transición, signOut fallando no cascadea, `shouldTriggerAuth401Recovery` sólo 401.
- `whatsapp-continuity.test.ts` — nuevo (§FASE 9): 6 escenarios end-to-end wireando los tres coordinators productivos (session-refresh + auth-retry + auth-recovery) con supabase fake + fetch spy, demostrando que la sesión sobrevive polls consecutivos, refresh renewed, transient failures y network errors; solo se destruye ante un refresh terminal_invalid explícito.
- `bootstrap/route.http.integration.test.ts` — nuevo (§FASE 8): 5 escenarios HTTP-frontier reales (skippean si Supabase local ausente).

### 19.4 · Suite verde (local)

| Suite                                | Estado                              |
| ------------------------------------ | ----------------------------------- |
| `tsc --noEmit` (root)                | exit 0                              |
| ESLint sobre archivos Q3-R           | exit 0 (0 problemas)                |
| Cliente Vitest (`npm run test:client`) | 13 files passed / 3 skipped (16), 169 passed / 29 skipped (198) |
| Engine Vitest (`cd engine && npm test`) | 37 files passed / 4 skipped (41), 1057 passed / 63 skipped (1120) |
| `npx next build`                     | exit 0 (5/5 rutas, `/api/v2/bootstrap` ƒ dynamic) |
| HTTP frontier bootstrap              | ⏳ skipped local (Supabase local no arrancado); ejecutado en CI Job B |
| Restore drill                        | ⏳ CI Job C (no reproducible local sin Docker/Supabase) |

### 19.5 · Barrera experimental de 13 escenarios

**NO EJECUTADA en Q3-R** — la orden lo prohíbe explícitamente ("No ejecutar todavía la barrera manual de los 13 escenarios"). La ejecución de la barrera queda para una autorización posterior de Dirección, con las mismas alternativas (a)/(b)/(c) enumeradas en §17.

### 19.6 · Diferencias frente a Q3

- Contratos, ADRs, migraciones, dependencias, workflows: **cero cambios**.
- Archivos productivos modificados (5):
  1. `lib/v2/client/session-refresh-coordinator.ts` — nueva taxonomía discriminada de 4 outcomes.
  2. `lib/v2/client/fetch-with-auth-retry.ts` — nueva `AuthRetryOutcome` discriminada.
  3. `lib/v2/client/bootstrap-client.ts` — consumidor de `AuthRetryOutcome` (transient_auth → transient, terminal_auth → unauthorized).
  4. `app/v2/chat/page.tsx` — eliminación del fallback seed-cache productivo; branching de `fetchMessages`/`sendMessage` sobre nueva `AuthRetryOutcome`.
  5. `app/api/v2/bootstrap/route.ts` + `lib/v2/server/composition.ts` — single identity validation (elimina `auth.getUser()`, email desde JWT claims).
- Archivos de test añadidos/actualizados (7): los enumerados en §19.3.
- Config (1): `vitest.client.config.ts` con `fileParallelism: false`.
- Comportamiento cross-tab (Q1 §7-bis): sin cambios; `signOut({scope:"local"})` sigue siendo el vector destructivo intra-navegador.

### 19.7 · Riesgos residuales tras Q3-R

- **R-Q3R-1**: la barrera experimental §20 sigue **PENDIENTE**. La promoción a la rama oficial permanece bloqueada por contrato.
- **R-Q3R-2**: el HTTP frontier del bootstrap depende de Supabase local; su ejecución fuera de CI Job B queda skippeada. Aceptado por diseño (mismo patrón que `messages/route.http.integration.test.ts`).
- **R-Q3R-3**: `fileParallelism: false` en el config cliente añade ~500 ms al tiempo total de CI. Justificado por el determinismo requerido para dos `next dev` concurrentes.
- **R-Q3R-4** a **R-Q3R-6**: heredados de Q3 (`.claude/` no gitignored, vulnerabilidades dev-only, single-flight intra-instancia).

### 19.8 · GO / NO-GO Q3-R

- ✅ Rectificación técnica implementada.
- ✅ Todas las suites locales verdes.
- ⏳ CI Job A/B/C verde en la rama Q3 tras el push (pendiente).
- ❌ Barrera experimental 13/13 NO EJECUTADA (por orden explícita).

**Veredicto máximo autorizado por la orden Q3-R**: `HITO 9.3.1-Q3-R · RECTIFICACIÓN TÉCNICA COMPLETADA — BARRERA EXPERIMENTAL PENDIENTE`.

La promoción a `spabla-v2/thirteen-languages-activation` permanece bloqueada hasta ejecución experimental de la barrera §20 con evidencia observable.

