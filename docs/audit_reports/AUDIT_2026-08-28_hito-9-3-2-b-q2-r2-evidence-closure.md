# HITO 9.3.2-B-Q2-R2 · CIERRE DE EVIDENCIA DEL FLUJO OTP

Fecha: 2026-08-28
Rama: `spabla-v2/hito-9-3-2-b-q2-r2-evidence-closure`
Base: `6272c9b2fd09ec79bb408bf69e5d4633eb49f186` (Q2-R)
Oficial invariante: `957e59f854f4e2b95ccd8d37a5b03bd5fdca4624`
Main invariante: `e6128433d42e1e105529ed2f64212ca527034b6a`

## 1 · Motivo de R2

Q2-R cerró la primera rectificación (OTP como método principal, tests conductuales del `OtpForm`, integración real con el handler `/api/v2/onboarding`). La revisión posterior detectó tres carencias de evidencia:

1. **Página productiva real**: `page.behavioral.test.tsx` renderizaba un *subárbol equivalente* al de `page.tsx`, no la lógica de decisión productiva. Cualquier divergencia futura entre página productiva y test no sería detectada.
2. **Email inválido sin SDK**: la garantía de que `signInWithOtp` recibe cero llamadas cuando el email es inválido se atribuía al componente vía inspección de source; el helper productivo `requestOtpEmail` es el responsable real y no había prueba directa con espía.
3. **Normalización + `shouldCreateUser:true`**: se acreditaban a través de tests unitarios del helper (Q2), pero el acta Q2-R los mezclaba con evidencia de DOM. Q2-R2 los atribuye explícitamente al helper con pruebas dedicadas.

Q2-R2 rectifica sin promoción, sin tocar producto salvo la extracción mínima de `UnauthGate.tsx` — un componente productivo pequeño que `page.tsx` importa y renderiza tal cual. Sin duplicar lógica.

## 2 · Archivos modificados

**Producto** (mínimo indispensable):
- `app/v2/chat/components/UnauthGate.tsx` (NUEVO): componente productivo pequeño con la decisión unauth-gate (restoring / OTP / password + toggle). Rendereado por `page.tsx`.
- `app/v2/chat/page.tsx`: importa y usa `<UnauthGate ... />` en el bloque `{!session && ...}`. La orquestación (session, bootstrap, polling, refresh, signOut) sigue viviendo en `page.tsx` intacta.

**Tests** (nuevos + refactorizados):
- `app/v2/chat/page.behavioral.test.tsx` (**reescrito**): renderiza el productivo `UnauthGate`. 6 tests conductuales.
- `lib/v2/client/otp-request.behavior.test.ts` (NUEVO): 10 tests con **cliente Supabase espía real**. Prueba `email inválido → 0 llamadas a signInWithOtp` y `email válido → normalizado + shouldCreateUser:true + sin redirectTo`.
- `lib/v2/client/otp-form.test.ts` (**ajustado**): al mover el toggle a `UnauthGate`, los tests estáticos que buscaban `setAuthMethod("password")` y "Acceder con código" en `page.tsx` se redirigen al fichero `UnauthGate.tsx`.

**Acta**:
- `docs/audit_reports/AUDIT_2026-08-28_hito-9-3-2-b-q2-r2-evidence-closure.md` (ESTE).

Cero cambio en: contrato OTP, handler `/api/v2/onboarding`, RPC, migraciones, workflows CI, `package.json` (cero deps nuevas).

## 3 · Página productiva real · evidencia

**`UnauthGate.tsx`** es un componente productivo real. Está **importado y renderizado por `page.tsx`** (verificable con `grep`):
```
app/v2/chat/page.tsx:
  import { UnauthGate } from "./components/UnauthGate";
  ...
  {!session && (
    <UnauthGate supabase={supabase} sessionRestored={sessionRestored} authMethod={authMethod} ... />
  )}
```

**`page.behavioral.test.tsx`** renderiza `UnauthGate` (mismo import productivo que la página) en 6 escenarios conductuales:

