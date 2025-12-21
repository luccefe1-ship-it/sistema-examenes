import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;
let planningData = null;
let progresoData = null;

// Verificar autenticación
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        try {
            const userDoc = await getDoc(doc(db, "usuarios", user.uid));
            if (userDoc.exists()) {
                document.getElementById('userName').textContent = userDoc.data().nombre;
            }
            
            await cargarDatos();
            
        } catch (error) {
            console.error('Error:', error);
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

// Cargar datos
async function cargarDatos() {
    try {
        // Cargar planning
        const planningDoc = await getDoc(doc(db, "planningSimple", currentUser.uid));
        if (!planningDoc.exists()) {
            alert('No tienes un planning configurado');
            window.location.href = 'homepage.html';
            return;
        }
        planningData = planningDoc.data();
        
        // Cargar progreso
        const progresoDoc = await getDoc(doc(db, "progresoSimple", currentUser.uid));
        if (progresoDoc.exists()) {
            progresoData = progresoDoc.data();
        } else {
            progresoData = { temas: {}, registros: [] };
        }
        
        // Renderizar interfaz
        cargarTemasSe lect();
        actualizarResumenGeneral();
        renderizarProgresoTemas();
        
    } catch (error) {
        console.error('Error cargando datos:', error);
    }
}

// Cargar temas en el select
function cargarTemasSelect() {
    const select = document.getElementById('temaActual');
    select.innerHTML = '<option value="">Selecciona un tema...</option>';
    
    planningData.temas.forEach(tema => {
        const option = document.createElement('option');
        option.value = tema.id;
        option.textContent = tema.nombre;
        select.appendChild(option);
    });
}

// Actualizar resumen general
function actualizarResumenGeneral() {
    let paginasLeidas = 0;
    let paginasTotales = 0;
    let testsRealizados = 0;
    
    planningData.temas.forEach(tema => {
        const progreso = progresoData.temas[tema.id];
        if (progreso) {
            paginasLeidas += progreso.paginasLeidas || 0;
            testsRealizados += progreso.testsRealizados || 0;
        }
        paginasTotales += tema.paginas;
    });
    
    const paginasRestantes = Math.max(0, paginasTotales - paginasLeidas);
    const porcentaje = paginasTotales > 0 ? Math.round((paginasLeidas / paginasTotales) * 100) : 0;
    
    document.getElementById('paginasTotales').textContent = paginasLeidas;
    document.getElementById('paginasRestantes').textContent = paginasRestantes;
    document.getElementById('testsTotales').textContent = testsRealizados;
    document.getElementById('porcentajeCompleto').textContent = `${porcentaje}%`;
    document.getElementById('barraProgresoGeneral').style.width = `${porcentaje}%`;
}

// Renderizar progreso por temas
function renderizarProgresoTemas() {
    const container = document.getElementById('listaTemas');
    container.innerHTML = '';
    
    planningData.temas.forEach(tema => {
        const progreso = progresoData.temas[tema.id] || {
            paginasLeidas: 0,
            testsRealizados: 0,
            activo: false
        };
        
        const porcentaje = tema.paginas > 0 ? Math.round((progreso.paginasLeidas / tema.paginas) * 100) : 0;
        
        const div = document.createElement('div');
        div.className = 'tema-item';
        div.innerHTML = `
            <div class="tema-header">
                <div class="tema-nombre">${tema.nombre}</div>
                ${progreso.activo ? '<span class="tema-activo">Activo</span>' : ''}
            </div>
            <div class="tema-stats">
                <div class="tema-stat">
                    📄 Páginas: <strong>${progreso.paginasLeidas || 0} / ${tema.paginas}</strong>
                </div>
                <div class="tema-stat">
                    ✅ Tests: <strong>${progreso.testsRealizados || 0}</strong>
                </div>
            </div>
            <div class="tema-barra">
                <div class="tema-barra-fill" style="width: ${porcentaje}%"></div>
            </div>
        `;
        container.appendChild(div);
    });
}

// Registrar progreso
document.getElementById('formRegistro').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const temaId = document.getElementById('temaActual').value;
    const paginasHoy = parseInt(document.getElementById('paginasHoy').value) || 0;
    const testsHoy = parseInt(document.getElementById('testsHoy').value) || 0;
    
    if (!temaId) {
        alert('Por favor, selecciona un tema');
        return;
    }
    
    try {
        // Actualizar progreso del tema
        if (!progresoData.temas[temaId]) {
            const tema = planningData.temas.find(t => t.id === temaId);
            progresoData.temas[temaId] = {
                nombre: tema.nombre,
                paginasTotales: tema.paginas,
                paginasLeidas: 0,
                testsRealizados: 0,
                activo: planningData.temasActivos.includes(tema.nombre)
            };
        }
        
        progresoData.temas[temaId].paginasLeidas += paginasHoy;
        progresoData.temas[temaId].testsRealizados += testsHoy;
        
        // Añadir registro
        if (!progresoData.registros) {
            progresoData.registros = [];
        }
        
        progresoData.registros.push({
            fecha: new Date(),
            temaId: temaId,
            paginasLeidas: paginasHoy,
            testsRealizados: testsHoy
        });
        
        // Guardar en Firebase
        await setDoc(doc(db, "progresoSimple", currentUser.uid), progresoData);
        
        alert('✅ Progreso guardado correctamente');
        
        // Limpiar formulario
        document.getElementById('formRegistro').reset();
        
        // Actualizar interfaz
        actualizarResumenGeneral();
        renderizarProgresoTemas();
        
    } catch (error) {
        console.error('Error guardando progreso:', error);
        alert('Error al guardar el progreso');
    }
});
