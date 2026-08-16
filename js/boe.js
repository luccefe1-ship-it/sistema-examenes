// ============================================================
//  js/boe.js
//  Panel "Mi Oposición": convocatoria, qué revisar y avisos del BOE.
//
//  DE DÓNDE SALE CADA COSA:
//    - Convocatoria y revisión -> /api/mi-oposicion (con el token del
//      usuario, porque lee SUS temas y SUS preguntas).
//    - Avisos del BOE          -> colección boeAvisos, que escribe el
//      cron. Aquí solo se leen: si el navegador pudiera escribirlos,
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

let usuario = null;
let avisos = [];
let leidos = new Set();
let filtroActivo = 'todos';
let ultimaRevision = null;
let ficha = null;
let cuerpoElegido = null;

// ------------------------------------------------------------
//  Arranque
// ------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'index.html'; return; }
    usuario = user;
    document.getElementById('userName').textContent = user.displayName || user.email;

    cuerpoElegido = await leerCuerpo();
    if (!cuerpoElegido) cuerpoElegido = await preguntarCuerpo();

    // Los avisos vienen de Firestore y la ficha de la API: en paralelo
    await Promise.all([cargarAvisos(), cargarFicha()]);
});

/* El cuerpo se guarda en el perfil porque Luciano y Sandra comparten
   plataforma y no se presentan al mismo: él a Gestión, ella a
   Tramitación. Cada uno tiene que ver sus plazas, sus ejercicios y su
   temario, no los del otro. */
async function leerCuerpo() {
    try {
        const perfil = await getDoc(doc(db, 'usuarios', usuario.uid));
        const guardado = perfil.exists() ? perfil.data().cuerpoOposicion : null;
        return ['gestion', 'tramitacion'].includes(guardado) ? guardado : null;
    } catch (error) {
        console.warn('[oposicion] No se pudo leer el perfil:', error.message);
        return null;
    }
}

/* Primera vez: se pregunta y se guarda. Se puede cambiar luego desde
   la propia etiqueta de la cabecera. */
function preguntarCuerpo() {
    return new Promise(resolve => {
        const caja = document.createElement('div');
        caja.className = 'op-eleccion';
        caja.innerHTML = `
            <h3>¿A qué cuerpo te presentas?</h3>
            <p>Se guarda en tu perfil. Sandra y tú veis cada uno lo vuestro.</p>
            <div class="op-eleccion-botones">
                <button data-cuerpo="gestion">
                    <strong>Gestión Procesal</strong>
                    <span>68 temas · 725 plazas</span>
                </button>
                <button data-cuerpo="tramitacion">
                    <strong>Tramitación Procesal</strong>
                    <span>37 temas · 1.155 plazas</span>
                </button>
            </div>`;

        document.querySelector('.boe-container').prepend(caja);

        caja.addEventListener('click', async (evento) => {
            const boton = evento.target.closest('button[data-cuerpo]');
            if (!boton) return;
            const elegido = boton.dataset.cuerpo;
            await guardarCuerpo(elegido);
            caja.remove();
            resolve(elegido);
        });
    });
}

async function guardarCuerpo(clave) {
    try {
        await setDoc(doc(db, 'usuarios', usuario.uid), { cuerpoOposicion: clave }, { merge: true });
    } catch (error) {
        console.error('[oposicion] No se pudo guardar el cuerpo:', error);
    }
}

// ------------------------------------------------------------
//  Ficha de la convocatoria y revisión del material
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
        pintarConvocatoria();
        pintarExamen();
        pintarCambiosTemario();
        pintarRevision();

    } catch (error) {
        console.error('[oposicion] No se pudo cargar la ficha:', error);
        document.getElementById('revisarCargando').innerHTML =
            `<p>No se pudo revisar tu material: ${escapar(error.message)}</p>`;
    }
}

function escapar(texto) {
    const div = document.createElement('div');
    div.textContent = String(texto ?? '');
    return div.innerHTML;
}

