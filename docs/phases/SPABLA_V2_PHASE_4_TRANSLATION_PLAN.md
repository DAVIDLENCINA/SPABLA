# SPABLA V2 — Fase 4: Translation Module (plan previo)

Documento de planificación. Cierra el alcance de Fase 4 antes de escribir
código. Base: tag `spabla-v2-phase-3-stt-2026-07-06` @ `19a4094`.

Este documento **NO autoriza** implementación. La implementación se
abrirá en la rama `spabla-v2/fase-4-translation` desde el tag base, con
commit único al cierre.

Fuentes normativas transversales (no se re-imprimen aquí):

- Reglas de código y prohibiciones transversales:
  [`../standards/SPABLA_V2_CODE_STANDARD.md`](../standards/SPABLA_V2_CODE_STANDARD.md).
- Criterios universales de "estable":
  [`../standards/SPABLA_V2_RELEASE_STANDARD.md`](../standards/SPABLA_V2_RELEASE_STANDARD.md).
- Estándar documental:
  [`../SPABLA_V2_DOCUMENTATION_STANDARD.md`](../SPABLA_V2_DOCUMENTATION_STANDARD.md).

---

## 1. Objetivo del módulo

Construir el módulo de **Traducción** del Engine. Convertir texto desde
su idioma de origen al idioma del receptor respetando la `LanguagePair`
de la conversación, aislado del proveedor real de IA. Modelo puro con
contratos, máquinas de estado y eventos; el trabajo de traducción
efectivo lo delega en un `TranslationAdapter` registrado vía el
`AdapterRegistry` de Fase 1.5.

Al cierre de Fase 4, un consumidor de `SpablaCore` puede:

- Abrir una sesión de traducción vinculada a una `CallSession` activa
  con una `LanguagePair` explícita.
- Enviar textos y recibir sus traducciones vía eventos
  (`translation.completed` o `translation.failed`).
- Registrar un adaptador de traducción (fake en tests; cualquier
  proveedor en producción — intercambiables).
- Manejar errores del proveedor sin acoplarse a él.

---

## 2. Responsabilidad exacta

`TranslationManager` es el **único** módulo que recibe
`TranslationRequest`, aplica las dos máquinas de estado (session +
request), invoca al adaptador vía `AdapterRegistry.get("mt")`, emite
eventos `translation.*` y gestiona el catálogo interno de sesiones y
requests.

