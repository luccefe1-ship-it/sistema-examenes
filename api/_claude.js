// ============================================================
//  /api/_claude.js
//  Utilidades compartidas por las funciones que llaman a Claude.
//  Los archivos que empiezan por "_" no son endpoints: Vercel los
//  ignora al crear rutas y solo sirven como módulo interno.
// ============================================================

const MAX_REINTENTOS = 3;
const URL_RECARGA = 'https://platform.claude.com/settings/billing';

// ------------------------------------------------------------
//  Control de origen: solo la propia plataforma o localhost
// ------------------------------------------------------------
const ORIGENES_EXTRA_PERMITIDOS = [];

function origenPermitido(origen, host) {
    if (!origen) return true;              // peticiones sin cabecera Origin
    if (ORIGENES_EXTRA_PERMITIDOS.includes(origen)) return true;
    try {
        const { hostname, host: hostOrigen } = new URL(origen);
        if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
        return hostOrigen === host;
    } catch (e) {
        return false;
    }
}

// Prepara cabeceras y valida método y origen.
// Devuelve true si la petición puede seguir adelante.
function peticionValida(req, res) {
    const origen = req.headers.origin || '';
    const permitido = origenPermitido(origen, req.headers.host);

    if (origen && permitido) res.setHeader('Access-Control-Allow-Origin', origen);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');

    if (req.method === 'OPTIONS') { res.status(204).end(); return false; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido' }); return false; }
    if (!permitido) { res.status(403).json({ error: 'Origen no autorizado: ' + origen }); return false; }

    return true;
}

// ------------------------------------------------------------
//  Cuentas disponibles, en orden de consumo
// ------------------------------------------------------------
function obtenerCuentas() {
    return [
        { nombre: 'Luciano', clave: process.env.ANTHROPIC_API_KEY },
        { nombre: 'Musicalbase', clave: process.env.ANTHROPIC_API_KEY_2 }
    ].filter(cuenta => cuenta.clave && cuenta.clave.trim());
}

// Error temporal: reintentar con la MISMA clave tras una pausa
function esTemporal(estado) {
    return estado === 429 || estado === 500 || estado === 502 || estado === 503 || estado === 529;
}

// Error de la cuenta: saldo agotado o clave inválida -> siguiente cuenta
function convieneCambiar(estado, detalle) {
    if (estado === 401 || estado === 403) return true;
    const texto = String(detalle || '').toLowerCase();
    return texto.includes('credit balance') || texto.includes('billing');
}

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ------------------------------------------------------------
//  Llamada a la API con encadenado de cuentas y reintentos
//  Recibe el cuerpo de la petición ya montado; devuelve la
//  respuesta JSON de Claude más el nombre de la cuenta usada.
//
//  La "señal" es opcional y sirve para ponerle un tope de tiempo
//  a TODO el proceso, reintentos y cambios de cuenta incluidos.
//  Sin ella, una cadena de reintentos puede comerse entero el
//  maxDuration de Vercel y hacer que la función muera con un 504
//  sin cuerpo, que es un error que el usuario no puede entender.
//  Los endpoints que no la pasan se comportan igual que siempre.
// ------------------------------------------------------------
async function llamarClaude(cuerpoPeticion, cuentas, opciones = {}) {
    const { señal = null } = opciones;
    const cuerpo = JSON.stringify(cuerpoPeticion);
    let respuesta = null;
    let cuentaUsada = null;
    const fallos = [];
    const descartadas = [];

    // Se comprueba en cada vuelta: de nada sirve empezar una petición
    // nueva si el tiempo ya se ha agotado
    const sinTiempo = () => {
        if (señal && señal.aborted) {
            const error = new Error('Se ha agotado el tiempo disponible para esta petición.');
            error.abortado = true;
            throw error;
        }
    };

    for (const cuenta of cuentas) {
        let cambiarDeCuenta = false;

        for (let reintento = 0; reintento <= MAX_REINTENTOS; reintento++) {
            sinTiempo();

            let intento;
            try {
                intento = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'x-api-key': cuenta.clave.trim(),
                        'anthropic-version': '2023-06-01'
                    },
                    body: cuerpo,
                    signal: señal || undefined
                });
            } catch (error) {
                if (error.name === 'AbortError' || (señal && señal.aborted)) {
                    const agotado = new Error('Se ha agotado el tiempo disponible para esta petición.');
                    agotado.abortado = true;
                    throw agotado;
                }
                throw error;
            }

            if (intento.ok) {
                respuesta = intento;
                cuentaUsada = cuenta.nombre;
                break;
            }

            const detalle = await intento.text();
            fallos.push(`${cuenta.nombre}: ${intento.status} ${detalle.slice(0, 200)}`);

            if (esTemporal(intento.status) && reintento < MAX_REINTENTOS) {
                const cabecera = parseFloat(intento.headers.get('retry-after'));
                const pausa = Number.isFinite(cabecera)
                    ? Math.min(cabecera * 1000, 8000)
                    : 1500 * Math.pow(2, reintento);
                console.warn(`[claude] ${intento.status} con ${cuenta.nombre}, reintento ${reintento + 1} en ${pausa} ms.`);
                await esperar(pausa);
                continue;
            }

            if (convieneCambiar(intento.status, detalle)) {
                const sinSaldo = String(detalle).toLowerCase().includes('credit balance');
                descartadas.push({ nombre: cuenta.nombre, motivo: sinSaldo ? 'sin saldo' : 'clave no válida' });
                console.warn(`[claude] Cuenta ${cuenta.nombre} descartada (${intento.status}), probando la siguiente.`);
                cambiarDeCuenta = true;
                break;
            }

            throw new Error(`Claude devolvió ${intento.status} con la cuenta ${cuenta.nombre}: ${detalle.slice(0, 400)}`);
        }

        if (respuesta) break;
        if (!cambiarDeCuenta) break;
    }

    if (!respuesta) {
        if (descartadas.length === cuentas.length && descartadas.every(c => c.motivo === 'sin saldo')) {
            const error = new Error('Se han agotado los fondos de la API de Claude. Recarga saldo y vuelve a intentarlo.');
            error.enlace = URL_RECARGA;
            error.sinSaldo = true;
            throw error;
        }
        throw new Error(`Ninguna cuenta pudo procesar la petición. ${fallos.join(' | ')}`);
    }

    const data = await respuesta.json();

    if (data.stop_reason === 'refusal') {
        throw new Error('Claude rechazó la petición.');
    }

    return { data, cuenta: cuentaUsada };
}

// Extrae y limpia el texto plano de la respuesta
function textoDeRespuesta(data) {
    return (data.content || [])
        .filter(b => b.type === 'text')
        .map(b => b.text || '')
        .join('\n')
        .replace(/\*+/g, '')
        .replace(/^#+\s*/gm, '')
        .trim();
}

module.exports = {
    URL_RECARGA,
    origenPermitido,
    peticionValida,
    obtenerCuentas,
    llamarClaude,
    textoDeRespuesta
};
