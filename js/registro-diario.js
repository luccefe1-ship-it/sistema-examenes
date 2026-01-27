import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;
let planningData = null;
let progresoData = null;
let userName = '';

// Debug: hacer accesibles en consola
window.debugData = { currentUser, planningData, progresoData };

// Verificar autenticación
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        try {
            const userDoc = await getDoc(doc(db, "usuarios", user.uid));
            if (userDoc.exists()) {
                userName = userDoc.data().nombre;
                document.getElementById('userName').textContent = userName;
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

// Evento botón descargar informe
document.getElementById('btnDescargarInforme').addEventListener('click', generarInformePDF);

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

// ==========================================
// GENERADOR DE INFORME PDF
// ==========================================
function generarInformePDF() {
    const btn = document.getElementById('btnDescargarInforme');
    btn.disabled = true;
    btn.textContent = '⏳ Generando...';
    
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Calcular métricas
        const metricas = calcularMetricasInforme();
        
        let y = 20;
        
        // === ENCABEZADO ===
        doc.setFillColor(102, 126, 234);
        doc.rect(0, 0, 210, 40, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('INFORME DE PROGRESO', 105, 18, { align: 'center' });
        
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text(`Plataforma Examenes de Justicia`, 105, 28, { align: 'center' });
        doc.text(`Generado: ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`, 105, 35, { align: 'center' });
        
        y = 50;
        
        // === DATOS DEL ESTUDIANTE ===
        doc.setTextColor(51, 51, 51);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('ESTUDIANTE', 20, y);
        y += 8;
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Nombre: ${userName}`, 20, y);
        y += 6;
        doc.text(`Fecha inicio: ${metricas.fechaInicio}`, 20, y);
        doc.text(`Fecha objetivo: ${metricas.fechaObjetivo}`, 110, y);
        y += 6;
        doc.text(`Dias transcurridos: ${metricas.diasTranscurridos} de ${metricas.diasTotales}`, 20, y);
        doc.text(`Dias restantes: ${metricas.diasRestantes}`, 110, y);
        y += 15;
        
        // === PUNTUACIÓN GLOBAL ===
        doc.setFillColor(240, 240, 240);
        doc.roundedRect(20, y, 170, 30, 3, 3, 'F');
        
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        const scoreColor = metricas.scoreGlobal >= 80 ? [16, 185, 129] : 
                          metricas.scoreGlobal >= 50 ? [245, 158, 11] : [239, 68, 68];
        doc.setTextColor(...scoreColor);
        doc.text(`SCORE GLOBAL: ${metricas.scoreGlobal}/100`, 105, y + 12, { align: 'center' });
        
        doc.setFontSize(11);
        doc.setTextColor(100, 100, 100);
        doc.text(metricas.mensajeScore, 105, y + 22, { align: 'center' });
        y += 40;
        
        // === PROGRESO DE HOJAS ===
        doc.setTextColor(51, 51, 51);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('PROGRESO DE HOJAS', 20, y);
        y += 8;
        
        // Barra de progreso hojas
        const porcentajeHojas = metricas.porcentajeHojas;
        doc.setFillColor(229, 231, 235);
        doc.roundedRect(20, y, 170, 8, 2, 2, 'F');
        doc.setFillColor(59, 130, 246);
        doc.roundedRect(20, y, Math.min(170, 170 * porcentajeHojas / 100), 8, 2, 2, 'F');
        y += 12;
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Hojas leidas: ${metricas.hojasLeidas} de ${metricas.hojasTotales} (${porcentajeHojas.toFixed(1)}%)`, 20, y);
        y += 6;
        doc.text(`Ritmo actual: ${metricas.ritmoHojasActual.toFixed(1)} hojas/dia`, 20, y);
        doc.text(`Ritmo necesario: ${metricas.ritmoHojasNecesario.toFixed(1)} hojas/dia`, 110, y);
        y += 6;
        
        const diffRitmoHojas = metricas.ritmoHojasActual - metricas.ritmoHojasNecesario;
        if (diffRitmoHojas >= 0) {
            doc.setTextColor(16, 185, 129);
            doc.text(`+${diffRitmoHojas.toFixed(1)} hojas/dia por encima del objetivo`, 20, y);
        } else {
            doc.setTextColor(239, 68, 68);
            doc.text(`${diffRitmoHojas.toFixed(1)} hojas/dia por debajo del objetivo`, 20, y);
        }
        y += 15;
        
        // === PROGRESO DE TESTS ===
        doc.setTextColor(51, 51, 51);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('PROGRESO DE TESTS', 20, y);
        y += 8;
        
        // Barra de progreso tests
        const porcentajeTests = metricas.porcentajeTests;
        doc.setFillColor(229, 231, 235);
        doc.roundedRect(20, y, 170, 8, 2, 2, 'F');
        doc.setFillColor(16, 185, 129);
        doc.roundedRect(20, y, Math.min(170, 170 * porcentajeTests / 100), 8, 2, 2, 'F');
        y += 12;
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Tests realizados: ${metricas.testsRealizados} de ${metricas.testsTotales} (${porcentajeTests.toFixed(1)}%)`, 20, y);
        y += 6;
        doc.text(`Ritmo actual: ${metricas.ritmoTestsActual.toFixed(1)} tests/dia`, 20, y);
        doc.text(`Ritmo necesario: ${metricas.ritmoTestsNecesario.toFixed(1)} tests/dia`, 110, y);
        y += 15;
        
        // === ANÁLISIS DE CUMPLIMIENTO ===
        doc.setTextColor(51, 51, 51);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('ANALISIS DE CUMPLIMIENTO', 20, y);
        y += 8;
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Dias cumplidos: ${metricas.diasCumplidos}`, 20, y);
        doc.text(`Dias avanzados: ${metricas.diasAvanzados}`, 80, y);
        doc.text(`Dias incumplidos: ${metricas.diasIncumplidos}`, 140, y);
        y += 6;
        doc.text(`Tasa de cumplimiento: ${metricas.tasaCumplimiento.toFixed(1)}%`, 20, y);
        doc.text(`Racha actual: ${metricas.rachaActual} dias consecutivos`, 110, y);
        y += 15;
        
        // === PROYECCIÓN ===
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('PROYECCION', 20, y);
        y += 8;
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`A este ritmo, completaras las hojas el: ${metricas.fechaProyectadaHojas}`, 20, y);
        y += 6;
        
        if (metricas.diasDesfase > 0) {
            doc.setTextColor(239, 68, 68);
            doc.text(`Desfase: +${metricas.diasDesfase} dias respecto al objetivo`, 20, y);
        } else if (metricas.diasDesfase < 0) {
            doc.setTextColor(16, 185, 129);
            doc.text(`Adelanto: ${Math.abs(metricas.diasDesfase)} dias respecto al objetivo`, 20, y);
        } else {
            doc.setTextColor(59, 130, 246);
            doc.text(`Vas perfectamente segun lo planificado`, 20, y);
        }
        y += 15;
        
        // === RECOMENDACIONES ===
        doc.setTextColor(51, 51, 51);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('RECOMENDACIONES', 20, y);
        y += 8;
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        metricas.recomendaciones.forEach((rec, i) => {
            if (y > 270) {
                doc.addPage();
                y = 20;
            }
            const lines = doc.splitTextToSize(`${i + 1}. ${rec}`, 170);
            doc.text(lines, 20, y);
            y += lines.length * 5 + 3;
        });
        
        // === PIE DE PÁGINA ===
        doc.setFontSize(9);
        doc.setTextColor(150, 150, 150);
        doc.text('Este informe ha sido generado automaticamente por la Plataforma Examenes de Justicia', 105, 290, { align: 'center' });
        
        // Descargar
        const fechaArchivo = new Date().toISOString().split('T')[0];
        doc.save(`Informe_Progreso_${fechaArchivo}.pdf`);
        
    } catch (error) {
        console.error('Error generando PDF:', error);
        alert('Error al generar el informe. Inténtalo de nuevo.');
    } finally {
        btn.disabled = false;
        btn.textContent = '📄 Descargar Informe';
    }
}

