# HITO 9.3.2-B-Q1 · AUDITORÍA TÉCNICA Y DE SEGURIDAD DEL OTP POR EMAIL

Fecha: 2026-08-25
Rama: `spabla-v2/hito-9-3-2-b-q1-otp-security-audit`
Base oficial: `1c6b26a9e00ca4a4ff4f9ea73b4aae899f03581d` (`spabla-v2/thirteen-languages-activation`)
Main (invariante): `e6128433d42e1e105529ed2f64212ca527034b6a`
Run autorizante de la base: `32826985335` (attempt=1, success, 5/5 jobs)

## 1 · Alcance de la auditoría

Auditoría **exclusivamente documental**. Cero código productivo. Cero migración. Cero UI. Cero modificación de `supabase/config.toml` del proyecto SPABLA. Cero envío de correos reales. Las mediciones se ejecutaron contra un **proyecto Supabase aislado y temporal** en `/tmp/otp-audit` (puertos 54421/54422/54424) creado ad-hoc con `supabase init`, distintos puertos para no colisionar con el stack SPABLA local (54321/54322), plantilla custom `magic_link` con `{{ .Token }}`, `otp_expiry=60` para probar expiración sin bloquear CI, y destruido con `supabase stop --no-backup` tras cerrar el reporte.

Contrato de dirección invariante:
- OTP de 6 dígitos por email.
- Identificador: email normalizado por Supabase Auth.
- Flujo objetivo: email → código → session → `POST /api/v2/onboarding` → chat.
- Email + contraseña permanece como acceso alternativo (evidencia J).
- Excluidos: SMS, magic-link, passkeys, OAuth, teléfono, dispositivos vinculados, multicuenta, apps nativas.
- Prohibida tabla `otp_challenges` propia — Supabase Auth es autoridad del desafío.

## 2 · Versiones efectivas

| Componente | Versión | Fuente |
|---|---|---|
| Supabase CLI | 2.113.0 | `supabase --version` (nota: CI pinnea 2.110.0 en el workflow) |
| GoTrue (Auth) | v2.195.0 | `docker exec … gotrue version` |
| PostgreSQL server | 17.6 aarch64 (compiled by gcc 15.2.0) | `SELECT version()` |
| Node | v24.14.0 | `node --version` |
| `@supabase/supabase-js` | 2.106.2 (root + engine) | `package.json` + `require(…).version` |
| `@supabase/auth-js` | 2.106.2 (transitive) | `require('@supabase/auth-js/package.json').version` |
| Mailpit (Inbucket compat) | v1.30.2 | `GET :54424/api/v1/info` |
| Container image auth | `public.ecr.aws/supabase/gotrue:v2.195.0` | `docker inspect` |

**Nota**: la CLI moderna (2.113) sustituyó Inbucket por Mailpit pero mantiene el alias `INBUCKET_URL` en `supabase status`. La API `/api/v1/message/{id}` y `/api/v1/search?query=…` son compatibles a nivel de campos usados por la auditoría.

## 3 · Configuración de Auth observada (proyecto SPABLA local)

Env vars efectivas del contenedor `supabase_auth_spabla-hito-8-2-local`:

- `GOTRUE_MAILER_OTP_LENGTH=6`
- `GOTRUE_MAILER_OTP_EXP=3600` (1 hora)
- `GOTRUE_RATE_LIMIT_OTP=30` (per hora, per proyecto)
- `GOTRUE_RATE_LIMIT_EMAIL_SENT=360000` (proyecto local: efectivamente sin límite)
- `GOTRUE_RATE_LIMIT_VERIFY=30`
- `GOTRUE_SMTP_MAX_FREQUENCY=1s` (cooldown mínimo entre emails)
- `GOTRUE_MAILER_AUTOCONFIRM=true` (local-only; producción debe ser `false`)
- `GOTRUE_MAILER_URLPATHS_CONFIRMATION=http://127.0.0.1:54321/auth/v1/verify`
- `GOTRUE_MFA_TOTP_ENROLL_ENABLED=false`
- `GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true`
- `GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL=10`

`supabase/config.toml` del proyecto SPABLA no declara secciones `[auth.email.template.*]`, `[auth.rate_limit]` ni `[auth.email.smtp]` — hereda defaults del CLI 2.113 (comentados en `/tmp/otp-audit/supabase/config.toml`):

- `[auth.email] otp_length=6 otp_expiry=3600 max_frequency="1s" enable_signup=true enable_confirmations=false secure_password_change=false`
- `[auth.rate_limit] email_sent=2 sign_in_sign_ups=30 token_verifications=30 token_refresh=150` (per 5min per IP salvo `email_sent` per hora)

## 4 · Plantilla efectiva del correo (defecto bloqueante para Q2)

