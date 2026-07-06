# SPABLA V2 — Fase 4: Translation Module (plan previo)

Documento de planificación. Cierra el alcance de Fase 4 antes de escribir código.
Base: tag `spabla-v2-phase-3-stt-2026-07-06` @ `19a4094`.

Este documento **NO autoriza** implementación. La implementación se abrirá en la
rama `spabla-v2/fase-4-translation` desde el tag base, con commit único al
cierre.

---

## 1. Objetivo del módulo

Construir el módulo de **Traducción** del Engine. Convertir texto desde su
idioma de origen al idioma del receptor respetando la `LanguagePair` de la
conversación, aislado del proveedor real de IA. Modelo puro con contratos,
máquinas de estado y eventos; el trabajo de traducción efectivo lo delega en
un `TranslationAdapter` registrado vía el `AdapterRegistry` de Fase 1.5.

Al cierre de Fase 4, un consumidor de `SpablaCore` puede:
- Abrir una sesión de traducción vinculada a una `CallSession` activa con una
  `LanguagePair` explícita.
- Enviar textos y recibir sus traducciones vía eventos (`translation.completed`
  o `translation.failed`).
- Registrar un adaptador de traducción (fake en tests; OpenAI / DeepL /
  Gemini / Claude en producción — cualquiera, todos intercambiables).
- Manejar errores del proveedor sin acoplarse a él.

---

## 2. Responsabilidad exacta

`TranslationManager` es el **único** módulo que:
- Recibe `TranslationRequest`.
- Aplica las dos máquinas de estado (session + request).
- Invoca al adaptador vía `AdapterRegistry.get("mt")`.
- Emite eventos `translation.*`.
- Gestiona el catálogo interno de sesiones y requests.

`TranslationManager` **no**:
- Importa `openai`, `@google/gemini`, `deepl-node`, `@anthropic-ai/sdk` o
  cualquier proveedor.
- Contiene prompts, endpoints, credenciales.
- Elige qué proveedor usar — recupera el adaptador del registry sin
  discriminarlo.
- Persiste requests (Fase 7).
- Aplica retry / rate limiting (fuera de scope V2).

`SpablaCore` **no traduce directamente**. Toda traducción pasa por el manager.

---

## 3. Qué NO hará todavía

- **No implementará adaptadores reales** (OpenAI, Gemini, DeepL, Claude,
  etc.). El interface se define; las implementaciones concretas llegan en
  fases posteriores o como paquetes externos.
- **No hará streaming de traducción parcial** — sólo request/response
  completo. Streaming (útil para traducción de una intervención larga en
  Realtime) es Fase futura.
- **No aplicará memoria/contexto entre traducciones.** Cada request es
  independiente. El adaptador puede internamente mantener context si lo
  desea; el Engine no lo garantiza ni lo requiere.
- **No detectará el idioma de origen automáticamente.** El caller siempre
  provee `sourceLanguage`.
- **No orquestará STT → Translation → TTS.** Fase 4 provee el primitivo;
  la orquestación es Fase 5+.
- **No hará traducción desde SpablaCore.** Regla dura, testeada.
- **No conocerá el transporte** del adaptador (fetch, gRPC, WebSocket).

---

## 4. Contratos

Cuatro tipos `Readonly`. Todos los snapshots devueltos por el manager son
frozen.

### 4.1 `TranslationSession`

```
type TranslationSession = Readonly<{
  id: UUID;
  callSessionId: UUID;
  languagePair: LanguagePair;              // dirección explícita (from, to)
  state: TranslationSessionState;
  createdAt: ISOTimestamp;
  startedAt: ISOTimestamp | undefined;
  endedAt: ISOTimestamp | undefined;
  failedAt: ISOTimestamp | undefined;
  failureReason: string | undefined;
  requestCount: number;
  completedCount: number;
  failedCount: number;
}>;
```

### 4.2 `TranslationRequest`

