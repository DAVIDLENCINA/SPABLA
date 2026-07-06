# SPABLA V2 — Fase 5: TTS Module (plan previo)

Documento de planificación. Cierra el alcance de Fase 5 antes de escribir
código. Base: tag `spabla-v2-phase-4-translation-2026-07-06` @ `43dd49e`.

Este documento **NO autoriza** implementación. La implementación se
abrirá en la rama `spabla-v2/fase-5-tts` desde el tag base, con commit
único al cierre.

Fuentes normativas transversales (no se re-imprimen aquí):

- Reglas de código y prohibiciones transversales:
  [`../standards/SPABLA_V2_CODE_STANDARD.md`](../standards/SPABLA_V2_CODE_STANDARD.md).
- Criterios universales de "estable":
  [`../standards/SPABLA_V2_RELEASE_STANDARD.md`](../standards/SPABLA_V2_RELEASE_STANDARD.md).
- Estándar documental:
  [`../SPABLA_V2_DOCUMENTATION_STANDARD.md`](../SPABLA_V2_DOCUMENTATION_STANDARD.md).

---

## 1. Objetivo del módulo

Construir el módulo **Síntesis de voz (Text-to-Speech)** del Engine. Convertir texto — típicamente el `translatedText` de `translation.completed` — en una secuencia ordenada de fragmentos (`TTSAudioChunk`) que un adaptador externo entrega vía streaming. El Engine solo enruta chunks; nunca reproduce sonido.

Al cierre de Fase 5, un consumidor de `SpablaCore` puede: abrir una sesión TTS ligada a una `CallSession` activa y a una voz configurable; enviar textos y recibir `tts.chunk.generated` + `tts.completed`, cada chunk identificado por `requestId + seq`; registrar un adaptador TTS (fake en tests; cualquier proveedor en producción); cancelar la síntesis en curso (implícito vía `stopTTS`); recibir `tts.failed` con `code: "provider-rejected" | "cancelled" | "timeout" | "invariant"`, sin acoplarse al proveedor.

---

## 2. Responsabilidad exacta

`TTSManager` es el único módulo que: recibe `TTSSynthesisRequest`; aplica las dos máquinas de estado; invoca al adaptador vía `AdapterRegistry.get("tts")`; consume el stream de chunks y los reemite como eventos; **garantiza orden estricto de chunks por `seq` monotónico** por request; emite eventos `tts.*`; aplica timeout al primer chunk; cancela vía `AbortSignal` cuando el llamador cierra la sesión.

