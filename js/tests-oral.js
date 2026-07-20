// tests-oral.js — Test Oral (modo manos libres, voz + reconocimiento)

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { doc, getDoc, setDoc, addDoc, collection, query, where, getDocs, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { generarBloqueComparativa, DIVISOR_PENALIZACION } from './notas-corte.js';

// ============= ESTADO =============
let currentUser = null;
let testConfig = null;
let preguntaActual = 0;
let respuestas = [];          // [{ preguntaIndex, letraUsuario, esCorrecta, respondida }]
let cronometroInterval = null;
let tiempoRestanteSegundos = 0;

let recognition = null;       // instancia SpeechRecognition
let voiceES = null;           // voz TTS en español
let pausado = false;
let escuchando = false;
let intentosReconocimiento = 0; // por pregunta, para reintentar 1 vez
let testFinalizado = false;

// Modo de escucha: 'respuesta' (A/B/C/D) o 'siNo' (sí/no para la explicación)
let modoEscucha = 'respuesta';
let resolverSiNo = null; // resolver de la Promise cuando se escucha sí/no
let recibioResultado = false; // para detectar timeout silencioso en onend
let bloqueoEscucha = false;   // true mientras la voz TTS está hablando: bloquea el reconocedor
let utteranceActual = null;   // utterance vivo (para invalidar al cambiar velocidad)
let textoLecturaActual = '';  // texto que se está leyendo (para relanzar con nueva velocidad)
let resolverHablar = null;    // resolve de la Promise de hablar() en curso

// Velocidad de la voz (persistente en localStorage).
// Saltos amplios porque muchas voces ignoran cambios pequeños de rate.
const VELOCIDADES = [0.7, 1.0, 1.4, 1.8, 2.3];
let velocidadVoz = parseFloat(localStorage.getItem('oralVelocidadVoz')) || 1.0;

// ============= INIT =============
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM cargado en tests-oral.js');

    if (!comprobarSoporteNavegador()) return;

    cargarVozTTS();

    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            cargarConfiguracion();
        } else {
            window.location.href = 'index.html';
        }
    });
});

function comprobarSoporteNavegador() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        alert('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge para el test oral.');
        window.location.href = 'tests.html?section=aleatorio';
        return false;
    }
    if (!('speechSynthesis' in window)) {
        alert('Tu navegador no soporta síntesis de voz.');
        window.location.href = 'tests.html?section=aleatorio';
        return false;
    }
    return true;
}

function cargarVozTTS() {
    function seleccionar() {
        const voces = speechSynthesis.getVoices();
        // Preferir voz LOCAL del sistema (respeta bien el rate) sobre voces de red (Google)
        const esLocales = voces.filter(v => v.lang && v.lang.startsWith('es') && v.localService);
        const esCualquiera = voces.filter(v => v.lang && v.lang.startsWith('es'));
        voiceES = esLocales.find(v => v.lang === 'es-ES')
               || esLocales[0]
               || esCualquiera.find(v => v.lang === 'es-ES')
               || esCualquiera[0]
               || null;
        if (voiceES) console.log('[ORAL] Voz seleccionada:', voiceES.name, '| local:', voiceES.localService);
    }
    seleccionar();
    if (!voiceES) {
        speechSynthesis.onvoiceschanged = seleccionar;
    }
}

async function cargarConfiguracion() {
    const configStr = localStorage.getItem('testConfig');
    if (!configStr) {
        alert('No hay configuración de test disponible');
        window.location.href = 'tests.html?section=aleatorio';
        return;
    }

    testConfig = JSON.parse(configStr);

    // Normalizar preguntas: asegurar respuestaCorrecta
    if (testConfig.preguntas) {
        testConfig.preguntas = testConfig.preguntas.map(p => {
            if (!p.respuestaCorrecta && p.opciones) {
                const correcta = p.opciones.find(op => op.esCorrecta === true);
                if (correcta) p.respuestaCorrecta = correcta.letra;
            }
            return p;
        });
    }

    document.getElementById('nombreTestOral').textContent = testConfig.nombreTest || 'Test Oral';

    // Reflejar la velocidad guardada en el botón
    const btnVel = document.getElementById('btnVelocidad');
    if (btnVel) btnVel.textContent = `⚡ Velocidad: ${velocidadVoz}x`;

    // Cronómetro si aplica
    if (testConfig.tiempoLimite && testConfig.tiempoLimite !== 'sin') {
        const minutos = parseInt(testConfig.tiempoLimite);
        if (!isNaN(minutos) && minutos > 0) {
            iniciarCronometro(minutos * 60);
            document.getElementById('oralCronometro').style.display = 'inline-block';
        }
    }

    // Pedir permisos de micrófono ANTES de inicializar el reconocedor
    setEstado('', '🎤', 'Comprobando permisos del micrófono...');
    const permisoOK = await solicitarPermisosMicrofono();
    if (!permisoOK) return;

    // Inicializar reconocedor
    crearReconocedor();

    // Arrancar
    mostrarPregunta();
}

async function solicitarPermisosMicrofono() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Tu navegador no soporta acceso al micrófono. Usa Chrome o Edge.');
        window.location.href = 'tests.html?section=aleatorio';
        return false;
    }
    try {
        console.log('[ORAL] Solicitando acceso al micrófono...');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Cerrar inmediatamente, solo queríamos el permiso
        stream.getTracks().forEach(t => t.stop());
        console.log('[ORAL] ✅ Permiso de micrófono concedido');
        return true;
    } catch (err) {
        console.error('[ORAL] ❌ Permiso de micrófono denegado:', err);
        alert(
            'No se ha podido acceder al micrófono.\n\n' +
            'Comprueba que:\n' +
            '1. Has dado permiso al navegador (icono 🔒 a la izquierda de la URL → Configuración del sitio → Micrófono → Permitir).\n' +
            '2. El micrófono está conectado y funcionando.\n' +
            '3. No hay otra aplicación usándolo en exclusiva.\n\n' +
            'Después recarga la página.'
        );
        window.location.href = 'tests.html?section=aleatorio';
        return false;
    }
}

