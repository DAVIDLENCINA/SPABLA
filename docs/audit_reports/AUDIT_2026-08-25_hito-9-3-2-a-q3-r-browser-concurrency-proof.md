# HITO 9.3.2-A-Q3-R · RECTIFICACIÓN FORENSE DE LA BARRERA E2E ONBOARDING

Fecha: 2026-08-25
Rama: `spabla-v2/hito-9-3-2-a-q3-r-browser-concurrency-proof`
Base exacta: `9232ec027f96464c1cc582284350ee2c072dcc66` (Q3)
Rama fuente: `spabla-v2/hito-9-3-2-a-q3-onboarding-e2e-barrier`
Rama oficial (invariante): `spabla-v2/thirteen-languages-activation` @ `2ca865e532b60a434fabf47b99dc71cc061ee216`
Main (invariante): `e6128433d42e1e105529ed2f64212ca527034b6a`

## 1 · Alcance de la rectificación

Q3-R rectifica exclusivamente las tres debilidades identificadas en la revisión forense de Q3:

1. Las llamadas contractuales a `POST /api/v2/onboarding` deben salir realmente desde Chromium.
2. La prueba de concurrencia debe demostrar solapamiento de forma determinista.
3. El runner debe respetar la custodia (Supabase preexistente vs. iniciado por el runner).

Además audita la integridad Markdown del acta Q3 y rectifica la afirmación técnicamente incorrecta que decía que `page.request` era "el network stack de Chromium".

No modifica producto. No promociona. No inicia OTP. No inicia 9.3.2-B.

## 2 · Base, rama, custodia inicial

- Base: `9232ec027f96464c1cc582284350ee2c072dcc66` (Q3 verificado remoto).
- Rama Q3-R creada desde esa base con `git switch -c`.
- Oficial y main verificados invariantes antes y al final del hito.
- Working tree limpio salvo `.claude/` (no tocado).
- Custodia inicial (2026-08-25, guardada en `/tmp/q3r-custodia-inicial.txt`):
  - **Supabase local ya estaba activo** (containers up ~1h) → política Q3-R: no detener al finalizar.
  - Cero procesos Next / Playwright / Chromium reales de prueba.
  - Puertos 3111, 3121, 54323 libres.
  - Rama `spabla-v2/hito-9-3-2-a-q3-onboarding-e2e-barrier` @ `9232ec02…`.

## 3 · Archivos modificados por Q3-R

| Archivo | Delta |
|---|---|
| `e2e/onboarding.spec.ts` | Reescritura de test 3 (concurrencia coordinada), test 5 (page.request → page.evaluate), test 12 (anti-regresión endurecido), helper `browserFetchOnboarding` (todas las llamadas contractuales) |
| `scripts/e2e/run-onboarding-e2e.sh` | Custodia (`SUPABASE_STARTED_BY_RUNNER`, `_snapshot`), cleanup respeta preexistencia, logs de custodia |
| `docs/audit_reports/AUDIT_2026-08-25_hito-9-3-2-a-q3-onboarding-e2e-barrier.md` | Rectificación línea 80: `page.request` NO es el network stack de Chromium |
| `docs/audit_reports/AUDIT_2026-08-25_hito-9-3-2-a-q3-r-browser-concurrency-proof.md` | Este acta (NUEVA) |

Cero cambios en producto, migraciones, contrato, endpoint, RPC, Auth productivo, RLS/grants o main. Cero cambios en Q2/Q2-R2/Q2-R3/OTP.

## 4 · Diagnóstico de `page.request`

`page.request` en Playwright expone `APIRequestContext`. La documentación oficial y el código de Playwright confirman que esa API es un cliente HTTP **Node-side** (undici bajo el capó). No pasa por Chromium: la request nunca alcanza el proceso renderer, nunca ejecuta hook de `fetch` del `window`, nunca respeta cookies dependientes de la página, y no observa políticas CORS / CSP como lo haría el navegador real.

Auditoría del Q3 candidato (`grep page\.request e2e/onboarding.spec.ts`):

- Escenarios 1, 2, 4, 6, 7, 8a, 8b, 9, 10, 11 usaban `page.request.post()` a través del helper `callOnboarding`.
- Escenario 5 usaba `page.request.post` directamente 4 veces.
- Escenario 3 (concurrencia) era el único que ya usaba `page.evaluate(fetch)`.

