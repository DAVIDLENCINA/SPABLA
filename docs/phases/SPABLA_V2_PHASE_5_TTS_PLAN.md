# SPABLA V2 — Fase 5: TTS Module (plan previo)

Documento de planificación. Cierra el alcance de Fase 5 antes de escribir código.
Base: tag `spabla-v2-phase-4-translation-2026-07-06` @ `43dd49e`.

Este documento **NO autoriza** implementación. La implementación se abrirá en la
rama `spabla-v2/fase-5-tts` desde el tag base, con commit único al cierre.

---

## 1. Objetivo del módulo

Construir el módulo de **Síntesis de voz (Text-to-Speech)** del Engine.
Convertir texto — típicamente el `translatedText` que sale de `translation.completed` —
en una secuencia ordenada de fragmentos de audio (`TTSAudioChunk`) que un
adaptador externo entrega vía streaming. El Engine solo enruta chunks;
nunca reproduce sonido.

Al cierre de Fase 5, un consumidor de `SpablaCore` puede:
- Abrir una sesión TTS ligada a una `CallSession` activa y a una voz
  configurable (idioma, timbre, velocidad).
- Enviar textos y recibir una secuencia de `tts.chunk.generated` seguida de
  un `tts.completed`, ambos identificando cada chunk por `requestId + seq`.
- Registrar un adaptador TTS (fake en tests; ElevenLabs / OpenAI TTS /
  Cartesia / cualquier otro en producción — intercambiables).
- Cancelar la síntesis en curso (implícito via `stopTTS`).
- Recibir `tts.failed` con `code: "provider-rejected" | "cancelled" | "timeout"`
  cuando algo sale mal, sin acoplarse al proveedor.

---

## 2. Responsabilidad exacta

`TTSManager` es el **único** módulo que:
- Recibe `TTSSynthesisRequest`.
- Aplica las dos máquinas de estado (session + request).
- Invoca al adaptador vía `AdapterRegistry.get("tts")`.
- Consume el stream de chunks del adaptador y los reemite como eventos.
- Garantiza el **orden estricto** de chunks por `seq` monotónico por request.
- Emite eventos `tts.*`.
- Aplica timeout al recibir el primer chunk (defensa contra proveedores
  colgados).
- Cancela vía `AbortSignal` cuando el llamador cierra la sesión.

`TTSManager` **no**:
- Importa `elevenlabs`, `openai`, `cartesia`, `@google/tts` ni cualquier
  proveedor.
- Contiene prompts, endpoints, credenciales, voice IDs concretos.
- Elige qué proveedor usar — recupera el adaptador del registry sin
  discriminarlo.
- Decodifica bytes de audio (MIME opaco, se propaga verbatim).
- Reproduce audio (no toca `<audio>`, `AudioContext`, `RTCPeerConnection`).
- Persiste requests ni chunks (Fase 7).
- Aplica retry / rate limiting (fuera de scope V2).
- Concatena chunks para producir un blob final — solo emite chunks en orden.
  Concatenación es responsabilidad del reproductor externo.

`SpablaCore` **no sintetiza directamente**. Toda síntesis pasa por el manager.

---

## 3. Qué NO hará todavía

- **No implementará adaptadores reales** (ElevenLabs, OpenAI TTS, Cartesia,
  Google WaveNet, Azure Neural, etc.). El interface se define; las
  implementaciones concretas llegan en fases posteriores o como paquetes
  externos.
- **No hará TTS non-streaming.** La API asume streaming como contrato
  primario. Un adaptador que devuelva un único chunk final (`isFinal: true`
  desde el primer chunk) es un caso degenerado válido.
- **No concatenará chunks.** El consumer (Audio Output adapter en Fase
  siguiente) es quien decide si reproduce en streaming o acumula antes.
- **No aplicará memoria/contexto entre síntesis.** Cada request es
  independiente. Voice ID, prosodia y velocidad viajan en cada request.
- **No orquestará Translation → TTS.** Fase 5 provee el primitivo;
  la orquestación es Fase 6+.
- **No hará TTS desde SpablaCore.** Regla dura, testeada.
- **No conocerá el transporte** del adaptador (fetch streaming, WebSocket,
  gRPC).
- **No reproducirá audio.** El Engine ignora completamente cómo suena un
  chunk; solo lo emite con su `mimeType` y bytes crudos.
