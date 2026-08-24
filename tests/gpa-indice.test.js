// El promedio general tumbaba la app entera, y el síntoma no se parecía en nada
// a la causa: el estudiante volvía de entrar con Google y quedaba en la pantalla
// de login, sin ningún mensaje.
//
// `gpa()` promediaba con `conNota.map(ramoAvg)`. `map` pasa tres argumentos
// —elemento, índice, array— así que el índice entraba como `visitados` en
// `ramoAvg(r,visitados)`. Para el primer ramo `0 || new Set()` devuelve un Set y
// todo funciona; del segundo en adelante `1 || new Set()` devuelve `1`, y
// `1.has(...)` no es una función.
//
// Solo revienta si hay un ramo con `aporta` que NO sea el primero de la lista,
// que es por qué estuvo latente desde que se agregó el vínculo cátedra +
// laboratorio y solo apareció cuando las estadísticas nuevas empezaron a llamar
// `gpa()` con los datos de alguien que tiene ese par.
//
// La excepción no se veía en ninguna parte: `boot()` la atrapaba con un
// `catch(e){}` vacío y mostraba el login. Por eso este test existe — el error
// que importa acá no imprime nada, solo deja la app inservible.
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
function chk(nombre, cond) { if (cond) { ok++; console.log('  ok   ' + nombre); } else { fail++; console.log('  FAIL ' + nombre); } }
function eq(nombre, a, b) { chk(nombre + ' (= ' + b + ', dio ' + a + ')', Math.abs(a - b) < 0.005); }

function notas(...vals) { return vals.map((v, i) => ({ id: 'n' + i, nombre: 'N' + i, valor: v, peso: 1 })); }
function ramo(id, nombre, valor, extra) {
  return Object.assign({ id, nombre, color: '#000', creditos: null, origen: null, gates: [],
    categorias: [{ id: id + 'c', nombre: 'Pruebas', peso: 100, notas: notas(valor) }] }, extra || {});
}

// El orden es el punto: el ramo vinculado va SEGUNDO. Con él primero el bug no
// aparece, porque `0 || new Set()` sí da un Set.
const calculo = ramo('r1', 'Cálculo II', 5.0);
const dinamica = ramo('r2', 'Dinámica', 6.0, { aporta: { ramo: 'Laboratorio de Dinámica', peso: 30, min: 4.0 } });
const lab = ramo('r3', 'Laboratorio de Dinámica', 4.0);

console.log('=== El promedio general no se cae con un ramo vinculado que no es el primero ===');
vm.runInContext('S', ctx).ramos = [calculo, dinamica, lab];
const gpa = vm.runInContext('gpa', ctx);

let resultado = null, excepcion = null;
try { resultado = gpa([calculo, dinamica, lab]); } catch (e) { excepcion = e; }
chk('gpa() no lanza con el vinculado en segundo lugar', excepcion === null);
if (excepcion) console.log('       ' + excepcion.message);
chk('gpa() devuelve un número', typeof resultado === 'number' && isFinite(resultado));

// Cálculo 5,0 · Dinámica 6,0 combinada con su laboratorio 4,0 al 30%:
// 6*0,7 + 4*0,3 = 5,4. El laboratorio no entra solo al promedio.
if (typeof resultado === 'number') eq('promedia (5,0 + 5,4) / 2', resultado, 5.2);

console.log('\n=== Y sigue dando lo mismo con el vinculado primero ===');
let alReves = null, excepcion2 = null;
vm.runInContext('S', ctx).ramos = [dinamica, calculo, lab];
try { alReves = gpa([dinamica, calculo, lab]); } catch (e) { excepcion2 = e; }
chk('gpa() no lanza con el vinculado primero', excepcion2 === null);
if (typeof alReves === 'number') eq('el orden de la lista no cambia el promedio', alReves, 5.2);

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
