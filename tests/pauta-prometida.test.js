// Lo que la lista promete, el ramo lo tiene que traer.
//
// En el onboarding la estrella de "ponderaciones oficiales precargadas" la
// calcula `findPresetName`, que compara nombres normalizados. La carga del ramo
// la hacía `presetRamo`, que buscaba la clave por igualdad exacta. Basta que la
// malla escriba "Filosofía: ¿Para Qué?" y el preset se llame
// 'Filosofía: ¿para qué?' para que la app muestre la estrella y después cree el
// ramo vacío — con el agravante de que la ficha se disculpa diciendo "todavía
// no tenemos la pauta de este ramo" cuando sí la tiene.
//
// No lanza ninguna excepción y los tests de suma no lo ven, porque miran el
// registro de presets y ahí la pauta está perfecta. Solo aparece cruzando los
// nombres de la MALLA contra lo que devuelve la carga, que es lo que hace esto.
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

const MALLA_UC = val('MALLA_UC'), MALLAS_FEN = (() => { try { return val('MALLAS'); } catch (e) { return null; } })();
const findPresetName = val('findPresetName'), presetRamo = val('presetRamo');

// El nombre tal como lo ve el estudiante en la lista del onboarding.
const ramosDeMalla = malla => {
  const out = [];
  for (const sem of Object.keys(malla || {})) {
    for (const r of malla[sem]) out.push(typeof r === 'string' ? r : (r.n || r.nombre));
  }
  return out;
};

console.log('\n=== UC: si la lista muestra la estrella, el ramo trae la pauta ===');
for (const carrera of Object.keys(MALLA_UC)) {
  const nombres = ramosDeMalla(MALLA_UC[carrera]);
  chk(`${carrera}: la malla trae ramos (${nombres.length})`, nombres.length > 0);
  nombres.forEach(nombre => {
    // La estrella se pinta con esto (app.js, lista de ramos del onboarding).
    if (!findPresetName(nombre, 'uc', carrera)) return;
    // Y el ramo se crea con esto, con el MISMO nombre de la malla.
    const p = presetRamo(nombre, 'uc', carrera);
    chk(`${carrera} · ${nombre}: promete pauta y la entrega`,
      !!p && Array.isArray(p.categorias) && p.categorias.length > 0);
  });
}

if (MALLAS_FEN) {
  console.log('\n=== FEN: la misma promesa ===');
  for (const carrera of Object.keys(MALLAS_FEN)) {
    ramosDeMalla(MALLAS_FEN[carrera]).forEach(nombre => {
      if (!findPresetName(nombre, 'fen', carrera)) return;
      const p = presetRamo(nombre, 'fen', carrera);
      chk(`${carrera} · ${nombre}: promete pauta y la entrega`,
        !!p && Array.isArray(p.categorias) && p.categorias.length > 0);
    });
  }
}

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
