// ============================================================
//  /api/_convocatoria.js
//  Los datos de la convocatoria en curso, por cuerpo.
//
//  >>> ESTE ES EL SITIO DONDE SE ACTUALIZAN LAS FECHAS. <<<
//
//  POR QUÉ ESTÁ ESCRITO A MANO Y NO SE SACA DEL BOE. El vigilante
//  detecta que se ha publicado una orden nueva, pero de un título
//  como "Orden PJC/585/2026 ... por la que se aprueba la relación
//  provisional" no se puede deducir de forma fiable la fecha del
//  examen: está en el apartado décimo del cuerpo del texto. Adivinarlo
//  con IA daría una fecha inventada de vez en cuando, y una fecha de
//  examen equivocada es de las peores cosas que puede hacer esta
//  plataforma.
//
//  Así que: el vigilante AVISA de que hay una orden nueva, y la fecha
//  se confirma aquí a mano, contra el BOE. Cada hito lleva su
//  identificador para poder comprobarlo.
//
//  Los archivos que empiezan por "_" no son endpoints.
// ============================================================

/* Términos que la LO 1/2025 dejó fuera de juego. Si aparecen en un
   tema digital o en una pregunta, el material se escribió antes de
   abril de 2025 y hay que mirarlo.

   OJO CON LOS FALSOS POSITIVOS, y por eso cada término lleva su
   contexto: "Juzgado de Paz" SIGUE EXISTIENDO y no debe saltar, y
   "Secretario Judicial" puede aparecer legítimamente en una cita
   histórica o en el nombre de una ley antigua. Esto señala, no
   corrige. */
/* Qué norma hizo cada cambio, para poder enlazar al texto completo
   desde el aviso. La reorganización judicial entera es de la LO
   1/2025; lo de "Secretario Judicial" viene de más atrás y su sitio
   es la LOPJ, que es donde se regula la figura hoy. */
const LEY_EFICIENCIA = { id: 'BOE-A-2025-76', nombre: 'LO 1/2025 de eficiencia del Servicio Público de Justicia' };
const LEY_LOPJ = { id: 'BOE-A-1985-12666', nombre: 'LO 6/1985 del Poder Judicial' };

const TERMINOS_DEROGADOS = [
    {
        termino: 'juzgado de primera instancia',
        ahora: 'Tribunal de Instancia, Sección Civil',
        gravedad: 'alta',
        ley: LEY_EFICIENCIA
    },
    {
        termino: 'juzgados de primera instancia',
        ahora: 'Tribunales de Instancia, Secciones Civiles',
        gravedad: 'alta',
        ley: LEY_EFICIENCIA
    },
    {
        termino: 'juzgado de instruccion',
        ahora: 'Tribunal de Instancia, Sección de Instrucción',
        gravedad: 'alta',
        ley: LEY_EFICIENCIA
    },
    {
        termino: 'juzgado de lo penal',
        ahora: 'Tribunal de Instancia, Sección de Enjuiciamiento Penal',
        gravedad: 'alta',
        ley: LEY_EFICIENCIA
    },
    {
        termino: 'juzgado de lo mercantil',
        ahora: 'Tribunal de Instancia, Sección de lo Mercantil',
        gravedad: 'alta',
        ley: LEY_EFICIENCIA
    },
    {
        termino: 'juzgado de lo social',
        ahora: 'Tribunal de Instancia, Sección de lo Social',
        gravedad: 'alta',
        ley: LEY_EFICIENCIA
    },
    {
        termino: 'juzgado de vigilancia penitenciaria',
        ahora: 'Tribunal de Instancia, Sección de Vigilancia Penitenciaria',
        gravedad: 'alta',
        ley: LEY_EFICIENCIA
    },
    {
        termino: 'juzgado de violencia sobre la mujer',
        ahora: 'Tribunal de Instancia, Sección de Violencia sobre la Mujer',
        gravedad: 'alta',
        ley: LEY_EFICIENCIA
    },
    {
        termino: 'juzgado de menores',
        ahora: 'Tribunal de Instancia, Sección de Menores',
        gravedad: 'alta',
        ley: LEY_EFICIENCIA
    },
    {
        termino: 'juzgado de lo contencioso',
        ahora: 'Tribunal de Instancia, Sección de lo Contencioso-Administrativo',
        gravedad: 'alta',
        ley: LEY_EFICIENCIA
    },
    {
        termino: 'secretario judicial',
        ahora: 'Letrado de la Administración de Justicia',
        // el cambio es de 2015: material MUY viejo
        gravedad: 'media',
        ley: LEY_LOPJ
    },
    {
        termino: 'juzgado decano',
        ahora: 'Presidencia del Tribunal de Instancia',
        gravedad: 'media',
        ley: LEY_LOPJ
    }
];

