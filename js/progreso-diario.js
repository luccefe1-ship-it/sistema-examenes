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
        actualizarLimiteHojas();
        await mostrarTestsDeHoy();
        
    } catch (error) {
        console.error('Error cargando datos:', error);
    }
}

// Obtener tests realizados hoy
async function obtenerTestsDeHoy() {
    if (!progresoData || !progresoData.registros) return { testsUnicos: [], testsMix: 0 };
    
    const hoy = new Date();
    const hoyStr = hoy.toDateString();
    
    const registrosHoy = progresoData.registros.filter(registro => {
        const fechaRegistro = registro.fecha.toDate ? registro.fecha.toDate() : new Date(registro.fecha);
        return fechaRegistro.toDateString() === hoyStr && registro.testsRealizados > 0;
    });
    
    // Agrupar por temaId
    const testsPorTema = {};
    let testsMix = 0;
    
    registrosHoy.forEach(registro => {
        if (registro.temaId === 'mix') {
            testsMix += registro.testsRealizados;
        } else if (registro.temaId) {
            if (!testsPorTema[registro.temaId]) {
                testsPorTema[registro.temaId] = 0;
            }
            testsPorTema[registro.temaId] += registro.testsRealizados;
        }
    });
    
    // Convertir a array con nombres
    const testsUnicos = [];
    for (const temaId in testsPorTema) {
        let nombre = null;
        
        // Buscar nombre en planningData
        if (planningData && planningData.temas) {
            const tema = planningData.temas.find(t => t.id === temaId);
            if (tema) {
                nombre = tema.nombre;
            }
        }
        
        // Si no está en planningData, buscar en progresoData
        if (!nombre && progresoData && progresoData.temas && progresoData.temas[temaId]) {
            nombre = progresoData.temas[temaId].nombre;
        }
        
        if (nombre) {
            testsUnicos.push({
                temaId: temaId,
                nombre: nombre,
                cantidad: testsPorTema[temaId]
            });
        }
    }
    
    return {
        testsUnicos: testsUnicos,
        testsMix: testsMix
    };
}
    

// Mostrar mensaje de tests realizados hoy
async function mostrarTestsDeHoy() {
    const testsHoy = await obtenerTestsDeHoy();
    const container = document.getElementById('mensajeTestsHoy');
    
    if (!container) return;
    
    const totalTests = testsHoy.testsUnicos.reduce((sum, t) => sum + t.cantidad, 0) + testsHoy.testsMix;
    
    if (totalTests === 0) {
        container.style.display = 'none';
        return;
    }
    
    let partes = [];
    
    // Agregar tests de temas únicos
    testsHoy.testsUnicos.forEach(test => {
        const testStr = test.cantidad === 1 ? 'test' : 'tests';
        partes.push(`${test.cantidad} ${testStr} del ${test.nombre}`);
    });
    
    // Agregar tests mix
    if (testsHoy.testsMix > 0) {
        const testStr = testsHoy.testsMix === 1 ? 'test' : 'tests';
        partes.push(`${testsHoy.testsMix} ${testStr} Mix`);
    }
    
    let mensaje = '📊 Hoy has registrado ';
    if (partes.length === 1) {
        mensaje += partes[0];
    } else if (partes.length === 2) {
        mensaje += partes.join(' y ');
    } else {
        mensaje += partes.slice(0, -1).join(', ') + ' y ' + partes[partes.length - 1];
    }
    
    container.textContent = mensaje;
    container.style.display = 'block';
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
    
    // Agregar evento para actualizar límite de hojas
    select.addEventListener('change', actualizarLimiteHojas);
}

