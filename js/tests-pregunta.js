import { auth, db, storage } from './firebase-config.js';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    addDoc, 
    collection,
    doc,
    getDoc,
    setDoc,
    getDocs,
    query,
    where,
    updateDoc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { buscarContextoEnDocumento } from './tema-digital.js';

let currentUser = null;
let testConfig = null;
let preguntaActual = 0;
let respuestas = [];
let cronometroInterval = null;
let tiempoRestanteSegundos = 0;
let padreNombresMap = {};

// Esperar a que el DOM esté cargado
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM cargado en tests-pregunta.js');
    
    // Verificar autenticación
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            cargarConfiguracion();
        } else {
            window.location.href = 'index.html';
        }
    });
});

async function cargarConfiguracion() {
    const configStr = localStorage.getItem('testConfig');
    
    if (!configStr) {
        alert('No hay configuración de test disponible');
        window.location.href = 'tests.html?section=aleatorio';
        return;
    }
    
    testConfig = JSON.parse(configStr);

    // Cargar nombres de temas padre
    const padreIds = [...new Set(
        (testConfig.preguntas || [])
            .map(p => p.temaPadreId)
            .filter(Boolean)
    )];
    if (padreIds.length > 0) {
        const snapshots = await Promise.all(
            padreIds.map(id => getDoc(doc(db, 'temas', id)))
        );
        snapshots.forEach((snap, i) => {
            if (snap.exists()) padreNombresMap[padreIds[i]] = snap.data().nombre;
        });
    }
    
    // Normalizar preguntas: asegurar que todas tengan respuestaCorrecta
    if (testConfig.preguntas) {
        testConfig.preguntas = testConfig.preguntas.map(pregunta => {
            // Si no tiene respuestaCorrecta, buscarla en las opciones
            if (!pregunta.respuestaCorrecta && pregunta.opciones) {
                const opcionCorrecta = pregunta.opciones.find(op => op.esCorrecta === true);
                if (opcionCorrecta) {
                    pregunta.respuestaCorrecta = opcionCorrecta.letra;
                }
            }
            return pregunta;
        });
    }
    
    // Mostrar nombre del test
    document.getElementById('nombreTestPregunta').textContent = testConfig.nombreTest || 'Test';
    
    // Iniciar cronómetro si hay tiempo límite
    if (testConfig.tiempoLimite && testConfig.tiempoLimite !== 'sin') {
        const minutos = parseInt(testConfig.tiempoLimite);
        iniciarCronometro(minutos * 60);
    }
    
    // Generar dots de progreso
    generarProgressDots();
    
    // Cargar primera pregunta
    mostrarPregunta();
    
    // Inicializar estadísticas
    actualizarEstadisticas();
}

function generarProgressDots() {
    const container = document.getElementById('progressDots');
    if (!container || !testConfig) return;
    
    container.innerHTML = '';
    const total = testConfig.preguntas.length;
    
    for (let i = 0; i < total; i++) {
        const dot = document.createElement('div');
        dot.className = 'progress-dot';
        dot.dataset.index = i;
        container.appendChild(dot);
    }
}

function actualizarProgressDots() {
    const dots = document.querySelectorAll('.progress-dot');
    
    dots.forEach((dot, index) => {
        dot.classList.remove('actual', 'correcta', 'incorrecta');
        
        if (index === preguntaActual) {
            dot.classList.add('actual');
        }
        
        const respuesta = respuestas.find(r => r.preguntaIndex === index);
        if (respuesta) {
            dot.classList.add(respuesta.esCorrecta ? 'correcta' : 'incorrecta');
        }
    });
}
function actualizarEstadisticas() {
    const total = testConfig.preguntas.length;
    const correctas = respuestas.filter(r => r.esCorrecta).length;
    const incorrectas = respuestas.filter(r => !r.esCorrecta).length;
    
    // Actualizar contadores
    document.getElementById('statCorrectas').textContent = correctas;
    document.getElementById('statIncorrectas').textContent = incorrectas;
    
    // Actualizar barra de progreso
    const progressBar = document.getElementById('progressBar');
    if (progressBar) {
        const porcentaje = ((preguntaActual + 1) / total) * 100;
        progressBar.style.width = `${porcentaje}%`;
    }
    
    // Actualizar dots
    actualizarProgressDots();
}
function mostrarPregunta() {
    if (preguntaActual >= testConfig.preguntas.length) {
        finalizarTest();
        return;
    }
    
    const pregunta = testConfig.preguntas[preguntaActual];
    
    // Actualizar contador
    const total = testConfig.preguntas.length;
    const contadorEl = document.getElementById('contadorPregunta');
    contadorEl.innerHTML = `Pregunta <span>${preguntaActual + 1}</span> de <span>${total}</span>`;
    
    // Mostrar badge de tema padre
    let temaBadge = document.getElementById('temaBadgePregunta');
    if (!temaBadge) {
        temaBadge = document.createElement('div');
        temaBadge.id = 'temaBadgePregunta';
        temaBadge.style.cssText = 'display:inline-flex;align-items:center;gap:6px;background:rgba(37,99,235,0.1);border:1px solid rgba(37,99,235,0.3);color:#2563eb;font-size:0.78rem;font-weight:600;padding:4px 12px;border-radius:20px;margin-bottom:12px;';
        const textoEl = document.getElementById('textoPreguntaGrande');
        textoEl.parentNode.insertBefore(temaBadge, textoEl);
    }
    const nombreBadge = (pregunta.temaPadreId && padreNombresMap[pregunta.temaPadreId])
        ? padreNombresMap[pregunta.temaPadreId]
        : pregunta.temaNombre;
    if (nombreBadge) {
        temaBadge.innerHTML = `📁 ${nombreBadge}`;
        temaBadge.style.display = 'inline-flex';
    } else {
        temaBadge.style.display = 'none';
    }

    // Mostrar texto de la pregunta
    document.getElementById('textoPreguntaGrande').textContent = pregunta.texto;
    
    // Generar opciones
    const opcionesContainer = document.getElementById('opcionesLista');
    opcionesContainer.innerHTML = '';
    
    // Mostrar opciones en orden original (A, B, C, D)
    pregunta.opciones.forEach(opcion => {
        const opcionDiv = document.createElement('div');
        opcionDiv.className = 'opcion-item';
        opcionDiv.innerHTML = `
            <div class="opcion-letra">${opcion.letra}</div>
            <div class="opcion-texto">${opcion.texto}</div>
        `;
        opcionDiv.onclick = () => seleccionarRespuesta(opcion.letra);
        opcionesContainer.appendChild(opcionDiv);
    });
    
    // Verificar si hay respuesta previa para esta pregunta
    const respuestaPrevia = respuestas.find(r => r.preguntaIndex === preguntaActual);
    
    if (respuestaPrevia) {
        // Mostrar la respuesta anterior
        mostrarRespuestaPrevia(respuestaPrevia);
    }
    
    // Manejar botón anterior
    const btnAnterior = document.getElementById('btnAnterior');
    if (btnAnterior) {
        btnAnterior.disabled = preguntaActual === 0;
    }
    
    // SIEMPRE resetear panel de explicacion al cambiar de pregunta
    document.getElementById('explicacionPanel').classList.remove('activa');
    document.getElementById('btnVerExplicacion').textContent = '📖 Ver Explicación';
    document.getElementById('explicacionContenido').innerHTML = '';
    document.getElementById('textoGemini').innerHTML = '';
    document.getElementById('tabDigital').classList.remove('tiene-contenido');
    document.getElementById('tabGemini').classList.remove('tiene-contenido');
    // Resetear tabs a digital por defecto
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById('tabDigital').classList.add('active');
    document.getElementById('contentDigital').classList.add('active');

    // Ocultar feedback y boton siguiente si no hay respuesta previa
    const feedbackContainer = document.getElementById('feedbackContainer');
    if (!respuestaPrevia) {
        feedbackContainer.classList.remove('mostrar', 'correcto', 'incorrecto');
        document.getElementById('btnSiguiente').classList.remove('mostrar');
        document.getElementById('btnVerExplicacion').classList.remove('mostrar');
    }
}
function mostrarRespuestaPrevia(respuestaPrevia) {
    const pregunta = testConfig.preguntas[preguntaActual];
    
    // Deshabilitar todas las opciones y mostrar estados
    const opciones = document.querySelectorAll('.opcion-item');
    opciones.forEach(opcion => {
        opcion.classList.add('deshabilitada');
        opcion.onclick = null;
        
        const letraOpcion = opcion.querySelector('.opcion-letra').textContent;
        
        // Marcar la correcta en verde
        if (letraOpcion === pregunta.respuestaCorrecta) {
            opcion.classList.add('correcta');
        }
        
        // Marcar la seleccionada incorrecta en rojo
        if (letraOpcion === respuestaPrevia.respuestaUsuario && !respuestaPrevia.esCorrecta) {
            opcion.classList.add('incorrecta');
        }
    });
    
    // Mostrar feedback
    const feedbackContainer = document.getElementById('feedbackContainer');
    const feedbackTitulo = document.getElementById('feedbackTitulo');
    const feedbackTexto = document.getElementById('feedbackTexto');
    
    feedbackContainer.classList.remove('correcto', 'incorrecto');
    
    if (respuestaPrevia.esCorrecta) {
        feedbackContainer.classList.add('correcto');
        feedbackTitulo.textContent = '✅ ¡Correcto!';
        feedbackTexto.textContent = 'Has seleccionado la respuesta correcta.';
    } else {
        feedbackContainer.classList.add('incorrecto');
        feedbackTitulo.textContent = '❌ Incorrecto';
        feedbackTexto.innerHTML = `La respuesta correcta es <span class="respuesta-correcta">${pregunta.respuestaCorrecta}</span>`;
    }
    
    feedbackContainer.classList.add('mostrar');
    
    // Botón siguiente con texto apropiado
    const btnSiguiente = document.getElementById('btnSiguiente');
    if (preguntaActual === testConfig.preguntas.length - 1) {
        btnSiguiente.textContent = '🏁 Finalizar';
    } else {
        btnSiguiente.textContent = 'Siguiente →';
    }
    btnSiguiente.classList.add('mostrar');
    
    // Mostrar botón de explicación
    document.getElementById('btnVerExplicacion').classList.add('mostrar');
    
    // Actualizar estadísticas en tiempo real
    actualizarEstadisticas();
}
function seleccionarRespuesta(letraSeleccionada) {
    const pregunta = testConfig.preguntas[preguntaActual];
    const esCorrecta = letraSeleccionada === pregunta.respuestaCorrecta;
    
    // Verificar si ya existe una respuesta para esta pregunta
    const indexRespuestaExistente = respuestas.findIndex(r => r.preguntaIndex === preguntaActual);
    
    const nuevaRespuesta = {
        preguntaIndex: preguntaActual,
        respuestaUsuario: letraSeleccionada,
        respuestaCorrecta: pregunta.respuestaCorrecta,
        esCorrecta: esCorrecta,
        pregunta: pregunta
    };
    
    if (indexRespuestaExistente !== -1) {
        // Actualizar respuesta existente
        respuestas[indexRespuestaExistente] = nuevaRespuesta;
    } else {
        // Guardar nueva respuesta
        respuestas.push(nuevaRespuesta);
    }
    
    // Deshabilitar todas las opciones
    const opciones = document.querySelectorAll('.opcion-item');
    opciones.forEach(opcion => {
        opcion.classList.add('deshabilitada');
        opcion.onclick = null;
        
        // Obtener la letra de esta opción
        const letraOpcion = opcion.querySelector('.opcion-letra').textContent;
        
        // Marcar la correcta en verde
        if (letraOpcion === pregunta.respuestaCorrecta) {
            opcion.classList.add('correcta');
        }
        
        // Marcar la seleccionada incorrecta en rojo
        if (letraOpcion === letraSeleccionada && !esCorrecta) {
            opcion.classList.add('incorrecta');
        }
    });
    
    // Mostrar feedback
    const feedbackContainer = document.getElementById('feedbackContainer');
    const feedbackTitulo = document.getElementById('feedbackTitulo');
    const feedbackTexto = document.getElementById('feedbackTexto');
    
    feedbackContainer.classList.remove('correcto', 'incorrecto');
    
    if (esCorrecta) {
        feedbackContainer.classList.add('correcto');
        feedbackTitulo.textContent = '✅ ¡Correcto!';
        feedbackTexto.textContent = 'Has seleccionado la respuesta correcta.';
    } else {
        feedbackContainer.classList.add('incorrecto');
        feedbackTitulo.textContent = '❌ Incorrecto';
        feedbackTexto.innerHTML = `La respuesta correcta es <span class="respuesta-correcta">${pregunta.respuestaCorrecta}</span>`;
    }
    
    feedbackContainer.classList.add('mostrar');
    
    // Botón siguiente con texto apropiado
    const btnSiguiente = document.getElementById('btnSiguiente');
    if (preguntaActual === testConfig.preguntas.length - 1) {
        btnSiguiente.textContent = '🏁 Finalizar';
    } else {
        btnSiguiente.textContent = 'Siguiente →';
    }
        btnSiguiente.classList.add('mostrar');
    
    // Mostrar botón de explicación
    document.getElementById('btnVerExplicacion').classList.add('mostrar');
    
    // Actualizar estadísticas en tiempo real
    actualizarEstadisticas();
}

