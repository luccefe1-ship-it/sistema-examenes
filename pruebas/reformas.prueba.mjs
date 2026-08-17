// ============================================================
//  pruebas/reformas.prueba.mjs
//  El motor de reformas: que un artículo reformado caiga en SU tema
//  y no en todos los que estudian esa ley.
// ============================================================

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const aqui = path.dirname(fileURLToPath(import.meta.url));
const rutaDe = (r) => path.join(aqui, r);

let pasadas = 0, fallidas = 0;
const fallos = [];

function comprobar(nombre, condicion, detalle = '') {
    if (condicion) { pasadas++; console.log('  ✅ ' + nombre); }
    else { fallidas++; fallos.push(nombre); console.log('  ❌ ' + nombre + (detalle ? ' → ' + detalle : '')); }
}

const A = require(rutaDe('../api/_articulos-temario.js'));
const { temarioDe } = require(rutaDe('../api/_temarios.js'));
const { paraPruebas } = require(rutaDe('../api/reformas-repaso.js'));

const CE = 'BOE-A-1978-31229';
const LEC = 'BOE-A-2000-323';
const LECRIM = 'BOE-A-1882-6036';

console.log('\nReparto de artículos por tema');

/* El caso real: el senador de Formentera reforma el art. 69.3 de la
   Constitución. Ese artículo solo se estudia en el tema 1. */
const conCE = [];
for (let n = 1; n <= 68; n++) {
    const cruce = A.articulosQueAfectan('gestion', n, CE, ['69']);
    if (cruce && cruce.length) conCE.push(n);
}
comprobar('El art. 69 CE cae solo en el tema 1', conCE.length === 1 && conCE[0] === 1, String(conCE));

/* Y un artículo de la misma ley que va a otro tema: el 137 (organización
   territorial) es del tema 4, no del 1. */
comprobar('El art. 137 CE es del tema 4, no del 1',
    A.articulosQueAfectan('gestion', 4, CE, ['137']).length === 1 &&
    A.articulosQueAfectan('gestion', 1, CE, ['137']).length === 0);

const conLEC = [];
for (let n = 1; n <= 68; n++) {
    const cruce = A.articulosQueAfectan('gestion', n, LEC, ['155', '156']);
    if (cruce && cruce.length) conLEC.push(n);
}
comprobar('Los arts. 155-156 LEC caen solo en el tema 23',
    conLEC.length === 1 && conLEC[0] === 23, String(conLEC));

/* Sin el listado, la misma reforma saltaría en los 31 temas de
   Gestión que citan la LEC. Esta es la prueba de que sirve de algo. */
const citanLEC = temarioDe('gestion').filter(t => t.normas.includes(LEC)).length;
comprobar('Sin listado saltarían más de 20 temas por esa reforma', citanLEC > 20, String(citanLEC));

console.log('\nRangos y sufijos');

comprobar('Un rango incluye sus extremos',
    A.articuloEntra(A.compilar('5-18'), '5') &&
    A.articuloEntra(A.compilar('5-18'), '18') &&
    !A.articuloEntra(A.compilar('5-18'), '19'));

comprobar('El "bis" cuenta como su artículo',
    A.articuloEntra(A.compilar('238bis'), '238 bis') &&
    A.articuloEntra(A.compilar('238bis'), '238'));

comprobar('Un artículo con apartado se reconoce por el número',
    A.articuloEntra(A.compilar('69'), '69.3'));

comprobar('La ley entera acepta cualquier artículo',
    A.articuloEntra(A.compilar(''), '999'));

comprobar('El art. 238 bis LECrim está en los temas 49 y 55',
    A.articulosQueAfectan('gestion', 49, LECRIM, ['238 bis']).length === 1 &&
    A.articulosQueAfectan('gestion', 55, LECRIM, ['238 bis']).length === 1);

console.log('\nFiltro de reformas del BOE');

comprobar('El año sale del identificador',
    paraPruebas.anioDelIdentificador('BOE-A-2026-10881') === 2026 &&
    paraPruebas.anioDelIdentificador('cualquier cosa') === null);

comprobar('Se guardan las modificaciones y derogaciones',
    paraPruebas.esUnaReforma({ relacion: 'SE MODIFICA el art. 69.3' }) &&
    paraPruebas.esUnaReforma({ relacion: 'SE DEROGA' }));

/* Un recurso de inconstitucionalidad no reescribe el temario: si
   entrara, la pantalla se llenaría de cosas que no hay que
   reestudiar. */
comprobar('Y se descartan recursos y sentencias',
    !paraPruebas.esUnaReforma({ relacion: 'Recurso de inconstitucionalidad' }) &&
    !paraPruebas.esUnaReforma({ relacion: 'SE DICTA DE CONFORMIDAD' }));

console.log('\nCuerpos sin listado de artículos');

comprobar('Tramitación no tiene listado y lo dice',
    A.tieneListado('tramitacion') === false && A.leyesDelTema('tramitacion', 1) === null);
comprobar('Gestión sí lo tiene', A.tieneListado('gestion') === true);

console.log(`\n${fallidas === 0 ? '✅' : '❌'} ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) { console.log('Fallos: ' + fallos.join(' · ')); process.exit(1); }
