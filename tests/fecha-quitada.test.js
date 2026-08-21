// Quitar la fecha de una evaluación tiene que quedarse quitada.
//
// `completarFechasOficiales` rellena en CADA carga las categorías sin fecha con
// la del preset. Como una fecha borrada y una que nunca existió son las dos
// `null`, el relleno no podía distinguirlas: el estudiante quitaba la fecha, la
// evaluación seguía en la Agenda, y al recargar volvía a tener la misma. No
// fallaba nada — simplemente no había forma de decirle a la app que esa prueba
// se movió o que no va.
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

const completar = val('completarFechasOficiales');
const PRESETS_UC = val('PRESETS_UC'), normName = val('normName');

// Un ramo del catálogo cuyo preset SÍ trae fechas oficiales.
const conFechas = Object.entries(PRESETS_UC).find(([, def]) => {
  const evals = Array.isArray(def) ? def : (def.evals || []);
  return evals.some(e => e[2] && e[2].fecha);
});
const [nombreRamo, def] = conFechas || [];
const evals = Array.isArray(def) ? def : ((def || {}).evals || []);
const conFecha = evals.find(e => e[2] && e[2].fecha);

console.log('\n=== Hay un preset con fechas oficiales para probar ===');
chk('el catálogo trae al menos uno', !!conFecha);

const ramo = (cat) => ({ id: 'r', nombre: nombreRamo, origen: { tenant: 'uc', carrera: 'ING-PC' }, categorias: [cat] });

console.log('\n=== La fecha oficial llega cuando falta de verdad ===');
const sinFecha = ramo({ id: 'c', nombre: conFecha[0], peso: 10, fecha: null, notas: [] });
completar(sinFecha);
chk('una categoría sin fecha recibe la del programa', sinFecha.categorias[0].fecha === conFecha[2].fecha);

console.log('\n=== Pero no vuelve si el estudiante la quitó ===');
const quitada = ramo({ id: 'c', nombre: conFecha[0], peso: 10, fecha: null, fechaQuitada: true, notas: [] });
completar(quitada);
chk('la fecha quitada se queda quitada', quitada.categorias[0].fecha == null);

console.log('\n=== Y quitarla deja constancia, ponerla la revierte ===');
const app = fs.readFileSync(raiz + 'app.js', 'utf8');
const editar={fecha:'2026-09-10',hora:'14:00'};
val('marcarFechaUsuario')(editar,null,null);
chk('al guardar sin fecha se marca fechaQuitada y se lleva la hora',
  editar.fechaQuitada===true&&editar.horaQuitada===true&&editar.fecha===null&&editar.hora===null);
val('marcarFechaUsuario')(editar,'2026-09-12','09:30');
chk('al escribir otra fecha se revierte y queda como decisión del usuario',
  editar.fechaQuitada===false&&editar.horaQuitada===false&&editar.fechaOrigen==='usuario'&&editar.horaOrigen==='usuario');
chk('el relleno respeta la marca', /if\(c\.fechaQuitada\)return;/.test(app));

console.log('\n=== La Agenda se entera al toque ===');
// Sin esto la evaluación seguía apareciendo en la Agenda después de quitarle la
// fecha, hasta que otra cosa la redibujara.
chk('editar una evaluación vuelve a pintar la Agenda',
  /function confirmEditCat[\s\S]{0,2000}renderAgenda\(\)/.test(app));

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
