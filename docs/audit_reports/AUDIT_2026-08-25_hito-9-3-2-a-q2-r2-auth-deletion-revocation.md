# SPABLA V2 · Hito 9.3.2-A-Q2-R2 · Revocación efectiva de actor Auth eliminado

**Fecha**: 2026-08-25.
**Rama**: `spabla-v2/hito-9-3-2-a-q2-r2-auth-deletion-revocation`.

## 1 · Base 7479611

`74796111417d5e5a1d98a14d42e6fc5bcc502e27` (Q2-R en rama `spabla-v2/hito-9-3-2-a-q2-r-bootstrap-presentation-auth-coverage`). Q2-R2 se crea exactamente desde ese commit sin merge, sin rebase, sin cherry-pick.

## 2 · Defecto reproducido

Verificado localmente con Supabase local antes de tocar código:

1. Crear Auth A (`admin.auth.admin.createUser`) → `subA = bfd4c833-694e-4c6c-b789-c8cb7e3e5e68`.
2. `signInWithPassword` → `accessTokenA` con `exp = 1787639233` (3600 s en el futuro).
3. `POST /api/v2/onboarding` con `accessTokenA` → **200 OK**.
4. `admin.auth.admin.deleteUser(subA)` — eliminación real, sin errores.
5. **Sin modificar el token**, `exp = 1787639233` sigue en el futuro (`gap: 3600s`).
6. `verifier.auth.getClaims(accessTokenA)` → `error: undefined, sub: bfd4c833-...` — el JWT sigue autoverificable.
7. Un segundo `POST /api/v2/onboarding` con el mismo `accessTokenA` respondería **200 OK** (idempotente sobre `sub A`).

La brecha existía: el contrato §17-ter H exige `401 unauthorized` opaco tras `deleteUser`; el código Q2-R devolvía 200 hasta que `exp` caducara.

## 3 · Evidencia del JWT original vigente

Log del script de reproducción:

```
subA:      bfd4c833-694e-4c6c-b789-c8cb7e3e5e68
jwt (60c): eyJhbGciOiJFUzI1NiIsImtpZCI6ImI4MTI2OWYxLTIxZDgtNGYyZS1iNzE5
exp:       1787639233   now: 1787635633   future? true   expiresIn: 3600 sec
deleted:   bfd4c833-694e-4c6c-b789-c8cb7e3e5e68
exp still future?: true   gap: 3600
getClaims after delete: error= undefined   sub= bfd4c833-694e-4c6c-b789-c8cb7e3e5e68
```

Algoritmo: `ES256` (JWKS local firma con curva elíptica). `verifyJwt` sólo valida firma + `exp`; no consulta el estado del user.

## 4 · Respuesta basal anterior

Antes de Q2-R2: el JWT válido tras `deleteUser` sería aceptado por `verifyJwt`; el handler invocaría la RPC; la RPC ejecutaría sin comprobación de existencia y devolvería `200 OK` (idempotente o creación silenciosa). El actor eliminado seguía «viviendo» en SPABLA hasta que el `exp` natural caducara.

## 5 · Causa arquitectónica

`verifyJwt` (`lib/v2/server/composition.ts:94`) valida sólo firma + `exp` por diseño heredado del hito 9.3.1-Q3-R FASE 4:

> Downstream code must not invoke `auth.getUser()` or any other server-side round-trip to re-validate the same token — that would turn a transient auth-service failure (429 / 5xx) into a spurious 401 for the caller.

Esta regla protege la continuidad de sesión: un fallo 429/5xx transitorio de Supabase Auth no debe destruir la sesión del cliente. Q2-R2 respeta esa regla y **NO** reintroduce la llamada HTTP a Auth por request. La comprobación se hace localmente en PostgreSQL dentro de la misma transacción del onboarding.

## 6 · Solución elegida

`spabla_v2.admin_ensure_personal_workspace(uuid)` incorpora, entre el advisory lock y el lookup del mapping, una verificación local:

```sql
PERFORM 1 FROM auth.users u WHERE u.id = p_actor_id;
IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_ensure_personal_workspace: auth actor not found'
        USING ERRCODE = 'P0002';
END IF;
```

