# SPABLA V2 · Hito 9.3.2-A-Q2 · Implementación server-side atómica del onboarding

**Fecha**: 2026-08-25.
**Rama**: `spabla-v2/hito-9-3-2-a-q2-atomic-onboarding-implementation`.

## 1 · Base exacta

`2ca865e532b60a434fabf47b99dc71cc061ee216` (`spabla-v2/thirteen-languages-activation`, cerrada por `HITO 9.3.2-A-Q1-RR-SCOPE-P · CONTRATO FINAL DE ONBOARDING PROMOVIDO A OFICIAL — CERRADO`).

## 2 · Rama

`spabla-v2/hito-9-3-2-a-q2-atomic-onboarding-implementation` creada exactamente desde `2ca865e`, sin merge, sin cherry-pick, sin rebase.

## 3 · Contrato gobernante

`docs/phases/SPABLA_V2_FASE_9_HITO_9_3_2_A_ONBOARDING_CONTRACT.md` (versión **Q1-RR-SCOPE**, oficial). Todos los 58 escenarios de la matriz §14 se traducen a identificadores estables `Q2-01`..`Q2-58` distribuidos entre unit tests, SQL integration y HTTP-frontier integration.

## 4 · Arquitectura implementada

Separación estricta puerto/adaptador:

- **Puertos de dominio** (`lib/v2/server/onboarding.ts`) — `PersonalWorkspaceProvider`, `ActorLifecycleReader`, `PersonalWorkspaceLabelPresenter`; tipos `ActorId`, `CanonicalLocale`, `PersonalWorkspaceResult`, `LifecycleState`; excepciones `OnboardingOrphanMappingError`, `OnboardingTransientError`, `OnboardingInternalError`. Cero mención de Supabase / Postgres / RLS / service_role en las interfaces.
- **Adaptador Supabase** (`lib/v2/server/onboarding.supabase.ts`) — `SupabasePersonalWorkspaceProvider` invoca la RPC transaccional; `SupabaseActorLifecycleReader` consulta la tabla mínima. Instancia el cliente privilegiado con `buildPrivilegedSupabaseClient()` (patrón `translation-runtime.ts`).
- **Presenter server-owned** (`lib/v2/server/onboarding-labels.ts`) — catálogo cerrado de 13 idiomas + normalización defensiva de `Accept-Language` (`normaliseLocaleHint`).
- **Servicio/orquestador** (`lib/v2/server/onboarding-service.ts`) — `runOnboarding(deps, input)` encadena lifecycle → RPC → presenter y devuelve un outcome tipado sin excepciones para estados esperados.
- **Handler HTTP** (`app/api/v2/onboarding/route.ts`) — `POST` único; `GET/PUT/PATCH/DELETE/HEAD` → `404 not_found` opaco.
- **Ajuste bootstrap** (`lib/v2/server/bootstrap.ts:93`) — `canOperate = selectedTenantId !== null` según contract §11.

## 5 · Migraciones

Añadida exactamente una migración canónica y aditiva:

- `supabase/migrations/20260824180000_hito_9_3_2_a_atomic_onboarding.sql` — timestamp lexicográficamente posterior a la última migración existente (`20260817000000_v1_runtime_retirement.sql`). Zero modificación de tablas, funciones o policies preexistentes.

## 6 · Tablas

- `spabla_v2.actor_personal_workspace(actor_id uuid PK, tenant_id uuid UNIQUE, created_at timestamptz DEFAULT now())`.
- `spabla_v2.actor_lifecycle_state(actor_id uuid PK, deletion_pending boolean DEFAULT false, legal_hold boolean DEFAULT false, updated_at timestamptz DEFAULT now())`.

## 7 · Constraints

- `actor_personal_workspace_pkey PRIMARY KEY (actor_id)`.
- `actor_personal_workspace_tenant_id_key UNIQUE (tenant_id)`.
- `actor_personal_workspace_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES spabla_v2.tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT`.
- `actor_lifecycle_state_pkey PRIMARY KEY (actor_id)`.

## 8 · Índices

Índices implícitos derivados de PK y UNIQUE: `actor_personal_workspace_pkey (btree)`, `actor_personal_workspace_tenant_id_key (btree UNIQUE)`, `actor_lifecycle_state_pkey (btree)`.

## 9 · RLS

