# SPABLA V2 · Hito 9.3.2 — Contrato de alta y login passwordless por OTP email

**Versión**: `R2 (Hito 9.3.2-CONTRACT-R2 · 2026-08-22)`.
**Rama documental**: `spabla-v2/hito-9-3-2-passwordless-otp-contract`.
**Base oficial exacta**: `8c4b6e6346465f9aad26f174d64a8f668139ae0a` (`spabla-v2/thirteen-languages-activation`, cerrada por `HITO 9.3.1-Q3-P · AUTH CONTINUITY PROMOVIDA A OFICIAL — CERRADO`).
**Plan gobernante**: `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_PLAN.md` V1.2 §7 (secuencia 9.3.1 → 9.3.2 → 9.3.3 → 9.3.4 → 9.3.5).
**Contrato heredado**: `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_1_Q2_CONTRACT.md` + Addendum Q3-E2E.
**Actas previas**: `docs/audit_reports/AUDIT_2026-08-22_hito-9-3-1-q3-auth-continuity-implementation.md` (Q3, Q3-R, Q3-E2E, Q3-E2E-R).

**Autoridad**: este documento congela el alcance normativo del hito 9.3.2. La implementación requerirá órdenes operativas separadas (una por unidad ejecutable, §23); ninguna orden operativa podrá ampliar unilateralmente el alcance aquí definido. Cualquier discrepancia entre este documento y órdenes previas se resuelve a favor de este documento.

**Historial de versiones**:

- `R0` (commit `456b31b`): primera redacción. Retirada por errores materiales.
- `R1` (commit `6ca6509`): rectificación insuficiente; conservaba texto contradictorio y garantías de concurrencia no sostenidas por operación atómica. Retirada por Dirección.
- `R2` (este documento): rectificación integral y consolidación normativa. Reemplaza R0 y R1 en su totalidad.

---

## §1 · Identidad del hito

«Hito 9.3.2 — Alta/login passwordless por OTP email», subhito del hito 9.3 (Continuidad y autenticación), en la Fase 9 (Thirteen-Languages Activation) del roadmap SPABLA V2.

El hito se divide en dos unidades ejecutables. La división es normativa y de orden obligatorio:

- **9.3.2-A · Onboarding productivo mínimo, atómico e idempotente.**
- **9.3.2-B · Alta/login passwordless por OTP email.**

**9.3.2-A debe cerrarse y promoverse a la rama oficial antes de comenzar la implementación de 9.3.2-B.** Cada unidad publicará su propia rama, órdenes operativas, barreras y actas.

## §2 · Decisión de Dirección

Ratificada en R2 el 2026-08-22:

1. Modalidad principal de acceso: OTP de seis dígitos enviado por correo electrónico.
2. Identificador inicial: email normalizado y verificado por Supabase Auth.
3. Convivencia con `email + password`: el mecanismo actual **no se elimina** en 9.3.2. Se conserva como acceso alternativo secundario para usuarios existentes. Su retirada eventual requerirá un subhito posterior con decisión expresa de Dirección y evidencia de producción (§23.6).
4. Modalidades explícitamente excluidas (§5).
5. Un usuario nuevo debe poder usar SPABLA tras verificar el OTP. La operatividad se garantiza por 9.3.2-A antes de introducir la capa OTP.

## §3 · Problema de usuario

`Product Core §1-2` describe usuarios que quieren conversar sin fricción de idioma. Para todos ellos, `email + password` presenta dos barreras:

- Recordar o crear una contraseña incrementa el abandono en el primer acceso.
- Reintroducir la contraseña en un dispositivo nuevo rompe la continuidad tipo WhatsApp.

OTP email elimina ambos vectores manteniendo un identificador universal, sin dependencia de hardware específico (passkey), operador SMS (cobertura regional) ni proveedor OAuth (privacidad y disponibilidad).

## §4 · Alcance normativo

### §4.1 · Recorrido de usuario existente (recorrido A)

Login por OTP para un actor con `auth.users` ya creado y con al menos una `tenant_memberships.actor_id = actorId AND is_active = true`. Tras `verifyOtp`, la sesión persiste bajo la máquina de estados Q3; `GET /api/v2/bootstrap` devuelve `canOperate = true` y `selectedTenantId` no nulo; UI transita a `ContextReady` sin invocar onboarding.

### §4.2 · Recorrido de usuario nuevo (recorrido B)

Alta + login por OTP para un email no registrado previamente. Tras `verifyOtp` el actor **debe** terminar en `ContextReady` con `canOperate = true` mediante:

- `POST /api/v2/onboarding` (endpoint introducido por 9.3.2-A) que crea, en una única transacción PostgreSQL atómica y idempotente, el tenant personal del actor y su membership `owner`;
- re-invocación de `GET /api/v2/bootstrap` que refleja el contexto operativo.

`canOperate = false` **no** es resultado aceptable para un usuario nuevo dentro del alcance de 9.3.2. Si el onboarding falla, la UI muestra un estado clasificado con reintento explícito (§7).

### §4.3 · Recorrido de usuario con `email + password` preexistente

Puede usar el nuevo formulario passwordless para acceder por OTP; puede continuar accediendo con contraseña mediante el enlace secundario del formulario (§10). Ninguna operación de 9.3.2 modifica su contraseña ni fuerza migración.

## §5 · Fuera de alcance

Explícitamente **no** son condición de cierre de 9.3.2 y no pueden aparecer implementadas, ni parcialmente, ni tras flags:

- OTP por SMS.
- Magic link como mecanismo de autenticación.
- Passkeys y WebAuthn.
- Autenticación federada / OAuth social.
- Teléfono como identificador de identidad.
- Dispositivos vinculados, sesiones visibles o revocación individual (candidatos de 9.3.3).
- Aplicaciones nativas iOS/Android y almacenamiento seguro del dispositivo (candidatos de 9.3.4).
- Multicuenta (candidato de 9.3.5).
- Personalización del nombre del tenant desde la UI (§9.3).
- Reutilización de `/api/v2/seed` como onboarding productivo. `/api/v2/seed` sigue **exclusivamente** en desarrollo y pruebas autorizadas, doble-gated por `NODE_ENV=development` + `SPABLA_V2_ENABLE_DEV_SEED=1`.
- Lectura o escritura de tablas internas del schema `auth` (`auth.users`, `auth.sessions`, `auth.one_time_tokens`, `auth.identities`, `auth.refresh_tokens`) desde código productivo o desde tests.
- Cualquier tabla propia de OTP en `spabla_v2`.
- Recuperación manual de cuentas por intervención humana o verificación documental.

