# SPABLA V2 — Arquitectura

Documento de tipo Arquitectura. Define bloques del sistema, límites entre
ellos, contratos estables (por **nombre**), y la hoja de ruta de fases.
El detalle de cuerpos de contrato, prohibiciones transversales y
criterios de aceptación vive en los estándares y planes de fase
referenciados; este documento no los reimprime.

Documentos de referencia obligatoria:

- [`SPABLA_V2_PRODUCT_CORE.md`](SPABLA_V2_PRODUCT_CORE.md) — alma del
  producto; prevalece sobre este documento.
- [`SPABLA_V2_ENGINE.md`](SPABLA_V2_ENGINE.md) — núcleo del Engine con
  las máquinas de estado y la lista de contratos y adaptadores.
- [`standards/SPABLA_V2_CODE_STANDARD.md`](standards/SPABLA_V2_CODE_STANDARD.md) —
  reglas transversales de código y prohibiciones.
- [`standards/SPABLA_V2_RELEASE_STANDARD.md`](standards/SPABLA_V2_RELEASE_STANDARD.md) —
  criterios universales de "estable" y cierre de fase.
- [`SPABLA_V2_DOCUMENTATION_STANDARD.md`](SPABLA_V2_DOCUMENTATION_STANDARD.md) —
  estándar documental que gobierna este archivo.

---

## 1. Objetivo de SPABLA V2

SPABLA V2 es una aplicación de chat con llamada y videollamada entre dos
usuarios que hablan idiomas distintos. Cada intervención de voz se
transcribe, se traduce, aparece como burbuja de texto en el idioma del
receptor y se reproduce como audio traducido. Reconstrucción desde cero
— cero herencia de código de V1 excepto el esquema Supabase (ver ADR
[ADR-001](decisions/ADR-001-2026-07-04-v1-portable-items.md)).

### Principios de diseño

1. **Contratos explícitos.** Cada módulo declara qué recibe y qué emite.
   Nada se comunica por refs globales, closures, o estado compartido
   implícito.
