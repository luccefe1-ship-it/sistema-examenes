// ============================================================
//  /api/generar-preguntas-ia.js
//  Función Serverless de Vercel
//  Inventa preguntas tipo test a partir del texto del tema
//  digital que el usuario tiene subido, usando Claude Opus 5.
//
//  Requiere ANTHROPIC_API_KEY en Vercel (y opcionalmente
//  ANTHROPIC_API_KEY_2). El tiempo máximo va en vercel.json.
// ============================================================

const MODELO = 'claude-opus-5';
const ESFUERZO = 'medium';
const MAX_TOKENS = 16000;

// Topes anti-abuso. Este endpoint sí recibe texto del navegador
// (a diferencia de /api/explicacion, donde el prompt se arma entero
// en el servidor), así que se limita lo que puede pedirse de una vez.
const MAX_CARACTERES = 60000;
const MAX_PREGUNTAS_POR_PETICION = 10;

const { peticionValida, obtenerCuentas, llamarClaude } = require('./_claude');
const { usuarioConCupo } = require('./_auth');
const { anotarConsumo } = require('./_consumo');

const SYSTEM_PROMPT = `Eres un redactor de preguntas tipo test para oposiciones españolas de la Administración de Justicia (Tramitación y Gestión Procesal y Administrativa).

Recibes fragmentos del temario de un opositor y debes redactar preguntas de examen sobre ESE contenido.

REGLAS

1. FIDELIDAD AL TEXTO
   - Pregunta ÚNICAMENTE sobre lo que aparece en los fragmentos recibidos. No añadas conocimientos externos ni normativa que no esté citada.
   - La respuesta correcta debe poder justificarse leyendo el fragmento. Nada de deducciones que exijan información que no está.
   - Si un fragmento no da para una pregunta con sustancia, usa otro fragmento antes que inventar.

2. ESTILO DEL ENUNCIADO
   - Redacción de examen oficial: directa, impersonal y sin rodeos.
   - Termina SIEMPRE en dos puntos ":". Si es interrogativa, conserva el signo y añade los dos puntos ("...resolverá?:").
   - PROHIBIDO referirse al material: nada de "según el texto", "de acuerdo con el fragmento", "el documento indica". La pregunta debe leerse como si viniera de un examen real.
   - No numeres las preguntas.

3. OPCIONES
   - Exactamente cuatro, sin el prefijo "a)", "b)", etc.
   - Una sola correcta, literal o fielmente equivalente a lo que dice el fragmento.
   - Los tres distractores deben ser verosímiles y del mismo registro y longitud aproximada que la correcta: plazos parecidos, órganos parecidos, trámites parecidos. Nada de opciones absurdas o descartables de un vistazo.
   - No uses "Todas son correctas" ni "Ninguna es correcta" en más de una pregunta de cada diez.
   - Varía la letra correcta entre preguntas: no la concentres en una sola.

4. COBERTURA
   - Reparte las preguntas entre los distintos fragmentos recibidos. No hagas todas del primero.
   - Prioriza lo memorizable de una oposición: plazos, competencias, órganos, mayorías, requisitos, excepciones y numeraciones de artículos cuando el texto las dé.
   - No repitas el mismo dato en dos preguntas.

5. QUÉ NO HACER
   - No expliques nada, no comentes, no añadas encabezados.
   - No devuelvas menos preguntas de las pedidas.`;

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
                        description: 'Enunciado de la pregunta, sin numeración, terminado en ":"'
                    },
                    opciones: {
                        type: 'array',
                        description: 'Las cuatro opciones en orden, sin el prefijo de letra',
                        items: { type: 'string' }
                    },
                    respuestaCorrecta: {
                        type: 'string',
                        description: 'Letra de la opción correcta',
                        enum: ['A', 'B', 'C', 'D']
                    }
                },
                required: ['texto', 'opciones', 'respuestaCorrecta'],
                additionalProperties: false
            }
        }
    },
    required: ['preguntas'],
    additionalProperties: false
};

const LETRAS = ['A', 'B', 'C', 'D'];