## §6 · Contrato con Supabase Auth · API pública única

SPABLA depende **exclusivamente** de la API pública soportada del SDK `@supabase/supabase-js`. SPABLA:

- no consulta, escribe ni presupone el esquema de tablas internas del schema `auth`;
- toma como fuente autoritativa la respuesta validada por la API pública del SDK y el JWT verificado server-side por `verifyJwt`;
- ignora nombres internos del proveedor (por ejemplo el identificador `magic_link` de la plantilla de correo) salvo como detalle no contractual documentado en §24;
- comprueba comportamientos sólo cuando están descritos por la API pública o por comportamiento observado y verificado en la versión concreta utilizada.

Una modificación interna de Supabase Auth **no** debe romper el contrato de SPABLA si mantiene la API pública documentada. Cualquier afirmación previa que dependa del esquema interno de `auth.*` queda **eliminada** por R2.

APIs públicas utilizadas por 9.3.2:

- `signInWithOtp({ email, options: { shouldCreateUser: true } })` → `AuthOtpResponse = { data: { user: null, session: null }, error: null | AuthError }`.
- `verifyOtp({ email, token, type: 'email' })` → `AuthResponse = { data: { session, user } | { session: null, user: null }, error }`.
- `onAuthStateChange((event, session) => …)` para reactividad UI heredada de Q3.
- `getSession()` heredado de Q3.

SDK verificado estáticamente: Anexo A.

## §7 · UI y máquina de estados

### §7.1 · Estados de UI

| Estado | Trigger | Elementos visibles | Elementos ocultos |
|---|---|---|---|
| `Idle` | Página cargada sin sesión y sin OTP en curso | Campo email; botón «Recibir código»; enlace secundario «¿Prefieres entrar con contraseña?» | Campo OTP; banner de éxito; banner de error |
| `OtpRequested` | `signInWithOtp` devuelve sin error | Mensaje neutral; campo OTP (6 dígitos numéricos); botón «Verificar»; enlace «Reenviar código» deshabilitado durante la ventana efectiva del proveedor | Botón «Recibir código» sustituido por «Cambiar email» |
| `OtpVerifying` | Usuario envía código | Spinner en botón «Verificar»; resto deshabilitado | — |
| `OtpError` | `verifyOtp` devuelve error clasificable (§12.4) | Mensaje neutral del tipo del error; campo re-editable; botón activo | — |
| `OtpExpired` | Backend responde código expirado | Mensaje «El código ha expirado. Pide uno nuevo»; botón «Reenviar código» activo | Campo OTP |
| `Onboarding` | Actor sin `memberships` activas tras `SessionReady` | Spinner; mensaje neutral («Preparando tu espacio…») | Formulario y chat |
| `OnboardingError` | `POST /api/v2/onboarding` devuelve error clasificable | Mensaje neutral; botón «Reintentar» (idempotente) | — |
| `SessionEstablished` | `verifyOtp` devuelve `session` no nulo | Transición natural al chat vía `ContextReady` | Todo formulario |
| `PasswordFallback` | Usuario pulsa enlace secundario | Formulario legado 9.3.1 | Formulario OTP |

### §7.2 · Máquina de estados

Extensión estricta de Q3-R §5-§9. Cero rama nueva en `session-refresh-coordinator.ts`, `fetch-with-auth-retry.ts`, `auth-recovery-coordinator.ts`, `bootstrap-client.ts` (§11).

```
                 ┌────────────────────────────────────────────────────┐
                 │                                                    │
                 ▼                                                    │
        [SessionMissing] ──email→ [OtpRequested] ──expired→ [OtpExpired]
                 ▲                    │                                │
                 │                    ▼                                │
                 │             [OtpVerifying] ──error→ [OtpError] ─────┘
                 │                    │
                 │                    ▼
                 │             [SessionReady]
                 │                    │
                 │        ┌───────────┴───────────┐
                 │        ▼                       ▼
                 │  sin memberships           con memberships
                 │        │                       │
                 │        ▼                       │
                 │  [Onboarding] ──error→ [OnboardingError]
                 │        │                       │
                 │        ▼                       │
                 └── [ContextReady] ◄─────────────┘
```

## §8 · Integración con bootstrap y con la continuidad Q3

- `GET /api/v2/bootstrap` recibe `Authorization: Bearer <access_token>` idéntico al de `signInWithPassword`. El servidor **no distingue** el origen del token (§13).
- `verifyJwt` (`lib/v2/server/composition.ts`) sigue siendo la única validación de identidad por request (Q3-R §FASE 4).
- Ninguna modificación de `/api/v2/bootstrap`, `/api/v2/messages` ni `/api/v2/seed` dentro del alcance de 9.3.2.
- El hook `NEXT_PUBLIC_SPABLA_E2E_HOOK` (Q3-E2E-R FASE 1) se reutiliza; no se introduce hook nuevo (§11).

Nueva ruta introducida por 9.3.2-A: `POST /api/v2/onboarding` (§9).

## §9 · Onboarding productivo (9.3.2-A) · diseño atómico

### §9.1 · Endpoint HTTP

`POST /api/v2/onboarding` — autenticado, POST-only (GET/PUT/PATCH/DELETE/HEAD responden 404 opaco, patrón hito 9.2.5-C).

- `Authorization: Bearer <access_token>` obligatorio; el server extrae el `actorId` exclusivamente del JWT verificado por `verifyJwt`.
- Body **vacío o `{}`**. El cliente **no** envía `tenantId`, `role`, `ownerId`, `email` ni ningún campo controlado por el usuario. El server deriva todo del JWT.
- Respuesta 200 con `{ tenantId: string, role: "owner" }`. Cero body con `service_role`, cero credenciales, cero email.
- Alfabeto de errores: 401 `unauthorized`, 500 `internal`, 503 `unavailable`, 404 `not_found` para verbos no permitidos. Correlation-id UUID v4 presente en todas las respuestas.

