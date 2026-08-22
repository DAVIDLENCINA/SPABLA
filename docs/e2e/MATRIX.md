# SPABLA V2 · Hito 9.3.1-Q3-E2E · Matriz 13/13 — auth continuity

Cada fila mapea uno de los escenarios contractuales de Q2 §20 al test
Playwright que lo automatiza sobre Chromium real. Los identificadores
1..11, 12A, 12B **se conservan literalmente** desde Q2 §20; el total
contractual es 13 = 11 + 12A + 12B (no existe un escenario 13 textual
separado en la tabla del contrato — 12A y 12B son las dos variantes
que completan la barrera).

| Q2 §20 | Escenario                    | Archivo Playwright                       | Fixture / usuario         | Contexto navegador         | Preparación                                                    | Acción                                                                            | Resultado observable                                                                        | Evidencia sanitizada                                                                          | Limpieza                                          |
|--------|------------------------------|------------------------------------------|---------------------------|----------------------------|----------------------------------------------------------------|-----------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------|---------------------------------------------------|
| 1      | Login inicial                | `e2e/auth-continuity.spec.ts`            | Usuario A + membership A  | contexto fresco            | tenant A + membership + conversación creados por fixture       | rellenar formulario `#spabla-session-email` + `#spabla-session-password`, submit  | header conversación visible; `Cuenta autenticada` chip presente                             | screenshot only-on-failure; no volcado de tokens; storageKey presente sin exponer valor      | contexto cerrado                                  |
| 2      | Recarga                      | idem                                     | Usuario A                 | contexto fresco            | escenario 1 completado dentro del mismo test                    | `page.reload()`                                                                    | header conversación vuelve a visible; sin formulario de login                                | screenshot only-on-failure                                                                    | contexto cerrado                                  |
| 3      | Cierre / reapertura pestaña  | idem                                     | Usuario A                 | `chromium.launchPersistentContext(userDataDir)` real | tmp `userDataDir` creado con `mkdtempSync`; login en ctx1     | `ctx1.close()`; relaunch `chromium.launchPersistentContext` con el MISMO `userDataDir` | ctx2 entra directo sin formulario; ContextReady                                              | `userDataDir` gitignored y eliminado en afterAll; no se imprime su contenido                    | `rmSync(userDataDir, {recursive:true})` en afterAll |
| 4      | Segunda pestaña simultánea   | idem                                     | Usuario A                 | mismo contexto, dos páginas | login en pageA                                                  | `context.newPage()` → `goto('/v2/chat')`                                          | ambas páginas alcanzan header conversación                                                  | screenshot only-on-failure                                                                    | ambas páginas cerradas                            |
| 5      | Dos pestañas concurrentes    | idem                                     | Usuario A                 | mismo contexto, dos páginas | login en pageA + newPage; forzar `access_token` caducado en storage | disparar polling concurrente en ambas (`page.evaluate` + reload orquestado)     | ninguna transita a Expired; refresh silencioso; ambas siguen operables                      | contador de refresh (network filter) sin registrar tokens                                     | páginas cerradas                                  |
| 6      | Reinicio Next REAL           | idem (ejecutado al final de la serie)    | Usuario A                 | contexto dedicado          | login en pageA sobre puerto `SPABLA_E2E_NEXT_PORT` (3111)       | `process.kill(-SPABLA_E2E_NEXT_WRAPPER_PID, SIGTERM/SIGKILL)` + `process.kill(pidFromPort(3111), SIGKILL)` → `spawnNextDev(3111)` con `detached:true`; PID real via `lsof -t` | 1) `pidAlive(oldListener) === false`; 2) `portOpen(3111) === false`; 3) `restarted.pid !== oldListener`; 4) `portOpen(3111) === true`; 5) `page.reload()` restaura ContextReady sin login | logs `next.stdout/stderr` sólo en fallo; ningún token capturado | `killNextDev(restarted)` en afterAll |
| 7      | Access token caducado        | idem                                     | Usuario A                 | contexto único             | login en pageA                                                  | mutar `access_token` a JWT caducado válidamente firmado (page.evaluate)          | siguiente `/api/v2/messages` dispara refresh silencioso + retry 200                         | no capturar tokens; solo status codes                                                          | ninguno                                           |
| 8      | Fallo transitorio            | idem                                     | Usuario A                 | contexto único             | login en pageA                                                  | `page.route('**/api/v2/messages*', route=>route.abort('failed'))` un solo tick   | UI muestra estado transitorio; storageKey de sesión intacto; sin transición a Expired      | sin capturar bodies                                                                            | route unroute                                     |
| 9      | 401 recuperable              | idem                                     | Usuario A                 | contexto único             | login en pageA                                                  | interceptar un único `/api/v2/messages*` con 401                                  | refresh + retry → 200; sesión intacta                                                       | sin capturar tokens                                                                            | route unroute                                     |
| 10     | 401 irrecuperable            | idem                                     | Usuario A                 | contexto único             | login en pageA                                                  | interceptar `/auth/v1/token?grant_type=refresh_token` con 400 `invalid_grant`      | recovery destructiva; formulario de sign-in con banner Expired                              | sin capturar tokens                                                                            | route unroute                                     |
| 11     | Bootstrap ausente            | idem                                     | Usuario C (sin membership)| contexto fresco            | usuario C creado por fixture sin membership                     | login con C                                                                        | `canOperate=false`; mensaje "Todavía no tienes contexto asignado…" (o equivalente); NO login | screenshot only-on-failure                                                                     | contexto cerrado                                  |
| 12A    | signOut REAL mismo BrowserContext | idem                                | Usuario A                 | mismo contexto, dos páginas | login en pageA + newPage en pageB; hook `window.__spablaSupabase` activo (`NEXT_PUBLIC_SPABLA_E2E_HOOK=1`) | `page.evaluate(async () => window.__spablaSupabase.auth.signOut({scope:"local"}))` — signOut REAL del SDK, NO borrado de storage | consecuencia natural del SDK: storageKey desaparece; pageA reload → formulario; pageB reload → formulario (sesión compartida desapareció); cero bucle de refresh | assert storageKey ausente en A y B tras el SDK signOut; cero `localStorage.removeItem` en el código (verificado por test anti-falso-positivo) | páginas cerradas |
| 12B    | signOut REAL contextos independientes | idem                            | Usuario A                 | dos BrowserContexts distintos | login independiente en ctxA y ctxB; hook `window.__spablaSupabase` activo | `pageA.evaluate(... signOut({scope:"local"}))` en ctxA; NUNCA scope global | ctxA → formulario; ctxB sigue autenticado, ContextReady, `GET /api/v2/bootstrap` recibe 200 real (verificado via `response` listener) | assert storageKey ausente en A, presente en B; ≥1 bootstrap 200 en B tras el signOut | ambos contextos cerrados |

