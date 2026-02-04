import { auth, db } from './firebase-config.js';
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

function cargarConfiguracion() {
    const configStr = localStorage.getItem('testConfig');
    
    if (!configStr) {
        alert('No hay configuración de test disponible');
        window.location.href = 'tests.html?section=aleatorio';
        return;
    }
    
    testConfig = JSON.parse(configStr);
    
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
    
    // Mostrar texto de la pregunta
    document.getElementById('textoPreguntaGrande').textContent = pregunta.texto;
    
    // Generar opciones
    const opcionesContainer = document.getElementById('opcionesLista');
    opcionesContainer.innerHTML = '';
    
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
    
    // Ocultar feedback y botón siguiente si no hay respuesta previa
    const feedbackContainer = document.getElementById('feedbackContainer');
    if (!respuestaPrevia) {
        feedbackContainer.classList.remove('mostrar', 'correcto', 'incorrecto');
        document.getElementById('btnSiguiente').classList.remove('mostrar');
        document.getElementById('btnVerExplicacion').classList.remove('mostrar');
        // Cerrar panel de explicación si estaba abierto
        document.getElementById('explicacionPanel').classList.remove('activa');
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

        // Si es test de ranking, guardar preguntas acertadas como "dominadas" (ocultas del ranking pero sin borrar historial)
        if (testConfig.esRanking) {
            const preguntasAcertadas = detalleRespuestas.filter(detalle => 
                detalle.estado === 'correcta'
            );
            
            if (preguntasAcertadas.length > 0) {
                console.log(`Guardando ${preguntasAcertadas.length} preguntas como dominadas...`);
                
                // Obtener o crear documento de preguntas dominadas
                const dominadasRef = doc(db, "preguntasDominadas", currentUser.uid);
                const dominadasDoc = await getDoc(dominadasRef);
                
                let preguntasDominadas = [];
                if (dominadasDoc.exists()) {
                    preguntasDominadas = dominadasDoc.data().preguntas || [];
                }
                
                // Añadir las nuevas preguntas acertadas
                preguntasAcertadas.forEach(acertada => {
                    const textoNormalizado = acertada.pregunta.texto.trim();
                    if (!preguntasDominadas.includes(textoNormalizado)) {
                        preguntasDominadas.push(textoNormalizado);
                    }
                });
                
                // Guardar
                await setDoc(dominadasRef, { 
                    preguntas: preguntasDominadas,
                    ultimaActualizacion: new Date()
                });
                
                console.log(`${preguntasAcertadas.length} preguntas marcadas como dominadas (ocultas del ranking)`);
            }
            
            console.log('Test de ranking finalizado.');
        }

        // Guardar preguntas falladas para el test de repaso (excepto si ya es test de ranking)
        const preguntasFalladas = detalleRespuestas.filter(detalle => 
            detalle.estado === 'incorrecta'
        );

        // Si NO es test de ranking y hay fallos, verificar si alguna estaba "dominada" y quitarla
        if (preguntasFalladas.length > 0 && !testConfig.esRanking) {
            // Quitar de dominadas las preguntas que se han vuelto a fallar
            try {
                const dominadasRef = doc(db, "preguntasDominadas", currentUser.uid);
                const dominadasDoc = await getDoc(dominadasRef);
                
                if (dominadasDoc.exists()) {
                    let preguntasDominadas = dominadasDoc.data().preguntas || [];
                    const cantidadAntes = preguntasDominadas.length;
                    
                    // Filtrar: quitar las que se han fallado de nuevo
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
    
    // Buscar contexto
    await cargarExplicacion();
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
    
    // Cargar subrayados previos si existen
    const subrayados = await cargarSubrayadosPrevios(preguntaId);
    
    let textoMostrar;
    let mensajeInfo;
    
    if (subrayados) {
        // Si hay subrayados guardados, mostrarlos
        textoMostrar = subrayados;
        mensajeInfo = '✅ Mostrando tus subrayados guardados';
    } else {
        // Si no hay subrayados, mostrar documento completo con contexto resaltado
        textoMostrar = documentoCompleto;
        mensajeInfo = '✅ Contexto encontrado - Puedes hacer scroll por todo el documento';
        
        // Intentar resaltar el contexto encontrado
        const contextoTexto = contexto.replace(/<[^>]*>/g, ''); // Quitar HTML
        const indice = textoMostrar.toLowerCase().indexOf(contextoTexto.toLowerCase());
        
        if (indice !== -1) {
            const inicio = textoMostrar.substring(0, indice);
            const medio = textoMostrar.substring(indice, indice + contextoTexto.length);
            const fin = textoMostrar.substring(indice + contextoTexto.length);
            
            textoMostrar = inicio + '<span id="contextoEncontrado" class="contexto-resaltado">' + medio + '</span>' + fin;
        }
    }
    
    contenido.innerHTML = `
        <div class="contexto-encontrado-header">
            <p class="contexto-info">${mensajeInfo}</p>
            
            <!-- Buscador de texto -->
            <div class="buscador-texto">
                <input type="text" id="buscadorInput" placeholder="🔍 Buscar texto en el documento..." class="input-buscador">
                <button onclick="buscarEnTexto()" class="btn-buscar">Buscar</button>
                <button onclick="limpiarBusqueda()" class="btn-limpiar-busqueda">Limpiar</button>
            </div>
        </div>
        <div class="explicacion-texto contexto-automatico documento-scroll" id="textoExplicacion" data-texto-original="${documentoCompleto.replace(/"/g, '&quot;')}" data-pregunta-id="${preguntaId}">
            ${textoMostrar.replace(/\n/g, '<br>')}
        </div>
    `;
    
    // Scroll automático al contexto encontrado o al subrayado
    setTimeout(() => {
        const elemento = document.getElementById('contextoEncontrado') || document.querySelector('.subrayado');
        if (elemento) {
            elemento.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 100);
    
    // Mostrar botones de subrayado
    const accionesDiv = document.querySelector('.explicacion-acciones');
    accionesDiv.innerHTML = `
        <button class="btn-subrayar" onclick="habilitarSubrayado()">✏️ Subrayar</button>
        <button class="btn-borrar-subrayado" onclick="borrarSubrayado()">🗑️ Borrar Subrayado</button>
        <button class="btn-guardar-subrayado" onclick="guardarSubrayado()" style="display:none;">💾 Guardar Subrayado</button>
    `;
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
                    <button onclick="limpiarBusqueda()" class="btn-limpiar-busqueda">Limpiar</button>
                </div>
            </div>
            <div class="explicacion-texto documento-completo" id="textoExplicacion" data-texto-original="${documento.textoExtraido.replace(/"/g, '&quot;')}">
                ${textoMostrar.replace(/\n/g, '<br>')}
            </div>
        `;
        
        // Mostrar botones de subrayado y borrado
        const accionesDiv = document.querySelector('.explicacion-acciones');
        accionesDiv.innerHTML = `
            <button class="btn-subrayar" onclick="habilitarSubrayado()">✏️ Subrayar</button>
            <button class="btn-borrar-subrayado" onclick="borrarSubrayado()">🗑️ Borrar Subrayado</button>
            <button class="btn-guardar-subrayado" onclick="guardarSubrayado()" style="display:none;">💾 Guardar Subrayado</button>
        `;
        
    } catch (error) {
        console.error('Error abriendo tema completo:', error);
        alert('Error al cargar el documento');
    }
};


window.limpiarBusqueda = async function() {
    const input = document.getElementById('buscadorInput');
    const textoExplicacion = document.getElementById('textoExplicacion');
    
    input.value = '';
    
    // Recargar la explicación completa
    await cargarExplicacion();
};
window.buscarEnTexto = function() {
    const input = document.getElementById('buscadorInput');
    const textoExplicacion = document.getElementById('textoExplicacion');
    const textoBuscar = input.value.trim();
    
    if (!textoBuscar) {
        alert('Escribe algo para buscar');
        return;
    }
    
    // Restaurar texto original primero
    const textoOriginal = textoExplicacion.dataset.textoOriginal;
    
    // Escapar caracteres especiales para regex
    const textoEscapado = textoBuscar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(textoEscapado, 'gi');
    
    // Contar coincidencias
    const matches = textoOriginal.match(regex);
    
    if (!matches || matches.length === 0) {
        alert('No se encontraron coincidencias');
        return;
    }
    
    // Resaltar todas las coincidencias
    let contador = 0;
    let textoResaltado = textoOriginal.replace(regex, (match) => {
        contador++;
        const id = contador === 1 ? ' id="primeraCoincidencia"' : '';
        return `<mark${id} class="busqueda-highlight">${match}</mark>`;
    });
    
    textoExplicacion.innerHTML = textoResaltado.replace(/\n/g, '<br>');
    
    // Scroll a la primera coincidencia
    setTimeout(() => {
        const primeraCoincidencia = document.getElementById('primeraCoincidencia');
        if (primeraCoincidencia) {
            primeraCoincidencia.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 100);
    
    alert(`Se encontraron ${matches.length} coincidencias`);
};
window.borrarSubrayado = async function() {
    if (!confirm('¿Eliminar todos los subrayados guardados para esta pregunta?')) {
        return;
    }
    
    try {
        const pregunta = testConfig.preguntas[preguntaActual];
        const preguntaTexto = pregunta.texto || pregunta.pregunta || '';
        const preguntaId = preguntaTexto.substring(0, 50).replace(/[^a-zA-Z0-9]/g, '_');
        
        console.log('Borrando subrayado para pregunta:', preguntaId);
        
        const subrayadoRef = doc(db, 'subrayados', `${currentUser.uid}_${preguntaId}`);
        await deleteDoc(subrayadoRef);
        
        console.log('Subrayado eliminado');
        
        // Recargar explicación sin subrayados
        await cargarExplicacion();
        
        alert('✅ Subrayados eliminados');
    } catch (error) {
        console.error('Error borrando subrayado:', error);
        if (error.code === 'not-found') {
            alert('No hay subrayados guardados para esta pregunta');
        } else {
            alert('Error al borrar los subrayados');
        }
    }
};

window.habilitarSubrayado = function() {
    const textoExplicacion = document.getElementById('textoExplicacion');
    const btnSubrayar = document.querySelector('.btn-subrayar');
    const btnGuardar = document.querySelector('.btn-guardar-subrayado');
    
    if (!textoExplicacion) return;
    
    textoExplicacion.classList.add('modo-subrayar');
    btnSubrayar.style.display = 'none';
    btnGuardar.style.display = 'inline-block';
    
    // Permitir selección de texto
    document.addEventListener('mouseup', marcarSeleccion);
};

function marcarSeleccion() {
    const selection = window.getSelection();
    if (selection.toString().length === 0) return;
    
    const range = selection.getRangeAt(0);
    const span = document.createElement('span');
    span.className = 'subrayado';
    
    try {
        range.surroundContents(span);
    } catch (e) {
        console.log('No se puede subrayar fragmentos complejos');
    }
    
    selection.removeAllRanges();
}

window.guardarSubrayado = async function() {
    const textoExplicacion = document.getElementById('textoExplicacion');
    const btnSubrayar = document.querySelector('.btn-subrayar');
    const btnGuardar = document.querySelector('.btn-guardar-subrayado');
    const pregunta = testConfig.preguntas[preguntaActual];
    
    if (!textoExplicacion || !btnSubrayar || !btnGuardar) {
        console.error('Elementos no encontrados');
        return;
    }
    
    // Remover event listener
    document.removeEventListener('mouseup', marcarSeleccion);
    
    textoExplicacion.classList.remove('modo-subrayar');
    btnSubrayar.style.display = 'inline-block';
    btnGuardar.style.display = 'none';
    
    // Obtener texto subrayado
    const subrayados = [];
    const elementos = textoExplicacion.querySelectorAll('.subrayado');
    elementos.forEach(el => {
        subrayados.push(el.textContent);
    });
    
    if (subrayados.length === 0) {
        alert('No has subrayado ningún texto');
        return;
    }
    
    try {
        // Generar ID único para la pregunta
        const preguntaTexto = pregunta.texto || pregunta.pregunta || '';
        const preguntaId = preguntaTexto.substring(0, 50).replace(/[^a-zA-Z0-9]/g, '_');
        
        console.log('Guardando subrayado para pregunta:', preguntaId);
        
        // Guardar en Firestore
        const subrayadoRef = doc(db, 'subrayados', `${currentUser.uid}_${preguntaId}`);
        await setDoc(subrayadoRef, {
            usuarioId: currentUser.uid,
            preguntaId: preguntaId,
            preguntaTexto: preguntaTexto,
            temaId: pregunta.temaId || '',
            subrayados: subrayados,
            htmlCompleto: textoExplicacion.innerHTML,
            fechaGuardado: new Date()
        });
        
        console.log('Subrayado guardado correctamente');
        alert('✅ Subrayado guardado correctamente');
    } catch (error) {
        console.error('Error guardando subrayado:', error);
        alert('Error al guardar el subrayado: ' + error.message);
    }
};

async function cargarSubrayadosPrevios(preguntaId) {
    try {
        const pregunta = testConfig.preguntas[preguntaActual];
        const preguntaTexto = pregunta.texto || pregunta.pregunta || '';
        const preguntaIdGenerado = preguntaTexto.substring(0, 50).replace(/[^a-zA-Z0-9]/g, '_');
        
        console.log('Buscando subrayados para:', preguntaIdGenerado);
        
        const subrayadoRef = doc(db, 'subrayados', `${currentUser.uid}_${preguntaIdGenerado}`);
        const subDoc = await getDoc(subrayadoRef);
        
        if (subDoc.exists()) {
            console.log('Subrayados encontrados');
            return subDoc.data().htmlCompleto;
        }
        
        console.log('No hay subrayados previos');
        return null;
    } catch (error) {
        console.error('Error cargando subrayados:', error);
        return null;
    }
}

function aplicarSubrayados(textoOriginal, htmlConSubrayados) {
    return htmlConSubrayados;
}