2. **Una responsabilidad por archivo.** El cap de líneas y su
   procedimiento de extracción viven en
   [Code Standard §3](standards/SPABLA_V2_CODE_STANDARD.md#3-tamaño-de-archivo).
3. **Precondiciones antes de conectar.** No se abre socket, ni sesión
   STT, ni WebRTC sin tener el par `(fromLang, targetLang)` validado y
   con `fromLang !== targetLang`. No es un guard defensivo; es una
   precondición de tipo (`LanguagePair` — ver Engine §Contratos).
4. **Fases independientes.** Cada fase se cierra con tag protegido,
   prueba real bidireccional documentada, y sin regresiones. Ver
   [Release Standard](standards/SPABLA_V2_RELEASE_STANDARD.md) para el
   procedimiento.
5. **Cero feature flags acumulativos.** Al sustituir un motor STT/MT/TTS
   se reemplaza, no se coexiste. Detalle en [Code Standard
   §6](standards/SPABLA_V2_CODE_STANDARD.md#6-prohibiciones-transversales).

---

## 2. Módulos principales

Trece módulos de dominio, cada uno con responsabilidad única.

| # | Módulo | Responsabilidad | Depende de | Emite |
|---|---|---|---|---|
| 1 | `auth` | Autenticación anónima Supabase | Supabase | `User { id, name, language }` |
| 2 | `conversation` | Conversación + participantes + realtime membership | `auth`, Supabase | `Conversation`, `Participant[]` |
| 3 | `messaging` | Mensajes de texto + timeline | `conversation` | `Message` events |
| 4 | `call-session` | Contrato de sesión de llamada | `conversation` | Estados + acciones de sesión |
| 5 | `signaling` | Transporte de señales entre pares | `call-session` | Eventos WebRTC |
| 6 | `webrtc` | `RTCPeerConnection`, tracks, upgrade de video | `signaling` | Tracks de audio/video |
| 7 | `audio-capture` | `MediaStream` de mic + downsample + unlocks iOS | `webrtc` | PCM chunks |
| 8 | `stt` | Voz → texto (partial + final) | `audio-capture` | `STTPartial`, `STTFinal` |
| 9 | `translator` | Texto origen → texto destino | `stt` | `TranslationResult` |
| 10 | `tts` | Texto → audio streaming | `translator` | `TTSAudioChunk` |
| 11 | `bubbles` | Estado + renderizado del timeline traducido | `translator`, `messaging` | Ninguno (sink de UI) |
| 12 | `ring` | Tonos de llamada entrantes/salientes | `call-session` | Ninguno (sink de audio) |
| 13 | `ui` | Componentes React puros (props → JSX) | Todos los sinks | JSX |

**Regla arquitectónica reforzada por ADR
[ADR-002](decisions/ADR-002-2026-07-04-engine-mediates-modules.md):** los
módulos **no se hablan directamente**. Todo pasa por el **SPABLA
Engine** (ver Engine.md §1). La columna "Depende de" indica la fuente
semántica de los datos, no un import directo.

Cada módulo se testea de forma aislada. Los tests de integración cubren
solo las adyacencias declaradas.

---

## 3. Contrato `CallSession`

La sesión de llamada es la primitiva central de V2. Sustituye la mezcla
de V1 (`useCallSignaling` + `useWebRTC` + refs cruzados + estado en
`page.tsx`) por un único objeto inmutable con máquina de estados
explícita.

Nombre del contrato: `CallSession`. Estado: `CallState`. Cuerpo canónico
en el código fuente: `engine/src/types/call.ts`. Descripción de campos y
máquina de estados: ver
[Engine §4 Contratos foundation](SPABLA_V2_ENGINE.md#4-contratos-foundation)
y [Engine §5.1 CallState](SPABLA_V2_ENGINE.md#51-callstate-fase-1).

**Invariantes clave** (verificadas en la máquina de estados y en tests):

- No se crea sin `caller.language !== callee.language`.
- Transiciones limitadas al DAG documentado en Engine.md.
- `webrtc.openConnection()` sólo aceptable con `state === "accepted"` —
  invariante de tipo.
- Inmutable desde fuera de `session-manager`; consumers reciben
  snapshots vía eventos, nunca refs mutables.

---

## 4. Flujo de llamada

```
1. Usuario visita URL de conversación.

2. Módulo `conversation` resuelve participantes y sus idiomas
   (Supabase + realtime).
   • Si peer_language ausente → UI muestra "esperando participante"
     con timeout 30 s y error.
   • Botón de llamada permanece DESHABILITADO hasta que ambos lados
     tengan lang válido y != propio.

3. Usuario A pulsa llamar.
   • Engine.initiateCall({ mode: "voice" }) → crea CallSession
     en "ringing".
   • Supabase Realtime propaga al peer.

4. Usuario B recibe evento → CallSession pasa a "incoming".
   • ring.startIncoming(). UI muestra aceptar/rechazar.

5. Usuario B acepta → Engine.acceptCall(id) → estado "accepted".

6. Ambos clientes observan "accepted" y ejecutan en secuencia:
   • ring.stop()
   • webrtc.openConnection(callSession) — protegido por invariante
   • audio-capture.start() — dentro del gesture handler para iOS
   • signaling.exchangeOfferAnswer(...) hasta ICE conectado

7. Con conexión establecida:
   • stt.startSession({ turnBoundaryPolicy: "server-vad" })
   • translator.startSession({ from: myLang, to: theirLang })
   • tts.startPlayback()  (solo receptor)

8. Al colgar cualquier lado:
   • Engine.endCall(id) → estado "ended"
   • Todos los módulos ejecutan cleanup en orden inverso al arranque:
     stt.stop() → translator.stop() → tts.stop() → webrtc.close()
     → audio-capture.stop() → ring.stop()
   • bubbles conserva el historial de la sesión.

9. Estado terminal "ended" → UI vuelve a modo chat. Estado en DB queda
   archivado.
```

**Regla dura:** cualquier evento posterior a `state === "ended"` es
descartado por cada módulo receptor, verificado en tests unitarios.

---

## 5. Flujo de traducción

Pipeline lineal, cada eslabón medible y sustituible sin tocar el resto.

```
[emisor]
  mic → audio-capture → PCM chunks (24 kHz mono)
        │
        ▼
  signaling backend → stt (adapter STT: Deepgram Live | Whisper streaming | ...)
        │
        ├── stt.partial → local caption del emisor
        │
        └── stt.final { text, language, turnId }
                      │
                      ▼
                      translator (adapter MT: OpenAI | Gemini | DeepL | Claude | ...)
                      │
                      ├── translation.completed { translatedText, targetLang } → subtitle receptor
                      │
                      └── translation.completed → tts (adapter TTS: ElevenLabs | OpenAI TTS | Cartesia | ...)
                                                  │
                                                  ▼
                                                  tts.chunk.generated { requestId, seq, isFinal } → receptor
                                                                                                     │
                                                                                                     ▼
                                                                                                 PlaybackQueue ordenada por turnId + seq

[receptor]
  bubbles inserta burbuja al recibir translation.completed
  PlaybackQueue reproduce chunks estrictamente en orden turnId + seq
```

### Contratos entre eslabones

- **`turnId` es único, estable e inmutable** durante todo el ciclo del
  turno. Partial y final comparten `turnId`. La request de traducción
  hereda `sourceTurnId`. Los chunks TTS enlazan al request vía
  `sourceTranslationRequestId`.
- **Cola ordenada en el receptor.** La `PlaybackQueue` reproduce chunks
  estrictamente en orden. Un turno nuevo NO interrumpe la reproducción
  del anterior — se encola. Solo `call.ended` corta la cola con
  `flush()`.
- **Partials nunca se traducen ni se muestran como burbuja final.** Solo
  alimentan la caption local del emisor.
- **`bubbles` inserta la burbuja al recibir `translation.completed`.**
  Nunca antes.
- **Un `turnId` puede fallar sin propagar el fallo.** Si `translator` o
  `tts` erroran para un turno, se emite `translation.failed` o
  `tts.failed` con `code` específico y el pipeline sigue con el turno
  siguiente.

### Latencia esperada

- STT partial: < 300 ms.
- STT final: fin de silencio + 200-500 ms.
- Traducción: 300-800 ms.
- TTS primer chunk: 200-500 ms tras traducción.
- **Latencia total emisor→primer audio del receptor: ≤ 3 s objetivo, ≤ 5 s aceptable.**

---

## 6. Estructura del repositorio

El paquete `engine/` es la primera pieza construida (Fases 1–5). Los
módulos de aplicación (`app/`, `server/`, cliente móvil, etc.) se
construyen en fases posteriores fuera del alcance actual.

### 6.1 Estructura actual del Engine (fases 1–4)

```
engine/
└── src/
    ├── adapter-registry/          # AdapterRegistry (Fase 1.5)
    ├── conversation-manager/       # ConversationManager (Fase 1)
    ├── core-api/                   # SpablaCore + ops companions
    ├── engine/                     # Engine facade (Fase 1)
    ├── event-bus/                  # EventBus síncrono (Fase 1)
    ├── language-manager/           # LanguageManager (Fase 1)
    ├── messaging/                  # MessageManager (Fase 2)
    ├── participant-manager/        # ParticipantManager (Fase 1)
    ├── pipeline/                   # TurnPipelineManager (Fase 1.5)
    ├── session-manager/            # SessionManager (Fase 1)
    ├── state-machine/              # StateMachine primitivo
    ├── stt/                        # STTManager (Fase 3)
    ├── translation/                # TranslationManager (Fase 4)
    └── types/                      # Contratos foundation + por módulo
        ├── adapters.ts             # Marker interfaces por kind
        ├── call.ts, conversation.ts, participant.ts, language.ts,
        │   ids.ts, events.ts, message.ts, stt.ts, translation.ts,
        │   turn.ts
        └── (futura: tts.ts en Fase 5)
```

Reglas estructurales aplicables al Engine:

- Ningún archivo de `engine/src/<módulo>/` importa de otro `<módulo>/`
  salvo lo declarado en las dependencias de constructor (`Engine`
  compone los managers vía DI).
- Un lint rule (o ADR + review manual) verifica los límites de
  importación.

### 6.2 Roadmap de estructura cliente/servidor

Los módulos consumidores del Engine (React app, backend de señalización,
etc.) llegan en fases posteriores fuera de este documento. Cuando se
abra la fase correspondiente, su plan describirá la estructura exacta.

---

## 7. Fases de construcción

Cada fase produce **código + tag protegido + prueba real bidireccional
documentada + reporte de auditoría** conforme al
[Release Standard §5](standards/SPABLA_V2_RELEASE_STANDARD.md#5-procedimiento-de-cierre-de-fase).

| Fase | Alcance | Módulos activos | Plan | Tag al cierre |
|---|---|---|---|---|
| **Fase 0** | Arquitectura documentada. Sin código funcional. | `docs` | Este archivo + [Product Core](SPABLA_V2_PRODUCT_CORE.md) | — |
| **Fase 1** | Engine Foundation. Contratos, managers básicos, `SpablaCore`. | `conversation-manager`, `language-manager`, `participant-manager`, `session-manager`, `engine`, `core-api`, `event-bus`, `state-machine`, `pipeline`, `adapter-registry` | (integrado en Engine.md) | `spabla-v2-engine-foundation-2026-07-04` |
| **Fase 2** | Messaging module. Mensajes de texto con estado. | + `messaging` | (rama `spabla-v2/fase-2-messaging`) | `spabla-v2-phase-2-messaging-2026-07-04` |
| **Fase 3** | STT module. Voz → texto. | + `stt` | [Plan Fase 3](phases/SPABLA_V2_PHASE_3_STT_PLAN.md) | `spabla-v2-phase-3-stt-2026-07-06` |
| **Fase 4** | Translation module. Texto origen → destino. | + `translation` | [Plan Fase 4](phases/SPABLA_V2_PHASE_4_TRANSLATION_PLAN.md) | `spabla-v2-phase-4-translation-2026-07-06` |
| **Fase 5** | TTS module. Texto → audio streaming. | + `tts` | [Plan Fase 5](phases/SPABLA_V2_PHASE_5_TTS_PLAN.md) | (pendiente) |
| **Fase 6** | Videollamada + orquestación STT → MT → TTS. | Extensión `webrtc` + orquestador | (pendiente) | (pendiente) |
| **Fase 7** | Endurecimiento. Errores exhaustivos, timeouts, cleanup, telemetría, RLS. | Todo | (pendiente) | `v2-stable` |

Las reglas transversales entre fases (no abrir sin cerrar la anterior;
ADR obligatoria para modificar fase previa; re-tag si se descubre
contrato incompleto) están consolidadas en
[Release Standard §5–§6](standards/SPABLA_V2_RELEASE_STANDARD.md#5-procedimiento-de-cierre-de-fase).

---

## 8. Criterios de "estable"

Los ocho criterios universales para declarar una fase estable viven en
[`SPABLA_V2_RELEASE_STANDARD.md §2`](standards/SPABLA_V2_RELEASE_STANDARD.md#2-criterios-universales).
Cada plan de fase añade solo el DELTA específico.

Este documento no reimprime los criterios; toda referencia a "cierre de
fase" o "tag protegido" debe leerse contra la fuente única.
