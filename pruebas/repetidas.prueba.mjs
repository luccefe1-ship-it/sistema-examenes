// Pruebas del filtro de preguntas repetidas.
// Ejecutar desde la raiz del repo:  npm test
//
// Cubre el fallo real que aparecio en produccion: un test IA con tres temas
// devolvio una pregunta que ya estaba en el banco (salio con su badge de
// "Fallada 1 vez"), porque el filtro solo comparaba contra lo generado en la
// misma tanda y del mismo tema.

const mod = await import(new URL('../js/preguntas-repetidas.js', import.meta.url).href);
const { quitarRepetidas, huella, clavePorTexto, sonLaMisma } = mod;

const registrar = (...a) => process.stdout.write(a.join(' ') + '\n');
let pasadas = 0, fallidas = 0;
const fallos = [];

function comprobar(nombre, condicion, detalle) {
    if (condicion) { pasadas++; registrar(`  ✅ ${nombre}`); }
    else { fallidas++; fallos.push(nombre); registrar(`  ❌ ${nombre}${detalle ? '  → ' + detalle : ''}`); }
}

// Atajo para escribir preguntas legibles
function p(texto, opciones, correcta) {
    return {
        texto,
        opciones: opciones.map((t, i) => ({
            letra: 'ABCD'[i],
            texto: t,
            esCorrecta: 'ABCD'[i] === correcta
        })),
        respuestaCorrecta: correcta
    };
}

// La pregunta real de la captura
const LA_DE_LA_CAPTURA = p(
    'La Secretaría de la Comisión General de Secretarios de Estado y Subsecretarios será ejercida por:',
    ['El Director del Secretariado del Gobierno', 'El Subsecretario de la Presidencia',
     'El Ministro de la Presidencia', 'El Secretario de Estado de Relaciones con las Cortes'],
    'B'
);

// ============================================================
registrar('\n── 1. Veto por texto exacto contra el banco ──');
// ============================================================
{
    const banco = new Set([clavePorTexto(LA_DE_LA_CAPTURA.texto)]);
    const generadas = [LA_DE_LA_CAPTURA, p('¿Cuál es el plazo del recurso de reposición?', ['3 días', '5 días', '10 días', '20 días'], 'B')];

    const { aceptadas, descartadas } = quitarRepetidas(generadas, [], banco);

    comprobar('La pregunta que ya estaba en el banco se descarta', descartadas.length === 1);
    comprobar('El motivo lo dice claro', descartadas[0]?.motivo.includes('ya existe en tu banco'));
    comprobar('La pregunta nueva sí pasa', aceptadas.length === 1 && aceptadas[0].texto.includes('reposición'));
}

// ============================================================
registrar('\n── 2. El veto no depende de tildes, mayúsculas ni signos ──');
// ============================================================
{
    const banco = new Set([clavePorTexto('¿Cuál es el plazo máximo de resolución?')]);
    const variantes = [
        'Cual es el plazo maximo de resolucion',
        '¿CUÁL ES EL PLAZO MÁXIMO DE RESOLUCIÓN?',
        '  ¿Cuál  es el   plazo máximo de resolución?  '
    ];

    variantes.forEach(v => {
        const { descartadas } = quitarRepetidas([p(v, ['a', 'b', 'c', 'd'], 'A')], [], banco);
        comprobar(`Variante detectada: "${v.trim().slice(0, 38)}…"`, descartadas.length === 1);
    });
}

// ============================================================
registrar('\n── 3. Duplicado cruzado entre dos temas del mix ──');
// ============================================================
{
    // El tema A y el tema B generan la misma pregunta cada uno por su lado.
    // Con la lista de huellas compartida, la segunda debe caer.
    const delTemaA = [p('¿Quién preside la Comisión General?', ['El Rey', 'El Vicepresidente', 'El Ministro', 'El Subsecretario'], 'B')];
    const delTemaB = [p('¿Quién preside la Comisión General de Secretarios?', ['El Rey', 'El Vicepresidente', 'El Ministro', 'El Subsecretario'], 'B')];

    // Como se hace ahora: una sola lista de huellas para todos los temas
    const paso1 = quitarRepetidas(delTemaA, [], new Set());
    const paso2 = quitarRepetidas(delTemaB, paso1.huellas, new Set());

    comprobar('El tema A aporta su pregunta', paso1.aceptadas.length === 1);
    comprobar('El tema B no cuela la misma pregunta', paso2.aceptadas.length === 0,
        paso2.aceptadas.length ? 'se coló' : '');

    // Comprobación de que antes SÍ se colaba (listas separadas por tema)
    const comoAntes = quitarRepetidas(delTemaB, [], new Set());
    comprobar('Con listas separadas por tema sí se colaba (el fallo antiguo)', comoAntes.aceptadas.length === 1);
}

