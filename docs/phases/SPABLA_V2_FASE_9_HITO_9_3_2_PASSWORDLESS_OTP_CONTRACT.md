# SPABLA V2 · Hito 9.3.2 — Contrato de alta y login passwordless por OTP email (rectificado)

**Versión**: `R1 (Hito 9.3.2-CONTRACT-R · 2026-08-22)`.
**Rama documental**: `spabla-v2/hito-9-3-2-passwordless-otp-contract`.
**Base oficial exacta**: `8c4b6e6346465f9aad26f174d64a8f668139ae0a` (`spabla-v2/thirteen-languages-activation`, cerrada por `HITO 9.3.1-Q3-P · AUTH CONTINUITY PROMOVIDA A OFICIAL — CERRADO`).
**Plan gobernante**: `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_PLAN.md` V1.2 §7 (secuencia 9.3.1 → 9.3.2 → 9.3.3 → 9.3.4 → 9.3.5).
**Contrato previo (heredado)**: `docs/phases/SPABLA_V2_FASE_9_HITO_9_3_1_Q2_CONTRACT.md` + Addendum Q3-E2E.
**Acta previa**: `docs/audit_reports/AUDIT_2026-08-22_hito-9-3-1-q3-auth-continuity-implementation.md` (Q3, Q3-R, Q3-E2E, Q3-E2E-R).
**Autoridad**: Este documento congela el alcance normativo del hito 9.3.2. La implementación requerirá una orden operativa separada; ninguna orden operativa podrá ampliar unilateralmente el alcance aquí definido.

**Historial de versiones**:

- `R0` (commit `456b31b`): primera redacción del contrato. Errores materiales identificados por Dirección: (1) alta autenticada pero no operativa; (2) valores de seguridad no demostrados específicamente para OTP email; (3) dependencia contractual de detalles internos de Supabase (`auth.one_time_tokens`); (4) protección de OTP en Inbucket/artefactos insuficiente.
- `R1` (este documento): rectificación integral resolviendo los cuatro problemas.

---

## 1 · Identidad del hito

**«Hito 9.3.2 — Alta/login passwordless por OTP email»**, subhito del hito 9.3 (Continuidad y autenticación), enmarcado en la Fase 9 (Thirteen-Languages Activation) del roadmap SPABLA V2.

Este hito se divide formalmente en dos unidades ejecutables (§40) para asegurar que el usuario nuevo termina operativo tras el OTP:

- **9.3.2-A — Onboarding productivo mínimo idempotente** (prerrequisito técnico).
- **9.3.2-B — Alta/login passwordless por OTP email** (consume 9.3.2-A).

La división es **arquitectónica**, no ceremonial: 9.3.2-A introduce un endpoint autenticado nuevo con lógica server-side que crea `tenant + membership` para actores sin contexto, sin depender del dev seed. Es una decisión con superficie de test y riesgo propios que merecen validación independiente antes de la capa OTP.

## 2 · Decisión de Dirección (2026-08-22, ratificada por rectificación R1)

Dirección autoriza el arranque de 9.3.2 con exactamente la siguiente configuración:

1. **Modalidad principal**: OTP de seis dígitos enviado por correo electrónico.
2. **Identificador inicial**: email normalizado y verificado por Supabase Auth.
3. **Convivencia con `email + password`**: se conserva como acceso alternativo secundario. NO se elimina en 9.3.2 (ni por migración destructiva ni por transcurso de plazo). Su retirada eventual será un subhito posterior con decisión de Dirección y evidencia de producción (§38).
4. **Modalidades explícitamente excluidas** (§35): SMS OTP, magic link, passkeys/WebAuthn, OAuth social, teléfono, dispositivos vinculados, gestión y revocación de sesiones, nativas, multicuenta.
5. **Criterio de producto**: flujo lineal email → código → sesión → chat operativo. Sin magic link camuflado. Un usuario nuevo debe poder usar SPABLA tras verificar el OTP; el contrato garantiza esta operatividad por el onboarding 9.3.2-A.

## 3 · Problema de usuario

`Product Core §1-2` describe usuarios que quieren conversar sin fricción de idioma (abuela argentina, fisioterapeuta, pareja intercultural, adolescente en intercambio, equipo remoto trilingüe, padre viudo). Para todos ellos, `email + password` presenta dos barreras concretas:

- **Recordar/crear una contraseña** aumenta el abandono en el primer acceso.
- **Reintroducir la contraseña en un dispositivo nuevo** rompe la continuidad tipo WhatsApp.

OTP email elimina ambos vectores manteniendo un identificador universal (email) sin depender de hardware específico (passkey), operador SMS (cobertura regional) o proveedor OAuth (privacidad y disponibilidad).

## 4 · Flujo funcional nominal

```
1. Usuario abre /v2/chat sin sesión activa.
2. UI muestra formulario passwordless: campo email + botón "Recibir código";
   enlace secundario "¿Prefieres entrar con contraseña?" desplegable.
3. Usuario introduce email y envía.
4. Cliente invoca supabase.auth.signInWithOtp({ email, options: {
     shouldCreateUser: true } }) — API pública del SDK.
5. Supabase Auth acepta la solicitud y envía correo con OTP de 6 dígitos.
   El SDK devuelve { data: { user: null, session: null }, error: null }.
6. UI transita a "código enviado" con mensaje neutral (§22).
7. Usuario introduce el código y envía.
8. Cliente invoca supabase.auth.verifyOtp({ email, token, type: 'email' }).
9. Supabase Auth valida y devuelve { data: { session, user }, error: null }
   → sesión persistida en localStorage bajo storageKey Q3
   ("spabla_v2_fase9_auth"), refresh_token válido, autoRefreshToken activo.
10. Máquina de estados Q3 continua: SessionReady → BootstrappingContext →
    GET /api/v2/bootstrap.
11. Si bootstrap devuelve canOperate=false porque memberships=[]:
    → cliente invoca POST /api/v2/onboarding (introducido por 9.3.2-A).
    → onboarding crea tenant + membership owner idempotentemente.
    → cliente re-invoca GET /api/v2/bootstrap.
    → bootstrap devuelve canOperate=true, selectedTenantId asignado,
      selectedConversationId (o null si no hay conversación aún).
12. Usuario entra al chat sin más pasos.
```

## 5 · Alta de usuario nuevo (recorrido completo hasta operativo)

**Recorrido B (usuario nuevo)** contemplado íntegramente:

- **B1**. `signInWithOtp({email, options:{shouldCreateUser:true}})` con email no registrado → Supabase Auth crea el registro `auth.users` en estado natural (email no verificado hasta `verifyOtp`).
- **B2**. `verifyOtp` con éxito → sesión válida + email verificado + `access_token` + `refresh_token`.
- **B3**. Cliente detecta `SessionReady` → invoca `GET /api/v2/bootstrap`.
- **B4**. Bootstrap devuelve `canOperate=false` porque el actor recién creado no tiene `memberships`.
- **B5**. Cliente detecta `canOperate=false && memberships.length===0` → invoca **`POST /api/v2/onboarding`** (endpoint autenticado introducido por 9.3.2-A).
- **B6**. Onboarding, ejecutado server-side con `service_role` bajo control estricto:
  - Valida JWT del caller (`verifyJwt` — patrón Q3-R §FASE 4).
  - Consulta si el actor ya tiene membership activo (idempotencia). Si sí, retorna la selección existente sin escribir.
  - Si no, ejecuta `spabla_v2.admin_create_tenant('<default-name-derivado-del-email>')` (existente, `SECURITY DEFINER`, GRANT `service_role` — verificado contra `supabase/migrations/20260730160000_phase8_bootstrap.sql:302-328`).
  - Ejecuta `spabla_v2.admin_add_membership(tenant_id, actor_id, 'owner')` (existente, `SECURITY DEFINER`, GRANT `service_role` — verificado en la misma migración líneas 330+).
  - Devuelve `{tenantId, membershipRole:'owner'}`.