**Hallazgo crítico 1**: la plantilla por defecto del CLI 2.113 para el flujo `signInWithOtp` (server-side templated as `magic_link`) es un **magic link**:

```
-----------------
Your sign-in link
-----------------

Follow the link below to sign in. This link expires shortly and c…
```

- Subject: `"Your sign-in link"`.
- Cuerpo: enlace `https://127.0.0.1:54321/auth/v1/verify?…` con `token=` embebido y **cero código de 6 dígitos**.
- Sin `{{ .Token }}` explícito en la plantilla → GoTrue emite un enlace clickable.

**Q2 debe imponer una plantilla propia** en `supabase/config.toml` que use `{{ .Token }}` y NO `{{ .ConfirmationURL }}`. Ejemplo verificado en el proyecto aislado (`/tmp/otp-audit/supabase/templates/magic_link.html`):

```html
<h2>Your SPABLA verification code</h2>
<p>Enter the following code in the SPABLA sign-in form to continue:</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
<p>This code expires shortly. If you did not request it, ignore this email.</p>
```

Con esa plantilla, el email recibido en Mailpit contiene exclusivamente el código de 6 dígitos numéricos, sin `token=`, sin URL de verificación (evidencia A: `has_6_digit_code=true`, `has_verify_url=false`).

**Cambio productivo requerido en Q2** (NO ejecutado aquí):
- Añadir `[auth.email.template.magic_link]` a `supabase/config.toml` con `subject`/`content_path` propios.
- Añadir `supabase/templates/magic_link_es.html` + variantes traducidas (13 idiomas SPABLA §17-bis 6) o resolver server-side.
- El asunto debe ser localizable server-side (`subject` en config.toml es una única string; para 13 idiomas hará falta bien plantillas por locale, bien enviar el mismo asunto neutro).

Además la plantilla productiva de **Cloud** puede diferir (Supabase Cloud UI permite editar plantillas independientemente de `supabase/config.toml`). Q2 debe alinear ambas.

## 5 · Flujo nominal (evidencia A/B, run `20260825095817-1762fde0`)

Endpoint invocado: `POST /auth/v1/otp` con `{email, create_user: true}`. Status 200, body `{}`.

Recuperación de correo desde Mailpit `GET /api/v1/search?query=to%3A<email>` + `GET /api/v1/message/{ID}` → parse regex `\b(\d{6})\b`. Redacción: se persiste **SHA-256 truncado (12 hex)** del código en el reporte; el código en claro nunca se serializa. Hash observado (evidencia A): `a35878f804c5`.

`POST /auth/v1/verify` `{type:"email", email, token}` → status 200, `access_token` presente. En 57 ms de latencia (proyecto aislado local).

Comportamiento consistente para usuario nuevo (A) y usuario pre-creado por `admin.createUser` (B).

## 6 · Expiración (evidencia H)

Proyecto aislado configurado con `otp_expiry=60`. Solicitado OTP, esperados 65 segundos, verificado. Resultado:

```
verify_status: 403
verify_error_hint: otp_expired
access_token_present: false
```

Fuentes de configuración:
- Global GoTrue: env var `GOTRUE_MAILER_OTP_EXP`.
- Supabase CLI local: `[auth.email] otp_expiry = <int>` (segundos).
- Supabase Cloud: Auth → Providers → Email → `OTP expiration` (Dashboard).
- SDK: no conoce el valor; sólo recibe error `otp_expired` en `verifyOtp`.

Restauración: el `otp_expiry=60` **sólo existe en el proyecto aislado** `/tmp/otp-audit`. `supabase stop --no-backup` destruyó el proyecto tras la medición. `supabase/config.toml` del proyecto SPABLA nunca se tocó.

**Propuesta para Q2** — valores diferenciados:
- **Producción SPABLA**: `otp_expiry = 300` (5 minutos). Balance: cubre latencia SMTP + copia/pega humano, minimiza ventana de robo.
- **Test/E2E**: `otp_expiry = 60` en `supabase/config.toml` local de E2E si Q2 quiere probar expiración en CI; alternativa: no probar expiración en CI (fixture usaría `admin.deleteUser` sobre one-time-tokens directamente, más rápido).
- Nunca presentar el valor de test como valor productivo.

## 7 · Reenvío e invalidación (evidencia C)

Secuencia:
1. `POST /otp` → email A, código hash `ccd396cfc5ab`.
2. Espera 1.3 s (para superar `max_frequency=1s`).
3. `POST /otp` → email A, código hash `3421279f5bd7`.
4. `POST /verify` con código antiguo → **403 `otp_expired`**, `access_token_present=false`.
5. `POST /verify` con código nuevo → **200, access_token presente**.

