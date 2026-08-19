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

console.log('\n=== Elegir universidad no excluye carreras ===');
const tenants = run('TENANTS');
chk('UC nombra Comercial en la primera pantalla', /Comercial/i.test(tenants.uc.sub));
chk('el nombre persistido de UC no cambia sin migrar profiles', tenants.uc.name === 'U. Católica · Ingeniería');

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
const sinPauta = cargar([{ id: 'f', nombre: 'Termodinámica', origen: uc, categorias: [], gates: [] }]);
chk('un ramo sin programa oficial sigue sin pauta', sinPauta[0].categorias.length === 0);

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
// Comercial puede ver estos cursos —los OFG los toma cualquier estudiante UC—,
// lo que no puede es recibirlos CON ESTRELLA: la pauta es del plan común de
// Ingeniería y findPresetName la descarta para esa carrera, así que la estrella
// prometería ponderaciones que después no se cargan.
['Ecolog', 'Revelaci'].forEach(q => {
  chk('Comercial UC NO recibe la pauta de Ingeniería para "' + q + '"',
    buscarUC(q, 'COM').every(r => !r.tienePreset));
});
// Un ramo de la malla sin programa oficial aparece, pero sin estrella de pauta.
const termo = buscarUC('Termodinámica', 'ING-PC').find(r => r.nombre === 'Termodinámica');
chk('Termodinámica aparece por la malla, pero sin estrella de pauta', !!termo && !termo.tienePreset);

console.log('\n=== Cuando la pauta oficial cambia ===');
// Un preset se copia al ramo al crearlo y después queda congelado. Si más tarde
// se corrige el programa —un examen que pasa de 20% a 30%— el estudiante se
// queda con los pesos viejos y su promedio deja de ser el real. No falla nada:
// el número simplemente empieza a estar equivocado, que es la peor forma.
const cambioDePauta = run('cambioDePauta');
const huellaPauta = run('huellaPauta');
const actualizarPauta = run('actualizarPauta');
const setRamos = rs => { ctx.__rs = rs; run('S.ramos=__rs'); };
run('S=S||{};S.ramos=[]');

// Se arma un ramo como quedó al crearse, y después se le "envejece" la pauta a
// mano para simular que el preset cambió después.
const conPautaVieja = () => {
  const p = run('presetRamo')('Introducción a la Programación', 'uc', 'ING-PC');
  const cats = p.categorias.map(c => ({ ...c, notas: [] }));
  cats[0].peso = 5;                       // la Interrogación 1 valía 5, ahora 15
  const r = { id: 'r1', nombre: 'Introducción a la Programación', origen: uc,
              categorias: cats, gates: p.gates, aporta: p.aporta };
  r.pautaHuella = huellaPauta(cats);      // así se la dimos en su momento
  return r;
};

const viejo = conPautaVieja();
setRamos([viejo]);
const cambio = cambioDePauta(viejo);
chk('detecta que la pauta oficial cambió', !!cambio);
chk('y dice exactamente qué evaluación cambió de peso',
  !!cambio && cambio.cambios.some(c => c.tipo === 'peso' && c.nombre === 'Interrogación 1' && c.despues === 15));

// Lo que NO puede pasar: opinar sobre una pauta que el estudiante armó él.
const editado = conPautaVieja();
editado.categorias[1].peso = 42;          // la tocó a mano después
setRamos([editado]);
chk('no opina si el estudiante editó la pauta a mano', cambioDePauta(editado) === null);

// Ni molestar a quien ya está al día.
const alDia = (() => {
  const p = run('presetRamo')('Introducción a la Programación', 'uc', 'ING-PC');
  const r = { id: 'r2', nombre: 'Introducción a la Programación', origen: uc,
              categorias: p.categorias, gates: p.gates, aporta: p.aporta };
  r.pautaHuella = huellaPauta(p.categorias);
  return r;
})();
setRamos([alDia]);
chk('no molesta a quien ya tiene la pauta al día', cambioDePauta(alDia) === null);

// Un ramo creado a mano no tiene pauta oficial contra la cual compararse.
const manualSinHuella = { id: 'r3', nombre: 'Lo mío', origen: null, categorias: [], gates: [] };
setRamos([manualSinHuella]);
chk('un ramo creado a mano nunca recibe el aviso', cambioDePauta(manualSinHuella) === null);

// Y al actualizar, las notas se conservan por NOMBRE: los ids se regeneran.
const paraActualizar = conPautaVieja();
paraActualizar.categorias[0].notas = [{ id: 'n1', nombre: 'Interrogación 1', valor: 6.2, peso: 1 }];
setRamos([paraActualizar]);
chk('actualizar reporta que sí hizo el cambio', actualizarPauta('r1') === true);
const despues = run('S.ramos')[0];
chk('actualizar deja el peso oficial', (despues.categorias.find(c => c.nombre === 'Interrogación 1') || {}).peso === 15);
chk('y conserva la nota que el estudiante ya tenía',
  ((despues.categorias.find(c => c.nombre === 'Interrogación 1') || {}).notas || [{}])[0].valor === 6.2);
chk('y deja de avisar', cambioDePauta(despues) === null);

