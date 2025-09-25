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
let modoDinamico = false;

// Canvas y contexto para las líneas
let canvas, ctx;

// Elementos del DOM
const userNameSpan = document.getElementById('userName');
const backBtn = document.getElementById('backBtn');
const logoutBtn = document.getElementById('logoutBtn');

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

        // Actualizar contador total
        document.getElementById('preguntasTodosLosTemasConexiones').textContent = `${totalPreguntasVerificadas} preguntas`;

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
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; font-weight: bold; color: #555; background: #f8f9fa;">
                    <span>${tema.nombre}</span>
                    <span class="tema-preguntas">${tema.preguntasVerificadas} preguntas</span>
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
        
    } catch (error) {
        console.error('Error cargando temas:', error);
    }
}

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
    const todosLosTemas = document.getElementById('todosLosTemasConexiones');
    const temasCheckboxes = document.querySelectorAll('.tema-checkbox:not(#todosLosTemasConexiones)');
    const placeholder = document.getElementById('temasSeleccionadosTexto');
    
    const checkboxClickeado = event ? event.target : null;
    
    // Si se clickeó "Todos los temas"
    if (checkboxClickeado === todosLosTemas) {
        if (todosLosTemas.checked) {
            temasCheckboxes.forEach(checkbox => {
                checkbox.checked = false;
            });
            placeholder.textContent = 'Todos los temas seleccionados';
        }
    } else {
        // Se clickeó un tema específico
        if (checkboxClickeado && checkboxClickeado.checked) {
            todosLosTemas.checked = false;
        }
        
        // Contar temas seleccionados después del cambio
        const temasSeleccionados = Array.from(temasCheckboxes).filter(cb => cb.checked);
        
        if (temasSeleccionados.length === 0) {
            todosLosTemas.checked = true;
            placeholder.textContent = 'Todos los temas seleccionados';
        } else {
            placeholder.textContent = `${temasSeleccionados.length} tema(s) seleccionado(s)`;
        }
    }
    
    actualizarPreguntasDisponibles();
};

