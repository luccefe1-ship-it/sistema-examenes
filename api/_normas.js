// ============================================================
//  /api/_normas.js
//  Qué normas se vigilan y cómo se decide si algo del BOE importa.
//
//  >>> ESTE ES EL SITIO DONDE SE DICE QUÉ VIGILAR. <<<
//  Si añades una norma al temario, añádela aquí y el vigilante la
//  seguirá sin tocar nada más.
//
//  IMPORTANTE SOBRE LOS IDENTIFICADORES: un ID mal escrito no rompe
//  nada de forma visible. Simplemente esa norma deja de vigilarse
//  para siempre y nadie se entera. Por eso existe el modo
//  verificación:
//
//      GET /api/boe-vigilante?verificar=1
//
//  que pregunta al BOE por cada ID y te dice cuáles no existen y qué
//  título tiene realmente cada uno. CONVIENE EJECUTARLO UNA VEZ tras
//  desplegar y cada vez que se añada una norma.
//
//  Los archivos que empiezan por "_" no son endpoints: Vercel los
//  ignora al crear rutas.
// ============================================================

/* Cada entrada:
     id      identificador BOE de la norma consolidada
     nombre  cómo la llamas tú, para el aviso
     alias   cómo aparece citada en las preguntas del banco. Se usa
             para cruzar los artículos modificados con las preguntas,
             así que conviene poner todas las formas que uses.
     bloque  para agrupar los avisos por parte del temario          */
const NORMAS = [
    // --- Organización judicial -------------------------------------
    {
        id: 'BOE-A-1978-31229',
        nombre: 'Constitución Española',
        alias: ['CE', 'Constitución'],
        bloque: 'Organización del Estado'
    },
    {
        id: 'BOE-A-1985-12666',
        nombre: 'LO 6/1985 del Poder Judicial',
        alias: ['LOPJ', 'Ley Orgánica del Poder Judicial'],
        bloque: 'Organización judicial'
    },
    {
        id: 'BOE-A-1988-29622',
        nombre: 'Ley 38/1988 de Demarcación y Planta Judicial',
        alias: ['LDPJ', 'Demarcación y Planta'],
        bloque: 'Organización judicial'
    },
    {
        id: 'BOE-A-1982-837',
        nombre: 'Ley 50/1981 del Estatuto Orgánico del Ministerio Fiscal',
        alias: ['EOMF', 'Estatuto Orgánico del Ministerio Fiscal'],
        bloque: 'Organización judicial'
    },

    // --- Derecho procesal -----------------------------------------
    {
        id: 'BOE-A-2000-323',
        nombre: 'Ley 1/2000 de Enjuiciamiento Civil',
        alias: ['LEC', 'Enjuiciamiento Civil'],
        bloque: 'Procesal civil'
    },
    {
        id: 'BOE-A-1882-6036',
        nombre: 'Ley de Enjuiciamiento Criminal',
        alias: ['LECrim', 'LECr', 'Enjuiciamiento Criminal'],
        bloque: 'Procesal penal'
    },
    {
        id: 'BOE-A-1998-16718',
        nombre: 'Ley 29/1998 de la Jurisdicción Contencioso-administrativa',
        alias: ['LJCA', 'Contencioso-administrativa'],
        bloque: 'Procesal contencioso'
    },
    {
        id: 'BOE-A-2011-15936',
        nombre: 'Ley 36/2011 reguladora de la Jurisdicción Social',
        alias: ['LRJS', 'Jurisdicción Social'],
        bloque: 'Procesal social'
    },
    {
        id: 'BOE-A-2015-7391',
        nombre: 'Ley 15/2015 de la Jurisdicción Voluntaria',
        alias: ['LJV', 'Jurisdicción Voluntaria'],
        bloque: 'Procesal civil'
    },

    // --- Registro civil -------------------------------------------
    {
        id: 'BOE-A-2011-12628',
        nombre: 'Ley 20/2011 del Registro Civil',
        alias: ['LRC', 'Registro Civil'],
        bloque: 'Registro Civil'
    },

    // --- Régimen administrativo y personal ------------------------
    {
        id: 'BOE-A-2015-10565',
        nombre: 'Ley 39/2015 del Procedimiento Administrativo Común',
        alias: ['LPAC', 'Ley 39/2015', 'Procedimiento Administrativo Común'],
        bloque: 'Derecho administrativo'
    },
    {
        id: 'BOE-A-2015-10566',
        nombre: 'Ley 40/2015 de Régimen Jurídico del Sector Público',
        alias: ['LRJSP', 'Ley 40/2015', 'Régimen Jurídico del Sector Público'],
        bloque: 'Derecho administrativo'
    },
    {
        id: 'BOE-A-2015-11719',
        nombre: 'Estatuto Básico del Empleado Público (RDL 5/2015)',
        alias: ['EBEP', 'Estatuto Básico del Empleado Público'],
        bloque: 'Función pública'
    },
    {
        id: 'BOE-A-2005-21264',
        nombre: 'RD 1451/2005, Reglamento de ingreso, provisión de puestos y promoción profesional en la Administración de Justicia',
        alias: ['Reglamento de ingreso', 'RD 1451/2005'],
        bloque: 'Función pública'
    },

    /* LA REFORMA QUE MÁS TE AFECTA AHORA MISMO.
       Cambió la organización judicial entera: juzgados -> tribunales de
       instancia. Efectos desde el 3 de abril de 2025, así que ya estaba
       en vigor cuando se convocó tu oposición. Cualquier pregunta del
       banco escrita antes de esa fecha sobre organización judicial es
       sospechosa. */
    {
        id: 'BOE-A-2025-76',
        nombre: 'LO 1/2025 de medidas en materia de eficiencia del Servicio Público de Justicia',
        alias: ['LO 1/2025', 'Ley Orgánica 1/2025', 'eficiencia del Servicio Público de Justicia'],
        bloque: 'Organización judicial'
    },

    // --- Transversales --------------------------------------------
    {
        id: 'BOE-A-2023-5366',
        nombre: 'Ley 4/2023 para la igualdad real y efectiva de las personas trans',
        alias: ['Ley 4/2023'],
        bloque: 'Transversales'
    },
    {
        id: 'BOE-A-2022-11589',
        nombre: 'Ley 15/2022 integral para la igualdad de trato y la no discriminación',
        alias: ['Ley 15/2022'],
        bloque: 'Transversales'
    },
    {
        id: 'BOE-A-2011-11605',
        nombre: 'Ley 18/2011 sobre el uso de las TIC en la Administración de Justicia',
        alias: ['Ley 18/2011', 'TIC en la Administración de Justicia'],
        bloque: 'Nuevas tecnologías'
    },
    {
        id: 'BOE-A-2018-16673',
        nombre: 'LO 3/2018 de Protección de Datos y garantía de los derechos digitales',
        alias: ['LOPDGDD', 'Protección de Datos'],
        bloque: 'Transversales'
    },
    {
        id: 'BOE-A-2004-21760',
        nombre: 'LO 1/2004 de Medidas de Protección Integral contra la Violencia de Género',
        alias: ['LO 1/2004', 'Violencia de Género'],
        bloque: 'Transversales'
    },
    {
        id: 'BOE-A-2007-6115',
        nombre: 'LO 3/2007 para la igualdad efectiva de mujeres y hombres',
        alias: ['LO 3/2007', 'Igualdad'],
        bloque: 'Transversales'
    },
    {
        id: 'BOE-A-2013-12887',
        nombre: 'Ley 19/2013 de Transparencia',
        alias: ['Ley 19/2013', 'Transparencia'],
        bloque: 'Transversales'
    }
];

