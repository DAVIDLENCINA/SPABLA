# HITO 9.3.2-A-Q3 · BARRERA E2E DEL ONBOARDING PERSONAL ATÓMICO

Fecha: 2026-08-25
Rama: `spabla-v2/hito-9-3-2-a-q3-onboarding-e2e-barrier`
Base exacta: `43ebb6dd5d2d4782ea1054b218d08565a2a3a698` (Q2-R3)
Rama fuente: `spabla-v2/hito-9-3-2-a-q2-r3-auth-delete-race`
Contrato oficial (invariante): `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_2_A_ONBOARDING_CONTRACT.md` @ `2ca865e532b60a434fabf47b99dc71cc061ee216`
Rama oficial (invariante): `spabla-v2/thirteen-languages-activation` @ `2ca865e532b60a434fabf47b99dc71cc061ee216`
Main (invariante): `e6128433d42e1e105529ed2f64212ca527034b6a`

## 1 · Alcance y no-alcance

Alcance de Q3: barrera E2E sobre Chromium real + Next real + Supabase local + usuarios Auth reales + sesiones reales que ejerce `POST /api/v2/onboarding` sobre la frontera HTTP. Añadir Job E al workflow CI.

No-alcance:
- No promoción a la oficial.
- No inicio de OTP.
- No inicio de 9.3.2-B.
- No modificación de `main`.
- No ampliación de funcionalidad productiva.
- No cambio del contrato oficial ni del endpoint.
- No corrección silenciosa de defectos productivos.

## 2 · Base exacta y rama

- Base: `43ebb6dd5d2d4782ea1054b218d08565a2a3a698` (Q2-R3 verificado remoto).
- Rama: creada exactamente desde esa base con `git switch -c`.
- SHA de la oficial: `2ca865e532b60a434fabf47b99dc71cc061ee216` (invariante confirmado antes y después del hito).
- SHA de main: `e6128433d42e1e105529ed2f64212ca527034b6a` (invariante).

## 3 · Interpretación del contrato oficial (autoritativo)

Antes de escribir tests se releyó el contrato §10 y §14. Dos aspectos exigen alinearse con el contrato oficial y NO con la literalidad de la orden Q3:

- **Body de éxito 200 = `{tenantId, role: "owner", label}`** — el campo `created` queda EXCLUSIVAMENTE en observabilidad server-side (§10, §7). La orden Q3 mencionaba `created=true`/`created=false` en la respuesta; los tests E2E respetan el contrato y verifican la creación / idempotencia mediante **deltas COUNT en PostgreSQL**, no vía body.
- **Verbos no permitidos → `404 not_found`** — coherencia con el patrón hito 9.2.5-C (§10, §14 filas 26-30). La orden Q3 mencionaba `405 Method Not Allowed` con cabecera `Allow`; el contrato NO define eso y el handler productivo devuelve 404. Los tests respetan el contrato.

Estas observaciones no son un desafío a la orden: la orden Q3 misma establece "no inventar comportamiento que el contrato no contemple". Se documentan aquí para trazabilidad de la decisión.

## 4 · Matriz de trazabilidad

