# SPABLA V2 — Code Standard

Estándar normativo transversal para el código del Engine SPABLA V2. Rige
desde el commit en que se aprueba. Aplica a cualquier archivo dentro de
`engine/src/` y a cualquier fase futura.

Documento hermano: [`SPABLA_V2_RELEASE_STANDARD.md`](SPABLA_V2_RELEASE_STANDARD.md).
Estándar documental que gobierna este archivo:
[`../SPABLA_V2_DOCUMENTATION_STANDARD.md`](../SPABLA_V2_DOCUMENTATION_STANDARD.md).

---

## 1. Filosofía

El Engine es un modelo puro con eventos, estados y contratos. Todo lo que
huele a mundo exterior — HTTP, sockets, navegador, hardware, IA — vive
detrás de un adaptador. El Engine invoca adaptadores; no los conoce.

Consecuencias directas:

- No hay imports de proveedores concretos dentro del Engine.
- No hay uso de APIs del navegador dentro del Engine.
- No hay React, ni JSX, ni DOM.
- El único canal para hablar con el exterior son los `AdapterBase<K>` del
  `AdapterRegistry`.

---

## 2. Configuración de TypeScript

`engine/tsconfig.json` mantiene siempre estos flags activos. Cualquier
plan de fase que los desactive requiere ADR previa (§12 del estándar
documental).

- `strict: true`.
- `noUncheckedIndexedAccess: true`.
- `exactOptionalPropertyTypes: true`.
- `noImplicitAny: true`.
- `noImplicitReturns: true`.
- `noUnusedLocals: true` en producción.

`npm --prefix engine run typecheck` sin errores es criterio bloqueante en
cada fase (ver `SPABLA_V2_RELEASE_STANDARD.md`).

---

## 3. Tamaño de archivo

- **Cap objetivo**: 300 líneas por archivo `.ts` (no `.test.ts`).
- **Cap absoluto**: 400 líneas. Cualquier archivo que llegue a 400
  bloquea el merge.
- **Extracción obligatoria antes del cap**: si un módulo se acerca a 300
  se aplica el patrón establecido en Fase 3 (`stt-ops.ts`) y Fase 4
  (`translation-ops.ts`): companion class que absorbe la orquestación de
  comandos y deja al archivo principal como fachada.
- Los archivos de test (`*.test.ts`) no tienen cap dura, pero se prefiere
  mantenerlos bajo 500 por legibilidad.

---

## 4. Encapsulación de `SpablaCore`

- `SpablaCore` es la única superficie pública. Consumidores externos no
  ven `Engine`, ni ningún `Manager`, ni el `EventBus` interno.
- `Object.getOwnPropertyNames(SpablaCore.prototype)` no contiene
  `getEngine`, `getBus`, ni ningún `get<X>Manager`.
- Los `Manager` accesibles vía `Engine.get<X>Manager()` son puntos de
  extensión para tests y SDKs internos, nunca para consumidores UI.
- El `EventBus` se toca solo vía `SpablaCore.subscribe(name, handler)`.

---

## 5. Adapter isolation

- El Engine define interfaces `AdapterBase<K>` en `engine/src/types/adapters.ts`.
  Las implementaciones concretas viven fuera del Engine (paquete
  consumidor o subpaquete `adapters/`).
- El Engine nunca importa `openai`, `@google/*`, `elevenlabs`, `cartesia`,
  `deepgram`, `anthropic`, ni SDKs equivalentes.
- El Engine nunca contiene prompts, endpoints, credenciales, ni voice
  IDs literales.
- El Engine nunca ejecuta `fetch`, `WebSocket`, `RTCPeerConnection` ni
  `navigator.*` desde su propio código.
- El `AdapterRegistry` refuerza cada `AdapterByKind[K]` en tipo. Fase 4.1
  elevó `MTAdapter` para exigir `translate()` en `register()`; el mismo
  patrón se aplicará a cada fase que introduzca un nuevo adaptador
  funcional.

---

## 6. Prohibiciones transversales

Aplican a **todo** archivo dentro de `engine/src/`. Cada plan de fase
puede añadir prohibiciones específicas de módulo pero no relajarlas.

### 6.1 APIs del navegador

Ninguna de estas identificaciones puede aparecer en `engine/src/`:

- `AudioContext`, `AudioBuffer`, `decodeAudioData`, `AudioWorklet`,
  `ScriptProcessorNode`.
- `HTMLAudioElement`, `new Audio(`, `<audio>`.
- `MediaStream`, `MediaStreamTrack`, `getUserMedia`, `mediaDevices`.
- `RTCPeerConnection`, `RTCDataChannel`, `RTCIceCandidate`.
- `document`, `window.`, `navigator`, `location`.
- `WebSocket`, `EventSource`.
- `fetch(` (el Engine no habla directamente con la red).

Verificación:
```
grep -rEi "AudioContext|HTMLAudioElement|AudioBuffer|decodeAudioData|RTCPeerConnection|MediaStream|getUserMedia|mediaDevices|navigator|document|window\.|\bfetch\(" engine/src/
```
Debe devolver 0 líneas.

### 6.2 Proveedores de IA

Ninguna referencia a proveedores concretos, sea import, string literal,
o comentario:

- `openai`, `gemini`, `deepl`, `claude`, `anthropic`, `@google`,
  `azure`, `cartesia`, `elevenlabs`, `deepgram`, `amazon-polly`,
  `whisper` como nombre de librería.