- **No detectará silencio, pausas ni prosodia.** El chunk es opaco.
- **No implementará control de volumen, mute, pause, seek.** Esos son
  controles del reproductor.
- **No conocerá dispositivos de salida.** Ni `getUserMedia`, ni
  `MediaStreamTrack`, ni `speaker.setOutputDevice`.
- **No expondrá `HTMLAudioElement`, `AudioBuffer`, `AudioContext` en su
  API.** El engine solo maneja bytes + MIME.

---

## 4. Contratos

Cinco tipos `Readonly`. Todos los snapshots devueltos por el manager son
frozen.

### 4.1 `TTSSession`

```
type TTSSession = Readonly<{
  id: UUID;
  callSessionId: UUID;
  voice: TTSVoiceConfig;            // idioma + voz por defecto para requests
  state: TTSSessionState;
  createdAt: ISOTimestamp;
  startedAt: ISOTimestamp | undefined;
  endedAt: ISOTimestamp | undefined;
  failedAt: ISOTimestamp | undefined;
  failureReason: string | undefined;
  requestCount: number;
  completedCount: number;
  failedCount: number;
  cancelledCount: number;
}>;

type TTSVoiceConfig = Readonly<{
  language: LangCode;
  voiceId: string;                  // opaco al Engine; identificador del proveedor
  rate?: number;                    // opcional 0.5..2.0; el manager no valida
  pitch?: number;                   // opcional; opaco
}>;
```

### 4.2 `TTSSynthesisRequest`

```
type TTSSynthesisRequest = Readonly<{
  id: UUID;
  sessionId: UUID;
  callSessionId: UUID;
  text: string;
  language: LangCode;
  voiceId: string;
  sourceTranslationRequestId: UUID | undefined;   // link opcional a translation
  state: TTSRequestState;
  createdAt: ISOTimestamp;
  dispatchedAt: ISOTimestamp | undefined;
  firstChunkAt: ISOTimestamp | undefined;         // TTFB del adaptador
  completedAt: ISOTimestamp | undefined;
  failedAt: ISOTimestamp | undefined;
  cancelledAt: ISOTimestamp | undefined;
  chunkCount: number;                             // cuántos chunks emitidos
  totalBytes: number;                             // suma de audioBytes.length
  mimeType: string | undefined;                   // fijado por el primer chunk
  error: TTSError | undefined;
}>;
```

### 4.3 `TTSAudioChunk`

```
type TTSAudioChunk = Readonly<{
  requestId: UUID;
  sessionId: UUID;
  seq: number;                     // 0-based, monotónico creciente por request
  audioBytes: Uint8Array;          // opaco; el Engine no decodifica
  mimeType: string;                // "audio/mpeg" | "audio/wav" | "audio/opus" | ...
  isFinal: boolean;                // true en el último chunk del request
  receivedAt: ISOTimestamp;
}>;
```

### 4.4 `TTSSynthesisResult`

Snapshot resumen que se adjunta al evento `tts.completed`. No contiene el
audio (el audio ya viajó chunk a chunk). Sirve como cierre y auditoría.

```
type TTSSynthesisResult = Readonly<{
  requestId: UUID;
  chunkCount: number;
  totalBytes: number;
  mimeType: string;
  providerDisplayName: string;
  completedAt: ISOTimestamp;
}>;
```

### 4.5 `TTSError`

```
type TTSError = Readonly<{
  requestId: UUID;
  code: TTSErrorCode;
  message: string;
  receivedAt: ISOTimestamp;
}>;

type TTSErrorCode =
  | "no-adapter"
  | "session-terminal"
  | "provider-rejected"
  | "timeout"
  | "cancelled"
  | "invariant";               // p.ej. seq no monotónico
```

---

## 5. Máquinas de estado

### 5.1 `TTSSessionState`

```
type TTSSessionState =
  | "idle"          // transitorio interno tras createSession
  | "active"        // aceptando requests
  | "completed"     // stop() ejecutado (terminal)
  | "failed";       // fallo crítico (terminal, poco común)
```

Transiciones autorizadas:

| Desde | A | Trigger |
|---|---|---|
| `idle` | `active` | interno tras `createSession` — antes de emitir `tts.session.started` |
| `active` | `completed` | comando `stop` |
| `active` | `failed` | fallo crítico persistente del adaptador (raro) |

