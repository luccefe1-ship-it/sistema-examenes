import { auth, db } from './firebase-config.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    doc, 
    getDoc, 
    setDoc,
    collection, 
    getDocs, 
    query, 
    where,
    updateDoc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Variables globales
let currentUser = null;
let progresoData = {};
let temasDelBanco = [];
let planningTracker = {
    semanaActiva: null,
    paginasInicio: 0,
    testsInicio: 0,
    fechaInicioSemana: null
};
console.log('Archivo Progreso.js cargado');

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM cargado - Progreso');
    
    // Verificar autenticación
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            console.log('Usuario autenticado:', user.email);
            await cargarDatosUsuario();
            await inicializarProgreso();
            setupEventListeners();
        } else {
            console.log('Usuario no autenticado, redirigiendo...');
            window.location.href = 'index.html';
        }
    });
});

// Cargar datos del usuario
async function cargarDatosUsuario() {
    try {
        const userDoc = await getDoc(doc(db, "usuarios", currentUser.uid));
        const userNameSpan = document.getElementById('userName');
        
        if (userDoc.exists()) {
            const userData = userDoc.data();
            userNameSpan.textContent = userData.nombre;
        } else {
            userNameSpan.textContent = currentUser.email;
        }
    } catch (error) {
        console.error('Error cargando datos:', error);
        document.getElementById('userName').textContent = currentUser.email;
    }
}

// Configurar event listeners
function setupEventListeners() {
    console.log('Configurando event listeners - Progreso...');
    
    // Navegación
    const backBtn = document.getElementById('backBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = 'homepage.html';
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await signOut(auth);
                window.location.href = 'index.html';
            } catch (error) {
                console.error('Error al cerrar sesión:', error);
            }
        });
    }

    // Botones de gestión
    const personalizarBtn = document.getElementById('personalizarTemasBtn');
    
    if (personalizarBtn) {
        personalizarBtn.addEventListener('click', () => {
            abrirModalPersonalizar();
        });
    }

    // Botón Ver Estadísticas - AGREGAR ESTO
    const verEstadisticasBtn = document.getElementById('verEstadisticasBtn');
    
    if (verEstadisticasBtn) {
        verEstadisticasBtn.addEventListener('click', () => {
            abrirModalEstadisticas();
        });
    }
// Event listener para resetear todos los temas
const resetearTodosBtn = document.getElementById('resetearTodosBtn');
if (resetearTodosBtn) {
    resetearTodosBtn.addEventListener('click', resetearTodosTemas);
}
// Botón Crear Tema
const crearTemaBtn = document.getElementById('crearTemaBtn');
if (crearTemaBtn) {
    crearTemaBtn.addEventListener('click', abrirModalCrearTema);
}
// Botón Crear Planning
    const crearPlanningBtn = document.getElementById('crearPlanningBtn');
    if (crearPlanningBtn) {
        crearPlanningBtn.addEventListener('click', abrirModalPlanning);
    }
    // Botón Seguimiento Planning
    const seguimientoPlanningBtn = document.getElementById('seguimientoPlanningBtn');
    if (seguimientoPlanningBtn) {
        seguimientoPlanningBtn.addEventListener('click', abrirModalSeguimiento);
    }
    // Modal
    const guardarPersonalizacionBtn = document.getElementById('guardarPersonalizacion');
    const cancelarPersonalizacionBtn = document.getElementById('cancelarPersonalizacion');
    
    if (guardarPersonalizacionBtn) {
        guardarPersonalizacionBtn.addEventListener('click', () => {
            guardarPersonalizacion();
        });
    }

    if (cancelarPersonalizacionBtn) {
        cancelarPersonalizacionBtn.addEventListener('click', () => {
            cerrarModalPersonalizar();
        });
    }

    // Cerrar modal al hacer click fuera
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });
}

// Inicializar sistema de progreso
async function inicializarProgreso() {
    try {
        console.log('Inicializando sistema de progreso...');
        
        // 1. Cargar temas del banco de preguntas
        await cargarTemasDelBanco();
        
        // 2. Cargar o crear datos de progreso
        await cargarDatosProgreso();
        
        // 3. Sistema independiente - NO sincronizar automáticamente
// Los temas se gestionan solo desde "Personalizar Temas"
        
        // 4. Renderizar interfaz
        renderizarTablaProgreso();
        
    
        console.log('Sistema de progreso inicializado');
        // 5. Cargar planning guardado
await cargarPlanningGuardado();

// 6. Inicializar tracking automático si hay planning activo
await inicializarTrackingAutomatico();
        
    } catch (error) {
        console.error('Error inicializando progreso:', error);
    }
}

