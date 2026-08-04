// ============================================================
//  /js/asistente-widget.js
//  Las dos burbujas de la portada:
//   · izquierda, el asistente que resuelve dudas de la plataforma
//   · derecha, el consumo de IA acumulado
// ============================================================

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { dibujarAvatar, sanearAvatar } from './avatar.js';

const DOLARES_A_EUROS = 0.92;

const NOMBRES_FUNCION = {
    'generar-preguntas-ia': 'Tests con IA',
    'explicacion': 'Explicaciones',
    'procesar-preguntas': 'Subir Word',
    'asistente': 'Asistente'
};

const SALUDO = 'Hola. Soy tu asistente en la plataforma. Pregúntame lo que quieras sobre cómo funciona: los tests, los temas digitales, el repaso, el multijugador… lo que necesites.';

let usuarioActual = null;
let avatarUsuario = null;
let conversacion = [];      // historial que se manda al servidor
let esperando = false;

// ------------------------------------------------------------
//  Utilidades
// ------------------------------------------------------------
async function cabecerasApi() {
    const cabeceras = { 'Content-Type': 'application/json' };
    try {
        if (usuarioActual) cabeceras.Authorization = `Bearer ${await usuarioActual.getIdToken()}`;
    } catch (error) {
        console.error('No se pudo obtener el token de sesión:', error);
    }
    return cabeceras;
}

const $ = id => document.getElementById(id);

function abrirPanel(panel, boton) {
    cerrarTodo();
    panel.classList.add('abierto');
    boton.classList.add('abierta');
}

function cerrarTodo() {
    ['panelAsistente', 'panelConsumo'].forEach(id => $(id)?.classList.remove('abierto'));
    ['btnAsistente', 'btnConsumo'].forEach(id => $(id)?.classList.remove('abierta'));
}

// ------------------------------------------------------------
//  CHAT DEL ASISTENTE
// ------------------------------------------------------------
function pintarMensaje(texto, quien) {
    const contenedor = $('chatMensajes');
    const burbuja = document.createElement('div');
    burbuja.className = `chat-burbuja de-${quien}`;
    burbuja.textContent = texto;   // textContent: nada de HTML inyectado
    contenedor.appendChild(burbuja);
    contenedor.scrollTop = contenedor.scrollHeight;
    return burbuja;
}

function pintarEscribiendo() {
    const contenedor = $('chatMensajes');
    const puntos = document.createElement('div');
    puntos.className = 'chat-escribiendo';
    puntos.id = 'chatEscribiendo';
    puntos.innerHTML = '<span></span><span></span><span></span>';
    contenedor.appendChild(puntos);
    contenedor.scrollTop = contenedor.scrollHeight;
}

function quitarEscribiendo() {
    $('chatEscribiendo')?.remove();
}

async function preguntar(texto) {
    const pregunta = texto.trim();
    if (!pregunta || esperando) return;

    esperando = true;
    $('chatEnviar').disabled = true;
    $('chatSugerencias').style.display = 'none';

    pintarMensaje(pregunta, 'usuario');
    conversacion.push({ role: 'user', content: pregunta });
    pintarEscribiendo();

    try {
        const respuesta = await fetch('/api/asistente', {
            method: 'POST',
            headers: await cabecerasApi(),
            body: JSON.stringify({ mensajes: conversacion })
        });

        const datos = await respuesta.json().catch(() => ({}));
        quitarEscribiendo();

        if (!respuesta.ok) {
            pintarMensaje(datos.error || `El servidor devolvió ${respuesta.status}`, 'error');
            // El turno fallido no se guarda: si no, se reenvía en cada intento
            conversacion.pop();
            return;
        }

        pintarMensaje(datos.texto || 'No he sabido qué responder.', 'ia');
        conversacion.push({ role: 'assistant', content: datos.texto || '' });

    } catch (error) {
        console.error('Error hablando con el asistente:', error);
        quitarEscribiendo();
        pintarMensaje('No he podido conectar. Comprueba tu conexión e inténtalo de nuevo.', 'error');
        conversacion.pop();

    } finally {
        esperando = false;
        $('chatEnviar').disabled = false;
        $('chatInput').focus();
    }
}

function prepararChat() {
    $('btnAsistente').addEventListener('click', () => {
        const panel = $('panelAsistente');
        if (panel.classList.contains('abierto')) {
            cerrarTodo();
            return;
        }
        abrirPanel(panel, $('btnAsistente'));

        if ($('chatMensajes').children.length === 0) {
            pintarMensaje(SALUDO, 'ia');
        }
        $('chatInput').focus();
    });

    $('cerrarAsistente').addEventListener('click', cerrarTodo);

    $('chatForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const campo = $('chatInput');
        const texto = campo.value;
        campo.value = '';
        preguntar(texto);
    });

    $('chatSugerencias').querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => preguntar(btn.textContent));
    });
}

