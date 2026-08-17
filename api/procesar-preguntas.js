// ============================================================
//  /api/procesar-preguntas.js
//  Función Serverless de Vercel
//
//  Convierte CUALQUIER texto con preguntas tipo test en el
//  formato que usa la plataforma, usando Claude Opus 4.8.
//
//  Da igual de dónde venga el texto: un Word de academia, un PDF
//  copiado, apuntes propios, un correo. El modelo se encarga de
//  entenderlo; la plataforma ya no depende de que el texto venga
//  escrito de una forma concreta.
//
//  ANTES USABA GEMINI FLASH y se cambió porque el cupo gratuito de
//  Google (20 peticiones al día por modelo) obligaba a meter 25
//  preguntas en cada petición. Esa era la causa real de los 504:
//  generar 25 preguntas son unos 4.000 tokens de salida, y eso no
//  cabía en los 60 segundos que Vercel le da a la función. Ahora se
//  paga por token en vez de por petición, así que el número de
//  peticiones da igual y los lotes pueden ser pequeños.
//
//  Requiere ANTHROPIC_API_KEY en Vercel (y opcionalmente
//  ANTHROPIC_API_KEY_2). El tiempo máximo va en vercel.json.
// ============================================================

const MODELO = 'claude-opus-4-8';

/* Extraer preguntas es COPIAR BIEN, no razonar: el modelo transcribe lo
   que ya está escrito y decide cuál es la correcta a partir de una marca
   que también está en el texto. Con esfuerzo bajo va mucho más rápido y
   la transcripción sale igual de fiel, que es justo lo que interesa
   cuando el enemigo es el reloj de Vercel. */
const ESFUERZO = 'low';

/* Lotes pequeños a propósito. El techo de Vercel son 60 segundos y lo
   que marca el tiempo es la SALIDA: unas 250 fichas por pregunta. Con 8
   preguntas son ~2.000 tokens, que Opus escribe de sobra dentro del
   presupuesto. Subir esto es volver a los 504. */
const PREGUNTAS_POR_LOTE = 8;
const MAX_TOKENS = 8000;
const MAX_CARACTERES_BLOQUE = 8000;  // corte de emergencia si no hay numeración

/* Presupuesto propio, por debajo del maxDuration de vercel.json. Si se
   agota, la función corta ELLA y responde un JSON con un mensaje que se
   entiende. Antes se limitaba a agotar el minuto y Vercel devolvía un
   504 sin cuerpo, que en el navegador aparecía como el críptico "El
   servidor devolvió una respuesta inesperada (504)". */
const PRESUPUESTO_MS = 50000;

const { peticionValida, obtenerCuentas, llamarClaude } = require('./_claude');
const { usuarioConCupo } = require('./_auth');
const { anotarConsumo } = require('./_consumo');