Además el acta Q3 §6 afirmaba literalmente "`page.request` (network stack de Chromium)". Afirmación técnicamente falsa → **rectificada** en el acta Q3 con nota que remite a este acta.

## 5 · Evidencia de `window.fetch` desde Chromium (Q3-R)

Nuevo helper `browserFetchOnboarding(page, token, opts)` en `e2e/onboarding.spec.ts`:

```ts
const result = await page.evaluate(
  async ({ baseUrl, token, method, bodyRaw, acceptLanguage }) => {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (acceptLanguage) headers["Accept-Language"] = acceptLanguage;
    if (bodyRaw !== null) headers["Content-Type"] = "application/json";
    const init: RequestInit = { method, headers };
    if (method !== "GET" && method !== "DELETE" && bodyRaw !== null) init.body = bodyRaw;
    const res = await fetch(`${baseUrl}/api/v2/onboarding`, init);
    const text = await res.text();
    return { status: res.status, text, correlationId: res.headers.get("x-spabla-correlation-id") };
  },
  { baseUrl: BASE_URL, token, method, bodyRaw, acceptLanguage: opts.acceptLanguage ?? null },
);
```

- `fetch(...)` corre **dentro del renderer Chromium** (el argumento de `page.evaluate` se serializa por CDP y se ejecuta en el contexto de la página).
- Todas las llamadas al endpoint pasan por `browserFetchOnboarding` — verificable con `grep -n "browserFetchOnboarding\|page\.request" e2e/onboarding.spec.ts` (cero `page.request` para el endpoint).
- Escenario 5 (Auth ausente/inválido) usa `page.evaluate(fetch)` inline 4 veces con distintos `Authorization` para forzar el 401.

Guarda estática anti-regresión (test 12):

```ts
const contractLineForbidden = specText.split(/\r?\n/).filter(({ line }) =>
  /\/api\/v2\/onboarding/.test(line) &&
  /page\.request|context\.request|APIRequestContext|request\.newContext/.test(line),
);
expect(contractLineForbidden).toEqual([]);
```

Si algún futuro cambio reintroduce `page.request` para el endpoint, el test 12 falla explícitamente.

## 6 · Prueba determinista de concurrencia

El criterio previo (`wall < 10 s` para 20 requests) queda eliminado. La nueva prueba (test 3) coordina con una conexión PostgreSQL de control:

1. `control = new PgClient(...)` → `BEGIN` → `SELECT pg_backend_pid()` (captura control PID).
2. `SELECT pg_advisory_xact_lock(hashtextextended($actor::text, 9321))` — mismo lock que la RPC intenta.
3. `dispatchPromise = page.evaluate(...)` — lanza N=8 `fetch` en `Promise.all`, dentro de Chromium, sin `await` en el runner.
4. Poll `pg_stat_activity` desde una **conexión distinta** hasta que ≥2 backends aparezcan con `wait_event='advisory'`. La conexión de poll es separada porque `control` está en transacción abierta y `pg_stat_activity` puede tardar en reflejar backends bloqueados por ELLA misma cuando se consulta desde la misma sesión.
5. `pg_blocking_pids(pid)` para cada waiter → prueba que control es el bloqueador principal.
6. Race-check anti-early-resolve: si algún fetch resolvió durante el poll, fallar (habría saltado la RPC).
7. `control.query('COMMIT')` → libera el lock.
8. `await dispatchPromise` → todas 200 con mismo `tenantId`.
9. Postcondiciones SQL: mapping=1, tenant=1, active=1, inactive=0.

**Evidencia observada** (ronda 2, ronda 3, ronda 1 post-reset):

```
[Q3-R concurrency] control_pid=1560 waiters=[
  {"pid":1532,"wait_event_type":"Lock","wait_event":"advisory","blockers":[1560]},
  {"pid":1531,"wait_event_type":"Lock","wait_event":"advisory","blockers":[1560,1532]},
  {"pid":1506,"wait_event_type":"Lock","wait_event":"advisory","blockers":[1560,1532,1531,1550,1530]},
  {"pid":1530,"wait_event_type":"Lock","wait_event":"advisory","blockers":[1560,1532,1531,1550]},
  {"pid":1549,"wait_event_type":"Lock","wait_event":"advisory","blockers":[1560,1532,1531,1550,1530,1506]},
  {"pid":1550,"wait_event_type":"Lock","wait_event":"advisory","blockers":[1560,1532,1531]}
]
```