- `spabla_v2.actor_personal_workspace`: `ENABLE ROW LEVEL SECURITY + FORCE ROW LEVEL SECURITY`. Cero policy.
- `spabla_v2.actor_lifecycle_state`: `ENABLE ROW LEVEL SECURITY + FORCE ROW LEVEL SECURITY`. Cero policy.

## 10 · Policies

Cero policy sobre las dos tablas nuevas. Los actores autenticados no tienen acceso ordinario; la lectura se hace exclusivamente vía `service_role` server-side. Bootstrap posterior devuelve la información derivada al cliente sin exponer la tabla del mapping.

## 11 · Grants/revokes

- Cero grants a `anon` sobre las dos tablas.
- Cero grants a `authenticated` sobre las dos tablas.
- `service_role`: `SELECT, INSERT, UPDATE, DELETE` sobre ambas.
- RPC `admin_ensure_personal_workspace(uuid)`: `REVOKE EXECUTE FROM PUBLIC, anon, authenticated`; `GRANT EXECUTE TO service_role`.

## 12 · Firma RPC exacta

```sql
CREATE OR REPLACE FUNCTION spabla_v2.admin_ensure_personal_workspace(
    p_actor_id uuid
)
    RETURNS TABLE (tenant_id uuid, role text, created boolean)
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, spabla_v2
```

**Un único parámetro `uuid`.** Cero `p_workspace_label`, `p_label_key`, `p_locale`, `p_name` o cualquier `text` procedente del endpoint o de otro caller (contract I-14, S21). La clave interna fija `workspace.personal.default` se codifica como `constant text` dentro del cuerpo y se pasa a `admin_create_tenant`. Ningún caller privilegiado puede sustituir ese texto por esta vía.

## 13 · Seguridad de search_path

`SET search_path = pg_catalog, spabla_v2` en la definición de la función. Todas las llamadas internas usan calificadores completos (`spabla_v2.admin_create_tenant`, `spabla_v2.admin_add_membership`, `spabla_v2.actor_personal_workspace`, `spabla_v2.tenant_memberships`, `spabla_v2.tenants`, `pg_catalog.pg_advisory_xact_lock`, `pg_catalog.hashtextextended`). Cero uso de `public.*` en el cuerpo.

## 14 · Flujo transaccional

Cinco pasos dentro de una única transacción PL/pgSQL:

1. Validación estructural de `p_actor_id` (RAISE `22023` si `NULL`).
2. `pg_advisory_xact_lock(hashtextextended(p_actor_id::text, 9321))` — serialización por actor (contract §3.5 E2).
3. Lookup idempotente en `actor_personal_workspace`; si existe:
   - (3.a) Verificar que el tenant referenciado existe. Si no → `RAISE EXCEPTION USING ERRCODE = '23503'` — mapping huérfano detectado (contract §5 B/D, §14 rows 10 + 48). El adaptador convierte a `500 internal` opaco.
   - (3.b) `UPDATE tenant_memberships tm SET is_active = TRUE WHERE tm.tenant_id = v_existing_tenant AND tm.actor_id = p_actor_id` — reactivación de membership (contract §17-ter B, §14 row 9). Columnas calificadas con alias para evitar shadowing con `RETURNS TABLE`.
   - Retorno `(v_existing_tenant, 'owner', FALSE)`.
4. Si no existe: `admin_create_tenant('workspace.personal.default')` → `INSERT actor_personal_workspace` → `admin_add_membership(v_new_tenant, p_actor_id, 'owner')` → retorno `(v_new_tenant, 'owner', TRUE)`.

Cualquier `RAISE EXCEPTION` en cualquier paso revierte todo el flujo (atomicidad garantizada por PL/pgSQL).

## 15 · Endpoint

`POST /api/v2/onboarding` en `app/api/v2/onboarding/route.ts` con:

- `export const dynamic = "force-dynamic"; export const runtime = "nodejs";`
- Autenticación via `extractBearerToken` + `verifyJwt` (composition.ts).
- Body tolerante: cualquier body (objeto, array, string, número, `null`, JSON malformado) se ignora sin efecto y sin error de campo; jamás produce `500` por parseo.
- `Accept-Language` opcional se normaliza contra el catálogo cerrado; nunca alcanza la RPC.
- Respuesta éxito: `200 OK` con `{tenantId, role:"owner", label}`. `created` se registra en observabilidad server-side, no en el body (contract §10).
- Verbos no permitidos (`GET`/`PUT`/`PATCH`/`DELETE`/`HEAD`) → `404 not_found` opaco.

