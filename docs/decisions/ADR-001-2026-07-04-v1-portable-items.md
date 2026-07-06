# ADR-001 — 2026-07-04 — Piezas portables de V1

Tipo: Decisión (ADR).
Autor: jefe de proyecto (registrado durante la reformulación de la
arquitectura V2).
Estado: aceptada.

---

## Contexto

La reconstrucción SPABLA V2 arranca desde cero por defecto, pero
determinadas piezas de V1 estaban probadas en producción y su
reescritura no aporta valor. Esta ADR enumera exactamente qué se porta y
qué no.

---

## Decisión

Solo se porta a V2 lo estrictamente reutilizable:

- **Esquema Supabase**: tablas `users`, `conversations`,
  `conversation_participants`, `messages`, `call_signals`, junto con
  sus políticas RLS y funciones (`is_participant`,
  `shares_conversation`).
- **JWT middleware Socket.IO** (verificación con
  `supabaseAuth.getClaims`).
- **Patrón de oscillators con tracking explícito** en tonos de llamada
  (aprendizaje de `useRingTone` V1: mantener refs de `activeOscsRef`,
  `activeGainsRef` para stop inmediato en iOS).

Todo lo demás se reescribe desde cero bajo esta arquitectura. El
código de V1 queda como referencia histórica en el tag
`spabla-stable-ot-071-targetlang-translation-2026-07-04`, no se importa
a V2.

---

## Consecuencias

- El paquete `engine/` construido en las fases 1–4 no depende de código
  V1.
- El middleware JWT se reutilizará al abrir el `server/` de
  señalización en la fase correspondiente.
- El patrón de oscillators se replicará cuando se implemente el módulo
  `ring`.
