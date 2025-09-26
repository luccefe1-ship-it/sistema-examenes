// js/conexiones.js - Juego de Conexiones
import { auth, db } from './firebase-config.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    doc, 
    getDoc, 
    getDocs, 
    query, 
    where, 
    collection 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Variables globales
let currentUser = null;
let juegoActual = null;
let cronometroInterval = null;
let tiempoRestanteSegundos = 0;
let conexionesActuales = new Map();
let preguntasActuales = [];
let respuestasActuales = [];
let rondaActual = 1;
let aciertosAcumulados = 0;
let aciertosGlobales = 0; // NUEVA VARIABLE PARA EL TOTAL REAL
let modoDinamico = false;

// Canvas y contexto para las líneas
let canvas, ctx;

// Elementos del DOM
const userNameSpan = document.getElementById('userName');
const backBtn = document.getElementById('backBtn');
const logoutBtn = document.getElementById('logoutBtn');

// Función para resetear récords (ejecutar una sola vez)
function resetearRecords() {
    localStorage.removeItem('record_conexiones_estatico');
    localStorage.removeItem('record_conexiones_estatico_cantidadSubtemas');
    localStorage.removeItem('record_conexiones_estatico_nombresSubtemas');
    localStorage.removeItem('record_conexiones_dinamico');
    localStorage.removeItem('record_conexiones_dinamico_cantidadSubtemas');
    localStorage.removeItem('record_conexiones_dinamico_nombresSubtemas');
    console.log('Récords reseteados');
}

// Ejecutar reset una sola vez - COMENTAR DESPUÉS DE LA PRIMERA CARGA
// resetearRecords();

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    // Inicializar canvas
    canvas = document.getElementById('lineasCanvas');
    ctx = canvas.getContext('2d');

    // Verificar autenticación
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            await cargarDatosUsuario();
            await cargarTemasParaConexiones();
            configurarEventListeners();
        } else {
            window.location.href = 'index.html';
        }
    });
});

// Configurar event listeners
function configurarEventListeners() {
    // Navegación
    backBtn.addEventListener('click', () => {
        window.location.href = 'homepage.html';
    });

    logoutBtn.addEventListener('click', async () => {
        try {
            await signOut(auth);
            window.location.href = 'index.html';
        } catch (error) {
            console.error('Error cerrando sesión:', error);
        }
    });

    // Botones de modo de juego
    document.querySelectorAll('.btn-tiempo').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.btn-tiempo').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            document.getElementById('tiempoSeleccionadoConexiones').value = this.dataset.tiempo;
            
            // Mostrar/ocultar descripciones
            const descripcionEstatico = document.getElementById('descripcionEstatico');
            const descripcionDinamico = document.getElementById('descripcionDinamico');
            
            if (this.dataset.tiempo === 'dinamico') {
                descripcionEstatico.style.display = 'none';
                descripcionDinamico.style.display = 'block';
            } else {
                descripcionEstatico.style.display = 'block';
                descripcionDinamico.style.display = 'none';
            }
            
            // Actualizar mensaje motivacional cuando cambie el modo
            mostrarInformacionRecords();
        });
    });

    // Botón empezar
    document.getElementById('empezarConexionesBtn').addEventListener('click', empezarJuego);

    // Botones del juego
    document.getElementById('limpiarBtn').addEventListener('click', limpiarConexiones);
    document.getElementById('siguienteRondaBtn').addEventListener('click', siguienteRonda);
    document.getElementById('finalizarBtn').addEventListener('click', finalizarJuego);
}

