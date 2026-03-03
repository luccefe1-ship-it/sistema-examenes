import { db, storage, auth } from './firebase-config.js';
import { doc, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

let temaActualDigital = null;
let documentoActual = null;

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
    
    const modal = document.getElementById('modalTemaDigital');
    modal.classList.add('active');
    
    // Cargar documento si existe
    await cargarDocumentoTema(temaId);
}

// Cerrar modal
window.cerrarModalTemaDigital = function() {
    const modal = document.getElementById('modalTemaDigital');
    modal.classList.remove('active');
    temaActualDigital = null;
    documentoActual = null;
    
    // Limpiar UI
    document.getElementById('uploadArea').style.display = 'block';
    document.getElementById('documentoInfo').style.display = 'none';
    document.getElementById('documentoInput').value = '';
};

// Procesar documento subido
async function procesarDocumento(archivo) {
    // Validar tipo
    const tiposPermitidos = [
        'application/pdf',
        'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (!tiposPermitidos.includes(archivo.type)) {
        alert('Formato no permitido. Solo PDF, Word o TXT.');
        return;
    }
    
    // Validar tamaño (10MB)
    if (archivo.size > 10 * 1024 * 1024) {
        alert('Archivo muy grande. Máximo 10MB.');
        return;
    }
    
    try {
        // Mostrar loading
        const uploadArea = document.getElementById('uploadArea');
        uploadArea.innerHTML = '<div class="upload-icon">⏳</div><p>Procesando documento...</p>';
        
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
        
        alert('✅ Documento subido correctamente');
        
        // Actualizar botón en la lista de temas
        actualizarBotonTemaDigital(temaActualDigital, true);
        
    } catch (error) {
        console.error('Error procesando documento:', error);
        alert('Error al procesar el documento. Inténtalo de nuevo.');
        
        // Restaurar UI
        document.getElementById('uploadArea').innerHTML = `
            <div class="upload-icon">📁</div>
            <p><strong>Arrastra tu documento aquí</strong></p>
            <p>o haz clic para seleccionar</p>
            <p class="file-types">Formatos: PDF, Word, TXT (máx. 10MB)</p>
        `;
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
    try {
        const temaRef = doc(db, 'temas', temaId);
        const temaSnap = await getDoc(temaRef);
        
        if (temaSnap.exists() && temaSnap.data().documentoDigital) {
            documentoActual = temaSnap.data().documentoDigital;
            mostrarInfoDocumento();
        }
    } catch (error) {
        console.error('Error cargando documento:', error);
    }
}

// Mostrar información del documento
function mostrarInfoDocumento() {
    document.getElementById('uploadArea').style.display = 'none';
    document.getElementById('documentoInfo').style.display = 'block';
    
    const tamanoMB = (documentoActual.tamano / (1024 * 1024)).toFixed(2);
    const tipoTexto = documentoActual.tipo === 'application/pdf' ? 'PDF'
        : (documentoActual.tipo === 'application/msword' || documentoActual.tipo === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') ? 'Word'
        : 'TXT';
    
    document.getElementById('documentoNombre').textContent = documentoActual.nombre;
    document.getElementById('documentoDetalles').textContent = 
        `Tipo: ${tipoTexto} | Tamaño: ${tamanoMB} MB | Caracteres: ${documentoActual.textoExtraido.length.toLocaleString()}`;
    
    // Mostrar extracto
    const extracto = documentoActual.textoExtraido.substring(0, 500);
    document.getElementById('documentoExtracto').style.display = 'block';
    document.getElementById('documentoExtracto').textContent = extracto + '...';
}

// Eliminar documento
window.eliminarDocumentoTema = async function() {
    if (!confirm('¿Eliminar este documento? Esta acción no se puede deshacer.')) {
        return;
    }
    
    try {
        const temaRef = doc(db, 'temas', temaActualDigital);
        const temaSnap = await getDoc(temaRef);
        
        if (temaSnap.exists() && temaSnap.data().documentoDigital) {
            const storagePath = temaSnap.data().documentoDigital.storagePath;
            
            // Eliminar de Storage
            const storageRef = ref(storage, storagePath);
            await deleteObject(storageRef);
            
            // Eliminar de Firestore
            await updateDoc(temaRef, {
                documentoDigital: null
            });
            
            // Actualizar UI
            document.getElementById('uploadArea').style.display = 'block';
            document.getElementById('documentoInfo').style.display = 'none';
            documentoActual = null;
            
            alert('✅ Documento eliminado');
            
            // Actualizar botón
            actualizarBotonTemaDigital(temaActualDigital, false);
        }
    } catch (error) {
        console.error('Error eliminando documento:', error);
        alert('Error al eliminar el documento');
    }
};

// Actualizar botón de tema digital en la lista
function actualizarBotonTemaDigital(temaId, tieneDocumento) {
    const btn = document.querySelector(`[data-tema-id="${temaId}"] .btn-tema-digital`);
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
