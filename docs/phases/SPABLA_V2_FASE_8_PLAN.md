# Plan de Fase 8 — Persistencia productiva y multi-tenancy

**Tipo**: Plan de fase.
**Versión**: V1.3.
**Fecha**: 2026-07-23.
**Estado**: APROBADO Y CONGELADO — V1.3 (fe de erratas técnica del 2026-08-05).
**Rama**: `spabla-v2/fase-8-persistence-multitenancy`.
**HEAD base**: `5b312c93322dd73aeaf3bd4bcde7f85783681e66`.
**ADR base**: `spabla-v2-adr-008-storage-multi-tenancy-2026-07-20` (ADR-008 V1.3 APROBADA Y CONGELADA).
**Base de Fase 7**: `spabla-v2-phase-7-adapters-domain-2026-07-18` @ `234f12e78172245958a9cf81c96a98cbcdb8fdb3`.

## §1. Naturaleza y alcance de Fase 8

Fase 8 es **fundacional** de persistencia productiva. "Fundacional" no significa fake, mock ni diseño teórico. Al finalizar Fase 8 existen y funcionan realmente:

- Puerto interno provider-agnostic.
- `VerifiedIdentity` + `TenantContext` como tipos brand phantom.
- Schema PostgreSQL/Supabase real.
- RLS real basada en `auth.uid()` + membresía verificada.
- Aislamiento multi-tenant estructural.
- Adaptador Supabase productivo del puerto.
- Migraciones reales versionadas.
- `usage_ledger` con idempotencia tenant-scoped.
- Pruebas E2E contra Supabase local reproducible.
- CI Supabase CLI obligatorio.
- Procedimientos operativos exigidos por ADR-008 §15.

La conexión del puerto con el flujo conversacional público de SPABLA V2 pertenece a **Fase 9** (SDK / composition root público). Fase 9 hereda un puerto ya definido, implementado y probado conforme a ADR-008 §17.

Prohibiciones estructurales de Fase 8:

- Cero modificación de `SpablaCore` ni `SpablaCoreConfig`.
- Cero composer público nuevo.
- Cero ampliación de barrels públicos.
- Cero ampliación de superficie pública del engine.
- Cero listener productivo del `EventBus` en Fase 8.
- Cero afirmación de que V1 o cualquier producto actual consume V2.

## §2. Fuentes vinculantes y precondiciones

### §2.1 Fuentes normativas

- ADR-008 V1.3 (autoritativa para persistencia, multi-tenancy, RLS, roles, ledger, migraciones).
- ADR-003 (multi-tenancy desde Fase 8, ledger, decisiones abiertas).
- ADR-004 (Foundation congelada; `AdapterRegistry` sin helpers).
- ADR-006 (dominio adapters, superficie interna).
- ADR-007 V1.1 (materialización interna, formas canónicas).
- Foundation congelada: `engine/src/types/*`.
- Fase 7 congelada: `engine/src/adapters/`.
- Release Standard §5 (tags) y §6 (procedimiento de cierre).
- Documentation Standard §9 (convenciones).

### §2.2 Distinción normativa

- **Ya cerrado por ADR-008**: tecnología (PostgreSQL vía Supabase), ubicación del puerto, precedencia de escrituras, TenantContext confiable, RLS + FORCE RLS, ledger idempotente, migraciones sin promesas absolutas.
- **Cerrado operativamente por este Plan V1.1**: firmas literales del puerto, `VerifiedIdentity` + `TenantContext`, camino único E2E, estrategia CI única (Supabase CLI), mapeo de roles Supabase reales, distribución del `usage_ledger` entre 8.2–8.4, bootstrap administrativo por `service_role`.
- **Diferido**: outbox (activación condicional futura), Auth productivo con flujo completo de invitación de usuarios, retención (ADR-003 §12), residencia regional, billing, composition root público.
- **Fuera de alcance**: SDK Fase 9, clientes, White Label, Storage Buckets, Edge Functions.

### §2.3 Precondiciones técnicas verificadas

- `tsc --noEmit` desde `engine/`: exit 0.
- Suite completa: **580/580 verde** en 22 archivos.
- Working tree limpio antes de esta ejecución.
- Foundation intacta (`engine/src/types/*`).
- Fase 7 intacta.
- `engine/package.json` sin dependencias productivas nuevas.
- V1: `@supabase/supabase-js@^2.106.2` ya instalado en `/package.json` raíz (no en engine).
- `supabase/migrations/` contiene 1 migración V1 (`20260617000000_add_message_source.sql`); cero RLS en repo.
- Cero CI configurado.

## §3. Estructura de hitos

Cinco hitos productivos:

- **Hito 8.1** — Puerto, `VerifiedIdentity`, `TenantContext` y conformidad.
- **Hito 8.2** — Schema PostgreSQL/Supabase, migraciones, RLS + FORCE RLS, roles, bootstrap administrativo y CI reproducible.
- **Hito 8.3** — Adaptador Supabase productivo con las cinco operaciones del puerto y vertical E2E contra Supabase local.
- **Hito 8.4** — Usage ledger e idempotencia tenant-scoped exhaustivas.
- **Hito 8.5** — Auditoría global, restauración ensayada, documento de cierre, publicación remota y tag.

Cada hito se aprueba con revisión técnica única (patrón Hito 7.5 aprobado por el Jefe de Proyecto).

## §4. Camino único E2E y límites con Fase 9

### §4.1 Camino único

```
Harness E2E autorizado / backend administrativo (service_role para bootstrap y purga)
        ↓
SupabasePersistence  (implementa PersistencePort — cinco operaciones)
        ↓
Supabase local (Supabase CLI + Docker)
        ↓
PostgreSQL con RLS + FORCE RLS + auth.uid() + tenant_memberships
```

### §4.2 Ownership durante Fase 8

- El harness E2E es propietario **exclusivo** de las mutaciones de prueba.
- El backend administrativo con `service_role` es propietario **exclusivo** del bootstrap de tenants y memberships y de purgas privilegiadas del ledger.
- `SupabasePersistence` es el único camino de persistencia usado por estas operaciones.
- Cero listener adicional. Cero escritura paralela. Cero dual-write. Cero outbox necesario.

### §4.3 Composición e inyección

- La implementación concreta del puerto se proporciona mediante **inyección explícita** desde el harness o desde el backend administrativo.
- Prohibido singleton global, estado global mutable, resolución oculta.
- Prohibido convertir `AdapterRegistry` en service locator (ADR-004 §2.6).
- El dominio del engine no instancia directamente `@supabase/supabase-js` ni ningún cliente de proveedor concreto (excepto dentro del propio `supabase-persistence.ts` — módulo aislado).
- Cero modificación del constructor público actual del Engine.
- Cero modificación de `SpablaCoreConfig`.

### §4.4 Frontera con Fase 9

- Fase 9 (SDK) definirá un único composition root productivo que conecte el flujo conversacional con `PersistencePort`.
- Fase 9 decide si expone el puerto directamente o lo adapta; cero duplicación de semánticas.
- Fase 11+ (clientes) consumen SDK; cero acceso directo al puerto.
- Fase 17 (API pública) consume SDK server-side.
- Fase 18 (White Label) usa el modelo multi-tenant establecido aquí.
- Si Fase 9 introduce una mutación que muta estado y publica evento en el mismo commit lógico, se activa obligatoriamente outbox (§12 + ADR-008 §7.6). Fase 8 no ejercita esa ruta.

## §5. Contratos internos de identidad y tenant

### §5.1 `VerifiedIdentity`

- Representa una identidad autenticada verificada server-side.
- Brand phantom evita construcción accidental por object literal.
- Producida sólo por factories autorizadas del harness/backend admin/tests:
  - `verifyIdentityFromSupabaseJwt(jwt)` — verifica JWT contra el JWKS de Supabase local/productivo. Retorna `VerifiedIdentity` con `source: "supabase_auth_jwt"` o `PersistenceError({code:"identity_invalid"})`.
  - `verifyIdentityFromAdminServiceRole()` — factory server-side exclusivamente accesible desde procesos administrativos con `service_role`. Retorna `source: "backend_admin_service_role"`. Nunca disponible desde clientes.
  - `verifyIdentityForTestFixture(actorId)` — factory de fixture disponible SOLO en tests; retorna `source: "test_fixture"`. Prohibida en código productivo (verificable por convención de ubicación en `*.test.ts` + test estático).