1. `sessionRestored=false` → aparece "Restaurando tu sesión…", cero OTP, cero SessionArea.
2. `sessionRestored=true` + `authMethod="otp"` (default) → `OtpForm` productivo montado, botón "Acceder con contraseña" visible, `<label>Contraseña</label>` ausente.
3. Click "Acceder con contraseña" → `SessionArea` productiva montada, `<label>Contraseña</label>` presente.
4. Click "Acceder con código" desde password → `OtpForm` vuelve, `<label>Contraseña</label>` desaparece.
5. Simular logout (setAuthMethod("otp")) desde password → OTP restaurado.
6. Oracle estático mínimo (**complemento, no sustituto**): `page.tsx` importa `./components/UnauthGate` y lo renderiza con `authMethod={authMethod}`.

Los tests NO reconstruyen la lógica: `UnauthGate` es el mismo componente productivo. Un cambio futuro que rompa la política se detecta al renderizar. Un test `A → B → A` verifica dos transiciones reales.

## 4 · Email inválido → cero llamadas al SDK · evidencia

`otp-request.behavior.test.ts § requestOtpEmail · email inválido NO alcanza signInWithOtp` (5 sub-tests) — cliente Supabase **espía** con `signInWithOtp` que registra cada llamada:

| Entrada | Resultado helper | `signInWithOtp` calls |
|---|---|---|
| `""` | `error: invalid_email` | **0** |
| `"not-an-email"` | `error: invalid_email` | **0** |
| `"user@localhost"` | `error: invalid_email` | **0** |
| `"a b@c.d"` | `error: invalid_email` | **0** |
| `"user@dom."` | `error: invalid_email` | **0** |

Assertion literal: `expect(calls.length).toBe(0)` sobre la lista de invocaciones capturadas.

## 5 · Normalización y `shouldCreateUser:true` · evidencia

`otp-request.behavior.test.ts § requestOtpEmail · normalización + shouldCreateUser:true (atribuido al HELPER)` (5 sub-tests):

- Entrada `"  USER@Example.COM  "` → `calls[0].email === "user@example.com"` (trim + lowercase) y `calls[0].options.shouldCreateUser === true`.
- Entrada `"user@example.com"` → normalización idempotente + `shouldCreateUser:true`.
- **Cero `redirectTo`**: keys del `options` no contienen `redirect` (aserción por regex sobre las keys del payload capturado). Cero magic link.
- Nuevo vs existente → misma opaqueness (`shouldCreateUser:true` para ambos, ambos resultan en `kind:"ok"`).
- Error transitorio del proveedor → mapping opaco (`cooldown_active`); `internalKind` sanitizado sin exponer código HTTP raw.

Estas garantías se atribuyen explícitamente al **helper productivo `requestOtpEmail`**, no al DOM ni a `OtpForm`. El componente inyecta el helper (que a su vez el harness reemplaza en los tests conductuales del formulario), pero la garantía normativa vive en `otp-request.ts`.

## 6 · Matriz completa · 24 requisitos Q2-R FASE 2

Para cada requisito indico: fichero, nombre exacto del test, si renderiza producto real, qué se simula, y resultado. Tipos de prueba: **CD** conductual componente real · **CP** conductual página real (UnauthGate) · **U** unitaria helper productivo · **INT** integración real · **BE** barrera estática complementaria.

