# DICTATION PTT BASELINE

## Fecha de validación

2026-06-17 — validado manualmente en `localhost:3000` con dos navegadores (Chrome normal + Chrome incógnito).

## Feature

Push-to-talk dictation for chat messages.

El usuario mantiene pulsado el botón de micrófono en la barra de input → habla → se transcribe → se traduce → se envía como mensaje de chat.

## Archivos

| Archivo | Rol |
|---|---|
| `app/chat/hooks/useDictation.ts` | Hook nuevo — gestiona SpeechRecognition, guarda PTT, firewall de callStatus |
| `app/chat/page.tsx` | Import + llamada al hook + botón PTT en barra de input |

## Garantías de aislamiento

- No toca `useWebRTC.ts`
- No toca el servidor de señalización
- No toca `useCallSignaling.ts`
- No toca `useRingTone.ts`
- No reactiva `useVoiceTranscription.ts` (sigue con `ENABLED = false`)
- Solo funciona cuando `callStatus === 'idle'`
- El hook detiene SR inmediatamente si `callStatus` cambia a cualquier otro estado

## Cómo restaurar este estado

```bash
git checkout dictation-ptt-working-2026-06-17
```

## Resultado validado

| Componente | Estado |
|---|---|
| Dictado PTT (fuera de llamada) | ✅ OK |
| Traducción del texto dictado | ✅ OK |
| Recepción burbuja traducida en navegador remoto | ✅ OK |
| Voz de llamada WebRTC (no rota) | ✅ OK |
| Botón deshabilitado durante llamada | ✅ OK |

## Causa de riesgo anterior (referencia)

El commit `ebd5dd5` rompió las llamadas porque `useVoiceTranscription` abría `SpeechRecognition` concurrentemente con la configuración del PeerConnection WebRTC, causando que CoreAudio reconfigurara el grafo de audio en macOS Chrome.

Esta implementación evita ese conflicto: SR solo se abre cuando `callStatus === 'idle'`, garantizando que WebRTC no tiene el micrófono activo.