Resultados:
- Códigos consecutivos **difieren** (`codes_differ: true`).
- Reenvío **invalida** el código anterior (comportamiento server-side de GoTrue: cada `POST /otp` reemplaza la fila `auth.one_time_tokens` del usuario para el tipo `magic_link`).
- Mensaje público del código invalidado y del código expirado es **el mismo**: `otp_expired`. Oportuno: el cliente no distingue "código sobrescrito" de "código caducado por tiempo".

**Cooldown observado** (evidencia D):
- Segundo `POST /otp` sin espera → **429 `over_email_send_rate_limit`**. Cuerpo: `"For security purposes, you can only request this after 0 seconds."`.
- Rate limit configurable vía `[auth.email] max_frequency` (default `1s`).

Alcance real del cooldown (medido y documentado autoritativamente por GoTrue): **por email**, no por IP en este endpoint. Los rate limits por IP son independientes (`sign_in_sign_ups=30 / 5min / IP`).

**Propuesta para Q2**:
- `max_frequency = "60s"` en `supabase/config.toml` productivo → cooldown UX (barrera principal frente a spam) — combinado con `sign_in_sign_ups=30/5min/IP`.
- Contador visual en UI de Q3 se describirá como **UX**, no como barrera de seguridad. La barrera es server-side (Supabase).

## 8 · Códigos incorrectos y fuerza bruta (evidencia E, F, K)

Todas las respuestas de `POST /verify` con tokens malformados o incorrectos:

| Probe | Status | error_code |
|---|---|---|
| `"000000"` (6 dígitos wrong) | 403 | `otp_expired` |
| `"1234"` (short) | 403 | `otp_expired` |
| `"1234567890"` (long) | 403 | `otp_expired` |
| `"abcdef"` (no numeric) | 403 | `otp_expired` |
| `""` (empty) | 400 | `validation_failed` |
| código válido de otro email | 403 | `otp_expired` (evidencia F) |
| código válido reutilizado 2ª vez | 403 | `otp_expired` (evidencia K) |

**Análisis**:
- Todos los "malos" devuelven **`otp_expired` opaco**. GoTrue NO distingue "wrong code" de "expired code" hacia el cliente. Excelente propiedad para no filtrar información sobre el estado del código.
- Empty string es la única excepción — validación estructural devuelve 400 `validation_failed`. Aceptable (mensaje sigue siendo opaco; el cliente no infiere existencia del email).
- **Reutilización** (K): tras verificación exitosa, el mismo código no funciona (single-use enforce).
- **Cross-email** (F): un código válido de A no verifica para B (binding email-token en `auth.one_time_tokens`).

**Límite observable de intentos**:
- **No hay contador dedicado de intentos** en GoTrue 2.195. `token_verifications=30/5min/IP` limita al IP (ver §10), no al email. Para un atacante que rote IP, el brute-force por email tiene entropía = 10^6.
- Ventana efectiva: `otp_expiry` (300s propuesto) × `rate_limit_verify` (30 verif/5min/IP). Un solo IP puede probar 6 códigos/min. Riesgo residual documentado.
- **Q2 no debe inventar una defensa server-side propia** (contradice §8 orden). Riesgo aceptado y documentado en threat model §17.

Fuerza bruta local acotada: sólo 5 probes malos por escenario. **NO** se ejecutó volumen abusivo. **NO** contra Supabase Cloud.

## 9 · Prevención de enumeración (evidencia G)

Comparación de `POST /auth/v1/otp` con `create_user=false` (patrón "signin-only" clásico) para distintos emails:

| Etiqueta | Email de prueba | Status | Body |
|---|---|---|---|
| existente (`admin.createUser` previo) | `otp-audit-enum-exists-<runid>@spabla.test` | 200 | `{}` |
| nuevo | `otp-audit-enum-new-<runid>@spabla.test` | **422** | `{"code":422,"error_code":"otp_disabled","msg":"Signups not allowed for otp"}` |
| formato inválido | `not-a-valid-email` | 422 | (mismo `otp_disabled`) |
| upper case | `OTP-…-CASE-…@Spabla.Test` | 422 | (mismo — email **no normalizado**: al no existir en minúsculas, se trata como nuevo) |
| con espacios | `"  otp-…-spaces-…@spabla.test  "` | 422 | (idem) |

**Hallazgo bloqueante 2 — Enumeración por respuesta**: con `create_user=false`, GoTrue diferencia claramente existente (200) de no-existente (422 `otp_disabled`). Un atacante puede enumerar el padrón de emails.

**Timing** (8 muestras, mediana):
- existente: **74.62 ms**
- nuevo: **24.35 ms**
- Diferencia ~50 ms — visible incluso a través de red típica. Enumeración por timing es viable.