window.siguientePregunta = function() {
    preguntaActual++;
    mostrarPregunta();
};
window.preguntaAnterior = function() {
    if (preguntaActual > 0) {
        preguntaActual--;
        mostrarPregunta();
    }
};
// Funciones para el modal de salida
window.intentarSalir = function() {
    const preguntasRestantes = testConfig.preguntas.length - respuestas.length;
    const modal = document.getElementById('modalSalir');
    const mensajeModal = document.getElementById('mensajeModal');
    
    if (preguntasRestantes > 0) {
        mensajeModal.textContent = `Si sales ahora, las ${preguntasRestantes} preguntas restantes se marcarán como no respondidas.`;
    } else {
        mensajeModal.textContent = 'Has completado todas las preguntas. ¿Quieres ver los resultados?';
    }
    
    modal.classList.add('mostrar');
};

window.cerrarModal = function() {
    document.getElementById('modalSalir').classList.remove('mostrar');
};

window.confirmarSalida = function() {
    cerrarModal();
    finalizarTest();
};
function iniciarCronometro(segundos) {
    tiempoRestanteSegundos = segundos;
    document.getElementById('cronometro').style.display = 'block';
    
    cronometroInterval = setInterval(() => {
        tiempoRestanteSegundos--;
        actualizarDisplayCronometro();
        
        if (tiempoRestanteSegundos <= 0) {
            clearInterval(cronometroInterval);
            finalizarTestPorTiempo();
        }
    }, 1000);
    
    actualizarDisplayCronometro();
}