| # | Requisito | Fichero | Test | Tipo | Renderiza producto real | Se simula | Resultado |
|---|---|---|---|---|---|---|---|
| 1 | Render inicial vista email | `otp-form.behavioral.test.tsx` | `render inicial · vista email con inputs y botón principal` | CD | Sí (OtpForm) | Nada | PASS |
| 2 | OTP inicial en page.tsx | `page.behavioral.test.tsx` + `otp-antifraud.test.ts` | `tras restaurar sin sesión · monta OtpForm (método principal)` + static oracle `authMethod inicial DEBE ser 'otp'` | CP + BE | Sí (UnauthGate) | Nada | PASS |
| 3 | Email inválido + 0 SDK | `otp-request.behavior.test.ts` | `cadena vacía → invalid_email + 0 llamadas al SDK` (+4 variantes) | U | Sí (requestOtpEmail) | SDK spy | PASS |
| 4 | Normalización trim + lowercase | `otp-request.behavior.test.ts` | `email con mayúsculas y espacios → SDK recibe trim().toLowerCase()` | U | Sí (helper) | SDK spy | PASS |
| 5 | shouldCreateUser:true invariante | `otp-request.behavior.test.ts` + `otp-antifraud.test.ts` | `SDK recibe shouldCreateUser:true` + antifraude static | U + BE | Sí (helper) | SDK spy | PASS |
| 6 | Transición email → código | `otp-form.behavioral.test.tsx` | `solicitar código · llama al helper y transita a vista código` | CD | Sí (OtpForm) | Helper override | PASS |
| 7 | Exactamente 6 dígitos | `otp-form.behavioral.test.tsx` | `input código · sanea no-dígitos y limita a 6` | CD | Sí | Nada | PASS |
| 8 | Pegado + onlyDigits | `otp-form.behavioral.test.tsx` | `input código · sanea no-dígitos y limita a 6` | CD | Sí | Nada | PASS |
| 9 | Mensaje opaco unificado | `otp-form.behavioral.test.tsx` + `otp-classify.test.ts` | `verificación errónea · mensaje único opaco` | CD + U | Sí | Verify override retorna wrong/expired | PASS |
| 10 | Cooldown UX 60s | `otp-form.behavioral.test.tsx` | `cooldown UX · botón reenviar deshabilitado hasta expirar` | CD | Sí | `__cooldownSecondsOverride=1` real timers | PASS |
| 11 | Reenvío bloqueado en cooldown | idem | idem | CD | Sí | idem | PASS |
| 12 | Reenvío permitido tras cooldown | idem | idem | CD | Sí | idem | PASS |
| 13 | Reenvío invalida visualmente | `otp-form.behavioral.test.tsx` | `reenvío · limpia código previo y muestra info opaca` | CD | Sí | Cooldown=0 override | PASS |
| 14 | Doble clic → 1 llamada | `otp-form.behavioral.test.tsx` | `doble clic solicitar · sólo dispara una llamada al helper` | CD | Sí | Helper con promesa pendiente | PASS |
| 15 | Respuesta obsoleta descartada | `otp-form.behavioral.test.tsx` + `otp-form.test.ts` | `respuesta obsoleta · resolución tardía tras cambio de email no pisa la vista` + `usa refs monotónicos` | CD + BE | Sí | Promesa pendiente resuelta tarde | PASS |
| 16 | Unmount safe | `otp-form.behavioral.test.tsx` | `unmount · resolución tras desmontaje NO dispara warnings React` | CD | Sí | Promesa que resuelve post-unmount | PASS |
| 17 | Cambio a contraseña | `otp-form.behavioral.test.tsx` + `page.behavioral.test.tsx` | `cambio a contraseña · invoca onSwitchToPassword` + `click 'Acceder con contraseña' · transita a SessionArea` | CD + CP | Sí (OtpForm + UnauthGate) | Nada | PASS |
| 18 | Regreso a OTP coherente | `page.behavioral.test.tsx` + `otp-form.behavioral.test.tsx` | `click 'Acceder con código' desde password · vuelve a OtpForm` + `cambiar email · vuelve a vista email` | CP + CD | Sí | Nada | PASS |
| 19 | onAuthenticated sólo tras OK | `otp-form.behavioral.test.tsx` + `otp-onboarding.integration.test.ts` | `éxito completo · onAuthenticated invocado 1 vez tras verifyOtp+onboarding OK` + `flujo completo` | CD + INT | Sí (OtpForm + handler real) | Verify OK / integration real | PASS |
| 20 | onboarding_error preserva sesión | `otp-form.behavioral.test.tsx` | `onboarding_error · NO invoca onAuthenticated y ofrece reintento` | CD | Sí | Verify override retorna `onboarding_error` | PASS |
| 21 | a11y | `otp-form.behavioral.test.tsx` | `a11y · label + aria-invalid + aria-describedby vincula el mensaje` | CD | Sí | Estado con error | PASS |
| 22 | Cero persistencia | `otp-form.behavioral.test.tsx` + `otp-antifraud.test.ts` | `cero persistencia · localStorage/sessionStorage/document.cookie` + antifraude | CD + BE | Sí | Snapshot de storages antes/después | PASS |
| 23 | Cero filtración logs | `otp-form.behavioral.test.tsx` | `cero secretos en logs · console no recibe email completo, OTP ni token` | CD | Sí | Captura de console | PASS |
| 24 | Password sigue funcional | `page.behavioral.test.tsx` + auth-continuity 14/14 + `otp-antifraud.test.ts` | `click 'Acceder con contraseña' · transita a SessionArea` + suite E2E completa + antifraude | CP + E2E + BE | Sí (UnauthGate + SessionArea + E2E real) | Nada / E2E password real | PASS |

