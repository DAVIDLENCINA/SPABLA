# SPABLA — Visión

---

## Identidad

SPABLA es un producto de comunicación que elimina las barreras del idioma entre personas.

No es una herramienta de traducción. No es un asistente de idiomas. Es el medio por el que dos personas que no comparten idioma pueden hablar, escucharse y entenderse como si lo compartieran.

El nombre SPABLA condensa la esencia: hablar sin fronteras.

---

## Misión

Permitir que cualquier persona se comunique con cualquier otra persona, en cualquier idioma, sin fricción, sin intermediarios y sin perder la naturalidad de la conversación.

SPABLA hace esto mediante:

- Mensajes con traducción automática instantánea
- Llamadas con traducción de voz y subtítulos en tiempo real
- Videollamadas con traducción integrada
- Compartición de documentos e imágenes
- Todo dentro de una única conversación persistente

---

## Visión

Un mundo en el que el idioma no es un obstáculo para relacionarse, trabajar, cuidar o conectar con otras personas.

La tecnología de SPABLA es invisible. El usuario no piensa en la traducción. El usuario piensa en la persona con la que habla.

---

## Definición de éxito

SPABLA ha tenido éxito cuando:

1. Dos personas que no comparten idioma mantienen una conversación fluida sin que ninguna de las dos tenga que esforzarse por el idioma.
2. El usuario no recuerda que hubo traducción. Solo recuerda la conversación.
3. Una persona recomienda SPABLA a alguien que habla otro idioma porque necesita hablar con él.

**Métrica de éxito principal:** duración media de conversación activa (mensajes + llamada). Si sube, el producto funciona.

---

## Momento mágico

El momento en que el usuario recibe el primer mensaje de alguien que habla otro idioma, ya traducido, sin haber hecho nada para activarlo.

Ese es el momento en que SPABLA se justifica.

Todo el diseño del producto debe maximizar la probabilidad de que ese momento ocurra lo antes posible, con el menor número de pasos.

---

## Principios de producto

### 1. La conversación es el producto
La traducción es infraestructura. El chat, la llamada, el vídeo, los archivos: son los modos de la conversación. No son productos separados. Todo sucede dentro de la misma conversación.

### 2. Invisible por defecto
La mejor experiencia de traducción es la que no se nota. SPABLA no debe recordarle al usuario que está siendo traducido. El producto desaparece detrás de la comunicación.

### 3. Una sesión, no muchas puertas
Una conversación tiene un único identificador (`conversationId`). Todos los modos de comunicación — mensaje, voz, vídeo, archivo — comparten ese identificador. No existen salas independientes, no existen enlaces independientes para llamadas. Entrar a una llamada no significa abandonar la conversación.

### 4. Mobile-first, siempre
SPABLA se usa en situaciones reales: un médico con un paciente, un viajero con un local, un familiar con otro. Esas situaciones ocurren con el teléfono en la mano. El producto debe funcionar perfectamente en mobile antes que en desktop.

### 5. Prioridad absoluta: voz y subtítulos
Mientras el flujo de llamada con traducción en tiempo real no funcione de forma fiable, no hay features nuevas. La llamada con subtítulos es el producto diferencial. Nada tiene más prioridad.

### 6. No optimizar lo secundario mientras lo principal falla
Mejorar el hero de la landing, añadir animaciones o refinar estilos no tiene valor mientras el flujo conversación → llamada → subtítulos no esté completo y funcionando.

---

## Regla de oro

> Si existe conflicto entre estética, arquitectura y experiencia de conversación: **priorizar experiencia de conversación**.

Siempre.

Un producto que se ve bien pero en el que dos personas no pueden hablar no es SPABLA.
Un producto con arquitectura perfecta pero en el que la llamada falla no es SPABLA.
SPABLA es el producto en el que la conversación funciona.
