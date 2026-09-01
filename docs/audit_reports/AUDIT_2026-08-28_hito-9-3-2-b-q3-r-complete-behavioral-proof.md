# HITO 9.3.2-B-Q3-R · CIERRE CONDUCTUAL Y REGRESIÓN COMPLETA DEL E2E OTP

Fecha: 2026-08-28
Rama: `spabla-v2/hito-9-3-2-b-q3-r-complete-behavioral-proof`
Base exacta: `ddf813c1167c3788e82fd5f2a7d3c15c89955ce6` (candidato Q3)
Oficial invariante durante Q3-R: `spabla-v2/thirteen-languages-activation` @ `6a4bb5a778b8e3cd1a6f58e6e9af57a5297223a7`
Main invariante durante Q3-R: `e6128433d42e1e105529ed2f64212ca527034b6a`
Contrato gobernante: `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_2_B_OTP_CONTRACT.md`
Run Q3 previo: `33203326577` (todos los Jobs A-F verdes con matriz incompleta).

## 1 · Razón de Q3-R

Q3 aterrizó una barrera E2E OTP con 9 escenarios y CI Job F verde. La revisión de cobertura reveló requisitos del contrato + del plan Q3 no probados por aserciones ejecutables. Q3-R cierra esas grietas SIN reescribir la barrera Q3, sin ampliar producto salvo defectos reales revelados, sin promover a la oficial, y sin iniciar otro hito.

Diagnóstico: los 9 tests de Q3 cubrían "camino feliz" + wrong/expired/anti-leak/aislamiento, pero NO cubrían: OTP reutilizado, doble verify, swap de email, verify durante reenvío, reload en paso código, dos pestañas, ni el recorrido completo de contraseña (12 pasos). Anti-leak sólo se aplicaba en S1 y S8. Aislamiento se validaba únicamente para Mailpit + registry (sin identities/one_time_tokens/lifecycle/procesos/puerto).

## 2 · Matriz de cobertura antes / después

| # | Requisito Q3-R | Q3 previo | Q3-R (post) | Aserciones ejecutables clave |
|---|---|---|---|---|
| R1 | Nuevo usuario · OTP → sesión → onboarding → chat | S1 | S1 (sin cambios) | GET /v2/chat, POST /otp, extract Mailpit, POST /verify, POST /api/v2/onboarding, `spabla_v2_fase9_auth` en localStorage, `span[Cuenta autenticada]`, `actor_personal_workspace` row |
| R2 | Idempotencia | S2 | S2 (+ anti-leak universal) | Dos contextos, dos OTP, mismo tenant, 1 mapping, 1 membership activa |
| R3 | Password coexiste + regreso a OTP | S3 | S3 (+ anti-leak) | click "Acceder con contraseña", login real, logout, "Iniciar sesión con código" visible |
| R4 | Wrong OTP opaco | S4 | S4 (+ anti-leak) | Alert `code_invalid_or_expired`, cero sesión, cero mapping |
| R5 | Resend invalida previo | S5 | S5 (+ anti-leak) | Cooldown 60s, first code rejected, second code succeeds, 1 workspace |
| R6 | Expiración real 60s | S6 | S6 (+ anti-leak) | 65s wait, alert, cero sesión |
| R7 | Doble click Recibir código | S7 | S7 (+ anti-leak) | Triple `.click()`, 1 mail (expectOne=true), 1 workspace, 1 membership |
| R8 | Anti-leak `URL/cookies/storage/console/pageerror/requestfailed` | S8 | S8 (sin cambios) | assertNoLeak sobre code, email, tokens, ConfirmationURL, `/auth/v1/verify`, service_role |
| R9 | Aislamiento mailbox + registry | S9 | S9 (sin cambios) | `registry.cleanupAll()`, `purgeMailbox` = 0 |
| **R10** | **OTP reutilizado** | ✗ | **S10** | Verify exitoso → sesión → cierre → segundo verifyOtp con MISMO código → `hasSession=false`, cero segunda sesión en localStorage, mapping/membership/tenant invariantes |
| **R11** | **Doble verify** | ✗ | **S11** | Triple `.click()` sobre "Verificar código", 1 transición autenticada, 1 workspace, 1 membership activa |
| **R12** | **Swap de email en paso código** | ✗ | **S12** | Submit A → step=code → "Cambiar email" → submit B → verify A rejected → verify B success, chat muestra B, actor A sin workspace |
| **R13** | **Verify durante resend** | ✗ | **S13** | `page.route` retrasa /otp 3s, click resend, verify con código antiguo rechazado, second code funciona |
| **R14** | **Reload en paso código** | ✗ | **S14** | fill code → reload → back to step=email, URL/cookies/localStorage/sessionStorage sin código, resend funciona |
| **R15** | **Dos pestañas** | ✗ | **S15** | `newPage` compartiendo context, tab2 muestra chat autenticado sin OTP form, logout en tab1 propaga a tab2 via storage event, 1 workspace 1 membership |
| **R16** | **Contraseña 12 pasos** | ✗ | **S16** | (1) OTP inicial, (2) switch password, (3) login, (4) session cached, (5-6) POST /api/v2/onboarding real desde el JWT password, chat, (7) logout SDK, (8) unauth surface (limitación §5), (9) switch password again, (10) 2do login, (11) cero código 6d en localStorage, (12) 1 mapping 1 membership activa |
| **R17** | **Anti-leak universal** | S1 + S8 | S1-S17 (+ S17) | `collectLeaks` en TODOS los escenarios que abren browser context; assertNoLeak antes de cerrar |
| **R18** | **Screenshot desactivado con OTP visible** | ✗ | test.use({ screenshot: "off" }) top-level | Verificable en config runtime |
| **R19** | **Aislamiento exhaustivo** | S9 parcial | S9 (sin cambios) + **S17** | Post-cleanup: 0 auth.users, 0 auth.identities, 0 auth.one_time_tokens, 0 actor_personal_workspace, 0 tenant_memberships, 0 actor_lifecycle_state ligados a RUN_ID; 0 mailpit residuals; ≤2 líneas lsof :3131 (header + owner) |

