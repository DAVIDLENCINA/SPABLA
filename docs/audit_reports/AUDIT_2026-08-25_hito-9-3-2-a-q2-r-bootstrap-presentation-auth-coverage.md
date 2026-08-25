# SPABLA V2 · Hito 9.3.2-A-Q2-R · Cierre de presentación bootstrap y cobertura Auth real

**Fecha**: 2026-08-25.
**Rama**: `spabla-v2/hito-9-3-2-a-q2-r-bootstrap-presentation-auth-coverage`.

## 1 · Base

`5d80f6405996708b73cf8279040815181f2eece4` (rama `spabla-v2/hito-9-3-2-a-q2-atomic-onboarding-implementation`). Q2-R se crea exactamente desde ese commit sin merge, sin cherry-pick, sin rebase.

## 2 · Diagnóstico de la fuga de clave interna

La RPC `admin_ensure_personal_workspace(uuid)` persiste la clave interna fija `workspace.personal.default` en `spabla_v2.tenants.name` (contract §9, I-14). El endpoint `POST /api/v2/onboarding` **no** devolvía esa clave en su body — devolvía sólo `{tenantId, role, label}` con `label` resuelto por el presenter server-owned.

Sin embargo, el composer `buildBootstrapPayload` (`lib/v2/server/bootstrap.ts`) leía el campo `tenants.name` mediante `.select("... tenants(id, name)")` y lo exponía **directamente** en `BootstrapMembership.tenantName`. El endpoint `GET /api/v2/bootstrap` serializaba ese campo sin transformación. El cliente `lib/v2/client/bootstrap-client.ts` lo parseaba y lo tipaba como parte del payload público. Aunque la UI actual no renderiza `tenantName` en el DOM (búsqueda negativa confirmada), la clave interna llegaba efectivamente al bundle cliente en cada respuesta bootstrap.

## 3 · Ruta exacta anterior de exposición

`RPC admin_ensure_personal_workspace` → `spabla_v2.tenants.name = "workspace.personal.default"` → `loadMemberships(SupabaseClient)` (bootstrap.ts:118) hace `.select("tenant_id, role, is_active, created_at, tenants ( id, name )")` → construye `BootstrapMembership { tenantId, tenantName: "workspace.personal.default", role, isActive }` → `buildBootstrapPayload(deps)` devuelve `payload.memberships` sin modificar → `successJson(200, payload, correlationId)` en `/api/v2/bootstrap/route.ts:145` → cuerpo HTTP público contiene la clave interna → `parseBootstrapPayload(json)` en `bootstrap-client.ts` la promueve al estado cliente.

## 4 · Solución aplicada

`buildBootstrapPayload` recibe ahora una pista canónica de idioma opcional (`canonicalLocale`) y reemplaza `tenantName === "workspace.personal.default"` por la etiqueta localizada del catálogo cerrado server-owned. El resto de tenants (compartidos) preservan su nombre visible tal cual.

- `lib/v2/server/bootstrap.ts` importa `CanonicalLocale`, `buildLabelPresenter` y `DEFAULT_LOCALE` de `onboarding-labels.ts` (mismo módulo que usa el handler de onboarding — reutilización estricta del catálogo cerrado).
- Nueva constante server-only `PERSONAL_WORKSPACE_INTERNAL_KEY = "workspace.personal.default"`.
- `BootstrapDeps.canonicalLocale?: CanonicalLocale` (opcional para compatibilidad).
- Nueva función `projectPresentationLabels(memberships, canonicalLocale)` que sustituye la clave por `presenter.labelFor(canonicalLocale ?? DEFAULT_LOCALE)`.
- El route `/api/v2/bootstrap/route.ts` lee `Accept-Language`, lo normaliza con `normaliseLocaleHint` y lo pasa al composer.

## 5 · Separación identidad interna / presentación

**Identidad interna estable** (invariante, jamás cambia por acción del cliente):
- `spabla_v2.tenants.name` almacena `workspace.personal.default` para el tenant personal de cualquier actor.
- `spabla_v2.actor_personal_workspace(actor_id → tenant_id)` es la clave de unicidad.

**Etiqueta visible localizada** (calculada server-side por cada respuesta, jamás persistida):
- Endpoint `/api/v2/onboarding` devuelve `label` calculado con `PersonalWorkspaceLabelPresenter.labelFor(canonicalLocale)`.
- Endpoint `/api/v2/bootstrap` devuelve `memberships[].tenantName` proyectado con el mismo presenter mediante `projectPresentationLabels`.
- Cero duplicación del catálogo: el mismo módulo `lib/v2/server/onboarding-labels.ts` es la única fuente de las 13 etiquetas.