**6 backends** esperando en `wait_event='advisory'`, cada uno con `blockers` incluyendo el `control_pid`. Es la prueba directa y contemporánea del solapamiento — no una inferencia por latencia.

Además el test 12 exige presencia literal en el spec de:
- `pg_advisory_xact_lock(hashtextextended($1::text, 9321))`
- `wait_event = 'advisory'`
- `pg_blocking_pids`

Y ausencia literal de:
- `wall.*toBeLessThan(10_000)` (el heurístico previo).

## 7 · Escenario 6 · actor eliminado con JWT previo

Preservado exactamente y ahora dispatch por `browserFetchOnboarding`:

1. `createUser` real vía Supabase Auth admin.
2. `signInAsUserInPage` → UI real → SDK cachea sesión en `localStorage[spabla_v2_fase9_auth]`.
3. Captura `access_token` y `iat` decodificado.
4. Snapshot `deletionEpoch = Math.floor(Date.now()/1000)`.
5. `admin.deleteUser(userId)` — API administrativa real.
6. Anti-falso-positivo #1: `expect(fx.issued_at_epoch).toBeLessThanOrEqual(deletionEpoch)`.
7. Anti-falso-positivo #2: `localStorage[STORAGE_KEY].access_token === fx.access_token` byte-a-byte → prueba de ausencia de refresh silencioso.
8. `browserFetchOnboarding(page, fx.access_token)` — `window.fetch` desde Chromium con el token original.
9. Assert `res.status === 401`, `body.error === "unauthorized"`, `correlationId` UUID.
10. SQL post: `mapping_count=0`, `tenant_count=0`.

Guarda estática (test 12): grep sobre el subblock POST-`deleteUser` verifica ausencia de `signInAsUserInPage(` y presencia de `browserFetchOnboarding(page, fx.access_token)`.

## 8 · Custodia del entorno

`scripts/e2e/run-onboarding-e2e.sh` añade:

- `SUPABASE_STARTED_BY_RUNNER=0/1` — se establece según si el runner encontró los containers `_spabla-hito-8-2-local` en `docker ps` ANTES de invocar nada.
- `_snapshot(tag)` — vuelca a `${SPABLA_E2E_CUSTODY_LOG}` los containers, PIDs Next/Chromium propios, y estado del puerto 3121. Se llama `initial` al empezar y `final` en cleanup.
- Cleanup:
  - **Siempre** mata Next dev (TERM + KILL al process group).
  - **Siempre** mata Chromium residual (`pkill -f "chromium.*--remote-debugging"`).
  - `supabase stop --no-backup` **sólo si** `SUPABASE_STARTED_BY_RUNNER=1`.
- Si el desarrollador tenía Supabase corriendo, el runner deja Supabase intacto y lo declara explícitamente en el log: `cleanup: leaving Supabase running (pre-existing before runner)`.

## 9 · Custodia inicial y final observadas

Custodia inicial (rondas locales; guardadas en `/tmp/q3r-custody-round{1,2,3}.log`):

```
== custody snapshot [initial] ==
-- containers --
supabase_auth_spabla-hito-8-2-local|Up N minutes (healthy)
supabase_db_spabla-hito-8-2-local|Up N minutes (healthy)
supabase_kong_spabla-hito-8-2-local|Up About an hour (healthy)
supabase_realtime_spabla-hito-8-2-local|Up N minutes (healthy)
supabase_rest_spabla-hito-8-2-local|Up About an hour
-- next/playwright/chromium PIDs from this runner --
-- port 3121 --
port 3121 free
```

Custodia final: idéntica (los mismos 5 containers, ninguno detenido, port 3121 libre, cero Next/Chromium residual del runner). Único cambio es la deriva monotónica de `Up N minutes` — esperada.

## 10 · Diferencia visual vs. real del acta Q3

Inspección directa del blob:

```bash
head -20 docs/audit_reports/AUDIT_2026-08-25_hito-9-3-2-a-q3-onboarding-e2e-barrier.md
```

Muestra literalmente los encabezados esperados:

