import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('userName').textContent = user.displayName || user.email;
        await cargarRanking();
    } else {
        window.location.href = 'index.html';
    }
});

async function cargarRanking() {
    const loading = document.getElementById('loading');
    const emptyState = document.getElementById('emptyState');
    const rankingList = document.getElementById('rankingList');

    try {
        // Leer de la colección "resultados" en lugar de "preguntasFalladas"
        const q = query(
            collection(db, "resultados"),
            where("usuarioId", "==", currentUser.uid)
        );

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            loading.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        const preguntasAgrupadas = {};
        let totalFallos = 0;

        // Iterar por cada test guardado
        snapshot.forEach(doc => {
            const resultado = doc.data();
            const detalleRespuestas = resultado.detalleRespuestas || [];
            const nombreTest = resultado.nombreTest || 'Test';
            const fechaTest = resultado.fecha?.toDate ? resultado.fecha.toDate() : new Date(resultado.fecha);

            // Iterar por cada pregunta del test
            detalleRespuestas.forEach(detalle => {
                const estado = detalle.estado;
                
                // Solo contar incorrectas (igual que en Estadísticas Generales)
                if (estado !== 'incorrecta') {
                    return;
                }

                const pregunta = detalle.pregunta;
                const textoKey = pregunta.texto;
                totalFallos++;

                if (!preguntasAgrupadas[textoKey]) {
                    preguntasAgrupadas[textoKey] = {
                        pregunta: pregunta,
                        fallos: [],
                        count: 0
                    };
                }

                preguntasAgrupadas[textoKey].count++;
                preguntasAgrupadas[textoKey].fallos.push({
                    respuestaUsuario: detalle.respuestaUsuario || '?',
                    fecha: fechaTest,
                    testNombre: nombreTest
                });
            });
        });

        // Ordenar de más falladas a menos
        const rankingArray = Object.values(preguntasAgrupadas)
            .sort((a, b) => b.count - a.count);

        document.getElementById('totalPreguntas').textContent = rankingArray.length;
        document.getElementById('totalFallos').textContent = totalFallos;

        loading.style.display = 'none';

        if (rankingArray.length === 0) {
            emptyState.style.display = 'block';
            return;
        }

        rankingList.innerHTML = rankingArray.map((item, index) => 
            renderRankingItem(item, index + 1)
        ).join('');

        document.querySelectorAll('.ranking-header').forEach(header => {
            header.addEventListener('click', () => {
                header.closest('.ranking-item').classList.toggle('expanded');
            });
        });

    } catch (error) {
        console.error('Error cargando ranking:', error);
        loading.innerHTML = '<p style="color: #ff6b6b;">Error al cargar el ranking: ' + error.message + '</p>';
    }
}

function renderRankingItem(item, posicion) {
    const pregunta = item.pregunta;
    
    const ultimaRespuesta = item.fallos[item.fallos.length - 1];
    const respuestaUsuario = ultimaRespuesta.respuestaUsuario;

    let posicionClass = 'posicion-normal';
    if (posicion === 1) posicionClass = 'posicion-1';
    else if (posicion === 2) posicionClass = 'posicion-2';
    else if (posicion === 3) posicionClass = 'posicion-3';

    const opcionesHTML = pregunta.opciones.map((opcion) => {
        let claseOpcion = '';
        let badge = '';
        
        if (opcion.esCorrecta || opcion.letra === pregunta.respuestaCorrecta) {
            claseOpcion = 'correcta';
            badge = '<span class="opcion-badge badge-correcta">✓ Correcta</span>';
        }
        if (opcion.letra === respuestaUsuario && !opcion.esCorrecta && opcion.letra !== pregunta.respuestaCorrecta) {
            claseOpcion = 'usuario-incorrecta';
            badge = '<span class="opcion-badge badge-tu-respuesta">✗ Tu respuesta</span>';
        }

        return `
            <div class="opcion-item ${claseOpcion}">
                <span class="opcion-letra">${opcion.letra}</span>
                <span class="opcion-texto">${opcion.texto}</span>
                ${badge}
            </div>
        `;
    }).join('');

    return `
        <div class="ranking-item">
            <div class="ranking-header">
                <div class="ranking-posicion ${posicionClass}">${posicion}</div>
                <div class="ranking-info">
                    <div class="ranking-enunciado">${pregunta.texto}</div>
                    <div class="ranking-meta">
                        <span>📚 ${pregunta.temaNombre || 'Sin tema'}</span>
                        ${pregunta.temaEpigrafe ? `<span>📄 ${pregunta.temaEpigrafe}</span>` : ''}
                    </div>
                </div>
                <div class="ranking-fallos">${item.count} ${item.count === 1 ? 'fallo' : 'fallos'}</div>
                <span class="ranking-expand">▼</span>
            </div>
            <div class="ranking-detalles">
                <div class="detalle-seccion">
                    <div class="detalle-titulo">Enunciado completo</div>
                    <div class="detalle-enunciado">${pregunta.texto}</div>
                </div>
                
                <div class="detalle-seccion">
                    <div class="detalle-titulo">Opciones</div>
                    <div class="opciones-lista">
                        ${opcionesHTML}
                    </div>
                </div>
                
                <div class="detalle-seccion">
                    <div class="detalle-titulo">Tema</div>
                    <div class="detalle-tema">
                        <span class="tema-icono">📚</span>
                        <div class="tema-info">
                            <div class="tema-nombre">${pregunta.temaPadre || 'Sin tema asignado'}</div>
                        </div>
                    </div>
                </div>
                
                <div class="detalle-seccion">
                    <div class="detalle-titulo">Fechas en las que fallaste (${item.count})</div>
                    <div class="fechas-fallos">
                        ${item.fallos.map(fallo => fallo.fecha.toLocaleDateString('es-ES')).join(' • ')}
                    </div>
                </div>
                
            </div>
        </div>
    `;
}
