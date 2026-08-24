// Reportar una pauta oficial, sin tocarle nada, tiene que poder enviarse.
//
// Contabilidad no se podía: sus tres Controles de Lectura son 3,33 · 3,33 ·
// 3,34 y estructuraDe() redondeaba a un decimal, así que el reporte sumaba
// 99,9. El modal abría bloqueado con "Falta 0.1% para llegar a 100" sin que el
// estudiante hubiera tocado nada, y la RPC lo habría rechazado igual
// (abs(total-100) >= 0.05). El recorrido completo se comprueba acá, sobre
// TODAS las pautas y no sobre una: el próximo programa transcrito con dos
// decimales no puede volver a caer en esto sin que algo falle.
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

// Todo ramo de toda malla que tenga pauta oficial, en las dos universidades.
const MALLA = val('MALLA'), MALLA_UC = val('MALLA_UC');
const casos = [];
const push = (tenant, carrera, nombre) => {
  if (!casos.some(c => c.tenant === tenant && c.carrera === carrera && c.nombre === nombre)) casos.push({ tenant, carrera, nombre });
};
for (const car in MALLA) for (const s in MALLA[car]) MALLA[car][s].forEach(n => push('fen', car, n));
for (const car in MALLA_UC) for (const s in MALLA_UC[car]) MALLA_UC[car][s].forEach(n => push('uc', car, n));
Object.keys(val('PRESETS_FEN')).forEach(n => push('fen', 'IC', n));

const conPauta = [];
casos.forEach(({ tenant, carrera, nombre }) => {
  const p = val(`presetRamo(${JSON.stringify(nombre)},${JSON.stringify(tenant)},${JSON.stringify(carrera)})`);
  if (!p || !p.categorias.length) return;
  conPauta.push({ tenant, carrera, nombre,
    ramo: { id: 'r', nombre, origen: { tenant, carrera }, categorias: p.categorias, gates: p.gates } });
});

console.log('\n=== Toda pauta oficial se puede reportar tal como viene ===');
chk(`el barrido encuentra pautas (${conPauta.length})`, conPauta.length >= 40);

const noEnviables = conPauta.filter(c => !val(`estadoReporte(estructuraDe(${JSON.stringify(c.ramo)}))`).lista);
chk('ninguna abre el modal bloqueada',
  noEnviables.length === 0 || !console.log('       ' + noEnviables.map(c => `${c.tenant}/${c.carrera} · ${c.nombre}`).join('\n       ')));

// El caso que lo destapó, fijado por nombre para que no se pierda en el barrido.
const conta = conPauta.find(c => c.nombre === 'Contabilidad' && c.tenant === 'fen');
chk('Contabilidad está en el barrido', !!conta);
if (conta) {
  const est = val(`estructuraDe(${JSON.stringify(conta.ramo)})`);
  const estado = val(`estadoReporte(${JSON.stringify(est)})`);
  chk('Contabilidad suma 100 y no 99,9', estado.total === 100 && estado.lista);
  chk('conserva los dos decimales del programa',
    est.filter(e => /Control de Lectura/.test(e.nombre)).map(e => e.peso).sort().join() === '3.33,3.33,3.34');
}

console.log('\n=== Lo que se envía sigue cumpliendo lo que exige Supabase ===');
{
  const malos = [];
  conPauta.forEach(c => {
    const est = val(`estructuraDe(${JSON.stringify(c.ramo)})`);
    if (est.length < 1 || est.length > 30) malos.push([c.nombre, 'cantidad de evaluaciones']);
    est.forEach(e => {
      if (!(typeof e.peso === 'number' && e.peso >= 0 && e.peso <= 100)) malos.push([c.nombre, 'peso fuera de rango']);
      if (!(typeof e.nombre === 'string' && e.nombre.trim().length >= 1 && e.nombre.trim().length <= 120)) malos.push([c.nombre, 'nombre fuera de largo']);
      if ('slots' in e && !(Number.isInteger(e.slots) && e.slots >= 1 && e.slots <= 100)) malos.push([c.nombre, 'slots inválido']);
      if ('min' in e && !(e.min >= 1 && e.min <= 7)) malos.push([c.nombre, 'min fuera de escala']);
      if ('cap' in e && !(e.cap >= 1 && e.cap <= 7)) malos.push([c.nombre, 'cap fuera de escala']);
    });
  });
  chk('ninguna pauta viola las validaciones de la RPC', malos.length === 0 || !console.log('       ' + JSON.stringify(malos)));
}

console.log('\n=== El orden no depende del idioma del dispositivo ===');
{
  // Dos estudiantes con la misma pauta tienen que producir la MISMA estructura
  // y la misma huella. Si el orden saliera de localeCompare() sin locale fijo,
  // el del teléfono en polaco no agruparía nunca con el del teléfono en español
  // y el consenso no se formaría, sin un solo error a la vista.
  const cats = ['Óptica', 'Oral', 'Ética', 'Examen', 'Ñandú', 'Nota 2'].map((nombre, i) => ({ id: 'c' + i, nombre, peso: 100 / 6, notas: [] }));
  const ramo = { id: 'r', nombre: 'X', origen: { tenant: 'fen', carrera: 'IC' }, categorias: cats, gates: [] };
  const orden = val(`estructuraDe(${JSON.stringify(ramo)})`).map(e => e.nombre).join('|');

  const alRevés = { ...ramo, categorias: [...cats].reverse() };
  chk('el mismo conjunto de evaluaciones da el mismo orden, venga como venga',
    val(`estructuraDe(${JSON.stringify(alRevés)})`).map(e => e.nombre).join('|') === orden);

  const porLocale = ['es', 'pl', 'sv', 'en', 'tr'].map(loc => [...cats].map(c => c.nombre).sort((a, b) => a.localeCompare(b, loc)).join('|'));
  chk('el caso de prueba es de los que localeCompare sí desordena', new Set(porLocale).size > 1);
  // El orden tiene que ser el del nombre normalizado, que es igual en todas
  // partes, y no el de ningún idioma en particular.
  const normName = val('normName');
  const esperado = [...cats].map(c => c.nombre)
    .sort((a, b) => { const ka = normName(a), kb = normName(b); return ka < kb ? -1 : ka > kb ? 1 : 0; }).join('|');
  chk('el orden es el del nombre normalizado, no el de un idioma', orden === esperado);
  chk('y no coincide con el que daría el idioma que lo desordena',
    porLocale.some(o => o !== orden) && orden === esperado);

  const huellas = new Set([orden, val(`estructuraDe(${JSON.stringify(alRevés)})`).map(e => e.nombre).join('|')]);
  chk('una sola huella para la misma pauta', huellas.size === 1);
}

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
if (fail) process.exit(1);