```
# HITO 9.3.2-A-Q3 · BARRERA E2E DEL ONBOARDING PERSONAL ATÓMICO

Fecha: 2026-08-25
Rama: `spabla-v2/hito-9-3-2-a-q3-onboarding-e2e-barrier`
Base exacta: `43ebb6dd5d2d4782ea1054b218d08565a2a3a698` (Q2-R3)
Rama fuente: `spabla-v2/hito-9-3-2-a-q2-r3-auth-delete-race`
Contrato oficial (invariante): `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_2_A_ONBOARDING_CONTRACT.md` @ `2ca865e532b60a434fabf47b99dc71cc061ee216`
Rama oficial (invariante): `spabla-v2/thirteen-languages-activation` @ `2ca865e532b60a434fabf47b99dc71cc061ee216`
Main (invariante): `e6128433d42e1e105529ed2f64212ca527034b6a`

## 1 · Alcance y no-alcance
...
```

Los seis encabezados exigidos (`# HITO`, `Fecha:`, `Rama:`, `Base exacta:`, `Contrato oficial`, `Main`) están presentes y correctos. **La mutilación observada era exclusivamente visual del canal de reporte.** El archivo Markdown no está dañado. Q3-R NO modifica esas líneas.

La única modificación del acta Q3 es una nota en la línea que decía "page.request (network stack de Chromium)" — rectificación técnica obligatoria por FASE 3 y §10 de la orden Q3-R.

## 11 · Resultado de los 13 escenarios (rondas locales)

Todas las rondas dispatchan `13 tests using 1 worker`, `test.describe.serial`:

- Test 1 (new user): PASS (~1.3s)
- Test 2 (idempotencia): PASS (~0.6s)
- Test 3 (concurrencia deterministic 6 waiters advisory): PASS (~0.9s)
- Test 4 (autoridad servidor): PASS (~0.6s)
- Test 5 (Auth ausente/inválida 4×401): PASS (~0.3s)
- Test 6 (actor eliminado + JWT previo): PASS (~0.6s)
- Test 7 (reactivación membership): PASS (~0.6s)
- Test 8a (deletion_pending): PASS (~0.6s)
- Test 8b (legal_hold): PASS (~0.6s)
- Test 9 (localización): PASS (~0.7s)
- Test 10 (métodos → 404): PASS (~0.6s)
- Test 11 (dos actores aislados): PASS (~1.1s)
- Test 12 (anti-falso-positivo endurecido): PASS (~15ms)

Cero skipped. Cero retries. Cero flaky.

## 12 · Auth continuity 14/14

`bash scripts/e2e/run-auth-continuity.sh` ejecutado tras `supabase db reset --local` limpio:

```
Running 14 tests using 1 worker
  ✓  1..14 (todos PASS)
  14 passed (20.8s)
[e2e] Playwright finished with exit code 0
```

Sin regresión sobre Q3-E2E-R.

## 13 · Rondas locales

- **Ronda 1** (tras `supabase db reset --local` + espera PostgREST recovery):
  - auth-continuity 14/14 PASS
  - onboarding Q3-R 13/13 PASS (concurrencia 6 waiters)
- **Ronda 2** (sin reset, Supabase estable, tras kill Next):
  - onboarding Q3-R 13/13 PASS (concurrencia 6 waiters)
- **Ronda 3** confirmatoria (idéntico patrón):
  - onboarding Q3-R 13/13 PASS (concurrencia 6 waiters)

Cero diferencias en resultados entre rondas. Cero flaky.

## 14 · Regresión completa

Todas las suites históricas se ejecutan y pasan:

| Suite | Estado | Detalle |
|---|---|---|
| `tsc --noEmit` root | PASS (exit 0) | — |
| `tsc --noEmit` engine | PASS (exit 0) | — |
| `npm run test:client` | PASS | 20 files / 257 tests |
| Engine Vitest (con env `SPABLA_TEST_*`) | PASS | 41 files / 1120 tests |
| SQL integration + race Q2-R3 | PASS | 5 suites + 3 escenarios race |
| onboarding presentation/integration/messages | PASS | 3 files / 43 tests |
| auth-continuity Q3-E2E-R | PASS | 14/14 |
| onboarding Q3-R (nueva) | PASS | 13/13 |

## 15 · Ausencia de defectos productivos descubiertos