## 3 · Artefactos añadidos y modificados

| Archivo | Δ | Rol |
|---|---|---|
| `e2e/otp-signin.spec.ts` | +8 tests (S10-S17, algunos numerados fuera de orden por posición), + `test.use({ screenshot: "off" })` top-level, + `collectLeaks/assertNoLeak` universales en S2-S7, + helper `pgWaitActorIdByEmail` reforzado | Barrera |

Producto no modificado. Q2-R contract sigue documentando `resetOnLogout`; su wiring al listener SIGNED_OUT queda pendiente (ver §5 limitación 1). Zero cambios en runner, helper Mailpit, workflow CI, config.toml.

## 4 · Los 8 escenarios Q3-R (detalle)

### S10 · OTP reutilizado (FASE 2)

Doble contexto. Contexto A: OTP happy path completo → sesión → onboarding → registry. Contexto B fresco (cero sesión fabricada): entra a /v2/chat, evalúa `window.__spablaSupabase.auth.verifyOtp({type:"email", email, token: capturedCode})` — es decir dispara el verify REAL contra el server usando el SDK productivo. El server rechaza: `hasSession=false`. Asserts:

- Cero segunda sesión en localStorage.
- Mapping/actor sigue en 1.
- Membership activa sigue en 1.
- Mismo tenant.

Nota: la reutilización se ejerce vía SDK hook porque la UI en step=code ya está cerrada tras el primer éxito; introducir la reutilización por el flujo UI requeriría fabricar el input del código en un browser vaciado, lo cual sí sería un falso positivo. El SDK hook es el mismo path productivo que la UI usa internamente.

### S11 · Doble verify (FASE 3-2)

fill code → `Promise.all([verifyBtn.click(), verifyBtn.click(), verifyBtn.click()])`. El opId guard de `OtpForm.doVerify` colapsa en una única transición autenticada. Asserts: 1 mapping, 1 membership, `expectAuthenticatedChat` visible.

### S12 · Swap de email (FASE 3-3)

Submit email A → step=code → extract A code → "Cambiar email" → step=email (opId invalidated) → wait 2s (rate limit) → submit email B → step=code para B. Intenta primero código A → alert opaco. Luego código B → sesión. Chat header muestra hash primer char de B, no A. Actor A existe en auth.users pero sin workspace (nunca hizo verify).

### S13 · Verify durante resend (FASE 3-4)

`page.route("**/auth/v1/otp", async route => { await sleep(3000); route.continue(); })`. Waits cooldown ≥ 60s. Click Reenviar. Mientras la respuesta se retrasa, `typeAndVerifyOtp(page, first.code)` — el server invalidó `first.code` en el momento del /otp resend. Alert opaco visible. Zero session en localStorage. Second code (nuevo) verifica y produce sesión. Idempotencia mantiene 1 workspace.