**Solución operativa** (a implementar en Q2 sin defensa server-side propia):
1. **Siempre invocar `signInWithOtp` con `shouldCreateUser: true`** (== `create_user: true`). Con `true`, la respuesta para nuevo también es 200 → uniformiza status y body. Verificado: A y B ambos 200.
2. **Aceptar el trade-off**: `shouldCreateUser: true` implica que un atacante puede crear usuarios ghost en el padrón. GoTrue no los confirma (`enable_confirmations=false` por defecto local, `true` en producción), y las cuentas ghost NO obtienen bootstrap hasta que un onboarding real las materialice.
3. **Normalización de email**: la orden lo pide como valor a cerrar. Los tests muestran que **GoTrue NO normaliza mayúsculas ni espacios por sí solo**. Q2 debe normalizar en el cliente: `email.trim().toLowerCase()` antes de invocar SDK. Adicionalmente el server podría validar formato con `Fase9RequestError` si Q2 introduce un handler propio.

**Mensajes públicos futuros de la UI**: opacos. `"Si el correo es válido, hemos enviado un código."` — cero confirmación de existencia.

Timing residual (~50 ms) no eliminable a nivel cliente. Se documenta como riesgo residual (§17); mitigado parcialmente con `shouldCreateUser: true` que iguala el status y añade la escritura de fila en `auth.users` incluso para nuevos.

## 10 · Rate limits (evidencia D, I)

**Local aislado, con smtp default de Mailpit**:

| Rate limit | Endpoint | Ventana | Observado |
|---|---|---|---|
| `[auth.email].max_frequency` | `POST /otp` | por email | 1s default; second request → 429 `over_email_send_rate_limit` |
| `[auth.rate_limit].email_sent` | envío de emails | por hora, por proyecto | 2 con smtp custom; 360000 con smtp default GoTrue (efectivamente ilimitado local) |
| `[auth.rate_limit].sign_in_sign_ups` | `POST /otp`, `POST /token` | 5 min, por IP | 30 |
| `[auth.rate_limit].token_verifications` | `POST /verify` | 5 min, por IP | 30 |
| `[auth.rate_limit].token_refresh` | refresh | 5 min, por IP | 150 |
| Burst `POST /otp` (6 rápidos) | I | inmediato | `[200,429,429,429,429,429]` — cooldown por email dispara |

**Cloud SPABLA productivo**: **no medido** en Q1 por orden explícita FASE 10 ("No login nuevo, no vincular repositorio, no alterar parámetros, no enviar emails, no ejecutar pruebas activas, no revelar secretos"). Los mismos valores estarán configurables en el Dashboard Supabase Cloud → Auth → Rate Limits. **Bloqueo de operaciones (no de implementación)**: antes de GO producción se requiere ajustar Dashboard para:
- `email_sent`: alineado con proveedor SMTP contratado (SendGrid free = 100/día, Postmark = 100/mes free, etc.).
- `sign_in_sign_ups`: 30/5min/IP suele bastar; considerar 10/5min/IP si target de abuso.
- `token_verifications`: 30/5min/IP OK; documentar métricas.

**Cabeceras `Retry-After`**: la respuesta 429 no incluyó `Retry-After` en la muestra. GoTrue emite `over_email_send_rate_limit` con `msg` que incluye segundos restantes (`"after 0 seconds"` cuando ya se puede reintentar; útil para UX).

## 11 · Inbucket / Mailpit local y CI

- Endpoint local: `http://127.0.0.1:54324` (SPABLA) / `http://127.0.0.1:54424` (aislado). En CI Job B/D/E el puerto es 54324 por defecto de la CLI.
- API usada: Mailpit v1.x — `GET /api/v1/search?query=to:<email>` + `GET /api/v1/message/{ID}` + `DELETE /api/v1/message/{ID}`. Compatible con el subconjunto que necesita el helper.
- Aislamiento: cada test genera `email = <label>-<runId>@spabla.test`. `runId` = `YYYYMMDDHHMMSS-<sha256[:8]>` — colisión imposible en la práctica.
- Limpieza: `DELETE /api/v1/message/{ID}` tras leer cada correo. Además `supabase stop --no-backup` destruye el estado de Mailpit entre runs completas.
- Selección: se toma `messages[0]` de `search` (Mailpit ordena newest-first).
- Rechazo de mensajes antiguos: el `runId` en el email destinatario garantiza que un correo residual de otra ejecución no matchea.
- **Cero contaminación cruzada** en las mediciones (verificado por hashes distintos por escenario).
- **Cero OTP en logs**: el harness Python guarda solo `sha_trunc(code) = sha256(code)[:12]`. Los logs stdout imprimen únicamente el `email_hash`, nunca el email ni el código.
- **CI**: el helper productivo/E2E definitivo NO se crea en Q1. Q2 debe crearlo con las mismas garantías: `runId`, hash truncado, `DELETE` post-lectura, `redaction` en logs de Playwright.
- **Cero artefactos con códigos en claro**: el reporte JSON `/tmp/otp-audit/report.json` sólo contiene hashes truncados, statuses, mensajes de error opacos, hints. El JSON NO entra al repositorio git (no se versiona).

