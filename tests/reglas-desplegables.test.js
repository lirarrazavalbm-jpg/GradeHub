// Las reglas del programa que el promedio no incluye ocupaban media pantalla de
// la ficha, siempre, aunque el estudiante ya las hubiera leído. Van plegadas.
//
// Lo que NO se puede perder al plegarlas: esto explica por qué su promedio puede
// no calzar con el del profesor. Esconderlo del todo sería peor que ocuparle
// espacio, así que plegado tiene que seguir diciendo que existe y cuántas son.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const src = ['data.js', 'engine.js', 'app.js', 'app-session.js', 'render-main.js', 'render-agenda.js']
  .map(f => fs.readFileSync(raiz + f, 'utf8')).join('\n');

// Un stub que devuelve SIEMPRE el mismo nodo por id: sin eso no se puede mirar
// lo que el render dejó escrito.
const nodos = {};
const mk = () => ({ style: { setProperty() {}, removeProperty() {}, display: '' }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return mk() }, clientWidth: 400, dataset: {}, click() {}, closest() { return null }, getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 } }, children: [], scrollTop: 0, remove() {}, insertBefore() {}, removeChild() {}, firstElementChild: null, clientHeight: 400, scrollIntoView() {} });
const porId = id => (nodos[id] = nodos[id] || mk());
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }) },
  document: { getElementById: porId, createElement: () => mk(), addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => mk(), querySelectorAll: () => [], body: mk() },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '/', search: '', hash: '' },
  history: { replaceState() {} }, setTimeout, clearTimeout, console, gtag() {},
  requestAnimationFrame() { return 0 }, cancelAnimationFrame() {},
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const run = n => vm.runInContext(n, ctx);

let ok = 0, fail = 0;
function chk(nombre, cond) { if (cond) { ok++; console.log('  ok   ' + nombre); } else { fail++; console.log('  FAIL ' + nombre); } }

// Gestión de Personas declara una regla del curso y una que no se calcula: es el
// ramo con el que se reportó que el recuadro ocupaba demasiado.
const preset = run('presetRamo')('Gestión de Personas', 'fen', null);
const r = { id: 'r1', nombre: 'Gestión de Personas', color: '#4f9', creditos: 6,
  origen: { tenant: 'fen', carrera: 'IC' },
  categorias: JSON.parse(JSON.stringify(preset.categorias)), gates: JSON.parse(JSON.stringify(preset.gates)) };
run('S').ramos = [r]; run('S').tenant = 'fen'; run("currentRamoId='r1'");
run('renderRamo')();
const html = () => porId('no-calcula-warning').innerHTML;

console.log('=== Plegado por defecto ===');
chk('el cuerpo existe pero no está abierto', /class="reglas-cuerpo"/.test(html()));
chk('el texto largo no se muestra de entrada', !/reglas-cuerpo open/.test(html()));

console.log('\n=== Pero sigue diciendo que existe ===');
chk('el resumen dice cuántas reglas son', /\d+ reglas? del programa que el promedio no incluye/.test(html()));
chk('el control es un botón accesible', /aria-expanded="false"/.test(html()));
// Si el contenido desapareciera del DOM, plegar se convertiría en esconder.
chk('las reglas siguen en el documento, solo ocultas',
  /el promedio no considera|no puede tener/.test(html()));

console.log('\n=== Se despliega y se vuelve a plegar ===');
run("toggleReglasRamo('r1')");
chk('al abrir, el cuerpo queda abierto', /reglas-cuerpo open/.test(html()));
chk('y el botón lo anuncia', /aria-expanded="true"/.test(html()));
run("toggleReglasRamo('r1')");
chk('al cerrar, vuelve a plegarse', !/reglas-cuerpo open/.test(html()));

console.log('\n=== Un ramo sin reglas no muestra nada ===');
const limpio = { id: 'r2', nombre: 'Manual', color: '#4f9', creditos: null, origen: null,
  categorias: [{ id: 'c1', nombre: 'Prueba', peso: 100, directNota: true, notas: [] }], gates: [] };
run('S').ramos = [limpio]; run("currentRamoId='r2'"); run('renderRamo')();
chk('sin reglas el recuadro queda vacío', html() === '');

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