Terminales: `completed`, `failed`. Como en STT y Translation, `idle` no se
emite externamente.

### 5.2 `TTSRequestState`

```
type TTSRequestState =
  | "created"       // request registrado, aún no despachado
  | "dispatched"    // llamada al adaptador in-flight; sin primer chunk
  | "streaming"     // al menos un chunk recibido, aún no final
  | "completed"     // chunk con isFinal=true recibido (terminal)
  | "failed"        // adapter rechazó, timeout o invariant (terminal)
  | "cancelled";    // stopTTS mientras estaba dispatched/streaming (terminal)
```

Transiciones autorizadas:

| Desde | A | Trigger |
|---|---|---|
| `created` | `dispatched` | Manager invoca `adapter.synthesize(...)` |
| `created` | `failed` | no hay adapter registrado O sesión terminal |
| `dispatched` | `streaming` | primer chunk recibido del adaptador |
| `dispatched` | `failed` | Promise/stream del adapter rechazó, o timeout previo al primer chunk |
| `dispatched` | `cancelled` | stopTTS antes del primer chunk |
| `streaming` | `streaming` | chunks intermedios (self-loop autorizado) |
| `streaming` | `completed` | chunk con `isFinal=true` |
| `streaming` | `failed` | error del adapter durante el stream, o invariant (seq no monotónico) |
| `streaming` | `cancelled` | stopTTS durante el stream |

Terminales: `completed`, `failed`, `cancelled`.

Nota — `streaming → streaming` es un self-loop legítimo: cada chunk
intermedio dispara la lógica del state machine sin cambiar el estado
externo. La máquina lo autoriza para que `assertTransition` no rechace.

---

## 6. Eventos

Seis eventos nuevos añadidos a la unión `EngineEvent`. Todos con
`meta { ts, correlationId }`.

| Nombre | Payload |
|---|---|
| `tts.session.started` | `{ session: TTSSession }` |
| `tts.request.created` | `{ session, request }` |
| `tts.chunk.generated` | `{ session, request, chunk: TTSAudioChunk }` |
| `tts.completed` | `{ session, request, result: TTSSynthesisResult }` |
| `tts.failed` | `{ session, request, error: TTSError }` |
| `tts.session.ended` | `{ session }` |

Todos accesibles vía `SpablaCore.subscribe(name, handler)`. Bus síncrono; el
adapter alimenta chunks async pero los emits al bus son síncronos.

**Orden garantizado por contrato** para un mismo `requestId`:
1. `tts.request.created` (exactamente uno).
2. `tts.chunk.generated` (cero o más, con `chunk.seq` monotónico creciente
   empezando en 0).
3. `tts.completed` (terminal exitoso) **o** `tts.failed` (terminal de fallo).

Nunca se emite un chunk después del terminal. Nunca se emite `tts.completed`
sin al menos un chunk con `isFinal=true`.

---

## 7. API pública prevista en `SpablaCore`

### 7.1 Comandos

**`startTTS(input): StartTTSResult`**
- Firma:
  ```
  startTTS({
    callId: UUID,
    voice: TTSVoiceConfig,
  }) → { sessionId: UUID }
  ```
- Precondiciones:
  - Conversation cargada.
  - `CallSession(callId)` existe y está en `accepted`.
  - `voice.language` es `LangCode` válido; `voice.voiceId` no vacío.
- Efecto: crea `TTSSession` `idle → active`, emite `tts.session.started`,
  devuelve `{ sessionId }`.

**`stopTTS(input): void`**
- Firma: `stopTTS({ sessionId })`
- Precondiciones: sesión existe, no está en terminal.
- Efecto:
  1. Para cada request `dispatched | streaming` en la sesión, llama
     `signal.abort()` (el manager lo hace vía `AbortController` interno) y
     transiciona la request a `cancelled`, emitiendo `tts.failed(code:
     "cancelled")` por cada una.
  2. Transiciona la sesión a `completed`, emite `tts.session.ended`.
- Es idempotente por sesión: llamarlo dos veces sobre la misma sesión
  lanza `SpablaCoreError`.

