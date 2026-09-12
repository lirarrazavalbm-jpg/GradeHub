// Cada evaluación de un grupo puede tener su propia fecha, y un agente puede
// proponerlas.
//
// El modelo y la Agenda YA soportaban fecha por nota —agendaEvents lo dice y lo
// comenta— pero no había cómo ponerla: una casilla de un grupo solo aceptaba el
// número. "Controles" tenía una sola fecha para los tres, que no es como se
// rinden.
//
// Y había una pérdida silenciosa: setSlotNota borraba la nota de la casilla y
// la volvía a crear en cada cambio, así que escribir la nota del Control 2
// borraba que era el 18 de octubre. Nada fallaba; la fecha simplemente ya no
// estaba, y la evaluación desaparecía de la Agenda.
const fs = require('fs'), path = require('path'), vm = require('vm');
const raiz = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(raiz, f), 'utf8');

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
function app(extra) {
  const toasts = [], resueltas = [];
  const campos = {};
  const ctx = {
    window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
    document: { getElementById: id => (id in campos ? campos[id] : stub), createElement: () => stub, addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
    localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
    navigator: {}, location: { origin: '', pathname: '/', search: '', hash: '' }, history: { replaceState() {} },
    setTimeout, clearTimeout, console,
    syncToCloud() {}, renderAll() {}, renderRamo() {}, renderHome() {}, renderAgenda() {}, openModal() {}, closeModal() {},
    animarPromedio() {}, mostrarEcoGpa() {}, cambioDePromedio: () => false,
    // La animación del promedio lee tokens del CSS, que acá no existe.
    getComputedStyle: () => ({ getPropertyValue: () => '0ms' }),
  };
  vm.createContext(ctx);
  vm.runInContext(['data.js', 'engine.js', 'app.js', 'render-agenda.js'].map(leer).join('\n'), ctx);
  const run = n => vm.runInContext(n, ctx);
  ctx.showToast = (m, e) => toasts.push({ m, e });
  ctx.currentUser = { id: 'u1' };
  ctx.supabaseClient = { rpc: async (n, a) => { resueltas.push(a); return { error: null }; } };
  ctx.showConfirm = (t, d, fn) => fn();
  // Se pisan DESPUÉS de cargar: app.js define las suyas y son las que ganan.
  ctx.openModal = () => {}; ctx.closeModal = () => {};
  run(`S={...S,tenant:'uc',ramos:[{id:'r1',nombre:'Dinámica',color:'a',origen:{tenant:'uc',carrera:'ING-PC',ramoKey:'FIS1514'},gates:[],categorias:[
    {id:'c1',nombre:'Interrogación 1',peso:40,directNota:true,notas:[]},
    {id:'c3',nombre:'Controles',peso:60,directNota:true,slots:3,notas:[${extra || ''}]}
  ]}]}`);
  run(`currentRamoId='r1'`);
  return { run, toasts, resueltas, campos, ctx };
}
const casilla = (a, slot) => JSON.parse(a.run(`JSON.stringify(S.ramos[0].categorias.find(c=>c.id==='c3').notas.find(n=>n.slot===${slot})||null)`));

(async () => {
  console.log('=== Escribir la nota de una casilla no le borra la fecha ===');
  let a = app(`{id:'n2',nombre:'Control 2',valor:null,peso:1,slot:2,fecha:'2026-10-18',hora:'08:30',fechaOrigen:'usuario'}`);
  a.ctx.setSlotNota('c3', 2, '5,5');
  let n = casilla(a, 2);
  chk('la nota queda', n && n.valor === 5.5);
  chk('y la fecha sigue ahí', n && n.fecha === '2026-10-18');
  chk('y la hora también', n && n.hora === '08:30');

  console.log('\n=== Vaciar la nota deja la casilla pendiente si tenía fecha ===');
  a.ctx.setSlotNota('c3', 2, '');
  n = casilla(a, 2);
  chk('la casilla sobrevive', !!n);
  chk('sin nota', n && n.valor === null);
  chk('y con su fecha', n && n.fecha === '2026-10-18');

  console.log('\n=== Una casilla sin fecha sí se borra al vaciarla ===');
  a = app(`{id:'n1',nombre:'Control 1',valor:4.0,peso:1,slot:1}`);
  a.ctx.setSlotNota('c3', 1, '');
  chk('no queda una casilla vacía de adorno', casilla(a, 1) === null);

  console.log('\n=== Abrir una casilla vacía la crea pendiente, para poder fecharla ===');
  a = app('');
  a.ctx.abrirCasilla('c3', 2);
  n = casilla(a, 2);
  chk('la casilla existe', !!n);
  chk('sin nota, que es lo que la deja fuera de los promedios', n && n.valor === null);
  chk('el promedio del ramo no cambió', a.run('ramoAvg(S.ramos[0])') === null);

  console.log('\n=== La Agenda ya muestra una casilla con fecha propia ===');
  a = app(`{id:'n2',nombre:'Control 2',valor:null,peso:1,slot:2,fecha:'2026-10-18'}`);
  const eventos = JSON.parse(a.run('JSON.stringify(agendaEvents().map(e=>({f:e.fecha,n:(e.nota&&e.nota.nombre)||e.cat.nombre})))'));
  chk('el Control 2 aparece con su día', eventos.some(e => e.f === '2026-10-18' && e.n === 'Control 2'));

  console.log('\n=== Una fecha propuesta se aplica a SU casilla ===');
  a = app('');
  const fila = { id: '11111111-2222-3333-4444-555555555555', tipo: 'fechas', ramo: 'Dinámica', ramo_key: 'FIS1514', fuente: 'Calendario del curso', evaluaciones: [{ evaluacion: 'Controles', fecha: '2026-10-18', hora: '08:30', casilla: 2 }, { evaluacion: 'Interrogación 1', fecha: '2026-09-30' }], created_at: null };
  a.run(`propuestasFechasAgente=[propuestaFechasLimpia(${JSON.stringify(fila)})]`);
  chk('la propuesta se leyó', a.run('propuestasFechasAgente.length') === 1);
  await a.ctx.aplicarPropuestaFechas('11111111-2222-3333-4444-555555555555');
  n = casilla(a, 2);
  chk('la casilla 2 quedó con su fecha', n && n.fecha === '2026-10-18' && n.hora === '08:30');
  chk('y sin nota inventada', n && n.valor === null);
  chk('la que no trae casilla va a la categoría', a.run(`S.ramos[0].categorias[0].fecha`) === '2026-09-30');

  console.log('\n=== Rechazar no toca ninguna fecha ===');
  a = app('');
  a.run(`propuestasFechasAgente=[propuestaFechasLimpia(${JSON.stringify(fila)})]`);
  a.ctx.confirmarDescartarPropuestaFechas('11111111-2222-3333-4444-555555555555');
  await new Promise(r => setTimeout(r, 0));
  chk('la categoría sigue sin fecha', !a.run(`S.ramos[0].categorias[0].fecha`));
  chk('se marcó descartada', a.resueltas.some(x => x && x.p_accion === 'descartada'));

  console.log('\n=== Lo que llega mal formado no se ofrece ===');
  a = app('');
  const mala = { ...fila, evaluaciones: [{ evaluacion: 'Controles', fecha: '18-10-2026' }] };
  a.run(`propuestasFechasAgente=[propuestaFechasLimpia(${JSON.stringify(mala)})].filter(Boolean)`);
  chk('una fecha con formato raro descarta la propuesta', a.run('propuestasFechasAgente.length') === 0);
  const lejana = { ...fila, evaluaciones: [{ evaluacion: 'Controles', fecha: '2031-03-01' }] };
  a.run(`propuestasFechasAgente=[propuestaFechasLimpia(${JSON.stringify(lejana)})].filter(Boolean)`);
  chk('y una de otro año académico también', a.run('propuestasFechasAgente.length') === 0);

  console.log('\n=== El agente ve las fechas por casilla en evaluaciones_proximas ===');
  const ep = leer('functions/mcp/[[ruta]].js');
  chk('recorre las notas con fecha propia', /\(c\.notas \|\| \[\]\)\.forEach\(n => \{\s*\n\s*if \(!n\.fecha/.test(ep));
  chk('y dice a qué grupo pertenece', /grupo: c\.nombre/.test(ep));

  console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
  process.exit(fail ? 1 : 0);
})();
