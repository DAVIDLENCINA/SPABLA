# VOICE STABLE BASELINE

## Commit de referencia

```
2ebdbc6  feat(calls): distinguish ringback and incoming ringtone
```

Tag protector: `calls-stable-voice-working-2026-06-17`

## Fecha de validación

2026-06-17 — validado manualmente en `localhost:3002` con dos navegadores (Chrome normal + Chrome incógnito).

## Estado validado

| Componente | Estado |
|---|---|
| Chat en tiempo real | ✅ OK |
| Traducción automática | ✅ OK |
| Señalización de llamadas (`call_signals`) | ✅ OK |
| Detección llamada entrante | ✅ OK |
| Aceptar / Rechazar llamada | ✅ OK |
| Audio de llamada (WebRTC) — voz | ✅ OK |
| ICE (conexión peer-to-peer) | ✅ OK |
| Estado "EN LLAMADA" en UI | ✅ OK |
| Botones colgar / aceptar | ✅ OK |
| Ringback (llamante) | ✅ OK |
| Ringtone (receptor) | ✅ OK |
| Tono se detiene al aceptar | ✅ OK |

## Cómo restaurar este estado

```bash
# Opción A — worktree (sin tocar main):
git worktree add ../spabla-stable calls-stable-voice-working-2026-06-17

# Opción B — checkout temporal:
git checkout calls-stable-voice-working-2026-06-17
```

## Causa del fallo identificada post-baseline

El commit `ebd5dd5` (feat: experimental voice transcription to chat) introdujo
`useVoiceTranscription.ts`, que lanza `SpeechRecognition.start()` mientras
WebRTC está configurando el PeerConnection. Esto provoca una segunda captura
de micrófono concurrente que en macOS Chrome reconfigura el grafo de audio de
CoreAudio, dejando el MediaStreamTrack de WebRTC en estado `ended` antes de
que el peer remoto reciba `ontrack`. Resultado: ambos navegadores quedan en
"LLAMANDO…" indefinidamente.

**Fix aplicado:** desactivación temporal de `useVoiceTranscription` mediante
flag `ENABLED = false` en el propio hook, manteniendo el código para
rehabilitarlo cuando se resuelva el conflicto de audio.