/* La Justicia de Paz no desapareció: cambió de forma. Se vigila
   aparte y con gravedad baja, porque "Juzgado de Paz" en un texto
   puede ser correcto según el contexto. */
const TERMINOS_MATIZADOS = [
    {
        termino: 'juzgado de paz',
        ahora: 'Oficina de Justicia en el Municipio (el Juez de Paz sigue existiendo)',
        gravedad: 'baja',
        ley: LEY_EFICIENCIA
    }
];

// ------------------------------------------------------------
//  Convocatoria en curso
// ------------------------------------------------------------
const CONVOCATORIA = {
    nombre: 'Turno libre, OEP 2025',
    ordenConvocatoria: 'Orden PJC/1549/2025, de 22 de diciembre',
    idBoeConvocatoria: 'BOE-A-2025-27053',
    ofertaEmpleo: 'Real Decreto 651/2025, de 15 de julio',

    // AAAA-MM-DD. El examen es el mismo día para los tres cuerpos.
    fechaExamen: '2026-10-03',

    /* Hitos ya publicados, cada uno con su referencia del BOE para
       poder comprobarlo. Cuando salga uno nuevo se añade aquí. */
    hitos: [
        {
            fecha: '2025-12-30',
            titulo: 'Convocatoria',
            detalle: 'Orden PJC/1549/2025. Se convocan los procesos selectivos de Gestión, Tramitación y Auxilio.',
            idBoe: 'BOE-A-2025-27053',
            estado: 'hecho'
        },
        {
            fecha: '2026-06-12',
            titulo: 'Listas provisionales de admitidos y fecha de examen',
            detalle: 'Orden PJC/585/2026. Fija el ejercicio para el 3 de octubre de 2026 y publica los Tribunales Calificadores.',
            idBoe: 'BOE-A-2026-12731',
            estado: 'hecho'
        },
        {
            fecha: null,
            titulo: 'Listas definitivas y sedes de examen',
            detalle: 'Pendiente. En la convocatoria anterior salió el 23 de julio. El vigilante avisará cuando se publique.',
            idBoe: null,
            estado: 'pendiente'
        },
        {
            fecha: '2026-10-03',
            titulo: 'Examen',
            detalle: 'Los tres ejercicios el mismo día, uno detrás de otro, en un único acto.',
            idBoe: 'BOE-A-2026-12731',
            estado: 'pendiente'
        }
    ],

    cuerpos: {
        gestion: {
            clave: 'gestion',
            nombre: 'Gestión Procesal y Administrativa',
            corto: 'Gestión',
            titulacion: 'Diplomatura, grado o equivalente',
            plazas: { general: 652, discapacidad: 73, total: 725 },
            temas: 68,

            ejercicios: [
                { nombre: '1.º Teórico', contenido: 'Todo el programa', preguntas: '100 (+4 de reserva)', tiempo: '100 min', puntos: '0 a 60', minimo: '30', acierto: 0.60, fallo: 0.15 },
                { nombre: '2.º Práctico', contenido: 'Caso práctico', preguntas: '10 (+2 de reserva)', tiempo: '30 min', puntos: '0 a 15', minimo: '7,5', acierto: 1.5, fallo: 0.30 },
                { nombre: '3.º Procesal', contenido: 'Cinco preguntas a desarrollar por escrito (temas 17 a 39 y 43 a 67)', preguntas: '5', tiempo: '45 min', puntos: 'A criterio del Tribunal', minimo: '—' }
            ],

            /* LA COMPARACIÓN CON LA CONVOCATORIA ANTERIOR YA NO VIVE
               AQUÍ. Estaba escrita a mano y tenía errores: daba por
               nuevos los temas 67 y 68 de Gestión, que ya existían con
               el mismo enunciado en la Orden PJC/1437/2024. Ahora se
               calcula comparando los dos anexos palabra por palabra en
               _temario-anterior.js. */

        },

        tramitacion: {
            clave: 'tramitacion',
            nombre: 'Tramitación Procesal y Administrativa',
            corto: 'Tramitación',
            titulacion: 'Bachillerato o equivalente',
            plazas: { general: 1039, discapacidad: 116, total: 1155 },
            temas: 37,

            ejercicios: [
                { nombre: '1.º Teórico', contenido: 'Temas 1 a 31', preguntas: '100 (+4 de reserva)', tiempo: '100 min', puntos: '0 a 60', minimo: '30', acierto: 0.60, fallo: 0.15 },
                { nombre: '2.º Práctico', contenido: 'Caso práctico, temas 1 a 31', preguntas: '10 (+2 de reserva)', tiempo: '30 min', puntos: '0 a 20', minimo: '10', acierto: 2, fallo: 0.50 },
                { nombre: '3.º Ofimática', contenido: 'Windows 10/11 y Microsoft 365 (temas 32 a 37)', preguntas: '20', tiempo: '40 min', puntos: '0 a 20', minimo: '—' }
            ],

            /* LA COMPARACIÓN CON LA CONVOCATORIA ANTERIOR YA NO VIVE
               AQUÍ. Estaba escrita a mano y tenía errores: daba por
               nuevos los temas 67 y 68 de Gestión, que ya existían con
               el mismo enunciado en la Orden PJC/1437/2024. Ahora se
               calcula comparando los dos anexos palabra por palabra en
               _temario-anterior.js. */

        },

        /* Auxilio Judicial. Datos de la Orden PJC/1549/2025 (BOE de 30
           de diciembre de 2025). Es el único de los tres cuerpos con
           DOS ejercicios en vez de tres, y el segundo puntúa distinto:
           acierto 1 punto, fallo 0,25. */
        auxilio: {
            clave: 'auxilio',
            nombre: 'Auxilio Judicial',
            corto: 'Auxilio',
            titulacion: 'Graduado en Educación Secundaria Obligatoria o equivalente',
            plazas: { general: 382, discapacidad: 43, total: 425 },
            temas: 26,

            ejercicios: [
                { nombre: '1.º Teórico', contenido: 'Todo el programa', preguntas: '100 (+4 de reserva)', tiempo: '100 min', puntos: '0 a 60', minimo: '30', acierto: 0.60, fallo: 0.15 },
                { nombre: '2.º Práctico', contenido: 'Dos casos prácticos de diligencia judicial', preguntas: '40 (+2 de reserva)', tiempo: '60 min', puntos: '0 a 40', minimo: '—', acierto: 1, fallo: 0.25 }
            ],

            /* LA COMPARACIÓN CON LA CONVOCATORIA ANTERIOR YA NO VIVE
               AQUÍ. Estaba escrita a mano y tenía errores: daba por
               nuevos los temas 67 y 68 de Gestión, que ya existían con
               el mismo enunciado en la Orden PJC/1437/2024. Ahora se
               calcula comparando los dos anexos palabra por palabra en
               _temario-anterior.js. */
        }
    }
};