// ------------------------------------------------------------
//  Instrucciones para el modelo
// ------------------------------------------------------------
const INSTRUCCIONES = `Eres un extractor de preguntas tipo test de oposiciones españolas (Administración de Justicia). Recibes un texto en bruto que puede venir de cualquier sitio: un Word de academia, un PDF copiado, apuntes, una web o un correo. Devuelves las preguntas estructuradas.

REGLAS DE EXTRACCIÓN

1. NUMERACIÓN E IDENTIFICADORES
   - Las preguntas pueden ir numeradas de muchas formas: "12.-", "12.", "12)", "Pregunta 12", "12 (8932)", o sin numerar.
   - NO incluyas nunca esa numeración ni los identificadores entre paréntesis en el texto de la pregunta.

2. TEXTO DE LA PREGUNTA
   - Transcríbelo literalmente, sin resumir ni reformular.
   - Debe terminar SIEMPRE con dos puntos ":". Si en el original termina con "?" conserva el signo y añade los dos puntos ("...resuelva?:").
   - Corrige únicamente erratas evidentes de mecanografía del original (por ejemplo "acoradrá" -> "acordará"). No cambies nada más.

3. OPCIONES
   - Son cuatro. Pueden venir marcadas como a) b) c) d), A. B. C. D., 1) 2) 3) 4), con guiones o con viñetas.
   - En el array "opciones" van SIEMPRE en el orden original y SIN el prefijo de letra o número.
   - Transcríbelas literalmente.
   - Si una pregunta tiene menos o más de cuatro opciones, devuélvela igual con las que tenga. Ya se avisará después.

4. CÓMO SE IDENTIFICA LA RESPUESTA CORRECTA  (regla crítica)
   Busca, POR ESTE ORDEN, cualquiera de estas señales:

   a) CITA LEGAL SUELTA, SIN PARÉNTESIS. Es el caso típico de los Word de academia: la opción correcta lleva al final la referencia al precepto en el que se apoya, escrita directamente y sin paréntesis. Ejemplos: "Art. 84.2 LEC.", "Art. 52.1º.6ª LEC.", "Art. 2.2 LJV.", "Art. 87.1 LOTC.", "Art. 236 LOPJ."

      MUY IMPORTANTE — LOS PARÉNTESIS LO CAMBIAN TODO:
      Una cita ENTRE PARÉNTESIS, como "(Art. 131 LEC).", NO señala la respuesta correcta. Es una nota de apoyo que la academia pone sobre las demás opciones, y suele aparecer en varias a la vez.
      Por tanto: si en una pregunta hay varias opciones con cita, la correcta es la que la lleva SUELTA (sin paréntesis), y las que la llevan entre paréntesis se descartan como candidatas.
      Esto pasa sobre todo en las preguntas del tipo "Señale la afirmación que resulte INCORRECTA": ahí la academia pone entre paréntesis el precepto de las tres afirmaciones verdaderas, y deja la cita suelta en la falsa, que es la que hay que marcar como correcta.
      Ejemplo real:
        a) La publicidad de los edictos... Art. 236 LOPJ.          <- SUELTA  -> esta es la correcta
        b) Se considerarán urgentes... (Art. 131 LEC).             <- entre paréntesis
        c) Las actuaciones de carácter reservado... (Art. 140 LEC). <- entre paréntesis
        d) En ningún caso podrá el tribunal... (Art. 227 LEC).      <- entre paréntesis
   b) MARCA TIPOGRÁFICA sobre una opción: asteriscos (**), negrita marcada con símbolos, "[X]", "(correcta)", una X delante, mayúsculas anómalas.
   c) SOLUCIÓN DECLARADA en el propio texto: "Respuesta correcta: B", "Solución: b)", "R: 3", o un solucionario al final del documento que relacione número de pregunta con letra.

   Cuando encuentres cualquiera de esas señales, devuelve esa letra en "respuestaCorrecta" (A, B, C o D, según la POSICIÓN de la opción en el array) y marca "marcaDetectada": true.

5. LIMPIEZA DE TODAS LAS OPCIONES  (regla crítica)
   - ELIMINA la cita legal del final de CUALQUIER opción que la lleve, no solo de la correcta. Da igual si va suelta o entre paréntesis: las citas son anotaciones de la academia y NUNCA deben aparecer en el texto devuelto. Todas las opciones tienen que quedar limpias e indistinguibles entre sí, para que al hacer el test no se adivine la respuesta por la cita.
       Original:  "Al tribunal que conozca del proceso más antiguo. Art. 79. LEC."
       Devuelto:  "Al tribunal que conozca del proceso más antiguo."
       Original:  "Se considerarán urgentes las actuaciones del tribunal... (Art. 131 LEC)."
       Devuelto:  "Se considerarán urgentes las actuaciones del tribunal..."
   - Elimina la cita SOLO cuando va al final como referencia. Si el precepto forma parte de la redacción de la respuesta (por ejemplo "Si verifica la concurrencia de los requisitos del párrafo tercero del artículo 87 ter de la Ley Orgánica del Poder Judicial"), CONSÉRVALO, porque es parte del contenido.
   - Elimina también los comentarios aclaratorios añadidos entre paréntesis después de la cita. Ejemplos:
       Original:  "Ninguna es correcta. Art. 54.2 LEC. (Serían las dos correctas si la pregunta se refiriera a la sumisión expresa)."
       Devuelto:  "Ninguna es correcta."
       Original:  "Sí puede hacerlo, siempre y cuando no perjudique la competencia del Juez. Art. 275 LOPJ. (También relacionado el artículo 169 LEC)."
       Devuelto:  "Sí puede hacerlo, siempre y cuando no perjudique la competencia del Juez."
   - Elimina las marcas tipográficas (asteriscos, "[X]", "(correcta)") de la opción. El texto devuelto debe quedar limpio, igual que las demás.
   - Antes de devolver la pregunta, repasa las cuatro opciones: si alguna sigue conteniendo "Art." seguido de un número al final, no has terminado.

6. SI NO HAY NINGUNA SEÑAL
   - Deduce la correcta por tus conocimientos jurídicos y marca "marcaDetectada": false.
   - Nunca dejes una pregunta sin respuesta correcta.

7. QUÉ NO HACER
   - No inventes preguntas ni opciones que no estén en el texto.
   - No añadas explicaciones, comentarios ni encabezados.
   - No omitas ninguna pregunta del fragmento recibido.
   - No incluyas en la lista el solucionario ni los enunciados de relleno: solo preguntas de verdad con sus opciones.`;