## Fixtures deterministas (Fase 4)

| Fixture           | Descripción                                          |
|-------------------|------------------------------------------------------|
| Usuario A         | `email=e2e-user-a+<runId>@spabla.test`, membership activo en tenant A + conversación A |
| Usuario B         | `email=e2e-user-b+<runId>@spabla.test`, membership activo en tenant B + conversación B |
| Usuario C         | `email=e2e-user-c+<runId>@spabla.test`, sin membership (para escenario 11)             |
| Tenant A          | `id` UUID v4 aleatorio por corrida                                                     |
| Tenant B          | `id` UUID v4 aleatorio por corrida                                                     |
| Conversación A    | `tenant_id = tenantA`, `created_by = userA`, `language='es'`                            |
| Conversación B    | `tenant_id = tenantB`, `created_by = userB`, `language='en'`                            |
| Membership inactivo | `is_active=false` en tenant A para usuario B (se usa en aserciones RLS)              |

Los `<runId>` (12 chars hex) evitan colisiones entre corridas locales/CI.

## Aislamiento entre tenants

- Usuario A **no puede** ver conversaciones/memberships del tenant B (verificado en escenarios 11 y 1 vía RLS observada en `/api/v2/bootstrap`).
- Usuario B no está incluido en la barrera activa (solo se usa en fixtures de aislamiento negativas). Se verifica no-fuga por diff de arrays retornados por bootstrap.

