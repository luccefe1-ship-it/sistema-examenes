import { auth, db } from './firebase-config.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    doc, 
    getDoc, 
    collection, 
    addDoc, 
    getDocs, 
    query, 
    where,
    updateDoc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;
let epigrafeSeleccionado = null;
let epigrafesActuales = [];

console.log('Archivo apuntes.js cargado');

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM cargado');
    
    // Verificar autenticación
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            console.log('Usuario autenticado:', user.email);
            await cargarDatosUsuario();
            await cargarTemasApuntes();
            setupEventListeners();
        } else {
            console.log('Usuario no autenticado, redirigiendo...');
            window.location.href = 'index.html';
        }
    });
});

async function cargarDatosUsuario() {
    try {
        const userDoc = await getDoc(doc(db, "usuarios", currentUser.uid));
        const userNameSpan = document.getElementById('userName');
        
        if (userDoc.exists()) {
            const userData = userDoc.data();
            userNameSpan.textContent = userData.nombre;
        } else {
            userNameSpan.textContent = currentUser.email;
        }
    } catch (error) {
        console.error('Error cargando datos:', error);
        document.getElementById('userName').textContent = currentUser.email;
    }
}

function setupEventListeners() {
    console.log('Configurando event listeners...');
    
    // Navegación
    const backBtn = document.getElementById('backBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = 'homepage.html';
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await signOut(auth);
                window.location.href = 'index.html';
            } catch (error) {
                console.error('Error al cerrar sesión:', error);
            }
        });
    }

    // Botón crear tema
    const crearTemaBtn = document.getElementById('crearTemaApuntesBtn');
    if (crearTemaBtn) {
        crearTemaBtn.addEventListener('click', () => {
            console.log('Botón crear tema clickeado');
            const modal = document.getElementById('modalCrearTemaApuntes');
            if (modal) {
                modal.style.display = 'block';
                console.log('Modal mostrado');
            } else {
                console.error('Modal no encontrado');
            }
        });
    } else {
        console.error('Botón crear tema no encontrado');
    }

    // Botones del modal
    const confirmarBtn = document.getElementById('confirmarCrearTemaApuntes');
    const cancelarBtn = document.getElementById('cancelarCrearTemaApuntes');
    
    if (confirmarBtn) {
        confirmarBtn.addEventListener('click', () => {
            crearTemaApuntes();
        });
    }
    
    if (cancelarBtn) {
        cancelarBtn.addEventListener('click', () => {
            cerrarModal();
        });
    }

    // Checkbox subtema
    const checkboxSubtema = document.getElementById('esSubtemaApuntes');
    if (checkboxSubtema) {
        checkboxSubtema.addEventListener('change', () => {
            mostrarOpcionSubtema();
        });
    }

    // Botón añadir epígrafe
    const anadirEpigrafeBtn = document.getElementById('anadirEpigrafeBtn');
    if (anadirEpigrafeBtn) {
        anadirEpigrafeBtn.addEventListener('click', () => {
            console.log('Botón añadir epígrafe clickeado');
            const modalEpigrafe = document.getElementById('modalAnadirEpigrafe');
            if (modalEpigrafe) {
                modalEpigrafe.style.display = 'block';
                console.log('Modal epígrafe mostrado');
            } else {
                console.error('Modal epígrafe no encontrado');
            }
        });
    }

    // Botones del modal epígrafe
    const confirmarEpigrafeBtn = document.getElementById('confirmarAnadirEpigrafe');
    const cancelarEpigrafeBtn = document.getElementById('cancelarAnadirEpigrafe');

    if (confirmarEpigrafeBtn) {
        confirmarEpigrafeBtn.addEventListener('click', () => {
            anadirEpigrafe();
        });
    }

    if (cancelarEpigrafeBtn) {
        cancelarEpigrafeBtn.addEventListener('click', () => {
            cerrarModalEpigrafe();
        });
    }

    // Navegación entre epígrafes
    const epigrafeAnterior = document.getElementById('epigrafeAnterior');
    const epigrafeSiguiente = document.getElementById('epigrafeSiguiente');

    if (epigrafeAnterior) {
        epigrafeAnterior.addEventListener('click', () => {
            if (epigrafeSeleccionado > 0) {
                seleccionarEpigrafe(epigrafeSeleccionado - 1, epigrafesActuales);
            }
        });
    }

    if (epigrafeSiguiente) {
        epigrafeSiguiente.addEventListener('click', () => {
            if (epigrafeSeleccionado < epigrafesActuales.length - 1) {
                seleccionarEpigrafe(epigrafeSeleccionado + 1, epigrafesActuales);
            }
        });
    }

    // Botones de edición
    const guardarNotaBtn = document.getElementById('guardarNotaBtn');
    const cancelarEdicionBtn = document.getElementById('cancelarEdicionBtn');

    if (guardarNotaBtn) {
        guardarNotaBtn.addEventListener('click', () => {
            guardarContenidoEpigrafe();
        });
    }

    if (cancelarEdicionBtn) {
        cancelarEdicionBtn.addEventListener('click', () => {
            cancelarEdicion();
        });
    }

    // Selector de tema
    const selectorTemaApuntes = document.getElementById('selectorTemaApuntes');
    if (selectorTemaApuntes) {
        selectorTemaApuntes.addEventListener('change', (e) => {
            seleccionarTema(e.target.value);
        });
    }

    // Cerrar modal al hacer click fuera
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });
}

