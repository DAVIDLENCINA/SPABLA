# Plan de Hito 8.2 — Schema, migraciones, RLS, roles y CI

**Tipo**: Plan de hito.
**Versión**: V1.2.
**Fecha**: 2026-07-30.
**Estado**: APROBADO Y CONGELADO — V1.2 (fe de erratas técnica del 2026-07-30).
**Rama**: `spabla-v2/fase-8-persistence-multitenancy`.
**HEAD base**: `f95ec68342dd897b53f29a26cf821176e2d2373a`.
**Plan padre**: `docs/phases/SPABLA_V2_FASE_8_PLAN.md` V1.2 (APROBADO Y CONGELADO).
**ADR base**: `docs/decisions/ADR-008-STORAGE-AND-MULTI-TENANCY.md` V1.3 (APROBADA Y CONGELADA).
**Contratos de partida**: Hito 8.1 congelado en `engine/src/adapters/persistence/` (commit `639c159`).
**Estándares transversales**: `docs/standards/SPABLA_V2_CODE_STANDARD.md`, `docs/standards/SPABLA_V2_RELEASE_STANDARD.md`.

## §1. Objetivo

Construir una **cadena única de migraciones lineal y reproducible desde base vacía** que (i) preserve el estado V1 productivo, (ii) reproduzca fielmente en repo el schema V1 aplicado manualmente al remoto, y (iii) cree el dominio persistente multi-tenant V2 en el esquema `spabla_v2` con RLS + FORCE RLS + grants explícitos + funciones administrativas SECURITY DEFINER, cubierto por tests SQL y por CI Supabase CLI. Cero conexión con el remoto durante la implementación local.

## §2. Precondiciones

- Rama y HEAD conforme a metadatos.
- Basal engine: `npx tsc --noEmit` exit 0; suite Vitest 639/639 verde en 26 archivos (basal Hito 8.1).
- Working tree con único cambio previo autorizado: `M .gitignore` (regla `supabase/.temp/` incorporada).
- Sesión Supabase CLI **cerrada** (`supabase logout` ejecutado). Hito 8.2 no requiere sesión CLI activa en local.
- Remoto Supabase productivo (`wztkxtgmuaegonlkukeh`) **fuera de alcance operativo**. Cero conexión durante implementación.
- D1 (ubicación V2) y D2 (cadena única) cerradas por autorización del Jefe de Proyecto (§3).
- Contratos Hito 8.1 congelados y no reabiertos: `port.ts`, `identity.ts`, `tenant-context.ts`, `errors.ts`, `conformance.ts`.
- ADR-008 V1.3 y Plan Fase 8 V1.2 no se modifican.

## §3. Decisiones cerradas

### §3.1 D1 — Ubicación V2 (aprobada)

- Esquema dedicado `spabla_v2` con exactamente cinco tablas: `tenants`, `tenant_memberships`, `conversations`, `messages`, `usage_ledger`.
- Cero tabla V2 en `public.*`. Cero modificación destructiva de `public.*`.
- Cero grant a `anon` sobre objetos V2 (schema, tablas, funciones).
- `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` en las cinco tablas.
- Rol runtime ordinario sin ownership y sin `BYPASSRLS`; `service_role` sólo en operaciones administrativas server-side auditadas.
- **Cero publicación Realtime** de tablas V2 en este hito.
- **Cero exposición** de `spabla_v2` mediante PostgREST en este hito; la exposición productiva se decide en el hito del adaptador con RLS y grants ya verificados.

### §3.2 D2 — Cadena única lineal (aprobada, vía B pura)

Cadena local oficial, orden estricto:

1. Baseline V1 pre-legacy.
2. Migración legacy existente (§5) — intangible byte a byte.
3. Migración de reconciliación estructural V1 (§6) — necesaria por evidencia (§6.1).
4. Migración bootstrap V2 (§7).
5. Migraciones posteriores de Fase 8, si emergen.

Prohibido: runner paralelo, excluir migraciones del CI, editar migraciones aplicadas, mantener dos cadenas, ejecutar `migration repair` en este hito.

## §4. Archivos previstos

Autorizados en este hito:

- `supabase/config.toml` — configuración del proyecto Supabase (auth, storage, edge, api). No fija versión del binario CLI (Plan Fase 8 §7.4 M1nuevo).
- `supabase/migrations/20260101000000_v1_baseline.sql` — baseline V1 pre-legacy (§5).
- `supabase/migrations/20260617000000_add_message_source.sql` — **existente e intangible** (§6).
- `supabase/migrations/20260617000100_reconcile_v1_voice_policy.sql` — reconciliación V1 (§7), timestamp inmediatamente posterior a la legacy dentro del mismo día.
- `supabase/migrations/<YYYYMMDDHHMMSS>_phase8_bootstrap.sql` — bootstrap V2 (§8); timestamp real se fija en implementación (posterior a la reconciliación).
- `supabase/tests/rls_bootstrap.test.sql` — pruebas SQL RLS del bootstrap V2 (§10).
- `supabase/tests/v1_baseline_smoke.test.sql` — smoke SQL que valida la reproducción estructural V1 en local (§10).
- `scripts/ci/apply-migrations.sh` — envoltorio de `supabase db reset --local` con verificación de exit.
- `scripts/ci/run-integration-tests.sh` — envoltorio de la suite SQL + suite engine (§11).
- `.github/workflows/ci.yml` — Job A (engine) + Job B (integración Supabase CLI) con versión pinneada.

Cero archivo adicional en este hito. Cero modificación de `engine/`, `app/`, `server/`, ADRs, planes congelados, contratos Hito 8.1, barrels públicos, Managers, Foundation o Fase 7.

Los timestamps `20260101000000` y `20260617000100` son deterministas y se justifican en §5 y §7. El timestamp del bootstrap V2 lo fija el implementador en el momento del hito, respetando la relación de orden `bootstrap > reconciliación > legacy > baseline`.

## §5. Baseline V1 pre-legacy

Ubicación: `supabase/migrations/20260101000000_v1_baseline.sql`.

Timestamp **sintético** anterior a la legacy `20260617000000` para que la cadena aplique en el orden natural sin `migration repair`. `20260101000000` cumple el formato Supabase `YYYYMMDDHHMMSS` y no colisiona con ningún archivo local ni con el histórico remoto (el schema `supabase_migrations` no existe en el remoto). La fecha **no afirma** que V1 fuera creada el 1 de enero; el archivo se identifica en su cabecera como *baseline sintética de reconstrucción* del estado V1 pre-legacy.

Contenido normativo — reproduce **exclusivamente** el estado remoto pre-legacy confirmado en el inventario read-only:

- Extensiones requeridas por defaults V1: `pgcrypto` (para `gen_random_uuid()`), `uuid-ossp`. Se emiten mediante `CREATE EXTENSION IF NOT EXISTS ... WITH SCHEMA extensions` para respetar la ubicación estándar de Supabase.
- Seis tablas en `public.*`, todas owner `postgres`, con columnas, defaults y tipos confirmados: `users`, `conversations`, `conversation_participants`, `messages`, `files`, `call_signals`. La tabla `messages` **sin** columna `source` y **sin** constraint `messages_source_check`.
- PK, FK y CHECK preexistentes al 2026-06-17: `conversation_participants` PK compuesta `(conversation_id, user_id)`; FK `files.conversation_id → conversations(id) ON DELETE CASCADE`; FK `call_signals.conversation_id → conversations(id) ON DELETE CASCADE`; FKs simples `messages.conversation_id → conversations(id)`, `messages.sender_id → users(id)`, `conversation_participants.conversation_id → conversations(id)`, `conversation_participants.user_id → users(id)` (todas sin acción `ON DELETE` explícita, conforme al inventario).
- Índices no-PK confirmados: `idx_participants_user_id (user_id)`, `idx_conversations_created_by (created_by)`, `idx_messages_conv_created (conversation_id, created_at)`.
- Funciones `public.is_participant(conv_id uuid)` y `public.shares_conversation(other_user_id uuid)` reproducidas **byte-semánticamente** con la definición recuperada del remoto vía `pg_get_functiondef` (autorización del Jefe de Proyecto, 2026-07-30):

  ```sql
  CREATE OR REPLACE FUNCTION public.is_participant(conv_id uuid)
   RETURNS boolean
   LANGUAGE sql
   STABLE SECURITY DEFINER
   SET search_path TO 'public'
  AS $function$
    SELECT EXISTS (
      SELECT 1
      FROM public.conversation_participants
      WHERE conversation_id = conv_id
        AND user_id = auth.uid()
    );
  $function$;

  CREATE OR REPLACE FUNCTION public.shares_conversation(other_user_id uuid)
   RETURNS boolean
   LANGUAGE sql
   STABLE SECURITY DEFINER
   SET search_path TO 'public'
  AS $function$
    SELECT EXISTS (
      SELECT 1
      FROM public.conversation_participants cp1
      JOIN public.conversation_participants cp2
        ON cp1.conversation_id = cp2.conversation_id
      WHERE cp1.user_id = auth.uid()
        AND cp2.user_id = other_user_id
    );
  $function$;
  ```

  Estas definiciones se transcriben tal cual en la baseline; cero reinterpretación, cero refactor, cero endurecimiento en V1. Owner `postgres` explícito (`ALTER FUNCTION ... OWNER TO postgres`).