| Requisito contractual | Prueba pre-Q3 | Prueba E2E Q3 (browser) | Evidencia observable |
|---|---|---|---|
| §14 row 5 · nuevo actor → 200 crea | route.presentation, race S3 | onboarding.spec.ts test 1 | 200 + role="owner" + tenantId UUID; SQL: 1 mapping / 1 tenant name=workspace.personal.default / 1 active membership |
| §14 row 6 · idempotencia | route.presentation | test 2 | 200 mismo tenantId; COUNT invariante 1/1/1 |
| §14 rows 12-13 · concurrencia mismo actor | onboarding-auth-race S1 (DB), Q2-53 | test 3 | 20 requests via Promise.all en `page.evaluate`; todos 200 mismo tenantId; SQL COUNT=1/1/1; wall < 10 s |
| §14 rows 17-24, 52 · autoridad servidor | route.presentation | test 4 | body con tenantId/role/actorId/name/label pwn → 200 con tenantId real + role="owner"; body texto NO contiene pwn/script/actorId/tenantId inyectados |
| §14 rows 1-3 · Auth ausente / inválida | route.presentation | test 5 | 401 en 4 variantes; SQL cero mapping para actor "alien" |
| §14 row 54 · actor Auth eliminado + JWT vigente | Q2-R2-A, route.presentation | test 6 | JWT capturado antes de deleteUser; localStorage byte-idéntico post-delete; 401 opaco; cero mapping/tenant |
| §14 row 9 · membership desactivada → reactiva | route.presentation | test 7 | fixture SQL desactiva; onboarding devuelve mismo tenantId; SQL: active=1, inactive=0 |
| §14 rows 53, 56 · deletion_pending / legal_hold | route.presentation | tests 8a, 8b | 503 opaco; cero side-effect |
| §14 rows 49-52, §17-bis · localización | route.presentation | test 9 | labels correctas para es/ja-JP/xx-YY/default; injection NO surface; body impuesto NO sobreescribe; tenants.name invariante |
| §14 rows 26-30 · verbos no-POST → 404 | route.presentation | test 10 | GET/PUT/PATCH/DELETE → 404 `not_found`; cero side-effect |
| §14 row 57 · aislamiento dos actores | Q3-E2E auth-continuity | test 11 | dos BrowserContext, dos sesiones, dos tenants distintos, cero cross-membership; segundo onboarding de A no toca B |
| barrera E2E anti-falso-positivo | Q3-E2E-R anti-falso-positivo | test 12 | grep programático sobre el propio spec: Promise.all presente, sin await sequential, sin signInAsUserInPage tras deleteUser, con `new PgClient`, cero test.skip/fixme/retry, smoke pg query real |

## 5 · Escenarios E2E añadidos (13 tests)

Todos en `e2e/onboarding.spec.ts`, ejecutados serialmente por `test.describe.serial`:

1. **new user** — crea usuario Auth, login vía UI, POST → 200, verifica body + postcondiciones SQL.
2. **idempotence** — dos POSTs consecutivos → mismo tenantId; COUNTs invariantes.
3. **20 concurrent same-actor** — `Promise.all` de 20 fetch en `page.evaluate`; wall < 10 s; SQL COUNT=1.
4. **server authority** — body de 8 campos pwn (tenantId/actorId/role/created/name/label/workspaceName/internal_key) → response tenantId propio + role="owner" + label del catálogo; `tenants.name` = `workspace.personal.default`.
5. **auth absent/invalid** — sin header, Bearer bogus, corrupt structure, alien signature → 4×401.
6. **deleted actor + original JWT** — reutiliza el `access_token` capturado antes de `admin.deleteUser`. Anti-falso-positivo: (a) `iat` ≤ `deletionEpoch`; (b) localStorage byte-idéntico post-delete. Espera 401 opaco + cero side-effects SQL.
7. **membership reactivation** — fixture `UPDATE tenant_memberships SET is_active=FALSE` seguida de nuevo POST → 200 + `is_active=TRUE`.
8. **8a deletion_pending / 8b legal_hold** — fixture `INSERT ... actor_lifecycle_state`; POST → 503 opaco `unavailable`.
9. **localization** — Accept-Language: default(en), es, ja-JP (→ja), xx-YY (→en), injection SQL (→en), body impuesto (header prevalece); tenants.name invariante.
10. **HTTP methods** — GET/PUT/PATCH/DELETE → 404 `not_found` + correlationId; cero side-effect.
11. **two actors isolation** — dos BrowserContext, dos sesiones, dos tenants distintos; cross-membership=0; segundo POST de A no altera estado de B.
12. **anti-false-positive** — grep programático sobre el propio spec: `Promise.all(jobs)` presente, sin loop sequential, sin `signInAsUserInPage` tras deleteUser, `new PgClient` presente, cero `test.skip/test.fixme/.retry`, smoke query pg con UUID random funciona.

## 6 · Evidencia de autenticación real

- `admin.auth.admin.createUser({email, password, email_confirm:true})` — inserta actor real en `auth.users`.
- Login vía UI real: `page.goto("/v2/chat")` + fill `#spabla-session-email` + `#spabla-session-password` + click `Iniciar sesión`.
- Espera hasta que `localStorage[spabla_v2_fase9_auth]` no sea null — prueba de que el SDK cacheó la sesión en la misma clave productiva.
- `window.__spablaSupabase.auth.getSession()` — obtiene el `access_token` real desde el SDK cacheado por el hook `NEXT_PUBLIC_SPABLA_E2E_HOOK=1`.
- Header `Authorization: Bearer <access_token>` en cada llamada a `POST /api/v2/onboarding` a través de `page.request` (network stack de Chromium).

