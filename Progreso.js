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
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Variables globales
let currentUser = null;
let progresoData = {};
let temasDelBanco = [];

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
        
        // 3. Sincronizar progreso con temas del banco
        await sincronizarProgresoConBanco();
        
        // 4. Renderizar interfaz
        renderizarTablaProgreso();
        
        console.log('Sistema de progreso inicializado');
        
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
            if (!tema.esSubtema || !tema.temaPadreId) {
                temasDelBanco.push({
                    id: doc.id,
                    nombre: tema.nombre,
                    descripcion: tema.descripcion || '',
                    numPreguntas: tema.preguntas ? tema.preguntas.length : 0,
                    orden: tema.orden || 0
                });
            }
        });
        
        // Ordenar temas por el orden establecido
        temasDelBanco.sort((a, b) => a.orden - b.orden);
        
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
    
    // Ordenar temas por el orden establecido en el banco
    const temasOrdenados = Object.entries(progresoData.temas).sort(([idA], [idB]) => {
        const temaA = temasDelBanco.find(t => t.id === idA);
        const temaB = temasDelBanco.find(t => t.id === idB);
        return (temaA?.orden || 0) - (temaB?.orden || 0);
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
        </div>
    `;
}

// Funciones auxiliares que se implementarán en el siguiente paso
function calcularPorcentajeTema(temaProgreso) {
    return Math.round((temaProgreso.paginasEstudiadas / temaProgreso.paginasTotales) * 100);
}

function obtenerNombreVuelta(numeroVuelta) {
    const nombres = ['Primera', 'Segunda', 'Tercera', 'Cuarta', 'Quinta', 'Sexta'];
    return nombres[numeroVuelta - 1] || `${numeroVuelta}ª`;
}

function configurarControlesTabla() {
    // Event listeners ya están configurados en el HTML con onclick
    console.log('Controles de tabla configurados');
}

function actualizarProgresoGeneral() {
    try {
        const temas = Object.values(progresoData.temas);
        
        if (temas.length === 0) {
            // No hay temas
            document.getElementById('progresoGeneralMemorizado').textContent = '0/0';
            document.getElementById('progresoGeneralTests').textContent = '0';
            document.getElementById('progresoGeneralVuelta').textContent = 'Primera';
            document.getElementById('barraProgresoGeneral').style.width = '0%';
            document.getElementById('porcentajeProgresoGeneral').textContent = '0%';
            return;
        }
        
        // Calcular totales
        let paginasTotalesGlobal = 0;
        let paginasEstudiadasGlobal = 0;
        let testsGlobal = 0;
        let vueltaMinimaGlobal = 6; // Empezar con máximo
        
        temas.forEach(tema => {
            paginasTotalesGlobal += tema.paginasTotales;
            
            // Páginas estudiadas: incluir vueltas completadas
            const vueltas_completadas = tema.vueltas.filter(v => v.completada).length;
            paginasEstudiadasGlobal += (vueltas_completadas * tema.paginasTotales) + tema.paginasEstudiadas;
            
            testsGlobal += (tema.testsAutomaticos || 0) + (tema.testsManuales || 0);
            
            // La vuelta global es la mínima de todos los temas
            vueltaMinimaGlobal = Math.min(vueltaMinimaGlobal, tema.vueltaActual);
        });
        
        // Si no hay temas, vuelta mínima es 1
        if (vueltaMinimaGlobal === 6 && temas.length === 0) vueltaMinimaGlobal = 1;
        
        // Calcular progreso de la vuelta actual global CORREGIDO
const paginasVueltaActualGlobal = temas.reduce((total, tema) => {
    // Solo contar páginas si el tema está exactamente en la vuelta mínima
    if (tema.vueltaActual === vueltaMinimaGlobal) {
        return total + tema.paginasEstudiadas;
    }
    return total;
}, 0);

// Para el progreso general, solo contar páginas totales de temas en vuelta mínima
const paginasTotalesVueltaActual = temas.reduce((total, tema) => {
    if (tema.vueltaActual === vueltaMinimaGlobal) {
        return total + tema.paginasTotales;
    }
    return total;
}, 0);

const porcentajeVueltaActual = paginasTotalesVueltaActual > 0 ? 
    Math.round((paginasVueltaActualGlobal / paginasTotalesVueltaActual) * 100) : 0;
        
        // Actualizar interfaz
        document.getElementById('progresoGeneralMemorizado').textContent = 
    `${paginasVueltaActualGlobal}/${paginasTotalesVueltaActual}`;
        document.getElementById('progresoGeneralTests').textContent = testsGlobal;
        document.getElementById('progresoGeneralVuelta').textContent = obtenerNombreVuelta(vueltaMinimaGlobal);
        
        const barraGeneral = document.getElementById('barraProgresoGeneral');
        barraGeneral.style.width = `${porcentajeVueltaActual}%`;
        barraGeneral.className = `barra-fill vuelta-${vueltaMinimaGlobal}`;
        
        document.getElementById('porcentajeProgresoGeneral').textContent = `${porcentajeVueltaActual}%`;
        
        console.log(`Progreso general: ${paginasVueltaActualGlobal}/${paginasTotalesGlobal} (${porcentajeVueltaActual}%) - Vuelta ${vueltaMinimaGlobal}`);
        
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
        
    } catch (error) {
        console.error('Error cambiando páginas:', error);
        alert('Error al cambiar páginas');
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
        
    } catch (error) {
        console.error('Error cambiando tests:', error);
        alert('Error al cambiar tests');
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
        }
        
    } catch (error) {
        console.error('Error reiniciando tema:', error);
        alert('Error al reiniciar tema');
    }
};

// Funciones del modal
function abrirModalPersonalizar() {
    console.log('Abriendo modal personalizar...');
    
    const listaContainer = document.getElementById('listaTemasPersonalizar');
    listaContainer.innerHTML = '';
    
    // Cargar cada tema con su configuración actual
    Object.entries(progresoData.temas).forEach(([temaId, temaProgreso]) => {
        const itemHTML = `
            <div class="tema-personalizar-item">
                <div class="tema-personalizar-nombre">${temaProgreso.nombre}</div>
                <label style="font-size: 12px; color: #6b7280;">Páginas:</label>
                <input type="number" 
                       class="tema-personalizar-paginas" 
                       value="${temaProgreso.paginasTotales}" 
                       min="1" 
                       max="999"
                       data-tema-id="${temaId}">
            </div>
        `;
        listaContainer.innerHTML += itemHTML;
    });
    
    document.getElementById('modalPersonalizar').style.display = 'flex';
}

function cerrarModalPersonalizar() {
    document.getElementById('modalPersonalizar').style.display = 'none';
}

async function guardarPersonalizacion() {
    console.log('Guardando personalización...');
    
    try {
        // Obtener todos los inputs de páginas
        const inputs = document.querySelectorAll('.tema-personalizar-paginas');
        
        inputs.forEach(input => {
            const temaId = input.dataset.temaId;
            const nuevasPaginas = parseInt(input.value) || 30;
            
            if (progresoData.temas[temaId]) {
                const paginasAnteriores = progresoData.temas[temaId].paginasTotales;
                progresoData.temas[temaId].paginasTotales = nuevasPaginas;
                
                // Si las páginas estudiadas superan el nuevo total, ajustar
                if (progresoData.temas[temaId].paginasEstudiadas > nuevasPaginas) {
                    progresoData.temas[temaId].paginasEstudiadas = nuevasPaginas;
                }
                
                console.log(`Tema ${temaId}: ${paginasAnteriores} → ${nuevasPaginas} páginas`);
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
        }
        
    } catch (error) {
        console.error('Error registrando test completado:', error);
    }
};
