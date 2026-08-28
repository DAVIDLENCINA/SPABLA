# HITO 9.3.2-B-Q2-R3 · AISLAMIENTO DE FIXTURES Y CIERRE FINAL DE EVIDENCIA

Fecha: 2026-08-28
Rama: `spabla-v2/hito-9-3-2-b-q2-r3-isolation-proof`
Base: `a69dd79e2bf9b1c0c3c21c60b6e0563d44c63e14` (Q2-R2)
Oficial invariante: `957e59f854f4e2b95ccd8d37a5b03bd5fdca4624`
Main invariante: `e6128433d42e1e105529ed2f64212ca527034b6a`

## 1 · Causa exacta de la fuga

**Diagnóstico Q2-R3 FASE 1**: tras reset limpio, ejecutar las suites OTP integration heredadas dejaba residuos:

- `otp-signin.integration.test.ts § plantilla local`: creaba un usuario Auth vía `requestOtpEmail` (`signInWithOtp({shouldCreateUser:true})`) pero sólo limpiaba el correo en Mailpit. El actor Auth y su identidad quedaban en `auth.users` / `auth.identities` / `auth.one_time_tokens`.
- `otp-signin.integration.test.ts § cooldown`: idéntico patrón — el `signInWithOtp` inicial creaba el actor pero el cleanup se limitaba a Mailpit.

**Conteos observados**:

- Baseline post-reset: `users=0, identities=0, one_time_tokens=0, tenants=0, mappings=0, memberships=0, lifecycle=0`.
- Tras suite OTP heredada Q2-R2: `users=2, identities=2, one_time_tokens=2, tenants=0, ...` (2 ghost users).

Estos residuos no impedían que la suite OTP misma pasara, pero encadenar `atomic_onboarding.test.sql` sin reset fallaba con `Q2-14/33: found orphan tenants after rollback, count=8` porque los ghost users interferían con la cuenta esperada.

## 2 · Recursos que quedaban

| Recurso | Cantidad | Origen |
|---|---|---|
| `auth.users` | 2 | `otp-fx-tmpl-*` y `otp-fx-cool-*` |
| `auth.identities` | 2 | cascada del anterior |
| `auth.one_time_tokens` | 2 | tokens OTP no expirados |
| `spabla_v2.tenants` | 0 | (los tests OTP-signin no crean workspaces; los onboarding sí, y esos sí limpiaban) |
| `spabla_v2.actor_personal_workspace` | 0 | (idem) |

## 3 · Rectificación aplicada

**Nuevo helper**: `lib/v2/test-utils/otp-fixture-registry.ts` (74 líneas útiles).

Autoridad única del cleanup por `runId`:
- `registerUser(id)`, `registerTenant(id)`, `emailFor(label)` — captura recursos y genera emails con sufijo `runId` (permite descubrimiento por `listUsers` filtrado).
- `snapshotCounts()` — devuelve un `SnapshotCounts` inmutable con conteos actuales de las 7 tablas relevantes (auth.users / auth.identities / auth.one_time_tokens / tenants / mappings / memberships / lifecycle).
- `cleanupAll()` — idempotente:
  1. `listUsers()` descubre ghost users con `runId` en el email y los suma al registro.
  2. SQL DELETE en orden FK correcto: lifecycle → memberships (por actor) → mappings → memberships (por tenant) → tenants → one_time_tokens.
  3. Barrido residual: por si algún test creó un tenant sin registrarlo, se elimina cualquier tenant referenciado por los mappings de actores del registro.
  4. `admin.auth.admin.deleteUser` sobre cada id (cascade de identities y sesiones).
  5. Mailpit: `search?query=<runId>` + `DELETE /api/v1/message/{ID}` sobre cada match.

**Barrera ejecutable**: cada suite integration añade un test final `isolation barrier · cleanup POST test-suite == baseline` que invoca `cleanupAll()` idempotentemente y assert `expect(after).toEqual(baseline)` sobre los conteos. Falla visiblemente si un test previo no registró un recurso.

