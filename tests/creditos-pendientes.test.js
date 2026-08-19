// Un ramo del catálogo sin créditos los recibe al cargar, igual que la pauta.
//
// `creditosDe` solo corría al CREAR el ramo. Quien agregó Introducción a la
// Programación antes de que su crédito estuviera en la tabla se quedó con
// `creditos:null` para siempre, y la app le pedía "agrega créditos" por un dato
// que sí tenemos.
//
// Lo que lo hace grave y no cosmético: el promedio general se pondera por
// créditos SOLO si todos los ramos con nota los tienen. Un ramo sin créditos
// arrastra a toda la cuenta a promedio simple — otro número, sin que falle nada
// ni aparezca ningún error.
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

const normalize = val('normalize');
const uc = { tenant: 'uc', carrera: 'ING-PC' };
const ramo = (extra) => ({ id: 'r1', nombre: 'Introducción a la Programación', categorias: [], ...extra });

console.log('\n=== Un ramo del catálogo recibe sus créditos al cargar ===');
const sinCreditos = normalize({ ramos: [ramo({ origen: uc, creditos: null })] });
chk('el ramo que estaba en null los recibe', sinCreditos.ramos[0].creditos === 10);
const indefinido = normalize({ ramos: [ramo({ origen: uc })] });
chk('y el que no tenía la propiedad, también', indefinido.ramos[0].creditos === 10);

console.log('\n=== Pero no se pisa lo que puso el estudiante ===');
const aMano = normalize({ ramos: [ramo({ origen: uc, creditos: 4 })] });
chk('un crédito escrito a mano manda sobre la tabla', aMano.ramos[0].creditos === 4);
const manual = normalize({ ramos: [ramo({ origen: null, creditos: null })] });
chk('un ramo creado a mano no recibe créditos del catálogo', manual.ramos[0].creditos == null);

console.log('\n=== Y el que no está en la tabla se queda como está ===');
const desconocido = normalize({ ramos: [{ id: 'r2', nombre: 'Ramo Que No Existe', origen: uc, creditos: null, categorias: [] }] });
chk('sin dato en la tabla, sigue en null', desconocido.ramos[0].creditos == null);

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
