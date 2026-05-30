# SPABLA — Producto

---

## Métrica principal

**Duración media de conversación activa.**

Una conversación activa es aquella en la que al menos dos participantes han intercambiado mensajes o han mantenido una llamada en los últimos 30 días.

Si esta métrica sube, el producto está resolviendo el problema. Si baja, algo en el flujo principal está roto.

Métricas secundarias de control: tasa de activación (usuario que completa onboarding y envía primer mensaje), K viral (usuarios traídos por cada usuario existente), retención D7.

---

## SPABLA V1 — Beta

**Objetivo:** que dos personas con idiomas distintos puedan mantener una conversación completa (texto + voz + vídeo + archivos) en una sola sesión, con traducción automática en todo momento.

### Funcionalidades del beta

**Chat con traducción**
- Mensajes de texto traducidos automáticamente al idioma del destinatario.
- Traducción visible sin acción adicional del receptor.
- Texto original accesible al expandir el mensaje.
- Historial persistente en Supabase.

**Llamada de voz con subtítulos**
- Llamada de voz iniciada desde la conversación activa.
- Transcripción en tiempo real con Deepgram (STT).
- Traducción de la transcripción con OpenAI.
- Subtítulos visibles en la pantalla del oyente.
- Síntesis de voz traducida con ElevenLabs (TTS).
- Al colgar, el usuario permanece en la conversación.

**Videollamada con subtítulos**
- Videollamada iniciada desde la conversación activa (overlay dentro del chat).
- Misma cadena de traducción que la llamada de voz.
- Modo compacto (overlay) y modo inmersivo (pantalla completa).
- Al cerrar, el chat y el historial siguen visibles.

**Compartir archivos**
- Selección y subida de archivos desde el chat.
- Almacenamiento en Supabase Storage vinculado al `conversationId`.
- Aparece en el historial como elemento descargable.
- Acceso restringido a participantes de la conversación.

**Invitación**
- Link de invitación que apunta a la conversación: `/chat?id={conversationId}`.
- El invitado ve el historial al unirse.
- No se generan links separados para llamadas.

### Criterios de completitud del beta

- [ ] Flujo completo sin romper: landing → onboarding → conversación → mensaje traducido
- [ ] Llamada desde el chat con subtítulos traducidos en tiempo real
- [ ] Videollamada como overlay con subtítulos
- [ ] Archivos subidos y accesibles para todos los participantes
- [ ] `conversationId` como identificador único en todos los modos
- [ ] Sin rutas independientes de llamada (`/call/[roomId]` eliminado del flujo)
- [ ] Autenticación real (Supabase Auth)
- [ ] RLS activo en todas las tablas

### Estado actual del beta

| Funcionalidad | Estado |
|---|---|
| Chat con traducción | 🟡 Parcial (auth en localStorage, polling fijo, sin RLS verificado) |
| Llamada con subtítulos | 🟡 Parcial (existe pero en ruta independiente `/call/[roomId]`) |
| Videollamada con subtítulos | 🟡 Parcial (overlay sin subtítulos) |
| Compartir archivos | 🔴 Sin implementar |
| Flujo de invitación correcto | 🔴 Roto (comparte URL de sala, no de conversación) |

*Actualizado: 2026-05-31*

---

## SPABLA V2 — Grupos y canales

**Objetivo:** conversaciones con más de dos participantes, cada uno con su idioma, recibiendo mensajes y subtítulos en su propio idioma.

### Funcionalidades previstas

- Grupos de conversación (más de 2 participantes).
- Cada participante configura su idioma; los mensajes se traducen a cada idioma en la recepción.
- En llamadas grupales: subtítulos por hablante, identificados visualmente.
- Historial de conversación con mensajes de múltiples autores.
- Roles de participante: administrador, miembro.
- Notificaciones de mensajes nuevos (push en mobile).

### Prerequisito

V1 completamente funcional y estable. V2 no empieza mientras existan bugs críticos en V1.

---

## SPABLA V3 — Escala empresarial

**Objetivo:** SPABLA para equipos, organizaciones y empresas con necesidades de comunicación multilingüe frecuente.

### Funcionalidades previstas

- Espacios de trabajo (workspaces) con múltiples conversaciones organizadas.
- SSO y autenticación corporativa.
- Historial ilimitado con búsqueda.
- API pública para integraciones (Slack, Teams, sistemas propios).
- Panel de administración: usuarios, conversaciones, uso, costes de traducción.
- SLA y soporte dedicado.
- Servidor de señalización dedicado por workspace.
- Retención configurable de datos.

### Prerequisito

V2 con retención D30 > 30% y al menos 1.000 conversaciones activas mensuales.

---

## Funciones no prioritarias

Las siguientes funcionalidades **no entran en V1** y no deben bloquear el desarrollo del flujo principal:

- Modo oscuro / temas visuales
- Animaciones y microinteracciones decorativas
- Reacciones a mensajes (emojis)
- Mensajes de voz grabados (distinto a llamada en tiempo real)
- Traducción de documentos completos
- Transcripción automática de archivos de audio/vídeo
- Modo sin vídeo (solo audio) como configuración separada
- Integración con calendarios
- Recordatorios y programación de llamadas
- Segmentación de audiencia / analytics avanzados

**Regla:** si un agente propone implementar alguna de estas funciones antes de completar V1, el Orchestrator debe rechazarla.

---

## Flujo de usuario canónico

```
Landing (/)
    │
    ▼ (si no hay sesión)
Onboarding (/onboarding)
    │ nombre + idioma
    ▼
Conversación creada en Supabase
    │
    ▼
Chat (/chat?id={conversationId})
    │
    ├── Enviar mensaje → traducción automática
    ├── Llamar → llamada con subtítulos (overlay)
    ├── Vídeo → videollamada con subtítulos (overlay)
    └── Archivo → subir y compartir
    │
    ▼
En todo momento: mismo conversationId, mismo historial, misma pantalla
```

Cualquier flujo que saque al usuario de `/chat?id={conversationId}` para hacer una llamada o videollamada es un bug de producto.
