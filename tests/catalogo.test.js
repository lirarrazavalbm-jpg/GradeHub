// La malla es una sugerencia, no una restricción. Un estudiante puede estar
// cursando un ramo que solo figura en la malla de otra carrera —o de una que
// ya no ofrecemos— y tiene que poder encontrarlo.
const fs = require('fs'), vm = require('vm');
const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => stub, createElement: () => stub, addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '', hash: '' }, setTimeout, clearTimeout, console
};
vm.createContext(ctx);
vm.runInContext(['data.js', 'engine.js', 'app.js', 'render-agenda.js'].map(f => fs.readFileSync(__dirname + '/../' + f, 'utf8')).join('\n'), ctx);
const run = e => vm.runInContext(e, ctx);
const buscar = (q, car) => run('searchCatalog(' + JSON.stringify(q) + ',"fen",' + JSON.stringify(car) + ',2)');

let ok = 0, fail = 0;
const chk = (n, cond) => { if (cond) ok++; else { fail++; console.log('  FAIL ' + n); } };

console.log('\n=== Buscar cubre toda la universidad, no solo tu carrera ===');
const hist = buscar('Historia', 'IICG');
chk('IICG encuentra un ramo que solo está en Comercial', hist.some(r => r.nombre === 'Historia Económica'));
const costos = buscar('Costos', 'IC');
chk('se encuentra un ramo de una malla que ya no se ofrece', costos.some(r => r.nombre === 'Fundamentos de Costos'));

console.log('\n=== Los ramos de tu propia malla salen primero ===');
const conta = buscar('Contabilidad', 'IC');
const primerAjeno = conta.findIndex(r => !r.propio);
const ultimoPropio = conta.map(r => r.propio).lastIndexOf(true);
chk('ningún ajeno se cuela antes de un propio', primerAjeno === -1 || ultimoPropio < primerAjeno);

console.log('\n=== Solo se ofrecen las carreras acordadas ===');
const CAR = run('CARRERAS'), CAR_UC = run('CARRERAS_UC'), MALLA = run('MALLA');
chk('FEN ofrece exactamente 2 carreras', Object.keys(CAR).length === 2);
chk('Ing. Comercial fusionada, sin menciones', !!CAR['IC'] && !CAR['IC-CE'] && !CAR['IC-AE']);
chk('UC no ofrece Derecho ni Medicina', !CAR_UC['DER'] && !CAR_UC['MED']);
// Sacar una carrera de la oferta no puede borrar su malla: sus ramos se siguen
// buscando, y volver a ofrecerla debe ser agregar una línea.
chk('la malla de Contador Auditor sigue existiendo', Array.isArray((MALLA['CA'] || {})[1]));

console.log('\n=== Migración de las menciones fusionadas ===');
['IC-CE', 'IC-AE'].forEach(c => {
  const d = run('normalize(' + JSON.stringify({ carrera: c, ramos: [] }) + ')');
  chk(c + ' migra a IC', d.carrera === 'IC');
});
['IICG', 'CA'].forEach(c => {
  const d = run('normalize(' + JSON.stringify({ carrera: c, ramos: [] }) + ')');
  chk(c + ' no se toca', d.carrera === c);
});

console.log('\n=== La malla fusionada conserva ambas menciones ===');
const ic = MALLA['IC'];
chk('1º a 4º es el tronco común', ic[1].length > 0 && ic[4].length > 0);
chk('5º trae ramos de las dos menciones',
  ic[5].includes('Microeconomía I') && ic[5].includes('Gestión de Personas I'));

console.log('\n=== La pauta oficial alcanza a los ramos que ya estaban ===');
// Las pautas se transcriben DESPUÉS de que el estudiante agregó el ramo. Hasta
// que esto existió, el preset solo se aplicaba al crearlo: quien tenía
// Introducción a la Programación desde antes se quedaba en "Sin evaluaciones"
// para siempre, con la pauta ya publicada. No lanza nada — el ramo nunca se
// entera— así que solo se caza acá.
const normalize = run('normalize');
const uc = { tenant: 'uc', carrera: 'ING-PC' };
const cargar = ramos => normalize({ ramos: JSON.parse(JSON.stringify(ramos)) }).ramos;