// Calcular todas las métricas para el informe
function calcularMetricasInforme() {
    const fechaInicio = planningData.fechaCreacion ? 
        new Date(planningData.fechaCreacion.seconds * 1000) : new Date();
    fechaInicio.setHours(0, 0, 0, 0);
    
    const fechaObjetivo = new Date(planningData.fechaObjetivo);
    fechaObjetivo.setHours(0, 0, 0, 0);
    
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    const diasTotales = Math.ceil((fechaObjetivo - fechaInicio) / (1000 * 60 * 60 * 24));
    const diasTranscurridos = Math.ceil((hoy - fechaInicio) / (1000 * 60 * 60 * 24)) + 1;
    const diasRestantes = Math.max(0, Math.ceil((fechaObjetivo - hoy) / (1000 * 60 * 60 * 24)));
    
    // Totales
    const hojasTotales = planningData.temas.reduce((sum, t) => sum + t.hojas, 0);
    const testsTotales = planningData.testsRecomendados || 0;
    
    // Acumulados
    let hojasLeidas = 0;
    let testsRealizados = 0;
    (progresoData.registros || []).forEach(reg => {
        hojasLeidas += reg.hojasLeidas || 0;
        testsRealizados += reg.testsRealizados || 0;
    });
    
    // Porcentajes
    const porcentajeHojas = hojasTotales > 0 ? (hojasLeidas / hojasTotales) * 100 : 0;
    const porcentajeTests = testsTotales > 0 ? (testsRealizados / testsTotales) * 100 : 0;
    
    // Ritmos
    const ritmoHojasActual = diasTranscurridos > 0 ? hojasLeidas / diasTranscurridos : 0;
    const ritmoHojasNecesario = diasRestantes > 0 ? (hojasTotales - hojasLeidas) / diasRestantes : 0;
    const ritmoTestsActual = diasTranscurridos > 0 ? testsRealizados / diasTranscurridos : 0;
    const ritmoTestsNecesario = diasRestantes > 0 ? (testsTotales - testsRealizados) / diasRestantes : 0;
    
    // Análisis de días
    let diasCumplidos = 0;
    let diasAvanzados = 0;
    let diasIncumplidos = 0;
    let rachaActual = 0;
    let enRacha = true;
    
    const dias = [];
    for (let d = new Date(fechaInicio); d <= hoy; d.setDate(d.getDate() + 1)) {
        dias.push(new Date(d));
    }
    
    dias.reverse().forEach(fecha => {
        const diaData = calcularDatosDia(fecha);
        if (diaData.estado === 'cumplido' || diaData.estado === 'mejorado') {
            diasCumplidos++;
            if (enRacha) rachaActual++;
        } else if (diaData.estado === 'avanzado') {
            diasAvanzados++;
            enRacha = false;
        } else {
            diasIncumplidos++;
            enRacha = false;
        }
    });
    
    const tasaCumplimiento = diasTranscurridos > 0 ? (diasCumplidos / diasTranscurridos) * 100 : 0;
    
    // Proyección
    const hojasRestantes = hojasTotales - hojasLeidas;
    let diasParaTerminar = ritmoHojasActual > 0 ? Math.ceil(hojasRestantes / ritmoHojasActual) : 999;
    const fechaProyectada = new Date(hoy);
    fechaProyectada.setDate(fechaProyectada.getDate() + diasParaTerminar);
    const diasDesfase = Math.ceil((fechaProyectada - fechaObjetivo) / (1000 * 60 * 60 * 24));
    
    // Score global (ponderado)
    const scoreHojas = Math.min(100, porcentajeHojas);
    const scoreTests = Math.min(100, porcentajeTests);
    const scoreCumplimiento = tasaCumplimiento;
    const scoreRitmo = ritmoHojasNecesario > 0 ? Math.min(100, (ritmoHojasActual / ritmoHojasNecesario) * 100) : 100;
    
    const scoreGlobal = Math.round((scoreHojas * 0.35 + scoreTests * 0.25 + scoreCumplimiento * 0.25 + scoreRitmo * 0.15));
    
    // Mensaje según score
    let mensajeScore = '';
    if (scoreGlobal >= 90) mensajeScore = 'Excelente! Vas por muy buen camino';
    else if (scoreGlobal >= 75) mensajeScore = 'Muy bien! Mantén el ritmo';
    else if (scoreGlobal >= 60) mensajeScore = 'Bien, pero puedes mejorar';
    else if (scoreGlobal >= 40) mensajeScore = 'Necesitas intensificar el estudio';
    else mensajeScore = 'Situación crítica. Requiere acción inmediata';
    
    // Recomendaciones
    const recomendaciones = [];
    
    if (ritmoHojasActual < ritmoHojasNecesario) {
        const deficit = ritmoHojasNecesario - ritmoHojasActual;
        recomendaciones.push(`Aumenta tu ritmo de lectura en ${deficit.toFixed(1)} hojas diarias para alcanzar el objetivo.`);
    }
    
    if (diasIncumplidos > diasCumplidos) {
        recomendaciones.push(`Has incumplido más días de los que has cumplido. Intenta ser más constante.`);
    }
    
    if (rachaActual === 0 && diasTranscurridos > 3) {
        recomendaciones.push(`No tienes racha activa. Intenta cumplir los objetivos hoy para empezar una nueva.`);
    } else if (rachaActual >= 3) {
        recomendaciones.push(`Llevas ${rachaActual} días cumpliendo. ¡Sigue así!`);
    }
    
    if (diasDesfase > 7) {
        recomendaciones.push(`Vas ${diasDesfase} días por detrás. Considera dedicar más tiempo o revisar tus objetivos.`);
    } else if (diasDesfase < -7) {
        recomendaciones.push(`Vas ${Math.abs(diasDesfase)} días adelantado. ¡Excelente trabajo!`);
    }
    
    if (porcentajeTests < porcentajeHojas - 20) {
        recomendaciones.push(`Tus tests van por detrás de tus hojas. Equilibra ambas actividades.`);
    }
    
    if (recomendaciones.length === 0) {
        recomendaciones.push(`Mantén tu ritmo actual. Estás progresando adecuadamente.`);
    }
    
    return {
        fechaInicio: fechaInicio.toLocaleDateString('es-ES'),
        fechaObjetivo: fechaObjetivo.toLocaleDateString('es-ES'),
        diasTotales,
        diasTranscurridos,
        diasRestantes,
        hojasTotales,
        hojasLeidas,
        testsTotales,
        testsRealizados,
        porcentajeHojas,
        porcentajeTests,
        ritmoHojasActual,
        ritmoHojasNecesario,
        ritmoTestsActual,
        ritmoTestsNecesario,
        diasCumplidos,
        diasAvanzados,
        diasIncumplidos,
        tasaCumplimiento,
        rachaActual,
        fechaProyectadaHojas: fechaProyectada.toLocaleDateString('es-ES'),
        diasDesfase,
        scoreGlobal,
        mensajeScore,
        recomendaciones
    };
}