// Cargar temas del banco de preguntas
async function cargarTemasDelBanco() {
    try {
        console.log('Cargando temas del banco...');
        
        const q = query(collection(db, "temas"), where("usuarioId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        
        temasDelBanco = [];
        
        querySnapshot.forEach((doc) => {
            const tema = doc.data();
            
            // Solo agregar temas principales (no subtemas)
            if (!tema.temaPadreId) {
                temasDelBanco.push({
                    id: doc.id,
                    nombre: tema.nombre,
                    descripcion: tema.descripcion || '',
                    numPreguntas: tema.preguntas ? tema.preguntas.length : 0,
                    orden: tema.orden || 0
                });
            }
        });
        
        // Ordenar temas con ordenamiento numérico inteligente (igual que banco)
        temasDelBanco.sort((a, b) => {
            const nombreA = a.nombre;
            const nombreB = b.nombre;
            
            // Extraer números del nombre si existen
            const numeroA = nombreA.match(/\d+/);
            const numeroB = nombreB.match(/\d+/);
            
            if (numeroA && numeroB) {
                // Si ambos tienen números, ordenar por número
                return parseInt(numeroA[0]) - parseInt(numeroB[0]);
            } else {
                // Si no tienen números, orden alfabético normal
                return nombreA.localeCompare(nombreB);
            }
        });
        
        console.log('Temas del banco cargados:', temasDelBanco.length);
        
    } catch (error) {
        console.error('Error cargando temas del banco:', error);
        temasDelBanco = [];
    }
}

// Cargar datos de progreso del usuario
async function cargarDatosProgreso() {
    try {
        console.log('Cargando datos de progreso...');
        
        const progresoDoc = await getDoc(doc(db, "progreso", currentUser.uid));
        
        if (progresoDoc.exists()) {
            progresoData = progresoDoc.data();
            console.log('Datos de progreso cargados:', progresoData);
        } else {
            // Crear estructura inicial de progreso
            progresoData = {
                usuarioId: currentUser.uid,
                temas: {},
                fechaCreacion: new Date(),
                ultimaActualizacion: new Date()
            };
            console.log('Creando nueva estructura de progreso');
        }
        
    } catch (error) {
        console.error('Error cargando datos de progreso:', error);
        progresoData = {
            usuarioId: currentUser.uid,
            temas: {},
            fechaCreacion: new Date(),
            ultimaActualizacion: new Date()
        };
    }
}

// Modificar la estructura de datos para incluir tests automáticos y manuales
async function sincronizarProgresoConBanco() {
    try {
        console.log('Sincronizando progreso con banco...');
        
        // Agregar temas nuevos del banco que no estén en progreso
        temasDelBanco.forEach(tema => {
            if (!progresoData.temas[tema.id]) {
                progresoData.temas[tema.id] = {
                    nombre: tema.nombre,
                    paginasEstudiadas: 0,
                    paginasTotales: 30, // Valor por defecto
                    vueltaActual: 1,
                    vueltas: [
                        { numero: 1, completada: false, fechaInicio: new Date() }
                    ],
                    testsAutomaticos: 0, // Tests detectados automáticamente
                    testsManuales: 0,    // Tests añadidos manualmente
                    fechaCreacion: new Date(),
                    ultimaActualizacion: new Date()
                };
            } else {
                // Actualizar nombre si cambió
                progresoData.temas[tema.id].nombre = tema.nombre;
                
                // Asegurar que la estructura de vueltas existe y es válida
                if (!progresoData.temas[tema.id].vueltas || !Array.isArray(progresoData.temas[tema.id].vueltas)) {
                    progresoData.temas[tema.id].vueltas = [
                        { numero: 1, completada: false, fechaInicio: new Date() }
                    ];
                }
                
                // Asegurar que vueltaActual existe
                if (!progresoData.temas[tema.id].vueltaActual) {
                    progresoData.temas[tema.id].vueltaActual = 1;
                }
                
                // Asegurar que paginasTotales existe
                if (!progresoData.temas[tema.id].paginasTotales) {
                    progresoData.temas[tema.id].paginasTotales = 30;
                }
                
                // Asegurar que paginasEstudiadas existe
                if (progresoData.temas[tema.id].paginasEstudiadas === undefined) {
                    progresoData.temas[tema.id].paginasEstudiadas = 0;
                }
                
                // Migrar datos antiguos si es necesario
                if (progresoData.temas[tema.id].testsRealizados !== undefined) {
                    // Migrar de sistema antiguo
                    progresoData.temas[tema.id].testsAutomaticos = 0;
                    progresoData.temas[tema.id].testsManuales = progresoData.temas[tema.id].testsRealizados || 0;
                    delete progresoData.temas[tema.id].testsRealizados;
                }
                
                // Asegurar que existen los campos nuevos
                if (progresoData.temas[tema.id].testsAutomaticos === undefined) {
                    progresoData.temas[tema.id].testsAutomaticos = 0;
                }
                if (progresoData.temas[tema.id].testsManuales === undefined) {
                    progresoData.temas[tema.id].testsManuales = 0;
                }
            }
        });
        
        // Eliminar temas del progreso que ya no existen en el banco
        const temasExistentesIds = temasDelBanco.map(t => t.id);
        Object.keys(progresoData.temas).forEach(temaId => {
            if (!temasExistentesIds.includes(temaId)) {
                delete progresoData.temas[temaId];
            }
        });
        
        // Guardar cambios
        await guardarProgreso();
        
        console.log('Sincronización completada');
        
    } catch (error) {
        console.error('Error en sincronización:', error);
    }
}

// Guardar progreso en Firebase
async function guardarProgreso() {
    try {
        progresoData.ultimaActualizacion = new Date();
        await setDoc(doc(db, "progreso", currentUser.uid), progresoData);
        console.log('Progreso guardado en Firebase');
    } catch (error) {
        console.error('Error guardando progreso:', error);
    }
}

// Renderizar tabla de progreso
function renderizarTablaProgreso() {
    console.log('Renderizando tabla de progreso...');
    
    const tablaContent = document.getElementById('tablaProgresoContent');
    tablaContent.innerHTML = '';
    
    // Ordenar temas con el mismo sistema que banco de preguntas (numérico inteligente)
const temasOrdenados = Object.entries(progresoData.temas).sort(([idA, datosA], [idB, datosB]) => {
    // Intentar buscar en banco primero
    const temaA = temasDelBanco.find(t => t.id === idA);
    const temaB = temasDelBanco.find(t => t.id === idB);
    
    // Obtener nombre desde banco O desde los datos del tema
    const nombreA = temaA ? temaA.nombre : datosA.nombre;
    const nombreB = temaB ? temaB.nombre : datosB.nombre;
    
    // Extraer números del nombre si existen
    const numeroA = nombreA.match(/\d+/);
    const numeroB = nombreB.match(/\d+/);
    
    if (numeroA && numeroB) {
        // Si ambos tienen números, ordenar por número
        return parseInt(numeroA[0]) - parseInt(numeroB[0]);
    } else {
        // Si no tienen números, orden alfabético normal
        return nombreA.localeCompare(nombreB);
    }
});
    
    // Renderizar cada tema en el orden correcto
    temasOrdenados.forEach(([temaId, temaProgreso]) => {
        const filaHTML = crearFilaTema(temaId, temaProgreso);
        tablaContent.innerHTML += filaHTML;
    });
    
// Actualizar progreso general
    actualizarProgresoGeneral();
    
    // Configurar event listeners de los controles
    configurarControlesTabla();
}

// Crear HTML para fila de tema CON NUEVO FORMATO DE TESTS
function crearFilaTema(temaId, temaProgreso) {
    const porcentaje = calcularPorcentajeTema(temaProgreso);
    const claseVuelta = `vuelta-${temaProgreso.vueltaActual}`;
    const nombreVuelta = obtenerNombreVuelta(temaProgreso.vueltaActual);
    
    // Calcular tests automáticos y manuales
    const testsAutomaticos = temaProgreso.testsAutomaticos || 0;
    const testsManuales = temaProgreso.testsManuales || 0;
    const totalTests = testsAutomaticos + testsManuales;
    
    // Formato de display de tests
    let displayTests = totalTests.toString();
    if (testsAutomaticos > 0 && testsManuales > 0) {
        displayTests = `${totalTests}<br><small style="color: #6b7280; font-size: 10px;">${testsAutomaticos}+${testsManuales}</small>`;
    } else if (testsAutomaticos > 0 && testsManuales === 0) {
        displayTests = `${totalTests}<br><small style="color: #6b7280; font-size: 10px;">auto</small>`;
    } else if (testsManuales > 0 && testsAutomaticos === 0) {
        displayTests = `${totalTests}<br><small style="color: #6b7280; font-size: 10px;">manual</small>`;
    }
    
    return `
        <div class="fila-tema" data-tema-id="${temaId}">
            <div class="col-tema">
                <div class="tema-nombre">${temaProgreso.nombre}</div>
            </div>
            <div class="col-memorizado">
                <div class="control-contador">
                    <button class="btn-contador" onclick="cambiarPaginas('${temaId}', -1)">−</button>
                    <span class="contador-valor">${temaProgreso.paginasEstudiadas}/${temaProgreso.paginasTotales}</span>
                    <button class="btn-contador btn-mas" onclick="cambiarPaginas('${temaId}', 1)">+</button>
                </div>
            </div>
            <div class="col-tests">
                <div class="control-contador">
                    <button class="btn-contador" onclick="cambiarTests('${temaId}', -1)">−</button>
                    <span class="contador-valor" style="line-height: 1.2;">${displayTests}</span>
                    <button class="btn-contador btn-mas" onclick="cambiarTests('${temaId}', 1)">+</button>
                </div>
            </div>
            <div class="col-vuelta">
                <span class="indicador-vuelta ${claseVuelta}">${nombreVuelta}</span>
            </div>
            <div class="col-progreso">
                <div class="barra-progreso">
                    <div class="barra-fill ${claseVuelta}" style="width: ${porcentaje}%"></div>
                </div>
                <span class="porcentaje-texto">${porcentaje}%</span>
            </div>
            <div class="col-acciones">
                <button class="btn-accion" onclick="reiniciarTema('${temaId}')">🔄</button>
            </div>
            <div class="col-eliminar">
                <button class="btn-eliminar-tema" onclick="eliminarTema('${temaId}')">🗑️</button>
            </div>
        </div>
    `;
}

// Funciones auxiliares
function calcularPorcentajeTema(temaProgreso) {
    const paginasEstudiadas = temaProgreso.paginasEstudiadas || 0;
    const paginasTotales = temaProgreso.paginasTotales || 30;
    
    if (paginasTotales <= 0) return 0;
    
    return Math.round((paginasEstudiadas / paginasTotales) * 100);
}

function obtenerNombreVuelta(numeroVuelta) {
    const nombres = ['Primera', 'Segunda', 'Tercera', 'Cuarta', 'Quinta', 'Sexta'];
    return nombres[numeroVuelta - 1] || `${numeroVuelta}ª`;
}

function configurarControlesTabla() {
    console.log('Controles de tabla configurados');
}

function actualizarProgresoGeneral() {
    try {
        // Validar que progresoData y progresoData.temas existan
        if (!progresoData || !progresoData.temas) {
            document.getElementById('progresoGeneralMemorizado').textContent = '0/0';
            document.getElementById('progresoGeneralTests').textContent = '0';
            document.getElementById('progresoGeneralVuelta').textContent = 'Primera';
            document.getElementById('barraProgresoGeneral').style.width = '0%';
            document.getElementById('porcentajeProgresoGeneral').textContent = '0%';
            return;
        }

        const temas = Object.values(progresoData.temas);
        
        if (temas.length === 0) {
            document.getElementById('progresoGeneralMemorizado').textContent = '0/0';
            document.getElementById('progresoGeneralTests').textContent = '0';
            document.getElementById('progresoGeneralVuelta').textContent = 'Primera';
            document.getElementById('barraProgresoGeneral').style.width = '0%';
            document.getElementById('porcentajeProgresoGeneral').textContent = '0%';
            return;
        }
        
        // Calcular vuelta mínima global (la más baja de todos los temas)
        let vueltaMinimaGlobal = Math.min(...temas.map(t => t.vueltaActual || 1));
        
        // Calcular páginas totales (suma de todos los temas)
        const paginasTotalesGlobal = temas.reduce((sum, t) => sum + (t.paginasTotales || 0), 0);
        
        // Calcular tests globales
        const testsGlobal = temas.reduce((sum, t) => 
            sum + (t.testsAutomaticos || 0) + (t.testsManuales || 0), 0);
        
        // NUEVA LÓGICA: Calcular páginas según la vuelta global
        let paginasLeidas = 0;
        
        temas.forEach(tema => {
            const vueltaTema = tema.vueltaActual || 1;
            const paginasTotalesTema = tema.paginasTotales || 0;
            const paginasActualesTema = tema.paginasEstudiadas || 0;
            
            if (vueltaTema < vueltaMinimaGlobal) {
                // Este tema está en una vuelta anterior (no debería pasar)
                paginasLeidas += paginasTotalesTema;
            } else if (vueltaTema === vueltaMinimaGlobal) {
                // Este tema está en la vuelta mínima global
                paginasLeidas += paginasActualesTema;
            } else {
                // Este tema está en una vuelta SUPERIOR a la mínima
                // Contar TODAS sus páginas como completadas para la vuelta mínima
                paginasLeidas += paginasTotalesTema;
            }
        });
        
        // Calcular porcentaje
        const porcentajeVueltaActual = paginasTotalesGlobal > 0 ? 
            Math.round((paginasLeidas / paginasTotalesGlobal) * 100) : 0;
        
        // Actualizar interfaz
        document.getElementById('progresoGeneralMemorizado').textContent = 
            `${paginasLeidas}/${paginasTotalesGlobal}`;
        document.getElementById('progresoGeneralTests').textContent = testsGlobal;
        document.getElementById('progresoGeneralVuelta').textContent = obtenerNombreVuelta(vueltaMinimaGlobal);
        
        const barraGeneral = document.getElementById('barraProgresoGeneral');
        barraGeneral.style.width = `${porcentajeVueltaActual}%`;
        barraGeneral.className = `barra-fill vuelta-${vueltaMinimaGlobal}`;
        
        document.getElementById('porcentajeProgresoGeneral').textContent = `${porcentajeVueltaActual}%`;
        
        console.log(`Progreso general: ${paginasLeidas}/${paginasTotalesGlobal} (${porcentajeVueltaActual}%) - Vuelta ${vueltaMinimaGlobal}`);
        
    } catch (error) {
        console.error('Error actualizando progreso general:', error);
    }
}

// Funciones que se llamarán desde el HTML (deben ser globales)
window.cambiarPaginas = async function(temaId, cambio) {
    try {
        if (!progresoData.temas[temaId]) return;
        
        const tema = progresoData.temas[temaId];
        const paginasAnteriores = tema.paginasEstudiadas;
        const nuevasPaginas = Math.max(0, paginasAnteriores + cambio);
        
        console.log(`Cambiando páginas ${tema.nombre}: ${paginasAnteriores} → ${nuevasPaginas}`);
        
        // Verificar si se completa una vuelta
        if (nuevasPaginas >= tema.paginasTotales && paginasAnteriores < tema.paginasTotales) {
            // Completar vuelta actual
            tema.vueltas[tema.vueltaActual - 1].completada = true;
            tema.vueltas[tema.vueltaActual - 1].fechaCompletada = new Date();
            
            // Avanzar a siguiente vuelta (máximo 6)
            if (tema.vueltaActual < 6) {
                tema.vueltaActual++;
                tema.vueltas.push({
                    numero: tema.vueltaActual,
                    completada: false,
                    fechaInicio: new Date()
                });
                // Reiniciar páginas a 0 para nueva vuelta
                tema.paginasEstudiadas = 0;
                console.log(`${tema.nombre}: Completada vuelta ${tema.vueltaActual - 1}, iniciando vuelta ${tema.vueltaActual}`);
            } else {
                // Ya en vuelta 6, no resetear
                tema.paginasEstudiadas = nuevasPaginas;
            }
        } else {
            // Cambio normal sin completar vuelta
            tema.paginasEstudiadas = Math.min(nuevasPaginas, tema.paginasTotales);
        }
        
        tema.ultimaActualizacion = new Date();
        
        // Guardar y actualizar
await guardarProgreso();
renderizarTablaProgreso();

// Actualizar tracking automático si hay semana activa
actualizarTrackingAutomatico();
        
    } catch (error) {
        console.error('Error cambiando páginas:', error);
        alert('Error al cambiar páginas');
    }
// Actualizar seguimiento si está abierto
if (document.getElementById('modalSeguimientoPlanning').style.display === 'block') {
    mostrarInformacionPlanning();
    mostrarSemanasPlanning();
}
};

window.cambiarTests = async function(temaId, cambio) {
    try {
        if (!progresoData.temas[temaId]) return;
        
        const tema = progresoData.temas[temaId];
        
        // Asegurar que existen los campos nuevos
        if (tema.testsManuales === undefined) tema.testsManuales = 0;
        if (tema.testsAutomaticos === undefined) tema.testsAutomaticos = 0;
        
        const manualesAnteriores = tema.testsManuales || 0;
        const nuevosManuales = Math.max(0, manualesAnteriores + cambio);
        
        tema.testsManuales = nuevosManuales;
        tema.ultimaActualizacion = new Date();
        
        const testsAutomaticos = tema.testsAutomaticos || 0;
        const totalTests = testsAutomaticos + nuevosManuales;
        
        console.log(`${tema.nombre}: Tests ${testsAutomaticos}+${nuevosManuales} = ${totalTests}`);
        
        // Guardar y actualizar
await guardarProgreso();
renderizarTablaProgreso();

// Actualizar tracking automático si hay semana activa
actualizarTrackingAutomatico();
        
    } catch (error) {
        console.error('Error cambiando tests:', error);
        alert('Error al cambiar tests');
    }
// Actualizar seguimiento si está abierto
if (document.getElementById('modalSeguimientoPlanning').style.display === 'block') {
    mostrarInformacionPlanning();
    mostrarSemanasPlanning();
}
};

window.reiniciarTema = async function(temaId) {
    try {
        if (!progresoData.temas[temaId]) return;
        
        const tema = progresoData.temas[temaId];
        const confirmar = confirm(`¿Reiniciar progreso del tema "${tema.nombre}"? Esta acción no se puede deshacer.`);
        
        if (confirmar) {
            // Resetear tema a estado inicial
            tema.paginasEstudiadas = 0;
            tema.vueltaActual = 1;
            tema.vueltas = [
                { numero: 1, completada: false, fechaInicio: new Date() }
            ];
            tema.testsAutomaticos = 0;
            tema.testsManuales = 0;
            tema.ultimaActualizacion = new Date();
            
            console.log(`Tema ${tema.nombre} reiniciado`);
            
            // Guardar y actualizar
            await guardarProgreso();
            renderizarTablaProgreso();

            // Actualizar tracking automático si hay semana activa
            actualizarTrackingAutomatico();
        }
        
    } catch (error) {
        console.error('Error reiniciando tema:', error);
        alert('Error al reiniciar tema');
    }
    
    // Actualizar seguimiento si está abierto
    if (document.getElementById('modalSeguimientoPlanning').style.display === 'block') {
        mostrarInformacionPlanning();
        mostrarSemanasPlanning();
    }
};

window.eliminarTema = async function(temaId) {
    try {
        if (!progresoData.temas[temaId]) return;
        
        const tema = progresoData.temas[temaId];
        const confirmar = confirm(`¿Eliminar el tema "${tema.nombre}"?\n\nEsta acción eliminará todo el progreso de este tema y no se puede deshacer.`);
        
        if (confirmar) {
            // Eliminar tema de la memoria local
            delete progresoData.temas[temaId];
            
            console.log(`Tema ${tema.nombre} eliminado de memoria`);
            
            // Guardar cambios en Firebase
            await guardarProgreso();
            
            console.log('Cambios guardados en Firebase');
            
            // Re-renderizar interfaz SIN recargar desde Firebase
            renderizarTablaProgreso();
            
            alert(`Tema "${tema.nombre}" eliminado correctamente`);
        }
        
    } catch (error) {
        console.error('Error eliminando tema:', error);
        alert('Error al eliminar tema');
    }
};
// Función para abrir modal crear tema
function abrirModalCrearTema() {
    document.getElementById('nombreNuevoTema').value = '';
    document.getElementById('paginasNuevoTema').value = '30';
    
    document.getElementById('guardarNuevoTema').onclick = guardarNuevoTema;
    document.getElementById('cancelarNuevoTema').onclick = cerrarModalCrearTema;
    
    document.getElementById('modalCrearTema').style.display = 'flex';
}

function cerrarModalCrearTema() {
    document.getElementById('modalCrearTema').style.display = 'none';
}

async function guardarNuevoTema() {
    const nombre = document.getElementById('nombreNuevoTema').value.trim();
    const paginas = parseInt(document.getElementById('paginasNuevoTema').value) || 30;
    
    if (!nombre) {
        alert('Por favor, ingresa un nombre para el tema');
        return;
    }
    
    try {
        // Generar ID único
        const nuevoId = 'tema_' + Date.now();
        
        // Crear nuevo tema en progreso
        progresoData.temas[nuevoId] = {
            nombre: nombre,
            paginasEstudiadas: 0,
            paginasTotales: paginas,
            vueltaActual: 1,
            vueltas: [
                { numero: 1, completada: false, fechaInicio: new Date() }
            ],
            testsAutomaticos: 0,
            testsManuales: 0,
            fechaCreacion: new Date(),
            ultimaActualizacion: new Date()
        };
        
        // Guardar en Firebase
        await guardarProgreso();
        
        // Actualizar interfaz
        renderizarTablaProgreso();
        
        // Cerrar modal
        cerrarModalCrearTema();
        
        alert(`Tema "${nombre}" creado exitosamente`);
        
    } catch (error) {
        console.error('Error creando tema:', error);
        alert('Error al crear el tema');
    }
}
// Funciones del modal
function abrirModalPersonalizar() {
    console.log('Abriendo modal personalizar...');
    
    const listaContainer = document.getElementById('listaTemasPersonalizar');
    listaContainer.innerHTML = '';
    
    // Mostrar TODOS los temas del banco con checkbox para activar/desactivar
    temasDelBanco.forEach(tema => {
        const estaActivo = progresoData.temas[tema.id] !== undefined;
        const paginasTotales = estaActivo ? progresoData.temas[tema.id].paginasTotales : 30;
        
        const itemHTML = `
            <div class="tema-personalizar-item">
                <input type="checkbox" 
                       class="tema-checkbox" 
                       data-tema-id="${tema.id}"
                       data-tema-nombre="${tema.nombre}"
                       ${estaActivo ? 'checked' : ''}>
                <div class="tema-personalizar-nombre">${tema.nombre}</div>
                <label style="font-size: 12px; color: #6b7280;">Páginas:</label>
                <input type="number" 
                       class="tema-personalizar-paginas" 
                       value="${paginasTotales}" 
                       min="1" 
                       max="999"
                       data-tema-id="${tema.id}"
                       ${!estaActivo ? 'disabled' : ''}>
            </div>
        `;
        listaContainer.innerHTML += itemHTML;
    });
    
    // Event listeners para checkboxes
    document.querySelectorAll('.tema-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const temaId = this.dataset.temaId;
            const inputPaginas = document.querySelector(`input.tema-personalizar-paginas[data-tema-id="${temaId}"]`);
            inputPaginas.disabled = !this.checked;
        });
    });
    
    document.getElementById('modalPersonalizarTemas').style.display = 'flex';
}
function cerrarModalPersonalizar() {
    document.getElementById('modalPersonalizarTemas').style.display = 'none';
}

