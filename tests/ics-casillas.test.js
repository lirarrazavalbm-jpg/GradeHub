// Dos casillas con fecha propia dentro de una categoría ("Control 1" y
// "Control 2" dentro de "Controles") son dos eventos distintos en el .ics.
//
// Antes salían con el mismo UID (categoría+ramo) y el mismo título (el de la
// categoría): Google y Apple deduplican por UID, así que el estudiante veía UN
// "Controles" en el calendario y perdía el otro. Y el peso decía el del grupo
// entero en vez del de la casilla.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const src = ['data.js', 'engine.js', 'app.js', 'render-agenda.js'].map(f => fs.readFileSync(raiz + f, 'utf8')).join('\n');
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

val('S=S||{};S.ramos=' + JSON.stringify([{ id: 'r1', nombre: 'Ramo Sintético', color: '#000', categorias: [
  { id: 'c1', nombre: 'Controles', peso: 30, directNota: true, slots: 3, notas: [
    { id: 'n1', nombre: 'Control 1', valor: null, peso: 1, slot: 0, fecha: '2026-10-02' },
    { id: 'n2', nombre: 'Control 2', valor: null, peso: 1, slot: 1, fecha: '2026-10-16' },
  ] },
  { id: 'c2', nombre: 'Examen', peso: 70, directNota: true, fecha: '2026-11-20', notas: [] },
], gates: [] }]));
const ics = val('buildICS')();
const lineas = ics.split('\r\n');
const uids = lineas.filter(l => l.startsWith('UID:'));
const titulos = lineas.filter(l => l.startsWith('SUMMARY:'));
const descs = lineas.filter(l => l.startsWith('DESCRIPTION:Vale'));

chk('tres eventos: dos casillas y el examen', uids.length === 3);
chk('los tres UID son distintos', new Set(uids).size === 3);
chk('cada casilla sale con su nombre, no con el de la categoría',
  titulos.some(t => t.includes('Control 1 —')) && titulos.some(t => t.includes('Control 2 —')) && !titulos.some(t => t.includes('Controles —')));
chk('el peso es el de la casilla (10%), no el del grupo (30%)', descs.filter(d => d.includes('Vale 10%')).length === 2 && descs.some(d => d.includes('Vale 70%')));

console.log(`\n${ok} ok, ${fail} fail`);
if (fail) process.exit(1);
