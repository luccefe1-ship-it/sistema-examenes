// ============================================================
//  js/boe.js
//  Panel "Mi Oposición": cuenta atrás, selector de cuerpo y las
//  tres pestañas (temario, convocatoria, examen).
//
//  >>> "MI TEMARIO" TRABAJA SOBRE EL TEMARIO OFICIAL. <<<
//  Los temas que salen en el desplegable son los del anexo VI de la
//  convocatoria, no los que el usuario haya subido a la plataforma.
//  Aquello es material de estudio propio para hacer tests; lo que
//  entra en el examen es el programa del BOE, y es contra eso contra
//  lo que hay que avisar.
//
//  DE DÓNDE SALE CADA COSA:
//    - Temario oficial y leyes por tema -> /api/mi-oposicion.
//    - Artículos reformados de un tema  -> /api/reformas-tema, que
//      pregunta al BOE EN EL MOMENTO por las leyes de ese tema y
//      cruza los artículos con el listado del temario. No depende de
//      que se haya ejecutado ningún proceso: si el BOE lo dice hoy,
//      aquí sale hoy.
//    - Texto literal de los artículos   -> /api/articulo, que lo pide
//      al BOE en el momento. No se guarda ni se reescribe: o es el
//      texto oficial o no se enseña nada.
//
//  Lo único que escribe esta pantalla es el cuerpo elegido, en el
//  documento del propio usuario.
// ============================================================

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDoc, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const CUERPOS = {
    gestion:     'Gestión Procesal y Administrativa',
    tramitacion: 'Tramitación Procesal y Administrativa',
    auxilio:     'Auxilio Judicial'
};

const URL_BOE = 'https://www.boe.es/buscar/act.php?id=';

let usuario = null;
let ficha = null;
let cuerpoElegido = 'gestion';

/* El texto de los artículos ya pedidos, para no repetir la llamada al
   BOE cada vez que se vuelve a un tema. */
const cacheArticulos = new Map();

// ------------------------------------------------------------
//  Arranque
// ------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'index.html'; return; }
    usuario = user;
    document.getElementById('userName').textContent = user.displayName || user.email;

    cuerpoElegido = await leerCuerpo() || 'gestion';
    document.getElementById('selectorCuerpo').value = cuerpoElegido;

    await cargarFicha();
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

