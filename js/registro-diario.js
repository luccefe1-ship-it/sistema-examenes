import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;
let planningData = null;
let progresoData = null;

// Debug: hacer accesibles en consola
window.debugData = { currentUser, planningData, progresoData };

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
        
        // Debug: actualizar datos accesibles
        window.debugData = { currentUser, planningData, progresoData };
        
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
    
    // Normalizar fechas a medianoche para comparación correcta
    fechaInicio.setHours(0, 0, 0, 0);
    
    const hoy = new Date();
    hoy.setHours(23, 59, 59, 999);
    
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
    
    // Generar gráficas (con timeout para asegurar que el DOM esté listo)
    setTimeout(() => generarGraficas(), 100);
}

// Calcular datos de un día específico
function calcularDatosDia(fecha) {
    // Normalizar fecha a medianoche local
    const fechaLocal = new Date(fecha);
    fechaLocal.setHours(0, 0, 0, 0);
    
    // Filtrar registros de este día
    const registrosDia = (progresoData.registros || []).filter(reg => {
        const regFecha = new Date(reg.fecha.seconds * 1000);
        regFecha.setHours(0, 0, 0, 0);
        return regFecha.getTime() === fechaLocal.getTime();
    });
    
    // Agrupar por tema
    const registrosPorTema = {};
    
    registrosDia.forEach(reg => {
        const temaId = reg.temaId || 'sin-tema';
        if (!registrosPorTema[temaId]) {
            registrosPorTema[temaId] = {
                hojasLeidas: 0,
                testsRealizados: 0,
                paginaDesde: reg.paginaDesde,
                paginaHasta: reg.paginaHasta,
                temaId: temaId,
                temaNombre: reg.temaNombre
            };
        }
        registrosPorTema[temaId].hojasLeidas += reg.hojasLeidas || 0;
        registrosPorTema[temaId].testsRealizados += reg.testsRealizados || 0;
        
        // Actualizar paginaHasta si hay más registros
        if (reg.paginaHasta && reg.paginaHasta > (registrosPorTema[temaId].paginaHasta || 0)) {
            registrosPorTema[temaId].paginaHasta = reg.paginaHasta;
        }
    });
    
    // Calcular totales del día
    let hojasLeidas = 0;
    let testsRealizados = 0;
    let detalleHojas = [];
    
    // Calcular acumulados HASTA este día (inclusive)
    Object.values(registrosPorTema).forEach(regAgrupado => {
        hojasLeidas += regAgrupado.hojasLeidas;
        testsRealizados += regAgrupado.testsRealizados;
        
        if (regAgrupado.hojasLeidas > 0) {
            const temaId = regAgrupado.temaId;
            
            // Obtener nombre del tema
            let temaNombre = 'Tema desconocido';
            if (temaId && planningData && planningData.temas) {
                const tema = planningData.temas.find(t => t.id === temaId);
                if (tema) {
                    temaNombre = tema.nombre;
                }
            }
            if (temaNombre === 'Tema desconocido' && regAgrupado.temaNombre) {
                temaNombre = regAgrupado.temaNombre;
            }
            if (temaNombre === 'Tema desconocido' && temaId && progresoData.temas && progresoData.temas[temaId]) {
                temaNombre = progresoData.temas[temaId].nombre;
            }
            
            // Calcular acumulado hasta este día (INCLUSIVE)
            let acumuladoHasta = 0;
            (progresoData.registros || []).forEach(r => {
                const rFecha = new Date(r.fecha.seconds * 1000);
                rFecha.setHours(0, 0, 0, 0);
                if (rFecha <= fechaLocal && r.temaId === temaId) {
                    acumuladoHasta += r.hojasLeidas || 0;
                }
            });
            
            // Construir detalle
            let detalle = `${temaNombre}: ${regAgrupado.hojasLeidas} hoja${regAgrupado.hojasLeidas > 1 ? 's' : ''}`;
            
            if (regAgrupado.paginaDesde && regAgrupado.paginaHasta) {
                if (regAgrupado.paginaDesde === regAgrupado.paginaHasta) {
                    detalle = `${temaNombre}: página ${regAgrupado.paginaDesde}`;
                } else {
                    detalle = `${temaNombre}: páginas ${regAgrupado.paginaDesde}-${regAgrupado.paginaHasta}`;
                }
            }
            
            detalle += ` - Total acumulado: ${acumuladoHasta} hojas`;
            
            detalleHojas.push(detalle);
        }
    });
    
    // Calcular objetivos diarios
    const objetivos = calcularObjetivosDia(fecha);
    
    // Determinar estado y porcentaje de avance
    let estado = 'incumplido';
    let porcentajeAvance = 0;
    
    if (hojasLeidas > 0 || testsRealizados > 0) {
        // Calcular porcentajes individuales (limitados a 100% cada uno)
        const porcentajeHojas = objetivos.hojas > 0 ? Math.min((hojasLeidas / objetivos.hojas) * 100, 100) : 0;
        const porcentajeTests = objetivos.tests > 0 ? Math.min((testsRealizados / objetivos.tests) * 100, 100) : 100;
        
        // Promedio de ambos porcentajes
        porcentajeAvance = Math.round((porcentajeHojas + porcentajeTests) / 2);
        
        // Determinar estado
        if (hojasLeidas >= objetivos.hojas && testsRealizados >= objetivos.tests) {
            if (hojasLeidas > objetivos.hojas || testsRealizados > objetivos.tests) {
                estado = 'mejorado';
            } else {
                estado = 'cumplido';
            }
        } else {
            estado = 'avanzado';
        }
    }
    
    return {
        hojasLeidas,
        testsRealizados,
        objetivoHojas: objetivos.hojas,
        objetivoTests: objetivos.tests,
        estado,
        porcentajeAvance,
        detalleHojas
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
    
    // Construir HTML de detalles de hojas
    let detalleHojasHTML = '';
    if (datos.detalleHojas && datos.detalleHojas.length > 0) {
        detalleHojasHTML = '<div style="margin-top: 8px; font-size: 14px; color: #555;">';
        datos.detalleHojas.forEach(detalle => {
            detalleHojasHTML += `<div>📖 ${detalle}</div>`;
        });
        detalleHojasHTML += '</div>';
    }
    
    // Construir HTML del estado
    let estadoHTML = '';
    if (datos.estado === 'cumplido') {
        estadoHTML = '<div class="dia-estado cumplido">✅ Cumplido</div>';
    } else if (datos.estado === 'mejorado') {
        estadoHTML = '<div class="dia-estado mejorado">🌟 Mejorado</div>';
    } else if (datos.estado === 'avanzado') {
        estadoHTML = `<div class="dia-estado avanzado" style="background: linear-gradient(to right, #dbeafe 0%, #dbeafe ${datos.porcentajeAvance}%, #f1f5f9 ${datos.porcentajeAvance}%, #f1f5f9 100%);">
            🔵 Avanzado
        </div>`;
    } else {
        estadoHTML = '<div class="dia-estado incumplido">❌ Incumplido</div>';
    }
    
    const div = document.createElement('div');
    div.className = `dia-registro ${datos.estado}`;
    div.innerHTML = `
        <div class="dia-header">
            <div class="dia-fecha">📅 ${fechaTexto}</div>
            ${estadoHTML}
        </div>
        <div class="dia-datos">
            <div>📄 Hojas leídas: <strong>${datos.hojasLeidas}</strong> / ${datos.objetivoHojas}</div>
            ${detalleHojasHTML}
            <div style="margin-top: 8px;">✅ Tests realizados: <strong>${datos.testsRealizados}</strong></div>
        </div>
    `;
    
    container.appendChild(div);
}

// Generar gráficas
function generarGraficas() {
    generarGraficaHojas();
    generarGraficaTests();
}

// Gráfica de hojas
function generarGraficaHojas() {
    const ctx = document.getElementById('graficaHojas');
    if (!ctx) return;
    
    const hojasTotales = planningData.temas.reduce((sum, t) => sum + t.hojas, 0);
    const datos = calcularDatosGrafica('hojas');
    const realAcumulado = datos.real.filter(v => v !== null).pop() || 0;
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: datos.labels,
            datasets: [
                {
                    label: 'Objetivo',
                    data: datos.objetivo,
                    borderColor: '#3b82f6',
                    backgroundColor: 'transparent',
                    borderWidth: 1,
                    tension: 0,
                    pointRadius: 0
                },
                {
                    label: 'Real',
                    data: datos.real,
                    borderColor: '#ef4444',
                    backgroundColor: 'transparent',
                    borderWidth: 0.8,
                    tension: 0.3,
                    pointRadius: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                title: {
                    display: true,
                    text: `Objetivo: ${hojasTotales} hojas | Real: ${realAcumulado} hojas`,
                    align: 'end',
                    font: { size: 13, weight: 'bold' },
                    color: '#333'
                },
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        generateLabels: function(chart) {
                            return [
                                {
                                    text: 'Objetivo: Progreso lineal ideal',
                                    fillStyle: '#3b82f6',
                                    strokeStyle: '#3b82f6',
                                    lineWidth: 1
                                },
                                {
                                    text: 'Real: Tu progreso acumulado',
                                    fillStyle: '#ef4444',
                                    strokeStyle: '#ef4444',
                                    lineWidth: 1
                                }
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Fecha',
                        font: { size: 12, weight: 'bold' }
                    }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Hojas acumuladas',
                        font: { size: 12, weight: 'bold' }
                    }
                }
            }
        }
    });
}