// ------------------------------------------------------------
//  Esquema que Claude está obligado a respetar.
//  JSON Schema estándar (tipos en minúsculas y additionalProperties
//  en false), que es lo que espera "output_config.format".
// ------------------------------------------------------------
const SCHEMA = {
    type: 'object',
    properties: {
        preguntas: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    texto: {
                        type: 'string',
                        description: 'Enunciado de la pregunta, sin numeración ni identificador, terminado en ":"'
                    },
                    opciones: {
                        type: 'array',
                        description: 'Las opciones en su orden original, sin prefijo de letra y sin la cita legal ni marcas en la correcta',
                        items: { type: 'string' }
                    },
                    respuestaCorrecta: {
                        type: 'string',
                        description: 'Letra de la opción correcta según su posición en el array',
                        enum: ['A', 'B', 'C', 'D']
                    },
                    marcaDetectada: {
                        type: 'boolean',
                        description: 'true si la correcta venía señalada en el original (cita legal, marca o solucionario); false si se ha deducido'
                    }
                },
                required: ['texto', 'opciones', 'respuestaCorrecta', 'marcaDetectada'],
                additionalProperties: false
            }
        }
    },
    required: ['preguntas'],
    additionalProperties: false
};

// ------------------------------------------------------------
//  Trocea el texto en preguntas individuales.
//
//  Si el texto viene numerado, se corta por preguntas y sabemos
//  cuántas hay. Si no (apuntes sueltos, formatos raros), se corta
//  por tamaño y se deja que el modelo cuente.
// ------------------------------------------------------------
function dividirEnPreguntas(textoBruto) {
    const { cuerpo: texto, solucionario } = separarSolucionario(
        String(textoBruto || '').replace(/\r/g, '')
    );

    // Patrones ordenados de más específico a más genérico.
    // OJO: en el Word de academia las preguntas van seguidas sin salto
    // de línea ("...desde el principio.2.- (29522) En el ámbito civil..."),
    // por eso no se puede exigir un espacio delante del número.
    const patrones = [
        /(\d{1,3})\s*\.\s*-\s*\(\s*\d+\s*\)/g,             // "12.- (8932)"
        /(?:^|[\s\n.;:])(\d{1,3})\s*\.\s*-\s+/g,           // "12.- "
        /(?:^|\n)\s*(?:pregunta|cuestión)\s*n?º?\s*(\d{1,3})\s*[.):-]?\s+/gi, // "Pregunta 12"
        /(?:^|\n)\s*(\d{1,3})\s*[.)\-]\s+/g                // "12. ", "12) ", "12- "
    ];

    let mejores = [];
    for (const patron of patrones) {
        const encontrados = [...texto.matchAll(patron)];
        if (encontrados.length > mejores.length) mejores = encontrados;
        if (mejores.length >= 2) break;
    }

    if (mejores.length >= 2) {
        // Nos quedamos solo con la secuencia correlativa (1, 2, 3...) para
        // descartar falsos positivos como "Art. 77.3 LEC"
        const secuencia = [];
        let esperado = null;
        for (const coincidencia of mejores) {
            const n = parseInt(coincidencia[1], 10);
            if (esperado === null || n === esperado) {
                secuencia.push(coincidencia);
                esperado = n + 1;
            }
        }

        if (secuencia.length >= 2) {
            const bloques = [];
            for (let i = 0; i < secuencia.length; i++) {
                const inicio = secuencia[i].index;
                const fin = (i + 1 < secuencia.length) ? secuencia[i + 1].index : texto.length;
                const bloque = texto.slice(inicio, fin).trim();
                if (bloque) bloques.push(bloque);
            }
            return { bloques, numeradas: true, solucionario };
        }
    }

    // Sin numeración fiable: se corta por tamaño, respetando líneas
    return { bloques: trocearPorTamano(texto), numeradas: false, solucionario };
}