- El brand phantom es una barrera de compilación. **NO** es una garantía criptográfica ni una frontera runtime. La verdadera verificación ocurre dentro del factory (validación JWT o presencia demostrada de `service_role`).
- La verificación específica de JWT de Supabase reside en `supabase-persistence.ts` o en el harness Supabase, NO en el puerto provider-agnostic.
- **Coherencia de identidad (A2nuevo)**: `VerifiedIdentity.actorId` se deriva **exclusivamente** del claim `sub` del JWT verificado por `verifyIdentityFromSupabaseJwt`. Debe cumplirse en toda operación productiva:
  ```
  VerifiedIdentity.actorId === JWT.sub === auth.uid() efectivo
  ```
  Cero `actorId` productivo independiente del JWT. Payloads, query parameters, headers y cookies no constituyen identidad. Un JWT expirado, con `issuer`/`audience`/`aud` incorrectos, procedente de otro proyecto Supabase, o con firma inválida contra JWKS produce `PersistenceError({code:"identity_invalid"})`. Los fixtures de test (`verifyIdentityForTestFixture`) vinculan `actorId` y JWT del **mismo usuario** — cualquier test que combine `actorId` de A con JWT de B es rechazado antes de ejecutar la operación. `service_role` no participa en el flujo ordinario y no produce `VerifiedIdentity` con `source: "supabase_auth_jwt"`.

### §5.2 `TenantContext`

- Se construye a partir de `VerifiedIdentity` + `tenantId` solicitado.
- Factory: `buildTenantContext(identity: VerifiedIdentity, tenantId: TenantId): TenantContext`.
- El factory **no** valida membresía por sí mismo. La validación de membresía es responsabilidad de la **autoridad final: PostgreSQL/RLS** vía `auth.uid()` + `tenant_memberships`.
- `TenantContext` es "selección explícita del tenant que se solicita usar", no "prueba de autorización".
- Cero `role` autoritativo proporcionado por el cliente; los permisos efectivos se resuelven en la BD.

### §5.3 Modelo de amenazas

| Amenaza | Defensa |
|---|---|
| Payload de cliente declara tenant ajeno | RLS rechaza porque `auth.uid()` no tiene membresía verificada en `tenant_memberships` para ese tenant |
| Cliente construye `TenantContext` con object literal | Brand phantom impide compilación |
| Módulo interno construye `VerifiedIdentity` sin verificar | Grep estático rechaza uso de `verifyIdentityForTestFixture` fuera de `*.test.ts`; factories productivas requieren JWT verificado o `service_role` |
| Actor con membresía en tenant A solicita tenant B | RLS niega acceso (join a `tenant_memberships` falla) |
| `TenantContext` estático o reutilizado | `identity.issuedAt` permite política de frescura en el adaptador |

Durante Fase 8, los tests obtienen JWT reales de Supabase local (mediante Supabase CLI Auth admin) o utilizan `verifyIdentityForTestFixture` restringida por convención a `*.test.ts`. El adaptador productivo ejecuta operaciones bajo el JWT verificado correspondiente para que `auth.uid()` sea efectivo.

Auth productivo completo (flujo de invitación, refresh, MFA) queda **fuera de Fase 8**.

## §6. PersistencePort y tipos del dominio

Ubicación normativa: `engine/src/adapters/persistence/`. Marcador `@internal`. Cero re-export desde barrels públicos.

```ts
import type { UUID, ISOTimestamp } from "../../types/ids";
import type { LangCode } from "../../types/language";

export type TenantId = UUID;
export type ActorId = UUID;
export type ConversationId = UUID;
export type MessageId = UUID;

declare const verifiedIdentityBrand: unique symbol;
declare const tenantContextBrand: unique symbol;
declare const messageCursorBrand: unique symbol;

export type VerifiedIdentitySource =
  | "supabase_auth_jwt"
  | "backend_admin_service_role"
  | "test_fixture";

export type VerifiedIdentity = {
  readonly actorId: ActorId;
  readonly issuedAt: ISOTimestamp;
  readonly source: VerifiedIdentitySource;
  readonly [verifiedIdentityBrand]: "VerifiedIdentity";
};

export type TenantContext = {
  readonly identity: VerifiedIdentity;
  readonly tenantId: TenantId;
  readonly [tenantContextBrand]: "TenantContext";
};

export type MessageCursor = {
  readonly createdAt: ISOTimestamp;
  readonly messageId: MessageId;
  readonly [messageCursorBrand]: "MessageCursor";
};

export type PersistenceErrorCode =
  | "identity_invalid"
  | "tenant_context_invalid"
  | "membership_denied"
  | "not_found"
  | "conflict"
  | "constraint_violation"
  | "unavailable"
  | "unauthorized";

export type PersistenceError = {
  readonly code: PersistenceErrorCode;
  readonly message: string;
  readonly retryable: boolean;
};

export type ConversationRecord = {
  readonly tenantId: TenantId;
  readonly conversationId: ConversationId;
  readonly createdAt: ISOTimestamp;
  readonly createdBy: ActorId;
  readonly language: LangCode;
};

export type MessageRecord = {
  readonly tenantId: TenantId;
  readonly conversationId: ConversationId;
  readonly messageId: MessageId;
  readonly senderId: ActorId;
  readonly text: string;
  readonly language: LangCode;
  readonly createdAt: ISOTimestamp;
};

export type UsageMetricKind =
  | "turns"
  | "voice_seconds"
  | "text_chars"
  | "provider_call";

export type UsageEntryKind = "normal" | "compensation";

export type UsageEntry = {
  readonly tenantId: TenantId;
  readonly metricKind: UsageMetricKind;
  readonly quantity: number;
  readonly unit: string;
  readonly occurredAt: ISOTimestamp;
  readonly source: string;
  readonly idempotencyKey: UUID;
  readonly entryKind: UsageEntryKind;
  readonly correlationId: UUID | null;
};

export type MessagePageRequest = {
  readonly conversationId: ConversationId;
  readonly limit: number;
  readonly cursor: MessageCursor | null;
};

export type MessagePage = {
  readonly items: ReadonlyArray<MessageRecord>;
  readonly nextCursor: MessageCursor | null;
};

export type PersistencePort = {
  saveConversation(ctx: TenantContext, record: ConversationRecord): Promise<void>;
  loadConversation(ctx: TenantContext, conversationId: ConversationId): Promise<ConversationRecord | null>;
  saveMessage(ctx: TenantContext, record: MessageRecord): Promise<void>;
  listMessages(ctx: TenantContext, request: MessagePageRequest): Promise<MessagePage>;
  appendUsage(ctx: TenantContext, entry: UsageEntry): Promise<void>;
};
```

Reglas de firma:

- `export type` para todos los tipos; `PersistencePort` es structural type.
- Cero clases, cero herencia.
- Cero `any`, cero `as unknown as`, cero `@ts-ignore`. `unknown` puede aparecer sólo en fronteras de validación runtime justificadas dentro del adaptador Supabase; queda prohibido en `port.ts`.
- Compatible con `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`.
- Errores se lanzan como `PersistenceError` con `code` obligatorio.

## §7. Modelo PostgreSQL/Supabase y RLS

### §7.1 Patrón normativo de policy

Para toda tabla tenant-owned **distinta de `tenant_memberships`**:

```sql
ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <t> FORCE ROW LEVEL SECURITY;

CREATE POLICY <t>_read ON <t> FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.tenant_id = <t>.tenant_id
        AND tm.actor_id = auth.uid()
        AND tm.is_active = TRUE
    )
  );

CREATE POLICY <t>_insert ON <t> FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.tenant_id = <t>.tenant_id
        AND tm.actor_id = auth.uid()
        AND tm.is_active = TRUE
    )
  );
```

`UPDATE` ordinario: **no se declara policy genérica** que permita mutación indiscriminada por el mero hecho de ser miembro. Cada tabla tenant-owned que autorice `UPDATE` para `authenticated` debe declararlo con **permiso de dominio expresamente definido** en su propia sección (por ejemplo, sólo el `senderId` puede actualizar su propio mensaje si el dominio lo autoriza). En Fase 8 ninguna tabla tenant-owned distinta de `tenant_memberships` requiere `UPDATE` ordinario; toda mutación posterior queda cubierta por §12 y por hitos futuros.

`DELETE` ordinario: **sin policy** en Fase 8 para tablas tenant-owned. Purga privilegiada mediante `service_role` con función SECURITY DEFINER auditable (§13).

Esta forma **no es recursiva** porque la policy de `tenant_memberships` (véase §7.1bis) usa directamente `actor_id = auth.uid() AND is_active = TRUE` sin subquery a la propia tabla.

### §7.1bis Excepción normativa para `tenant_memberships` (C1nuevo + A1nuevo)

`tenant_memberships` **NO** aplica el patrón §7.1 porque generaría recursión infinita (`infinite recursion detected in policy for relation "tenant_memberships"` — PostgreSQL docs, [Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)).

