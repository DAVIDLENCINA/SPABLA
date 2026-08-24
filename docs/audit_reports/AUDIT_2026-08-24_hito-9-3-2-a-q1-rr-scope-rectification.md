# SPABLA V2 · Hito 9.3.2-A-Q1-RR-SCOPE · Rectificación final del alcance Q2

**Fecha**: 2026-08-24.
**Rama documental**: `spabla-v2/hito-9-3-2-a-q1-rr-scope-rectification`.

## 1 · Contexto y problema detectado por Dirección

El contrato candidato Q1-RR-RECT (`dbb215bf0ad1ca8c682ab1504e7134ab2ccd4b1e`) resolvía correctamente OBS-Q1-1, OBS-Q1-2 y las siete regresiones documentales de Q1-R. Sin embargo, mantenía dos ambigüedades que Dirección detectó antes de autorizar la promoción:

**A · Identificador compuesto `24'` en la matriz §14**. La matriz contenía 58 filas totales pero numeradas 1-46 + `24'` + 47 + 48-57, con el `24'` como caso Q1-RR-RECT nuevo insertado entre 24 y 25. Esta numeración híbrida (mezcla de enteros y compuestos) dificultaba: (a) el conteo mecánico, (b) los crosswalks contra Q1 (38) y Q1-R (20), (c) la automatización de las pruebas Q3 que iterarían sobre los identificadores.

**B · Alcance parcial de Q2 en §17-ter I**. La sección limitaba Q2 a «casos 5-9, 11-13, 17-24, 24', 25-46, 47-51, 56, 57», enumeración que **excluía**:

- **Casos 1-4** (JWT ausente/malformado/inválido/expirado → `401` opaco) — autenticación básica que el endpoint DEBE implementar.
- **Caso 10** (mapping válido con tenant inexistente → `500` opaco, rollback, auditoría) — que el propio contrato declaraba obligatorio en §9 paso 3.a y §5 B.
- **Casos 52-55** (etiqueta libre + `deletion_pending` + Auth eliminado + mismo email) — comportamiento observable del endpoint ante estados que ya existen en base de datos y que el propio contrato declaraba obligatorio en §17-ter A-H.

Esta exclusión era incoherente: el mismo contrato normaba en §9 y §17-ter que Q2 debía detectar mapping huérfano, distinguir corrupción de eliminación legítima, reconocer `deletion_pending` y `legal_hold` con respuestas opacas estables — pero §17-ter I los excluía del alcance operativo Q2.

Dictamen de Dirección: rectificar ambas ambigüedades sin promover, sin implementar y sin modificar código productivo.

## 2 · SHAs y ramas

| Rol | SHA | Estado |
|---|---|---|
| Base oficial | `fb0a75676451b33934b149a718f3c4a55b92db3b` | intacta |
| Q1 original | `b99185263500220772f595a921c526ade0bc2acc` | intacta |
| Q1-R descartado | `00d2aa4c5d08c87619dd9d6d4cceaab39d129093` | intacto |
| Q1-RR-RECT (base directa) | `dbb215bf0ad1ca8c682ab1504e7134ab2ccd4b1e` | intacto |
| Q1-RR-SCOPE (esta unidad) | *(nuevo commit sobre dbb215b)* | en creación |
| `main` | `e6128433d42e1e105529ed2f64212ca527034b6a` | intacta |

Rama `spabla-v2/hito-9-3-2-a-q1-rr-scope-rectification` creada exactamente desde `dbb215b`, sin merge, sin cherry-pick, sin rebase, sin squash, sin amend del commit base.

## 3 · Archivos afectados

- `M docs/phases/SPABLA_V2_FASE_9_HITO_9_3_2_A_ONBOARDING_CONTRACT.md` — versión Q1-RR-SCOPE con renumeración canónica y §17-ter I rectificada.
- `A docs/audit_reports/AUDIT_2026-08-24_hito-9-3-2-a-q1-rr-scope-rectification.md` — este acta.

Cero cambio productivo. Cero test, migración, endpoint, workflow, dependencia, lockfile, `main`, configuración Supabase.

## 4 · Renumeración canónica