// ------------------------------------------------------------
//  Muchos documentos traen las respuestas en una tabla al final
//  ("SOLUCIONES: 1-b, 2-c, 3-a"). Como el texto se procesa por
//  lotes, ese final solo lo vería el último lote y las preguntas
//  de los primeros se quedarían sin respuesta.
//
//  Se separa antes de trocear para poder adjuntarlo a TODOS los
//  lotes. Solo se considera solucionario si aparece en el último
//  tercio del texto: si no, sería un encabezado cualquiera.
// ------------------------------------------------------------
function separarSolucionario(texto) {
    const patron = /\n[^\S\n]*(?:soluciones?|solucionario|respuestas\s+correctas|plantilla\s+de\s+respuestas)\b[^\n]*\n?/gi;

    let corte = -1;
    for (const encontrado of texto.matchAll(patron)) {
        if (encontrado.index > texto.length * 0.66) { corte = encontrado.index; break; }
    }

    if (corte === -1) return { cuerpo: texto, solucionario: null };

    const solucionario = texto.slice(corte).trim();

    // Un solucionario es una lista corta de pares número-letra. Si lo que
    // viene detrás es largo, es texto normal y no hay que tocarlo.
    if (solucionario.length > 2000) return { cuerpo: texto, solucionario: null };

    return { cuerpo: texto.slice(0, corte), solucionario };
}

function trocearPorTamano(texto) {
    const lineas = texto.split('\n');
    const bloques = [];
    let actual = '';

    for (const linea of lineas) {
        if (actual.length + linea.length > MAX_CARACTERES_BLOQUE && actual.trim()) {
            bloques.push(actual.trim());
            actual = '';
        }
        actual += linea + '\n';
    }
    if (actual.trim()) bloques.push(actual.trim());

    return bloques.length > 0 ? bloques : [texto.trim()].filter(Boolean);
}

function agruparEnLotes(bloques, tam) {
    const lotes = [];
    for (let i = 0; i < bloques.length; i += tam) {
        lotes.push(bloques.slice(i, i + tam));
    }
    return lotes;
}

// ------------------------------------------------------------
//  Convierte la salida del modelo al formato de la plataforma
// ------------------------------------------------------------
const LETRAS = ['A', 'B', 'C', 'D'];