```
type TranslationRequest = Readonly<{
  id: UUID;
  sessionId: UUID;
  callSessionId: UUID;
  sourceText: string;
  sourceLanguage: LangCode;                // idioma declarado del sourceText
  targetLanguage: LangCode;                // === session.languagePair.to
  sourceTurnId: UUID | undefined;          // link opcional al STT turn
  state: TranslationRequestState;
  createdAt: ISOTimestamp;
  dispatchedAt: ISOTimestamp | undefined;
  completedAt: ISOTimestamp | undefined;
  failedAt: ISOTimestamp | undefined;
  result: TranslationResult | undefined;
  error: TranslationError | undefined;
}>;
```

### 4.3 `TranslationResult`

```
type TranslationResult = Readonly<{
  requestId: UUID;
  translatedText: string;
  targetLanguage: LangCode;
  detectedSourceLanguage: LangCode | undefined;   // si el adapter lo devuelve
  providerDisplayName: string;                     // introspection sólo
  receivedAt: ISOTimestamp;
}>;
```

### 4.4 `TranslationError`

```
type TranslationError = Readonly<{
  requestId: UUID;
  code: string;      // "no-adapter" | "provider-rejected" | "session-terminal" | ...
  message: string;
  receivedAt: ISOTimestamp;
}>;
```

---

## 5. Máquinas de estado

### 5.1 `TranslationSessionState`

```
type TranslationSessionState =
  | "idle"          // transitorio interno tras createSession
  | "active"        // aceptando requests
  | "completed"     // stop() ejecutado (terminal)
  | "failed";       // fallo crítico (terminal, poco común)
```

Transiciones autorizadas:

| Desde | A | Trigger |
|---|---|---|
| `idle` | `active` | interno tras `createSession` — antes de emitir `translation.session.started` |
| `idle` | `failed` | raro; presente por completitud (arranque inválido) |
| `active` | `completed` | comando `stop` |
| `active` | `failed` | fallo crítico persistente del adaptador |

Terminales: `completed`, `failed`. Como en STT, `idle` no se emite externamente
— el consumidor observa la sesión ya en `active`.

### 5.2 `TranslationRequestState`

```
type TranslationRequestState =
  | "created"       // request registrado, aún no despachado
  | "dispatched"    // llamada al adaptador in-flight
  | "completed"     // adapter resolvió con resultado (terminal)
  | "failed";       // adapter rechazó O precondición falló (terminal)
```

Transiciones autorizadas:

| Desde | A | Trigger |
|---|---|---|
| `created` | `dispatched` | Manager invoca `adapter.translate(...)` |
| `created` | `failed` | no hay adapter registrado O sesión terminal |
| `dispatched` | `completed` | Promise del adapter resolvió |
| `dispatched` | `failed` | Promise del adapter rechazó |

Terminales: `completed`, `failed`.

---

## 6. Eventos

Seis eventos nuevos añadidos a la unión `EngineEvent`. Todos con
`meta { ts, correlationId }`.

| Nombre | Payload |
|---|---|
| `translation.session.started` | `{ session: TranslationSession }` |
| `translation.request.created` | `{ session, request }` |
| `translation.request.dispatched` | `{ session, request }` |
| `translation.completed` | `{ session, request, result: TranslationResult }` |
| `translation.failed` | `{ session, request, error: TranslationError }` |
| `translation.session.ended` | `{ session }` |

Todos accesibles vía `SpablaCore.subscribe(name, handler)`. El bus sigue siendo
síncrono; la resolución del adapter es async pero los emits se hacen
sincronizadamente cuando la Promise se establece.

---

## 7. API pública de `SpablaCore`

### 7.1 Comandos

**`startTranslation(input): StartTranslationResult`**
- Firma: `startTranslation({ callId, languagePair }) → { sessionId }`
- Precondiciones:
  - Conversation cargada.
  - `CallSession(callId)` existe y está en estado `accepted`.
  - `languagePair.from !== languagePair.to` (el LanguagePair ya garantiza).
- Efecto: crea `TranslationSession` `idle → active`, emite
  `translation.session.started`, devuelve `{ sessionId }`.

