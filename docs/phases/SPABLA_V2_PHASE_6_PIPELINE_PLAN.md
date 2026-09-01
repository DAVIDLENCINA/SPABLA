# SPABLA V2 — Fase 6: Pipeline Integration (plan previo)

Documento de planificación. Base: tag `spabla-v2-foundation-evolution-2026-07-07` @ `c61e9d1` (supersede `spabla-v2-phase-5-tts-2026-07-06` @ `a7a6ce0`). Rama al autorizarse: `spabla-v2/fase-6-pipeline`. Commit único al cierre. **NO autoriza** implementación.

Fuentes normativas transversales: [Code Standard](../standards/SPABLA_V2_CODE_STANDARD.md), [Release Standard](../standards/SPABLA_V2_RELEASE_STANDARD.md), [Documentation Standard](../SPABLA_V2_DOCUMENTATION_STANDARD.md), [ADR-001-FOUNDATION-EVOLUTION](../decisions/ADR-001-FOUNDATION-EVOLUTION.md), [ADR-002](../decisions/ADR-002-2026-07-04-engine-mediates-modules.md).

---

## 0. Doctrina de capas — Foundation vs Pipeline

- **Foundation** (Fases 1–5 + Foundation Evolution) define **capacidades** genéricas: FSM `TurnStage`, `StateMachine`, `TurnPipelineManager` con `initialStage` opcional no-terminal, buses, contratos por dominio.
- **Pipeline** (Fase 6, `PipelineOrchestrator`) define **políticas**: elección de `initialStage` por trigger, encadenamiento de eventos, FIFO por participante, agregación en `PipelineTurnResult`.
- **Ninguna política de negocio vive en Foundation.** Foundation acepta cualquier `initialStage` no-terminal (ADR-001-FOUNDATION-EVOLUTION); el orchestrator es el único autorizado a decidir cuál (voz → `transcribing`, texto → `translating`). Foundation no conoce triggers, políticas de síntesis ni colas por participante.

Si un apartado posterior parece exigir lógica de negocio en Foundation, está mal redactado.

---

## 1. Pipeline completo

```
[Voz]  Voice input                                                Playback [Voz]
         │                                                              ▲
         ▼                                                              │
   STT ─stt.final──▶ ORCHESTRATOR ─requestTranslation──▶ Translation    │
                          │                                    │        │
[Texto]  Messaging        │◀──translation.completed────────────┘        │
   sendMessage()          │                                             │
         │                │                                             │
         └──message.sent──┘─────requestSpeech──▶ TTS ─chunks────────────┘
                                                       Output adapter
```

Componentes: STT (Fase 3), Translation (Fase 4), TTS (Fase 5), Messaging (Fase 2) — sin cambios. `TurnPipelineManager` (Fase 1.5 + Foundation Evolution) mantiene el snapshot `TurnPipeline` con `TurnStage` ∈ `created | capturing | transcribing | translating | synthesizing | completed | failed` y acepta `initialStage` no-terminal en `create()`. `PipelineOrchestrator` (nuevo, `engine/src/pipeline-orchestrator/`) suscribe eventos y dispara comandos. Fase 6 NO introduce nuevos contratos de dominio.

---

## 2. Responsabilidad por módulo

- **STTManager**: audio → texto. No decide qué se hace con `stt.final`.
- **TranslationManager**: texto → texto. No decide origen ni destino.
- **TTSManager**: texto → chunks de audio. No decide origen ni destino.
- **MessageManager**: historial + ciclo `created → sent → delivered → read`. No sabe si el mensaje viene de STT o teclado.
- **TurnPipelineManager**: snapshot del turno. No invoca a otros managers.
- **PipelineOrchestrator**: único conector eventos → comandos; aplica políticas.

---

## 3. Iniciación de comandos

Único iniciador: `PipelineOrchestrator`, siempre reaccionando a un evento del Engine.

| Evento consumido | Comando disparado | Destino |
|---|---|---|
| `stt.final { text, language, turnId }` | `requestTranslation({ sessionId, text, sourceLanguage, sourceTurnId })` | Translation |
| `translation.completed` | `requestSpeech({ sessionId, text, language, sourceTranslationRequestId })` | TTS |
| `message.sent` (bilingüe) | `requestTranslation({ ... })` | Translation |
| `tts.completed` | interno: `synthesizing → completed` | orchestrator |
| `<x>.failed` | interno: `→ failed(stage)` | orchestrator |
| `call.ended` | cleanup (§9) | orchestrator |

