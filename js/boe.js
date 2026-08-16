// ============================================================
//  js/boe.js
//  Panel "Mi Oposición".
//
//  ESTADO ACTUAL: solo la estructura. Tres pestañas vacías
//  (temario, convocatoria, examen) y la cuenta atrás de arriba.
//  El contenido de cada panel se irá construyendo dentro de sus
//  contenedores: #contenidoTemario, #contenidoConvocatoria y
//  #contenidoExamen.
//
//  Lo que SÍ sigue funcionando aquí:
//    - la sesión y el cuerpo elegido (Gestión o Tramitación), que
//      se guarda en el perfil porque Luciano y Sandra comparten
//      plataforma y no se presentan al mismo;
//    - la cuenta atrás, que sale de /api/mi-oposicion;
//    - el cambio de pestaña.
//
//  Esta pantalla no escribe nada salvo el cuerpo elegido, en el
//  documento del propio usuario.
// ============================================================

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDoc, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let usuario = null;
let ficha = null;
let cuerpoElegido = null;

// ------------------------------------------------------------
//  Arranque
// ------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'index.html'; return; }
    usuario = user;
    document.getElementById('userName').textContent = user.displayName || user.email;

    cuerpoElegido = await leerCuerpo();
    if (!cuerpoElegido) cuerpoElegido = await preguntarCuerpo();

    await cargarFicha();
});

async function leerCuerpo() {
    try {
        const perfil = await getDoc(doc(db, 'usuarios', usuario.uid));
        const guardado = perfil.exists() ? perfil.data().cuerpoOposicion : null;
        return ['gestion', 'tramitacion'].includes(guardado) ? guardado : null;
    } catch (error) {
        console.warn('[oposicion] No se pudo leer el perfil:', error.message);
        return null;
    }
}

/* Primera vez: se pregunta y se guarda. Se puede cambiar luego desde
   la propia etiqueta de la cabecera. */
function preguntarCuerpo() {
    return new Promise(resolve => {
        const caja = document.createElement('div');
        caja.className = 'op-eleccion';
        caja.innerHTML = `
            <h3>¿A qué cuerpo te presentas?</h3>
            <p>Se guarda en tu perfil. Sandra y tú veis cada uno lo vuestro.</p>
            <div class="op-eleccion-botones">
                <button data-cuerpo="gestion">
                    <strong>Gestión Procesal</strong>
                    <span>68 temas · 725 plazas</span>
                </button>
                <button data-cuerpo="tramitacion">
                    <strong>Tramitación Procesal</strong>
                    <span>37 temas · 1.155 plazas</span>
                </button>
            </div>`;

        document.querySelector('.boe-container').prepend(caja);

        caja.addEventListener('click', async (evento) => {
            const boton = evento.target.closest('button[data-cuerpo]');
            if (!boton) return;
            const elegido = boton.dataset.cuerpo;
            await guardarCuerpo(elegido);
            caja.remove();
            resolve(elegido);
        });
    });
}

async function guardarCuerpo(clave) {
    try {
        await setDoc(doc(db, 'usuarios', usuario.uid), { cuerpoOposicion: clave }, { merge: true });
    } catch (error) {
        console.error('[oposicion] No se pudo guardar el cuerpo:', error);
    }
}

// ------------------------------------------------------------
//  Ficha de la convocatoria
//  La API devuelve mucho más de lo que se pinta ahora mismo
//  (plazas, ejercicios, hitos y la revisión del material). Se deja
//  en `ficha` para tenerlo a mano al construir cada panel.
// ------------------------------------------------------------
async function cargarFicha() {
    try {
        const token = await usuario.getIdToken();
        const respuesta = await fetch('/api/mi-oposicion', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
            body: JSON.stringify({ cuerpo: cuerpoElegido })
        });

        if (!respuesta.ok) {
            const detalle = await respuesta.json().catch(() => ({}));
            throw new Error(detalle.error || `Error ${respuesta.status}`);
        }

        ficha = await respuesta.json();
        pintarPortada();

    } catch (error) {
        console.error('[oposicion] No se pudo cargar la ficha:', error);
    }
}

function fechaLarga(iso) {
    if (!iso) return '';
    const [a, m, d] = iso.split('-').map(Number);
    return new Date(a, m - 1, d).toLocaleDateString('es-ES',
        { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// ------------------------------------------------------------
//  Cuenta atrás
// ------------------------------------------------------------
function pintarPortada() {
    const etiqueta = document.getElementById('opCuerpo');
    etiqueta.textContent = ficha.cuerpo.nombre;
    etiqueta.title = 'Pulsa para cambiar de cuerpo';
    etiqueta.onclick = async () => {
        cuerpoElegido = cuerpoElegido === 'gestion' ? 'tramitacion' : 'gestion';
        await guardarCuerpo(cuerpoElegido);
        await cargarFicha();
    };

    document.getElementById('opDias').textContent = ficha.examenPasado ? '—' : ficha.diasParaExamen;
    document.getElementById('opFecha').textContent = fechaLarga(ficha.fechaExamen);
}

// ------------------------------------------------------------
//  Pestañas
// ------------------------------------------------------------
function abrirPanel(nombre) {
    document.querySelectorAll('.op-pestana').forEach(b =>
        b.classList.toggle('activa', b.dataset.panel === nombre));
    document.querySelectorAll('.op-panel').forEach(p =>
        p.classList.toggle('activo', p.id === `panel-${nombre}`));
}

document.querySelectorAll('.op-pestana').forEach(boton => {
    boton.addEventListener('click', () => abrirPanel(boton.dataset.panel));
});
