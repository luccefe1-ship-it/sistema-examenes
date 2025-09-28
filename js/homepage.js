import { auth, db } from './firebase-config.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Elementos del DOM
const userNameSpan = document.getElementById('userName');
const logoutBtn = document.getElementById('logoutBtn');
const saludoHorario = document.getElementById('saludoHorario');
const fraseMotivaional = document.getElementById('fraseMotivaional');
const iconoHora = document.getElementById('iconoHora');

// Variable para almacenar el nombre del usuario
let nombreUsuario = '';

// Variables para planning (necesarias para objetivos semanales)
let planningGuardado = null;
let planningTracker = {
    semanaActiva: null,
    paginasInicio: 0,
    testsInicio: 0,
    fechaInicioSemana: null
};
let currentUser = null;

// Frases motivacionales dinámicas
const frasesMotivaionales = [
    "¿qué tal va todo?",
    "vamos por ello",
    "sigamos avanzando",
    "a por todas",
    "hoy es un gran día",
    "dale caña al estudio",
    "vamos a conseguirlo",
    "paso a paso llegamos lejos",
    "cada día más cerca",
    "tú puedes con todo",
    "la constancia es la clave",
    "otro día, otra oportunidad"
];

// Función para actualizar icono según la hora
function actualizarIconoHora() {
    const ahora = new Date();
    const hora = ahora.getHours();
    
    if (iconoHora) {
        // Limpiar clases anteriores
        iconoHora.className = 'icono-hora';
        
        if (hora >= 6 && hora < 18) {
            // Día: Sol amarillo brillante
            iconoHora.textContent = '☀️';
            iconoHora.classList.add('manana');
        } else if (hora >= 18 && hora < 21) {
            // Tarde: Sol naranja  
iconoHora.textContent = '☀️';
            iconoHora.classList.add('tarde');
        } else {
            // Noche: Luna
            iconoHora.textContent = '🌙';
            iconoHora.classList.add('noche');
        }
    }
}

// Función para actualizar el fondo según la hora
function actualizarFondoHora() {
    const ahora = new Date();
    const hora = ahora.getHours();
    const body = document.body;
    
    // Limpiar clases anteriores
    body.classList.remove('dia', 'tarde', 'noche');
    
    if (hora >= 6 && hora < 18) {
        // Día (6:00 - 18:00) - Fondo claro
        body.classList.add('dia');
    } else if (hora >= 18 && hora < 21) {
        // Tarde (18:00 - 21:00) - Fondo actual
        body.classList.add('tarde');
    } else {
        // Noche (21:00 - 6:00) - Fondo oscuro
        body.classList.add('noche');
    }
}

// Función para obtener saludo según la hora CON EL NOMBRE DEL USUARIO
function obtenerSaludoPorHorario() {
    const ahora = new Date();
    const hora = ahora.getHours();
    
    let saludo = '';
    if (hora >= 6 && hora < 12) {
        saludo = "Buenos días";
    } else if (hora >= 12 && hora < 20) {
        saludo = "Buenas tardes";
    } else {
        saludo = "Buenas noches";
    }
    
    // Añadir el nombre del usuario si está disponible
    if (nombreUsuario) {
        return `${saludo}, ${nombreUsuario}`;
    } else {
        return saludo;
    }
}

// Función para obtener frase motivacional aleatoria
function obtenerFraseMotivaionalAleatoria() {
    const indiceAleatorio = Math.floor(Math.random() * frasesMotivaionales.length);
    return frasesMotivaionales[indiceAleatorio];
}

// Función para actualizar saludo dinámico
function actualizarSaludoDinamico() {
    if (saludoHorario && fraseMotivaional) {
        saludoHorario.textContent = obtenerSaludoPorHorario();
        fraseMotivaional.textContent = obtenerFraseMotivaionalAleatoria();
    }
    
    // Actualizar el icono y el fondo también
    actualizarIconoHora();
    actualizarFondoHora();
}