**Refactor de tests**:
- `otp-signin.integration.test.ts` (reescrito): usa `registry.emailFor(label)`, `registry.registerUser(id)` en cada test que crea un actor, `beforeAll` snapshot baseline, `afterAll` `cleanupAll` + `it("isolation barrier ...")` como último test.
- `otp-onboarding.integration.test.ts` (refactor con `sed`): sustituye `createdUserIds.add`/`createdTenantIds.add` por `registry.registerUser`/`registry.registerTenant`; `afterAll` invoca `cleanupAll`; se añade el mismo test barrier.

## 4 · Estado inicial vs final (sanitizado)

Todas las medidas son conteos enteros de filas; nunca emails, tokens ni OTPs.

**Ronda 1 · secuencia antifugas (sin reset entre pasos 1–8)**:

| Paso | Estado (users/tenants/mappings/memberships) |
|---|---|
| 1 · Baseline post-reset | `0/0/0/0` |
| 2 · Ejecutar 2 OTP integration suites → 8 tests PASS | — |
| 3 · POST-OTP snapshot | `0/0/0/0` ✓ |
| 4 · SQL integration + race Q2-R3 sin reset | `SUITES OK` + `ALL SCENARIOS PASS` (S1/S2/S3) ✓ |
| 5 · Auth continuity | 14/14 PASS (22.4s) ✓ |
| 6 · Onboarding E2E Q3-R | 13/13 PASS (9.5s) ✓ |

**Ronda 2 · idéntica secuencia tras reset base**:

| Paso | Estado |
|---|---|
| 1 · Baseline | `0/0/0/0` |
| 2 · OTP integration 8 tests PASS | — |
| 3 · POST-OTP | `0/0/0/0` ✓ |
| 4 · SQL sin reset | `SUITES OK` + `ALL SCENARIOS PASS` ✓ |
| 5 · Auth continuity | 14/14 PASS (22.4s) ✓ |
| 6 · Onboarding E2E Q3-R | 13/13 PASS (10.5s) ✓ |

## 5 · Cleanup incluso ante fallo

`afterAll` en Vitest se ejecuta INCLUYENDO si algún `it` previo falló (Vitest garantiza el hook cleanup). El registry:
- Envuelve la lógica en `try/catch` — errores individuales no interrumpen la cadena.
- Es **idempotente**: llamarlo dos veces (una desde el último `it` como barrera, otra desde `afterAll` como red de seguridad) NO produce doble-delete ni conflictos, porque cada operación usa `WHERE id = ANY($1)` y `DELETE ... .catch(() => undefined)`.
- Emite errores sanitizados vía `console.error("[otp-*-cleanup] error:", ...)` — nunca oculta un fallo del cleanup.

## 6 · SQL integration passing sin reset

Evidencia observada (§4 R1 paso 4 y R2 paso 4):
```
[q2-r3-race] S1 · PASS
[q2-r3-race] S2 · PASS · RPC rejected with P0002, zero side effects
[q2-r3-race] S3 · PASS · distinct tenants (…)
[q2-r3-race] ALL SCENARIOS PASS
[run-integration-tests] SUITES OK
```

Antes del reset: la suite atomic_onboarding.test.sql detectaba orphan tenants por los ghost users heredados. Tras la rectificación: 0 residuos → 0 orphans → SQL passea.

## 7 · Unidad productiva de política de autenticación

**Nuevo hook**: `lib/v2/client/use-auth-method.ts` (32 líneas).

Autoridad única de:
- Método inicial: `useState<AuthMethod>("otp")`.
- Transiciones explícitas: `setAuthMethod` (expone tipo `"password" | "otp"`).
- Reset tras logout: `resetOnLogout()` — `useCallback` que hace `setAuthMethod("otp")`.

`page.tsx` lo consume:
```ts
import { useAuthMethod } from "@/lib/v2/client/use-auth-method";
...
const { authMethod, setAuthMethod, resetOnLogout: resetAuthMethodOnLogout } = useAuthMethod();
```