async function guardarPersonalizacion() {
    console.log('Guardando personalización...');
    
    try {
        const checkboxes = document.querySelectorAll('.tema-checkbox');
        
        checkboxes.forEach(checkbox => {
            const temaId = checkbox.dataset.temaId;
            const temaNombre = checkbox.dataset.temaNombre;
            const estaChecked = checkbox.checked;
            const inputPaginas = document.querySelector(`input.tema-personalizar-paginas[data-tema-id="${temaId}"]`);
            const nuevasPaginas = parseInt(inputPaginas.value) || 30;
            
            if (estaChecked) {
                // Añadir o actualizar tema
                if (!progresoData.temas[temaId]) {
                    // Crear nuevo tema
                    progresoData.temas[temaId] = {
                        nombre: temaNombre,
                        paginasEstudiadas: 0,
                        paginasTotales: nuevasPaginas,
                        vueltaActual: 1,
                        vueltas: [
                            { numero: 1, completada: false, fechaInicio: new Date() }
                        ],
                        testsAutomaticos: 0,
                        testsManuales: 0,
                        fechaCreacion: new Date(),
                        ultimaActualizacion: new Date()
                    };
                    console.log(`Tema ${temaNombre} añadido`);
                } else {
                    // Actualizar páginas totales
                    progresoData.temas[temaId].paginasTotales = nuevasPaginas;
                    
                    // Si las páginas estudiadas superan el nuevo total, ajustar
                    if (progresoData.temas[temaId].paginasEstudiadas > nuevasPaginas) {
                        progresoData.temas[temaId].paginasEstudiadas = nuevasPaginas;
                    }
                    console.log(`Tema ${temaNombre} actualizado: ${nuevasPaginas} páginas`);
                }
            } else {
                // Eliminar tema si existe
                if (progresoData.temas[temaId]) {
                    delete progresoData.temas[temaId];
                    console.log(`Tema ${temaNombre} eliminado`);
                }
            }
        });
        
        // Guardar en Firebase
        await guardarProgreso();
        
        // Actualizar interfaz
        renderizarTablaProgreso();
        
        // Cerrar modal
        cerrarModalPersonalizar();
        
        alert('Configuración guardada correctamente');
        
    } catch (error) {
        console.error('Error guardando personalización:', error);
        alert('Error al guardar la configuración');
    }
}
// Función para resetear todos los temas
async function resetearTodosTemas() {
    const confirmar = confirm(`¿Estás seguro de que quieres resetear TODOS los temas a vuelta 1?\n\nEsto reiniciará:\n- Todas las vueltas a "Primera"\n- Todas las páginas estudiadas a 0\n- Todos los tests realizados a 0\n\nEsta acción no se puede deshacer.`);
    
    if (confirmar) {
        try {
            const temas = Object.values(progresoData.temas);
            
            for (const tema of temas) {
                // Resetear tema a estado inicial
                tema.paginasEstudiadas = 0;
                tema.vueltaActual = 1;
                tema.vueltas = [
                    { numero: 1, completada: false, fechaInicio: new Date() }
                ];
                // RESETEAR TAMBIÉN LOS TESTS
                tema.testsAutomaticos = 0;
                tema.testsManuales = 0;
                tema.ultimaActualizacion = new Date();
                
                console.log(`Tema ${tema.nombre} reiniciado completamente`);
            }
            
            // Guardar y actualizar
await guardarProgreso();
renderizarTablaProgreso();

// Actualizar tracking automático si hay semana activa
actualizarTrackingAutomatico();
            
            alert(`${temas.length} temas reiniciados exitosamente (incluyendo tests)`);
            
        } catch (error) {
            console.error('Error reiniciando todos los temas:', error);
            alert('Error al reiniciar todos los temas');
        }
    }
}

// Función para actualizar la interfaz (alias de renderizar)
function actualizarInterfazProgreso() {
    renderizarTablaProgreso();
}

// Función para registrar test completado automáticamente (llamada desde tests.js)
window.registrarTestCompletado = async function(temasUtilizados) {
    try {
        console.log('Registrando test completado para temas:', temasUtilizados);
        
        if (!currentUser || !progresoData.temas) {
            console.log('Usuario o progreso no disponible aún');
            return;
        }
        
        // Incrementar testsAutomaticos para cada tema utilizado
        let temasActualizados = 0;
        
        temasUtilizados.forEach(temaId => {
            if (progresoData.temas[temaId]) {
                // Asegurar que existe el campo testsAutomaticos
                if (progresoData.temas[temaId].testsAutomaticos === undefined) {
                    progresoData.temas[temaId].testsAutomaticos = 0;
                }
                
                progresoData.temas[temaId].testsAutomaticos++;
                progresoData.temas[temaId].ultimaActualizacion = new Date();
                temasActualizados++;
                
                console.log(`Test automático registrado para ${progresoData.temas[temaId].nombre}: ${progresoData.temas[temaId].testsAutomaticos}`);
            }
        });
        
        if (temasActualizados > 0) {
            // Guardar en Firebase
            await guardarProgreso();
            // Actualizar la interfaz
actualizarInterfazProgreso();
console.log(`Test registrado exitosamente en ${temasActualizados} temas`);

// Actualizar tracking automático si hay semana activa
actualizarTrackingAutomatico();
        }
        
    } catch (error) {
        console.error('Error registrando test completado:', error);
    }
};
// Funcionalidad de Estadísticas Detalladas

// Event listener para el botón Ver Estadísticas
document.addEventListener('DOMContentLoaded', () => {
    const btnVerEstadisticas = document.getElementById('verEstadisticasBtn');
    if (btnVerEstadisticas) {
        btnVerEstadisticas.addEventListener('click', mostrarModalEstadisticas);
    }
});

// Mostrar modal de estadísticas
function mostrarModalEstadisticas() {
    const modal = document.getElementById('modalEstadisticas');
    if (modal) {
        modal.style.display = 'block';
        setTimeout(() => {
            generarGraficaEstadisticas();
            generarDetallesTemas(); // AGREGAR ESTA LÍNEA
        }, 100);
    }
}

// Cerrar modal de estadísticas
function cerrarModalEstadisticas() {
    const modal = document.getElementById('modalEstadisticas');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Cerrar modal al hacer click fuera
window.addEventListener('click', (event) => {
    const modal = document.getElementById('modalEstadisticas');
    if (event.target === modal) {
        cerrarModalEstadisticas();
    }
});

// Generar gráfica de estadísticas con Canvas
function generarGraficaEstadisticas() {
    const canvas = document.getElementById('graficaEstadisticas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Configurar canvas más alto para mejor legibilidad
    canvas.width = 1000;
    canvas.height = 600;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    // Limpiar canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Obtener datos de temas
    const datosEstadisticas = calcularEstadisticasTemas();
    
    if (datosEstadisticas.length === 0) {
        // Mostrar mensaje cuando no hay datos
        ctx.fillStyle = '#6b7280';
        ctx.font = '18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('No hay datos disponibles', canvasWidth / 2, canvasHeight / 2);
        return;
    }
    
    // Configuración mejorada de la gráfica
    const padding = 100;
    const bottomPadding = 120; // Más espacio abajo para etiquetas
    const graphWidth = canvasWidth - (padding * 2);
    const graphHeight = canvasHeight - padding - bottomPadding;
    const barWidth = Math.min(60, graphWidth / datosEstadisticas.length * 0.7); // Barras más anchas pero con límite
    const maxValue = Math.max(...datosEstadisticas.map(d => d.puntuacion));
    
    // Fondo de la gráfica
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Dibujar líneas de grid horizontales
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
        const y = padding + (i / 5) * graphHeight;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(canvasWidth - padding, y);
        ctx.stroke();
    }
    
    // Dibujar ejes principales
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 3;
    ctx.beginPath();
    // Eje Y (vertical)
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvasHeight - bottomPadding);
    // Eje X (horizontal)
    ctx.lineTo(canvasWidth - padding, canvasHeight - bottomPadding);
    ctx.stroke();
    
    // Calcular espaciado entre barras
    const totalBarsWidth = datosEstadisticas.length * barWidth;
    const totalSpacing = graphWidth - totalBarsWidth;
    const spaceBetweenBars = totalSpacing / (datosEstadisticas.length + 1);
    
    // Dibujar barras
    datosEstadisticas.forEach((dato, index) => {
        const x = padding + spaceBetweenBars + (index * (barWidth + spaceBetweenBars));
        const barHeight = (dato.puntuacion / maxValue) * graphHeight;
        const y = canvasHeight - bottomPadding - barHeight;
        
        // Color de la barra según la vuelta
        const colores = {
            1: '#ef4444', // Rojo
            2: '#3b82f6', // Azul
            3: '#10b981', // Verde
            4: '#f59e0b', // Naranja
            5: '#8b5cf6', // Púrpura
            6: '#e11d48'  // Rosa
        };
        
        // Crear gradiente para la barra
        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        gradient.addColorStop(0, colores[dato.vuelta] || '#6b7280');
        gradient.addColorStop(1, (colores[dato.vuelta] || '#6b7280') + '80');
        
        // Sombra de la barra
        ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;
        
        // Dibujar barra
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth, barHeight);
        
        // Resetear sombra
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        
        // Borde de la barra
        ctx.strokeStyle = colores[dato.vuelta] || '#6b7280';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, barWidth, barHeight);
        
        // Valor encima de la barra
        ctx.fillStyle = '#1f2937';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(dato.puntuacion.toFixed(1), x + barWidth / 2, y - 8);
        
        // Nombre del tema (rotado 45 grados para mejor legibilidad)
        ctx.save();
        ctx.translate(x + barWidth / 2, canvasHeight - bottomPadding + 15);
        ctx.rotate(-Math.PI / 4); // Rotar 45 grados
        ctx.fillStyle = '#374151';
        ctx.font = '12px Arial';
        ctx.textAlign = 'right';
        
        // Truncar nombres muy largos
        let nombreMostrar = dato.nombre;
        if (nombreMostrar.length > 15) {
            nombreMostrar = nombreMostrar.substring(0, 15) + '...';
        }
        
        ctx.fillText(nombreMostrar, 0, 0);
        ctx.restore();
    });
    
    // Etiquetas del eje Y (valores)
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
        const value = (maxValue / 5) * i;
        const y = canvasHeight - bottomPadding - (i / 5) * graphHeight;
        ctx.fillText(value.toFixed(1), padding - 15, y + 4);
    }
    
    // Título del eje Y
    ctx.save();
    ctx.translate(25, canvasHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#374151';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Puntuación Ponderada', 0, 0);
    ctx.restore();
    
    // Título del eje X
    ctx.fillStyle = '#374151';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Temas', canvasWidth / 2, canvasHeight - 15);
    
    // Título principal de la gráfica
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Progreso por Temas', canvasWidth / 2, 30);
}