// Función para cambiar la frase motivacional cada cierto tiempo
function iniciarCambioFrasesPeriodico() {
    // Cambiar frase cada 15 segundos
    setInterval(() => {
        if (fraseMotivaional) {
            // Efecto de transición suave
            fraseMotivaional.style.opacity = '0';
            
            setTimeout(() => {
                fraseMotivaional.textContent = obtenerFraseMotivaionalAleatoria();
                fraseMotivaional.style.opacity = '1';
            }, 300);
        }
    }, 15000);
}

// Verificar autenticación
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        // Usuario logueado, cargar datos
        try {
            const userDoc = await getDoc(doc(db, "usuarios", user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                nombreUsuario = userData.nombre; // Guardar el nombre del usuario
                userNameSpan.textContent = userData.nombre;
            } else {
                // Si no hay documento de usuario, usar el email como nombre
                nombreUsuario = user.email.split('@')[0]; // Usar la parte antes del @
                userNameSpan.textContent = user.email;
            }
        } catch (error) {
            console.error('Error cargando datos:', error);
            nombreUsuario = user.email.split('@')[0]; // Fallback al email
            userNameSpan.textContent = user.email;
        }
        
        // Inicializar saludo dinámico DESPUÉS de cargar el nombre del usuario
        actualizarSaludoDinamico();
        iniciarCambioFrasesPeriodico();
        
        // Cargar objetivos semanales
        console.log('Iniciando carga de objetivos...');
        cargarObjetivosSemana();
        
    } else {
        // Usuario no logueado, redirigir al login
        window.location.href = 'index.html';
    }
});

// Manejar logout
logoutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Error al cerrar sesión:', error);
        alert('Error al cerrar sesión');
    }
});

// Manejar botón de perfil (NUEVO)
document.addEventListener('DOMContentLoaded', () => {
    // Agregar transición suave a la frase motivacional
    if (fraseMotivaional) {
        fraseMotivaional.style.transition = 'opacity 0.3s ease-in-out';
    }
    
    // Event listener para botón de perfil
    const profileBtn = document.getElementById('profileBtn');
    if (profileBtn) {
        profileBtn.addEventListener('click', () => {
            window.location.href = './perfil.html';
        });
    }
    
    // APLICAR FONDO INMEDIATAMENTE AL CARGAR
    actualizarFondoHora();
    console.log('Fondo aplicado en DOMContentLoaded:', document.body.className);
    
});