function fechaLarga(iso) {
    if (!iso) return '';
    const [a, m, d] = iso.split('-').map(Number);
    return new Date(a, m - 1, d).toLocaleDateString('es-ES',
        { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function fechaCorta(iso) {
    if (!iso) return '';
    const [a, m, d] = iso.split('-').map(Number);
    return new Date(a, m - 1, d).toLocaleDateString('es-ES',
        { day: 'numeric', month: 'short', year: 'numeric' });
}

/* Los datos del BOE vienen como texto ("100 (+4 de reserva)",
   "100 min") porque así es como los publica la orden y así se
   guardan literales en _convocatoria.js. Para sumarlos hace falta
   sacar el primer número, que siempre es el que cuenta. */
function primerNumero(texto) {
    const encontrado = String(texto || '').match(/\d+/);
    return encontrado ? Number(encontrado[0]) : 0;
}

// ------------------------------------------------------------
//  Portada: cuenta atrás y titulares
// ------------------------------------------------------------
function pintarPortada() {
    const cuerpo = ficha.cuerpo;
    const rev = ficha.revision;

    const etiqueta = document.getElementById('opCuerpo');
    etiqueta.textContent = cuerpo.nombre;
    etiqueta.title = 'Pulsa para cambiar de cuerpo';
    etiqueta.onclick = async () => {
        const otro = cuerpoElegido === 'gestion' ? 'tramitacion' : 'gestion';
        cuerpoElegido = otro;
        await guardarCuerpo(otro);
        await cargarFicha();
    };

    document.getElementById('opDias').textContent = ficha.examenPasado ? '—' : ficha.diasParaExamen;
    document.getElementById('opFecha').textContent = fechaLarga(ficha.fechaExamen);

    const sinLeer = avisos.filter(a => !leidos.has(a.id)).length;

    /* Tres cifras y solo tres, y cada una lleva a una pestaña
       distinta. La versión anterior enseñaba cuatro contadores y
       ninguno decía qué hacer. */
    document.getElementById('opResumen').innerHTML = `
        <a class="op-dato ${sinLeer ? 'alerta' : ''}" href="#" data-ir="temario">
            <strong>${sinLeer}</strong>
            <span>avisos sin leer</span>
        </a>
        <a class="op-dato ${rev.temasConProblemas ? 'alerta' : ''}" href="#" data-ir="temario">
            <strong>${rev.temasConProblemas}</strong>
            <span>temas a revisar</span>
        </a>
        <a class="op-dato" href="#" data-ir="convocatoria">
            <strong>${cuerpo.plazas.total.toLocaleString('es-ES')}</strong>
            <span>plazas convocadas</span>
        </a>`;

    /* Un solo contador en la pestaña de temario, que ahora agrupa
       los avisos del BOE y la revisión del material propio. */
    const pendientes = sinLeer + rev.temasConProblemas;
    document.getElementById('tabTemario').textContent = pendientes ? pendientes : '';
}

// ------------------------------------------------------------
//  Panel: qué revisar
// ------------------------------------------------------------
function pintarRevision() {
    const rev = ficha.revision;
    document.getElementById('revisarCargando').style.display = 'none';

    if (!rev.temas.length) {
        document.getElementById('revisarLimpio').style.display = 'block';
        if (rev.sinDocumentoRevisable) {
            document.getElementById('revisarLimpio').querySelector('p').textContent =
                `Nada que corregir. Eso sí: ${rev.sinDocumentoRevisable} tema(s) digital(es) se subieron sin texto extraíble y no he podido mirarlos.`;
        }
        return;
    }

    const caja = document.getElementById('revisarResumen');
    caja.style.display = 'block';
    caja.innerHTML = `
        <strong>${rev.temasConProblemas} de ${rev.temasRevisados} temas</strong> usan vocabulario que la
        Ley Orgánica 1/2025 dejó atrás. Es material escrito antes de abril de 2025: donde pone
        “Juzgado de lo Penal”, el examen preguntará por “Tribunal de Instancia, Sección de
        Enjuiciamiento Penal”.
        ${rev.sinDocumentoRevisable ? `<br><br>Además, ${rev.sinDocumentoRevisable} tema(s) digital(es) no se pueden revisar porque se subieron sin texto extraíble.` : ''}`;

    const lista = document.getElementById('listaTemas');
    lista.innerHTML = '';

    for (const tema of rev.temas) {
        const art = document.createElement('article');
        art.className = `boe-aviso importancia-${tema.gravedad === 'alta' ? 'alta' : 'media'}`;

        const digital = tema.digital.tieneDocumento && tema.digital.hallazgos.length
            ? `<details class="boe-preguntas">
                 <summary>Tema digital: ${tema.digital.hallazgos.reduce((s, h) => s + h.veces, 0)} coincidencia(s) en «${escapar(tema.digital.nombre)}»</summary>
                 <ul>${tema.digital.hallazgos.map(h => `
                    <li>
                      <span class="boe-pregunta-tema">${escapar(h.termino)}</span>
                      ahora es <strong>${escapar(h.ahora)}</strong>
                      <div class="op-fragmentos">${h.fragmentos.map(f => `<p>${escapar(f)}</p>`).join('')}</div>
                    </li>`).join('')}</ul>
               </details>`
            : '';

        const preguntas = tema.preguntasMarcadas.length
            ? `<details class="boe-preguntas">
                 <summary>${tema.totalPreguntasMarcadas} pregunta(s) a corregir</summary>
                 <ul>${tema.preguntasMarcadas.map(p => `
                    <li>
                      ${escapar(p.enunciado)}
                      <div class="op-terminos">${p.terminos.map(t =>
                          `<span class="boe-etiqueta-art boe-etiqueta">${escapar(t.termino)} → ${escapar(t.ahora)}</span>`).join('')}</div>
                    </li>`).join('')}</ul>
               </details>`
            : '';

        const sinTexto = tema.digital.tieneDocumento && !tema.digital.revisable
            ? `<p class="op-nota">⚠️ El documento «${escapar(tema.digital.nombre)}» no tiene texto extraíble. Vuelve a subirlo para poder revisarlo.</p>`
            : '';

        art.innerHTML = `
            <div class="boe-aviso-cabecera">
                <span class="boe-icono">${tema.gravedad === 'alta' ? '🔴' : '🟠'}</span>
                <div class="boe-aviso-meta">
                    <span class="boe-fecha">${escapar(tema.nombre)}</span>
                    <span class="boe-motivo">${tema.totalPreguntas} preguntas en total${tema.esSubtema ? ' · subtema' : ''}</span>
                </div>
                <button class="boe-marcar" onclick="window.location.href='tests.html'">Abrir tema</button>
            </div>
            ${sinTexto}
            ${digital}
            ${preguntas}`;

        lista.appendChild(art);
    }
}

// ------------------------------------------------------------
//  Panel: mi convocatoria
//  Cómo va el proceso. Nada de contenido de examen aquí: eso vive
//  en su propia pestaña.
// ------------------------------------------------------------
function pintarConvocatoria() {
    const c = ficha.cuerpo;

    document.getElementById('refConvocatoria').textContent =
        `${ficha.convocatoria} · ${ficha.ordenConvocatoria}`;

    /* El estado no se guarda como tal: se deduce de los hitos. El
       último "hecho" es dónde estamos y el primer "pendiente" es lo
       siguiente que va a pasar. Así, cuando se añada un hito nuevo
       en _convocatoria.js, esto se actualiza solo. */
    const hechos = ficha.hitos.filter(h => h.estado === 'hecho');
    const pendientes = ficha.hitos.filter(h => h.estado !== 'hecho');
    const ultimo = hechos[hechos.length - 1] || null;
    const siguiente = pendientes[0] || null;

    document.getElementById('estadoProceso').innerHTML = `
        <div class="op-estado-chip hecho">
            <span>Último paso dado</span>
            <strong>${ultimo ? escapar(ultimo.titulo) : 'Sin hitos publicados'}</strong>
        </div>
        <div class="op-estado-chip espera">
            <span>Siguiente paso</span>
            <strong>${siguiente ? escapar(siguiente.titulo) : 'Proceso terminado'}</strong>
        </div>
        <div class="op-estado-chip">
            <span>Tu cuerpo</span>
            <strong>${escapar(c.nombre)}</strong>
        </div>`;

    document.getElementById('fichasCuerpo').innerHTML = `
        <div class="op-ficha"><strong>${c.plazas.total.toLocaleString('es-ES')}</strong><span>plazas en total</span></div>
        <div class="op-ficha"><strong>${c.plazas.general.toLocaleString('es-ES')}</strong><span>cupo general</span></div>
        <div class="op-ficha"><strong>${c.plazas.discapacidad}</strong><span>cupo discapacidad</span></div>
        <div class="op-ficha"><strong>${c.temas}</strong><span>temas del programa</span></div>
        <div class="op-ficha ancha"><strong>${escapar(c.titulacion)}</strong><span>titulación exigida</span></div>`;

    /* El primer hito sin cumplir se marca aparte: es el único que
       hay que mirar hoy, y con la línea de tiempo se ve de un
       vistazo dónde está el proceso. */
    const idSiguiente = siguiente ? ficha.hitos.indexOf(siguiente) : -1;

    document.getElementById('listaHitos').innerHTML = ficha.hitos.map((h, i) => `
        <li class="op-hito ${h.estado}${i === idSiguiente ? ' siguiente' : ''}">
            <div class="op-hito-punto"></div>
            <div class="op-hito-cuerpo">
                <div class="op-hito-fecha">${h.fecha ? fechaLarga(h.fecha) : 'Sin fecha todavía'}</div>
                <strong>${escapar(h.titulo)}</strong>
                <p>${escapar(h.detalle)}</p>
                ${h.idBoe ? `<a href="https://www.boe.es/diario_boe/txt.php?id=${escapar(h.idBoe)}" target="_blank" rel="noopener noreferrer">${escapar(h.idBoe)}</a>` : ''}
            </div>
        </li>`).join('');
}

// ------------------------------------------------------------
//  Panel: mi examen
//  El día D: cuándo, dónde, cuánto dura y cómo puntúa.
// ------------------------------------------------------------
function pintarExamen() {
    const c = ficha.cuerpo;

    const minutos = c.ejercicios.reduce((s, e) => s + primerNumero(e.tiempo), 0);
    const preguntas = c.ejercicios.reduce((s, e) => s + primerNumero(e.preguntas), 0);

    /* La sede NO está en los datos, y no se inventa. Sale del hito
       que la publica: mientras siga pendiente, se dice que está
       pendiente. Una sede equivocada sería peor que ninguna. */
    const hitoSede = ficha.hitos.find(h => /sede/i.test(h.titulo || ''));
    const sedePublicada = hitoSede && hitoSede.estado === 'hecho';

    document.getElementById('pastillasExamen').innerHTML = `
        <div class="op-pastilla">
            <div class="op-pastilla-icono">📅</div>
            <span>Fecha</span>
            <strong>${fechaLarga(ficha.fechaExamen)}</strong>
        </div>
        <div class="op-pastilla ${sedePublicada ? '' : 'pendiente'}">
            <div class="op-pastilla-icono">📍</div>
            <span>Sede</span>
            <strong>${sedePublicada ? 'Consulta el BOE de tu hito' : 'Pendiente de publicación'}</strong>
        </div>
        <div class="op-pastilla">
            <div class="op-pastilla-icono">⏱️</div>
            <span>Duración de los ejercicios</span>
            <strong>${minutos} min</strong>
        </div>
        <div class="op-pastilla">
            <div class="op-pastilla-icono">✍️</div>
            <span>Preguntas en total</span>
            <strong>${preguntas}</strong>
        </div>`;

    document.getElementById('tarjetasEjercicios').innerHTML = c.ejercicios.map(e => `
        <article class="op-ejercicio">
            ${e.minimo && e.minimo !== '—' ? '<span class="op-ejercicio-eliminatorio">Eliminatorio</span>' : ''}
            <h4>${escapar(e.nombre)}</h4>
            <p class="op-ejercicio-contenido">${escapar(e.contenido)}</p>
            <div class="op-ejercicio-datos">
                <div class="op-ejercicio-dato"><span>Preguntas</span><strong>${escapar(e.preguntas)}</strong></div>
                <div class="op-ejercicio-dato"><span>Tiempo</span><strong>${escapar(e.tiempo)}</strong></div>
                <div class="op-ejercicio-dato"><span>Puntuación</span><strong>${escapar(e.puntos)}</strong></div>
                <div class="op-ejercicio-dato"><span>Mínimo para pasar</span><strong>${escapar(e.minimo)}</strong></div>
            </div>
        </article>`).join('');

    /* Solo los ejercicios tipo test tienen acierto y fallo; el de
       desarrollo o el de ofimática no, y no se les puede pintar
       una penalización que no existe. */
    const conPenalizacion = c.ejercicios.filter(e => typeof e.acierto === 'number');

    document.getElementById('puntuacionExamen').innerHTML = conPenalizacion.map(e => `
        <div class="op-punto acierto"><strong>+${e.acierto}</strong><span>acierto · ${escapar(e.nombre)}</span></div>
        <div class="op-punto fallo"><strong>−${e.fallo}</strong><span>fallo · ${escapar(e.nombre)}</span></div>`).join('') +
        `<div class="op-punto blanco"><strong>0</strong><span>en blanco · no penaliza</span></div>`;
}

// ------------------------------------------------------------
//  Bloque: cambios del programa oficial (vive en "Mi temario")
// ------------------------------------------------------------
function pintarCambiosTemario() {
    const c = ficha.cuerpo;
    const cambios = c.temasCambiados || [];
    const nuevos = c.temasNuevos || [];

    document.getElementById('cambiosTemario').innerHTML = `
        ${nuevos.length ? `
            <div class="op-aviso-caja destacado">
                <strong>${nuevos.length} tema(s) nuevo(s)</strong> que no estaban en la convocatoria anterior:
                <ul>${nuevos.map(t => `<li><strong>Tema ${t.numero}.</strong> ${escapar(t.titulo)}</li>`).join('')}</ul>
            </div>` : ''}
        ${cambios.length ? `
        <div class="op-tabla-envoltorio">
            <table class="op-tabla">
                <tr><th>Tema</th><th>Antes</th><th>Ahora</th></tr>
                ${cambios.map(t => `
                    <tr>
                        <td><strong>${t.numero}</strong></td>
                        <td>${escapar(t.antes)}</td>
                        <td>${escapar(t.ahora)}</td>
                    </tr>`).join('')}
            </table>
        </div>` : '<p class="op-nota">Sin cambios registrados respecto a la convocatoria anterior.</p>'}`;
}

// ------------------------------------------------------------
//  Avisos del BOE
// ------------------------------------------------------------
async function cargarAvisos() {
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
                datos.preguntas = [];
            }
            return datos;
        }));

        const datosEstado = estado?.exists?.() ? estado.data() : null;
        ultimaRevision = datosEstado?.momento || null;

        pintarAvisos();

    } catch (error) {
        console.error('[oposicion] No se pudieron cargar los avisos:', error);
        const vacio = document.getElementById('vacio');
        vacio.style.display = 'block';
        vacio.querySelector('h3').textContent = 'No se pudieron cargar los avisos';
        vacio.querySelector('p').textContent = error.message;
    } finally {
        cargando.style.display = 'none';
    }
}

function coincideFiltro(aviso) {
    if (filtroActivo === 'todos') return true;
    if (filtroActivo === 'sinleer') return !leidos.has(aviso.id);
    return aviso.tipo === filtroActivo;
}

const ICONOS = { modificacion: '⚖️', convocatoria: '📣', disposicion: '📄', otra: '📌' };

function pintarAvisos() {
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
            </div>`;

        lista.appendChild(tarjeta);
    }

    const marcarTodos = document.getElementById('marcarTodos');
    const sinLeer = avisos.filter(a => !leidos.has(a.id)).length;
    if (marcarTodos) marcarTodos.style.display = sinLeer > 0 ? '' : 'none';
    if (ficha) pintarPortada();
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
    if (marcar) {
        const id = marcar.dataset.id;
        const anterior = new Set(leidos);
        if (leidos.has(id)) leidos.delete(id); else leidos.add(id);
        pintarAvisos();
        await guardarLeidos(anterior);
        return;
    }

    const ir = evento.target.closest('[data-ir]');
    if (ir) {
        evento.preventDefault();
        abrirPanel(ir.dataset.ir);
    }
});

document.getElementById('marcarTodos')?.addEventListener('click', async () => {
    const sinLeer = avisos.filter(a => !leidos.has(a.id));
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
