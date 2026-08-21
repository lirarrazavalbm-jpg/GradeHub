// Una evaluación puede tener hora, y eso llega al calendario sin correrse.
//
// El riesgo que hacía temer este cambio: Chile mueve el reloj en septiembre. Si
// el .ics se emitiera en UTC, habría que saber el huso vigente EN LA FECHA DE LA
// PRUEBA, y errarle deja la evaluación una hora corrida en el calendario del
// estudiante — un error que nadie reporta porque parece que uno se equivocó.
//
// Por eso se emite hora local FLOTANTE: `DTSTART:20260924T140000`, sin Z y sin
// TZID. El RFC 5545 la define como la hora del reloj de quien la mira. No hay
// conversión, así que no hay nada que calcular mal.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const src = ['data.js', 'engine.js', 'app.js', 'render-agenda.js']
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

console.log('\n=== La hora se guarda aparte de la fecha ===');
// Nunca dentro: hay miles de evaluaciones con `fecha` sola, y convertirla a
// fecha-y-hora las dejaría a todas a medianoche.
const norm = val('normalize')({ ramos: [{ id: 'r1', nombre: 'Ramo', categorias: [
  { id: 'c1', nombre: 'Con hora', peso: 50, fecha: '2026-09-24', hora: '14:00', notas: [] },
  { id: 'c2', nombre: 'Sin hora', peso: 30, fecha: '2026-09-25', notas: [] },
  { id: 'c3', nombre: 'Hora sin fecha', peso: 10, hora: '09:00', notas: [] },
  { id: 'c4', nombre: 'Hora inventada', peso: 10, fecha: '2026-10-01', hora: '25:99', notas: [] },
], gates: [] }] }).ramos[0].categorias;
chk('la hora válida se conserva', norm[0].hora === '14:00' && norm[0].fecha === '2026-09-24');
chk('sin hora queda null, no medianoche', norm[1].hora === null);
// Una hora sin fecha no se puede poner en ninguna agenda.
chk('una hora sin fecha se descarta', norm[2].hora === null);
// El dato llega del navegador del estudiante y de respaldos importados.
chk('una hora imposible se descarta', norm[3].hora === null);

console.log('\n=== Y llega al .ics como hora flotante ===');
val('S=S||{};S.ramos=' + JSON.stringify([{ id: 'r1', nombre: 'Contabilidad', color: '#000', categorias: [
  { id: 'c1', nombre: 'Solemne', peso: 50, fecha: '2026-09-24', hora: '14:00', notas: [], directNota: true },
  { id: 'c2', nombre: 'Examen', peso: 50, fecha: '2026-11-20', notas: [], directNota: true },
], gates: [] }]));
const ics = val('buildICS')();

chk('la que tiene hora sale con marca de tiempo', ics.includes('DTSTART:20260924T140000'));
// Sin Z: con Z sería UTC y el calendario la movería según el huso del lector.
chk('y sin Z, o sea sin convertir a UTC', !/DTSTART:20260924T140000Z/.test(ics));
// Sin TZID tampoco: obligaría a incluir un VTIMEZONE con las reglas de Chile.
chk('y sin TZID', !/TZID/.test(ics));
chk('dura una hora', ics.includes('DTEND:20260924T150000'));
// Lo que ya existía no se toca: las que no tienen hora siguen siendo de día
// completo, que es lo correcto para "es el 20 de noviembre".
chk('la que no tiene hora sigue siendo de día completo', ics.includes('DTSTART;VALUE=DATE:20261120'));

console.log('\n=== La medianoche es una hora como cualquier otra ===');
// '00:00' es falsy como string vacío no, pero es el caso que rompe cualquier
// `if (hora)` mal escrito en la cadena. Se comprueba de punta a punta.
val('S.ramos[0].categorias[1].hora="00:00"');
const ics2 = val('buildICS')();
chk('las 00:00 se emiten como hora, no como día completo',
  ics2.includes('DTSTART:20261120T000000') && !ics2.includes('DTSTART;VALUE=DATE:20261120'));
// Y el fin no puede quedar el día anterior por sumar mal.
chk('y terminan a la 01:00 del mismo día', ics2.includes('DTEND:20261120T010000'));

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