// ============= CRONÓMETRO =============
function iniciarCronometro(segundos) {
    tiempoRestanteSegundos = segundos;
    actualizarDisplayCronometro();
    cronometroInterval = setInterval(() => {
        tiempoRestanteSegundos--;
        actualizarDisplayCronometro();
        if (tiempoRestanteSegundos <= 0) {
            clearInterval(cronometroInterval);
            finalizarTest(true);
        }
    }, 1000);
}

function actualizarDisplayCronometro() {
    const min = Math.floor(tiempoRestanteSegundos / 60);
    const seg = tiempoRestanteSegundos % 60;
    const el = document.getElementById('tiempoRestante');
    el.textContent = `${String(min).padStart(2,'0')}:${String(seg).padStart(2,'0')}`;
    if (tiempoRestanteSegundos <= 30) el.classList.add('warning');
}

// ============= TTS =============
function hablar(texto) {
    return new Promise((resolve) => {
        if (!texto) { resolve(); return; }
        // Resolver cualquier hablar() anterior huérfano para no dejarlo colgado
        if (resolverHablar) { const r = resolverHablar; resolverHablar = null; try { r(); } catch(_) {} }

        // Invalidar utterance anterior antes de cancelar (su onend no resolverá)
        utteranceActual = null;
        speechSynthesis.cancel();

        // Bloquear escucha y parar reconocedor por si acaso
        bloqueoEscucha = true;
        if (recognition && escuchando) {
            recibioResultado = true;
            try { recognition.abort(); } catch(_) {}
            escuchando = false;
        }

        textoLecturaActual = texto;
        resolverHablar = () => {
            bloqueoEscucha = false;
            utteranceActual = null;
            textoLecturaActual = '';
            resolverHablar = null;
            resolve();
        };

        lanzarUtterance(texto);
    });
}

// Lanza un SpeechSynthesisUtterance con la velocidad actual.
// Solo el utterance vivo en utteranceActual resolverá la promesa al terminar.
function lanzarUtterance(texto) {
    const ut = new SpeechSynthesisUtterance(texto);
    ut.lang = 'es-ES';
    ut.rate = velocidadVoz;
    ut.pitch = 1.0;
    if (voiceES) ut.voice = voiceES;

    ut.onend = () => {
        if (utteranceActual === ut && resolverHablar) resolverHablar();
    };
    ut.onerror = () => {
        if (utteranceActual === ut && resolverHablar) resolverHablar();
    };

    utteranceActual = ut;
    setEstado('hablando', '🔊', 'Leyendo...');
    speechSynthesis.speak(ut);
}

function pararTTS() {
    utteranceActual = null;
    speechSynthesis.cancel();
    if (resolverHablar) {
        const r = resolverHablar;
        resolverHablar = null;
        r();
    }
}

// Cambia la velocidad ciclando entre VELOCIDADES y la guarda en localStorage.
// Si está leyendo algo, relanza la MISMA frase a la nueva velocidad SIN liberar el bloqueo.
window.cambiarVelocidad = function() {
    const idxActual = VELOCIDADES.indexOf(velocidadVoz);
    const siguiente = VELOCIDADES[(idxActual + 1) % VELOCIDADES.length];
    velocidadVoz = siguiente;
    localStorage.setItem('oralVelocidadVoz', String(velocidadVoz));
    const btn = document.getElementById('btnVelocidad');
    if (btn) btn.textContent = `⚡ Velocidad: ${velocidadVoz}x`;

    // Si está leyendo algo: cancelar el utterance viejo y relanzar la misma frase a nueva velocidad,
    // manteniendo el bloqueo de escucha activo.
    if (textoLecturaActual && resolverHablar) {
        const texto = textoLecturaActual;
        utteranceActual = null;            // invalida el viejo: su onend ya no resolverá
        speechSynthesis.cancel();
        // Pequeño retardo para que cancel() asiente antes de speak()
        setTimeout(() => lanzarUtterance(texto), 60);
    }
};

// ============= STT (Reconocimiento) =============
function crearReconocedor() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.lang = 'es-ES';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;
    console.log('[ORAL] Reconocedor creado, lang:', recognition.lang);

    recognition.onstart = () => {
        console.log('[ORAL] 🎤 onstart - escuchando');
        escuchando = true;
        recibioResultado = false;
        setEstado('escuchando', '🎤', 'Escuchando tu respuesta...');
    };

    recognition.onresult = (event) => {
        recibioResultado = true;
        escuchando = false;
        // Recoger todas las alternativas del primer resultado
        const alternativas = [];
        if (event.results && event.results[0]) {
            for (let i = 0; i < event.results[0].length; i++) {
                alternativas.push(event.results[0][i].transcript);
            }
        }
        console.log('[ORAL] 📥 onresult - alternativas:', alternativas);
        const dichoMostrar = alternativas[0] || '';
        document.getElementById('transcriptValor').textContent = dichoMostrar || '—';

        // Si estoy esperando un sí/no para la explicación, otro flujo
        if (modoEscucha === 'siNo') {
            manejarSiNo(alternativas);
            return;
        }

        procesarTranscripts(alternativas);
    };

    recognition.onerror = (event) => {
        recibioResultado = true;
        escuchando = false;
        console.warn('[ORAL] ⚠️ onerror:', event.error);

       // En modo sí/no: si fue silencio, seguir escuchando; si fue otro error, dejar resolver
        if (modoEscucha === 'siNo') {
            if (event.error === 'no-speech' || event.error === 'audio-capture' || event.error === 'aborted') {
                reiniciarEscuchaSilencio();
            } else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                alert('Has bloqueado el acceso al micrófono. Permítelo en el navegador (icono 🔒 → Micrófono → Permitir) y recarga la página.');
                window.location.href = 'tests.html?section=aleatorio';
            } else {
                manejarSiNo([]);
            }
            return;
        }

        // 'no-speech' es habitual: el usuario todavía no ha hablado → seguir escuchando
        if (event.error === 'no-speech' || event.error === 'audio-capture' || event.error === 'aborted') {
            reiniciarEscuchaSilencio();
        } else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            alert('Has bloqueado el acceso al micrófono. Permítelo en el navegador (icono 🔒 → Micrófono → Permitir) y recarga la página.');
            window.location.href = 'tests.html?section=aleatorio';
        } else {
            // network, language-not-supported, bad-grammar, etc.
            console.error('[ORAL] Error inesperado:', event.error);
            reiniciarEscuchaSilencio();
        }
    };

    recognition.onend = () => {
        console.log('[ORAL] 🛑 onend - recibioResultado:', recibioResultado);
        escuchando = false;
        // Timeout silencioso de Chrome: el reconocimiento termina sin disparar
        // ni onresult ni onerror. Esto pasa cuando no se detecta NADA de audio.
        if (!recibioResultado && !pausado && !testFinalizado) {
            console.warn('[ORAL] Timeout silencioso detectado, reintentando...');
            // Seguimos escuchando indefinidamente en cualquier modo
            reiniciarEscuchaSilencio();
        }
    };
}

