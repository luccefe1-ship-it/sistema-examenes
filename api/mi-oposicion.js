// ============================================================
//  /api/mi-oposicion.js
//  Todo lo que le hace falta saber a un opositor, en una llamada.
//
//  Devuelve: la ficha de su convocatoria, cuánto falta para el
//  examen, qué temas digitales suyos están escritos con vocabulario
//  derogado y qué preguntas de su banco conviene corregir.
//
//  A DIFERENCIA DEL VIGILANTE, esto lleva sesión de usuario. El
//  vigilante mira el BOE, que es público, y va por cron. Esto lee
//  LOS DOCUMENTOS DE UNA PERSONA, así que exige su token y solo
//  toca los temas cuyo usuarioId coincide. Luciano ve Gestión y sus
//  temas; Sandra ve Tramitación y los suyos.
//
//  NO MODIFICA NADA. Ni los temas, ni las preguntas, ni los
//  documentos. Solo lee y señala.
// ============================================================

const { usuarioConCupo } = require('./_auth');
const { obtenerFirestore } = require('./_consumo');
const {
    fichaConvocatoria, cuerpoValido, CUERPO_POR_DEFECTO,
    TERMINOS_DEROGADOS, TERMINOS_MATIZADOS
} = require('./_convocatoria');
const { normasDeCuerpo } = require('./_normas');

// Cuántos fragmentos se devuelven por tema. Con enseñar unos cuantos
// se entiende el problema; volcar 300 coincidencias no ayuda a nadie.
const MAX_FRAGMENTOS_POR_TEMA = 8;
const MAX_PREGUNTAS_POR_TEMA = 25;

// Caracteres de contexto alrededor de cada coincidencia
const CONTEXTO = 90;

/* Sin acentos y en minúsculas. Los temarios vienen de Word y PDF
   convertidos, y ahí las tildes aparecen y desaparecen. */
