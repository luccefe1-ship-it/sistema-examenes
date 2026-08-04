// ============================================================
//  /api/_consumo.js
//  Anota lo que gasta cada usuario en la API de Claude.
//
//  Por qué existe: la clave de Claude es una sola y la pagas tú.
//  Sin este registro no hay forma de saber quién consume qué, ni
//  de cobrar bien, ni de cortar a quien se pase. Es la base sobre
//  la que irá después el sistema de créditos.
//
//  Escribe en Firestore desde el SERVIDOR con Firebase Admin. Es
//  deliberado: si lo escribiera el navegador, el usuario podría
//  falsear su propio consumo, y un libro de cuentas que puede
//  editar el interesado no sirve de nada.
//
//  Si no está configurada la cuenta de servicio, no rompe nada:
//  deja el consumo en el registro de Vercel y sigue adelante.
// ============================================================

// Precios oficiales por millón de tokens, en dólares.
// Comprobados en agosto de 2026. REVISAR si Anthropic los cambia:
// Sonnet 5 está en precio de lanzamiento hasta el 31/08/2026 y
// a partir del 01/09 pasa a 3 $ / 15 $.
const PRECIOS = {
    'claude-opus-5':     { entrada: 5,  salida: 25 },
    'claude-opus-4-8':   { entrada: 5,  salida: 25 },
    'claude-sonnet-5':   { entrada: 3,  salida: 15 },
    'claude-haiku-4-5':  { entrada: 1,  salida: 5  }
};

// Si aparece un modelo que no está en la tabla, se cobra como el más
// caro. Preferible pasarse en la estimación que quedarse corto.
const PRECIO_POR_DEFECTO = { entrada: 5, salida: 25 };

// Los tokens escritos y leídos de caché no valen lo mismo que los normales
const FACTOR_ESCRITURA_CACHE = 1.25;
const FACTOR_LECTURA_CACHE = 0.1;

function calcularCoste(modelo, uso) {
    const precio = PRECIOS[modelo] || PRECIO_POR_DEFECTO;
    const u = uso || {};

    const entrada = Number(u.input_tokens) || 0;
    const salida = Number(u.output_tokens) || 0;
    const escrituraCache = Number(u.cache_creation_input_tokens) || 0;
    const lecturaCache = Number(u.cache_read_input_tokens) || 0;

    const dolares =
        (entrada / 1e6) * precio.entrada +
        (escrituraCache / 1e6) * precio.entrada * FACTOR_ESCRITURA_CACHE +
        (lecturaCache / 1e6) * precio.entrada * FACTOR_LECTURA_CACHE +
        (salida / 1e6) * precio.salida;

    return {
        modelo,
        tokensEntrada: entrada,
        tokensSalida: salida,
        tokensCacheEscritura: escrituraCache,
        tokensCacheLectura: lecturaCache,
        // Se redondea a 6 decimales: una llamada suelta puede costar céntimas de céntimo
        costeDolares: Math.round(dolares * 1e6) / 1e6
    };
}

// ------------------------------------------------------------
//  Firebase Admin, solo si hay credenciales
// ------------------------------------------------------------
let firestore = null;
let adminIntentado = false;

function obtenerFirestore() {
    if (adminIntentado) return firestore;
    adminIntentado = true;

    // Se limpia por los lados: al pegar el JSON en Vercel es fácil que se
    // cuele un salto de línea o un espacio delante, y Vercel además avisa
    // de ello. JSON.parse lo toleraría igual, pero mejor no depender de eso.
    const credenciales = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
    if (!credenciales) {
        console.warn('[consumo] Sin FIREBASE_SERVICE_ACCOUNT: el gasto solo se registra en los logs.');
        return null;
    }

    try {
        const cuenta = JSON.parse(credenciales);

        if (!cuenta.project_id || !cuenta.private_key || !cuenta.client_email) {
            console.error('[consumo] El JSON de la cuenta de servicio está incompleto.');
            return null;
        }

        const admin = require('firebase-admin');
        if (admin.apps.length === 0) {
            admin.initializeApp({ credential: admin.credential.cert(cuenta) });
        }
        firestore = admin.firestore();
        console.log(`[consumo] Firebase Admin listo para el proyecto ${cuenta.project_id}`);

    } catch (error) {
        // El mensaje distingue el caso más probable: JSON mal pegado
        if (error instanceof SyntaxError) {
            console.error('[consumo] FIREBASE_SERVICE_ACCOUNT no es un JSON válido. Revisa que esté pegado entero, desde { hasta }.');
        } else {
            console.error('[consumo] No se pudo iniciar Firebase Admin:', error.message);
        }
        firestore = null;
    }

    return firestore;
}

/* Anota una llamada.
   Nunca lanza: que falle la contabilidad no debe tumbar la función
   que el usuario está esperando. */
async function anotarConsumo({ uid, email, funcion, modelo, uso, cuenta, detalle }) {
    const calculo = calcularCoste(modelo, uso);

    const registro = {
        usuarioId: uid || 'desconocido',
        email: email || '',
        funcion,                    // 'generar-preguntas-ia' | 'explicacion' | 'procesar-preguntas'
        cuentaApi: cuenta || '',    // cuál de tus claves lo pagó
        ...calculo,
        detalle: detalle || {},
        fecha: new Date()
    };

    console.log(`[consumo] ${registro.funcion} · ${registro.usuarioId} · ${registro.tokensEntrada}+${registro.tokensSalida} tok · ${registro.costeDolares} $`);

    const db = obtenerFirestore();
    if (!db) return calculo;

    try {
        const admin = require('firebase-admin');
        const incremento = admin.firestore.FieldValue.increment;

        // Un documento por llamada, para poder auditar
        await db.collection('consumoApi').add(registro);

        // Y un acumulado por usuario, para no tener que sumar miles de documentos
        await db.collection('consumoResumen').doc(registro.usuarioId).set({
            usuarioId: registro.usuarioId,
            email: registro.email,
            costeTotalDolares: incremento(calculo.costeDolares),
            tokensEntradaTotal: incremento(calculo.tokensEntrada),
            tokensSalidaTotal: incremento(calculo.tokensSalida),
            llamadas: incremento(1),
            [`porFuncion.${funcion}`]: incremento(calculo.costeDolares),
            ultimaLlamada: new Date()
        }, { merge: true });

    } catch (error) {
        console.error('[consumo] No se pudo guardar el consumo:', error.message);
    }

    return calculo;
}

module.exports = { calcularCoste, anotarConsumo, PRECIOS };
