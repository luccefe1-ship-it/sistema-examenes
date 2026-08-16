// ============================================================
//  js/boe.js
//  Panel "Mi Oposición": cuenta atrás, selector de cuerpo y las
//  tres pestañas (temario, convocatoria, examen).
//
//  DE DÓNDE SALE CADA COSA:
//    - Ficha del cuerpo y leyes vigiladas -> /api/mi-oposicion, con
//      el token del usuario.
//    - Novedades del BOE -> colección boeAvisos, que escribe el cron.
//      Aquí solo se leen: si el navegador pudiera escribirlas,
//      cualquiera podría inventarse una reforma legal en su propia
//      plataforma.
//
//  Lo único que escribe esta pantalla es la marca de leído y el
//  cuerpo elegido, ambos en documentos del propio usuario.
// ============================================================

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    collection, query, orderBy, limit, getDocs, getDoc, doc, setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Cuántos avisos se traen. Con uno o dos al día, 200 son varios meses.
const MAX_AVISOS = 200;

/* Los tres cuerpos que salen en la misma convocatoria, escritos como
   los escribe el BOE, y cómo aparecen citados en un título. */
const CUERPOS = {
    gestion:     { nombre: 'Gestión Procesal y Administrativa',     pistas: ['gestion procesal'] },
    tramitacion: { nombre: 'Tramitación Procesal y Administrativa', pistas: ['tramitacion procesal'] },
    auxilio:     { nombre: 'Auxilio Judicial',                      pistas: ['auxilio judicial'] }
};

let usuario = null;
let ficha = null;
let cuerpoElegido = 'gestion';
let avisos = [];
let leidos = new Set();
let filtroActivo = 'todos';

// ------------------------------------------------------------
//  Arranque
// ------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'index.html'; return; }
    usuario = user;
    document.getElementById('userName').textContent = user.displayName || user.email;

    cuerpoElegido = await leerCuerpo() || 'gestion';
    document.getElementById('selectorCuerpo').value = cuerpoElegido;

    // Los avisos vienen de Firestore y la ficha de la API: en paralelo
    await Promise.all([cargarAvisos(), cargarFicha()]);
});

async function leerCuerpo() {
    try {
        const perfil = await getDoc(doc(db, 'usuarios', usuario.uid));
        const guardado = perfil.exists() ? perfil.data().cuerpoOposicion : null;
        return Object.prototype.hasOwnProperty.call(CUERPOS, guardado || '') ? guardado : null;
    } catch (error) {
        console.warn('[oposicion] No se pudo leer el perfil:', error.message);
        return null;
    }
}

async function guardarCuerpo(clave) {
    try {
        await setDoc(doc(db, 'usuarios', usuario.uid), { cuerpoOposicion: clave }, { merge: true });
    } catch (error) {
        console.error('[oposicion] No se pudo guardar el cuerpo:', error);
    }
}

// ------------------------------------------------------------
//  Utilidades
// ------------------------------------------------------------
function escapar(texto) {
    const div = document.createElement('div');
    div.textContent = String(texto ?? '');
    return div.innerHTML;
}

/* Sin acentos y en minúsculas: comparar "Administración" con
   "administracion" falla siempre y es el fallo más aburrido de
   encontrar. */
