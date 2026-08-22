# SPABLA V2 · Hito 9.3.2-A — Contrato específico del onboarding productivo atómico

**Versión**: `Q1 (Hito 9.3.2-A-Q1 · 2026-08-22)`.
**Rama documental**: `spabla-v2/hito-9-3-2-a-q1-onboarding-contract`.
**Base oficial exacta**: `383b0c04a3f54e73a7453b9a38363dc998297906` (`spabla-v2/thirteen-languages-activation`, cerrada por `HITO 9.3.2-CONTRACT-P · CONTRATO MARCO PROMOVIDO A OFICIAL — CERRADO`).
**CI oficial**: [`32597787491`](https://github.com/DAVIDLENCINA/SPABLA/actions/runs/32597787491) attempt=1 · success · Jobs A/B/C/D success · Job D 14 passed · PostgreSQL 17.11 · restore drill PASS.
**Contrato marco gobernante**: `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_2_PASSWORDLESS_OTP_CONTRACT.md` (R2, SHA-256 blob `0264977f6f5eeb0a73f31c8cd392b856f8fde75cb86386781ee2a546f539771e`).
**Actas previas**: `docs/audit_reports/AUDIT_2026-08-22_hito-9-3-1-q3-auth-continuity-implementation.md`.

**Autoridad**: este documento congela el alcance normativo de la unidad **9.3.2-A** (onboarding productivo mínimo, atómico e idempotente). No autoriza implementación. La implementación requerirá la orden operativa 9.3.2-A-Q2 (server-side + tests unit/integration/HTTP-frontier), seguida por 9.3.2-A-Q3 (barrera E2E) y 9.3.2-A-Q4 (promoción a la rama oficial).

---

## §1 · Identidad

**«Hito 9.3.2-A — Onboarding productivo mínimo, atómico e idempotente»**, prerrequisito obligatorio de 9.3.2-B según el contrato marco §1 y §23.

Publicará en la familia de ramas `spabla-v2/hito-9-3-2-a-*`.

## §2 · Relación con el contrato marco

Este documento cierra §9.3 (mecanismo de unicidad) y §9.4 (semántica del tenant personal) del contrato marco. No altera ninguna otra sección del marco. Cualquier conflicto material con el marco se documenta expresamente (§4 y §5) y se resuelve a favor del marco salvo autorización de Dirección para modificarlo.

## §3 · Estado actual verificado (inspección estática + catálogo)

Inspección estática de `supabase/migrations/*` y consulta del catálogo PostgreSQL local (Supabase local · Postgres 17.6, `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres"`, 2026-08-22) arrojan la siguiente foto real del esquema.

### §3.1 · `spabla_v2.tenants`

- Columnas: `id UUID PK DEFAULT gen_random_uuid()`, `name TEXT NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- Owner: `postgres`.
- Constraints: `tenants_pkey (id)`, `tenants_name_not_blank CHECK (length(btrim(name)) > 0)`.
- Índice: `tenants_pkey UNIQUE btree (id)`.
- RLS: **ENABLE + FORCE**.
- Policy: `tenants_select_own` (`SELECT authenticated USING EXISTS(...)`).
- Grants: `SELECT → authenticated`; `SELECT, INSERT → service_role`; cero grants a `anon`.
- **Sin columnas** `kind`, `type`, `owner_actor_id`, `personal_owner_actor_id` que permitan distinguir estructuralmente tenant personal de tenant compartido.

### §3.2 · `spabla_v2.tenant_memberships`

- Columnas: `tenant_id UUID NOT NULL`, `actor_id UUID NOT NULL`, `role TEXT NOT NULL`, `is_active BOOLEAN NOT NULL DEFAULT TRUE`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- Owner: `postgres`.
- Constraints: `tenant_memberships_pkey PRIMARY KEY (tenant_id, actor_id)` (composite), `tenant_memberships_role_not_blank CHECK (length(btrim(role)) > 0)`, `tenant_memberships_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES spabla_v2.tenants(id)`.
- Índices: `tenant_memberships_pkey UNIQUE btree (tenant_id, actor_id)`; `idx_tenant_memberships_actor btree (actor_id) WHERE (is_active = true)` (parcial).
- RLS: **ENABLE + FORCE**.
- Policy: `tenant_memberships_select_own` (`SELECT authenticated USING ((actor_id = auth.uid()) AND (is_active = true))`).
- Grants: `SELECT → authenticated`; `SELECT, INSERT, UPDATE, DELETE → service_role`; cero grants a `anon`.
- `role` es texto libre (sin CHECK a enum cerrado). En uso corriente: `'owner'`, `'member'` (convenciones de código y tests, no constraint DB).

### §3.3 · Funciones administrativas (SECURITY DEFINER, GRANT solo `service_role`)

- `admin_create_tenant(p_name text) RETURNS uuid` — `LANGUAGE plpgsql`, `SET search_path = pg_catalog, spabla_v2`, INSERT tenant y devuelve id. Owner `postgres`. Composable dentro de otra transacción.
- `admin_add_membership(p_tenant_id uuid, p_actor_id uuid, p_role text) RETURNS void` — INSERT en `tenant_memberships` con `is_active=TRUE`. Rechaza si tenant no existe (`SQLSTATE 23503`). **NO es idempotente**: si `(tenant_id, actor_id)` ya existe → `SQLSTATE 23505 duplicate_key`. Composable.
- `admin_deactivate_membership(p_tenant_id, p_actor_id) RETURNS void` — UPDATE `is_active=FALSE`. Idempotente. Composable.
- `admin_append_usage(...)` — irrelevante para onboarding.

### §3.4 · Bootstrap composer (`lib/v2/server/bootstrap.ts`)

- `selectedTenantId` = primer membership activo por `created_at ASC`.
- `selectedConversationId` = primera conversación del tenant seleccionado por `created_at ASC`.
- `canOperate = selectedTenantId !== null && selectedConversationId !== null` — **exige conversación** para reportar `canOperate=true`.

### §3.5 · Evidencia empírica sobre concurrencia (experimentos locales · 2026-08-22)

Ejecutados sobre Supabase local desechable con dos conexiones psql concurrentes. Resultados registrados como **observados**.

- **E1** · `SELECT ... FOR UPDATE` sobre `tenant_memberships WHERE actor_id = X` cuando la fila no existe: T2 no espera a T1 (medido 3.2 ms para T2 mientras T1 duerme 3 s). Confirma que `SELECT FOR UPDATE` **no serializa la creación** cuando la fila aún no existe.
- **E2** · `pg_advisory_xact_lock(hashtextextended('<actor>', 42))`: T2 espera al commit de T1 (medido 2032 ms de espera con T1 durmiendo 3 s tras arrancar 1 s antes). Confirma que el advisory lock **serializa correctamente** por actor.
- **E3** · Dos ejecuciones concurrentes de `admin_create_tenant('Mi espacio') + admin_add_membership(t, actor, 'owner')` en transacciones separadas: se crean **dos tenants** y **dos memberships owner** para el mismo actor. Confirma que ejecutar las dos RPC desde JavaScript **no garantiza unicidad**.
- **E4** · `admin_add_membership` sobre `(tenant_id, actor_id)` que ya existe: `SQLSTATE 23505 duplicate_key`. Confirma **falta de idempotencia** intrínseca.

### §3.6 · Debilidades encontradas (para 9.3.2-A)

- **D-1** · No existe estructura para garantizar «como máximo un tenant personal por actor».
- **D-2** · No existe estructura para distinguir tenant personal de tenant compartido.
- **D-3** · Las dos RPC actuales no pueden componerse desde JavaScript en una única transacción atómica sin envoltura server-side adicional.
- **D-4** · `admin_add_membership` no es idempotente.
- **D-5** · `bootstrap.ts` ata `canOperate` a la existencia de una conversación (§3.4), lo que colisiona con la recomendación de producto §5 del contrato marco («No se crea una conversación ficticia. `canOperate=true` significa que existe un tenant seleccionado y una membership activa suficiente para operar»).

## §4 · Semántica del espacio personal (cierre de §9.4 del marco)

Respuestas a las 15 preguntas del contrato marco §9.4 tras la evidencia §3:

1. **¿Todo usuario debe disponer de un espacio personal?** Sí. Cualquier actor autenticado por SPABLA tiene derecho a un espacio personal donde operar sin depender de invitaciones externas.
2. **¿Un usuario que ya pertenece a un tenant compartido necesita también espacio personal?** Sí. El espacio personal es independiente de otros tenants. Un usuario invitado a un tenant compartido conserva su propio espacio personal (donde puede iniciar conversaciones sin acuerdo previo con otros).
3. **¿Puede existir más de un espacio personal por actor?** No. Exactamente uno por actor.
4. **¿Puede un actor ser owner de varios tenants empresariales?** Sí (por invitación o creación autorizada). Un tenant empresarial no cuenta como espacio personal.
5. **¿Cómo se distingue estructuralmente un tenant personal?** Mediante la **restricción declarativa** elegida en §5 (opción C, ver más abajo): una tabla dedicada `spabla_v2.actor_personal_workspace(actor_id UUID PRIMARY KEY, tenant_id UUID NOT NULL UNIQUE, created_at TIMESTAMPTZ)` cuyo `actor_id` como PK garantiza cardinalidad exacta 1.
6. **¿Qué ocurre si la membership personal está desactivada?** El onboarding es responsable de mantener la coherencia entre `actor_personal_workspace` y la membership `is_active=TRUE` sobre ese tenant. Si un flujo externo desactiva la membership personal, `ensurePersonalWorkspace` la reactiva de manera idempotente (§5 · adaptador).
7. **¿Qué ocurre si el tenant personal está desactivado?** El tenant no tiene columna `is_active`. Si el tenant fuera eliminado (fuera del alcance de 9.3.2-A), la fila de `actor_personal_workspace` quedaría huérfana. Mitigación: FK `tenant_id → tenants(id) ON DELETE RESTRICT` en la tabla nueva (§5).
8. **¿Qué ocurre si el usuario abandona otros tenants?** Irrelevante para el espacio personal. Su fila en `actor_personal_workspace` permanece.
9. **¿Puede eliminarse el tenant personal?** No dentro del alcance de 9.3.2-A. Cualquier eliminación futura requerirá subhito autorizado + procedimiento con evidencia.
10. **¿Qué devuelve onboarding si ya existe?** Retorna el mismo `tenantId` sin escribir (idempotencia), y devuelve `created=false`.
11. **¿Qué devuelve bootstrap?** Tras onboarding, `bootstrap` devuelve el tenant personal en `memberships[]`, `selectedTenantId=<tenantPersonal>`, `conversations=[]`, `selectedConversationId=null`. Ver §11 para la propuesta de cambio compatible en `bootstrap.ts`.
12. **¿Cuál queda seleccionado por defecto?** El tenant personal, salvo que existan tenants compartidos preexistentes con `created_at` anterior; en ese caso la selección determinista Q2 §10 continúa aplicando y el tenant compartido más antiguo queda seleccionado.
13. **¿Se crea alguna conversación automáticamente?** **No.** Cumple explícitamente el contrato marco §9.5 y la recomendación de Dirección §5 («No se crea una conversación ficticia»).
14. **¿Qué significa `canOperate=true`?** Existencia de al menos un tenant seleccionado con membership activa suficiente para operar. Ver §11 (propuesta de cambio compatible en `bootstrap.ts`).
15. **¿Qué operación mínima permite entrar en SPABLA Chat?** Un tenant seleccionado + una membership activa. La creación de la primera conversación queda en el flujo natural del chat (fuera de 9.3.2-A y 9.3.2-B), no bloquea la operatividad tras onboarding.

## §5 · Comparación de mecanismos de unicidad y decisión

Comparación exhaustiva de las cinco opciones del contrato marco §9.3 evaluadas contra 15 dimensiones:

| Dimensión | A · Columna en `tenants` | B · Tabla asociación dedicada | **C · Registro `actor_onboarding`** | D · Advisory lock sin estructura | E · Otras |
|---|---|---|---|---|---|
| Garantía de unicidad | Parcial (índice UNIQUE parcial `WHERE personal_owner_actor_id IS NOT NULL`) | Sí (`actor_id PK`) | **Sí (`actor_id PK` + `tenant_id UNIQUE`)** | No (solo transaccional) | — |
| Atomicidad | Depende de RPC | Depende de RPC | **Depende de RPC (garantizada por FK)** | Solo dentro de la transacción | — |
| Concurrencia | UNIQUE bloquea; segunda INSERT lanza 23505 | UNIQUE bloquea; segunda INSERT lanza 23505 | **UNIQUE bloquea; segunda INSERT lanza 23505** | Lock explícito | — |
| Complejidad | Media (alterar `tenants`, backfill) | Baja | **Baja** | Muy baja (sin migración) | — |
| RLS | Requiere ajustar policy `tenants_select_own` para tenant personal | Neutro | **Neutro** (tabla admin-only) | Neutro | — |
| Privacidad | Neutro (nombre neutro §9.5 marco) | Neutro | **Neutro** | Neutro | — |
| Portabilidad | Baja (columna en tabla nuclear) | Media | **Alta** (tabla auxiliar aislada) | Media (lock name es API PostgreSQL) | — |
| Rollback | Difícil (columna en `tenants` legacy) | Fácil (`DROP TABLE`) | **Fácil (`DROP TABLE`)** | Sin migración (fácil) | — |
| Migración datos | Backfill obligatorio para usuarios existentes con múltiples tenants | Backfill puede omitirse | **Backfill puede omitirse** (tabla nueva vacía) | Sin migración | — |
| Compatibilidad tenants empresariales | Requiere semántica adicional | Compatible | **Compatible** | Compatible | — |
| Coste de consultas | Bajo | Bajo | **Bajo** (una fila por actor) | Bajo (lock adquirido/liberado) | — |
| Riesgo de huérfanos | Sí si se elimina tenant sin actualizar columna | Cero con FK ON DELETE RESTRICT | **Cero con FK ON DELETE RESTRICT** | Sí (sin persistencia) | — |
| Riesgo de lock global | Bajo | Bajo | **Bajo** | Medio (holds durante transacción; N locks por actor concurrente) | — |
| Posibilidad de reparación | Compleja (mismo modelo) | Simple (upsert manual) | **Simple** (upsert manual) | No aplica | — |
| Dependencia de Supabase | Igual | Igual | **Igual** (postgres estándar) | Baja (advisory lock es PG) | — |
| Auditoría por comprador futuro | Confusa (semántica mezclada) | Media (dos tablas de asociación) | **Clara** (tabla dedicada, propósito único) | Difusa (lock invisible) | — |

**Decisión de arquitectura**: **opción C · Registro `spabla_v2.actor_personal_workspace`**.

Ventaja decisiva: garantía declarativa PostgreSQL nativa (PK sobre `actor_id`) que **imposibilita** por diseño más de un tenant personal por actor, con propósito único y auditoría trivial, y con capacidad de rollback simple. La opción B (asociación dedicada) es equivalente en garantía pero el término "onboarding" no describe correctamente la semántica futura; "personal_workspace" nombra exactamente el invariante de producto ("un actor tiene exactamente un espacio personal").

La opción B queda como candidata reconocida si Dirección prefiere el nombre `actor_personal_tenants`. La opción D queda como técnica **complementaria** dentro de la propia función server-side (belt-and-braces para serializar por actor incluso antes de encontrar el conflicto de PK), NO como garantía única.

## §6 · Invariantes de producto

- **I-1** · Exactamente un espacio personal por actor.
- **I-2** · El espacio personal existe desde la primera sesión operativa del actor.
- **I-3** · El espacio personal es distinto de cualquier tenant compartido o empresarial.
- **I-4** · El nombre visible del espacio personal es neutro localizado («Mi espacio» en español) y NO deriva del email ni de otro identificador con PII.
- **I-5** · La creación del espacio personal es idempotente: cualquier repetición devuelve el mismo `tenantId`.
- **I-6** · La creación es atómica: si algo falla, no queda tenant huérfano ni membership huérfana.
- **I-7** · El cliente NO puede autoasignarse `tenantId`, `role`, `ownerId`, `actorId` ni email.
- **I-8** · SPABLA usa exclusivamente API pública de Supabase Auth para identidad; el onboarding no consulta ni modifica tablas del schema `auth`.
- **I-9** · La retirada de Supabase como proveedor de Auth o de Postgres no debe alterar la semántica funcional del onboarding.

## §7 · Operación de dominio

Definida en términos de dominio SPABLA, independiente del proveedor:

```
ensurePersonalWorkspace(actorId: ActorId): PersonalWorkspaceResult
```

**Entrada**:

- `actorId`: `ActorId` (UUID validado por la frontera de autenticación).

**Salida**:

- `PersonalWorkspaceResult`:
  - `tenantId: TenantId`
  - `role: 'owner'`
  - `created: boolean` — `true` si se creó ahora; `false` si ya existía.

**Propiedades contractuales**:

- Atómica: la operación no puede terminar en un estado intermedio observable.
- Idempotente: dos ejecuciones para el mismo `actorId` devuelven el mismo `tenantId` y no crean recursos duplicados.
- Segura bajo concurrencia: N ejecuciones simultáneas para el mismo actor terminan con exactamente un espacio personal.
- Reintentable: ante error transitorio el caller puede repetir sin efectos secundarios.
- Sin PII: la entrada no incluye email ni identificadores personales; la salida no revela detalles internos.
- Sin parámetros controlables por cliente: el `actorId` viene del token JWT validado, no del cuerpo HTTP.
- Sin dependencia de tablas internas Auth.
- Rollback completo ante fallo.

La semántica pública NO menciona `service_role`, PostgREST, `admin_create_tenant`, `admin_add_membership`, ni ninguna tabla concreta.

## §8 · Puerto y adaptador

Separación estricta:

### §8.1 · Puerto (interfaz de dominio)

```
interface PersonalWorkspaceProvider {
  ensure(actorId: ActorId): Promise<PersonalWorkspaceResult>;
}
```

Vive en `lib/v2/server/onboarding.ts` (o en `engine/` si Dirección prefiere ubicarlo con el resto de puertos de dominio). Cero mención de SQL, Postgres, Supabase o transacciones.

### §8.2 · Adaptador actual (Postgres/Supabase)

Implementación en `lib/v2/server/onboarding.supabase.ts` (nombre orientativo). Consume el cliente `service_role` server-side. Delega el trabajo real a **una única RPC transaccional** en PostgreSQL definida en migración nueva (§14). Cero orquestación desde JavaScript.

### §8.3 · Frontera HTTP

`app/api/v2/onboarding/route.ts` (definido en §10). Únicamente:

- valida el JWT con `verifyJwt` (Q3-R FASE 4);
- llama al puerto `PersonalWorkspaceProvider.ensure(actorId)`;
- serializa la respuesta pública sanitizada.

Cero lógica de dominio en el handler HTTP.

### §8.4 · Tabla de acoplamientos

| Acoplamiento | Aceptado actualmente | Prohibido | Estrategia de sustitución |
|---|---|---|---|
| Auth externa (Supabase Auth) | Sí, a través de `verifyJwt` + JWT `sub` | Consulta directa a `auth.users`, `auth.sessions` u otras tablas `auth.*` | Sustituir `verifyJwt` por un puerto `IdentityVerifier` cuando Dirección lo autorice |
| Persistencia (PostgreSQL/Supabase) | Sí, a través de adaptador `PersonalWorkspaceProvider` | Referencia directa a Supabase SDK desde el dominio | Sustituir el adaptador por otro adaptador que respete el mismo contrato |
| Nomenclatura de tenant | «Mi espacio» localizado | Nombre derivado del email | Añadir puerto `PersonalWorkspaceNamer` si la localización crece |
| Errores | Alfabeto cerrado `unauthorized/internal/unavailable/not_found` (heredado de `http-error.ts`) | Fugar mensajes SQL o del proveedor Auth | Sanitización en `http-error.ts` + tests |
| Correlation-id | UUID v4 en cada respuesta | Referencia a un identificador del proveedor | Ya cumplido por `newCorrelationId()` |

### §8.5 · Evidencia de portabilidad

Cero mención de `spabla_v2`, `Postgres`, `Supabase`, `RLS` o `service_role` en las interfaces `PersonalWorkspaceProvider` y `ensurePersonalWorkspace`. Un adaptador alternativo (por ejemplo un backend REST de terceros) podría implementar el mismo puerto respetando idempotencia, atomicidad y unicidad, sin modificar el handler HTTP ni el composer del bootstrap.

## §9 · RPC transaccional (adaptador actual)

Diseño de la única función server-side que ejecuta el onboarding dentro de una transacción PostgreSQL única.

**Firma propuesta** (orientativa, se cierra en 9.3.2-A-Q2):

```sql
CREATE OR REPLACE FUNCTION spabla_v2.admin_ensure_personal_workspace(
    p_actor_id uuid
)
RETURNS TABLE (tenant_id uuid, role text, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, spabla_v2
AS $function$
DECLARE
    v_existing_tenant uuid;
    v_new_tenant      uuid;
BEGIN
    -- (1) Validación estructural: actorId no puede ser NULL.
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'admin_ensure_personal_workspace: actor_id required'
            USING ERRCODE = '22023';
    END IF;

    -- (2) Serialización belt-and-braces por actor (§3.5 E2). Redundante
    --     con la PK de actor_personal_workspace, pero evita locks a nivel
    --     de fila y hace explícita la intención.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_id::text, 9321));

    -- (3) Comprobación idempotente: si ya existe, devolver sin escribir.
    SELECT apw.tenant_id INTO v_existing_tenant
      FROM spabla_v2.actor_personal_workspace apw
     WHERE apw.actor_id = p_actor_id;

    IF v_existing_tenant IS NOT NULL THEN
        -- Asegurar coherencia de la membership (§4 pregunta 6): si por
        -- flujo externo quedó inactiva, reactivar aquí.
        UPDATE spabla_v2.tenant_memberships
           SET is_active = TRUE
         WHERE tenant_id = v_existing_tenant
           AND actor_id  = p_actor_id;
        RETURN QUERY SELECT v_existing_tenant, 'owner'::text, FALSE;
        RETURN;
    END IF;

    -- (4) Creación atómica dentro de la misma transacción.
    v_new_tenant := spabla_v2.admin_create_tenant('Mi espacio');
    INSERT INTO spabla_v2.actor_personal_workspace (actor_id, tenant_id)
    VALUES (p_actor_id, v_new_tenant);
    PERFORM spabla_v2.admin_add_membership(v_new_tenant, p_actor_id, 'owner');

    RETURN QUERY SELECT v_new_tenant, 'owner'::text, TRUE;