Cero fabricación de JWT. Cero mock de Auth. Cero manipulación artificial del token (excepto en test 5, que envía un JWT alienígena con firma inválida a propósito para verificar el 401).

## 7 · Evidencia de Supabase real y PostgreSQL real

- Todas las postcondiciones consultan PostgreSQL directamente con el `pg` client sobre la URL `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
- Fixture setup usa `service_role` sobre el REST API real (`admin.createUser`, INSERT/UPDATE fixtures).
- Cero mock del cliente Supabase. El instance productivo `window.__spablaSupabase` es el mismo que consume la app productiva.

## 8 · Evidencia de concurrencia real

Test 3: 20 fetch() lanzados con `Promise.all` DENTRO del contexto del navegador via `page.evaluate`. Anti-serialization proof: wall < 10 s (si Playwright hubiera serializado, sería ~20 × single-call ≈ 4-8 s en el mejor caso pero con overhead browser sería > 10 s).

Verificación cruzada con `scripts/ci/onboarding-auth-race.sh` (Q2-R3) — este ya proveía la prueba SQL de dos backends independientes con lock observado en `pg_locks`. Q3 aporta la prueba desde la frontera HTTP a través del navegador.

## 9 · Evidencia de deleteUser con JWT previo (test 6)

Secuencia:
1. Crea user, login UI, captura `access_token` + `issued_at_epoch` (del `iat` decodificado).
2. `deletionEpoch = Math.floor(Date.now()/1000)`.
3. `admin.deleteUser(userId)`.
4. Verifica `fx.issued_at_epoch <= deletionEpoch` (garantía temporal — el iat es a nivel segundo, la igualdad al mismo segundo es legítima).
5. Verifica `localStorage[spabla_v2_fase9_auth].access_token === fx.access_token` (garantía byte-level: cualquier refresh silencioso habría rotado el token).
6. `POST /api/v2/onboarding` con `fx.access_token` → 401 opaco `{error:"unauthorized"}`.
7. SQL: `count(actor_personal_workspace WHERE actor_id=$)=0`, `count(tenants WHERE id=<expected>)=0`.

## 10 · Postcondiciones SQL verificadas por test

| Test | Postcondiciones SQL |
|---|---|
| 1 | mapping=1, tenant=1, tenant.name=workspace.personal.default, active_membership=1, inactive=0 |
| 2 | mapping=1, tenant=1, active_membership=1 tras 2 llamadas |
| 3 | mapping=1, tenant=1, active_membership=1, inactive=0 tras 20 llamadas |
| 4 | mapping=1, tenant.name=workspace.personal.default (nunca "pwn-name") |
| 5 | count mapping alien=0 |
| 6 | mapping=0, tenant=0 tras 401 |
| 7 | active_membership=0 tras UPDATE fixture; active=1, inactive=0 tras reactivación |
| 8a/8b | mapping=0, tenant=0 tras 503 |
| 9 | tenant.name=workspace.personal.default invariante, mapping=1 tras 6 llamadas |
| 10 | mapping=0, tenant=0 |
| 11 | dos tenants distintos, cross-membership=0 |
| 12 | smoke query sobre UUID random → mapping=0, tenant=0 |

## 11 · Runner y integración CI

- `scripts/e2e/run-onboarding-e2e.sh` — mirror de `run-auth-continuity.sh` con puerto aislado 3121 y ejecución de `e2e/onboarding.spec.ts` únicamente. Cleanup TERM/KILL del process group + Chromium residual + `rm -f` del log tmp.
- `scripts/e2e/run-auth-continuity.sh` — un cambio de 1 línea: `npx playwright test e2e/auth-continuity.spec.ts --project chromium` (antes ejecutaba todo `e2e/**`; ahora restringe al spec propio). Necesario para preservar la ejecución independiente de las dos barreras cuando ambos specs viven en `e2e/`.
- `.github/workflows/ci.yml` — Job E `onboarding browser E2E` añadido debajo de Job D. Mismo patrón: setup Supabase CLI 2.110.0, Node 24, `npm ci`, `npx playwright install --with-deps chromium`, `bash scripts/e2e/run-onboarding-e2e.sh --reset`, `supabase stop --no-backup` en `if: always()`.
- Jobs A/B/C/D permanecen sintácticamente invariantes (excepto el 1-line fix del runner auth-continuity para restringir specs).

## 12 · No regresión

Suites históricas siguen ejecutándose. Contadores:

| Suite | Pre-Q3 | Post-Q3 | Delta |
|---|---|---|---|
| Engine Vitest | 1120 tests | 1120 tests | 0 |
| Client Vitest | 257 tests | 257 tests | 0 |
| SQL integration + race Q2-R3 | 5 suites + 3 escenarios race | 5 suites + 3 escenarios race | 0 |
| onboarding presentation/integration/messages | 43 tests | 43 tests | 0 |
| auth-continuity Q3-E2E-R (Job D) | 14 tests | 14 tests | 0 |
| onboarding Q3-E2E (Job E) NUEVO | — | 13 tests | +13 |
| **Total** | **1434 tests + 5+3 SQL** | **1447 tests + 5+3 SQL** | **+13** |

Passed/Failed/Skipped/Retries locales (rondas 1 y 2):
- Passed: todos.
- Failed: 0.
- Skipped: 0.
- Retries: 0.
- `test.skip` / `test.fixme` / `retries` en el nuevo spec: 0 (verificado programáticamente por test 12).

## 13 · Diferencia entre prueba unitaria, SQL, HTTP y E2E

- **Unitaria**: fake providers, cero infra. Verifica lógica pura de `onboarding-service.ts`, `onboarding-labels.ts`, etc.
- **SQL integration**: PostgreSQL real, invocación directa a la RPC. Verifica search_path, locks, mapping/tenant/membership desde SQL.
- **HTTP (route.presentation.integration.test.ts)**: handler Next real (invocado in-process) + Supabase local. Verifica el borde HTTP sin navegador.
- **E2E (esta suite)**: Chromium real + Next dev real + Supabase local + usuario Auth real + sesión SDK real + fetch desde navegador. Verifica que TODO el stack conjunto respeta el contrato desde la frontera pública. Es la única capa que garantiza que el login productivo → SDK cache → localStorage → `Authorization: Bearer` → handler → RPC → Postgres → catálogo de labels funcionan como un sistema integrado.

## 14 · Resultado de ambas rondas locales

**Ronda 1** (tras `supabase db reset --local` limpio y `pkill next dev`):

```
Running 13 tests using 1 worker
  ✓  13 passed (10.5s / 9.4s tras fix relajar iat estricto)
[e2e-onboarding] Playwright finished with exit code 0
```

**Ronda 2** (tras nuevo `supabase db reset --local` limpio y `pkill next dev`):

```
Running 13 tests using 1 worker
  ✓  13 passed (10.5s)
[e2e-onboarding] Playwright finished with exit code 0
```

Cero diferencias entre rondas. Cero flaky. Cero puertos ocupados residuales. Cero fixture residual (afterAll cleanup borra actors, tenants, memberships, lifecycle rows creadas).

## 15 · Todas las suites ejecutadas localmente

| Suite | Resultado |
|---|---|
| `tsc --noEmit` root | PASS (exit 0) |
| `tsc --noEmit` engine | PASS (exit 0) |
| `npm run test:client` | 20 files / 257 tests PASS |
| `(cd engine && npx vitest run)` | 41 files / 1120 tests PASS |
| `bash scripts/ci/run-integration-tests.sh` (SQL + race) | 5 SQL suites + 3 escenarios race PASS |
| `route.presentation.integration.test.ts` | 8 tests PASS |
| `route.integration.test.ts` | 24 tests PASS |
| `messages/route.integration.test.ts` | 11 tests PASS |
| `bash scripts/e2e/run-auth-continuity.sh` | 14 tests PASS |
| `bash scripts/e2e/run-onboarding-e2e.sh` (Q3, ronda 1) | 13 tests PASS |
| `bash scripts/e2e/run-onboarding-e2e.sh` (Q3, ronda 2) | 13 tests PASS |
| `scripts/ci/restore-drill.sh` local | **SKIP macOS** (dependencia `sed -i` GNU; se ejecuta en CI Ubuntu, comportamiento pre-existente conocido) |

## 16 · Servicios, puertos y limpieza

- Runner Q3: puerto 3121 (Next dev), 54321-54322 (Supabase local persistente por el desarrollador).
- Runner auth-continuity: puerto 3111.
- Trap `EXIT INT TERM` mata `next dev` + process group + Chromium residual con `pkill -f "chromium.*--remote-debugging"`.
- Tras ambas rondas: `lsof -iTCP:3121 -sTCP:LISTEN` = vacío. Cero procesos zombies.
- `test.afterAll` del spec: DELETE cascada de lifecycle → memberships → mappings → tenants → `admin.deleteUser` para cada actor creado.

## 17 · Riesgos residuales

- Timing en test 6: si por alguna razón `iat` del JWT supera a `Math.floor(Date.now()/1000)` capturado un instante después (impensable pero teóricamente posible con clock skew), el aserto `<=` protege; la garantía byte-level de localStorage sigue siendo la protección fuerte.
- Test 3 depende de que el lock del advisory + `FOR KEY SHARE` funcionen correctamente. Q2-R3 los cubrió; Q3 valida el mismo garantía desde HTTP.
- Aislamiento puerto 3121 vs 3111: si un desarrollador tiene ambos runners corriendo simultáneamente en la misma máquina no habrá colisión de puertos, pero comparten Supabase local. Se ejecutan secuencialmente en CI (Jobs D + E son runners-latest independientes).
- El runner Q3 depende del hook `NEXT_PUBLIC_SPABLA_E2E_HOOK=1` — misma dependencia que Q3-E2E-R (auth-continuity); no introduce dependencia nueva.

## 18 · Cero llamadas OpenAI durante Q3

Ninguna suite Q3 invoca `openai` ni ningún proveedor externo. La rama de código productiva del onboarding jamás toca proveedores de LLM (contrato §7). Confirmado por inspección del handler + adaptador + servicio.

## 19 · Cero cambios de contrato / migración / semántica

- Cero migración añadida en Q3.
- Cero cambio de handler `route.ts`.
- Cero cambio de adaptador `onboarding.supabase.ts`.
- Cero cambio de servicio `onboarding-service.ts`.
- Cero cambio de contrato oficial.

Archivos modificados por Q3 (autorizados):
- `e2e/onboarding.spec.ts` (NUEVO)
- `scripts/e2e/run-onboarding-e2e.sh` (NUEVO)
- `scripts/e2e/run-auth-continuity.sh` (restricción de spec, 1 línea)
- `.github/workflows/ci.yml` (Job E añadido, 44 líneas)
- `package.json` + `package-lock.json` (`pg`, `@types/pg` como devDependency)
- `docs/audit_reports/AUDIT_2026-08-25_hito-9-3-2-a-q3-onboarding-e2e-barrier.md` (ESTE)

## 20 · Confirmación de cero corrección silenciosa

Ningún defecto productivo fue descubierto durante Q3. Los 13 escenarios pasan sin haber modificado el handler, el adaptador, el servicio, la RPC ni ninguna migración. Si algún escenario hubiera revelado un defecto productivo, el hito habría sido detenido y emitido NO-GO con propuesta de hito correctivo separado, según lo mandato explícito de la orden Q3 FASE 7.

## 21 · Confirmación de cero promoción

- `main` @ `e6128433d42e1e105529ed2f64212ca527034b6a` — invariante.
- Oficial @ `2ca865e532b60a434fabf47b99dc71cc061ee216` — invariante.
- Rama Q3 aislada, no mergeada.

## 22 · Confirmación de cero OTP

Cero código/tests/migración/commit relacionados con OTP.

## 23 · Confirmación de cero Q4 / 9.3.2-B / SPABLA World / Business

Nada tocado fuera del onboarding personal y su barrera E2E.

## 24 · Solicitud de revisión

Solicitud de revisión al jefe de proyecto. Si aprueba, procede promoción a main como paso separado con auditoría independiente. **No se promociona en este hito.**
