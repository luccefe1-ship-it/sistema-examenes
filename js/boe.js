// ============================================================
//  js/boe.js
//  Panel "Mi Oposición": cuenta atrás, selector de cuerpo y las
//  tres pestañas (temario, convocatoria, examen).
//
//  LA PESTAÑA "MI TEMARIO" ES UNA LISTA DE TUS TEMAS, no un tablón
//  de noticias. Cada tema lleva su aviso o dice que no tiene, y al
//  abrirlo se ve el párrafo concreto que hay que corregir. Antes
//  esto era un muro de avisos sueltos con filtros: se veía todo lo
//  publicado y no se sabía a qué tema iba cada cosa.
//
//  DE DÓNDE SALE CADA COSA:
//    - Tus temas y su revisión -> /api/mi-oposicion, con tu token.
//    - Modificaciones del BOE  -> colección boeAvisos, que escribe
//      el cron. Aquí solo se leen: si el navegador pudiera
//      escribirlas, cualquiera podría inventarse una reforma legal
//      en su propia plataforma.
//
//  Lo único que escribe esta pantalla es el cuerpo elegido, en el
//  documento del propio usuario.
// ============================================================

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    collection, query, orderBy, limit, getDocs, getDoc, doc, setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Cuántos avisos se traen. Con uno o dos al día, 200 son varios meses.
const MAX_AVISOS = 200;

const CUERPOS = {
    gestion:     'Gestión Procesal y Administrativa',
    tramitacion: 'Tramitación Procesal y Administrativa',
    auxilio:     'Auxilio Judicial'
};

const URL_BOE = 'https://www.boe.es/buscar/act.php?id=';

let usuario = null;
let ficha = null;
let cuerpoElegido = 'gestion';
let avisos = [];
let avisosCargados = false;

// ------------------------------------------------------------
//  Arranque
// ------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'index.html'; return; }
    usuario = user;
    document.getElementById('userName').textContent = user.displayName || user.email;

    cuerpoElegido = await leerCuerpo() || 'gestion';
    document.getElementById('selectorCuerpo').value = cuerpoElegido;

    // Los avisos vienen de Firestore y los temas de la API: en paralelo
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

/* Sin acentos y en minúsculas. Los temarios vienen de Word y de PDF
   convertidos, y ahí las tildes aparecen y desaparecen. Solo quita
   marcas de acento y baja a minúsculas: NO cambia la longitud de la
   cadena, y de eso depende poder recortar sobre el texto original. */
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

/* Pinta en amarillo el término caducado dentro del párrafo.

   Se busca sobre el texto normalizado y se recorta del ORIGINAL, para
   enseñar el párrafo tal y como está escrito en el tema, con sus
   tildes y mayúsculas. Se escapa trozo a trozo, no al final: si se
   escapara antes de cortar, las entidades HTML moverían los índices. */
function resaltar(fragmento, termino) {
    const original = String(fragmento || '');
    const plano = normalizar(original);
    const aguja = normalizar(termino);
    if (!aguja) return escapar(original);

    let salida = '';
    let desde = 0;
    let i = plano.indexOf(aguja);

    while (i !== -1) {
        salida += escapar(original.slice(desde, i));
        salida += `<mark>${escapar(original.slice(i, i + aguja.length))}</mark>`;
        desde = i + aguja.length;
        i = plano.indexOf(aguja, desde);
    }

    return salida + escapar(original.slice(desde));
}

// ------------------------------------------------------------
//  Ficha del cuerpo y temas
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
        pintarTemas();

    } catch (error) {
        console.error('[oposicion] No se pudo cargar la ficha:', error);
        document.getElementById('cargandoTemas').innerHTML =
            `<p>No se pudieron revisar tus temas: ${escapar(error.message)}</p>`;
    }
}

function pintarPortada() {
    document.getElementById('opCuerpo').textContent = ficha.cuerpo.nombre;
    document.getElementById('opDias').textContent = ficha.examenPasado ? '—' : ficha.diasParaExamen;
    document.getElementById('opFecha').textContent = fechaLarga(ficha.fechaExamen);
}

