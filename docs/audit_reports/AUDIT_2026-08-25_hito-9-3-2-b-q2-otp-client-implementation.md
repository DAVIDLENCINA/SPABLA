# HITO 9.3.2-B-Q2 · IMPLEMENTACIÓN CLIENTE DEL ACCESO OTP POR EMAIL

Fecha: 2026-08-25
Rama: `spabla-v2/hito-9-3-2-b-q2-otp-client-implementation`
Base oficial: `957e59f854f4e2b95ccd8d37a5b03bd5fdca4624` (post-9.3.2-B-Q1-P)
Main (invariante): `e6128433d42e1e105529ed2f64212ca527034b6a`
Contrato gobernante: `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_2_B_OTP_CONTRACT.md` @ base oficial
Audit Q1 fuente: `docs/audit_reports/AUDIT_2026-08-25_hito-9-3-2-b-q1-otp-security-audit.md`

## 1 · Alcance

Implementación cliente completa del flujo OTP por email conforme al contrato oficial. Cero cambio de UI del login por contraseña (`SessionArea` invariante). Cero cambio de contrato onboarding. Cero cambio de RPC/migraciones. Cero E2E nuevo (queda para Q3). Cero promoción.

## 2 · Archivos añadidos/modificados

Nuevos:
- `lib/v2/client/otp-classify.ts` — clasificador puro provider error → OtpPublicState + `isProbablyValidEmail` + `normaliseEmailForUx` + `messageFor`.
- `lib/v2/client/otp-request.ts` — `requestOtpEmail(supabase, email)` con `shouldCreateUser:true` + `trim().toLowerCase()`.
- `lib/v2/client/otp-verify.ts` — `verifyOtpAndOnboard(supabase, email, token)` + `onlyDigits`.
- `app/v2/chat/components/OtpForm.tsx` — componente presentacional con dos vistas (email / code), cooldown UX 60s, concurrencia con `latest*OpRef`, `mountedRef` guard.
- `supabase/templates/otp_email.html` — plantilla local con `{{ .Token }}`, sin `{{ .ConfirmationURL }}`.
- `lib/v2/client/otp-classify.test.ts` — 15 tests unit.
- `lib/v2/client/otp-request.test.ts` — 8 tests unit.
- `lib/v2/client/otp-verify.test.ts` — 10 tests unit.
- `lib/v2/client/otp-template.test.ts` — 5 tests estáticos (plantilla + config).
- `lib/v2/client/otp-form.test.ts` — 19 tests estructurales (OtpForm + page).
- `lib/v2/client/otp-signin.integration.test.ts` — 4 tests integration Supabase local + Mailpit.

Modificados:
- `app/v2/chat/page.tsx` — toggle `authMethod: "password" | "otp"`, importa `OtpForm`, coexiste con `SessionArea`.
- `supabase/config.toml` — `[local_smtp] enabled = true` + `[auth.email.template.magic_link]` apuntando a la plantilla.

Cero cambios en: `app/api/**`, `lib/v2/server/**`, `supabase/migrations/**`, `.github/workflows/**`, `package.json`, `engine/**`, `docs/phases/**`.

## 3 · Arquitectura implementada

```
UI (React)
├── page.tsx (authMethod toggle)
│   ├── SessionArea.tsx  (password path — invariante)
│   └── OtpForm.tsx      (OTP path — Q2 nuevo)
└── helpers (pure)
    ├── otp-classify.ts  (provider error → OtpPublicState cerrado)
    ├── otp-request.ts   (signInWithOtp wrapper + normalización UX)
    └── otp-verify.ts    (verifyOtp + POST /api/v2/onboarding)
```

Autoridad de identidad: **Supabase Auth**. El actor efectivo es el `sub` del JWT emitido por `verifyOtp`. El cliente no decide actor/tenant/membership/role/nombre interno (contract §3.5). `normaliseEmailForUx` es preprocesamiento UX, no autoridad de identidad — la comprobación server-side sigue siendo `verifyJwt` local con JWKS (contract §7).

## 4 · Componente `OtpForm`

