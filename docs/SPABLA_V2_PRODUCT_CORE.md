# SPABLA — Product Core

Documento de Fase 0.2. Define el ADN del producto. Ninguna decisión técnica se toma sin haber pasado antes por este documento. **Cuando un documento técnico contradiga uno de estos principios, gana este documento.**

---

## 1. ¿Qué problema resuelve SPABLA?

Dos personas que no comparten idioma no pueden **conversar**. Pueden intercambiar mensajes de texto con traductor. Pueden turnarse frases con Google Translate y un altavoz. Pueden buscar palabras sueltas en un diccionario. Nada de eso es conversar.

Conversar es hablar sin pensar en cómo hablar. Es interrumpirse con confianza, reírse a mitad de una frase, dejar un silencio y saber por qué el otro también calla. Cuando dos personas comparten idioma, todo eso es gratis: la lengua se vuelve transparente y solo queda el contenido.

SPABLA resuelve exactamente ese hueco. Devuelve la transparencia de la lengua a dos personas que no comparten idioma, para que puedan mantener una conversación normal — no una consulta traducida, no un walkie-talkie de frases sueltas: una conversación.

El problema no es traducción. El problema es fricción. Ninguna solución existente elimina la fricción — la desplazan al usuario, a la máquina, o al ritmo.

---

## 2. ¿Por qué existe SPABLA?

Porque cada día, en algún sitio del mundo, hay:

- Una abuela argentina que quiere entender qué le dice su nieta nacida en Berlín.
- Un fisioterapeuta español que atiende a un paciente ucraniano recién llegado.
- Una pareja que se conoció de vacaciones y no vive en el mismo país.
- Un adolescente italiano que hace un intercambio y quiere hablar con su familia anfitriona sin sentirse un niño.
- Un equipo de tres personas de tres países distintos que trabaja en remoto.
- Un padre viudo cuya hija se casó con alguien de otro idioma y no quiere ser un espectador en las cenas familiares.

Ninguno de ellos quiere una "app de traducción". Todos quieren lo mismo: **poder tener la conversación que tendrían si compartieran idioma**.

SPABLA existe porque hoy, en 2026, con el estado del arte disponible — STT en tiempo real, modelos de traducción de calidad, TTS con voz natural, WebRTC ubicuo — esa conversación **es técnicamente posible**. Nadie la ha construido bien porque todas las plataformas grandes (WhatsApp, Meet, Zoom, Teams, FaceTime) fueron diseñadas asumiendo idioma compartido; la traducción, cuando la incluyen, es un post-hoc que se nota, molesta y termina desactivándose.

SPABLA existe para llegar a esa gente antes de que un gigante lo haga mal.

---

## 3. Diferenciación

SPABLA no compite con las plataformas de comunicación existentes en su terreno. Compite en un problema que ellas nunca abordaron como núcleo.

### Frente a WhatsApp

WhatsApp es una app de mensajería que también hace llamadas. Asume idioma compartido. Si dos personas no lo comparten, cada una copia y pega en Google Translate. La llamada de voz no traduce nada. La videollamada tampoco. WhatsApp podría añadir traducción algún día — pero sería una función más, no el ADN. SPABLA no es "WhatsApp con traducción". SPABLA es una app cuya razón de ser **es** que los dos participantes no compartan idioma.

### Frente a Microsoft Teams

Teams tiene captions en tiempo real y traducción de captions. Es corporativa, pesada, pensada para reuniones y no para conversaciones íntimas. Requiere cuenta corporativa. La traducción es texto sobre pantalla; no hay voz traducida en tiempo real que suene natural. La sensación es "reunión con subtítulos", no conversación. SPABLA no quiere sentirse como una reunión.

### Frente a Google Meet

Meet tiene traducción de subtítulos en beta. Mismo caso: texto sobre pantalla, sin voz traducida. La UI es de sala de reuniones. Meet vive dentro del ecosistema Workspace y asume un contexto de trabajo. SPABLA quiere sentirse como llamar a tu madre.

### Frente a Zoom

Zoom tiene traducción de subtítulos en tiempo real como add-on de pago para planes empresariales. Igual que Meet: texto sobre pantalla, contexto de sala de reuniones, pensado para presentaciones y llamadas laborales. Zoom no está pensado para dos personas conversando; está pensado para muchos escuchando a uno. SPABLA solo existe para dos personas.

