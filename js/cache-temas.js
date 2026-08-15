// ============================================================
// Caché persistente del banco de temas sobre IndexedDB
// ============================================================
//
// Por qué IndexedDB y no sessionStorage: el banco ronda las 10.000 preguntas
// repartidas dentro del array `preguntas` de cada documento de `temas`. Serializado
// eso pasa de largo el límite de ~5 MB de sessionStorage, así que el setItem
// lanzaba QuotaExceededError y la caché quedaba desactivada de hecho.
//
// Reglas que cumple este módulo, y que conviene no romper:
//
//   1. NINGUNA función lanza. Si IndexedDB no está disponible (modo incógnito,
//      permisos, cuota llena), se devuelve null/false y quien llama sigue
//      tirando de Firebase. La caché es un acelerador, nunca un requisito.
//   2. Toda operación pasa por una cola en serie. Invalidar dispara un borrado
//      asíncrono; sin la cola, un guardado lanzado justo después podría
//      completarse ANTES que el borrado y dejar datos obsoletos persistidos.
//   3. Al leer se valida usuarioId, versión de esquema y antigüedad. IndexedDB
//      es de origen, no de pestaña: sin la comprobación de usuarioId, dos
//      cuentas en el mismo navegador se verían el banco la una a la otra.
//   4. Las fechas se normalizan al guardar y se restauran al leer. Los Timestamp
//      de Firestore pierden su prototipo al pasar por el clonado estructurado y
//      se quedarían sin .toDate(), que es lo que usa la tarjeta del tema.

const DB_NOMBRE = 'sistemaExamenes';
const DB_VERSION = 1;
const ALMACEN = 'bancoTemas';
const CLAVE = 'actual';

// Subir este número invalida de golpe todas las cachés ya guardadas en los
// navegadores. Hay que subirlo si cambia la forma de lo que se guarda.
const ESQUEMA_CACHE = 1;

// ------------------------------------------------------------
// Apertura de la base (perezosa y cacheada)
// ------------------------------------------------------------

let promesaDB = null;

function abrirDB() {
    if (promesaDB) return promesaDB;

    promesaDB = new Promise((resolver) => {
        let solicitud;
        try {
            if (typeof indexedDB === 'undefined' || !indexedDB) {
                resolver(null);
                return;
            }
            solicitud = indexedDB.open(DB_NOMBRE, DB_VERSION);
        } catch (e) {
            // Safari en modo privado lanza aquí directamente
            console.warn('[caché] IndexedDB no disponible:', e && e.name);
            resolver(null);
            return;
        }

        solicitud.onupgradeneeded = () => {
            const db = solicitud.result;
            if (!db.objectStoreNames.contains(ALMACEN)) {
                db.createObjectStore(ALMACEN);
            }
        };
        solicitud.onsuccess = () => resolver(solicitud.result);
        solicitud.onerror = () => {
            console.warn('[caché] No se pudo abrir IndexedDB:', solicitud.error && solicitud.error.name);
            resolver(null);
        };
        solicitud.onblocked = () => resolver(null);
    });

    return promesaDB;
}

// ------------------------------------------------------------
// Cola en serie: garantiza el orden entre borrados y guardados
// ------------------------------------------------------------

let cola = Promise.resolve();

function enCola(tarea) {
    const resultado = cola
        .then(tarea)
        .catch((e) => {
            console.warn('[caché] Operación descartada:', e && (e.name || e.message));
            return null;
        });
    // `cola` nunca queda rechazada, así que la cadena no se rompe nunca
    cola = resultado;
    return resultado;
}

// ------------------------------------------------------------
// Fechas: Timestamp de Firestore <-> objeto plano
// ------------------------------------------------------------

const MARCA_FECHA = '__ts';

function esTimestamp(valor) {
    return (
        valor &&
        typeof valor === 'object' &&
        typeof valor.seconds === 'number' &&
        typeof valor.nanoseconds === 'number'
    );
}

// Convierte Timestamps y Date a una forma que el clonado estructurado
// no pueda estropear. Devuelve una copia; no toca el original.
function normalizarFechas(valor, profundidad) {
    const nivel = profundidad || 0;
    if (nivel > 12 || valor === null || typeof valor !== 'object') return valor;

    if (valor instanceof Date) {
        return { [MARCA_FECHA]: valor.getTime() };
    }
    if (esTimestamp(valor)) {
        return { [MARCA_FECHA]: valor.seconds * 1000 + Math.floor(valor.nanoseconds / 1e6) };
    }
    if (Array.isArray(valor)) {
        return valor.map((item) => normalizarFechas(item, nivel + 1));
    }

    const salida = {};
    for (const clave in valor) {
        if (Object.prototype.hasOwnProperty.call(valor, clave)) {
            salida[clave] = normalizarFechas(valor[clave], nivel + 1);
        }
    }
    return salida;
}

