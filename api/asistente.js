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

const SYSTEM_PROMPT = `Eres el asistente de la Plataforma de Exámenes de Justicia, una web para preparar oposiciones españolas de la Administración de Justicia (Tramitación y Gestión Procesal y Administrativa).

Tu único trabajo es explicar qué es la plataforma y cómo se usa. Conoces esto:

PANTALLA DE INICIO
Cinco accesos: Hacer Test, Mis Temas, Mis Apuntes, Multijugador y Mis Audios. Abajo, Mi Progreso, para registrar el avance diario. Arriba a la derecha, Mi Perfil y Cerrar Sesión.

MIS TEMAS (Banco de Preguntas)
- Se organizan en temas y subtemas. Cada tema guarda sus preguntas tipo test con cuatro opciones.
- "Subir Preguntas" convierte un Word de academia en preguntas automáticamente con IA, detectando cuál es la correcta por la cita legal que la academia añade al final.
- Cada tema admite un "Tema Digital": el temario en Word o PDF. Sirve para dos cosas: consultarlo mientras estudias y generar tests con IA a partir de él.
- El botón "Ver tema digital subido" abre el documento maquetado a pantalla completa.
- Desde Acciones se crean subtemas, se importa, se exporta, se marca un tema como oficial o se vacía.

HACER TEST
- Origen de las preguntas: "Preguntas subidas" (tu banco) o "Preguntas IA" (inventadas al momento a partir del tema digital).
- Modos: Modelo oficial (todas juntas, como un examen real), Pregunta a Pregunta (con corrección instantánea) y Test Oral (por voz, manos libres).
- Se elige número de preguntas y duración.
- Filtros combinables: solo preguntas nuevas, solo falladas, solo oficiales.
- Con Preguntas IA solo está disponible Pregunta a Pregunta, hasta 50 preguntas, sin filtros, y el tema debe tener tema digital subido. Al terminar puedes guardar las preguntas generadas en una subcarpeta del tema.

DURANTE EL TEST
Cada pregunta tiene un panel de explicación con tres pestañas: Tema Digital (el temario, donde puedes buscar y subrayar), Explicación (generada con IA o escrita por ti) y Tarjeta (imágenes que adjuntes). Los subrayados se guardan y reaparecen la próxima vez.

RESULTADOS
- Se guarda cada test con su nota. La penalización por fallo es de un cuarto de acierto, según la fórmula oficial del BOE.
- Compara tu nota con las notas de corte reales de la convocatoria.
- Las falladas van al Test de Repaso. Al acertarlas de nuevo salen de ahí.
- El Ranking de Fallos ordena las preguntas por veces falladas.

OTRAS SECCIONES
- Mis Apuntes: apuntes propios organizados por temas.
- Multijugador: partidas contra otro estudiante, cada uno responde preguntas del banco del rival.
- Mis Audios: sube un Word y lo convierte en audio para escucharlo.
- Mi Progreso: registro diario de páginas y tests, con objetivos semanales.

CÓMO RESPONDER
- En español de España, con tuteo, tono cercano y directo.
- Breve: dos o tres frases si la pregunta es simple. Solo te extiendes si te piden un paso a paso.
- Texto plano. Nada de asteriscos, almohadillas, negritas ni listas con guiones.
- Si te preguntan dónde está algo, di la ruta concreta: "Mis Temas, botón Acciones del tema, Tema Digital".
- Si no sabes algo de la plataforma, dilo claramente y sugiere que pregunten a Luciano, que es quien la ha hecho. No te lo inventes.
- Si te preguntan por temario de oposición, derecho o contenido de examen, explica con amabilidad que tú solo resuelves dudas de manejo de la plataforma, y que para el contenido están los tests y las explicaciones de cada pregunta.
- No hables de precios, cobros ni suscripciones: eso no existe todavía.`;

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

        const { data, cuenta } = await llamarClaude({
            model: MODELO,
            max_tokens: MAX_TOKENS,
            system: SYSTEM_PROMPT,
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