`TTSManager` no: importa proveedores concretos ([Code Standard §6.2](../standards/SPABLA_V2_CODE_STANDARD.md#62-proveedores-de-ia)); contiene prompts, endpoints, credenciales, voice IDs; elige proveedor; decodifica bytes de audio (MIME opaco); reproduce audio ([Code Standard §6.1](../standards/SPABLA_V2_CODE_STANDARD.md#61-apis-del-navegador)); persiste requests ni chunks (Fase 7); aplica retry / rate limiting; concatena chunks.

`SpablaCore` no sintetiza directamente. Toda síntesis pasa por el manager.

---

## 3. Qué NO hará todavía

- **No adaptadores reales** (proveedores listados en §13). Interface se define; implementaciones fuera del Engine.
- **No TTS non-streaming.** Un adapter con un único chunk final es el caso degenerado válido.
- **No concatenación de chunks.** El consumer decide.
- **No memoria/contexto entre síntesis.** Cada request independiente.
- **No orquestación Translation → TTS** (Fase 6+); no TTS desde SpablaCore; no conocimiento del transporte del adapter.
- **No reproducción de audio.** Chunk opaco (bytes + MIME).
- **No detección de silencio, pausas, prosodia; ni control de volumen, mute, pause, seek, output device.**

Prohibiciones transversales adicionales por [Code Standard §6](../standards/SPABLA_V2_CODE_STANDARD.md#6-prohibiciones-transversales).

---

## 4. Contratos

Cinco tipos `Readonly`. Snapshots frozen.

### 4.1 `TTSSession`

```
type TTSSession = Readonly<{
  id: UUID;
  callSessionId: UUID;
  voice: TTSVoiceConfig;
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
  voiceId: string;      // opaco al Engine
  rate?: number;        // 0.5..2.0; el manager no valida
  pitch?: number;       // opcional; opaco
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
  sourceTranslationRequestId: UUID | undefined;   // link opcional
  state: TTSRequestState;
  createdAt: ISOTimestamp;
  dispatchedAt: ISOTimestamp | undefined;
  firstChunkAt: ISOTimestamp | undefined;         // TTFB del adapter
  completedAt: ISOTimestamp | undefined;
  failedAt: ISOTimestamp | undefined;
  cancelledAt: ISOTimestamp | undefined;
  chunkCount: number;
  totalBytes: number;
  mimeType: string | undefined;                   // fijado por el 1er chunk
  error: TTSError | undefined;
}>;
```

### 4.3 `TTSAudioChunk`

```
type TTSAudioChunk = Readonly<{
  requestId: UUID;
  sessionId: UUID;
  seq: number;               // 0-based, monotónico por request
  audioBytes: Uint8Array;    // opaco
  mimeType: string;          // "audio/mpeg" | "audio/wav" | ...
  isFinal: boolean;
  receivedAt: ISOTimestamp;
}>;
```

### 4.4 `TTSSynthesisResult`

Adjunto a `tts.completed`; no contiene audio (ya viajó chunk a chunk).

```
type TTSSynthesisResult = Readonly<{
  requestId: UUID; chunkCount: number; totalBytes: number;
  mimeType: string; providerDisplayName: string; completedAt: ISOTimestamp;
}>;
```

### 4.5 `TTSError`

```
type TTSError = Readonly<{
  requestId: UUID; code: TTSErrorCode; message: string; receivedAt: ISOTimestamp;
}>;
type TTSErrorCode =
  | "no-adapter" | "session-terminal" | "provider-rejected"
  | "timeout" | "cancelled" | "invariant";
```

---

## 5. Máquinas de estado

**`TTSSessionState`**: `idle` → `active` → `completed` | `failed`.
Transiciones: `idle → active` (interno tras `createSession`); `active →
completed` (comando `stop`); `active → failed` (fallo crítico
persistente). Terminales: `completed`, `failed`. `idle` no se emite.

**`TTSRequestState`**: `created` → `dispatched` → `streaming` →
`completed` | `failed` | `cancelled`.

Transiciones: `created → dispatched` (invoca `adapter.synthesize`);
`created → failed` (sin adapter O sesión terminal);
`dispatched → streaming` (primer chunk);
`dispatched → failed` (adapter rechaza o timeout antes del 1er chunk);
`dispatched → cancelled` (stopTTS antes del 1er chunk);
`streaming → streaming` (chunks intermedios, self-loop autorizado);
`streaming → completed` (chunk con `isFinal=true`);
`streaming → failed` (error del adapter en el stream, o invariant tipo
seq no monotónico);
`streaming → cancelled` (stopTTS durante el stream).

Terminales: `completed`, `failed`, `cancelled`.

---

## 6. Eventos

Seis eventos con `meta { ts, correlationId }`:

| Nombre | Payload |
|---|---|
| `tts.session.started` | `{ session: TTSSession }` |
| `tts.request.created` | `{ session, request }` |
| `tts.chunk.generated` | `{ session, request, chunk: TTSAudioChunk }` |
| `tts.completed` | `{ session, request, result: TTSSynthesisResult }` |
| `tts.failed` | `{ session, request, error: TTSError }` |
| `tts.session.ended` | `{ session }` |

**Orden garantizado por contrato** para un mismo `requestId`:
`tts.request.created` (exactamente uno) → `tts.chunk.generated` (0 o
más, con `seq` monotónico creciente desde 0) → `tts.completed`
(terminal exitoso) **o** `tts.failed`. Nunca chunk tras terminal. Nunca
`tts.completed` sin `isFinal=true`.

---

## 7. API pública de `SpablaCore`

**`startTTS({ callId, voice: TTSVoiceConfig }): { sessionId }`** —
precondiciones: conversation cargada; `CallSession(callId)` en
`accepted`; `voice.voiceId` no vacío. Efecto: crea `TTSSession` `idle
→ active`, emite `tts.session.started`.

**`stopTTS({ sessionId }): void`** — precondición: sesión existe y no
terminal. Efecto: (1) para cada request `dispatched | streaming`,
`controller.abort()` + transición a `cancelled` + emite
`tts.failed(code: "cancelled")`; (2) transiciona la sesión a `completed`
+ emite `tts.session.ended`. Idempotente por sesión: segunda llamada
lanza `SpablaCoreError`.

**`requestSpeech({ sessionId, text, language?, voiceId?, sourceTranslationRequestId? }): { requestId }`** —
precondiciones: sesión existe y no terminal, texto no vacío. `language`
default `session.voice.language`; `voiceId` default
`session.voice.voiceId`. Efecto: crea request en `created` + emite
`tts.request.created`. Si sesión terminal / sin adapter / texto vacío
→ `created → failed` + `tts.failed`. Si adapter presente: `created →
dispatched`, arranca consumo async del stream. Devuelve `{ requestId }`
sincronizadamente.

**Snapshots**: `getTTSSession(sessionId)`, `getTTSRequest(requestId)`,
`listActiveTTSSessions(callId)`.

**Regla dura**: nunca sintetizar directamente desde SpablaCore. Todo
pasa por `TTSManager` → `TTSAdapter`.

---

## 8. Integración con Translation (documentada, no implementada)

Fase 5 provee el primitivo; la orquestación llega en Fase 6+.

Flujo previsto: `translation.completed { result: { translatedText,
targetLanguage, requestId } }` → un orquestador escucha e invoca
`requestSpeech({ sessionId: <tts-session>, text: result.translatedText,
language: result.targetLanguage, sourceTranslationRequestId:
request.id })`.

Test manual en Fase 5 (§12.2): crear Translation + TTS + Fakes →
`requestTranslation` → esperar `translation.completed` → llamar
`requestSpeech` con `sourceTranslationRequestId` → verificar que
`tts.chunk.generated` (uno o más) + `tts.completed` llegan y el snapshot
preserva `sourceTranslationRequestId`.

---

## 9. Integración futura con Audio Output (documentada)

Flujo previsto: `tts.chunk.generated { chunk: { audioBytes, mimeType,
seq, isFinal } }` → adaptador externo elige reproducir en streaming,
buffer completo, o transportar por WebRTC data channel al peer. **Fase 5
no crea adapter de audio output ni toca APIs del navegador.**

Contrato garantizado en Fase 5: chunks en orden (`seq` monotónico) por
`requestId`; `mimeType` estable por request (cambio → `tts.failed(code:
"invariant")`); `chunk.requestId` y
`request.sourceTranslationRequestId` permiten correlacionar hacia
translation y por transitividad hacia el turno STT original.

---

## 10. Adapter `TTSAdapter`

Refuerza el marker `TTSAdapter` de Fase 1.5 al patrón adoptado en Fase 4.1 para `MTAdapter`: `AdapterByKind.tts = TTSAdapter` con `synthesize` obligatorio (chequeo en tipo + runtime del `AdapterRegistry`).

```typescript
interface TTSAdapter extends AdapterBase<"tts"> {
  readonly displayName: string;
  synthesize(request: TTSAdapterRequest, signal: AbortSignal): AsyncIterable<TTSAdapterChunk>;
}
type TTSAdapterRequest = Readonly<{
  requestId: UUID; text: string; language: LangCode; voiceId: string;
  rate?: number; pitch?: number;
}>;
type TTSAdapterChunk = Readonly<{
  seq: number; audioBytes: Uint8Array; mimeType: string; isFinal: boolean;
}>;
```

**Registro**: `SpablaCore.getAdapterRegistry().register("tts", provider)` o inyección. Sin registro → `tts.failed(code: "no-adapter")`.

**`FakeTTSAdapter` para tests**: inline en `TTSManager.test.ts` y `SpablaCore.test.ts`. Configurable: nº de chunks, delay, error injection, cancel handling, sync-throw injection.

**Contrato del adapter** (detallado en §11 abajo): entregar chunks en orden con `seq` estrictamente creciente; honrar `signal.aborted`; emitir un chunk `isFinal=true` al final del stream exitoso; mantener el mismo `mimeType` en todos los chunks; no conocer el bus. Contratos NO delegados: persistencia (Fase 7), retry, rate limiting, decodificación del audio. Prohibición de acoplamiento verificada por el grep universal de [Code Standard §11.1](../standards/SPABLA_V2_CODE_STANDARD.md#11-verificación-por-grep-templates) sobre `engine/src/tts/`: 0 líneas.

---

## 11. Requisitos del proveedor

- **Streaming**: `synthesize` devuelve `AsyncIterable`. Non-streaming emula con un iterable de un solo chunk (`isFinal=true`, `seq=0`).
- **Chunk ordering**: `seq` entero desde 0, estrictamente creciente +1. Enforcement: `seq !== request.chunkCount` → `tts.failed(code: "invariant")` + `signal.abort()`.
- **Cancelación**: `synthesize` recibe `AbortSignal`. `stopTTS` invoca `controller.abort()` para cada request in-flight. El adapter detecta `signal.aborted` en el siguiente await, cierra recursos y termina; puede `throw` — el manager NO reemite `tts.failed` (ya emitió `code: "cancelled"` en el abort).
- **Timeout**: `TTS_FIRST_CHUNK_TIMEOUT_MS` default 10 000 ms, DI para tests. Sin 1er chunk → `signal.abort()` + `dispatched → failed(code: "timeout")`. No hay timeout de chunks intermedios en Fase 5.
- **Correlación por requestId**: el manager añade `requestId`, `sessionId`, `receivedAt` al reemitir cada chunk; el adapter no los necesita.
- **Backpressure**: fuera de scope. El manager consume el iterador tan rápido como llega.

---

## 12. Tests previstos

**Total ≈ 60 tests nuevos.** Suite total tras Fase 5: **≥ 446 tests**
(386 + 60).

### 12.1 `TTSManager.test.ts` (~30 tests)

- **createSession + stopSession (5)**: crea con `voice` válida + `idle → active` + `tts.session.started`; rechaza duplicate sessionId; guarda `callSessionId` y `voice` verbatim; `stop` sin requests → `completed` + `session.ended`; `stop` terminal rechazado.
- **requestSpeech happy path (7)**: request `created`; `created → dispatched` + invoca `adapter.synthesize` con signal; 1er chunk → `dispatched → streaming` + fija `mimeType`; chunks múltiples con `seq` monotónico + acumulan `chunkCount` y `totalBytes`; `isFinal=true` → `completed` + `tts.completed`; orden `request.created → chunk.generated* → completed`; `completedCount` incrementa.
- **requestSpeech con adapter (4)**: `requestId` sync; `providerDisplayName` preservado; adapter con único chunk funciona; adapter con >10 chunks entrega todos en orden.
- **Cancelación (5)**: `stopTTS` en `dispatched` → `cancelled` + `tts.failed(code: "cancelled")`; en `streaming` → `cancelled` + chunks siguientes ignorados; adapter tardío post-cancel no reemite; `stopTTS` cancela TODAS las requests in-flight; session → `completed` tras cancelar todas.
- **Timeout (3)**: sin primer chunk → `failed(code: "timeout")`; 1er chunk antes del timeout no dispara; timeout inyectable vía DI.
- **Errores (4)**: sin adapter → `no-adapter`; sesión terminal → `session-terminal`; sesión inexistente → `throw`; sync-throw del adapter → `provider-rejected` (herencia Fase 4.1).
- **Invariantes (2)**: `seq` no monotónico → `invariant` + abort; `mimeType` cambia mid-stream → `invariant` + abort.

### 12.2 `SpablaCore.test.ts` — nuevos describes (~30 tests)

- **startTTS (5)**: `sessionId` + snapshot `active`; rechaza sin conversation; rechaza CallSession inexistente/no-`accepted`; rechaza `voice.voiceId` vacío; emite `tts.session.started`.
- **stopTTS (4)**: `active → completed` + `session.ended`; rechaza sessionId desconocido; rechaza terminal; cancela requests in-flight vía adapter.
- **requestSpeech (6)**: happy path con Fake → chunks + `tts.completed`; sin adapter → `tts.failed`; rechaza sessionId desconocido; rechaza terminal; rechaza texto vacío; múltiples requests no interfieren.
- **Adapter (4)**: registrado vía `getAdapterRegistry().register("tts", fake)`; reemplazable en runtime; no expuesto por SpablaCore; sync-throw NO deja request colgada.
- **Eventos (5)**: subscribe recibe los 6 eventos; `meta.ts` + `meta.correlationId` presentes; unsubscribe corta la entrega; mismo bus que Engine + STT + Messaging + Translation; ordering `request.created → chunk.generated* → completed | failed`.
- **Encapsulación + Translation-manual (6)**: SpablaCore no expone `TTSManager`; `endCall` NO auto-detiene TTS; `stopTTS` cancela vía `AbortSignal`; integración manual Translation + TTS preserva `sourceTranslationRequestId` extremo a extremo; 386 tests de Fase 4 verdes sin modificación; los 3 comandos + 3 snapshots en el prototype.

---

## 13. Prohibiciones específicas de Fase 5

Aplican todas las prohibiciones transversales de
[`SPABLA_V2_CODE_STANDARD.md §6`](../standards/SPABLA_V2_CODE_STANDARD.md#6-prohibiciones-transversales)
(proveedores IA, APIs del navegador incluyendo `AudioContext`,
`HTMLAudioElement`, `AudioBuffer`, `decodeAudioData`, WebRTC, MediaStream,
navigator, document, window, fetch; React; Supabase real; tocar V1;
feature flags acumulativos).

DELTA específico de Fase 5:

- **Proveedores concretos prohibidos**: ElevenLabs, OpenAI TTS,
  Cartesia, Google WaveNet / TTS, Azure Neural, Amazon Polly. Ni
  imports, ni strings literales, ni comentarios.
- **No audio real**: los tests usan `Uint8Array` con bytes arbitrarios,
  no muestras reales.
- **No pause/resume, volumen, cache, offline, dispositivo de salida.**
- **No modificar arquitectura fuera del módulo `tts/`** salvo el
  aditivo mínimo de wiring (Engine + SpablaCore + eventos + tests).

---

## 14. Criterio de fase estable — DELTA

Aplican los ocho criterios universales de
[`SPABLA_V2_RELEASE_STANDARD.md §2`](../standards/SPABLA_V2_RELEASE_STANDARD.md#2-criterios-universales)
sin excepción. DELTA específico de Fase 5:

- **Suite mínima**: ≥ 446 tests verdes (386 previos + ≥ 60 nuevos).
- **Módulo de dominio**: `engine/src/tts/` con cobertura ≥ 95 % en las
  cuatro métricas (objetivo real 100 %, patrón `translation/`).
- **Base tag**: `spabla-v2-phase-4-translation-2026-07-06` @ `43dd49e`.
- **Grep específico** (reforzando el universal): `grep -r
  "elevenlabs\|openai\|cartesia\|@google\|azure\|amazon-polly"
  engine/src/tts/` = 0.
- **Contract check del AdapterRegistry**: test que asegura que registrar
  un `TTSAdapter` sin `synthesize()` es rechazado (paralelo al test
  Fase 4.1 para `translate()`).
- **Orden de chunks**: test con ≥ 20 chunks verifica orden monotónico
  estricto en `tts.chunk.generated`.
- **Encapsulación específica**: `SpablaCore` no expone `TTSManager`.
- **Tag propuesto al cierre**: `spabla-v2-phase-5-tts-<YYYY-MM-DD>`.

Sólo con los ocho universales + este DELTA se crea el tag protegido.
Cualquier fallo se documenta como candidato, no como stable, y se itera
antes de tag.

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
