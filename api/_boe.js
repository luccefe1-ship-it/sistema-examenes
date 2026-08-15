// ============================================================
//  /api/_boe.js
//  Cliente de la API de datos abiertos del BOE.
//
//  Por qué existe: el temario de la oposición se apoya en normas
//  que cambian. Hasta ahora la única forma de enterarse era que
//  alguien lo leyera. Esto lo mira solo, una vez al día.
//
//  Son dos APIs distintas y hacen falta las dos:
//
//    SUMARIO       -> qué se ha publicado HOY. Sirve para enterarse
//                     de convocatorias y de disposiciones nuevas.
//    CONSOLIDADA   -> si una norma CONCRETA del temario ha sido
//                     modificada, y qué artículos. Esto es lo que
//                     de verdad afecta a las preguntas del banco.
//
//  No necesita clave ni registro: son datos abiertos. Documentación:
//  https://www.boe.es/datosabiertos/api/api.php
//
//  Los archivos que empiezan por "_" no son endpoints: Vercel los
//  ignora al crear rutas.
// ============================================================

const RAIZ = 'https://boe.es/datosabiertos/api';

// El BOE no publica domingos ni festivos: esos días la API contesta
// 404. NO es un error, es que no hay boletín. Distinguirlo importa,
// porque si se tratara como fallo el vigilante reintentaría todos los
// domingos y avisaría de una avería que no existe.
const SIN_BOLETIN = Symbol('sin-boletin');

const MAX_REINTENTOS = 3;
const TIEMPO_LIMITE_MS = 20000;

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Fallo del servidor del BOE o corte de red: reintentar tiene sentido.
// Un 400 o un 404 no se arreglan repitiendo.
function esTemporal(estado) {
    return estado === 429 || estado >= 500;
}

/* La API devuelve JSON solo si se lo pides por la cabecera Accept.
   Sin ella contesta XML y JSON.parse revienta con un mensaje que no
   dice nada ("Unexpected token <"). */
async function pedirJson(ruta) {
    let ultimoFallo = null;

    for (let intento = 1; intento <= MAX_REINTENTOS; intento++) {
        let respuesta;

        try {
            respuesta = await fetch(`${RAIZ}${ruta}`, {
                headers: { Accept: 'application/json' },
                signal: AbortSignal.timeout(TIEMPO_LIMITE_MS)
            });
        } catch (error) {
            // Timeout o red caída: cuenta como temporal
            ultimoFallo = error.message;
            if (intento < MAX_REINTENTOS) { await esperar(1000 * intento); continue; }
            throw new Error(`No se pudo contactar con el BOE (${ruta}): ${ultimoFallo}`);
        }

        if (respuesta.ok) {
            const texto = await respuesta.text();
            try {
                return JSON.parse(texto);
            } catch (error) {
                // Ha contestado 200 pero con algo que no es JSON. Suele ser
                // una página de mantenimiento del BOE.
                throw new Error(`El BOE devolvió algo que no es JSON en ${ruta}: ${texto.slice(0, 120)}`);
            }
        }

        if (respuesta.status === 404) return SIN_BOLETIN;

        ultimoFallo = `${respuesta.status}`;
        if (esTemporal(respuesta.status) && intento < MAX_REINTENTOS) {
            await esperar(1000 * intento);
            continue;
        }

        throw new Error(`El BOE respondió ${respuesta.status} en ${ruta}`);
    }

    throw new Error(`El BOE no respondió tras ${MAX_REINTENTOS} intentos (${ruta}): ${ultimoFallo}`);
}

/* LA TRAMPA DEL JSON DEL BOE, y el motivo de que exista esta función.

   La API genera el JSON a partir del XML, y en XML no se distingue
   "una cosa" de "una lista de una cosa". Resultado: un campo que
   normalmente es array llega como OBJETO SUELTO cuando solo hay un
   elemento. Pasa en 'diario', 'seccion', 'departamento', 'epigrafe'
   e 'item', y en 'item' pasa constantemente.

   Sin esto, el código funciona en pruebas y falla el día que una
   sección trae una sola disposición: se recorren las CLAVES del
   objeto en vez de sus elementos. */
function comoLista(valor) {
    if (valor === null || valor === undefined) return [];
    return Array.isArray(valor) ? valor : [valor];
}

// Las URLs vienen unas veces como cadena y otras como objeto con el
// tamaño del fichero y el texto dentro.
function comoUrl(valor) {
    if (!valor) return '';
    if (typeof valor === 'string') return valor;
    return valor.texto || valor['#text'] || '';
}