---

## 4. Eventos que conectan el pipeline

Coexisten dos capas sobre la vida del `TurnPipeline` (consecuencia de la Doctrina §0):

- **Mecánica (Foundation)**: `turn.started`, `turn.stage.changed`, `turn.completed`, `turn.failed` — los emite `TurnPipelineManager` como reflejo directo de la FSM. Payload mínimo. Uso: telemetría, tests internos.
- **Semántica (Pipeline)**: `pipeline.turn.started`, `pipeline.turn.stage.changed`, `pipeline.turn.completed`, `pipeline.turn.failed` — los emite `PipelineOrchestrator` como agregado del turno. Payload enriquecido con `trigger` y `PipelineTurnResult`. Superficie **canónica** para UI y consumers externos (§17).

Cuatro eventos nuevos, todos del orchestrator:

| Nombre | Payload |
|---|---|
| `pipeline.turn.started` | `{ turn: TurnPipeline; trigger: "voice" \| "text" }` |
| `pipeline.turn.stage.changed` | `{ turn, previousStage: TurnStage }` |
| `pipeline.turn.completed` | `{ turn, result: PipelineTurnResult }` |
| `pipeline.turn.failed` | `{ turn, stage: TurnStage; reason: string }` |

Relación: por cada `turn.<x>` del manager, el orchestrator emite el `pipeline.turn.<x>` correspondiente (todos los turnos de Fase 6 los gestiona el orchestrator). Nunca emite `pipeline.turn.*` sin `turn.*` previo del mismo `turnId`. Sólo `.started` (añade `trigger`) y `.completed` (añade `result`) enriquecen el payload.

`PipelineTurnResult` (nuevo tipo, `engine/src/types/pipeline.ts` o extensión de `types/turn.ts`):

```
type PipelineTurnResult = Readonly<{
  turnId: UUID;
  sourceText: string | undefined;
  translatedText: string | undefined;
  ttsChunkCount: number | undefined;
  ttsTotalBytes: number | undefined;
  durations: Readonly<{ stt?: number; translation?: number; tts?: number; total: number }>;
}>;
```

Adaptación entre dominios (única en el orchestrator): `STTFinal { turnId, text, language }` → `RequestTranslationInput { text, sourceLanguage, sourceTurnId }`; `TranslationCompleted { request, result }` → `RequestSpeechInput { text: result.translatedText, language: result.targetLanguage, sourceTranslationRequestId: request.id }`; `TTSAudioChunk` verbatim (contrato Fase 5).

---

## 5. Orden exacto de ejecución

Regla de arranque (fuente normativa: Doctrina §0): el orchestrator restringe el `initialStage` a `transcribing` (voz) o `translating` (texto) al invocar `TurnPipelineManager.create()`. `pipeline.turn.started` no lleva `initialStage`; se lee de `turn.stage`.

**Turno de voz** — orchestrator abre con `initialStage: "transcribing"`: `stt.session.started` → `stt.partial`* → `stt.final` → `pipeline.turn.started(trigger: "voice")` → `translation.request.created` → `.dispatched` → `.completed` → `pipeline.turn.stage.changed(previous: transcribing)` → `tts.request.created` → `.dispatched` → `.chunk.generated`* → `.completed` → `pipeline.turn.stage.changed(previous: translating)` → `pipeline.turn.completed`. Ruta terminal: `transcribing → translating → synthesizing → completed`.

**Turno de texto** — orchestrator abre con `initialStage: "translating"`: `sendMessage` sync → `message.created` → `message.sent` → `pipeline.turn.started(trigger: "text")` → `translation.request.created` → `.dispatched` → `.completed` → (TTS opcional) → `pipeline.turn.completed`. Rutas terminales: texto-sin-TTS `translating → completed` (habilitada por ADR-001-FOUNDATION-EVOLUTION); texto-con-TTS `translating → synthesizing → completed`.

Bus síncrono; el orden listado es el observable estricto. Por `turnId` el orden es determinista; entre `turnId` distintos, no. Eventos foundation (`call.*`, `participant.*`, `languagePair.*`, `telemetry.*`) pueden intercalarse.

---

