// Importar es la única acción que destruye datos sin deshacer: reemplaza el
// estado local Y lo sube a la nube, así que también se lleva el respaldo.
// Antes bastaba pegar {"userName":"Ana"} para borrar todos los ramos, y la app
// respondía "Datos importados correctamente".
const fs = require('fs'), vm = require('vm');
const src = ['data.js','engine.js','app.js','render-agenda.js']
  .map(f => fs.readFileSync(__dirname + '/../' + f, 'utf8')).join('\n');

const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => stub, createElement: () => stub, addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
  localStorage: { _d: {}, getItem(k) { return this._d[k] ?? null }, setItem(k, v) { this._d[k] = v }, removeItem(k) { delete this._d[k] } },
  navigator: {}, location: { origin: '', pathname: '', hash: '' }, setTimeout, clearTimeout, console
};
vm.createContext(ctx); vm.runInContext(src, ctx);

let ok = 0, fail = 0;
const chk = (n, cond) => { if (cond) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

console.log('\n=== Qué cuenta como respaldo de GradeHub ===');
const valido = ctx.esExportValido;
chk('un export real pasa', valido({ userName: 'Ana', ramos: [] }) === true);
chk('un export con ramos pasa', valido({ ramos: [{ id: 'x' }] }) === true);
// El caso que borraba los datos: JSON legítimo, sin ramos.
chk('{"userName":"Ana"} NO pasa', valido({ userName: 'Ana' }) === false);
chk('un objeto vacío NO pasa', valido({}) === false);
chk('null NO pasa', valido(null) === false);
chk('un arreglo NO pasa', valido([1, 2]) === false);
chk('ramos que no es arreglo NO pasa', valido({ ramos: 'muchos' }) === false);
chk('un número NO pasa', valido(42) === false);

console.log('\n=== Contar lo que está en juego antes de reemplazarlo ===');
const conNotas = [
  { categorias: [{ notas: [1, 2] }, { notas: [3] }] },
  { categorias: [{ notas: [] }] },
];
chk('cuenta las notas de todos los ramos', ctx.contarNotas(conNotas) === 3);
chk('sin ramos cuenta 0', ctx.contarNotas([]) === 0);
chk('tolera ramos sin categorías', ctx.contarNotas([{}]) === 0);

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
