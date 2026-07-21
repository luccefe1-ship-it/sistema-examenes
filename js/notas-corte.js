// notas-corte.js — Datos oficiales de convocatoria y comparativa de resultados
// Fuente: OEP 2024 · BOE núm. 305 de 19-12-2024 · Órdenes PJC/1437/2024, PJC/1435/2024, PJC/1436/2024
// Notas de corte finales: relaciones oficiales del Tribunal Calificador Único (mayo–junio 2026), ámbito MADRID, sistema general.
// ⚠️ Al actualizar la convocatoria, SOLO hay que tocar este fichero.

export const DATOS_CONVOCATORIA = {
    etiqueta: 'OEP 2024',
    boe: 'BOE núm. 305, de 19-12-2024',
    ambito: 'Madrid · sistema general',
    fechaExamen: '27-09-2025 (libre) / 28-06-2025 (promoción interna)',

    cuerpos: {
        gestion: {
            nombre: 'Gestión Procesal y Administrativa',
            nombreCorto: 'Gestión',
            turnos: {
                libre: {
                    nombre: 'Turno libre',
                    preguntasExamen: 100,
                    opcionesPorPregunta: 4,
                    valorAcierto: 0.60,
                    penalizacionError: 0.15,
                    blancasPenalizan: false,
                    notaMaxima: 60,
                    notaCortePrimerEjercicio: 30,
                    tipoCorte: 'mínima fija en bases (50%)',
                    notaMaximaProceso: 100,
                    notaCorteFinal: 52.85,
                    plazas: 731,
                    plazasAmbito: 180
                },
                interna: {
                    nombre: 'Promoción interna',
                    preguntasExamen: 100,
                    opcionesPorPregunta: 4,
                    valorAcierto: 1.00,
                    penalizacionError: 0.25,
                    blancasPenalizan: false,
                    notaMaxima: 100,
                    notaCortePrimerEjercicio: 50,
                    tipoCorte: 'mínima fija en bases',
                    notaMaximaProceso: 165,
                    notaCorteFinal: 120.00,
                    plazas: 219,
                    plazasAmbito: 48
                }
            }
        },
        tramitacion: {
            nombre: 'Tramitación Procesal y Administrativa',
            nombreCorto: 'Tramitación',
            turnos: {
                libre: {
                    nombre: 'Turno libre',
                    preguntasExamen: 100,
                    opcionesPorPregunta: 4,
                    valorAcierto: 0.60,
                    penalizacionError: 0.15,
                    blancasPenalizan: false,
                    notaMaxima: 60,
                    notaCortePrimerEjercicio: 30,
                    tipoCorte: 'mínima fija en bases (50%)',
                    notaMaximaProceso: 100,
                    notaCorteFinal: 71.10,
                    plazas: 855,
                    plazasAmbito: 310
                },
                interna: {
                    nombre: 'Promoción interna',
                    preguntasExamen: 100,
                    opcionesPorPregunta: 4,
                    valorAcierto: 1.00,
                    penalizacionError: 0.25,
                    blancasPenalizan: false,
                    notaMaxima: 100,
                    notaCortePrimerEjercicio: 50,
                    tipoCorte: 'mínima fija en bases',
                    notaMaximaProceso: 165,
                    notaCorteFinal: 82.20,
                    plazas: 257,
                    plazasAmbito: 79
                }
            }
        }
    }
};

// Cuerpo/turno por defecto y persistencia de la preferencia del usuario
const CLAVE_PREF = 'preferenciaComparativa';

export function obtenerPreferencia() {
    try {
        const raw = localStorage.getItem(CLAVE_PREF);
        if (raw) {
            const p = JSON.parse(raw);
            if (DATOS_CONVOCATORIA.cuerpos[p.cuerpo]?.turnos[p.turno]) return p;
        }
    } catch (e) { /* preferencia corrupta: se ignora */ }
    return { cuerpo: 'tramitacion', turno: 'libre' };
}

