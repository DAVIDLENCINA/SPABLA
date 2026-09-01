# SPABLA V2 — Arquitectura

Documento de Fase 0. Ningún código funcional. Solo contratos, límites y decisiones que rigen la reconstrucción.

---

## 1. Objetivo de SPABLA V2

SPABLA V2 es una aplicación de chat con llamada y videollamada entre dos usuarios que hablan idiomas distintos. Cada intervención de voz se transcribe, se traduce, aparece como burbuja de texto en el idioma del receptor y se reproduce como audio traducido. Reconstrucción desde cero — cero herencia de código de V1 excepto el esquema Supabase.

### Principios de diseño

1. **Contratos explícitos.** Cada módulo declara qué recibe y qué emite. Nada se comunica por refs globales, closures, o estado compartido implícito.
2. **Una responsabilidad por archivo.** Límite duro: ningún archivo del módulo excede 300 líneas en alpha, 400 en stable. Los archivos monolito de V1 (`page.tsx` ~1200, `useWebRTC.ts` ~1150, `signaling.ts` ~800) están prohibidos por diseño.
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

### Estructura

```
type CallSession = {
  id:             UUID;
  conversationId: UUID;
  caller:         { userId: UUID; language: LangCode };
  callee:         { userId: UUID; language: LangCode };
  mode:           "voice" | "video";
  state:          CallState;
  createdAt:      ISOTimestamp;
  acceptedAt?:    ISOTimestamp;
  endedAt?:       ISOTimestamp;
};

type CallState =
  | "idle" | "ringing" | "incoming" | "accepted"
  | "ended" | "rejected" | "missed" | "cancelled";
```

### Invariantes obligatorias (codificadas en tipos y state machine)

1. Una `CallSession` **no se crea** sin `caller.language && callee.language && caller.language !== callee.language`. Ninguna función de creación acepta valores inválidos.
2. Transiciones de estado permitidas — cualquier otra transición lanza excepción en la state machine:
   ```
   Caller:  idle → ringing → accepted → ended
                        ↓
                 cancelled | missed | rejected  (terminales)
   Callee:  idle → incoming → accepted → ended
                          ↓
                   cancelled | missed | rejected  (terminales)
   ```
3. `webrtc.openConnection()` **solo puede** invocarse con una `CallSession` en `state === "accepted"`. Su firma tipada rechaza cualquier otro estado.
4. La `CallSession` es **inmutable** fuera del módulo `call-session`. Consumers solo pueden invocar acciones y suscribirse a cambios.

### API pública del módulo

```
callSession.initiate({ mode }): Promise<CallSession>   // requiere lang par validado
callSession.accept(id):         Promise<CallSession>
callSession.reject(id):         Promise<void>
callSession.end(id):            Promise<void>
callSession.subscribe(cb):      Unsubscribe
```

Ningún consumer accede a los internals del state machine. Todo pasa por esta API.

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