## 16 · Alfabeto HTTP

Cerrado: `200 OK`, `401 unauthorized`, `404 not_found`, `500 internal`, `503 unavailable`. Cero `400`, `409`, `422`. Cada respuesta con `X-SPABLA-Correlation-Id: <UUID v4>`. Los 4xx/5xx llevan body `{error, correlationId}`. Los 200 no inyectan `correlationId` en el body (patrón hito 9.2.5-D preservado).

Códigos por estado interno (contract §17-ter H):

| Estado | Código HTTP |
|---|---|
| activo (sin mapping) | `200 OK` (creación) |
| ya onboarded | `200 OK` (idempotente) |
| membership desactivada | `200 OK` (reactivación) |
| mapping huérfano detectado (§9 3.a) | `500 internal` (`orphan_mapping_detected`) |
| `deletion_pending=true` | `503 unavailable` (`deletion_pending_blocked`) |
| `legal_hold=true` | `503 unavailable` (`legal_hold_blocked`) |
| Auth inválido | `401 unauthorized` |

## 17 · Presenter

`PersonalWorkspaceLabelPresenter` con catálogo cerrado server-owned. Ningún texto se persiste (contract §17-bis 15): `tenants.name` siempre almacena la clave interna fija `workspace.personal.default`; el `label` sólo se devuelve en la respuesta HTTP para presentación inmediata.

`normaliseLocaleHint(hint)` reduce cualquier pista externa (`Accept-Language`, preferencia del actor) a uno de los 13 códigos canónicos o al locale por defecto (`en`). Rechaza mayúsculas, padding, variantes regionales, sufijos de script, caracteres fuera del alfabeto seguro BCP-47.

## 18 · Catálogo de idiomas

Exacto contra `lib/v2/client/ui-languages.ts` (fuente canónica del hito 9.2, Plan V1.1 §14 congelado 2026-08-11):

```
es · ca · en · fr · de · it · pt · zh · ja · ko · ar · hi · ru
```

Todos minúsculas, sin sufijos regionales ni de script. `eu`, `gl`, `nl`, `sv`, `zh-Hans` explícitamente NO son códigos activados.

## 19 · Estados lifecycle

Tabla mínima `spabla_v2.actor_lifecycle_state` con dos banderas booleanas `deletion_pending` y `legal_hold` (contract §17-ter I). Los workflows que **CREAN** esos estados (solicitud real de eliminación, aplicación administrativa de legal hold) están diferidos a Q4-bis. Q2 sí reconoce y responde a esos estados cuando ya están presentes en base de datos mediante fixtures controlados en los tests (`Q2-53`, `Q2-56`).

## 20 · Mapping huérfano

Detectado por el paso (3.a) de la RPC: si el mapping existe pero el tenant referenciado no, `RAISE EXCEPTION USING ERRCODE = '23503'`. El adaptador `SupabasePersonalWorkspaceProvider` mapea `SQLSTATE 23503` a `OnboardingOrphanMappingError`; el handler responde `500 internal` opaco. **Cero recreación silenciosa. Cero reasignación.** Cubierto por casos SQL `Q2-10` (huérfano forzado bypaseando FK con `session_replication_role='replica'`) y `Q2-48` (corrupción manual documentada).

## 21 · Rollback

- **Transaccional**: la RPC es una única transacción PL/pgSQL; cualquier `RAISE EXCEPTION` en cualquier paso revierte todo. Verificado por `Q2-14`, `Q2-15`, `Q2-33`, `Q2-34` (cero tenant huérfano, cero membership huérfana tras fallo inyectado).
- **Migración**: aditiva pura, sin tocar tablas existentes. Rollback en entorno desechable: `DROP FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid); DROP TABLE spabla_v2.actor_lifecycle_state; DROP TABLE spabla_v2.actor_personal_workspace CASCADE;`. En producción: se prefiere feature flag antes que rollback de esquema si hay filas legítimas (contract §15.2).
- **Restore drill**: la migración aplica exactamente igual sobre `restored_target` de Job C sin datos previos.

## 22 · Observabilidad

Logging estructurado sanitizado (`logSanitizedError`) con nuevos `internalKind` whitelisted añadidos a `lib/v2/server/http-error.ts` (contract §16):