function fechaLarga(iso) {
    if (!iso) return '';
    const [a, m, d] = iso.split('-').map(Number);
    return new Date(a, m - 1, d).toLocaleDateString('es-ES',
        { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// ------------------------------------------------------------
//  Datos
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
        montarDesplegableDeTemas();

    } catch (error) {
        console.error('[oposicion] No se pudo cargar la ficha:', error);
        document.getElementById('detalleTema').innerHTML =
            `<p class="op-tema-nota">No se pudo cargar el temario: ${escapar(error.message)}</p>`;
    }
}

function pintarPortada() {
    document.getElementById('opCuerpo').textContent = ficha.cuerpo.nombre;
    document.getElementById('opDias').textContent = ficha.examenPasado ? '—' : ficha.diasParaExamen;
    document.getElementById('opFecha').textContent = fechaLarga(ficha.fechaExamen);
    document.getElementById('refTemario').textContent =
        `Anexo VI de la ${ficha.ordenConvocatoria}. ${ficha.cuerpo.temas} temas.`;
}

// ------------------------------------------------------------
//  El desplegable de temas
// ------------------------------------------------------------
function montarDesplegableDeTemas() {
    const temario = ficha?.temario || [];
    const selector = document.getElementById('selectorTema');
    const elegido = selector.value;

    let conReforma = 0;
    selector.innerHTML = '<option value="">Elige tema para revisar</option>';

    for (const tema of temario) {
        const reformas = (tema.reformas || []).length;
        if (reformas) conReforma++;

        const opcion = document.createElement('option');
        opcion.value = String(tema.numero);

        /* El recuento sale de las reformas ya guardadas por el repaso
           semanal. Si todavía no se ha ejecutado ninguna vez no hay
           recuento, y entonces el desplegable NO dice "sin
           modificaciones": dice el número del tema y ya está. Poner
           "sin modificaciones" sin haber mirado sería mentir. */
        opcion.textContent = reformas
            ? `Tema ${tema.numero} — ${reformas} artículo(s) reformados`
            : ficha?.repasoHecho
                ? `Tema ${tema.numero} — sin reformas`
                : `Tema ${tema.numero}`;

        selector.appendChild(opcion);
    }

    // Si ya había un tema abierto, se respeta al repintar
    if (elegido) {
        selector.value = elegido;
        mostrarTema(elegido);
    }

    document.getElementById('resumenTemas').textContent = conReforma
        ? `${conReforma} con reformas`
        : `${temario.length} temas`;
}

// ------------------------------------------------------------
//  El detalle, debajo del desplegable
// ------------------------------------------------------------
function mostrarTema(numero) {
    const caja = document.getElementById('detalleTema');
    const tema = (ficha?.temario || []).find(t => String(t.numero) === String(numero));

    if (!tema) { caja.innerHTML = ''; return; }

    /* Lo primero son los artículos reformados, que es a lo que se
       entra. El cambio de enunciado respecto a la convocatoria
       anterior va al final: se mira una vez y no se vuelve. */
    caja.innerHTML = `
        <div class="op-detalle-cabecera">
            <span class="op-tema-numero">Tema ${tema.numero}</span>
            <p class="op-detalle-titulo">${escapar(tema.titulo)}</p>
        </div>

        <div id="reformasDelTema">
            <p class="op-tema-nota">Preguntando al BOE por las leyes de este tema…</p>
        </div>

        ${tema.cambio ? bloqueCambioDeTemario(tema.cambio) : ''}`;

    cargarReformasDelTema(tema.numero);
}

/* Pregunta al BOE, en el momento, qué le ha pasado a las leyes de
   este tema en los dos últimos años. No se lee de ninguna base de
   datos: así no depende de que se haya ejecutado ningún proceso, y
   lo que se ve es lo que dice el BOE hoy. */
async function cargarReformasDelTema(numero) {
    const caja = document.getElementById('reformasDelTema');
    if (!caja) return;

    try {
        const token = await usuario.getIdToken();
        const respuesta = await fetch('/api/reformas-tema', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
            body: JSON.stringify({ cuerpo: cuerpoElegido, tema: numero })
        });

        if (!respuesta.ok) {
            const detalle = await respuesta.json().catch(() => ({}));
            throw new Error(detalle.error || `Error ${respuesta.status}`);
        }

        const datos = await respuesta.json();

        // Si se ha cambiado de tema mientras llegaba, no se pisa nada
        if (String(document.getElementById('selectorTema').value) !== String(numero)) return;

        if (!datos.reformas.length) {
            caja.innerHTML = `
                <p class="op-tema-nota limpio">
                    Ninguna de las leyes de este tema se ha reformado desde ${datos.desdeAnio}.
                    ${datos.leyesConsultadas.length
                        ? `Consultadas: ${escapar(datos.leyesConsultadas.join(', '))}.`
                        : 'Este tema no tiene ninguna ley asociada todavía.'}
                </p>`;
            return;
        }

        caja.innerHTML = `
            <p class="op-subtitulo">
                ${datos.reformas.length} reforma(s) desde ${datos.desdeAnio} en las leyes de este tema.
                ${datos.porArticulo
                    ? 'Solo se muestran los artículos que entran en el tema.'
                    : 'Este cuerpo todavía no tiene el listado de artículos, así que se avisa de toda la ley.'}
            </p>
            ${datos.reformas.map((r, i) => bloqueReforma(r, i)).join('')}`;

        // El texto literal se pide después de pintar, para que la
        // ficha aparezca ya y los artículos se vayan rellenando.
        datos.reformas.forEach((reforma, i) => cargarTextoArticulos(reforma, i));

    } catch (error) {
        console.error('[oposicion] No se pudieron traer las reformas:', error);
        caja.innerHTML = `<p class="op-tema-nota">
            No se pudo consultar el BOE (${escapar(error.message)}). Vuelve a elegir el tema para reintentar.
        </p>`;
    }
}

/* El enunciado del tema ha cambiado respecto a la convocatoria
   anterior. Se enseñan los dos textos con la parte distinta en
   amarillo, que es lo único que hay que releer. */
function bloqueCambioDeTemario(cambio) {
    if (cambio.alcance === 'nuevo') {
        return `
            <div class="op-reforma cambio-temario">
                <div class="op-cambio-cabecera">
                    <span class="op-cambio-tipo temario">Tema nuevo</span>
                </div>
                <p class="op-cambio-resumen">Este tema no existía en la convocatoria anterior.</p>
            </div>`;
    }

    return `
        <div class="op-reforma cambio-temario">
            <div class="op-cambio-cabecera">
                <span class="op-cambio-tipo temario">
                    ${cambio.alcance === 'fondo' ? 'Cambia el temario' : 'Retoque de redacción'}
                </span>
                <span class="op-cambio-veces">respecto a la convocatoria anterior</span>
            </div>

            <div class="op-versiones">
                <div class="op-version antes">
                    <h4>Antes</h4>
                    <p>${marcarDiferencia(cambio.antes, cambio.desde, cambio.hasta)}</p>
                </div>
                <div class="op-version ahora">
                    <h4>Ahora</h4>
                    <p>${marcarDiferencia(cambio.ahora, cambio.desde, cambio.hasta)}</p>
                </div>
            </div>
        </div>`;
}

/* Pinta en amarillo las palabras que van entre el trozo común del
   principio y el trozo común del final. Se corta por palabras, no
   por caracteres, porque los índices vienen contados en palabras. */
function marcarDiferencia(texto, desde, hasta) {
    const trozos = String(texto || '').split(/\s+/);
    if (!trozos.length) return '';

    const fin = trozos.length - (hasta || 0);
    const inicio = Math.min(desde || 0, fin);

    const antes = trozos.slice(0, inicio).join(' ');
    const medio = trozos.slice(inicio, fin).join(' ');
    const despues = trozos.slice(fin).join(' ');

    return [
        antes ? escapar(antes) : '',
        medio ? `<mark>${escapar(medio)}</mark>` : '',
        despues ? escapar(despues) : ''
    ].filter(Boolean).join(' ');
}

