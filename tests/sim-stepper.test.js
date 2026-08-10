// El simulador de semestre completo se maneja con dos botones y un campo, no
// con un slider. Lo que se prueba acá es la aritmética y los bordes, que es
// donde un stepper se rompe callado: pasarse de 7,0, bajar de 1,0, o perder el
// foco del campo mientras el estudiante escribe.
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

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, exp) => chk(n + '  (' + got + ')', typeof got === 'number' && Math.abs(got - exp) < 0.0001);

// Dos ramos: uno con nota real, otro sin nada.
vm.runInContext(`S={ramos:[
  {id:'a',nombre:'Con nota',color:'#fff',categorias:[{id:'c1',nombre:'P',peso:100,notas:[{id:'n1',nombre:'P1',valor:5.0,peso:1}]}],gates:[]},
  {id:'b',nombre:'Vacío',color:'#fff',categorias:[],gates:[]}
]};simGlobalState={};`, ctx);

const step = val('simGlobalStep'), set = val('simGlobalSet'), clear = val('simGlobalClear');
const estado = () => val('simGlobalState');

console.log('\n=== Los botones mueven de a 0,1 ===');
step('a', 0.1);
eq('sube desde la nota real (5,0 → 5,1)', estado()['a'], 5.1);
step('a', 0.1); step('a', 0.1);
// 5,0 + 0,1 tres veces da 5,300000000000001 en coma flotante. Que dé 5,3 es lo
// que se está probando: sin redondear, el número que ve el estudiante sería ese.
eq('tres toques suman 0,3 sin arrastrar decimales binarios', estado()['a'], 5.3);
step('a', -0.1);
eq('y baja igual', estado()['a'], 5.2);

console.log('\n=== El ramo sin notas parte del 4,0 ===');
// Partir del 1,0 obligaría a 30 toques para llegar a un número que el
// estudiante quiera mirar.
step('b', 0.1);
eq('primer toque deja 4,1, no 1,1', estado()['b'], 4.1);

console.log('\n=== Los topes de la escala ===');
val('simGlobalState')['a'] = 6.95;
step('a', 0.1);
eq('no se pasa de 7,0', estado()['a'], 7.0);
step('a', 0.1);
eq('y en 7,0 se queda', estado()['a'], 7.0);
val('simGlobalState')['a'] = 1.05;
step('a', -0.1);
eq('no baja de 1,0', estado()['a'], 1.0);

console.log('\n=== Escribir la nota a mano ===');
set('a', '6.4');
eq('acepta punto', estado()['a'], 6.4);
set('a', '5,5');
eq('acepta coma, que es como se escribe una nota en Chile', estado()['a'], 5.5);
set('a', '9');
eq('un 9 se topa en 7,0 en vez de romper el promedio', estado()['a'], 7.0);
set('a', '0');
eq('un 0 se sube a 1,0', estado()['a'], 1.0);
set('a', '5.67');
eq('redondea a una décima', estado()['a'], 5.7);
set('a', '');
chk('vaciar el campo devuelve el ramo a su nota real', estado()['a'] === undefined);
set('a', 'hola');
chk('texto que no es número tampoco deja basura', estado()['a'] === undefined);

console.log('\n=== Volver al real ===');
step('a', 0.1); clear('a');
chk('borra la nota hipotética', estado()['a'] === undefined);

console.log('\n=== El promedio proyectado responde ===');
vm.runInContext("simGlobalState={};", ctx);
const avg = val('simGlobalAvg');
eq('sin simular, es el promedio de las notas reales', avg(), 5.0);
step('b', 0.1); // el vacío pasa a 4,1
eq('un ramo sin notas entra al promedio al simularlo', avg(), (5.0 + 4.1) / 2);

console.log('\n=== Escribir no redibuja la lista ===');
// Si `simGlobalTyping` llamara a renderSimGlobal, el innerHTML se reconstruiría
// en cada tecla y el campo perdería el foco en la primera. Es el tipo de bug
// que no lanza excepción y hace la pantalla inusable en el teléfono.
const typing = src.slice(src.indexOf('function simGlobalTyping'), src.indexOf('function renderSimGlobal'));
chk('typing solo actualiza el proyectado, no la lista',
  /renderSimGlobalHero\(\)/.test(typing) && !/renderSimGlobalList\(\)/.test(typing));
chk('ya no queda ningún slider en el simulador',
  !/simg-slider/.test(src) && !/type="range"[^>]*simGlobalSet/.test(src));

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