- `ENABLE ROW LEVEL SECURITY` sobre las seis tablas (sin `FORCE ROW LEVEL SECURITY`, tal como está en remoto).
- Las 14 policies preexistentes al 2026-06-17 exactamente reproducidas, todas con `TO public` y predicados confirmados por inventario. Se **excluye** deliberadamente `participants_insert_voice_messages` (§6, depende de `source`).
- Grants explícitos derivados del inventario remoto (no se depende de defaults del ejecutor local):
  - Sobre cada una de las seis tablas: `GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON <t> TO postgres, anon, authenticated, service_role;`
  - Sobre ambas funciones: `GRANT EXECUTE ON FUNCTION public.is_participant(uuid) TO PUBLIC, anon, authenticated, service_role, postgres;` y análogo para `shares_conversation(uuid)`.
- Publicación `supabase_realtime` con estado final **determinista** garantizado por la baseline: publicación existente, `publish = 'insert, update, delete, truncate'`, membresía exacta `{public.messages, public.call_signals}`, cero tabla `spabla_v2.*` presente. Procedimiento normativo (ADR-008 §11.2; PostgreSQL 17 no soporta `CREATE PUBLICATION ... IF NOT EXISTS`, por lo que la creación usa el patrón `DO $$ IF NOT EXISTS $$` contra `pg_publication`; la membresía se fija de forma determinista mediante `ALTER PUBLICATION ... SET TABLE`, que según PostgreSQL 17 "will replace the list of tables/schemas in the publication with the specified list; the existing tables/schemas that were present in the publication will be removed" — remoción implícita de cualquier membresía adicional preexistente):

  ```sql
  -- 1) Asegurar existencia de la publicación (crear sólo si no existe)
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
      CREATE PUBLICATION supabase_realtime;
    END IF;
  END $$;

  -- 2) Fijar de forma determinista el conjunto de operaciones publicadas
  ALTER PUBLICATION supabase_realtime
    SET (publish = 'insert, update, delete, truncate');

  -- 3) Fijar la membresía exacta de la publicación (reemplaza la lista entera;
  --    remueve cualquier tabla previamente presente que no esté aquí)
  ALTER PUBLICATION supabase_realtime
    SET TABLE public.messages, public.call_signals;
  ```

  `SET TABLE` es la operación clave: reemplaza la lista completa de tablas, garantizando el conjunto exacto `{public.messages, public.call_signals}` con independencia del estado previo de la publicación en el ejecutor (local, CI o remoto local). Cero `ADD TABLE` que pudiera dejar membresías adicionales preexistentes intactas. Cero adición de tablas `spabla_v2.*` a `supabase_realtime` durante todo el Hito 8.2 (§10).

Fuente de verdad estructural: reporte de inventario remoto read-only ejecutado el 2026-07-29 sobre el proyecto vinculado (Q1–Q16). Fuente de verdad DDL de las dos funciones: consulta manual a `pg_get_functiondef` del Jefe de Proyecto (2026-07-30).

**Advertencia no bloqueante — configuración de seguridad V1**. El inventario y el DDL recuperado confirman que las dos funciones `is_participant` y `shares_conversation` operan bajo `SECURITY DEFINER` con `search_path=public` y `EXECUTE` concedido a `PUBLIC`, `anon`, `authenticated`, `service_role` y `postgres`. Esta configuración se reproduce en la baseline **exclusivamente por fidelidad** al estado remoto V1 real; no se autoriza ampliarla, replicarla ni tomarla como patrón para el bootstrap V2 ni para ningún objeto en `spabla_v2`. §9 fija el patrón endurecido de funciones administrativas V2.

## §6. Migración legacy `20260617000000_add_message_source.sql`

Confirmado por lectura directa del archivo local en este turno:

- Añade `public.messages.source TEXT NOT NULL DEFAULT 'text'` mediante `ADD COLUMN IF NOT EXISTS`.
- Añade `messages_source_check CHECK (source IN ('text', 'voice'))` mediante bloque `DO $$ IF NOT EXISTS ... $$`.
- **NO crea** la policy `participants_insert_voice_messages`. Justifica §7.

