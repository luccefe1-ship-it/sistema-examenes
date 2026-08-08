// ============================================================
//  /api/_gemini.js
//  Utilidades para hablar con la API de Gemini (Google).
//
//  Por qué existe: procesar preguntas es una tarea de COPIAR
//  BIEN, no de razonar. Gemini Flash lo hace igual que un modelo
//  caro y es gratis, así que subir preguntas no cuesta dinero.
//
//  EL CUPO GRATUITO ES PEQUEÑO: 20 peticiones al día por modelo y
//  5 por minuto. Y Google descuenta también las que fallan. Todo
//  este archivo está escrito con esa idea en la cabeza: no gastar
//  una petición que no vaya a servir para nada.
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

/* Reintentos deliberadamente cortos: en el plan gratuito cada petición
   cuenta contra el cupo AUNQUE FALLE, así que insistir es tirar cupo. */
const MAX_REINTENTOS_RITMO = 1;   // 429 por ir rápido: una segunda oportunidad
const MAX_REINTENTOS_CAIDA = 2;   // 5xx: culpa de Google, ahí sí se insiste

// Google dice en el error cuánto conviene esperar; si no, se dobla la espera
function pausaSugerida(detalle, intento) {
    const sugerido = /"retryDelay"\s*:\s*"(\d+)s"/.exec(String(detalle || ''));
    return sugerido
        ? Math.min(parseInt(sugerido[1], 10) * 1000, 15000)
        : Math.min(3000 * Math.pow(2, intento - 1), 15000);
}

/* Modelos a probar, en orden. Se puede forzar uno concreto con la
   variable de entorno GEMINI_MODELO.

   OJO CON EL ORDEN. El cupo gratuito va POR MODELO, y no todos tienen.
   Los alias tipo "-latest" apuntan siempre al modelo más nuevo, y los
   modelos recién salidos suelen entrar SIN cupo gratuito: se paga desde
   la primera petición. Poniendo "gemini-flash-latest" el primero, la
   plataforma pedía a un modelo de pago y Google respondía "cuota diaria
   agotada" ya en la primera llamada del día.

   Por eso van delante las versiones concretas y veteranas, que son las
   que tienen cupo gratuito de sobra, y los alias quedan de último
   recurso por si algún día jubilan a las demás.

   Además el orden hace de cascada: si se agota el cupo diario de la
   primera, se sigue con la siguiente sin que te enteres. */
