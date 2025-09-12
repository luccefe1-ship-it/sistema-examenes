import { auth, db } from './firebase-config.js';
import { 
    signOut, 
    onAuthStateChanged, 
    updateEmail, 
    updatePassword, 
    reauthenticateWithCredential, 
    EmailAuthProvider,
    deleteUser
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    doc, 
    getDoc, 
    setDoc, 
    collection, 
    getDocs, 
    query, 
    where, 
    writeBatch 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Variables globales
let currentUser = null;
let userData = null;

// Elementos del DOM
const userNameSpan = document.getElementById('userName');
const backBtn = document.getElementById('backBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userDisplayName = document.getElementById('userDisplayName');
const userEmail = document.getElementById('userEmail');
const userInitials = document.getElementById('userInitials');
const fechaRegistro = document.getElementById('fechaRegistro');
const testsRealizados = document.getElementById('testsRealizados');
const puntuacionTotal = document.getElementById('puntuacionTotal');
const rachaActual = document.getElementById('rachaActual');

// Elementos de modales
const editarInfoBtn = document.getElementById('editarInfoBtn');
const cambiarPasswordBtn = document.getElementById('cambiarPasswordBtn');
const eliminarCuentaBtn = document.getElementById('eliminarCuentaBtn');

const modalEditarInfo = document.getElementById('modalEditarInfo');
const modalCambiarPassword = document.getElementById('modalCambiarPassword');
const modalEliminarCuenta = document.getElementById('modalEliminarCuenta');

const editarInfoForm = document.getElementById('editarInfoForm');
const cambiarPasswordForm = document.getElementById('cambiarPasswordForm');

const editNombre = document.getElementById('editNombre');
const editEmail = document.getElementById('editEmail');
const currentPassword = document.getElementById('currentPassword');
const newPassword = document.getElementById('newPassword');
const confirmPassword = document.getElementById('confirmPassword');
const confirmDeleteText = document.getElementById('confirmDeleteText');
const deletePassword = document.getElementById('deletePassword');
const confirmarEliminarBtn = document.getElementById('confirmarEliminarBtn');

// Verificar autenticación
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        console.log('Usuario autenticado:', user.email);
        await cargarDatosUsuario();
        setupEventListeners();
    } else {
        window.location.href = 'index.html';
    }
});

// Cargar datos del usuario
async function cargarDatosUsuario() {
    try {
        const userDoc = await getDoc(doc(db, "usuarios", currentUser.uid));
        
        if (userDoc.exists()) {
            userData = userDoc.data();
            
            // Mostrar información básica
            userNameSpan.textContent = userData.nombre;
            userDisplayName.textContent = userData.nombre;
            userEmail.textContent = userData.email;
            
            // Mostrar iniciales del nombre
            const iniciales = userData.nombre.split(' ')
                .map(nombre => nombre.charAt(0))
                .slice(0, 2)
                .join('');
            userInitials.textContent = iniciales.toUpperCase();
            
            // Mostrar fecha de registro
            if (userData.fechaRegistro) {
                const fecha = userData.fechaRegistro.toDate();
                fechaRegistro.textContent = fecha.toLocaleDateString('es-ES', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            }
            
            // Mostrar estadísticas
            const progreso = userData.progreso || {};
            testsRealizados.textContent = progreso.testsRealizados || 0;
            puntuacionTotal.textContent = progreso.puntuacionTotal || 0;
            rachaActual.textContent = progreso.racha || 0;
            
        } else {
            // Si no hay documento, usar datos básicos del auth
            userNameSpan.textContent = currentUser.email;
            userDisplayName.textContent = currentUser.email.split('@')[0];
            userEmail.textContent = currentUser.email;
            userInitials.textContent = currentUser.email.charAt(0).toUpperCase();
        }
    } catch (error) {
        console.error('Error cargando datos:', error);
        // ELIMINADO: mostrarMensaje('Error al cargar datos del usuario', 'error');
        // Usar datos básicos como fallback silencioso
        userNameSpan.textContent = currentUser.email;
        userDisplayName.textContent = currentUser.email.split('@')[0];
        userEmail.textContent = currentUser.email;
        userInitials.textContent = currentUser.email.charAt(0).toUpperCase();
    }
}

// Configurar event listeners
function setupEventListeners() {
    // Navegación
    backBtn.addEventListener('click', () => {
        window.location.href = 'homepage.html';
    });

    logoutBtn.addEventListener('click', async () => {
        try {
            await signOut(auth);
            window.location.href = 'index.html';
        } catch (error) {
            console.error('Error al cerrar sesión:', error);
            mostrarMensaje('Error al cerrar sesión', 'error');
        }
    });

    // Botones principales
    editarInfoBtn.addEventListener('click', abrirModalEditarInfo);
    cambiarPasswordBtn.addEventListener('click', abrirModalCambiarPassword);
    eliminarCuentaBtn.addEventListener('click', abrirModalEliminarCuenta);

    // Cerrar modales
    document.getElementById('closeEditModal').addEventListener('click', cerrarModales);
    document.getElementById('closePasswordModal').addEventListener('click', cerrarModales);
    document.getElementById('cancelEditBtn').addEventListener('click', cerrarModales);
    document.getElementById('cancelPasswordBtn').addEventListener('click', cerrarModales);
    document.getElementById('cancelDeleteBtn').addEventListener('click', cerrarModales);

    // Formularios
    editarInfoForm.addEventListener('submit', guardarCambiosInfo);
    cambiarPasswordForm.addEventListener('submit', cambiarContrasena);

    // Validación para eliminar cuenta
    confirmDeleteText.addEventListener('input', validarEliminacion);
    deletePassword.addEventListener('input', validarEliminacion);
    confirmarEliminarBtn.addEventListener('click', eliminarCuenta);

    // Cerrar modales al hacer clic fuera
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            cerrarModales();
        }
    });
}

