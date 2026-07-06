# ADR-002 — 2026-07-04 — El Engine media todos los módulos

Tipo: Decisión (ADR).
Autor: jefe de proyecto (registrado durante la introducción del
Engine en Fase 0.1).
Estado: aceptada.

---

## Contexto

La primera pasada de arquitectura V2 (Fase 0) definió trece módulos y
una tabla de dependencias directas entre ellos (`stt` depende de
`audio-capture`, `translator` de `stt`, etc.). La tabla dejaba abierta
una duda: ¿cómo se comunican los módulos? Si cada módulo importa a su
predecesor, reaparece el patrón que hundió V1: acoplamientos que se
propagan hasta que un cambio local rompe cinco archivos remotos.

La Fase 0.1 introdujo la figura del **SPABLA Engine** como núcleo del
sistema. Al hacerlo, la tabla de dependencias del §2 de Architecture
quedaba tácitamente sustituida sin declaración explícita, generando
ambigüedad para quien lea sólo uno de los dos documentos.

Esta decisión formaliza la regla que ambos documentos ya asumen.

---

## Opciones consideradas

**A. Dependencias directas entre módulos (V1 tardío).** Descartada: es
exactamente el patrón que la reconstrucción quiere abandonar.

**B. Un event bus pasivo compartido, sin mediador.** Descartada: no
resuelve la validación de invariantes ni la orquestación de
adaptadores; sigue expuesto a suscripciones cross-módulo
descontroladas.

**C. Un Engine con estado propio, máquinas de estado explícitas y bus
tipado hacia afuera.** Aceptada.

---

## Decisión

**Los módulos no se hablan directamente. Todo pasa por el SPABLA
Engine.** En consecuencia:

- La columna "Depende de" de la tabla de módulos de
  `SPABLA_V2_ARCHITECTURE.md §2` describe **fuente semántica de los
  datos**, no un import directo.
- Ningún módulo importa a otro módulo.
- Los módulos consumen eventos del Engine y envían comandos al Engine;
  no consumen estado directamente (pull); reciben notificaciones
  (push).
- Las precondiciones (p.ej. `LanguagePair` válido antes de abrir STT)
  las resuelve el Engine, no cada módulo.
- Los adaptadores se registran en `AdapterRegistry` y solo el Engine
  los invoca.

Verificación: lint rule (o ADR + review manual) sobre los imports de
`engine/src/<módulo>/`. En el paquete cliente futuro, un lint rule
equivalente sobre `modules/*/`.

---

## Consecuencias

- El Engine crece hasta ser el archivo que más lógica concentra —
  contenida por el cap de líneas y el patrón de extracción de
  companion classes ya usado en Fases 3 (`stt-ops.ts`) y 4
  (`translation-ops.ts`) — regla en
  [Code Standard §3](../standards/SPABLA_V2_CODE_STANDARD.md#3-tamaño-de-archivo).
- La superficie pública al mundo externo es la fachada `SpablaCore`, no
  el Engine directamente — regla en
  [Code Standard §4](../standards/SPABLA_V2_CODE_STANDARD.md#4-encapsulación-de-spablacore).
- Los tests de integración prueban pares Engine ↔ módulo, no módulo ↔
  módulo.
- Cualquier propuesta futura de "que el módulo X hable directamente con
  el módulo Y por eficiencia" requiere ADR nueva que la justifique. La
  respuesta por defecto es "no".
