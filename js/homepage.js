import { auth, db } from './firebase-config.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Elementos del DOM
const userNameSpan = document.getElementById('userName');
const logoutBtn = document.getElementById('logoutBtn');
const saludoHorario = document.getElementById('saludoHorario');
const fraseMotivaional = document.getElementById('fraseMotivaional');

// Variable para almacenar el nombre del usuario
let nombreUsuario = '';

// Frases motivacionales dinámicas
const frasesMotivaionales = [
    "¿qué tal va todo?",
    "vamos por ello",
    "sigamos avanzando",
    "a por todas",
    "hoy es un gran día",
    "dale caña al estudio",
    "vamos a conseguirlo",
    "paso a paso llegamos lejos",
    "cada día más cerca",
    "tú puedes con todo",
    "la constancia es la clave",
    "otro día, otra oportunidad"
];

// Función para obtener saludo según la hora CON EL NOMBRE DEL USUARIO
function obtenerSaludoPorHorario() {
    const ahora = new Date();
    const hora = ahora.getHours();
    
    let saludo = '';
    if (hora >= 6 && hora < 12) {
        saludo = "Buenos días";
    } else if (hora >= 12 && hora < 20) {
        saludo = "Buenas tardes";
    } else {
        saludo = "Buenas noches";
    }
    
    // Añadir el nombre del usuario si está disponible
    if (nombreUsuario) {
        return `${saludo}, ${nombreUsuario}`;
    } else {
        return saludo;
    }
}

// Función para obtener frase motivacional aleatoria
function obtenerFraseMotivaionalAleatoria() {
    const indiceAleatorio = Math.floor(Math.random() * frasesMotivaionales.length);
    return frasesMotivaionales[indiceAleatorio];
}

// Función para actualizar saludo dinámico
function actualizarSaludoDinamico() {
    if (saludoHorario && fraseMotivaional) {
        saludoHorario.textContent = obtenerSaludoPorHorario();
        fraseMotivaional.textContent = obtenerFraseMotivaionalAleatoria();
    }
}

// Función para cambiar la frase motivacional cada cierto tiempo
function iniciarCambioFrasesPeriodico() {
    // Cambiar frase cada 15 segundos
    setInterval(() => {
        if (fraseMotivaional) {
            // Efecto de transición suave
            fraseMotivaional.style.opacity = '0';
            
            setTimeout(() => {
                fraseMotivaional.textContent = obtenerFraseMotivaionalAleatoria();
                fraseMotivaional.style.opacity = '1';
            }, 300);
        }
    }, 15000);
}

// Verificar autenticación
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Usuario logueado, cargar datos
        try {
            const userDoc = await getDoc(doc(db, "usuarios", user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                nombreUsuario = userData.nombre; // Guardar el nombre del usuario
                userNameSpan.textContent = userData.nombre;
            } else {
                // Si no hay documento de usuario, usar el email como nombre
                nombreUsuario = user.email.split('@')[0]; // Usar la parte antes del @
                userNameSpan.textContent = user.email;
            }
        } catch (error) {
            console.error('Error cargando datos:', error);
            nombreUsuario = user.email.split('@')[0]; // Fallback al email
            userNameSpan.textContent = user.email;
        }
        
        // Inicializar saludo dinámico DESPUÉS de cargar el nombre del usuario
        actualizarSaludoDinamico();
        iniciarCambioFrasesPeriodico();
        
    } else {
        // Usuario no logueado, redirigir al login
        window.location.href = 'index.html';
    }
});

// Manejar logout
logoutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Error al cerrar sesión:', error);
        alert('Error al cerrar sesión');
    }
});

// Manejar botón de perfil (NUEVO)
document.addEventListener('DOMContentLoaded', () => {
    // Agregar transición suave a la frase motivacional
    if (fraseMotivaional) {
        fraseMotivaional.style.transition = 'opacity 0.3s ease-in-out';
    }
    
    // Event listener para botón de perfil
    const profileBtn = document.getElementById('profileBtn');
    if (profileBtn) {
        profileBtn.addEventListener('click', () => {
    window.location.href = './perfil.html';
});
    }
});

// Actualizar saludo cada minuto por si cambia la hora
setInterval(() => {
    if (saludoHorario) {
        const nuevoSaludo = obtenerSaludoPorHorario();
        if (saludoHorario.textContent !== nuevoSaludo) {
            saludoHorario.textContent = nuevoSaludo;
        }
    }
}, 60000); // 1 minuto
