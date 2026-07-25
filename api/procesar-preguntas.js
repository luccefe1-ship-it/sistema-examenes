// ============================================================
//  /api/procesar-preguntas.js
//  Función Serverless de Vercel
//  Convierte el texto de un Word de academia en preguntas
//  con el formato que usa la plataforma, usando Claude Opus 5.
//
//  Requiere la variable de entorno ANTHROPIC_API_KEY en Vercel.
//  El tiempo máximo de ejecución se configura en vercel.json.
// ============================================================

const MODELO = 'claude-opus-5';
const ESFUERZO = 'medium';           // effort medio
const PREGUNTAS_POR_LOTE = 8;        // troceado para no agotar el tiempo
const MAX_TOKENS = 16000;

// Solo se acepta la petición si viene de la propia plataforma
// (mismo dominio que sirve la función) o de localhost mientras
// desarrollas. Así nadie puede usar tu endpoint desde otra web.
// Si algún día sirves la plataforma desde un dominio propio
// distinto, añádelo a esta lista.
const ORIGENES_EXTRA_PERMITIDOS = [];

function origenPermitido(origen, host) {
    if (!origen) return true;              // peticiones sin cabecera Origin (curl, tests)
    if (ORIGENES_EXTRA_PERMITIDOS.includes(origen)) return true;
    try {
        const { hostname, host: hostOrigen } = new URL(origen);
        if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
        return hostOrigen === host;        // mismo dominio que la propia función
    } catch (e) {
        return false;
    }
}

// ------------------------------------------------------------
//  Instrucciones para Claude (equivalente al antiguo prompt de
//  DeepSeek, pero pidiendo JSON en vez de texto formateado)
// ------------------------------------------------------------
const SYSTEM_PROMPT = `Eres un extractor de preguntas tipo test de oposiciones españolas (Administración de Justicia). Recibes el texto en bruto de un documento Word de una academia y devuelves las preguntas estructuradas.

REGLAS DE EXTRACCIÓN

1. NUMERACIÓN E IDENTIFICADORES
   - Cada pregunta empieza con un número seguido de ".-" y a veces un identificador entre paréntesis. Ejemplo: "12.- (8932) Texto de la pregunta:"
   - NO incluyas nunca ese número ni el identificador entre paréntesis en el texto de la pregunta.

2. TEXTO DE LA PREGUNTA
   - Transcríbelo literalmente, sin resumir ni reformular.
   - Debe terminar SIEMPRE con dos puntos ":". Si en el original termina con "?" conserva el signo y añade los dos puntos ("...resuelva?:").
   - Corrige únicamente erratas evidentes de mecanografía del original (por ejemplo "acoradrá" -> "acordará"). No cambies nada más.

3. OPCIONES
   - Son exactamente cuatro, marcadas a) b) c) d) en el original.
   - En el array "opciones" van en el mismo orden, SIN el prefijo "a)", "b)", etc.
   - Transcríbelas literalmente.

4. CÓMO SE IDENTIFICA LA RESPUESTA CORRECTA  (regla crítica)
   - En estos documentos, la opción correcta es la ÚNICA que lleva añadida al final la cita del precepto legal en el que se apoya. Ejemplos de esas citas: "Art. 84.2 LEC.", "Art. 52.1º.6ª LEC.", "Art. 2.2 LJV.", "Art. 87.1 LOTC.", "Art. 49.3 bis LEC."
   - Esa opción es la correcta -> devuélvela en "respuestaCorrecta" con su letra en mayúscula (A, B, C o D).
   - ELIMINA la cita legal del texto de la opción. Ejemplo:
       Original: "Al tribunal que conozca del proceso más antiguo. Art. 79. LEC."
       Devuelto: "Al tribunal que conozca del proceso más antiguo."
   - Elimina la cita SOLO cuando va al final como referencia. Si el precepto forma parte de la redacción de la respuesta (por ejemplo "Si verifica la concurrencia de los requisitos del párrafo tercero del artículo 87 ter de la Ley Orgánica del Poder Judicial"), CONSÉRVALO, porque es parte del contenido.
   - Elimina también los comentarios aclaratorios que la academia añade entre paréntesis después de la cita. Ejemplo:
       Original: "Ninguna es correcta. Art. 54.2 LEC. (Serían las dos correctas si la pregunta se refiriera a la sumisión expresa)."
       Devuelto: "Ninguna es correcta."
   - Marca "citaDetectada": true cuando hayas identificado la correcta por la cita legal.
   - Si ninguna opción lleva cita, deduce la correcta por tus conocimientos jurídicos y marca "citaDetectada": false. Nunca dejes una pregunta sin respuesta correcta.

5. QUÉ NO HACER
   - No inventes preguntas ni opciones que no estén en el texto.
   - No añadas explicaciones, comentarios ni encabezados.
   - No omitas ninguna pregunta del fragmento recibido: si el fragmento contiene 8 preguntas, devuelve exactamente 8.`;