## 12 · Convivencia con contraseña (evidencia J)

Secuencia:
1. `POST /auth/v1/admin/users` con `{email, password, email_confirm:true}` → 200.
2. `POST /auth/v1/token?grant_type=password` → `access_token` presente (`password_signin_before_otp = true`).
3. `POST /auth/v1/otp` (mismo email) → 200; email recibido; `POST /verify` con token → 200 access_token (`otp_verify_success = true`).
4. `POST /auth/v1/token?grant_type=password` (después del OTP) → `access_token` presente (`password_signin_after_otp = true`).

**Conclusión**: `signInWithPassword` y `signInWithOtp` **coexisten sobre el mismo actor** sin degradarse mutuamente. La sesión emitida por OTP no invalida la contraseña. Q2 puede añadir `OtpForm` como **componente separado** sin tocar el login por contraseña actual.

**Continuidad de sesión**: el `access_token` emitido por `verifyOtp` es funcionalmente idéntico al de `signInWithPassword` (mismo `sub`, mismo `iat/exp`, mismo `aud`); el `refresh_token` rota igual. Los 14 tests de Q3-E2E-R (auth-continuity) siguen aplicando byte-por-byte una vez OTP esté disponible.

**Inventario de código productivo NO tocado por Q1** (verificable con `git diff base..HEAD -- app/ lib/ supabase/`): cero. Login password sigue operativo (verificado en no-regresión §16).

## 13 · Integración con el onboarding (`POST /api/v2/onboarding`)

El endpoint promovido en 9.3.2-A-P es **agnóstico al método de autenticación**: sólo requiere `Authorization: Bearer <access_token>` válido según JWKS local. Un token emitido por OTP verifica idéntico a uno emitido por contraseña:
- `verifyJwt` local (JWKS cache) valida firma + `exp`.
- `deps.workspace.ensure(actorId)` invoca la RPC transaccional Q2-R3.
- Row lock `FOR KEY SHARE` sobre `auth.users` sigue garantizando serialización con `deleteUser`.

Flujo Q3 objetivo (a implementar en Q2/Q3, NO en Q1):
1. Usuario introduce email.
2. UI llama `supabase.auth.signInWithOtp({email, options:{shouldCreateUser: true}})`.
3. Server envía OTP (asíncrono).
4. UI muestra input de 6 dígitos + cooldown UX.
5. Usuario introduce código; UI llama `supabase.auth.verifyOtp({type:'email', email, token})`.
6. SDK cachea sesión en `localStorage[spabla_v2_fase9_auth]`.
7. UI dispara `POST /api/v2/onboarding` con `Authorization: Bearer <token>`.
8. Handler resuelve mapping/tenant/membership (idempotente si el actor ya existe).
9. UI navega al chat.

**Cero cambio contractual** en `/api/v2/onboarding`: sigue devolviendo `{tenantId, role:'owner', label}` sin `created` en el body (contract §10).

## 14 · Modelo de amenazas (matriz mínima)