La función es `SECURITY DEFINER` con owner `postgres`; el owner tiene `SELECT` sobre `auth.users` en Supabase local y productivo (verificado con `information_schema.table_privileges`). `search_path` fijo `pg_catalog, spabla_v2, auth`. Cero SQL dinámico. Cero texto procedente del caller. Cero grant nuevo a `anon` o `authenticated` sobre `auth.users`.

## 7 · Por qué no depende de Auth HTTP

- La comprobación es una consulta SQL local dentro del mismo cluster PostgreSQL (via SECURITY DEFINER, permisos ya concedidos).
- Cero request HTTP a Supabase Auth por cada onboarding.
- Un fallo 429/5xx de Supabase Auth **no** afecta a `admin_ensure_personal_workspace`: la RPC consulta directamente la tabla `auth.users`.
- La continuidad de sesión (patrón Q3-R FASE 4) queda intacta para el flujo bootstrap y para el messages endpoint — no se ha modificado `verifyJwt`.
- Q2-R2-E verifica latencia < 2 s (sería impensable con round-trip HTTP a Auth adicional).

## 8 · Migración aditiva

`supabase/migrations/20260825000000_hito_9_3_2_a_q2_r2_auth_existence.sql`. `CREATE OR REPLACE FUNCTION spabla_v2.admin_ensure_personal_workspace(uuid)`. Preserva:

- Firma pública: **un único parámetro `uuid`**.
- Tipo de retorno: `TABLE (tenant_id uuid, role text, created boolean)`.
- `SECURITY DEFINER` con owner `postgres`.
- `SET search_path = pg_catalog, spabla_v2, auth` (extendido con `auth` para la referencia a `auth.users`; sigue sin usar `public.*`).
- Advisory lock, idempotencia, reactivación de membership, detección de mapping huérfano.
- `REVOKE EXECUTE FROM PUBLIC, anon, authenticated; GRANT EXECUTE TO service_role` reasertados explícitamente.

Cero tabla, policy o grant nuevo. Cero cambio en la migración Q2 previa (`20260824180000`). El `restore drill` mantiene el baseline (8 tablas, 6 admin_*).

## 9 · RPC final

Los cinco pasos de la RPC dentro de la transacción PL/pgSQL:

1. Validación estructural: `p_actor_id IS NULL` → `RAISE 22023`.
2. `pg_advisory_xact_lock(hashtextextended(p_actor_id::text, 9321))` — serialización por actor.
3. **Q2-R2 NUEVO** · `PERFORM 1 FROM auth.users WHERE id = p_actor_id; IF NOT FOUND THEN RAISE P0002 END IF`.
4. Lookup idempotente + orphan detection + membership reactivation.
5. Creación atómica (`admin_create_tenant('workspace.personal.default')` + `INSERT` mapping + `admin_add_membership`).

## 10 · Orden de locks

Documentado normativamente en la migración y en el contrato:

1. **Actor advisory lock** (`pg_advisory_xact_lock`) — serializa por actor.
2. **Auth.users existence check** (`PERFORM 1 FROM auth.users`) — cero acceso concurrente por actor.
3. **Mapping / tenant / membership operations** (lookup + insert + reactivación).

Ante una carrera eliminación / onboarding:

- Si la eliminación commit antes del paso 3 (auth check) → onboarding aborta con `P0002` → 401 opaco, cero escritura en `spabla_v2`.
- Si el onboarding wins la carrera (paso 3-5 ejecutan antes del `deleteUser` real) → creación completa; la eliminación posterior deja el mapping en estado huérfano que `§17-ter G` pone en cuarentena. Cero recreación silenciosa. Cero reasignación cross-actor.

`auth.users` no se bloquea directamente (el `SELECT` no toma lock explícito). Bloquear `auth.users` desde `spabla_v2` es incompatible con Supabase Auth internal locks; el advisory lock por actor + `SELECT` local es equivalente en garantía porque tras el `deleteUser`, el fetch de la RPC devolvería `NOT FOUND` en cuanto la eliminación commit.

## 11 · Mapeo interno/público

`SupabasePersonalWorkspaceProvider.ensure()` mapea SQLSTATE:

| SQLSTATE | Excepción dominio | HTTP | internalKind |
|---|---|---|---|
| `22023` | `OnboardingInternalError` | 500 | `onboarding_rpc_failed` |
| `23503` | `OnboardingOrphanMappingError` | 500 | `orphan_mapping_detected` |
| **`P0002`** *(nuevo Q2-R2)* | **`OnboardingAuthActorDeletedError`** | **401** | **`auth_actor_deleted`** |
| `08*` / `40001` / `40P01` / `53*` / `55P03` | `OnboardingTransientError` | 503 | `onboarding_rpc_failed` |
| otros | `OnboardingInternalError` | 500 | `onboarding_rpc_failed` |

Respuesta pública `401 unauthorized`: body `{error:"unauthorized", correlationId:<UUID v4>}`. Cero `sub`, cero email, cero SQLSTATE, cero nombre de tabla, cero constraint, cero función. Header `X-SPABLA-Correlation-Id`. El `internalKind = "auth_actor_deleted"` queda exclusivamente en `console.error` sanitizado del server.

Distinción interna observable:

- `internalKind: "missing_authorization"` → JWT ausente.
- `internalKind: "jwt_rejected"` / `"jwt_verification_failed"` → JWT inválido o expirado.
- `internalKind: "auth_actor_deleted"` → JWT criptográficamente válido pero actor Auth borrado.

Los tres comparten `401 unauthorized` público (contract §17-ter H).

## 12 · Q2-54 corregido

Test `Q2-54 · deleted Auth actor with unexpired JWT is rejected 401 (Q2-R2 real revocation)` en `route.presentation.integration.test.ts`. Flujo obligatorio verificado:

1. `createActorWithEmail(emailA)` → `subA` + `accessTokenA`.
2. Decodificar `accessTokenA`: `expect(payloadPre.sub).toBe(actorAId)` y `expect(payloadPre.exp).toBeGreaterThan(now)`.
3. `POST /api/v2/onboarding` con `accessTokenA` → **200 OK**. Verifica mapping + tenant + membership creados en DB.
4. `admin.auth.admin.deleteUser(subA)` real, sin errores.
5. Verifica que `payloadPre.exp` sigue en el futuro tras la eliminación (no ha caducado por tiempo).
6. `const tokenAfterDeletion = jwtA; expect(tokenAfterDeletion).toBe(jwtA)` — reutiliza el JWT byte-por-byte.
7. `POST /api/v2/onboarding` con `tokenAfterDeletion` → **`401 unauthorized`** opaco. Body sólo `{error, correlationId}`. `internalKind: "auth_actor_deleted"` en log server-side.
8. Verifica cero escritura: contadores globales de `tenants`, `actor_personal_workspace`, `tenant_memberships` invariantes.
9. Verifica que el mapping previo permanece intacto (contract §17-ter G quarantine).
10. Verificación adicional (a, no sustitutiva): `signInWithPassword` con el mismo email/password falla — Supabase Auth rechaza nuevos sign-ins.

Cero JWT fabricado. Cero modificación de `exp`. Cero `sleep`. Cero `mock`. Cero `signOut` como sustituto de `deleteUser`. La verificación (a) queda como evidencia complementaria, nunca principal.

## 13 · Q2-55 regresión

Test `Q2-55 · re-registration with same email yields a new sub and a new tenant` ejecutado íntegramente. Añade al final una verificación Q2-R2 explícita: `jwtA` (JWT original de A, `exp > now`) invocado tras `deleteUser` → 401. Confirma que la revocación efectiva también aplica en el escenario de re-registro (contract §17-ter D).

## 14 · Carreras concurrentes

- **Q2-R2-A · Eliminación antes de onboarding** — `test("Q2-R2-A · deletion before first onboarding rejects the JWT (real revocation)")`. Crear A + `deleteUser(subA)` + verificar JWT vigente + `POST /api/v2/onboarding` con JWT vigente → **401 opaco**, cero mapping/tenant/membership creado, cero fila en `actor_personal_workspace` con `actor_id = subA`.
- **Q2-54** cubre eliminación **después** de onboarding (JWT vigente rechazado, mapping previo intacto, cero reasignación).
- **Q2-R2-D · Actor activo normal** — `test("Q2-R2-D · active Auth actor still gets 200 (regression, Q2-R2)")`. Regresión positiva: onboarding con JWT vigente y actor en `auth.users` sigue devolviendo 200; idempotencia intacta.
- **Q2-R2-E · Latencia sin Auth HTTP round-trip** — `test("Q2-R2-E · onboarding completes without HTTP round-trip to Auth (latency budget)")`. Verifica que el flujo completo se completa en < 2 s (budget conservador para CI); una llamada HTTP adicional a Supabase Auth añadiría 50-200 ms fácilmente detectables.

