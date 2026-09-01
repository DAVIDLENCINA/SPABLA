# HITO 9.3.2-A-Q2-R3 · CIERRE DE CARRERA AUTH DELETE VS ONBOARDING

Fecha: 2026-08-25
Rama: `spabla-v2/hito-9-3-2-a-q2-r3-auth-delete-race`
Base exacta: `adc9f46bf78d0c08c99229b3d63feb54eb991229` (Q2-R2)
Rama origen: `spabla-v2/hito-9-3-2-a-q2-r2-auth-deletion-revocation`
Contrato oficial (invariante): `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_2_A_ONBOARDING_CONTRACT.md` @ `2ca865e532b60a434fabf47b99dc71cc061ee216`
Main (invariante): `e6128433d42e1e105529ed2f64212ca527034b6a`

## 1 · Base adc9f46

El commit `adc9f46` (Q2-R2, "fix(v2): reject deleted auth actors with unexpired sessions") introdujo dentro de la RPC `spabla_v2.admin_ensure_personal_workspace` una comprobación de existencia del actor Auth:

```sql
PERFORM 1 FROM auth.users u WHERE u.id = p_actor_id;
IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_ensure_personal_workspace: auth actor not found'
        USING ERRCODE = 'P0002';
END IF;
```

El adaptador (`lib/v2/server/onboarding.supabase.ts`) mapea `code === "P0002"` a `OnboardingAuthActorDeletedError`, y el handler HTTP a `401 unauthorized` opaco con `internalKind: "auth_actor_deleted"` (whitelisted en el log sanitizer).

## 2 · Defecto exacto

`PERFORM 1 FROM auth.users WHERE id = p_actor_id` es una lectura sin bloqueo. En PostgreSQL, un `SELECT` (o `PERFORM`) sin cláusula `FOR ...` sólo lee la fila; **no** adquiere ningún row-lock. Por eso la carrera siguiente era posible:

1. Onboarding adquiere `pg_advisory_xact_lock(hash(actor_id))`.
2. Onboarding lee `auth.users` y ve el actor.
3. En paralelo, `admin.auth.admin.deleteUser(actor_id)` ejecuta `DELETE FROM auth.users WHERE id = ...` y **commit** su transacción.
4. Onboarding continúa (no comprueba de nuevo) y crea `actor_personal_workspace` + `tenants` + `tenant_memberships` para un actor Auth que ya no existe.
5. El resultado 200 se emite con un `tenantId` cuyo owner no existe: mapping huérfano invertido, membership huérfana, y siguientes onboardings con el mismo `sub` reactivarían la membership del actor eliminado.

El advisory lock del paso 1 **no sincroniza** con `deleteUser` porque Supabase Auth se ejecuta como un servicio HTTP externo (GoTrue) que nunca adquiere ese advisory. Sólo protege contra dos flujos de onboarding concurrentes del mismo actor.

## 3 · Prueba manual del defecto pre-parche

Antes del parche Q2-R3, ejecutando dos conexiones psql independientes en paralelo sobre la RPC Q2-R2:

- Conexión A: abre transacción, hace `PERFORM 1 FROM auth.users WHERE id = X`, `pg_sleep(2)`, y luego `INSERT INTO spabla_v2.actor_personal_workspace(actor_id, tenant_id) VALUES (X, ...)`.
- Conexión B: `DELETE FROM auth.users WHERE id = X` (commit inmediato).

Resultado observado con la implementación de Q2-R2: el `DELETE` de B completa en < 50 ms sin esperar a A (no hay lock que le corresponda), y A commita el mapping en `spabla_v2.actor_personal_workspace` referenciando un actor que ya no existe. Estado inconsistente materializado.

## 4 · Fallo del razonamiento "orden de locks"

El §14 del acta Q2-R2 afirmaba que la carrera estaba "cubierta normativamente por el orden de locks documentado en §10". Esa afirmación es correcta **entre dos flujos de onboarding** (advisory lock por actor), pero es incorrecta **entre onboarding y `deleteUser`**: `deleteUser` no adquiere ni el advisory ni ningún otro lock coordinado. El razonamiento normativo no era una prueba y el acta lo asumía sin ejecutar carrera real. Q2-R3 rectifica esa asunción (ver §14 del acta Q2-R2 rectificado).

## 5 · Corrección búsqueda mínima

La corrección mínima es cambiar la lectura por un row-lock incompatible con `DELETE`:

```sql
SELECT u.id INTO v_auth_locked
  FROM auth.users u
 WHERE u.id = p_actor_id
   FOR KEY SHARE;
IF v_auth_locked IS NULL THEN
    RAISE EXCEPTION 'admin_ensure_personal_workspace: auth actor not found'
        USING ERRCODE = 'P0002';
END IF;
```

