# SPABLA V2 — Arquitectura

Documento de Fase 0. Ningún código funcional. Solo contratos, límites y decisiones que rigen la reconstrucción.

---

## 1. Objetivo de SPABLA V2

SPABLA V2 es una aplicación de chat con llamada y videollamada entre dos usuarios que hablan idiomas distintos. Cada intervención de voz se transcribe, se traduce, aparece como burbuja de texto en el idioma del receptor y se reproduce como audio traducido. Reconstrucción desde cero — cero herencia de código de V1 excepto el esquema Supabase.

### Principios de diseño

1. **Contratos explícitos.** Cada módulo declara qué recibe y qué emite. Nada se comunica por refs globales, closures, o estado compartido implícito.
2. **Una responsabilidad por archivo.** Los archivos monolito de V1 (`page.tsx` ~1200, `useWebRTC.ts` ~1150, `signaling.ts` ~800) están prohibidos por diseño. Cap y procedimiento en [`standards/SPABLA_V2_CODE_STANDARD.md §3`](standards/SPABLA_V2_CODE_STANDARD.md#3-tamaño-de-archivo).
3. **Precondiciones antes de conectar.** No se abre socket, ni sesión STT, ni WebRTC sin tener el par `(fromLang, targetLang)` validado y con `fromLang !== targetLang`. No es un guard defensivo; es una precondición de tipo.
4. **Fases independientes.** Cada fase se cierra con tag protegido, prueba real bidireccional documentada, y sin regresiones. No se avanza sin cierre.
5. **Cero feature flags acumulativos.** Al sustituir un motor STT/MT/TTS se reemplaza, no se coexiste. Nada de `if (USE_X_ENGINE) ...` bifurcando el pipeline.

---

## 2. Módulos principales

Trece módulos, cada uno con una responsabilidad única y dependencias declaradas.

| # | Módulo | Responsabilidad | Depende de | Emite |
|---|---|---|---|---|
| 1 | `auth` | Autenticación anónima Supabase | Supabase | `User { id, name, language }` |
| 2 | `conversation` | Conversación + participantes + realtime membership | `auth`, Supabase | `Conversation`, `Participant[]` |
| 3 | `messaging` | Mensajes de texto + timeline | `conversation` | `Message` events |
| 4 | `call-session` | Contrato de sesión de llamada (§3) | `conversation` | Estados de sesión + acciones |
| 5 | `signaling` | Transporte de señales entre pares (offer/answer/ICE + eventos custom) | `call-session` | Eventos WebRTC |
| 6 | `webrtc` | `RTCPeerConnection`, tracks, upgrade de video | `signaling` | Tracks de audio/video |
| 7 | `audio-capture` | `MediaStream` de mic + downsample + unlocks iOS | `webrtc` | PCM chunks |
| 8 | `stt` | Voz → texto (partial + final) | `audio-capture` | `Utterance { turnId, text, isFinal }` |
| 9 | `translator` | Texto origen → texto destino | `stt` | `Translation { turnId, source, target }` |
| 10 | `tts` | Texto → audio streaming | `translator` | Audio chunks `{ turnId, seq }` |
| 11 | `bubbles` | Estado + renderizado del timeline traducido | `translator`, `messaging` | Ninguno (sink de UI) |
| 12 | `ring` | Tonos de llamada entrantes/salientes | `call-session` | Ninguno (sink de audio) |
| 13 | `ui` | Componentes React puros (props → JSX) | Todos los sinks | JSX |

Cada módulo se testea de forma aislada. Los tests de integración cubren solo las adyacencias declaradas en esta tabla. Cualquier import cruzado no declarado es un error de arquitectura.

---

## 3. Contrato CallSession

La sesión de llamada es la primitiva central de V2. Sustituye la mezcla de V1 (`useCallSignaling` + `useWebRTC` + refs cruzados + estado en `page.tsx`) por un único objeto inmutable con máquina de estados explícita.

Cuerpo y API canónicos: ver [`SPABLA_V2_ENGINE.md §4`](SPABLA_V2_ENGINE.md#4-contrato-callsession) y el código fuente `engine/src/types/call.ts`.

---

## 4. Flujo de llamada

```
1. Usuario visita URL de conversación.

2. Módulo `conversation` resuelve participantes y sus idiomas (Supabase + realtime).
   • Si peer_language ausente → UI muestra "esperando participante" con timeout 30 s y error.
   • Botón de llamada permanece DESHABILITADO hasta que ambos lados tengan lang válido y != propio.

3. Usuario A pulsa llamar.
   • callSession.initiate({ mode: "voice" }) → crea CallSession, DB actualiza estado a "ringing".
   • Supabase Realtime propaga al peer.

4. Usuario B recibe evento → CallSession pasa a "incoming".
   • ring.startIncoming(). UI muestra aceptar/rechazar.

5. Usuario B acepta → callSession.accept(id) → estado "accepted" en DB.

6. Ambos clientes observan "accepted" y ejecutan en secuencia:
   • ring.stop()
   • webrtc.openConnection(callSession) — protegido por invariante de tipo
   • audio-capture.start() — dentro del gesture handler para iOS
   • signaling.exchangeOfferAnswer(...) hasta ICE conectado

7. Con conexión establecida:
   • stt.startSession({ turnBoundaryPolicy: "server-vad" })
   • translator.startSession({ from: myLang, to: theirLang })
   • tts.startPlayback()  (solo receptor)

8. Al colgar cualquier lado:
   • callSession.end(id) → estado "ended"
   • Todos los módulos ejecutan cleanup en orden inverso al arranque:
     stt.stop() → translator.stop() → tts.stop() → webrtc.close() → audio-capture.stop() → ring.stop()
   • bubbles conserva el historial de la sesión.

9. Estado terminal "ended" → UI vuelve a modo chat. Estado en DB queda archivado.
```

**Regla dura:** cualquier evento posterior a `state === "ended"` (transcript-result, translated, audio-chunk) es descartado por cada módulo receptor sin excepción, verificado en tests unitarios de cada módulo.

---

## 5. Flujo de traducción

Pipeline lineal, cada eslabón medible y sustituible sin tocar el resto.

```
[emisor]
  mic → audio-capture → PCM chunks (24 kHz mono)
        │
        ▼
  signaling backend → stt (Deepgram Live | Whisper streaming)
        │
        ├── partial → Utterance{ turnId, text, isFinal: false } → sender local caption
        │
        └── final   → Utterance{ turnId, text, isFinal: true }
                      │
                      ▼
                      translator (GPT-4o-mini | traductor dedicado)
                      │
                      ├── Translation{ turnId, source, target } → subtitle event al receptor
                      │
                      └── Translation → tts (ElevenLabs | OpenAI TTS)
                                        │
                                        ▼
                                        audio chunks{ turnId, seq } → receptor
                                                                        │
                                                                        ▼
                                                                    PlaybackQueue ordenada por turnId

[receptor]
  bubbles inserta burbuja al recibir subtitle{ turnId, translated }
  tts.PlaybackQueue reproduce chunks ordenados por turnId + seq
```

### Contratos entre eslabones

- **`turnId` es único, estable e inmutable** durante todo el ciclo del turno. Partial y final comparten `turnId`. La traducción hereda el mismo `turnId`. Los chunks TTS del turno usan `turnId + seq`. Un burbuja del receptor se asocia a exactamente un `turnId`.
- **Cola ordenada en el receptor.** La `PlaybackQueue` reproduce chunks estrictamente en orden de `turnId` de emisión. Un turno nuevo NO interrumpe la reproducción del anterior — se encola. Solo un `callSession.end` corta la cola con `flush()`.
- **Partials nunca se traducen ni se muestran como burbuja final.** Solo alimentan la caption local del emisor.
- **`bubbles` inserta la burbuja al recibir `Translation`. Nunca antes.** No hay burbujas "en construcción" mostradas al receptor.
- **Un `turnId` puede fallar sin propagar el fallo.** Si `translator` o `tts` erroran para un turnId, ese turno se marca fallido y se emite un `TurnError { turnId, stage, reason }`. La UI del emisor muestra un icono discreto; el pipeline sigue con el siguiente turnId.

### Latencia esperada

- STT partial: < 300 ms.
- STT final: fin de silencio + 200-500 ms.
- Traducción: 300-800 ms (una llamada por turno, no streaming).
- TTS primer chunk: 200-500 ms tras traducción.
- **Latencia total emisor→primer audio del receptor: ≤ 3 s objetivo, ≤ 5 s aceptable.**

---

## 6. Estructura de carpetas propuesta

Estructura real actual del Engine V2: paquete `engine/src/` con
subcarpetas `adapter-registry/`, `conversation-manager/`, `core-api/`,
`engine/`, `event-bus/`, `language-manager/`, `messaging/`,
`participant-manager/`, `pipeline/`, `session-manager/`,
`state-machine/`, `stt/`, `translation/`, `types/`. La estructura
cliente/servidor completa la definirán las fases posteriores según el
árbol propuesto abajo.

### Reglas estructurales

- Ningún archivo de `modules/X/` puede importar de `modules/Y/` salvo lo declarado en la tabla del §2. Regla equivalente en el Engine actual: ningún archivo de `engine/src/<módulo>/` importa de otro `<módulo>/` salvo vía Engine. Base normativa en [`decisions/ADR-002-2026-07-04-engine-mediates-modules.md`](decisions/ADR-002-2026-07-04-engine-mediates-modules.md).
- `app/` solo compone providers y renderiza. Cero lógica de negocio.
- `server/` sigue el mismo principio: un router por responsabilidad, sin coexistir motores tras flags.
- Todo componente en `modules/ui/` es puro. No llama hooks de negocio.
- Un lint rule (o ADR + review manual) verifica los límites de importación.

---

## 7. Fases de construcción

Cada fase produce **código + tag protegido + prueba real bidireccional documentada**.

| Fase | Alcance | Módulos activos | Tag al cierre |
|---|---|---|---|
| **Fase 0** | Arquitectura documentada. Sin código funcional. | `docs` | `spabla-v2/fase-0` |
| **Fase 1** | Chat estable. Users, conversaciones, participantes, mensajes de texto, RLS, realtime en ambos sentidos. Sin llamada. | `auth`, `conversation`, `messaging`, `ui` (mínimo) | `spabla-v2-engine-foundation-2026-07-04` |
| **Fase 2** | Llamada sin traducción. WebRTC end-to-end, señalización, tonos, aceptar/rechazar/colgar. Audio crudo entre pares. | + `call-session`, `signaling`, `webrtc`, `audio-capture`, `ring` | `spabla-v2-phase-2-messaging-2026-07-04` |
| **Fase 3** | STT integrado. Backend transcribe y devuelve `Utterance` al sender. Sin traducción, sin TTS, sin burbujas. | + `stt` | `spabla-v2-phase-3-stt-2026-07-06` |
| **Fase 4** | Traducción de texto. Cada final se traduce y se emite como `Translation` al peer, con burbuja en su chat. | + `translator`, `bubbles` | `spabla-v2-phase-4-translation-2026-07-06` |
| **Fase 5** | TTS streaming. Sobre Fase 4, se genera audio traducido y se reproduce en el receptor con cola ordenada por turnId. | + `tts` | (pendiente) |
| **Fase 6** | Videollamada. Pista de video sobre la sesión ya negociada. Traducción intacta. | Extensión de `webrtc` + `ui` | (pendiente) |
| **Fase 7** | Endurecimiento. Errores exhaustivos en cada eslabón, timeouts, cleanup verificado, telemetría, RLS auditada, tests completos. | Todo | `v2-stable` |

### Reglas duras entre fases

- No se abre una fase sin haber cerrado, taggeado y probado la anterior.
- No se toca un módulo de una fase anterior sin justificación escrita (ADR) y sin re-validar la prueba real de esa fase.
- Cada fase produce como entregable mínimo: código + tag protegido + `docs/phases/SPABLA_V2_PHASE_<N>_<AREA>_PLAN.md` con qué se hizo, qué se probó, qué queda fuera de scope.
- Si una fase requiere cambios en un módulo de fase anterior por descubrimiento tardío de un contrato incompleto, el fix vive en una rama aparte, se valida, se merge, y **la fase anterior se re-tagguea**.

---

## 8. Criterio de versión estable

Los criterios canónicos para declarar una fase estable viven en
[`standards/SPABLA_V2_RELEASE_STANDARD.md §2`](standards/SPABLA_V2_RELEASE_STANDARD.md#2-criterios-universales)
(universales, aplican siempre) y
[§3](standards/SPABLA_V2_RELEASE_STANDARD.md#3-criterios-adicionales-según-naturaleza-de-la-fase)
(adicionales, aplican a fases con transporte real, WebRTC, audio o
adaptadores de red).

---

### Sobre lo salvable de V1

Decisión registrada en
[`decisions/ADR-001-2026-07-04-v1-portable-items.md`](decisions/ADR-001-2026-07-04-v1-portable-items.md).