function actualizarDisplayCronometro() {
    const minutos = Math.floor(tiempoRestanteSegundos / 60);
    const segundos = tiempoRestanteSegundos % 60;
    const display = `${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;
    
    const tiempoDisplay = document.getElementById('tiempoRestante');
    tiempoDisplay.textContent = display;
    
    // Advertencia cuando quedan 5 minutos o menos
    if (tiempoRestanteSegundos <= 300) {
        tiempoDisplay.classList.add('warning');
    }
}

function detenerCronometro() {
    if (cronometroInterval) {
        clearInterval(cronometroInterval);
    }
}
// Función para normalizar nombres de temas
function normalizarNombreTema(nombre) {
    return nombre
        .toLowerCase()
        .trim()
        .replace(/tema\s*/i, 'tema ')
        .replace(/\s+/g, ' ')
        .replace(/\buno\b/i, '1')
        .replace(/\bdos\b/i, '2')
        .replace(/\btres\b/i, '3')
        .replace(/\bcuatro\b/i, '4')
        .replace(/\bcinco\b/i, '5')
        .replace(/\bseis\b/i, '6')
        .replace(/\bsiete\b/i, '7')
        .replace(/\bocho\b/i, '8')
        .replace(/\bnueve\b/i, '9')
        .replace(/\bdiez\b/i, '10');
}

// Función para buscar tema en planning por nombre
async function buscarTemaEnPlanningPorNombre(nombreBanco) {
    try {
        const planningDoc = await getDoc(doc(db, "planningSimple", currentUser.uid));
        if (!planningDoc.exists()) return null;
        
        const planningData = planningDoc.data();
        if (!planningData.temas || planningData.temas.length === 0) return null;
        
        const nombreNormalizado = normalizarNombreTema(nombreBanco);
        
        const temaEncontrado = planningData.temas.find(tema => {
            const nombrePlanningNormalizado = normalizarNombreTema(tema.nombre);
            return nombrePlanningNormalizado === nombreNormalizado;
        });
        
        return temaEncontrado;
    } catch (error) {
        console.error('Error buscando tema en planning:', error);
        return null;
    }
}
// Función para registrar en progresoSimple
async function registrarTestEnProgresoSimple(temasUtilizados) {
    try {
        console.log('=== REGISTRANDO TEST EN PROGRESO SIMPLE (PREGUNTA A PREGUNTA) ===');
        console.log('Temas recibidos:', temasUtilizados);
        
        const temasUnicos = [...new Set(temasUtilizados)];
        
        // Obtener nombres de temas del banco y buscar coincidencias en planning
        const infoTemasCompleta = await Promise.all(
            temasUnicos.map(async (temaIdBanco) => {
                const temaDoc = await getDoc(doc(db, "temas", temaIdBanco));
                if (!temaDoc.exists()) return null;
                
                const temaData = temaDoc.data();
                const nombreBanco = temaData.nombre;
                
                // Buscar tema equivalente en planning
                const temaPlanning = await buscarTemaEnPlanningPorNombre(nombreBanco);
                
                return {
                    idBanco: temaIdBanco,
                    nombreBanco: nombreBanco,
                    padre: temaData.temaPadreId || null,
                    temaPlanning: temaPlanning
                };
            })
        );
        
        const infoTemas = infoTemasCompleta.filter(t => t !== null);
        
        console.log('Info temas con vinculación planning:', infoTemas);
        
        // Detectar si todos son subtemas del mismo padre
        const padres = infoTemas.map(t => t.padre).filter(p => p !== null);
        const todosDelMismoPadre = padres.length === infoTemas.length && 
                                    padres.length > 0 &&
                                    padres.every(p => p === padres[0]);
        const temaPadre = todosDelMismoPadre ? padres[0] : null;
        
        // Obtener progresoSimple
        const progresoRef = doc(db, "progresoSimple", currentUser.uid);
        let progresoDoc = await getDoc(progresoRef);
        
        if (!progresoDoc.exists()) {
            console.log('No existe progresoSimple');
            return;
        }
        
        let progresoData = progresoDoc.data();
        if (!progresoData.temas) progresoData.temas = {};
        if (!progresoData.registros) progresoData.registros = [];
        
        const esMix = infoTemas.length > 1 && !todosDelMismoPadre;
        const fechaHoy = new Date();
        
        if (esMix) {
            // Test Mix
            progresoData.registros.push({
                fecha: fechaHoy,
                temaId: 'mix',
                hojasLeidas: 0,
                testsRealizados: 1,
                temasMix: temasUnicos
            });
        } else {
            // Test de un solo tema
            let temaInfo = infoTemas[0];
            
            // Si hay padre compartido, buscar info del padre
            if (todosDelMismoPadre && temaPadre) {
                const padreDoc = await getDoc(doc(db, "temas", temaPadre));
                if (padreDoc.exists()) {
                    const nombrePadre = padreDoc.data().nombre;
                    const temaPlanningPadre = await buscarTemaEnPlanningPorNombre(nombrePadre);
                    
                    temaInfo = {
                        idBanco: temaPadre,
                        nombreBanco: nombrePadre,
                        temaPlanning: temaPlanningPadre
                    };
                }
            }
            
            // Determinar ID a usar: planning si existe, sino banco
            let temaIdFinal;
            let nombreFinal;
            let hojasTotales = 0;
            
            if (temaInfo.temaPlanning) {
                // Usar ID del planning
                temaIdFinal = temaInfo.temaPlanning.id;
                nombreFinal = temaInfo.temaPlanning.nombre;
                hojasTotales = temaInfo.temaPlanning.hojas || 0;
                console.log('✅ Vinculado con planning:', nombreFinal);
            } else {
                // Usar ID del banco (tema no está en planning)
                temaIdFinal = temaInfo.idBanco;
                nombreFinal = temaInfo.nombreBanco;
                console.log('⚠️ Tema no encontrado en planning, usando ID banco');
            }
            
            // Crear tema en progreso si no existe
            if (!progresoData.temas[temaIdFinal]) {
                progresoData.temas[temaIdFinal] = {
                    nombre: nombreFinal,
                    hojasTotales: hojasTotales,
                    hojasLeidas: 0,
                    testsRealizados: 0
                };
            }
            
            // Incrementar contador
            progresoData.temas[temaIdFinal].testsRealizados = 
                (progresoData.temas[temaIdFinal].testsRealizados || 0) + 1;
            
            // Añadir registro
            progresoData.registros.push({
                fecha: fechaHoy,
                temaId: temaIdFinal,
                hojasLeidas: 0,
                testsRealizados: 1
            });
        }
        
        await setDoc(progresoRef, progresoData);
        console.log('✅ Test registrado en progresoSimple');
        
    } catch (error) {
        console.error('❌ Error registrando test:', error);
    }
}

function finalizarTestPorTiempo() {
    alert('¡Tiempo agotado! El test se finalizará automáticamente.');
    finalizarTest();
}
async function finalizarTest() {
    // Detener cronómetro
    detenerCronometro();
    
    // Calcular tiempo empleado
    let tiempoEmpleado = 0;
    if (testConfig.tiempoLimite && testConfig.tiempoLimite !== 'sin') {
        const tiempoLimiteSegundos = parseInt(testConfig.tiempoLimite) * 60;
        tiempoEmpleado = Math.floor((tiempoLimiteSegundos - tiempoRestanteSegundos) / 60);
    }
    
    // Calcular resultados
    const correctas = respuestas.filter(r => r.esCorrecta).length;
    const total = testConfig.preguntas.length;
    const incorrectas = respuestas.length - correctas;
    const sinResponder = total - respuestas.length;
    const porcentaje = Math.round((correctas / total) * 100);
    
    // Crear detalle de respuestas para la pantalla de resultados
    const detalleRespuestas = testConfig.preguntas.map((pregunta, index) => {
        const respuestaUsuario = respuestas.find(r => r.preguntaIndex === index);
        
        let estado = 'sin-respuesta';
        let respuestaLetra = null;
        
        if (respuestaUsuario) {
            estado = respuestaUsuario.esCorrecta ? 'correcta' : 'incorrecta';
            respuestaLetra = respuestaUsuario.respuestaUsuario;
        }
        
        // Obtener respuestaCorrecta de forma robusta
        let respuestaCorrecta = pregunta.respuestaCorrecta;
        if (!respuestaCorrecta && pregunta.opciones) {
            const opcionCorrecta = pregunta.opciones.find(op => op.esCorrecta === true);
            if (opcionCorrecta) {
                respuestaCorrecta = opcionCorrecta.letra;
            }
        }

        return {
            pregunta: {
                texto: pregunta.texto || '',
                opciones: pregunta.opciones || [],
                respuestaCorrecta: respuestaCorrecta,
                temaId: pregunta.temaId || '',
                temaNombre: pregunta.temaNombre || '',
                temaEpigrafe: pregunta.temaEpigrafe || ''
            },
            respuestaUsuario: respuestaLetra,
            respuestaCorrecta: respuestaCorrecta,
            estado: estado,
            indice: index + 1
        };
    });
    
    // Crear objeto de resultados completo con TODOS los campos necesarios
    const resultadosCompletos = {
        correctas: correctas,
        incorrectas: incorrectas,
        sinResponder: sinResponder,
        total: total,
        porcentaje: porcentaje,
        tiempoEmpleado: tiempoEmpleado,
        test: {
            id: 'test_' + new Date().getTime() + '_' + Math.random().toString(36).substr(2, 9),
            nombre: testConfig.nombreTest || 'Test sin nombre',
            tema: testConfig.temas || 'todos',
            fechaInicio: new Date()
        },
        detalleRespuestas: detalleRespuestas,
        fechaCreacion: new Date(),
        usuarioId: currentUser.uid
    };
    
    console.log('Resultados generados:', resultadosCompletos);
    
    // Guardar en Firebase
    try {
        await addDoc(collection(db, "resultados"), resultadosCompletos);
        console.log('Resultados guardados en Firebase');
        
        // Si es test de REPASO, eliminar las preguntas acertadas de preguntasFalladas
        if (testConfig.esRepaso) {
            const preguntasAcertadas = detalleRespuestas.filter(detalle => 
                detalle.estado === 'correcta'
            );
            
            if (preguntasAcertadas.length > 0) {
                console.log(`Eliminando ${preguntasAcertadas.length} preguntas acertadas de preguntasFalladas...`);
                
                const promesasEliminacion = preguntasAcertadas.map(async (detalle) => {
                    const q = query(
                        collection(db, "preguntasFalladas"),
                        where("usuarioId", "==", currentUser.uid)
                    );
                    
                    const querySnapshot = await getDocs(q);
                    const eliminaciones = [];
                    
                    querySnapshot.forEach((docSnapshot) => {
                        const data = docSnapshot.data();
                        if (data.pregunta && data.pregunta.texto === detalle.pregunta.texto) {
                            eliminaciones.push(deleteDoc(doc(db, "preguntasFalladas", docSnapshot.id)));
                        }
                    });
                    
                    return Promise.all(eliminaciones);
                });
                
                await Promise.all(promesasEliminacion);
                console.log(`${preguntasAcertadas.length} preguntas eliminadas del banco de repaso`);
            }
        }

        // Guardar preguntas acertadas como "dominadas" (ocultas del ranking) - aplica a TODOS los tipos de test
        const preguntasAcertadasDominadas = detalleRespuestas.filter(detalle => 
            detalle.estado === 'correcta'
        );
        
        if (preguntasAcertadasDominadas.length > 0) {
            console.log(`Guardando ${preguntasAcertadasDominadas.length} preguntas como dominadas...`);
            
            const dominadasRefAcertadas = doc(db, "preguntasDominadas", currentUser.uid);
            const dominadasDocAcertadas = await getDoc(dominadasRefAcertadas);
            
            let listaDominadas = [];
            if (dominadasDocAcertadas.exists()) {
                listaDominadas = dominadasDocAcertadas.data().preguntas || [];
            }
            
            preguntasAcertadasDominadas.forEach(acertada => {
                const textoNormalizado = acertada.pregunta.texto.trim();
                if (!listaDominadas.includes(textoNormalizado)) {
                    listaDominadas.push(textoNormalizado);
                }
            });
            
            await setDoc(dominadasRefAcertadas, { 
                preguntas: listaDominadas,
                ultimaActualizacion: new Date()
            });
            
            console.log(`${preguntasAcertadasDominadas.length} preguntas marcadas como dominadas (ocultas del ranking)`);
        }

        // Guardar preguntas falladas para el test de repaso (excepto si ya es test de ranking)
        const preguntasFalladas = detalleRespuestas.filter(detalle => 
            detalle.estado === 'incorrecta'
        );

        // Si hay fallos, quitar de dominadas para que reaparezcan en el ranking (aplica a TODOS los tipos de test)
        if (preguntasFalladas.length > 0) {
            try {
                const dominadasRef = doc(db, "preguntasDominadas", currentUser.uid);
                const dominadasDoc = await getDoc(dominadasRef);
                
                if (dominadasDoc.exists()) {
                    let preguntasDominadas = dominadasDoc.data().preguntas || [];
                    const cantidadAntes = preguntasDominadas.length;
                    
                    preguntasDominadas = preguntasDominadas.filter(textoDominada => {
                        const seHaFallado = preguntasFalladas.some(fallada => 
                            fallada.pregunta.texto.trim() === textoDominada
                        );
                        return !seHaFallado;
                    });
                    
                    if (preguntasDominadas.length < cantidadAntes) {
                        await setDoc(dominadasRef, { 
                            preguntas: preguntasDominadas,
                            ultimaActualizacion: new Date()
                        });
                        console.log(`${cantidadAntes - preguntasDominadas.length} preguntas vuelven al ranking por fallarlas de nuevo`);
                    }
                }
            } catch (error) {
                console.error('Error actualizando dominadas:', error);
            }
        }

        // Guardar preguntas falladas para repaso (solo si NO es test de ranking)
        if (preguntasFalladas.length > 0 && !testConfig.esRanking) {
            const promesasGuardado = preguntasFalladas.map(async (detalle) => {
                // Obtener respuestaCorrecta de forma robusta
                let respuestaCorrecta = detalle.respuestaCorrecta;
                if (!respuestaCorrecta && detalle.pregunta.opciones) {
                    const opcionCorrecta = detalle.pregunta.opciones.find(op => op.esCorrecta === true);
                    if (opcionCorrecta) {
                        respuestaCorrecta = opcionCorrecta.letra;
                    }
                }

                const preguntaFallada = {
                    usuarioId: currentUser.uid,
                    pregunta: {
                        texto: detalle.pregunta.texto,
                        opciones: detalle.pregunta.opciones,
                        respuestaCorrecta: respuestaCorrecta,
                        temaId: detalle.pregunta.temaId || '',
                        temaNombre: detalle.pregunta.temaNombre || '',
                        temaEpigrafe: detalle.pregunta.temaEpigrafe || ''
                    },
                    respuestaUsuario: detalle.respuestaUsuario,
                    estado: detalle.estado,
                    fechaFallo: new Date(),
                    testId: resultadosCompletos.test.id,
                    testNombre: resultadosCompletos.test.nombre
                };

                return addDoc(collection(db, "preguntasFalladas"), preguntaFallada);
            });

            await Promise.all(promesasGuardado);
            console.log(`${preguntasFalladas.length} preguntas falladas guardadas para repaso desde test pregunta a pregunta`);
        }
        
        // NUEVO: Registrar test en progresoSimple
        console.log('=== DEBUG TEMAS EN TEST ===');
        console.log('testConfig.temas:', testConfig.temas);
        console.log('Primera pregunta:', testConfig.preguntas[0]);
        
        const temasUtilizados = [...new Set(testConfig.preguntas.map(p => p.temaIdProgreso || p.temaId).filter(Boolean))];
        console.log('temasUtilizados extraídos:', temasUtilizados);
        
        if (temasUtilizados.length > 0) {
            await registrarTestEnProgresoSimple(temasUtilizados);
        }
        
    } catch (error) {
        console.error('Error guardando resultado:', error);
    }
    
    // Limpiar localStorage de config
    localStorage.removeItem('testConfig');
    
    // Invalidar caché de resultados para que se recarguen
    sessionStorage.removeItem('cacheResultados');
    sessionStorage.removeItem('cacheResultadosTimestamp');
    
    // Guardar resultados temporalmente para mostrarlos inmediatamente
    localStorage.setItem('ultimosResultados', JSON.stringify(resultadosCompletos));
    
    // Redirigir a tests.html con parámetros para mostrar resultados
   window.location.href = 'tests.html?section=resultados&mostrar=ultimo';
}

// ================== FUNCIONALIDAD DE EXPLICACIÓN ==================

window.toggleExplicacion = async function() {
    const panel = document.getElementById('explicacionPanel');
    const btn = document.getElementById('btnVerExplicacion');
    
    if (panel.classList.contains('activa')) {
        panel.classList.remove('activa');
        btn.textContent = '📖 Ver Explicación';
        return;
    }
    
    // Activar panel
    panel.classList.add('activa');
    btn.textContent = '📖 Ocultar Explicación';
    
    // Buscar contexto y verificar indicadores
    await cargarExplicacion();
    actualizarIndicadorDigital();
    verificarIndicadorGemini();
    verificarIndicadorTarjetas();
};

window.cerrarExplicacion = function() {
    const panel = document.getElementById('explicacionPanel');
    const btn = document.getElementById('btnVerExplicacion');
    panel.classList.remove('activa');
    btn.textContent = '📖 Ver Explicación';
};

async function cargarExplicacion() {
    const contenido = document.getElementById('explicacionContenido');
    const pregunta = testConfig.preguntas[preguntaActual];
    
    // Mostrar loading
    contenido.innerHTML = `
        <div class="explicacion-cargando">
            <div class="spinner"></div>
            <p>Buscando contexto...</p>
        </div>
    `;
    
    console.log('=== DEBUG EXPLICACIÓN ===');
    console.log('Pregunta completa:', pregunta);
    console.log('temaId:', pregunta.temaId);
    console.log('temaNombre:', pregunta.temaNombre);
    
    let temaId = pregunta.temaId;
    
    // Si no hay temaId, intentar buscar por nombre
    if (!temaId && pregunta.temaNombre) {
        console.log('Buscando tema por nombre:', pregunta.temaNombre);
        temaId = await buscarTemaIdPorNombre(pregunta.temaNombre);
        console.log('TemaId encontrado:', temaId);
    }
    
    if (!temaId) {
        mostrarNoDisponible('No se ha identificado el tema de esta pregunta.');
        return;
    }
    
    try {
        // Buscar tema con documento digital en jerarquía
        const temaConDocumento = await buscarTemaConDocumentoEnJerarquia(temaId);
        
        if (!temaConDocumento) {
            mostrarNoDisponible('Ni este tema ni su tema padre tienen documento digital subido.');
            return;
        }
        
        console.log('✅ Tema con documento encontrado:', temaConDocumento);
        
        // Buscar contexto en documento digital
        const resultado = await buscarContextoEnDocumento(pregunta, temaConDocumento.id);
        
        if (resultado && resultado.encontrado) {
            mostrarContextoEncontrado(resultado.contexto, temaConDocumento.id, pregunta.id);
        } else {
            mostrarNoEncontrado(temaConDocumento.id);
        }
    } catch (error) {
        console.error('Error cargando explicación:', error);
        mostrarNoDisponible('Error al cargar la explicación.');
    }
}

// Buscar tema con documento en jerarquía (subir hasta encontrar)
async function buscarTemaConDocumentoEnJerarquia(temaId) {
    let temaActualId = temaId;
    let intentos = 0;
    const maxIntentos = 5; // Evitar bucle infinito
    
    while (temaActualId && intentos < maxIntentos) {
        console.log(`Buscando documento en tema: ${temaActualId} (intento ${intentos + 1})`);
        
        const temaRef = doc(db, 'temas', temaActualId);
        const temaSnap = await getDoc(temaRef);
        
        if (!temaSnap.exists()) {
            console.log('Tema no existe');
            return null;
        }
        
        const temaData = temaSnap.data();
        console.log('Datos tema:', temaData.nombre, '- Tiene documento:', !!temaData.documentoDigital);
        
        // Si tiene documento, devolver
        if (temaData.documentoDigital) {
            return {
                id: temaActualId,
                nombre: temaData.nombre,
                documento: temaData.documentoDigital
            };
        }
        
        // Si no tiene documento, subir al padre
        if (temaData.temaPadreId) {
            console.log('Subiendo al tema padre:', temaData.temaPadreId);
            temaActualId = temaData.temaPadreId;
        } else {
            console.log('No hay tema padre, fin de búsqueda');
            return null;
        }
        
        intentos++;
    }
    
    return null;
}

async function buscarTemaIdPorNombre(nombreTema) {
    try {
        const temasRef = collection(db, 'temas');
        const q = query(temasRef, where('nombre', '==', nombreTema));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            return querySnapshot.docs[0].id;
        }
        return null;
    } catch (error) {
        console.error('Error buscando tema por nombre:', error);
        return null;
    }
}

async function mostrarContextoEncontrado(contexto, temaId, preguntaId) {
    const contenido = document.getElementById('explicacionContenido');
    const pregunta = testConfig.preguntas[preguntaActual];
    
    // Obtener documento completo
    const temaConDocumento = await buscarTemaConDocumentoEnJerarquia(temaId);
    if (!temaConDocumento) {
        contenido.innerHTML = '<p>Error al cargar el documento</p>';
        return;
    }
    
    const documentoCompleto = temaConDocumento.documento.textoExtraido;
    
    // Generar ID de pregunta
    const preguntaTexto = pregunta.texto || '';
    let hash = 0;
    for (let i = 0; i < preguntaTexto.length; i++) {
        const char = preguntaTexto.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    const preguntaIdHash = 'q_' + Math.abs(hash).toString(36);
    
    // Cargar subrayados previos si existen
    const subrayados = await cargarSubrayadosPrevios(preguntaIdHash);
    
    let textoMostrar;
    let mensajeInfo;
    
    if (subrayados) {
        textoMostrar = subrayados;
        mensajeInfo = '✅ Mostrando tus subrayados guardados';
    } else {
        textoMostrar = documentoCompleto;
        mensajeInfo = '✅ Documento cargado - Puedes hacer scroll o buscar texto específico';
    }
    
    // Guardar texto sin procesar en una variable global para búsqueda
    window.textoDocumentoOriginal = documentoCompleto;
    window.preguntaIdActual = preguntaIdHash;
    
    contenido.innerHTML = `
        <div class="contexto-encontrado-header">
            <p class="contexto-info">${mensajeInfo}</p>
            
            <div class="buscador-texto">
                <input type="text" id="buscadorInput" placeholder="🔍 Buscar texto en el documento..." class="input-buscador">
                <button onclick="buscarEnTexto()" class="btn-buscar">Buscar</button>
            </div>
        </div>
        <div class="explicacion-texto contexto-automatico documento-scroll" id="textoExplicacion">
            ${textoMostrar.replace(/\n/g, '<br>')}
        </div>
    `;
    
    const accionesDiv = document.querySelector('.explicacion-acciones');
    accionesDiv.innerHTML = `
        <button class="btn-subrayar" onclick="subrayarSeleccion()">✏️ Subrayar</button>
        <button class="btn-borrar-subrayado" onclick="borrarSubrayado()">🗑️ Quitar Subrayado</button>
        <button class="btn-guardar-subrayado" onclick="guardarSubrayado()">💾 Guardar</button>
    `;
    
    // Scroll automático al primer subrayado guardado
    if (subrayados) {
        setTimeout(() => {
            const primerSubrayado = document.querySelector('.subrayado');
            if (primerSubrayado) {
                primerSubrayado.scrollIntoView({ behavior: 'smooth', block: 'center' });
                console.log('✅ Scroll a subrayado guardado');
            }
        }, 300);
    }
}

function mostrarNoEncontrado(temaId) {
    const contenido = document.getElementById('explicacionContenido');
    contenido.innerHTML = `
        <div class="explicacion-no-encontrado">
            <p>📄 No se ha encontrado contexto automático para esta pregunta.</p>
            <p>Puedes abrir el tema digital completo y subrayar la información relevante.</p>
            <button class="btn-abrir-tema" onclick="abrirTemaCompleto('${temaId}')">
                📚 Abrir Tema Digital
            </button>
        </div>
    `;
    
    // Ocultar botones de subrayado
    document.querySelector('.btn-subrayar').style.display = 'none';
    document.querySelector('.btn-guardar-subrayado').style.display = 'none';
}

function mostrarNoDisponible(mensaje) {
    const contenido = document.getElementById('explicacionContenido');
    contenido.innerHTML = `
        <div class="explicacion-no-encontrado">
            <p>⚠️ ${mensaje}</p>
            <p>Sube un documento digital en la sección de Temas para habilitar esta funcionalidad.</p>
        </div>
    `;
}

window.abrirTemaCompleto = async function(temaId) {
    try {
        // Buscar tema con documento en jerarquía
        const temaConDocumento = await buscarTemaConDocumentoEnJerarquia(temaId);
        
        if (!temaConDocumento) {
            alert('No hay documento digital para este tema ni su tema padre');
            return;
        }
        
        const documento = temaConDocumento.documento;
        const pregunta = testConfig.preguntas[preguntaActual];
        
        // Mostrar documento completo en el panel
        const contenido = document.getElementById('explicacionContenido');
        
        // Cargar subrayados previos si existen
        const subrayados = await cargarSubrayadosPrevios(pregunta.id);
        let textoMostrar = documento.textoExtraido;
        
        if (subrayados) {
            textoMostrar = subrayados;
        }
        
        contenido.innerHTML = `
            <div class="documento-completo-header">
                <h4>📄 ${documento.nombre}</h4>
                <p class="documento-info">${Math.round(documento.tamano / 1024)} KB | ${documento.textoExtraido.length.toLocaleString()} caracteres</p>
                
                <!-- Buscador de texto -->
                <div class="buscador-texto">
                    <input type="text" id="buscadorInput" placeholder="🔍 Buscar en el documento..." class="input-buscador">
                    <button onclick="buscarEnTexto()" class="btn-buscar">Buscar</button>
                </div>
            </div>
            <div class="explicacion-texto documento-completo" id="textoExplicacion" data-texto-original="${documento.textoExtraido.replace(/"/g, '&quot;')}">
                ${textoMostrar.replace(/\n/g, '<br>')}
            </div>
        `;
        
        // Mostrar botones de subrayado y borrado
        const accionesDiv = document.querySelector('.explicacion-acciones');
        accionesDiv.innerHTML = `
            <button class="btn-subrayar" onclick="subrayarSeleccion()">✏️ Subrayar</button>
            <button class="btn-borrar-subrayado" onclick="borrarSubrayado()">🗑️ Quitar Subrayado</button>
            <button class="btn-guardar-subrayado" onclick="guardarSubrayado()">💾 Guardar</button>
        `;
        
        actualizarIndicadorDigital();
        
    } catch (error) {
        console.error('Error abriendo tema completo:', error);
        alert('Error al cargar el documento');
    }
};


window.limpiarBusqueda = async function() {
    document.getElementById('buscadorInput').value = '';
    
    // Limpiar variables de búsqueda
    window.coincidenciaActual = 0;
    window.totalCoincidencias = 0;
    
    // Eliminar controles de navegación
    const controles = document.querySelector('.controles-navegacion');
    if (controles) {
        controles.remove();
    }
    
    await cargarExplicacion();
};
window.buscarEnTexto = function() {
    const input = document.getElementById('buscadorInput');
    const textoBuscar = input.value.trim();
    
    if (!textoBuscar) {
        alert('Escribe algo para buscar');
        return;
    }
    
    const textoOriginal = window.textoDocumentoOriginal;
    
    if (!textoOriginal) {
        alert('Error: No hay documento cargado');
        return;
    }
    
    console.log('Buscando:', textoBuscar);
    console.log('Longitud documento:', textoOriginal.length);
    
    // Buscar sin regex para evitar problemas
    const textoLower = textoOriginal.toLowerCase();
    const buscarLower = textoBuscar.toLowerCase();
    
    let posicion = textoLower.indexOf(buscarLower);
    let coincidencias = 0;
    
    if (posicion === -1) {
        alert('No se encontraron coincidencias');
        return;
    }
    
    // Contar todas las coincidencias
    let pos = 0;
    while ((pos = textoLower.indexOf(buscarLower, pos)) !== -1) {
        coincidencias++;
        pos += buscarLower.length;
    }
    
    console.log('Coincidencias encontradas:', coincidencias);
    
    // Resaltar coincidencias manualmente
    let textoResaltado = textoOriginal;
    const regex = new RegExp(textoBuscar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    
    let contador = 0;
    textoResaltado = textoResaltado.replace(regex, (match) => {
        contador++;
        return `<mark class="busqueda-highlight" data-coincidencia="${contador}">${match}</mark>`;
    });
    
    const textoExplicacion = document.getElementById('textoExplicacion');
    textoExplicacion.innerHTML = textoResaltado.replace(/\n/g, '<br>');
    
    // Guardar info de búsqueda en variables globales
    window.coincidenciaActual = 1;
    window.totalCoincidencias = coincidencias;
    
    // Mostrar controles de navegación
    mostrarControlesNavegacion();
    
    // Ir a la primera coincidencia
    irACoincidencia(1);
};

function mostrarControlesNavegacion() {
    const header = document.querySelector('.contexto-encontrado-header') || document.querySelector('.documento-completo-header');
    if (!header) return;
    
    // Eliminar controles previos si existen
    const controlesExistentes = document.querySelector('.controles-navegacion');
    if (controlesExistentes) {
        controlesExistentes.remove();
    }
    
    // Crear controles nuevos
    const controles = document.createElement('div');
    controles.className = 'controles-navegacion';
    controles.innerHTML = `
        <button class="btn-nav" onclick="navegarCoincidencia(-1)" title="Anterior">◄</button>
        <span class="contador-coincidencias" id="contadorCoincidencias">
            <span id="numActual">1</span> de <span id="numTotal">${window.totalCoincidencias}</span>
        </span>
        <button class="btn-nav" onclick="navegarCoincidencia(1)" title="Siguiente">►</button>
    `;
    
    header.appendChild(controles);
}

window.navegarCoincidencia = function(direccion) {
    if (!window.totalCoincidencias) return;
    
    // Calcular nueva posición
    window.coincidenciaActual += direccion;
    
    // Loop circular
    if (window.coincidenciaActual > window.totalCoincidencias) {
        window.coincidenciaActual = 1;
    } else if (window.coincidenciaActual < 1) {
        window.coincidenciaActual = window.totalCoincidencias;
    }
    
    // Actualizar contador
    document.getElementById('numActual').textContent = window.coincidenciaActual;
    
    // Ir a coincidencia
    irACoincidencia(window.coincidenciaActual);
};

function irACoincidencia(numero) {
    const coincidencia = document.querySelector(`[data-coincidencia="${numero}"]`);
    
    if (coincidencia) {
        // Remover clase activa de todas
        document.querySelectorAll('.busqueda-highlight').forEach(el => {
            el.classList.remove('coincidencia-activa');
        });
        
        // Agregar clase activa a la actual
        coincidencia.classList.add('coincidencia-activa');
        
        // Scroll SOLO dentro del contenedor de texto
        const contenedorTexto = document.getElementById('textoExplicacion');
        if (contenedorTexto) {
            const offsetTop = coincidencia.offsetTop - contenedorTexto.offsetTop;
            contenedorTexto.scrollTo({
                top: offsetTop - 100,
                behavior: 'smooth'
            });
        }
    }
}
window.subrayarSeleccion = function() {
    const selection = window.getSelection();
    
    if (!selection || selection.toString().length === 0) {
        alert('Selecciona texto primero');
        return;
    }
    
    // NUEVO: Limpiar resaltados de búsqueda antes de subrayar
    limpiarResaltadosBusqueda();
    
    try {
        const range = selection.getRangeAt(0);
        const span = document.createElement('span');
        span.className = 'subrayado';
        range.surroundContents(span);
        selection.removeAllRanges();
    } catch (e) {
        alert('No se puede subrayar texto complejo. Selecciona un fragmento más simple.');
    }
};

// NUEVA FUNCIÓN: Eliminar todos los <mark> de búsqueda
function limpiarResaltadosBusqueda() {
    const textoExplicacion = document.getElementById('textoExplicacion');
    if (!textoExplicacion) return;
    
    const marks = textoExplicacion.querySelectorAll('.busqueda-highlight');
    marks.forEach(mark => {
        const texto = mark.textContent;
        const textNode = document.createTextNode(texto);
        mark.parentNode.replaceChild(textNode, mark);
    });
    
    // Limpiar variables y controles
    window.coincidenciaActual = 0;
    window.totalCoincidencias = 0;
    const controles = document.querySelector('.controles-navegacion');
    if (controles) controles.remove();
    
    console.log('✅ Resaltados de búsqueda eliminados');
}

window.borrarSubrayado = function() {
    const selection = window.getSelection();
    
    if (!selection || selection.toString().length === 0) {
        alert('Selecciona el texto subrayado que quieres eliminar');
        return;
    }
    
    try {
        const range = selection.getRangeAt(0);
        
        // Extraer el contenido seleccionado y reemplazarlo sin el span
        const fragment = range.extractContents();
        
        // Remover todos los spans de subrayado dentro del fragmento
        const spans = fragment.querySelectorAll('.subrayado');
        spans.forEach(span => {
            const parent = span.parentNode;
            while (span.firstChild) {
                parent.insertBefore(span.firstChild, span);
            }
            parent.removeChild(span);
        });
        
        // Si el fragmento mismo es un span de subrayado, quitarlo
        if (fragment.firstChild && fragment.firstChild.classList && fragment.firstChild.classList.contains('subrayado')) {
            const span = fragment.firstChild;
            const tempDiv = document.createElement('div');
            while (span.firstChild) {
                tempDiv.appendChild(span.firstChild);
            }
            fragment.removeChild(span);
            while (tempDiv.firstChild) {
                fragment.appendChild(tempDiv.firstChild);
            }
        }
        
        // Reinsertar el contenido sin subrayado
        range.insertNode(fragment);
        
        selection.removeAllRanges();
        
    } catch (e) {
        console.error('Error:', e);
        alert('Error al borrar subrayado');
    }
};

// Función auxiliar para guardar automáticamente después de borrar selectivamente
async function guardarSubrayadoAutomatico() {
    const textoExplicacion = document.getElementById('textoExplicacion');
    const preguntaId = window.preguntaIdActual;
    
    if (!textoExplicacion || !preguntaId) return;
    
    const elementos = textoExplicacion.querySelectorAll('.subrayado');
    
    try {
        const docId = `${currentUser.uid}_${preguntaId}`;
        const subrayadoRef = doc(db, 'subrayados', docId);
        
        if (elementos.length === 0) {
            // Si no quedan subrayados, eliminar el documento
            await deleteDoc(subrayadoRef);
            console.log('✅ Documento eliminado (no quedan subrayados)');
        } else {
            // Guardar HTML actualizado
            await setDoc(subrayadoRef, {
                usuarioId: currentUser.uid,
                preguntaId: preguntaId,
                htmlCompleto: textoExplicacion.innerHTML,
                cantidadSubrayados: elementos.length,
                fecha: new Date()
            }, { merge: true });
            console.log('✅ Guardado automático actualizado');
        }
        
    } catch (error) {
        console.error('Error guardando automáticamente:', error);
    }
}

window.guardarSubrayado = async function() {
    const textoExplicacion = document.getElementById('textoExplicacion');
    
    if (!textoExplicacion) {
        alert('Error: Elementos no encontrados');
        return;
    }
    
    const elementos = textoExplicacion.querySelectorAll('.subrayado');
    
    try {
        const preguntaId = window.preguntaIdActual;
        
        if (!preguntaId) {
            alert('Error: No se pudo identificar la pregunta');
            return;
        }
        
        const docId = `${currentUser.uid}_${preguntaId}`;
        const subrayadoRef = doc(db, 'subrayados', docId);
        
        if (elementos.length === 0) {
            // No hay subrayados: eliminar el documento de Firebase
            const docSnap = await getDoc(subrayadoRef);
            if (docSnap.exists()) {
                await deleteDoc(subrayadoRef);
                console.log('✅ Subrayados eliminados (no quedaban)');
            }
            alert('✅ Guardado (sin subrayados)');
        } else {
            // Hay subrayados: guardar
            await setDoc(subrayadoRef, {
                usuarioId: currentUser.uid,
                preguntaId: preguntaId,
                htmlCompleto: textoExplicacion.innerHTML,
                cantidadSubrayados: elementos.length,
                fecha: new Date()
            }, { merge: true });
            
            console.log('✅ Guardado exitoso');
            alert('✅ Subrayado guardado correctamente');
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
        alert('Error al guardar: ' + error.message);
    }
};

async function cargarSubrayadosPrevios(preguntaIdHash) {
    try {
        console.log('Cargando subrayados para:', preguntaIdHash);
        
        const docId = `${currentUser.uid}_${preguntaIdHash}`;
        const subrayadoRef = doc(db, 'subrayados', docId);
        const subDoc = await getDoc(subrayadoRef);
        
        if (subDoc.exists()) {
            console.log('✅ Subrayados encontrados');
            return subDoc.data().htmlCompleto;
        }
        
        console.log('No hay subrayados previos');
        return null;
    } catch (error) {
        console.error('Error cargando:', error);
        return null;
    }
}

function aplicarSubrayados(textoOriginal, htmlConSubrayados) {
    return htmlConSubrayados;
}
// ================== FORMATEO GEMINI ==================

window.formatearGemini = function(formato) {
    document.getElementById('textoGemini').focus();
    if (formato === 'bold') {
        document.execCommand('bold');
    } else if (formato === 'underline') {
        document.execCommand('underline');
    } else if (formato === 'highlight') {
        const sel = window.getSelection();
        if (sel.rangeCount) {
            const parent = sel.anchorNode.parentElement;
            if (parent && parent.style.backgroundColor && parent.tagName === 'SPAN') {
                parent.replaceWith(...parent.childNodes);
            } else {
                document.execCommand('backColor', false, '#fbbf24');
            }
        }
    }
};

// ================== INDICADORES DE CONTENIDO EN TABS ==================

function actualizarIndicadorDigital() {
    const contenido = document.getElementById('explicacionContenido');
    const tab = document.getElementById('tabDigital');
    const tieneDoc = contenido.querySelector('.contexto-encontrado-header') ||
                     contenido.querySelector('.documento-completo-header');
    if (tieneDoc) {
        tab.classList.add('tiene-contenido');
    } else {
        tab.classList.remove('tiene-contenido');
    }
}

async function verificarIndicadorGemini() {
    const tab = document.getElementById('tabGemini');
    try {
        const pregunta = testConfig.preguntas[preguntaActual];
        const preguntaTexto = pregunta.texto || '';
        let hash = 0;
        for (let i = 0; i < preguntaTexto.length; i++) {
            const char = preguntaTexto.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        const preguntaIdHash = 'q_' + Math.abs(hash).toString(36);
        const docId = `${currentUser.uid}_${preguntaIdHash}`;
        const geminiRef = doc(db, 'explicacionesGemini', docId);
        const geminiDoc = await getDoc(geminiRef);
        if (geminiDoc.exists() && geminiDoc.data().texto) {
            tab.classList.add('tiene-contenido');
        } else {
            tab.classList.remove('tiene-contenido');
        }
    } catch (error) {
        console.error('Error verificando Gemini:', error);
    }
}

async function verificarIndicadorTarjetas() {
    const tab = document.getElementById('tabTarjetas');
    if (!tab) return;
    try {
        const preguntaId = obtenerPreguntaIdHash();
        const q = query(
            collection(db, `usuarios/${currentUser.uid}/tarjetas`),
            where('preguntaId', '==', preguntaId)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
            tab.classList.add('tiene-contenido');
        } else {
            tab.classList.remove('tiene-contenido');
        }
    } catch (error) {
        console.error('Error verificando Tarjetas:', error);
    }
}

// ================== FUNCIONALIDAD DE TABS ==================

window.cambiarTab = async function(tab) {
    // Cambiar botones activos
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    if (tab === 'digital') {
        document.getElementById('tabDigital').classList.add('active');
        document.getElementById('contentDigital').classList.add('active');
    } else if (tab === 'gemini') {
        document.getElementById('tabGemini').classList.add('active');
        document.getElementById('contentGemini').classList.add('active');
        
        // Cargar explicación Gemini si existe
        await cargarExplicacionGemini();
    } else if (tab === 'tarjetas') {
        document.getElementById('tabTarjetas').classList.add('active');
        document.getElementById('contentTarjetas').classList.add('active');
        
        await cargarTarjetas();
    }
};

// ================== FUNCIONALIDAD GEMINI ==================

async function cargarExplicacionGemini() {
    const textarea = document.getElementById('textoGemini');
    if (!textarea) return;
    
    try {
        const pregunta = testConfig.preguntas[preguntaActual];
        const preguntaTexto = pregunta.texto || '';
        
        // Generar ID de pregunta
        let hash = 0;
        for (let i = 0; i < preguntaTexto.length; i++) {
            const char = preguntaTexto.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        const preguntaIdHash = 'q_' + Math.abs(hash).toString(36);
        
        const docId = `${currentUser.uid}_${preguntaIdHash}`;
        const geminiRef = doc(db, 'explicacionesGemini', docId);
        const geminiDoc = await getDoc(geminiRef);
        
        if (geminiDoc.exists() && geminiDoc.data().texto) {
            let texto = geminiDoc.data().texto;
            if (!texto.includes('<')) {
                texto = texto.replace(/\n/g, '<br>');
            }
            textarea.innerHTML = texto;
            document.getElementById('tabGemini').classList.add('tiene-contenido');
            console.log('✅ Explicación Gemini cargada');
        } else {
            textarea.innerHTML = '';
            document.getElementById('tabGemini').classList.remove('tiene-contenido');
            console.log('No hay explicación IA previa');
        }
        
    } catch (error) {
        console.error('Error cargando explicación Gemini:', error);
    }
}

window.guardarExplicacionGemini = async function() {
    const textarea = document.getElementById('textoGemini');
    if (!textarea) {
        alert('Error: No se encontró el área de texto');
        return;
    }
    
    const textoGemini = textarea.innerHTML.trim();
    
    if (!textoGemini || textoGemini === '<br>') {
        alert('Escribe algo antes de guardar');
        return;
    }
    
    try {
        const pregunta = testConfig.preguntas[preguntaActual];
        const preguntaTexto = pregunta.texto || '';
        
        // Generar ID de pregunta
        let hash = 0;
        for (let i = 0; i < preguntaTexto.length; i++) {
            const char = preguntaTexto.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        const preguntaIdHash = 'q_' + Math.abs(hash).toString(36);
        
        const docId = `${currentUser.uid}_${preguntaIdHash}`;
        const geminiRef = doc(db, 'explicacionesGemini', docId);
        
        await setDoc(geminiRef, {
            usuarioId: currentUser.uid,
            preguntaId: preguntaIdHash,
            preguntaTexto: preguntaTexto,
            texto: textoGemini,
            fecha: new Date()
        });
        
        console.log('✅ Explicación Gemini guardada');
        alert('✅ Explicación guardada correctamente');
        document.getElementById('tabGemini').classList.add('tiene-contenido');
        
    } catch (error) {
        console.error('❌ Error guardando:', error);
        alert('Error al guardar: ' + error.message);
    }
};
// ================== GENERACIÓN CON CLAUDE IA ==================

window.generarExplicacionIA = async function() {
    if (!currentUser) { alert('Debes estar autenticado'); return; }

    const pregunta = testConfig.preguntas[preguntaActual];
    const preguntaTexto = pregunta.texto || '';
    const opciones = pregunta.opciones || [];
    const respCorrecta = opciones.find(o => o.esCorrecta || o.letra === pregunta.respuestaCorrecta);

    const btnGenerar = document.getElementById('btnGenerarIA');
    const textarea = document.getElementById('textoGemini');
    if (btnGenerar) { btnGenerar.disabled = true; btnGenerar.textContent = '⏳ Generando...'; }

    try {
        const apiKey = await obtenerClaudeApiKey();
        console.log('API KEY usada:', apiKey.substring(0, 20) + '...' + apiKey.substring(apiKey.length - 5));
        console.log('Longitud clave:', apiKey.length);

        const respUsuario = opciones.find(o => o.letra === pregunta.respuestaUsuario || o.letra === respuestas.find(r => r.preguntaIndex === preguntaActual)?.respuestaUsuario);

        const prompt = `Eres un experto en oposiciones españolas. Analiza esta pregunta de oposición y explica:
1. Por qué la respuesta del alumno es INCORRECTA (si lo es).
2. Por qué la respuesta CORRECTA es la que es, con base legal si aplica.

Pregunta: ${preguntaTexto}
Opciones:
${opciones.map(o => `${o.letra}) ${o.texto}`).join('\n')}
Respuesta del alumno: ${respUsuario ? `${respUsuario.letra}) ${respUsuario.texto}` : 'No disponible'}
Respuesta correcta: ${respCorrecta ? `${respCorrecta.letra}) ${respCorrecta.texto}` : 'No disponible'}

Sé directo y pedagógico. Máximo 6 líneas.`;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 500,
                messages: [{ role: 'user', content: prompt }]
            })
        });

        if (!response.ok) throw new Error(`Error API: ${response.status}`);
        const data = await response.json();
        const texto = data.content?.[0]?.text || '';

        textarea.innerHTML = texto.replace(/\n/g, '<br>');
        document.getElementById('tabGemini').classList.add('tiene-contenido');

    } catch (error) {
        console.error('Error generando explicación IA:', error);
        alert('Error al generar explicación: ' + error.message);
    } finally {
        if (btnGenerar) { btnGenerar.disabled = false; btnGenerar.textContent = '✨ Generar con IA'; }
    }
};
async function obtenerClaudeApiKey() {
    const keyDoc = await getDoc(doc(db, 'config', 'keys'));
    if (!keyDoc.exists()) throw new Error('No se encontró la configuración de IA');
    return keyDoc.data().claudeApiKey.replace(/\s/g, '');
}

window.borrarExplicacionGemini = async function() {
    if (!confirm('¿Estás seguro de que quieres borrar esta explicación?')) {
        return;
    }
    
    const textarea = document.getElementById('textoGemini');
    
    try {
        const pregunta = testConfig.preguntas[preguntaActual];
        const preguntaTexto = pregunta.texto || '';
        
        // Generar ID de pregunta
        let hash = 0;
        for (let i = 0; i < preguntaTexto.length; i++) {
            const char = preguntaTexto.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        const preguntaIdHash = 'q_' + Math.abs(hash).toString(36);
        
        const docId = `${currentUser.uid}_${preguntaIdHash}`;
        const geminiRef = doc(db, 'explicacionesGemini', docId);
        
        const geminiDoc = await getDoc(geminiRef);
        if (geminiDoc.exists()) {
            await deleteDoc(geminiRef);
            console.log('✅ Explicación Gemini eliminada');
        }
        
        textarea.innerHTML = '';
        alert('✅ Explicación borrada');
        document.getElementById('tabGemini').classList.remove('tiene-contenido');
        
    } catch (error) {
        console.error('❌ Error borrando:', error);
        alert('Error al borrar: ' + error.message);
    }
};

// ================== TARJETAS VISUALES POR PREGUNTA ==================

function obtenerPreguntaIdHash() {
    const pregunta = testConfig.preguntas[preguntaActual];
    const preguntaTexto = pregunta.texto || '';
    let hash = 0;
    for (let i = 0; i < preguntaTexto.length; i++) {
        const char = preguntaTexto.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return 'q_' + Math.abs(hash).toString(36);
}

window.subirTarjeta = async function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        alert('Solo se permiten imágenes JPG o PNG');
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
        alert('La imagen no puede superar 5MB');
        return;
    }
    
    const preguntaId = obtenerPreguntaIdHash();
    if (!preguntaId || !currentUser) {
        alert('Error: no se pudo identificar la pregunta');
        return;
    }
    
    try {
        const galeria = document.getElementById('tarjetasGaleria');
        galeria.innerHTML = '<p style="color:#94a3b8; text-align:center;">⏳ Subiendo imagen...</p>';
        
        const timestamp = Date.now();
        const storagePath = `tarjetas/${currentUser.uid}/${preguntaId}/${timestamp}_${file.name}`;
        const storageRef = ref(storage, storagePath);
        
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        
        await addDoc(collection(db, `usuarios/${currentUser.uid}/tarjetas`), {
            preguntaId: preguntaId,
            url: downloadURL,
            storagePath: storagePath,
            nombre: file.name,
            creadoEn: new Date().toISOString()
        });
        
        await cargarTarjetas();
        event.target.value = '';
        
    } catch (error) {
        console.error('Error subiendo tarjeta:', error);
        alert('❌ Error al subir la imagen');
        await cargarTarjetas();
    }
};

async function cargarTarjetas() {
    const galeria = document.getElementById('tarjetasGaleria');
    if (!galeria) return;
    
    const preguntaId = obtenerPreguntaIdHash();
    if (!preguntaId || !currentUser) {
        galeria.innerHTML = '<p style="color:#94a3b8; text-align:center;">No hay tarjetas adjuntas</p>';
        return;
    }
    
    try {
        const q = query(
            collection(db, `usuarios/${currentUser.uid}/tarjetas`),
            where('preguntaId', '==', preguntaId)
        );
        const snap = await getDocs(q);
        
        if (snap.empty) {
            galeria.innerHTML = '<p style="color:#94a3b8; text-align:center;">No hay tarjetas adjuntas</p>';
            const tabBtn = document.getElementById('tabTarjetas');
            if (tabBtn) tabBtn.classList.remove('tiene-contenido');
            return;
        }
        
        let html = '';
        snap.forEach(docSnap => {
            const data = docSnap.data();
            html += `
                <div class="tarjeta-item">
                    <img src="${data.url}" alt="${data.nombre}" class="tarjeta-img" onclick="ampliarTarjeta('${data.url}')">
                    <button class="btn-eliminar-tarjeta" onclick="eliminarTarjeta('${docSnap.id}', '${data.storagePath}')" title="Eliminar">🗑️</button>
                </div>
            `;
        });
        
        galeria.innerHTML = html;
        
        const tabBtn = document.getElementById('tabTarjetas');
        if (tabBtn) tabBtn.classList.add('tiene-contenido');
        
    } catch (error) {
        console.error('Error cargando tarjetas:', error);
        galeria.innerHTML = '<p style="color:#ef4444; text-align:center;">Error al cargar tarjetas</p>';
    }
}

window.eliminarTarjeta = async function(docId, storagePath) {
    if (!confirm('¿Eliminar esta tarjeta?')) return;
    
    try {
        try {
            const storageRef = ref(storage, storagePath);
            await deleteObject(storageRef);
        } catch (e) {
            console.warn('No se pudo eliminar de Storage:', e);
        }
        
        await deleteDoc(doc(db, `usuarios/${currentUser.uid}/tarjetas`, docId));
        await cargarTarjetas();
        
    } catch (error) {
        console.error('Error eliminando tarjeta:', error);
        alert('❌ Error al eliminar la tarjeta');
    }
};

window.ampliarTarjeta = function(url) {
    const overlay = document.createElement('div');
    overlay.className = 'tarjeta-overlay';
    overlay.innerHTML = `
        <div class="tarjeta-ampliada-container">
            <button class="btn-cerrar-tarjeta" onclick="this.parentElement.parentElement.remove()">✕</button>
            <img src="${url}" class="tarjeta-ampliada-img">
        </div>
    `;
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
};
