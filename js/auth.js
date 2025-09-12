import { auth, db } from './firebase-config.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
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
    loginSection.style.display = 'block';
    clearMessage();
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
        default:
            return 'Error: ' + errorCode;
    }
}
