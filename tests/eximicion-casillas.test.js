// La eximición decide si el Examen deja de ser obligatorio. Es la conclusión más
// cara que saca esta app: si se equivoca, alguien no va a una prueba.
//
// `promedioCompletoSinDescarte` exige que la categoría esté COMPLETA antes de
// decidir —"cuatro de cinco no son una aproximación suficiente"— pero contaba
// notas, no casillas. Con notas duplicadas de una misma casilla, tres Controles
// rendidos parecían cinco y la regla se disparaba, además promediando intentos
// repetidos en vez de las notas reales.
//
// `normalize` hoy colapsa los duplicados, así que esto es defensa en
// profundidad. Va igual porque el costo de equivocarse acá no se parece al de
// equivocarse en un contador.
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

// Ingeniería de Sistemas de Transporte: cinco Controles, eximición con 5,5.
const preset = run('presetRamo')('Ingeniería de Sistemas de Transporte', 'uc', 'ING-PC');
function conControles(notas) {
  const r = { id: 'r1', nombre: 'Ingeniería de Sistemas de Transporte', color: '#4f9', creditos: 10,
    origen: { tenant: 'uc', carrera: 'ING-PC' },
    categorias: JSON.parse(JSON.stringify(preset.categorias)), gates: JSON.parse(JSON.stringify(preset.gates)) };
  r.categorias.find(c => c.nombre === 'Controles').notas = notas;
  run('S').ramos = [r]; run('S').tenant = 'uc';
  return r;
}
const nota = (slot, valor, id) => ({ id: id || ('n' + slot + '-' + valor), nombre: 'Control ' + (slot + 1), valor, peso: 1, slot });

console.log('=== Tres controles con reescrituras NO son cinco ===');
// Tres casillas rendidas, cinco notas guardadas: el caso que la hacía disparar.
const trucado = conControles([
  nota(0, 6.0), nota(0, 6.2), nota(1, 6.0), nota(1, 6.4), nota(2, 6.0),
]);
const ex1 = run('estadoEximicion')(trucado);
chk('con 3 de 5 casillas la eximición no se activa', !(ex1 && ex1.activa));

console.log('\n=== Las cinco casillas de verdad sí la activan ===');
const completo = conControles([0, 1, 2, 3, 4].map(i => nota(i, 6.0)));
const ex2 = run('estadoEximicion')(completo);
chk('con las cinco rendidas y promedio 6,0 se exime', !!(ex2 && ex2.activa));

console.log('\n=== Y el promedio que decide es el de las notas reales ===');
// Si contara los duplicados, el promedio saldría de intentos pisados.
// El intento viejo va PRIMERO: `setSlotNota` agrega al final, así que la
// última de cada casilla es la vigente. Ese es el mismo criterio con el que
// normalize colapsa duplicados.
const conDup = conControles([nota(0, 1.0, 'viejo'), ...[0, 1, 2, 3, 4].map(i => nota(i, 6.0))]);
const ex3 = run('estadoEximicion')(conDup);
chk('un duplicado no arrastra la decisión hacia abajo', !!(ex3 && ex3.activa));

console.log('\n=== Bajo el umbral sigue sin eximir ===');
const bajo = conControles([0, 1, 2, 3, 4].map(i => nota(i, 5.0)));
const ex4 = run('estadoEximicion')(bajo);
chk('con 5,0 de promedio no se exime', !(ex4 && ex4.activa));

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
