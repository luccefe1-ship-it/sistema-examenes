/* ==================================================================
   SELECTOR DE AVATAR
   Se usa en dos sitios: al registrarse y al editarlo desde Mi Perfil.
   Vive aquí para no tener dos copias que se desincronicen.
================================================================== */

import {
    dibujarAvatar, avatarInicial, sanearAvatar,
    PIELES, COLORES_PELO, PEINADOS, OJOS, BOCAS, ACCESORIOS, VELLO, COLORES_ROPA, FONDOS
} from './avatar.js';

const GRUPOS_COLOR = [
    { clave: 'piel',      titulo: 'Tono de piel', catalogo: PIELES },
    { clave: 'colorPelo', titulo: 'Color de pelo', catalogo: COLORES_PELO },
    { clave: 'colorRopa', titulo: 'Color de ropa', catalogo: COLORES_ROPA },
    { clave: 'fondo',     titulo: 'Fondo',         catalogo: FONDOS }
];

const GRUPOS_FORMA = [
    { clave: 'peinado',   titulo: 'Peinado',   catalogo: PEINADOS },
    { clave: 'ojos',      titulo: 'Ojos',      catalogo: OJOS },
    { clave: 'boca',      titulo: 'Boca',      catalogo: BOCAS },
    { clave: 'accesorio', titulo: 'Accesorio', catalogo: ACCESORIOS },
    { clave: 'vello',     titulo: 'Barba',     catalogo: VELLO }
];

/* Monta el selector dentro de un contenedor.
   Devuelve { obtener, fijar } para leer o cambiar la selección. */
export function montarSelectorAvatar(contenedor, avatarInicialDado) {
    let actual = sanearAvatar(avatarInicialDado || avatarInicial('chico'));

    contenedor.innerHTML = `
        <div class="avatar-selector">
            <div class="avatar-vista" id="avatarVista"></div>

            <div class="avatar-genero">
                <button type="button" class="avatar-genero-btn" data-genero="chico">👦 Chico</button>
                <button type="button" class="avatar-genero-btn" data-genero="chica">👧 Chica</button>
            </div>

            <div class="avatar-grupos" id="avatarGrupos"></div>

            <button type="button" class="avatar-azar" id="avatarAzar">🎲 Sorpréndeme</button>
        </div>
    `;

    const vista = contenedor.querySelector('#avatarVista');
    const grupos = contenedor.querySelector('#avatarGrupos');

    function pintarVista() {
        vista.innerHTML = dibujarAvatar(actual);
    }

    function pintarGrupos() {
        // La barba solo se ofrece si el avatar es un chico
        const formas = GRUPOS_FORMA.filter(g => g.clave !== 'vello' || actual.genero === 'chico');

        grupos.innerHTML = [
            ...formas.map(g => `
                <div class="avatar-grupo">
                    <label>${g.titulo}</label>
                    <div class="avatar-opciones">
                        ${g.catalogo.map(op => `
                            <button type="button" class="avatar-op ${actual[g.clave] === op.id ? 'activa' : ''}"
                                    data-clave="${g.clave}" data-valor="${op.id}">${op.nombre}</button>
                        `).join('')}
                    </div>
                </div>
            `),
            ...GRUPOS_COLOR.map(g => `
                <div class="avatar-grupo">
                    <label>${g.titulo}</label>
                    <div class="avatar-opciones">
                        ${g.catalogo.map(op => `
                            <button type="button" class="avatar-color ${actual[g.clave] === op.id ? 'activa' : ''}"
                                    data-clave="${g.clave}" data-valor="${op.id}"
                                    style="background:${op.color}" title="${op.id}"></button>
                        `).join('')}
                    </div>
                </div>
            `)
        ].join('');
    }

    function refrescar() {
        pintarVista();
        pintarGrupos();
        contenedor.querySelectorAll('.avatar-genero-btn').forEach(b => {
            b.classList.toggle('activa', b.dataset.genero === actual.genero);
        });
    }

    // Un solo escuchador para todo el bloque: los botones se repintan
    contenedor.addEventListener('click', (e) => {
        const genero = e.target.closest('.avatar-genero-btn');
        if (genero) {
            actual = sanearAvatar({ ...actual, ...avatarInicial(genero.dataset.genero), ...{
                piel: actual.piel, colorPelo: actual.colorPelo, colorRopa: actual.colorRopa, fondo: actual.fondo
            }});
            refrescar();
            return;
        }

        const opcion = e.target.closest('.avatar-op, .avatar-color');
        if (opcion) {
            actual = sanearAvatar({ ...actual, [opcion.dataset.clave]: opcion.dataset.valor });
            refrescar();
            return;
        }

        if (e.target.closest('#avatarAzar')) {
            const alAzar = lista => lista[Math.floor(Math.random() * lista.length)].id;
            actual = sanearAvatar({
                genero: actual.genero,
                piel: alAzar(PIELES),
                colorPelo: alAzar(COLORES_PELO),
                peinado: alAzar(PEINADOS),
                ojos: alAzar(OJOS),
                boca: alAzar(BOCAS),
                accesorio: alAzar(ACCESORIOS),
                vello: actual.genero === 'chico' ? alAzar(VELLO) : 'ninguno',
                colorRopa: alAzar(COLORES_ROPA),
                fondo: alAzar(FONDOS)
            });
            refrescar();
        }
    });

    refrescar();

    return {
        obtener: () => ({ ...actual }),
        fijar: (nuevo) => { actual = sanearAvatar(nuevo); refrescar(); }
    };
}
