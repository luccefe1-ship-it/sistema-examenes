// Pruebas de la caché del banco de temas.
// Ejecutar desde la raiz del repo:  npm test
//
// No toca Firebase ni datos reales: IndexedDB va simulado (fake-indexeddb) y el
// "origen" es una función que devuelve lo que le digamos.

import 'fake-indexeddb/auto';

const RUTA = new URL('../js/cache-temas.js', import.meta.url).href;
const mod = await import(RUTA);
const { crearGestorBanco, leerCacheTemas, guardarCacheTemas, borrarCacheTemas, snapshotDesdeArray } = mod;

// Silenciar el ruido del módulo salvo que se pida verlo
if (!process.env.VERBOSO) {
    console.log = () => {};
    console.warn = () => {};
}
const registrar = (...a) => process.stdout.write(a.join(' ') + '\n');

let pasadas = 0, fallidas = 0;
const fallos = [];

function comprobar(nombre, condicion, detalle) {
    if (condicion) { pasadas++; registrar(`  ✅ ${nombre}`); }
    else { fallidas++; fallos.push(nombre); registrar(`  ❌ ${nombre}${detalle ? '  → ' + detalle : ''}`); }
}

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------

const UID = 'usuario-luciano';
const OTRO_UID = 'usuario-sandra';

function tema(id, ...textos) {
    return {
        id,
        data: {
            nombre: 'Tema ' + id,
            usuarioId: UID,
            fechaCreacion: { seconds: 1700000000, nanoseconds: 0 },
            preguntas: textos.map(t => ({ texto: t, opciones: ['a', 'b', 'c', 'd'], respuestaCorrecta: 'A' }))
        }
    };
}

// Origen simulado: guarda el "estado en el servidor" y cuenta las lecturas
function crearOrigen(temasIniciales) {
    const estado = { temas: temasIniciales, lecturas: 0, retardo: 0 };
    return {
        estado,
        leer: async () => {
            estado.lecturas++;
            if (estado.retardo) await new Promise(r => setTimeout(r, estado.retardo));
            return snapshotDesdeArray(estado.temas);
        }
    };
}

function gestorNuevo(origen, duracion = 60_000, uid = UID) {
    return crearGestorBanco({
        obtenerUid: () => uid,
        leerDeOrigen: origen.leer,
        duracion
    });
}

const textos = (snapshot) => {
    const salida = [];
    snapshot.forEach(d => (d.data().preguntas || []).forEach(p => salida.push(p.texto)));
    return salida;
};

const esperar = (ms) => new Promise(r => setTimeout(r, ms));
// La escritura en IndexedDB va por detrás; se le da margen a la cola
const asentar = () => esperar(60);

// ============================================================
registrar('\n── 1. Comportamiento básico de la caché ──');
// ============================================================
{
    await borrarCacheTemas();
    const origen = crearOrigen([tema('t1', 'Pregunta uno', 'Pregunta dos')]);
    const g = gestorNuevo(origen);

    const s1 = await g.obtener(false);
    comprobar('Primera carga lee del origen', origen.estado.lecturas === 1);
    comprobar('Devuelve las preguntas', textos(s1).length === 2);

    await g.obtener(false);
    comprobar('Segunda carga NO relee el origen (memoria)', origen.estado.lecturas === 1);
}

// ============================================================
registrar('\n── 2. Persistencia en IndexedDB entre "recargas de página" ──');
// ============================================================
{
    await borrarCacheTemas();
    const origen = crearOrigen([tema('t1', 'Pregunta uno')]);
    const g1 = gestorNuevo(origen);
    await g1.obtener(false);
    await asentar();

    // Gestor nuevo = página recargada: memoria vacía, disco lleno
    const g2 = gestorNuevo(origen);
    const s = await g2.obtener(false);
    comprobar('Tras recargar, sirve desde IndexedDB sin tocar el origen', origen.estado.lecturas === 1);
    comprobar('Los datos recuperados son correctos', textos(s)[0] === 'Pregunta uno');
}

