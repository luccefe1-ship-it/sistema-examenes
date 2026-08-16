// ============================================================
//  /api/reformas-repaso.js
//  Repasa TODAS las leyes del temario y guarda las reformas de los
//  dos últimos años, con los artículos que tocaron.
//
//  POR QUÉ EXISTE, HABIENDO YA UN VIGILANTE DIARIO. El vigilante
//  mira el sumario del día: si un día falla el cron, si Vercel tiene
//  una caída o si el BOE tarda en publicar el análisis de una
//  reforma —tarda, y a veces días—, ese cambio no lo ve nadie nunca
//  más. Este repaso no pregunta "¿qué ha salido hoy?" sino "¿qué le
//  ha pasado a esta ley en los dos últimos años?", que es una
//  pregunta que se puede repetir mil veces y siempre da la respuesta
//  completa.
//
//  Por eso la primera vez rellena dos años de golpe y a partir de
//  ahí, corriendo cada semana, se mantiene solo. Si el año que viene
//  vuelven a reformar la Constitución, aparece sin tocar nada.
//
//  ES IDEMPOTENTE. Cada reforma se guarda con una clave formada por
//  la ley y la disposición que la modificó, así que repasar dos
//  veces no duplica nada ni pierde lo ya guardado.
//
//  NO USA IA. Solo lee el análisis oficial del BOE y guarda lo que
//  dice. No resume ni interpreta: si el BOE dice "se modifica el
//  art. 69.3", eso es lo que se guarda.
//
//  MODOS:
//    GET /api/reformas-repaso            -> dos años, y guarda
//    GET /api/reformas-repaso?anios=5    -> más historia
//    GET /api/reformas-repaso?seco=1     -> enseña lo que haría, sin escribir
//    GET /api/reformas-repaso?norma=BOE-A-1978-31229  -> una sola ley
// ============================================================

const { obtenerAnalisis, obtenerMetadatos, articulosCitados } = require('./_boe');
const { obtenerFirestore } = require('./_consumo');
const { NORMAS, normaPorId } = require('./_normas');

const COLECCION = 'reformas';

// Cuántos años de historia se guardan por defecto
const ANIOS_POR_DEFECTO = 2;

/* Cuántas leyes se consultan a la vez. El BOE es un servicio público
   y son 42 leyes: de cuatro en cuatro tarda poco y no se le castiga.
   Con todas a la vez responde 429 y hay que reintentar, que sale más
   lento. */
const A_LA_VEZ = 4;

/* Vercel Cron manda "Authorization: Bearer <CRON_SECRET>". Se acepta
   también x-cron-secret para poder dispararlo a mano. */
function llamadaAutorizada(req) {
    const secreto = (process.env.CRON_SECRET || '').trim();
    if (!secreto) return { vale: false, motivo: 'Falta la variable CRON_SECRET en Vercel.' };

    const cabecera = req.headers.authorization || '';
    const alternativa = req.headers['x-cron-secret'] || '';
    const enviado = cabecera.startsWith('Bearer ') ? cabecera.slice(7).trim() : String(alternativa).trim();

    if (!enviado || enviado !== secreto) return { vale: false, motivo: 'No autorizado.' };
    return { vale: true };
}

/* El año sale del propio identificador: BOE-A-2026-10881 -> 2026.
   Se usa para descartar sin gastar una llamada: el análisis de la
   LEC trae reformas desde el año 2000 y solo interesan las últimas.
   Es un filtro barato antes del filtro caro. */
function anioDelIdentificador(id) {
    const encontrado = String(id || '').match(/^BOE-[A-Z]-(\d{4})-/);
    return encontrado ? Number(encontrado[1]) : null;
}

/* Solo las referencias que cambian el texto de la ley. El análisis
   del BOE trae también recursos de inconstitucionalidad, sentencias
   y correcciones de erratas: no reescriben el temario y meterlas
   sería llenar la pantalla de cosas que no hay que reestudiar. */
function esUnaReforma(referencia) {
    const relacion = String(referencia.relacion || '').toLowerCase();
    return /modific|deroga|a[ñn]ade|suprime|nueva redacci|sustituye/.test(relacion);
}

