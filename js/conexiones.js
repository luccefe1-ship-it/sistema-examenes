import { auth, db, storage } from './firebase-config.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, getDocs, setDoc, deleteDoc, collection, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

let currentUser = null;

// ---- Auth + navbar ----
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const userDoc = await getDoc(doc(db, "usuarios", user.uid));
        document.getElementById('userName').textContent = userDoc.exists() ? userDoc.data().nombre : user.email;
        await cargarAudios();
    } else {
        window.location.href = 'index.html';
    }
});

document.getElementById('backBtn').addEventListener('click', () => { detenerLectura(); window.location.href = 'homepage.html'; });
document.getElementById('logoutBtn').addEventListener('click', async () => { detenerLectura(); await signOut(auth); window.location.href = 'index.html'; });

// ====== SUBIDA DE ARCHIVOS ======
const inputArchivos = document.getElementById('inputArchivos');
const btnSeleccionar = document.getElementById('btnSeleccionar');
const uploadZone = document.getElementById('uploadZone');
const estadoSubida = document.getElementById('estadoSubida');

btnSeleccionar.addEventListener('click', () => inputArchivos.click());
inputArchivos.addEventListener('change', () => procesarArchivos(inputArchivos.files));

uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    procesarArchivos(e.dataTransfer.files);
});

// Extraer texto de Word con mammoth.js
function extraerTextoWord(archivo) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const result = await mammoth.extractRawText({ arrayBuffer: e.target.result });
                resolve(result.value);
            } catch (error) { reject(error); }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(archivo);
    });
}

async function procesarArchivos(fileList) {
    const archivos = Array.from(fileList).filter(f => f.name.toLowerCase().endsWith('.docx'));
    if (archivos.length === 0) {
        estadoSubida.textContent = '⚠️ Solo se admiten archivos .docx';
        setTimeout(() => { estadoSubida.textContent = ''; }, 4000);
        return;
    }

    btnSeleccionar.disabled = true;
    let subidos = 0;

    for (let i = 0; i < archivos.length; i++) {
        const archivo = archivos[i];
        estadoSubida.textContent = `Procesando ${i + 1}/${archivos.length}: ${archivo.name}...`;
        try {
            const texto = (await extraerTextoWord(archivo)).trim();
            if (!texto) { console.warn('Documento vacío:', archivo.name); continue; }
            if (texto.length > 900000) { console.warn('Documento demasiado largo:', archivo.name); continue; }

            const audioId = 'audio_' + Date.now() + '_' + i;
            const storagePath = `audios/${currentUser.uid}/${audioId}.docx`;

            const storageRef = ref(storage, storagePath);
            const snapshot = await uploadBytes(storageRef, archivo);
            const url = await getDownloadURL(snapshot.ref);

            await setDoc(doc(db, `usuarios/${currentUser.uid}/audios`, audioId), {
                nombre: archivo.name.replace(/\.docx$/i, ''),
                storagePath,
                url,
                texto,
                fechaCreacion: Date.now()
            });
            subidos++;
        } catch (error) {
            console.error('Error procesando', archivo.name, error);
        }
    }

    btnSeleccionar.disabled = false;
    inputArchivos.value = '';
    estadoSubida.textContent = subidos > 0 ? `✅ ${subidos} archivo(s) subido(s)` : '❌ No se pudo subir ningún archivo';
    setTimeout(() => { estadoSubida.textContent = ''; }, 4000);
    await cargarAudios();
}

// ====== LISTA DE AUDIOS ======
let audiosCache = {};

async function cargarAudios() {
    const container = document.getElementById('listaAudios');
    try {
        const q = query(collection(db, `usuarios/${currentUser.uid}/audios`), orderBy('fechaCreacion', 'desc'));
        const snap = await getDocs(q);

        container.innerHTML = '';
        audiosCache = {};

        if (snap.empty) {
            container.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:40px;font-size:0.95rem;">Aún no has subido ningún audio. Sube un documento Word para empezar.</p>';
            return;
        }

        snap.forEach(d => {
            const data = d.data();
            audiosCache[d.id] = data;

            const franja = document.createElement('div');
            franja.className = 'audio-franja';
            franja.dataset.id = d.id;
            franja.innerHTML = `
                <div class="audio-franja-info">
                    <span style="font-size:1.3rem;">📄</span>
                    <span class="audio-franja-nombre">${data.nombre}</span>
                </div>
                <div class="audio-franja-acciones">
                    <button class="btn-escuchar">▶ Escuchar</button>
                    <button class="btn-borrar" title="Eliminar">🗑️</button>
                </div>
            `;
            franja.querySelector('.btn-escuchar').addEventListener('click', () => reproducirAudio(d.id));
            franja.querySelector('.btn-borrar').addEventListener('click', () => borrarAudio(d.id, data));
            container.appendChild(franja);
        });
    } catch (error) {
        console.error('Error cargando audios:', error);
        container.innerHTML = '<p style="text-align:center;color:#ef4444;padding:40px;">Error al cargar los audios.</p>';
    }
}

