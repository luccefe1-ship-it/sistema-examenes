import { auth, db } from './firebase-config.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    doc, getDoc, getDocs, query, where, collection 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;

// Auth + navbar
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const userDoc = await getDoc(doc(db, "usuarios", user.uid));
        document.getElementById('userName').textContent = userDoc.exists() ? userDoc.data().nombre : user.email;
        await cargarTemasConTarjetas();
    } else {
        window.location.href = 'index.html';
    }
});

document.getElementById('backBtn').addEventListener('click', () => window.location.href = 'homepage.html');
document.getElementById('logoutBtn').addEventListener('click', async () => { await signOut(auth); window.location.href = 'index.html'; });

// Generar hash consistente
function generarHashPregunta(texto) {
    const t = texto || '';
    let hash = 0;
    for (let i = 0; i < t.length; i++) {
        hash = ((hash << 5) - hash) + t.charCodeAt(i);
        hash = hash & hash;
    }
    return 'q_' + Math.abs(hash).toString(36);
}

// Cargar temas y contar tarjetas por tema
async function cargarTemasConTarjetas() {
    const container = document.getElementById('listaTemasTarjetas');
    
    try {
        // 1. Cargar todos los temas
        const q = query(collection(db, "temas"), where("usuarioId", "==", currentUser.uid));
        const temasSnap = await getDocs(q);
        
        // 2. Cargar todas las tarjetas del usuario
        const tarjetasSnap = await getDocs(collection(db, `usuarios/${currentUser.uid}/tarjetas`));
        const tarjetasPorPregunta = {};
        tarjetasSnap.forEach(d => {
            const data = d.data();
            if (!tarjetasPorPregunta[data.preguntaId]) tarjetasPorPregunta[data.preguntaId] = [];
            tarjetasPorPregunta[data.preguntaId].push({ url: data.url, nombre: data.nombre });
        });
        
        // 3. Organizar temas
        const temasPrincipales = [];
        const subtemasPorPadre = {};
        const temasMap = {};
        
        temasSnap.forEach(d => {
            const tema = d.data();
            temasMap[d.id] = tema;
            if (tema.temaPadreId) {
                if (!subtemasPorPadre[tema.temaPadreId]) subtemasPorPadre[tema.temaPadreId] = [];
                subtemasPorPadre[tema.temaPadreId].push({ id: d.id, data: tema });
            } else {
                temasPrincipales.push({ id: d.id, data: tema });
            }
        });
        
        // Ordenar numéricamente
        const ordenar = (a, b) => {
            const na = a.data.nombre.match(/\d+/), nb = b.data.nombre.match(/\d+/);
            return (na && nb) ? parseInt(na[0]) - parseInt(nb[0]) : a.data.nombre.localeCompare(b.data.nombre);
        };
        temasPrincipales.sort(ordenar);
        Object.values(subtemasPorPadre).forEach(arr => arr.sort(ordenar));
        
        // 4. Contar tarjetas por tema (incluyendo subtemas)
        function contarTarjetasDeTema(temaId) {
            const tema = temasMap[temaId];
            if (!tema) return { count: 0, tarjetas: [] };
            
            let tarjetas = [];
            
            // Tarjetas de preguntas propias
            if (tema.preguntas) {
                tema.preguntas.forEach(pregunta => {
                    const hash = generarHashPregunta(pregunta.texto);
                    if (tarjetasPorPregunta[hash]) {
                        tarjetasPorPregunta[hash].forEach(t => {
                            tarjetas.push({ ...t, preguntaTexto: pregunta.texto });
                        });
                    }
                });
            }
            
            return { count: tarjetas.length, tarjetas };
        }
        
        function contarTarjetasConSubtemas(temaId) {
            let resultado = contarTarjetasDeTema(temaId);
            let totalCount = resultado.count;
            let todasTarjetas = [...resultado.tarjetas];
            
            if (subtemasPorPadre[temaId]) {
                subtemasPorPadre[temaId].forEach(sub => {
                    const subResultado = contarTarjetasDeTema(sub.id);
                    totalCount += subResultado.count;
                    todasTarjetas.push(...subResultado.tarjetas);
                });
            }
            
            return { count: totalCount, tarjetas: todasTarjetas };
        }
        
        // 5. Renderizar
        container.innerHTML = '';
        
        if (temasPrincipales.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:#64748b;padding:40px;">No hay temas creados.</p>';
            return;
        }
        
        let hayAlgunaTarjeta = false;
        
        temasPrincipales.forEach(tema => {
            const { count, tarjetas } = contarTarjetasConSubtemas(tema.id);
            if (count > 0) hayAlgunaTarjeta = true;
            
            const franja = document.createElement('div');
            franja.className = `tema-franja ${count === 0 ? 'sin-tarjetas' : ''}`;
            franja.innerHTML = `
                <div class="tema-franja-info">
                    <span class="tema-franja-nombre">📚 ${tema.data.nombre}</span>
                    ${count > 0 ? `<span class="tema-franja-count">${count} tarjeta${count !== 1 ? 's' : ''}</span>` : '<span style="color:#94a3b8;font-size:0.85rem;">Sin tarjetas</span>'}
                </div>
                <span class="tema-franja-arrow">${count > 0 ? '→' : ''}</span>
            `;
            
            if (count > 0) {
                franja.addEventListener('click', () => abrirModoCine(tema.data.nombre, tarjetas));
            }
            
            container.appendChild(franja);
        });
        
        if (!hayAlgunaTarjeta) {
            container.innerHTML += '<p style="text-align:center;color:#94a3b8;padding:20px;font-size:0.9rem;">Aún no has añadido tarjetas a ninguna pregunta. Ve al banco de preguntas y usa el botón 📖 para añadir tarjetas visuales.</p>';
        }
        
    } catch (error) {
        console.error('Error cargando temas:', error);
        container.innerHTML = '<p style="text-align:center;color:#ef4444;padding:40px;">Error al cargar los temas.</p>';
    }
}

