import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;
let datosPlanning = {
    numTemas: 0,
    fechaObjetivo: null,
    temas: []
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
    
    guardarDatosPaso(pasoActual);
    
    if (pasoActual === 2) {
        generarListaTemas();
    }
    
    document.getElementById(`paso${pasoActual}`).classList.remove('activo');
    document.getElementById(`paso${pasoActual + 1}`).classList.add('activo');
}

window.anteriorPaso = function(pasoActual) {
    document.getElementById(`paso${pasoActual}`).classList.remove('activo');
    document.getElementById(`paso${pasoActual - 1}`).classList.add('activo');
}

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
            
        default:
            return true;
    }
}

function guardarDatosPaso(paso) {
    switch(paso) {
        case 1:
            datosPlanning.numTemas = parseInt(document.getElementById('numTemas').value);
            break;
            
        case 2:
            datosPlanning.fechaObjetivo = document.getElementById('fechaObjetivo').value;
            break;
    }
}

function generarListaTemas() {
    const container = document.getElementById('listaTemas');
    container.innerHTML = '';
    
    for (let i = 0; i < datosPlanning.numTemas; i++) {
        const div = document.createElement('div');
        div.className = 'tema-input-grupo';
        div.innerHTML = `
            <input type="text" class="tema-nombre" value="Tema ${i + 1}" readonly style="background: #f3f4f6; cursor: not-allowed;" />
            <input type="number" class="tema-paginas" min="1" placeholder="Hojas" />
        `;
        container.appendChild(div);
    }
}

// Omitir configuración de hojas
window.omitirHojas = function() {
    const temas = [];
    const inputs = document.querySelectorAll('.tema-input-grupo');
    
    let index = 0;
    for (let input of inputs) {
        const nombre = input.querySelector('.tema-nombre').value.trim();
        
        temas.push({ 
            nombre, 
            hojas: 0,
            id: `tema_${currentUser.uid}_${index}_${Date.now()}`
        });
        
        index++;
    }
    
    datosPlanning.temas = temas;
    
    document.getElementById('paso3').classList.remove('activo');
    document.getElementById('paso4').classList.add('activo');
}

window.finalizarPlanning = async function() {
    const testsDiarios = parseInt(document.getElementById('testsDiarios').value);
    
    if (testsDiarios === null || testsDiarios < 0) {
        alert('Por favor, indica los tests diarios (0 si no quieres hacer tests)');
        return;
    }
    
    // Si no hay temas ya guardados (no vino de omitir)
    if (datosPlanning.temas.length === 0) {
        const temas = [];
        const inputs = document.querySelectorAll('.tema-input-grupo');
        
        let index = 0;
        for (let input of inputs) {
            const nombre = input.querySelector('.tema-nombre').value.trim();
            const hojas = parseInt(input.querySelector('.tema-paginas').value) || 0;
            
            temas.push({ 
                nombre, 
                hojas,
                id: `tema_${currentUser.uid}_${index}_${Date.now()}`
            });
            
            index++;
        }
        
        datosPlanning.temas = temas;
    }
    
    try {
        const hojasTotales = datosPlanning.temas.reduce((sum, t) => sum + t.hojas, 0);
        
        // Calcular días hasta fecha objetivo
        const fechaObj = new Date(datosPlanning.fechaObjetivo);
        const hoy = new Date();
        const diasDisponibles = Math.max(1, Math.ceil((fechaObj - hoy) / (1000 * 60 * 60 * 24)));
        
        // Calcular tests totales necesarios (1 test cada 2 días como mínimo)
        const testsRecomendados = Math.ceil(diasDisponibles * testsDiarios);
        
        await setDoc(doc(db, "planningSimple", currentUser.uid), {
            numTemas: datosPlanning.numTemas,
            fechaObjetivo: datosPlanning.fechaObjetivo,
            temas: datosPlanning.temas,
            hojasTotales,
            testsDiarios,
            testsRecomendados,
            fechaCreacion: new Date(),
            usuarioId: currentUser.uid
        });
        
        const progresoInicial = {
            usuarioId: currentUser.uid,
            temas: {},
            registros: [],
            fechaCreacion: new Date()
        };
        
        datosPlanning.temas.forEach(tema => {
            progresoInicial.temas[tema.id] = {
                nombre: tema.nombre,
                hojasTotales: tema.hojas,
                hojasLeidas: 0,
                testsRealizados: 0
            };
        });
        
        await setDoc(doc(db, "progresoSimple", currentUser.uid), progresoInicial);
        
        alert('✅ Planning creado correctamente');
        window.location.href = 'homepage.html';
        
    } catch (error) {
        console.error('Error guardando planning:', error);
        alert('Error al guardar el planning: ' + error.message);
    }
}
