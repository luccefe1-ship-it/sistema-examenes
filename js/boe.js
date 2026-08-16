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

/* Los tres cuerpos que salen en la misma convocatoria. El nombre va
   escrito como lo escribe el BOE, no en abreviado. */
const CUERPOS = {
    gestion:     'Gestión Procesal y Administrativa',
    tramitacion: 'Tramitación Procesal y Administrativa',
    auxilio:     'Auxilio Judicial'
};

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

    /* Si no hay nada guardado se entra por Gestión y ya se cambia
       con el selector de la portada, que está siempre a la vista.
       Antes había un cuadro de "¿a qué cuerpo te presentas?" que
       tapaba la pantalla para preguntar algo que ahora se resuelve
       con un clic sin bloquear nada. */
    cuerpoElegido = await leerCuerpo() || 'gestion';
    marcarCuerpoElegido();

    await cargarFicha();
});

async function leerCuerpo() {
    try {
        const perfil = await getDoc(doc(db, 'usuarios', usuario.uid));
        const guardado = perfil.exists() ? perfil.data().cuerpoOposicion : null;
        return Object.prototype.hasOwnProperty.call(CUERPOS, guardado || '') ? guardado : null;
    } catch (error) {
        console.warn('[oposicion] No se pudo leer el perfil:', error.message);
        return null;
    }
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
    document.getElementById('opCuerpo').textContent = ficha.cuerpo.nombre;
    document.getElementById('opDias').textContent = ficha.examenPasado ? '—' : ficha.diasParaExamen;
    document.getElementById('opFecha').textContent = fechaLarga(ficha.fechaExamen);
}

// ------------------------------------------------------------
//  Selector de cuerpo
//  El examen es el mismo día para los tres, pero las plazas, los
//  ejercicios y el temario no. Se puede mirar cualquiera de los
//  tres; lo que se elige se guarda en el perfil.
// ------------------------------------------------------------
function marcarCuerpoElegido() {
    document.querySelectorAll('.op-selector-opcion').forEach(boton => {
        const elegido = boton.dataset.cuerpo === cuerpoElegido;
        boton.classList.toggle('elegido', elegido);
        boton.setAttribute('aria-pressed', elegido ? 'true' : 'false');
    });
}

document.querySelectorAll('.op-selector-opcion').forEach(boton => {
    boton.addEventListener('click', async () => {
        if (boton.dataset.cuerpo === cuerpoElegido) return;

        cuerpoElegido = boton.dataset.cuerpo;
        marcarCuerpoElegido();

        /* Se marca ya y se pide la ficha después: el botón responde al
           instante y no parece que se haya quedado colgado mientras
           llega la respuesta. */
        await guardarCuerpo(cuerpoElegido);
        await cargarFicha();
    });
});

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
