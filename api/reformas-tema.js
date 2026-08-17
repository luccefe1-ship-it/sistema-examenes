// ============================================================
//  /api/reformas-tema.js
//  Las reformas de UN tema, preguntadas al BOE en el momento.
//
//  POR QUÉ EN EL MOMENTO Y NO DE LA BASE DE DATOS. El repaso semanal
//  llena una colección, pero mientras no se haya ejecutado ni una
//  vez esa colección está vacía y la pantalla dice "sin
//  modificaciones", que es exactamente lo contrario de la verdad.
//  Un aviso que depende de que alguien haya lanzado un cron no es un
//  aviso: es una promesa.
//
//  Así que al abrir un tema se le pregunta al BOE por las leyes de
//  ESE tema —dos o tres, no las cuarenta y dos— y se contesta con lo
//  que diga hoy. Siempre al día, sin nada que mantener.
//
//  QUÉ DEVUELVE. Solo los artículos que entran en ese tema. Si la
//  reforma tocó veinte artículos y el tema estudia dos, salen los
//  dos y se dice cuántos quedan fuera.
//
//  NO INTERPRETA NADA. Lee el análisis oficial de referencias
//  posteriores y lo traduce a "qué artículo y cuándo". Ni resume ni
//  deduce.
// ============================================================

const { usuarioAutenticado } = require('./_auth');
const { obtenerAnalisis, articulosCitados } = require('./_boe');
const { normaPorId } = require('./_normas');
const { temarioDe } = require('./_temarios');
const { articulosQueAfectan, leyesDelTema, tieneListado } = require('./_articulos-temario');
const { fichaConvocatoria, cuerpoValido, CUERPO_POR_DEFECTO } = require('./_convocatoria');

// Cuántos años de reformas se enseñan
const ANIOS = 2;

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
               'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/* El análisis del BOE dice: "el art. 69.3, por Reforma de 19 de mayo
   de 2026 (Ref. BOE-A-2026-10881)". De ahí sale la fecha exacta sin
   tener que pedir los metadatos de la norma modificadora, que es una
   llamada más por reforma. */
function fechaDelTexto(texto) {
    const encontrado = String(texto || '').toLowerCase()
        .match(/de (\d{1,2}) de ([a-záéíóú]+) de (\d{4})/);

    if (!encontrado) return '';

    const mes = MESES.indexOf(encontrado[2]);
    if (mes === -1) return '';

    return `${encontrado[3]}-${String(mes + 1).padStart(2, '0')}-${String(encontrado[1]).padStart(2, '0')}`;
}

function anioDelIdentificador(id) {
    const encontrado = String(id || '').match(/^BOE-[A-Z]-(\d{4})-/);
    return encontrado ? Number(encontrado[1]) : null;
}

/* Solo lo que reescribe la ley. Recursos, sentencias y declaraciones
   del Constitucional no cambian el temario. */
function esUnaReforma(referencia) {
    const relacion = String(referencia.relacion || '').toLowerCase();
    return /modific|deroga|a[ñn]ade|suprime|nueva redacci|sustituye/.test(relacion);
}

/* Dónde cae respecto a tu examen. No se decide si "entra": se dice
   de qué lado del corte está y con qué fecha. */
function situarEnElTiempo(fecha, fechaConvocatoria, fechaExamen) {
    if (!fecha) return 'desconocida';
    if (fecha < fechaConvocatoria) return 'previa';
    if (fecha <= fechaExamen) return 'posterior';
    return 'futura';
}

module.exports = async function handler(req, res) {
    const origen = req.headers.origin || '';
    if (origen) res.setHeader('Access-Control-Allow-Origin', origen);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');

    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido' }); return; }

    // Autenticado, pero sin gastar cupo: esto no llama a ninguna IA
    const usuario = await usuarioAutenticado(req, res);
    if (!usuario) return;

    const clave = cuerpoValido(req.body?.cuerpo) ? req.body.cuerpo : CUERPO_POR_DEFECTO;
    const numero = Number(req.body?.tema);

    const tema = temarioDe(clave).find(t => t.numero === numero);
    if (!tema) { res.status(400).json({ error: 'Ese tema no existe en el programa' }); return; }

    const ficha = fichaConvocatoria(clave);
    const fechaConvocatoria = ficha.hitos.find(h => h.idBoe === ficha.idBoeConvocatoria)?.fecha || '2025-12-30';
    const desdeAnio = new Date().getFullYear() - ANIOS;

    const porArticulo = tieneListado(clave);
    const declaradas = porArticulo ? (leyesDelTema(clave, numero) || {}) : null;

    /* Las leyes del tema. Con listado de artículos se usan las que
       declara la academia; sin él, las que se deducen del enunciado. */
    const leyes = (porArticulo ? Object.keys(declaradas) : tema.normas)
        .map(id => normaPorId(id))
        .filter(Boolean);

    const reformas = [];
    const fallos = [];

    try {
        for (const ley of leyes) {
            let analisis;

            try {
                analisis = await obtenerAnalisis(ley.id);
            } catch (error) {
                fallos.push(`${ley.nombre}: ${error.message}`);
                continue;
            }

            if (!analisis) continue;

            for (const ref of analisis.referencias) {
                if (!esUnaReforma(ref)) continue;

                const anio = anioDelIdentificador(ref.idModificadora);
                const fecha = fechaDelTexto(ref.texto);

                // Filtro por año: el análisis de la LEC trae reformas
                // desde el 2000 y aquí solo interesan las recientes.
                const anioReal = fecha ? Number(fecha.slice(0, 4)) : anio;
                if (anioReal === null || anioReal < desdeAnio) continue;

                const citados = articulosCitados(ref.texto);
                let articulos = citados;

                if (porArticulo && citados.length) {
                    const cruce = articulosQueAfectan(clave, numero, ley.id, citados);
                    if (!cruce.length) continue;      // tocaron otros artículos
                    articulos = cruce;
                }

                reformas.push({
                    norma: { id: ley.id, nombre: ley.nombre },
                    articulos,
                    fueraDelTema: Math.max(0, citados.length - articulos.length),
                    relacion: ref.relacion,
                    texto: ref.texto,
                    idModificadora: ref.idModificadora,
                    fecha,
                    anio: anioReal,
                    cuando: situarEnElTiempo(fecha, fechaConvocatoria, ficha.fechaExamen),
                    url: `https://www.boe.es/buscar/doc.php?id=${encodeURIComponent(ref.idModificadora)}`,
                    urlLey: `https://www.boe.es/buscar/act.php?id=${encodeURIComponent(ley.id)}`
                });
            }
        }

        // Lo más reciente primero: es lo que aún no has estudiado
        reformas.sort((a, b) => String(b.fecha || b.anio).localeCompare(String(a.fecha || a.anio)));

        res.status(200).json({
            tema: { numero: tema.numero, titulo: tema.titulo },
            desdeAnio,
            porArticulo,
            leyesConsultadas: leyes.map(l => l.nombre),
            reformas,
            fallos
        });

    } catch (error) {
        console.error('[reformas-tema] Falló la consulta:', error);
        res.status(502).json({ error: `No se pudo leer el BOE: ${error.message}` });
    }
};

module.exports.paraPruebas = { fechaDelTexto, esUnaReforma, situarEnElTiempo, anioDelIdentificador };