Estado interno mínimo: `step ("email"|"code")`, `rawEmail`, `normalisedEmail`, `code`, `busyRequest`, `busyVerify`, `error`, `info`, `cooldownEndAt`, `nowMs`. Cero persistencia externa. Cero `localStorage`/`sessionStorage`/`document.cookie`/`window.location`.

Estados públicos (vía `messageFor(state)`):
- `invalid_email` — "Introduce una dirección de email válida."
- `request_unavailable` — "No pudimos enviar el código. Vuelve a intentarlo en unos segundos."
- `cooldown_active` — "Espera unos segundos antes de solicitar otro código."
- `code_invalid_or_expired` — "El código no es válido. Solicita uno nuevo." (opaco: colapsa wrong / expired / reused / cross-email / invalidated-by-resend).
- `network_unavailable` — "Sin conexión. Vuelve a intentarlo cuando tengas red."
- `verify_unavailable` — "No pudimos verificar el código ahora mismo. Reintenta en unos segundos."
- `onboarding_unavailable` — "Tu acceso está siendo procesado. Vuelve a intentarlo en unos segundos."

Concurrencia: `latestRequestOpRef`/`latestVerifyOpRef` monotónicos; respuesta con opId obsoleto se descarta. `mountedRef.current = false` en desmontaje impide setState.

Test hooks: `__requestOverride`, `__verifyOverride`, `__cooldownSecondsOverride` permiten inyección para tests unit sin abstracción prematura.

## 5 · Plantilla OTP y config

`supabase/templates/otp_email.html`:
- Subject: `"SPABLA · tu código de acceso"` (via config.toml).
- Cuerpo: HTML plano con `{{ .Token }}` renderizado como 6 dígitos, letter-spacing 0.4em, font-size 1.8rem.
- Cero `{{ .ConfirmationURL }}`, cero `/auth/v1/verify`, cero enlace clickable de auth.
- Marca "SPABLA" (mayúsculas, respetada por test estático).

`supabase/config.toml` cambios:
- `[local_smtp] enabled = true` — arranca Mailpit local con `supabase start`. NO afecta Cloud (bloqueo de producción según Q1 §18).
- `[auth.email.template.magic_link]` con `subject` y `content_path` — GoTrue usa `magic_link` para el flujo `signInWithOtp` de email.

Guardas estáticas (`otp-template.test.ts`): plantilla contiene `{{ .Token }}`, NO contiene `{{ .ConfirmationURL }}`, NO contiene `/auth/v1/verify`, solo la variable `Token` está en whitelist. Config declara la sección apuntando al fichero.

## 6 · Ausencia de magic link

Verificado a tres niveles:
1. **Plantilla estática**: `otp-template.test.ts` rechaza `{{ .ConfirmationURL }}` y `/auth/v1/verify`.
2. **Correo real observado en integración**: `otp-signin.integration.test.ts` inspecciona el correo entregado a Mailpit y assertea `hasVerifyUrl=false`. Ejemplo run: `email_hash=c13bb8d1b650 code_hash=176ae9ee7f95` (evidence hashes only, códigos reales nunca en logs).
3. **Componente**: `OtpForm.tsx` no maneja ningún URL de auth ni intercepta callbacks/redirects.

## 7 · Solicitud OTP

`requestOtpEmail(supabase, rawEmail)`:
1. `normaliseEmailForUx(rawEmail)` → `trim().toLowerCase()`.
2. `isProbablyValidEmail(email)` → si falso, `error: invalid_email` sin invocar SDK.
3. `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`.
4. Si error → `classifyOtpRequestError` → `OtpClientError` opaco.
5. Si OK → `{ kind: "ok", normalisedEmail }`.

`shouldCreateUser: true` es **invariante**. Guardas:
- Test unit `otp-request.test.ts` verifica `spy.calls[0].options.shouldCreateUser === true` en 2 tests.
- Test estructural `otp-form.test.ts` verifica que el componente usa `requestOtpEmail` (que lo enforce).

## 8 · Verificación