function modelosDisponibles() {
    const forzado = (process.env.GEMINI_MODELO || '').trim();
    /* Solo modelos que existen de verdad en el plan gratuito. Los
       Gemini 2.0 estaban aquí y NO aparecen en el panel de límites: no
       existen ya para las cuentas nuevas. Google no responde 404 a esos,
       responde 429 diciendo que no hay cupo, así que cada intento gastaba
       una petición del cupo real para nada. */
    const lista = [
        'gemini-2.5-flash',        // equilibrio calidad/cupo
        'gemini-2.5-flash-lite',   // menos fina, pero admite más por minuto
        'gemini-flash-latest'      // el más nuevo; cupo pequeño, va de reserva
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
    // Si se puede leer la violación concreta, se mira ESA y no el texto
    // entero: un mismo error puede traer varias violaciones a la vez, y
    // buscar "perday" en todo el cuerpo daba por agotado el día cuando lo
    // que se había pasado era el límite de tokens por minuto.
    const cuota = detalleDeCuota(detalle);
    if (cuota) return /perday/i.test(cuota.id.replace(/[\s_-]/g, ''));

    const texto = String(detalle || '').toLowerCase().replace(/[\s_-]/g, '');
    return texto.includes('perday');
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

/* Saca qué cuota concreta se ha pasado y cuánto valía.

   Es la diferencia entre "te has gastado tus 250 peticiones de hoy" y
   "este modelo no tiene plan gratuito y tu límite es 0". Las dos cosas
   llegan como el mismo 429 con el mismo texto, y solo se distinguen
   mirando el valor de la cuota. Sin esto no hay forma de saber si hay
   que esperar a mañana o cambiar de modelo. */
function detalleDeCuota(detalle) {
    try {
        const json = JSON.parse(detalle);
        const bloques = (json && json.error && json.error.details) || [];

        const todas = [];
        for (const bloque of bloques) {
            for (const violacion of (bloque.violations || [])) {
                if (violacion && violacion.quotaId) {
                    todas.push({
                        id: violacion.quotaId,
                        valor: violacion.quotaValue !== undefined ? String(violacion.quotaValue) : '?'
                    });
                }
            }
        }
        if (todas.length === 0) return null;

        // Si hay varias violaciones, manda la diaria: es la que de verdad
        // deja el modelo inservible hasta mañana. Las de por minuto se
        // arreglan solas esperando.
        return todas.find(c => /perday/i.test(c.id.replace(/[\s_-]/g, ''))) || todas[0];
    } catch (e) { /* el error no venía en JSON */ }
    return null;
}

// Formatea la cuota para enseñársela al usuario
function textoDeCuota(cuota) {
    if (!cuota) return '';
    return cuota.valor === '0'
        ? ` — este modelo NO tiene plan gratuito (tu límite es 0)`
        : ` — límite ${cuota.valor} (${cuota.id})`;
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
    const diagnostico = [];   // qué le pasa a cada modelo, para poder enseñarlo
    const cuotaDiaria = [];   // solo los que se han quedado sin cupo del DÍA
    let sinCupo = 0;
    let ritmo = false;
    let ultimoMotivo = '';

    // Tres bucles anidados, de fuera adentro:
    //   clave  -> si una está caducada, se prueba la otra
    //   modelo -> si uno ya no existe o se quedó sin cupo, el siguiente
    //   cuerpo -> si el modelo no admite una opción, se simplifica
    siguienteClave:
    for (const clave of claves) {
        const modelos = modelosDisponibles();
        let modelosSinCupo = 0;

        siguienteModelo:
        for (const modelo of modelos) {
            let variante = 0;
            let reintentosRitmo = 0;
            let reintentosCaida = 0;

            /* REGLA DE ORO DE ESTE BUCLE: cada vuelta es UNA petición a
               Google, y Google descuenta del cupo TODAS las peticiones,
               también las que fallan. Con 20 al día, insistir sale
               carísimo. Así que solo se repite cuando repetir puede
               cambiar el resultado.

               La versión anterior probaba 3 variantes de cuerpo con 4
               intentos cada una: hasta 12 peticiones por modelo. Con eso
               se fundía el cupo de un día entero en un solo documento. */
            while (variante < cuerpos.length) {
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

                // El modelo no existe: no insistas, no gastes más
                if (modeloNoExiste(intento.status, detalle)) {
                    diagnostico.push(`${modelo}: no disponible`);
                    continue siguienteModelo;
                }

                if (claveInvalida(intento.status, detalle)) {
                    console.warn(`[gemini] Clave ${clave.nombre} no válida, probando la siguiente.`);
                    continue siguienteClave;
                }

                if (intento.status === 429) {
                    const cuota = detalleDeCuota(detalle);
                    ultimoMotivo = motivoDeGoogle(detalle);

                    /* Cupo del día agotado. El cupo es POR MODELO, así que
                       esto no deja inservible la clave: se pasa al siguiente
                       modelo, que tiene el suyo. Reintentar aquí no sirve de
                       nada y encima gasta. */
                    if (cupoDiarioAgotado(detalle)) {
                        console.warn(`[gemini] Sin cupo diario en ${modelo} (${clave.nombre})${textoDeCuota(cuota)}.`);
                        modelosSinCupo++;
                        const linea = `${modelo}${textoDeCuota(cuota) || ': sin cupo'}`;
                        diagnostico.push(linea);
                        cuotaDiaria.push(linea);
                        continue siguienteModelo;
                    }

                    // Solo cuestión de ritmo: se espera lo que pida Google y
                    // se prueba UNA vez más. Si vuelve a fallar, a otro modelo.
                    if (reintentosRitmo < MAX_REINTENTOS_RITMO) {
                        reintentosRitmo++;
                        const pausa = pausaSugerida(detalle, reintentosRitmo);
                        console.warn(`[gemini] Ritmo excedido en ${modelo}, esperando ${pausa} ms.`);
                        await esperar(pausa);
                        continue;
                    }

                    ritmo = true;
                    diagnostico.push(`${modelo}: límite por minuto`);
                    continue siguienteModelo;
                }

                // Google caído o saturado: no es culpa nuestra, se reintenta
                if (intento.status >= 500 && reintentosCaida < MAX_REINTENTOS_CAIDA) {
                    reintentosCaida++;
                    await esperar(pausaSugerida(detalle, reintentosCaida));
                    continue;
                }

                // 400: el modelo no admite alguna opción del cuerpo. Es el
                // ÚNICO caso en que cambiar el cuerpo puede arreglarlo.
                if (intento.status === 400) {
                    variante++;
                    continue;
                }

                continue siguienteModelo;
            }
        }

        // Ningún modelo de esta clave tiene cupo hoy: se prueba la siguiente
        if (modelosSinCupo >= modelos.length) {
            console.warn(`[gemini] La clave ${clave.nombre} se ha quedado sin cupo en todos los modelos.`);
            sinCupo++;
        }
    }

    /* Si ningún modelo respondió y alguno dijo que no le queda cupo diario,
       el problema es de cuota, aunque otros modelos fallaran por otra cosa
       (por ejemplo, que ya no existan). Antes se exigía que TODOS fallasen
       por cuota, y bastaba con un 404 de un modelo jubilado para que el
       usuario recibiera un error genérico ilegible en vez de esta
       explicación. */
    if (cuotaDiaria.length > 0) {
        const sinPlanGratuito = cuotaDiaria.filter(d => d.includes('NO tiene plan gratuito'));

        const error = new Error(
            sinPlanGratuito.length === cuotaDiaria.length
                ? 'Tu clave de Google no tiene plan gratuito en ninguno de los modelos que usa la plataforma. ' +
                  'Mira qué modelos tienes disponibles en aistudio.google.com/rate-limit y dime cuál, ' +
                  'o activa la facturación. Detalle: ' + cuotaDiaria.join(' · ')
                : 'Se ha agotado el cupo gratuito de Google por hoy en los modelos disponibles. ' +
                  'Se reinicia cada noche; mientras tanto puedes esperar a mañana o añadir una ' +
                  'segunda clave de otra cuenta de Google. Detalle: ' + cuotaDiaria.join(' · ') +
                  // Los modelos que fallaron por otro motivo (no existen, petición
                  // rechazada) no salen en el diagnóstico de cuota y quedarían
                  // invisibles. Se añaden para no dejar huecos sin explicar.
                  (fallos.length > cuotaDiaria.length ? ` | Otros fallos: ${fallos.slice(-2).join(' | ')}` : '')
        );
        error.cupoAgotado = true;
        error.diagnostico = diagnostico;
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
