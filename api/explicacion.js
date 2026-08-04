// ============================================================
//  /api/explicacion.js
//  Genera la explicación de una pregunta con Claude, desde el
//  servidor. Sustituye a las llamadas que se hacían desde el
//  navegador con la clave descargada de Firestore.
//
//  El prompt se construye aquí, no lo envía el cliente: así el
//  endpoint no puede usarse como pasarela genérica a Claude.
// ============================================================

const { peticionValida, obtenerCuentas, llamarClaude, textoDeRespuesta } = require('./_claude');
const { usuarioConCupo } = require('./_auth');
const { anotarConsumo } = require('./_consumo');

const MODELO = 'claude-opus-4-8';
const MAX_TOKENS = 1000;

// ------------------------------------------------------------
//  Construcción del prompt
//  modo 'banco' -> un párrafo (explicación desde el banco)
//  modo 'test'  -> dos párrafos (explicación de pregunta fallada)
// ------------------------------------------------------------
const REGLAS = `REGLAS DE FORMATO (obligatorias):
- Texto plano. Nada de asteriscos, almohadillas, guiones de lista, negritas ni ningún marcado.
- Sin títulos, sin encabezados, sin numeración.
- No repitas el enunciado ni las opciones.
- Sin introducción, sin resumen final, sin frases de cortesía.
- Lenguaje natural, sencillo y directo.
- Máximo 120 palabras en total.`;

function construirPrompt({ modo, texto, opciones, correcta, marcada }) {
    const listaOpciones = opciones.map(o => `${o.letra}) ${o.texto}`).join('\n');

    if (modo === 'test') {
        const fallo = marcada && correcta && marcada.letra !== correcta.letra;
        return `Eres profesor de oposiciones a la Administración de Justicia en España. Le explicas una pregunta fallada a un alumno, de viva voz.

Pregunta: ${texto}
Opciones:
${listaOpciones}
Opción marcada por el alumno: ${marcada ? `${marcada.letra}) ${marcada.texto}` : 'ninguna'}
Opción correcta: ${correcta ? `${correcta.letra}) ${correcta.texto}` : 'No disponible'}

Escribe dos párrafos cortos y seguidos:
${fallo ? 'Primero, por qué la opción que marcó el alumno no es válida.\n' : ''}${fallo ? 'Después, ' : ''}por qué la opción correcta sí lo es, citando el artículo y la norma concretos.

${REGLAS}`;
    }

    return `Eres profesor de oposiciones a la Administración de Justicia en España. Le explicas una pregunta a un alumno, de viva voz.

Pregunta: ${texto}
${listaOpciones ? `Opciones:\n${listaOpciones}` : ''}
${correcta ? `Opción correcta: ${correcta.letra}) ${correcta.texto}` : ''}

Explica en un párrafo corto por qué la opción correcta lo es, citando el artículo y la norma concretos. Si alguna otra opción induce especialmente a error, aclara brevemente por qué no vale.

${REGLAS}`;
}

// ------------------------------------------------------------
//  Handler
// ------------------------------------------------------------
module.exports = async function handler(req, res) {
    if (!peticionValida(req, res)) return;

    const usuario = await usuarioConCupo(req, res);
    if (!usuario) return;

    const cuentas = obtenerCuentas();
    if (cuentas.length === 0) {
        return res.status(500).json({ error: 'Falta la variable de entorno ANTHROPIC_API_KEY en Vercel' });
    }

    try {
        const cuerpo = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
        const texto = String(cuerpo.texto || '').trim();
        const opciones = Array.isArray(cuerpo.opciones) ? cuerpo.opciones : [];
        const modo = cuerpo.modo === 'test' ? 'test' : 'banco';

        if (!texto) {
            return res.status(400).json({ error: 'Falta el enunciado de la pregunta.' });
        }

        // Normalizamos las opciones y localizamos correcta y marcada
        const limpias = opciones.slice(0, 6).map(o => ({
            letra: String(o.letra || '').slice(0, 2),
            texto: String(o.texto || '').slice(0, 1500),
            esCorrecta: Boolean(o.esCorrecta)
        }));

        const correcta = limpias.find(o => o.esCorrecta || o.letra === cuerpo.respuestaCorrecta) || null;
        const marcada = limpias.find(o => o.letra === cuerpo.respuestaUsuario) || null;

        const prompt = construirPrompt({
            modo,
            texto: texto.slice(0, 3000),
            opciones: limpias,
            correcta,
            marcada
        });

        const { data, cuenta } = await llamarClaude({
            model: MODELO,
            max_tokens: MAX_TOKENS,
            messages: [{ role: 'user', content: prompt }]
        }, cuentas);

        const coste = await anotarConsumo({
            uid: usuario.uid,
            email: usuario.email,
            funcion: 'explicacion',
            modelo: MODELO,
            uso: data.usage,
            cuenta,
            detalle: { modo }
        });

        return res.status(200).json({
            texto: textoDeRespuesta(data),
            cuenta,
            uso: {
                tokensEntrada: (data.usage && data.usage.input_tokens) || 0,
                tokensSalida: (data.usage && data.usage.output_tokens) || 0
            },
            costeDolares: coste.costeDolares
        });

    } catch (error) {
        console.error('[explicacion]', error);
        return res.status(500).json({
            error: error.message || 'Error generando la explicación',
            enlace: error.enlace || null
        });
    }
};
