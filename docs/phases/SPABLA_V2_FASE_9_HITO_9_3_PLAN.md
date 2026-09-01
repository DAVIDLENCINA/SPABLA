# SPABLA V2 — Fase 9 — Plan Hito 9.3

**AUTH-PERSISTENT-SESSION · Continuidad de sesión y bootstrap autenticado**

**Tipo**: Plan de hito (documental).
**Versión**: **V1.2 — CONGELADO Y APROBADO POR DIRECCIÓN**.
**Fecha**: 2026-08-20 (revisión de congelación).
**Estado**: **CONGELADO Y APROBADO POR DIRECCIÓN**. Autoriza el alcance normativo; la implementación de cada subhito requiere órdenes operativas separadas.
**Rama documental**: `spabla-v2/plan-hito-9-3-auth-persistent-session`.
**Rama oficial de fase**: `spabla-v2/thirteen-languages-activation`.
**HEAD base**: `86d60c46ee4784631482074295d8d81da936dfad` (rama oficial actual tras Hito 9.2.5-K).
**Plan padre en Fase 9**: `docs/phases/SPABLA_V2_FASE_9_HITO_9_2_PLAN.md` V1.1 (APROBADO Y CONGELADO).
**ADRs gobernantes**: ADR-003 (Estratégica), ADR-008 (Persistencia y multi-tenancy).
**Acta que origina este plan**: `docs/audit_reports/AUDIT_2026-08-14_pref-acceptance-jefe.md` §4 (requisito emitido por Dirección durante PREF-ACCEPTANCE del Hito 9.2.4).

> **Autoridad**: Este plan **congela el alcance normativo** del Hito 9.3. La implementación de cada subhito (9.3.1, 9.3.2, …) requiere una **orden operativa separada** que se ejecutará **estrictamente sobre el alcance aquí congelado**; ninguna orden operativa puede ampliar unilateralmente ese alcance.

---

## §0. Historial de versiones

- **V1.0 — 2026-08-16**: propuesta inicial redactada tras el requisito emitido por Dirección durante PREF-ACCEPTANCE del Hito 9.2.4. PROPUESTA PARA REVISIÓN.
- **V1.1 — 2026-08-16**: revisión adversarial por Dirección. Cambios materiales:
  - Contrato de producto reformulado: «continuidad de experiencia» comparable a WhatsApp/WeChat, **no** equivalencia arquitectónica. El slogan «la sesión no caduca» se traduce operativamente: los `access_token` siguen siendo breves y la continuidad depende del `refresh_token` y de su renovación silenciosa.
  - Hito 9.3.1 **reducido drásticamente** a «Continuidad web de sesión y bootstrap automático». Se retiran del alcance obligatorio: OTP, passkey, dispositivos vinculados, revocación individual, multicuenta, nativo iOS/Android, tabla propia de dispositivos, chequeo de `auth.sessions` en cada request, y resolución de DEUDA-API-SEED-VERB.
  - Reclasificación de deudas heredadas del acta 9.2.4: DEUDA-UX-SEED-MISSING dentro de 9.3.1; DEUDA-API-SEED-VERB fuera del cierre de 9.3.1 (tarea pequeña separada); DEUDA-AUTH-REVOCATION movida a 9.3.3 (Dispositivos y revocación) y aclarada contra el contrato oficial de Supabase (el `access_token` puede seguir válido tras `signOut` hasta su `exp`; el claim `session_id` habilita comprobación server-side pero es política adicional de SPABLA, no comportamiento nativo automático).
  - Prohibición explícita de afirmar que `signOut` invalida inmediatamente el `access_token` en vuelo, y de prometer equivalencia arquitectónica con WhatsApp/WeChat.
  - Estrategia web / nativo estrictamente separada. Web: decisión abierta entre browser-only (persistSession) o Next SSR/PKCE con `@supabase/ssr`; nativo exclusivamente en 9.3.4.
  - Matriz de aceptación de 9.3.1 acotada a 18 pruebas verificables de Etapa A; se retiran las que exigen «revocación server-side → siguiente request siempre 401».
  - Preguntas pendientes de Dirección para desbloquear 9.3.1 reducidas de 10 a 2. El resto se traslada a los subhitos correspondientes.
  - Añadida §Fuentes primarias con enlaces directos a la documentación oficial de Supabase Auth; toda afirmación sobre Supabase debe respaldarse en esas fuentes o quedar marcada como hipótesis pendiente de prueba.