### §9.2 · Requisitos de atomicidad e idempotencia

R2 rechaza como garantía suficiente cualquier combinación de:

- Locks del cliente o Web Locks del navegador.
- `SELECT … FOR UPDATE` sobre una fila que puede no existir (no bloquea la ausencia).
- Comprobación previa en JavaScript seguida de dos llamadas separadas a `admin_create_tenant` y `admin_add_membership`.
- Idempotency key controlada por el cliente.

El contrato exige una única función/RPC server-side ejecutada dentro de una transacción PostgreSQL única. La función debe garantizar por propiedad de base de datos que dos ejecuciones concurrentes para el mismo `actorId` no puedan crear dos tenants personales.

### §9.3 · Mecanismos candidatos aceptables

La orden operativa 9.3.2-A-Q1 seleccionará **uno** de los mecanismos siguientes, tras auditar el esquema real y proponer, si aplica, la migración mínima necesaria:

- **A · Restricción `UNIQUE` sobre un registro de onboarding por actor.** Nueva tabla mínima o extensión de una existente que exponga `actor_id UNIQUE`. Cualquier ejecución concurrente entra en el `INSERT` y una y sólo una gana; la perdedora recibe el error de duplicidad y la función devuelve el registro existente.
- **B · Advisory transaction lock determinista por actor.** `pg_advisory_xact_lock(hashtextextended(actor_id::text, N))` al inicio de la transacción; segunda comprobación (double-check) dentro del mismo lock; creación y membership condicional a la ausencia. El lock libera al terminar la transacción; garantiza serialización por actor sin fila previa.
- **C · Registro de onboarding con `actor_id UNIQUE`.** Variante especializada de A: una nueva tabla `spabla_v2.actor_onboarding(actor_id UUID PRIMARY KEY, tenant_id UUID NOT NULL, created_at TIMESTAMPTZ)` referenciada por FK a `tenant_memberships`. Al insertar duplicado el `PRIMARY KEY` rechaza la segunda ejecución.
- **D · Garantía equivalente demostrable.** Cualquier propiedad PostgreSQL que 9.3.2-A-Q1 documente y demuestre ejerciendo carga concurrente sobre un entorno controlado.

Mecanismos **rechazados** por R2 (no aptos como garantía única):

- Locks del cliente, Web Locks, mutex JavaScript.
- `SELECT … FOR UPDATE` sobre `tenant_memberships` con `actor_id = X` cuando la fila no existe todavía.
- Comprobación previa sin restricción declarativa.
- Idempotency key controlada únicamente por el cliente.

La selección definitiva entre A, B, C o D se cierra en el contrato específico 9.3.2-A tras inspeccionar `supabase/migrations/*`, las funciones `admin_*` existentes y la política multitenant (§9.4).

### §9.4 · Semántica del tenant personal

R2 no asume equivalencias no demostradas. El contrato específico 9.3.2-A resolverá inequívocamente, antes de implementar:

1. Qué representa el tenant creado automáticamente por el onboarding (definido aquí como «tenant personal del actor»).
2. Cómo se distingue estructuralmente de un tenant empresarial o compartido (por ejemplo columna `kind` o `owner_actor_id` en `spabla_v2.tenants`).
3. Qué ocurre si el actor ya pertenece a otro tenant creado externamente (por ejemplo invitación previa).
4. Si la pertenencia a cualquier tenant impide crear el personal, o si el personal es independiente.
5. Si puede existir exactamente un tenant personal por actor.
6. Qué restricción de base de datos garantiza esa cardinalidad (variante del mecanismo elegido en §9.3).
7. Qué sucede si el actor abandona o desactiva su membership personal.
8. Qué sucede si el onboarding se repite después de una limpieza.
9. Qué devuelve `GET /api/v2/bootstrap` para cada caso.

Hasta que 9.3.2-A cierre estas nueve preguntas, R2 registra la carencia y **prohíbe** la implementación de 9.3.2-B.

### §9.5 · Política del nombre del tenant

Nombre por defecto: cadena neutra localizada («Mi espacio» en español; equivalentes en las demás lenguas activas). El nombre visible **no** se deriva de la parte local del email ni de otro identificador con potencial PII. La unicidad del tenant se garantiza por identificador técnico (UUID + mecanismo §9.3), no por el nombre.

La personalización posterior del nombre por parte del usuario queda fuera del alcance de 9.3.2 salvo que exista ya un flujo autorizado.

El onboarding **no** persiste ni replica el email en `spabla_v2`. El email vive exclusivamente en `auth.users` gestionado por Supabase.

### §9.6 · Comportamiento del cliente frente al onboarding

- El cliente detecta `canOperate === false && memberships.length === 0` tras `SessionReady + bootstrap` e invoca `POST /api/v2/onboarding` mediante `fetchWithAuthRetry` (patrón Q3-R).
- Tras 200 el cliente re-invoca `GET /api/v2/bootstrap` una única vez. Si el segundo bootstrap vuelve a devolver `canOperate === false`, transita a `OnboardingError` (§7).
- El cliente **no** invoca onboarding si `memberships.length > 0`.
- El cliente **no** puede enviar `tenantId`, `role`, `ownerId` ni email en el body.

## §10 · Compatibilidad con `email + password`

- El formulario passwordless es la vía principal presentada en `/v2/chat` sin sesión.
- Un enlace secundario, sin destaque visual, «¿Prefieres entrar con contraseña?» despliega el formulario legado (`SessionArea.tsx` intacto).
- Cero cambio funcional a la función `signIn` de `app/v2/chat/page.tsx:500-511` heredada de 9.3.1.
- Su retirada eventual (§23.6) exige subhito posterior con decisión expresa; **queda prohibido** programarla por fecha o esconder el enlace legado.

## §11 · Continuidad y regresión Q3

Los 14 escenarios de la barrera Q3-E2E-R (13 contractuales + anti-falso-positivo) deben permanecer verdes en Job D antes y después de la implementación de cada unidad de 9.3.2. Cero modificación funcional a:

- `lib/v2/client/session-refresh-coordinator.ts`
- `lib/v2/client/fetch-with-auth-retry.ts`
- `lib/v2/client/auth-recovery-coordinator.ts`
- `lib/v2/client/bootstrap-client.ts`
- `lib/v2/client/supabase-browser-client.ts` (más allá del hook `NEXT_PUBLIC_SPABLA_E2E_HOOK` ya introducido por Q3-E2E-R)
- `lib/v2/server/composition.ts`
- `app/api/v2/bootstrap/route.ts`
- `app/api/v2/messages/route.ts`

`Q2 §20-2` (recarga con sesión activa) y `Q2 §20-6` (kill+restart real de Next) no cambian. Recarga o reinicio durante `Onboarding` sin tenant creado se recupera por la idempotencia server-side (§9.2).

## §12 · Seguridad de OTP · consolidado

Ninguno de los valores siguientes se presenta como garantía contractual únicamente por ser default del proveedor. Los valores efectivos se cierran en el contrato específico 9.3.2-B tras verificación empírica sobre las versiones concretas de GoTrue local y del entorno gestionado previsto.

### §12.1 · Caducidad

- Preferencia de Dirección: duración corta dentro de un rango razonable.
- Valor exacto pendiente de verificar la capacidad real de configuración (`GOTRUE_OTP_EXP` u opción equivalente expuesta por el proveedor) y de medir el impacto en la experiencia del usuario.
- El contrato específico 9.3.2-B cierra el valor antes de implementar.
- La prueba de caducidad no bloquea el CI normal esperando el intervalo productivo. La prueba puede ejecutarse en:
  - un entorno de test con `otp_expiry` deliberadamente corto (por ejemplo 60 s) y verificado por lectura de configuración pública;
  - o una prueba de integración controlada equivalente que use exclusivamente la API pública para observar el rechazo del código expirado;
  - sin manipular tablas internas del schema `auth`;
  - sin modificar el reloj global de forma insegura.
- Una prueba adicional debe verificar estáticamente que la configuración productiva prevista aplica el valor propuesto.

### §12.2 · Reenvío

- El comentario JSDoc del SDK menciona una ventana mínima entre solicitudes (Anexo A). Es comentario, no garantía normativa del cliente. La semántica exacta (por email, por proyecto, por IP, por endpoint) se aplica server-side y varía por versión y plan.
- Política SPABLA en R2: reenvío mínimo por email visible en la UI con contador deshabilitando el botón hasta que el proveedor lo permita; el valor efectivo se lee del proveedor y se registra en el acta 9.3.2-B-Q1.
- Prohibido asumir que el límite es exclusivamente por email; puede ser también por IP o por proyecto.

### §12.3 · Intentos incorrectos

- **Carencia declarada**: SPABLA no dispone de evidencia oficial de un límite server-side específico para intentos incorrectos de `verifyOtp` con `type: 'email'`. `GOTRUE_MFA_MAX_ATTEMPTS` gobierna flujos MFA y **no puede** utilizarse como evidencia para OTP email.
- El único contador previsto es UI (frontend). Este contador:
  - es exclusivamente UX;
  - es reiniciable por el usuario (recarga, pestaña nueva);
  - es manipulable;
  - **no puede computarse como control anti-fuerza-bruta**;
  - debe etiquetarse explícitamente como «UX solamente» en el código y en los comentarios.
- Si el análisis de amenazas de 9.3.2-B-Q1 concluye que se necesita una barrera server-side adicional, se documentará como decisión técnica explícita de 9.3.2-B; queda prohibido asumirla como disponible.

### §12.4 · Errores del código

Clasificación de estados UI derivados de la respuesta del proveedor:

| Categoría de error observada por el cliente | Estado UI | Mensaje neutral | Acción del usuario |
|---|---|---|---|
| Código no coincide | `OtpError` | «Código incorrecto» | Reintentar |
| Código expirado (§12.1) | `OtpExpired` | «El código ha expirado. Pide uno nuevo» | Reenviar |
| Código ya consumido | `OtpError` | «Este código ya se usó. Pide uno nuevo» | Reenviar |
| Rate limit del servidor excedido | `OtpError` bloqueante | «Vuelve a solicitar un código dentro de un momento» | Reenviar tras la ventana efectiva §12.2 |
| Error transitorio de red o proveedor | `OtpError` transitorio | «No hemos podido validar el código, inténtalo en unos segundos» | Reintentar |

Cero mensaje revela existencia del email (§13).

### §12.5 · Rate limit

Diferenciar en el contrato específico 9.3.2-B:

- **Límite configurado**: valor establecido por SPABLA en su proyecto y en su config local.
- **Límite observado**: valor efectivamente aplicado por el proveedor tras petición real, medido por 9.3.2-B-Q1.
- **Garantía contractual mínima**: el valor que SPABLA se compromete a mantener disponible en la experiencia; siempre inferior o igual al observado.
- **Control adicional de SPABLA**: cualquier capa introducida por SPABLA (por ejemplo middleware Edge en Next.js). Ninguna en 9.3.2 sin autorización expresa.
- **Variación por plan o proveedor**: registro explícito de que un cambio de plan o de proveedor Auth puede modificar el límite observado; requiere re-medición.

### §12.6 · Comportamiento del código anterior tras reenvío

- R2 no afirma sin evidencia que cada nuevo `signInWithOtp` invalide el código anterior.
- Comportamiento actual **por observar** en 9.3.2-B-Q1 sobre la versión local y sobre el entorno gestionado previsto.
- Hasta que se verifique, se clasifica como «comportamiento observado» y no se construye seguridad crítica sobre esta inferencia. La UI puede tolerar ambos comportamientos (código anterior sigue válido, o queda invalidado).

## §13 · Prevención de enumeración

Requisitos comprobables:

- Misma clase de respuesta pública del backend para email existente y no existente (`AuthOtpResponse` con `data: { user: null, session: null }, error: null`).
- Mensajes visibles neutrales; ausencia de ramas del cliente que muestren texto distinto para «existente» y «no existente».
- Misma política de rate limiting aplicada a ambos casos.
- Ninguna consulta expuesta al cliente que permita comprobar existencia (por ejemplo endpoint `check-email`).
- `shouldCreateUser` fijado en `true` para todo el flujo passwordless en el bundle final. Un test estático (§18) verifica que no aparece `shouldCreateUser: false` en el código productivo.
- Medición de latencias como señal diagnóstica exclusivamente:
  - se toman muestras suficientes por caso;
  - se reporta el resultado (media, p50, p95, p99) en el acta;
  - **no** se establece un umbral rígido que prometa indistinguibilidad temporal perfecta;
  - la tolerancia razonable se determina tras las muestras y se justifica estadísticamente;
  - cualquier diferencia significativa se documenta como riesgo residual;
  - **prohibido** introducir retrasos artificiales que pudiesen facilitar timing attacks contra otros mecanismos.

