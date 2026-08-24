// El consenso rellena pautas que faltan, y SOLO esas.
//
// La regla dura del proyecto es que las ponderaciones salen de programas
// oficiales. Esto no la rompe: lo que reportan tres estudiantes se aplica
// únicamente donde no hay programa transcrito ni nada escrito por el
// estudiante, y queda marcado como reportado. Lo que estos tests fijan es
// justamente el borde: dónde SÍ y dónde NO.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const src = ['data.js', 'engine.js', 'app.js', 'render-main.js', 'render-agenda.js']
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

// El guardado real toca localStorage y la nube: acá solo interesa el estado.
let guardados = 0;
ctx.save = () => { guardados++; };

// Un ramo FEN sin pauta oficial. 'Negocios I' está en la malla y no tiene
// programa transcrito, que es exactamente el hueco que esto viene a llenar.
const RAMO = 'Negocios I';
const consenso = (respaldos, estructura) => [{
  ramo: RAMO,
  ramo_key: val(`normName(${JSON.stringify(RAMO)})`),
  estructura,
  huella: 'x',
  respaldos,
}];
const EST = [
  { nombre: 'Controles', peso: 30, slots: 3 },
  { nombre: 'Examen', peso: 40, min: 3.5, cap: 3.9 },
  { nombre: 'Trabajo', peso: 30 },
];

const correr = async (filas, ramos) => {
  ctx.cargarConsenso = async () => filas;
  val(`S = ${JSON.stringify({ ...val('S'), ramos })}`);
  const puestas = await ctx.aplicarConsensoAuto();
  return { puestas, ramos: val('S').ramos };
};

const delCatalogo = extra => ({ id: 'a', nombre: RAMO, origen: { tenant: 'fen', carrera: 'IC' }, categorias: [], gates: [], ...extra });

(async () => {

console.log('\n=== Rellena el hueco ===');
{
  const { puestas, ramos } = await correr(consenso(3, EST), [delCatalogo()]);
  const r = ramos[0];
  chk('un ramo del catálogo sin pauta recibe la del consenso', puestas === 1 && r.categorias.length === 3);
  chk('conserva los pesos reportados', r.categorias.map(c => c.peso).join() === '30,40,30');
  chk('reconstruye las compuertas de nota mínima',
    r.gates.length === 1 && r.gates[0].type === 'min_grade_required' && r.gates[0].min === 3.5 && r.gates[0].cap === 3.9);
  chk('la compuerta apunta a la evaluación correcta',
    r.gates[0].catId === (r.categorias.find(c => c.nombre === 'Examen') || {}).id);
  chk('respeta slots', (r.categorias.find(c => c.nombre === 'Controles') || {}).slots === 3);
  chk('queda marcada como reportada, no oficial', r.consensoRespaldos === 3);
  chk('no inventa fechas', r.categorias.every(c => !c.fecha));
  chk('deja huella para que cambioDePauta pueda ofrecer la oficial después',
    r.pautaHuella === val(`huellaPauta(${JSON.stringify(r.categorias)})`));
}

console.log('\n=== Dónde NO se mete ===');
{
  const conPauta = delCatalogo({ categorias: [{ id: 'c1', nombre: 'Prueba', peso: 100, notas: [] }] });
  const { puestas, ramos } = await correr(consenso(3, EST), [conPauta]);
  chk('un ramo que ya tiene pauta no se toca', puestas === 0 && ramos[0].categorias.length === 1);
}
{
  const aMano = { id: 'b', nombre: RAMO, origen: null, categorias: [], gates: [] };
  const { puestas } = await correr(consenso(3, EST), [aMano]);
  chk('un ramo creado a mano no se toca', puestas === 0);
}
{
  const { puestas } = await correr(consenso(2, EST), [delCatalogo()]);
  chk('con menos respaldos que CONSENSO_AUTO no se aplica', puestas === 0);
}
{
  const { puestas } = await correr([], [delCatalogo()]);
  chk('sin consenso no pasa nada', puestas === 0);
}
{
  ctx.cargarConsenso = async () => null;
  val(`S = ${JSON.stringify({ ...val('S'), ramos: [delCatalogo()] })}`);
  chk('si el consenso no carga, no explota', (await ctx.aplicarConsensoAuto()) === 0);
}
{
  // Contabilidad SÍ tiene programa oficial transcrito. Aunque tres personas
  // reporten otra cosa, el programa manda: el consenso llena huecos, no pisa.
  const oficial = 'Contabilidad';
  const filas = [{ ramo: oficial, ramo_key: val(`normName(${JSON.stringify(oficial)})`), estructura: EST, huella: 'x', respaldos: 9 }];
  const vacio = { id: 'd', nombre: oficial, origen: { tenant: 'fen', carrera: 'IC' }, categorias: [], gates: [] };
  chk('hay pauta oficial para el ramo de control', !!val(`pautaPendiente(${JSON.stringify(vacio)})`));
  const { puestas } = await correr(filas, [vacio]);
  chk('el programa oficial le gana al consenso', puestas === 0);
}

console.log('\n=== La ficha no la presenta como oficial ===');
{
  const app = fs.readFileSync(raiz + 'app.js', 'utf8');
  const render = fs.readFileSync(raiz + 'render-main.js', 'utf8');
  const todo = app + render;
  chk('la ficha dice que la reportaron estudiantes', /Pauta reportada por estudiantes/.test(todo));
  chk('y dice que no sale del programa oficial', /No la sacamos del programa oficial/.test(todo));
  chk('el umbral vive en una constante y no suelto en el código', /const CONSENSO_AUTO=3;/.test(app));
}

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
if (fail) process.exit(1);

})();