- **V1.2 — 2026-08-20**: **congelación y aprobación por Dirección**. Cambios materiales:
  - Estado promocionado de «PROPUESTO PARA REVISIÓN» a «CONGELADO Y APROBADO POR DIRECCIÓN».
  - HEAD base actualizado de `14e2cbdb2f3766cfbaf8dc0c5a61bbc12232004d` (punto de redacción inicial) a `86d60c46ee4784631482074295d8d81da936dfad` (rama oficial actual tras la promoción del Hito 9.2.5-K).
  - Referencias línea:número del §11 revalidadas contra la oficial actual: `supabase-browser-client.ts:36`, `app/v2/chat/page.tsx:401` (`signInWithPassword`) y `:424` (`signOut({ scope: "local" })`), `composition.ts:80/83/106`, `seed.ts:178`, `translation-runtime.ts:73` — todas conservadas o mínimamente desplazadas; `supabase/config.toml` actualizado de `:64` a **`:70`** (línea desplazada por comentarios añadidos por Hito 9.2.6 en el bloque `[realtime]`, valor `jwt_expiry = 3600` inalterado).
  - §15.1 **RESUELTO**: Dirección selecciona la **Opción A** (cliente Supabase de navegador existente con `persistSession = true`, `autoRefreshToken = true`, persistencia segura compatible con la arquitectura web actual; endurecimiento del bootstrap actual). `@supabase/ssr`, sesión SSR con cookies, migración general a PKCE y nueva dependencia de autenticación quedan **fuera del alcance de 9.3.1**. La auditoría 9.3.1-Q1 debe verificar técnicamente que A satisface los criterios de continuidad; si Q1 demuestra una **limitación estructural** que exija la Opción B, la orden operativa se detiene, documenta la evidencia y eleva a Dirección para una nueva decisión — **prohibido implementar B sin autorización explícita ni migrar silenciosamente**.
  - §15.2 **RESUELTA**: se permiten sesiones simultáneas del mismo usuario en varios dispositivos/navegadores, sin límite artificial de dispositivos. `signOut` local afecta únicamente a la sesión del dispositivo/navegador actual. La revocación global, la lista de dispositivos, la revocación individual y la gestión avanzada de sesiones quedan reservadas para 9.3.3. No se crea `spabla_v2.devices` en 9.3.1 ni se consulta `auth.sessions` en cada request. Se ratifica la prohibición de afirmar que `signOut` invalida inmediatamente `access_token` ya emitidos.
  - Se ratifica literalmente la promesa funcional de §4.1 y se refuerzan las expresiones prohibidas: «sesión infinita», «sesión que nunca caduca», «autenticación permanente garantizada», «equivalencia arquitectónica con WhatsApp o WeChat».
  - Se mantiene 9.3.1-Q1 como **primera unidad técnica** del subhito 9.3.1, con la barrera explícita de escalada antes descrita.
  - Se mantienen fuera de 9.3.1 todos los elementos ya excluidos en V1.1: OTP, magic link, passkeys, dispositivos vinculados, revocación individual, multicuenta, aplicaciones nativas, tabla `spabla_v2.devices` y DEUDA-API-SEED-VERB.
  - ADR-003, ADR-005 y ADR-008 permanecen inalterados. Cero referencias a runtime V1 (compatible al 100% con la V1-ERADICATION consolidada en Hito 9.2.6).

---

## §1. Origen y motivación

Durante PREF-ACCEPTANCE del Hito 9.2.4 (2026-08-14), Dirección observó dos fenómenos que **no son bugs de 9.2.4** pero que definen un requisito de producto no cubierto:

1. Un actor autenticado, tras una pausa prolongada, aparecía como no autenticado y debía volver a introducir contraseña. Comportamiento heredado desde Hito 9.1.
2. El seed cache (`tenantId`/`conversationId`) debe existir en `localStorage` para que el chat sea operable; sin él la UI muestra «Inicia sesión para ver la conversación» aunque haya sesión activa. Comportamiento heredado desde Hito 9.1.

Dirección emitió el requisito AUTH-PERSISTENT-SESSION registrado literalmente en §4 del acta. Este plan lo aterriza en un contrato de producto trazable y en una secuencia de subhitos operativos separados.

---

## §2. Alcance del plan

Cubre:

1. Contrato de producto obligatorio (§4).
2. Alcance exacto y **acotado** del primer subhito 9.3.1 (§5).
3. Reclasificación de las tres deudas heredadas del acta 9.2.4 (§6).
4. Secuencia de subhitos posteriores 9.3.2 – 9.3.5 (§7).
5. Contratos web y nativo estrictamente separados (§8).
6. Requisitos de seguridad transversales (§9).
7. Matriz mínima de aceptación de 9.3.1 (§10).
8. Estado actual documentado (§11).
9. Riesgos (§12).
10. Dependencias (§13).
11. Política de rollback (§14).
12. Decisiones pendientes de Dirección para desbloquear 9.3.1 (§15).
13. Procedimiento de aprobación (§16).
14. Fuentes primarias oficiales (§17).

