// ============================================================
//  /api/articulo.js
//  Devuelve la TRANSCRIPCIÓN LITERAL de un artículo tal y como está
//  hoy en el texto consolidado del BOE.
//
//  POR QUÉ EXISTE: cuando se avisa de que han tocado el artículo 155
//  de la LEC, lo primero que quiere uno es leer cómo ha quedado. Sin
//  esto habría que abrir el BOE y buscarlo a mano en una ley de mil
//  artículos.
//
//  LO QUE NO HACE: no resume, no interpreta y no reescribe. O
//  devuelve el texto oficial tal cual, o dice que no lo ha
//  encontrado y deja el enlace. Un artículo "casi bien" es peor que
//  ninguno, porque se estudia y se da por bueno.
// ============================================================

const { usuarioAutenticado } = require('./_auth');
const { obtenerTextoArticulo } = require('./_boe');
const { normaPorId } = require('./_normas');

// Cuántos artículos se piden de una vez. Cada uno son dos llamadas al
// BOE, así que conviene no abrir la mano.
const MAX_ARTICULOS = 12;

module.exports = async function handler(req, res) {
    const origen = req.headers.origin || '';
    if (origen) res.setHeader('Access-Control-Allow-Origin', origen);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');

    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido' }); return; }

    /* Autenticado pero sin gastar cupo: esto no llama a ninguna IA,
       solo relee el BOE, que es público. */
    const usuario = await usuarioAutenticado(req, res);
    if (!usuario) return;

    const idNorma = String(req.body?.norma || '');
    const pedidos = Array.isArray(req.body?.articulos) ? req.body.articulos : [];

    const norma = normaPorId(idNorma);
    if (!norma) {
        res.status(400).json({ error: 'Esa norma no está en el catálogo vigilado' });
        return;
    }

    try {
        const articulos = [];

        // En serie, no en paralelo: son doce peticiones a un servicio
        // público y no hay ninguna prisa por castigarlo.
        for (const pedido of pedidos.slice(0, MAX_ARTICULOS)) {
            const texto = await obtenerTextoArticulo(idNorma, pedido);
            articulos.push({
                articulo: String(pedido),
                titulo: texto?.titulo || `Artículo ${pedido}`,
                texto: texto?.texto || null,
                encontrado: !!texto
            });
        }

        res.status(200).json({
            norma: { id: norma.id, nombre: norma.nombre },
            url: `https://www.boe.es/buscar/act.php?id=${encodeURIComponent(norma.id)}`,
            articulos
        });

    } catch (error) {
        console.error('[articulo] No se pudo leer el BOE:', error);
        res.status(502).json({ error: `No se pudo leer el BOE: ${error.message}` });
    }
};