// Deshace lo anterior, devolviendo objetos con .toDate() y .seconds para que
// el código de pintado funcione igual venga de Firebase o de la caché.
function restaurarFechas(valor, profundidad) {
    const nivel = profundidad || 0;
    if (nivel > 12 || valor === null || typeof valor !== 'object') return valor;

    if (typeof valor[MARCA_FECHA] === 'number') {
        const ms = valor[MARCA_FECHA];
        return {
            seconds: Math.floor(ms / 1000),
            nanoseconds: (ms % 1000) * 1e6,
            toDate: () => new Date(ms)
        };
    }
    if (Array.isArray(valor)) {
        return valor.map((item) => restaurarFechas(item, nivel + 1));
    }

    const salida = {};
    for (const clave in valor) {
        if (Object.prototype.hasOwnProperty.call(valor, clave)) {
            salida[clave] = restaurarFechas(valor[clave], nivel + 1);
        }
    }
    return salida;
}

// ------------------------------------------------------------
// API pública
// ------------------------------------------------------------

/**
 * Lee la caché. Devuelve null si no sirve por cualquier motivo:
 * no existe, otro usuario, esquema viejo, caducada, vacía o corrupta.
 * @returns {Promise<{temas: Array<{id: string, data: object}>, timestamp: number}|null>}
 */
export function leerCacheTemas(usuarioId, maxEdadMs) {
    return enCola(async () => {
        if (!usuarioId) return null;

        const db = await abrirDB();
        if (!db) return null;

        const registro = await new Promise((resolver, rechazar) => {
            const tx = db.transaction(ALMACEN, 'readonly');
            const solicitud = tx.objectStore(ALMACEN).get(CLAVE);
            solicitud.onsuccess = () => resolver(solicitud.result || null);
            solicitud.onerror = () => rechazar(solicitud.error);
            tx.onabort = () => rechazar(tx.error);
        });

        if (!registro) return null;

        if (registro.esquema !== ESQUEMA_CACHE) {
            console.log('[caché] Esquema antiguo, se descarta');
            return null;
        }
        if (registro.usuarioId !== usuarioId) {
            console.log('[caché] Es de otro usuario, se descarta');
            return null;
        }
        if (!Array.isArray(registro.temas) || registro.temas.length === 0) {
            console.warn('[caché] Contenido vacío o corrupto, se descarta');
            return null;
        }
        if (typeof registro.timestamp !== 'number' || Date.now() - registro.timestamp >= maxEdadMs) {
            console.log('[caché] Caducada');
            return null;
        }

        return {
            temas: registro.temas.map((t) => ({ id: t.id, data: restaurarFechas(t.data) })),
            timestamp: registro.timestamp
        };
    });
}

/**
 * Guarda el banco completo. Se niega a guardar una lista vacía: un array vacío
 * casi siempre significa que Firebase falló, y persistirlo dejaría al usuario
 * mirando un banco vacío hasta que caducase.
 * @returns {Promise<boolean>} true solo si quedó guardado de verdad
 */
export function guardarCacheTemas(usuarioId, temas) {
    return enCola(async () => {
        if (!usuarioId || !Array.isArray(temas) || temas.length === 0) return false;

        const db = await abrirDB();
        if (!db) return false;

        const registro = {
            esquema: ESQUEMA_CACHE,
            usuarioId,
            timestamp: Date.now(),
            temas: temas.map((t) => ({ id: t.id, data: normalizarFechas(t.data) }))
        };

        await new Promise((resolver, rechazar) => {
            const tx = db.transaction(ALMACEN, 'readwrite');
            tx.objectStore(ALMACEN).put(registro, CLAVE);
            tx.oncomplete = () => resolver();
            // Aquí es donde aparece QuotaExceededError si no cabe
            tx.onerror = () => rechazar(tx.error);
            tx.onabort = () => rechazar(tx.error);
        });

        return true;
    }).then((r) => r === true);
}

/**
 * Borra la caché persistida. Quien llama NO debe esperar a que termine para
 * dar por invalidada la caché: la protección inmediata es la marca en memoria
 * de tests.js. Esto solo limpia el disco.
 */
export function borrarCacheTemas() {
    return enCola(async () => {
        const db = await abrirDB();
        if (!db) return null;

        await new Promise((resolver, rechazar) => {
            const tx = db.transaction(ALMACEN, 'readwrite');
            tx.objectStore(ALMACEN).delete(CLAVE);
            tx.oncomplete = () => resolver();
            tx.onerror = () => rechazar(tx.error);
            tx.onabort = () => rechazar(tx.error);
        });

        return null;
    });
}

// ------------------------------------------------------------
// Gestor del banco: memoria + disco + origen
// ------------------------------------------------------------
//
// Vive aquí y no en tests.js para que se pueda probar sin navegador ni
// Firebase. tests.js solo le inyecta de dónde sacar el uid y cómo leer.