// Calcular estadísticas ponderadas por tema
function calcularEstadisticasTemas() {
    if (!progresoData || !progresoData.temas) return [];
    
    const estadisticas = [];
    
    Object.entries(progresoData.temas).forEach(([temaId, temaProgreso]) => {
        // Buscar información del tema en temasDelBanco
        const temaInfo = temasDelBanco.find(t => t.id === temaId);
        const nombreTema = temaInfo ? temaInfo.nombre : `Tema ${temaId}`;
        
        // Calcular componentes de la puntuación
        const paginasLeidas = temaProgreso.paginasEstudiadas || 0;
        const paginasTotales = temaProgreso.paginasTotales || 1;
        const porcentajePaginas = (paginasLeidas / paginasTotales) * 100;
        
        // Vueltas completadas
        const vueltasCompletadas = temaProgreso.vueltas ? 
            temaProgreso.vueltas.filter(v => v.completada).length : 0;
        
        // Tests realizados (automáticos + manuales)
        const testsAutomaticos = temaProgreso.testsAutomaticos || 0;
        const testsManuales = temaProgreso.testsManuales || 0;
        const totalTests = testsAutomaticos + testsManuales;
        
        // Fórmula de ponderación:
        // (Páginas Leídas × 0.4) + (Vueltas Completadas × 0.4) + (Tests Realizados × 0.2)
        const puntuacionPaginas = porcentajePaginas * 0.4;
        const puntuacionVueltas = vueltasCompletadas * 40 * 0.4; // 40 puntos por vuelta completada
        const puntuacionTests = totalTests * 10 * 0.2; // 10 puntos por test
        
        const puntuacionTotal = puntuacionPaginas + puntuacionVueltas + puntuacionTests;
        
        estadisticas.push({
            nombre: nombreTema,
            puntuacion: puntuacionTotal,
            vuelta: temaProgreso.vueltaActual || 1,
            paginasLeidas,
            paginasTotales,
            vueltasCompletadas,
            totalTests,
            detalles: {
                porcentajePaginas: porcentajePaginas.toFixed(1),
                puntuacionPaginas: puntuacionPaginas.toFixed(1),
                puntuacionVueltas: puntuacionVueltas.toFixed(1),
                puntuacionTests: puntuacionTests.toFixed(1)
            }
        });
    });
    
    // Ordenar por puntuación descendente
    return estadisticas.sort((a, b) => b.puntuacion - a.puntuacion);
}
// ===== TRACKING AUTOMÁTICO DE PLANNING =====

async function inicializarTrackingAutomatico() {
    if (!planningGuardado) return;
    
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    // Inicializar SOLO la semana activa actual
    for (const semana of planningGuardado.semanas) {
        const fechaInicio = semana.fechaInicio?.toDate ? semana.fechaInicio.toDate() : new Date(semana.fechaInicio);
        const fechaFin = semana.fechaFin?.toDate ? semana.fechaFin.toDate() : new Date(semana.fechaFin);
        
        fechaInicio.setHours(0, 0, 0, 0);
        fechaFin.setHours(23, 59, 59, 999);
        
        // Solo inicializar si HOY está dentro de esta semana Y no tiene datos
        const esSemanaActiva = hoy >= fechaInicio && hoy <= fechaFin;
        
        if (esSemanaActiva && (!semana.datosInicioSemana || !semana.datosInicioSemana.inicializado)) {
            const estadoInicial = capturarEstadoInicialSemana();
            
            semana.datosInicioSemana = {
                inicializado: true,
                fecha: fechaInicio,
                paginasIniciales: estadoInicial.totalPaginas,
                testsIniciales: estadoInicial.totalTests,
                temasPaginas: estadoInicial.temasPaginas,
                temasTests: estadoInicial.temasTests
            };
            
            await guardarCambiosPlanning();
            console.log(`Estado inicial capturado para Semana ${semana.numero}:`, semana.datosInicioSemana);
        }
    }
    
    console.log('Tracking automático inicializado');
}

function capturarEstadoInicialSemana() {
    let totalPaginas = 0;
    let totalTests = 0;
    const temasPaginas = {};
    const temasTests = {};
    
    // Calcular vuelta mínima global del planning
    let vueltaMinimaPlanning = Infinity;
    if (planningGuardado && planningGuardado.temas) {
        planningGuardado.temas.forEach(temaPlanning => {
            const temaProgreso = progresoData.temas[temaPlanning.id];
            if (temaProgreso) {
                const vueltaTema = temaProgreso.vueltaActual || 1;
                if (vueltaTema < vueltaMinimaPlanning) {
                    vueltaMinimaPlanning = vueltaTema;
                }
            }
        });
    }
    
    // Solo contar temas que están en el planning actual
    if (planningGuardado && planningGuardado.temas) {
        planningGuardado.temas.forEach(temaPlanning => {
            const temaProgreso = progresoData.temas[temaPlanning.id];
            if (temaProgreso) {
                const vueltaTema = temaProgreso.vueltaActual || 1;
                let paginasTema;
                
                if (vueltaTema < vueltaMinimaPlanning) {
                    paginasTema = temaProgreso.paginasEstudiadas || 0;
                } else if (vueltaTema === vueltaMinimaPlanning) {
                    paginasTema = temaProgreso.paginasEstudiadas || 0;
                } else {
                    paginasTema = temaProgreso.paginasTotales;
                }
                
                const testsTema = (temaProgreso.testsAutomaticos || 0) + (temaProgreso.testsManuales || 0);
                
                totalPaginas += paginasTema;
                totalTests += testsTema;
                
                temasPaginas[temaPlanning.id] = paginasTema;
                temasTests[temaPlanning.id] = testsTema;
            }
        });
    }
    
    return {
        totalPaginas,
        totalTests,
        temasPaginas,
        temasTests
    };
}
function capturarEstadoActualSemana() {
    let totalPaginas = 0;
    let totalTests = 0;
    
    if (planningGuardado && planningGuardado.temas) {
        planningGuardado.temas.forEach(temaPlanning => {
            const temaProgreso = progresoData.temas[temaPlanning.id];
            if (temaProgreso) {
                totalPaginas += temaProgreso.paginasEstudiadas || 0;
                totalTests += (temaProgreso.testsAutomaticos || 0) + (temaProgreso.testsManuales || 0);
            }
        });
    }
    
    return {
        totalPaginas,
        totalTests
    };
}
function calcularProgresoSemanaActual() {
    if (!planningTracker.semanaActiva) return { paginas: 0, tests: 0 };
    
    const estadoActual = capturarEstadoInicialSemana();
    
    const paginasProgress = Math.max(0, estadoActual.totalPaginas - planningTracker.paginasInicio);
    const testsProgress = Math.max(0, estadoActual.totalTests - planningTracker.testsInicio);
    
    return {
        paginas: paginasProgress,
        tests: testsProgress
    };
}
function actualizarTrackingAutomatico() {
    if (!planningTracker.semanaActiva) return;
    
    const progreso = calcularProgresoSemanaActual();
    console.log(`Tracking automático actualizado: ${progreso.paginas} páginas, ${progreso.tests} tests`);
    
    // Opcional: mostrar notificación visual del progreso
    // mostrarNotificacionProgreso(progreso);
}

// Función para mostrar notificación de progreso (opcional)
function mostrarNotificacionProgreso(progreso) {
    // Crear o actualizar un pequeño indicador en la interfaz
    let indicador = document.getElementById('indicadorProgreso');
    if (!indicador) {
        indicador = document.createElement('div');
        indicador.id = 'indicadorProgreso';
        indicador.style.cssText = `
            position: fixed;
            top: 70px;
            right: 20px;
            background: rgba(34, 197, 94, 0.9);
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            z-index: 1001;
            transition: opacity 0.3s;
        `;
        document.body.appendChild(indicador);
    }
    
    indicador.textContent = `📊 Semana actual: ${progreso.paginas} pág, ${progreso.tests} tests`;
    indicador.style.opacity = '1';
    
    // Ocultar después de 3 segundos
    setTimeout(() => {
        if (indicador) indicador.style.opacity = '0';
    }, 3000);
}
// Hacer funciones accesibles globalmente
window.mostrarModalEstadisticas = mostrarModalEstadisticas;
// Hacer accesibles las funciones globalmente
window.mostrarModalEstadisticas = mostrarModalEstadisticas;
window.cerrarModalEstadisticas = cerrarModalEstadisticas;
// ===== FUNCIONALIDAD PLANNING DE ESTUDIO =====

function abrirModalPlanning() {
    console.log('Abriendo modal planning...');
    
    // Generar checkboxes de temas
    generarCheckboxesTemas();
    
    // Establecer fecha mínima como mañana
    const mañana = new Date();
    mañana.setDate(mañana.getDate() + 1);
    document.getElementById('fechaLimite').min = mañana.toISOString().split('T')[0];
    
    // Ocultar resultados y mostrar formulario
    document.getElementById('resultadosPlanning').style.display = 'none';
    document.querySelector('.planning-form').style.display = 'block';
    
    // Configurar event listener del botón calcular
    const calcularBtn = document.getElementById('calcularPlanningBtn');
    calcularBtn.onclick = calcularPlanning;
    
    document.getElementById('modalCrearPlanning').style.display = 'block';
}

function cerrarModalPlanning() {
    document.getElementById('modalCrearPlanning').style.display = 'none';
}

function generarCheckboxesTemas() {
    const container = document.getElementById('temasSeleccionados');
    container.innerHTML = '';
    
    if (!progresoData || !progresoData.temas) {
        container.innerHTML = '<p style="color: #6b7280;">No hay temas disponibles</p>';
        return;
    }
    
    // Añadir checkbox "Seleccionar todos"
    const selectAllDiv = document.createElement('div');
    selectAllDiv.className = 'checkbox-item';
    selectAllDiv.style.borderBottom = '2px solid #e5e7eb';
    selectAllDiv.style.marginBottom = '15px';
    selectAllDiv.style.paddingBottom = '10px';
    
    selectAllDiv.innerHTML = `
        <input type="checkbox" id="selectAllTemas">
        <label for="selectAllTemas" style="font-weight: 700; color: #374151;">
            📋 Seleccionar todos los temas
        </label>
    `;
    
    container.appendChild(selectAllDiv);
    
    // Ordenar temas igual que en la tabla
    const temasOrdenados = Object.entries(progresoData.temas).sort(([idA], [idB]) => {
        const temaA = temasDelBanco.find(t => t.id === idA);
        const temaB = temasDelBanco.find(t => t.id === idB);
        
        if (!temaA || !temaB) return 0;
        
        const nombreA = temaA.nombre;
        const nombreB = temaB.nombre;
        
        const numeroA = nombreA.match(/\d+/);
        const numeroB = nombreB.match(/\d+/);
        
        if (numeroA && numeroB) {
            return parseInt(numeroA[0]) - parseInt(numeroB[0]);
        } else {
            return nombreA.localeCompare(nombreB);
        }
    });
    
    // Calcular vuelta mínima global de TODOS los temas para los checkboxes
    const todasLasVueltas = Object.values(progresoData.temas).map(t => t.vueltaActual || 1);
    const vueltaMinimaGlobalTotal = Math.min(...todasLasVueltas);
    
    temasOrdenados.forEach(([temaId, temaProgreso]) => {
        const checkboxDiv = document.createElement('div');
        checkboxDiv.className = 'checkbox-item';
        
        const vueltaTema = temaProgreso.vueltaActual || 1;
        let paginasPendientes;
        let estadoTema;
        
        if (vueltaTema < vueltaMinimaGlobalTotal) {
            paginasPendientes = temaProgreso.paginasTotales - temaProgreso.paginasEstudiadas;
            estadoTema = `${temaProgreso.paginasEstudiadas}/${temaProgreso.paginasTotales} leídas - ${paginasPendientes} pendientes en ${obtenerNombreVuelta(vueltaTema)}`;
        } else if (vueltaTema === vueltaMinimaGlobalTotal) {
            paginasPendientes = Math.max(0, temaProgreso.paginasTotales - temaProgreso.paginasEstudiadas);
            estadoTema = `${temaProgreso.paginasEstudiadas}/${temaProgreso.paginasTotales} leídas - ${paginasPendientes} pendientes en ${obtenerNombreVuelta(vueltaTema)}`;
        } else {
            paginasPendientes = 0;
            estadoTema = `✅ Completado en ${obtenerNombreVuelta(vueltaMinimaGlobalTotal)} (en ${obtenerNombreVuelta(vueltaTema)})`;
        }
        
        checkboxDiv.innerHTML = `
            <input type="checkbox" id="tema_${temaId}" value="${temaId}" ${paginasPendientes > 0 ? '' : 'disabled'}>
            <label for="tema_${temaId}">
                ${temaProgreso.nombre}
                <span class="tema-info">(${estadoTema})</span>
            </label>
        `;
        
        container.appendChild(checkboxDiv);
    });
    
    // Configurar funcionalidad "Seleccionar todos"
    const selectAllCheckbox = document.getElementById('selectAllTemas');
    const temaCheckboxes = container.querySelectorAll('input[type="checkbox"]:not(#selectAllTemas)');
    
    selectAllCheckbox.addEventListener('change', function() {
        temaCheckboxes.forEach(checkbox => {
            if (!checkbox.disabled) {
                checkbox.checked = this.checked;
            }
        });
    });
    
    // Actualizar "Seleccionar todos" cuando cambian los checkboxes individuales
    temaCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const temasHabilitados = Array.from(temaCheckboxes).filter(cb => !cb.disabled);
            const temasSeleccionados = temasHabilitados.filter(cb => cb.checked);
            
            selectAllCheckbox.checked = temasSeleccionados.length === temasHabilitados.length;
            selectAllCheckbox.indeterminate = temasSeleccionados.length > 0 && temasSeleccionados.length < temasHabilitados.length;
        });
    });
}

