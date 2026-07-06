# SPABLA V2 — Auditoría Documental Post-Normalización (Fase 0.5)

Fecha: 2026-07-06.
Autor: auditoría automatizada bajo
[`SPABLA_V2_DOCUMENTATION_STANDARD.md`](../SPABLA_V2_DOCUMENTATION_STANDARD.md).
Rama: `spabla-v2/fase-4-translation`.
Ámbito: mismo que la auditoría previa
[`SPABLA_V2_DOCUMENTATION_AUDIT.md`](SPABLA_V2_DOCUMENTATION_AUDIT.md), más
los dos estándares nuevos creados en esta ronda.

Contexto: la Fase 0.5 (normalización documental) tenía scope acotado por
el jefe de proyecto:

- Reducir los tres planes de fase por encima del cap (Fase 3, 4, 5).
- Corregir referencias rotas dentro de los planes de fase.
- Corregir auto-incumplimiento del Documentation Standard.
- Crear únicamente `docs/standards/SPABLA_V2_RELEASE_STANDARD.md` y
  `docs/standards/SPABLA_V2_CODE_STANDARD.md` como documentos nuevos.
- **NO modificar** Product Core, Architecture, ni Engine.

Los hallazgos previos en Architecture y Engine se documentan aquí sin
cambio de estado, porque el propio scope de la fase los excluyó de la
normalización.

---

## Documentos auditados

| # | Documento | Ruta | Líneas | Tipo | Límite |
|---|---|---|---:|---|---:|
| 1 | Product Core | `docs/SPABLA_V2_PRODUCT_CORE.md` | 213 | Producto | 400 |
| 2 | Architecture | `docs/SPABLA_V2_ARCHITECTURE.md` | 353 | Arquitectura | 600 |
| 3 | Engine | `docs/SPABLA_V2_ENGINE.md` | 453 | Arquitectura | 600 |
| 4 | Documentation Standard | `docs/SPABLA_V2_DOCUMENTATION_STANDARD.md` | 400 | Estándar | 400 |
| 5 | Code Standard | `docs/standards/SPABLA_V2_CODE_STANDARD.md` | 245 | Estándar | 400 |
| 6 | Release Standard | `docs/standards/SPABLA_V2_RELEASE_STANDARD.md` | 206 | Estándar | 400 |
| 7 | Fase 2 — Messaging | `docs/phases/SPABLA_V2_PHASE_2_MESSAGING_PLAN.md` (rama `fase-2-messaging`) | 385 | Fase | 400 |
| 8 | Fase 3 — STT | `docs/phases/SPABLA_V2_PHASE_3_STT_PLAN.md` | 383 | Fase | 400 |
| 9 | Fase 4 — Translation | `docs/phases/SPABLA_V2_PHASE_4_TRANSLATION_PLAN.md` | 395 | Fase | 400 |
| 10 | Fase 5 — TTS | `docs/phases/SPABLA_V2_PHASE_5_TTS_PLAN.md` | 379 | Fase | 400 |

Notas: los planes de Fase 2, 3 y 4 auditados previamente vivían solo en
sus ramas de implementación; los planes 3, 4 y 5 auditados aquí son las
versiones normalizadas presentes en la rama actual, que sustituyen a las
versiones históricas de las ramas de implementación. La versión Fase 2
sigue en su rama original y no requirió ajustes (ya cumplía).

---

## 1. Product Core

**Veredicto: APTO.**

Sin cambios frente a la auditoría previa. Dentro del límite, producto
puro, único propósito.

---

## 2. Architecture

**Veredicto: REQUIERE AJUSTES (invariante).**

Los cinco hallazgos de la auditoría previa se mantienen:

1. Cuerpos completos de contratos (§3 CallSession) — prohibido por
   [Documentation Standard §5](../SPABLA_V2_DOCUMENTATION_STANDARD.md#5-contenido-prohibido-por-documento)
   para tipo Arquitectura.
2. Contrato `CallSession` duplicado con Engine §4.
3. Tabla de fases (§7) reimpresa por cada plan de fase.
4. Estructura de carpetas (§6) desalineada con `engine/src/`.
5. Bloque "Sobre lo salvable de V1" — ADR embebida.

**Estado**: el scope explícito de Fase 0.5 excluyó modificar este
documento. La deuda queda mapeada y diferida al procedimiento
[Documentation Standard §12](../SPABLA_V2_DOCUMENTATION_STANDARD.md#12-modificar-un-documento-ya-aprobado)
para una ronda posterior de normalización si se autoriza.

---

## 3. Engine

**Veredicto: REQUIERE AJUSTES (invariante).**

Los siete hallazgos de la auditoría previa se mantienen: cuerpos completos
de contratos, `CallSession` duplicado con Architecture, eventos §8
desactualizados frente al Engine V2 actual, reglas de arquitectura y
definición de "estable" que ahora podrían citar
[`Code Standard`](../standards/SPABLA_V2_CODE_STANDARD.md) y
[`Release Standard`](../standards/SPABLA_V2_RELEASE_STANDARD.md),
adaptadores §10 desalineados con Fase 4.1, ADR embebida al cierre,
referencias rotas.

**Estado**: mismo scope que Architecture. Deuda diferida. Los dos
estándares nuevos creados en esta ronda (Code Standard y Release
Standard) son precisamente los destinos naturales de la deuda
identificada; pero moverla requeriría editar Engine.md, fuera de scope.

---

## 4. Documentation Standard

**Veredicto: APTO.**

El auto-incumplimiento previo (§14 "Entregable" en un documento de
Estándar) queda resuelto: la sección ahora se llama "Vigencia y
aplicación", que no colisiona con la etiqueta reservada del §8. Sin
otros cambios de contenido.

---

## 5. Code Standard (nuevo)

**Veredicto: APTO.**

Documento nuevo creado en Fase 0.5. Dentro del límite (245/400), estructura
oficial cumplida, único propósito (reglas transversales de código del
Engine). Contiene:

- Configuración de TypeScript obligatoria.
- Cap de líneas por archivo con patrón de extracción documentado.
- Encapsulación de `SpablaCore`.
- Adapter isolation con enforcement en tipo y runtime.
- Prohibiciones transversales (APIs del navegador, proveedores IA).
- Grep templates de verificación.
- Excepciones autorizadas.

Sirve como fuente única para las reglas que hasta ahora se repetían en
cada plan de fase.

---

## 6. Release Standard (nuevo)

**Veredicto: APTO.**

Documento nuevo creado en Fase 0.5. Dentro del límite (206/400).
Contiene los ocho criterios universales de "estable" que hasta ahora se
repetían en cada plan de fase (Fase 2 §10, Fase 3 §12, Fase 4 §13, Fase
5 §14) y el procedimiento de cierre. Cada plan de fase ahora referencia
este estándar y aporta solo su DELTA.

---

## 7. Fase 2 — Messaging

**Veredicto: APTO (invariante).**

Sin cambios frente a la auditoría previa. Fase 0.5 no la modificó porque
ya cumplía (385/400). Sigue viviendo en su rama `spabla-v2/fase-2-messaging`.

Nota diferida: contiene el bloque "criterio de fase estable" que hoy
podría citar `Release Standard` en lugar de imprimirlo. No es
bloqueante; se aplicará si se abre una ronda §12 sobre esa rama.

---

## 8. Fase 3 — STT (normalizado)

**Veredicto: APTO.**

Reducido de 449 → 383 líneas (66 líneas menos). Cambios:

- §11 "Prohibiciones" ahora referencia
  [Code Standard §6](../standards/SPABLA_V2_CODE_STANDARD.md#6-prohibiciones-transversales)
  y solo declara el DELTA específico de Fase 3.
- §12 "Criterio de fase estable" ahora referencia
  [Release Standard §2](../standards/SPABLA_V2_RELEASE_STANDARD.md#2-criterios-universales)
  y solo declara el DELTA (nº de tests, cobertura por módulo, base tag,
  prohibiciones específicas, tag propuesto).
- §5 "Archivos exactos previstos" compactado en formato inline
  preservando todos los file paths y estimaciones.
- §9 "Métodos SpablaCore" compactado combinando firma + precondiciones +
  efecto en párrafos densos.

Sin información eliminada; todo el contenido específico se preserva o se
delega a un estándar transversal. Referencias verificadas: todas apuntan
a documentos existentes en HEAD.

---

## 9. Fase 4 — Translation (normalizado)

**Veredicto: APTO.**

Reducido de 534 → 395 líneas (139 líneas menos). Cambios:

- §12 "Prohibiciones" y §13 "Criterio de fase estable" ahora referencian
  Code Standard y Release Standard; solo declaran DELTA.
- §7.1 `startTranslation` incorpora el `languagePair?` opcional aplicado
  en Fase 4.1 (con mención explícita al DELTA).
- §11 tests compactado en formato inline denso preservando el reparto
  exacto (25 + 30 = 55).
- §10 Adapter compactado, contratos preservados verbatim.
- §8 y §9 (integraciones documentadas) mantenidos con la información
  clave, prosa ajustada.

Sin información eliminada. Referencias verificadas: todas válidas.

---

## 10. Fase 5 — TTS (normalizado)

**Veredicto: APTO.**

Reducido de 787 → 379 líneas (408 líneas menos, ~51 % de reducción).
Cambios:

- §13 "Prohibido" y §14 "Criterios" referencian Code Standard y Release
  Standard; solo declaran DELTA específico de Fase 5.
- El bloque final "Reglas arquitectónicas obligatorias (reiteradas)" ha
  sido eliminado como reimpresión — su contenido vive íntegramente en
  Code Standard §6 y en las reglas del propio Engine.md.
- §11 requisitos del proveedor consolidado en párrafos densos que
  preservan las cinco categorías (streaming, ordering, cancelación,
  timeout, correlación, backpressure).
- §12 tests reescritos en formato inline denso preservando el reparto
  30 + 30 = 60.
- §10 Adapter simplificado apuntando a §11 para el detalle del contrato.

Sin información eliminada, salvo la reimpresión explícita de reglas
transversales que ahora viven en Code Standard.

---

## Duplicidades transversales resueltas

De las 5 duplicidades identificadas en la auditoría previa:

| # | Duplicidad | Estado |
|---|---|---|
| 1 | Criterios de "estable" en 5 documentos | **Resuelto**: fuente única en Release Standard §2. Fases 3–5 referencian; Fase 2 pendiente (rama congelada). |
| 2 | "V1 byte-idéntico" en cada fase | **Resuelto**: fuente única en Release Standard §2.7. |
| 3 | Regla "no proveedores reales" en cada fase | **Resuelto**: regla base en Code Standard §6.2; cada fase declara solo su lista específica de proveedores. |
| 4 | "300 líneas por archivo" en Engine + fases | **Resuelto**: fuente única en Code Standard §3. Engine.md sigue conteniendo la copia legacy; deuda diferida. |
| 5 | Contrato `CallSession` en Architecture + Engine | **Pendiente**: fuera de scope Fase 0.5 (no modificar Architecture/Engine). |

---

## Referencias verificadas

- Todos los enlaces relativos dentro de los planes de fase normalizados
  resuelven: `../standards/SPABLA_V2_CODE_STANDARD.md`,
  `../standards/SPABLA_V2_RELEASE_STANDARD.md`,
  `../SPABLA_V2_DOCUMENTATION_STANDARD.md`.
- Los anclajes tipo `#N-titulo` referencian secciones existentes en los
  documentos destino (verificación manual).
- Referencias rotas identificadas en la auditoría previa que vivían en
  Engine.md y Architecture.md siguen presentes por scope (no
  modificado). Se recomienda auditar de nuevo si el usuario autoriza una
  ronda sobre esos documentos.

---

## Resumen final

| Documento | Veredicto |
|---|---|
| Product Core | **APTO** |
| Architecture | REQUIERE AJUSTES (invariante — fuera de scope Fase 0.5) |
| Engine | REQUIERE AJUSTES (invariante — fuera de scope Fase 0.5) |
| Documentation Standard | **APTO** |
| Code Standard | **APTO** (nuevo) |
| Release Standard | **APTO** (nuevo) |
| Fase 2 — Messaging | **APTO** (invariante) |
| Fase 3 — STT | **APTO** (normalizado 449 → 383) |
| Fase 4 — Translation | **APTO** (normalizado 534 → 395) |
| Fase 5 — TTS | **APTO** (normalizado 787 → 379) |

- **Documentos APTOS**: 8/10.
- **Documentos REQUIERE AJUSTES**: 2/10 (Architecture, Engine —
  explícitamente fuera del scope de esta fase por decisión del jefe de
  proyecto).
- **Todos los documentos dentro del límite de líneas**: sí.
- **Todos los planes de fase ≤ 400**: sí (383, 395, 379).
- **Duplicidades transversales críticas eliminadas**: 4 de 5.
- **Referencias rotas en documentos normalizados**: 0.

---

## Autorización de Fase 5

El scope de Fase 0.5 se cumple íntegramente: los tres planes de fase
quedan bajo 400 líneas, se crean los dos estándares acordados, se corrige
el auto-incumplimiento del Documentation Standard, y las referencias en
los documentos normalizados están vivas.

Los dos veredictos "REQUIERE AJUSTES" restantes (Architecture, Engine)
fueron **excluidos por instrucción explícita** del jefe de proyecto en
esta fase. Son deuda documental conocida y mapeada, no bloqueante para
la implementación funcional del Engine V2 (donde el código es fuente de
verdad y los documentos técnicos son referencia).

La decisión de autorizar la implementación de Fase 5 corresponde al
jefe de proyecto a la vista de este reporte. Este auditor recomienda:

- **Autorizar Fase 5**: los planes de fase que gobiernan directamente
  la implementación (Fase 5 y previos) cumplen el estándar; los
  estándares transversales quedan consolidados; la deuda residual en
  Architecture/Engine no afecta al código.
- **Programar** una ronda §12 posterior sobre Architecture y Engine,
  cuando sea conveniente, para eliminar la deuda restante — sin
  bloquear el desarrollo.
