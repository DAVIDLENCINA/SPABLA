# HITO 9.3.2-B-Q3 · BARRERA E2E REAL DEL ACCESO OTP POR EMAIL

Fecha: 2026-08-28
Rama: `spabla-v2/hito-9-3-2-b-q3-otp-browser-e2e`
Base exacta: `6a4bb5a778b8e3cd1a6f58e6e9af57a5297223a7` (Q2-P promoción oficial de OTP)
Rama fuente / oficial (invariante durante el hito): `spabla-v2/thirteen-languages-activation` @ `6a4bb5a778b8e3cd1a6f58e6e9af57a5297223a7`
Main (invariante): `e6128433d42e1e105529ed2f64212ca527034b6a`
Contrato OTP oficial: `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_2_B_OTP_CONTRACT.md`

## 1 · Alcance y no-alcance

**Alcance Q3**: barrera E2E real sobre Chromium + Next dev + Supabase local + Mailpit que ejercita el flujo productivo `signInWithOtp → verifyOtp → POST /api/v2/onboarding → chat operativo` sin fabricar sesión ni saltar UI. Job F en `ci.yml` (independiente de Job E).

**No-alcance** (respetado en cero-líneas):
- No promoción a la oficial.
- No modificación de `main`.
- No Supabase Cloud, ni SMTP productivo, ni emails reales.
- No cambio del contrato OTP.
- No eliminación de contraseña.
- No magic links.
- No tablas ni endpoints OTP propios.
- No cambio de identidad, onboarding ni tenants.
- No inicio de otro hito.
- No `.claude/` tocado.

## 2 · Base exacta y rama

- Base: `6a4bb5a778b8e3cd1a6f58e6e9af57a5297223a7`.
- Rama: `spabla-v2/hito-9-3-2-b-q3-otp-browser-e2e` creada exactamente desde esa base.
- SHA oficial durante el hito: `6a4bb5a778b8e3cd1a6f58e6e9af57a5297223a7` (invariante).
- SHA main durante el hito: `e6128433d42e1e105529ed2f64212ca527034b6a` (invariante).

## 3 · Artefactos añadidos

| Ruta | Tipo | Descripción |
|---|---|---|
| `e2e/helpers/mailpit.ts` | nuevo | Cliente Mailpit anti-fuga: `waitForOtp` extrae exactamente un código de 6 dígitos del cuerpo TEXT (evita colisión con hex CSS), rechaza cero mensajes, rechaza ambigüedad, verifica subject "SPABLA", ausencia de `/auth/v1/verify` y de `ConfirmationURL`. `deleteMessage` usa el endpoint correcto `DELETE /api/v1/messages` (el `DELETE /api/v1/message/<id>` singular responde 405). Cero print del código; hashes sha12 en errores. `purgeMailbox` para cleanup por `runId`. |
| `e2e/otp-signin.spec.ts` | nuevo | 9 escenarios ejecutados serialmente por `test.describe` (default) sobre Chromium real. `test.beforeAll` construye admin + registry Q2-R3. `test.afterAll` limpia registry + mailbox por RUN_ID. |
| `scripts/e2e/run-otp-browser-e2e.sh` | nuevo | Runner puerto **3131** (aislado de auth-continuity 3111 y onboarding 3121). Custodia idempotente: si Supabase estaba levantado no lo detiene; si lo levantó él, lo para. Calienta `/api/v2/onboarding` antes de Playwright para evitar carrera de compilación Turbopack. |
| `.github/workflows/ci.yml` | modificado | Añade **Job F — OTP browser E2E** (`e2e-otp`), independiente y sin `continue-on-error`. |
| `supabase/config.toml` | modificado | `[auth.email].otp_expiry = 60` para ejercitar la expiración real en un CI acotado (contract §3 sigue recomendando 300 s en Cloud; este valor es EXCLUSIVAMENTE local — comentario T-BLOQUE aclara). |
| `app/v2/chat/components/OtpForm.tsx` | modificado (defecto Q3-autorizado) | `useEffect` de `mountedRef` fijaba `false` en cleanup pero no reseteaba `true` en setup; en dev con React 19 StrictMode el doble-invoke dejaba el ref colgado en `false` y todos los guardas `if (!mountedRef.current) return` abortaban las operaciones. Fix mínimo: `mountedRef.current = true` en el setup. |

## 4 · Escenarios de la barrera E2E (`e2e/otp-signin.spec.ts`)

