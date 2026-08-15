// ============================================================
//  /api/boe-vigilante.js
//  Mira el BOE una vez al día y deja avisos en Firestore.
//
//  Lo dispara Vercel Cron (ver el bloque "crons" de vercel.json).
//  No lo llama el navegador nunca.
//
//  POR QUÉ NO USA _auth.js: _auth comprueba el ID token de un
//  usuario de Firebase, y un cron no tiene usuario. Se protege con
//  CRON_SECRET, que Vercel manda en la cabecera Authorization.
//  Sin esa comprobación cualquiera podría dispararlo desde fuera y
//  gastar cupo de Gemini a tu costa.
//
//  QUÉ HACE, en orden:
//    1. Pide el sumario del día y se queda con lo que toca Justicia.
//    2. Pregunta a la API de legislación consolidada si alguna norma
//       del temario ha sido modificada, y qué artículos.
//    3. Cruza esos artículos con las preguntas del banco de cada
//       usuario y las marca para revisar.
//    4. Resume todo en lenguaje llano con Gemini (cupo gratuito).
//    5. Escribe los avisos en Firestore.
//
//  NO BORRA NI CORRIGE NADA. Solo señala. El cruce por artículo es
//  una heurística: un falso positivo cuesta una ojeada, y borrar
//  una pregunta buena cuesta mucho más.
//
//  MODOS:
//    GET /api/boe-vigilante                 -> el boletín de hoy
//    GET /api/boe-vigilante?fecha=20260814  -> un día concreto
//    GET /api/boe-vigilante?dias=7          -> los últimos 7 días
//    GET /api/boe-vigilante?verificar=1     -> comprueba el catálogo
//    GET /api/boe-vigilante?revisar=BOE-A-2025-76
//                                           -> qué preguntas tocó esa reforma
//    GET /api/boe-vigilante?seco=1          -> no escribe nada
// ============================================================

const {
    obtenerSumario, obtenerAnalisis, obtenerMetadatos, existeNorma,
    articulosCitados, fechaHoyMadrid, fechaValida, fechaLegible
} = require('./_boe');

const { NORMAS, clasificarDisposicion, normasCitadas, normalizar } = require('./_normas');
const { obtenerFirestore } = require('./_consumo');
const { llamarGemini, obtenerClaves } = require('./_gemini');

// Tope de días en una llamada manual, para que un ?dias=400 por error
// no encadene 400 peticiones al BOE.
const MAX_DIAS_MANUAL = 31;

// Preguntas señaladas por norma y usuario. Si una reforma toca medio
// código, el aviso no debe convertirse en una lista de mil preguntas
// que nadie va a mirar.
const MAX_PREGUNTAS_SENALADAS = 40;

// ------------------------------------------------------------
//  Puerta de entrada
// ------------------------------------------------------------

/* Vercel Cron manda "Authorization: Bearer <CRON_SECRET>".
   Se acepta también x-cron-secret para poder dispararlo a mano
   desde la terminal sin pelearse con la cabecera. */
function llamadaAutorizada(req) {
    const secreto = (process.env.CRON_SECRET || '').trim();

    // Sin secreto configurado no se abre la puerta: es preferible que
    // el cron falle y se vea, a quedarse abierto sin que nadie lo note.
    if (!secreto) return { vale: false, motivo: 'Falta la variable CRON_SECRET en Vercel.' };

    const cabecera = req.headers.authorization || '';
    const alternativa = req.headers['x-cron-secret'] || '';

    const enviado = cabecera.startsWith('Bearer ')
        ? cabecera.slice(7).trim()
        : String(alternativa).trim();

    if (!enviado || enviado !== secreto) {
        return { vale: false, motivo: 'No autorizado.' };
    }

    return { vale: true };
}