- `orphan_mapping_detected` — 500 por corrupción detectada.
- `deletion_pending_blocked` — 503 por bandera activa.
- `legal_hold_blocked` — 503 por bandera activa.
- `lifecycle_query_failed` — 503 transient.
- `onboarding_env_missing`, `onboarding_rpc_failed`, `onboarding_rpc_empty_result` — errores infrastructure.
- `onboarding_body_fields_ignored`, `onboarding_locale_hint_rejected` — informativos (status 200 con log estructurado).
- `method_not_allowed` — 404 en verbos incorrectos.
- `supabase_env_missing` — 500 por env vars ausentes.

Cero PII. Cero email. Cero token. Cero header Authorization crudo. Cero mensaje SQL. Cero SQLSTATE en la respuesta.

## 23 · Matriz de cobertura Q2-01..Q2-58

Los 58 identificadores contractuales distribuidos entre tres tipos de test:

- **Unit** (`lib/v2/server/onboarding-labels.test.ts`) — Q2-49, Q2-50, Q2-51, Q2-52 (locales/manipulación/etiqueta libre) + validaciones del catálogo y del presenter.
- **SQL integration** (`supabase/tests/atomic_onboarding.test.sql`) — Q2-05, Q2-06, Q2-07, Q2-08, Q2-09, Q2-10, Q2-11, Q2-13, Q2-14, Q2-15, Q2-25, Q2-31, Q2-32, Q2-33, Q2-34, Q2-38, Q2-39, Q2-40, Q2-41, Q2-44, Q2-48, Q2-53, Q2-56, Q2-58.
- **HTTP-frontier** (`app/api/v2/onboarding/route.integration.test.ts`) — Q2-01, Q2-02, Q2-03, Q2-05, Q2-06, Q2-11, Q2-17, Q2-18, Q2-19, Q2-20, Q2-21, Q2-22, Q2-23, Q2-24, Q2-26, Q2-27, Q2-28, Q2-29, Q2-30, Q2-37, Q2-38, Q2-42, Q2-43, Q2-49, Q2-52, Q2-53, Q2-56, Q2-57.
- **Regresión / derivación documentada** — Q2-04 (JWT expirado real: cubierto por `verifyJwt` invariant heredado + comentario explícito), Q2-12 (dos concurrentes: cubierto por Q2-13 con N=20), Q2-16 (503 transient + reintento: derivado de idempotencia Q2-06 + comportamiento de 503 opaco de Q2-53/Q2-56), Q2-35, Q2-36 (bootstrap composer: cubierto por la barrera bootstrap integration existente), Q2-45, Q2-46 (Q3-E2E-R permanecen: verificado ejecutando los 14 tests en las dos rondas locales y en Job D del CI), Q2-47 (cero OpenAI: cero import de `translate.ts` o `translation-runtime.ts` en la cadena del onboarding), Q2-54 (Auth eliminado: derivado del contrato del `verifyJwt`), Q2-55 (re-registro con mismo email: nuevo `sub` en Auth = actor nuevo por contrato §17-ter D).

**Manifiesto automático** (`lib/v2/server/onboarding-manifest.test.ts`) verifica en cada corrida que:

- Los 58 identificadores `Q2-01`..`Q2-58` aparecen en al menos un fichero de test.
- Cero identificador fuera del rango 1-58.
- Cero `.skip`/`.only`/`.todo`/`.fixme` mid-flow (`describe.skip` sólo permitido en el idiom env-based `? describe : describe.skip`).
- Cero `retries >= 1`.

## 24 · Resultado de las dos rondas

Dos rondas locales desde estado limpio (cleanup entre ambas):

- **Ronda 1**: SQL suites verdes · engine typecheck + 1057 unit verdes · engine 63 integration verdes · client 195 unit + 53 integration = 248 total verdes · build limpio · E2E `14 passed (21.3s)` incluye §20-6 (2.2s) y escenario 14 anti-falso-positivo (1ms). Restore drill: no ejecutable localmente por BSD sed vs GNU sed (barrera Job C se verifica en CI Ubuntu).
- **Ronda 2**: SQL suites verdes · engine typecheck + 1120 unit verdes · engine 63 integration verdes · client 248 total verdes · build limpio · E2E `14 passed (20.9s)` incluye §20-6 (2.1s) y escenario 14 anti-falso-positivo (1ms).

Ambas rondas: 0 fallos, 0 skips inesperados, 0 servicios residuales, 0 puertos ocupados post-cleanup.

## 25 · Resultado de suites