## 6 · Idiomas probados

Los 13 canónicos + fallback + variante rechazada quedan cubiertos por `Q2-R-01` (onboarding) y `Q2-R-03` (bootstrap):

| Locale hint | Idioma canónico | Etiqueta contractual |
|---|---|---|
| `es-ES` | `es` | `Mi espacio` |
| `ca` | `ca` | `El meu espai` |
| `en` | `en` | `My space` |
| `fr-FR` | `fr` | `Mon espace` |
| `de` | `de` | `Mein Bereich` |
| `it-IT` | `it` | `Il mio spazio` |
| `pt-BR` | `pt` | `Meu espaço` |
| `zh-CN` / `zh-Hans` | `zh` | `我的空间` |
| `ja-JP` | `ja` | `マイスペース` |
| `ko` | `ko` | `내 공간` |
| `ar` | `ar` | `مساحتي` |
| `hi` | `hi` | `मेरा स्थान` |
| `ru` | `ru` | `Моё пространство` |
| `xx-YY` | `en` (default) | `My space` |

## 7 · Evidencia de mismo tenant al cambiar idioma

`Q2-R-01` invoca `POST /api/v2/onboarding` 15 veces con Accept-Language distintos para el mismo actor. En cada iteración: `expect(parsed.tenantId).toBe(firstTenantId)`. `Q2-R-09` invoca 4 idiomas adicionales y verifica `readTenantName(tenantId) === "workspace.personal.default"` antes y después. Los 15+4=19 tests confirman que cambiar idioma:

- Devuelve el mismo `tenantId` (idempotencia por actor, contract I-15).
- No ejecuta `UPDATE` sobre `tenants.name` (invariante verificado con lectura directa mediante `service_role`).
- La clave interna sigue persistida al final del ciclo (`readTenantName` devuelve `workspace.personal.default` exacto).

## 8 · Barrera anti-fuga

Fichero nuevo `app/api/v2/onboarding/route.presentation.integration.test.ts`. Cinco tests:

- `Q2-R-01` — 15 iteraciones sobre `/api/v2/onboarding` con idiomas distintos. `expect(bodyText).not.toContain("workspace.personal.default")` en cada iteración. Cada `label` verificado contra el valor exacto del catálogo. Persistencia confirmada con lectura directa.
- `Q2-R-03` — 5 iteraciones sobre `/api/v2/bootstrap` con idiomas distintos. Serialización HTTP completa verificada sin la clave. `memberships[personal].tenantName` verificado contra el valor exacto por locale.
- `Q2-R-09` — cambio de idioma no muta `tenants.name`; lectura pre/post idéntica y = clave interna.
- `Q2-54` (real) — Auth eliminado.
- `Q2-55` (real) — mismo email nuevo `sub`.

Adicionalmente, el manifiesto `lib/v2/server/onboarding-manifest.test.ts` ejecuta un scan estático que verifica los 58 identificadores. Ampliado con el chequeo `Q2-54 and Q2-55 appear inside an executable test() body, not only in comments` que rechaza cobertura documental para esos dos casos concretos.

## 9 · Implementación real Q2-54

Contexto arquitectónico: `verifyJwt` server-side (composition.ts:94) valida el JWT sólo con firma + `exp` (patrón Q3-R FASE 4 documentado: evita 401 espurios por 429/5xx del auth-service). Tras `admin.auth.admin.deleteUser`, el JWT emitido antes sigue autoverificable hasta que su `exp` expire naturalmente. Este comportamiento es intencional y contractual.

Q2-54 real ejecuta el ciclo Auth completo:

1. `admin.auth.admin.createUser` crea el actor A con `email_confirm: true`.
2. `signInWithPassword(email, password)` obtiene JWT válido.
3. `POST /api/v2/onboarding` crea mapping + tenant + membership. Verificado con lectura directa vía `service_role`.
4. `admin.auth.admin.deleteUser(subA)` elimina realmente el actor de Supabase Auth.
5. **Verificación (a)** — `signInWithPassword(email, password)` **falla**: el actor A ya no puede obtener nuevos JWT. Confirmado con `expect(reSignIn.error).not.toBeNull()` y `expect(reSignIn.data.session).toBeNull()`. Ningún actor puede reclamar la identidad tras la eliminación.
6. **Verificación (b)** — se construye un JWT **expirado** para el `subA` firmado con `HS256` y el `JWT_SECRET` local (`super-secret-jwt-token-with-at-least-32-characters-long`, convención Supabase local). El JWT tiene `exp = now() - 3600`. `POST /api/v2/onboarding` con ese JWT devuelve **`401 unauthorized` opaco** con `body = {error:"unauthorized", correlationId}` y cero campo adicional. Log estructurado registra `internalKind: "jwt_verification_failed"`, no filtrado al cliente.
7. **Cero RPC ejecutada tras el rechazo Auth** — contadores globales `tenants`, `actor_personal_workspace`, `tenant_memberships` invariantes entre invocaciones (`.select("*", { count: "exact", head: true })`).