// ------------------------------------------------------------
//  Esquema JSON que Claude está obligado a respetar
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
                        description: 'Las cuatro opciones en orden a), b), c), d), sin el prefijo de letra y sin la cita legal en la correcta',
                        items: { type: 'string' }
                    },
                    respuestaCorrecta: {
                        type: 'string',
                        description: 'Letra de la opción correcta',
                        enum: ['A', 'B', 'C', 'D']
                    },
                    citaDetectada: {
                        type: 'boolean',
                        description: 'true si la correcta se identificó por la cita legal del original'
                    }
                },
                required: ['texto', 'opciones', 'respuestaCorrecta', 'citaDetectada'],
                additionalProperties: false
            }
        }
    },
    required: ['preguntas'],
    additionalProperties: false
};

// ------------------------------------------------------------
//  Trocea el texto del Word en preguntas individuales
// ------------------------------------------------------------
function dividirEnPreguntas(textoBruto) {
    const texto = String(textoBruto || '').replace(/\r/g, '');

    // Patrones ordenados de más específico a más genérico.
    // OJO: en el Word las preguntas van seguidas sin salto de línea
    // ("...desde el principio.2.- (29522) En el ámbito civil..."),
    // por eso no se puede exigir un espacio delante del número.
    const patrones = [
        /(\d{1,3})\s*\.\s*-\s*\(\s*\d+\s*\)/g,        // "12.- (8932)"
        /(?:^|[\s\n.;:])(\d{1,3})\s*\.\s*-\s+/g,      // "12.- "
        /(?:^|\n)\s*(\d{1,3})\s*[.)]\s+/g             // "12. " o "12) "
    ];

    let mejores = [];
    for (const patron of patrones) {
        const encontrados = [...texto.matchAll(patron)];
        if (encontrados.length > mejores.length) mejores = encontrados;
        if (mejores.length >= 2) break;
    }

    if (mejores.length < 2) return [texto.trim()].filter(Boolean);

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

    const bloques = [];
    for (let i = 0; i < secuencia.length; i++) {
        const inicio = secuencia[i].index;
        const fin = (i + 1 < secuencia.length) ? secuencia[i + 1].index : texto.length;
        const bloque = texto.slice(inicio, fin).trim();
        if (bloque) bloques.push(bloque);
    }
    return bloques;
}

function agruparEnLotes(bloques, tam) {
    const lotes = [];
    for (let i = 0; i < bloques.length; i += tam) {
        lotes.push(bloques.slice(i, i + tam));
    }
    return lotes;
}

// ------------------------------------------------------------
//  Cuentas disponibles
//  Se usan en orden: si la primera se queda sin saldo (o su clave
//  deja de ser válida), se pasa automáticamente a la siguiente.
//  Los saldos de organizaciones distintas no se pueden fusionar,
//  pero así se aprovechan los dos sin tocar nada a mano.
// ------------------------------------------------------------
function obtenerCuentas() {
    return [
        { nombre: 'Luciano',     clave: process.env.ANTHROPIC_API_KEY },
        { nombre: 'Musicalbase', clave: process.env.ANTHROPIC_API_KEY_2 }
    ].filter(cuenta => cuenta.clave && cuenta.clave.trim());
}

// ¿El error justifica probar con la siguiente cuenta?
function convieneCambiar(estado, detalle) {
    if (estado === 401 || estado === 403) return true;              // clave inválida o revocada
    if (estado === 429) return true;                                 // límite de uso alcanzado
    const texto = String(detalle || '').toLowerCase();
    return texto.includes('credit balance') || texto.includes('billing');
}

