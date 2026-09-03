// Reescribir la misma casilla dejaba varias notas de esa casilla, y eso hacía
// tres daños de tamaños muy distintos.
//
// El defecto: mientras normalize descartaba `slot`, `setSlotNota` no encontraba
// la nota anterior —limpia con `filter(n=>n.slot!==slot)`— y agregaba otra.
// Reescribir Informe 0 seis veces dejaba SEIS notas de la misma casilla.
//
// Lo visible era el contador diciendo 6/6 y el ramo declarándose 70% evaluado
// con una sola evaluación rendida. Lo grave era otra cosa: `avgPond` promedia
// todas las notas de la categoría, así que quien escribió 5,0 y después 6,0
// terminaba con 5,5 de nota. El promedio del ramo estaba malo, en silencio.
//
// Se conserva la ÚLTIMA de cada casilla: `setSlotNota` agrega al final, así que
// es la más reciente. Las anteriores eran intentos pisados, no notas distintas.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const src = ['data.js', 'engine.js', 'app.js', 'app-session.js', 'render-main.js', 'render-agenda.js']
  .map(f => fs.readFileSync(raiz + f, 'utf8')).join('\n');
const mk = () => ({ style: { setProperty() {}, removeProperty() {}, display: '' }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return mk() }, clientWidth: 400, dataset: {}, click() {}, closest() { return null }, getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 } }, children: [], scrollTop: 0, remove() {}, insertBefore() {}, removeChild() {}, firstElementChild: null, clientHeight: 400, scrollIntoView() {} });
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => mk(), createElement: () => mk(), addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => mk(), querySelectorAll: () => [], body: mk() },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '/', search: '', hash: '' },
  history: { replaceState() {} }, getComputedStyle: () => ({ getPropertyValue: () => '0ms' }),
  setTimeout, clearTimeout, console, gtag() {}, requestAnimationFrame() { return 0 }, cancelAnimationFrame() {},
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const run = n => vm.runInContext(n, ctx);

let ok = 0, fail = 0;
function chk(nombre, cond) { if (cond) { ok++; console.log('  ok   ' + nombre); } else { fail++; console.log('  FAIL ' + nombre); } }
function eq(nombre, a, b) { chk(`${nombre} (= ${b}, dio ${a})`, Math.abs(a - b) < 0.005); }

// El caso real: Laboratorio de Dinámica, Informes con 6 casillas y 70% del ramo.
const lab = run('presetRamo')('Laboratorio de Dinámica', 'uc', 'ING-PC');
function conNotas(notas) {
  const r = { id: 'r1', nombre: 'Laboratorio de Dinámica', color: '#4f9', creditos: 3,
    origen: { tenant: 'uc', carrera: 'ING-PC' },
    categorias: JSON.parse(JSON.stringify(lab.categorias)), gates: JSON.parse(JSON.stringify(lab.gates)) };
  r.categorias.find(c => c.nombre === 'Informes').notas = notas;
  const norm = run('normalize')({ ...run('freshState')(), ramos: [r], tenant: 'uc' });
  const ramo = norm.ramos[0];
  return { ramo, informes: ramo.categorias.find(c => c.nombre === 'Informes') };
}

console.log('=== Seis reescrituras de la misma casilla son UNA nota ===');
const dup = conNotas(Array.from({ length: 6 }, (_, i) => ({ id: 'n' + i, nombre: 'Informe 0', valor: 5.0 + i * 0.1, peso: 1 })));
chk('queda una sola nota', dup.informes.notas.length === 1);
eq('y es la última escrita', dup.informes.notas[0].valor, 5.5);
eq('el promedio de la categoría es esa nota, no el de los seis intentos',
  run('avgPond')(dup.informes.notas), 5.5);

console.log('\n=== Y los contadores dejan de inflarse ===');
eq('el ramo avanza una sexta parte del 70%', run('ramoProgress')(dup.ramo).pct, 12);
chk('las casillas con nota son una, no seis',
  new Set(dup.informes.notas.filter(n => Number.isInteger(n.slot)).map(n => n.slot)).size === 1);

console.log('\n=== Casillas distintas sí se conservan todas ===');
const varias = conNotas([0, 1, 2].map(i => ({ id: 'm' + i, nombre: 'Informe ' + i, valor: 6.0, peso: 1 })));
chk('tres casillas distintas siguen siendo tres notas', varias.informes.notas.length === 3);
eq('y el avance refleja tres de seis', run('ramoProgress')(varias.ramo).pct, 35);

console.log('\n=== Una categoría sin casillas no se toca ===');
const suelta = { id: 'r2', nombre: 'Manual', color: '#4f9', creditos: null, origen: null,
  categorias: [{ id: 'c1', nombre: 'Trabajos', peso: 100, directNota: false,
    notas: [{ id: 'a', nombre: 'T1', valor: 5, peso: 1 }, { id: 'b', nombre: 'T2', valor: 6, peso: 1 }] }], gates: [] };
const libre = run('normalize')({ ...run('freshState')(), ramos: [suelta] }).ramos[0];
chk('dos notas sin slot siguen siendo dos', libre.categorias[0].notas.length === 2);

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
