# SPABLA — Sistema Sonoro

> Versión: 1.0
> Fecha: 2026-06-03
> Estado: PROPUESTA — pendiente de aprobación antes de implementar

---

## Principios de diseño

**1. Mínimo e informativo**
Cada sonido comunica exactamente un evento. Nada decorativo.

**2. Coherente con la identidad visual**
SPABLA es oscuro, premium, funcional. Los sonidos son cortos, limpios, sin adornos.

**3. No intrusivo**
Los sonidos de mensajes son sutiles. Solo los de llamada son audibles desde el otro lado de la habitación.

**4. Respetuoso con el contexto**
Si el usuario está en una llamada activa, los sonidos de mensaje se silencian automáticamente para no competir con el audio de la conversación.

---

## Inventario de eventos sonoros

| ID | Evento | Momento | Duración | Prioridad |
|---|---|---|---|---|
| `msg.sent` | Mensaje enviado | Al enviar con éxito (INSERT 201) | 80ms | Baja |
| `msg.received` | Mensaje recibido | Al llegar un mensaje de otro usuario | 180ms | Media |
| `call.ringing` | Llamada entrante | Desde que aparece el overlay hasta respuesta | Loop 3s | Alta |
| `call.connected` | Llamada conectada | Cuando WebRTC establece la conexión | 350ms | Alta |
| `call.ended` | Llamada finalizada | Al colgar cualquiera de las dos partes | 350ms | Media |
| `call.missed` | Llamada perdida | Timeout 30s sin respuesta | 450ms | Media |

---

## Diseño sonoro por evento

### `msg.sent` — Mensaje enviado
```
Tipo:        Sintético (Web Audio API)
Forma onda:  sine
Frecuencia:  660 Hz → 880 Hz (rampa exponencial)
Duración:    80 ms
Ganancia:    0.06 → 0 (lineal)
Carácter:    Whoosh ascendente muy suave. Confirmación sin protagonismo.
Referencia:  Más sutil que WhatsApp, más corto que iMessage.
```

### `msg.received` — Mensaje recibido
```
Tipo:        Sintético (Web Audio API)
Forma onda:  sine
Estructura:  Dos pings con pausa mínima
  Ping 1:  880 Hz, 80 ms, ganancia 0.08
  Pausa:   50 ms
  Ping 2:  1100 Hz, 80 ms, ganancia 0.06
Duración total: 210 ms
Carácter:    Doble tono suave. Distintivo de "mensaje recibido".
             Diferente de msg.sent para que el usuario lo identifique sin mirar.
```

### `call.ringing` — Llamada entrante
```
Tipo:        Sintético (Web Audio API) — YA IMPLEMENTADO en useRingTone.ts
Forma onda:  sine × 2
Frecuencias: 480 Hz + 620 Hz (mezclados)
Patrón:      0.9 s tono · 2.1 s silencio → repite cada 3 s
Ganancia:    0.08 con exponential ramp a 0
Carácter:    Tono de teléfono clásico, reconocible, insistente.
             Audible a 3 metros del dispositivo.
Estado:      ✅ Implementado. No requiere cambios.
```

### `call.connected` — Llamada conectada
```
Tipo:        Sintético (Web Audio API)
Forma onda:  sine con suave attack
Estructura:  Dos notas ascendentes (quinta justa)
  Nota 1:  523 Hz (C5), 150 ms, ganancia 0.09
  Pausa:   50 ms
  Nota 2:  784 Hz (G5), 150 ms, ganancia 0.07
Duración total: 350 ms
Carácter:    Intervalo musical de quinta ascendente. Universalmente leído
             como "conexión exitosa". Cálido, no metálico.
Referencia:  FaceTime connect, pero más suave.
```

### `call.ended` — Llamada finalizada
```
Tipo:        Sintético (Web Audio API)
Forma onda:  sine con suave attack
Estructura:  Inversión de call.connected (descendente)
  Nota 1:  784 Hz (G5), 150 ms, ganancia 0.07
  Pausa:   50 ms
  Nota 2:  523 Hz (C5), 150 ms, ganancia 0.06
Duración total: 350 ms
Carácter:    Quinta descendente. Cierre. Neutral, no triste.
             El usuario entiende que la llamada terminó sin ansiedad.
```

### `call.missed` — Llamada perdida
```
Tipo:        Sintético (Web Audio API)
Forma onda:  sine
Estructura:  Tres notas descendentes
  Nota 1:  784 Hz, 120 ms, ganancia 0.07
  Pausa:   30 ms
  Nota 2:  659 Hz, 120 ms, ganancia 0.065
  Pausa:   30 ms
  Nota 3:  523 Hz, 150 ms, ganancia 0.06
Duración total: 450 ms
Carácter:    Tres notas como un "uh-oh" suave. Urgente pero no alarmante.
             Aparece en el dispositivo del llamante cuando nadie responde.
```

---

## Arquitectura técnica

### Opción elegida: Web Audio API puro (sin archivos)

**Razones:**
- `useRingTone.ts` ya existe con este enfoque — consistencia total
- Cero archivos externos, cero dependencias de red
- Funciona offline
- Control total sobre timbre, duración y volumen
- Tamaño cero en el bundle
- Misma tecnología en web y PWA

