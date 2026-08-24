# SPABLA V2 · Hito 9.3.2-A-Q1-R · Rectificación del contrato de onboarding atómico

**Fecha**: 2026-08-24.
**Rama documental**: `spabla-v2/hito-9-3-2-a-q1-r-onboarding-contract`.

## 1 · SHA oficial de base

`fb0a75676451b33934b149a718f3c4a55b92db3b` (`spabla-v2/thirteen-languages-activation`), cerrada por `HITO 9.3.1-Q3-E2E-R3-P · CONTINUIDAD NATURAL PROMOVIDA A OFICIAL — CERRADO`.

CI oficial autorizante de la base: [`32755010804`](https://github.com/DAVIDLENCINA/SPABLA/actions/runs/32755010804) — attempt 1 · success · Jobs A/B/C/D success · Job D 14 passed · PostgreSQL 17 · restore drill PASS.

## 2 · SHA del contrato original

`b99185263500220772f595a921c526ade0bc2acc`. Rama `spabla-v2/hito-9-3-2-a-q1-onboarding-contract` — intacta en `origin`, no modificada por esta unidad.

## 3 · Motivo del bloqueo anterior

El contrato Q1 quedó bloqueado tras dictamen de Dirección al detectarse dos observaciones no resueltas:

- **OBS-Q1-1** — Localización del nombre del espacio ambigua. Q1 asumía implícitamente que el cliente podía influir en la etiqueta persistida del tenant personal («Mi espacio» hardcoded en §9 y §18 R-F que proponía derivarla de `Accept-Language`) sin fijar contractualmente:
  1. que el cliente no puede enviar nombre libre;
  2. que `Accept-Language` es una pista no confiable;
  3. que la etiqueta persistida proviene exclusivamente de un catálogo cerrado server-owned;
  4. que la unicidad del espacio personal no depende del nombre;
  5. que la RPC no recibe texto libre del cliente.

- **OBS-Q1-2** — Ciclo de vida del actor incompleto. Q1 no distinguía normativamente sign out, desactivación de membership, solicitud de eliminación de cuenta, eliminación de Auth, retención legal, borrado, anonimización, mappings huérfanos, ni el mecanismo de reparación de esos mappings. Q1 sí introducía I-8 (sin PII persistida) y §17 (privacidad mínima) pero dejaba abiertas: qué ocurre si el actor Auth se elimina, si un re-registro con el mismo email reclama el tenant anterior, cómo se detectan y tratan los mappings huérfanos, y qué respuesta pública produce el onboarding en cada estado sin filtrar la causa interna.

Adicionalmente, el CI del propio commit documental Q1 (`32598803593`) quedó en `failure` por un fallo transversal del escenario Playwright `Q2 §20-6` (kill+restart de Next) — ese fallo era técnico y ajeno al contenido normativo. Ese fallo se resolvió y promovió por separado en `HITO 9.3.1-Q3-E2E-R3-P`. Q1-R hereda ya la base verde `fb0a756…`.

## 4 · OBS-Q1-1

Enunciado normativo aplicado en §4 (preguntas 16-20 nuevas), §6 (I-4' rectificada + I-7 rectificada + I-10 + I-11 + I-12 + I-13 nuevas), §8 (nuevos puertos `PersonalWorkspaceLocaleResolver` y `PersonalWorkspaceLabelCatalog`), §9 (RPC recibe `p_workspace_label text` server-owned, no texto libre del cliente), §10 (body `{}` opaco, `Accept-Language` como pista no confiable) y §17-bis (17 puntos normativos).

## 5 · Solución contractual de localización

Concentrada en §17-bis. En síntesis:

- Body público del onboarding vacío u objeto vacío `{}`.
- Identidad del actor derivada exclusivamente del `sub` del JWT validado.
- `Accept-Language`, configuración del dispositivo y preferencia del actor tratados como pista **no confiable**.
- Servidor **normaliza** la pista contra una whitelist cerrada de trece códigos canónicos (§17-bis 6, alineada con el hito 9.2).
- Entrada desconocida, manipulada o no soportada → locale seguro por defecto (§17-bis 7).
- Texto persistido seleccionado exclusivamente desde un **catálogo cerrado propiedad del servidor** (§17-bis 8-10).
- La **unicidad e identidad** del espacio personal residen en el mapping `actor_personal_workspace(actor_id → tenant_id)`, **no** en el nombre visible (§17-bis 11-12).
- Cambiar el idioma **no** crea otro tenant; repetir el onboarding con otro locale devuelve el mismo tenant (§17-bis 13-14, §14 caso 4).
- El nombre localizado es **presentación**, no identificador de seguridad (§17-bis 15).
- Preferencia expresa: **clave server-owned** (por ejemplo `workspace.personal.default`) localizada en presentación; alternativa admisible sólo si el esquema exige nombre persistido, con etiqueta seleccionada por el servidor desde su catálogo cerrado (§17-bis 16-17).

Amenazas STRIDE nuevas cubiertas: `S16` (escalada vía `name` libre) y `S17` (enumeración vía locale). Ambas con riesgo residual cero por construcción.

## 6 · OBS-Q1-2

Enunciado normativo aplicado en §4 (pregunta 19 nueva sobre re-registro con mismo email y 20 sobre sign out), §6 (I-10 + I-11 + I-12 nuevas), §13 (`S18` reclamo automático de tenant + `S19` operación durante eliminación + `S20` fuga de estado interno), §14 (casos 10, 11, 12, 13, 15, 16, 17 nuevos), §16 (métricas `lifecycle_blocked_total`, `body_fields_ignored_total`, `locale_hint_rejected_total`), §17 (rectificado) y §17-ter (secciones A-H exhaustivas).

## 7 · Solución contractual del ciclo de eliminación

Concentrada en §17-ter. Distinciones exhaustivas:

- **A · Sign out** — finaliza sesión, no borra nada; el siguiente login del mismo `sub` recupera el mismo espacio.
- **B · Desactivación de membership** — reversible/administrativa; el onboarding reactiva idempotentemente sin duplicar espacios.
- **C · Solicitud de eliminación de cuenta** — registrada antes de eliminar Auth cuando sea posible; revoca sesiones; impide nuevos onboardings; auditable; no destruye inmediatamente si hay gracia o retención obligatoria; cliente recibe respuesta pública estable sin causa interna.
- **D · Eliminación definitiva de Auth** — la ausencia de FK a `auth.users` no exime de responsabilidad sobre mappings huérfanos; ningún flujo automático permite que una nueva identidad reclame el tenant anterior; email no es identidad ni clave de recuperación.
- **E · Retención legal** — separada de la retención ordinaria; sólo conserva lo jurídicamente necesario; acceso restringido, finalidad definida, plazo controlado; el usuario no puede operar normalmente; duración configurable **pendiente de validación jurídica**.
- **F · Borrado o anonimización por categoría** — tabla con 10 categorías (mapping personal, memberships, tenant, conversaciones, mensajes, traducciones, usage ledger, auditoría, contenido compartido con terceros, datos bajo obligación legal), tratamiento por defecto para cada una y excepciones. **No se fija arbitrariamente ningún plazo de 30 días** — política configurable pendiente de dictamen jurídico.
- **G · Mappings huérfanos** — mecanismo contractual: job periódico, detección, cuarentena lógica antes de acción destructiva, **prohibición de reasignación automática**, idempotencia, auditoría, respeto a legal hold, borrado o anonimización según política aprobada.
- **H · Comportamiento del onboarding por estado** — tabla que fija respuestas estables y opacas (alfabeto cerrado `200/401/500/503/404`) para actor activo, ya onboarded, con membership desactivada, con solicitud de eliminación, eliminado, bajo legal hold, con mapping huérfano/inconsistente. Prohibido inventar códigos nuevos que enumeren causas.

## 8 · Decisiones que permanecen abiertas para validación jurídica

Q1-R identifica y aísla las decisiones que **no** puede resolver un contrato técnico sin dictamen profesional:

- Plazo concreto de gracia tras solicitud de eliminación (`deletion_pending`).
- Duración de la retención legal (`legal_hold`) y criterios de finalización.
- Plazo tras el cual una categoría concreta se anonimiza o se elimina.
- Mecanismo técnico definitivo de anonimización (hash irreversible, rotación de claves, tombstone, etc.) por categoría.
- Política sobre contenido compartido con terceros (disociación vs bloqueo vs conservación limitada).
- Frecuencia y ventana de ejecución del job de reconciliación de mappings huérfanos.
- Autorización explícita para el mecanismo de recuperación administrativa cuando un usuario legítimo pide recuperar el tenant tras eliminación.
- Códigos definitivos del alfabeto cerrado por estado (§17-ter H) — Q1-R propone `401 unauthorized` opaco pero admite alternativa dentro del alfabeto cerrado; cierre en 9.3.2-A-Q2 tras validación.

Q1-R **prohíbe expresamente** afirmar cumplimiento jurídico definitivo hasta que estas decisiones estén dictaminadas.

## 9 · Matriz añadida

Q1-R sustituye la matriz Q1 §14 (38 escenarios técnicos) por una **matriz contractual de 20 casos** con seis columnas cada uno: **entrada · comportamiento server-side · estado persistido · respuesta pública · invariantes cubiertas · auditoría necesaria**. La matriz absorbe los escenarios técnicos Q1 como pruebas derivables en 9.3.2-A-Q3.

Los 20 casos son: 1 primer onboarding · 2 repetición inmediata · 3 dos solicitudes concurrentes · 4 repetición con otro locale · 5 locale desconocido · 6 locale manipulado · 7 etiqueta libre del cliente · 8 actor sin sesión · 9 membership activa · 10 membership desactivada · 11 actor con solicitud de eliminación · 12 actor Auth ya eliminado · 13 mapping huérfano · 14 tenant existente sin mapping · 15 mapping existente sin tenant válido · 16 actor bajo legal hold · 17 re-registro con mismo email · 18 fallo intermedio y rollback · 19 dos actores diferentes · 20 intento de enviar `tenantId`, `role` u `ownerId`.

Notas transversales relevantes:

- Casos 4, 5, 6, 7 y 20 fuerzan cumplimiento de OBS-Q1-1.
- Casos 10, 11, 12, 13, 15, 16, 17 fuerzan cumplimiento de OBS-Q1-2.
- La respuesta pública en casos 11-13, 15, 16 se enmascara en §17-ter H — nunca enumera causa interna.
- Los 14 escenarios `e2e/auth-continuity.spec.ts` (barrera Q3-E2E-R) deben permanecer verdes tras 9.3.2-A-Q3.

## 10 · Confirmación de cero implementación

- Cero migración creada, modificada o eliminada.
- Cero endpoint HTTP creado, modificado o eliminado.
- Cero cambio en `lib/v2/server/`, `lib/v2/client/`, `app/api/v2/`, `engine/`, `supabase/`.
- Cero cambio en tests (unit, integration, HTTP-frontier, E2E).
- Cero cambio en workflows CI (`.github/workflows/*`).
- Cero cambio en dependencias o lockfiles.
- Cero cambio en configuración de Supabase local.
- Cero cambio en la rama `main`.
- Cero fila insertada en el schema `spabla_v2`.
- Cero contenedor Docker levantado por esta unidad.

Q1-R es exclusivamente documental.

## 11 · Archivos modificados

- `A docs/phases/SPABLA_V2_FASE_9_HITO_9_3_2_A_ONBOARDING_CONTRACT.md` — nueva versión rectificada Q1-R (sustituye al blob `b991852…` en el nuevo commit sobre la rama nueva; el blob original permanece intacto en su rama original).
- `A docs/audit_reports/AUDIT_2026-08-24_hito-9-3-2-a-q1-r-onboarding-contract.md` — este acta.

Únicamente dos archivos autorizados. Ningún otro archivo tocado por Q1-R.

## 12 · Compatibilidad con contratos anteriores

- **Contrato marco (`SPABLA_V2_FASE_9_HITO_9_3_2_PASSWORDLESS_OTP_CONTRACT.md` R2)** — no modificado. Q1-R cierra §9.3 (unicidad) y §9.4 (semántica del tenant personal) del marco tal como ya hacía Q1, ahora resolviendo las dos observaciones pendientes.
- **Contrato Q1 (`b991852…`)** — no modificado. Su rama y blob permanecen intactos. Q1-R lo sustituye normativamente para 9.3.2-A pero preserva el 90 % de su contenido literal (invariantes I-1..I-9, opción C, RPC, migración, RLS, grants, observabilidad, matriz de 20 casos, GO/NO-GO). Q1-R añade I-10..I-13, S16..S20 nuevos, §17-bis, §17-ter, casos 10-17 de la matriz y una tabla de responsabilidades por categoría en §17-ter F.
- **Contratos de fases anteriores** (Q3-P auth continuity, R3 natural context, hito 9.2 trece idiomas) — no modificados.
- **Contratos de hitos posteriores** (9.3.2-B OTP email) — no adelantados. Q1-R no autoriza su inicio.

## 13 · Riesgos residuales

Enumerados en §18 del contrato Q1-R. En resumen:

- **R-A..R-E** — heredados de Q1 sin cambio sustancial.
- **R-F** *(rectificado)* — riesgo de localización mitigado estructuralmente porque la unicidad no depende del nombre.
- **R-G** *(nuevo)* — política jurídica no validada; Q1-R prohíbe afirmar cumplimiento definitivo.
- **R-H** *(nuevo)* — job de reconciliación con contrato pero sin implementación; reparación manual con auditoría mientras tanto.
- **R-I** *(nuevo)* — respuestas HTTP opacas dificultan diagnóstico legítimo por operadores; mitigado con observabilidad server-side y `correlationId`.
- **R-J** *(nuevo)* — whitelist de 13 locales y códigos canónicos deben verificarse contra el resolver activo antes de fijar la firma final.

## 14 · Criterios para iniciar Q2

`9.3.2-A-Q2` requiere, además del GO documental de este contrato Q1-R:

1. **Dictamen jurídico** sobre plazos de retención, política de anonimización, gracia por eliminación, y viabilidad legal del mecanismo de recuperación administrativa.
2. **Verificación cruzada** de la whitelist de 13 locales y sus códigos canónicos contra el resolver activo de 9.2 y la representación efectiva en producción.
3. **Cierre operativo** del alfabeto de respuestas para §17-ter H dentro del alfabeto cerrado heredado.
4. **Autorización explícita** para diferir el job de reconciliación de mappings huérfanos a subhito posterior manteniendo procedimiento manual auditado.
5. **Fecha concreta de la migración** (`<YYYYMMDD>`) respetando orden lexicográfico.
6. **Confirmación** de que ningún trabajo paralelo modificará la oficial hasta que 9.3.2-A-Q4 promueva.

Sin estas condiciones, Q2 permanece bloqueado por Dirección.

## 15 · CI de la rama

Se completará tras finalización del CI del commit único que introduce Q1-R. Formato esperado:

- **Run**: `<URL github>`.
- **Attempt**: 1 (sin rerun).
- **Conclusion**: success.
- **Jobs A/B/C/D**: success.
- **Job D**: 14 passed / 0 failed / 0 skipped / 0 did not run.
- **§20-6 (kill + restart)**: verde.
- **Escenario 14 (anti-falso-positivo)**: verde.
- **PostgreSQL 17 client**: instalado.
- **Restore drill**: PASS.

Si el CI falla, se cumplirá NO-GO y esta acta se congela con la evidencia observada.

---

**Estado del acta**: cerrada. Ninguna implementación autorizada por esta unidad. Q1-R queda pendiente de revisión de Dirección para conceder GO documental y avanzar a 9.3.2-A-Q2.
