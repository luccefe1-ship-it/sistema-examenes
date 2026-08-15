// Pruebas del vigilante del BOE. Ejecutar desde la raiz del repo:  npm test
//
// POR QUE ESTE ARCHIVO EXISTE. En las notas del repo esta escrito que
// `node --check` solo valida sintaxis y que una variable inexistente pasa
// el check y revienta en produccion (ya paso con `cuerpo is not defined`).
// Asi que aqui se EJECUTA el codigo de verdad, con el fetch global
// sustituido por uno de mentira. No toca ni el BOE ni Firebase.
//
// Lo que se comprueba:
//   1. El JSON del BOE se aplana bien, INCLUIDO el caso en que un campo
//      que suele ser lista llega como objeto suelto (la trampa del BOE).
//   2. Un domingo (404) no es un error.
//   3. El filtro deja pasar lo de Justicia y tira el resto.
//   4. Los articulos se extraen bien de frases reales.
//   5. El cruce con el banco exige norma Y articulo.
//   6. La puerta esta cerrada sin CRON_SECRET.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const rutaDe = (relativa) =>
    new URL(relativa, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const registrar = (...a) => process.stdout.write(a.join(' ') + '\n');
let pasadas = 0, fallidas = 0;
const fallos = [];

function comprobar(nombre, condicion, detalle) {
    if (condicion) { pasadas++; registrar(`  ✅ ${nombre}`); }
    else { fallidas++; fallos.push(nombre); registrar(`  ❌ ${nombre}${detalle ? '  → ' + detalle : ''}`); }
}

// ------------------------------------------------------------
//  Un fetch de mentira. Se le dice qué contestar a cada ruta.
// ------------------------------------------------------------
const fetchReal = globalThis.fetch;
let respuestas = {};
let llamadas = [];

globalThis.fetch = async (url) => {
    llamadas.push(String(url));
    const preparada = Object.entries(respuestas).find(([trozo]) => String(url).includes(trozo));

    if (!preparada) {
        return { ok: false, status: 404, text: async () => 'no preparado' };
    }

    const [, valor] = preparada;
    if (valor.estado && valor.estado !== 200) {
        return { ok: false, status: valor.estado, text: async () => '' };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(valor.cuerpo) };
};

// Se cargan DESPUES de pisar fetch, para que los módulos usen el falso.
const boe = require(rutaDe('../api/_boe.js'));
const normas = require(rutaDe('../api/_normas.js'));

// ============================================================
registrar('\n── 1. El sumario se aplana bien ──');
// ============================================================
{
    respuestas = {
        '/boe/sumario/20260814': {
            cuerpo: {
                status: { code: '200', text: 'ok' },
                data: {
                    sumario: {
                        metadatos: { publicacion: 'BOE', fecha_publicacion: '20260814' },
                        diario: [{
                            numero: '195',
                            seccion: [
                                {
                                    codigo: '1',
                                    nombre: 'I. Disposiciones generales',
                                    departamento: [{
                                        codigo: '5140',
                                        nombre: 'MINISTERIO DE JUSTICIA',
                                        epigrafe: [{
                                            nombre: 'Administración de Justicia',
                                            // UN SOLO item, como OBJETO y no como lista:
                                            // esta es la trampa del JSON del BOE.
                                            item: {
                                                identificador: 'BOE-A-2026-12345',
                                                titulo: 'Real Decreto por el que se modifica el Reglamento de ingreso en los Cuerpos de la Administración de Justicia',
                                                url_pdf: { szBytes: '100', texto: 'https://boe.es/x.pdf' },
                                                url_html: 'https://boe.es/x.html'
                                            }
                                        }]
                                    }]
                                },
                                {
                                    codigo: '5A',
                                    nombre: 'V. Anuncios',
                                    departamento: {
                                        codigo: '9999',
                                        nombre: 'AYUNTAMIENTO DE CUENCA',
                                        item: { identificador: 'BOE-B-2026-1', titulo: 'Licitación de obras' }
                                    }
                                }
                            ]
                        }]
                    }
                }
            }
        }
    };

    const sumario = await boe.obtenerSumario('20260814');

    comprobar('Dice que hubo boletín', sumario.hayBoletin === true);
    comprobar('Encuentra las dos disposiciones', sumario.disposiciones.length === 2,
        `encontró ${sumario.disposiciones.length}`);
    comprobar('Un item que viene como objeto suelto NO se pierde',
        sumario.disposiciones.some(d => d.id === 'BOE-A-2026-12345'));
    comprobar('Un departamento que viene como objeto suelto NO se pierde',
        sumario.disposiciones.some(d => d.id === 'BOE-B-2026-1'));
    comprobar('Arrastra la sección y el departamento a cada disposición',
        sumario.disposiciones[0].departamento === 'MINISTERIO DE JUSTICIA' &&
        sumario.disposiciones[0].seccion === '1');
    comprobar('La url_pdf en formato objeto se convierte en texto',
        sumario.disposiciones[0].urlPdf === 'https://boe.es/x.pdf');
    comprobar('Pide el JSON, no el XML',
        llamadas.some(u => u.includes('/boe/sumario/20260814')));
}

// ============================================================
registrar('\n── 2. Un domingo no es una avería ──');
// ============================================================
{
    respuestas = { '/boe/sumario/20260816': { estado: 404 } };

    const domingo = await boe.obtenerSumario('20260816');

    comprobar('Devuelve hayBoletin: false en vez de lanzar', domingo.hayBoletin === false);
    comprobar('Y la lista de disposiciones queda vacía', domingo.disposiciones.length === 0);
}

{
    // Una fecha con formato inválido sí debe protestar, y pronto: es un
    // fallo de programación, no del BOE.
    let protesto = false;
    try { await boe.obtenerSumario('14-08-2026'); } catch (e) { protesto = true; }
    comprobar('Una fecha mal formada da error claro', protesto);
}

// ============================================================
registrar('\n── 3. El filtro separa el grano de la paja ──');
// ============================================================
{
    const justicia = normas.clasificarDisposicion({
        seccion: '1',
        seccionNombre: 'I. Disposiciones generales',
        departamento: 'MINISTERIO DE JUSTICIA',
        epigrafe: 'Administración de Justicia',
        titulo: 'Real Decreto por el que se modifica el Reglamento de ingreso'
    });
    comprobar('Deja pasar una disposición de Justicia', justicia !== null);
    comprobar('Y la marca como disposición', justicia?.tipo === 'disposicion');

    const anuncio = normas.clasificarDisposicion({
        seccion: '5A',
        departamento: 'AYUNTAMIENTO DE CUENCA',
        epigrafe: '',
        titulo: 'Licitación de obras de pavimentación'
    });
    comprobar('Tira un anuncio de licitación municipal', anuncio === null);

    const oposicionAjena = normas.clasificarDisposicion({
        seccion: '2B',
        departamento: 'MINISTERIO DE DEFENSA',
        epigrafe: '',
        titulo: 'Resolución por la que se convocan plazas de músicos militares'
    });
    comprobar('Tira una convocatoria que no es de su cuerpo', oposicionAjena === null);

    const oposicionPropia = normas.clasificarDisposicion({
        seccion: '2B',
        departamento: 'MINISTERIO DE LA PRESIDENCIA, JUSTICIA Y RELACIONES CON LAS CORTES',
        epigrafe: '',
        titulo: 'Resolución por la que se convoca proceso selectivo del Cuerpo de Tramitación Procesal y Administrativa'
    });
    comprobar('Deja pasar la convocatoria de su cuerpo', oposicionPropia?.tipo === 'convocatoria');

    // Sin acentos: si esto falla, el filtro no ve la mitad del BOE
    const sinAcentos = normas.clasificarDisposicion({
        seccion: '1',
        departamento: 'MINISTERIO DE HACIENDA',
        epigrafe: '',
        titulo: 'Orden sobre la Administracion de Justicia y la oficina judicial'
    });
    comprobar('Encuentra "Administracion" escrita sin tilde', sinAcentos !== null);
}

// ============================================================
registrar('\n── 3b. El ruido de verdad que salió el primer día ──');
// ============================================================
{
    /* TÍTULOS REALES de la primera ejecución en producción. Salieron 90
       avisos y casi todos eran esto: convenios del Ministerio que no
       tocan el temario. Pasaban solo por venir de un departamento
       vigilado. Estas pruebas existen para que no vuelvan a colarse. */
    const ruidoReal = [
        {
            seccion: '3',
            departamento: 'MINISTERIO DE LA PRESIDENCIA, JUSTICIA Y RELACIONES CON LAS CORTES',
            epigrafe: '',
            titulo: 'Resolución de 7 de agosto de 2026, de la Secretaría de Estado de Justicia, por la que se publica el Convenio con la Unión Española de Entidades Aseguradoras y Reaseguradoras y la Entidad de Tecnologías de la Información y Redes para las Entidades Aseguradoras, en materia de información de seguros implicada en investigaciones o decisiones judiciales.'
        },
        {
            seccion: '3',
            departamento: 'MINISTERIO PARA LA TRANSFORMACIÓN DIGITAL Y DE LA FUNCIÓN PÚBLICA',
            epigrafe: '',
            titulo: 'Resolución de 24 de julio de 2026, de la Entidad Pública Empresarial, Red.es, M.P., por la que se publica el Convenio con el Banco de España, en materia de cesión de información para la evaluación y análisis de la digitalización y asesoramiento para la transformación de pymes y autónomos.'
        },
        {
            seccion: '3',
            departamento: 'MINISTERIO DE LA PRESIDENCIA, JUSTICIA Y RELACIONES CON LAS CORTES',
            epigrafe: '',
            titulo: 'Resolución de 5 de agosto de 2026, de la Subsecretaría, por la que se publica el Convenio de asistencia jurídica entre la Abogacía General del Estado y la Fundación Pública Escuela de Organización Industrial, F.S.P.'
        }
    ];

    ruidoReal.forEach((d, i) => {
        comprobar(`Descarta el convenio real ${i + 1}`,
            normas.clasificarDisposicion(d) === null,
            JSON.stringify(normas.clasificarDisposicion(d)));
    });

    // Lo que SÍ tiene que seguir pasando por la sección III
    const acuerdoCGPJ = normas.clasificarDisposicion({
        seccion: '3',
        departamento: 'CONSEJO GENERAL DEL PODER JUDICIAL',
        epigrafe: '',
        titulo: 'Acuerdo de 10 de julio de 2026, de la Comisión Permanente, sobre creación de plazas'
    });
    comprobar('Deja pasar un acuerdo del CGPJ', acuerdoCGPJ !== null);

    const sobreOficina = normas.clasificarDisposicion({
        seccion: '3',
        departamento: 'MINISTERIO DE LA PRESIDENCIA, JUSTICIA Y RELACIONES CON LAS CORTES',
        epigrafe: '',
        titulo: 'Resolución sobre el despliegue de la oficina judicial en los tribunales de instancia'
    });
    comprobar('Deja pasar lo que sí habla de la oficina judicial', sobreOficina !== null);

    // Una ley nueva en sección I no se descarta aunque venga sin más contexto
    const leyNueva = normas.clasificarDisposicion({
        seccion: '1',
        departamento: 'JEFATURA DEL ESTADO',
        epigrafe: '',
        titulo: 'Ley Orgánica 5/2026, de 3 de agosto, de medidas de eficiencia del Servicio Público de Justicia'
    });
    comprobar('Una ley nueva de Jefatura del Estado pasa siempre', leyNueva?.tipo === 'disposicion');

    /* Y el caso que justifica el orden del código: una convocatoria de
       tu cuerpo con la palabra "convenio" en el título NO puede caerse
       por el filtro de ruido. Perder un plazo cuesta demasiado. */
    const convocatoriaConRuido = normas.clasificarDisposicion({
        seccion: '3',
        departamento: 'MINISTERIO DE LA PRESIDENCIA, JUSTICIA Y RELACIONES CON LAS CORTES',
        epigrafe: '',
        titulo: 'Resolución por la que se convoca proceso selectivo del Cuerpo de Tramitación Procesal al amparo del Convenio con las comunidades autónomas'
    });
    comprobar('Una convocatoria de tu cuerpo entra aunque diga "Convenio"',
        convocatoriaConRuido?.tipo === 'convocatoria',
        JSON.stringify(convocatoriaConRuido));
}

// ============================================================
registrar('\n── 4. Artículos citados en un texto ──');
// ============================================================
{
    const uno = boe.articulosCitados('Modifica los arts. 23, 45 y 102 de la Ley');
    comprobar('Lista suelta de artículos', JSON.stringify(uno) === JSON.stringify([23, 45, 102]),
        JSON.stringify(uno));

    const rango = boe.articulosCitados('Se modifican los artículos 100 a 103');
    comprobar('Rangos "100 a 103"', JSON.stringify(rango) === JSON.stringify([100, 101, 102, 103]),
        JSON.stringify(rango));

    const anio = boe.articulosCitados('Modifica el art. 5 de la Ley de 2015');
    comprobar('Un año no se cuela como artículo', !anio.includes(2015), JSON.stringify(anio));

    const disparate = boe.articulosCitados('arts. 1 a 900');
    comprobar('Un rango disparatado se ignora en vez de meter 900 números',
        disparate.length < 50, `metió ${disparate.length}`);

    comprobar('Un texto sin artículos devuelve lista vacía',
        boe.articulosCitados('Se deroga la disposición adicional').length === 0);
}

// ============================================================
registrar('\n── 5. El cruce con el banco exige norma Y artículo ──');
// ============================================================
{
    const { preguntasQueCitan } = require(rutaDe('../api/boe-vigilante.js')).paraPruebas;

    const temas = [{
        id: 'tema1',
        nombre: 'Tema 7 - Proceso civil',
        usuarioId: 'luciano',
        preguntas: [
            { pregunta: 'Según el art. 45 de la LEC, ¿qué órgano es competente?' },
            { pregunta: 'El artículo 45 de la Constitución se refiere a...' },
            { pregunta: 'Según la LEC, ¿cuál es el plazo para recurrir?' },
            { pregunta: 'El art. 99 de la LEC regula...' }
        ]
    }, {
        id: 'tema2',
        nombre: 'Tema 3',
        usuarioId: 'sandra',
        preguntas: [
            { pregunta: 'Conforme al art. 45 LEC, la declinatoria...' }
        ]
    }];

    const afectados = preguntasQueCitan(
        temas,
        [{ id: 'BOE-A-2000-323', nombre: 'Ley 1/2000 de Enjuiciamiento Civil' }],
        [45]
    );

    comprobar('Marca la pregunta que cita la LEC y el art. 45',
        afectados.luciano?.length === 1, JSON.stringify(afectados.luciano));
    comprobar('NO marca el art. 45 de otra norma (la Constitución)',
        !(afectados.luciano || []).some(p => p.enunciado.includes('Constitución')));
    comprobar('NO marca una pregunta de la LEC sin artículo',
        !(afectados.luciano || []).some(p => p.enunciado.includes('plazo para recurrir')));
    comprobar('NO marca un artículo distinto de la misma norma',
        !(afectados.luciano || []).some(p => p.enunciado.includes('art. 99')));
    comprobar('Separa las preguntas por usuario',
        afectados.sandra?.length === 1 && afectados.luciano?.length === 1);

    const sinArticulos = preguntasQueCitan(temas, [{ id: 'BOE-A-2000-323', nombre: 'LEC' }], []);
    comprobar('Sin artículos modificados no marca nada',
        Object.keys(sinArticulos).length === 0);
}

// ============================================================
registrar('\n── 5b. Análisis de legislación consolidada ──');
// ============================================================
{
    /* Estructura COPIADA DE LA RESPUESTA REAL del BOE (agosto 2026).
       La primera versión del código se escribió de memoria suponiendo
       data.analisis y data.metadatos, y no existen: "data" es un ARRAY
       y las referencias van anidadas dos niveles más abajo. Las 19
       normas del catálogo daban "no existe" por esto. */
    respuestas = {
        '/legislacion-consolidada/id/BOE-A-1985-12666/analisis': {
            cuerpo: {
                status: { code: '200', text: 'ok' },
                data: [{
                    materias: [{ materia: { codigo: '6981', texto: 'Tribunales Tutelares de Menores' } }],
                    referencias: {
                        anteriores: [{ anterior: [{ id_norma: 'BOE-A-1984-9845', relacion: { codigo: '210', texto: 'DEROGA' }, texto: 'Ley Orgánica 4/1984' }] }],
                        posteriores: [{
                            posterior: [
                                {
                                    id_norma: 'BOE-A-2011-12627',
                                    relacion: { codigo: '210', texto: 'SE DEROGA' },
                                    texto: 'el art. 86, SE MODIFICA los arts. 2, 100, 445 y 521, con efectos desde el 22 de julio de 2014, por Ley Orgánica 8/2011, de 21 de julio'
                                },
                                {
                                    id_norma: 'BOE-A-2021-15305',
                                    relacion: { codigo: '552', texto: 'Recurso' },
                                    texto: '3101/2021 promovido contra los arts. 570 bis y 598 bis, en la redacción dada por la Ley Orgánica 4/2021'
                                }
                            ]
                        }]
                    }
                }]
            }
        },
        '/legislacion-consolidada/id/BOE-A-1985-12666/metadatos': {
            cuerpo: {
                status: { code: '200', text: 'ok' },
                data: [{
                    fecha_actualizacion: '20260729T100815Z',
                    identificador: 'BOE-A-1985-12666',
                    titulo: 'Ley Orgánica 6/1985, de 1 de julio, del Poder Judicial.',
                    estatus_derogacion: 'N',
                    url_html_consolidada: 'https://www.boe.es/buscar/act.php?id=BOE-A-1985-12666'
                }]
            }
        }
    };

    const analisis = await boe.obtenerAnalisis('BOE-A-1985-12666');
    comprobar('Lee las referencias aunque "data" sea un array',
        analisis && analisis.referencias.length === 2,
        JSON.stringify(analisis));
    comprobar('Saca quién modifica',
        analisis.referencias[0].idModificadora === 'BOE-A-2011-12627');
    comprobar('Saca la relación como texto',
        analisis.referencias[0].relacion === 'SE DEROGA');

    const arts = boe.articulosCitados(analisis.referencias[0].texto);
    comprobar('Saca los artículos del texto de la referencia',
        JSON.stringify(arts) === JSON.stringify([2, 86, 100, 445, 521]),
        JSON.stringify(arts));
    comprobar('El año 2014 no se cuela como artículo', !arts.includes(2014));

    const metadatos = await boe.obtenerMetadatos('BOE-A-1985-12666');
    comprobar('Los metadatos dan el título oficial',
        metadatos?.titulo.includes('Poder Judicial'), JSON.stringify(metadatos));
    comprobar('Y la fecha de actualización',
        metadatos?.fechaActualizacion === '20260729T100815Z');

    const noExiste = await boe.obtenerMetadatos('BOE-A-9999-1');
    comprobar('Un identificador inventado devuelve null', noExiste === null);

    // Los apartados no son artículos
    const conApartados = boe.articulosCitados('SE MODIFICA el art. 175.3 y los arts. 570 bis.1 y 599.1');
    comprobar('"175.3" cuenta como artículo 175, no como el 3',
        JSON.stringify(conApartados) === JSON.stringify([175, 570, 599]),
        JSON.stringify(conApartados));

    const { esCambioDeContenido } = require(rutaDe('../api/boe-vigilante.js')).paraPruebas;
    comprobar('"SE DEROGA" es cambio de contenido', esCambioDeContenido('SE DEROGA'));
    comprobar('"SE MODIFICA" es cambio de contenido', esCambioDeContenido('SE MODIFICA'));
    comprobar('"Recurso" NO es cambio de contenido', !esCambioDeContenido('Recurso'));
    comprobar('"Cuestión" NO es cambio de contenido', !esCambioDeContenido('Cuestión'));
}

// ============================================================
registrar('\n── 5c. Solo se avisa de lo que no se había visto ──');
// ============================================================
{
    const { revisarModificaciones } = require(rutaDe('../api/boe-vigilante.js')).paraPruebas;

    // Firestore de mentira: guarda en memoria lo que le escriban
    const almacen = {};
    const dbFalsa = {
        collection: (nombre) => ({
            get: async () => ({
                docs: Object.entries(almacen[nombre] || {}).map(([id, data]) => ({ id, data: () => data }))
            }),
            doc: (id) => ({
                set: async (datos) => {
                    almacen[nombre] = almacen[nombre] || {};
                    almacen[nombre][id] = { ...(almacen[nombre][id] || {}), ...datos };
                }
            })
        })
    };

    // Solo responde la LOPJ; las demás normas del catálogo darán 404,
    // que es justo lo que hay que comprobar que no rompe nada.
    const primera = await revisarModificaciones('20260815', dbFalsa);
    comprobar('La primera vez NO avisa de nada (solo siembra)',
        primera.hallazgos.length === 0, `avisó de ${primera.hallazgos.length}`);
    comprobar('Y deja sembrada la norma que sí respondió',
        primera.sembradas.includes('BOE-A-1985-12666'));
    comprobar('Las normas que no responden se anotan como problema, no rompen',
        primera.fallos.length > 0);

    // Segunda pasada sin cambios en el BOE: silencio
    const segunda = await revisarModificaciones('20260816', dbFalsa);
    comprobar('Sin novedades en el BOE, no avisa',
        segunda.hallazgos.length === 0, `avisó de ${segunda.hallazgos.length}`);

    // Ahora aparece una reforma nueva
    respuestas['/legislacion-consolidada/id/BOE-A-1985-12666/analisis'].cuerpo.data[0]
        .referencias.posteriores[0].posterior.push({
            id_norma: 'BOE-A-2026-99999',
            relacion: { codigo: '210', texto: 'SE MODIFICA' },
            texto: 'los arts. 456 y 457, por Ley Orgánica 5/2026'
        });

    const tercera = await revisarModificaciones('20260817', dbFalsa);
    comprobar('Detecta la reforma nueva', tercera.hallazgos.length === 1,
        `detectó ${tercera.hallazgos.length}`);
    comprobar('Con sus artículos',
        JSON.stringify(tercera.hallazgos[0]?.articulos) === JSON.stringify([456, 457]),
        JSON.stringify(tercera.hallazgos[0]?.articulos));
    comprobar('Marcada como importante, porque cambia el texto',
        tercera.hallazgos[0]?.importanciaMinima === 'alta');

    // Y no la repite al día siguiente
    const cuarta = await revisarModificaciones('20260818', dbFalsa);
    comprobar('No vuelve a avisar de la misma al día siguiente',
        cuarta.hallazgos.length === 0, `repitió ${cuarta.hallazgos.length}`);
}

// ============================================================
registrar('\n── 6. La puerta está cerrada ──');
// ============================================================
{
    const { llamadaAutorizada } = require(rutaDe('../api/boe-vigilante.js')).paraPruebas;
    const original = process.env.CRON_SECRET;

    delete process.env.CRON_SECRET;
    comprobar('Sin CRON_SECRET configurado NO se abre',
        llamadaAutorizada({ headers: { authorization: 'Bearer loquesea' } }).vale === false);

    process.env.CRON_SECRET = 'secreto-de-prueba';
    comprobar('Con el secreto correcto se abre',
        llamadaAutorizada({ headers: { authorization: 'Bearer secreto-de-prueba' } }).vale === true);
    comprobar('Con un secreto equivocado no se abre',
        llamadaAutorizada({ headers: { authorization: 'Bearer otro' } }).vale === false);
    comprobar('Sin ninguna cabecera no se abre',
        llamadaAutorizada({ headers: {} }).vale === false);
    comprobar('Acepta también x-cron-secret, para dispararlo a mano',
        llamadaAutorizada({ headers: { 'x-cron-secret': 'secreto-de-prueba' } }).vale === true);

    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
}

// ============================================================
registrar('\n── 7. Fechas ──');
// ============================================================
{
    const { restarDias } = require(rutaDe('../api/boe-vigilante.js')).paraPruebas;

    comprobar('Resta días dentro del mes', restarDias('20260814', 3) === '20260811');
    comprobar('Cruza el cambio de mes', restarDias('20260301', 1) === '20260228');
    comprobar('Cruza el cambio de año', restarDias('20260101', 1) === '20251231');
    comprobar('Año bisiesto', restarDias('20240301', 1) === '20240229');
    comprobar('Fecha legible', boe.fechaLegible('20260814') === '14/08/2026');
    comprobar('La fecha de hoy tiene 8 dígitos', /^\d{8}$/.test(boe.fechaHoyMadrid()));
}

// ------------------------------------------------------------
globalThis.fetch = fetchReal;

registrar(`\n${fallidas === 0 ? '✅' : '❌'} ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) {
    registrar('Fallos: ' + fallos.join(' · '));
    process.exit(1);
}