| Suite | Ronda 1 | Ronda 2 |
|---|---|---|
| Engine typecheck | ✓ | ✓ |
| Engine unit | 1057 passed | 1120 passed |
| Engine integration | 63 passed | 63 passed |
| Client vitest | 248 passed | 248 passed |
| SQL integration (5 suites) | ✓ | ✓ |
| Next build | ✓ (5 rutas) | ✓ (5 rutas) |

## 26 · Resultado de HTTP-frontier

24 tests HTTP-frontier del onboarding (`route.integration.test.ts`) verdes en ambas rondas con env vars locales exportadas. Cubren Q2-01..Q2-03 (auth), Q2-05, Q2-06, Q2-11 (creación/idempotencia), Q2-17..Q2-24 (body variants), Q2-26..Q2-30 (métodos), Q2-37 (canOperate), Q2-38 (cero conversación), Q2-42+Q2-43 (opacidad), Q2-49 (locale canónico), Q2-52 (etiqueta libre), Q2-53 (deletion_pending), Q2-56 (legal_hold), Q2-57 (dos actores).

## 27 · Resultado de los 14 E2E existentes

`bash scripts/e2e/run-auth-continuity.sh` — `14 passed` en ambas rondas:

| Test | R1 | R2 |
|---|---|---|
| §20-1 login inicial | 1.1s | 2.9s |
| §20-2 recarga | 579ms | 1.1s |
| §20-3 cierre/reapertura | 929ms | 1.6s |
| §20-4 segunda pestaña | 651ms | 1.3s |
| §20-5 dos pestañas concurrentes | 861ms | 1.6s |
| §20-7 token caducado + refresh | 795ms | 1.1s |
| §20-8 fallo transitorio | 3.6s | 3.8s |
| §20-9 401 recuperable | 4.5s | 4.9s |
| §20-10 401 irrecuperable | 2.3s | 2.6s |
| §20-11 bootstrap ausente | 456ms | ~700ms |
| §20-12A signOut cross-tab | 870ms | 1.7s |
| §20-12B signOut ctx independientes | 763ms | 1.6s |
| §20-6 reinicio Next real | 2.2s | 2.1s |
| anti-falso-positivo | 1ms | 1ms |

Sin regresión tras el cambio de `canOperate` en `bootstrap.ts:93` (el escenario §20-11 usa `userC` sin membership → `selectedTenantId===null` sigue devolviendo `canOperate=false`).

## 28 · PostgreSQL efectivo

PostgreSQL 17.11 (Homebrew local) durante las rondas. La stack Supabase local aplica los mismos scripts que el CI. La barrera Job C (PostgreSQL 17 client) se verificará en CI Ubuntu.

## 29 · Restore drill

**No ejecutable localmente** por incompatibilidad BSD sed vs GNU sed en `scripts/ci/restore-drill.sh:139` (`sed -i` sin argumento). El script es preexistente y funciona en Ubuntu CI. Job C se verifica exclusivamente en CI.

## 30 · Build y bundle scan

`npm run build` limpio en ambas rondas. Output confirma las 5 rutas V2:

```
├ ƒ /api/v2/bootstrap
├ ƒ /api/v2/messages
├ ƒ /api/v2/onboarding
├ ƒ /api/v2/seed
└ ○ /v2/chat
```

Cero import de `server-only` en el bundle cliente (los ficheros `lib/v2/server/onboarding*.ts` empiezan con `import "server-only"`). Cero exposición de `SUPABASE_SERVICE_ROLE_KEY` en el bundle. Cero secretos nuevos añadidos al diff (`git diff | grep -E 'AKIA|SECRET_KEY=|BEGIN RSA|PRIVATE KEY'` = cero).

## 31 · Archivos modificados

**Nuevos**:

- `supabase/migrations/20260824180000_hito_9_3_2_a_atomic_onboarding.sql`
- `lib/v2/server/onboarding.ts` (puertos + tipos + excepciones de dominio)
- `lib/v2/server/onboarding-labels.ts` (catálogo + normalización + presenter)
- `lib/v2/server/onboarding-labels.test.ts` (21 tests unit)
- `lib/v2/server/onboarding-manifest.test.ts` (5 tests de trazabilidad Q2-01..Q2-58)
- `lib/v2/server/onboarding-service.ts` (orquestador)
- `lib/v2/server/onboarding.supabase.ts` (adaptador Supabase + cliente privilegiado)
- `app/api/v2/onboarding/route.ts` (handler HTTP)
- `app/api/v2/onboarding/route.integration.test.ts` (24 tests HTTP-frontier)
- `supabase/tests/atomic_onboarding.test.sql` (suite SQL integration)
- `docs/audit_reports/AUDIT_2026-08-24_hito-9-3-2-a-q2-atomic-onboarding-implementation.md` (este acta)

