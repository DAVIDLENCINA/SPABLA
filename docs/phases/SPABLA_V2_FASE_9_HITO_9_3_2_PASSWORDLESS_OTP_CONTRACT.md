# SPABLA V2 · Hito 9.3.2 — Contrato de alta y login passwordless por OTP email

**Rama documental**: `spabla-v2/hito-9-3-2-passwordless-otp-contract`
**Base oficial exacta**: `8c4b6e6346465f9aad26f174d64a8f668139ae0a` (`spabla-v2/thirteen-languages-activation`, cerrada por `HITO 9.3.1-Q3-P · AUTH CONTINUITY PROMOVIDA A OFICIAL — CERRADO`).
**Plan gobernante**: `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_PLAN.md` V1.2 §7 (secuencia 9.3.1 → 9.3.2 → 9.3.3 → 9.3.4 → 9.3.5).
**Contrato previo (heredado)**: `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_1_Q2_CONTRACT.md` + Addendum Q3-E2E.
**Acta previa**: `docs/audit_reports/AUDIT_2026-08-22_hito-9-3-1-q3-auth-continuity-implementation.md` (Q3, Q3-R, Q3-E2E, Q3-E2E-R).
**Autoridad**: Este documento **congela el alcance normativo** del hito 9.3.2. La implementación requerirá una **orden operativa separada** ejecutada estrictamente sobre este alcance; ninguna orden operativa podrá ampliarlo unilateralmente.

---

## 1 · Identidad del hito

**«Hito 9.3.2 — Alta/login passwordless por OTP email»**, subhito del hito 9.3 (Continuidad y autenticación), enmarcado en la Fase 9 (Thirteen-Languages Activation) del roadmap SPABLA V2.

## 2 · Decisión de Dirección (2026-08-22)

Dirección autoriza el arranque de 9.3.2 con exactamente la siguiente configuración:

1. **Modalidad principal**: OTP de seis dígitos enviado por correo electrónico.
2. **Identificador inicial**: email normalizado y verificado por Supabase Auth.
3. **Convivencia con `email + password`**: se conserva como acceso alternativo secundario. NO se elimina en 9.3.2 (ni por migración destructiva ni por transcurso de plazo). Su retirada eventual será un subhito posterior con decisión de Dirección y evidencia de producción (§38).
4. **Modalidades explícitamente excluidas** (§35): SMS OTP, magic link, passkeys/WebAuthn, OAuth social, teléfono, dispositivos vinculados, gestión y revocación de sesiones, nativas, multicuenta. Ninguna implementación parcial ni bajo flag.
5. **Criterio de producto**: flujo lineal email → código → sesión → chat, con respuesta indistinguible entre alta y login. Sin magic link camuflado.

## 3 · Problema de usuario

`Product Core §1-2` describe usuarios que quieren conversar sin fricción de idioma (abuela argentina, fisioterapeuta, pareja intercultural, adolescente en intercambio, equipo remoto trilingüe, padre viudo). Para todos ellos, `email + password` presenta dos barreras concretas:

- **Recordar/crear una contraseña** aumenta el abandono en el primer acceso.
- **Reintroducir la contraseña en un dispositivo nuevo** rompe la continuidad tipo WhatsApp.

OTP email elimina ambos vectores manteniendo un identificador universal (email) y sin introducir dependencia de hardware específico (passkey), operador SMS (cobertura regional) o proveedor OAuth (privacidad y disponibilidad).

## 4 · Flujo funcional nominal

```
1. Usuario abre /v2/chat sin sesión activa (o sesión terminada).
2. UI muestra formulario passwordless: un único campo email + botón "Recibir código".
3. Usuario introduce email y envía.
4. Cliente invoca supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }).
5. Backend Supabase Auth:
   - Si el email no existe → crea el registro auth.users (email confirmado tras verifyOtp).
   - Si existe → reutiliza el registro.
   - Envía correo con OTP de 6 dígitos según plantilla que emplea {{ .Token }}.
6. UI transita a estado "código enviado": mensaje neutral («Si el correo es correcto,
   recibirás un código en unos segundos»), campo para 6 dígitos, botón reenviar
   deshabilitado durante la ventana mínima.
7. Usuario introduce el código y envía.
8. Cliente invoca supabase.auth.verifyOtp({ email, token, type: 'email' }).
9. Backend Supabase Auth valida:
   - Código coincide, no expirado, no reutilizado, no superado el nº máximo de intentos.
   - Devuelve { data: { session, user }, error: null } → sesión persistida en localStorage
     bajo la storageKey Q3 (`spabla_v2_fase9_auth`), refresh_token válido, autoRefreshToken
     activo.
10. Máquina de estados Q3 continua: SessionReady → BootstrappingContext →
    GET /api/v2/bootstrap → ContextReady. Sin volver a mostrar formulario.
```

## 5 · Alta de usuario nuevo

- Fluye por la misma llamada `signInWithOtp({email, options:{shouldCreateUser: true}})`. Supabase crea el registro `auth.users` en el momento del envío del OTP con el estado natural del proveedor (email no verificado hasta el `verifyOtp`).
- El primer `verifyOtp` con éxito marca el email como verificado.
- Cero campo adicional en el formulario (sin nombre, sin idioma, sin apellidos). El resto de metadatos se resuelve tras bootstrap (§12).
- Cero tabla nueva en `spabla_v2` (§9, §13).