// ------------------------------------------------------------
//  Modificaciones publicadas en el BOE
// ------------------------------------------------------------
async function cargarAvisos() {
    try {
        const instantanea = await getDocs(
            query(collection(db, 'boeAvisos'), orderBy('fecha', 'desc'), limit(MAX_AVISOS)));

        avisos = instantanea.docs.map(d => ({ id: d.id, ...d.data() }));

    } catch (error) {
        console.error('[oposicion] No se pudieron cargar los avisos del BOE:', error);
        avisos = [];
    } finally {
        avisosCargados = true;
        if (ficha) pintarTemas();
    }
}

/* Las modificaciones del BOE que le tocan a un tema: las que citan
   alguna de las leyes que ese tema estudia. Un tema que no cita la
   LEC no tiene por qué enterarse de que han tocado la LEC. */
function avisosDelTema(tema) {
    const suyas = new Set((tema.normas || []).map(n => n.id));
    if (!suyas.size) return [];

    return avisos.filter(aviso =>
        (aviso.normas || []).some(n => suyas.has(n.id)));
}

// ------------------------------------------------------------
//  La lista de temas
// ------------------------------------------------------------
function pintarTemas() {
    const temas = ficha?.revision?.temas || [];
    const lista = document.getElementById('listaTemas');

    document.getElementById('cargandoTemas').style.display = 'none';
    document.getElementById('sinTemas').style.display = temas.length ? 'none' : 'block';

    let conAviso = 0;
    lista.innerHTML = '';

    for (const tema of temas) {
        const cambios = tema.digital?.hallazgos || [];
        const delBoe = avisosDelTema(tema);
        const total = cambios.length + delBoe.length;
        if (total) conAviso++;

        const articulo = document.createElement('article');
        articulo.className = `op-tema ${total ? 'con-aviso' : ''}`;

        const etiqueta = tema.numero !== null && tema.numero !== undefined
            ? `Tema ${tema.numero}`
            : 'Tema';

        /* <details> nativo: el desplegable lo lleva el navegador, no
           hay que sincronizar ningún estado abierto/cerrado a mano y
           funciona igual con teclado. */
        articulo.innerHTML = `
            <details class="op-tema-caja">
                <summary class="op-tema-cabecera">
                    <span class="op-tema-numero">${escapar(etiqueta)}</span>
                    <span class="op-tema-nombre">${escapar(tema.nombre)}</span>
                    ${total
                        ? `<span class="op-tema-estado alerta">${total} aviso${total === 1 ? '' : 's'} de actualización</span>`
                        : '<span class="op-tema-estado limpio">Sin avisos</span>'}
                </summary>
                <div class="op-tema-cuerpo">${cuerpoDelTema(tema, cambios, delBoe)}</div>
            </details>`;

        lista.appendChild(articulo);
    }

    const resumen = document.getElementById('resumenTemas');
    if (!temas.length) {
        resumen.textContent = '';
    } else if (!avisosCargados) {
        resumen.textContent = `${temas.length} temas`;
    } else {
        resumen.textContent = conAviso
            ? `${conAviso} de ${temas.length} temas con avisos`
            : `${temas.length} temas al día`;
    }
}

/* Lo que se ve al desplegar un tema. Tres cosas, por este orden:
   lo que hay escrito mal en el documento, lo que se ha publicado en
   el BOE sobre sus leyes, y el aviso de que el documento no se pudo
   leer, que si no pasa desapercibido. */
