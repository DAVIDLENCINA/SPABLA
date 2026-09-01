# HITO 9.3.2-B-Q2-R · RECTIFICACIÓN DEL FLUJO OTP · PRUEBA CONDUCTUAL Y PRIORIDAD OTP

Fecha: 2026-08-25
Rama: `spabla-v2/hito-9-3-2-b-q2-r-behavioral-proof`
Base: `d3a2e1053328a4c313282f41ecec18c2c03d3139` (candidato Q2 a rectificar)
Oficial invariante: `957e59f854f4e2b95ccd8d37a5b03bd5fdca4624`
Main invariante: `e6128433d42e1e105529ed2f64212ca527034b6a`

## 1 · Alcance

Rectificación acotada del candidato Q2 en tres frentes:

1. **OTP como método principal**. En Q2 inicial `authMethod` arrancaba en `"password"` y `onAuthenticated` forzaba volver a `"password"`. Q2-R invierte la prioridad: OTP es la vista inicial, se preserva como método por defecto tras autenticar y tras cerrar sesión.
2. **Pruebas conductuales reales**. Q2 se apoyaba en `otp-form.test.ts` (grep sobre el source). Q2-R añade `otp-form.behavioral.test.tsx` y `page.behavioral.test.tsx` que renderizan React con `@testing-library/react` sobre happy-dom.
3. **Integración OTP → onboarding real**. Q2 ejercía `verifyOtp` real pero llamaba al onboarding vía `fetch` mockeado. Q2-R invoca el handler `POST /api/v2/onboarding` real in-process (patrón `route.presentation.integration.test.ts`) y verifica postcondiciones SQL directas.

Sin promoción. Sin Q3. Sin cambios de contrato, migraciones, RPC ni handler productivo.

## 2 · Por qué Q2 inicial no acreditaba comportamiento dinámico

- **Estructural vs dinámico**: `otp-form.test.ts` (Q2) valida presencia de strings (`inputMode="numeric"`, `RESEND_COOLDOWN_SECONDS=60`, etc.) sobre el source de OtpForm.tsx. Ninguna aserción sobre el DOM montado. No prueba que el cooldown desactive el botón *en tiempo real*, ni que el `mountedRef` prevenga setState post-unmount, ni que `aria-invalid` refleje el estado tras click.
- **Fetch mockeado**: `otp-verify.test.ts` (Q2) sustituye `globalThis.fetch` por `vi.fn()`. El handler real de `/api/v2/onboarding` (Q2-R3 promovido) nunca se ejerce. Un cambio silencioso en la firma del handler no rompería esos tests.
- **Password como default**: la orden Q2 original ni establecía qué método era principal ni exigía renderer real. La lectura literal de "convivencia" llevó a implementar `authMethod: "password" | "otp"` con default `"password"`, lo que contradice la dirección Q2-R §1.

## 3 · Archivos y dependencias modificados

Modificados:
- `app/v2/chat/page.tsx` — `authMethod` default `"otp"`; `onAuthenticated` NO fuerza `"password"`; `signOut` restablece a `"otp"`; el orden JSX prioriza `OtpForm` sobre `SessionArea`.
- `lib/v2/client/otp-form.test.ts` — se reescribe el test que enforce `setAuthMethod("password")` en `onAuthenticated` para exigir lo contrario, con parseo de llaves balanceado.
- `e2e/auth-continuity.spec.ts` — `expectSignInFormVisible` clickea "Acceder con contraseña" si visible antes de esperar `SessionArea`.
- `e2e/onboarding.spec.ts` — `signInAsUserInPage` idem.
- `vitest.client.config.ts` — soporta `.tsx`; sustituye legacy `environmentMatchGlobs` por comentario documentando el uso del pragma `// @vitest-environment happy-dom` (Vitest 4.x).
- `package.json` + `package-lock.json` — añade devDependencies (§4).