// Función para cargar y mostrar objetivos semanales
async function cargarObjetivosSemana() {
    try {
        console.log('Cargando objetivos semanales...');
        const user = auth.currentUser;
        if (!user) {
            console.log('No hay usuario logueado');
            return;
        }
        
        // Verificar semanas vencidas antes de mostrar los objetivos
        await verificarSemanasVencidas();
        
        // Buscar planning guardado
        const planningDoc = await getDoc(doc(db, "planning", user.uid));
        
        if (!planningDoc.exists()) {
            // No hay planning - mostrar propuesta
            console.log('No hay planning, mostrando propuesta...');
            mostrarPropuestaPlanning();
            return;
        }

        planningGuardado = planningDoc.data();
        
        // Buscar semana activa
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        
        const semanaActiva = planningGuardado.semanas?.find(semana => {
            const fechaInicio = semana.fechaInicio?.toDate ? semana.fechaInicio.toDate() : new Date(semana.fechaInicio);
            const fechaFin = semana.fechaFin?.toDate ? semana.fechaFin.toDate() : new Date(semana.fechaFin);
            
            fechaInicio.setHours(0, 0, 0, 0);
            fechaFin.setHours(23, 59, 59, 999);
            
            return hoy >= fechaInicio && hoy <= fechaFin && semana.estado === 'pendiente';
        });

        if (semanaActiva) {
            await mostrarObjetivosSemana(semanaActiva);
        }

    } catch (error) {
        console.error('Error cargando objetivos:', error);
    }
}
// Función para obtener los mismos datos automáticos que se muestran en el modal de reportar
async function obtenerDatosAutomaticosSemana(semana) {
    try {
        const user = auth.currentUser;
        if (!user) return { paginas: 0, tests: 0 };

        // Si es la semana activa y tiene datos de inicio configurados
        if (semana.datosInicioSemana && semana.datosInicioSemana.inicializado) {
            // Cargar progreso actual
            const progresoDoc = await getDoc(doc(db, "progreso", user.uid));
            if (!progresoDoc.exists()) return { paginas: 0, tests: 0 };

            const progresoData = progresoDoc.data();
            if (!progresoData.temas) return { paginas: 0, tests: 0 };

            // Calcular totales actuales
            let paginasActuales = 0;
            let testsActuales = 0;

            Object.values(progresoData.temas).forEach(tema => {
                const vueltasCompletadas = tema.vueltas ? tema.vueltas.filter(v => v.completada).length : 0;
                paginasActuales += (vueltasCompletadas * tema.paginasTotales) + (tema.paginasEstudiadas || 0);
                testsActuales += (tema.testsAutomaticos || 0) + (tema.testsManuales || 0);
            });

            // Calcular diferencia desde inicio de semana
            const paginasProgreso = Math.max(0, paginasActuales - semana.datosInicioSemana.paginasIniciales);
            const testsProgreso = Math.max(0, testsActuales - semana.datosInicioSemana.testsIniciales);

            return { paginas: paginasProgreso, tests: testsProgreso };
        }

        // Si no hay datos de inicio, usar datos reportados manualmente
        return { paginas: semana.paginasReales || 0, tests: semana.testsReales || 0 };

    } catch (error) {
        console.error('Error obteniendo datos automáticos:', error);
        return { paginas: semana.paginasReales || 0, tests: semana.testsReales || 0 };
    }
}
async function mostrarObjetivosSemana(semana) {
    const contenedor = document.getElementById('objetivosSemana');
    const contenido = document.getElementById('objetivosContenido');
    
    if (!contenedor || !contenido) return;

    // Obtener los datos automáticos actuales (los mismos que aparecen en el modal de reportar)
    const datosAutomaticos = await obtenerDatosAutomaticosSemana(semana);
    const paginasRealizadas = datosAutomaticos.paginas;
    const testsRealizados = datosAutomaticos.tests;
    
    // Calcular lo que FALTA
    const paginasRestantes = Math.max(0, semana.objetivoPaginas - paginasRealizadas);
    const testsRestantes = Math.max(0, semana.objetivoTests - testsRealizados);
    
    // Calcular días restantes de la semana
    const hoy = new Date();
    const fechaFin = semana.fechaFin?.toDate ? semana.fechaFin.toDate() : new Date(semana.fechaFin);
    const diasRestantes = Math.max(0, Math.ceil((fechaFin - hoy) / (1000 * 60 * 60 * 24)));

    if (paginasRestantes === 0 && testsRestantes === 0) {
        // Ya cumplió todo
        contenido.innerHTML = `
            <div class="objetivos-mensaje">
                ¡Felicidades! Ya cumpliste todos los objetivos de esta semana 🎉
            </div>
        `;
    } else {
        // Mostrar objetivos pendientes con días restantes
        contenido.innerHTML = `
            <div class="objetivo-item">
                <div class="objetivo-numero">${paginasRestantes}</div>
                <div class="objetivo-texto">páginas restantes</div>
            </div>
            <div class="objetivo-item">
                <div class="objetivo-numero">${testsRestantes}</div>
                <div class="objetivo-texto">tests restantes</div>
            </div>
            <div class="objetivo-item">
                <div class="objetivo-numero">${diasRestantes}</div>
                <div class="objetivo-texto">días restantes</div>
            </div>
        `;
    }
    
    contenedor.style.display = 'block';
}

