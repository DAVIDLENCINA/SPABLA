# SPABLA V2 — Engine

Documento de tipo Arquitectura. Define el núcleo del Engine SPABLA V2:
qué controla, qué no controla, y los nombres canónicos de los contratos,
máquinas de estado, eventos foundation y adaptadores externos. Los
cuerpos de los contratos viven en el código fuente
(`engine/src/types/*.ts`) y su detalle inicial se documenta en el plan
de la fase que los introdujo.

Documentos referenciados:

- [`SPABLA_V2_ARCHITECTURE.md`](SPABLA_V2_ARCHITECTURE.md) — módulos,
  flujos y hoja de ruta.
- [`SPABLA_V2_PRODUCT_CORE.md`](SPABLA_V2_PRODUCT_CORE.md) — prevalece
  sobre cualquier decisión técnica.
- [`standards/SPABLA_V2_CODE_STANDARD.md`](standards/SPABLA_V2_CODE_STANDARD.md) —
  reglas transversales y prohibiciones.
- [`standards/SPABLA_V2_RELEASE_STANDARD.md`](standards/SPABLA_V2_RELEASE_STANDARD.md) —
  criterios universales de "estable".
- [`SPABLA_V2_DOCUMENTATION_STANDARD.md`](SPABLA_V2_DOCUMENTATION_STANDARD.md) —
  estándar documental que gobierna este archivo.
- Decisiones que sostienen este diseño:
  [ADR-002](decisions/ADR-002-2026-07-04-engine-mediates-modules.md).

---

## 1. Qué es SPABLA Engine

**SPABLA Engine es un mediador con estado propio y máquinas de estados
internas. Es la única fuente de verdad para las primitivas del sistema
(conversación, participantes, sesión de llamada, mensajería, STT,
traducción, TTS) y el único canal de comunicación entre módulos.**

No es una librería de tipos. No es un context de React. No es un event
bus pasivo. Es un runtime con:

- Estado interno propio, aislado del mundo exterior.
- Máquinas de estados finitas y explícitas para cada primitiva.
- Un bus de eventos tipado hacia afuera (pub/sub).
- Un conjunto reducido de comandos entrantes que ejecutan transiciones
  validadas.
- Adaptadores hacia servicios externos, invocados solo desde dentro del
  Engine.

**Metáfora útil:** el Engine es un servidor local en el mismo proceso,
con puertos de entrada (comandos) y salidas (eventos). Los módulos son
clientes de ese servidor. No hay clientes hablando entre sí — regla
formalizada en
[ADR-002](decisions/ADR-002-2026-07-04-engine-mediates-modules.md).

---

## 2. Qué controla

El Engine posee de forma exclusiva:

1. **El grafo de estado.** Toda `ConversationSession`, todo
   `Participant`, todo `LanguagePair`, toda `CallSession`, todo
   `Message`, toda `STTSession`, todo `TranslationSession` (y en Fase 5
   toda `TTSSession`) viven **dentro** del Engine.
2. **Las transiciones de estado.** Toda transición pasa por una máquina
   de estados codificada. Los inputs son comandos, los outputs son
   eventos.
3. **La validación de invariantes.** El Engine rechaza cualquier comando
   que violaría un invariante antes de aplicarlo.
4. **La orquestación de adaptadores externos.** El Engine decide cuándo
   invocar STT / MT / TTS / WebRTC / Signaling / Supabase.
5. **La emisión de eventos hacia módulos.** Push, nunca pull.
6. **El ciclo de vida de una llamada.** Desde `initiate` hasta `end`,
   con cleanup determinista y en orden inverso al arranque.
7. **La resolución de precondiciones.** Ej.: `initiateCall` requiere
   `LanguagePair` válido; el Engine lo comprueba antes de aceptar.
8. **La telemetría estructurada.** Cada transición y cada comando emiten
   un evento auditable con `ts` y `correlationId`.

---

## 3. Qué NO controla