function iniciarReconocimiento() {
    if (pausado || testFinalizado) return;
    if (escuchando) {
        console.warn('[ORAL] iniciarReconocimiento llamado pero ya estoy escuchando, ignorado');
        return;
    }
    recibioResultado = false;
    try {
        console.log('[ORAL] → recognition.start()');
        recognition.start();
    } catch (e) {
        console.error('[ORAL] Error al start():', e);
        // Si ya estaba corriendo (InvalidStateError), abortar y reintentar
        try { recognition.abort(); } catch (_) {}
        setTimeout(() => {
            if (pausado || testFinalizado) return;
            try {
                console.log('[ORAL] → recognition.start() (reintento)');
                recognition.start();
            } catch (e2) {
                console.error('[ORAL] Error al reintentar start:', e2);
                setEstado('', '⚠️', 'Error con el micrófono. Pulsa Repetir.');
            }
        }, 500);
    }
}

function pararReconocimiento() {
    if (recognition) {
        recibioResultado = true; // Evita que onend dispare un reinicio automático
        try { recognition.abort(); } catch(_) {}
    }
    escuchando = false;
}

// ============= INTERPRETACIÓN =============
// Devuelve: { tipo: 'respuesta', letra: 'A' } | { tipo: 'comando', cmd: 'repetir'|... } | null
function interpretarTranscript(textoBruto) {
    if (!textoBruto) return null;
    const t = textoBruto.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar tildes
        .replace(/[.,!?¡¿"']/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    console.log('[ORAL] interpretando:', JSON.stringify(t));

    // ---- COMANDOS ----
    if (/\b(repetir|repite|repetelo|repetela|otra vez)\b/.test(t)) return { tipo: 'comando', cmd: 'repetir' };
    if (/\b(saltar|salta|siguiente|saltala|saltate|paso pregunta)\b/.test(t)) return { tipo: 'comando', cmd: 'saltar' };
    if (/\b(pausa|pausar|pausalo)\b/.test(t) && !/\bcontinua/.test(t)) return { tipo: 'comando', cmd: 'pausa' };
    if (/\b(continua|continuar|reanuda|reanudar|sigue)\b/.test(t)) return { tipo: 'comando', cmd: 'continuar' };
    if (/\b(salir|terminar|acabar|terminalo|finalizar)\b/.test(t)) return { tipo: 'comando', cmd: 'salir' };

    // ---- RESPUESTAS ----
    const pregunta = testConfig.preguntas[preguntaActual];
    const letrasValidas = (pregunta.opciones || [])
        .map(o => (o && o.letra ? String(o.letra).toUpperCase() : ''))
        .filter(Boolean);

    console.log('[ORAL] letras válidas:', letrasValidas);

    if (letrasValidas.length === 0) {
        console.warn('[ORAL] ⚠️ La pregunta no tiene opciones con letra:', pregunta.opciones);
        return null;
    }

    // Mapeo amplio (incluye errores típicos de Chrome en español)
    const mapeoLetras = {
        // A: "a", "ah", "ha", "ja"
        'a': 'A', 'ah': 'A', 'ha': 'A', 'ja': 'A', 'as': 'A',
        // B: "be", "b", "ve" (b y v suenan igual en español), "uve", "bebe"
        'b': 'B', 'be': 'B', 've': 'B', 'uve': 'B', 'bebe': 'B', 'vee': 'B',
        'be grande': 'B', 'b grande': 'B', 'be larga': 'B', 'b larga': 'B',
        've corta': 'B', 'v corta': 'B', 'uve corta': 'B',
        // C: "ce", "c", "se" (suenan igual en muchas zonas), "ese"
        'c': 'C', 'ce': 'C', 'se': 'C', 'ese': 'C', 'the': 'C', 'ze': 'C',
        // D: "de", "d"
        'd': 'D', 'de': 'D', 'di': 'D',
        // E: "e", "eh", "he"
        'e': 'E', 'eh': 'E', 'he': 'E', 'es': 'E',
    };

    // Ordinales y números
    const mapeoOrdinales = {
        'primera': 'A', 'primero': 'A', 'uno': 'A', 'una': 'A',
        'segunda': 'B', 'segundo': 'B', 'dos': 'B',
        'tercera': 'C', 'tercero': 'C', 'tres': 'C',
        'cuarta': 'D', 'cuarto': 'D', 'cuatro': 'D',
        'quinta': 'E', 'quinto': 'E', 'cinco': 'E',
    };

    // Limpiar palabras de relleno
    const limpio = t
        .replace(/^(creo que|yo digo|pondria|diria|seria|es la|es el)\s+/g, '')
        .replace(/\b(la|el|las|los|una|un|opcion|opciones|respuesta|letra|numero|es|seria|por|favor)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    console.log('[ORAL] texto limpio:', JSON.stringify(limpio));

    // 1) Match exacto del texto limpio entero
    if (mapeoLetras[limpio] && letrasValidas.includes(mapeoLetras[limpio])) {
        console.log('[ORAL] ✓ match letra:', mapeoLetras[limpio]);
        return { tipo: 'respuesta', letra: mapeoLetras[limpio] };
    }
    if (mapeoOrdinales[limpio] && letrasValidas.includes(mapeoOrdinales[limpio])) {
        console.log('[ORAL] ✓ match ordinal:', mapeoOrdinales[limpio]);
        return { tipo: 'respuesta', letra: mapeoOrdinales[limpio] };
    }

    // 2) Buscar palabra por palabra
    const palabras = limpio.split(/\s+/).filter(Boolean);
    for (const w of palabras) {
        if (mapeoLetras[w] && letrasValidas.includes(mapeoLetras[w])) {
            console.log('[ORAL] ✓ match palabra→letra:', w, '→', mapeoLetras[w]);
            return { tipo: 'respuesta', letra: mapeoLetras[w] };
        }
        if (mapeoOrdinales[w] && letrasValidas.includes(mapeoOrdinales[w])) {
            console.log('[ORAL] ✓ match palabra→ordinal:', w, '→', mapeoOrdinales[w]);
            return { tipo: 'respuesta', letra: mapeoOrdinales[w] };
        }
    }

    // 3) Última oportunidad: una sola letra a-e suelta en el texto bruto
    const matchSola = t.match(/(?:^|[\s.,])([a-e])(?:[\s.,]|$)/);
    if (matchSola) {
        const l = matchSola[1].toUpperCase();
        if (letrasValidas.includes(l)) {
            console.log('[ORAL] ✓ match letra suelta:', l);
            return { tipo: 'respuesta', letra: l };
        }
    }

    console.log('[ORAL] ✗ no interpretado');
    return null;
}

function procesarTranscripts(alternativas) {
    // Probar las alternativas en orden
    for (const alt of alternativas) {
        const interp = interpretarTranscript(alt);
        if (interp) {
            ejecutarInterpretacion(interp);
            return;
        }
    }
    // Llegó audio pero ninguna alternativa se pudo interpretar
    pedirRepetir();
}

async function ejecutarInterpretacion(interp) {
    if (interp.tipo === 'comando') {
        switch (interp.cmd) {
            case 'repetir':  await repetirPregunta(); return;
            case 'saltar':   saltarPregunta(); return;
            case 'pausa':    togglePausa(true); return;
            case 'continuar': togglePausa(false); return;
            case 'salir':    confirmarSalida(); return;
        }
    } else if (interp.tipo === 'respuesta') {
        await procesarRespuesta(interp.letra);
    }
}

// Reinicia el micrófono sin decir nada (cuando NO llegó audio del usuario)
function reiniciarEscuchaSilencio() {
    if (pausado || testFinalizado) return;
    if (bloqueoEscucha || speechSynthesis.speaking || speechSynthesis.pending) return;
    setEstado('escuchando', '🎤', 'Escuchando... habla cuando quieras');
    iniciarReconocimiento();
}

// Llegó audio pero no se pudo interpretar. Avisa la 1ª vez y cada 3 intentos,
// y sigue escuchando indefinidamente (nunca avanza solo).
async function pedirRepetir() {
    intentosReconocimiento++;
    if (intentosReconocimiento === 1 || intentosReconocimiento % 3 === 0) {
        await hablar('No te he entendido. Repite la respuesta, o di saltar para pasar.');
    }
    if (pausado || testFinalizado) return;
    iniciarReconocimiento();
}

// ============= FLUJO PREGUNTA =============
async function mostrarPregunta() {
    if (preguntaActual >= testConfig.preguntas.length) {
        finalizarTest(false);
        return;
    }

    intentosReconocimiento = 0;
    const p = testConfig.preguntas[preguntaActual];

    // Render texto y opciones
    document.getElementById('preguntaTexto').textContent = p.texto || '';
    document.getElementById('contadorPregunta').textContent =
        `Pregunta ${preguntaActual + 1} de ${testConfig.preguntas.length}`;

    const cont = document.getElementById('opcionesLista');
    cont.innerHTML = '';
    (p.opciones || []).forEach(op => {
        const div = document.createElement('div');
        div.className = 'oral-opcion';
        div.dataset.letra = op.letra;
        div.innerHTML = `
            <div class="oral-opcion-letra">${op.letra}</div>
            <div class="oral-opcion-texto">${op.texto || ''}</div>
        `;
        cont.appendChild(div);
    });

    // Barra de progreso
    const pct = (preguntaActual / testConfig.preguntas.length) * 100;
    document.getElementById('progresoBar').style.width = pct + '%';

    document.getElementById('transcriptValor').textContent = '—';

    // Leer y empezar a escuchar
    await leerPreguntaYOpciones(p);
    if (!pausado && !testFinalizado) iniciarReconocimiento();
}

function textoLectura(p) {
    let txt = `Pregunta ${preguntaActual + 1}. ${p.texto}. `;
    (p.opciones || []).forEach(op => {
        txt += `Opción ${op.letra}: ${op.texto}. `;
    });
    txt += 'Tu respuesta.';
    return txt;
}

async function leerPreguntaYOpciones(p) {
    await hablar(textoLectura(p));
}

async function procesarRespuesta(letra) {
    pararReconocimiento();

    const p = testConfig.preguntas[preguntaActual];
    const correcta = (p.respuestaCorrecta || '').toUpperCase();
    const esCorrecta = letra === correcta;

    // Marcar visualmente
    document.querySelectorAll('.oral-opcion').forEach(el => {
        const l = el.dataset.letra;
        if (l === correcta) el.classList.add('correcta');
        if (l === letra && !esCorrecta) el.classList.add('incorrecta');
        if (l === letra && esCorrecta) el.classList.add('elegida');
    });

    registrarRespuesta(letra, esCorrecta, true);

    if (esCorrecta) {
        setEstado('correcto', '✅', '¡Correcto!');
        const opCorrecta = (p.opciones || []).find(o => o.letra === correcta);
        const textoOK = `¡Correcto! La respuesta es la ${correcta}: ${opCorrecta ? opCorrecta.texto : ''}.`;
        await hablar(textoOK);
    } else {
        setEstado('incorrecto', '❌', 'Incorrecto');
        const opCorrecta = (p.opciones || []).find(o => o.letra === correcta);
        const textoFail = `Incorrecto. La respuesta correcta era la ${correcta}: ${opCorrecta ? opCorrecta.texto : ''}.`;
        await hablar(textoFail);
    }

    // Ofrecer la explicación apuntada si existe
    if (!testFinalizado) {
        await ofrecerExplicacion(p);
    }

    if (!pausado && !testFinalizado) siguientePregunta();
}

function registrarRespuesta(letra, esCorrecta, respondida) {
    // Asegurar que no haya duplicados para esta pregunta
    const idx = respuestas.findIndex(r => r.preguntaIndex === preguntaActual);
    const reg = {
        preguntaIndex: preguntaActual,
        letraUsuario: letra,
        esCorrecta: !!esCorrecta,
        respondida: !!respondida,
        pregunta: testConfig.preguntas[preguntaActual]
    };
    if (idx >= 0) respuestas[idx] = reg; else respuestas.push(reg);
    actualizarStats();
}

function actualizarStats() {
    const ok = respuestas.filter(r => r.esCorrecta).length;
    const fail = respuestas.filter(r => r.respondida && !r.esCorrecta).length;
    document.getElementById('statCorrectas').textContent = ok;
    document.getElementById('statIncorrectas').textContent = fail;
}

function siguientePregunta() {
    preguntaActual++;
    if (preguntaActual >= testConfig.preguntas.length) {
        finalizarTest(false);
    } else {
        mostrarPregunta();
    }
}

// ============= EXPLICACIÓN APUNTADA =============
// Hash idéntico al de tests-pregunta.js para compatibilidad
function obtenerHashPregunta(textoPregunta) {
    let hash = 0;
    const t = textoPregunta || '';
    for (let i = 0; i < t.length; i++) {
        const char = t.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return 'q_' + Math.abs(hash).toString(36);
}

// Devuelve el texto plano de la explicación, o null si no hay
async function cargarExplicacionGemini(pregunta) {
    if (!currentUser || !pregunta || !pregunta.texto) return null;
    try {
        const preguntaIdHash = obtenerHashPregunta(pregunta.texto);
        const docId = `${currentUser.uid}_${preguntaIdHash}`;
        const ref = doc(db, 'explicacionesGemini', docId);
        const snap = await getDoc(ref);
        if (snap.exists() && snap.data().texto) {
            return limpiarHtmlParaVoz(snap.data().texto);
        }
        return null;
    } catch (err) {
        console.warn('No se pudo cargar la explicación:', err);
        return null;
    }
}

function limpiarHtmlParaVoz(html) {
    if (!html) return '';
    // Sustituir saltos por puntos para que la voz haga pausas naturales
    let t = html
        .replace(/<br\s*\/?>/gi, '. ')
        .replace(/<\/p>/gi, '. ')
        .replace(/<\/div>/gi, '. ')
        .replace(/<\/li>/gi, '. ')
        .replace(/<[^>]+>/g, '')        // quitar el resto de etiquetas
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/\s*\.\s*\.\s*/g, '. ') // colapsar puntos duplicados
        .replace(/\s+/g, ' ')
        .trim();
    return t;
}

// Pregunta por voz si quiere oír la explicación. Devuelve true/false/null
async function escucharSiNo() {
    return new Promise((resolve) => {
        modoEscucha = 'siNo';
        resolverSiNo = (valor) => {
            modoEscucha = 'respuesta';
            resolverSiNo = null;
            resolve(valor);
        };
        // Sin timeout: el usuario decide cuándo responder
        iniciarReconocimiento();
    });
}

function manejarSiNo(alternativas) {
    if (!resolverSiNo) return;
    const dicho = (alternativas[0] || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[.,!?¡¿]/g, '')
        .trim();
    document.getElementById('transcriptValor').textContent = alternativas[0] || '—';

    // Si no hay texto, seguir escuchando
    if (!dicho) {
        if (!pausado && !testFinalizado) iniciarReconocimiento();
        return;
    }

    if (/\b(si|sip|claro|vale|venga|porfa|por favor|adelante|dale|ok|okey|afirmativo|leela|leelo|leemela|leemelo)\b/.test(dicho)) {
        resolverSiNo(true);
        return;
    }
    if (/\b(no|nope|negativo|paso|nada|salta|saltar|siguiente)\b/.test(dicho)) {
        resolverSiNo(false);
        return;
    }
    // Cualquier otra cosa: no avanzamos, seguimos escuchando
    if (!pausado && !testFinalizado) iniciarReconocimiento();
}
async function ofrecerExplicacion(pregunta) {
    setEstado('', '📖', 'Buscando explicación...');
    const explicacion = await cargarExplicacionGemini(pregunta);
    if (!explicacion) {
        // No hay explicación, seguimos sin más
        return;
    }
    await hablar('¿Quieres que te lea la explicación apuntada?');
    if (pausado || testFinalizado) return;

    const respuesta = await escucharSiNo();
    if (testFinalizado) return;

    if (respuesta === true) {
        setEstado('', '📖', 'Leyendo explicación...');
        await hablar(explicacion);
    } else {
        // No, null (no entendido) o cualquier otra cosa: pasamos
        await hablar('De acuerdo, pasamos.');
    }
}

// ============= CONTROLES (botones + comandos) =============
window.repetirPregunta = async function() {
    pararReconocimiento();
    pararTTS();
    const p = testConfig.preguntas[preguntaActual];
    intentosReconocimiento = 0;
    await leerPreguntaYOpciones(p);
    if (!pausado && !testFinalizado) iniciarReconocimiento();
};

window.saltarPregunta = function() {
    pararReconocimiento();
    pararTTS();
    if (resolverSiNo) resolverSiNo(null);
    registrarRespuesta(null, false, false);
    siguientePregunta();
};

window.togglePausa = function(forzado) {
    if (typeof forzado === 'boolean') {
        pausado = forzado;
    } else {
        pausado = !pausado;
    }
    const btn = document.getElementById('btnPausa');
    if (pausado) {
        pararReconocimiento();
        pararTTS();
        setEstado('', '⏸️', 'Pausado');
        btn.textContent = '▶️ Continuar';
    } else {
        btn.textContent = '⏸️ Pausa';
        // Releer y reanudar
        repetirPregunta();
    }
};

window.detenerTodo = function() {
    pararTTS();
    pararReconocimiento();
    setEstado('', '🔇', 'Voz detenida');
};

window.intentarSalir = function() {
    pararTTS();
    pararReconocimiento();
    document.getElementById('modalSalir').classList.add('activo');
};

window.cerrarModalSalir = function() {
    document.getElementById('modalSalir').classList.remove('activo');
    if (!pausado && !testFinalizado) {
        repetirPregunta();
    }
};

window.confirmarSalida = function() {
    testFinalizado = true;
    pararTTS();
    pararReconocimiento();
    if (resolverSiNo) resolverSiNo(null);
    if (cronometroInterval) clearInterval(cronometroInterval);
    document.getElementById('modalSalir').classList.remove('activo');
    finalizarTest(false);
};

window.volverAtests = function() {
    window.location.href = 'tests.html?section=aleatorio';
};

window.verResultados = function() {
    window.location.href = 'tests.html?section=resultados&mostrar=ultimo';
};

// ============= FINALIZAR =============
async function finalizarTest(porTiempo) {
    testFinalizado = true;
    pararTTS();
    pararReconocimiento();
    if (resolverSiNo) resolverSiNo(null);
    if (cronometroInterval) clearInterval(cronometroInterval);

    const total = testConfig.preguntas.length;
    const correctas = respuestas.filter(r => r.esCorrecta).length;
    const incorrectas = respuestas.filter(r => r.respondida && !r.esCorrecta).length;
    const noRespondidas = total - correctas - incorrectas;
    const porcentaje = total > 0 ? Math.round((correctas / total) * 100) : 0;

    // Fórmula oficial BOE PJC/1437/2024: acierto +0,60 / error -0,15 → divisor 4
    const penalizacion = incorrectas / DIVISOR_PENALIZACION;
    const aciertosNetos = correctas - penalizacion;
    const puntuacion100 = total > 0 ? Math.max(0, (aciertosNetos / total) * 100) : 0;
    const notaExamen = total > 0 ? Math.max(0, (aciertosNetos / total) * 60) : 0;

    // Tiempo empleado (si había límite)
    let tiempoEmpleado = 0;
    if (testConfig.tiempoLimite && testConfig.tiempoLimite !== 'sin') {
        const tiempoLimiteSegundos = parseInt(testConfig.tiempoLimite) * 60;
        tiempoEmpleado = Math.max(0, Math.floor((tiempoLimiteSegundos - tiempoRestanteSegundos) / 60));
    }

    // Construir detalleRespuestas con el MISMO formato que tests-pregunta.js
    const detalleRespuestas = testConfig.preguntas.map((pregunta, index) => {
        const r = respuestas.find(x => x.preguntaIndex === index);
        let estado = 'sin-respuesta';
        let respuestaLetra = null;
        if (r && r.respondida) {
            estado = r.esCorrecta ? 'correcta' : 'incorrecta';
            respuestaLetra = r.letraUsuario;
        }
        let respuestaCorrecta = pregunta.respuestaCorrecta;
        if (!respuestaCorrecta && pregunta.opciones) {
            const opCorrecta = pregunta.opciones.find(op => op.esCorrecta === true);
            if (opCorrecta) respuestaCorrecta = opCorrecta.letra;
        }
        return {
            pregunta: {
                texto: pregunta.texto || '',
                opciones: pregunta.opciones || [],
                respuestaCorrecta: respuestaCorrecta,
                temaId: pregunta.temaId || '',
                temaNombre: pregunta.temaNombre || '',
                temaEpigrafe: pregunta.temaEpigrafe || '',
                esOficial: pregunta.esOficial || false
            },
            respuestaUsuario: respuestaLetra,
            respuestaCorrecta: respuestaCorrecta,
            estado: estado,
            indice: index + 1
        };
    });

    // Objeto de resultados completo (formato compatible con la sección Resultados)
    const resultadosCompletos = {
        correctas: correctas,
        incorrectas: incorrectas,
        sinResponder: noRespondidas,
        total: total,
        porcentaje: porcentaje,
        tiempoEmpleado: tiempoEmpleado,
        modoTest: 'oral',
        test: {
            id: 'test_' + new Date().getTime() + '_' + Math.random().toString(36).substr(2, 9),
            nombre: testConfig.nombreTest || 'Test Oral',
            tema: testConfig.temas || 'todos',
            fechaInicio: new Date()
        },
        detalleRespuestas: detalleRespuestas,
        fechaCreacion: new Date(),
        usuarioId: currentUser.uid
    };

    // Pintar modal con stats (UX rápida)
    const grid = document.getElementById('resultadosGrid');
    grid.innerHTML = `
        <div class="resultado-item ok">
            <div class="resultado-label">Correctas</div>
            <div class="resultado-valor">${correctas}</div>
        </div>
        <div class="resultado-item fail">
            <div class="resultado-label">Incorrectas</div>
            <div class="resultado-valor">${incorrectas}</div>
        </div>
        <div class="resultado-item">
            <div class="resultado-label">Sin responder</div>
            <div class="resultado-valor">${noRespondidas}</div>
        </div>
        <div class="resultado-item">
            <div class="resultado-label">Penalización</div>
            <div class="resultado-valor">${penalizacion.toFixed(2)}</div>
        </div>
        <div class="resultado-item nota full">
            <div class="resultado-label">Puntuación sobre 100</div>
            <div class="resultado-valor">${puntuacion100.toFixed(2)}</div>
        </div>
        <div class="resultado-item nota full">
            <div class="resultado-label">Nota examen (sobre 60)</div>
            <div class="resultado-valor">${notaExamen.toFixed(2)}</div>
        </div>
    `;
    document.getElementById('comparativaOral')?.remove();
    grid.insertAdjacentHTML('afterend', generarBloqueComparativa(
        { correctas: correctas, incorrectas: incorrectas, total: total },
        'comparativaOral'
    ));
    document.getElementById('modalResultados').classList.add('activo');

    // Guardar en Firebase y hablar el cierre EN PARALELO
    const mensaje = porTiempo
        ? `Se acabó el tiempo. Has acertado ${correctas} de ${total}. Tu nota es ${notaExamen.toFixed(1)} sobre 60.`
        : `Test finalizado. Has acertado ${correctas} de ${total}. Tu nota es ${notaExamen.toFixed(1)} sobre 60.`;

    await Promise.all([
        hablar(mensaje),
        guardarResultadosEnFirebase(resultadosCompletos, detalleRespuestas).catch(err => {
            console.error('Error guardando resultados oral:', err);
        })
    ]);
}

// ============= ESTADO VISUAL =============
function setEstado(clase, icono, texto) {
    const estado = document.getElementById('oralEstado');
    estado.classList.remove('hablando', 'escuchando', 'correcto', 'incorrecto');
    if (clase) estado.classList.add(clase);
    document.getElementById('estadoIcono').textContent = icono;
    document.getElementById('estadoTexto').textContent = texto;
}

// ============= GUARDADO EN FIREBASE =============
// Patrón idéntico al de tests-pregunta.js para integración total con la sección de Resultados

async function guardarResultadosEnFirebase(resultadosCompletos, detalleRespuestas) {
    // 1. Guardar resultado del test
    await addDoc(collection(db, 'resultados'), resultadosCompletos);
    console.log('✅ Resultado del test oral guardado en Firebase');

    // 2. Si es test de REPASO, eliminar las preguntas acertadas de preguntasFalladas
    if (testConfig.esRepaso) {
        const acertadas = detalleRespuestas.filter(d => d.estado === 'correcta');
        if (acertadas.length > 0) {
            const q = query(collection(db, 'preguntasFalladas'), where('usuarioId', '==', currentUser.uid));
            const snap = await getDocs(q);
            const eliminaciones = [];
            snap.forEach(docSnap => {
                const data = docSnap.data();
                if (data.pregunta && acertadas.some(a => a.pregunta.texto === data.pregunta.texto)) {
                    eliminaciones.push(deleteDoc(doc(db, 'preguntasFalladas', docSnap.id)));
                }
            });
            await Promise.all(eliminaciones);
            console.log(`Eliminadas ${eliminaciones.length} de preguntasFalladas (test repaso)`);
        }
    }

    // 3. Guardar preguntas acertadas como "dominadas" (ocultas del ranking de fallos)
    const acertadasDominadas = detalleRespuestas.filter(d => d.estado === 'correcta');
    if (acertadasDominadas.length > 0) {
        const dominadasRef = doc(db, 'preguntasDominadas', currentUser.uid);
        const dominadasDoc = await getDoc(dominadasRef);
        let lista = [];
        if (dominadasDoc.exists()) lista = dominadasDoc.data().preguntas || [];
        acertadasDominadas.forEach(a => {
            const txt = (a.pregunta.texto || '').trim();
            if (txt && !lista.includes(txt)) lista.push(txt);
        });
        await setDoc(dominadasRef, { preguntas: lista, ultimaActualizacion: new Date() });
    }

    // 4. Si hay fallos, quitarlas de "dominadas" para que reaparezcan en el ranking
    const falladas = detalleRespuestas.filter(d => d.estado === 'incorrecta');
    if (falladas.length > 0) {
        try {
            const dominadasRef = doc(db, 'preguntasDominadas', currentUser.uid);
            const dominadasDoc = await getDoc(dominadasRef);
            if (dominadasDoc.exists()) {
                let lista = dominadasDoc.data().preguntas || [];
                const antes = lista.length;
                lista = lista.filter(txt => !falladas.some(f => (f.pregunta.texto || '').trim() === txt));
                if (lista.length < antes) {
                    await setDoc(dominadasRef, { preguntas: lista, ultimaActualizacion: new Date() });
                }
            }
        } catch (err) {
            console.error('Error actualizando dominadas:', err);
        }
    }

    // 5. Guardar preguntas falladas para el test de repaso (si no es ranking)
    if (falladas.length > 0 && !testConfig.esRanking) {
        const promesas = falladas.map(d => {
            let respuestaCorrecta = d.respuestaCorrecta;
            if (!respuestaCorrecta && d.pregunta.opciones) {
                const op = d.pregunta.opciones.find(o => o.esCorrecta === true);
                if (op) respuestaCorrecta = op.letra;
            }
            return addDoc(collection(db, 'preguntasFalladas'), {
                usuarioId: currentUser.uid,
                pregunta: {
                    texto: d.pregunta.texto,
                    opciones: d.pregunta.opciones,
                    respuestaCorrecta: respuestaCorrecta,
                    temaId: d.pregunta.temaId || '',
                    temaNombre: d.pregunta.temaNombre || '',
                    temaEpigrafe: d.pregunta.temaEpigrafe || ''
                },
                respuestaUsuario: d.respuestaUsuario,
                estado: d.estado,
                fechaFallo: new Date(),
                testId: resultadosCompletos.test.id,
                testNombre: resultadosCompletos.test.nombre
            });
        });
        await Promise.all(promesas);
        console.log(`${falladas.length} preguntas falladas guardadas para repaso (modo oral)`);
    }

    // 6. Registrar en progresoSimple para el progreso por tema
    const temasUtilizados = [...new Set(
        testConfig.preguntas.map(p => p.temaIdProgreso || p.temaId).filter(Boolean)
    )];
    if (temasUtilizados.length > 0) {
        await registrarTestEnProgresoSimple(temasUtilizados);
    }

    // 7. Limpiar localStorage y caché
    localStorage.removeItem('testConfig');
    sessionStorage.removeItem('cacheResultados');
    sessionStorage.removeItem('cacheResultadosTimestamp');

    // 8. Dejar disponible el último resultado para la sección de Resultados
    localStorage.setItem('ultimosResultados', JSON.stringify(resultadosCompletos));
}

function normalizarNombreTema(nombre) {
    return (nombre || '')
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

async function buscarTemaEnPlanningPorNombre(nombreBanco) {
    try {
        const planningDoc = await getDoc(doc(db, 'planningSimple', currentUser.uid));
        if (!planningDoc.exists()) return null;
        const planningData = planningDoc.data();
        if (!planningData.temas || planningData.temas.length === 0) return null;
        const nombreNorm = normalizarNombreTema(nombreBanco);
        return planningData.temas.find(t => normalizarNombreTema(t.nombre) === nombreNorm) || null;
    } catch (err) {
        console.error('Error buscando tema en planning:', err);
        return null;
    }
}

async function registrarTestEnProgresoSimple(temasUtilizados) {
    try {
        const temasUnicos = [...new Set(temasUtilizados)];
        const infoCompleta = await Promise.all(temasUnicos.map(async (idBanco) => {
            const tDoc = await getDoc(doc(db, 'temas', idBanco));
            if (!tDoc.exists()) return null;
            const data = tDoc.data();
            const planning = await buscarTemaEnPlanningPorNombre(data.nombre);
            return {
                idBanco,
                nombreBanco: data.nombre,
                padre: data.temaPadreId || null,
                temaPlanning: planning
            };
        }));
        const info = infoCompleta.filter(t => t !== null);
        if (info.length === 0) return;

        const padres = info.map(t => t.padre).filter(p => p !== null);
        const todosMismoPadre = padres.length === info.length && padres.length > 0 && padres.every(p => p === padres[0]);
        const temaPadre = todosMismoPadre ? padres[0] : null;

        const progresoRef = doc(db, 'progresoSimple', currentUser.uid);
        const progresoDoc = await getDoc(progresoRef);
        if (!progresoDoc.exists()) return;

        let progresoData = progresoDoc.data();
        if (!progresoData.temas) progresoData.temas = {};
        if (!progresoData.registros) progresoData.registros = [];

        const esMix = info.length > 1 && !todosMismoPadre;
        const fechaHoy = new Date();

        if (esMix) {
            progresoData.registros.push({
                fecha: fechaHoy,
                temaId: 'mix',
                hojasLeidas: 0,
                testsRealizados: 1,
                temasMix: temasUnicos
            });
        } else {
            let temaInfo = info[0];
            if (todosMismoPadre && temaPadre) {
                const padreDoc = await getDoc(doc(db, 'temas', temaPadre));
                if (padreDoc.exists()) {
                    const nombrePadre = padreDoc.data().nombre;
                    const planningPadre = await buscarTemaEnPlanningPorNombre(nombrePadre);
                    temaInfo = { idBanco: temaPadre, nombreBanco: nombrePadre, temaPlanning: planningPadre };
                }
            }
            let temaIdFinal, nombreFinal, hojasTotales = 0;
            if (temaInfo.temaPlanning) {
                temaIdFinal = temaInfo.temaPlanning.id;
                nombreFinal = temaInfo.temaPlanning.nombre;
                hojasTotales = temaInfo.temaPlanning.hojas || 0;
            } else {
                temaIdFinal = temaInfo.idBanco;
                nombreFinal = temaInfo.nombreBanco;
            }
            if (!progresoData.temas[temaIdFinal]) {
                progresoData.temas[temaIdFinal] = {
                    nombre: nombreFinal,
                    hojasTotales: hojasTotales,
                    hojasLeidas: 0,
                    testsRealizados: 0
                };
            }
            progresoData.temas[temaIdFinal].testsRealizados =
                (progresoData.temas[temaIdFinal].testsRealizados || 0) + 1;
            progresoData.registros.push({
                fecha: fechaHoy,
                temaId: temaIdFinal,
                hojasLeidas: 0,
                testsRealizados: 1
            });
        }

        await setDoc(progresoRef, progresoData);
        console.log('✅ Test oral registrado en progresoSimple');
    } catch (err) {
        console.error('❌ Error registrando test oral en progresoSimple:', err);
    }
}

// Antes de cerrar la pestaña, parar todo
window.addEventListener('beforeunload', () => {
    pararTTS();
    pararReconocimiento();
    if (cronometroInterval) clearInterval(cronometroInterval);
});