/* Las reformas de una ley en los últimos N años. */
async function reformasDeUnaNorma(norma, desdeAnio) {
    const analisis = await obtenerAnalisis(norma.id);
    if (!analisis) return [];

    const recientes = analisis.referencias
        .filter(esUnaReforma)
        .filter(ref => {
            const anio = anioDelIdentificador(ref.idModificadora);
            return anio !== null && anio >= desdeAnio;
        });

    const reformas = [];

    for (const ref of recientes) {
        const articulos = articulosCitados(ref.texto);

        /* La fecha exacta hay que pedirla: el identificador solo da
           el año. Si la disposición modificadora no está consolidada
           —pasa con las reformas puntuales— no habrá metadatos, y
           entonces se deja el año, que para ordenar basta. */
        let fecha = '';
        let titulo = '';

        try {
            const meta = await obtenerMetadatos(ref.idModificadora);
            if (meta) {
                titulo = meta.titulo || '';
                fecha = meta.fechaActualizacion || '';
            }
        } catch (error) {
            // Sin metadatos no se para el repaso: se guarda lo que hay
        }

        reformas.push({
            clave: `${norma.id}__${ref.idModificadora}`,
            norma: { id: norma.id, nombre: norma.nombre, bloque: norma.bloque || '' },
            idModificadora: ref.idModificadora,
            tituloModificadora: titulo,
            relacion: ref.relacion,
            texto: ref.texto,
            articulos,
            anio: anioDelIdentificador(ref.idModificadora),
            fecha,
            url: `https://www.boe.es/buscar/doc.php?id=${encodeURIComponent(ref.idModificadora)}`,
            urlLey: `https://www.boe.es/buscar/act.php?id=${encodeURIComponent(norma.id)}`
        });
    }

    return reformas;
}

/* Guarda en Firestore. Merge, no set a secas: si mañana se añade un
   campo, las reformas viejas no se quedan a medias. */
async function guardar(db, reformas) {
    if (!db) return 0;

    let escritas = 0;

    for (const reforma of reformas) {
        await db.collection(COLECCION).doc(reforma.clave).set({
            ...reforma,
            actualizado: new Date()
        }, { merge: true });
        escritas++;
    }

    return escritas;
}

module.exports = async function handler(req, res) {
    const permiso = llamadaAutorizada(req);
    if (!permiso.vale) { res.status(401).json({ error: permiso.motivo }); return; }

    const anios = Math.min(Math.max(Number(req.query?.anios) || ANIOS_POR_DEFECTO, 1), 25);
    const desdeAnio = new Date().getFullYear() - anios;
    const seco = req.query?.seco === '1';
    const unaSola = req.query?.norma ? normaPorId(String(req.query.norma)) : null;

    if (req.query?.norma && !unaSola) {
        res.status(400).json({ error: 'Esa norma no está en el catálogo' });
        return;
    }

    const aRepasar = unaSola ? [unaSola] : NORMAS;
    const todas = [];
    const fallos = [];

    try {
        for (let i = 0; i < aRepasar.length; i += A_LA_VEZ) {
            const tanda = aRepasar.slice(i, i + A_LA_VEZ);

            const resultados = await Promise.all(tanda.map(async (norma) => {
                try {
                    return await reformasDeUnaNorma(norma, desdeAnio);
                } catch (error) {
                    fallos.push(`${norma.id} (${norma.nombre}): ${error.message}`);
                    return [];
                }
            }));

            resultados.forEach(lista => todas.push(...lista));
        }

        const escritas = seco ? 0 : await guardar(obtenerFirestore(), todas);

        res.status(200).json({
            desdeAnio,
            leyesRepasadas: aRepasar.length,
            reformasEncontradas: todas.length,
            reformasGuardadas: escritas,
            seco,
            fallos,
            /* Se devuelve el detalle para poder mirarlo en el
               navegador sin abrir Firestore. */
            reformas: todas.map(r => ({
                ley: r.norma.nombre,
                articulos: r.articulos,
                anio: r.anio,
                relacion: r.relacion,
                por: r.tituloModificadora || r.idModificadora
            }))
        });

    } catch (error) {
        console.error('[reformas-repaso] Falló el repaso:', error);
        res.status(500).json({ error: error.message, fallos });
    }
};

module.exports.paraPruebas = { anioDelIdentificador, esUnaReforma, COLECCION };