Verificación:
```
grep -rEi "openai|gemini|deepl|claude|anthropic|@google|azure|cartesia|elevenlabs|deepgram|amazon-polly" engine/src/
```
Debe devolver 0 líneas.

Excepción autorizada: strings de test que documenten un nombre de
proveedor de forma neutra (`"provider-x"`) — nunca la lista prohibida
anterior. Los tests están sujetos a la misma regla.

### 6.3 Otras prohibiciones duras

- No React ni JSX en `engine/src/`. `react` no aparece en `engine/package.json`.
- No dependencia funcional con Supabase real (los adaptadores viven fuera).
- No modificar V1 (`app/`, `server/`). `git diff <tag-V1-estable> HEAD -- app/ server/` = 0.
- No feature flags acumulativos: un adaptador de un `kind` cada vez.
- No `Result<T, E>` tipado — el Engine usa `throw` para invariantes y
  eventos `translation.failed`/`stt.failed` para fallos operacionales
  (decisión de Fase 1.5, congelada).
- No `useRef` para compartir estado entre módulos (regla que aplica al
  paquete consumidor futuro, no al Engine puro).

---

## 7. Bus síncrono

- El `EventBus` es síncrono. `bus.emit(evt)` entrega a subscribers en el
  mismo tick. Decisión de Fase 1.5 congelada; cualquier cambio requiere
  ADR.
- Los adaptadores devuelven Promises; el manager conecta `then/catch`
  con `EventBus.emit` para publicar el resultado como evento síncrono.
- Nunca se envuelve el bus en `queueMicrotask` ni `setTimeout` desde el
  Engine.

---

## 8. Correlación e IDs

- Todo evento emitido lleva `meta: { ts, correlationId }`. La
  `correlationId` enlaza cadenas causales (comando → transición →
  eventos derivados) y se genera en el comando de entrada.
- Los IDs de entidad (`UUID`, `ISOTimestamp`, `CorrelationId`) son
  branded strings sin coste en runtime. Constructores en
  `engine/src/types/ids.ts`.
- Ningún módulo genera su propio timestamp con `new Date()` directo — se
  usa `Clock.nowISO()` inyectado, para permitir tests deterministas.

---

## 9. Snapshots inmutables

- Todo snapshot devuelto por un `Manager` es `Object.freeze`. Nunca se
  devuelve una referencia mutable a estado interno.
- Las mutaciones producen nuevas referencias frozen. Un test que muta un
  snapshot lanza `TypeError`.
- `ReadonlyArray<T>` y `Readonly<{...}>` en todas las firmas públicas.

---

## 10. Testing

- Framework: Vitest con `@vitest/coverage-v8`.
- Cobertura mínima global: statements/branches/functions/lines ≥ 85%.
- Cobertura mínima por módulo de dominio (`stt/`, `translation/`, `tts/`,
  `messaging/`, `pipeline/`, `event-bus/`, `state-machine/`,
  `adapter-registry/`): ≥ 95% en las cuatro métricas. Objetivo real:
  100%.
- Un test por invariante declarada en el plan de fase (ver
  `SPABLA_V2_RELEASE_STANDARD.md`).
- Los tests no importan proveedores reales — inyectan `Fake<X>Adapter`
  in-line con firma completa.

---

## 11. Verificación por grep templates

Cada fase debe pasar como mínimo estos greps antes de crear tag:

```
# 1. Sin cuerpos de proveedores IA en Engine.
grep -rEi "openai|gemini|deepl|claude|anthropic|@google|azure|cartesia|elevenlabs|deepgram|amazon-polly" engine/src/

# 2. Sin APIs del navegador en Engine.
grep -rEi "AudioContext|HTMLAudioElement|AudioBuffer|RTCPeerConnection|MediaStream|getUserMedia|mediaDevices|navigator|document|window\.|\bfetch\(|new Audio\(" engine/src/

# 3. V1 byte-idéntico frente al tag estable V1.
git diff spabla-stable-ot-071-targetlang-translation-2026-07-04 HEAD -- app/ server/ | wc -l   # debe ser 0

# 4. Ningún archivo del Engine excede 300 líneas (no test).
find engine/src -name '*.ts' -not -name '*.test.ts' -exec wc -l {} \; | awk '$1 > 300 { print }'  # vacío
```

Todos los greps deben devolver 0 líneas / vacío. Cualquier hallazgo
bloquea el tag.

---

## 12. Excepciones autorizadas

Solo dos excepciones documentadas:

- Los archivos de test pueden contener strings con nombres de proveedor
  únicamente si NO están en la lista prohibida (§6.2). El grep §11.1
  se aplica sobre todo el árbol y no distingue test de producción.
- Las prohibiciones específicas de cada fase (p. ej. Fase 3 añade "no
  Deepgram real") las declara cada plan de fase — este estándar solo
  cubre las transversales.

Cualquier otra excepción se documenta en `docs/decisions/ADR-XXX-*.md`
antes de commitear.

---

## Aplicación

Este estándar entra en vigor desde su commit. Los planes de fase futuros
lo referencian con:

> "Aplican las prohibiciones y verificaciones de
> [`SPABLA_V2_CODE_STANDARD.md`](../standards/SPABLA_V2_CODE_STANDARD.md)."

y añaden únicamente el DELTA específico de su módulo.
