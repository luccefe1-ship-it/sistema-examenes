/* ==================================================================
   DOCUMENTO SUBRAYABLE
   ------------------------------------------------------------------
   Muestra el tema digital con su formato real (Word maquetado) y
   permite subrayar y buscar encima sin romper el marcado.

   Por qué existe este módulo:
   Antes los subrayados se guardaban volcando el innerHTML entero del
   panel en Firestore, un documento por pregunta. Con texto plano
   colaba; con Word maquetado no, porque el límite por documento es
   1 MiB y un tema puede pasar de 200 KB. Aquí se guardan solo los
   FRAGMENTOS DE TEXTO subrayados y se vuelven a localizar sobre el
   documento al abrirlo.

   La búsqueda tampoco puede hacerse ya con un replace sobre el HTML:
   destrozaría etiquetas y atributos. Se recorre el DOM por nodos de
   texto.
================================================================== */

import { TIPOS_WORD, cargarDocxPreview, descargarOriginal, abrirEnlacesFuera } from './tema-digital.js';

export const CLASE_SUBRAYADO = 'subrayado';
export const CLASE_BUSQUEDA = 'busqueda-highlight';

/* ------------------------------------------------------------------
   Índice de texto del contenedor
   Aplana los nodos de texto para poder buscar por posiciones globales
   sin que importe cómo esté anidado el HTML.
------------------------------------------------------------------ */
function indexar(contenedor) {
    const walker = document.createTreeWalker(contenedor, NodeFilter.SHOW_TEXT, {
        acceptNode(nodo) {
            if (!nodo.nodeValue) return NodeFilter.FILTER_REJECT;
            const padre = nodo.parentElement;
            if (!padre) return NodeFilter.FILTER_REJECT;
            const etiqueta = padre.tagName;
            if (etiqueta === 'SCRIPT' || etiqueta === 'STYLE') return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        }
    });

    const nodos = [];
    let texto = '';
    let nodo;
    while ((nodo = walker.nextNode())) {
        nodos.push({ nodo, inicio: texto.length, largo: nodo.nodeValue.length });
        texto += nodo.nodeValue;
    }

    // Versión normalizada (espacios colapsados) para que el texto guardado
    // siga encontrándose aunque el maquetado reparta los saltos de otra forma
    let normalizado = '';
    const mapa = [];
    let espacioPrevio = false;
    for (let i = 0; i < texto.length; i++) {
        const caracter = texto[i];
        if (/\s/.test(caracter)) {
            if (espacioPrevio) continue;
            normalizado += ' ';
            mapa.push(i);
            espacioPrevio = true;
        } else {
            normalizado += caracter;
            mapa.push(i);
            espacioPrevio = false;
        }
    }

    return { nodos, texto, normalizado: normalizado.toLowerCase(), mapa };
}