// Gráfica de tests
function generarGraficaTests() {
    const ctx = document.getElementById('graficaTests');
    if (!ctx) return;
    
    const testsTotales = planningData.testsRecomendados || 0;
    const datos = calcularDatosGrafica('tests');
    const realAcumulado = datos.real.filter(v => v !== null).pop() || 0;
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: datos.labels,
            datasets: [
               {
                    label: 'Objetivo',
                    data: datos.objetivo,
                    borderColor: '#3b82f6',
                    backgroundColor: 'transparent',
                    borderWidth: 1,
                    tension: 0,
                    pointRadius: 0
                },
                {
                    label: 'Real',
                    data: datos.real,
                    borderColor: '#ef4444',
                    backgroundColor: 'transparent',
                    borderWidth: 0.8,
                    tension: 0.3,
                    pointRadius: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                title: {
                    display: true,
                    text: `Objetivo: ${testsTotales} tests | Real: ${realAcumulado} tests`,
                    align: 'end',
                    font: { size: 13, weight: 'bold' },
                    color: '#333'
                },
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        generateLabels: function(chart) {
                            return [
                                {
                                    text: 'Objetivo: Progreso lineal ideal',
                                    fillStyle: '#3b82f6',
                                    strokeStyle: '#3b82f6',
                                    lineWidth: 1
                                },
                                {
                                    text: 'Real: Tu progreso acumulado',
                                    fillStyle: '#ef4444',
                                    strokeStyle: '#ef4444',
                                    lineWidth: 1
                                }
                            ];
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Calcular datos para gráfica
function calcularDatosGrafica(tipo) {
    const fechaInicio = planningData.fechaCreacion ? 
        new Date(planningData.fechaCreacion.seconds * 1000) : new Date();
    fechaInicio.setHours(0, 0, 0, 0);
    
    const fechaObjetivo = new Date(planningData.fechaObjetivo);
    fechaObjetivo.setHours(0, 0, 0, 0);
    
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    const diasTotales = Math.ceil((fechaObjetivo - fechaInicio) / (1000 * 60 * 60 * 24));
    
    const labels = [];
    const objetivo = [];
    const real = [];
    
    // Calcular totales
    const hojasTotales = planningData.temas.reduce((sum, t) => sum + t.hojas, 0);
    const testsTotales = planningData.testsRecomendados || 0;
    
    const total = tipo === 'hojas' ? hojasTotales : testsTotales;
    const incrementoDiario = total / diasTotales;
    
    let acumuladoReal = 0;
    
    // Generar datos desde inicio hasta fecha objetivo
    for (let i = 0; i <= diasTotales; i++) {
        const fecha = new Date(fechaInicio);
        fecha.setDate(fecha.getDate() + i);
        fecha.setHours(0, 0, 0, 0);
        
        // Label (cada 2-3 días para no saturar)
        if (i === 0 || i === diasTotales || i % 3 === 0) {
            labels.push(fecha.getDate() + '/' + (fecha.getMonth() + 1));
        } else {
            labels.push('');
        }
        
        // Objetivo lineal
        objetivo.push(Math.round(incrementoDiario * i));
        
        // Real acumulado (solo hasta hoy)
        if (fecha <= hoy) {
            const registrosDia = (progresoData.registros || []).filter(reg => {
                const regFecha = new Date(reg.fecha.seconds * 1000);
                regFecha.setHours(0, 0, 0, 0);
                return regFecha.getTime() === fecha.getTime();
            });
            
            registrosDia.forEach(reg => {
                if (tipo === 'hojas') {
                    acumuladoReal += reg.hojasLeidas || 0;
                } else {
                    acumuladoReal += reg.testsRealizados || 0;
                }
            });
            
            real.push(acumuladoReal);
        } else {
            // Días futuros: null para no mostrar línea
            real.push(null);
        }
    }
    
    return { labels, objetivo, real };
}
