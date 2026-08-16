// ============================================================
//  /api/_articulos-temario.js
//  QUÉ ARTÍCULOS ENTRAN EN CADA TEMA.
//
//  Fuente: el listado de artículos del primer ejercicio que reparte
//  la academia (Francisco López Martínez, Cuerpo de Gestión Procesal
//  y Administrativa, Granada), transcrito tema por tema.
//
//  PARA QUÉ SIRVE. Sin esto, una reforma de la Constitución avisa en
//  todos los temas que estudian la Constitución. Con esto, la reforma
//  del artículo 69.3 —el senador de Formentera— cae solo en el tema
//  1, que es el único que estudia ese artículo. Es la diferencia
//  entre un aviso que se lee y un aviso que se ignora.
//
//  CÓMO SE ESCRIBEN LOS RANGOS. Tal y como los da la academia:
//    '5-18'            del 5 al 18
//    '155, 156'        sueltos
//    '45bis'           un bis, ter o quáter concreto
//    '69.3'            un apartado; se guarda el artículo, el 69
//  Todo lo que no sea un número (disposiciones adicionales, finales
//  y transitorias) se ignora a propósito: el análisis del BOE las
//  cita de mil formas distintas y cruzarlas daría más ruido que
//  aciertos.
//
//  LO QUE NO ESTÁ. Las normas que la academia cita y que no están en
//  el catálogo vigilado (_normas.js) no aparecen aquí: reglamentos
//  del Registro Civil, de ingreso, el de la UE 910/2014 y algún real
//  decreto suelto. Si algún día se añaden al catálogo, se añaden
//  también sus artículos aquí.
//
//  SOLO GESTIÓN. Tramitación y Auxilio no tienen un listado
//  equivalente todavía; para esos dos el cruce sigue siendo por ley
//  entera y la pantalla lo dice.
//
//  Los archivos que empiezan por "_" no son endpoints.
// ============================================================

// Códigos cortos para que la tabla se pueda leer y corregir
const L = {
    CE:        'BOE-A-1978-31229',
    LOTC:      'BOE-A-1979-23709',
    LOPJ:      'BOE-A-1985-12666',
    LDPJ:      'BOE-A-1988-29622',
    EOMF:      'BOE-A-1982-837',
    LEC:       'BOE-A-2000-323',
    LECRIM:    'BOE-A-1882-6036',
    CP:        'BOE-A-1995-25444',
    CC:        'BOE-A-1889-4763',
    LJCA:      'BOE-A-1998-16718',
    LJS:       'BOE-A-2011-15936',
    LJV:       'BOE-A-2015-7391',
    LRC:       'BOE-A-2011-12628',
    LBRL:      'BOE-A-1985-5392',
    GOBIERNO:  'BOE-A-1997-25336',
    LRJSP:     'BOE-A-2015-10566',
    EBEP:      'BOE-A-2015-11719',
    REGL_LAJ:  'BOE-A-2006-839',
    INGRESO:   'BOE-A-2005-21264',
    LOLS:      'BOE-A-1985-16660',
    HUELGA:    'BOE-A-1977-6061',
    LPRL:      'BOE-A-1995-24292',
    LOPD:      'BOE-A-2018-16673',
    DIGITAL:   'BOE-A-2023-25758',
    LEXNET:    'BOE-A-2015-12999',
    IGUALDAD:  'BOE-A-2007-6115',
    VIOLENCIA: 'BOE-A-2004-21760',
    TRATO:     'BOE-A-2022-11589',
    TRANS:     'BOE-A-2023-5366',
    JURADO:    'BOE-A-1995-12095',
    MENORES:   'BOE-A-2000-641',
    LOGP:      'BOE-A-1979-23708',
    LAJG:      'BOE-A-1996-750',
    TASAS:     'BOE-A-2012-14301',
    COOP:      'BOE-A-2015-8564',
    LPH:       'BOE-A-1960-10906',
    CONCURSAL: 'BOE-A-2020-4859',
    DEFENSA:   'BOE-A-2024-23630'
};

/* Un tema por entrada. La clave es el número del tema del programa
   oficial; el valor, qué artículos de qué ley entran. La cadena vacía
   significa "la ley entera". */