**Fuera de alcance**:

- Implementación de código.
- Sustitución del proveedor Supabase Auth (queda abierta como decisión sólo si algún requisito lo hiciera imprescindible en un subhito posterior).
- Modificación de la política multi-tenancy congelada por ADR-008.
- Modificación de la política de idiomas congelada por ADR-005.
- Definición del modelo multi-conversación (para hito posterior separado).

---

## §3. Terminología

- **`access_token`**: JWT breve emitido por Supabase Auth. Valida firma + `exp`. Duración por defecto en Supabase local: 3600 s.
- **`refresh_token`**: token de larga duración que permite obtener nuevos `access_token` sin reautenticación.
- **Renovación silenciosa**: el proceso por el cual el SDK cliente intercambia un `refresh_token` válido por un nuevo `access_token` sin interacción del usuario.
- **Reautenticación visible**: el usuario ve el formulario de sign-in y debe introducir credenciales.
- **Continuidad de sesión**: propiedad de producto por la cual el usuario percibe que su sesión persiste entre aperturas de la app, mientras las credenciales renovables sigan siendo válidas.
- **Bootstrap autenticado**: proceso server-authoritative por el cual el cliente recupera identidad, tenant activo, conversaciones, selección y preferencias al abrir la app sin depender del seed cache local.

---

## §4. Contrato funcional obligatorio

### §4.1 Regla rectora

**«El usuario se identifica una vez por dispositivo y SPABLA restaura silenciosamente su sesión y su contexto mientras las credenciales renovables continúen siendo válidas.»**

Aclaraciones estrictas:

- **«La sesión no caduca» describe la experiencia visible, no credenciales eternas.** Los `access_token` siguen siendo breves.
- **La continuidad depende del `refresh_token`** y de su renovación silenciosa. Si el `refresh_token` deja de ser válido, la reautenticación visible es correcta y esperada.
- **SPABLA no replica la arquitectura interna de WhatsApp o WeChat.** Sólo se exige una continuidad de experiencia comparable.
- **Restaurar la autenticación no basta**: el bootstrap debe recuperar también identidad, tenant activo, conversaciones accesibles, conversación seleccionada (o una selección determinista) y preferencias actor-scoped.

### §4.2 Cuándo se muestra login

La reautenticación visible aparece **exclusivamente** en uno de estos casos:

1. Cierre de sesión explícito por el usuario.
2. `refresh_token` inválido, revocado o inutilizable.
3. Revocación efectiva del dispositivo (cuando 9.3.3 esté implementado; hoy no aplica).
4. Cuenta bloqueada o eliminada.
5. Recuperación o evento de seguridad detectado por el sistema.

Cualquier otra aparición de login es un defecto.

### §4.3 Comportamiento entre dispositivos y navegadores

- Cada dispositivo/navegador mantiene su propia sesión Supabase con su `refresh_token` propio (comportamiento nativo Supabase Auth).
- Cerrar sesión localmente en un navegador **no** debe afectar a otros dispositivos/navegadores.
- Cerrar sesión globalmente (Etapa C) invalida los refresh tokens correspondientes; el efecto sobre `access_token` en vuelo depende de la política elegida en 9.3.3 (ver §6.3).
- El aislamiento entre actores debe ser irrompible (invariante heredado de ADR-008).

### §4.4 Eliminación de elementos técnicos de la experiencia final

El usuario real **NUNCA** verá ni utilizará:

- `seed`.
- `tenantId`.
- `conversationId`.
- Actores fixture (`fase9.actor.a@spabla.local` y similares).
- Herramientas de desarrollo (`DeveloperPanel`).
- Credenciales demo.
- Selección manual de contexto técnico.

Consecuencia práctica para 9.3.1: el bootstrap del contexto (`tenantId`, `conversationId`, etc.) que hoy depende del `seedCache` local debe derivarse **automáticamente de la sesión del usuario** mediante una llamada server-authoritative al abrir la app.

---

## §5. Hito 9.3.1 — Continuidad web de sesión y bootstrap automático

### §5.1 Nombre oficial

**«Hito 9.3.1 — Continuidad web de sesión y bootstrap automático»**

### §5.2 Alcance obligatorio exclusivo

1. Restaurar automáticamente la sesión web existente al abrir SPABLA.
2. Renovar silenciosamente el `access_token` mediante el `refresh_token`.
3. Evitar mostrar el formulario de login durante el bootstrap mientras todavía se determina el estado real de la sesión (**cierre operativo de DEUDA-UX-SEED-MISSING**).
4. Sustituir la dependencia productiva del `seedCache` por un bootstrap autenticado y server-authoritative.
5. Restaurar en el bootstrap:
   - actor;
   - tenant activo;
   - conversaciones accesibles;
   - conversación seleccionada o una selección determinista;
   - preferencias actor-scoped.