function aFormatoPlataforma(preguntasModelo, numeroInicial) {
    const validas = [];
    const avisos = [];
    let numero = numeroInicial;

    preguntasModelo.forEach((p, idx) => {
        const opciones = Array.isArray(p.opciones) ? p.opciones : [];
        const letraCorrecta = String(p.respuestaCorrecta || '').toUpperCase();
        const referencia = (p.texto || `pregunta ${idx + 1}`).slice(0, 70);

        if (opciones.length !== 4) {
            avisos.push(`Descartada (tiene ${opciones.length} opciones en vez de 4): "${referencia}..."`);
            return;
        }
        if (!LETRAS.includes(letraCorrecta)) {
            avisos.push(`Descartada (respuesta correcta no válida): "${referencia}..."`);
            return;
        }
        if (!p.texto || !p.texto.trim()) {
            avisos.push(`Descartada (sin enunciado): pregunta ${idx + 1} del lote`);
            return;
        }
        if (p.marcaDetectada === false) {
            avisos.push(`Revisar: en el original no venía marcada la correcta, se ha deducido -> "${referencia}..."`);
        }

        let texto = p.texto.trim();
        if (!texto.endsWith(':')) texto += ':';

        validas.push({
            numero: numero++,
            texto: texto,
            opciones: opciones.map((opcion, i) => ({
                letra: LETRAS[i],
                texto: String(opcion).trim(),
                esCorrecta: LETRAS[i] === letraCorrecta
            })),
            respuestaCorrecta: letraCorrecta
            // fechaCreacion la añade el navegador (Firestore necesita un objeto Date)
        });
    });

    return { validas, avisos };
}

