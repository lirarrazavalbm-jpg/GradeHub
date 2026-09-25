// El plazo máximo UC para pedir una recorrección, y cuándo el recordatorio se
// pone rojo.
//
// La marca "pendiente de mandar a recorregir" existía sin plazo y vivía solo en
// la ficha del ramo y en la Agenda: había que ir a buscarla. Una recorrección
// con fecha tope es lo contrario — si te enteras cuando abres el ramo, ya puede
// ser tarde—, así que ahora aparece en Inicio y se pone roja cuando se acaba.
//
// El Reglamento del Estudiante UC pone un techo de quince días hábiles desde el
// control. Para este conteo el sábado sí es hábil: se saltan domingos y
// feriados. La Facultad puede fijar menos; `recorreccionHasta` conserva ese
// plazo más corto declarado por la persona.
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
const g = n => vm.runInContext(n, ctx);

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

const sumarHabiles = g('sumarDiasHabilesRecorreccionUC');
const plazo = g('plazoRecorreccion'), dias = g('diasParaRecorreccion'), urgente = g('recorreccionUrgente');
const normalize = g('normalize'), pendientes = g('recorreccionesPendientes');
const S = g('S');
const iso = d => { const x = new Date(); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
const nota = (extra) => Object.assign({ id: 'n1', nombre: 'I1', valor: 4.2, peso: 1 }, extra);

console.log('\n=== Quince días hábiles UC ===');
chk('no cuenta el día del control, salta domingos y feriados, pero sí cuenta sábados', sumarHabiles('2026-09-14', 15) === '2026-10-03');
chk('el sábado siguiente al control cuenta como el primer día hábil', sumarHabiles('2026-09-25', 1) === '2026-09-26');
chk('un domingo no cuenta', sumarHabiles('2026-09-26', 1) === '2026-09-28');
chk('el sábado santo no cuenta aunque los sábados normales sí', sumarHabiles('2026-04-02', 1) === '2026-04-06');
chk('el feriado movible del 12 de octubre no cuenta', sumarHabiles('2026-10-10', 1) === '2026-10-13');
chk('una fecha inválida no inventa un vencimiento', sumarHabiles('', 15) === null);

console.log('\n=== Plazo efectivo ===');
const marcadaConFecha = nota({ recorreccionPendiente: true, fecha: '2026-09-14' });
const maximo = plazo(marcadaConFecha, null, 'uc');
chk('UC calcula el máximo desde la fecha de la evaluación', maximo.fecha === '2026-10-03' && maximo.fuente === 'maximo_uc');
chk('el texto lo presenta como máximo, no como una promesa', /hasta.+como máximo/i.test(g("textoPlazoRecorreccion(plazoRecorreccion({valor:4.2,recorreccionPendiente:true,fecha:'2026-09-14'},null,'uc'))")));
chk('usa la fecha de la categoría cuando la nota no tiene una propia', plazo(nota({ recorreccionPendiente: true }), { fecha: '2026-09-14' }, 'uc').fecha === '2026-10-03');
chk('sin fecha de evaluación no inventa un vencimiento', plazo(nota({ recorreccionPendiente: true }), {}, 'uc').fecha === null);
chk('fuera de UC no aplica la norma UC', plazo(marcadaConFecha, null, 'fen').fecha === null);
chk('un plazo anterior informado por la Facultad manda', plazo(nota({ recorreccionPendiente: true, fecha: '2026-09-14', recorreccionHasta: '2026-09-30' }), null, 'uc').fecha === '2026-09-30');
chk('un plazo anotado nunca puede alargar el máximo UC', plazo(nota({ recorreccionPendiente: true, fecha: '2026-09-14', recorreccionHasta: '2026-10-10' }), null, 'uc').fecha === '2026-10-03');
chk('sin la marca tampoco cuenta', plazo(nota({ fecha: '2026-09-14' }), null, 'uc').fecha === null);

console.log('\n=== Cuántos días faltan ===');
chk('el máximo puede compararse con una fecha estable', dias(marcadaConFecha, null, 'uc', new Date(2026, 9, 2, 12)) === 1);
chk('el día del máximo es 0', dias(marcadaConFecha, null, 'uc', new Date(2026, 9, 3, 12)) === 0);
chk('después queda vencido', dias(marcadaConFecha, null, 'uc', new Date(2026, 9, 4, 12)) === -1);

console.log('\n=== Cuándo es urgente ===');
chk('a 9 días no lo es', urgente(nota({ recorreccionPendiente: true, recorreccionHasta: iso(9) }), null, 'fen') === false);
chk('a 2 días sí', urgente(nota({ recorreccionPendiente: true, recorreccionHasta: iso(2) }), null, 'fen') === true);
chk('hoy también', urgente(nota({ recorreccionPendiente: true, recorreccionHasta: iso(0) }), null, 'fen') === true);
chk('vencido también', urgente(nota({ recorreccionPendiente: true, recorreccionHasta: iso(-3) }), null, 'fen') === true);
// Sin plazo no puede ponerse rojo: no hay nada que se esté acabando.
chk('sin plazo NUNCA es urgente', urgente(nota({ recorreccionPendiente: true }), null, 'fen') === false);

console.log('\n=== El orden del recordatorio ===');
S.tenant = 'uc';
S.ramos = [{ id: 'r1', nombre: 'Ramo', color: '#3aa', creditos: 10, origen: null, gates: [], categorias: [
  { id: 'c1', nombre: 'A', peso: 34, notas: [nota({ id: 'a', recorreccionPendiente: true, recorreccionHasta: iso(9) })] },
  { id: 'c2', nombre: 'B', peso: 33, notas: [nota({ id: 'b', recorreccionPendiente: true })] },
  { id: 'c3', nombre: 'C', peso: 33, notas: [nota({ id: 'c', recorreccionPendiente: true, recorreccionHasta: iso(1) })] },
] }];
const lista = pendientes();
chk('junta las tres', lista.length === 3);
chk('la que vence antes va primero', lista[0].nota.id === 'c');
chk('y la que no tiene plazo queda al final', lista[2].nota.id === 'b');

console.log('\n=== El plazo se ve donde está el recordatorio ===');
S.ramos = [{ id: 'r1', nombre: 'Ramo', color: '#3aa', creditos: 10, origen: null, gates: [], categorias: [
  { id: 'c1', nombre: 'Interrogación', peso: 100, directNota: true, fecha: '2026-09-14', notas: [nota({ id: 'a', recorreccionPendiente: true })] },
] }];
const itemAgenda = g('agendaRecorrecciones()')[0];
chk('la Agenda recibe el máximo calculado', itemAgenda.plazo.fecha === '2026-10-03');
const agendaHTML = g('agendaRecorreccionesHTML(agendaRecorrecciones())');
chk('la Agenda dice hasta cuándo y que es un máximo', /hasta 3 oct como máximo/i.test(agendaHTML));
const modalHTML = g("controlRecorreccionHTML({valor:4.2,recorreccionPendiente:true},'2026-09-14')");
chk('el editor advierte que la Facultad puede fijar menos', /15 días hábiles/i.test(modalHTML) && /puede fijar menos/i.test(modalHTML));
const sinFechaHTML = g("controlRecorreccionHTML({valor:4.2,recorreccionPendiente:true},'')");
chk('sin fecha pide agregarla, sin inventar un plazo', /Agrega la fecha de la evaluación/i.test(sinFechaHTML) && !/como máximo/i.test(sinFechaHTML));

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