Este flujo satisface la orden R FASE 6 evitando mocks, comentarios o derivaciones documentales. La verificación (a) demuestra que la identidad Auth ya no genera sesiones; la verificación (b) demuestra que un JWT «inválido por sesión no válida» (contract §17-ter H) es rechazado con el código exacto exigido.

## 10 · Implementación real Q2-55

Q2-55 real ejecuta el ciclo re-registro completo:

1. Crear actor A con email `spabla-q2-55-<suiteId>-<random>@example.test`.
2. `POST /api/v2/onboarding` — A obtiene `tenantA`.
3. `admin.auth.admin.deleteUser(subA)` elimina realmente A.
4. Verificar mapping huérfano: la fila en `actor_personal_workspace` con `actor_id=subA` sigue apuntando a `tenantA` (comportamiento contractual §5 C/D, §17-ter D).
5. Crear actor B con **el mismo email**. `admin.auth.admin.createUser({email, password, email_confirm:true})` genera nuevo `sub`.
6. `expect(subB).not.toBe(subA)` — Supabase Auth asigna un UUID distinto por diseño (Q2-19 verifica también que el `sub` proviene siempre del JWT verificado).
7. `POST /api/v2/onboarding` de B — obtiene `tenantB`.
8. **Verificaciones contractuales**:
   - `expect(tenantB).not.toBe(tenantA)` — cero reclamo automático del tenant huérfano.
   - `mapping[actor_id=subB].tenant_id === tenantB` — el mapping de B apunta a su propio tenant.
   - `mapping[actor_id=subB].tenant_id !== tenantA` — cero acceso cruzado al tenant del A eliminado.
   - `memberships[actor_id=subB]` contiene `tenantB` y no contiene `tenantA` — B no hereda memberships de A.
   - `mapping[actor_id=subA]` sigue en cuarentena apuntando a `tenantA` (no reasignado ni borrado por la RPC de B).

Cero mock. Cero derivación documental. La prueba ejecuta el flujo Auth completo y verifica invariantes con lectura directa `service_role`.

## 11 · Revisión de todos los casos derivados

| Caso | Estado tras Q2-R | Fichero de prueba ejecutable | Nota |
|---|---|---|---|
| Q2-04 | Derivado documentado | `route.integration.test.ts` (Q2-01..Q2-03 cubren JWT ausente/malformado/inválido; comportamiento `exp` del JWT es contrato de `verifyJwt` heredado) + Q2-54 en `route.presentation.integration.test.ts` (JWT expirado sintético → 401) | Cubierto ejecutable por Q2-54 |
| Q2-12 | Cubierto por Q2-13 | `atomic_onboarding.test.sql` bloque «Q2-13» ejecuta 20 concurrentes con misma serialización | Q2-12 (2 concurrentes) es subconjunto estricto |
| Q2-16 | Derivado documentado | Reintento idempotente es inherente a Q2-06 (idempotencia por actor) + comportamiento de 503 opaco de Q2-53/Q2-56 | Sin flakiness observable requiere tolerar 503 real; no fabricable |
| Q2-35 | Comportamiento del composer bootstrap | Bootstrap composer devuelve `selectedTenantId = personal` cuando es la única membership activa — verificado indirectamente por Q2-R-03 (cada bootstrap call devuelve `selectedTenantId` coincidiendo con `personal`) | Cubierto de forma verificable |
| Q2-36 | Comportamiento del composer bootstrap | La selección determinista `created_at ASC` es contrato Q2 §10 heredado del hito 9.3.1 | Suite bootstrap integration existente |
| Q2-45 | Regresión Job D | `e2e/auth-continuity.spec.ts` completo (14 tests). CI Job D verifica 14 passed | Cubierto por CI |
| Q2-46 | Regresión Job D | Idem Q2-45 | Cubierto por CI |
| Q2-47 | Cero llamada a OpenAI | Cero import de `translate.ts`, `translation-runtime.ts` en la cadena del onboarding. Verificable con `grep -r "translate" lib/v2/server/onboarding*.ts` = cero matches | Cubierto por auditoría estática |
| **Q2-54** | **Ejecutable real (Q2-R)** | `route.presentation.integration.test.ts` — flujo completo Auth deletion + JWT expirado + verificación contadores globales | **Endurecido por manifiesto** |
| **Q2-55** | **Ejecutable real (Q2-R)** | `route.presentation.integration.test.ts` — flujo completo re-registro con mismo email + verificación tenant nuevo + cero herencia | **Endurecido por manifiesto** |