6. Mantener `email + password` **sólo como mecanismo provisional** de alta/login; su sustitución llega en 9.3.2.
7. Reautenticar visiblemente **sólo** si la sesión renovable ya no puede recuperarse.
8. Mantener aislamiento entre actores, navegadores y tenants.
9. **Cero llamadas a OpenAI** en las pruebas del hito.

### §5.3 Fuera del alcance de 9.3.1

Explícitamente **no** son condición de cierre de 9.3.1:

- OTP (magic-link, código SMS, código email).
- Passkeys / WebAuthn.
- Dispositivos vinculados.
- Revocación individual de sesión desde otro dispositivo.
- Multicuenta.
- Aplicaciones nativas iOS/Android.
- Tabla propia `spabla_v2.devices`.
- Comprobación de `auth.sessions` en cada petición.
- Resolución de DEUDA-API-SEED-VERB.

Cualquiera de estos elementos, si aparece en la implementación de 9.3.1, es scope creep y debe rechazarse.

---

## §6. Reclasificación de las deudas heredadas del acta 9.2.4

### §6.1 DEUDA-UX-SEED-MISSING → integrada en 9.3.1

Bloquea directamente el bootstrap de producto. El §5.2 punto 3 la resuelve: durante el bootstrap el cliente no debe mostrar el formulario de login mientras el estado de la sesión aún se determina, y una vez determinado debe presentar el contexto real (chat operable o login, según corresponda). El bootstrap server-authoritative del §5.2 punto 4 elimina el vector de fallo original (dependencia de `seedCache` local en producción).

### §6.2 DEUDA-API-SEED-VERB → fuera del cierre de 9.3.1

Se mantiene **registrada**, pero **no bloquea 9.3.1**. Naturaleza y tratamiento:

- Es una corrección de **higiene del entorno de desarrollo**.
- Deberá resolverse mediante una **tarea pequeña independiente** (candidato: subhito 9.3.1-bis o una tarea de mantenimiento sin numeración).
- `GET` no deberá producir mutaciones. El endpoint dev deberá ser POST-only o desaparecer cuando ya no sea necesario.
- **No debe retrasar la continuidad de sesión de producto.**

### §6.3 DEUDA-AUTH-REVOCATION → movida a 9.3.3

Aclaración contra el contrato oficial de Supabase (ver §17):

- **`signOut` revoca los `refresh_token` afectados** (comportamiento nativo Supabase). Ver `https://supabase.com/docs/reference/javascript/auth-signout`.
- **El `access_token` ya emitido puede seguir siendo válido hasta su `exp`** (comportamiento nativo Supabase; JWTs son verificables por firma + `exp` sin round-trip). Ver `https://supabase.com/docs/guides/auth/jwts`.
- **El claim `session_id` permite comprobar si continúa existiendo la fila correspondiente en `auth.sessions`**, pero **imponer esa comprobación en cada request sería una política adicional de SPABLA**, no comportamiento nativo automático.
- **No decidir todavía** que habrá una consulta directa a `auth.sessions` por petición.
- Evaluar antes de elegir mecanismo: latencia, caché, disponibilidad, compatibilidad y coste.

Consecuencia práctica: **eliminada del alcance de 9.3.1** toda prueba que exija «revocación server-side → siguiente request siempre 401». Ese requisito pertenece a 9.3.3 y depende de la arquitectura de revocación que allí se apruebe.

**Prohibido en cualquier reporte, PR, ADR o commit** afirmar que «`signOut` invalida inmediatamente el `access_token` en vuelo». No lo hace. La invalidación efectiva depende, en el mejor caso, del `exp` natural del token; la comprobación server-side de `auth.sessions` sería política adicional a evaluar en 9.3.3.

---

## §7. Secuencia de subhitos

- **9.3.1 — Continuidad web y bootstrap automático.**
- **9.3.2 — Alta/login passwordless: OTP, magic link y/o passkey, tras decisión de Dirección.**
- **9.3.3 — Dispositivos vinculados, sesiones visibles y revocación.**
- **9.3.4 — Aplicaciones nativas y almacenamiento seguro del dispositivo.**
- **9.3.5 — Multicuenta, únicamente si Dirección la autoriza.**

### §7.1 Decisiones NO tomadas todavía por este plan

Se presentan como **opciones** sujetas al plan operativo del subhito correspondiente:

- Tabla `spabla_v2.devices` (candidata para 9.3.3, no decidida).
- Tabla `spabla_v2.auth_events` (candidata para 9.3.3 o antes, no decidida).
- QR como mecanismo de vinculación de dispositivo (una opción entre varias).
- Proveedor de OTP (email vs SMS, coste, cobertura regional).
- Passkey como modalidad primaria vs modalidad opcional.
- Sustitución de Supabase Auth (sólo si algún requisito de subhito no puede cumplirse; requiere ADR).