**`requestSpeech(input): RequestSpeechResult`**
- Firma:
  ```
  requestSpeech({
    sessionId: UUID,
    text: string,
    language?: LangCode,                     // default: session.voice.language
    voiceId?: string,                        // default: session.voice.voiceId
    sourceTranslationRequestId?: UUID,       // link opcional a translation
  }) → { requestId: UUID }
  ```
- Precondiciones: sesión existe y no está en terminal, texto no vacío.
- Efecto:
  1. Crea request en `created`.
  2. Emite `tts.request.created`.
  3. Si sesión terminal (defensa) O no hay adapter registrado O texto
     vacío → transiciona `created → failed`, emite `tts.failed`, retorna
     `{ requestId }` con el request ya `failed`.
  4. Si adapter presente: transiciona `created → dispatched`, arranca el
     consumo async del stream, retorna `{ requestId }`.
- Retorna `{ requestId }` **sincronizadamente**. Los chunks llegan después
  vía `tts.chunk.generated`.

### 7.2 Snapshots read-only

- `getTTSSession(sessionId): TTSSession | undefined`
- `getTTSRequest(requestId): TTSSynthesisRequest | undefined`
- `listActiveTTSSessions(callId): ReadonlyArray<TTSSession>`

### 7.3 Regla dura

**Nunca sintetizar directamente desde SpablaCore.** No existen métodos que
llamen `fetch` a un proveedor. Todo pasa por `TTSManager` que pasa por
`TTSAdapter`.

---

## 8. Integración con Translation

La integración Translation → TTS **no se implementa** en Fase 5. Se
documenta como target de Fase 6+ (orquestación).

### 8.1 Flujo previsto

```
translation.completed {
  session, request, result: { translatedText, targetLanguage, requestId }
}
   │
   ▼
Orquestador (Fase 6+) escucha el evento y hace:
   requestSpeech({
     sessionId: <tts session id>,
     text: result.translatedText,
     language: result.targetLanguage,
     sourceTranslationRequestId: request.id,   // ← link back
   })
```

### 8.2 Test manual en Fase 5

Un test específico verifica el path completo **manualmente** (sin
orquestador automático), replicando el patrón STT→Translation de Fase 4:

1. `startTranslation` + `startTTS`.
2. Registrar `FakeTranslationAdapter` + `FakeTTSAdapter`.
3. `requestTranslation({ ... })` → esperar `translation.completed`.
4. Al recibir el evento, invocar `requestSpeech` con
   `sourceTranslationRequestId` del translation request.
5. Verificar que llegan `tts.chunk.generated` (uno o más) seguidos de
   `tts.completed` con el `sourceTranslationRequestId` preservado en el
   `request` snapshot.

Esto valida composibilidad end-to-end. La automatización real llega en
Fase 6.

---

## 9. Integración futura con Audio Output

Documentada, no implementada.

### 9.1 Flujo previsto

```
tts.chunk.generated { session, request, chunk: { audioBytes, mimeType, seq, isFinal } }
   │
   ▼
Adaptador de salida (Fase 6+ o consumer SDK) escucha el evento y decide:
   - streaming inmediato: alimentar cada chunk a MediaSource / decodeAudioData
   - buffer completo: acumular hasta isFinal y reproducir de una vez
   - transporte: reenviar bytes por WebRTC data channel al peer
```

### 9.2 Contrato garantizado en Fase 5

- Los chunks llegan **en orden** (`seq` monotónico) por `requestId`.
- `mimeType` es estable dentro de un mismo `requestId` (el primer chunk lo
  fija; chunks siguientes con `mimeType` distinto disparan `tts.failed(code:
  "invariant")`).
- El `TTSAudioChunk.requestId` permite al consumer correlacionar con el
  request original.
- El `TTSSynthesisRequest.sourceTranslationRequestId` (opcional) permite
  correlacionar con la traducción origen, y por transitividad con el turno
  STT original.

Fase 5 no crea adapter de audio output, no importa ninguna API del
navegador, no emite eventos de reproducción.

---

## 10. Adapter `TTSAdapter`

### 10.1 Contrato

Se refuerza el marker `TTSAdapter` de Fase 1.5 al patrón adoptado en Fase
4.1 para MT: `AdapterByKind.tts = TTSAdapter` con el método `synthesize`
obligatorio, para que el `AdapterRegistry` rechace en `register()` cualquier
impl que no lo tenga (tanto en tipo como en runtime).

