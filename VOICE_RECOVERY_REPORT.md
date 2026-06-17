# Voice Recovery Report — 2026-06-17

## Síntoma observado

Tras el commit `ebd5dd5`, las llamadas de voz dejaron de funcionar.
Ambos navegadores quedaban bloqueados en el estado "LLAMANDO…"
(`callStatus === "accepted"` pero `webrtc.hasRemote === false`).
No había voz ni conexión WebRTC establecida.

## Commit estable identificado

```
2ebdbc6  feat(calls): distinguish ringback and incoming ringtone
Tag:     calls-stable-voice-working-2026-06-17
```

Validado manualmente en `localhost:3002` con dos navegadores (Chrome normal + incógnito):
chat, traducción, señalización, voz, ICE, botones — todo OK.

## Causa sospechosa

`useVoiceTranscription.ts` (introducido en `ebd5dd5`) llama a
`SpeechRecognition.start()` mientras WebRTC está configurando el
PeerConnection. Esto abre una segunda captura concurrente del micrófono.
En macOS Chrome, CoreAudio reconfigura el grafo de audio en medio de la
negociación ICE, dejando el `MediaStreamTrack` de WebRTC en estado
`ended` antes de que el peer remoto reciba `ontrack`.
Resultado: `hasRemote` nunca se pone a `true`.

## Acción tomada

Desactivación no destructiva mediante flag en `useVoiceTranscription.ts`:

```typescript
const ENABLED = false; // re-enable after audio conflict is resolved
```

El código del hook se conserva íntegro. Los `useEffect` siguen
registrándose (respeta las reglas de hooks). Reversible con
`const ENABLED = true`.

Commit de fix: `94d21f6`

## Resultado validado

Voz restaurada en `main` (HEAD `94d21f6`).
`localhost:3000` equivale ahora al estado estable `2ebdbc6`.

## Próximos pasos para re-habilitar la transcripción

Opciones sin conflicto de audio:
1. Pasar `localStream` directamente a `SpeechRecognition` (si el navegador lo soporta vía `MediaStreamAudioSourceNode`)
2. Usar la API de Deepgram ya integrada en el servidor de señalización (evita doble captura de micrófono)
3. Activar `useVoiceTranscription` solo cuando WebRTC esté en estado `"connected"` o `"completed"` (evitar el solapamiento con la fase de setup)