---

## §8. Contrato web vs nativo (separación estricta)

### §8.1 Web

- El cliente actual usa `persistSession: true` y `autoRefreshToken: true` con `storageKey: STORAGE_KEY` (constante = `"spabla_v2_fase9_auth"`) — ver `lib/v2/client/supabase-browser-client.ts:36`.
- Durante 9.3.1-Q1 debe **auditarse técnicamente por qué la continuidad falló durante la pausa observada en el acta 9.2.4**. La orden operativa de 9.3.1 exigirá esa auditoría como primera unidad de trabajo.
- **Decisión fijada por Dirección en V1.2 (§15.1)**: se adopta la **Opción A — Cliente Supabase de navegador existente** con `persistSession = true`, `autoRefreshToken = true` y persistencia segura compatible con la arquitectura web actual; el trabajo de 9.3.1 consiste en **endurecer** este bootstrap browser-only y trazar el flujo, no en reescribirlo.
- **Fuera del alcance de 9.3.1**: `@supabase/ssr`, sesión SSR basada en cookies, migración general a PKCE y cualquier nueva dependencia de autenticación. La reestructuración de la arquitectura web (Opción B) no se autoriza en 9.3.1.
- **Barrera de escalada — Opción B**: si 9.3.1-Q1 demuestra una limitación estructural que haga insuficiente la Opción A para cumplir los criterios de continuidad de §4 y §10, la orden operativa se **detiene**, documenta la evidencia con fuentes primarias (§17) y **eleva la decisión a Dirección** para una nueva autorización expresa. Prohibido:
  - implementar la Opción B sin nueva autorización;
  - migrar silenciosamente a SSR/PKCE bajo la aprobación V1.2;
  - equiparar la selección A a un cheque en blanco de arquitectura web.
- **No afirmar** que `localStorage` sea automáticamente la solución óptima; sigue siendo el mecanismo actual, sujeto a endurecimiento en 9.3.1 y a revisión en subhitos posteriores si el análisis de amenazas lo exige.
- **Prohibido** crear un sistema paralelo propio de refresh tokens.

### §8.2 Nativo (exclusivamente en 9.3.4)

- Keychain en iOS/macOS.
- Keystore / EncryptedSharedPreferences en Android.
- **Nunca equiparar** almacenamiento nativo con `localStorage` web (invariante de seguridad).
- **Nunca guardar** service-role, claves secretas ni credenciales administrativas en el dispositivo (invariante de seguridad).

---

## §9. Seguridad (requisitos transversales)

Los siguientes son requisitos, **NO** decisiones arquitectónicas. La arquitectura final se elige tras análisis de amenazas en cada subhito y **consultando la documentación oficial vigente** de Supabase Auth (ver §17).

- Rotación obligatoria de `refresh_token` en cada refresh; detección de reutilización revoca la cadena y notifica.
- Rate limiting para sign-in, OTP y magic links (parametrización en 9.3.2).
- Prevención de enumeración de teléfonos/correos (el sign-in y el envío de OTP no distinguen "identidad no existe" de "contraseña incorrecta"/"OTP enviado").
- Auditoría sin registrar tokens, contraseñas, OTPs ni códigos de vinculación en logs, tablas, artefactos CI ni mensajes al cliente.
- Análisis de amenazas (modelo mínimo STRIDE por componente) obligatorio antes de aprobar el diseño técnico de cualquier subhito posterior a 9.3.1.
- Política de duración y renovación de sesión: por decidir en cada subhito tras análisis de amenazas. **No asumir** valores heredados del proyecto Supabase local.
- Almacenamiento seguro de `refresh_token`: web según §8.1; nativo según §8.2.

---

## §10. Matriz mínima de aceptación de 9.3.1

Pruebas verificables (18 puntos) que debe cubrir el hito operativo 9.3.1 antes de ser propuesto a promoción:

