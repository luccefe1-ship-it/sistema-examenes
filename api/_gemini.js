// ============================================================
//  /api/_gemini.js
//  Utilidades para hablar con la API de Gemini (Google).
//
//  Por qué existe: procesar preguntas es una tarea de COPIAR
//  BIEN, no de razonar. Gemini Flash lo hace igual que un modelo
//  caro y su cupo gratuito diario sobra de largo para el uso de
//  la plataforma, así que subir preguntas no cuesta dinero.
//
//  Requiere la variable de entorno GEMINI_API_KEY en Vercel.
//  Se puede añadir GEMINI_API_KEY_2 como segunda cuenta: si la
//  primera agota su cupo del día, se pasa a la siguiente sola.
//
//  Los archivos que empiezan por "_" no son endpoints: Vercel
//  los ignora al crear rutas.
// ============================================================

// El control de origen y método es genérico (no tiene nada de
// Claude), así que se reutiliza el que ya estaba escrito en vez
// de duplicarlo. Se reexporta abajo para que los endpoints que
// usan Gemini no tengan que saber de dónde sale.
const { peticionValida } = require('./_claude');

const RAIZ = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_REINTENTOS = 3;

// Modelos a probar, en orden. Google renombra y jubila modelos
// cada pocos meses; si el primero ya no existe se pasa al
// siguiente en vez de dejar la plataforma muerta.
// Se puede forzar uno concreto con la variable GEMINI_MODELO.
function modelosDisponibles() {
    const forzado = (process.env.GEMINI_MODELO || '').trim();
    const lista = [
        'gemini-flash-latest',
        'gemini-2.5-flash',
        'gemini-2.0-flash'
    ];
    return forzado ? [forzado, ...lista.filter(m => m !== forzado)] : lista;
}

// ------------------------------------------------------------
//  Claves disponibles, en orden de consumo
// ------------------------------------------------------------
function obtenerClaves() {
    return [
        { nombre: 'Google 1', clave: process.env.GEMINI_API_KEY },
        { nombre: 'Google 2', clave: process.env.GEMINI_API_KEY_2 }
    ].filter(c => c.clave && c.clave.trim());
}

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 429 = cupo agotado (o demasiadas peticiones por minuto).
// 500/502/503 = Google de mal día. En ambos casos se reintenta.
function esTemporal(estado) {
    return estado === 429 || estado === 500 || estado === 502 || estado === 503;
}

// Clave mal puesta o revocada -> no insistas, prueba la siguiente
function claveInvalida(estado, detalle) {
    if (estado === 401 || estado === 403) return true;
    const texto = String(detalle || '').toLowerCase();
    return texto.includes('api_key_invalid') || texto.includes('api key not valid');
}

// El modelo del que hablamos ya no existe en esta cuenta
function modeloNoExiste(estado, detalle) {
    const texto = String(detalle || '').toLowerCase();
    return estado === 404 || texto.includes('not found for api version') || texto.includes('is not supported');
}

/* Distingue "se acabó el cupo del día" de "vas muy rápido".

   CUIDADO CON ESTO. La primera versión daba por agotado el cupo diario en
   cuanto el error contenía "quota_limit_value", y ese campo viene en
   PRÁCTICAMENTE TODOS los 429 de Google, incluidos los de límite por
   minuto. Resultado: a la que dos peticiones iban demasiado seguidas, la
   plataforma anunciaba que no quedaba cupo hasta el día siguiente.

   Lo único que distingue de verdad un límite del otro es el identificador
   de la cuota, que dice explícitamente si es PerDay o PerMinute. */
function cupoDiarioAgotado(detalle) {
    const texto = String(detalle || '').toLowerCase().replace(/[\s_-]/g, '');
    return texto.includes('perday');
}

// Solo se ha ido por encima del ritmo permitido: se espera y se reintenta
function ritmoExcedido(estado, detalle) {
    if (estado !== 429) return false;
    return !cupoDiarioAgotado(detalle);
}