**No se usa `/public/sounds/`** en v1. Si en el futuro se necesita mayor riqueza tonal (instrumentos reales, diseño sonoro de estudio), se migra a archivos MP3 en `/public/sounds/` servidos por Vercel CDN. La arquitectura del hook permite esa migración sin cambiar los llamadores.

### Estructura de archivos

```
app/chat/hooks/
  useRingTone.ts          ← YA EXISTE — llamada entrante (loop)
  useSoundSystem.ts       ← NUEVO — todos los demás eventos sonoros
```

No se crean carpetas nuevas. No se añaden assets. No se modifica nada del backend.

### Interfaz del hook `useSoundSystem`

```typescript
type SoundEvent =
  | 'msg.sent'
  | 'msg.received'
  | 'call.connected'
  | 'call.ended'
  | 'call.missed';

// El ringing es gestionado por useRingTone (ya existe, no cambia)

interface SoundSystem {
  play:       (event: SoundEvent) => void;
  enabled:    boolean;
  setEnabled: (v: boolean) => void;
}
```

**Singleton de AudioContext** a nivel de módulo:
El `AudioContext` se crea una sola vez tras el primer gesto del usuario y se reutiliza para todos los sonidos. Evita el overhead de crear y destruir contextos por cada sonido.

### Estrategia iOS Safari (autoplay policy)

iOS Safari prohíbe reproducir audio sin un gesto previo del usuario. El punto de entrada más fiable es el botón de "Empezar" en el onboarding: ese es el primer gesto consciente. Ahí se "desbloquea" el AudioContext con un tono de 0 volumen.

```
Usuario pulsa "Empezar" en onboarding
  → AudioContext.resume() (o new AudioContext + play silencioso)
  → AudioContext queda desbloqueado para toda la sesión
  → Todos los sonidos posteriores funcionan sin gesto adicional
```

Para la llamada entrante (que llega por Realtime, no por gesto): el overlay de llamada entrante aparece visualmente. El tono comienza en el primer toque del usuario sobre la pantalla (cualquier punto). Esto es aceptable en iOS — el usuario inevitablemente toca la pantalla para aceptar o rechazar.

### Silenciado automático durante llamada

Cuando hay una llamada activa (`callPhase === 'connected'`), `msg.sent` y `msg.received` no suenan. El audio de la conversación tiene prioridad absoluta.

```typescript
// En useSoundSystem.play():
if (event === 'msg.sent' || event === 'msg.received') {
  if (callIsActive) return; // silencio durante llamada
}
```

### Accesibilidad

El hook respeta `prefers-reduced-motion` como proxy para preferencias de audio reducidas:
```typescript
const prefersQuiet = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (prefersQuiet && !['call.ringing', 'call.connected'].includes(event)) return;
```
Solo los sonidos de llamada (alta prioridad) suenan incluso con `prefers-reduced-motion`.

---

## Dónde se integra cada sonido en el código

| Evento | Archivo | Momento exacto |
|---|---|---|
| `msg.sent` | `app/chat/page.tsx` | Después de confirmar INSERT 201 en `sendMessage()` |
| `msg.received` | `app/chat/page.tsx` | En el handler de Supabase Realtime cuando `payload.new.sender_id !== user.id` |
| `call.ringing` | `app/chat/page.tsx` | Ya gestionado por `useRingTone` — sin cambios |
| `call.connected` | `app/chat/page.tsx` | Cuando `callPhase` cambia a `'connected'` (webrtc.hasRemote = true) |
| `call.ended` | `app/chat/page.tsx` | Al llamar a `handleEndCall()` |
| `call.missed` | `app/chat/page.tsx` | Cuando `callSignaling.signalStatus === 'missed'` en el efecto de callPhase |

Solo se modifica `chat/page.tsx` y se crea `useSoundSystem.ts`. Nada más.

---

## Compatibilidad

| Plataforma | Soporte | Notas |
|---|---|---|
| Chrome desktop | ✅ Completo | Tras primer gesto |
| Safari desktop | ✅ Completo | Tras primer gesto |
| Firefox desktop | ✅ Completo | Tras primer gesto |
| Chrome Android | ✅ Completo | Tras primer gesto |
| Safari iOS | 🟡 Parcial | Ring requiere toque en pantalla; el resto funciona tras onboarding |
| PWA instalada | ✅ Completo | Mismo comportamiento que navegador |

---

## Iteraciones futuras (fuera del scope de v1)

- **v2:** Control de volumen en la UI (slider en ajustes)
- **v2:** Sonidos de archivo MP3 en `/public/sounds/` para mayor riqueza tonal
- **v3:** Sonidos distintos para cada idioma de interfaz (internacionalización sonora)
- **v4:** Integración con notificaciones push nativas (requiere app móvil)

---

## Resumen de decisiones

| Decisión | Elección | Razón |
|---|---|---|
| Tecnología | Web Audio API puro | Consistencia con useRingTone, sin archivos, offline |
| Almacenamiento | Ninguno (síntesis en código) | Cero dependencias externas |
| Archivos nuevos | Solo `useSoundSystem.ts` | Mínimo impacto |
| Archivos modificados | Solo `chat/page.tsx` | Integración de llamadas al hook |
| iOS Safari | Desbloqueo en onboarding | Primer gesto natural del usuario |
| Durante llamada | Silencio de msg.sent/received | Audio de conversación tiene prioridad |
| Accesibilidad | prefers-reduced-motion | Solo ring y connected si activado |
