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
        cargarTemasSelect();
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
    
    // Calcular días restantes hasta fecha objetivo
    const fechaObjetivo = new Date(planningData.fechaObjetivo);
    const hoy = new Date();
    const diasRestantes = Math.max(0, Math.ceil((fechaObjetivo - hoy) / (1000 * 60 * 60 * 24)));
    
    // Calcular ritmo necesario
    let mensajeRitmo = '';
    if (paginasRestantes > 0 && diasRestantes > 0) {
        const paginasPorDia = (paginasRestantes / diasRestantes).toFixed(1);
        mensajeRitmo = `📊 Debes leer ${paginasPorDia} páginas/día para llegar a tu objetivo`;
    } else if (paginasRestantes === 0) {
        mensajeRitmo = '🎉 ¡Has completado todo el temario!';
    } else if (diasRestantes === 0) {
        mensajeRitmo = '⚠️ La fecha objetivo ya pasó';
    }
    
    document.getElementById('paginasTotales').textContent = paginasLeidas;
    document.getElementById('paginasRestantes').textContent = paginasRestantes;
    document.getElementById('testsTotales').textContent = testsRealizados;
    document.getElementById('porcentajeCompleto').textContent = `${porcentaje}%`;
    document.getElementById('barraProgresoGeneral').style.width = `${porcentaje}%`;
    
    // Mostrar mensaje de ritmo
    const resumenGeneral = document.querySelector('.resumen-general');
    let alertaRitmo = document.getElementById('alertaRitmo');
    if (!alertaRitmo) {
        alertaRitmo = document.createElement('div');
        alertaRitmo.id = 'alertaRitmo';
        alertaRitmo.style.cssText = 'margin-top: 20px; padding: 15px; background: #f0f9ff; border-left: 4px solid #667eea; border-radius: 8px; font-size: 16px; font-weight: 600; color: #333;';
        resumenGeneral.appendChild(alertaRitmo);
    }
    alertaRitmo.textContent = mensajeRitmo;
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
    // Eliminar último registro
window.eliminarUltimoRegistro = async function() {
    if (!confirm('¿Eliminar el último registro guardado?')) return;
    
    try {
        if (!progresoData.registros || progresoData.registros.length === 0) {
            alert('No hay registros para eliminar');
            return;
        }
        
        // Obtener último registro
        const ultimoRegistro = progresoData.registros[progresoData.registros.length - 1];
        
        // Revertir cambios en el tema
        const tema = progresoData.temas[ultimoRegistro.temaId];
        if (tema) {
            tema.paginasLeidas = Math.max(0, tema.paginasLeidas - ultimoRegistro.paginasLeidas);
            tema.testsRealizados = Math.max(0, tema.testsRealizados - ultimoRegistro.testsRealizados);
        }
        
        // Eliminar último registro
        progresoData.registros.pop();
        
        // Guardar en Firebase
        await setDoc(doc(db, "progresoSimple", currentUser.uid), progresoData);
        
        alert('✅ Último registro eliminado');
        
        // Actualizar interfaz
        actualizarResumenGeneral();
        renderizarProgresoTemas();
        
    } catch (error) {
        console.error('Error eliminando registro:', error);
        alert('Error al eliminar el registro');
    }
}

// Eliminar todo el progreso (mantener planning)
window.eliminarTodoProgreso = async function() {
    if (!confirm('⚠️ ¿Borrar TODO el progreso? Se mantendrá el planning configurado.')) return;
    if (!confirm('Esta acción NO se puede deshacer. ¿Continuar?')) return;
    
    try {
        // Resetear progreso
        const progresoInicial = {
            usuarioId: currentUser.uid,
            temas: {},
            registros: [],
            fechaCreacion: new Date()
        };
        
        planningData.temas.forEach(tema => {
            progresoInicial.temas[tema.id] = {
                nombre: tema.nombre,
                paginasTotales: tema.paginas,
                paginasLeidas: 0,
                testsRealizados: 0
            };
        });
        
        await setDoc(doc(db, "progresoSimple", currentUser.uid), progresoInicial);
        
        alert('✅ Progreso eliminado correctamente');
        window.location.reload();
        
    } catch (error) {
        console.error('Error eliminando progreso:', error);
        alert('Error al eliminar el progreso');
    }
}

// Eliminar planning completo
window.eliminarPlanning = async function() {
    if (!confirm('⚠️ ¿Eliminar el planning COMPLETO? Perderás toda la configuración y progreso.')) return;
    if (!confirm('Esta acción NO se puede deshacer. ¿Continuar?')) return;
    
    try {
        // Eliminar planning y progreso
        await setDoc(doc(db, "planningSimple", currentUser.uid), {
            eliminado: true,
            fechaEliminacion: new Date()
        });
        
        await setDoc(doc(db, "progresoSimple", currentUser.uid), {
            eliminado: true,
            fechaEliminacion: new Date()
        });
        
        alert('✅ Planning eliminado. Serás redirigido a la página principal.');
        window.location.href = 'homepage.html';
        
    } catch (error) {
        console.error('Error eliminando planning:', error);
        alert('Error al eliminar el planning');
    }
}
});