function fechaHoyMadrid() {
    // El servidor de Vercel va en UTC. A las 00:30 de Madrid en verano
    // allí todavía es el día anterior, así que el cron pediría el
    // boletín de ayer. Se fuerza el huso de Madrid.
    const partes = new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid',
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());

    const buscar = tipo => partes.find(p => p.type === tipo).value;
    return `${buscar('year')}${buscar('month')}${buscar('day')}`;
}

function fechaValida(fecha) {
    return /^\d{8}$/.test(String(fecha || ''));
}

function fechaLegible(fecha) {
    if (!fechaValida(fecha)) return String(fecha || '');
    return `${fecha.slice(6, 8)}/${fecha.slice(4, 6)}/${fecha.slice(0, 4)}`;
}

// ------------------------------------------------------------
//  SUMARIO DEL DÍA
// ------------------------------------------------------------

/* Devuelve el boletín de un día ya aplanado: una lista de
   disposiciones con su sección, departamento y epígrafe al lado.

   La estructura original está anidada a cinco niveles y obliga a
   arrastrar bucles por todas partes. Aplanar aquí una vez deja el
   resto del código legible.

   Si ese día no hubo boletín devuelve { hayBoletin: false }. */
async function obtenerSumario(fecha) {
    if (!fechaValida(fecha)) {
        throw new Error(`Fecha inválida: "${fecha}". Se espera AAAAMMDD.`);
    }

    const datos = await pedirJson(`/boe/sumario/${fecha}`);
    if (datos === SIN_BOLETIN) {
        return { hayBoletin: false, fecha, disposiciones: [] };
    }

    const sumario = datos?.data?.sumario;
    if (!sumario) {
        throw new Error(`Respuesta del BOE sin nodo sumario para ${fecha}`);
    }

    const disposiciones = [];

    for (const diario of comoLista(sumario.diario)) {
        for (const seccion of comoLista(diario.seccion)) {
            for (const departamento of comoLista(seccion.departamento)) {

                // Los items pueden colgar del departamento directamente
                // (secciones sin epígrafe) o de un epígrafe.
                const sueltos = comoLista(departamento.item).map(item => ({ item, epigrafe: '' }));
                const agrupados = comoLista(departamento.epigrafe).flatMap(epigrafe =>
                    comoLista(epigrafe.item).map(item => ({ item, epigrafe: epigrafe.nombre || '' }))
                );

                for (const { item, epigrafe } of [...sueltos, ...agrupados]) {
                    if (!item || !item.identificador) continue;

                    disposiciones.push({
                        id: item.identificador,
                        titulo: item.titulo || '',
                        seccion: String(seccion.codigo || ''),
                        seccionNombre: seccion.nombre || '',
                        departamento: departamento.nombre || '',
                        epigrafe,
                        urlHtml: comoUrl(item.url_html),
                        urlPdf: comoUrl(item.url_pdf),
                        urlXml: comoUrl(item.url_xml)
                    });
                }
            }
        }
    }

    return {
        hayBoletin: true,
        fecha,
        numeroDiario: comoLista(sumario.diario)[0]?.numero || '',
        disposiciones
    };
}

// ------------------------------------------------------------
//  LEGISLACIÓN CONSOLIDADA
// ------------------------------------------------------------

/* OJO CON LA FORMA DE LA RESPUESTA. Aquí "data" es un ARRAY con un
   único elemento dentro, no un objeto. Comprobado contra la API real:

     { "status": {...}, "data": [ { "materias": [...], "referencias": {...} } ] }

   Y dentro, "posteriores" es una lista de UN objeto que contiene la
   lista de verdad:

     referencias.posteriores[0].posterior[] -> { id_norma, relacion, texto }

   Escribir esto de memoria sale mal: la primera versión leía
   data.analisis y data.metadatos, que no existen, así que las 19
   normas del catálogo daban "no existe". */
function primerElemento(datos) {
    const data = datos?.data;
    if (Array.isArray(data)) return data[0] || {};
    return data || {};
}

/* Referencias posteriores: las normas que han tocado esta después.

   LO QUE NO HAY, Y CONDICIONA TODO: aquí NO viene la fecha. Solo
   quién, qué relación y una frase con el detalle. Por eso el
   vigilante no puede preguntar "¿qué ha cambiado esta semana?" y en
   su lugar compara esta lista con la que vio la última vez. */