/* Cuándo cae la reforma respecto a tu examen. No se decide por el
   opositor si "entra" o no —eso lo fija cada tribunal—: se dice la
   fecha y de qué lado del corte cae. */
const CUANDO = {
    previa:      { etiqueta: 'Ya entraba',                  clase: 'previa' },
    posterior:   { etiqueta: 'Posterior a tu convocatoria', clase: 'posterior' },
    futura:      { etiqueta: 'Posterior a tu examen',       clase: 'futura' },
    desconocida: { etiqueta: 'Sin fecha',                   clase: 'futura' }
};

function bloqueReforma(reforma, indice) {
    const norma = reforma.norma || {};
    const articulos = reforma.articulos || [];
    const cuando = CUANDO[reforma.cuando] || CUANDO.desconocida;

    /* Si la reforma tocó más artículos de los que estudia este tema,
       se dice: así se entiende por qué salen tres y no doce. */
    const otros = reforma.fueraDelTema || 0;

    return `
        <div class="op-reforma">
            <div class="op-cambio-cabecera">
                <span class="op-cambio-tipo reforma">Ley modificada</span>
                <span class="op-marca-tiempo ${cuando.clase}">${cuando.etiqueta}</span>
                <span class="op-cambio-veces">${escapar(reforma.fecha || reforma.anio || '')}</span>
            </div>

            <p class="op-cambio-titulo">${escapar(norma.nombre || '')}</p>
            ${reforma.titulo ? `<p class="op-cambio-resumen">${escapar(reforma.relacion || 'Modificada')} por ${escapar(reforma.titulo)}</p>` : ''}

            <p class="op-cambio-regla">
                Artículos de este tema que se han modificado:
                <strong class="op-ahora">${escapar(articulos.join(', ')) || '—'}</strong>
                ${otros > 0 ? `<span class="op-cambio-veces"> · la reforma tocó ${otros} artículo(s) más que no entran en este tema</span>` : ''}
            </p>

            <div class="op-articulos" id="articulos-${indice}">
                <p class="op-tema-nota">Pidiendo el texto al BOE…</p>
            </div>

            <div class="op-cambio-enlaces">
                ${norma.id ? `<a href="${URL_BOE}${escapar(norma.id)}" target="_blank" rel="noopener noreferrer">Ver la ley completa</a>` : ''}
                ${reforma.url ? `<a href="${escapar(reforma.url)}" target="_blank" rel="noopener noreferrer">Ver la reforma en el BOE</a>` : ''}
            </div>
        </div>`;
}

/* Trae el texto literal de los artículos tocados. Si el BOE no lo
   da, se dice y se deja el enlace: NUNCA se escribe un artículo de
   memoria, porque se estudiaría y se daría por bueno. */
async function cargarTextoArticulos(reforma, indice) {
    const caja = document.getElementById(`articulos-${indice}`);
    if (!caja) return;

    const norma = reforma.norma;
    const articulos = reforma.articulos || [];

    if (!norma?.id || !articulos.length) {
        caja.innerHTML = '';
        return;
    }

    const clave = `${norma.id}|${articulos.join(',')}`;

    try {
        let datos = cacheArticulos.get(clave);

        if (!datos) {
            const token = await usuario.getIdToken();
            const respuesta = await fetch('/api/articulo', {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
                body: JSON.stringify({ norma: norma.id, articulos })
            });

            if (!respuesta.ok) throw new Error(`Error ${respuesta.status}`);
            datos = await respuesta.json();
            cacheArticulos.set(clave, datos);
        }

        caja.innerHTML = datos.articulos.map(a => a.encontrado
            ? `<article class="op-articulo">
                   <h4>${escapar(a.titulo)}</h4>
                   <div class="op-articulo-texto">${a.texto.split('\n\n').map(p => `<p>${escapar(p)}</p>`).join('')}</div>
               </article>`
            : `<article class="op-articulo no-encontrado">
                   <h4>${escapar(a.titulo)}</h4>
                   <p>No se ha podido localizar este artículo en el texto consolidado. Ábrelo en el BOE para leerlo.</p>
               </article>`).join('');

    } catch (error) {
        console.error('[oposicion] No se pudo traer el artículo:', error);
        caja.innerHTML = `<p class="op-tema-nota">
            No se pudo traer el texto del BOE (${escapar(error.message)}). El enlace de abajo lleva a la ley completa.
        </p>`;
    }
}

document.getElementById('selectorTema')?.addEventListener('change', (evento) => {
    mostrarTema(evento.target.value);
});

// ------------------------------------------------------------
//  Selector de cuerpo
// ------------------------------------------------------------
document.getElementById('selectorCuerpo')?.addEventListener('change', async (evento) => {
    cuerpoElegido = evento.target.value;
    document.getElementById('selectorTema').value = '';
    document.getElementById('detalleTema').innerHTML = '';
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
