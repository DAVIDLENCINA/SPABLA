# ADR-008 — Storage productivo y multi-tenancy

**Tipo**: Decisión (ADR).
**Versión**: V1.3.
**Fecha**: 2026-07-20.
**Estado**: APROBADA Y CONGELADA — V1.3 (verificación técnica final APTO y autorización expresa del Jefe de Proyecto el 2026-07-20).
**Base**: `spabla-v2-phase-7-adapters-domain-2026-07-18` @ `234f12e`.
**Depende de**: ADR-003, ADR-004, ADR-005, ADR-006, ADR-007 V1.1.

## §1. Contexto

ADR-003 §11 delega a Fase 8 la decisión de la tecnología concreta de persistencia mediante ADR específica. ADR-003 §8 fija `tenant_id` obligatorio desde Fase 8 y aislamiento cross-tenant vía el mecanismo del adapter. ADR-003 §13 fija `usage_ledger` desde Fase 8 para acumular turnos, minutos de voz y chars de texto. El engine V2 (Fases 1–7 congeladas en `234f12e`) es stateless por sesión y consume adapters por kind. Foundation Evolution 2 congeló `AdapterBase<K>` con `kind: "supabase"` reservado como marker sin contrato productivo.

## §2. Problema

Fase 8 debe introducir persistencia productiva sin acoplar el engine a un proveedor, sin ampliar Foundation, sin violar el contrato de superficie pública del engine (ADR-006 §3, §4), y sin regresar decisiones ya congeladas. La ausencia de un puerto interno definido y de un modelo multi-tenant obligatorio hoy bloquea la Fase 9 (SDK) y las fases de cliente posteriores.

## §3. Fuerzas y restricciones

- Foundation congelada por Foundation Evolution 2. No se autoriza modificarla.
- ADR-004 §2.6 prohíbe helpers de resolución en `AdapterRegistry`.
- ADR-006 §3, §4 prohíben duplicar superficie pública y re-exportar mecanismos internos.
- ADR-003 §11 sitúa la definición pública de `StorageAdapter` en el SDK (Fase 9), no en Fase 8.
- Adapters legacy (fakes de Fases 1–6) y `SupabaseAdapter` marker deben seguir siendo válidos.
- Multi-tenancy debe ser irreversible desde el schema inicial (ADR-003 §8, §Consecuencias).
- Cero introducción de proveedores concretos en Foundation ni en el barrel público del engine.

## §4. Decisión sobre tecnología

**Elegido: PostgreSQL gestionado vía Supabase** como primera implementación productiva, detrás de un puerto interno provider-agnostic definido por el propio dominio.

Justificación evaluada frente a "PostgreSQL administrado sin Supabase":