async function obtenerAnalisis(idNorma) {
    const datos = await pedirJson(`/legislacion-consolidada/id/${encodeURIComponent(idNorma)}/analisis`);
    if (datos === SIN_BOLETIN) return null;

    const nodo = primerElemento(datos);
    const referencias = [];

    for (const grupo of comoLista(nodo?.referencias?.posteriores)) {
        for (const ref of comoLista(grupo?.posterior || grupo)) {
            if (!ref || typeof ref !== 'object' || !ref.id_norma) continue;

            referencias.push({
                // Quién la tocó: identificador BOE de la norma modificadora
                idModificadora: ref.id_norma,
                // Qué le hizo: "SE MODIFICA", "SE DEROGA", "Recurso"...
                relacion: ref.relacion?.texto || ref.relacion || '',
                codigoRelacion: ref.relacion?.codigo || '',
                // El detalle, que es de donde salen los artículos
                texto: ref.texto || ''
            });
        }
    }

    return { referencias };
}

/* Metadatos: sirven para tres cosas. Confirmar que un identificador
   del catálogo existe de verdad, quedarse con el título oficial, y
   saber cuándo se actualizó por última vez la versión consolidada. */
async function obtenerMetadatos(idNorma) {
    const datos = await pedirJson(`/legislacion-consolidada/id/${encodeURIComponent(idNorma)}/metadatos`);
    if (datos === SIN_BOLETIN) return null;

    const meta = primerElemento(datos);
    if (!meta.titulo) return null;

    return {
        id: meta.identificador || idNorma,
        titulo: meta.titulo,
        fechaActualizacion: meta.fecha_actualizacion || '',
        derogada: meta.estatus_derogacion === 'S',
        urlConsolidada: meta.url_html_consolidada || `https://www.boe.es/buscar/act.php?id=${idNorma}`
    };
}

/* Comprueba si un identificador existe. Devuelve el título si existe,
   null si no. Lo usa el modo verificación del vigilante: un ID mal
   escrito en el catálogo no da error, simplemente deja de vigilarse
   esa norma para siempre y nadie se entera. */
async function existeNorma(idNorma) {
    try {
        const meta = await obtenerMetadatos(idNorma);
        return meta && meta.titulo ? meta.titulo : null;
    } catch (error) {
        return null;
    }
}

// ------------------------------------------------------------
//  Artículos citados en un texto
// ------------------------------------------------------------

/* De "Modifica los arts. 23, 45 bis y 102 a 104" saca [23, 45, 102, 103, 104].

   Sirve para cruzar contra las preguntas del banco: si cambió el
   artículo 45, las preguntas que lo citan hay que revisarlas.

   Es una heurística y se comporta como tal: marca preguntas para que
   las mires, no las borra ni las corrige. Un falso positivo cuesta una
   ojeada; un falso negativo, estudiar mal. */
function articulosCitados(texto) {
    const encontrados = new Set();
    const limpio = String(texto || '');

    // "arts. 23, 45 y 102" / "artículo 5"
    const bloques = limpio.matchAll(/art(?:s|ículos?|\.)?\s*\.?\s*([\d\s,.ybisteryquaá-]+)/gi);

    for (const bloque of bloques) {
        const trozo = bloque[1];

        // Rangos: "102 a 104"
        for (const rango of trozo.matchAll(/(\d+)\s*(?:a|al)\s*(\d+)/g)) {
            const desde = parseInt(rango[1], 10);
            const hasta = parseInt(rango[2], 10);
            // Un rango disparatado suele ser que la expresión ha cazado
            // dos cosas distintas. Se ignora antes que meter mil números.
            if (hasta > desde && hasta - desde <= 60) {
                for (let n = desde; n <= hasta; n++) encontrados.add(n);
            }
        }

        /* El (?<![\d.]) descarta los apartados. En el BOE se cita
           "el art. 175.3" y "los arts. 570 bis.1 y 599.1": sin esto
           entrarían también el 3 y el 1 como si fueran artículos, y
           el artículo 1 lo menciona media plataforma. */
        for (const numero of trozo.matchAll(/(?<![\d.])\d+/g)) {
            const n = parseInt(numero[0], 10);
            // Por encima de 2000 casi siempre es un año colado
            if (n > 0 && n < 2000) encontrados.add(n);
        }
    }

    return [...encontrados].sort((a, b) => a - b);
}

module.exports = {
    obtenerSumario,
    obtenerAnalisis,
    obtenerMetadatos,
    existeNorma,
    articulosCitados,
    fechaHoyMadrid,
    fechaValida,
    fechaLegible,
    comoLista,
    SIN_BOLETIN
};
