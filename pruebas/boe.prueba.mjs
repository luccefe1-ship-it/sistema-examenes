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