| # | Escenario | Requisito contractual verificado |
|---|---|---|
| S1 | Nuevo usuario completa OTP → sesión → onboarding → chat operativo, reload persiste sesión, cero leak en consola/errores/requests | §7, §9 (Auth es autoridad), §14 anti-leak; hito 9.3.2-A `POST /api/v2/onboarding` idempotente |
| S2 | Usuario existente: segunda sesión reusa el mismo tenant; una sola `actor_personal_workspace` y una sola `tenant_memberships` activa | idempotencia onboarding + §7 |
| S3 | Password path sigue operativo junto al OTP; logout regresa a OTP (método principal Q2-R §1) | §7, §11 orden Q2 |
| S4 | Código incorrecto → error opaco `code_invalid_or_expired`; cero sesión en localStorage; cero mapping en DB | §6 (opacidad de wrong/expired/reused/invalidated-by-resend) |
| S5 | Reenvío tras cooldown: código previo rechazado, nuevo código aceptado, una sola workspace | §3, §7 |
| S6 | Expiración real (60 s local): código expirado rechazado opacamente; cero sesión | §3, §6 |
| S7 | Concurrencia: triple click sobre "Recibir código" produce exactamente un email; una workspace y una membership | §14 concurrencia cliente |
| S8 | Anti-leak: sesión establecida con cero OTP/access_token/refresh_token/ConfirmationURL/`/auth/v1/verify` en URL, cookies, localStorage, sessionStorage, console, pageerror ni requestfailed | §16 anti-fuga |
| S9 | Aislamiento: registry Q2-R3 limpia sus propios residuos; mailbox por RUN_ID queda a 0; cero `supabase db reset` entre escenarios | Q2-R3 aislamiento + §16 anti-cross-contamination |

Cero `test.only`, cero `test.skip`, cero `test.fixme`, cero retries (`playwright.config.ts` mantiene `retries: 0`).

## 5 · Defectos reales detectados por la propia barrera (Q3-autorizados)

Q3 §6 autoriza explícitamente "corregir defectos reales del flujo OTP descubiertos por la prueba". La barrera E2E descubrió tres bugs no cubiertos por ninguna prueba anterior (todos previos a Q3 en producción). Fix mínimo en cada uno.

### 5.1 · `OtpForm.mountedRef` colgado en `false` (defecto productivo)

**Síntoma**: el botón "Recibir código" quedaba permanentemente en "Enviando…" tras el primer click, aunque la request HTTP `POST /auth/v1/otp` completaba con 200 en ~200 ms.

**Causa raíz**: el patrón
```ts
const mountedRef = useRef(true);
useEffect(() => {
  return () => { mountedRef.current = false; };
}, []);
```
NO resetea `true` en el setup. React 19 en dev con `reactStrictMode` (por defecto en Next) doble-invoca el efecto: mount → cleanup (ref=false) → mount de nuevo → setup no vuelve a poner true. Todas las callbacks (`doRequest`, `doVerify`, `doResend`) hacían `if (!mountedRef.current) return` y abortaban silenciosamente antes de `setBusyRequest(false)` / `setStep("code")`.

**Fix** (`app/v2/chat/components/OtpForm.tsx`):
```ts
useEffect(() => {
  mountedRef.current = true;               // ← añadido
  return () => { mountedRef.current = false; };
}, []);
```

**Alcance**: cero cambios de contrato. Cero cambios en el shape de estado. Los tests conductuales y unitarios (37 tests en `otp-form.test.ts` + `otp-form.behavioral.test.tsx`) siguen pasando.

### 5.2 · Helper Mailpit `deleteMessage` usa endpoint 405 (defecto de la propia barrera)

**Síntoma**: mails no se borraban tras extracción; segunda escena para el mismo email veía dos mensajes → `waitForOtp` fallaba con "ambiguous: got 2".

**Causa raíz**: `DELETE /api/v1/message/<id>` no existe en Mailpit (Allow: GET, HEAD, OPTIONS → 405). El endpoint correcto para borrar por ID es `DELETE /api/v1/messages` con body `{IDs:[...]}`.

**Fix** (`e2e/helpers/mailpit.ts`): reemplazado por el endpoint plural con body JSON.

### 5.3 · Helper Mailpit regex `\b\d{6}\b` matchea hex CSS

**Síntoma**: el helper rechazaba "múltiples códigos distintos" cuando el HTML incluye `color:#334155` — el regex `\b\d{6}\b` capturaba `334155` como sexta-dígitos.

**Fix** (`e2e/helpers/mailpit.ts`): extraer código EXCLUSIVAMENTE del cuerpo TEXT (que no contiene CSS); mantener escaneo de `/auth/v1/verify` sobre TEXT+HTML para que una regresión de plantilla que meta la URL en el HTML no pase.

### 5.4 · `admin.auth.admin.listUsers` devuelve 500 cuando conviven usuarios sembrados por SQL

**Síntoma**: `expect(actor).toBeDefined()` fallaba con `undefined` incluso cuando la request `signInWithOtp` había creado el usuario correctamente (visible tanto en Mailpit como en `auth.users`).

**Causa raíz**: la suite SQL integración (Job B) siembra usuarios directamente vía `INSERT INTO auth.users` sin poblar `confirmation_token`. Al ejecutarse E2E OTP contra la misma base local (patrón normal de dev), GoTrue's admin listUsers endpoint entra a un `Scan error on column "confirmation_token": converting NULL to string is unsupported` — 500 opaco. Todos los tests que buscaban el actor via SDK admin API fallaban.

