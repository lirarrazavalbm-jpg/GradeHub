// La fecha de UNA casilla de un grupo: cómo se muestra bajo su nombre y cómo se
// escribe. Nace de un error visible en producción — bajo "Laboratorio 1" salía
// "[object Object]" en vez de la fecha— y de que el campo obligaba a teclear el
// año completo en cada evaluación del semestre.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const leer = f => fs.readFileSync(raiz + f, 'utf8');

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
const elementos = {};
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
  document: {
    getElementById: id => elementos[id] || (elementos[id] = { ...stub, value: '', disabled: false }),
    createElement: () => stub, addEventListener() {},
    documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } },
    querySelector: () => stub, querySelectorAll: () => [], body: stub,
  },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '', hash: '' }, setTimeout, clearTimeout, console,
};
vm.createContext(ctx);
vm.runInContext(['data.js', 'engine.js', 'app.js', 'render-main.js', 'render-agenda.js'].map(leer).join('\n'), ctx);
const val = c => vm.runInContext(c, ctx);

console.log('=== La fecha de una casilla se lee como fecha ===');
// El bug: `formatEventDate` arma {day,mon,dow} para la Agenda. Puesto en la
// plantilla de la ficha imprimía "[object Object]" debajo del nombre.
chk('la ficha usa el formato de texto, no el objeto de la Agenda',
  /fechaHoraCorta\(nota\.fecha,nota\.hora\)/.test(leer('render-main.js')) &&
  !/formatEventDate\(\{fecha:nota\.fecha/.test(leer('render-main.js')));
chk('formatEventDate sigue devolviendo el objeto que usa la Agenda',
  typeof val(`formatEventDate('2026-10-18')`) === 'object' && val(`formatEventDate('2026-10-18').day`) === 18);
chk('y el texto corto sale legible, con y sin hora',
  val(`fechaHoraCorta('2026-10-18',null)`) === '18 oct' &&
  val(`fechaHoraCorta('2026-10-18','14:30')`) === '18 oct · 14:30');
chk('ninguna fecha impresa en la ficha pasa por formatEventDate',
  !/\$\{[^}]*formatEventDate/.test(leer('render-main.js')));

console.log('\n=== El año se rellena solo ===');
const hoy = new Date();
const iso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
{
  const campo = ctx.document.getElementById('m-cat-fecha');
  campo.value = '';
  val(`sembrarFechaHoy('m-cat')`);
  chk('entrar al campo vacío deja la fecha de hoy, con su año', campo.value === iso);
  chk('y habilita la hora, que estaba apagada sin fecha', ctx.document.getElementById('m-cat-hora').disabled === false);
}
{
  // Lo que no puede hacer: pisar una fecha que la persona ya había puesto.
  const campo = ctx.document.getElementById('m-cat-fecha');
  campo.value = '2026-03-09';
  val(`sembrarFechaHoy('m-cat')`);
  chk('una fecha ya escrita no se toca', campo.value === '2026-03-09');
}
chk('se siembra al enfocar, no al abrir el modal',
  /onfocus="sembrarFechaHoy\('\$\{idBase\}'\)"/.test(leer('app.js')));
// Quien abre el campo sin querer tiene cómo dejarlo vacío otra vez.
chk('Quitar sigue existiendo para borrarla', /function limpiarFechaHora\(/.test(leer('app.js')));

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
