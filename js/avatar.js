/* ==================================================================
   GENERADOR DE AVATARES
   ------------------------------------------------------------------
   Dibuja el avatar en SVG desde el propio código. Sin servicios de
   terceros a propósito: no hace peticiones a nadie, no depende de que
   otra empresa siga viva, y en Firestore solo se guarda un objeto de
   ocho campos en vez de una imagen.

   Uso:
     import { dibujarAvatar, AVATAR_POR_DEFECTO } from './avatar.js';
     elemento.innerHTML = dibujarAvatar(opciones);
================================================================== */

export const PIELES = [
    { id: 'clara',    color: '#f8d9c0', sombra: '#e8bfa0' },
    { id: 'media',    color: '#eabb92', sombra: '#d29f74' },
    { id: 'morena',   color: '#c68642', sombra: '#a86d33' },
    { id: 'oscura',   color: '#8d5524', sombra: '#6f4019' },
    { id: 'muyoscura',color: '#5c3317', sombra: '#432310' }
];

export const COLORES_PELO = [
    { id: 'negro',     color: '#2b2b2b' },
    { id: 'castano',   color: '#5a3821' },
    { id: 'rubio',     color: '#d9a441' },
    { id: 'pelirrojo', color: '#b5442a' },
    { id: 'gris',      color: '#9e9e9e' },
    { id: 'fantasia',  color: '#7c3aed' }
];

export const PEINADOS = [
    { id: 'corto',    nombre: 'Corto' },
    { id: 'flequillo',nombre: 'Flequillo' },
    { id: 'rizado',   nombre: 'Rizado' },
    { id: 'largo',    nombre: 'Largo' },
    { id: 'coleta',   nombre: 'Coleta' },
    { id: 'mono',     nombre: 'Moño' },
    { id: 'afro',     nombre: 'Afro' },
    { id: 'rapado',   nombre: 'Rapado' }
];

export const OJOS = [
    { id: 'normales', nombre: 'Normales' },
    { id: 'felices',  nombre: 'Contentos' },
    { id: 'grandes',  nombre: 'Grandes' },
    { id: 'guino',    nombre: 'Guiño' }
];

export const BOCAS = [
    { id: 'sonrisa',  nombre: 'Sonrisa' },
    { id: 'sonrisota',nombre: 'Sonrisota' },
    { id: 'seria',    nombre: 'Seria' },
    { id: 'sorpresa', nombre: 'Sorpresa' }
];

export const ACCESORIOS = [
    { id: 'ninguno',  nombre: 'Ninguno' },
    { id: 'gafas',    nombre: 'Gafas' },
    { id: 'gafassol', nombre: 'Gafas de sol' },
    { id: 'gorra',    nombre: 'Gorra' },
    { id: 'pendientes', nombre: 'Pendientes' },
    { id: 'auriculares', nombre: 'Auriculares' }
];

export const VELLO = [
    { id: 'ninguno', nombre: 'Nada' },
    { id: 'bigote',  nombre: 'Bigote' },
    { id: 'perilla', nombre: 'Perilla' },
    { id: 'barba',   nombre: 'Barba' }
];

export const COLORES_ROPA = [
    { id: 'morado', color: '#7c3aed' },
    { id: 'azul',   color: '#2563eb' },
    { id: 'verde',  color: '#059669' },
    { id: 'rojo',   color: '#dc2626' },
    { id: 'naranja',color: '#ea580c' },
    { id: 'gris',   color: '#475569' }
];

export const FONDOS = [
    { id: 'lavanda', color: '#ede9fe' },
    { id: 'cielo',   color: '#dbeafe' },
    { id: 'menta',   color: '#d1fae5' },
    { id: 'melocoton', color: '#ffedd5' },
    { id: 'rosa',    color: '#fce7f3' },
    { id: 'gris',    color: '#e5e7eb' }
];

