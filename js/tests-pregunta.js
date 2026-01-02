import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    addDoc, 
    collection,
    doc,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
    
    // Mostrar nombre del test
    document.getElementById('nombreTestPregunta').textContent = testConfig.nombreTest || 'Test';
    
    // Iniciar cronómetro si hay tiempo límite
    if (testConfig.tiempoLimite && testConfig.tiempoLimite !== 'sin') {
        const minutos = parseInt(testConfig.tiempoLimite);
        iniciarCronometro(minutos * 60);
    }
    
    // Cargar primera pregunta
    mostrarPregunta();
    
    // Inicializar estadísticas
    actualizarEstadisticas();
}
function actualizarEstadisticas() {
    const total = testConfig.preguntas.length;
    const correctas = respuestas.filter(r => r.esCorrecta).length;
    const incorrectas = respuestas.filter(r => !r.esCorrecta).length;
    const sinResponder = total - respuestas.length;
    
    // Actualizar totales
    document.getElementById('statTotalCorrectas').textContent = total;
    document.getElementById('statTotalIncorrectas').textContent = total;
    document.getElementById('statTotalSinResponder').textContent = total;
    
    // Actualizar contadores
    document.getElementById('statCorrectas').textContent = correctas;
    document.getElementById('statIncorrectas').textContent = incorrectas;
    document.getElementById('statSinResponder').textContent = sinResponder;
}
function mostrarPregunta() {
    if (preguntaActual >= testConfig.preguntas.length) {
        finalizarTest();
        return;
    }
    
    const pregunta = testConfig.preguntas[preguntaActual];
    
    // Actualizar contador
    document.getElementById('contadorPregunta').textContent = 
        `Pregunta ${preguntaActual + 1} de ${testConfig.preguntas.length}`;
    
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
    
    // Mostrar/ocultar botón anterior
    const btnAnterior = document.getElementById('btnAnterior');
    if (preguntaActual > 0) {
        btnAnterior.classList.add('mostrar');
    } else {
        btnAnterior.classList.remove('mostrar');
    }
    
    // Ocultar feedback y botón siguiente si no hay respuesta previa
    const feedbackContainer = document.getElementById('feedbackContainer');
    if (!respuestaPrevia) {
        feedbackContainer.classList.remove('mostrar', 'correcto', 'incorrecto');
        document.getElementById('btnSiguiente').classList.remove('mostrar');
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
    
    if (respuestaPrevia.esCorrecta) {
        feedbackContainer.classList.add('correcto');
        feedbackTitulo.textContent = '✓ ¡Correcto!';
        feedbackTexto.textContent = 'Has seleccionado la respuesta correcta.';
    } else {
        feedbackContainer.classList.add('incorrecto');
        feedbackTitulo.textContent = '✗ Incorrecto';
        feedbackTexto.textContent = `La respuesta correcta es ${pregunta.respuestaCorrecta}`;
    }
    
    feedbackContainer.classList.add('mostrar');
    document.getElementById('btnSiguiente').classList.add('mostrar');
    
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
    
    if (esCorrecta) {
        feedbackContainer.classList.add('correcto');
        feedbackTitulo.textContent = '✓ ¡Correcto!';
        feedbackTexto.textContent = 'Has seleccionado la respuesta correcta.';
    } else {
        feedbackContainer.classList.add('incorrecto');
        feedbackTitulo.textContent = '✗ Incorrecto';
        feedbackTexto.textContent = `La respuesta correcta es ${pregunta.respuestaCorrecta}`;
    }
    
    feedbackContainer.classList.add('mostrar');
    document.getElementById('btnSiguiente').classList.add('mostrar');
    
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

// Función para registrar en progresoSimple
async function registrarTestEnProgresoSimple(temasUtilizados) {
    try {
        console.log('=== REGISTRANDO TEST EN PROGRESO SIMPLE (PREGUNTA A PREGUNTA) ===');
        console.log('Temas a registrar:', temasUtilizados);
        
        const progresoRef = doc(db, "progresoSimple", currentUser.uid);
        let progresoDoc = await getDoc(progresoRef);
        
        if (!progresoDoc.exists()) {
            console.log('No existe progresoSimple, no se puede registrar');
            return;
        }
        
        let progresoData = progresoDoc.data();
        
        if (!progresoData.temas) progresoData.temas = {};
        if (!progresoData.registros) progresoData.registros = [];
        
        const esMix = temasUtilizados.length > 1;
        const fechaHoy = new Date();
        
        if (esMix) {
            for (const temaId of temasUtilizados) {
                if (progresoData.temas[temaId]) {
                    progresoData.temas[temaId].testsRealizados = (progresoData.temas[temaId].testsRealizados || 0) + 1;
                }
            }
            
            progresoData.registros.push({
                fecha: fechaHoy,
                temaId: 'mix',
                hojasLeidas: 0,
                testsRealizados: 1,
                temasMix: temasUtilizados
            });
            
        } else {
            const temaId = temasUtilizados[0];
            
            if (progresoData.temas[temaId]) {
                progresoData.temas[temaId].testsRealizados = (progresoData.temas[temaId].testsRealizados || 0) + 1;
            }
            
            progresoData.registros.push({
                fecha: fechaHoy,
                temaId: temaId,
                hojasLeidas: 0,
                testsRealizados: 1
            });
        }
        
        await setDoc(progresoRef, progresoData);
        
        console.log('✅ Test registrado en progresoSimple');
        console.log('=====================================');
        
    } catch (error) {
        console.error('❌ Error registrando test en progresoSimple:', error);
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
        
        return {
            pregunta: {
                texto: pregunta.texto || '',
                opciones: pregunta.opciones || [],
                temaId: pregunta.temaId || '',
                temaNombre: pregunta.temaNombre || '',
                temaEpigrafe: pregunta.temaEpigrafe || ''
            },
            respuestaUsuario: respuestaLetra,
            respuestaCorrecta: pregunta.respuestaCorrecta,
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
        
        // Guardar preguntas falladas para el test de repaso
        const preguntasFalladas = detalleRespuestas.filter(detalle => 
            detalle.estado === 'incorrecta' || detalle.estado === 'sin-respuesta'
        );

        if (preguntasFalladas.length > 0) {
            const promesasGuardado = preguntasFalladas.map(async (detalle) => {
                const preguntaFallada = {
                    usuarioId: currentUser.uid,
                    pregunta: {
                        texto: detalle.pregunta.texto,
                        opciones: detalle.pregunta.opciones,
                        respuestaCorrecta: detalle.respuestaCorrecta,
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
        const temasUtilizados = [...new Set(testConfig.preguntas.map(p => p.temaId || p.temaIdProgreso).filter(Boolean))];
        if (temasUtilizados.length > 0) {
            await registrarTestEnProgresoSimple(temasUtilizados);
        }
        
    } catch (error) {
        console.error('Error guardando resultado:', error);
    }
    
    // Limpiar localStorage de config
    localStorage.removeItem('testConfig');
    
    // Guardar resultados temporalmente para mostrarlos inmediatamente
    localStorage.setItem('ultimosResultados', JSON.stringify(resultadosCompletos));
    
    // Redirigir a tests.html con parámetros para mostrar resultados
    window.location.href = 'tests.html?section=resultados&mostrar=ultimo';
}