Nuevos:
- `lib/v2/client/otp-form.behavioral.test.tsx` — **18 tests conductuales reales** (render, fireEvent, waitFor, aria-*, timers reales de cooldown).
- `app/v2/chat/page.behavioral.test.tsx` — **4 tests** para la política OTP-principal + toggle OTP↔password.
- `lib/v2/client/otp-onboarding.integration.test.ts` — **2 tests** integración real OTP → verifyOtp → handler `/api/v2/onboarding` importado + assertions SQL.
- `lib/v2/client/otp-antifraud.test.ts` — **13 barreras** que impiden regresión de las 3 rectificaciones + surface OTP.
- `docs/audit_reports/AUDIT_2026-08-25_hito-9-3-2-b-q2-r-otp-behavioral-proof.md` — este acta.

## 4 · Dependencias añadidas · justificación

| Paquete | Versión | Rol | Justificación |
|---|---|---|---|
| `@testing-library/react` | 16.3.2 | render/screen/fireEvent | Único camino razonable para pruebas conductuales de React 19 en Vitest sin arrastrar el motor de Next; alternativa manual (renderToString + reconstruir eventos) sería frágil |
| `@testing-library/dom` | (transitiva) | queries | Requerida por `@testing-library/react` |
| `happy-dom` | 20.11.6 | Environment DOM | Mucho más rápido que jsdom (~10×) con la superficie React que necesitamos; ya activado sólo en los ficheros `.behavioral.test.tsx` vía pragma |
| `react-dom` | 19.2.4 (exact) | render en cliente | Requerido por Testing Library; versión fija coincidente con `react` productivo evita conflicto ERESOLVE |

Ninguna otra devDep añadida. Cero dependencia productiva nueva.

## 5 · OTP como método principal · evidencia

**Static oracle** (`lib/v2/client/otp-antifraud.test.ts § authMethod inicial DEBE ser 'otp'`):

```ts
expect(PAGE).toMatch(/useState<"password" \| "otp">\("otp"\)/);
expect(PAGE).not.toMatch(/useState<"password" \| "otp">\("password"\)/);
```

**onAuthenticated no fuerza password** (`otp-antifraud.test.ts § onAuthenticated NO fuerza setAuthMethod('password')`): usa parseo balanceado de llaves para aislar el cuerpo del arrow function.

**signOut restablece OTP** (`otp-antifraud.test.ts § signOut vuelve por defecto a 'otp'`): `setBootstrapPhase("idle") ... setAuthMethod("otp")`.

**Conductual** (`app/v2/chat/page.behavioral.test.tsx`):
- Render inicial monta la vista OTP (heading "Acceder con código", label "Email", botón "Recibir código").
- Botón "Acceder con contraseña" está visible desde OTP.
- Click sobre él transita a `SessionArea` (heading "Iniciar sesión", label "Contraseña").
- Botón inverso "Acceder con código" visible desde password y vuelve a OTP.

## 6 · Pruebas conductuales de OtpForm

`lib/v2/client/otp-form.behavioral.test.tsx` (**18 tests**, todas verdes 2 rondas):

1. Render inicial · vista email con inputs y botón principal
2. Email inválido · muestra error y NO transita a vista código
3. Solicitar código · llama al helper y transita a vista código
4. Input código · sanea no-dígitos y limita a 6
5. Verificación errónea · mensaje único opaco
6. Cooldown UX · botón reenviar deshabilitado hasta expirar (timers reales, 1s override)
7. Reenvío · limpia código previo y muestra info opaca
8. Doble clic solicitar · sólo dispara una llamada al helper
9. Respuesta obsoleta · resolución tardía tras cambio de email no pisa la vista
10. Unmount · resolución tras desmontaje NO dispara warnings React
11. Cambio a contraseña · invoca `onSwitchToPassword` desde vista email
12. Cambiar email · vuelve a vista email; segundo intento arranca con código vacío
13. Éxito completo · `onAuthenticated` invocado 1 vez tras verifyOtp+onboarding OK
14. `onboarding_error` · NO invoca `onAuthenticated` y ofrece reintento
15. a11y · label + `aria-invalid` + `aria-describedby` vincula el mensaje
16. Cero persistencia · localStorage/sessionStorage/document.cookie sin OTP ni email
17. Cero secretos en logs · console no recibe email completo, OTP ni token
18. Contraseña como alternativa · botón accesible en vista email