## 6 · Login de usuario existente

- Idéntica llamada (`shouldCreateUser: true`), idéntica UI. El backend no expone ninguna señal diferencial (§22).
- Si el usuario existe con `email + password` (creado en 9.3.1), OTP no altera su contraseña ni la desactiva; sólo abre una sesión (§7).
- Tras `verifyOtp`, la sesión resultante es idéntica en semántica a la de `signInWithPassword`: mismo `access_token`, mismo `refresh_token`, misma `storageKey`. Q3 aplica sin ramas alternativas.

## 7 · Compatibilidad temporal con `email + password`

- El formulario passwordless es la **vía principal** presentada en `/v2/chat` cuando no hay sesión.
- La UI incluye un enlace secundario, sin destacar visualmente, del tipo «¿Prefieres entrar con contraseña?» que despliega el formulario legado (`#spabla-session-email` + `#spabla-session-password` + botón «Iniciar sesión»).
- Nada cambia en `SessionArea.tsx` respecto a la lógica de `signInWithPassword` de 9.3.1 (§39): el legado sobrevive intacto para permitir recuperación de usuarios existentes mientras OTP no haya superado §38.
- Retirada futura del legado: §38.

## 8 · Estados de UI

| Estado | Trigger | Elementos visibles | Elementos ocultos |
|---|---|---|---|
| `Idle` | Página cargada sin sesión, sin OTP enviado | Campo email, botón «Recibir código», enlace secundario «¿Prefieres entrar con contraseña?» | Campo OTP, banner de éxito, banner de error |
| `OtpRequested` | `signInWithOtp` devuelve sin error | Mensaje neutral «Si el correo es correcto, recibirás un código en unos segundos», campo OTP (6 dígitos numéricos), botón «Verificar», enlace «Reenviar código» (deshabilitado durante ventana mínima) | Campo email (permanece visible pero read-only para permitir corrección con acción explícita), botón «Recibir código» (deshabilitado o convertido en «Cambiar email») |
| `OtpVerifying` | Usuario envía código | Spinner en botón «Verificar»; resto deshabilitado | — |
| `OtpError` | `verifyOtp` devuelve error clasificable (ver §18) | Mensaje neutral del tipo del error, campo OTP re-editable, botón «Verificar» activo, contador de intentos si aplica | — |
| `OtpExpired` | Backend responde código expirado (§19) | Mensaje «El código ha expirado. Pide uno nuevo», botón «Reenviar código» activo | Campo OTP |
| `SessionEstablished` | `verifyOtp` devuelve `session` no nulo | Redirección natural al chat (misma transición que 9.3.1) | Todo formulario |
| `PasswordFallback` | Usuario pulsa enlace secundario | Formulario legado 9.3.1 (`#spabla-session-email`, `#spabla-session-password`, botón «Iniciar sesión»); enlace inverso «Volver a acceso por código» | Formulario OTP |

## 9 · Máquina de estados

Estado global de la sesión (extensión estricta de Q3-R §5-§9):

```
                 ┌────────────────────────────────────────────┐
                 │                                            │
                 ▼                                            │
        [SessionMissing] ──email→ [OtpRequested]              │
                 ▲                    │                       │
                 │                    ▼                       │
                 │             [OtpVerifying] ──error→ [OtpError]
                 │                    │                       │
                 │                    ▼                       │
                 └──────── [SessionReady] ──bootstrap→ [ContextReady]
                                     ▲   ▲                    ▲
                                     │   │                    │
                          password──┘   └──OTP────────────────┘
```

- Tanto OTP como password producen la misma `SessionReady`. A partir de aquí, la máquina Q3 permanece invariable.
- `OtpExpired` → transición explícita de vuelta a `OtpRequested` cuando el usuario reenvía código.
- Cero rama nueva en `session-refresh-coordinator.ts`, `fetch-with-auth-retry.ts`, `auth-recovery-coordinator.ts`, `bootstrap-client.ts`.

## 10 · Contrato con Supabase Auth (verificado estáticamente sobre el SDK instalado)

**SDK instalado**: `@supabase/supabase-js@2.106.2` → `@supabase/auth-js/dist/main/GoTrueClient.d.ts` lines 968-1023.

- `signInWithOtp({ email, options?: { shouldCreateUser?: boolean, emailRedirectTo?: string, data?: object, captchaToken?: string } })` devuelve `AuthOtpResponse = { data: { user: null, session: null }, error: null | AuthError }`. El SDK explícitamente documenta: *«By default, a given user can only request a OTP once every 60 seconds.»* (línea 977).
- `verifyOtp({ email, token, type: 'email' })` → `AuthResponse = { data: { user, session } | { user: null, session: null }, error }`. Line 1023-1161.
- `EmailOtpType` incluye `'email'` como el tipo canónico para OTP puro (line 704). `'magiclink'` está marcado deprecated (line 1034).
- **Comportamiento de plantilla**: el SDK documenta *«Magic links and OTPs share the same implementation. To send users a one-time code instead of a magic link, modify the magic link email template to include `{{ .Token }}` instead of `{{ .ConfirmationURL }}`.»* (line 973). Consecuencia práctica: el hito 9.3.2 debe garantizar que el template `magic_link` del proyecto Supabase remoto y del `supabase/templates/` local emitan **exclusivamente `{{ .Token }}`**; nunca `{{ .ConfirmationURL }}` (que implicaría magic link camuflado, prohibido por §2.4).
- `shouldCreateUser: true` (default) unifica alta y login sin filtrar existencia (§22).
- La sesión resultante utiliza la misma `storageKey` (`spabla_v2_fase9_auth`, singleton en `lib/v2/client/supabase-browser-client.ts:20`), `persistSession: true`, `autoRefreshToken: true`. Cero divergencia con Q3.