function cuerpoDelTema(tema, cambios, delBoe) {
    const partes = [];

    if (tema.digital?.tieneDocumento && !tema.digital?.revisable) {
        partes.push(`
            <p class="op-tema-nota">
                El documento «${escapar(tema.digital.nombre || '')}» se subió sin texto extraíble,
                así que no se ha podido revisar. Vuelve a subirlo desde Mis Temas.
            </p>`);
    }

    if (!tema.digital?.tieneDocumento) {
        partes.push(`
            <p class="op-tema-nota">
                Este tema no tiene documento digital subido. Solo se han revisado sus preguntas.
            </p>`);
    }

    for (const hallazgo of cambios) partes.push(bloqueTextoCaducado(tema, hallazgo));
    for (const aviso of delBoe) partes.push(bloqueModificacionBoe(aviso));

    if (!partes.length) {
        partes.push(`
            <p class="op-tema-nota limpio">
                Nada que corregir. Ni vocabulario derogado en el documento ni reformas publicadas
                de las leyes que estudia este tema.
            </p>`);
    }

    return partes.join('');
}

/* Texto del tema escrito con una denominación que la ley ya cambió.
   Se enseña el párrafo con la expresión en amarillo y, al lado, cómo
   se dice ahora. Es lo que de verdad hay que corregir a mano. */
function bloqueTextoCaducado(tema, hallazgo) {
    const ley = hallazgo.ley;

    return `
        <div class="op-cambio">
            <div class="op-cambio-cabecera">
                <span class="op-cambio-tipo caducado">Tu texto está desactualizado</span>
                <span class="op-cambio-veces">${hallazgo.veces} ${hallazgo.veces === 1 ? 'vez' : 'veces'} en el tema</span>
            </div>

            <p class="op-cambio-regla">
                Donde pones <strong class="op-antes">${escapar(hallazgo.termino)}</strong>,
                ahora se dice <strong class="op-ahora">${escapar(hallazgo.ahora)}</strong>.
            </p>

            <div class="op-fragmentos">
                ${hallazgo.fragmentos.map(f => `<p>${resaltar(f, hallazgo.termino)}</p>`).join('')}
            </div>

            ${ley ? `
                <div class="op-cambio-enlaces">
                    <a href="${URL_BOE}${escapar(ley.id)}" target="_blank" rel="noopener noreferrer">
                        Ver ${escapar(ley.nombre)} entera en el BOE
                    </a>
                </div>` : ''}
        </div>`;
}

/* Una reforma publicada de alguna de las leyes que estudia el tema.
   Aquí no se puede señalar un párrafo del documento porque el cambio
   está en la ley, no en lo que tú escribiste: se dan los artículos
   tocados y el enlace, que es lo que hay. */
function bloqueModificacionBoe(aviso) {
    const normas = (aviso.normas || []).map(n => `
        <a href="${URL_BOE}${escapar(n.id)}" target="_blank" rel="noopener noreferrer"
           class="boe-etiqueta">${escapar(n.nombre)}</a>`).join('');

    const articulos = (aviso.articulos || []).length
        ? `<p class="op-cambio-regla">
               Artículos tocados:
               <strong class="op-ahora">${escapar(aviso.articulos.join(', '))}</strong>
           </p>`
        : '';

    return `
        <div class="op-cambio boe">
            <div class="op-cambio-cabecera">
                <span class="op-cambio-tipo reforma">Ley modificada</span>
                <span class="op-cambio-veces">${escapar(aviso.fechaLegible || aviso.fecha || '')}</span>
            </div>

            <p class="op-cambio-titulo">${escapar(aviso.titulo || '')}</p>
            ${aviso.resumen ? `<p class="op-cambio-resumen">${escapar(aviso.resumen)}</p>` : ''}
            ${articulos}

            <div class="boe-etiquetas">${normas}</div>

            <div class="op-cambio-enlaces">
                ${aviso.urlHtml ? `<a href="${escapar(aviso.urlHtml)}" target="_blank" rel="noopener noreferrer">Ver la publicación en el BOE</a>` : ''}
                ${aviso.urlPdf ? `<a href="${escapar(aviso.urlPdf)}" target="_blank" rel="noopener noreferrer">PDF</a>` : ''}
            </div>
        </div>`;
}

// ------------------------------------------------------------
//  Selector de cuerpo
// ------------------------------------------------------------
document.getElementById('selectorCuerpo')?.addEventListener('change', async (evento) => {
    cuerpoElegido = evento.target.value;
    await guardarCuerpo(cuerpoElegido);
    await cargarFicha();
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