// Saca el motivo que da Google, para poder enseñarlo en vez de adivinar
function motivoDeGoogle(detalle) {
    try {
        const json = JSON.parse(detalle);
        const mensaje = json && json.error && json.error.message;
        if (mensaje) return String(mensaje).slice(0, 200);
    } catch (e) { /* el error no venía en JSON */ }
    return String(detalle || '').slice(0, 200);
}

// ------------------------------------------------------------
//  Cuerpo de la petición.
//
//  Se monta en tres versiones de menos a más conservadora. Si
//  Google rechaza una opción (porque el modelo de turno no la
//  admite), se prueba la siguiente en vez de fallar. Así el
//  código sobrevive a cambios de modelo sin tocar nada.
// ------------------------------------------------------------
function montarCuerpos({ instrucciones, prompt, esquema, maxTokens }) {
    const base = {
        systemInstruction: { parts: [{ text: instrucciones }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0,               // sin creatividad: queremos transcripción fiel
            maxOutputTokens: maxTokens,
            responseMimeType: 'application/json',
            responseSchema: esquema
        }
    };

    // Los temarios de oposiciones (penal, violencia de género, delitos)
    // pueden disparar los filtros de contenido. Se desactivan: es
    // material de estudio oficial.
    const sinFiltros = {
        ...base,
        safetySettings: [
            'HARM_CATEGORY_HARASSMENT',
            'HARM_CATEGORY_HATE_SPEECH',
            'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            'HARM_CATEGORY_DANGEROUS_CONTENT'
        ].map(category => ({ category, threshold: 'BLOCK_NONE' }))
    };

    // Extraer preguntas no requiere que el modelo "piense" antes de
    // responder: es más rápido y gasta menos cupo sin razonamiento.
    const sinPensar = {
        ...sinFiltros,
        generationConfig: { ...sinFiltros.generationConfig, thinkingConfig: { thinkingBudget: 0 } }
    };

    return [sinPensar, sinFiltros, base];
}

// ------------------------------------------------------------
//  Llamada a la API, con reintentos, cambio de clave y cambio
//  de modelo. Devuelve el JSON ya parseado del contenido.
// ------------------------------------------------------------
async function llamarGemini({ instrucciones, prompt, esquema, maxTokens = 32000 }) {
    const claves = obtenerClaves();
    if (claves.length === 0) {
        throw new Error('Falta la variable de entorno GEMINI_API_KEY en Vercel.');
    }

    const cuerpos = montarCuerpos({ instrucciones, prompt, esquema, maxTokens });
    const fallos = [];
    let sinCupo = 0;
    let ritmo = false;
    let ultimoMotivo = '';

    // Tres bucles anidados, de fuera adentro:
    //   clave  -> si una está caducada o sin cupo, se prueba la otra
    //   modelo -> si Google ha jubilado uno, se prueba el siguiente
    //   cuerpo -> si el modelo no admite una opción, se simplifica
    siguienteClave:
    for (const clave of claves) {
        for (const modelo of modelosDisponibles()) {
            let modeloVivo = true;

            for (let variante = 0; variante < cuerpos.length && modeloVivo; variante++) {

                for (let reintento = 0; reintento <= MAX_REINTENTOS; reintento++) {
                    const intento = await fetch(`${RAIZ}/${modelo}:generateContent`, {
                        method: 'POST',
                        headers: {
                            'content-type': 'application/json',
                            'x-goog-api-key': clave.clave.trim()
                        },
                        body: JSON.stringify(cuerpos[variante])
                    });

                    if (intento.ok) {
                        const data = await intento.json();
                        return { ...interpretarRespuesta(data), modelo, cuenta: clave.nombre };
                    }

                    const detalle = await intento.text();
                    fallos.push(`${clave.nombre}/${modelo}: ${intento.status} ${detalle.slice(0, 160)}`);

                    if (modeloNoExiste(intento.status, detalle)) {
                        modeloVivo = false;
                        break;
                    }

                    if (claveInvalida(intento.status, detalle)) {
                        console.warn(`[gemini] Clave ${clave.nombre} no válida, probando la siguiente.`);
                        continue siguienteClave;
                    }

                    // Cupo del día agotado de verdad: con esta clave no hay
                    // nada que hacer hasta la noche, se pasa a la siguiente.
                    if (cupoDiarioAgotado(detalle)) {
                        console.warn(`[gemini] Cupo diario agotado en ${clave.nombre}: ${motivoDeGoogle(detalle)}`);
                        sinCupo++;
                        ultimoMotivo = motivoDeGoogle(detalle);
                        continue siguienteClave;
                    }

                    // Ir demasiado rápido NO es quedarse sin cupo: se espera
                    // lo que pida Google y se vuelve a intentar.
                    if (esTemporal(intento.status) && reintento < MAX_REINTENTOS) {
                        // Google dice cuánto esperar en el cuerpo del error; si no, se dobla la espera
                        const sugerido = /"retryDelay"\s*:\s*"(\d+)s"/.exec(detalle);
                        const pausa = sugerido
                            ? Math.min(parseInt(sugerido[1], 10) * 1000, 12000)
                            : 2000 * Math.pow(2, reintento);
                        console.warn(`[gemini] ${intento.status}, reintento ${reintento + 1} en ${pausa} ms.`);
                        await esperar(pausa);
                        continue;
                    }

                    // Se agotaron los reintentos y seguía siendo cuestión de ritmo
                    if (ritmoExcedido(intento.status, detalle)) {
                        ritmo = true;
                        ultimoMotivo = motivoDeGoogle(detalle);
                        break;
                    }

                    // 400 u otro error del cuerpo: se prueba la variante más simple
                    break;
                }
            }
        }
    }

    if (sinCupo > 0) {
        const error = new Error(
            'Se ha agotado el cupo gratuito de Google por hoy. Se reinicia cada noche; ' +
            'mientras tanto puedes subir las preguntas mañana o añadir una segunda clave. ' +
            `(Google dice: ${ultimoMotivo})`
        );
        error.cupoAgotado = true;
        throw error;
    }

    if (ritmo) {
        const error = new Error(
            'Google está limitando el ritmo de peticiones. NO es que se haya acabado el cupo del día: ' +
            'espera un minuto y vuelve a darle a Procesar. ' +
            `(Google dice: ${ultimoMotivo})`
        );
        error.ritmo = true;
        throw error;
    }

    throw new Error(`Gemini no pudo procesar la petición. ${fallos.slice(-3).join(' | ')}`);
}

// ------------------------------------------------------------
//  Saca el JSON de la respuesta y traduce los fallos típicos
// ------------------------------------------------------------
function interpretarRespuesta(data) {
    if (data.promptFeedback && data.promptFeedback.blockReason) {
        throw new Error(`Google ha bloqueado el contenido (${data.promptFeedback.blockReason}).`);
    }

    const candidato = (data.candidates || [])[0];
    if (!candidato) throw new Error('Gemini no ha devuelto ninguna respuesta.');

    if (candidato.finishReason === 'MAX_TOKENS') {
        throw new Error('La respuesta se cortó por longitud. Reduce PREGUNTAS_POR_LOTE.');
    }
    if (candidato.finishReason === 'SAFETY' || candidato.finishReason === 'PROHIBITED_CONTENT') {
        throw new Error('Google ha bloqueado este fragmento por sus filtros de contenido.');
    }

    const texto = (candidato.content && candidato.content.parts || [])
        .map(p => p.text || '')
        .join('');

    if (!texto.trim()) throw new Error('Gemini ha devuelto una respuesta vacía.');

    let json;
    try {
        json = JSON.parse(texto);
    } catch (e) {
        throw new Error('Gemini no ha devuelto un JSON válido.');
    }

    const uso = data.usageMetadata || {};
    return {
        json,
        uso: {
            tokensEntrada: uso.promptTokenCount || 0,
            tokensSalida: uso.candidatesTokenCount || 0
        }
    };
}

module.exports = {
    peticionValida,
    obtenerClaves,
    llamarGemini
};