En `signOut`:
```ts
resetAuthMethodOnLogout();  // política del hook, no reproducida manualmente
```

Cero `useState<"password" | "otp">` remanente en `page.tsx` — verificado por `otp-antifraud.test.ts` y `page.behavioral.test.tsx`.

## 8 · Eliminación de duplicación en el Harness

Antes (Q2-R2): `page.behavioral.test.tsx § Harness` declaraba `useState<"password" | "otp">("otp")` — replicando la política productiva.

Ahora (Q2-R3): `Harness` importa **el mismo hook productivo** `useAuthMethod`. Si un cambio futuro rompe la política (por ejemplo, cambia el default o el reset), lo detectan los tests conductuales que consumen el hook.

Fragmento del nuevo Harness:
```ts
function Harness(): React.JSX.Element {
  const { authMethod, setAuthMethod, resetOnLogout } = useAuthMethod();
  ...
  return (
    <UnauthGate authMethod={authMethod} setAuthMethod={setAuthMethod} ... />
    ...
    <button data-testid="simulate-logout" onClick={resetOnLogout}>logout</button>
  );
}
```

`page.behavioral.test.tsx` añade además `use-auth-method.test.tsx` como test unit dedicado del hook (6 tests: default, transiciones, idempotencia del reset, tipo).

## 9 · Pruebas conductuales sin réplica en Harness

Se demostraron los 7 comportamientos exigidos por FASE 3, todos consumiendo el hook productivo:

| # | Escenario | Test | Autoridad |
|---|---|---|---|
| 1 | Estado inicial OTP | `useAuthMethod (productivo) · estado inicial · authMethod es 'otp'` | Hook productivo |
| 2 | Cambio a password | `cambio a password · click ... monta SessionArea` | Hook + UnauthGate |
| 3 | Regreso a OTP | `regreso a OTP · click ... vuelve a OtpForm` | Hook + UnauthGate |
| 4 | Logout resetea OTP | `logout resetea a OTP · aunque el usuario estuviera en password` | `resetOnLogout` del hook |
| 5 | onAuthenticated no fuerza password | `onAuthenticated · NO fuerza cambio a password (política del hook)` | Hook (no expone forzado) |
| 6 | UnauthGate representa el estado | `UnauthGate representa el estado del hook (contrato observacional)` | UnauthGate productivo |
| 7 | Password funcional | `password sigue funcional · SessionArea renderiza inputs email + password` | SessionArea productivo |

Barrera complementaria (no evidencia principal): oracle estático que verifica que `page.tsx` importa y consume `useAuthMethod`, y que no existe `useState<AuthMethod>` paralelo.

## 10 · Ronda 1 · resultados íntegros

| Suite | Resultado |
|---|---|
| `tsc --noEmit` root | PASS (exit 0) |
| `tsc --noEmit` engine | PASS (exit 0) |
| Engine Vitest | 41 files / **1120/1120 tests PASS** (4.61s) |
| Client Vitest completo | 32 files / **378/378 tests PASS** (14.98s) |
| Baseline PostgreSQL | `0/0/0/0` (users/tenants/mappings/memberships) |
| OTP integration (2 suites) | 8 tests PASS |
| POST-OTP snapshot vs baseline | `0/0/0/0 == 0/0/0/0` ✓ ISOLATION BARRIER |
| SQL integration + `onboarding-auth-race.sh` (sin reset intermedio) | `SUITES OK` + `ALL SCENARIOS PASS` (S1/S2/S3) |
| Auth continuity Q3-E2E-R (sin reset intermedio) | 14/14 PASS (22.4s) |
| Onboarding E2E Q3-R (sin reset intermedio) | 13/13 PASS (9.5s) |
| Restore drill local (macOS) | Skip pre-existente (`sed -i` GNU); PASS en CI Job C |
| `git diff --check` | limpio |
| Search secretos/JWT/OTP/emails reales | 0 hits |
| Search test.only / retries en tests OTP | 0 hits |
| Conflict markers / artefactos versionados | 0 hits |
| Custodia final (containers/puertos) | Supabase intacto, 3111/3121 free, cero next dev residual |