Semántica PostgreSQL de `FOR KEY SHARE`:

- Es el modo de row-lock **más débil**. Compatible con `SELECT` normal, `FOR KEY SHARE`, `FOR NO KEY UPDATE`.
- Incompatible con `FOR UPDATE` y con **`DELETE`** de la misma fila.
- No adquiere lock de tabla. No bloquea lecturas concurrentes.
- Sostenido durante toda la transacción del onboarding.

Efectos:

- **Onboarding gana**: mantiene el row-lock durante toda la RPC. Cualquier `DELETE FROM auth.users WHERE id = p_actor_id` concurrente **espera** en cola de locks hasta que el onboarding commit o rollback.
- **Delete gana**: el `SELECT ... FOR KEY SHARE` no encuentra fila → `v_auth_locked IS NULL` → `RAISE P0002` → adaptador → 401 opaco. Cero side-effects.
- **Actores distintos**: `FOR KEY SHARE` es row-level, no table-level. Actores distintos no interfieren; cero contención cross-actor.

## 6 · Restauración de search_path

Q2-R2 amplió el `search_path` de la RPC a `pg_catalog, spabla_v2, auth`. Q2-R3 lo restaura al mínimo `pg_catalog, spabla_v2` y mantiene la referencia `auth.users` explícitamente cualificada. Motivo: mantener la superficie de resolución de identificadores estrictamente controlada (no depender del orden de esquemas del search_path para nada). El resultado es equivalente en comportamiento pero más restrictivo en superficie.

## 7 · Migración aditiva 20260825120000

Se crea `supabase/migrations/20260825120000_hito_9_3_2_a_q2_r3_auth_delete_race.sql`. **No se modifica** `20260824180000` (Q2) ni `20260825000000` (Q2-R2). La migración es un `CREATE OR REPLACE FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid)` que:

- Restaura `SET search_path = pg_catalog, spabla_v2`.
- Sustituye la lectura por `SELECT id ... FOR KEY SHARE`.
- Mantiene el resto de la lógica invariante: validación NULL, advisory lock, idempotencia, orphan detection (23503), reactivación de membership con alias `tm.` (Q2-R2), creación atómica.
- Reasserta owner `postgres`, `REVOKE` a `PUBLIC/anon/authenticated`, `GRANT` a `service_role`.

Cero DDL sobre tablas. Cero modificación de RLS/grants sobre tablas. Cero llamada HTTP a Auth. Cero cambio en firma pública (sigue siendo un solo `p_actor_id uuid`).

## 8 · RPC final Q2-R3

Diferencias respecto a Q2-R2:

| Aspecto | Q2-R2 | Q2-R3 |
| --- | --- | --- |
| `SET search_path` | `pg_catalog, spabla_v2, auth` | `pg_catalog, spabla_v2` |
| Comprobación Auth | `PERFORM 1 FROM auth.users u WHERE u.id = p_actor_id` | `SELECT u.id INTO v_auth_locked FROM auth.users u WHERE u.id = p_actor_id FOR KEY SHARE` |
| Detección ausencia | `IF NOT FOUND THEN RAISE P0002` | `IF v_auth_locked IS NULL THEN RAISE P0002` |
| Lock adquirido | Ninguno sobre la fila de Auth | Row-lock `KeyShareLock` sobre la fila | 

Resto de la función (advisory lock, idempotencia, orphan, reactivación, creación) sin cambios.

## 9 · Orden de locks final

Secuencia dentro de la transacción de la RPC:

1. `pg_advisory_xact_lock(hash(actor_id))` — serializa dos onboardings concurrentes del mismo actor.
2. `SELECT id FROM auth.users WHERE id = p_actor_id FOR KEY SHARE` — serializa con `deleteUser` del mismo actor.
3. `SELECT tenant_id FROM spabla_v2.actor_personal_workspace WHERE actor_id = p_actor_id` — lectura idempotente.
4. Si existe: `UPDATE spabla_v2.tenant_memberships tm SET is_active = TRUE WHERE tm.tenant_id = ... AND tm.actor_id = ...`. Si no existe: `INSERT tenants`, `INSERT actor_personal_workspace`, `INSERT tenant_memberships`.

Ausencia de deadlock cross-hito con `deleteUser`: ambos flujos tocan `auth.users` **antes** de cualquier objeto de `spabla_v2`. No hay dependencia inversa (`spabla_v2 → auth`) en ninguna operación. Por tanto no puede formarse un ciclo `A: auth → spabla_v2` y `B: spabla_v2 → auth` — sólo la primera dirección existe.

