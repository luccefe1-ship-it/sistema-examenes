import { auth, db } from './firebase-config.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    doc, 
    getDoc, 
    updateDoc,
    addDoc, 
    deleteDoc, 
    getDocs, 
    query, 
    where, 
    collection, 
    writeBatch,
    setDoc  // <-- AÑADIR ESTA LÍNEA
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
// Variables globales
let currentUser = null;
let temaSeleccionado = null;
let preguntasProcesadas = [];
let temasAbiertos = new Set(); // Para recordar qué temas están expandidos
let preguntasImportadas = [];
// Cache para temas cargados
let cacheTemas = null;
let cacheTimestamp = null;
const CACHE_DURACION = 5 * 60 * 1000; // 5 minutos
let cacheResultados = null;
let cacheResultadosTimestamp = null;

// Flags para evitar múltiples cargas simultáneas
let cargandoBanco = false;
let cargandoResultados = false;
let cargandoTemasTest = false;
// Exponer para diagnóstico
window.testActual = null;
window.testActual = null;

// Función de diagnóstico global
window.diagnosticarTema5 = async function() {
    console.log('=== DIAGNÓSTICO TEMA 5 ===');
    
    const tema5Query = query(collection(db, "temas"), where("usuarioId", "==", currentUser.uid));
    const snapshot = await getDocs(tema5Query);
    
    snapshot.forEach((doc) => {
        const tema = doc.data();
        if (tema.nombre.includes('5') || tema.nombre.includes('Tema 5')) {
            console.log('---');
            console.log('ID:', doc.id);
            console.log('Nombre:', tema.nombre);
            console.log('Es subtema:', !!tema.temaPadreId);
            console.log('Padre ID:', tema.temaPadreId || 'ninguno');
            console.log('Preguntas:', tema.preguntas?.length || 0);
        }
    });
};
// Elementos del DOM
const userNameSpan = document.getElementById('userName');
const logoutBtn = document.getElementById('logoutBtn');
const backBtn = document.getElementById('backBtn');
const subNavBtns = document.querySelectorAll('.sub-nav-btn');
const contentSections = document.querySelectorAll('.content-section');

// Elementos de subir preguntas
const crearTemaBtn = document.getElementById('crearTemaBtn');
const seleccionarTemaBtn = document.getElementById('seleccionarTemaBtn');
const temaSeleccionadoSpan = document.getElementById('temaSeleccionado');
const textoPreguntas = document.getElementById('textoPreguntas');
const procesarTextoBtn = document.getElementById('procesarTextoBtn');
const preguntasProcesadasDiv = document.getElementById('preguntasProcesadas');
const listaPreguntasPreview = document.getElementById('listaPreguntasPreview');
const asignarPreguntasBtn = document.getElementById('asignarPreguntasBtn');

// Elementos de modales
const modalCrearTema = document.getElementById('modalCrearTema');
const modalSeleccionarTema = document.getElementById('modalSeleccionarTema');
const nombreTema = document.getElementById('nombreTema');
const descripcionTema = document.getElementById('descripcionTema');
const confirmarCrearTema = document.getElementById('confirmarCrearTema');
const cancelarCrearTema = document.getElementById('cancelarCrearTema');
const listaTemaSelect = document.getElementById('listaTemaSelect');
const confirmarSeleccionarTema = document.getElementById('confirmarSeleccionarTema');
const cancelarSeleccionarTema = document.getElementById('cancelarSeleccionarTema');

// Elementos del banco de preguntas
const listaTemas = document.getElementById('listaTemas');

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    // Ocultar todo el contenido hasta que se decida qué mostrar
    const mainContent = document.querySelector('.main-content');
    if (mainContent) mainContent.style.display = 'none';
 // Selector de modo
    let modoTest = 'completo';
    const modeBtns = document.querySelectorAll('.mode-btn');
    
    modeBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            modeBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            modoTest = this.dataset.mode;
        });
    });   
    // Verificar autenticación
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            await cargarDatosUsuario();
            // Eliminamos cargarTemas() de aquí; cada sección cargará sus datos solo cuando sea necesario
            
            // Verificar si debe ir a una sección específica por URL
            const urlParams = new URLSearchParams(window.location.search);
            const sectionParam = urlParams.get('section');
            
            if (sectionParam === 'resultados') {
                cambiarSeccion('resultados');
            } else if (sectionParam === 'aleatorio') {
                cambiarSeccion('aleatorio');
            } else {
                // Verificar si debe ir a banco
                const debeAbrirBanco = localStorage.getItem('openBanco') === 'true';
                if (debeAbrirBanco) {
                    localStorage.removeItem('openBanco');
                    cambiarSeccion('banco');
                }
            }
            
            // Mostrar contenido ahora que ya se decidió la sección
            if (mainContent) mainContent.style.display = 'block';
            
            // Inicializar test aleatorio si la sección está activa
            const seccionAleatorio = document.getElementById('aleatorio-section');
            if (seccionAleatorio && seccionAleatorio.classList.contains('active')) {
                setTimeout(() => {
                    inicializarTestAleatorio();
                }, 200);
            }
            
        } else {
            window.location.href = 'index.html';
        }
    });

    // Event listeners
    setupEventListeners();
});

// Configurar event listeners
function setupEventListeners() {
    // Navegación
    backBtn.addEventListener('click', () => {
        window.location.href = 'homepage.html';
    });

    logoutBtn.addEventListener('click', async () => {
        try {
            await signOut(auth);
            window.location.href = 'index.html';
        } catch (error) {
            console.error('Error al cerrar sesión:', error);
        }
    });

    // Sub-navegación
    subNavBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.dataset.section;
            cambiarSeccion(section);
        });
    });

    // Gestión de temas
    crearTemaBtn.addEventListener('click', () => {
        modalCrearTema.style.display = 'block';
    });
    // Botón crear tema en banco de preguntas
const crearTemaBancoBtn = document.getElementById('crearTemaBancoBtn');
if (crearTemaBancoBtn) {
    crearTemaBancoBtn.addEventListener('click', () => {
        modalCrearTema.style.display = 'block';
    });
}

    seleccionarTemaBtn.addEventListener('click', async () => {
        await cargarTemasEnSelect();
        modalSeleccionarTema.style.display = 'block';
    });

    // Modales
    confirmarCrearTema.addEventListener('click', async () => {
        await crearTema();
    });

    cancelarCrearTema.addEventListener('click', () => {
        cerrarModal(modalCrearTema);
    });

    confirmarSeleccionarTema.addEventListener('click', () => {
        seleccionarTema();
    });

    cancelarSeleccionarTema.addEventListener('click', () => {
        cerrarModal(modalSeleccionarTema);
    });

    // Cerrar modales al hacer click fuera
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });

    // Procesamiento de texto
    procesarTextoBtn.addEventListener('click', () => {
        procesarTextoPreguntas();
    });

    // Asignar preguntas
    asignarPreguntasBtn.addEventListener('click', async () => {
        await asignarPreguntasATema();
    });

    // Importar archivo
    const importarArchivoBtn = document.getElementById('importarArchivoBtn');
    const fileInput = document.getElementById('fileInput');

    if (importarArchivoBtn) {
        importarArchivoBtn.addEventListener('click', () => {
            fileInput.click();
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', manejarArchivoSeleccionado);
    }
}

// Importar archivo
const importarArchivoBtn = document.getElementById('importarArchivoBtn');
const fileInput = document.getElementById('fileInput');

if (importarArchivoBtn) {
    importarArchivoBtn.addEventListener('click', () => {
        fileInput.click();
    });
}

if (fileInput) {
    fileInput.addEventListener('change', manejarArchivoSeleccionado);
}


// Cargar datos del usuario
async function cargarDatosUsuario() {
    try {
        const userDoc = await getDoc(doc(db, "usuarios", currentUser.uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            userNameSpan.textContent = userData.nombre;
        } else {
            userNameSpan.textContent = currentUser.email;
        }
    } catch (error) {
        console.error('Error cargando datos:', error);
        userNameSpan.textContent = currentUser.email;
    }
}

// Cambiar sección activa
function cambiarSeccion(seccionId) {
    // Ocultar contenido temporalmente durante el cambio
    const mainContent = document.querySelector('.main-content');
    if (mainContent) mainContent.style.opacity = '0';
    
    // Actualizar botones
    subNavBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.section === seccionId) {
            btn.classList.add('active');
        }
    });

    // Actualizar contenido
    contentSections.forEach(section => {
        section.classList.remove('active');
    });

    const seccionActiva = document.getElementById(`${seccionId}-section`);
    if (seccionActiva) {
        seccionActiva.classList.add('active');
    }

    // Cargar datos específicos de la sección (solo si no están cargando)
    if (seccionId === 'banco') {
        // Solo cargar si no está cargando y no hay caché válido
        const necesitaCargar = !cargandoBanco && 
                              (!cacheTemas || !cacheTimestamp || 
                               (Date.now() - cacheTimestamp >= CACHE_DURACION));
        
        if (necesitaCargar) {
            cargarBancoPreguntas();
        } else {
            console.log('✅ Banco ya cargado o en caché');
        }
    }
    else if (seccionId === 'aleatorio') {
        setTimeout(() => {
            limpiarInterfazTestCompleta();
            inicializarTestAleatorio();
            forzarEventListeners();
        }, 100);
    }
    else if (seccionId === 'resultados') {
        // Solo cargar si no está cargando y no hay caché válido
        const necesitaCargar = !cargandoResultados && 
                              (!cacheResultados || !cacheResultadosTimestamp || 
                               (Date.now() - cacheResultadosTimestamp >= CACHE_DURACION));
        
        if (necesitaCargar) {
            cargarResultados();
        } else {
            console.log('✅ Resultados ya cargados o en caché');
        }
    }
    // Mostrar contenido nuevamente
    setTimeout(() => {
        if (mainContent) mainContent.style.opacity = '1';
    }, 300);
}

// Crear nuevo tema
async function crearTema() {
    const nombre = nombreTema.value.trim();
    const descripcion = descripcionTema.value.trim();

    if (!nombre) {
        alert('El nombre del tema es obligatorio');
        return;
    }

    try {
        // Verificar si ya existe un tema con ese nombre
        const q = query(collection(db, "temas"), where("usuarioId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);

        let nombreExiste = false;
        querySnapshot.forEach((doc) => {
            const tema = doc.data();
            if (tema.nombre.toLowerCase() === nombre.toLowerCase()) {
                nombreExiste = true;
            }
        });

        if (nombreExiste) {
            alert('Ya existe un tema con ese nombre. Por favor, elige un nombre diferente.');
            return;
        }

        const esSubtema = document.getElementById('esSubtema').checked;
        const temaPadreId = document.getElementById('temaPadreSelect').value;

        const temaData = {
            nombre: nombre,
            descripcion: descripcion,
            fechaCreacion: new Date(),
            usuarioId: currentUser.uid,
            preguntas: [],
            esSubtema: esSubtema,
            temaPadreId: esSubtema ? temaPadreId : null
        };

        const docRef = await addDoc(collection(db, "temas"), temaData);

        // Seleccionar automáticamente el tema creado
        temaSeleccionado = {
            id: docRef.id,
            ...temaData
        };

        actualizarTemaSeleccionado();
        cerrarModal(modalCrearTema);

        // Limpiar campos
        nombreTema.value = '';
        descripcionTema.value = '';
        document.getElementById('esSubtema').checked = false;
        document.getElementById('temaPadreSelect').style.display = 'none';
        window.crearSubtemaFlag = null;

        alert('Tema creado exitosamente');

// Marcar caché como sucio
sessionStorage.setItem('cacheSucio', 'true');

// Agregar tema al DOM sin recargar todo
if (document.getElementById('banco-section').classList.contains('active')) {
    agregarTemaAlDOM(docRef.id, temaData);
}

    } catch (error) {
        console.error('Error creando tema:', error);
        alert('Error al crear el tema');
    }
}

// Cargar temas en el select
// Cargar temas en el select
async function cargarTemasEnSelect() {
    try {
        const q = query(collection(db, "temas"), where("usuarioId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        
        listaTemaSelect.innerHTML = '<option value="">Selecciona un tema...</option>';
        
        // Separar temas principales y subtemas
        const temasPrincipales = [];
        const subtemasPorPadre = {};

        querySnapshot.forEach((doc) => {
            const tema = doc.data();
            if (tema.temaPadreId) {
                // Es un subtema
                if (!subtemasPorPadre[tema.temaPadreId]) {
                    subtemasPorPadre[tema.temaPadreId] = [];
                }
                subtemasPorPadre[tema.temaPadreId].push({ id: doc.id, data: tema });
            } else {
                // Es un tema principal
                temasPrincipales.push({ 
                    id: doc.id, 
                    data: tema,
                    orden: tema.orden || 0
                });
            }
        });

        
        // Ordenar temas con ordenamiento numérico inteligente (igual que banco)
temasPrincipales.sort((a, b) => {
    const nombreA = a.data.nombre;
    const nombreB = b.data.nombre;
    
    // Extraer números del nombre si existen
    const numeroA = nombreA.match(/\d+/);
    const numeroB = nombreB.match(/\d+/);
    
    if (numeroA && numeroB) {
        // Si ambos tienen números, ordenar por número
        return parseInt(numeroA[0]) - parseInt(numeroB[0]);
    } else {
        // Si no tienen números, orden alfabético normal
        return nombreA.localeCompare(nombreB);
    }
});

        // Agregar temas principales al select
        temasPrincipales.forEach(({ id, data: tema }) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = `📚 ${tema.nombre}`;
            listaTemaSelect.appendChild(option);

            // Agregar subtemas si los tiene
            if (subtemasPorPadre[id]) {
                subtemasPorPadre[id].forEach(subtema => {
                    const subOption = document.createElement('option');
                    subOption.value = subtema.id;
                    subOption.textContent = `  ↳ ${subtema.data.nombre}`;
                    listaTemaSelect.appendChild(subOption);
                });
            }
        });
        
    } catch (error) {
        console.error('Error cargando temas:', error);
    }
}

// Seleccionar tema existente
function seleccionarTema() {
    const temaId = listaTemaSelect.value;
    const temaTexto = listaTemaSelect.options[listaTemaSelect.selectedIndex].text;

    if (!temaId) {
        alert('Selecciona un tema');
        return;
    }

    temaSeleccionado = {
        id: temaId,
        nombre: temaTexto
    };

    actualizarTemaSeleccionado();
    cerrarModal(modalSeleccionarTema);
}

// Actualizar indicador de tema seleccionado
function actualizarTemaSeleccionado() {
    if (temaSeleccionado) {
        temaSeleccionadoSpan.textContent = `Tema: ${temaSeleccionado.nombre}`;
        asignarPreguntasBtn.disabled = preguntasProcesadas.length === 0;
    } else {
        temaSeleccionadoSpan.textContent = 'Tema: Ninguno seleccionado';
        asignarPreguntasBtn.disabled = true;
    }
}

// Procesar texto de preguntas
function procesarTextoPreguntas() {
    const texto = textoPreguntas.value.trim();
    
    if (!texto) {
        alert('Pega el texto de las preguntas primero');
        return;
    }

    try {
        preguntasProcesadas = parsearPreguntas(texto);
        
        if (preguntasProcesadas.length === 0) {
            alert('No se encontraron preguntas válidas en el texto');
            return;
        }

        mostrarVistaPreviaPreguntas();
        
    } catch (error) {
        console.error('Error procesando preguntas:', error);
        alert('Error al procesar las preguntas. Verifica el formato.');
    }
}

// Parsear preguntas del texto
// Parsear preguntas del texto
function parsearPreguntas(texto) {
    const preguntas = [];
    const lineas = texto.split('\n');
    let preguntaActual = null;

    for (let i = 0; i < lineas.length; i++) {
        const linea = lineas[i].trim();
        
        // Detectar nueva pregunta (formato: "01 . Texto pregunta:")
        const matchPregunta = linea.match(/^(\d+)\s*\.\s*(.+)[:?]?\s*$/);
        
        if (matchPregunta) {
            // Guardar pregunta anterior si existe
            if (preguntaActual) {
                preguntas.push(preguntaActual);
            }
            
            preguntaActual = {
                numero: parseInt(matchPregunta[1]),
                texto: matchPregunta[2],
                opciones: [],
                respuestaCorrecta: null,
                fechaCreacion: new Date()
            };
        }
        // Detectar opciones - PATRÓN MEJORADO
        else if (preguntaActual && linea.match(/^[A-D]\)/)) {
            // Detectar si es respuesta correcta (con ** antes o después del texto)
            const esCorrecta = linea.includes(')**') || linea.includes('**');
            
            // Limpiar el texto de la opción (remover A), B), etc. y los asteriscos)
            let textoOpcion = linea.replace(/^[A-D]\)/, '').trim();
            textoOpcion = textoOpcion.replace(/\*\*/g, '').trim();
            
            const letra = linea.charAt(0);
            
            preguntaActual.opciones.push({
                letra: letra,
                texto: textoOpcion,
                esCorrecta: esCorrecta
            });
            
            if (esCorrecta) {
                preguntaActual.respuestaCorrecta = letra;
            }
        }
    }
    
    // Agregar última pregunta
    if (preguntaActual) {
        preguntas.push(preguntaActual);
    }
    
    // Validar preguntas - logging para debug
    const preguntasValidas = preguntas.filter(p => {
        const esValida = p.opciones.length === 4 && p.respuestaCorrecta && p.texto.length > 0;
        if (!esValida) {
            console.log('Pregunta inválida:', p);
        }
        return esValida;
    });
    
    console.log(`Procesadas ${preguntas.length} preguntas, ${preguntasValidas.length} válidas`);
    return preguntasValidas;
}

// Mostrar vista previa de preguntas
function mostrarVistaPreviaPreguntas() {
    listaPreguntasPreview.innerHTML = '';
    
    preguntasProcesadas.forEach(pregunta => {
        const preguntaDiv = document.createElement('div');
        preguntaDiv.className = 'pregunta-item';
        
        preguntaDiv.innerHTML = `
            <div class="pregunta-numero">${pregunta.numero}.</div>
            <div class="pregunta-texto">${pregunta.texto}</div>
            <ul class="opciones-list">
                ${pregunta.opciones.map(opcion => `
                    <li class="opcion-item">
                        ${opcion.letra}) ${opcion.esCorrecta ? `<span class="opcion-correcta">${opcion.texto}</span>` : opcion.texto}
                    </li>
                `).join('')}
            </ul>
        `;
        
        listaPreguntasPreview.appendChild(preguntaDiv);
    });
    
    preguntasProcesadasDiv.style.display = 'block';
    actualizarTemaSeleccionado();
}

// Asignar preguntas al tema
async function asignarPreguntasATema() {
    if (!temaSeleccionado || preguntasProcesadas.length === 0) {
        alert('Selecciona un tema y procesa las preguntas primero');
        return;
    }

    try {
        const temaRef = doc(db, "temas", temaSeleccionado.id);
        
        // Obtener el tema actual para mantener las preguntas existentes
        const temaDoc = await getDoc(temaRef);
        const temaData = temaDoc.data();
        const preguntasExistentes = temaData.preguntas || [];
        
        // Agregar nuevas preguntas
        const todasLasPreguntas = [...preguntasExistentes, ...preguntasProcesadas];
        
        await updateDoc(temaRef, {
            preguntas: todasLasPreguntas,
            ultimaActualizacion: new Date()
        });

        alert(`${preguntasProcesadas.length} preguntas asignadas al tema "${temaSeleccionado.nombre}"`);

// Invalidar caché
cacheTemas = null;
sessionStorage.removeItem('cacheTemas');
sessionStorage.removeItem('cacheTemasTimestamp');

// Limpiar formulario
textoPreguntas.value = '';
        preguntasProcesadas = [];
        preguntasProcesadasDiv.style.display = 'none';
        actualizarTemaSeleccionado();
        
        // Recargar banco de preguntas si está activo
        if (document.getElementById('banco-section').classList.contains('active')) {
            cargarBancoPreguntas();
        }
        
    } catch (error) {
        console.error('Error asignando preguntas:', error);
        alert('Error al asignar preguntas al tema');
    }
}