export const AVATAR_POR_DEFECTO = {
    genero: 'chico',
    piel: 'clara',
    colorPelo: 'castano',
    peinado: 'corto',
    ojos: 'normales',
    boca: 'sonrisa',
    accesorio: 'ninguno',
    vello: 'ninguno',
    colorRopa: 'morado',
    fondo: 'lavanda'
};

// Busca en un catálogo, con red de seguridad si el id no existe
function elegir(catalogo, id, porDefecto) {
    return catalogo.find(x => x.id === id) || catalogo.find(x => x.id === porDefecto) || catalogo[0];
}

/* ------------------------------------------------------------------
   Piezas del dibujo
------------------------------------------------------------------ */
function dibujarPelo(peinado, color) {
    switch (peinado) {
        case 'rapado':
            return `<path d="M62 88 Q62 44 100 44 Q138 44 138 88 Q138 70 100 70 Q62 70 62 88 Z" fill="${color}" opacity="0.9"/>`;

        case 'corto':
            return `<path d="M60 90 Q58 42 100 42 Q142 42 140 90 Q140 66 122 62 Q110 72 96 64 Q76 62 60 90 Z" fill="${color}"/>`;

        case 'flequillo':
            return `<path d="M58 92 Q56 40 100 40 Q144 40 142 92 Q142 68 138 64 L62 64 Q58 68 58 92 Z" fill="${color}"/>
                    <path d="M60 66 Q100 52 140 66 L140 78 Q100 62 60 78 Z" fill="${color}"/>`;

        case 'rizado':
            return `<g fill="${color}">
                        <circle cx="70" cy="70" r="16"/><circle cx="90" cy="58" r="18"/>
                        <circle cx="112" cy="58" r="18"/><circle cx="131" cy="72" r="16"/>
                        <circle cx="63" cy="88" r="13"/><circle cx="138" cy="88" r="13"/>
                    </g>`;

        case 'largo':
            return `<path d="M56 150 Q50 60 100 40 Q150 60 144 150 Q136 120 136 96 Q136 66 100 62 Q64 66 64 96 Q64 120 56 150 Z" fill="${color}"/>`;

        case 'coleta':
            return `<path d="M60 92 Q58 42 100 42 Q142 42 140 92 Q140 66 100 62 Q60 66 60 92 Z" fill="${color}"/>
                    <path d="M138 78 Q168 88 162 128 Q152 132 148 112 Q146 92 136 90 Z" fill="${color}"/>`;

        case 'mono':
            return `<path d="M60 92 Q58 44 100 44 Q142 44 140 92 Q140 68 100 64 Q60 68 60 92 Z" fill="${color}"/>
                    <circle cx="100" cy="34" r="17" fill="${color}"/>`;

        case 'afro':
            return `<circle cx="100" cy="66" r="46" fill="${color}"/>
                    <circle cx="100" cy="82" r="36" fill="${color}"/>`;

        default:
            return '';
    }
}

function dibujarOjos(tipo) {
    const negro = '#3b3b4f';
    switch (tipo) {
        case 'felices':
            return `<path d="M74 100 Q82 92 90 100" stroke="${negro}" stroke-width="4" fill="none" stroke-linecap="round"/>
                    <path d="M110 100 Q118 92 126 100" stroke="${negro}" stroke-width="4" fill="none" stroke-linecap="round"/>`;

        case 'grandes':
            return `<circle cx="82" cy="99" r="9" fill="#fff"/><circle cx="83" cy="100" r="5.5" fill="${negro}"/>
                    <circle cx="118" cy="99" r="9" fill="#fff"/><circle cx="119" cy="100" r="5.5" fill="${negro}"/>
                    <circle cx="80" cy="96" r="2" fill="#fff"/><circle cx="116" cy="96" r="2" fill="#fff"/>`;

        case 'guino':
            return `<circle cx="82" cy="99" r="4.5" fill="${negro}"/>
                    <path d="M110 100 Q118 94 126 100" stroke="${negro}" stroke-width="4" fill="none" stroke-linecap="round"/>`;

        default: // normales
            return `<circle cx="82" cy="99" r="4.5" fill="${negro}"/>
                    <circle cx="118" cy="99" r="4.5" fill="${negro}"/>`;
    }
}

