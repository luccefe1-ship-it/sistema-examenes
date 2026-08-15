/* ==================================================================
   NAVEGACIÓN ENTRE COINCIDENCIAS DE BÚSQUEDA
   ------------------------------------------------------------------
   Antes la búsqueda resaltaba todas las coincidencias y saltaba a la
   primera, y a partir de ahí había que encontrar las demás a base de
   scroll. Esto permite ir saltando de una a otra.

   Está en su propio archivo, separado de documento-subrayable.js,
   porque aquel arrastra Firebase por su cadena de imports y esto es
   lógica pura sobre el DOM que conviene poder probar sin navegador.

   El índice de la coincidencia actual se guarda en el propio
   contenedor (dataset) y no en una variable del módulo: hay tres
   buscadores distintos en la plataforma y cada uno lleva su cuenta.
================================================================== */

export const CLASE_BUSQUEDA = 'busqueda-highlight';
export const CLASE_BUSQUEDA_ACTIVA = 'busqueda-activa';

function marcasDe(contenedor) {
    return contenedor ? Array.from(contenedor.querySelectorAll(`.${CLASE_BUSQUEDA}`)) : [];
}

/**
 * Va a una coincidencia concreta, la resalta y hace scroll hasta ella.
 * El índice da la vuelta por los dos lados.
 * @returns {{actual: number, total: number}} `actual` en base 1; 0 si no hay nada
 */
export function irAResultado(contenedor, indice) {
    const marcas = marcasDe(contenedor);
    if (marcas.length === 0) {
        if (contenedor && contenedor.dataset) delete contenedor.dataset.busquedaActual;
        return { actual: 0, total: 0 };
    }

    const total = marcas.length;
    // El módulo de JS devuelve negativo para negativos, de ahí la doble vuelta
    const pos = ((indice % total) + total) % total;

    marcas.forEach(m => m.classList.remove(CLASE_BUSQUEDA_ACTIVA));
    const activa = marcas[pos];
    activa.classList.add(CLASE_BUSQUEDA_ACTIVA);
    if (typeof activa.scrollIntoView === 'function') {
        activa.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    contenedor.dataset.busquedaActual = String(pos);
    return { actual: pos + 1, total };
}

/** Salta a la siguiente (paso 1) o a la anterior (paso -1). */
export function moverResultado(contenedor, paso) {
    const marcas = marcasDe(contenedor);
    if (marcas.length === 0) return { actual: 0, total: 0 };
    const actual = parseInt(contenedor.dataset.busquedaActual, 10);
    const desde = Number.isFinite(actual) ? actual : -1;
    return irAResultado(contenedor, desde + paso);
}

/** Estado actual sin mover nada ni hacer scroll, para repintar el contador. */
export function estadoBusqueda(contenedor) {
    const total = marcasDe(contenedor).length;
    if (total === 0) return { actual: 0, total: 0 };
    const actual = parseInt(contenedor.dataset.busquedaActual, 10);
    return { actual: (Number.isFinite(actual) ? actual : 0) + 1, total };
}

/** Olvida en qué coincidencia estábamos. */
export function olvidarPosicion(contenedor) {
    if (contenedor && contenedor.dataset) delete contenedor.dataset.busquedaActual;
}