// Cargar temas existentes
async function cargarTemas() {
    try {
        const q = query(collection(db, "temas"), where("usuarioId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        
        // Actualizar select de test aleatorio
        const selectTemaTest = document.getElementById('seleccionarTemaTest');
        if (selectTemaTest) {
            selectTemaTest.innerHTML = '<option value="">Selecciona un tema...</option>';
            
            querySnapshot.forEach((doc) => {
                const tema = doc.data();
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = `${tema.nombre} (${tema.preguntas?.length || 0} preguntas)`;
                selectTemaTest.appendChild(option);
            });
        }
        
    } catch (error) {
        console.error('Error cargando temas:', error);
    }
}

// Cargar banco de preguntas
async function cargarBancoPreguntas() {
    if (cargandoBanco) {
        console.log('⏸️ Ya cargando banco, omitiendo...');
        return;
    }
    
    try {
        cargandoBanco = true;
        let querySnapshot;
        
        // Verificar si el caché está sucio (hubo cambios)
        const cacheSucio = sessionStorage.getItem('cacheSucio') === 'true';
        if (cacheSucio) {
            sessionStorage.removeItem('cacheSucio');
            sessionStorage.removeItem('cacheTemas');
            sessionStorage.removeItem('cacheTemasTimestamp');
            cacheTemas = null;
            cacheTimestamp = null;
        }
        
        // 🆕 INTENTAR RECUPERAR CACHÉ DE sessionStorage
        const cacheGuardado = sessionStorage.getItem('cacheTemas');
        const timestampGuardado = sessionStorage.getItem('cacheTemasTimestamp');
        
        if (cacheGuardado && timestampGuardado) {
            const tiempoTranscurrido = Date.now() - parseInt(timestampGuardado);
            
            if (tiempoTranscurrido < CACHE_DURACION) {
                console.log('✅ Recuperando caché desde sessionStorage');
                const datosCache = JSON.parse(cacheGuardado);
                
                // Reconstruir QuerySnapshot simulado
                querySnapshot = {
                    empty: datosCache.length === 0,
                    size: datosCache.length,
                    forEach: function(callback) {
                        datosCache.forEach(item => {
                            callback({
                                id: item.id,
                                data: () => item.data
                            });
                        });
                    }
                };
                
                cacheTemas = querySnapshot;
                cacheTimestamp = parseInt(timestampGuardado);
            } else {
                console.log('⏰ Caché expirado, recargando...');
                sessionStorage.removeItem('cacheTemas');
                sessionStorage.removeItem('cacheTemasTimestamp');
            }
        }
        
        // Si no hay caché válido, cargar desde Firebase
        if (!querySnapshot) {
            console.log('🔄 Recargando temas desde Firebase');
            const q = query(collection(db, "temas"), where("usuarioId", "==", currentUser.uid));
            querySnapshot = await getDocs(q);
            
            // 🆕 GUARDAR EN sessionStorage
            const datosParaGuardar = [];
            querySnapshot.forEach(doc => {
                datosParaGuardar.push({
                    id: doc.id,
                    data: doc.data()
                });
            });
            
            sessionStorage.setItem('cacheTemas', JSON.stringify(datosParaGuardar));
            sessionStorage.setItem('cacheTemasTimestamp', Date.now().toString());
            
            cacheTemas = querySnapshot;
            cacheTimestamp = Date.now();
        }
        
        listaTemas.innerHTML = '';
        
        if (querySnapshot.empty) {
            listaTemas.innerHTML = '<p>No hay temas creados aún. Ve a "Subir Preguntas" para crear tu primer tema.</p>';
            return;
        }

        // Controles generales
        const controlesDiv = document.createElement('div');
        controlesDiv.className = 'controles-generales';
        controlesDiv.innerHTML = `
            <input type="text" id="buscadorPreguntas" placeholder="Buscar preguntas..." />
            <button id="detectarDuplicadasBtn" class="btn-warning">🔍 Detectar Duplicadas</button>
            <button class="btn-danger" onclick="eliminarTodosTemas()">🗑️ Eliminar Todos los Temas</button>
        `;
        listaTemas.appendChild(controlesDiv);

        // Configurar eventos del buscador
        setTimeout(() => {
            document.getElementById('buscadorPreguntas').addEventListener('input', filtrarPreguntas);
            document.getElementById('detectarDuplicadasBtn').addEventListener('click', detectarPreguntasDuplicadas);
        }, 100);
        
        // Separar temas principales y subtemas
        const temasPrincipales = [];
        const subtemasPorPadre = {};

        querySnapshot.forEach((doc) => {
            const tema = doc.data();
            if (tema.temaPadreId) {
                // Es un subtema
                if (!subtemasPorPadre[tema.temaPadreId]) {
                    subtemasPorPadre[tema.temaPadreId] = [];
                }
                subtemasPorPadre[tema.temaPadreId].push({ id: doc.id, data: tema });
            } else {
                // Es un tema principal
                temasPrincipales.push({ 
                    id: doc.id, 
                    data: tema,
                    orden: tema.orden || 0  // AGREGAR CAMPO ORDEN
                });
            }
        });

// ORDENAR TEMAS CON ORDEN NUMÉRICO INTELIGENTE
temasPrincipales.sort((a, b) => {
    const nombreA = a.data.nombre;
    const nombreB = b.data.nombre;
    
    // Extraer números del nombre si existen
    const numeroA = nombreA.match(/\d+/);
    const numeroB = nombreB.match(/\d+/);
    
    if (numeroA && numeroB) {
        // Si ambos tienen números, ordenar por número
        return parseInt(numeroA[0]) - parseInt(numeroB[0]);
    } else {
        // Si no tienen números, orden alfabético normal
        return nombreA.localeCompare(nombreB);
    }
});

// ORDENAR SUBTEMAS CON ORDENAMIENTO NUMÉRICO INTELIGENTE (IGUAL QUE TEMAS PRINCIPALES)
Object.keys(subtemasPorPadre).forEach(padreId => {
    subtemasPorPadre[padreId].sort((a, b) => {
        const nombreA = a.data.nombre;
        const nombreB = b.data.nombre;
        
        // Extraer números del nombre si existen
        const numeroA = nombreA.match(/\d+/);
        const numeroB = nombreB.match(/\d+/);
        
        if (numeroA && numeroB) {
            // Si ambos tienen números, ordenar por número
            return parseInt(numeroA[0]) - parseInt(numeroB[0]);
        } else {
            // Si no tienen números, orden alfabético normal
            return nombreA.localeCompare(nombreB);
        }
    });
});
// NUEVA SECCIÓN: Sumar preguntas de subtemas a los temas principales
temasPrincipales.forEach(tema => {
    if (subtemasPorPadre[tema.id]) {
        const preguntasSubtemas = subtemasPorPadre[tema.id].reduce((total, subtema) => {
            const preguntasSubtema = subtema.data.preguntas?.length || 0;
            return total + preguntasSubtema;
        }, 0);
        tema.data.preguntasTotal = (tema.data.preguntas?.length || 0) + preguntasSubtemas;
    } else {
        tema.data.preguntasTotal = tema.data.preguntas?.length || 0;
    }
});
        // Renderizar temas principales con sus subtemas
        temasPrincipales.forEach(({ id, data: tema }) => {
            const temaDiv = document.createElement('div');
            temaDiv.className = 'tema-card';
            temaDiv.draggable = true;
            temaDiv.dataset.temaId = id;
            
            const fechaCreacion = tema.fechaCreacion?.toDate?.()?.toLocaleDateString() || 'Fecha desconocida';
            const estaAbierto = temasAbiertos.has(id);
            const numPreguntas = tema.preguntasTotal || tema.preguntas?.length || 0;
            
            // Generar HTML de subtemas
            const subtemasHTML = subtemasPorPadre[id] && subtemasPorPadre[id].length > 0 ? 
    `<div class="subtemas-wrapper" id="subtemas-wrapper-${id}" style="display: none;">
        ${subtemasPorPadre[id].map(subtema => crearSubtemaHTML(subtema.id, subtema.data)).join('')}
    </div>` : '';
            
            temaDiv.innerHTML = `
                <div class="tema-header">
                    <div class="tema-info">
                        <div class="tema-nombre">
    📚 ${tema.nombre}
    ${subtemasPorPadre[id] && subtemasPorPadre[id].length > 0 ? 
        `<button class="btn-toggle-subtemas" onclick="toggleSubtemasVisibilidad('${id}')" title="Mostrar/Ocultar subtemas">
            <span id="toggle-icon-${id}">📁</span>
        </button>` : ''
    }
</div>
                        <div class="tema-stats">${numPreguntas} preguntas • Creado: ${fechaCreacion}</div>
                    </div>
                  <div class="tema-acciones">
    <button class="btn-secondary" onclick="crearSubtema('${id}')">📂 Crear Subtema</button>
    <button class="btn-importar" onclick="importarATema('${id}')">📥 Importar</button>
    <button class="btn-exportar" onclick="exportarTema('${id}')">📤 Exportar</button>
    <button class="btn-warning" onclick="vaciarTema('${id}')">🧹 Vaciar Tema</button>
    <button class="btn-secondary" onclick="editarTema('${id}')">✏️ Editar</button>
    <button class="btn-danger" onclick="eliminarTema('${id}')">🗑️ Eliminar</button>
</div>
                </div>
                ${tema.descripcion ? `<div class="tema-descripcion">${tema.descripcion}</div>` : ''}
                ${subtemasHTML}
                ${(() => {
    const preguntasPropias = tema.preguntas?.length || 0;
    const tieneSubtemas = subtemasPorPadre[id] && subtemasPorPadre[id].length > 0;
    
    if (preguntasPropias > 0) {
        // Tema con preguntas propias - NO CARGAR HTML hasta abrir
        return `
            <div class="preguntas-tema">
                <details ontoggle="cargarPreguntasLazy(event, '${id}')">
                    <summary>Ver y editar preguntas (${preguntasPropias})</summary>
                    <div class="lista-preguntas" id="preguntas-${id}" data-cargado="false">
                        <div style="text-align:center;padding:20px;">⏳ Cargando preguntas...</div>
                    </div>
                </details>
            </div>
        `;
    } else if (tieneSubtemas) {
        // Tema sin preguntas propias pero con subtemas - NO mostrar desplegable adicional
        return '';
    } else {
        return '';
    }
})()}
            `;
            
            listaTemas.appendChild(temaDiv);
        });

        // Configurar drag and drop
        configurarDragAndDrop();
        
    } catch (error) {
        console.error('Error cargando banco de preguntas:', error);
        listaTemas.innerHTML = '<p>Error al cargar los temas.</p>';
    } finally {
        cargandoBanco = false;
    }
}
// Agregar tema al DOM sin recargar todo
function agregarTemaAlDOM(temaId, temaData) {
    const listaTemas = document.getElementById('listaTemas');
    if (!listaTemas) return;
    
    const fechaCreacion = new Date().toLocaleDateString();
    
    const temaDiv = document.createElement('div');
    temaDiv.className = 'tema-card';
    temaDiv.draggable = true;
    temaDiv.dataset.temaId = temaId;
    
    temaDiv.innerHTML = `
        <div class="tema-header">
            <div class="tema-info">
                <div class="tema-nombre">📚 ${temaData.nombre}</div>
                <div class="tema-stats">0 preguntas • Creado: ${fechaCreacion}</div>
            </div>
            <div class="tema-acciones">
                <button class="btn-secondary" onclick="crearSubtema('${temaId}')">📂 Crear Subtema</button>
                <button class="btn-importar" onclick="importarATema('${temaId}')">📥 Importar</button>
                <button class="btn-exportar" onclick="exportarTema('${temaId}')">📤 Exportar</button>
                <button class="btn-warning" onclick="vaciarTema('${temaId}')">🧹 Vaciar Tema</button>
                <button class="btn-secondary" onclick="editarTema('${temaId}')">✏️ Editar</button>
                <button class="btn-danger" onclick="eliminarTema('${temaId}')">🗑️ Eliminar</button>
            </div>
        </div>
        ${temaData.descripcion ? `<div class="tema-descripcion">${temaData.descripcion}</div>` : ''}
    `;
    
    // Insertar después de los controles generales
    const controlesGenerales = listaTemas.querySelector('.controles-generales');
    if (controlesGenerales && controlesGenerales.nextSibling) {
        listaTemas.insertBefore(temaDiv, controlesGenerales.nextSibling);
    } else {
        listaTemas.appendChild(temaDiv);
    }
}
// Manejar toggle de tema (abrir/cerrar)
window.manejarToggleTema = function(event, temaId) {
    if (event.target.open) {
        temasAbiertos.add(temaId);
    } else {
        temasAbiertos.delete(temaId);
    }
};

// Manejar toggle de subtemas desplegables
window.manejarToggleSubtemas = function(event, temaId) {
    // Similar a manejarToggleTema pero para subtemas
    if (event.target.open) {
        temasAbiertos.add(`subtemas-${temaId}`);
    } else {
        temasAbiertos.delete(`subtemas-${temaId}`);
    }
};

// Crear HTML para pregunta editable
function crearPreguntaEditable(pregunta, index, temaId) {
    const verificada = pregunta.verificada || false;
    return `
        <div class="pregunta-item pregunta-editable ${verificada ? 'pregunta-verificada' : ''}" data-pregunta-index="${index}">
            <div class="pregunta-controls">
                <button class="btn-icon btn-verify ${verificada ? 'verified' : ''}" 
                        onclick="toggleVerificacion('${temaId}', ${index})" 
                        title="${verificada ? 'Pregunta verificada' : 'Marcar como verificada'}">
                    ${verificada ? '⭐' : '☆'}
                </button>
                <button class="btn-icon btn-edit" onclick="editarPregunta('${temaId}', ${index})" title="Editar pregunta">✏️</button>
                <button class="btn-icon btn-delete" onclick="eliminarPregunta('${temaId}', ${index})" title="Eliminar pregunta">🗑️</button>
            </div>
            <div class="pregunta-texto" id="texto-${temaId}-${index}">${pregunta.texto}</div>
            <div class="opciones-container" id="opciones-${temaId}-${index}">
                ${pregunta.opciones.map((opcion, opcionIndex) => `
                    <div class="opcion-item">
                        <input type="radio" name="correcta-${temaId}-${index}" value="${opcion.letra}" 
                               ${opcion.esCorrecta ? 'checked' : ''} 
                               onchange="cambiarRespuestaCorrecta('${temaId}', ${index}, '${opcion.letra}')">
                        <span>${opcion.letra}) </span>
                        <span class="opcion-texto" id="opcion-${temaId}-${index}-${opcionIndex}">${opcion.texto}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// Crear HTML para subtema
function crearSubtemaHTML(subtemaId, subtema) {
    const numPreguntas = subtema.preguntas?.length || 0;
    const fechaCreacion = subtema.fechaCreacion?.toDate?.()?.toLocaleDateString() || 'Fecha desconocida';
    const estaAbierto = temasAbiertos.has(subtemaId);
    
    return `
        <div class="subtema-container" draggable="true" data-subtema-id="${subtemaId}">
            <div class="subtema-header">
                <div class="subtema-info">
                    <div class="subtema-nombre">📁 ${subtema.nombre}</div>
                    <div class="subtema-stats">${numPreguntas} preguntas • Creado: ${fechaCreacion}</div>
                </div>
                
<div class="subtema-acciones">
    <button class="btn-importar btn-sm" onclick="importarATema('${subtemaId}')">📥 Importar</button>
    <button class="btn-exportar btn-sm" onclick="exportarTema('${subtemaId}')">📤 Exportar</button>
    <button class="btn-secondary btn-sm" onclick="editarTema('${subtemaId}')">✏️</button>
    <button class="btn-danger btn-sm" onclick="eliminarTema('${subtemaId}')">🗑️</button>
</div>
            </div>
            ${subtema.descripcion ? `<div class="subtema-descripcion">${subtema.descripcion}</div>` : ''}
            ${numPreguntas > 0 ? `
                <div class="preguntas-tema">
                    <details ontoggle="manejarToggleTema(event, '${subtemaId}')">
                        <summary>Ver y editar preguntas (${numPreguntas})</summary>
                        <div class="lista-preguntas" id="preguntas-${subtemaId}">
                            ${subtema.preguntas.map((pregunta, index) => crearPreguntaEditable(pregunta, index, subtemaId)).join('')}
                        </div>
                    </details>
                </div>
            ` : ''}
        </div>
    `;
}

// Función para mostrar/ocultar subtemas
window.toggleSubtemasVisibilidad = function(temaId) {
    const wrapper = document.getElementById(`subtemas-wrapper-${temaId}`);
    const icon = document.getElementById(`toggle-icon-${temaId}`);
    
    if (!wrapper || !icon) return;
    
    if (wrapper.style.display === 'none') {
        // Mostrar subtemas
        wrapper.style.display = 'block';
        icon.textContent = '📂';
    } else {
        // Ocultar subtemas
        wrapper.style.display = 'none';
        icon.textContent = '📁';
    }
};

// Configurar drag and drop para reordenar temas y subtemas
function configurarDragAndDrop() {
    const temaCards = document.querySelectorAll('.tema-card');
    const subtemaContainers = document.querySelectorAll('.subtema-container');
    
    // Función para guardar orden (definida dentro del scope)
    async function guardarOrdenTemas() {
        try {
            const temasOrdenados = [];
            document.querySelectorAll('.tema-card').forEach((card, index) => {
                temasOrdenados.push({
                    id: card.dataset.temaId,
                    orden: index
                });
            });
            
            // Guardar orden en Firebase
            for (const tema of temasOrdenados) {
                await updateDoc(doc(db, "temas", tema.id), {
                    orden: tema.orden
                });
            }
            
            console.log('Orden guardado:', temasOrdenados);
        } catch (error) {
            console.error('Error guardando orden:', error);
        }
    }
    
    // Configurar drag and drop para temas principales
    temaCards.forEach(card => {
        card.addEventListener('dragstart', (e) => {
            card.classList.add('dragging');
            e.dataTransfer.setData('text/plain', JSON.stringify({
                type: 'tema',
                id: card.dataset.temaId
            }));
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
        });

        card.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        card.addEventListener('drop', async (e) => {
            e.preventDefault();
            const dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
            
            if (dragData.type === 'tema') {
                const draggedElement = document.querySelector(`[data-tema-id="${dragData.id}"]`);
                const dropTarget = e.currentTarget;

                if (draggedElement !== dropTarget) {
                    const container = listaTemas;
                    const draggedRect = draggedElement.getBoundingClientRect();
                    const dropRect = dropTarget.getBoundingClientRect();

                    if (draggedRect.top < dropRect.top) {
                        container.insertBefore(draggedElement, dropTarget.nextSibling);
                    } else {
                        container.insertBefore(draggedElement, dropTarget);
                    }
                    
                    // Guardar el nuevo orden en Firebase
                    await guardarOrdenTemas();
                }
            }
        });
    });

    // Configurar drag and drop para subtemas
    subtemaContainers.forEach(subtema => {
        subtema.draggable = true;
        subtema.dataset.subtemaId = subtema.querySelector('.lista-preguntas')?.id.replace('preguntas-', '') || '';
        
        subtema.addEventListener('dragstart', (e) => {
            subtema.classList.add('dragging');
            e.dataTransfer.setData('text/plain', JSON.stringify({
                type: 'subtema',
                id: subtema.dataset.subtemaId
            }));
            e.stopPropagation(); // Evitar que se active el drag del tema padre
        });

        subtema.addEventListener('dragend', () => {
            subtema.classList.remove('dragging');
        });

        subtema.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        subtema.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
            
            if (dragData.type === 'subtema') {
                const draggedElement = document.querySelector(`[data-subtema-id="${dragData.id}"]`);
                const dropTarget = e.currentTarget;

                if (draggedElement !== dropTarget) {
                    const draggedRect = draggedElement.getBoundingClientRect();
                    const dropRect = dropTarget.getBoundingClientRect();

                    if (draggedRect.top < dropRect.top) {
                        dropTarget.parentNode.insertBefore(draggedElement, dropTarget.nextSibling);
                    } else {
                        dropTarget.parentNode.insertBefore(draggedElement, dropTarget);
                    }
                }
            }
        });
    });
}

// Toggle verificación de pregunta
window.toggleVerificacion = async function(temaId, preguntaIndex) {
    try {
        const temaRef = doc(db, "temas", temaId);
        const temaDoc = await getDoc(temaRef);
        const temaData = temaDoc.data();
        const preguntas = [...temaData.preguntas];
        
        preguntas[preguntaIndex].verificada = !preguntas[preguntaIndex].verificada;
        
        await updateDoc(temaRef, { preguntas });

        // Actualizar el botón de verificación buscando específicamente en el tema correcto
        const preguntasContainer = document.getElementById(`preguntas-${temaId}`);
        if (preguntasContainer) {
            const todasLasPreguntas = preguntasContainer.querySelectorAll('.pregunta-item');
            const preguntaDiv = todasLasPreguntas[preguntaIndex];
            
            if (preguntaDiv) {
                const btnVerify = preguntaDiv.querySelector('.btn-verify');
                if (btnVerify) {
                    if (preguntas[preguntaIndex].verificada) {
                        btnVerify.classList.add('verified');
                        btnVerify.innerHTML = '⭐';
                    } else {
                        btnVerify.classList.remove('verified');
                        btnVerify.innerHTML = '☆';
                    }
                }
                preguntaDiv.classList.toggle('pregunta-verificada', preguntas[preguntaIndex].verificada);
            }
        }
        
        // Marcar caché como sucio (se actualizará en próxima carga completa)
        sessionStorage.setItem('cacheSucio', 'true');
        
    } catch (error) {
        console.error('Error al cambiar verificación:', error);
        alert('Error al actualizar la pregunta');
    }
};

// Función para actualizar solo el contenido de preguntas de un tema específico
async function actualizarContenidoPreguntas(temaId) {
    try {
        const temaRef = doc(db, "temas", temaId);
        const temaDoc = await getDoc(temaRef);
        const temaData = temaDoc.data();
        
        const preguntasContainer = document.getElementById(`preguntas-${temaId}`);
        if (preguntasContainer && temaData.preguntas) {
            preguntasContainer.innerHTML = temaData.preguntas.map((pregunta, index) => 
                crearPreguntaEditable(pregunta, index, temaId)
            ).join('');
        }
    } catch (error) {
        console.error('Error actualizando contenido de preguntas:', error);
    }
}

// Editar pregunta
window.editarPregunta = function(temaId, preguntaIndex) {
    const textoElement = document.getElementById(`texto-${temaId}-${preguntaIndex}`);
    const opcionesContainer = document.getElementById(`opciones-${temaId}-${preguntaIndex}`);
    
    // Obtener datos actuales
    const textoActual = textoElement.textContent;
    
    // Crear input para el texto de la pregunta
    textoElement.innerHTML = `
        <input type="text" class="pregunta-texto-editable" value="${textoActual}" 
               id="input-texto-${temaId}-${preguntaIndex}">
    `;
    
    // Crear inputs para las opciones
    const opciones = Array.from(opcionesContainer.querySelectorAll('.opcion-item'));
    opciones.forEach((opcionDiv, opcionIndex) => {
        const textoOpcion = opcionDiv.querySelector('.opcion-texto').textContent;
        const radio = opcionDiv.querySelector('input[type="radio"]');
        const letra = radio.value;
        
        opcionDiv.innerHTML = `
            <div class="opcion-editable">
                <input type="radio" name="correcta-${temaId}-${preguntaIndex}" value="${letra}" 
                       ${radio.checked ? 'checked' : ''} class="opcion-radio">
                <span>${letra}) </span>
                <input type="text" class="opcion-texto-editable" value="${textoOpcion}" 
                       id="input-opcion-${temaId}-${preguntaIndex}-${opcionIndex}">
            </div>
        `;
    });
    
    // Agregar botones de guardar/cancelar
    const botonesDiv = document.createElement('div');
    botonesDiv.innerHTML = `
        <div style="margin-top: 15px; text-align: center;">
            <button class="btn-success" onclick="guardarEdicionPregunta('${temaId}', ${preguntaIndex})">💾 Guardar</button>
            <button class="btn-secondary" onclick="cancelarEdicionPregunta('${temaId}')">❌ Cancelar</button>
        </div>
    `;
    
    const preguntaDiv = textoElement.closest('.pregunta-editable');
    preguntaDiv.appendChild(botonesDiv);
};

// Guardar edición de pregunta
window.guardarEdicionPregunta = async function(temaId, preguntaIndex) {
    try {
        const temaRef = doc(db, "temas", temaId);
        const temaDoc = await getDoc(temaRef);
        const temaData = temaDoc.data();
        const preguntas = [...temaData.preguntas];
        
        // Obtener nuevo texto de la pregunta
        const nuevoTexto = document.getElementById(`input-texto-${temaId}-${preguntaIndex}`).value;
        
        // Obtener nuevas opciones
        const nuevasOpciones = [];
        let nuevaRespuestaCorrecta = null;
        
        for (let i = 0; i < 4; i++) {
            const inputTexto = document.getElementById(`input-opcion-${temaId}-${preguntaIndex}-${i}`);
            const radio = document.querySelector(`input[name="correcta-${temaId}-${preguntaIndex}"]:checked`);
            const letra = ['A', 'B', 'C', 'D'][i];
            const esCorrecta = radio && radio.value === letra;
            
            if (esCorrecta) nuevaRespuestaCorrecta = letra;
            
            nuevasOpciones.push({
                letra: letra,
                texto: inputTexto.value,
                esCorrecta: esCorrecta
            });
        }
        
        // Actualizar pregunta
        preguntas[preguntaIndex] = {
            ...preguntas[preguntaIndex],
            texto: nuevoTexto,
            opciones: nuevasOpciones,
            respuestaCorrecta: nuevaRespuestaCorrecta
        };
        
        await updateDoc(temaRef, { preguntas });

// Actualizar solo el contenido de las preguntas sin recargar todo
await actualizarContenidoPreguntas(temaId);
        
    } catch (error) {
        console.error('Error guardando pregunta:', error);
        alert('Error al guardar la pregunta');
    }
};

// Cancelar edición
window.cancelarEdicionPregunta = async function(temaId) {
    // Actualizar solo el contenido de las preguntas sin recargar todo
    await actualizarContenidoPreguntas(temaId);
};