// Pasa la salida de Claude al formato que usa la plataforma
function aFormatoPlataforma(preguntasClaude, nombreTema) {
    const validas = [];
    const avisos = [];

    preguntasClaude.forEach((p, idx) => {
        const opciones = Array.isArray(p.opciones) ? p.opciones : [];
        const referencia = (p.texto || `pregunta ${idx + 1}`).slice(0, 70);

        if (opciones.length !== 4) {
            avisos.push(`Descartada (${opciones.length} opciones en vez de 4): "${referencia}..."`);
            return;
        }

        const letraCorrecta = String(p.respuestaCorrecta || '').toUpperCase();
        const indiceCorrecta = LETRAS.indexOf(letraCorrecta);
        if (indiceCorrecta === -1) {
            avisos.push(`Descartada (letra correcta no válida): "${referencia}..."`);
            return;
        }

        validas.push({
            texto: String(p.texto || '').trim(),
            opciones: opciones.map((texto, i) => ({
                letra: LETRAS[i],
                texto: String(texto || '').trim(),
                esCorrecta: i === indiceCorrecta
            })),
            respuestaCorrecta: LETRAS[indiceCorrecta],
            // Se marcan como IA para poder distinguirlas después
            esIA: true,
            verificada: false,
            esOficial: false,
            temaOrigenNombre: nombreTema || ''
        });
    });

    return { validas, avisos };
}

module.exports = async (req, res) => {
    if (!peticionValida(req, res)) return;

    // Este endpoint recibe texto del navegador, así que sin sesión válida
    // sería una pasarela gratuita a Claude a costa de nuestro saldo
    const usuario = await usuarioConCupo(req, res);
    if (!usuario) return;

    try {
        const { texto, cantidad, nombreTema } = req.body || {};

        const contenido = String(texto || '').trim();
        if (!contenido) {
            res.status(400).json({ error: 'No se ha recibido texto del tema digital.' });
            return;
        }
        if (contenido.length > MAX_CARACTERES) {
            res.status(400).json({ error: `El texto supera el máximo de ${MAX_CARACTERES} caracteres por petición.` });
            return;
        }

        const numPreguntas = parseInt(cantidad, 10);
        if (!Number.isFinite(numPreguntas) || numPreguntas < 1 || numPreguntas > MAX_PREGUNTAS_POR_PETICION) {
            res.status(400).json({ error: `La cantidad debe estar entre 1 y ${MAX_PREGUNTAS_POR_PETICION}.` });
            return;
        }

        const cuentas = obtenerCuentas();
        if (cuentas.length === 0) {
            res.status(500).json({ error: 'Falta la variable de entorno ANTHROPIC_API_KEY.' });
            return;
        }

        const { data, cuenta } = await llamarClaude({
            model: MODELO,
            max_tokens: MAX_TOKENS,
            system: SYSTEM_PROMPT,
            messages: [{
                role: 'user',
                content: `Redacta exactamente ${numPreguntas} preguntas tipo test sobre estos fragmentos del temario${nombreTema ? ` de "${String(nombreTema).slice(0, 120)}"` : ''}. Reparte las preguntas entre los distintos fragmentos.\n\n<fragmentos>\n${contenido}\n</fragmentos>`
            }],
            output_config: {
                effort: ESFUERZO,
                format: { type: 'json_schema', schema: SCHEMA }
            }
        }, cuentas);

        // Se anota el gasto antes de nada: la llamada ya está pagada,
        // salga bien o mal el resto
        const coste = await anotarConsumo({
            uid: usuario.uid,
            email: usuario.email,
            funcion: 'generar-preguntas-ia',
            modelo: MODELO,
            uso: data.usage,
            cuenta,
            detalle: { preguntasPedidas: numPreguntas, caracteres: contenido.length }
        });

        if (data.stop_reason === 'max_tokens') {
            res.status(500).json({ error: 'La respuesta se cortó por longitud. Pide menos preguntas por lote.' });
            return;
        }

        const bloqueTexto = (data.content || []).find(b => b.type === 'text');
        if (!bloqueTexto) {
            res.status(500).json({ error: 'Claude no devolvió contenido de texto.' });
            return;
        }

        const crudas = JSON.parse(bloqueTexto.text).preguntas || [];
        const { validas, avisos } = aFormatoPlataforma(crudas, nombreTema);

        res.status(200).json({
            preguntas: validas,
            avisos,
            cuenta,
            uso: data.usage || {},
            costeDolares: coste.costeDolares
        });

    } catch (error) {
        console.error('[generar-preguntas-ia]', error);
        const respuesta = { error: error.message || 'Error generando las preguntas.' };
        if (error.enlace) respuesta.enlace = error.enlace;
        res.status(500).json(respuesta);
    }
};
