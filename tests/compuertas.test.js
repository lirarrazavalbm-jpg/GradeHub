// Compuertas de grupo: regla "la nota final es la más baja entre los dos
// requisitos" (Gestión de Personas ENGEP155, FEN).
const fs = require('fs'), vm = require('vm');
const h = fs.readFileSync(__dirname+'/../index.html', 'utf8');
const DATA = fs.readFileSync(__dirname+'/../data.js', 'utf8');
const ENGINE = fs.readFileSync(__dirname+'/../engine.js', 'utf8');
const APP = fs.readFileSync(__dirname+'/../app.js', 'utf8');
const AGENDA = fs.readFileSync(__dirname+'/../render-agenda.js', 'utf8');
// Mismo orden que index.html: datos, motor, interfaz y su render separado.
const src = DATA + '\n' + ENGINE + '\n' + APP + '\n' + AGENDA;
new vm.Script(src);

const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => stub, createElement: () => stub, addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '', hash: '' }, setTimeout, clearTimeout, console
};
vm.createContext(ctx); vm.runInContext(src, ctx);

let ok = 0, fail = 0;
const eq = (n, got, exp, tol) => {
  tol = tol || 0.005;
  const p = (exp === null && got === null) || (typeof got === 'number' && Math.abs(got - exp) < tol);
  if (p) { ok++; console.log('  OK   ' + n + ' = ' + (got === null ? 'null' : got.toFixed(3))); }
  else { fail++; console.log('  FAIL ' + n + ' = ' + got + '  (esperado ' + exp + ')'); }
};

// Gestión de Personas: Casos 40 + Examen 10 + Participación 20 = 70% individual
//                      Trabajo grupal 30%
// Requisito A: promedio del bloque individual >= 4.0
// Requisito B: trabajo grupal >= 4.0
// Si alguno falla, la final es la MENOR de las dos.
function gestion(casos, examen, particip, trabajo) {
  const r = {
    id: 'gp', nombre: 'Gestión de Personas', creditos: 6,
    categorias: [
      { id: 'casos', nombre: 'Casos y ensayos', peso: 40, notas: casos === null ? [] : [{ id: 'n1', valor: casos, peso: 1 }] },
      { id: 'exam', nombre: 'Examen Integrativo', peso: 10, notas: examen === null ? [] : [{ id: 'n2', valor: examen, peso: 1 }] },
      { id: 'part', nombre: 'Participación', peso: 20, notas: particip === null ? [] : [{ id: 'n3', valor: particip, peso: 1 }] },
      { id: 'grupo', nombre: 'Trabajo en grupo', peso: 30, notas: trabajo === null ? [] : [{ id: 'n4', valor: trabajo, peso: 1 }] },
    ],
    gates: [
      { type: 'group_min', catIds: ['casos', 'exam', 'part'], min: 4.0, cap: 'self', nombre: 'Trabajo individual' },
      { type: 'group_min', catIds: ['grupo'], min: 4.0, cap: 'self', nombre: 'Trabajo de grupo' },
    ],
  };
  return r;
}
// Lo que dice el reglamento, calculado aparte para contrastar
function esperado(casos, examen, particip, trabajo) {
  const A = (casos * 40 + examen * 10 + particip * 20) / 70;
  const B = trabajo;
  const pond = (casos * 40 + examen * 10 + particip * 20 + trabajo * 30) / 100;
  if (A >= 4.0 && B >= 4.0) return pond;
  return Math.min(A, B);
}

console.log('\n=== Gestión de Personas · regla "la más baja entre los dos" ===');
const casos_ = [
  ['ambos aprueban', 5.0, 5.0, 5.0, 5.0],
  ['falla el grupal', 5.0, 5.0, 5.0, 3.0],
  ['falla el individual', 3.5, 3.5, 3.5, 6.0],
  ['fallan los dos', 3.0, 3.0, 3.0, 2.0],
  ['justo en el límite', 4.0, 4.0, 4.0, 4.0],
  ['individual justo bajo', 3.9, 3.9, 3.9, 7.0],
  ['grupal salva pero no alcanza', 2.0, 2.0, 2.0, 7.0],
];
casos_.forEach(([nom, c, e, p, g]) => {
  eq(nom, ctx.ramoAvg(gestion(c, e, p, g)), esperado(c, e, p, g));
});

