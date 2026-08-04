import { auth, db, storage } from './firebase-config.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, getDocs, setDoc, deleteDoc, collection, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const LIMITE_GRATIS = 1000000;       // caracteres gratis/mes (voces WaveNet)
const VOZ_DEFAULT = 'es-ES-Wavenet-C';
const MAX_BYTES_CHUNK = 4500;        // límite de la API: 5000 bytes/petición

let currentUser = null;
let apiKeyTTS = null;

// ---- Auth + navbar ----
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const userDoc = await getDoc(doc(db, "usuarios", user.uid));
        document.getElementById('userName').textContent = userDoc.exists() ? userDoc.data().nombre : user.email;
        await cargarApiKey();
        await Promise.all([cargarConsumo(), cargarAudios()]);
    } else {
        window.location.href = 'index.html';
    }
});

document.getElementById('backBtn').addEventListener('click', () => window.location.href = 'homepage.html');
document.getElementById('logoutBtn').addEventListener('click', async () => { await signOut(auth); window.location.href = 'index.html'; });

/* La clave de Google TTS ya no se descarga al navegador: vive solo en
   Vercel y la síntesis se hace en /api/tts. Antes cualquier usuario
   registrado podía leerla en Firestore y gastarla por su cuenta. */
async function cargarApiKey() {
    apiKeyTTS = 'servidor'; // se conserva la variable para no tocar el resto del flujo
}

// Cabecera con el token de sesión, que el endpoint comprueba
async function cabecerasApi() {
    const cabeceras = { 'Content-Type': 'application/json' };
    try {
        const usuario = auth.currentUser;
        if (usuario) cabeceras.Authorization = `Bearer ${await usuario.getIdToken()}`;
    } catch (e) {
        console.error('No se pudo obtener el token de sesión:', e);
    }
    return cabeceras;
}

// ====== SUBIDA ======
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

// Trocear el texto respetando el límite de bytes de la API
function dividirEnTrozos(texto) {
    const enc = new TextEncoder();
    const limpio = texto.replace(/\r/g, '').trim();
    const partes = limpio.match(/[^.!?\n]+[.!?\n]*/g) || [limpio];
    const trozos = [];
    let buffer = '';

    for (const parte of partes) {
        if (enc.encode(parte).length > MAX_BYTES_CHUNK) {
            // Fragmento aislado demasiado largo: cortar a lo bruto
            if (buffer.trim()) { trozos.push(buffer); buffer = ''; }
            let resto = parte;
            while (enc.encode(resto).length > MAX_BYTES_CHUNK) {
                const corte = Math.floor(MAX_BYTES_CHUNK / 2);
                trozos.push(resto.slice(0, corte));
                resto = resto.slice(corte);
            }
            buffer = resto;
            continue;
        }
        if (enc.encode(buffer + parte).length > MAX_BYTES_CHUNK) {
            trozos.push(buffer);
            buffer = parte;
        } else {
            buffer += parte;
        }
    }
    if (buffer.trim()) trozos.push(buffer);
    return trozos.filter(t => t.trim());
}