// ============================================================
registrar('\n── 3. EL BUG: borrar una pregunta y buscarla / entrar en Test Aleatorio ──');
// ============================================================
{
    await borrarCacheTemas();
    const origen = crearOrigen([tema('t1', 'Pregunta que se borra', 'Pregunta que se queda')]);
    const g = gestorNuevo(origen);
    await g.obtener(false);
    await asentar();

    comprobar('Antes de borrar, el buscador ve 2 preguntas', g.temasSincronos()[0].data.preguntas.length === 2);

    // Simula el borrado real: se escribe en el servidor y se invalida
    origen.estado.temas = [tema('t1', 'Pregunta que se queda')];
    g.invalidar();

    // (a) El buscador es SÍNCRONO: no puede devolver la pregunta borrada
    const sincrono = g.temasSincronos();
    const quedaBorrada = sincrono.some(t => (t.data.preguntas || []).some(p => p.texto === 'Pregunta que se borra'));
    comprobar('El buscador NO devuelve la pregunta borrada', !quedaBorrada);

    // (b) Test Aleatorio pide el banco justo después
    const s = await g.obtener(false);
    comprobar('Test Aleatorio no recibe la pregunta borrada', !textos(s).includes('Pregunta que se borra'));
    comprobar('Test Aleatorio sí recibe la que queda', textos(s).includes('Pregunta que se queda'));
    comprobar('La invalidación forzó una relectura del origen', origen.estado.lecturas === 2);
}

// ============================================================
registrar('\n── 4. Carrera: invalidar sin await antes de recargar ──');
// ============================================================
{
    // Este es el fallo que temíamos: borrarCacheTemas() es asíncrono, y
    // cargarBancoPreguntas() se llama justo después sin esperarlo.
    await borrarCacheTemas();
    const origen = crearOrigen([tema('t1', 'Vieja')]);
    const g = gestorNuevo(origen);
    await g.obtener(false);
    await asentar();

    origen.estado.temas = [tema('t1', 'Nueva')];
    g.invalidar();              // sin await, a propósito
    const s = await g.obtener(false);

    comprobar('No se cuela el dato viejo pese a no esperar al borrado', !textos(s).includes('Vieja'));
    comprobar('Sirve el dato nuevo', textos(s).includes('Nueva'));

    // Y el disco tampoco debe conservar lo viejo
    await asentar();
    const enDisco = await leerCacheTemas(UID, 60_000);
    const viejoEnDisco = enDisco && enDisco.temas.some(t => t.data.preguntas.some(p => p.texto === 'Vieja'));
    comprobar('IndexedDB no conserva el dato viejo', !viejoEnDisco);
}

// ============================================================
registrar('\n── 5. Carrera: invalidar MIENTRAS el origen responde ──');
// ============================================================
{
    await borrarCacheTemas();
    const origen = crearOrigen([tema('t1', 'En vuelo')]);
    origen.estado.retardo = 80;
    const g = gestorNuevo(origen);

    const enVuelo = g.obtener(false);
    await esperar(20);
    g.invalidar();               // el usuario borra algo mientras carga
    await enVuelo;
    await asentar();

    const enDisco = await leerCacheTemas(UID, 60_000);
    comprobar('Una respuesta nacida obsoleta NO se persiste', enDisco === null,
        enDisco ? 'quedó guardada' : '');
    comprobar('El estado queda invalidado', g._estado().invalidada === true);
}

// ============================================================
registrar('\n── 6. Aislamiento entre usuarios (mismo navegador) ──');
// ============================================================
{
    await borrarCacheTemas();
    const origenL = crearOrigen([tema('t1', 'Banco de Luciano')]);
    const gL = gestorNuevo(origenL, 60_000, UID);
    await gL.obtener(false);
    await asentar();

    const leidaPorOtro = await leerCacheTemas(OTRO_UID, 60_000);
    comprobar('Otro usuario NO puede leer la caché ajena', leidaPorOtro === null);

    const origenS = crearOrigen([tema('t9', 'Banco de Sandra')]);
    const gS = gestorNuevo(origenS, 60_000, OTRO_UID);
    const s = await gS.obtener(false);
    comprobar('El otro usuario carga su propio banco del origen', textos(s)[0] === 'Banco de Sandra');
}