const GESTION = {
    1:  { [L.CE]: '1-136, 159-169', [L.LOTC]: '' },
    2:  { [L.IGUALDAD]: '', [L.VIOLENCIA]: '1-32, 42, 47, 61-69', [L.CP]: '83, 147, 148, 153, 171, 172, 468',
          [L.LDPJ]: '21', [L.LECRIM]: '17bis', [L.LEC]: '49bis',
          [L.TRATO]: '1-7, 19, 25-35, 40-54', [L.TRANS]: '1-13, 43-53, 62-69, 76-82' },
    3:  { [L.GOBIERNO]: '', [L.LRJSP]: '1-4, 54-80' },
    4:  { [L.CE]: '137-158', [L.LBRL]: '3, 13, 20, 22, 33, 34, 117' },
    5:  {},                                     // La Unión Europea: sin norma española
    6:  { [L.LOPJ]: '1-25, 104-106, 298-315, 378-404, 541, 558-642', [L.EOMF]: '1-34, 37, 38' },
    7:  { [L.LOPJ]: '53-83, 149-167, 178' },
    8:  { [L.LOPJ]: '84-103, 166, 167' },
    9:  { [L.LOPJ]: '99-103, 439ter, 439quater, 439quinquies, 476',
          [L.LEC]: '47, 170, 451-454, 455-465, 494, 495',
          [L.LECRIM]: '183, 184, 211, 213, 216-221' },
    10: {},                                     // Carta de Derechos: tema elaborado
    11: { [L.LOPJ]: '229-236, 236bis, 435-439, 439ter, 439quater, 439quinquies, 439sexies',
          [L.DIGITAL]: '1-100', [L.LEC]: '129bis, 135, 137bis, 146, 147, 162',
          [L.LECRIM]: '258bis, 306, 325', [L.LEXNET]: '', [L.LOPD]: '1-18, 44-56, 63-78' },
    12: { [L.LOPJ]: '440-446, 450-469', [L.REGL_LAJ]: '1-12' },
    13: { [L.LOPJ]: '470-475, 479, 480', [L.LECRIM]: '344-357' },
    14: { [L.LOPJ]: '476-478, 482-494, 495-505', [L.INGRESO]: '1-81', [L.EBEP]: '48-50' },
    15: { [L.LOPJ]: '506-540', [L.EBEP]: '87, 89' },
    16: { [L.CE]: '28, 40', [L.EBEP]: '39-46', [L.HUELGA]: '1-11', [L.LOLS]: '',
          [L.LPRL]: '4, 7-10, 12-15, 35, 42-45' },

    // --- Normas comunes a todos los procedimientos civiles -------
    17: { [L.LEC]: '5-18, 236-240', [L.CC]: '239-248' },
    18: { [L.LEC]: '6, 8, 23-35, 38, 40, 48, 58, 99-101, 106, 109, 151, 214, 232, 247, 249, 394, 514, 749, 751, 783, 793',
          [L.LJV]: '3, 4, 24, 28, 34, 43, 53, 57, 59, 62, 68, 79, 81, 85, 90, 91, 92, 94, 97, 98, 101, 105, 109, 141',
          [L.DEFENSA]: '4-12, 19, 20', [L.LOPJ]: '541-546, 551-557' },
    19: { [L.LEC]: '36-70, 71-98', [L.LJV]: '2' },
    20: { [L.LEC]: '129-144, 225-231', [L.LOPJ]: '179-181, 182-185, 229-236, 238-243, 268, 269, 275',
          [L.CE]: '24, 120', [L.LECRIM]: '197-215' },
    21: { [L.LEC]: '182-193, 194-205, 206-215', [L.LOPJ]: '244-248, 249-267, 452-456' },
    22: { [L.LEC]: '149, 169-177, 178-181', [L.LOPJ]: '273-278', [L.LECRIM]: '183-196', [L.COOP]: '' },
    23: { [L.LEC]: '149-168', [L.LECRIM]: '166-182', [L.LOPJ]: '270-272' },
    24: {},                                     // Archivo judicial: RD 937/2003, fuera del catálogo

    // --- Procedimientos civiles ----------------------------------
    25: { [L.LEC]: '248-255, 256-263, 281-386', [L.CC]: '1216-1230', [L.LJV]: '139-148' },
    26: { [L.LEC]: '19-22, 207-215, 222, 264-280, 399-436, 496-508' },
    27: { [L.LEC]: '22, 248, 250, 437-447' },
    28: { [L.LEC]: '782-805, 806-811' },
    29: { [L.LEC]: '812-818, 819-827', [L.LPH]: '21' },
    30: { [L.LEC]: '748-755, 756-763, 764-768, 769-778, 778quater, 779-781', [L.CC]: '81-89, 102-106' },
    31: { [L.LJV]: '1-22, 23-80, 81-90, 91-95, 96-99, 100-107, 108-111, 112-138, 139-148' },
    32: { [L.LEC]: '448-450, 451-454, 455-466, 494, 495' },
    33: { [L.LEC]: '477-489, 496-508, 509-516' },
    34: { [L.LEC]: '517-523, 524-534, 535-537, 538-555, 556-570', [L.COOP]: '41-55' },
    35: { [L.LEC]: '571-579, 580-583, 584-612, 621-633' },
    36: { [L.LEC]: '613-620, 634-675, 676-680, 681-698' },
    37: { [L.LEC]: '699-720' },
    38: { [L.LEC]: '721-747' },
    39: { [L.LEC]: '241-246, 394-398, 576', [L.TASAS]: '1-11', [L.LAJG]: '' },

    // --- Registro civil ------------------------------------------
    40: { [L.LRC]: '1-10, 11, 12, 13-19, 20-26' },
    41: { [L.LRC]: '27-32, 33-43, 44-79' },
    42: { [L.LRC]: '80-82, 83, 84, 85-87, 88-100' },

    // --- Procedimiento penal --------------------------------------
    43: { [L.LECRIM]: '1-47' },
    44: { [L.LECRIM]: '100-117, 118-121, 259-281, 282-298, 615-621, 834-846',
          [L.CP]: '109-122, 116, 125, 126, 130' },
    45: { [L.LECRIM]: '299-485', [L.LOPJ]: '547-550' },
    46: { [L.LECRIM]: '263bis, 282bis, 363, 486-488, 489-501, 502-519, 528-544, 545-588, 589-614, 796' },
    47: { [L.LECRIM]: '622-633, 634-648, 649-665, 666-679' },
    48: { [L.LECRIM]: '680-749' },
    49: { [L.LECRIM]: '238bis, 238ter, 757-794, 803bis' },
    50: { [L.LECRIM]: '795-803' },
    51: { [L.JURADO]: '', [L.LECRIM]: '846bis, 846ter' },
    52: { [L.VIOLENCIA]: '1, 2', [L.LOPJ]: '89',
          [L.LECRIM]: '14, 14bis, 15bis, 17bis, 544-544quinquies, 797bis, 962', [L.LEC]: '49bis' },
    53: { [L.MENORES]: '1-45' },
    54: { [L.LECRIM]: '743, 790-792, 962-982, 984, 989, 990, 996', [L.LOPJ]: '82',
          [L.LEC]: '517, 520, 539, 548, 549, 551, 553, 556, 560, 561, 580' },
    55: { [L.LECRIM]: '211-238, 238bis, 238ter, 309bis, 311, 384, 790-793, 803, 845, 847-906, 954-961',
          [L.JURADO]: '30' },
    56: { [L.LECRIM]: '239-246, 794, 983-999', [L.LOPJ]: '92', [L.LOGP]: '1, 2, 3, 6, 44, 49, 50, 76-78',
          [L.CP]: '123, 124' },

    // --- Contencioso-administrativo y laboral ---------------------
    57: { [L.LJCA]: '1-17' },
    58: { [L.LJCA]: '18-30' },
    59: { [L.LJCA]: '40-51' },
    60: { [L.LJCA]: '52-77' },
    61: { [L.LJCA]: '78' },
    62: { [L.LJCA]: '79-93, 102, 102bis' },
    63: { [L.LJCA]: '114-122, 123-126, 127, 127bis, 127quater, 127quinquies' },
    64: { [L.LJCA]: '103-113, 128-139' },
    65: { [L.LJS]: '1-14, 16-22, 23, 24, 74, 75', [L.LAJG]: '1, 2, 3, 6' },
    66: { [L.LJS]: '63-73, 76-79, 80-100, 101, 186-236' },
    67: { [L.LJS]: '102-115, 140-147, 153-166, 177-184' },

    // --- Mercantil ------------------------------------------------
    68: { [L.CONCURSAL]: '1-43, 44-56, 57-104, 289-304, 508-521, 532-543, 544-551, 574, 583, 584, 600-606, 641-652, 685-720' }
};

