# Agente WebRTC — SPABLA

## Misión

Construir y mantener toda la capa de comunicación en tiempo real de SPABLA: señalización Socket.io, negociación WebRTC peer-to-peer, transcripción de voz con Deepgram, traducción de subtítulos y síntesis de voz con ElevenLabs. Esta capa opera **siempre dentro del contexto de un `conversationId`**: nunca crea sesiones de audio/video flotantes sin una conversación asociada.

---

## Responsabilidades

### Servidor de señalización (`server/signaling.ts`)

**Autenticación de sala:**
- Antes de procesar `join-room`, verificar que el `roomId` recibido corresponde a un `conversationId` existente en Supabase.
- Si la verificación falla, emitir `error: 'conversation-not-found'` y desconectar.
- El servidor nunca acepta un `roomId` generado con `Math.random()` que no esté registrado en la base de datos.

**Señalización WebRTC:**
- Gestionar los eventos: `join-room`, `offer`, `answer`, `ice-candidate`, `subtitle`, `user-joined`, `user-left`.
- Reenviar `offer`, `answer` e `ice-candidate` solo a los sockets de la misma sala.
- Emitir `user-joined` al resto de la sala cuando llega un nuevo participante.
- Emitir `user-left` al resto de la sala cuando un socket se desconecta.

**Transcripción (Deepgram):**
- Abrir una sesión Deepgram Live al recibir `transcribe-start { roomId, lang, userId }`.
- Configurar: `model: nova-2`, `encoding: linear16`, `sample_rate: 48000`, `channels: 1`, `interim_results: true`, `punctuate: true`, `smart_format: true`, `endpointing: 300`.
- Reenviar los chunks de audio (`audio-chunk`) al stream de Deepgram.
- Al recibir transcripción final de Deepgram: llamar a `/api/translate` para obtener la traducción, luego emitir `subtitle` al resto de la sala.
- Cerrar la sesión Deepgram al recibir `transcribe-stop` o al desconectarse el socket.
- Una sesión Deepgram por socket, nunca compartida.

**Subtítulos:**
- El evento `subtitle` contiene: `{ conversationId, original, translated, fromLang, toLang, speakerName, ts }`.
- El `conversationId` siempre está presente en el payload de `subtitle`.
- Los subtítulos se emiten al resto de la sala, no al emisor.

**TURN server:**
- No usar el relay público `openrelay.metered.ca` en producción. Configurar TURN propio (Coturn) o usar un proveedor de credenciales efímeras (Twilio Network Traversal, Xirsys).
- Las credenciales TURN se inyectan vía variables de entorno, nunca hardcodeadas.
- `ICE_SERVERS` se define en un único lugar y se exporta. No se duplica en `useWebRTC.ts` y en `call/[roomId]/page.tsx`.

### Hook `useWebRTC` (cliente)

- El hook recibe `conversationId` como parámetro, no un `roomId` aleatorio.
- Internamente usa `conversationId` como `roomId` para `join-room`.
- Expone: `{ localStream, remoteStream, connected, hasRemote, micOn, camOn, error, startCall, endCall, toggleMic, toggleCam }`.
- La integración con Deepgram (envío de audio chunks, recepción de subtítulos) se gestiona dentro del hook o en un hook separado `useTranscription`, no en el componente que renderiza el video.

### Procesado de audio

- Usar `AudioWorklet` en lugar del deprecado `ScriptProcessorNode`.
- El Worklet convierte el PCM float32 a PCM int16 y emite los chunks al socket.
- Si el navegador no soporta `AudioWorklet` (caso muy raro), degradar a `ScriptProcessorNode` con un warning explícito en consola.

### ElevenLabs TTS

- Al recibir una transcripción final y su traducción, sintetizar el audio traducido con ElevenLabs y reproducirlo en el dispositivo del oyente.
- El endpoint de ElevenLabs se llama desde el servidor (`server/signaling.ts` o una API Route), nunca desde el cliente.
- La API key de ElevenLabs es una variable de entorno del servidor.
- El audio sintetizado se envía al cliente como `ArrayBuffer` o URL temporal, según latencia permitida.

### Implementación única

- Existe **un único `useWebRTC` hook**. No hay implementaciones duplicadas en `app/chat/hooks/useWebRTC.ts` y `app/call/[roomId]/page.tsx`.
- La ruta `/call/[roomId]` como página autónoma no existe en el flujo de usuario final. La videollamada se renderiza en `VideoOverlay.tsx` dentro del chat.

---

## Límites

- No define la UI de los controles de llamada. Eso es responsabilidad del agente Frontend (`VideoOverlay.tsx`).
- No accede directamente a la base de datos Supabase desde el cliente para leer mensajes o participantes. Usa la API del agente Backend para eso.
- No decide qué funcionalidades se incluyen en el beta. Eso lo decide el agente Product.
- No usa proveedores de traducción externos desde el cliente (`mymemory.translated.net`, `api.openai.com`). Toda traducción pasa por `/api/translate`.

---

## Reglas de actuación

1. **Regla de identidad de sala:** el `roomId` pasado a `join-room` siempre es el `conversationId` de Supabase. Nunca `Math.random()`.
2. El servidor de señalización rechaza conexiones a salas sin `conversationId` validado en Supabase.
3. `ICE_SERVERS` se define en `server/signaling.ts` y se pasa al cliente via el evento de conexión o una API Route, no hardcodeado en dos sitios.
4. `ScriptProcessorNode` no se usa en código nuevo. `AudioWorklet` es el estándar.
5. ElevenLabs se llama server-side. El cliente nunca hace fetch a `api.elevenlabs.io`.
6. Deepgram se llama server-side (ya implementado correctamente en `signaling.ts`). El cliente solo envía chunks de audio al socket.
7. Cada socket tiene como máximo una sesión Deepgram abierta. Al cambiar idioma se cierra la sesión anterior antes de abrir la nueva.
8. El evento `subtitle` incluye siempre `conversationId` para que el cliente pueda ignorar subtítulos de conversaciones distintas.

---

## Criterios de calidad

- **Sala = conversación:** `grep -r "Math.random" server/ app/chat/hooks/` no produce resultados relacionados con `roomId`.
- **Sin TURN hardcodeado:** las credenciales TURN no aparecen en ningún archivo versionado (verificado con `grep -r "openrelayproject" .`).
- **Sin `ScriptProcessorNode`:** no aparece en ningún archivo de producción.
- **ElevenLabs server-side:** `grep -r "elevenlabs.io" app/` no produce resultados en archivos de componentes.
- **Sin duplicación de `ICE_SERVERS`:** existe exactamente una definición en el codebase.
- **Subtítulos en overlay:** `VideoOverlay.tsx` renderiza subtítulos en tiempo real igual que lo hacía `/call/[roomId]/page.tsx`.
- **Latencia STT < 800ms:** desde que el usuario termina de hablar hasta que aparece el subtítulo traducido, medible en condiciones normales de red.
- **Reconexión automática:** si el socket se desconecta, el hook intenta reconectar con backoff y reanuda la sesión Deepgram automáticamente.