```typescript
interface TTSAdapter extends AdapterBase<"tts"> {
  readonly displayName: string;
  synthesize(
    request: TTSAdapterRequest,
    signal: AbortSignal,
  ): AsyncIterable<TTSAdapterChunk>;
}

type TTSAdapterRequest = Readonly<{
  requestId: UUID;
  text: string;
  language: LangCode;
  voiceId: string;
  rate?: number;
  pitch?: number;
}>;

type TTSAdapterChunk = Readonly<{
  seq: number;
  audioBytes: Uint8Array;
  mimeType: string;
  isFinal: boolean;
}>;
```

### 10.2 Registro

Vía `SpablaCore.getAdapterRegistry().register("tts", provider)` (o vía
inyección al construir el Engine). Sin registro, `requestSpeech` produce
`tts.failed(code: "no-adapter")`.

### 10.3 `FakeTTSAdapter` para tests

Definido inline en `TTSManager.test.ts` y `SpablaCore.test.ts`. Implementa
la interfaz con respuestas configurables: número de chunks, delay entre
chunks, error injection, cancellation handling, sync-throw injection.

Ejemplo conceptual (no código para aplicar):
```
class FakeTTSAdapter {
  readonly kind = "tts" as const;
  readonly displayName = "fake-tts";
  private plan: (req) => AsyncIterable<TTSAdapterChunk>;
  synthesize(req, signal) {
    return this.plan(req);  // el plan honra `signal.aborted`
  }
}
```

### 10.4 Requisitos que `TTSManager` impone al adaptador

Consolidado con §11 (contratos del proveedor):

- El adaptador **debe** devolver un `AsyncIterable<TTSAdapterChunk>` que
  produzca chunks **en orden creciente de `seq`** empezando en 0.
- El adaptador **debe** honrar `signal.aborted`: al recibir un abort,
  detiene el stream lo antes posible y termina la iteración.
- El adaptador **debe** emitir exactamente **un** chunk con `isFinal=true`
  al final del stream exitoso. Sin él, el manager espera indefinidamente
  (o hasta el timeout del primer chunk si nunca hubo ninguno; ver §11).
- El adaptador **debe** mantener el mismo `mimeType` en todos los chunks
  de un mismo request.
- El adaptador **no** conoce el bus de eventos; solo entrega chunks.
- El adaptador **no** persiste estado que TTSManager necesite.
- El adaptador **puede** rechazar (`throw` desde `synthesize` o desde el
  iterador) — el manager lo captura y emite `tts.failed(code:
  "provider-rejected")`.

### 10.5 Contratos NO delegados al adaptador

- Persistencia de requests y chunks (Fase 7).
- Retry policies (fuera de scope V2).
- Rate limiting (fuera de scope V2).
- Decodificación del audio (nunca; los bytes son opacos).

### 10.6 Prohibición de acoplamiento

**Verificado por script en el criterio 8 de aceptación:**
```
grep -r "elevenlabs\|openai\|cartesia\|@google\|azure\|amazon-polly" engine/src/tts/
```
debe devolver **0 líneas**. TTSManager no sabe siquiera qué es ElevenLabs.

---

## 11. Requisitos del proveedor (contrato reforzado)

Detalle formal de lo que un `TTSAdapter` debe cumplir, más allá del tipo.

### 11.1 Streaming soportado

- Contrato: `synthesize()` retorna un `AsyncIterable<TTSAdapterChunk>`. Un
  adaptador non-streaming (que solo puede devolver el audio completo)
  emula la interfaz devolviendo un iterable de un solo chunk con
  `isFinal=true` y `seq=0`.
- Consecuencia: el consumer siempre ve la misma API.

### 11.2 Chunk ordering

- Regla: `chunk.seq` es entero, empieza en 0, y estrictamente creciente
  (+1 por chunk). No hay huecos, no hay repeticiones, no hay retrocesos.
- Enforcement del manager: si llega un chunk cuyo `seq !==
  request.chunkCount`, el manager transiciona la request a `failed(code:
  "invariant", message: "non-monotonic seq: expected N, got M")` y aborta
  el signal.

### 11.3 Cancelación

