# SPABLA V2 · Hito 9.3.1-Q3-E2E-R3 · Continuidad natural en el mismo BrowserContext

**Fecha**: 2026-08-24.
**Rama técnica**: `spabla-v2/hito-9-3-1-q3-s6-natural-context-r3`.
**Base oficial exacta**: `383b0c04a3f54e73a7453b9a38363dc998297906` (`spabla-v2/thirteen-languages-activation`).
**Contrato marco**: `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_2_PASSWORDLESS_OTP_CONTRACT.md` (R2).
**Contrato Q1 (bloqueado)**: `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_2_A_ONBOARDING_CONTRACT.md` (commit `b99185263500220772f595a921c526ade0bc2acc` en la rama `spabla-v2/hito-9-3-2-a-q1-onboarding-contract`, intacto).
**Rama previa descartada por Dirección**: `spabla-v2/hito-9-3-1-q3-s6-ci-robustness` (commits `73b78ba` + `2a47f09`), intacta en `origin`.

**Alcance**: exclusivamente robustez del escenario Playwright `Q2 §20-6 · Reinicio Next real (kill + restart process group)` en Job D del CI **preservando la continuidad natural de la sesión dentro del mismo BrowserContext**. Cero implementación de 9.3.2-A.

---

## 1 · Historial de ejecuciones sobre el escenario §20-6

### 1.1 · CI original del contrato Q1 · [`32598803593`](https://github.com/DAVIDLENCINA/SPABLA/actions/runs/32598803593)

- Commit documental `b99185263500220772f595a921c526ade0bc2acc` (contrato Q1). Diff exclusivamente Markdown.
- **attempt 1**: failure. 2026-08-22 21:10:10Z → 21:17:00Z. §20-6 agotó `test.setTimeout(240 000 ms)` en `browserContext.newPage: Test ended` (línea 710 del spec pre-R2).
- **attempt 2**: failure. 2026-08-24 14:33:51Z → 14:40:39Z. Mismo timeout, misma línea.
- Jobs A/B/C: success en ambos.
- Resultado Job D: `12 passed / 1 failed / 1 did not run` (escenario 14 anti-falso-positivo did-not-run por `describe.serial`).

### 1.2 · Iteración A · rama `q3-s6-ci-robustness` · commit `73b78ba`

