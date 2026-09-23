// El plazo opcional de una recorrección, y cuándo el recordatorio se pone rojo.
//
// La marca "pendiente de mandar a recorregir" existía sin plazo y vivía solo en
// la ficha del ramo y en la Agenda: había que ir a buscarla. Una recorrección
// con fecha tope es lo contrario — si te enteras cuando abres el ramo, ya puede
// ser tarde—, así que ahora aparece en Inicio y se pone roja cuando se acaba.
//
// El plazo es OPCIONAL a propósito. Cada facultad fija el suyo y el reglamento
// UC solo pone un techo de quince días hábiles, así que la app no lo puede
// deducir de la fecha de la evaluación: o lo anota la persona, o no hay plazo.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const src = ['data.js', 'engine.js', 'app.js'].map(f => fs.readFileSync(raiz + f, 'utf8')).join('\n');

const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => stub, createElement: () => stub, addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '', hash: '' }, setTimeout, clearTimeout, console,
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const g = n => vm.runInContext(n, ctx);

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

const dias = g('diasParaRecorreccion'), urgente = g('recorreccionUrgente');
const normalize = g('normalize'), pendientes = g('recorreccionesPendientes');
const S = g('S');
const iso = d => { const x = new Date(); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
const nota = (extra) => Object.assign({ id: 'n1', nombre: 'I1', valor: 4.2, peso: 1 }, extra);

console.log('\n=== Cuántos días faltan ===');
chk('sin plazo devuelve null', dias(nota({ recorreccionPendiente: true })) === null);
chk('sin la marca tampoco cuenta', dias(nota({ recorreccionHasta: iso(1) })) === null);
chk('mañana es 1', dias(nota({ recorreccionPendiente: true, recorreccionHasta: iso(1) })) === 1);
chk('hoy es 0', dias(nota({ recorreccionPendiente: true, recorreccionHasta: iso(0) })) === 0);
chk('ayer es -1 (vencido)', dias(nota({ recorreccionPendiente: true, recorreccionHasta: iso(-1) })) === -1);

console.log('\n=== Cuándo es urgente ===');
chk('a 9 días no lo es', urgente(nota({ recorreccionPendiente: true, recorreccionHasta: iso(9) })) === false);
chk('a 2 días sí', urgente(nota({ recorreccionPendiente: true, recorreccionHasta: iso(2) })) === true);
chk('hoy también', urgente(nota({ recorreccionPendiente: true, recorreccionHasta: iso(0) })) === true);
chk('vencido también', urgente(nota({ recorreccionPendiente: true, recorreccionHasta: iso(-3) })) === true);
// Sin plazo no puede ponerse rojo: no hay nada que se esté acabando.
chk('sin plazo NUNCA es urgente', urgente(nota({ recorreccionPendiente: true })) === false);

console.log('\n=== El orden del recordatorio ===');
S.ramos = [{ id: 'r1', nombre: 'Ramo', color: '#3aa', creditos: 10, origen: null, gates: [], categorias: [
  { id: 'c1', nombre: 'A', peso: 34, notas: [nota({ id: 'a', recorreccionPendiente: true, recorreccionHasta: iso(9) })] },
  { id: 'c2', nombre: 'B', peso: 33, notas: [nota({ id: 'b', recorreccionPendiente: true })] },
  { id: 'c3', nombre: 'C', peso: 33, notas: [nota({ id: 'c', recorreccionPendiente: true, recorreccionHasta: iso(1) })] },
] }];
const lista = pendientes();
chk('junta las tres', lista.length === 3);
chk('la que vence antes va primero', lista[0].nota.id === 'c');
chk('y la que no tiene plazo queda al final', lista[2].nota.id === 'b');

console.log('\n=== Se guarda sin romper cuentas viejas ===');
const guardado = normalize({ tenant: 'uc', onboardingDone: true, ramos: [{ id: 'r1', nombre: 'R', categorias: [
  { id: 'c1', nombre: 'A', peso: 50, notas: [nota({ recorreccionPendiente: true, recorreccionHasta: iso(3) })] },
  // Un plazo sin la marca no se guarda: no significa nada suelto.
  { id: 'c2', nombre: 'B', peso: 25, notas: [nota({ id: 'n2', recorreccionHasta: iso(3) })] },
  // Una fecha con forma inválida se descarta en vez de viajar al modelo.
  { id: 'c3', nombre: 'C', peso: 25, notas: [nota({ id: 'n3', recorreccionPendiente: true, recorreccionHasta: 'mañana' })] },
] }] });
const cats = guardado.ramos[0].categorias;
chk('conserva el plazo de una marcada', cats[0].notas[0].recorreccionHasta === iso(3));
chk('descarta un plazo sin marca', cats[1].notas[0].recorreccionHasta === undefined);
chk('descarta una fecha con forma inválida', cats[2].notas[0].recorreccionHasta === undefined);
chk('pero conserva la marca, que sí es válida', cats[2].notas[0].recorreccionPendiente === true);

console.log(`\n${ok} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