**`stopTranslation(input): void`**
- Firma: `stopTranslation({ sessionId })`
- Precondiciones: sesión existe, no está en terminal.
- Efecto: transiciona `active → completed`, emite `translation.session.ended`.
  Los requests in-flight no se cancelan automáticamente (llegarán como
  `translation.failed(code: "session-terminal")` al resolver el adapter).

**`requestTranslation(input): RequestTranslationResult`**
- Firma:
  ```
  requestTranslation({
    sessionId, text, sourceLanguage, sourceTurnId?
  }) → { requestId }
  ```
- Precondiciones: sesión existe y no está en terminal, texto no vacío.
- Efecto: crea request en `created`, emite `translation.request.created`,
  invoca `adapter.translate(...)` de forma async, emite
  `translation.request.dispatched` sincronizadamente antes del `await`. Al
  resolver el adapter: transiciona `dispatched → completed`, emite
  `translation.completed`. Al rechazar: `dispatched → failed`, emite
  `translation.failed`.
- Devuelve `{ requestId }` sincronizadamente. La traducción real llega
  después vía eventos.

### 7.2 Snapshots read-only

- `getTranslationSession(sessionId): TranslationSession | undefined`
- `getTranslationRequest(requestId): TranslationRequest | undefined`
- `listActiveTranslationSessions(callId): ReadonlyArray<TranslationSession>`

### 7.3 Regla dura

**Nunca traducir directamente desde SpablaCore.** No existen métodos que
llamen `fetch` a un proveedor. Todo pasa por `TranslationManager` que pasa
por `TranslationAdapter`.

---

## 8. Integración con STT

La integración STT → Translation **no se implementa** en Fase 4. Se documenta
como target de Fase 5+ (orquestación).

### 8.1 Flujo previsto

```
stt.final { session, turn, final: { text, language, turnId } }
   │
   ▼
Orquestador (Fase 5+) escucha el evento y hace:
   requestTranslation({
     sessionId: <translation session id>,
     text: sttFinal.text,
     sourceLanguage: sttFinal.language,
     sourceTurnId: sttFinal.turnId,   // ← link back to STT
   })
```

### 8.2 Test manual en Fase 4

Un test específico verifica el path completo **manualmente** (sin
orquestador automático):

1. `startSTT` + `startTranslation`.
2. `simulateSTTPartial` + `simulateSTTFinal`.
3. Al recibir `stt.final`, el test invoca `requestTranslation` con el
   `sourceTurnId` recibido.
4. Verifica que `translation.completed` llega con el requestId correcto y
   con `sourceTurnId` preservado en el `request` snapshot.

Esto valida que los contratos son componibles. La automatización real llega
en Fase 5.

---

## 9. Integración futura con TTS

Documentada, no implementada.

### 9.1 Flujo previsto

```
translation.completed { session, request, result: { translatedText, targetLanguage } }
   │
   ▼
Orquestador (Fase 5+) escucha el evento y hace:
   startTTS({
     text: result.translatedText,
     language: result.targetLanguage,
     sourceRequestId: request.id,    // ← link back to translation
   })
```

### 9.2 Contrato garantizado en Fase 4

- `translation.completed.result` carga TODA la información que TTS necesita:
  texto traducido + idioma. Ningún dato extra requerido.
- El `TranslationResult.requestId` permite a TTS correlacionar con el
  request original.

Fase 4 no crea TTS, no importa ningún adapter TTS, no emite eventos TTS.

---

## 10. Adapter `TranslationProvider`

### 10.1 Contrato

Extiende el marker `MTAdapter` de Fase 1.5:

```typescript
interface TranslationAdapter extends AdapterBase<"mt"> {
  readonly displayName: string;
  translate(request: TranslationAdapterRequest): Promise<TranslationAdapterResponse>;
}

type TranslationAdapterRequest = Readonly<{
  requestId: UUID;
  text: string;
  from: LangCode;
  to: LangCode;
}>;

type TranslationAdapterResponse = Readonly<{
  translatedText: string;
  detectedSourceLanguage?: LangCode;
}>;
```

