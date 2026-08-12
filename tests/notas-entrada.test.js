// Cómo se escribe una nota. En Chile se teclea "55" queriendo decir 5,5 y se
// escribe con coma, y `parseNota` hace las dos traducciones desde siempre.
//
// El problema no era `parseNota`: era que la mitad de los campos de nota no la
// llamaban y hacían su propio `parseFloat`. Eso no lanza nada. En el simulador
// global el número pasaba además por un clamp, así que "55" no daba error:
// daba un 7,0 silencioso, que es la peor forma de equivocarse en una app cuyo
// único trabajo es el número.
//
// Este archivo existe para que agregar un campo de nota nuevo con su propio
// parseFloat falle acá y no en el teléfono de alguien.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const src = ['data.js', 'engine.js', 'app.js', 'render-agenda.js']
  .map(f => fs.readFileSync(raiz + f, 'utf8')).join('\n');

const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => stub, createElement: () => stub, addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '', hash: '' }, setTimeout, clearTimeout, console,
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const val = n => vm.runInContext(n, ctx);

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, exp) => chk(`${n}  (${got})`, Number.isNaN(exp) ? Number.isNaN(got) : Math.abs(got - exp) < 1e-9);

const parseNota = val('parseNota');

console.log('\n=== Se teclea 55 y significa 5,5 ===');
eq('"55" → 5.5', parseNota('55'), 5.5);
eq('"45" → 4.5', parseNota('45'), 4.5);
eq('"70" → 7.0', parseNota('70'), 7.0);
eq('"10" → 1.0', parseNota('10'), 1.0);
// El corte en 70 es deliberado: "77" es más probable que sea un error de tipeo
// que una nota 7,7, que no existe.
eq('"77" no se inventa un 7,7', parseNota('77'), NaN);
eq('"100" tampoco', parseNota('100'), NaN);

console.log('\n=== La coma es como se escribe acá ===');
eq('"5,5" → 5.5', parseNota('5,5'), 5.5);
eq('"5.5" → 5.5', parseNota('5.5'), 5.5);
eq('"  6,2  " con espacios', parseNota('  6,2  '), 6.2);

console.log('\n=== Un dígito solo se respeta ===');
// Escribir "5" mientras se apunta a "5,5" tiene que valer 5,0 y no convertirse
// en nada raro: el campo se evalúa en cada tecla.
eq('"5" → 5.0', parseNota('5'), 5.0);
eq('"7" → 7.0', parseNota('7'), 7.0);
eq('"1" → 1.0', parseNota('1'), 1.0);
eq('"0" está fuera de la escala', parseNota('0'), NaN);
eq('vacío no es cero', parseNota(''), NaN);
eq('texto no es nota', parseNota('hola'), NaN);

console.log('\n=== Todos los campos de nota pasan por el mismo parser ===');
// Un campo que hace su propio parseFloat no falla: acepta lo que no debe, o
// clampea en silencio. Se revisa el código porque el síntoma no se ve.
// Buscar `parseFloat` suelto por todo el archivo da falsos positivos: hay un
// parseFloat legítimo para las duraciones del CSS y otro para los PESOS, que
// son porcentajes y no se autocorrigen (un peso de 55 es 55%, no 5,5%). Así
// que se nombran los campos que SÍ son notas y se revisa cada uno.
const app = fs.readFileSync(raiz + 'app.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const cuerpo = nombre => {
  const i = app.search(new RegExp(`(function\\s+${nombre}\\s*\\(|${nombre}\\s*=\\s*function\\s*\\()`));
  if (i < 0) return null;
  let j = app.indexOf('{', i), prof = 0;
  const ini = j;
  do { if (app[j] === '{') prof++; else if (app[j] === '}') prof--; j++; } while (j < app.length && prof > 0);
  return app.slice(ini, j);
};
const camposDeNota = ['setSlotNota', 'setDirectNota', 'simAddNota', 'simGlobalDesdeTexto', 'calcResult'];
// Lo que importa no es que no exista parseFloat, es que no vaya PRIMERO. El
// simulador tiene uno legítimo de respaldo para lo que sigue fuera de escala
// después de traducir; ese orden es justamente el arreglo, y al revés es el bug.
const malos = camposDeNota.filter(f => {
  const c = cuerpo(f);
  if (c === null || !/parseNota\(/.test(c)) return true;
  const pf = c.indexOf('parseFloat(');
  return pf !== -1 && pf < c.indexOf('parseNota(');
});
chk(`los ${camposDeNota.length} campos de nota usan parseNota (${malos.length} no)`, malos.length === 0);
malos.forEach(f => console.log('     revisar → ' + f + (cuerpo(f) === null ? ' (no encontrado: ¿lo renombraron?)' : '')));

console.log('\n=== El simulador global: primero traducir, después topar ===');
// El clamp no era el error, el orden sí. Escribir "9" tiene que seguir topando
// en 7,0 —está decidido en sim-stepper.test.js y sigue siendo lo correcto: quien
// escribe 9 quiere el máximo, no quiere nada—. Lo que no puede pasar es que un
// "55" se coma ese mismo camino y salga convertido en 7,0 sin avisar.
vm.runInContext(`S={ramos:[{id:'a',nombre:'Uno',color:'#fff',categorias:[],gates:[]}]};simGlobalState={};`, ctx);
const set = val('simGlobalSet'), estado = () => val('simGlobalState');
set('a', '55');
eq('escribir "55" deja 5,5 y no 7,0', estado()['a'], 5.5);
set('a', '5,5');
eq('escribir "5,5" deja 5,5', estado()['a'], 5.5);
set('a', '45');
eq('escribir "45" deja 4,5', estado()['a'], 4.5);
// Y lo que de verdad está fuera de escala sigue acercándose al borde.
set('a', '9');
eq('un 9 sigue topando en 7,0', estado()['a'], 7.0);
set('a', '0');
eq('un 0 sigue subiendo a 1,0', estado()['a'], 1.0);
set('a', '');
chk('vaciar el campo devuelve el ramo a su nota real', estado()['a'] === undefined);
// El clamp sigue vivo en los botones, que es donde nació.
vm.runInContext(`simGlobalState={a:6.95};`, ctx);
val('simGlobalStep')('a', 0.1);
eq('los botones siguen topando en 7,0', estado()['a'], 7.0);

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
