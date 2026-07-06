# SPABLA V2 — Documentation Standard (Fase 0.3)

Estándar oficial. Rige TODA la documentación de SPABLA V2 desde el commit
en que se aprueba. No aplica retroactivamente a documentos ya congelados
en fases anteriores; sí aplica a cualquier documento nuevo o a cualquier
modificación futura de uno existente.

---

## 1. Filosofía de la documentación

La documentación no es descripción del código; es **contrato previo** al
código. Se escribe antes de implementar y se lee antes de leer código.
Sirve para:

- Alinear intención con el jefe de proyecto **antes** de tocar archivos.
- Dar a cualquier persona nueva un mapa navegable del sistema sin
  necesidad de leer todo el fuente.
- Cerrar decisiones para que no vuelvan a re-negociarse fase tras fase.
- Auditar en el futuro por qué existe cada regla.

Principios operativos:

- **Fuente única.** Cada afirmación vive en un solo documento; el resto
  referencia.
- **Delta explícito.** Cada fase documenta solo su diferencia frente a la
  anterior. No repite el estado previo.
- **Referenciar antes que copiar.** Enlazar a `docs/X.md#seccion` en
  lugar de duplicar párrafos.
- **Congelar antes de implementar.** Un documento aprobado y taggeado
  queda inmutable hasta que un procedimiento formal (§12) autorice la
  modificación.

---

## 2. Tipos de documento

Solo existen los seis tipos siguientes. Cualquier documento nuevo debe
clasificarse en uno; si no encaja, es señal de que sobra o de que hay que
crear un tipo nuevo por escrito antes de escribirlo.

| Tipo | Prefijo/Ruta | Ejemplo |
|---|---|---|
| **Producto** | `docs/SPABLA_V2_PRODUCT_*.md` | `SPABLA_V2_PRODUCT_CORE.md` |
| **Arquitectura** | `docs/SPABLA_V2_ARCHITECTURE*.md` | `SPABLA_V2_ARCHITECTURE.md` |
| **Estándares** | `docs/SPABLA_V2_*_STANDARD.md` | `SPABLA_V2_DOCUMENTATION_STANDARD.md` |
| **Fase** | `docs/phases/SPABLA_V2_PHASE_N_*_PLAN.md` | `SPABLA_V2_PHASE_5_TTS_PLAN.md` |
| **Auditoría** | `docs/audit_reports/AUDIT_YYYY-MM-DD_*.md` | `AUDIT_2026-07-06_phase-4.md` |
| **Decisión** (ADR) | `docs/decisions/DECISION_YYYY-MM-DD_*.md` | `DECISION_2026-07-06_no-async-bus.md` |

Documentos legacy V1 (`architecture.md`, `product.md`, `roadmap.md`,
`SOUND_SYSTEM.md`, etc.) NO caen bajo este estándar. Quedan como archivo
histórico y no deben modificarse.

---

## 3. Responsabilidad de cada tipo

- **Producto**: qué construye SPABLA para quién y por qué. Casos de uso,
  usuarios, escenarios, objetivos de negocio. **No** contiene tecnología.
- **Arquitectura**: bloques del sistema, límites entre ellos, contratos
  estables, reglas duras arquitectónicas. **No** contiene detalle de
  implementación por fase.
- **Estándares**: reglas transversales (documentación, código, testing,
  seguridad). Una regla vive en un solo estándar; el resto la referencia.
- **Fase**: DELTA respecto a la fase anterior. Alcance, contratos nuevos,
  eventos nuevos, tests, criterios de aceptación y prohibiciones.
- **Auditoría**: reporte inmutable de la verificación previa a un tag.
  Fechado y firmado por quien lo emite.
- **Decisión (ADR)**: registro de una decisión no obvia con contexto,
  alternativas descartadas y consecuencias. Uno por decisión.

---

## 4. Contenido permitido por documento

**Producto** contiene:
- Visión, propuesta de valor, usuarios objetivo.
- Casos de uso principales y de borde.
- Métricas de éxito, objetivos de negocio.
- Referencias a documentos legacy sólo como contexto histórico.

**Arquitectura** contiene:
- Diagrama lógico de bloques.
- Contratos estables entre bloques (nombres de tipos, no cuerpos).
- Reglas duras (p.ej. "Engine no toca el navegador").
- Hoja de ruta de fases (nombres, no planes).
- Referencias a los documentos de fase para el detalle.