1. Login inicial correcto con `email + password`.
2. Cerrar y abrir la pestaña conserva la sesión.
3. Cerrar y abrir el navegador conserva la sesión.
4. Reiniciar el ordenador conserva la sesión mientras el `refresh_token` sea válido.
5. Simular `access_token` expirado y comprobar renovación silenciosa (sin login visible).
6. Durante bootstrap **no** aparece falsamente el formulario de login.
7. `refresh_token` inválido termina en un único estado de reautenticación.
8. Cero bucle de 401 (heredado de 9.2.4; reutilizable el coordinator `applyAuth401Recovery`).
9. Preferencias actor-scoped sobreviven al refresh.
10. Conversaciones y contexto se restauran sin `seedCache` manual.
11. Actor A y Actor B permanecen aislados.
12. Dos navegadores del mismo actor pueden seguir autenticados si la política todavía lo permite (respuesta de §15.2).
13. Cierre local afecta sólo al navegador actual.
14. Cierre global invalida los `refresh_token` correspondientes, **sin afirmar** que el `access_token` en vuelo muera inmediatamente.
15. Cero llamadas a OpenAI durante las pruebas del hito.
16. Cero secretos en bundle, logs o `localStorage` ajeno al mecanismo oficial de Supabase.
17. CI Jobs A, B y C verdes.
18. Acta visual breve de Dirección con no más de 10 pasos (patrón heredado de 9.2.4).

Explícitamente **eliminado de la matriz de 9.3.1**:

- Revocación instantánea del `access_token`.
- Listado de dispositivos.
- Rotación controlada de sesión desde otro dispositivo.
- Pruebas iOS/Android.
- OTP / passkey.
- Multicuenta.

---

## §11. Estado actual documentado

### §11.1 Cliente

- `lib/v2/client/supabase-browser-client.ts:36`: `auth: { persistSession: true, autoRefreshToken: true, storageKey: STORAGE_KEY }`, con la constante `STORAGE_KEY = "spabla_v2_fase9_auth"` declarada en el mismo módulo. Singleton module-level cacheado por `useSyncExternalStore`. (Revalidado contra `86d60c46…`.)
- `app/v2/chat/page.tsx:401` `signInWithPassword({ email, password })`: única modalidad `email + password`. (Revalidado contra `86d60c46…`.)
- `app/v2/chat/page.tsx:424` `signOut({ scope: "local" })`; sólo esta pestaña. (Revalidado contra `86d60c46…`.)
- `lib/v2/client/auth-recovery-coordinator.ts`: coordinator idempotente extraído en 9.2.4, reutilizable en 9.3.1.

### §11.2 Server

- `lib/v2/server/composition.ts:83` y `:106`, `lib/v2/server/seed.ts:178`, `lib/v2/server/translation-runtime.ts:73`: `persistSession: false, autoRefreshToken: false` — clientes efímeros para verificar JWT o hacer service-role ops. Nunca ceden sesión al navegador. (Revalidado contra `86d60c46…`.)
- `verifyJwt` (`composition.ts:80`) invoca `supabase.auth.getClaims(token)` que valida firma + `exp` contra JWKS. No consulta `auth.sessions`. (Revalidado contra `86d60c46…`.)

### §11.3 Config

- `supabase/config.toml:70`: `jwt_expiry = 3600`. No hay `refresh_token_reuse_interval` explícito. (Revalidado contra `86d60c46…`; línea desplazada respecto a V1.1 por comentarios añadidos por Hito 9.2.6 en el bloque `[realtime]`, el valor `3600` no cambia.)

### §11.4 Bootstrap actual (a sustituir en 9.3.1)

- El contexto (`tenantId`, `conversationId`) se lee de `localStorage` bajo la clave `spabla_v2_fase9_seed` mediante `useSeedCache()`.
- Sólo `runSeed()` puebla ese cache (llama a `POST /api/v2/seed`, endpoint dev-only con doble gate).
- En un navegador nuevo sin `seedCache` local, el chat muestra literal «Inicia sesión para ver la conversación» aunque haya sesión activa. Es el origen de DEUDA-UX-SEED-MISSING.

---

## §12. Riesgos

- **R1**: la auditoría de continuidad web puede concluir que el modelo browser-only actual es insuficiente y exigir Next SSR/PKCE. Mitigación: 9.3.1 documenta el análisis y la decisión, sin comprometer el subhito.
- **R2**: la sustitución del `seedCache` por un endpoint server-authoritative introduce una dependencia server nueva en el bootstrap; su latencia afecta al tiempo de arranque perceptible. Mitigación: análisis de rendimiento explícito, patrón cache-with-revalidate o SSR bootstrap.
- **R3**: Supabase Auth puede requerir configuración adicional para cumplir el §4.2 sobre invalidación del `refresh_token` en escenarios extremos. Mitigación: verificar contra §17 antes de asumir; la orden operativa de 9.3.1 exigirá evidencia con fuentes.
- **R4**: divergencia entre comportamiento web y comportamiento futuro nativo. Mitigación: contratos §4 escritos plataforma-agnóstica; los mecanismos §8 son específicos por plataforma pero cumplen el mismo contrato.
- **R5**: presión por adelantar OTP/passkey durante 9.3.1. Mitigación: §5.3 lista exclusiones explícitas.

---

## §13. Dependencias

