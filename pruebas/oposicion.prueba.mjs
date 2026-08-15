// Pruebas del detector de vocabulario derogado. Ejecutar: npm test
//
// Lo que se comprueba es lo que puede hacer daño de verdad:
//   1. Que encuentre los términos que la LO 1/2025 dejó atrás.
//   2. Que NO marque cosas correctas. Un falso positivo en cada tema
//      convierte la pantalla en ruido y deja de mirarse.
//   3. Que el fragmento que enseña sea el texto ORIGINAL, con tildes,
//      y no la versión normalizada que se usa para buscar.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const rutaDe = (r) => new URL(r, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const registrar = (...a) => process.stdout.write(a.join(' ') + '\n');
let pasadas = 0, fallidas = 0;
const fallos = [];

function comprobar(nombre, condicion, detalle) {
    if (condicion) { pasadas++; registrar(`  ✅ ${nombre}`); }
    else { fallidas++; fallos.push(nombre); registrar(`  ❌ ${nombre}${detalle ? '  → ' + detalle : ''}`); }
}

const { revisarTexto, quitarSolapes, normalizar } = require(rutaDe('../api/mi-oposicion.js')).paraPruebas;
const { fichaConvocatoria, diasParaExamen, cuerpoValido } = require(rutaDe('../api/_convocatoria.js'));

const terminosDe = t => quitarSolapes(revisarTexto(t).hallazgos).map(h => h.termino);

// ============================================================
registrar('\n── 1. Encuentra lo derogado ──');
// ============================================================
{
    comprobar('Juzgado de Primera Instancia',
        terminosDe('Es competente el Juzgado de Primera Instancia número 4').includes('juzgado de primera instancia'));

    comprobar('Juzgado de Vigilancia Penitenciaria',
        terminosDe('El Juzgado de Vigilancia Penitenciaria resolverá').includes('juzgado de vigilancia penitenciaria'));

    comprobar('Secretario Judicial',
        terminosDe('El Secretario Judicial dará fe').includes('secretario judicial'));

    // Sin tildes y en mayúsculas: así viene mucho texto de PDF
    comprobar('Lo encuentra escrito en MAYÚSCULAS y sin tildes',
        terminosDe('EL JUZGADO DE INSTRUCCION ACORDARA').includes('juzgado de instruccion'));

    const conTildes = revisarTexto('Corresponde al Juzgado de lo Penal según el artículo 14');
    comprobar('El fragmento conserva el texto original con tildes',
        conTildes.hallazgos[0].fragmentos[0].includes('artículo'),
        conTildes.hallazgos[0].fragmentos[0]);
}

// ============================================================
registrar('\n── 2. No marca lo que está bien ──');
// ============================================================
{
    comprobar('Un texto ya actualizado no salta',
        terminosDe('El Tribunal de Instancia, Sección de Enjuiciamiento Penal, resolverá').length === 0);

    comprobar('El Letrado de la Administración de Justicia no salta',
        terminosDe('El Letrado de la Administración de Justicia dará fe').length === 0);

    comprobar('El Tribunal Supremo no salta',
        terminosDe('La Sala Segunda del Tribunal Supremo').length === 0);

    comprobar('Un texto sin nada devuelve lista vacía',
        terminosDe('Los plazos se cuentan por días hábiles').length === 0);

    comprobar('Texto vacío no es revisable',
        revisarTexto('').revisable === false);
}

// ============================================================
registrar('\n── 3. El Juzgado de Paz es un caso aparte ──');
// ============================================================
{
    // Sigue existiendo: se marca, pero como aviso leve, no como error
    const paz = quitarSolapes(revisarTexto('El Juzgado de Paz del municipio').hallazgos);
    comprobar('Se detecta el Juzgado de Paz', paz.length === 1);
    comprobar('Pero con gravedad baja, porque puede ser correcto',
        paz[0]?.gravedad === 'baja', JSON.stringify(paz[0]));
}

// ============================================================
registrar('\n── 4. No cuenta lo mismo dos veces ──');
// ============================================================
{
    const t = terminosDe('Los Juzgados de Primera Instancia y el Juzgado de Primera Instancia número 3');
    comprobar('Singular y plural no generan dos avisos del mismo texto',
        t.length <= 2, JSON.stringify(t));
}

// ============================================================
registrar('\n── 5. La ficha de convocatoria ──');
// ============================================================
{
    const gestion = fichaConvocatoria('gestion');
    const tram = fichaConvocatoria('tramitacion');

    comprobar('Gestión tiene 725 plazas', gestion.cuerpo.plazas.total === 725);
    comprobar('Tramitación tiene 1.155 plazas', tram.cuerpo.plazas.total === 1155);
    comprobar('Gestión tiene 68 temas', gestion.cuerpo.temas === 68);
    comprobar('Tramitación tiene 37 temas', tram.cuerpo.temas === 37);
    comprobar('El examen es el mismo día para los dos',
        gestion.fechaExamen === tram.fechaExamen && gestion.fechaExamen === '2026-10-03');
    comprobar('Un cuerpo inventado cae en el de por defecto',
        fichaConvocatoria('bombero').cuerpo.clave === 'gestion');
    comprobar('cuerpoValido rechaza lo que no existe',
        cuerpoValido('gestion') && !cuerpoValido('bombero'));

    // La cuenta atrás
    comprobar('Faltan 60 días el 4 de agosto de 2026',
        diasParaExamen(new Date(Date.UTC(2026, 7, 4))) === 60,
        String(diasParaExamen(new Date(Date.UTC(2026, 7, 4)))));
    comprobar('El día del examen faltan 0',
        diasParaExamen(new Date(Date.UTC(2026, 9, 3))) === 0);
    comprobar('Después del examen sale negativo',
        diasParaExamen(new Date(Date.UTC(2026, 9, 10))) === -7);

    comprobar('Gestión avisa de los dos temas nuevos',
        gestion.cuerpo.temasNuevos.length === 2);
    comprobar('Y de los siete que cambiaron',
        gestion.cuerpo.temasCambiados.length === 7);
}

registrar(`\n${fallidas === 0 ? '✅' : '❌'} ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) { registrar('Fallos: ' + fallos.join(' · ')); process.exit(1); }