Reglas normativas:

- Permanece byte a byte intacta. Cero edición, cero renombrado, cero desplazamiento.
- No se duplica su contenido en la baseline ni en la reconciliación.

## §7. Reconciliación V1 — policy voice

Ubicación: `supabase/migrations/20260617000100_reconcile_v1_voice_policy.sql`.

Justificación: el inventario remoto confirma la presencia en `public.messages` de la policy `participants_insert_voice_messages` (INSERT, `TO public`, `WITH CHECK ((source = 'voice'::text) AND is_participant(conversation_id) AND (sender_id IN (SELECT conversation_participants.user_id FROM conversation_participants WHERE (conversation_participants.conversation_id = messages.conversation_id))))`). La migración legacy no la crea; fue aplicada manualmente en el remoto tras el `ADD COLUMN`. Para que la cadena `baseline → legacy → reconciliación → bootstrap` reproduzca desde vacío el estado remoto V1 real, la reconciliación es **necesaria**.

Contenido normativo:

- Crea exclusivamente la policy `participants_insert_voice_messages` con la definición literal remota confirmada, ubicada **después** de la migración legacy (depende de la columna `source` y del constraint `messages_source_check`).
- Idempotente sólo si el patrón `DO $$ IF NOT EXISTS ... $$` es aplicable a `CREATE POLICY` sin coste; en caso contrario, ejecución única bajo la garantía del sistema de migraciones.
- Declarada expresamente en el commit como **reconciliación del estado manual V1 con el repositorio**, no como migración histórica.
- **No se aplica al remoto** en este hito. La aplicación remota requerirá la autorización expresa descrita en §14.

## §8. Bootstrap V2

Ubicación: `supabase/migrations/<YYYYMMDDHHMMSS>_phase8_bootstrap.sql`, timestamp posterior a la reconciliación V1.

Alcance normativo: crea `spabla_v2`, sus cinco tablas, RLS + FORCE RLS + policies conforme al patrón Plan Fase 8 §7.1 (con excepciones §7.1bis para `tenant_memberships` y §7.1ter para `usage_ledger`), constraints CHECK, índices tenant-first, funciones administrativas SECURITY DEFINER (`admin_create_tenant`, `admin_add_membership`, `admin_deactivate_membership`, `admin_append_usage`, purga privilegiada de `usage_ledger`), y grants explícitos mínimos.

Reglas estructurales (Plan Fase 8 §9.3 y ADR-008 §8.3):

- `spabla_v2.tenants` con `id UUID PK`; identidad canónica del tenant.
- `spabla_v2.tenant_memberships` con PK compuesta `(tenant_id, actor_id)`, columna `role TEXT` como dato, `is_active BOOLEAN NOT NULL DEFAULT TRUE`, FK `tenant_id → spabla_v2.tenants(id)`.
- `spabla_v2.conversations` con `id UUID`, `tenant_id UUID NOT NULL`, clave candidata `UNIQUE(tenant_id, id)`, FK `tenant_id → spabla_v2.tenants(id)`.
- `spabla_v2.messages` con `id UUID`, `tenant_id UUID NOT NULL`, `conversation_id UUID NOT NULL`, clave candidata `UNIQUE(tenant_id, id)`, **FK compuesta** `(tenant_id, conversation_id) → spabla_v2.conversations(tenant_id, id)`, además `tenant_id → spabla_v2.tenants(id)`. Impide referencias cross-tenant estructuralmente.
- `spabla_v2.usage_ledger` con `id UUID PK`, `tenant_id UUID NOT NULL`, columnas del ledger (ADR-008 §10.1), `UNIQUE(tenant_id, source, idempotency_key)` para idempotencia tenant-scoped, CHECK `quantity >= 0` para `entry_kind = 'normal'`, CHECK de coherencia `metric_kind ↔ unit`, FK `tenant_id → spabla_v2.tenants(id)`.
- Índices adicionales: `messages(tenant_id, conversation_id, created_at, id)` para paginación por cursor total-estable (Plan Fase 8 §10.6); índices tenant-first en cualquier tabla que reciba consultas ordinarias.
- Timestamps `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`. Identificadores UUID con `gen_random_uuid()` como default cuando aplique.
- `tenant_id` inmutable en todas las tablas tenant-owned: policy y/o invariante estructural rechazan cambio.

Formas semánticas equivalentes a las anteriores (por ejemplo, PRIMARY KEY compuesta en lugar de PK simple + UNIQUE) son admisibles siempre que ADR-008 §8.3 lo permita explícitamente y la revisión técnica única las apruebe. Cero desviación silenciosa.