### 10.2 Registro

Vía `SpablaCore.getAdapterRegistry().register("mt", provider)`. Sin registro,
`requestTranslation` produce `translation.failed(code: "no-adapter")`.

### 10.3 `FakeTranslationAdapter` para tests

Definido inline en el archivo de tests (`TranslationManager.test.ts` y
`SpablaCore.test.ts`). Implementa la interfaz con respuestas configurables:
prefijo, delay, error injection. Cero dependencias externas.

Ejemplo conceptual (no código para aplicar):
```
class FakeTranslationAdapter {
  readonly kind = "mt" as const;
  readonly displayName = "fake-translator";
  private respond: (req) => Response | Error;
  translate(req) { ...resolver o rechazar según respond(req)... }
}
```

### 10.4 Requisitos que `TranslationManager` impone al adaptador

- El adaptador **debe** resolver o rechazar la Promise en tiempo finito.
- El adaptador **debe** emitir el resultado en el idioma solicitado (`to`).
- El adaptador **no** conoce el bus de eventos; sólo devuelve texto.
- El adaptador **no** persiste estado que TranslationManager necesite.

### 10.5 Contratos NO delegados al adaptador

- Persistencia de requests (Fase 7).
- Retry policies (fuera de scope V2).
- Rate limiting (fuera de scope V2).
- Timeout enforcement (opcional en Fase 4; posible mejora futura vía
  `AbortSignal`).

### 10.6 Prohibición de acoplamiento

**Verificado por script en el criterio 8 de aceptación:**
```
grep -r "openai\|gemini\|deepl\|claude\|anthropic\|@google" engine/src/translation/
```
debe devolver **0 líneas**. TranslationManager no sabe siquiera qué es OpenAI.

---

## 11. Tests previstos

**Total ≈ 55 tests nuevos.** Suite total tras Fase 4: **377 tests** (322 + 55).

### 11.1 `TranslationManager.test.ts` (25 tests)

**createSession + stopSession (5)**
- crea con `LanguagePair` válida, transiciona `idle → active`, emite `translation.session.started`
- rechaza duplicate sessionId
- guarda `callSessionId` y `languagePair` verbatim
- `stop` en `active` → `completed`, emite `translation.session.ended`
- `stop` en terminal es rechazado

**requestTranslation happy path (6)**
- crea request en `created`
- transiciona `created → dispatched`, invoca `adapter.translate`
- al resolver el adapter: state → `completed`, guarda `result`
- emite eventos en orden: `request.created`, `request.dispatched`, `completed`
- `session.completedCount` incrementa
- `requestId` retornado matches el snapshot en `getRequest`

**requestTranslation con adapter (3)**
- request devuelve `requestId` sync (antes de resolver el adapter)
- traducción llega via `translation.completed` cuando el adapter resuelve
- `providerDisplayName` preservado en `result`

**Errores (7)**
- request sin adapter registrado → `translation.failed(code: "no-adapter")`
- request en sesión terminal → falla con `code: "session-terminal"`
- request en sesión inexistente → error tipado
- adapter rechaza → `translation.failed(code: "provider-rejected", message)`
- adapter tarda (Promise pendiente) + stopSession → request eventualmente `failed`
- `session.failedCount` incrementa al fallar
- error carga `requestId` y `message` correctos

**Queries + immutability (4)**
- `getSession` devuelve snapshot frozen
- `getRequest` devuelve snapshot frozen
- `listActive` filtra por `callId` + no-terminal
- mutations devuelven nuevas referencias

### 11.2 `SpablaCore.test.ts` — nuevos describes (30 tests)

**startTranslation (5)**
- devuelve `sessionId`, snapshot en `active`
- rechaza si no hay conversation cargada
- rechaza si `CallSession` no existe / no está en `accepted`
- rechaza si `LanguagePair` es inválida (constructor ya lo garantiza)
- emite `session.started`

**stopTranslation (4)**
- transiciona a `completed`, emite `session.ended`
- rechaza `sessionId` desconocido
- rechaza sesión ya terminal
- múltiples sesiones independientes

