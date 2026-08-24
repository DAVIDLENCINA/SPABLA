# SPABLA V2 · Hito 9.3.2-A — Contrato específico del onboarding productivo atómico

**Versión**: `Q1-R (Hito 9.3.2-A-Q1-R · 2026-08-24)`. Rectifica y sustituye Q1 (`b99185263500220772f595a921c526ade0bc2acc`) para resolver **OBS-Q1-1** (localización controlada por servidor) y **OBS-Q1-2** (eliminación definitiva del actor, retención, anonimización y reparación de mappings huérfanos).
**Rama documental**: `spabla-v2/hito-9-3-2-a-q1-r-onboarding-contract`.
**Base oficial exacta**: `fb0a75676451b33934b149a718f3c4a55b92db3b` (`spabla-v2/thirteen-languages-activation`, cerrada por `HITO 9.3.1-Q3-E2E-R3-P · CONTINUIDAD NATURAL PROMOVIDA A OFICIAL — CERRADO`).
**CI oficial autorizante de la base**: [`32755010804`](https://github.com/DAVIDLENCINA/SPABLA/actions/runs/32755010804) attempt 1 · success · Jobs A/B/C/D success · Job D 14 passed · PostgreSQL 17 · restore drill PASS.
**Contrato marco gobernante**: `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_2_PASSWORDLESS_OTP_CONTRACT.md` (R2).
**Contrato Q1 anterior (bloqueado)**: `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_2_A_ONBOARDING_CONTRACT.md` @ `b99185263500220772f595a921c526ade0bc2acc` (rama `spabla-v2/hito-9-3-2-a-q1-onboarding-contract`, intacta).
**Actas previas**: `docs/audit_reports/AUDIT_2026-08-22_hito-9-3-1-q3-auth-continuity-implementation.md` · `docs/audit_reports/AUDIT_2026-08-24_hito-9-3-1-q3-s6-natural-context-r3.md` · `docs/audit_reports/AUDIT_2026-08-24_hito-9-3-2-a-q1-r-onboarding-contract.md` (esta unidad).

**Autoridad**: este documento congela el alcance normativo de la unidad **9.3.2-A** (onboarding productivo mínimo, atómico e idempotente). **No autoriza implementación**. La implementación requerirá la orden operativa 9.3.2-A-Q2 (server-side + tests unit/integration/HTTP-frontier), seguida por 9.3.2-A-Q3 (barrera E2E) y 9.3.2-A-Q4 (promoción a la rama oficial).

**Alcance de la rectificación Q1-R**: normativa contractual únicamente. Cero migración, cero endpoint, cero código productivo, cero test, cero modificación de Supabase, cero cambio en workflows. La rectificación afecta a §4, §6, §9, §10, §13, §14, §17 y añade §17-bis y §17-ter; el resto del contrato Q1 se conserva salvo aclaración explícita.

---

## §1 · Identidad

**«Hito 9.3.2-A — Onboarding productivo mínimo, atómico e idempotente»**, prerrequisito obligatorio de 9.3.2-B según el contrato marco §1 y §23.

Publicará en la familia de ramas `spabla-v2/hito-9-3-2-a-*`. La rectificación Q1-R publica exclusivamente en `spabla-v2/hito-9-3-2-a-q1-r-onboarding-contract`.

## §2 · Relación con el contrato marco

Este documento cierra §9.3 (mecanismo de unicidad) y §9.4 (semántica del tenant personal) del contrato marco. No altera ninguna otra sección del marco. Cualquier conflicto material con el marco se documenta expresamente (§4, §5 y §17-bis) y se resuelve a favor del marco salvo autorización de Dirección para modificarlo.

## §3 · Estado actual verificado (inspección estática + catálogo)

Inspección estática de `supabase/migrations/*` y consulta del catálogo PostgreSQL local (Supabase local · Postgres 17.6, `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres"`, 2026-08-22) arrojan la siguiente foto real del esquema. El estado del catálogo no ha cambiado entre Q1 y Q1-R (cero migración en la ventana).

### §3.1 · `spabla_v2.tenants`

- Columnas: `id UUID PK DEFAULT gen_random_uuid()`, `name TEXT NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- Owner: `postgres`.
- Constraints: `tenants_pkey (id)`, `tenants_name_not_blank CHECK (length(btrim(name)) > 0)`.
- Índice: `tenants_pkey UNIQUE btree (id)`.
- RLS: **ENABLE + FORCE**.
- Policy: `tenants_select_own` (`SELECT authenticated USING EXISTS(...)`).
- Grants: `SELECT → authenticated`; `SELECT, INSERT → service_role`; cero grants a `anon`.
- **Sin columnas** `kind`, `type`, `owner_actor_id`, `personal_owner_actor_id` que permitan distinguir estructuralmente tenant personal de tenant compartido.
- **`tenants.name` es texto libre no nulo con CHECK length>0**. Q1-R establece que ese campo NO es identidad ni clave de unicidad ni clave de recuperación (§4, §6 I-4', §17-bis).

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
- **D-5** · `bootstrap.ts` ata `canOperate` a la existencia de una conversación (§3.4), lo que colisiona con la recomendación de producto §5 del contrato marco.
- **D-6** *(añadido por Q1-R)* · Q1 asumía implícitamente que el cliente podía influir en la etiqueta persistida del tenant personal («Mi espacio»). Q1-R prohíbe explícitamente esa vía (§4, §6 I-4', §9, §10, §17-bis).
- **D-7** *(añadido por Q1-R)* · Q1 no diferenciaba sign out, desactivación de membership, solicitud de eliminación de cuenta, eliminación de Auth, retención legal, anonimización, mappings huérfanos y reparación segura. Q1-R los distingue exhaustivamente (§17-ter).
- **D-8** *(añadido por Q1-R)* · Q1 no prohibía explícitamente el reclamo automático del tenant anterior por parte de una identidad nueva que reutilizara el mismo email. Q1-R lo prohíbe (§17-ter D, §17-ter G).

## §4 · Semántica del espacio personal (cierre de §9.4 del marco) · rectificada

Respuestas a las 15 preguntas del contrato marco §9.4 tras la evidencia §3, incorporando las obligaciones de Q1-R sobre localización y ciclo de vida:

1. **¿Todo usuario debe disponer de un espacio personal?** Sí. Cualquier actor autenticado por SPABLA tiene derecho a un espacio personal donde operar sin depender de invitaciones externas.
2. **¿Un usuario que ya pertenece a un tenant compartido necesita también espacio personal?** Sí. El espacio personal es independiente de otros tenants.
3. **¿Puede existir más de un espacio personal por actor?** No. Exactamente uno por actor.
4. **¿Puede un actor ser owner de varios tenants empresariales?** Sí (por invitación o creación autorizada). Un tenant empresarial no cuenta como espacio personal.
5. **¿Cómo se distingue estructuralmente un tenant personal?** Mediante la restricción declarativa elegida en §5 (opción C): tabla dedicada `spabla_v2.actor_personal_workspace(actor_id UUID PRIMARY KEY, tenant_id UUID NOT NULL UNIQUE, created_at TIMESTAMPTZ)` cuyo `actor_id` como PK garantiza cardinalidad exacta 1. **La unicidad del espacio personal reside en este mapping, no en `tenants.name`** (§6 I-4', §17-bis).
6. **¿Qué ocurre si la membership personal está desactivada?** El onboarding es responsable de mantener la coherencia entre `actor_personal_workspace` y la membership `is_active=TRUE` sobre ese tenant. Si un flujo externo desactiva la membership personal, `ensurePersonalWorkspace` la reactiva de manera idempotente. La desactivación **no** equivale a eliminar la cuenta (§17-ter B).
7. **¿Qué ocurre si el tenant personal está desactivado?** El tenant no tiene columna `is_active`. Si el tenant fuera eliminado (fuera del alcance de 9.3.2-A), la fila de `actor_personal_workspace` quedaría huérfana. Mitigación estructural: FK `tenant_id → tenants(id) ON DELETE RESTRICT` en la tabla nueva (§5).
8. **¿Qué ocurre si el usuario abandona otros tenants?** Irrelevante para el espacio personal. Su fila en `actor_personal_workspace` permanece.
9. **¿Puede eliminarse el tenant personal?** No dentro del alcance de 9.3.2-A. Cualquier eliminación futura requerirá subhito autorizado con procedimiento §17-ter (solicitud de eliminación → retención → anonimización o borrado según política aprobada).
10. **¿Qué devuelve onboarding si ya existe?** Retorna el mismo `tenantId` sin escribir (idempotencia), y devuelve `created=false` en observabilidad server-side (el cliente no lo recibe, §10).
11. **¿Qué devuelve bootstrap?** Tras onboarding, `bootstrap` devuelve el tenant personal en `memberships[]`, `selectedTenantId=<tenantPersonal>`, `conversations=[]`, `selectedConversationId=null`.
12. **¿Cuál queda seleccionado por defecto?** El tenant personal, salvo que existan tenants compartidos preexistentes con `created_at` anterior; en ese caso la selección determinista Q2 §10 continúa aplicando y el tenant compartido más antiguo queda seleccionado.
13. **¿Se crea alguna conversación automáticamente?** **No.**
14. **¿Qué significa `canOperate=true`?** Existencia de al menos un tenant seleccionado con membership activa suficiente para operar. Ver §11.
15. **¿Qué operación mínima permite entrar en SPABLA Chat?** Un tenant seleccionado + una membership activa. La creación de la primera conversación queda en el flujo natural del chat.

**Preguntas añadidas por Q1-R** (16-20), consecuencia de las obligaciones OBS-Q1-1 y OBS-Q1-2:

16. **¿El nombre visible del espacio personal es identidad?** **No.** El nombre visible es exclusivamente presentación. La unicidad y la identidad del espacio personal residen en el mapping `actor_personal_workspace(actor_id → tenant_id)`. Cambiar el idioma del usuario **no** crea otro tenant. Repetir el onboarding con un locale distinto devuelve el mismo tenant (§14 caso 4).
17. **¿Puede el cliente enviar el nombre del espacio personal, un locale sin validar, un tenantId, un actorId, un ownerId, un role o una etiqueta libre?** **No.** El body público del onboarding es `{}` o vacío (§10, §17-bis 2). Cualquier campo enviado se ignora sin efecto y sin error de campo (§10, §14 caso 20).
18. **¿Qué hace el servidor con la pista `Accept-Language` o con una preferencia del actor?** La trata como pista **no confiable**. La normaliza contra una whitelist cerrada de trece códigos canónicos (§17-bis 6); si la entrada es desconocida, manipulada o no soportada, aplica un locale seguro por defecto (§17-bis 7). El texto persistido — si el esquema lo exige — sólo puede seleccionarse desde un catálogo cerrado propiedad del servidor (§17-bis 8-10).
19. **¿Un re-registro con el mismo email es el mismo actor?** **No.** El email no es identidad ni clave de recuperación del tenant. Un nuevo alta en Auth es un actor nuevo con `sub` distinto y su propio espacio personal (§17-ter D, §17-ter G, §14 caso 17). Cualquier recuperación de un tenant anterior por un actor distinto requerirá mecanismo administrativo expresamente autorizado (§17-ter G).
20. **¿Cuál es el efecto del sign out sobre el espacio personal?** Ninguno. Sign out finaliza la sesión Auth y no borra datos, no desactiva memberships, no elimina tenant. El siguiente login del **mismo** actor recupera el mismo espacio personal (§17-ter A, §14 caso 1 idempotente).

## §5 · Comparación de mecanismos de unicidad y decisión

Sin cambios respecto a Q1. Se conserva la decisión **opción C · `spabla_v2.actor_personal_workspace`** por las razones ya documentadas (garantía declarativa PostgreSQL nativa, propósito único, auditoría trivial, rollback simple). La rectificación Q1-R refuerza esta decisión: al residir la unicidad en el mapping y no en el nombre visible, el nombre queda libre para localización sin afectar identidad.

| Dimensión | A · Columna en `tenants` | B · Tabla asociación dedicada | **C · Registro `actor_onboarding`** | D · Advisory lock sin estructura | E · Otras |
|---|---|---|---|---|---|
| Garantía de unicidad | Parcial (índice UNIQUE parcial `WHERE personal_owner_actor_id IS NOT NULL`) | Sí (`actor_id PK`) | **Sí (`actor_id PK` + `tenant_id UNIQUE`)** | No (solo transaccional) | — |
| Atomicidad | Depende de RPC | Depende de RPC | **Depende de RPC (garantizada por FK)** | Solo dentro de la transacción | — |
| Concurrencia | UNIQUE bloquea; segunda INSERT lanza 23505 | UNIQUE bloquea; segunda INSERT lanza 23505 | **UNIQUE bloquea; segunda INSERT lanza 23505** | Lock explícito | — |
| Complejidad | Media (alterar `tenants`, backfill) | Baja | **Baja** | Muy baja (sin migración) | — |
| RLS | Requiere ajustar policy `tenants_select_own` | Neutro | **Neutro** (tabla admin-only) | Neutro | — |
| Privacidad | Neutro | Neutro | **Neutro** | Neutro | — |
| Portabilidad | Baja | Media | **Alta** | Media | — |
| Rollback | Difícil | Fácil | **Fácil** | Sin migración | — |
| Migración datos | Backfill obligatorio | Backfill puede omitirse | **Backfill puede omitirse** | Sin migración | — |
| Compatibilidad tenants empresariales | Requiere semántica adicional | Compatible | **Compatible** | Compatible | — |
| Coste de consultas | Bajo | Bajo | **Bajo** | Bajo | — |
| Riesgo de huérfanos | Sí sin FK | Cero con FK ON DELETE RESTRICT | **Cero con FK ON DELETE RESTRICT** | Sí | — |
| Riesgo de lock global | Bajo | Bajo | **Bajo** | Medio | — |
| Posibilidad de reparación | Compleja | Simple | **Simple** | No aplica | — |
| Dependencia de Supabase | Igual | Igual | **Igual** | Baja | — |
| Auditoría por comprador futuro | Confusa | Media | **Clara** | Difusa | — |

**Decisión de arquitectura**: **opción C · Registro `spabla_v2.actor_personal_workspace`**.

## §6 · Invariantes de producto · rectificadas

- **I-1** · Exactamente un espacio personal por actor.
- **I-2** · El espacio personal existe desde la primera sesión operativa del actor.
- **I-3** · El espacio personal es distinto de cualquier tenant compartido o empresarial.
- **I-4** *(rectificada por Q1-R)* · El **nombre visible** del espacio personal es exclusivamente presentación. **No es identidad, no es clave de unicidad, no es clave de recuperación.** El nombre visible NO deriva del email ni de otro identificador con PII, y NO puede ser proporcionado por el cliente. Se selecciona en presentación desde un catálogo cerrado server-owned localizado a los trece códigos canónicos de SPABLA (§17-bis). Si la arquitectura de datos permite evitar persistir una traducción concreta, se preferirá una clave server-owned (por ejemplo `workspace.personal.default`) y se localizará en presentación; si el esquema vigente exige temporalmente un nombre persistido, se usará exclusivamente una etiqueta seleccionada por el servidor desde su catálogo cerrado, dejando constancia en observabilidad de que ese texto no es identidad.
- **I-5** · La creación del espacio personal es idempotente: cualquier repetición devuelve el mismo `tenantId`.
- **I-6** · La creación es atómica: si algo falla, no queda tenant huérfano ni membership huérfana.
- **I-7** *(rectificada por Q1-R)* · El cliente NO puede autoasignarse ni influir en `tenantId`, `role`, `ownerId`, `actorId`, email, nombre del tenant, etiqueta localizada libre, ni locale sin validar destinado directamente a persistencia. El body público del onboarding es `{}` o vacío. Cualquier campo enviado se ignora y no produce error de campo (§10).
- **I-8** · SPABLA usa exclusivamente API pública de Supabase Auth para identidad; el onboarding no consulta ni modifica tablas del schema `auth`.
- **I-9** · La retirada de Supabase como proveedor de Auth o de Postgres no debe alterar la semántica funcional del onboarding.
- **I-10** *(añadida por Q1-R)* · La identidad del actor se deriva exclusivamente de la sesión Auth validada por el servidor (`sub` del JWT). El email nunca es identidad ni clave de recuperación del tenant. Un re-registro con el mismo email es un actor nuevo (§17-ter D, §17-ter G).
- **I-11** *(añadida por Q1-R)* · La eliminación del usuario Auth no borra por sí sola datos SPABLA. El tratamiento posterior sigue el procedimiento §17-ter (solicitud → retención → anonimización o borrado por categoría, con reparación segura de mappings huérfanos).
- **I-12** *(añadida por Q1-R)* · Ningún flujo automático puede reasignar un tenant huérfano a otro actor sin decisión administrativa expresamente autorizada.
- **I-13** *(añadida por Q1-R)* · La respuesta pública del onboarding es estable e indiferenciable entre creación e idempotencia, y opaca respecto al estado interno del actor. No enumera identidades ni distingue causas internas más allá del alfabeto cerrado de errores públicos (§10).

## §7 · Operación de dominio

Definida en términos de dominio SPABLA, independiente del proveedor:

```
ensurePersonalWorkspace(actorId: ActorId, presentationHint?: LocalePreference): PersonalWorkspaceResult
```

**Entrada**:

- `actorId`: `ActorId` (UUID validado por la frontera de autenticación).
- `presentationHint` *(opcional, Q1-R)*: pista **no confiable** de locale de presentación. Puede provenir de `Accept-Language`, de la configuración del dispositivo o de una preferencia previa del actor. **No se persiste crudo**. El servidor la normaliza a la whitelist server-side (§17-bis 6) o aplica el locale seguro por defecto.

**Salida**:

- `PersonalWorkspaceResult`:
  - `tenantId: TenantId`
  - `role: 'owner'`
  - `created: boolean` — `true` si se creó ahora; `false` si ya existía (observable server-side; no se envía al cliente).

**Propiedades contractuales**:

- Atómica: la operación no puede terminar en un estado intermedio observable.
- Idempotente: dos ejecuciones para el mismo `actorId` devuelven el mismo `tenantId` y no crean recursos duplicados. La idempotencia **no depende del locale**: el mismo actor con locale distinto obtiene el mismo `tenantId`.
- Segura bajo concurrencia: N ejecuciones simultáneas para el mismo actor terminan con exactamente un espacio personal.
- Reintentable: ante error transitorio el caller puede repetir sin efectos secundarios.
- Sin PII: la entrada no incluye email ni identificadores personales; la salida no revela detalles internos.
- Sin parámetros controlables por cliente para escalada: el `actorId` viene del token JWT validado, no del cuerpo HTTP. El `presentationHint` no controla `tenantId`, `role`, `ownerId`, identidad, ni la etiqueta persistida más allá de seleccionar entrada del catálogo server-owned.
- Sin dependencia de tablas internas Auth.
- Rollback completo ante fallo.

La semántica pública NO menciona `service_role`, PostgREST, `admin_create_tenant`, `admin_add_membership`, ni ninguna tabla concreta.

## §8 · Puerto y adaptador

Separación estricta, sin cambios de forma respecto a Q1. Refuerzo Q1-R: los puertos nuevos `PersonalWorkspaceLocaleResolver` y `PersonalWorkspaceLabelCatalog` viven server-side y aíslan la normalización de locale (§17-bis).

### §8.1 · Puerto (interfaz de dominio)

```
interface PersonalWorkspaceProvider {
  ensure(actorId: ActorId, presentationHint?: LocalePreference): Promise<PersonalWorkspaceResult>;
}

interface PersonalWorkspaceLocaleResolver {  // Q1-R
  normalise(hint: LocalePreference | null): CanonicalLocale;
}

interface PersonalWorkspaceLabelCatalog {  // Q1-R
  labelFor(locale: CanonicalLocale): CatalogLabel;   // clave interna server-owned + texto server-owned
}
```

Viven en `lib/v2/server/onboarding.ts` (o en `engine/` si Dirección prefiere ubicarlo con el resto de puertos de dominio). Cero mención de SQL, Postgres, Supabase o transacciones.

### §8.2 · Adaptador actual (Postgres/Supabase)

Implementación en `lib/v2/server/onboarding.supabase.ts` (nombre orientativo). Consume el cliente `service_role` server-side. Delega el trabajo real a **una única RPC transaccional** en PostgreSQL definida en migración nueva (§15). Cero orquestación desde JavaScript.

### §8.3 · Frontera HTTP

`app/api/v2/onboarding/route.ts` (definido en §10). Únicamente:

- valida el JWT con `verifyJwt` (Q3-R FASE 4);
- lee la pista de locale desde `Accept-Language` o desde la preferencia del actor **sin persistir ni confiar**;
- llama al puerto `PersonalWorkspaceProvider.ensure(actorId, presentationHint)`;
- serializa la respuesta pública sanitizada.

Cero lógica de dominio en el handler HTTP. Cero validación de identidad basada en body.

### §8.4 · Tabla de acoplamientos

| Acoplamiento | Aceptado actualmente | Prohibido | Estrategia de sustitución |
|---|---|---|---|
| Auth externa (Supabase Auth) | Sí, a través de `verifyJwt` + JWT `sub` | Consulta directa a `auth.users`, `auth.sessions` u otras tablas `auth.*` | Sustituir `verifyJwt` por un puerto `IdentityVerifier` cuando Dirección lo autorice |
| Persistencia (PostgreSQL/Supabase) | Sí, a través de adaptador `PersonalWorkspaceProvider` | Referencia directa a Supabase SDK desde el dominio | Sustituir el adaptador por otro adaptador que respete el mismo contrato |
| Localización del nombre del tenant (Q1-R) | Vía `PersonalWorkspaceLocaleResolver` + `PersonalWorkspaceLabelCatalog` server-owned | Nombre libre enviado por el cliente; texto localizado en el cliente que luego se persiste; `Accept-Language` como fuente confiable de identidad | Ampliar el catálogo con más idiomas o migrar a persistir una clave y localizar en presentación (§17-bis 17) |
| Errores | Alfabeto cerrado `unauthorized/internal/unavailable/not_found` (heredado de `http-error.ts`) | Fugar mensajes SQL o del proveedor Auth | Sanitización en `http-error.ts` + tests |
| Correlation-id | UUID v4 en cada respuesta | Referencia a un identificador del proveedor | Ya cumplido por `newCorrelationId()` |
| Ciclo de vida del actor (Q1-R) | Puertos futuros `AccountDeletionRequestPort` + `OrphanMappingReconciliationJob` | Reasignación automática del tenant a otra identidad; borrado destructivo inmediato sin retención | Diseño detallado en 9.3.2-A-Q4-bis (fuera de este subhito) |

### §8.5 · Evidencia de portabilidad

Cero mención de `spabla_v2`, `Postgres`, `Supabase`, `RLS` o `service_role` en las interfaces `PersonalWorkspaceProvider`, `PersonalWorkspaceLocaleResolver`, `PersonalWorkspaceLabelCatalog` y `ensurePersonalWorkspace`. Un adaptador alternativo podría implementar los mismos puertos respetando idempotencia, atomicidad y unicidad, sin modificar el handler HTTP ni el composer del bootstrap.

## §9 · RPC transaccional (adaptador actual) · rectificada

Diseño de la única función server-side que ejecuta el onboarding dentro de una transacción PostgreSQL única. Rectificación Q1-R: **la RPC no recibe texto libre procedente del cliente**. Recibe únicamente el `actorId` derivado del JWT y una **clave interna server-owned** (o directamente el texto ya seleccionado por el servidor desde su catálogo cerrado; ver §17-bis 8-10 y §17-bis 16-17).

**Firma propuesta** (orientativa, se cierra en 9.3.2-A-Q2):

```sql
CREATE OR REPLACE FUNCTION spabla_v2.admin_ensure_personal_workspace(
    p_actor_id           uuid,
    p_workspace_label    text     -- texto seleccionado por el servidor desde catálogo cerrado
                                  -- (o alternativa: p_label_key text con clave interna server-owned)
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
    -- (1) Validación estructural: actor_id no puede ser NULL.
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'admin_ensure_personal_workspace: actor_id required'
            USING ERRCODE = '22023';
    END IF;

    -- (2) Serialización belt-and-braces por actor (§3.5 E2). Redundante
    --     con la PK de actor_personal_workspace, pero evita locks a nivel
    --     de fila y hace explícita la intención.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_id::text, 9321));

    -- (3) Comprobación idempotente: si ya existe, devolver sin escribir.
    --     La idempotencia NO depende del label recibido.
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
    --     El label recibido ya proviene del catálogo cerrado server-owned;
    --     esta función NO valida su contenido (responsabilidad del adaptador).
    v_new_tenant := spabla_v2.admin_create_tenant(p_workspace_label);
    INSERT INTO spabla_v2.actor_personal_workspace (actor_id, tenant_id)
    VALUES (p_actor_id, v_new_tenant);
    PERFORM spabla_v2.admin_add_membership(v_new_tenant, p_actor_id, 'owner');

    RETURN QUERY SELECT v_new_tenant, 'owner'::text, TRUE;