// Actualizar límite de hojas según tema seleccionado
function actualizarLimiteHojas() {
    const temaId = document.getElementById('temaActual').value;
    const inputHojas = document.getElementById('paginasHoy');
    
    if (!temaId) {
        inputHojas.max = '';
        return;
    }
    
    const tema = planningData.temas.find(t => t.id === temaId);
    if (!tema) return;
    
    const progreso = progresoData.temas[temaId] || { hojasLeidas: 0 };
    const hojasRestantes = Math.max(0, tema.hojas - (progreso.hojasLeidas || 0));
    
    inputHojas.max = hojasRestantes;
    inputHojas.placeholder = `Máximo: ${hojasRestantes}`;
}


function actualizarResumenGeneral() {
    let hojasLeidas = 0;
    let hojasTotales = 0;
    let testsRealizados = 0;
    
    // Sumar TODOS los tests desde TODOS los registros
    if (progresoData.registros) {
        testsRealizados = progresoData.registros.reduce((total, registro) => {
            return total + (registro.testsRealizados || 0);
        }, 0);
    }
    
    planningData.temas.forEach(tema => {
        const progreso = progresoData.temas[tema.id];
        if (progreso) {
            hojasLeidas += progreso.hojasLeidas || 0;
        }
        hojasTotales += tema.hojas;
    });
    
    const hojasRestantes = Math.max(0, hojasTotales - hojasLeidas);
    const porcentaje = hojasTotales > 0 ? Math.round((hojasLeidas / hojasTotales) * 100) : 0;
    
    // Calcular días restantes hasta fecha objetivo
    const fechaObjetivo = new Date(planningData.fechaObjetivo);
    const hoy = new Date();
    const diasRestantes = Math.max(0, Math.ceil((fechaObjetivo - hoy) / (1000 * 60 * 60 * 24)));
    
    // Calcular tests restantes
    const testsRecomendados = planningData.testsRecomendados || 0;
    const testsRestantes = Math.max(0, testsRecomendados - testsRealizados);
    
    // Calcular ritmo necesario
    let mensajeRitmo = '';
    if (hojasRestantes > 0 && diasRestantes > 0) {
        const hojasPorDia = (hojasRestantes / diasRestantes).toFixed(1);
        const testsPorDia = diasRestantes > 0 ? (testsRestantes / diasRestantes).toFixed(1) : 0;
        mensajeRitmo = `📊 Debes leer ${hojasPorDia} hojas/día y hacer ${testsPorDia} tests/día para llegar a tu objetivo`;
    } else if (hojasRestantes === 0 && testsRestantes === 0) {
        mensajeRitmo = '🎉 ¡Has completado todo el temario y los tests!';
    } else if (diasRestantes === 0) {
        mensajeRitmo = '⚠️ La fecha objetivo ya pasó';
    }
    
    document.getElementById('paginasTotales').textContent = `${hojasLeidas}/${hojasTotales}`;
    document.getElementById('paginasRestantes').textContent = hojasRestantes;
    document.getElementById('testsTotales').textContent = `${testsRealizados}/${testsRecomendados}`;
    
    // Formatear fecha objetivo
    const fechaObjetivoFormateada = fechaObjetivo.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    document.getElementById('fechaObjetivo').textContent = fechaObjetivoFormateada;
    document.getElementById('diasRestantes').textContent = `${diasRestantes} días restantes`;
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
    
    // Verificar temas sin hojas asignadas
    const temasSinHojas = planningData.temas.filter(t => !t.hojas || t.hojas === 0);
    let alertaTemasSinHojas = document.getElementById('alertaTemasSinHojas');
    
    if (temasSinHojas.length > 0) {
        if (!alertaTemasSinHojas) {
            alertaTemasSinHojas = document.createElement('div');
            alertaTemasSinHojas.id = 'alertaTemasSinHojas';
            alertaTemasSinHojas.style.cssText = 'margin-top: 15px; padding: 15px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px; font-size: 14px; color: #92400e;';
            resumenGeneral.appendChild(alertaTemasSinHojas);
        }
        alertaTemasSinHojas.innerHTML = `⚠️ <strong>Nota:</strong> Los datos mostrados son parciales. Hay ${temasSinHojas.length} tema(s) sin número de hojas asignado. Para obtener estadísticas precisas de tu progreso total, asigna el número de hojas a los temas restantes editándolos en la sección "Progreso por temas".`;
        alertaTemasSinHojas.style.display = 'block';
    } else {
        if (alertaTemasSinHojas) {
            alertaTemasSinHojas.style.display = 'none';
        }
    }
}