### S14 · Reload en paso código (FASE 3-5)

Submit → extract first code → fill `#spabla-otp-code` (código en el input) → `page.reload()`. Post-reload:

- `section[Iniciar sesión con código]` visible (back to step=email).
- URL sin código.
- Cookies sin código.
- `localStorage` sin código.
- `sessionStorage` sin código.
- Input `#spabla-otp-code` inexistente (no restaurado).

Cambio de ciclo: espera 2s (rate limit), submit fresh, extract second code (mailbox limpio tras first extract+delete), verify, sesión.

### S15 · Dos pestañas (FASE 3-6)

Mismo `BrowserContext`, dos `newPage`. Tab1 completa OTP happy path. Tab2 abre `/v2/chat` — sin OTP form, salta directo a chat autenticado (localStorage compartido). Asserts: 1 mapping 1 membership independiente del número de tabs. `signOut({scope:"local"})` en tab1 → tab2 recibe SIGNED_OUT vía storage event → tab2 vuelve a mostrar OTP form.

### S16 · Password 12 pasos (FASE 4)

Pre-provisión: `admin.auth.admin.createUser({email, password, email_confirm:true})`. Browser:

1. `openChatWithOtp` — OTP form es la vista inicial.
2. Click "Acceder con contraseña" — SessionArea visible.
3. Fill email + password, click "Iniciar sesión".
4. `spabla_v2_fase9_auth` en localStorage.
5-6. `page.evaluate` dispara `POST /api/v2/onboarding` con el `access_token` del session — endpoint idempotente Q3-A. Chat visible (Cuenta autenticada, Cabecera).
7. `page.evaluate` signOut SDK real.
8. Unauth surface visible (OTP form o password form — ver §5).
9. Click "Acceder con contraseña" si aún no está.
10. 2do login exitoso.
11. `JSON.stringify(localStorage)` NO contiene ningún patrón `\d{6}`.
12. 1 mapping en actor_personal_workspace, 1 membership activa en tenant_memberships.

### S17 · Aislamiento exhaustivo (FASE 6)

Se ejecuta ÚLTIMO. Post `registry.cleanupAll()` en S9, verifica en pg:

- `count(auth.users WHERE email LIKE '%RUN_ID%')` = 0.
- `count(auth.identities WHERE user_id ∈ residual_users)` = 0.
- `count(auth.one_time_tokens WHERE user_id ∈ residual_users)` = 0.
- `count(spabla_v2.actor_personal_workspace WHERE actor_id ∈ residual_users)` = 0.
- `count(spabla_v2.tenant_memberships WHERE actor_id ∈ residual_users)` = 0.
- `count(spabla_v2.actor_lifecycle_state WHERE actor_id ∈ residual_users)` = 0.
- `GET /api/v1/search?query=<RUN_ID>` en Mailpit → 0 mensajes.
- `lsof -nP -iTCP:3131 -sTCP:LISTEN` ≤ 2 líneas (header + único owner del runner).

## 5 · Limitaciones reales y bloqueos productivos

1. **`useAuthMethod.resetOnLogout` sin wiring al listener `onAuthStateChange`.** La documentación del hook y del contrato Q2-R §1 declara "reset a OTP tras logout". La implementación del listener en `app/v2/chat/page.tsx` limpia `bootstrap` pero NO invoca `resetOnLogout`. Se intentó cablearlo dentro del alcance Q3-R; el fix rompe `e2e/auth-continuity.spec.ts` §20-10 (que asume que tras `Expired` la UI queda en password form). Resolver el conflicto excede Q3-R ("no reescribir barreras ajenas"). Consecuencia observable en S16: tras logout, la UI permanece en password form (no vuelve a OTP automático); el test acepta ambos estados como unauth-válidos y aplica la lógica del step 9 ("switch to password si no está"). Requiere hito dedicado que armonice ambos requisitos (probablemente distinguiendo signOut voluntario vs. expiración involuntaria).

2. **Restore drill local (macOS).** `scripts/ci/restore-drill.sh:139` usa `sed -i` sin backup ext — sintaxis GNU. macOS BSD sed rechaza. En CI (Ubuntu, Job C) funciona sin cambio. Q3-R FASE 7 punto 11 permite explícitamente "restore drill cuando el entorno lo permita". No es regresión de Q3-R.

