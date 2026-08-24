// Actualizar la pauta oficial no puede costarle notas al estudiante.
//
// La pauta es nuestra y la corregimos cuando aparece un programa mejor
// transcrito. La nota es suya y la escribió porque rindió esa evaluación.
// Antes, una evaluación que salía de la pauta se llevaba las notas puestas
// ahí, y un simple cambio de nombre —una tilde, una mayúscula— contaba como
// evaluación distinta.
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

const RAMO = 'Contabilidad';
const oficial = val(`presetRamo(${JSON.stringify(RAMO)},'fen','IC')`);
chk('el ramo de prueba tiene pauta oficial', !!oficial && oficial.categorias.length >= 2);

// La pauta que TIENE el estudiante: la oficial, pero con la primera evaluación
// escrita distinto y con una evaluación que la oficial ya no trae.
const nota = (id, valor) => ({ id, nombre: 'Nota', valor, peso: 1, fecha: null, hora: null, fechaQuitada: false });
const vieja = oficial.categorias.map((c, i) => ({
  ...c,
  nombre: i === 0 ? c.nombre.toUpperCase() + ' ' : c.nombre,
  notas: i === 0 ? [nota('n1', 6.2)] : [],
}));
vieja.push({ id: 'x1', nombre: 'Control sorpresa', peso: 0, ponderaNotas: false, directNota: true, notas: [nota('n2', 4.5)] });
vieja.push({ id: 'x2', nombre: 'Taller que nunca rindió', peso: 0, ponderaNotas: false, directNota: true, notas: [] });

const armar = () => {
  const r = { id: 'r1', nombre: RAMO, color: '#000', creditos: null, origen: { tenant: 'fen', carrera: 'IC' },
    aporta: null, gates: [], categorias: JSON.parse(JSON.stringify(vieja)) };
  r.pautaHuella = val(`huellaPauta(${JSON.stringify(r.categorias)})`);
  val(`S = ${JSON.stringify({ ...val('S'), tenant: 'fen', carrera: 'IC', ramos: [r] })}`);
  return val('S').ramos[0];
};

console.log('\n=== La nota no se va con la pauta ===');
{
  armar();
  chk('antes de actualizar, la app detecta el cambio', !!val(`cambioDePauta(S.ramos[0])`));
  chk('y avisa que hay notas en evaluaciones que salen', val(`cambioDePauta(S.ramos[0])`).notasFueraDePauta === true);

  chk('actualizar devuelve true', ctx.actualizarPauta('r1') === true);
  const r = val('S').ramos[0];

  const primera = r.categorias.find(c => c.nombre === oficial.categorias[0].nombre);
  chk('un cambio de mayúsculas o espacios ya no borra la nota',
    !!primera && primera.notas.length === 1 && primera.notas[0].valor === 6.2);

  const huerfana = r.categorias.find(c => c.nombre === 'Control sorpresa');
  chk('la evaluación que salió de la pauta se conserva', !!huerfana);
  chk('con su nota intacta', !!huerfana && huerfana.notas.length === 1 && huerfana.notas[0].valor === 4.5);
  chk('en 0%, para no mover el promedio', !!huerfana && huerfana.peso === 0);
  chk('y marcada como fuera de la pauta', !!huerfana && huerfana.fueraDePauta === true);

  chk('la que quedó vacía no deja basura', !r.categorias.some(c => c.nombre === 'Taller que nunca rindió'));

  chk('la pauta queda igual a la oficial',
    val(`huellaPauta(catsDePauta(S.ramos[0].categorias))`) === val(`huellaPauta(${JSON.stringify(oficial.categorias)})`));
  chk('no vuelve a ofrecer el mismo cambio para siempre', val(`cambioDePauta(S.ramos[0])`) === null);

  const est = val(`estructuraDe(S.ramos[0])`);
  chk('lo que se reporta al catálogo no incluye la huérfana',
    !est.some(e => e.nombre === 'Control sorpresa'));
  const limpio = { ...r, categorias: oficial.categorias, gates: oficial.gates };
  chk('y queda idéntico a reportar la pauta oficial recién puesta',
    JSON.stringify(est) === JSON.stringify(val(`estructuraDe(${JSON.stringify(limpio)})`)));

  chk('las compuertas son las de la pauta nueva, no las viejas',
    r.gates.length === oficial.gates.length);
}

console.log('\n=== Si el programa devuelve la evaluación, la nota vuelve con ella ===');
{
  // Sacamos "Control sorpresa" de la pauta y sus notas quedaron en 0%. Si al
  // semestre siguiente el programa la trae de vuelta, tiene que reaparecer con
  // sus notas puestas — no duplicada: la vieja en 0% y la nueva vacía.
  armar();
  ctx.actualizarPauta('r1');
  const r = val('S').ramos[0];
  const huerfana = r.categorias.find(c => c.nombre === 'Control sorpresa');

  // Segunda ronda: la pauta "oficial" ahora sí trae Control sorpresa.
  const vuelve = oficial.categorias.map(c => ({ ...c }));
  vuelve[vuelve.length - 1] = { ...vuelve[vuelve.length - 1], peso: vuelve[vuelve.length - 1].peso - 5 };
  vuelve.push({ id: 'nuevo', nombre: 'Control sorpresa', peso: 5, ponderaNotas: false, directNota: true, notas: [] });
  ctx.cambioDePauta = () => ({ preset: { categorias: vuelve, gates: [], aporta: null }, cambios: [], notasFueraDePauta: false });
  chk('la nota estaba guardada en la huérfana', !!huerfana && huerfana.notas[0].valor === 4.5);
  ctx.actualizarPauta('r1');
  const r2 = val('S').ramos[0];
  const vueltas = r2.categorias.filter(c => c.nombre === 'Control sorpresa');
  chk('vuelve una sola vez, no duplicada', vueltas.length === 1);
  chk('con la nota que había quedado guardada', vueltas[0].notas.length === 1 && vueltas[0].notas[0].valor === 4.5);
  chk('y con el peso de la pauta nueva, ya no en 0%', vueltas[0].peso === 5);
  chk('deja de estar marcada como fuera de la pauta', !vueltas[0].fueraDePauta);
  delete ctx.cambioDePauta;
}

console.log('\n=== Sin notas que rescatar, nada cambia ===');
{
  const limpia = oficial.categorias.map(c => ({ ...c, notas: [] }));
  limpia.push({ id: 'x3', nombre: 'Se va sin nota', peso: 0, ponderaNotas: false, directNota: true, notas: [] });
  const r = { id: 'r2', nombre: RAMO, color: '#000', creditos: null, origen: { tenant: 'fen', carrera: 'IC' },
    aporta: null, gates: [], categorias: limpia };
  r.pautaHuella = val(`huellaPauta(${JSON.stringify(limpia)})`);
  val(`S = ${JSON.stringify({ ...val('S'), ramos: [r] })}`);
  chk('no avisa de notas que no existen', val(`cambioDePauta(S.ramos[0])`).notasFueraDePauta === false);
  ctx.actualizarPauta('r2');
  chk('la pauta queda exactamente en la oficial',
    val('S').ramos[0].categorias.length === oficial.categorias.length);
}

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
if (fail) process.exit(1);