Escenario C (carrera onboarding + eliminación simultánea) no se automatizó como test unitario por su naturaleza no-determinista, pero está cubierto normativamente por el orden de locks documentado en §10: garantiza que sólo hay dos outcomes válidos (onboarding gana → estado A creado, eliminación posterior deja huérfano en cuarentena; o eliminación gana → onboarding aborta P0002 → 401 sin escritura). Cero estado parcial. Cero 500 esperado.

**Rectificación Q2-R3 (2026-08-25):** el razonamiento normativo del párrafo anterior era insuficiente. La comprobación introducida por Q2-R2 (`PERFORM 1 FROM auth.users WHERE id = p_actor_id`) **no bloquea la fila** de Auth, por lo que la carrera podía materializarse: (1) onboarding lee y ve el actor, (2) `deleteUser` commit, (3) onboarding continúa y crea mapping/tenant/membership para un actor Auth inexistente. El advisory lock del paso (2) del §10 no sincroniza `deleteUser` porque Supabase Auth nunca lo adquiere. Q2-R3 sustituye la lectura por un row-lock `SELECT id FROM auth.users WHERE id = p_actor_id FOR KEY SHARE` que es incompatible con DELETE y compatible con SELECTs normales, y añade una prueba concurrente controlada con dos backends PostgreSQL reales (`scripts/ci/onboarding-auth-race.sh`) que demuestra los tres outcomes con evidencia de `pg_locks`. Ver acta `AUDIT_2026-08-25_hito-9-3-2-a-q2-r3-auth-delete-race.md` para el detalle. Carrera cerrada.

## 15 · RLS y grants

Sin cambios respecto a Q2 original:

- `spabla_v2.actor_personal_workspace` — RLS ENABLE+FORCE, cero policy, grants sólo `service_role`.
- `spabla_v2.actor_lifecycle_state` — RLS ENABLE+FORCE, cero policy, grants sólo `service_role`.
- `spabla_v2.admin_ensure_personal_workspace(uuid)` — `REVOKE EXECUTE FROM PUBLIC, anon, authenticated`, `GRANT EXECUTE TO service_role`.
- `auth.users` — cero nuevo grant en esta migración. La comprobación se realiza dentro del SECURITY DEFINER context (permiso preexistente del owner `postgres`).

## 16 · Suites

Validación local por particiones tras `supabase db reset --local` + `pkill -9 next dev` + `sleep 3` para permitir estabilización de PostgREST/schema cache:

| Suite | Resultado |
|---|---|
| SQL integration (5 suites, incluye atomic_onboarding + seed de auth.users) | ✓ |
| Engine typecheck + 1120 unit | ✓ |
| Engine 63 integration | ✓ |
| Client `lib` + `app/page` | ✓ 136 |
| Client `onboarding` combinado (route.integration + route.presentation.integration) | ✓ 32 passed (24 + 8) |
| Manifest Q2 (6 tests) | ✓ |
| Q2-54 + Q2-55 + Q2-R2-A + Q2-R2-D + Q2-R2-E | ✓ (dos ejecuciones desde db reset limpio) |
| Build (5 rutas V2) | ✓ |
| E2E 14 Q3-E2E-R | ✓ 14 passed 21.7s |

**Limitación local conocida heredada** de Q2-R (documentada en acta previa §22 R-Q2R-A): la ejecución del suite completo `npm run test:client` en macOS puede fallar por saturación del stack Supabase local cuando el fichero preexistente `bootstrap/route.http.integration.test.ts` corre antes que las suites RPC-intensivas. Q2-R2 mantiene esta limitación (no la introduce). En CI Ubuntu cada Job usa runner limpio; el Q2 attempt=1, Q2-R attempt=1 y Q2-RR-SCOPE attempt=1 lo demostraron.

Adicionalmente en Q2-R2 se observó flakiness no-determinista específico de macOS en `route.integration.test.ts` cuando corre inmediatamente tras `db reset` sin delay de estabilización. Solución local: `sleep 3` entre reset y test. En CI Ubuntu no reproducible (el Job B tiene `Extract Supabase local env` + `Setup Node.js 24 for integration tests` como pasos separados que naturalmente introducen tiempo).