**Estándares** contiene:
- Reglas normativas ("debe", "no debe").
- Procedimientos de verificación de cada regla.
- Excepciones autorizadas, si las hay.

**Fase** contiene:
- Objetivo del módulo.
- Responsabilidad exacta.
- Qué NO hará esta fase.
- Contratos nuevos (con cuerpos completos).
- Máquinas de estado nuevas.
- Eventos nuevos.
- API pública nueva a `SpablaCore`.
- Integraciones documentadas (no implementadas).
- Tests previstos.
- Prohibiciones.
- Criterios exactos de aceptación.

**Auditoría** contiene:
- Fecha, autor, commit auditado, tag propuesto.
- Verificaciones ejecutadas y su resultado literal.
- Hallazgos: archivo, línea, gravedad, solución propuesta.
- Decisión final: APROBADA / RECHAZADA / CANDIDATE.

**Decisión (ADR)** contiene:
- Fecha, autor.
- Contexto: por qué la decisión llega ahora.
- Opciones consideradas, con pros y contras.
- Decisión tomada.
- Consecuencias esperadas.

---

## 5. Contenido prohibido por documento

**Producto** NO contiene: nombres de tipos, snippets de código, contratos
técnicos, decisiones de infraestructura, credenciales, endpoints.

**Arquitectura** NO contiene: cuerpos de contratos (solo nombres),
snippets de implementación, tests, comandos de build, planes de fase.

**Estándares** NO contiene: contratos, planes de fase, casos de uso.

**Fase** NO contiene: reescritura de arquitectura ni de producto; reglas
transversales (van a estándares); prosa promocional; roadmap; retrospectiva.

**Auditoría** NO contiene: propuestas de nuevas features; documentación de
arquitectura; edits del código auditado.

**Decisión** NO contiene: plan de implementación; código; tests.

Prohibición transversal en TODOS los documentos:
- Credenciales, tokens, secretos.
- Prompts propietarios de proveedores.
- Nombres de proveedores en contratos del Engine (los adapters son
  intercambiables por regla arquitectónica).
- Emojis, salvo autorización explícita del jefe de proyecto.
- Enlaces a documentos externos que puedan cambiar sin control
  (referenciar solo docs internos, o congelar cita textual con fecha).

---

## 6. Referencias entre documentos

Regla: **referenciar antes que copiar**. Un contrato definido en `X.md#4.1`
se referencia como `Ver [Producto Core §3.1](SPABLA_V2_PRODUCT_CORE.md#31)`
o como enlace relativo Markdown.

Reglas duras:

- Toda referencia debe ser válida el día del commit. Si el destino
  cambia de sección/nombre, se actualizan referencias en el mismo commit.
- Referencias inversas (de arquitectura a fases) son permitidas pero
  breves: solo el nombre de la fase, sin resumen.
- Referencias circulares se resuelven promoviendo la afirmación
  compartida a un documento de mayor nivel (Producto o Arquitectura).
- Ningún documento debe requerir leer más de dos saltos de referencia
  para entender su propio contenido.

Estilo de cita:

- Enlaces Markdown relativos: `[Fase 4](phases/SPABLA_V2_PHASE_4_TRANSLATION_PLAN.md)`.
- Cita textual con comillas y fuente: `> "..." — Arquitectura §5.2`.

---

## 7. Reglas para evitar duplicidades

- Antes de escribir una afirmación normativa, buscar (grep + índice del
  repo) si ya existe. Si existe, referenciar y no duplicar.
- Una regla arquitectónica vive en `SPABLA_V2_ARCHITECTURE.md`. Ningún
  otro documento la reescribe; solo la cita.
- Un contrato tipado vive en el documento de la fase que lo introduce.
  Fases posteriores no lo re-imprimen; solo lo referencian y documentan
  su DELTA si lo amplían.
- Si dos documentos parecen necesitar el mismo párrafo, uno de los dos
  está mal ubicado. Se mueve al documento correcto y el otro referencia.
- Un test cuya intención es la misma que otro NO se re-especifica; se
  referencia el §del plan que ya lo define.

Detección: la auditoría documental (§11) incluye un grep de frases clave
duplicadas y una revisión del índice.

---

## 8. Estructura obligatoria

Todo documento SPABLA V2 nuevo debe seguir este esqueleto:

```
# <Título> — <Tipo> (Fase X si aplica)

<Uno o dos párrafos: qué es, para quién, base declarada (tag/commit),
autorización que abre la implementación si aplica>

---

## 1. <Sección numerada>

## 2. <Sección numerada>

...

## N. <Última sección>

---

## Entregable de este documento

<Qué produce este documento como artefacto, y qué autorización abre>
```

Reglas de estructura:

- Cabecera con título en H1 y una sola línea de propósito.
- Base declarada explícita para documentos de fase (tag y SHA).
- Secciones numeradas H2 (`## 1.`, `## 2.`, …). Sub-secciones H3.
- Separadores `---` entre bloques principales.
- Al cierre, sección "Entregable" que explicita qué autorización abre
  (no aplica a Producto/Arquitectura/Estándares).
- Sin H4 ni H5, salvo tablas complejas.
- Sin metadatos YAML frontmatter — el Markdown puro es la fuente.

---

## 9. Convención de nombres

Rutas y nombres de archivo:

- **Producto**: `docs/SPABLA_V2_PRODUCT_<AREA>.md` (`AREA` en mayúsculas
  con guiones bajos). Ej.: `SPABLA_V2_PRODUCT_CORE.md`.
- **Arquitectura**: `docs/SPABLA_V2_ARCHITECTURE.md` (canónico) más
  extensiones `SPABLA_V2_ARCHITECTURE_<AREA>.md` si es necesario.
- **Estándares**: `docs/SPABLA_V2_<AREA>_STANDARD.md`. Ej.:
  `SPABLA_V2_DOCUMENTATION_STANDARD.md`.
- **Fase**: `docs/phases/SPABLA_V2_PHASE_<N>_<AREA>_PLAN.md`. `N` es
  entero (1, 2, 4, 5); si hay revisión de fase, se usa `<N.M>` (`4.1`).
  Ej.: `SPABLA_V2_PHASE_5_TTS_PLAN.md`.
- **Auditoría**: `docs/audit_reports/AUDIT_<YYYY-MM-DD>_<SCOPE>.md`.
- **Decisión**: `docs/decisions/DECISION_<YYYY-MM-DD>_<SLUG>.md`.

Reglas de título:

- Título del documento igual al nombre del archivo sin extensión y sin
  guiones bajos: `# SPABLA V2 — Fase 5: TTS Module (plan previo)`.
- Fechas en el título solo si el nombre del archivo las lleva.

Reglas de commit message asociado:

- `docs(v2): fase N <area> — plan` para planes de fase.
- `docs(v2): <area> standard` para estándares.
- `docs(v2): architecture — <area>` para arquitectura.
- `docs(v2): product — <area>` para producto.
- `docs(v2): audit <YYYY-MM-DD> <scope>` para auditorías.
- `docs(v2): decision <YYYY-MM-DD> <slug>` para ADR.

---

## 10. Criterios de aceptación de un documento

Un documento se considera **aceptado** — apto para commit y push — sólo
si cumple los ocho criterios siguientes. Cualquier fallo bloquea el
merge.

1. **Tipo declarado.** Encaja en uno de los seis tipos del §2.
2. **Contenido dentro de lo permitido.** Cumple §4 y §5.
3. **Sin duplicidades.** Cumple §7. Verificado con revisión de índice y
   grep de frases normativas clave.
4. **Referencias válidas.** Toda referencia interna resuelve al día del
   commit. Se ejecuta un chequeo manual antes de merge.
5. **Estructura oficial.** Cumple §8.
6. **Nombre y ubicación.** Cumple §9.
7. **Dentro del límite de líneas.** Documento de:
   - Fase: ≤ 400 líneas.
   - Arquitectura: ≤ 600 líneas.
   - Producto: ≤ 400 líneas.
   - Estándares: ≤ 400 líneas.
   - Auditoría/Decisión: sin límite duro; se recomienda ≤ 300.
   Si un documento supera su límite, se divide por responsabilidad
   (§14), nunca por tamaño arbitrario.
8. **Sin prohibiciones.** Cumple la prohibición transversal del §5
   (credenciales, prompts, nombres de proveedor en Engine, emojis,
   enlaces externos volátiles).

Además de los ocho, para documentos de **fase** se exige:
- Base declarada con tag y SHA.
- Sección de prohibiciones explícita.
- Sección de criterios exactos de aceptación de la fase.

---