// ------------------------------------------------------------
//  Filtro del sumario diario
// ------------------------------------------------------------

/* Secciones que se miran. El resto del boletín (subvenciones,
   anuncios, sanciones) no tiene nada que ver con la oposición y
   solo generaría ruido.
     1   Disposiciones generales -> leyes y reglamentos nuevos
     2B  Oposiciones y concursos -> convocatorias, listas, fechas
     3   Otras disposiciones     -> acuerdos del CGPJ, instrucciones  */
const SECCIONES_VIGILADAS = ['1', '2B', '3'];

/* Departamentos cuyas publicaciones interesan. Se compara sin
   acentos y en minúsculas, y basta con que la cadena aparezca. */
const DEPARTAMENTOS_VIGILADOS = [
    'ministerio de justicia',
    'ministerio de la presidencia, justicia',   // el nombre cambia según el gobierno de turno
    'jefatura del estado',
    'cortes generales',
    'consejo general del poder judicial',
    'tribunal constitucional',
    'tribunal supremo',
    'ministerio de hacienda y funcion publica',
    'ministerio para la transformacion digital y de la funcion publica'
];

/* Palabras que, aparezcan donde aparezcan, hacen que una disposición
   merezca una mirada aunque el departamento no esté en la lista. */
const PALABRAS_RELEVANTES = [
    'administracion de justicia',
    'oficina judicial',
    'tribunal de instancia',
    'letrado de la administracion de justicia',
    'gestion procesal',
    'tramitacion procesal',
    'auxilio judicial',
    'enjuiciamiento civil',
    'enjuiciamiento criminal',
    'poder judicial',
    'registro civil',
    'jurisdiccion voluntaria'
];

/* Cuerpos de la convocatoria que le interesan a Luciano. Una
   convocatoria de médicos forenses no pinta nada aquí. */
const CUERPOS_PROPIOS = [
    'gestion procesal',
    'tramitacion procesal',
    'auxilio judicial'
];

const PISTAS_CONVOCATORIA = [
    'convoca', 'convocatoria', 'proceso selectivo', 'oposicion',
    'lista de admitidos', 'relacion de aprobados', 'bolsa de interinos',
    'oferta de empleo'
];

/* RUIDO. Lo que el Ministerio publica a diario y no cambia ni una coma
   del temario ni abre ningún plazo.

   Esta lista no salió de imaginar qué podría molestar: salió de mirar
   los 90 avisos de la primera ejecución real. Casi todos eran convenios
   ("Convenio con el Banco de España en materia de cesión de información
   para el análisis de pymes"). Con el filtro anterior pasaban solo por
   venir del Ministerio de Justicia, y enterraban lo que sí importa.

   Un aviso que no se lee es peor que ninguno: enseña a ignorar la
   pantalla entera. */