console.log('\n=== El grupo se ignora mientras no tenga notas ===');
eq('nada rendido', ctx.ramoAvg(gestion(null, null, null, null)), null);
const parcial = gestion(5.0, null, null, null);
eq('solo casos rendido (no topa)', ctx.ramoAvg(parcial), 5.0);

console.log('\n=== Compuerta de grupo con tope fijo (no self) ===');
const fijo = {
  id: 'x', nombre: 'X',
  categorias: [
    { id: 'a', nombre: 'A', peso: 50, notas: [{ id: '1', valor: 3.0, peso: 1 }] },
    { id: 'b', nombre: 'B', peso: 50, notas: [{ id: '2', valor: 7.0, peso: 1 }] },
  ],
  gates: [{ type: 'group_min', catIds: ['a'], min: 4.0, cap: 3.9, nombre: 'A' }],
};
// ponderado = 5.0, pero A=3.0 < 4 → tope 3.9
eq('tope fijo aplica', ctx.ramoAvg(fijo), 3.9);

console.log('\n=== No rompe las compuertas simples que ya existían ===');
const filo = {
  id: 'f', nombre: 'Filosofía',
  categorias: [
    { id: 'p1', nombre: 'Prueba 1', peso: 30, notas: [{ id: 'a', valor: 7.0, peso: 1 }] },
    { id: 'p2', nombre: 'Ejercicio', peso: 20, notas: [{ id: 'b', valor: 7.0, peso: 1 }] },
    { id: 'p3', nombre: 'Prueba 2', peso: 30, notas: [{ id: 'c', valor: 7.0, peso: 1 }] },
    { id: 'p4', nombre: 'Podcast', peso: 20, notas: [{ id: 'd', valor: 2.0, peso: 1 }] },
  ],
  gates: [{ type: 'min_grade_required', catId: 'p4', min: 4.0, cap: 3.9, nombre: 'Podcast' }],
};
eq('Filosofía topa en 3.9', ctx.ramoAvg(filo), 3.9);
filo.categorias[3].notas[0].valor = 5.0;
eq('Filosofía sin tope', ctx.ramoAvg(filo), 6.6);

console.log('\n=== Métodos Matemáticos II (min 3.0 / cap 3.9) ===');
function metodos(s1, s2, s3, ex) {
  return {
    id: 'mm', nombre: 'Métodos Matemáticos II',
    categorias: [
      { id: 'sol', nombre: 'Solemnes', peso: 60, slots: 3, notas: [s1, s2, s3].map((v, i) => ({ id: 's' + i, valor: v, peso: 1 })) },
      { id: 'ex', nombre: 'Examen Final', peso: 40, notas: [{ id: 'e', valor: ex, peso: 1 }] },
    ],
    gates: [{ type: 'min_grade_required', catId: 'ex', min: 3.0, cap: 3.9, nombre: 'Examen Final' }],
  };
}
// solemnes 5.0 promedio, examen 6.0 → 0.6*5 + 0.4*6 = 5.4
eq('sin activar la compuerta', ctx.ramoAvg(metodos(5, 5, 5, 6.0)), 5.4);
// examen 2.5 (<3.0) → min(ponderado, 3.9). ponderado = 0.6*6 + 0.4*2.5 = 4.6 → 3.9
eq('examen bajo 3.0 topa en 3.9', ctx.ramoAvg(metodos(6, 6, 6, 2.5)), 3.9);
// examen 2.5 con solemnes malas: ponderado = 0.6*2 + 0.4*2.5 = 2.2 → min(2.2, 3.9) = 2.2
eq('el tope no mejora una nota peor', ctx.ramoAvg(metodos(2, 2, 2, 2.5)), 2.2);

console.log('\n=== gatesActivas describe la compuerta incumplida ===');
const act = ctx.gatesActivas(gestion(5.0, 5.0, 5.0, 3.0));
if (act.length === 1 && act[0].grupo === true && Math.abs(act[0].actual - 3.0) < 0.01) { ok++; console.log('  OK   detecta el grupal en 3.0'); }
else { fail++; console.log('  FAIL gatesActivas → ' + JSON.stringify(act)); }
const act2 = ctx.gatesActivas(gestion(5.0, 5.0, 5.0, 5.0));
if (act2.length === 0) { ok++; console.log('  OK   sin compuertas activas cuando todo aprueba'); }
else { fail++; console.log('  FAIL debería estar vacío → ' + JSON.stringify(act2)); }

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