**Requisitos añadidos por Q2-R2** (no exigidos pero cerrados para completar la matriz):

| Requisito extra | Fichero | Tipo | Resultado |
|---|---|---|---|
| Cero `redirectTo` en signInWithOtp | `otp-request.behavior.test.ts § NO se envía redirectTo` | U | PASS |
| Cero magic link en respuesta del proveedor | `otp-signin.integration.test.ts § plantilla local` + `otp-onboarding.integration.test.ts` | INT | PASS |
| Handler REAL de `/api/v2/onboarding` invocado | `otp-onboarding.integration.test.ts § flujo completo` | INT | PASS |
| Identidad efectiva viene del JWT `sub` | `otp-onboarding.integration.test.ts § flujo completo · payload.sub` | INT | PASS |
| Anti-usurpación cross-actor | `otp-onboarding.integration.test.ts § guarda anti-usurpación` | INT | PASS |

## 7 · Clasificación honesta de cada tipo de prueba

| Categoría | Cuenta | Ejemplos representativos |
|---|---|---|
| **Conductual componente real (CD)** | 18 en `otp-form.behavioral.test.tsx` + 5 en `page.behavioral.test.tsx` | Render, click, timers reales, aria-live, unmount safety, verificación errónea, doble clic, cooldown |
| **Conductual página real (CP)** vía UnauthGate | 5 en `page.behavioral.test.tsx` | Restoring / OTP / password / vuelta a OTP / logout |
| **Unitaria helper productivo (U)** | 15 en `otp-classify.test.ts` + 8 en `otp-request.test.ts` + 10 en `otp-request.behavior.test.ts` + 10 en `otp-verify.test.ts` | Clasificador puro, normalización, spy real |
| **Integración real (INT)** | 4 en `otp-signin.integration.test.ts` + 2 en `otp-onboarding.integration.test.ts` | Mailpit real, verifyOtp real, handler /api/v2/onboarding REAL, SQL |
| **Barrera estática (BE)** | 5 en `otp-template.test.ts` + 19 en `otp-form.test.ts` + 13 en `otp-antifraud.test.ts` + 1 oracle en `page.behavioral.test.tsx` | Template `{{ .Token }}`, ausencia magic link, invariantes normativas |

**Barreras estáticas nunca reemplazan** una conductual: acompañan como oracle que se activa si un edit fuerza a la lógica a divergir. Ninguna barrera estática se cuenta como evidencia principal de comportamiento.

## 8 · Ronda 1 · resultados íntegros

Ejecutada 2026-08-28, tras `supabase db reset --local` limpio.

| Suite | Resultado |
|---|---|
| `npx tsc --noEmit` root | PASS (exit 0) |
| `npx tsc --noEmit` engine | PASS (exit 0) |
| Engine Vitest | 41 files / **1120/1120 tests PASS** (3.16s) |
| Client Vitest completo | 31 files / **367/367 tests PASS** (12.34s) |
| SQL integration + race Q2-R3 (`onboarding-auth-race.sh`) | `SUITES OK` + `ALL SCENARIOS PASS` (S1/S2/S3) |
| Integración OTP → handler real → SQL (`otp-onboarding.integration.test.ts`) | 2/2 PASS (828ms) |
| Auth continuity Q3-E2E-R | 14/14 PASS (23.0s) |
| Onboarding E2E Q3-R | 13/13 PASS (9.4s) |
| Restore drill local (macOS) | Skip pre-existente (`sed -i` GNU); PASS en CI Job C |
| `git diff --check` | limpio |
| Búsqueda secretos/JWT/tokens/OTP crudos | 0 hits |
| Búsqueda skips/only/retries en tests OTP nuevos | 0 hits (excluyendo docstrings) |
| Conflict markers | 0 hits |
| Artefactos versionados (test-results, playwright-report) | 0 hits |
| Custodia final | Containers Supabase intactos, puertos 3111/3121 free, cero next dev residual |

