import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;
let planningData = null;
let progresoData = null;
let userName = '';
// Cargar imágenes para el PDF
window.imagenMontana = null;
window.imagenPersona = null;

function cargarImagenesInforme() {
    const imgMontana = new Image();
    imgMontana.onload = function() {
        const canvas = document.createElement('canvas');
        canvas.width = imgMontana.width;
        canvas.height = imgMontana.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgMontana, 0, 0);
        window.imagenMontana = canvas.toDataURL('image/png');
    };
    imgMontana.src = 'images/Montaña.png';
    
    const imgPersona = new Image();
    imgPersona.onload = function() {
        const canvas = document.createElement('canvas');
        canvas.width = imgPersona.width;
        canvas.height = imgPersona.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgPersona, 0, 0);
        window.imagenPersona = canvas.toDataURL('image/png');
    };
    imgPersona.src = 'images/Persona.png';
}

cargarImagenesInforme();
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
        
        // === IMAGEN MONTAÑA DE PROGRESO ===
        const montanaX = 55;
        const montanaY = y;
        const montanaW = 100;
        const montanaH = 70;
        
        const porcentajeAvance = metricas.porcentajeHojas;
        
        // Posición persona subiendo por la montaña
        const alturaPersona = (porcentajeAvance / 100) * montanaH;
        const personaY = montanaY + montanaH - alturaPersona - 20;
        const personaX = montanaX + (porcentajeAvance / 100) * (montanaW / 2);
        
        // Añadir imágenes
        if (window.imagenMontana) {
            doc.addImage(window.imagenMontana, 'PNG', montanaX, montanaY, montanaW, montanaH);
        }
        if (window.imagenPersona) {
            doc.addImage(window.imagenPersona, 'PNG', personaX, personaY, 15, 20);
        }
        
        // Texto de progreso
        doc.setTextColor(51, 51, 51);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`${porcentajeAvance.toFixed(1)}%`, montanaX + montanaW + 15, montanaY + montanaH/2);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('completado', montanaX + montanaW + 15, montanaY + montanaH/2 + 8);
        
        // Etiquetas
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text('META', montanaX + montanaW/2, montanaY - 3, { align: 'center' });
        doc.text('INICIO', montanaX, montanaY + montanaH + 8);
        
        y = montanaY + montanaH + 20;
        
        // === RESUMEN GENERAL ===
        doc.setTextColor(51, 51, 51);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('RESUMEN GENERAL', 20, y);
        y += 10;
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        
        // Tabla resumen
        doc.setFillColor(59, 130, 246);
        doc.rect(20, y, 85, 8, 'F');
        doc.setFillColor(16, 185, 129);
        doc.rect(105, y, 85, 8, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.text('HOJAS', 62.5, y + 6, { align: 'center' });
        doc.text('TESTS', 147.5, y + 6, { align: 'center' });
        y += 8;
        
        doc.setFillColor(245, 245, 245);
        doc.rect(20, y, 85, 24, 'F');
        doc.rect(105, y, 85, 24, 'F');
        
        doc.setTextColor(51, 51, 51);
        doc.setFont('helvetica', 'normal');
        doc.text(`${metricas.hojasLeidas} / ${metricas.hojasTotales} (${metricas.porcentajeHojas.toFixed(1)}%)`, 62.5, y + 7, { align: 'center' });
        doc.text(`Ritmo: ${metricas.ritmoHojasActual.toFixed(1)} hojas/dia`, 62.5, y + 14, { align: 'center' });
        doc.text(`Necesario: ${metricas.ritmoHojasNecesario.toFixed(1)} hojas/dia`, 62.5, y + 21, { align: 'center' });
        
        doc.text(`${metricas.testsRealizados} / ${metricas.testsTotales} (${metricas.porcentajeTests.toFixed(1)}%)`, 147.5, y + 7, { align: 'center' });
        doc.text(`Ritmo: ${metricas.ritmoTestsActual.toFixed(1)} tests/dia`, 147.5, y + 14, { align: 'center' });
        doc.text(`Necesario: ${metricas.ritmoTestsNecesario.toFixed(1)} tests/dia`, 147.5, y + 21, { align: 'center' });
        y += 32;
        
        // Diferencia de ritmo
        const diffRitmoHojas = metricas.ritmoHojasActual - metricas.ritmoHojasNecesario;
        if (diffRitmoHojas >= 0) {
            doc.setTextColor(16, 185, 129);
            doc.text(`Tu ritmo de hojas: +${diffRitmoHojas.toFixed(1)} hojas/dia por encima del necesario`, 20, y);
        } else {
            doc.setTextColor(239, 68, 68);
            doc.text(`Tu ritmo de hojas: ${Math.abs(diffRitmoHojas).toFixed(1)} hojas/dia por debajo del necesario`, 20, y);
        }
        y += 15;
        
        // === PROGRESO POR TEMAS ===
        doc.setTextColor(51, 51, 51);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('PROGRESO POR TEMAS', 20, y);
        y += 10;
        
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        
        metricas.progresoTemas.forEach((tema) => {
            if (y > 265) {
                doc.addPage();
                y = 20;
            }
            
            // Nombre del tema truncado
            let nombreTema = tema.nombre;
            if (nombreTema.length > 30) {
                nombreTema = nombreTema.substring(0, 27) + '...';
            }
            
            // Color según progreso
            if (tema.porcentaje >= 100) {
                doc.setTextColor(16, 185, 129);
            } else if (tema.porcentaje >= 50) {
                doc.setTextColor(59, 130, 246);
            } else if (tema.porcentaje > 0) {
                doc.setTextColor(245, 158, 11);
            } else {
                doc.setTextColor(150, 150, 150);
            }
            
            // Nombre a la izquierda
            doc.text(nombreTema, 22, y);
            
            // Datos a la derecha en línea
            doc.setTextColor(80, 80, 80);
            doc.text(`${tema.hojasLeidas}/${tema.hojasTotales} hojas (${tema.porcentaje.toFixed(0)}%)`, 100, y);
            doc.text(`${tema.testsRealizados || 0} tests`, 165, y);
            
            y += 6;
        });
        
        y += 8;
        
        // === ANÁLISIS DE CUMPLIMIENTO ===
        if (y > 230) {
            doc.addPage();
            y = 20;
        }
        
        doc.setTextColor(51, 51, 51);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('ANALISIS DE CUMPLIMIENTO', 20, y);
        y += 10;
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        
        // Días cumplidos
        doc.setFillColor(16, 185, 129);
        doc.circle(25, y, 3, 'F');
        doc.setTextColor(51, 51, 51);
        doc.text(`Dias cumplidos: ${metricas.diasCumplidos}`, 32, y + 1);
        y += 8;
        
        // Días avanzados
        doc.setFillColor(59, 130, 246);
        doc.circle(25, y, 3, 'F');
        doc.text(`Dias avanzados: ${metricas.diasAvanzados}`, 32, y + 1);
        y += 8;
        
        // Días sin actividad
        doc.setFillColor(239, 68, 68);
        doc.circle(25, y, 3, 'F');
        doc.text(`Dias sin actividad: ${metricas.diasIncumplidos}`, 32, y + 1);
        y += 10;
        
        // Tasa y racha
        doc.text(`Tasa de cumplimiento: ${metricas.tasaCumplimiento.toFixed(1)}%`, 20, y);
        y += 6;
        doc.text(`Racha actual: ${metricas.rachaActual} dias consecutivos`, 20, y);
        y += 12;
        
        // === PROYECCIÓN ===
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('PROYECCION', 20, y);
        y += 10;
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`A tu ritmo actual (${metricas.ritmoHojasActual.toFixed(1)} hojas/dia), completaras el temario el:`, 20, y);
        y += 7;
        
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(59, 130, 246);
        doc.text(metricas.fechaProyectadaHojas, 20, y);
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        if (metricas.diasDesfase > 0) {
            doc.setTextColor(239, 68, 68);
            doc.text(`(${metricas.diasDesfase} dias despues del objetivo)`, 70, y);
        } else if (metricas.diasDesfase < 0) {
            doc.setTextColor(16, 185, 129);
            doc.text(`(${Math.abs(metricas.diasDesfase)} dias ANTES del objetivo)`, 70, y);
        } else {
            doc.setTextColor(59, 130, 246);
            doc.text(`(justo en la fecha objetivo)`, 70, y);
        }
        y += 15;
        
        // === RECOMENDACIONES ===
        if (y > 230) {
            doc.addPage();
            y = 20;
        }
        
        doc.setTextColor(51, 51, 51);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('RECOMENDACIONES', 20, y);
        y += 10;
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        metricas.recomendaciones.forEach((rec, i) => {
            if (y > 260) {
                doc.addPage();
                y = 20;
            }
            const bullet = i + 1;
            const lines = doc.splitTextToSize(`${bullet}. ${rec}`, 170);
            doc.text(lines, 20, y);
            y += lines.length * 5 + 4;
        });
        
        y += 10;
        
        // === CONCLUSIÓN FINAL ===
        if (y > 220) {
            doc.addPage();
            y = 20;
        }
        
        doc.setFillColor(102, 126, 234);
        doc.roundedRect(20, y, 170, 45, 3, 3, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('CONCLUSION', 105, y + 10, { align: 'center' });
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const conclusionLines = doc.splitTextToSize(metricas.conclusion, 160);
        doc.text(conclusionLines, 105, y + 20, { align: 'center' });
        
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
// Calcular todas las métricas para el informe
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
    
    // Acumulados y por tema
    let hojasLeidas = 0;
    let testsRealizados = 0;
    const hojasPorTema = {};
    const hojasPorDia = {};
    
    (progresoData.registros || []).forEach(reg => {
        hojasLeidas += reg.hojasLeidas || 0;
        testsRealizados += reg.testsRealizados || 0;
        
        // Acumular por tema
        if (reg.temaId) {
            if (!hojasPorTema[reg.temaId]) {
                hojasPorTema[reg.temaId] = 0;
            }
            hojasPorTema[reg.temaId] += reg.hojasLeidas || 0;
        }
        
        // Acumular por día
        if (reg.fecha) {
            const regFecha = new Date(reg.fecha.seconds * 1000);
            regFecha.setHours(0, 0, 0, 0);
            const fechaKey = regFecha.getTime();
            if (!hojasPorDia[fechaKey]) {
                hojasPorDia[fechaKey] = 0;
            }
            hojasPorDia[fechaKey] += reg.hojasLeidas || 0;
        }
    });
    
    // Calcular ritmo REAL (excluyendo el primer día si fue carga masiva)
    const diasConRegistro = Object.keys(hojasPorDia).sort((a, b) => a - b);
    let ritmoHojasActual = 0;
    let diasParaRitmo = diasTranscurridos;
    let hojasParaRitmo = hojasLeidas;
    
    if (diasConRegistro.length > 1) {
        const primerDia = parseInt(diasConRegistro[0]);
        const hojasPrimerDia = hojasPorDia[primerDia];
        const promedioDiasPosteriores = (hojasLeidas - hojasPrimerDia) / (diasTranscurridos - 1);
        
        // Si el primer día tiene más de 3x el promedio de los demás, es carga inicial
        if (hojasPrimerDia > promedioDiasPosteriores * 3 && promedioDiasPosteriores > 0) {
            hojasParaRitmo = hojasLeidas - hojasPrimerDia;
            diasParaRitmo = diasTranscurridos - 1;
        }
    }
    
    ritmoHojasActual = diasParaRitmo > 0 ? hojasParaRitmo / diasParaRitmo : 0;
    
    // Contar tests por tema
    const testsPorTema = {};
    (progresoData.registros || []).forEach(reg => {
        if (reg.temaId && reg.testsRealizados) {
            if (!testsPorTema[reg.temaId]) {
                testsPorTema[reg.temaId] = 0;
            }
            testsPorTema[reg.temaId] += reg.testsRealizados;
        }
    });
    
    // Progreso por temas
    const progresoTemas = planningData.temas.map(tema => {
        const leidas = hojasPorTema[tema.id] || 0;
        const tests = testsPorTema[tema.id] || 0;
        const porcentaje = tema.hojas > 0 ? (leidas / tema.hojas) * 100 : 0;
        return {
            id: tema.id,
            nombre: tema.nombre,
            hojasTotales: tema.hojas,
            hojasLeidas: leidas,
            testsRealizados: tests,
            porcentaje: Math.min(100, porcentaje)
        };
    });
    
    // Porcentajes
    const porcentajeHojas = hojasTotales > 0 ? (hojasLeidas / hojasTotales) * 100 : 0;
    const porcentajeTests = testsTotales > 0 ? (testsRealizados / testsTotales) * 100 : 0;
    
    // Ritmo necesario
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
    
    // Porcentaje del tiempo transcurrido
    const porcentajeTiempo = diasTotales > 0 ? (diasTranscurridos / diasTotales) * 100 : 0;
    
    // Score global CORREGIDO - basado en si vas adelantado o atrasado
    let scoreGlobal = 50; // Base
    
    // Ajustar por proyección (más importante)
    if (diasDesfase < -30) scoreGlobal += 40;
    else if (diasDesfase < -14) scoreGlobal += 30;
    else if (diasDesfase < -7) scoreGlobal += 20;
    else if (diasDesfase < 0) scoreGlobal += 10;
    else if (diasDesfase > 30) scoreGlobal -= 30;
    else if (diasDesfase > 14) scoreGlobal -= 20;
    else if (diasDesfase > 7) scoreGlobal -= 10;
    
    // Ajustar por consistencia
    if (tasaCumplimiento >= 80) scoreGlobal += 10;
    else if (tasaCumplimiento >= 50) scoreGlobal += 5;
    else if (tasaCumplimiento < 30) scoreGlobal -= 10;
    
    // Ajustar por progreso vs tiempo
    if (porcentajeHojas >= porcentajeTiempo) scoreGlobal += 5;
    else if (porcentajeHojas < porcentajeTiempo - 10) scoreGlobal -= 5;
    
    scoreGlobal = Math.max(0, Math.min(100, scoreGlobal));
    
    // Mensaje según score
    let mensajeScore = '';
    if (scoreGlobal >= 85) mensajeScore = 'Excelente! Vas muy por delante del objetivo';
    else if (scoreGlobal >= 70) mensajeScore = 'Muy bien! Llevas buen ritmo';
    else if (scoreGlobal >= 55) mensajeScore = 'Bien, vas segun lo previsto';
    else if (scoreGlobal >= 40) mensajeScore = 'Necesitas mejorar el ritmo';
    else mensajeScore = 'Atencion: vas por detras del objetivo';
    
    // Recomendaciones
    const recomendaciones = [];
    
    if (ritmoHojasActual < ritmoHojasNecesario) {
        const deficit = ritmoHojasNecesario - ritmoHojasActual;
        recomendaciones.push(`Aumenta tu ritmo en ${deficit.toFixed(1)} hojas/dia para alcanzar el objetivo.`);
    } else if (ritmoHojasActual > ritmoHojasNecesario * 1.5) {
        recomendaciones.push(`Tu ritmo actual es muy bueno. Puedes mantenerlo o incluso relajarlo un poco.`);
    }
    
    if (rachaActual === 0 && diasTranscurridos > 3) {
        recomendaciones.push(`No tienes racha activa. Cumple el objetivo de hoy para empezar una nueva.`);
    } else if (rachaActual >= 5) {
        recomendaciones.push(`Llevas ${rachaActual} dias de racha. Excelente constancia!`);
    }
    
    if (diasDesfase < -14) {
        recomendaciones.push(`Vas ${Math.abs(diasDesfase)} dias adelantado. Excelente trabajo!`);
    } else if (diasDesfase > 7) {
        recomendaciones.push(`Vas ${diasDesfase} dias por detras. Intensifica el estudio.`);
    }
    
    // Temas sin empezar
    const temasNoEmpezados = progresoTemas.filter(t => t.hojasLeidas === 0 && t.hojasTotales > 0);
    if (temasNoEmpezados.length > 0 && temasNoEmpezados.length <= 5) {
        recomendaciones.push(`Tienes ${temasNoEmpezados.length} tema(s) sin empezar.`);
    }
    
    if (recomendaciones.length === 0) {
        recomendaciones.push(`Manten tu ritmo actual. Vas bien encaminado.`);
    }
    
    // Conclusión final
    let conclusion = '';
    if (diasDesfase < 0) {
        conclusion = `Llevas ${hojasLeidas} hojas leidas y ${testsRealizados} tests en ${diasTranscurridos} dias. `;
        conclusion += `Tu ritmo real de ${ritmoHojasActual.toFixed(1)} hojas/dia supera el necesario (${ritmoHojasNecesario.toFixed(1)}). `;
        conclusion += `A este ritmo, terminaras ${Math.abs(diasDesfase)} dias antes del objetivo. Excelente!`;
    } else if (diasDesfase <= 7) {
        conclusion = `Vas segun lo planificado con ${hojasLeidas} hojas (${porcentajeHojas.toFixed(1)}%). `;
        conclusion += `Manten tu ritmo de ${ritmoHojasActual.toFixed(1)} hojas/dia para cumplir el objetivo.`;
    } else {
        conclusion = `Llevas ${hojasLeidas} hojas en ${diasTranscurridos} dias. `;
        conclusion += `Tu ritmo de ${ritmoHojasActual.toFixed(1)} hojas/dia esta por debajo del necesario (${ritmoHojasNecesario.toFixed(1)}). `;
        conclusion += `Necesitas aumentar la intensidad para cumplir el ${fechaObjetivo.toLocaleDateString('es-ES')}.`;
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
        recomendaciones,
        progresoTemas,
        conclusion
    };
}