function mostrarPropuestaPlanning() {
    console.log('Ejecutando mostrarPropuestaPlanning...');
    const contenedor = document.getElementById('objetivosSemana');
    const titulo = document.getElementById('objetivosTitulo');
    const contenido = document.getElementById('objetivosContenido');
    
    console.log('Elementos encontrados:', { contenedor, titulo, contenido });
    
    if (!contenedor || !titulo || !contenido) {
        console.log('Error: No se encontraron los elementos necesarios');
        return;
    }

    titulo.textContent = '📅 ¡Organiza tu estudio!';
    contenido.innerHTML = `
        <div class="objetivos-mensaje">
            Crea un planning de estudio para establecer objetivos semanales y hacer seguimiento de tu progreso
        </div>
        <div class="objetivos-propuesta">
            <button class="btn-crear-planning" onclick="window.location.href='Progreso.html'">
                Crear Planning de Estudio
            </button>
        </div>
    `;
    
    contenedor.style.display = 'block';
}

// Actualizar saludo cada minuto por si cambia la hora
setInterval(() => {
    if (saludoHorario) {
        const nuevoSaludo = obtenerSaludoPorHorario();
        if (saludoHorario.textContent !== nuevoSaludo) {
            saludoHorario.textContent = nuevoSaludo;
            actualizarIconoHora(); // También actualizar el icono
            actualizarFondoHora(); // También actualizar el fondo
        }
    }
}, 60000); // 1 minuto
// Función para verificar semanas vencidas automáticamente
async function verificarSemanasVencidas() {
    try {
        const planningDoc = await getDoc(doc(db, "planning", currentUser.uid));
        
        if (!planningDoc.exists()) return;
        
        const planningData = planningDoc.data();
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        
        let huboSemanaVencida = false;
        
        for (const semana of planningData.semanas) {
            if (semana.estado === 'pendiente') {
                const fechaFin = semana.fechaFin?.toDate ? semana.fechaFin.toDate() : new Date(semana.fechaFin);
                fechaFin.setHours(23, 59, 59, 999);
                
                // Si la fecha fin ya pasó
                if (hoy > fechaFin) {
                    console.log(`Semana ${semana.numero} vencida, evaluando automáticamente...`);
                    
                    // Evaluar automáticamente la semana
                    const resultadoEvaluacion = await evaluarSemanaAutomaticamente(semana, planningData);
                    
                    // Actualizar estado de la semana
                    semana.estado = resultadoEvaluacion.estado;
                    semana.paginasReales = resultadoEvaluacion.paginasReales;
                    semana.testsReales = resultadoEvaluacion.testsReales;
                    semana.fechaReporte = new Date();
                    semana.evaluacionAutomatica = true;
                    
                    huboSemanaVencida = true;
                    
                    // Mostrar modal con resultado
                    mostrarModalResultadoSemana(semana, resultadoEvaluacion);
                }
            }
        }
        
        // Si hubo cambios, guardar el planning actualizado
        if (huboSemanaVencida) {
            planningData.ultimaActualizacion = new Date();
            await setDoc(doc(db, "planning", currentUser.uid), planningData);
        }
        
    } catch (error) {
        console.error('Error verificando semanas vencidas:', error);
    }
}