- Contrato: `synthesize()` recibe un `AbortSignal`. Cuando el manager llama
  a `stopTTS(sessionId)`, para cada request in-flight ejecuta
  `controller.abort()`, lo que hace que `signal.aborted === true`.
- Comportamiento esperado del adapter: detectar `signal.aborted` en el
  siguiente await del generador, cerrar recursos, terminar la iteración.
  Puede opcionalmente `throw` — el manager captura y NO reemite
  `tts.failed` porque ya emitió `tts.failed(code: "cancelled")` en el
  momento del abort.
- Idempotencia: llamar `stop()` sobre una sesión con requests ya
  terminales no hace nada.

### 11.4 Timeout

- Regla: el manager arma un timer al llamar `synthesize()` que dispara si
  no llega el primer chunk en `TTS_FIRST_CHUNK_TIMEOUT_MS` (constante
  interna, default 10_000 ms; configurable vía dependency injection en la
  Fase 5 solo para tests).
- Al vencer: `signal.abort()` + transición `dispatched → failed(code:
  "timeout")`.
- No hay timeout de chunks intermedios en Fase 5 (potencial mejora Fase
  6+).

### 11.5 Correlación por requestId

- Cada `TTSAdapterChunk` que emite el proveedor NO carga `requestId` — el
  manager sabe de qué request es porque el `AsyncIterable` está atado a
  ese request (dispatch por request). Al reemitirlo como `TTSAudioChunk`
  hacia el bus, el manager añade `requestId`, `sessionId`, `receivedAt`.
- Consecuencia: el `requestId` es la única correlación entre el request
  del consumer y los chunks; el adapter no lo necesita para nada más que
  logging.

### 11.6 Backpressure

- Fuera de scope Fase 5. El manager consume el iterador tan rápido como
  llega y reemite al bus síncronamente. Consumidores lentos son problema
  del subscriber, no del manager.

---

## 12. Tests previstos

**Total ≈ 60 tests nuevos.** Suite total tras Fase 5: **≥ 446 tests** (386
+ 60).

### 12.1 `TTSManager.test.ts` (≈ 30 tests)

**createSession + stopSession (5)**
- crea con `voice` válida, transiciona `idle → active`, emite `tts.session.started`
- rechaza duplicate sessionId
- guarda `callSessionId` y `voice` verbatim
- `stop` en `active` sin requests in-flight → `completed`, emite `tts.session.ended`
- `stop` en terminal es rechazado

**requestSpeech happy path (7)**
- crea request en `created`
- transiciona `created → dispatched`, invoca `adapter.synthesize` con signal
- primer chunk transiciona `dispatched → streaming`, fija `mimeType`
- múltiples chunks: seq monotónico, se acumula `chunkCount` y `totalBytes`
- chunk con `isFinal=true` transiciona a `completed`, emite `tts.completed`
- emite eventos en orden: `request.created`, `chunk.generated` (N veces), `completed`
- `session.completedCount` incrementa

**requestSpeech con adapter (4)**
- request devuelve `requestId` sync (antes de que llegue el primer chunk)
- `providerDisplayName` preservado en `TTSSynthesisResult`
- adapter con un único chunk (`isFinal=true` en seq=0) funciona
- adapter con muchos chunks (>10) funciona y todos llegan en orden

**Cancelación (5)**
- `stopTTS` durante `dispatched` → request a `cancelled`, emite `tts.failed(code: "cancelled")`
- `stopTTS` durante `streaming` → request a `cancelled`, chunks siguientes ignorados
- adapter que llega tarde después de cancelación no reemite chunks (idempotencia terminal)
- `stopTTS` cancela TODAS las requests in-flight de la sesión
- session pasa a `completed` tras cancelar todas las requests

**Timeout (3)**
- adapter que nunca produce chunk → tras `firstChunkTimeoutMs`, request a `failed(code: "timeout")`
- adapter que produce el primer chunk antes del timeout → no dispara timeout
- timeout inyectable vía DI (para hacer el test rápido)

**Errores (4)**
- request sin adapter registrado → `tts.failed(code: "no-adapter")`
- request en sesión terminal → falla con `code: "session-terminal"`
- request en sesión inexistente → error tipado (`throw`)
- adapter con `synthesize` que hace `throw` síncrono → `tts.failed(code: "provider-rejected")`, request en `failed` (herencia del hardening Fase 4.1)