console.log('\n=== Todos pueden decir qué estudian ===');
// Antes solo se podía declarar una carrera CON malla: FEN ofrecía dos y UC
// tres. Alguien de Derecho UC no tenía cómo decirlo, así que elegía una que no
// era la suya o se quedaba fuera — y nosotros no teníamos manera de saber que
// hay cuarenta esperando esa malla, que es el dato que decide cuál construir.
const DECL = run('CARRERAS_DECLARABLES');
const declarables = run('carrerasDeclarables');
chk('la oferta de pregrado completa de las dos universidades visibles',
  DECL.uc.length > 40 && DECL.fen.length === 3);
chk('las que tienen malla siguen apuntando a su código',
  DECL.uc.find(c => c.n === 'Ingeniería').malla === 'ING-PC' &&
  DECL.fen.find(c => c.n === 'Ingeniería Comercial').malla === 'IC');
// Contador Auditor conserva su malla en MALLA pero se sacó de la oferta a
// propósito: se declara, no se carga. Reactivarla sería una decisión, no un
// efecto colateral de esto.
chk('Contador Auditor se declara pero no carga malla',
  !DECL.fen.find(c => c.n === 'Contador Auditor').malla);
// Toda carrera que diga tener malla tiene que tenerla de verdad, o el
// estudiante la elige esperando que se cargue sola y no pasa nada.
['uc', 'fen'].forEach(t => {
  const mallas = run('mallaFor')(t);
  chk(`en ${t}, toda carrera marcada con malla existe en la malla`,
    DECL[t].filter(c => c.malla).every(c => !!mallas[c.malla]));
});
// Las que tienen malla van primero: son el caso común y tienen que estar a un
// toque, aunque la lista tenga 71 entradas.
const ordenUC = declarables('uc');
chk('las que cargan malla salen primero', !!ordenUC[0].malla && !!ordenUC[1].malla);
// Una universidad sin oferta cargada no puede quedar sin opciones: un paso
// obligatorio sin nada que elegir deja al estudiante encerrado.
chk('una universidad sin oferta declarada igual ofrece algo', declarables('uai').length > 0);

console.log('\n=== `lista:true` abre la evaluación a N notas ===');
// Sin esto la fila sale como nota única y el estudiante no puede cargar los
// controles que le tomaron — ni `dropLowest` tiene entre qué descartar.
const contaPreset = run('presetRamo')('Contabilidad', 'fen', null);
const catPorNombre = n => contaPreset.categorias.find(c => c.nombre === n);
// Solo los Sorpresa: el programa fija cuántos son los de lectura y los de
// ejercicios, así que esos van en filas propias con su fecha.
['Controles Sorpresa'].forEach(n => {
  const c = catPorNombre(n);
  chk('Contabilidad · ' + n + ' es lista abierta', !!c && c.directNota === false && !c.slots);
});
// Y lo que NO cambia: una evaluación normal sigue siendo una sola nota.
chk('Contabilidad · el Examen sigue siendo nota única', catPorNombre('Examen').directNota === true);

console.log('\n=== Las fechas del programa llegan al ramo ===');
// Sin esto la Agenda y el feed de calendario quedan vacíos aunque el programa
// traiga las fechas: el constructor de presets FEN las ignoraba.
chk('Contabilidad · el preset trae las fechas de los controles',
  catPorNombre('Control de Lectura 1').fecha === '2026-08-07' &&
  catPorNombre('Control de Ejercicios 4').fecha === '2026-10-30');
// Una compuerta por control, no una sobre el promedio del grupo.
chk('Contabilidad · cada control lleva su propio mínimo de 1,5',
  contaPreset.gates.filter(g => g.min === 1.5).length === 9);

// Un ramo creado antes de que existieran las fechas: se rellenan al cargar,
// porque huellaPauta no mira la fecha y el aviso de "la pauta cambió" nunca se
// dispararía por ella.
const ramoSinFechas = run('normalize')({ ramos: [{
  id: 'v1', nombre: 'Contabilidad', origen: { tenant: 'fen', carrera: null },
  categorias: [
    { id: 'a', nombre: 'Control de Lectura 1', peso: 3.33, notas: [] },
    { id: 'b', nombre: 'Control de Ejercicios 1', peso: 10, fecha: '2026-12-25', notas: [] },
  ], gates: [] }] }).ramos[0];
chk('un ramo viejo recibe la fecha que le faltaba',
  ramoSinFechas.categorias[0].fecha === '2026-08-07');
// Lo que el estudiante escribió manda: puede saber algo que el programa no dice.
chk('y la fecha que puso el estudiante no se pisa',
  ramoSinFechas.categorias[1].fecha === '2026-12-25');
// Los otros dos ramos donde el número de controles tampoco es fijo.
[['Gestión y Empresas', 'Controles de Lectura'], ['Marketing', 'Controles']].forEach(([ramo, ev]) => {
  const c = run('presetRamo')(ramo, 'fen', null).categorias.find(x => x.nombre === ev);
  chk(ramo + ' · ' + ev + ' es lista abierta', !!c && c.directNota === false);
});

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