const POR_CUERPO = {
    gestion: GESTION,
    /* Sin listado equivalente todavía. null NO es "no entra nada":
       es "no lo sé", y para estos dos el cruce se hace por ley. */
    tramitacion: null,
    auxilio: null
};

/* Expande '5-18, 45bis, 100' a un conjunto de claves comparables.
   Los rangos se guardan aparte porque expandir '1-136' a 136
   entradas por tema y por ley multiplica la memoria sin ganar nada:
   se comprueba con una comparación numérica. */
function compilar(especificacion) {
    const sueltos = new Set();
    const rangos = [];
    let todaLaLey = false;

    const texto = String(especificacion || '').trim();
    if (!texto) return { todaLaLey: true, sueltos, rangos };

    for (const trozo of texto.split(',')) {
        const limpio = trozo.trim().toLowerCase();
        if (!limpio) continue;

        const rango = limpio.match(/^(\d+)\s*-\s*(\d+)$/);
        if (rango) {
            rangos.push([Number(rango[1]), Number(rango[2])]);
            continue;
        }

        // '45bis' se guarda tal cual y también como 45: el análisis
        // del BOE unas veces dice "art. 45 bis" y otras "art. 45".
        const conSufijo = limpio.match(/^(\d+)\s*(bis|ter|quater|quáter|quinquies|sexies|septies|octies)$/);
        if (conSufijo) {
            sueltos.add(limpio.replace(/\s+/g, ''));
            sueltos.add(conSufijo[1]);
            continue;
        }

        const numero = limpio.match(/^(\d+)/);
        if (numero) sueltos.add(numero[1]);
    }

    return { todaLaLey, sueltos, rangos };
}