**Invariantes (2)**
- adapter que emite `seq` no monotónico → `tts.failed(code: "invariant")` + abort
- adapter que cambia `mimeType` a mitad del stream → `tts.failed(code: "invariant")` + abort

### 12.2 `SpablaCore.test.ts` — nuevos describes (≈ 30 tests)

**startTTS (5)**
- devuelve `sessionId`, snapshot en `active`
- rechaza si no hay conversation cargada
- rechaza si `CallSession` no existe / no está en `accepted`
- rechaza si `voice.voiceId` es vacío
- emite `tts.session.started`

**stopTTS (4)**
- transiciona a `completed`, emite `tts.session.ended`
- rechaza `sessionId` desconocido
- rechaza sesión ya terminal
- cancela requests in-flight vía adapter

**requestSpeech (6)**
- happy path con `FakeTTSAdapter` registrado → chunks llegan seguidos de `tts.completed`
- sin adapter registrado → `tts.failed`
- rechaza `sessionId` desconocido
- rechaza sesión terminal
- rechaza texto vacío
- múltiples requests en la misma sesión no interfieren (orden por request)

**Adapter (4)**
- adapter registrado vía `getAdapterRegistry().register("tts", fake)`
- `FakeTTSAdapter` es reemplazable en runtime
- adapter no expuesto por métodos públicos de SpablaCore
- adapter con `synthesize` sync-throw → NO deja request colgada (herencia Fase 4.1)

**Eventos (5)**
- subscribe recibe los 6 eventos
- `meta.ts`, `meta.correlationId` presentes en todos
- unsubscribe corta la entrega
- eventos fluyen por el mismo bus que Engine + STT + Messaging + Translation
- ordering por request: `request.created → chunk.generated* → completed | failed`

**Encapsulación + integración Translation-manual (6)**
- SpablaCore no expone `TTSManager` directamente
- `endCall` NO auto-detiene sesiones de TTS (explícito, testeado)
- `stopTTS` cancela requests in-flight vía `AbortSignal`
- **Integración manual Translation + TTS**: crear Translation + `requestTranslation` + `requestSpeech({ sourceTranslationRequestId: translationReq.id })` → verificar que `tts.completed` llega y el snapshot preserva `sourceTranslationRequestId`
- los 386 tests de Fase 4 siguen verdes sin modificación
- exposición pública: los 3 comandos + 3 snapshots están en el prototype

---

## 13. Prohibido

Reglas duras. Cualquier violación bloquea el cierre de la fase.

- **No ElevenLabs real.** Cero `import "elevenlabs"`, cero `fetch("https://api.elevenlabs.io/...")`, cero credenciales.
- **No OpenAI TTS real.** Cero `openai.audio.speech.create(...)`.
- **No Cartesia real.** Cero `cartesia-js`.
- **No Google/Azure/Amazon TTS real.** Cero acoplamiento.
- **No audio real.** Cero muestras hardcoded, cero WAV embebido, cero base64 de audio de verdad. Los tests usan `Uint8Array` con bytes arbitrarios (0x00, 0x01, …).
- **No WebAudio.** Cero `AudioContext`, `AudioBuffer`, `decodeAudioData`.
- **No HTMLAudioElement.** Cero `new Audio()`, cero `<audio>`.
- **No React.** Cero componentes, cero hooks.
- **No UI.** Cero DOM, cero CSS.
- **No WebRTC.** Cero `RTCPeerConnection`, `RTCDataChannel`.
- **No Supabase real.** Cero cliente, cero persistencia en tests.
- **No tocar V1.** `app/` y `server/` intactos.
- **No modificar arquitectura fuera de TTS.** Solo se añade el manager,
  los tipos, los eventos, la companion class y los delegators. Nada más.
- **No añadir features fuera del plan.** No pause/resume, no volumen, no
  dispositivo de salida, no cache, no offline.

---

## 14. Criterios exactos para declarar estable la fase

Fase 5 se considera **estable** — y se crea tag protegido
`spabla-v2-phase-5-tts-2026-XX-XX` — sólo si **todos** los criterios abajo
se cumplen:

1. **Suite total ≥ 446 tests verdes.** `npm --prefix engine test` sin fallos.
2. **Cobertura ≥ 85%** en las cuatro métricas globales (statements,
   branches, functions, lines). Módulo `tts/` con **≥ 95% en las CUATRO**
   métricas individualmente; objetivo real: 100/100/100/100 replicando el
   patrón de `translation/`.
3. **Typecheck limpio:** `npm --prefix engine run typecheck` sin errores.
   La configuración `strict` + `noUncheckedIndexedAccess` +
   `exactOptionalPropertyTypes` sigue activa.
4. **Cero regresiones:** los 386 tests de Fase 4 siguen verdes sin
   modificación.
5. **Ningún archivo de fuente > 300 líneas.** Absoluto 400. Si
   `SpablaCore.ts` o `Engine.ts` suben, se extrae al patrón `tts-ops.ts`
   como en Fase 3 (`stt-ops.ts`) y Fase 4 (`translation-ops.ts`).
6. **Encapsulación intacta:** `SpablaCore` no expone `TTSManager` ni el
   `bus`. `Object.getOwnPropertyNames(SpablaCore.prototype)` no contiene
   `getTTSManager`. Tests de encapsulación pasan sin modificación.
7. **V1 byte-idéntico** al tag
   `spabla-stable-ot-071-targetlang-translation-2026-07-04`. Verificado
   con `git diff <tag> HEAD -- app/ server/` = 0.
8. **Arquitectural — regla NO relajable:** `TTSManager` no importa ningún
   proveedor concreto. Verificado con:
   ```
   grep -r "elevenlabs\|openai\|cartesia\|@google\|azure\|amazon-polly" engine/src/tts/
   ```
   = 0 líneas. Además:
   ```
   grep -r "AudioContext\|HTMLAudioElement\|AudioBuffer\|decodeAudioData\|RTCPeerConnection\|navigator\|document\|window\." engine/src/
   ```
   = 0 líneas. El Engine no conoce el navegador.
9. **Contract check del AdapterRegistry:** un test asegura que registrar
   un `TTSAdapter` sin `synthesize()` es rechazado (paralelo al test Fase
   4.1 para `translate()`).
10. **Orden de chunks**: un test específico con 20+ chunks verifica que
    el orden de `tts.chunk.generated` respeta `seq` monotónico.

Sólo con los diez se crea el tag protegido. Cualquier fallo se documenta
como candidato, no como stable, y se itera antes de tag.

---

## Reglas arquitectónicas obligatorias (reiteradas)

- **TTSManager nunca conoce proveedores.** Solo conoce `TTSAdapter`.
- **Todo proveedor debe ser sustituible.** Registro vía `AdapterRegistry`;
  reemplazo vía `unregister` + `register`.
- **Todo audio se identifica mediante `requestId` y `seq` (chunkId
  implícito).** El manager añade estos IDs; el adapter no los necesita.
- **El orden de reproducción queda garantizado por contrato:** `seq`
  monotónico, enforcement en el manager, `tts.failed(code: "invariant")`
  si el adapter rompe.
- **El Engine nunca reproduce audio.** Cero `<audio>`, cero
  `AudioContext`.
- **El Engine nunca interactúa con hardware.** Cero `getUserMedia`, cero
  `mediaDevices`, cero `speaker.*`.
- **El Engine nunca usa APIs del navegador.** Cero `document`, `window`,
  `navigator`, `location`. Verificable por grep en el criterio 8.
- **El Engine no conoce micrófono, altavoces, WebRTC, Web Audio ni
  HTMLAudioElement.** Todos esos viven en adaptadores externos.
- **El Engine solo conoce eventos, estados y contratos.** Un stream de
  bytes opaco identificado por MIME es el único contacto con la realidad
  auditiva.
- **Hardware, audio real y navegador pertenecen siempre a adaptadores
  externos.** Ni siquiera los tests del Engine simulan reproducción.

---

## Entregable de este documento (no incluye código)

Este archivo es el único entregable de esta pre-fase. La siguiente
autorización del jefe de proyecto abrirá:
- Rama nueva `spabla-v2/fase-5-tts` desde el tag
  `spabla-v2-phase-4-translation-2026-07-06`.
- Implementación de los archivos derivados del §12 y §7.
- Ejecución de los tests listados en §12.
- Commit único al cierre con mensaje `feat(engine): fase 5 — tts module`.

Sin autorización explícita no se toca código.
