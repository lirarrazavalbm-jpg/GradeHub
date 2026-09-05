// Los cursos que existen sin pertenecer a un semestre.
//
// Los OFG y optativos son una elección, no un ramo que curse todo el mundo, así
// que no van en MALLA_UC. Pero eso los dejaba fuera del buscador: de los quince
// ramos que los estudiantes escribieron a mano la primera noche, nueve eran de
// esta clase. Tres pidieron "biocel", cada uno con su grafía.
//
// Este test fija las dos mitades: que estén disponibles para buscar, y que no
// se cuelen como si fueran ramos de malla. Algunos pueden recibir una pauta
// oficial después de que aparezca su programa, aunque sigan fuera de malla.
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

const CURSOS_UC = val('CURSOS_UC'), MALLA_UC = val('MALLA_UC'), PRESETS_UC = val('PRESETS_UC'), CREDITOS_UC = val('CREDITOS_UC');
const normName = val('normName'), catalogo = val('catalogRamosUniversidad'), buscar = val('searchCatalog'), presetRamo = val('presetRamo');

console.log('\n=== La lista está bien formada ===');
chk('tiene cursos', CURSOS_UC.length > 0);
chk('cada entrada es [sigla, nombre]', CURSOS_UC.every(c => Array.isArray(c) && c.length === 2));
chk('todas las siglas tienen formato UC', CURSOS_UC.every(([s]) => /^[A-Z]{3}[0-9]{3,4}[A-Z]?$/.test(s)));
chk('ningún nombre viene vacío ni cortado', CURSOS_UC.every(([, n]) => typeof n === 'string' && n.trim().length > 3));
chk('no hay siglas repetidas', new Set(CURSOS_UC.map(c => c[0])).size === CURSOS_UC.length);
chk('no hay nombres repetidos', new Set(CURSOS_UC.map(c => normName(c[1]))).size === CURSOS_UC.length);

console.log('\n=== No invaden la malla y solo prometen pautas verificadas ===');
const enMalla = new Set();
Object.values(MALLA_UC).forEach(sems => Object.values(sems).forEach(rs => rs.forEach(r => enMalla.add(normName(typeof r === 'string' ? r : (r.n || r.nombre))))));
chk('ninguno duplica un ramo que ya está en una malla',
  CURSOS_UC.every(([, n]) => !enMalla.has(normName(n))));
const cursosConPauta=CURSOS_UC.filter(([,n])=>Object.keys(PRESETS_UC).some(k=>normName(k)===normName(n)));
chk('cada pauta fuera de malla se puede cargar desde su programa verificado',
  cursosConPauta.length>0&&cursosConPauta.every(([,n])=>!!presetRamo(n,'uc','ING-PC')));
chk('Biología de la Célula deja de llegar vacía',
  !!presetRamo('Biología de la Célula','uc','ING-PC'));

console.log('\n=== El buscador los encuentra ===');
const cat = catalogo('uc', 'ING-PC');
const porNombre = new Map(cat.map(r => [normName(r.nombre), r]));
chk('todos aparecen en el catálogo de la universidad',
  CURSOS_UC.every(([, n]) => porNombre.has(normName(n))));
chk('entran como fuera de malla (semestre 0)',
  CURSOS_UC.every(([, n]) => (porNombre.get(normName(n)) || {}).semestre === 0));
chk('solo promete ponderaciones cuando su preset existe',
  CURSOS_UC.every(([,n])=>(porNombre.get(normName(n))||{}).tienePreset===cursosConPauta.some(([,p])=>normName(p)===normName(n))));
// El caso que originó todo: tres estudiantes escribieron "biocel" a mano.
chk('"Biología de la Célula" está en el catálogo', porNombre.has(normName('Biología de la Célula')));
chk('y "Experiencia Creyente y Secularismo" también', porNombre.has(normName('Experiencia Creyente y Secularismo')));
const programasSinSiglaVerificada=[
  'Fundamentos Básicos de Cultura Sorda y Lengua de Señas Chilena',
  'El misterioso caso del curso de ficción policial (Edición especial Santiago Negro)',
  'Ciudadanía y Derechos humanos: Enfoques interdisciplinarios',
];
chk('los programas recibidos se encuentran por nombre sin inventarles sigla',
  programasSinSiglaVerificada.every(nombre=>{
    const fila=porNombre.get(normName(nombre));
    return fila&&fila.tienePreset===true&&fila.sigla===null&&!!presetRamo(nombre,'uc','ING-PC');
  }));

console.log('\n=== Ingeniería UC no termina en cuarto semestre ===');
// La tabla de SCT ya contiene los ramos de los 34 majors. Dejarla solo para
// calcular créditos hacía que un estudiante de 5°+ tuviera que escribir a
// mano un curso oficial que la app ya conocía, perdiendo hasta su sigla.
const avanzado = 'Sistemas Operativos y Redes';
chk('un ramo de major existe en el catálogo aunque no esté en la malla común',
  !!CREDITOS_UC[avanzado] && !enMalla.has(normName(avanzado)) &&
  porNombre.has(normName(avanzado)));
const porSigla = buscar('IIC2333', 'uc', 'ING-PC', 6);
chk('buscar por sigla encuentra el ramo de major correcto',
  porSigla.some(r => r.nombre === avanzado && r.sigla === 'IIC2333'));
chk('el ramo de major no promete una pauta que no existe',
  !!porNombre.get(normName(avanzado)) && !porNombre.get(normName(avanzado)).tienePreset);
const mensajeTardio = val("selectedTenant='uc';selectedCarrera='ING-PC';selectedSem=5;obCoursePickerIntro([])");
chk('5° explica que no inventamos un major y pide el horario',
  /separa por major/.test(mensajeTardio) && /sigla de tu horario/.test(mensajeTardio));
const metaAvanzado = val("obCatalogMeta({semestre:0,sigla:'IIC2333',fuente:'catalogo-ingenieria',tienePreset:false})");
chk('el resultado explica que viene del catálogo y no inventa un semestre 0',
  metaAvanzado === 'IIC2333 · catálogo de Ingeniería UC');

console.log('\n=== No se le ofrecen a otra universidad ===');
const catFen = catalogo('fen', 'ICO');
chk('un estudiante FEN no ve los OFG de la UC',
  CURSOS_UC.every(([, n]) => !catFen.some(r => normName(r.nombre) === normName(n))));

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
