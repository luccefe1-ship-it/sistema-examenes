import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    addDoc, 
    collection
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
    const configStr = localStorage.getItem('testConfig');
    
    if (!configStr) {
        alert('No hay configuración de test disponible');
        window.location.href = 'tests.html?section=aleatorio';
        return;
    }
    
    testConfig = JSON.parse(configStr);
    
    // Mostrar nombre del test
    document.getElementById('nombreTestPregunta').textContent = testConfig.nombreTest || 'Test';
    
    // Cargar primera pregunta
    mostrarPregunta();
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
    
    // Ocultar feedback y botón siguiente
    const feedbackContainer = document.getElementById('feedbackContainer');
    feedbackContainer.classList.remove('mostrar', 'correcto', 'incorrecto');
    document.getElementById('btnSiguiente').classList.remove('mostrar');
}

function seleccionarRespuesta(letraSeleccionada) {
    const pregunta = testConfig.preguntas[preguntaActual];
    const esCorrecta = letraSeleccionada === pregunta.respuestaCorrecta;
    
    // Guardar respuesta
    respuestas.push({
        preguntaIndex: preguntaActual,
        respuestaUsuario: letraSeleccionada,
        respuestaCorrecta: pregunta.respuestaCorrecta,
        esCorrecta: esCorrecta,
        pregunta: pregunta
    });
    
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
}

window.siguientePregunta = function() {
    preguntaActual++;
    mostrarPregunta();
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
async function finalizarTest() {
    // Calcular resultados
    const correctas = respuestas.filter(r => r.esCorrecta).length;
    const total = testConfig.preguntas.length;
    const incorrectas = respuestas.length - correctas;
    const sinResponder = total - respuestas.length;
    
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
            pregunta: pregunta,
            respuestaUsuario: respuestaLetra,
            respuestaCorrecta: pregunta.respuestaCorrecta,
            estado: estado,
            indice: index + 1
        };
    });
    
    const porcentaje = Math.round((correctas / total) * 100);
    
    // Crear objeto de resultados completo
    const resultadosCompletos = {
        correctas: correctas,
        incorrectas: incorrectas,
        sinResponder: sinResponder,
        total: total,
        porcentaje: porcentaje,
        tiempoEmpleado: 0,
        test: {
            id: generarIdTest(),
            nombre: testConfig.nombreTest,
            tema: testConfig.temas,
            fechaInicio: new Date()
        },
        detalleRespuestas: detalleRespuestas,
        fechaCreacion: new Date(),
        usuarioId: currentUser.uid
    };
    
    // Guardar en Firebase
    try {
        await addDoc(collection(db, "resultados"), resultadosCompletos);
        console.log('Resultados guardados en Firebase');
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

function generarIdTest() {
    return 'test_' + new Date().getTime() + '_' + Math.random().toString(36).substr(2, 9);
}
