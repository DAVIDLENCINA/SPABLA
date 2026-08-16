# PREF-ACCEPTANCE · Guion operativo para Dirección

**Estado**: **EJECUCIÓN MANUAL COMPLETADA · APROBADA POR DIRECCIÓN**. Dirección validó visualmente cada paso y aprobó el contenido de esta acta. La aprobación **no autoriza todavía la promoción** del candidato a la rama oficial; esa autorización se emite por separado.

**Rama candidata**: `spabla-v2/hito-9-2-4-client-stability`.
**Entorno**: Supabase local · Next dev local · conversación fixture vacía · `OPENAI_API_KEY` desactivado (proveedor bloqueado).

Cada paso es **una sola acción visible**. El Jefe responde «OK» o «FALLO» y el agente entrega el siguiente.

---

## §1. Guion (10 acciones manuales + 2 pasos cubiertos por automatización)

Orden temporal de ejecución:

1. En el navegador A (ventana normal) abrir `http://localhost:3000/v2/chat` e iniciar sesión con las credenciales del actor A. **Esperado**: aparece el chat con los idiomas guardados de A (los que estén persistidos, o los defaults `es/en` si es la primera vez).
2. Cambiar «Yo escribo en» a **Català** y «Leer mensajes en» a **Deutsch**. **Esperado**: ambos selectores actualizan sin errores.
3. Pulsar Cmd+R (recarga completa). **Esperado**: los selectores vuelven a **Català / Deutsch** sin flicker.
4. Pulsar «Cerrar sesión» en la cabecera. **Esperado**: aparece el bloque de sign-in.
5. En un navegador B (ventana privada / segundo navegador) abrir la misma URL e iniciar sesión con las credenciales del actor B. **Esperado**: aparece el chat con la cabecera autenticada como B (los selectores pueden mostrar aún `es/es` si el `seedCache` local aún no está poblado — se corrige en el paso 5.5).
5.5. **(sólo B, cuando el seedCache local está vacío)** En el bloque **«Developer panel»** al final de la página, pulsar **«Ejecutar seed»**. Esperado: el aviso «Inicia sesión para ver la conversación» desaparece, el chat pasa a estado operable con Actor B, y los selectores muestran los defaults canónicos de B (**English / English**, porque el actor B se sembró con `language = en`).
6. Verificar que B NO ve **Català / Deutsch**. **Esperado**: los selectores muestran los idiomas propios de B, no los de A.
7. **CUBIERTO POR AUTOMATIZACIÓN** — no requiere acción manual del Jefe. La cadena «invalidación externa → HTTP 401 real → recovery sin bucle» está probada deterministicamente por:
   - **HTTP-frontier tests** (`app/api/v2/messages/route.http.integration.test.ts`, 3 tests) — arrancan `next dev` en el puerto 3109 y hacen `fetch()` reales con JWT firma-corrupta contra el endpoint;
   - **Direct-handler tests** (`app/api/v2/messages/route.integration.test.ts`, 11 tests) — invocan el handler productivo con JWT corruptos y alimentan la Response al mismo `applyAuth401Recovery`;
   - **CI oficial**: run [`31831955666`](https://github.com/DAVIDLENCINA/SPABLA/actions/runs/31831955666) Job B — 62/62 verde;
   - Evidencias específicas fijadas por los tests: `applyAuth401Recovery` ejecuta la transición **una sola vez** por sesión inválida (`outcome1 = {ranTransition: true, totalAttempts: 1}`), el **segundo 401 es no-op** (`outcome2 = {ranTransition: false, totalAttempts: 1}`), **cero bucle** demostrado por contador tras 5 401s consecutivos (`notifyCount === 1`, `signOutCount === 1`), y las **preferencias del actor se preservan byte-idénticas** tras la recovery.
7-γ. **(sustitutivo visual del paso 7)** En el navegador B, pulsar el botón **«Cerrar sesión»** en la cabecera. **Esperado**: la sesión se cierra y aparece el bloque de sign-in con los campos «Email» y «Contraseña». Sin errores.
7-γ-bis. En el navegador B, iniciar sesión de nuevo con las credenciales de Actor B (`fase9.actor.b@spabla.local` / `fase9-actor-b-pass`). **Esperado**: la aplicación autentica a B y los selectores vuelven a mostrar **English / English** — las preferencias sobreviven al sign-out normal.
8. **CUBIERTO POR AUTOMATIZACIÓN** — el conteo de 401s tras invalidación es exactamente lo que verifican los tests HTTP-frontier + direct-handler citados en el paso 7. En producción, `sessionExpiredRef.current` marcado inmediatamente al primer 401 + `setSession(null)` flip `canOperate` + cancelación del runner de polling impiden estructuralmente cualquier tick adicional.
10. Volver al navegador A y verificar los dos selectores tras un re-login (si la sesión de A hubiese caducado por pausa prolongada, iniciar sesión de nuevo como A antes de leer los selectores). **Esperado**: los selectores muestran **Català / Deutsch** — las preferencias de A sobreviven a recarga, sign-out normal previo y — separadamente — a caducidad natural + re-login.

---

## §2. Firma del Jefe

Rellenar sólo cuando los 10 pasos hayan pasado sin observaciones.

| Paso | Resultado (OK / FALLO + nota) | Firma / iniciales |
|---|---|---|
| 1 | OK — Actor A autenticado; ES/ES iniciales; conversación vacía | Validación visual confirmada por Dirección |
| 2 | OK — selectores y cabecera Català / Deutsch; sin errores | Validación visual confirmada por Dirección |
| 3 | OK — recarga preserva Català / Deutsch sin flicker | Validación visual confirmada por Dirección |
| 4 | OK — sign-out; formulario visible; cabecera ES/ES sin sesión | Validación visual confirmada por Dirección |
| 5 | FALLO INICIAL — resuelto por 5.5 (seedCache local vacío en B nuevo) | Validación visual confirmada por Dirección |
| 5.5 | OK — «Ejecutar seed» en DeveloperPanel; B operable con EN/EN | Validación visual confirmada por Dirección |
| 6 | OK — B mantiene EN/EN; NO hereda Català / Deutsch | Validación visual confirmada por Dirección |
| 7 (auto) | Cubierto por CI run 31831955666 Job B — no requiere firma | — |
| 7-γ | OK — sign-out de B; formulario visible; sin errores | Validación visual confirmada por Dirección |
| 7-γ-bis | OK — re-login de B; EN/EN conservado tras sign-out normal | Validación visual confirmada por Dirección |
| 8 (auto) | Cubierto por CI run 31831955666 Job B — no requiere firma | — |
| 10 | Tras una pausa prolongada, la interfaz presentó al Actor A como no autenticado. Después de volver a iniciar sesión, recuperó **Català / Deutsch**. Esta observación prueba visualmente la persistencia de preferencias, pero **no identifica por sí sola el mecanismo que produjo el cierre de sesión ni el número de respuestas HTTP 401**. | Validación visual confirmada por Dirección |

La columna Firma refleja la validación visual paso a paso; la **aprobación global del acta** la emite Dirección aparte, y en esta versión del documento ya está registrada como **APROBADA POR DIRECCIÓN**.

Estado del acta: **EJECUCIÓN MANUAL COMPLETADA · APROBADA POR DIRECCIÓN**. Esta aprobación **no autoriza la promoción** del candidato a la rama oficial; la promoción requiere orden operativa separada.

---

## §3. Deudas UX registradas durante la ejecución del acta

Ninguna pertenece al alcance del Hito 9.2.4 (todas son heredadas de hitos anteriores). Se dejan documentadas para que Dirección decida cuándo abrir hitos correctivos.

### §3.1 DEUDA-UX-SEED-MISSING — Mensajería engañosa sin `seedCache`

**Origen**: Hito 9.1 (definición de `canOperate = session && tenantId && conversationId && targetLanguage`) + Hito 9.2.2 (literales UI).

**Síntoma observado en PREF-ACCEPTANCE**: la cabecera muestra el email del usuario autenticado (`fase9.actor.b@spabla.local`), pero el bloque de historial dice literal «Inicia sesión para ver la conversación» y el compositor dice «Inicia sesión para escribir…». La contradicción es visible: la sesión SÍ está iniciada; lo que falta es el `seedCache` local (`tenantId`/`conversationId`).

**Causa raíz**: `!canOperate` puede activarse por 3 motivos distintos y la UI no los distingue. La rama actual («Inicia sesión…») se hereda del estado sin sesión y confunde al usuario cuando la sesión existe.

**No es defecto del Hito 9.2.4** — el mensaje y el gate existen desde Hito 9.1. Pero es una deuda UX real: **el mensaje de interfaz es engañoso**, y el agente no puede pretender que no existe defecto.

**Propuesta de resolución** (para un hito futuro, no en este candidato): descomponer los mensajes según el motivo real del `!canOperate` (falta sesión / falta seedCache / falta targetLanguage). Alternativa mejor: gate el bootstrap del seed automáticamente en dev cuando `session != null && !seed`.

### §3.2 DEUDA-API-SEED-VERB — `GET /api/v2/seed` produce mutaciones

**Origen**: Hito 9.1 (`app/api/v2/seed/route.ts` exporta tanto `GET()` como `POST()`, y el `POST()` delega en el `GET()`, de modo que ambos verbos ejecutan la misma lógica mutante).

**Observación**: durante la probe de gates de este acta, un `GET` al endpoint disparó la lógica de siembra completa (creación / verificación de usuarios, actualización de contraseñas de fixture, creación de conversación fixture). Con esta terminología precisa:
- **`GET` debe ser seguro y no producir mutaciones** (RFC 9110 §9.2.1: los métodos seguros no cambian el estado del recurso).
- **La idempotencia del seed no convierte un `GET` mutante en un diseño correcto**: el seed puede ser idempotente y aun así violar el contrato de seguridad de `GET`. Un método puede ser idempotente y no-seguro simultáneamente; los dos conceptos son ortogonales.

**Propuesta de resolución** (para un hito futuro, no en este candidato):
- **`POST` como único método mutante**; `GET` debe rechazarse sin ejecutar el handler (405 Method Not Allowed o 404 por consistencia con el gate).
- Requiere modificar `app/api/v2/seed/route.ts` y actualizar consumidores. El `DeveloperPanel` ya usa `POST`; no habría regresión en la UI conocida.

**Impacto operacional actual**: el doble gate `NODE_ENV=development` + `SPABLA_V2_ENABLE_DEV_SEED=1` bloquea el endpoint en producción, por lo que el riesgo real hoy es contenido. La deuda es de diseño / cumplimiento de estándar, no de exposición operativa inmediata.

### §3.3 DEUDA-AUTH-REVOCATION — latencia entre revocación server-side y HTTP 401

**Origen**: Hito 9.1 (`lib/v2/server/composition.ts:80` — `verifyJwt` invoca `supabase.auth.getClaims(token)`, que valida firma + `exp` contra JWKS).

**Observación durante PREF-ACCEPTANCE**: al preparar el paso 7 original (invalidación externa server-side → 401 real en el navegador), **en el entorno local y con el mecanismo actual de `verifyJwt` no se pudo demostrar una invalidación inmediata y determinista del `access_token` en vuelo** mediante `admin.auth.admin.signOut(userId, "global")`, `admin.auth.admin.updateUserById({password})`, `admin.auth.admin.deleteUser(id)` ni `admin_deactivate_membership`. La conducta exacta debe **verificarse contra el contrato oficial de Supabase Auth antes de decidir la corrección**; el análisis actual es una observación local, no un pronunciamiento absoluto sobre el comportamiento de Supabase Auth en producción.

**Separación explícita de AUTH-RECOVERY**: el candidato Hito 9.2.4 **sí recupera correctamente ante un 401** una vez que éste se produce (tests HTTP-frontier + direct-handler + coordinator idempotente lo demuestran deterministicamente contra Supabase local). Lo que esta deuda registra es un asunto DIFERENTE: **la capa de autenticación puede tardar en producir ese 401** tras una revocación server-side. Estas dos capas son ortogonales: AUTH-RECOVERY es la reacción cliente al 401 (cerrada por 9.2.4); AUTH-REVOCATION es la latencia server-side entre la revocación y el 401 (deuda futura, fuera de este hito).

**Prohibido afirmar en cualquier reporte, PR, ADR o commit** que «`admin.signOut` invalida inmediatamente el JWT en vuelo». La invalidación efectiva depende, en el mejor caso, del `exp` natural del token; la latencia real bajo cada mecanismo debe verificarse contra el contrato oficial de Supabase antes de cualquier declaración firme.

**Alternativas pendientes de evaluación** (NO recomendaciones aprobadas; cada una necesita análisis explícito de seguridad, rendimiento y compatibilidad antes de considerarse):
- Consulta server-side de `auth.sessions` (o el registro equivalente que Supabase Auth exponga) en cada request autenticado. Impacto en latencia y en cuota de conexión Supabase por evaluar.
- Reducir `jwt_expiry` (afecta a `supabase/config.toml` y a toda la infraestructura de renovación de tokens; equivalente a un cambio de contrato).
- Denylist server-side de `sub` revocados. Requiere modelo de propagación entre instancias y política de expiración por evaluar.

Ninguna es una recomendación firme del agente. La solución final la elige Dirección tras análisis de amenazas.

**Nivel de riesgo**: **provisional**. No hay análisis de amenazas formal disponible en este momento; cualquier calificación cuantitativa queda pendiente hasta ese análisis.

### §3.4 Alcance de las deudas

Las tres deudas UX/API/AUTH (DEUDA-UX-SEED-MISSING, DEUDA-API-SEED-VERB, DEUDA-AUTH-REVOCATION) quedan **fuera del Hito 9.2.4** por decisión operativa. Se registran para trazabilidad y priorización posterior por Dirección. **La aceptación manual actual del hito 9.2.4 procede** aplicando el paso 5.5, el sustitutivo visual 7-γ / 7-γ-bis, y verificando el aislamiento cross-actor en los pasos 6 y 10.

---

## §4. DEUDA/REQUISITO-AUTH-PERSISTENT-SESSION — sesión persistente de producto (decisión de Dirección)

Sección independiente. **NO** es una deuda técnica derivada de este acta; es un **requisito de producto emitido por Dirección** durante la revisión del hito 9.2.4.

### §4.1 Decisión de Dirección

SPABLA debe proporcionar una experiencia de sesión comparable a WhatsApp o WeChat:

- Identificación inicial **una sola vez por dispositivo**.
- **Restauración automática de sesión** al abrir la aplicación (sin sign-in visible).
- **Renovación silenciosa del `access_token`** mediante `refresh_token`, sin interacción del usuario.
- Recuperación automática de **perfil, conversaciones y preferencias** en cada apertura.
- **Reautenticación visible únicamente** ante uno de los siguientes eventos:
  - Cierre voluntario por el usuario.
  - Revocación efectiva por seguridad.
  - Dispositivo desvinculado por el propietario o por administración.
  - Pérdida de credenciales de renovación.
  - Incidencia de seguridad detectada por el sistema.
- **Vinculación y revocación individual de dispositivos** (funcionalidad futura).
- El usuario final **nunca** utilizará `seed`, `tenantId`, `conversationId` ni herramientas de desarrollo para operar la aplicación.

### §4.2 Aclaración explícita del alcance del Hito 9.2.4

- **9.2.4 corrige la reacción del cliente cuando recibe un HTTP 401 y conserva preferencias por actor**.
- **9.2.4 NO implementa todavía la experiencia de sesión persistente equivalente a WhatsApp/WeChat**.
- Por tanto, AUTH-RECOVERY puede cerrarse **dentro de su contrato técnico** (reacción al 401 con recovery idempotente), pero **la autenticación del producto no puede declararse funcionalmente terminada**.
- Este requisito debe abrir un **hito específico dedicado** antes de considerar el acceso de SPABLA preparado para usuarios reales.

### §4.3 Restricciones a la solución futura

- **No** asumir que basta con ampliar `jwt_expiry`.
- **No** definir todavía la arquitectura definitiva.
- La solución deberá **diseñarse y probarse expresamente** en su propio ADR / plan de hito, con análisis de amenazas, política de sesiones, revocación granular por dispositivo y estrategia de recuperación de contexto.

---

## §5. Cierre de la ejecución manual — separación estricta de evidencias

### §5.1 Evidencia visual (observada por Dirección en navegador real durante los pasos 1–10)

Lo que la sesión manual demostró en Chrome normal (Actor A) y Chrome incógnito (Actor B):

- **Persistencia de preferencias por actor y por navegador**:
  - Actor A guardó `Català / Deutsch` y las conservó tras recarga (Cmd+R), tras sign-out normal + re-login (pasos 3–4 + observaciones posteriores), y — separadamente — tras una pausa prolongada seguida de nuevo inicio de sesión (paso 10).
  - Actor B en Chrome incógnito obtuvo defaults canónicos `English / English` y los conservó tras sign-out normal + re-login (7-γ + 7-γ-bis).
- **Aislamiento cross-actor y cross-browser**:
  - Actor B nunca vio `Català / Deutsch` a pesar de compartir tenant y conversación con A (paso 6).
  - Tras las operaciones en B, la vuelta a A confirmó que sus preferencias siguen intactas (paso 10).

**Lo que la evidencia visual NO demuestra por sí sola** (importante — no debe extrapolarse):
- El número exacto de HTTP 401 emitidos por el endpoint durante la caducidad natural del JWT en el paso 10 (la pestaña Network no se auditó en tiempo real).
- Que el mecanismo específico que produjo el cierre de sesión de Actor A tras la pausa fuese `applyAuth401Recovery` (se observaron sus efectos externos, no el flujo interno del coordinator).
- Que la reacción al 401 no entrara en bucle (la observación del formulario post-caducidad es compatible con múltiples cadenas de recuperación distintas).

### §5.2 Evidencia automatizada (CI Job B, no observada por Dirección en vivo)

Lo que los tests deterministas ejecutados en CI Job B run [`31831955666`](https://github.com/DAVIDLENCINA/SPABLA/actions/runs/31831955666) verifican **sin depender de la sesión manual**:

- **Reacción idempotente ante HTTP 401 real**:
  - HTTP-frontier suite (`app/api/v2/messages/route.http.integration.test.ts`, 3 tests): boot de `next dev` en puerto 3109 y `fetch()` reales al endpoint con JWT firma-corrupta → 401 real por socket → alimenta la `Response` al mismo `applyAuth401Recovery` que `page.tsx` usa. `outcome1 = {ranTransition: true, totalAttempts: 1}`, `notifyCount === 1`, `signOutCount === 1`.
  - Direct-handler suite (`app/api/v2/messages/route.integration.test.ts`, 11 tests): invoca `GET(request)` productivo con JWT corruptos y verifica los mismos invariantes.
- **Ausencia de bucle 401**:
  - Direct-handler test `regression: two consecutive 401s produce exactly ONE recovery transition (no loop)` — 5 GETs consecutivos → `notifyCount === 1`, `signOutCount === 1`.
  - HTTP-frontier test `HTTP 401 real fed to coordinator → EXACTLY ONE recovery, second 401 is a no-op, preferences preserved` — `outcome2 = {ranTransition: false, totalAttempts: 1}`.
- **Preferencias preservadas ante recovery**:
  - Test unitario del store (test 21 — el módulo NO expone `clear`) + HTTP-frontier test que graba una preferencia, dispara recovery real, y verifica byte-idéntica lectura posterior.
- **Baselines mantenidas**:
  - `cd engine && npx vitest run` → 1057 passed / 62 skipped / 0 failed.
  - `npm run test:client` con env vars: 62 passed / 0 skipped / 0 failed.
  - `npx eslint app/v2 lib/v2 app/api/v2 --max-warnings=0` → exit 0.
  - `npx tsc --noEmit` root + engine → exit 0.
  - `npm run build` → 12/12 rutas.
  - `git diff --check` → exit 0.

### §5.3 Auditoría del bundle productivo

- `.next/static/**` (cliente): 0 fixtures fase9, 0 valor real de `service_role`, 0 valor real de `OPENAI_API_KEY`.
- `.next/server/**` (servidor): 0 fixtures literales, 0 valores reales de secretos; sólo referencias `process.env.*` a los nombres de env var.
- Doble gate del seed confirmado por chunk `.next/server/app/api/v2/seed/route.js` reducido a 6 líneas (loader Turbopack), sin fixtures literales.

### §5.4 Mecanismos observados en la ejecución manual (separación estricta)

**Se observó manualmente y NO más allá**:

- **Sign-out normal + re-login (Actor B)**: preferencias `English / English` sobrevivieron. Mecanismo: acción de usuario sobre el botón «Cerrar sesión» → `signOut({scope: "local"})` → limpieza de estado React → re-login estándar. La preservación se observó en la UI.
- **Re-login tras pausa prolongada (Actor A)**: la interfaz presentó a A como no autenticado tras la pausa, y el re-login recuperó `Català / Deutsch`. La preservación se observó en la UI; el mecanismo interno que provocó el estado «no autenticado» **no fue observado** (compatible con múltiples cadenas: caducidad natural del `access_token`, 401 en polling, recovery del coordinator, etc.).

**Se demostró automatizadamente y NO se debe extrapolar de la observación visual**:

- **Reacción idempotente al HTTP 401**: probada por HTTP-frontier + direct-handler tests contra JWT firma-corrupta. Contador determinista.
- **Ausencia de bucle 401**: probada por test específico con 5 401s consecutivos y verificación de `notifyCount === 1`.
- **`applyAuth401Recovery` como mecanismo de recovery**: probado por test que alimenta la `Response 401` real al coordinator y verifica los invariantes.

**No se debe afirmar** que la ejecución manual demostró el número de 401s ni que fue `applyAuth401Recovery` el causante del cierre de sesión de A tras la pausa. Esas propiedades quedan probadas exclusivamente por §5.2, no por §5.1.