// ------------------------------------------------------------
//  Paso 1: el sumario del día
// ------------------------------------------------------------
async function revisarSumario(fecha) {
    const sumario = await obtenerSumario(fecha);

    if (!sumario.hayBoletin) {
        // Domingo o festivo. No es un fallo.
        return { hayBoletin: false, fecha, hallazgos: [] };
    }

    const hallazgos = [];

    for (const disposicion of sumario.disposiciones) {
        const clasificacion = clasificarDisposicion(disposicion);
        if (!clasificacion) continue;

        const citadas = normasCitadas(disposicion.titulo);

        hallazgos.push({
            clave: `${fecha}-${disposicion.id}`,
            tipo: clasificacion.tipo,
            motivo: clasificacion.motivo,
            fecha,
            titulo: disposicion.titulo,
            departamento: disposicion.departamento,
            seccion: disposicion.seccionNombre,
            urlHtml: disposicion.urlHtml,
            urlPdf: disposicion.urlPdf,
            normas: citadas.map(n => ({ id: n.id, nombre: n.nombre, bloque: n.bloque })),
            articulos: articulosCitados(disposicion.titulo)
        });
    }

    return {
        hayBoletin: true,
        fecha,
        total: sumario.disposiciones.length,
        hallazgos
    };
}

// ------------------------------------------------------------
//  Paso 2: ¿han tocado alguna norma del temario?
// ------------------------------------------------------------

/* CÓMO SE SABE QUÉ ES NUEVO, Y POR QUÉ ASÍ.

   La idea original era filtrar las referencias por fecha: "dame lo
   modificado en los últimos 10 días". No se puede: la API de
   legislación consolidada NO devuelve fecha en las referencias. Cada
   una trae solo quién la tocó, qué relación y una frase de detalle.
   La LOPJ tiene 146 referencias posteriores y ninguna lleva fecha.

   Así que se hace por comparación: cada ejecución guarda los
   identificadores de las referencias que ha visto, y a la siguiente
   avisa de las que no estaban. No depende de ningún campo que el BOE
   pueda no darnos.

   LA PRIMERA VEZ NO AVISA DE NADA. Solo siembra la línea base. Si no,
   la primera ejecución soltaría cientos de avisos de reformas de los
   años ochenta. Queda anotado en el informe como "sembradas". */
const COLECCION_ESTADO_NORMAS = 'boeNormasEstado';

/* Relaciones que cambian lo que hay que estudiar. Las demás
   (recursos y cuestiones de inconstitucionalidad) se avisan también,
   pero con menos importancia: interesan, pero no reescriben la ley
   hasta que se resuelven. */
function esCambioDeContenido(relacion) {
    return /modific|deroga|añad|anad|renumera|sustituy|corrig/i.test(String(relacion || ''));
}

function restarDias(fecha, dias) {
    const anio = Number(fecha.slice(0, 4));
    const mes = Number(fecha.slice(4, 6)) - 1;
    const dia = Number(fecha.slice(6, 8));
    const d = new Date(Date.UTC(anio, mes, dia));
    d.setUTCDate(d.getUTCDate() - dias);
    return d.toISOString().slice(0, 10).replace(/-/g, '');
}

/* Las normas se consultan de cuatro en cuatro.

   Una a una son ~20 peticiones en fila y el cron se acerca peligrosamente
   al minuto que da Vercel; todas a la vez es un pico feo contra un
   servidor público que nos deja usar sus datos gratis. Cuatro es el
   punto medio: baja de 20 rondas a 5 sin agobiar al BOE. */
const NORMAS_A_LA_VEZ = 4;

async function enTandas(elementos, tamano, tarea) {
    const resultados = [];
    for (let i = 0; i < elementos.length; i += tamano) {
        const tanda = elementos.slice(i, i + tamano);
        resultados.push(...await Promise.all(tanda.map(tarea)));
    }
    return resultados;
}

/* Lee la foto anterior de cada norma. Sin Firestore no hay memoria,
   así que se devuelve vacío y no se avisará de nada: preferible a
   soltar 146 avisos históricos de golpe. */
async function cargarEstadoNormas(db) {
    if (!db) return {};

    const instantanea = await db.collection(COLECCION_ESTADO_NORMAS).get();
    const estado = {};
    instantanea.docs.forEach(doc => { estado[doc.id] = doc.data(); });
    return estado;
}