function calcularPlanning() {
    const temasSeleccionados = [];
    const checkboxes = document.querySelectorAll('#temasSeleccionados input[type="checkbox"]:checked');
    const fechaLimite = new Date(document.getElementById('fechaLimite').value);
    
    // Validaciones
    if (checkboxes.length === 0) {
        alert('Selecciona al menos un tema para el planning');
        return;
    }
    
    if (!fechaLimite || fechaLimite <= new Date()) {
        alert('Selecciona una fecha límite válida (futura)');
        return;
    }
    
    // CALCULAR VUELTA MÍNIMA GLOBAL de los temas seleccionados
    let vueltaMinimaGlobal = Infinity;
    checkboxes.forEach(checkbox => {
        const temaId = checkbox.value;
        const temaProgreso = progresoData.temas[temaId];
        if (temaProgreso) {
            const vueltaTema = temaProgreso.vueltaActual || 1;
            if (vueltaTema < vueltaMinimaGlobal) {
                vueltaMinimaGlobal = vueltaTema;
            }
        }
    });
    
    console.log(`Vuelta mínima global del planning: ${vueltaMinimaGlobal}`);
    
    // Recopilar datos de temas seleccionados (basado en vuelta mínima global)
    checkboxes.forEach(checkbox => {
        const temaId = checkbox.value;
        const temaProgreso = progresoData.temas[temaId];
        
        if (temaProgreso) {
            const vueltaTema = temaProgreso.vueltaActual || 1;
            let paginasPendientes;
            
            if (vueltaTema < vueltaMinimaGlobal) {
                // Este tema está ATRASADO respecto a la vuelta global
                paginasPendientes = temaProgreso.paginasTotales - temaProgreso.paginasEstudiadas;
            } else if (vueltaTema === vueltaMinimaGlobal) {
                // Este tema está EN la vuelta global
                paginasPendientes = Math.max(0, temaProgreso.paginasTotales - temaProgreso.paginasEstudiadas);
            } else {
                // Este tema está ADELANTADO, ya completó la vuelta global
                paginasPendientes = 0;
            }
            
            temasSeleccionados.push({
                id: temaId,
                nombre: temaProgreso.nombre,
                paginasTotales: temaProgreso.paginasTotales,
                paginasEstudiadas: temaProgreso.paginasEstudiadas,
                paginasPendientes: paginasPendientes,
                vueltaActual: temaProgreso.vueltaActual,
                vueltaMinimaGlobal: vueltaMinimaGlobal
            });
        }
    });
    
    // Calcular planning
    const resultados = procesarPlanning(temasSeleccionados, fechaLimite);
    
    // Mostrar resultados
    mostrarResultadosPlanning(resultados, temasSeleccionados, fechaLimite);
}

function procesarPlanning(temas, fechaLimite) {
    const hoy = new Date();
    const diasDisponibles = Math.ceil((fechaLimite - hoy) / (1000 * 60 * 60 * 24));
    const semanasDisponibles = Math.round(diasDisponibles / 7 * 10) / 10; // Redondear a 1 decimal
    
    // Calcular totales
    const totalPaginasPendientes = temas.reduce((sum, tema) => sum + tema.paginasPendientes, 0);
    
    // Cálculos de distribución
    const paginasPorDia = (totalPaginasPendientes / diasDisponibles).toFixed(1);
    const paginasPorSemana = Math.ceil(totalPaginasPendientes / semanasDisponibles);
    
    // Tests recomendados por tema (basado en páginas)
    const temasConTests = temas.map(tema => {
        // Fórmula: 1 test cada 10-15 páginas, mínimo 2 tests por tema
        const testsRecomendados = Math.max(2, Math.ceil(tema.paginasTotales / 12));
        return {
            ...tema,
            testsRecomendados
        };
    });
    
    const totalTestsRecomendados = temasConTests.reduce((sum, tema) => sum + tema.testsRecomendados, 0);
    
    return {
        diasDisponibles,
        semanasDisponibles,
        totalPaginasPendientes,
        paginasPorDia,
        paginasPorSemana,
        totalTestsRecomendados,
        temasConTests
    };
}

function mostrarResultadosPlanning(resultados, temasOriginales, fechaLimite) {
    // Ocultar formulario y mostrar resultados
    document.querySelector('.planning-form').style.display = 'none';
    document.getElementById('resultadosPlanning').style.display = 'block';
    
    const container = document.getElementById('resumenPlanning');
    
    const fechaFormateada = fechaLimite.toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    container.innerHTML = `
        <div class="resultado-item">
            <div class="resultado-titulo">📅 Plazo disponible</div>
            <div class="resultado-valor">${resultados.diasDisponibles} días (${resultados.semanasDisponibles} semanas)</div>
            <div class="resultado-descripcion">Hasta el ${fechaFormateada}</div>
        </div>
        
        <div class="resultado-item">
            <div class="resultado-titulo">📚 Total páginas pendientes</div>
            <div class="resultado-valor">${resultados.totalPaginasPendientes} páginas</div>
            <div class="resultado-descripcion">De ${temasOriginales.length} temas seleccionados</div>
        </div>
        
        <div class="resultado-item">
            <div class="resultado-titulo">📖 Ritmo diario requerido</div>
            <div class="resultado-valor">${resultados.paginasPorDia} páginas/día</div>
            <div class="resultado-descripcion">Distribución uniforme recomendada</div>
        </div>
        
        <div class="resultado-item">
            <div class="resultado-titulo">📊 Ritmo semanal requerido</div>
            <div class="resultado-valor">${resultados.paginasPorSemana} páginas/semana</div>
            <div class="resultado-descripcion">Permite flexibilidad en la planificación</div>
        </div>
        
        <div class="resultado-item">
            <div class="resultado-titulo">🎯 Tests recomendados</div>
            <div class="resultado-valor">${resultados.totalTestsRecomendados} tests totales</div>
            <div class="resultado-descripcion">Distribuidos según extensión de cada tema</div>
        </div>
        
        <div class="temas-detalle">
            <h5 style="margin-bottom: 15px; color: #374151;">📅 Detalle por semana:</h5>
            ${generarDetalleSemanal(temasOriginales, resultados, fechaLimite)}
        </div>
        
        <div class="form-actions">
            <button id="guardarPlanningBtn" class="btn-primary">💾 Guardar Planning</button>
            <button onclick="cerrarModalPlanning()" class="btn-secondary">Cerrar</button>
        </div>
    `;
    
    // Configurar botón guardar con mejor manejo de errores
    setTimeout(() => {
        const btnGuardar = document.getElementById('guardarPlanningBtn');
        if (btnGuardar) {
            btnGuardar.onclick = async () => {
                try {
                    btnGuardar.disabled = true;
                    btnGuardar.textContent = '💾 Guardando...';
                    await guardarPlanning(temasOriginales, resultados, fechaLimite);
                } catch (error) {
                    console.error('Error al guardar planning:', error);
                    alert('Error al guardar el planning: ' + error.message);
                    btnGuardar.disabled = false;
                    btnGuardar.textContent = '💾 Guardar Planning';
                }
            };
        }
    }, 100);
}

// Variables para planning guardado
let planningGuardado = null;

// Hacer funciones accesibles globalmente
window.abrirModalPlanning = abrirModalPlanning;
window.cerrarModalPlanning = cerrarModalPlanning;
window.abrirModalSeguimiento = abrirModalSeguimiento;
window.cerrarModalSeguimiento = cerrarModalSeguimiento;
window.cerrarModalReporte = cerrarModalReporte;

// Cargar planning guardado al inicializar
async function cargarPlanningGuardado() {
    try {
        const planningDoc = await getDoc(doc(db, "planning", currentUser.uid));
        if (planningDoc.exists()) {
            planningGuardado = planningDoc.data();
            console.log('Planning guardado encontrado');
        } else {
            planningGuardado = null;
            console.log('No hay planning guardado');
        }
    } catch (error) {
        console.error('Error cargando planning:', error);
        planningGuardado = null;
    }
}

// Función para guardar planning
async function guardarPlanning(datos, resultados, fechaLimite) {
    try {
        console.log('Iniciando guardado de planning...');
        console.log('Datos:', datos);
        console.log('Resultados:', resultados);
        console.log('Fecha límite:', fechaLimite);
        
        if (!currentUser) {
            throw new Error('Usuario no autenticado');
        }
        
        if (!datos || datos.length === 0) {
            throw new Error('No hay temas seleccionados');
        }
        
        if (!fechaLimite || fechaLimite <= new Date()) {
            throw new Error('Fecha límite inválida');
        }
        
        const planningData = {
            usuarioId: currentUser.uid,
            fechaCreacion: new Date(),
            fechaLimite: fechaLimite,
            temas: datos,
            resultados: resultados,
            semanas: generarSemanasPlanning(resultados, fechaLimite),
            ultimaActualizacion: new Date()
        };
        
        console.log('Datos del planning a guardar:', planningData);
        
        await setDoc(doc(db, "planning", currentUser.uid), planningData);
        planningGuardado = planningData;
        
        console.log('Planning guardado exitosamente en Firebase');
        
        alert('✅ Planning guardado exitosamente\n\nYa puedes usar "Seguimiento Planning" para hacer seguimiento semanal de tu progreso.');
        
        // Cerrar el modal después de guardar
cerrarModalPlanning();

// Reinicializar tracking automático con el nuevo planning
await inicializarTrackingAutomatico();
        
    } catch (error) {
        console.error('Error detallado al guardar planning:', error);
        throw error; // Re-lanzar el error para que lo capture el botón
    }
}

