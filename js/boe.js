// ============================================================
//  js/boe.js
//  Pinta los avisos del BOE que ha dejado /api/boe-vigilante.
//
//  Aquí SOLO se lee. Los avisos los escribe el servidor: si el
//  navegador pudiera escribirlos, cualquiera podría inventarse una
//  reforma legal en su propia plataforma. Lo único que se escribe
//  desde aquí es la marca de leído, y va en un documento aparte
//  de cada usuario.
// ============================================================

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    collection, query, orderBy, limit, getDocs, getDoc, doc, setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Cuántos avisos se traen. Con uno o dos al día, 200 son varios meses.
const MAX_AVISOS = 200;

let usuario = null;
let avisos = [];
let leidos = new Set();
let filtroActivo = 'todos';

/* Se guarda aparte porque el resumen se repinta cada vez que se marca
   un aviso, y si dependiera del parámetro la fecha de "última revisión"
   se borraría al primer clic. */
let ultimaRevision = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'index.html'; return; }
    usuario = user;
    document.getElementById('userName').textContent = user.displayName || user.email;
    await cargar();
});

async function cargar() {
    const cargando = document.getElementById('cargando');

    try {
        const [instantanea, marcas, estado] = await Promise.all([
            getDocs(query(collection(db, 'boeAvisos'), orderBy('fecha', 'desc'), limit(MAX_AVISOS))),
            getDoc(doc(db, 'boeLeidos', usuario.uid)),
            getDoc(doc(db, 'boeEstado', 'vigilante')).catch(() => null)
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
                // Sin permiso o sin datos: el aviso se muestra igual,
                // solo que sin la lista de preguntas.
                datos.preguntas = [];
            }

            return datos;
        }));

        const datosEstado = estado?.exists?.() ? estado.data() : null;
        ultimaRevision = datosEstado?.momento || null;

        pintarResumen();
        pintar();

    } catch (error) {
        console.error('[boe] No se pudieron cargar los avisos:', error);
        document.getElementById('vacio').style.display = 'block';
        document.getElementById('vacio').querySelector('h3').textContent = 'No se pudieron cargar los avisos';
        document.getElementById('vacio').querySelector('p').textContent = error.message;
    } finally {
        cargando.style.display = 'none';
    }
}

function pintarResumen() {
    const sinLeer = avisos.filter(a => !leidos.has(a.id)).length;
    const altas = avisos.filter(a => a.importancia === 'alta' && !leidos.has(a.id)).length;
    const preguntas = avisos.reduce((suma, a) => suma + (a.preguntas?.length || 0), 0);

    document.getElementById('statSinLeer').textContent = sinLeer;
    document.getElementById('statAltas').textContent = altas;
    document.getElementById('statPreguntas').textContent = preguntas;

    document.getElementById('statUltima').textContent = ultimaRevision?.toDate
        ? ultimaRevision.toDate().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
        : '—';

    // El botón de marcar todo no pinta nada si ya está todo leído
    const marcarTodos = document.getElementById('marcarTodos');
    if (marcarTodos) marcarTodos.style.display = sinLeer > 0 ? '' : 'none';
}

function coincideFiltro(aviso) {
    if (filtroActivo === 'todos') return true;
    if (filtroActivo === 'sinleer') return !leidos.has(aviso.id);
    return aviso.tipo === filtroActivo;
}

function escapar(texto) {
    const div = document.createElement('div');
    div.textContent = String(texto ?? '');
    return div.innerHTML;
}

const ICONOS = {
    modificacion: '⚖️',
    convocatoria: '📣',
    disposicion: '📄',
    otra: '📌'
};

function pintar() {
    const lista = document.getElementById('listaAvisos');
    const vacio = document.getElementById('vacio');
    const visibles = avisos.filter(coincideFiltro);

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
            </div>
        `;

        lista.appendChild(tarjeta);
    }
}

/* Los botones se enganchan una sola vez por delegación, no al pintar
   cada tarjeta: la lista se repinta con cada filtro y ahí es fácil
   duplicar listeners sin darse cuenta. */
document.addEventListener('click', async (evento) => {
    const boton = evento.target.closest('.boe-marcar');
    if (!boton) return;

    const id = boton.dataset.id;
    if (leidos.has(id)) leidos.delete(id); else leidos.add(id);

    // Se pinta antes de guardar: la respuesta es instantánea y, si
    // Firestore falla, se avisa y se deshace.
    pintar();
    pintarResumen();

    try {
        await setDoc(doc(db, 'boeLeidos', usuario.uid), {
            usuarioId: usuario.uid,
            claves: [...leidos],
            actualizado: new Date()
        }, { merge: true });
    } catch (error) {
        console.error('[boe] No se pudo guardar la marca de leído:', error);
        if (leidos.has(id)) leidos.delete(id); else leidos.add(id);
        pintar();
    }
});

document.querySelectorAll('.boe-filtro').forEach(boton => {
    boton.addEventListener('click', () => {
        document.querySelectorAll('.boe-filtro').forEach(b => b.classList.remove('activo'));
        boton.classList.add('activo');
        filtroActivo = boton.dataset.filtro;
        pintar();
    });
});

/* Marcar todo de golpe.

   Hace falta porque la primera ejecución dejó 90 avisos acumulados y
   apagarlos de uno en uno son 90 clics. Marca lo que hay CARGADO en
   pantalla, no la colección entera: si algún día hay miles, no tiene
   sentido traérselos todos para tacharlos. */
document.getElementById('marcarTodos')?.addEventListener('click', async (evento) => {
    const boton = evento.currentTarget;
    const sinLeer = avisos.filter(a => !leidos.has(a.id));

    if (!sinLeer.length) return;
    if (!confirm(`¿Marcar como leídos los ${sinLeer.length} avisos sin leer?`)) return;

    const copia = new Set(leidos);
    sinLeer.forEach(a => leidos.add(a.id));

    boton.disabled = true;
    pintar();
    pintarResumen();

    try {
        await setDoc(doc(db, 'boeLeidos', usuario.uid), {
            usuarioId: usuario.uid,
            claves: [...leidos],
            actualizado: new Date()
        }, { merge: true });
    } catch (error) {
        console.error('[boe] No se pudieron guardar las marcas:', error);
        // Se deshace entero: dejar la mitad marcada sería peor
        leidos = copia;
        pintar();
        pintarResumen();
        alert('No se pudieron guardar las marcas. Inténtalo de nuevo.');
    } finally {
        boton.disabled = false;
    }
});
