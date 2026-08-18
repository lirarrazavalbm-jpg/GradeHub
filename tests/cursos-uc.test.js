// Los cursos que existen sin pertenecer a un semestre.
//
// Los OFG y optativos son una elección, no un ramo que curse todo el mundo, así
// que no van en MALLA_UC. Pero eso los dejaba fuera del buscador: de los quince
// ramos que los estudiantes escribieron a mano la primera noche, nueve eran de
// esta clase. Tres pidieron "biocel", cada uno con su grafía.
//
// Este test fija las dos mitades: que estén disponibles para buscar, y que no
// se cuelen como si fueran ramos de malla con pauta.
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

const CURSOS_UC = val('CURSOS_UC'), MALLA_UC = val('MALLA_UC'), PRESETS_UC = val('PRESETS_UC');
const normName = val('normName'), catalogo = val('catalogRamosUniversidad'), presetRamo = val('presetRamo');

console.log('\n=== La lista está bien formada ===');
chk('tiene cursos', CURSOS_UC.length > 0);
chk('cada entrada es [sigla, nombre]', CURSOS_UC.every(c => Array.isArray(c) && c.length === 2));
chk('todas las siglas tienen formato UC', CURSOS_UC.every(([s]) => /^[A-Z]{3}[0-9]{3,4}[A-Z]?$/.test(s)));
chk('ningún nombre viene vacío ni cortado', CURSOS_UC.every(([, n]) => typeof n === 'string' && n.trim().length > 3));
chk('no hay siglas repetidas', new Set(CURSOS_UC.map(c => c[0])).size === CURSOS_UC.length);
chk('no hay nombres repetidos', new Set(CURSOS_UC.map(c => normName(c[1]))).size === CURSOS_UC.length);

console.log('\n=== No invaden la malla ni fingen tener pauta ===');
const enMalla = new Set();
Object.values(MALLA_UC).forEach(sems => Object.values(sems).forEach(rs => rs.forEach(r => enMalla.add(normName(typeof r === 'string' ? r : (r.n || r.nombre))))));
chk('ninguno duplica un ramo que ya está en una malla',
  CURSOS_UC.every(([, n]) => !enMalla.has(normName(n))));
// Si alguno consigue su programa oficial, su pauta va a PRESETS_UC y este test
// avisa para moverlo: un curso no puede estar en las dos listas a la vez.
chk('ninguno tiene pauta declarada en PRESETS_UC',
  CURSOS_UC.every(([, n]) => !Object.keys(PRESETS_UC).some(k => normName(k) === normName(n))));
chk('la carga devuelve null para todos, no una pauta inventada',
  CURSOS_UC.every(([, n]) => presetRamo(n, 'uc', 'ING-PC') === null));

console.log('\n=== El buscador los encuentra ===');
const cat = catalogo('uc', 'ING-PC');
const porNombre = new Map(cat.map(r => [normName(r.nombre), r]));
chk('todos aparecen en el catálogo de la universidad',
  CURSOS_UC.every(([, n]) => porNombre.has(normName(n))));
chk('entran como fuera de malla (semestre 0)',
  CURSOS_UC.every(([, n]) => (porNombre.get(normName(n)) || {}).semestre === 0));
chk('y sin prometer ponderaciones',
  CURSOS_UC.every(([, n]) => (porNombre.get(normName(n)) || {}).tienePreset === false));
// El caso que originó todo: tres estudiantes escribieron "biocel" a mano.
chk('"Biología de la Célula" está en el catálogo', porNombre.has(normName('Biología de la Célula')));
chk('y "Experiencia Creyente y Secularismo" también', porNombre.has(normName('Experiencia Creyente y Secularismo')));

console.log('\n=== No se le ofrecen a otra universidad ===');
const catFen = catalogo('fen', 'ICO');
chk('un estudiante FEN no ve los OFG de la UC',
  CURSOS_UC.every(([, n]) => !catFen.some(r => normName(r.nombre) === normName(n))));

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