// Actualizar preguntas disponibles
async function actualizarPreguntasDisponibles() {
    const infoElement = document.getElementById('preguntasDisponiblesConexiones');
    if (!infoElement) return;
    
    try {
        const todosLosTemas = document.getElementById('todosLosTemasConexiones');
        const temasCheckboxes = document.querySelectorAll('.tema-checkbox:checked:not(#todosLosTemasConexiones)');
        
        let preguntasVerificadas = 0;
        
        if (todosLosTemas && todosLosTemas.checked) {
            // Contar todas las preguntas verificadas
            const q = query(collection(db, "temas"), where("usuarioId", "==", currentUser.uid));
            const querySnapshot = await getDocs(q);
            
            querySnapshot.forEach((doc) => {
                const tema = doc.data();
                if (tema.preguntas) {
                    preguntasVerificadas += tema.preguntas.filter(p => p.verificada).length;
                }
            });
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
        
        // Mostrar interfaz del juego
        document.getElementById('configContainer').style.display = 'none';
        document.getElementById('gameContainer').style.display = 'block';
        
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
    const todosLosTemas = document.getElementById('todosLosTemasConexiones');
    
    if (todosLosTemas && todosLosTemas.checked) {
        return 'todos';
    }
    
    const checkboxesMarcados = document.querySelectorAll('.tema-checkbox:checked:not(#todosLosTemasConexiones)');
    const idsSeleccionados = Array.from(checkboxesMarcados).map(cb => cb.value);
    
    return idsSeleccionados.length === 0 ? 'todos' : idsSeleccionados;
}

// Obtener preguntas verificadas (reutilizar de tests.js)
async function obtenerPreguntasVerificadas(temasSeleccionados) {
    let preguntasVerificadas = [];

    if (temasSeleccionados === 'todos') {
        const q = query(collection(db, "temas"), where("usuarioId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        
        querySnapshot.forEach((doc) => {
            const tema = doc.data();
            if (tema.preguntas) {
                tema.preguntas.forEach((pregunta) => {
                    if (pregunta.verificada) {
                        preguntasVerificadas.push({
                            ...pregunta,
                            temaId: doc.id,
                            temaNombre: tema.nombre
                        });
                    }
                });
            }
        });
    } else if (Array.isArray(temasSeleccionados)) {
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
    document.getElementById('aciertosTotal').textContent = aciertosAcumulados;
    
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
    const respuestaElement = document.querySelector(`[data-respuesta-index="${respuestaIndex}"]`);
    
    // Limpiar estilos anteriores de esta pregunta
    preguntaElement.classList.remove('seleccionado', 'correcto', 'incorrecto');
    preguntaElement.classList.add(esCorrecta ? 'correcto' : 'incorrecto');
    
    // Dibujar nueva línea
    dibujarLinea(preguntaIndex, respuestaIndex, esCorrecta);
    
    // Resetear selección
    preguntaSeleccionada = null;
    
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
    
    aciertosAcumulados += aciertos;
    
    // En modo dinámico: ganar tiempo por completar la ronda
    if (modoDinamico && aciertos === 10) {
        tiempoRestanteSegundos += 30;
        setTimeout(() => {
            alert(`¡Ronda ${rondaActual} completada! +30 segundos ganados. Continuando...`);
            siguienteRonda();
        }, 1000);
        return;
    }
    
    // En modo estático: continuar automáticamente si hay tiempo
    const tiempoSeleccionado = document.getElementById('tiempoSeleccionadoConexiones').value;
    if (tiempoSeleccionado === 'estatico' && aciertos === 10 && tiempoRestanteSegundos > 0) {
        setTimeout(() => {
            siguienteRonda();
        }, 1000);
        return;
    }
    
    // Mostrar botón para siguiente ronda en otros casos
    setTimeout(() => {
        alert(`¡Ronda ${rondaActual} completada! Acertaste ${aciertos} de 10 conexiones.`);
        if (aciertos === 10) {
            document.getElementById('siguienteRondaBtn').style.display = 'inline-block';
        } else {
            document.getElementById('siguienteRondaBtn').style.display = 'inline-block';
        }
    }, 1000);
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
    mostrarResultados();
}

// Mostrar resultados
function mostrarResultados() {
    const container = document.getElementById('resultadosContainer');
    
    // Determinar mensaje según aciertos
    let mensaje = '';
    let icono = '';
    let color = '';
    
    if (aciertosAcumulados >= rondaActual * 8) {
        mensaje = '¡Excelente trabajo!';
        icono = '🏆';
        color = '#4caf50';
    } else if (aciertosAcumulados >= rondaActual * 6) {
        mensaje = '¡Muy bien!';
        icono = '⭐';
        color = '#ff9800';
    } else if (aciertosAcumulados >= rondaActual * 4) {
        mensaje = 'Buen trabajo';
        icono = '👍';
        color = '#2196f3';
    } else {
        mensaje = '¡Sigue practicando!';
        icono = '📚';
        color = '#f44336';
    }
    
    container.innerHTML = `
        <div class="resultado-icono">${icono}</div>
        <div class="resultado-puntuacion" style="color: ${color};">
            ${aciertosAcumulados} / ${rondaActual * 10}
        </div>
        <div class="resultado-mensaje">${mensaje}</div>
        <div class="resultado-detalles">
            <p><strong>Rondas completadas:</strong> ${rondaActual}</p>
            <p><strong>Tiempo empleado:</strong> ${juegoActual.tiempoTotal - tiempoRestanteSegundos} segundos</p>
            <p><strong>Promedio de aciertos:</strong> ${Math.round((aciertosAcumulados / (rondaActual * 10)) * 100)}%</p>
        </div>
        <div class="resultado-stats">
            <div class="stat-card">
                <div class="stat-numero" style="color: #4caf50;">${aciertosAcumulados}</div>
                <div class="stat-label">Conexiones correctas</div>
            </div>
            <div class="stat-card">
                <div class="stat-numero" style="color: #f44336;">${(rondaActual * 10) - aciertosAcumulados}</div>
                <div class="stat-label">Conexiones incorrectas</div>
            </div>
            <div class="stat-card">
                <div class="stat-numero" style="color: #2196f3;">${rondaActual}</div>
                <div class="stat-label">Rondas jugadas</div>
            </div>
        </div>
        <button class="btn-empezar" onclick="volverAJugar()">
            🔄 Jugar de nuevo
        </button>
    `;
    
    container.style.display = 'block';
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
    preguntaSeleccionada = null;
    
    if (cronometroInterval) {
        clearInterval(cronometroInterval);
    }
    
    // Mostrar configuración y ocultar otras pantallas
    document.getElementById('configContainer').style.display = 'block';
    document.getElementById('gameContainer').style.display = 'none';
    document.getElementById('resultadosContainer').style.display = 'none';
    
    // Limpiar canvas
    limpiarCanvas();
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
    // Crear Map para eliminar duplicados
    const preguntasUnicas = new Map();
    
    preguntas.forEach(pregunta => {
        const clave = pregunta.texto.toLowerCase().trim();
        if (!preguntasUnicas.has(clave)) {
            preguntasUnicas.set(clave, pregunta);
        }
    });
    
    const arrayUnico = Array.from(preguntasUnicas.values());
    return mezclarArray(arrayUnico).slice(0, Math.min(cantidad, arrayUnico.length));
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

// Inicialización adicional
debugLog('Conexiones.js cargado completamente');
