# PREF-ACCEPTANCE · Guion operativo para Dirección

**Estado**: PENDIENTE DE FIRMA DEL JEFE. El agente entregará los pasos uno a uno; sin confirmación del Jefe no se avanza al siguiente.

**Rama candidata**: `spabla-v2/hito-9-2-4-client-stability`.
**Entorno**: Supabase local · Next dev local · conversación fixture vacía · `OPENAI_API_KEY` desactivado (proveedor bloqueado).

Cada paso es **una sola acción visible**. El Jefe responde «OK» o «FALLO» y el agente entrega el siguiente.

---

## §1. Los 10 pasos

1. En el navegador A (ventana normal) abrir `http://localhost:3000/v2/chat` e iniciar sesión con las credenciales del actor A. **Esperado**: aparece el chat con los idiomas guardados de A (los que estén persistidos, o los defaults `es/en` si es la primera vez).
2. Cambiar «Yo escribo en» a **Català** y «Leer mensajes en» a **Deutsch**. **Esperado**: ambos selectores actualizan sin errores.
3. Pulsar Cmd+R (recarga completa). **Esperado**: los selectores vuelven a **Català / Deutsch** sin flicker.
4. Pulsar «Cerrar sesión» en la cabecera. **Esperado**: aparece el bloque de sign-in.
5. En un navegador B (ventana privada / segundo navegador) abrir la misma URL e iniciar sesión con las credenciales del actor B. **Esperado**: aparece el chat con los idiomas de B (defaults canónicos si primera vez, o su preferencia previa).
6. Verificar que B NO ve **Català / Deutsch**. **Esperado**: los selectores muestran los idiomas propios de B, no los de A.
7. En B, invalidar la sesión: el agente ejecuta un comando controlado (SQL `admin.auth.admin.signOut(userId_of_B)` sobre Supabase local o inducción equivalente). El Jefe sólo observa el navegador B. **Esperado**: dentro de ~1,5 s la app muestra el aviso «Tu sesión ha caducado. Vuelve a iniciar sesión» y aparece el bloque de sign-in.
8. En B, filtrar la pestaña Network por `/api/v2/messages`. Contar los 401 emitidos tras la invalidación. **Esperado**: como máximo **1 respuesta 401** — cero bucle.
9. En B, iniciar sesión de nuevo con las credenciales de B. **Esperado**: los selectores muestran los mismos idiomas que B tenía antes de la caducidad (paso 5–6).
10. Volver al navegador A y verificar que los selectores siguen mostrando **Català / Deutsch**, sin contaminación con los de B. **Esperado**: A conserva su par intacto.

---

## §2. Firma del Jefe

Rellenar sólo cuando los 10 pasos hayan pasado sin observaciones.

| Paso | Resultado (OK / FALLO + nota) | Firma / iniciales |
|---|---|---|
| 1 | | |
| 2 | | |
| 3 | | |
| 4 | | |
| 5 | | |
| 6 | | |
| 7 | | |
| 8 | | |
| 9 | | |
| 10 | | |

Con los 10 en OK y firma final del Jefe, PREF-ACCEPTANCE queda **COMPLETADA Y FIRMADA**. Sin firma, permanece **PENDIENTE DE DIRECCIÓN**.
