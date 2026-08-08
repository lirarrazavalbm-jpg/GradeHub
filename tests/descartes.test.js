// "Se elimina la peor nota" / "se elimina el 25% de los controles rendidos".
//
// Es la regla más común de los programas chilenos y hasta ahora el motor no
// sabía representarla: quedaba declarada en `noCalcula` y el estudiante veía un
// promedio que sabía que no era el suyo.
//
// Se prueba contra el motor DIRECTO (no por la interfaz) porque acá lo que
// importa es la aritmética, y contra el preset de Contabilidad para verificar
// que el dato llega desde data.js hasta el cálculo sin que nadie lo pierda por
// el camino.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const src = ['data.js', 'engine.js', 'app.js', 'render-agenda.js']
  .map(f => fs.readFileSync(raiz + f, 'utf8')).join('\n');

const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => stub, createElement: () => stub, addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '', hash: '' }, setTimeout, clearTimeout, console
};
vm.createContext(ctx); vm.runInContext(src, ctx);

let ok = 0, fail = 0;
const chk = (n, cond) => { if (cond) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, exp) => chk(n + '  (' + got + ')', typeof got === 'number' && Math.abs(got - exp) < 0.005);

// Un grupo con `drop_lowest` y las notas que se le pasen. Peso 1 cada una.
const grupo = (valores, drop) => {
  const grades = {};
  valores.forEach((v, i) => { if (v !== null) grades['n' + i] = v; });
  const structure = {
    __meta: { grade_scale: { min: 1, max: 7 }, rounding: { decimals: 2 } },
    id: 'final', name: 'Ramo', type: 'group', aggregation_rule: 'weighted_average',
    children: [{
      id: 'cat', name: 'Controles', weight: 100, type: 'group',
      aggregation_rule: 'weighted_average', drop_lowest: drop,
      children: valores.map((v, i) => ({ id: 'n' + i, name: 'C' + (i + 1), weight: 1, type: 'leaf' })),
    }],
  };
  return vm.runInContext('calculateFinalGrade', ctx)(structure, grades);
};
const estructuraGrupo = (valores, drop) => ({
  __meta: { grade_scale: { min: 1, max: 7 }, rounding: { decimals: 2 } },
  id: 'final', name: 'Ramo', type: 'group', aggregation_rule: 'weighted_average',
  children: [{
    id: 'cat', name: 'Controles', weight: 100, type: 'group',
    aggregation_rule: 'weighted_average', drop_lowest: drop,
    children: valores.map((v, i) => ({ id: 'n' + i, name: 'C' + (i + 1), weight: 1, type: 'leaf' })),
  }],
});
const notasGrupo = valores => Object.fromEntries(valores.flatMap((v,i)=>v===null?[]:[['n'+i,v]]));

console.log('\n=== Se elimina la peor nota ===');
eq('cuatro notas, se elimina una: (5+6+7)/3', grupo([2, 5, 6, 7], { count: 1 }).raw, 6);
eq('sin la regla, las cuatro cuentan', grupo([2, 5, 6, 7], null).raw, 5);
eq('se eliminan las dos peores', grupo([2, 3, 6, 7], { count: 2 }).raw, 6.5);
// Empatadas: da igual cuál se saque, el promedio es el mismo.
eq('dos notas iguales en el fondo', grupo([3, 3, 6, 6], { count: 1 }).raw, 5);

console.log('\n=== El 25% de las rendidas ===');
// floor: con 4 rendidas se elimina 1, con 6 también (1,5 → 1), con 8 dos.
eq('4 rendidas → se elimina 1', grupo([1, 5, 6, 7], { fraction: 0.25 }).raw, 6);
eq('6 rendidas → se elimina 1 (floor de 1,5)', grupo([1, 4, 5, 6, 6, 7], { fraction: 0.25 }).raw, 5.6);
eq('8 rendidas → se eliminan 2', grupo([1, 2, 5, 5, 6, 6, 7, 7], { fraction: 0.25 }).raw, 6);
eq('3 rendidas → no se elimina ninguna (floor de 0,75)', grupo([3, 6, 6], { fraction: 0.25 }).raw, 5);

console.log('\n=== Los bordes, que son donde esto se rompe ===');
// Lo que falta NO se descarta: descontarlo de antemano daría un promedio
// optimista que después baja solo, que es justo lo que destruye la confianza.
eq('las que faltan no cuentan como candidatas a eliminar', grupo([2, 6, null, null], { count: 1 }).raw, 6);
chk('una sola nota no se elimina: el grupo quedaría vacío',
  grupo([3], { count: 1 }).raw === 3);
chk('la regla nunca se come el grupo entero',
  grupo([2, 3], { count: 5 }).raw === 3);