La rectificación Q3-R NO descubrió defecto productivo alguno. El único bug encontrado fue **en el propio spec de Q3** (uso de `page.request`) y **en el propio runner** (custodia insuficiente). Ambos son artefactos de la barrera, no del producto. Q3-R no toca producto, migraciones, contrato, RPC, RLS/grants ni Auth productivo.

## 16 · Riesgos residuales

- **PostgREST post-reset**: tras `supabase db reset --local`, PostgREST tarda unos segundos en recargar su schema cache. El runner `--reset` ya deja ~90s de tiempo de arranque de Next dev; en local sin `--reset` no aplica. En CI Job E aplica.
- **Pool PostgREST bajo carga extrema**: si algún día se sube N=8 a valores muy altos (>10), el pool podría saturarse. N=8 está dentro del pool default (10) y probado repetidamente.
- **`iat` a nivel segundo**: si el reloj del emisor Auth y del proceso Node divergen, `iat === deletionEpoch` sería frontera. La comparación `<=` lo tolera y el check byte-level de localStorage sigue siendo la garantía anti-refresh fuerte.
- **`page.evaluate` bloqueante para poll desde misma conexión**: Q3-R resuelto usando conexión `poll` separada. Documentado por defensa en el propio test.

## 17 · Servicios, puertos, working tree final

- Containers Supabase: idénticos a la custodia inicial. Ningún container detenido por Q3-R.
- Procesos Next/Playwright/Chromium: cero (cleanup exitoso).
- Puerto 3121: libre.
- Puerto 3111 (auth-continuity): libre.
- Working tree: modificado según §3; sólo los archivos autorizados de Q3-R. `.claude/` untracked, sin cambios.

## 18 · Estado de ramas

- Q3-R local = remoto (tras push).
- Oficial `spabla-v2/thirteen-languages-activation` @ `2ca865e532b60a434fabf47b99dc71cc061ee216` — invariante.
- Main @ `e6128433d42e1e105529ed2f64212ca527034b6a` — invariante.
- Q3 (`9232ec02…`) intacta como base.

## 19 · Diferencia entre `APIRequestContext` y `window.fetch`

| Aspecto | `page.request` / `APIRequestContext` | `page.evaluate(fetch)` |
|---|---|---|
| Ubicación de ejecución | Node.js del proceso Playwright | Renderer Chromium (V8 de la página) |
| Cliente HTTP | undici (Node) | Chromium network stack (net::URLLoader) |
| Cookies | Contexto Playwright (no del document) | Documento cargado (real) |
| CORS / CSP | No respeta la política del documento | Sí, respeta origin del documento |
| `beforeRequest` hook | No | Sí (documento real) |
| Prueba de "flow del navegador" | NO — es un cliente Node | SÍ — es la ruta real del navegador |

Para una barrera E2E que quiere demostrar que "el navegador ejecuta la petición", `page.evaluate(fetch)` es la única elección correcta. Q3-R rectifica.

## 20 · Confirmación de cero promoción

- Main invariante.
- Oficial invariante.
- Contrato oficial invariante.
- Rama Q3-R no promocionada, no mergeada.

## 21 · Confirmación de cero OTP / Q4 / 9.3.2-B

Cero código, cero tests, cero migraciones, cero commits relacionados con OTP, Q4, 9.3.2-B, SPABLA World o SPABLA Business.

## 22 · Confirmación de cero producto modificado

Verificable con:

```bash
git diff 9232ec02..HEAD -- app/ lib/ supabase/migrations/ docs/phases/
```

Devuelve vacío. Todo el diff Q3-R está confinado a `e2e/`, `scripts/e2e/`, y `docs/audit_reports/`.

## 23 · Integridad del acta Q3

- Encabezados presentes y correctos → §10 de este acta.
- Cambio realizado en Q3: solo la línea 80 (afirmación `page.request` (network stack de Chromium)) recibió una nota de rectificación con enlace a este acta.
- Cero reescrituras de conclusiones históricas innecesarias (§7 orden).

## 24 · Solicitud de revisión

Solicitud de revisión al jefe de proyecto. Q3-R rectifica la implementación E2E del onboarding sin tocar producto. Si aprueba, procede promoción a main como paso separado con auditoría independiente. **No se promociona en este hito.**
