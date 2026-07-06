# SPABLA Engine — Núcleo V2

Documento de Fase 0.1. Cero código funcional. Define el motor propio de SPABLA sobre el que se construyen todos los módulos.

Este documento **complementa y precisa** `SPABLA_V2_ARCHITECTURE.md`. Donde el anterior describía módulos con dependencias declaradas entre sí, este introduce una regla más estricta: **los módulos no se hablan directamente — todo pasa por el Engine**.

---

## 1. Qué es SPABLA Engine

**SPABLA Engine es un mediador con estado propio y máquinas de estados internas. Es la única fuente de verdad para las tres primitivas del sistema (conversación, participantes, sesión de llamada) y el único canal de comunicación entre módulos.**

No es una librería de tipos. No es un context de React. No es un event bus pasivo. Es un runtime con:

- Estado interno propio, aislado del mundo exterior.
- Máquinas de estados finitas y explícitas para cada primitiva.
- Un bus de eventos tipado hacia afuera (pub/sub).
- Un conjunto reducido de comandos entrantes que ejecutan transiciones validadas.
- Adaptadores hacia servicios externos, invocados solo desde dentro del Engine.

**Metáfora útil:** el Engine es un servidor local en el mismo proceso, con puertos de entrada (comandos) y salidas (eventos). Los módulos son clientes de ese servidor. No hay clientes hablando entre sí.

---

## 2. Qué controla

El Engine posee de forma exclusiva:

1. **El grafo de estado.** Toda `ConversationSession`, todo `Participant`, todo `LanguagePair`, toda `CallSession` viven **dentro** del Engine. Ningún módulo mantiene su propia copia.
2. **Las transiciones de estado.** Toda transición pasa por una máquina de estados codificada. Los inputs son comandos, los outputs son eventos. No hay "escribir directamente al estado".
3. **La validación de invariantes.** El Engine rechaza cualquier comando que violaría un invariante antes de aplicarlo. Los invariantes se codifican en tipos y en asserts ejecutables.
4. **La orquestación de adaptadores externos.** El Engine decide cuándo abrir/cerrar STT, cuándo invocar traducción, cuándo emitir a Socket, cuándo tocar Supabase. Nadie más los invoca.
5. **La emisión de eventos hacia módulos.** Los módulos consumen eventos tipados. No consultan estado directamente (pull); reciben notificaciones (push).
6. **El ciclo de vida de una llamada.** Desde `initiate` hasta `end`, con cleanup determinista y en orden inverso al arranque.
7. **La resolución de precondiciones.** El Engine es el único que decide si un comando es viable (ej: `initiateCall` requiere `LanguagePair` válido; el Engine lo comprueba antes de aceptar).
8. **La telemetría estructurada.** Cada transición y cada comando emiten un evento auditable con `timestamp`, `commandId`, `causedBy`, `outcome`.

---

## 3. Qué NO controla

El Engine explícitamente **no** hace estas cosas — otros módulos las hacen, guiados por eventos del Engine:

1. **UI.** El Engine no renderiza. No conoce React. Ningún tipo del Engine referencia JSX, DOM, componentes, refs, hooks.
2. **Renderizado de burbujas.** El módulo `bubbles` traduce eventos del Engine (`translation.completed`) en burbujas visibles. El Engine no sabe qué es una burbuja.
3. **Tonos de llamada.** El módulo `ring` traduce eventos del Engine (`call.state.changed`) en oscillators. El Engine no sabe qué es un ringtone.
4. **Reproducción de audio.** El módulo `tts-player` recibe chunks vía evento y los reproduce. El Engine no sabe qué es un `AudioContext`.
5. **Quirks de iOS Safari.** El módulo `audio-capture` encapsula unlocks de AudioContext en gesture handlers. El Engine no sabe qué es Safari.
6. **HTTP directo, WebSocket directo, WebRTC directo.** El Engine invoca adaptadores; los adaptadores hablan con el mundo. El Engine no llama a `fetch`, ni construye `RTCPeerConnection`, ni abre `io()` client.
7. **Inferencia con IA.** Ningún prompt vive en el Engine. Vive en el adaptador correspondiente (STT, MT, TTS). El Engine solo conoce los contratos de entrada/salida de esos adaptadores.
8. **Persistencia directa.** El Engine no ejecuta SQL. Invoca al adaptador `SupabaseAdapter` con comandos semánticos.
9. **Autenticación.** El Engine recibe una identidad ya resuelta (`Participant.userId`, `Participant.token`). No lee cookies, no llama a `getSession`.
10. **Rutas de la app / URLs.** Next.js router es cosa del módulo `app/`. El Engine no sabe de rutas.