chk('sin notas el promedio sigue siendo null', grupo([null, null], { count: 1 }).raw === null);
chk('el resultado dice CUÁL nota se eliminó',
  grupo([2, 5, 6, 7], { count: 1 }).drops[0].dropped[0].value === 2);
chk('y cuántas había rendidas', grupo([2, 5, 6, 7], { count: 1 }).drops[0].rendidas === 4);
chk('sin la regla no hay descartes que mostrar', grupo([2, 5, 6, 7], null).drops.length === 0);

console.log('\n=== Nota necesaria cuando una futura puede descartarse ===');
const solve = vm.runInContext('solveForTarget', ctx);
const conDescartePendiente = solve(estructuraGrupo([2, 6, 6, null], {count:1}), notasGrupo([2, 6, 6, null]), 6.33);
eq('para llegar a 6.33, la cuarta debe ser 6.99 y no 11.32', conDescartePendiente.requiredAverage, 6.99);
chk('explica el supuesto de misma nota y el descarte futuro',
  conDescartePendiente.dropAware === true && conDescartePendiente.conditions.some(c=>/misma nota/.test(c)) && conDescartePendiente.conditions.some(c=>/descarta/.test(c)));
const sinDescartePendiente = solve(estructuraGrupo([2, 6, null, null], null), notasGrupo([2, 6, null, null]), 5);
eq('sin descarte conserva el despeje normal', sinDescartePendiente.requiredAverage, 6);
const reglaAbierta=vm.runInContext('reglaDescarteConCantidadAbierta', ctx);
chk('la interfaz no inventa una nota mínima si el programa no fija cuántos controles quedan',
  reglaAbierta({categorias:[{nombre:'Controles Sorpresa',dropLowest:{fraction:.25},notas:[]}]})?.nombre === 'Controles Sorpresa');

console.log('\n=== Contabilidad: del programa oficial al número ===');
// Los `const` de data.js no quedan en el objeto de contexto: se leen evaluando
// el nombre dentro del contexto, igual que en presets.test.js.
const conta = vm.runInContext('PRESETS_FEN', ctx)['Contabilidad'];
const sorpresa = conta.evals.find(e => e[0] === 'Controles Sorpresa');
chk('el preset declara la regla', !!(sorpresa[2] && sorpresa[2].dropLowest));
chk('ya no está declarada como no calculada',
  !conta.noCalcula.some(r => /elimina el 25%/.test(r)));
// La otra regla SÍ se queda: el programa dice "entre 4 y 6 controles", así que
// no existe denominador contra el cual medir el 75% de asistencia.
chk('el 75% de asistencia sigue declarado como no calculado',
  conta.noCalcula.some(r => /75%/.test(r)));

const ramo = vm.runInContext('presetRamo', ctx)('Contabilidad', 'fen', null);
const cs = ramo.categorias.find(c => c.nombre === 'Controles Sorpresa');
chk('presetRamo copia dropLowest al ramo del estudiante', !!(cs && cs.dropLowest));
cs.notas = [
  { id: 'a', nombre: 'C1', valor: 2.0, peso: 1 },
  { id: 'b', nombre: 'C2', valor: 6.0, peso: 1 },
  { id: 'c', nombre: 'C3', valor: 6.0, peso: 1 },
  { id: 'd', nombre: 'C4', valor: 7.0, peso: 1 },
];
const res = vm.runInContext('calculateFinalGrade', ctx)(vm.runInContext('ramoToStructure', ctx)(ramo), vm.runInContext('gradesOf', ctx)(ramo));
const catCS = res.breakdown.find(b => b.id === cs.id);
eq('el 2,0 no arrastra: (6+6+7)/3', catCS.value, 6.3333);
chk('el descarte queda registrado para mostrárselo al estudiante',
  res.drops.some(d => d.nodeId === cs.id && d.dropped[0].value === 2.0));

console.log('\n=== Los ramos que no declaran la regla calculan igual que antes ===');
const micro = vm.runInContext('presetRamo', ctx)('Introducción a la Microeconomía', 'fen', null);
chk('ninguna categoría de Microeconomía descarta notas',
  micro.categorias.every(c => !c.dropLowest));
const manual = { nombre: 'Manual', categorias: [{ id: 'x', nombre: 'Pruebas', peso: 100, notas: [{ id: 'p1', nombre: 'P1', valor: 2, peso: 1 }, { id: 'p2', nombre: 'P2', valor: 6, peso: 1 }] }] };
eq('un ramo manual promedia sus dos notas sin descartar nada',
  vm.runInContext('calculateFinalGrade', ctx)(vm.runInContext('ramoToStructure', ctx)(manual), vm.runInContext('gradesOf', ctx)(manual)).raw, 4);

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