```
spabla-v2/
├── app/                             # Next.js app router (solo composición)
│   ├── layout.tsx
│   ├── page.tsx                     # landing
│   ├── (onboarding)/
│   │   └── page.tsx                 # registro + lang picker
│   ├── (chat)/
│   │   └── [conversationId]/
│   │       └── page.tsx             # shell: solo composición de providers
│   └── api/
│       ├── ice-servers/route.ts
│       └── health/route.ts
├── modules/                         # dominio, sin acoplamiento a Next
│   ├── auth/
│   │   ├── AuthProvider.tsx
│   │   └── useAuth.ts
│   ├── conversation/
│   │   ├── ConversationProvider.tsx
│   │   ├── useConversation.ts
│   │   └── useParticipants.ts
│   ├── messaging/
│   │   ├── MessagingProvider.tsx
│   │   ├── useMessages.ts
│   │   └── MessageList.tsx
│   ├── call-session/
│   │   ├── CallSessionProvider.tsx
│   │   ├── useCallSession.ts
│   │   ├── state-machine.ts         # transiciones puras, testeable
│   │   ├── invariants.ts            # assertions ejecutables
│   │   └── types.ts
│   ├── signaling/
│   │   ├── SignalingClient.ts
│   │   └── protocol.ts              # tipos de mensajes offer/answer/ICE/custom
│   ├── webrtc/
│   │   ├── PeerConnection.ts
│   │   └── useWebRTCConnection.ts
│   ├── audio-capture/
│   │   ├── AudioPipeline.ts
│   │   └── ios-unlock.ts            # ÚNICA ubicación de quirks iOS
│   ├── stt/
│   │   ├── SttProvider.tsx
│   │   ├── adapters/
│   │   │   └── deepgram.ts
│   │   └── types.ts                 # Utterance, turnId, LangCode
│   ├── translator/
│   │   ├── TranslatorProvider.tsx
│   │   └── adapters/
│   │       └── openai.ts
│   ├── tts/
│   │   ├── TtsProvider.tsx
│   │   ├── PlaybackQueue.ts         # cola ordenada por turnId
│   │   └── adapters/
│   │       └── elevenlabs.ts
│   ├── bubbles/
│   │   ├── BubblesProvider.tsx
│   │   ├── useBubbles.ts
│   │   └── BubbleList.tsx
│   ├── ring/
│   │   ├── useRingTone.ts
│   │   └── RingContext.tsx
│   └── ui/                          # componentes puros (props → JSX)
│       ├── CallControls.tsx
│       ├── CallStatusPill.tsx
│       ├── VideoOverlay.tsx
│       └── Button.tsx
├── server/                          # Node.js, un router por responsabilidad
│   ├── index.ts                     # arranque + montaje de routers
│   ├── signaling/
│   │   ├── router.ts                # solo relay WebRTC + eventos custom
│   │   └── protocol.ts
│   ├── stt/
│   │   ├── router.ts
│   │   └── deepgram-session.ts
│   ├── translator/
│   │   ├── router.ts
│   │   └── openai-adapter.ts
│   ├── tts/
│   │   ├── router.ts
│   │   └── elevenlabs-adapter.ts
│   └── auth/
│       └── jwt-middleware.ts        # portado desde V1 (única pieza reutilizable)
├── lib/
│   ├── supabase.ts                  # singleton compartido cliente/server
│   └── types.ts                     # tipos compartidos (LangCode, turnId, ...)
├── docs/
│   ├── SPABLA_V2_ARCHITECTURE.md    # este documento
│   ├── phases/
│   │   ├── phase-1-chat.md
│   │   ├── phase-2-call-raw.md
│   │   ├── phase-3-stt.md
│   │   ├── phase-4-mt.md
│   │   ├── phase-5-tts.md
│   │   ├── phase-6-video.md
│   │   └── phase-7-stable.md
│   └── decisions/                   # ADRs por cambio no trivial
└── tests/
    ├── unit/                        # uno por módulo
    └── integration/                 # solo pares de módulos adyacentes
```

### Reglas estructurales

- Ningún archivo de `modules/X/` puede importar de `modules/Y/` salvo lo declarado en la tabla del §2.
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
| **Fase 1** | Chat estable. Users, conversaciones, participantes, mensajes de texto, RLS, realtime en ambos sentidos. Sin llamada. | `auth`, `conversation`, `messaging`, `ui` (mínimo) | `v2-phase1-chat` |
| **Fase 2** | Llamada sin traducción. WebRTC end-to-end, señalización, tonos, aceptar/rechazar/colgar. Audio crudo entre pares. | + `call-session`, `signaling`, `webrtc`, `audio-capture`, `ring` | `v2-phase2-call-raw` |
| **Fase 3** | STT integrado. Backend transcribe y devuelve `Utterance` al sender. Sin traducción, sin TTS, sin burbujas. | + `stt` | `v2-phase3-stt` |
| **Fase 4** | Traducción de texto. Cada final se traduce y se emite como `Translation` al peer, con burbuja en su chat. | + `translator`, `bubbles` | `v2-phase4-mt` |
| **Fase 5** | TTS streaming. Sobre Fase 4, se genera audio traducido y se reproduce en el receptor con cola ordenada por turnId. | + `tts` | `v2-phase5-tts` |
| **Fase 6** | Videollamada. Pista de video sobre la sesión ya negociada. Traducción intacta. | Extensión de `webrtc` + `ui` | `v2-phase6-video` |
| **Fase 7** | Endurecimiento. Errores exhaustivos en cada eslabón, timeouts, cleanup verificado, telemetría, RLS auditada, tests completos. | Todo | `v2-stable` |

