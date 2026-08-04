import { auth, db } from './firebase-config.js';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Elementos del DOM
const loginSection = document.getElementById('loginSection');
const registerSection = document.getElementById('registerSection');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const showRegisterLink = document.getElementById('showRegister');
const showLoginLink = document.getElementById('showLogin');
const messageDiv = document.getElementById('message');
const recuperarSection = document.getElementById('recuperarSection');
const recuperarForm = document.getElementById('recuperarForm');
const showRecuperarLink = document.getElementById('showRecuperar');
const volverLoginLink = document.getElementById('volverLoginDesdeRecuperar');

// Cambiar entre login y registro
showRegisterLink.addEventListener('click', (e) => {
    e.preventDefault();
    loginSection.style.display = 'none';
    registerSection.style.display = 'block';
    clearMessage();
});

showLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    registerSection.style.display = 'none';
    recuperarSection.style.display = 'none';
    loginSection.style.display = 'block';
    clearMessage();
});

/* ==================================================================
   RECUPERAR CONTRASEÑA
   El correo lo envía Firebase; la plataforma no ve ni guarda nada.
   El enlace lleva a una página de Google donde se elige la nueva
   contraseña, y caduca solo.
================================================================== */
showRecuperarLink.addEventListener('click', (e) => {
    e.preventDefault();
    loginSection.style.display = 'none';
    registerSection.style.display = 'none';
    recuperarSection.style.display = 'block';
    clearMessage();

    // Si ya había escrito el correo para entrar, se lo arrastramos
    const escrito = document.getElementById('loginEmail').value.trim();
    if (escrito) document.getElementById('recuperarEmail').value = escrito;
});

volverLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    recuperarSection.style.display = 'none';
    loginSection.style.display = 'block';
    clearMessage();
});

recuperarForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('recuperarEmail').value.trim();
    const boton = document.getElementById('btnRecuperar');

    if (!email) {
        showMessage('Escribe tu correo.', 'error');
        return;
    }

    boton.disabled = true;
    showMessage('Enviando…', 'success');

    try {
        await sendPasswordResetEmail(auth, email);

        /* Se responde lo mismo exista o no la cuenta. Si dijéramos
           "ese correo no está registrado", cualquiera podría averiguar
           quién tiene cuenta en la plataforma probando direcciones. */
        showMessage(
            'Si ese correo tiene una cuenta, te hemos enviado un enlace para cambiar la contraseña.<br>' +
            'Revisa también la carpeta de spam: el remitente es de Firebase.',
            'success'
        );
        recuperarForm.reset();

    } catch (error) {
        console.error('Error enviando el correo de recuperación:', error);

        // Un correo inexistente no se delata; el resto de errores sí se explican
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-email') {
            showMessage(
                'Si ese correo tiene una cuenta, te hemos enviado un enlace para cambiar la contraseña.<br>' +
                'Revisa también la carpeta de spam.',
                'success'
            );
            recuperarForm.reset();
        } else {
            showMessage(getErrorMessage(error.code), 'error');
        }
    } finally {
        boton.disabled = false;
    }
});

// Manejar registro
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    
    try {
        showMessage('Creando cuenta...', 'success');
        
        // Crear usuario en Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Guardar datos adicionales en Firestore
        await setDoc(doc(db, "usuarios", user.uid), {
            nombre: name,
            email: email,
            fechaRegistro: new Date(),
            progreso: {
                testsRealizados: 0,
                puntuacionTotal: 0,
                racha: 0
            }
        });
        
        showMessage('¡Cuenta creada exitosamente! Redirigiendo...', 'success');
        
        // Redirigir después de 2 segundos
        setTimeout(() => {
            window.location.href = 'homepage.html';
        }, 2000);
        
    } catch (error) {
        console.error('Error:', error);
        showMessage(getErrorMessage(error.code), 'error');
    }
});

// Manejar login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        showMessage('Iniciando sesión...', 'success');
        
        await signInWithEmailAndPassword(auth, email, password);
        
        showMessage('¡Bienvenido! Redirigiendo...', 'success');
        
        // Redirigir después de 1 segundo
        setTimeout(() => {
            window.location.href = 'homepage.html';
        }, 1000);
        
    } catch (error) {
        console.error('Error:', error);
        showMessage(getErrorMessage(error.code), 'error');
    }
});

// Verificar si el usuario ya está logueado
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Usuario logueado, redirigir a homepage
        window.location.href = 'homepage.html';
    }
});

// Funciones auxiliares
function showMessage(message, type) {
    messageDiv.innerHTML = message;
    messageDiv.className = type;
    messageDiv.style.display = 'block';
}

function clearMessage() {
    messageDiv.style.display = 'none';
    messageDiv.innerHTML = '';
}

function getErrorMessage(errorCode) {
    switch (errorCode) {
        case 'auth/email-already-in-use':
            return 'Este email ya está registrado';
        case 'auth/invalid-email':
            return 'Email inválido';
        case 'auth/weak-password':
            return 'La contraseña debe tener al menos 6 caracteres';
        case 'auth/user-not-found':
            return 'Usuario no encontrado';
        case 'auth/wrong-password':
            return 'Contraseña incorrecta';
        case 'auth/invalid-credential':
            return 'Credenciales inválidas';
        case 'auth/too-many-requests':
            return 'Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.';
        case 'auth/network-request-failed':
            return 'Sin conexión. Comprueba tu internet e inténtalo de nuevo.';
        case 'auth/missing-email':
            return 'Escribe tu correo.';
        default:
            return 'Error: ' + errorCode;
    }
}
