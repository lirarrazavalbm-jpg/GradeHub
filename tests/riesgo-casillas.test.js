// La tarjeta "Ramo en riesgo" de Estadísticas le dice al estudiante qué nota
// necesita en lo que le queda. Tenía su PROPIA cuenta del peso pendiente —la
// tercera copia de la misma fórmula— y repartía por categoría entera: una
// categoría con `slots:6` y una sola nota se daba por cerrada.
//
// Con un informe de seis en el Laboratorio de Dinámica pedía 5,2 donde el
// número real es 4,07. No lanza ningún error: asusta de más, o tranquiliza de
// más si la nota fue alta, en la pantalla donde alguien decide qué estudiar.

const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
// `GRADEHUB_APP` permite correr este test contra otro app.js. Es lo que prueba
// que el test sirve: contra el árbol anterior tiene que FALLAR.
const app = process.env.GRADEHUB_APP || raiz + 'app.js';
const src = ['data.js', 'engine.js'].map(f => fs.readFileSync(raiz + f, 'utf8'))
  .concat(fs.readFileSync(app, 'utf8'),
    ['app-session.js', 'render-main.js', 'render-agenda.js'].map(f => fs.readFileSync(raiz + f, 'utf8'))).join('\n');
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
function chk(nombre, cond) { if (cond) { ok++; console.log('  OK   ' + nombre); } else { fail++; console.log('  FAIL ' + nombre); } }

// Laboratorio de Dinámica UC: Controles 10% (5 casillas), Informes 70% (6),
// Evaluación de pares 20% (6). El caso real: un solo informe rendido.
const preset = run('presetRamo')('Laboratorio de Dinámica', 'uc', 'ING-PC');
function conInforme(valor) {
  const r = { id: 'lab', nombre: 'Laboratorio de Dinámica', color: '#4f9', creditos: 0,
    origen: { tenant: 'uc', carrera: 'ING-PC' },
    categorias: JSON.parse(JSON.stringify(preset.categorias)), gates: JSON.parse(JSON.stringify(preset.gates || [])) };
  r.categorias.find(c => /informe/i.test(c.nombre)).notas = [
    { id: 'i0', nombre: 'Informe 1', valor, peso: 1, slot: 0 }];
  run('S').ramos = [r]; run('S').tenant = 'uc';
  return r;
}

console.log('=== Un informe de seis no cierra el 70% del ramo ===');
conInforme(3.5);
const risky = run('mostRiskyRamo')();
chk('la tarjeta aparece', !!risky);
// 70/6 = 11,67 de peso rendido con 3,5; quedan 58,33 de Informes + 30 del resto.
// (400 - 40,83) / 88,33 = 4,07. La cuenta vieja daba 5,17.
chk('pide 4,07 y no 5,2', !!risky && Math.abs(risky.needed - 4.07) < 0.02);

console.log('\n=== El que ya no puede aprobar es el que más necesita verlo ===');
// Los seis informes rendidos en 1,0: el 70% del ramo cerrado en el mínimo.
// Con 30% pendiente haría falta un 11 para llegar a 4,0, o sea no hay salida.
// Un solo informe malo NO sirve de caso: deja 88% por rendir y todavía se puede.
const perdidoR = conInforme(1.0);
perdidoR.categorias.find(c => /informe/i.test(c.nombre)).notas =
  [0,1,2,3,4,5].map(i => ({ id: 'i'+i, nombre: 'Informe '+(i+1), valor: 1.0, peso: 1, slot: i }));
const perdido = run('mostRiskyRamo')();
chk('un ramo sin salida produce tarjeta, no silencio', !!perdido);
chk('y viene marcado como imposible', !!perdido && perdido.imposible === true);

console.log('\n=== Sigue sin molestar a quien va holgado ===');
conInforme(7.0);
chk('con margen de sobra no hay tarjeta', run('mostRiskyRamo')() === null);

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail ? 1 : 0);
