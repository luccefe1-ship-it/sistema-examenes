import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, query, where, getDocs, doc, updateDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;
let preguntaActual = null;
let cacheRanking = null;
let cacheTemas = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

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
        // Usar caché de temas si existe
        let temasSnapshot;
        if (cacheTemas) {
            temasSnapshot = cacheTemas;
        } else {
            temasSnapshot = await getDocs(collection(db, "temas"));
            cacheTemas = temasSnapshot;
        }
        const mapaTemasCompleto = {};
        const mapaPorNombre = {};
        const temasById = {};
        
        temasSnapshot.forEach(doc => {
            const tema = { id: doc.id, ...doc.data() };
            temasById[doc.id] = tema;
            if (!tema.temaPadreId) {
                mapaTemasCompleto[doc.id] = tema.nombre;
                mapaPorNombre[tema.nombre.toLowerCase()] = tema.nombre;
            }
        });
        
        temasSnapshot.forEach(doc => {
            const tema = { id: doc.id, ...doc.data() };
            if (tema.temaPadreId && temasById[tema.temaPadreId]) {
                mapaTemasCompleto[doc.id] = temasById[tema.temaPadreId].nombre;
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
                    let nombreTemaPadre = 'Sin tema asignado';
                    
                    if (pregunta.temaId && mapaTemasCompleto[pregunta.temaId]) {
                        nombreTemaPadre = mapaTemasCompleto[pregunta.temaId];
                    } else if (pregunta.temaNombre) {
                        const nombreLower = pregunta.temaNombre.toLowerCase();
                        if (mapaPorNombre[nombreLower]) {
                            nombreTemaPadre = mapaPorNombre[nombreLower];
                        }
                    } else if (pregunta.temaEpigrafe) {
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

        // Guardar en caché
        cacheRanking = { rankingArray, totalFallos, timestamp: Date.now() };

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
            header.addEventListener('click', (e) => {
                if (e.target.closest('.btn-restaurar') || e.target.closest('.btn-responder')) return;
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

    let temaMostrar = pregunta.temaPadreReal || 'Sin tema asignado';
    const preguntaData = encodeURIComponent(JSON.stringify(pregunta));

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
                <button class="btn-responder" onclick="event.stopPropagation(); abrirModalResponder('${preguntaData}')">Responder</button>
                <button class="btn-restaurar" onclick="event.stopPropagation(); restaurarPregunta('${pregunta.texto.replace(/'/g, "\\'")}')">↻</button>
                <span class="ranking-expand">▼</span>
            </div>
            <div class="ranking-detalles">
                <div class="detalle-seccion">
                    <div class="detalle-titulo">Enunciado completo</div>
                    <div class="detalle-enunciado">${pregunta.texto}</div>
                </div>
                <div class="detalle-seccion">
                    <div class="detalle-titulo">Opciones</div>
                    <div class="opciones-lista">${opcionesHTML}</div>
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

window.abrirModalResponder = function(preguntaData) {
    preguntaActual = JSON.parse(decodeURIComponent(preguntaData));
    const modal = document.getElementById('modalResponder');
    const enunciado = document.getElementById('modalEnunciado');
    const opciones = document.getElementById('modalOpciones');
    const resultado = document.getElementById('modalResultado');
    
    enunciado.textContent = preguntaActual.texto;
    opciones.innerHTML = preguntaActual.opciones.map(opcion => `
        <div class="modal-opcion" onclick="seleccionarOpcion('${opcion.letra}', this)">
            <span class="modal-opcion-letra">${opcion.letra}</span>
            <span class="modal-opcion-texto">${opcion.texto}</span>
        </div>
    `).join('');
    
    resultado.className = '';
    resultado.style.display = 'none';
    modal.classList.add('activo');
}

window.seleccionarOpcion = async function(letra, elemento) {
    if (document.querySelector('.modal-opcion.correcta') || document.querySelector('.modal-opcion.incorrecta')) return;
    
    const opcionCorrecta = preguntaActual.opciones.find(o => o.esCorrecta || o.letra === preguntaActual.respuestaCorrecta);
    const letraCorrecta = opcionCorrecta?.letra || preguntaActual.respuestaCorrecta;
    const resultado = document.getElementById('modalResultado');
    
    if (letra === letraCorrecta) {
        elemento.classList.add('correcta');
        resultado.innerHTML = '<h4 style="color:#28a745;">✅ ¡Correcto!</h4><button class="btn-cerrar-modal" onclick="cerrarModalResponder()">Cerrar</button>';
        resultado.className = 'visible correcto';
    } else {
        elemento.classList.add('incorrecta');
        document.querySelectorAll('.modal-opcion').forEach(op => {
            if (op.querySelector('.modal-opcion-letra').textContent === letraCorrecta) {
                op.classList.add('correcta');
            }
        });
        resultado.innerHTML = '<h4 style="color:#dc3545;">❌ Incorrecto</h4><p>La respuesta correcta es: <strong>' + letraCorrecta + '</strong></p><p style="font-size:12px;color:#666;">Se ha sumado un fallo más.</p><button class="btn-cerrar-modal" onclick="cerrarModalResponder()">Cerrar</button>';
        resultado.className = 'visible incorrecto';
        await registrarFalloAdicional(preguntaActual, letra);
    }
    resultado.style.display = 'block';
}

async function registrarFalloAdicional(pregunta, respuestaUsuario) {
    // Invalidar caché
    cacheRanking = null;
    
    try {
        await addDoc(collection(db, "resultados"), {
            usuarioId: currentUser.uid,
            fecha: serverTimestamp(),
            nombreTest: "Repaso Ranking Fallos",
            totalPreguntas: 1,
            correctas: 0,
            incorrectas: 1,
            enBlanco: 0,
            porcentaje: 0,
            detalleRespuestas: [{
                pregunta: pregunta,
                respuestaUsuario: respuestaUsuario,
                estado: 'incorrecta'
            }]
        });
    } catch (error) {
        console.error('Error registrando fallo:', error);
    }
}

window.cerrarModalResponder = function() {
    document.getElementById('modalResponder').classList.remove('activo');
    
    // Actualizar contador localmente si hubo fallo
    if (preguntaActual && document.querySelector('#modalResultado.incorrecto')) {
        const texto = preguntaActual.texto;
        document.querySelectorAll('.ranking-enunciado').forEach(el => {
            if (el.textContent === texto || texto.startsWith(el.textContent.substring(0, 50))) {
                const item = el.closest('.ranking-item');
                const fallosEl = item.querySelector('.ranking-fallos');
                const actual = parseInt(fallosEl.textContent);
                fallosEl.textContent = (actual + 1) + ' fallos';
                
                // Actualizar total
                const totalEl = document.getElementById('totalFallos');
                totalEl.textContent = parseInt(totalEl.textContent) + 1;
            }
        });
    }
    
    preguntaActual = null;
}

window.restaurarPregunta = async function(textoPregunta) {
    if (!confirm('¿Restaurar esta pregunta a cero fallos? Desaparecerá del ranking.')) return;

    // Encontrar y ocultar el item inmediatamente
    let itemEliminado = null;
    let fallosEliminados = 0;
    document.querySelectorAll('.ranking-item').forEach(item => {
        const enunciado = item.querySelector('.ranking-enunciado').textContent;
        if (textoPregunta.startsWith(enunciado.substring(0, 50)) || enunciado === textoPregunta) {
            fallosEliminados = parseInt(item.querySelector('.ranking-fallos').textContent) || 1;
            itemEliminado = item;
            item.style.transition = 'opacity 0.3s, transform 0.3s';
            item.style.opacity = '0';
            item.style.transform = 'translateX(-100px)';
            setTimeout(() => item.remove(), 300);
        }
    });

    // Actualizar contadores inmediatamente
    const totalPregEl = document.getElementById('totalPreguntas');
    const totalFallosEl = document.getElementById('totalFallos');
    totalPregEl.textContent = parseInt(totalPregEl.textContent) - 1;
    totalFallosEl.textContent = parseInt(totalFallosEl.textContent) - fallosEliminados;

    // Renumerar posiciones
    setTimeout(() => {
        document.querySelectorAll('.ranking-item').forEach((item, index) => {
            const posEl = item.querySelector('.ranking-posicion');
            posEl.textContent = index + 1;
            posEl.className = 'ranking-posicion ' + (index === 0 ? 'posicion-1' : index === 1 ? 'posicion-2' : index === 2 ? 'posicion-3' : 'posicion-normal');
        });
    }, 350);

    // Invalidar caché
    cacheRanking = null;
    
    // Guardar en Firebase en segundo plano
    try {
        const q = query(collection(db, "resultados"), where("usuarioId", "==", currentUser.uid));
        const snapshot = await getDocs(q);
        
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
    } catch (error) {
        console.error('Error restaurando pregunta:', error);
    }
}