**Documentación externa autoritativa** (consultada 2026-08-22, sin copiar contenido):
- `https://supabase.com/docs/reference/javascript/auth-signinwithotp`
- `https://supabase.com/docs/guides/auth/auth-email-templates`
- `https://supabase.com/docs/guides/auth/rate-limits`
- `https://supabase.com/docs/guides/local-development/customizing-email-templates`

## 11 · Integración con bootstrap

- Tras `verifyOtp`, la sesión sigue exactamente el flujo `SessionReady → fetchBootstrap()` de Q3.
- `GET /api/v2/bootstrap` recibe `Authorization: Bearer <access_token>` idéntico al de `signInWithPassword`; el servidor no distingue el origen del token.
- `verifyJwt` (server-side, `lib/v2/server/composition.ts`) sigue siendo la única validación de identidad por request (Q3-R §FASE 4).
- Ninguna ruta nueva. Ningún cambio en `/api/v2/bootstrap`, `/api/v2/messages`, `/api/v2/seed`.

## 12 · Tenant y membership

Comportamiento equivalente al de 9.3.1:

- Alta OTP crea `auth.users.<id>` con `raw_user_meta_data = {}` (cero metadatos SPABLA en el hito).
- El primer bootstrap post-verifyOtp para un usuario nuevo devuelve `memberships: []`, `selectedTenantId: null`, `canOperate: false`. La UI muestra el mensaje contractual del escenario 11 (bootstrap ausente).
- La creación efectiva del tenant y membership del actor **NO es alcance de 9.3.2**. Sigue viviendo en el dev seed (`/api/v2/seed`, POST-only tras 9.2.5-C) o en la orden operativa que Dirección apruebe posteriormente. Ver §35.
- **Consecuencia práctica**: el hito 9.3.2 valida el flujo OTP hasta `SessionReady + canOperate=false` para altas puras; la validación con `canOperate=true` reutiliza los usuarios sembrados que ya tienen membership, exactamente igual que hace la barrera E2E Q3-E2E-R con `userAId`.

## 13 · Idempotencia

- **`signInWithOtp` es idempotente por naturaleza**: para el mismo email antes de expirar el OTP anterior, Supabase invalida el código anterior y emite uno nuevo (comportamiento nativo del servidor `gotrue`; ver §19).
- El cliente **no** debe crear registros locales adicionales por cada solicitud. Cero tabla `otp_challenges`, cero contadores propios: la fuente autoritativa es `auth.users` + `auth.one_time_tokens` gestionadas por Supabase.
- `verifyOtp` con un código ya consumido devuelve error clasificable; la UI muestra estado `OtpExpired`/`OtpError` sin recrear el usuario.

## 14 · Concurrencia

- Dos submisiones simultáneas del formulario email (doble-click, red lenta): la UI debe deshabilitar el botón «Recibir código» al primer submit y esperar a la respuesta. Sin lock interno adicional (Supabase resuelve el rate limit).
- Dos submisiones simultáneas del código: la UI debe deshabilitar «Verificar» al primer submit. Si Supabase acepta la primera y la segunda encuentra un código ya consumido, la UI reconcilia sobre la sesión establecida (`onAuthStateChange` → `SIGNED_IN`).
- Pestaña A pide OTP, pestaña B pide OTP para el mismo email: el segundo `signInWithOtp` invalida el código de la pestaña A (§13). La pestaña A que introduzca el código antiguo verá `OtpError` → guiada a reenviar. Cero fantasma.

## 15 · Continuidad entre pestañas

- Cero regresión respecto a Q3-E2E-R §20-4, §20-5, §20-12A, §20-12B.
- Una vez `SessionReady`, todas las pestañas del mismo `BrowserContext` comparten la sesión (cross-tab observation del SDK via `storage` event + BroadcastChannel).
- El formulario OTP en una pestaña nunca sobreescribe la sesión activa de otra pestaña: si la sesión aparece durante `OtpRequested`, la UI transita a `SessionEstablished` automáticamente por `onAuthStateChange`.

## 16 · Continuidad tras recarga

- `Q2 §20-2` (recarga con sesión activa) no cambia.
- Recarga durante `OtpRequested` (sesión aún no establecida): la UI vuelve a `Idle` con el mismo campo email vacío. El OTP emitido sigue válido en Supabase hasta expiración; el usuario puede introducirlo si recuerda el código, o pedir uno nuevo tras la ventana mínima.