El Engine explícitamente **no** hace estas cosas — otros módulos las
hacen, guiados por eventos del Engine. Las prohibiciones concretas están
consolidadas en
[Code Standard §6](standards/SPABLA_V2_CODE_STANDARD.md#6-prohibiciones-transversales).
Resumen aplicado al Engine:

1. **UI.** No renderiza. No conoce React.
2. **Renderizado de burbujas.** El módulo `bubbles` traduce
   `translation.completed` en burbujas visibles. El Engine no sabe qué
   es una burbuja.
3. **Tonos de llamada.** El módulo `ring` traduce `call.state.changed`
   en oscillators. El Engine no sabe qué es un ringtone.
4. **Reproducción de audio.** El adaptador de salida (Fase 6+) consume
   `tts.chunk.generated`. El Engine no sabe qué es un `AudioContext`.
5. **Quirks de iOS Safari.** El módulo `audio-capture` encapsula unlocks
   en gesture handlers.
6. **HTTP / WebSocket / WebRTC directos.** El Engine invoca adaptadores;
   los adaptadores hablan con el mundo.
7. **Inferencia con IA.** Ningún prompt vive en el Engine. Vive en el
   adaptador correspondiente.
8. **Persistencia directa.** El Engine no ejecuta SQL. Invoca
   `SupabaseAdapter`.
9. **Autenticación.** El Engine recibe una identidad ya resuelta.
10. **Rutas de la app / URLs.** Router de Next.js es cosa del cliente.

---

## 4. Contratos foundation

Nombres canónicos y ubicación del cuerpo en el código fuente. El detalle
de campos, invariantes específicas y ejemplos vive en el código y en el
plan de la fase que los introdujo.

| Contrato | Cuerpo canónico | Introducido en |
|---|---|---|
| `CallSession`, `CallState`, `CallMode`, `CallEndedBy` | `engine/src/types/call.ts` | Fase 1 Engine Foundation |
| `ConversationSession`, `LanguagePairUnresolvableReason` | `engine/src/types/conversation.ts` | Fase 1 |
| `Participant`, `ParticipantRole` | `engine/src/types/participant.ts` | Fase 1 |
| `LanguagePair`, `LangCode`, `LanguagePairInvalidError`, `makeLanguagePair`, `languagePairEquals`, `invertLanguagePair` | `engine/src/types/language.ts` | Fase 1 |
| `UUID`, `ISOTimestamp`, `CorrelationId`, `Clock` | `engine/src/types/ids.ts` | Fase 1 |
| `TurnPipeline`, `TurnStage`, `TurnSpeaker` | `engine/src/types/turn.ts` | Fase 1.5 |
| `Message`, `MessageStatus`, `MessageDirection`, `MessageThread` | `engine/src/types/message.ts` | [Fase 2](phases/) (rama `spabla-v2/fase-2-messaging`) |
| `STTSession`, `STTTurn`, `STTPartial`, `STTFinal`, `STTError`, `STTSessionState`, `STTSpeaker` | `engine/src/types/stt.ts` | [Fase 3](phases/SPABLA_V2_PHASE_3_STT_PLAN.md) |
| `TranslationSession`, `TranslationRequest`, `TranslationResult`, `TranslationError`, `TranslationSessionState`, `TranslationRequestState`, `TranslationAdapter`, `TranslationAdapterRequest`, `TranslationAdapterResponse` | `engine/src/types/translation.ts` | [Fase 4](phases/SPABLA_V2_PHASE_4_TRANSLATION_PLAN.md) |
| `TTSSession`, `TTSSynthesisRequest`, `TTSAudioChunk`, `TTSSynthesisResult`, `TTSError`, `TTSSessionState`, `TTSRequestState`, `TTSAdapter` | (pendiente) `engine/src/types/tts.ts` | [Fase 5](phases/SPABLA_V2_PHASE_5_TTS_PLAN.md) (pendiente) |

**Invariantes de foundation** (aplicadas por las máquinas de estado y
tests unitarios):

- Toda `CallSession` requiere `caller.language !== callee.language`.
- `state` es monótono en cada máquina; terminal es terminal.
- Snapshots devueltos por managers son `Object.freeze` — regla
  transversal en
  [Code Standard §9](standards/SPABLA_V2_CODE_STANDARD.md#9-snapshots-inmutables).
- `LanguagePair` se construye solo vía `makeLanguagePair`; rechaza
  `from === to`.
- `Participant.role === "local"` es único por `ConversationSession`.

---

## 5. Máquinas de estado

Cada máquina utiliza el primitivo genérico `StateMachine`
(`engine/src/state-machine/StateMachine.ts`). Terminales por máquina:

### 5.1 `CallState` (Fase 1)

Transiciones autorizadas:

| Desde | A | Trigger |
|---|---|---|
| `idle` | `ringing` | comando `initiateCall` (caller) |
| `idle` | `incoming` | notificación remota (callee) |
| `ringing` | `accepted` | notificación remota: callee aceptó |
| `ringing` | `cancelled` | comando `cancelCall` |
| `ringing` | `missed` | `tickTimeouts` 30 s sin respuesta |
| `ringing` | `rejected` | notificación remota: callee rechazó |
| `incoming` | `accepted` | comando `acceptCall` |
| `incoming` | `rejected` | comando `rejectCall` |
| `incoming` | `cancelled` | notificación remota: caller canceló |
| `incoming` | `missed` | `tickTimeouts` 30 s |
| `accepted` | `ended` | comando `endCall` o desconexión de red |

Terminales: `ended`, `rejected`, `missed`, `cancelled`.

### 5.2 Sub-máquina de resolución de `LanguagePair` (Fase 1)

| Desde | A | Trigger |
|---|---|---|
| `unresolved` | `resolving` | `conversation.loaded` con `remoteParticipant` presente |
| `unresolved` | `resolving` | `participant.joined` con role `remote` |
| `resolving` | `resolved` | ambos con `language` distintos y no nulos |
| `resolving` | `unresolvable-same` | ambos languages iguales |
| `resolving` | `unresolvable-timeout` | 30 s sin remote joined |
| `resolved` | `resolving` | `participant.language.changed` |

Solo desde `resolved` es viable `initiateCall` o `acceptCall`.

### 5.3 Máquinas de módulos (Fases 2–5)

- `MessageStatus` (Fase 2) — plan de la fase.
- `STTSessionState` (Fase 3) — [Plan Fase 3](phases/SPABLA_V2_PHASE_3_STT_PLAN.md).
- `TranslationSessionState`, `TranslationRequestState` (Fase 4) —
  [Plan Fase 4](phases/SPABLA_V2_PHASE_4_TRANSLATION_PLAN.md).
- `TTSSessionState`, `TTSRequestState` (Fase 5, pendiente) —
  [Plan Fase 5](phases/SPABLA_V2_PHASE_5_TTS_PLAN.md).

Cada plan de fase documenta la tabla completa de transiciones.

---

## 6. Eventos foundation

El Engine emite eventos tipados hacia afuera vía `EventBus` síncrono.
Cada evento lleva `meta: { ts, correlationId }`. Solo el Engine emite.

### 6.1 Eventos foundation (Fase 1)

- `conversation.loaded` `{ conversation }`
- `participant.joined` `{ participant }`
- `participant.left` `{ participantId }`
- `participant.updated` `{ participant }`
- `languagePair.resolved` `{ pair }`
- `languagePair.unresolvable` `{ reason }`
- `languagePair.changed` `{ from, to }`
- `call.initiated` / `call.incoming` / `call.accepted` / `call.rejected`
  / `call.cancelled` / `call.missed` / `call.ended` — todos con
  `{ session }`
- `call.state.changed` `{ session, previousState }`
- `turn.started` `{ turn }`
- `turn.stage.changed` `{ turn, previousStage }`
- `turn.completed` `{ turn }`
- `turn.failed` `{ turn, stage, reason }`
- `video.enabled` / `video.disabled` `{ callId }`
- `interpreter.enabled` / `interpreter.disabled` `{ callId }`
- `telemetry.command.received` / `telemetry.command.rejected` /
  `telemetry.state.transition` / `telemetry.invariant.violated`

### 6.2 Eventos por módulo

Los eventos específicos de módulo se declaran en el plan de la fase que
los introduce:

- **Messaging (Fase 2)**: `message.created`, `message.sent`,
  `message.delivered`, `message.read`, `message.failed`.
- **STT (Fase 3)**: `stt.session.started`, `stt.partial`, `stt.final`,
  `stt.failed`, `stt.session.ended` — ver
  [Plan Fase 3 §8](phases/SPABLA_V2_PHASE_3_STT_PLAN.md).
- **Translation (Fase 4)**: `translation.session.started`,
  `translation.request.created`, `translation.request.dispatched`,
  `translation.completed`, `translation.failed`,
  `translation.session.ended` — ver
  [Plan Fase 4 §6](phases/SPABLA_V2_PHASE_4_TRANSLATION_PLAN.md).
- **TTS (Fase 5, pendiente)**: `tts.session.started`,
  `tts.request.created`, `tts.chunk.generated`, `tts.completed`,
  `tts.failed`, `tts.session.ended` — ver
  [Plan Fase 5 §6](phases/SPABLA_V2_PHASE_5_TTS_PLAN.md).

Todos accesibles vía `SpablaCore.subscribe(name, handler)`. La unión
discriminada `EngineEvent` se define en `engine/src/types/events.ts`.

---

## 7. Adaptadores externos

El Engine define **interfaces** para hablar con el mundo. Las
implementaciones concretas viven fuera del Engine (paquete consumidor o
subpaquete `adapters/`). El Engine **nunca importa** proveedores
concretos — regla en
[Code Standard §5](standards/SPABLA_V2_CODE_STANDARD.md#5-adapter-isolation).

Cada adaptador se registra en el `AdapterRegistry` (Fase 1.5) bajo su
`kind`, y el Engine lo recupera al ejecutar comandos.

| Kind | Interface | Introducido | Cuerpo canónico | Estado |
|---|---|---|---|---|
| `stt` | `STTAdapter` | Fase 1.5 (marker) → Fase 3 (uso simulado) | `engine/src/types/adapters.ts` + [Plan Fase 3](phases/SPABLA_V2_PHASE_3_STT_PLAN.md) | Marker; implementación real diferida a fase posterior |
| `mt` | `MTAdapter` / `TranslationAdapter` | Fase 1.5 (marker) → Fase 4 (contrato completo) | `engine/src/types/adapters.ts` + [Plan Fase 4 §10](phases/SPABLA_V2_PHASE_4_TRANSLATION_PLAN.md) | Contrato completo; enforcement runtime en `AdapterRegistry.register` |
| `tts` | `TTSAdapter` | Fase 1.5 (marker) → Fase 5 (contrato completo, pendiente) | (a añadir a `adapters.ts` en Fase 5) + [Plan Fase 5 §10](phases/SPABLA_V2_PHASE_5_TTS_PLAN.md) | Marker; Fase 5 pendiente |
| `webrtc` | `WebRTCAdapter` | Fase 1.5 (marker) | `engine/src/types/adapters.ts` | Marker; fase futura de llamada |
| `signaling` | `SignalingAdapter` | Fase 1.5 (marker) | `engine/src/types/adapters.ts` | Marker; fase futura de llamada |
| `supabase` | `SupabaseAdapter` | Fase 1.5 (marker) | `engine/src/types/adapters.ts` | Marker; fase futura de persistencia |

Reglas comunes:

- Todos declaran `readonly kind: K` para discriminación runtime.
- Todos exponen `readonly displayName: string` para introspección.
- Ninguno expone estado interno más allá de su interface.
- Los adaptadores no son invocados desde módulos consumidores — solo
  desde el Engine.

Los ejemplos de proveedores que pueden implementar cada adaptador
(Deepgram, Whisper, OpenAI, DeepL, Gemini, Claude, ElevenLabs, Cartesia,
etc.) están enumerados en los planes de fase y en el flujo de traducción
de [Architecture §5](SPABLA_V2_ARCHITECTURE.md#5-flujo-de-traducción).
Ninguno vive en `engine/src/`.

---

## 8. Reglas transversales

Las reglas duras que rigen el Engine — límites de archivo, encapsulación
de `SpablaCore`, aislamiento de adaptadores, prohibición de APIs del
navegador y de proveedores concretos, TypeScript strict, bus síncrono,
snapshots inmutables — viven en
[`SPABLA_V2_CODE_STANDARD.md`](standards/SPABLA_V2_CODE_STANDARD.md).

Este documento no las reimprime. Cualquier consulta sobre "qué está
prohibido dentro del Engine" o "cómo se verifica X" debe leerse contra
la fuente única.

---

## 9. Criterios de "estable"

Los ocho criterios universales para declarar cualquier fase (o el Engine
mismo) como "stable" viven en
[`standards/SPABLA_V2_RELEASE_STANDARD.md §2`](standards/SPABLA_V2_RELEASE_STANDARD.md#2-criterios-universales).

Este documento no los reimprime. Cada plan de fase (Fases 3, 4, 5)
declara su DELTA sobre ese estándar.
