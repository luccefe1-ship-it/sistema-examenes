import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, query, where, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
        // Cargar todos los temas
        const temasSnapshot = await getDocs(collection(db, "temas"));
        const mapaTemasCompleto = {};
        const mapaPorNombre = {};
        const temasById = {};
        
        temasSnapshot.forEach(doc => {
            const tema = { id: doc.id, ...doc.data() };
            temasById[doc.id] = tema;
            
            // Si es tema padre, guardarlo
            if (!tema.temaPadreId) {
                mapaTemasCompleto[doc.id] = tema.nombre;
                mapaPorNombre[tema.nombre.toLowerCase()] = tema.nombre;
            }
        });
        
        // Segundo pase: mapear subtemas a sus padres
        temasSnapshot.forEach(doc => {
            const tema = { id: doc.id, ...doc.data() };
            if (tema.temaPadreId && temasById[tema.temaPadreId]) {
                mapaTemasCompleto[doc.id] = temasById[tema.temaPadreId].nombre;
                // También mapear por nombre del subtema
                if (tema.nombre) {
                    mapaPorNombre[tema.nombre.toLowerCase()] = temasById[tema.temaPadreId].nombre;
                }
            }
        });
        
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

        snapshot.forEach(doc => {
            const resultado = doc.data();
            const detalleRespuestas = resultado.detalleRespuestas || [];
            const nombreTest = resultado.nombreTest || 'Test';
            
            let fechaTest;
            if (resultado.fecha?.toDate) {
                fechaTest = resultado.fecha.toDate();
            } else if (resultado.fecha?.seconds) {
                fechaTest = new Date(resultado.fecha.seconds * 1000);
            } else {
                fechaTest = new Date(resultado.fecha);
            }

            detalleRespuestas.forEach(detalle => {
                if (detalle.estado !== 'incorrecta' || detalle.restaurada) {
                    return;
                }
                
                const pregunta = detalle.pregunta;
                const textoKey = pregunta.texto;
                totalFallos++;

                if (!preguntasAgrupadas[textoKey]) {
                    // Intentar obtener nombre del tema padre
                    let nombreTemaPadre = 'Sin tema asignado';
                    
                    // Opción 1: Por temaId
                    if (pregunta.temaId && mapaTemasCompleto[pregunta.temaId]) {
                        nombreTemaPadre = mapaTemasCompleto[pregunta.temaId];
                    }
                    // Opción 2: Por temaNombre
                    else if (pregunta.temaNombre) {
                        const nombreLower = pregunta.temaNombre.toLowerCase();
                        if (mapaPorNombre[nombreLower]) {
                            nombreTemaPadre = mapaPorNombre[nombreLower];
                        }
                    }
                    // Opción 3: Por temaEpigrafe
                    else if (pregunta.temaEpigrafe) {
                        const epiLower = pregunta.temaEpigrafe.toLowerCase();
                        if (mapaPorNombre[epiLower]) {
                            nombreTemaPadre = mapaPorNombre[epiLower];
                        }
                    }
                    
                    preguntasAgrupadas[textoKey] = {
                        pregunta: { ...pregunta, temaPadreReal: nombreTemaPadre },
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

    // Usar el tema padre real que obtuvimos de Firebase
    let temaMostrar = pregunta.temaPadreReal || 'Sin tema asignado';

    return `
        <div class="ranking-item">
            <div class="ranking-header">
                <div class="ranking-posicion ${posicionClass}">${posicion}</div>
                <div class="ranking-info">
                    <div class="ranking-enunciado">${pregunta.texto}</div>
                    <div class="ranking-meta">
                        <span>📚 ${pregunta.temaEpigrafe || pregunta.temaNombre || 'Sin tema'}</span>
                    </div>
                </div>
                <div class="ranking-fallos">${item.count} ${item.count === 1 ? 'fallo' : 'fallos'}</div>
                <button class="btn-restaurar" onclick="restaurarPregunta('${pregunta.texto.replace(/'/g, "\\'")}')">↻</button>
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
                            <div class="tema-nombre">${temaMostrar}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Hacer la función global
window.restaurarPregunta = async function(textoPregunta) {
    if (!confirm('¿Restaurar esta pregunta a cero fallos? Desaparecerá del ranking.')) {
        return;
    }

    try {
        const q = query(
            collection(db, "resultados"),
            where("usuarioId", "==", currentUser.uid)
        );

        const snapshot = await getDocs(q);
        
        // Actualizar cada test que contenga esta pregunta
        for (const docSnapshot of snapshot.docs) {
            const resultado = docSnapshot.data();
            let modificado = false;
            
            const detalleActualizado = resultado.detalleRespuestas.map(detalle => {
                if (detalle.pregunta.texto === textoPregunta && detalle.estado === 'incorrecta') {
                    modificado = true;
                    return { ...detalle, restaurada: true };
                }
                return detalle;
            });

            if (modificado) {
                await updateDoc(doc(db, "resultados", docSnapshot.id), {
                    detalleRespuestas: detalleActualizado
                });
            }
        }

        alert('✅ Pregunta restaurada correctamente');
        await cargarRanking();

    } catch (error) {
        console.error('Error restaurando pregunta:', error);
        alert('❌ Error al restaurar la pregunta');
    }
}