- **B7**. Cliente re-invoca `GET /api/v2/bootstrap` → `canOperate=true`, `selectedTenantId=<tenantId>`, `selectedConversationId=null` (o creado por lógica futura fuera de 9.3.2).
- **B8**. UI transita a `ContextReady` y el usuario opera.

**Cero uso** de `/api/v2/seed` en el recorrido B. `/api/v2/seed` permanece exclusivamente dev-only doble-gated (`NODE_ENV=development` + `SPABLA_V2_ENABLE_DEV_SEED=1`) como hasta ahora.

## 6 · Login de usuario existente

**Recorrido A (usuario existente)**:

- Idéntica llamada `signInWithOtp({email, options:{shouldCreateUser:true}})`, idéntica UI. El backend no expone ninguna señal diferencial (§22).
- Tras `verifyOtp`, la sesión resultante es idéntica en semántica a la de `signInWithPassword`: mismo `access_token`, mismo `refresh_token`, misma `storageKey`. Q3 aplica sin ramas alternativas.
- Bootstrap detecta `memberships` existentes → `canOperate=true` directamente. El cliente **no** invoca `POST /api/v2/onboarding` (evaluado en el propio cliente: `memberships.length > 0 && canOperate === true`).

## 7 · Compatibilidad temporal con `email + password`

- El formulario passwordless es la **vía principal** presentada en `/v2/chat` sin sesión.
- Enlace secundario sin destaque visual «¿Prefieres entrar con contraseña?» despliega el formulario legado (`SessionArea.tsx` intacto).
- Cero cambio funcional a la función `signIn` de `app/v2/chat/page.tsx:500-511` (heredada de 9.3.1).
- Retirada futura del legado: §38.

## 8 · Estados de UI

| Estado | Trigger | Elementos visibles | Elementos ocultos |
|---|---|---|---|
| `Idle` | Página cargada sin sesión, sin OTP enviado | Campo email, botón «Recibir código», enlace secundario «¿Prefieres entrar con contraseña?» | Campo OTP, banner de éxito, banner de error |
| `OtpRequested` | `signInWithOtp` devuelve sin error | Mensaje neutral, campo OTP (6 dígitos), botón «Verificar», enlace «Reenviar código» (deshabilitado durante ventana) | Botón «Recibir código» (o reemplazado por «Cambiar email») |
| `OtpVerifying` | Usuario envía código | Spinner; resto deshabilitado | — |
| `OtpError` | `verifyOtp` devuelve error clasificable (ver §18) | Mensaje neutral del tipo del error, campo re-editable, botón activo, contador de intentos si el mecanismo §21 lo permite | — |
| `OtpExpired` | Backend responde código expirado (§19) | Mensaje «El código ha expirado. Pide uno nuevo», botón «Reenviar código» activo | Campo OTP |
| `Onboarding` | `SessionReady + canOperate=false && memberships=[]` (usuario nuevo) | Spinner + mensaje «Preparando tu espacio…» | Formulario y chat |
| `OnboardingError` | `POST /api/v2/onboarding` devuelve error clasificable | Mensaje neutral + botón «Reintentar» (idempotente §13) | — |
| `SessionEstablished` | `verifyOtp` devuelve session no nulo | Transición natural al chat vía ContextReady | Todo formulario |
| `PasswordFallback` | Usuario pulsa enlace secundario | Formulario legado 9.3.1 | Formulario OTP |

## 9 · Máquina de estados

Estado global de la sesión (extensión estricta de Q3-R §5-§9):

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
                 │  memberships=[]          memberships>0
                 │        │                       │
                 │        ▼                       │
                 │  [Onboarding] ──error→ [OnboardingError]
                 │        │                       │
                 │        ▼                       │
                 └── [ContextReady] ◄─────────────┘
