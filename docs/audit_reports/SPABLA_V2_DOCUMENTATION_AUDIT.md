# SPABLA V2 — Auditoría Documental Global (Fase 0.4)

Fecha: 2026-07-06.
Autor: auditoría automatizada bajo `SPABLA_V2_DOCUMENTATION_STANDARD.md`.
Commit HEAD auditado: `348dd4c` (rama `spabla-v2/fase-4-translation`).
Ámbito: todos los documentos SPABLA V2 publicados (incluyendo planes de
Fase en ramas distintas de HEAD).

Objetivo: obtener el mapa completo de la deuda documental antes de seguir
desarrollando. **No se modifica ningún documento en este commit.** La
decisión de normalizar queda diferida al jefe de proyecto.

---

## Documentos auditados

| # | Documento | Ruta | Rama/Origen | Líneas | Tipo (§2 estándar) | Límite |
|---|---|---|---|---|---|---|
| 1 | Product Core | `docs/SPABLA_V2_PRODUCT_CORE.md` | HEAD | 213 | Producto | 400 |
| 2 | Architecture | `docs/SPABLA_V2_ARCHITECTURE.md` | HEAD | 353 | Arquitectura | 600 |
| 3 | Engine | `docs/SPABLA_V2_ENGINE.md` | HEAD | 453 | Arquitectura | 600 |
| 4 | Documentation Standard | `docs/SPABLA_V2_DOCUMENTATION_STANDARD.md` | HEAD | 400 | Estándar | 400 |
| 5 | Fase 2 — Messaging | `docs/phases/SPABLA_V2_PHASE_2_MESSAGING_PLAN.md` | `spabla-v2/fase-2-messaging` @ `105e294` | 385 | Fase | 400 |
| 6 | Fase 3 — STT | `docs/phases/SPABLA_V2_PHASE_3_STT_PLAN.md` | `spabla-v2/fase-3-stt` @ `56928f4` | 449 | Fase | 400 |
| 7 | Fase 4 — Translation | `docs/phases/SPABLA_V2_PHASE_4_TRANSLATION_PLAN.md` | `spabla-v2/fase-3-stt` @ `5d77f15` | 534 | Fase | 400 |
| 8 | Fase 5 — TTS | `docs/phases/SPABLA_V2_PHASE_5_TTS_PLAN.md` | HEAD | 787 | Fase | 400 |

Notas sobre alcance: los planes de Fase 2, 3 y 4 no están presentes en
HEAD de la rama actual — viven en sus ramas de implementación. Se
auditan tal como están publicados en origin.

---

## 1. Product Core

**Veredicto: APTO.**

Cumple estructura §8, dentro del límite (213/400), producto puro, único
propósito. Las referencias a `SPABLA_V2_ARCHITECTURE.md` y
`SPABLA_V2_ENGINE.md` son textuales y no usan enlaces Markdown relativos
(§6 del estándar recomienda enlaces relativos). Se considera diferencia
estética, no incumplimiento.

---

## 2. Architecture

**Veredicto: REQUIERE AJUSTES.**

**Motivo 1 — Cuerpos completos de contratos.** El §3 imprime la
definición literal de `CallSession` y `CallState`. Según §5 del estándar:
"Arquitectura NO contiene: cuerpos de contratos (solo nombres)". Los
cuerpos deben vivir en el documento de la fase que los introduce (aquí,
en `SPABLA_V2_ENGINE.md` §4 o en el plan de la fase correspondiente).

- Documento destino: `SPABLA_V2_ENGINE.md` §4 (donde ya existe la versión
  completa y ampliada del contrato).
- Cambio mínimo: sustituir el cuerpo del §3 por el nombre del tipo y un
  enlace relativo a `SPABLA_V2_ENGINE.md#4-contrato-callsession`.

**Motivo 2 — Contrato `CallSession` duplicado.** El mismo tipo aparece en
`SPABLA_V2_ENGINE.md §4` con más campos (`languagePair`, `endedBy`). Dos
versiones divergentes del mismo contrato son deuda directa (§7 del
estándar).

- Documento destino: fuente única en `SPABLA_V2_ENGINE.md §4`.
- Cambio mínimo: dejar el §3 de Architecture como resumen de una línea +
  referencia; borrar la variante corta del contrato.