## Datos sensibles PROHIBIDOS en evidencia

- `access_token`, `refresh_token`, JWT completo, `Authorization`, `service_role`, `anon` key completa, password, OTP.
- Emails personales reales (solo `@spabla.test`).
- Cookies o headers completos.
- `localStorage` serializado (solo presencia/ausencia).

## PASS/FAIL

- **PASS**: aserción observable satisfecha + evidencia sanitizada.
- **FAIL** si:
  - No se ejecuta.
  - Se ejecuta pero el resultado observable no coincide.
  - La evidencia captura un dato sensible prohibido.
  - Cualquier escenario queda `skipped` o `NO EJECUTABLE`.

## Correspondencia con el runner

Los 13 tests se ejecutan por un único `test.describe.serial` (mismo
worker) para evitar carreras con Supabase Auth local (rate-limit
implícito) y con `next dev` compartido. La orden Q3-E2E §FASE 2
exige "un worker inicial para evitar carreras con Supabase local".

## Q3-E2E-R · Rectificación de evidencia real (2026-08-22)

Cuatro debilidades corregidas respecto al hito Q3-E2E anterior:

1. **12A y 12B**: la acción de cierre ejecutaba
   `localStorage.removeItem(storageKey)`. Ahora invoca
   `supabase.auth.signOut({scope:"local"})` **REAL** sobre la
   instancia del SDK expuesta por el hook
   `window.__spablaSupabase` (activo únicamente cuando el runner
   arranca Next con `NEXT_PUBLIC_SPABLA_E2E_HOOK=1`). Prohibido
   borrar la storageKey manualmente en 12A/12B.
2. **Control anti-falso-positivo**: nuevo test que lee el propio
   spec desde `fs` y falla si detecta cualquier invocación real de
   `localStorage.removeItem(` dentro de los bloques de 12A o 12B
   (comentarios y string literales se filtran para evitar falsos
   negativos).
3. **Escenario 6**: sustituida la simulación `page.route(abort)` por
   un kill+restart REAL del proceso `next dev` iniciado por el
   runner. El spec obtiene el PID real del listener via
   `lsof -iTCP:<port> -sTCP:LISTEN -t`, mata el process group del
   wrapper `SPABLA_E2E_NEXT_WRAPPER_PID` + SIGKILL directo al
   listener, verifica muerte real (`pidAlive === false`, `portOpen
   === false`), luego `spawnNextDev(port)` reinicia y valida que
   `restarted.pid !== oldListener` y `portOpen === true`. Este
   test se ejecuta al **final** de la serie porque restablece el
   server compartido y los tests posteriores dependerían de una
   recompilación completa. `afterAll` mata el segundo `next dev`.
4. **Escenario 3**: sustituido el flujo `storageState` copiado
   entre contextos por
   `chromium.launchPersistentContext(userDataDir, {headless:true})`
   con `userDataDir` temporal en `os.tmpdir()`. El navegador se
   cierra completamente y se relanza con el mismo `userDataDir`;
   la sesión persistida en el perfil real debe restaurarse sin
   login. `userDataDir` gitignored y purgado en `afterAll`.

### Hook cliente (`lib/v2/client/supabase-browser-client.ts`)

Cambio mínimo, gated por `process.env.NEXT_PUBLIC_SPABLA_E2E_HOOK
=== "1"`:

```ts
if (process.env.NEXT_PUBLIC_SPABLA_E2E_HOOK === "1") {
  (window as unknown as { __spablaSupabase?: SupabaseClient }).__spablaSupabase = cachedClient;
}
```

En builds productivos ese env var nunca está definido → Next inlinea
`undefined` y la rama nunca entra. Cero impacto productivo.

### Escenarios reordenados en el describe.serial

Orden de ejecución (identificadores conservados, orden reasignado
solo por dependencia de infraestructura):

1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12A, 12B, **6 (final)**, +
`Q3-E2E-R · anti-falso-positivo` (control automático).

Total: **14 tests** (13 escenarios contractuales + 1 control
anti-falso-positivo).