## 6. FSM `TurnPipeline` autorizada en Fase 6

- Voz: inicial `transcribing`; `transcribing → translating → synthesizing → completed | failed`.
- Texto con TTS: inicial `translating`; `translating → synthesizing → completed | failed`.
- Texto sin TTS: inicial `translating`; `translating → completed | failed` (ADR-001-FOUNDATION-EVOLUTION).
- `capturing` no se observa en Fase 6; se reserva para captura real futura (§17).

Habilitación normativa: Doctrina §0 + ADR-001-FOUNDATION-EVOLUTION. Enforzamiento: §16.5 (cero cambios adicionales sobre Foundation Evolution en esta FSM).

---

## 7. Invariantes del pipeline

1. `TurnPipeline` se abre por evento, nunca por comando externo.
2. Avanza monotónicamente por `TurnStage`. Terminal es terminal.
3. `turnId` único de por vida; se propaga como `sourceTurnId` a Translation y linaje (`sourceTranslationRequestId`) a TTS.
4. `pipeline.turn.completed` se emite tras una de dos rutas autorizadas: (a) voz/texto-con-TTS `synthesizing → completed` activado por `tts.completed`; (b) texto-sin-TTS `translating → completed` activado por `translation.completed`. La ruta la determina `trigger` + política de síntesis efectiva al abrir el turno.
5. Nunca `requestSpeech` sin `translation.completed` previo con el mismo `sourceTranslationRequestId` (sólo rutas con TTS).
6. Ver §16.3 (regla canónica sobre estado autoritativo del orchestrator).

---

## 8. Cancelaciones, timeouts y errores

- **`call.ended`**: cierre determinista TTS → Translation → STT. `stop*` idempotente. Turnos no-terminales → `failed(reason: "call-ended")`.
- **Fallo aguas arriba**: `stt.failed` NO dispara Translation; `translation.failed` NO dispara TTS. `TurnPipeline → failed(stage)`. Sin reintento, sin propagación aguas abajo. Módulos aguas arriba siguen aceptando nuevos turnos si no están terminales. `PipelineTurnResult` preserva contexto parcial.
- **Cancelación TTS individual**: `stopTTS` cancela in-flight vía `AbortSignal` (Fase 5 §11.3); orchestrator lo respeta.
- **Timeouts**: Fase 6 no añade timeouts propios; reutiliza `TTS_FIRST_CHUNK_TIMEOUT_MS = 10 000 ms` (Fase 5 §11.4). El orchestrator respeta `failed(code: "timeout")`.
- Timeout global de turno completo, cancelación individual del turno, reintento con proveedor alternativo: fuera de scope (puerta abierta vía ADR futura).

---

## 9. Limpieza al `call.ended` y fin de llamada

Orden estricto tras `call.ended`: (0) descartar cola FIFO por participante de `stt.final` pendientes sin abrir `TurnPipeline` (§13); (1) `stopTTS` de cada `TTSSession` activa; (2) `stopTranslation` de cada `TranslationSession` activa; (3) `stopSTT` de cada `STTSession` activa; (4) cierre de cada `TurnPipeline` no-terminal en `failed(reason: "call-ended")`. Ningún manager mantiene timers más allá del ciclo del último request. `endCall` NO borra historial ni snapshots.

| Punto | Acción tras `call.ended` |
|---|---|
| STT `listening` sin turno | `stopSTT`; sin turno abierto. |
| STT `transcribing` | `stopSTT` cierra sin `stt.final`; `pipeline.turn.failed(stage: "stt", reason: "call-ended")`. |
| Translation `dispatched` | `stopTranslation`; request tardío → `translation.failed(code: "session-terminal")`. |
| TTS `dispatched` / `streaming` | `stopTTS` cancela vía `AbortSignal`; cada request → `tts.failed(code: "cancelled")`. |
| `TurnPipeline` en `completed` | ninguno; ya cerrado. |

Todos convergen en `pipeline.turn.failed` o `.completed` finales. Sin turnos ambiguos.

---

## 10. Estados terminales y recuperación

Terminales: STT session `completed|failed`; Translation session/request `completed|failed`; TTS session `completed|failed`, TTS request `completed|failed|cancelled`; Message `read|failed`; `TurnPipeline` `completed|failed`. Terminal = sin transiciones salientes autorizadas.

