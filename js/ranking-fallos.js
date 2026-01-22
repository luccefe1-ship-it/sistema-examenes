import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCL7LbPGCPbdY9JGErCfT5Z-TrzTnSj6sU",
    authDomain: "oposicion-b5860.firebaseapp.com",
    projectId: "oposicion-b5860",
    storageBucket: "oposicion-b5860.appspot.com",
    messagingSenderId: "651854467033",
    appId: "1:651854467033:web:abcdef123456"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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
        // Obtener SOLO las preguntas con estado 'incorrecta' (no 'sin-respuesta')
        const q = query(
            collection(db, "preguntasFalladas"),
            where("usuarioId", "==", currentUser.uid),
            where("estado", "==", "incorrecta")
        );

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            loading.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        // Agrupar preguntas por texto del enunciado
        const preguntasAgrupadas = {};
        let totalFallos = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            const textoKey = data.pregunta.texto;
            totalFallos++;

            if (!preguntasAgrupadas[textoKey]) {
                preguntasAgrupadas[textoKey] = {
                    pregunta: data.pregunta,
                    fallos: [],
                    count: 0
                };
            }

            preguntasAgrupadas[textoKey].count++;
            preguntasAgrupadas[textoKey].fallos.push({
                respuestaUsuario: data.respuestaUsuario,
                fecha: data.fechaFallo?.toDate ? data.fechaFallo.toDate() : new Date(data.fechaFallo),
                testNombre: data.testNombre || 'Test'
            });
        });

        // Convertir a array y ordenar por número de fallos (mayor a menor)
        const rankingArray = Object.values(preguntasAgrupadas)
            .sort((a, b) => b.count - a.count);

        // Actualizar estadísticas
        document.getElementById('totalPreguntas').textContent = rankingArray.length;
        document.getElementById('totalFallos').textContent = totalFallos;

        // Renderizar ranking
        loading.style.display = 'none';
        rankingList.innerHTML = rankingArray.map((item, index) => 
            renderRankingItem(item, index + 1)
        ).join('');

        // Añadir listeners para expandir/colapsar
        document.querySelectorAll('.ranking-header').forEach(header => {
            header.addEventListener('click', () => {
                header.closest('.ranking-item').classList.toggle('expanded');
            });
        });

    } catch (error) {
        console.error('Error cargando ranking:', error);
        loading.innerHTML = '<p style="color: #ff6b6b;">Error al cargar el ranking</p>';
    }
}

function renderRankingItem(item, posicion) {
    const pregunta = item.pregunta;
    const letras = ['A', 'B', 'C', 'D', 'E', 'F'];
    
    // Obtener la última respuesta dada para mostrar
    const ultimaRespuesta = item.fallos[item.fallos.length - 1];
    const respuestaUsuarioIndex = ultimaRespuesta.respuestaUsuario;

    // Clase para la posición
    let posicionClass = 'posicion-normal';
    if (posicion === 1) posicionClass = 'posicion-1';
    else if (posicion === 2) posicionClass = 'posicion-2';
    else if (posicion === 3) posicionClass = 'posicion-3';

    // Renderizar opciones
    const opcionesHTML = pregunta.opciones.map((opcion, idx) => {
        let claseOpcion = '';
        let badge = '';
        
        if (idx === pregunta.respuestaCorrecta) {
            claseOpcion = 'correcta';
            badge = '<span class="opcion-badge badge-correcta">✓ Correcta</span>';
        }
        if (idx === respuestaUsuarioIndex && idx !== pregunta.respuestaCorrecta) {
            claseOpcion = 'usuario-incorrecta';
            badge = '<span class="opcion-badge badge-tu-respuesta">✗ Tu respuesta</span>';
        }

        return `
            <div class="opcion-item ${claseOpcion}">
                <span class="opcion-letra">${letras[idx]}</span>
                <span class="opcion-texto">${opcion}</span>
                ${badge}
            </div>
        `;
    }).join('');

    // Historial de respuestas
    const historialHTML = item.fallos.map(fallo => {
        const fecha = fallo.fecha instanceof Date ? fallo.fecha : new Date(fallo.fecha);
        const fechaStr = fecha.toLocaleDateString('es-ES', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        return `
            <div class="respuesta-historial">
                <span class="respuesta-fecha">${fechaStr}</span>
                <span>→</span>
                <span class="respuesta-dada">Respondiste: ${letras[fallo.respuestaUsuario] || '?'}</span>
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
                            <div class="tema-nombre">${pregunta.temaNombre || 'Sin tema asignado'}</div>
                            ${pregunta.temaEpigrafe ? `<div class="tema-epigrafe">${pregunta.temaEpigrafe}</div>` : ''}
                        </div>
                    </div>
                </div>
                
                <div class="detalle-seccion">
                    <div class="detalle-titulo">Historial de fallos (${item.count})</div>
                    <div class="respuestas-dadas">
                        ${historialHTML}
                    </div>
                </div>
            </div>
        </div>
    `;
}