// Abrir modal de editar información
function abrirModalEditarInfo() {
    editNombre.value = userData?.nombre || currentUser.email.split('@')[0];
    editEmail.value = currentUser.email;
    modalEditarInfo.style.display = 'flex';
}

// Abrir modal de cambiar contraseña
function abrirModalCambiarPassword() {
    cambiarPasswordForm.reset();
    modalCambiarPassword.style.display = 'flex';
}

// Abrir modal de eliminar cuenta
function abrirModalEliminarCuenta() {
    confirmDeleteText.value = '';
    deletePassword.value = '';
    confirmarEliminarBtn.disabled = true;
    modalEliminarCuenta.style.display = 'flex';
}

// Cerrar todos los modales
function cerrarModales() {
    modalEditarInfo.style.display = 'none';
    modalCambiarPassword.style.display = 'none';
    modalEliminarCuenta.style.display = 'none';
}

// Guardar cambios de información personal
async function guardarCambiosInfo(e) {
    e.preventDefault();
    
    const nuevoNombre = editNombre.value.trim();
    const nuevoEmail = editEmail.value.trim();
    
    if (!nuevoNombre || !nuevoEmail) {
        mostrarMensaje('Por favor completa todos los campos', 'error');
        return;
    }
    
    try {
        mostrarMensaje('Guardando cambios...', 'warning');
        
        // Actualizar email en Firebase Auth si cambió
        if (nuevoEmail !== currentUser.email) {
            await updateEmail(currentUser, nuevoEmail);
        }
        
        // CORREGIDO: Usar setDoc en lugar de updateDoc para crear el documento si no existe
        await setDoc(doc(db, "usuarios", currentUser.uid), {
            nombre: nuevoNombre,
            email: nuevoEmail,
            fechaRegistro: userData?.fechaRegistro || new Date(),
            progreso: userData?.progreso || {
                testsRealizados: 0,
                puntuacionTotal: 0,
                racha: 0
            }
        });
        
        // Actualizar datos locales
        userData = {
            nombre: nuevoNombre,
            email: nuevoEmail,
            fechaRegistro: userData?.fechaRegistro || new Date(),
            progreso: userData?.progreso || { testsRealizados: 0, puntuacionTotal: 0, racha: 0 }
        };
        
        // Actualizar UI
        userDisplayName.textContent = nuevoNombre;
        userEmail.textContent = nuevoEmail;
        userNameSpan.textContent = nuevoNombre;
        
        // Actualizar iniciales
        const iniciales = nuevoNombre.split(' ')
            .map(nombre => nombre.charAt(0))
            .slice(0, 2)
            .join('');
        userInitials.textContent = iniciales.toUpperCase();
        
        cerrarModales();
        mostrarMensaje('Información actualizada correctamente', 'success');
        
    } catch (error) {
        console.error('Error actualizando información:', error);
        let mensaje = 'Error al actualizar información';
        
        if (error.code === 'auth/requires-recent-login') {
            mensaje = 'Por seguridad, inicia sesión nuevamente para cambiar el email';
        } else if (error.code === 'auth/email-already-in-use') {
            mensaje = 'Este email ya está en uso por otra cuenta';
        } else if (error.code === 'auth/invalid-email') {
            mensaje = 'El email ingresado no es válido';
        }
        
        mostrarMensaje(mensaje, 'error');
    }
}