## §9. Seguridad y grants

Rige íntegramente Plan Fase 8 §7 (§7.1, §7.1bis, §7.1ter, §7.2, §7.3, §7.5) y ADR-008 §9. No se replica su contenido normativo. El bootstrap V2 debe cumplir simultáneamente:

- `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` en las cinco tablas V2.
- Identidad efectiva vía `auth.uid()`; separación `authenticated` vs `service_role` vs runtime administrativo.
- **Cero grant** a `anon` sobre `spabla_v2` (schema, tablas, funciones).
- `REVOKE ALL ON SCHEMA spabla_v2 FROM PUBLIC` explícito antes de cada `GRANT`.
- `GRANT USAGE ON SCHEMA spabla_v2 TO authenticated, service_role` (sin `anon`).
- `GRANT SELECT, INSERT ON spabla_v2.<tabla_tenant_owned> TO authenticated` únicamente sobre las tablas y operaciones autorizadas por la matriz Plan Fase 8 §7.5 (cero UPDATE/DELETE ordinario en Fase 8). `tenant_memberships` sin grants a `authenticated` para escritura; `usage_ledger` sin grants a `authenticated` para INSERT/UPDATE/DELETE.
- `GRANT ALL ON spabla_v2.<tabla> TO service_role` para bootstrap y purga.
- Funciones administrativas V2 (`admin_create_tenant`, `admin_add_membership`, `admin_deactivate_membership`, `admin_append_usage`, purga privilegiada de `usage_ledger`) cumplen **todos** los requisitos siguientes:
  - `SECURITY DEFINER` **sólo cuando sea imprescindible** para trascender el rol invocador (bootstrap administrativo y `usage_ledger` append-only, donde ninguna policy ordinaria autoriza la operación). Cualquier función auxiliar interna que no lo requiera se declara `SECURITY INVOKER`.
  - Objetos plenamente cualificados en el cuerpo (`public.tenants`, `spabla_v2.tenants`, `pg_catalog.now()`, etc.); cero identificador ambiguo.
  - `SET search_path = pg_catalog, spabla_v2` (o más restrictivo cuando la función no toque otras schemas); cero uso de `public` cuando no sea necesario.
  - `REVOKE EXECUTE ON FUNCTION <f> FROM PUBLIC;`
  - `REVOKE EXECUTE ON FUNCTION <f> FROM anon;`
  - `REVOKE EXECUTE ON FUNCTION <f> FROM authenticated;`
  - `GRANT EXECUTE ON FUNCTION <f> TO service_role;` como único rol autorizado (rol administrativo actual). Cero `EXECUTE` a otros roles.
  - Validación explícita de inputs y auditoría de invocación (actor administrativo, timestamp, `correlation_id` cuando aplique) conforme Plan Fase 8 §7.3 y §9.5.
- Protección estructural contra elevación de membresía: policy `tenant_memberships_select_own` como única policy ordinaria; cero policy INSERT/UPDATE/DELETE ordinaria (Plan §7.1bis).
- Aislamiento cross-tenant estructural mediante FK compuesta `(tenant_id, ...) → (...)` en `messages` y análogas.
- Coherencia entre actor, tenant y membership activa exigida por `admin_append_usage` antes de INSERT (Plan §9.5).

**Separación V1 ↔ V2**. V1 baseline reproduce fielmente su configuración histórica (grants amplios por defecto de Supabase, funciones `SECURITY DEFINER` con `EXECUTE` a `PUBLIC/anon/authenticated`, RLS sin FORCE). V2 **no** hereda esa política permisiva. Cero grant a `anon` sobre `spabla_v2`; cero `EXECUTE` a `PUBLIC/anon/authenticated` sobre funciones administrativas; FORCE RLS obligatorio; grants explícitos y mínimos. Ninguna definición V1 (predicados de `is_participant`/`shares_conversation`, policies `TO public`, defaults amplios) se traslada al bootstrap V2.

Cero rol custom nuevo en este hito.

## §10. PostgREST y Realtime

- Hito 8.2 **no** modifica la exposición PostgREST del remoto ni añade `spabla_v2` a la lista de esquemas expuestos remotamente. La configuración local en `supabase/config.toml` puede reflejar la intención productiva pero no se aplica al remoto en este hito.
- Hito 8.2 **no** publica tablas V2 en la publicación `supabase_realtime`. La publicación existente (que incluye `public.messages` y `public.call_signals`) queda intacta.
- Se documenta en el commit que el acceso productivo a `spabla_v2` se decidirá en el hito del adaptador con RLS y grants ya verificados.