// Cambiar respuesta correcta
window.cambiarRespuestaCorrecta = async function(temaId, preguntaIndex, nuevaLetra) {
    try {
        const temaRef = doc(db, "temas", temaId);
        const temaDoc = await getDoc(temaRef);
        const temaData = temaDoc.data();
        const preguntas = [...temaData.preguntas];
        
        // Actualizar opciones
        preguntas[preguntaIndex].opciones = preguntas[preguntaIndex].opciones.map(opcion => ({
            ...opcion,
            esCorrecta: opcion.letra === nuevaLetra
        }));
        
        preguntas[preguntaIndex].respuestaCorrecta = nuevaLetra;
        
        await updateDoc(temaRef, { preguntas });
        
        // NO recargar - el radio button ya está actualizado visualmente
        sessionStorage.setItem('cacheSucio', 'true');
        
    } catch (error) {
        console.error('Error cambiando respuesta correcta:', error);
        alert('Error al actualizar la respuesta');
    }
};

// Eliminar pregunta específica
window.eliminarPregunta = async function(temaId, preguntaIndex) {
    if (confirm('¿Estás seguro de que quieres eliminar esta pregunta?')) {
        try {
            const temaRef = doc(db, "temas", temaId);
            const temaDoc = await getDoc(temaRef);
            const temaData = temaDoc.data();
            const preguntas = [...temaData.preguntas];
            
            preguntas.splice(preguntaIndex, 1);
            
            await updateDoc(temaRef, { preguntas });

            // Eliminar SOLO el elemento DOM de la pregunta
            const preguntaDiv = document.querySelector(`#preguntas-${temaId} [data-pregunta-index="${preguntaIndex}"]`);
            if (preguntaDiv) {
                preguntaDiv.remove();
            }
            
            // Reindexar las preguntas restantes en el DOM
            const preguntasRestantes = document.querySelectorAll(`#preguntas-${temaId} .pregunta-editable`);
            preguntasRestantes.forEach((div, newIndex) => {
                div.dataset.preguntaIndex = newIndex;
                // Actualizar onclick de los botones
                const btnEdit = div.querySelector('.btn-edit');
                const btnDelete = div.querySelector('.btn-delete');
                const btnVerify = div.querySelector('.btn-verify');
                if (btnEdit) btnEdit.setAttribute('onclick', `editarPregunta('${temaId}', ${newIndex})`);
                if (btnDelete) btnDelete.setAttribute('onclick', `eliminarPregunta('${temaId}', ${newIndex})`);
                if (btnVerify) btnVerify.setAttribute('onclick', `toggleVerificacion('${temaId}', ${newIndex})`);
            });
            
            // Actualizar contador en el summary
            const details = document.querySelector(`#preguntas-${temaId}`)?.closest('details');
            if (details) {
                const summary = details.querySelector('summary');
                if (summary) {
                    summary.textContent = `Ver y editar preguntas (${preguntas.length})`;
                }
            }
            
            // Actualizar contador en el header del tema
            const temaCard = document.querySelector(`[data-tema-id="${temaId}"]`);
            if (temaCard) {
                const statsDiv = temaCard.querySelector('.tema-stats');
                if (statsDiv) {
                    statsDiv.textContent = statsDiv.textContent.replace(/\d+ preguntas/, `${preguntas.length} preguntas`);
                }
            }
            
            sessionStorage.setItem('cacheSucio', 'true');
            
        } catch (error) {
            console.error('Error eliminando pregunta:', error);
            alert('Error al eliminar la pregunta');
        }
    }
};

// Eliminar todos los temas
window.eliminarTodosTemas = async function() {
    const confirmacion = prompt('Esta acción eliminará TODOS tus temas y preguntas permanentemente.\nEscribe "ELIMINAR TODO" para confirmar:');
    
    if (confirmacion === 'ELIMINAR TODO') {
        try {
            const q = query(collection(db, "temas"), where("usuarioId", "==", currentUser.uid));
            const querySnapshot = await getDocs(q);
            
            const promises = [];
            querySnapshot.forEach((doc) => {
                promises.push(deleteDoc(doc.ref));
            });
            
            await Promise.all(promises);

// Invalidar caché
cacheTemas = null;
sessionStorage.removeItem('cacheTemas');
sessionStorage.removeItem('cacheTemasTimestamp');

alert('Todos los temas han sido eliminados');
cargarBancoPreguntas();
            cargarTemas();
            
        } catch (error) {
            console.error('Error eliminando todos los temas:', error);
            alert('Error al eliminar los temas');
        }
    } else if (confirmacion !== null) {
        alert('Confirmación incorrecta. No se eliminó nada.');
    }
};

// Funciones globales para los botones
window.editarTema = async function(temaId) {
    try {
        const temaDoc = await getDoc(doc(db, "temas", temaId));
        if (!temaDoc.exists()) {
            alert('Tema no encontrado');
            return;
        }
        
        const temaData = temaDoc.data();
        const nuevoNombre = prompt('Nuevo nombre del tema:', temaData.nombre);
        
        if (nuevoNombre && nuevoNombre.trim() !== '' && nuevoNombre !== temaData.nombre) {
            await updateDoc(doc(db, "temas", temaId), {
                nombre: nuevoNombre.trim(),
                fechaModificacion: new Date()
            });
            
            // Recargar la lista de temas
            await cargarBancoPreguntas();
            alert('Tema actualizado correctamente');
        }
        
    } catch (error) {
        console.error('Error editando tema:', error);
        alert('Error al editar el tema');
    }
};
// Vaciar tema (eliminar solo las preguntas)
window.vaciarTema = async function(temaId) {
    try {
        const temaDoc = await getDoc(doc(db, "temas", temaId));
        if (!temaDoc.exists()) {
            alert('Tema no encontrado');
            return;
        }
        
        const temaData = temaDoc.data();
        const numPreguntas = temaData.preguntasTotal || temaData.preguntas?.length || 0;
        
        if (numPreguntas === 0) {
            alert('Este tema ya está vacío');
            return;
        }
        
        if (confirm(`¿Estás seguro de que quieres eliminar las ${numPreguntas} preguntas del tema "${temaData.nombre}"? El tema se mantendrá pero quedará vacío.`)) {
            await updateDoc(doc(db, "temas", temaId), {
                preguntas: [],
                ultimaActualizacion: new Date()
            });
            
            alert(`Se eliminaron ${numPreguntas} preguntas del tema "${temaData.nombre}"`);
            cargarBancoPreguntas();
        }
        
    } catch (error) {
        console.error('Error vaciando tema:', error);
        alert('Error al vaciar el tema');
    }
};
window.eliminarTema = async function(temaId) {
    if (confirm('¿Estás seguro de que quieres eliminar este tema? Se eliminarán también todos sus subtemas.')) {
        try {
            // Eliminar subtemas primero
            const q = query(
                collection(db, "temas"), 
                where("usuarioId", "==", currentUser.uid),
                where("temaPadreId", "==", temaId)
            );
            const subtemasSnapshot = await getDocs(q);
            
            for (const subtemaDoc of subtemasSnapshot.docs) {
                await deleteDoc(doc(db, "temas", subtemaDoc.id));
            }
            
            // Eliminar tema principal
            await deleteDoc(doc(db, "temas", temaId));
            
            // Invalidar caché
cacheTemas = null;
sessionStorage.removeItem('cacheTemas');
sessionStorage.removeItem('cacheTemasTimestamp');

alert('Tema y subtemas eliminados exitosamente');
cargarBancoPreguntas();
cargarTemas();
        } catch (error) {
            console.error('Error eliminando tema:', error);
            alert('Error al eliminar el tema');
        }
    }
};

// Función auxiliar para cerrar modales
function cerrarModal(modal) {
    modal.style.display = 'none';
    // Limpiar campos
    if (modal === modalCrearTema) {
        nombreTema.value = '';
        descripcionTema.value = '';
    }
}

// Filtrar preguntas en tiempo real
function filtrarPreguntas() {
    const textoBusqueda = document.getElementById('buscadorPreguntas').value.trim();
    const busquedaLower = textoBusqueda.toLowerCase();
    const todasLasPreguntas = document.querySelectorAll('.pregunta-editable');
    const todasLasCarpetas = document.querySelectorAll('.tema-card');
    const todosLosSubtemas = document.querySelectorAll('.subtema-container');
    const todosLosDetails = document.querySelectorAll('details');
    
    if (textoBusqueda === '') {
        // Restaurar vista normal
        todasLasPreguntas.forEach(p => p.style.display = 'block');
        todasLasCarpetas.forEach(c => c.style.display = 'block');
        todosLosSubtemas.forEach(s => s.style.display = 'block');
        todosLosDetails.forEach(d => d.open = false);
        
        const mensaje = document.getElementById('mensajeNoResultados');
        if (mensaje) mensaje.remove();
        return;
    }
    
    // Ocultar inicialmente todo
    todasLasCarpetas.forEach(carpeta => carpeta.style.display = 'none');
    todosLosSubtemas.forEach(subtema => subtema.style.display = 'none');
    
    // ABRIR TODOS LOS DETAILS
    todosLosDetails.forEach(detail => detail.open = true);
    
    // FILTRAR PREGUNTAS
    let encontradas = 0;
    const temasConResultados = new Set();
    const subtemasConResultados = new Set();
    
    todasLasPreguntas.forEach(pregunta => {
        const divTexto = pregunta.querySelector('.pregunta-texto');
        
        if (!divTexto) {
            pregunta.style.display = 'none';
            return;
        }
        
        const textoEnunciado = divTexto.textContent.trim();
        const textoEnunciadoLower = textoEnunciado.toLowerCase();
        
        if (textoEnunciadoLower.startsWith(busquedaLower)) {
            pregunta.style.display = 'block';
            encontradas++;
            
            // Marcar los contenedores padres que deben ser visibles
            let parent = pregunta.parentElement;
            while (parent && parent.id !== 'listaTemas') {
                if (parent.style) parent.style.display = 'block';
                
                // Identificar si es un tema o subtema
                if (parent.classList.contains('tema-card')) {
                    temasConResultados.add(parent);
                } else if (parent.classList.contains('subtema-container')) {
                    subtemasConResultados.add(parent);
                }
                
                parent = parent.parentElement;
            }
        } else {
            pregunta.style.display = 'none';
        }
    });
    
    // Mostrar solo los temas que tienen resultados
    temasConResultados.forEach(tema => tema.style.display = 'block');
    
    // Mostrar solo los subtemas que tienen resultados
    subtemasConResultados.forEach(subtema => subtema.style.display = 'block');
    
    // Mensaje si no hay resultados
    let mensaje = document.getElementById('mensajeNoResultados');
    if (encontradas === 0) {
        if (!mensaje) {
            mensaje = document.createElement('div');
            mensaje.id = 'mensajeNoResultados';
            mensaje.style.cssText = 'padding: 20px; text-align: center; color: #dc3545; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 8px; margin: 20px 0; font-weight: bold;';
            mensaje.innerHTML = `❌ No se encontraron preguntas que empiecen con: "<strong>${textoBusqueda}</strong>"`;
            document.getElementById('listaTemas').appendChild(mensaje);
        } else {
            mensaje.innerHTML = `❌ No se encontraron preguntas que empiecen con: "<strong>${textoBusqueda}</strong>"`;
        }
        mensaje.style.display = 'block';
    } else if (mensaje) {
        mensaje.style.display = 'none';
    }
}
// Limpiar buscador
function limpiarBuscador() {
    document.getElementById('buscadorPreguntas').value = '';
    document.querySelectorAll('.pregunta-editable').forEach(pregunta => {
        pregunta.style.display = 'block';
    });
}