// Cargar datos del usuario
async function cargarDatosUsuario() {
    try {
        const userDoc = await getDoc(doc(db, "usuarios", currentUser.uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            userNameSpan.textContent = userData.nombre;
        } else {
            userNameSpan.textContent = currentUser.email;
        }
    } catch (error) {
        console.error('Error cargando datos:', error);
        userNameSpan.textContent = currentUser.email;
    }
}

// Cargar temas para conexiones (reutilizar lógica de tests.js)
async function cargarTemasParaConexiones() {
    try {
        const q = query(collection(db, "temas"), where("usuarioId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        const listaContainer = document.getElementById('listaTemasConexiones');
        
        if (!listaContainer) return;
        
        listaContainer.innerHTML = '';
        
        // Separar temas principales y subtemas
        const temasPrincipales = [];
        const subtemasPorPadre = {};
        let totalPreguntasVerificadas = 0;
        
        querySnapshot.forEach((doc) => {
            const tema = doc.data();
            const temaId = doc.id;
            const preguntasVerificadas = tema.preguntas ? 
                tema.preguntas.filter(p => p.verificada === true).length : 0;
            
            totalPreguntasVerificadas += preguntasVerificadas;
            
            if (tema.temaPadreId) {
                // Es un subtema
                if (!subtemasPorPadre[tema.temaPadreId]) {
                    subtemasPorPadre[tema.temaPadreId] = [];
                }
                subtemasPorPadre[tema.temaPadreId].push({
                    id: temaId,
                    nombre: tema.nombre,
                    preguntasVerificadas: preguntasVerificadas
                });
            } else {
                // Es un tema principal
                temasPrincipales.push({
                    id: temaId,
                    nombre: tema.nombre,
                    preguntasVerificadas: preguntasVerificadas,
                    orden: tema.orden || 0
                });
            }
        });

        // Sumar preguntas de subtemas
        temasPrincipales.forEach(tema => {
            if (subtemasPorPadre[tema.id]) {
                const preguntasSubtemas = subtemasPorPadre[tema.id].reduce((total, subtema) => {
                    return total + subtema.preguntasVerificadas;
                }, 0);
                tema.preguntasVerificadas += preguntasSubtemas;
            }
        });

        // Contador total ya no se usa porque eliminamos "Todos los temas"
        // Ocultar y desmarcar "Todos los temas"
        const todosLosTemasElement = document.querySelector('input[value="todos"], #todosLosTemasConexiones');
        if (todosLosTemasElement) {
            todosLosTemasElement.checked = false; // DESMARCAR
            const parentLabel = todosLosTemasElement.closest('label') || todosLosTemasElement.parentElement;
            if (parentLabel) {
                parentLabel.style.display = 'none';
            }
        }
        
        // Ocultar cualquier elemento que contenga "Todos los temas" y "0 preguntas"
        const allElements = document.querySelectorAll('*');
        allElements.forEach(el => {
            if (el.textContent && (el.textContent.includes('Todos los temas') || el.textContent.trim() === '0 preguntas') && !el.querySelector('input')) {
                el.style.display = 'none';
            }
        });

        // Ordenar temas
        temasPrincipales.sort((a, b) => {
            const nombreA = a.nombre;
            const nombreB = b.nombre;
            const numeroA = nombreA.match(/\d+/);
            const numeroB = nombreB.match(/\d+/);
            
            if (numeroA && numeroB) {
                return parseInt(numeroA[0]) - parseInt(numeroB[0]);
            }
            return nombreA.localeCompare(nombreB);
        });

        // Renderizar temas
        temasPrincipales.forEach((tema) => {
            const temaDiv = document.createElement('div');
            temaDiv.className = 'tema-item';
            
            const tieneSubtemas = subtemasPorPadre[tema.id] && subtemasPorPadre[tema.id].length > 0;
            
            temaDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #f8f9fa; border-radius: 5px; margin: 4px 0;" 
                     onclick="toggleTemaSubtemas('${tema.id}')" data-tema-id="${tema.id}">
                    <label style="display: flex; align-items: center; width: 100%; cursor: pointer; margin: 0;">
                        <input type="checkbox" style="margin-right: 8px; pointer-events: none;" disabled>
                        <span style="font-weight: bold; color: #555;">${tema.nombre}</span>
                    </label>
                </div>
            `;
            
            listaContainer.appendChild(temaDiv);

            // Agregar subtemas si los tiene
            if (tieneSubtemas) {
                subtemasPorPadre[tema.id].forEach(subtema => {
                    const subtemaDiv = document.createElement('div');
                    subtemaDiv.className = 'tema-item';
                    subtemaDiv.style.paddingLeft = '30px';
                    subtemaDiv.innerHTML = `
                        <label>
                            <input type="checkbox" class="tema-checkbox" value="${subtema.id}" 
                                   data-preguntas="${subtema.preguntasVerificadas}" 
                                   data-tema-padre="${tema.id}"
                                   onchange="manejarSeleccionTema()">
                            <span>↳ ${subtema.nombre}</span>
                        </label>
                        <span class="tema-preguntas">${subtema.preguntasVerificadas} preguntas</span>
                    `;
                    listaContainer.appendChild(subtemaDiv);
                });
            }
        });

        actualizarPreguntasDisponibles();
        
        // Forzar actualización después de ocultar elementos
        setTimeout(() => {
            manejarSeleccionTema();
            mostrarInformacionRecords();
        }, 100);
        
    } catch (error) {
        console.error('Error cargando temas:', error);
    }
}
// Función para seleccionar/deseleccionar todos los subtemas de un tema
window.toggleTemaSubtemas = function(temaId) {
    const subtemas = document.querySelectorAll(`input[data-tema-padre="${temaId}"]`);
    const primerSubtema = subtemas[0];
    
    if (!primerSubtema) return;
    
    // Si el primer subtema está marcado, desmarcar todos; si no, marcar todos
    const nuevoEstado = !primerSubtema.checked;
    
    subtemas.forEach(subtema => {
        subtema.checked = nuevoEstado;
    });
    
    manejarSeleccionTema();
};
// Funciones globales para dropdown
window.toggleDropdownTemas = function() {
    const content = document.getElementById('dropdownContent');
    const arrow = document.querySelector('.dropdown-arrow');
    
    if (content.style.display === 'block') {
        content.style.display = 'none';
        arrow.textContent = '▼';
    } else {
        content.style.display = 'block';
        arrow.textContent = '▲';
    }
};

window.manejarSeleccionTema = function(event) {
    const temasCheckboxes = document.querySelectorAll('.tema-checkbox');
    const placeholder = document.getElementById('temasSeleccionadosTexto');
    
    // Contar temas seleccionados
    const temasSeleccionados = Array.from(temasCheckboxes).filter(cb => cb.checked);
    
    if (temasSeleccionados.length === 0) {
        placeholder.textContent = 'Seleccionar temas...';
    } else {
        placeholder.textContent = `${temasSeleccionados.length} subtema(s) seleccionado(s)`;
    }
    
    actualizarPreguntasDisponibles();
    mostrarInformacionRecords(); // Actualizar información de récords
};

// Actualizar preguntas disponibles
async function actualizarPreguntasDisponibles() {
    const infoElement = document.getElementById('preguntasDisponiblesConexiones');
    if (!infoElement) return;
    
    try {
        const temasCheckboxes = document.querySelectorAll('.tema-checkbox:checked');
        
        let preguntasVerificadas = 0;
        
        if (temasCheckboxes.length === 0) {
            preguntasVerificadas = 0;
        } else {
            // Sumar preguntas de temas seleccionados
            temasCheckboxes.forEach(checkbox => {
                preguntasVerificadas += parseInt(checkbox.dataset.preguntas) || 0;
            });
        }

        infoElement.textContent = `${preguntasVerificadas} preguntas verificadas disponibles`;
    } catch (error) {
        console.error('Error actualizando preguntas disponibles:', error);
        infoElement.textContent = 'Error al cargar preguntas';
    }
}
// Mostrar información de récords en la pantalla inicial
function mostrarInformacionRecords() {
    // RESETEAR RÉCORDS - Eliminar esta línea después del primer uso
    // localStorage.removeItem('record_conexiones_estatico');
    // localStorage.removeItem('record_conexiones_estatico_cantidadSubtemas');
    // localStorage.removeItem('record_conexiones_estatico_nombresSubtemas');
    // localStorage.removeItem('record_conexiones_dinamico');
    // localStorage.removeItem('record_conexiones_dinamico_cantidadSubtemas');
    // localStorage.removeItem('record_conexiones_dinamico_nombresSubtemas');
    
    const recordEstatico = parseInt(localStorage.getItem('record_conexiones_estatico') || '0');
    const subtemasEstatico = localStorage.getItem('record_conexiones_estatico_nombresSubtemas') || 'Ninguno';
    const cantidadSubtemasEstatico = parseInt(localStorage.getItem('record_conexiones_estatico_cantidadSubtemas') || '0');
    
    const recordDinamico = parseInt(localStorage.getItem('record_conexiones_dinamico') || '0');
    const subtemasDinamico = localStorage.getItem('record_conexiones_dinamico_nombresSubtemas') || 'Ninguno';
    const cantidadSubtemasDinamico = parseInt(localStorage.getItem('record_conexiones_dinamico_cantidadSubtemas') || '0');
    
    // Calcular subtemas actuales seleccionados
    const temasSeleccionadosActuales = obtenerTemasSeleccionados();
    let cantidadSubtemasActuales = 0;
    
    cantidadSubtemasActuales = Array.isArray(temasSeleccionadosActuales) ? temasSeleccionadosActuales.length : 0;
    
    // Determinar modo actual seleccionado
    const modoSeleccionado = document.getElementById('tiempoSeleccionadoConexiones').value;
    const esModoEstatico = modoSeleccionado === 'estatico';
    
    // Obtener datos del récord del modo actual
    const recordActual = esModoEstatico ? recordEstatico : recordDinamico;
    const cantidadSubtemasRecord = esModoEstatico ? cantidadSubtemasEstatico : cantidadSubtemasDinamico;
    
    // Mensaje explicativo según el modo
    let mensajeMotivacional = '';
    
    if (esModoEstatico) {
        if (recordEstatico === 0) {
            mensajeMotivacional = `
                <div style="background: linear-gradient(135deg, #4caf50, #66bb6a); color: white; padding: 12px; border-radius: 8px; margin-top: 15px; text-align: center; font-weight: bold;">
                    📊 El récord se establecerá en función de las preguntas acertadas y el número de subtemas elegidos
                </div>
            `;
        } else {
            if (cantidadSubtemasActuales < cantidadSubtemasRecord) {
                const necesarios = cantidadSubtemasRecord;
                mensajeMotivacional = `
                    <div style="background: linear-gradient(135deg, #ff6b6b, #ffa726); color: white; padding: 12px; border-radius: 8px; margin-top: 15px; text-align: center; font-weight: bold;">
                        ⚡ Debes seleccionar ${necesarios} o más subtemas para optar por un nuevo récord
                    </div>
                `;
            } else {
                mensajeMotivacional = `
                    <div style="background: linear-gradient(135deg, #4caf50, #66bb6a); color: white; padding: 12px; border-radius: 8px; margin-top: 15px; text-align: center; font-weight: bold;">
                        🎯 Supera ${recordActual} preguntas correctas para batir el récord
                    </div>
                `;
            }
        }
    } else {
        if (recordDinamico === 0) {
            mensajeMotivacional = `
                <div style="background: linear-gradient(135deg, #ff6b6b, #ffa726); color: white; padding: 12px; border-radius: 8px; margin-top: 15px; text-align: center; font-weight: bold;">
                    ⚡ El récord se establecerá en función de las rondas superadas y el número de subtemas elegidos
                </div>
            `;
        } else {
            if (cantidadSubtemasActuales < cantidadSubtemasRecord) {
                const necesarios = cantidadSubtemasRecord;
                mensajeMotivacional = `
                    <div style="background: linear-gradient(135deg, #ff6b6b, #ffa726); color: white; padding: 12px; border-radius: 8px; margin-top: 15px; text-align: center; font-weight: bold;">
                        ⚡ Debes seleccionar ${necesarios} o más subtemas para optar por un nuevo récord
                    </div>
                `;
            } else {
                mensajeMotivacional = `
                    <div style="background: linear-gradient(135deg, #4caf50, #66bb6a); color: white; padding: 12px; border-radius: 8px; margin-top: 15px; text-align: center; font-weight: bold;">
                        🔥 Supera ${recordActual} rondas completadas para batir el récord
                    </div>
                `;
            }
        }
    }
    
    // Buscar dónde insertar la información (después de la descripción)
    const configContainer = document.getElementById('configContainer');
    
    // Eliminar información anterior si existe
    const infoAnterior = document.getElementById('informacionRecords');
    if (infoAnterior) {
        infoAnterior.remove();
    }
    
    // Crear nueva información de récords
    const infoRecords = document.createElement('div');
    infoRecords.id = 'informacionRecords';
    infoRecords.style.cssText = `
        background: #f8f9fa;
        padding: 20px;
        border-radius: 10px;
        margin: 20px 0;
        border-left: 4px solid #667eea;
    `;
    
    // Mostrar solo información del modo seleccionado
    let contenidoModo = '';
    
    if (esModoEstatico) {
        contenidoModo = `
            <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center;">
                <strong style="color: #667eea; font-size: 1.1em;">📊 Modo Estático</strong>
                <div style="margin-top: 12px; font-size: 16px;">
                    <div><strong>Récord:</strong> ${recordEstatico} preguntas</div>
                    <div><strong>Subtemas:</strong> ${cantidadSubtemasEstatico} (${subtemasEstatico})</div>
                </div>
            </div>
        `;
    } else {
        contenidoModo = `
            <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center;">
                <strong style="color: #667eea; font-size: 1.1em;">⚡ Modo Dinámico</strong>
                <div style="margin-top: 12px; font-size: 16px;">
                    <div><strong>Récord:</strong> ${recordDinamico} rondas</div>
                    <div><strong>Subtemas:</strong> ${cantidadSubtemasDinamico} (${subtemasDinamico})</div>
                </div>
            </div>
        `;
    }

    infoRecords.innerHTML = `
        <h4 style="margin: 0 0 15px 0; color: #333; font-size: 1.2em;">🏆 Récord Personal</h4>
        ${contenidoModo}
        ${mensajeMotivacional}
    `;
    
    // Insertar antes del botón de empezar
    const botonEmpezar = document.getElementById('empezarConexionesBtn');
    configContainer.insertBefore(infoRecords, botonEmpezar);
}
// Empezar juego
async function empezarJuego() {
    try {
        // Obtener temas seleccionados
        const temasSeleccionados = obtenerTemasSeleccionados();
        const tiempoSeleccionadoValue = document.getElementById('tiempoSeleccionadoConexiones').value;
        const tiempoSeleccionado = tiempoSeleccionadoValue === 'dinamico' ? 120 : parseInt(tiempoSeleccionadoValue);
        
        // Configurar modo de juego
        modoDinamico = tiempoSeleccionadoValue === 'dinamico';
        const modoEstatico = tiempoSeleccionadoValue === 'estatico';
        
        // En ambos modos empezamos con 2 minutos
        const tiempoInicial = modoEstatico || modoDinamico ? 120 : tiempoSeleccionado;

        if (!temasSeleccionados || (Array.isArray(temasSeleccionados) && temasSeleccionados.length === 0)) {
            alert('Por favor, selecciona al menos un tema');
            return;
        }

        // Obtener preguntas verificadas (reutilizar función de tests.js)
        const preguntasDisponibles = await obtenerPreguntasVerificadas(temasSeleccionados);
        
        if (preguntasDisponibles.length < 10) {
            alert('Se necesitan al menos 10 preguntas verificadas para jugar');
            return;
        }

        // Inicializar juego
        juegoActual = {
            temasSeleccionados,
            tiempoTotal: tiempoSeleccionado,
            fechaInicio: new Date(),
            preguntasDisponibles
        };

        rondaActual = 1;
        aciertosAcumulados = 0;
        aciertosGlobales = 0; // RESETEAR CONTADOR GLOBAL
        
        // Mostrar interfaz del juego
        document.getElementById('configContainer').style.display = 'none';
        document.getElementById('gameContainer').style.display = 'block';
        document.getElementById('cronometroConexiones').style.display = 'block';
        
        // Iniciar primera ronda
        iniciarNuevaRonda();
        
        // Iniciar cronómetro
        iniciarCronometro(tiempoInicial);

    } catch (error) {
        console.error('Error empezando juego:', error);
        alert('Error al iniciar el juego');
    }
}

// Obtener temas seleccionados
function obtenerTemasSeleccionados() {
    const checkboxesMarcados = document.querySelectorAll('.tema-checkbox:checked:not([value="todos"]):not(#todosLosTemasConexiones)');
    const idsSeleccionados = Array.from(checkboxesMarcados).map(cb => cb.value);
    
    return idsSeleccionados;
}

// Obtener preguntas verificadas (reutilizar de tests.js)
async function obtenerPreguntasVerificadas(temasSeleccionados) {
    let preguntasVerificadas = [];

    if (Array.isArray(temasSeleccionados)) {
        for (const temaId of temasSeleccionados) {
            const temaDoc = await getDoc(doc(db, "temas", temaId));
            if (temaDoc.exists()) {
                const tema = temaDoc.data();
                if (tema.preguntas) {
                    tema.preguntas.forEach((pregunta) => {
                        if (pregunta.verificada) {
                            preguntasVerificadas.push({
                                ...pregunta,
                                temaId: temaId,
                                temaNombre: tema.nombre
                            });
                        }
                    });
                }
            }
        }
    }

    return preguntasVerificadas;
}

// Iniciar nueva ronda
function iniciarNuevaRonda() {
    // Limpiar conexiones anteriores
    conexionesActuales.clear();
    limpiarCanvas();
    
    // Obtener 10 preguntas aleatorias únicas
    preguntasActuales = obtenerPreguntasUnicasAleatorias(juegoActual.preguntasDisponibles, 10);
    
    // Crear array de respuestas y mezclarlo
    respuestasActuales = [...preguntasActuales].map(p => ({
        texto: p.respuestaCorrecta,
        preguntaOriginal: p
    }));
    
    // Mezclar respuestas
    respuestasActuales = mezclarArray(respuestasActuales);
    
    // Actualizar interfaz
    document.getElementById('rondaActual').textContent = rondaActual;
    document.getElementById('aciertosTotal').textContent = 0;
    
    // Generar HTML de preguntas y respuestas
    generarPreguntasHTML();
    generarRespuestasHTML();
    
    // Ocultar botón siguiente ronda
    document.getElementById('siguienteRondaBtn').style.display = 'none';
}

// Generar HTML de preguntas
function generarPreguntasHTML() {
    const container = document.getElementById('listaPreguntas');
    container.innerHTML = '';
    
    preguntasActuales.forEach((pregunta, index) => {
        const preguntaDiv = document.createElement('div');
        preguntaDiv.className = 'item-pregunta';
        preguntaDiv.dataset.preguntaIndex = index;
        preguntaDiv.innerHTML = `
            <div><strong>${index + 1}.</strong> ${pregunta.texto}</div>
            <small style="color: #666;">${pregunta.temaNombre}</small>
        `;
        
        preguntaDiv.addEventListener('click', () => seleccionarPregunta(index));
        container.appendChild(preguntaDiv);
    });
}

// Generar HTML de respuestas
function generarRespuestasHTML() {
    const container = document.getElementById('listaRespuestas');
    container.innerHTML = '';
    
    respuestasActuales.forEach((respuesta, index) => {
        const respuestaDiv = document.createElement('div');
        respuestaDiv.className = 'item-respuesta';
        respuestaDiv.dataset.respuestaIndex = index;
        respuestaDiv.innerHTML = `
            <div>${respuesta.preguntaOriginal.opciones.find(op => op.esCorrecta).texto}</div>
        `;
        
        respuestaDiv.addEventListener('click', () => conectarRespuesta(index));
        container.appendChild(respuestaDiv);
    });
}

// Variables para conexión actual
let preguntaSeleccionada = null;

// Seleccionar pregunta
function seleccionarPregunta(index) {
    // Limpiar selección anterior
    document.querySelectorAll('.item-pregunta').forEach(item => {
        item.classList.remove('seleccionado');
    });
    
    // Marcar pregunta seleccionada
    const preguntaElement = document.querySelector(`[data-pregunta-index="${index}"]`);
    preguntaElement.classList.add('seleccionado');
    
    preguntaSeleccionada = index;
}

// Conectar respuesta
function conectarRespuesta(respuestaIndex) {
    if (preguntaSeleccionada === null) {
        alert('Primero selecciona una pregunta');
        return;
    }
    
    const preguntaIndex = preguntaSeleccionada;
    const pregunta = preguntasActuales[preguntaIndex];
    const respuesta = respuestasActuales[respuestaIndex];
    
    // Verificar si la conexión es correcta
    const esCorrecta = pregunta.texto === respuesta.preguntaOriginal.texto;
    
    // Si había una conexión anterior para esta pregunta, limpiarla
    if (conexionesActuales.has(preguntaIndex)) {
        limpiarCanvas();
        // Redibujar solo las otras líneas
        conexionesActuales.forEach((conexion, pIndex) => {
            if (pIndex !== preguntaIndex) {
                dibujarLinea(pIndex, conexion.respuestaIndex, conexion.esCorrecta);
            }
        });
    }
    
    // Guardar conexión
    conexionesActuales.set(preguntaIndex, {
        respuestaIndex,
        esCorrecta
    });
    
    // Actualizar interfaz
    const preguntaElement = document.querySelector(`[data-pregunta-index="${preguntaIndex}"]`);
    
    // Limpiar estilos anteriores de esta pregunta
    preguntaElement.classList.remove('seleccionado', 'correcto', 'incorrecto');
    preguntaElement.classList.add(esCorrecta ? 'correcto' : 'incorrecto');
    
    // Dibujar nueva línea
    dibujarLinea(preguntaIndex, respuestaIndex, esCorrecta);
    
    // Resetear selección
    preguntaSeleccionada = null;
    
    // CONTAR SOLO LAS LÍNEAS VERDES ACTUALES
    let aciertosActuales = 0;
    conexionesActuales.forEach((conexion) => {
        if (conexion.esCorrecta) {
            aciertosActuales++;
        }
    });
    
    // Actualizar contador en tiempo real
    document.getElementById('aciertosTotal').textContent = aciertosActuales;
    
    console.log(`Conexiones correctas actuales: ${aciertosActuales}`);
    
    // Verificar si se completó la ronda
    if (conexionesActuales.size === 10) {
        verificarRondaCompleta();
    }
}

// Dibujar línea en canvas
function dibujarLinea(preguntaIndex, respuestaIndex, esCorrecta) {
    const preguntaElement = document.querySelector(`[data-pregunta-index="${preguntaIndex}"]`);
    const respuestaElement = document.querySelector(`[data-respuesta-index="${respuestaIndex}"]`);
    
    const canvasRect = canvas.getBoundingClientRect();
    const preguntaRect = preguntaElement.getBoundingClientRect();
    const respuestaRect = respuestaElement.getBoundingClientRect();
    
    const startX = 0;
    const startY = preguntaRect.top + preguntaRect.height/2 - canvasRect.top;
    const endX = canvas.width;
    const endY = respuestaRect.top + respuestaRect.height/2 - canvasRect.top;
    
    ctx.strokeStyle = esCorrecta ? '#4caf50' : '#f44336';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
}

// Limpiar canvas
function limpiarCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Verificar ronda completa
function verificarRondaCompleta() {
    let aciertos = 0;
    
    conexionesActuales.forEach((conexion) => {
        if (conexion.esCorrecta) {
            aciertos++;
        }
    });
    
    console.log(`Aciertos esta ronda: ${aciertos}`);
    
    // En modo dinámico: solo avanzar si TODAS las respuestas son correctas
    if (modoDinamico) {
        if (aciertos === 10) {
            // Ronda completada: sumar 1 minuto (60 segundos)
            tiempoRestanteSegundos += 60;
            aciertosGlobales += aciertos; // Sumar al total global
            setTimeout(() => {
                siguienteRonda();
            }, 1000);
        }
        // Si no son 10 aciertos, no pasa nada, sigue jugando
        return;
    }
    
    // En modo estático: sumar aciertos y continuar
    if (!modoDinamico) {
        aciertosGlobales += aciertos; // Sumar al total global
        
        // Si completó 10 correctas y hay tiempo, siguiente ronda
        if (aciertos === 10 && tiempoRestanteSegundos > 0) {
            setTimeout(() => {
                siguienteRonda();
            }, 1000);
        }
    }
}

// Siguiente ronda
function siguienteRonda() {
    rondaActual++;
    iniciarNuevaRonda();
}

// Limpiar conexiones
function limpiarConexiones() {
    conexionesActuales.clear();
    preguntaSeleccionada = null;
    
    // Limpiar clases CSS
    document.querySelectorAll('.item-pregunta').forEach(item => {
        item.classList.remove('seleccionado', 'correcto', 'incorrecto');
    });
    
    document.querySelectorAll('.item-respuesta').forEach(item => {
        item.classList.remove('correcto');
    });
    
    // Limpiar canvas
    limpiarCanvas();
}

// Iniciar cronómetro
function iniciarCronometro(segundos) {
    tiempoRestanteSegundos = segundos;
    
    cronometroInterval = setInterval(() => {
        tiempoRestanteSegundos--;
        actualizarDisplayCronometro();
        
        if (tiempoRestanteSegundos <= 0) {
            clearInterval(cronometroInterval);
            finalizarJuego();
        }
    }, 1000);
    
    actualizarDisplayCronometro();
}

// Actualizar display del cronómetro
function actualizarDisplayCronometro() {
    const minutos = Math.floor(tiempoRestanteSegundos / 60);
    const segundos = tiempoRestanteSegundos % 60;
    const display = `${minutos}:${segundos.toString().padStart(2, '0')}`;
    
    const cronometroElement = document.getElementById('cronometroConexiones');
    document.getElementById('tiempoRestante').textContent = display;
    
    // Cambiar colores según tiempo restante
    cronometroElement.className = 'cronometro';
    if (tiempoRestanteSegundos <= 10) {
        cronometroElement.classList.add('danger');
    } else if (tiempoRestanteSegundos <= 30) {
        cronometroElement.classList.add('warning');
    }
}

// Finalizar juego
function finalizarJuego() {
    if (cronometroInterval) {
        clearInterval(cronometroInterval);
    }
    
    // Ocultar juego y mostrar resultados
    document.getElementById('gameContainer').style.display = 'none';
    document.getElementById('cronometroConexiones').style.display = 'none';
    mostrarResultados();
}

// Mostrar resultados
function mostrarResultados() {
    const container = document.getElementById('resultadosContainer');
    
    // Determinar modo de juego
    const tiempoSeleccionadoValue = document.getElementById('tiempoSeleccionadoConexiones').value;
    const esModoEstatico = tiempoSeleccionadoValue === 'estatico';
    const esModoDinamico = tiempoSeleccionadoValue === 'dinamico';
    
    // Calcular métricas según el modo
    let metricaPrincipal, labelMetrica, recordKey, modoTexto;
    
    if (esModoEstatico) {
        // Modo estático: contar TODAS las preguntas correctas del juego
        let conexionesRondaActual = 0;
        conexionesActuales.forEach((conexion) => {
            if (conexion.esCorrecta) {
                conexionesRondaActual++;
            }
        });
        metricaPrincipal = aciertosGlobales + conexionesRondaActual;
        labelMetrica = 'preguntas correctas';
        recordKey = 'record_conexiones_estatico';
        modoTexto = 'Estático';
    } else {
        // Modo dinámico: contar solo rondas COMPLETADAS (10 aciertos cada una)
        const rondasCompletadas = Math.floor(aciertosGlobales / 10);
        metricaPrincipal = rondasCompletadas;
        labelMetrica = 'rondas completadas';
        recordKey = 'record_conexiones_dinamico';
        modoTexto = 'Dinámico';
    }
    
    // Sistema de récords basado en cantidad de subtemas
    const temasSeleccionadosActuales = obtenerTemasSeleccionados();
    let cantidadSubtemasActuales = 0;
    let nombresSubtemasActuales = '';
    
// Contar solo los subtemas seleccionados
    cantidadSubtemasActuales = Array.isArray(temasSeleccionadosActuales) ? temasSeleccionadosActuales.length : 0;
    const temasCheckboxes = document.querySelectorAll('.tema-checkbox:checked');
    const nombresSubtemas = Array.from(temasCheckboxes).map(cb => {
        const labelText = cb.parentElement.textContent.trim();
        return labelText.replace(/\d+ preguntas/, '').replace('↳ ', '').trim();
    });
    nombresSubtemasActuales = nombresSubtemas.join(', ');
    
    // Obtener récord anterior y sus datos
    const recordAnterior = parseInt(localStorage.getItem(recordKey) || '0');
    const subtemasRecordAnterior = parseInt(localStorage.getItem(recordKey + '_cantidadSubtemas') || '0');
    const nombresRecordAnterior = localStorage.getItem(recordKey + '_nombresSubtemas') || '';
    
    let nuevoRecord = recordAnterior;
    let esNuevoRecord = false;
    let nombresSubtemasRecord = nombresRecordAnterior || nombresSubtemasActuales;
    
    console.log(`Métrica actual: ${metricaPrincipal}, Récord anterior: ${recordAnterior}`);
    console.log(`Subtemas actuales: ${cantidadSubtemasActuales}, Subtemas récord: ${subtemasRecordAnterior}`);
    
// Lógica de récord mejorada: mejor puntuación O misma puntuación con más subtemas
    if (metricaPrincipal > recordAnterior || 
        recordAnterior === 0 || 
        (metricaPrincipal === recordAnterior && cantidadSubtemasActuales > subtemasRecordAnterior)) {
        
        nuevoRecord = metricaPrincipal;
        esNuevoRecord = true;
        nombresSubtemasRecord = nombresSubtemasActuales;
        
        console.log(`Guardando nuevo récord: ${nuevoRecord} con ${cantidadSubtemasActuales} subtemas`);
        localStorage.setItem(recordKey, nuevoRecord.toString());
        localStorage.setItem(recordKey + '_cantidadSubtemas', cantidadSubtemasActuales.toString());
        localStorage.setItem(recordKey + '_nombresSubtemas', nombresSubtemasActuales);
        
        // Verificar que se guardó correctamente
        console.log(`Verificación - Récord guardado: ${localStorage.getItem(recordKey)}`);
        console.log(`Verificación - Subtemas guardados: ${localStorage.getItem(recordKey + '_cantidadSubtemas')}`);
    } else {
        // Mantener el récord anterior si no se supera
        nuevoRecord = recordAnterior;
        nombresSubtemasRecord = nombresRecordAnterior;
    }
    
    // Determinar mensaje según resultado
    let mensaje = '';
    let icono = '';
    let color = '';
    
    if (esNuevoRecord && metricaPrincipal > 0) {
        mensaje = '¡NUEVO RÉCORD!';
        icono = '🏆';
        color = '#ffd700';
    } else if (esModoEstatico && metricaPrincipal >= 20) {
        mensaje = '¡Excelente trabajo!';
        icono = '⭐';
        color = '#4caf50';
    } else if (esModoDinamico && metricaPrincipal >= 3) {
        mensaje = '¡Excelente trabajo!';
        icono = '⭐';
        color = '#4caf50';
    } else if (esModoEstatico && metricaPrincipal >= 10) {
        mensaje = '¡Muy bien!';
        icono = '👍';
        color = '#ff9800';
    } else if (esModoDinamico && metricaPrincipal >= 2) {
        mensaje = '¡Muy bien!';
        icono = '👍';
        color = '#ff9800';
    } else if (metricaPrincipal >= 1) {
        mensaje = 'Buen trabajo';
        icono = '👌';
        color = '#2196f3';
    } else {
        mensaje = '¡Sigue practicando!';
        icono = '📚';
        color = '#f44336';
    }
    
    // Generar pantalla diferente según modo
    if (esModoEstatico) {
        mostrarResultadosEstatico(container, metricaPrincipal, nuevoRecord, nombresSubtemasRecord, esNuevoRecord, mensaje, icono, color, recordKey, modoTexto);
    } else {
        mostrarResultadosDinamico(container, metricaPrincipal, nuevoRecord, nombresSubtemasRecord, esNuevoRecord, mensaje, icono, color, recordKey, modoTexto);
    }
    
    container.style.display = 'block';
    
    // Activar confeti si es nuevo récord
    if (esNuevoRecord && metricaPrincipal > 0) {
        setTimeout(() => {
            crearConfeti();
        }, 500);
    }
}
// Mostrar resultados modo estático
function mostrarResultadosEstatico(container, preguntasCorrectas, record, temasRecord, esNuevoRecord, mensaje, icono, color, recordKey, modoTexto) {
    container.innerHTML = `
        <div class="resultado-icono">${icono}</div>
        <div class="resultado-puntuacion" style="color: ${color};">
            ${preguntasCorrectas}
        </div>
        <div class="resultado-mensaje">${mensaje}</div>
        <div class="resultado-detalles">
            <p><strong>Modo:</strong> ${modoTexto}</p>
            <p><strong>Preguntas acertadas:</strong> ${preguntasCorrectas}</p>
            <p><strong>Récord personal:</strong> ${record} preguntas correctas</p>
            <p><strong>Subtemas del récord:</strong> ${temasRecord}</p>
            ${esNuevoRecord ? '<p style="color: #ffd700; font-weight: bold;">¡Nuevo récord personal!</p>' : ''}
            <button onclick="borrarRecord('${recordKey}', '${modoTexto.toLowerCase()}')" style="
                background: #dc3545; 
                color: white; 
                border: none; 
                padding: 8px 16px; 
                border-radius: 5px; 
                cursor: pointer; 
                margin-top: 10px;
                font-size: 12px;
            ">🗑️ Borrar récord</button>
        </div>
        <div class="resultado-stats">
            <div class="stat-card">
                <div class="stat-numero" style="color: #4caf50;">${preguntasCorrectas}</div>
                <div class="stat-label">Preguntas correctas</div>
            </div>
            <div class="stat-card">
                <div class="stat-numero" style="color: #2196f3;">${Math.max(0, rondaActual - 1)}</div>
                <div class="stat-label">Rondas jugadas</div>
            </div>
            <div class="stat-card">
                <div class="stat-numero" style="color: #ffd700;">${record}</div>
                <div class="stat-label">Récord personal</div>
            </div>
        </div>
        <button class="btn-empezar" onclick="volverAJugar()">
            🔄 Jugar de nuevo
        </button>
    `;
}

// Mostrar resultados modo dinámico
function mostrarResultadosDinamico(container, rondasCompletadas, record, temasRecord, esNuevoRecord, mensaje, icono, color, recordKey, modoTexto) {
    container.innerHTML = `
        <div class="resultado-icono">${icono}</div>
        <div class="resultado-puntuacion" style="color: ${color};">
            ${rondasCompletadas}
        </div>
        <div class="resultado-mensaje">${mensaje}</div>
        <div class="resultado-detalles">
            <p><strong>Modo:</strong> ${modoTexto}</p>
            <p><strong>Rondas completadas:</strong> ${rondasCompletadas} (${rondasCompletadas * 10} preguntas perfectas)</p>
            <p><strong>Récord personal:</strong> ${record} rondas completadas</p>
            <p><strong>Subtemas del récord:</strong> ${temasRecord}</p>
            ${esNuevoRecord ? '<p style="color: #ffd700; font-weight: bold;">¡Nuevo récord personal!</p>' : ''}
            <button onclick="borrarRecord('${recordKey}', '${modoTexto.toLowerCase()}')" style="
                background: #dc3545; 
                color: white; 
                border: none; 
                padding: 8px 16px; 
                border-radius: 5px; 
                cursor: pointer; 
                margin-top: 10px;
                font-size: 12px;
            ">🗑️ Borrar récord</button>
        </div>
        <div class="resultado-stats">
            <div class="stat-card">
                <div class="stat-numero" style="color: #4caf50;">${rondasCompletadas}</div>
                <div class="stat-label">Rondas completadas</div>
            </div>
            <div class="stat-card">
                <div class="stat-numero" style="color: #2196f3;">${rondasCompletadas * 10}</div>
                <div class="stat-label">Preguntas perfectas</div>
            </div>
            <div class="stat-card">
                <div class="stat-numero" style="color: #ffd700;">${record}</div>
                <div class="stat-label">Récord personal</div>
            </div>
        </div>
        <button class="btn-empezar" onclick="volverAJugar()">
            🔄 Jugar de nuevo
        </button>
    `;
}
// Volver a jugar
window.volverAJugar = function() {
    // Resetear variables
    juegoActual = null;
    conexionesActuales.clear();
    preguntasActuales = [];
    respuestasActuales = [];
    rondaActual = 1;
    aciertosAcumulados = 0;
    aciertosGlobales = 0; // RESETEAR CONTADOR GLOBAL
    preguntaSeleccionada = null;
    
    if (cronometroInterval) {
        clearInterval(cronometroInterval);
    }
    
    // Mostrar configuración y ocultar otras pantallas
    document.getElementById('configContainer').style.display = 'block';
    document.getElementById('gameContainer').style.display = 'none';
    document.getElementById('cronometroConexiones').style.display = 'none';
    document.getElementById('resultadosContainer').style.display = 'none';
    
    // Limpiar canvas
    limpiarCanvas();
    
    // ACTUALIZAR INFORMACIÓN DE RÉCORDS
    setTimeout(() => {
        mostrarInformacionRecords();
    }, 100);
};

// Funciones auxiliares
function mezclarArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function obtenerPreguntasUnicasAleatorias(preguntas, cantidad) {
    console.log('=== DISTRIBUCIÓN PROPORCIONAL POR TEMAS ===');
    console.log(`Total preguntas recibidas: ${preguntas.length}`);
    console.log(`Cantidad solicitada: ${cantidad}`);
    
    // Crear Map para eliminar duplicados
    const preguntasUnicas = new Map();
    
    preguntas.forEach(pregunta => {
        const clave = pregunta.texto.toLowerCase().trim();
        if (!preguntasUnicas.has(clave)) {
            preguntasUnicas.set(clave, pregunta);
        }
    });
    
    const arrayUnico = Array.from(preguntasUnicas.values());
    console.log(`Preguntas únicas después de filtrar: ${arrayUnico.length}`);
    
    // Agrupar por tema
    const preguntasPorTema = {};
    arrayUnico.forEach(pregunta => {
        const tema = pregunta.temaNombre || 'Desconocido';
        if (!preguntasPorTema[tema]) {
            preguntasPorTema[tema] = [];
        }
        preguntasPorTema[tema].push(pregunta);
    });
    
    const temas = Object.keys(preguntasPorTema);
    console.log(`Temas encontrados: ${temas.join(', ')}`);
    
    temas.forEach(tema => {
        console.log(`${tema}: ${preguntasPorTema[tema].length} preguntas`);
    });
    
    // Si solo hay un tema o se piden todas las preguntas, usar distribución normal
    if (temas.length === 1 || cantidad >= arrayUnico.length) {
        console.log('Distribución normal (un tema o todas las preguntas)');
        return mezclarArray(arrayUnico).slice(0, Math.min(cantidad, arrayUnico.length));
    }
    
const preguntasFinales = [];
    
    // Si hay más temas que preguntas solicitadas, seleccionar temas aleatoriamente
    if (temas.length > cantidad) {
        console.log(`Más temas (${temas.length}) que preguntas (${cantidad}). Seleccionando temas aleatoriamente.`);
        
        // Mezclar temas aleatoriamente y tomar solo los necesarios
        const temasMezclados = mezclarArray([...temas]);
        const temasSeleccionados = temasMezclados.slice(0, cantidad);
        
        console.log(`Temas seleccionados para esta ronda: ${temasSeleccionados.join(', ')}`);
        
        // Una pregunta por tema seleccionado
        temasSeleccionados.forEach(tema => {
            const preguntasDelTema = preguntasPorTema[tema];
            const preguntasMezcladas = mezclarArray([...preguntasDelTema]);
            preguntasFinales.push(preguntasMezcladas[0]);
            
            console.log(`${tema}: 1 pregunta seleccionada`);
        });
    } else {
        // Distribución proporcional cuando hay menos o igual temas que preguntas
        const preguntasPorTemaObjetivo = Math.floor(cantidad / temas.length);
        const preguntasExtra = cantidad % temas.length;
        
        console.log(`Preguntas por tema: ${preguntasPorTemaObjetivo}`);
        console.log(`Preguntas extra: ${preguntasExtra}`);
        
        // Mezclar temas para distribuir las preguntas extra aleatoriamente
        const temasMezclados = mezclarArray([...temas]);
        
        temasMezclados.forEach((tema, index) => {
            let preguntasATomar = preguntasPorTemaObjetivo;
            
            // Repartir las preguntas extra aleatoriamente
            if (index < preguntasExtra) {
                preguntasATomar += 1;
            }
            
            const preguntasDelTema = preguntasPorTema[tema];
            const preguntasTomadas = Math.min(preguntasATomar, preguntasDelTema.length);
            
            // Mezclar y tomar las preguntas de este tema
            const preguntasMezcladas = mezclarArray([...preguntasDelTema]);
            preguntasFinales.push(...preguntasMezcladas.slice(0, preguntasTomadas));
            
            console.log(`${tema}: ${preguntasTomadas} preguntas seleccionadas`);
        });
    }
    
    // Si no se alcanzó la cantidad deseada, completar con preguntas restantes
    if (preguntasFinales.length < cantidad) {
        const preguntasUsadas = new Set(preguntasFinales.map(p => p.texto));
        const preguntasRestantes = arrayUnico.filter(p => !preguntasUsadas.has(p.texto));
        const faltantes = cantidad - preguntasFinales.length;
        
        preguntasFinales.push(...mezclarArray(preguntasRestantes).slice(0, faltantes));
        console.log(`Agregadas ${faltantes} preguntas adicionales para completar`);
    }
    
    console.log(`Total final: ${preguntasFinales.length} preguntas`);
    console.log('===============================================');
    
    // Mezclar el resultado final para que no aparezcan agrupadas por tema
    return mezclarArray(preguntasFinales);
}

// Cerrar dropdown al hacer click fuera
document.addEventListener('click', function(event) {
    const dropdown = document.querySelector('.dropdown-temas');
    const content = document.getElementById('dropdownContent');
    
    if (dropdown && !dropdown.contains(event.target) && content && content.style.display === 'block') {
        content.style.display = 'none';
        document.querySelector('.dropdown-arrow').textContent = '▼';
    }
});

// Ajustar canvas al cambiar tamaño de ventana
window.addEventListener('resize', function() {
    if (canvas && juegoActual) {
        // Redibujar líneas existentes después del resize
        setTimeout(() => {
            limpiarCanvas();
            conexionesActuales.forEach((conexion, preguntaIndex) => {
                dibujarLinea(preguntaIndex, conexion.respuestaIndex, conexion.esCorrecta);
            });
        }, 100);
    }
});

// Función para manejar teclas de teclado
document.addEventListener('keydown', function(event) {
    // ESC para limpiar selección
    if (event.key === 'Escape') {
        if (preguntaSeleccionada !== null) {
            document.querySelectorAll('.item-pregunta').forEach(item => {
                item.classList.remove('seleccionado');
            });
            preguntaSeleccionada = null;
        }
    }
    
    // Números 1-0 para seleccionar preguntas rápidamente
    if (event.key >= '1' && event.key <= '9') {
        const index = parseInt(event.key) - 1;
        if (preguntasActuales && index < preguntasActuales.length) {
            seleccionarPregunta(index);
        }
    } else if (event.key === '0') {
        if (preguntasActuales && preguntasActuales.length === 10) {
            seleccionarPregunta(9);
        }
    }
});

// Función de debug para logging
function debugLog(mensaje, datos = null) {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log(`[CONEXIONES DEBUG] ${mensaje}`, datos ? datos : '');
    }
}

// Función para crear confeti
function crearConfeti() {
    for (let i = 0; i < 50; i++) {
        setTimeout(() => {
            const confeti = document.createElement('div');
            confeti.className = 'confeti';
            confeti.style.left = Math.random() * 100 + '%';
            confeti.style.animationDuration = (Math.random() * 2 + 3) + 's';
            confeti.style.animationDelay = Math.random() * 2 + 's';
            confeti.style.animation = 'caerConfeti linear infinite';
            
            document.body.appendChild(confeti);
            
            // Eliminar después de la animación
            setTimeout(() => {
                if (confeti.parentNode) {
                    confeti.parentNode.removeChild(confeti);
                }
            }, 5000);
        }, i * 50);
    }
}

// Función para borrar récord
window.borrarRecord = function(recordKey, modoTexto) {
    const confirmacion = confirm(`¿Estás seguro de que quieres borrar tu récord en modo ${modoTexto}? Esta acción no se puede deshacer.`);
    
    if (confirmacion) {
        // BORRAR COMPLETAMENTE - poner a 0
        localStorage.setItem(recordKey, '0');
        localStorage.setItem(recordKey + '_cantidadSubtemas', '0');
        localStorage.setItem(recordKey + '_nombresSubtemas', 'Ninguno');
        
        alert(`Récord en modo ${modoTexto} reseteado a 0.`);
        
        // Actualizar la pantalla de resultados
        mostrarResultados();
        
        // Actualizar información de récords en la pantalla inicial
        setTimeout(() => {
            if (document.getElementById('configContainer').style.display === 'block') {
                mostrarInformacionRecords();
            }
        }, 100);
    }
};

// Inicialización adicional
debugLog('Conexiones.js cargado completamente');
// Forzar ocultación de "Todos los temas" cuando se carga la página
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        // Buscar y ocultar todos los elementos que contengan "Todos los temas"
        const elementosATodos = document.querySelectorAll('*');
        elementosATodos.forEach(elemento => {
            const texto = elemento.textContent ? elemento.textContent.trim() : '';
            if (texto.startsWith('Todos los temas') || texto === '0 preguntas') {
                elemento.style.display = 'none !important';
                if (elemento.parentElement) {
                    elemento.parentElement.style.display = 'none !important';
                }
            }
        });
    }, 500);
});
