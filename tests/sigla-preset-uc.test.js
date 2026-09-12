// La sigla de un ramo con pauta tiene que verse en la pantalla de inicio.
//
// Reportado por Lucas el 2026-09-12: "Revelación y Fe" y "Principios Ecológicos
// y Medio Ambiente" aparecían sin sigla en su home. Las dos son cursos fuera de
// malla (OFG y electivos), así que no están en `CREDITOS_UC`, y el catálogo
// completo —el único lugar donde vivía su sigla— se baja aparte y solo cuando
// alguien busca un ramo. En el home nunca había llegado: `siglaDeRamo` devolvía
// null sin que fallara nada.
//
// Y hay una trampa peor que la ausencia. "Revelación y Fe" existe DOS VECES con
// siglas distintas: el horario oficial la da como TTF012 y el catálogo de
// programas publica TEB110, que es otro curso con el mismo nombre. Resolver por
// nombre contra el catálogo no habría dejado el campo vacío: habría mostrado la
// sigla equivocada, que es peor, porque se ve bien.
//
// Por eso este test exige que la sigla esté DECLARADA en el preset y que mande
// sobre el catálogo. Un preset nuevo sin sigla falla acá, no en el celular de
// alguien.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const src = ['data.js', 'engine.js', 'app.js', 'render-agenda.js']
  .map(f => fs.readFileSync(raiz + f, 'utf8')).join('\n');

const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => stub, createElement: () => stub, addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '/', search: '', hash: '' }, history: { replaceState() {} },
  setTimeout, clearTimeout, console,
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const run = n => vm.runInContext(n, ctx);
const sigla = nombre => run(`siglaDeRamo({nombre:${JSON.stringify(nombre)},origen:{tenant:'uc'}},'uc')`);

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

// Los únicos presets UC sin sigla conocida: no están en el catálogo de
// programas y nadie nos ha pasado su código. La lista es explícita para que
// agregar un preset nuevo sin sigla NO pase callado — si aparece el dato, sale
// de acá; si se suma un preset, o trae sigla o falla este test.
const SIN_SIGLA_CONOCIDA = [
  'El misterioso caso del curso de ficción policial (Edición especial Santiago Negro)',
  'Ciudadanía y Derechos humanos: Enfoques interdisciplinarios',
];

console.log('=== Todo preset UC muestra su sigla SIN el catálogo cargado ===');
console.log('    (el home no lo baja: son ~660 KB que solo se piden al buscar)');
const nombres = run('Object.keys(PRESETS_UC)');
const mudos = nombres.filter(n => !sigla(n) && !SIN_SIGLA_CONOCIDA.includes(n));
chk(`los ${nombres.length} presets resuelven su sigla (o están en la lista de excepciones)`, mudos.length === 0);
if (mudos.length) mudos.forEach(n => console.log('       sin sigla: ' + n));

console.log('\n=== Los dos que reportó Lucas ===');
chk('Revelación y Fe → TTF012', sigla('Revelación y Fe') === 'TTF012');
chk('Principios Ecológicos y Medio Ambiente → BIO143M', sigla('Principios Ecológicos y Medio Ambiente') === 'BIO143M');
chk('y el nombre escrito sin tildes también resuelve', sigla('revelacion y fe') === 'TTF012');

console.log('\n=== La sigla declarada MANDA sobre el catálogo ===');
// Con el catálogo cargado y diciendo otra cosa, gana el preset. Este es el
// homónimo real: TEB110 "Revelación y Fe" existe y no es el curso de la pauta.
run(`var CURSOS_UC_FULL=[['TEB110','Revelación y Fe',8]];var ESCUELAS_UC=['Teología'];`);
chk('con TEB110 en el catálogo, sigue mostrando TTF012', sigla('Revelación y Fe') === 'TTF012');

console.log('\n=== Ningún conflicto NUEVO entre preset y catálogo pasa callado ===');
// Un nombre que el catálogo trae con otra sigla es una decisión humana: o son
// dos cursos distintos con el mismo nombre, o uno de los dos datos está mal.
// El código no puede elegir solo, así que los conocidos van listados y
// cualquier otro revienta acá.
const CONFLICTOS_CONOCIDOS = {
  // El horario oficial 2026-2 la dicta como TTF012 (Formación Teológica).
  // TEB110 es un curso distinto con el mismo nombre.
  'Revelación y Fe': 'TEB110',
};
const catalogo = fs.readFileSync(raiz + 'cursos-uc.js', 'utf8');
const filas = new Map();
for (const [, sig, nom] of catalogo.matchAll(/\["([A-Z0-9]+)","((?:[^"\\]|\\.)*)",-?\d+/g)) {
  if (!filas.has(nom)) filas.set(nom, sig);
}
const choques = [];
for (const n of nombres) {
  const declarada = sigla(n), enCatalogo = filas.get(n);
  if (!declarada || !enCatalogo || declarada === enCatalogo) continue;
  if (CONFLICTOS_CONOCIDOS[n] === enCatalogo) continue;
  choques.push(`${n}: preset dice ${declarada}, catálogo dice ${enCatalogo}`);
}
chk('no hay conflictos sin revisar', choques.length === 0);
choques.forEach(c => console.log('       ' + c));

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