async function guardarEstadoNorma(db, idNorma, datos) {
    if (!db) return;
    await db.collection(COLECCION_ESTADO_NORMAS).doc(idNorma).set({
        ...datos,
        actualizado: new Date()
    }, { merge: true });
}

/* En modo seco se LEE la memoria pero no se escribe. Si no se leyera,
   el modo seco diría siempre "todas sembradas, nada nuevo" y no
   serviría para ver qué habría detectado, que es justo para lo que
   está. */
async function revisarModificaciones(hasta, db, soloLectura = false) {
    const anotar = soloLectura ? async () => {} : guardarEstadoNorma;
    const hallazgos = [];
    const fallos = [];
    const sembradas = [];

    const estadoPrevio = await cargarEstadoNormas(db);

    const analisisPorNorma = await enTandas(NORMAS, NORMAS_A_LA_VEZ, async (norma) => {
        try {
            const [analisis, metadatos] = await Promise.all([
                obtenerAnalisis(norma.id),
                obtenerMetadatos(norma.id)
            ]);
            return { norma, analisis, metadatos };
        } catch (error) {
            // Que falle una norma no debe tumbar la revisión entera:
            // se anota y se sigue con las demás.
            return { norma, analisis: null, error: error.message };
        }
    });

    for (const { norma, analisis, metadatos, error } of analisisPorNorma) {
        if (error) {
            fallos.push(`${norma.id} (${norma.nombre}): ${error}`);
            continue;
        }

        if (!analisis) {
            fallos.push(`${norma.id} (${norma.nombre}): no existe en legislación consolidada. Revisa el ID en _normas.js.`);
            continue;
        }

        // Una referencia se identifica por quién la hizo más su texto:
        // una misma norma modificadora puede tocar varias cosas.
        const huella = ref => `${ref.idModificadora}|${String(ref.texto).slice(0, 120)}`;
        const vistasAhora = analisis.referencias.map(huella);

        const previo = estadoPrevio[norma.id];
        const yaConocidas = new Set(previo?.referencias || []);

        // Primera vez que se mira esta norma: se guarda la foto y punto.
        if (!previo) {
            sembradas.push(norma.id);
            await anotar(db, norma.id, {
                idNorma: norma.id,
                nombre: norma.nombre,
                tituloOficial: metadatos?.titulo || '',
                fechaActualizacion: metadatos?.fechaActualizacion || '',
                referencias: vistasAhora,
                total: vistasAhora.length
            });
            continue;
        }

        const nuevas = analisis.referencias.filter(ref => !yaConocidas.has(huella(ref)));

        for (const ref of nuevas) {
            const articulos = articulosCitados(ref.texto);
            const deContenido = esCambioDeContenido(ref.relacion);

            hallazgos.push({
                clave: `mod-${norma.id}-${String(ref.idModificadora).replace(/[^\w-]/g, '')}`,
                tipo: 'modificacion',
                motivo: `${norma.nombre}: ${ref.relacion || 'referencia nueva'}`,
                fecha: hasta,
                titulo: `${norma.nombre} — ${ref.relacion || 'modificada'}${articulos.length ? ` (arts. ${articulos.join(', ')})` : ''}`,
                detalle: ref.texto,
                urlHtml: metadatos?.urlConsolidada || `https://www.boe.es/buscar/act.php?id=${norma.id}`,
                urlPdf: '',
                departamento: '',
                seccion: 'Legislación consolidada',
                normas: [{ id: norma.id, nombre: norma.nombre, bloque: norma.bloque }],
                articulos,
                // Un recurso de inconstitucionalidad interesa, pero todavía
                // no cambia el texto: no merece el mismo rojo que una reforma.
                importanciaMinima: deContenido ? 'alta' : 'media'
            });
        }

        if (nuevas.length) {
            await anotar(db, norma.id, {
                idNorma: norma.id,
                nombre: norma.nombre,
                tituloOficial: metadatos?.titulo || previo.tituloOficial || '',
                fechaActualizacion: metadatos?.fechaActualizacion || '',
                referencias: vistasAhora,
                total: vistasAhora.length
            });
        }
    }

    return { hallazgos, fallos, sembradas };
}

