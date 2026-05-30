# SPABLA — Master Index

> **INSTRUCCIÓN PARA CUALQUIER AGENTE (IA O HUMANO):**
> Antes de escribir código, tomar decisiones o ejecutar cualquier tarea relacionada con SPABLA,
> debes leer los documentos marcados con ★ en el orden indicado.
> No actúes sin haber leído la visión, la arquitectura y el workflow.

---

## Lectura obligatoria (en orden)

| # | Documento | Contenido | Obligatorio |
|---|---|---|---|
| 1 | [`docs/vision.md`](../../docs/vision.md) | Identidad, misión, principios, regla de oro | ★ Siempre |
| 2 | [`docs/architecture.md`](../../docs/architecture.md) | conversationId, flujos, prohibición de salas independientes | ★ Siempre |
| 3 | [`docs/workflow.md`](../../docs/workflow.md) | Agentes, orden de trabajo, reglas críticas | ★ Siempre |
| 4 | [`agents/orchestrator.md`](../../agents/orchestrator.md) | Coordinación y entrada de tareas | ★ Toda tarea nueva |
| 5 | [`docs/product.md`](../../docs/product.md) | V1/V2/V3, flujo canónico, funciones no prioritarias | Si la tarea es de producto |
| 6 | [`docs/decisions.md`](../../docs/decisions.md) | Decisiones tomadas y su motivo | Si la tarea toca arquitectura |

---

## Visión (resumen)

SPABLA elimina las barreras del idioma entre personas.

Permite comunicación mediante mensajes, llamadas, videollamadas, documentos, imágenes y traducción en tiempo real.

**La traducción no es el producto. La comunicación es el producto.**

---

## Principio fundamental

> **Una conversación = una única sesión.**
>
> Todo sucede dentro de la misma conversación.
> No existen salas independientes para llamadas.
> No existen salas independientes para videollamadas.
> No existen enlaces independientes para llamadas.
> Todo utiliza el mismo `conversationId`.

---

## Regla de oro

> Si existe conflicto entre estética, arquitectura y experiencia de conversación:
> **priorizar experiencia de conversación. Siempre.**

---

## Reglas críticas (no negociables)

1. **Nunca optimizar funcionalidades secundarias mientras existan problemas en el flujo principal de conversación multilingüe.**

2. **Prioridad absoluta: llamada, traducción, voz y subtítulos.** Mientras este flujo no funcione de forma fiable end-to-end, no se trabaja en nada más.

3. Toda llamada iniciada desde una conversación existente utiliza el `conversationId` como identificador de sala.

4. Toda videollamada iniciada desde una conversación existente utiliza el `conversationId` como identificador de sala.

5. Nunca generar nuevas salas para una llamada iniciada desde una conversación existente.

6. Nunca generar nuevas invitaciones para una llamada iniciada desde una conversación existente. El link de invitación apunta siempre a la conversación.

7. Los archivos utilizan el mismo `conversationId`.

---

## Arquitectura (resumen)

```
Conversation (conversationId)
├── Messages       → conversation_id FK
├── Voice          → roomId = conversationId
├── Video          → roomId = conversationId
├── Files          → conversation_id FK
└── Translation    → /api/translate (OpenAI, server-side)
```

---

## Tecnología

| Capa | Tecnología |
|---|---|
| Frontend | Next.js + React + TypeScript |
| Base de datos | Supabase |
| Tiempo real | Supabase Realtime + Socket.io |
| Audio/Vídeo P2P | WebRTC |
| STT | Deepgram |
| Traducción | OpenAI GPT-4o-mini |
| TTS | ElevenLabs |

---

## Objetivo beta

- [ ] Chat funcional con traducción automática
- [ ] Llamadas con subtítulos en tiempo real
- [ ] Videollamadas con subtítulos en tiempo real
- [ ] Compartir archivos
- [ ] Una única sesión por conversación (`conversationId` en todo)

---

## Agentes del sistema

| Agente | Archivo | Rol |
|---|---|---|
| Orchestrator | [`agents/orchestrator.md`](../../agents/orchestrator.md) | Coordinación y entrada de tareas |
| CTO | [`agents/cto.md`](../../agents/cto.md) | Arquitectura global |
| Product | [`agents/product.md`](../../agents/product.md) | Roadmap y definición |
| Frontend | [`agents/frontend.md`](../../agents/frontend.md) | Interfaces Next.js/React |
| Backend | [`agents/backend.md`](../../agents/backend.md) | Supabase, APIs, auth |
| WebRTC | [`agents/webrtc.md`](../../agents/webrtc.md) | Llamadas, vídeo, Deepgram, ElevenLabs |
| QA | [`agents/qa.md`](../../agents/qa.md) | Testing y validación |
| UX | [`agents/ux.md`](../../agents/ux.md) | Experiencia de usuario |
| Security | [`agents/security.md`](../../agents/security.md) | Seguridad y privacidad |
| Growth | [`agents/growth.md`](../../agents/growth.md) | Activación y retención |

---

## Estado del proyecto

Ver [`docs/product.md`](../../docs/product.md) para el estado detallado de cada funcionalidad.

Ver [`docs/decisions.md`](../../docs/decisions.md) para el historial de decisiones arquitecturales.

Ver [`docs/roadmap.md`](../../docs/roadmap.md) para el roadmap por fases con criterios de completitud.