// Función para generar semanas del planning CON temas asignados
function generarSemanasPlanning(resultados, fechaLimite) {
    const semanas = [];
    const fechaInicio = new Date();
    const paginasPorDia = parseFloat(resultados.paginasPorDia);
    const paginasPorSemana = Math.ceil(paginasPorDia * 7);
    
    // Crear lista de temas con sus páginas pendientes
    const temasConPaginas = resultados.temasConTests.map(tema => ({
        nombre: tema.nombre,
        paginasPendientes: tema.paginasPendientes,
        paginasRestantes: tema.paginasPendientes
    }));
    
    let temaActualIndex = 0;
    let paginasDelTemaActual = temasConPaginas[0] ? temasConPaginas[0].paginasRestantes : 0;
    
    for (let i = 0; i < Math.ceil(resultados.semanasDisponibles); i++) {
        const fechaInicioSemana = new Date(fechaInicio);
        fechaInicioSemana.setDate(fechaInicio.getDate() + (i * 7));
        
        const fechaFinSemana = new Date(fechaInicioSemana);
        fechaFinSemana.setDate(fechaInicioSemana.getDate() + 6);
        
        if (fechaFinSemana > fechaLimite) {
            fechaFinSemana.setTime(fechaLimite.getTime());
        }
        
        // Calcular qué temas se estudiarán esta semana
        const temasEstaSemana = [];
        let paginasAsignadasEstaSemana = 0;
        
        while (paginasAsignadasEstaSemana < paginasPorSemana && temaActualIndex < temasConPaginas.length) {
            const temaActual = temasConPaginas[temaActualIndex];
            const paginasQueFaltan = paginasPorSemana - paginasAsignadasEstaSemana;
            
            if (paginasDelTemaActual <= paginasQueFaltan) {
                // El tema completo cabe en esta semana
                temasEstaSemana.push({
                    nombre: temaActual.nombre,
                    paginas: paginasDelTemaActual,
                    completo: true
                });
                paginasAsignadasEstaSemana += paginasDelTemaActual;
                
                // Avanzar al siguiente tema
                temaActualIndex++;
                if (temaActualIndex < temasConPaginas.length) {
                    paginasDelTemaActual = temasConPaginas[temaActualIndex].paginasRestantes;
                }
            } else {
                // El tema NO cabe completo, se divide
                temasEstaSemana.push({
                    nombre: temaActual.nombre,
                    paginas: paginasQueFaltan,
                    completo: false
                });
                paginasAsignadasEstaSemana += paginasQueFaltan;
                paginasDelTemaActual -= paginasQueFaltan;
            }
        }
        
        semanas.push({
            numero: i + 1,
            fechaInicio: fechaInicioSemana,
            fechaFin: fechaFinSemana,
            objetivoPaginas: paginasAsignadasEstaSemana,
            objetivoTests: Math.ceil(resultados.totalTestsRecomendados / resultados.semanasDisponibles),
            temasAsignados: temasEstaSemana, // AGREGAR TEMAS ASIGNADOS
            estado: 'pendiente',
            paginasReales: 0,
            testsReales: 0,
            fechaReporte: null
        });
    }
    
    return semanas;
}
// Función para generar el HTML del detalle semanal
function generarDetalleSemanal(temas, resultados, fechaLimite) {
    const fechaInicio = new Date();
    const paginasPorDia = parseFloat(resultados.paginasPorDia);
    const paginasPorSemana = Math.ceil(paginasPorDia * 7);
    
    // Crear lista de temas con sus páginas pendientes
    const temasConPaginas = temas.map(tema => ({
        nombre: tema.nombre,
        paginasPendientes: tema.paginasPendientes,
        paginasRestantes: tema.paginasPendientes
    }));
    
    let html = '';
    let temaActualIndex = 0;
    let paginasDelTemaActual = temasConPaginas[0].paginasRestantes;
    
    for (let i = 0; i < Math.ceil(resultados.semanasDisponibles); i++) {
        const fechaInicioSemana = new Date(fechaInicio);
        fechaInicioSemana.setDate(fechaInicio.getDate() + (i * 7));
        
        const fechaFinSemana = new Date(fechaInicioSemana);
        fechaFinSemana.setDate(fechaInicioSemana.getDate() + 6);
        
        if (fechaFinSemana > fechaLimite) {
            fechaFinSemana.setTime(fechaLimite.getTime());
        }
        
        const fechaInicioStr = fechaInicioSemana.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
        const fechaFinStr = fechaFinSemana.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
        
        // Calcular qué temas se estudiarán esta semana
        const temasEstaSemana = [];
        let paginasAsignadasEstaSemana = 0;
        
        while (paginasAsignadasEstaSemana < paginasPorSemana && temaActualIndex < temasConPaginas.length) {
            const temaActual = temasConPaginas[temaActualIndex];
            const paginasQueFaltan = paginasPorSemana - paginasAsignadasEstaSemana;
            
            if (paginasDelTemaActual <= paginasQueFaltan) {
                // El tema completo cabe en esta semana
                temasEstaSemana.push({
                    nombre: temaActual.nombre,
                    paginas: paginasDelTemaActual,
                    completo: true
                });
                paginasAsignadasEstaSemana += paginasDelTemaActual;
                
                // Avanzar al siguiente tema
                temaActualIndex++;
                if (temaActualIndex < temasConPaginas.length) {
                    paginasDelTemaActual = temasConPaginas[temaActualIndex].paginasRestantes;
                }
            } else {
                // El tema NO cabe completo, se divide
                temasEstaSemana.push({
                    nombre: temaActual.nombre,
                    paginas: paginasQueFaltan,
                    completo: false
                });
                paginasAsignadasEstaSemana += paginasQueFaltan;
                paginasDelTemaActual -= paginasQueFaltan;
            }
        }
        
        // Generar HTML para esta semana
        const temasHTML = temasEstaSemana.map(t => 
            `<div style="font-size: 13px; color: #374151; padding: 4px 0;">
                ${t.completo ? '✅' : '📖'} ${t.nombre}: ${t.paginas} pág. ${t.completo ? '(completo)' : '(parcial)'}
            </div>`
        ).join('');
        
        html += `
            <div class="semana-planning">
                <div class="semana-planning-header">
                    <strong>Semana ${i + 1}</strong>
                    <span style="color: #6b7280; font-size: 13px;">${fechaInicioStr} - ${fechaFinStr}</span>
                </div>
                <div class="semana-planning-objetivo">
                    <strong>Objetivo:</strong> ${paginasAsignadasEstaSemana} páginas
                </div>
                <div class="semana-planning-temas">
                    ${temasHTML}
                </div>
            </div>
        `;
    }
    
    return html;
}
// Función para eliminar planning
async function eliminarPlanning() {
    if (!planningGuardado) return;
    
    const confirmar = confirm('¿Estás seguro de que quieres eliminar el planning actual? Esta acción no se puede deshacer.');
    
    if (confirmar) {
        try {
            // Eliminar de Firebase
            await deleteDoc(doc(db, "planning", currentUser.uid));
            
            // Limpiar datos locales
            planningGuardado = null;
            
            // Planning eliminado exitosamente
            console.log('Planning eliminado correctamente');
            
            // Cerrar modal
            cerrarModalSeguimiento();
            
            alert('Planning eliminado exitosamente');
            
        } catch (error) {
            console.error('Error eliminando planning:', error);
            alert('Error al eliminar el planning');
        }
    }
}

// Modales de seguimiento
function abrirModalSeguimiento() {
    if (!planningGuardado) {
        alert('⚠️ Primero debes crear un planning\n\nPara usar el seguimiento de planning:\n1. Haz clic en "Crear Planning de Estudio"\n2. Selecciona los temas y fecha límite\n3. Calcula el planning\n4. Guarda el planning\n\nDespués podrás hacer seguimiento semanal de tu progreso.');
        return;
    }
    
    // Mostrar información del planning
    mostrarInformacionPlanning();
    
    // Mostrar semanas
    mostrarSemanasPlanning();
    
    // Configurar event listeners
    document.getElementById('eliminarPlanningBtn').onclick = eliminarPlanning;
    
    document.getElementById('modalSeguimientoPlanning').style.display = 'block';
}

function cerrarModalSeguimiento() {
    document.getElementById('modalSeguimientoPlanning').style.display = 'none';
}

function cerrarModalReporte() {
    document.getElementById('modalReportarSemana').style.display = 'none';
}

function mostrarInformacionPlanning() {
    const titulo = document.getElementById('planningTitulo');
    const resumen = document.getElementById('planningResumen');
    
    let fechaLimiteObj;
    if (planningGuardado.fechaLimite?.toDate) {
        fechaLimiteObj = planningGuardado.fechaLimite.toDate();
    } else {
        fechaLimiteObj = new Date(planningGuardado.fechaLimite);
    }

    const fechaLimite = fechaLimiteObj.toLocaleDateString('es-ES');
    titulo.textContent = `Planning hasta ${fechaLimite}`;
    
    // Calcular progreso TOTAL dinámico en tiempo real
    let paginasTotalesRealizadas = 0;
    let testsTotalesRealizados = 0;
    
    planningGuardado.temas.forEach(temaPlanning => {
        const temaProgreso = progresoData.temas[temaPlanning.id];
        if (temaProgreso) {
            paginasTotalesRealizadas += temaProgreso.paginasEstudiadas || 0;
            testsTotalesRealizados += (temaProgreso.testsAutomaticos || 0) + (temaProgreso.testsManuales || 0);
        }
    });
    
    const paginasRestantes = Math.max(0, planningGuardado.resultados.totalPaginasPendientes - paginasTotalesRealizadas);
    const testsRestantes = Math.max(0, planningGuardado.resultados.totalTestsRecomendados - testsTotalesRealizados);
    
    const diasRestantes = Math.ceil((fechaLimiteObj - new Date()) / (1000 * 60 * 60 * 24));
    let nuevasPaginasPorDia = diasRestantes > 0 ? (paginasRestantes / diasRestantes).toFixed(1) : '0.0';
    
    const porcentajeCompletado = planningGuardado.resultados.totalPaginasPendientes > 0 
        ? Math.round((paginasTotalesRealizadas / planningGuardado.resultados.totalPaginasPendientes) * 100)
        : 0;
    
    resumen.innerHTML = `
        <div class="resumen-item destacado">
            <strong>📊 Progreso Total:</strong> ${porcentajeCompletado}%
            <div class="barra-progreso-planning">
                <div class="barra-fill" style="width: ${porcentajeCompletado}%"></div>
            </div>
        </div>
        <div class="resumen-item">
            <strong>📖 Páginas realizadas:</strong> ${paginasTotalesRealizadas} / ${planningGuardado.resultados.totalPaginasPendientes}
        </div>
        <div class="resumen-item">
            <strong>📚 Páginas restantes:</strong> ${paginasRestantes}
        </div>
        <div class="resumen-item">
            <strong>📈 Páginas/día necesarias:</strong> ${nuevasPaginasPorDia}
        </div>
        <div class="resumen-item">
            <strong>🎯 Tests realizados:</strong> ${testsTotalesRealizados} / ${planningGuardado.resultados.totalTestsRecomendados}
        </div>
        <div class="resumen-item">
            <strong>⏱️ Tests restantes:</strong> ${testsRestantes}
        </div>
        <div class="resumen-item">
            <strong>📅 Días restantes:</strong> ${Math.max(0, diasRestantes)}
        </div>
        <div class="resumen-item">
            <strong>🎓 Temas en planning:</strong> ${planningGuardado.temas.length}
        </div>
    `;
}

async function recalcularPlanningDesdeIncumplido() {
    cerrarModalSeguimiento();
    abrirModalPlanning();
}

