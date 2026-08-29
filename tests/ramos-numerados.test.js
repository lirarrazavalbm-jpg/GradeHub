// "Contabilidad I" es la "Contabilidad" del catálogo — y "Gestión de Personas I"
// NO es "Gestión de Personas".
//
// Hay programas que numeran el primer ramo de una serie que en la malla va sin
// número. Quien lo escribe así se quedaba sin pauta oficial, sin créditos y sin
// sigla, teniendo el ramo correcto. Pero la regla no puede ser "quítale el
// romano y listo": en FEN conviven pares donde el numerado es otro ramo, en
// otro semestre y con otra pauta. Darle a esos la pauta del otro sería calcular
// el promedio con las ponderaciones equivocadas.
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
const J = v => JSON.stringify(v);

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

const preset = (n, t, c) => val(`findPresetName(${J(n)},${J(t)},${J(c)})`);
const creditos = (n, t) => val(`creditosDe(${J(n)},${J(t)})`);

console.log('\n=== El caso: el ramo escrito con número que en la malla va sin número ===');
chk('"Contabilidad I" encuentra la pauta oficial de Contabilidad',
  preset('Contabilidad I', 'fen', 'IC') === 'Contabilidad');
chk('y también sus créditos', creditos('Contabilidad I', 'fen') === creditos('Contabilidad', 'fen'));
chk('la pauta que recibe es la misma, no una parecida',
  J(val(`presetRamo('Contabilidad I','fen','IC')`).categorias.map(c => [c.nombre, c.peso])) ===
  J(val(`presetRamo('Contabilidad','fen','IC')`).categorias.map(c => [c.nombre, c.peso])));
chk('da igual cómo se escriba el espacio o la mayúscula',
  preset('CONTABILIDAD  I', 'fen', 'IC') === 'Contabilidad');

console.log('\n=== Lo que NO se puede fusionar: el numerado es otro ramo ===');
// Los dos existen en la malla FEN, en semestres distintos.
[['Gestión de Personas I', 'Gestión de Personas'],
 ['Gestión de Personas II', 'Gestión de Personas'],
 ['Marketing I', 'Marketing'],
 ['Marketing II', 'Marketing'],
 ['Finanzas I', 'Finanzas'],
 ['Finanzas II', 'Finanzas'],
 ['Métodos Cuantitativos I', 'Métodos Cuantitativos'],
 ['Comunicación II', 'Comunicación']].forEach(([numerado, base]) => {
  chk(`"${numerado}" no hereda la pauta de "${base}"`, preset(numerado, 'fen', 'IC') !== base);
  chk(`"${numerado}" existe en la malla por su cuenta`, val(`ramoDeLaMalla(${J(numerado)},'fen')`) === true);
});

console.log('\n=== Solo el primero de la serie ===');
chk('"Contabilidad II" no cae en Contabilidad', preset('Contabilidad II', 'fen', 'IC') !== 'Contabilidad');
chk('"Contabilidad III" tampoco', preset('Contabilidad III', 'fen', 'IC') !== 'Contabilidad');
chk('"Contabilidad IV" tampoco', preset('Contabilidad IV', 'fen', 'IC') !== 'Contabilidad');
chk('un ramo que no existe sigue sin existir', preset('Astrofísica I', 'fen', 'IC') === null);

console.log('\n=== La coincidencia exacta siempre manda ===');
{
  // Todas las pautas que ya funcionaban tienen que seguir resolviendo a sí
  // mismas: la caída es un segundo intento, no un reemplazo.
  const PRESETS_FEN = val('PRESETS_FEN');
  const malas = Object.keys(PRESETS_FEN).filter(k => {
    const evals = Array.isArray(PRESETS_FEN[k]) ? PRESETS_FEN[k] : (PRESETS_FEN[k].evals || []);
    return evals.length && preset(k, 'fen', 'IC') !== k;
  });
  chk('cada pauta FEN se sigue encontrando por su propio nombre', malas.length === 0 || !console.log('       ' + malas.join(', ')));
}

console.log('\n=== UC: los numerados de verdad no se tocan ===');
chk('"Cálculo I" es un ramo real y encuentra su propia pauta',
  preset('Cálculo I', 'uc', 'ING-PC') === 'Cálculo I');
chk('y su sigla es la suya', val(`siglaUC('Cálculo I','ING-PC')`) === val(`SIGLAS_UC['ING-PC']['Cálculo I']`));
{
  const MALLA_UC = val('MALLA_UC');
  const malas = [];
  for (const car in MALLA_UC) for (const s in MALLA_UC[car]) MALLA_UC[car][s].forEach(n => {
    const sigla = val(`siglaUC(${J(n)},${J(car)})`);
    if (sigla !== val(`SIGLAS_UC[${J(car)}][${J(n)}]`)) malas.push(`${car}/${n}`);
  });
  chk('ningún ramo UC cambió de sigla', malas.length === 0 || !console.log('       ' + malas.join(', ')));
}

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
if (fail) process.exit(1);