// Cambiar contraseña
async function cambiarContrasena(e) {
    e.preventDefault();
    
    const passwordActual = currentPassword.value;
    const nuevaPassword = newPassword.value;
    const confirmarNueva = confirmPassword.value;
    
    if (!passwordActual || !nuevaPassword || !confirmarNueva) {
        mostrarMensaje('Por favor completa todos los campos', 'error');
        return;
    }
    
    if (nuevaPassword !== confirmarNueva) {
        mostrarMensaje('Las contraseñas no coinciden', 'error');
        return;
    }
    
    if (nuevaPassword.length < 6) {
        mostrarMensaje('La nueva contraseña debe tener al menos 6 caracteres', 'error');
        return;
    }
    
    try {
        // Reautenticar usuario
        const credential = EmailAuthProvider.credential(currentUser.email, passwordActual);
        await reauthenticateWithCredential(currentUser, credential);
        
        // Cambiar contraseña
        await updatePassword(currentUser, nuevaPassword);
        
        cerrarModales();
        mostrarMensaje('Contraseña cambiada correctamente', 'success');
        
    } catch (error) {
        console.error('Error cambiando contraseña:', error);
        let mensaje = 'Error al cambiar contraseña';
        
        if (error.code === 'auth/wrong-password') {
            mensaje = 'La contraseña actual es incorrecta';
        } else if (error.code === 'auth/weak-password') {
            mensaje = 'La nueva contraseña es muy débil';
        }
        
        mostrarMensaje(mensaje, 'error');
    }
}

// Validar campos para habilitar botón de eliminar cuenta
function validarEliminacion() {
    const textoConfirmacion = confirmDeleteText.value.trim();
    const password = deletePassword.value.trim();
    
    const esValido = textoConfirmacion === 'ELIMINAR CUENTA' && password.length > 0;
    confirmarEliminarBtn.disabled = !esValido;
}

// Eliminar cuenta
async function eliminarCuenta() {
    const password = deletePassword.value;
    
    try {
        mostrarMensaje('Eliminando cuenta...', 'warning');
        
        // Reautenticar antes de eliminar
        const credential = EmailAuthProvider.credential(currentUser.email, password);
        await reauthenticateWithCredential(currentUser, credential);
        
        // Eliminar todos los datos del usuario de Firestore
        await eliminarDatosUsuario();
        
        // Eliminar cuenta de Firebase Auth
        await deleteUser(currentUser);
        
        mostrarMensaje('Cuenta eliminada correctamente. Serás redirigido...', 'success');
        
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
        
    } catch (error) {
        console.error('Error eliminando cuenta:', error);
        let mensaje = 'Error al eliminar la cuenta';
        
        if (error.code === 'auth/wrong-password') {
            mensaje = 'La contraseña es incorrecta';
        } else if (error.code === 'auth/requires-recent-login') {
            mensaje = 'Por seguridad, inicia sesión nuevamente antes de eliminar la cuenta';
        }
        
        mostrarMensaje(mensaje, 'error');
    }
}

// Eliminar todos los datos del usuario de Firestore
async function eliminarDatosUsuario() {
    const batch = writeBatch(db);
    
    try {
        // Eliminar documento de usuario
        batch.delete(doc(db, "usuarios", currentUser.uid));
        
        // Eliminar todos los temas del usuario
        const temasQuery = query(collection(db, "temas"), where("usuarioId", "==", currentUser.uid));
        const temasSnapshot = await getDocs(temasQuery);
        
        temasSnapshot.forEach((documento) => {
            batch.delete(documento.ref);
        });
        
        // Eliminar todos los resultados de tests del usuario
        const resultadosQuery = query(collection(db, "resultados"), where("usuarioId", "==", currentUser.uid));
        const resultadosSnapshot = await getDocs(resultadosQuery);
        
        resultadosSnapshot.forEach((documento) => {
            batch.delete(documento.ref);
        });
        
        // Eliminar apuntes del usuario
        const apuntesQuery = query(collection(db, "apuntes"), where("usuarioId", "==", currentUser.uid));
        const apuntesSnapshot = await getDocs(apuntesQuery);
        
        apuntesSnapshot.forEach((documento) => {
            batch.delete(documento.ref);
        });
        
        // Ejecutar todas las eliminaciones
        await batch.commit();
        
        console.log('Todos los datos del usuario han sido eliminados');
        
    } catch (error) {
        console.error('Error eliminando datos del usuario:', error);
        throw error;
    }
}

// Mostrar mensajes
function mostrarMensaje(texto, tipo) {
    const mensaje = document.getElementById('message');
    mensaje.textContent = texto;
    mensaje.className = `message ${tipo}`;
    mensaje.style.display = 'block';
    mensaje.classList.add('show');
    
    // Ocultar mensaje después de 4 segundos
    setTimeout(() => {
        mensaje.classList.remove('show');
        setTimeout(() => {
            mensaje.style.display = 'none';
        }, 300);
    }, 4000);
}

console.log('perfil.js cargado correctamente');