**Motivo 3 — "Fases de construcción" (§7) replicadas por los planes de
fase.** La tabla de fases enumera cada fase con módulos y tag esperado;
cada `phases/*.md` también lo hace. Regla del estándar §7: "Un contrato
tipado vive en el documento de la fase que lo introduce. Fases
posteriores no lo re-imprimen; solo lo referencian."

- Documento destino: cada `PHASE_N_*_PLAN.md` para el detalle; Architecture
  solo mantiene la lista de nombres/orden.
- Cambio mínimo: en §7 reducir la tabla a nombre + slug de tag; eliminar
  la columna "Módulos activos" y la de "Alcance" detallado.

**Motivo 4 — Estructura de carpetas (§6) desalineada con el estado
actual.** La estructura propuesta (`modules/`, `app/(chat)/[…]`,
`server/…`) corresponde al roadmap original V2 monorepo; la
implementación actual del Engine V2 vive en un paquete
`engine/src/…`. Un lector nuevo obtiene una imagen falsa.

- Documento destino: la sección debe reflejar la realidad actual o
  marcarse explícitamente como aspiracional/histórica.
- Cambio mínimo: añadir un párrafo introductorio al §6 aclarando "estado
  a fecha X"; o dividir en dos: "estructura actual (engine/)" y "roadmap
  cliente (app/)".

**Motivo 5 — "Sobre lo salvable de V1" es contenido de decisión/ADR.**
Registra una decisión con contexto ("solo se porta X"). El estándar §2 y
§4 ubican decisiones no obvias en `docs/decisions/DECISION_*.md`.

- Documento destino: `docs/decisions/DECISION_2026-XX-XX_v1-portable-items.md`.
- Cambio mínimo: mover el bloque al ADR y dejar un puntero en Architecture.

---

## 3. Engine

**Veredicto: REQUIERE AJUSTES.**

**Motivo 1 — Cuerpos completos de todos los contratos.** §4–§7 imprimen
`CallSession`, `ConversationSession`, `Participant`, `LanguagePair` con
cuerpo completo. Regla del estándar §5: cuerpos van al plan de fase que
los introduce. Estos cuatro contratos nacieron formalmente en el plan
`docs/phases/SPABLA_V2_PHASE_1_ENGINE_FOUNDATION_PLAN.md` (no
publicado bajo este nombre — es la Fase 1 de Foundation). El Engine.md
actual mezcla arquitectura + plan de fase 1.

- Documento destino: crear (o localizar) el plan de la Fase 1 Foundation
  y trasladar allí los cuerpos; en Engine.md dejar solo nombres y
  enlaces.
- Cambio mínimo: el §4–§7 se reduce a nombres de tipo + link a la fase.

**Motivo 2 — Contrato `CallSession` duplicado con Architecture.** Ver §2
Motivo 2. La fuente única debe estar en la fase que lo introdujo, no en
dos documentos de nivel arquitectura.

**Motivo 3 — Eventos §8 desactualizados.** El listado de eventos
menciona `turn.started`, `utterance.partial`, `utterance.final`,
`translation.emitted`, `translation.failed`, `audio.chunk.produced`,
`turn.completed`, `adapter.*.status`. Los nombres reales del Engine tras
Fases 2–4 son otros (`stt.partial`, `stt.final`, `translation.completed`,
`translation.failed`, `translation.request.created`, …). El documento
induce a error a cualquier lector nuevo.

- Documento destino: cada fase mantiene sus eventos; Engine solo debería
  mantener la lista de eventos foundation (call.*, participant.*,
  languagePair.*, telemetry.*) y referenciar a los planes de fase para
  el resto.
- Cambio mínimo: purgar del §8 todo evento que no sea foundation; añadir
  al pie un párrafo "eventos específicos de módulo — ver plan de la fase
  correspondiente".