## 17 · Continuidad tras reinicio de Next

- `Q2 §20-6` (kill+restart REAL del `next dev` process group) no cambia.
- Reinicio durante `OtpRequested`: comportamiento equivalente a §16 (recarga tras `Next up`).

## 18 · Errores de código

Clasificación explícita en la UI:

| Error del backend | Estado UI | Mensaje neutral | Acción del usuario |
|---|---|---|---|
| Código no coincide | `OtpError` (contador +1) | «Código incorrecto» | Reintentar (hasta límite) |
| Código expirado (§19) | `OtpExpired` | «El código ha expirado. Pide uno nuevo» | Reenviar |
| Código ya consumido | `OtpError` | «Este código ya se usó. Pide uno nuevo» | Reenviar |
| Máximo de intentos superado | `OtpError` bloqueante | «Demasiados intentos. Vuelve a solicitar un código» | Reenviar tras ventana |
| Error de red / Supabase caído | `OtpError` transitorio | «No hemos podido validar el código, inténtalo en unos segundos» | Reintentar sin invalidar OTP |

Ninguno de estos mensajes revela si el email existe (§22).

## 19 · Caducidad

- **Valor por defecto Supabase (`gotrue`)**: OTP email válido durante **3600 segundos (1 hora)** — configurable vía `SUPABASE_AUTH_OTP_EXP` o `auth.otp_expiry` en `supabase/config.toml`. Fuente: `https://supabase.com/docs/guides/auth/rate-limits` + `gotrue` env var reference.
- SPABLA adopta el default de 1 hora salvo que la orden operativa de implementación demuestre un requisito para reducirlo (análisis STRIDE §9 del plan 9.3).
- El código expirado se rechaza server-side; la UI transita a `OtpExpired` (§18).

## 20 · Reenvío

- Ventana mínima entre solicitudes: **60 segundos por email** (default gotrue). Fuente: doc del SDK line 977 y `https://supabase.com/docs/guides/auth/rate-limits`.
- La UI debe mostrar un contador visible (por ejemplo «Podrás pedir otro código en 45 s»); el botón «Reenviar código» permanece deshabilitado hasta que el contador llegue a 0.
- El reenvío usa la misma llamada `signInWithOtp` — no `resend()` — porque `resend()` requiere un `type: 'signup' | 'email_change'` y el flujo passwordless usa `type: 'email'` (línea 704, `EmailOtpType`); usar `signInWithOtp` recorre el mismo camino nativo del servidor y garantiza invalidación del código anterior (§13).

## 21 · Rate limiting

Política mínima (todos los valores derivados de defaults gotrue documentados; cualquier endurecimiento requiere justificación explícita en la orden operativa):

| Límite | Valor | Ámbito | Fuente |
|---|---|---|---|
| Reenvíos por email | 1 cada 60 s | por email | SDK `GoTrueClient.d.ts:977` + doc gotrue |
| Caducidad de OTP | 3600 s | por OTP emitido | `gotrue` `OTP_EXP` env, default 3600 |
| Intentos de verificación por OTP | 5 | por OTP emitido | `gotrue` `MFA_MAX_ATTEMPTS` semántica análoga; SPABLA hereda el default de 5 |
| Uso único | sí | por OTP emitido | comportamiento nativo `gotrue` (consumido tras primer `verifyOtp` exitoso) |
| Solicitudes por IP | hereda default gotrue (30/hora) | por IP | doc gotrue |

Cualquier ajuste (por ejemplo IP más restrictiva) requiere una decisión adicional. La orden operativa de implementación debe **imprimir los valores efectivos** desde `supabase/config.toml` o `supabase status` y no asumir defaults.

## 22 · Prevención de enumeración

- `signInWithOtp` con `shouldCreateUser: true` devuelve la misma forma para email existente y no existente: `{data:{user:null, session:null}, error:null}`. Cero información filtrada.
- La UI **no debe** mostrar mensajes tipo «esta cuenta no existe» o «esta cuenta ya está registrada». Mensajes válidos: «Si el correo es correcto, recibirás un código», «Código enviado». Nunca diferencian.
- El correo enviado por Supabase tampoco distingue alta/login: la plantilla `magic_link` es única; la orden operativa debe verificar textualmente que la plantilla no incluya cadenas como «Bienvenido a SPABLA» sólo para altas.
- Rate limit uniforme (§21) independientemente de si el email existe.

## 23 · Protección de logs y artefactos

Invariantes heredadas de `lib/v2/server/log-sanitize.ts` (Hito 9.2.5-C) y del acta Q3-E2E-R §20.6:

- Cero OTP, cero `access_token`, cero `refresh_token`, cero `Authorization`, cero email personal en logs de servidor, logs de cliente, CI, artefactos Playwright, screenshots.
- Los tests E2E harán aserciones sólo sobre presencia/ausencia de OTP y sobre transiciones de estado; nunca imprimirán el valor del código.
- El propio correo se recupera en tests locales desde Inbucket (`supabase_inbucket_spabla-hito-8-2-local` contenedor local) por API HTTP; el test parsea el HTML/text del email y extrae el código con un regex, sin almacenarlo en logs.