END;
$function$;

ALTER FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid, text) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid, text) TO   service_role;
```

**Propiedades garantizadas por diseño**:

- **Atomicidad** — todo dentro de una única transacción PL/pgSQL.
- **Idempotencia por actor** — el paso (3) devuelve el registro existente sin escribir; dos llamadas para el mismo actor devuelven el mismo `tenantId`, **independientemente del `p_workspace_label` recibido en la segunda llamada** (§14 caso 4).
- **Concurrencia** — advisory lock (2) + PK (`actor_personal_workspace.actor_id`) + UNIQUE (`actor_personal_workspace.tenant_id`).
- **Rollback** — cualquier fallo antes de `COMMIT` revierte todo.
- **Origen del label** — el texto `p_workspace_label` proviene exclusivamente del catálogo cerrado server-owned (§17-bis 8-10, §17-bis 16-17). La función no valida su contenido porque el adaptador lo garantiza; se documenta este contrato explícitamente para auditoría futura.
- **Alternativa** — si Dirección prefiere no persistir traducción, la firma admite variante `p_label_key text` con una clave interna (por ejemplo `workspace.personal.default`) y `tenants.name` almacenaría esa clave, localizándose en presentación (§17-bis 16). Esta variante se elige en 9.3.2-A-Q2.

Cero afirmación normativa depende de `SELECT ... FOR UPDATE` sobre una fila que puede no existir (§3.5 E1).

## §10 · Contrato HTTP · `POST /api/v2/onboarding` · rectificado

- **Método único**: `POST`. Otros verbos → `404 not_found` opaco (patrón hito 9.2.5-C).
- **Autenticación**: `Authorization: Bearer <access_token>` obligatorio. Validado por `verifyJwt`. El server extrae `actorId` exclusivamente del claim `sub`.
- **Body**: `{}` o vacío. El cliente **NO envía** `tenantId`, `role`, `ownerId`, `actorId`, email, nombre del tenant, etiqueta localizada libre, ni locale destinado a persistencia. Body inesperado se ignora sin efecto y sin error de campo (robustez ante clientes evolutivos).
- **Content-Type**: `application/json`.
- **Cabeceras opcionales tratadas como pista no confiable (Q1-R)**: `Accept-Language`. El servidor la normaliza contra la whitelist server-side (§17-bis 6); si es desconocida, ausente o manipulada, aplica el locale seguro por defecto. Nunca se persiste crudo. Nunca controla identidad, unicidad, ni el nombre persistido más allá de la selección del texto desde el catálogo cerrado server-owned.
- **Correlation-id**: `X-SPABLA-Correlation-Id: <UUID v4>` en cada respuesta.
- **Timeouts**: coherentes con el resto de `app/api/v2/*` (`export const dynamic = "force-dynamic"; export const runtime = "nodejs";`).

**Respuesta exitosa**:

- **`200 OK`** con body `{ tenantId: string, role: 'owner' }`. `200` para ambos casos (creación y repetición idempotente).
- El campo `created: boolean` de la RPC (§9) queda en el log/observabilidad server-side (§16), **no** en la respuesta al cliente.
- **No** se devuelve el nombre visible del tenant. El cliente lo obtiene por `GET /api/v2/bootstrap` posterior, y su presentación se resuelve en presentación (cliente pinta el texto server-owned recibido, sin construirlo).

**Respuestas de error** (alfabeto cerrado heredado de `lib/v2/server/http-error.ts`):

- `401 unauthorized` — JWT ausente/malformado/inválido/expirado. Body `{ error: 'unauthorized', correlationId }`.
- `503 unavailable` — error transitorio de DB. Body `{ error: 'unavailable', correlationId }`. El cliente puede reintentar (idempotencia §9).
- `500 internal` — cualquier otro error no clasificable. Body sanitizado.
- `404 not_found` — verbos no permitidos. Body `{ error: 'not_found', correlationId }`.

**Cero exposición** de: SQL, `service_role`, email, `sub` raw fuera del `correlationId`, nombres localizados en otros idiomas, causas internas del estado del actor (por ejemplo si está en período de eliminación, con membership desactivada o con mapping huérfano — el comportamiento observable se define en §17-ter H sin enumerar causas al cliente).

**El cliente NO puede** elegir rol, tenant, identidad, nombre persistido ni locale persistido: el server los deriva del JWT + catálogo cerrado. Un cliente malicioso que envíe `{"role":"admin","tenantId":"...","name":"pwn"}` obtiene el mismo comportamiento que un cliente que envía `{}`.

**Después del onboarding**, el cliente **debe** re-invocar `GET /api/v2/bootstrap` para obtener el contexto completo. La respuesta de `POST /api/v2/onboarding` es intencionalmente minimalista.

## §11 · Ajuste compatible en `bootstrap.ts` (propuesta)

**Conflicto identificado** (§3.6 D-5): `bootstrap.ts` define `canOperate = selectedTenantId !== null && selectedConversationId !== null`. Un usuario nuevo con onboarding completado pero sin conversación aún tendría `canOperate=false`. Colisiona con el contrato marco §5 («No se crea una conversación ficticia»).

**Propuesta mínima compatible**:

Modificar `lib/v2/server/bootstrap.ts:90` para:

```ts
const canOperate = selectedTenantId !== null;
```

**Compatibilidad hacia atrás**:

- Usuarios existentes con conversación siguen teniendo `canOperate=true`.
- Usuarios nuevos con onboarding pero sin conversación pasan a tener `canOperate=true`.
- Contrato Q2 §10 del hito 9.3.1 mencionaba la fórmula anterior; el cambio afecta a 9.3.2-A y debe registrarse en su acta.
- La UI puede seguir mostrando un estado «Sin conversación aún — comienza una» cuando `selectedConversationId === null`.

**Barrera de regresión**: los 14 escenarios Q3-E2E-R permanecen verdes tras el cambio (el escenario §20-11 usa `userC` sin membership; para él `selectedTenantId===null` sigue vigente y `canOperate=false` no cambia).

Este ajuste **NO es** una modificación del contrato marco; es la resolución explícita del punto §9.4 pregunta #14 dentro de la libertad que el propio marco delega a 9.3.2-A.

## §12 · RLS, grants, service_role

**RLS**:

- `spabla_v2.actor_personal_workspace` (nueva) recibirá `ENABLE ROW LEVEL SECURITY + FORCE ROW LEVEL SECURITY`.
- **Cero policy** para `authenticated` sobre esta tabla: el actor autenticado no necesita leerla directamente.
- Solo `service_role` accede (vía función `SECURITY DEFINER`).

**Grants**:

- Cero grants a `anon`.
- Cero grants a `authenticated` sobre `actor_personal_workspace`.
- `service_role`: `SELECT, INSERT, UPDATE, DELETE`.

**Service role**:

- Encapsulado exclusivamente en `lib/v2/server/onboarding.supabase.ts`.
- Cero exposición al cliente. Cero import del cliente de esa constante.
- Instanciación reutiliza el patrón de `translation-runtime.ts`.

## §13 · STRIDE acotado al onboarding · rectificado

| # | Amenaza | Activo | Actor adversario | Vector | Control preventivo | Control detective | Evidencia | Riesgo residual |
|---|---|---|---|---|---|---|---|---|
| S1 | Suplantación del actor | Identidad de usuario | Usuario malicioso ajeno | JWT robado | `verifyJwt` valida firma + `exp` (Q3-R) | Métrica de invocaciones por `sub` en observabilidad | Reutiliza Q3-R | Bajo (idem 9.3.1) |
| S2 | Manipulación de `actorId` en body | Selección de espacio personal | Cliente | Enviar `{"actorId":"otro"}` | Handler ignora body; `actorId` viene del JWT | Log `correlationId` + `actorId` (redactado) | Test §14 caso 20 | Cero (constructivo) |
| S3 | Autoasignación de `role` owner | Membership no autorizada | Cliente | Enviar `{"role":"admin"}` | Server siempre asigna `'owner'` en su tenant personal | Test §14 caso 20 | Test §14 caso 20 | Cero (constructivo) |
| S4 | Autoasignación de `tenantId` | Membership en tenant ajeno | Cliente | Enviar `{"tenantId":"ajeno"}` | Server crea/consulta el tenant personal del actor | Test §14 caso 20 | Test §14 caso 20 | Cero (constructivo) |
| S5 | Repetición masiva por un mismo actor | DoS del onboarding | Cliente | Bucle de POST | Idempotencia (§9) + rate limit del hosting | Métrica `#onboarding_por_actor_por_minuto` | 200 latencia p95 | Bajo (idempotente) |
| S6 | Carrera concurrente | Duplicación de tenants | Cliente / dos pestañas | Doble POST simultáneo | PK `actor_personal_workspace(actor_id)` + advisory lock | Test §14 caso 3 | Test §14 caso 3 | Cero (declarativo) |
| S7 | Escalada mediante `service_role` | Acceso privilegiado | Vulnerabilidad server-side | Fuga de env var | Encapsulado en `onboarding.supabase.ts`; cero exposición al cliente | Escaneo de secretos en artefactos | `logSanitizedError` | Bajo |
| S8 | Exposición de mensajes SQL | Fuga de estructura interna | Cliente | Provocar error para leer stack SQL | `opaqueError` sanitiza; `SQLSTATE` no llega al cliente | Test §14 caso 18 | Test §14 caso 18 | Cero (constructivo) |
| S9 | Creación abusiva de tenants | Inflación de la tabla `tenants` | Cliente | Bucle | Idempotencia — cero tenant nuevo por repetición | Métrica tenants creados/actor | Test §14 caso 2 | Cero |
| S10 | Denegación de servicio mediante locks | Bloqueo de otros actores | Cliente | Provocar advisory lock largo | Advisory **transaction** lock; RPC corta | Métrica latencia p95 | Test §14 caso 3 | Bajo |
| S11 | Tenant huérfano | Consistencia | Fallo mid-transacción | Crash entre RPC | Transacción única PL/pgSQL: rollback total | Test §14 caso 18 | Migración test | Cero |
| S12 | Membership huérfana | Consistencia | Fallo mid-transacción | Crash entre INSERTs | Idem S11 | Test §14 caso 18 | Idem | Cero |
| S13 | Reutilización de JWT revocado | Sesión expirada usada | Cliente ex-usuario | JWT no expirado tras signOut | `verifyJwt` valida solo `exp` y firma | Log de auth-recovery | Test §14 caso 8 | Aceptado (marco §14) |
| S14 | Confusión entre tenant personal y empresarial | UX + selección incorrecta | Bootstrap composer | Ordenamiento por `created_at` mezcla ambos | `actor_personal_workspace` como distinguibilidad estructural | Bootstrap | Bootstrap | Bajo |
| S15 | Logs con PII o credenciales | Fuga de datos | Server-side accidental | Volcar respuesta o body en log | `logSanitizedError` heredado; cero `email` en el flujo | Escaneo logs | Escaneo logs | Bajo |
| S16 *(Q1-R)* | Escalada via `name` libre del cliente | Persistencia arbitraria en `tenants.name` | Cliente | Enviar `{"name":"‹<script>alert(1)</script>›"}` | Cliente ignorado; `p_workspace_label` desde catálogo cerrado server-owned | Test §14 casos 7 y 20 | Test §14 casos 7 y 20 | Cero (constructivo) |
| S17 *(Q1-R)* | Enumeración vía locale | Distinguir "actor nuevo" de "actor existente" observando cambios de idioma | Cliente | Repetir con distinto `Accept-Language` | Respuesta HTTP indiferenciable por locale; idempotencia por actor no depende del locale | Test §14 caso 4 | Test §14 caso 4 | Cero (constructivo) |
| S18 *(Q1-R)* | Reclamo automático de tenant tras eliminación de Auth | Toma de control de un tenant huérfano | Cliente ex-actor con mismo email re-registrado | Nuevo signup con el mismo email | Prohibición explícita (§17-ter D, §17-ter G, I-12); mapping huérfano queda en cuarentena; no hay reasignación automática | Job de reconciliación de mappings huérfanos (§17-ter G) | Test §14 casos 12, 13 y 17 | Bajo (procedimiento administrativo controlado) |
| S19 *(Q1-R)* | Operación durante procedimiento de eliminación | Continuar creando datos durante gracia | Cliente en período de eliminación | Reintentar onboarding tras solicitud de eliminación | Bandera server-side que impide nuevos onboardings durante el proceso (§17-ter C, §17-ter H) | Test §14 caso 11 | Test §14 caso 11 | Bajo |
| S20 *(Q1-R)* | Fuga de estado interno del actor en la respuesta | Enumeración de estados (activo/desactivado/en eliminación/eliminado/huérfano) | Cliente | Comparar respuestas | Respuesta pública estable; alfabeto cerrado de errores; §17-ter H define comportamiento sin enumerar causa | Test §14 casos 9, 10, 11, 12, 13, 16 | Test §14 casos 9, 10, 11, 12, 13, 16 | Cero (constructivo) |

OTP y sus amenazas específicas **NO** se tratan aquí — corresponden a 9.3.2-B.

## §14 · Matriz contractual (20 casos exigidos por Q1-R)

Cada caso define: **entrada**, **comportamiento server-side**, **estado persistido**, **respuesta pública**, **invariantes cubiertas** y **auditoría necesaria**. Sustituye la matriz Q1 §14 y absorbe sus 38 escenarios como pruebas derivables al abordar cada caso en 9.3.2-A-Q3.

| # | Escenario | Entrada | Comportamiento server-side | Estado persistido | Respuesta pública | Invariantes | Auditoría |
|---|---|---|---|---|---|---|---|
| 1 | Primer onboarding | JWT válido de actor sin `actor_personal_workspace` · body `{}` · `Accept-Language: es-ES` | Normaliza locale → `es`; selecciona label del catálogo server-owned; RPC transaccional: crea tenant, mapping, membership `owner` | 1 fila en `actor_personal_workspace`, 1 fila en `tenants` con label server-owned, 1 fila en `tenant_memberships` `is_active=true` | `200` `{tenantId, role:'owner'}` | I-1, I-2, I-4', I-5, I-6, I-7 | métrica `created=true`, `locale_resolved=es` |
| 2 | Repetición inmediata | JWT válido, actor ya provisionado · body `{}` | Advisory lock; paso (3) devuelve mapping existente sin escribir | Sin cambios (0 filas nuevas) | `200` mismo `tenantId` | I-5, I-13 | métrica `created=false`, `duplicates_prevented_total++` |
| 3 | Dos solicitudes concurrentes | Mismo actor · N=2..20 POST simultáneos | Advisory lock serializa; T1 crea, T2 encuentra existente | 1 fila en `actor_personal_workspace`, 1 en `tenants`, 1 en `tenant_memberships` | Todas `200` con el mismo `tenantId` | I-1, I-5, I-6, S6, S10 | latencia p95 servidor, cero `SQLSTATE 23505` visible al cliente |
| 4 | Repetición con otro locale | Actor ya provisionado · body `{}` · `Accept-Language: eu-ES` (u otro válido) | Normaliza locale → `eu`; paso (3) devuelve mapping existente; **no** re-escribe label | Sin cambios (label persistido conservado) | `200` mismo `tenantId` | I-5, I-10, I-13, S17 | métrica `created=false`; log `locale_ignored_for_persistence=true` |
| 5 | Locale desconocido | Actor autenticado · body `{}` · `Accept-Language: xx-YY,zz;q=0.9` | Normaliza → aplica locale seguro por defecto (`en` u otro definido en §17-bis 7) | Comportamiento idéntico al caso 1 con label del locale por defecto | `200` `{tenantId, role:'owner'}` | I-7, I-13 | log `locale_hint_rejected`, `locale_resolved=<default>` |
| 6 | Locale manipulado | Actor autenticado · body `{}` · `Accept-Language: '); DROP TABLE tenants; --` (o headers hostiles) | Header parseado por librería HTTP estándar; normalizado contra whitelist; entradas no whitelisted descartadas; locale seguro por defecto | Idéntico al caso 5 | `200` idéntico al caso 1 | I-7, I-13, S16 | log `locale_hint_rejected`, escaneo de logs verifica que no se registra el header crudo con caracteres peligrosos |
| 7 | Etiqueta libre enviada por el cliente | Actor autenticado · body `{"name":"pwn","label":"anything","workspaceName":"<img onerror>"}` | Body ignorado sin efecto y sin error de campo; label persistido proviene del catálogo cerrado server-owned | Comportamiento idéntico al caso 1 (o caso 2 si ya existía) | `200` idéntico al caso 1 (o 2) | I-4', I-7, I-13, S16 | log confirma `body_fields_ignored`; contenido enviado por el cliente NO aparece en `tenants.name` |
| 8 | Actor sin sesión | Petición sin `Authorization` o con JWT inválido/expirado | `verifyJwt` rechaza | Sin cambios | `401 unauthorized` opaco | S1, S13 | log `auth_failure` con `correlationId`, sin `sub` |
| 9 | Membership activa | Actor con `actor_personal_workspace` y `tenant_memberships.is_active=true` | Paso (3) devuelve existente; UPDATE de reactivación es no-op | Sin cambios | `200` mismo `tenantId` | I-5, I-13 | métrica `reactivations_total=0` |
| 10 | Membership desactivada | Actor con `actor_personal_workspace` pero `tenant_memberships.is_active=false` (desactivada por acción reversible o administrativa) | Paso (3) reactiva vía UPDATE dentro de la misma transacción | Membership `is_active=true` | `200` mismo `tenantId` | I-5, I-13, §17-ter B | métrica `reactivations_total++` |
| 11 | Actor con solicitud de eliminación en curso | Actor marcado `deletion_pending=true` en tabla futura `actor_lifecycle_state` (§17-ter C) | RPC devuelve error controlado; el handler responde con alfabeto cerrado sin enumerar causa | Sin cambios | Respuesta estable definida en §17-ter H (probablemente `401 unauthorized` o `503 unavailable` según política aprobada; **no** un código nuevo que enumere) | I-11, I-13, §17-ter C, §17-ter H, S19, S20 | log `deletion_pending_blocked`; se registra la solicitud pero no se filtra al cliente |
| 12 | Actor Auth ya eliminado | JWT válido durante gracia + registro de eliminación completa aplicada · o llamada posterior con `sub` inexistente en Auth | `verifyJwt` rechaza si firma/exp no cuadra; si aún válido durante gracia, se aplica bloqueo del caso 11 | Sin cambios; mapping antiguo queda huérfano hasta el job de reconciliación (§17-ter G) | Respuesta estable §17-ter H, sin enumerar causa | I-10, I-11, I-13, §17-ter D, §17-ter G, S18, S20 | log `auth_deleted_actor_blocked`; job de reconciliación registra el mapping como huérfano |
| 13 | Mapping huérfano | Fila en `actor_personal_workspace` cuyo `actor_id` no corresponde a identidad Auth vigente | El onboarding NO reasigna el tenant al actor entrante; la reparación se realiza fuera del onboarding por el job de reconciliación (§17-ter G) | Sin cambios; cuarentena lógica marcada por el job | Respuesta estable §17-ter H; si el actor solicitante no es el propietario del mapping huérfano, se comporta como caso 1 sobre su propia identidad y NUNCA reclama el tenant huérfano | I-1, I-12, §17-ter G, S18 | job de reconciliación audita cada caso; ninguna reasignación automática |
| 14 | Tenant existente sin mapping | Actor con `tenant_memberships.owner` sobre un tenant pero sin fila en `actor_personal_workspace` (estado legacy o post-migración parcial) | RPC crea la fila `actor_personal_workspace` apuntando al tenant existente si `admin_ensure_personal_workspace` detecta ese estado; alternativa: crea un nuevo tenant personal si Dirección decide preservar el tenant legacy como compartido; decisión concreta se cierra en 9.3.2-A-Q2 documentando el estado inicial de datos | Estado consistente (mapping poblado o nuevo tenant personal + mapping) | `200` con `tenantId` correspondiente | I-1, I-3, I-6 | log `legacy_promotion` o `new_personal_created` con justificación |
| 15 | Mapping existente sin tenant válido | Fila en `actor_personal_workspace` cuyo `tenant_id` no corresponde a un tenant vivo (FK `ON DELETE RESTRICT` lo impide en régimen normal; caso teórico si se fuerza manualmente) | El onboarding no puede completar; se aplica error interno estable (`500 internal`) y se marca el mapping para reconciliación | Sin cambios (rollback total) | `500 internal` opaco con `correlationId` | I-6, I-12, §17-ter G | log `inconsistent_mapping`; job de reconciliación en cuarentena |
| 16 | Actor bajo legal hold | Actor con marca `legal_hold=true` en `actor_lifecycle_state` | El onboarding respeta la marca; el comportamiento observable se decide en §17-ter E: por defecto no crea nuevos artefactos ni modifica existentes; devuelve respuesta estable §17-ter H | Sin cambios | Respuesta estable §17-ter H | I-11, I-13, §17-ter E, S20 | log `legal_hold_blocked` con referencia interna al procedimiento |
| 17 | Re-registro con el mismo email | Nueva alta en Auth (nuevo `sub`) que casualmente comparte email con una identidad anteriormente eliminada | Es un actor nuevo: caso 1. NO reclama el tenant anterior. El email NO es identidad ni clave de recuperación | 1 nuevo mapping, 1 nuevo tenant, 1 nueva membership; el tenant huérfano anterior permanece bajo cuarentena hasta que el procedimiento §17-ter G lo trate | `200` `{tenantId, role:'owner'}` con `tenantId` **distinto** del anterior | I-10, I-12, §17-ter D, §17-ter G, S18 | log `new_actor_same_email_no_reclaim` |
| 18 | Fallo intermedio y rollback | Actor válido; se fuerza fallo entre `admin_create_tenant` y `INSERT actor_personal_workspace` (o cualquier paso posterior) mediante inyección de test | Transacción entera hace ROLLBACK | Sin cambios: cero tenant huérfano, cero mapping, cero membership | `503 unavailable` o `500 internal` opaco; `correlationId` presente | I-6, S11, S12 | métrica `rollback_events_total++`, log `rollback_reason=<test-inject>` |
| 19 | Dos actores diferentes | Dos JWTs válidos distintos · body `{}` cada uno · llamadas simultáneas o secuenciales | Cada actor obtiene su propio tenant personal independiente; advisory locks distintos (hash por actor); PK distinta | 2 filas en `actor_personal_workspace`, 2 tenants distintos, 2 memberships owner distintas | `200` con `tenantId` distinto en cada respuesta | I-1, I-3 | métrica `distinct_actors_created`, sin cross-contamination |
| 20 | Intento de enviar `tenantId`, `role` u `ownerId` | Body `{"tenantId":"...","role":"admin","ownerId":"...","actorId":"..."}` | Body totalmente ignorado; sin error de campo; comportamiento equivalente a body vacío | Comportamiento idéntico al caso 1 (o 2 si ya existía) | `200` con `tenantId` real del actor y `role:'owner'`; ningún campo del body llega al estado persistido | I-7, I-13, S2, S3, S4 | log confirma `body_fields_ignored` (redactado); test verifica que ningún valor del body aparece en el estado persistido |

Notas transversales a la matriz:

- La matriz **no** enumera respuestas que revelen el estado interno del actor. Los casos 11-13, 15, 16 comparten respuestas estables definidas en §17-ter H.
- La matriz **no** fija arbitrariamente códigos de error nuevos para estados de ciclo de vida; las decisiones sobre si un actor en gracia recibe `401` opaco, `503` opaco u otro código del alfabeto cerrado se toman en 9.3.2-A-Q2 tras validación jurídica.
- La prueba de concurrencia (caso 3) debe comprobar el **estado final en base de datos**, no solo respuestas HTTP: `SELECT COUNT(*) FROM spabla_v2.actor_personal_workspace WHERE actor_id = <fixture>` debe devolver `1`.
- Los 14 escenarios `e2e/auth-continuity.spec.ts` (barrera Q3-E2E-R) deben permanecer verdes tras 9.3.2-A-Q3 (§20).

## §15 · Migración prevista + rollback

Sin cambios estructurales respecto a Q1 salvo el añadido explícito de que la firma de `admin_ensure_personal_workspace` incorpora el parámetro `p_workspace_label text` (o `p_label_key text` según variante aprobada en 9.3.2-A-Q2). La política de RLS, grants, ON DELETE RESTRICT y rollback se conserva.

### §15.1 · Migración

**Nombre**: `supabase/migrations/<YYYYMMDD>000000_hito_9_3_2_a_actor_personal_workspace.sql` (fecha concreta se elige en 9.3.2-A-Q2 respetando el orden lexicográfico).

**Contenido** (esqueleto orientativo Q1-R):

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

-- Función server-side atómica e idempotente (ver §9). Firma incluye el label
-- server-owned; el adaptador garantiza su origen desde el catálogo cerrado.
CREATE OR REPLACE FUNCTION spabla_v2.admin_ensure_personal_workspace(
    p_actor_id        uuid,
    p_workspace_label text
)
RETURNS TABLE (tenant_id uuid, role text, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, spabla_v2
AS $$ ... $$;

ALTER FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid, text) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid, text) TO   service_role;

COMMIT;
```

**Propiedades de la migración**:

- **Aditiva pura**: crea tabla nueva y función nueva; cero modificación de tablas existentes.
- **Backfill**: no aplica. La tabla arranca vacía.
- **Restricción**: PK sobre `actor_id` garantiza cardinalidad exacta 1; UNIQUE sobre `tenant_id` impide compartir tenant personal entre actores.
- **RLS**: ENABLE + FORCE; cero policy para `authenticated`.
- **Grants**: cero grants a `anon`; cero grants a `authenticated`; solo `service_role`.
- **Compatibilidad hacia atrás**: usuarios existentes con memberships previos se onboardean lazy al invocar el endpoint por primera vez.
- **Restore drill**: la migración se aplica exactamente igual sobre el `restored_target` de Job C.

### §15.2 · Rollback

- **Rollback de código**: `git revert` del commit del handler + adaptador + composer + tests.
- **Rollback de esquema**: en un entorno desechable, `DROP TABLE spabla_v2.actor_personal_workspace CASCADE;` + `DROP FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid, text);`. **En producción, NO** se hace rollback de esquema si ya hay filas legítimas.
- **Rollback funcional**: feature flag opcional que oculta la invocación al endpoint desde el cliente.
- **Datos creados legítimamente**: usuarios que ya se onboardearon conservan su tenant personal. Cualquier subhito futuro que necesite reparación debe respetar esos datos.

**Cero operación destructiva** en producción sin decisión de Dirección.

## §16 · Observabilidad

Métricas server-side (agregadas, sin PII):

- `onboarding.requests_total` — por resultado (200/created, 200/idempotent, 401, 500, 503).
- `onboarding.latency_p50/p95/p99` — sólo agregado, sin actor.
- `onboarding.duplicates_prevented_total` — incremento cuando el paso (3) devuelve el registro existente.
- `onboarding.reactivations_total` — incremento cuando el paso (3.a) reactiva la membership.
- `onboarding.locale_resolved_total` — por locale canónico (contador por whitelist server-side).
- `onboarding.locale_hint_rejected_total` — cuando la pista se descarta y aplica el locale por defecto.
- `onboarding.body_fields_ignored_total` — cuando el body contiene campos no vacíos que se descartan.
- `onboarding.lifecycle_blocked_total` — por tipo interno de bloqueo (`deletion_pending`, `legal_hold`, `auth_deleted`), sin filtrar la causa al cliente.
- `onboarding.rollback_events_total` — rollbacks completos por cualquier causa.

Cero PII en trazas. Cero `email`. Cero `actorId` en texto plano (redactado por `logSanitizedError`). Cero encabezado `Accept-Language` crudo si contiene caracteres no imprimibles. El `correlationId` UUID v4 sigue siendo el pivot.

## §17 · Privacidad · rectificada

- Cero persistencia del `email` en `spabla_v2` (I-8): la tabla nueva solo contiene `actor_id UUID` (referencia opaca al `auth.users.id`), `tenant_id UUID` y `created_at`.
- Cero derivación del nombre visible del tenant a partir de `email`, `actor_id` u otro identificador con PII (I-4').
- Cero traza del `email` en logs, errores, artefactos CI o base de datos SPABLA.
- La localización del nombre visible se resuelve exclusivamente desde el catálogo cerrado server-owned (§17-bis). Cero traducción libre proporcionada por el cliente.

## §17-bis · OBS-Q1-1 · Localización controlada por servidor (rectificación normativa)

Esta sección es normativa. La implementación posterior (9.3.2-A-Q2) debe cumplirla íntegramente.

1. El cliente **no** envía: `tenantId`, `actorId`, `ownerId`, `role`, nombre libre del tenant, etiqueta localizada libre, ni locale sin validar destinado directamente a persistencia.
2. El **body público** del onboarding es vacío o un objeto vacío: `{}`.
3. La **identidad actor** se deriva exclusivamente de la sesión Auth validada por el servidor (`sub` del JWT).
4. Si se utiliza `Accept-Language`, configuración del dispositivo o una preferencia del actor, se tratará únicamente como una **pista no confiable**.
5. El servidor **normalizará** esa pista y la reducirá a una whitelist cerrada de locales soportados.
6. La **whitelist inicial** deberá corresponder a los trece idiomas activados por SPABLA en el hito 9.2 y utilizar códigos canónicos definidos por este contrato: `es`, `ca`, `eu`, `gl`, `en`, `fr`, `de`, `it`, `pt`, `nl`, `sv`, `ar`, `zh-Hans` (códigos canónicos orientativos; el conjunto exacto y su representación queda cerrado en 9.3.2-A-Q2 tras verificación cruzada contra `docs/phases/SPABLA_V2_FASE_9_HITO_9_2_*` y el resolver ya activo en producción).
7. Una entrada **desconocida, manipulada o no soportada** utilizará un locale seguro **por defecto** (`en` es la propuesta; cierre en 9.3.2-A-Q2).
8. El **texto persistido** solo podrá seleccionarse desde un **catálogo fijo propiedad del servidor**.
9. El cliente **nunca** podrá proporcionar la etiqueta persistida.
10. La RPC recibirá: `actor` derivado de Auth; **locale ya normalizado** por el servidor o **una clave interna**; **nunca** texto libre procedente del cliente.
11. La **unicidad e identidad** del espacio personal **no dependerán** de su nombre visible.
12. El **mapping único** `actor → personal workspace` será la garantía de unicidad.
13. **Cambiar el idioma** del usuario **no** creará otro tenant.
14. **Repetir** el onboarding en otro idioma **devolverá el mismo tenant** (§14 caso 4).
15. El nombre localizado será **presentación**, no identificador de seguridad.
16. Si la arquitectura permite evitar persistir una traducción concreta, deberá **preferirse una clave server-owned** (por ejemplo `workspace.personal.default`) y **localizarla en presentación**.
17. Si el esquema vigente **exige temporalmente** un nombre persistido, se utilizará exclusivamente una **etiqueta seleccionada por el servidor** desde su catálogo cerrado, documentando que **no es identidad ni garantía de unicidad**.

**Alcance**: cero migración, cero tabla nueva, cero implementación en este subhito Q1-R. La aplicación técnica (catálogo, resolver, políticas) se realiza en 9.3.2-A-Q2.

## §17-ter · OBS-Q1-2 · Ciclo de vida del actor, retención, anonimización y reparación (rectificación normativa)

Esta sección es normativa. Distingue exhaustivamente los estados y transiciones del actor y define el comportamiento del onboarding en cada uno.

### §17-ter A · Sign out

- **Finaliza** la sesión Auth.
- **No** elimina datos.
- **No** desactiva memberships.
- **No** elimina tenant.
- El siguiente login del **mismo actor** (mismo `sub`) recupera el mismo espacio personal (§14 caso 2 idempotente).

### §17-ter B · Desactivación de membership

- Acción **reversible** o administrativa.
- **No** equivale a eliminar la cuenta.
- El onboarding **no** debe crear espacios duplicados: si la membership personal está desactivada, se **reactiva** (§14 caso 10) dentro de la misma transacción atómica del onboarding.
- La **política de reactivación** es explícita: al invocar el onboarding, si existe `actor_personal_workspace` y su membership está `is_active=false`, el paso (3.a) de la RPC (§9) la reactiva. La reactivación por parte del titular del mapping se considera legítima; cualquier política restrictiva (por ejemplo bloqueo permanente por decisión administrativa) requerirá un flag futuro en `actor_lifecycle_state` (§17-ter H) autorizado en subhito posterior.

### §17-ter C · Solicitud de eliminación de cuenta

- Debe **registrarse antes** de eliminar definitivamente la identidad Auth cuando sea técnicamente posible.
- **Revoca** o invalida sesiones activas del actor.
- **Impide nuevos onboardings** durante el proceso (§14 caso 11).
- Marca el actor y su espacio para tratamiento (bandera `deletion_pending=true` en la tabla futura `actor_lifecycle_state`).
- Oculta o restringe el contenido según la política aplicable.
- **No** realiza borrado destructivo inmediato si existe periodo de gracia o retención obligatoria.
- La solicitud debe ser **auditable** (`correlationId`, timestamp, motivo interno). El cliente nunca ve la causa concreta; recibe únicamente la respuesta pública estable de §17-ter H.

### §17-ter D · Eliminación definitiva de Auth

- La **ausencia de una FK directa** hacia `auth.users` en `spabla_v2.actor_personal_workspace` (por invariante I-8) **no puede interpretarse** como inexistencia de responsabilidad sobre mappings huérfanos.
- La eliminación del usuario Auth **no debe permitir** que una nueva identidad reclame automáticamente el tenant anterior.
- Un **registro posterior con el mismo email** **no será el mismo actor** salvo mecanismo de recuperación expresamente autorizado (§17-ter G) — comportamiento formalizado en el caso 17 de la matriz §14.
- El **email no es identidad** ni **clave de recuperación** del tenant (I-10).

### §17-ter E · Retención legal

- Debe **separarse** de la retención ordinaria.
- Solo conservará lo **jurídicamente necesario**.
- Tendrá **acceso restringido**, **finalidad definida** y **plazo controlado**.
- **No permitirá** que el usuario continúe operando normalmente (§14 caso 16).
- Su duración **no se inventará** en este contrato: deberá ser **configurable** y **validada jurídicamente**. Cero afirmación de un plazo concreto en Q1-R.
- La marca operativa se representa con `legal_hold=true` en la tabla futura `actor_lifecycle_state`.

### §17-ter F · Borrado o anonimización por categoría

Este contrato define las **categorías** y el **tipo de tratamiento** aplicable. Los plazos concretos y los mecanismos técnicos (anonimización por hash irreversible, disociación por rotación de claves, columnas `tombstone_at`, etc.) se cierran en un subhito posterior autorizado.

| Categoría | Descripción | Tratamiento por defecto | Excepciones |
|---|---|---|---|
| mapping personal (`actor_personal_workspace`) | Vincula `actor_id ↔ tenant_id` | **Anonimización o disociación irreversible del `actor_id`** manteniendo el tenant, o eliminación con cascade cuidadoso; decisión concreta en subhito de eliminación | Legal hold pausa el tratamiento |
| memberships (`tenant_memberships`) | Rol del actor en un tenant | **Disociación** o borrado, según impacto sobre tenants compartidos | Membership `owner` de un tenant compartido con otros actores requiere protocolo diferenciado |
| tenant (`tenants`) | Contenedor del espacio | **Conservación** si otros actores dependen; **eliminación** si es tenant personal huérfano tras cuarentena §17-ter G | Legal hold pausa |
| conversaciones (`conversations`) | Hilos del actor | **Anonimización** del `actor_id` o borrado por lote | Contenido compartido con terceros: disociación con protocolo |
| mensajes (`messages`) | Contenido intercambiado | **Anonimización** o borrado según política final | Contenido reportado por terceros retenido en cuarentena |
| traducciones (`message_translations`) | Datos derivados de mensajes | Tratamiento **consistente con el mensaje origen** | — |
| usage ledger (`usage_ledger`) | Contabilidad interna | **Retención limitada** para facturación y auditoría, luego agregación irreversible | Obligaciones legales pueden extender el plazo |
| auditoría (logs, correlationIds) | Trazabilidad operativa | **Retención acotada** con finalidad de seguridad; disociación del actor tras el plazo | Investigaciones de seguridad activas |
| contenido compartido con terceros | Contenido publicado o exportado | **Disociación** del actor origen; contenido persiste bajo licencia previa | Requiere política editorial específica |
| datos sujetos a obligación legal | Todo lo anterior bajo legal hold | **Bloqueo** por legal hold; ninguna acción de borrado o anonimización mientras dure | Solo se levanta con orden documentada |

**No se fija arbitrariamente un plazo de 30 días.** El periodo queda como **política configurable** pendiente de **validación jurídica**. Q1-R prohíbe expresamente afirmar que ese plazo (o cualquier otro) tenga validez jurídica sin dictamen profesional.

### §17-ter G · Mappings huérfanos — mecanismo de detección y reparación

Se define contractualmente:

- **Job periódico o reconciliación controlada** ejecutable server-side, fuera del path del onboarding.
- **Detección** de `actor_id` sin identidad Auth vigente (comparación entre `spabla_v2.actor_personal_workspace.actor_id` y presencia en el proveedor Auth vía API pública, sin FK directa).
- **Cuarentena lógica** antes de cualquier acción destructiva: marca `orphan_detected_at` en `actor_lifecycle_state` sin borrar datos.
- **Prohibición** de reasignar automáticamente el tenant a otro actor (I-12).
- **Idempotencia**: ejecutar el job N veces produce el mismo estado observable.
- **Auditoría**: cada acción del job queda registrada con `correlationId`, timestamp y motivo interno.
- **Procesamiento seguro bajo legal hold**: si el actor está bajo legal hold, el job pausa el tratamiento.
- **Borrado o anonimización** según política aprobada (§17-ter F).

El diseño técnico del job (frecuencia, backoff, transacciones, dead-letter, alertas) se cierra en un subhito posterior autorizado. Q1-R solo fija el **contrato**.

### §17-ter H · Comportamiento del onboarding según estado del actor

El onboarding debe definir respuestas **estables** cuando el actor esté en cada estado. La estabilidad significa que:

- La **respuesta pública HTTP** no enumera la causa interna.
- Los códigos permanecen dentro del **alfabeto cerrado** heredado (`200`, `401`, `500`, `503`, `404`).
- Los detalles internos quedan **exclusivamente** en observabilidad server-side.

| Estado del actor | Comportamiento server-side | Respuesta pública propuesta | Alternativa admisible |
|---|---|---|---|
| activo (sin mapping) | Caso 1: crea | `200` + `{tenantId, role}` | — |
| ya onboarded | Caso 2: idempotente | `200` + mismo `tenantId` | — |
| con membership desactivada | Caso 10: reactiva en la misma transacción | `200` + mismo `tenantId` | — |
| con solicitud de eliminación en curso | Caso 11: bloqueo silencioso | `401 unauthorized` opaco (sesión revocada por §17-ter C) o `503 unavailable` según cierre operativo Q2 | Cualquier código del alfabeto cerrado sin enumerar causa |
| eliminado (Auth ya borrado) | Caso 12: no reclama tenant huérfano; sesión no válida | `401 unauthorized` opaco | — |
| bajo retención legal | Caso 16: no crea ni modifica | Respuesta idéntica al caso 11 (indiferenciable) | — |
| con mapping huérfano o inconsistente | Casos 13, 15: no reasigna; puede requerir cuarentena | Si el actor solicitante no es el propietario del mapping: comportamiento normal sobre su propio actor (caso 1). Si el actor solicitante es el aparente propietario pero identidad Auth ha cambiado: comportamiento idéntico al caso 12 | — |

**No devolver detalles internos sensibles**. Los códigos concretos definitivos se cierran en 9.3.2-A-Q2 dentro del alfabeto cerrado ya heredado; Q1-R prohíbe inventar códigos nuevos que enumeren estados.

## §18 · Riesgos residuales · rectificados

- **R-A** · Migración añade tabla nueva. Bloquea GO producción hasta que 9.3.2-A-Q3 (barrera E2E) valide `restore drill` completo. Mitigación: `restore drill` en CI Job C.
- **R-B** · El cambio en `bootstrap.ts:90` modifica el semántico observado por clientes actuales. Los 14 escenarios Q3-E2E-R deben permanecer verdes.
- **R-C** · Un tenant personal puede quedar huérfano si un flujo futuro elimina la membership sin borrar la fila. Mitigación: FK `ON DELETE RESTRICT` + procedimiento §17-ter G.
- **R-D** · `admin_ensure_personal_workspace` usa `SECURITY DEFINER` con owner `postgres`. Mitigación: `SET search_path = pg_catalog, spabla_v2`.
- **R-E** · Advisory lock a nivel de aplicación no persiste entre reinicios. No es problema porque el lock es transaccional; la PK garantiza la unicidad.
- **R-F** *(rectificado)* · La localización del nombre visible depende de la exactitud de la whitelist server-side y del catálogo cerrado. Riesgo mitigado: la unicidad **no** depende del nombre (§17-bis 11-12).
- **R-G** *(Q1-R)* · La política jurídica de retención, anonimización y eliminación **no está validada** en este contrato. Q1-R prohíbe afirmar cumplimiento jurídico definitivo. La implementación del ciclo de vida (§17-ter) requiere dictamen profesional antes de fijar plazos y mecanismos concretos.
- **R-H** *(Q1-R)* · El job de reconciliación de mappings huérfanos (§17-ter G) tiene diseño contractual pero no implementación; hasta que exista, la reparación se ejecuta manualmente por Dirección con auditoría explícita. Riesgo: acumulación de mappings huérfanos sin tratamiento. Mitigación: contrato ya fija el mecanismo y prohíbe reasignación automática (I-12).
- **R-I** *(Q1-R)* · La distinción entre estados en §17-ter H se enmascara en respuestas HTTP opacas. Riesgo: dificultad de diagnóstico legítimo por operadores. Mitigación: observabilidad server-side detallada (§16); el `correlationId` permite correlacionar sin filtrar al cliente.
- **R-J** *(Q1-R)* · La whitelist de 13 locales y sus códigos canónicos deben verificarse contra el resolver activo en producción antes de fijar la firma final. Mitigación: cierre en 9.3.2-A-Q2 con verificación cruzada.

## §19 · Archivos previsiblemente afectados

**Nuevos** (creación en 9.3.2-A-Q2):

- `supabase/migrations/<YYYYMMDD>000000_hito_9_3_2_a_actor_personal_workspace.sql` — migración aditiva (§15).
- `lib/v2/server/onboarding.ts` — puertos `PersonalWorkspaceProvider` + `PersonalWorkspaceLocaleResolver` + `PersonalWorkspaceLabelCatalog` + orquestador.
- `lib/v2/server/onboarding.supabase.ts` — adaptador Supabase/service_role.
- `lib/v2/server/onboarding.test.ts` — unit tests con `verifyJwt` mockeado y catálogo mockeado.
- `app/api/v2/onboarding/route.ts` — handler HTTP con extracción de pista `Accept-Language`.
- `app/api/v2/onboarding/route.handler.test.ts` — direct-handler tests (incluye casos 4-7, 20).
- `app/api/v2/onboarding/route.http.integration.test.ts` — HTTP-frontier contra Supabase local.
- Escenarios E2E ampliados en `e2e/auth-continuity.spec.ts` (9.3.2-A-Q3) — al menos casos §14 3, 4, 10, 20 y regresión sobre los 14 escenarios existentes.
- `docs/audit_reports/AUDIT_<fecha>_hito-9-3-2-a-onboarding.md` — acta tras cierre.

**Modificados** (mínimo):

- `lib/v2/server/bootstrap.ts:90` — cambio de `canOperate` (§11).

**Cero cambio productivo en**:

- `lib/v2/client/session-refresh-coordinator.ts`, `fetch-with-auth-retry.ts`, `auth-recovery-coordinator.ts`, `bootstrap-client.ts`, `supabase-browser-client.ts`.
- `lib/v2/server/composition.ts`.
- `app/api/v2/bootstrap/route.ts`, `app/api/v2/messages/route.ts`, `app/api/v2/seed/route.ts`.
- Todas las tablas y funciones existentes.

Q1-R **no** modifica ninguno de estos archivos: es únicamente documental.

## §20 · GO / NO-GO

**GO 9.3.2-A** cuando:

1. Migración aditiva aplica limpiamente en local y en CI (`restore drill` PASS).
2. Todos los 20 casos de §14 pasan verdes en Job B/D según su tipo.
3. Los 14 escenarios Q3-E2E-R permanecen verdes.
4. Cero cambio en config Supabase.
5. Cero exposición de `service_role` al cliente.
6. Cero PII persistido en `spabla_v2`.
7. Cero mensaje SQL en respuestas HTTP.
8. Cero texto libre del cliente persistido (§17-bis).
9. Whitelist server-side de locales cerrada y verificada contra el resolver de 9.2.
10. Catálogo server-owned de etiquetas del tenant personal cubre los 13 idiomas.
11. Bandera `actor_lifecycle_state` (o mecanismo equivalente) implementada para casos 11, 12, 16 (§17-ter H).
12. Prohibición efectiva de reclamo automático del tenant tras re-registro con mismo email (§14 caso 17).
13. Job de reconciliación de mappings huérfanos con contrato (§17-ter G) documentado (implementación puede diferirse a subhito posterior con auditoría manual mientras tanto).
14. Dictamen jurídico documentado sobre plazos de retención y política de anonimización antes de fijar cifras concretas.
15. Acta breve de Dirección.
16. CI oficial post-implementación attempt=1 · success · Jobs A/B/C/D success.

**NO-GO** si:

- Cualquier caso de §14 falla o queda NO EJECUTABLE.
- Regresión sobre Q3-E2E-R.
- Aparece un cambio de semántica no cubierto por §11.
- Se detecta filtración de PII o de `service_role`.
- Cualquier texto libre proporcionado por el cliente termina en `tenants.name` o equivalente.
- Cualquier respuesta HTTP enumera el estado interno del actor más allá del alfabeto cerrado.
- Cualquier flujo automático reasigna un tenant huérfano a otro actor.

## §21 · Secuencia futura de implementación

- **9.3.2-A-Q1-R · Rectificación normativa del contrato específico** — **este documento**.
- **9.3.2-A-Q2 · Implementación server-side** — migración + `lib/v2/server/onboarding*.ts` + `app/api/v2/onboarding/route.ts` + tests unit/integration/HTTP-frontier + ajuste `bootstrap.ts:90` + catálogo cerrado server-owned + resolver + `actor_lifecycle_state` mínimo.
- **9.3.2-A-Q3 · Barrera E2E** — ampliación de `e2e/auth-continuity.spec.ts` con al menos los 20 casos §14, especialmente 3, 4, 7, 10, 20, y regresión sobre los 14 existentes.
- **9.3.2-A-Q4 · Promoción** — fast-forward a `spabla-v2/thirteen-languages-activation`.
- **9.3.2-A-Q4-bis** *(Q1-R)* — subhito posterior autorizado para el job de reconciliación de mappings huérfanos y el procedimiento operativo del ciclo de vida (§17-ter). Requiere dictamen jurídico previo.

Tras 9.3.2-A-Q4 (mínimo viable) y solo entonces, se abre la secuencia 9.3.2-B (OTP email) según el contrato marco §23.

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

-- (3) Policies
SELECT tablename, policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname='spabla_v2'
   AND tablename IN ('tenants','tenant_memberships');

-- (4) Grants
SELECT grantee, privilege_type
  FROM information_schema.table_privileges
 WHERE table_schema='spabla_v2' AND table_name IN ('tenants','tenant_memberships');

-- (5) RLS enabled/forced
SELECT relname, relrowsecurity, relforcerowsecurity
  FROM pg_class
 WHERE relnamespace = 'spabla_v2'::regnamespace
   AND relname IN ('tenants','tenant_memberships');
```

## Anexo B · Experimentos concurrencia (2026-08-22)

- **E1**: `SELECT FOR UPDATE` sobre membership inexistente → T2 no bloqueado (3.2 ms). **Observado**.
- **E2**: `pg_advisory_xact_lock(hashtextextended(actor, 42))` → T2 espera 2032 ms. **Observado**.
- **E3**: dos RPC separadas → 2 tenants creados para el mismo actor. **Observado**.
- **E4**: `admin_add_membership` sobre `(tenant_id, actor_id)` existente → `SQLSTATE 23505`. **Observado**.

---

**Estado del contrato específico Q1-R**: cerrado. Ninguna implementación autorizada por esta rama documental. La siguiente orden autorizada es **9.3.2-A-Q2 · Implementación server-side atómica del onboarding**, condicionada a la aprobación de Dirección sobre las decisiones legales pendientes (§17-ter E, §17-ter F, §17-ter H y R-G).
