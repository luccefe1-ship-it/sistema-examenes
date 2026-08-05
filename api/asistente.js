// ============================================================
//  /api/asistente.js
//  Responde dudas sobre cómo funciona la plataforma.
//
//  El prompt del sistema se arma AQUÍ, no lo manda el navegador.
//  Así el endpoint no puede usarse como pasarela genérica a
//  Claude: solo sabe hablar de esta plataforma.
// ============================================================

const MODELO = 'claude-opus-4-8';   // para bajar el coste unas 5 veces: 'claude-sonnet-5'
const MAX_TOKENS = 900;

// Topes: la conversación la manda el cliente, así que se acota
const MAX_MENSAJES = 20;
const MAX_CARACTERES_MENSAJE = 1500;

const { obtenerCuentas, llamarClaude, textoDeRespuesta } = require('./_claude');
const { usuarioConCupo } = require('./_auth');
const { anotarConsumo } = require('./_consumo');
const { MANUAL } = require('./_manual');
const { bloqueDeInterfaz } = require('./_interfaz');

/* El prompt se arma en dos capas para no tener que tocar este archivo
   cada vez que se añade una función a la web:

     1. El manual (api/_manual.js), que es donde se documenta la
        plataforma. Ahí es donde hay que escribir lo nuevo.
     2. El inventario de lo que el usuario tiene en pantalla, que llega
        del navegador saneado por api/_interfaz.js. Gracias a esto el
        asistente reconoce botones aunque nadie los haya documentado
        todavía: antes negaba que existieran. */
function construirSystemPrompt(interfaz) {
    return `Eres el asistente de la Plataforma de Exámenes de Justicia, una web para preparar oposiciones españolas de la Administración de Justicia (Tramitación y Gestión Procesal y Administrativa).

Tu único trabajo es explicar qué es la plataforma y cómo se usa. Conoces esto:

${MANUAL}

CÓMO RESPONDER
- En español de España, con tuteo, tono cercano y directo.
- Breve: dos o tres frases si la pregunta es simple. Solo te extiendes si te piden un paso a paso.
- Texto plano. Nada de asteriscos, almohadillas, negritas ni listas con guiones.
- Si te preguntan dónde está algo, di la ruta concreta: "Mis Temas, botón Acciones del tema, Tema Digital".
- El manual puede ir por detrás de la web, que se actualiza a menudo. Antes de decir que algo no existe, mira la lista de lo que hay en pantalla. Si aparece ahí, existe: dilo y explica dónde está, aunque no sepas el detalle de su funcionamiento.
- Si aun así no sabes algo, dilo claramente y sugiere que pregunten a Luciano, que es quien la ha hecho. No te lo inventes.
- Si te preguntan por temario de oposición, derecho o contenido de examen, explica con amabilidad que tú solo resuelves dudas de manejo de la plataforma, y que para el contenido están los tests y las explicaciones de cada pregunta.
- No hables de precios, cobros ni suscripciones: eso no existe todavía.${bloqueDeInterfaz(interfaz)}`;
}

module.exports = async function handler(req, res) {
    const origen = req.headers.origin || '';
    let permitido = true;
    try {
        if (origen) {
            const { hostname, host } = new URL(origen);
            permitido = hostname === 'localhost' || hostname === '127.0.0.1' || host === req.headers.host;
        }
    } catch (e) {
        permitido = false;
    }

    if (origen && permitido) res.setHeader('Access-Control-Allow-Origin', origen);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
    if (!permitido) return res.status(403).json({ error: 'Origen no autorizado' });

    const usuario = await usuarioConCupo(req, res);
    if (!usuario) return;

    const cuentas = obtenerCuentas();
    if (cuentas.length === 0) {
        return res.status(500).json({ error: 'Falta la variable de entorno ANTHROPIC_API_KEY en Vercel' });
    }

    try {
        const cuerpo = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
        const recibidos = Array.isArray(cuerpo.mensajes) ? cuerpo.mensajes : [];

        // Solo se aceptan turnos con la forma esperada, recortados y limitados
        const mensajes = recibidos
            .slice(-MAX_MENSAJES)
            .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
            .map(m => ({
                role: m.role,
                content: m.content.trim().slice(0, MAX_CARACTERES_MENSAJE)
            }))
            .filter(m => m.content.length > 0);

        if (mensajes.length === 0) {
            return res.status(400).json({ error: 'No se ha recibido ninguna pregunta.' });
        }
        if (mensajes[mensajes.length - 1].role !== 'user') {
            return res.status(400).json({ error: 'El último mensaje debe ser una pregunta del usuario.' });
        }

        // El navegador solo aporta el inventario de pantalla; el prompt
        // sigue armándose entero aquí (ver api/_interfaz.js)
        const { data, cuenta } = await llamarClaude({
            model: MODELO,
            max_tokens: MAX_TOKENS,
            system: construirSystemPrompt(cuerpo.interfaz),
            messages: mensajes
        }, cuentas);

        const coste = await anotarConsumo({
            uid: usuario.uid,
            email: usuario.email,
            funcion: 'asistente',
            modelo: MODELO,
            uso: data.usage,
            cuenta,
            detalle: { turnos: mensajes.length }
        });

        return res.status(200).json({
            texto: textoDeRespuesta(data),
            cuenta,
            costeDolares: coste.costeDolares
        });

    } catch (error) {
        console.error('[asistente]', error);
        return res.status(500).json({
            error: error.message || 'Error hablando con el asistente',
            enlace: error.enlace || null
        });
    }
};
