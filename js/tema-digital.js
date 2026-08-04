import { db, storage, auth } from './firebase-config.js';
import { doc, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

let temaActualDigital = null;
let documentoActual = null;
// Evita que una carga lenta de un tema anterior pise la UI del tema actual
let peticionCargaActual = 0;

/* ------------------------------------------------------------------
   Estados del modal. Solo uno visible a la vez.
   'cargando'      -> consultando Firestore
   'sin-documento' -> el tema no tiene tema digital: se ofrece subirlo
   'con-documento' -> el tema sí lo tiene: se muestra
   'procesando'    -> subiendo/extrayendo texto
   'error'         -> no se ha podido consultar; con botón de reintento
------------------------------------------------------------------ */
function mostrarEstado(estado, opciones = {}) {
    const bloqueEstado = document.getElementById('temaDigitalEstado');
    const uploadArea = document.getElementById('uploadArea');
    const documentoInfo = document.getElementById('documentoInfo');
    const icono = document.getElementById('temaDigitalEstadoIcono');
    const texto = document.getElementById('temaDigitalEstadoTexto');
    const boton = document.getElementById('temaDigitalEstadoBoton');

    if (!bloqueEstado || !uploadArea || !documentoInfo) return;

    const transitorio = estado === 'cargando' || estado === 'procesando' || estado === 'error';

    bloqueEstado.style.display = transitorio ? 'block' : 'none';
    uploadArea.style.display = estado === 'sin-documento' ? 'block' : 'none';
    documentoInfo.style.display = estado === 'con-documento' ? 'block' : 'none';
    bloqueEstado.classList.toggle('is-error', estado === 'error');

    if (transitorio) {
        const porDefecto = {
            cargando: { icono: '⏳', texto: 'Comprobando si este tema tiene documento…' },
            procesando: { icono: '⏳', texto: 'Procesando documento…' },
            error: { icono: '⚠️', texto: 'No se ha podido comprobar el tema digital.' }
        }[estado];

        icono.textContent = opciones.icono || porDefecto.icono;
        texto.textContent = opciones.texto || porDefecto.texto;

        if (opciones.boton) {
            boton.style.display = 'inline-block';
            boton.textContent = opciones.boton;
            boton.onclick = opciones.onBoton || null;
        } else {
            boton.style.display = 'none';
            boton.onclick = null;
        }
    }
}

// Inicializar eventos del modal
export function inicializarTemaDigital() {
    const uploadArea = document.getElementById('uploadArea');
    const documentoInput = document.getElementById('documentoInput');
    
    // Click en área de upload
    uploadArea.addEventListener('click', () => {
        documentoInput.click();
    });
    
    // Drag & Drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('drag-over');
    });
    
    uploadArea.addEventListener('drop', async (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        
        const archivo = e.dataTransfer.files[0];
        if (archivo) {
            await procesarDocumento(archivo);
        }
    });
    
    // Selección de archivo
    documentoInput.addEventListener('change', async (e) => {
        const archivo = e.target.files[0];
        if (archivo) {
            await procesarDocumento(archivo);
        }
    });
}

// Abrir modal de tema digital
export async function abrirModalTemaDigital(temaId) {
    temaActualDigital = temaId;
    documentoActual = null;

    const modal = document.getElementById('modalTemaDigital');
    modal.classList.add('active');

    // Partimos siempre de cero: nada de heredar el estado del tema anterior
    document.getElementById('documentoInput').value = '';
    document.getElementById('documentoExtracto').style.display = 'none';
    document.getElementById('documentoExtracto').textContent = '';
    mostrarEstado('cargando');

    await cargarDocumentoTema(temaId);
}

// Cerrar modal
window.cerrarModalTemaDigital = function() {
    const modal = document.getElementById('modalTemaDigital');
    modal.classList.remove('active');
    temaActualDigital = null;
    documentoActual = null;
    peticionCargaActual++; // invalida cualquier carga en vuelo

    // Limpiar UI
    mostrarEstado('cargando');
    document.getElementById('documentoInput').value = '';
    document.getElementById('documentoExtracto').style.display = 'none';
    document.getElementById('documentoExtracto').textContent = '';
};

