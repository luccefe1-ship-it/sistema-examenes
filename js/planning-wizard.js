import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;
let datosPlanning = {
    numTemas: 0,
    fechaObjetivo: null,
    temas: [],
    temasActivos: [],
    paginasDiarias: 0,
    testsDiarios: 0
};

// Verificar autenticación
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        try {
            const userDoc = await getDoc(doc(db, "usuarios", user.uid));
            if (userDoc.exists()) {
                document.getElementById('userName').textContent = userDoc.data().nombre;
            }
        } catch (error) {
            console.error('Error cargando usuario:', error);
        }
    } else {
        window.location.href = 'index.html';
    }
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = 'index.html';
});

// Navegar entre pasos
window.siguientePaso = function(pasoActual) {
    if (!validarPaso(pasoActual)) return;
    
    // Guardar datos del paso actual
    guardarDatosPaso(pasoActual);
    
    // Si es el paso 3, generar la lista de temas
    if (pasoActual === 2) {
        generarListaTemas();
    }
    
    // Si es el paso 4, generar selección de temas
    if (pasoActual === 3) {
        generarSeleccionTemas();
    }
    
    // Ocultar paso actual y mostrar siguiente
    document.getElementById(`paso${pasoActual}`).classList.remove('activo');
    document.getElementById(`paso${pasoActual + 1}`).classList.add('activo');
}

window.anteriorPaso = function(pasoActual) {
    document.getElementById(`paso${pasoActual}`).classList.remove('activo');
    document.getElementById(`paso${pasoActual - 1}`).classList.add('activo');
}

// Validar cada paso
function validarPaso(paso) {
    switch(paso) {
        case 1:
            const numTemas = parseInt(document.getElementById('numTemas').value);
            if (!numTemas || numTemas < 1) {
                alert('Por favor, indica el número de temas');
                return false;
            }
            return true;
            
        case 2:
            const fecha = document.getElementById('fechaObjetivo').value;
            if (!fecha) {
                alert('Por favor, selecciona una fecha objetivo');
                return false;
            }
            const fechaObj = new Date(fecha);
            const hoy = new Date();
            if (fechaObj <= hoy) {
                alert('La fecha objetivo debe ser futura');
                return false;
            }
            return true;
            
        case 3:
            const temas = [];
            const inputs = document.querySelectorAll('.tema-input-grupo');
            for (let input of inputs) {
                const nombre = input.querySelector('.tema-nombre').value.trim();
                const paginas = parseInt(input.querySelector('.tema-paginas').value);
                
                if (!nombre) {
                    alert('Por favor, completa el nombre de todos los temas');
                    return false;
                }
                if (!paginas || paginas < 1) {
                    alert('Por favor, indica el número de páginas de todos los temas');
                    return false;
                }
                temas.push({ nombre, paginas });
            }
            return true;
            
        case 4:
            const checkboxes = document.querySelectorAll('.tema-checkbox input[type="checkbox"]:checked');
            if (checkboxes.length === 0) {
                alert('Por favor, selecciona al menos un tema activo');
                return false;
            }
            return true;
            
        default:
            return true;
    }
}

// Guardar datos de cada paso
function guardarDatosPaso(paso) {
    switch(paso) {
        case 1:
            datosPlanning.numTemas = parseInt(document.getElementById('numTemas').value);
            break;
            
        case 2:
            datosPlanning.fechaObjetivo = document.getElementById('fechaObjetivo').value;
            break;
            
        case 3:
            datosPlanning.temas = [];
            const inputs = document.querySelectorAll('.tema-input-grupo');
            inputs.forEach(input => {
                const nombre = input.querySelector('.tema-nombre').value.trim();
                const paginas = parseInt(input.querySelector('.tema-paginas').value);
                datosPlanning.temas.push({ 
                    nombre, 
                    paginas,
                    id: `tema_${Date.now()}_${Math.random()}`
                });
            });
            break;
            
        case 4:
            datosPlanning.temasActivos = [];
            const checkboxes = document.querySelectorAll('.tema-checkbox input[type="checkbox"]:checked');
            checkboxes.forEach(cb => {
                datosPlanning.temasActivos.push(cb.value);
            });
            break;
    }
}

// Generar lista de temas en paso 3
function generarListaTemas() {
    const container = document.getElementById('listaTemas');
    container.innerHTML = '';
    
    for (let i = 0; i < datosPlanning.numTemas; i++) {
        const div = document.createElement('div');
        div.className = 'tema-input-grupo';
        div.innerHTML = `
            <input type="text" class="tema-nombre" placeholder="Nombre del tema ${i + 1}" />
            <input type="number" class="tema-paginas" min="1" placeholder="Páginas" />
        `;
        container.appendChild(div);
    }
}

// Generar selección de temas en paso 4
function generarSeleccionTemas() {
    const container = document.getElementById('seleccionTemas');
    container.innerHTML = '<p style="margin-bottom: 20px;">Marca los temas que estás estudiando actualmente:</p>';
    
    datosPlanning.temas.forEach(tema => {
        const div = document.createElement('div');
        div.className = 'tema-checkbox';
        div.innerHTML = `
            <input type="checkbox" value="${tema.nombre}" id="tema_${tema.nombre}" />
            <label for="tema_${tema.nombre}">${tema.nombre} (${tema.paginas} páginas)</label>
        `;
        container.appendChild(div);
    });
}

// Finalizar y guardar planning
window.finalizarPlanning = async function() {
    const paginasDiarias = parseInt(document.getElementById('paginasDiarias').value);
    const testsDiarios = parseInt(document.getElementById('testsDiarios').value);
    
    if (!paginasDiarias || paginasDiarias < 1) {
        alert('Por favor, indica las páginas diarias');
        return;
    }
    
    if (testsDiarios === null || testsDiarios < 0) {
        alert('Por favor, indica los tests diarios');
        return;
    }
    
    datosPlanning.paginasDiarias = paginasDiarias;
    datosPlanning.testsDiarios = testsDiarios;
    
    try {
        // Guardar en Firebase
        await setDoc(doc(db, "planningSimple", currentUser.uid), {
            ...datosPlanning,
            fechaCreacion: new Date(),
            usuarioId: currentUser.uid
        });
        
        // Inicializar progreso
        const progresoInicial = {
            usuarioId: currentUser.uid,
            temas: {},
            registros: [],
            fechaCreacion: new Date()
        };
        
        datosPlanning.temas.forEach(tema => {
            progresoInicial.temas[tema.id] = {
                nombre: tema.nombre,
                paginasTotales: tema.paginas,
                paginasLeidas: 0,
                testsRealizados: 0,
                activo: datosPlanning.temasActivos.includes(tema.nombre)
            };
        });
        
        await setDoc(doc(db, "progresoSimple", currentUser.uid), progresoInicial);
        
        alert('✅ Planning creado correctamente');
        window.location.href = 'homepage.html';
        
    } catch (error) {
        console.error('Error guardando planning:', error);
        alert('Error al guardar el planning');
    }
}