**No basadas en regex/source**: uso `render()`, `fireEvent`, `waitFor`, `screen.getByRole`, `screen.getByLabelText`, `screen.queryByLabelText`. La única lectura de source es en `page.behavioral.test.tsx § static oracle` como complemento — el resto renderiza y observa.

## 7 · Integración real OTP → onboarding (evidencia)

`lib/v2/client/otp-onboarding.integration.test.ts` (**2 tests**, verdes 2 rondas):

- **Flujo completo**: `requestOtpEmail` (helper productivo) → correo real en Mailpit (endpoint 54324) → `waitForOtp` extrae 6 dígitos → hash sha256[:12] al log (NUNCA el código en claro) → `verifyOtp` real contra Supabase Auth local → sesión con `access_token` válido → decodifica el JWT y verifica `payload.sub === expectedActorId` (identidad efectiva desde el JWT, no del cliente) → invoca `ONBOARDING_POST(new NextRequest(...))` con `Authorization: Bearer <access_token>` → 200 con `{tenantId, role:"owner", label}` → segunda invocación idéntica devuelve el mismo `tenantId` (idempotencia real) → verificación SQL directa: 1 mapping, 1 tenant con `name = 'workspace.personal.default'`, 1 membership activa → cleanup fixtures.
- **Guarda anti-usurpación**: dos actores independientes con OTP; el token de A crea `tenantId_A` y el token de B crea `tenantId_B` distintos. Verificación SQL: cada mapping pertenece al `sub` correspondiente.

Evidencia observada (redactada): `[otp-onboarding-real] email_hash=f5814c5b7f26 code_hash=dcb95de80a6e`.

## 8 · Resultado de cada escenario

| Escenario Q2-R FASE 2 | Test | Estado |
|---|---|---|
| 1 · render inicial email | otp-form.behavioral test #1 | PASS |
| 2 · OTP inicial en page.tsx | page.behavioral tests #1-#4 + antifraude static oracle | PASS |
| 3 · email inválido + sin SDK call | otp-form.behavioral test #2 + otp-request.test | PASS |
| 4 · normalización `trim().toLowerCase()` | otp-classify.test + otp-request.test | PASS (delegada al helper puro) |
| 5 · shouldCreateUser:true invariante | otp-request.test + antifraude | PASS |
| 6 · transición email→código | otp-form.behavioral #3 | PASS |
| 7 · exactamente 6 dígitos | otp-form.behavioral #4 + onlyDigits.test | PASS |
| 8 · pegado + onlyDigits | otp-form.behavioral #4 | PASS |
| 9 · mensaje opaco unificado | otp-form.behavioral #5 + otp-classify.test | PASS |
| 10 · cooldown UX 60s | otp-form.behavioral #6 (timers reales) | PASS |
| 11 · reenvío bloqueado en cooldown | otp-form.behavioral #6 | PASS |
| 12 · reenvío permitido tras cooldown | otp-form.behavioral #6 | PASS |
| 13 · reenvío invalida visualmente | otp-form.behavioral #7 | PASS |
| 14 · doble clic no genera 2 solicitudes | otp-form.behavioral #8 | PASS |
| 15 · respuesta obsoleta descartada | otp-form.behavioral #9 | PASS |
| 16 · unmount safe | otp-form.behavioral #10 | PASS |
| 17 · cambio a contraseña | otp-form.behavioral #11 + page.behavioral #3 | PASS |
| 18 · regreso a OTP coherente | page.behavioral #4 + otp-form.behavioral #12 | PASS |
| 19 · onAuthenticated tras onboarding OK | otp-form.behavioral #13 + otp-onboarding.integration | PASS |
| 20 · onboarding_error preserva sesión | otp-form.behavioral #14 | PASS |
| 21 · a11y | otp-form.behavioral #15 | PASS |
| 22 · cero persistencia | otp-form.behavioral #16 + antifraude | PASS |
| 23 · cero secretos en logs | otp-form.behavioral #17 + antifraude | PASS |
| 24 · password sigue funcionando | page.behavioral #3 + antifraude + auth-continuity 14/14 | PASS |