## 24 · Proveedor de correo y entregabilidad

| Entorno | Proveedor SMTP | Estado |
|---|---|---|
| **Local dev** | Inbucket embebido por Supabase CLI (`supabase_inbucket_<project>`) | **Disponible** (`supabase/config.toml` mantiene `[local_smtp] enabled=false` porque Supabase CLI enruta a Inbucket cuando no hay SMTP externo). |
| **CI (Job B/D)** | Inbucket embebido, idéntico a local | **Disponible** — la orden operativa de implementación debe leer los emails de Inbucket vía su HTTP API (`GET /api/v1/mailbox/<inbox>`). |
| **Producción** | **Sin proveedor definido** | **Dependencia operativa pendiente**. Registrado como bloqueante de despliegue, NO bloqueante de este contrato. |

Requisitos productivos (a resolver antes del despliegue de 9.3.2, en una unidad operativa separada — NO parte de este hito):

- Proveedor SMTP o servicio transaccional (candidatos habituales: Resend, Postmark, AWS SES, SendGrid) — decisión de Dirección en su momento.
- Dominio remitente propio (`no-reply@<dominio>.spabla`).
- SPF, DKIM, DMARC configurados y verificables por DNS.
- Política de rebotes (soft/hard bounce) y de supresión.
- Política de reintentos ante fallo transitorio.
- Observabilidad: métricas de entregabilidad, tiempo medio de llegada, tasa de bounces.
- Coste marginal por correo enviado y presupuesto mensual.
- Límites del proveedor: cuota diaria/mensual, sandbox vs producción.

El contrato NO afirma que SPABLA disponga hoy de SMTP productivo. Si el despliegue ocurre antes de esa decisión, la orden operativa lo bloqueará y elevará a Dirección.

## 25 · Accesibilidad

- Todos los inputs con `<label>` asociado (`for`/`id`) y `aria-*` apropiados; el patrón sigue `SessionArea.tsx` de 9.3.1.
- Campo OTP `<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}>` para respetar la convención Web/iOS/Android que rellena automáticamente el código desde el correo o SMS. `autoComplete="one-time-code"` es normativo (WHATWG HTML + iOS Safari + Chrome Android).
- Mensajes de estado `role="alert"` para cambios de `OtpError` / `OtpExpired`.
- Contraste ≥ WCAG AA en todos los estados; los enlaces secundarios (fallback password) mantienen un contraste ≥ 4.5:1.
- Navegación completa por teclado; sin dependencia de gestos táctiles.

## 26 · Experiencia móvil y escritorio

- Layout responsive equivalente a Q3-E2E-R (Chromium desktop + iOS Safari + Chrome Android como objetivos).
- En móviles Safari/Chrome, `autoComplete="one-time-code"` presenta al usuario el código recién recibido en el teclado sin abrir la app de correo.
- El enlace secundario «Prefiero contraseña» debe seguir siendo tocable con área mínima 44×44 px (Human Interface Guidelines).
- Cero dependencia de servicios push nativos (fuera de alcance §35).

## 27 · Observabilidad sin datos sensibles

Extensión del contrato `logSanitizedError` de 9.2.5-C:

- Métricas de negocio recomendadas (agregadas, sin PII): número de `signInWithOtp` por hora, número de `verifyOtp` exitosos, tasa de `OtpExpired`, tasa de `OtpError` por categoría.
- Métricas de operación: latencia p50/p95 de `signInWithOtp` y `verifyOtp`, ratio de rebotes reportados por el proveedor SMTP (en producción).
- Cero PII (email, IP, código, `access_token`) en ninguna traza persistida.
- El `correlationId` UUID v4 del handler (`newCorrelationId()`) sigue siendo el pivot de trazabilidad y jamás incluye datos del usuario.

## 28 · Pruebas unitarias

Coordinators/helpers nuevos requeridos (a decidir en la orden operativa):

| Módulo | Pruebas mínimas |
|---|---|
| `lib/v2/client/otp-*.ts` (si se aísla un helper) | forma de `signInWithOtp`; forma de `verifyOtp`; clasificación de errores (expirado, incorrecto, consumido, ratelimited, red); rate-limit contador cliente |
| `app/v2/chat/components/OtpForm.tsx` | render `Idle`, `OtpRequested`, `OtpError`, `OtpExpired`; deshabilitación de botones; contador de reenvío; enlace fallback |

Se prohíbe expresamente:

- Introducir mocks de la librería `@supabase/supabase-js` con comportamientos inventados.
- Reemplazar `signInWithOtp` productivo por un stub en el bundle final.

## 29 · Pruebas de integración

- Suite `lib/v2/client/**/*.test.ts` bajo `vitest.client.config.ts` (mismo runner que Q3): tests que verifican que `signInWithOtp` + `verifyOtp` orquestados por un helper adoptan la máquina de estados esperada, con SDK mockeado únicamente en la frontera del método (nunca del bundle).
- Suite HTTP-frontier: verificar que `/api/v2/bootstrap` sirve idénticamente al token generado por OTP y al generado por password. Reutilizar el patrón `app/api/v2/bootstrap/route.http.integration.test.ts` (Q3-R).
- Fixtures: crear/reutilizar usuarios con `admin.auth.admin.createUser({email, email_confirm:true})` idéntico al patrón E2E.