const vacios = cargar([
  { id: 'a', nombre: 'Introducción a la Programación', origen: uc, categorias: [], gates: [] },
  { id: 'b', nombre: 'Dinámica', origen: uc, categorias: [], gates: [] },
]);
chk('un ramo del catálogo vacío recibe su pauta al cargar', vacios[0].categorias.length === 8);
chk('y también sus compuertas', vacios[0].gates.length === 1);
// Dinámica llega con sus cuatro evaluaciones de cátedra y con el vínculo al
// laboratorio: sin `aporta`, la nota le quedaría 30% corta y sin avisar.
chk('Dinámica llega con su vínculo al laboratorio',
  vacios[1].categorias.length === 4 && !!vacios[1].aporta && vacios[1].aporta.peso === 30);

// El nombre de la malla y el de la pauta no siempre coinciden en mayúsculas.
const filo = cargar([{ id: 'c', nombre: 'Filosofía: ¿Para Qué?', origen: uc, categorias: [], gates: [] }]);
chk('calza aunque la malla escriba el nombre distinto (¿Para Qué? vs ¿para qué?)', filo[0].categorias.length === 4);

// Lo que NO puede pasar: pisar lo que el estudiante escribió a mano.
const conNotas = cargar([{
  id: 'd', nombre: 'Introducción a la Programación', origen: uc, gates: [],
  categorias: [{ id: 'x', nombre: 'Mi propia prueba', peso: 100, notas: [{ id: 'n', nombre: 'n', valor: 6, peso: 1 }] }],
}]);
chk('no toca un ramo donde el estudiante ya puso su pauta', conNotas[0].categorias.length === 1 && conNotas[0].categorias[0].nombre === 'Mi propia prueba');

const manual = cargar([{ id: 'e', nombre: 'Introducción a la Programación', origen: null, categorias: [], gates: [] }]);
chk('no toca un ramo creado a mano, aunque el nombre calce', manual[0].categorias.length === 0);

// Y un ramo del catálogo SIN pauta publicada sigue sin inventarse una.
const sinPauta = cargar([{ id: 'f', nombre: 'Cálculo II', origen: uc, categorias: [], gates: [] }]);
chk('Cálculo II sigue sin pauta: su programa no publica ponderaciones', sinPauta[0].categorias.length === 0);

console.log('\n=== Una pauta que nadie puede encontrar no existe ===');
// Los OFG y electivos no van en la malla a propósito: son una elección, no un
// ramo de todos. Pero el catálogo se armaba SOLO desde las mallas, así que sus
// pautas quedaban invisibles — funcionaban tecleando el nombre completo y
// exacto, o sea solo para quien ya sabía que estaban ahí.
const buscarUC = (q, car) => run('searchCatalog(' + JSON.stringify(q) + ',"uc",' + JSON.stringify(car) + ',2)');
['Ecolog', 'Revelaci'].forEach(q => {
  const r = buscarUC(q, 'ING-PC');
  chk('Ingeniería UC encuentra "' + q + '" aunque no esté en la malla', r.length > 0 && r[0].tienePreset);
});
// Y no al revés: los presets UC son del plan común de Ingeniería. Ofrecérselos
// a Comercial pondría una estrella de "pauta oficial" sobre un ramo que después
// se agrega vacío, porque findPresetName los descarta para esa carrera.
['Ecolog', 'Revelaci'].forEach(q => {
  chk('Comercial UC NO recibe la pauta de Ingeniería para "' + q + '"', buscarUC(q, 'COM').length === 0);
});
// Cálculo II tiene programa pero no ponderaciones: no se ofrece como pauta.
const c2 = buscarUC('Cálculo II', 'ING-PC').find(r => r.nombre === 'Cálculo II');
chk('Cálculo II aparece por la malla, pero sin estrella de pauta', !!c2 && !c2.tienePreset);

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