// Procesar documento subido
async function procesarDocumento(archivo) {
    if (!temaActualDigital) return;

    // Validar tipo
    const tiposPermitidos = [
        'application/pdf',
        'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (!tiposPermitidos.includes(archivo.type)) {
        alert('Formato no permitido. Solo PDF, Word o TXT.');
        document.getElementById('documentoInput').value = '';
        return;
    }

    // Validar tamaño (10MB)
    if (archivo.size > 10 * 1024 * 1024) {
        alert('Archivo muy grande. Máximo 10MB.');
        document.getElementById('documentoInput').value = '';
        return;
    }

    try {
        mostrarEstado('procesando', { texto: `Procesando "${archivo.name}"…` });

        // Extraer texto según tipo
        let textoExtraido = '';
        
        if (archivo.type === 'text/plain') {
            textoExtraido = await archivo.text();
        } else if (archivo.type === 'application/pdf') {
            textoExtraido = await extraerTextoPDF(archivo);
        } else if (
            archivo.type === 'application/msword' ||
            archivo.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ) {
            textoExtraido = await extraerTextoWord(archivo);
        }
        
        // Subir a Firebase Storage
        const currentUser = auth.currentUser;
        if (!currentUser) {
            alert('Error: Usuario no autenticado');
            mostrarEstado('sin-documento');
            document.getElementById('documentoInput').value = '';
            return;
        }
        const storageRef = ref(storage, `temas-digitales/${currentUser.uid}/${archivo.name}`);
        const snapshot = await uploadBytes(storageRef, archivo);
        const downloadURL = await getDownloadURL(snapshot.ref);
        
        // Guardar en Firestore
        const temaRef = doc(db, 'temas', temaActualDigital);
        await updateDoc(temaRef, {
            documentoDigital: {
                nombre: archivo.name,
                tipo: archivo.type,
                tamano: archivo.size,
                url: downloadURL,
                textoExtraido: textoExtraido,
                fechaSubida: new Date().toISOString(),
                storagePath: snapshot.ref.fullPath
            }
        });
        
        documentoActual = {
            nombre: archivo.name,
            tipo: archivo.type,
            tamano: archivo.size,
            url: downloadURL,
            textoExtraido: textoExtraido
        };
        
        // Mostrar info del documento
        mostrarInfoDocumento();
        document.getElementById('documentoInput').value = '';

        alert('✅ Documento subido correctamente');

        // Actualizar botón en la lista de temas
        actualizarBotonTemaDigital(temaActualDigital, true);

    } catch (error) {
        console.error('Error procesando documento:', error);
        alert('Error al procesar el documento. Inténtalo de nuevo.');

        // Volvemos al estado "sin documento" para poder reintentar la subida
        document.getElementById('documentoInput').value = '';
        mostrarEstado('sin-documento');
    }
}

// Extraer texto de Word usando mammoth.js
async function extraerTextoWord(archivo) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const arrayBuffer = e.target.result;
                const result = await mammoth.extractRawText({ arrayBuffer });
                resolve(result.value);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(archivo);
    });
}

// Extraer texto de PDF usando pdf.js
async function extraerTextoPDF(archivo) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = async function(e) {
            try {
                const typedArray = new Uint8Array(e.target.result);
                const pdf = await pdfjsLib.getDocument(typedArray).promise;
                
                let textoCompleto = '';
                
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(' ');
                    textoCompleto += pageText + '\n\n';
                }
                
                resolve(textoCompleto);
            } catch (error) {
                reject(error);
            }
        };
        
        reader.onerror = reject;
        reader.readAsArrayBuffer(archivo);
    });
}

// Cargar documento existente
async function cargarDocumentoTema(temaId) {
    const idPeticion = ++peticionCargaActual;

    try {
        const temaRef = doc(db, 'temas', temaId);
        const temaSnap = await getDoc(temaRef);

        // Si mientras tanto se ha cerrado el modal o se ha abierto otro tema, no pintamos
        if (idPeticion !== peticionCargaActual || temaActualDigital !== temaId) return;

        const documento = temaSnap.exists() ? temaSnap.data().documentoDigital : null;

        if (documento && documento.nombre) {
            documentoActual = documento;
            mostrarInfoDocumento();
        } else {
            // El tema no tiene documento: ofrecemos subirlo
            documentoActual = null;
            mostrarEstado('sin-documento');
        }
    } catch (error) {
        console.error('Error cargando documento:', error);

        if (idPeticion !== peticionCargaActual) return;

        documentoActual = null;
        mostrarEstado('error', {
            texto: 'No se ha podido comprobar si este tema tiene documento.',
            boton: 'Reintentar',
            onBoton: () => {
                mostrarEstado('cargando');
                cargarDocumentoTema(temaId);
            }
        });
    }
}

