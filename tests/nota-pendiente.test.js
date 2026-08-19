// Una evaluación que viene se puede anotar antes de rendirla.
//
// Lo reportó una usuaria con "Casos y ensayos": varios casos, en fechas
// distintas, bajo una misma ponderación. El modelo tenía la fecha en la
// CATEGORÍA, así que todo el grupo compartía una sola, y agregar una nota exigía
// el valor. Para decir "el Caso 2 es el 15 de octubre" había que inventarle una
// nota que todavía no existía.
//
// Lo que hace esto seguro es que el motor YA ignoraba las notas sin valor
// (`gradesOf` y `avgPond`), así que una pendiente nunca contó como cero. Este
// test fija justamente eso: que se pueda anotar sin nota, y que anotarla no
// mueva el promedio.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const src = ['data.js', 'engine.js', 'app.js', 'render-agenda.js']
  .map(f => fs.readFileSync(raiz + f, 'utf8')).join('\n');

const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => stub, createElement: () => stub, addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '/', search: '', hash: '' }, history: { replaceState() {} }, setTimeout, clearTimeout, console,
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const val = n => vm.runInContext(n, ctx);

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

const normalize = val('normalize'), ramoAvg = val('ramoAvg');

const ramoCasos = (notas) => ({
  id: 'r1', nombre: 'Contabilidad', origen: null, creditos: null, gates: [],
  categorias: [{ id: 'c1', nombre: 'Casos y ensayos', peso: 100, fecha: null, notas }],
});
const casos = (notas) => ({ ramos: [ramoCasos(notas)] });

console.log('\n=== La nota conserva su propia fecha ===');
const conFecha = normalize(casos([{ id: 'n1', nombre: 'Caso 2', valor: null, peso: 1, fecha: '2026-10-15' }]));
chk('la fecha sobrevive a normalize', conFecha.ramos[0].categorias[0].notas[0].fecha === '2026-10-15');
chk('y el valor puede quedar vacío', conFecha.ramos[0].categorias[0].notas[0].valor === null);

console.log('\n=== Una pendiente no arrastra el promedio ===');
const soloRendida = normalize(casos([{ id: 'n1', nombre: 'Caso 1', valor: 6, peso: 1 }]));
const conPendiente = normalize(casos([
  { id: 'n1', nombre: 'Caso 1', valor: 6, peso: 1 },
  { id: 'n2', nombre: 'Caso 2', valor: null, peso: 1, fecha: '2026-10-15' },
]));
const a = ramoAvg(soloRendida.ramos[0]), b = ramoAvg(conPendiente.ramos[0]);
chk('el promedio con un 6 es 6', a === 6);
chk('anotar la que viene NO lo cambia (no cuenta como cero)', a === b);

console.log('\n=== La Agenda muestra cada caso en su día ===');
vm.runInContext('S = ' + JSON.stringify(normalize(casos([
  { id: 'n1', nombre: 'Caso 1', valor: 5, peso: 1, fecha: '2026-09-10' },
  { id: 'n2', nombre: 'Caso 2', valor: null, peso: 1, fecha: '2026-10-15' },
]))) + ';', ctx);
const evs = val('agendaEvents')();
chk('aparecen las dos fechas, no una sola del grupo', evs.length === 2);
chk('en el orden en que vienen', evs[0].fecha === '2026-09-10' && evs[1].fecha === '2026-10-15');
chk('la que falta queda marcada como pendiente', evs[1].pending === true);
chk('la ya rendida no', evs[0].pending === false);
chk('cada evento sabe de qué nota es', evs[0].nota && evs[0].nota.nombre === 'Caso 1');

console.log('\n=== Guardar sin nota está permitido en las dos vías ===');
const app = fs.readFileSync(raiz + 'app.js', 'utf8');
chk('al crear, solo el nombre es obligatorio',
  /function confirmAddNota[\s\S]{0,400}if\(!name\)return;/.test(app));
chk('al editar, también',
  /function confirmEditNota[\s\S]{0,400}if\(!name\)return;/.test(app));
chk('y el valor vacío se guarda como null, no como cero',
  /valor:isNaN\(val\)\?null:val/.test(app));

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
