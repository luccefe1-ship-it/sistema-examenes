import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, query, where, getDocs, doc, getDoc, updateDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;
let preguntaActual = null;
let cacheRanking = null;
let cacheTemas = null;

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('userName').textContent = user.displayName || user.email;
        await cargarRanking();
    } else {
        window.location.href = 'index.html';
    }
});

// Inicializar selectores de número de preguntas
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.btn-num').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.btn-num').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });
});

async function cargarRanking() {
    const loading = document.getElementById('loading');
    const emptyState = document.getElementById('emptyState');
    const rankingList = document.getElementById('rankingList');

    try {
        // Cargar temas, resultados y preguntas dominadas en PARALELO
        const [temasSnapshot, resultadosSnapshot, dominadasDoc] = await Promise.all([
            cacheTemas ? Promise.resolve(cacheTemas) : getDocs(collection(db, "temas")),
            getDocs(query(collection(db, "resultados"), where("usuarioId", "==", currentUser.uid))),
            getDoc(doc(db, "preguntasDominadas", currentUser.uid))
        ]);
        
        // Obtener lista de preguntas dominadas (ocultas del ranking)
        const preguntasDominadas = dominadasDoc.exists() ? (dominadasDoc.data().preguntas || []) : [];
        console.log(`Preguntas dominadas (ocultas): ${preguntasDominadas.length}`);
        
        cacheTemas = temasSnapshot;

        // Construir mapas de temas
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

        if (resultadosSnapshot.empty) {
            loading.style.display = 'none';
            emptyState.style.display = 'block';
            actualizarSidebar([]);
            return;
        }

        const preguntasAgrupadas = {};
        let totalFallos = 0;

        resultadosSnapshot.forEach(doc => {
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
                if (!pregunta || !pregunta.texto) return;
                
                // Excluir preguntas dominadas (acertadas en test de ranking)
                const textoNormalizado = pregunta.texto.trim();
                if (preguntasDominadas.includes(textoNormalizado)) {
                    return;
                }
                
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
            actualizarSidebar([]);
            return;
        }

        // Renderizar solo los primeros 50 items inicialmente para velocidad
        const itemsIniciales = rankingArray.slice(0, 50);
        rankingList.innerHTML = itemsIniciales.map((item, index) => 
            renderRankingItem(item, index + 1)
        ).join('');

        // Renderizar el resto en segundo plano
        if (rankingArray.length > 50) {
            setTimeout(() => {
                const itemsRestantes = rankingArray.slice(50);
                const htmlRestante = itemsRestantes.map((item, index) => 
                    renderRankingItem(item, index + 51)
                ).join('');
                rankingList.insertAdjacentHTML('beforeend', htmlRestante);
                agregarEventListeners();
            }, 100);
        }

        agregarEventListeners();
        actualizarSidebar(rankingArray);

    } catch (error) {
        console.error('Error cargando ranking:', error);
        loading.innerHTML = '<p style="color: #ff6b6b;">Error al cargar el ranking: ' + error.message + '</p>';
    }
}

function agregarEventListeners() {
    document.querySelectorAll('.ranking-header').forEach(header => {
        if (!header.dataset.listenerAdded) {
            header.dataset.listenerAdded = 'true';
            header.addEventListener('click', (e) => {
                if (e.target.closest('.btn-restaurar') || e.target.closest('.btn-responder')) return;
                header.closest('.ranking-item').classList.toggle('expanded');
            });
        }
    });
}

function actualizarSidebar(rankingArray) {
    // Calcular tema con más fallos
    const fallosPorTema = {};
    
    rankingArray.forEach(item => {
        const tema = item.pregunta.temaPadreReal || 'Sin tema';
        if (!fallosPorTema[tema]) {
            fallosPorTema[tema] = 0;
        }
        fallosPorTema[tema] += item.count;
    });
    
    let temaMax = 'Sin datos';
    let maxFallos = 0;
    
    for (const [tema, fallos] of Object.entries(fallosPorTema)) {
        if (fallos > maxFallos) {
            maxFallos = fallos;
            temaMax = tema;
        }
    }
    
    const container = document.getElementById('temaMasFallos');
    if (container) {
        container.innerHTML = `
            <span class="tema-nombre-sidebar">${temaMax}</span>
            <span class="tema-fallos-count">${maxFallos} fallos</span>
        `;
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

    const opcionesHTML = (pregunta.opciones || []).map((opcion) => {
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

    const preguntaData = encodeURIComponent(JSON.stringify(pregunta));
    const temaMostrar = pregunta.temaPadreReal || pregunta.temaNombre || 'Sin tema';
    const textoEscapado = encodeURIComponent(pregunta.texto);

    return `
        <div class="ranking-item">
            <div class="ranking-header">
                <div class="ranking-posicion ${posicionClass}">${posicion}</div>
                <div class="ranking-tema-padre">${pregunta.temaPadreReal || 'Sin tema'}</div>
                <div class="ranking-info">
                    <div class="ranking-enunciado">${pregunta.texto}</div>
                    <div class="ranking-meta">
                        <span>📄 ${pregunta.temaEpigrafe || pregunta.temaNombre || 'Sin epígrafe'}</span>
                    </div>
                </div>
                <div class="ranking-fallos">${item.count} ${item.count === 1 ? 'fallo' : 'fallos'}</div>
                <button class="btn-responder" onclick="event.stopPropagation(); abrirModalResponder('${preguntaData}')">Responder</button>
                <button class="btn-restaurar" onclick="event.stopPropagation(); restaurarPregunta('${textoEscapado}')">↻</button>
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
    opciones.innerHTML = (preguntaActual.opciones || []).map(opcion => `
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
        registrarFalloAdicional(preguntaActual, letra);
    }
    resultado.style.display = 'block';
}

async function registrarFalloAdicional(pregunta, respuestaUsuario) {
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
    
    if (preguntaActual && document.querySelector('#modalResultado.incorrecto')) {
        const texto = preguntaActual.texto;
        document.querySelectorAll('.ranking-enunciado').forEach(el => {
            if (el.textContent === texto || texto.startsWith(el.textContent.substring(0, 50))) {
                const item = el.closest('.ranking-item');
                const fallosEl = item.querySelector('.ranking-fallos');
                const actual = parseInt(fallosEl.textContent);
                fallosEl.textContent = (actual + 1) + ' fallos';
                
                const totalEl = document.getElementById('totalFallos');
                totalEl.textContent = parseInt(totalEl.textContent) + 1;
            }
        });
    }
    
    preguntaActual = null;
}

window.restaurarPregunta = function(textoPregunta) {
    if (!confirm('¿Restaurar esta pregunta a cero fallos? Desaparecerá del ranking.')) return;

    const textoDecodificado = decodeURIComponent(textoPregunta);

    let fallosEliminados = 0;
    document.querySelectorAll('.ranking-item').forEach(item => {
        const enunciado = item.querySelector('.ranking-enunciado').textContent;
        if (textoDecodificado === enunciado || textoDecodificado.substring(0, 80) === enunciado.substring(0, 80)) {
            fallosEliminados = parseInt(item.querySelector('.ranking-fallos').textContent) || 1;
            item.style.transition = 'opacity 0.3s, transform 0.3s';
            item.style.opacity = '0';
            item.style.transform = 'translateX(-100px)';
            setTimeout(() => item.remove(), 300);
        }
    });

    const totalPregEl = document.getElementById('totalPreguntas');
    const totalFallosEl = document.getElementById('totalFallos');
    totalPregEl.textContent = parseInt(totalPregEl.textContent) - 1;
    totalFallosEl.textContent = parseInt(totalFallosEl.textContent) - fallosEliminados;

    setTimeout(() => {
        document.querySelectorAll('.ranking-item').forEach((item, index) => {
            const posEl = item.querySelector('.ranking-posicion');
            posEl.textContent = index + 1;
            posEl.className = 'ranking-posicion ' + (index === 0 ? 'posicion-1' : index === 1 ? 'posicion-2' : index === 2 ? 'posicion-3' : 'posicion-normal');
        });
    }, 350);

    cacheRanking = null;
    cacheTemas = null;
    
    actualizarFirebaseRestaurar(textoDecodificado);
}

async function actualizarFirebaseRestaurar(textoDecodificado) {
    try {
        const q = query(collection(db, "resultados"), where("usuarioId", "==", currentUser.uid));
        const snapshot = await getDocs(q);
        
        const promesas = [];
        
        snapshot.docs.forEach(docSnapshot => {
            const resultado = docSnapshot.data();
            if (resultado.origen === 'app_movil') return;
            let modificado = false;
            
            const detalleActualizado = resultado.detalleRespuestas.map(detalle => {
                if (detalle.pregunta?.texto === textoDecodificado && detalle.estado === 'incorrecta' && !detalle.restaurada) {
                    modificado = true;
                    return { ...detalle, restaurada: true };
                }
                return detalle;
            });

            if (modificado) {
                promesas.push(updateDoc(doc(db, "resultados", docSnapshot.id), {
                    detalleRespuestas: detalleActualizado
                }));
            }
        });
        
        await Promise.all(promesas);
        console.log('Pregunta restaurada en Firebase');
    } catch (error) {
        console.error('Error restaurando pregunta en Firebase:', error);
    }
}

// Iniciar test del ranking
window.iniciarTestRanking = function() {
    const btnActivo = document.querySelector('.btn-num.active');
    const numPreguntas = btnActivo ? btnActivo.dataset.num : '10';
    
    if (!cacheRanking || !cacheRanking.rankingArray || cacheRanking.rankingArray.length === 0) {
        alert('No hay preguntas disponibles para el test');
        return;
    }
    
    const todasPreguntas = cacheRanking.rankingArray.map(item => item.pregunta);
    
    let preguntasTest;
    if (numPreguntas === 'todas') {
        preguntasTest = [...todasPreguntas];
    } else {
        const num = parseInt(numPreguntas);
        preguntasTest = todasPreguntas.slice(0, Math.min(num, todasPreguntas.length));
    }
    
    // Mezclar aleatoriamente
    for (let i = preguntasTest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [preguntasTest[i], preguntasTest[j]] = [preguntasTest[j], preguntasTest[i]];
    }
    
    const configuracion = {
        nombreTest: `Test Ranking Fallos - ${new Date().toLocaleDateString()}`,
        temas: 'ranking-fallos',
        preguntas: preguntasTest,
        numPreguntas: preguntasTest.length,
        tiempoLimite: 'sin',
        esRanking: true
    };
    
    localStorage.setItem('testConfig', JSON.stringify(configuracion));
    window.location.href = 'tests-pregunta.html';
}
