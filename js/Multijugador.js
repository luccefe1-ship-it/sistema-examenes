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
    onSnapshot,
    addDoc
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
let cronometroRespuesta = null;
let tiempoRespuestaRestante = 0;
let preguntaCargadaParaAmbos = false;
let temasSeleccionados = new Set();
let cronometroDetenidoManualmente = false;  // BANDERA PARA EVITAR REINICIO
let preguntasIncorrectasPartida = [];  // REGISTRO DE PREGUNTAS FALLADAS PARA TEST DE REPASO

// Helper para generar hash de pregunta (consistente con tests.js y tests-pregunta.js)
function generarHashPregunta(texto) {
    const preguntaTexto = texto || '';
    let hash = 0;
    for (let i = 0; i < preguntaTexto.length; i++) {
        const char = preguntaTexto.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return 'q_' + Math.abs(hash).toString(36);
}

// Buscar y mostrar explicación guardada tras responder
async function buscarYMostrarExplicacion(pregunta) {
    const opcionesPregunta = document.getElementById('opcionesPregunta');
    if (!opcionesPregunta) return;
    
    const preguntaHash = generarHashPregunta(pregunta.pregunta);
    const rivalUid = window.rivalUidGlobal;
    
    let explicacionTexto = null;
    let explicacionDe = null; // 'mia' o 'rival'
    
    try {
        // 1. Buscar en mis explicaciones
        const miDocId = `${currentUser.uid}_${preguntaHash}`;
        const miDoc = await getDoc(doc(db, 'explicacionesGemini', miDocId));
        if (miDoc.exists() && miDoc.data().texto) {
            explicacionTexto = miDoc.data().texto;
            explicacionDe = 'mia';
        }
        
        // 2. Si no tengo, buscar en las del rival (dueño de la pregunta)
        if (!explicacionTexto && rivalUid) {
            const rivalDocId = `${rivalUid}_${preguntaHash}`;
            const rivalDoc = await getDoc(doc(db, 'explicacionesGemini', rivalDocId));
            if (rivalDoc.exists() && rivalDoc.data().texto) {
                explicacionTexto = rivalDoc.data().texto;
                explicacionDe = 'rival';
            }
        }
        
        if (!explicacionTexto) return;
        
        // Mostrar explicación
        const explicacionDiv = document.createElement('div');
        explicacionDiv.className = 'explicacion-multijugador';
        explicacionDiv.style.cssText = `
            margin-top: 15px;
            padding: 15px;
            background: linear-gradient(135deg, #ede9fe, #dbeafe);
            border-left: 4px solid #7c3aed;
            border-radius: 8px;
            font-size: 14px;
            color: #1e293b;
            max-height: 200px;
            overflow-y: auto;
        `;
        
        let textoMostrar = explicacionTexto;
        if (!textoMostrar.includes('<')) {
            textoMostrar = textoMostrar.replace(/\n/g, '<br>');
        }
        
        explicacionDiv.innerHTML = `
            <div style="font-weight: 700; margin-bottom: 8px; color: #7c3aed;">
                💡 Explicación IA ${explicacionDe === 'rival' ? '(del rival)' : ''}
            </div>
            <div>${textoMostrar}</div>
        `;
        
        // Insertar ANTES del botón continuar si existe
        const btnContinuar = opcionesPregunta.querySelector('.btn-continuar-respuesta');
        if (btnContinuar) {
            opcionesPregunta.insertBefore(explicacionDiv, btnContinuar);
        } else {
            opcionesPregunta.appendChild(explicacionDiv);
        }
        
        // Si la explicación es del rival y yo no la tengo, ofrecer guardar
        if (explicacionDe === 'rival') {
            // Verificar si tengo una pregunta idéntica en mi banco
            const tengoLaPregunta = misPreguntasVerificadas.some(p => p.pregunta === pregunta.pregunta);
            
            const btnGuardar = document.createElement('button');
            btnGuardar.style.cssText = `
                width: 100%;
                padding: 10px;
                margin-top: 8px;
                background: linear-gradient(135deg, #7c3aed, #2563eb);
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
            `;
            
            if (tengoLaPregunta) {
                btnGuardar.textContent = '💾 Guardar explicación en mi banco';
                btnGuardar.onclick = async () => {
                    try {
                        const miDocId = `${currentUser.uid}_${preguntaHash}`;
                        await setDoc(doc(db, 'explicacionesGemini', miDocId), {
                            usuarioId: currentUser.uid,
                            preguntaId: preguntaHash,
                            preguntaTexto: pregunta.pregunta,
                            texto: explicacionTexto,
                            fecha: new Date()
                        });
                        btnGuardar.textContent = '✅ Explicación guardada';
                        btnGuardar.disabled = true;
                        btnGuardar.style.background = '#10b981';
                    } catch (err) {
                        console.error('Error guardando explicación:', err);
                        alert('Error al guardar la explicación');
                    }
                };
            } else {
                btnGuardar.textContent = '⚠️ No se puede guardar (no tienes esta pregunta en tu banco)';
                btnGuardar.disabled = true;
                btnGuardar.style.background = '#94a3b8';
                btnGuardar.style.cursor = 'not-allowed';
            }
            
            explicacionDiv.appendChild(btnGuardar);
        }
        
    } catch (error) {
        console.error('Error buscando explicación:', error);
    }
}

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
            const nombreTemaPrincipal = tema.nombre;
            
            // Cargar preguntas principales del tema
            if (tema.preguntas && Array.isArray(tema.preguntas)) {
                tema.preguntas.forEach((pregunta, index) => {
                    if (pregunta.verificada === true && 
                        pregunta.texto && 
                        pregunta.opciones && 
                        Array.isArray(pregunta.opciones) && 
                        pregunta.opciones.length === 4) {
                        
                        const respuestaCorrecta = pregunta.opciones.findIndex(op => op.esCorrecta === true);
                        if (respuestaCorrecta !== -1) {
                            misPreguntasVerificadas.push({
                                id: `${temaId}_${index}`,
                                temaId: temaId,
                                temaNombre: nombreTemaPrincipal, // Usar nombre del tema principal
                                temaEpigrafe: tema.descripcion || '',
                                pregunta: pregunta.texto,
                                opciones: pregunta.opciones.map(op => op.texto),
                                respuestaCorrecta: respuestaCorrecta,
                                esSubtema: false
                            });
                        }
                    }
                });
            }
            
            // Cargar preguntas de subtemas PERO asignarlas al tema principal
            if (tema.subtemas && Array.isArray(tema.subtemas)) {
                tema.subtemas.forEach((subtema, subtemaIndex) => {
                    if (subtema.preguntas && Array.isArray(subtema.preguntas)) {
                        subtema.preguntas.forEach((pregunta, preguntaIndex) => {
                            if (pregunta.verificada === true && 
                                pregunta.texto && 
                                pregunta.opciones && 
                                Array.isArray(pregunta.opciones) && 
                                pregunta.opciones.length === 4) {
                                
                                const respuestaCorrecta = pregunta.opciones.findIndex(op => op.esCorrecta === true);
                                if (respuestaCorrecta !== -1) {
                                    misPreguntasVerificadas.push({
                                        id: `${temaId}_subtema${subtemaIndex}_${preguntaIndex}`,
                                        temaId: temaId,
                                        temaNombre: nombreTemaPrincipal, // Usar nombre del tema principal, no del subtema
                                        temaEpigrafe: tema.descripcion || '',
                                        pregunta: pregunta.texto,
                                        opciones: pregunta.opciones.map(op => op.texto),
                                        respuestaCorrecta: respuestaCorrecta,
                                        esSubtema: true,
                                        subtemaOriginal: subtema.nombre // Guardar referencia al subtema original
                                    });
                                }
                            }
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
                    errores: 0,
                    aciertos: 0,
                    preguntasRecibidas: 0,
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
        await mostrarSalaEspera();
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
                errores: 0,
                aciertos: 0,
                preguntasRecibidas: 0,
                listo: false
            }
        });
        
        cerrarModales();
        await mostrarSalaEspera();
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
async function mostrarSalaEspera() {
    pantallaInicial.style.display = 'none';
    salaEspera.classList.remove('hidden');
    
    document.getElementById('claveGenerada').textContent = claveActual;
    await mostrarSelectorTemas();
}

function escucharCambiosSala() {
    if (unsubscribeSala) {
        unsubscribeSala();
    }
    
    const salaRef = doc(db, 'salas', claveActual);
    
    unsubscribeSala = onSnapshot(salaRef, async (doc) => {
    if (!doc.exists()) {
        alert('La sala fue eliminada');
        volverAInicio();
        return;
    }
    
    const salaData = doc.data();
    
    // ACTUALIZAR SALA DE ESPERA SI ESTAMOS EN ESA PANTALLA
    if (!salaEspera.classList.contains('hidden')) {
        actualizarSalaEspera(salaData);
    }
    
    // INICIAR JUEGO SI AMBOS ESTÁN LISTOS
    if (salaData.jugadores.jugador1?.listo && 
        salaData.jugadores.jugador2?.listo && 
        interfazJuego.classList.contains('hidden')) {
        await mostrarInterfazJuego(salaData);
    }
    
    // ACTUALIZAR TURNO SI ESTAMOS EN EL JUEGO
    if (!interfazJuego.classList.contains('hidden')) {
        actualizarTurno(salaData);
        actualizarMarcadores(salaData);
    }
    
        // VERIFICAR FIN DE JUEGO - SOLO CUANDO EL BOTÓN CONTINUAR YA NO EXISTE
    if (salaData.jugadores.jugador1?.errores >= 3 || salaData.jugadores.jugador2?.errores >= 3) {
        // Verificar si el botón continuar aún está presente
        const btnContinuarExiste = document.querySelector('.btn-continuar-respuesta');
        
        // SOLO mostrar resultado si:
        // 1. El juego no está ya en proceso de finalización
        // 2. Estamos en la pantalla de juego
        // 3. NO hay botón continuar visible (ya fue presionado)
        if (!window.finDeJuegoEnProceso && 
            !interfazJuego.classList.contains('hidden') && 
            !btnContinuarExiste) {
            window.finDeJuegoEnProceso = true;
            setTimeout(() => {
                mostrarResultado(salaData);
            }, 500);
        }
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
    const haySegundoJugador = salaData.jugadores.jugador2;
    btnListo.disabled = !haySegundoJugador || temasSeleccionados.size === 0;
}
}

async function marcarListo() {
    try {
        const preguntasSeleccionadas = filtrarPreguntasPorTemasSeleccionados();
        const temasSeleccionadosArray = Array.from(temasSeleccionados);
        
        // Guardar configuración para "repetir configuración anterior"
        try {
            localStorage.setItem(`multiConfig_${currentUser.uid}`, JSON.stringify(temasSeleccionadosArray));
        } catch(e) { console.warn('No se pudo guardar config anterior'); }
        
        const salaRef = doc(db, 'salas', claveActual);
        await updateDoc(salaRef, {
            [`jugadores.${jugadorActual}.listo`]: true,
            [`jugadores.${jugadorActual}.temasSeleccionados`]: temasSeleccionadosArray,
            [`jugadores.${jugadorActual}.preguntasDisponibles`]: preguntasSeleccionadas.length
        });
        
    } catch (error) {
        console.error('Error marcando listo:', error);
    }
}
// ===============================================
// INTERFAZ DEL JUEGO
// ===============================================
async function mostrarInterfazJuego(salaData) {
    salaEspera.classList.add('hidden');
    interfazJuego.classList.remove('hidden');
    
    const jugador1 = salaData.jugadores.jugador1;
    const jugador2 = salaData.jugadores.jugador2;
    
    if (jugadorActual === 'jugador1') {
    rival = 'jugador2';
    document.getElementById('nombreUsuarioActual').textContent = jugador1.nombre;
    document.getElementById('nombreRival').textContent = jugador2.nombre;
    // Cargar solo los temas que el rival seleccionó
    const temasRival = salaData.jugadores.jugador2.temasSeleccionados || null;
    window.rivalUidGlobal = jugador2.uid; // Guardar UID del rival globalmente
    cargarPreguntasRival(jugador2.uid, temasRival);
} else {
    rival = 'jugador1';
    document.getElementById('nombreUsuarioActual').textContent = jugador2.nombre;
    document.getElementById('nombreRival').textContent = jugador1.nombre;
    // Cargar solo los temas que el rival seleccionó
    const temasRival = salaData.jugadores.jugador1.temasSeleccionados || null;
    window.rivalUidGlobal = jugador1.uid; // Guardar UID del rival globalmente
    cargarPreguntasRival(jugador1.uid, temasRival);
}
    
    actualizarMarcadores(salaData);
    mostrarTemasUsuario();
    actualizarTurno(salaData);
}

function actualizarMarcadores(salaData) {
    const jugador1 = salaData.jugadores.jugador1;
    const jugador2 = salaData.jugadores.jugador2;
    
    if (jugadorActual === 'jugador1') {
        document.getElementById('marcadorUsuario').textContent = `❌ ${jugador1.errores || 0}/3 | ✅ ${jugador1.aciertos || 0}/${jugador1.preguntasRecibidas || 0}`;
        document.getElementById('marcadorRival').textContent = `❌ ${jugador2.errores || 0}/3 | ✅ ${jugador2.aciertos || 0}/${jugador2.preguntasRecibidas || 0}`;
    } else {
        document.getElementById('marcadorUsuario').textContent = `❌ ${jugador2.errores || 0}/3 | ✅ ${jugador2.aciertos || 0}/${jugador2.preguntasRecibidas || 0}`;
        document.getElementById('marcadorRival').textContent = `❌ ${jugador1.errores || 0}/3 | ✅ ${jugador1.aciertos || 0}/${jugador1.preguntasRecibidas || 0}`;
    }
}

function mostrarTemasUsuario() {
    const container = document.getElementById('temasUsuario');
    
    // Filtrar solo las preguntas de los temas que YO seleccioné
    const misPreguntasFiltradas = filtrarPreguntasPorTemasSeleccionados();
    const temasAgrupados = agruparPreguntasPorTemas(misPreguntasFiltradas);
    
    container.innerHTML = '';
    
    Object.values(temasAgrupados).forEach(tema => {
        const temaElement = crearElementoTema(tema, false);
        container.appendChild(temaElement);
    });
}

async function mostrarTemasRival() {
    const container = document.getElementById('temasRival');
    
    console.log('=== DEBUG MOSTRAR TEMAS RIVAL ===');
    console.log('rivalUidGlobal:', window.rivalUidGlobal);
    console.log('preguntasRival length:', preguntasRival.length);
    console.log('jugadorActual:', jugadorActual);
    console.log('rival:', rival);
    
    try {
        // Usar directamente el UID global del rival que se estableció en mostrarInterfazJuego
        const rivalUid = window.rivalUidGlobal;
        
        if (!rivalUid) {
            console.log('❌ No hay rivalUid - usando fallback');
            // Fallback al método anterior si no hay UID del rival
            const temasAgrupados = agruparPreguntasPorTemas(preguntasRival);
            container.innerHTML = '';
            Object.values(temasAgrupados).forEach(tema => {
                const temaElement = crearElementoTema(tema, true);
                container.appendChild(temaElement);
            });
            return;
        }
        
        console.log('✅ Usando rivalUid:', rivalUid);
        
        // TEMPORAL: Usar método simple primero
        console.log('🔄 Usando método simple para debug...');
        const temasAgrupados = agruparPreguntasPorTemas(preguntasRival);
        container.innerHTML = '';
        
        console.log('Temas agrupados:', Object.keys(temasAgrupados));
        
        Object.values(temasAgrupados).forEach(tema => {
            console.log('Creando tema:', tema.nombre, 'con', tema.preguntas.length, 'preguntas');
            const temaElement = crearElementoTema(tema, true);
            container.appendChild(temaElement);
        });
        
        console.log('✅ Temas rival mostrados correctamente');
        
    } catch (error) {
        console.error('❌ Error mostrando temas rival:', error);
        // Fallback al método anterior
        const temasAgrupados = agruparPreguntasPorTemas(preguntasRival);
        container.innerHTML = '';
        Object.values(temasAgrupados).forEach(tema => {
            const temaElement = crearElementoTema(tema, true);
            container.appendChild(temaElement);
        });
    }
}

function crearElementoTema(tema, esClickeable) {
    console.log('Creando elemento tema:', tema.nombre, 'clickeable:', esClickeable, 'preguntas:', tema.preguntas.length);
    
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

function crearElementoTemaEstructurado(tema, tieneSubtemas, subtemas, esClickeable) {
    const temaDiv = document.createElement('div');
    temaDiv.className = 'tema-container-estructurado';
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'tema-header';
    headerDiv.innerHTML = `
        📚 ${tema.nombre} (${tema.preguntas.length} preguntas)
        ${tieneSubtemas ? '<span class="toggle-icon">📁</span>' : ''}
    `;
    
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
            
            const toggleIcon = headerDiv.querySelector('.toggle-icon');
            if (toggleIcon) {
                toggleIcon.textContent = isExpanded ? '📁' : '📂';
            }
        });
    }
    
    // Agregar preguntas del tema principal
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
    
    // Agregar subtemas si los tiene
    if (tieneSubtemas) {
        subtemas.forEach(subtema => {
            if (subtema.preguntas.length > 0) {
                const subtemaDiv = document.createElement('div');
                subtemaDiv.className = 'subtema-container';
                subtemaDiv.innerHTML = `<div class="subtema-header">↳ ${subtema.nombre} (${subtema.preguntas.length} preguntas)</div>`;
                
                const subtemaContent = document.createElement('div');
                subtemaContent.className = 'subtema-content';
                
                subtema.preguntas.forEach(pregunta => {
                    const preguntaDiv = document.createElement('div');
                    preguntaDiv.className = 'pregunta-item subtema-pregunta';
                    preguntaDiv.textContent = pregunta.pregunta;
                    
                    if (esClickeable) {
                        preguntaDiv.addEventListener('click', () => {
                            if (turnoActual === jugadorActual) {
                                seleccionarPregunta(pregunta);
                            }
                        });
                    }
                    
                    subtemaContent.appendChild(preguntaDiv);
                });
                
                subtemaDiv.appendChild(subtemaContent);
                containerDiv.appendChild(subtemaDiv);
            }
        });
    }
    
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
    
    console.log('🎮 actualizarTurno:', {
        turno: turnoActual,
        jugador: jugadorActual,
        esMiTurno,
        hayPregunta: !!salaData.juego?.preguntaActual
    });
    
    if (salaData.juego?.preguntaActual) {
        if (salaData.juego.respondiendo === jugadorActual) {
            textoTurno.textContent = 'TE TOCA RESPONDER';
            
            // SI HAY RESULTADO VISIBLE, NO REINICIAR CRONÓMETRO
            if (salaData.juego?.resultadoVisible && salaData.juego?.respuestaSeleccionada !== undefined) {
                cronometroDetenidoManualmente = true;
                mostrarPreguntaParaResponder(salaData.juego.preguntaActual);
                console.log('Aplicando colores porque hay resultado visible');
                mostrarResultadoRespuesta(salaData.juego.respuestaSeleccionada, salaData.juego.preguntaActual.respuestaCorrecta);
                detenerCronometroRespuesta();
                
                const btnContinuarExistente = document.querySelector('.btn-continuar-respuesta');
                if (!btnContinuarExistente) {
                    mostrarBotonContinuar();
                }
            } else {
                // NO HAY RESULTADO - INICIAR NORMALMENTE
                cronometroDetenidoManualmente = false;
                mostrarPreguntaParaResponder(salaData.juego.preguntaActual);
            }
        } else {
            textoTurno.textContent = 'ESPERANDO RESPUESTA DEL RIVAL';
            mostrarPreguntaEsperando(salaData.juego.preguntaActual, salaData);
        }
    } else {
        // NO HAY PREGUNTA - LIMPIAR Y MOSTRAR TURNO
        console.log('🧹 No hay pregunta - limpiando ventana');
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
    
    // ELIMINAR BOTÓN CONTINUAR SI EXISTE
    const btnContinuar = document.querySelector('.btn-continuar-respuesta');
    if (btnContinuar) {
        btnContinuar.remove();
        console.log('🗑️ Botón continuar eliminado');
    }
    
    cronometroDetenidoManualmente = false;  // RESETEAR BANDERA
    detenerCronometroRespuesta();
    console.log('🧹 Ventana central limpiada - bandera reseteada');
}

async function seleccionarPregunta(pregunta) {
    if (turnoActual !== jugadorActual) {
        alert('No es tu turno para preguntar');
        return;
    }
    
    try {
        cronometroDetenidoManualmente = false;  // RESETEAR BANDERA PARA NUEVA PREGUNTA
        
        const salaRef = doc(db, 'salas', claveActual);
        await updateDoc(salaRef, {
            'juego.preguntaActual': pregunta,
            'juego.respondiendo': rival,
            'juego.tiempoInicioPregunta': Date.now()
        });
        
    } catch (error) {
        console.error('Error seleccionando pregunta:', error);
    }
}

// ===============================================
// SISTEMA DE RESPUESTAS COMPLETAMENTE NUEVO
// ===============================================
async function mostrarPreguntaParaResponder(pregunta) {
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
    
    // SIEMPRE INICIAR CRONÓMETRO AL CARGAR PREGUNTA PARA RESPONDER
setTimeout(() => {
    iniciarCronometroRespuesta();
    console.log('⏱️ Cronómetro iniciado para el que responde');
}, 100);
}

function mostrarPreguntaEsperando(pregunta, salaData) {
    const textoPregunta = document.getElementById('textoPregunta');
    const opcionesPregunta = document.getElementById('opcionesPregunta');
    
    textoPregunta.textContent = pregunta.pregunta;
    opcionesPregunta.innerHTML = '';
    
    // DETENER CRONÓMETRO SI HAY RESULTADO VISIBLE
if (salaData.juego?.resultadoVisible || salaData.juego?.cronometroDetenido) {
    detenerCronometroRespuesta();
    console.log('⏸️ Cronómetro detenido para el que pregunta (rival ya respondió)');
} else {
    // MOSTRAR CRONÓMETRO PARA EL QUE PREGUNTA TAMBIÉN
    setTimeout(() => {
        iniciarCronometroRespuesta();
    }, 100);
    console.log('⏱️ Cronómetro iniciado para el que pregunta');
}
    
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
        
        // Mostrar explicación también para el que pregunta
        if (!esCorrecta) {
            buscarYMostrarExplicacion(pregunta);
        }
    }
}

async function responderPregunta(indiceSeleccionado, pregunta) {
    try {
        // DETENER CRONÓMETRO INMEDIATAMENTE AL RESPONDER
        detenerCronometroRespuesta();
        console.log('Respuesta seleccionada:', indiceSeleccionado);
        console.log('⏸️ Cronómetro detenido');
        
        const esCorrecta = indiceSeleccionado === pregunta.respuestaCorrecta;
        console.log('Es correcta:', esCorrecta);
        
        // MOSTRAR RESULTADO INMEDIATAMENTE CON NUEVO SISTEMA
        mostrarResultadoRespuesta(indiceSeleccionado, pregunta.respuestaCorrecta);
        
        const salaRef = doc(db, 'salas', claveActual);
        const snapshot = await getDoc(salaRef);
        const salaData = snapshot.data();
        
        const preguntasRecibidasActuales = salaData.jugadores[jugadorActual].preguntasRecibidas || 0;
        const aciertosActuales = salaData.jugadores[jugadorActual].aciertos || 0;
        
        if (!esCorrecta) {
            const erroresActuales = salaData.jugadores[jugadorActual].errores || 0;
            const nuevosErrores = erroresActuales + 1;
            
            // REGISTRAR PREGUNTA INCORRECTA PARA TEST DE REPASO
            preguntasIncorrectasPartida.push({
                texto: pregunta.pregunta,
                opciones: pregunta.opciones.map((texto, idx) => ({
                    letra: ['A', 'B', 'C', 'D'][idx],
                    texto: texto,
                    esCorrecta: idx === pregunta.respuestaCorrecta
                })),
                respuestaCorrecta: ['A', 'B', 'C', 'D'][pregunta.respuestaCorrecta],
                respuestaUsuario: ['A', 'B', 'C', 'D'][indiceSeleccionado],
                temaId: pregunta.temaId || '',
                temaNombre: pregunta.temaNombre || '',
                temaEpigrafe: pregunta.temaEpigrafe || ''
            });
            
            await updateDoc(salaRef, {
                [`jugadores.${jugadorActual}.errores`]: nuevosErrores,
                [`jugadores.${jugadorActual}.preguntasRecibidas`]: preguntasRecibidasActuales + 1,
                'juego.respuestaSeleccionada': indiceSeleccionado,
                'juego.resultadoVisible': true,
                'juego.cronometroDetenido': true
            });
        } else {
            await updateDoc(salaRef, {
                [`jugadores.${jugadorActual}.aciertos`]: aciertosActuales + 1,
                [`jugadores.${jugadorActual}.preguntasRecibidas`]: preguntasRecibidasActuales + 1,
                'juego.respuestaSeleccionada': indiceSeleccionado,
                'juego.resultadoVisible': true,
                'juego.cronometroDetenido': true
            });
        }
        
        // SIEMPRE MOSTRAR BOTÓN CONTINUAR (incluso con 3 errores)
        mostrarBotonContinuar();
        
        // Buscar y mostrar explicación si existe
        buscarYMostrarExplicacion(pregunta);
        
    } catch (error) {
        console.error('Error respondiendo pregunta:', error);
    }
}

function mostrarResultadoRespuesta(indiceSeleccionado, indiceCorrecta) {
    console.log('Aplicando colores directo en ventana central');
    
    // DETENER CRONÓMETRO INMEDIATAMENTE
    detenerCronometroRespuesta();
    console.log('⏸️ Cronómetro detenido en mostrarResultadoRespuesta');
    
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
function mostrarBotonContinuar() {
    const opcionesPregunta = document.getElementById('opcionesPregunta');
    
    const btnExistente = document.querySelector('.btn-continuar-respuesta');
    if (btnExistente) {
        console.log('⚠️ Botón continuar ya existe');
        return;
    }
    
    const btnContinuar = document.createElement('button');
    btnContinuar.textContent = '✅ Continuar';
    btnContinuar.className = 'btn-continuar-respuesta';
    btnContinuar.style.cssText = `
        width: 100%;
        padding: 15px;
        margin-top: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 18px;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.3s ease;
    `;
    
    btnContinuar.onmouseover = () => {
        btnContinuar.style.transform = 'scale(1.05)';
        btnContinuar.style.boxShadow = '0 8px 20px rgba(102, 126, 234, 0.4)';
    };
    
    btnContinuar.onmouseout = () => {
        btnContinuar.style.transform = 'scale(1)';
        btnContinuar.style.boxShadow = 'none';
    };
    
    btnContinuar.onclick = async () => {
        try {
            console.log('🔘 Botón continuar presionado');
            
            const salaRef = doc(db, 'salas', claveActual);
            const snapshot = await getDoc(salaRef);
            const salaData = snapshot.data();
            
            // VERIFICAR SI HAY FIN DE JUEGO
            const hayFinDeJuego = salaData.jugadores.jugador1?.errores >= 3 || salaData.jugadores.jugador2?.errores >= 3;
            
            if (hayFinDeJuego) {
                console.log('🏁 Fin de juego detectado - mostrando resultado INMEDIATAMENTE');
                btnContinuar.remove();
                mostrarResultado(salaData);
                return;
            }
            
            // NO HAY FIN DE JUEGO - CONTINUAR NORMALMENTE
            console.log('✅ No hay fin de juego - continuando partida');
            btnContinuar.remove();
            cronometroDetenidoManualmente = false;
            
            await updateDoc(salaRef, {
                'juego.preguntaActual': null,
                'juego.respondiendo': null,
                'juego.respuestaSeleccionada': null,
                'juego.resultadoVisible': false,
                'juego.tiempoInicioPregunta': null,
                'juego.cronometroDetenido': false,
                turno: jugadorActual
            });
        } catch (error) {
            console.error('❌ Error al continuar:', error);
        }
    };
    
    opcionesPregunta.appendChild(btnContinuar);
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
    const temasOrdenados = new Map(); // Para mantener orden de inserción
    
    preguntas.forEach(pregunta => {
        let claveTema = pregunta.temaNombre;
        
        // Si es subtema, añadir prefijo para diferenciarlo
        if (pregunta.esSubtema) {
            claveTema = `📁 ${pregunta.temaNombre}`;
        }
        
        if (!temasOrdenados.has(claveTema)) {
            temasOrdenados.set(claveTema, {
                nombre: claveTema,
                preguntas: [],
                esSubtema: pregunta.esSubtema
            });
        }
        
        temasOrdenados.get(claveTema).preguntas.push(pregunta);
    });
    
    // Convertir Map a objeto manteniendo orden
    temasOrdenados.forEach((valor, clave) => {
        temasAgrupados[clave] = valor;
    });
    
    return temasAgrupados;
}

// ===============================================
// RESULTADOS Y FINALIZACIÓN
// ===============================================
async function mostrarResultado(salaData) {
    interfazJuego.classList.add('hidden');
    pantallaResultado.classList.remove('hidden');
    
    const erroresUsuario = salaData.jugadores[jugadorActual].errores || 0;
    const erroresRival = salaData.jugadores[rival].errores || 0;
    const aciertosUsuario = salaData.jugadores[jugadorActual].aciertos || 0;
    const aciertosRival = salaData.jugadores[rival].aciertos || 0;
    const preguntasUsuario = salaData.jugadores[jugadorActual].preguntasRecibidas || 0;
    const preguntasRival = salaData.jugadores[rival].preguntasRecibidas || 0;
    
    const heGanado = erroresRival >= 3;
    const hePerdido = erroresUsuario >= 3;
    
    const textoResultado = document.getElementById('textoResultado');
    const marcadorFinalUsuario = document.getElementById('marcadorFinalUsuario');
    const marcadorFinalRival = document.getElementById('marcadorFinalRival');
    
    marcadorFinalUsuario.textContent = `❌ ${erroresUsuario}/3 | ✅ ${aciertosUsuario}/${preguntasUsuario}`;
    marcadorFinalRival.textContent = `❌ ${erroresRival}/3 | ✅ ${aciertosRival}/${preguntasRival}`;
    
    if (heGanado) {
        pantallaResultado.className = 'pantalla-resultado victoria';
        textoResultado.textContent = 'HAS GANADO!';
    } else if (hePerdido) {
        pantallaResultado.className = 'pantalla-resultado derrota';
        textoResultado.textContent = 'HAS PERDIDO';
    }
    
    // GUARDAR PREGUNTAS FALLADAS EN TEST DE REPASO
    if (preguntasIncorrectasPartida.length > 0) {
        try {
            const promesasGuardado = preguntasIncorrectasPartida.map(async (preguntaFallada) => {
                const datosPregunta = {
                    usuarioId: currentUser.uid,
                    pregunta: {
                        texto: preguntaFallada.texto,
                        opciones: preguntaFallada.opciones,
                        respuestaCorrecta: preguntaFallada.respuestaCorrecta,
                        temaId: preguntaFallada.temaId,
                        temaNombre: preguntaFallada.temaNombre,
                        temaEpigrafe: preguntaFallada.temaEpigrafe
                    },
                    respuestaUsuario: preguntaFallada.respuestaUsuario,
                    estado: 'incorrecta',
                    fechaFallo: new Date(),
                    testId: `multijugador_${Date.now()}`,
                    testNombre: 'Multijugador'
                };
                return addDoc(collection(db, "preguntasFalladas"), datosPregunta);
            });
            
            await Promise.all(promesasGuardado);
            console.log(`${preguntasIncorrectasPartida.length} preguntas falladas guardadas desde multijugador`);
        } catch (error) {
            console.error('Error guardando preguntas falladas de multijugador:', error);
        }
    }
}

async function repetirDuelo() {
    try {
        // RESETEAR flags críticas
        window.finDeJuegoEnProceso = false;
        preguntasIncorrectasPartida = [];
        cronometroDetenidoManualmente = false;
        detenerCronometroRespuesta();
        
        const salaRef = doc(db, 'salas', claveActual);
        await updateDoc(salaRef, {
            turno: 'jugador1',
            'juego.preguntaActual': null,
            'juego.respondiendo': null,
            'juego.respuestaSeleccionada': null,
            'juego.resultadoVisible': false,
            'juego.tiempoInicioPregunta': null,
            'juego.cronometroDetenido': false,
            'jugadores.jugador1.errores': 0,
            'jugadores.jugador1.aciertos': 0,
            'jugadores.jugador1.preguntasRecibidas': 0,
            'jugadores.jugador1.listo': false,
            'jugadores.jugador2.errores': 0,
            'jugadores.jugador2.aciertos': 0,
            'jugadores.jugador2.preguntasRecibidas': 0,
            'jugadores.jugador2.listo': false
        });
        
        // Resetear clase de resultado (victoria/derrota) 
        pantallaResultado.className = 'pantalla-resultado hidden';
        
        await mostrarSalaEspera();
        
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
    preguntasIncorrectasPartida = [];  // LIMPIAR REGISTRO DE PREGUNTAS FALLADAS
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
// Funciones para el selector de temas con estructura de carpetas
function configurarEventListenersSelector() {
    // Event listeners para checkboxes principales
    document.querySelectorAll('.tema-checkbox-principal').forEach(checkbox => {
        checkbox.addEventListener('change', manejarCambioTemaPrincipal);
    });
    
    // Event listeners para checkboxes de subtemas
    document.querySelectorAll('.tema-checkbox-subtema').forEach(checkbox => {
        checkbox.addEventListener('change', manejarCambioSubtema);
    });
}

function manejarCambioTemaPrincipal(event) {
    const checkbox = event.target;
    const temaNombre = checkbox.dataset.tema;
    const temaId = checkbox.id.replace('tema-', '');
    
    // Actualizar selección del tema principal
    if (checkbox.checked) {
        temasSeleccionados.add(temaNombre);
    } else {
        temasSeleccionados.delete(temaNombre);
    }
    
    // Sincronizar subtemas con el tema principal
    const subtemas = document.querySelectorAll(`#subtemas-${temaId} .tema-checkbox-subtema`);
    subtemas.forEach(subtemaCheckbox => {
        subtemaCheckbox.checked = checkbox.checked;
        const subtemaNombre = subtemaCheckbox.dataset.tema;
        
        if (checkbox.checked) {
            temasSeleccionados.add(subtemaNombre);
        } else {
            temasSeleccionados.delete(subtemaNombre);
        }
    });
    
    actualizarTemasSeleccionados();
}

function manejarCambioSubtema(event) {
    const checkbox = event.target;
    const subtemaNombre = checkbox.dataset.tema;
    
    // Actualizar selección del subtema
    if (checkbox.checked) {
        temasSeleccionados.add(subtemaNombre);
    } else {
        temasSeleccionados.delete(subtemaNombre);
    }
    
    actualizarTemasSeleccionados();
}

window.toggleSubtemasSelector = function(temaId) {
    const container = document.getElementById(`subtemas-${temaId}`);
    const arrow = document.getElementById(`arrow-${temaId}`);
    
    if (!container || !arrow) return;
    
    if (container.style.display === 'none') {
        container.style.display = 'block';
        arrow.textContent = '📂';
    } else {
        container.style.display = 'none';
        arrow.textContent = '📁';
    }
};
function actualizarTemasSeleccionados() {
    actualizarContadorTemas();
    
    const btnListo = document.getElementById('btnEstoyListo');
    const haySegundoJugador = document.getElementById('nombreJugador2').textContent !== '';
    
    btnListo.disabled = temasSeleccionados.size === 0 || !haySegundoJugador;
}

function actualizarContadorTemas() {
    const contador = document.getElementById('temasSeleccionadosCount');
    if (contador) {
        contador.textContent = `${temasSeleccionados.size} temas seleccionados`;
    }
}

function filtrarPreguntasPorTemasSeleccionados() {
    return misPreguntasVerificadas.filter(pregunta => 
        temasSeleccionados.has(pregunta.temaNombre)
    );
}

console.log('Multijugador.js cargado completamente');

async function iniciarCronometroRespuesta() {
    // SI FUE DETENIDO MANUALMENTE, NO REINICIAR
    if (cronometroDetenidoManualmente) {
        console.log('⛔ Cronómetro no se reinicia porque fue detenido manualmente');
        return;
    }
    
    const cronometroElement = document.getElementById('cronometroRespuesta');
    const tiempoElement = document.getElementById('tiempoRespuesta');
    
    if (!cronometroElement || !tiempoElement) return;
    
    // Detener cronómetro anterior si existe
    if (cronometroRespuesta) {
        clearInterval(cronometroRespuesta);
    }
    
   // MOSTRAR EL CRONÓMETRO AL INICIAR - FORZAR VISIBILIDAD COMPLETA
cronometroElement.style.display = 'block';
cronometroElement.style.visibility = 'visible';
cronometroElement.style.opacity = '1';
cronometroElement.classList.remove('hidden');
console.log('⏱️ Cronómetro mostrado - display:', cronometroElement.style.display);
    
    // SINCRONIZAR CON EL SERVIDOR
    try {
        const salaRef = doc(db, 'salas', claveActual);
        const snapshot = await getDoc(salaRef);
        const salaData = snapshot.data();
        
        const tiempoInicio = salaData.juego?.tiempoInicioPregunta || Date.now();
        const tiempoTranscurrido = Math.floor((Date.now() - tiempoInicio) / 1000);
        tiempoRespuestaRestante = Math.max(0, 60 - tiempoTranscurrido);
        
        console.log(`Cronómetro sincronizado: ${tiempoRespuestaRestante}s restantes`);
    } catch (error) {
        console.error('Error sincronizando cronómetro:', error);
        tiempoRespuestaRestante = 60;
    }
    
    cronometroElement.classList.remove('hidden', 'warning', 'danger');
    
    cronometroRespuesta = setInterval(() => {
        tiempoRespuestaRestante--;
        
        const minutos = Math.floor(tiempoRespuestaRestante / 60);
        const segundos = tiempoRespuestaRestante % 60;
        const display = `${minutos}:${segundos.toString().padStart(2, '0')}`;
        
        tiempoElement.textContent = display;
        
        if (tiempoRespuestaRestante <= 10) {
            cronometroElement.className = 'cronometro-respuesta danger';
        } else if (tiempoRespuestaRestante <= 20) {
            cronometroElement.className = 'cronometro-respuesta warning';
        } else {
            cronometroElement.className = 'cronometro-respuesta';
        }
        
        if (tiempoRespuestaRestante <= 0) {
            detenerCronometroRespuesta();
            tiempoAgotado();
        }
    }, 1000);
}

function detenerCronometroRespuesta() {
    if (cronometroRespuesta) {
        clearInterval(cronometroRespuesta);
        cronometroRespuesta = null;
    }
    
    cronometroDetenidoManualmente = true;  // MARCAR BANDERA
    
    const cronometroElement = document.getElementById('cronometroRespuesta');
if (cronometroElement) {
    cronometroElement.classList.add('hidden');
    cronometroElement.style.display = 'none';
    cronometroElement.style.visibility = 'hidden';
    cronometroElement.style.opacity = '0';
    console.log('⏸️ Cronómetro ocultado completamente');
}
    
    console.log('⏸️ Cronómetro completamente detenido y oculto');
}

async function tiempoAgotado() {
    try {
        const salaRef = doc(db, 'salas', claveActual);
        const snapshot = await getDoc(salaRef);
        const salaData = snapshot.data();
        
        const erroresActuales = salaData.jugadores[jugadorActual].errores || 0;
        const nuevosErrores = erroresActuales + 1;
        
        await updateDoc(salaRef, {
            [`jugadores.${jugadorActual}.errores`]: nuevosErrores,
            'juego.respuestaSeleccionada': -1,
            'juego.resultadoVisible': true
        });
        
        mostrarMensajeTiempoAgotado();
        
        if (nuevosErrores < 3) {
            mostrarBotonContinuar();
        }
        
    } catch (error) {
        console.error('Error manejando tiempo agotado:', error);
    }
}

function mostrarMensajeTiempoAgotado() {
    const opcionesPregunta = document.getElementById('opcionesPregunta');
    if (opcionesPregunta) {
        const botones = opcionesPregunta.querySelectorAll('.opcion-btn');
        botones.forEach(boton => {
            boton.disabled = true;
            boton.style.backgroundColor = '#f8f9fa';
            boton.style.color = '#6c757d';
        });
        
        const mensajeDiv = document.createElement('div');
        mensajeDiv.style.cssText = `
            background: #dc3545;
            color: white;
            padding: 1rem;
            border-radius: 8px;
            text-align: center;
            font-weight: bold;
            margin-top: 1rem;
        `;
        mensajeDiv.textContent = '⏰ TIEMPO AGOTADO - Se cuenta como respuesta incorrecta';
        opcionesPregunta.appendChild(mensajeDiv);
    }
}
async function cargarPreguntasRival(rivalUid, temasPermitidos = null) {
    try {
        const q = query(collection(db, "temas"), where("usuarioId", "==", rivalUid));
        const querySnapshot = await getDocs(q);
        
        preguntasRival = [];
        
        querySnapshot.forEach((doc) => {
            const tema = doc.data();
            const temaId = doc.id;
            const nombreTemaPrincipal = tema.nombre; // USAR EL NOMBRE DEL TEMA PRINCIPAL
            
            // Cargar preguntas principales del tema
            if (tema.preguntas && Array.isArray(tema.preguntas)) {
                tema.preguntas.forEach((pregunta, index) => {
                    if (pregunta.verificada === true && 
                        pregunta.texto && 
                        pregunta.opciones && 
                        Array.isArray(pregunta.opciones) && 
                        pregunta.opciones.length === 4) {
                        
                        const opcionesValidas = pregunta.opciones.every(op => 
                            op && op.texto && typeof op.texto === 'string'
                        );
                        
                        const tieneRespuestaCorrecta = pregunta.opciones.some(op => op.esCorrecta === true);
                        
                        if (opcionesValidas && tieneRespuestaCorrecta) {
                            const respuestaCorrecta = pregunta.opciones.findIndex(op => op.esCorrecta === true);
                            
                            // Solo añadir si el TEMA PRINCIPAL está en la lista permitida
                            if (!temasPermitidos || temasPermitidos.includes(nombreTemaPrincipal)) {
                                preguntasRival.push({
                                    id: `${temaId}_${index}`,
                                    temaId: temaId,
                                    temaNombre: nombreTemaPrincipal, // NOMBRE DEL TEMA PRINCIPAL
                                    temaEpigrafe: tema.descripcion || '',
                                    pregunta: pregunta.texto,
                                    opciones: pregunta.opciones.map(op => op.texto),
                                    respuestaCorrecta: respuestaCorrecta,
                                    esSubtema: false
                                });
                            }
                        }
                    }
                });
            }
            
            // Cargar preguntas de subtemas PERO ASIGNARLAS AL TEMA PRINCIPAL
            if (tema.subtemas && Array.isArray(tema.subtemas)) {
                tema.subtemas.forEach((subtema, subtemaIndex) => {
                    if (subtema.preguntas && Array.isArray(subtema.preguntas)) {
                        subtema.preguntas.forEach((pregunta, preguntaIndex) => {
                            if (pregunta.verificada === true && 
                                pregunta.texto && 
                                pregunta.opciones && 
                                Array.isArray(pregunta.opciones) && 
                                pregunta.opciones.length === 4) {
                                
                                const opcionesValidas = pregunta.opciones.every(op => 
                                    op && op.texto && typeof op.texto === 'string'
                                );
                                
                                const tieneRespuestaCorrecta = pregunta.opciones.some(op => op.esCorrecta === true);
                                
                                if (opcionesValidas && tieneRespuestaCorrecta) {
                                    const respuestaCorrecta = pregunta.opciones.findIndex(op => op.esCorrecta === true);
                                    
                                    // Solo añadir si el TEMA PRINCIPAL está en la lista permitida
                                    if (!temasPermitidos || temasPermitidos.includes(nombreTemaPrincipal)) {
                                        preguntasRival.push({
                                            id: `${temaId}_subtema${subtemaIndex}_${preguntaIndex}`,
                                            temaId: temaId,
                                            temaNombre: nombreTemaPrincipal, // NOMBRE DEL TEMA PRINCIPAL, NO DEL SUBTEMA
                                            temaEpigrafe: tema.descripcion || '',
                                            pregunta: pregunta.texto,
                                            opciones: pregunta.opciones.map(op => op.texto),
                                            respuestaCorrecta: respuestaCorrecta,
                                            esSubtema: true,
                                            subtemaOriginal: subtema.nombre
                                        });
                                    }
                                }
                            }
                        });
                    }
                });
            }
        });
        
        await mostrarTemasRival();
        
    } catch (error) {
        console.error('Error cargando preguntas del rival:', error);
    }
}


async function mostrarSelectorTemas() {
    const container = document.getElementById('temasDisponibles');
    
    try {
        // Cargar temas desde Firebase igual que en el banco
        const q = query(collection(db, "temas"), where("usuarioId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        
        // Separar temas principales y subtemas
        const temasPrincipales = [];
        const subtemasPorPadre = {};

        querySnapshot.forEach((doc) => {
            const tema = doc.data();
            const temaId = doc.id;
            
            // Contar preguntas verificadas de este tema
            const preguntasVerificadas = tema.preguntas ? 
                tema.preguntas.filter(p => p.verificada === true).length : 0;
            
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

        // Sumar preguntas de subtemas a los temas principales
        temasPrincipales.forEach(tema => {
            if (subtemasPorPadre[tema.id]) {
                const preguntasSubtemas = subtemasPorPadre[tema.id].reduce((total, subtema) => {
                    return total + subtema.preguntasVerificadas;
                }, 0);
                tema.preguntasVerificadas += preguntasSubtemas;
            }
        });

        // Ordenar temas con ordenamiento numérico inteligente
        temasPrincipales.sort((a, b) => {
            const nombreA = a.nombre;
            const nombreB = b.nombre;
            
            const numeroA = nombreA.match(/\d+/);
            const numeroB = nombreB.match(/\d+/);
            
            if (numeroA && numeroB) {
                return parseInt(numeroA[0]) - parseInt(numeroB[0]);
            } else {
                return nombreA.localeCompare(nombreB);
            }
        });

        container.innerHTML = '';
        container.className = 'temas-estructura-banco';
        
        // AGREGAR BOTÓN MARCAR TODAS AL INICIO
        const btnMarcarTodas = document.createElement('button');
        btnMarcarTodas.id = 'btnMarcarTodasTemas';
        btnMarcarTodas.textContent = '✅ Marcar Todas';
        btnMarcarTodas.style.cssText = `
            width: 100%;
            padding: 12px;
            margin-bottom: 15px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s ease;
        `;
        btnMarcarTodas.onmouseover = () => {
            btnMarcarTodas.style.transform = 'scale(1.02)';
            btnMarcarTodas.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4)';
        };
        btnMarcarTodas.onmouseout = () => {
            btnMarcarTodas.style.transform = 'scale(1)';
            btnMarcarTodas.style.boxShadow = 'none';
        };
        btnMarcarTodas.onclick = marcarTodasLosTemas;
        container.appendChild(btnMarcarTodas);
        
        // BOTÓN CONFIGURACIÓN ANTERIOR
        try {
            const configAnterior = localStorage.getItem(`multiConfig_${currentUser.uid}`);
            if (configAnterior) {
                const btnConfigAnterior = document.createElement('button');
                btnConfigAnterior.id = 'btnConfigAnterior';
                btnConfigAnterior.textContent = '🔄 Repetir selección anterior';
                btnConfigAnterior.style.cssText = `
                    width: 100%;
                    padding: 12px;
                    margin-bottom: 15px;
                    background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-size: 15px;
                    font-weight: bold;
                    cursor: pointer;
                    transition: all 0.3s ease;
                `;
                btnConfigAnterior.onclick = () => {
                    const temasAnteriores = JSON.parse(configAnterior);
                    temasSeleccionados.clear();
                    
                    // Desmarcar todos primero
                    document.querySelectorAll('.tema-checkbox-principal, .tema-checkbox-subtema').forEach(cb => {
                        cb.checked = false;
                    });
                    
                    // Marcar los que estaban seleccionados
                    let encontrados = 0;
                    document.querySelectorAll('.tema-checkbox-principal, .tema-checkbox-subtema').forEach(cb => {
                        if (temasAnteriores.includes(cb.dataset.tema)) {
                            cb.checked = true;
                            temasSeleccionados.add(cb.dataset.tema);
                            encontrados++;
                        }
                    });
                    
                    if (encontrados === 0) {
                        alert('No se encontraron los temas de la configuración anterior');
                    } else {
                        // Abrir subtemas que tengan checkboxes marcados
                        document.querySelectorAll('.subtemas-container-selector').forEach(container => {
                            const tieneSeleccionados = container.querySelectorAll('.tema-checkbox-subtema:checked').length > 0;
                            if (tieneSeleccionados) container.style.display = 'block';
                        });
                        actualizarTemasSeleccionados();
                    }
                };
                container.appendChild(btnConfigAnterior);
            }
        } catch(e) { console.warn('Error cargando config anterior:', e); }
        
        // Renderizar temas principales con sus subtemas
        temasPrincipales.forEach((tema) => {
            const tieneSubtemas = subtemasPorPadre[tema.id] && subtemasPorPadre[tema.id].length > 0;
            
            const temaDiv = document.createElement('div');
            temaDiv.className = 'tema-selector-card';
            
            temaDiv.innerHTML = `
                <div class="tema-principal-selector">
                    <label class="tema-checkbox-container">
                        <input type="checkbox" class="tema-checkbox-principal" id="tema-${tema.id}" data-tema="${tema.nombre}">
                        <span class="tema-nombre-selector">📚 ${tema.nombre}</span>
                        <span class="tema-contador-selector">${tema.preguntasVerificadas} preguntas</span>
                    </label>
                    ${tieneSubtemas ? `
                        <button class="toggle-subtemas-selector" onclick="toggleSubtemasSelector('${tema.id}')">
                            <span id="arrow-${tema.id}">📁</span>
                        </button>
                    ` : ''}
                </div>
                ${tieneSubtemas ? `
                    <div class="subtemas-container-selector" id="subtemas-${tema.id}" style="display: none;">
                        ${subtemasPorPadre[tema.id].map(subtema => `
                            <div class="subtema-selector">
                                <label class="subtema-checkbox-container">
                                    <input type="checkbox" class="tema-checkbox-subtema" id="subtema-${subtema.id}" data-tema="${subtema.nombre}">
                                    <span class="subtema-nombre-selector">↳ ${subtema.nombre}</span>
                                    <span class="subtema-contador-selector">${subtema.preguntasVerificadas} preguntas</span>
                                </label>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            `;
            
            container.appendChild(temaDiv);
        });
        
        // Configurar event listeners DESPUÉS de crear todos los elementos
        configurarEventListenersSelector();
        actualizarContadorTemas();
        
    } catch (error) {
        console.error('Error cargando temas para selector:', error);
        container.innerHTML = '<p>Error cargando temas</p>';
    }
}

function marcarTodasLosTemas() {
    const todosLosCheckboxes = document.querySelectorAll('.tema-checkbox-principal, .tema-checkbox-subtema');
    const btnMarcarTodas = document.getElementById('btnMarcarTodasTemas');
    
    // Verificar si todos están marcados
    const todosMarcados = Array.from(todosLosCheckboxes).every(cb => cb.checked);
    
    if (todosMarcados) {
        // DESMARCAR TODAS
        todosLosCheckboxes.forEach(checkbox => {
            checkbox.checked = false;
            const temaNombre = checkbox.dataset.tema;
            temasSeleccionados.delete(temaNombre);
        });
        btnMarcarTodas.textContent = '✅ Marcar Todas';
    } else {
        // MARCAR TODAS
        todosLosCheckboxes.forEach(checkbox => {
            checkbox.checked = true;
            const temaNombre = checkbox.dataset.tema;
            temasSeleccionados.add(temaNombre);
        });
        btnMarcarTodas.textContent = '❌ Desmarcar Todas';
    }
    
    actualizarTemasSeleccionados();
}