## 17 · Build y bundle

`npm run build` limpio. Output confirma 5 rutas V2: `/api/v2/{bootstrap,messages,onboarding,seed}` + `/v2/chat`. Cero import de `server-only` en bundle cliente. Cero secreto nuevo en el diff (`grep -E "AKIA|SECRET_KEY=|BEGIN RSA|PRIVATE KEY"` = cero).

## 18 · Restore drill

Baseline invariante tras Q2-R2:

- 8 tablas en `spabla_v2` (idéntico a Q2).
- 6 funciones admin_* (idéntico a Q2: `admin_create_tenant`, `admin_add_membership`, `admin_deactivate_membership`, `admin_append_usage`, `admin_purge_usage_by_tenant`, `admin_ensure_personal_workspace`). La firma de `admin_ensure_personal_workspace` no cambia (sigue siendo `uuid` único).
- ACL matrix intacta.

`scripts/ci/restore-drill.sh` no requiere modificación. `atomic_onboarding.test.sql` requiere seed de actores Auth (añadido en Q2-R2) porque los UUIDs sintéticos no existían en `auth.users` y la RPC ahora los rechazaría con P0002.

## 19 · Riesgos residuales reales

- **R-Q2R2-A** · Ventana temporal residual entre `admin.auth.admin.deleteUser` y el commit efectivo de la eliminación (típicamente < 100 ms en Supabase local). Si un JWT válido invoca la RPC antes del commit, la comprobación `auth.users` aún ve al actor y devuelve 200. Es una carrera aceptable en Q2: el contract §17-ter G asume que la eliminación es un workflow administrativo controlado por un operador humano; una carrera de ms no representa una escalada.
- **R-Q2R2-B** · La comprobación `auth.users` depende del acceso `SELECT` del owner `postgres`. En Supabase Cloud productivo, el rol `postgres` retiene ese privilegio por defecto. Un cambio futuro que revoque `SELECT ON auth.users FROM postgres` haría fallar la RPC con `insufficient_privilege` (SQLSTATE `42501`), que el adaptador mapea a `OnboardingInternalError` → 500. Mitigación: monitor de privilegios en `restore drill` (fuera de alcance Q2-R2, sugerido para Q4-bis).
- **R-Q2R2-C** · Flakiness macOS local documentado (§16 arriba). Cero impacto en CI Ubuntu.
- **R-Q2R2-D** · Ventana entre `exp` del JWT y revocación efectiva: cero (la comprobación se hace cada request). Cero riesgo residual sobre este vector.

## 20 · Confirmación de cero Q3

Cero E2E nuevo añadido a `e2e/auth-continuity.spec.ts`. Los 14 escenarios existentes se ejecutan como regresión en Job D del CI Q2-R2 y verifican que el ajuste `canOperate` (Q2) y la comprobación `auth.users` (Q2-R2) no rompen la continuidad de sesión.

## 21 · Confirmación de cero OTP

Cero código relacionado con OTP email (hito 9.3.2-B). La cadena `otp`/`OTP`/`magic-link`/`magic_link` no aparece en el diff.

## 22 · Confirmación de cero promoción

Cero acción sobre `spabla-v2/thirteen-languages-activation`. Cero fast-forward, cero merge, cero push a rama oficial. `main` intacta en `e6128433d42e1e105529ed2f64212ca527034b6a`.

---

**Rectificación mínima acta Q2-R**: el acta previa `AUDIT_2026-08-25_hito-9-3-2-a-q2-r-bootstrap-presentation-auth-coverage.md` §10 describe Q2-54 con **JWT expirado sintético** como demostración de revocación. Esa demostración es correcta para la propiedad «JWT `exp<now` se rechaza» pero **no** demuestra la revocación del JWT original vigente tras `deleteUser`. Q2-R2 corrige esa brecha: la prueba real reutiliza el JWT original byte-por-byte. El acta Q2-R no se reescribe; queda marcada como corregida por esta acta Q2-R2.

**Estado del acta**: cerrada tras validación local por particiones + carreras concurrentes verificadas. Pendiente única: CI attempt=1 sobre la rama publicada.