## §14 · Protección del OTP en tests

### §14.1 · Manejo del valor del OTP

- El valor del OTP existe exclusivamente en la memoria del proceso de prueba durante el escenario que lo consume.
- **Nunca** se imprime, ni siquiera en logs privados.
- **Nunca** se incluye en el nombre de un test, en un `annotation`, en un `test.step`, ni en un mensaje de error.
- **Nunca** se persiste en disco.
- **Nunca** se guarda su hash SHA-256 simple: un OTP numérico de seis dígitos tiene un espacio máximo de 10⁶ combinaciones; un hash sin secreto es invertible por fuerza bruta trivial. Prohibido usar SHA-256 desnudo del OTP como evidencia.
- Se libera la referencia al terminar el escenario, cuando sea practicable.

### §14.2 · Configuración de Playwright por defecto para escenarios OTP

- `trace: 'off'`.
- `video: 'off'`.
- `screenshot: 'off'`.
- Reporter `list` únicamente. Sin HTML report, sin blob report.

Si un escenario requiere evidencia visual, la captura se produce **después** de haber borrado el campo OTP y sin conservar el valor. Aun así, R2 **no** confía sólo en «borrar el campo antes del screenshot»: una excepción no controlada puede disparar un screenshot automático antes del borrado. Por ese motivo, para todos los escenarios que introducen el OTP en el DOM se mantiene `screenshot: 'off'` por defecto; los escenarios que necesitan evidencia visual se rediseñan para separar la captura del momento en que el OTP está en el DOM.

### §14.3 · Buzones e identidades por escenario

- Buzón Inbucket aislado por identificador único de la ejecución (`<runId>` hex).
- Email fixture único por escenario, con dominio `@spabla.test`.
- Consulta al buzón restringida al mensaje esperado del escenario.
- Extracción del código en memoria; parsing determinista.
- Eliminación o invalidación del buzón al terminar; limpieza incluso ante fallo.

### §14.4 · Prueba antifiltración de artefactos

- El runner conoce temporalmente el valor real del OTP y del email fixture en memoria.
- Tras generar los artefactos del escenario y **antes** de descartar el valor de memoria, el runner busca coincidencias exactas del OTP y del email fixture en:
  - `test-results/`
  - `playwright-report/`
  - `blob-report/`
  - `.playwright/` (aunque se prevea vacío por config)
- El runner busca también patrones inequívocos de tokens (`access_token`, `refresh_token`, cabecera `Authorization: Bearer`) por cadenas literales.
- El runner **no imprime** el valor buscado cuando detecta una coincidencia; reporta únicamente:
  - tipo de secreto (OTP fixture, email fixture, `access_token`, `refresh_token`, `Authorization`);
  - archivo y ruta relativa;
  - localización redactada (por ejemplo `bytes 1234-1240` u `en el atributo alt de la imagen X`).
- **Prohibido** usar una expresión genérica de seis dígitos consecutivos sobre todos los artefactos: produciría falsos positivos con timestamps, puertos, IDs, fechas y contadores.
- Cualquier coincidencia hace fallar la corrida global aunque los tests hayan pasado.

### §14.5 · Otras protecciones

- Aserciones sobre el OTP se realizan comparando el valor extraído del buzón contra el valor tecleado por Playwright antes de introducirlo en el DOM, ambos vivos exclusivamente en el proceso de prueba.
- Prohibido `admin.auth.admin.generateLink` como sustituto del flujo real. Aceptable sólo como fallback etiquetado NO EJECUTABLE si Inbucket estuviera inaccesible.
- Prohibido leer el propio valor del campo OTP del DOM en las aserciones (por ejemplo `page.locator('#spabla-otp-code').inputValue()`).

## §15 · Proveedor de correo y entregabilidad

| Entorno | Proveedor | Estado |
|---|---|---|
| Desarrollo local | Inbucket embebido por Supabase CLI (`supabase_inbucket_<project>`) | Disponible. `[local_smtp] enabled=false` en `supabase/config.toml` no impide Inbucket. |
| CI (Jobs B y D) | Inbucket embebido idéntico al local | Disponible. La orden operativa 9.3.2-B leerá los correos por HTTP con las protecciones §14. |
| Producción | Sin proveedor definido | Dependencia operativa pendiente. Bloquea GO producción (§19), **no** bloquea GO promoción técnica. |

Requisitos productivos (dependencia operativa separada, no cierre técnico del hito):

- Proveedor SMTP o servicio transaccional. Candidatos habituales: Resend, Postmark, AWS SES, SendGrid. Decisión posterior de Dirección.
- Dominio remitente propio; SPF, DKIM y DMARC verificables por DNS.
- Política de rebotes (soft/hard) y de supresión.
- Política de reintentos ante fallo transitorio.
- Observabilidad: métricas de entregabilidad, tiempo medio de llegada, tasa de bounces.
- Coste marginal y presupuesto mensual.
- Límites del proveedor (cuota diaria/mensual, sandbox vs producción).

R2 **no** afirma que SPABLA disponga hoy de SMTP productivo.

## §16 · Accesibilidad y experiencia móvil

- Inputs con `<label for>` asociado y `aria-*` apropiados.
- Campo OTP: `<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}>` (WHATWG HTML + iOS Safari + Chrome Android).
- Cambios de estado (`OtpError`, `OtpExpired`, `OnboardingError`) anunciados con `role="alert"`.
- Contraste ≥ WCAG AA en todos los estados; enlaces secundarios ≥ 4.5:1.
- Navegación completa por teclado; sin dependencia de gestos táctiles.
- Área táctil del enlace secundario «Prefiero contraseña» ≥ 44 × 44 px.
- Cero dependencia de servicios push nativos.

## §17 · Observabilidad sin datos sensibles

Extensión de `lib/v2/server/log-sanitize.ts` heredado de 9.2.5-C:

- Métricas de negocio agregadas y sin PII: número de `signInWithOtp` por hora, número de `verifyOtp` exitosos, tasa de `OtpExpired`, tasa de `OtpError` por categoría, número de `POST /api/v2/onboarding` exitoso, idempotente y fallido.
- Métricas de operación: latencias p50/p95 de `signInWithOtp`, `verifyOtp`, `POST /api/v2/onboarding`. Tasa de bounces del proveedor SMTP en producción.
- Cero PII en trazas persistidas.
- `correlationId` UUID v4 sigue siendo el pivot de trazabilidad.

## §18 · Pruebas y matriz consolidada

### §18.1 · Pruebas unitarias

| Módulo | Cobertura mínima |
|---|---|
| Componente `OtpForm` (9.3.2-B) | Render de cada estado UI (§7.1); deshabilitación de botones; contador de reenvío como UX; enlace fallback. |
| Composer `onboarding` server-side (9.3.2-A) | `verifyJwt` → `actorId`; idempotencia real por el mecanismo §9.3; rechazo de campos enviados por el cliente (§9.1); errores clasificados ante fallo de DB; ausencia de `service_role` en la respuesta. |
| Route `app/api/v2/onboarding/route.ts` (9.3.2-A) | 401 sin auth; 401 con JWT inválido; 200 idempotente; 500 sanitizado; 503 transient; 404 para verbos no permitidos. |

Prohibido:

- Mocks del SDK `@supabase/supabase-js` con comportamientos inventados.
- Reemplazar `signInWithOtp` productivo por un stub en el bundle final.

### §18.2 · Pruebas de integración

- Direct-handler test de `app/api/v2/onboarding/route.ts` con `verifyJwt` real y mecanismo §9.3 real contra Supabase local.
- HTTP-frontier test `app/api/v2/onboarding/route.http.integration.test.ts` que valida 200 idempotente contra Supabase local real, patrón heredado de `app/api/v2/bootstrap/route.http.integration.test.ts`.
- HTTP-frontier `/api/v2/bootstrap` sigue siendo la evidencia de que el JWT generado por OTP y por password son intercambiables.

### §18.3 · Pruebas E2E

Ampliación de `e2e/auth-continuity.spec.ts` con un nuevo describe `Q3.2-E2E · Passwordless OTP email` ejecutado por el mismo Job D. Cubre los recorridos A (usuario existente) y B (usuario nuevo con onboarding).

### §18.4 · Matriz mínima (única)

Cada escenario define: precondición, acción, resultado esperado, evidencia sanitizada, limpieza, riesgo cubierto.

| # | Escenario | Riesgo cubierto |
|---|---|---|
| 1 | Recorrido A · usuario existente termina operativo | Login funcional |
| 2 | Recorrido B · usuario nuevo termina operativo tras onboarding | §4.2 |
| 3 | Cero uso de `/api/v2/seed` en cualquiera de los recorridos productivos | §5 |
| 4 | Provisioning idempotente: dos llamadas al onboarding devuelven mismo `tenantId` | §9.2 |
| 5 | Dos verificaciones concurrentes del onboarding para el mismo actor no duplican recursos | §9.2, §9.3 |
| 6 | Fallo entre `verifyOtp` y `POST /api/v2/onboarding` es recuperable por reintento | §7 |
| 7 | Recarga entre `verifyOtp` y `POST /api/v2/onboarding` es recuperable | §11 |
| 8 | Cliente que intenta enviar `tenantId`/`role`/`ownerId` en el body es rechazado sin efecto | §9.1 |
| 9 | Bootstrap devuelve contexto correcto tras onboarding | §8 |
| 10 | `canOperate` coincide con la experiencia real del usuario | §4.2 |
| 11 | Reenvío de OTP respeta el límite configurado por el proveedor | §12.2 |
| 12 | Caducidad efectiva coincide con la configuración | §12.1 |
| 13 | Intentos incorrectos: comportamiento observado documentado como carencia (§12.3) | §12.3 |
| 14 | Rate limit por IP: comportamiento observado documentado y medido | §12.5 |
| 15 | OTP incorrecto → `OtpError` | §12.4 |
| 16 | OTP vencido → `OtpExpired` | §12.4 |
| 17 | OTP reutilizado → `OtpError` | §12.4 |
| 18 | Comportamiento del código anterior tras reenvío (§12.6) verificado y clasificado | §12.6 |
| 19 | Cero enumeración observable dentro de la barrera definida (§13) | §13 |
| 20 | Cero OTP fixture literal en logs | §14 |
| 21 | Cero OTP fixture literal en traces | §14 |
| 22 | Cero OTP fixture literal en screenshots | §14 |
| 23 | Cero OTP fixture literal en videos | §14 |
| 24 | Cero OTP fixture literal en HTML report | §14 |
| 25 | Cero OTP fixture literal en artefactos CI | §14 |
| 26 | Los 14 escenarios de Q3-E2E-R permanecen verdes | §11 |
| 27 | Cero llamadas a OpenAI durante las pruebas del hito | Reproducibilidad y coste |

## §19 · GO / NO-GO escalonado

- **GO desarrollo local**: escenarios de §18 verdes contra Supabase local, sin SMTP productivo.
- **GO CI** (Jobs A/B/C/D): §18 verdes en `ubuntu-latest` con Supabase local + Inbucket, sin SMTP productivo. Barrera técnica para merge a la rama Q4.
- **GO promoción técnica** (fast-forward a `spabla-v2/thirteen-languages-activation`): GO CI + acta breve. Puede promocionarse sin SMTP productivo.
- **GO despliegue productivo**: GO promoción técnica + §15 resuelta + medición empírica de §12 sobre el entorno gestionado previsto. Un CI verde **no** implica automáticamente GO producción.

NO-GO en cualquier escalón si:

- cualquier escenario NO EJECUTABLE, skipped o failed en Job D;
- filtración de OTP, email fixture o token detectada por §14.4;
- regresión sobre los 14 escenarios de Q3-E2E-R;
- ausencia de resolución del escalón inmediatamente inferior.

## §20 · Riesgos residuales