Ningún estado terminal es recuperable dentro del mismo objeto. "Recuperar" en Fase 6 = **abrir un nuevo turno**. STT session `failed` → nueva `startSTT`. Translation/TTS request `failed`/`cancelled` no se reintenta; nueva `requestTranslation` / `requestSpeech` sí, si la sesión no está terminal. `TurnPipeline` cerrado no se re-abre; el siguiente turno lleva otro `turnId`.

---

## 11. Eventos fuera de orden

Regla general: **ignorar** y opcionalmente emitir `telemetry.invariant.violated` con `primitive: "pipeline"`, `invariant: <regla>`, `details: { turnId, eventName }`. Nunca revertir estado ni emitir eventos `pipeline.*` derivados.

| Situación | Acción |
|---|---|
| Evento duplicado (mismo `turnId + tipo` observado antes) | Ignorar. Idempotencia. |
| Evento tardío (posterior al terminal del `TurnPipeline`) | Ignorar. Ya emitido `pipeline.turn.completed`/`.failed`. |
| Evento post-terminal del manager de origen | Ignorar. Sesión cerrada. |
| Sin correlación válida (`sourceTurnId` desconocido, etc.) | Ignorar + telemetry. |
| `<X>.session.ended` para sesión ya cerrada | Ignorar. Idempotencia del `stop*`. |

El orchestrator NO reintenta ni reinicializa turnos por eventos tardíos.

---

## 12. Concurrencia y ordering

Bus síncrono (Code Standard §7): cada evento se procesa antes del siguiente. Múltiples turnos concurrentes son la norma (caller y callee pueden solaparse). Cola de reproducción del Output mantiene orden estricto por `turnId + seq`; el orchestrator NO reordena. Un request TTS in-flight NO bloquea `translation.completed` de OTRO turno.

Por `turnId`, orden estricto observable: `stt.final → translation.request.created → .dispatched → .completed → tts.request.created → .dispatched → .chunk.generated* → .completed → pipeline.turn.completed`.

---

## 13. Política FIFO por participante

Un participante puede tener **a lo sumo un `TurnPipeline` activo suyo a la vez**. Segundos `stt.final` del mismo participante antes de terminal se encolan **FIFO por participante**, sin paralelismo ni cancelación. Caller y callee son participantes distintos: sus turnos SÍ pueden solaparse (dos `TurnPipeline` concurrentes con `participantId` distintos avanzan en paralelo).

Reglas del orchestrator:

- Mantiene `Map<participantId, TurnPipeline | undefined>` de "turno activo por participante" mientras la llamada está viva.
- Al recibir `stt.final` con turno activo, encola en `Map<participantId, Queue<pendingTurn>>`.
- **Vaciado ante `call.ended` (única política autorizada)**: pendientes se **descartan silenciosamente** sin abrir `TurnPipeline`. Se emite `telemetry.invariant.violated` con `primitive: "pipeline"`, `invariant: "queue-drained-on-call-ended"`, `details: { turnCount, participantId }`. Rationale: nunca se emitió `pipeline.turn.started`; emitir `.failed` introduciría eventos de un turno inexistente.
- **Desencolado del siguiente turno**: sincrónico en el mismo tick del bus, dentro del handler del terminal (`pipeline.turn.completed`/`.failed`) del turno actual (bus síncrono re-entrante, Code Standard §7). El suscriptor observa `pipeline.turn.completed(turn N)` inmediatamente seguido de `pipeline.turn.started(turn N+1)` cuando la cola no está vacía.
- Nunca dos `requestSpeech` del mismo speaker simultáneos sobre el receptor (la reproducción se solaparía).

---

## 14. Propiedad del `TurnPipeline` y del `turnId`

- **Crea**: orchestrator, invocando `TurnPipelineManager.create({ turnId, callSessionId, speaker, initialStage })` al recibir `stt.final` o `message.sent` (bilingüe). `initialStage` es decisión exclusiva del orchestrator (§0).
- **Actualiza / cierra**: orchestrator, vía `advance` / `fail` del manager. Modifica el snapshot: sólo el orchestrator (§7 invariante 1).
- **NO modifica**: ningún manager de dominio, subscriber, adapter, componente de UI.

`turnId`:

- **Voz**: `turnId = STTFinal.turnId` — identidad numérica entre `sttTurnId` y `TurnPipeline.turnId`.
- **Texto**: `turnId` = UUID nuevo generado por el orchestrator al recibir `message.sent` bilingüe; `sourceTurnId` en Translation apunta a ese UUID sintético.
- **Ningún otro módulo** genera un `turnId` canónico. `TranslationManager` y `TTSManager` lo reciben como `sourceTurnId` / linaje y nunca lo re-mint. `TurnPipelineManager` lo indexa como clave primaria pero no lo emite ni lo cambia.

Comunicación al exterior en dos capas (§4): (a) mecánica `turn.*` para telemetría/observadores; (b) semántica `pipeline.turn.*` como superficie **canónica** para UI y consumers. Concuerdan siempre: el orchestrator nunca emite `pipeline.turn.<x>` sin `turn.<x>` previo del mismo `turnId`.

---

## 15. Límites del `PipelineOrchestrator`

- **Hace**: suscribe `stt.*`, `translation.*`, `tts.*`, `message.*`, `call.ended`, `turn.*`; adapta payloads; dispara comandos; abre/avanza/cierra `TurnPipeline`; emite `pipeline.turn.*`. Aplica políticas (§0): elección de `initialStage` por trigger, política de síntesis para texto, FIFO por participante (§13), vaciado de cola en `call.ended` (§9, §13), orden de cleanup, agregación de duraciones para `PipelineTurnResult`.
- **NO hace**: transformar datos de dominio, persistir, cachear, mantener buffers de audio, reintentar, ampliar Foundation con lógica de negocio (si algún requisito parece obligarlo → ADR nueva).
- **Delega**: transcripción → `STTAdapter`; traducción → `MTAdapter`/`TranslationAdapter`; síntesis → `TTSAdapter`; persistencia (futura) → `SupabaseAdapter`. Delegación vía `Engine.get<X>Manager().<comando>`, nunca import directo al adapter.
- **Estado transiente permitido**: registro `turnId ↔ (sttSessionId, translationSessionId, ttsSessionId)`, cola FIFO `Map<participantId, Queue<pendingTurn>>`, timestamps parciales para `PipelineTurnResult.durations`. Todo se descarta al cierre del turno o del `call.ended`.

---

## 16. Prohibiciones específicas de Fase 6

Reglas duras verificables por lint / grep. Cualquier incumplimiento bloquea el cierre.