## 30 · Pruebas E2E

Ampliación de `e2e/auth-continuity.spec.ts` con un segundo describe **`Q3.2-E2E · Passwordless OTP email`** ejecutado por el mismo Job D:

- Fixtures: creación de usuario nuevo, usuario existente, y usuario existente con contraseña (para fallback).
- Ampliación del runner `scripts/e2e/run-auth-continuity.sh` para leer los correos de Inbucket (HTTP API sobre el contenedor `supabase_inbucket_<project>`) y extraer el OTP.
- Cero regresión sobre los 13 escenarios + anti-falso-positivo de Q3-E2E-R (§32).

## 31 · Barreras antifalsos positivos

Idéntico principio que Q3-E2E-R §CONTROL:

- **Prohibido** poner el OTP en el DOM antes de la verificación (por ejemplo debug hint) y luego "leerlo" desde el DOM en el test — el test debe leer el OTP siempre del correo entregado en Inbucket, no del DOM ni del backend.
- **Prohibido** mockear `verifyOtp` para que devuelva sesión sin haber emitido OTP real: el test debe consumir el OTP tal como llega al correo.
- **Prohibido** usar `admin.auth.admin.generateLink` como sustituto del flujo real (`generateLink` produce token pero salta el envío del correo y no ejerce el mismo camino que el usuario). Aceptable sólo como fallback documentado si Inbucket estuviera inaccesible; en ese caso el test debe fallar el escenario y marcarlo como NO EJECUTABLE.
- **Test anti-falso-positivo automático**: nuevo test que lee el propio `e2e/auth-continuity.spec.ts` y verifica que dentro del bloque `Q3.2-E2E`:
  - No aparece `admin.auth.admin.generateLink` (salvo dentro del guardián NO EJECUTABLE explícitamente etiquetado).
  - Cada `verifyOtp` es precedido por una lectura real de Inbucket.

## 32 · Regresión obligatoria de los 14 tests Q3

- Los 13 escenarios contractuales de Q2 §20 + el test anti-falso-positivo Q3-E2E-R deben permanecer **14/14 PASS** en Job D antes y después de la implementación de 9.3.2.
- Cero modificación funcional a los archivos productivos que 9.3.1 promovió:
  - `lib/v2/client/session-refresh-coordinator.ts`
  - `lib/v2/client/fetch-with-auth-retry.ts`
  - `lib/v2/client/auth-recovery-coordinator.ts`
  - `lib/v2/client/bootstrap-client.ts`
  - `lib/v2/server/composition.ts`
  - `app/api/v2/bootstrap/route.ts`
- El hook `NEXT_PUBLIC_SPABLA_E2E_HOOK` (Q3-E2E-R FASE 1) se reutiliza; NO se introduce hook nuevo.
- El fallback password (§7) usa **la misma** función `signIn` de `app/v2/chat/page.tsx:500-511`, byte-idéntica.

## 33 · Criterios de aceptación

Cerrado 9.3.2 sólo cuando **todos** los siguientes se cumplen simultáneamente:

1. Los 14 escenarios Q3-E2E-R permanecen verdes (§32).
2. Los 32 escenarios nuevos de la matriz §5 (ver §34) permanecen verdes.
3. Alta de nuevo usuario con OTP funciona en Chromium real, sin abrir el correo manualmente.
4. Login de usuario existente creado con OTP funciona en Chromium real.
5. Login de usuario existente creado con password sigue funcionando (fallback §7).
6. Respuesta del backend indistinguible entre alta y login (§22).
7. Rate limit 60s por email observado; contador visible en UI.
8. Caducidad de OTP a 3600s efectiva (verificada por manipulación de tiempo servidor local).
9. Cero OTP, tokens, emails personales o headers Authorization en cualquier log, artefacto o traza.
10. tsc + ESLint + client Vitest + engine Vitest + build + SQL/RLS suites + HTTP frontier messages + HTTP frontier bootstrap + Job D en verde.
11. CI oficial post-implementación attempt=1 · success · Jobs A/B/C/D success.
12. Acta breve de Dirección con no más de 10 pasos (patrón 9.2.4 / 9.3.1).

## 34 · GO / NO-GO

**GO**: los 12 criterios de §33 se cumplen.

**NO-GO**:

- Cualquier escenario NO EJECUTABLE, skipped o failed en Job D.
- OTP filtrado en cualquier artefacto.
- Regresión sobre los 14 escenarios Q3-E2E-R.
- Ausencia de SMTP productivo (bloqueo de despliegue, NO de cierre técnico del hito).

## 35 · Fuera de alcance

Explícitamente **no** son condición de cierre de 9.3.2 (bajo ninguna forma, incluida flags):

