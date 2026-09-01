# PREF-ACCEPTANCE · Instrucciones manuales para el Jefe

**Estado**: PENDIENTE DE DIRECCIÓN. Este documento es el guion que el Jefe debe ejecutar sobre su máquina. La firma corresponde exclusivamente al Jefe; el agente no la anticipa ni la sustituye.

**Rama candidata**: `spabla-v2/hito-9-2-4-client-stability` @ `1e774ebefe51261e886be06b91efda7e47d862b8`.
**Acta complementaria (checklist expandido)**: `docs/audit_reports/AUDIT_2026-08-14_pref-acceptance.md`.
**Cobertura automatizada equivalente**: 9 tests de `lib/v2/client/preference-acceptance.test.ts` + 11 tests HTTP en `app/api/v2/messages/route.integration.test.ts` (verdes en CI Job B run `31830537761`).

---

## §1. Precondiciones que el Jefe debe verificar antes de empezar

Ejecutar cada instrucción y responder mentalmente «OK» antes de continuar a la siguiente.

1. `cd /Users/davidlencina/SPABLA`.
2. `git branch --show-current` → debe imprimir `spabla-v2/hito-9-2-4-client-stability`.
3. `git rev-parse HEAD` → debe imprimir `1e774ebefe51261e886be06b91efda7e47d862b8`.
4. `docker ps --format '{{.Names}}' | grep supabase | wc -l` → debe imprimir `5` (Supabase local activo).
5. `grep -c 'OPENAI_API_KEY=' .env.development.local` → si imprime `1`, **temporalmente** comentar la línea con `#OPENAI_API_KEY=…` o cambiar el valor a vacío durante toda la acta. Esto bloquea el proveedor de forma determinista.
6. `grep 'SPABLA_V2_ENABLE_DEV_SEED' .env.development.local` → debe existir con valor `1` (necesario para regenerar el fixture demo si hace falta).
7. Cerrar cualquier sesión Chrome/navegador que tenga `spabla_v2_fase9_seed` cacheado. La forma más limpia: nueva ventana privada.
8. En una terminal separada: `npm run dev` en `/Users/davidlencina/SPABLA` y esperar a `✓ Ready in Xs`.

---

## §2. Preparación del fixture demo (obligatoria si hay mensajes preexistentes)

La conversación demo local actual contiene **64 mensajes** y **17 traducciones cacheadas**. Para que las pruebas de cambio de idioma no disparen cache-miss ni llamadas al proveedor:

9. Abrir `http://localhost:3000/v2/chat` en una ventana normal (no privada).
10. Hacer `POST /api/v2/seed` desde el DeveloperPanel (botón «Ejecutar seed»). Debe devolver 200 con `{tenantId, conversationId, actorA, actorB}`.
11. Verificar que la conversación devuelta no tiene mensajes:
    ```
    docker exec supabase_db_spabla-hito-8-2-local psql -U postgres -tAc \
      "SELECT count(*) FROM spabla_v2.messages WHERE conversation_id='<conversationId del seed>';"
    ```
    Debe imprimir `0`. Si no es 0, avisar antes de continuar.
12. Snapshot inicial:
    ```
    docker exec supabase_db_spabla-hito-8-2-local psql -U postgres -tAc \
      "SELECT count(*) FROM spabla_v2.message_translations;"
    ```
    Anotar el número `N_BEFORE` (para verificar cero incremento al final).

---

## §3. Instrucciones numeradas (una acción por paso) — Actor A

Ejecutar cada paso, uno a la vez, en la **primera ventana** (privada A). Cada paso incluye la verificación esperada.

13. Abrir `http://localhost:3000/v2/chat` en ventana privada A. Verificar que aparece el bloque de sign-in.
14. Iniciar sesión con `actorA.email` / `actorA.password` (copiados del DeveloperPanel del paso 10). Verificar que aparece la cabecera con el email del actor A.
15. Observar que los selectores por defecto muestran los idiomas del seed (por D1, ambos iguales al idioma del actor A).
16. Cambiar «Yo escribo en» a **Català** (opción `Català` en el selector).
17. Verificar en DevTools → Application → Local Storage que existe la clave `spabla_v2:language-preferences:v1:<actorA.actorId>` con valor `{"myLanguage":"ca","targetLanguage":"<idioma anterior>"}`.
18. Cambiar «Leer mensajes en» a **Deutsch**.
19. Verificar que la clave del paso 17 ahora dice `{"myLanguage":"ca","targetLanguage":"de"}`.
20. Pulsar Cmd+R (recarga de página completa).
21. Verificar que los selectores vuelven exactamente a **Català / Deutsch** sin flicker a defaults.
22. Pulsar «Cerrar sesión» en la cabecera.
23. Verificar que aparece el bloque de sign-in de nuevo.
24. Verificar que la clave `spabla_v2:language-preferences:v1:<actorA.actorId>` **sigue existiendo** con `{"myLanguage":"ca","targetLanguage":"de"}` — sin ser borrada por el sign-out.
25. Volver a iniciar sesión con `actorA.email` / `actorA.password`.
26. Verificar que los selectores muestran **Català / Deutsch** de inmediato.

---

## §4. Instrucciones numeradas — Actor B

Continuar en una **segunda ventana privada B** (dejar la ventana A abierta con la sesión A activa).