`verifyOtpAndOnboard(supabase, normalisedEmail, token)`:
1. `onlyDigits(token)` — sanea, trunca a 6.
2. Si `length !== 6` → `verify_error: code_invalid_or_expired` sin invocar SDK.
3. `supabase.auth.verifyOtp({ type: "email", email, token })`.
4. Si error → `verify_error` opaco.
5. Si OK sin sesión → `verify_error: verify_unavailable` (nunca fabricamos sesión).
6. Con sesión → `fetch("/api/v2/onboarding", Authorization: Bearer <token>)`.
7. Onboarding OK → `{ kind: "ok", session, tenantId, role, label }`.
8. Onboarding error → `{ kind: "onboarding_error", session, error: onboarding_unavailable }` — **sesión preservada**.

Ejemplo test unit: verifica que se pasa `Authorization: Bearer <the-real-access-token>` byte-por-byte del session del SDK.

## 9 · Integración onboarding / bootstrap / chat

Tras `verifyOtpAndOnboard` OK, `OtpForm.onAuthenticated()` invoca callback en `page.tsx` que:
- Limpia `sessionExpiredRef` + `sessionExpired`.
- Vuelve al modo `password` como estado por defecto.
- `page.tsx` ya escucha `supabase.auth.onAuthStateChange`: la sesión llega vía SDK, se dispara `useEffect` que fetches bootstrap, se dispara polling.

Cero fabricación de JWT. Cero llamada duplicada al onboarding. Idempotencia garantizada por el propio endpoint (contract 9.3.2-A §14 rows 5-13).

## 10 · Convivencia con contraseña

- `SessionArea.tsx` no fue tocado.
- `signIn(email, password)` en `page.tsx` intacto.
- Toggle `authMethod: "password" | "otp"` permite alternar sin recarga, sin perder cliente Supabase (`useSupabaseBrowserClient` singleton), sin OTP residual, sin solicitudes activas cruzadas.
- Test estructural `otp-form.test.ts § page.tsx · integración`: verifica que `SessionArea` recibe los mismos props productivos (`signInEmail`, `signInPassword`, `onSignInEmailChange`, `onSignInPasswordChange`, `signInError`, `signInBusy`, `onSignIn`) — cero regresión.
- Test integration `otp-signin.integration.test.ts` no toca password path.

## 11 · Estados UI

**Vista email**:
- Vacío (botón "Recibir código" disabled).
- Email escrito (botón enabled).
- Enviando (`aria-busy` en botón, texto "Enviando…", input disabled).
- Error opaco (`role="alert"`, `aria-live="polite"`, `aria-describedby` en input).
- Botón secundario "Acceder con contraseña" siempre visible.

**Vista código**:
- Destino parcialmente enmascarado (`a****@dom.tld` vía `maskEmailForDisplay`).
- Banner info opaco tras solicitud (`role="status"`, `aria-live="polite"`).
- Input 6 dígitos (`inputMode="numeric"`, `autocomplete="one-time-code"`, `pattern="[0-9]*"`, `maxLength=6`). Sanitiza pegado no numérico con `onlyDigits`.
- Botón "Verificar código" disabled hasta 6 dígitos.
- Botón "Reenviar código" con cooldown `Reenviar en Ns` (0..60s) — deshabilitado durante cooldown y durante busy.
- Botón "Cambiar email" invalida operaciones pendientes.

## 12 · Cooldown

- 60s tras solicitar código (o reenviar).
- Reactivable en cada nueva solicitud.
- Contador visual accesible: `aria-label="Reenviar código en Ns"`.
- Constante `RESEND_COOLDOWN_SECONDS = 60` declarada explícitamente como UX-only (comentario + test estático `otp-form.test.ts § cooldown declarado como UX (60s) y no como barrera de seguridad`).
- La barrera server-side (Supabase Auth `max_frequency=1s` local, ~60s en Cloud tras Q2) sigue siendo la autoridad.

## 13 · Errores públicos

Clasificación cerrada de 7 estados públicos. Cero propagación de mensajes del proveedor. Los códigos wrong / expired / reused / cross-email / invalidated-by-resend colapsan al mismo `code_invalid_or_expired` (contract §6, audit Q1 §8).