## §11. Tests obligatorios

Ubicación: `supabase/tests/`.

Cobertura mínima (Plan Fase 8 §9.8 + §10.7 aplicables a la superficie de este hito; el resto se activa en Hito 8.3):

- Suite `v1_baseline_smoke.test.sql`:
  - Las seis tablas `public.*` existen tras `baseline + legacy + reconciliación`, con columnas y defaults confirmados por inventario.
  - `messages.source` presente con default `'text'`; `messages_source_check` presente.
  - Las 15 policies presentes con nombres y comandos confirmados por inventario, incluida `participants_insert_voice_messages` tras la reconciliación.
  - **Estado final exacto de `supabase_realtime`** (no sólo existencia): (i) fila única en `pg_publication` con `pubname = 'supabase_realtime'` y `pubinsert = pubupdate = pubdelete = pubtruncate = TRUE`; (ii) membresía en `pg_publication_rel` **igual exactamente** al conjunto `{public.messages, public.call_signals}` — cardinalidad 2, sin más y sin menos; (iii) cero fila con `nspname = 'spabla_v2'` en la membresía de la publicación.
- Suite `rls_bootstrap.test.sql` (bootstrap V2):
  - Cada tabla V2 tiene `rowsecurity = t` **y** `forcerowsecurity = t` en `pg_class`.
  - Aislamiento entre dos tenants: miembro activo del tenant A no ve filas del tenant B; SELECT/INSERT cross-tenant rechazados.
  - Membership inactiva (`is_active = FALSE`) no concede acceso.
  - Actor `authenticated` sin membership → cero filas visibles.
  - FK compuesta rechaza referencias cross-tenant en `spabla_v2.messages`.
  - `usage_ledger` append-only: `INSERT`, `UPDATE`, `DELETE` directos con JWT `authenticated` → rechazo estructural.
  - Funciones administrativas inaccesibles para `anon` y `authenticated` (`REVOKE EXECUTE FROM PUBLIC` verificable con `pg_get_function_grants`).
  - `authenticated` no puede elevarse: `INSERT/UPDATE/DELETE` sobre `spabla_v2.tenant_memberships` rechazados.
  - `admin_create_tenant`, `admin_add_membership`, `admin_deactivate_membership`, `admin_append_usage` ejecutables sólo por `service_role`; validaciones internas rechazan `actor/tenant` incoherente y coherencia `metric_kind ↔ unit`.
  - Idempotencia estructural `UNIQUE(tenant_id, source, idempotency_key)` en `usage_ledger`.
  - Grants exactos: `spabla_v2` sin grants a `anon`; grants mínimos autorizados a `authenticated` y `service_role`.
  - Cero publicación Realtime de tablas V2.
  - Baseline + legacy + reconciliación + bootstrap aplicables desde vacío en una única ejecución `supabase db reset`.

Los tests SQL utilizan `SET ROLE`, JWT emitidos por Supabase Auth local y `set_config('request.jwt.claims', ...)` cuando corresponda. Cero emulación de `auth.uid()` mediante GUC personalizada (Plan §7.4).

Tests de integración TypeScript del adaptador **no** se incluyen en Hito 8.2 (pertenecen a Hito 8.3). Sí se incluye la ejecución de la basal engine 639/639 dentro del Job A de CI para verificar cero regresión.

## §12. CI

Archivo: `.github/workflows/ci.yml`.

- **Trigger**: `push` a `spabla-v2/**`, `pull_request` a `main`.
- **Job A — engine**: Node 20; `cd engine && npm ci && npx tsc --noEmit && npx vitest run`. Suite mínima esperada: 639 (basal Hito 8.1). Tiempo esperado <2 min. Timeout 15 min.
- **Job B — integración**: entorno PostgreSQL/Supabase efímero levantado por Supabase CLI. Versión CLI fijada exactamente en el workflow mediante `supabase-community/setup-cli@v1` con `version: "2.110.0"` (u otro mecanismo con versión exacta reproducible); **prohibido `latest`**. Reporta `supabase --version` como primer paso del job. Ejecuta `supabase start`, health check, `supabase db reset --local` (aplica la cadena completa desde vacío), crea usuarios/JWT reales con Supabase Auth Admin API local, ejecuta `supabase/tests/v1_baseline_smoke.test.sql` y `supabase/tests/rls_bootstrap.test.sql`, cleanup. Contraseñas efímeras; cero secretos reales. Cero conexión al remoto productivo. Tiempo esperado <10 min. Timeout 15 min.
- **Requerido para merge**:
  - Job A: en cualquier cambio bajo `engine/**`.
  - Job B: en cualquier cambio bajo `supabase/**`, `engine/src/adapters/persistence/**`, `.github/workflows/**`, `scripts/ci/**`.
