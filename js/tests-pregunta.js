import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentUser = null;
let testConfig = null;
let preguntaActual = 0;
let respuestas = [];

// Verificar autenticación
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        cargarConfiguracion();
    } else {
        window.location.href = 'index.html';
    }
});

function cargarConfiguracion() {
    console.log('=== CARGAR CONFIGURACIÓN ===');
    
    // Cargar configuración desde localStorage
    const configStr = localStorage.getItem('testConfig');
    console.log('Config string:', configStr);
    
    if (!configStr) {
        alert('No hay configuración de test disponible');
        window.location.href = 'tests.html?section=aleatorio';
        return;
    }
    
    testConfig = JSON.parse(configStr);
    console.log('Test config cargado:', testConfig);
    
    // Mostrar nombre del test
    document.getElementById('nombreTestPregunta').textContent = testConfig.nombreTest || 'Test';
    
    // Cargar primera pregunta
    mostrarPregunta();
}

function mostrarPregunta() {
    console.log('=== MOSTRAR PREGUNTA ===');
    console.log('Pregunta actual:', preguntaActual);
    console.log('Total preguntas:', testConfig.preguntas.length);
    
    if (preguntaActual >= testConfig.preguntas.length) {
        finalizarTest();
        return;
    }
    
    const pregunta = testConfig.preguntas[preguntaActual];
    console.log('Pregunta a mostrar:', pregunta);
    
    // Actualizar contador
    document.getElementById('contadorPregunta').textContent = 
        `Pregunta ${preguntaActual + 1} de ${testConfig.preguntas.length}`;
    
    // Mostrar texto de la pregunta
    document.getElementById('textoPreguntaGrande').textContent = pregunta.texto;
    
    // Generar opciones
    const opcionesContainer = document.getElementById('opcionesGrandes');
    opcionesContainer.innerHTML = '';
    
    pregunta.opciones.forEach(opcion => {
        const opcionDiv = document.createElement('div');
        opcionDiv.className = 'opcion-grande';
        opcionDiv.innerHTML = `<strong>${opcion.letra})</strong> ${opcion.texto}`;
        opcionDiv.onclick = () => seleccionarRespuesta(opcion.letra);
        opcionesContainer.appendChild(opcionDiv);
    });
    
    // Ocultar feedback y botón siguiente
    document.getElementById('feedbackContainer').classList.remove('mostrar');
    document.getElementById('btnSiguiente').classList.remove('mostrar');
}

function seleccionarRespuesta(letraSeleccionada) {
    console.log('=== RESPUESTA SELECCIONADA ===');
    console.log('Letra:', letraSeleccionada);
    
    const pregunta = testConfig.preguntas[preguntaActual];
    const esCorrecta = letraSeleccionada === pregunta.respuestaCorrecta;
    
    console.log('Es correcta:', esCorrecta);
    console.log('Respuesta correcta:', pregunta.respuestaCorrecta);
    
    // Guardar respuesta
    respuestas.push({
        preguntaIndex: preguntaActual,
        respuestaUsuario: letraSeleccionada,
        esCorrecta: esCorrecta
    });
    
    // Deshabilitar todas las opciones
    const opciones = document.querySelectorAll('.opcion-grande');
    opciones.forEach(opcion => {
        opcion.classList.add('deshabilitada');
        opcion.onclick = null;
        
        // Obtener la letra de esta opción
        const letraOpcion = opcion.textContent.trim().charAt(0);
        
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
    const feedbackExplicacion = document.getElementById('feedbackExplicacion');
    
    if (esCorrecta) {
        feedbackTitulo.textContent = '✓ ¡Correcto!';
        feedbackExplicacion.textContent = 'Has seleccionado la respuesta correcta.';
    } else {
        feedbackTitulo.textContent = '✗ Incorrecto';
        feedbackExplicacion.textContent = `La respuesta correcta es ${pregunta.respuestaCorrecta}`;
    }
    
    feedbackContainer.classList.add('mostrar');
    document.getElementById('btnSiguiente').classList.add('mostrar');
}

window.siguientePregunta = function() {
    console.log('=== SIGUIENTE PREGUNTA ===');
    preguntaActual++;
    mostrarPregunta();
};

function finalizarTest() {
    console.log('=== FINALIZAR TEST ===');
    console.log('Respuestas:', respuestas);
    
    // Calcular resultados
    const correctas = respuestas.filter(r => r.esCorrecta).length;
    const incorrectas = respuestas.length - correctas;
    
    console.log('Correctas:', correctas);
    console.log('Incorrectas:', incorrectas);
    
    // Guardar resultados y redirigir
    localStorage.setItem('testResultados', JSON.stringify({
        correctas: correctas,
        incorrectas: incorrectas,
        total: testConfig.preguntas.length,
        respuestas: respuestas
    }));
    
    // Redirigir a pantalla de resultados
    window.location.href = 'tests.html?section=aleatorio&mostrar=resultados';
}