export function guardarPreferencia(cuerpo, turno) {
    try {
        localStorage.setItem(CLAVE_PREF, JSON.stringify({ cuerpo, turno }));
    } catch (e) { /* sin localStorage: no es crítico */ }
}

/**
 * Penalización oficial en "aciertos equivalentes".
 * Libre: acierto 0,60 / error 0,15 → 1 error = 0,25 aciertos
 * Interna: acierto 1,00 / error 0,25 → 1 error = 0,25 aciertos
 * En ambos casos el divisor real es 4, NO 3.
 */
export function divisorPenalizacion(cuerpo = 'tramitacion', turno = 'libre') {
    const cfg = DATOS_CONVOCATORIA.cuerpos[cuerpo]?.turnos[turno];
    if (!cfg) return 4;
    return cfg.valorAcierto / cfg.penalizacionError; // 4 en todos los procesos vigentes
}

/** Divisor por defecto usado en toda la plataforma (fórmula oficial vigente). */
export const DIVISOR_PENALIZACION = 4;

/**
 * Calcula la nota extrapolada a la escala oficial del examen.
 * @returns {object} desglose completo del cálculo
 */
export function calcularNotaOficial({ correctas = 0, incorrectas = 0, total = 0, cuerpo = 'tramitacion', turno = 'libre' }) {
    const cfg = DATOS_CONVOCATORIA.cuerpos[cuerpo]?.turnos[turno];
    if (!cfg || total <= 0) return null;

    // Puntuación bruta con la fórmula literal del BOE, sobre las preguntas realmente hechas
    const puntosBrutos = (correctas * cfg.valorAcierto) - (incorrectas * cfg.penalizacionError);

    // Extrapolación a un examen completo de 100 preguntas
    const factor = cfg.preguntasExamen / total;
    const notaExtrapolada = Math.max(0, Math.min(cfg.notaMaxima, puntosBrutos * factor));

    // ¿Supera el primer ejercicio?
    const superaPrimerEjercicio = notaExtrapolada >= cfg.notaCortePrimerEjercicio;
    const difPrimerEjercicio = notaExtrapolada - cfg.notaCortePrimerEjercicio;

    // Camino a la plaza (turno libre) — basado SOLO en el 1er ejercicio real.
    // El 1er ejercicio NO descarta por ranking: basta con alcanzar el mínimo fijo
    // de las bases. La plaza se decide por la SUMA de los 3 ejercicios. Calculamos
    // cuántos puntos harían falta en los dos ejercicios restantes para igualar al
    // último que obtuvo plaza en Madrid.
    let puntosRestantesMax = null;        // puntos máximos del 2º + 3er ejercicio
    let puntosNecesariosRestantes = null; // puntos necesarios en esos dos ejercicios
    let plazaAlcanzable = null;           // ¿es matemáticamente posible?
    let puntosConcursoNecesarios = null;

    if (turno === 'libre') {
        puntosRestantesMax = cfg.notaMaximaProceso - cfg.notaMaxima;
        puntosNecesariosRestantes = Math.max(0, cfg.notaCorteFinal - notaExtrapolada);
        plazaAlcanzable = puntosNecesariosRestantes <= puntosRestantesMax;
    } else {
        // Promoción interna: ejercicio único + méritos del concurso
        puntosConcursoNecesarios = Math.max(0, cfg.notaCorteFinal - notaExtrapolada);
    }

    // Fiabilidad estadística según tamaño de la muestra
    let fiabilidad;
    if (total < 15) fiabilidad = 'baja';
    else if (total < 30) fiabilidad = 'media';
    else fiabilidad = 'alta';

    return {
        cfg,
        cuerpo,
        turno,
        correctas,
        incorrectas,
        total,
        penalizacionAciertos: incorrectas / divisorPenalizacion(cuerpo, turno),
        puntosBrutos,
        notaExtrapolada,
        superaPrimerEjercicio,
        difPrimerEjercicio,
        puntosRestantesMax,
        puntosNecesariosRestantes,
        plazaAlcanzable,
        puntosConcursoNecesarios,
        fiabilidad
    };
}