### Frente a FaceTime

FaceTime es magia en su terreno: llamada instantánea entre dispositivos Apple. Sin traducción. Apple podría añadirla algún día vía Apple Intelligence — pero solo entre dispositivos Apple. SPABLA es cross-platform desde el diseño. La abuela argentina no tiene iPhone; su nieta berlinesa sí. Que ambas puedan usar SPABLA es tan crítico como que la traducción funcione.

### Qué comparten todos los anteriores

Los cinco fueron diseñados para el caso "los dos participantes se entienden". La traducción, cuando existe, es un add-on visible. El usuario **sabe** que está usando una función de traducción. SPABLA invierte esa relación: la traducción no es una función, es el aire que se respira. El usuario no debería tener que activarla, configurarla, ni verla nombrada en un menú.

**SPABLA no es un producto de traducción. Es un producto de conversación. La traducción es infraestructura invisible.**

---

## 4. Flujo perfecto de usuario

Un usuario ideal, en un día normal, tiene esta experiencia. Este es el estándar contra el que se mide cualquier decisión del producto.

**Ana está en Madrid. Su hijo Luca vive en Milán con su pareja Chiara. Chiara no habla español; Ana no habla italiano. Ana quiere hablar con Chiara para preguntarle cómo llevan la mudanza.**

1. Ana desbloquea el teléfono. Toca el icono de SPABLA en la home screen.
2. La app abre directamente en la conversación con Chiara — porque es la última con la que habló. Si es la primera vez, ve un botón grande "Empezar conversación" y comparte un enlace vía WhatsApp o SMS.
3. Ve la lista de mensajes previos de texto que se han intercambiado alguna vez. Cada mensaje aparece en español, aunque Chiara lo escribiera en italiano.
4. Ana toca el botón del teléfono. Un único botón. Un único gesto.
5. Aparece una animación discreta ("llamando a Chiara") y suena un tono de llamada suave. Si Chiara no está, Ana lo verá y colgará; nada más.
6. Chiara acepta. La llamada empieza.
7. Ana dice, con voz normal, sin gritar, sin repetir: "Hola, hija, ¿cómo va la mudanza?"
8. Chiara oye — casi en tiempo real, con la voz de una intérprete natural que suena como si la conociera de siempre — "Ciao cara, come va il trasloco?" A la vez, ve una burbuja en la pantalla con el mismo texto en italiano.
9. Chiara responde: "Bene Ana, un po' stancante ma bene. La cucina è ancora un disastro."
10. Ana oye: "Bien, Ana, un poco cansado pero bien. La cocina todavía está hecha un desastre." Y ve la burbuja en español.
11. Ana se ríe. Chiara oye la risa (audio original de fondo), no una risa traducida. La risa no necesita idioma.
12. La conversación fluye durante ocho minutos. Ana no piensa una sola vez en la app. Chiara tampoco.
13. Cuando terminan, cuelgan con el mismo gesto único.
14. La conversación queda en el historial. Ana puede releer lo que dijeron. Puede tocar cualquier burbuja para ver el original si le apetece — nunca por necesidad.
15. Ana bloquea el teléfono. Se lo cuenta a su marido. Le dice "he hablado con Chiara". No dice "he usado SPABLA".

Ese es el estándar. Cualquier fricción añadida a este flujo — un menú, una elección de idioma, un botón de "activar traducción", una calibración de micrófono, una barra de configuración — es una regresión.

---

## 5. ¿Qué significa realmente "conversar" para SPABLA?

Conversar no es intercambiar información. Conversar es un acto de presencia mutua a través del habla.

Para SPABLA, "conversar" significa cinco cosas concretas:

1. **Ambas personas hablan en su propia lengua.** Nadie hace un esfuerzo de traducción mental. Nadie usa palabras "más fáciles" para que el traductor las coja. Cada uno usa su vocabulario, su acento, sus expresiones.
2. **El ritmo es humano, no de máquina.** No hay pausas artificiales para que el sistema procese. No hay "por favor, espere" auditivo. Las pausas que hay son las que las personas ponen naturalmente.
3. **Las interrupciones existen.** Cuando alguien no ha entendido, o discrepa, o se ríe, o se emociona, puede cortar al otro. Como en una conversación real.
4. **Los silencios existen.** Un silencio de tres segundos en una conversación real puede ser complicidad, reflexión, o incomodidad. SPABLA no rellena silencios con ruido de "procesando".
5. **El contenido no lingüístico se respeta.** Risas, suspiros, tono, prosodia, énfasis. Si alguien grita "¡NO ME DIGAS!", el otro tiene que percibir que fue una sorpresa alegre y no una queja fría. La voz traducida debe reflejar la emoción de la original tanto como sea posible.

Si SPABLA logra esas cinco cosas, es una app de conversación. Si falla en alguna de forma sistemática, es una app de traducción de voz — y ese es el producto que **no** queremos ser.

---

## 6. Principios absolutos del producto

Estos principios son irrebatibles. Cualquier decisión técnica que los contradiga se rechaza sin debate técnico.

1. **La conversación es primero. Todo lo demás sirve a la conversación.**
   La UI, la arquitectura, los modelos, los adaptadores — todos existen para que la conversación fluya. Si algo funciona técnicamente pero rompe la conversación, no se hace.

2. **La traducción nunca es protagonista.**
   La palabra "traducción" no aparece en la UI principal. No hay indicadores de "traduciendo…". No hay un botón para activar/desactivar la traducción. La traducción se asume, siempre, invisible.

3. **La tecnología desaparece.**
   El usuario no ve motores, no ve modelos, no ve VAD, no ve prompts, no ve latencia esperada, no ve estados de conexión salvo cuando hay un fallo bloqueante. El usuario ve dos cosas: a la otra persona y a sí mismo hablando.

4. **El usuario nunca configura nada.**
   El idioma se detecta o se pregunta una sola vez en el onboarding. La calidad de audio se ajusta sola. El motor de traducción es la decisión de la casa, no del usuario. El usuario **no debería tener ni ajustes**.

5. **Cero fricción.**
   Ningún permiso preguntado hasta el último momento posible. Ningún cartel de "¿estás seguro?". Ninguna cuenta obligatoria para probar la primera conversación. Ninguna pantalla de bienvenida con cinco pasos. La primera llamada tiene que ocurrir dentro de los primeros 60 segundos desde abrir la app.

6. **Una sola acción para llamar.**
   Un botón. Un tap. Sin menú previo de "voz o vídeo". Sin selector de idioma antes de llamar. Sin verificación previa de conexión. Un tap y llama.

7. **La voz es primaria. El texto es red de seguridad.**
   Las burbujas de texto existen para reforzar la comprensión, no para reemplazarla. Si alguien está usando SPABLA principalmente por el texto y no por la voz, algo está fallando.

8. **Ambos idiomas son ciudadanos de primera clase.**
   No hay un "idioma principal" y un "idioma traducido". Los dos hablantes son igual de importantes. La UI trata a los dos idiomas simétricamente.

9. **Los silencios se respetan.**
   Cuando nadie habla, no pasa nada. No hay animaciones esperando. No hay "escuchando…". El silencio en una conversación es información.

10. **La conversación es privada.**
    Ninguna conversación de voz se persiste como audio en servidores. Ninguna se usa para entrenar modelos. El texto se guarda para historial, pero es propiedad del usuario y borrable.

---

## 7. ¿Qué nunca hará SPABLA?

Estas son puertas cerradas. No abrimos debate sobre ellas.