Observabilidad: `OtpClientError.internalKind` preserva la clasificación interna sanitizada (nunca PII, nunca token, nunca email). Se puede loguear server-side en un hito futuro sin exponer al cliente.

Cero `console.log/info/debug/warn/error` en `OtpForm.tsx` — verificado por test estático.

## 14 · Seguridad y privacidad

- **Cero OTP en logs**: `otp-form.test.ts` graba ausencia de todo `console.*` en `OtpForm.tsx`.
- **Cero persistencia**: `otp-form.test.ts § cero persistencia` verifica ausencia de `localStorage`, `sessionStorage`, `document.cookie`, `window.location`, `history.pushState/replaceState` en código productivo (permite menciones en comentarios/docstrings).
- **Cero magic link**: §6.
- **Cero service_role cliente**: helpers cliente usan `SupabaseClient` inyectado (que es el singleton anon). Los tests integration usan `service_role` sólo para fixture cleanup vía `admin.auth.admin`.
- **Cero tabla propia OTP**: cero cambio en `supabase/migrations/`.
- **Cero endpoint OTP propio**: cero cambio en `app/api/`.
- **Cero secretos añadidos**: cero `NEXT_PUBLIC_*` nuevo, cero cambio de env vars productivas.
- **Cero correo real en tests**: dominios reservados `spabla.test` + `runId` datetime-hex.

## 15 · Concurrencia cliente

- **Doble clic en solicitar**: cada request lleva `opId = ++latestRequestOpRef.current`; sólo la última cuenta.
- **Doble clic en verificar**: idem con `latestVerifyOpRef`.
- **Reenvío durante solicitud**: `doResend` limpia código y llama a `doRequest` que descarta respuestas obsoletas por opId.
- **Verificar durante reenvío**: `busyRequest || busyVerify` deshabilita botones.
- **Cambiar email durante solicitud**: `backToEmail()` incrementa ambos refs (invalida) + resetea estado.
- **Respuesta antigua tras cambiar email**: al llegar la respuesta obsoleta, `opId !== latestRequestOpRef.current` → descarte.
- **Desmontaje**: `mountedRef.current = false` en cleanup del useEffect impide setState.
- **Dos pestañas**: Supabase SDK cachea sesión en `localStorage[spabla_v2_fase9_auth]` compartido. Comportamiento idéntico al login password preexistente. Cero corrupción.

## 16 · Accesibilidad

- Labels asociados via `htmlFor`/`id`.
- `aria-invalid` en input cuando hay error del campo.
- `aria-describedby` vincula el mensaje de error al input.
- `aria-live="polite"` en info banner y en `<p role="alert">`.
- `aria-busy` en botones durante operaciones.
- `aria-label` en botones secundarios y en el contador de reenvío.
- Navegación por teclado natural (`<button>`, `<input>`).
- Textos en español (SessionArea también); Q3 podrá extender via catálogo server-owned si se decide.
- Contraste basado en las mismas paletas SPABLA (DEEP, BORDER, CORAL, SPABLA_BLUE) del `SessionArea`.
- Foco: al pasar de step `email` → `code`, el input código está listo para tab natural (no `autoFocus` forzado para no romper a lectores de pantalla).

## 17 · Matriz requisito → test

