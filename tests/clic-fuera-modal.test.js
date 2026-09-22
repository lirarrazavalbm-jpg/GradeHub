// En computador, hacer clic en el fondo cierra el modal. En el teléfono no.
//
// Esta distinción existe porque el gesto único —cerrar al tocar fuera— se
// probó y falló: en táctil el toque de fondo es parte del desplazamiento y el
// simulador desaparecía a media edición (#422, #424). Así que el arreglo no es
// "volver a poner el cierre por fuera" sino ponerlo SOLO donde hay mouse.
//
// Se prueba disparando los listeners de verdad, no leyendo el archivo: el
// defecto que esto podría reintroducir no se ve en el texto del código, se ve
// en qué pasa cuando llegan mousedown y click en cierto orden.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const src = ['data.js', 'engine.js', 'app.js', 'render-agenda.js']
  .map(f => fs.readFileSync(raiz + f, 'utf8')).join('\n');

const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };

// Overlays que sí llevan la cuenta de si están abiertos: la decisión depende
// de eso y un classList que siempre dice `false` la haría trivial.
const overlay = id => {
  const o = Object.create(stub);
  o.id = id; o.abierto = false;
  o.classList = { add() { o.abierto = true; }, remove() { o.abierto = false; }, contains(c) { return c === 'open' && o.abierto; } };
  return o;
};
const modal = overlay('modal');
const confirmacion = overlay('confirm-overlay');

const oyentes = {};
let punteroFino = true;
const ctx = {
  window: { addEventListener() {}, matchMedia: q => ({ matches: /pointer:\s*fine/.test(q) ? punteroFino : true, addEventListener() {}, addListener() {} }) },
  document: {
    getElementById: id => id === 'modal' ? modal : id === 'confirm-overlay' ? confirmacion : stub,
    createElement: () => stub,
    addEventListener(tipo, fn) { (oyentes[tipo] || (oyentes[tipo] = [])).push(fn); },
    documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } },
    querySelector: () => stub, querySelectorAll: () => [], body: stub,
  },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '', hash: '' }, setTimeout, clearTimeout, console,
};
vm.createContext(ctx); vm.runInContext(src, ctx);

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

chk('el modal escucha mousedown y click', (oyentes.mousedown || []).length > 0 && (oyentes.click || []).length > 0);

// Un target con lo mínimo que cualquier listener delegado de app.js le pide.
const nodo = id => ({ id, tagName: 'DIV', closest: () => null, matches: () => false });
const fondo = nodo('modal');
const dentro = nodo('modal-content');

// Los otros listeners delegados del archivo reciben el mismo evento sintético
// y pueden reventar con él; eso no es lo que se está probando.
const disparar = (tipo, target) => (oyentes[tipo] || []).forEach(fn => { try { fn({ target, preventDefault() {}, key: null }); } catch (e) {} });
const clicCompleto = (abajo, arriba) => { disparar('mousedown', abajo); disparar('click', arriba); };

// --- con mouse ---
punteroFino = true;
modal.classList.add('open');
clicCompleto(fondo, fondo);
chk('con mouse, un clic en el fondo cierra', !modal.abierto);

modal.classList.add('open');
clicCompleto(dentro, dentro);
chk('con mouse, un clic dentro de la hoja no cierra', modal.abierto);

// El caso que hace perder trabajo: seleccionar texto adentro y soltar afuera.
modal.classList.add('open');
clicCompleto(dentro, fondo);
chk('arrastrar desde dentro y soltar en el fondo no cierra', modal.abierto);

// La confirmación se dibuja encima y el clic es suyo.
modal.classList.add('open');
confirmacion.classList.add('open');
clicCompleto(fondo, fondo);
chk('con la confirmación abierta, el clic no cierra el modal de atrás', modal.abierto);
confirmacion.classList.remove('open');

// --- en táctil ---
punteroFino = false;
modal.classList.add('open');
clicCompleto(fondo, fondo);
chk('en táctil, tocar el fondo NO cierra (#422, #424)', modal.abierto);

punteroFino = true;
modal.classList.remove('open');

console.log(`\n${ok} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
