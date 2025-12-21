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
            <input type="number" class="tema-paginas" min="1" placeholder="Páginas" />
        `;
        container.appendChild(div);
    }
}

window.finalizarPlanning = async function() {
    const temas = [];
    const inputs = document.querySelectorAll('.tema-input-grupo');
    
    let index = 0;
    for (let input of inputs) {
        const nombre = input.querySelector('.tema-nombre').value.trim();
        const paginas = parseInt(input.querySelector('.tema-paginas').value);
        
        if (!paginas || paginas < 1) {
            alert('Por favor, indica el número de páginas de todos los temas');
            return;
        }
        
        temas.push({ 
            nombre, 
            paginas,
            id: `tema_${currentUser.uid}_${index}_${Date.now()}`
        });
        
        index++;
    }
    
    datosPlanning.temas = temas;
    
    try {
        const paginasTotales = temas.reduce((sum, t) => sum + t.paginas, 0);
        
        await setDoc(doc(db, "planningSimple", currentUser.uid), {
            numTemas: datosPlanning.numTemas,
            fechaObjetivo: datosPlanning.fechaObjetivo,
            temas: temas,
            paginasTotales,
            fechaCreacion: new Date(),
            usuarioId: currentUser.uid
        });
        
        const progresoInicial = {
            usuarioId: currentUser.uid,
            temas: {},
            registros: [],
            fechaCreacion: new Date()
        };
        
        temas.forEach(tema => {
            progresoInicial.temas[tema.id] = {
                nombre: tema.nombre,
                paginasTotales: tema.paginas,
                paginasLeidas: 0,
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