function dibujarBoca(tipo) {
    switch (tipo) {
        case 'sonrisota':
            return `<path d="M84 118 Q100 134 116 118 Z" fill="#b3475b"/>
                    <path d="M87 120 Q100 124 113 120 Z" fill="#fff"/>`;

        case 'seria':
            return `<path d="M88 121 L112 121" stroke="#b3475b" stroke-width="3.5" stroke-linecap="round"/>`;

        case 'sorpresa':
            return `<ellipse cx="100" cy="121" rx="7" ry="9" fill="#b3475b"/>`;

        default: // sonrisa
            return `<path d="M86 117 Q100 129 114 117" stroke="#b3475b" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
    }
}

function dibujarVello(tipo, colorPelo) {
    switch (tipo) {
        case 'bigote':
            return `<path d="M86 112 Q100 106 114 112 Q100 116 86 112 Z" fill="${colorPelo}"/>`;

        case 'perilla':
            return `<path d="M92 128 Q100 140 108 128 Q100 133 92 128 Z" fill="${colorPelo}"/>`;

        case 'barba':
            return `<path d="M66 104 Q68 146 100 150 Q132 146 134 104 Q130 132 100 134 Q70 132 66 104 Z" fill="${colorPelo}" opacity="0.92"/>`;

        default:
            return '';
    }
}

function dibujarAccesorio(tipo, colorRopa) {
    switch (tipo) {
        case 'gafas':
            return `<g fill="none" stroke="#3b3b4f" stroke-width="3.2">
                        <circle cx="82" cy="99" r="13"/><circle cx="118" cy="99" r="13"/>
                        <path d="M95 99 L105 99"/><path d="M69 96 L60 92"/><path d="M131 96 L140 92"/>
                    </g>`;

        case 'gafassol':
            return `<g>
                        <circle cx="82" cy="99" r="13" fill="#2b2b3d"/><circle cx="118" cy="99" r="13" fill="#2b2b3d"/>
                        <path d="M95 99 L105 99" stroke="#2b2b3d" stroke-width="3.2"/>
                        <path d="M69 96 L60 92" stroke="#2b2b3d" stroke-width="3.2"/>
                        <path d="M131 96 L140 92" stroke="#2b2b3d" stroke-width="3.2"/>
                        <path d="M74 93 L79 90" stroke="#fff" stroke-width="2" opacity="0.5"/>
                    </g>`;

        case 'gorra':
            return `<path d="M56 74 Q56 34 100 34 Q144 34 144 74 L56 74 Z" fill="${colorRopa}"/>
                    <path d="M52 74 Q100 66 148 74 Q148 82 100 80 Q52 82 52 74 Z" fill="${colorRopa}" opacity="0.85"/>
                    <circle cx="100" cy="36" r="5" fill="#fff" opacity="0.7"/>`;

        case 'pendientes':
            return `<circle cx="60" cy="106" r="4.5" fill="#facc15"/>
                    <circle cx="140" cy="106" r="4.5" fill="#facc15"/>`;

        case 'auriculares':
            return `<path d="M58 96 Q58 46 100 46 Q142 46 142 96" stroke="#3b3b4f" stroke-width="6" fill="none" stroke-linecap="round"/>
                    <rect x="48" y="90" width="16" height="26" rx="8" fill="${colorRopa}"/>
                    <rect x="136" y="90" width="16" height="26" rx="8" fill="${colorRopa}"/>`;

        default:
            return '';
    }
}

/* ------------------------------------------------------------------
   Dibujo completo
------------------------------------------------------------------ */
export function dibujarAvatar(opciones = {}, tamano = null) {
    const o = { ...AVATAR_POR_DEFECTO, ...opciones };

    const piel = elegir(PIELES, o.piel, 'clara');
    const pelo = elegir(COLORES_PELO, o.colorPelo, 'castano');
    const ropa = elegir(COLORES_ROPA, o.colorRopa, 'morado');
    const fondo = elegir(FONDOS, o.fondo, 'lavanda');

    // La gorra tapa el pelo por arriba, así que se dibuja el pelo antes
    const llevaGorra = o.accesorio === 'gorra';
    const peinadoVisible = llevaGorra && o.peinado !== 'largo' && o.peinado !== 'coleta' ? 'rapado' : o.peinado;

    const medidas = tamano ? `width="${tamano}" height="${tamano}"` : 'width="100%" height="100%"';

    return `
<svg viewBox="0 0 200 200" ${medidas} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Avatar del usuario">
    <circle cx="100" cy="100" r="100" fill="${fondo.color}"/>

    <!-- Hombros -->
    <path d="M38 200 Q42 152 100 148 Q158 152 162 200 Z" fill="${ropa.color}"/>
    <path d="M84 152 Q100 168 116 152 L110 146 Q100 152 90 146 Z" fill="${ropa.color}" opacity="0.75"/>

    <!-- Cuello -->
    <rect x="88" y="128" width="24" height="26" rx="10" fill="${piel.sombra}"/>

    <!-- Orejas -->
    <circle cx="60" cy="104" r="9" fill="${piel.color}"/>
    <circle cx="140" cy="104" r="9" fill="${piel.color}"/>

    <!-- Cara -->
    <ellipse cx="100" cy="100" rx="40" ry="46" fill="${piel.color}"/>

    <!-- Pelo -->
    ${dibujarPelo(peinadoVisible, pelo.color)}

    <!-- Cejas -->
    <path d="M72 86 Q82 81 92 86" stroke="${pelo.color}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <path d="M108 86 Q118 81 128 86" stroke="${pelo.color}" stroke-width="3.5" fill="none" stroke-linecap="round"/>

    ${dibujarOjos(o.ojos)}

    <!-- Nariz -->
    <path d="M100 104 Q97 112 101 113" stroke="${piel.sombra}" stroke-width="3" fill="none" stroke-linecap="round"/>

    ${dibujarBoca(o.boca)}
    ${dibujarVello(o.vello, pelo.color)}
    ${dibujarAccesorio(o.accesorio, ropa.color)}
</svg>`.trim();
}

/* Avatar de arranque distinto según el género elegido, para que la
   primera impresión ya se parezca a algo. */
export function avatarInicial(genero) {
    return genero === 'chica'
        ? { ...AVATAR_POR_DEFECTO, genero: 'chica', peinado: 'largo', ojos: 'grandes', accesorio: 'pendientes', vello: 'ninguno' }
        : { ...AVATAR_POR_DEFECTO, genero: 'chico', peinado: 'corto' };
}

/* Limpia lo que venga de Firestore: si alguien mete a mano un valor
   raro, el avatar sigue dibujándose en vez de romperse. */
export function sanearAvatar(datos) {
    if (!datos || typeof datos !== 'object') return { ...AVATAR_POR_DEFECTO };
    return {
        genero: datos.genero === 'chica' ? 'chica' : 'chico',
        piel: elegir(PIELES, datos.piel, 'clara').id,
        colorPelo: elegir(COLORES_PELO, datos.colorPelo, 'castano').id,
        peinado: elegir(PEINADOS, datos.peinado, 'corto').id,
        ojos: elegir(OJOS, datos.ojos, 'normales').id,
        boca: elegir(BOCAS, datos.boca, 'sonrisa').id,
        accesorio: elegir(ACCESORIOS, datos.accesorio, 'ninguno').id,
        vello: elegir(VELLO, datos.vello, 'ninguno').id,
        colorRopa: elegir(COLORES_ROPA, datos.colorRopa, 'morado').id,
        fondo: elegir(FONDOS, datos.fondo, 'lavanda').id
    };
}