// ELIMINAR SUBTEMAS HUÃ‰RFANOS
window.eliminarSubtemasHuerfanos = async function() {
    try {
        const q = query(collection(db, "temas"), where("usuarioId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        
        // Recopilar IDs de temas principales
        const idsTemasPrincipales = new Set();
        querySnapshot.forEach((doc) => {
            const tema = doc.data();
            if (!tema.temaPadreId) {
                idsTemasPrincipales.add(doc.id);
            }
        });
        
        // Encontrar subtemas huÃ©rfanos
        const subtemasHuerfanos = [];
        querySnapshot.forEach((doc) => {
            const tema = doc.data();
            if (tema.temaPadreId && !idsTemasPrincipales.has(tema.temaPadreId)) {
                subtemasHuerfanos.push({
                    id: doc.id,
                    nombre: tema.nombre,
                    padreId: tema.temaPadreId,
                    preguntas: tema.preguntas?.length || 0
                });
            }
        });
        
        if (subtemasHuerfanos.length === 0) {
            alert('No se encontraron subtemas huÃ©rfanos');
            return;
        }
        
        const mensaje = `Se encontraron ${subtemasHuerfanos.length} subtemas huÃ©rfanos:\n\n` +
            subtemasHuerfanos.map(s => `- ${s.nombre} (${s.preguntas} preguntas)`).join('\n') +
            '\n\nÂ¿Eliminarlos todos?';
        
        if (!confirm(mensaje)) return;
        
        // Eliminar subtemas huÃ©rfanos
        for (const subtema of subtemasHuerfanos) {
            await deleteDoc(doc(db, "temas", subtema.id));
        }
        
        alert(`Se eliminaron ${subtemasHuerfanos.length} subtemas huÃ©rfanos`);
        cargarBancoPreguntas();
        
    } catch (error) {
        console.error('Error:', error);
        alert('Error al eliminar subtemas huÃ©rfanos');
    }
};

window.diagnosticarTemas = async function() {
    try {
        console.log('=== DIAGNÃ"STICO DE TEMAS ===');
        const q = query(collection(db, "temas"), where("usuarioId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        
        console.log(`Total de temas encontrados: ${querySnapshot.size}`);
        
        const temasPrincipales = [];
        const subtemas = [];
        const temasProblematicos = [];
        
        querySnapshot.forEach((doc) => {
            const tema = doc.data();
            const info = {
                id: doc.id,
                nombre: tema.nombre,
                numPreguntas: tema.preguntas?.length || 0,
                esSubtema: tema.esSubtema || false,
                temaPadreId: tema.temaPadreId || 'ninguno',
                usuarioId: tema.usuarioId
            };
            
            console.log('---');
            console.log(`ID: ${info.id}`);
            console.log(`Nombre: ${info.nombre}`);
            console.log(`Preguntas: ${info.numPreguntas}`);
            console.log(`Es subtema: ${info.esSubtema}`);
            console.log(`Padre ID: ${info.temaPadreId}`);
            console.log(`Usuario ID: ${info.usuarioId}`);
            
            // Buscar el tema que contiene "CE de 1978"
            if (tema.nombre.includes('CE de 1978') || tema.nombre.includes('I.La CE')) {
                console.log('âš ï¸ TEMA PROBLEMÃ�TICO ENCONTRADO!');
                temasProblematicos.push(info);
            }
            
            if (tema.temaPadreId) {
                subtemas.push(info);
            } else {
                temasPrincipales.push(info);
            }
        });
        
        console.log('=== RESUMEN ===');
        console.log(`Temas principales: ${temasPrincipales.length}`);
        console.log(`Subtemas: ${subtemas.length}`);
        console.log(`Temas problemÃ¡ticos (CE 1978): ${temasProblematicos.length}`);
        
        if (temasProblematicos.length > 0) {
            alert(`Se encontraron ${temasProblematicos.length} temas con "CE de 1978". Revisa la consola del navegador (F12) para ver los detalles.`);
        } else {
            alert('No se encontraron temas con "CE de 1978" en Firebase. El tema puede haber sido eliminado.');
        }
        
        return { temasPrincipales, subtemas, temasProblematicos };
        
    } catch (error) {
        console.error('Error en diagnÃ³stico:', error);
        alert('Error en diagnÃ³stico: ' + error.message);
    }
};

// Detectar preguntas duplicadas
async function detectarPreguntasDuplicadas() {
    try {
        const q = query(collection(db, "temas"), where("usuarioId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        
        const todasLasPreguntas = [];
        const duplicadas = [];
        
        // Recopilar todas las preguntas
        querySnapshot.forEach((doc) => {
            const tema = doc.data();
            if (tema.preguntas) {
                tema.preguntas.forEach((pregunta, index) => {
                    // Crear una firma única: enunciado + todas las opciones ordenadas
                    const opcionesOrdenadas = pregunta.opciones
                        ? pregunta.opciones
                            .map(op => op.texto.toLowerCase().trim())
                            .sort()
                            .join('|||')
                        : '';
                    
                    const firmaCompleta = pregunta.texto.toLowerCase().trim() + '###' + opcionesOrdenadas;
                    
                    todasLasPreguntas.push({
                        firma: firmaCompleta,
                        texto: pregunta.texto.toLowerCase().trim(),
                        temaId: doc.id,
                        temaNombre: tema.nombre,
                        preguntaIndex: index,
                        preguntaCompleta: pregunta,
                        fechaCreacion: pregunta.fechaCreacion || tema.fechaCreacion || new Date('2020-01-01')
                    });
                });
            }
        });
        
        // Encontrar duplicadas EXACTAS (mismo enunciado + mismas opciones)
        for (let i = 0; i < todasLasPreguntas.length; i++) {
            for (let j = i + 1; j < todasLasPreguntas.length; j++) {
                if (todasLasPreguntas[i].firma === todasLasPreguntas[j].firma) {
                    duplicadas.push({
                        pregunta1: todasLasPreguntas[i],
                        pregunta2: todasLasPreguntas[j]
                    });
                }
            }
        }
        
        if (duplicadas.length === 0) {
            alert('✅ No se encontraron preguntas duplicadas (con enunciado y opciones idénticas)');
            return;
        }
        
        mostrarPreguntasDuplicadas(duplicadas);
        
    } catch (error) {
        console.error('Error detectando duplicadas:', error);
        alert('Error al detectar preguntas duplicadas');
    }
}

// Mostrar preguntas duplicadas - VERSION CON CHECKBOXES Y FILTRO POR TEMA
function mostrarPreguntasDuplicadas(duplicadas) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.maxWidth = '90vw';
    modalContent.style.width = '1000px';
    modalContent.style.height = 'auto';
    modalContent.style.maxHeight = '85vh';
    modalContent.style.display = 'flex';
    modalContent.style.flexDirection = 'column';
    modalContent.style.margin = '2vh auto';
    
    const titulo = document.createElement('h3');
    titulo.textContent = 'Preguntas Duplicadas Encontradas (' + duplicadas.length + ')';
    titulo.style.marginBottom = '15px';
    modalContent.appendChild(titulo);
    
    // Extraer temas únicos
    const temasUnicos = new Set();
    duplicadas.forEach(dup => {
        temasUnicos.add(dup.pregunta1.temaNombre);
        temasUnicos.add(dup.pregunta2.temaNombre);
    });
    const temasArray = Array.from(temasUnicos).sort();
    
    const listaDuplicadas = document.createElement('div');
    listaDuplicadas.id = 'listaDuplicadas';
    listaDuplicadas.style.overflowY = 'auto';
    listaDuplicadas.style.flexGrow = '1';
    listaDuplicadas.style.marginBottom = '20px';
    
    duplicadas.forEach((dup, index) => {
        const duplicadaItem = document.createElement('div');
        duplicadaItem.className = 'duplicada-item';
        duplicadaItem.style.border = '2px solid #dee2e6';
        duplicadaItem.style.margin = '15px 0';
        duplicadaItem.style.padding = '15px';
        duplicadaItem.style.borderRadius = '8px';
        duplicadaItem.style.background = '#fff';
        
        // Generar HTML de opciones para pregunta 1
        const opciones1HTML = dup.pregunta1.preguntaCompleta.opciones
            ? dup.pregunta1.preguntaCompleta.opciones.map(op => {
                const esCorrecta = op.esCorrecta || op.letra === dup.pregunta1.preguntaCompleta.respuestaCorrecta;
                return `<div style="margin: 5px 0; padding: 8px; background: ${esCorrecta ? '#d4edda' : '#f8f9fa'}; border-radius: 4px; border-left: 3px solid ${esCorrecta ? '#28a745' : '#6c757d'};">
                    <strong>${op.letra})</strong> ${op.texto} ${esCorrecta ? '✓' : ''}
                </div>`;
            }).join('')
            : '<p style="color: #6c757d;">Sin opciones</p>';
        
        // Generar HTML de opciones para pregunta 2
        const opciones2HTML = dup.pregunta2.preguntaCompleta.opciones
            ? dup.pregunta2.preguntaCompleta.opciones.map(op => {
                const esCorrecta = op.esCorrecta || op.letra === dup.pregunta2.preguntaCompleta.respuestaCorrecta;
                return `<div style="margin: 5px 0; padding: 8px; background: ${esCorrecta ? '#d4edda' : '#f8f9fa'}; border-radius: 4px; border-left: 3px solid ${esCorrecta ? '#28a745' : '#6c757d'};">
                    <strong>${op.letra})</strong> ${op.texto} ${esCorrecta ? '✓' : ''}
                </div>`;
            }).join('')
            : '<p style="color: #6c757d;">Sin opciones</p>';
        
        duplicadaItem.innerHTML = 
            '<h4 style="margin-top: 0; color: #495057; border-bottom: 2px solid #dee2e6; padding-bottom: 10px;">Duplicado ' + (index + 1) + ':</h4>' +
            
            '<div style="background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 5px; position: relative; border: 2px solid #6c757d;">' +
                '<div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 10px; align-items: center;">' +
                    '<input type="checkbox" class="checkbox-pregunta" data-tema-id="' + dup.pregunta1.temaId + '" data-pregunta-index="' + dup.pregunta1.preguntaIndex + '" data-tema-nombre="' + dup.pregunta1.temaNombre + '" style="width: 20px; height: 20px; cursor: pointer;">' +
                '</div>' +
                '<div style="background: #e9ecef; padding: 8px 12px; border-radius: 4px; margin-bottom: 10px; display: inline-block; font-weight: bold; color: #495057;">' +
                    '📁 ' + dup.pregunta1.temaNombre +
                '</div>' +
                '<div style="font-weight: bold; margin: 10px 0; font-size: 16px; color: #212529;">' +
                    dup.pregunta1.preguntaCompleta.texto +
                '</div>' +
                '<div style="margin-top: 10px;">' +
                    opciones1HTML +
                '</div>' +
            '</div>' +
            
            '<div style="background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 5px; position: relative; border: 2px solid #6c757d;">' +
                '<div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 10px; align-items: center;">' +
                    '<input type="checkbox" class="checkbox-pregunta" data-tema-id="' + dup.pregunta2.temaId + '" data-pregunta-index="' + dup.pregunta2.preguntaIndex + '" data-tema-nombre="' + dup.pregunta2.temaNombre + '" style="width: 20px; height: 20px; cursor: pointer;">' +
                '</div>' +
                '<div style="background: #e9ecef; padding: 8px 12px; border-radius: 4px; margin-bottom: 10px; display: inline-block; font-weight: bold; color: #495057;">' +
                    '📁 ' + dup.pregunta2.temaNombre +
                '</div>' +
                '<div style="font-weight: bold; margin: 10px 0; font-size: 16px; color: #212529;">' +
                    dup.pregunta2.preguntaCompleta.texto +
                '</div>' +
                '<div style="margin-top: 10px;">' +
                    opciones2HTML +
                '</div>' +
            '</div>';
        
        listaDuplicadas.appendChild(duplicadaItem);
    });
    
    modalContent.appendChild(listaDuplicadas);
    
    const modalActions = document.createElement('div');
    modalActions.className = 'modal-actions';
    modalActions.style.flexShrink = '0';
    modalActions.style.borderTop = '1px solid #dee2e6';
    modalActions.style.paddingTop = '15px';
    modalActions.style.textAlign = 'center';
    
    // Crear dropdown de temas
    let dropdownHTML = '<select id="filtroTemasDuplicadas" onchange="seleccionarPorTema()" style="padding: 10px; font-size: 14px; margin: 5px; border-radius: 4px;">';
    dropdownHTML += '<option value="">🎯 Seleccionar por tema...</option>';
    temasArray.forEach(tema => {
        dropdownHTML += `<option value="${tema}">${tema}</option>`;
    });
    dropdownHTML += '</select>';
    
    modalActions.innerHTML = 
        dropdownHTML +
        '<button class="btn-info" onclick="seleccionarTodas()" style="padding: 10px 20px; font-size: 14px; margin: 5px;">☑️ Seleccionar Todas</button>' +
        '<button class="btn-info" onclick="deseleccionarTodas()" style="padding: 10px 20px; font-size: 14px; margin: 5px;">☐ Deseleccionar Todas</button>' +
        '<button class="btn-danger" onclick="eliminarSeleccionadas()" style="padding: 10px 20px; font-size: 14px; margin: 5px;">🗑️ Eliminar Seleccionadas</button>' +
        '<button class="btn-secondary" onclick="cerrarModalDuplicadas()" style="padding: 10px 20px; font-size: 14px; margin: 5px;">Cerrar</button>' +
        '<button class="btn-primary" onclick="volverADetectar()" style="padding: 10px 20px; font-size: 14px; margin: 5px;">🔄 Volver a Detectar</button>';
    
    modalContent.appendChild(modalActions);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    window.modalDuplicadas = modal;
    window.duplicadasData = duplicadas;
}

// Eliminar pregunta especifica
window.eliminarEspecifica = async function(temaId, preguntaIndex, duplicadoIndex) {
    if (confirm('¿Eliminar esta pregunta duplicada?')) {
        await eliminarPregunta(temaId, preguntaIndex);
        
        const items = document.querySelectorAll('.duplicada-item');
        if (items[duplicadoIndex]) {
            items[duplicadoIndex].remove();
        }
        
        const titulo = document.querySelector('h3');
        const restantes = document.querySelectorAll('.duplicada-item').length;
        titulo.textContent = 'Preguntas Duplicadas Encontradas (' + restantes + ')';
        
        if (restantes === 0) {
            document.getElementById('listaDuplicadas').innerHTML = '<p style="text-align: center; color: #28a745; font-weight: bold;">¡No quedan preguntas duplicadas!</p>';
        }
    }
};

// Volver a detectar duplicadas
window.volverADetectar = function() {
    cerrarModalDuplicadas();
    detectarPreguntasDuplicadas();
};

// Cerrar modal de duplicadas
window.cerrarModalDuplicadas = function() {
    if (window.modalDuplicadas) {
        document.body.removeChild(window.modalDuplicadas);
        window.modalDuplicadas = null;
    }
};

// Seleccionar UNA pregunta de cada par de duplicados
window.seleccionarTodas = function() {
    const items = document.querySelectorAll('.duplicada-item');
    items.forEach(item => {
        const checkboxes = item.querySelectorAll('.checkbox-pregunta');
        // Deseleccionar todo primero
        checkboxes.forEach(cb => cb.checked = false);
        // Seleccionar solo la segunda de cada par (para conservar la primera)
        if (checkboxes.length >= 2) {
            checkboxes[1].checked = true;
        }
    });
};

// Deseleccionar todas las preguntas
window.deseleccionarTodas = function() {
    document.querySelectorAll('.checkbox-pregunta').forEach(cb => cb.checked = false);
};
// Seleccionar preguntas por tema
window.seleccionarPorTema = function() {
    const select = document.getElementById('filtroTemasDuplicadas');
    const temaSeleccionado = select.value;
    
    if (!temaSeleccionado) {
        deseleccionarTodas();
        return;
    }
    
    // Deseleccionar todas primero
    document.querySelectorAll('.checkbox-pregunta').forEach(cb => cb.checked = false);
    
    // Seleccionar solo las del tema elegido
    document.querySelectorAll(`.checkbox-pregunta[data-tema-nombre="${temaSeleccionado}"]`).forEach(cb => {
        cb.checked = true;
    });
};
// Eliminar preguntas seleccionadas
window.eliminarSeleccionadas = async function() {
    const checkboxes = document.querySelectorAll('.checkbox-pregunta:checked');
    
    if (checkboxes.length === 0) {
        alert('No hay preguntas seleccionadas');
        return;
    }
    
    const confirmacion = confirm(`¿Eliminar ${checkboxes.length} pregunta(s) seleccionada(s)? Esta acción no se puede deshacer.`);
    if (!confirmacion) return;
    
    try {
        // Agrupar eliminaciones por tema
        const eliminacionesPorTema = {};
        
        checkboxes.forEach(checkbox => {
            const temaId = checkbox.dataset.temaId;
            const preguntaIndex = parseInt(checkbox.dataset.preguntaIndex);
            
            if (!eliminacionesPorTema[temaId]) {
                eliminacionesPorTema[temaId] = [];
            }
            eliminacionesPorTema[temaId].push(preguntaIndex);
        });
        
        let totalEliminadas = 0;
        
        // Procesar cada tema por separado
        for (const temaId in eliminacionesPorTema) {
            const indices = eliminacionesPorTema[temaId];
            
            // Ordenar índices en orden descendente para eliminar de atrás hacia adelante
            indices.sort((a, b) => b - a);
            
            const temaRef = doc(db, "temas", temaId);
            const temaDoc = await getDoc(temaRef);
            const temaData = temaDoc.data();
            let preguntas = [...temaData.preguntas];
            
            // Eliminar preguntas en orden descendente
            indices.forEach(index => {
                preguntas.splice(index, 1);
                totalEliminadas++;
            });
            
            await updateDoc(temaRef, { preguntas });
        }
        
        // Invalidar caché para forzar recarga desde Firebase
        cacheTemas = null;
        sessionStorage.removeItem('cacheTemas');
        sessionStorage.removeItem('cacheTemasTimestamp');
        
        alert(`Se eliminaron ${totalEliminadas} pregunta(s) seleccionada(s).`);
        cerrarModalDuplicadas();
        cargarBancoPreguntas();
        
    } catch (error) {
        console.error('Error:', error);
        alert('Error al eliminar las preguntas seleccionadas');
    }
};

// Crear subtema
window.crearSubtema = function(temaPadreId) {
    // Marcar como subtema y preseleccionar padre
    window.crearSubtemaFlag = temaPadreId;
    modalCrearTema.style.display = 'block';
    document.getElementById('esSubtema').checked = true;
    mostrarOpcionSubtema();
    cargarTemasPadre(temaPadreId);
};

// Mostrar/ocultar opción de subtema
function mostrarOpcionSubtema() {
    const esSubtema = document.getElementById('esSubtema').checked;
    const temaPadreSelect = document.getElementById('temaPadreSelect');
    temaPadreSelect.style.display = esSubtema ? 'block' : 'none';
    
    if (esSubtema) {
        cargarTemasPadre();
    }
}

// Cargar temas padre en select
async function cargarTemasPadre(preseleccionado = null) {
    try {
        const q = query(collection(db, "temas"), where("usuarioId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        
        const temaPadreSelect = document.getElementById('temaPadreSelect');
        temaPadreSelect.innerHTML = '<option value="">Selecciona tema padre...</option>';
        
        querySnapshot.forEach((doc) => {
            const tema = doc.data();
            // Solo mostrar temas principales (sin padre)
            if (!tema.temaPadreId) {
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = tema.nombre;
                if (doc.id === preseleccionado) {
                    option.selected = true;
                }
                temaPadreSelect.appendChild(option);
            }
        });
        
    } catch (error) {
        console.error('Error cargando temas padre:', error);
    }
}

// Event listener para checkbox de subtema
document.getElementById('esSubtema').addEventListener('change', mostrarOpcionSubtema);
// ==== FUNCIONALIDAD TEST ALEATORIO ====

// Variables globales para el test
let testActual = null;
let cronometroInterval = null;
let tiempoRestanteSegundos = 0;
let respuestasUsuario = {};

// Inicializar funcionalidad de test aleatorio
function inicializarTestAleatorio() {
    try {
        // Verificar que estamos en la sección correcta
        const seccionAleatorio = document.getElementById('aleatorio-section');
        if (!seccionAleatorio || !seccionAleatorio.classList.contains('active')) {
            return;
        }

        // Botones de cantidad - Verificar que existan antes de agregar listeners
        const botonesCantidad = document.querySelectorAll('.btn-cantidad');
        if (botonesCantidad.length > 0) {
            botonesCantidad.forEach(btn => {
                // Remover listener previo si existe
                btn.removeEventListener('click', manejarClickCantidad);
                // Agregar nuevo listener
                btn.addEventListener('click', manejarClickCantidad);
            });
        }

        // Botones de tiempo - Verificar que existan antes de agregar listeners
        const botonesTiempo = document.querySelectorAll('.btn-tiempo');
        if (botonesTiempo.length > 0) {
            botonesTiempo.forEach(btn => {
                // Remover listener previo si existe
                btn.removeEventListener('click', manejarClickTiempo);
                // Agregar nuevo listener
                btn.addEventListener('click', manejarClickTiempo);
            });
        }

        // Selector de tema - Verificar que exista
        const selectorTema = document.getElementById('seleccionarTemaTest');
        if (selectorTema) {
            selectorTema.removeEventListener('change', actualizarPreguntasDisponibles);
            selectorTema.addEventListener('change', actualizarPreguntasDisponibles);
        }

        // Botón empezar test - Verificar que exista
        const btnEmpezar = document.getElementById('empezarTestBtn');
        if (btnEmpezar) {
            btnEmpezar.removeEventListener('click', empezarTest);
            btnEmpezar.addEventListener('click', empezarTest);
        }

        // Botón finalizar test - Verificar que exista
        const btnFinalizar = document.getElementById('finalizarTestBtn');
        if (btnFinalizar) {
            btnFinalizar.removeEventListener('click', finalizarTest);
            btnFinalizar.addEventListener('click', finalizarTest);
        }

        // Cargar temas en el selector - Solo si el usuario está autenticado
        if (currentUser) {
            cargarTemasParaTest();
        }

      // Cargar Test de Repaso disponible
if (currentUser) {
    cargarTestRepaso();
}

    } catch (error) {
        console.error('Error inicializando test aleatorio:', error);
    }
}

// Funciones separadas para manejar clics (mejor práctica)
function manejarClickCantidad() {
    try {
        document.querySelectorAll('.btn-cantidad').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        
        const inputPreguntasSeleccionadas = document.getElementById('preguntasSeleccionadas');
        if (inputPreguntasSeleccionadas) {
            inputPreguntasSeleccionadas.value = this.dataset.cantidad;
        }
    } catch (error) {
        console.error('Error manejando click cantidad:', error);
    }
}

function manejarClickTiempo() {
    try {
        document.querySelectorAll('.btn-tiempo').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        
        const inputTiempoSeleccionado = document.getElementById('tiempoSeleccionado');
        if (inputTiempoSeleccionado) {
            inputTiempoSeleccionado.value = this.dataset.tiempo;
        }
    } catch (error) {
        console.error('Error manejando click tiempo:', error);
    }
}

// Cargar temas para test con dropdown y subtemas - CON CACHÉ
async function cargarTemasParaTest() {
    // ✅ EVITAR MÚLTIPLES CARGAS SIMULTÁNEAS
    if (cargandoTemasTest) {
        console.log('⏸️ Ya cargando temas test, omitiendo...');
        return;
    }
    
    try {
        cargandoTemasTest = true;
        let querySnapshot;
        
        // ✅ USAR CACHÉ (igual que cargarBancoPreguntas)
        if (cacheTemas && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_DURACION)) {
            console.log('✅ Usando caché de temas en Test Aleatorio');
            querySnapshot = cacheTemas;
        } else {
            console.log('🔄 Recargando temas desde Firebase en Test Aleatorio');
            const q = query(collection(db, "temas"), where("usuarioId", "==", currentUser.uid));
            querySnapshot = await getDocs(q);
            cacheTemas = querySnapshot;
            cacheTimestamp = Date.now();
        }
        
        const listaContainer = document.getElementById('listaTemasDropdown');
        
        if (!listaContainer) return;
        
        // Limpiar contenedor
        listaContainer.innerHTML = '';
        
        // Separar temas principales y subtemas
        const temasPrincipales = [];
        const subtemasPorPadre = {};
        let totalPreguntasVerificadas = 0;
        
        querySnapshot.forEach((doc) => {
            const tema = doc.data();
            const temaId = doc.id;
            const preguntasVerificadas = tema.preguntas ? 
                tema.preguntas.filter(p => p.verificada === true).length : 0;
            
            totalPreguntasVerificadas += preguntasVerificadas;
            
            if (tema.temaPadreId) {
                // Es un subtema
                if (!subtemasPorPadre[tema.temaPadreId]) {
                    subtemasPorPadre[tema.temaPadreId] = [];
                }
                subtemasPorPadre[tema.temaPadreId].push({
                    id: temaId,
                    nombre: tema.nombre,
                    preguntasVerificadas: preguntasVerificadas
                });
            } else {
                // Es un tema principal
                temasPrincipales.push({
                    id: temaId,
                    nombre: tema.nombre,
                    preguntasVerificadas: preguntasVerificadas,
                    orden: tema.orden || 0
                });
            }
        });

        // Sumar preguntas de subtemas a los temas principales
        temasPrincipales.forEach(tema => {
            if (subtemasPorPadre[tema.id]) {
                const preguntasSubtemas = subtemasPorPadre[tema.id].reduce((total, subtema) => {
                    return total + subtema.preguntasVerificadas;
                }, 0);
                tema.preguntasVerificadas += preguntasSubtemas;
            }
        });

        // Actualizar contador de "Todos los temas"
        const preguntasTodosTemas = document.getElementById('preguntasTodosTemas');
        if (preguntasTodosTemas) {
            preguntasTodosTemas.textContent = `${totalPreguntasVerificadas} preguntas`;
        }

        // Ordenar temas con ordenamiento numérico inteligente
        temasPrincipales.sort((a, b) => {
            const nombreA = a.nombre;
            const nombreB = b.nombre;
            
            const numeroA = nombreA.match(/\d+/);
            const numeroB = nombreB.match(/\d+/);
            
            if (numeroA && numeroB) {
                return parseInt(numeroA[0]) - parseInt(numeroB[0]);
            } else {
                return nombreA.localeCompare(nombreB);
            }
        });

        // Renderizar temas principales con sus subtemas
        temasPrincipales.forEach((tema) => {
            const temaDiv = document.createElement('div');
            temaDiv.className = 'tema-dropdown-item';
            
            const tieneSubtemas = subtemasPorPadre[tema.id] && subtemasPorPadre[tema.id].length > 0;
            
            temaDiv.innerHTML = `
                <div class="tema-principal-row">
                    <label class="tema-label">
                        <div class="checkbox-y-nombre">
                            <input type="checkbox" class="tema-checkbox" value="${tema.id}" 
                                   data-preguntas="${tema.preguntasVerificadas}" 
                                   onclick="debugClick(this)" onchange="manejarSeleccionTema(event)">
                            <span class="tema-nombre">${tema.nombre}</span>
                        </div>
                        <span class="tema-preguntas">${tema.preguntasVerificadas} preguntas</span>
                    </label>
                    ${tieneSubtemas ? `
                        <div class="subtemas-toggle" onclick="toggleSubtemas('${tema.id}')">
                            <span class="subtema-arrow" id="arrow-${tema.id}">▶</span>
                        </div>
                    ` : ''}
                </div>
                ${tieneSubtemas ? `
                    <div class="subtemas-container" id="subtemas-${tema.id}" style="display: none;">
                        ${subtemasPorPadre[tema.id].map(subtema => `
    <div class="subtema-row">
        <label class="subtema-label">
            <div class="checkbox-y-nombre">
                <input type="checkbox" class="tema-checkbox" value="${subtema.id}" 
                       data-preguntas="${subtema.preguntasVerificadas}" 
                       data-tema-padre="${tema.id}"
                       onclick="debugClick(this)" onchange="manejarSeleccionTema(event)">
                <span class="subtema-nombre">↳ ${subtema.nombre}</span>
            </div>
            <span class="subtema-preguntas">${subtema.preguntasVerificadas} preguntas</span>
        </label>
    </div>
`).join('')}
                    </div>
                ` : ''}
            `;
            
            listaContainer.appendChild(temaDiv);
        });

        // Actualizar contador inicial
        actualizarPreguntasDisponibles();
        
    } catch (error) {
        console.error('Error cargando temas para test:', error);
    } finally {
        cargandoTemasTest = false;
    }
    
    // Configurar eventos post-carga
    setTimeout(() => {
        console.log('Ejecutando configuración post-carga...');
        forzarEventListeners();
        
        const primerCantidad = document.querySelector('.btn-cantidad');
        if (primerCantidad) {
            primerCantidad.click();
        }
        
        const ultimoTiempo = document.querySelector('.btn-tiempo[data-tiempo="sin"]');
        if (ultimoTiempo) {
            ultimoTiempo.click();
        }
    }, 500);
}

// Actualizar contador de preguntas disponibles
async function actualizarPreguntasDisponibles() {
    const infoElement = document.getElementById('preguntasDisponibles');
    if (!infoElement) return;
    
    try {
        const todosLosTemas = document.getElementById('todosLosTemas');
        const temasCheckboxes = document.querySelectorAll('.tema-checkbox:checked');
        
        let preguntasVerificadas = 0;
        
        if (todosLosTemas && todosLosTemas.checked) {
            // Contar todas las preguntas verificadas
            const q = query(collection(db, "temas"), where("usuarioId", "==", currentUser.uid));
            const querySnapshot = await getDocs(q);
            
            querySnapshot.forEach((doc) => {
                const tema = doc.data();
                if (tema.preguntas) {
                    preguntasVerificadas += tema.preguntas.filter(p => p.verificada).length;
                }
            });
        } else {
            // CORRECCIÓN: No sumar duplicados entre tema padre e hijos
            const temasSeleccionados = new Set();
            const subtemasPadres = new Set();
            
            // Primero, identificar qué temas son subtemas y cuáles son sus padres
            temasCheckboxes.forEach(checkbox => {
                const temaPadre = checkbox.getAttribute('data-tema-padre');
                if (temaPadre) {
                    subtemasPadres.add(temaPadre);
                }
                temasSeleccionados.add(checkbox.value);
            });
            
            // Solo contar preguntas de temas que NO tienen hijos seleccionados
            temasCheckboxes.forEach(checkbox => {
                const temaId = checkbox.value;
                const temaPadre = checkbox.getAttribute('data-tema-padre');
                
                // Si es un subtema, contar sus preguntas
                if (temaPadre) {
                    preguntasVerificadas += parseInt(checkbox.dataset.preguntas) || 0;
                }
                // Si es un tema padre pero NO tiene subtemas seleccionados, contar sus preguntas
                else if (!subtemasPadres.has(temaId)) {
                    preguntasVerificadas += parseInt(checkbox.dataset.preguntas) || 0;
                }
                // Si es un tema padre CON subtemas seleccionados, NO contar (evitar duplicados)
            });
        }

        infoElement.textContent = `${preguntasVerificadas} preguntas verificadas disponibles`;
    } catch (error) {
        console.error('Error actualizando preguntas disponibles:', error);
        infoElement.textContent = 'Error al cargar preguntas';
    }
}

function obtenerTemasSeleccionados() {
    console.log('=== DEBUG OBTENER TEMAS SELECCIONADOS ===');
    
    const todosLosTemas = document.getElementById('todosLosTemas');
    
    if (todosLosTemas && todosLosTemas.checked) {
        console.log('RESULTADO: "todos"');
        return 'todos';
    }
    
    // Obtener checkboxes marcados excluyendo "todos los temas"
    const checkboxesMarcados = document.querySelectorAll('.tema-checkbox:checked:not(#todosLosTemas)');
    console.log('Checkboxes de temas específicos encontrados:', checkboxesMarcados.length);
    
    const idsSeleccionados = Array.from(checkboxesMarcados).map(cb => cb.value);
    console.log('IDs extraídos:', idsSeleccionados);
    
    if (idsSeleccionados.length === 0) {
        console.log('FALLBACK: No hay temas específicos, devolviendo "todos"');
        return 'todos';
    }
    
    console.log('RESULTADO FINAL:', idsSeleccionados);
    return idsSeleccionados;
}


// Empezar test
// Empezar test
async function empezarTest() {
    console.log('=== DEBUG EMPEZAR TEST ===');
    
    // NUEVO: Verificar modo seleccionado
    const btnModoActivo = document.querySelector('.mode-btn.active');
    const modoSeleccionado = btnModoActivo ? btnModoActivo.dataset.mode : 'completo';
    console.log('Modo seleccionado:', modoSeleccionado);
    
    const temasSeleccionados = obtenerTemasSeleccionados();
    console.log('Temas seleccionados devueltos:', temasSeleccionados);
    console.log('Tipo de temasSeleccionados:', typeof temasSeleccionados);
    console.log('Es array:', Array.isArray(temasSeleccionados));
    if (Array.isArray(temasSeleccionados)) {
        console.log('Longitud del array:', temasSeleccionados.length);
    }
    
    const numPreguntas = document.getElementById('preguntasSeleccionadas').value;
    const tiempoSeleccionado = document.getElementById('tiempoSeleccionado').value;
    const nombreTest = document.getElementById('nombreTest').value.trim();

    // Validaciones
    if (!nombreTest) {
        alert('Por favor, ingresa un nombre para el test');
        return;
    }

    if (!temasSeleccionados || (Array.isArray(temasSeleccionados) && temasSeleccionados.length === 0)) {
        alert('Por favor, selecciona al menos un tema');
        return;
    }

    try {
        // Obtener preguntas verificadas
        const preguntasDisponibles = await obtenerPreguntasVerificadas(temasSeleccionados);
        
        if (preguntasDisponibles.length === 0) {
            alert('No hay preguntas verificadas disponibles para los temas seleccionados');
            return;
        }

        // Determinar número final de preguntas
        const numFinal = numPreguntas === 'todas' ? 
            preguntasDisponibles.length : Math.min(parseInt(numPreguntas), preguntasDisponibles.length);
        
        if (numFinal > preguntasDisponibles.length) {
            alert(`Solo hay ${preguntasDisponibles.length} preguntas verificadas disponibles`);
            return;
        }

        // Obtener preguntas únicas y aleatorias
        const preguntasSeleccionadas = obtenerPreguntasUnicasAleatorias(preguntasDisponibles, numFinal);

        // NUEVO: Si el modo es "pregunta", guardar config y redirigir
        if (modoSeleccionado === 'pregunta') {
            const configuracion = {
                nombreTest: nombreTest,
                temas: temasSeleccionados,
                preguntas: preguntasSeleccionadas,
                numPreguntas: numFinal,
                tiempoLimite: tiempoSeleccionado
            };
            
            localStorage.setItem('testConfig', JSON.stringify(configuracion));
            window.location.href = 'tests-pregunta.html';
            return;
        }

        // Crear objeto de test (solo para modo completo)
        testActual = {
            id: generarIdTest(),
            nombre: nombreTest,
            tema: temasSeleccionados,
            preguntas: preguntasSeleccionadas,
            tiempoLimite: tiempoSeleccionado,
            fechaInicio: new Date(),
            usuarioId: currentUser.uid,
            esRepaso: false
        };

        window.testActual = testActual;  // AÑADIR ESTA LÍNEA
        respuestasUsuario = {};

        // Mostrar interfaz del test
        mostrarInterfazTest();
        
        // Iniciar cronómetro si hay límite de tiempo
        if (tiempoSeleccionado !== 'sin') {
            iniciarCronometro(parseInt(tiempoSeleccionado) * 60);
        }

    } catch (error) {
        console.error('Error empezando test:', error);
        alert('Error al iniciar el test');
    }
}

// Obtener preguntas verificadas (VERSIÓN CORREGIDA)
async function obtenerPreguntasVerificadas(temasSeleccionados) {
    console.log('=== OBTENER PREGUNTAS VERIFICADAS ===');
    console.log('Temas seleccionados:', temasSeleccionados);
    
    let preguntasVerificadas = [];

    if (temasSeleccionados === 'todos') {
        console.log('Caso: todos los temas');
        const q = query(collection(db, "temas"), where("usuarioId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        
        querySnapshot.forEach((doc) => {
            const tema = doc.data();
            console.log(`Procesando tema: ${tema.nombre} (ID: ${doc.id})`);
            
            if (tema.preguntas) {
                console.log(`  Total preguntas en el tema: ${tema.preguntas.length}`);
                
                tema.preguntas.forEach((pregunta, index) => {
                    if (pregunta.verificada) {
                        // Determinar tema para progreso - usar padre si existe
                    let temaIdParaProgreso = doc.id;
                    if (tema.temaPadreId) {
                        temaIdParaProgreso = tema.temaPadreId;
                    }

                    preguntasVerificadas.push({
                            ...pregunta,
                            temaId: doc.id,
                            temaIdProgreso: temaIdParaProgreso,
                            temaNombre: tema.nombre,
                            temaEpigrafe: tema.epigrafe || ''
                        });
                        console.log(`  Pregunta verificada ${index}: ${pregunta.texto.substring(0, 50)}...`);
                    }
                });
            }
        });
    } else if (Array.isArray(temasSeleccionados) && temasSeleccionados.length > 0) {
        console.log('Caso: array de temas específicos');
        console.log('IDs de temas a procesar:', temasSeleccionados);
        
        // OPTIMIZADO: Procesar todos los temas en paralelo
const promesasTemas = temasSeleccionados.map(temaId => 
    getDoc(doc(db, "temas", temaId))
);

const documentos = await Promise.all(promesasTemas);

documentos.forEach((temaDoc, idx) => {
    const temaId = temasSeleccionados[idx];
    console.log(`\n--- Procesando tema ID: ${temaId} ---`);
    
    if (temaDoc.exists()) {
                    const tema = temaDoc.data();
                    console.log(`✅ Tema encontrado: ${tema.nombre}`);
                    
                    if (tema.preguntas && tema.preguntas.length > 0) {
                        console.log(`  Total preguntas en el tema: ${tema.preguntas.length}`);
                        
                        let preguntasVerificadasTema = 0;
                        tema.preguntas.forEach((pregunta, index) => {
                            if (pregunta.verificada) {
                                // Determinar tema para progreso - usar padre si existe
                            let temaIdParaProgreso = temaId;
                            if (tema.temaPadreId) {
                                temaIdParaProgreso = tema.temaPadreId;
                            }

                            preguntasVerificadas.push({
                                    ...pregunta,
                                    temaId: temaId,
                                    temaIdProgreso: temaIdParaProgreso,
                                    temaNombre: tema.nombre,
                                    temaEpigrafe: tema.epigrafe || ''
                                });
                                preguntasVerificadasTema++;
                                console.log(`    ✓ Pregunta verificada ${index}: ${pregunta.texto.substring(0, 50)}...`);
                            } else {
                                console.log(`    ✗ Pregunta NO verificada ${index}: ${pregunta.texto.substring(0, 50)}...`);
                            }
                        });
                        
                        console.log(`  📊 Total verificadas de este tema: ${preguntasVerificadasTema}`);
                    } else {
                        console.log(`  ⚠️ Tema sin preguntas`);
                    }
                } else {
                    console.log(`  ❌ TEMA NO ENCONTRADO: ${temaId}`);
                }
});
    } else {
        console.log('❌ Caso no válido - temasSeleccionados:', temasSeleccionados);
    }

    console.log(`\n=== RESUMEN FINAL ===`);
    console.log(`Total preguntas verificadas recopiladas: ${preguntasVerificadas.length}`);
    
    // Agrupar por tema para el resumen
    const resumenPorTema = {};
    preguntasVerificadas.forEach(p => {
        const tema = p.temaNombre || p.temaId || 'sin-tema';
        resumenPorTema[tema] = (resumenPorTema[tema] || 0) + 1;
    });
    
    console.log('Distribución de preguntas verificadas por tema:');
    Object.entries(resumenPorTema).forEach(([tema, count]) => {
        console.log(`  ${tema}: ${count} preguntas`);
    });
    
    console.log('=====================================');
    return preguntasVerificadas;
}

// Mostrar interfaz del test
function mostrarInterfazTest() {
    // Ocultar configuración
    document.querySelector('.test-config-container').style.display = 'none';
    
    // Ocultar test de repaso durante la ejecución del test
    const containerRepaso = document.getElementById('testRepasoContainer');
    if (containerRepaso) {
        containerRepaso.style.display = 'none';
    }
    
    // Mostrar test en ejecución
    document.getElementById('testEnEjecucion').style.display = 'block';
    
    // Actualizar header
    document.getElementById('tituloTestActual').textContent = testActual.nombre;
    document.getElementById('totalPreguntasTest').textContent = testActual.preguntas.length;
    
    // Generar preguntas
    generarPreguntasTest();
}

// Generar preguntas del test
function generarPreguntasTest() {
    const container = document.getElementById('preguntasTestContainer');
    container.innerHTML = '';

    testActual.preguntas.forEach((pregunta, index) => {
        const preguntaDiv = document.createElement('div');
        preguntaDiv.className = 'pregunta-test';
        
        preguntaDiv.innerHTML = `
            <div class="pregunta-header">
                <div class="pregunta-numero">${index + 1}</div>
                <div class="pregunta-tema-info">
                    ${pregunta.temaNombre}${pregunta.temaEpigrafe ? ` - ${pregunta.temaEpigrafe}` : ''}
                </div>
            </div>
            <div class="pregunta-texto">${pregunta.texto}</div>
            <div class="opciones-test">
                ${pregunta.opciones.map(opcion => `
                    <label class="opcion-test" data-pregunta="${index}" data-opcion="${opcion.letra}">
                        <input type="radio" name="pregunta_${index}" value="${opcion.letra}">
                        <span class="opcion-texto">${opcion.letra}) ${opcion.texto}</span>
                    </label>
                `).join('')}
            </div>
        `;

        container.appendChild(preguntaDiv);
    });

    // Agregar event listeners para respuestas
    document.querySelectorAll('.opcion-test').forEach(opcion => {
        opcion.addEventListener('click', function() {
            const preguntaIndex = this.dataset.pregunta;
            const opcionLetra = this.dataset.opcion;
            
            // Deseleccionar otras opciones de la misma pregunta
            document.querySelectorAll(`input[name="pregunta_${preguntaIndex}"]`).forEach(radio => {
                radio.closest('.opcion-test').classList.remove('seleccionada');
            });
            
            // Seleccionar esta opción
            this.classList.add('seleccionada');
            this.querySelector('input').checked = true;
            
            // Guardar respuesta
            respuestasUsuario[preguntaIndex] = opcionLetra;
            
            // Actualizar progreso
            actualizarProgreso();
        });
    });
}

// Actualizar progreso
function actualizarProgreso() {
    const respondidas = Object.keys(respuestasUsuario).length;
    document.getElementById('preguntaActualNum').textContent = respondidas;
}

// Iniciar cronómetro
function iniciarCronometro(segundos) {
    tiempoRestanteSegundos = segundos;
    
    cronometroInterval = setInterval(() => {
        tiempoRestanteSegundos--;
        actualizarDisplayCronometro();
        
        if (tiempoRestanteSegundos <= 0) {
            clearInterval(cronometroInterval);
            finalizarTest();
        }
    }, 1000);
    
    actualizarDisplayCronometro();
}

// Actualizar display del cronómetro
function actualizarDisplayCronometro() {
    const minutos = Math.floor(tiempoRestanteSegundos / 60);
    const segundos = tiempoRestanteSegundos % 60;
    const display = `${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`;
    
    document.getElementById('tiempoRestante').textContent = display;
    
    // Cambiar color cuando quedan menos de 5 minutos
    if (tiempoRestanteSegundos <= 300) {
        document.getElementById('tiempoRestante').style.color = '#dc3545';
    }
}

// Finalizar test
async function finalizarTest() {
    console.log('=== DEBUG FINALIZAR TEST ===');
    console.log('testActual completo:', testActual);
    
    if (!testActual) {
        console.error('❌ testActual es null');
        alert('Error: no hay test activo');
        volverAConfigurarTest();
        return;
    }
    
    console.log('testActual.tema:', testActual.tema);
    console.log('tipo de testActual.tema:', typeof testActual.tema);
    console.log('Array.isArray(testActual.tema):', Array.isArray(testActual.tema));
    console.log('===============================');
    
    if (cronometroInterval) {
        clearInterval(cronometroInterval);
    }
    
    // Calcular resultados
    const resultados = calcularResultados();
    
    if (!resultados) {
        console.error('❌ Error calculando resultados');
        alert('Error al calcular resultados del test');
        volverAConfigurarTest();
        return;
    }
    
    console.log('Resultados calculados:', resultados);
    
    // Guardar resultado en Firebase
    try {
        await guardarResultado(resultados);
    } catch (error) {
        console.error('Error guardando resultado:', error);
    }
    
    // Registrar test en progreso automáticamente
    try {
        // Obtener temas utilizados en el test
        let temasUtilizados = [];
        
        console.log('=== PROCESANDO TEMAS PARA PROGRESO ===');
        console.log('testActual.tema antes de procesar:', testActual.tema);
        
        if (testActual.tema === 'todos') {
            console.log('Caso: todos los temas');
            // Si fue test de todos los temas, obtener todos los temas únicos de las preguntas usando temaIdProgreso
            const temasUnicos = new Set();
            testActual.preguntas.forEach(pregunta => {
                const temaProgreso = pregunta.temaIdProgreso || pregunta.temaId;
                console.log(`PREGUNTA: ${pregunta.texto.substring(0, 30)}... -> TEMA PROGRESO: ${temaProgreso}`);
                if (temaProgreso) {
                    temasUnicos.add(temaProgreso);
                }
            });
            temasUtilizados = Array.from(temasUnicos);
        } else if (Array.isArray(testActual.tema)) {
            console.log('Caso: array de temas específicos');
            console.log('Temas originalmente seleccionados:', testActual.tema);
            
            // Si seleccionaste un solo tema, usar ese tema directamente
            if (testActual.tema.length === 1) {
                console.log('-> Un solo tema seleccionado, usando directamente');
                temasUtilizados = [testActual.tema[0]];
            } else {
                console.log('-> Múltiples temas seleccionados, extrayendo de preguntas');
                // Múltiples temas: extraer de las preguntas
                const temasUnicos = new Set();
                testActual.preguntas.forEach(pregunta => {
                    const temaProgreso = pregunta.temaIdProgreso || pregunta.temaId;
                    if (temaProgreso) {
                        temasUnicos.add(temaProgreso);
                    }
                });
                temasUtilizados = Array.from(temasUnicos);
            }
        } else if (typeof testActual.tema === 'string' && testActual.tema !== 'repaso') {
            console.log('Caso: tema string individual');
            // Si fue un tema específico (pero no repaso)
            temasUtilizados = [testActual.tema];
        } else {
            console.log('Caso: no reconocido o repaso - extrayendo de preguntas');
            // Fallback: extraer de las preguntas usando temaIdProgreso
            const temasUnicos = new Set();
            testActual.preguntas.forEach(pregunta => {
                const temaProgreso = pregunta.temaIdProgreso || pregunta.temaId;
                console.log(`PREGUNTA: ${pregunta.texto.substring(0, 30)}... -> TEMA PROGRESO: ${temaProgreso}`);
                if (temaProgreso) {
                    temasUnicos.add(temaProgreso);
                }
            });
            temasUtilizados = Array.from(temasUnicos);
        }
        
        console.log('TEMAS FINALES PARA PROGRESO:', temasUtilizados);
        console.log('Temas utilizados calculados:', temasUtilizados);
        
        // USAR SIEMPRE LA FUNCIÓN DIRECTA para mayor confiabilidad
        if (temasUtilizados.length > 0) {
            console.log('Registrando test directamente...');
            await registrarTestDirectamenteEnTests(temasUtilizados);
            // NUEVO: Registrar también en progresoSimple para progreso diario
            await registrarTestEnProgresoSimple(temasUtilizados);
        } else {
            console.log('No hay temas válidos para registrar');
        }
        
    } catch (error) {
        console.error('Error integrando con progreso:', error);
    }
    
    // Mostrar resultados
    mostrarResultados(resultados);
}

// Calcular resultados
function calcularResultados() {
    console.log('=== CALCULAR RESULTADOS ===');
    console.log('testActual:', testActual);
    
    if (!testActual || !testActual.preguntas) {
        console.error('❌ testActual inválido');
        return null;
    }
    
    let correctas = 0;
    let incorrectas = 0;
    let sinResponder = 0;
    
    const detalleRespuestas = testActual.preguntas.map((pregunta, index) => {
        const respuestaUsuario = respuestasUsuario[index];
        const respuestaCorrecta = pregunta.respuestaCorrecta;
        
        let estado = 'sin-respuesta';
        if (respuestaUsuario) {
            if (respuestaUsuario === respuestaCorrecta) {
                estado = 'correcta';
                correctas++;
            } else {
                estado = 'incorrecta';
                incorrectas++;
            }
        } else {
            sinResponder++;
        }
        
        return {
            pregunta,
            respuestaUsuario,
            respuestaCorrecta,
            estado,
            indice: index + 1
        };
    });
    
    const total = testActual.preguntas.length;
    const porcentaje = total > 0 ? Math.round((correctas / total) * 100) : 0;
    
    return {
        correctas,
        incorrectas,
        sinResponder,
        total,
        porcentaje,
        detalleRespuestas,
        test: testActual,
        tiempoEmpleado: testActual.tiempoLimite !== 'sin' ? 
            (parseInt(testActual.tiempoLimite) * 60) - tiempoRestanteSegundos : 
            Math.floor((new Date() - testActual.fechaInicio) / 1000)
    };
}

// Mostrar resultados
function mostrarResultados(resultados) {
    console.log('=== MOSTRAR RESULTADOS ===');
    console.log('Resultados recibidos:', resultados);
    
    if (!resultados || !resultados.test) {
        console.error('❌ Resultados inválidos');
        alert('Error mostrando resultados');
        volverAConfigurarTest();
        return;
    }
    
    try {
        // Ocultar COMPLETAMENTE test en ejecución
        const testEjecucion = document.getElementById('testEnEjecucion');
        if (testEjecucion) {
            testEjecucion.style.display = 'none';
        }
    
    // Ocultar COMPLETAMENTE test de repaso
    const containerRepaso = document.getElementById('testRepasoContainer');
    if (containerRepaso) {
        containerRepaso.style.display = 'none';
    }
    
    // Ocultar COMPLETAMENTE configuración del test
    const configContainer = document.querySelector('.test-config-container');
    if (configContainer) {
        configContainer.style.display = 'none';
    }
    
    // Resetear el contenedor principal
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.style.paddingTop = '0';
        mainContent.style.marginTop = '120px';
    }
    
    // Mostrar contenedor de resultados limpio
    const container = document.getElementById('resultadosTest');
    container.style.display = 'block';
    container.style.position = 'static';
    container.style.zIndex = 'auto';
    container.style.width = '100%';
    container.style.top = 'auto';
    container.style.left = 'auto';
    
    // Generar HTML de resultados
    container.innerHTML = generarHTMLResultados(resultados);
    
    // Scroll suave al inicio después de un breve delay
        setTimeout(() => {
            window.scrollTo({ 
                top: 0, 
                behavior: 'smooth' 
            });
        }, 300);
        
    } catch (error) {
        console.error('❌ Error en mostrarResultados:', error);
        alert('Error mostrando resultados: ' + error.message);
        volverAConfigurarTest();
    }
}
// Generar HTML de resultados
function generarHTMLResultados(resultados) {
    console.log('=== GENERAR HTML RESULTADOS ===');
    console.log('Resultados recibidos:', resultados);
    
    // VALIDACIÓN COMPLETA
    if (!resultados) {
        console.error('❌ Resultados es null o undefined');
        return '<div style="padding: 40px; text-align: center; color: #dc3545;"><h3>⚠️ Error: No hay datos de resultados</h3><p>Por favor, vuelve a intentar el test.</p><button onclick="volverAConfigurarTest()" class="btn-empezar-test">Volver</button></div>';
    }
    
    if (!resultados.test) {
        console.error('❌ resultados.test es null o undefined');
        console.log('Estructura completa:', JSON.stringify(resultados, null, 2));
        return '<div style="padding: 40px; text-align: center; color: #dc3545;"><h3>⚠️ Error: Datos del test incompletos</h3><p>Faltan datos del test.</p><button onclick="volverAConfigurarTest()" class="btn-empezar-test">Volver</button></div>';
    }
    
    if (!resultados.test.nombre) {
        console.error('❌ resultados.test.nombre es null');
        console.log('resultados.test:', resultados.test);
    }
    
    const { correctas, incorrectas, sinResponder, total, porcentaje, detalleRespuestas, tiempoEmpleado } = resultados;
    
    // Determinar mensaje según porcentaje
    let mensaje = '';
    let icono = '';
    if (porcentaje >= 90) {
        mensaje = 'Excelente trabajo!';
        icono = '🏆';
    } else if (porcentaje >= 75) {
        mensaje = 'Muy bien!';
        icono = '⭐';
    } else if (porcentaje >= 60) {
        mensaje = 'Buen trabajo';
        icono = '📈';
    } else {
        mensaje = 'Sigue practicando!';
        icono = '📚';
    }

    const tiempoFormateado = formatearTiempo(tiempoEmpleado || 0);
    const fechaTest = resultados.test.fechaInicio ? 
        new Date(resultados.test.fechaInicio.seconds * 1000).toLocaleDateString('es-ES') : 
        new Date().toLocaleDateString('es-ES');

    let html = '<div class="resultado-header">';
    // Botón hacer otro test arriba
    html += '<div style="text-align: center; margin-bottom: 20px;">';
    html += '<button onclick="volverAConfigurarTest()" class="btn-empezar-test">Hacer Otro Test</button>';
    html += '</div>';
    html += '<div class="resultado-icono">' + icono + '</div>';
    // Determinar color según aciertos
    let colorPuntuacion = '';
    if (correctas > total / 2) {
        colorPuntuacion = '#28a745'; // Verde - más de la mitad correctas
    } else if (correctas === total / 2) {
        colorPuntuacion = '#ffc107'; // Amarillo - exactamente la mitad
    } else {
        colorPuntuacion = '#dc3545'; // Rojo - menos de la mitad correctas
    }

html += '<div class="resultado-porcentaje" style="color: ' + colorPuntuacion + '">' + correctas + '/' + total + '</div>';

html += '<div class="resultado-mensaje">' + mensaje + '</div>';
html += '<div class="resultado-detalles">';
html += testActual.nombre + ' - ' + new Date().toLocaleDateString('es-ES') + ' ' + new Date().toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'});
html += '<br>Tiempo empleado: ' + tiempoFormateado;
html += '</div>';
html += '</div>';

html += '<div class="estadisticas-grid">';
html += '<div class="estadistica-card correctas">';
html += '<div class="estadistica-icono">✅</div>';
html += '<div class="estadistica-numero">' + correctas + '</div>';
html += '<div class="estadistica-label">Correctas</div>';
html += '</div>';
html += '<div class="estadistica-card incorrectas">';
html += '<div class="estadistica-icono">❌</div>';
html += '<div class="estadistica-numero">' + incorrectas + '</div>';
html += '<div class="estadistica-label">Incorrectas</div>';
html += '</div>';
html += '<div class="estadistica-card sin-responder">';
html += '<div class="estadistica-icono">⭕</div>';
html += '<div class="estadistica-numero">' + sinResponder + '</div>';
html += '<div class="estadistica-label">Sin responder</div>';
html += '</div>';
html += '</div>';

html += '<div class="revision-respuestas">';
html += '<div class="revision-header">';
html += '<h3>Revisión de Respuestas</h3>';
html += '</div>';
    
    detalleRespuestas.forEach(detalle => {
        html += '<div class="pregunta-revision ' + detalle.estado + '">';
        html += '<div class="revision-pregunta-header">';
        html += '<strong>Pregunta ' + detalle.indice + '</strong>';
        html += '<span class="revision-estado ' + detalle.estado + '">';
        if (detalle.estado === 'correcta') {
            html += 'Correcta';
        } else if (detalle.estado === 'incorrecta') {
            html += 'Incorrecta';
        } else {
            html += 'Sin responder';
        }
        html += '</span>';
        html += '<span class="pregunta-tema-info">';
        html += detalle.pregunta.temaNombre;
        if (detalle.pregunta.temaEpigrafe) {
            html += ' - ' + detalle.pregunta.temaEpigrafe;
        }
        html += '</span>';
        html += '</div>';
        html += '<div class="pregunta-texto">' + detalle.pregunta.texto + '</div>';
        html += '<div class="todas-las-opciones">';
        
        detalle.pregunta.opciones.forEach(opcion => {
            let clases = 'opcion-revision';
            if (opcion.letra === detalle.respuestaCorrecta) {
                clases += ' correcta';
            }
            if (opcion.letra === detalle.respuestaUsuario) {
                clases += ' seleccionada';
            }
            
            html += '<div class="' + clases + '">';
            html += opcion.letra + ') ' + opcion.texto;
            if (opcion.letra === detalle.respuestaCorrecta) {
                html += ' ✓';
            }
            if (opcion.letra === detalle.respuestaUsuario && opcion.letra !== detalle.respuestaCorrecta) {
                html += ' ✗';
            }
            html += '</div>';
        });
        
        html += '</div>';
        if (!detalle.respuestaUsuario) {
            html += '<div class="sin-respuesta-nota">No respondiste esta pregunta</div>';
        }
        html += '</div>';
    });
    
    html += '</div>';
    html += '<div style="text-align: center; margin-top: 30px;">';
    html += '<button onclick="volverAConfigurarTest()" class="btn-empezar-test">Hacer Otro Test</button>';
    html += '</div>';

    return html;
}

// Guardar resultado en Firebase
async function guardarResultado(resultados) {
    try {
        // Limpiar datos antes de guardar para evitar undefined
        const datosLimpios = {
            correctas: resultados.correctas || 0,
            incorrectas: resultados.incorrectas || 0,
            sinResponder: resultados.sinResponder || 0,
            total: resultados.total || 0,
            porcentaje: resultados.porcentaje || 0,
            tiempoEmpleado: resultados.tiempoEmpleado || 0,
            test: {
                id: resultados.test.id || '',
                nombre: resultados.test.nombre || '',
                tema: resultados.test.tema || 'todos',
                fechaInicio: resultados.test.fechaInicio || new Date()
            },
            detalleRespuestas: (resultados.detalleRespuestas || []).map(detalle => ({
                indice: detalle.indice || 0,
                estado: detalle.estado || 'sin-respuesta',
                respuestaUsuario: detalle.respuestaUsuario || null,
                respuestaCorrecta: detalle.respuestaCorrecta || 'A',
                pregunta: {
                    texto: detalle.pregunta?.texto || '',
                    temaNombre: detalle.pregunta?.temaNombre || '',
                    temaEpigrafe: detalle.pregunta?.temaEpigrafe || '',
                    temaId: detalle.pregunta?.temaId || '',
                    opciones: (detalle.pregunta?.opciones || []).map(opcion => ({
                        letra: opcion.letra || 'A',
                        texto: opcion.texto || '',
                        esCorrecta: Boolean(opcion.esCorrecta)
                    }))
                }
            })),
            fechaCreacion: new Date(),
            usuarioId: currentUser.uid
        };

        // Guardar resultado principal
        await addDoc(collection(db, "resultados"), datosLimpios);
        
        // Invalidar caché de resultados
        cacheResultados = null;
sessionStorage.removeItem('cacheResultados');
sessionStorage.removeItem('cacheResultadosTimestamp');

        // Guardar preguntas falladas para el test de repaso (SOLO si NO es un test de repaso)
        if (!testActual.esRepaso) {
            const preguntasFalladas = resultados.detalleRespuestas.filter(detalle => 
                detalle.estado === 'incorrecta' || detalle.estado === 'sin-respuesta'
            );

            if (preguntasFalladas.length > 0) {
                // Guardar cada pregunta fallada en la colección especial
                const promesasGuardado = preguntasFalladas.map(async (detalle) => {
                    const preguntaFallada = {
                        usuarioId: currentUser.uid,
                        pregunta: {
                            texto: detalle.pregunta.texto,
                            opciones: detalle.pregunta.opciones,
                            respuestaCorrecta: detalle.respuestaCorrecta,
                            temaId: detalle.pregunta.temaId || '',
                            temaNombre: detalle.pregunta.temaNombre || '',
                            temaEpigrafe: detalle.pregunta.temaEpigrafe || ''
                        },
                        respuestaUsuario: detalle.respuestaUsuario,
                        estado: detalle.estado,
                        fechaFallo: new Date(),
                        testId: resultados.test.id,
                        testNombre: resultados.test.nombre
                    };

                    return addDoc(collection(db, "preguntasFalladas"), preguntaFallada);
                });

                await Promise.all(promesasGuardado);
                console.log(`${preguntasFalladas.length} preguntas falladas guardadas para repaso`);
            }
        } else {
            // Si ES un test de repaso, eliminar las preguntas respondidas correctamente
            const preguntasCorrectas = resultados.detalleRespuestas.filter(detalle => 
                detalle.estado === 'correcta'
            );

            if (preguntasCorrectas.length > 0) {
                const promesasEliminacion = preguntasCorrectas.map(async (detalle) => {
                    // Buscar y eliminar la pregunta fallada que ahora fue respondida correctamente
                    const q = query(
                        collection(db, "preguntasFalladas"),
                        where("usuarioId", "==", currentUser.uid),
                        where("pregunta.texto", "==", detalle.pregunta.texto)
                    );
                    
                    const querySnapshot = await getDocs(q);
                    const eliminaciones = [];
                    
                    querySnapshot.forEach((doc) => {
                        eliminaciones.push(deleteDoc(doc.ref));
                    });
                    
                    return Promise.all(eliminaciones);
                });

                await Promise.all(promesasEliminacion);
                console.log(`${preguntasCorrectas.length} preguntas falladas eliminadas tras respuesta correcta`);
                
                // Actualizar interfaz del test de repaso
                setTimeout(() => cargarTestRepaso(), 1000);
            }
        }

    } catch (error) {
        console.error('Error guardando resultado:', error);
        throw error;
    }
}

function generarIdTest() {
    return 'test_' + new Date().getTime() + '_' + Math.random().toString(36).substr(2, 9);
}

function formatearTiempo(segundos) {
    const horas = Math.floor(segundos / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);
    const segs = segundos % 60;
    
    if (horas > 0) {
        return `${horas}:${minutos.toString().padStart(2, '0')}:${segs.toString().padStart(2, '0')}`;
    } else {
        return `${minutos}:${segs.toString().padStart(2, '0')}`;
    }
}

// Volver a configurar test
// Volver a configurar test
window.volverAConfigurarTest = function() {
    // Limpiar variables
    testActual = null;
    respuestasUsuario = {};
    
    if (cronometroInterval) {
        clearInterval(cronometroInterval);
    }
    
    // IMPORTANTE: Cambiar a la sección aleatorio
    cambiarSeccion('aleatorio');
    
    // Ocultar resultados COMPLETAMENTE
    const resultadosTest = document.getElementById('resultadosTest');
    if (resultadosTest) {
        resultadosTest.style.display = 'none';
        resultadosTest.innerHTML = ''; // Limpiar contenido
    }
    
    // Ocultar test en ejecución
    const testEjecucion = document.getElementById('testEnEjecucion');
    if (testEjecucion) {
        testEjecucion.style.display = 'none';
    }
    
    // Mostrar configuración
    const configContainer = document.querySelector('.test-config-container');
    if (configContainer) {
        configContainer.style.display = 'block';
    }
    
    // Limpiar formulario
    const nombreTest = document.getElementById('nombreTest');
    const tiempoRestante = document.getElementById('tiempoRestante');
    
    if (nombreTest) {
        nombreTest.value = '';
    }
    if (tiempoRestante) {
        tiempoRestante.style.color = '#dc3545';
    }
    
    // Scroll al inicio
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Actualizar preguntas disponibles
    if (typeof actualizarPreguntasDisponibles === 'function') {
        actualizarPreguntasDisponibles();
    }
};
// Cargar historial de resultados
async function cargarResultados() {
    if (cargandoResultados) {
        console.log('⏸️ Ya cargando resultados, omitiendo...');
        return;
    }
    
    try {
        cargandoResultados = true;
        const listResultados = document.getElementById('listaResultados');
        if (!listResultados) {
            cargandoResultados = false;
            return;
        }
        
        let querySnapshot;
        
        // 🆕 RECUPERAR CACHÉ DE sessionStorage
        const cacheGuardado = sessionStorage.getItem('cacheResultados');
        const timestampGuardado = sessionStorage.getItem('cacheResultadosTimestamp');
        
        if (cacheGuardado && timestampGuardado) {
            const tiempoTranscurrido = Date.now() - parseInt(timestampGuardado);
            
            if (tiempoTranscurrido < CACHE_DURACION) {
                console.log('✅ Recuperando caché resultados desde sessionStorage');
                const datosCache = JSON.parse(cacheGuardado);
                
                querySnapshot = {
                    empty: datosCache.length === 0,
                    size: datosCache.length,
                    forEach: function(callback) {
                        datosCache.forEach(item => {
                            callback({
                                id: item.id,
                                data: () => item.data
                            });
                        });
                    }
                };
                
                cacheResultados = querySnapshot;
                cacheResultadosTimestamp = parseInt(timestampGuardado);
            } else {
                sessionStorage.removeItem('cacheResultados');
                sessionStorage.removeItem('cacheResultadosTimestamp');
            }
        }
        
        if (!querySnapshot) {
            console.log('🔄 Recargando resultados desde Firebase');
            const q = query(
                collection(db, "resultados"), 
                where("usuarioId", "==", currentUser.uid)
            );
            querySnapshot = await getDocs(q);
            
            // 🆕 GUARDAR SOLO DATOS RESUMIDOS EN sessionStorage (sin detalleRespuestas)
            const datosParaGuardar = [];
            querySnapshot.forEach(doc => {
                const data = doc.data();
                datosParaGuardar.push({
                    id: doc.id,
                    data: {
                        correctas: data.correctas,
                        incorrectas: data.incorrectas,
                        sinResponder: data.sinResponder,
                        total: data.total,
                        porcentaje: data.porcentaje,
                        fechaCreacion: data.fechaCreacion,
                        test: data.test
                        // NO incluir detalleRespuestas (muy grande)
                    }
                });
            });
            
            try {
                sessionStorage.setItem('cacheResultados', JSON.stringify(datosParaGuardar));
                sessionStorage.setItem('cacheResultadosTimestamp', Date.now().toString());
                console.log('✅ Caché guardado exitosamente');
            } catch (e) {
                console.log('⚠️ No se pudo guardar caché (muy grande):', e);
                // Si falla, limpiar sessionStorage y continuar sin caché
                sessionStorage.removeItem('cacheResultados');
                sessionStorage.removeItem('cacheResultadosTimestamp');
            }
            
            cacheResultados = querySnapshot;
            cacheResultadosTimestamp = Date.now();
        }
        
        if (querySnapshot.empty) {
            listResultados.innerHTML = '<p>No has realizado ningún test aún.</p>';
            return;
        }
        
        listResultados.innerHTML = '';

        // PANEL DE ESTADÍSTICAS GLOBALES
        let totalTests = 0;
        let totalPreguntasContestadas = 0;
        let totalCorrectas = 0;
        let totalIncorrectas = 0;
        let sumaPorcentajes = 0;
        const preguntasUnicas = new Set();

        querySnapshot.forEach((doc) => {
            const resultado = doc.data();
            totalTests++;
            sumaPorcentajes += resultado.porcentaje || 0;
            totalCorrectas += resultado.correctas || 0;
            totalIncorrectas += resultado.incorrectas || 0;
            
            if (resultado.detalleRespuestas) {
                resultado.detalleRespuestas.forEach(detalle => {
                    if (detalle.pregunta && detalle.pregunta.texto) {
                        preguntasUnicas.add(detalle.pregunta.texto);
                    }
                });
            }
        });

const notaMedia = totalTests > 0 ? Math.round(sumaPorcentajes / totalTests) : 0;

const panelEstadisticas = document.createElement('div');
panelEstadisticas.className = 'panel-estadisticas-globales';
panelEstadisticas.innerHTML = `
    <h3>📊 Estadísticas Generales</h3>
    <div class="estadisticas-grid-global">
        <div class="stat-global nota-media">
            <div class="stat-icono">📈</div>
            <div class="stat-valor">${notaMedia}%</div>
            <div class="stat-label">Nota Media</div>
        </div>
        <div class="stat-global">
            <div class="stat-icono">📝</div>
            <div class="stat-valor">${preguntasUnicas.size}</div>
            <div class="stat-label">Preguntas Únicas</div>
        </div>
        <div class="stat-global correctas-global">
            <div class="stat-icono">✅</div>
            <div class="stat-valor">${totalCorrectas}</div>
            <div class="stat-label">Acertadas</div>
        </div>
        <div class="stat-global incorrectas-global">
            <div class="stat-icono">❌</div>
            <div class="stat-valor">${totalIncorrectas}</div>
            <div class="stat-label">Falladas</div>
        </div>
    </div>
`;
listResultados.appendChild(panelEstadisticas);

// Agregar botón eliminar todos más discreto
const eliminarTodosBtn = document.createElement('div');
eliminarTodosBtn.className = 'controles-resultados-discreto';
eliminarTodosBtn.innerHTML = `
    <button class="btn-ranking-fallos" onclick="window.location.href='ranking-fallos.html'">
        🏆 Ranking de Fallos
    </button>
    <button class="btn-eliminar-discreto" onclick="eliminarTodosResultados()" title="Eliminar todos los resultados">
        🗑️ Limpiar historial
    </button>
`;
listResultados.appendChild(eliminarTodosBtn);
        
        
       // Convertir a array y ordenar por fecha descendente
        const resultados = [];
        querySnapshot.forEach((doc) => {
            const resultado = doc.data();
            resultados.push({ id: doc.id, data: resultado });
        });
        
        // Ordenar por fecha de creación descendente (más reciente primero)
        resultados.sort((a, b) => {
    // Manejar tanto Timestamps de Firebase como strings de fecha del caché
    let fechaA, fechaB;
    
    if (a.data.fechaCreacion?.toDate) {
        fechaA = a.data.fechaCreacion.toDate();
    } else if (a.data.fechaCreacion?.seconds) {
        fechaA = new Date(a.data.fechaCreacion.seconds * 1000);
    } else if (a.data.fechaCreacion) {
        fechaA = new Date(a.data.fechaCreacion);
    } else {
        fechaA = new Date(0);
    }
    
    if (b.data.fechaCreacion?.toDate) {
        fechaB = b.data.fechaCreacion.toDate();
    } else if (b.data.fechaCreacion?.seconds) {
        fechaB = new Date(b.data.fechaCreacion.seconds * 1000);
    } else if (b.data.fechaCreacion) {
        fechaB = new Date(b.data.fechaCreacion);
    } else {
        fechaB = new Date(0);
    }
    
    return fechaB - fechaA;
});
        
        resultados.forEach(({ id, data: resultado }) => {
    
    // Manejar tanto Timestamps de Firebase como strings de fecha del caché
    let fechaObj;
    if (resultado.fechaCreacion?.toDate) {
        fechaObj = resultado.fechaCreacion.toDate();
    } else if (resultado.fechaCreacion?.seconds) {
        // Timestamp serializado desde sessionStorage
        fechaObj = new Date(resultado.fechaCreacion.seconds * 1000);
    } else if (resultado.fechaCreacion) {
        fechaObj = new Date(resultado.fechaCreacion);
    } else {
        fechaObj = new Date();
    }
    
    const fecha = fechaObj.toLocaleDateString('es-ES');
    const hora = fechaObj.toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'});
            
            const resultadoDiv = document.createElement('div');
            resultadoDiv.className = 'resultado-historial';
            resultadoDiv.innerHTML = `
    <div class="resultado-item" onclick="mostrarDetalleResultado('${id}')" style="cursor: pointer;">
       <div class="resultado-info">
    <h4>${obtenerTextoTemasSimple(resultado.test.tema)}</h4>
    <p class="nombre-test">${resultado.test.nombre}</p>
    <p class="fecha-resultado">${fecha} - ${hora}</p>
</div>
        <div class="resultado-detalles">
            <div class="estadisticas-mini">
                <span class="stat-item correctas">${resultado.correctas}</span>
<span class="stat-item incorrectas">${resultado.incorrectas}</span>
<span class="stat-item sin-responder">${resultado.sinResponder}</span>
<span class="stat-item total">${resultado.total}</span>
            </div>
        </div>
        <div class="resultado-stats">
    <span class="fraccion-principal ${resultado.correctas >= resultado.total/2 ? 'aprobado' : 'suspenso'}">${resultado.correctas}/${resultado.total}</span>
</div>
        <div class="resultado-acciones" onclick="event.stopPropagation()">
            <button class="btn-eliminar-resultado" onclick="eliminarResultado('${id}')" title="Eliminar resultado">
                🗑️
            </button>
        </div>
    </div>
`;
            listResultados.appendChild(resultadoDiv);
        });
        
    } catch (error) {
        console.error('Error cargando resultados:', error);
    } finally {
        cargandoResultados = false;
    }
}
// Eliminar resultado específico
window.eliminarResultado = async function(resultadoId) {
    if (confirm('¿Estás seguro de que quieres eliminar este resultado? Esta acción no se puede deshacer.')) {
        try {
            await deleteDoc(doc(db, "resultados", resultadoId));
            
            // Invalidar caché
            cacheResultados = null;
sessionStorage.removeItem('cacheResultados');
sessionStorage.removeItem('cacheResultadosTimestamp');
            
            // Recargar la lista de resultados
            cargarResultados();
            
        } catch (error) {
            console.error('Error eliminando resultado:', error);
            alert('Error al eliminar el resultado');
        }
    }
};
// Eliminar todos los resultados
window.eliminarTodosResultados = async function() {
    const confirmacion = prompt('Esta acción eliminará TODOS tus resultados permanentemente.\nEscribe "ELIMINAR TODO" para confirmar:');
    
    if (confirmacion === 'ELIMINAR TODO') {
        try {
            const q = query(collection(db, "resultados"), where("usuarioId", "==", currentUser.uid));
            const querySnapshot = await getDocs(q);
            
            const promises = [];
            querySnapshot.forEach((doc) => {
                promises.push(deleteDoc(doc.ref));
            });
            
            await Promise.all(promises);
            
            // Invalidar caché
            cacheResultados = null;
sessionStorage.removeItem('cacheResultados');
sessionStorage.removeItem('cacheResultadosTimestamp');
            
            alert('Todos los resultados han sido eliminados');
            cargarResultados();
            
        } catch (error) {
            console.error('Error eliminando todos los resultados:', error);
            alert('Error al eliminar los resultados');
        }
    } else if (confirmacion !== null) {
        alert('Confirmación incorrecta. No se eliminó nada.');
    }
};
// ==== FUNCIONALIDAD IMPORTAR/EXPORTAR ====

// FUNCIONALIDAD IMPORTAR ARCHIVO
async function manejarArchivoSeleccionado(event) {
    const archivo = event.target.files[0];
    if (!archivo) return;
    
    if (!archivo.name.endsWith('.json')) {
        alert('Por favor selecciona un archivo JSON válido');
        return;
    }
    
    try {
        const texto = await leerArchivo(archivo);
        const datos = JSON.parse(texto);
        
        if (validarFormatoJSON(datos)) {
            procesarArchivoImportado(datos);
        } else {
            alert('El archivo no tiene el formato correcto de preguntas');
        }
    } catch (error) {
        console.error('Error procesando archivo:', error);
        alert('Error al procesar el archivo. Verifica que sea un JSON válido');
    }
    
    event.target.value = '';
}

function leerArchivo(archivo) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(archivo);
    });
}

function validarFormatoJSON(datos) {
    return datos && 
           datos.questionsData && 
           Array.isArray(datos.questionsData) &&
           datos.questionsData.length > 0;
}

function procesarArchivoImportado(datos) {
    console.log('=== DATOS RECIBIDOS ===');
    console.log('Datos completos:', datos);
    console.log('questionsData[0]:', datos.questionsData[0]);
    
    const numPreguntas = datos.questionsData.length;
    const temaOriginal = datos.originalTopic?.name || 'Tema Importado';
    
    // Convertir formato con validación estricta
    const preguntasConvertidas = datos.questionsData.map((q, index) => {
        console.log(`=== PROCESANDO PREGUNTA ${index + 1} ===`);
        console.log('Pregunta completa:', q);
        console.log('question:', q.question);
        console.log('options:', q.options);
        console.log('correctAnswer:', q.correctAnswer);
        console.log('isVerified:', q.isVerified);
        
        // Validar campos obligatorios
        if (!q.question) {
            console.error(`Pregunta ${index + 1}: question es undefined`);
            return null;
        }
        
        if (!q.options || !Array.isArray(q.options) || q.options.length < 4) {
            console.error(`Pregunta ${index + 1}: options inválido`, q.options);
            return null;
        }
        
        if (q.correctAnswer === undefined || q.correctAnswer === null) {
            console.error(`Pregunta ${index + 1}: correctAnswer es undefined`);
            return null;
        }
        
        // Obtener índice de respuesta correcta
let indiceCorrecta = 0;
if (typeof q.correctAnswer === 'number') {
    indiceCorrecta = q.correctAnswer;
} else if (typeof q.correctAnswer === 'string') {
    if (['A', 'B', 'C', 'D'].includes(q.correctAnswer.toUpperCase())) {
        indiceCorrecta = ['A', 'B', 'C', 'D'].indexOf(q.correctAnswer.toUpperCase());
    } else {
        indiceCorrecta = parseInt(q.correctAnswer) || 0;
    }
}

console.log(`Índice correcto calculado: ${indiceCorrecta} para correctAnswer: ${q.correctAnswer}`);

const preguntaConvertida = {
    texto: String(q.question).trim(),
    opciones: q.options.slice(0, 4).map((opcion, opcionIndex) => ({
        letra: ['A', 'B', 'C', 'D'][opcionIndex],
        texto: String(opcion || '').trim(),
        esCorrecta: opcionIndex === indiceCorrecta
    })),
    respuestaCorrecta: ['A', 'B', 'C', 'D'][indiceCorrecta] || 'A',
    verificada: Boolean(q.isVerified),
    fechaCreacion: new Date()
};
        
        console.log('Pregunta convertida:', preguntaConvertida);
        return preguntaConvertida;
    }).filter(p => p !== null);
    
    console.log('=== RESULTADO FINAL ===');
    console.log(`Preguntas convertidas: ${preguntasConvertidas.length}/${numPreguntas}`);
    console.log('Primera pregunta convertida:', preguntasConvertidas[0]);
    
    if (preguntasConvertidas.length === 0) {
        alert('No se pudieron procesar las preguntas. Revisa la consola para más detalles.');
        return;
    }
    
    mostrarModalImportacion(preguntasConvertidas.length, temaOriginal, preguntasConvertidas);
}

async function mostrarModalImportacion(numPreguntas, temaOriginal, preguntasConvertidas) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    
    modal.innerHTML = `
        <div class="modal-content">
            <h3>📁 Importar Preguntas</h3>
            <p>Se encontraron <strong>${numPreguntas} preguntas</strong> del tema "<strong>${temaOriginal}</strong>"</p>
            <label for="temaDestinoSelect">Seleccionar tema destino:</label>
            <select id="temaDestinoSelect">
                <option value="">Selecciona un tema...</option>
            </select>
            <div class="modal-actions">
                <button id="confirmarImportacion" class="btn-primary">Asignar Preguntas</button>
                <button id="cancelarImportacion" class="btn-secondary">Cancelar</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Cargar temas disponibles
    try {
        const q = query(collection(db, "temas"), where("usuarioId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        
        const select = document.getElementById('temaDestinoSelect');

// Separar temas principales y subtemas
const temasPrincipales = [];
const subtemasPorPadre = {};

querySnapshot.forEach((doc) => {
    const tema = doc.data();
    if (tema.temaPadreId) {
        // Es un subtema
        if (!subtemasPorPadre[tema.temaPadreId]) {
            subtemasPorPadre[tema.temaPadreId] = [];
        }
        subtemasPorPadre[tema.temaPadreId].push({ id: doc.id, data: tema });
    } else {
        // Es un tema principal
        temasPrincipales.push({ 
            id: doc.id, 
            data: tema,
            orden: tema.orden || 0
        });
    }
});

// NUEVA SECCIÓN: Sumar preguntas de subtemas a los temas principales
temasPrincipales.forEach(tema => {
    if (subtemasPorPadre[tema.id]) {
        const preguntasSubtemas = subtemasPorPadre[tema.id].reduce((total, subtema) => {
            const preguntasSubtema = subtema.data.preguntas?.length || 0;
            return total + preguntasSubtema;
        }, 0);
        // Agregar las preguntas de subtemas al total del tema principal
        tema.data.preguntasTotal = (tema.data.preguntas?.length || 0) + preguntasSubtemas;
    } else {
        tema.data.preguntasTotal = tema.data.preguntas?.length || 0;
    }
});

// Ordenar temas con ordenamiento numérico inteligente (igual que banco)
temasPrincipales.sort((a, b) => {
    const nombreA = a.data.nombre;
    const nombreB = b.data.nombre;
    
    // Extraer números del nombre si existen
    const numeroA = nombreA.match(/\d+/);
    const numeroB = nombreB.match(/\d+/);
    
    if (numeroA && numeroB) {
        // Si ambos tienen números, ordenar por número
        return parseInt(numeroA[0]) - parseInt(numeroB[0]);
    } else {
        // Si no tienen números, orden alfabético normal
        return nombreA.localeCompare(nombreB);
    }
});
// Agregar temas principales al select
temasPrincipales.forEach(({ id, data: tema }) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = tema.nombre;
    select.appendChild(option);

    // Agregar subtemas si los tiene
    if (subtemasPorPadre[id]) {
        subtemasPorPadre[id].forEach(subtema => {
            const subOption = document.createElement('option');
            subOption.value = subtema.id;
            subOption.textContent = `  ↳ ${subtema.data.nombre}`;
            select.appendChild(subOption);
        });
    }
});
    } catch (error) {
        console.error('Error cargando temas:', error);
        alert('Error cargando temas');
        return;
    }
    
    // Event listeners del modal
    document.getElementById('confirmarImportacion').addEventListener('click', () => {
        importarPreguntasDirecto(preguntasConvertidas, modal);
    });
    
    document.getElementById('cancelarImportacion').addEventListener('click', () => {
        document.body.removeChild(modal);
        document.getElementById('fileInput').value = '';
    });
}

async function importarPreguntasDirecto(preguntasConvertidas, modal) {
    const temaId = document.getElementById('temaDestinoSelect').value;
    
    if (!temaId) {
        alert('Selecciona un tema destino');
        return;
    }
    
    try {
        console.log('Importando', preguntasConvertidas.length, 'preguntas al tema', temaId);
        
        const temaRef = doc(db, "temas", temaId);
        const temaDoc = await getDoc(temaRef);
        
        if (!temaDoc.exists()) {
            alert('El tema seleccionado no existe');
            return;
        }
        
        const temaData = temaDoc.data();
        const preguntasExistentes = temaData.preguntas || [];
        
        const todasLasPreguntas = [...preguntasExistentes, ...preguntasConvertidas];
        
        await updateDoc(temaRef, {
            preguntas: todasLasPreguntas,
            ultimaActualizacion: new Date()
        });
        
        alert(`${preguntasConvertidas.length} preguntas importadas exitosamente`);
        
        // Cerrar modal
        document.body.removeChild(modal);
        document.getElementById('fileInput').value = '';
        
        // Recargar banco si está activo
        if (document.getElementById('banco-section').classList.contains('active')) {
            cargarBancoPreguntas();
        }
        
    } catch (error) {
        console.error('Error detallado importando preguntas:', error);
        alert(`Error al importar las preguntas: ${error.message}`);
    }
}

// Exportar preguntas de un tema
window.exportarTema = async function(temaId) {
    try {
        const temaDoc = await getDoc(doc(db, "temas", temaId));
        if (!temaDoc.exists()) {
            alert('Tema no encontrado');
            return;
        }
        
        const tema = temaDoc.data();
        if (!tema.preguntas || tema.preguntas.length === 0) {
            alert('Este tema no tiene preguntas para exportar');
            return;
        }
        
        // Crear objeto JSON en el formato requerido
        const exportData = {
            version: "questions_export_1.0",
            exportDate: new Date().toISOString(),
            exportTimestamp: Date.now(),
            exportType: "questions_by_topic",
            originalUser: currentUser.displayName || currentUser.email,
            originalTopic: {
                id: Date.now(),
                name: tema.nombre
            },
            questionsData: tema.preguntas.map((pregunta, index) => ({
                id: Date.now() + Math.random(),
                question: pregunta.texto,
                options: pregunta.opciones.map(op => op.texto),
                correctAnswer: pregunta.opciones.findIndex(op => op.esCorrecta),
                explanation: "",
                isVerified: pregunta.verificada || false,
                originalTopicId: Date.now(),
                createdAt: new Date().toISOString()
            })),
            stats: {
                totalQuestions: tema.preguntas.length,
                verifiedQuestions: tema.preguntas.filter(p => p.verificada).length,
                originalTopicName: tema.nombre
            }
        };
        
        // Descargar archivo
        descargarJSON(exportData, `preguntas_${tema.nombre}_${new Date().toISOString().split('T')[0]}.json`);
        
    } catch (error) {
        console.error('Error exportando tema:', error);
        alert('Error al exportar el tema');
    }
};

// Descargar archivo JSON
function descargarJSON(data, filename) {
    const dataStr = JSON.stringify(data, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = filename;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
}

// Funciones auxiliares mejoradas
function mezclarArray(array) {
    const shuffled = [...array];
    
    // Algoritmo Fisher-Yates mejorado para mejor aleatoriedad
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    // Segunda pasada para asegurar máxima aleatoriedad
    for (let i = 0; i < shuffled.length; i++) {
        const j = Math.floor(Math.random() * shuffled.length);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    return shuffled;
}

// Función para obtener preguntas con distribución proporcional entre temas
function obtenerPreguntasUnicasAleatorias(preguntas, cantidad) {
    console.log('=== DISTRIBUCIÓN PARITARIA DEBUG ===');
    console.log(`Total preguntas recibidas: ${preguntas.length}`);
    console.log(`Cantidad solicitada: ${cantidad}`);
    
    // AÑADIR ESTE DEBUG
    console.log('DETALLE DE PREGUNTAS RECIBIDAS:');
    preguntas.forEach((p, index) => {
        console.log(`${index + 1}. ${p.temaNombre || p.temaId} - Verificada: ${p.verificada} - "${p.texto.substring(0, 50)}..."`);
    });
    
    // Crear un Map para asegurar unicidad por texto de pregunta
    const preguntasUnicas = new Map();
    
    preguntas.forEach(pregunta => {
        const clave = pregunta.texto.toLowerCase().trim();
        if (!preguntasUnicas.has(clave)) {
            preguntasUnicas.set(clave, pregunta);
        } else {
            console.log(`DUPLICADO DETECTADO: ${pregunta.texto.substring(0, 50)}...`);
        }
    });
    
    const arrayUnico = Array.from(preguntasUnicas.values());
    console.log(`Preguntas únicas después de filtrar: ${arrayUnico.length}`);
    
    // Agrupar por tema
    const preguntasPorTema = {};
    arrayUnico.forEach(pregunta => {
        const tema = pregunta.temaNombre || pregunta.temaId || 'Desconocido';
        if (!preguntasPorTema[tema]) {
            preguntasPorTema[tema] = [];
        }
        preguntasPorTema[tema].push(pregunta);
    });
    
    const temas = Object.keys(preguntasPorTema);
    console.log(`Temas encontrados: ${temas.join(', ')}`);
    
    temas.forEach(tema => {
        console.log(`${tema}: ${preguntasPorTema[tema].length} preguntas`);
    });
    
    // Si se piden todas las preguntas o hay menos disponibles, devolver todas mezcladas
    if (cantidad >= arrayUnico.length) {
        console.log('Devolviendo todas las preguntas mezcladas');
        return mezclarArray(arrayUnico);
    }
    
    if (temas.length === 1) {
        console.log('Solo un tema, selección aleatoria normal');
        return mezclarArray(arrayUnico).slice(0, cantidad);
    }
    
    // RESTO DE LA FUNCIÓN IGUAL...
    const preguntasPorTemaObjetivo = Math.floor(cantidad / temas.length);
    const preguntasExtra = cantidad % temas.length;
    
    console.log(`Preguntas por tema: ${preguntasPorTemaObjetivo}`);
    console.log(`Preguntas extra: ${preguntasExtra}`);
    
    const preguntasFinales = [];
    
    temas.forEach((tema, index) => {
        let preguntasATomar = preguntasPorTemaObjetivo;
        if (index < preguntasExtra) {
            preguntasATomar += 1;
        }
        
        const preguntasDelTema = preguntasPorTema[tema];
        const preguntasTomadas = Math.min(preguntasATomar, preguntasDelTema.length);
        
        const preguntasMezcladas = mezclarArray([...preguntasDelTema]);
        preguntasFinales.push(...preguntasMezcladas.slice(0, preguntasTomadas));
        
        console.log(`${tema}: ${preguntasTomadas} preguntas seleccionadas`);
    });
    
    if (preguntasFinales.length < cantidad) {
        const preguntasUsadas = new Set(preguntasFinales.map(p => p.texto));
        const preguntasRestantes = arrayUnico.filter(p => !preguntasUsadas.has(p.texto));
        const faltantes = cantidad - preguntasFinales.length;
        
        preguntasFinales.push(...mezclarArray(preguntasRestantes).slice(0, faltantes));
        console.log(`Agregadas ${faltantes} preguntas adicionales`);
    }
    
    console.log(`Total final: ${preguntasFinales.length} preguntas`);
    return mezclarArray(preguntasFinales);
}
// ==== FUNCIONALIDAD TEST DE REPASO ====

// Cargar y mostrar Test de Repaso disponible
async function cargarTestRepaso() {
    try {
        const q = query(
            collection(db, "preguntasFalladas"), 
            where("usuarioId", "==", currentUser.uid)
        );
        const querySnapshot = await getDocs(q);
        
        const containerRepaso = document.getElementById('testRepasoContainer');
        if (!containerRepaso) return;

        if (querySnapshot.empty) {
            containerRepaso.style.display = 'none';
            return;
        }

        const totalPreguntasFalladas = querySnapshot.size;
        containerRepaso.style.display = 'block';
        
        // Actualizar el contador en la interfaz
        const contadorElement = containerRepaso.querySelector('.repaso-contador');
        if (contadorElement) {
            contadorElement.textContent = `${totalPreguntasFalladas} preguntas`;
        }
        
        // Actualizar el botón
        const botonRepaso = containerRepaso.querySelector('.btn-test-repaso');
        if (botonRepaso) {
            botonRepaso.textContent = `🔄 Test de Repaso (${totalPreguntasFalladas} preguntas)`;
        }

    } catch (error) {
        console.error('Error cargando test de repaso:', error);
    }
}

// Iniciar Test de Repaso
window.iniciarTestRepaso = async function() {
    try {
        // Cargar preguntas falladas
        const q = query(
            collection(db, "preguntasFalladas"), 
            where("usuarioId", "==", currentUser.uid)
        );
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            alert('No hay preguntas falladas disponibles para repasar');
            return;
        }

        // Convertir a formato de preguntas
        const preguntasRepaso = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            preguntasRepaso.push({
                ...data.pregunta,
                documentId: doc.id // Para poder eliminarla después si es correcta
            });
        });

        // Obtener preguntas únicas y aleatorias para el repaso
        const preguntasMezcladas = obtenerPreguntasUnicasAleatorias(preguntasRepaso, preguntasRepaso.length);

        // Crear objeto test
        testActual = {
            id: generarIdTest(),
            nombre: `Test de Repaso - ${new Date().toLocaleDateString()}`,
            tema: 'repaso',
            preguntas: preguntasMezcladas,
            tiempoLimite: 'sin',
            fechaInicio: new Date(),
            esRepaso: true
        };

        // Inicializar respuestas
        respuestasUsuario = {};

        // Iniciar test
        mostrarInterfazTest();

    } catch (error) {
        console.error('Error iniciando test de repaso:', error);
        alert('Error al cargar el test de repaso');
    }
};

// Limpiar todas las preguntas falladas
window.limpiarTodasPreguntasFalladas = async function() {
    if (!confirm('¿Estás seguro de que quieres eliminar todas las preguntas falladas? Esta acción no se puede deshacer.')) {
        return;
    }

    try {
        const q = query(
            collection(db, "preguntasFalladas"), 
            where("usuarioId", "==", currentUser.uid)
        );
        const querySnapshot = await getDocs(q);
        
        const promesasEliminacion = [];
        querySnapshot.forEach((doc) => {
            promesasEliminacion.push(deleteDoc(doc.ref));
        });

        await Promise.all(promesasEliminacion);
        alert('Todas las preguntas falladas han sido eliminadas');
        
        // Actualizar interfaz
        await cargarTestRepaso();

    } catch (error) {
        console.error('Error eliminando todas las preguntas falladas:', error);
        alert('Error al eliminar las preguntas falladas');
    }
};
// Funciones globales para el dropdown
window.toggleDropdownTemas = function() {
    const content = document.getElementById('dropdownTemasContent');
    const arrow = document.querySelector('.dropdown-arrow');
    
    if (content.style.display === 'block') {
        content.style.display = 'none';
        arrow.textContent = '▼';
    } else {
        content.style.display = 'block';
        arrow.textContent = '▲';
    }
};

window.toggleSubtemas = function(temaId) {
    const container = document.getElementById(`subtemas-${temaId}`);
    const arrow = document.getElementById(`arrow-${temaId}`);
    
    if (container.style.display === 'none') {
        container.style.display = 'block';
        arrow.textContent = '▼';
    } else {
        container.style.display = 'none';
        arrow.textContent = '▶';
    }
};


// Cerrar dropdown al hacer click fuera
document.addEventListener('click', function(event) {
    const dropdown = document.querySelector('.dropdown-temas');
    const content = document.getElementById('dropdownTemasContent');
    
    if (dropdown && !dropdown.contains(event.target) && content && content.style.display === 'block') {
        content.style.display = 'none';
        document.querySelector('.dropdown-arrow').textContent = '▼';
    }
});
window.debugClick = function(checkbox) {
    console.log('=== CLICK EN CHECKBOX ===');
    console.log('Checkbox clicado:', checkbox);
    console.log('Value:', checkbox.value);
    console.log('Checked antes:', checkbox.checked);
    console.log('========================');
};

// =================================
// FUNCIONES DROPDOWN - VERSIÓN FINAL
// =================================

window.toggleDropdownTemas = function() {
    const content = document.getElementById('dropdownTemasContent');
    const arrow = document.querySelector('.dropdown-arrow');
    
    if (!content || !arrow) return;
    
    if (content.style.display === 'block') {
        content.style.display = 'none';
        arrow.textContent = '▼';
    } else {
        content.style.display = 'block';
        arrow.textContent = '▲';
    }
};

window.toggleSubtemas = function(temaId) {
    const container = document.getElementById(`subtemas-${temaId}`);
    const arrow = document.getElementById(`arrow-${temaId}`);
    
    if (!container || !arrow) return;
    
    if (container.style.display === 'none') {
        container.style.display = 'block';
        arrow.textContent = '▼';
    } else {
        container.style.display = 'none';
        arrow.textContent = '▶';
    }
};

window.manejarSeleccionTema = function(event) {
    console.log('=== DEBUG MANEJO SELECCIÓN TEMA ===');
    
    const todosLosTemas = document.getElementById('todosLosTemas');
    const temasCheckboxes = document.querySelectorAll('.tema-checkbox:not(#todosLosTemas)');
    const placeholder = document.querySelector('.dropdown-placeholder');
    
    if (!todosLosTemas || !placeholder) {
        console.log('❌ Elementos no encontrados');
        return;
    }
    
    const checkboxClickeado = event.target;
    console.log('Checkbox clickeado:', checkboxClickeado.value, 'Checked:', checkboxClickeado.checked);
    
    // Si se clickeó "Todos los temas"
    if (checkboxClickeado === todosLosTemas) {
        console.log('✅ Click en "Todos los temas"');
        if (todosLosTemas.checked) {
            temasCheckboxes.forEach(checkbox => {
                checkbox.checked = false;
            });
            placeholder.textContent = 'Todos los temas seleccionados';
        }
    } else {
        // Se clickeó un tema específico
        console.log('✅ Click en tema específico');
        
        // Si se marca un tema específico, desmarcar "Todos los temas"
        if (checkboxClickeado.checked) {
            console.log('Desmarcando "Todos los temas"');
            todosLosTemas.checked = false;
        }
        
        // NUEVA FUNCIONALIDAD: Auto-seleccionar subtemas cuando se selecciona tema principal
        const temaId = checkboxClickeado.value;
        const subtemas = document.querySelectorAll(`input[data-tema-padre="${temaId}"]`);
        
        if (subtemas.length > 0) {
            console.log(`Encontrados ${subtemas.length} subtemas para tema ${temaId}`);
            subtemas.forEach(subtema => {
                subtema.checked = checkboxClickeado.checked;
                console.log(`Subtema ${subtema.value} ${checkboxClickeado.checked ? 'seleccionado' : 'deseleccionado'}`);
            });
        }
        
        // Contar temas seleccionados después del cambio
        const temasSeleccionados = Array.from(temasCheckboxes).filter(cb => cb.checked);
        console.log('Temas seleccionados después del click:', temasSeleccionados.length);
        
        if (temasSeleccionados.length === 0) {
            console.log('No hay temas seleccionados - marcando "Todos"');
            todosLosTemas.checked = true;
            placeholder.textContent = 'Todos los temas seleccionados';
        } else {
            placeholder.textContent = `${temasSeleccionados.length} tema(s) seleccionado(s)`;
        }
    }
    
    console.log('=================================');
    actualizarPreguntasDisponibles();
};

// Cerrar dropdown al hacer click fuera
document.addEventListener('click', function(event) {
    const dropdown = document.querySelector('.dropdown-temas');
    const content = document.getElementById('dropdownTemasContent');
    
    if (dropdown && !dropdown.contains(event.target) && content && content.style.display === 'block') {
        content.style.display = 'none';
        const arrow = document.querySelector('.dropdown-arrow');
        if (arrow) arrow.textContent = '▼';
    }
});
function obtenerTextoTemas(tema, temasMap) {
    if (tema === 'todos') {
        return 'Todos los temas';
    } else if (tema === 'repaso') {
        return 'Test de repaso';
    } else if (Array.isArray(tema)) {
        const nombresTemasSeleccionados = tema
            .filter(temaId => temasMap.has(temaId))
            .map(temaId => temasMap.get(temaId));
        
        if (nombresTemasSeleccionados.length === 0) {
            return 'Temas eliminados';
        }
        
        return nombresTemasSeleccionados.join(', ');
    } else if (typeof tema === 'string') {
        return temasMap.get(tema) || 'Tema eliminado';
    } else {
        return 'Tema específico';
    }
}
// Verificar si un tema es válido (no eliminado)
function esTemaValido(tema, temasMap) {
    if (tema === 'todos' || tema === 'repaso') {
        return true;
    } else if (Array.isArray(tema)) {
        return tema.some(temaId => temasMap.has(temaId));
    } else if (typeof tema === 'string') {
        return temasMap.has(tema);
    }
    return false;
}


// Función para importar preguntas directamente a un tema específico
window.importarATema = function(temaId) {
    // Crear input file temporal
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';
    
    fileInput.addEventListener('change', async function(event) {
        const archivo = event.target.files[0];
        if (!archivo) return;
        
        if (!archivo.name.endsWith('.json')) {
            alert('Por favor selecciona un archivo JSON válido');
            return;
        }
        
        try {
            const texto = await leerArchivo(archivo);
            const datos = JSON.parse(texto);
            
            if (validarFormatoJSON(datos)) {
                // Procesar preguntas
                const preguntasConvertidas = procesarPreguntasImportadas(datos);
                
                if (preguntasConvertidas.length === 0) {
                    alert('No se pudieron procesar las preguntas del archivo');
                    return;
                }
                
                // Importar directamente al tema seleccionado
                await importarPreguntasDirectoATema(preguntasConvertidas, temaId);
                
            } else {
                alert('El archivo no tiene el formato correcto de preguntas');
            }
        } catch (error) {
            console.error('Error procesando archivo:', error);
            alert('Error al procesar el archivo. Verifica que sea un JSON válido');
        }
        
        // Limpiar
        document.body.removeChild(fileInput);
    });
    
    // Agregar al DOM y hacer click
    document.body.appendChild(fileInput);
    fileInput.click();
};

// Función auxiliar para procesar preguntas importadas
function procesarPreguntasImportadas(datos) {
    const preguntasConvertidas = datos.questionsData.map((q, index) => {
        // Validar campos obligatorios
        if (!q.question || !q.options || !Array.isArray(q.options) || q.options.length < 4) {
            return null;
        }
        
        // Obtener índice de respuesta correcta
        let indiceCorrecta = 0;
        if (typeof q.correctAnswer === 'number') {
            indiceCorrecta = q.correctAnswer;
        } else if (typeof q.correctAnswer === 'string') {
            if (['A', 'B', 'C', 'D'].includes(q.correctAnswer.toUpperCase())) {
                indiceCorrecta = ['A', 'B', 'C', 'D'].indexOf(q.correctAnswer.toUpperCase());
            } else {
                indiceCorrecta = parseInt(q.correctAnswer) || 0;
            }
        }

        return {
            texto: String(q.question).trim(),
            opciones: q.options.slice(0, 4).map((opcion, opcionIndex) => ({
                letra: ['A', 'B', 'C', 'D'][opcionIndex],
                texto: String(opcion || '').trim(),
                esCorrecta: opcionIndex === indiceCorrecta
            })),
            respuestaCorrecta: ['A', 'B', 'C', 'D'][indiceCorrecta] || 'A',
            verificada: Boolean(q.isVerified),
            fechaCreacion: new Date()
        };
    }).filter(p => p !== null);
    
    return preguntasConvertidas;
}

// Función para importar preguntas directamente a un tema específico
async function importarPreguntasDirectoATema(preguntasConvertidas, temaId) {
    try {
        // Obtener nombre del tema
        const temaDoc = await getDoc(doc(db, "temas", temaId));
        if (!temaDoc.exists()) {
            alert('El tema seleccionado no existe');
            return;
        }
        
        const temaData = temaDoc.data();
        const nombreTema = temaData.nombre;
        
        // Confirmar importación
        if (!confirm(`¿Importar ${preguntasConvertidas.length} preguntas al tema "${nombreTema}"?`)) {
            return;
        }
        
        const preguntasExistentes = temaData.preguntas || [];
        const todasLasPreguntas = [...preguntasExistentes, ...preguntasConvertidas];
        
        await updateDoc(doc(db, "temas", temaId), {
            preguntas: todasLasPreguntas,
            ultimaActualizacion: new Date()
        });
        
        alert(`${preguntasConvertidas.length} preguntas importadas exitosamente al tema "${nombreTema}"`);
        
        // Invalidar caché antes de recargar
        cacheTemas = null;
        cacheTimestamp = null;
        sessionStorage.removeItem('cacheTemas');
        sessionStorage.removeItem('cacheTemasTimestamp');
        
        // Recargar banco si está activo
        if (document.getElementById('banco-section').classList.contains('active')) {
            cargarBancoPreguntas();
        }
        
    } catch (error) {
        console.error('Error importando preguntas al tema:', error);
        alert(`Error al importar las preguntas: ${error.message}`);
    }
}
// Limpiar completamente la interfaz de test
function limpiarInterfazTestCompleta() {
    // Limpiar variables globales
    testActual = null;
    respuestasUsuario = {};
    
    if (cronometroInterval) {
        clearInterval(cronometroInterval);
    }
    
    // Mostrar configuración y ocultar otras pantallas
    const configContainer = document.querySelector('.test-config-container');
    const testEjecucion = document.getElementById('testEnEjecucion');
    const resultadosTest = document.getElementById('resultadosTest');
    
    if (configContainer) {
        configContainer.style.display = 'block';
    }
    if (testEjecucion) {
        testEjecucion.style.display = 'none';
    }
    if (resultadosTest) {
        resultadosTest.style.display = 'none';
    }
    
    // Limpiar formulario
    const nombreTest = document.getElementById('nombreTest');
    const tiempoRestante = document.getElementById('tiempoRestante');
    
    if (nombreTest) {
        nombreTest.value = '';
    }
    if (tiempoRestante) {
        tiempoRestante.style.color = '#dc3545';
    }
}
// Función para registrar test directamente si Progreso.js no está cargado
// Función mejorada para registrar test directamente con mejor manejo de datos
// Nueva función para registrar en progresoSimple (sistema de progreso diario)
// Función para normalizar nombres de temas
function normalizarNombreTema(nombre) {
    return nombre
        .toLowerCase()
        .trim()
        .replace(/tema\s*/i, 'tema ')
        .replace(/\s+/g, ' ')
        .replace(/\buno\b/i, '1')
        .replace(/\bdos\b/i, '2')
        .replace(/\btres\b/i, '3')
        .replace(/\bcuatro\b/i, '4')
        .replace(/\bcinco\b/i, '5')
        .replace(/\bseis\b/i, '6')
        .replace(/\bsiete\b/i, '7')
        .replace(/\bocho\b/i, '8')
        .replace(/\bnueve\b/i, '9')
        .replace(/\bdiez\b/i, '10');
}

// Función para buscar tema del planning por nombre
async function buscarTemaEnPlanningPorNombre(nombreBanco) {
    try {
        // Cargar planning
        const planningDoc = await getDoc(doc(db, "planningSimple", currentUser.uid));
        if (!planningDoc.exists()) return null;
        
        const planningData = planningDoc.data();
        if (!planningData.temas || planningData.temas.length === 0) return null;
        
        const nombreNormalizado = normalizarNombreTema(nombreBanco);
        
        // Buscar coincidencia exacta normalizada
        const temaEncontrado = planningData.temas.find(tema => {
            const nombrePlanningNormalizado = normalizarNombreTema(tema.nombre);
            return nombrePlanningNormalizado === nombreNormalizado;
        });
        
        return temaEncontrado;
    } catch (error) {
        console.error('Error buscando tema en planning:', error);
        return null;
    }
}

async function registrarTestEnProgresoSimple(temasUtilizados) {
    try {
        console.log('=== REGISTRANDO TEST EN PROGRESO SIMPLE ===');
        console.log('Temas recibidos:', temasUtilizados);
        
        const temasUnicos = [...new Set(temasUtilizados)];
        
        // NUEVA LÓGICA: Obtener nombres de temas del banco y buscar coincidencias en planning
        const infoTemasCompleta = await Promise.all(
            temasUnicos.map(async (temaIdBanco) => {
                const temaDoc = await getDoc(doc(db, "temas", temaIdBanco));
                if (!temaDoc.exists()) return null;
                
                const temaData = temaDoc.data();
                const nombreBanco = temaData.nombre;
                
                // Buscar tema equivalente en planning
                const temaPlanning = await buscarTemaEnPlanningPorNombre(nombreBanco);
                
                return {
                    idBanco: temaIdBanco,
                    nombreBanco: nombreBanco,
                    padre: temaData.temaPadreId || null,
                    temaPlanning: temaPlanning // { id, nombre, hojas } o null
                };
            })
        );
        
        const infoTemas = infoTemasCompleta.filter(t => t !== null);
        
        console.log('Info temas con vinculación planning:', infoTemas);
        
        // NUEVA LÓGICA: Detectar si todos son subtemas del mismo padre
const padres = infoTemas.map(t => t.padre).filter(p => p !== null);
const todosDelMismoPadre = padres.length === infoTemas.length && 
                            padres.length > 0 &&
                            padres.every(p => p === padres[0]);
const temaPadre = todosDelMismoPadre ? padres[0] : null;
        
        // Obtener progresoSimple
        const progresoRef = doc(db, "progresoSimple", currentUser.uid);
        let progresoDoc = await getDoc(progresoRef);
        
        if (!progresoDoc.exists()) {
            console.log('No existe progresoSimple');
            return;
        }
        
        let progresoData = progresoDoc.data();
        if (!progresoData.temas) progresoData.temas = {};
        if (!progresoData.registros) progresoData.registros = [];
        
        const esMix = infoTemas.length > 1 && !todosDelMismoPadre;
        const fechaHoy = new Date();
        
        if (esMix) {
            // Test Mix
            progresoData.registros.push({
                fecha: fechaHoy,
                temaId: 'mix',
                hojasLeidas: 0,
                testsRealizados: 1,
                temasMix: temasUnicos
            });
        } else {
            // Test de un solo tema
            let temaInfo = infoTemas[0];
            
            // Si hay padre compartido, buscar info del padre
            if (todosDelMismoPadre && temaPadre) {
                const padreDoc = await getDoc(doc(db, "temas", temaPadre));
                if (padreDoc.exists()) {
                    const nombrePadre = padreDoc.data().nombre;
                    const temaPlanningPadre = await buscarTemaEnPlanningPorNombre(nombrePadre);
                    
                    temaInfo = {
                        idBanco: temaPadre,
                        nombreBanco: nombrePadre,
                        temaPlanning: temaPlanningPadre
                    };
                }
            }
            
            // Determinar ID a usar: planning si existe, sino banco
            let temaIdFinal;
            let nombreFinal;
            let hojasTotales = 0;
            
            if (temaInfo.temaPlanning) {
                // Usar ID del planning
                temaIdFinal = temaInfo.temaPlanning.id;
                nombreFinal = temaInfo.temaPlanning.nombre;
                hojasTotales = temaInfo.temaPlanning.hojas || 0;
                console.log('✅ Vinculado con planning:', nombreFinal);
            } else {
                // Usar ID del banco (tema no está en planning)
                temaIdFinal = temaInfo.idBanco;
                nombreFinal = temaInfo.nombreBanco;
                console.log('⚠️ Tema no encontrado en planning, usando ID banco');
            }
            
            // Crear tema en progreso si no existe
            if (!progresoData.temas[temaIdFinal]) {
                progresoData.temas[temaIdFinal] = {
                    nombre: nombreFinal,
                    hojasTotales: hojasTotales,
                    hojasLeidas: 0,
                    testsRealizados: 0
                };
            }
            
            // Incrementar contador
            progresoData.temas[temaIdFinal].testsRealizados = 
                (progresoData.temas[temaIdFinal].testsRealizados || 0) + 1;
            
            // Añadir registro
            progresoData.registros.push({
                fecha: fechaHoy,
                temaId: temaIdFinal,
                hojasLeidas: 0,
                testsRealizados: 1
            });
        }
        
        await setDoc(progresoRef, progresoData);
        console.log('✅ Test registrado en progresoSimple');
        
    } catch (error) {
        console.error('❌ Error registrando test:', error);
    }
}

async function registrarTestDirectamenteEnTests(temasUtilizados) {
    try {
        console.log('=== REGISTRANDO TEST DIRECTAMENTE ===');
        console.log('Temas a registrar:', temasUtilizados);
        
        // Obtener o crear documento de progreso
        const progresoRef = doc(db, "progreso", currentUser.uid);
        let progresoDoc = await getDoc(progresoRef);
        let progresoData = {};
        
        if (progresoDoc.exists()) {
            progresoData = progresoDoc.data();
            console.log('Documento de progreso existente encontrado');
        } else {
            console.log('Creando nuevo documento de progreso');
            progresoData = {
                usuarioId: currentUser.uid,
                temas: {},
                fechaCreacion: new Date(),
                ultimaActualizacion: new Date()
            };
        }
        
        // Asegurar que existe la estructura de temas
        if (!progresoData.temas) {
            progresoData.temas = {};
        }
        
        let temasActualizados = 0;
        
        // Registrar test para cada tema utilizado
        for (const temaId of temasUtilizados) {
            console.log(`Procesando tema: ${temaId}`);
            
            // Inicializar tema si no existe
            if (!progresoData.temas[temaId]) {
                progresoData.temas[temaId] = {
                    sesionesEstudio: 0,
                    testsAutomaticos: 0,
                    preguntasMemorizadas: 0,
                    fechaCreacion: new Date(),
                    ultimaActualizacion: new Date()
                };
                console.log(`Tema ${temaId} inicializado`);
            }
            
            // Incrementar contador de tests automáticos
progresoData.temas[temaId].testsAutomaticos = (progresoData.temas[temaId].testsAutomaticos || 0) + 1;

progresoData.temas[temaId].ultimaActualizacion = new Date();
            
            console.log(`Test registrado para tema ${temaId}: ${progresoData.temas[temaId].testsAutomaticos} tests`);
            temasActualizados++;
        }
        
        if (temasActualizados > 0) {
            // Actualizar fecha de última actualización general
            progresoData.ultimaActualizacion = new Date();
            
            // Guardar en Firebase usando setDoc para asegurar que se guarde
            await setDoc(progresoRef, progresoData);
            
            console.log(`✅ Test registrado exitosamente en ${temasActualizados} temas`);
            console.log('Datos guardados:', progresoData.temas);
        } else {
            console.log('❌ No se actualizaron temas');
        }
        
        console.log('=====================================');
        
    } catch (error) {
        console.error('❌ Error registrando test directamente:', error);
        console.error('Stack trace:', error.stack);
    }
}
// CORRECCIÓN DEFINITIVA DE EVENT LISTENERS
// REEMPLAZA COMPLETAMENTE la función forzarEventListeners
function forzarEventListeners() {
    console.log('=== FORZAR EVENT LISTENERS ===');
    
    // ESPERAR MÁS TIEMPO para que TODO esté cargado
    setTimeout(() => {
        // 1. BOTÓN EMPEZAR TEST (este debe existir siempre)
        const btnEmpezar = document.getElementById('empezarTestBtn');
        if (btnEmpezar) {
            btnEmpezar.removeEventListener('click', empezarTest);
            btnEmpezar.addEventListener('click', empezarTest);
            console.log('✅ Botón empezar test configurado');
        } else {
            console.log('❌ No se encontró empezarTestBtn');
        }

        // 2. BOTONES DE CANTIDAD (estos se crean dinámicamente)
        const botonesCantidad = document.querySelectorAll('.btn-cantidad');
        console.log(`Botones cantidad encontrados: ${botonesCantidad.length}`);
        botonesCantidad.forEach(btn => {
            btn.removeEventListener('click', manejarClickCantidad);
            btn.addEventListener('click', manejarClickCantidad);
        });

        // 3. BOTONES DE TIEMPO (estos se crean dinámicamente)  
        const botonesTiempo = document.querySelectorAll('.btn-tiempo');
        console.log(`Botones tiempo encontrados: ${botonesTiempo.length}`);
        botonesTiempo.forEach(btn => {
            btn.removeEventListener('click', manejarClickTiempo);
            btn.addEventListener('click', manejarClickTiempo);
        });

        // 4. VERIFICAR INPUTS OCULTOS
        const inputCantidad = document.getElementById('preguntasSeleccionadas');
        const inputTiempo = document.getElementById('tiempoSeleccionado');
        console.log('Input cantidad existe:', !!inputCantidad);
        console.log('Input tiempo existe:', !!inputTiempo);

        // 5. VERIFICAR DROPDOWN
        const dropdown = document.querySelector('.dropdown-temas');
        console.log('Dropdown existe:', !!dropdown);

        console.log('=== FIN FORZAR EVENT LISTENERS ===');
    }, 2000); // Aumentar a 2 segundos
}
// Llamar la función cuando se cambie a la sección aleatorio
// Variables para recordar estado de subtemas
let subtemasOcultos = new Set();

// Función para mostrar/ocultar subtemas
window.toggleSubtemasVisibilidad = function(temaId) {
    const wrapper = document.getElementById(`subtemas-wrapper-${temaId}`);
    const icon = document.getElementById(`toggle-icon-${temaId}`);
    
    if (!wrapper || !icon) return;
    
    if (wrapper.style.display === 'none') {
        // Mostrar subtemas
        wrapper.style.display = 'block';
        icon.textContent = '📂';
    } else {
        // Ocultar subtemas
        wrapper.style.display = 'none';
        icon.textContent = '📁';
    }
};
// Manejar toggle de subtemas desplegables
window.manejarToggleSubtemas = function(event, temaId) {
    // Similar a manejarToggleTema pero para subtemas
    if (event.target.open) {
        temasAbiertos.add(`subtemas-${temaId}`);
    } else {
        temasAbiertos.delete(`subtemas-${temaId}`);
    }
};
// Mostrar detalle completo de un resultado
window.mostrarDetalleResultado = async function(resultadoId) {
    try {
        const resultadoDoc = await getDoc(doc(db, "resultados", resultadoId));
        if (!resultadoDoc.exists()) {
            alert('Resultado no encontrado');
            return;
        }
        
        const resultado = resultadoDoc.data();
        
        // Crear modal para mostrar detalle
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';
        
        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';
        modalContent.style.maxWidth = '90vw';
        modalContent.style.width = '800px';
        modalContent.style.maxHeight = '85vh';
        modalContent.style.overflow = 'auto';
        
        // Generar HTML del detalle (reutilizar la función de mostrar resultados)
        modalContent.innerHTML = generarHTMLResultadosDetalle(resultado);
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        // Cerrar modal al hacer clic fuera
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
        
    } catch (error) {
        console.error('Error cargando detalle del resultado:', error);
        alert('Error al cargar el detalle del resultado');
    }
};

// Función para generar HTML de resultados detallado
function generarHTMLResultadosDetalle(resultado) {
    const { correctas, incorrectas, sinResponder, total, detalleRespuestas } = resultado;
    const porcentaje = total > 0 ? Math.round((correctas / total) * 100) : 0;
    const tiempoEmpleado = resultado.tiempoEmpleado || 0;
    
    // Determinar mensaje según porcentaje
    let mensaje = '';
    let icono = '';
    if (porcentaje >= 90) {
        mensaje = 'Excelente trabajo!';
        icono = '🏆';
    } else if (porcentaje >= 75) {
        mensaje = 'Muy bien!';
        icono = '⭐';
    } else if (porcentaje >= 60) {
        mensaje = 'Buen trabajo';
        icono = '📈';
    } else {
        mensaje = 'Sigue practicando!';
        icono = '📚';
    }

    const tiempoFormateado = formatearTiempo(tiempoEmpleado);
    const fechaTest = resultado.test.fechaInicio ? 
        new Date(resultado.test.fechaInicio.seconds * 1000).toLocaleDateString('es-ES') : 
        'Fecha desconocida';

    let html = '<div class="resultado-header">';
    
    // Botón cerrar en la esquina superior derecha
    html += '<button onclick="cerrarModalDetalle()" style="position: absolute; top: 10px; right: 15px; background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">×</button>';
    
    html += '<div class="resultado-icono">' + icono + '</div>';
    
    // Determinar color según aciertos
    let colorPuntuacion = '';
    if (correctas > total / 2) {
        colorPuntuacion = '#28a745'; // Verde
    } else if (correctas === total / 2) {
        colorPuntuacion = '#ffc107'; // Amarillo
    } else {
        colorPuntuacion = '#dc3545'; // Rojo
    }

    html += '<div class="resultado-porcentaje" style="color: ' + colorPuntuacion + '">' + correctas + '/' + total + '</div>';
    html += '<div class="resultado-mensaje">' + mensaje + '</div>';
    html += '<div class="resultado-detalles">';
    html += (resultado.test.nombre || 'Test sin nombre') + ' - ' + fechaTest;
    html += '<br>Tiempo empleado: ' + tiempoFormateado;
    html += '</div>';
    html += '</div>';

    html += '<div class="estadisticas-grid">';
    html += '<div class="estadistica-card correctas">';
    html += '<div class="estadistica-icono">✅</div>';
    html += '<div class="estadistica-numero">' + correctas + '</div>';
    html += '<div class="estadistica-label">Correctas</div>';
    html += '</div>';
    html += '<div class="estadistica-card incorrectas">';
    html += '<div class="estadistica-icono">❌</div>';
    html += '<div class="estadistica-numero">' + incorrectas + '</div>';
    html += '<div class="estadistica-label">Incorrectas</div>';
    html += '</div>';
    html += '<div class="estadistica-card sin-responder">';
    html += '<div class="estadistica-icono">⭕</div>';
    html += '<div class="estadistica-numero">' + sinResponder + '</div>';
    html += '<div class="estadistica-label">Sin responder</div>';
    html += '</div>';
    html += '</div>';

    // Mostrar preguntas y respuestas detalladas
    if (detalleRespuestas && detalleRespuestas.length > 0) {
        html += '<div class="revision-respuestas">';
        html += '<div class="revision-header">';
        html += '<h3>Revision de Respuestas</h3>';
        html += '</div>';
        
        detalleRespuestas.forEach(detalle => {
            html += '<div class="pregunta-revision ' + detalle.estado + '">';
            html += '<div class="revision-pregunta-header">';
            html += '<strong>Pregunta ' + detalle.indice + '</strong>';
            html += '<span class="revision-estado ' + detalle.estado + '">';
            if (detalle.estado === 'correcta') {
                html += 'Correcta';
            } else if (detalle.estado === 'incorrecta') {
                html += 'Incorrecta';
            } else {
                html += 'Sin responder';
            }
            html += '</span>';
            html += '<span class="pregunta-tema-info">';
            html += detalle.pregunta.temaNombre || 'Tema desconocido';
            if (detalle.pregunta.temaEpigrafe) {
                html += ' - ' + detalle.pregunta.temaEpigrafe;
            }
            html += '</span>';
            html += '</div>';
            html += '<div class="pregunta-texto">' + detalle.pregunta.texto + '</div>';
            html += '<div class="todas-las-opciones">';
            
            if (detalle.pregunta.opciones) {
                detalle.pregunta.opciones.forEach(opcion => {
                    let clases = 'opcion-revision';
                    if (opcion.letra === detalle.respuestaCorrecta) {
                        clases += ' correcta';
                    }
                    if (opcion.letra === detalle.respuestaUsuario) {
                        clases += ' seleccionada';
                    }
                    
                    html += '<div class="' + clases + '">';
                    html += opcion.letra + ') ' + opcion.texto;
                    if (opcion.letra === detalle.respuestaCorrecta) {
                        html += ' ✓';
                    }
                    if (opcion.letra === detalle.respuestaUsuario && opcion.letra !== detalle.respuestaCorrecta) {
                        html += ' ✗';
                    }
                    html += '</div>';
                });
            }
            
            html += '</div>';
            if (!detalle.respuestaUsuario) {
                html += '<div class="sin-respuesta-nota">No respondiste esta pregunta</div>';
            }
            html += '</div>';
        });
        
        html += '</div>';
    }

    return html;
}

// Función para cerrar el modal de detalle
window.cerrarModalDetalle = function() {
    const modales = document.querySelectorAll('.modal');
    modales.forEach(modal => {
        if (modal.parentNode) {
            document.body.removeChild(modal);
        }
    });
};

// Calcular y mostrar estadÃ­sticas globales
async function mostrarEstadisticasGlobales(querySnapshot) {
    let totalTests = 0;
    let totalPreguntasContestadas = 0;
    let totalCorrectas = 0;
    let totalIncorrectas = 0;
    let sumaPorcentajes = 0;
    const preguntasUnicas = new Set();
    
    querySnapshot.forEach((doc) => {
        const resultado = doc.data();
        
        // Contar test
        totalTests++;
        
        // Sumar porcentaje
        sumaPorcentajes += resultado.porcentaje || 0;
        
        // Contar preguntas, correctas e incorrectas
        totalCorrectas += resultado.correctas || 0;
        totalIncorrectas += resultado.incorrectas || 0;
        
        // Registrar preguntas únicas
        if (resultado.detalleRespuestas) {
            resultado.detalleRespuestas.forEach(detalle => {
                if (detalle.pregunta && detalle.pregunta.texto) {
                    preguntasUnicas.add(detalle.pregunta.texto);
                }
            });
        }
    });
    
    totalPreguntasContestadas = totalCorrectas + totalIncorrectas;
    const notaMedia = totalTests > 0 ? Math.round(sumaPorcentajes / totalTests) : 0;
    
    // Crear panel de estadísticas
    const panelEstadisticas = document.createElement('div');
    panelEstadisticas.className = 'panel-estadisticas-globales';
    panelEstadisticas.innerHTML = `
        <h3>📊 Estadísticas Generales</h3>
        <div class="estadisticas-grid-global">
            <div class="stat-global nota-media">
                <div class="stat-icono">📈</div>
                <div class="stat-valor">${notaMedia}%</div>
                <div class="stat-label">Nota Media</div>
            </div>
            <div class="stat-global">
                <div class="stat-icono">📝</div>
                <div class="stat-valor">${preguntasUnicas.size}</div>
                <div class="stat-label">Preguntas Únicas</div>
            </div>
            <div class="stat-global correctas-global">
                <div class="stat-icono">✅</div>
                <div class="stat-valor">${totalCorrectas}</div>
                <div class="stat-label">Acertadas</div>
            </div>
            <div class="stat-global incorrectas-global">
                <div class="stat-icono">❌</div>
                <div class="stat-valor">${totalIncorrectas}</div>
                <div class="stat-label">Falladas</div>
            </div>
        </div>
    `;
    
    const listResultados = document.getElementById('listaResultados');
    listResultados.appendChild(panelEstadisticas);
}
// Cargar preguntas solo cuando se abre el desplegable
window.cargarPreguntasLazy = async function(event, temaId) {
    const container = document.getElementById(`preguntas-${temaId}`);
    if (!container || container.dataset.cargado === 'true') return;
    
    if (event.target.open) {
        try {
            const temaDoc = await getDoc(doc(db, "temas", temaId));
            if (temaDoc.exists()) {
                const tema = temaDoc.data();
                if (tema.preguntas) {
                    container.innerHTML = tema.preguntas.map((pregunta, index) => 
                        crearPreguntaEditable(pregunta, index, temaId)
                    ).join('');
                    container.dataset.cargado = 'true';
                    temasAbiertos.add(temaId);
                }
            }
        } catch (error) {
            console.error('Error cargando preguntas lazy:', error);
            container.innerHTML = '<p style="color:red;">Error cargando preguntas</p>';
        }
    } else {
        temasAbiertos.delete(temaId);
    }
};
// Versión simplificada sin necesidad de cargar temas
function obtenerTextoTemasSimple(tema) {
    if (tema === 'todos') {
        return 'Todos los temas';
    } else if (tema === 'repaso') {
        return 'Test de repaso';
    } else if (Array.isArray(tema)) {
        return tema.length > 1 ? `${tema.length} temas seleccionados` : 'Tema específico';
    } else if (typeof tema === 'string') {
        return 'Tema específico';
    } else {
        return 'Test';
    }
}