| # | Amenaza | Actor | Activo | Vector | Protección Supabase | Protección SPABLA necesaria | Evidencia | Riesgo residual | Bloqueo impl. | Bloqueo prod. |
|---|---|---|---|---|---|---|---|---|---|---|
| T1 | Enumeración por status | Externo | Padrón email | `POST /otp` con `create_user:false` | Diferencia 200 vs 422 → **NO** | UI usa `shouldCreateUser: true`, mensaje opaco | §9 | Timing residual (~50ms) | No | No |
| T2 | Enumeración por timing | Externo | Padrón email | Medición latencia | 74ms vs 24ms → **NO** | `shouldCreateUser: true` reduce delta (crea fila para nuevos) | §9 | ~50ms indeleble | No | No |
| T3 | Robo del código en tránsito | MitM | Sesión | Interceptar email | TLS SMTP proveedor | Proveedor SMTP con TLS obligatorio; sender verificado | §4 | Depende SMTP | No | Sí (contratar) |
| T4 | Reutilización del código verificado | Interno | Sesión | Reusar mismo OTP | Single-use enforcement (`auth.one_time_tokens` DELETE) | Ninguna | §8 K | Cero | No | No |
| T5 | Código anterior tras reenvío | Interno | Sesión | Verificar OTP viejo | Reemplazo server-side | Ninguna | §7 C | Cero | No | No |
| T6 | Brute force por email | Externo | Cuentas | Probar 10^6 códigos | Rate limit por IP (30/5min); no por email | Q2 acepta límites Supabase (no crear tabla propia) | §8 | ~6/min por IP; 10^6 entropía × exp 300s | No | Doc/monitoring |
| T7 | Abuso de reenvío | Externo | SMTP quota | Solicitar OTPs masivos | `max_frequency=1s`, `sign_in_sign_ups=30/5min/IP` | Ninguna adicional | §7 D + I | Consumo SMTP quota | No | Contratar SMTP con burst |
| T8 | Flooding de correo a tercero | Externo | Buzón víctima | Solicitar OTP a email ajeno | `max_frequency=1s` + `email_sent` cap | Ninguna adicional | §10 | Depende cap SMTP | No | Doc SMTP |
| T9 | Contaminación de Inbucket local | CI | Fixture E2E | Correo residual | Aislamiento por `runId` | Helper con `DELETE` post-lectura | §11 | Cero si helper OK | Doc para Q2 helper | No |
| T10 | Filtración de OTP en logs | Interno | Correlation | `console.log(otp)` | Ninguna | Hash truncado; nunca imprimir crudo | §11 | Cero | Norma para Q2 | No |
| T11 | Filtración de OTP en artefactos CI | Interno | Playwright | Trace/screenshot | Ninguna | `playwright.config.ts` ya tiene `trace:off, video:off, HAR:off`. Screenshots on-failure NO deben capturar la caja del código con datos reales | §11 + config actual | Cero si convención se respeta | Doc para Q2/Q3 | No |
| T12 | Race entre `verifyOtp` y `onboarding` | Externo | Estado atómico | Verifica + POST concurrente | Q2-R3 advisory lock + row lock | Ninguna adicional | §13 (Q2-R3) | Cero | No | No |
| T13 | Pestañas concurrentes con OTP | Externo | Estado sesión | Dos verifyOtp en paralelo | Single-use → 2ª pestaña recibe `otp_expired` | UI muestra mensaje opaco | §8 K | Cero side-effect | No | No |
| T14 | Sesiones múltiples (misma cuenta) | Autorizado | JWT | `refresh_token_rotation=true, reuse_interval=10s` | Rotación + auth-continuity Q3-E2E-R 14/14 | Ninguna | Q3-E2E-R | Cero | No | No |
| T15 | Actor eliminado (Q2-R2) | Interno | Sesión huérfana | Reusar JWT tras `deleteUser` | Q2-R3 `FOR KEY SHARE` + P0002→401 | Ninguna | Q2-R3 acta | Cero | No | No |
| T16 | Normalización de email defectuosa | Externo | Padrón | `UPPER@X` vs `upper@x` | GoTrue **no** normaliza | Q2 normaliza cliente-side: `trim().toLowerCase()` | §9 | Cero tras fix | Sí (obligatorio Q2) | No |
| T17 | Plantilla con magic link (defecto por defecto) | Sistema | Modalidad | CLI default | Plantilla propia con `{{.Token}}` | Q2 debe añadir `[auth.email.template.magic_link]` | §4 | Bloqueante Q2 | Sí (obligatorio Q2) | No |
| T18 | Proveedor SMTP no configurado (Cloud) | Operaciones | Envío | `email_sent=2/h` default | Contratar SMTP | Q2 documenta requisitos; ops configura | §4 §10 | Cero cuando cerrado | No | Sí (contratar+cfg) |
| T19 | Indisponibilidad del correo | Operaciones | UX | SMTP caído | Ninguna | UX: retry, fallback a login password sigue disponible (§12) | §12 | Cero (password) | No | Monitoring |
| T20 | Entrega tardía del correo | Operaciones | UX | Latencia SMTP | `otp_expiry` amplio (300s) | UI muestra "Reintentar" tras cooldown | §7 | Bajo | No | Monitoring |
| T21 | Dependencia de Supabase Auth | Arquitectura | Portabilidad | Vendor lock-in | Ninguna | Adaptador `OtpProvider` (§15) para poder cambiar proveedor | §15 | Coste migración | No | Doc |
| T22 | Futura migración a infra propia | Arquitectura | Long-term | — | Ninguna | Preservar contrato agnóstico `signInWithOtp/verifyOtp` en la UI | §15 | Migración planificada | No | Doc |

## 15 · Portabilidad

**Dependencia actual del stack SPABLA respecto a Supabase Auth para OTP**:
- API HTTP: `POST /auth/v1/otp`, `POST /auth/v1/verify`, `POST /auth/v1/token`.
- SDK cliente: `@supabase/supabase-js` → `auth.signInWithOtp`, `auth.verifyOtp`.
- Server: `verifyJwt` local con JWKS (`http://127.0.0.1:54321/auth/v1/.well-known/jwks.json`).
- Persistencia SDK: `localStorage[spabla_v2_fase9_auth]` con `storageKey` fijo.