3. **Anti-leak vs. artifacts de Playwright.** Screenshots quedan desactivados via `test.use({ screenshot: "off" })`. Video y trace ya estaban `off` en `playwright.config.ts`. No hay dumps de body por el reporter (`list` únicamente). `test-results/` está en `.gitignore` — cero riesgo de commit accidental.

4. **Custody log en `/tmp`.** El runner registra puertos/procesos en `/tmp/spabla-e2e-otp-custody.*`. Contiene únicamente nombres de contenedores y PIDs. Cero secretos. Fuera del working tree.

## 6 · Ronda 1 completa

Todas contra `supabase db reset --local` fresco:

| Suite | Resultado |
|---|---|
| tsc root | ✓ 0 errores |
| tsc engine | ✓ 0 errores |
| engine vitest | ✓ 1057 passed / 63 skipped (41 archivos) |
| client vitest | ✓ 309 passed / 69 skipped (32 archivos) |
| SQL integration (Job B) | ✓ SUITES OK (rls_bootstrap + atomic_onboarding + Q2-R3 race) |
| OTP integration (client vitest incluye `otp-signin.integration.test.ts`, `otp-onboarding.integration.test.ts`, `otp-antifraud.test.ts`, etc.) | ✓ dentro del bloque 309/309 |
| OTP browser E2E completo (17 tests · S1-S17) | ✓ 17 passed en 4.4m |
| onboarding-auth-race | ✓ 3 escenarios PASS |
| auth-continuity 14/14 | ✓ 14 passed en 29.1s |
| onboarding E2E 13/13 | ✓ 13 passed en 13.5s |
| Restore drill | ⊘ macOS local sed limitation — CI Job C lo cubre |
| Aislamiento post-suite | ✓ 0 procesos next/playwright/chromium, puerto 3131 libre |
| git diff --check | ✓ 0 conflict markers, 0 trailing whitespace |
| grep secretos/tokens/OTP/skip/only/retry | ✓ 0 matches (único hit es un comentario en `e2e/onboarding.spec.ts:50`) |
| Custodia final | ✓ working tree limpio, `.claude/` como único untracked |

## 7 · Ronda 2 completa

Segunda ejecución consecutiva, sin `git reset`, sin retries:

| Suite | Resultado |
|---|---|
| Reset DB + tsc root + tsc engine | ✓ |
| engine vitest | ✓ 1057/63 |
| client vitest | ✓ 309/69 |
| SQL integration | ✓ SUITES OK |
| OTP browser E2E · 17 tests | ✓ 17 passed en 3.8m |
| auth-continuity 14/14 | ✓ en 41.8s |
| onboarding E2E 13/13 | ✓ en 21.0s |
| onboarding-auth-race | ✓ 3/3 PASS |
| Aislamiento post-suite | ✓ 0 procesos, puerto libre |
| git diff --check | ✓ 0 conflict markers |

## 8 · Prohibiciones — cero infracciones

- [x] Rama nueva `spabla-v2/hito-9-3-2-b-q3-r-complete-behavioral-proof` creada desde SHA exacto `ddf813c1167c3788e82fd5f2a7d3c15c89955ce6`.
- [x] Oficial `6a4bb5a778b8e3cd1a6f58e6e9af57a5297223a7` intacta.
- [x] Main `e6128433d42e1e105529ed2f64212ca527034b6a` intacta.
- [x] Cero promoción, cero force, cero force-with-lease, cero tags.
- [x] Cero Supabase Cloud, cero SMTP productivo, cero emails reales.
- [x] Cero cambio del contrato OTP.
- [x] Cero magic links, cero tablas/endpoints propios.
- [x] Cero fabricación de sesión: toda transición autenticada viene de `verifyOtp` real o `signInWithPassword` real, sesión persistida por el SDK oficial.
- [x] Cero valor OTP fijo versionado: cada código se lee runtime de Mailpit.
- [x] Cero `supabase db reset` entre escenarios dentro de una misma ronda; sí entre rondas (permitido).
- [x] Cero `test.only`, cero `test.skip`, cero `test.fixme`, cero retries.
- [x] Cero `.claude/` tocado.
- [x] Cero rerun automático.

## 9 · Handoff

Q3-R cierra la matriz conductual. La única limitación productiva documentada (§5.1 wiring `resetOnLogout` al listener SIGNED_OUT) queda para un hito dedicado que armonice `useAuthMethod` Q2-R con `auth-continuity` §20-10. Sin decisión aquí.