1. **Ningún módulo importa a otro**: cero `import` desde `engine/src/pipeline-orchestrator/` hacia `stt/`, `translation/`, `tts/`, `messaging/` salvo `import type`. Comandos exclusivamente vía `Engine.get<X>Manager()`. Regla dura de [ADR-002](../decisions/ADR-002-2026-07-04-engine-mediates-modules.md).
2. **Ningún manager de dominio invoca comandos de otro**. Ningún subscriber externo, adapter, ni componente de UI modifica `TurnPipeline` (§7 invariante 1, §14).
3. **`PipelineOrchestrator` no mantiene estado autoritativo propio** más allá del estado transiente permitido (§15).
4. **Política `initialStage` vive exclusivamente en el orchestrator**: ningún módulo distinto invoca `TurnPipelineManager.create()` con el campo `initialStage`. Grep debe demostrarlo.
5. **Cero cambios adicionales sobre Foundation Evolution** en las FSM y managers de Fases 1–5: la FSM `TurnStage` y `TurnPipelineManager.create()` fueron modificados por ADR-001-FOUNDATION-EVOLUTION; Fase 6 no vuelve a tocarlos.
6. **Cero acoplamiento con proveedores** dentro de `engine/src/pipeline-orchestrator/`: [Code Standard §11](../standards/SPABLA_V2_CODE_STANDARD.md#11-verificación-por-grep-templates) sigue devolviendo 0.
7. **Encapsulación de `SpablaCore.prototype`**: no expone `PipelineOrchestrator`.
8. **Prohibiciones transversales** de [Code Standard §6](../standards/SPABLA_V2_CODE_STANDARD.md) (APIs de navegador, proveedores de IA por nombre en Engine, etc.): sin excepción para el orchestrator.

---

## 17. Integraciones futuras (documentadas, no implementadas)

- **WebRTC**: `WebRTCAdapter` (marker Fase 1.5) activo en fase futura. Orchestrator NO cambia; `stt.session.started` se disparará por captura real; pipeline idéntico. Orchestrator NO importa WebRTC ni conoce la fuente del audio.
- **Audio Output**: kind futuro `"audio-output"` consume `tts.chunk.generated` vía `SpablaCore.subscribe`. Fase 6 garantiza chunks en orden por `turnId + seq`, `mimeType` estable, correlación por `chunk.sessionId` + `request.sourceTranslationRequestId`. Orchestrator NO consume ni retiene bytes.
- **UI**: usa `SpablaCore.subscribe(...)` y comandos públicos. Fase 6 garantiza subtitles desde `translation.completed`, estado agregado desde `pipeline.turn.*`, sin cambios en `SpablaCore.prototype` fuera de `pipeline.*`. UI de Fases 1–5 sigue funcionando sin modificaciones.
- **Adaptadores reales**: se enchufan al `AdapterRegistry` sin tocar Engine ni Orchestrator (`unregister` + `register` respeta contrato tipo + runtime). Cero acoplamiento del orchestrator con proveedores (verificado por §16.6).

---

## 18. Jerarquía y correlación

```
Conversation (ConversationSession)
  └─ CallSession                         (0..N por Conversation)
       ├─ Participant (local + remote)   (exactamente 2 por CallSession)
       └─ TurnPipeline                   (0..N por CallSession)
            ├─ STTTurn                   (0..1 por TurnPipeline)
            ├─ TranslationRequest        (0..1 por TurnPipeline)
            └─ TTSRequest                (0..1 por TurnPipeline)
```

Composición: (a) toda `CallSession` pertenece a una única `ConversationSession`; (b) todo `TurnPipeline` pertenece a una `CallSession`; (c) los tres requests hijos comparten `turnId`; (d) fin de `CallSession` cierra los `TurnPipeline` no-terminales.

Propagación de IDs (los campos ausentes se marcan `undefined` en el evento concreto):

| ID | Origen | Propagación |
|---|---|---|
| `callId` | `initiateCall` / `notifyIncomingCall` | `callSessionId` en `STTSession`, `TranslationSession`, `TTSSession`, `TurnPipeline` |
| `turnId` | orchestrator (voz: `= sttTurnId`; texto: UUID nuevo) | `sourceTurnId` en `TranslationRequest`; linaje `sourceTranslationRequestId` en `TTSRequest` |
| `translationRequestId` | `TranslationManager` | `sourceTranslationRequestId` en `TTSRequest` |
| `correlationId` (bus meta) | comando de entrada | preservado en toda la cadena derivada |

Regla dura: ningún módulo inventa una ID; siempre las recibe del comando o del evento. El orchestrator es el único que correlaciona entre IDs de módulos distintos.

---

## 19. Tests previstos

**~50 tests nuevos.** Basal Foundation Evolution: **460**. Suite total tras Fase 6: **≥ 510**.

**`PipelineOrchestrator.test.ts`** (~25): voz happy (5) — `stt.final → requestTranslation` con `sourceTurnId`; `translation.completed → requestSpeech` con `sourceTranslationRequestId`; `tts.completed → TurnPipeline.completed`; `pipeline.turn.completed` con `PipelineTurnResult` completo; duraciones stt/translation/tts/total. Texto happy (3): bilingüe con TTS; encadenamiento; texto-sin-TTS ruta `translating → completed`. Fallos por etapa (6): `<x>.failed → TurnPipeline.failed(stage)` sin propagación; contexto parcial preservado. Cancelación por `call.ended` (4): cada stage; orden inverso; cero eventos residuales 5 s. Concurrencia (4): dos turnos independientes; `turnId` no cruza; ordering intra-turno; múltiples sesiones. Cero fuga (3): subscribe/unsubscribe simétrico; sin handlers colgados; sin retención de bytes.

**`SpablaCore.test.ts`** — nuevos describes (~25): suscripción `pipeline.*` (6, incluye co-existencia con la capa `turn.*` mecánica del §4); end-to-end voice (5) con FakeSTT+FakeMT+FakeTTS; end-to-end text (3, uno de ellos texto-sin-TTS por ruta `translating → completed`); cero regresión Fases 1–5 y Foundation Evolution (5); prohibiciones Fase 6 (6, incluye grep del §16 y "ningún módulo distinto del orchestrator invoca `TurnPipelineManager.create()` con `initialStage`").

---

## 20. Tabla de invariantes verificables

| # | Invariante | Owner | Verificación |
|---|---|---|---|
| 1 | Owner único: sólo `PipelineOrchestrator` invoca `create()`, `advance()`, `fail()` de `TurnPipelineManager`. | manager + lint import rule | grep cero call-sites fuera del orchestrator; import desde `stt/`, `translation/`, `tts/`, `messaging/` → error lint/typecheck. |
| 2 | `TranslationRequest.sourceTurnId` inmutable tras `create`. | `TranslationManager` (Fase 4, `Readonly`) | mutación → `TypeError` (Object.frozen). |
| 3 | `TTSRequest.sourceTranslationRequestId` inmutable tras `create`. | `TTSManager` (Fase 5, `Readonly`) | mutación → `TypeError`. |
| 4 | Terminal es terminal: `completed`/`failed`/`cancelled` no admite salida. | cada `StateMachine.assertTransition` | transición desde terminal → `InvalidTransitionError`. |
| 5 | Monotonía `TurnStage`: `completed`/`failed` no vuelve a activo. | `TurnPipelineManager` | transición terminal → activo → `InvalidTransitionError`. |
| 6 | Eventos post-terminal se ignoran (§11). | orchestrator (guards en handlers) | emitir `translation.completed` con `sourceTurnId` cerrado → sin cambio + `telemetry.invariant.violated`. |
| 7 | Ningún adapter modifica el pipeline. | contratos adapters + lint | importar `TurnPipelineManager` desde adapter → error lint/typecheck. |

Todas ejecutables en tests unitarios; batería específica en `PipelineOrchestrator.test.ts` (§19).

---

## 21. Criterios de aceptación de Fase 6

Aplican los ocho criterios universales de [`RELEASE_STANDARD.md §2`](../standards/SPABLA_V2_RELEASE_STANDARD.md#2-criterios-universales) + los principios permanentes de §2.9. §3 NO aplica — Fase 6 sigue siendo modelo en memoria.

DELTA específico:

- **Suite mínima**: ≥ 510 tests (basal Foundation Evolution 460 + 50 nuevos §19).
- **Módulo** `engine/src/pipeline-orchestrator/` con cobertura ≥ 95 %.
- **Base tag**: `spabla-v2-foundation-evolution-2026-07-07` @ `c61e9d1`.
- **Prohibiciones §16**: cero incumplimiento (verificado por lint + grep).
- **Contract check adicional**: comandos vía `Engine.get<X>Manager()`, nunca import directo al adapter.
- **Tag propuesto**: `spabla-v2-phase-6-pipeline-<YYYY-MM-DD>`.

---

## 22. Evolución futura

Fase 6 se diseña para que las evoluciones abajo NO modifiquen `PipelineOrchestrator`, `TurnPipelineManager` ni las FSM de STT/Translation/TTS.

| Escenario | Impacto Pipeline | Impacto real |
|---|---|---|
| Cambiar proveedor STT / Translation / TTS | Ninguno | Nuevo adapter; `AdapterRegistry.register` |
| Añadir idiomas (nuevos `LangCode`) | Ninguno | Extensión `LangCode` + adapter compatible |
| Cambiar UI | Ninguno | UI consume `SpablaCore.subscribe(...)`; no toca Engine |
| Añadir WebRTC real | Ninguno | `WebRTCAdapter` real alimenta al `STTAdapter` |
| Añadir Audio Output real | Ninguno | Consumer de `tts.chunk.generated` fuera del Engine |

Ninguna evolución introduce imports cross-módulo dentro de `engine/src/pipeline-orchestrator/` (verificado por §16.1 y §16.6).

---

## Entregable de este documento (no incluye código)

Único entregable de esta pre-fase. La autorización del jefe de proyecto abrirá: rama `spabla-v2/fase-6-pipeline` desde `spabla-v2-foundation-evolution-2026-07-07` @ `c61e9d1`; implementación de `engine/src/pipeline-orchestrator/` y wiring mínimo en `Engine`, `SpablaCore`, `types/events.ts` (+ `types/pipeline.ts` si se opta por archivo separado); ejecución de los tests del §19; commit único al cierre `feat(engine): fase 6 — pipeline integration`. Sin autorización explícita no se toca código.