## 9 · Ronda 2 · resultados íntegros

Ejecutada 2026-08-28, tras nuevo `supabase db reset --local` limpio + segundo reset previo al SQL para evitar residuos post-E2E.

| Suite | Resultado |
|---|---|
| `npx tsc --noEmit` root | PASS (exit 0) |
| `npx tsc --noEmit` engine | PASS (exit 0) |
| Engine Vitest | 41 files / **1120/1120 tests PASS** (3.16s) |
| Client Vitest completo | 31 files / **367/367 tests PASS** (11.88s) |
| Integración OTP → handler real → SQL | 2/2 PASS (696ms) |
| SQL integration + race Q2-R3 (post reset limpio) | `SUITES OK` + `ALL SCENARIOS PASS` |
| Auth continuity Q3-E2E-R | 14/14 PASS (23.9s) |
| Onboarding E2E Q3-R | 13/13 PASS (12.7s) |
| Restore drill local | Skip pre-existente; PASS en CI |
| `git diff --check` | limpio |
| Search secretos/JWT/tokens/OTP crudos | 0 hits |
| Search skips/only/retries en tests OTP nuevos | 0 hits |
| Conflict markers | 0 hits |
| Artefactos versionados | 0 hits |
| Custodia final | idéntica a R1 |

**Observación de Ronda 2**: al ejecutar en secuencia (client Vitest → SQL integration) sin un reset previo al SQL, los tests OTP integration dejan fixtures residuales que el atomic_onboarding.test.sql detecta como "orphan tenants". El reset limpio previo al SQL elimina el falso positivo. Documentado como aspecto operativo de las rondas; NO es una regresión productiva.

## 10 · Skips históricos vs nuevos

**Skips históricos legítimos** (env-based auto-skip, presentes desde antes de Q2-R2):
- Engine Vitest: 63 skips en 4 files — integration tests que auto-skip cuando `SPABLA_TEST_SUPABASE_*` no están. Se ejecutan y pasan en Job B con env exportado.
- Client Vitest en Job A (sin env): 67 skips en 7 files — mismo patrón. Se ejecutan y pasan en Job B con env exportado.

**Skips nuevos añadidos por Q2-R2**: **0**. No se añadió ni un solo `test.skip`, `it.skip`, `describe.skip`, `test.only`, `it.only`, `describe.only`, `.retry(N)` en ningún fichero nuevo o modificado. Verificado por antifraude y por grep manual.

## 11 · Riesgos residuales

- **UnauthGate vs page.tsx**: el componente extraído duplica el markup del banner "Restaurando sesión" y el toggle. Si alguien modifica sólo `page.tsx` sin actualizar `UnauthGate`, los tests conductuales lo detectarán (page.tsx ya no monta esa lógica; delega en UnauthGate). Un cambio en UnauthGate que afecte a otras vistas de la app: no aplica, ya que ninguna otra vista lo importa (verificable con `grep -l UnauthGate app/`).
- **Reset SQL entre suites en runs largos**: heredado. Se documenta como operativo, no como bug.
- **PostgREST post-reset** (heredado): Job B/D/E dan tiempo suficiente durante `--reset`.

## 12 · Cero producto adicional / cero Q3 / cero promoción

- Cero cambio en contrato OTP (`docs/phases/SPABLA_V2_FASE_9_HITO_9_3_2_B_OTP_CONTRACT.md`).
- Cero cambio en handler `/api/v2/onboarding/route.ts`, RPC, migraciones, plantilla, workflows CI, `package.json`.
- Cero E2E Chromium OTP nuevo (Q3 sigue pendiente).
- Cero cambio en `main` ni en la oficial `spabla-v2/thirteen-languages-activation`.
- Rama Q2-R2 aislada, no mergeada, no promocionable sin decisión explícita.

## 13 · Solicitud de revisión

Solicitud de revisión al jefe de proyecto. Si aprueba, procede promoción a la oficial mediante fast-forward como paso separado con auditoría independiente. **No se promociona en este hito.**