- **R-A** · Entregabilidad productiva no resuelta. Bloquea GO producción, no GO promoción. Mitigación: §15 y §19.
- **R-B** · Valores concretos de caducidad y reenvío pendientes. Mitigación: 9.3.2-B-Q1 los cierra tras medición empírica sobre el entorno gestionado previsto.
- **R-C** · Baja adopción del OTP frente al password legado. Mitigación: métricas §17 informarán §23.6.
- **R-D** · Regresión sobre Q3 por refactor de `SessionArea.tsx`. Mitigación: componente `OtpForm` es suma, no reescritura.
- **R-E** · Filtración de OTP en Inbucket compartido entre corridas CI. Mitigación: §14.3 y §14.4.
- **R-F** · Correo entregado con enlace de autenticación funcional. Mitigación: 9.3.2-B-Q1 inspecciona el **contenido efectivo** del correo entregado a Inbucket, no el nombre del archivo o plantilla.
- **R-G** · Bloqueo cross-tab del refresh Q3 interfiriendo con `verifyOtp` concurrente. Mitigación: §11.
- **R-H** · Nuevo endpoint autenticado con `service_role` server-side. Mitigación: aislar en `lib/v2/server/onboarding.ts`; nunca exponer al cliente; test §18.1 verifica que el cliente no puede autoasignarse tenant/rol.
- **R-I** · Enumeración por diferencias de latencia. Mitigación: §13 exige tratamiento estadístico como diagnóstico, sin retrasos artificiales inseguros.
- **R-J** · Carencia de límite server-side de intentos incorrectos por OTP email (§12.3). Aceptado como riesgo residual documentado; mitigación por composición (uso único + expiración + reenvío) y por decisión posterior si el análisis de amenazas lo exige.
- **R-K** · Ausencia de garantía contractual sobre rate limit por IP en el entorno gestionado (§12.5). Aceptado como riesgo residual documentado hasta la medición de 9.3.2-B-Q1.
- **R-L** · Semántica del tenant personal no cerrada hasta 9.3.2-A. Aceptado como pendiente; **prohibida** la implementación de 9.3.2-B mientras exista.

## §21 · Estrategia de rollback

- **Rollback funcional**: feature flag opcional que oculta el formulario OTP y mantiene el fallback password plenamente funcional (por ejemplo `NEXT_PUBLIC_SPABLA_OTP_ENABLED`), introducido por la orden operativa correspondiente. Dirección puede ordenar activarlo si la telemetría §17 revela un problema material (por ejemplo entregabilidad < 90% o bounce > 5%).
- **Rollback técnico**: `git revert` sobre el commit de implementación; la oficial vuelve a un estado equivalente al de la promoción inmediatamente anterior. §5 prohíbe migraciones destructivas; el rollback nunca requiere restaurar datos.
- **Rollback E2E**: los 14 escenarios de Q3-E2E-R son la barrera mínima que debe permanecer verde tras el rollback.

## §22 · Archivos previsiblemente afectados

**Nuevos** (creación en las órdenes operativas correspondientes):

- 9.3.2-A:
  - `app/api/v2/onboarding/route.ts`
  - `app/api/v2/onboarding/route.handler.test.ts`
  - `app/api/v2/onboarding/route.http.integration.test.ts`
  - `lib/v2/server/onboarding.ts`
  - `lib/v2/server/onboarding.test.ts`
  - Migración mínima si el mecanismo §9.3 seleccionado la requiere.
- 9.3.2-B:
  - `app/v2/chat/components/OtpForm.tsx`
  - Helpers cliente pequeños si aportan testabilidad (aislado en `lib/v2/client/otp-*.ts`).
  - `e2e/auth-continuity.spec.ts` ampliado con describe `Q3.2-E2E · Passwordless OTP email`.
  - Ampliación de `scripts/e2e/run-auth-continuity.sh` para consulta de Inbucket con las protecciones §14.
  - `docs/e2e/MATRIX.md` ampliado con la matriz §18.4.
  - `docs/audit_reports/AUDIT_<fecha>_hito-9-3-2-*.md` para cada unidad.

**Modificados** (mínimo):

- `app/v2/chat/page.tsx` — orquestación del render OTP vs password + invocación de `POST /api/v2/onboarding` cuando el bootstrap indica ausencia de memberships.
- `supabase/templates/*.html` — verificación del contenido efectivo del correo (que muestre únicamente el código OTP y no un enlace de autenticación funcional).
- `supabase/config.toml` — sólo si el análisis §12 justifica ajustar `otp_expiry` u otros límites.
- `.github/workflows/ci.yml` — sólo si Job D necesita variables adicionales para consultar Inbucket.

**Cero cambio productivo** (§11):

- `lib/v2/client/session-refresh-coordinator.ts`, `fetch-with-auth-retry.ts`, `auth-recovery-coordinator.ts`, `bootstrap-client.ts`, `supabase-browser-client.ts`.
- `lib/v2/server/composition.ts`.
- `app/api/v2/bootstrap/route.ts`, `app/api/v2/messages/route.ts`, `app/api/v2/seed/route.ts`.

## §23 · Secuencia de implementación

### §23.1 · 9.3.2-A · Onboarding productivo mínimo, atómico e idempotente

Prerrequisito obligatorio de 9.3.2-B. Publica en `spabla-v2/hito-9-3-2-a-onboarding-*`.

- **9.3.2-A-Q1 · Verificación técnica y contrato específico**. Inspecciona el esquema real de `spabla_v2.tenants` y `spabla_v2.tenant_memberships`; funciones `admin_*` existentes; semántica multitenant; forma segura de serializar por actor; posible necesidad de migración (mecanismo §9.3); rollback; barreras de concurrencia. Redacta el contrato específico que cierra §9.3 y §9.4.
- **9.3.2-A-Q2 · Implementación server-side**: `route.ts` + `lib/v2/server/onboarding.ts` + tests unit/integration/HTTP-frontier.
- **9.3.2-A-Q3 · Barrera E2E ampliada**: nuevo escenario en `e2e/auth-continuity.spec.ts` que invoca `POST /api/v2/onboarding` para un usuario con password sin membership; verifica idempotencia; verifica 14/14 Q3-E2E-R.
- **9.3.2-A-Q4 · Promoción**: fast-forward a `spabla-v2/thirteen-languages-activation` siguiendo el patrón Q3-P.

### §23.2 · 9.3.2-B · Alta/login passwordless por OTP email