// Renderizar progreso por temas
// Renderizar progreso por temas
function renderizarProgresoTemas() {
    const container = document.getElementById('listaTemas');
    container.innerHTML = '';
    
    planningData.temas.forEach(tema => {
        const progreso = progresoData.temas[tema.id] || {
            hojasLeidas: 0,
            testsRealizados: 0
        };
        
        const porcentaje = tema.hojas > 0 ? Math.round((progreso.hojasLeidas / tema.hojas) * 100) : 0;
        
        const div = document.createElement('div');
        div.className = 'tema-item';
        div.innerHTML = `
            <div class="tema-header">
                <div class="tema-nombre" id="nombre-${tema.id}">${tema.nombre}</div>
                <button onclick="editarNombreTema('${tema.id}')" class="btn-editar-tema">✏️</button>
            </div>
            <div class="tema-stats">
                <div class="tema-stat">
                    📄 Hojas: <strong>${progreso.hojasLeidas || 0} / <span id="hojas-${tema.id}">${tema.hojas}</span></strong>
                    <button onclick="editarHojasTema('${tema.id}')" class="btn-editar-hojas">✏️</button>
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
    const hojasHoy = parseInt(document.getElementById('paginasHoy').value) || 0;
    const testsHoy = parseInt(document.getElementById('testsHoy').value) || 0;
    const paginaDesde = parseInt(document.getElementById('paginaDesde').value) || null;
    const paginaHasta = parseInt(document.getElementById('paginaHasta').value) || null;
    
    if (!temaId) {
        alert('Por favor, selecciona un tema');
        return;
    }
    
    // Validar páginas si se proporcionaron
    if ((paginaDesde && !paginaHasta) || (!paginaDesde && paginaHasta)) {
        alert('Debes especificar tanto la página inicial como la final');
        return;
    }
    
    if (paginaDesde && paginaHasta && paginaDesde > paginaHasta) {
        alert('La página inicial no puede ser mayor que la final');
        return;
    }
    
    try {
        // Obtener datos del tema
        const tema = planningData.temas.find(t => t.id === temaId);
        if (!tema) {
            alert('Error: tema no encontrado');
            return;
        }
        
        // Actualizar progreso del tema
        if (!progresoData.temas[temaId]) {
            progresoData.temas[temaId] = {
                nombre: tema.nombre,
                hojasTotales: tema.hojas,
                hojasLeidas: 0,
                testsRealizados: 0
            };
        }
        
        // Validar que no exceda el total de hojas del tema
        const hojasActuales = progresoData.temas[temaId].hojasLeidas || 0;
        const hojasRestantes = Math.max(0, tema.hojas - hojasActuales);
        
        if (hojasHoy > hojasRestantes) {
            alert(`⚠️ Este tema solo tiene ${hojasRestantes} hojas restantes.\nHojas totales: ${tema.hojas}\nYa leídas: ${hojasActuales}`);
            return;
        }
        
        progresoData.temas[temaId].hojasLeidas += hojasHoy;
        progresoData.temas[temaId].testsRealizados += testsHoy;
        
        // Añadir registro
        if (!progresoData.registros) {
            progresoData.registros = [];
        }
        
        const nuevoRegistro = {
            fecha: new Date(),
            temaId: temaId,
            temaNombre: tema.nombre,
            hojasLeidas: hojasHoy,
            testsRealizados: testsHoy
        };
        
        // Añadir páginas si se especificaron
        if (paginaDesde && paginaHasta) {
            nuevoRegistro.paginaDesde = paginaDesde;
            nuevoRegistro.paginaHasta = paginaHasta;
        }
        
        progresoData.registros.push(nuevoRegistro);
        
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

// Eliminar último registro
window.eliminarUltimoRegistro = async function() {
    if (!confirm('¿Eliminar el último registro guardado?')) return;
    
    try {
        if (!progresoData.registros || progresoData.registros.length === 0) {
            alert('No hay registros para eliminar');
            return;
        }
        
        // Eliminar último registro
        progresoData.registros.pop();
        
        // RECALCULAR todos los contadores desde registros
        for (const temaId in progresoData.temas) {
            progresoData.temas[temaId].testsRealizados = 0;
            progresoData.temas[temaId].hojasLeidas = 0;
        }
        
        progresoData.registros.forEach(registro => {
            if (registro.temaId && registro.temaId !== 'mix') {
                if (!progresoData.temas[registro.temaId]) {
                    progresoData.temas[registro.temaId] = { hojasLeidas: 0, testsRealizados: 0 };
                }
                progresoData.temas[registro.temaId].hojasLeidas += registro.hojasLeidas || 0;
                progresoData.temas[registro.temaId].testsRealizados += registro.testsRealizados || 0;
            }
        });
        
        // Guardar en Firebase
        await setDoc(doc(db, "progresoSimple", currentUser.uid), progresoData);
        
        alert('✅ Último registro eliminado');
        
        // Actualizar interfaz
        actualizarResumenGeneral();
        renderizarProgresoTemas();
        await mostrarTestsDeHoy();
        
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
        const { deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        
        // Eliminar completamente planning y progreso de Firebase
        await deleteDoc(doc(db, "planningSimple", currentUser.uid));
        await deleteDoc(doc(db, "progresoSimple", currentUser.uid));
        
        alert('✅ Planning eliminado. Serás redirigido a la página principal.');
        window.location.href = 'homepage.html';
        
    } catch (error) {
        console.error('Error eliminando planning:', error);
        alert('Error al eliminar el planning');
    }
}

// Editar nombre de tema
window.editarNombreTema = async function(temaId) {
    const nombreDiv = document.getElementById(`nombre-${temaId}`);
    const nombreActual = nombreDiv.textContent;
    
    const nuevoNombre = prompt('Nuevo nombre del tema:', nombreActual);
    
    if (!nuevoNombre || nuevoNombre === nombreActual) return;
    
    try {
        // Actualizar en planningData
        const tema = planningData.temas.find(t => t.id === temaId);
        if (tema) {
            tema.nombre = nuevoNombre;
        }
        
        // Actualizar en progresoData
        if (progresoData.temas[temaId]) {
            progresoData.temas[temaId].nombre = nuevoNombre;
        }
        
        // Guardar en Firebase
        await setDoc(doc(db, "planningSimple", currentUser.uid), planningData);
        await setDoc(doc(db, "progresoSimple", currentUser.uid), progresoData);
        
        // Actualizar interfaz
        cargarTemasSelect();
        renderizarProgresoTemas();
        
        alert('✅ Nombre actualizado');
        
    } catch (error) {
        console.error('Error actualizando nombre:', error);
        alert('Error al actualizar el nombre');
    }
}

// Editar hojas de tema
window.editarHojasTema = async function(temaId) {
    const tema = planningData.temas.find(t => t.id === temaId);
    if (!tema) return;
    
    const hojasActuales = tema.hojas;
    const nuevasHojas = prompt(`Número de hojas para ${tema.nombre}:`, hojasActuales);
    
    if (nuevasHojas === null || nuevasHojas === '') return;
    
    const nuevasHojasNum = parseInt(nuevasHojas);
    
    if (isNaN(nuevasHojasNum) || nuevasHojasNum < 0) {
        alert('Número de hojas inválido');
        return;
    }
    
    try {
        // Actualizar en planningData
        tema.hojas = nuevasHojasNum;
        
        // Recalcular hojas totales
        const hojasTotales = planningData.temas.reduce((sum, t) => sum + t.hojas, 0);
        planningData.hojasTotales = hojasTotales;
        
        // Actualizar en progresoData
        if (progresoData.temas[temaId]) {
            progresoData.temas[temaId].hojasTotales = nuevasHojasNum;
        }
        
        // Guardar en Firebase
        await setDoc(doc(db, "planningSimple", currentUser.uid), planningData);
        await setDoc(doc(db, "progresoSimple", currentUser.uid), progresoData);
        
        // Actualizar interfaz
        actualizarResumenGeneral();
        renderizarProgresoTemas();
        
        alert('✅ Hojas actualizadas');
        
    } catch (error) {
        console.error('Error actualizando hojas:', error);
        alert('Error al actualizar las hojas');
    }
}
// Recalcular contadores desde registros
window.recalcularContadores = async function() {
    if (!confirm('Esto recalculará todos los contadores desde los registros. ¿Continuar?')) return;
    
    try {
        // Resetear todos los contadores a 0
        for (const temaId in progresoData.temas) {
            progresoData.temas[temaId].testsRealizados = 0;
            progresoData.temas[temaId].hojasLeidas = 0;
        }
        
        // Recalcular desde registros
        progresoData.registros.forEach(registro => {
            if (registro.temaId && registro.temaId !== 'mix') {
                if (!progresoData.temas[registro.temaId]) {
                    progresoData.temas[registro.temaId] = {
                        hojasLeidas: 0,
                        testsRealizados: 0
                    };
                }
                
                progresoData.temas[registro.temaId].hojasLeidas += registro.hojasLeidas || 0;
                progresoData.temas[registro.temaId].testsRealizados += registro.testsRealizados || 0;
            }
        });
        
        // Guardar en Firebase
        await setDoc(doc(db, "progresoSimple", currentUser.uid), progresoData);
        
        alert('✅ Contadores recalculados');
        actualizarResumenGeneral();
        renderizarProgresoTemas();
        await mostrarTestsDeHoy();
        
    } catch (error) {
        console.error('Error:', error);
        alert('Error recalculando contadores');
    }
};
// Función de debug accesible desde consola
window.debugRegistros = function() {
    console.log('=== DIAGNÓSTICO REGISTROS ===');
    console.log('Total registros:', progresoData.registros.length);
    progresoData.registros.forEach((r, i) => {
        const fecha = r.fecha.toDate ? r.fecha.toDate().toDateString() : new Date(r.fecha).toDateString();
        console.log(`Registro ${i}:`, 'Fecha:', fecha, 'TemaID:', r.temaId, 'Tests:', r.testsRealizados, 'Hojas:', r.hojasLeidas);
    });
    console.log('============================');
};

// Borrar todos los registros
window.borrarTodosRegistros = async function() {
    if (!confirm('¿Borrar TODOS los registros? Esto pondrá todos los contadores en 0.')) return;
    
    progresoData.registros = [];
    
    // Resetear contadores
    for (const temaId in progresoData.temas) {
        progresoData.temas[temaId].testsRealizados = 0;
        progresoData.temas[temaId].hojasLeidas = 0;
    }
    
    await setDoc(doc(db, "progresoSimple", currentUser.uid), progresoData);
    
    alert('✅ Todos los registros borrados');
    location.reload();
}; // Cierre de borrarTodosRegistros

// Función de consolidación (llamar desde consola: window.consolidarTemasProgreso())
window.consolidarTemasProgreso = async function() {
    try {
        const progresoRef = doc(db, "progresoSimple", currentUser.uid);
        const progresoDoc = await getDoc(progresoRef);
        
        if (!progresoDoc.exists()) {
            console.log('No existe progresoSimple');
            return;
        }
        
        let data = progresoDoc.data();
        
        console.log('📊 ANTES:', Object.keys(data.temas || {}).length, 'temas');
        Object.entries(data.temas || {}).forEach(([id, tema]) => {
            console.log(`  ${tema.nombre}: ${tema.testsRealizados} tests`);
        });
        
        // Consolidar registros por fecha+tema
        const registrosMap = new Map();
        (data.registros || []).forEach(reg => {
            const fecha = reg.fecha.toDate ? reg.fecha.toDate().toDateString() : new Date(reg.fecha).toDateString();
            const clave = `${fecha}_${reg.temaId}`;
            
            if (!registrosMap.has(clave)) {
                registrosMap.set(clave, { ...reg, testsRealizados: 0, hojasLeidas: 0 });
            }
            
            registrosMap.get(clave).testsRealizados += (reg.testsRealizados || 0);
            registrosMap.get(clave).hojasLeidas += (reg.hojasLeidas || 0);
        });
        
        data.registros = Array.from(registrosMap.values());
        
        // Recalcular contadores desde registros
        const temasCopy = {};
        Object.keys(data.temas).forEach(temaId => {
            temasCopy[temaId] = { ...data.temas[temaId], testsRealizados: 0, hojasLeidas: 0 };
        });
        
        data.registros.forEach(reg => {
            if (reg.temaId !== 'mix' && temasCopy[reg.temaId]) {
                temasCopy[reg.temaId].testsRealizados += (reg.testsRealizados || 0);
                temasCopy[reg.temaId].hojasLeidas += (reg.hojasLeidas || 0);
            }
        });
        
        data.temas = temasCopy;
        
        await setDoc(progresoRef, data);
        
        console.log('\n📊 DESPUÉS:', Object.keys(data.temas).length, 'temas');
        Object.entries(data.temas).forEach(([id, tema]) => {
            console.log(`  ${tema.nombre}: ${tema.testsRealizados} tests`);
        });
        
        alert('✅ Consolidación completada. Recarga la página.');
        
    } catch (error) {
        console.error('❌ Error:', error);
        alert('Error: ' + error.message);
    }
};
// Abrir modal modificar planning
window.abrirModalModificarPlanning = function() {
    const modal = document.getElementById('modalModificarPlanning');
    
    // Prellenar con valores actuales
    const fechaActual = new Date(planningData.fechaObjetivo);
    document.getElementById('inputNuevaFecha').value = fechaActual.toISOString().split('T')[0];
    document.getElementById('inputNuevosTests').value = planningData.testsDiarios || 0;
    
    modal.style.display = 'flex';
};

// Cerrar modal
window.cerrarModalModificarPlanning = function() {
    document.getElementById('modalModificarPlanning').style.display = 'none';
};

// Guardar modificación del planning
window.guardarModificacionPlanning = async function() {
    const nuevaFecha = document.getElementById('inputNuevaFecha').value;
    const nuevosTestsDiarios = parseInt(document.getElementById('inputNuevosTests').value);
    
    if (!nuevaFecha) {
        alert('Debes seleccionar una fecha objetivo');
        return;
    }
    
    if (nuevosTestsDiarios < 0) {
        alert('Los tests diarios no pueden ser negativos');
        return;
    }
    
    try {
        const fechaObjetivoDate = new Date(nuevaFecha);
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const diasRestantes = Math.max(1, Math.ceil((fechaObjetivoDate - hoy) / (1000 * 60 * 60 * 24)));
        
        // Calcular nuevos tests recomendados
        const testsRecomendados = nuevosTestsDiarios * diasRestantes;
        
        // Actualizar planning manteniendo todo el progreso
        const planningRef = doc(db, "planningSimple", currentUser.uid);
        await updateDoc(planningRef, {
            fechaObjetivo: fechaObjetivoDate.toISOString(),
            testsDiarios: nuevosTestsDiarios,
            testsRecomendados: testsRecomendados
        });
        
        // Recargar datos
        await cargarDatos();
        
        cerrarModalModificarPlanning();
        alert('Planning actualizado correctamente');
        
    } catch (error) {
        console.error('Error actualizando planning:', error);
        alert('Error al actualizar el planning');
    }
};