// ------------------------------------------------------------
//  Paso 3: qué preguntas del banco quedan en entredicho
// ------------------------------------------------------------

/* Devuelve, por usuario, las preguntas que citan alguno de los
   artículos modificados de alguna de las normas afectadas.

   Se exige que aparezcan LAS DOS COSAS, la norma y el artículo. Con
   solo el número, "artículo 24" salta en media plataforma. */
function preguntasQueCitan(temas, normas, articulos) {
    if (!normas.length || !articulos.length) return {};

    const etiquetas = normas.flatMap(n => {
        const catalogo = NORMAS.find(x => x.id === n.id);
        return catalogo ? [catalogo.nombre, ...catalogo.alias] : [n.nombre];
    }).map(normalizar).filter(Boolean);

    const numeros = new Set(articulos);
    const porUsuario = {};

    for (const tema of temas) {
        for (let i = 0; i < (tema.preguntas || []).length; i++) {
            const pregunta = tema.preguntas[i] || {};
            const texto = normalizar(
                `${pregunta.pregunta || pregunta.enunciado || ''} ${pregunta.explicacion || ''}`
            );
            if (!texto) continue;

            const mencionaNorma = etiquetas.some(etiqueta => {
                if (etiqueta.length <= 6) {
                    return new RegExp(`(^|[^a-z0-9])${etiqueta}([^a-z0-9]|$)`).test(texto);
                }
                return texto.includes(etiqueta);
            });
            if (!mencionaNorma) continue;

            const citados = articulosCitados(texto);
            const coincide = citados.filter(n => numeros.has(n));
            if (!coincide.length) continue;

            const usuario = tema.usuarioId || 'desconocido';
            porUsuario[usuario] = porUsuario[usuario] || [];

            if (porUsuario[usuario].length < MAX_PREGUNTAS_SENALADAS) {
                porUsuario[usuario].push({
                    temaId: tema.id,
                    temaNombre: tema.nombre || '',
                    indice: i,
                    articulos: coincide,
                    enunciado: String(pregunta.pregunta || pregunta.enunciado || '').slice(0, 200)
                });
            }
        }
    }

    return porUsuario;
}

/* Se leen los temas una sola vez por ejecución. Son decenas de
   documentos con las preguntas dentro (el banco entero son ~10.000
   preguntas repartidas en pocos documentos), así que una lectura
   diaria no mueve la aguja de la cuota de Firestore. */
async function cargarTemas(db) {
    if (!db) return [];
    const instantanea = await db.collection('temas').get();
    return instantanea.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// ------------------------------------------------------------
//  Paso 4: resumen en lenguaje llano
// ------------------------------------------------------------
const INSTRUCCIONES_RESUMEN = `Eres un ayudante de un opositor a los cuerpos de Gestión Procesal y Tramitación Procesal de la Administración de Justicia española.

Recibes una lista de publicaciones del BOE ya filtradas. Para cada una devuelves:
- "resumen": dos frases como mucho, en español llano, explicando QUÉ cambia y A QUIÉN afecta. Nada de copiar el título. Si es una convocatoria, di de qué cuerpo y qué plazo o trámite abre.
- "importancia": "alta" si cambia el contenido de lo que hay que estudiar o abre un plazo que se puede perder; "media" si conviene saberlo; "baja" si es contexto.

No inventes datos que no estén en el texto. Si el título no da para más, dilo con naturalidad en vez de rellenar.`;

const ESQUEMA_RESUMEN = {
    type: 'object',
    properties: {
        avisos: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    clave: { type: 'string' },
                    resumen: { type: 'string' },
                    importancia: { type: 'string', enum: ['alta', 'media', 'baja'] }
                },
                required: ['clave', 'resumen', 'importancia']
            }
        }
    },
    required: ['avisos']
};

