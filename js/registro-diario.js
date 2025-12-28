import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;
let planningData = null;
let progresoData = null;

// Verificar autenticación
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        try {
            const userDoc = await getDoc(doc(db, "usuarios", user.uid));
            if (userDoc.exists()) {
                document.getElementById('userName').textContent = userDoc.data().nombre;
            }
            
            await cargarDatos();
            
        } catch (error) {
            console.error('Error:', error);
        }
    } else {
        window.location.href = 'index.html';
    }
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = 'index.html';
});

// Cargar datos
async function cargarDatos() {
    try {
        // Cargar planning
        const planningDoc = await getDoc(doc(db, "planningSimple", currentUser.uid));
        if (!planningDoc.exists()) {
            alert('No tienes un planning configurado');
            window.location.href = 'homepage.html';
            return;
        }
        planningData = planningDoc.data();
        
        // Cargar progreso
        const progresoDoc = await getDoc(doc(db, "progresoSimple", currentUser.uid));
        if (progresoDoc.exists()) {
            progresoData = progresoDoc.data();
        } else {
            progresoData = { temas: {}, registros: [] };
        }
        
        generarRegistroDiario();
        
    } catch (error) {
        console.error('Error cargando datos:', error);
    }
}

// Generar registro diario
function generarRegistroDiario() {
    const container = document.getElementById('listaRegistros');
    container.innerHTML = '';
    
    // Fecha inicial: cuando se creó el planning
    const fechaInicio = planningData.fechaCreacion ? 
        new Date(planningData.fechaCreacion.seconds * 1000) : new Date();
    
    const hoy = new Date();
    
    // Generar todos los días desde inicio hasta hoy
    const dias = [];
    for (let d = new Date(fechaInicio); d <= hoy; d.setDate(d.getDate() + 1)) {
        dias.push(new Date(d));
    }
    
    // Procesar cada día
    dias.reverse().forEach(fecha => {
        const diaData = calcularDatosDia(fecha);
        renderizarDia(fecha, diaData);
    });
}

// Calcular datos de un día específico
function calcularDatosDia(fecha) {
    const fechaStr = fecha.toISOString().split('T')[0];
    
    // Filtrar registros de este día
    const registrosDia = (progresoData.registros || []).filter(reg => {
        const regFecha = new Date(reg.fecha.seconds * 1000);
        const regFechaStr = regFecha.toISOString().split('T')[0];
        return regFechaStr === fechaStr;
    });
    
    // Sumar hojas y tests del día
    let hojasLeidas = 0;
    let testsRealizados = 0;
    
    registrosDia.forEach(reg => {
        hojasLeidas += reg.hojasLeidas || 0;
        testsRealizados += reg.testsRealizados || 0;
    });
    
    // Calcular objetivos diarios
    const objetivos = calcularObjetivosDia(fecha);
    
    // Determinar estado
    let estado = 'incumplido';
    
    if (hojasLeidas >= objetivos.hojas && testsRealizados >= objetivos.tests) {
        if (hojasLeidas > objetivos.hojas || testsRealizados > objetivos.tests) {
            estado = 'mejorado';
        } else {
            estado = 'cumplido';
        }
    }
    
    return {
        hojasLeidas,
        testsRealizados,
        objetivoHojas: objetivos.hojas,
        objetivoTests: objetivos.tests,
        estado
    };
}

// Calcular objetivos del día
function calcularObjetivosDia(fecha) {
    const fechaObjetivo = new Date(planningData.fechaObjetivo);
    const diasRestantes = Math.max(1, Math.ceil((fechaObjetivo - fecha) / (1000 * 60 * 60 * 24)));
    
    // Calcular hojas restantes en esa fecha
    let hojasLeidas = 0;
    (progresoData.registros || []).forEach(reg => {
        const regFecha = new Date(reg.fecha.seconds * 1000);
        if (regFecha < fecha) {
            hojasLeidas += reg.hojasLeidas || 0;
        }
    });
    
    const hojasTotales = planningData.temas.reduce((sum, t) => sum + t.hojas, 0);
    const hojasRestantes = Math.max(0, hojasTotales - hojasLeidas);
    const hojasPorDia = Math.ceil(hojasRestantes / diasRestantes);
    
    return {
        hojas: hojasPorDia,
        tests: planningData.testsDiarios || 0
    };
}

// Renderizar un día
function renderizarDia(fecha, datos) {
    const container = document.getElementById('listaRegistros');
    
    const opciones = { day: 'numeric', month: 'long', year: 'numeric' };
    const fechaTexto = fecha.toLocaleDateString('es-ES', opciones);
    
    const div = document.createElement('div');
    div.className = `dia-registro ${datos.estado}`;
    div.innerHTML = `
        <div class="dia-header">
            <div class="dia-fecha">📅 ${fechaTexto}</div>
            <div class="dia-estado ${datos.estado}">
                ${datos.estado === 'cumplido' ? '✅ Cumplido' : 
                  datos.estado === 'mejorado' ? '🌟 Mejorado' : 
                  '❌ Incumplido'}
            </div>
        </div>
        <div class="dia-datos">
            <div>📄 Hojas leídas: <strong>${datos.hojasLeidas}</strong> / ${datos.objetivoHojas}</div>
            <div>✅ Tests realizados: <strong>${datos.testsRealizados}</strong> / ${datos.objetivoTests}</div>
        </div>
    `;
    
    container.appendChild(div);
}