/** Construye el QuerySnapshot simulado que espera el código de pintado. */
export function snapshotDesdeArray(temas) {
    return {
        empty: temas.length === 0,
        size: temas.length,
        docs: temas.map((t) => ({ id: t.id, data: () => t.data })),
        forEach: function (callback) {
            temas.forEach((t) => callback({ id: t.id, data: () => t.data }));
        }
    };
}

/** Vuelca un snapshot (real o simulado) a array plano. */
export function arrayDesdeSnapshot(snapshot) {
    const salida = [];
    snapshot.forEach((d) => salida.push({ id: d.id, data: d.data() }));
    return salida;
}

/**
 * @param {object} opciones
 * @param {() => string|null} opciones.obtenerUid
 * @param {(uid: string) => Promise<object>} opciones.leerDeOrigen  devuelve un QuerySnapshot
 * @param {number} opciones.duracion  antigüedad máxima admitida, en ms
 */
export function crearGestorBanco({ obtenerUid, leerDeOrigen, duracion }) {
    let snapshotMemoria = null;
    let timestampMemoria = null;
    let temasMemoria = null;

    // Marca inmediata de invalidación. borrarCacheTemas() es asíncrono, pero
    // quien invalida suele recargar acto seguido sin esperar; si la lectura no
    // mirase esta marca podría adelantarse al borrado y servir lo viejo.
    let invalidada = false;

    // Si alguien invalida mientras hay una lectura en vuelo, esa respuesta ya
    // nació obsoleta: se puede pintar, pero no se debe persistir.
    let epoca = 0;

    function invalidar() {
        snapshotMemoria = null;
        timestampMemoria = null;
        temasMemoria = null;
        invalidada = true;
        epoca++;
        borrarCacheTemas(); // asíncrono a propósito; la marca ya protege
    }

    /** ¿Hay copia en memoria utilizable? Evita repintar el banco sin motivo. */
    function hayCacheEnMemoria() {
        return (
            !invalidada &&
            !!snapshotMemoria &&
            !!timestampMemoria &&
            Date.now() - timestampMemoria < duracion
        );
    }

    /**
     * Lista plana de temas, SÍNCRONA, para el buscador. Devuelve [] si la
     * caché está invalidada: dar datos ya invalidados es lo que hacía que una
     * pregunta recién borrada siguiera apareciendo en las búsquedas.
     */
    function temasSincronos() {
        if (invalidada) return [];
        if (Array.isArray(temasMemoria) && temasMemoria.length > 0) return temasMemoria;
        if (snapshotMemoria) return arrayDesdeSnapshot(snapshotMemoria);
        return [];
    }

    /** Orden de búsqueda: memoria -> IndexedDB -> origen. */
    async function obtener(forzar) {
        const uid = obtenerUid();
        if (!uid) {
            console.warn('[caché] Sin sesión: no se carga el banco');
            return snapshotDesdeArray([]);
        }

        if (forzar) invalidar();

        // 1. Memoria
        if (hayCacheEnMemoria()) {
            console.log('✅ Banco desde memoria');
            return snapshotMemoria;
        }

        // 2. Disco. Se revisa la marca DESPUÉS del await: pudo entrar una
        //    invalidación mientras IndexedDB respondía.
        if (!invalidada) {
            const epocaAlLeer = epoca;
            const guardado = await leerCacheTemas(uid, duracion);
            if (guardado && !invalidada && epocaAlLeer === epoca) {
                console.log(`✅ Banco desde IndexedDB (${guardado.temas.length} temas)`);
                temasMemoria = guardado.temas;
                snapshotMemoria = snapshotDesdeArray(guardado.temas);
                timestampMemoria = guardado.timestamp;
                return snapshotMemoria;
            }
        }

        // 3. Origen
        console.log('🔄 Leyendo temas desde Firebase');
        const epocaAlPedir = epoca;
        const snapshot = await leerDeOrigen(uid);
        const temas = arrayDesdeSnapshot(snapshot);

        if (epocaAlPedir !== epoca) {
            // Alguien editó mientras Firebase respondía: se pinta, no se guarda
            console.warn('⚠️ Invalidación durante la carga: no se guarda en caché');
            return snapshot;
        }

        invalidada = false;
        snapshotMemoria = snapshot;
        timestampMemoria = Date.now();
        temasMemoria = temas;

        if (temas.length > 0) {
            guardarCacheTemas(uid, temas).then((ok) => {
                if (!ok) console.warn('⚠️ No se pudo guardar la caché; se seguirá leyendo de Firebase');
            });
        } else {
            // Un 0 casi siempre es un fallo de red, no un banco vacío de verdad
            console.warn('⚠️ Firebase devolvió 0 temas: no se guarda caché');
        }

        return snapshot;
    }

    return {
        invalidar,
        obtener,
        temasSincronos,
        hayCacheEnMemoria,
        // Solo para las pruebas
        _estado: () => ({ invalidada, epoca, timestampMemoria, enMemoria: temasMemoria })
    };
}

// Exportado solo para las pruebas
export const _internos = { normalizarFechas, restaurarFechas, ESQUEMA_CACHE };