**Motivo 4 — "Reglas de arquitectura obligatorias" (bloque final) son
contenido de estándar, no de arquitectura.** Reglas normativas ("cero
dependencia directa", "límite de tamaño de archivo", "cero código
funcional fuera de adaptadores", etc.). §4 del estándar: "Estándares
contiene reglas normativas".

- Documento destino: nuevo estándar de código
  `docs/SPABLA_V2_CODE_STANDARD.md` (tipo Estándar).
- Cambio mínimo: mover el bloque a ese estándar; en Engine.md dejar
  puntero.

**Motivo 5 — "Definición operativa de estable" es estándar transversal.**
Los 5 criterios se repiten en cada plan de fase con adaptaciones.
Deberían vivir en un único `docs/SPABLA_V2_RELEASE_STANDARD.md` (tipo
Estándar) al que las fases citen y del que declaren los ajustes
específicos.

- Documento destino: nuevo `docs/SPABLA_V2_RELEASE_STANDARD.md`.
- Cambio mínimo: mover el bloque a ese estándar; los planes de fase
  añaden solo el DELTA (nº de tests exacto, cobertura por módulo, etc.).

**Motivo 6 — Adaptadores §10.** El bloque enumera `STTAdapter`,
`TranslationAdapter`, `TTSAdapter`, `WebRTCAdapter`, `SocketAdapter`,
`SupabaseAdapter` con cuerpos. Fases 3, 4 y 5 los redefinen (Fase 4.1
elevó `MTAdapter` con `translate` obligatorio; Fase 5 define
`TTSAdapter` como `AsyncIterable`). Los cuerpos actuales en Engine.md
están desalineados.

- Documento destino: cada adaptador vive en el plan de la fase que lo
  introduce. Engine.md solo enumera nombres.
- Cambio mínimo: sustituir cuerpos por nombres + enlace al plan.

**Motivo 7 — "Consecuencia sobre `SPABLA_V2_ARCHITECTURE.md`" al cierre.**
Este bloque modifica en prosa lo que Architecture dice ("la tabla de
dependencias del §2 de arquitectura se sustituye por…"). Es un ADR
disfrazado.

- Documento destino: `docs/decisions/DECISION_2026-XX-XX_engine-mediates-all-modules.md`.
- Cambio mínimo: mover el párrafo al ADR; actualizar Architecture con la
  nueva versión (que también requiere ajuste, ver §2 arriba).

---

## 4. Documentation Standard

**Veredicto: REQUIERE AJUSTES.**

**Motivo — Sección "Entregable" en un documento de Estándares.** El §8
del propio estándar establece: "Al cierre, sección 'Entregable' que
explicita qué autorización abre (no aplica a Producto/Arquitectura/
Estándares)". El propio documento incluye §14 "Entregable de este
documento". Auto-incumplimiento leve.

- Documento destino: el propio archivo.
- Cambio mínimo: renombrar §14 a "Aplicación" o "Vigencia" (contenido
  similar sin usar la etiqueta reservada) o eliminar el título "Entregable"
  y dejar solo el cuerpo como cierre.

Adicionalmente, el nombre del archivo de esta auditoría
(`SPABLA_V2_DOCUMENTATION_AUDIT.md`, solicitado literalmente por el jefe
de proyecto) no sigue la convención §9 del estándar
(`AUDIT_YYYY-MM-DD_<SCOPE>.md`). Se registra como excepción autorizada
por instrucción explícita del jefe de proyecto en este ciclo; futuras
auditorías deben seguir la convención.

---

## 5. Fase 2 — Messaging

**Veredicto: APTO.**

Dentro del límite (385/400), estructura correcta, base declarada,
prohibiciones explícitas, criterios de aceptación explícitos. Referencia
a `SPABLA_V2_PRODUCT_CORE.md §6` en su §9 es correcta. No duplica
arquitectura ni producto.

Nota (no bloqueante): el plan repite el criterio "V1 byte-idéntico" que
aparece en cada plan de fase. En cuanto exista
`SPABLA_V2_RELEASE_STANDARD.md` (ver §3 Motivo 5) ese criterio debería
citarse en lugar de re-imprimirse. Diferido al procedimiento §12 del
estándar.

---

## 6. Fase 3 — STT

**Veredicto: REQUIERE AJUSTES.**

**Motivo — Supera el límite de líneas (449 > 400).** El estándar §10
punto 7 y §13 exigen división por responsabilidad, no por corte
arbitrario.

- Documento destino: dividir en
  `SPABLA_V2_PHASE_3_STT_PLAN.md` (§1–§9 + §11–§12: alcance, contratos,
  eventos, prohibiciones, criterios) y
  `SPABLA_V2_PHASE_3_STT_TESTS.md` (§10: matriz detallada de tests).
- Cambio mínimo: extraer el §10 completo (tests exactos previstos) a un
  archivo hermano; el plan principal referencia con un enlace y un
  párrafo de resumen.

Nota adicional: repite el bloque "criterio de fase estable" que debería
vivir en `SPABLA_V2_RELEASE_STANDARD.md` (ver §3 Motivo 5).

---

## 7. Fase 4 — Translation

**Veredicto: REQUIERE AJUSTES.**

**Motivo — Supera el límite de líneas (534 > 400) por 134 líneas.**

- Documento destino: dividir por responsabilidad en
  `SPABLA_V2_PHASE_4_TRANSLATION_PLAN.md` (alcance, contratos,
  máquinas, eventos, API SpablaCore, criterios) y
  `SPABLA_V2_PHASE_4_TRANSLATION_INTEGRATION.md` (§8 integración STT +
  §9 integración TTS futura + §10 adapter + §11.5 test manual).
  Adicionalmente, extraer §11 (tests exactos) a
  `SPABLA_V2_PHASE_4_TRANSLATION_TESTS.md` si el principal aún supera
  400.
- Cambio mínimo: extraer §11 (tests) primero; medir; si aún > 400,
  extraer §8–§10.

Nota: contiene el mismo bloque "criterio de fase estable" duplicado.

---

## 8. Fase 5 — TTS

**Veredicto: REQUIERE AJUSTES (crítico).**

**Motivo — Supera el límite de líneas (787 > 400) por 387 líneas
(≈ doble).** Este es el mayor incumplimiento del estándar.

- Documento destino: división obligatoria por responsabilidad en al
  menos cuatro archivos:
  - `SPABLA_V2_PHASE_5_TTS_PLAN.md` (§1–§7 + §12–§14: alcance,
    contratos, máquinas, eventos, API SpablaCore, tests-resumen,
    prohibiciones, criterios).
  - `SPABLA_V2_PHASE_5_TTS_ADAPTER.md` (§10 + §11: contrato del
    `TTSAdapter` + requisitos del proveedor).
  - `SPABLA_V2_PHASE_5_TTS_INTEGRATIONS.md` (§8 Translation + §9 Audio
    Output).
  - `SPABLA_V2_PHASE_5_TTS_TESTS.md` (§12 matriz detallada de tests).
- Cambio mínimo: hacer la división en cuatro archivos; el principal
  referencia a los otros.

Nota adicional: la sección "Reglas arquitectónicas obligatorias
(reiteradas)" al cierre reimprime reglas que ya están en el prompt del
jefe de proyecto y que, según el nuevo estándar, deberían vivir en un
único `SPABLA_V2_CODE_STANDARD.md` o `SPABLA_V2_ARCHITECTURE.md`. Reduce
tamaño y elimina duplicidad si se referencia el estándar en lugar de
reimprimir.

---

## Duplicidades detectadas transversalmente

Frases y bloques que aparecen en múltiples documentos, en violación del §7
del estándar ("una regla vive en un solo sitio"):

1. **Criterios de "estable" (5 puntos originales + adaptaciones por
   fase).** Presente en: `SPABLA_V2_ENGINE.md`, plan Fase 2 §10, plan
   Fase 3 §12, plan Fase 4 §12, plan Fase 5 §14. → Extraer a
   `SPABLA_V2_RELEASE_STANDARD.md`.
2. **Criterio "V1 byte-idéntico".** En los cuatro planes de fase con
   texto idéntico. → Extraer al mismo estándar de release.
3. **Regla "no adaptador real" con listado de proveedores.** En cada
   fase con proveedores distintos, pero la regla base es idéntica. →
   Extraer regla genérica al futuro `SPABLA_V2_CODE_STANDARD.md`; cada
   fase solo añade su lista específica de proveedores prohibidos.
4. **Regla "ningún archivo > 300 líneas".** En `SPABLA_V2_ENGINE.md` y
   en cada plan de fase. → Ya candidata a
   `SPABLA_V2_CODE_STANDARD.md`.
5. **Contrato `CallSession`.** En `SPABLA_V2_ARCHITECTURE.md §3` y en
   `SPABLA_V2_ENGINE.md §4` con cuerpos divergentes. → Fuente única en
   el plan de la Fase 1 Foundation.

---

## Referencias verificadas

- `SPABLA_V2_PRODUCT_CORE.md` cita `SPABLA_V2_ARCHITECTURE.md` y
  `SPABLA_V2_ENGINE.md` — existen.
- `SPABLA_V2_ARCHITECTURE.md` cita `docs/phases/phase-N-<slug>.md` con un
  esquema de nombres antiguo (no cumple §9 del estándar de nombres). Los
  planes reales son `SPABLA_V2_PHASE_<N>_<AREA>_PLAN.md`.
- `SPABLA_V2_ENGINE.md` cita `docs/phases/phase-N.md` y
  `docs/phases/phase-N-test-script.md` — el segundo no existe en ninguna
  rama. Referencia rota.
- `SPABLA_V2_ENGINE.md` menciona `adapters/openai-*.ts`,
  `adapters/deepgram-*.ts` como paths internos — no existen en el árbol
  del Engine actual (`engine/src/`).
- Planes de fase citan tags de base (`spabla-v2-engine-foundation-2026-07-04`,
  `spabla-v2-phase-2-messaging-2026-07-04`, `spabla-v2-phase-3-stt-2026-07-06`,
  `spabla-v2-phase-4-translation-2026-07-06`). Verificados presentes en
  el repositorio.
- Ningún documento cita a
  `SPABLA_V2_DOCUMENTATION_STANDARD.md` todavía — es normal por ser
  recién publicado; no rompe nada, pero indica que las próximas
  ediciones deben referenciarlo.

---

## Documentos legacy V1 (no bajo este estándar, informativo)

Presentes en `docs/`: `architecture.md`, `product.md`, `roadmap.md`,
`vision.md`, `workflow.md`, `SOUND_SYSTEM.md`, `PROJECT_STATUS.md`,
`RELEASE_CALLS_STABLE_2026_06_16.md`, `NEXT_SESSION.md`, `decisions.md`.

Excluidos del alcance por el §2 del estándar de documentación: "Documentos
legacy V1 (…) NO caen bajo este estándar. Quedan como archivo histórico y
no deben modificarse."

Ninguno de ellos fue auditado.

---

## Resumen final

| Documento | Veredicto |
|---|---|
| Product Core | **APTO** |
| Architecture | **REQUIERE AJUSTES** (contratos con cuerpo; CallSession duplicado; carpetas obsoletas; ADR embebido) |
| Engine | **REQUIERE AJUSTES** (contratos con cuerpo; eventos obsoletos; reglas normativas embebidas; criterios de estable embebidos; adaptadores desalineados; ADR embebido; referencias rotas) |
| Documentation Standard | **REQUIERE AJUSTES** (sección Entregable en documento de Estándar) |
| Fase 2 — Messaging | **APTO** |
| Fase 3 — STT | **REQUIERE AJUSTES** (449 > 400 líneas) |
| Fase 4 — Translation | **REQUIERE AJUSTES** (534 > 400 líneas) |
| Fase 5 — TTS | **REQUIERE AJUSTES (crítico)** (787 > 400 líneas; casi 2×) |

Duplicidades transversales pendientes: 5 (criterios de estable, V1
byte-idéntico, prohibición de proveedores, cap 300 líneas, contrato
CallSession).

Referencias rotas detectadas: 3 (esquema de nombres antiguo en
Architecture §7; `phase-N-test-script.md` inexistente en Engine §11;
paths `adapters/*.ts` inexistentes en Engine §10).

Nuevos documentos que la normalización requeriría crear (si el jefe de
proyecto autoriza la ronda de ajustes):

- `docs/SPABLA_V2_CODE_STANDARD.md` (reglas normativas de código).
- `docs/SPABLA_V2_RELEASE_STANDARD.md` (criterios "estable" únicos).
- Al menos un `docs/decisions/DECISION_*.md` para extraer las
  decisiones embebidas en Architecture (§Sobre lo salvable de V1) y
  Engine (§Consecuencia sobre ARCHITECTURE.md).

---

## Decisión pendiente

Este documento es una **auditoría**. No modifica nada. Corresponde al
jefe de proyecto decidir:

- **Opción A**: normalizar toda la deuda documental antes de abrir Fase
  5 de implementación. Requiere una ronda de commits documentales bajo
  el procedimiento §12 del estándar, con ADRs para cada cambio no
  trivial.
- **Opción B**: aceptar la deuda documental como conocida y seguir con
  la Fase 5 de implementación. En ese caso, esta auditoría queda como
  registro para una normalización futura.
- **Opción C**: normalización parcial — priorizar los tres incumplimientos
  de tamaño (Fase 3, 4, 5) y dejar las duplicidades transversales para
  después.

Ninguna de las tres se ejecuta en este commit.
