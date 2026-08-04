// ============================================================
//  /api/tts.js
//  Convierte texto en audio con Google Cloud Text-to-Speech.
//
//  Antes esto lo hacía el navegador: se descargaba la clave de
//  Firestore (config/keys → googleTTS_web) y llamaba a Google
//  directamente. Cualquier usuario registrado podía leer esa
//  clave en la pestaña de red y gastarla por su cuenta.
//
//  Ahora la clave vive solo en Vercel y el contador mensual lo
//  lleva el servidor, para que nadie pueda ponerlo a cero.
// ============================================================

const { usuarioConCupo } = require('./_auth');
const { obtenerFirestore } = require('./_consumo');

const MAX_CARACTERES_POR_PETICION = 5000;   // Google admite 5.000 por llamada
const LIMITE_GRATIS_MENSUAL = 1000000;      // caracteres al mes con voces WaveNet

function mesActual() {
    const f = new Date();
    return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
}

function origenPermitido(origen, host) {
    if (!origen) return true;
    try {
        const { hostname, host: hostOrigen } = new URL(origen);
        if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
        return hostOrigen === host;
    } catch (e) {
        return false;
    }
}

function peticionValida(req, res) {
    const origen = req.headers.origin || '';
    const permitido = origenPermitido(origen, req.headers.host);

    if (origen && permitido) res.setHeader('Access-Control-Allow-Origin', origen);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');

    if (req.method === 'OPTIONS') { res.status(204).end(); return false; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido' }); return false; }
    if (!permitido) { res.status(403).json({ error: 'Origen no autorizado' }); return false; }

    return true;
}

/* Suma caracteres al contador del mes, con transacción para que dos
   subidas a la vez no se pisen. Si no hay Admin configurado, deja
   pasar la síntesis pero avisa: mejor eso que quedarse sin audios. */
async function sumarConsumoTTS(caracteres) {
    const db = obtenerFirestore();
    if (!db) {
        console.warn('[tts] Sin Firebase Admin: no se puede llevar el contador mensual.');
        return null;
    }

    const ref = db.collection('ttsUsage').doc('actual');
    const mes = mesActual();

    return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const datos = snap.exists ? snap.data() : null;
        const previos = (datos && datos.mes === mes) ? (Number(datos.caracteres) || 0) : 0;
        const total = previos + caracteres;
        tx.set(ref, { mes, caracteres: total, ultimaActualizacion: new Date() });
        return total;
    });
}

module.exports = async (req, res) => {
    if (!peticionValida(req, res)) return;

    const usuario = await usuarioConCupo(req, res);
    if (!usuario) return;

    const clave = (process.env.GOOGLE_TTS_API_KEY || '').trim();
    if (!clave) {
        res.status(500).json({ error: 'Falta la variable de entorno GOOGLE_TTS_API_KEY en Vercel.' });
        return;
    }

    try {
        const cuerpo = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
        const texto = String(cuerpo.texto || '').trim();
        const voz = String(cuerpo.voz || 'es-ES-Wavenet-B').trim();

        if (!texto) {
            res.status(400).json({ error: 'No se ha recibido texto que convertir.' });
            return;
        }
        if (texto.length > MAX_CARACTERES_POR_PETICION) {
            res.status(400).json({ error: `El texto supera los ${MAX_CARACTERES_POR_PETICION} caracteres por petición.` });
            return;
        }
        // La voz la elige el usuario, pero no se acepta cualquier cosa
        if (!/^[a-zA-Z]{2}-[a-zA-Z]{2}-[A-Za-z0-9-]+$/.test(voz)) {
            res.status(400).json({ error: 'Voz no válida.' });
            return;
        }

        // El límite se comprueba antes de gastar
        const totalPrevio = await sumarConsumoTTS(0);
        if (totalPrevio !== null && totalPrevio + texto.length > LIMITE_GRATIS_MENSUAL) {
            res.status(429).json({
                error: 'Se ha alcanzado el límite mensual gratuito de audio. Vuelve a intentarlo el mes que viene.',
                caracteresUsados: totalPrevio,
                limite: LIMITE_GRATIS_MENSUAL
            });
            return;
        }

        const respuesta = await fetch(
            `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(clave)}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    input: { text: texto },
                    voice: { languageCode: voz.split('-').slice(0, 2).join('-'), name: voz },
                    audioConfig: { audioEncoding: 'MP3' }
                })
            }
        );

        if (!respuesta.ok) {
            let detalle = '';
            try { detalle = (await respuesta.json()).error?.message || ''; } catch (e) {}
            console.error('[tts] Google devolvió', respuesta.status, detalle);
            res.status(502).json({ error: `Google Text-to-Speech devolvió ${respuesta.status}. ${detalle}`.trim() });
            return;
        }

        const datos = await respuesta.json();

        // Se anota el consumo real después de que Google lo haya cobrado
        const totalMes = await sumarConsumoTTS(texto.length);
        console.log(`[tts] ${usuario.uid} · ${texto.length} caracteres · acumulado del mes: ${totalMes}`);

        res.status(200).json({
            audioContent: datos.audioContent,
            caracteres: texto.length,
            caracteresMes: totalMes,
            limiteMes: LIMITE_GRATIS_MENSUAL
        });

    } catch (error) {
        console.error('[tts]', error);
        res.status(500).json({ error: error.message || 'Error generando el audio.' });
    }
};