- OTP por SMS.
- Magic link (`{{ .ConfirmationURL }}`).
- Passkeys / WebAuthn.
- OAuth social (Google, Apple, Azure, Facebook, Kakao).
- Teléfono como identificador.
- Dispositivos vinculados / sesiones visibles / revocación individual → 9.3.3.
- Aplicaciones nativas iOS/Android → 9.3.4.
- Multicuenta → 9.3.5.
- Recuperación manual de cuentas por intervención humana o verificación documental.
- Alta de tenant / membership desde la UI (sigue en el dev seed / orden operativa separada).
- Tabla `spabla_v2.otp_challenges` u otra tabla propia de OTP: **prohibido**. La fuente autoritativa es `auth.one_time_tokens` de Supabase.
- Tabla `spabla_v2.auth_events` o `spabla_v2.devices` (candidatos de 9.3.3).

## 36 · Riesgos residuales

- **R-9.3.2-A · Entregabilidad productiva no resuelta**: sin SMTP productivo el despliegue no puede completarse. Registrado como dependencia operativa (§24). Mitigación: la orden operativa de implementación validará este ítem antes de proponer promoción.
- **R-9.3.2-B · Rate limit por email demasiado laxo/estricto**: 60s + 5 intentos son defaults gotrue. Mitigación: telemetría §27 permitirá ajustar.
- **R-9.3.2-C · Adopción baja del OTP frente al password legado**: métricas §27 informarán la decisión de retirada (§38).
- **R-9.3.2-D · Regresión sobre Q3 por refactor de `SessionArea.tsx`**: el nuevo componente `OtpForm.tsx` debe ser SUMA, no reescritura del formulario existente (§32).
- **R-9.3.2-E · Filtración de OTP en Inbucket compartido entre corridas CI**: mitigación por naming de fixtures con `<runId>` hex (patrón Q3-E2E-R).
- **R-9.3.2-F · Plantilla `magic_link` que aún incluya `{{ .ConfirmationURL }}` en producción**: la orden operativa debe verificar textualmente el template productivo antes de promover; si contiene la URL, se detiene y eleva a Dirección.
- **R-9.3.2-G · Bloqueo cross-tab del refresh Q3 (Web Locks) interfiriendo con verifyOtp concurrente**: heredado del R3 de Q2. Mitigación: §14.

## 37 · Estrategia de rollback

- **Rollback funcional**: si tras despliegue la telemetría §27 revela un problema material (por ejemplo tasa de entregabilidad < 90%, bounce > 5%), Dirección puede ordenar ocultar el formulario OTP en la UI (feature flag opcional a introducir en la orden operativa de implementación, guardado bajo `NEXT_PUBLIC_SPABLA_OTP_ENABLED` u equivalente); el fallback password permanece plenamente funcional.
- **Rollback técnico**: revertir el commit de implementación con `git revert`; la oficial vuelve a un estado equivalente a Q3-P. Cero migración destructiva permitida (§35) implica que el rollback nunca requiere restaurar datos.
- **Rollback E2E**: los 14 escenarios Q3-E2E-R siguen siendo la barrera mínima; su verde tras el rollback garantiza que la continuidad de sesión no queda comprometida.

## 38 · Unidad posterior para posible retirada de la contraseña

La retirada de `signInWithPassword` como método de login NO se planifica en 9.3.2. Cuando Dirección la ordene en un subhito posterior (candidato: **9.3.2-bis · Retirada controlada del acceso por contraseña**), la decisión deberá basarse simultáneamente en:

- Entregabilidad productiva del OTP ≥ un umbral que Dirección fijará (candidato ≥ 98%).
- Recuperación funcional demostrada con al menos un caso real de usuario que perdió acceso al buzón (procedimiento a diseñar en el propio subhito).
- Rate limiting operativo verificado sobre logs de producción.
- Observabilidad sin secretos verificada mediante inspección de artefactos CI.
- Continuidad de sesión sin regresiones durante un periodo de operación a definir por Dirección (no arbitrario por transcurso de plazo).
- Ausencia de regresiones sobre los 14 escenarios Q3-E2E-R y sobre los nuevos escenarios OTP.
- Soporte para usuarios existentes que aún usen contraseña (comunicación previa por email a esos usuarios, migración a OTP o mecanismo alternativo).
- Procedimiento de emergencia documentado (por ejemplo restauración temporal del formulario legado si la entregabilidad OTP colapsa).
- **Decisión expresa de Dirección** materializada en una orden operativa separada.

Prohibido en 9.3.2:

- Programar la retirada por fecha.
- Ocultar la contraseña detrás de un flag "coming soon".
- Reducir la visibilidad del enlace legado hasta el punto de dejarlo inaccesible.

## 39 · Archivos previsiblemente afectados

**Nuevos** (creación en la orden operativa de implementación):

- `app/v2/chat/components/OtpForm.tsx` — nuevo componente UI del formulario OTP (email → código → verify).
- `lib/v2/client/otp-*.ts` — helpers cliente (opcional; el helper puede vivir dentro de `OtpForm.tsx` si el aislamiento no aporta testabilidad adicional).
- `e2e/auth-continuity.spec.ts` — nuevo describe.serial `Q3.2-E2E · Passwordless OTP email` (32 escenarios de §5 más anti-falso-positivo específico).
- `scripts/e2e/inbucket-fetch-otp.sh` (o inline en el spec) — helper que consulta el HTTP API de Inbucket y extrae el OTP.
- `docs/e2e/MATRIX.md` — nueva sección con la matriz 32/32 (§5).
- `docs/audit_reports/AUDIT_<fecha>_hito-9-3-2-passwordless-otp.md` — acta del hito tras cierre.

