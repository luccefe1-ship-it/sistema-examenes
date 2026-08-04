// Pruebas de la navegacion entre resultados del buscador del documento.
// Ejecutar desde la raiz del repo:  npm test
//
// No usa jsdom a proposito: hace falta tan poco DOM que sale mas barato
// simularlo aqui que arrastrar una dependencia de 20 MB.

// ------------------------------------------------------------
// DOM minimo: solo lo que tocan irAResultado / moverResultado
// ------------------------------------------------------------

class ClassListFalso {
    constructor() { this.clases = new Set(); }
    add(c) { this.clases.add(c); }
    remove(c) { this.clases.delete(c); }
    contains(c) { return this.clases.has(c); }
}

class MarcaFalsa {
    constructor(texto) {
        this.textContent = texto;
        this.classList = new ClassListFalso();
        this.vecesVisitada = 0;
    }
    scrollIntoView() { this.vecesVisitada++; }
}

class ContenedorFalso {
    constructor(numMarcas) {
        this.marcas = Array.from({ length: numMarcas }, (_, i) => new MarcaFalsa('coincidencia ' + i));
        this.dataset = {};
    }
    querySelectorAll(selector) {
        // Solo se consulta por la clase de busqueda
        if (selector.includes('busqueda-highlight')) return this.marcas;
        return [];
    }
    querySelector(selector) {
        const todas = this.querySelectorAll(selector);
        return todas.length ? todas[0] : null;
    }
    get activa() {
        return this.marcas.findIndex(m => m.classList.contains('busqueda-activa'));
    }
    get cuantasActivas() {
        return this.marcas.filter(m => m.classList.contains('busqueda-activa')).length;
    }
}

const mod = await import(new URL('../js/busqueda-navegacion.js', import.meta.url).href);
const { irAResultado, moverResultado, estadoBusqueda } = mod;

const registrar = (...a) => process.stdout.write(a.join(' ') + '\n');
let pasadas = 0, fallidas = 0;
const fallos = [];

function comprobar(nombre, condicion, detalle) {
    if (condicion) { pasadas++; registrar(`  ✅ ${nombre}`); }
    else { fallidas++; fallos.push(nombre); registrar(`  ❌ ${nombre}${detalle ? '  → ' + detalle : ''}`); }
}

// ============================================================
registrar('\n── 1. Ir a una coincidencia concreta ──');
// ============================================================
{
    const c = new ContenedorFalso(5);
    const r = irAResultado(c, 0);

    comprobar('Devuelve 1 de 5 (contador en base 1)', r.actual === 1 && r.total === 5, JSON.stringify(r));
    comprobar('Marca la primera como activa', c.activa === 0);
    comprobar('Solo hay UNA activa', c.cuantasActivas === 1);
    comprobar('Hace scroll hasta ella', c.marcas[0].vecesVisitada === 1);
}

// ============================================================
registrar('\n── 2. Avanzar y retroceder ──');
// ============================================================
{
    const c = new ContenedorFalso(4);
    irAResultado(c, 0);

    const r1 = moverResultado(c, 1);
    comprobar('Siguiente lleva a la 2', r1.actual === 2 && c.activa === 1);

    moverResultado(c, 1);
    const r3 = moverResultado(c, 1);
    comprobar('Tres saltos llevan a la 4', r3.actual === 4 && c.activa === 3);

    const r4 = moverResultado(c, -1);
    comprobar('Anterior vuelve a la 3', r4.actual === 3 && c.activa === 2);
    comprobar('Sigue habiendo solo una activa', c.cuantasActivas === 1);
}

// ============================================================
registrar('\n── 3. Da la vuelta por los dos lados ──');
// ============================================================
{
    const c = new ContenedorFalso(3);
    irAResultado(c, 2); // la última

    const siguiente = moverResultado(c, 1);
    comprobar('De la última pasa a la primera', siguiente.actual === 1 && c.activa === 0);

    const anterior = moverResultado(c, -1);
    comprobar('De la primera pasa a la última', anterior.actual === 3 && c.activa === 2);
}

// ============================================================
registrar('\n── 4. Casos límite ──');
// ============================================================
{
    const vacio = new ContenedorFalso(0);
    const r = moverResultado(vacio, 1);
    comprobar('Sin coincidencias devuelve 0/0 y no rompe', r.actual === 0 && r.total === 0);
    comprobar('estadoBusqueda también dice 0/0', estadoBusqueda(vacio).total === 0);

    const una = new ContenedorFalso(1);
    irAResultado(una, 0);
    const soloUna = moverResultado(una, 1);
    comprobar('Con una sola coincidencia, siguiente se queda en ella', soloUna.actual === 1 && soloUna.total === 1);

    const c = new ContenedorFalso(3);
    comprobar('Un índice enorme no se sale del rango', irAResultado(c, 99).actual === 1);
    comprobar('Un índice negativo tampoco', irAResultado(c, -1).actual === 3);

    comprobar('Contenedor nulo no rompe', irAResultado(null, 0).total === 0);
    comprobar('moverResultado con nulo no rompe', moverResultado(null, 1).total === 0);
}

// ============================================================
registrar('\n── 5. El contador refleja el estado sin mover nada ──');
// ============================================================
{
    const c = new ContenedorFalso(7);
    irAResultado(c, 3);
    const antes = c.marcas[3].vecesVisitada;

    const estado = estadoBusqueda(c);
    comprobar('Dice 4 de 7', estado.actual === 4 && estado.total === 7, JSON.stringify(estado));
    comprobar('Consultar el estado no provoca scroll', c.marcas[3].vecesVisitada === antes);
}

// ------------------------------------------------------------
registrar('\n' + '═'.repeat(52));
registrar(`  ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas) registrar('  Fallos: ' + fallos.join(' | '));
registrar('═'.repeat(52) + '\n');
process.exit(fallidas ? 1 : 0);
