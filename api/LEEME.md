# Subida de preguntas desde Word con Claude

Sustituye el paso manual por DeepSeek en la pantalla **Subir Preguntas**.

**Antes:** crear tema → seleccionar tema → convertir el Word con DeepSeek → copiar → pegar → Procesar Texto → Asignar
**Ahora:** crear tema → seleccionar tema → soltar el Word → Asignar

## Configuración (una sola vez)

En Vercel: proyecto → *Settings* → *Environments* → **Production** → *Environment Variables*.

| Variable | Contenido | Obligatoria |
|---|---|---|
| `ANTHROPIC_API_KEY` | Clave de la organización principal (Luciano) | Sí |
| `ANTHROPIC_API_KEY_2` | Clave de la organización secundaria (Musicalbase) | No |

Después **redespliega** (Deployments → ⋯ → Redeploy) para que las variables se carguen.

Las claves viven solo en el servidor de Vercel; nunca llegan al navegador.

### Dos cuentas, un solo saldo a efectos prácticos

La función encadena las cuentas: gasta la de `ANTHROPIC_API_KEY` hasta agotarla y entonces
sigue con la de `ANTHROPIC_API_KEY_2`, de forma transparente. Para ti es como si los saldos
estuvieran sumados. No se avisa de nada por el camino: **solo cuando se acaban las dos**
aparece un único mensaje con enlace de recarga.

**El orden de consumo lo decides tú:** se gasta primero la clave que pongas en
`ANTHROPIC_API_KEY`. Si quieres agotar antes una cuenta concreta, intercambia los valores de
las dos variables en Vercel.

Si el fallo es de otro tipo (petición mal formada, por ejemplo), aborta directamente en lugar
de gastar la segunda cuenta. Y ante un límite de peticiones reintenta con la misma.

La respuesta incluye el campo `cuenta` con la que se acabó usando, solo visible en la consola
del navegador, para diagnóstico.

## Coste

Unos **0,20–0,40 $** por documento de 25 preguntas con Opus 5 a esfuerzo medio.
Para abaratarlo, cambia la constante `MODELO` a `claude-sonnet-5` (cuesta unas 5 veces menos).

## Archivos implicados

| Archivo | Qué se hizo |
|---|---|
| `api/_claude.js` | Nuevo. Módulo interno compartido: control de origen, encadenado de cuentas y reintentos. No es un endpoint (Vercel ignora los archivos que empiezan por `_`). |
| `api/procesar-preguntas.js` | Nuevo. Llama a Claude y devuelve las preguntas ya en el formato de la plataforma. |
| `api/explicacion.js` | Nuevo. Genera las explicaciones de las preguntas desde el servidor. |
| `vercel.json` | Nuevo. Da 60 s de margen a las dos funciones. |
| `tests.html` | Se añadió la zona de subida (`#zonaWord`) y sus estilos. |
| `js/tests.js` | Se añadió la subida de Word, y `generarExplicacionIAModal()` pasó a usar `/api/explicacion`. |
| `js/tests-pregunta.js` | `generarExplicacionIA()` pasó a usar `/api/explicacion`. Se eliminó `obtenerClaudeApiKey()`. |

El flujo de pegar texto de DeepSeek sigue disponible como alternativa gratuita.

## Explicaciones de preguntas

Antes se generaban desde el navegador: se descargaba `claudeApiKeyWeb` de Firestore y se
llamaba a la API con la cabecera `anthropic-dangerous-direct-browser-access`. Cualquier
usuario registrado podía ver la clave en la pestaña de red del inspector.

Ahora pasan por `/api/explicacion`, con dos consecuencias:

- La clave no sale nunca del servidor.
- Las explicaciones heredan el encadenado de cuentas: si una se queda sin saldo, siguen
  funcionando con la otra.

El prompt se construye **en el servidor**, no lo manda el cliente. Es deliberado: si el
navegador pudiera enviar texto libre, el endpoint sería una pasarela gratuita a Claude para
cualquiera que lo descubriese. El cliente solo envía el enunciado, las opciones y qué letra
es la correcta.

Modelo: `claude-opus-4-8` (constante `MODELO` en `api/explicacion.js`).

## Qué hace Claude con el documento

- Elimina la numeración `1.-` y el identificador `(8976)`.
- Deja el enunciado terminado en `:`.
- Detecta la respuesta correcta por la **cita del artículo** que la academia añade al final (`Art. 84.2 LEC.`) y la **borra** del texto de la opción.
- Distingue esa cita de los artículos que forman parte de la redacción de la respuesta, que se conservan.
- Quita los comentarios entre paréntesis de la academia.
- Corrige erratas evidentes del original.
- Si una pregunta no lleva cita legal, deduce la correcta y lo indica en el panel de avisos amarillo.

## Detalles técnicos

- Modelo `claude-opus-5` con `output_config.effort: "medium"`.
- Salida estructurada con esquema JSON forzado: la respuesta siempre es JSON válido, nunca falla el parseo.
- El documento se trocea en lotes de 8 preguntas; cada lote es una petición HTTP independiente, lo que evita el límite de tiempo de Vercel y permite mostrar progreso real.
- Los lotes se procesan de 3 en 3 (constante `LOTES_EN_PARALELO` en `js/tests.js`). Un documento de 100 preguntas baja de ~7 minutos a ~2-3. Los resultados se reordenan por número de lote, así que la numeración final siempre es correlativa.
- Ante un error temporal (429 por límite de peticiones, o servidor saturado) se reintenta con la **misma** cuenta tras una pausa creciente de 1,5 s, 3 s y 6 s. Solo se cambia de cuenta si el problema es de saldo o de clave inválida.
- El endpoint solo acepta peticiones del propio dominio de la plataforma o de localhost.

## Si algo falla

| Mensaje | Causa |
|---|---|
| `Falta la variable de entorno ANTHROPIC_API_KEY` | No se guardó la variable en Vercel o no se redesplegó. |
| `Origen no autorizado` | La plataforma se sirve desde un dominio distinto: añádelo a `ORIGENES_EXTRA_PERMITIDOS`. |
| `Claude devolvió 401` | API key incorrecta. |
| `credit balance too low` | Falta saldo en la cuenta. |
| `No se ha detectado ninguna pregunta` | El Word usa una numeración distinta a `1.-`. Ajustar `dividirEnPreguntas()`. |
| `La respuesta se cortó por longitud` | Bajar `PREGUNTAS_POR_LOTE` de 8 a 5. |
