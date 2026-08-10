// El plan común de Ingeniería UC entra a la malla SIN pautas: son 18 ramos que
// el estudiante carga solos y a los que después le pone sus evaluaciones.
//
// Lo que se verifica acá no es que los nombres sean lindos, sino las dos cosas
// que se rompen en silencio: que un ramo de la malla no traiga una pauta
// inventada, y que quien abra uno sin pauta oficial vea que la deuda es nuestra
// y no que a él le falta hacer algo.
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

const MALLA_UC = val('MALLA_UC'), PRESETS_UC = val('PRESETS_UC'), presetRamo = val('presetRamo');
const pc = MALLA_UC['ING-PC'];
const todos = Object.values(pc).flat();

console.log('\n=== Plan común de Ingeniería UC ===');
chk('cubre los cuatro semestres del plan común', [1, 2, 3, 4].every(s => Array.isArray(pc[s]) && pc[s].length));
chk('son 18 ramos', todos.length === 18);
chk('ningún nombre repetido', new Set(todos).size === todos.length);
chk('ningún nombre vacío ni con espacios sueltos', todos.every(n => typeof n === 'string' && n === n.trim() && n.length > 2));

// Los del catálogo oficial C2022, verificados contra la API de la Escuela.
[['Cálculo I', 1], ['Álgebra Lineal', 1], ['Química para Ingeniería', 1], ['Desafíos de la Ingeniería', 1],
 ['Cálculo II', 2], ['Dinámica', 2], ['Introducción a la Programación', 2],
 ['Cálculo III', 3], ['Ecuaciones Diferenciales', 3], ['Termodinámica', 3], ['Introducción a la Economía', 3],
 ['Probabilidades y Estadística', 4], ['Electricidad y Magnetismo', 4],
].forEach(([nombre, sem]) => chk(`${nombre} está en ${sem}°`, (pc[sem] || []).includes(nombre)));

// Los laboratorios valen 0 créditos pero llevan nota: si se caen, al estudiante
// le falta un ramo que sí está cursando.
chk('los tres laboratorios están', todos.filter(n => /^Laboratorio de /.test(n)).length === 3);

console.log('\n=== Ningún ramo de la malla trae una pauta inventada ===');
// La malla dice qué cursa el estudiante; la pauta dice cómo se calcula su nota.
// Meter una pauta sin el programa oficial sería inventar ponderaciones.
const conPauta = todos.filter(n => presetRamo(n, 'uc', 'ING-PC'));
chk('los ramos sin programa oficial no traen pauta',
  conPauta.every(n => !!PRESETS_UC[n]));
chk('las pautas UC que existen siguen saliendo de PRESETS_UC',
  Object.keys(PRESETS_UC).length > 0);

console.log('\n=== El ramo sin pauta lo dice, y la deuda es nuestra ===');
const render = src.slice(src.indexOf('function renderRamo()'), src.indexOf('function renderRamo()') + 12000);
chk('distingue el ramo del catálogo del creado a mano', /const delCatalogo=/.test(render));
chk('al del catálogo le pide disculpas en vez de decirle "Sin evaluaciones"',
  /Todavía no tenemos la pauta de este ramo/.test(render) && /Disculpa/.test(render));
chk('al ramo manual le sigue diciendo Sin evaluaciones', /'Sin evaluaciones'/.test(render));
// El mensaje vive dentro del bloque de categorías vacías: en cuanto el
// estudiante agrega su primera evaluación, deja de renderizarse solo.
chk('el aviso desaparece con la primera evaluación',
  src.indexOf('if(r.categorias.length===0){') < src.indexOf('Todavía no tenemos la pauta de este ramo'));

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