---

## 4. Contrato CallSession

Cuerpo canónico en el código fuente: `engine/src/types/call.ts`. Tabla
de transiciones autorizadas: §9.1 abajo.

---

## 5. Contrato ConversationSession

Cuerpo canónico en el código fuente: `engine/src/types/conversation.ts`.

---

## 6. Contrato Participant

Cuerpo canónico en el código fuente: `engine/src/types/participant.ts`
(y `engine/src/types/language.ts` para `LangCode`).

---

## 7. Contrato LanguagePair

Primitiva pequeña pero central. Su existencia es la precondición dura para toda llamada.

Cuerpo canónico en el código fuente: `engine/src/types/language.ts`.

**Esta es la corrección directa del defecto raíz de V1** — donde el idioma vivía en 4 sitios distintos (state React, ref mirror, prop de useWebRTC, ref interno del hook, socket.data del server) y se desincronizaba. Aquí vive en un solo lugar dentro del Engine.

---

## 8. Eventos internos

El Engine emite eventos tipados hacia afuera. Los módulos se suscriben. Nada más los emite.

### Eventos de conversación

```
conversation.loaded            { conversation: ConversationSession }
participant.joined             { participant: Participant }
participant.left               { participantId: UUID }
languagePair.resolved          { pair: LanguagePair }
languagePair.unresolvable      { reason: "same-language" | "timeout" | "no-remote" }
languagePair.changed           { from: LanguagePair; to: LanguagePair }
```

### Eventos de llamada

```
call.initiated                 { session: CallSession }        // caller
call.incoming                  { session: CallSession }        // callee
call.accepted                  { session: CallSession }        // ambos
call.rejected                  { session: CallSession }
call.cancelled                 { session: CallSession }
call.missed                    { session: CallSession }
call.ended                     { session: CallSession }        // terminal
call.state.changed             { session: CallSession; previousState: CallState }
```

### Eventos por módulo

Los eventos específicos de cada módulo (STT, translation, TTS,
messaging) se documentan en el plan de la fase que los introduce:
[Fase 3](phases/SPABLA_V2_PHASE_3_STT_PLAN.md),
[Fase 4](phases/SPABLA_V2_PHASE_4_TRANSLATION_PLAN.md),
[Fase 5](phases/SPABLA_V2_PHASE_5_TTS_PLAN.md).

### Eventos de telemetría (siempre emitidos)

```
telemetry.command.received     { commandName: string; commandId: UUID; ts: number }
telemetry.command.rejected     { commandId: UUID; reason: string }
telemetry.state.transition     { primitive: string; from: string; to: string; causedBy: UUID }
telemetry.invariant.violated   { primitive: string; invariant: string; details: object }
```

**Regla:** todos los eventos llevan `ts: ISOTimestamp` y un `correlationId: UUID` que enlaza cadenas causales (comando → transición → eventos derivados).

---

## 9. Estados permitidos

Máquinas de estados finitas explícitas. Cualquier transición no listada aquí es un bug del Engine.

### `CallState` — ver §4

Listado exhaustivo de transiciones válidas:

| Desde | A | Trigger |
|---|---|---|
| `idle` | `ringing` | comando `initiate` (caller) |
| `idle` | `incoming` | evento remoto (callee) |
| `ringing` | `accepted` | evento remoto: callee aceptó |
| `ringing` | `cancelled` | comando `cancel` (caller) |
| `ringing` | `missed` | timeout 30 s sin respuesta |
| `ringing` | `rejected` | evento remoto: callee rechazó |
| `incoming` | `accepted` | comando `accept` (callee) |
| `incoming` | `rejected` | comando `reject` (callee) |
| `incoming` | `cancelled` | evento remoto: caller canceló |
| `incoming` | `missed` | timeout 30 s |
| `accepted` | `ended` | comando `end` (cualquiera) o desconexión de red |

Estados terminales: `ended`, `rejected`, `missed`, `cancelled`. Terminal significa que la `CallSession` queda archivada y no admite más transiciones.

### Estado de resolución de `LanguagePair`

Sub-máquina interna del Engine, no expuesta directamente:

| Desde | A | Trigger |
|---|---|---|
| `unresolved` | `resolving` | `conversation.loaded` con `remoteParticipant` presente |
| `unresolved` | `resolving` | `participant.joined` con role `remote` |
| `resolving` | `resolved` | ambos participantes tienen `language` con `from !== to` |
| `resolving` | `unresolvable-same` | ambos languages iguales |
| `resolving` | `unresolvable-timeout` | 30 s sin remote joined |
| `resolved` | `resolving` | `participant.language.changed` (usuario cambia idioma) |

Solo desde `resolved` es viable el comando `initiateCall` o `acceptCall`.

### Estado del pipeline por turno

Cada `turnId` recorre su propia mini-FSM. Turnos son independientes entre sí (múltiples pueden estar en distintos estados simultáneamente).

| Desde | A | Trigger |
|---|---|---|
| `capturing` | `transcribing` | primer partial STT recibido |
| `transcribing` | `translating` | evento `stt.final` |
| `transcribing` | `dropped` | `call.ended` mid-turn |
| `translating` | `synthesizing` | evento `translation.completed` |
| `translating` | `failed` | error en adaptador MT |
| `synthesizing` | `completed` | último chunk TTS entregado |
| `synthesizing` | `failed` | error en adaptador TTS |

Turno `completed` o `failed` es terminal.

---

## 10. Adaptadores externos

El Engine define **interfaces** para hablar con el mundo. Las implementaciones concretas son sustituibles.

**Regla común a todos los adaptadores:** implementan una interfaz mínima, no exponen su estado interno más allá de la interfaz, y NO son invocados desde módulos consumidores — solo desde el Engine.

Los seis markers foundation (`STTAdapter`, `MTAdapter`, `TTSAdapter`,
`WebRTCAdapter`, `SignalingAdapter`, `SupabaseAdapter`) viven en el
código fuente: `engine/src/types/adapters.ts`. El detalle del contrato
por adaptador cuando pasa de marker a interfaz operativa se documenta
en el plan de la fase que lo activa:
[Fase 3 STTAdapter](phases/SPABLA_V2_PHASE_3_STT_PLAN.md),
[Fase 4 TranslationAdapter](phases/SPABLA_V2_PHASE_4_TRANSLATION_PLAN.md),
[Fase 5 TTSAdapter](phases/SPABLA_V2_PHASE_5_TTS_PLAN.md).

---

## Reglas de arquitectura obligatorias

Las reglas transversales duras (cero dependencia directa entre módulos,
cap de tamaño de archivo, cero código funcional fuera de adaptadores,
ningún prompt de IA fuera de su adaptador, nunca compartir estado por
refs) viven en
[`standards/SPABLA_V2_CODE_STANDARD.md`](standards/SPABLA_V2_CODE_STANDARD.md).

---

## Definición operativa de "estable"

Los criterios universales para declarar una fase estable viven en
[`standards/SPABLA_V2_RELEASE_STANDARD.md §2`](standards/SPABLA_V2_RELEASE_STANDARD.md#2-criterios-universales).

---

## Consecuencia sobre `SPABLA_V2_ARCHITECTURE.md`

Decisión registrada en
[`decisions/ADR-002-2026-07-04-engine-mediates-modules.md`](decisions/ADR-002-2026-07-04-engine-mediates-modules.md).
