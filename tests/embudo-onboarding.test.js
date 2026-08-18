// El embudo del onboarding cuenta cuántos ALCANZAN cada paso.
//
// Sin esto solo se sabía cuántos terminaron (`onboarding_complete`): quien se iba
// a mitad de camino era invisible, y "se aburrió eligiendo carrera" y "no
// encontró sus ramos" se arreglan distinto.
//
// Lo que este test protege es la parte que se rompe callada: si volver atrás y
// volver a avanzar reemitiera el evento, los primeros pasos saldrían inflados y
// la caída real quedaría escondida detrás de un número que se ve bien.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const src = ['data.js', 'engine.js', 'app.js', 'render-agenda.js']
  .map(f => fs.readFileSync(raiz + f, 'utf8')).join('\n');

const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
const eventos = [];
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => stub, createElement: () => stub, addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '/', search: '', hash: '' },
  history: { replaceState() {} }, setTimeout, clearTimeout, console,
  // track() sale por acá: es el único punto donde se ve qué se manda de verdad.
  gtag: (tipo, evento, params) => eventos.push({ evento, params }),
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const run = n => vm.runInContext(n, ctx);
const irAlPaso = n => { run(`obStep=${n}`); run('obRender()'); };
const pasos = () => eventos.filter(e => e.evento === 'onboarding_step').map(e => e.params.paso);

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

console.log('\n=== Cada paso alcanzado se cuenta una vez ===');
run('obIniciar()');
chk('entrar al onboarding emite el paso 1', JSON.stringify(pasos()) === '[1]');

// El paso 5 se salta acá a propósito: dispara prepararObRamos(), que necesita el
// catálogo y la carrera elegida. El dedupe no depende del paso.
[2, 3, 4].forEach(irAlPaso);
chk('avanzar emite cada paso nuevo', JSON.stringify(pasos()) === '[1,2,3,4]');

irAlPaso(3); irAlPaso(2);
chk('volver atrás no emite nada', JSON.stringify(pasos()) === '[1,2,3,4]');

irAlPaso(3); irAlPaso(4);
chk('y volver a avanzar tampoco reemite', JSON.stringify(pasos()) === '[1,2,3,4]');

console.log('\n=== Una pasada nueva vuelve a contar ===');
// Cerrar sesión y entrar con otra cuenta no recarga la página: si el contador no
// se reiniciara, ese onboarding entero quedaría fuera del embudo.
run('obIniciar()');
chk('reentrar al onboarding vuelve a emitir el paso 1', JSON.stringify(pasos()) === '[1,2,3,4,1]');

console.log('\n=== Y nunca viaja texto del estudiante ===');
// La regla dura de la analítica. `etapa` es una etiqueta nuestra de lista
// cerrada, no lo que el estudiante escribió.
const ETAPAS = ['nombre', 'universidad', 'carrera', 'semestre', 'ramos'];
const etapas = eventos.filter(e => e.evento === 'onboarding_step');
chk('cada evento manda paso y etapa, nada más',
  etapas.every(e => Object.keys(e.params).sort().join() === 'etapa,paso'));
chk('la etapa sale de la lista cerrada',
  etapas.every(e => ETAPAS[e.params.paso - 1] === e.params.etapa));

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
