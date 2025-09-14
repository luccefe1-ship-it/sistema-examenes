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
    deleteDoc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ===============================================
// VARIABLES GLOBALES
// ===============================================
let currentUser = null;
let salaActual = null;
let claveActual = null;
let esAnfitrion = false;
let jugadorActual = null; // 'jugador1' o 'jugador2'
let rival = null;
let misPreguntasVerificadas = [];
let preguntasRival = [];
let turnoActual = null;
let unsubscribeSala = null;

// Elementos del DOM
const pantallaInicial = document.getElementById('pantallaInicial');
const salaEspera = document.getElementById('salaEspera');
const interfazJuego = document.getElementById('interfazJuego');
const pantallaResultado = document.getElementById('pantallaResultado');
const modalCrearSala = document.getElementById('modalCrearSala');
const modalUnirseSala = document.getElementById('modalUnirseSala');

// ===============================================
// AUTENTICACIÓN Y CONFIGURACIÓN INICIAL
// ===============================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        console.log('Usuario autenticado:', user.email);
        await cargarPreguntasVerificadas();
        inicializarEventListeners();
    } else {
        alert('Debes estar logueado para jugar en multijugador');
        window.location.href = 'login.html';
    }
});

async function cargarPreguntasVerificadas() {
    try {
        console.log('Cargando preguntas verificadas...');
        misPreguntasVerificadas = [];
        
        const q = query(collection(db, "temas"), where("usuarioId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        
        querySnapshot.forEach((doc) => {
            const tema = doc.data();
            const temaId = doc.id;
            
            if (tema.preguntas) {
                tema.preguntas.forEach((pregunta, index) => {
                    if (pregunta.verificada === true) {
                        misPreguntasVerificadas.push({
                            id: `${temaId}_${index}`,
                            temaId: temaId,
                            temaNombre: tema.nombre,
                            temaEpigrafe: tema.descripcion || '',
                            pregunta: pregunta.texto,
                            opciones: pregunta.opciones.map(op => op.texto),
                            respuestaCorrecta: pregunta.opciones.findIndex(op => op.esCorrecta),
                            esSubtema: false
                        });
                    }
                });
            }
        });
        
        console.log(`Cargadas ${misPreguntasVerificadas.length} preguntas verificadas`);
        
        if (misPreguntasVerificadas.length === 0) {
            alert('Necesitas tener preguntas verificadas para jugar en multijugador');
            window.location.href = 'homepage.html';
        }
        
    } catch (error) {
        console.error('Error cargando preguntas:', error);
        misPreguntasVerificadas = [];
    }
}

function inicializarEventListeners() {
    // Botones principales
    document.getElementById('btnCrearSala').addEventListener('click', mostrarModalCrearSala);
    document.getElementById('btnUnirseSala').addEventListener('click', mostrarModalUnirseSala);
    
    // Modales
    document.getElementById('confirmarCrearSala').addEventListener('click', crearSala);
    document.getElementById('confirmarUnirseSala').addEventListener('click', unirseSala);
    document.getElementById('cancelarCrearSala').addEventListener('click', cerrarModales);
    document.getElementById('cancelarUnirseSala').addEventListener('click', cerrarModales);
    
    // Sala de espera
    document.getElementById('btnEstoyListo').addEventListener('click', marcarListo);
    document.getElementById('salirSala').addEventListener('click', salirDeSala);
    document.getElementById('copiarClave').addEventListener('click', copiarClaveSala);
    
    // Navegación
    document.getElementById('volverHome').addEventListener('click', () => {
        window.location.href = 'homepage.html';
    });
    
    // Resultado
    document.getElementById('repetirDuelo').addEventListener('click', repetirDuelo);
    document.getElementById('salirDuelo').addEventListener('click', salirDeSala);
    
    console.log('Event listeners inicializados');
}

function mostrarModalCrearSala() {
    modalCrearSala.style.display = 'flex';
    document.getElementById('nombreAnfitrion').focus();
}

function mostrarModalUnirseSala() {
    modalUnirseSala.style.display = 'flex';
    document.getElementById('nombreInvitado').focus();
}

function cerrarModales() {
    modalCrearSala.style.display = 'none';
    modalUnirseSala.style.display = 'none';
}

// ===============================================
// GESTIÓN DE SALAS
// ===============================================
async function crearSala() {
    const nombreAnfitrion = document.getElementById('nombreAnfitrion').value.trim();
    
    if (!nombreAnfitrion) {
        alert('Ingresa tu nombre');
        return;
    }
    
    try {
        claveActual = generarClaveSala();
        esAnfitrion = true;
        jugadorActual = 'jugador1';
        
        const salaData = {
            clave: claveActual,
            anfitrion: currentUser.uid,
            creada: new Date(),
            jugadores: {
                jugador1: {
                    uid: currentUser.uid,
                    nombre: nombreAnfitrion,
                    preguntas: misPreguntasVerificadas,
                    errores: 0,
                    listo: false
                },
                jugador2: null
            },
            turno: 'jugador1',
            juego: {
                preguntaActual: null,
                respondiendo: null,
                respuestaSeleccionada: null,
                resultadoVisible: false
            }
        };
        
        await setDoc(doc(db, 'salas', claveActual), salaData);
        
        cerrarModales();
        mostrarSalaEspera();
        escucharCambiosSala();
        
        console.log('Sala creada:', claveActual);
        
    } catch (error) {
        console.error('Error creando sala:', error);
        alert('Error al crear la sala');
    }
}

async function unirseSala() {
    const nombreInvitado = document.getElementById('nombreInvitado').value.trim();
    const claveSala = document.getElementById('claveSala').value.trim().toUpperCase();
    
    if (!nombreInvitado || !claveSala) {
        alert('Completa todos los campos');
        return;
    }
    
    try {
        const salaRef = doc(db, 'salas', claveSala);
        const salaSnap = await getDoc(salaRef);
        
        if (!salaSnap.exists()) {
            alert('La sala no existe');
            return;
        }
        
        const salaData = salaSnap.data();
        
        if (salaData.jugadores.jugador2) {
            alert('La sala está llena');
            return;
        }
        
        claveActual = claveSala;
        esAnfitrion = false;
        jugadorActual = 'jugador2';
        
        await updateDoc(salaRef, {
            'jugadores.jugador2': {
                uid: currentUser.uid,
                nombre: nombreInvitado,
                preguntas: misPreguntasVerificadas,
                errores: 0,
                listo: false
            }
        });
        
        cerrarModales();
        mostrarSalaEspera();
        escucharCambiosSala();
        
        console.log('Unido a sala:', claveActual);
        
    } catch (error) {
        console.error('Error uniéndose a sala:', error);
        alert('Error al unirse a la sala');
    }
}

// ===============================================
// SALA DE ESPERA
// ===============================================
function mostrarSalaEspera() {
    pantallaInicial.style.display = 'none';
    salaEspera.classList.remove('hidden');
    
    document.getElementById('claveGenerada').textContent = claveActual;
}

function escucharCambiosSala() {
    if (unsubscribeSala) {
        unsubscribeSala();
    }
    
    const salaRef = doc(db, 'salas', claveActual);
    
    unsubscribeSala = onSnapshot(salaRef, (doc) => {
        if (!doc.exists()) {
            alert('La sala fue eliminada');
            volverAInicio();
            return;
        }
        
        const salaData = doc.data();
        actualizarSalaEspera(salaData);
        
        if (salaData.jugadores.jugador1?.listo && salaData.jugadores.jugador2?.listo) {
            mostrarInterfazJuego(salaData);
        }
        
        if (salaData.jugadores.jugador1?.errores >= 3 || salaData.jugadores.jugador2?.errores >= 3) {
            mostrarResultado(salaData);
        }
    });
}

function actualizarSalaEspera(salaData) {
    const estadoJugador1 = document.getElementById('estadoJugador1');
    const estadoJugador2 = document.getElementById('estadoJugador2');
    const nombreJugador1 = document.getElementById('nombreJugador1');
    const nombreJugador2 = document.getElementById('nombreJugador2');
    const btnListo = document.getElementById('btnEstoyListo');
    
    if (salaData.jugadores.jugador1) {
        nombreJugador1.textContent = salaData.jugadores.jugador1.nombre;
        estadoJugador1.textContent = salaData.jugadores.jugador1.listo ? 'Listo' : 'Esperando...';
    }
    
    if (salaData.jugadores.jugador2) {
        nombreJugador2.textContent = salaData.jugadores.jugador2.nombre;
        estadoJugador2.textContent = salaData.jugadores.jugador2.listo ? 'Listo' : 'Esperando...';
    } else {
        nombreJugador2.textContent = '';
        estadoJugador2.textContent = 'Esperando segundo jugador...';
    }
    
    const misDatos = salaData.jugadores[jugadorActual];
    if (misDatos?.listo) {
        btnListo.textContent = 'Estás listo';
        btnListo.disabled = true;
    } else {
        btnListo.textContent = 'Estoy Listo';
        btnListo.disabled = !salaData.jugadores.jugador2;
    }
}

async function marcarListo() {
    try {
        const salaRef = doc(db, 'salas', claveActual);
        await updateDoc(salaRef, {
            [`jugadores.${jugadorActual}.listo`]: true
        });
        
    } catch (error) {
        console.error('Error marcando listo:', error);
    }
}
// ===============================================
// INTERFAZ DEL JUEGO
// ===============================================
function mostrarInterfazJuego(salaData) {
    salaEspera.classList.add('hidden');
    interfazJuego.classList.remove('hidden');
    
    const jugador1 = salaData.jugadores.jugador1;
    const jugador2 = salaData.jugadores.jugador2;
    
    if (jugadorActual === 'jugador1') {
        rival = 'jugador2';
        document.getElementById('nombreUsuarioActual').textContent = jugador1.nombre;
        document.getElementById('nombreRival').textContent = jugador2.nombre;
        preguntasRival = jugador2.preguntas;
    } else {
        rival = 'jugador1';
        document.getElementById('nombreUsuarioActual').textContent = jugador2.nombre;
        document.getElementById('nombreRival').textContent = jugador1.nombre;
        preguntasRival = jugador1.preguntas;
    }
    
    actualizarMarcadores(salaData);
    mostrarTemasUsuario();
    mostrarTemasRival();
    actualizarTurno(salaData);
}

function actualizarMarcadores(salaData) {
    const jugador1 = salaData.jugadores.jugador1;
    const jugador2 = salaData.jugadores.jugador2;
    
    if (jugadorActual === 'jugador1') {
        document.getElementById('marcadorUsuario').textContent = `${jugador1.errores || 0}/3`;
        document.getElementById('marcadorRival').textContent = `${jugador2.errores || 0}/3`;
    } else {
        document.getElementById('marcadorUsuario').textContent = `${jugador2.errores || 0}/3`;
        document.getElementById('marcadorRival').textContent = `${jugador1.errores || 0}/3`;
    }
}

function mostrarTemasUsuario() {
    const container = document.getElementById('temasUsuario');
    const temasAgrupados = agruparPreguntasPorTemas(misPreguntasVerificadas);
    
    container.innerHTML = '';
    
    Object.values(temasAgrupados).forEach(tema => {
        const temaElement = crearElementoTema(tema, false);
        container.appendChild(temaElement);
    });
}

function mostrarTemasRival() {
    const container = document.getElementById('temasRival');
    const temasAgrupados = agruparPreguntasPorTemas(preguntasRival);
    
    container.innerHTML = '';
    
    Object.values(temasAgrupados).forEach(tema => {
        const temaElement = crearElementoTema(tema, true);
        container.appendChild(temaElement);
    });
}

function crearElementoTema(tema, esClickeable) {
    const temaDiv = document.createElement('div');
    temaDiv.className = 'tema-container';
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'tema-header';
    headerDiv.textContent = tema.nombre;
    
    const containerDiv = document.createElement('div');
    containerDiv.className = 'tema-content';
    containerDiv.style.display = 'none';
    
    if (esClickeable) {
        headerDiv.style.cursor = 'pointer';
        headerDiv.addEventListener('click', () => {
            if (turnoActual !== jugadorActual) return;
            
            const isExpanded = containerDiv.style.display !== 'none';
            containerDiv.style.display = isExpanded ? 'none' : 'block';
            headerDiv.classList.toggle('expandido', !isExpanded);
        });
    }
    
    tema.preguntas.forEach(pregunta => {
        const preguntaDiv = document.createElement('div');
        preguntaDiv.className = 'pregunta-item';
        preguntaDiv.textContent = pregunta.pregunta;
        
        if (esClickeable) {
            preguntaDiv.addEventListener('click', () => {
                if (turnoActual === jugadorActual) {
                    seleccionarPregunta(pregunta);
                }
            });
        }
        
        containerDiv.appendChild(preguntaDiv);
    });
    
    temaDiv.appendChild(headerDiv);
    temaDiv.appendChild(containerDiv);
    
    return temaDiv;
}

// ===============================================
// GESTIÓN DE TURNOS Y PREGUNTAS
// ===============================================
function actualizarTurno(salaData) {
    turnoActual = salaData.turno;
    const esMiTurno = turnoActual === jugadorActual;
    
    const textoTurno = document.getElementById('textoTurno');
    
    if (salaData.juego?.preguntaActual) {
        if (salaData.juego.respondiendo === jugadorActual) {
            textoTurno.textContent = 'TE TOCA RESPONDER';
            mostrarPreguntaParaResponder(salaData.juego.preguntaActual);
            
            // SI HAY RESULTADO VISIBLE, APLICAR COLORES INMEDIATAMENTE
            if (salaData.juego?.resultadoVisible && salaData.juego?.respuestaSeleccionada !== undefined) {
                console.log('Aplicando colores porque hay resultado visible');
                mostrarResultadoRespuesta(salaData.juego.respuestaSeleccionada, salaData.juego.preguntaActual.respuestaCorrecta);
            }
        } else {
            textoTurno.textContent = 'ESPERANDO RESPUESTA DEL RIVAL';
            mostrarPreguntaEsperando(salaData.juego.preguntaActual, salaData);
        }
    } else {
        if (esMiTurno) {
            textoTurno.textContent = 'TE TOCA PREGUNTAR';
            habilitarSeleccionPreguntas();
        } else {
            textoTurno.textContent = 'ESPERANDO PREGUNTA DEL RIVAL';
            deshabilitarSeleccionPreguntas();
        }
        limpiarVentanaCentral();
    }
}

function habilitarSeleccionPreguntas() {
    const temasRival = document.querySelectorAll('#temasRival .tema-header');
    temasRival.forEach(tema => {
        tema.style.opacity = '1';
        tema.style.pointerEvents = 'auto';
    });
    
    const temasUsuario = document.querySelectorAll('#temasUsuario .tema-header');
    temasUsuario.forEach(tema => {
        tema.style.opacity = '0.5';
        tema.style.pointerEvents = 'none';
    });
}

function deshabilitarSeleccionPreguntas() {
    const temasRival = document.querySelectorAll('#temasRival .tema-header');
    temasRival.forEach(tema => {
        tema.style.opacity = '0.5';
        tema.style.pointerEvents = 'none';
    });
    
    const temasUsuario = document.querySelectorAll('#temasUsuario .tema-header');
    temasUsuario.forEach(tema => {
        tema.style.opacity = '0.5';
        tema.style.pointerEvents = 'none';
    });
}

function limpiarVentanaCentral() {
    const textoPregunta = document.getElementById('textoPregunta');
    const opcionesPregunta = document.getElementById('opcionesPregunta');
    
    textoPregunta.textContent = 'Selecciona una pregunta del rival para empezar';
    opcionesPregunta.innerHTML = '';
}

async function seleccionarPregunta(pregunta) {
    if (turnoActual !== jugadorActual) {
        alert('No es tu turno para preguntar');
        return;
    }
    
    try {
        const salaRef = doc(db, 'salas', claveActual);
        await updateDoc(salaRef, {
            'juego.preguntaActual': pregunta,
            'juego.respondiendo': rival
        });
        
    } catch (error) {
        console.error('Error seleccionando pregunta:', error);
    }
}

// ===============================================
// SISTEMA DE RESPUESTAS COMPLETAMENTE NUEVO
// ===============================================
function mostrarPreguntaParaResponder(pregunta) {
    const textoPregunta = document.getElementById('textoPregunta');
    const opcionesPregunta = document.getElementById('opcionesPregunta');
    
    textoPregunta.textContent = pregunta.pregunta;
    opcionesPregunta.innerHTML = '';
    
    pregunta.opciones.forEach((opcion, index) => {
        const btn = document.createElement('button');
        btn.className = 'opcion-btn';
        btn.textContent = opcion;
        btn.setAttribute('data-index', index);
        btn.addEventListener('click', () => responderPregunta(index, pregunta));
        opcionesPregunta.appendChild(btn);
    });
}

function mostrarPreguntaEsperando(pregunta, salaData) {
    const textoPregunta = document.getElementById('textoPregunta');
    const opcionesPregunta = document.getElementById('opcionesPregunta');
    
    textoPregunta.textContent = pregunta.pregunta;
    opcionesPregunta.innerHTML = '';
    
    pregunta.opciones.forEach((opcion, index) => {
        const div = document.createElement('div');
        div.className = 'opcion-esperando';
        div.textContent = opcion;
        
        // Si hay resultado visible, aplicar los mismos colores que ve el que respondió
        if (salaData.juego?.resultadoVisible && salaData.juego?.respuestaSeleccionada !== undefined) {
            const respuestaSeleccionada = salaData.juego.respuestaSeleccionada;
            
            // APLICAR LOS MISMOS COLORES QUE EN mostrarResultadoRespuesta
            if (index === pregunta.respuestaCorrecta) {
                // RESPUESTA CORRECTA - VERDE
                div.style.backgroundColor = '#d4edda';
                div.style.borderColor = '#28a745';
                div.style.border = '3px solid #28a745';
                div.style.color = '#155724';
                div.style.fontWeight = 'bold';
                console.log(`✅ Opción ${index} mostrada en VERDE para el que pregunta`);
            }
            
            if (index === respuestaSeleccionada && index !== pregunta.respuestaCorrecta) {
                // RESPUESTA INCORRECTA SELECCIONADA - ROJO
                div.style.backgroundColor = '#f8d7da';
                div.style.borderColor = '#dc3545';
                div.style.border = '3px solid #dc3545';
                div.style.color = '#721c24';
                div.style.fontWeight = 'bold';
                console.log(`❌ Opción ${index} mostrada en ROJO para el que pregunta`);
            }
            
            if (index === respuestaSeleccionada) {
                // BORDE NEGRO PARA LA SELECCIONADA
                div.style.boxShadow = '0 0 0 3px #000000';
                console.log(`🎯 Opción ${index} con borde negro para el que pregunta`);
            }
        }
        
        opcionesPregunta.appendChild(div);
    });
    
    if (!salaData.juego?.resultadoVisible) {
        const esperandoDiv = document.createElement('p');
        esperandoDiv.className = 'esperando-respuesta';
        esperandoDiv.textContent = 'Esperando respuesta del rival...';
        opcionesPregunta.appendChild(esperandoDiv);
    } else {
        // Mostrar mensaje del resultado
        const resultadoDiv = document.createElement('p');
        resultadoDiv.className = 'esperando-respuesta';
        const esCorrecta = salaData.juego.respuestaSeleccionada === pregunta.respuestaCorrecta;
        resultadoDiv.textContent = `El rival respondió: ${esCorrecta ? 'CORRECTO' : 'INCORRECTO'}`;
        resultadoDiv.style.fontWeight = 'bold';
        resultadoDiv.style.color = esCorrecta ? '#28a745' : '#dc3545';
        opcionesPregunta.appendChild(resultadoDiv);
    }
}

async function responderPregunta(indiceSeleccionado, pregunta) {
    try {
        console.log('Respuesta seleccionada:', indiceSeleccionado);
        
        const esCorrecta = indiceSeleccionado === pregunta.respuestaCorrecta;
        console.log('Es correcta:', esCorrecta);
        
        // MOSTRAR RESULTADO INMEDIATAMENTE CON NUEVO SISTEMA
        mostrarResultadoRespuesta(indiceSeleccionado, pregunta.respuestaCorrecta);
        
        const salaRef = doc(db, 'salas', claveActual);
        const snapshot = await getDoc(salaRef);
        const salaData = snapshot.data();
        
        if (!esCorrecta) {
            const erroresActuales = salaData.jugadores[jugadorActual].errores || 0;
            const nuevosErrores = erroresActuales + 1;
            
            await updateDoc(salaRef, {
                [`jugadores.${jugadorActual}.errores`]: nuevosErrores
            });
            
            if (nuevosErrores >= 3) {
                return;
            }
        }
        
        await updateDoc(salaRef, {
            'juego.respuestaSeleccionada': indiceSeleccionado,
            'juego.resultadoVisible': true
        });
        
        setTimeout(async () => {
            await updateDoc(salaRef, {
                'juego.preguntaActual': null,
                'juego.respondiendo': null,
                'juego.respuestaSeleccionada': null,
                'juego.resultadoVisible': false,
                turno: jugadorActual
            });
        }, 3000);
        
    } catch (error) {
        console.error('Error respondiendo pregunta:', error);
    }
}

function mostrarResultadoRespuesta(indiceSeleccionado, indiceCorrecta) {
    console.log('Aplicando colores directo en ventana central');
    
    // QUITAR EL OVERLAY - trabajar directamente en la ventana central
    const opcionesPregunta = document.getElementById('opcionesPregunta');
    
    if (!opcionesPregunta) {
        console.error('No se encontró opcionesPregunta');
        return;
    }
    
    // OBTENER TODOS LOS BOTONES EXISTENTES
    const botones = opcionesPregunta.querySelectorAll('.opcion-btn');
    console.log('Botones encontrados:', botones.length);
    
    if (botones.length === 0) {
        console.error('No hay botones para colorear');
        return;
    }
    
    // APLICAR COLORES DIRECTAMENTE A LOS BOTONES EXISTENTES
    botones.forEach((boton, index) => {
        // Deshabilitar el botón
        boton.disabled = true;
        boton.style.cursor = 'not-allowed';
        
        // LIMPIAR CLASES Y ESTILOS ANTERIORES
        boton.className = 'opcion-btn respuesta-final';
        
        // APLICAR COLORES SEGÚN EL TIPO
        if (index === indiceCorrecta) {
            // RESPUESTA CORRECTA - VERDE
            boton.style.backgroundColor = '#d4edda';
            boton.style.borderColor = '#28a745';
            boton.style.border = '3px solid #28a745';
            boton.style.color = '#155724';
            boton.style.fontWeight = 'bold';
            console.log(`✅ Botón ${index} coloreado VERDE (correcto)`);
        } 
        
        if (index === indiceSeleccionado && index !== indiceCorrecta) {
            // RESPUESTA INCORRECTA SELECCIONADA - ROJO
            boton.style.backgroundColor = '#f8d7da';
            boton.style.borderColor = '#dc3545';
            boton.style.border = '3px solid #dc3545';
            boton.style.color = '#721c24';
            boton.style.fontWeight = 'bold';
            console.log(`❌ Botón ${index} coloreado ROJO (incorrecta)`);
        }
        
        if (index === indiceSeleccionado) {
            // BORDE NEGRO PARA LA SELECCIONADA
            boton.style.boxShadow = '0 0 0 3px #000000';
            console.log(`🎯 Botón ${index} con borde negro (seleccionada)`);
        }
    });
    
    console.log('Colores aplicados directamente a los botones existentes');
}

// ===============================================
// UTILIDADES Y FUNCIONES AUXILIARES
// ===============================================
function generarClaveSala() {
    const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let resultado = '';
    for (let i = 0; i < 6; i++) {
        resultado += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
    return resultado;
}

function copiarClaveSala() {
    if (claveActual) {
        navigator.clipboard.writeText(claveActual).then(() => {
            const btn = document.getElementById('copiarClave');
            const textoOriginal = btn.textContent;
            btn.textContent = 'Copiado!';
            setTimeout(() => {
                btn.textContent = textoOriginal;
            }, 2000);
        });
    }
}

function agruparPreguntasPorTemas(preguntas) {
    const temasAgrupados = {};
    
    preguntas.forEach(pregunta => {
        const tema = pregunta.temaNombre;
        
        if (!temasAgrupados[tema]) {
            temasAgrupados[tema] = {
                nombre: tema,
                preguntas: []
            };
        }
        
        temasAgrupados[tema].preguntas.push(pregunta);
    });
    
    return temasAgrupados;
}

// ===============================================
// RESULTADOS Y FINALIZACIÓN
// ===============================================
function mostrarResultado(salaData) {
    interfazJuego.classList.add('hidden');
    pantallaResultado.classList.remove('hidden');
    
    const erroresUsuario = salaData.jugadores[jugadorActual].errores || 0;
    const erroresRival = salaData.jugadores[rival].errores || 0;
    
    const heGanado = erroresRival >= 3;
    const hePerdido = erroresUsuario >= 3;
    
    const textoResultado = document.getElementById('textoResultado');
    const marcadorFinalUsuario = document.getElementById('marcadorFinalUsuario');
    const marcadorFinalRival = document.getElementById('marcadorFinalRival');
    
    marcadorFinalUsuario.textContent = `${erroresUsuario}/3`;
    marcadorFinalRival.textContent = `${erroresRival}/3`;
    
    if (heGanado) {
        pantallaResultado.className = 'pantalla-resultado victoria';
        textoResultado.textContent = 'HAS GANADO!';
    } else if (hePerdido) {
        pantallaResultado.className = 'pantalla-resultado derrota';
        textoResultado.textContent = 'HAS PERDIDO';
    }
}

async function repetirDuelo() {
    try {
        const salaRef = doc(db, 'salas', claveActual);
        await updateDoc(salaRef, {
            turno: 'jugador1',
            'juego.preguntaActual': null,
            'juego.respondiendo': null,
            'juego.respuestaSeleccionada': null,
            'juego.resultadoVisible': false,
            'jugadores.jugador1.errores': 0,
            'jugadores.jugador1.listo': false,
            'jugadores.jugador2.errores': 0,
            'jugadores.jugador2.listo': false
        });
        
        pantallaResultado.classList.add('hidden');
        mostrarSalaEspera();
        
        const btnListo = document.getElementById('btnEstoyListo');
        btnListo.disabled = false;
        btnListo.textContent = 'Estoy Listo';
        
    } catch (error) {
        console.error('Error repitiendo duelo:', error);
    }
}

async function salirDeSala() {
    try {
        if (esAnfitrion) {
            const salaRef = doc(db, 'salas', claveActual);
            await deleteDoc(salaRef);
        } else {
            const salaRef = doc(db, 'salas', claveActual);
            await updateDoc(salaRef, {
                'jugadores.jugador2': null
            });
        }
        
        limpiarSala();
        volverAInicio();
        
    } catch (error) {
        console.error('Error saliendo de sala:', error);
    }
}

function limpiarSala() {
    if (unsubscribeSala) {
        unsubscribeSala();
        unsubscribeSala = null;
    }
    
    salaActual = null;
    claveActual = null;
    esAnfitrion = false;
    jugadorActual = null;
    rival = null;
    preguntasRival = [];
    turnoActual = null;
}

function volverAInicio() {
    salaEspera.classList.add('hidden');
    interfazJuego.classList.add('hidden');
    pantallaResultado.classList.add('hidden');
    cerrarModales();
    
    pantallaInicial.style.display = 'flex';
    
    document.getElementById('nombreAnfitrion').value = '';
    document.getElementById('nombreInvitado').value = '';
    document.getElementById('claveSala').value = '';
    
    limpiarSala();
}

window.addEventListener('beforeunload', function() {
    if (salaActual && claveActual) {
        salirDeSala();
    }
});

console.log('Multijugador.js cargado completamente');