/* ¿El artículo tocado entra en este tema? */
function articuloEntra(compilado, articulo) {
    if (!compilado) return false;
    if (compilado.todaLaLey) return true;

    const limpio = String(articulo || '').trim().toLowerCase().replace(/\s+/g, '');
    if (compilado.sueltos.has(limpio)) return true;

    const numero = Number((limpio.match(/^(\d+)/) || [])[1]);
    if (!Number.isFinite(numero)) return false;

    if (compilado.sueltos.has(String(numero))) return true;
    return compilado.rangos.some(([desde, hasta]) => numero >= desde && numero <= hasta);
}

// Se compila una vez al cargar el módulo, no en cada petición
const COMPILADO = {};
for (const [cuerpo, tabla] of Object.entries(POR_CUERPO)) {
    if (!tabla) { COMPILADO[cuerpo] = null; continue; }

    COMPILADO[cuerpo] = {};
    for (const [numero, leyes] of Object.entries(tabla)) {
        COMPILADO[cuerpo][numero] = {};
        for (const [ley, especificacion] of Object.entries(leyes)) {
            COMPILADO[cuerpo][numero][ley] = compilar(especificacion);
        }
    }
}

/* Qué leyes tiene declaradas un tema, por su número. */
function leyesDelTema(cuerpo, numero) {
    const tabla = COMPILADO[String(cuerpo || '')];
    if (!tabla) return null;
    return tabla[String(numero)] || {};
}

/* ¿Le toca a este tema una reforma de tal ley en tales artículos?
   Devuelve los artículos que entran, o [] si no le toca. */
function articulosQueAfectan(cuerpo, numero, idLey, articulos) {
    const leyes = leyesDelTema(cuerpo, numero);
    if (!leyes) return null;            // este cuerpo no tiene listado

    const compilado = leyes[idLey];
    if (!compilado) return [];          // el tema no estudia esa ley

    return (articulos || []).filter(a => articuloEntra(compilado, a));
}

function tieneListado(cuerpo) {
    return !!COMPILADO[String(cuerpo || '')];
}

module.exports = {
    LEYES: L,
    GESTION,
    compilar,
    articuloEntra,
    leyesDelTema,
    articulosQueAfectan,
    tieneListado
};
