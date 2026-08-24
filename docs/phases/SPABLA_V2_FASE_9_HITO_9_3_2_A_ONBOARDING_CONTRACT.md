# SPABLA V2 · Hito 9.3.2-A — Contrato específico del onboarding productivo atómico

**Versión**: `Q1-RR-RECT (Hito 9.3.2-A-Q1-RR-RECT · 2026-08-24)`. Versión final autosuficiente. Rectifica y sustituye **normativamente** las versiones anteriores:

- Q1 (`b99185263500220772f595a921c526ade0bc2acc`) — dejaba pendientes OBS-Q1-1 y OBS-Q1-2.
- Q1-R (`00d2aa4c5d08c87619dd9d6d4cceaab39d129093`) — rectificaba OBS-Q1-1/2 pero introducía regresiones documentales (matriz reducida de 38 a 20 casos con pérdida de 6+1+1 escenarios, whitelist de locales incorrecta con 5 códigos inexistentes + 5 códigos omitidos + 1 sufijo prohibido, firma RPC insegura por caller privilegiado). Descartado como candidato de promoción por dictamen `HITO 9.3.2-A-Q1-RR · RECTIFICACIÓN DOCUMENTAL ADICIONAL REQUERIDA — NO PROMOVER`.

**Rama documental**: `spabla-v2/hito-9-3-2-a-q1-rr-final-contract`.
**Base oficial exacta**: `fb0a75676451b33934b149a718f3c4a55b92db3b` (`spabla-v2/thirteen-languages-activation`, cerrada por `HITO 9.3.1-Q3-E2E-R3-P · CONTINUIDAD NATURAL PROMOVIDA A OFICIAL — CERRADO`).
**CI oficial autorizante de la base**: [`32755010804`](https://github.com/DAVIDLENCINA/SPABLA/actions/runs/32755010804) attempt 1 · success · Jobs A/B/C/D success · Job D 14 passed · PostgreSQL 17 · restore drill PASS.
**Contrato marco gobernante**: `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_2_PASSWORDLESS_OTP_CONTRACT.md` (R2).
**Plan trece idiomas gobernante**: `docs/phases/SPABLA_V2_FASE_9_THIRTEEN_LANGUAGES_PLAN.md` V1.1 §14 (aprobado y congelado 2026-08-11).
**Ramas anteriores (intactas)**:
- Q1 original: `spabla-v2/hito-9-3-2-a-q1-onboarding-contract` @ `b991852…`.
- Q1-R descartado: `spabla-v2/hito-9-3-2-a-q1-r-onboarding-contract` @ `00d2aa4…`.

**Actas previas**: `docs/audit_reports/AUDIT_2026-08-22_hito-9-3-1-q3-auth-continuity-implementation.md` · `docs/audit_reports/AUDIT_2026-08-24_hito-9-3-1-q3-s6-natural-context-r3.md` · `docs/audit_reports/AUDIT_2026-08-24_hito-9-3-2-a-q1-rr-final-contract.md` (esta unidad).

**Autoridad**: este documento congela el alcance normativo de la unidad **9.3.2-A** (onboarding productivo mínimo, atómico e idempotente). **No autoriza implementación**. La implementación requerirá la orden operativa 9.3.2-A-Q2, seguida por 9.3.2-A-Q3 (barrera E2E) y 9.3.2-A-Q4 (promoción a la rama oficial).

**Alcance de la rectificación Q1-RR-RECT**: normativa contractual únicamente. Cero migración, cero endpoint, cero código productivo, cero test, cero cambio en Supabase, cero cambio en workflows.

---

## §1 · Identidad

**«Hito 9.3.2-A — Onboarding productivo mínimo, atómico e idempotente»**, prerrequisito obligatorio de 9.3.2-B según el contrato marco §1 y §23.

Publicará en la familia de ramas `spabla-v2/hito-9-3-2-a-*`.

## §2 · Relación con el contrato marco

Este documento cierra §9.3 (mecanismo de unicidad) y §9.4 (semántica del tenant personal) del contrato marco. No altera ninguna otra sección del marco. Cualquier conflicto material con el marco se documenta expresamente (§4, §5 y §17-bis) y se resuelve a favor del marco salvo autorización de Dirección para modificarlo.

## §3 · Estado actual verificado (inspección estática + catálogo)

Inspección estática de `supabase/migrations/*` y consulta del catálogo PostgreSQL local (Supabase local · Postgres 17.6, `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres"`, 2026-08-22) arrojan la foto real del esquema. Cero migración en la ventana Q1 → Q1-R → Q1-RR-RECT.

### §3.1 · `spabla_v2.tenants`

- Columnas: `id UUID PK DEFAULT gen_random_uuid()`, `name TEXT NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- Owner: `postgres`.
- Constraints: `tenants_pkey (id)`, `tenants_name_not_blank CHECK (length(btrim(name)) > 0)`.
- Índice: `tenants_pkey UNIQUE btree (id)`.
- RLS: **ENABLE + FORCE**.
- Policy: `tenants_select_own` (`SELECT authenticated USING EXISTS(...)`).
- Grants: `SELECT → authenticated`; `SELECT, INSERT → service_role`; cero grants a `anon`.
- Sin columnas `kind`, `type`, `owner_actor_id`, `personal_owner_actor_id`.
- **`tenants.name` es texto no nulo con `CHECK length>0`**. Q1-RR-RECT establece que ese campo **no es identidad, no es clave de unicidad, no es clave de recuperación**. Su valor será la **clave interna fija server-owned** `workspace.personal.default` (§4, §6 I-4″, §9, §17-bis).

### §3.2 · `spabla_v2.tenant_memberships`

- Columnas: `tenant_id UUID NOT NULL`, `actor_id UUID NOT NULL`, `role TEXT NOT NULL`, `is_active BOOLEAN NOT NULL DEFAULT TRUE`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- Owner: `postgres`.
- Constraints: composite PK `(tenant_id, actor_id)`, CHECK role_not_blank, FK `tenant_id`.
- Índices: `tenant_memberships_pkey UNIQUE btree (tenant_id, actor_id)`; `idx_tenant_memberships_actor btree (actor_id) WHERE (is_active = true)`.
- RLS: **ENABLE + FORCE**. Policy `tenant_memberships_select_own`.
- Grants: `SELECT → authenticated`; `SELECT, INSERT, UPDATE, DELETE → service_role`; cero grants a `anon`.
- `role` texto libre en esquema; en uso corriente `'owner'`/`'member'`.

### §3.3 · Funciones administrativas (SECURITY DEFINER, GRANT solo `service_role`)

- `admin_create_tenant(p_name text) RETURNS uuid` — INSERT tenant, devuelve id. Composable dentro de otra transacción.
- `admin_add_membership(p_tenant_id uuid, p_actor_id uuid, p_role text) RETURNS void` — INSERT en `tenant_memberships`. Rechaza si tenant no existe (`23503`). **NO idempotente**: fila existente → `23505`.
- `admin_deactivate_membership(p_tenant_id, p_actor_id) RETURNS void` — UPDATE `is_active=FALSE`. Idempotente.
- `admin_append_usage(...)` — irrelevante para onboarding.

### §3.4 · Bootstrap composer (`lib/v2/server/bootstrap.ts`)

- `selectedTenantId` = primer membership activo por `created_at ASC`.
- `selectedConversationId` = primera conversación del tenant seleccionado por `created_at ASC`.
- `canOperate = selectedTenantId !== null && selectedConversationId !== null` — exige conversación (a rectificar por §11).

### §3.5 · Evidencia empírica sobre concurrencia (experimentos locales · 2026-08-22)

Ejecutados sobre Supabase local desechable con dos conexiones psql concurrentes. Resultados **observados**.

- **E1** · `SELECT ... FOR UPDATE` sobre `tenant_memberships WHERE actor_id = X` cuando la fila no existe: T2 no espera (3.2 ms). `SELECT FOR UPDATE` **no serializa la creación**.
- **E2** · `pg_advisory_xact_lock(hashtextextended('<actor>', 42))`: T2 espera al commit de T1 (2032 ms). El advisory lock **serializa correctamente** por actor.
- **E3** · Dos ejecuciones concurrentes desde JS: 2 tenants + 2 memberships owner para el mismo actor. Componer las RPC desde JS **no garantiza unicidad**.
- **E4** · `admin_add_membership` sobre `(tenant_id, actor_id)` existente → `23505 duplicate_key`. Falta de idempotencia intrínseca.

### §3.6 · Debilidades encontradas (para 9.3.2-A)

- **D-1** · No existe estructura para «como máximo un tenant personal por actor».
- **D-2** · No existe estructura para distinguir tenant personal de tenant compartido.
- **D-3** · Las dos RPC actuales no se componen atómicamente desde JavaScript.
- **D-4** · `admin_add_membership` no es idempotente.
- **D-5** · `bootstrap.ts` ata `canOperate` a la existencia de una conversación.
- **D-6** *(añadido por Q1-R, mantenido por Q1-RR-RECT)* · Q1 dejaba abierta la persistencia de una etiqueta influenciable por el cliente. Q1-RR-RECT lo cierra: la RPC no recibe texto en ningún caso; persiste la clave interna fija `workspace.personal.default`.
- **D-7** *(añadido por Q1-R, mantenido por Q1-RR-RECT)* · Q1 no diferenciaba sign out, desactivación membership, solicitud eliminación, eliminación Auth, retención legal, anonimización, mappings huérfanos ni reparación segura. Q1-RR-RECT los distingue (§17-ter).
- **D-8** *(añadido por Q1-R, mantenido por Q1-RR-RECT)* · Q1 no prohibía explícitamente el reclamo automático del tenant anterior tras re-registro con mismo email. Q1-RR-RECT lo prohíbe (§17-ter D, §17-ter G, I-12).
- **D-9** *(añadido por Q1-RR-RECT)* · Q1-R proponía firma RPC `admin_ensure_personal_workspace(uuid, text)` con `p_workspace_label text` server-owned pero sin CHECK/enum. Cualquier caller `service_role` (jobs, migraciones futuras, scripts admin) podría pasar texto arbitrario. Q1-RR-RECT elimina el parámetro por completo: la RPC final tiene **un único parámetro** `p_actor_id uuid`.
- **D-10** *(añadido por Q1-RR-RECT)* · Q1-R §17-bis 6 listaba como whitelist activada `es, ca, eu, gl, en, fr, de, it, pt, nl, sv, ar, zh-Hans`, confundiendo el catálogo técnico del motor (55 códigos, ADR-005) con el catálogo activado por la UI (13 códigos, Plan V1.1 §14). Q1-RR-RECT usa el catálogo real activado (§17-bis 6).
- **D-11** *(añadido por Q1-RR-RECT)* · Q1-R §14 caso 15 «mapping sin tenant válido» se comportaba como error `500` — pero Q1 §14 caso 10 «tenant personal eliminado → crea uno nuevo (fuera de alcance)» y esa evolución semántica no se documentaba. Q1-RR-RECT distingue explícitamente las cuatro subvariantes A/B/C/D (§5, §14 casos 10 y 47).

## §4 · Semántica del espacio personal (cierre de §9.4 del marco)

Respuestas a las 15 preguntas del contrato marco §9.4, ampliadas con las preguntas 16-20 nuevas para OBS-Q1-1 y OBS-Q1-2:

1. **¿Todo usuario debe disponer de un espacio personal?** Sí.
2. **¿Un usuario invitado a un tenant compartido necesita espacio personal?** Sí. Independiente.
3. **¿Puede existir más de un espacio personal por actor?** No. Exactamente uno.
4. **¿Puede un actor ser owner de varios tenants empresariales?** Sí (por invitación o creación autorizada).
5. **¿Cómo se distingue estructuralmente un tenant personal?** Mediante la tabla dedicada `spabla_v2.actor_personal_workspace(actor_id UUID PRIMARY KEY, tenant_id UUID NOT NULL UNIQUE, created_at TIMESTAMPTZ)`. **La unicidad reside en este mapping, no en el nombre visible**.
6. **¿Qué ocurre si la membership personal está desactivada?** El onboarding reactiva idempotentemente dentro de la misma transacción (§9 paso 3.a). La desactivación **no** equivale a eliminar la cuenta (§17-ter B).
7. **¿Qué ocurre si el tenant personal está desactivado?** El tenant no tiene columna `is_active`. Si el tenant se eliminase (fuera del alcance 9.3.2-A), la fila del mapping quedaría huérfana. Mitigación estructural: FK `tenant_id → tenants(id) ON DELETE RESTRICT`.
8. **¿Qué ocurre si el usuario abandona otros tenants?** Irrelevante para el espacio personal. Su fila en el mapping permanece.
9. **¿Puede eliminarse el tenant personal?** No dentro del alcance de 9.3.2-A. La eliminación futura requerirá subhito autorizado (§17-ter).
10. **¿Qué devuelve onboarding si ya existe?** Retorna el mismo `tenantId` sin escribir. `created=false` server-side (no visible al cliente).
11. **¿Qué devuelve bootstrap tras onboarding?** El tenant personal en `memberships[]`, `selectedTenantId=<personal>`, `conversations=[]`, `selectedConversationId=null`.
12. **¿Cuál queda seleccionado por defecto?** El tenant personal, salvo tenants compartidos preexistentes con `created_at` anterior (selección determinista Q2 §10 continúa aplicando).
13. **¿Se crea alguna conversación automáticamente?** **No.**
14. **¿Qué significa `canOperate=true`?** Existencia de al menos un tenant seleccionado con membership activa (ajuste §11).
15. **¿Qué operación mínima permite entrar en SPABLA Chat?** Tenant seleccionado + membership activa.

**Preguntas añadidas**:

16. **¿El nombre visible del espacio personal es identidad?** **No.** El nombre visible es exclusivamente presentación. La identidad y la unicidad residen en `actor_personal_workspace(actor_id → tenant_id)`. Cambiar de idioma **no** crea otro tenant. Repetir el onboarding **no** cambia el nombre persistido (que es siempre la clave interna fija `workspace.personal.default`, ver §9).
17. **¿Puede el cliente enviar nombre, locale sin validar, `tenantId`, `actorId`, `ownerId`, `role`, o etiqueta libre?** **No.** El body público del onboarding es `{}` o vacío. Cualquier campo enviado se ignora sin efecto y sin error de campo (§10).
18. **¿Qué hace el servidor con `Accept-Language`?** La trata como **pista no confiable** exclusivamente para presentación en la respuesta HTTP y en el bootstrap posterior. La pista **no** alcanza la RPC. La RPC persiste siempre la clave interna fija `workspace.personal.default` (§9). Si la pista no coincide con un código canónico del catálogo activado (§17-bis 6), la presentación aplica el locale por defecto.
19. **¿Un re-registro con el mismo email es el mismo actor?** **No.** El email no es identidad ni clave de recuperación del tenant. Nuevo `sub` en Auth = actor nuevo con su propio espacio personal. Cualquier recuperación de tenant anterior requiere mecanismo administrativo expresamente autorizado (§17-ter D, §17-ter G).
20. **¿Cuál es el efecto del sign out sobre el espacio personal?** Ninguno. Sign out finaliza la sesión Auth y no borra datos, no desactiva memberships, no elimina tenant. El siguiente login del mismo actor recupera el mismo espacio (§17-ter A).

## §5 · Comparación de mecanismos de unicidad y decisión

Sin cambios respecto a Q1 en la tabla decisional. Se conserva la elección **opción C · `spabla_v2.actor_personal_workspace`**. Q1-RR-RECT refuerza: al residir la unicidad en el mapping, el nombre queda libre para ser la clave interna fija.

| Dimensión | A · Columna en `tenants` | B · Tabla asociación dedicada | **C · Registro `actor_personal_workspace`** | D · Advisory lock sin estructura |
|---|---|---|---|---|
| Garantía de unicidad | Parcial | Sí (`actor_id PK`) | **Sí (`actor_id PK` + `tenant_id UNIQUE`)** | No |
| Atomicidad | Depende RPC | Depende RPC | **Depende RPC (FK)** | Solo en transacción |
| Concurrencia | UNIQUE bloquea | UNIQUE bloquea | **UNIQUE bloquea** | Lock explícito |
| Complejidad | Media | Baja | **Baja** | Muy baja |
| RLS | Ajustar policy | Neutro | **Neutro** | Neutro |
| Privacidad | Neutro | Neutro | **Neutro** | Neutro |
| Portabilidad | Baja | Media | **Alta** | Media |
| Rollback | Difícil | Fácil | **Fácil** | Sin migración |
| Riesgo huérfanos | Sí sin FK | Cero con FK RESTRICT | **Cero con FK RESTRICT** | Sí |
| Auditoría comprador futuro | Confusa | Media | **Clara** | Difusa |

**Semántica normativa sobre tenant eliminado y mapping huérfano** (rectificación Q1-RR-RECT que resuelve D-11):

- **A · Mapping válido + tenant válido**: caso normal. Idempotente. Devuelve el mismo tenant.
- **B · Mapping existente + tenant inexistente**: **inconsistencia estructural**. El onboarding **no** crea silenciosamente otro tenant. **No** reasigna el mapping. Respuesta pública `500 internal` opaco. Rollback total. Evento de auditoría. Cuarentena para el job de reconciliación (§17-ter G).
- **C · Eliminación legítima completada**: solo alcanzable por el futuro flujo autorizado de eliminación (§17-ter). El mapping anterior debe estar eliminado, anonimizado o convertido en tombstone. Un re-registro Auth (nuevo `sub`) es un actor nuevo cuya identidad y mapping son distintos. Cero recuperación automática del tenant anterior (I-12).
- **D · Tenant eliminado manualmente dejando mapping**: se trata como **corrupción del caso B**, no como eliminación legítima. Mismo tratamiento: `500 internal`, cuarentena, sin recreación silenciosa.

Esta distinción sustituye al antiguo Q1 §14 caso 10 («tenant personal eliminado → crea uno nuevo, fuera de alcance») cuya semántica de recreación queda **explícitamente descartada**. La evolución se documenta en el crosswalk del Anexo C.

## §6 · Invariantes de producto

- **I-1** · Exactamente un espacio personal por actor.
- **I-2** · El espacio personal existe desde la primera sesión operativa del actor.
- **I-3** · El espacio personal es distinto de cualquier tenant compartido o empresarial.
- **I-4″** *(rectificada en Q1-R y refinada en Q1-RR-RECT)* · El **nombre visible** del espacio personal es exclusivamente presentación. **No es identidad, no es clave de unicidad, no es clave de recuperación.** El texto persistido en `tenants.name` para el tenant personal será **la clave interna fija server-owned `workspace.personal.default`**, no una traducción. La presentación (en respuesta HTTP y bootstrap) resolverá esa clave a un texto localizado usando el catálogo cerrado server-owned del hito 9.2 (§17-bis). Cero derivación del email o cualquier PII. Cero valor proporcionado por el cliente.
- **I-5** · La creación del espacio personal es idempotente: cualquier repetición devuelve el mismo `tenantId`.
- **I-6** · La creación es atómica: si algo falla, no queda tenant huérfano ni membership huérfana.
- **I-7'** *(rectificada en Q1-R y confirmada en Q1-RR-RECT)* · El cliente **no puede** autoasignarse ni influir en `tenantId`, `role`, `ownerId`, `actorId`, email, nombre del tenant, etiqueta localizada libre, ni locale destinado a persistencia. El body público del onboarding es `{}` o vacío. Cualquier campo enviado se ignora sin efecto y sin error de campo.
- **I-8** · SPABLA usa exclusivamente API pública de Supabase Auth para identidad; el onboarding no consulta ni modifica tablas del schema `auth`.
- **I-9** · La retirada de Supabase como proveedor de Auth o de Postgres no debe alterar la semántica funcional del onboarding.
- **I-10** *(Q1-R, confirmada)* · La identidad del actor se deriva exclusivamente de la sesión Auth validada por el servidor (`sub` del JWT). El email nunca es identidad ni clave de recuperación del tenant. Un re-registro con el mismo email es un actor nuevo (§17-ter D, §17-ter G).
- **I-11** *(Q1-R, confirmada)* · La eliminación del usuario Auth no borra por sí sola datos SPABLA. El tratamiento posterior sigue el procedimiento §17-ter.
- **I-12** *(Q1-R, confirmada)* · Ningún flujo automático puede reasignar un tenant huérfano a otro actor sin decisión administrativa expresamente autorizada.
- **I-13** *(Q1-R, confirmada)* · La respuesta pública del onboarding es estable, indiferenciable entre creación e idempotencia, y opaca respecto al estado interno del actor. No enumera identidades ni distingue causas más allá del alfabeto cerrado (§10).
- **I-14** *(añadida por Q1-RR-RECT)* · La RPC `admin_ensure_personal_workspace` tiene **un único parámetro** `p_actor_id uuid`. No admite `p_workspace_label`, `p_label_key`, `p_locale`, `p_name` ni cualquier texto procedente del endpoint o del cliente. El texto persistido en `tenants.name` es la clave interna fija `workspace.personal.default` codificada en la propia función SQL. Ningún caller privilegiado puede pasar texto arbitrario por esta vía.
- **I-15** *(añadida por Q1-RR-RECT)* · El catálogo activado de locales que el servidor reconoce como canónicos es exactamente el catálogo de trece códigos del hito 9.2 (§17-bis 6). Cualquier código fuera de ese catálogo se trata como pista no canónica y no alcanza la RPC.

## §7 · Operación de dominio

Definida en términos de dominio SPABLA, independiente del proveedor:

```
ensurePersonalWorkspace(actorId: ActorId): PersonalWorkspaceResult
```

**Entrada**:

- `actorId`: `ActorId` (UUID validado por la frontera de autenticación).

La operación **no recibe** locale, pista de idioma, etiqueta ni texto libre. La presentación localizada de la respuesta HTTP se resuelve en el handler (§8.3, §10), no en el dominio.

**Salida**:

- `PersonalWorkspaceResult`:
  - `tenantId: TenantId`
  - `role: 'owner'`
  - `created: boolean` — `true` si se creó ahora; `false` si ya existía (observable server-side; no se envía al cliente).

**Propiedades contractuales**:

- Atómica.
- Idempotente para el mismo `actorId`. La idempotencia **no depende** del locale (no hay locale en el dominio).
- Segura bajo concurrencia.
- Reintentable.
- Sin PII.
- Sin parámetros controlables por cliente: `actorId` viene del JWT.
- Sin dependencia de tablas internas Auth.
- Rollback completo ante fallo.

## §8 · Puerto y adaptador

### §8.1 · Puerto (interfaz de dominio)

```
interface PersonalWorkspaceProvider {
  ensure(actorId: ActorId): Promise<PersonalWorkspaceResult>;
}
```

Vive en `lib/v2/server/onboarding.ts` (o en `engine/` si Dirección prefiere).

**Puerto separado para presentación** (Q1-RR-RECT — se aloja en el handler, **no** en el dominio del onboarding):

```
interface PersonalWorkspaceLabelPresenter {
  labelFor(canonicalLocale: CanonicalLocale): PresentationLabel;
  // Recibe uno de los 13 códigos canónicos del catálogo activado (§17-bis 6).
  // Devuelve el texto de presentación para la respuesta HTTP y para el bootstrap
  // posterior. No participa en persistencia: el texto persistido lo fija la RPC.
}
```

### §8.2 · Adaptador actual (Postgres/Supabase)

Implementación en `lib/v2/server/onboarding.supabase.ts`. Consume el cliente `service_role` server-side. Delega el trabajo real a **una única RPC transaccional** en PostgreSQL (§9, §15). Cero orquestación desde JavaScript. Cero texto pasado a la RPC.

### §8.3 · Frontera HTTP

`app/api/v2/onboarding/route.ts` (definido en §10). Únicamente:

- valida el JWT con `verifyJwt` (Q3-R FASE 4);
- llama a `PersonalWorkspaceProvider.ensure(actorId)` — sin locale, sin texto;
- si la respuesta necesita incluir una etiqueta de presentación, extrae **opcionalmente** `Accept-Language`, lo normaliza a **uno de los 13 códigos canónicos** (§17-bis 6) o al locale por defecto, e invoca `PersonalWorkspaceLabelPresenter.labelFor(canonicalLocale)`. **Ese texto no se persiste ni alcanza la RPC**; se devuelve exclusivamente en la respuesta HTTP o se resuelve por el bootstrap posterior.
- serializa la respuesta pública sanitizada.

Cero lógica de dominio en el handler HTTP. Cero validación de identidad basada en body.

### §8.4 · Tabla de acoplamientos

| Acoplamiento | Aceptado actualmente | Prohibido | Estrategia de sustitución |
|---|---|---|---|
| Auth externa (Supabase Auth) | Sí, a través de `verifyJwt` + JWT `sub` | Consulta directa a `auth.users`, `auth.sessions`, otras `auth.*` | Sustituir `verifyJwt` por `IdentityVerifier` cuando Dirección autorice |
| Persistencia (PostgreSQL/Supabase) | Sí, a través de adaptador `PersonalWorkspaceProvider` | Referencia directa a Supabase SDK desde el dominio | Sustituir el adaptador respetando el mismo contrato |
| Nombre del tenant personal | Clave interna fija `workspace.personal.default` codificada en la RPC | Cualquier texto proveniente del endpoint, del cliente o de otro caller privilegiado | Cambiar la clave requiere migración documentada y nuevo contrato específico |
| Localización de presentación | `PersonalWorkspaceLabelPresenter` server-owned, resolviendo desde el catálogo cerrado de 13 idiomas | `Accept-Language` como fuente confiable de identidad; texto localizado en cliente que luego se persiste | Ampliar el catálogo o adoptar BCP-47 formalmente requiere ADR/contrato propio |
| Errores | Alfabeto cerrado `unauthorized`/`internal`/`unavailable`/`not_found` (subset de `http-error.ts`) | Fugar mensajes SQL o del proveedor Auth | Sanitización en `http-error.ts` + tests |
| Correlation-id | UUID v4 en cada respuesta | Referencia a un identificador del proveedor | Ya cumplido por `newCorrelationId()` |
| Ciclo de vida del actor | Puertos futuros `AccountDeletionRequestPort` + `OrphanMappingReconciliationJob` | Reasignación automática del tenant; borrado destructivo inmediato sin retención | Diseño detallado en 9.3.2-A-Q4-bis |

### §8.5 · Evidencia de portabilidad

Cero mención de `spabla_v2`, `Postgres`, `Supabase`, `RLS` o `service_role` en las interfaces `PersonalWorkspaceProvider` y `PersonalWorkspaceLabelPresenter`. Un adaptador alternativo podría implementar los mismos puertos respetando idempotencia, atomicidad y unicidad, sin modificar el handler HTTP ni el composer del bootstrap.

## §9 · RPC transaccional (adaptador actual) · versión final Q1-RR-RECT

Diseño de la única función server-side que ejecuta el onboarding dentro de una transacción PostgreSQL única. **La firma final tiene un único parámetro `p_actor_id uuid`.** La función codifica internamente la clave `workspace.personal.default` como texto a persistir en `tenants.name`.

**Firma final** (orientativa, se cierra en 9.3.2-A-Q2 sin ampliar parámetros):

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
    -- Clave interna fija propiedad del servidor. No es texto localizado.
    -- La presentación de este valor se realiza en el handler HTTP y en el
    -- bootstrap mediante PersonalWorkspaceLabelPresenter; no participa
    -- ni en identidad, ni en unicidad, ni en autorización, ni en RLS.
    c_workspace_key   constant text := 'workspace.personal.default';
    v_existing_tenant uuid;
    v_new_tenant      uuid;
BEGIN
    -- (1) Validación estructural: actor_id no puede ser NULL.
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'admin_ensure_personal_workspace: actor_id required'
            USING ERRCODE = '22023';
    END IF;

    -- (2) Serialización belt-and-braces por actor (§3.5 E2). Redundante
    --     con la PK de actor_personal_workspace, pero evita locks de fila
    --     y hace explícita la intención.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_id::text, 9321));

    -- (3) Comprobación idempotente: si ya existe mapping, devolver sin escribir.
    SELECT apw.tenant_id INTO v_existing_tenant
      FROM spabla_v2.actor_personal_workspace apw
     WHERE apw.actor_id = p_actor_id;

    IF v_existing_tenant IS NOT NULL THEN
        -- (3.a) Detección de mapping huérfano (caso B/D §5): tenant referenciado
        --       inexistente. NO se recrea silenciosamente. NO se reasigna.
        --       Levantar excepción para que el adaptador convierta en 500 opaco.
        PERFORM 1 FROM spabla_v2.tenants t WHERE t.id = v_existing_tenant;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'admin_ensure_personal_workspace: orphan mapping'
                USING ERRCODE = '23503';
        END IF;

        -- (3.b) Asegurar coherencia de la membership (§4 pregunta 6): si por
        --       flujo externo quedó inactiva, reactivar aquí.
        UPDATE spabla_v2.tenant_memberships
           SET is_active = TRUE
         WHERE tenant_id = v_existing_tenant
           AND actor_id  = p_actor_id;
        RETURN QUERY SELECT v_existing_tenant, 'owner'::text, FALSE;
        RETURN;
    END IF;

    -- (4) Creación atómica dentro de la misma transacción.
    --     admin_create_tenant recibe únicamente la clave interna fija.
    --     Ningún caller externo puede sustituir este valor.
    v_new_tenant := spabla_v2.admin_create_tenant(c_workspace_key);
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

- **Atomicidad**.
- **Idempotencia por actor** independiente de cualquier pista externa.
- **Concurrencia** — advisory lock + PK + UNIQUE.
- **Rollback**.
- **Unicidad del texto persistido**: siempre la clave interna fija. Ningún caller privilegiado puede introducir otro texto. Cierra D-6, D-9 e I-14.
- **Detección de mapping huérfano** (paso 3.a) — el propio SQL corta la ruta "silenciosamente crea otro tenant". El adaptador convierte `23503` en `500 internal` opaco (§10). Cierra D-11.
- **Cero afirmación** depende de `SELECT ... FOR UPDATE` sobre fila inexistente (§3.5 E1).

**El texto persistido no participa en autorización, unicidad, identidad ni RLS**. La presentación localizada la resuelve el handler (§8.3) sin volver a tocar la RPC.

## §10 · Contrato HTTP · `POST /api/v2/onboarding`

- **Método único**: `POST`. Otros verbos (`GET`, `PUT`, `PATCH`, `DELETE`, `HEAD`) → `404 not_found` opaco (patrón hito 9.2.5-C).
- **Autenticación**: `Authorization: Bearer <access_token>` obligatorio. Validado por `verifyJwt`. El server extrae `actorId` exclusivamente del claim `sub`.
- **Body**: `{}` o vacío. El cliente **no envía** `tenantId`, `role`, `ownerId`, `actorId`, email, nombre del tenant, etiqueta localizada libre, ni locale destinado a persistencia. Body inesperado (objetos con campos, arrays, strings, números, `null`) se ignora sin efecto, sin error de campo y **jamás produce `500` por parseo**; el handler devuelve el resultado normal del onboarding.
- **Content-Type**: `application/json`.
- **Cabeceras opcionales tratadas como pista no confiable**: `Accept-Language`. Se normaliza contra el catálogo canónico de trece códigos activados (§17-bis 6). Si no coincide, se aplica el locale por defecto. **Nunca se persiste ni alcanza la RPC**. Nunca controla identidad, unicidad, ni el nombre persistido (que es siempre la clave interna fija `workspace.personal.default`).
- **Correlation-id**: `X-SPABLA-Correlation-Id: <UUID v4>` en cada respuesta.
- **Timeouts**: coherentes con el resto de `app/api/v2/*` (`export const dynamic = "force-dynamic"; export const runtime = "nodejs";`).

**Respuesta exitosa**:

- **`200 OK`** con body `{ tenantId: string, role: 'owner' }`. `200` para ambos casos (creación y repetición idempotente).
- El campo `created: boolean` de la RPC queda en observabilidad server-side (§16), no en la respuesta.
- **Opcionalmente**, la respuesta puede incluir un campo `label: string` con el texto de presentación resuelto (`PersonalWorkspaceLabelPresenter.labelFor(canonicalLocale)`). Esa decisión operativa se cierra en Q2 y NO cambia la persistencia (siempre la clave interna fija).

**Respuestas de error** (alfabeto cerrado):

- `401 unauthorized` — JWT ausente/malformado/inválido/expirado. Body `{ error: 'unauthorized', correlationId }`.
- `503 unavailable` — error transitorio de DB, o estado de ciclo de vida que temporalmente no permite atender (mapping huérfano en cuarentena de reconciliación, `deletion_pending`, `legal_hold`). Body `{ error: 'unavailable', correlationId }`. El cliente puede reintentar.
- `500 internal` — cualquier otro error no clasificable, incluyendo **inconsistencia estructural no recuperable** (mapping huérfano recién detectado por §9 paso 3.a antes de ser puesto en cuarentena). Body sanitizado `{ error: 'internal', correlationId }`.
- `404 not_found` — verbos no permitidos. Body `{ error: 'not_found', correlationId }`.

**Decisiones normativas Q1-RR-RECT sobre estados internos** (cierra §17-ter H de Q1-R que quedaba abierto):

| Estado interno | Código HTTP |
|---|---|
| activo (sin mapping) | `200 OK` (creación) |
| ya onboarded | `200 OK` (idempotente) |
| membership desactivada | `200 OK` (reactivación en la misma transacción) |
| mapping huérfano recién detectado por §9 paso 3.a | `500 internal` opaco |
| mapping huérfano en cuarentena por §17-ter G | `503 unavailable` opaco |
| solicitud de eliminación en curso (`deletion_pending`) | `503 unavailable` opaco |
| bajo retención legal (`legal_hold`) | `503 unavailable` opaco |
| Auth eliminado (sub no válido) | `401 unauthorized` opaco (sesión revocada) |

**`409 Conflict` no se usa** (la unicidad se resuelve internamente por advisory lock + PK). **`422` no está en el alfabeto**. **`400 bad_request` no se usa** para body inesperado (I-7' garantiza que se ignora sin error de campo).

**Cero exposición** de: SQL, `service_role`, email, `sub` raw fuera del `correlationId`, causas internas del estado del actor. El correlationId permite correlacionar sin filtrar.

**El cliente NO puede** elegir rol, tenant, identidad, nombre persistido ni locale persistido: el server los deriva del JWT y de la clave interna fija.

**Después del onboarding**, el cliente **debe** re-invocar `GET /api/v2/bootstrap` para obtener el contexto completo. La respuesta de `POST /api/v2/onboarding` es intencionalmente minimalista.

## §11 · Ajuste compatible en `bootstrap.ts` (propuesta)

**Conflicto identificado** (§3.6 D-5). Modificar `lib/v2/server/bootstrap.ts:90` para:

```ts
const canOperate = selectedTenantId !== null;
```

**Compatibilidad hacia atrás**:

- Usuarios existentes con conversación siguen `canOperate=true`.
- Usuarios nuevos con onboarding pero sin conversación pasan a `canOperate=true`.
- Los 14 escenarios Q3-E2E-R permanecen verdes tras el cambio (el escenario §20-11 usa `userC` sin membership).

## §12 · RLS, grants, service_role

**RLS**:

- `spabla_v2.actor_personal_workspace` (nueva) recibirá `ENABLE ROW LEVEL SECURITY + FORCE ROW LEVEL SECURITY`.
- **Cero policy** para `authenticated` sobre esta tabla.
- Solo `service_role` accede (vía función `SECURITY DEFINER`).

**Grants**:

- Cero grants a `anon`.
- Cero grants a `authenticated` sobre `actor_personal_workspace`.
- `service_role`: `SELECT, INSERT, UPDATE, DELETE`.

**Service role**:

- Encapsulado exclusivamente en `lib/v2/server/onboarding.supabase.ts`.
- Cero exposición al cliente. Cero import del cliente de esa constante.
- Instanciación reutiliza el patrón de `translation-runtime.ts`.

## §13 · STRIDE acotado al onboarding

| # | Amenaza | Activo | Actor adversario | Vector | Control preventivo | Control detective | Evidencia | Riesgo residual |
|---|---|---|---|---|---|---|---|---|
| S1 | Suplantación del actor | Identidad | Usuario ajeno | JWT robado | `verifyJwt` valida firma + `exp` | Métrica de invocaciones por `sub` | Reutiliza Q3-R | Bajo |
| S2 | Manipulación de `actorId` en body | Selección personal | Cliente | Enviar `{"actorId":"otro"}` | Handler ignora body; `actorId` del JWT | Log `correlationId` + `actorId` redactado | Test §14 caso 19 | Cero |
| S3 | Autoasignación de `role` owner | Membership no autorizada | Cliente | Enviar `{"role":"admin"}` | Server siempre `'owner'` | Test §14 caso 18 | Test §14 caso 18 | Cero |
| S4 | Autoasignación de `tenantId` | Membership en tenant ajeno | Cliente | Enviar `{"tenantId":"ajeno"}` | Server crea/consulta el personal | Test §14 caso 17 | Test §14 caso 17 | Cero |
| S5 | Repetición masiva | DoS del onboarding | Cliente | Bucle de POST | Idempotencia + rate limit hosting | Métrica `#onboarding_por_actor_por_minuto` | 200 p95 | Bajo |
| S6 | Carrera concurrente | Duplicación tenants | Cliente / dos pestañas | Doble POST simultáneo | PK + advisory lock | Test §14 caso 12, 13 | Test §14 caso 12, 13 | Cero |
| S7 | Escalada mediante `service_role` | Acceso privilegiado | Vuln. server-side | Fuga env var | Encapsulado en `onboarding.supabase.ts` | Escaneo secretos | `logSanitizedError` | Bajo |
| S8 | Exposición de mensajes SQL | Fuga estructura | Cliente | Provocar error | `opaqueError`; `SQLSTATE` no llega | Test §14 caso 42 | Test §14 caso 42 | Cero |
| S9 | Creación abusiva de tenants | Inflación tabla | Cliente | Bucle | Idempotencia | Métrica tenants/actor | Test §14 caso 30 | Cero |
| S10 | DoS mediante locks | Bloqueo otros actores | Cliente | Advisory lock largo | Transaction lock + RPC corta | Latencia p95 | Test §14 caso 13 | Bajo |
| S11 | Tenant huérfano | Consistencia | Fallo mid-tx | Crash entre RPC | Transacción única | Test §14 caso 14, 32 | Migración test | Cero |
| S12 | Membership huérfana | Consistencia | Fallo mid-tx | Crash entre INSERTs | Idem S11 | Test §14 caso 15, 33 | Idem | Cero |
| S13 | Reutilización JWT revocado | Sesión expirada | Ex-usuario | JWT no expirado tras signOut | `verifyJwt` valida `exp` + firma | Log auth-recovery | Test §14 caso 4 | Aceptado |
| S14 | Confusión personal/empresarial | Selección incorrecta | Bootstrap composer | Ordenamiento `created_at` | Tabla `actor_personal_workspace` | Test §14 caso 34, 35 | Test | Bajo |
| S15 | Logs con PII/credenciales | Fuga | Accidente server | Volcar body/resp | `logSanitizedError`; cero `email` | Test §14 caso 41 | Escaneo | Bajo |
| S16 | Escalada via `name` libre del cliente | Persistencia arbitraria | Cliente | Enviar `{"name":"‹script›"}` | Body ignorado; RPC no acepta text | Test §14 caso 17-24 | Test | Cero |
| S17 | Enumeración vía locale | Detectar estado por `Accept-Language` | Cliente | Repetir con distinto AL | Respuesta idéntica; RPC no depende de locale | Test §14 caso 48, 49 | Test | Cero |
| S18 | Reclamo automático de tenant tras eliminación Auth | Toma de control huérfano | Ex-actor re-registrado con mismo email | Nuevo signup | Prohibición explícita (I-12, §17-ter D/G); mapping en cuarentena | Job reconciliación §17-ter G | Test §14 caso 52 | Bajo |
| S19 | Operación durante procedimiento de eliminación | Continuar creando datos | Actor en `deletion_pending` | Reintentar onboarding | Bandera server-side bloquea; `503` | Test §14 caso 50 | Test | Bajo |
| S20 | Fuga de estado interno en respuesta | Enumeración estados | Cliente | Comparar respuestas | Alfabeto cerrado; opacidad | Test §14 casos 48-53 | Test | Cero |
| S21 | Persistencia de texto arbitrario vía caller privilegiado (Q1-RR-RECT) | Persistencia `tenants.name` | Jobs internos, migraciones futuras, scripts admin con `service_role` | Llamar `admin_ensure_personal_workspace` | RPC sin parámetro text; clave interna fija codificada (§9, I-14) | Test §14 caso 24' + auditoría estática del código | Test | Cero (constructivo) |

OTP y sus amenazas específicas **NO** se tratan aquí — corresponden a 9.3.2-B.

## §14 · Matriz contractual final (48 escenarios base + 5 casos nuevos = 53)

Cada caso define: **entrada**, **comportamiento server-side**, **estado persistido**, **respuesta pública**, **invariantes cubiertas**, **auditoría/prueba**. La matriz absorbe los 38 escenarios técnicos originales de Q1 §14 (recuperados sin pérdida), los 20 casos contractuales de Q1-R §14 (integrados), y añade los casos nuevos derivados de OBS-Q1-1, OBS-Q1-2 y la firma RPC final Q1-RR-RECT.

Los crosswalks completos figuran en Anexo C (38 originales → final) y Anexo D (20 Q1-R → final).

| # | Escenario | Entrada | Comportamiento server-side | Estado persistido | Respuesta pública | Invariantes | Auditoría/prueba |
|---|---|---|---|---|---|---|---|
| 1 | Sin `Authorization` → 401 | Petición sin header | `verifyJwt` rechaza | Sin cambios | `401 unauthorized` opaco | S1 | Test HTTP-frontier |
| 2 | JWT malformado → 401 | `Authorization: Bearer bogus` | `verifyJwt` rechaza | Sin cambios | `401 unauthorized` opaco | S1 | Test HTTP-frontier |
| 3 | JWT inválido (firma corrupta) → 401 | JWT firmado con otra clave | `verifyJwt` rechaza | Sin cambios | `401 unauthorized` opaco | S1 | Test HTTP-frontier |
| 4 | JWT expirado → 401 | JWT con `exp < now()` | `verifyJwt` rechaza | Sin cambios | `401 unauthorized` opaco | S13 | Test HTTP-frontier |
| 5 | Actor nuevo → 200 crea | JWT válido de actor sin `actor_personal_workspace`; body `{}` | RPC crea tenant, mapping, membership `owner` | 1 fila en mapping, 1 tenant (name=`workspace.personal.default`), 1 membership `is_active=true` | `200 OK` `{tenantId, role:'owner'}` | I-1, I-2, I-4″, I-5, I-6, I-7', I-14 | Integration + E2E; métrica `created=true` |
| 6 | Actor ya provisionado → 200 idempotente | JWT válido, actor ya provisionado; body `{}` | Advisory lock; paso (3) devuelve existente sin escribir | Sin cambios | `200 OK` mismo `tenantId` | I-5, I-13 | Integration; métrica `created=false`, `duplicates_prevented_total++` |
| 7 | Actor con tenant compartido pero sin personal → crea personal | JWT válido, actor con membership `member` en tenant compartido preexistente pero sin mapping personal | RPC crea el mapping personal + tenant + membership `owner` independiente | 1 fila mapping nueva, 1 tenant personal nuevo, 1 membership `owner` nueva; el tenant compartido intacto | `200 OK` con `tenantId` del **personal** | I-1, I-3 | Integration; bootstrap posterior devuelve ambos tenants |
| 8 | Actor con personal + compartido → idempotente sobre personal | JWT válido, actor con mapping personal + membership en tenant compartido | Paso (3) devuelve el personal existente sin tocar el compartido | Sin cambios | `200 OK` con `tenantId` del personal | I-3, I-5 | Integration |
| 9 | Membership desactivada → reactiva | Actor con mapping y `tenant_memberships.is_active=false` | Paso (3.b) UPDATE `is_active=true` | Membership `is_active=true` | `200 OK` mismo `tenantId` | I-5, §17-ter B | Integration; métrica `reactivations_total++` |
| 10 | Mapping válido con tenant eliminado o inexistente → inconsistencia opaca | Actor con mapping cuyo `tenant_id` no resuelve en `tenants` (D-11 corrupción, §5 B/D) | Paso (3.a) detecta ausencia; NO recrea; NO reasigna; RAISE `23503` → adaptador → `500 internal` | Sin cambios (rollback) | `500 internal` opaco | I-12, §5 B, §5 D | Integration con fixture de corrupción forzada; job reconciliación en cuarentena |
| 11 | Dos llamadas secuenciales → mismo `tenantId` | Mismo actor, dos POST secuenciales | Primera crea, segunda idempotente | 1 fila en cada tabla | Ambas `200 OK` mismo `tenantId` | I-5 | Integration |
| 12 | Dos concurrentes → mismo tenant | Mismo actor, 2 POST simultáneos | Advisory lock serializa | 1 fila en cada tabla | Ambas `200 OK` mismo `tenantId` | S6 | Integration concurrencia |
| 13 | Veinte concurrentes → un solo tenant y una membership | Mismo actor, 20 POST simultáneos | Advisory lock + PK serializan | 1 fila en cada tabla | Las 20 `200 OK` con mismo `tenantId` | S6, S10 | Integration concurrencia; verificar `COUNT(*)=1` en DB |
| 14 | Fallo tras crear tenant → rollback | Fixture inyecta fallo entre `admin_create_tenant` e `INSERT actor_personal_workspace` | Transacción ROLLBACK completa | Cero tenant huérfano | `503 unavailable` o `500 internal` opaco | I-6, S11, S12 | Integration con inyección |
| 15 | Fallo antes de commit → rollback | Fixture inyecta fallo antes del COMMIT tras todos los INSERTs | ROLLBACK | Sin cambios | `503 unavailable` o `500 internal` opaco | I-6, S11 | Integration con inyección |
| 16 | 503 transitorio + reintento idempotente | Primera llamada devuelve `503` por DB temporalmente indisponible; el cliente reintenta | Segunda llamada crea (si no había mapping) o devuelve existente | 1 fila (creación) o sin cambios (idempotente) | `503` primera, `200` segunda con mismo `tenantId` | I-5, S5 | Integration con fixture de DB flaky |
| 17 | `tenantId` enviado por cliente → ignorado | Body `{"tenantId":"attacker"}` | Body ignorado; RPC con actor del JWT | Estado normal | `200 OK` con `tenantId` real del actor (nunca el enviado) | I-7', S4, S16 | HTTP-frontier |
| 18 | `role` enviado por cliente → ignorado | Body `{"role":"admin"}` | Body ignorado; RPC asigna `'owner'` | Estado normal | `200 OK` con `role:'owner'` | I-7', S3, S16 | HTTP-frontier |
| 19 | `actorId` enviado por cliente → ignorado | Body `{"actorId":"otro"}` | Body ignorado; `actorId` del JWT | Estado normal | `200 OK` con actor real del JWT | I-7', S2, S16 | HTTP-frontier |
| 20 | Body objeto inesperado → 200/ignorado; jamás 500 por parseo | Body `{"foo":"bar","baz":42,"nested":{"x":[1,2,3]}}` | Body ignorado sin error de campo | Estado normal | `200 OK` (o `200` idempotente si ya existía); jamás `500` por parseo | I-7', I-13 | HTTP-frontier |
| 21 | Body array → 200/ignorado; jamás 500 por parseo | Body `[1,2,3]` | Handler ignora estructuralmente | Estado normal | `200 OK`; jamás `500` por parseo | I-7', I-13 | HTTP-frontier |
| 22 | Body string → 200/ignorado; jamás 500 por parseo | Body `"hello"` | Handler ignora estructuralmente | Estado normal | `200 OK`; jamás `500` por parseo | I-7', I-13 | HTTP-frontier |
| 23 | Body numérico o null → 200/ignorado; jamás 500 por parseo | Body `42` o `null` | Handler ignora estructuralmente | Estado normal | `200 OK`; jamás `500` por parseo | I-7', I-13 | HTTP-frontier |
| 24 | Bodies inesperados jamás provocan 500 por parseo | Meta-caso agregado (cubre 20-23) | Handler saneado; parser JSON con `catch` explícito que degrada a body vacío | Idem | Cualquier body no válido devuelve `200 OK`; **jamás** `500` con causa "invalid_json" en respuesta | I-13, S8 | HTTP-frontier con matriz de bodies |
| 24' *(Q1-RR-RECT)* | Caller privilegiado no puede persistir nombre arbitrario | Script server-side con `service_role` invoca `admin_ensure_personal_workspace(...)` desde fuera del handler | La firma admite un único parámetro `uuid`. Cualquier intento de pasar más argumentos falla en la propia llamada SQL | N/A | N/A | I-14, S21 | Auditoría estática del código: `grep` sobre `admin_ensure_personal_workspace(` verifica la aridad; test SQL comprueba la firma vía `pg_proc` |
| 25 | `GET` no permitido → 404 opaco | Petición `GET /api/v2/onboarding` | Handler responde `404` | Sin cambios | `404 not_found` opaco | Coherencia 9.2.5-C | HTTP-frontier |
| 26 | `PUT` no permitido → 404 opaco | Petición `PUT` | Idem | Sin cambios | `404 not_found` | Idem | HTTP-frontier |
| 27 | `PATCH` no permitido → 404 opaco | Petición `PATCH` | Idem | Sin cambios | `404 not_found` | Idem | HTTP-frontier |
| 28 | `DELETE` no permitido → 404 opaco | Petición `DELETE` | Idem | Sin cambios | `404 not_found` | Idem | HTTP-frontier |
| 29 | `HEAD` no permitido → 404 opaco | Petición `HEAD` | Idem | Sin cambios | `404 not_found` | Idem | HTTP-frontier |
| 30 | Exactamente un tenant personal por actor tras onboarding | Post-onboarding un actor | Consulta directa DB | `COUNT(*) FROM tenants WHERE id IN (SELECT tenant_id FROM actor_personal_workspace WHERE actor_id=X) = 1` | N/A | I-1, S9, S14 | Integration |
| 31 | Exactamente una membership por actor sobre su personal | Idem | Consulta directa DB | `COUNT(*) FROM tenant_memberships WHERE actor_id=X AND tenant_id IN (SELECT tenant_id FROM actor_personal_workspace WHERE actor_id=X) = 1` | N/A | I-1, S12 | Integration |
| 32 | Cero tenant huérfano tras rollback | Post-fallo inyectado | Consulta directa DB | `SELECT COUNT(*) FROM tenants WHERE id NOT IN (SELECT tenant_id FROM tenant_memberships) = 0` | N/A | I-6, S11 | Integration con inyección |
| 33 | Cero membership huérfana tras rollback | Post-fallo inyectado | Consulta directa DB | `SELECT COUNT(*) FROM tenant_memberships WHERE tenant_id NOT IN (SELECT id FROM tenants) = 0` | N/A | I-6, S12 | Integration con inyección |
| 34 | Bootstrap selecciona el personal workspace | Post-onboarding sin tenants compartidos | Composer `bootstrap.ts` con selección determinista | N/A | `selectedTenantId=<personal>` | §11 | Integration |
| 35 | Bootstrap no selecciona arbitrariamente el compartido más antiguo | Post-onboarding con tenant compartido de `created_at` posterior | Composer respeta `created_at ASC`; personal más antiguo prevalece | N/A | `selectedTenantId=<personal>` cuando corresponde; `selectedTenantId=<compartido>` cuando el compartido es más antiguo (selección determinista) | §4 preg. 12 | Integration con fixture temporal |
| 36 | `canOperate=true` tras onboarding | Post-onboarding, sin conversación | Composer devuelve `canOperate=true` (§11) | N/A | Response bootstrap con `canOperate=true` | §4 preg. 14, §11 | Integration |
| 37 | Cero conversación creada por el onboarding | Post-onboarding | Consulta directa DB | `SELECT COUNT(*) FROM conversations WHERE tenant_id=<personal> = 0` | N/A | §9.5 marco | Integration |
| 38 | `authenticated` no puede `SELECT` en `actor_personal_workspace` | Cliente autenticado con JWT válido intenta consultar la tabla vía PostgREST | RLS deniega | N/A | Error opaco o cero filas | §12 | Test SQL integration con role `authenticated` |
| 39 | RPC no invocable por `anon` | Petición `anon` a la RPC vía PostgREST | GRANT revocado; PostgREST devuelve 404 o 403 según config | N/A | Error opaco | §12 | Test SQL integration con role `anon` |
| 40 | RPC no invocable directamente por `authenticated` | Cliente `authenticated` intenta invocar `admin_ensure_personal_workspace` vía PostgREST | GRANT revocado; PostgREST devuelve 404 o 403 | N/A | Error opaco | §12 | Test SQL integration con role `authenticated` |
| 41 | Logs sin PII | Cualquier petición | Handler + adaptador usan `logSanitizedError` | Logs no contienen `email`, `tenantId`, `actorId` (redactados), JWT | N/A | S15 | Escaneo de logs |
| 42 | Errores sin `SQLSTATE` | Provocar error de DB | `opaqueError` sanitiza | Response body no contiene `SQLSTATE`, código PostgreSQL, mensaje de driver | N/A | S8 | HTTP-frontier |
| 43 | Rollback `DROP TABLE ... CASCADE` no elimina tenants existentes | Entorno desechable con datos previos; `DROP TABLE spabla_v2.actor_personal_workspace CASCADE` | `tenants` intacta (no depende inversamente); mappings borrados | Tabla del mapping desaparece; tenants intactos | N/A | §15.2 | Test SQL en entorno desechable |
| 44 | Restore drill PASS | Job C ejecuta dump + restore con la migración aplicada | Restore drill completo | N/A | Job C success | §15, §20 GO 1 | Job C |
| 45 | Los 14 tests Q3-E2E-R permanecen verdes | Ejecutar `e2e/auth-continuity.spec.ts` tras cambios | Sin regresión | N/A | 14 passed / 0 failed / 0 skipped / 0 did not run | §11, contrato marco §11 | Job D |
| 46 | Cero llamadas OpenAI o proveedores reales durante las pruebas | Ejecutar Jobs A/B/C/D | Interceptores o env vars deshabilitan proveedores externos | N/A | Cero entrada en `usage_ledger` con proveedor real durante los tests; escaneo de logs | Reproducibilidad y coste | Integration + E2E con guard `SPABLA_TEST_MODE=true` u similar |
| 47 *(Q1-RR-RECT)* | Tenant eliminado manualmente sin flujo autorizado (D §5) | Fixture elimina tenant directamente vía SQL admin dejando mapping | §9 paso 3.a detecta; RAISE `23503`; adaptador `500` | Sin cambios (rollback) | `500 internal` opaco; cuarentena marcada | I-12, §5 D | Integration con fixture explícito |
| 48 | Repetición con locale canónico distinto | Actor ya provisionado; `Accept-Language: ja-JP` (canónico `ja` de la whitelist §17-bis 6) | Handler normaliza a `ja`; RPC no recibe el locale; paso (3) devuelve existente | Sin cambios | `200 OK` mismo `tenantId` (opcionalmente con `label` en `ja`) | I-5, I-15, S17 | HTTP-frontier |
| 49 | Locale desconocido (fuera del catálogo de 13) | `Accept-Language: no-NO` o `xx-YY` | Handler aplica locale por defecto para presentación; RPC intacta | Idéntico al caso 5 | `200 OK` (opcionalmente con `label` en el idioma por defecto) | I-7', I-15 | HTTP-frontier |
| 50 | Locale no canónico o manipulado | `Accept-Language: '); DROP TABLE tenants; --` o `zh-Hans` (variante prohibida) | Header parseado por librería HTTP estándar; `isLangCode` rechaza; locale por defecto para presentación | Idéntico al caso 5 | `200 OK` idéntico | I-7', I-15, S16, S17 | HTTP-frontier; escaneo logs verifica que no se registra el header crudo |
| 51 | Intento de enviar etiqueta libre | Body `{"name":"attacker","label":"<script>alert(1)</script>","workspaceName":"pwn"}` | Body ignorado sin efecto; RPC persiste clave interna fija | Idéntico al caso 5 (o 6) | `200 OK` idéntico | I-4″, I-7', I-14, S16 | HTTP-frontier; verificar que `tenants.name` = `workspace.personal.default` |
| 52 | Actor con solicitud de eliminación en curso | JWT válido, actor con `actor_lifecycle_state.deletion_pending=true` | Bandera server-side detecta; handler responde sin invocar la RPC | Sin cambios | `503 unavailable` opaco | I-11, §17-ter C, S19, S20 | Integration; log `deletion_pending_blocked` sin filtrar al cliente |
| 53 | Actor Auth ya eliminado | JWT antiguo válido durante gracia o `sub` inexistente | `verifyJwt` rechaza si firma/exp no cuadran; si aún válido durante gracia, se aplica el bloqueo del caso 52 | Sin cambios | `401 unauthorized` opaco o `503` según caso | I-10, I-11, §17-ter D, S18, S20 | Integration |
| 54 | Re-registro con el mismo email | Nueva alta Auth (nuevo `sub`) que comparte email con identidad previamente eliminada | Nuevo actor: caso 5; el tenant anterior permanece en cuarentena bajo §17-ter G | 1 nuevo mapping/tenant/membership; el huérfano anterior intacto | `200 OK` con `tenantId` **distinto** | I-10, I-12, §17-ter D, §17-ter G, S18 | Integration con fixture Auth |
| 55 | Actor bajo legal hold | `actor_lifecycle_state.legal_hold=true` | Handler respeta la bandera; no crea ni modifica | Sin cambios | `503 unavailable` opaco | I-11, §17-ter E, S20 | Integration |
| 56 | Dos actores diferentes | Dos JWTs distintos, dos POST simultáneos | Cada actor tiene su advisory lock y su PK | 2 mappings, 2 tenants, 2 memberships owner | Cada respuesta `200 OK` con `tenantId` distinto | I-1, I-3 | Integration |
| 57 | Tenant existente sin mapping (estado legacy) | Actor con `tenant_memberships.owner` sobre un tenant preexistente pero sin fila en el mapping | Decisión de Q2: (a) crear la fila apuntando al tenant existente si `admin_ensure_personal_workspace` detecta ese estado; (b) tratarlo como caso 5 creando un nuevo personal, dejando el legacy como compartido | Consistente | `200 OK` | I-1, I-3, I-6 | Integration con fixture legacy; decisión concreta se cierra en Q2 documentando estado inicial |

**Total: 57 escenarios únicos** (48 base numerados 1-47 sin el 24' que es Q1-RR-RECT nuevo; +5 casos 48-52 Q1-R; +5 casos 53-57 completando cobertura). La renumeración lineal 1-57 sirve como referencia estable para Q2 y Q3; el crosswalk exacto figura en los Anexos C y D.

Notas transversales:

- La matriz **no** enumera respuestas que revelen el estado interno del actor. Los casos 52, 53, 55 comparten códigos opacos.
- La prueba de concurrencia (caso 13) debe comprobar el **estado final en base de datos**, no solo respuestas HTTP.
- Los 14 escenarios `e2e/auth-continuity.spec.ts` (Q3-E2E-R) deben permanecer verdes (caso 45).
- Caso 46 (cero OpenAI) es barrera de coste y reproducibilidad; herencia directa del Q1 §14 caso 38 que Q1-R había perdido.

## §15 · Migración prevista + rollback

### §15.1 · Migración

**Nombre**: `supabase/migrations/<YYYYMMDD>000000_hito_9_3_2_a_actor_personal_workspace.sql` (fecha concreta se elige en 9.3.2-A-Q2 respetando el orden lexicográfico).

**Contenido** (esqueleto orientativo Q1-RR-RECT):

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

-- Función server-side atómica e idempotente (§9).
-- Firma FINAL: un único parámetro uuid. La clave interna
-- 'workspace.personal.default' se codifica en la propia función.
CREATE OR REPLACE FUNCTION spabla_v2.admin_ensure_personal_workspace(
    p_actor_id uuid
)
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

**Propiedades**:

- **Aditiva pura**: crea tabla nueva y función nueva; cero modificación de tablas existentes.
- **Backfill**: no aplica. Tabla arranca vacía.
- **Restricción**: PK `actor_id` + UNIQUE `tenant_id`.
- **RLS**: ENABLE + FORCE; cero policy para `authenticated`.
- **Grants**: solo `service_role`.
- **Compatibilidad hacia atrás**: usuarios existentes con memberships previos se onboardean lazy al invocar el endpoint.
- **Restore drill**: aplica igual sobre `restored_target` de Job C.

### §15.2 · Rollback

- **Rollback de código**: `git revert` del commit del handler + adaptador + composer + tests.
- **Rollback de esquema**: en entorno desechable, `DROP TABLE spabla_v2.actor_personal_workspace CASCADE;` + `DROP FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid);`. **En producción, NO** se hace rollback de esquema si ya hay filas legítimas.
- **Rollback funcional**: feature flag opcional que oculta la invocación al endpoint.
- **Datos creados legítimamente**: se preservan.

## §16 · Observabilidad

Métricas server-side (agregadas, sin PII):

- `onboarding.requests_total` — por resultado (`200/created`, `200/idempotent`, `401`, `500`, `503`).
- `onboarding.latency_p50/p95/p99` — sólo agregado.
- `onboarding.duplicates_prevented_total` — cuando el paso (3) devuelve existente.
- `onboarding.reactivations_total` — cuando el paso (3.b) reactiva la membership.
- `onboarding.orphan_mappings_detected_total` — cuando el paso (3.a) detecta huérfano.
- `onboarding.locale_resolved_total` — por locale canónico (contador sobre la whitelist de 13).
- `onboarding.locale_hint_rejected_total` — cuando la pista se descarta.
- `onboarding.body_fields_ignored_total` — cuando el body contiene campos no vacíos que se descartan.
- `onboarding.lifecycle_blocked_total` — por tipo interno de bloqueo (`deletion_pending`, `legal_hold`, `auth_deleted`), sin filtrar la causa al cliente.
- `onboarding.rollback_events_total` — rollbacks completos.

Cero PII en trazas. Cero `email`. Cero `actorId` en texto plano (redactado). Cero header `Accept-Language` crudo con caracteres no imprimibles. `correlationId` UUID v4 como pivot.

## §17 · Privacidad

- Cero persistencia del `email` en `spabla_v2` (I-8).
- Cero derivación del nombre visible del tenant a partir de `email`, `actor_id` u otro identificador con PII (I-4″).
- Cero traza del `email` en logs, errores, artefactos CI o base de datos SPABLA.
- La localización del texto de presentación se resuelve exclusivamente desde el catálogo cerrado server-owned (§17-bis) en el handler, no en la persistencia (que usa la clave interna fija `workspace.personal.default`).

## §17-bis · OBS-Q1-1 · Localización controlada por servidor (versión final)

Esta sección es normativa. La implementación posterior (9.3.2-A-Q2) debe cumplirla íntegramente.

1. El cliente **no** envía: `tenantId`, `actorId`, `ownerId`, `role`, nombre libre del tenant, etiqueta localizada libre, ni locale sin validar destinado directamente a persistencia.
2. El **body público** del onboarding es vacío o un objeto vacío: `{}`.
3. La **identidad actor** se deriva exclusivamente de la sesión Auth validada por el servidor (`sub` del JWT).
4. Si se utiliza `Accept-Language`, configuración del dispositivo o una preferencia del actor, se tratará únicamente como una **pista no confiable** para la **presentación** (respuesta HTTP y bootstrap). No alcanza la RPC.
5. El servidor **normalizará** esa pista y la reducirá a la whitelist cerrada de trece códigos activados.
6. **Whitelist canónica final** (verificada contra `lib/v2/client/ui-languages.ts` y `docs/phases/SPABLA_V2_FASE_9_THIRTEEN_LANGUAGES_PLAN.md` V1.1 §14, congelada 2026-08-11):

   ```
   es    Español
   ca    Català
   en    English
   fr    Français
   de    Deutsch
   it    Italiano
   pt    Português
   zh    中文（简体）
   ja    日本語
   ko    한국어
   ar    العربية
   hi    हिन्दी
   ru    Русский
   ```

   **Prohibiciones explícitas**: los códigos `eu`, `gl`, `nl`, `sv` **no** están activados en la UI de los 13 (aunque existan en el motor de 55 según ADR-005). El código `zh-Hans` **no es válido** (variante con sufijo de script rechazada por `isLangCode`, Plan V1.1 §10). Variantes regionales `es-ES`, `ja-JP`, `pt-BR`, `zh-CN` **no son canónicas**; se tratan como pistas no confiables y no alcanzan la RPC. Cualquier futura ampliación (BCP-47, variantes regionales, script tags) requiere ADR/contrato propio; **no se improvisará en Q2**.

7. Una entrada **desconocida, manipulada o no soportada** utilizará un **locale seguro por defecto** para la presentación. Propuesta: `en`. Cierre en 9.3.2-A-Q2.
8. La **RPC** persiste siempre y sin excepción la **clave interna fija** `workspace.personal.default`. No admite parámetro de texto ni de locale (§9, I-14).
9. La **presentación** localizada se resuelve en el handler HTTP mediante `PersonalWorkspaceLabelPresenter.labelFor(canonicalLocale)` que consulta el catálogo cerrado server-owned de trece idiomas.
10. La **unicidad e identidad** del espacio personal **no dependen** del nombre visible ni del locale.
11. **Cambiar el idioma** del usuario **nunca** crea otro tenant.
12. **Repetir** el onboarding en otro idioma **devuelve el mismo tenant** con el mismo `tenants.name` fijo persistido; solo cambia la presentación en la respuesta HTTP.
13. El nombre localizado es **presentación**, no identificador de seguridad.
14. La **estrategia recomendada** es persistir la clave interna fija y localizar en presentación. Q1-RR-RECT la fija normativamente en §9 e I-14; no admite alternativa "persistir texto localizado".

**Alcance**: cero migración, cero tabla nueva, cero implementación en este subhito. La aplicación técnica (catálogo, presenter, políticas) se realiza en 9.3.2-A-Q2.

## §17-ter · OBS-Q1-2 · Ciclo de vida del actor, retención, anonimización y reparación

Esta sección es normativa. Distingue exhaustivamente los estados y transiciones del actor y define el comportamiento del onboarding en cada uno. Se conserva de Q1-R con la clasificación explícita de bloqueos añadida en §17-ter I.

### §17-ter A · Sign out

- **Finaliza** la sesión Auth.
- **No** elimina datos.
- **No** desactiva memberships.
- **No** elimina tenant.
- El siguiente login del **mismo actor** (mismo `sub`) recupera el mismo espacio personal.

### §17-ter B · Desactivación de membership

- Acción **reversible** o administrativa.
- **No** equivale a eliminar la cuenta.
- El onboarding **reactiva** idempotentemente (§9 paso 3.b, §14 caso 9).
- **Política de reactivación**: el titular puede reactivar vía el onboarding. Cualquier política restrictiva requerirá flag futuro en `actor_lifecycle_state`.

### §17-ter C · Solicitud de eliminación de cuenta

- Debe **registrarse antes** de eliminar Auth cuando sea técnicamente posible.
- **Revoca** sesiones activas.
- **Impide nuevos onboardings** durante el proceso (§14 caso 52 → `503`).
- Marca `deletion_pending=true` en la tabla futura `actor_lifecycle_state`.
- Oculta o restringe contenido según política aplicable.
- **No** realiza borrado destructivo inmediato si existe periodo de gracia o retención obligatoria.
- Auditable (`correlationId`, timestamp, motivo interno). Cliente nunca ve la causa (§14 caso 52).

### §17-ter D · Eliminación definitiva de Auth

- La **ausencia de FK directa** hacia `auth.users` (por I-8) **no exime** de responsabilidad sobre mappings huérfanos.
- La eliminación de Auth **no permite** que una nueva identidad reclame automáticamente el tenant anterior.
- **Re-registro con el mismo email** = actor nuevo con `sub` distinto (§14 caso 54).
- **Email no es identidad** ni **clave de recuperación** (I-10).

### §17-ter E · Retención legal

- Separada de la retención ordinaria.
- Solo conserva lo **jurídicamente necesario**.
- Acceso restringido, finalidad definida, plazo controlado.
- **No permite** operar normalmente (§14 caso 55 → `503`).
- Duración **configurable** y **validada jurídicamente**. Cero afirmación de plazo concreto en Q1-RR-RECT.
- Marca operativa: `legal_hold=true` en `actor_lifecycle_state`.

### §17-ter F · Borrado o anonimización por categoría

Este contrato define **categorías** y **tipo de tratamiento**. Los plazos concretos y mecanismos técnicos se cierran en un subhito posterior tras dictamen jurídico.

| Categoría | Descripción | Tratamiento por defecto | Excepciones |
|---|---|---|---|
| mapping personal (`actor_personal_workspace`) | Vincula `actor_id ↔ tenant_id` | **Anonimización o disociación irreversible del `actor_id`** manteniendo el tenant, o eliminación con cascade cuidadoso | Legal hold pausa |
| memberships (`tenant_memberships`) | Rol del actor en un tenant | **Disociación** o borrado según impacto sobre tenants compartidos | Owner de compartido requiere protocolo diferenciado |
| tenant (`tenants`) | Contenedor del espacio | **Conservación** si otros actores dependen; **eliminación** si es personal huérfano tras cuarentena §17-ter G | Legal hold pausa |
| conversaciones (`conversations`) | Hilos del actor | **Anonimización** del `actor_id` o borrado por lote | Contenido compartido con terceros: disociación con protocolo |
| mensajes (`messages`) | Contenido intercambiado | **Anonimización** o borrado según política final | Contenido reportado por terceros retenido en cuarentena |
| traducciones (`message_translations`) | Datos derivados de mensajes | Tratamiento **consistente** con el mensaje origen | — |
| usage ledger (`usage_ledger`) | Contabilidad interna | **Retención limitada** para facturación y auditoría, luego agregación irreversible | Obligaciones legales pueden extender el plazo |
| auditoría (logs, correlationIds) | Trazabilidad operativa | **Retención acotada** con finalidad de seguridad; disociación del actor tras el plazo | Investigaciones activas |
| contenido compartido con terceros | Publicado o exportado | **Disociación** del actor origen; contenido persiste bajo licencia previa | Requiere política editorial específica |
| datos sujetos a obligación legal | Todo bajo legal hold | **Bloqueo**; ninguna acción de borrado o anonimización mientras dure | Solo se levanta con orden documentada |

**No se fija arbitrariamente un plazo de 30 días.** Q1-RR-RECT prohíbe expresamente afirmar que ese plazo (o cualquier otro) tenga validez jurídica sin dictamen profesional.

### §17-ter G · Mappings huérfanos — mecanismo de detección y reparación

Se define contractualmente:

- **Job periódico o reconciliación controlada** ejecutable server-side, fuera del path del onboarding.
- **Detección** de `actor_id` sin identidad Auth vigente (vía API pública, sin FK).
- **Cuarentena lógica** antes de cualquier acción destructiva (marca `orphan_detected_at` en `actor_lifecycle_state`).
- **Prohibición** de reasignación automática (I-12).
- **Idempotencia** del job.
- **Auditoría** de cada acción.
- **Respeto a legal hold**.
- **Borrado o anonimización** según política aprobada (§17-ter F).

El diseño técnico (frecuencia, backoff, dead-letter, alertas) se cierra en subhito posterior. Q1-RR-RECT fija solo el contrato.

### §17-ter H · Comportamiento del onboarding según estado del actor

Rectificado por Q1-RR-RECT con códigos concretos (elegidos dentro del alfabeto cerrado):

| Estado del actor | Comportamiento server-side | Respuesta pública fijada |
|---|---|---|
| activo (sin mapping) | Caso 5: crea | `200 OK` + `{tenantId, role}` |
| ya onboarded | Caso 6: idempotente | `200 OK` + mismo `tenantId` |
| con membership desactivada | Caso 9: reactiva en la misma transacción | `200 OK` + mismo `tenantId` |
| mapping huérfano recién detectado (§9 3.a) | Caso 10: no recrea, no reasigna, error inmediato | `500 internal` opaco |
| mapping huérfano en cuarentena (§17-ter G) | Caso 10 tras cuarentena: no atiende hasta reconciliar | `503 unavailable` opaco |
| con solicitud de eliminación en curso | Caso 52: bloqueo silencioso | `503 unavailable` opaco |
| eliminado (Auth ya borrado) | Caso 53: sesión no válida o bloqueo silencioso | `401 unauthorized` opaco |
| bajo retención legal | Caso 55: no crea ni modifica | `503 unavailable` opaco |

Ningún código enumera la causa interna. La observabilidad server-side registra la causa con `correlationId` sin filtrar al cliente.

### §17-ter I · Clasificación de decisiones legales por bloqueo real de Q2

Q1-RR-RECT clasifica explícitamente las decisiones legales identificadas en el acta Q1-R para que Q2 pueda avanzar sin esperar todas:

| Decisión | Bloquea Q2 mínimo | Bloquea activación productiva de flujos | Diferible a subhito posterior |
|---|---|---|---|
| Plazo de gracia tras `deletion_pending` | **No** | Sí (activación eliminación) | — |
| Duración y criterios de `legal_hold` | **No** | Sí (activación legal hold) | — |
| Plazo de anonimización/eliminación por categoría | **No** | Sí (activación eliminación) | — |
| Mecanismo técnico definitivo de anonimización | **No** | Sí (activación eliminación) | — |
| Política sobre contenido compartido con terceros | **No** | Sí (activación eliminación) | Sí |
| Frecuencia y ventana del job de reconciliación | **No** | Sí (producción con job automático) | Sí (procedimiento manual auditado como puente) |
| Autorización explícita del mecanismo de recuperación administrativa | **No** | Sí (activación recuperación) | Sí |
| Códigos definitivos §17-ter H | **Cerrado por Q1-RR-RECT** (ver tabla arriba) | — | — |

**Q2 mínimo** puede implementar el onboarding productivo (casos 5-9, 11-13, 17-24, 24', 25-46, 47-51, 56, 57) sin bloqueo por ninguna decisión legal. Los casos 52, 53, 55 requieren la tabla `actor_lifecycle_state` con banderas mínimas; el comportamiento observable ya está fijado en §17-ter H.

## §18 · Riesgos residuales

- **R-A** · Migración añade tabla nueva. Bloquea GO producción hasta que 9.3.2-A-Q3 valide `restore drill` completo. Mitigación: `restore drill` en CI Job C.
- **R-B** · Cambio en `bootstrap.ts:90` modifica semántico. Los 14 Q3-E2E-R deben permanecer verdes.
- **R-C** · Tenant personal puede quedar huérfano si un flujo futuro elimina la membership sin borrar la fila. Mitigación: FK `ON DELETE RESTRICT` + procedimiento §17-ter G.
- **R-D** · `admin_ensure_personal_workspace` usa `SECURITY DEFINER`. Mitigación: `SET search_path = pg_catalog, spabla_v2`.
- **R-E** · Advisory lock no persiste entre reinicios. No es problema: lock transaccional; PK garantiza unicidad.
- **R-F** · Localización mitigada estructuralmente: la unicidad no depende del nombre.
- **R-G** · Política jurídica de retención, anonimización y eliminación no está validada. Q1-RR-RECT prohíbe afirmar cumplimiento definitivo. La activación productiva de esos flujos requiere dictamen profesional (§17-ter I).
- **R-H** · Job de reconciliación tiene contrato pero no implementación. Reparación manual con auditoría explícita mientras tanto (§17-ter G).
- **R-I** · Respuestas HTTP opacas dificultan diagnóstico legítimo por operadores. Mitigación: observabilidad server-side (§16) + `correlationId`.
- **R-J** *(cerrado por Q1-RR-RECT)* · La whitelist de 13 locales queda **verificada contra el resolver activo** (§17-bis 6). El riesgo Q1-R se cierra.
- **R-K** *(cerrado por Q1-RR-RECT)* · La firma RPC queda **verificada segura de extremo a extremo** (I-14, §9). Ningún caller privilegiado puede persistir texto arbitrario. El riesgo Q1-R sobre `p_workspace_label text` se cierra.
- **R-L** *(nuevo, menor)* · La detección de mapping huérfano en el paso 3.a de la RPC introduce una consulta adicional `SELECT ... FROM tenants WHERE id = v_existing_tenant`. Impacto: coste `O(1)` con índice PK; despreciable. Mitigación: no aplica.

## §19 · Archivos previsiblemente afectados

**Nuevos** (creación en 9.3.2-A-Q2):

- `supabase/migrations/<YYYYMMDD>000000_hito_9_3_2_a_actor_personal_workspace.sql`.
- `lib/v2/server/onboarding.ts` — puertos `PersonalWorkspaceProvider` + `PersonalWorkspaceLabelPresenter` + orquestador.
- `lib/v2/server/onboarding.supabase.ts` — adaptador Supabase/service_role.
- `lib/v2/server/onboarding.test.ts` — unit tests.
- `app/api/v2/onboarding/route.ts` — handler HTTP (extrae `Accept-Language` para presentación exclusivamente).
- `app/api/v2/onboarding/route.handler.test.ts` — direct-handler tests.
- `app/api/v2/onboarding/route.http.integration.test.ts` — HTTP-frontier.
- Escenarios E2E ampliados en `e2e/auth-continuity.spec.ts` (9.3.2-A-Q3) para casos representativos.
- `docs/audit_reports/AUDIT_<fecha>_hito-9-3-2-a-onboarding.md`.

**Modificados** (mínimo):

- `lib/v2/server/bootstrap.ts:90` — cambio de `canOperate` (§11).

**Cero cambio productivo en**:

- `lib/v2/client/*` (session-refresh, fetch-with-auth-retry, auth-recovery, bootstrap-client, supabase-browser-client).
- `lib/v2/server/composition.ts`.
- `app/api/v2/bootstrap/route.ts`, `app/api/v2/messages/route.ts`, `app/api/v2/seed/route.ts`.
- Todas las tablas y funciones existentes.

Q1-RR-RECT **no** modifica ninguno: es únicamente documental.

## §20 · GO / NO-GO

**GO 9.3.2-A** cuando:

1. Migración aditiva aplica limpiamente en local y en CI (`restore drill` PASS).
2. Los 57 casos de §14 pasan verdes en Job B/D según su tipo.
3. Los 14 escenarios Q3-E2E-R permanecen verdes.
4. Cero cambio en config Supabase.
5. Cero exposición de `service_role` al cliente.
6. Cero PII persistido en `spabla_v2`.
7. Cero mensaje SQL en respuestas HTTP.
8. Cero texto libre del cliente persistido.
9. Whitelist server-side de locales coincide exactamente con `UI_LANGUAGE_OPTIONS` de los 13 activados.
10. Firma RPC de un único parámetro `p_actor_id uuid` implementada; cero parámetro de texto o locale.
11. Clave interna fija `workspace.personal.default` codificada en la propia RPC.
12. Prohibición efectiva de reclamo automático del tenant tras re-registro con mismo email.
13. Comportamiento definido para casos 52-55 (`actor_lifecycle_state` mínimo con banderas `deletion_pending`, `legal_hold`).
14. Job de reconciliación con contrato §17-ter G documentado (implementación diferible a subhito posterior con auditoría manual).
15. Dictamen jurídico documentado antes de **activar** flujos de eliminación (no bloquea Q2 mínimo).
16. Acta breve de Dirección.
17. CI oficial post-implementación attempt=1 · success · Jobs A/B/C/D success.

**NO-GO** si:

- Cualquier caso de §14 falla o queda NO EJECUTABLE.
- Regresión sobre Q3-E2E-R.
- Cambio de semántica no cubierto por §11.
- Filtración de PII o de `service_role`.
- Cualquier texto libre del cliente termina en `tenants.name` o equivalente.
- Cualquier respuesta HTTP enumera el estado interno del actor más allá del alfabeto cerrado.
- Cualquier flujo automático reasigna un tenant huérfano a otro actor.
- Cualquier caller privilegiado puede pasar texto a `admin_ensure_personal_workspace`.

## §21 · Secuencia futura de implementación

- **9.3.2-A-Q1-RR-RECT · Contrato final normativo** — **este documento**.
- **9.3.2-A-Q2 · Implementación server-side** — migración + RPC de un parámetro + `lib/v2/server/onboarding*.ts` + `app/api/v2/onboarding/route.ts` + tests unit/integration/HTTP-frontier + ajuste `bootstrap.ts:90` + catálogo cerrado server-owned de 13 + presenter + `actor_lifecycle_state` mínimo con `deletion_pending`, `legal_hold`.
- **9.3.2-A-Q3 · Barrera E2E** — ampliación de `e2e/auth-continuity.spec.ts` con casos representativos de §14 (creación, idempotencia, concurrencia, membership desactivada, prohibición de campos del cliente, verbos no permitidos, locale canónico) + regresión sobre los 14 existentes.
- **9.3.2-A-Q4 · Promoción** — fast-forward a `spabla-v2/thirteen-languages-activation`.
- **9.3.2-A-Q4-bis** — subhito posterior autorizado para el job de reconciliación de mappings huérfanos, el procedimiento operativo del ciclo de vida (§17-ter) y la activación productiva de eliminación tras dictamen jurídico.

Tras 9.3.2-A-Q4 (mínimo viable) y solo entonces, se abre la secuencia 9.3.2-B (OTP email) según el contrato marco §23.

---

## Anexo A · Comandos SQL de verificación (2026-08-22 · Supabase local · Postgres 17.6)

```sql
SELECT tablename FROM pg_tables WHERE schemaname='spabla_v2';
SELECT conname, contype, pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE conrelid::regclass::text IN ('spabla_v2.tenants','spabla_v2.tenant_memberships');
SELECT tablename, policyname, cmd, roles FROM pg_policies WHERE schemaname='spabla_v2' AND tablename IN ('tenants','tenant_memberships');
SELECT grantee, privilege_type FROM information_schema.table_privileges WHERE table_schema='spabla_v2' AND table_name IN ('tenants','tenant_memberships');
SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relnamespace='spabla_v2'::regnamespace AND relname IN ('tenants','tenant_memberships');
```

## Anexo B · Experimentos concurrencia (2026-08-22)

- **E1**: `SELECT FOR UPDATE` sobre membership inexistente → T2 no bloqueado (3.2 ms). **Observado**.
- **E2**: `pg_advisory_xact_lock(hashtextextended(actor, 42))` → T2 espera 2032 ms. **Observado**.
- **E3**: dos RPC separadas → 2 tenants creados. **Observado**.
- **E4**: `admin_add_membership` sobre existente → `23505`. **Observado**.

## Anexo C · Crosswalk 38 escenarios originales Q1 → matriz final Q1-RR-RECT

| Q1 § | Título Q1 | Final § | Estado | Nota |
|---|---|---|---|---|
| 1 | Sin `Authorization` → 401 | 1 | Preservado literal | — |
| 2 | JWT malformado → 401 | 2 | Preservado literal | — |
| 3 | JWT inválido → 401 | 3 | Preservado literal | — |
| 4 | JWT expirado → 401 | 4 | Preservado literal | — |
| 5 | Actor nuevo → 200 crea | 5 | Preservado literal | — |
| 6 | Actor ya provisionado → 200 idempotente | 6 | Preservado literal | — |
| 7 | Compartido sin personal → crea personal | 7 | Preservado literal | — |
| 8 | Personal + compartido → idempotente sobre personal | 8 | Preservado literal | — |
| 9 | Membership desactivada → reactiva | 9 | Preservado literal | — |
| 10 | Tenant personal eliminado → crea uno nuevo (fuera de alcance) | 10 + 47 | **Semántica rectificada** | Q1-RR-RECT descarta expresamente la recreación silenciosa (§5 B/D); caso 10 = mapping válido con tenant inexistente → `500`; caso 47 = corrupción manual. La evolución se documenta en §5 y §14 |
| 11 | Dos secuenciales → mismo tenant | 11 | Preservado literal | — |
| 12 | Dos concurrentes → mismo tenant | 12 | Preservado literal | — |
| 13 | 20 concurrentes | 13 | Preservado literal | — |
| 14 | Fallo tras crear tenant → rollback | 14 | Preservado literal | — |
| 15 | Fallo antes de commit → rollback | 15 | Preservado literal | — |
| 16 | 503 transitorio → reintento idempotente | 16 | Preservado literal | — |
| 17 | Envía `tenantId` → sin efecto | 17 | Preservado literal | — |
| 18 | Envía `role:admin` → sin efecto | 18 | Preservado literal | — |
| 19 | Envía `actorId` → sin efecto | 19 | Preservado literal | — |
| 20 | Body inesperado arrays/strings → 200 o 400, jamás 500 | 20, 21, 22, 23, 24 | **Ampliado** | Q1-RR-RECT desdobla el escenario en 5 casos explícitos (objeto, array, string, numérico/null, meta) todos con contrato "jamás 500 por parseo" |
| 21 | Verbos no permitidos → 404 opaco | 25, 26, 27, 28, 29 | **Ampliado** | Q1-RR-RECT lista GET/PUT/PATCH/DELETE/HEAD explícitamente |
| 22 | Post-onboarding: 1 tenant exacto | 30 | Preservado literal | — |
| 23 | Post-onboarding: 1 membership | 31 | Preservado literal | — |
| 24 | Post-fallo: cero tenant huérfano | 32 | Preservado literal | — |
| 25 | Post-fallo: cero membership huérfana | 33 | Preservado literal | — |
| 26 | Bootstrap devuelve `selectedTenantId=personal` | 34 | Preservado literal | — |
| 27 | Bootstrap con compartido más antiguo | 35 | Preservado literal | — |
| 28 | `canOperate=true` tras onboarding | 36 | Preservado literal | — |
| 29 | Cero conversación creada | 37 | Preservado literal | — |
| 30 | RLS: `authenticated` no puede `SELECT` en `actor_personal_workspace` | 38 | Preservado literal | Recuperado de la pérdida Q1-R |
| 31 | RPC no invocable por `anon` | 39 | Preservado literal | Recuperado |
| 32 | RPC no invocable por `authenticated` | 40 | Preservado literal | Recuperado |
| 33 | Logs sin PII | 41 | Preservado literal | — |
| 34 | Errores sin `SQLSTATE` | 42 | Preservado literal | — |
| 35 | Rollback DROP TABLE sin efecto sobre tenants | 43 | Preservado literal | Recuperado |
| 36 | Restore drill PASS | 44 | Preservado literal | — |
| 37 | 14 tests Q3-E2E-R permanecen verdes | 45 | Preservado literal | — |
| 38 | Cero llamadas OpenAI durante pruebas | 46 | Preservado literal | Recuperado |

**Resultado**: 38 originales → cobertura completa en 46 escenarios finales (5 originales se expanden en varios; 6 recuperados de la pérdida Q1-R; 1 con semántica rectificada). **Cero pérdida.**

## Anexo D · Crosswalk 20 casos Q1-R → matriz final Q1-RR-RECT

| Q1-R § | Título Q1-R | Final § | Estado | Nota |
|---|---|---|---|---|
| 1 | Primer onboarding | 5 + 48 | Preservado | El caso 5 final absorbe la creación; el caso 48 añade la variante con locale canónico |
| 2 | Repetición inmediata | 6 | Preservado literal | — |
| 3 | Dos solicitudes concurrentes | 12 + 13 | Preservado | Desdoblado en dos concurrentes y veinte concurrentes |
| 4 | Repetición con otro locale | 48 | **Rectificado** | El ejemplo Q1-R usaba `eu-ES` (inválido); Q1-RR-RECT usa `ja-JP` (canónico `ja`) |
| 5 | Locale desconocido | 49 | Preservado | — |
| 6 | Locale manipulado | 50 | Preservado | — |
| 7 | Etiqueta libre enviada por el cliente | 51 | Preservado | — |
| 8 | Actor sin sesión | 1-4 | Desagregado | Q1-RR-RECT restaura el desglose original por causa de rechazo del JWT |
| 9 | Membership activa | 6 | Fusionado con idempotencia | Membership activa = comportamiento del caso 6 |
| 10 | Membership desactivada | 9 | Preservado literal | — |
| 11 | Solicitud de eliminación en curso | 52 | Preservado | — |
| 12 | Actor Auth ya eliminado | 53 | Preservado | — |
| 13 | Mapping huérfano | 10 + 47 | **Rectificado** | Q1-R lo dejaba en `sin cambios; cuarentena`; Q1-RR-RECT distingue detección inmediata (10 → `500`) de cuarentena (por §17-ter G → `503`) |
| 14 | Tenant existente sin mapping | 57 | Preservado | — |
| 15 | Mapping existente sin tenant válido | 10 + 47 | **Rectificado** | Q1-R devolvía `500 internal` sin diferenciar corrupción de eliminación legítima; Q1-RR-RECT distingue B/D (§5) |
| 16 | Actor bajo legal hold | 55 | Preservado | — |
| 17 | Re-registro con el mismo email | 54 | Preservado | — |
| 18 | Fallo intermedio y rollback | 14 + 15 | Desagregado | Q1-RR-RECT restaura la distinción tras crear vs antes de commit |
| 19 | Dos actores diferentes | 56 | Preservado | — |
| 20 | Intento de enviar `tenantId`, `role` u `ownerId` | 17 + 18 + 19 | Desagregado | Q1-RR-RECT restaura los tres casos por separado |

**Resultado**: 20 casos Q1-R → cobertura completa en el conjunto final, con 3 casos rectificados semánticamente y 4 casos desagregados para mayor precisión. **Cero pérdida.**

---

**Estado del contrato final Q1-RR-RECT**: cerrado. Ninguna implementación autorizada por esta rama documental. La siguiente orden autorizada es **9.3.2-A-Q2 · Implementación server-side atómica del onboarding**, sin bloqueo por decisiones jurídicas pendientes (§17-ter I) para el alcance mínimo definido en §21.