/* Una sola llamada para todos los avisos del día. El cupo gratuito de
   Gemini es de 20 peticiones diarias: una por ejecución entra de
   sobra, una por aviso lo fundiría un día movido.

   Si falla, no pasa nada: el aviso se guarda sin resumen. Es
   deliberado. El dato que importa (qué se publicó y qué artículos
   toca) sale del BOE, no del modelo. */
async function resumir(hallazgos) {
    if (!hallazgos.length) return {};
    if (!obtenerClaves().length) return {};

    const lista = hallazgos.map(h => ({
        clave: h.clave,
        titulo: h.titulo,
        detalle: String(h.detalle || '').slice(0, 400),
        departamento: h.departamento,
        seccion: h.seccion,
        normasAfectadas: h.normas.map(n => n.nombre)
    }));

    try {
        const { json } = await llamarGemini({
            instrucciones: INSTRUCCIONES_RESUMEN,
            prompt: JSON.stringify(lista, null, 1),
            esquema: ESQUEMA_RESUMEN,
            maxTokens: 8000
        });

        const porClave = {};
        for (const aviso of (json.avisos || [])) {
            porClave[aviso.clave] = {
                resumen: aviso.resumen || '',
                importancia: ['alta', 'media', 'baja'].includes(aviso.importancia) ? aviso.importancia : 'media'
            };
        }
        return porClave;

    } catch (error) {
        console.warn('[boe] No se pudo resumir con Gemini:', error.message);
        return {};
    }
}

// ------------------------------------------------------------
//  Paso 5: guardar
// ------------------------------------------------------------

/* Un documento por aviso, con la clave como identificador. Así el
   mismo día se puede reprocesar las veces que haga falta sin
   duplicar nada.

   NO se toca el campo "leido" al reescribir: si Luciano ya marcó un
   aviso como leído, una reejecución no debe devolvérselo a la cara. */
async function guardarAvisos(db, hallazgos, resumenes, afectadosPorClave) {
    if (!db) return { guardados: 0, nuevos: 0 };

    let guardados = 0;
    let nuevos = 0;

    for (const hallazgo of hallazgos) {
        const ref = db.collection('boeAvisos').doc(hallazgo.clave);
        const previo = await ref.get();
        const extra = resumenes[hallazgo.clave] || {};

        const datos = {
            tipo: hallazgo.tipo,
            motivo: hallazgo.motivo,
            fecha: hallazgo.fecha,
            fechaLegible: fechaLegible(hallazgo.fecha),
            titulo: hallazgo.titulo,
            detalle: hallazgo.detalle || '',
            departamento: hallazgo.departamento || '',
            seccion: hallazgo.seccion || '',
            urlHtml: hallazgo.urlHtml || '',
            urlPdf: hallazgo.urlPdf || '',
            normas: hallazgo.normas || [],
            articulos: hallazgo.articulos || [],
            resumen: extra.resumen || '',
            importancia: extra.importancia || hallazgo.importanciaMinima || 'media',
            actualizado: new Date()
        };

        if (!previo.exists) {
            datos.leido = false;
            datos.creado = new Date();
            nuevos++;
        }

        await ref.set(datos, { merge: true });
        guardados++;

        // Las preguntas señaladas van en una subcolección POR USUARIO.
        // El aviso del BOE es público, pero el banco de preguntas de
        // cada uno no: si esto colgara del documento principal, Sandra
        // vería los enunciados de Luciano y al revés.
        const afectados = afectadosPorClave[hallazgo.clave] || {};
        for (const [usuarioId, preguntas] of Object.entries(afectados)) {
            if (!preguntas.length) continue;
            await ref.collection('afectados').doc(usuarioId).set({
                usuarioId,
                preguntas,
                total: preguntas.length,
                actualizado: new Date()
            }, { merge: true });
        }
    }

    return { guardados, nuevos };
}

async function anotarEjecucion(db, informe) {
    if (!db) return;
    try {
        await db.collection('boeEstado').doc('vigilante').set({
            ...informe,
            momento: new Date()
        }, { merge: true });
    } catch (error) {
        console.error('[boe] No se pudo anotar la ejecución:', error.message);
    }
}