**Fix** (`e2e/otp-signin.spec.ts`): reemplazado el patrón `admin.auth.admin.listUsers + find(email)` por `pgWaitActorIdByEmail(email)` — consulta SQL directa `SELECT id FROM auth.users WHERE email = $1` con polling breve para tolerar el race `signInWithOtp` → user-created write. Alcance: sólo tests; el flujo productivo NO llama `admin.listUsers`. Cero cambio de contrato.

## 6 · Aislamiento y anti-cross-contamination

- Cada `test` usa su propio `emailFor(scenario)` con `runId` único por invocación de suite (`randomBytes(6).toString("hex")`).
- `test.beforeAll` construye el `OtpFixtureRegistry` (Q2-R3, `lib/v2/test-utils/otp-fixture-registry.ts`) con `SUPABASE_SERVICE_ROLE_KEY` local y conexión `pg` directa; jamás toca actor / tenant fuera del RUN_ID.
- `test.afterAll` invoca `registry.cleanupAll()` (SQL CASCADE) + `purgeMailbox(mailpit, RUN_ID)`.
- Cero `supabase db reset` entre escenarios (Q2-R3 §4 policy).
- Cero fabricación de sesión (localStorage, cookies, JWT inyectado). Toda sesión proviene de `verifyOtp` real.
- Cero valores OTP fijos versionados; cada código se lee de Mailpit tras el `signInWithOtp` real.
- Escenario S9 verifica explícitamente 0 residuos por RUN_ID tras cleanup.

## 7 · Anti-fuga (§S8)

`assertNoLeak` bloquea:
- OTP code (extraído en runtime, nunca impreso).
- Email completo.
- `access_token` / `refresh_token` (case-insensitive).
- `ConfirmationURL`.
- `/auth/v1/verify`.
- `service_role`.

Fuentes recolectadas: `console`, `pageerror`, `requestfailed`. S8 además audita `page.url()`, cookies, `localStorage`, `sessionStorage`.

Cuando `waitForOtp` lanza error incluye únicamente hashes truncados sha12 del mailbox / subject — nunca el email en claro ni el código.

## 8 · Custody policy (aislamiento entre runners)

Puerto único 3131 (auth-continuity 3111, onboarding 3121, OTP 3131). El runner:
1. Si detecta contenedor Supabase pre-existente → NO lo detiene al terminar (custody = pre-existing).
2. Si lo levanta él → lo detiene con `supabase stop --no-backup`.
3. Siempre limpia Next dev, procesos Chromium residuales y libera el puerto.
4. `custody log` en `/tmp/spabla-e2e-otp-custody.*` para diagnóstico.

## 9 · Rondas ejecutadas y estado

Las dos rondas exigidas por Q3 §FASE 15 corrieron limpias:

- **Ronda 1** (2026-08-28 20:53 CET): 9/9 en 2.3 min.
- **Ronda 2** (2026-08-28 20:55 CET): 9/9 en 2.3 min (post-fix — rondas 1..N-1 fueron iterativas hasta cerrar los tres defectos §5).

Cero `--retries`, cero `test.only`, cero `test.skip`, cero salidas condicionales.

## 10 · CI — Job F

Añadido `.github/workflows/ci.yml` bloque `e2e-otp` (Job F — OTP browser E2E):
- `runs-on: ubuntu-latest`, `timeout-minutes: 25`.
- Setup Supabase CLI pin `2.110.0` (idéntico a Jobs B, C, D, E).
- Node 24.
- Playwright Chromium únicamente.
- `bash scripts/e2e/run-otp-browser-e2e.sh --reset` (aplica cadena de migraciones).
- `supabase stop --no-backup` en `if: always()`.
- Sin `continue-on-error`, sin `allow-failure`, sin `|| true`, sin `retries`.

Los Jobs A-E siguen intactos.

## 11 · Prohibiciones — cero infracciones

- [x] Cero promoción a `spabla-v2/thirteen-languages-activation` (SHA invariante).
- [x] Cero modificación de `main` (SHA invariante).
- [x] Cero Supabase Cloud.
- [x] Cero configuración SMTP productiva (config.toml es exclusivamente local).
- [x] Cero emails reales — únicamente Mailpit local.
- [x] Cero cambio del contrato OTP.
- [x] Cero eliminación de password (S3 lo prueba).
- [x] Cero magic link (helper Mailpit rechaza `/auth/v1/verify` en cuerpo).
- [x] Cero tabla ni endpoint OTP propio.
- [x] Cero cambio de identidad/onboarding/tenants.
- [x] Cero `.claude/` tocado.
- [x] Cero `test.only`, cero `test.skip`, cero retries.
- [x] Cero fabricación de sesión.

## 12 · Handoff

Al terminar Q3 quedan tres opciones para el siguiente hito, ninguna decidida aquí:
- **Q3-P** (promoción de la barrera a la oficial): commit único push + wait CI verde ya cubierto. Q3-P propondría el fast-forward a la oficial.
- **Q4** (siguiente capa OTP): fuera de scope.
- **Otra sub-fase 9.3.2-B**: no bloqueado por esta barrera.