const AVISOS_FIABILIDAD = {
    baja: { color: '#dc3545', icono: '⚠️', texto: 'Muestra muy pequeña: con menos de 15 preguntas la extrapolación es solo orientativa. Haz tests de 50-100 preguntas para una estimación fiable.' },
    media: { color: '#f0932b', icono: '📊', texto: 'Muestra reducida: la extrapolación tiene margen de error. Con 30 o más preguntas la estimación gana precisión.' },
    alta: { color: '#28a745', icono: '✅', texto: 'Muestra suficiente para una extrapolación razonablemente fiable.' }
};

const fmt = (n, d = 2) => Number(n).toFixed(d).replace('.', ',');

/**
 * Genera el HTML del bloque comparativo.
 * @param {object} datos - { correctas, incorrectas, total }
 * @param {string} idBloque - id único del contenedor (permite varios bloques en la misma página)
 */
export function generarBloqueComparativa(datos, idBloque = 'bloqueComparativa') {
    const pref = obtenerPreferencia();
    const r = calcularNotaOficial({ ...datos, cuerpo: pref.cuerpo, turno: pref.turno });

    if (!r) return '';

    const aviso = AVISOS_FIABILIDAD[r.fiabilidad];
    const colorVeredicto = r.superaPrimerEjercicio ? '#28a745' : '#dc3545';

    let html = `<div class="comparativa-corte" id="${idBloque}" data-comparativa='${JSON.stringify(datos).replace(/'/g, '&#39;')}'>`;

    html += `<div class="comparativa-titulo">🎯 ¿Habrías aprobado la oposición?</div>`;

    // Selectores
    html += `<div class="comparativa-selectores">`;
    html += `<div class="comparativa-grupo"><span class="comparativa-grupo-label">Cuerpo</span><div class="comparativa-botones">`;
    for (const clave of ['tramitacion', 'gestion']) {
        const activo = pref.cuerpo === clave ? ' activo' : '';
        html += `<button class="comparativa-btn${activo}" onclick="window.cambiarComparativa('${idBloque}','${clave}','${pref.turno}')">${DATOS_CONVOCATORIA.cuerpos[clave].nombreCorto}</button>`;
    }
    html += `</div></div>`;

    html += `<div class="comparativa-grupo"><span class="comparativa-grupo-label">Turno</span><div class="comparativa-botones">`;
    for (const clave of ['libre', 'interna']) {
        const activo = pref.turno === clave ? ' activo' : '';
        const etiqueta = clave === 'libre' ? 'Libre' : 'P. interna';
        html += `<button class="comparativa-btn${activo}" onclick="window.cambiarComparativa('${idBloque}','${pref.cuerpo}','${clave}')">${etiqueta}</button>`;
    }
    html += `</div></div>`;
    html += `</div>`;

    // NIVEL 1 — Primer ejercicio
    html += `<div class="comparativa-nivel" style="border-left-color:${colorVeredicto}">`;
    html += `<div class="comparativa-nivel-cabecera">1º ejercicio (test)</div>`;
    html += `<div class="comparativa-veredicto" style="color:${colorVeredicto}">${r.superaPrimerEjercicio ? '✅ SUPERADO' : '❌ NO SUPERADO'}</div>`;
    html += `<div class="comparativa-nota">Tu nota extrapolada: <strong>${fmt(r.notaExtrapolada)}</strong> / ${r.cfg.notaMaxima}</div>`;
    html += `<div class="comparativa-corte-dato">Mínimo exigido: <strong>${fmt(r.cfg.notaCortePrimerEjercicio, 0)}</strong> / ${r.cfg.notaMaxima} <small>(${r.cfg.tipoCorte})</small></div>`;
    html += `<div class="comparativa-diferencia" style="color:${colorVeredicto}">${r.difPrimerEjercicio >= 0 ? '+' + fmt(r.difPrimerEjercicio) + ' por encima del mínimo' : 'Te faltan ' + fmt(Math.abs(r.difPrimerEjercicio)) + ' puntos'}</div>`;
    html += `</div>`;

    // NIVEL 2 — Camino a la plaza (a partir del 1er ejercicio)
    if (r.turno === 'libre') {
        const colorPlaza = r.plazaAlcanzable ? '#28a745' : '#dc3545';
        html += `<div class="comparativa-nivel orientativo" style="border-left-color:${colorPlaza}">`;
        html += `<div class="comparativa-nivel-cabecera">Camino a la plaza <span class="comparativa-tag">orientativo</span></div>`;
        html += `<div class="comparativa-veredicto" style="color:${colorPlaza}">${r.plazaAlcanzable ? '🎯 PLAZA AL ALCANCE' : '📉 PLAZA MUY DIFÍCIL'}</div>`;
        html += `<div class="comparativa-corte-dato">Última plaza en ${DATOS_CONVOCATORIA.ambito.split('·')[0].trim()}: <strong>${fmt(r.cfg.notaCorteFinal)}</strong> / ${r.cfg.notaMaximaProceso} <small>(${r.cfg.plazasAmbito} plazas)</small></div>`;
        html += `<div class="comparativa-nota">Con tu 1er ejercicio (<strong>${fmt(r.notaExtrapolada)}</strong> / ${r.cfg.notaMaxima}) necesitarías <strong>${fmt(r.puntosNecesariosRestantes)}</strong> / ${fmt(r.puntosRestantesMax, 0)} en el 2º y 3er ejercicio</div>`;
        html += `<div class="comparativa-supuesto">${r.plazaAlcanzable ? 'El 1er ejercicio solo exige el mínimo fijo; la plaza se decide por la suma de los 3 ejercicios.' : 'Ni con el máximo en los otros dos ejercicios llegarías: necesitas subir la nota del test.'}</div>`;
        html += `</div>`;
    } else {
        html += `<div class="comparativa-nivel orientativo" style="border-left-color:#6c757d">`;
        html += `<div class="comparativa-nivel-cabecera">¿Plaza? <span class="comparativa-tag">depende del concurso</span></div>`;
        html += `<div class="comparativa-nota">Última plaza en ${DATOS_CONVOCATORIA.ambito.split('·')[0].trim()}: <strong>${fmt(r.cfg.notaCorteFinal)}</strong> / ${r.cfg.notaMaximaProceso}</div>`;
        html += `<div class="comparativa-corte-dato">Con esta nota de oposición necesitarías <strong>${fmt(r.puntosConcursoNecesarios)}</strong> puntos de méritos <small>(máx. 65)</small></div>`;
        html += `<div class="comparativa-supuesto">En promoción interna la nota total depende fuertemente de la antigüedad y titulación.</div>`;
        html += `</div>`;
    }

    // Aviso de fiabilidad
    html += `<div class="comparativa-aviso" style="border-color:${aviso.color};color:${aviso.color}">${aviso.icono} ${aviso.texto}</div>`;

    // Pie con procedencia del dato
    html += `<div class="comparativa-fuente">Datos: ${DATOS_CONVOCATORIA.etiqueta} · ${DATOS_CONVOCATORIA.boe} · ${DATOS_CONVOCATORIA.ambito}</div>`;

    html += `</div>`;
    return html;
}

/** Handler global para los botones del selector. */
window.cambiarComparativa = function (idBloque, cuerpo, turno) {
    guardarPreferencia(cuerpo, turno);
    const bloque = document.getElementById(idBloque);
    if (!bloque) return;
    let datos;
    try {
        datos = JSON.parse(bloque.getAttribute('data-comparativa'));
    } catch (e) {
        console.error('Comparativa: datos ilegibles', e);
        return;
    }
    bloque.outerHTML = generarBloqueComparativa(datos, idBloque);
};

// Exposición global para usos puntuales desde consola / HTML inline
window.calcularNotaOficial = calcularNotaOficial;
window.DATOS_CONVOCATORIA = DATOS_CONVOCATORIA;