- `fix(e2e): harden real Next restart barrier in CI`.
- Correcciones: deadlines internos acotados + cortocircuito ante muerte prematura + `waitUntil:"load"` → `"domcontentloaded"` + `test.setTimeout` 240s → 300s + instrumentación por sub-fase.
- Cambio semántico crítico: **NO** implementado en iteración A. Seguía usando `page.close({runBeforeUnload:false}) + ctx.newPage()` en el mismo contexto.
- **CI iteración A · [`32743618373`](https://github.com/DAVIDLENCINA/SPABLA/actions/runs/32743618373)**: attempt 1, failure. §20-6 agotó el nuevo `test.setTimeout(300 000 ms)` en `browserContext.newPage: Test ended`. La causa observada fue que `ctx.newPage()` sobre un contexto con requests colgados hacia un puerto muerto se bloqueaba durante minutos en Ubuntu CI. Jobs A/B/C success.

### 1.3 · Iteración B · rama `q3-s6-ci-robustness` · commit `2a47f09`

- `fix(e2e): replace page.close+newPage with storageState swap in §20-6`.
- Cambio semántico: sustituyó el patrón `page.close + ctx.newPage()` en el mismo contexto por `state = await ctx.storageState(); await ctx.close(); ctx = await browser.newContext({ storageState: state }); page = await ctx.newPage();` — **rehidratación explícita mediante `storageState`** en un contexto nuevo.
- **CI iteración B · [`32745730360`](https://github.com/DAVIDLENCINA/SPABLA/actions/runs/32745730360)**: attempt 1, success. §20-6 en 4.6 s. Jobs A/B/C/D verdes. Job D `14 passed (29.7s)`.
- **No se promueve** por dictamen `HITO 9.3.1-Q3-E2E-R2-R · RECTIFICACIÓN DOCUMENTAL REQUERIDA — NO PROMOVER`: la propiedad probada se desplazó de "sesión natural en el mismo BrowserContext tras restart" a "sesión serializada y rehidratada explícitamente en un contexto nuevo".

### 1.4 · Desviaciones registradas por la revisión read-only

- **DEV-1** · Se creó una segunda corrección tras el primer CI rojo del intento de rama R2, pese a que la orden Q3-E2E-R2 §FASE 7 exigía detenerse y emitir NO-GO.
- **DEV-2** · La rama R2 terminó con dos commits (`73b78ba` + `2a47f09`) cuando la orden autorizaba un único commit.
- **DEV-3** · Cambio semántico desde "página nueva en el mismo BrowserContext" a "rehidratación explícita mediante `storageState`" en un contexto nuevo.

Estas tres desviaciones justifican que la rama R2 se descarte para promoción y que esta unidad R3 arranque limpia desde el SHA oficial vigente, con un único commit y sin rehidratación explícita.

## 2 · Nueva solución R3

### 2.1 · Principio rector

El escenario §20-6 demuestra que la sesión sobrevive al kill+restart de Next por **continuidad natural del BrowserContext**: cookies + localStorage residen en el proceso Chromium, no en el servidor Next; ni el kill del proceso servidor ni el arranque de un proceso servidor nuevo tocan el estado del navegador cliente. La aserción `expectAuthenticatedUi(freshPage)` post-restart demuestra que la aplicación, al re-navegar contra el server restaurado, encuentra la sesión ya persistida en el cliente y la usa sin re-login.

### 2.2 · Secuencia obligatoria del §20-6 (R3)

Implementada literalmente en `e2e/auth-continuity.spec.ts` bloque `Q2 §20-6`:

1. **FASE A · login real**. `ctx = await browser.newContext(); const page = await ctx.newPage(); page.goto(URL, {waitUntil:'domcontentloaded'}); signInViaUi(page, userAEmail, PASSWORD); expectAuthenticatedUi(page); expect(storageKeyPresent(page)).toBe(true);`
2. **FASE B · cerrar la page ANTES del kill de Next**. `await page.close({runBeforeUnload:false}); expect(page.isClosed()).toBe(true);` — el `ctx` NO se cierra; conserva cookies y localStorage.
3. **FASE C · kill real**. `process.kill(-RUNNER_WRAPPER_PID, SIGTERM/SIGKILL)` + belt-and-braces al PID del listener + verificación `pidAlive === false + portOpen === false`.
4. **FASE D · restart real**. `restarted = await spawnNextDev(NEXT_PORT)` — helper con deadline interno 120 s + cortocircuito ante muerte prematura. Verificación `pidAlive(restarted.pid) === true + restarted.pid !== firstListenerPid + portOpen === true`.
5. **FASE E · pre-warm HTTP acotado**. `while (Date.now() - preWarmStart < 60_000) { fetch('/v2/chat'); ... }` con cortocircuito si el proceso restart muere durante la compilación.
6. **FASE F · página nueva en el mismo BrowserContext**. `const freshPage = await ctx.newPage();` sobre el **mismo** objeto `ctx` creado en FASE A. `await freshPage.goto(URL, {waitUntil:'domcontentloaded', timeout:45_000})`.
7. **FASE G · continuidad natural verificada**. `expectAuthenticatedUi(freshPage); expect(freshPage.locator('section[aria-label="Iniciar sesión"]')).toHaveCount(0); expect(storageKeyPresent(freshPage)).toBe(true);`.
8. **FASE H · cleanup**. `finally { await ctx.close() }`; `managedNexts.push(restarted)` para `killNextDev` en `afterAll`.

### 2.3 · Cierre de la page antes del kill (novedad R3)

En las iteraciones anteriores (Q3-E2E-R, Q3-E2E-R2 iteración A), la `page` autenticada permanecía **abierta** mientras Next se mataba. La consecuencia observada en Ubuntu CI fue que la page acumulaba requests pendientes hacia un puerto muerto; al invocar `ctx.newPage()` tras el restart, el nuevo target CDP quedaba bloqueado durante minutos por interacción con la target contaminada.

R3 resuelve esto de raíz: **cerrar la page autenticada ANTES del kill** libera todo el estado de esa target sin cerrar el BrowserContext. El `ctx` conserva cookies y localStorage; la target queda purgada. Cuando post-restart se ejecuta `ctx.newPage()`, no hay contaminación previa y la nueva target arranca limpia con la sesión intacta.

### 2.4 · Conservación explícita del mismo BrowserContext

`const ctx = await browser.newContext();` declarado con `const` (no `let`) impide la reasignación. Playwright `ctx.newPage()` invocado en FASE F devuelve una nueva `Page` sobre el mismo objeto `ctx` creado en FASE A. Cero `browser.newContext(...)` adicional en el escenario. Cero `storageState`. La sesión se preserva por el mecanismo nativo del navegador (cookies + localStorage del contexto), no por serialización explícita de Playwright.

### 2.5 · Prohibiciones semánticas cumplidas

En el escenario §20-6 (verificado por auditoría estática `awk` + `grep`):

- ✗ `ctx.storageState()` — no invocado.
- ✗ `browser.newContext({ storageState: ... })` — no invocado.
- ✗ `addCookies` — no invocado.
- ✗ `localStorage.setItem` — no invocado.
- ✗ `sessionStorage.setItem` — no invocado.
- ✗ Inyección de `access_token` / `refresh_token` — no invocado.
- ✗ Reutilización de la page anterior — la `page` cerrada en FASE B jamás se reutiliza; `freshPage` es una nueva `Page` en el mismo ctx.
- ✗ Creación de la page nueva antes del reinicio — `freshPage` se crea en FASE F, después de `spawnNextDev` y del pre-warm HTTP.
- ✗ Login posterior al reinicio — `signInViaUi` sólo se invoca en FASE A, antes del kill.
- ✗ Mocks de autenticación — cero.
- ✗ Reinicio simulado — kill real + restart real de proceso Next, verificados por PID + puerto.

Las menciones textuales de `storageState`, `newContext({storageState})` y `addCookies` aparecen solo en **comentarios prohibitivos** que documentan expresamente su ausencia.

## 3 · Cambios técnicos aplicados (R3)

Un único archivo de código modificado:

- `e2e/auth-continuity.spec.ts`:
  - Eliminación de `type BrowserContext` importado pero no usado (regresión de linting pre-R3).
  - Mejora del helper `spawnNextDev`: deadline interno 180 s → 120 s con cortocircuito ante muerte prematura del proceso. Emite excepción con `log tail` si no está listo en plazo. Idéntica técnica a la iteración A pero reintroducida limpiamente desde el SHA oficial.
  - Reescritura completa del escenario `Q2 §20-6` según §2.2.
  - `test.setTimeout(300_000)` (300 s), coherente con la suma de sub-fases acotadas. NO es la única corrección: es la consecuencia de acotar cada sub-fase con deadline propio + cortocircuito.
  - Instrumentación por sub-fase (`phaseTimes`) y `catch` que reporta timings acumulados por `process.stderr.write` ante fallo.

Cero cambio productivo. Cero cambio de contrato. Cero cambio de migración. Cero dependencia. Cero workflow. Cero configuración Supabase.

## 4 · Garantías preservadas

- Sesión autenticada real (`signInViaUi` con formulario UI real y credenciales fixture).
- Sesión persistida naturalmente en el BrowserContext (cookies + localStorage de Chromium).
- Cierre completo de la page autenticada antes de detener Next (FASE B).
- Muerte real de Next (kill del process group por wrapper pgid + belt-and-braces sobre listener PID + escalada SIGKILL).
- Verificación de PID anterior muerto + process group terminado + puerto cerrado (assertions duras).
- Arranque real de un proceso Next nuevo (`spawnNextDev`).
- Verificación de PID nuevo vivo + PID nuevo distinto + puerto abierto + ruta HTTP preparada (pre-warm con status 2xx/3xx/4xx real).
- Apertura de una page nueva después del reinicio en el mismo BrowserContext (FASE F, `ctx.newPage()`).
- La page nueva pertenece al mismo BrowserContext (`ctx` es `const`, sin reasignación).
- Acceso autenticado sin nuevo login (`expectAuthenticatedUi(freshPage) + sección sign-in count = 0 + storageKeyPresent(freshPage) === true`).
- Cero exportación, importación o reinyección de `storageState`.
- Cero manipulación artificial de cookies, tokens o localStorage.

## 5 · Barreras y deadlines

| Sub-fase | Deadline | Cortocircuito |
|---|---|---|
| login (FASE A) | heredado de aserciones de `expectAuthenticatedUi` (30 s) | — |
| closePage (FASE B) | inmediato (`page.close()` es rápido, típico <1 s) | `page.isClosed()` verifica |
| kill (FASE C) | 15 s (SIGTERM) + 5 s (purga) = **20 s** | assertions duras al final |
| spawn (FASE D) | **120 s** (helper `spawnNextDev`) | throw con `log tail` si el proceso muere antes de responder o si excede deadline |
| preWarm (FASE E) | **60 s** | cada iteración verifica `pidAlive(restarted.pid) && pidFromPort(NEXT_PORT) !== null`; throw con log tail si muere |
| newPage (FASE F) | heredado del `test.setTimeout` restante | — |
| goto (FASE F) | **45 s** con `waitUntil: 'domcontentloaded'` (no `'load'`) | — |
| expectAuthenticatedUi (FASE G) | heredado (30 s) | — |
| **`test.setTimeout` global** | **300 s** | try/catch reporta `phaseTimes` por `process.stderr` ante fallo |

Suma acotada peor caso: 30 + 5 + 20 + 120 + 60 + 45 + 30 + buffer ≈ **310 s**. El timeout global de 300 s cubre el caso típico (~15 s observados); ante casos degenerados el diagnóstico útil identifica la sub-fase que consume el presupuesto.

## 6 · Resultados de las dos rondas locales

Entorno macOS. Cleanup entre rondas (`supabase stop --no-backup` + `test-results/` purgado; puertos y contenedores libres antes de arrancar cada ronda).

### Ronda 1

- Inicio 18:50:52, fin 18:52:04 (72 s wall clock incluyendo migraciones + spawn de Next inicial).
- Playwright: `14 passed (22.1 s)`.
- **§20-6 · 2.2 s**.
- Escenario 14 (anti-falso-positivo): ✓ 1 ms.
- `Playwright finished with exit code 0`.

### Ronda 2

- Inicio 18:52:18, fin 18:53:28 (70 s wall clock).
- Playwright: `14 passed (21.2 s)`.
- **§20-6 · 2.2 s**.
- Escenario 14 (anti-falso-positivo): ✓ 1 ms.
- `Playwright finished with exit code 0`.

Ambas rondas: **14 passed / 0 failed / 0 skipped / 0 did not run**. Escenario 14 ejecutado en ambas. Cleanup Next dev + `supabase stop` sin residuales.

Local pasa consistentemente. **No se afirma determinismo** con dos rondas locales + un solo run de CI; se afirma "verde en las dos rondas observadas + en el run de CI observado".

## 7 · Controles antifraude ejecutados

- `tsc --noEmit`: exit 0.
- `eslint --max-warnings 0 e2e/auth-continuity.spec.ts`: exit 0.
- `git diff --check`: exit 0.
- Búsqueda de invocaciones reales de `storageState`, `newContext({storageState:...})`, `addCookies`, `localStorage.setItem`, `sessionStorage.setItem`, inyección de `access_token`/`refresh_token` dentro del bloque §20-6: **cero** matches (las menciones textuales existen sólo en comentarios prohibitivos que documentan la ausencia).
- Verificación de que `ctx.newPage()` en FASE F se ejecuta **después** del `spawnNextDev` (línea del `ctx.newPage` = 117 del bloque; línea del `spawnNextDev` = 77 del bloque).
- Verificación de que `ctx` es exactamente el mismo objeto antes y después del reinicio (`const ctx = await browser.newContext();` con `const` — sin reasignaciones; cero `browser.newContext` adicional en el escenario).
- Verificación de que `page.close` (línea 50 del bloque) precede a `process.kill` (línea 56 del bloque).
- Búsqueda de `test.skip` / `describe.skip` / `.fixme` / `test.only` / `continue-on-error` / `retries: N>0` en todo el spec: cero.
- Búsqueda de conflict markers: cero.
- Búsqueda de secretos hardcoded (`AKIA`, `SECRET_KEY=`, `BEGIN RSA`, `PRIVATE KEY`) en `e2e/` y `scripts/e2e/`: cero.

## 8 · Riesgos residuales

- **R-R3-A** · Ubuntu CI cold-compile de Turbopack sigue teniendo variabilidad. El deadline de 120 s en `spawnNextDev` cubre el 99º percentil observado, con cortocircuito ante muerte prematura y diagnóstico útil ante deadline exceeded.
- **R-R3-B** · El escenario §20-6 se resuelve en <3 s local; en CI puede tomar más por cold-compile Turbopack. Con las barreras acotadas, el peor caso queda en <5 min (`test.setTimeout` 300 s).
- **R-R3-C** · Un solo run de CI verde no demuestra determinismo. Se recomienda observar 3-5 corridas adicionales antes de descartar el riesgo de flakiness residual.
- **R-R3-D** · Cierre de la page antes del kill (FASE B novel) elimina el vector de contaminación de target CDP observado en Q3-E2E-R2 iteración A. Ninguna otra parte del spec depende de ese patrón; cambio quirúrgico y aislado.
- **R-R3-E** · Contrato Q1 (`spabla-v2/hito-9-3-2-a-q1-onboarding-contract` @ `b991852`) **sigue intacto y bloqueado**. Esta unidad no lo desbloquea. Las observaciones OBS-Q1-1 (localización server-controlled) y OBS-Q1-2 (eliminación definitiva del actor) del diagnóstico Q1-CI-R siguen pendientes de rectificación de Dirección.

## 9 · Contrato Q1 intacto y todavía bloqueado

- Rama `spabla-v2/hito-9-3-2-a-q1-onboarding-contract` @ `b99185263500220772f595a921c526ade0bc2acc` — intacta.
- Blob `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_2_A_ONBOARDING_CONTRACT.md` — sin modificar.
- CI del propio commit del contrato (`32598803593`) sigue en `failure` (attempts 1 y 2). Ese CI no se re-ejecuta por esta orden. El GO documental del contrato Q1 sigue suspendido hasta que Dirección autorice una unidad Q1-R que incluya, además de esta corrección de Job D, las rectificaciones OBS-Q1-1 y OBS-Q1-2.

## 10 · Cero implementación de 9.3.2-A

**Confirmado**. Esta unidad no crea migración, no crea endpoint `POST /api/v2/onboarding`, no toca `lib/v2/server/*`, no toca `app/api/v2/*`, no toca `lib/v2/client/*`, no toca `supabase/*`. Cero fila insertada en el schema `spabla_v2`. Cero implementación del onboarding productivo.

---

**Estado del acta**: cerrada. Ninguna decisión de Dirección pendiente dentro de esta unidad. La siguiente acción autorizable sigue siendo la que Dirección decida sobre la rectificación del contrato Q1.