// Mostrar información del documento
function mostrarInfoDocumento() {
    if (!documentoActual) {
        mostrarEstado('sin-documento');
        return;
    }

    mostrarEstado('con-documento');

    const texto = typeof documentoActual.textoExtraido === 'string' ? documentoActual.textoExtraido : '';
    const tamano = Number(documentoActual.tamano) || 0;
    const tamanoMB = (tamano / (1024 * 1024)).toFixed(2);
    const tipoTexto = documentoActual.tipo === 'application/pdf' ? 'PDF'
        : (documentoActual.tipo === 'application/msword' || documentoActual.tipo === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') ? 'Word'
        : 'TXT';

    document.getElementById('documentoNombre').textContent = documentoActual.nombre || 'Documento sin nombre';
    document.getElementById('documentoDetalles').textContent =
        `Tipo: ${tipoTexto} | Tamaño: ${tamanoMB} MB | Caracteres: ${texto.length.toLocaleString()}`;

    // Mostrar extracto
    const extractoEl = document.getElementById('documentoExtracto');
    if (texto.length > 0) {
        extractoEl.style.display = 'block';
        extractoEl.textContent = texto.substring(0, 500) + (texto.length > 500 ? '…' : '');
    } else {
        extractoEl.style.display = 'block';
        extractoEl.textContent = 'No se pudo extraer texto de este documento. Elimínalo y vuelve a subirlo si quieres usarlo en las explicaciones.';
    }
}

// Eliminar documento
window.eliminarDocumentoTema = async function() {
    if (!confirm('¿Eliminar este documento? Esta acción no se puede deshacer.')) {
        return;
    }
    
    const temaId = temaActualDigital;

    try {
        mostrarEstado('procesando', { icono: '🗑️', texto: 'Eliminando documento…' });

        const temaRef = doc(db, 'temas', temaId);
        const temaSnap = await getDoc(temaRef);

        if (temaSnap.exists() && temaSnap.data().documentoDigital) {
            const storagePath = temaSnap.data().documentoDigital.storagePath;

            // Eliminar de Storage (si el fichero ya no está, seguimos igualmente)
            if (storagePath) {
                try {
                    await deleteObject(ref(storage, storagePath));
                } catch (errStorage) {
                    console.warn('El fichero ya no estaba en Storage:', errStorage);
                }
            }

            // Eliminar de Firestore
            await updateDoc(temaRef, {
                documentoDigital: null
            });
        }

        // Actualizar UI
        documentoActual = null;
        document.getElementById('documentoInput').value = '';
        document.getElementById('documentoExtracto').style.display = 'none';
        document.getElementById('documentoExtracto').textContent = '';
        mostrarEstado('sin-documento');

        alert('✅ Documento eliminado');

        // Actualizar botón
        actualizarBotonTemaDigital(temaId, false);

    } catch (error) {
        console.error('Error eliminando documento:', error);
        alert('Error al eliminar el documento');

        // Recuperamos el estado real consultando de nuevo
        mostrarEstado('cargando');
        await cargarDocumentoTema(temaId);
    }
};

// Actualizar botón de tema digital en la lista
function actualizarBotonTemaDigital(temaId, tieneDocumento) {
    // La lista de temas no lleva data-tema-id, así que localizamos el botón por su onclick
    const btn = document.querySelector(`.btn-tema-digital[onclick*="'${temaId}'"]`)
        || document.querySelector(`[data-tema-id="${temaId}"] .btn-tema-digital`);
    if (btn) {
        if (tieneDocumento) {
            btn.classList.add('has-document');
            btn.innerHTML = '✅ Tema Digital';
        } else {
            btn.classList.remove('has-document');
            btn.innerHTML = '📄 Tema Digital';
        }
    }
}

// Buscar contexto en documento (para usar en tests)
export async function buscarContextoEnDocumento(pregunta, temaId) {
    try {
        const temaRef = doc(db, 'temas', temaId);
        const temaSnap = await getDoc(temaRef);
        
        if (!temaSnap.exists() || !temaSnap.data().documentoDigital) {
            return null;
        }
        
        const texto = temaSnap.data().documentoDigital.textoExtraido;
        const preguntaTexto = pregunta.texto || pregunta.pregunta;
        
        console.log('=== BÚSQUEDA AUTOMÁTICA ===');
        console.log('Texto pregunta:', preguntaTexto);
        
        // 1. Búsqueda literal por texto de pregunta
        let indice = texto.toLowerCase().indexOf(preguntaTexto.toLowerCase());
        
        if (indice !== -1) {
            console.log('✅ Encontrado por texto de pregunta literal');
            return extraerContexto(texto, indice, preguntaTexto.length);
        }
        
        // 2. Búsqueda por respuesta correcta
        const respuestaCorrecta = obtenerTextoRespuestaCorrecta(pregunta);
        if (respuestaCorrecta) {
            console.log('Buscando por respuesta correcta:', respuestaCorrecta);
            indice = texto.toLowerCase().indexOf(respuestaCorrecta.toLowerCase());
            
            if (indice !== -1) {
                console.log('✅ Encontrado por respuesta correcta literal');
                return extraerContexto(texto, indice, respuestaCorrecta.length);
            }
        }
        
        // 3. Búsqueda por palabras clave de la pregunta
        const palabrasClave = extraerPalabrasClave(preguntaTexto);
        console.log('Palabras clave pregunta:', palabrasClave);
        
        for (const palabra of palabrasClave) {
            indice = texto.toLowerCase().indexOf(palabra.toLowerCase());
            if (indice !== -1) {
                console.log('✅ Encontrado por palabra clave:', palabra);
                return extraerContexto(texto, indice, palabra.length);
            }
        }
        
        // 4. Búsqueda por palabras clave de respuesta correcta
        if (respuestaCorrecta) {
            const palabrasRespuesta = extraerPalabrasClave(respuestaCorrecta);
            console.log('Palabras clave respuesta:', palabrasRespuesta);
            
            for (const palabra of palabrasRespuesta) {
                indice = texto.toLowerCase().indexOf(palabra.toLowerCase());
                if (indice !== -1) {
                    console.log('✅ Encontrado por palabra clave respuesta:', palabra);
                    return extraerContexto(texto, indice, palabra.length);
                }
            }
        }
        
        // 5. Búsqueda por epígrafe si existe
        if (pregunta.epigrafe || pregunta.temaEpigrafe) {
            const epigrafe = pregunta.epigrafe || pregunta.temaEpigrafe;
            console.log('Buscando por epígrafe:', epigrafe);
            indice = texto.toLowerCase().indexOf(epigrafe.toLowerCase());
            if (indice !== -1) {
                console.log('✅ Encontrado por epígrafe');
                return extraerContexto(texto, indice, epigrafe.length);
            }
        }
        
        console.log('❌ No se encontró contexto');
        return null;
        
    } catch (error) {
        console.error('Error buscando contexto:', error);
        return null;
    }
}

function obtenerTextoRespuestaCorrecta(pregunta) {
    if (!pregunta.opciones || !pregunta.respuestaCorrecta) {
        return null;
    }
    
    const opcionCorrecta = pregunta.opciones.find(
        op => op.letra === pregunta.respuestaCorrecta || op.esCorrecta === true
    );
    
    return opcionCorrecta ? opcionCorrecta.texto : null;
}

// Extraer contexto alrededor de la coincidencia
function extraerContexto(texto, indice, longitudCoincidencia) {
    const margen = 300; // caracteres antes y después
    const inicio = Math.max(0, indice - margen);
    const fin = Math.min(texto.length, indice + longitudCoincidencia + margen);
    
    let contexto = texto.substring(inicio, fin);
    
    // Marcar la coincidencia
    const coincidencia = texto.substring(indice, indice + longitudCoincidencia);
    contexto = contexto.replace(
        new RegExp(coincidencia.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
        `<mark>${coincidencia}</mark>`
    );
    
    return {
        contexto: contexto,
        encontrado: true,
        posicion: indice
    };
}

// Extraer palabras clave de la pregunta
function extraerPalabrasClave(pregunta) {
    const palabrasIgnorar = new Set([
        'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
        'de', 'del', 'al', 'en', 'por', 'para', 'con', 'sin',
        'que', 'cual', 'como', 'cuando', 'donde', 'quien',
        'es', 'son', 'ser', 'estar', 'hay', 'tiene', 'según'
    ]);
    
    return pregunta
        .toLowerCase()
        .replace(/[^\wáéíóúñü\s]/g, ' ')
        .split(/\s+/)
        .filter(p => p.length > 4 && !palabrasIgnorar.has(p))
        .slice(0, 5);
}