27. Abrir `http://localhost:3000/v2/chat` en ventana privada B.
28. Iniciar sesión con `actorB.email` / `actorB.password`.
29. Verificar que los selectores muestran los defaults canónicos del seed (por D1) — **NO** aparecen «Català / Deutsch».
30. Cambiar «Yo escribo en» a **Português**.
31. Cambiar «Leer mensajes en» a **Français**.
32. Verificar en DevTools → Local Storage que existe la clave `spabla_v2:language-preferences:v1:<actorB.actorId>` con `{"myLanguage":"pt","targetLanguage":"fr"}`.
33. Verificar que la clave de A del paso 24 **sigue presente e intacta**.
34. Pulsar Cmd+R en la ventana B.
35. Verificar que los selectores permanecen en **Português / Français**.

---

## §5. Vuelta a Actor A

36. Cambiar a la ventana A (la que sigue con la sesión de A).
37. Sin acción adicional, verificar que los selectores siguen mostrando **Català / Deutsch**.
38. Pulsar Cmd+R en la ventana A.
39. Verificar que los selectores siguen mostrando **Català / Deutsch** — sin contaminación con **Português / Français** de B.

---

## §6. Storage bloqueado (opcional pero recomendado)

40. Abrir una **tercera ventana** de Chrome donde localStorage esté bloqueado (por ejemplo, configurar Chrome Settings → Privacy → Site settings → Cookies → Block all cookies for this site).
41. Ir a `http://localhost:3000/v2/chat`.
42. Verificar que la UI carga sin errores visibles.
43. Iniciar sesión con `actorA.email` / `actorA.password`.
44. Verificar que los selectores caen a los **defaults canónicos** (`es/en` por el seed).
45. Cambiar selectores a **Català / Deutsch**.
46. Los selectores cambian en memoria; no se persiste (silenciosamente).
47. Pulsar Cmd+R.
48. Los selectores vuelven a defaults canónicos. **La UI no muestra ningún error**.

---

## §7. Recuperación de sesión inválida (sin bucle)

49. Volver a la ventana A (sesión activa como A).
50. Abrir DevTools → Application → Local Storage → clave `spabla_v2_fase9_auth-*` (Supabase Auth). Cortar el token: seleccionar el valor `access_token` y modificar 1 carácter del campo (para invalidar la firma JWT). Guardar.
51. Esperar al próximo tick de polling (~1,5 s). El endpoint responderá 401 real.
52. Verificar que aparece el aviso «Tu sesión ha caducado. Vuelve a iniciar sesión.» y que el bloque de sign-in aparece.
53. En la pestaña Network filtrar por `/api/v2/messages`. Verificar que **NO** hay múltiples 401s en secuencia (máximo el que disparó la recuperación + 0 adicionales, o algún tick tardío ya cancelado — verificar por contador ≤ 2 en total, no una lluvia).
54. Verificar en Local Storage que la clave `spabla_v2:language-preferences:v1:<actorA.actorId>` **sigue presente** con `{"myLanguage":"ca","targetLanguage":"de"}` — la sesión caducada no borró preferencias.
55. Iniciar sesión de nuevo como A. Los selectores muestran **Català / Deutsch**.

---

## §8. Verificación final de cero llamadas a OpenAI

56. En la pestaña Network filtrar por `api.openai.com`. Debe estar **vacía** desde el inicio de la acta.
57. Verificar el contador post-acta:
    ```
    docker exec supabase_db_spabla-hito-8-2-local psql -U postgres -tAc \
      "SELECT count(*) FROM spabla_v2.message_translations;"
    ```
    Debe imprimir el mismo `N_BEFORE` del paso 12. **Cero traducciones nuevas**.

---

## §9. Restauración del entorno tras la acta

58. Cerrar todas las ventanas del navegador usadas.
59. Descomentar `OPENAI_API_KEY` en `.env.development.local` (si el paso 5 lo modificó).
60. Detener `npm run dev` (Ctrl+C).

---

## §10. Firma pendiente del Jefe

Rellenar únicamente cuando la acta se haya ejecutado. Sin firma, el agente NO puede declarar PREF-ACCEPTANCE completada.

| Sección | Ejecutada el | Resultado | Firma |
|---|---|---|---|
| §3 Ciclo Actor A | | | |
| §4 Ciclo Actor B | | | |
| §5 Vuelta a Actor A | | | |
| §6 Storage bloqueado (opcional) | | | |
| §7 Recuperación de sesión inválida | | | |
| §8 Cero llamadas a OpenAI | | | |

---

## §11. Estado antes de la firma

- Cobertura automatizada: 9 tests deterministas (`preference-acceptance.test.ts`) + 11 tests HTTP integrados contra Supabase local (`route.integration.test.ts`) + 21 tests del store + 18 tests del planner = **59 tests verdes en Job B**.
- Auditoría de bundle: cero credenciales fixture, cero `service_role`, cero `OPENAI_API_KEY` real ni bakeado en `.next/static/**` y `.next/server/**`.
- Manual pendiente: exclusivamente los 8 puntos visuales que sólo un humano frente al navegador puede firmar.
- Sin firma, la orden operativa dicta que PREF-ACCEPTANCE permanece **PENDIENTE DE DIRECCIÓN**.
