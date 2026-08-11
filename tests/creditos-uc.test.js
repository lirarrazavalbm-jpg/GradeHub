// Créditos SCT de Ingeniería UC.
//
// Los créditos son el dato más estable del currículum: un ramo cambia de
// ponderaciones todos los semestres y de SCT casi nunca. Antes vivían pegados a
// los presets, y como hay 10 pautas oficiales para 88 ramos FEN y 4 para UC, el
// resultado era que casi nadie tenía PPA ponderado: el promedio que veía la
// mayoría era simple, que no es como se calcula un PPA en Chile.
//
// Ahora van en su propia tabla, con los 146 ramos de Ingeniería UC.
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
const eq = (n, got, exp) => chk(`${n}  (${JSON.stringify(got)})`, got === exp);

const CREDITOS_UC = val('CREDITOS_UC'), creditosDe = val('creditosDe'), MALLA_UC = val('MALLA_UC');

console.log('\n=== La tabla ===');
const entradas = Object.entries(CREDITOS_UC);
chk('trae los 146 ramos recogidos de los 34 majors', entradas.length === 146);
chk('cada entrada es [créditos, sigla]',
  entradas.every(([, v]) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'string'));
chk('ninguna sigla vacía ni repetida',
  new Set(entradas.map(([, v]) => v[1])).size === entradas.length);
chk('los créditos son valores del plan (0, 5, 10 o 20)',
  entradas.every(([, v]) => [0, 5, 10, 20].includes(v[0])));
// Si un día alguien "arregla" un 0 poniéndole 10, el promedio de miles de
// estudiantes cambia en silencio. Estos cuatro son 0 SCT en el plan oficial.
const ceros = entradas.filter(([, v]) => v[0] === 0).map(([n]) => n).sort();
chk('los cuatro ramos de 0 SCT siguen en 0',
  JSON.stringify(ceros) === JSON.stringify([
    'Laboratorio de Dinámica', 'Laboratorio de Electricidad y Magnetismo',
    'Laboratorio de Termodinámica', 'Práctica I']));

console.log('\n=== Valores contra el catálogo oficial ===');
[['Cálculo I', 10, 'MAT1610'], ['Álgebra Lineal', 10, 'MAT1203'],
 ['Introducción a la Programación', 10, 'IIC1103'], ['Dinámica', 10, 'FIS1514'],
 ['Laboratorio de Dinámica', 0, 'FIS0154'], ['Práctica I', 0, 'ING1001'],
 ['Probabilidades y Estadística', 10, 'EYP1113'],
].forEach(([n, cr, sig]) => chk(`${n} = ${cr} SCT (${sig})`,
  CREDITOS_UC[n] && CREDITOS_UC[n][0] === cr && CREDITOS_UC[n][1] === sig));

console.log('\n=== creditosDe resuelve por nombre ===');
eq('un ramo de la tabla', creditosDe('Cálculo I', 'uc', null), 10);
eq('sin tildes también', creditosDe('Calculo I', 'uc', null), 10);
eq('sin importar mayúsculas', creditosDe('CÁLCULO I', 'uc', null), 10);
eq('con espacios de sobra', creditosDe('  Cálculo I  ', 'uc', null), 10);
// El preset manda: si el programa oficial del ramo declara créditos, ese dato
// es más específico que la tabla general.
eq('el preset gana sobre la tabla', creditosDe('Cálculo I', 'uc', { creditos: 6 }), 6);
// Y 0 en el preset es un valor, no un "sin dato".
eq('un preset con 0 no cae a la tabla', creditosDe('Cálculo I', 'uc', { creditos: 0 }), 0);
eq('un ramo que no está devuelve null', creditosDe('Ramo Inventado', 'uc', null), null);
eq('FEN no usa la tabla de UC', creditosDe('Cálculo I', 'fen', null), null);
eq('un tenant desconocido tampoco', creditosDe('Cálculo I', 'uai', null), null);
// null y 0 son cosas distintas: 0 es un crédito conocido, null es "no lo sé".
chk('null y 0 no se confunden',
  creditosDe('Ramo Inventado', 'uc', null) === null && creditosDe('Práctica I', 'uc', null) === 0);

console.log('\n=== La malla UC queda cubierta ===');
const ramosMalla = Object.values(MALLA_UC['ING-PC']).flat();
const sinCredito = ramosMalla.filter(n => creditosDe(n, 'uc', null) === null);
chk(`los ${ramosMalla.length} ramos del plan común tienen crédito`, sinCredito.length === 0);
if (sinCredito.length) console.log('     faltan: ' + sinCredito.join(', '));
// Comercial es de otra facultad: sus ramos NO están en el catálogo de
// Ingeniería, así que es esperable que no tengan crédito todavía.
const com = Object.values(MALLA_UC['COM']).flat();
console.log(`     (Ing. Comercial: ${com.filter(n => creditosDe(n, 'uc', null) !== null).length}/${com.length} — su malla es de otra facultad)`);

console.log('\n=== Las tres vías de creación usan la misma función ===');
// Si una diverge, un ramo agregado por búsqueda tendría créditos y el mismo
// ramo agregado desde la malla no, y el PPA cambiaría según cómo lo cargaste.
chk('ninguna vía sigue leyendo el preset directo',
  !/creditos:\(preset&&preset\.creditos\)\|\|null/.test(src));
chk('las tres llaman a creditosDe', (src.match(/creditosDe\(/g) || []).length >= 4);

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
