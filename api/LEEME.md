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

### Dos organizaciones

Los saldos de organizaciones distintas no se pueden fusionar, pero la función encadena las
cuentas: usa siempre la primera y, si devuelve un error de saldo agotado, clave revocada o
límite de uso, repite la misma petición con la segunda sin que tengas que hacer nada.
Si el error es de otro tipo (por ejemplo un fallo de la petición), aborta directamente en
lugar de gastar la segunda cuenta.

La respuesta incluye el campo `cuenta` con la que se acabó usando, y la consola del navegador
lo registra al terminar cada documento.

## Coste

Unos **0,20–0,40 $** por documento de 25 preguntas con Opus 5 a esfuerzo medio.
Para abaratarlo, cambia la constante `MODELO` a `claude-sonnet-5` (cuesta unas 5 veces menos).

## Archivos implicados

| Archivo | Qué se hizo |
|---|---|
| `api/procesar-preguntas.js` | Nuevo. Llama a Claude y devuelve las preguntas ya en el formato de la plataforma. |
| `vercel.json` | Nuevo. Da 60 s de margen a la función. |
| `tests.html` | Se añadió la zona de subida (`#zonaWord`) y sus estilos. |
| `js/tests.js` | Se añadieron `inicializarSubidaWord()` y funciones auxiliares al final, más una línea de inicialización. |

No se modificó ninguna función existente. El flujo de pegar texto de DeepSeek sigue disponible.

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
