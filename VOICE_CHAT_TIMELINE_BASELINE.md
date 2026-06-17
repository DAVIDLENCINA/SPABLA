# VOICE_CHAT_TIMELINE_BASELINE

- Fecha: 2026-06-17
- Objetivo:
  Integrar traducciones de voz en el flujo normal del chat.
- Archivos:
  - app/chat/page.tsx
  - app/chat/components/VoiceCaptionsOverlay.tsx
- Cambios:
  - combinedTimeline
  - burbujas VOZ
  - overlay solo para parcial/live
  - persistencia local tras colgar
  - limpieza al cambiar conversación
- Garantías:
  - No se toca WebRTC
  - No se toca signaling
  - No se toca Deepgram
  - No se toca servidor
  - No se toca useVoiceTranscription
  - No se toca PTT
- Resultado validado:
  - Voz OK
  - Traducción OK
  - Timeline combinado OK
  - Build OK