**requestTranslation (7)**
- happy path con `FakeTranslationAdapter` registrado → `translation.completed` llega
- sin adapter registrado → `translation.failed`
- rechaza `sessionId` desconocido
- rechaza sesión terminal
- guarda `sourceTurnId` cuando se pasa
- transporta `sourceLanguage` y `targetLanguage` correctamente
- múltiples requests en la misma sesión no interfieren

**Adapter (4)**
- adapter registrado vía `getAdapterRegistry().register("mt", fake)`
- `FakeTranslationAdapter` es reemplazable en runtime
- adapter no expuesto por métodos públicos de SpablaCore
- error de adapter NO rompe la sesión (queda `active` para otros requests)

**Eventos (5)**
- subscribe recibe los 6 eventos
- `meta.ts`, `meta.correlationId` presentes
- unsubscribe corta la entrega
- eventos fluyen por el mismo bus que Engine + STT + Messaging
- ordering: `request.created → request.dispatched → completed`

**Encapsulación + integración STT-manual (5)**
- SpablaCore no expone `TranslationManager` directamente
- `endCall` NO auto-detiene sesiones de translation (explícito, testeado)
- **Integración manual STT + Translation:** crear STT + `simulateSTTFinal` +
  `requestTranslation({ sourceTurnId: sttFinal.turnId, ... })` → verificar
  que `translation.completed` llega y el snapshot preserva `sourceTurnId`
- los 322 tests de Fase 3 siguen verdes sin modificación
- exposición pública: los 3 comandos + 3 snapshots están en el prototype

---

## 12. Criterios exactos para declarar estable la fase

Fase 4 se considera **estable** — y se crea tag protegido
`spabla-v2-phase-4-translation-2026-XX-XX` — sólo si **todos** los criterios
abajo se cumplen:

1. **Suite total ≥ 377 tests verdes.** `npm --prefix engine test` sin fallos.
2. **Cobertura ≥ 85%** en las cuatro métricas globales (statements, branches,
   functions, lines). Módulo `translation/` con **≥ 95% en las CUATRO**
   métricas individualmente.
3. **Typecheck limpio:** `npm --prefix engine run typecheck` sin errores. La
   configuración `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
   sigue activa.
4. **Cero regresiones:** los 322 tests de Fase 3 siguen verdes sin
   modificación.
5. **Ningún archivo de fuente > 300 líneas.** Absoluto 400. Si
   `SpablaCore.ts` o `Engine.ts` suben, se extrae al patrón
   `translation-ops.ts` como en Fase 3 (`stt-ops.ts`).
6. **Encapsulación intacta:** `SpablaCore` no expone `TranslationManager` ni
   el `bus`. Tests de encapsulación pasan sin modificación.
7. **V1 byte-idéntico** al tag
   `spabla-stable-ot-071-targetlang-translation-2026-07-04`. Verificado con
   `git diff <tag> HEAD -- app/ server/` = 0.
8. **Arquitectural — regla NO relajable:** `TranslationManager` no importa
   ningún proveedor concreto. Verificado con
   ```
   grep -r "openai\|gemini\|deepl\|claude\|anthropic\|@google" engine/src/translation/
   ```
   = 0 líneas. La única superficie hacia el mundo exterior es la interface
   `TranslationAdapter` recuperada del `AdapterRegistry`.

Sólo con los ocho se crea el tag protegido. Cualquier fallo se documenta como
candidato, no como stable, y se itera antes de tag.

---

## Entregable de este documento (no incluye código)

Este archivo es el único entregable de esta pre-fase. La siguiente
autorización del jefe de proyecto abrirá:
- Rama nueva `spabla-v2/fase-4-translation` desde el tag
  `spabla-v2-phase-3-stt-2026-07-06`.
- Implementación de los archivos derivados del §11 y §7.
- Ejecución de los tests listados en §11.
- Commit único al cierre con mensaje `feat(engine): fase 4 — translation module`.

Sin autorización explícita no se toca código.
