// Una pauta que trae fechas tiene que decir de qué semestre es.
//
// El catálogo puede traer la fecha de una prueba, y presetRamo() solo la
// entrega si el período de la pauta sigue vigente. Ese candado depende por
// entero de que el preset declare `periodo`: si no lo declara, su estado es
// 'desconocido', y una pauta de 2026-2 le daría a alguien en marzo de 2027 las
// fechas de septiembre del año anterior — presentadas con la misma estrella de
// "pauta oficial" que todo lo demás. No falla nada: son fechas válidas de otro
// semestre, que es la peor forma de estar equivocado.
//
// Hoy la regla se cumple. Este test es para que se siga cumpliendo cuando
// alguien transcriba el programa número 16 a las once de la noche.
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

const registros = [['PRESETS_FEN', val('PRESETS_FEN')], ['PRESETS_UC', val('PRESETS_UC')]];
const evalsDe = def => Array.isArray(def) ? def : (def && def.evals) || [];

console.log('\n=== Toda pauta con fechas declara su período ===');
{
  const sinPeriodo = [];
  let conFecha = 0;
  registros.forEach(([reg, tabla]) => {
    Object.entries(tabla).forEach(([nombre, def]) => {
      const fechas = evalsDe(def).filter(([, , extra]) => extra && extra.fecha);
      if (!fechas.length) return;
      conFecha++;
      if (!val('periodoDePreset')(def)) sinPeriodo.push(`${reg}/${nombre} (${fechas.length} fechas)`);
    });
  });
  chk(`hay pautas con fechas que vigilar (${conFecha})`, conFecha > 0);
  chk('ninguna de ellas se queda sin período',
    sinPeriodo.length === 0 || !console.log('       ' + sinPeriodo.join('\n       ')));
}

console.log('\n=== Todo período declarado se puede leer ===');
{
  // '2026-3' o '2026/2' pasan por el ojo humano y mueren en el regex: el estado
  // queda 'desconocido' y las fechas se retienen sin que nadie lo note.
  const malos = [];
  registros.forEach(([reg, tabla]) => {
    Object.entries(tabla).forEach(([nombre, def]) => {
      const p = val('periodoDePreset')(def);
      if (p && val('estadoPeriodoPauta')(p, new Date('2000-01-01')) === 'desconocido') malos.push(`${reg}/${nombre}: ${p}`);
    });
  });
  chk('ningún período declarado es ilegible', malos.length === 0 || !console.log('       ' + malos.join(', ')));
}

console.log('\n=== El candado hace lo que dice ===');
{
  const conFechaYPeriodo = [];
  registros.forEach(([, tabla]) => Object.entries(tabla).forEach(([nombre, def]) => {
    if (evalsDe(def).some(([, , x]) => x && x.fecha) && val('periodoDePreset')(def)) conFechaYPeriodo.push([nombre, def]);
  }));
  chk('hay al menos una pauta con fecha y período para probarlo', conFechaYPeriodo.length > 0);

  const [nombre] = conFechaYPeriodo[0] || [];
  if (nombre) {
    const tenant = val('PRESETS_FEN')[nombre] ? 'fen' : 'uc';
    const carrera = tenant === 'fen' ? 'IC' : 'ING-PC';
    const J = JSON.stringify;
    const vigente = val(`presetRamo(${J(nombre)},${J(tenant)},${J(carrera)},new Date('2000-01-01'))`);
    const vencido = val(`presetRamo(${J(nombre)},${J(tenant)},${J(carrera)},new Date('2099-01-01'))`);
    chk('dentro del período la pauta trae sus fechas', vigente.categorias.some(c => c.fecha));
    chk('pasado el período no entrega ninguna', vencido.categorias.every(c => !c.fecha));
    chk('pero las ponderaciones siguen igual: envejecen distinto',
      JSON.stringify(vigente.categorias.map(c => [c.nombre, c.peso])) ===
      JSON.stringify(vencido.categorias.map(c => [c.nombre, c.peso])));
  }
}

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
if (fail) process.exit(1);
