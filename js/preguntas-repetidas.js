/* ==================================================================
   DETECTOR DE PREGUNTAS REPETIDAS
   ------------------------------------------------------------------
   Los tests con IA repetían el mismo dato con la redacción cambiada:

     "Solicitada la acumulación de procesos pendientes ante un mismo
      tribunal, si todas las partes se muestran conformes con ella:"
     "En la acumulación de procesos pendientes ante un mismo tribunal,
      si todas las partes se muestran conformes con la acumulación:"

   Dos enunciados distintos, misma respuesta correcta palabra por
   palabra. Comparar el texto tal cual no las caza; hay que comparar
   el CONTENIDO.

   La clave está en la respuesta correcta: si dos preguntas tienen la
   misma solución y hablan de lo mismo, preguntan lo mismo.
================================================================== */

// Palabras que no aportan significado y solo ensucian la comparación
const VACIAS = new Set([
    'el','la','los','las','un','una','unos','unas','lo','al','del','de','a','ante','bajo',
    'con','contra','desde','durante','en','entre','hacia','hasta','mediante','para','por',
    'segun','sin','sobre','tras','y','e','o','u','ni','que','qué','cual','cuál','cuando',
    'cuándo','donde','dónde','quien','quién','como','cómo','es','son','ser','sera','será',
    'seran','serán','esta','está','estan','están','ha','han','haber','se','su','sus','le',
    'les','me','te','nos','si','sí','no','mas','más','pero','tambien','también','muy','ya',
    'este','esta','estos','estas','ese','esa','esos','esas','aquel','todo','toda','todos',
    'todas','otro','otra','otros','otras','mismo','misma','mismos','mismas','caso','casos',
    'senale','señale','indique','respuesta','correcta','incorrecta','siguiente','siguientes'
]);

function quitarTildes(texto) {
    return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/* Convierte un texto en el conjunto de sus palabras con significado */
export function palabrasClave(texto) {
    return new Set(
        quitarTildes(texto)
            .toLowerCase()
            .replace(/[^a-z0-9ñ\s]/g, ' ')
            .split(/\s+/)
            /* Los números SIEMPRE cuentan, aunque sean de una cifra: en
               una oposición son justo el dato que distingue una pregunta
               de otra. Descartándolos por cortos, "5 días" y "20 días"
               quedaban reducidos los dos a {dias} y parecían la misma. */
            .filter(p => (p.length > 2 || /^\d+$/.test(p)) && !VACIAS.has(p))
    );
}

/* Cuánto se parecen dos conjuntos: 1 es idéntico, 0 es nada en común */
export function parecido(a, b) {
    if (a.size === 0 || b.size === 0) return 0;
    let comunes = 0;
    a.forEach(p => { if (b.has(p)) comunes++; });
    return comunes / (a.size + b.size - comunes);
}

function textoOpcionCorrecta(pregunta) {
    const opciones = pregunta.opciones || [];
    const correcta = opciones.find(op => op && op.esCorrecta === true)
        || opciones.find(op => op && op.letra === pregunta.respuestaCorrecta);
    return correcta ? correcta.texto : '';
}

// Huella de una pregunta: con qué se la va a comparar
export function huella(pregunta) {
    const opciones = (pregunta.opciones || []).map(op => op && op.texto ? op.texto : '');
    return {
        enunciado: palabrasClave(pregunta.texto),
        correcta: palabrasClave(textoOpcionCorrecta(pregunta)),
        // El juego de opciones ordenado: si coincide, es la misma pregunta
        // aunque el enunciado esté escrito de otra manera
        juegoOpciones: opciones
            .map(t => quitarTildes(t).toLowerCase().replace(/[^a-z0-9ñ]/g, ''))
            .filter(Boolean)
            .sort()
            .join('|')
    };
}

/* Umbrales.
   Se afinaron con las repetidas reales que aparecieron en un test:
   respuestas correctas idénticas y enunciados con la mitad larga de
   las palabras en común. */
const PARECIDO_CORRECTA = 0.75;
const PARECIDO_ENUNCIADO = 0.45;
const PARECIDO_ENUNCIADO_SOLO = 0.80;   // enunciados casi calcados

export function sonLaMisma(a, b) {
    const pCorrecta = parecido(a.correcta, b.correcta);
    const pEnunciado = parecido(a.enunciado, b.enunciado);

    /* 1. Las mismas cuatro opciones Y la misma solución.
       Ojo: exigir solo que coincidan las opciones descartaba preguntas
       legítimas. En un temario es normal que varias compartan el juego
       de opciones ("3 días / 5 días / 10 días / 20 días") preguntando
       por plazos de recursos distintos. Lo que las hace repetidas es
       que además la respuesta correcta sea la misma. */
    if (a.juegoOpciones && a.juegoOpciones === b.juegoOpciones && pCorrecta >= 0.9) {
        return { repetida: true, motivo: 'mismas opciones y misma solución' };
    }

    // 2. Misma respuesta correcta y hablando de lo mismo

    if (pCorrecta >= PARECIDO_CORRECTA && pEnunciado >= PARECIDO_ENUNCIADO) {
        return {
            repetida: true,
            motivo: `misma respuesta (${Math.round(pCorrecta * 100)}%) sobre lo mismo (${Math.round(pEnunciado * 100)}%)`
        };
    }

    // 3. Enunciados prácticamente calcados, aunque cambien las opciones
    if (pEnunciado >= PARECIDO_ENUNCIADO_SOLO) {
        return { repetida: true, motivo: `enunciado casi idéntico (${Math.round(pEnunciado * 100)}%)` };
    }

    return { repetida: false };
}

/* Filtra una lista dejando solo preguntas distintas entre sí.
   Se puede pasar un conjunto de huellas ya vistas para comparar
   también contra lo generado en lotes anteriores. */
export function quitarRepetidas(preguntas, huellasPrevias = []) {
    const aceptadas = [];
    const descartadas = [];
    const vistas = huellasPrevias.slice();

    (preguntas || []).forEach(pregunta => {
        if (!pregunta || !pregunta.texto) return;

        const h = huella(pregunta);
        let choque = null;

        for (const anterior of vistas) {
            const veredicto = sonLaMisma(h, anterior);
            if (veredicto.repetida) { choque = veredicto.motivo; break; }
        }

        if (choque) {
            descartadas.push({ texto: pregunta.texto, motivo: choque });
        } else {
            vistas.push(h);
            aceptadas.push(pregunta);
        }
    });

    return { aceptadas, descartadas, huellas: vistas };
}