// ============================================================
registrar('\n── 7. Caducidad (TTL) ──');
// ============================================================
{
    await borrarCacheTemas();
    const origen = crearOrigen([tema('t1', 'Antigua')]);
    const g1 = gestorNuevo(origen, 50); // 50 ms de vida
    await g1.obtener(false);
    await asentar();

    const g2 = gestorNuevo(origen, 50);
    await esperar(80);
    await g2.obtener(false);
    comprobar('Pasado el TTL se vuelve a leer del origen', origen.estado.lecturas === 2);
}
{
    // Comprobación aislada de la caducidad. Ojo: no vale reutilizar el bloque
    // anterior, porque al recargar por caducidad el gestor vuelve a guardar
    // una entrada FRESCA y entonces leerla debe devolver datos, no null.
    await borrarCacheTemas();
    await guardarCacheTemas(UID, [tema('t1', 'Antigua')]);
    await asentar();

    comprobar('Dentro del TTL, leerCacheTemas devuelve los datos',
        (await leerCacheTemas(UID, 60_000)) !== null);

    await esperar(120);
    comprobar('Pasado el TTL, leerCacheTemas devuelve null',
        (await leerCacheTemas(UID, 100)) === null);
}

// ============================================================
registrar('\n── 8. Degradación: nunca romper la plataforma ──');
// ============================================================
{
    await borrarCacheTemas();

    // (a) Respuesta vacía del origen: no debe persistirse (suele ser fallo de red)
    const vacio = crearOrigen([]);
    const gv = gestorNuevo(vacio);
    const sv = await gv.obtener(false);
    await asentar();
    comprobar('Un banco vacío NO se guarda en caché', (await leerCacheTemas(UID, 60_000)) === null);
    comprobar('Un banco vacío devuelve snapshot vacío sin lanzar', sv.empty === true);

    // (b) Guardar una lista vacía se rechaza explícitamente
    comprobar('guardarCacheTemas rechaza lista vacía', (await guardarCacheTemas(UID, [])) === false);
    comprobar('guardarCacheTemas rechaza uid nulo', (await guardarCacheTemas(null, [tema('t1', 'x')])) === false);

    // (c) Entrada corrupta en disco
    await guardarCacheTemas(UID, [tema('t1', 'Buena')]);
    await asentar();
    await new Promise((res, rej) => {
        const req = indexedDB.open('sistemaExamenes', 1);
        req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('bancoTemas', 'readwrite');
            tx.objectStore('bancoTemas').put({ esquema: 1, usuarioId: UID, timestamp: Date.now(), temas: 'no-es-un-array' }, 'actual');
            tx.oncomplete = () => { db.close(); res(); };
            tx.onerror = () => rej(tx.error);
        };
        req.onerror = () => rej(req.error);
    });
    comprobar('Una caché corrupta se descarta sin lanzar', (await leerCacheTemas(UID, 60_000)) === null);

    // (d) Esquema antiguo
    await new Promise((res, rej) => {
        const req = indexedDB.open('sistemaExamenes', 1);
        req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('bancoTemas', 'readwrite');
            tx.objectStore('bancoTemas').put({ esquema: 99, usuarioId: UID, timestamp: Date.now(), temas: [tema('t1', 'x')] }, 'actual');
            tx.oncomplete = () => { db.close(); res(); };
            tx.onerror = () => rej(tx.error);
        };
        req.onerror = () => rej(req.error);
    });
    comprobar('Una caché de esquema distinto se descarta', (await leerCacheTemas(UID, 60_000)) === null);

    // (e) Fallo total de IndexedDB: la plataforma debe seguir funcionando
    const idbReal = globalThis.indexedDB;
    Object.defineProperty(globalThis, 'indexedDB', {
        value: { open: () => { throw new Error('IndexedDB bloqueado'); } },
        configurable: true
    });
    const modAislado = await import(RUTA + '?sin-idb');
    const gSin = modAislado.crearGestorBanco({
        obtenerUid: () => UID,
        leerDeOrigen: crearOrigen([tema('t1', 'Sigue funcionando')]).leer,
        duracion: 60_000
    });
    const sSin = await gSin.obtener(false);
    comprobar('Sin IndexedDB, el banco carga igual desde el origen', textos(sSin)[0] === 'Sigue funcionando');
    comprobar('Sin IndexedDB, leerCacheTemas devuelve null sin lanzar', (await modAislado.leerCacheTemas(UID, 60_000)) === null);
    comprobar('Sin IndexedDB, guardarCacheTemas devuelve false sin lanzar', (await modAislado.guardarCacheTemas(UID, [tema('t1', 'x')])) === false);
    Object.defineProperty(globalThis, 'indexedDB', { value: idbReal, configurable: true });
}