// ------------------------------------------------------------
//  Llamada a la API de Claude
// ------------------------------------------------------------
async function llamarClaude(fragmento, numPreguntas, cuentas) {
    const cuerpo = JSON.stringify({
        model: MODELO,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{
            role: 'user',
            content: `Extrae las ${numPreguntas} preguntas de este fragmento de documento. Devuelve exactamente ${numPreguntas} preguntas.\n\n<documento>\n${fragmento}\n</documento>`
        }],
        output_config: {
            effort: ESFUERZO,
            format: { type: 'json_schema', schema: SCHEMA }
        }
    });

    let respuesta = null;
    let cuentaUsada = null;
    const fallos = [];

    for (const cuenta of cuentas) {
        const intento = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': cuenta.clave.trim(),
                'anthropic-version': '2023-06-01'
            },
            body: cuerpo
        });

        if (intento.ok) {
            respuesta = intento;
            cuentaUsada = cuenta.nombre;
            break;
        }

        const detalle = await intento.text();
        fallos.push(`${cuenta.nombre}: ${intento.status} ${detalle.slice(0, 200)}`);

        if (!convieneCambiar(intento.status, detalle)) {
            throw new Error(`Claude devolvió ${intento.status} con la cuenta ${cuenta.nombre}: ${detalle.slice(0, 400)}`);
        }
        console.warn(`[procesar-preguntas] Cuenta ${cuenta.nombre} descartada (${intento.status}), probando la siguiente.`);
    }

    if (!respuesta) {
        throw new Error(`Ninguna cuenta pudo procesar la petición. ${fallos.join(' | ')}`);
    }

    const data = await respuesta.json();
    data._cuentaUsada = cuentaUsada;

    if (data.stop_reason === 'max_tokens') {
        throw new Error('La respuesta se cortó por longitud. Reduce PREGUNTAS_POR_LOTE.');
    }
    if (data.stop_reason === 'refusal') {
        throw new Error('Claude rechazó la petición para este fragmento.');
    }

    const bloqueTexto = (data.content || []).find(b => b.type === 'text');
    if (!bloqueTexto) throw new Error('Claude no devolvió contenido de texto.');

    const parseado = JSON.parse(bloqueTexto.text);
    return {
        preguntas: parseado.preguntas || [],
        uso: data.usage || {},
        cuenta: cuentaUsada
    };
}

// ------------------------------------------------------------
//  Convierte la salida de Claude al formato de la plataforma
// ------------------------------------------------------------
const LETRAS = ['A', 'B', 'C', 'D'];

function aFormatoPlataforma(preguntasClaude, numeroInicial) {
    const validas = [];
    const avisos = [];
    let numero = numeroInicial;

    preguntasClaude.forEach((p, idx) => {
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
        if (p.citaDetectada === false) {
            avisos.push(`Revisar: sin cita legal en el original, la correcta se dedujo -> "${referencia}..."`);
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
    // CORS / origen
    const origen = req.headers.origin || '';
    const permitido = origenPermitido(origen, req.headers.host);

    if (origen && permitido) {
        res.setHeader('Access-Control-Allow-Origin', origen);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    // Bloquea peticiones desde otros sitios web
    if (!permitido) {
        return res.status(403).json({ error: 'Origen no autorizado: ' + origen });
    }

    const cuentas = obtenerCuentas();
    if (cuentas.length === 0) {
        return res.status(500).json({ error: 'Falta la variable de entorno ANTHROPIC_API_KEY en Vercel' });
    }

    try {
        const cuerpo = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
        const texto = cuerpo.texto;
        const lote = Number.isInteger(cuerpo.lote) ? cuerpo.lote : 0;

        if (!texto || String(texto).trim().length < 40) {
            return res.status(400).json({ error: 'El documento está vacío o no se ha podido leer su texto.' });
        }

        const bloques = dividirEnPreguntas(texto);
        const lotes = agruparEnLotes(bloques, PREGUNTAS_POR_LOTE);

        if (lotes.length === 0) {
            return res.status(400).json({ error: 'No se ha detectado ninguna pregunta en el documento.' });
        }
        if (lote < 0 || lote >= lotes.length) {
            return res.status(400).json({ error: `Lote ${lote} fuera de rango (hay ${lotes.length}).` });
        }

        const fragmento = lotes[lote].join('\n\n');
        const numPreguntas = lotes[lote].length;
        const numeroInicial = lote * PREGUNTAS_POR_LOTE + 1;

        const { preguntas, uso, cuenta } = await llamarClaude(fragmento, numPreguntas, cuentas);
        const { validas, avisos } = aFormatoPlataforma(preguntas, numeroInicial);

        if (preguntas.length !== numPreguntas) {
            avisos.push(`El lote ${lote + 1} contenía ${numPreguntas} preguntas y Claude devolvió ${preguntas.length}.`);
        }

        return res.status(200).json({
            lote,
            totalLotes: lotes.length,
            totalPreguntasDetectadas: bloques.length,
            preguntas: validas,
            avisos,
            cuenta,
            uso: {
                tokensEntrada: uso.input_tokens || 0,
                tokensSalida: uso.output_tokens || 0
            }
        });

    } catch (error) {
        console.error('[procesar-preguntas]', error);
        return res.status(500).json({ error: error.message || 'Error procesando el documento' });
    }
};