// ------------------------------------------------------------
//  Modo verificación del catálogo
// ------------------------------------------------------------

/* Pregunta al BOE por cada identificador de _normas.js.
   Existe porque un ID mal escrito es un fallo silencioso: esa norma
   deja de vigilarse y no lo notas hasta que te sorprende una reforma
   en el examen. */
/* ------------------------------------------------------------
   REPASO DE UNA REFORMA CONCRETA

   El vigilante diario solo avisa de lo que cambia a partir de hoy.
   Pero una reforma anterior a la puesta en marcha puede haber dejado
   medio banco desactualizado sin que nadie lo note, y eso no lo
   arregla esperar.

   Con ?revisar=BOE-A-2025-76 se recorre el catálogo buscando esa
   norma modificadora, se sacan los artículos que tocó en cada ley y
   se cruzan con las preguntas. No escribe avisos: devuelve el informe
   para mirarlo. Es una herramienta de auditoría, no del día a día.
   ------------------------------------------------------------ */
async function repasarReforma(idReforma, db) {
    const porNorma = [];

    const analisisPorNorma = await enTandas(NORMAS, NORMAS_A_LA_VEZ, async (norma) => {
        try {
            return { norma, analisis: await obtenerAnalisis(norma.id) };
        } catch (error) {
            return { norma, analisis: null, error: error.message };
        }
    });

    for (const { norma, analisis } of analisisPorNorma) {
        if (!analisis) continue;

        const tocadas = analisis.referencias.filter(ref => ref.idModificadora === idReforma);
        if (!tocadas.length) continue;

        const articulos = [...new Set(tocadas.flatMap(ref => articulosCitados(ref.texto)))]
            .sort((a, b) => a - b);

        porNorma.push({
            norma,
            articulos,
            detalle: tocadas.map(ref => `${ref.relacion}: ${ref.texto}`)
        });
    }

    // Una sola lectura del banco para todas las normas afectadas
    const temas = db ? await cargarTemas(db) : [];

    const resultado = porNorma.map(entrada => {
        const afectados = temas.length
            ? preguntasQueCitan(temas, [{ id: entrada.norma.id, nombre: entrada.norma.nombre }], entrada.articulos)
            : {};

        const preguntas = Object.values(afectados).flat();

        return {
            norma: entrada.norma.nombre,
            id: entrada.norma.id,
            articulos: entrada.articulos,
            detalle: entrada.detalle,
            preguntasAfectadas: preguntas.length,
            preguntas: preguntas.slice(0, MAX_PREGUNTAS_SENALADAS)
        };
    });

    return {
        reforma: idReforma,
        urlReforma: `https://www.boe.es/buscar/doc.php?id=${idReforma}`,
        normasAfectadas: resultado.length,
        totalPreguntas: resultado.reduce((s, r) => s + r.preguntasAfectadas, 0),
        bancoLeido: temas.length > 0,
        detalle: resultado
    };
}

async function verificarCatalogo() {
    const bien = [];
    const mal = [];

    const comprobadas = await enTandas(NORMAS, NORMAS_A_LA_VEZ, async (norma) => ({
        norma,
        titulo: await existeNorma(norma.id)
    }));

    for (const { norma, titulo } of comprobadas) {
        if (titulo) {
            bien.push({ id: norma.id, nombreEnCatalogo: norma.nombre, tituloOficial: titulo });
        } else {
            mal.push({ id: norma.id, nombreEnCatalogo: norma.nombre });
        }
    }

    return {
        total: NORMAS.length,
        correctas: bien.length,
        incorrectas: mal.length,
        aRevisar: mal,
        detalle: bien
    };
}