// ============================================================
registrar('\n── 9. Fechas: .toDate() debe sobrevivir al viaje por la caché ──');
// ============================================================
{
    await borrarCacheTemas();
    const origen = crearOrigen([tema('t1', 'Con fecha')]);
    const g1 = gestorNuevo(origen);
    await g1.obtener(false);
    await asentar();

    const g2 = gestorNuevo(origen);
    const s = await g2.obtener(false);
    let fecha = null;
    s.forEach(d => { fecha = d.data().fechaCreacion; });

    comprobar('La fecha recuperada conserva .toDate()', typeof fecha?.toDate === 'function');
    comprobar('.toDate() devuelve la fecha correcta',
        fecha?.toDate?.().getTime() === 1700000000000,
        String(fecha?.toDate?.()));
    comprobar('También conserva .seconds (la tarjeta del tema usa ambos)', fecha?.seconds === 1700000000);
}

// ============================================================
registrar('\n── 10. Recarga manual (el botón "Recargar banco") ──');
// ============================================================
{
    await borrarCacheTemas();
    const origen = crearOrigen([tema('t1', 'Versión app antigua')]);
    const g = gestorNuevo(origen);
    await g.obtener(false);
    await asentar();

    // Alguien edita desde la app móvil: la web no se entera
    origen.estado.temas = [tema('t1', 'Editada desde la app')];

    const sinForzar = await g.obtener(false);
    comprobar('Sin forzar, sigue sirviendo la caché (esperado)', textos(sinForzar).includes('Versión app antigua'));

    const forzado = await g.obtener(true);
    comprobar('Forzando, trae lo editado fuera', textos(forzado).includes('Editada desde la app'));
    comprobar('Forzar provocó lectura del origen', origen.estado.lecturas === 2);
}

// ============================================================
registrar('\n── 11. Orden de la cola (borrar y guardar no se pisan) ──');
// ============================================================
{
    await borrarCacheTemas();
    // Se lanzan a la vez, sin await entre medias
    const pGuardar = guardarCacheTemas(UID, [tema('t1', 'A')]);
    const pBorrar = borrarCacheTemas();
    const pGuardar2 = guardarCacheTemas(UID, [tema('t1', 'B')]);
    await Promise.all([pGuardar, pBorrar, pGuardar2]);
    await asentar();

    const final = await leerCacheTemas(UID, 60_000);
    comprobar('Gana la última operación encolada, no una carrera',
        final !== null && final.temas[0].data.preguntas[0].texto === 'B',
        final ? final.temas[0].data.preguntas[0].texto : 'null');
}

// ============================================================
registrar('\n── 12. Sin sesión ──');
// ============================================================
{
    const g = crearGestorBanco({
        obtenerUid: () => null,
        leerDeOrigen: async () => { throw new Error('No debería leerse sin sesión'); },
        duracion: 60_000
    });
    const s = await g.obtener(false);
    comprobar('Sin uid devuelve snapshot vacío y no lee el origen', s.empty === true && s.size === 0);
}

// ------------------------------------------------------------
registrar('\n' + '═'.repeat(52));
registrar(`  ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas) registrar('  Fallos: ' + fallos.join(' | '));
registrar('═'.repeat(52) + '\n');
process.exit(fallidas ? 1 : 0);