// ------------------------------------------------------------
//  Handler HTTP
// ------------------------------------------------------------
module.exports = async function handler(req, res) {
    if (!peticionValida(req, res)) return;

    const usuario = await usuarioConCupo(req, res);
    if (!usuario) return;

    const cuentas = obtenerCuentas();
    if (cuentas.length === 0) {
        return res.status(500).json({
            error: 'Falta la variable de entorno ANTHROPIC_API_KEY en Vercel.'
        });
    }

    // Cronómetro propio: aborta la llamada antes de que lo haga Vercel
    const reloj = new AbortController();
    const alarma = setTimeout(() => reloj.abort(), PRESUPUESTO_MS);

    try {
        const cuerpo = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
        const texto = cuerpo.texto;
        const lote = Number.isInteger(cuerpo.lote) ? cuerpo.lote : 0;

        if (!texto || String(texto).trim().length < 40) {
            return res.status(400).json({ error: 'El texto está vacío o es demasiado corto para contener preguntas.' });
        }

        const { bloques, numeradas, solucionario } = dividirEnPreguntas(texto);
        const lotes = agruparEnLotes(bloques, numeradas ? PREGUNTAS_POR_LOTE : 1);

        if (lotes.length === 0) {
            return res.status(400).json({ error: 'No se ha detectado ninguna pregunta en el texto.' });
        }
        if (lote < 0 || lote >= lotes.length) {
            return res.status(400).json({ error: `Lote ${lote} fuera de rango (hay ${lotes.length}).` });
        }

        const fragmento = lotes[lote].join('\n\n');
        const numPreguntas = numeradas ? lotes[lote].length : null;

        // El solucionario del final, si lo había, va con todos los lotes
        const clave = solucionario
            ? `\n\n<solucionario>\nEstas son las respuestas correctas del documento completo. Úsalas para las preguntas de este fragmento, buscándolas por su número original.\n${solucionario}\n</solucionario>`
            : '';

        // Cuando el texto viene numerado sabemos cuántas preguntas hay y se
        // lo exigimos al modelo. Cuando no, se le pide que las cuente él.
        const prompt = numPreguntas
            ? `Extrae las ${numPreguntas} preguntas de este fragmento. Devuelve exactamente ${numPreguntas} preguntas.\n\n<documento>\n${fragmento}\n</documento>${clave}`
            : `Extrae todas las preguntas tipo test que encuentres en este fragmento. Si no hay ninguna, devuelve una lista vacía.\n\n<documento>\n${fragmento}\n</documento>${clave}`;

        const { data, cuenta } = await llamarClaude({
            model: MODELO,
            max_tokens: MAX_TOKENS,
            system: INSTRUCCIONES,
            messages: [{ role: 'user', content: prompt }],
            output_config: {
                effort: ESFUERZO,
                format: { type: 'json_schema', schema: SCHEMA }
            }
        }, cuentas, { señal: reloj.signal });

        // Se anota el gasto antes de nada: la llamada ya está pagada,
        // salga bien o mal el resto
        const coste = await anotarConsumo({
            uid: usuario.uid,
            email: usuario.email,
            funcion: 'procesar-preguntas',
            modelo: MODELO,
            uso: data.usage,
            cuenta,
            detalle: { lote, caracteres: fragmento.length, preguntasEnElLote: numPreguntas }
        });

        if (data.stop_reason === 'max_tokens') {
            return res.status(500).json({
                error: 'La respuesta se cortó por longitud. Baja PREGUNTAS_POR_LOTE en el servidor.'
            });
        }

        const bloqueTexto = (data.content || []).find(b => b.type === 'text');
        if (!bloqueTexto) {
            return res.status(500).json({ error: 'Claude no devolvió contenido de texto.' });
        }

        let preguntas;
        try {
            preguntas = JSON.parse(bloqueTexto.text).preguntas || [];
        } catch (e) {
            return res.status(500).json({ error: 'Claude no ha devuelto un JSON válido.' });
        }

        // El navegador espera estos dos nombres, no los de la API
        const uso = {
            tokensEntrada: (data.usage && data.usage.input_tokens) || 0,
            tokensSalida: (data.usage && data.usage.output_tokens) || 0
        };
        const modelo = MODELO;

        // Numeración correlativa entre lotes. Sin numeración de origen no se
        // puede saber cuántas van por delante, así que el navegador renumera.
        const numeroInicial = numeradas ? lote * PREGUNTAS_POR_LOTE + 1 : 1;
        const { validas, avisos } = aFormatoPlataforma(preguntas, numeroInicial);

        if (numPreguntas && preguntas.length !== numPreguntas) {
            avisos.push(`El lote ${lote + 1} contenía ${numPreguntas} preguntas y se han extraído ${preguntas.length}.`);
        }

        console.log(`[procesar-preguntas] lote ${lote + 1}/${lotes.length} · ${validas.length} preguntas · ${modelo} · ${cuenta} · ${uso.tokensEntrada}+${uso.tokensSalida} tokens · ${coste.costeDolares} $`);

        return res.status(200).json({
            lote,
            totalLotes: lotes.length,
            totalPreguntasDetectadas: numeradas ? bloques.length : null,
            preguntas: validas,
            avisos,
            modelo,
            cuenta,
            uso,
            costeDolares: coste.costeDolares
        });

    } catch (error) {
        console.error('[procesar-preguntas]', error);

        /* Se acabó el presupuesto. Se responde 503 con un mensaje claro
           en vez de dejar que Vercel devuelva un 504 sin cuerpo. */
        if (error.abortado || error.name === 'AbortError') {
            return res.status(503).json({
                error: 'Este bloque ha tardado demasiado y se ha cortado para no agotar el tiempo del servidor. ' +
                       'Vuelve a darle a Procesar: los bloques que ya salieron bien no se repiten. ' +
                       'Si pasa siempre, el documento tiene preguntas muy largas y hay que bajar PREGUNTAS_POR_LOTE.',
                tiempoAgotado: true
            });
        }

        return res.status(error.sinSaldo ? 429 : 500).json({
            error: error.message || 'Error procesando el texto',
            sinSaldo: !!error.sinSaldo,
            enlace: error.enlace || undefined
        });

    } finally {
        clearTimeout(alarma);
    }
};