// ============================================================
registrar('\n── 4. Sembrar con el banco de los temas elegidos ──');
// ============================================================
{
    // Reformulada, no idéntica: el veto por texto exacto no la caza,
    // pero la comparación a fondo sí porque la solución es la misma
    const enElBanco = p(
        'Solicitada la acumulación de procesos pendientes ante un mismo tribunal, si todas las partes se muestran conformes con ella:',
        ['Se deniega', 'El tribunal acordará la acumulación', 'Se archiva', 'Se remite al superior'],
        'B'
    );
    const laIAGenera = p(
        'En la acumulación de procesos pendientes ante un mismo tribunal, si todas las partes se muestran conformes con la acumulación:',
        ['Se deniega', 'El tribunal acordará la acumulación', 'Se archiva', 'Se remite al superior'],
        'B'
    );

    const semilla = [huella(enElBanco)];
    const { aceptadas, descartadas } = quitarRepetidas([laIAGenera], semilla, new Set());

    comprobar('Una reformulación de algo del banco se descarta', descartadas.length === 1,
        aceptadas.length ? 'pasó el filtro' : '');
}

// ============================================================
registrar('\n── 5. No descartar preguntas legítimas parecidas ──');
// ============================================================
{
    // Mismo juego de opciones (plazos), preguntas distintas: deben pasar TODAS
    const plazos = [
        p('¿Plazo para interponer recurso de reposición?', ['3 días', '5 días', '10 días', '20 días'], 'B'),
        p('¿Plazo para interponer recurso de apelación?', ['3 días', '5 días', '10 días', '20 días'], 'D'),
        p('¿Plazo para interponer recurso de queja?', ['3 días', '5 días', '10 días', '20 días'], 'C')
    ];

    const { aceptadas, descartadas } = quitarRepetidas(plazos, [], new Set());
    comprobar('Tres preguntas de plazos distintos pasan las tres', aceptadas.length === 3,
        `pasaron ${aceptadas.length}; descartadas: ${descartadas.map(d => d.motivo).join(' / ')}`);

    // Dos preguntas de temas totalmente distintos
    const distintas = [
        p('¿Qué es el Consejo de Ministros?', ['a1', 'b1', 'c1', 'd1'], 'A'),
        p('¿Cuántos Estados forman la Unión Europea?', ['25', '26', '27', '28'], 'C')
    ];
    comprobar('Dos preguntas sin relación pasan las dos',
        quitarRepetidas(distintas, [], new Set()).aceptadas.length === 2);
}

// ============================================================
registrar('\n── 6. Robustez ──');
// ============================================================
{
    comprobar('Lista vacía no rompe', quitarRepetidas([], [], new Set()).aceptadas.length === 0);
    comprobar('null no rompe', quitarRepetidas(null, [], new Set()).aceptadas.length === 0);
    comprobar('Preguntas sin texto se ignoran',
        quitarRepetidas([{ opciones: [] }, null, { texto: '' }], [], new Set()).aceptadas.length === 0);
    comprobar('Sin veto (null) sigue funcionando como antes',
        quitarRepetidas([p('Una pregunta cualquiera', ['a', 'b', 'c', 'd'], 'A')], [], null).aceptadas.length === 1);
    comprobar('clavePorTexto tolera undefined', clavePorTexto(undefined) === '');
}

// ------------------------------------------------------------
registrar('\n' + '═'.repeat(52));
registrar(`  ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas) registrar('  Fallos: ' + fallos.join(' | '));
registrar('═'.repeat(52) + '\n');
process.exit(fallidas ? 1 : 0);
