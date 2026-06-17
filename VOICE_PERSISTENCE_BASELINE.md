# VOICE_PERSISTENCE_BASELINE

- Fecha: 2026-06-17
- Objetivo: persistencia de traducciones de voz en el historial de conversación
- Estrategia: receptor inserta
- Tabla: messages
- Columna nueva: source
- Valores: text / voice
- Sin doble traducción
- Sin tocar WebRTC
- Sin tocar signaling
- Sin tocar Deepgram
- Sin tocar servidor
- Sin tocar PTT
