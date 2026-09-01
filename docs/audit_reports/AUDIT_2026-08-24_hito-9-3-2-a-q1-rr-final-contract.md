# SPABLA V2 · Hito 9.3.2-A-Q1-RR-RECT · Contrato final sin regresiones

**Fecha**: 2026-08-24.
**Rama documental**: `spabla-v2/hito-9-3-2-a-q1-rr-final-contract`.

## 1 · SHA oficial de base

`fb0a75676451b33934b149a718f3c4a55b92db3b` (`spabla-v2/thirteen-languages-activation`), cerrada por `HITO 9.3.1-Q3-E2E-R3-P · CONTINUIDAD NATURAL PROMOVIDA A OFICIAL — CERRADO`. CI autorizante de la base: [`32755010804`](https://github.com/DAVIDLENCINA/SPABLA/actions/runs/32755010804) attempt 1 · success · Jobs A/B/C/D success · Job D 14 passed · PostgreSQL 17 · restore drill PASS.

## 2 · SHA del contrato original Q1

`b99185263500220772f595a921c526ade0bc2acc` (rama `spabla-v2/hito-9-3-2-a-q1-onboarding-contract`, intacta en `origin`).

## 3 · SHA Q1-R descartado

`00d2aa4c5d08c87619dd9d6d4cceaab39d129093` (rama `spabla-v2/hito-9-3-2-a-q1-r-onboarding-contract`, intacta en `origin`). Descartado como candidato de promoción por dictamen `HITO 9.3.2-A-Q1-RR · RECTIFICACIÓN DOCUMENTAL ADICIONAL REQUERIDA — NO PROMOVER`.

## 4 · Hallazgos de Q1-RR sobre Q1-R

La revisión Q1-RR identificó siete defectos que Q1-RR-RECT resuelve exhaustivamente:

- **H1** · Matriz Q1-R redujo los 38 escenarios técnicos originales de Q1 a 20 casos contractuales, con pérdida material de **6 escenarios eliminados** (verbos HTTP no permitidos como caso de test, RLS `authenticated` sin `SELECT`, RPC no invocable por `anon`, RPC no invocable por `authenticated`, rollback `DROP TABLE ... CASCADE` sin efecto sobre `tenants`, cero llamadas OpenAI durante pruebas), **1 debilitado** (Q1 caso 20 «arrays, strings, jamás 500» redujo su alcance) y **1 con cambio semántico silencioso** (Q1 caso 10 «tenant personal eliminado → crea uno nuevo, fuera de alcance» transformado en Q1-R caso 15 «mapping sin tenant → `500`» sin trazar la evolución).
- **H2** · La whitelist Q1-R §17-bis 6 listaba `es, ca, eu, gl, en, fr, de, it, pt, nl, sv, ar, zh-Hans` — **5 códigos que no están activados** en la UI de los 13 (`eu`, `gl`, `nl`, `sv` existen en el motor de 55 pero no en `UI_LANGUAGE_OPTIONS`), **1 código con sufijo prohibido** (`zh-Hans` rechazado por `isLangCode` según Plan V1.1 §10), **5 códigos activados omitidos** (`ja`, `ko`, `hi`, `ru`, `zh` canónico). La matriz Q1-R caso 4 incluso usaba `eu-ES` como ejemplo de locale válido.
- **H3** · Q1-R §14 caso 4 usaba código inexistente `eu-ES` como locale válido — arrastrando el error de la whitelist a la matriz.
- **H4** · Q1-R §9 proponía firma RPC `admin_ensure_personal_workspace(uuid, text)` con `p_workspace_label text` server-owned pero sin CHECK/enum. Riesgo: cualquier caller `service_role` (jobs, migraciones, scripts admin) podría pasar texto arbitrario y persistirlo en `tenants.name`. La afirmación Q1-R «no texto libre del cliente» era correcta; la afirmación implícita «cero texto arbitrario en frontera privilegiada» **no** lo era.
- **H5** · Q1-R §17-ter H dejaba abiertos los códigos concretos para los estados `deletion_pending` y `legal_hold` («`401` o `503` según cierre operativo Q2»), postergando una decisión que Q1-RR-RECT puede tomar sin bloquear Q2.
- **H6** · Acta Q1-R línea 42 afirmaba «alineada con el hito 9.2» sin evidencia. Materialmente incorrecto.
- **H7** · Acta Q1-R §8 agrupaba las 8 decisiones legales sin clasificarlas por bloqueo real de Q2, induciendo a interpretar que todas bloquean el onboarding inicial.

## 5 · Pérdida de escenarios detectada

Cuantificación exacta por la revisión Q1-RR (Anexo C del contrato final):

- 38 escenarios originales de Q1 §14 clasificados: **A = 8** (preservados literales), **B = 22** (preservados equivalentes en Q1-R), **D = 6** (eliminados de la matriz de tests), **E = 1** (debilitado), **F = 1** (indeterminado por cambio semántico).
- Q1-RR-RECT **restaura los 6 D** (casos §14 finales 25-29 verbos, 38 RLS, 39-40 grants, 43 rollback DROP TABLE, 46 cero OpenAI), **corrige el E** (§14 finales 20-24 con contrato «jamás 500 por parseo»), **resuelve el F** (§14 finales 10+47 distinguiendo B/D del §5). Cero escenario original queda sin cubrir tras la rectificación.

## 6 · Whitelist incorrecta detectada

Q1-R §17-bis 6 listaba como whitelist activada:

```
es, ca, eu, gl, en, fr, de, it, pt, nl, sv, ar, zh-Hans
```

Diagnóstico exhaustivo:

- **8 códigos correctos**: `es`, `ca`, `en`, `fr`, `de`, `it`, `pt`, `ar`.
- **4 códigos no activados**: `eu` (Euskera), `gl` (Gallego), `nl` (Holandés), `sv` (Sueco). Existen en el catálogo técnico del motor (`LangCode`, 55 códigos ISO 639-1, `engine/src/types/language.ts`) pero **no** están activados en la UI de los 13. Q1-R confundía el catálogo técnico con el catálogo activado.
- **1 código con sufijo prohibido**: `zh-Hans`. **Rechazado** por `isLangCode` (Plan V1.1 §10 prohíbe variantes con sufijo de script). El código canónico activado es `zh`.
- **5 códigos activados omitidos**: `ja`, `ko`, `hi`, `ru`, `zh` (canónico).

**Contaminación derivada**: Q1-R §14 caso 4 usa `Accept-Language: eu-ES` como locale válido — `eu-ES` es rechazado por `isLangCode` (variante regional) y `eu` no está activado.

Origen del error: el acta Q1-R línea 42 afirmaba «alineada con el hito 9.2» sin verificar contra la fuente canónica.

## 7 · Riesgo de `p_workspace_label`

Q1-R §9 proponía firma:

```sql
admin_ensure_personal_workspace(p_actor_id uuid, p_workspace_label text)
```

- `p_workspace_label text` sin CHECK, sin enum, sin whitelist server-side dentro de la función.
- Q1-R §9 lo justificaba explícitamente: «La función no valida su contenido porque el adaptador lo garantiza».
- **Vector de escalada**: cualquier caller `service_role` distinto del handler HTTP (jobs de mantenimiento futuros, migraciones de datos, scripts admin, sesiones psql interactivas, herramientas de operaciones) puede invocar la RPC pasando cualquier `text`, y ese `text` se persistirá en `tenants.name` sin validación adicional.
- La afirmación Q1-R «no texto libre del cliente» era correcta pero **no** cubría el vector de caller privilegiado. El propio Q1-R §17-bis 16-17 admitía como alternativa persistir una clave (`workspace.personal.default`), pero no lo exigía.
- Clasificación FASE 5 Q1-RR: **B con condición** — aceptable si Q2 elige la variante clave/enum; **C** si Q2 mantiene `text` sin CHECK.

## 8 · Decisión RPC final de un parámetro

Q1-RR-RECT §9, I-14 y S21 fijan normativamente:

**Firma final única**: `admin_ensure_personal_workspace(p_actor_id uuid)`.

- Prohibido añadir `p_workspace_label`, `p_label_key`, `p_locale`, `p_name`, o cualquier `text` procedente del endpoint o de otro caller.
- La clave interna fija `workspace.personal.default` se codifica en la propia función SQL (`c_workspace_key constant text`).
- `admin_create_tenant(c_workspace_key)` recibe exclusivamente esa constante.
- La presentación localizada se resuelve **en el handler HTTP** mediante `PersonalWorkspaceLabelPresenter.labelFor(canonicalLocale)`, sin volver a tocar la RPC.
- Ningún caller privilegiado puede persistir texto arbitrario por esta vía.
- Cierra completamente H4, D-9 y R-K.

Adicionalmente, la RPC añade el **paso 3.a** que detecta mapping huérfano (`SELECT 1 FROM tenants WHERE id = v_existing_tenant`) y `RAISE EXCEPTION USING ERRCODE = '23503'` cuando el tenant referenciado no existe. El adaptador convierte esa excepción en `500 internal` opaco (§10, §14 caso 10). Cierra la ruta «silenciosamente crea otro tenant» del Q1 §14 caso 10.

## 9 · Catálogo canónico real de trece idiomas

Verificado contra `lib/v2/client/ui-languages.ts` (`UI_LANGUAGE_OPTIONS`) y `docs/phases/SPABLA_V2_FASE_9_THIRTEEN_LANGUAGES_PLAN.md` V1.1 §14 (aprobado y congelado 2026-08-11):

```
es    Español          ca  Català           en  English
fr    Français         de  Deutsch          it  Italiano
pt    Português        zh  中文（简体）       ja  日本語
ko    한국어            ar  العربية           hi  हिन्दी
ru    Русский
```

- Todos minúsculas.
- Sin sufijos regionales (`-ES`, `-JP`, `-BR`, `-CN`).
- Sin sufijos de script (`-Hans`, `-Hant`, `-Latn`).
- Función de normalización: `isLangCode(value)` en `engine/src/types/language.ts:38` — rechaza mayúsculas, variantes regionales, sufijos de script, padding.
- `SUPPORTED_LANG_CODES` contiene 55 códigos ISO 639-1 (superconjunto técnico); el catálogo activado por la UI es el subconjunto exacto de 13 listado arriba.
- Cualquier futura ampliación (BCP-47, variantes regionales, script tags) requiere ADR/contrato propio; **no se improvisará en Q2** (Q1-RR-RECT §17-bis).

Q1-RR-RECT §17-bis 6 y §14 casos 48-51 usan exclusivamente los códigos del catálogo real. Los ejemplos incorrectos de Q1-R (`eu-ES`, `zh-Hans`) se sustituyen por códigos válidos (`ja-JP` normalizado a `ja`; `zh-Hans` explícitamente enumerado como variante prohibida en el caso 50).

## 10 · Matriz final y crosswalk

**Matriz final Q1-RR-RECT §14**: **58 filas** = 46 escenarios base numerados 1-46 + caso `24'` Q1-RR-RECT nuevo (caller privilegiado no puede persistir nombre arbitrario) + caso 47 Q1-RR-RECT nuevo (tenant eliminado manualmente = corrupción del caso B/D) + 10 casos 48-57 procedentes de Q1-R integrados (locales canónico/desconocido/manipulado, etiqueta libre, `deletion_pending`, Auth eliminado, mismo email re-registrado, legal hold, dos actores, tenant legacy sin mapping).

Cada caso tiene 6 columnas: **entrada · comportamiento server-side · estado persistido · respuesta pública · invariantes cubiertas · auditoría/prueba**.

**Crosswalks**:

- **Anexo C · 38 escenarios originales Q1 → matriz final**: los 38 originales se preservan íntegramente en 46 escenarios finales base. Clasificación: 32 preservados literales (A o B), 5 ampliados (Q1 caso 20 desdoblado en 20-24, Q1 caso 21 desdoblado en 25-29), 1 con semántica rectificada explícitamente documentada (Q1 caso 10 → §5 B/D + casos 10 y 47). **Cero pérdida**.
- **Anexo D · 20 casos Q1-R → matriz final**: los 20 se preservan; 3 se rectifican semánticamente (Q1-R 4, 13, 15 usaban ejemplos o comportamiento con divergencia contra el catálogo real o contra la distinción B/D), 4 se desagregan por mayor precisión (Q1-R 3 → 12+13, Q1-R 8 → 1-4, Q1-R 18 → 14+15, Q1-R 20 → 17+18+19), 1 se fusiona coherentemente (Q1-R 9 con caso 6). **Cero pérdida**.

Verificado por auditoría `grep`/`awk`:
- 58 filas en la matriz §14.
- Los 5 métodos HTTP (`GET`/`PUT`/`PATCH`/`DELETE`/`HEAD`) presentes (casos 25-29).
- Los 3 casos RLS/grants presentes (38-40).
- Rollback `DROP TABLE ... CASCADE` presente (43).
- «Cero OpenAI» presente (46).
- «Body array» + «Body string» + «Body numérico o null» + meta-caso `24` presentes (20-24).
- «Jamás 500 por parseo» aparece 6 veces en el contrato.

## 11 · Decisión sobre mapping huérfano

Q1-RR-RECT §5 distingue explícitamente cuatro subvariantes que Q1 y Q1-R confundían:

- **A · Mapping válido + tenant válido**: caso normal, idempotente (§14 casos 5, 6).
- **B · Mapping existente + tenant inexistente**: inconsistencia estructural. `500 internal` opaco, rollback, cuarentena. Ningún flujo automático recrea ni reasigna. Cubierto por §14 caso 10.
- **C · Eliminación legítima completada**: solo alcanzable por el futuro flujo autorizado (§17-ter). Mapping eliminado/anonimizado/tombstone según contrato futuro. Re-registro Auth (nuevo `sub`) = actor nuevo con nuevo mapping (§14 caso 54). Cero recuperación automática (I-12).
- **D · Tenant eliminado manualmente dejando mapping**: se trata como **corrupción del caso B**, no como eliminación legítima. Cubierto por §14 caso 47.

El antiguo Q1 §14 caso 10 («tenant personal eliminado → crea uno nuevo, fuera de alcance») queda **explícitamente descartado** en su semántica de recreación silenciosa. La evolución se documenta en §5, §14 casos 10 y 47, D-11, S21 y en el Anexo C del contrato.

## 12 · Contrato HTTP cerrado

Alfabeto cerrado (subset de `http-error.ts`): `200`, `401`, `404`, `500`, `503`. Tabla normativa fijada en §10 con códigos concretos por estado interno:

| Estado interno | Código HTTP |
|---|---|
| activo (sin mapping) | `200 OK` |
| ya onboarded | `200 OK` |
| membership desactivada | `200 OK` (reactivación) |
| mapping huérfano recién detectado (§9 3.a) | `500 internal` |
| mapping huérfano en cuarentena (§17-ter G) | `503 unavailable` |
| solicitud de eliminación (`deletion_pending`) | `503 unavailable` |
| bajo retención legal (`legal_hold`) | `503 unavailable` |
| Auth eliminado (sub no válido) | `401 unauthorized` |

- `409 Conflict` **no se usa** (la unicidad se resuelve internamente por advisory lock + PK).
- `422` **no está en el alfabeto**.
- `400 bad_request` **no se usa** para body inesperado (I-7' garantiza que se ignora sin error de campo).
- `correlationId` UUID v4 en cada respuesta.

## 13 · Alcance mínimo Q2 (no bloqueado por decisiones legales)

Q1-RR-RECT §17-ter I clasifica explícitamente. **Q2 puede implementar** sin dictamen jurídico:

- Migración `actor_personal_workspace` + RPC `admin_ensure_personal_workspace(uuid)`.
- Endpoint `POST /api/v2/onboarding` body `{}`.
- Catálogo cerrado server-owned de 13 etiquetas (códigos reales del catálogo activado).
- Presenter server-side.
- Idempotencia + concurrencia + reactivación de membership.
- Ajuste `bootstrap.ts:90`.
- RLS + grants.
- Rollback.
- Observabilidad.
- Errores opacos.
- Tabla `actor_lifecycle_state` mínima con banderas `deletion_pending` y `legal_hold` (para casos 52, 55 §14).
- Casos §14 finales **5-9, 11-24, 24', 25-29, 30-46, 47-51, 56, 57**.

## 14 · Funciones legales diferidas

**Diferido a Q4-bis** (con feature flag off + auditoría manual mientras tanto):

- Activación productiva de eliminación de cuenta.
- Activación productiva de legal hold.
- Anonimización automática.
- Reconciliación automática de mappings huérfanos.
- Recuperación administrativa.

Ocho decisiones identificadas por Q1-R clasificadas por Q1-RR-RECT §17-ter I:

| Decisión | Bloquea Q2 mínimo | Bloquea activación productiva |
|---|---|---|
| Plazo de gracia tras `deletion_pending` | **No** | Sí |
| Duración de `legal_hold` | **No** | Sí |
| Plazo de anonimización por categoría | **No** | Sí |
| Mecanismo técnico de anonimización | **No** | Sí |
| Política sobre contenido compartido con terceros | **No** | Sí |
| Frecuencia del job de reconciliación | **No** | Sí (procedimiento manual auditado como puente) |
| Autorización mecanismo de recuperación administrativa | **No** | Sí |
| Códigos definitivos §17-ter H | **Cerrado por Q1-RR-RECT** | — |

## 15 · Confirmación de cero implementación

- Cero migración creada, modificada o eliminada.
- Cero endpoint HTTP creado, modificado o eliminado.
- Cero cambio en `lib/v2/server`, `lib/v2/client`, `app/api/v2`, `engine/`, `supabase/`.
- Cero cambio en tests (unit, integration, HTTP-frontier, E2E).
- Cero cambio en workflows CI (`.github/workflows/*`).
- Cero cambio en dependencias o lockfiles.
- Cero cambio en configuración de Supabase local.
- Cero cambio en la rama `main`.
- Cero fila insertada en el schema `spabla_v2`.
- Cero contenedor Docker levantado por esta unidad.

Q1-RR-RECT es exclusivamente documental.

## 16 · Compatibilidad con contratos anteriores

- **Contrato marco (`SPABLA_V2_FASE_9_HITO_9_3_2_PASSWORDLESS_OTP_CONTRACT.md` R2)** — no modificado. Q1-RR-RECT cierra §9.3 y §9.4 del marco.
- **Contrato Q1 original (`b991852…`)** — no modificado. Rama y blob intactos.
- **Contrato Q1-R (`00d2aa4…`)** — no modificado. Rama y blob intactos.
- **Plan trece idiomas V1.1 §14** — no modificado. Q1-RR-RECT usa exactamente los 13 códigos activados.
- **ADR-005 `LangCode`** — respetada. Q1-RR-RECT trabaja sobre el subconjunto de 13 activados en la UI, no altera el catálogo técnico de 55.
- **Contrato marco §9 línea 168** (alfabeto onboarding 401/500/503/404) — Q1-RR-RECT compatible; añade `200 OK` explícito.
- **`http-error.ts`** — Q1-RR-RECT usa subset válido del alfabeto de 7 códigos globales.
- **Continuidad de sesión (R3 natural context)** — no tocada.
- **API pública `POST /api/v2/onboarding`** — coincide con marco §9.
- **Prohibición de acceso cliente a RPC privilegiada** — reforzada por I-14.

## 17 · Riesgos residuales

Detalle en §18 del contrato Q1-RR-RECT:

- R-A..R-E heredados de Q1 sin cambio material.
- R-F rectificado (localización mitigada estructuralmente porque la unicidad no depende del nombre).
- R-G · política jurídica no validada; Q1-RR-RECT prohíbe afirmar cumplimiento definitivo. **No bloquea Q2 mínimo** según §17-ter I.
- R-H · job de reconciliación con contrato pero sin implementación; reparación manual con auditoría mientras tanto.
- R-I · respuestas HTTP opacas dificultan diagnóstico legítimo por operadores; mitigado con observabilidad y `correlationId`.
- **R-J cerrado**: whitelist verificada contra el resolver activo.
- **R-K cerrado**: firma RPC verificada segura de extremo a extremo.
- R-L (nuevo, menor): consulta adicional `SELECT ... FROM tenants` en el paso 3.a con coste `O(1)` — despreciable.

## 18 · CI final de la rama

Se completará tras finalización del CI del único commit que introduce Q1-RR-RECT. Formato esperado:

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

**Estado del acta**: cerrada. Ninguna implementación autorizada por esta unidad. Q1-RR-RECT queda pendiente de revisión de Dirección para conceder GO documental y avanzar a 9.3.2-A-Q2 dentro del alcance mínimo definido en §17-ter I.