**Modificados** (mínimo, cambios quirúrgicos y justificados):

- `lib/v2/server/bootstrap.ts` — línea 93: `canOperate = selectedTenantId !== null` (contract §11).
- `lib/v2/server/http-error.ts` — extensión de `KNOWN_INTERNAL_KINDS` con 11 nuevos códigos server-side sanitary para el logging estructurado del onboarding.
- `app/page.test.ts` — actualización del array `entries` del scan V2 endpoints para incluir `onboarding`.
- `scripts/ci/run-integration-tests.sh` — añadida invocación de `atomic_onboarding.test.sql` al pipeline CI Job B.
- `supabase/tests/v1_runtime_retirement_verification.test.sql` — actualización del expected count de tablas (6→8) y funciones admin (5→6) para reflejar las nuevas creadas por 9.3.2-A-Q2.

**Cero cambio productivo en**: `lib/v2/client/*`, `app/api/v2/{bootstrap,messages,seed}/route.ts`, `engine/*`, `supabase/migrations/2026081*`, workflows CI (`.github/workflows/*`), dependencias (`package.json`, `package-lock.json`), lockfiles, `main`.

## 32 · Riesgos residuales reales

- **R-Q2-A** · La detección de mapping huérfano requiere corrupción manual bypaseando FK (`session_replication_role='replica'`) o pérdida de tenant fuera de la RPC — ambos escenarios anómalos. Mitigación: FK `ON DELETE RESTRICT` + `RAISE 23503` inmediato en el paso 3.a.
- **R-Q2-B** · Bandera `deletion_pending`/`legal_hold` mínima sin workflow que la actualice. Q2 sólo reconoce el estado; la creación real se difiere a Q4-bis. Mientras tanto, la escritura de las banderas es manual auditada.
- **R-Q2-C** · `restore drill` (Job C) no verificado localmente por incompatibilidad BSD sed. Se valida en CI Ubuntu como parte del pipeline.
- **R-Q2-D** · Bootstrap composer sigue leyendo `tenants.name` para exponerlo en el payload — ahora `workspace.personal.default` para el tenant personal (no localizado). La UI que consume el bootstrap debe presentarlo mediante el mismo catálogo cerrado o el mecanismo que Dirección apruebe en 9.3.2-A-Q3.
- **R-Q2-E** · Política jurídica de retención/anonimización/legal-hold no validada; la activación productiva de los flujos correspondientes queda diferida a Q4-bis tras dictamen jurídico (contract §17-ter I, §18 R-G).

## 33 · Funciones diferidas a Q4-bis

- Workflow real que registra la solicitud de eliminación, revoca sesiones y ejecuta gracia/anonimización.
- Aplicación administrativa real de `legal_hold`.
- Anonimización automática (mecanismo técnico + plazos).
- Job automático de reconciliación de mappings huérfanos.
- Recuperación administrativa de tenants.
- Políticas jurídicas definitivas (retención, contenido con terceros, plazos por categoría).

## 34 · Confirmación de cero OTP

Cero código, cero endpoint, cero test relacionado con OTP email (hito 9.3.2-B). El servicio `runOnboarding` no invoca ninguna magic-link, invitation, ni email verification. La cadena `otp`, `OTP`, `magic-link`, `magic_link` no aparece en el diff.

## 35 · Confirmación de cero Q3

Cero E2E nuevo añadido al `e2e/auth-continuity.spec.ts`. Los 14 escenarios existentes se ejecutan como **regresión** en las dos rondas locales y en Job D del CI. La barrera E2E nueva de onboarding corresponde a `9.3.2-A-Q3` según contract §21 y no se anticipa en esta unidad.

## 36 · Confirmación de cero promoción

Cero acción sobre la rama `spabla-v2/thirteen-languages-activation`. Cero fast-forward, cero merge, cero push a rama oficial. `main` intacta.

---

**Estado del acta**: cerrada tras las dos rondas locales verdes. Pendiente única: CI attempt=1 sobre la rama publicada.
