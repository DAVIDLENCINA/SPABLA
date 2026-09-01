# ADR-001 (Foundation Evolution) — 2026-07-07 — Evolución mínima del `TurnPipelineManager`

Tipo: Decisión (ADR).
Autor: jefe de proyecto (autorizada durante la Fase 5.1 Foundation
Evolution). Nota: el prefijo `ADR-001-FOUNDATION-EVOLUTION` es el nombre
autorizado literalmente por el enunciado de Fase 5.1 y no debe
confundirse con `ADR-001-2026-07-04-v1-portable-items.md` (piezas
portables de V1); son dos decisiones independientes.
Estado: aceptada.

---

## Contexto

La auditoría de Fase 6.5 (`SPABLA_V2_PHASE_6_PIPELINE_PLAN`) detectó
tres CRÍTICOS estructurales entre Foundation (Fase 1.5, tag base
`spabla-v2-phase-5-tts-2026-07-06`) y el diseño del Pipeline
Orchestrator planificado para Fase 6:

- **CRÍTICO 2**: la FSM `TurnStage`
  (`engine/src/pipeline/turn-stage-machine.ts`) no autoriza la
  transición `translating → completed`. El Pipeline necesita esta ruta
  para cerrar los turnos de texto que NO invocan síntesis (`§7`, `§11`,
  `§23` del plan de Fase 6).
- **CRÍTICO 3**: `TurnPipelineManager.create()` fija el stage inicial en
  `"created"` de forma hardcodeada; no acepta parámetro para escoger
  otro. El Pipeline necesita abrir turnos en `transcribing` (voz) o en
  `translating` (texto) para reflejar el punto real del flujo en el que
  cada turno se convierte en observable.
- **CRÍTICO 4**: la aserción del plan "El `TurnPipelineManager` de Fase
  1.5 permite arranque en cualquier stage no-terminal por diseño del
  primitivo `StateMachine`" era factualmente falsa contra el código
  publicado. La afirmación mezcla la flexibilidad del primitivo con el
  comportamiento concreto del manager.

Sin esta evolución, Fase 6 obligaría a modificar el manager o la FSM
durante la propia implementación, contradiciendo el §24 del plan de
Fase 6 y ocultando el cambio bajo el tag futuro. Es preferible saldar
la deuda en Foundation ahora, antes de reabrir Fase 6, y hacerlo con un
tag propio de la evolución.

---

## Decisión

Se realizan dos cambios mínimos y estrictamente aditivos sobre
Foundation, sin tocar Product Core, Engine público, SpablaCore,
AdapterRegistry, EventBus, STT, Translation, TTS ni V1:

1. **FSM `TurnStage`**: se añade la transición
   `translating → completed`.
   - Justificación: cierra la ruta terminal de los turnos de texto
     sin síntesis (`translating → completed`) sin obligar al Pipeline a
     forzar una fase de TTS artificial.
   - Compatibilidad: la ruta original `translating → synthesizing →
     completed` sigue intacta y sigue siendo el camino canónico para
     voz y texto-con-TTS.
   - Efecto en tests existentes: **cero regresión**. Ningún test valida
     la ausencia de la transición `translating → completed`; los tests
     de walk completo siguen ejercitando la ruta con `synthesizing`.

2. **`TurnPipelineManager.create()`**: se añade un campo opcional
   `initialStage?: TurnStage` a `CreateTurnInput`.
   - Comportamiento: si `initialStage` no se aporta, se conserva el
     comportamiento actual (`"created"`).
   - Restricción: si `initialStage` se aporta, debe ser un estado
     no-terminal (`"created"`, `"capturing"`, `"transcribing"`,
     `"translating"` o `"synthesizing"`). Iniciar en `"completed"` o
     `"failed"` produce `TurnPipelineError` — un turno no puede nacer
     ya terminado.
   - Compatibilidad: todos los llamadores previos (ningún productor
     externo aún; el manager es interno y sin consumidores en Fases
     1–5) siguen produciendo turnos en `"created"`.
   - Efecto en tests existentes: **cero regresión**. Todos los tests de
     `TurnPipelineManager.test.ts` que no aportan `initialStage`
     mantienen el comportamiento observable idéntico.

No se modifica ninguna otra parte de Foundation. No se añade nueva
funcionalidad. No se refactoriza.

---

## Consecuencias

- El plan de Fase 6 (documento aún no congelado) puede satisfacer sus
  §7, §11, §14, §23 y §24 sobre el nuevo Foundation sin necesidad de
  modificar la FSM ni el manager durante la propia implementación de
  Fase 6.
- La aserción falsa del plan de Fase 6 §11 sobre la flexibilidad del
  primitivo `StateMachine` deja de ser falsa: el `TurnPipelineManager`
  ahora sí acepta arranque en cualquier stage no-terminal, por diseño
  explícito y verificable en tests.
- El tag `spabla-v2-foundation-evolution-2026-07-XX` deja constancia
  cronológica de la evolución entre Fase 5 y Fase 6. La Fase 6, cuando
  se autorice, partirá de ese tag y no del `spabla-v2-phase-5-tts-2026-07-06`.
- Ningún efecto sobre las Fases 2–5 (Messaging, STT, Translation, TTS)
  ni sobre V1.
- El texto del plan de Fase 6 requerirá una re-verificación cuando se
  reabra (Fase 6.6 o equivalente) para constatar que los tres CRÍTICOS
  desaparecen contra el nuevo Foundation. Esa re-verificación es
  responsabilidad de la reapertura del plan, no de esta ADR.
