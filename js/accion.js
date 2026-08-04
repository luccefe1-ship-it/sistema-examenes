// ============================================================
//  /js/accion.js
//  Pantalla propia para los enlaces que manda Firebase por correo:
//  restablecer contraseña y verificar dirección.
//
//  Firebase trae una página suya para esto, pero está en inglés,
//  no se puede maquetar y vive en un dominio distinto, así que
//  parece un intento de phishing. Poniendo una "action URL"
//  personalizada en la consola, los enlaces llegan aquí.
//
//  El código de un solo uso (oobCode) lo valida Firebase; esta
//  página solo lo pasa. No guardamos ni vemos ninguna contraseña.
// ============================================================

import { auth } from './firebase-config.js';
import {
    verifyPasswordResetCode,
    confirmPasswordReset,
    applyActionCode,
    checkActionCode
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const secciones = {
    cargando: document.getElementById('cargandoSection'),
    reset: document.getElementById('resetSection'),
    verificado: document.getElementById('verificadoSection'),
    exito: document.getElementById('exitoSection'),
    error: document.getElementById('errorSection')
};

const messageDiv = document.getElementById('message');

function mostrarSeccion(nombre) {
    Object.entries(secciones).forEach(([clave, el]) => {
        if (el) el.style.display = clave === nombre ? 'block' : 'none';
    });
}

function mostrarMensaje(texto, tipo) {
    messageDiv.innerHTML = texto;
    messageDiv.className = tipo;
    messageDiv.style.display = 'block';
}

function limpiarMensaje() {
    messageDiv.style.display = 'none';
    messageDiv.innerHTML = '';
}

function mostrarError(texto) {
    document.getElementById('textoError').textContent = texto;
    mostrarSeccion('error');
}

// Los códigos de Firebase, en cristiano
function explicar(codigo) {
    switch (codigo) {
        case 'auth/expired-action-code':
            return 'El enlace ha caducado. Los enlaces de recuperación duran poco tiempo por seguridad: pide uno nuevo.';
        case 'auth/invalid-action-code':
            return 'Este enlace ya se ha usado o está incompleto. Pide uno nuevo desde la pantalla de inicio de sesión.';
        case 'auth/user-disabled':
            return 'Esta cuenta está desactivada.';
        case 'auth/user-not-found':
            return 'La cuenta asociada a este enlace ya no existe.';
        case 'auth/weak-password':
            return 'La contraseña es demasiado corta. Necesita al menos 6 caracteres.';
        case 'auth/network-request-failed':
            return 'Sin conexión. Comprueba tu internet e inténtalo de nuevo.';
        default:
            return 'No se ha podido completar la operación (' + codigo + ').';
    }
}

// ------------------------------------------------------------
//  Arranque: se mira qué pide el enlace
// ------------------------------------------------------------
const parametros = new URLSearchParams(window.location.search);
const modo = parametros.get('mode');
const codigo = parametros.get('oobCode');

async function arrancar() {
    if (!codigo) {
        mostrarError('Este enlace está incompleto. Ábrelo directamente desde el correo, sin copiarlo a mano.');
        return;
    }

    try {
        switch (modo) {
            case 'resetPassword': {
                // Valida el código y de paso nos dice de qué cuenta es
                const email = await verifyPasswordResetCode(auth, codigo);
                document.getElementById('emailCuenta').textContent = email;
                mostrarSeccion('reset');
                document.getElementById('nuevaPassword').focus();
                break;
            }

            case 'verifyEmail': {
                await applyActionCode(auth, codigo);
                mostrarSeccion('verificado');
                break;
            }

            case 'recoverEmail': {
                const info = await checkActionCode(auth, codigo);
                await applyActionCode(auth, codigo);
                document.getElementById('textoError').textContent =
                    `Se ha restaurado tu correo anterior: ${info.data.email || ''}. Si no has sido tú, cambia la contraseña cuanto antes.`;
                mostrarSeccion('error');
                break;
            }

            default:
                mostrarError('Este enlace no corresponde a ninguna acción que la plataforma sepa atender.');
        }
    } catch (error) {
        console.error('Error procesando el enlace:', error);
        mostrarError(explicar(error.code));
    }
}

// ------------------------------------------------------------
//  Guardar la contraseña nueva
// ------------------------------------------------------------
const resetForm = document.getElementById('resetForm');

resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarMensaje();

    const nueva = document.getElementById('nuevaPassword').value;
    const repetida = document.getElementById('repetirPassword').value;
    const boton = document.getElementById('btnGuardarClave');

    if (nueva.length < 6) {
        mostrarMensaje('La contraseña necesita al menos 6 caracteres.', 'error');
        return;
    }
    if (nueva !== repetida) {
        mostrarMensaje('Las dos contraseñas no coinciden.', 'error');
        document.getElementById('repetirPassword').focus();
        return;
    }

    boton.disabled = true;
    boton.textContent = 'Guardando…';

    try {
        await confirmPasswordReset(auth, codigo, nueva);
        limpiarMensaje();
        mostrarSeccion('exito');
    } catch (error) {
        console.error('Error cambiando la contraseña:', error);
        mostrarMensaje(explicar(error.code), 'error');
        boton.disabled = false;
        boton.textContent = 'Guardar contraseña';
    }
});

// Mostrar u ocultar la contraseña
document.getElementById('verClave').addEventListener('click', () => {
    const campo = document.getElementById('nuevaPassword');
    const oculta = campo.type === 'password';
    campo.type = oculta ? 'text' : 'password';
    document.getElementById('verClave').textContent = oculta ? '🙈' : '👁️';
    campo.focus();
});

arrancar();
