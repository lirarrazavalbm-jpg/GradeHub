// Métodos Matemáticos I recibe su sigla, MEM1005, en CREDITOS_FEN.
//
// Sin sigla no se podía usar en el marketplace de clases. Lo que importa acá es
// quien ya lo tenía guardado sin sigla: al aparecer, el ramo la recibe y nada
// más. No cambia su clave de consenso, no se duplica, conserva su pauta, sus
// notas y su promedio. Datos sintéticos.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const src = ['data.js', 'engine.js', 'app.js', 'render-agenda.js'].map(f => fs.readFileSync(raiz + f, 'utf8')).join('\n');

const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => stub, createElement: () => stub, addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '/', search: '', hash: '' }, history: { replaceState() {} },
  setTimeout, clearTimeout, console,
  syncToCloud() {}, renderAll() {},
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const run = n => vm.runInContext(n, ctx);

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

console.log('=== El dato ===');
const tabla = run('CREDITOS_FEN');
chk('Métodos Matemáticos I → MEM1005, sin el prefijo EN', tabla['Métodos Matemáticos I'][1] === 'MEM1005');
chk('créditos sin cambio', tabla['Métodos Matemáticos I'][0] === 6);
chk('ningún otro ramo FEN usa MEM1005', Object.entries(tabla).filter(([, f]) => f && f[1] === 'MEM1005').length === 1);
chk('la serie queda MEM1005 / 1505 / 2005 / 2505',
  ['I', 'II', 'III', 'IV'].map(n => tabla['Métodos Matemáticos ' + n][1]).join() === 'MEM1005,MEM1505,MEM2005,MEM2505');

console.log('\n=== Un ramo guardado antes, sin sigla ===');
// Como lo dejó la app antes de este cambio: del catálogo FEN, con pauta, notas
// y la clave de consenso fijada al crearlo.
const antes = () => ({
  id: 'r1', nombre: 'Métodos Matemáticos I', color: '#000', creditos: 6,
  origen: { tenant: 'fen', carrera: 'IC', ramoKey: 'metodos matematicos i' },
  categorias: [
    { id: 'c1', nombre: 'Solemne 1', peso: 20, notas: [{ id: 'n1', valor: 5.5 }] },
    { id: 'c2', nombre: 'Solemne 2', peso: 20, notas: [{ id: 'n2', valor: 4.2 }] },
    { id: 'c3', nombre: 'Solemne 3', peso: 20, notas: [] },
    { id: 'c4', nombre: 'Examen', peso: 40, notas: [] },
  ],
  gates: [],
});
run(`S={...S,tenant:'fen',carrera:'IC'}`);
ctx.__viejo = antes();
const avgViejo = run('ramoAvg(__viejo,undefined,[__viejo])');
const claveVieja = run('claveReporte(__viejo)');
const presetViejo = run('definicionPresetDelRamo(__viejo)');

const data = run('normalize')({ tenant: 'fen', carrera: 'IC', ramos: [antes()] });
ctx.__nuevo = data.ramos[0];
chk('recibe la sigla al cargar', ctx.__nuevo.sigla === 'MEM1005');
chk('no se duplica', data.ramos.length === 1);
chk('la clave de consenso guardada no cambia', ctx.__nuevo.origen.ramoKey === 'metodos matematicos i');
chk('ni la que se usa al reportar', run('claveReporte(__nuevo)') === claveVieja && claveVieja === 'metodos matematicos i');
chk('ni la canónica', run('claveCanonica(__nuevo.origen.ramoKey,"fen","IC")') === 'metodos matematicos i');
chk('ramoKey de FEN sigue siendo el nombre, con o sin sigla', run('ramoKey("Métodos Matemáticos I","fen","IC","MEM1005")') === 'metodos matematicos i');
chk('sigue encontrando su pauta', presetViejo && run('definicionPresetDelRamo(__nuevo)') === presetViejo);
chk('la pauta calza con su sigla', run('pautaCalzaConSigla(__nuevo.nombre,__nuevo.sigla)') === true);
const notas = r => r.categorias.map(c => c.id + ':' + c.peso + ':' + c.notas.map(n => n.id + '=' + n.valor).join()).join('|');
chk('conserva categorías, pesos y notas', notas(ctx.__nuevo) === notas(antes()));
chk('y el promedio', typeof avgViejo === 'number' && run('ramoAvg(__nuevo,undefined,[__nuevo])') === avgViejo);
chk('el mismo ramo propuesto de nuevo se reconoce como ya agregado',
  run('S.ramos=[__nuevo];ramoPropuestoYaEsta({nombre:"Métodos Matemáticos I",sigla:"MEM1005"})') === true);

console.log('\n=== Escrito a mano no recibe nada ===');
const manual = run('normalize')({ tenant: 'fen', ramos: [{ ...antes(), origen: null }] }).ramos[0];
chk('sin origen de catálogo no se sella', manual.sigla == null);

console.log(`\n${ok} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