window.recalcularPlanningDesdeIncumplido = recalcularPlanningDesdeIncumplido;
async function mostrarSemanasPlanning() {
    const container = document.getElementById('listaSemanas');
    container.innerHTML = '';
    
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    for (const semana of planningGuardado.semanas) {
        // Convertir fechas de forma segura
        const fechaInicioObj = semana.fechaInicio?.toDate ? semana.fechaInicio.toDate() : new Date(semana.fechaInicio);
        const fechaFinObj = semana.fechaFin?.toDate ? semana.fechaFin.toDate() : new Date(semana.fechaFin);
        
        fechaInicioObj.setHours(0, 0, 0, 0);
        fechaFinObj.setHours(23, 59, 59, 999);
        
        const fechaInicio = fechaInicioObj.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
        const fechaFin = fechaFinObj.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
        
        // Determinar si la semana está activa, pasada o futura
        const esSemanaActiva = hoy >= fechaInicioObj && hoy <= fechaFinObj;
        const esPasada = hoy > fechaFinObj;
        const esFutura = hoy < fechaInicioObj;
        
        // Calcular progreso dinámico en tiempo real
        let paginasReales = 0;
        let testsReales = 0;
        
        // Calcular vuelta mínima global del planning actual
        let vueltaMinimaPlanning = Infinity;
        if (planningGuardado && planningGuardado.temas) {
            planningGuardado.temas.forEach(temaPlanning => {
                const temaProgreso = progresoData.temas[temaPlanning.id];
                if (temaProgreso) {
                    const vueltaTema = temaProgreso.vueltaActual || 1;
                    if (vueltaTema < vueltaMinimaPlanning) {
                        vueltaMinimaPlanning = vueltaTema;
                    }
                }
            });
        }
        
        // Construir mapa de páginas leídas ACUMULADAS hasta esta semana
        let paginasAcumuladasHastaSemanaAnterior = {};
        
        for (let i = 0; i < semana.numero - 1; i++) {
            const semanaAnterior = planningGuardado.semanas[i];
            if (semanaAnterior && semanaAnterior.temasAsignados) {
                semanaAnterior.temasAsignados.forEach(temaAsignado => {
                    const temaEncontrado = planningGuardado.temas.find(t => t.nombre === temaAsignado.nombre);
                    if (temaEncontrado) {
                        if (!paginasAcumuladasHastaSemanaAnterior[temaEncontrado.id]) {
                            paginasAcumuladasHastaSemanaAnterior[temaEncontrado.id] = 0;
                        }
                        paginasAcumuladasHastaSemanaAnterior[temaEncontrado.id] += temaAsignado.paginas;
                    }
                });
            }
        }
        
        // Verificar qué temas de esta semana ya están completados
        const temasCompletadosEstaSemana = [];
        const temasRestantesEstaSemana = [];
        let paginasObjetivoAjustado = 0;
        let paginasLeidasEstaSemana = 0;
        
        if (semana.temasAsignados) {
            semana.temasAsignados.forEach(temaAsignado => {
                const temaEncontrado = planningGuardado.temas.find(t => t.nombre === temaAsignado.nombre);
                if (temaEncontrado) {
                    const temaProgreso = progresoData.temas[temaEncontrado.id];
                    if (temaProgreso) {
                        const vueltaTema = temaProgreso.vueltaActual || 1;
                        const paginasActuales = temaProgreso.paginasEstudiadas || 0;
                        const paginasTotales = temaProgreso.paginasTotales || 0;
                        
                        // Páginas que debería tener leídas ANTES de empezar esta semana
                        const paginasEsperadasAnteriores = paginasAcumuladasHastaSemanaAnterior[temaEncontrado.id] || 0;
                        
                        // Páginas que debería tener al TERMINAR esta semana
                        const paginasEsperadasTotal = paginasEsperadasAnteriores + temaAsignado.paginas;
                        
                        // Tema completado en vuelta superior
                        if (vueltaTema > vueltaMinimaPlanning) {
                            temasCompletadosEstaSemana.push({
                                nombre: temaAsignado.nombre,
                                paginasObjetivo: temaAsignado.paginas
                            });
                            paginasLeidasEstaSemana += temaAsignado.paginas;
                        }
                        // Tema completado en vuelta actual
                        else if (vueltaTema === vueltaMinimaPlanning && paginasActuales >= paginasTotales) {
                            temasCompletadosEstaSemana.push({
                                nombre: temaAsignado.nombre,
                                paginasObjetivo: temaAsignado.paginas
                            });
                            paginasLeidasEstaSemana += temaAsignado.paginas;
                        }
                        // Tema ya completado ANTES de esta semana
                        else if (paginasActuales >= paginasEsperadasTotal) {
                            temasCompletadosEstaSemana.push({
                                nombre: temaAsignado.nombre,
                                paginasObjetivo: temaAsignado.paginas
                            });
                            paginasLeidasEstaSemana += temaAsignado.paginas;
                        }
                        // Tema pendiente
                        else {
                            const paginasLeidasDeTema = Math.max(0, paginasActuales - paginasEsperadasAnteriores);
                            
                            temasRestantesEstaSemana.push({
                                nombre: temaAsignado.nombre,
                                id: temaEncontrado.id,
                                paginasObjetivo: temaAsignado.paginas,
                                paginasLeidas: paginasLeidasDeTema
                            });
                            
                            paginasObjetivoAjustado += temaAsignado.paginas;
                            paginasLeidasEstaSemana += paginasLeidasDeTema;
                        }
                    }
                }
            });
        }
        
        paginasReales = paginasLeidasEstaSemana;
        
        // Solo trackear si la semana está "en curso"
        const debeTrackear = semana.estado === 'pendiente' || !semana.estado || 
                            (esSemanaActiva && semana.estado !== 'cumplido' && semana.estado !== 'incumplido');
        
        if (!debeTrackear) {
            paginasReales = semana.paginasReales || 0;
            testsReales = semana.testsReales || 0;
        } else {
            // SOLO contar tests si la semana ya ha comenzado
        if (hoy >= fechaInicioObj) {
            // Calcular tests de esta semana usando datosInicioSemana
            if (semana.datosInicioSemana && semana.temasAsignados) {
                // Contar tests ACTUALES de los temas de esta semana
                let testsActualesSemana = 0;
                semana.temasAsignados.forEach(temaAsignado => {
                    const temaEncontrado = planningGuardado.temas.find(t => t.nombre === temaAsignado.nombre);
                    if (temaEncontrado) {
                        const temaProgreso = progresoData.temas[temaEncontrado.id];
                        if (temaProgreso) {
                            testsActualesSemana += (temaProgreso.testsAutomaticos || 0) + (temaProgreso.testsManuales || 0);
                        }
                    }
                });
                
                // Restar los tests iniciales de la semana
                const testsIniciales = semana.datosInicioSemana.testsIniciales || 0;
                const testsRealizadosSemana = Math.max(0, testsActualesSemana - testsIniciales);
                
                // LIMITAR al objetivo: no contar más del objetivo
                testsReales = Math.min(testsRealizadosSemana, semana.objetivoTests);
                
            } else if (semana.temasAsignados) {
                // Si no hay datos de inicio, contar tests actuales de los temas
                let testsContados = 0;
                semana.temasAsignados.forEach(temaAsignado => {
                    const temaEncontrado = planningGuardado.temas.find(t => t.nombre === temaAsignado.nombre);
                    if (temaEncontrado) {
                        const temaProgreso = progresoData.temas[temaEncontrado.id];
                        if (temaProgreso) {
                            testsContados += (temaProgreso.testsAutomaticos || 0) + (temaProgreso.testsManuales || 0);
                        }
                    }
                });
                
                // LIMITAR al objetivo
                testsReales = Math.min(testsContados, semana.objetivoTests);
            }
        } else {
            // Semana futura: 0 tests
            testsReales = 0;
        }
        }
        
        // Ajustar objetivo de páginas si hay temas completados
        const objetivoPaginasReal = paginasObjetivoAjustado > 0 ? paginasObjetivoAjustado : semana.objetivoPaginas;
        
        // Obtener temas de esta semana con indicador de completados
        let temasHTML = '';
        
        if (semana.temasAsignados && semana.temasAsignados.length > 0) {
            temasCompletadosEstaSemana.forEach(tema => {
                temasHTML += `<div class="tema-semana-item" style="color: #10b981;">
                    ✅ ${tema.nombre}: ${tema.paginasObjetivo} pág. (objetivo cumplido)
                </div>`;
            });
            
            temasRestantesEstaSemana.forEach(tema => {
                const temaAsignado = semana.temasAsignados.find(t => t.nombre === tema.nombre);
                if (temaAsignado) {
                    temasHTML += `<div class="tema-semana-item">
                        ${temaAsignado.completo ? '✅' : '📖'} ${tema.nombre}: ${tema.paginasObjetivo} pág. ${temaAsignado.completo ? '(completo)' : '(parcial)'}
                    </div>`;
                }
            });
        } else {
            temasHTML = '<div class="tema-semana-item">Sin temas asignados</div>';
        }
        
        // Determinar estado y mensaje
        let estadoClass = '';
        let estadoTexto = '';
        let mensajeEstado = '';
        
        if (esFutura) {
            estadoClass = 'estado-pendiente';
            estadoTexto = '⏳ Pendiente';
            mensajeEstado = '';
        } else if (esSemanaActiva) {
            const cumplePaginas = paginasReales >= objetivoPaginasReal;
            const cumpleTests = testsReales >= semana.objetivoTests;
            
            // Calcular si SUPERÓ los objetivos (no solo cumplió)
            const superoPaginas = paginasReales > objetivoPaginasReal;
            const superoTests = testsReales > semana.objetivoTests;
            
            if (cumplePaginas && cumpleTests) {
                semana.estado = 'cumplido';
                semana.paginasReales = paginasReales;
                semana.testsReales = testsReales;
                await guardarCambiosPlanning();
                
                estadoClass = 'estado-cumplido';
                estadoTexto = '🎉 Cumplido';
                
                mensajeEstado = '<div class="mensaje-exito"><p>¡Felicidades! Has cumplido tus objetivos esta semana.</p></div>';
            } else {
                estadoClass = 'estado-en-curso';
                estadoTexto = '📊 En curso';
                mensajeEstado = '';
            }
        } else if (esPasada) {
            const cumplePaginas = paginasReales >= objetivoPaginasReal;
            const cumpleTests = testsReales >= semana.objetivoTests;
            
            if (cumplePaginas && cumpleTests) {
                estadoClass = 'estado-cumplido';
                estadoTexto = '✅ Cumplido';
                mensajeEstado = '';
            } else {
                estadoClass = 'estado-incumplido';
                estadoTexto = '❌ No cumplido';
                mensajeEstado = `
                    <div class="mensaje-error">
                        <p>Lo siento, no has cumplido los objetivos de esta semana.</p>
                        <div class="acciones-semana-incumplida">
                            <button onclick="eliminarPlanning()" class="btn-eliminar-planning">🗑️ Eliminar Planning</button>
                        </div>
                    </div>
                `;
            }
        }
        
        const semanaDiv = document.createElement('div');
        semanaDiv.className = `semana-item ${estadoClass}`;
        
        semanaDiv.innerHTML = `
            <div class="semana-header">
                <div class="semana-titulo">Semana ${semana.numero}</div>
                <div class="semana-estado ${estadoClass}">${estadoTexto}</div>
            </div>
            <div class="semana-fechas">
                📅 ${fechaInicio} - ${fechaFin}
            </div>
            <div class="semana-temas">
                <strong>📚 Temas de esta semana:</strong>
                ${temasHTML}
            </div>
            <div class="semana-progreso">
                <div class="progreso-item">
                    <div class="progreso-label">📖 Páginas:</div>
                    <div class="progreso-valor ${paginasReales >= objetivoPaginasReal ? 'cumplido' : ''}">
                        ${paginasReales} / ${objetivoPaginasReal}
                        ${temasCompletadosEstaSemana.length > 0 ? `<br><small style="font-size: 10px; color: #10b981;">${temasCompletadosEstaSemana.length} tema(s) ya cumplido(s)</small>` : ''}
                    </div>
                </div>
               <div class="progreso-item">
                    <div class="progreso-label">🎯 Tests esta semana:</div>
                    <div class="progreso-valor ${testsReales >= semana.objetivoTests ? 'cumplido' : ''}">
                        ${testsReales} / ${semana.objetivoTests}
                    </div>
                </div>
            </div>
            ${mensajeEstado}
        `;
        
        container.appendChild(semanaDiv);
    }
}
async function ofrecerRecalculoAutomatico(numeroSemana) {
    const confirmar = confirm(
        '¿Quieres recalcular el planning manteniendo la misma fecha límite?\n\n' +
        'Esto redistribuirá las páginas restantes en las semanas futuras.'
    );
    
    if (confirmar) {
        await recalcularPlanningAutomatico(numeroSemana);
    }
}

async function recalcularPlanningAutomatico(numeroSemana) {
    try {
        // 1. Calcular vuelta mínima global actual del planning
        let vueltaMinimaGlobal = Infinity;
        planningGuardado.temas.forEach(temaPlanning => {
            const temaProgreso = progresoData.temas[temaPlanning.id];
            if (temaProgreso) {
                const vueltaTema = temaProgreso.vueltaActual || 1;
                if (vueltaTema < vueltaMinimaGlobal) {
                    vueltaMinimaGlobal = vueltaTema;
                }
            }
        });
        
        console.log(`Vuelta mínima global actual: ${vueltaMinimaGlobal}`);
        
        // 2. Calcular qué temas están completados en la vuelta global
        const temasCompletados = [];
        const temasRestantes = [];
        
        planningGuardado.temas.forEach(temaPlanning => {
            const temaProgreso = progresoData.temas[temaPlanning.id];
            if (temaProgreso) {
                const vueltaTema = temaProgreso.vueltaActual || 1;
                let paginasPendientes;
                
                if (vueltaTema < vueltaMinimaGlobal) {
                    // Tema atrasado
                    paginasPendientes = temaProgreso.paginasTotales - temaProgreso.paginasEstudiadas;
                } else if (vueltaTema === vueltaMinimaGlobal) {
                    // Tema en vuelta global
                    paginasPendientes = Math.max(0, temaProgreso.paginasTotales - temaProgreso.paginasEstudiadas);
                } else {
                    // Tema adelantado = completado para esta vuelta
                    paginasPendientes = 0;
                }
                
                if (paginasPendientes === 0) {
                    temasCompletados.push(temaPlanning.nombre);
                } else {
                    temasRestantes.push({
                        id: temaPlanning.id,
                        nombre: temaPlanning.nombre,
                        paginasPendientes: paginasPendientes
                    });
                }
            }
        });
        
        // 3. Calcular totales restantes
        const totalPaginasRestantes = temasRestantes.reduce((sum, tema) => sum + tema.paginasPendientes, 0);
        
        if (totalPaginasRestantes === 0) {
            alert(`¡Felicidades! Has completado la ${obtenerNombreVuelta(vueltaMinimaGlobal)} vuelta de todos los temas. 🎉`);
            return;
        }
        
        // 4. Calcular nuevo ritmo
        const fechaLimiteObj = planningGuardado.fechaLimite?.toDate ? 
            planningGuardado.fechaLimite.toDate() : 
            new Date(planningGuardado.fechaLimite);
        
        const hoy = new Date();
        const diasRestantes = Math.ceil((fechaLimiteObj - hoy) / (1000 * 60 * 60 * 24));
        const semanasRestantes = Math.ceil(diasRestantes / 7);
        
        const nuevasPaginasPorDia = (totalPaginasRestantes / diasRestantes).toFixed(1);
        const paginasPorSemanaCalc = Math.ceil(totalPaginasRestantes / semanasRestantes);
        
        // 5. REGENERAR semanas con nueva distribución
        const nuevasSemanas = [];
        const temasParaDistribuir = temasRestantes.map(tema => ({
            nombre: tema.nombre,
            id: tema.id,
            paginasRestantes: tema.paginasPendientes
        }));
        
        let temaActualIndex = 0;
        let paginasDelTemaActual = temasParaDistribuir[0] ? temasParaDistribuir[0].paginasRestantes : 0;
        
        for (let i = 0; i < semanasRestantes; i++) {
            const fechaInicioSemana = new Date(hoy);
            fechaInicioSemana.setDate(hoy.getDate() + (i * 7));
            
            const fechaFinSemana = new Date(fechaInicioSemana);
            fechaFinSemana.setDate(fechaInicioSemana.getDate() + 6);
            
            if (fechaFinSemana > fechaLimiteObj) {
                fechaFinSemana.setTime(fechaLimiteObj.getTime());
            }
            
            const temasEstaSemana = [];
            let paginasAsignadasEstaSemana = 0;
            
            while (paginasAsignadasEstaSemana < paginasPorSemanaCalc && temaActualIndex < temasParaDistribuir.length) {
                const temaActual = temasParaDistribuir[temaActualIndex];
                const paginasQueFaltan = paginasPorSemanaCalc - paginasAsignadasEstaSemana;
                
                if (paginasDelTemaActual <= paginasQueFaltan) {
                    temasEstaSemana.push({
                        nombre: temaActual.nombre,
                        paginas: paginasDelTemaActual,
                        completo: true
                    });
                    paginasAsignadasEstaSemana += paginasDelTemaActual;
                    
                    temaActualIndex++;
                    if (temaActualIndex < temasParaDistribuir.length) {
                        paginasDelTemaActual = temasParaDistribuir[temaActualIndex].paginasRestantes;
                    }
                } else {
                    temasEstaSemana.push({
                        nombre: temaActual.nombre,
                        paginas: paginasQueFaltan,
                        completo: false
                    });
                    paginasAsignadasEstaSemana += paginasQueFaltan;
                    paginasDelTemaActual -= paginasQueFaltan;
                }
            }
            
            nuevasSemanas.push({
                numero: i + 1,
                fechaInicio: fechaInicioSemana,
                fechaFin: fechaFinSemana,
                objetivoPaginas: paginasAsignadasEstaSemana,
                objetivoTests: Math.ceil(planningGuardado.resultados.totalTestsRecomendados / semanasRestantes),
                temasAsignados: temasEstaSemana,
                estado: 'pendiente',
                paginasReales: 0,
                testsReales: 0,
                fechaReporte: null
            });
        }
        
        // 6. Actualizar planning con temas restantes
        planningGuardado.temas = temasRestantes;
        planningGuardado.semanas = nuevasSemanas;
        planningGuardado.resultados.paginasPorDia = nuevasPaginasPorDia;
        planningGuardado.resultados.paginasPorSemana = paginasPorSemanaCalc;
        planningGuardado.resultados.semanasDisponibles = semanasRestantes;
        planningGuardado.resultados.totalPaginasPendientes = totalPaginasRestantes;
        
        // 7. Guardar e inicializar
        await guardarCambiosPlanning();
        await inicializarTrackingAutomatico();
        
        // 8. Actualizar interfaz
        mostrarInformacionPlanning();
        mostrarSemanasPlanning();
        
        alert(`✅ Planning recalculado (${obtenerNombreVuelta(vueltaMinimaGlobal)} vuelta)\n\n` +
              `Temas completados: ${temasCompletados.length}\n` +
              `Temas restantes: ${temasRestantes.length}\n` +
              `Páginas restantes: ${totalPaginasRestantes}\n` +
              `Nuevas páginas/día: ${nuevasPaginasPorDia}\n` +
              `Semanas restantes: ${semanasRestantes}`);
        
    } catch (error) {
        console.error('Error recalculando planning:', error);
        alert('Error al recalcular el planning');
    }
}

