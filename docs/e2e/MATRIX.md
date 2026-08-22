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
| 3      | Cierre / reapertura pestaña  | idem                                     | Usuario A                 | dos contextos con `storageState` reutilizado | login en contexto1, `storageState()`, cerrar contexto1        | crear contexto2 con `storageState` capturado, `goto('/v2/chat')`                  | contexto2 entra sin formulario; header visible                                              | storageState guardado en `.playwright/state-*.json` (untracked)                                | ambos contextos cerrados                          |
| 4      | Segunda pestaña simultánea   | idem                                     | Usuario A                 | mismo contexto, dos páginas | login en pageA                                                  | `context.newPage()` → `goto('/v2/chat')`                                          | ambas páginas alcanzan header conversación                                                  | screenshot only-on-failure                                                                    | ambas páginas cerradas                            |
| 5      | Dos pestañas concurrentes    | idem                                     | Usuario A                 | mismo contexto, dos páginas | login en pageA + newPage; forzar `access_token` caducado en storage | disparar polling concurrente en ambas (`page.evaluate` + reload orquestado)     | ninguna transita a Expired; refresh silencioso; ambas siguen operables                      | contador de refresh (network filter) sin registrar tokens                                     | páginas cerradas                                  |
| 6      | Reinicio Next                | idem                                     | Usuario A                 | contexto único             | login en pageA                                                  | matar el proceso Next dev; esperar caída de bootstrap; relanzar Next; esperar salud | tras Next up, siguiente polling responde 200 sin login                                     | logs de runner (sin secretos)                                                                  | Next dev restablecido                             |
| 7      | Access token caducado        | idem                                     | Usuario A                 | contexto único             | login en pageA                                                  | mutar `access_token` a JWT caducado válidamente firmado (page.evaluate)          | siguiente `/api/v2/messages` dispara refresh silencioso + retry 200                         | no capturar tokens; solo status codes                                                          | ninguno                                           |
| 8      | Fallo transitorio            | idem                                     | Usuario A                 | contexto único             | login en pageA                                                  | `page.route('**/api/v2/messages*', route=>route.abort('failed'))` un solo tick   | UI muestra estado transitorio; storageKey de sesión intacto; sin transición a Expired      | sin capturar bodies                                                                            | route unroute                                     |
| 9      | 401 recuperable              | idem                                     | Usuario A                 | contexto único             | login en pageA                                                  | interceptar un único `/api/v2/messages*` con 401                                  | refresh + retry → 200; sesión intacta                                                       | sin capturar tokens                                                                            | route unroute                                     |
| 10     | 401 irrecuperable            | idem                                     | Usuario A                 | contexto único             | login en pageA                                                  | interceptar `/auth/v1/token?grant_type=refresh_token` con 400 `invalid_grant`      | recovery destructiva; formulario de sign-in con banner Expired                              | sin capturar tokens                                                                            | route unroute                                     |
| 11     | Bootstrap ausente            | idem                                     | Usuario C (sin membership)| contexto fresco            | usuario C creado por fixture sin membership                     | login con C                                                                        | `canOperate=false`; mensaje "Todavía no tienes contexto asignado…" (o equivalente); NO login | screenshot only-on-failure                                                                     | contexto cerrado                                  |
| 12A    | signOut mismo BrowserContext | idem                                     | Usuario A                 | mismo contexto, dos páginas | login en pageA + newPage en pageB                              | ejecutar `supabase.auth.signOut({scope:'local'})` desde pageA (via `evaluate`)   | pageA transita a formulario; pageB pierde sesión (detección inmediata via `SIGNED_OUT` local o próxima operación) | comprobar ausencia de storageKey en ambas                                                       | páginas cerradas                                  |
| 12B    | signOut contextos independientes | idem                                 | Usuario A                 | dos BrowserContexts distintos | login en contextA + login independiente en contextB          | signOut local en contextA                                                          | contextA transita a formulario; contextB permanece autenticado y `bootstrap` sigue 200      | comprobar storageKey ausente en A y presente en B                                              | ambos contextos cerrados                          |

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