- Scripts auxiliares (`scripts/ci/apply-migrations.sh`, `scripts/ci/run-integration-tests.sh`) contienen únicamente envoltura mínima (flags CLI, propagación de exit codes, logging no sensible).

## §13. Herramientas locales — bloqueo operativo declarado

Este bloqueo **no impide la aprobación del plan**. Impide únicamente declarar cerrada la implementación del hito sin evidencia ejecutada. Su resolución es requisito de cierre, no de aprobación.

- **Docker no está instalado** en el entorno del agente.
- **`pg_dump` no está instalado** en el entorno del agente.
- El CLI Supabase 2.110.0 requiere Docker para `supabase start` (Postgres local) y `pg_dump` local para `supabase db dump`. En consecuencia, el agente **no puede** ejecutar `supabase db reset` ni tests SQL localmente hasta autorización expresa de instalación separada.
- El hito **no autoriza** ninguna instalación en el marco de este plan.
- Consecuencia normativa: Hito 8.2 **no se declara cerrado sólo con SQL revisado**. Debe existir evidencia ejecutada desde base vacía, ya sea en CI (Job B verde) o en local tras autorización de instalación. Sin evidencia ejecutada, el hito queda `candidate` (Release Standard §7) — nunca `stable`.
- La estrategia por defecto es que la ejecución real ocurra íntegramente en CI (Job B), sin instalar herramientas locales para el agente.

## §14. Reconciliación remota futura — fuera de alcance

Explícitamente fuera del Hito 8.2:

- `supabase migration repair`.
- `supabase db push` sobre el remoto productivo.
- Creación del schema `supabase_migrations` en el remoto.
- Exposición de `spabla_v2` mediante PostgREST en el remoto.
- Cualquier modificación de la configuración del proyecto Supabase productivo.

Prerequisitos operativos que habilitarán la reconciliación remota en un hito posterior autorizado:

- Auditoría de equivalencia estructural entre `baseline + legacy + reconciliación` local y el estado remoto V1 real (comparación de columnas, defaults, constraints, índices, policies, funciones, grants, publicación Realtime).
- CI completo (Job A + Job B) verde en la rama con la cadena V1 + bootstrap V2 aplicada desde vacío.
- Backup o estrategia de recuperación verificada (ADR-008 §11.5, §15; Plan Fase 8 §15.3 es criterio de cierre de fase, no de este hito).
- Autorización expresa separada del Jefe de Proyecto.
- Ejecución controlada por operador humano.
- Verificación posterior estructural en el remoto.

## §15. Criterios de aceptación

Criterios binarios y medibles. Todos bloqueantes:

- Cadena `baseline → legacy → reconciliación → bootstrap` aplica desde base vacía sin error (`supabase db reset --local` exit 0).
- Migración legacy `20260617000000_add_message_source.sql` byte a byte intacta (`git diff` sobre el archivo entre HEAD y el commit del hito = 0).
- Estado V1 reproducido: `v1_baseline_smoke.test.sql` verde.
- Bootstrap V2 creado: `rls_bootstrap.test.sql` verde.
- Cada tabla `spabla_v2.*` con `rowsecurity = t` **y** `forcerowsecurity = t` en `pg_class`.
- Cero grant a `anon` sobre `spabla_v2` (schema, tablas, funciones) verificable con consulta a `information_schema.role_table_grants` y `information_schema.role_routine_grants`.
- CI Job A verde: TypeScript exit 0; suite Vitest ≥ 639 (basal Hito 8.1) verde.
- CI Job B verde con Supabase CLI reportado y pinneado a versión exacta (2.110.0).
- Cero secretos en repo (grep sobre bundle y sobre `NEXT_PUBLIC_*`).
- Cero mutación del remoto productivo (evidenciable por ausencia de comandos `supabase migration repair`, `supabase db push`, `supabase config push` en scripts, workflow y commits).
- Diff del commit limitado exclusivamente a los archivos autorizados en §4 (más `.gitignore` ya modificado). Cero cambio en `engine/`, `app/`, `server/`, ADRs, planes congelados, contratos Hito 8.1, Foundation, barrels públicos, Managers, Fase 7.
- Basal engine preservada: 639/639 verde (o superior si el hito añade tests engine autorizados; ninguno previsto en §4).
- Revisión técnica única APTO.