## 10 · Contrato invariante

Sin cambios en:

- Firma pública de la RPC (`p_actor_id uuid`).
- Formato del resultado (`tenant_id uuid, role text, created boolean`).
- Mapeo interno/externo (`P0002 → OnboardingAuthActorDeletedError → 401 auth_actor_deleted`).
- Alfabeto de excepciones de dominio (`OnboardingAuthActorDeletedError`, `OnboardingOrphanMappingError`, `OnboardingInternalError`, `OnboardingTransientError`).
- Whitelist de `internalKind` en `log-sanitize.ts` (`auth_actor_deleted` ya estaba).
- Contract Q1-RR-SCOPE §14, §17-ter H, §17-bis 8-10.

## 11 · Prueba concurrente controlada con dos conexiones

Se añade `scripts/ci/onboarding-auth-race.sh` — bash orchestrator que lanza **dos backends psql reales** (procesos independientes, no Promise.all). Usa `PGAPPNAME` distintivo por backend para identificarlos sin ambigüedad en `pg_stat_activity`.

### 11.1 · Escenario 1 — Onboarding gana

- Backend A: `BEGIN; pg_advisory_xact_lock(hash(id)); SELECT id FROM auth.users WHERE id = X FOR KEY SHARE; pg_sleep(2.0); COMMIT;`
- Backend B: `DELETE FROM auth.users WHERE id = X;` lanzado 0.3 s después.

Verificaciones:

- `pg_stat_activity.wait_event_type` de B pasa a `Lock` (proof de que B está bloqueado).
- `pg_blocking_pids(PID_B)` retorna `{PID_A}` (proof de que A bloquea a B).
- Tiempo total del `DELETE` de B: **≥ 1500 ms** (esperando a que A commit tras `pg_sleep(2.0)`). Medido en el último run: 1710 ms.
- A commit correctamente, B ejecuta `DELETE 1` correctamente después.

### 11.2 · Escenario 2 — Deletion gana

- Backend B: `DELETE FROM auth.users WHERE id = X;` (commit inmediato).
- Backend A: `SELECT * FROM spabla_v2.admin_ensure_personal_workspace(X);`.

Verificaciones:

- La RPC devuelve error con mensaje `auth actor not found` (SQLSTATE P0002).
- `count(*) FROM spabla_v2.actor_personal_workspace WHERE actor_id = X` = **0** (cero side-effect).

### 11.3 · Escenario 3 — Ausencia de deadlock, actores distintos

- Backend A: RPC completa para actor `cccc...ccc1`.
- Backend B: RPC completa para actor `cccc...ccc2`.

Verificaciones:

- Ambos completan sin bloquearse (< 30 ms combinado).
- Cero deadlock.
- Distinct `tenant_id` para cada actor (no comparten workspace).

### 11.4 · Integración en CI

`scripts/ci/run-integration-tests.sh` añade un paso final:

```bash
echo "[run-integration-tests] running onboarding-auth-race.sh (two-backend concurrency)"
"${SCRIPT_DIR}/onboarding-auth-race.sh"
```

Job B de CI (`integration:` en `.github/workflows/ci.yml`) ejecuta este runner tras las suites SQL. Cualquier fallo aborta el job con exit 1.

## 12 · Verificaciones estructurales SQL

En `supabase/tests/atomic_onboarding.test.sql` se añaden cuatro checks nuevos (`Q2-R3-1` a `Q2-R3-4`) que leen `pg_get_functiondef` y `pg_proc`:

- **Q2-R3-1** — El cuerpo de la RPC contiene la subcadena literal `FOR KEY SHARE`.
- **Q2-R3-2** — El cuerpo de la RPC contiene `auth.users` cualificado.
- **Q2-R3-3** — `proconfig` incluye `search_path=...` y ese search_path NO contiene el token `auth` (regex `(^|[=, ])auth([, ]|$)`).
- **Q2-R3-4** — Firma invariante `p_actor_id uuid`, volatilidad `v` (VOLATILE).

Fallo de cualquiera implica regresión sobre el endurecimiento Q2-R3.

## 13 · Regresión funcional

- `app/api/v2/onboarding/route.presentation.integration.test.ts`: **8/8** PASS.
  - Q2-R2-A: 401 opaco cuando actor Auth eliminado antes de onboarding.
  - Q2-R2-D: 200 regresión positiva actor Auth vivo.
  - Q2-R2-E: latencia < 2 s (cero HTTP round-trip a Auth).
  - Q2-54: eliminación después de onboarding rechaza JWT vigente.
  - Q2-55: re-registro con mismo email da nuevo `sub` y nuevo tenant.
  - 3 tests adicionales de la suite (idempotencia, orphan, membership desactivada).
