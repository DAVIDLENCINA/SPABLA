# ADR-002 — 2026-07-04 — El Engine media todos los módulos

Tipo: Decisión (ADR).
Autor: jefe de proyecto (registrado durante la introducción del
Engine en Fase 0.1).
Estado: aceptada.

---

## Contexto

`SPABLA_V2_ARCHITECTURE.md` describía trece módulos con una tabla de
dependencias directas entre ellos. `SPABLA_V2_ENGINE.md` introdujo el
Engine como núcleo del sistema. Al hacerlo, la tabla de dependencias
directas quedaba sustituida sin declaración explícita. Esta ADR
formaliza la regla que ambos documentos ya asumen.

---

## Decisión

- La tabla de dependencias del §2 de arquitectura (donde módulos
  declaraban dependencias directas) **se sustituye por: "todo módulo
  depende únicamente del Engine"**.
- El contrato `CallSession` del §3 de arquitectura queda ampliado por
  `SPABLA_V2_ENGINE.md` (§4 + §5 + §6 + §7).
- Los flujos de llamada y traducción (§4 y §5 de arquitectura) se
  reformulan mentalmente como: los módulos reaccionan a eventos del
  Engine; no ejecutan flujos por su cuenta.

---

## Consecuencias

- Ningún módulo importa a otro módulo. Todo va vía el SPABLA Engine
  (suscribiéndose a eventos o mandando comandos).
- Los módulos consumen eventos tipados; no consultan estado directamente
  (pull); reciben notificaciones (push).