### Reglas duras entre fases

- No se abre una fase sin haber cerrado, taggeado y probado la anterior.
- No se toca un módulo de una fase anterior sin justificación escrita (ADR) y sin re-validar la prueba real de esa fase.
- Cada fase produce como entregable mínimo: código + tag protegido + `docs/phases/phase-N.md` con qué se hizo, qué se probó, qué queda fuera de scope.
- Si una fase requiere cambios en un módulo de fase anterior por descubrimiento tardío de un contrato incompleto, el fix vive en una rama aparte, se valida, se merge, y **la fase anterior se re-tagguea** (`v2-phase1-chat.1`, `.2`, ...).

---

## 8. Criterio de versión estable

Una versión de V2 solo se considera "estable" cuando cumple **los ocho** criterios a continuación. Que "parezca funcionar" en una prueba puntual **no** califica como estable — es el aprendizaje directo de V1.

1. **Prueba real bidireccional documentada** en al menos dos combinaciones de dispositivo (Chrome desktop ↔ iPhone Safari mínimo), ejecutada por humano, con capturas o logs adjuntos.
2. **Precondiciones codificadas en tipos o state machines**, no solo en UI. Los invariantes fallan explícitamente en runtime si alguien los bypasea. UI-only gates están prohibidos.
3. **Sin flags de feature acumulativos.** Un motor STT/MT/TTS a la vez. Cero `if (USE_X_ENGINE) ...` en el código.
4. **Cleanup verificado en tres escenarios:** caller cuelga, callee cuelga, socket muere abruptamente. En los tres, cero eventos residuales en logs durante 10 s post-cleanup.
5. **Cero regresiones** en la prueba real de la fase anterior. Verificado ejecutando la prueba de N-1 tras cerrar N.
6. **Tag protegido** creado y pusheado a origin. Rama estable de respaldo con el mismo SHA. Nombre convencional `v2-phase-N-<slug>` o `v2-stable`.
7. **`docs/phases/phase-N.md`** con: qué se implementó, qué se probó, qué queda deliberadamente fuera de scope.
8. **Test suite mínima:** smoke tests que arrancan la app, montan todos los providers y validan que no hay errores de consola en un flujo básico de la fase.

Una versión que no cumpla los ocho **no puede llamarse estable**, aunque haya pasado la prueba humana. Se documenta como "candidato" y se itera hasta cumplir los ocho.

---

### Sobre lo salvable de V1

Solo se porta a V2 lo estrictamente reutilizable:

- **Esquema Supabase:** tablas `users`, `conversations`, `conversation_participants`, `messages`, `call_signals`, junto con sus políticas RLS y funciones (`is_participant`, `shares_conversation`).
- **JWT middleware Socket.IO** (verificación con `supabaseAuth.getClaims`).
- **Patrón de oscillators con tracking explícito** en tonos de llamada (aprendizaje de `useRingTone` V1: mantener refs de `activeOscsRef`, `activeGainsRef` para stop inmediato en iOS).

Todo lo demás se reescribe desde cero bajo esta arquitectura. El código de V1 queda como referencia histórica en el tag `spabla-stable-ot-071-targetlang-translation-2026-07-04`, no se importa a V2.