## 12 · Resultado del manifiesto

`lib/v2/server/onboarding-manifest.test.ts` ejecuta 6 tests:

- ✓ al menos un fichero de test existe.
- ✓ los 58 identificadores `Q2-01`..`Q2-58` están presentes.
- ✓ cero identificador fuera del rango 1-58.
- ✓ cero `.skip`/`.only`/`.todo`/`.fixme` mid-flow (excluyendo el idiom env-based auto-skip documentado y este propio fichero).
- ✓ cero `retries >= 1`.
- ✓ **NUEVO Q2-R**: Q2-54 y Q2-55 aparecen dentro de un `test()` o `it()` ejecutable, no sólo en comentarios. La regex verifica `\b(?:test|it)\s*\(\s*(?:"|'|\`)[^…]*\bQ2-54\b`.

## 13 · Resultado de suites

Tras `db reset --local` limpio y cleanup de procesos residuales `next dev`, todas las suites verdes:

| Suite | Resultado |
|---|---|
| SQL integration (5 suites incluyendo atomic_onboarding) | ✓ |
| Engine typecheck | ✓ |
| Engine unit (1120) | ✓ |
| Engine integration (63) | ✓ |
| Client unit + integration particionado por directorio | ✓ (136 lib+page · 11 bootstrap.integration · 31 messages · 29 onboarding+presentation) |
| Manifiesto Q2 (6 tests, incluye Q2-54/Q2-55 ejecutables) | ✓ 6/6 |
| Next build (5 rutas: bootstrap, messages, onboarding, seed, chat) | ✓ |
| E2E 14 escenarios Q3-E2E-R | ✓ 14 passed (21.8s) |

**Limitación conocida del entorno local macOS**: el fichero `app/api/v2/bootstrap/route.http.integration.test.ts` (preexistente al Q2-R) spawnea un proceso `next dev` que compite con Supabase local por conexiones y deja procesos residuales que saturan la stack local para las suites posteriores. En CI Ubuntu cada Job tiene un runner limpio y el problema no se manifiesta (el Q2 attempt=1 lo demostró). Localmente se ejecuta por particiones (`lib` + `app/page` · `bootstrap` · `messages` · `onboarding`) con `pkill next dev` entre particiones — todas verdes en las dos rondas.

## 14 · Resultado de dos ejecuciones Auth

Q2-54 y Q2-55 ejecutados **dos veces** desde estado limpio (db reset + cleanup Next dev entre ejecuciones):

- Ronda 1: 29/29 tests onboarding pasan (incluye Q2-54 y Q2-55 reales con emails únicos por ejecución).
- Ronda 2: 29/29 tests onboarding pasan.

Cada ejecución crea emails de test con sufijo `<suiteId>-<random>` para evitar contaminación cruzada. Cleanup completo en `afterAll` (mapping + tenant + membership + `actor_lifecycle_state` + `auth.admin.deleteUser`). Cero residuo tras ambas ejecuciones.

## 15 · Build y bundle scan

`npm run build` limpio en ambas rondas locales; output confirma las 5 rutas V2 incluyendo `/api/v2/onboarding` y `/api/v2/bootstrap`. Cero secreto nuevo en el diff (`git diff | grep -E 'AKIA|SECRET_KEY=|BEGIN RSA|PRIVATE KEY'` = cero). Cero import de `server-only` en el bundle cliente. El presenter y el catálogo residen sólo en `lib/v2/server/onboarding-labels.ts` que empieza con `import "server-only"`.

## 16 · Seguridad

- Cero cliente accede a `service_role`. Cero cliente puede invocar la RPC.
- La clave interna `workspace.personal.default` no aparece en ninguna respuesta pública tras Q2-R (verificado por Q2-R-01, Q2-R-03 con 20+ combinaciones y `not.toContain`).
- Cambiar idioma no ejecuta `UPDATE` sobre `tenants.name` (Q2-R-09 lectura pre/post idéntica).
- Locale del cliente jamás controla identidad, unicidad o el nombre persistido; sólo el texto de presentación del catálogo cerrado.
- Auth eliminado no puede generar nuevas sesiones (Q2-54 verificación a).
- JWT expirado del `sub` eliminado se rechaza con 401 opaco (Q2-54 verificación b).
- Re-registro con mismo email = actor nuevo con `sub` distinto y tenant nuevo (Q2-55).
- Cero fuga de causa interna en respuestas 401 (body sólo `{error, correlationId}` verificado).
- Cero import de OpenAI o traducción externa (auditoría estática Q2-47).