async function crearTemaApuntes() {
    console.log('Creando tema...');
    
    const nombre = document.getElementById('nombreTemaApuntes').value.trim();
    const descripcion = document.getElementById('descripcionTemaApuntes').value.trim();
    const esSubtema = document.getElementById('esSubtemaApuntes').checked;
    const temaPadreId = document.getElementById('temaPadreSelectApuntes').value;

    if (!nombre) {
        alert('El nombre del tema es obligatorio');
        return;
    }

    if (esSubtema && !temaPadreId) {
        alert('Selecciona un tema padre para el subtema');
        return;
    }

    // Verificar si ya existe un tema con el mismo nombre
    try {
        const q = query(collection(db, "temasApuntes"), 
                        where("usuarioId", "==", currentUser.uid),
                        where("nombre", "==", nombre));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            alert('Ya existe un tema con el nombre "' + nombre + '". Por favor, elige un nombre diferente.');
            return;
        }
    } catch (error) {
        console.error('Error verificando nombres duplicados:', error);
        alert('Error al verificar el nombre del tema');
        return;
    }

    // Si llegamos aquí, el nombre es único, proceder a crear el tema
    try {
        const temaData = {
            nombre: nombre,
            descripcion: descripcion,
            fechaCreacion: new Date(),
            usuarioId: currentUser.uid,
            epigrafes: [],
            esSubtema: esSubtema,
            temaPadreId: esSubtema ? temaPadreId : null
        };

        console.log('Guardando tema en Firebase...', temaData);
        const docRef = await addDoc(collection(db, "temasApuntes"), temaData);
        console.log('Tema guardado con ID:', docRef.id);
        
        alert('Tema creado exitosamente');
        cerrarModal();
        limpiarFormulario();
        await cargarTemasApuntes();
        
    } catch (error) {
        console.error('Error creando tema:', error);
        alert('Error al crear el tema: ' + error.message);
    }
}

function mostrarOpcionSubtema() {
    const esSubtema = document.getElementById('esSubtemaApuntes').checked;
    const temaPadreSelect = document.getElementById('temaPadreSelectApuntes');
    
    if (temaPadreSelect) {
        temaPadreSelect.style.display = esSubtema ? 'block' : 'none';
        
        if (esSubtema) {
            cargarTemasPadre();
        }
    }
}