```

Cero rama nueva en `session-refresh-coordinator.ts`, `fetch-with-auth-retry.ts`, `auth-recovery-coordinator.ts`, `bootstrap-client.ts` (§32).

## 10 · Contrato con Supabase Auth · API pública únicamente

**Principio rector**: SPABLA depende **exclusivamente** de la API pública soportada del SDK `@supabase/supabase-js`. SPABLA **NO** consulta, escribe ni presupone el esquema de tablas internas de Auth (`auth.users`, `auth.sessions`, `auth.one_time_tokens`, `auth.identities`, `auth.refresh_tokens`). La única fuente autoritativa contractual es la respuesta validada de Supabase Auth mediante API pública.

Una modificación interna de Supabase Auth **no debe** romper el contrato de SPABLA si mantiene la API pública documentada.

**SDK instalado verificado estáticamente**: `@supabase/supabase-js@2.106.2` → `@supabase/auth-js/dist/main/GoTrueClient.d.ts` (Anexo A).

APIs públicas utilizadas por 9.3.2:

- `signInWithOtp(credentials)` → `AuthOtpResponse = { data: { user: null, session: null }, error: null | AuthError }`.
- `verifyOtp({email, token, type: 'email'})` → `AuthResponse = { data: { session, user } | { session: null, user: null }, error }`.
- `onAuthStateChange((event, session) => ...)` — para reactividad UI existente.
- `getSession()` — heredado de Q3.

## 11 · Integración con bootstrap

- Tras `verifyOtp`, la sesión sigue el flujo `SessionReady → fetchBootstrap()` de Q3.
- `GET /api/v2/bootstrap` recibe `Authorization: Bearer <access_token>` idéntico al de `signInWithPassword`; el servidor **no distingue** el origen del token (§22).
- `verifyJwt` (`lib/v2/server/composition.ts`) sigue siendo la única validación de identidad por request (Q3-R §FASE 4).
- Ninguna modificación de `/api/v2/bootstrap`, `/api/v2/messages`, `/api/v2/seed`.
- **Nueva ruta**: `POST /api/v2/onboarding` (introducida por 9.3.2-A). Se documenta en §12.

## 12 · Tenant y membership · onboarding productivo (9.3.2-A)

**Endpoint autenticado nuevo**: `POST /api/v2/onboarding`.

- **Método**: `POST` únicamente (GET/PUT/PATCH/DELETE/HEAD → 404 opaco por el patrón hito 9.2.5-C).
- **Autenticación**: `Authorization: Bearer <access_token>` obligatorio; validado por `verifyJwt`.
- **Body**: vacío o `{}`. **Cero campo controlado por el cliente**: el cliente NO envía `tenantId`, ni `role`, ni `ownerId`, ni `email` (todo se deriva del JWT en el server).
- **Contrato de respuesta**:
  - `200 OK` con body `{tenantId: string, role: 'owner'}` (idempotente para actor con tenant existente o creación exitosa).
  - `401 unauthorized` si el JWT no es válido.
  - `500 internal` si el provisioning falla; el body sanitizado no revela detalles.
  - `503 unavailable` para transient DB errors (mismo alfabeto que 9.3.1).
  - Cero body con `admin`/`service_role`/`otp`/`email`.
- **Correlation-id** presente en todas las respuestas (heredado de `http-error.ts`).

**Lógica server-side**:

1. `verifyJwt(token)` → `actorId`.
2. Cliente Supabase per-request con `service_role` **solamente** para las operaciones necesarias del onboarding, encapsulado en `lib/v2/server/onboarding.ts` (nuevo). NUNCA se expone `service_role` al cliente.
3. **Verificación de idempotencia**: consulta a `spabla_v2.tenant_memberships` filtrando por `actor_id = actorId AND is_active = true`. Si existe fila → devuelve `{tenantId, role}` sin escribir. Si no existe → paso 4.
4. **Transacción única** (evita duplicar bajo concurrencia):
   - `SELECT ... FOR UPDATE` sobre `tenant_memberships` para el `actor_id` con lock exclusivo.
   - Segunda comprobación tras lock (double-check idempotency).
   - `SELECT admin_create_tenant('<default-name>')` → `tenantId`.
   - `SELECT admin_add_membership(tenantId, actorId, 'owner')`.
   - Commit.
5. Devuelve `{tenantId, role:'owner'}`.

**Fuentes autoritativas**:

- `spabla_v2.admin_create_tenant(text)` — `SECURITY DEFINER`, GRANT sólo a `service_role` (`supabase/migrations/20260730160000_phase8_bootstrap.sql:302-328`).
- `spabla_v2.admin_add_membership(tenantId, actorId, role)` — `SECURITY DEFINER`, GRANT sólo a `service_role` (líneas 330+ misma migración).
- El cliente **no puede** ejecutar ninguna de estas funciones directamente porque el GRANT está revocado a `authenticated` y `anon`.

**Nombre por defecto del tenant**: derivado deterministamente del email del actor (parte local `<local>` de `<local>@<domain>` truncada + sufijo `'personal'`). Ejemplo: `"maria" → "Maria's space"`. La lógica exacta queda en el helper server; el cliente jamás lo controla.

**Comportamiento del cliente** (§B5 del flujo §5):

- Si bootstrap devuelve `canOperate=false` y `memberships=[]`: cliente invoca `POST /api/v2/onboarding` con `fetchWithAuthRetry` (patrón Q3-R), tratando la respuesta 200 como éxito idempotente.
- Si bootstrap devuelve `canOperate=false` pero `memberships!=[]` o `selectedTenantId!=null`: cliente NO invoca onboarding (el caso corresponde a un actor con membership pero sin conversación, resuelto por lógica fuera de 9.3.2).
- Tras el 200 de onboarding, cliente re-invoca `GET /api/v2/bootstrap` una única vez (sin bucle: si el segundo bootstrap vuelve a devolver `canOperate=false`, el cliente cae a `OnboardingError`).

**Cero tabla nueva** en `spabla_v2`. Se reutilizan `tenants` y `tenant_memberships`.

## 13 · Idempotencia

- **`signInWithOtp`**: el SDK devuelve la misma forma para email existente y no existente; el server-side invalida el código anterior si se solicita uno nuevo (comportamiento nativo Supabase Auth).
- **`verifyOtp`**: con un código ya consumido devuelve error clasificable; la UI muestra `OtpExpired`/`OtpError`.
- **`POST /api/v2/onboarding`**: idempotente por diseño (§12): dos llamadas para el mismo actor **no crean** dos tenants ni dos memberships. Verificado por `SELECT ... FOR UPDATE` + double-check.
- **Ningún estado de OTP se almacena en `spabla_v2`**. Cero tabla `otp_challenges`, cero contadores propios.

## 14 · Concurrencia

- **Doble submit del formulario email**: UI deshabilita el botón «Recibir código» al primer submit; Supabase Auth aplica su rate limit server-side (§21).
- **Doble submit del OTP**: UI deshabilita «Verificar» al primer submit. Si Supabase acepta la primera y la segunda encuentra código consumido, `onAuthStateChange → SIGNED_IN` reconcilia sobre la sesión establecida.
- **Doble solicitud OTP en dos pestañas**: el segundo `signInWithOtp` invalida el código de la primera; la pestaña con código viejo verá `OtpError` y podrá pedir uno nuevo. Cero sesión fantasma.
- **Doble llamada a `POST /api/v2/onboarding`** (por ejemplo re-invocación tras 503 transiente): idempotente por diseño (§12).
- **Verify concurrente para el mismo actor**: `SELECT ... FOR UPDATE` en el onboarding garantiza que sólo un tenant se crea.

## 15 · Continuidad entre pestañas

- Cero regresión respecto a Q3-E2E-R §20-4, §20-5, §20-12A, §20-12B.
- Una vez `SessionReady`, todas las pestañas del mismo `BrowserContext` comparten la sesión (cross-tab del SDK Supabase).
- Si el usuario está en `OtpRequested` en pestaña A y la sesión aparece por login en pestaña B, la pestaña A transita a `SessionEstablished` automáticamente vía `onAuthStateChange`.

## 16 · Continuidad tras recarga

- `Q2 §20-2` (recarga con sesión activa) no cambia.
- Recarga durante `OtpRequested` (sin sesión establecida): UI vuelve a `Idle`. El OTP emitido sigue válido en Supabase hasta expirar; el usuario puede introducirlo si lo recuerda, o pedir uno nuevo (§20).
- Recarga durante `Onboarding` (post-verifyOtp, tenant aún no creado): al recargar y ejecutar bootstrap, el cliente re-detecta `canOperate=false && memberships=[]` y vuelve a invocar `POST /api/v2/onboarding` → idempotente → recuperación transparente.

## 17 · Continuidad tras reinicio de Next

- `Q2 §20-6` (kill+restart REAL del `next dev` process group) no cambia.
- Reinicio durante `OtpRequested`: comportamiento equivalente a §16.
- Reinicio durante `Onboarding` incompleto: al recuperarse Next, cliente re-invoca `POST /api/v2/onboarding` → idempotente.

## 18 · Errores de código

| Error del backend | Estado UI | Mensaje neutral | Acción del usuario |
|---|---|---|---|
| Código no coincide | `OtpError` | «Código incorrecto» | Reintentar (hasta el límite del §21) |
| Código expirado (§19) | `OtpExpired` | «El código ha expirado. Pide uno nuevo» | Reenviar |
| Código ya consumido | `OtpError` | «Este código ya se usó. Pide uno nuevo» | Reenviar |
| Rate limit del server excedido | `OtpError` bloqueante | «Vuelve a solicitar un código dentro de un momento» | Reenviar tras la ventana efectiva §20 |
| Error de red / Supabase caído | `OtpError` transitorio | «No hemos podido validar el código, inténtalo en unos segundos» | Reintentar |

Cero mensaje revela existencia del email (§22).

## 19 · Caducidad

**Tabla de comportamiento** — SDK vs GoTrue config vs default local vs política SPABLA vs mecanismo vs evidencia:

| Fuente | Contenido | Notas |
|---|---|---|
| **SDK público** (`@supabase/auth-js` `GoTrueClient.d.ts`) | El SDK no expone ni fuerza una caducidad; la impone el servidor. | Cero garantía cliente. |
| **GoTrue server** | Configurable vía variables `GOTRUE_OTP_EXP` u opciones análogas expuestas por Supabase Cloud / self-hosted. | La cifra concreta la fija el operador del proyecto. |
| **Default entorno local** (`supabase/config.toml`) | Este proyecto NO fija `otp_expiry` en `[auth]` (verificado 2026-08-22). Supabase CLI aplica su default. | La cifra exacta del default varía por versión del CLI y no es garantía contractual. |
| **Política SPABLA (propuesta R1)** | Caducidad **corta** en el rango 5-15 minutos, valor exacto justificado por análisis STRIDE §9 del plan 9.3. | Bajo revisión de Dirección; **NO se congela 3600 s automáticamente**. |
| **Mecanismo real que hace cumplir** | Server-side de Supabase Auth vía `otp_expiry`. | Cliente **no puede** extender la caducidad. |
| **Evidencia automatizable** | Test E2E que solicita OTP, espera `otp_expiry + 5s` y comprueba que `verifyOtp` devuelve error clasificable. | Añade tiempo al Job D; alternativa: helper server-only que consulta el `expires_at` del token vía API pública y comprueba coherencia con la política. |
| **Pendiente** | (a) Valor exacto de la política SPABLA (5, 10, 15 min); (b) verificación de que Supabase Cloud aplica ese `otp_expiry` sin discrepancia con el local. | Ambos resueltos en la orden operativa 9.3.2-A antes del cierre. |

## 20 · Reenvío

| Fuente | Contenido |
|---|---|
| **SDK público** | Doc del SDK (comentario JSDoc en `GoTrueClient.d.ts:977`) menciona: *«By default, a given user can only request a OTP once every 60 seconds.»* — es comentario, NO garantía normativa del cliente. |
| **GoTrue server** | El rate limit por email/proyecto se aplica server-side. La semántica exacta (por email, por proyecto, por IP, por endpoint) NO está establecida en el SDK; requiere verificación empírica sobre la versión concreta del servicio. |
| **Política SPABLA (propuesta R1)** | Reenvío mínimo **60 s por email** para el mismo destinatario. UI muestra contador visible y deshabilita el botón hasta 0. |
| **Mecanismo real** | Server-side de Supabase Auth. |
| **Evidencia automatizable** | Test E2E que solicita dos OTP consecutivos para el mismo email dentro de 60 s y verifica que el segundo se rechaza. La política de UI (contador) se verifica en test unitario del componente. |
| **Pendiente** | Verificación empírica de que el límite es por **email** (no sólo por IP o sólo por proyecto) sobre la versión exacta del GoTrue local y remoto. La orden operativa 9.3.2-A registra los resultados. |

## 21 · Rate limiting · SDK / política / evidencia (rectificado)

**Principio rector**: Ningún valor se presenta como garantía contractual únicamente porque sea un default. Cada límite se define como (a) qué demuestra el SDK, (b) qué configura el server, (c) qué política adopta SPABLA y (d) cómo se verifica.

### 21.1 Reenvío por email

Ver §20.

### 21.2 Caducidad del OTP

Ver §19.

### 21.3 Intentos de verificación por OTP

| Fuente | Contenido |
|---|---|
| **SDK público** | El SDK **no** documenta un límite específico de intentos para OTP email en el fichero `GoTrueClient.d.ts` inspeccionado. |
| **GoTrue server** | Existe `GOTRUE_MFA_MAX_ATTEMPTS` para flujos MFA, pero **NO es evidencia oficial** de que se aplique al mismo endpoint que `verifyOtp({type:'email'})`. La rectificación R1 **elimina** cualquier afirmación previa que reutilizara este parámetro como si fuera el límite del OTP email. |
| **Política SPABLA (propuesta R1)** | Aplicar límite **client-side + server-side mínimo por comportamiento observable**: (a) UI contabiliza intentos por OTP emitido y bloquea a los 5 intentos con instrucción de reenviar; (b) el server ya invalida un OTP consumido (uso único) y expira por tiempo, por lo que un OTP mal introducido 5 veces se recupera solicitando otro. NO se implementa contador server-side propio (evita tabla nueva y filtración por lookup). |
| **Mecanismo real** | El contador vive en memoria del cliente (state React) y en la naturaleza del OTP (uso único + expira). Es **mitigación**, no garantía cero-bypass; el atacante puede recargar la página o abrir otra pestaña para resetear el contador local. |
| **Evidencia automatizable** | Test E2E que introduce 6 códigos incorrectos consecutivos en la misma pestaña y verifica que la UI muestra el estado bloqueante tras el 5º; test complementario que verifica que la protección **no** es la única barrera contra fuerza bruta (el atacante que reintenta debería toparse con el reenvío 60 s cuando pida un OTP nuevo). |
| **Carencia declarada** | Sin límite server-side propio de intentos por OTP email. Mitigación por composición (uso único + expiración corta + reenvío 60 s). |

### 21.4 Solicitudes por IP

| Fuente | Contenido |
|---|---|
| **SDK público** | No documenta límite por IP. |
| **GoTrue server** | Supabase Cloud aplica rate limits por proyecto; los detalles exactos varían por plan y no están garantizados por el SDK. **La cifra "30 por hora" de la versión R0 se elimina por carencia de evidencia específica en la versión utilizada.** |
| **Política SPABLA (propuesta R1)** | Registrar como **pendiente**: la orden operativa 9.3.2-A debe medir empíricamente el rate limit por IP en Supabase Cloud (proyecto productivo) y por IP en el GoTrue local, y registrar los resultados. Si el límite productivo es insuficiente, evaluar un capa adicional en el propio Next.js (por ejemplo middleware Edge) — decisión que requerirá autorización expresa. |
| **Mecanismo real** | Depende del proveedor Auth. |
| **Evidencia automatizable** | La medición empírica es parte del acta de 9.3.2-A. |
| **Carencia declarada** | Ausencia de garantía contractual sobre el límite por IP en 9.3.2. |

## 22 · Prevención de enumeración (multi-canal)

**Principio rector**: Una respuesta JSON idéntica NO elimina automáticamente todos los canales de enumeración. El contrato exige diseñar y verificar la indistinguibilidad en múltiples canales observables por un atacante:

| Canal | Comportamiento exigido | Evidencia |
|---|---|---|
| **Código HTTP** | Idéntico entre existente y no existente para `signInWithOtp`. | Test E2E compara `response.status` en ambos casos. |
| **Forma de la respuesta** | Idéntica `{data:{user:null,session:null}, error:null}` (SDK behavior). | Test unitario que compara la respuesta serializada. |
| **Mensaje visible en UI** | Idéntico neutral: «Si el correo es correcto, recibirás un código». Prohibidos «esta cuenta no existe» o «bienvenido». | Test unitario del componente comprueba el mensaje. |
| **Tiempo de respuesta** | No garantizamos indistinguibilidad temporal perfecta (imposible sin retrasos artificiales inseguros). Definimos **barrera razonable**: p95 de la latencia entre casos existente/no-existente debe caer dentro de una ventana ±100 ms (medible con un test de perfil server-side sin PII). | Test de perfil que ejecuta N solicitudes por cada caso y verifica que la diferencia p95 no supere 100 ms; test se ejecuta bajo `NODE_ENV=test` o similar, no bloquea la barrera E2E. |
| **Aplicación del rate limit** | El rate limit se aplica **igualmente** a emails existentes y no existentes (no filtrar por existencia). | Test E2E que verifica idéntica ventana de reenvío para ambos casos. |
| **Envío o no envío del correo** | La versión R1 asume que Supabase envía correo también cuando el email no existía (comportamiento actual con `shouldCreateUser:true`). Test verifica que Inbucket recibe correo en ambos casos. | Test E2E lee Inbucket y compara. |
| **Diferencias password vs OTP** | Un email con cuenta password preexistente responde idénticamente a un email sólo-OTP. | Test E2E cubre las tres combinaciones (nuevo, existente-solo-OTP, existente-con-password). |
| **Errores del proveedor** | Fallos del backend Auth se traducen a mensaje UI idéntico al éxito neutral («Vuelve a intentarlo en unos segundos» sin distinguir). | Test unitario del componente. |
| **Logs accesibles** | Cero log server-side revela `email_exists=true/false`. `logSanitizedError` (`lib/v2/server/log-sanitize.ts`) filtra. | Inspección estática del log-sanitize + test de log. |
| **`shouldCreateUser` behavior** | Fijado en `true` (§4-6). NUNCA `false` (que fallaría diferenciando). Test verifica que en el bundle final no aparece `shouldCreateUser: false`. | Test grep sobre el bundle o sobre el propio `OtpForm.tsx`. |
| **Concurrencia** | Dos solicitudes casi-simultáneas para el mismo email producen el mismo comportamiento observable (rate limit aplicado igualmente). | Test E2E envía dos solicitudes en paralelo. |

Cero retraso artificial que pueda facilitar timing attacks contra otros mecanismos.

## 23 · Protección de logs y artefactos

Invariantes heredadas de `lib/v2/server/log-sanitize.ts` y del acta Q3-E2E-R §20.6, **rectificadas y ampliadas por R1**:

- Cero OTP, cero `access_token`, cero `refresh_token`, cero `Authorization`, cero email personal en logs de servidor, logs de cliente, artefactos Playwright, screenshots, videos, traces, HTML reports, artefactos de CI.
- Los tests E2E hacen aserciones sólo sobre presencia/ausencia y transiciones de estado; nunca imprimen el valor del código.
- **Reglas específicas de artefactos Playwright** (§31):
  - `screenshot: 'only-on-failure'` (heredado de Q3-E2E-R).
  - `trace: 'off'` (heredado de Q3-E2E-R — un trace HAR puede capturar el request body con el OTP).
  - `video: 'off'` (heredado — un video captura el DOM con el OTP tecleado).
  - Reporter `list` únicamente. Sin HTML report, sin blob report.
  - Los screenshots de fallo (§31) generados en la carpeta `test-results/` **NO** capturan el propio campo de OTP relleno: el helper del test **borra** el valor del campo OTP antes de tomar el screenshot mediante `page.locator('#spabla-otp-code').fill('')` en un `test.afterEach` que se ejecuta también al fallar.
  - Los reportes de fallo del reporter `list` incluyen el mensaje del error pero **NO** el body del email ni el código; el helper de Inbucket devuelve al test un **hash** del código (o un identificador opaco) para aserciones de tipo `expect(receivedHash).toBe(expectedHash)` sin exponer el valor en ningún reporter.
- **Prueba antifiltración** (§31): tras cada corrida E2E el runner ejecuta un `grep` sobre todos los ficheros bajo `test-results/`, `playwright-report/`, `blob-report/` con un patrón que busca (a) exactamente 6 dígitos consecutivos que puedan ser un OTP, (b) el email de fixture completo, (c) cualquier `access_token`/`refresh_token`/`Authorization`. Si el `grep` encuentra algún match, la corrida se declara **FAIL** aunque los tests hayan pasado.

## 24 · Proveedor de correo y entregabilidad

| Entorno | Proveedor SMTP | Estado |
|---|---|---|
| **Local dev** | Inbucket embebido por Supabase CLI (`supabase_inbucket_<project>`) | **Disponible**. `[local_smtp] enabled=false` en `supabase/config.toml` no impide Inbucket; el CLI lo arranca por defecto. |
| **CI (Job B/D)** | Inbucket embebido, idéntico a local | **Disponible** — la orden operativa 9.3.2-B leerá los emails de Inbucket vía su HTTP API con protecciones §27. |
| **Producción** | **Sin proveedor definido** | **Dependencia operativa pendiente**. Registrada como bloqueante de despliegue productivo, NO bloqueante de contrato ni de CI. |

**Requisitos productivos** (dependencia operativa separada, NO parte del cierre técnico de 9.3.2):

- Proveedor SMTP o servicio transaccional (candidatos habituales: Resend, Postmark, AWS SES, SendGrid) — decisión de Dirección posterior.
- Dominio remitente propio; SPF, DKIM, DMARC verificables por DNS.
- Política de rebotes (soft/hard) y de supresión.
- Política de reintentos ante fallo transitorio.
- Observabilidad: métricas de entregabilidad, tiempo medio de llegada, tasa de bounces.
- Coste marginal por correo y presupuesto mensual.
- Límites del proveedor (cuota diaria/mensual, sandbox vs prod).

**El contrato NO afirma que SPABLA disponga hoy de SMTP productivo.** El GO producción exige resolución previa de este apartado (§37 — separación de GO).

## 25 · Accesibilidad

- Inputs con `<label for>` asociado y `aria-*` apropiados; patrón heredado de `SessionArea.tsx`.
- Campo OTP `<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}>` (normativo WHATWG HTML + iOS Safari + Chrome Android).
- Mensajes de estado con `role="alert"` en cambios de `OtpError` / `OtpExpired` / `OnboardingError`.
- Contraste ≥ WCAG AA en todos los estados; el enlace secundario (fallback password) contraste ≥ 4.5:1.
- Navegación completa por teclado; sin dependencia de gestos táctiles.

## 26 · Experiencia móvil y escritorio

- Layout responsive equivalente a Q3-E2E-R (Chromium desktop + iOS Safari + Chrome Android como objetivos).
- `autoComplete="one-time-code"` habilita el auto-rellenado del código desde correo/SMS en Safari/Chrome móviles.
- Área táctil del enlace secundario «Prefiero contraseña» ≥ 44×44 px.
- Cero dependencia de push nativos.

## 27 · Observabilidad sin datos sensibles

Extensión del contrato `logSanitizedError` de 9.2.5-C:

- Métricas de negocio (agregadas, sin PII): número de `signInWithOtp` por hora, número de `verifyOtp` exitosos, tasa de `OtpExpired`, tasa de `OtpError` por categoría, número de `POST /api/v2/onboarding` (exitoso/idempotente/fallido).
- Métricas de operación: latencia p50/p95 de `signInWithOtp`, `verifyOtp`, `POST /api/v2/onboarding`; ratio de rebotes reportados por el proveedor SMTP (producción).
- Cero PII (email, IP, código, `access_token`) en ninguna traza persistida.
- `correlationId` UUID v4 sigue siendo el pivot de trazabilidad.

## 28 · Pruebas unitarias

Módulos y coberturas mínimas (concretadas en la orden operativa):

| Módulo | Pruebas mínimas |
|---|---|
| `app/v2/chat/components/OtpForm.tsx` | render de cada estado UI (§8); deshabilitación de botones; contador de reenvío; enlace fallback |
| `lib/v2/server/onboarding.ts` (nuevo) | verifyJwt → actorId; idempotencia (double invoke → mismo tenantId, sin duplicados); protección contra cliente que enviara `tenantId`/`role` fabricados; error clasificado ante fallo de DB |
| `app/api/v2/onboarding/route.ts` (nuevo) | 401 sin auth; 401 con JWT inválido; 200 idempotente; 500 sanitizado; 503 transient; 404 para GET/PUT/PATCH/DELETE/HEAD |

Prohibido:

- Mocks de la librería `@supabase/supabase-js` con comportamientos inventados.
- Reemplazar `signInWithOtp` productivo por un stub en el bundle final.

## 29 · Pruebas de integración

- Suite bajo `vitest.client.config.ts` (mismo runner que Q3):
  - Direct-handler test de `app/api/v2/onboarding/route.ts` con `verifyJwt` y `admin_create_tenant`/`admin_add_membership` mockeados en la frontera del composer server-side (nunca del bundle).
  - HTTP-frontier test (`app/api/v2/onboarding/route.http.integration.test.ts`) que valida el 200 idempotente contra Supabase local real (patrón hereda `app/api/v2/bootstrap/route.http.integration.test.ts`).
- Suite HTTP-frontier `/api/v2/bootstrap` sigue siendo la que valida que el JWT generado por OTP y el generado por password son intercambiables.
- Fixtures: `admin.auth.admin.createUser({email, email_confirm:true})` heredado del patrón E2E.

## 30 · Pruebas E2E

Ampliación de `e2e/auth-continuity.spec.ts` con un segundo describe `Q3.2-E2E · Passwordless OTP email` ejecutado por el mismo Job D, incluyendo los recorridos A (usuario existente) y B (usuario nuevo con onboarding).

- **Recorrido A (usuario existente)**: fixtures con Tenant A + membership existente; login por OTP; verificación de que `canOperate=true` sin invocación de onboarding.
- **Recorrido B (usuario nuevo)**: fixtures que crean el usuario sólo en `auth.users` (sin membership); alta por OTP; verificación de que la UI transita por `Onboarding` y termina en `ContextReady`.
- **Anti-falso-positivo específico** (§31).

Runner: `scripts/e2e/run-auth-continuity.sh` amplía las variables de entorno para exponer el endpoint HTTP de Inbucket (`SPABLA_E2E_INBUCKET_URL`) y para orquestar la limpieza de buzones (§27).

## 31 · Barreras anti-falsos positivos

Extensión del principio Q3-E2E-R §CONTROL:

- **Prohibido** poner el OTP en el DOM antes de la verificación (debug hint) y leerlo desde el DOM en el test.
- **Prohibido** mockear `verifyOtp` para devolver sesión sin haber emitido OTP real.
- **Prohibido** usar `admin.auth.admin.generateLink` como sustituto del flujo real. Aceptable sólo como fallback etiquetado NO EJECUTABLE si Inbucket estuviera inaccesible.
- **Test anti-falso-positivo automático**: lee el propio `e2e/auth-continuity.spec.ts` y verifica que dentro del bloque `Q3.2-E2E`:
  - No aparece `admin.auth.admin.generateLink` (fuera de guardián NO EJECUTABLE).
  - Cada `verifyOtp` es precedido por una lectura real de Inbucket.
  - No hay `page.locator('#spabla-otp-code').inputValue()` o llamadas equivalentes que lean el valor del propio campo de OTP.
- **Anti-filtración de artefactos** (heredado y ampliado §23): el runner E2E ejecuta al final un `grep` sobre `test-results/`, `playwright-report/`, `blob-report/`, `test-results/e2e/*/error-context.md`, `.playwright/` (aunque estén vacíos por config) buscando: (a) 6 dígitos consecutivos que puedan ser un OTP; (b) email de fixture completo; (c) `access_token`/`refresh_token`/`Authorization`. Cualquier match → FAIL global de la corrida.
- **Aserciones sobre el OTP**: los tests comparan por **hash SHA-256** del código extraído de Inbucket contra el hash del código introducido; el valor plano nunca aparece en logs, reporter, screenshots ni traces.

## 32 · Regresión obligatoria de los 14 tests Q3

Los 13 escenarios contractuales de Q2 §20 + el test anti-falso-positivo Q3-E2E-R deben permanecer **14/14 PASS** en Job D antes y después de la implementación de 9.3.2.

Cero modificación funcional a:

- `lib/v2/client/session-refresh-coordinator.ts`
- `lib/v2/client/fetch-with-auth-retry.ts`
- `lib/v2/client/auth-recovery-coordinator.ts`
- `lib/v2/client/bootstrap-client.ts`
- `lib/v2/server/composition.ts`
- `app/api/v2/bootstrap/route.ts`

El hook `NEXT_PUBLIC_SPABLA_E2E_HOOK` (Q3-E2E-R FASE 1) se reutiliza; NO se introduce hook nuevo.

## 33 · Criterios de aceptación

Cerrado 9.3.2 sólo cuando **todos** los siguientes se cumplen simultáneamente:

1. Los 14 escenarios Q3-E2E-R siguen verdes (§32).
2. Los 27 escenarios de la matriz §5 (ver §34) siguen verdes.
3. Usuario nuevo puede completar OTP y terminar operativo en Chromium real, sin abrir el correo manualmente y sin ejecutar dev seed.
4. Usuario existente puede loguearse por OTP y terminar operativo.
5. Fallback password sigue funcionando (§7).
6. Respuesta indistinguible entre alta y login en los canales de §22.
7. Rate limit de reenvío efectivo (medición empírica registrada en el acta 9.3.2-A/B).
8. Caducidad efectiva coincide con la política SPABLA fijada (§19).
9. Cero OTP, tokens, emails personales o headers Authorization en cualquier log, artefacto o traza — verificado por la prueba antifiltración §31.
10. tsc + ESLint + client Vitest + engine Vitest + build + SQL/RLS suites + HTTP frontier messages + HTTP frontier bootstrap + HTTP frontier onboarding + Job D verdes.
11. CI oficial post-implementación attempt=1 · success · Jobs A/B/C/D success.
12. Acta breve de Dirección con no más de 10 pasos (patrón heredado).

## 34 · GO / NO-GO por escalón

Se separan explícitamente:

- **GO desarrollo local**: los criterios §33 puntos 1-3 y 5-10 verdes contra Supabase local. NO requiere SMTP productivo. Coste marginal.
- **GO CI (Job A/B/C/D)**: los criterios §33 puntos 1-11 verdes en `ubuntu-latest` con Supabase local + Inbucket. NO requiere SMTP productivo. Es la barrera técnica de merge a la rama Q3.
- **GO promoción técnica** (fast-forward a `spabla-v2/thirteen-languages-activation`): GO CI + acta breve §33 punto 12. Puede promocionarse sin SMTP productivo.
- **GO despliegue productivo**: GO promoción técnica + resolución previa de §24 (proveedor SMTP + SPF/DKIM/DMARC + política de rebotes + observabilidad + coste + límites) + análisis STRIDE completado + medición empírica de rate limits en Supabase Cloud (§21). Un CI verde **NO implica automáticamente GO producción**.

**NO-GO** si:

- Cualquier escenario NO EJECUTABLE, skipped o failed en Job D.
- OTP filtrado en cualquier artefacto (verificado por §31).
- Regresión sobre los 14 escenarios Q3-E2E-R.
- Ausencia de resolución de §24 en el escalón productivo.

## 35 · Fuera de alcance

Explícitamente **no** son condición de cierre de 9.3.2 (bajo ninguna forma, incluida flags):

- OTP por SMS.
- Magic link (`{{ .ConfirmationURL }}` como mecanismo de autenticación).
- Passkeys / WebAuthn.
- OAuth social.
- Teléfono como identificador.
- Dispositivos vinculados / sesiones visibles / revocación individual → 9.3.3.
- Aplicaciones nativas → 9.3.4.
- Multicuenta → 9.3.5.
- Recuperación manual de cuentas por intervención humana o verificación documental.
- Tabla `spabla_v2.otp_challenges` u otra tabla propia de OTP: **prohibido**.
- Tabla `spabla_v2.auth_events` o `spabla_v2.devices` (candidatos de 9.3.3).
- Lectura/escritura de tablas internas del schema `auth` (`auth.users`, `auth.sessions`, `auth.one_time_tokens`, `auth.identities`, `auth.refresh_tokens`) desde código productivo o desde tests.

## 36 · Riesgos residuales

- **R-9.3.2-A · Entregabilidad productiva no resuelta**: bloquea GO producción, no GO promoción. Mitigación: §24 y §34.
- **R-9.3.2-B · Valores concretos de rate limit y caducidad pendientes**: Mitigación: medición empírica en 9.3.2-A/B; §19-§21.
- **R-9.3.2-C · Baja adopción del OTP frente al password legado**: métricas §27 informarán §38.
- **R-9.3.2-D · Regresión sobre Q3 por refactor de `SessionArea.tsx`**: mitigación: `OtpForm.tsx` es SUMA (nuevo componente), no reescritura.
- **R-9.3.2-E · Filtración de OTP en Inbucket compartido entre corridas CI**: mitigación: buzón aislado por `<runId>` (§27); anti-filtración §31.
- **R-9.3.2-F · Plantilla del correo con `{{ .ConfirmationURL }}`**: mitigación: la orden operativa 9.3.2-B verifica el **contenido efectivo del correo entregado a Inbucket**, no sólo el nombre del archivo/plantilla (§26).
- **R-9.3.2-G · Bloqueo cross-tab del refresh Q3 interfiriendo con `verifyOtp` concurrente**: mitigación: §14.
- **R-9.3.2-H · Onboarding productivo introduce nuevo endpoint autenticado con `service_role` server-side**: mitigación: aislar en `lib/v2/server/onboarding.ts`; NUNCA exponer `service_role` al cliente; tests §28 y §29 verifican que el cliente no puede autoasignarse tenant/rol.
- **R-9.3.2-I · Enumeración vía timing**: mitigación por barrera p95 ±100 ms (§22), sin retrasos artificiales.
- **R-9.3.2-J · Carencia de límite server-side de intentos por OTP email**: mitigación por composición (§21.3). Aceptado como riesgo residual documentado.
- **R-9.3.2-K · Ausencia de límite productivo por IP demostrable en Supabase Cloud**: pendiente de medición (§21.4). Aceptado como riesgo residual documentado.

## 37 · Estrategia de rollback

- **Rollback funcional**: si tras despliegue la telemetría §27 revela un problema material (por ejemplo tasa de entregabilidad < 90%, bounce > 5%), Dirección puede ordenar ocultar el formulario OTP en la UI mediante feature flag opcional a introducir en la orden operativa de implementación (`NEXT_PUBLIC_SPABLA_OTP_ENABLED` u equivalente). El fallback password permanece plenamente funcional.
- **Rollback técnico**: revertir el commit con `git revert`; la oficial vuelve a un estado equivalente a Q3-P. Cero migración destructiva permitida (§35).
- **Rollback E2E**: los 14 escenarios Q3-E2E-R son la barrera mínima post-rollback.

## 38 · Unidad posterior para posible retirada de contraseña

La retirada de `signInWithPassword` como método de login NO se planifica en 9.3.2. Cuando Dirección la ordene en un subhito posterior (candidato: **9.3.2-bis · Retirada controlada del acceso por contraseña**), la decisión deberá basarse simultáneamente en:

- Entregabilidad productiva del OTP ≥ umbral fijado por Dirección.
- Recuperación funcional demostrada con al menos un caso real (procedimiento a diseñar en el propio subhito).
- Rate limiting operativo verificado sobre logs de producción.
- Observabilidad sin secretos verificada mediante inspección de artefactos CI.
- Continuidad de sesión sin regresiones durante periodo definido por Dirección (NO arbitrario por transcurso de plazo).
- Ausencia de regresiones sobre los 14 Q3-E2E-R + escenarios OTP.
- Soporte para usuarios existentes que aún usen contraseña (comunicación previa por email).
- Procedimiento de emergencia documentado.
- **Decisión expresa de Dirección** materializada en una orden operativa separada.

Prohibido en 9.3.2:

- Programar la retirada por fecha.
- Ocultar la contraseña detrás de un flag "coming soon".
- Reducir la visibilidad del enlace legado hasta el punto de dejarlo inaccesible.

## 39 · Archivos previsiblemente afectados

**Nuevos** (creación en las órdenes operativas 9.3.2-A y 9.3.2-B):

- `app/api/v2/onboarding/route.ts` — nuevo endpoint POST-only.
- `app/api/v2/onboarding/route.handler.test.ts` — direct-handler unit tests.
- `app/api/v2/onboarding/route.http.integration.test.ts` — HTTP frontier real contra Supabase local.
- `lib/v2/server/onboarding.ts` — composer server-side con la lógica idempotente (§12).
- `lib/v2/server/onboarding.test.ts` — unit tests del composer.
- `app/v2/chat/components/OtpForm.tsx` — nuevo componente UI.
- `e2e/auth-continuity.spec.ts` — nuevo describe.serial `Q3.2-E2E · Passwordless OTP email`.
- `scripts/e2e/inbucket-fetch-otp.sh` (o inline en el spec) — helper que consulta el HTTP API de Inbucket y devuelve al test un hash del código (nunca el valor plano).
- `docs/e2e/MATRIX.md` — nueva sección con la matriz 27/27 (§5) + anti-filtración.
- `docs/audit_reports/AUDIT_<fecha>_hito-9-3-2-*.md` — acta del hito tras cierre.

**Modificados** (mínimo):

- `app/v2/chat/page.tsx` — orquestación del render OTP vs password + invocación de `POST /api/v2/onboarding` cuando bootstrap devuelve `canOperate=false && memberships=[]`.
- `supabase/templates/*.html` — plantilla local que emita únicamente el código OTP (nunca `{{ .ConfirmationURL }}` como mecanismo). La verificación se hace sobre el **contenido efectivo del correo entregado a Inbucket** (§26), no sobre el nombre del archivo.
- `supabase/config.toml` — sólo si el análisis STRIDE justifica ajustar `otp_expiry` o rate limits.
- `.github/workflows/ci.yml` — sólo si el Job D necesita variables adicionales para consultar Inbucket.

**Cero cambio**:

- `lib/v2/client/session-refresh-coordinator.ts`, `fetch-with-auth-retry.ts`, `auth-recovery-coordinator.ts`, `bootstrap-client.ts`, `supabase-browser-client.ts`.
- `lib/v2/server/composition.ts`.
- `app/api/v2/bootstrap/route.ts`, `app/api/v2/messages/route.ts`, `app/api/v2/seed/route.ts`.
- `supabase/migrations/*` (cero migración nueva; el schema `spabla_v2` ya tiene `tenants`, `tenant_memberships`, `admin_create_tenant`, `admin_add_membership`).

## 40 · Secuencia de implementación propuesta

La rectificación R1 divide 9.3.2 en dos unidades ejecutables autónomas:

### 40.1 · Hito **9.3.2-A — Onboarding productivo mínimo idempotente** (prerrequisito)

Objetivo: introducir `POST /api/v2/onboarding` y su composer server-side, sin tocar el vector de sign-in. Puede validarse con usuarios existentes que aún usan password.

- **9.3.2-A-Q1 · Auditoría técnica**: verificar `admin_create_tenant`/`admin_add_membership` en local, medir latencia, comprobar que `SELECT ... FOR UPDATE` funciona correctamente bajo carga.
- **9.3.2-A-Q2 · Contrato específico**: sub-documento derivado de este §12.
- **9.3.2-A-Q3 · Implementación**: `route.ts` + `lib/v2/server/onboarding.ts` + tests unit/integration/HTTP-frontier.
- **9.3.2-A-Q4 · Barrera E2E**: nuevo escenario en `e2e/auth-continuity.spec.ts` que loguea un usuario sin membership (via password) e invoca `POST /api/v2/onboarding` desde la UI; verifica que la barrera 14/14 Q3-E2E-R sigue verde.
- **9.3.2-A-Q5 · Promoción**: fast-forward a `spabla-v2/thirteen-languages-activation`.

### 40.2 · Hito **9.3.2-B — Alta/login passwordless por OTP email** (consume 9.3.2-A)

Objetivo: introducir `OtpForm.tsx` + integración cliente + verificación de plantilla + barrera E2E de 27 escenarios.

- **9.3.2-B-Q1 · Auditoría técnica**: verificar plantilla local y remota, comprobar Inbucket accesible en local y CI, **medir empíricamente** las políticas §19-§21 sobre GoTrue local y sobre Supabase Cloud (proyecto productivo), registrar los resultados en el acta.
- **9.3.2-B-Q2 · Contrato específico** (opcional; puede reutilizar este documento).
- **9.3.2-B-Q3 · Implementación cliente**: `OtpForm.tsx` + integración en `page.tsx` con orquestación del onboarding (§12).
- **9.3.2-B-Q4 · Barrera E2E**: describe.serial ampliado con recorridos A + B + anti-falso-positivo + antifiltración (§31).
- **9.3.2-B-Q5 · Promoción**: fast-forward a la rama oficial.

### 40.3 · Dependencia operativa (bloqueo de GO producción, no de GO promoción)

- **9.3.2-Ops · Entregabilidad productiva**: resolución de §24. Decisión de Dirección + orden operativa separada.

Cada unidad publica en su propia rama documental/técnica: `spabla-v2/hito-9-3-2-<X>-<qN>-<descriptor>`.

**Recomendación de Dirección — próxima orden de implementación**: iniciar por **9.3.2-A-Q1 · Auditoría técnica del onboarding**. Es la unidad de menor riesgo y desbloquea 9.3.2-B; permite además cerrar el objetivo de producto (usuario nuevo operativo) antes que la capa OTP.

---

## Anexo A · Comportamiento real de Supabase Auth verificado estáticamente (2026-08-22)

- SDK cliente: `@supabase/supabase-js@2.106.2` → `@supabase/auth-js` (`node_modules/@supabase/auth-js/dist/main/GoTrueClient.d.ts`).
- `signInWithOtp` documentado en lines 950-1023.
- `verifyOtp` documentado en lines 1024-1161.
- `EmailOtpType` (line 704): `'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email' | (string & {})` — SPABLA usa **exclusivamente** `'email'`.
- `SignInWithPasswordlessCredentials` (lines 538-572): `email` obligatorio; `options.shouldCreateUser` opcional (default `true`); `options.emailRedirectTo` omitido; `options.data` omitido.
- Configuración Supabase local (`supabase/config.toml`): `[auth] enabled=true, jwt_expiry=3600, enable_signup=true, enable_anonymous_sign_ins=false, enable_manual_linking=false`; `[auth.email] enable_signup=true, double_confirm_changes=false, enable_confirmations=false`. `otp_expiry` **NO fijado** en `[auth]` (Supabase CLI aplica su default).
- **Nombre interno de plantilla en Supabase**: el proveedor usa internamente el identificador `magic_link` para el correo passwordless de sign-in por email. **Este nombre es del proveedor, no del producto SPABLA**: en 9.3.2 el correo entregado contiene únicamente el código OTP (`{{ .Token }}`), sin enlace de autenticación. La verificación se realiza sobre el **contenido efectivo del correo entregado a Inbucket** (§26 y §31), no sobre el nombre del archivo o plantilla. SPABLA no ofrece magic link como funcionalidad de producto en 9.3.2 (§35).
- Contenedor Inbucket local: `supabase_inbucket_spabla-hito-8-2-local` (verificado por la traza de `supabase stop` en corridas previas Q3-E2E-R).
- Migración `supabase/migrations/20260730160000_phase8_bootstrap.sql`: define `admin_create_tenant` (líneas 302-328) y `admin_add_membership` (líneas 330+), ambas `SECURITY DEFINER` con GRANT sólo a `service_role` — el cliente autenticado NO puede ejecutarlas directamente (§12).

## Anexo B · Fuentes externas consultadas

- `https://supabase.com/docs/reference/javascript/auth-signinwithotp` — API del SDK.
- `https://supabase.com/docs/reference/javascript/auth-verifyotp` — API del SDK.
- `https://supabase.com/docs/guides/auth/auth-email-templates` — plantillas.
- `https://supabase.com/docs/guides/auth/rate-limits` — límites del proveedor Auth (los detalles concretos varían por plan y no son garantía contractual — motivo por el que §21 los categoriza como pendientes).
- `https://supabase.com/docs/guides/local-development/customizing-email-templates` — templates locales.
- `https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/autocomplete#one-time_code` — `autocomplete="one-time-code"` normativo (§25).

Fecha de consulta: 2026-08-22.

---

**Estado del contrato**: rectificado (R1), preparado para revisión final de Dirección. Ninguna implementación autorizada por esta rama documental; la implementación requiere una orden operativa separada por unidad (9.3.2-A y 9.3.2-B) que respete estrictamente el alcance aquí congelado.