- **Nunca requerirá que ambos participantes hablen el mismo idioma.** Ese es el caso que no queremos servir.
- **Nunca expondrá al usuario la elección del motor de STT, traducción o TTS.** Es una decisión de producto, no del usuario.
- **Nunca hará al usuario elegir "voz o vídeo" como pregunta previa.** Un tap = llamada. Video es un botón adicional dentro de la llamada.
- **Nunca mostrará indicadores técnicos** ("Realtime", "AI-powered", "Powered by X"). El usuario no tiene por qué saber qué hay dentro.
- **Nunca será una plataforma de broadcasting** (1-a-muchos, conferencias, webinars). SPABLA es siempre 1-a-1.
- **Nunca será un asistente conversacional.** SPABLA no tiene voz propia. SPABLA no responde. SPABLA no sugiere. SPABLA transmite entre dos humanos.
- **Nunca almacenará audio de conversaciones.** Ni para review, ni para calidad, ni para modelos.
- **Nunca venderá acceso a datos de conversación** a terceros, ni por dinero, ni por partnerships, ni por "mejora del servicio".
- **Nunca añadirá anuncios dentro de la conversación** ni de audio ni visuales.
- **Nunca cambiará el modelo de traducción sin avisar** si el cambio degrada la calidad percibida en pruebas ciegas.
- **Nunca convertirá la voz en un modelo de imitación** del usuario. La voz traducida es de un intérprete neutro, no un clon del hablante — al menos no sin consentimiento explícito y opt-in por-conversación.
- **Nunca añadirá gamificación** ("¡Buena conversación!", puntos, badges, streaks). Esto no es Duolingo.
- **Nunca colará una llamada mientras el usuario esté en modo "no molestar"** o similares señales de silencio del sistema.
- **Nunca hará "features" que solo un power user descubriría.** Si algo no es descubrible por un abuelo, no existe.

---

## 8. Decisiones irreversibles durante la vida del producto

Estas ocho decisiones fijan la identidad de SPABLA. Modificarlas cambia el producto por otro distinto, no lo evoluciona.

1. **SPABLA es 1-a-1.**
   Dos personas por conversación. Nunca tres, nunca grupos. Añadir grupos convierte a SPABLA en un producto de reuniones, y ese mercado está lleno. Nuestro terreno es la conversación íntima.

2. **SPABLA es voz-primero.**
   El chat de texto existe, pero es residencial. La llamada de voz con traducción es el corazón del producto. Si algún día el 80 % del uso fuera solo texto, SPABLA habría perdido su ADN.

3. **El idioma es una propiedad de la persona, no una elección por llamada.**
   Cada usuario tiene un idioma principal declarado una sola vez. No se elige "en qué idioma quieres esta llamada". Se llama y el sistema resuelve. Si un usuario habla varios idiomas activamente, es un caso a resolver — no un menú a añadir.

4. **La traducción es infraestructura invisible.**
   La palabra "traducción" no aparece en la UI principal jamás. Aparece únicamente en un lugar de la app: la página legal / política de privacidad. En ningún otro sitio.

5. **Sin cuenta obligatoria para la primera conversación.**
   Auth anónima o similar para arrancar. La creación de cuenta se propone después de haber tenido al menos una conversación real. El estándar es "prueba primero, regístrate si te gusta".

6. **Cross-platform desde el diseño.**
   Nunca será un producto exclusivo de una plataforma. Web + iOS + Android como mínimo. El "vale, pero solo en iPhone" no es una opción — la abuela argentina no tiene iPhone.

7. **Privacidad conversacional dura.**
   Cero persistencia de audio. Texto opcional y borrable. Sin envío de contenido de conversación a terceros. Esta decisión no se rediscute ni con inversión, ni con oportunidad comercial, ni con "modelo de negocio nuevo".

8. **La conversación pertenece a los dos usuarios, no a la plataforma.**
   Si algún día SPABLA cierra, los usuarios se llevan sus historiales exportables. La plataforma es infraestructura, no propietaria del contenido.

---

## Prioridad de este documento

Este documento tiene **prioridad sobre todos los documentos técnicos** que existen o existirán en `docs/`.

- Si `SPABLA_V2_ARCHITECTURE.md` describe un módulo que rompe uno de estos principios, se cambia la arquitectura.
- Si `SPABLA_V2_ENGINE.md` propone un contrato que hace visible la traducción o requiere configuración, se cambia el contrato.
- Si un futuro documento de fase justifica una regresión de flujo con argumento técnico, se rechaza la regresión.

Las siguientes preguntas se responden **siempre** consultando este documento primero:

- "¿Debemos añadir X feature?" → ¿La conversación mejora? ¿Sigue siendo cero fricción? ¿Preserva los principios absolutos?
- "¿Este trade-off técnico es aceptable?" → ¿El usuario percibe la técnica? ¿Se rompe la ilusión de conversación?
- "¿Cómo resolvemos este edge case?" → ¿Cómo lo resolvería un teléfono normal entre dos hispanohablantes? Aproxímate.

Un producto tiene alma cuando sus decisiones no son negociables. Este documento es el alma de SPABLA.