| Requisito orden Q2 FASE 15 | Test |
|---|---|
| 1 · Render inicial | `otp-form.test.ts § importa y usa los helpers puros` |
| 2 · Email inválido | `otp-classify.test.ts § isProbablyValidEmail rechaza inputs inválidos`, `otp-request.test.ts § rechaza email inválido antes de golpear al SDK` |
| 3 · Normalización UX | `otp-classify.test.ts § normaliseEmailForUx aplica trim + toLowerCase`, `otp-request.test.ts § normaliza el email` |
| 4 · `shouldCreateUser:true` | `otp-request.test.ts § SIEMPRE pasa shouldCreateUser:true` |
| 5 · Respuesta opaca new/existing | `otp-request.test.ts § respuesta usuario nuevo vs existente es idéntica`, `otp-signin.integration.test.ts § misma respuesta pública` |
| 6 · Solicitud exitosa | `otp-signin.integration.test.ts § plantilla local: correo entregado contiene 6 dígitos` |
| 7 · Solicitud fallida | `otp-request.test.ts § clasifica error del proveedor` |
| 8 · Doble envío | `otp-form.test.ts § usa refs monotónicos` |
| 9 · Entrada OTP sólo numérica | `otp-verify.test.ts § onlyDigits elimina caracteres no numéricos y trunca a 6` |
| 10 · Pegado de 6 dígitos | `otp-verify.test.ts § onlyDigits` (acepta `"123-456"`, `"1 2 3 4 5 6"`) |
| 11 · Código corto | `otp-verify.test.ts § rechaza tokens de longitud distinta a 6` |
| 12 · Verificación correcta | `otp-signin.integration.test.ts § verifyOtp con código válido retorna sesión real` + `otp-verify.test.ts § éxito completo` |
| 13 · Verificación incorrecta/caducada | `otp-verify.test.ts § propaga error de verifyOtp como verify_error opaco` |
| 14 · Doble verificación | `otp-verify.test.ts § segunda verificación con mismo código retorna verify_error opaco` |
| 15 · Reenvío | `otp-signin.integration.test.ts § cooldown` + `otp-form.test.ts § usa refs monotónicos` |
| 16 · Cooldown UX | `otp-form.test.ts § cooldown declarado como UX (60s)` |
| 17 · Invalidación visual código anterior | `otp-form.test.ts § limpia el código en memoria tras verificar/reenvíar` |
| 18 · Cambio de email | `otp-form.test.ts § usa refs monotónicos` + `backToEmail` inspeccionado en source |
| 19 · Limpieza del OTP | `otp-form.test.ts § limpia el código en memoria` |
| 20 · Cero persistencia | `otp-form.test.ts § cero persistencia del OTP` |
| 21 · Cero filtración en logs | `otp-form.test.ts § cero console.log/info/debug del OTP/code/token` |
| 22 · Integración onboarding | `otp-verify.test.ts § éxito completo: verifyOtp + onboarding 200 → kind='ok'` |
| 23 · Bootstrap operativo | Integrado en `page.tsx` sin cambios (bootstrap existente se dispara vía `onAuthStateChange`) |
| 24 · Fallo recuperable de onboarding | `otp-verify.test.ts § verifyOtp OK + onboarding 503 → onboarding_error, sesión preservada` |
| 25 · Password permanece funcional | `otp-form.test.ts § SessionArea recibe los mismos props productivos` |
| 26 · Cambio OTP/password | `otp-form.test.ts § mantiene authMethod con toggle password/otp` |
| 27 · Respuesta obsoleta ignorada | `otp-form.test.ts § usa refs monotónicos para descartar respuestas obsoletas` |
| 28 · Desmontaje seguro | `otp-form.test.ts § mountedRef previene setState tras desmontaje` |
| 29 · Template contiene `{{ .Token }}` | `otp-template.test.ts § contiene {{ .Token }}` |
| 30 · Template NO contiene `ConfirmationURL` | `otp-template.test.ts § NO contiene {{ .ConfirmationURL }} ni magic link funcional` |
| 31 · Cero magic link | idem §30 + `otp-signin.integration.test.ts § plantilla local: hasVerifyUrl=false` |
| 32 · Accesibilidad básica | `otp-form.test.ts § aria-live`, `aria-describedby`, `aria-busy` |
| 33 · Localización | Sección §16 (español; catálogo server-owned para Q3 si se decide) |
| 34 · Actor y tenant no controlables por cliente | `otp-classify.test.ts § normalisación NO se presenta como autoridad de identidad` + arquitectura §3 |

## 18 · Rondas locales