La matriz §14 ahora contiene exactamente 58 identificadores enteros, únicos y consecutivos:

```
1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38,
39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58
```

Cero identificador `24'`. Cero duplicado. Cero hueco.

Mapeo aplicado (antiguo → nuevo):

- 1-24 → 1-24 (idénticos).
- `24'` → **25** (caller privilegiado no puede persistir nombre arbitrario).
- 25-57 → 26-58 (todos incrementados en 1).

Referencias cruzadas actualizadas en:

- **STRIDE §13** (referencias a casos): S8 (42→43), S9 (30→31), S11 (32→33), S12 (33→34), S14 (34,35→35,36), S15 (41→42), S17 (48,49→49,50), S18 (52→55), S19 (50→53), S20 (48-53→53,54,56), S21 (24'→25).
- **§17-ter B/C/D/E** (referencias a casos): caso 52→53 (dos veces), caso 54→55, caso 55→56.
- **§20 GO/NO-GO** (punto 2: total 57→58; punto 13: casos 52-55→53-56).
- **§14 nota transversal** (casos referenciados: 45→46, 46→47, 52,53,55→53,54,56).
- **Anexo C** (Q1 → final): Q1 caso 10 → 10 + 48 (antes 47); Q1 caso 21 → 26,27,28,29,30 (antes 25,26,27,28,29); Q1 casos 22-38 → +1 cada uno (30→31, 31→32, ..., 46→47).
- **Anexo D** (Q1-R → final): Q1-R 1 → 5+49 (antes 5+48); Q1-R 4 → 49 (antes 48); Q1-R 5 → 50; Q1-R 6 → 51; Q1-R 7 → 52; Q1-R 11 → 53; Q1-R 12 → 54; Q1-R 13 → 10+48; Q1-R 14 → 58; Q1-R 15 → 10+48; Q1-R 16 → 56; Q1-R 17 → 55; Q1-R 19 → 57.

## 5 · Nueva formulación §17-ter I

La sección §17-ter I ahora comienza con la formulación normativa completa:

> Q2 implementará y probará los 58 escenarios de la matriz en cuanto describan comportamiento del endpoint, RPC, persistencia, seguridad, presentación, observabilidad o respuesta ante estados existentes. Q4-bis difiere exclusivamente los workflows operativos y jurídicos que crean, ejecutan o administran eliminación, anonimización, legal hold, recuperación y reconciliación automática.

Regla estructural incorporada: **diferir el mecanismo que crea un estado no permite diferir el comportamiento seguro de Q2 cuando ese estado ya está presente en base de datos**. Los estados `deletion_pending=true` y `legal_hold=true` deben producir respuestas opacas estables desde el primer día, mediante fixtures controlados en los tests de Q2.

## 6 · Tabla de obligaciones Q2 (extracto normativo)

La tabla completa figura en §17-ter I del contrato. Cubre 22 dimensiones que Q2 debe implementar y probar; para cada una establece: **obligación Q2 · diferido a Q4-bis · motivo · cobertura de prueba correspondiente**. Categorías:

- Autenticación (casos 1-4).
- Creación e idempotencia (casos 5, 6, 7, 8, 11, 12, 13, 58).
- Reactivación (caso 9).
- **Mapping huérfano y corrupción estructural** (casos 10, 48) → **Q2**.
- Body inesperado (casos 17-24).
- Frontera privilegiada RPC (caso 25).
- Métodos HTTP (casos 26-30).
- Estado final en DB (casos 31-34).
- Bootstrap composer (casos 35-38).
- RLS y grants (casos 39-41).
- Observabilidad (casos 42, 43).
- Rollback y restore (casos 44, 45).
- Regresión Q3-E2E-R (caso 46).
- Coste y reproducibilidad (caso 47).
- Localización server-controlled (casos 49, 50, 51).
- Prohibición de etiqueta libre (caso 52).
- **Estado `deletion_pending`** (caso 53) → **Q2 con fixture**.
- **Auth eliminado** (caso 54) → **Q2 con fixture Auth**.
- **Re-registro con mismo email** (caso 55) → **Q2 con fixture Auth**.
- **Estado `legal_hold`** (caso 56) → **Q2 con fixture**.
- Aislamiento entre actores (caso 57).

## 7 · Funciones diferidas a Q4-bis

Solo mecanismos operativos que **crean o administran** estados (no la respuesta ante esos estados):

- Anonimización automática (mecanismo técnico definitivo + plazos jurídicos).
- Recuperación administrativa del tenant tras eliminación (autorización explícita + procedimiento operativo).
- Políticas jurídicas definitivas (retención legal, contenido compartido con terceros, plazos por categoría).
- Job automático de reconciliación de mappings huérfanos (frecuencia, backoff, dead-letter, alertas).
- Flujo real que registra la solicitud de eliminación, revoca sesiones y ejecuta gracia/anonimización.
- Aplicación administrativa real del legal hold.

Todas requieren dictamen jurídico profesional antes de activarse en producción. **Ninguna bloquea Q2 mínimo** (§17-ter I tabla de decisiones legales).

## 8 · Confirmación expresa

Los cuatro casos que el problema detectado por Dirección exigía asegurar bajo Q2 quedan clasificados normativamente en Q2 y con cobertura de prueba fijada:

| Caso | Concepto | Alcance | Cobertura |
|---|---|---|---|
| 10 | Mapping válido con tenant inexistente (inconsistencia estructural §5 B) | **Q2** | Integration con fixture de corrupción forzada; el paso 3.a de la RPC detecta y lanza `RAISE 23503` → `500 internal` opaco |
| 48 | Tenant eliminado manualmente sin flujo autorizado (§5 D) | **Q2** | Integration con fixture explícito; comportamiento idéntico al caso 10 |
| 53 | Actor con solicitud de eliminación en curso (`deletion_pending=true`) | **Q2** | Integration con fixture `actor_lifecycle_state.deletion_pending=true`; handler responde `503 unavailable` opaco sin invocar la RPC |
| 56 | Actor bajo legal hold (`legal_hold=true`) | **Q2** | Integration con fixture `actor_lifecycle_state.legal_hold=true`; handler respeta la bandera; `503 unavailable` opaco |

Adicionalmente los casos 54 (Auth eliminado) y 55 (re-registro con mismo email) también se prueban en Q2 mediante fixtures Auth.

## 9 · Crosswalks

- **Anexo C** actualizado: 38 originales Q1 → matriz final 1-58. Cero pérdida. 32 preservados literales, 5 ampliados (casos 20→20-24 y 21→26-30), 1 con semántica rectificada (caso 10 Q1 → 10 + 48 final).
- **Anexo D** actualizado: 20 casos Q1-R → matriz final 1-58. Cero pérdida. 3 rectificados semánticamente (Q1-R 4, 13, 15), 4 desagregados (Q1-R 3, 8, 18, 20), 1 fusionado coherentemente (Q1-R 9).

Ambos crosswalks preservan totalmente la cobertura Q1 y Q1-R.

## 10 · Decisiones cerradas preservadas sin cambio

Q1-RR-SCOPE **no altera** ninguna de las decisiones cerradas en Q1-RR-RECT:

- Catálogo canónico de 13 idiomas: `es, ca, en, fr, de, it, pt, zh, ja, ko, ar, hi, ru`.
- Prohibición explícita de `eu`, `gl`, `nl`, `sv`, `zh-Hans` como locales activados.
- Firma RPC de un único parámetro: `admin_ensure_personal_workspace(p_actor_id uuid)`.
- Clave interna fija `workspace.personal.default` codificada en la propia función SQL.
- Semántica de mapping huérfano (§5 A/B/C/D).
- Alfabeto HTTP cerrado `200/401/404/500/503` con códigos por estado interno.
- RLS + grants + `SECURITY DEFINER`.
- Rollback aditivo + FK `ON DELETE RESTRICT`.
- Cero llamadas OpenAI durante pruebas (caso 47).
- Continuidad de sesión R3 natural context intocada.
- Invariantes I-1..I-15 preservadas.

## 11 · Validaciones documentales

| Comprobación | Resultado |
|---|---|
| Matriz §14: 58 identificadores enteros consecutivos 1-58 | ✓ verificado |
| Cero `24'` como identificador de matriz | ✓ (menciones remanentes son históricas en el preámbulo y §7 header, contextos correctos) |
| Cero identificadores duplicados | ✓ |
| Cero huecos entre 1 y 58 | ✓ |
| Crosswalk 38 → final completo | ✓ Anexo C |
| Crosswalk 20 Q1-R → final completo | ✓ Anexo D |
| Mapping huérfano (caso 10) clasificado como Q2 | ✓ §17-ter I |
| Corrupción por eliminación manual (caso 48) clasificado como Q2 | ✓ §17-ter I |
| `deletion_pending` (caso 53) reconocido y probado en Q2 | ✓ §17-ter I con fixture |
| `legal_hold` (caso 56) reconocido y probado en Q2 | ✓ §17-ter I con fixture |
| Workflows jurídicos reales diferidos a Q4-bis | ✓ §17-ter I |
| RPC con un único parámetro `p_actor_id uuid` | ✓ §9, I-14, §15 |
| Catálogo exacto de 13 idiomas | ✓ §17-bis 6 |
| Cero `eu`/`gl`/`nl`/`sv`/`zh-Hans` presentados como activados | ✓ solo en prohibiciones explícitas |
| `git diff --check` | ✓ OK |
| Cero conflict markers | ✓ |
| Cero secretos | ✓ |
| Exactamente 2 archivos afectados (1 M + 1 A) | ✓ |
| Cero cambio productivo | ✓ |

## 12 · Confirmación de cero implementación

- Cero migración creada, modificada o eliminada.
- Cero endpoint HTTP.
- Cero cambio en `lib/v2/server`, `lib/v2/client`, `app/api/v2`, `engine/`, `supabase/`.
- Cero cambio en tests (unit, integration, HTTP-frontier, E2E).
- Cero cambio en workflows CI, dependencias, lockfiles, configuración Supabase local, rama `main`.
- Cero fila insertada en el schema `spabla_v2`.
- Cero contenedor Docker levantado por esta unidad.

Q1-RR-SCOPE es exclusivamente documental.

## 13 · Compatibilidad con contratos anteriores

- **Contrato marco 9.3.2 R2** — no modificado.
- **Contrato Q1 original** (`b991852…`) — no modificado.
- **Contrato Q1-R** (`00d2aa4…`) — no modificado.
- **Contrato Q1-RR-RECT** (`dbb215b…`) — no modificado. Q1-RR-SCOPE lo sustituye normativamente pero preserva sus decisiones cerradas.
- **Plan trece idiomas V1.1 §14** — respetado.
- **ADR-005 `LangCode`** — respetado.
- **Continuidad de sesión R3 natural context** — no tocada.
- **`http-error.ts`** — subset válido del alfabeto de 7 códigos globales.

## 14 · Riesgos residuales

Mismos que Q1-RR-RECT §18, sin adiciones ni cierres nuevos:

- R-A..R-E heredados de Q1 sin cambio material.
- R-F rectificado (localización mitigada estructuralmente).
- R-G política jurídica no validada; **no bloquea Q2 mínimo** (§17-ter I).
- R-H job de reconciliación con contrato pero sin implementación; reparación manual con auditoría mientras tanto.
- R-I respuestas HTTP opacas dificultan diagnóstico legítimo por operadores; mitigado con observabilidad y `correlationId`.
- **R-J cerrado** — whitelist verificada contra el resolver activo.
- **R-K cerrado** — firma RPC verificada segura de extremo a extremo.
- R-L (menor) — consulta adicional en el paso 3.a con coste `O(1)`; despreciable.

## 15 · CI final de la rama

Se completará tras la finalización del CI del commit único que introduce Q1-RR-SCOPE. Formato esperado:

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

**Estado del acta**: cerrada. Ninguna implementación autorizada por esta unidad. Q1-RR-SCOPE queda pendiente de revisión de Dirección para conceder GO documental y avanzar a 9.3.2-A-Q2 dentro del alcance completo de los 58 escenarios de la matriz §14 según la formulación normativa §17-ter I.
