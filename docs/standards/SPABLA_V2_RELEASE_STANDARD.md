# SPABLA V2 — Release Standard

Estándar normativo transversal para declarar "estable" una fase del
Engine SPABLA V2 y crear el tag protegido correspondiente. Rige desde el
commit en que se aprueba.

Documento hermano: [`SPABLA_V2_CODE_STANDARD.md`](SPABLA_V2_CODE_STANDARD.md).
Estándar documental que gobierna este archivo:
[`../SPABLA_V2_DOCUMENTATION_STANDARD.md`](../SPABLA_V2_DOCUMENTATION_STANDARD.md).

---

## 1. Filosofía

"Estable" no significa "ha funcionado una vez". Significa que la fase
cumple simultáneamente los ocho criterios universales de §2, los
principios normativos permanentes de §2.9, y — si la fase introduce
transporte real, WebRTC o audio/red observable — los criterios
adicionales de §3. Que "parezca funcionar" en una prueba puntual no
califica. Es el aprendizaje directo de V1.

Un cierre estable produce siempre tres artefactos:

1. Un commit `feat(engine): fase N — <slug>` (o `fix(engine): harden phase
   N ...` para revisiones).
2. Un reporte de auditoría inmutable en `docs/audit_reports/`.
3. Un tag anotado protegido con nombre canónico (§4).

Sin los tres, la fase no es estable — es candidata.

---

## 2. Criterios universales

Estos ocho criterios aplican a **toda** fase que introduzca módulos
nuevos o modifique funcionalidad del Engine. Los planes de fase citan
este estándar y añaden solo su DELTA (§4).

1. **Suite de tests verde.** `npm --prefix engine test` sin fallos. El
   número exacto lo declara cada plan de fase (§4.1).

2. **Cobertura mínima**:
   - Global: ≥ 85 % en las cuatro métricas (statements, branches,
     functions, lines).
   - Módulo introducido: ≥ 95 % en las cuatro métricas
     individualmente. Objetivo real 100 %, aplicando los patrones
     documentados en Fase 3.1 (extracción de branches defensivas dead
     con comentario de invariante).