function normalizarAguja(texto) {
    return String(texto || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

// Convierte una posición del texto normalizado a posiciones del texto real
function aRangoReal(indice, posNorm, largoNorm) {
    if (largoNorm <= 0) return null;
    const inicio = indice.mapa[posNorm];
    const finIndice = indice.mapa[posNorm + largoNorm - 1];
    if (inicio === undefined || finIndice === undefined) return null;
    return { inicio, fin: finIndice + 1 };
}

/* ------------------------------------------------------------------
   Envolver un tramo [inicio, fin) del texto global.
   Se envuelve nodo a nodo: un subrayado que cruce párrafos o celdas
   no puede meterse en un solo span sin romper la estructura.
   Se recorre en orden inverso para no invalidar las posiciones que
   quedan por procesar.
------------------------------------------------------------------ */
function envolverTramo(indice, inicio, fin, clase, datos) {
    const afectados = indice.nodos.filter(item =>
        item.inicio < fin && (item.inicio + item.largo) > inicio
    );

    const creados = [];
    for (let i = afectados.length - 1; i >= 0; i--) {
        const item = afectados[i];
        const desde = Math.max(0, inicio - item.inicio);
        const hasta = Math.min(item.largo, fin - item.inicio);
        if (hasta <= desde) continue;

        const rango = document.createRange();
        try {
            rango.setStart(item.nodo, desde);
            rango.setEnd(item.nodo, hasta);
            const span = document.createElement('span');
            span.className = clase;
            if (datos) {
                Object.entries(datos).forEach(([clave, valor]) => {
                    span.dataset[clave] = valor;
                });
            }
            rango.surroundContents(span);
            creados.push(span);
        } catch (error) {
            // Un nodo que no admite el envoltorio no debe tumbar el resto
            console.warn('No se pudo subrayar un tramo:', error);
        }
    }
    return creados;
}

// Localiza todas las apariciones de una aguja, en posiciones reales
function buscarTodas(indice, aguja) {
    const agujaNorm = normalizarAguja(aguja);
    if (!agujaNorm) return [];

    const encontrados = [];
    let desde = 0;
    let pos;
    while ((pos = indice.normalizado.indexOf(agujaNorm, desde)) !== -1) {
        const rango = aRangoReal(indice, pos, agujaNorm.length);
        if (rango) encontrados.push(rango);
        desde = pos + agujaNorm.length;
    }
    return encontrados;
}

/* ------------------------------------------------------------------
   Renderizado del documento
------------------------------------------------------------------ */
export async function montarDocumentoSubrayable({ contenedor, documento, fragmentos = [], ajustarAlAncho = false }) {
    if (!contenedor) return { modo: 'ninguno', aplicados: 0, total: 0 };

    contenedor.innerHTML = '<p class="doc-cargando">⏳ Cargando el documento…</p>';

    let modo = 'texto';

    if (documento && TIPOS_WORD.includes(documento.tipo)) {
        try {
            const docxPreview = await cargarDocxPreview();
            const blob = await descargarOriginal(documento);

            contenedor.innerHTML = '';
            const contenedorEstilos = document.createElement('div');
            const contenedorPaginas = document.createElement('div');
            contenedor.append(contenedorEstilos, contenedorPaginas);

            await docxPreview.renderAsync(blob, contenedorPaginas, contenedorEstilos, {
                inWrapper: true,
                breakPages: !ajustarAlAncho,
                // En paneles estrechos dejamos que el contenido fluya al ancho
                // disponible en lugar de imponer el tamaño de página real
                ignoreWidth: ajustarAlAncho,
                ignoreHeight: ajustarAlAncho,
                ignoreFonts: false,
                renderHeaders: !ajustarAlAncho,
                renderFooters: !ajustarAlAncho,
                renderFootnotes: true,
                renderEndnotes: true,
                useBase64URL: true,
                experimental: true
            });

            abrirEnlacesFuera(contenedorPaginas);
            modo = 'word';
        } catch (error) {
            console.warn('No se pudo maquetar el Word, muestro el texto extraído:', error);
            modo = 'texto';
        }
    }

    if (modo === 'texto') {
        contenedor.innerHTML = '';
        const hoja = document.createElement('div');
        hoja.className = 'doc-texto-plano';
        // textContent, no innerHTML: respeta los saltos vía CSS y evita inyección
        hoja.textContent = (documento && documento.textoExtraido) || 'Este documento no tiene texto que mostrar.';
        contenedor.appendChild(hoja);
    }

    const aplicados = aplicarFragmentos(contenedor, fragmentos);
    return { modo, aplicados, total: fragmentos.length };
}

/* ------------------------------------------------------------------
   Subrayados guardados -> DOM
------------------------------------------------------------------ */
export function aplicarFragmentos(contenedor, fragmentos) {
    if (!contenedor || !Array.isArray(fragmentos) || fragmentos.length === 0) return 0;

    const indice = indexar(contenedor);
    const ocupados = [];
    const aColocar = [];

    fragmentos.forEach((fragmento, posicion) => {
        const candidatos = buscarTodas(indice, fragmento);
        // Nos quedamos con la primera aparición que no pise a otro subrayado
        const elegido = candidatos.find(c =>
            !ocupados.some(o => c.inicio < o.fin && c.fin > o.inicio)
        );
        if (elegido) {
            ocupados.push(elegido);
            aColocar.push({ ...elegido, grupo: `g${posicion}` });
        }
    });

    // De atrás hacia delante para no mover las posiciones pendientes
    aColocar.sort((a, b) => b.inicio - a.inicio);
    aColocar.forEach(item => {
        envolverTramo(indice, item.inicio, item.fin, CLASE_SUBRAYADO, { grupo: item.grupo });
    });

    return aColocar.length;
}

/* ------------------------------------------------------------------
   DOM -> subrayados a guardar
   Un subrayado que cruza varios nodos genera varios spans; se
   reagrupan por data-grupo para guardarlo como un único fragmento.
------------------------------------------------------------------ */
export function obtenerFragmentos(contenedor) {
    if (!contenedor) return [];

    const spans = Array.from(contenedor.querySelectorAll(`.${CLASE_SUBRAYADO}`));
    const grupos = new Map();
    let sueltos = 0;

    spans.forEach(span => {
        const clave = span.dataset.grupo || `suelto-${sueltos++}`;
        if (!grupos.has(clave)) grupos.set(clave, []);
        grupos.get(clave).push(span.textContent);
    });

    return Array.from(grupos.values())
        .map(partes => partes.join('').replace(/\s+/g, ' ').trim())
        .filter(texto => texto.length > 0);
}

/* ------------------------------------------------------------------
   Acciones del usuario
------------------------------------------------------------------ */
/* Envuelve lo que abarca un Range recorriendo los nodos del índice.
   Se trabaja con el propio rango y no con posiciones globales a
   propósito: docx-preview inserta etiquetas <style> dentro del panel y
   Range.toString() sí cuenta ese CSS mientras que el índice lo ignora,
   así que las dos numeraciones no coinciden. */
function envolverRango(indice, rango, clase, datos) {
    const creados = [];

    for (let i = indice.nodos.length - 1; i >= 0; i--) {
        const item = indice.nodos[i];

        let intersecta;
        try {
            intersecta = rango.intersectsNode(item.nodo);
        } catch (error) {
            continue;
        }
        if (!intersecta) continue;

        let desde = 0;
        let hasta = item.largo;
        if (rango.startContainer === item.nodo) desde = rango.startOffset;
        if (rango.endContainer === item.nodo) hasta = rango.endOffset;
        if (hasta <= desde) continue;

        try {
            const trozo = document.createRange();
            trozo.setStart(item.nodo, desde);
            trozo.setEnd(item.nodo, hasta);

            const span = document.createElement('span');
            span.className = clase;
            if (datos) {
                Object.entries(datos).forEach(([clave, valor]) => {
                    span.dataset[clave] = valor;
                });
            }
            trozo.surroundContents(span);
            creados.push(span);
        } catch (error) {
            console.warn('No se pudo subrayar un nodo:', error);
        }
    }

    return creados;
}

/* Red de seguridad: se recuerda la última selección válida por si al
   pulsar el botón el navegador ya la ha soltado. */
let ultimaSeleccion = null;
if (typeof document !== 'undefined') {
    document.addEventListener('selectionchange', () => {
        const seleccion = window.getSelection();
        if (!seleccion || seleccion.rangeCount === 0 || seleccion.isCollapsed) return;
        ultimaSeleccion = seleccion.getRangeAt(0).cloneRange();
    });
}

function rangoUtilizable(contenedor) {
    const seleccion = window.getSelection();

    if (seleccion && seleccion.rangeCount > 0 && !seleccion.isCollapsed) {
        const rango = seleccion.getRangeAt(0);
        if (contenedor.contains(rango.commonAncestorContainer)) return rango;
        return { fuera: true };
    }

    // La selección se ha perdido: recuperamos la última buena si sigue viva
    if (ultimaSeleccion
        && ultimaSeleccion.commonAncestorContainer.isConnected
        && contenedor.contains(ultimaSeleccion.commonAncestorContainer)) {
        return ultimaSeleccion;
    }

    return null;
}

export function subrayarSeleccion(contenedor) {
    if (!contenedor) return { ok: false, motivo: 'sin-contenedor' };

    const rango = rangoUtilizable(contenedor);
    if (!rango) return { ok: false, motivo: 'sin-seleccion' };
    if (rango.fuera) return { ok: false, motivo: 'fuera' };

    if (!rango.toString().trim()) return { ok: false, motivo: 'sin-seleccion' };

    // Ojo: no se limpian aquí las marcas de búsqueda. Hacerlo modificaría
    // el DOM y dejaría inservible el rango que acabamos de leer.
    const indice = indexar(contenedor);
    const grupo = `g${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const creados = envolverRango(indice, rango, CLASE_SUBRAYADO, { grupo });

    const seleccion = window.getSelection();
    if (seleccion) seleccion.removeAllRanges();
    ultimaSeleccion = null;

    return { ok: creados.length > 0, motivo: creados.length ? null : 'no-envuelto' };
}

export function quitarSubrayados(contenedor, soloSeleccion = false) {
    if (!contenedor) return 0;

    let spans = Array.from(contenedor.querySelectorAll(`.${CLASE_SUBRAYADO}`));

    if (soloSeleccion) {
        const seleccion = window.getSelection();
        if (seleccion && seleccion.rangeCount > 0 && !seleccion.isCollapsed) {
            const rango = seleccion.getRangeAt(0);
            spans = spans.filter(span => rango.intersectsNode(span));
        }
    }

    spans.forEach(span => {
        const padre = span.parentNode;
        if (!padre) return;
        while (span.firstChild) padre.insertBefore(span.firstChild, span);
        padre.removeChild(span);
        padre.normalize();
    });

    return spans.length;
}

/* ------------------------------------------------------------------
   Búsqueda
------------------------------------------------------------------ */
export function limpiarBusqueda(contenedor) {
    if (!contenedor) return;
    contenedor.querySelectorAll(`.${CLASE_BUSQUEDA}`).forEach(marca => {
        const padre = marca.parentNode;
        if (!padre) return;
        while (marca.firstChild) padre.insertBefore(marca.firstChild, marca);
        padre.removeChild(marca);
        padre.normalize();
    });
}

export function buscarEnDocumento(contenedor, termino) {
    if (!contenedor) return 0;

    limpiarBusqueda(contenedor);
    if (!termino || !termino.trim()) return 0;

    const indice = indexar(contenedor);
    const encontrados = buscarTodas(indice, termino);
    if (encontrados.length === 0) return 0;

    // De atrás hacia delante para no invalidar las posiciones pendientes
    [...encontrados].sort((a, b) => b.inicio - a.inicio).forEach(item => {
        envolverTramo(indice, item.inicio, item.fin, CLASE_BUSQUEDA);
    });

    const primera = contenedor.querySelector(`.${CLASE_BUSQUEDA}`);
    if (primera && typeof primera.scrollIntoView === 'function') {
        primera.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return encontrados.length;
}

export function irAlPrimerSubrayado(contenedor) {
    if (!contenedor) return;
    const primero = contenedor.querySelector(`.${CLASE_SUBRAYADO}`);
    if (primero && typeof primero.scrollIntoView === 'function') {
        primero.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

/* ------------------------------------------------------------------
   Compatibilidad con lo ya guardado
   Los subrayados antiguos son el HTML entero del panel. De ahí se
   sacan los textos de cada .subrayado para reaplicarlos.
------------------------------------------------------------------ */
export function fragmentosDesdeLegado(html) {
    if (!html || typeof html !== 'string') return [];
    try {
        const contenedor = document.createElement('div');
        contenedor.innerHTML = html;
        return Array.from(contenedor.querySelectorAll(`.${CLASE_SUBRAYADO}`))
            .map(span => span.textContent.replace(/\s+/g, ' ').trim())
            .filter(texto => texto.length > 0);
    } catch (error) {
        console.error('No se pudieron leer los subrayados antiguos:', error);
        return [];
    }
}

// Lee un documento de la colección `subrayados` en cualquiera de sus formatos
export function fragmentosDesdeDoc(datos) {
    if (!datos) return [];
    if (Array.isArray(datos.fragmentos)) return datos.fragmentos;
    if (Array.isArray(datos.subrayados)) return datos.subrayados;
    return fragmentosDesdeLegado(datos.htmlCompleto || datos.contenido);
}