**Modificados** (mínimo):

- `app/v2/chat/page.tsx` — orquestación del render OTP vs password (enlace secundario, estado `PasswordFallback`).
- `app/v2/chat/components/SessionArea.tsx` — sólo si es imprescindible aislar el formulario legado como sub-componente sin regresión.
- `supabase/templates/magic_link.html` (o equivalente) — verificar/crear plantilla que emita únicamente `{{ .Token }}`, cero `{{ .ConfirmationURL }}`.
- `supabase/config.toml` — sólo si el análisis STRIDE justifica reducir `otp_expiry` o ajustar rate limit.
- `.github/workflows/ci.yml` — sólo si el Job D necesita variables adicionales para consultar Inbucket.

**Cero cambio**:

- `lib/v2/client/session-refresh-coordinator.ts`
- `lib/v2/client/fetch-with-auth-retry.ts`
- `lib/v2/client/auth-recovery-coordinator.ts`
- `lib/v2/client/bootstrap-client.ts`
- `lib/v2/client/supabase-browser-client.ts`
- `lib/v2/server/composition.ts`
- `app/api/v2/bootstrap/route.ts`
- `app/api/v2/messages/route.ts`
- `app/api/v2/seed/route.ts`
- `supabase/migrations/*` (cero migración nueva).

## 40 · Secuencia de implementación propuesta

Cada unidad debe cerrarse antes de iniciar la siguiente. Las unidades 40.1 y 40.2 son ejecutables sin decisiones adicionales; 40.5 requiere resolución previa de §24.

1. **9.3.2-Q1 · Auditoría técnica**: verificar plantilla `magic_link` local y remota, comprobar Inbucket accesible en local y CI, medir rate limits reales via API, cerrar cualquier incompatibilidad con este contrato.
2. **9.3.2-Q2 · Contrato (este documento)**: **completado por esta orden**.
3. **9.3.2-Q3 · Implementación cliente**: `OtpForm.tsx` + integración en `page.tsx` + helpers, con matriz §5 verde localmente sobre Supabase local + Inbucket.
4. **9.3.2-Q3-E2E · Barrera automatizada**: ampliación del describe.serial en `e2e/auth-continuity.spec.ts`; Job D verde con 14 (Q3-E2E-R) + 32 (Q3.2-E2E) + 1 anti-falso-positivo nuevo.
5. **9.3.2-Q4 · Entregabilidad productiva**: resolución de §24 (proveedor SMTP + SPF/DKIM/DMARC + observabilidad) — DEPENDENCIA OPERATIVA, requiere decisión de Dirección.
6. **9.3.2-Q5 · Promoción**: fast-forward a la rama oficial siguiendo el patrón Q3-P.

Cada unidad publica en su propia rama documental/técnica: `spabla-v2/hito-9-3-2-<qN>-<descriptor>`.

---

## Anexo A · Comportamiento real de Supabase Auth verificado estáticamente (2026-08-22)

- SDK cliente: `@supabase/supabase-js@2.106.2` → `@supabase/auth-js` (fichero `node_modules/@supabase/auth-js/dist/main/GoTrueClient.d.ts`).
- `signInWithOtp` documentado en lines 950-1023.
- `verifyOtp` documentado en lines 1024-1161.
- `EmailOtpType` (line 704): `'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email' | (string & {})` — SPABLA usa **exclusivamente** `'email'`.
- `SignInWithPasswordlessCredentials` (lines 538-572): campo `email` obligatorio; `options.shouldCreateUser` opcional (default `true`); `options.emailRedirectTo` opcional (SPABLA lo omite porque no usamos magic link); `options.data` opcional (SPABLA lo omite en 9.3.2).
- Configuración Supabase local (`supabase/config.toml`): `[auth] enabled=true, jwt_expiry=3600, enable_signup=true, enable_anonymous_sign_ins=false, enable_manual_linking=false`; `[auth.email] enable_signup=true, double_confirm_changes=false, enable_confirmations=false`; `[local_smtp] enabled=false` (Inbucket embebido por Supabase CLI captura los correos).
- Contenedor Inbucket local: `supabase_inbucket_spabla-hito-8-2-local` (verificado por la traza de `supabase stop` en corridas previas Q3-E2E-R).

## Anexo B · Fuentes externas consultadas

- `https://supabase.com/docs/reference/javascript/auth-signinwithotp` — API del SDK.
- `https://supabase.com/docs/guides/auth/auth-email-templates` — plantilla `magic_link` con `{{ .Token }}` vs `{{ .ConfirmationURL }}`.
- `https://supabase.com/docs/guides/auth/rate-limits` — defaults gotrue (60s reenvío por email, cuotas por IP).
- `https://supabase.com/docs/guides/local-development/customizing-email-templates` — templates locales.
- `https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/autocomplete#one-time_code` — `autocomplete="one-time-code"` normativo (§25).

Fecha de consulta: 2026-08-22.

---

**Estado del contrato**: preparado para revisión de Dirección. Ninguna implementación autorizada por esta rama documental; la implementación requiere una orden operativa separada que respete estrictamente el alcance aquí congelado.
