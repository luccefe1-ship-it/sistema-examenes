// ============================================================
//  /api/_auth.js
//  Comprueba que quien llama a los endpoints de Claude es un
//  usuario de verdad de la plataforma.
//
//  Hasta ahora bastaba con venir del dominio correcto, y eso no
//  protege de nada: cualquiera que abriese el inspector veía la
//  URL y podía llamarla desde su propia web gastando el saldo
//  de la API.
//
//  Se valida el ID token de Firebase verificando su firma contra
//  los certificados públicos de Google. No hace falta el SDK de
//  Firebase Admin ni una cuenta de servicio: para COMPROBAR
//  tokens basta con la clave pública y el ID del proyecto, que
//  no es secreto.
//
//  Los archivos que empiezan por "_" no son endpoints: Vercel
//  los ignora al crear rutas.
// ============================================================

const crypto = require('crypto');

const PROYECTO = process.env.FIREBASE_PROJECT_ID || 'plataforma-examenes-f2df9';
const URL_CERTIFICADOS = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const MARGEN_RELOJ = 60; // segundos de tolerancia por desfase de reloj

// Los certificados se reutilizan mientras la instancia siga viva
let cacheCertificados = null;
let cacheCaduca = 0;

async function obtenerCertificados() {
    const ahora = Date.now();
    if (cacheCertificados && ahora < cacheCaduca) return cacheCertificados;

    const respuesta = await fetch(URL_CERTIFICADOS);
    if (!respuesta.ok) {
        throw new Error(`No se pudieron descargar los certificados de Google (${respuesta.status})`);
    }

    cacheCertificados = await respuesta.json();

    // Se respeta el max-age que manda Google; por defecto, una hora
    const control = respuesta.headers.get('cache-control') || '';
    const maxAge = /max-age=(\d+)/.exec(control);
    cacheCaduca = ahora + (maxAge ? parseInt(maxAge[1], 10) : 3600) * 1000;

    return cacheCertificados;
}

function base64UrlADato(texto) {
    return Buffer.from(String(texto).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function decodificarJson(parte) {
    return JSON.parse(base64UrlADato(parte).toString('utf8'));
}

/* Verifica un ID token de Firebase.
   Devuelve { uid, email } si es válido; lanza error si no.  */
async function verificarIdToken(token) {
    if (!token || typeof token !== 'string') {
        throw new Error('Falta el token de sesión');
    }

    const partes = token.split('.');
    if (partes.length !== 3) throw new Error('Token mal formado');

    let cabecera;
    let carga;
    try {
        cabecera = decodificarJson(partes[0]);
        carga = decodificarJson(partes[1]);
    } catch (error) {
        throw new Error('Token ilegible');
    }

    if (cabecera.alg !== 'RS256') throw new Error('Algoritmo de firma no admitido');
    if (!cabecera.kid) throw new Error('Al token le falta el identificador de clave');

    // --- Comprobaciones de contenido ---
    const ahora = Math.floor(Date.now() / 1000);

    if (carga.aud !== PROYECTO) throw new Error('El token es de otro proyecto');
    if (carga.iss !== `https://securetoken.google.com/${PROYECTO}`) throw new Error('Emisor del token no válido');
    if (!carga.sub) throw new Error('El token no identifica a ningún usuario');
    if (typeof carga.exp !== 'number' || carga.exp + MARGEN_RELOJ < ahora) throw new Error('Sesión caducada');
    if (typeof carga.iat !== 'number' || carga.iat - MARGEN_RELOJ > ahora) throw new Error('Token emitido en el futuro');

    // --- Comprobación de la firma ---
    const certificados = await obtenerCertificados();
    const certificado = certificados[cabecera.kid];
    if (!certificado) throw new Error('La clave que firma el token no existe');

    const verificador = crypto.createVerify('RSA-SHA256');
    verificador.update(`${partes[0]}.${partes[1]}`);
    verificador.end();

    const firmaValida = verificador.verify(certificado, base64UrlADato(partes[2]));
    if (!firmaValida) throw new Error('La firma del token no es válida');

    return { uid: carga.sub, email: carga.email || '' };
}

function tokenDeLaPeticion(req) {
    const cabecera = req.headers.authorization || req.headers.Authorization || '';
    const coincide = /^Bearer\s+(.+)$/i.exec(String(cabecera).trim());
    return coincide ? coincide[1] : null;
}

/* Envoltorio para los endpoints: si no hay usuario válido responde
   401 y devuelve null, de modo que el endpoint pueda cortar. */
async function usuarioAutenticado(req, res) {
    try {
        const usuario = await verificarIdToken(tokenDeLaPeticion(req));
        return usuario;
    } catch (error) {
        console.warn('[auth] Petición rechazada:', error.message);
        res.status(401).json({ error: 'Necesitas iniciar sesión para usar esta función.' });
        return null;
    }
}

/* ------------------------------------------------------------
   Freno de uso por usuario.
   AVISO: vive en la memoria de la instancia de Vercel. Cada
   instancia lleva su propia cuenta y se reinicia al hibernar, así
   que sirve para frenar un abuso evidente, NO como cupo real.
   Un cupo de verdad necesita guardarlo en Firestore desde el
   servidor, y eso exige el SDK de Firebase Admin.
------------------------------------------------------------ */
const VENTANA_MS = 60 * 60 * 1000;
const MAX_LLAMADAS_POR_VENTANA = 120;
const usoPorUsuario = new Map();

function dentroDelLimite(uid) {
    const ahora = Date.now();
    const registro = usoPorUsuario.get(uid);

    if (!registro || ahora > registro.reinicio) {
        usoPorUsuario.set(uid, { llamadas: 1, reinicio: ahora + VENTANA_MS });
        return true;
    }

    registro.llamadas++;
    return registro.llamadas <= MAX_LLAMADAS_POR_VENTANA;
}

/* Comprueba sesión y freno de uso a la vez.
   Devuelve el usuario, o null si ya se ha respondido con un error. */
async function usuarioConCupo(req, res) {
    const usuario = await usuarioAutenticado(req, res);
    if (!usuario) return null;

    if (!dentroDelLimite(usuario.uid)) {
        console.warn(`[auth] Usuario ${usuario.uid} por encima del límite de uso`);
        res.status(429).json({ error: 'Has hecho demasiadas peticiones seguidas. Espera un rato e inténtalo de nuevo.' });
        return null;
    }

    return usuario;
}

module.exports = {
    verificarIdToken,
    tokenDeLaPeticion,
    usuarioAutenticado,
    usuarioConCupo
};
