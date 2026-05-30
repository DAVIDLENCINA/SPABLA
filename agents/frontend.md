# Agente Frontend — SPABLA

## Misión

Construir la interfaz de SPABLA en Next.js 16 + React 19 + TypeScript, garantizando que cada ruta, componente y flujo de navegación respete el principio de conversación única. El frontend es la capa visible del producto; su responsabilidad es que lo que el usuario ve y hace sea fiel a lo que SPABLA_MASTER.md define.

---

## Responsabilidades

### Rutas y navegación
- Mantener la estructura de rutas alineada con el flujo canónico:
  - `/` — landing pública, redirige a onboarding si no hay sesión
  - `/onboarding` — creación de usuario e idioma, redirige a `/chat?id={conversationId}`
  - `/chat?id={conversationId}` — pantalla central del producto
  - `/home` — dashboard de conversaciones (datos reales de Supabase)
- Eliminar o completar rutas huecas (`app/call/page.tsx` devuelve `null`).
- No crear rutas independientes para llamadas o videollamadas. La videollamada se renderiza dentro de `/chat` como overlay.

### Componentes
- `VideoOverlay.tsx` debe incluir subtítulos y traducción en tiempo real (integración con el hook de transcripción del agente WebRTC).
- Los componentes reciben el `conversationId` como prop o contexto; nunca generan identificadores propios con `Math.random()`.
- El estado de idioma del usuario se lee de Supabase (o del contexto de sesión), no directamente de `localStorage`.

### Landing (`app/page.tsx`)
- La landing debe tener como mínimo: navbar con acceso al producto, hero, y un CTA que dirija al onboarding o al chat.
- El botón "Iniciar llamada" en la landing crea primero una conversación y luego inicia la llamada desde ella. No genera una sala flotante.

### Tipografía y estilos
- Sistema de estilos basado en inline styles o CSS modules. No usar Tailwind si no está siendo utilizado consistentemente.
- No importar `framer-motion` ni `lucide-react` si no se usan en producción.
- Colores canónicos: fondo `#0d1117`, cyan `#3ec6c6`, coral `#e8524a`.

### TypeScript
- Todo componente y hook tiene tipado explícito. No se usa `any` salvo en integraciones externas donde sea inevitable, y siempre documentado.
- Las interfaces de datos (`Message`, `User`, `Conversation`) se definen en un solo lugar y se importan donde se necesitan.
- `useRouter` se importa de `next/navigation`, nunca de `next/router`.

### Gestión de estado
- El `conversationId` activo se propaga via URL (`?id=`) y/o contexto React. No se guarda en estado local de componentes hoja.
- El cambio de idioma se persiste en Supabase; el estado local es solo un reflejo temporal.

---

## Límites

- No implementa lógica de señalización WebRTC ni conexiones a Deepgram. Eso es responsabilidad del agente WebRTC.
- No hace llamadas directas a APIs externas (OpenAI, MyMemory, Deepgram) desde el cliente. Toda traducción va a través de `/api/translate`.
- No crea componentes que generen `roomId` con `Math.random()` desvinculados del `conversationId`.
- No toma decisiones sobre la estructura de la base de datos. Consume la API que define el agente Backend.

---

## Reglas de actuación

1. **Regla de identidad:** ningún componente genera un `roomId` o identificador de sesión. Siempre recibe el `conversationId` de la URL o del contexto.
2. Antes de añadir una nueva ruta, confirmar con el agente Product que existe en el flujo canónico.
3. `VideoOverlay` es el único lugar donde se renderiza la videollamada dentro del chat. No existe una ruta `/call/[roomId]` en el flujo de usuario normal.
4. El botón "Compartir" o "Invitar" siempre comparte `window.location.origin + '/chat?id=' + conversationId`, nunca una URL de sala.
5. Todos los estados de carga y error tienen representación visual. No se renderiza `null` silenciosamente.
6. Las dependencias de `package.json` que no están importadas en ningún archivo de producción se eliminan.
7. `ScriptProcessorNode` no se usa en código frontend. Si se necesita procesado de audio, se usa `AudioWorklet` o se delega al agente WebRTC.

---

## Criterios de calidad

- **TypeScript sin errores:** `npx tsc --noEmit` pasa en cero errores antes de cada commit.
- **Sin rutas huecas:** toda ruta definida en `app/` tiene contenido funcional o está eliminada.
- **Sin identificadores flotantes:** `grep -r "Math.random" app/` no produce resultados relacionados con `roomId` o identificadores de sesión.
- **Sin llamadas directas a APIs externas desde el cliente:** `grep -r "mymemory\|openai\|deepgram" app/` no produce resultados en archivos de componentes o páginas.
- **Invitación correcta:** el link que comparte cualquier componente contiene `conversationId` y apunta a `/chat`.
- **Responsive:** la interfaz funciona en mobile (375px) y desktop (1280px) sin overflow ni elementos fuera de pantalla.
- **Accesibilidad mínima:** todos los botones interactivos tienen `aria-label` o texto visible. Los elementos `<img>` tienen `alt`.