Sólo puede iniciarse tras la promoción de 9.3.2-A. Publica en `spabla-v2/hito-9-3-2-b-otp-*`.

- **9.3.2-B-Q1 · Verificación técnica y cierre de valores de seguridad**. Verifica plantilla local y remota (contenido efectivo); mide empíricamente §12 sobre GoTrue local y sobre el entorno gestionado previsto; cierra caducidad, reenvío y clasificación del código anterior tras reenvío; documenta rate limit por IP.
- **9.3.2-B-Q2 · Implementación cliente**: `OtpForm` + integración en `page.tsx` con la orquestación de onboarding heredada de 9.3.2-A.
- **9.3.2-B-Q3 · Barrera E2E**: describe.serial ampliado con recorridos A y B; anti-falso-positivo específico; anti-filtración §14.4.
- **9.3.2-B-Q4 · Promoción**: fast-forward a la rama oficial.

### §23.3 · Dependencias operativas separadas

- **9.3.2-Ops-A · Entregabilidad productiva**: resolución de §15. Decisión de Dirección + orden operativa separada. **Bloquea GO producción**, no GO promoción.

### §23.4 · Recomendación de próxima orden

**Iniciar por 9.3.2-A-Q1 · Verificación técnica y contrato específico del onboarding productivo atómico.**

La siguiente orden inspecciona: esquema real de tenants y memberships; restricciones actuales; funciones admin existentes; semántica multitenant; forma segura de serializar por actor; posible necesidad de migración; rollback; barreras de concurrencia.

Esta orden **no autoriza** la implementación. Cierra §9.3 y §9.4; abre entonces la orden 9.3.2-A-Q2.

### §23.5 · Unidad posterior fuera de 9.3.2

- **9.3.3** · Dispositivos vinculados, sesiones visibles y revocación (per §7 del plan gobernante).

### §23.6 · Unidad posterior para posible retirada de contraseña

La retirada de `signInWithPassword` como método de login **no** se planifica en 9.3.2. Cuando Dirección la ordene, deberá basarse simultáneamente en:

- entregabilidad productiva del OTP ≥ umbral fijado por Dirección;
- recuperación funcional demostrada con caso real (procedimiento a diseñar en el subhito);
- rate limiting operativo verificado sobre logs de producción;
- observabilidad sin secretos verificada mediante inspección de artefactos CI;
- continuidad de sesión sin regresiones durante periodo definido por Dirección (no arbitrario por transcurso de plazo);
- ausencia de regresiones sobre los 14 escenarios Q3-E2E-R y sobre los escenarios OTP;
- soporte para usuarios existentes con contraseña (comunicación previa por email);
- procedimiento de emergencia documentado;
- decisión expresa de Dirección materializada en una orden operativa separada.

Prohibido en 9.3.2:

- programar la retirada por fecha;
- ocultar la contraseña detrás de un flag «coming soon»;
- reducir la visibilidad del enlace legado hasta el punto de dejarlo inaccesible.

---

## Anexo A · Comportamiento real de Supabase Auth verificado estáticamente

Fecha de consulta: 2026-08-22.

- SDK cliente: `@supabase/supabase-js@2.106.2` → `@supabase/auth-js` (`node_modules/@supabase/auth-js/dist/main/GoTrueClient.d.ts`).
- `signInWithOtp` documentado en lines 950-1023 del `.d.ts`.
- `verifyOtp` documentado en lines 1024-1161.
- `EmailOtpType` (line 704): `'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email' | (string & {})`. SPABLA usa exclusivamente `'email'`.
- `SignInWithPasswordlessCredentials` (lines 538-572): `email` obligatorio; `options.shouldCreateUser` opcional con default `true`; `options.emailRedirectTo` opcional (SPABLA lo omite); `options.data` opcional (SPABLA lo omite).
- El nombre interno de la plantilla passwordless del proveedor es `magic_link`. Este nombre es del proveedor y **no** amplía el alcance funcional de SPABLA (§5, §6): el correo entregado contiene únicamente el código OTP; el mecanismo de verificación es `verifyOtp` con el código, no un enlace de autenticación.
- Configuración Supabase local (`supabase/config.toml`, 2026-08-22): `[auth] enabled=true, jwt_expiry=3600, enable_signup=true, enable_anonymous_sign_ins=false, enable_manual_linking=false`; `[auth.email] enable_signup=true, double_confirm_changes=false, enable_confirmations=false`. `otp_expiry` **no** fijado en `[auth]` (el CLI aplica su default). `[local_smtp] enabled=false` (Inbucket embebido captura los correos).
- Contenedor Inbucket local: `supabase_inbucket_spabla-hito-8-2-local` (verificado por la traza de `supabase stop` en corridas Q3-E2E-R).
- Migración `supabase/migrations/20260730160000_phase8_bootstrap.sql`: define `spabla_v2.tenants`, `spabla_v2.tenant_memberships`, `admin_create_tenant(text)` (líneas 302-328), `admin_add_membership(...)` (líneas 330 y siguientes). Ambas funciones son `SECURITY DEFINER` con GRANT únicamente a `service_role` (revocado a `authenticated` y `anon`). El cliente autenticado no puede ejecutarlas directamente. La estructura exacta de restricciones que soportarán el mecanismo §9.3 será auditada por 9.3.2-A-Q1 antes de implementar.

## Anexo B · Fuentes externas consultadas

- `https://supabase.com/docs/reference/javascript/auth-signinwithotp` — API del SDK.
- `https://supabase.com/docs/reference/javascript/auth-verifyotp` — API del SDK.
- `https://supabase.com/docs/guides/auth/auth-email-templates` — plantillas.
- `https://supabase.com/docs/guides/auth/rate-limits` — límites del proveedor. Los detalles concretos varían por plan y por versión y no se convierten en garantía contractual (§12.5).
- `https://supabase.com/docs/guides/local-development/customizing-email-templates` — templates locales.
- `https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/autocomplete#one-time_code` — `autocomplete="one-time-code"` normativo (§16).

Fecha de consulta: 2026-08-22.

---

**Estado del contrato**: consolidado (R2). Ninguna implementación autorizada. La siguiente orden autorizada es 9.3.2-A-Q1 · verificación técnica y contrato específico del onboarding productivo atómico.