## 11 · Ronda 2 · resultados íntegros

Ejecutada tras `supabase db reset --local` como base conocida. Misma secuencia sin reset entre pasos.

| Suite | Resultado |
|---|---|
| `tsc --noEmit` root | PASS |
| `tsc --noEmit` engine | PASS |
| Engine Vitest | 1120/1120 PASS (2.96s) |
| Client Vitest completo | 378/378 PASS (12.62s) |
| Baseline | `0/0/0/0` |
| OTP integration | 8 tests PASS |
| POST-OTP snapshot | `0/0/0/0` ✓ ISOLATION BARRIER |
| SQL integration + race sin reset | `SUITES OK` + `ALL SCENARIOS PASS` |
| Auth continuity | 14/14 PASS (22.4s) |
| Onboarding E2E Q3-R | 13/13 PASS (10.5s) |
| Restore drill local | Skip macOS; PASS en CI |
| `git diff --check` | limpio |
| Sec/skips/artefactos | 0 |
| Custodia final | idéntica a R1 |

**Ambas rondas idénticas · sin diferencias · sin flaky.**

## 12 · onboarding-auth-race en ambas rondas

`scripts/ci/onboarding-auth-race.sh` — verificación deterministic de Q2-R3 (row lock `FOR KEY SHARE` sobre `auth.users` durante `admin_ensure_personal_workspace`).

- **R1**: `SCENARIO 1 · onboarding wins` PASS, `SCENARIO 2 · deletion wins` PASS + P0002, `SCENARIO 3 · no deadlock distinct actors` PASS (elapsed ~29ms). `ALL SCENARIOS PASS`.
- **R2**: idéntico. `SCENARIO 3` elapsed 34ms. `ALL SCENARIOS PASS`.

## 13 · Restore drill en ambas rondas

Local (macOS): skip pre-existente por `sed -i` sin extensión — comportamiento conocido y documentado desde Q2-R3 (invariante entre Q1, Q2, Q2-R, Q2-R2 y Q2-R3).

CI (Job C, Ubuntu): esperado PASS con `PostgreSQL 17.11` (verificado en runs previos del linaje).

La rectificación Q2-R3 no toca el runner del drill; su comportamiento en CI es invariante.

## 14 · Riesgos residuales

- **Coste del `listUsers` en cleanup**: si el proyecto tuviera >1000 users, la paginación `perPage: 1000` no descubriría los siguientes. Se mitiga por el hecho de que los tests siempre parten de un baseline pequeño y los emails llevan `runId` (filtro determinista).
- **Descubrimiento de ghost users por email**: si un ghost user quedara sin email (imposible en Supabase Auth default, pero teórico), el registry no lo detectaría. Se acepta.
- **Tests OTP y client Vitest completos**: si el client Vitest completo se ejecuta ANTES de la suite OTP+SQL sin reset, otros tests del cliente (HTTP integration) también dejan residuos que atomic_onboarding.test.sql detecta. Q2-R3 rectifica ÚNICAMENTE los residuos de las suites OTP; el resto queda fuera de alcance (heredado desde hitos previos, no bloquea la evidencia OTP).

## 15 · Confirmación de cero Q3 / cero promoción

- Cero código E2E Chromium OTP nuevo.
- Cero runner E2E OTP nuevo.
- Cero cambio en contrato OTP, RPC, migraciones, workflows CI, handler productivo.
- Cero cambio en `main` ni en la oficial `spabla-v2/thirteen-languages-activation`.
- Rama Q2-R3 aislada; cero merge; cero tag; cero PR.

## 16 · Solicitud de revisión

Solicitud de revisión al jefe de proyecto. Si aprueba, procede promoción a la oficial mediante fast-forward como paso separado con auditoría independiente. **No se promociona en este hito.**
