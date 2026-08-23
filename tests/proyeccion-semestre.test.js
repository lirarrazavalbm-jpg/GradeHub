// Hasta dónde puede llegar el promedio con lo que todavía no se rinde.
//
// Es un número que el estudiante va a usar para decidir si sigue peleando un
// ramo o lo suelta, así que el riesgo no es que reviente: es que dé un rango
// plausible y equivocado. Por eso el escenario NO se calcula aparte — se arma
// una copia del ramo con lo pendiente relleno y se la pasa al motor de siempre,
// que ya sabe de compuertas, descartes y ramos que aportan nota a otro.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const src = ['data.js', 'engine.js', 'app.js', 'render-agenda.js']
  .map(f => fs.readFileSync(raiz + f, 'utf8')).join('\n');

const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => stub, createElement: () => stub, addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '', hash: '' }, setTimeout, clearTimeout, console,
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const val = n => vm.runInContext(n, ctx);
const proyeccionSemestre = val('proyeccionSemestre');
const loQueFaltaPorRamo = val('loQueFaltaPorRamo');
const normalize = val('normalize');

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };
const cerca = (a, b) => a !== null && Math.abs(a - b) < 0.05;

const ramo = (id, cats) => ({ id, nombre: id, categorias: cats, gates: [], notas: [] });
const cat = (id, peso, valor, extra) => ({ id, nombre: id, peso, ponderaNotas: false, directNota: true, notas: valor === null ? [] : [{ id: id + 'n', nombre: 'n', valor, peso: 1 }], ...extra });

console.log('\n=== El rango sale del motor, no de una cuenta aparte ===');
// Mitad rendida con 6,0. El piso es 6,0 y 1,0 al 50% cada uno; el techo, 6,0 y 7,0.
const mitad = normalize({ ramos: [ramo('A', [cat('c1', 50, 6.0), cat('c2', 50, null)])] }).ramos;
const p1 = proyeccionSemestre(mitad);
chk('el piso asume 1,0 en lo que falta', cerca(p1.piso, 3.5));
chk('el techo asume 7,0 en lo que falta', cerca(p1.techo, 6.5));

console.log('\n=== Una compuerta baja el techo, y por eso no se calcula a mano ===');
// El Examen exige 3,0 o la final se topa en 3,4. Con 7,0 en todo lo pendiente
// la cuenta simple daría 6,5; el motor sabe que el 2,0 del examen ya topó.
const conTope = normalize({ ramos: [{ ...ramo('B', [cat('e', 50, 2.0), cat('otra', 50, null)]),
  gates: [{ type: 'min_grade_required', catId: 'e', min: 3.0, cap: 3.4, nombre: 'Examen' }] }] }).ramos;
const p2 = proyeccionSemestre(conTope);
chk('el techo respeta el tope de la compuerta', cerca(p2.techo, 3.4));

console.log('\n=== Las casillas a medio llenar cuentan las que faltan ===');
// Con slots:2 y una sola nota puesta, la otra casilla sigue pendiente. Si se
// mirara solo "¿tiene alguna nota?", este ramo se daría por cerrado y el rango
// saldría más angosto de lo que es.
const conSlots = normalize({ ramos: [ramo('C', [{ ...cat('ctrl', 100, 6.0), slots: 2, directNota: true }])] }).ramos;
const p3 = proyeccionSemestre(conSlots);
chk('el piso considera la casilla vacía', cerca(p3.piso, 3.5));
chk('y el techo también', cerca(p3.techo, 6.5));

console.log('\n=== Cuándo NO hay rango que mostrar ===');
const cerrado = normalize({ ramos: [ramo('D', [cat('u', 100, 5.0)])] }).ramos;
chk('con todo rendido no se proyecta nada', proyeccionSemestre(cerrado) === null);
chk('sin ramos tampoco', proyeccionSemestre([]) === null);

console.log('\n=== Qué necesitas, y en qué orden ===');
const varios = normalize({ ramos: [
  ramo('Facil', [cat('a', 50, 6.5), cat('b', 50, null)]),
  ramo('Dificil', [cat('a', 50, 2.0), cat('b', 50, null)]),
] }).ramos;
const falta = loQueFaltaPorRamo(varios);
chk('el más exigente va primero', falta[0].ramo.id === 'Dificil');
chk('y el número es lo que hay que sacar en lo que queda',
  cerca(falta[0].necesita, 6.0) && cerca(falta[1].necesita, 1.5));
// Un ramo sin evaluaciones no tiene qué pedir: no debe aparecer con un 4,0
// inventado, porque eso se lee como "te falta rendir algo" cuando no hay pauta.
const sinPauta = normalize({ ramos: [ramo('Vacio', [])] }).ramos;
chk('un ramo sin pauta no aparece en la lista', loQueFaltaPorRamo(sinPauta).length === 0);

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
