# ADR-001 — 2026-07-04 — Piezas portables de V1

Tipo: Decisión (ADR).
Autor: jefe de proyecto (registrado durante la reformulación de la
arquitectura V2).
Estado: aceptada.

---

## Contexto

SPABLA V1 acumuló deuda arquitectónica irremediable (archivos monolito
de 800–1200 líneas, refs cruzados, idioma en cinco sitios distintos).
En la Fase 0 de V2 se decidió reconstruir desde cero.

Al plantear la reconstrucción surgió la pregunta operativa: ¿qué de V1
merece la pena portar y qué se reescribe? Sin una respuesta explícita, la
reconstrucción arriesga (a) importar código ya defectuoso disfrazado de
"reutilizable", o (b) reescribir piezas que sí funcionaban y sostenían
carga real.

Esta decisión cierra la duda antes de que se abra la Fase 1 de
implementación.

---

## Opciones consideradas

**A. Portar todo lo que no sea "puro código problemático".** Descartada:
la ambigüedad de "puro problemático" invita a portar por ergonomía y a
propagar defectos.

**B. Portar cero.** Descartada: perdemos meses reescribiendo piezas
neutras (schema Supabase, middleware JWT) que ya llevan tiempo
funcionando y auditadas.

**C. Portar únicamente elementos infra probados y esquema de datos.**
Aceptada.

---

## Decisión

Solo se porta a V2 lo estrictamente reutilizable, en un conjunto
enumerable y cerrado:

- **Esquema Supabase**: tablas `users`, `conversations`,
  `conversation_participants`, `messages`, `call_signals`, junto con
  sus políticas RLS y funciones (`is_participant`,
  `shares_conversation`).
- **JWT middleware Socket.IO** (verificación con
  `supabaseAuth.getClaims`).
- **Patrón de oscillators con tracking explícito** en tonos de llamada
  (aprendizaje de `useRingTone` V1: mantener refs de `activeOscsRef`,
  `activeGainsRef` para stop inmediato en iOS).

Todo lo demás se reescribe desde cero bajo la arquitectura V2. El
código de V1 queda como referencia histórica en el tag
`spabla-stable-ot-071-targetlang-translation-2026-07-04`. **No se
importa a V2.**

---

## Consecuencias

- El paquete `engine/` construido en Fases 1–4 no depende de código V1;
  el esquema Supabase se toca cuando exista un `SupabaseAdapter` real
  (fase futura).
- El middleware JWT se reutilizará al abrir el `server/` de
  señalización.
- El patrón de oscillators se replicará (no se copiará literal) cuando
  se implemente el módulo `ring` en la fase de llamada.
- Cualquier otra pretensión de "portar X de V1" requiere abrir una ADR
  nueva que la justifique. Sin ADR previa aprobada, la respuesta por
  defecto es "no".