Schema exige columna adicional (§9.3): `is_active BOOLEAN NOT NULL DEFAULT TRUE`.

Policies exactas:

```sql
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_memberships_select_own
ON public.tenant_memberships
FOR SELECT
TO authenticated
USING (
  actor_id = auth.uid()
  AND is_active = TRUE
);
```

**Cero policy** `INSERT`, `UPDATE`, `DELETE` ordinaria sobre `tenant_memberships` para `authenticated`. Toda mutación pasa exclusivamente por backend administrativo server-side con `service_role` y auditoría (véase §9.5 `admin_add_membership`, `admin_deactivate_membership`, y cambio futuro de `role` autorizado).

Consecuencia directa: un miembro ordinario **no puede**:

- crearse como `owner`/`admin` (no puede insertar filas de membresía);
- crear a otro actor como `owner`/`admin`;
- modificar `role` de una membresía existente;
- activar o desactivar memberships arbitrariamente.

Todas esas operaciones sensibles residen en el backend administrativo auditado.

### §7.1ter Excepción normativa para `usage_ledger` (hardening final)

`usage_ledger` es contable-crítico: cualquier escritura debe estar mediada por validación semántica (coherencia `actor/tenant`, membership activa, `metric_kind`/`unit`, `quantity`, `idempotency_key`, `source`) que RLS por sí sola no puede garantizar. Por ello se declara **excepción normativa** al patrón §7.1:

- **SELECT**: policy `usage_ledger_select` para `authenticated` con predicado `EXISTS (... tenant_memberships tm ... AND tm.actor_id = auth.uid() AND tm.is_active = TRUE)` (mismo patrón §7.1 restringido a lectura).
- **INSERT ordinario**: **cero policy** para `authenticated`. Un cliente autenticado que ejecute `INSERT INTO public.usage_ledger ...` recibe rechazo estructural.
- **UPDATE ordinario**: **cero policy** para `authenticated`. Falla estructuralmente.
- **DELETE ordinario**: **cero policy** para `authenticated`. Falla estructuralmente.
- **Escritura autorizada única**: función SECURITY DEFINER `admin_append_usage(...)` (§9.5) invocable exclusivamente por backend server-side confiable con `service_role`, con validación explícita (§9.5) y `REVOKE EXECUTE FROM PUBLIC` + `GRANT EXECUTE TO service_role`.
- **Purga**: función SECURITY DEFINER separada, invocable por `service_role`, con predicado explícito y registro de auditoría (§13).

Consecuencia directa: es estructuralmente imposible que un cliente portador de JWT `authenticated` (sea navegador, cliente móvil o proceso ordinario) inserte, modifique o elimine filas de `usage_ledger`. `appendUsage` del `PersistencePort` (§6) mantiene su firma; su implementación productiva (§10) delega necesariamente en `admin_append_usage` con la credencial privilegiada server-side.

### §7.2 Roles Supabase reales

| Capacidad | Rol | Uso en Fase 8 |
|---|---|---|
| Superusuario y DDL | `postgres` (Supabase default) | Migraciones vía credencial administrativa; no reutilizado en runtime |
| Rol de conmutación | `authenticator` | Se convierte en `authenticated` o `anon` según JWT |
| No autenticado | `anon` | No participa en operaciones tenant-owned |
| Runtime autenticado | `authenticated` | Rol asignado tras JWT verificado; recibe `auth.uid()` real; NO es owner, NO es superuser, NO tiene `BYPASSRLS` |
| Privilegio server-side | `service_role` | `BYPASSRLS`; exclusivamente en bootstrap administrativo y purga auditada; nunca en clientes ni en `NEXT_PUBLIC_*` |

Cero rol custom nuevo durante Fase 8 salvo justificación explícita cerrada en Hito 8.2.

### §7.3 Funciones SECURITY DEFINER

Toda función SECURITY DEFINER introducida por Fase 8 exige:

- Owner explícito.
- `SET search_path = pg_catalog, public` (o más restrictivo).
- Nombres cualificados dentro del cuerpo.
- `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC`.
- `GRANT EXECUTE ON FUNCTION ... TO <rol autorizado>`.
- Validación explícita de inputs.
- Logging/auditoría cuando ejecute bootstrap o purga.

### §7.4 Estrategia Supabase CLI local y en CI (M1nuevo)

**Estrategia única**: Supabase CLI + Docker en local y en GitHub Actions.

- **Local**: `supabase start` para desarrollo; JWT reales de Supabase Auth de la instancia local.
- **CI**: mismo Supabase CLI en GitHub Actions runner; migraciones desde base vacía; usuarios y JWT reales creados en el job.
- PostgreSQL puro puede utilizarse **exclusivamente** como prueba estructural adicional; **no** sustituye la suite Supabase de seguridad.
- Cero emulación de `auth.uid()` mediante GUC.
- **Pinning del binario Supabase CLI**: `supabase/config.toml` configura el **proyecto** Supabase (auth, storage, edge functions), **NO** fija la versión del binario CLI. La versión del CLI se fija exclusivamente en `.github/workflows/ci.yml` mediante la acción `supabase-community/setup-cli@v1` con parámetro `version` exacto, o mecanismo equivalente con versión exacta reproducible.
- **Prohibido `latest`** como identificador de versión.
- Hito 8.2 reporta `supabase --version` como parte del cierre; la versión exacta se selecciona y documenta antes del commit de Hito 8.2.

### §7.5 Matriz mínima de autorización (A1nuevo)

Derivada de §7.1, §7.1bis y §7.2. Fija quién puede realizar cada operación sensible durante Fase 8:

| Operación | `authenticated` con membership activa | `service_role` (backend admin) |
|---|---|---|
| Leer tenant accesible | ✅ | ✅ (bypass) |
| Crear/modificar tenant | ❌ | ✅ (bootstrap admin) |
| Leer membership propia | ✅ (predicado directo §7.1bis) | ✅ (bypass) |
| Leer memberships ajenas | ❌ | ✅ (backend administrativo) |
| Crear membership | ❌ | ✅ (`admin_add_membership`) |
| Cambiar `role` de membership | ❌ | ✅ (función admin autorizada, futura si aplica) |
| Desactivar membership (`is_active = FALSE`) | ❌ | ✅ (`admin_deactivate_membership`) |
| Leer conversaciones | ✅ | ✅ (bypass) |
| Crear conversaciones | ✅ | ✅ |
| Actualizar conversaciones | ❌ ordinariamente; **sólo con permiso de dominio expresamente definido** en la sección correspondiente | ✅ |
| Leer mensajes | ✅ | ✅ |
| Guardar mensajes | ✅ | ✅ |
| Leer `usage_ledger` | ✅ limitado según §7.1ter (miembro activo del propio tenant) | ✅ (bypass) |
| Insertar `usage_ledger` | ❌ (cero policy INSERT ordinaria; INSERT directo con JWT `authenticated` falla estructuralmente) | ✅ exclusivamente vía `admin_append_usage` (SECURITY DEFINER) invocada por backend server-side confiable con `service_role` |
| Modificar/eliminar `usage_ledger` | ❌ (cero policy UPDATE/DELETE ordinaria) | ✅ (purga administrativa SECURITY DEFINER auditada) |
| Purga administrativa del ledger | ❌ | ✅ (SECURITY DEFINER + `service_role`) |

Ningún `UPDATE` genérico se aplica automáticamente a todas las tablas por el mero hecho de ser miembro. Cada `UPDATE` autorizado requiere policy explícita en la sección de su tabla o función SECURITY DEFINER endurecida.

## §8. Hito 8.1 — Puerto, TenantContext y conformidad

### §8.1 Objetivo

Definir el contrato tipado del puerto, factories de identidad y contexto con brands, y evaluador de conformidad reutilizable (patrón Hito 7.4).

### §8.2 Archivos permitidos

- `engine/src/adapters/persistence/port.ts` — tipos + `PersistencePort` (§6).
- `engine/src/adapters/persistence/identity.ts` — `VerifiedIdentity` + factories (§5.1).
- `engine/src/adapters/persistence/tenant-context.ts` — `TenantContext` + factory (§5.2).
- `engine/src/adapters/persistence/errors.ts` — errores tipados.
- `engine/src/adapters/persistence/conformance.ts` — evaluador de conformidad.
- Tests: `port.test.ts`, `identity.test.ts`, `tenant-context.test.ts`, `conformance.test.ts`.

### §8.3 Pruebas