async function cargarTemasPadre() {
    try {
        const q = query(collection(db, "temasApuntes"), where("usuarioId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        
        const temaPadreSelect = document.getElementById('temaPadreSelectApuntes');
        temaPadreSelect.innerHTML = '<option value="">Selecciona tema padre...</option>';
        
        querySnapshot.forEach((doc) => {
            const tema = doc.data();
            if (!tema.temaPadreId) {
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = tema.nombre;
                temaPadreSelect.appendChild(option);
            }
        });
        
    } catch (error) {
        console.error('Error cargando temas padre:', error);
    }
}

function cerrarModal() {
    const modal = document.getElementById('modalCrearTemaApuntes');
    if (modal) {
        modal.style.display = 'none';
    }
}

function limpiarFormulario() {
    document.getElementById('nombreTemaApuntes').value = '';
    document.getElementById('descripcionTemaApuntes').value = '';
    document.getElementById('esSubtemaApuntes').checked = false;
    document.getElementById('temaPadreSelectApuntes').style.display = 'none';
}

async function cargarTemasApuntes() {
    try {
        console.log('Cargando temas en el selector...');
        const q = query(collection(db, "temasApuntes"), where("usuarioId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        
        const selectorTemaApuntes = document.getElementById('selectorTemaApuntes');
        selectorTemaApuntes.innerHTML = '<option value="">Selecciona un tema...</option>';
        
        querySnapshot.forEach((doc) => {
            const tema = doc.data();
            console.log('Tema encontrado:', tema.nombre);
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = tema.nombre;
            selectorTemaApuntes.appendChild(option);
        });
        
        console.log('Temas cargados en el selector');
        
    } catch (error) {
        console.error('Error cargando temas de apuntes:', error);
    }
}

async function seleccionarTema(temaId) {
    console.log('Seleccionando tema:', temaId);
    
 if (!temaId) {
        document.getElementById('temaActualApuntes').style.display = 'none';
        document.getElementById('mainContentApuntes').style.display = 'none';
        // Eliminar botón flotante si existe
        let btnEliminarExistente = document.getElementById('btnEliminarTemaFlotante');
        if (btnEliminarExistente) {
            btnEliminarExistente.remove();
        }
        return;
    }

    try {
        const temaDoc = await getDoc(doc(db, "temasApuntes", temaId));
        if (!temaDoc.exists()) {
            alert('Tema no encontrado');
            return;
        }

        const temaData = temaDoc.data();
        
       // Ocultar el display del tema actual
        document.getElementById('temaActualApuntes').style.display = 'none';
        
        // Crear botón eliminar en la esquina superior derecha
        let btnEliminarExistente = document.getElementById('btnEliminarTemaFlotante');
        if (btnEliminarExistente) {
            btnEliminarExistente.remove();
        }
        
        const btnEliminar = document.createElement('button');
        btnEliminar.id = 'btnEliminarTemaFlotante';
        btnEliminar.className = 'btn-eliminar-tema-flotante';
        btnEliminar.innerHTML = `
            <span class="icono">🗑️</span>
            <span class="texto">Eliminar Tema</span>
        `;
        btnEliminar.onclick = () => eliminarTema(temaId);
        document.querySelector('.tema-selector-container').appendChild(btnEliminar);
        
        // Actualizar header del índice con nombre del tema
        document.querySelector('.indice-header h3').innerHTML = `
            📚 ${temaData.nombre}<br>
            <small style="font-size: 14px; font-weight: normal;">Índice</small>
        `;
        
        document.getElementById('mainContentApuntes').style.display = 'flex';
        
        console.log('Tema seleccionado:', temaData.nombre);
        
        // Limpiar estado anterior
        epigrafeSeleccionado = null;
        epigrafesActuales = [];

        // Cargar y mostrar epígrafes existentes
        const epigrafes = temaData.epigrafes || [];
        epigrafesActuales = epigrafes;
        mostrarEpigrafesEnLista(epigrafes);

        // Limpiar área central
        document.getElementById('contenidoNota').innerHTML = `
            <div class="nota-placeholder">
                <p>📝 Selecciona un epígrafe del índice para comenzar a tomar apuntes</p>
            </div>
        `;
        document.getElementById('areaEdicion').style.display = 'none';
        document.getElementById('contenidoNota').style.display = 'block';

        // Limpiar navegación
        document.getElementById('epigrafeActual').textContent = 'Selecciona un epígrafe';
        document.getElementById('epigrafeAnterior').disabled = true;
        document.getElementById('epigrafeSiguiente').disabled = true;
        
    } catch (error) {
        console.error('Error seleccionando tema:', error);
        alert('Error al cargar el tema');
    }
}

async function anadirEpigrafe() {
    const nombre = document.getElementById('nombreEpigrafe').value.trim();
    
    if (!nombre) {
        alert('El nombre del epígrafe es obligatorio');
        return;
    }

    // Obtener el tema actual seleccionado
    const temaSeleccionadoId = document.getElementById('selectorTemaApuntes').value;
    if (!temaSeleccionadoId) {
        alert('Primero selecciona un tema');
        return;
    }

    try {
        console.log('Añadiendo epígrafe al tema:', temaSeleccionadoId);
        
        // Obtener tema actual de Firebase
        const temaDoc = await getDoc(doc(db, "temasApuntes", temaSeleccionadoId));
        const temaData = temaDoc.data();
        const epigrafesActualesTemp = temaData.epigrafes || [];
        
        // Crear nuevo epígrafe
        const nuevoEpigrafe = {
            titulo: nombre,
            contenido: '',
            fechaCreacion: new Date(),
            fechaModificacion: new Date()
        };
        
        // Añadir a la lista
        epigrafesActualesTemp.push(nuevoEpigrafe);
        
        // Actualizar en Firebase
        await updateDoc(doc(db, "temasApuntes", temaSeleccionadoId), {
            epigrafes: epigrafesActualesTemp
        });
        
        console.log('Epígrafe guardado en Firebase');
        
        // Actualizar variables locales
        epigrafesActuales = epigrafesActualesTemp;
        
        // Actualizar interfaz
        mostrarEpigrafesEnLista(epigrafesActuales);
        
        cerrarModalEpigrafe();
        document.getElementById('nombreEpigrafe').value = '';
        
        alert('Epígrafe "' + nombre + '" añadido correctamente');
        
    } catch (error) {
        console.error('Error añadiendo epígrafe:', error);
        alert('Error al añadir el epígrafe');
    }
}

function cerrarModalEpigrafe() {
    const modal = document.getElementById('modalAnadirEpigrafe');
    if (modal) {
        modal.style.display = 'none';
    }
}

function mostrarEpigrafesEnLista(epigrafes) {
    const listaEpigrafes = document.getElementById('listaEpigrafes');
    listaEpigrafes.innerHTML = '';
    
    if (epigrafes.length === 0) {
        listaEpigrafes.innerHTML = '<li style="padding: 20px; text-align: center; color: #6c757d; font-style: italic;">No hay epígrafes. Añade uno nuevo.</li>';
        return;
    }

    epigrafes.forEach((epigrafe, index) => {
        const li = document.createElement('li');
        li.className = 'epigrafe-item';
        li.dataset.index = index;
        
        li.innerHTML = `
            <span class="epigrafe-nombre" style="flex: 1;">${epigrafe.titulo}</span>
            <div class="epigrafe-actions">
                <button class="btn-epigrafe btn-editar" onclick="editarNombreEpigrafe(${index})" title="Editar nombre">✏️</button>
                <button class="btn-epigrafe btn-eliminar" onclick="eliminarEpigrafe(${index})" title="Eliminar">🗑️</button>
            </div>
        `;
        
        li.addEventListener('click', (e) => {
            if (!e.target.classList.contains('btn-epigrafe')) {
                seleccionarEpigrafe(index, epigrafes);
            }
        });
        
        listaEpigrafes.appendChild(li);
    });
}

function seleccionarEpigrafe(index, epigrafes) {
    epigrafeSeleccionado = index;
    epigrafesActuales = epigrafes;
    
    console.log('Epígrafe seleccionado:', epigrafes[index].titulo);
    
    // Actualizar interfaz
    document.querySelectorAll('.epigrafe-item').forEach(item => {
        item.classList.remove('seleccionado');
    });
    
    const itemSeleccionado = document.querySelectorAll('.epigrafe-item')[index];
    itemSeleccionado.classList.add('seleccionado');
    
    // Actualizar navegación
    document.getElementById('epigrafeActual').textContent = epigrafes[index].titulo;
    document.getElementById('epigrafeAnterior').disabled = index === 0;
    document.getElementById('epigrafeSiguiente').disabled = index === epigrafes.length - 1;
    
    // Mostrar contenido
    mostrarContenidoEpigrafe(epigrafes[index]);
}

function mostrarContenidoEpigrafe(epigrafe) {
    const contenidoNota = document.getElementById('contenidoNota');
    
    if (!epigrafe.contenido || epigrafe.contenido.trim() === '') {
        contenidoNota.innerHTML = `
            <div style="background: #fff3cd; border: 2px dashed #ffc107; border-radius: 8px; padding: 40px; text-align: center; color: #856404; font-style: italic;">
                <p>📝 Este epígrafe está vacío</p>
                <p>Haz clic en el botón editar para añadir contenido</p>
                <button onclick="iniciarEdicion()" style="margin-top: 15px; padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer;">✏️ Empezar a escribir</button>
            </div>
        `;
    } else {
        contenidoNota.innerHTML = `
    <div style="position: relative; min-height: 200px;">
        <div style="line-height: 1.6; font-size: 16px; color: #495057; word-wrap: break-word;">${epigrafe.contenido}</div>
        <button onclick="iniciarEdicion()" style="position: absolute; top: -5px; right: -5px; background: #17a2b8; color: white; border: none; width: 35px; height: 35px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.2);" title="Editar nota">✏️</button>
    </div>
`;
    }
}

window.iniciarEdicion = function() {
    if (epigrafeSeleccionado === null) return;
    
    const epigrafe = epigrafesActuales[epigrafeSeleccionado];
    
    document.getElementById('contenidoNota').style.display = 'none';
    document.getElementById('areaEdicion').style.display = 'flex';
    
    document.getElementById('tituloEpigrafeEditor').value = epigrafe.titulo;
    document.getElementById('contenidoEditor').innerHTML = epigrafe.contenido || '';
    document.getElementById('contenidoEditor').focus();
};

async function guardarContenidoEpigrafe() {
    if (epigrafeSeleccionado === null) {
        alert('No hay epígrafe seleccionado');
        return;
    }
    
    const nuevoTitulo = document.getElementById('tituloEpigrafeEditor').value.trim();
const nuevoContenido = document.getElementById('contenidoEditor').innerHTML.trim();    
    if (!nuevoTitulo) {
        alert('El título del epígrafe no puede estar vacío');
        return;
    }

    try {
        console.log('Guardando epígrafe:', epigrafeSeleccionado, 'con contenido:', nuevoContenido);
        
        // Actualizar el epígrafe específico
        epigrafesActuales[epigrafeSeleccionado].titulo = nuevoTitulo;
        epigrafesActuales[epigrafeSeleccionado].contenido = nuevoContenido;
        epigrafesActuales[epigrafeSeleccionado].fechaModificacion = new Date();
        
        // Obtener ID del tema actual
        const temaSeleccionadoId = document.getElementById('selectorTemaApuntes').value;
        
        // Guardar en Firebase
        await updateDoc(doc(db, "temasApuntes", temaSeleccionadoId), {
            epigrafes: epigrafesActuales
        });

        console.log('Guardado en Firebase correctamente');
        
        // Salir del modo edición
        document.getElementById('areaEdicion').style.display = 'none';
        document.getElementById('contenidoNota').style.display = 'block';
        
        // Actualizar interfaz
        mostrarEpigrafesEnLista(epigrafesActuales);
        mostrarContenidoEpigrafe(epigrafesActuales[epigrafeSeleccionado]);
        
        // Actualizar nombre en navegación
        document.getElementById('epigrafeActual').textContent = nuevoTitulo;
        
        // Reseleccionar para mantener el estado
        setTimeout(() => {
            seleccionarEpigrafe(epigrafeSeleccionado, epigrafesActuales);
        }, 100);
        
    } catch (error) {
        console.error('Error guardando:', error);
        alert('Error al guardar el contenido');
    }
}

function cancelarEdicion() {
    document.getElementById('areaEdicion').style.display = 'none';
    document.getElementById('contenidoNota').style.display = 'block';
}

window.eliminarTema = async function(temaId) {
    if (confirm('¿Estás seguro de que quieres eliminar este tema? Se perderán todos los epígrafes y contenido.')) {
        try {
            await deleteDoc(doc(db, "temasApuntes", temaId));
            
            // Limpiar interfaz
            document.getElementById('temaActualApuntes').textContent = 'Ningún tema seleccionado';
            document.getElementById('mainContentApuntes').style.display = 'none';
            
            // Recargar lista de temas
            await cargarTemasApuntes();
            
            alert('Tema eliminado correctamente');
            
        } catch (error) {
            console.error('Error eliminando tema:', error);
            alert('Error al eliminar el tema');
        }
    }
};

window.eliminarEpigrafe = async function(index) {
    if (confirm('¿Estás seguro de que quieres eliminar este epígrafe?')) {
        try {
            // Eliminar del array
            epigrafesActuales.splice(index, 1);
            
            // Obtener ID del tema actual
            const temaSeleccionadoId = document.getElementById('selectorTemaApuntes').value;
            
            // Actualizar en Firebase
            await updateDoc(doc(db, "temasApuntes", temaSeleccionadoId), {
                epigrafes: epigrafesActuales
            });
            
            // Actualizar interfaz
            mostrarEpigrafesEnLista(epigrafesActuales);
            
            // Limpiar área central si se eliminó el epígrafe seleccionado
            if (epigrafeSeleccionado === index) {
                epigrafeSeleccionado = null;
                document.getElementById('contenidoNota').innerHTML = `
                    <div class="nota-placeholder">
                        <p>📝 Selecciona un epígrafe del índice para comenzar a tomar apuntes</p>
                    </div>
                `;
                document.getElementById('epigrafeActual').textContent = 'Selecciona un epígrafe';
                document.getElementById('epigrafeAnterior').disabled = true;
                document.getElementById('epigrafeSiguiente').disabled = true;
            } else if (epigrafeSeleccionado > index) {
                // Ajustar el índice si se eliminó un epígrafe anterior al seleccionado
                epigrafeSeleccionado--;
            }
            
        } catch (error) {
            console.error('Error eliminando epígrafe:', error);
            alert('Error al eliminar el epígrafe');
        }
    }
};

window.editarNombreEpigrafe = async function(index) {
    const nombreActual = epigrafesActuales[index].titulo;
    const nuevoNombre = prompt('Editar nombre del epígrafe:', nombreActual);
    
    if (nuevoNombre && nuevoNombre.trim() !== '' && nuevoNombre !== nombreActual) {
        try {
            epigrafesActuales[index].titulo = nuevoNombre.trim();
            epigrafesActuales[index].fechaModificacion = new Date();
            
            const temaSeleccionadoId = document.getElementById('selectorTemaApuntes').value;
            
            await updateDoc(doc(db, "temasApuntes", temaSeleccionadoId), {
                epigrafes: epigrafesActuales
            });
            
            mostrarEpigrafesEnLista(epigrafesActuales);
            
            if (epigrafeSeleccionado === index) {
                document.getElementById('epigrafeActual').textContent = nuevoNombre.trim();
                seleccionarEpigrafe(index, epigrafesActuales);
            }
            
        } catch (error) {
            console.error('Error editando nombre:', error);
            alert('Error al editar el nombre');
        }
    }
};
let colorSeleccionado = 'yellow';

// Manejar selección de colores
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        document.querySelectorAll('.color-option').forEach(option => {
            option.addEventListener('click', (e) => {
                document.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
                e.target.classList.add('selected');
                colorSeleccionado = e.target.dataset.color;
            });
        });
        
        // Seleccionar amarillo por defecto
        document.querySelector('.color-option[data-color="yellow"]').classList.add('selected');
    }, 500);
});