END;
$function$;

ALTER FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid) TO   service_role;
```

**Propiedades garantizadas por diseño**:

- **Atomicidad** — todo dentro de una única transacción PL/pgSQL; si cualquier paso falla, todo se revierte (cero tenant huérfano, cero membership huérfana).
- **Idempotencia** — el paso (3) devuelve el registro existente sin escribir; dos llamadas para el mismo actor devuelven el mismo `tenantId` con `created=false` en la segunda.
- **Concurrencia** — el advisory lock (2) serializa por actor (§3.5 E2 evidencia empírica); adicionalmente, la PK de `actor_personal_workspace` (5) impide por restricción declarativa que dos filas para el mismo `actor_id` coexistan.
- **Rollback** — falla en (4.a) tras crear tenant y antes de insertar en `actor_personal_workspace`: la transacción hace ROLLBACK del INSERT en `tenants`. Cero huérfanos.
- **Localización** — el literal `'Mi espacio'` es orientativo; en 9.3.2-A-Q2 se recibirá como parámetro para permitir la localización según la lengua activa del hito 9.2 (`es|en|...`), sin PII.

Cero afirmación normativa depende de `SELECT ... FOR UPDATE` sobre una fila que puede no existir (§3.5 E1).

## §10 · Contrato HTTP · `POST /api/v2/onboarding`

- **Método único**: `POST`. Otros verbos → `404 not_found` opaco (patrón hito 9.2.5-C).
- **Autenticación**: `Authorization: Bearer <access_token>` obligatorio. Validado por `verifyJwt`. El server extrae `actorId` exclusivamente del claim `sub`.
- **Body**: `{}` o vacío. El cliente NO envía `tenantId`, `role`, `ownerId`, `actorId` ni email. Body inesperado se ignora (no rechazo estricto para robustez ante clientes evolutivos, pero cualquier campo enviado no tiene efecto).
- **Content-Type**: `application/json`.
- **Correlation-id**: `X-SPABLA-Correlation-Id: <UUID v4>` en cada respuesta.
- **Timeouts**: coherentes con el resto de `app/api/v2/*` (`export const dynamic = "force-dynamic"; export const runtime = "nodejs";`).

**Respuesta exitosa**:

- **`200 OK`** con body `{ tenantId: string, role: 'owner' }`. Se elige **`200` para ambos casos** (creación y repetición idempotente).
- Justificación de `200` vs `201/200`:
  - El cliente **no** necesita distinguir entre creación y repetición para tomar decisiones de UI. Bootstrap posterior es la fuente autoritativa (§10 final).
  - `201 Created` obligaría al cliente a leer `Location:` o a interpretar códigos distintos para el mismo efecto observable ("el usuario tiene su espacio personal"). Simplifica el contrato.
  - El campo `created: boolean` de la RPC (§9) queda en el log/observabilidad server-side (§16), no en la respuesta al cliente. El cliente no lo necesita.

**Respuestas de error** (alfabeto cerrado heredado de `lib/v2/server/http-error.ts`):

- `401 unauthorized` — JWT ausente/malformado/inválido/expirado. Body `{ error: 'unauthorized', correlationId }`.
- `503 unavailable` — error transitorio de DB (por ejemplo lock timeout, connection error). Body `{ error: 'unavailable', correlationId }`. El cliente puede reintentar (idempotencia §9).
- `500 internal` — cualquier otro error no clasificable. Body sanitizado; cero mensaje SQL en el body.
- `404 not_found` — verbos no permitidos. Body `{ error: 'not_found', correlationId }`.

**Cero exposición** de: SQL, `service_role`, email, `sub` raw fuera del `correlationId`.

**El cliente NO puede** elegir rol ni tenant: el server los deriva del JWT o los crea. Un cliente malicioso que envíe `{"role":"admin","tenantId":"..."}` obtiene el mismo comportamiento que un cliente que envía `{}`.

**Después del onboarding**, el cliente **debe** re-invocar `GET /api/v2/bootstrap` para obtener el contexto completo. La respuesta de `POST /api/v2/onboarding` es intencionalmente minimalista.

## §11 · Ajuste compatible en `bootstrap.ts` (propuesta)

**Conflicto identificado** (§3.6 D-5): `bootstrap.ts` define `canOperate = selectedTenantId !== null && selectedConversationId !== null`. Un usuario nuevo con onboarding completado pero sin conversación aún tendría `canOperate=false`. Esto viola la recomendación de producto del contrato marco §5 («No se crea una conversación ficticia. `canOperate=true` significa que existe un tenant seleccionado y una membership activa suficiente para operar»).

**Propuesta mínima compatible**:

Modificar `lib/v2/server/bootstrap.ts:90` para:

```ts
const canOperate = selectedTenantId !== null;
```

**Compatibilidad hacia atrás**:

- Usuarios existentes con conversación siguen teniendo `canOperate=true` (no regresión).
- Usuarios nuevos con onboarding pero sin conversación pasan a tener `canOperate=true` (habilitación del recorrido B).
- Contrato Q2 §10 del hito 9.3.1 mencionaba `canOperate = selectedTenantId !== null && selectedConversationId !== null`. El cambio afecta el subhito 9.3.2-A y debe registrarse en su acta.
- La UI puede seguir mostrando un estado "Sin conversación aún — comienza una" cuando `selectedConversationId === null`, sin bloquear el chat operable.

**Barrera de regresión**: los 14 escenarios Q3-E2E-R permanecen verdes tras el cambio porque el escenario §20-11 (bootstrap ausente) usa `userC` **sin membership** — para él `selectedTenantId===null` sigue vigente y `canOperate=false` no cambia.

Este ajuste **NO es** una modificación del contrato marco; es la resolución explícita del punto §9.4 pregunta #14 dentro de la libertad que el propio marco delega a 9.3.2-A. Se aplica en 9.3.2-A-Q2 dentro del mismo cambio productivo del onboarding.

## §12 · RLS, grants, service_role

**RLS**:

- `spabla_v2.actor_personal_workspace` (nueva) recibirá `ENABLE ROW LEVEL SECURITY + FORCE ROW LEVEL SECURITY`.
- **Cero policy** para `authenticated` sobre esta tabla: el actor autenticado no necesita leerla directamente (bootstrap devuelve las memberships).
- Solo `service_role` accede (via función `SECURITY DEFINER`).

**Grants**:

- Cero grants a `anon`.
- Cero grants a `authenticated` sobre `actor_personal_workspace`.
- `service_role`: `SELECT, INSERT, UPDATE, DELETE`.

**Service role**:

- Encapsulado exclusivamente en `lib/v2/server/onboarding.supabase.ts`.
- Cero exposición al cliente. Cero import del cliente de esa constante.
- El proceso de instantiation del cliente `service_role` reutiliza el patrón de `translation-runtime.ts` (validación de env var + client `persistSession: false, autoRefreshToken: false`).

## §13 · STRIDE acotado al onboarding

| # | Amenaza | Activo | Actor adversario | Vector | Control preventivo | Control detective | Evidencia | Riesgo residual |
|---|---|---|---|---|---|---|---|---|
| S1 | Suplantación del actor | Identidad de usuario | Usuario malicioso ajeno | JWT robado | `verifyJwt` valida firma + `exp` (Q3-R) | Métrica de invocaciones por `sub` en observabilidad | Reutiliza Q3-R | Bajo (idem 9.3.1) |
| S2 | Manipulación de `actorId` en body | Selección de espacio personal | Cliente | Enviar `{"actorId":"otro"}` | Handler ignora body; `actorId` viene del JWT | Log `correlationId` + `actorId` (redactado) sanitizado | Test §14-17 | Cero (constructivo) |
| S3 | Autoasignación de `role` owner | Membership no autorizada | Cliente | Enviar `{"role":"admin"}` | Server siempre asigna `'owner'` en su tenant personal | Test §14-18 | Test §14-18 | Cero (constructivo) |
| S4 | Autoasignación de `tenantId` | Membership en tenant ajeno | Cliente | Enviar `{"tenantId":"ajeno"}` | Server siempre crea/consulta el tenant personal del actor | Test §14-17 | Test §14-17 | Cero (constructivo) |
| S5 | Repetición masiva por un mismo actor | DoS del onboarding | Cliente | Bucle de POST | Idempotencia (§9) + rate limit del hosting Next.js | Métrica `#onboarding_por_actor_por_minuto` | 200 latencia p95 | Bajo (idempotente) |
| S6 | Carrera concurrente | Duplicación de tenants | Cliente / dos pestañas | Doble POST simultáneo | PK `actor_personal_workspace(actor_id)` + advisory lock | Test §14-11..14-13 | Test §14-11..14-13 | Cero (declarativo) |
| S7 | Escalada mediante `service_role` | Acceso privilegiado | Vulnerabilidad server-side | Fuga de env var | Encapsulado en `onboarding.supabase.ts`; cero exposición al cliente | Escaneo de secretos en artefactos | `logSanitizedError` | Bajo |
| S8 | Exposición de mensajes SQL | Fuga de estructura interna | Cliente | Provocar error para leer stack SQL | `opaqueError` sanitiza; `SQLSTATE` no llega al cliente | Test §14-32-34 | Test §14-34 | Cero (constructivo) |
| S9 | Creación abusiva de tenants | Inflación de la tabla `tenants` | Cliente | Bucle | Idempotencia — cero tenant nuevo por repetición | Métrica tenants creados/actor | Test §14-22 | Cero |
| S10 | Denegación de servicio mediante locks | Bloqueo de otros actores | Cliente | Provocar advisory lock largo | Advisory **transaction** lock (libera al commit); RPC muy corta (<100 ms típico) | Métrica latencia p95 | Test §14-13 | Bajo |
| S11 | Tenant huérfano | Consistencia | Fallo mid-transacción | Crash entre RPC | Transacción única PL/pgSQL: rollback total | Test §14-14, 14-15 | Migración test | Cero |
| S12 | Membership huérfana | Consistencia | Fallo mid-transacción | Crash entre INSERTs | Idem S11 | Test §14-24, 14-25 | Idem | Cero |
| S13 | Reutilización de JWT revocado | Sesión expirada usada | Cliente ex-usuario | JWT no expirado tras signOut | `verifyJwt` valida solo `exp` y firma; comportamiento heredado de 9.3.1 Q3 §14 | Log de auth-recovery | Test §14-4 | Aceptado (marco §14) |
| S14 | Confusión entre tenant personal y empresarial | UX + selección incorrecta | Bootstrap composer | Ordenamiento por `created_at` mezcla ambos | 9.3.2-A introduce `actor_personal_workspace` como distinguibilidad estructural | Test §14-27, 14-28 | Test §14-27 | Bajo |
| S15 | Logs con PII o credenciales | Fuga de datos | Server-side accidental | Volcar respuesta o body en log | `logSanitizedError` (heredado Q3-R §20.6); cero campo `email` en el flujo | Test §14-33 | Test §14-33 | Bajo |

OTP y sus amenazas específicas **NO** se tratan aquí — corresponden a 9.3.2-B.

## §14 · Matriz de pruebas futura

Cada escenario define: precondición, acción, resultado esperado, evidencia, limpieza, riesgo cubierto.

| # | Escenario | Riesgo cubierto |
|---|---|---|
| 1 | Sin `Authorization` → 401 opaco | S1 |
| 2 | JWT malformado → 401 opaco | S1 |
| 3 | JWT inválido (firma corrupta) → 401 opaco | S1 |
| 4 | JWT expirado → 401 opaco | S13 |
| 5 | Actor nuevo → 200 con tenant creado (`created=true` en observabilidad) | I-2, S6 |
| 6 | Actor ya provisionado → 200 con mismo `tenantId` (`created=false`) | I-5 |
| 7 | Actor con membership en tenant compartido pero sin personal → 200 crea el personal | I-3 |
| 8 | Actor con tenant personal y tenant compartido → 200 idempotente sobre personal | I-3, I-5 |
| 9 | Membership personal desactivada externamente → 200 reactiva | Recuperación §9(3.a) |
| 10 | Tenant personal eliminado por flujo futuro → 200 crea uno nuevo *(fuera de alcance 9.3.2-A; documentar como no soportado)* | Consistencia |
| 11 | Dos llamadas secuenciales → mismo `tenantId` | I-5 |
| 12 | Dos llamadas concurrentes → mismo `tenantId`; cero duplicación en DB | S6 |
| 13 | 20 llamadas concurrentes → un solo tenant y una sola membership en DB | S6, S10 |
| 14 | Fallo forzado tras crear tenant, antes de insertar en `actor_personal_workspace` → ROLLBACK completo, cero huérfanos | S11, S12 |
| 15 | Fallo forzado antes de commit → ROLLBACK completo | S11 |
| 16 | 503 transient → cliente reintenta y obtiene 200 idempotente | S5 |
| 17 | Cliente intenta enviar `{"tenantId":"X"}` → 200 con tenant real, cero efecto | S4 |
| 18 | Cliente intenta enviar `{"role":"admin"}` → 200 con `role='owner'`, cero efecto | S3 |
| 19 | Cliente intenta enviar `{"actorId":"otro"}` → 200 con actor del JWT, cero efecto | S2 |
| 20 | Body inesperado (arrays, strings) → 200 o 400, jamás 500; sanitizado | Robustez |
| 21 | Método `GET`/`PUT`/`PATCH`/`DELETE`/`HEAD` → 404 opaco | Coherencia con 9.2.5-C |
| 22 | Post-onboarding: DB tiene exactamente 1 tenant creado para el actor | S9, S14 |
| 23 | Post-onboarding: DB tiene exactamente 1 membership para el actor en su tenant personal | S12 |
| 24 | Post-fallo simulado: DB no tiene tenant huérfano | S11 |
| 25 | Post-fallo simulado: DB no tiene membership huérfana | S12 |
| 26 | Bootstrap posterior devuelve `selectedTenantId=<personal>` | Integración §11 |
| 27 | Bootstrap posterior devuelve `selectedTenantId=<compartido>` cuando existe y es más antiguo (selección determinista Q2 §10) | §4 pregunta 12 |
| 28 | `canOperate=true` tras onboarding (§11) | §4 pregunta 14 |
| 29 | Cero conversación creada por el onboarding | §9.5 marco |
| 30 | RLS: `authenticated` no puede `SELECT` en `spabla_v2.actor_personal_workspace` | §12 |
| 31 | Función `admin_ensure_personal_workspace` no invocable por `anon` | §12 |
| 32 | Función no invocable directamente por `authenticated` (grant revocado) | §12 |
| 33 | Logs sin `email`, sin `tenantId` como PII, sin JWT | S15 |
| 34 | Errores sanitizados (cero `SQLSTATE`, cero mensaje PostgreSQL) | S8 |
| 35 | Rollback de migración en entorno desechable: `DROP TABLE spabla_v2.actor_personal_workspace CASCADE` → cero efecto sobre `tenants` existentes | §15 |
| 36 | Restore drill pasa tras aplicar la migración | Job C |
| 37 | Los 14 tests Q3-E2E-R permanecen verdes | Contrato marco §11 |
| 38 | Cero llamadas OpenAI durante las pruebas | Reproducibilidad y coste |

La prueba de concurrencia §12/§13 debe comprobar el estado **final en base de datos** (no solo respuestas HTTP), con `SELECT COUNT(*) FROM spabla_v2.actor_personal_workspace WHERE actor_id = <fixture>` y `SELECT COUNT(*) FROM spabla_v2.tenant_memberships WHERE actor_id = <fixture>` — ambos deben devolver `1`.

## §15 · Migración prevista + rollback

### §15.1 · Migración

**Nombre**: `supabase/migrations/<YYYYMMDD>000000_hito_9_3_2_a_actor_personal_workspace.sql` (fecha concreta se elige en 9.3.2-A-Q2 respetando el orden lexicográfico).

**Contenido** (esqueleto orientativo):

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS spabla_v2.actor_personal_workspace (
    actor_id   uuid        NOT NULL,
    tenant_id  uuid        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT actor_personal_workspace_pkey PRIMARY KEY (actor_id),
    CONSTRAINT actor_personal_workspace_tenant_id_key UNIQUE (tenant_id),
    CONSTRAINT actor_personal_workspace_tenant_fkey
        FOREIGN KEY (tenant_id) REFERENCES spabla_v2.tenants (id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
);
ALTER TABLE spabla_v2.actor_personal_workspace OWNER TO postgres;

ALTER TABLE spabla_v2.actor_personal_workspace ENABLE  ROW LEVEL SECURITY;
ALTER TABLE spabla_v2.actor_personal_workspace FORCE   ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON spabla_v2.actor_personal_workspace TO service_role;

-- Función server-side atómica e idempotente (ver §9)
CREATE OR REPLACE FUNCTION spabla_v2.admin_ensure_personal_workspace(p_actor_id uuid)
RETURNS TABLE (tenant_id uuid, role text, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, spabla_v2
AS $$ ... $$;

ALTER FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid) TO   service_role;

COMMIT;
```

**Propiedades de la migración**:

- **Aditiva pura**: crea tabla nueva y función nueva; cero modificación de tablas existentes.
- **Backfill**: no aplica. La tabla arranca vacía. Los usuarios existentes con memberships previos se onboardean lazy al invocar el endpoint por primera vez.
- **Restricción**: PK sobre `actor_id` garantiza cardinalidad exacta 1; UNIQUE sobre `tenant_id` garantiza que un tenant no pueda ser el personal de dos actores distintos.
- **Índices**: la PK y UNIQUE crean sus propios índices btree.
- **RLS**: ENABLE + FORCE; cero policy para `authenticated`.
- **Grants**: cero grants a `anon`; cero grants a `authenticated`; solo `service_role`.
- **Compatibilidad hacia atrás**: usuarios existentes que ya tenían memberships en tenants compartidos siguen operando (bootstrap sigue devolviendo esas memberships). Se onboardean al espacio personal cuando invoquen el endpoint por primera vez.
- **Restore drill**: la migración se aplica exactamente igual sobre el `restored_target` de Job C, sin datos existentes.

### §15.2 · Rollback

Diferenciación explícita:

- **Rollback de código**: `git revert` del commit del handler + adaptador + composer + tests. El schema queda con la tabla nueva vacía o con filas ya creadas — inofensivas.
- **Rollback de esquema**: en un entorno desechable, `DROP TABLE spabla_v2.actor_personal_workspace CASCADE;` + `DROP FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid);`. **En producción, NO** se hace rollback de esquema si ya hay filas legítimas: se prefiere mantener la tabla desactivada del flujo y planificar migración de datos.
- **Rollback funcional**: feature flag opcional (`SPABLA_V2_ONBOARDING_ENABLED` o equivalente) que oculta la invocación al endpoint desde el cliente y mantiene el flujo previo (usuario nuevo → `canOperate=false`).
- **Datos creados legítimamente**: usuarios que ya se onboardearon conservan su tenant personal. Cualquier subhito futuro que necesite reparación debe respetar esos datos.

**Cero operación destructiva** en producción sin decisión de Dirección.
**Cero dependencia de V1** en la migración.

## §16 · Observabilidad

Métricas server-side (agregadas, sin PII):

- `onboarding.requests_total` — por resultado (200/created, 200/idempotent, 401, 500, 503).
- `onboarding.latency_p50/p95/p99` — sólo agregado, sin actor.
- `onboarding.duplicates_prevented_total` — incremento cuando el paso (3) devuelve el registro existente.
- `onboarding.reactivations_total` — incremento cuando el paso (3.a) reactiva la membership.

Cero PII en trazas. Cero `email`. Cero `actorId` en texto plano (redactado por `logSanitizedError`). El `correlationId` UUID v4 sigue siendo el pivot.

## §17 · Privacidad

- Cero persistencia del `email` en `spabla_v2` (I-8): la tabla nueva solo contiene `actor_id UUID` (referencia opaca al `auth.users.id`), `tenant_id UUID` y `created_at`.
- Cero derivación del nombre visible del tenant a partir de `email`, `actor_id` u otro identificador con PII (I-4).
- Cero traza del `email` en logs, errores, artefactos CI o base de datos SPABLA.

## §18 · Riesgos residuales

- **R-A** · Migración añade tabla nueva. Bloquea GO producción hasta que 9.3.2-A-Q3 (barrera E2E) valide `restore drill` completo. Mitigación: `restore drill` en CI Job C.
- **R-B** · El cambio en `bootstrap.ts:90` (`canOperate = selectedTenantId !== null`) modifica el semántico observado por clientes actuales. Los 14 escenarios Q3-E2E-R deben permanecer verdes (§14-37).
- **R-C** · Un tenant personal puede quedar «huérfano» si un flujo futuro elimina la membership sin borrar la fila de `actor_personal_workspace`. Mitigación: FK `ON DELETE RESTRICT` en la migración impide borrado de tenant que aún tenga fila en `actor_personal_workspace`.
- **R-D** · `admin_ensure_personal_workspace` usa `SECURITY DEFINER` con el owner `postgres`, herencia estándar del proyecto. Cualquier vulnerabilidad en el `search_path` es amenaza. Mitigación: `SET search_path = pg_catalog, spabla_v2` (patrón heredado de las funciones existentes).
- **R-E** · Advisory lock a nivel de aplicación no persiste entre reinicios. No es problema porque el lock es transaccional (se libera al commit/rollback). La PK garantiza la unicidad incluso si el lock falla.
- **R-F** · El nombre `'Mi espacio'` en español no es adecuado para usuarios en otras lenguas. Se pasa como parámetro en 9.3.2-A-Q2 con localización derivada del header `Accept-Language` o de las preferencias actor-scoped.

## §19 · Archivos previsiblemente afectados

**Nuevos** (creación en 9.3.2-A-Q2):

- `supabase/migrations/<YYYYMMDD>000000_hito_9_3_2_a_actor_personal_workspace.sql` — migración aditiva (§15).
- `lib/v2/server/onboarding.ts` — puerto `PersonalWorkspaceProvider` + orquestador.
- `lib/v2/server/onboarding.supabase.ts` — adaptador Supabase/service_role.
- `lib/v2/server/onboarding.test.ts` — unit tests del composer con `verifyJwt` mockeado.
- `app/api/v2/onboarding/route.ts` — handler HTTP.
- `app/api/v2/onboarding/route.handler.test.ts` — direct-handler tests.
- `app/api/v2/onboarding/route.http.integration.test.ts` — HTTP-frontier contra Supabase local.
- Escenarios E2E ampliados en `e2e/auth-continuity.spec.ts` (9.3.2-A-Q3) — al menos §14-11..14-13, §14-22..14-28, §14-37.
- `docs/audit_reports/AUDIT_<fecha>_hito-9-3-2-a-onboarding.md` — acta tras cierre.

**Modificados** (mínimo):

- `lib/v2/server/bootstrap.ts:90` — cambio de `canOperate` (§11).

**Cero cambio productivo en**:

- `lib/v2/client/session-refresh-coordinator.ts`, `fetch-with-auth-retry.ts`, `auth-recovery-coordinator.ts`, `bootstrap-client.ts`, `supabase-browser-client.ts`.
- `lib/v2/server/composition.ts`.
- `app/api/v2/bootstrap/route.ts`, `app/api/v2/messages/route.ts`, `app/api/v2/seed/route.ts`.
- Todas las tablas y funciones existentes.

## §20 · GO / NO-GO

**GO 9.3.2-A** cuando:

1. Migración aditiva aplica limpiamente en local y en CI (`restore drill` PASS).
2. Los 38 escenarios de §14 pasan verdes en Job B/D según su tipo.
3. Los 14 escenarios Q3-E2E-R permanecen verdes.
4. Cero cambio en config Supabase.
5. Cero exposición de `service_role` al cliente.
6. Cero PII persistido en `spabla_v2`.
7. Cero mensaje SQL en respuestas HTTP.
8. Acta breve de Dirección (patrón heredado).
9. CI oficial post-implementación attempt=1 · success · Jobs A/B/C/D success.

**NO-GO** si:

- Cualquier escenario de §14 falla o queda NO EJECUTABLE.
- Regresión sobre Q3-E2E-R.
- Aparece un cambio de semántica no cubierto por §11.
- Se detecta filtración de PII o de `service_role`.

## §21 · Secuencia futura de implementación

- **9.3.2-A-Q1 · Verificación técnica y contrato específico** — **este documento** (completado por esta orden).
- **9.3.2-A-Q2 · Implementación server-side** — migración + `lib/v2/server/onboarding*.ts` + `app/api/v2/onboarding/route.ts` + tests unit/integration/HTTP-frontier + ajuste `bootstrap.ts:90`.
- **9.3.2-A-Q3 · Barrera E2E** — ampliación de `e2e/auth-continuity.spec.ts` con al menos los escenarios §14-11..14-13, §14-22..14-28, §14-37.
- **9.3.2-A-Q4 · Promoción** — fast-forward a `spabla-v2/thirteen-languages-activation` siguiendo el patrón Q3-P.

Tras 9.3.2-A-Q4 y solo entonces, se abre la secuencia 9.3.2-B (OTP email) según el contrato marco §23.

---

## Anexo A · Comandos SQL de verificación (2026-08-22 · Supabase local · Postgres 17.6)

```sql
-- (1) Tablas en spabla_v2
SELECT tablename FROM pg_tables WHERE schemaname='spabla_v2';
-- devuelve: conversations, message_translations, messages, tenant_memberships, tenants, usage_ledger

-- (2) Constraints en tenants + tenant_memberships
SELECT conname, contype, pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE conrelid::regclass::text IN ('spabla_v2.tenants','spabla_v2.tenant_memberships');
-- confirma composite PK (tenant_id, actor_id) en memberships; PK (id) en tenants; sin UNIQUE(actor_id)

-- (3) Policies
SELECT tablename, policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname='spabla_v2'
   AND tablename IN ('tenants','tenant_memberships');
-- confirma solo SELECT policies, sin INSERT/UPDATE/DELETE ordinary

-- (4) Grants
SELECT grantee, privilege_type
  FROM information_schema.table_privileges
 WHERE table_schema='spabla_v2' AND table_name IN ('tenants','tenant_memberships');
-- confirma authenticated: SELECT; service_role: SELECT/INSERT/UPDATE/DELETE; anon: cero

-- (5) RLS enabled/forced
SELECT relname, relrowsecurity, relforcerowsecurity
  FROM pg_class
 WHERE relnamespace = 'spabla_v2'::regnamespace
   AND relname IN ('tenants','tenant_memberships');
-- confirma t, t en ambos
```

## Anexo B · Experimentos concurrencia (2026-08-22)

Los cuatro experimentos §3.5 se ejecutaron sobre la base local desechable, se documentaron con `\timing on` para latencia observada, y el stack se detuvo con `supabase stop --no-backup` sin persistir datos.

- **E1**: `SELECT FOR UPDATE` sobre membership inexistente → T2 no bloqueado (3.2 ms). **Observado**.
- **E2**: `pg_advisory_xact_lock(hashtextextended(actor, 42))` → T2 espera 2032 ms. **Observado**.
- **E3**: dos RPC separadas → 2 tenants creados para el mismo actor. **Observado**.
- **E4**: `admin_add_membership` sobre `(tenant_id, actor_id)` existente → `SQLSTATE 23505`. **Observado**.

---

**Estado del contrato específico**: cerrado. Ninguna implementación autorizada por esta rama documental. La siguiente orden autorizada es **9.3.2-A-Q2 · Implementación server-side atómica del onboarding**.