// Modo cine / presentación
let cineIndex = 0;
let cineTarjetas = [];

function abrirModoCine(temaNombre, tarjetas) {
    cineTarjetas = tarjetas;
    cineIndex = 0;
    
    const overlay = document.createElement('div');
    overlay.className = 'cine-overlay';
    overlay.id = 'cineOverlay';
    
    overlay.innerHTML = `
        <div class="cine-header">
            <span class="cine-titulo">📚 ${temaNombre}</span>
            <span class="cine-contador" id="cineContador">1 / ${tarjetas.length}</span>
            <button class="cine-cerrar" onclick="cerrarCine()">✕</button>
        </div>
        <div class="cine-imagen-container">
            <img class="cine-imagen" id="cineImagen" src="${tarjetas[0].url}" alt="Tarjeta">
        </div>
        <button class="cine-nav prev" id="cinePrev" onclick="navegarCine(-1)">‹</button>
        <button class="cine-nav next" id="cineNext" onclick="navegarCine(1)">›</button>
        <div class="cine-dots" id="cineDots">
            ${tarjetas.map((_, i) => `<div class="cine-dot ${i === 0 ? 'active' : ''}" onclick="irATarjeta(${i})"></div>`).join('')}
        </div>
    `;
    
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    actualizarBotonesCine();
    
    // Keyboard navigation
    document.addEventListener('keydown', manejarTeclasCine);
}

window.cerrarCine = function() {
    const overlay = document.getElementById('cineOverlay');
    if (overlay) overlay.remove();
    document.body.style.overflow = 'auto';
    document.removeEventListener('keydown', manejarTeclasCine);
};

window.navegarCine = function(dir) {
    cineIndex += dir;
    if (cineIndex < 0) cineIndex = 0;
    if (cineIndex >= cineTarjetas.length) cineIndex = cineTarjetas.length - 1;
    actualizarVistaCine();
};

window.irATarjeta = function(index) {
    cineIndex = index;
    actualizarVistaCine();
};

function actualizarVistaCine() {
    const tarjeta = cineTarjetas[cineIndex];
    document.getElementById('cineImagen').src = tarjeta.url;
    document.getElementById('cineContador').textContent = `${cineIndex + 1} / ${cineTarjetas.length}`;
    
    // Dots
    document.querySelectorAll('.cine-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === cineIndex);
    });
    
    actualizarBotonesCine();
}

function actualizarBotonesCine() {
    const prev = document.getElementById('cinePrev');
    const next = document.getElementById('cineNext');
    if (prev) prev.disabled = cineIndex === 0;
    if (next) next.disabled = cineIndex === cineTarjetas.length - 1;
}

function manejarTeclasCine(e) {
    if (e.key === 'ArrowLeft') navegarCine(-1);
    else if (e.key === 'ArrowRight') navegarCine(1);
    else if (e.key === 'Escape') cerrarCine();
}