**Interfaces que Q2 debe respetar (sin abstracción prematura)**:
- `OtpForm` acepta un objeto de dependencias inyectable: `{signInWithOtp(email), verifyOtp(email, token)}` que en producción vienen de `useSupabaseBrowserClient()`. Los tests pueden inyectar mocks/stubs.
- `OtpForm` NO conoce detalles internos de GoTrue: no lee cookies, no lee localStorage directamente (delega en SDK), no depende de rutas `/auth/v1/*` hardcoded en el componente. Rutas viven en el SDK.
- El handler futuro (si Q2 decide envolver `/auth/v1/otp` con un `/api/v2/auth/otp` propio) actuaría como thin proxy que **añade CSRF, logging sanitizado, correlationId** — no como capa de negocio.

**Migración futura a infraestructura propia**:
- Requiere reemplazar `@supabase/supabase-js` → cliente propio con misma superficie `signInWithOtp/verifyOtp`.
- Persistir sesión: JWKS + JWT en formato compatible con `verifyJwt` server-side actual (ES256 + JWKS).
- Row lock Q2-R3 asume `auth.users` schema con PK `id`. Si el proveedor cambia, hay que preservar esa tabla con la misma estructura (o adaptar Q2-R3).
- Coste estimado: 2-3 hitos independientes. Fuera del alcance de 9.3.2-B.

## 16 · Valores cerrados para Q2

| Valor | Propuesta | Fuente | Bloqueo |
|---|---|---|---|
| Longitud del código | **6 dígitos** | `otp_length=6` default GoTrue; §2 | Cerrado |
| Expiración producción | **300 s (5 min)** | §6 balance | Cerrado |
| Expiración test/E2E | **60 s** | §6 (proyecto aislado, no productivo) | Cerrado |
| `max_frequency` (cooldown SMTP) | **60 s** productivo, **1 s** local | §7 | Cerrado |
| Cooldown visual UI | **60 s** contador (UX únicamente) | §7 | Cerrado |
| Nuevo código invalida anterior | **Sí, automático GoTrue** | §7 C | Cerrado |
| Máx intentos server-side | **`token_verifications=30/5min/IP`** (Supabase) | §8, §10 | Cerrado |
| Mensaje público genérico | **"Si el correo es válido, hemos enviado un código."** | §9 | Cerrado |
| Clasificación interna | `otp_expired` (opaca), `over_email_send_rate_limit`, `validation_failed`, `otp_disabled` (evitar exponiendo con `shouldCreateUser:true`) | §8, §9 | Cerrado |
| Normalización de email | **cliente: `email.trim().toLowerCase()`** (GoTrue no normaliza) | §9 T16 | Cerrado, Q2 debe implementarlo |
| Comportamiento usuario nuevo | **`shouldCreateUser: true`** — status uniforme 200 | §9 T1 | Cerrado |
| Comportamiento usuario existente | idem, status 200 | §9 | Cerrado |
| Convivencia password | **Sí, sin cambios en flujo password** | §12 | Cerrado |
| Fallo entrega correo | **Retry via UI + fallback disponible: login password** | §12, T19 | Cerrado |
| Proveedor SMTP producción | **Requerido pero no cerrado**: SendGrid/Postmark/AWS SES/Mailgun con TLS + domain verified + DKIM/SPF | §10, T18 | Bloqueo **producción** (no impl.) |
| Plantilla productiva | **[auth.email.template.magic_link] con `{{ .Token }}`** en `supabase/config.toml` + traducciones para 13 idiomas | §4 T17 | Bloqueo Q2 (obligatorio) |
| Barreras necesarias Q2 | (a) plantilla custom; (b) helper Inbucket con `runId`+redaction; (c) `OtpForm` con dependencias inyectables; (d) tests HTTP `signInWithOtp/verifyOtp` felices y de error; (e) test convivencia password | §14 T9/10/11 | Cerrado |
| Barreras necesarias Q3 | (a) E2E Chromium con OTP real desde Inbucket; (b) anti-falso-positivo que el código NO aparece en artefactos; (c) hasta la entrada al chat post-`/api/v2/onboarding` | §11 | Cerrado |

## 17 · Riesgos residuales (no bloqueantes de implementación)

- **Timing enumeration ~50 ms** (T2): no eliminable a nivel cliente. Mitigado parcialmente con `shouldCreateUser:true`.
- **Brute force por email ~6/min/IP** (T6): entropía 10^6 × exp 300s. Aceptado; monitoring en producción.
- **Correo puede llegar a spam en producción**: proveedor SMTP + DKIM/SPF + reputación de dominio son responsabilidad de operaciones.
- **Templates multi-idioma**: 13 idiomas SPABLA — Q2 puede empezar con inglés + fallback y ampliar en hito adicional. `subject` en `config.toml` es único string por proyecto.
- **Cloud rate limits no medidos**: bloqueo de operaciones, no de implementación local.
- **Filtración de OTP en artefactos CI si el helper de Q2 falla**: aplicar convenciones §11. Norma para Q2.