## 9 · Custodia inicial y final

**Inicial** (registrada al arrancar Q2-R):
- Contenedores Supabase up (auth, db, kong, inbucket, realtime, rest).
- Cero procesos next/playwright.
- Puertos 3111/3121 free; 54321/54322/54324 BUSY (Docker).

**Final**:
- Mismos containers healthy.
- Puertos 3111/3121 free tras cleanup de runners.
- 54324 (Mailpit) BUSY — heredado de Q2 (config.toml `local_smtp = true`).
- Cero procesos residuales next/playwright.

## 10 · Dos rondas locales

**Ronda 1** (post reset limpio):
- tsc root + engine: PASS
- Engine Vitest: 41 files / 1120 tests PASS
- Client Vitest: 30 files / **355 tests PASS** (318 previos + 37 nuevos Q2-R)
- SQL integration + race Q2-R3: SUITES OK + ALL SCENARIOS PASS
- otp-onboarding.integration (2 tests con handler real): PASS
- auth-continuity 14/14 PASS (21.4s)
- onboarding E2E Q3-R 13/13 PASS (9.5s)

**Ronda 2** confirmatoria:
- Client Vitest: 30 files / 355 tests PASS
- otp-onboarding.integration: 2 tests PASS

Cero flaky, cero skipped inesperados, cero retries. Cero skips nuevos.

## 11 · Skips históricos vs nuevos

- Job A engine (sin `SPABLA_TEST_*`): 63 skips en engine, 61 skips en client — **preexistentes y esperados** (env-based auto-skip que Job B ejecuta con env).
- Job B integration: 0 skips.
- Q2-R **no añade skips**. Los tests OTP corren siempre en Job A (grupo unit) y los `.integration.` corren en Job B con env vars.

## 12 · Riesgos residuales reales

- **Testing Library + React 19 + happy-dom + fake timers**: la interacción de `vi.useFakeTimers()` con el `setInterval` interno del componente contamina tests siguientes cuando el timer no se limpia dentro del scope de fake timers. Q2-R usa **timers reales** con `__cooldownSecondsOverride=1` en el test de cooldown; el trade-off es +1s de wall-clock a cambio de aislamiento.
- **Password path E2E**: los helpers `signInViaUi` (auth-continuity) y `signInAsUserInPage` (onboarding) fueron actualizados para clickar "Acceder con contraseña" antes del formulario. Si un test futuro salta esos helpers y espera `SessionArea` directamente, fallará; norma para futuros contribuidores.
- **Dependencies weight**: `happy-dom` + Testing Library añaden ~30 MB al `node_modules`; sólo se cargan cuando corren los tests `.behavioral.test.tsx`.
- **Ghost users tras OTP**: heredado de Q2 (`shouldCreateUser:true`). No bloqueante para implementación local; cleanup en Cloud es bloqueo de operaciones.

## 13 · Cero producto adicional / cero Q3 / cero promoción

- Cero cambio de handler `/api/v2/onboarding/route.ts`, RPC, migraciones, contrato oficial.
- Cero E2E Chromium nuevo (Q3 sigue pendiente).
- Cero commit adicional post-reporte.
- `main` @ `e6128433...` invariante.
- Oficial @ `957e59f8...` invariante.
- Rama Q2-R aislada, no mergeada, no promocionable.

## 14 · Solicitud de revisión

Solicitud de revisión al jefe de proyecto. Si aprueba, procede promoción a la oficial mediante fast-forward como paso separado con auditoría independiente. **No se promociona en este hito.**