## §16. Flujo operativo

1. Plan breve (este documento).
2. Revisión técnica única.
3. Corrección quirúrgica sólo si existe defecto demostrado.
4. Aprobación expresa del Jefe de Proyecto.
5. Implementación: baseline (con DDL recuperado §5) → legacy intacta → reconciliación → bootstrap → tests SQL → CI.
6. Autorización expresa separada para habilitar la ejecución CI Job B (Docker/entorno equivalente en runner) o para instalar herramientas locales.
7. Ejecución CI (Job A + Job B) verde.
8. Revisión técnica del cambio.
9. Commit único con `git diff` limitado a §4 y `.gitignore`.

Sin rondas documentales redundantes. La aplicación al remoto queda fuera de este hito (§14).

## §17. Historial

- **V1.0 (2026-07-30)** — Redacción inicial. Bloqueos declarados: B3 (DDL de `is_participant`/`shares_conversation` no extraído), B4 (grants exactos por defecto de Supabase no reproducibles determinísticamente), B1/B2 (Docker/`pg_dump` no instalados), B5 (sin ejecución local del hito).
- **V1.1 (2026-07-30)** — Corrección quirúrgica autorizada tras recuperación de DDL:
  - **B3 RESUELTO** (§5): incorporadas las definiciones exactas de `public.is_participant(uuid)` y `public.shares_conversation(uuid)` recuperadas por el Jefe de Proyecto vía `pg_get_functiondef` (consulta read-only al remoto). Reproducción byte-semántica en la baseline; cero reinterpretación.
  - **B4 RESUELTO** (§5): grants explícitos derivados del inventario remoto, listados literalmente para cada tabla (`SELECT/INSERT/UPDATE/DELETE/REFERENCES/TRIGGER/TRUNCATE` a `postgres/anon/authenticated/service_role`) y cada función (`EXECUTE` a `PUBLIC/anon/authenticated/service_role/postgres`). La baseline no depende de defaults del ejecutor local.
  - **Advertencia no bloqueante** (§5): registrada la configuración permisiva V1 (SECURITY DEFINER + `search_path=public` + `EXECUTE` amplio en las dos funciones) y su reproducción exclusiva por fidelidad; prohibida su copia a V2.
  - **Separación V1↔V2** (§9): declarada explícitamente; V2 no hereda la política V1.
  - **Endurecimiento funciones administrativas V2** (§9): SECURITY DEFINER sólo cuando imprescindible; objetos cualificados; `search_path` restrictivo; `REVOKE EXECUTE` explícito a `PUBLIC + anon + authenticated`; `GRANT EXECUTE` únicamente a `service_role`.
  - **B1/B2/B5** (§13): reclasificados como bloqueo operativo de cierre, no de aprobación del plan.
  - **Timestamp baseline** (§5): identificado como sintético; formato Supabase válido; anterior a legacy; sin colisiones.
- **Aprobación y congelación V1.1 (2026-07-30)**: revisión técnica única APTO. B3 y B4 resueltos. R2 cerrado normativamente mediante configuración y verificación deterministas de `supabase_realtime` (§5 procedimiento normativo `DO $$ IF NOT EXISTS $$` + `ALTER PUBLICATION ... SET (publish = 'insert, update, delete, truncate')` + adición condicional por comprobación contra `pg_publication_rel`; §11 test exige estado final exacto: cardinalidad 2, membresía exacta `{public.messages, public.call_signals}`, cero `spabla_v2` en la publicación). Docker/CI permanece exclusivamente como requisito operativo de cierre de la implementación.
- **V1.2 — Fe de erratas técnica (2026-07-30)**: sustituida la adición condicional mediante `ADD TABLE` por `ALTER PUBLICATION supabase_realtime SET TABLE public.messages, public.call_signals`. La V1.1 podía conservar membresías adicionales preexistentes y, por tanto, no garantizaba el conjunto exacto exigido por §11. Con `SET TABLE`, PostgreSQL 17 reemplaza la lista completa de tablas de la publicación, eliminando cualquier membresía previa fuera del conjunto normativo; el estado final queda determinista con independencia del estado previo del ejecutor. **Defecto RESUELTO en V1.2.** Cero cambio en alcance, tablas V2, seguridad, cadena de migraciones, tests §11, criterios §15, contratos Hito 8.1, Plan Fase 8 ni ADR-008.