const CUERPO_POR_DEFECTO = 'gestion';

function cuerpoValido(clave) {
    return Object.prototype.hasOwnProperty.call(CONVOCATORIA.cuerpos, String(clave || ''));
}

function obtenerCuerpo(clave) {
    return CONVOCATORIA.cuerpos[cuerpoValido(clave) ? clave : CUERPO_POR_DEFECTO];
}

/* Días que faltan para el examen. Se calcula en UTC a mediodía para
   que el cambio de hora no reste o sume un día suelto. */
function diasParaExamen(hoy = new Date()) {
    const [a, m, d] = CONVOCATORIA.fechaExamen.split('-').map(Number);
    const examen = Date.UTC(a, m - 1, d, 12);
    const ahora = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate(), 12);
    return Math.round((examen - ahora) / 86400000);
}

/* Ficha completa para un usuario, según su cuerpo. */
function fichaConvocatoria(claveCuerpo, hoy = new Date()) {
    const cuerpo = obtenerCuerpo(claveCuerpo);
    const dias = diasParaExamen(hoy);

    return {
        convocatoria: CONVOCATORIA.nombre,
        ordenConvocatoria: CONVOCATORIA.ordenConvocatoria,
        idBoeConvocatoria: CONVOCATORIA.idBoeConvocatoria,
        fechaExamen: CONVOCATORIA.fechaExamen,
        diasParaExamen: dias,
        examenPasado: dias < 0,
        hitos: CONVOCATORIA.hitos,
        cuerpo
    };
}

module.exports = {
    CONVOCATORIA,
    TERMINOS_DEROGADOS,
    TERMINOS_MATIZADOS,
    CUERPO_POR_DEFECTO,
    cuerpoValido,
    obtenerCuerpo,
    diasParaExamen,
    fichaConvocatoria
};
