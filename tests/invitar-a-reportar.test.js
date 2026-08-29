// A quien corrigió la pauta oficial se le pide el dato, no se le pregunta.
//
// El catálogo tiene 10 pautas de 88 ramos y el consenso necesita tres personas
// reportando lo mismo. Al 2026-08-24 había 3 reportes de 3 personas: el cuello
// de botella no es el consenso, es que nadie reporta.
//
// Y la persona con el dato ya estaba identificada en el código: cambioDePauta()
// distingue al que editó su pauta —"su versión manda sobre la nuestra"— y se
// calla para no pisarle el promedio. Callarse para no tocarle el ramo está
// bien; callarse para no pedirle el dato era desperdicio.
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

const oficial = val(`presetRamo('Contabilidad','fen','IC')`);
const base = () => ({
  id: 'r1', nombre: 'Contabilidad', origen: { tenant: 'fen', carrera: 'IC' },
  categorias: JSON.parse(JSON.stringify(oficial.categorias)), gates: oficial.gates,
});
const conHuella = r => { r.pautaHuella = val(`huellaPauta(${J(val(`catsDePauta(${J(r.categorias)})`))})`); return r; };
const editada = r => val(`pautaEditada(${J(r)})`);

console.log('\n=== Quién cuenta como "corrigió la pauta" ===');
{
  chk('recién cargada del catálogo, no está editada', editada(conHuella(base())) === false);

  const r = conHuella(base());
  r.categorias[0] = { ...r.categorias[0], peso: r.categorias[0].peso + 5 };
  chk('cambiarle un peso sí cuenta', editada(r) === true);

  const r2 = conHuella(base());
  r2.categorias.push({ id: 'x', nombre: 'Trabajo del profe nuevo', peso: 10, notas: [] });
  chk('agregar una evaluación cuenta', editada(r2) === true);

  const r3 = conHuella(base());
  r3.categorias[0].notas = [{ id: 'n', nombre: 'Nota', valor: 5.5 }];
  chk('escribir una NOTA no cuenta: la huella es la forma, no las notas', editada(r3) === false);

  const r4 = conHuella(base());
  chk('un ramo sin pauta oficial nunca cuenta como editado',
    editada({ ...r4, pautaHuella: null }) === false);
  chk('uno sin evaluaciones tampoco', editada({ ...r4, categorias: [] }) === false);
}

console.log('\n=== Una evaluación que salió de la pauta no es una edición ===');
{
  // Las huérfanas de #235 quedan en 0% y fuera de la huella. Si contaran como
  // edición, a esa persona le pediríamos reportar una pauta que no tocó.
  const r = conHuella(base());
  r.categorias.push({ id: 'h', nombre: 'Control viejo', peso: 0, fueraDePauta: true,
    notas: [{ id: 'n', nombre: 'Nota', valor: 4.5 }] });
  chk('una huérfana no convierte la pauta en editada', editada(r) === false);
}

console.log('\n=== La ficha pide el dato en vez de preguntar ===');
{
  const render = fs.readFileSync(raiz + 'render-main.js', 'utf8');
  const html = fs.readFileSync(raiz + 'index.html', 'utf8');
  chk('el texto del botón es reemplazable', /id="ramo-report-text"/.test(html));
  chk('la ficha decide según pautaEditada', /pautaEditada\(r\)/.test(render));
  chk('a quien la corrigió se le pide compartirla', /Corregiste esta pauta/.test(render));
  chk('al resto se le sigue preguntando', /no calza con tu curso/.test(render));
  chk('el botón sigue apareciendo solo si hay algo que enviar', /if\(r\.categorias\.length\)/.test(render));
}

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
if (fail) process.exit(1);