function normalizar(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

/* Busca un término y devuelve dónde aparece, con su contexto.

   Se busca sobre el texto normalizado pero se RECORTA del original,
   para poder enseñar el párrafo tal y como está escrito, con sus
   tildes y mayúsculas. Por eso las dos cadenas tienen que mantener
   la misma longitud: normalizar() solo quita marcas de acento y baja
   a minúsculas, nunca añade ni elimina caracteres. */
function buscarTermino(original, plano, termino) {
    const apariciones = [];
    let desde = 0;

    while (apariciones.length < MAX_FRAGMENTOS_POR_TEMA) {
        const i = plano.indexOf(termino, desde);
        if (i === -1) break;

        const inicio = Math.max(0, i - CONTEXTO);
        const fin = Math.min(original.length, i + termino.length + CONTEXTO);

        apariciones.push({
            texto: (inicio > 0 ? '…' : '') +
                   original.slice(inicio, fin).replace(/\s+/g, ' ').trim() +
                   (fin < original.length ? '…' : ''),
            posicion: i
        });

        desde = i + termino.length;
    }

    return apariciones;
}

/* Revisa un texto contra la lista de términos derogados.
   Devuelve un hallazgo por término, no por aparición. */
function revisarTexto(texto) {
    const original = String(texto || '');
    if (!original.trim()) return { revisable: false, hallazgos: [] };

    const plano = normalizar(original);
    const hallazgos = [];

    for (const entrada of [...TERMINOS_DEROGADOS, ...TERMINOS_MATIZADOS]) {
        const apariciones = buscarTermino(original, plano, entrada.termino);
        if (!apariciones.length) continue;

        // El plural ya lo cubre el singular como subcadena ("juzgados
        // de primera instancia" contiene "juzgado..."? no: cambia la s
        // de sitio). Por eso ambos están en la lista y aquí se evita
        // contar dos veces lo mismo comparando posiciones.
        hallazgos.push({
            termino: entrada.termino,
            ahora: entrada.ahora,
            gravedad: entrada.gravedad,
            veces: apariciones.length,
            fragmentos: apariciones.map(a => a.texto)
        });
    }

    return { revisable: true, hallazgos };
}

/* Quita hallazgos que son el mismo texto contado dos veces: si salta
   "juzgados de primera instancia" y también "juzgado de primera
   instancia" sobre las mismas frases, se queda el más específico. */
function quitarSolapes(hallazgos) {
    return hallazgos.filter((h, i) =>
        !hallazgos.some((otro, j) =>
            j !== i && otro.termino.length > h.termino.length && otro.termino.includes(h.termino)
        )
    );
}

// ------------------------------------------------------------
//  Revisión del banco de un usuario
// ------------------------------------------------------------
async function revisarTemasDelUsuario(db, uid) {
    if (!db) return { temas: [], sinFirestore: true };

    const instantanea = await db.collection('temas').where('usuarioId', '==', uid).get();
    const temas = [];

    for (const doc of instantanea.docs) {
        const datos = doc.data();
        const digital = datos.documentoDigital || null;

        // --- El tema digital -------------------------------------
        let revisionDigital = { tieneDocumento: false, revisable: false, hallazgos: [] };

        if (digital) {
            const texto = typeof digital.textoExtraido === 'string' ? digital.textoExtraido : '';
            const revision = revisarTexto(texto);

            revisionDigital = {
                tieneDocumento: true,
                nombre: digital.nombre || '',
                revisable: revision.revisable,
                hallazgos: quitarSolapes(revision.hallazgos),
                /* Hay PDF antiguos con textoExtraido vacío: se subieron
                   cuando tests.html configuraba pdf.js sin cargar la
                   librería. No se pueden revisar sin resubirlos, y hay
                   que decirlo en vez de dar por bueno el silencio. */
                motivoNoRevisable: revision.revisable ? '' : 'El documento se subió sin texto extraído. Vuelve a subirlo para poder revisarlo.'
            };
        }

        // --- Las preguntas ---------------------------------------
        const preguntasMarcadas = [];

        for (let i = 0; i < (datos.preguntas || []).length; i++) {
            const p = datos.preguntas[i] || {};
            const texto = [
                p.pregunta || p.enunciado || '',
                ...(Array.isArray(p.opciones) ? p.opciones : []),
                p.explicacion || ''
            ].join(' ');

            const revision = revisarTexto(texto);
            const hallazgos = quitarSolapes(revision.hallazgos);
            if (!hallazgos.length) continue;

            if (preguntasMarcadas.length < MAX_PREGUNTAS_POR_TEMA) {
                preguntasMarcadas.push({
                    indice: i,
                    enunciado: String(p.pregunta || p.enunciado || '').slice(0, 220),
                    terminos: hallazgos.map(h => ({ termino: h.termino, ahora: h.ahora, gravedad: h.gravedad }))
                });
            }
        }

        const gravedadMaxima = [...revisionDigital.hallazgos, ...preguntasMarcadas.flatMap(p => p.terminos)]
            .some(h => h.gravedad === 'alta') ? 'alta'
            : (revisionDigital.hallazgos.length || preguntasMarcadas.length) ? 'media' : 'ninguna';

        temas.push({
            id: doc.id,
            nombre: datos.nombre || '(sin nombre)',
            esSubtema: !!datos.temaPadreId,
            totalPreguntas: (datos.preguntas || []).length,
            digital: revisionDigital,
            preguntasMarcadas,
            totalPreguntasMarcadas: preguntasMarcadas.length,
            gravedad: gravedadMaxima
        });
    }

    // Primero lo grave, y a igual gravedad lo que más preguntas toca
    temas.sort((a, b) => {
        const orden = { alta: 0, media: 1, ninguna: 2 };
        if (orden[a.gravedad] !== orden[b.gravedad]) return orden[a.gravedad] - orden[b.gravedad];
        return b.totalPreguntasMarcadas - a.totalPreguntasMarcadas;
    });

    return { temas, sinFirestore: false };
}

// ------------------------------------------------------------
//  Handler
// ------------------------------------------------------------
module.exports = async function handler(req, res) {
    const origen = req.headers.origin || '';
    if (origen) res.setHeader('Access-Control-Allow-Origin', origen);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');

    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido' }); return; }

    const usuario = await usuarioConCupo(req, res);
    if (!usuario) return;   // usuarioConCupo ya ha contestado

    try {
        const cuerpoPedido = req.body?.cuerpo;
        const clave = cuerpoValido(cuerpoPedido) ? cuerpoPedido : CUERPO_POR_DEFECTO;

        const ficha = fichaConvocatoria(clave);
        const db = obtenerFirestore();
        const revision = await revisarTemasDelUsuario(db, usuario.uid);

        const conProblemas = revision.temas.filter(t => t.gravedad !== 'ninguna');

        res.status(200).json({
            ...ficha,

            /* Las leyes que se vigilan para este cuerpo. La pantalla las
               enseña para que se vea qué se está mirando: si una norma
               del temario no aparece en esta lista, nadie va a avisar
               de que la han tocado. */
            normasVigiladas: normasDeCuerpo(clave).map(n => ({
                id: n.id,
                nombre: n.nombre,
                bloque: n.bloque,
                soloDeEsteCuerpo: Array.isArray(n.cuerpos)
            })),

            revision: {
                temasRevisados: revision.temas.length,
                temasConProblemas: conProblemas.length,
                preguntasAMarcar: revision.temas.reduce((s, t) => s + t.totalPreguntasMarcadas, 0),
                sinDocumentoRevisable: revision.temas.filter(t => t.digital.tieneDocumento && !t.digital.revisable).length,
                temas: conProblemas,
                // Los temas limpios se devuelven solo como recuento
                temasLimpios: revision.temas.length - conProblemas.length
            }
        });

    } catch (error) {
        console.error('[mi-oposicion] Falló la revisión:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports.paraPruebas = { revisarTexto, quitarSolapes, normalizar };