// ------------------------------------------------------------
//  PANEL DE CONSUMO
// ------------------------------------------------------------
async function cargarConsumo() {
    const cuerpo = $('consumoCuerpo');

    try {
        const resumen = await getDoc(doc(db, 'consumoResumen', usuarioActual.uid));

        if (!resumen.exists()) {
            cuerpo.innerHTML = '<p class="consumo-vacio">Todavía no has usado ninguna función con IA.<br>En cuanto generes un test o una explicación, aparecerá aquí.</p>';
            return;
        }

        const d = resumen.data();
        const dolares = Number(d.costeTotalDolares) || 0;
        const euros = dolares * DOLARES_A_EUROS;
        const llamadas = Number(d.llamadas) || 0;
        const tokens = (Number(d.tokensEntradaTotal) || 0) + (Number(d.tokensSalidaTotal) || 0);
        const media = llamadas > 0 ? (dolares / llamadas) * DOLARES_A_EUROS : 0;

        const porFuncion = d.porFuncion || {};
        const desglose = Object.entries(porFuncion)
            .filter(([, valor]) => Number(valor) > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([clave, valor]) => `
                <div>
                    <span>${NOMBRES_FUNCION[clave] || clave}</span>
                    <strong>${(Number(valor) * DOLARES_A_EUROS).toFixed(2)} €</strong>
                </div>
            `).join('');

        cuerpo.innerHTML = `
            <div class="consumo-grande">
                <span class="cifra">${euros.toFixed(2)} €</span>
                <span class="sub">${dolares.toFixed(3)} $ · ${llamadas} llamada${llamadas === 1 ? '' : 's'}</span>
            </div>
            <div class="consumo-filas">
                <div><span>Coste medio por llamada</span><strong>${media.toFixed(3)} €</strong></div>
                <div><span>Tokens totales</span><strong>${tokens.toLocaleString('es-ES')}</strong></div>
                ${desglose}
            </div>
            <p class="consumo-nota">Cambio orientativo a ${DOLARES_A_EUROS} € por dólar. La factura real la emite Anthropic en dólares.</p>
        `;

        // Resumen en la propia burbuja
        $('consumoResumido').textContent = `${euros.toFixed(2)} € en IA`;

    } catch (error) {
        console.error('Error cargando el consumo:', error);
        cuerpo.innerHTML = '<p class="consumo-vacio">No se ha podido cargar tu consumo.</p>';
    }
}

function prepararConsumo() {
    $('btnConsumo').addEventListener('click', () => {
        const panel = $('panelConsumo');
        if (panel.classList.contains('abierto')) {
            cerrarTodo();
            return;
        }
        abrirPanel(panel, $('btnConsumo'));
        cargarConsumo();
    });

    $('cerrarConsumo').addEventListener('click', cerrarTodo);
}

// ------------------------------------------------------------
//  Arranque
// ------------------------------------------------------------
/* El asistente lleva la cara que el usuario eligió al registrarse.
   Si es una cuenta antigua sin avatar, se queda el búho. */
async function ponerAvatarDeAsistente() {
    try {
        const perfil = await getDoc(doc(db, 'usuarios', usuarioActual.uid));
        if (!perfil.exists() || !perfil.data().avatar) return;

        avatarUsuario = sanearAvatar(perfil.data().avatar);
        const svg = dibujarAvatar(avatarUsuario);

        const enBurbuja = document.querySelector('#btnAsistente .burbuja-emoji');
        if (enBurbuja) {
            enBurbuja.classList.remove('burbuja-emoji');
            enBurbuja.classList.add('burbuja-avatar');
            enBurbuja.innerHTML = svg;
        }

        const enPanel = document.querySelector('#panelAsistente .panel-avatar');
        if (enPanel) {
            enPanel.classList.remove('panel-avatar');
            enPanel.classList.add('panel-avatar-img');
            enPanel.innerHTML = svg;
        }

        const nombre = perfil.data().nombre;
        const rotulo = document.querySelector('#panelAsistente .panel-titulo strong');
        if (rotulo && nombre) rotulo.textContent = `Asistente de ${String(nombre).split(' ')[0]}`;

    } catch (error) {
        console.error('No se pudo cargar el avatar:', error);
    }
}

onAuthStateChanged(auth, (user) => {
    if (!user) return;
    usuarioActual = user;

    prepararChat();
    prepararConsumo();
    ponerAvatarDeAsistente();

    // El total en la burbuja, sin necesidad de abrir el panel
    cargarConsumo().catch(() => {});
});

// Cerrar con Esc y al hacer clic fuera
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrarTodo();
});

document.addEventListener('click', (e) => {
    const dentro = e.target.closest('.panel-flotante, .burbuja-flotante');
    if (!dentro) cerrarTodo();
});