// Función para evaluar automáticamente una semana vencida
async function evaluarSemanaAutomaticamente(semana, planningData) {
    try {
        // Cargar progreso actual
        const progresoDoc = await getDoc(doc(db, "progreso", currentUser.uid));
        let progresoData = {};
        
        if (progresoDoc.exists()) {
            progresoData = progresoDoc.data();
        }
        
        // Calcular progreso real usando datos automáticos si están disponibles
        let paginasReales = 0;
        let testsReales = 0;
        
        if (semana.datosInicioSemana && semana.datosInicioSemana.inicializado && progresoData.temas) {
            // Calcular totales actuales
            let paginasActuales = 0;
            let testsActuales = 0;
            
            Object.values(progresoData.temas).forEach(tema => {
                const vueltasCompletadas = tema.vueltas ? tema.vueltas.filter(v => v.completada).length : 0;
                paginasActuales += (vueltasCompletadas * tema.paginasTotales) + (tema.paginasEstudiadas || 0);
                testsActuales += (tema.testsAutomaticos || 0) + (tema.testsManuales || 0);
            });
            
            // Calcular diferencia desde inicio de semana
            paginasReales = Math.max(0, paginasActuales - semana.datosInicioSemana.paginasIniciales);
            testsReales = Math.max(0, testsActuales - semana.datosInicioSemana.testsIniciales);
        }
        
        const paginasObjetivo = semana.objetivoPaginas;
        const testsObjetivo = semana.objetivoTests;
        
        // Determinar estado
        let estado = 'incumplido';
        
        const cumplioPaginas = paginasReales >= paginasObjetivo;
        const cumplioTests = testsReales >= testsObjetivo;
        
        if (cumplioPaginas && cumplioTests) {
            // Verificar si superó significativamente (20% más)
            const superoSignificativamentePaginas = paginasReales > paginasObjetivo * 1.2;
            const superoSignificativamenteTests = testsReales > testsObjetivo * 1.2;
            
            if (superoSignificativamentePaginas || superoSignificativamenteTests) {
                estado = 'superado';
            } else {
                estado = 'cumplido';
            }
        }
        
        return {
            estado,
            paginasReales,
            testsReales,
            paginasObjetivo,
            testsObjetivo
        };
        
    } catch (error) {
        console.error('Error evaluando semana automáticamente:', error);
        return {
            estado: 'incumplido',
            paginasReales: 0,
            testsReales: 0,
            paginasObjetivo: semana.objetivoPaginas,
            testsObjetivo: semana.objetivoTests
        };
    }
}

// Función para mostrar modal de resultado de semana
function mostrarModalResultadoSemana(semana, resultado) {
    // Actualizar contenido del modal
    document.getElementById('numeroSemanaModal').textContent = semana.numero;
    
    // Mostrar fechas de la semana
    const fechaInicio = semana.fechaInicio?.toDate ? semana.fechaInicio.toDate() : new Date(semana.fechaInicio);
    const fechaFin = semana.fechaFin?.toDate ? semana.fechaFin.toDate() : new Date(semana.fechaFin);
    
    document.getElementById('fechasSemanaModal').textContent = 
        `${fechaInicio.toLocaleDateString('es-ES')} - ${fechaFin.toLocaleDateString('es-ES')}`;
    
    // Resultado principal
    let estadoTexto = '';
    let estadoClass = '';
    let icono = '';
    
    if (resultado.estado === 'cumplido') {
        estadoTexto = '¡Objetivos cumplidos!';
        estadoClass = 'resultado-cumplido';
        icono = '✅';
    } else if (resultado.estado === 'superado') {
        estadoTexto = '¡Objetivos superados!';
        estadoClass = 'resultado-superado';
        icono = '⭐';
    } else {
        estadoTexto = 'Objetivos no cumplidos';
        estadoClass = 'resultado-incumplido';
        icono = '❌';
    }
    
    document.getElementById('resultadoTextoModal').textContent = `${icono} ${estadoTexto}`;
    document.getElementById('resultadoTextoModal').className = `resultado-principal ${estadoClass}`;
    
    // Detalles de páginas y tests
    document.getElementById('detallesPaginasModal').innerHTML = `
        <strong>Páginas:</strong> ${resultado.paginasReales}/${resultado.paginasObjetivo}
        ${resultado.paginasReales >= resultado.paginasObjetivo ? '✅' : '❌'}
    `;
    
    document.getElementById('detallesTestsModal').innerHTML = `
        <strong>Tests:</strong> ${resultado.testsReales}/${resultado.testsObjetivo}
        ${resultado.testsReales >= resultado.testsObjetivo ? '✅' : '❌'}
    `;
    
    // Mostrar modal
    document.getElementById('modalResultadoSemana').style.display = 'block';
}

// Función para cerrar modal de resultado
function cerrarModalResultado() {
    document.getElementById('modalResultadoSemana').style.display = 'none';
}

// Hacer función accesible globalmente
window.cerrarModalResultado = cerrarModalResultado;