`TranslationManager` **no**: importa proveedores concretos (regla
transversal del [Code Standard §6.2](../standards/SPABLA_V2_CODE_STANDARD.md#62-proveedores-de-ia));
contiene prompts, endpoints, credenciales; elige qué proveedor usar
(recupera el adaptador del registry sin discriminarlo); persiste
requests (Fase 7); aplica retry / rate limiting (fuera de scope V2).

`SpablaCore` **no traduce directamente**. Toda traducción pasa por el
manager.

---

## 3. Qué NO hará todavía

- **No implementará adaptadores reales** (OpenAI, Gemini, DeepL, Claude,
  etc.). El interface se define; las implementaciones concretas llegan
  en fases posteriores o como paquetes externos.
- **No hará streaming** de traducción parcial — solo request/response
  completo.
- **No aplicará memoria/contexto entre traducciones.** Cada request es
  independiente.
- **No detectará el idioma de origen automáticamente.** El caller
  siempre provee `sourceLanguage`.
- **No orquestará STT → Translation → TTS.** Fase 4 provee el
  primitivo; la orquestación es Fase 5+.
- **No hará traducción desde SpablaCore.** Regla dura, testeada.
- **No conocerá el transporte** del adaptador (fetch, gRPC, WebSocket).

Las prohibiciones transversales (proveedores IA, APIs del navegador,
React, Supabase real, tocar V1, feature flags) vienen dadas por
[`SPABLA_V2_CODE_STANDARD.md §6`](../standards/SPABLA_V2_CODE_STANDARD.md#6-prohibiciones-transversales).

---

## 4. Contratos

Cuatro tipos `Readonly`. Todos los snapshots devueltos por el manager
son frozen.

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

`idle` (transitorio interno) → `active` (aceptando requests) →
`completed` (terminal, tras `stop()`) | `failed` (terminal, fallo
crítico).

Transiciones: `idle → active` (interno tras `createSession`); `idle →
failed` (raro; presente por completitud); `active → completed`
(comando `stop`); `active → failed` (fallo crítico persistente).

Terminales: `completed`, `failed`. `idle` no se emite externamente.

### 5.2 `TranslationRequestState`

`created` (registrado, no despachado) → `dispatched`
(adapter.translate in-flight) → `completed` (terminal, adapter resolvió)
| `failed` (terminal, adapter rechazó o precondición falló).

Transiciones: `created → dispatched` (invocación del adapter);
`created → failed` (no hay adapter O sesión terminal);
`dispatched → completed` (Promise resolvió);
`dispatched → failed` (Promise rechazó).

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

Todos accesibles vía `SpablaCore.subscribe(name, handler)`. El bus sigue
síncrono; la resolución del adapter es async pero los emits se hacen
sincronizadamente cuando la Promise se establece.

---

## 7. API pública de `SpablaCore`

### 7.1 Comandos

**`startTranslation({ callId, languagePair? }): { sessionId }`** —
precondiciones: conversation cargada; `CallSession(callId)` en
`accepted`; `languagePair.from !== languagePair.to` (el `LanguagePair`
ya garantiza). Efecto: crea `TranslationSession` `idle → active`, emite
`translation.session.started`, devuelve `{ sessionId }`. Si
`languagePair` se omite se usa `call.languagePair` (default).

**`stopTranslation({ sessionId }): void`** — precondición: sesión
existe, no está en terminal. Efecto: transiciona `active → completed`,
emite `translation.session.ended`. Los requests in-flight no se cancelan
automáticamente (llegarán como `translation.failed(code:
"session-terminal")` al resolver el adapter).

**`requestTranslation({ sessionId, text, sourceLanguage, sourceTurnId? }): { requestId }`** —
precondiciones: sesión existe y no está en terminal, texto no vacío.
Efecto: crea request en `created`, emite `translation.request.created`,
invoca `adapter.translate(...)` de forma async, emite
`translation.request.dispatched`. Al resolver: `dispatched → completed`,
emite `translation.completed`. Al rechazar (async o síncronamente):
`dispatched → failed`, emite `translation.failed(code:
"provider-rejected")`. Devuelve `{ requestId }` sincronizadamente.

### 7.2 Snapshots read-only

- `getTranslationSession(sessionId): TranslationSession | undefined`
- `getTranslationRequest(requestId): TranslationRequest | undefined`
- `listActiveTranslationSessions(callId): ReadonlyArray<TranslationSession>`

### 7.3 Regla dura

**Nunca traducir directamente desde SpablaCore.** No existen métodos que
llamen `fetch` a un proveedor. Todo pasa por `TranslationManager` →
`TranslationAdapter`.

---

## 8. Integración con STT (documentada, no implementada)

Fase 4 provee el primitivo; la orquestación STT → Translation llega en
Fase 5+.

Flujo previsto: `stt.final { session, turn, final: { text, language,
turnId } }` → un orquestador escucha el evento e invoca
`requestTranslation({ sessionId: <mt-session>, text: sttFinal.text,
sourceLanguage: sttFinal.language, sourceTurnId: sttFinal.turnId })`.

**Test manual en Fase 4** (§11.2 Encapsulación): crear STT +
`simulateSTTFinal` + `requestTranslation({ sourceTurnId:
sttFinal.turnId, ... })` → verificar que `translation.completed` llega y
`sourceTurnId` está preservado en el snapshot del request.

---

## 9. Integración futura con TTS (documentada, no implementada)

`translation.completed.result` carga TODA la información que TTS
necesita: texto traducido + idioma. `TranslationResult.requestId`
permite a TTS correlacionar con el request original. Fase 4 no crea TTS
ni importa ningún adapter TTS.

---

## 10. Adapter `TranslationAdapter`

Extiende el marker `MTAdapter` de Fase 1.5 (Fase 4.1 lo eleva a
contrato completo obligatorio; ver también
[Code Standard §5](../standards/SPABLA_V2_CODE_STANDARD.md#5-adapter-isolation)):

```typescript
interface TranslationAdapter extends AdapterBase<"mt"> {
  readonly displayName: string;
  translate(request: TranslationAdapterRequest): Promise<TranslationAdapterResponse>;
}

type TranslationAdapterRequest = Readonly<{
  requestId: UUID; text: string; from: LangCode; to: LangCode;
}>;

type TranslationAdapterResponse = Readonly<{
  translatedText: string;
  detectedSourceLanguage?: LangCode;
}>;
```

### 10.1 Registro y sustitución

Vía `SpablaCore.getAdapterRegistry().register("mt", provider)` (o
inyección al construir el Engine). Sin registro,
`requestTranslation` produce `translation.failed(code: "no-adapter")`.
El registro exige `translate()` en runtime (Fase 4.1).

### 10.2 `FakeTranslationAdapter` para tests

Definido inline en `TranslationManager.test.ts` y `SpablaCore.test.ts`.
Implementa la interfaz con respuestas configurables: prefijo, delay,
error injection, sync-throw injection.

### 10.3 Requisitos del adaptador

- Resolver o rechazar la Promise en tiempo finito.
- Emitir el resultado en el idioma solicitado (`to`).
- No conocer el bus de eventos.
- No persistir estado que el manager necesite.

Contratos NO delegados: persistencia (Fase 7), retry, rate limiting,
timeout enforcement (posible mejora futura vía `AbortSignal`).

### 10.4 Prohibición de acoplamiento

Reforzada por el grep del [Code Standard §11.1](../standards/SPABLA_V2_CODE_STANDARD.md#11-verificación-por-grep-templates)
aplicado sobre `engine/src/translation/`: debe devolver 0 líneas.

---

## 11. Tests previstos

**Total ≈ 55 tests nuevos.** Suite total tras Fase 4: **377 tests** (322
+ 55).

### 11.1 `TranslationManager.test.ts` (25 tests)

- **createSession + stopSession (5)**: crea con `LanguagePair` válida + `idle → active` + emite `session.started`; rechaza duplicate sessionId; guarda `callSessionId` y `languagePair` verbatim; `stop` en `active` → `completed` + emite `session.ended`; `stop` en terminal rechazado.
- **requestTranslation happy path (6)**: request en `created`; `created → dispatched` + invoca `adapter.translate`; adapter resuelve → `completed` + guarda `result`; orden `request.created → request.dispatched → completed`; `completedCount` incrementa; `requestId` matches snapshot.
- **requestTranslation con adapter (3)**: request devuelve `requestId` sync antes de resolver; traducción llega vía `translation.completed`; `providerDisplayName` preservado en `result`.
- **Errores (7)**: sin adapter → `code: "no-adapter"`; sesión terminal → `code: "session-terminal"`; sesión inexistente → error tipado; adapter rechaza async → `code: "provider-rejected"`; adapter tarda + stopSession → request eventualmente `failed`; `failedCount` incrementa; error carga `requestId` + `message`.
- **Queries + immutability (4)**: `getSession` y `getRequest` devuelven snapshots frozen; `listActive` filtra por `callId` y no-terminal; mutations devuelven nuevas referencias.

### 11.2 `SpablaCore.test.ts` — nuevos describes (30 tests)

- **startTranslation (5)**: devuelve `sessionId` + snapshot `active`; rechaza sin conversation; rechaza si CallSession no existe o no `accepted`; rechaza si `LanguagePair` inválida; emite `session.started`.
- **stopTranslation (4)**: `active → completed` + `session.ended`; rechaza sessionId desconocido; rechaza terminal; múltiples sesiones independientes.
- **requestTranslation (7)**: happy path con Fake → `translation.completed`; sin adapter → `translation.failed`; rechaza sessionId desconocido; rechaza terminal; guarda `sourceTurnId`; transporta `sourceLanguage` y `targetLanguage`; múltiples requests no interfieren.
- **Adapter (4)**: registrado vía `getAdapterRegistry().register("mt", fake)`; reemplazable en runtime; adapter no expuesto por SpablaCore; error de adapter NO rompe la sesión.
- **Eventos (5)**: subscribe recibe los 6 eventos; `meta.ts` y `meta.correlationId` presentes; unsubscribe corta la entrega; comparten bus con Engine + STT + Messaging; ordering `request.created → request.dispatched → completed`.
- **Encapsulación + STT-manual (5)**: SpablaCore no expone `TranslationManager`; `endCall` NO auto-detiene translation; integración manual STT + Translation preserva `sourceTurnId` extremo a extremo; 322 tests de Fase 3 verdes sin modificación; los 3 comandos + 3 snapshots están en el prototype.

---

## 12. Prohibiciones específicas de Fase 4

Aplican todas las prohibiciones transversales de
[`SPABLA_V2_CODE_STANDARD.md §6`](../standards/SPABLA_V2_CODE_STANDARD.md#6-prohibiciones-transversales).
DELTA específico:

- **Proveedores concretos prohibidos**: OpenAI, Gemini, DeepL, Claude,
  Anthropic, `@google`. Ni imports, ni strings literales, ni
  comentarios.
- **No STT real / TTS / WebRTC / UI / React / Supabase real** en este
  scope.
- **No modificar arquitectura fuera del módulo `translation/`.**

---

## 13. Criterio de fase estable — DELTA

Aplican los ocho criterios universales de
[`SPABLA_V2_RELEASE_STANDARD.md §2`](../standards/SPABLA_V2_RELEASE_STANDARD.md#2-criterios-universales)
sin excepción. DELTA específico de Fase 4:

- **Suite mínima**: 377 tests verdes (322 previos + 55 nuevos).
- **Módulo de dominio**: `engine/src/translation/` con cobertura ≥ 95 %
  en las cuatro métricas.
- **Base tag**: `spabla-v2-phase-3-stt-2026-07-06` @ `19a4094`.
- **Grep específico** (reforzando el universal): `grep -r
  "openai\|gemini\|deepl\|claude\|anthropic\|@google"
  engine/src/translation/` = 0 líneas.
- **Encapsulación específica**: `SpablaCore` no expone
  `TranslationManager`.
- **Tag propuesto al cierre**: `spabla-v2-phase-4-translation-<YYYY-MM-DD>`.

Sólo con los ocho universales + este DELTA se crea el tag protegido.
Cualquier fallo se documenta como candidato, no como stable, y se itera
antes de tag.

---

## Entregable de este documento (no incluye código)

Este archivo es el único entregable de esta pre-fase. La siguiente
autorización del jefe de proyecto abrirá:

- Rama nueva `spabla-v2/fase-4-translation` desde el tag
  `spabla-v2-phase-3-stt-2026-07-06`.
- Implementación de los archivos derivados del §11 y §7.
- Ejecución de los tests listados en §11.
- Commit único al cierre con mensaje `feat(engine): fase 4 —
  translation module`.

Sin autorización explícita no se toca código.