- **Unitarias**: brand phantom impide construcción externa (verificado por compilación esperada); errores tipados coherentes; factories rechazan input inválido.
- **Contractuales (conformance)**: 15–20 tests dedicados contra fake in-memory local (fixture de test, **no** módulo productivo).
- **Cero test contra PostgreSQL** en este hito.

### §8.4 Criterios de aceptación

- `tsc --noEmit` exit 0.
- Suite completa verde (basal 580 + nuevos tests 8.1).
- Cero re-export del puerto en `engine/src/index.ts` ni `engine/src/adapters/index.ts`.
- Cero import de `@supabase/supabase-js`.
- Cero mención de proveedor concreto en el puerto.
- JSDoc `@internal` en todos los archivos productivos nuevos.

### §8.5 Criterios de detención

- Brand phantom no tipable bajo strict mode.
- Firma exige modificar contrato público del engine.
- Fake in-memory se convierte accidentalmente en módulo productivo.

## §9. Hito 8.2 — Schema, migraciones, RLS, roles y CI

### §9.1 Objetivo

Infraestructura real que demuestra aislamiento multi-tenant estructural mediante `auth.uid()` + membresía verificada; CI Supabase reproducible.

### §9.2 Archivos permitidos

- `supabase/config.toml` — configuración Supabase CLI con versión pinneada.
- `supabase/migrations/YYYYMMDDHHMMSS_phase8_bootstrap.sql` — schema completo (`tenants`, `tenant_memberships`, `conversations`, `messages`, `usage_ledger`) + RLS + FORCE RLS + policies + funciones SECURITY DEFINER de bootstrap.
- `supabase/tests/rls_bootstrap.test.sql` — pruebas SQL de RLS con usuarios `authenticated` reales.
- `.github/workflows/ci.yml` — workflow con job engine + job integración Supabase CLI.
- Scripts auxiliares mínimos: `scripts/ci/apply-migrations.sh`, `scripts/ci/run-integration-tests.sh`.

### §9.3 Schema bootstrap

| Tabla | Ownership | PK / claves candidatas | FK compuestas |
|---|---|---|---|
| `tenants` | tenant-owned (identidad canónica: `id` como propio `tenant_id`) | `id UUID PK` | — |
| `tenant_memberships` | tenant-owned | `(tenant_id, actor_id) PK`; `role TEXT` como dato, no como autoridad RLS; `is_active BOOLEAN NOT NULL DEFAULT TRUE` | `tenant_id → tenants(id)` |
| `conversations` | tenant-owned | `id UUID`; candidata `UNIQUE(tenant_id, id)` | `tenant_id → tenants(id)` |
| `messages` | tenant-owned | `id UUID`; candidata `UNIQUE(tenant_id, id)` | `(tenant_id, conversation_id) → conversations(tenant_id, id)`; `tenant_id → tenants(id)` |
| `usage_ledger` | tenant-owned | `id UUID PK`; `UNIQUE(tenant_id, source, idempotency_key)` | `tenant_id → tenants(id)` |

Reglas estructurales (ADR-008 §8.3):

- `tenant_id UUID NOT NULL` en toda tabla tenant-owned distinta de `tenants` (donde `id` es identidad canónica).
- FK compuestas obligatorias entre tablas tenant-owned (impide cruces estructuralmente).
- `tenant_id` inmutable: policy UPDATE + invariante rechazan cambio.
- Índices: PK por defecto; adicionales cuando el patrón de query lo requiera.

### §9.4 RLS aplicada

