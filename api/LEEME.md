# Subida de preguntas (pantalla *Subir Preguntas*)

Una sola caja para todo: arrastras el Word **o** pegas el texto, pulsas un botón y las
preguntas salen a la vista previa. **No cuesta dinero.**

**Antes:** crear tema → seleccionar tema → abrir DeepSeek → pegar → copiar el resultado →
volver a la plataforma → pegar → Procesar Texto → Asignar
**Ahora:** crear tema → seleccionar tema → soltar el Word o pegar el texto → Procesar → Asignar

## Por qué Gemini y no Claude

Extraer preguntas es **copiar bien**, no razonar: hay que encontrar el enunciado, las cuatro
opciones y ver cuál está señalada. Un modelo pequeño lo hace igual que uno caro.

Google regala un cupo diario de Gemini Flash, y el uso de la plataforma cabe de sobra dentro
de ese cupo. Así que subir preguntas pasó de costar ~0,30 $ por documento a costar **cero**.

El precio real del plan gratuito es que Google puede usar lo enviado para mejorar sus modelos.
Es la misma exposición que había antes pegando las preguntas en la web de DeepSeek.

## Configuración (una sola vez)

1. Entra en **[Google AI Studio](https://aistudio.google.com/apikey)** con tu cuenta de Google
   y pulsa *Create API key*. No pide tarjeta.
2. En Vercel: proyecto → *Settings* → *Environments* → **Production** → *Environment Variables*.
3. Después **redespliega** (Deployments → ⋯ → Redeploy) para que la variable se cargue.

| Variable | Contenido | Obligatoria |
|---|---|---|
| `GEMINI_API_KEY` | Clave de Google AI Studio | Sí |
| `GEMINI_API_KEY_2` | Segunda clave, de otra cuenta de Google | No |
| `GEMINI_MODELO` | Fuerza un modelo concreto (ej. `gemini-2.5-flash`) | No |

La clave vive solo en el servidor de Vercel; nunca llega al navegador.

### Para qué sirve la segunda clave

Cada cuenta de Google tiene su propio cupo diario. Si pones una segunda clave y la primera
agota el cupo, la función pasa a la siguiente sola, sin avisar. Solo cuando se agotan **todas**
aparece el mensaje de "cupo agotado por hoy".

No hace falta salvo que vayas a subir muchísimo en un mismo día.

## Cuánto cupo se gasta

El texto se trocea en lotes de 12 preguntas y **cada lote es una petición**.

| Documento | Peticiones |
|---|---|
| 25 preguntas | 3 |
| 100 preguntas | 9 |

El cupo diario del plan gratuito está en varios cientos de peticiones, así que el techo real
son decenas de documentos al día. El límite que sí se puede rozar es el de **peticiones por
minuto**: por eso los lotes van de 2 en 2 con una pausa de 1,2 s entre medias
(`LOTES_EN_PARALELO` y `PAUSA_ENTRE_LOTES_MS` en `js/tests.js`).

Si algún día Google cambia las cifras, se ven en tiempo real en
[el panel de AI Studio](https://aistudio.google.com/rate-limit).

## Qué hace el modelo con el texto

- Elimina la numeración (`1.-`, `12)`, `Pregunta 12`) y los identificadores tipo `(8976)`.
- Deja el enunciado terminado en `:`.
- **Detecta la respuesta correcta** por cualquiera de estas tres señales, por este orden:
  1. La **cita del artículo** que la academia añade al final de la opción correcta (`Art. 84.2 LEC.`).
  2. Una **marca tipográfica**: asteriscos, `[X]`, `(correcta)`.
  3. Una **solución declarada** en el texto o un solucionario al final.
- **Borra** del texto de la opción la cita o la marca que la delataba, para que quede igual que las demás.
- Distingue esa cita de los artículos que forman parte de la redacción de la respuesta, que se conservan.
- Quita los comentarios entre paréntesis de la academia.
- Corrige erratas evidentes del original.
- Si no encuentra ninguna señal, deduce la correcta y **la marca en el panel de avisos amarillo**
  para que la revises antes de asignarla.

## Detalles técnicos

- Modelo: el primero disponible de `gemini-flash-latest`, `gemini-2.5-flash`, `gemini-2.0-flash`.
  Google jubila modelos cada pocos meses; si el primero desaparece se prueba el siguiente en
  vez de dejar la plataforma muerta.
- Salida estructurada con `responseSchema`: la respuesta es siempre JSON válido con cuatro
  opciones y una letra. No hay texto libre que interpretar, así que no se pierden preguntas
  por un formato inesperado.
- `temperature: 0` y razonamiento desactivado: queremos transcripción fiel, no creatividad.
- El cuerpo de la petición se monta en tres versiones de más a menos completa. Si el modelo de
  turno no admite una opción, se prueba la siguiente en lugar de fallar.
- Filtros de contenido desactivados: los temarios de penal y violencia de género los disparaban.
- Cada lote es una petición HTTP independiente: evita el límite de tiempo de Vercel y permite
  mostrar progreso real.
- Si el texto **no viene numerado**, se trocea por tamaño (6.000 caracteres) y se le pide al
  modelo que cuente él las preguntas. Así funciona con apuntes o PDF copiados.
- Si el documento trae un **solucionario al final** (`SOLUCIONES: 1-b, 2-c...`), se separa antes
  de trocear y se adjunta a **todos** los lotes. Si no, solo lo vería el último y las preguntas
  de los primeros se quedarían sin respuesta. Se considera solucionario únicamente si aparece
  en el último tercio del texto y ocupa menos de 2.000 caracteres, para no confundirlo con una
  frase suelta que mencione "respuestas".
- Ante un error temporal (429 por ritmo, o servidor saturado) se reintenta tras la pausa que
  indica Google, o doblando la espera.
- El endpoint solo acepta peticiones del propio dominio de la plataforma o de localhost, y
  exige sesión iniciada de Firebase.

## Si algo falla

| Mensaje | Causa |
|---|---|
| `Falta la variable de entorno GEMINI_API_KEY` | No se guardó la variable en Vercel o no se redesplegó. |
| `Se ha agotado el cupo gratuito de Google por hoy` | Se reinicia esa misma noche. Para no esperar, añade `GEMINI_API_KEY_2`. |
| `La clave de Google no es válida` | Clave mal copiada o borrada en AI Studio. |
| `Origen no autorizado` | La plataforma se sirve desde otro dominio: añádelo a `ORIGENES_EXTRA_PERMITIDOS` en `api/_claude.js`. |
| `No se ha detectado ninguna pregunta` | El texto no tiene formato de test, o está vacío. |
| `La respuesta se cortó por longitud` | Bajar `PREGUNTAS_POR_LOTE` de 12 a 8. |
| `Google ha bloqueado el contenido` | Un filtro de seguridad saltó pese a estar desactivado. Sube ese tema por partes. |

## Archivos implicados

| Archivo | Qué hace |
|---|---|
| `api/_gemini.js` | Módulo interno: llamada a Gemini, reintentos, cambio de clave y de modelo. No es un endpoint (Vercel ignora los archivos que empiezan por `_`). |
| `api/procesar-preguntas.js` | Trocea el texto, llama a Gemini y devuelve las preguntas en el formato de la plataforma. |
| `api/_auth.js` | Comprueba que quien llama tiene sesión iniciada. |
| `tests.html` | La caja única de subida (`#zonaWord` + `#textoPreguntas`) y sus estilos. |
| `js/tests.js` | `procesarEntrada()`, el camino común para Word y texto pegado. |
| `vercel.json` | Da 60 s de margen a la función. |

---

# El resto de funciones siguen con Claude

Subir preguntas ya no gasta saldo de Anthropic, pero **estas sí**, y siguen igual:

- `api/explicacion.js` — explicaciones de preguntas (`claude-opus-4-8`).
- `api/generar-preguntas-ia.js` — preguntas inventadas a partir del tema digital.
- `api/preguntas-rival.js` — multijugador.
- `api/asistente.js` — el asistente de la plataforma.
- `api/tts.js` — audios.

Todas comparten `api/_claude.js` (control de origen, encadenado de las dos cuentas de Anthropic
y reintentos) y `api/_consumo.js` (registro de gasto por usuario en Firestore).

Las variables `ANTHROPIC_API_KEY` y `ANTHROPIC_API_KEY_2` **siguen siendo necesarias** para
esas funciones. Si se agota el saldo, la subida de preguntas seguirá funcionando igual, porque
ya no depende de ellas.

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