3. **Typecheck limpio**: `npm --prefix engine run typecheck` sin
   errores. Los flags de TypeScript de
   [`SPABLA_V2_CODE_STANDARD.md`](SPABLA_V2_CODE_STANDARD.md#2-configuración-de-typescript)
   se mantienen activos.

4. **Cero regresiones**: los tests de las fases anteriores siguen verdes
   sin modificación. `git diff` sobre los tests preexistentes = 0 (solo
   se permiten actualizaciones de fixture si el commit lo declara y una
   ADR lo justifica).

5. **Cap de tamaño**: ningún archivo `.ts` del Engine (no test) supera
   300 líneas. Absoluto 400. Cumple
   [`SPABLA_V2_CODE_STANDARD.md §3`](SPABLA_V2_CODE_STANDARD.md#3-tamaño-de-archivo).

6. **Encapsulación intacta**: `SpablaCore.prototype` no expone `Engine`,
   `EventBus` ni `Manager` alguno. Cumple
   [`SPABLA_V2_CODE_STANDARD.md §4`](SPABLA_V2_CODE_STANDARD.md#4-encapsulación-de-spablacore).

7. **V1 byte-idéntico**: `git diff spabla-stable-ot-071-targetlang-translation-2026-07-04 HEAD -- app/ server/` = 0.
   V1 permanece intacto por diseño.

8. **Grep arquitectural**: los dos greps de
   [`SPABLA_V2_CODE_STANDARD.md §11`](SPABLA_V2_CODE_STANDARD.md#11-verificación-por-grep-templates)
   (proveedores IA + APIs de navegador) devuelven 0 líneas dentro del
   ámbito de la fase.

Los ocho son bloqueantes. Cualquier fallo → la fase queda como
**candidata**, no como **stable**, y se itera antes del tag.

### 2.9 Principios normativos permanentes

Aplican simultáneamente a los ocho criterios anteriores. Rescatados
tal cual estaban formulados en la arquitectura original y en Engine
"Definición operativa de estable":

- **Precondiciones codificadas en tipos o state machines**, no solo en
  UI. Los invariantes fallan explícitamente en runtime si alguien los
  bypasea. UI-only gates están prohibidos. Cada invariante del Engine
  tiene al menos un test unitario que la verifica.
- **Sin flags de feature acumulativos.** Un motor STT / MT / TTS a la
  vez. Cero `if (USE_X_ENGINE) ...` bifurcando el pipeline. Al
  sustituir un motor se reemplaza; no coexiste.

Su incumplimiento bloquea el tag igual que los ocho numerados.

---

## 3. Criterios adicionales según naturaleza de la fase

Los criterios de §2 son necesarios pero no suficientes cuando la fase
introduce transporte real, WebRTC, adaptadores de red o audio real. En
esos casos se aplican también los criterios de esta sección. Cada plan
de fase declara explícitamente en su DELTA si le aplican.

### 3.1 Prueba real bidireccional documentada

Aplica a fases que activen transporte real entre pares (WebRTC,
señalización real, audio capturado desde micrófono, TTS reproducido en
altavoz).

- Ejecutada por humano — no automatización.
- En al menos dos combinaciones de dispositivo (mínimo Chrome desktop ↔
  iPhone Safari).
- Con capturas o logs adjuntos al reporte de auditoría.
- La prueba se documenta en un guion escrito (pasos exactos, dispositivos,
  resultados esperados) archivado junto al reporte de la fase.
- La prueba se ha ejecutado al menos tres veces por dos personas
  distintas (o dos sesiones separadas por al menos 24 h con contexto
  reseteado), con resultado idéntico.

### 3.2 Cleanup verificado post-`call.ended`

Aplica a fases con adaptadores de red o audio activos.

- En los tres escenarios (caller cuelga, callee cuelga, socket / red
  muere abruptamente) los adaptadores llegan a estado terminal
  (`closed` / `idle` / `offline`) dentro de 5 s del `call.ended`.
- Cero eventos residuales en logs durante 10 s post-cleanup.
- Ningún evento `telemetry.*` posterior a `call.ended` durante 30 s.

### 3.3 Cero regresiones en prueba real de N-1

Cuando la fase anterior contaba con una prueba real bidireccional (§3.1),
esa prueba se ejecuta de nuevo tras cerrar la fase actual y sigue
pasando idéntica.

---

## 4. DELTA por fase

Cada plan de fase declara **solo** lo específico frente a los criterios
universales. La estructura mínima del DELTA:

### 4.1 Suite mínima

- Número total de tests esperado.
- Número de tests nuevos aportados por la fase.
- Los tests preexistentes siguen verdes.

### 4.2 Módulo de dominio

- Nombre del directorio nuevo (`engine/src/<módulo>/`).
- Cobertura objetivo del módulo (≥ 95 % por defecto).

### 4.3 Prohibiciones específicas

- Proveedores concretos prohibidos en la fase (lista puntual, se suma a
  la lista transversal de
  [`SPABLA_V2_CODE_STANDARD.md §6.2`](SPABLA_V2_CODE_STANDARD.md#62-proveedores-de-ia)).
- APIs de plataforma específicas del dominio (p.ej. Fase 3 STT: "no
  MediaStream").
- Contratos que la fase deliberadamente NO abre (adaptador real,
  streaming, etc.).

### 4.4 Verificaciones adicionales

Cualquier grep o comprobación que solo tenga sentido para esa fase (p.ej.
Fase 4: `grep -r "openai|gemini|deepl|claude|anthropic|@google" engine/src/translation/`
= 0). Los universales de
[`SPABLA_V2_CODE_STANDARD.md §11`](SPABLA_V2_CODE_STANDARD.md#11-verificación-por-grep-templates)
se dan por hechos.

### 4.5 Aplicabilidad de §3

El plan declara si los criterios adicionales de §3 (prueba real
bidireccional, cleanup post-`call.ended`, regresiones en prueba real
N-1) aplican a la fase. Fases puramente de modelo en memoria (Engine
Foundation, Messaging, STT, Translation, TTS mientras sean simuladas)
NO activan §3. Fases con adaptadores reales de red / audio / WebRTC SÍ.

### 4.6 Tag propuesto

Nombre exacto siguiendo la convención §5.

---

## 5. Nombres de tag

Formato canónico:

```
spabla-v2-phase-<N>-<slug>-<YYYY-MM-DD>
```

Ejemplos ya publicados:
- `spabla-v2-engine-foundation-2026-07-04`
- `spabla-v2-phase-2-messaging-2026-07-04`
- `spabla-v2-phase-3-stt-2026-07-06`
- `spabla-v2-phase-4-translation-2026-07-06`

Reglas:

- Tag anotado (`git tag -a`) con mensaje que incluye base tag, SHA
  auditado, resumen de los ocho criterios, y decisión (`APROBADA` /
  `RECHAZADA` / `CANDIDATE`).
- Push del tag a origin en el mismo ciclo. `git push origin <tag>`.
- Tag protegido: la política de la organización marca este prefijo como
  no borrable ni movible sin autorización explícita.

---

## 6. Procedimiento de cierre de fase

1. **Ejecutar la suite completa**: `npm --prefix engine test`.
2. **Ejecutar cobertura**: `npx vitest run --coverage`.
3. **Ejecutar typecheck**: `npm --prefix engine run typecheck`.
4. **Ejecutar los greps del §2.8**.
5. **Verificar V1 byte-idéntico (§2.7)**.
6. **Verificar cap de tamaño (§2.5)**.
7. **Verificar §2.9 principios normativos permanentes**.
8. **Si §3 aplica** a la fase (según §4.5): ejecutar prueba real
   bidireccional, verificar cleanup post-`call.ended`, verificar
   regresiones en prueba real N-1.
9. **Redactar auditoría** en `docs/audit_reports/AUDIT_<YYYY-MM-DD>_phase-<N>-<slug>.md`
   con veredicto por criterio.
10. **Commit** con mensaje según convención de
    [`../SPABLA_V2_DOCUMENTATION_STANDARD.md §9`](../SPABLA_V2_DOCUMENTATION_STANDARD.md#9-convención-de-nombres).
11. **Push** de la rama.
12. **Tag anotado** + push del tag.
13. **Reporte final** al jefe de proyecto con SHA de commit, SHA de tag,
    cobertura, nº de tests, estado del working tree.

Cualquier paso fallido detiene la secuencia y la fase se declara
`candidate` en el reporte, no `stable`. La iteración se hace en la misma
rama antes de reintentar.

---

## 7. Candidato vs estable

- **`candidate`**: al menos uno de los criterios aplicables (§2 siempre;
  §3 según §4.5) no se cumple, o la auditoría documenta un hallazgo
  bloqueante. El tag no se crea; el commit sí puede existir pero el
  reporte lo etiqueta explícitamente como candidato. Iteración
  obligatoria antes del tag.
- **`stable`**: todos los criterios aplicables se cumplen sin excepción;
  la auditoría lo verifica documento en mano; el tag existe y está
  publicado.

Un candidato nunca se re-etiqueta a estable sin re-ejecutar la
verificación completa desde el paso 1.

---

## 8. Excepciones y ADRs

Cualquier relajación de un criterio requiere ADR previa en
`docs/decisions/ADR-XXX-*.md`. Ejemplos hipotéticos que la
justificarían:

- Bajar temporalmente el cap de líneas de 300 a 350 durante una fase de
  refactor mayor (ADR obligatoria con fecha objetivo de retorno).
- Aceptar un branch de cobertura < 95 % en un módulo por depender de un
  polyfill fuera del control del Engine.

Sin ADR previa aprobada, cualquier desviación bloquea el tag.

---

## Aplicación

Este estándar entra en vigor desde su commit. Los planes de fase futuros
lo referencian con:

> "Aplican los criterios universales de
> [`SPABLA_V2_RELEASE_STANDARD.md §2`](../standards/SPABLA_V2_RELEASE_STANDARD.md#2-criterios-universales)
> y, si procede según §4.5, los adicionales de §3. El DELTA de esta
> fase es …"

y añaden únicamente lo específico del módulo introducido.
