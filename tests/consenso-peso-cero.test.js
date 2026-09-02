// Cinco personas de acuerdo no pueden dar consenso cero.
//
// Caso real, 2026-08-31. Cinco estudiantes reportaron Métodos Matemáticos I
// diciendo exactamente lo mismo —tres evaluaciones de 20% y un examen de 40%
// con compuerta 3,0/3,9— y quedaron en CINCO grupos de una persona. A cada uno
// le sobró la evaluación que la pauta oficial traía y él ya no cursa, la dejó
// en 0% y la bautizó distinto: "Solemne", "N", "O", "X".
//
// El consenso agrupa por estructura exacta, así que esa fila muerta bastaba
// para que nadie coincidiera con nadie. Una evaluación en 0% no aporta al
// promedio: no es parte de la ponderación y no viaja en el reporte.
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

const estructuraParaConsenso = val('estructuraParaConsenso');
const huellaEstructura = val('huellaEstructura');

// Los cinco reportes, tal como llegaron a catalog_reports.
const REPORTES = [
  [{ peso: 20, nombre: 'Control 1' }, { peso: 20, nombre: 'Control 2' }, { peso: 20, nombre: 'Control 3' }, { cap: 3.9, min: 3, peso: 40, nombre: 'Examen' }, { peso: 0, nombre: 'Solemne' }],
  [{ cap: 3.9, min: 3, peso: 40, nombre: 'Examen' }, { peso: 0, nombre: 'Solemne' }, { peso: 20, nombre: 'Solemne 1' }, { peso: 20, nombre: 'Solemne 2' }, { peso: 20, nombre: 'Solemne 3' }],
  [{ cap: 3.9, min: 3, peso: 40, nombre: 'Examen' }, { peso: 0, nombre: 'N' }, { peso: 20, nombre: 'Solemne 1' }, { peso: 20, nombre: 'Solemne 2' }, { peso: 20, nombre: 'Solemne 3' }],
  [{ cap: 3.9, min: 3, peso: 40, nombre: 'Examen' }, { peso: 0, nombre: 'O' }, { peso: 20, nombre: 'Solemne 1' }, { peso: 20, nombre: 'Solemne 2' }, { peso: 20, nombre: 'Solemne3' }],
  [{ cap: 3.9, min: 3, peso: 40, nombre: 'Examen' }, { peso: 20, nombre: 'Solemne 1' }, { peso: 20, nombre: 'Solemne 2' }, { peso: 20, nombre: 'Solemne 3' }, { peso: 0, nombre: 'X' }],
];

// Igual que el servidor: agrupa por (estructura, huella), con el orden que fija
// estructuraDe (nombre normalizado).
const ordenar = est => [...est].sort((a, b) => {
  const ka = val('normName')(a.nombre), kb = val('normName')(b.nombre);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
});
const grupoMayor = lista => {
  const g = {};
  lista.forEach(e => { const o = ordenar(e); const k = JSON.stringify(o) + '##' + huellaEstructura(o); g[k] = (g[k] || 0) + 1; });
  return Math.max(...Object.values(g));
};

console.log('\n=== El caso que lo destapó ===');
chk('sin filtrar, las cinco quedan en grupos de una', grupoMayor(REPORTES) === 1);
chk('filtrando las de 0%, tres coinciden y hay consenso',
  grupoMayor(REPORTES.map(estructuraParaConsenso)) >= 3);
chk('el umbral del servidor son 3 personas, así que eso alcanza', val('CONSENSO_AUTO') <= 3);

console.log('\n=== Qué se filtra y qué no ===');
chk('una evaluación en 0% no viaja',
  estructuraParaConsenso([{ nombre: 'Examen', peso: 40 }, { nombre: 'X', peso: 0 }]).length === 1);
chk('las que sí ponderan quedan intactas',
  JSON.stringify(estructuraParaConsenso([{ nombre: 'Examen', peso: 40, min: 3, cap: 3.9 }])) ===
  JSON.stringify([{ nombre: 'Examen', peso: 40, min: 3, cap: 3.9 }]));
chk('un peso escrito como texto no se cuela', estructuraParaConsenso([{ nombre: 'A', peso: '0' }]).length === 0);
chk('sin estructura no explota', estructuraParaConsenso(null).length === 0);
chk('la suma no cambia al filtrar',
  val('estadoReporte')(estructuraParaConsenso(REPORTES[1])).total === val('estadoReporte')(REPORTES[1]).total);

console.log('\n=== El borrador del modal SÍ las muestra ===');
{
  // Filtrar al armar el borrador escondería una fila en 0% que el estudiante
  // justamente quiere subir a 20%.
  const app = fs.readFileSync(raiz + 'app.js', 'utf8');
  chk('estructuraReporte no filtra', /function estructuraReporte\(r\)\{return estructuraDe\(r\)/.test(app));
  chk('el filtro se aplica al enviar', /const est=estructuraParaConsenso\(reporteRamoId/.test(app));
  chk('y al comparar contra el consenso', /const mine=huellaEstructura\(estructuraParaConsenso\(/.test(app));
}

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
if (fail) process.exit(1);
