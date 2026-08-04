// ============================================================
//  /api/preguntas-rival.js
//  Devuelve las preguntas verificadas del rival en una partida
//  del Multijugador.
//
//  Existe para poder cerrar la lectura abierta de la colección
//  "temas". Antes, la regla de Firestore dejaba que cualquier
//  usuario registrado leyera los temas de cualquier otro, porque
//  el Multijugador lo necesitaba. Eso significaba que con abrir
//  la consola del navegador podías descargarte el banco de
//  preguntas entero de otra persona, y el texto completo de sus
//  temas digitales.
//
//  Ahora el servidor comprueba que quien pregunta y el rival
//  están en la MISMA sala antes de devolver nada, y solo manda
//  las preguntas: ni el documento digital, ni las notas, ni nada
//  más del tema.
// ============================================================

const { usuarioConCupo } = require('./_auth');
const { obtenerFirestore } = require('./_consumo');

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

/* Se devuelve la misma forma que el cliente ya sabe leer, pero solo
   con los campos que hacen falta para jugar. Fuera queda, sobre todo,
   documentoDigital: el texto íntegro del temario del rival no tiene
   por qué salir de su cuenta. */
function limpiarPregunta(p) {
    return {
        texto: p.texto,
        opciones: p.opciones,
        verificada: true,
        esOficial: p.esOficial === true
    };
}

function preguntaUtilizable(p) {
    return p
        && p.verificada === true
        && typeof p.texto === 'string' && p.texto.trim()
        && Array.isArray(p.opciones)
        && p.opciones.length === 4
        && p.opciones.every(op => op && typeof op.texto === 'string' && op.texto.trim())
        && p.opciones.some(op => op.esCorrecta === true);
}

function limpiarTema(id, tema) {
    return {
        id,
        nombre: tema.nombre || '',
        descripcion: tema.descripcion || '',
        preguntas: (tema.preguntas || []).filter(preguntaUtilizable).map(limpiarPregunta),
        subtemas: (tema.subtemas || []).map(sub => ({
            nombre: sub.nombre || '',
            preguntas: (sub.preguntas || []).filter(preguntaUtilizable).map(limpiarPregunta)
        }))
    };
}

module.exports = async (req, res) => {
    if (!peticionValida(req, res)) return;

    const usuario = await usuarioConCupo(req, res);
    if (!usuario) return;

    const db = obtenerFirestore();
    if (!db) {
        res.status(500).json({ error: 'El servidor no tiene acceso a la base de datos. Falta FIREBASE_SERVICE_ACCOUNT.' });
        return;
    }

    try {
        const cuerpo = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
        const clave = String(cuerpo.clave || '').trim().toUpperCase();

        if (!clave || clave.length > 20) {
            res.status(400).json({ error: 'Clave de sala no válida.' });
            return;
        }

        const salaSnap = await db.collection('salas').doc(clave).get();
        if (!salaSnap.exists) {
            res.status(404).json({ error: 'Esa sala no existe.' });
            return;
        }

        const sala = salaSnap.data();
        const jugadores = sala.jugadores || {};
        const uid1 = jugadores.jugador1 && jugadores.jugador1.uid;
        const uid2 = jugadores.jugador2 && jugadores.jugador2.uid;

        // Quien pregunta tiene que estar jugando esa partida
        if (usuario.uid !== uid1 && usuario.uid !== uid2) {
            console.warn(`[preguntas-rival] ${usuario.uid} pidió la sala ${clave} sin estar en ella`);
            res.status(403).json({ error: 'No estás en esa partida.' });
            return;
        }

        // Y el rival es el otro, no uno cualquiera que nos pasen por parámetro
        const rivalUid = usuario.uid === uid1 ? uid2 : uid1;
        if (!rivalUid) {
            res.status(409).json({ error: 'Todavía no hay rival en la sala.' });
            return;
        }

        const temasSnap = await db.collection('temas')
            .where('usuarioId', '==', rivalUid)
            .get();

        const temas = [];
        let total = 0;
        temasSnap.forEach(docTema => {
            const tema = limpiarTema(docTema.id, docTema.data());
            total += tema.preguntas.length + tema.subtemas.reduce((s, x) => s + x.preguntas.length, 0);
            temas.push(tema);
        });

        console.log(`[preguntas-rival] sala ${clave}: ${total} preguntas del rival ${rivalUid}`);

        res.status(200).json({ temas, total });

    } catch (error) {
        console.error('[preguntas-rival]', error);
        res.status(500).json({ error: error.message || 'Error obteniendo las preguntas del rival.' });
    }
};