// ------------------------------------------------------------
//  Handler
// ------------------------------------------------------------
module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Método no permitido' });
        return;
    }

    const permiso = llamadaAutorizada(req);
    if (!permiso.vale) {
        res.status(401).json({ error: permiso.motivo });
        return;
    }

    const seco = req.query?.seco === '1' || req.query?.seco === 'true';

    try {
        // --- Modo verificación ---------------------------------
        if (req.query?.verificar === '1' || req.query?.verificar === 'true') {
            const informe = await verificarCatalogo();
            res.status(200).json({ modo: 'verificacion', ...informe });
            return;
        }

        // --- Repaso de una reforma concreta --------------------
        const idReforma = String(req.query?.revisar || '').trim();
        if (idReforma) {
            if (!/^BOE-A-\d{4}-\d+$/.test(idReforma)) {
                res.status(400).json({ error: 'El identificador debe tener la forma BOE-A-2025-76' });
                return;
            }
            const informe = await repasarReforma(idReforma, obtenerFirestore());
            res.status(200).json({ modo: 'repaso', ...informe });
            return;
        }

        // --- Qué días revisar ----------------------------------
        const hasta = fechaValida(req.query?.fecha) ? req.query.fecha : fechaHoyMadrid();
        const dias = Math.min(Math.max(parseInt(req.query?.dias, 10) || 1, 1), MAX_DIAS_MANUAL);

        const fechas = [];
        for (let i = 0; i < dias; i++) fechas.push(restarDias(hasta, i));

        // La memoria del vigilante vive en Firestore, así que hace
        // falta desde el paso 2 y no solo para guardar.
        const db = obtenerFirestore();

        // --- Paso 1: sumarios ----------------------------------
        const hallazgos = [];
        const diasSinBoletin = [];

        for (const fecha of fechas) {
            const revision = await revisarSumario(fecha);
            if (!revision.hayBoletin) { diasSinBoletin.push(fecha); continue; }
            hallazgos.push(...revision.hallazgos);
        }

        // --- Paso 2: modificaciones de las normas del temario ---
        const modificaciones = await revisarModificaciones(hasta, db, seco);
        hallazgos.push(...modificaciones.hallazgos);

        // --- Paso 3: preguntas en entredicho -------------------
        const afectadosPorClave = {};

        const conArticulos = hallazgos.filter(h => h.articulos.length && h.normas.length);
        if (db && conArticulos.length) {
            const temas = await cargarTemas(db);
            for (const hallazgo of conArticulos) {
                afectadosPorClave[hallazgo.clave] = preguntasQueCitan(temas, hallazgo.normas, hallazgo.articulos);
            }
        }

        // --- Paso 4: resumen -----------------------------------
        const resumenes = seco ? {} : await resumir(hallazgos);

        // --- Paso 5: guardar -----------------------------------
        const guardado = seco
            ? { guardados: 0, nuevos: 0 }
            : await guardarAvisos(db, hallazgos, resumenes, afectadosPorClave);

        const informe = {
            fechaRevisada: hasta,
            diasRevisados: fechas.length,
            diasSinBoletin,
            hallazgos: hallazgos.length,
            avisosNuevos: guardado.nuevos,
            normasConProblema: modificaciones.fallos,
            // Normas vistas por primera vez: se guarda su foto y NO se
            // avisa de su historial. En la primera ejecución salen las 19.
            normasSembradas: modificaciones.sembradas,
            seco
        };

        if (!seco) await anotarEjecucion(db, informe);

        console.log(`[boe] ${hasta}: ${hallazgos.length} hallazgos, ${guardado.nuevos} nuevos.`);

        res.status(200).json({
            ...informe,
            // En modo seco se devuelve el detalle para poder mirarlo
            detalle: seco ? hallazgos : undefined
        });

    } catch (error) {
        console.error('[boe] Falló la revisión:', error);
        const db = obtenerFirestore();
        await anotarEjecucion(db, { error: error.message, fechaRevisada: fechaHoyMadrid() });
        res.status(500).json({ error: error.message });
    }
};

// Se exportan las piezas sueltas para poder probarlas sin desplegar.
module.exports.paraPruebas = {
    llamadaAutorizada,
    revisarSumario,
    revisarModificaciones,
    preguntasQueCitan,
    verificarCatalogo,
    repasarReforma,
    esCambioDeContenido,
    restarDias
};
