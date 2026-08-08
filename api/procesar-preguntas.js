// ============================================================
//  /api/procesar-preguntas.js
//  Función Serverless de Vercel
//
//  Convierte CUALQUIER texto con preguntas tipo test en el
//  formato que usa la plataforma, usando Gemini Flash.
//
//  Da igual de dónde venga el texto: un Word de academia, un PDF
//  copiado, apuntes propios, un correo. El modelo se encarga de
//  entenderlo; la plataforma ya no depende de que el texto venga
//  escrito de una forma concreta.
//
//  Requiere la variable de entorno GEMINI_API_KEY en Vercel.
//  El tiempo máximo de ejecución se configura en vercel.json.
// ============================================================

const PREGUNTAS_POR_LOTE = 12;       // troceado para no agotar el tiempo
const MAX_TOKENS = 32000;
const MAX_CARACTERES_BLOQUE = 6000;  // corte de emergencia si no hay numeración

const { peticionValida, obtenerClaves, llamarGemini } = require('./_gemini');
const { usuarioConCupo } = require('./_auth');

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
//  Esquema que Gemini está obligado a respetar.
//  Formato OpenAPI (tipos en mayúsculas), que es lo que espera
//  la API de Google en "responseSchema".
// ------------------------------------------------------------
const SCHEMA = {
    type: 'OBJECT',
    properties: {
        preguntas: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    texto: {
                        type: 'STRING',
                        description: 'Enunciado de la pregunta, sin numeración ni identificador, terminado en ":"'
                    },
                    opciones: {
                        type: 'ARRAY',
                        description: 'Las opciones en su orden original, sin prefijo de letra y sin la cita legal ni marcas en la correcta',
                        items: { type: 'STRING' }
                    },
                    respuestaCorrecta: {
                        type: 'STRING',
                        description: 'Letra de la opción correcta según su posición en el array',
                        enum: ['A', 'B', 'C', 'D']
                    },
                    marcaDetectada: {
                        type: 'BOOLEAN',
                        description: 'true si la correcta venía señalada en el original (cita legal, marca o solucionario); false si se ha deducido'
                    }
                },
                required: ['texto', 'opciones', 'respuestaCorrecta', 'marcaDetectada'],
                propertyOrdering: ['texto', 'opciones', 'respuestaCorrecta', 'marcaDetectada']
            }
        }
    },
    required: ['preguntas']
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

    if (obtenerClaves().length === 0) {
        return res.status(500).json({
            error: 'Falta la variable de entorno GEMINI_API_KEY en Vercel. Créala en Google AI Studio y añádela al proyecto.'
        });
    }

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

        const { json, uso, modelo, cuenta } = await llamarGemini({
            instrucciones: INSTRUCCIONES,
            prompt,
            esquema: SCHEMA,
            maxTokens: MAX_TOKENS
        });

        const preguntas = json.preguntas || [];

        // Numeración correlativa entre lotes. Sin numeración de origen no se
        // puede saber cuántas van por delante, así que el navegador renumera.
        const numeroInicial = numeradas ? lote * PREGUNTAS_POR_LOTE + 1 : 1;
        const { validas, avisos } = aFormatoPlataforma(preguntas, numeroInicial);

        if (numPreguntas && preguntas.length !== numPreguntas) {
            avisos.push(`El lote ${lote + 1} contenía ${numPreguntas} preguntas y se han extraído ${preguntas.length}.`);
        }

        console.log(`[procesar-preguntas] lote ${lote + 1}/${lotes.length} · ${validas.length} preguntas · ${modelo} · ${cuenta} · ${uso.tokensEntrada}+${uso.tokensSalida} tokens`);

        return res.status(200).json({
            lote,
            totalLotes: lotes.length,
            totalPreguntasDetectadas: numeradas ? bloques.length : null,
            preguntas: validas,
            avisos,
            modelo,
            uso
        });

    } catch (error) {
        console.error('[procesar-preguntas]', error);
        return res.status((error.cupoAgotado || error.ritmo) ? 429 : 500).json({
            error: error.message || 'Error procesando el texto',
            cupoAgotado: !!error.cupoAgotado,
            ritmo: !!error.ritmo
        });
    }
};