window.toggleResaltado = function() {
    const editor = document.getElementById('contenidoEditor');
    editor.focus();
    
    const selection = window.getSelection();
    if (selection.rangeCount > 0 && !selection.isCollapsed) {
        if (colorSeleccionado === 'none') {
            // Quitar CUALQUIER tipo de formato de fondo
            document.execCommand('removeFormat', false, null);
            document.execCommand('hiliteColor', false, 'transparent');
            document.execCommand('backColor', false, 'transparent');
        } else {
            // Primero limpiar cualquier formato existente del texto seleccionado
            document.execCommand('hiliteColor', false, 'transparent');
            document.execCommand('backColor', false, 'transparent');
            // Luego aplicar el nuevo color
            document.execCommand('hiliteColor', false, colorSeleccionado);
        }
        
        selection.removeAllRanges();
    } else {
        alert('Selecciona el texto que quieres resaltar primero');
    }
};
window.limpiarTodoFormato = function() {
    const editor = document.getElementById('contenidoEditor');
    editor.focus();
    
    const selection = window.getSelection();
    if (selection.rangeCount > 0 && !selection.isCollapsed) {
        document.execCommand('removeFormat', false, null);
        document.execCommand('hiliteColor', false, 'transparent');
        document.execCommand('backColor', false, 'transparent');
        selection.removeAllRanges();
    } else {
        // Si no hay selección, limpiar todo el contenido
        const content = editor.innerHTML;
        editor.innerHTML = content.replace(/style="[^"]*"/g, '').replace(/<span[^>]*>/g, '').replace(/<\/span>/g, '');
    }
};

window.formatearTexto = function(comando) {
    if (comando === 'insertOrderedList' || comando === 'insertUnorderedList') {
        const editor = document.getElementById('contenidoEditor');
        editor.focus();
        document.execCommand(comando, false, null);
    } else {
        const editor = document.getElementById('contenidoEditor');
        editor.focus();
        document.execCommand(comando, false, null);
    }
};

window.insertarSaltoLinea = function() {
    document.execCommand('insertHTML', false, '<br><br>');
    document.getElementById('contenidoEditor').focus();
};