**Ronda 1** (tras reset limpio, todas las suites):
- Engine Vitest: 41 files / 1120 tests PASS.
- Client Vitest: 26 files / **318 tests PASS** (61 nuevos OTP).
- SQL integration + race Q2-R3: `SUITES OK` + `ALL SCENARIOS PASS`.
- Presentation onboarding: 3 files / 43 tests PASS.
- OTP integration (Supabase local + Mailpit): 1 file / 4 tests PASS.
- Auth-continuity: 14/14 PASS (21.5s).
- Onboarding E2E Q3-R: 13/13 PASS (8.7s, concurrencia deterministic 6 waiters).

**Ronda 2** (confirmatoria):
- Client Vitest: 26 files / **318 tests PASS**.
- OTP integration: 4 tests PASS (750ms).

Cero flaky, cero skipped inesperados, cero retries.

## 19 · Regresión completa

| Suite | Estado |
|---|---|
| `tsc --noEmit` root | PASS |
| `tsc --noEmit` engine | PASS |
| Engine Vitest (1120) | PASS |
| Client Vitest (257 histórico + 61 OTP = 318) | PASS |
| SQL integration + race Q2-R3 | PASS |
| onboarding presentation/integration/messages (43) | PASS |
| auth-continuity Q3-E2E-R (14) | PASS |
| onboarding E2E Q3-R (13) | PASS |
| OTP integration (nuevo, 4) | PASS |
| Restore drill local | skip macOS (`sed -i` GNU pre-existente); OK en CI |

Cero tests modificados fuera de los nuevos Q2.

## 20 · Riesgos residuales

- **Timing enumeration ~50ms**: heredado del proveedor (audit Q1 §9 T2). Mitigado parcialmente con `shouldCreateUser:true`.
- **Localización multi-idioma**: Q2 usa castellano (paridad con SessionArea). Q3 puede extender vía catálogo server-owned si producto lo pide.
- **Focus management entre steps**: no forzamos `autoFocus` para no romper a screen readers; UX de teclado depende del orden natural.
- **PostgREST reconnect tras reset**: heredado — Job B/E CI dan tiempo suficiente durante `--reset` (>90s hasta Next ready).
- **Ghost users tras signInWithOtp** (audit Q1 §9): `shouldCreateUser:true` crea el usuario aunque nunca verifique el código. Cleanup manual en Cloud, no bloqueante para Q2 local.

## 21 · Bloqueos exclusivos de producción

Heredados del contrato OTP §13 (audit Q1 §18); NO se resuelven en Q2:

1. Contratar SMTP con TLS + DKIM + SPF + dominio verificado.
2. Configurar `[auth.email.smtp]` en Supabase Cloud Dashboard con secrets.
3. Configurar plantilla productiva en Dashboard (o mantener `magic_link` custom local + subir plantilla equivalente).
4. Ajustar `[auth.rate_limit]` según proveedor SMTP.
5. Configurar métricas/alertas de tasa de fallos.
6. Cleanup periódico de ghost users si se detecta abuso.

## 22 · Custodia del entorno

**Inicial**:
- Supabase local activo (containers `Up 37 minutes / 5 hours`).
- Puertos 3000/3111/3121 free, 54321/54322 BUSY (Docker).
- Cero procesos next/playwright/chromium.

**Durante Q2**:
- `supabase stop --no-backup` + `supabase start` **una vez** para levantar Mailpit (nuevo container `supabase_inbucket_*` tras habilitar `local_smtp`).
- Cero procesos residuales tras cada suite.

**Final**:
- Supabase local mismo estado (containers healthy; ahora incluye `supabase_inbucket_*`).
- Puerto 54324 (Mailpit) BUSY — nuevo pero esperado por config.
- Cero procesos residuales.

## 23 · Confirmación de cero Q3

Cero código, tests, migraciones ni scripts nuevos de Q3 (E2E). El helper `otp-signin.integration.test.ts` NO es E2E — es integration (backend HTTP directo, sin navegador). Q3 será responsable de la barrera E2E completa con Chromium + Inbucket real + recorrido usuario nuevo/existente + expiración acelerada + anti-filtración.

## 24 · Confirmación de cero promoción

- Main `e6128433…` invariante.
- Oficial `957e59f8…` invariante.
- Rama Q2 aislada, sin merge ni push a oficial.
- Cero tag.