const RUIDO_ADMINISTRATIVO = [
    'convenio', 'addenda', 'adenda', 'protocolo general',
    'encomienda de gestion', 'delegacion de competencias',
    'subvencion', 'subvenciones', 'premio', 'premios',
    'cuentas anuales', 'presupuesto', 'contrato', 'licitacion',
    'carta de servicios', 'sello de calidad', 'convenio colectivo',
    'expropiacion', 'condecoracion', 'cruz de san raimundo',
    'medalla', 'indulto', 'nacionalidad por carta de naturaleza'
];

/* Sin acentos, sin mayúsculas y sin espacios de más.
   Comparar "Administración" con "administracion" falla siempre y es
   el fallo más aburrido de encontrar. */
function normalizar(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function contieneAlguna(texto, lista) {
    const limpio = normalizar(texto);
    return lista.some(pista => limpio.includes(pista));
}

/* ¿Merece la pena mirar esta disposición del sumario?
   Devuelve null si no, o el motivo por el que sí. */
function clasificarDisposicion(disposicion) {
    const seccion = String(disposicion.seccion || '').toUpperCase();
    if (!SECCIONES_VIGILADAS.includes(seccion)) return null;

    const texto = `${disposicion.titulo} ${disposicion.epigrafe}`;
    const esDeCasa = contieneAlguna(disposicion.departamento, DEPARTAMENTOS_VIGILADOS);
    const hablaDeLoNuestro = contieneAlguna(texto, PALABRAS_RELEVANTES);

    // Oposiciones y concursos: solo si es de un cuerpo tuyo. Aquí se
    // publican cientos de convocatorias al año de todo el Estado.
    if (seccion === '2B') {
        if (!contieneAlguna(texto, CUERPOS_PROPIOS)) return null;
        return { tipo: 'convocatoria', motivo: 'Convocatoria o proceso selectivo de tu cuerpo' };
    }

    /* Una convocatoria de tu cuerpo entra SIEMPRE, aunque venga por otra
       sección y aunque el título lleve la palabra "convenio". Se mira
       antes que el filtro de ruido a propósito: perderse un plazo cuesta
       una convocatoria entera. */
    if (contieneAlguna(texto, PISTAS_CONVOCATORIA) && contieneAlguna(texto, CUERPOS_PROPIOS)) {
        return { tipo: 'convocatoria', motivo: 'Convocatoria o proceso selectivo de tu cuerpo' };
    }

    if (contieneAlguna(texto, RUIDO_ADMINISTRATIVO)) return null;

    /* SECCIÓN I - Disposiciones generales: aquí van las leyes y los
       reglamentos, que es lo que puede cambiar el temario. Basta con
       que venga de un departamento de los tuyos. */
    if (seccion === '1') {
        if (!esDeCasa && !hablaDeLoNuestro) return null;
        return {
            tipo: 'disposicion',
            motivo: hablaDeLoNuestro
                ? 'Disposición general sobre la Administración de Justicia'
                : `Disposición general de ${disposicion.departamento}`
        };
    }

    /* SECCIÓN III - Otras disposiciones: aquí el departamento NO basta.
       El Ministerio de Justicia publica en esta sección decenas de cosas
       al mes que no tienen que ver con el temario, y por dejar pasar
       todo lo suyo salieron 90 avisos el primer día.

       Se exige que el título hable de lo tuyo, o que venga del CGPJ,
       cuyos acuerdos sí regulan la oficina judicial. */
    const esDelCGPJ = contieneAlguna(disposicion.departamento, ['consejo general del poder judicial']);

    if (!hablaDeLoNuestro && !esDelCGPJ) return null;

    return {
        tipo: 'otra',
        motivo: esDelCGPJ
            ? 'Acuerdo del Consejo General del Poder Judicial'
            : 'Publicación sobre la Administración de Justicia'
    };
}

/* Qué normas del catálogo se citan en un texto. Se busca por nombre y
   por alias; el alias corto ("CE", "LEC") se exige como palabra
   suelta, porque si no "LEC" caza dentro de "LECrim" y de
   "intelectual". */
function normasCitadas(texto) {
    const limpio = normalizar(texto);
    if (!limpio) return [];

    return NORMAS.filter(norma => {
        if (limpio.includes(normalizar(norma.nombre))) return true;

        return norma.alias.some(alias => {
            const a = normalizar(alias);
            if (a.length <= 6) {
                return new RegExp(`(^|[^a-z0-9])${a}([^a-z0-9]|$)`).test(limpio);
            }
            return limpio.includes(a);
        });
    });
}

function normaPorId(id) {
    return NORMAS.find(norma => norma.id === id) || null;
}

module.exports = {
    NORMAS,
    SECCIONES_VIGILADAS,
    DEPARTAMENTOS_VIGILADOS,
    PALABRAS_RELEVANTES,
    CUERPOS_PROPIOS,
    normalizar,
    clasificarDisposicion,
    normasCitadas,
    normaPorId
};