async function borrarAudio(audioId, data) {
    if (!confirm(`¿Eliminar "${data.nombre}"?`)) return;
    try {
        if (idReproduciendo === audioId) detenerLectura();
        await deleteDoc(doc(db, `usuarios/${currentUser.uid}/audios`, audioId));
        if (data.storagePath) {
            try { await deleteObject(ref(storage, data.storagePath)); } catch (e) { console.warn('Storage:', e); }
        }
        await cargarAudios();
    } catch (error) {
        console.error('Error al eliminar:', error);
        alert('No se pudo eliminar el audio.');
    }
}

// ====== LECTURA EN VOZ ALTA (Web Speech API) ======
const synth = window.speechSynthesis;
let fragmentos = [];
let fragmentoActual = 0;
let idReproduciendo = null;
let generacionLectura = 0;
let vozES = null;

function cargarVoz() {
    const voces = synth.getVoices();
    vozES = voces.find(v => v.lang === 'es-ES') || voces.find(v => v.lang.startsWith('es')) || null;
}
cargarVoz();
if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = cargarVoz;

// Divide el texto en trozos cortos: evita el corte de speechSynthesis en textos largos
function dividirTexto(texto) {
    const limpio = texto.replace(/\s+/g, ' ').trim();
    const frases = limpio.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [limpio];
    const trozos = [];
    let buffer = '';
    frases.forEach(frase => {
        if ((buffer + frase).length > 200) {
            if (buffer.trim()) trozos.push(buffer.trim());
            buffer = frase;
        } else {
            buffer += frase;
        }
    });
    if (buffer.trim()) trozos.push(buffer.trim());
    return trozos;
}

const reproductor = document.getElementById('reproductor');
const reproductorTitulo = document.getElementById('reproductorTitulo');
const reproductorProgreso = document.getElementById('reproductorProgreso');
const btnPausaReanudar = document.getElementById('btnPausaReanudar');
const btnDetener = document.getElementById('btnDetener');

function reproducirAudio(audioId) {
    const data = audiosCache[audioId];
    if (!data || !data.texto) return;

    synth.cancel();
    generacionLectura++;
    const gen = generacionLectura;

    idReproduciendo = audioId;
    fragmentos = dividirTexto(data.texto);
    fragmentoActual = 0;

    reproductorTitulo.textContent = '🔊 ' + data.nombre;
    reproductorProgreso.style.width = '0%';
    reproductor.classList.add('activo');
    btnPausaReanudar.textContent = '⏸';
    marcarFranjaActiva(audioId);

    setTimeout(() => hablarFragmento(gen), 60);
}

function hablarFragmento(gen) {
    if (gen !== generacionLectura) return;

    if (fragmentoActual >= fragmentos.length) {
        reproductorProgreso.style.width = '100%';
        setTimeout(() => { if (gen === generacionLectura) detenerLectura(); }, 600);
        return;
    }

    const u = new SpeechSynthesisUtterance(fragmentos[fragmentoActual]);
    u.lang = 'es-ES';
    if (vozES) u.voice = vozES;
    u.rate = 1;

    u.onend = () => {
        if (gen !== generacionLectura) return;
        fragmentoActual++;
        reproductorProgreso.style.width = Math.round((fragmentoActual / fragmentos.length) * 100) + '%';
        hablarFragmento(gen);
    };
    u.onerror = () => {
        if (gen !== generacionLectura) return;
        fragmentoActual++;
        hablarFragmento(gen);
    };

    synth.speak(u);
}

btnPausaReanudar.addEventListener('click', () => {
    if (synth.paused) {
        synth.resume();
        btnPausaReanudar.textContent = '⏸';
    } else if (synth.speaking) {
        synth.pause();
        btnPausaReanudar.textContent = '▶';
    }
});

btnDetener.addEventListener('click', detenerLectura);

function detenerLectura() {
    generacionLectura++;
    idReproduciendo = null;
    fragmentos = [];
    fragmentoActual = 0;
    synth.cancel();
    reproductor.classList.remove('activo');
    reproductorProgreso.style.width = '0%';
    btnPausaReanudar.textContent = '⏸';
    marcarFranjaActiva(null);
}

function marcarFranjaActiva(audioId) {
    document.querySelectorAll('.audio-franja').forEach(f => {
        f.classList.toggle('reproduciendo', f.dataset.id === audioId);
    });
}

window.addEventListener('beforeunload', () => synth.cancel());