window.ofrecerRecalculoAutomatico = ofrecerRecalculoAutomatico;
// Función para reportar progreso de semana
function abrirReporteSemana(numeroSemana) {
    const semana = planningGuardado.semanas.find(s => s.numero === numeroSemana);
    if (!semana) return;
    
    // Configurar modal
    document.getElementById('tituloReporteSemana').textContent = `📊 Reportar Semana ${numeroSemana}`;
    
    // Mostrar objetivos
    const objetivosContainer = document.getElementById('objetivosSemana');
    objetivosContainer.innerHTML = `
        <div class="objetivo-item">
            <strong>Páginas objetivo:</strong> ${semana.objetivoPaginas}
        </div>
        <div class="objetivo-item">
            <strong>Tests objetivo:</strong> ${semana.objetivoTests}
        </div>
    `;
    
    // Calcular progreso automático si es la semana activa
let paginasAutomaticas = semana.paginasReales || 0;
let testsAutomaticos = semana.testsReales || 0;

if (planningTracker.semanaActiva && planningTracker.semanaActiva.numero === numeroSemana) {
    const progresoAutomatico = calcularProgresoSemanaActual();
    paginasAutomaticas = progresoAutomatico.paginas;
    testsAutomaticos = progresoAutomatico.tests;
    console.log(`Datos automáticos para semana ${numeroSemana}: ${paginasAutomaticas} páginas, ${testsAutomaticos} tests`);
}

// Prellenar campos con datos automáticos o guardados
document.getElementById('paginasLeidas').value = paginasAutomaticas;
document.getElementById('testsRealizados').value = testsAutomaticos;
    
    // Configurar botón confirmar
    document.getElementById('confirmarReporteBtn').onclick = () => confirmarReporteSemana(numeroSemana);
    
    document.getElementById('modalReportarSemana').style.display = 'block';
}

// Función para confirmar reporte de semana
async function confirmarReporteSemana(numeroSemana) {
    const paginasLeidas = parseInt(document.getElementById('paginasLeidas').value) || 0;
    const testsRealizados = parseInt(document.getElementById('testsRealizados').value) || 0;
    
    const semana = planningGuardado.semanas.find(s => s.numero === numeroSemana);
    if (!semana) return;
    
    // Actualizar datos de la semana
    semana.paginasReales = paginasLeidas;
    semana.testsReales = testsRealizados;
    semana.fechaReporte = new Date();
    
    // Determinar si se cumplieron los objetivos
    const cumplioPaginas = paginasLeidas >= semana.objetivoPaginas;
    const cumplioTests = testsRealizados >= semana.objetivoTests;
    
    if (cumplioPaginas && cumplioTests) {
        // Detectar si se superaron significativamente los objetivos (20% más)
        const superoSignificativamentePaginas = paginasLeidas > semana.objetivoPaginas * 1.2;
        const superoSignificativamenteTests = testsRealizados > semana.objetivoTests * 1.2;
        
        if (superoSignificativamentePaginas || superoSignificativamenteTests) {
            semana.estado = 'superado';
            
            // Ofrecer recalcular planning por superación
            const recalcular = confirm(
                `¡Excelente! Has superado los objetivos de esta semana.\n\n` +
                `Páginas: ${paginasLeidas}/${semana.objetivoPaginas} (${paginasLeidas > semana.objetivoPaginas ? '+' + (paginasLeidas - semana.objetivoPaginas) : ''})\n` +
                `Tests: ${testsRealizados}/${semana.objetivoTests} (${testsRealizados > semana.objetivoTests ? '+' + (testsRealizados - semana.objetivoTests) : ''})\n\n` +
                `¿Quieres recalcular el planning para reducir la carga de las próximas semanas?`
            );
            
            if (recalcular) {
                await recalcularPlanning(numeroSemana);
            }
        } else {
            semana.estado = 'cumplido';
        }
    } else {
        semana.estado = 'incumplido';
        
        // Ofrecer recalcular planning
        const recalcular = confirm(
            `No se cumplieron todos los objetivos de esta semana.\n\n` +
            `Páginas: ${paginasLeidas}/${semana.objetivoPaginas}\n` +
            `Tests: ${testsRealizados}/${semana.objetivoTests}\n\n` +
            `¿Quieres recalcular el planning para adaptarlo a la nueva situación?`
        );
        
        if (recalcular) {
            await recalcularPlanning(numeroSemana);
        }
    }
    
    // Guardar cambios
    await guardarCambiosPlanning();
    
    // Actualizar interfaz
    mostrarSemanasPlanning();
    cerrarModalReporte();
}

// Función para recalcular planning - CORREGIDA
async function recalcularPlanning(semanaNumero) {
    try {
        // Calcular lo que REALMENTE se ha hecho hasta ahora
        let paginasRealesHechas = 0;
        let testsRealesHechos = 0;
        
        planningGuardado.semanas.forEach(sem => {
            if (sem.estado === 'cumplido' || sem.estado === 'incumplido' || sem.estado === 'superado') {
                paginasRealesHechas += sem.paginasReales;
                testsRealesHechos += sem.testsReales;
            }
        });
        
        // VERIFICAR también el progreso actual de los temas del planning
        let paginasActualesEnTemas = 0;
        planningGuardado.temas.forEach(temaPlanning => {
            const temaProgreso = progresoData.temas[temaPlanning.id];
            if (temaProgreso) {
                paginasActualesEnTemas += temaProgreso.paginasEstudiadas || 0;
            }
        });
        
        // Lo que AÚN falta por hacer (usar el mayor de los dos contadores)
        const paginasRealesHechas_final = Math.max(paginasRealesHechas, paginasActualesEnTemas);
        const paginasRestantes = planningGuardado.resultados.totalPaginasPendientes - paginasRealesHechas_final;
        const testsRestantes = planningGuardado.resultados.totalTestsRecomendados - testsRealesHechos;
        
        // Contar semanas futuras (pendientes)
        const semanasFuturas = planningGuardado.semanas.filter(s => s.estado === 'pendiente').length;
        
        console.log(`RECÁLCULO:
- Total original páginas: ${planningGuardado.resultados.totalPaginasPendientes}
- Páginas reales hechas: ${paginasRealesHechas_final}
- Páginas que faltan: ${paginasRestantes}
- Semanas futuras: ${semanasFuturas}`);
        
        if (semanasFuturas > 0) {
            // Redistributir lo que falta entre las semanas futuras
            const nuevasPaginasPorSemana = Math.ceil(paginasRestantes / semanasFuturas);
            const nuevosTestsPorSemana = Math.ceil(testsRestantes / semanasFuturas);
            const nuevasPaginasPorDia = (paginasRestantes / (semanasFuturas * 7)).toFixed(1);
            
            // Actualizar solo semanas pendientes
            planningGuardado.semanas.forEach(sem => {
                if (sem.estado === 'pendiente') {
                    sem.objetivoPaginas = nuevasPaginasPorSemana;
                    sem.objetivoTests = nuevosTestsPorSemana;
                }
            });
            
            // Actualizar datos generales
planningGuardado.resultados.paginasPorDia = nuevasPaginasPorDia;
planningGuardado.resultados.paginasPorSemana = nuevasPaginasPorSemana;
planningGuardado.resultados.semanasDisponibles = semanasFuturas;
planningGuardado.resultados.totalPaginasPendientes = paginasRestantes; // Actualizar también las páginas pendientes
planningGuardado.resultados.totalTestsRecomendados = testsRestantes; // Actualizar también los tests restantes

console.log(`Datos generales actualizados:
- Páginas/día: ${nuevasPaginasPorDia}
- Páginas/semana: ${nuevasPaginasPorSemana}
- Páginas restantes: ${paginasRestantes}
- Tests restantes: ${testsRestantes}`);
            
            // Guardar cambios
            await guardarCambiosPlanning();
            
            alert(`Planning recalculado:\n- Páginas que faltan: ${paginasRestantes}\n- Nuevas páginas/día: ${nuevasPaginasPorDia}\n- Nuevas páginas/semana: ${nuevasPaginasPorSemana}\n- Tests restantes: ${testsRestantes}\n- Semanas futuras: ${semanasFuturas}`);
            
            // Actualizar interfaz
            mostrarInformacionPlanning();
        }
        
    } catch (error) {
        console.error('Error recalculando planning:', error);
        alert('Error al recalcular el planning');
    }
}

// Función para guardar cambios en planning
async function guardarCambiosPlanning() {
    try {
        planningGuardado.ultimaActualizacion = new Date();
        await setDoc(doc(db, "planning", currentUser.uid), planningGuardado);
        console.log('Cambios de planning guardados');
    } catch (error) {
        console.error('Error guardando cambios:', error);
    }
}

// Agregar función global para reportar semana
window.abrirReporteSemana = abrirReporteSemana;
// Generar detalles de cada tema
function generarDetallesTemas() {
    const contenedor = document.getElementById('leyendaDetalles');
    if (!contenedor) return;
    
    const datosEstadisticas = calcularEstadisticasTemas();
    contenedor.innerHTML = '';
    
    if (datosEstadisticas.length === 0) {
        contenedor.innerHTML = '<p style="text-align: center; color: #6b7280;">No hay datos disponibles</p>';
        return;
    }
    
    datosEstadisticas.forEach(dato => {
        const nombreVuelta = obtenerNombreVuelta(dato.vuelta);
        
        const detalleDiv = document.createElement('div');
        detalleDiv.className = `detalle-tema vuelta-${dato.vuelta}`;
        
        detalleDiv.innerHTML = `
            <div class="nombre-tema">${dato.nombre}</div>
            <div class="info-tema">${dato.paginasLeidas}/${dato.paginasTotales} páginas leídas en ${nombreVuelta.toLowerCase()} vuelta</div>
            <div class="info-tema">${dato.vueltasCompletadas} vueltas completadas</div>
            <div class="info-tema">${dato.totalTests} tests realizados</div>
            <div class="puntuacion-tema">Puntuación: ${dato.puntuacion.toFixed(1)}</div>
        `;
        
        contenedor.appendChild(detalleDiv);
    });
}
// Funciones de reporte manual eliminadas - sistema automático activo
console.log('Sistema de seguimiento automático de planning activado');