- `app/api/v2/onboarding/route.integration.test.ts`: **24/24** PASS (subset de Q2).
- `app/api/v2/messages/route.integration.test.ts`: **11/11** PASS.
- Client Vitest suite: **257/257** PASS.
- Engine Vitest suite: **1120/1120** PASS.
- SQL suites (rls_bootstrap, purge_ledger, message_translations, v1_runtime_retirement, atomic_onboarding con Q2-R3-1..Q2-R3-4): PASS.
- Concurrency script (Q2-R3): **3/3** escenarios PASS.

## 14 · Rectificación acta Q2-R2 §14

Se añade párrafo de rectificación en `docs/audit_reports/AUDIT_2026-08-25_hito-9-3-2-a-q2-r2-auth-deletion-revocation.md` §14 haciendo constar que la afirmación "cubierto normativamente por el orden de locks" era insuficiente y que la carrera queda cerrada por Q2-R3.

## 15 · Restore drill

`scripts/ci/restore-drill.sh` no requiere cambios: baseline (8 tablas, 6 admin functions) invariante — Q2-R3 sólo `CREATE OR REPLACE` de una función existente, cero nuevas tablas, cero cambio de count de funciones. Verificación en Job C de CI. (En macOS local el drill falla por `sed -i` sin extensión; comportamiento pre-existente conocido; funciona correctamente en Ubuntu.)

## 16 · Manifiesto 58/58

Sin cambios respecto a Q2-R2. El manifiesto de escenarios (Q2-05..Q2-58) permanece invariante. Los nuevos escenarios Q2-R3-1..Q2-R3-4 son **checks estructurales SQL** internos, no escenarios funcionales del manifiesto.

## 17 · RLS y grants

Sin cambios. `spabla_v2.actor_personal_workspace`, `spabla_v2.actor_lifecycle_state`, `spabla_v2.tenants`, `spabla_v2.tenant_memberships`: RLS ENABLE+FORCE, cero policy, grants sólo `service_role`. `auth.users`: la RPC accede vía `SECURITY DEFINER` (owner `postgres`) — cero grant nuevo a `anon`/`authenticated`.

## 18 · Superficie de red

Cero llamadas HTTP nuevas. La comprobación Q2-R3 sigue siendo íntegramente SQL dentro de la misma transacción del onboarding. El presupuesto de latencia observado (< 2 s) se mantiene.

## 19 · Riesgos residuales

- **Deletes desde otra cluster/replica**: fuera de alcance. Un DELETE ejecutado en un cluster distinto no puede coordinar con el row-lock; Supabase Auth se ejecuta contra el mismo cluster, luego no aplica.
- **Deadlock cross-hito**: descartado por análisis de orden de locks (§9) y por escenario 3 del test concurrente.
- **`FOR KEY SHARE` vs índices de Auth**: `auth.users_pkey` es una `UNIQUE INDEX` sobre `id`; `FOR KEY SHARE` sobre la fila del PK es la primitiva canónica documentada por PostgreSQL para "row still exists, protect its key". Zero-conflicto con los índices funcionales de `auth.users` observados en `pg_locks` durante DELETE.

## 20 · Confirmación de cero Q3

Cero código, cero migración, cero test, cero commit relacionado con Q3 (bootstrap-in-token, refresh, chat handshake). Ninguna dependencia nueva sobre Q3.

## 21 · Confirmación de cero OTP

Cero código, cero migración, cero test, cero commit relacionado con OTP.

## 22 · Confirmación de cero promoción

- `main` @ `e6128433d42e1e105529ed2f64212ca527034b6a` — invariante.
- Contrato oficial @ `2ca865e532b60a434fabf47b99dc71cc061ee216` — invariante.
- Rama Q2-R3 aislada, no mergeada, no promocionable sin decisión explícita del jefe de proyecto.

## 23 · Puntos de verificación externos

- CI verde en Job A (Vitest engine + Vitest client) y Job B (SQL integration + onboarding-auth-race.sh).
- `git log --oneline main..spabla-v2/hito-9-3-2-a-q2-r3-auth-delete-race`: dos commits (Q2-R2 base + Q2-R3 nuevo).
- `git diff main..spabla-v2/hito-9-3-2-a-q2-r3-auth-delete-race -- supabase/migrations/`: dos migraciones aditivas nuevas (Q2-R2 + Q2-R3), cero modificación de migraciones previas.

## 24 · Solicitud de revisión

Solicitud de revisión al jefe de proyecto. Si aprueba, procede promoción a main como paso separado con auditoría independiente. **No se promociona en este hito**.