- **Aislamiento multi-tenant**: Row-Level Security (RLS) es capacidad estándar de PostgreSQL (PostgreSQL docs, [Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)). Supabase provee la infraestructura y advertencias en Dashboard cuando una tabla en schema expuesto no tiene RLS (Supabase docs, [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)); **su activación por tabla NO es automática** en todos los caminos de creación (SQL Editor, migraciones). Debe habilitarse explícitamente por tabla mediante `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`; los defaults, advertencias o comportamiento del Dashboard no son garantía normativa.
- **Transacciones/consistencia/índices/migraciones**: PostgreSQL cumple.
- **Observabilidad + backups + recuperación**: Supabase declara backups y logs cuya disponibilidad exacta depende del plan contratado (Supabase docs, [Backups](https://supabase.com/docs/guides/platform/backups)); PostgreSQL puro requiere infra propia.
- **Residencia regional futura**: ambos permiten regiones múltiples; decisión diferida (ADR-003 Decisión abierta #11).
- **Portabilidad**: PostgreSQL estándar preserva portabilidad; Supabase añade convención sobre `auth.uid()`, RLS y storage buckets aislable tras el puerto.
- **Coste operativo**: Supabase acelera Fase 8 sin renunciar a la portabilidad si el puerto es estricto.
- **Experiencia V1**: SPABLA V1 aporta experiencia operativa con Supabase.
- **Escalabilidad inicial (miles de usuarios)**: PostgreSQL/Supabase suficiente para MVP; dimensionamiento y pooling se verifican en Plan Fase 8.
- **Riesgo de vendor lock-in**: mitigado por el puerto interno y por elegir SQL portable (evitar features exclusivos de Supabase salvo RLS y Auth, que son PostgreSQL nativo + convención documentada).

La verificación empírica de capacidades operativas contratadas (retención de backups, PITR, región, límites de conexiones) se realiza en Plan Fase 8 antes de producción; esta ADR no afirma ninguna capacidad como garantía absoluta.

Prohibiciones:
- Cero uso de features específicos de Supabase que no sean expresables sobre PostgreSQL estándar dentro del puerto de persistencia. Auth y Storage Buckets quedan fuera de su alcance y corresponden a capacidades futuras separadas, pendientes de sus contratos o fases correspondientes; ADR-003 mantiene abierta la decisión sobre proveedores secundarios de Auth.
- Cero acoplamiento del engine a `@supabase/supabase-js`. La dependencia vive exclusivamente en la implementación concreta del puerto, fuera del dominio del engine.

## §5. Puerto interno de persistencia y ubicación

**Puerto interno** definido en Fase 8 dentro del dominio interno `engine/src/adapters/persistence/` (nuevo subdirectorio), siguiendo el patrón congelado por Fase 7. Marcador `@internal` y prohibición de re-export desde barrels públicos hasta Fase 9.

Alternativas evaluadas:
- **A. Foundation**: descartada. Foundation congelada.
- **B. Dominio interno del engine (recomendado)**: coherente con ADR-006 §1.
- **C. SDK Fase 9 exclusivo**: descartada porque ADR-003 §11 exige contrato utilizable desde el engine event bus antes de que exista el SDK.
- **D. Interno en Fase 8 + exposición pública ordenada en Fase 9 (elegida)**: puerto interno en `engine/src/adapters/persistence/` durante Fase 8; Fase 9 decidirá si el SDK re-expresa el mismo contrato o lo adapta, sin duplicar semánticas.

### 5.1 Composición e inyección (A2)

- La implementación concreta del puerto se proporciona mediante **inyección explícita desde el composition root** (factory o instancia, según decida Plan Fase 8).
- **Prohibido** singleton global, estado global mutable y resolución oculta.
- **Prohibido** convertir `AdapterRegistry` en service locator (ADR-004 §2.6).
- El dominio del engine **no instancia directamente** `@supabase/supabase-js` ni ningún cliente de proveedor concreto.
- Esta ADR **no obliga** a modificar el constructor público actual del Engine. Plan Fase 8 decidirá el punto interno de inyección preservando contratos públicos congelados.
- Cero anticipación de firmas TypeScript en esta ADR.

## §6. Relación con `SupabaseAdapter`

- El **nuevo puerto interno** de persistencia (§5) es la **única superficie productiva de persistencia** durante Fase 8.
- `SupabaseAdapter extends AdapterBase<"supabase">` (Foundation `engine/src/types/adapters.ts:147`) permanece **intacto como marker congelado de compatibilidad**. No se modifica, no se elimina, no se extiende.
- El marker **no participa** en selección, instanciación ni operaciones productivas de Fase 8. Cero envoltorio en Fase 8.
- Cero segunda jerarquía productiva; el puerto vive fuera de `AdapterBase<K>`.
- Cualquier evolución productiva o sustitución futura del marker requerirá **Foundation Evolution 3 explícita** o ADR posterior específica.
- Fase 9 decidirá su superficie pública del SDK sin obligar a modificar el marker.

## §7. Flujo Engine / event bus / persistencia (C1)

Decisiones vinculantes para Plan Fase 8:

1. **Dueño único por mutación**: cada tipo de mutación tiene un **único camino autoritativo** (síncrono o event-driven), fijado en Plan Fase 8. Ambos caminos como propietarios simultáneos de la misma escritura **están prohibidos**.
2. **Prohibición de dual-write ambiguo**: no ejecutar la misma mutación en paralelo por operación directa y por consumo del mismo hecho desde el event bus.
3. **Lecturas**: pueden ser directas a través del puerto.
4. **Escrituras síncronas autoritativas**:
   - La operación **sólo se considera confirmada** cuando Storage confirma.
   - Ante indisponibilidad de Storage: **fallo explícito y cerrado**; el Engine no confirma escrituras no persistidas.
   - Cero pérdida silenciosa.
5. **Consumidores event-driven**:
   - Semántica mínima **at-least-once**.
   - **Procesamiento idempotente** obligatorio.
   - Identidad estable del evento (`event_id`) para deduplicación.
   - Reintentos limitados y observables.
   - Reconciliación explícita.
   - Dead-letter o mecanismo equivalente para eventos no procesables.
   - Orden garantizado cuando la semántica del agregado lo requiera (por conversación/sesión).
6. **Mitigación del dual-write no atómico** (transacción que muta estado y publica evento): Fase 8 lo evitará mediante **transactional outbox** o mecanismo con garantías equivalentes demostrables.
7. **Backpressure, reintentos y fallos** nunca pueden producir pérdida silenciosa; comportamiento explícito y observable.
8. La ADR **no promete exactly-once de transporte**. La garantía efectiva contra duplicados se obtiene por idempotencia (§10).

Plan Fase 8 fijará qué mutaciones son síncronas y cuáles event-driven respetando (1)–(8).

## §8. Modelo multi-tenant y contexto confiable

### 8.1 `tenant_id` obligatorio

- `tenant_id: UUID NOT NULL` en toda entidad **tenant-owned** (conversaciones, mensajes, sesiones, participantes, telemetría por tenant, uso).
- `tenant_id` es UUID inmutable; no reutilizable tras baja.
- Índices tenant-scoped cuando el patrón de query lo requiera; claves únicas `UNIQUE(tenant_id, natural_key)`.

### 8.2 TenantContext confiable (A3 + O2 parcial)

- `TenantContext` es un **contexto confiable**, no un contenedor libre de UUID.
- Construcción **exclusivamente server-side**; deriva de autenticación y autorización verificadas.
- Distingue **identidad del usuario, tenant activo, permisos y procedencia**.
- Un tenant solicitado se **valida contra membresía/autorización** antes de ser aceptado; conocer un UUID no autoriza su uso.
- Payloads, query parameters, headers y claims no verificados **nunca** son autoridad para elegir tenant.
- Ausencia, falsificación o incoherencia producen **fallo cerrado**.
- **Jobs y workers** reciben contexto verificable derivado de una **identidad de servicio**, no un UUID libre.
- **Operaciones administrativas cross-tenant** utilizan un camino **separado, privilegiado, explícito, mínimo y auditable**; queda fuera del puerto ordinario.
- **Presencia tipada no equivale a confianza**: la firma exige el parámetro; la validez la garantiza la capa de autenticación/autorización.
- **Cero tenant por defecto** en producción; cero fallback silencioso.
- **Cambio de tenant activo** requiere **nueva autorización server-side**: no se reutilizan permisos, cachés, conexiones scoped ni contexto del tenant anterior; cualquier contexto previo queda invalidado. Pertenecer a varios tenants **no autoriza consultas combinadas** desde el puerto ordinario.
- Diseño concreto de Auth queda fuera de esta ADR.

### 8.3 Aislamiento estructural (M1)

- Las relaciones tenant-owned **impiden cruces estructuralmente en BD**.
- **Forma normativa preferente**: clave candidata `(tenant_id, id)` + foreign key compuesta `(tenant_id, referenced_id) → (tenant_id, id)`.
- Se admite otra solución **sólo** si Plan Fase 8 demuestra **equivalencia estructural en BD** (no aplicacional).
- Una comprobación exclusivamente aplicacional o un test aislado **no es equivalente**.

### 8.4 Tablas globales controladas (M2)

- Toda tabla global requiere clasificación y **justificación explícitas**.
- **Revisión de seguridad obligatoria** por cada tabla clasificada como global.
- **Inventario versionado y auditable** de tablas globales aprobadas.
- **Prohibido** reclasificar una tabla tenant-owned como global por comodidad.
- Una reclasificación tenant-owned → global requerirá **ADR posterior** o cambio normativo equivalente.
- **Por defecto**, cualquier entidad con datos de usuarios, conversaciones, sesiones, mensajes, consumo o telemetría es tenant-owned.

## §9. Aislamiento, roles y seguridad (M6 + M7)

### 9.1 RLS explícita por tabla

- **RLS obligatoria** en todas las tablas tenant-owned. Cada migración que crea una tabla tenant-owned debe ejecutar explícitamente `ALTER TABLE <t> ENABLE ROW LEVEL SECURITY`, con independencia de defaults o advertencias del Dashboard.
- Políticas `USING` (lectura) y `WITH CHECK` (escritura) verificando `tenant_id = current_tenant()` o equivalente sobre `auth.uid()` + join a membresía (PostgreSQL docs, [Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)).
- Plan Fase 8 debe **verificar mecánicamente** que ninguna tabla tenant-owned queda sin RLS habilitada.
- RLS es defensa en profundidad, **NO única defensa**. El puerto valida `tenant_id` en cada operación antes de invocar la BD.

### 9.2 Propietario y `FORCE ROW LEVEL SECURITY`

- En PostgreSQL, el **propietario de una tabla omite RLS por defecto**. Toda tabla tenant-owned debe aplicar `ALTER TABLE <t> FORCE ROW LEVEL SECURITY` (PostgreSQL docs, [`ALTER TABLE`](https://www.postgresql.org/docs/current/sql-altertable.html)) salvo excepción técnica documentada y aprobada por seguridad.
- **Límites de `FORCE ROW LEVEL SECURITY`**: NO neutraliza superusuarios ni roles con `BYPASSRLS`; no debe presentarse como defensa suficiente frente a credenciales privilegiadas.
- El Plan Fase 8 debe probar el comportamiento efectivo del propietario y de los roles runtime bajo RLS.

### 9.3 Separación de roles

- El **rol runtime ordinario del puerto** NO es propietario de tablas, NO es superusuario, NO tiene `BYPASSRLS`.
- Las **migraciones se ejecutan bajo un rol separado** con privilegios controlados; sus credenciales no se reutilizan en runtime.
- **`service_role` o equivalentes** nunca llegan a clientes; su uso server-side excepcional se **limita, registra y audita**.
- Cualquier operación privilegiada aplica **además** filtros tenant explícitos cuando corresponda.
- Cero secretos hardcoded en el engine ni en tests.

### 9.4 Tests obligatorios (asignados a Fase 8)

Pruebas negativas cross-tenant con:
- rol ordinario,
- propietario de tabla,
- rol privilegiado (`service_role` o `BYPASSRLS`),
- policies `USING` y `WITH CHECK` verificadas ambas.

## §10. Usage ledger

### 10.1 Estructura mínima

- Tabla `usage_ledger` (o equivalente): **inmutable para operaciones ordinarias**.
- Columnas mínimas: `id UUID PK`, `tenant_id UUID NOT NULL`, `metric_kind ENUM` (`turns`, `voice_seconds`, `text_chars`, `provider_call`), `quantity NUMERIC NOT NULL`, `unit TEXT NOT NULL`, `occurred_at TIMESTAMPTZ NOT NULL`, `correlation_id UUID`, `source TEXT NOT NULL`, `idempotency_key UUID NOT NULL`, `entry_kind ENUM` (`normal`, `compensation`).
- **Trazabilidad**: `correlation_id` enlaza con eventos del bus del engine.
- Agregación derivada exclusivamente mediante `SELECT` o materialized views recomputables; **prohibida** cualquier agregación destructiva ordinaria.

### 10.2 Idempotencia tenant-scoped (M3)

- Restricción normativa preferente: `UNIQUE(tenant_id, source, idempotency_key)` o garantía estructural demostrablemente equivalente.
- `source` es un **namespace provider-agnostic** del productor o flujo (no un nombre comercial de proveedor).
- Debe impedir: doble contabilización dentro del ámbito correcto, colisiones cross-tenant, filtración lateral por errores de unicidad.

### 10.3 Integridad y semántica temporal (M4)

- `quantity >= 0` para entradas `entry_kind = normal` (constraint o equivalente).
- Compensaciones utilizan `entry_kind = compensation` y son **explícitas y auditables**; no se usan cantidades negativas ambiguas como mecanismo de corrección.
- Coherencia entre `metric_kind` y `unit` mediante enum de pares válidos o constraint equivalente.
- `occurred_at` representa **cuándo ocurrió el consumo**.
- Recepción tardía **nunca reescribe** silenciosamente periodos cerrados; agregación por ventanas explícitas.
- Toda reasignación o ajuste debe dejar traza.
- `correlation_id` y `idempotency_key` minimizan datos personales.

### 10.4 Retención, purga y privacidad (A4)

- Ninguna operación de negocio ordinaria puede ejecutar `UPDATE` o `DELETE`.
- Correcciones contables se representan mediante **entradas compensatorias** (§10.3), no mutación.
- Puede existir un **mecanismo administrativo excepcional** de retención o purga por obligación legal, privacidad o minimización (GDPR, CCPA y equivalentes).
- Ese mecanismo es **privilegiado, controlado y auditable**; su uso deja evidencia sin conservar el contenido personal que se elimina.
- La **política concreta** de retención y privacidad se decidirá posteriormente conforme a ADR-003 §12.
- **Append-only no significa conservación ilimitada**.
- Cuotas y facturación completa **fuera de alcance** de esta ADR y de Fase 8.

## §11. Migraciones y evolución de schema (M8)

### 11.1 Versionado

- Migraciones ordenadas y versionadas bajo `supabase/migrations/YYYYMMDDHHMMSS_<slug>.sql` (convención V1 preservada).
- Nombre determinista, registro de migraciones aplicadas (responsabilidad del ejecutor).
- Cada versión se ejecuta **una sola vez en condiciones normales**; no se exige idempotencia artificial universal.

### 11.2 Reparación y reintentos

- Una migración fallida requiere estrategia explícita de **roll-forward o reparación**; scripts de reparación se separan de migraciones ordinarias.
- Si una operación necesita ser retry-safe, debe **comprobar el estado real del schema** (consulta a `pg_catalog`, bloque `DO`), no confiar en sintaxis absoluta.
- PostgreSQL **NO soporta** `ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS` como sintaxis directa; para constraints condicionales se usa el patrón `DO $$ IF NOT EXISTS ... $$` (mismo estilo que la migración V1 `20260617000000_add_message_source.sql`).
- Evitar patrones condicionales cuando el sistema de migraciones versionadas ya garantiza ejecución única.

### 11.3 Bloqueos

- Cada migración **evalúa locks, duración y efecto** sobre lecturas/escrituras.
- Establecer `lock_timeout` y `statement_timeout` apropiados cuando corresponda.
- **No se promete cero bloqueo**; depende de la operación específica.
- Cambios incompatibles siguen **expand → migrate/backfill → contract**.
- Operaciones potencialmente largas requieren ventana, observabilidad y plan de recuperación.

### 11.4 Herramientas seguras condicionales

Se recomiendan como **opciones**, no como obligación universal:
- `ADD CONSTRAINT ... NOT VALID` seguido de `VALIDATE CONSTRAINT`, sólo para tipos de constraint compatibles.
- `CREATE INDEX CONCURRENTLY` cuando resulte compatible con el ejecutor y fuera de una transacción que lo prohíba.
- Columnas nuevas sin defaults volátiles.
- Backfills por lotes.
- Validación posterior.

Ninguna de estas técnicas se declara aplicable universalmente.

### 11.5 Recuperación

- Backup y restauración **verificados antes** de migraciones de riesgo.
- Roll-forward preferente cuando sea más seguro que rollback en línea.
- Rollback documentado cuando sea viable y seguro.
- **Migraciones destructivas** requieren autorización específica; cuando alteren contratos irreversibles, ADR adicional.
- Toda migración relevante se valida primero en entorno **no productivo representativo**.

## §12. Portabilidad y límites del proveedor

- Toda query que use features específicos de Supabase (RLS con `auth.uid()`, storage buckets) queda **aislada tras el puerto y documentada**.
- El resto del schema se expresa en PostgreSQL estándar.
- **Prohibido** usar Edge Functions de Supabase para lógica de dominio; la lógica vive en el engine.
- **Prohibido** acoplar el schema a Supabase Realtime; V2 puede aprovecharlo pero desacoplado tras el puerto.

## §13. Contratos que Fase 8 deberá definir

Fase 8 (plan posterior) definirá literalmente: firma TypeScript exacta del puerto interno; tipos de entidades persistibles (Conversation, Message, Session, Participant, TelemetryEvent, UsageEntry); tipo `TenantContext` con las propiedades §8.2; enumeración de eventos del bus que dispararán persistencia (§7); superficie interna exacta (patrón Fase 7 Hito 7.4); ubicación exacta de tests dedicados; punto de inyección desde el composition root (§5.1). Cero anticipación de firmas en esta ADR.

## §14. Tests obligatorios

Plan Fase 8 incluirá tests dedicados verificando como mínimo: aislamiento cross-tenant en puerto (query con tenant A no ve datos de tenant B); aislamiento cross-tenant en BD contra RLS activa; `TenantContext` ausente/incoherente = fallo cerrado; membresía verificada (UUID conocido no autoriza acceso sin membresía); idempotencia tenant-scoped del `usage_ledger`; rechazo de `UPDATE`/`DELETE` ordinarios sobre `usage_ledger`; coherencia `metric_kind`↔`unit` y rechazo de `quantity < 0` en `entry_kind=normal`; cero re-export del puerto desde `engine/src/index.ts` ni `engine/src/adapters/index.ts`; coherencia con eventos del bus del engine y garantías §7; pruebas negativas §9.4.

## §15. Observabilidad, seguridad operativa y requisitos asignados (M5 + O2 parcial)

**Asignados a Plan Fase 8**: cifrado en tránsito (TLS obligatorio); cifrado en reposo; gestión segura y rotación de credenciales; mínimo privilegio por rol; clasificación de datos; logs sin contenido sensible (PII); migraciones versionadas y estrategia expand/contract; roll-forward y recuperación ante migración fallida; backups (Supabase declara backups automáticos cuya disponibilidad exacta depende del plan; verificar antes de producción); **restauración ensayada que además debe verificar policies RLS, memberships, ownership, `FORCE RLS` y separación de roles** — una restauración no se considera válida sólo porque los datos estén presentes; **debe superar pruebas negativas cross-tenant antes de habilitar tráfico**; observabilidad tenant-aware sin fuga cross-tenant; métricas de latencia y throughput por operación del puerto, alertas; incident response y evidencia auditable; límites de conexiones y pooling; verificación de capacidades contratadas antes de producción.

**Asignados a decisiones posteriores identificadas**: política completa de retención y privacidad (ADR de producto, ADR-003 §12); residencia regional de datos (ADR-003 Decisión abierta #11); billing y pricing (ADR de producto separada); superficie pública del SDK (Fase 9).

## §16. Alternativas descartadas

- **A1**. Foundation-owned `StorageAdapter`: descartada por congelación de Foundation.
- **A2**. Elevar `SupabaseAdapter` a contrato productivo: modifica marker congelado.
- **A3**. Diferir toda persistencia al SDK Fase 9: contradice ADR-003 §8.
- **A4**. NoSQL/document store: menor garantía transaccional multi-tenant.
- **A5**. CRUD genérico expuesto: acoplamiento sin semántica de dominio.
- **A6**. RLS como única defensa: single-point-of-failure.
- **A7**. `tenant_id` ficticio en tablas globales: deshonestidad semántica.
- **A8**. Dual-write directo + evento sin outbox: incoherencia y pérdida silenciosa.
- **A9**. Service locator sobre `AdapterRegistry`: prohibido por ADR-004 §2.6.

## §17. Consecuencias

Foundation intacta. `AdapterBase<K>`/`SupabaseAdapter` marker sin cambios. `engine/src/adapters/persistence/` nuevo subdirectorio interno no público. `engine/src/index.ts` sin cambios. Fase 9 SDK hereda un puerto ya definido y probado. Multi-tenancy irreversible desde el schema inicial. `usage_ledger` disponible para futuras cuotas y billing. Portabilidad preservada por el puerto interno. Dependencia productiva `@supabase/supabase-js` introducida sólo en el módulo concreto del adapter, aislada del resto del engine.

## §18. Riesgos y mitigaciones

- **R1** — Acoplamiento oculto a Supabase → greps mecánicos en Plan Fase 8.
- **R2** — RLS mal configurada o no habilitada → §9.1 exige habilitación explícita + tests §9.4.
- **R3** — `TenantContext` falsificado → §8.2 exige contexto confiable server-side.
- **R4** — Doble contabilización/filtración en ledger → `UNIQUE(tenant_id, source, idempotency_key)` §10.2.
- **R5** — Superficie pública ampliada por accidente → test dedicado sobre barrel (patrón Fase 7).
- **R6** — Cambio de proveedor rompe schema → PostgreSQL estándar + features Supabase aislados.
- **R7** — Solapamiento con Fase 9 → §5 opción D delimita alcance.
- **R8** — Dual-write no atómico → outbox pattern o equivalente §7.
- **R9** — Purga incompatible con obligaciones legales → §10.4 permite mecanismo privilegiado auditable.
- **R10** — Propietario o rol privilegiado omite RLS → §9.2/§9.3 exigen `FORCE RLS` + separación de roles.
- **R11** — Migración destructiva o bloqueo prolongado → §11.3/§11.5 exigen evaluación + backups verificados.

## §19. Compatibilidad con Fases 1–7

Fases 1–6 congeladas intactas (Managers stateless, comportamiento observable inalterado). Fase 7 dominio de adapters intacta: el puerto de persistencia se añade como **nuevo subdirectorio** `engine/src/adapters/persistence/`, sin tocar `resolve-language-support.ts`, `conformance.ts`, `CONTRACT.md`, `contract.test.ts`, `index.ts`, `options-viability.test.ts`. Suite basal Fase 7 (580 tests) preservada. Cero regresión en superficie pública del engine.

## §20. Relación con Fase 9 y fases posteriores

Fase 9 (SDK) decidirá si expone directamente el puerto interno o si adapta su forma; cero duplicación de semánticas. Fase 11+ (clientes) consumirán el SDK; no acceden directamente al puerto. Fase 17 (API pública) consumirá el SDK server-side. Fase 18 (White Label) usará el modelo multi-tenant establecido aquí.

## §21. Fuera de alcance

Diseño detallado de tablas + migraciones completas; SQL productivo específico; políticas RLS específicas por rol y tenant; APIs públicas definitivas del SDK; facturación comercial y pricing; elección de sistema de billing; residencia de datos por defecto (ADR-003 Decisión abierta #11); nombre comercial (Decisión abierta #9); retención exacta (Decisión abierta #12); Auth secondary providers (Decisión abierta #8); diseño concreto de Auth.

## §22. Criterios de aceptación de la ADR

Reauditoría técnica final APTO PARA CONGELACIÓN. Cero contradicción con ADR-003, ADR-004, ADR-005, ADR-006, ADR-007 V1.1. Cero modificación de Foundation ni ampliación de la superficie pública del engine. Cero elección de proveedor sin criterios comparados. Cero introducción de secretos ni credenciales en el repositorio. Cero anticipación de firmas TypeScript. Longitud dentro del máximo excepcional autorizado (360 líneas). Autorización expresa del Jefe de Proyecto tras reauditoría APTO.

## §23. Veredicto documental

**APROBADA Y CONGELADA — V1.3.**

La verificación técnica final dirigida confirmó la resolución de M9 y M10. Los hallazgos anteriores permanecen resueltos. ADR-008 queda vinculante para la planificación e implementación de Fase 8.

## §24. Historial

- **V1.0 (2026-07-19)** — Redacción inicial. Auditoría NO APTO con C1 + A1..A4 + M1..M5 + O1.
- **V1.1 (2026-07-20)** — Corrección única. C1..M5 resueltos y O1 aplicada: garantías vinculantes de caminos de escritura (§7); marker `SupabaseAdapter` sin conexión productiva (§6); inyección desde composition root (§5.1); `TenantContext` confiable server-side (§8.2); retención/purga privilegiada auditable (§10.4); aislamiento estructural con clave candidata + FK compuesta (§8.3); tablas globales controladas (§8.4); idempotencia tenant-scoped (§10.2); integridad y semántica temporal del ledger (§10.3); requisitos operativos asignados (§15); referencias oficiales PostgreSQL/Supabase (§4, §9).
- **V1.2 (2026-07-20)** — Corrección técnica final. Reauditoría V1.1 emitió NO APTO con M6, M7, M8 y O2:
  - **M6 resuelto** (§4, §9.1): eliminada afirmación de RLS "por defecto" en Supabase; exigido `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` explícito por tabla tenant-owned; verificación mecánica asignada a Fase 8.
  - **M7 resuelto** (§9.2, §9.3, §9.4): propietario de tabla omite RLS por defecto; `FORCE ROW LEVEL SECURITY` obligatorio con límites explícitos (no neutraliza superusuarios ni `BYPASSRLS`); separación de roles runtime/propietario/migración/service_role; pruebas negativas cross-tenant con múltiples roles.
  - **M8 resuelto** (§11): eliminadas afirmaciones absolutas incorrectas ("idempotencia universal", `ADD CONSTRAINT IF NOT EXISTS`, "sin bloquear escrituras"); sustituidas por versionado + roll-forward + evaluación de bloqueos + herramientas condicionales + recuperación verificada.
  - **O2 aplicada** (§8.2, §15): cambio de tenant activo requiere reautorización server-side; restauración ensayada valida además policies/memberships/ownership/FORCE RLS/separación de roles antes de habilitar tráfico.
- **V1.3 (2026-07-20)** — Corregidas M9 y M10: eliminada la afirmación no demostrable sobre la configuración RLS de V1 y reformulada Auth/Storage Buckets como capacidades futuras pendientes. Decisión central intacta. Verificación técnica final dirigida: APTO PARA CONGELACIÓN. Aprobación y congelación autorizadas expresamente por el Jefe de Proyecto.
- Decisión central preservada: PostgreSQL vía Supabase + puerto interno provider-agnostic. Sin cambios en Foundation, ADRs previas, Fases 1–7.