## 11. Procedimiento de revisión documental (auditoría documental)

Antes de aprobar cualquier fase, tag o merge de documentación se ejecuta
la auditoría documental. Es responsabilidad de quien propone el cambio.

Pasos:

1. **Inventario.** Listar los documentos afectados por el cambio y todos
   los que los referencian.
2. **Verificación de duplicidades.** Buscar frases normativas repetidas
   entre documentos con `grep -n`.
3. **Verificación de contradicciones.** Comparar reglas relacionadas
   entre estándares, arquitectura y la fase actual.
4. **Verificación de referencias.** Confirmar que cada enlace interno
   resuelve.
5. **Verificación de límites.** `wc -l` sobre cada documento cambiado.
6. **Verificación de estructura y nombres.** Contra §8 y §9.
7. **Reporte.** Un archivo `docs/audit_reports/AUDIT_<fecha>_docs.md`
   que registra qué se verificó y con qué resultado. Este reporte NO se
   modifica una vez commiteado.

Si algún paso falla, el commit se bloquea hasta corregir. La corrección
se hace en el mismo PR, no en uno posterior.

---

## 12. Modificar un documento ya aprobado

Un documento aprobado y referenciado por un tag protegido es **inmutable
por defecto**. Modificarlo requiere el procedimiento formal siguiente.

Autorización mínima:

- Cambio menor (typo, enlace roto, formato): commit directo con mensaje
  `docs(v2): fix <archivo> — <razón>`. No requiere autorización previa.
- Cambio de contenido normativo: requiere autorización explícita del
  jefe de proyecto **antes** de tocar el archivo. La autorización queda
  registrada en el mensaje del commit.

Pasos:

1. **Registrar la decisión.** Si el cambio invalida algo previamente
   aprobado, crear una **ADR** (`docs/decisions/`) explicando el porqué.
2. **Modificar solo lo necesario.** No refactorizar el documento entero
   si el cambio es acotado.
3. **Actualizar referencias.** Si cambian nombres de sección o
   documentos, todo el resto que los citaba se actualiza en el mismo
   commit.
4. **Ejecutar auditoría documental (§11).** Sin excepción.
5. **Incrementar versión implícita.** No hay número de versión en el
   frontmatter; la trazabilidad se hace por `git log` sobre el archivo.
6. **Commit y push.** El mensaje explicita: qué se cambió, por qué, y a
   qué documento(s) afectó.
7. **Tag opcional.** Si el cambio es lo bastante grande, se crea un tag
   `docs-v2-<slug>-<fecha>` que congela el nuevo estado.

Prohibido:

- Editar en silencio un documento que otros documentos referencian sin
  actualizar dichas referencias.
- Borrar párrafos aprobados sin registrar la razón en el commit o en
  una ADR.
- Rebasar/force-push sobre commits que ya introdujeron el documento en
  un tag protegido.

---

## 13. Reglas de división cuando se supera el límite

Un documento que supera su límite del §10 se divide **por
responsabilidad**, no por tamaño. Ejemplos:

- Un plan de fase que supera 400 líneas se divide en:
  `PHASE_N_<AREA>_PLAN.md` (alcance + contratos + eventos + tests) y
  `PHASE_N_<AREA>_INTEGRATION.md` (integración con fases previas /
  futuras). Ambos se referencian mutuamente.
- Un documento de arquitectura que supera 600 líneas se divide por
  bloque: `ARCHITECTURE_ENGINE.md`, `ARCHITECTURE_CORE_API.md`, etc.,
  con `ARCHITECTURE.md` como índice/mapa.

Prohibido dividir por tamaño mecánico (p.ej. cortar a la mitad sin
justificar la separación semántica).

---

## 14. Entregable de este documento

Este archivo es el estándar normativo de documentación de SPABLA V2.
Rige desde su commit. Su modificación futura requiere el procedimiento
del §12.

Aplicación inmediata:

- La próxima fase (`spabla-v2/fase-5-tts` cuando se autorice) se abre
  bajo estos criterios. El plan
  `docs/phases/SPABLA_V2_PHASE_5_TTS_PLAN.md` ya publicado será revisado
  contra este estándar en la próxima auditoría documental.
- Cualquier documento nuevo entra bajo estas reglas desde el minuto uno.
- Los documentos ya congelados en fases anteriores se dejan tal cual;
  aplican solo si se abren por el procedimiento §12.
