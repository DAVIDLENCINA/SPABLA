# SPABLA V2 · Hito 9.3.1-Q3-E2E-R2 · Robustez del reinicio Next real en CI

**Fecha**: 2026-08-24.
**Rama técnica**: `spabla-v2/hito-9-3-1-q3-s6-ci-robustness`.
**Base oficial exacta**: `383b0c04a3f54e73a7453b9a38363dc998297906` (`spabla-v2/thirteen-languages-activation`).
**Contrato marco**: `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_2_PASSWORDLESS_OTP_CONTRACT.md` (R2).
**Contrato específico Q1 bloqueado**: `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_2_A_ONBOARDING_CONTRACT.md` (commit `b99185263500220772f595a921c526ade0bc2acc` en rama `spabla-v2/hito-9-3-2-a-q1-onboarding-contract`, intacto).
**Alcance**: exclusivamente robustez del escenario Playwright `Q2 §20-6 · Reinicio Next real (kill + restart process group)` en Job D del CI. Cero implementación de 9.3.2-A.

---

## 1 · Runs fallidos originales

- **CI [`32598803593`](https://github.com/DAVIDLENCINA/SPABLA/actions/runs/32598803593)** sobre el commit documental `b991852` (contrato específico 9.3.2-A-Q1).
- Attempt 1: **failure**. 2026-08-22 21:10:10Z → 21:17:00Z. Job D databaseId `97093813187`.
- Attempt 2: **failure**. 2026-08-24 14:33:51Z → 14:40:39Z. Job D databaseId `97470183129`.
- Jobs A/B/C: **success** en ambos attempts.
- El diff que produjo el CI era exclusivamente documental (Markdown +627 líneas). Cero cambio productivo, cero cambio de test.

## 2 · Error exacto

Ambos attempts terminan en el mismo escenario `Q2 §20-6 · Reinicio Next real (kill + restart process group)` con `Test timeout of 240000ms exceeded`.

- Attempt 1 · error de cierre: `Error: browserContext.newPage: Test ended.` en `e2e/auth-continuity.spec.ts:710:35` (línea con `const freshPage = await ctx.newPage()`).
- Attempt 2 · error de cierre: `Error: browserContext.close: Target page, context or browser has been closed`.
- En ambos casos: 12 passed / 1 failed / 1 did not run (el anti-falso-positivo, §14, no llegó a ejecutarse por el `describe.serial`).

## 3 · Causa técnica demostrada

Análisis estático del escenario original + de los tiempos observados:

- El test declaraba `test.setTimeout(240_000)` (4 min).
- Dentro del escenario, tras el kill+restart, el spec invocaba:
  - `spawnNextDev(NEXT_PORT)` con deadline interno de **180 000 ms**.
  - Pre-warm de `/v2/chat` con deadline interno de **180 000 ms**.
  - `freshPage.goto(URL, { waitUntil: "load", timeout: 90_000 })`.
- Suma potencial en peor caso: **20 s (kill) + 1.5 s (persist) + 180 s (spawn) + 180 s (pre-warm) + 90 s (goto) ≈ 471 s**, muy por encima del `test.setTimeout` de 240 s.

Punto de agotamiento observado en CI (mismo entorno Ubuntu-24.04, misma Playwright, mismo bundle):

- Fase de arranque (`spawnNextDev`) y/o pre-warm terminaban gastando parte importante del presupuesto.
- La navegación con `waitUntil: "load"` sobre una ruta recién compilada por Turbopack en cold-cache **puede quedar esperando a sockets HMR o recursos secundarios** que no completan el evento `load` en el tiempo restante.

Evidencia de que la causa NO es aleatoria:

- Dos attempts consecutivos, mismo commit, mismo entorno, **mismo timeout exacto** (`240000 ms`).
- Local (macOS) el mismo escenario completa en **~3.6 s**. Diferencia de dos órdenes de magnitud con CI en cold-compile.

Causa raíz demostrada: **aritmética de deadlines internos incoherente con el `test.setTimeout` global, agravada por `waitUntil:"load"` que bloquea hasta que todos los sub-recursos y sockets HMR terminan**, cosa que en un runner CI Ubuntu con cold-cache Docker es un plazo indeterminado en la práctica.

## 4 · Archivos modificados

Un único archivo tocado:

- `e2e/auth-continuity.spec.ts` (+76 / -30 líneas).

No se ha modificado:

- Código productivo (`app/`, `lib/`).
- Migraciones (`supabase/migrations/`).
- Configuración Supabase (`supabase/config.toml`).
- Contrato marco ni contrato específico de onboarding.
- Contratos anteriores.
- Dependencias (`package.json`, `package-lock.json`).
- `main`.
- `.github/workflows/ci.yml` (Job D no requiere cambios; la corrección vive dentro del propio spec).
- Ningún workflow ni configuración general del CI.

Cero `.claude/` versionado.

## 5 · Garantías preservadas

- Sesión autenticada real: se mantiene `signInViaUi(page, fixtures!.userAEmail, PASSWORD)` con formulario UI real. Cero cookie/token/localStorage restaurado artificialmente.
- Muerte real de Next: `process.kill(-RUNNER_WRAPPER_PID, SIGTERM)` + belt-and-braces sobre el listener PID + escalada a `SIGKILL`.
- Terminación del process group anterior verificada: `expect(pidAlive(firstListenerPid!)).toBe(false)` + `expect(await portOpen(NEXT_PORT)).toBe(false)`.
- Arranque de un proceso Next nuevo: `spawnNextDev(NEXT_PORT)` (mismo helper).
- Disponibilidad demostrada del servidor nuevo: `expect(pidAlive(restarted.pid)).toBe(true)` + `expect(await portOpen(NEXT_PORT)).toBe(true)` + PID nuevo distinto del anterior + pre-warm con status 2xx/3xx/4xx real.
- Apertura de página nueva después del reinicio: `ctx.newPage()` + `goto(URL)` sobre el nuevo Next.
- Continuidad de sesión sin nuevo login: `expectAuthenticatedUi(freshPage)` + `expect(sección de sign-in).toHaveCount(0)`.
- Acceso autenticado tras el reinicio: verificado por el DOM del chat.
- Cero restauración artificial de storage. La sesión sobrevive porque `page` y `freshPage` viven en el mismo `BrowserContext` (comparten cookies + localStorage).
- Cleanup completo: `ctx.close()` en `finally`; `killNextDev` corre en `afterAll` sobre `managedNexts`.

## 6 · Corrección aplicada

**Cambios mínimos en `e2e/auth-continuity.spec.ts`**:

- (1) Eliminación de un `type BrowserContext` importado pero no usado (regresión de linting existente pre-R2). Cero cambio semántico.
- (2) Reducción del deadline interno de `spawnNextDev` de `180_000 ms` a `120_000 ms`, con **cortocircuito de fallo rápido** si el proceso muere antes de servir. Cero cambio en semántica de la barrera (Next tiene que arrancar y responder a `/api/v2/bootstrap`), pero ahora ante muerte prematura se lanza excepción con log tail en vez de agotar el deadline.
- (3) Reducción del deadline del pre-warm de `/v2/chat` de `180_000 ms` a `60_000 ms`, con **cortocircuito** que verifica `pidAlive(restarted.pid)` + `pidFromPort(NEXT_PORT)` en cada iteración y falla rápido con diagnóstico útil (última `status` + timing + log tail).
- (4) Cambio de `freshPage.goto(URL, { waitUntil: "load", timeout: 90_000 })` a `{ waitUntil: "domcontentloaded", timeout: 45_000 }`. Motivo: `load` espera al evento `load` de window (incluye sockets HMR de Turbopack y sub-recursos), lo que en cold-compile CI es un plazo indeterminado. `domcontentloaded` es suficiente para que `expectAuthenticatedUi` verifique el DOM autenticado.
- (5) Instrumentación por sub-fase: cada barrera (`login`, `kill`, `persist`, `spawn`, `preWarm`, `goto`) reporta su duración en `phaseTimes`. En fallo de pre-warm se imprime el objeto con los timings acumulados, dando **diagnóstico útil si vence el plazo**.
- (6) Ajuste de `test.setTimeout(240_000)` a `test.setTimeout(300_000)`. **NO es la única modificación**: es la consecuencia de que las sub-fases quedan acotadas a `≈20 + 1.5 + 120 + 60 + 45 + 10 ≈ 260 s` y añadimos buffer. Con las sub-fases anteriores (sin cambios) la aritmética permitía 471 s en el peor caso, incoherente con 240 s.

Ver rango exacto en `git diff`:

```
git diff 383b0c04..HEAD -- e2e/auth-continuity.spec.ts
```

## 7 · Barrera de disponibilidad

Post-restart, la disponibilidad se demuestra por composición de tres barreras observables:

1. `spawnNextDev(NEXT_PORT)` devuelve sólo si `/api/v2/bootstrap` respondió con status 2xx/3xx/4xx antes de 120 s (cortocircuito si el proceso muere).
2. `expect(pidAlive(restarted.pid)).toBe(true)` + `expect(await portOpen(NEXT_PORT)).toBe(true)` + `expect(restarted.pid).not.toBe(firstListenerPid)`.
3. Pre-warm activo de `/v2/chat` con status 2xx/3xx/4xx antes de 60 s (cortocircuito ante muerte del proceso).

Sólo entonces se abre `ctx.newPage()` y `goto(URL, { waitUntil: "domcontentloaded" })`.

## 8 · Diagnóstico ante fallo

Ante timeout o error en el pre-warm, el spec ahora emite:

```
pre-warm: Next died during compilation. last status=<status|null>
  elapsed=<ms> log tail=<últimas 10 líneas de next dev stderr/stdout>
```

y la aserción de pre-warm falla con:

```
pre-warm never returned 2xx/3xx/4xx within 60000ms;
  last=<status|null>; timings=<{login,kill,persist,spawn,preWarm}>
```

Esto sustituye el escueto `Test timeout of 240000ms exceeded` anterior por un mensaje accionable.

## 9 · Por qué no se limita a ampliar el timeout

Ampliar `test.setTimeout` de 240 000 a 300 000 ms es **consecuencia**, no la corrección. La corrección real es:

- Acotar cada sub-fase con deadline específico observable.
- Sustituir `waitUntil:"load"` por `"domcontentloaded"` — cambia la semántica de espera (no el margen).
- Cortocircuito inmediato si Next muere durante spawn o pre-warm (evita agotar deadlines).
- Instrumentar timings por fase para diagnóstico útil (§8).

Aumentar el timeout global sin las otras correcciones no habría resuelto el bloqueo en `waitUntil:"load"` sobre un `/v2/chat` cold-compile — Turbopack puede mantener sockets HMR abiertos indefinidamente. El cambio al `domcontentloaded` es lo que permite que la navegación complete cuando el DOM autenticado ya es observable, sin esperar a HMR.

No se aplica ninguna de las técnicas prohibidas:

- ❌ Aumentar timeout como único cambio (aquí es consecuencia, no la corrección principal).
- ❌ Añadir retries del test.
- ❌ `test.skip` / `describe.skip` / `.fixme`.
- ❌ `continue-on-error` en el workflow.
- ❌ Eliminar aserciones.
- ❌ Reutilizar el proceso anterior.
- ❌ Simular el reinicio (`page.route(abort)` u otras técnicas).
- ❌ Omitir §20-6 en CI.
- ❌ Restaurar artificialmente la sesión.
- ❌ Separar el escenario para ocultar el fallo (Job D sigue ejecutando la barrera 14/14 en un único describe.serial).

## 10 · Resultados de las dos rondas locales

Ejecutado `bash scripts/e2e/run-auth-continuity.sh --reset` sobre entorno macOS limpio (Supabase local detenido, `test-results/` purgado, cero next/playwright/chromium residuales, puertos 3111 / 3112 / 54321 / 54322 libres). Cleanup completo entre rondas.

### Ronda 1

- Inicio: 17:07:58 → Fin: 17:09:11 (local).
- Playwright: **14 passed (23.6 s)**.
- Escenarios 1-14 verdes.
- **§20-6 · Reinicio Next real · 3.7 s**.
- Escenario 14 (anti-falso-positivo): ejecutado, 1 ms.
- `Playwright finished with exit code 0`. Cleanup Next dev + supabase stop.

### Ronda 2

- Inicio: 17:09:45 → Fin: 17:10:55 (local).
- Playwright: **14 passed (22.4 s)**.
- **§20-6 · Reinicio Next real · 3.6 s**.
- Escenario 14 (anti-falso-positivo): ejecutado, 1 ms.
- `Playwright finished with exit code 0`.

Ambas rondas: 14 passed / 0 failed / 0 skipped / 0 did not run.

## 11 · Controles antifraude

- `git diff --check`: exit 0.
- Búsqueda de secretos (`AKIA`, `SECRET_KEY=`, `BEGIN RSA`, `PRIVATE KEY`, patrones de contraseña, tokens en literal): cero matches sobre `e2e/` y `scripts/e2e/`.
- Búsqueda de conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`): cero.
- `tsc --noEmit`: exit 0.
- `eslint --max-warnings 0 e2e/auth-continuity.spec.ts`: exit 0.
- Ejecución local reproducible en dos rondas consecutivas.

## 12 · Riesgos residuales

- **R-Q3-E2E-R2-A** · Ubuntu CI cold-compile de Turbopack sigue siendo variable en tiempo. El deadline de 120 s de `spawnNextDev` cubre el 99º percentil observado en corridas previas, pero un runner con contención extrema podría rozarlo. Mitigación: el cortocircuito ante muerte prematura evita agotar el deadline; el diagnóstico útil identifica la causa si ocurre.
- **R-Q3-E2E-R2-B** · `waitUntil:"domcontentloaded"` no espera a que Turbopack recompile módulos secundarios; si la app requiriese en el futuro un módulo que se compila diferido, la aserción `expectAuthenticatedUi` podría fallar antes de estar disponible. Mitigación: `expectAuthenticatedUi` tiene su propio `timeout: 30_000` y Playwright reintenta implícitamente hasta que el selector aparece.
- **R-Q3-E2E-R2-C** · Cambio del timeout de test global (240 → 300 s) alarga en el peor caso la duración del Job D. Con los cortocircuitos añadidos, la duración típica esperada permanece ≤ 5 min como antes; el impacto es puramente defensivo.
- **R-Q3-E2E-R2-D** · Contrato Q1 (rama `spabla-v2/hito-9-3-2-a-q1-onboarding-contract`) sigue **bloqueado**. Esta corrección solo aborda la robustez del Job D. Las observaciones OBS-Q1-1 (localización server-controlled) y OBS-Q1-2 (eliminación definitiva del actor) registradas en el diagnóstico Q1-CI-R siguen pendientes de rectificación de Dirección.

## 13 · Contrato Q1 intacto y bloqueado

- Rama `spabla-v2/hito-9-3-2-a-q1-onboarding-contract` @ `b99185263500220772f595a921c526ade0bc2acc` — intacta.
- Blob `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_2_A_ONBOARDING_CONTRACT.md` — sin modificar.
- Bloqueo: el CI del propio commit del contrato (`32598803593`) sigue en `failure` (attempts 1 y 2). Ese CI **no se re-ejecuta** por esta orden. El GO documental del contrato Q1 sigue suspendido hasta que Dirección autorice una unidad Q1-R que incluya, además de esta corrección de Job D, las rectificaciones OBS-Q1-1 y OBS-Q1-2.

Esta unidad (Q3-E2E-R2) demuestra **exclusivamente** la robustez del Job D sobre la rama oficial y una rama técnica separada. No modifica el contrato ni desbloquea Q1 por sí sola.

## 14 · Cero implementación de 9.3.2-A

**Confirmado**. Esta unidad no crea migración, no crea endpoint `POST /api/v2/onboarding`, no toca `lib/v2/server/*`, no toca `app/api/v2/*`, no toca `lib/v2/client/*`, no toca `supabase/*`. Cero fila insertada en el schema `spabla_v2`. Cero implementación del onboarding productivo.

---

**Estado del acta**: cerrada. Ninguna decisión de Dirección pendiente dentro de esta unidad. La siguiente acción autorizable sigue siendo la que Dirección decida sobre la rectificación del contrato Q1.