- **ADR-008** (Persistencia y multi-tenancy) — no se modifica.
- **ADR-005** (Catálogo de idiomas) — no se modifica.
- **Plan Hito 9.2 V1.1** — congelado; este plan hereda invariantes.
- **Acta 9.2.4** (`AUDIT_2026-08-14_pref-acceptance-jefe.md`) — origen del requisito.
- **Fuentes oficiales de Supabase Auth** — consulta obligatoria antes de decidir arquitectura (§17).
- Ninguna dependencia externa nueva se autoriza en este plan.

---

## §14. Política de rollback

- Cada subhito operativo se implementa en rama de trabajo separada y se promociona por fast-forward tras CI verde (patrón heredado de Fases 7, 8, 9).
- Rollback = `git revert` del commit atómico del subhito antes de promoción, o abandono de la rama de trabajo.
- Migraciones forward-only: si una migración causa problema, se emite una migración correctiva. **No** se editan migraciones aplicadas.
- Alteraciones de `auth.users` o del modelo de sesiones exigen backup previo y plan de rollforward documentado en la orden operativa correspondiente.

---

## §15. Decisiones de Dirección (fijadas en V1.2)

Las dos preguntas que bloqueaban el arranque de 9.3.1 en V1.1 quedan **resueltas por Dirección** en la congelación V1.2. El resto de decisiones se mantiene trasladado a los subhitos correspondientes (§15.4).

### §15.1 Arquitectura web para la continuidad de sesión — **RESUELTA: OPCIÓN A**

Dirección selecciona la **Opción A — Cliente Supabase de navegador existente**:

- `persistSession = true`.
- `autoRefreshToken = true`.
- Persistencia segura compatible con la arquitectura web actual (`storageKey: STORAGE_KEY`).
- Restauración silenciosa de la sesión al reabrir SPABLA.
- Endurecimiento del bootstrap browser-only, trazado del flujo, integración con `applyAuth401Recovery` heredado de 9.2.4.

Quedan **fuera del alcance de 9.3.1**:

- `@supabase/ssr`.
- Sesión basada en cookies SSR.
- Migración general a PKCE.
- Nueva dependencia de autenticación.
- Reestructuración de la arquitectura web.

**Auditoría 9.3.1-Q1 (obligatoria)**: verificar técnicamente que la Opción A satisface los criterios de continuidad de §4 y §10. Si Q1 demuestra una **limitación estructural** que exija la Opción B (Next SSR / PKCE con `@supabase/ssr` y cookies sincronizadas — ver `https://supabase.com/docs/guides/auth/server-side/advanced-guide`), la orden operativa **se detiene**, documenta la evidencia con fuentes primarias (§17) y **eleva la decisión a Dirección** para una nueva autorización expresa.

**Prohibido**:

- implementar la Opción B sin nueva autorización;
- migrar silenciosamente a SSR/PKCE bajo la aprobación V1.2;
- interpretar la selección A como cheque en blanco de arquitectura;
- crear un sistema paralelo propio de refresh tokens.

### §15.2 Política inicial de sesiones simultáneas — **RESUELTA**

Dirección fija la política para 9.3.1:

- **Se permiten sesiones simultáneas** del mismo usuario en varios dispositivos y navegadores.
- **No se establece límite artificial** de dispositivos.
- **`signOut` local afecta únicamente a la sesión del dispositivo/navegador actual** (`scope: "local"`); no invalida sesiones de otros navegadores/dispositivos.
- **Prohibido afirmar** en cualquier reporte, PR, ADR, commit, log o mensaje al cliente que `signOut` invalida inmediatamente `access_token` ya emitidos. La invalidación efectiva del `access_token` en vuelo depende, en el mejor caso, del `exp` natural (contrato oficial de Supabase — ver `https://supabase.com/docs/guides/auth/jwts`); cualquier política adicional se decide en 9.3.3.
- **La revocación global queda fuera de 9.3.1**.
- **La lista de dispositivos, la revocación individual y la gestión avanzada de sesiones** quedan reservadas para 9.3.3.
- **No se crea `spabla_v2.devices` en 9.3.1**.
- **No se consulta `auth.sessions` en cada request**.

### §15.3 Orientación de producto ya decidida (no requiere pregunta)

- Continuidad tipo WhatsApp/WeChat como criterio de experiencia (no arquitectura).
- Identificación visible sólo cuando sea necesaria (§4.2).
- Varias instalaciones/dispositivos en el futuro (Etapa C).
- Multicuenta todavía no aprobada (Etapa E condicional).

### §15.4 Preguntas movidas a subhitos posteriores

Las siguientes decisiones **no bloquean 9.3.1**; se resolverán en su subhito:

- Modalidad primaria de alta (OTP / passkey / magic-link) → 9.3.2.
- Alcance de la migración legacy `email+password` → 9.3.2.
- Duración concreta de sesión y ventana de refresh → 9.3.2 tras análisis de amenazas.
- Modelo de dispositivos (tabla, límites, vinculación) → 9.3.3.
- Push notifications → 9.3.4.
- Multicuenta → 9.3.5 (condicional).
- Cumplimiento normativo GDPR/LOPDGDD → transversal, empezando por 9.3.2.
- Rate limiting SMS/email → 9.3.2.
- Recuperación de cuenta → 9.3.2 y 9.3.3.
- Sustitución de proveedor → sólo si algún subhito lo requiere; ADR obligatorio.

---

## §16. Procedimiento de aprobación

- Este documento fue propuesto en V1.0 (2026-08-16), revisado adversarialmente en V1.1 (2026-08-16) y **aprobado y congelado por Dirección en V1.2 (2026-08-20)**.
- La aprobación V1.2 **autoriza el alcance normativo** del Hito 9.3. La **implementación** sólo comenzará mediante órdenes operativas separadas por subhito (9.3.1, 9.3.2, ...).
- Ninguna línea de código puede tocarse bajo esta aprobación por sí sola; cada subhito requiere su propia orden operativa.
- Cambios posteriores al alcance congelado exigen V1.3, V2.0, etc., con historial explícito en §0.
- La aprobación V1.2 **no crea automáticamente** el plan operativo de 9.3.1; ese plan se redacta por separado y arranca por 9.3.1-Q1 (auditoría técnica de la Opción A) según §15.1.

---

## §17. Fuentes primarias oficiales

Toda afirmación sobre Supabase Auth en este plan (y en los subhitos posteriores) **debe respaldarse** en las siguientes fuentes oficiales o quedar marcada explícitamente como **hipótesis pendiente de prueba**:

- **Supabase User Sessions**: https://supabase.com/docs/guides/auth/sessions
- **Supabase JavaScript `signOut`**: https://supabase.com/docs/reference/javascript/auth-signout
- **Supabase Server-Side Auth Advanced Guide**: https://supabase.com/docs/guides/auth/server-side/advanced-guide
- **Supabase JWT**: https://supabase.com/docs/guides/auth/jwts

Las afirmaciones específicas de este plan que dependen de estas fuentes:

- §6.3 «`signOut` revoca los `refresh_token` afectados; el `access_token` puede seguir válido hasta su `exp`»: `auth-signout` + `jwts`.
- §6.3 «el claim `session_id` permite comprobar si continúa existiendo una fila en `auth.sessions`»: `sessions` + `jwts`.
- §8.1 «Next SSR/PKCE con `@supabase/ssr` y cookies sincronizadas»: `server-side/advanced-guide`.

---

## Anexo A — Índice de identificadores del Plan

- **Plan**: `SPABLA_V2_FASE_9_HITO_9_3_PLAN.md` V1.2 (CONGELADO Y APROBADO POR DIRECCIÓN, 2026-08-20).
- **Rama documental**: `spabla-v2/plan-hito-9-3-auth-persistent-session`.
- **HEAD base**: `86d60c46ee4784631482074295d8d81da936dfad` (rama oficial actual tras Hito 9.2.5-K).
- **Subhitos operativos previstos**:
  - 9.3.1 — Continuidad web y bootstrap automático (**arquitectura A fijada**; primer subhito autorizado, se arranca por 9.3.1-Q1).
  - 9.3.2 — Alta/login passwordless (OTP, magic link y/o passkey).
  - 9.3.3 — Dispositivos vinculados, sesiones visibles y revocación.
  - 9.3.4 — Aplicaciones nativas y almacenamiento seguro.
  - 9.3.5 — Multicuenta (condicional).
- **Deudas heredadas del acta 9.2.4 y su reclasificación**:
  - DEUDA-UX-SEED-MISSING → integrada en 9.3.1.
  - DEUDA-API-SEED-VERB → fuera del cierre de 9.3.1; tarea pequeña independiente.
  - DEUDA-AUTH-REVOCATION → movida a 9.3.3; aclaraciones contractuales explícitas.
- **Decisiones de Dirección congeladas en V1.2**:
  - §15.1 Arquitectura web → **Opción A** (cliente Supabase de navegador existente, `persistSession=true`, `autoRefreshToken=true`), con barrera de escalada a Dirección si 9.3.1-Q1 demuestra insuficiencia estructural.
  - §15.2 Política de sesiones simultáneas → sesiones simultáneas permitidas sin límite artificial; `signOut` local afecta solo al dispositivo/navegador actual; revocación global y lista de dispositivos van a 9.3.3.
- **Fuentes oficiales**: 4 enlaces directos a `supabase.com/docs` (§17).