Cada tabla tenant-owned distinta de `tenant_memberships` recibe `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + policies USING/WITH CHECK conforme al patrón normativo §7.1 (con predicado `tm.is_active = TRUE`).

**`tenant_memberships` NO aplica el patrón §7.1** — usa la excepción normativa §7.1bis (policy `tenant_memberships_select_own` con `actor_id = auth.uid() AND is_active = TRUE`; cero policy INSERT/UPDATE/DELETE ordinaria). Toda mutación pasa por backend administrativo con `service_role` (§9.5).

**`usage_ledger` NO aplica el patrón §7.1** — usa la excepción normativa §7.1ter (hardening final):

- Única policy declarada: `usage_ledger_select` para `authenticated` (predicado `EXISTS ... tenant_memberships tm ... actor_id = auth.uid() AND is_active = TRUE`).
- **Cero policy** INSERT ordinaria para `authenticated`.
- **Cero policy** UPDATE ordinaria.
- **Cero policy** DELETE ordinaria.
- Toda escritura se canaliza por función SECURITY DEFINER `admin_append_usage` (§9.5) invocada por backend server-side con `service_role`. Purga privilegiada análoga.

### §9.5 Bootstrap administrativo (M1)

Funciones SECURITY DEFINER (o script backend con `service_role`):

- `admin_create_tenant(name TEXT) RETURNS UUID` — crea tenant.
- `admin_add_membership(tenant_id UUID, actor_id UUID, role TEXT)` — añade membresía.
- `admin_deactivate_membership(tenant_id UUID, actor_id UUID)` — localiza la fila por PK `(tenant_id, actor_id)` y establece `is_active = FALSE`; no cambia `tenant_id`, `actor_id` ni `role`; idempotente si ya está inactiva; registra actor administrativo, motivo y timestamp; sólo invocable por backend administrativo con `service_role`.
- `admin_append_usage(tenant_id UUID, actor_id UUID, source TEXT, metric_kind TEXT, quantity NUMERIC, unit TEXT, idempotency_key TEXT, correlation_id TEXT, entry_kind TEXT)` — única vía de escritura autorizada para `usage_ledger` (hardening final §7.1ter). Antes de insertar valida explícitamente: (i) `tenant_id` existe en `public.tenants`; (ii) `actor_id` posee membership activa en ese `tenant_id` (`tenant_memberships.is_active = TRUE`) cuando el emisor lo exija; (iii) `source` pertenece al conjunto declarado; (iv) `metric_kind` y `unit` son coherentes según constraint CHECK del schema; (v) `quantity >= 0` si `entry_kind = 'normal'`, `quantity` con signo explícito si `entry_kind = 'compensation'`; (vi) `idempotency_key` no contiene PII (validación estructural, longitud, charset); (vii) inserción idempotente estructural mediante `UNIQUE(tenant_id, source, idempotency_key)` — reintento idéntico retorna éxito silencioso, reintento conflictivo eleva `unique_violation` traducido a `PersistenceError({code:"conflict"})`. Registra actor administrativo invocante, timestamp y `correlation_id`. Nombres SQL cualificados (`public.usage_ledger`, `public.tenants`, `public.tenant_memberships`). `SET search_path = pg_catalog, public`. `REVOKE EXECUTE FROM PUBLIC`; `GRANT EXECUTE TO service_role`. Sólo invocable desde backend server-side confiable con `service_role` (nunca cliente/navegador/`NEXT_PUBLIC_*`).

Requisitos:

- `REVOKE EXECUTE FROM PUBLIC`; `GRANT EXECUTE TO service_role`.
- Idempotentes cuando aplique.
- Auditadas.
- Impiden autocreación de owner por `authenticated`.
- `SET search_path = pg_catalog, public`.

La interfaz pública de administración queda fuera de Fase 8.

### §9.6 Migraciones y compatibilidad con V1

- Aplicación desde base vacía: la migración `phase8_bootstrap` levanta el schema completo (`supabase db reset`).
- Aplicación sobre estado real V1: la migración presente `20260617000000_add_message_source.sql` afecta a `public.messages` V1. Hito 8.2 comienza con **inventario mecánico** del schema V1 y elige explícitamente una vía documentada en el commit del hito:
  - **A. Evolucionar** la tabla existente si es compatible (expand/backfill/contract).
  - **B. Crear** tablas V2 con nombre no conflictivo (por ejemplo, esquema `spabla_v2` u homónimo con sufijo).
  - **C. Migración expand/backfill/contract autorizada** si evolución mixta.
- Cero DROP, cero rename destructivo, cero pérdida de datos.
- Cero migración destructiva en Fase 8.
- Cero idempotencia universal prometida.
- `ADD CONSTRAINT IF NOT EXISTS` NO es sintaxis válida en PostgreSQL; usar `DO $$ IF NOT EXISTS $$` cuando resulte necesario.
- Cambios incompatibles siguen expand → migrate/backfill → contract.
- Evaluación de locks por migración; `lock_timeout`/`statement_timeout` cuando aplique.
- Roll-forward preferente; rollback documentado sólo si es más seguro que reparar en línea.

### §9.7 CI Supabase CLI

`.github/workflows/ci.yml`:

- **Trigger**: `push` a `spabla-v2/**`, `pull_request` a `main`.
- **Job A — engine**: Node 24; `cd engine && npm ci && npx tsc --noEmit && npx vitest run`. Tiempo esperado <2 min.
- **Job B — integration**: instala Supabase CLI con versión pinneada mediante `supabase-community/setup-cli@v1` con parámetro `version` exacto (u otro mecanismo con versión exacta reproducible); prohibido `latest`; reporta `supabase --version` en el job; `supabase start`; health check; `supabase db reset` (aplica migraciones); crea usuarios/JWT reales; ejecuta suite SQL RLS + suite integración adaptador; cleanup. Tiempo esperado <10 min. Contraseñas efímeras; cero secretos reales.
- **Requerido para merge**:
  - Job A: en todos los cambios de `engine/**`.
  - Job B: en cambios de `supabase/**`, `engine/src/adapters/persistence/**`, `.github/workflows/**`.
- Timeout: 15 min por job.

### §9.8 Pruebas SQL RLS

Contra Supabase local, con usuarios `authenticated` reales portadores de JWT emitidos por Supabase Auth local:

- Miembro autorizado del tenant A lee sus mensajes.
- Miembro del tenant A no ve mensajes del tenant B.
- `INSERT` con `tenant_id` distinto del contexto del actor → falla.
- `UPDATE` que intenta cambiar `tenant_id` → falla.
- `DELETE` ordinario → falla (sin policy).
- Owner (`postgres`) respeta RLS por `FORCE RLS`.
- `service_role` omite RLS: documentado y usado sólo en bootstrap/purga.
- Actor `authenticated` sin membresía → cero filas visibles.
- FK compuesta rechaza referencias cross-tenant.
- Función `admin_create_tenant` sólo ejecutable por `service_role`; `authenticated` recibe error de permiso.
- **`tenant_memberships` sin recursión** (C1nuevo): actor A lee su membership activa; actor A no lee memberships de actor B; membership inactiva (`is_active = FALSE`) no concede acceso a otras tablas del tenant; cero mensaje `infinite recursion detected in policy for relation "tenant_memberships"`; actor de tenant A no obtiene ninguna fila de `tenant_memberships` con `tenant_id` de tenant B.
- **`tenant_memberships` sin elevación** (A1nuevo): `authenticated` intenta `INSERT INTO tenant_memberships (tenant_id, actor_id, role) VALUES ('mi_tenant', 'otro_actor', 'owner')` → falla (sin policy INSERT); `authenticated` intenta `UPDATE tenant_memberships SET role = 'owner'` → falla; `authenticated` intenta `DELETE FROM tenant_memberships` → falla; mismo actor puede crear memberships **exclusivamente** vía `admin_add_membership` invocada por `service_role`.
- **Coherencia identidad** (A2nuevo): test integración instancia cliente Supabase con JWT de actor A y `TenantContext` cuyo `VerifiedIdentity.actorId` corresponde a actor A → `SELECT auth.uid()` retorna el mismo actor A; test que combine `TenantContext` con `actorId = A` y JWT de actor B → rechazo antes de ejecutar.
- **`usage_ledger` sin escritura directa** (hardening final §7.1ter): `authenticated` intenta `INSERT INTO public.usage_ledger (...)` → falla (sin policy INSERT); `authenticated` intenta `UPDATE public.usage_ledger SET quantity = ...` → falla; `authenticated` intenta `DELETE FROM public.usage_ledger` → falla; `service_role` invoca `admin_append_usage(...)` con datos válidos → OK; `service_role` invoca `admin_append_usage` con `actor_id` sin membership activa en `tenant_id` (cuando la política exige membresía) → falla; `service_role` invoca `admin_append_usage` con `actor/tenant` incoherentes → falla; reintento idéntico (mismo `tenant_id`, `source`, `idempotency_key`) → éxito silencioso, cero doble inserción; reintento conflictivo (misma key + campos distintos) → `code:"conflict"`; `authenticated` intenta `EXECUTE FUNCTION public.admin_append_usage(...)` → error de permiso; grep estático en bundle cliente y en variables `NEXT_PUBLIC_*` de configuración pública → cero aparición de `service_role` o su credencial.

### §9.9 Criterios de aceptación

- Migración aplica desde base vacía sin error.
- Todos los tests SQL RLS verdes.
- Cada tabla tenant-owned tiene `rowsecurity = t` Y `forcerowsecurity = t` en `pg_class`.
- Cada tabla tenant-owned (`conversations`, `messages`) tiene policies SELECT + INSERT conforme al patrón §7.1 (cero UPDATE/DELETE ordinarios en Fase 8). `tenant_memberships` tiene únicamente `tenant_memberships_select_own` (§7.1bis). `usage_ledger` tiene **una única policy** `usage_ledger_select` para `authenticated` (§7.1ter); cero policies INSERT/UPDATE/DELETE ordinarias; toda escritura vía `admin_append_usage` (SECURITY DEFINER + `service_role`).
- CI Job A + Job B verdes.
- Versión Supabase CLI pinneada en `.github/workflows/ci.yml` (setup-cli con `version` exacto) antes del commit; `supabase --version` reportado en el job. `supabase/config.toml` configura el proyecto Supabase, no el binario CLI.
- Basal engine (580 tests) preservada.
- Inventario del schema V1 documentado en el commit; vía A/B/C seleccionada con evidencia.

### §9.10 Criterios de detención

- Supabase CLI incompatible con GitHub Actions.
- Roles reales de Supabase incompatibles con §7.2.
- CI no puede aplicar migraciones desde base vacía.
- Aparece necesidad de sintaxis PostgreSQL inexistente.
- Se requiere `NEXT_PUBLIC_SERVICE_ROLE` o equivalente (nunca autorizado).
- Colisión con V1 no resoluble por vías A/B/C.

## §10. Hito 8.3 — Adaptador Supabase y vertical E2E

### §10.1 Objetivo

`SupabasePersistence` que implementa **completamente** el `PersistencePort` (cinco operaciones) + vertical E2E que persiste y recupera datos reales bajo RLS.

### §10.2 Archivos permitidos

- `engine/src/adapters/persistence/supabase/supabase-persistence.ts` — implementación productiva.
- `engine/src/adapters/persistence/supabase/supabase-persistence.integration.test.ts` — tests E2E contra Supabase local.
- `engine/package.json` — añadir `@supabase/supabase-js` como dependencia productiva.
- `engine/package-lock.json` — regenerado.

### §10.3 Vertical E2E

- `saveConversation(ctx, record)` inserta fila.
- `saveMessage(ctx, record)` inserta fila (FK compuesta valida).
- `listMessages(ctx, request)` retorna página ordenada con cursor.
- `appendUsage(ctx, entry)` inserta entrada del ledger.
- `loadConversation(ctx, id)` retorna fila o `null`.

Fase 8 **no** afirma que un mensaje generado por V1 o por producto V2 atraviesa esta ruta. Fase 9 conectará el flujo conversacional productivo.

### §10.4 Dependencia Supabase

- `@supabase/supabase-js` autorizado en `engine/package.json` **exclusivamente en este hito**, tras verificar versión (compatible con V1) y regenerar lockfile.
- Cero import de tipos Supabase en `port.ts`, `identity.ts`, `tenant-context.ts`.
- Sólo `supabase-persistence.ts` importa `@supabase/supabase-js`.
- Cero uso de `NEXT_PUBLIC_*` para credenciales privilegiadas.
- Cliente Supabase server-side con JWT del actor autenticado para operaciones ordinarias; con `service_role` exclusivamente para bootstrap/purga administrativa.
- **Coherencia identidad (A2nuevo)**: `SupabasePersistence` instancia el cliente Supabase con **el mismo JWT** del que se derivó `VerifiedIdentity.actorId`. El adaptador garantiza `VerifiedIdentity.actorId === JWT.sub === auth.uid()` observado por PostgreSQL. Cero disociación entre identidad declarada por `TenantContext` e identidad efectiva bajo la que se ejecuta la consulta. Tests de integración validan la coincidencia comparando `actorId` del contexto con el `auth.uid()` observado por una consulta a `SELECT auth.uid()` dentro de la misma sesión.
- **Capacidad server-side privilegiada de `appendUsage` (hardening §7.1ter)**: `SupabasePersistence.appendUsage` NO utiliza el cliente Supabase ordinario del usuario. Requiere una **capacidad privilegiada server-side** (segundo cliente Supabase construido con `service_role`, o wrapper equivalente) inyectada exclusivamente en procesos de backend confiable (harness E2E de Fase 8, procesos administrativos server-side). Antes de invocar la función SQL, `appendUsage` valida sobre el `TenantContext` recibido: (i) `tenantId` presente, (ii) `actorId` derivado del JWT verificado, (iii) `membership` activa si el emisor la exige, (iv) `source` declarado, (v) `metricKind`, (vi) `quantity`, (vii) `unit`, (viii) `idempotencyKey`, (ix) coherencia de la métrica; luego delega en la función SQL `admin_append_usage` (§9.5). En construcciones sin capacidad privilegiada (por ejemplo, un `SupabasePersistence` instanciado desde un contexto de cliente-navegador), `appendUsage` eleva `PersistenceError({code:"unauthorized"})` sin intentar escritura. La credencial privilegiada **nunca** llega al cliente, al navegador, al bundle público ni a variables `NEXT_PUBLIC_*`.

### §10.5 Idempotencia de `saveMessage`

- Mismo `tenantId` + mismo `messageId` + contenido semánticamente idéntico (`conversationId`, `senderId`, `text`, `language`, `createdAt`) → **éxito idempotente silencioso**, cero duplicación.
- Mismo `tenantId` + mismo `messageId` + cualquier campo distinto → `PersistenceError({code:"conflict", retryable:false})`.
- Comparación sobre campos normativos, no serialización accidental.
- Ningún reintento cambia `conversationId`, `senderId`, `text`, `language`, `createdAt` de una fila existente.

`saveConversation` análogo. `appendUsage` con idempotencia estructural por `UNIQUE(tenantId, source, idempotencyKey)`.

### §10.6 Paginación de `listMessages`

- Cursor opaco `MessageCursor` basado en `(createdAt, messageId)` (orden total estable).
- `limit`: entero positivo; máximo permitido `500`. Valores inválidos → `code:"unauthorized"` con `retryable:false`.
- `cursor === null` → primera página desde el inicio (más antiguo).
- Orden: `ORDER BY created_at ASC, message_id ASC`.
- `nextCursor === null` cuando no hay más páginas.
- Cursor perteneciente a otra conversación/tenant → `code:"not_found"` (sin filtración por mensaje).
- Cero duplicados entre páginas garantizado por orden total.
- Desempate por `messageId` cuando hay `createdAt` idénticos.
- Índice de soporte: `messages(tenant_id, conversation_id, created_at, message_id)`.
- Cero paginación offset.

### §10.7 Pruebas de integración

- Éxito: `saveConversation` → `loadConversation` → campos verificados.
- Éxito: `saveMessage` × N → `listMessages` paginado → orden verificado, cero duplicados.
- `saveMessage` idempotente: mismo record dos veces → éxito silencioso.
- `saveMessage` conflictivo: mismo `messageId` con contenido distinto → `code:"conflict"`.
- `saveMessage` concurrente: dos inserts simultáneos → uno gana, otro `conflict`.
- Not found: `loadConversation` de ID desconocido → `null`.
- Contexto inválido: `TenantContext` con `tenantId` no existente → error apropiado.
- Ausencia de membresía: actor autenticado sin fila en `tenant_memberships` → cero filas visibles.
- Tenant cruzado: intento de leer conversación de otro tenant → cero filas.
- Indisponibilidad: red caída → `code:"unavailable", retryable:true`.
- Timeout: latencia > threshold → `code:"unavailable"`.
- Error transitorio (503) → `retryable:true`.
- `appendUsage` idempotencia estructural: mismo `(tenant_id, source, idempotency_key)` × 2 → una fila.
- `appendUsage` cross-tenant: misma `idempotency_key` en tenants distintos → ambas insertan.
- `appendUsage` sin capacidad privilegiada: `SupabasePersistence` instanciado sin `service_role` (por ejemplo, sólo cliente ordinario con JWT `authenticated`) → `code:"unauthorized"`; ninguna fila escrita.
- `appendUsage` con `actor/tenant` incoherente: `TenantContext.identity.actorId` no coincide con el actor del JWT o `tenantId` sin membership activa cuando se exija → falla antes de invocar la función SQL.
- INSERT directo con JWT `authenticated` sobre `public.usage_ledger` (bypass del adaptador) → RLS niega estructuralmente (test dirigido §9.8).
- Grep estático en cualquier bundle destinado a cliente y en configuración pública (`NEXT_PUBLIC_*`) → cero aparición de `service_role` ni credenciales privilegiadas.
- Basal engine 580 tests preservada.

### §10.8 Criterios de aceptación

- `tsc --noEmit` exit 0.
- Suite completa verde.
- CI Job A + Job B verdes.
- Cero cambio en `SpablaCore` ni `SpablaCoreConfig`.
- Cero cambio en Managers.
- Cero re-export del puerto ni del adaptador en barrels públicos.
- E2E cross-tenant fail-closed verificado con `authenticated` reales.
- `SupabasePersistence` implementa **completamente** las cinco operaciones; cero stub, cero `throw "not implemented"`.

### §10.9 Criterios de detención

- Aparece necesidad de modificar `SpablaCore`/`SpablaCoreConfig`.
- Aparece necesidad de exponer `service_role` en cliente.
- `@supabase/supabase-js` incompatible con la versión V1.
- Cursor de paginación produce duplicados o pérdidas.

## §11. Hito 8.4 — Usage ledger e idempotencia

### §11.1 Objetivo

Emisor de métricas validador + pruebas exhaustivas del `usage_ledger`.

### §11.2 Archivos permitidos

- `engine/src/adapters/persistence/usage/usage-emitter.ts` — utilidad de emisión de métricas dentro del alcance del harness E2E.
- `engine/src/adapters/persistence/usage/usage-emitter.integration.test.ts` — tests exhaustivos.
- Actualizaciones menores a `supabase-persistence.ts` si emerge necesidad de wrappers específicos.

### §11.3 Emisor validador

Como no existe todavía un flujo conversacional productivo (Fase 9), el emisor es el **harness E2E**: al ejecutar `saveMessage` en tests, el harness emite `appendUsage({metricKind:"text_chars", quantity:text.length, unit:"chars", ...})`. Se declara explícitamente como **emisor de validación**, no emisor productivo. Emisores productivos aparecerán en Fase 9. El harness opera con capacidad privilegiada server-side (`service_role`) por definición; jamás se ejerce desde cliente/navegador. La ruta efectiva es `harness → appendUsage (adaptador con capacidad privilegiada) → admin_append_usage (SECURITY DEFINER) → INSERT INTO public.usage_ledger`.

### §11.4 Pruebas exhaustivas

Contra Supabase local:

- Primer insert exitoso a través de `admin_append_usage` invocado por `service_role`.
- Reintento idéntico (`idempotency_key` repetida en mismo `(tenant, source)`) → éxito silencioso, cero doble inserción.
- Reintento conflictivo (misma key + campos distintos) → `code:"conflict"`.
- Misma `idempotency_key` en tenants diferentes → ambas insertan.
- Mismo tenant con `source` diferentes y misma key → ambas insertan.
- Rechazo cross-tenant: `admin_append_usage` con `tenant_id`/`actor_id` incoherentes → falla.
- **INSERT directo con JWT `authenticated`** sobre `public.usage_ledger` → RLS niega (cero policy INSERT ordinaria).
- Rechazo `UPDATE` ordinario con JWT `authenticated`: sin policy → falla.
- Rechazo `DELETE` ordinario con JWT `authenticated`: sin policy → falla.
- **`authenticated` intenta invocar `admin_append_usage`** directamente → error de permiso (`REVOKE EXECUTE FROM PUBLIC`).
- **`appendUsage` server-side autorizado** funciona: harness con capacidad privilegiada llama a `SupabasePersistence.appendUsage` con `TenantContext` válido → fila insertada.
- **actor/tenant incoherente** vía `appendUsage` → falla antes de escritura.
- **Membership inactiva** (`is_active = FALSE`) cuando el emisor la exige → `appendUsage` falla.
- Concurrencia: dos `appendUsage` simultáneos con misma key → uno gana por UNIQUE.
- Purga privilegiada: función SECURITY DEFINER separada invocada por `service_role` con predicado explícito + registro de auditoría.
- Coherencia `metric_kind` ↔ `unit`: constraint CHECK rechaza pares incoherentes.
- `quantity >= 0` para `entry_kind = 'normal'`; compensaciones vía `entry_kind = 'compensation'` explícito.
- Rechazo de cantidad inválida (`quantity < 0` en `entry_kind = 'normal'`) → `admin_append_usage` falla.
- Privacidad: `correlation_id` y `idempotency_key` sin PII (validación estructural en `admin_append_usage`).
- **Salvaguarda `service_role`**: grep estático sobre cualquier bundle destinado a cliente y sobre configuración pública (`NEXT_PUBLIC_*`) → cero aparición de `service_role` ni de la credencial privilegiada.

### §11.5 Criterios de aceptación

- Schema `usage_ledger` (creado en Hito 8.2) verificable.
- Al menos una métrica registrada por el emisor validador durante los tests.
- Suite integración verde.

### §11.6 Criterios de detención

- Aparece necesidad de agregación destructiva en operaciones ordinarias.
- Aparece necesidad de retención automática (fuera de alcance).

## §12. Outbox y propiedad de escrituras

- **Estado inicial en Fase 8**: outbox NO implementado.
- **Obligación automática**: introducir outbox si aparece una función que muta estado y publica un evento del bus cuya persistencia derivada dependa del mismo commit lógico.
- **Criterio mecánico**: cualquier función que ejecute `INSERT`/`UPDATE`/`DELETE` y a la vez emita un evento del bus del engine cuya persistencia derivada dependa del mismo commit → outbox obligatorio antes de cerrar el hito que lo introduzca.
- **Prohibiciones absolutas**: cero promesa de exactly-once de transporte; cero publicación de éxito antes de confirmar la escritura; consumidores serán idempotentes.
- **Durante Fase 8**: ninguna operación cumple el criterio. El único camino de escritura es el harness E2E o el backend administrativo → `SupabasePersistence` → Supabase local. Cero dual-write.
- **Fase 9 o posterior**: introducirá outbox si el composition root productivo lo requiere.

## §13. Operación, seguridad, backups y restauración

Compromisos derivados de ADR-008 §15:

| Elemento | Estado en Fase 8 |
|---|---|
| Secretos fuera del repositorio | **A. Implementado y probado**: `.env.local` no versionado; CI usa contraseñas efímeras |
| Cifrado en tránsito (TLS) | **B. Configurado en infraestructura**: Supabase provee TLS por defecto |
| Cifrado en reposo | **B. Configurado en infraestructura**: capacidad Supabase por plan; verificable |
| Mínimos privilegios | **A. Implementado**: separación de roles §7.2 |
| Rotación de credenciales | **D. Diferido**: responsable operacional; condición: antes de tráfico real |
| Backups | **B. Configurado**: Supabase provee backups automáticos según plan contratado |
| Restauración ensayada | **A. Requisito de cierre Hito 8.5** — véase §15.3 |
| Logging seguro | **A. Implementado**: cero registro de tokens, secretos, PII |
| Incident response | **D. Diferido**: responsable operacional |
| Detección de accesos cross-tenant | **A. Implementado**: policies RLS + pruebas SQL |

Cero declaración de "probado" sobre elementos únicamente documentados.

## §14. Archivos protegidos y condiciones de detención

### §14.1 Prohibidos por defecto durante toda Fase 8

- Foundation (`engine/src/types/*`).
- Hito 7.3 (`resolve-language-support{.ts,.test.ts}`).
- Hito 7.4 (`conformance.ts`, `conformance.test.ts`).
- Fase 7 índice y contrato (`engine/src/adapters/{index.ts,index.test.ts,CONTRACT.md,contract.test.ts,options-viability.test.ts}`).
- `SupabaseAdapter` marker (Foundation).
- Barrels públicos (`engine/src/index.ts`, `engine/src/adapters/index.ts`).
- ADR-008 congelada.
- Managers (`engine/src/{messaging,stt,translation,tts,session-manager,conversation-manager,participant-manager,language-manager,pipeline,pipeline-orchestrator,engine,state-machine,event-bus}/*`).
- `SpablaCore` y `SpablaCoreConfig`.
- ADRs previas y planes congelados.

### §14.2 Cambios condicionales

Si la implementación demostrara que uno debe modificarse: detener el hito, presentar causa concreta con evidencia, enumerar consumidores afectados, proponer cambio mínimo, obtener autorización expresa del Jefe, aplicar auditoría proporcional. Cero uso preventivo de esta cláusula.

### §14.3 Condiciones globales de detención

- Fuga cross-tenant detectada.
- Bypass de seguridad demostrado.
- Contrato imposible o incompatible con Foundation/ADRs.
- Contradicción normativa entre fuentes vinculantes.
- Aparece necesidad de exactly-once de transporte.
- Aparece necesidad de outbox sin autorización (fuera del criterio §12).
- Aparece necesidad de modificar archivos §14.1 sin autorización.

## §15. Hito 8.5 — Auditoría y cierre

### §15.1 Objetivo

Cerrar Fase 8 sin regresión, con documentación completa, auditoría global APTO, restauración ensayada verificada, publicación remota y tag.

### §15.2 Archivos permitidos

- `docs/phases/SPABLA_V2_FASE_8_CIERRE.md` — documento de cierre.
- `docs/audit_reports/AUDIT_YYYY-MM-DD_phase-8-persistence-multitenancy.md` — auditoría global.

### §15.3 Criterios de cierre

- Suite engine + tests SQL RLS + tests integración adaptador + emisor validador todos verdes.
- CI (Job A + Job B) verdes en GitHub Actions.
- Migraciones aplican desde base vacía sin error (`supabase db reset` limpio).
- **Restauración ensayada realizada al menos una vez en entorno no productivo, con verificación post-restauración de**:
  - Aplicación y verificación de migraciones.
  - Ownership de tablas y funciones.
  - Grants y revokes.
  - Policies presentes.
  - `ENABLE ROW LEVEL SECURITY` y `FORCE ROW LEVEL SECURITY` activos.
  - Memberships restauradas.
  - Claves tenant-scoped funcionales.
  - Funciones privilegiadas invocables sólo por `service_role`.
  - Aislamiento cross-tenant probado post-restauración.
  - Registro con fecha, resultado y evidencia.
  - Cero confusión entre backup disponible y restauración demostrada.
- Revisión de seguridad multi-tenant APTO.
- Revisión de superficie pública APTO: `engine/src/index.ts` sin cambios respecto a `234f12e` (base Fase 7).
- Foundation intacta (`git diff <tag_fase_7>..HEAD -- engine/src/types/` vacío).
- Fase 7 intacta (`git diff <tag_fase_7>..HEAD -- engine/src/adapters/{index.ts,resolve-language-support*,conformance*,contract*,options-viability*,CONTRACT.md}` vacío).
- Documento de cierre + auditoría aprobados por el Jefe de Proyecto.
- Commit de cierre creado.
- Push atómico rama + tag anotado `spabla-v2-phase-8-<slug>-<YYYY-MM-DD>` (Release Standard §5).
- Verificación remota confirmada.

### §15.4 Autorización

Push y tag requieren autorización expresa separada. Cero force, cero sobrescritura, cero `--no-verify`.

## §16. Criterios globales de aceptación

### §16.1 Compatibilidad con Foundation, Fase 7 y ADR-008

- Foundation intacta durante toda Fase 8.
- Fase 7 intacta durante toda Fase 8.
- ADR-008 V1.3 no se modifica en ninguna circunstancia.
- Cero ampliación de superficie pública del engine.
- Cero re-export del puerto ni del adaptador desde barrels públicos.

### §16.2 Compatibilidad estratégica

Fase 8 preserva sin implementar el flujo conversacional productivo:

- Idioma personal por participante (LangCode preservado).
- Chat/voz/vídeo (Managers stateless intactos).
- Grupos multilingües (schema admite futuros participantes múltiples).
- Independencia de proveedores (puerto provider-agnostic).
- Multidispositivo (cero cambio en superficie pública).
- Evolución mediante contratos estables (Foundation intacta).

Cero decisión de Fase 8 bloquea estas capacidades.

### §16.3 Riesgos y mitigaciones

- **R1** — Supabase CLI incompatible con GitHub Actions runners. **Mitigación**: verificado antes de merge Hito 8.2; alternativa documentada si emerge incompatibilidad.
- **R2** — Roles reales de Supabase difieren del mapeo §7.2. **Mitigación**: verificación en Hito 8.2 contra Supabase local; ajuste documentado en commit.
- **R3** — `@supabase/supabase-js` introduce dependencia productiva. **Mitigación**: aislamiento estricto en `supabase-persistence.ts`; cero import en el resto del engine.
- **R4** — CI lento por integración Supabase. **Mitigación**: Job A rápido + Job B integración en paralelo; requerido por tipo de cambio.
- **R5** — Modificación accidental de `SpablaCoreConfig`. **Mitigación**: §14 lo prohíbe; test de superficie pública en Hito 8.5.
- **R6** — `service_role` filtrado a cliente. **Mitigación**: §7.2 prohibición explícita; test estático en Hito 8.3.
- **R7** — Restauración de backup rompe policies/memberships. **Mitigación**: §15.3 exige verificación post-restauración antes de cierre.
- **R8** — JWT falsificado en tests. **Mitigación**: `verifyIdentityFromSupabaseJwt` verifica contra JWKS de Supabase local; `verifyIdentityForTestFixture` restringida por convención a `*.test.ts`.
- **R9** — Bootstrap invocado por actor no autorizado. **Mitigación**: `REVOKE EXECUTE FROM PUBLIC` + `GRANT EXECUTE TO service_role`.
- **R10** — Colisión con migración V1 sobre `public.messages`. **Mitigación**: §9.6 exige inventario mecánico y vía A/B/C documentada en el commit.

### §16.4 Estrategia de revisión del Plan

Este Plan V1.1 requiere **una única revisión final** antes de aprobarse.

Flujo:

1. Redacción V1.0 (previa).
2. Auditoría V1.0 (previa).
3. V1.1 reconstruida limpiamente (esta ejecución).
4. Revisión final (siguiente ejecución autorizada).
5. Corrección quirúrgica única si aparecen defectos materiales acotados.
6. Aprobación + commit documental aislado.
7. Implementación inmediata Hito 8.1 en ejecuciones separadas.

Cero ADR adicional salvo decisión arquitectónica nueva demostrada.

## §17. Historial

- **V1.0 (2026-07-20)** — Redacción inicial del Plan de Fase 8. Recibió veredicto REQUIERE REVISIÓN ARQUITECTÓNICA PARCIAL en revisión técnica, con hallazgos: C1 (RLS insegura por `app.current_tenant`), C2 (composición sin ruta productiva), A1 (EventBus vs escritura síncrona contradictorios), A2 (`membershipVerified` booleano sin frontera), A3 (divergencia CI/producción), A4 (`appendUsage` en firma pero implementación posterior), M1 (bootstrap tenants no resuelto), M2 (idempotencia `saveMessage` ambigua), M3 (`listMessages` sin paginación), M4 (hardening SQL), M5 (restauración ensayada fuera de criterios de cierre), M6 (referencia interna incorrecta).
- **V1.1 (2026-07-23)** — Reconstrucción limpia autorizada por el Jefe de Proyecto tras clasificación mecánica de la primera tentativa de V1.1 como corrupta. La reconstrucción reagrupa el documento en 17 secciones normativas únicas conforme a la estructura fijada. Aplica íntegramente las 12 correcciones:
  - **C1**: eliminación completa de `app.current_tenant`, `current_tenant()`, `current_setting` para tenant y GUC personalizada de tenant. Policies productivas basadas en `auth.uid()` + join a `tenant_memberships` (§7.1). Fuente de identidad = JWT verificado por Supabase Auth real. Cero mención normativa activa del GUC eliminado.
  - **C2**: Fase 8 declarada fundacional con adaptador productivo E2E (§1, §4.1). Camino único harness/backend admin → `SupabasePersistence` → Supabase local → RLS real. Fase 9 hereda puerto ya definido, implementado y probado. Cero modificación de `SpablaCore`/`SpablaCoreConfig`.
  - **A1**: `EventBus` productivo eliminado del alcance Fase 8. Cero listener, cero dual-write, cero outbox necesario. Ownership único por harness/backend admin (§4.2).
  - **A2**: `membershipVerified` eliminado. Introducidos `VerifiedIdentity` (§5.1) y `TenantContext` (§5.2) como brands separados. Autoridad final de aislamiento asignada a PostgreSQL/RLS. Verificación específica de JWT Supabase confinada al adaptador o al harness, fuera del puerto provider-agnostic. Cero mención normativa activa de `membershipVerified`.
  - **A3**: estrategia única Supabase CLI local y en CI (§7.4). Cero divergencia CI/producción. Cero emulación de `auth.uid()` mediante GUC.
  - **A4**: schema `usage_ledger` adelantado a Hito 8.2 (§9.3); `appendUsage` implementado en Hito 8.3 junto con las otras 4 operaciones (§10); Hito 8.4 se dedica a emisor validador + tests exhaustivos (§11). Cero stub en `SupabasePersistence`.
  - **M1**: bootstrap administrativo con `service_role` + funciones SECURITY DEFINER (§9.5). Cero autocreación por `authenticated`.
  - **M2**: idempotencia semántica de `saveMessage` fijada (§10.5).
  - **M3**: paginación con `MessageCursor` opaco y orden total estable (§6 + §10.6). Cero paginación offset.
  - **M4**: hardening SQL para toda función SECURITY DEFINER (§7.3): `SET search_path`, nombres cualificados, `REVOKE EXECUTE FROM PUBLIC`, `GRANT` mínimo.
  - **M5**: restauración ensayada como criterio obligatorio de cierre Hito 8.5 (§15.3) con verificación estructural post-restauración.
  - **M6**: referencias internas actualizadas y coherentes con la nueva numeración §1–§17.
- **Nota sobre la reconstrucción**: la primera tentativa de V1.1 fue reportada como mecánicamente corrupta por el Jefe de Proyecto. La verificación forense mecánica realizada por el agente sobre el archivo real no reprodujo esa corrupción, pero el Jefe autorizó reagrupar §22 → §17 preservando el contenido normativo previo. Esta V1.1 es esa reagrupación limpia. ADR-008 V1.3 permanece intacta durante toda la reconstrucción.
- **V1.2 (2026-07-23)** — Corrección final limitada. Revisión final V1.1 detectó 1 CRÍTICO + 2 ALTOS + 2 MEDIOS nuevos; corregidos quirúrgicamente sin reabrir decisiones centrales:
  - **C1nuevo** (§7.1 + §7.1bis + §9.3): excepción normativa para `tenant_memberships` con policy `tenant_memberships_select_own` de predicado directo `actor_id = auth.uid() AND is_active = TRUE`; cero recursión infinita; schema añade `is_active BOOLEAN NOT NULL DEFAULT TRUE`; patrón §7.1 extendido con `tm.is_active = TRUE`.
  - **A1nuevo** (§7.1bis + §7.5 + §9.4): cero policy INSERT/UPDATE/DELETE ordinaria sobre `tenant_memberships`; toda mutación exclusivamente vía backend administrativo `service_role`; matriz de autorización §7.5 fija operación → rol autorizado; cero UPDATE genérico indiscriminado.
  - **A2nuevo** (§5.1 + §10.4): coherencia obligatoria `VerifiedIdentity.actorId === JWT.sub === auth.uid()` efectivo; cero disociación permitida; fixtures vinculan actorId y JWT del mismo usuario; test que combine identidades divergentes es rechazado.
  - **M1nuevo** (§7.4 + §9.7): `supabase/config.toml` configura el proyecto, no el binario CLI; versión del CLI pinneada exclusivamente en `.github/workflows/ci.yml` mediante `supabase-community/setup-cli@v1` con `version` exacto; prohibido `latest`; Hito 8.2 reporta `supabase --version`.
  - **M2nuevo** (§9.5): firma completa `admin_deactivate_membership(tenant_id UUID, actor_id UUID)` con semántica definida (localiza PK, `is_active = FALSE`, idempotente, audita).
- **Decisión central preservada**: PostgreSQL vía Supabase + puerto interno provider-agnostic. Sin cambios en Foundation, ADRs previas, Fase 7, `SpablaCore`, `SpablaCoreConfig`, Managers, barrels públicos.
- **Aprobación y congelación V1.2 (2026-07-23)**: comprobación final satisfactoria. C1/C2, A1–A4, M1–M6 y los cinco hallazgos finales (C1nuevo, A1nuevo, A2nuevo, M1nuevo, M2nuevo) resueltos. Hardening adicional del `usage_ledger` (§7.1ter + §9.4 + §9.5 `admin_append_usage` + §9.8 + §9.9 + §10.4 + §10.7 + §11.3 + §11.4): cero escritura directa desde `authenticated` (cero policy INSERT/UPDATE/DELETE ordinaria); única lectura autorizada `usage_ledger_select` con predicado de membresía activa; `appendUsage` exclusivamente server-side vía `admin_append_usage` SECURITY DEFINER invocada por backend confiable con `service_role`; credencial privilegiada nunca en cliente/`NEXT_PUBLIC_*`. Plan autorizado para implementación inmediata del Hito 8.1.
- **V1.3 — Fe de erratas técnica (2026-08-05)**: baseline de ejecución actualizado en §9.7 de Node 20 (EOL 2026-04-30) a Node 24 LTS. Cero cambio arquitectónico, funcional o de alcance. Cero modificación de RLS, migraciones, contratos, criterios de aceptación ni historial anterior. Autorizada por el Jefe de Proyecto para eliminar la contradicción normativa detectada durante la implementación del Hito 8.3.