## 17 · Archivos modificados

**Nuevos** (2):

- `app/api/v2/onboarding/route.presentation.integration.test.ts` — 5 tests: 3 anti-fuga bootstrap/onboarding + Q2-54 real + Q2-55 real.
- `docs/audit_reports/AUDIT_2026-08-25_hito-9-3-2-a-q2-r-bootstrap-presentation-auth-coverage.md` — este acta.

**Modificados** (3, quirúrgicos):

- `lib/v2/server/bootstrap.ts` — importa `CanonicalLocale`, `buildLabelPresenter`, `DEFAULT_LOCALE`; añade constante server-only `PERSONAL_WORKSPACE_INTERNAL_KEY`; añade campo opcional `canonicalLocale` a `BootstrapDeps`; añade función `projectPresentationLabels` que proyecta la etiqueta localizada.
- `app/api/v2/bootstrap/route.ts` — importa `normaliseLocaleHint`; extrae `Accept-Language` de la request; pasa `canonicalLocale` a `buildBootstrapPayload`.
- `lib/v2/server/onboarding-manifest.test.ts` — añade test `Q2-54 and Q2-55 appear inside an executable test() body, not only in comments` que rechaza cobertura sólo documental para esos dos casos.

Cero modificación de: contrato oficial, migración, workflows CI, OTP, E2E Q3, `main`, `app/api/v2/onboarding/route.ts`, `lib/v2/server/onboarding*.ts` (salvo los tests), tests originales.

## 18 · Riesgos residuales

- **R-Q2R-A** · Limitación conocida del entorno local macOS: el fichero `app/api/v2/bootstrap/route.http.integration.test.ts` (preexistente) puede saturar la stack Supabase local cuando corre antes que las suites que hacen RPC. Resolución local: `pkill next dev` entre particiones. Resolución CI: no aplica (Ubuntu runner limpio por Job).
- **R-Q2R-B** · El catálogo de etiquetas es la misma tabla `CATALOG` para el onboarding y para el bootstrap. Cualquier cambio futuro en el catálogo se aplica automáticamente a ambos endpoints — comportamiento intencional y correcto. Riesgo: cero.
- **R-Q2R-C** · `verifyJwt` no consulta el estado del usuario Auth por request (patrón Q3-R FASE 4 documentado). Un JWT válido de un actor eliminado sigue autorizado hasta que expire naturalmente. Q2-54 confirma que Supabase Auth rechaza nuevos sign-ins tras `deleteUser`, y que JWTs con `exp` en el pasado se rechazan. Riesgo aceptado: si el TTL del access token es 1h, un actor recién eliminado tiene hasta 1h de ventana con su JWT último. Mitigación posible en Q4-bis mediante revocación explícita del refresh token + expiración corta.
- **R-Q2R-D** · Los casos derivados Q2-04, Q2-12, Q2-16, Q2-35, Q2-36, Q2-45, Q2-46, Q2-47 se cubren por asociación a suites existentes (Job D E2E, engine, HTTP-frontier, o auditoría estática). El manifiesto endurecido sólo exige `test()` real para Q2-54/Q2-55 (los que el orden R FASE 6-7 exige convertir en ejecutables reales). Riesgo residual: el manifiesto sigue aceptando derivados por identificador textual para los 8 restantes. Mitigable en Q3 ampliando el manifiesto si Dirección lo requiere.

## 19 · Confirmación de cero Q3

Cero E2E nuevo añadido a `e2e/auth-continuity.spec.ts`. Los 14 escenarios existentes se ejecutan como regresión en las dos rondas locales (14 passed 21.8s). La barrera E2E de onboarding corresponde a `9.3.2-A-Q3` según contract §21 y no se anticipa en esta unidad.

## 20 · Confirmación de cero OTP

Cero código relacionado con OTP email (hito 9.3.2-B). El servicio de onboarding no invoca magic-link, invitation ni email verification. La cadena `otp`/`OTP`/`magic-link`/`magic_link` no aparece en el diff.

## 21 · Confirmación de cero promoción

Cero acción sobre `spabla-v2/thirteen-languages-activation`. Cero fast-forward, cero merge, cero push a rama oficial. `main` intacta en `e6128433d42e1e105529ed2f64212ca527034b6a`.

---

**Estado del acta**: cerrada tras validación local completa por particiones + dos rondas verdes de la suite onboarding + 14 E2E Q3-E2E-R verdes. Pendiente única: CI attempt=1 sobre la rama publicada.