function normalizar(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function fechaLarga(iso) {
    if (!iso) return '';
    const [a, m, d] = iso.split('-').map(Number);
    return new Date(a, m - 1, d).toLocaleDateString('es-ES',
        { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// ------------------------------------------------------------
//  Ficha del cuerpo
// ------------------------------------------------------------
async function cargarFicha() {
    try {
        const token = await usuario.getIdToken();
        const respuesta = await fetch('/api/mi-oposicion', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
            body: JSON.stringify({ cuerpo: cuerpoElegido })
        });

        if (!respuesta.ok) {
            const detalle = await respuesta.json().catch(() => ({}));
            throw new Error(detalle.error || `Error ${respuesta.status}`);
        }

        ficha = await respuesta.json();
        pintarPortada();
        pintarNormas();
        pintarAvisos();

    } catch (error) {
        console.error('[oposicion] No se pudo cargar la ficha:', error);
        document.getElementById('listaNormas').innerHTML =
            `<p class="op-nota">No se pudieron cargar las leyes vigiladas: ${escapar(error.message)}</p>`;
    }
}

function pintarPortada() {
    document.getElementById('opCuerpo').textContent = ficha.cuerpo.nombre;
    document.getElementById('opDias').textContent = ficha.examenPasado ? '—' : ficha.diasParaExamen;
    document.getElementById('opFecha').textContent = fechaLarga(ficha.fechaExamen);
    document.getElementById('tituloCuerpoNovedades').textContent = ficha.cuerpo.nombre;
}

// ------------------------------------------------------------
//  Bloque: leyes bajo vigilancia
//  Se enseñan a propósito. Lo que no está en la lista no lo mira
//  nadie, y eso hay que poder verlo de un vistazo.
// ------------------------------------------------------------
function pintarNormas() {
    const normas = ficha.normasVigiladas || [];
    const contenedor = document.getElementById('listaNormas');

    document.getElementById('contadorNormas').textContent =
        `${normas.length} normas`;

    // Cuántos avisos ha generado cada norma, para poder marcarlas
    const avisosPorNorma = new Map();
    for (const aviso of avisos) {
        for (const n of (aviso.normas || [])) {
            avisosPorNorma.set(n.id, (avisosPorNorma.get(n.id) || 0) + 1);
        }
    }

    // Agrupadas por bloque del temario, en el orden en que aparecen
    const bloques = new Map();
    for (const norma of normas) {
        const clave = norma.bloque || 'Otras';
        if (!bloques.has(clave)) bloques.set(clave, []);
        bloques.get(clave).push(norma);
    }

    contenedor.innerHTML = [...bloques].map(([bloque, lista]) => `
        <div class="op-normas-grupo">
            <h4 class="op-normas-titulo">${escapar(bloque)}</h4>
            <ul class="op-normas-lista">
                ${lista.map(n => {
                    const tocada = avisosPorNorma.get(n.id) || 0;
                    return `
                    <li class="op-norma ${tocada ? 'tocada' : ''}">
                        <a href="https://www.boe.es/buscar/act.php?id=${escapar(n.id)}"
                           target="_blank" rel="noopener noreferrer">${escapar(n.nombre)}</a>
                        ${n.soloDeEsteCuerpo ? '<span class="op-norma-etiqueta">solo tu cuerpo</span>' : ''}
                        ${tocada ? `<span class="op-norma-avisos">${tocada} aviso${tocada === 1 ? '' : 's'}</span>` : ''}
                    </li>`;
                }).join('')}
            </ul>
        </div>`).join('');
}

// ------------------------------------------------------------
//  Novedades del BOE
// ------------------------------------------------------------
async function cargarAvisos() {
    try {
        const [instantanea, marcas] = await Promise.all([
            getDocs(query(collection(db, 'boeAvisos'), orderBy('fecha', 'desc'), limit(MAX_AVISOS))),
            getDoc(doc(db, 'boeLeidos', usuario.uid))
        ]);

        leidos = new Set(marcas.exists() ? (marcas.data().claves || []) : []);

        /* Las preguntas señaladas de cada aviso viven en una
           subcolección por usuario, no en el documento principal: el
           aviso del BOE es público, el banco de preguntas de cada uno
           no. Se piden en paralelo. */
        avisos = await Promise.all(instantanea.docs.map(async (documento) => {
            const datos = { id: documento.id, ...documento.data() };
            try {
                const mios = await getDoc(doc(db, 'boeAvisos', documento.id, 'afectados', usuario.uid));
                datos.preguntas = mios.exists() ? (mios.data().preguntas || []) : [];
            } catch (error) {
                datos.preguntas = [];
            }
            return datos;
        }));

        pintarAvisos();

    } catch (error) {
        console.error('[oposicion] No se pudieron cargar los avisos:', error);
        const vacio = document.getElementById('sinAvisos');
        vacio.style.display = 'block';
        vacio.querySelector('h3').textContent = 'No se pudieron cargar las novedades';
        vacio.querySelector('p').textContent = error.message;
    } finally {
        document.getElementById('cargandoAvisos').style.display = 'none';
    }
}

/* ¿Este aviso toca el temario del cuerpo elegido?

   REGLA, y el orden importa:
   1. Si el título nombra tu cuerpo, entra.
   2. Si es una CONVOCATORIA que nombra otro cuerpo y no el tuyo,
      fuera: unas listas de admitidos de Auxilio no te sirven.
      Esto solo se aplica a las convocatorias, porque "auxilio
      judicial" también es un concepto del temario (los exhortos) y
      una reforma sobre actos de auxilio judicial sí interesa a los
      tres cuerpos.
   3. Si cita normas, entra si alguna es de las que vigilas.
   4. Si no cita ninguna norma, entra: es una publicación general
      sobre la Administración de Justicia y más vale leerla.

   Ante la duda, entra. Un aviso de más se descarta en dos segundos;
   uno de menos no se descubre nunca. */
function tocaMiTemario(aviso) {
    const texto = normalizar(`${aviso.titulo} ${aviso.resumen || ''} ${aviso.motivo || ''}`);

    const mias = CUERPOS[cuerpoElegido].pistas;
    if (mias.some(p => texto.includes(p))) return true;

    if (aviso.tipo === 'convocatoria') {
        const ajenas = Object.entries(CUERPOS)
            .filter(([clave]) => clave !== cuerpoElegido)
            .flatMap(([, datos]) => datos.pistas);
        if (ajenas.some(p => texto.includes(p))) return false;
    }

    const citadas = aviso.normas || [];
    if (!citadas.length) return true;

    const mios = new Set((ficha?.normasVigiladas || []).map(n => n.id));
    if (!mios.size) return true;          // aún no ha llegado la ficha
    return citadas.some(n => mios.has(n.id));
}

function coincideFiltro(aviso) {
    if (filtroActivo === 'todos') return true;
    if (filtroActivo === 'sinleer') return !leidos.has(aviso.id);
    return aviso.tipo === filtroActivo;
}

const ICONOS = { modificacion: '⚖️', convocatoria: '📣', disposicion: '📄', otra: '📌' };

function pintarAvisos() {
    const lista = document.getElementById('listaAvisos');
    const vacio = document.getElementById('sinAvisos');
    const visibles = avisos.filter(tocaMiTemario).filter(coincideFiltro);

    lista.innerHTML = '';
    vacio.style.display = visibles.length ? 'none' : 'block';

    for (const aviso of visibles) {
        const leido = leidos.has(aviso.id);
        const tarjeta = document.createElement('article');
        tarjeta.className = `boe-aviso importancia-${aviso.importancia || 'media'}${leido ? ' leido' : ''}`;

        const normas = (aviso.normas || []).map(n => `<span class="boe-etiqueta">${escapar(n.nombre)}</span>`).join('');
        const articulos = (aviso.articulos || []).length
            ? `<span class="boe-etiqueta boe-etiqueta-art">arts. ${escapar(aviso.articulos.join(', '))}</span>`
            : '';

        const preguntas = (aviso.preguntas || []).length
            ? `<details class="boe-preguntas">
                   <summary>${aviso.preguntas.length} pregunta${aviso.preguntas.length === 1 ? '' : 's'} de tu banco a revisar</summary>
                   <ul>${aviso.preguntas.map(p => `
                       <li>
                           <span class="boe-pregunta-tema">${escapar(p.temaNombre)}</span>
                           ${escapar(p.enunciado)}
                           <span class="boe-pregunta-art">art. ${escapar((p.articulos || []).join(', '))}</span>
                       </li>`).join('')}</ul>
               </details>`
            : '';

        tarjeta.innerHTML = `
            <div class="boe-aviso-cabecera">
                <span class="boe-icono">${ICONOS[aviso.tipo] || '📌'}</span>
                <div class="boe-aviso-meta">
                    <span class="boe-fecha">${escapar(aviso.fechaLegible || aviso.fecha)}</span>
                    <span class="boe-motivo">${escapar(aviso.motivo || '')}</span>
                </div>
                <button class="boe-marcar" data-id="${escapar(aviso.id)}">
                    ${leido ? 'Marcar sin leer' : 'Marcar leído'}
                </button>
            </div>

            <h3 class="boe-titulo">${escapar(aviso.titulo)}</h3>
            ${aviso.resumen ? `<p class="boe-resumen">${escapar(aviso.resumen)}</p>` : ''}

            <div class="boe-etiquetas">${normas}${articulos}</div>
            ${preguntas}

            <div class="boe-enlaces">
                ${aviso.urlHtml ? `<a href="${escapar(aviso.urlHtml)}" target="_blank" rel="noopener noreferrer">Ver en el BOE</a>` : ''}
                ${aviso.urlPdf ? `<a href="${escapar(aviso.urlPdf)}" target="_blank" rel="noopener noreferrer">PDF</a>` : ''}
            </div>`;

        lista.appendChild(tarjeta);
    }

    const marcarTodos = document.getElementById('marcarTodos');
    const sinLeer = avisos.filter(tocaMiTemario).filter(a => !leidos.has(a.id)).length;
    if (marcarTodos) marcarTodos.style.display = sinLeer > 0 ? '' : 'none';
}

async function guardarLeidos(anterior) {
    try {
        await setDoc(doc(db, 'boeLeidos', usuario.uid), {
            usuarioId: usuario.uid,
            claves: [...leidos],
            actualizado: new Date()
        }, { merge: true });
    } catch (error) {
        console.error('[oposicion] No se pudo guardar la marca:', error);
        leidos = anterior;
        pintarAvisos();
    }
}

/* Los botones se enganchan una sola vez por delegación, no al pintar
   cada tarjeta: la lista se repinta con cada filtro y ahí es fácil
   duplicar listeners sin darse cuenta. */
document.addEventListener('click', async (evento) => {
    const marcar = evento.target.closest('.boe-marcar[data-id]');
    if (!marcar) return;

    const id = marcar.dataset.id;
    const anterior = new Set(leidos);
    if (leidos.has(id)) leidos.delete(id); else leidos.add(id);
    pintarAvisos();
    await guardarLeidos(anterior);
});

document.getElementById('marcarTodos')?.addEventListener('click', async () => {
    const sinLeer = avisos.filter(tocaMiTemario).filter(a => !leidos.has(a.id));
    if (!sinLeer.length) return;
    if (!confirm(`¿Marcar como leídos los ${sinLeer.length} avisos sin leer?`)) return;

    const anterior = new Set(leidos);
    sinLeer.forEach(a => leidos.add(a.id));
    pintarAvisos();
    await guardarLeidos(anterior);
});

document.querySelectorAll('.boe-filtro').forEach(boton => {
    boton.addEventListener('click', () => {
        document.querySelectorAll('.boe-filtro').forEach(b => b.classList.remove('activo'));
        boton.classList.add('activo');
        filtroActivo = boton.dataset.filtro;
        pintarAvisos();
    });
});

// ------------------------------------------------------------
//  Selector de cuerpo
// ------------------------------------------------------------
document.getElementById('selectorCuerpo')?.addEventListener('change', async (evento) => {
    cuerpoElegido = evento.target.value;
    await guardarCuerpo(cuerpoElegido);
    await cargarFicha();     // repinta portada, leyes y novedades
});

// ------------------------------------------------------------
//  Pestañas
// ------------------------------------------------------------
function abrirPanel(nombre) {
    document.querySelectorAll('.op-pestana').forEach(b =>
        b.classList.toggle('activa', b.dataset.panel === nombre));
    document.querySelectorAll('.op-panel').forEach(p =>
        p.classList.toggle('activo', p.id === `panel-${nombre}`));
}

document.querySelectorAll('.op-pestana').forEach(boton => {
    boton.addEventListener('click', () => abrirPanel(boton.dataset.panel));
});