## 18 · Bloqueos de implementación vs. producción

**Bloqueos de implementación (deben resolverse en Q2)**:
1. Plantilla custom con `{{ .Token }}` (§4 T17).
2. Normalización de email cliente-side (§9 T16).
3. `shouldCreateUser: true` obligatorio (§9 T1).
4. Helper Inbucket/Mailpit con `runId` + hash + `DELETE` (§11).

**Bloqueos exclusivos de producción (fuera de alcance implementación local; requeridos para GO producción)**:
1. Contratar proveedor SMTP con TLS + DKIM/SPF (§4 T3 T18).
2. Ajustar `[auth.rate_limit]` en Supabase Cloud Dashboard según proveedor SMTP (§10 T18).
3. Configurar plantillas multi-idioma en Cloud (subject/body) (§4).
4. Monitoring de tasa de intentos fallidos (§14 T6).
5. Dominio de envío verificado.

## 19 · No regresión (§16 de la orden)

Ejecutado localmente contra el proyecto SPABLA (no el aislado):

| Suite | Resultado |
|---|---|
| `npx tsc --noEmit` root | PASS (exit 0) |
| `npx tsc --noEmit` engine | PASS (exit 0) |
| Engine Vitest | 41 files / **1120/1120** PASS |
| Client Vitest | 20 files / **257/257** PASS |
| SQL integration + `onboarding-auth-race.sh` | `SUITES OK` + `ALL SCENARIOS PASS` (S1/S2/S3) |
| onboarding presentation/integration/messages | 3 files / **43/43** PASS |
| `bash scripts/e2e/run-auth-continuity.sh` | **14/14** PASS (22.3s) |
| `bash scripts/e2e/run-onboarding-e2e.sh` (Q3-R) | **13/13** PASS (8.9s) |
| Restore drill local (macOS) | skip pre-existente (`sed -i` GNU); OK en CI |

Cero tests modificados. Cero código productivo tocado.

## 20 · Custodia del entorno

**Inicial**:
- Supabase local SPABLA: `Up 2-4 hours (healthy)`.
- Cero procesos Next/Playwright/Chromium.
- Puertos SPABLA 54321/54322 BUSY (Docker); 3111/3121/54323/54324 free.

**Durante**:
- Proyecto aislado `otp-audit` en `/tmp/otp-audit`: puertos 54421/54422/54423/54424 (Mailpit).
- Nunca colisionó con puertos SPABLA.
- `supabase stop --no-backup` sobre el aislado tras terminar mediciones.

**Final**:
- Supabase local SPABLA: intacto, mismos containers `Up 3+ hours (healthy)`.
- Proyecto aislado: destruido.
- Cero procesos residuales.
- Working tree: clean salvo `.claude/` (untracked, no tocado) + nuevos archivos documentales Q1.

## 21 · Archivos creados (exclusivos Q1)

- `docs/audit_reports/AUDIT_2026-08-25_hito-9-3-2-b-q1-otp-security-audit.md` (ESTE archivo).
- `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_2_B_OTP_CONTRACT.md` (NUEVO — contrato específico OTP, autosuficiente, ver §22).

Cero código productivo. Cero migración. Cero test. Cero cambio en `supabase/config.toml` del proyecto. Cero cambio en `.github/workflows/ci.yml`. Cero cambio en `package.json`.

## 22 · Contrato específico OTP

Se ha creado `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_2_B_OTP_CONTRACT.md` como contrato autosuficiente para Q2. Recoge las mediciones de este acta como fuente de verdad, define invariantes normativas (6 dígitos, exp 300s prod, `shouldCreateUser:true`, plantilla `{{.Token}}`, normalización cliente, convivencia password), y enumera los checkpoints que Q2 debe cerrar. NO modifica el plan oficial 9.3.

## 23 · Confirmación de no-alcance

- Cero implementación de `OtpForm`.
- Cero modificación de UI.
- Cero modificación de código productivo (`app/**`, `lib/**`).
- Cero modificación de migraciones.
- Cero modificación de Supabase Cloud.
- Cero envío de correos reales.
- Cero inicio de Q2/Q3/Q4/Q5.
- Cero promoción.
- Cero retirada de email + contraseña.
- Cero modificación de `main` ni de la rama oficial.
- Cero commit adicional post-reporte.

## 24 · Veredicto

Acta cerrada con evidencia empírica. Solicitud de revisión a Dirección. Si aprueba, Q2 puede arrancar con los valores y bloqueos definidos en §16/§18. **No se ejecuta Q2 aquí**.