// Llamar a Google Cloud TTS para un trozo → MP3 en base64
async function sintetizarTrozo(texto, voz) {
    const resp = await fetch('/api/tts', {
        method: 'POST',
        headers: await cabecerasApi(),
        body: JSON.stringify({ texto, voz })
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        throw new Error(data.error || `El servidor devolvió ${resp.status}`);
    }
    return data.audioContent;
}

function base64ABytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

// Generar el MP3 completo de un documento
async function generarAudio(texto, voz, onProgreso) {
    const trozos = dividirEnTrozos(texto);
    const partes = [];
    let caracteres = 0;

    for (let i = 0; i < trozos.length; i++) {
        onProgreso(i + 1, trozos.length);
        const b64 = await sintetizarTrozo(trozos[i], voz);
        partes.push(base64ABytes(b64));
        caracteres += trozos[i].length;
    }

    const total = partes.reduce((s, p) => s + p.length, 0);
    const todo = new Uint8Array(total);
    let off = 0;
    for (const p of partes) { todo.set(p, off); off += p.length; }

    return { blob: new Blob([todo], { type: 'audio/mpeg' }), caracteres };
}

async function procesarArchivos(fileList) {
    const archivos = Array.from(fileList).filter(f => f.name.toLowerCase().endsWith('.docx'));
    if (archivos.length === 0) {
        estadoSubida.textContent = '⚠️ Solo se admiten archivos .docx';
        setTimeout(() => { estadoSubida.textContent = ''; }, 4000);
        return;
    }
    if (!apiKeyTTS) {
        estadoSubida.textContent = '❌ No se encontró la API key (config/keys → googleTTS_web)';
        return;
    }

    btnSeleccionar.disabled = true;

    // 1. Extraer textos
    estadoSubida.textContent = 'Leyendo documentos...';
    const docs = [];
    for (const archivo of archivos) {
        try {
            const texto = (await extraerTextoWord(archivo)).trim();
            if (texto) docs.push({ archivo, texto });
            else console.warn('Documento vacío:', archivo.name);
        } catch (e) {
            console.error('Error leyendo', archivo.name, e);
        }
    }
    if (docs.length === 0) {
        btnSeleccionar.disabled = false;
        estadoSubida.textContent = '❌ No se pudo leer ningún documento';
        setTimeout(() => { estadoSubida.textContent = ''; }, 4000);
        return;
    }

    // 2. Comprobar consumo y avisar si va a haber coste
    const totalChars = docs.reduce((s, d) => s + d.texto.length, 0);
    const consumo = await leerConsumoActual();
    const yaUsado = consumo.mes === mesActual() ? consumo.caracteres : 0;
    if (yaUsado + totalChars > LIMITE_GRATIS) {
        const exceso = (yaUsado + totalChars) - LIMITE_GRATIS;
        const coste = (exceso / 1000000 * 4).toFixed(2);
        const ok = confirm(
            `Esta subida son ~${totalChars.toLocaleString('es-ES')} caracteres.\n\n` +
            `Superará el millón gratis de este mes. Excedente estimado: ` +
            `${exceso.toLocaleString('es-ES')} caracteres ≈ ${coste} $ (Google cobra ~4 $/millón con WaveNet).\n\n` +
            `¿Continuar?`
        );
        if (!ok) {
            btnSeleccionar.disabled = false;
            estadoSubida.textContent = '';
            return;
        }
    }

    // 3. Generar + subir cada documento
    const voz = document.getElementById('selectorVoz').value || VOZ_DEFAULT;
    let subidos = 0;

    for (let i = 0; i < docs.length; i++) {
        const { archivo, texto } = docs[i];
        try {
            const { blob, caracteres } = await generarAudio(texto, voz, (t, total) => {
                estadoSubida.textContent = `Generando ${i + 1}/${docs.length} · ${archivo.name} · fragmento ${t}/${total}...`;
            });

            const audioId = 'audio_' + Date.now() + '_' + i;
            const storagePath = `audios/${currentUser.uid}/${audioId}.mp3`;
            const storageRef = ref(storage, storagePath);
            const snapshot = await uploadBytes(storageRef, blob);
            const url = await getDownloadURL(snapshot.ref);

            await setDoc(doc(db, `usuarios/${currentUser.uid}/audios`, audioId), {
                nombre: archivo.name.replace(/\.docx$/i, ''),
                storagePath,
                url,
                caracteres,
                voz,
                fechaCreacion: Date.now()
            });

            await sumarConsumo(caracteres);
            subidos++;
        } catch (error) {
            console.error('Error procesando', archivo.name, error);
            estadoSubida.textContent = `❌ Error con ${archivo.name}: ${error.message}`;
            await new Promise(r => setTimeout(r, 3000));
        }
    }

    btnSeleccionar.disabled = false;
    inputArchivos.value = '';
    if (subidos > 0) estadoSubida.textContent = `✅ ${subidos} audio(s) generado(s)`;
    setTimeout(() => { estadoSubida.textContent = ''; }, 5000);
    await Promise.all([cargarConsumo(), cargarAudios()]);
}

// ====== CONTADOR DE CONSUMO (compartido) ======
function mesActual() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

async function leerConsumoActual() {
    try {
        const snap = await getDoc(doc(db, 'ttsUsage', 'actual'));
        if (snap.exists()) return snap.data();
    } catch (e) { console.error('Error leyendo consumo:', e); }
    return { mes: mesActual(), caracteres: 0 };
}

/* El contador lo lleva ahora /api/tts con permisos de servidor.
   Antes lo escribía el navegador, así que cualquier usuario podía
   ponerlo a cero y seguir gastando sin que constara. Se conserva la
   función para no tocar quien la llama; solo refresca la pantalla. */
async function sumarConsumo(chars) {
    await cargarConsumo();
}

async function cargarConsumo() {
    const datos = await leerConsumoActual();
    const usado = datos.mes === mesActual() ? datos.caracteres : 0;
    const pct = Math.min(100, (usado / LIMITE_GRATIS) * 100);

    document.getElementById('consumoCifra').textContent =
        usado.toLocaleString('es-ES') + ' / 1.000.000';

    const barra = document.getElementById('consumoProgreso');
    barra.style.width = pct + '%';
    barra.className = 'consumo-progreso ' +
        (usado >= LIMITE_GRATIS ? 'rojo' : usado >= LIMITE_GRATIS * 0.7 ? 'naranja' : 'verde');

    const texto = document.getElementById('consumoTexto');
    if (usado >= LIMITE_GRATIS) {
        const exceso = usado - LIMITE_GRATIS;
        const coste = (exceso / 1000000 * 4).toFixed(2);
        texto.textContent = `⚠️ Se ha superado el millón gratis de este mes. Excedente: ${exceso.toLocaleString('es-ES')} caracteres ≈ ${coste} $. A partir de aquí Google cobra ~4 $ por millón (voces WaveNet). El contador se reinicia el día 1.`;
        texto.className = 'consumo-texto alerta';
    } else {
        const restan = LIMITE_GRATIS - usado;
        texto.textContent = `Quedan ${restan.toLocaleString('es-ES')} caracteres gratis este mes (se reinicia el día 1). Pasado el millón, Google cobra ~4 $ por millón con voces WaveNet. El contador es compartido por todos los usuarios.`;
        texto.className = 'consumo-texto';
    }
}

// ====== LISTA DE AUDIOS ======
async function cargarAudios() {
    const container = document.getElementById('listaAudios');
    try {
        const q = query(collection(db, `usuarios/${currentUser.uid}/audios`), orderBy('fechaCreacion', 'desc'));
        const snap = await getDocs(q);

        container.innerHTML = '';
        if (snap.empty) {
            container.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:40px;font-size:0.95rem;">Aún no has generado ningún audio. Sube un documento Word para empezar.</p>';
            return;
        }

        snap.forEach(d => {
            const data = d.data();
            const fecha = new Date(data.fechaCreacion).toLocaleDateString('es-ES');
            const franja = document.createElement('div');
            franja.className = 'audio-franja';
            franja.innerHTML = `
                <div class="audio-franja-top">
                    <div class="audio-franja-info">
                        <span style="font-size:1.3rem;">🎧</span>
                        <div style="min-width:0;">
                            <div class="audio-franja-nombre">${data.nombre}</div>
                            <div class="audio-franja-meta">${fecha} · ${(data.caracteres || 0).toLocaleString('es-ES')} caracteres</div>
                        </div>
                    </div>
                    <button class="btn-borrar" title="Eliminar">🗑️</button>
                </div>
                <audio controls preload="none" src="${data.url}"></audio>
            `;
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
