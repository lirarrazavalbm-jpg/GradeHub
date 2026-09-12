// Un agente puede proponer notas, y la nota entra solo si la persona la acepta.
//
// Pedido por Lucas el 2026-09-12. No es una excepción a la regla de que un
// agente no escribe notas: es su forma. Lo que este test cuida es justamente el
// borde, porque si se corre nadie lo nota — la propuesta se aplicaría sola y el
// promedio de alguien cambiaría sin que lo haya tecleado.
//
// Cuatro cosas, todas silenciosas si se rompen:
// 1. Una propuesta que llega no toca el ramo.
// 2. Aceptar escribe la nota en SU evaluación, no en otra.
// 3. Editar aplica lo editado, no lo propuesto.
// 4. Rechazar no cambia ninguna nota.
const fs = require('fs'), path = require('path'), vm = require('vm');
const raiz = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(raiz, f), 'utf8');

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

// ---------- La validación, del lado del servidor ----------
console.log('=== Lo que el servidor rechaza antes de guardar nada ===');
const hctx = { console };
vm.createContext(hctx);
vm.runInContext(leer('functions/mcp/herramientas.js').replace(/^export /gm, '') + ';globalThis.__v=validarPropuestaNotas;globalThis.__H=HERRAMIENTAS;', hctx);
const val = a => hctx.__v(a);
chk('una nota sobre 7,0 no pasa', /fuera de la escala/.test(val({ fuente: 'correo', notas: [{ evaluacion: 'I1', valor: 7.5 }] }) || ''));
chk('una nota bajo 1,0 tampoco', /fuera de la escala/.test(val({ fuente: 'correo', notas: [{ evaluacion: 'I1', valor: 0 }] }) || ''));
chk('sin decir de dónde salió, no pasa', /de dónde salió/.test(val({ notas: [{ evaluacion: 'I1', valor: 5 }] }) || ''));
chk('dos notas para la misma casilla, no pasan', /dos notas para/.test(val({ fuente: 'x', notas: [{ evaluacion: 'I1', valor: 5 }, { evaluacion: 'i1', valor: 6 }] }) || ''));
chk('una nota válida sí pasa', val({ fuente: 'correo del profe', notas: [{ evaluacion: 'I1', valor: 5.5 }] }) === null);
// La escala chilena es 1,0-7,0. Un 0 no es "muy malo": es un dato mal leído.
chk('proponer_notas es del tipo propuesta', (hctx.__H.find(h => h.nombre === 'proponer_notas') || {}).tipo === 'propuesta');

// ---------- El flujo en la app ----------
const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
function app(propuestaFila) {
  const toasts = [], resueltas = [];
  const campos = {};
  const ctx = {
    window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
    document: {
      getElementById: id => (id in campos ? campos[id] : stub),
      createElement: () => stub, addEventListener() {},
      documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } },
      querySelector: () => stub, querySelectorAll: () => [], body: stub,
    },
    localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
    navigator: {}, location: { origin: '', pathname: '/', search: '', hash: '' }, history: { replaceState() {} },
    setTimeout, clearTimeout, console,
    syncToCloud() {}, renderAll() {}, renderRamo() {}, renderHome() {}, renderAgenda() {},
    openModal() {}, closeModal() {},
  };
  vm.createContext(ctx);
  vm.runInContext(['data.js', 'engine.js', 'app.js', 'render-agenda.js'].map(leer).join('\n'), ctx);
  const run = n => vm.runInContext(n, ctx);
  // Stubs después de cargar, para pisar las de verdad.
  ctx.showToast = (m, e) => toasts.push({ m, e });
  ctx.currentUser = { id: 'u1' };
  ctx.supabaseClient = { rpc: async (n, a) => { resueltas.push(a); return { error: null }; } };
  ctx.showConfirm = (t, d, fn) => fn();
  run(`S={...S,tenant:'uc',ramos:[{id:'r1',nombre:'Dinámica',color:'a',creditos:10,origen:{tenant:'uc',carrera:'ING-PC',ramoKey:'FIS1514'},gates:[],categorias:[
    {id:'c1',nombre:'Interrogación 1',peso:30,directNota:true,notas:[{id:'n1',nombre:'Interrogación 1',valor:6.2,peso:1}]},
    {id:'c2',nombre:'Interrogación 2',peso:30,directNota:true,notas:[]},
    {id:'c3',nombre:'Controles',peso:40,directNota:true,slots:3,notas:[]}
  ]}]}`);
  run(`currentRamoId='r1'`);
  run(`propuestasNotasAgente=[propuestaNotasLimpia(${JSON.stringify(propuestaFila)})]`);
  return { run, toasts, resueltas, campos, ctx };
}
const fila = (notas) => ({
  id: '11111111-2222-3333-4444-555555555555', tipo: 'notas', ramo: 'Dinámica', ramo_key: 'FIS1514',
  fuente: 'Correo del profesor del 10-09', evaluaciones: notas, created_at: null,
});
const nota = (ramoRun, cat, slot) => {
  const notas = ramoRun(`JSON.stringify(S.ramos[0].categorias.find(c=>c.id==='${cat}').notas)`);
  const arr = JSON.parse(notas);
  const n = slot ? arr.find(x => x.slot === slot) : arr[0];
  return n ? n.valor : undefined;
};

(async () => {
  console.log('\n=== Una propuesta que llega no toca el ramo ===');
  let a = app(fila([{ evaluacion: 'Interrogación 2', valor: 5.5 }]));
  chk('la propuesta se leyó', a.run('propuestasNotasAgente.length') === 1);
  chk('y la evaluación sigue sin nota', nota(a.run, 'c2') === undefined);
  chk('aparece en el ramo al que pertenece', a.run(`propuestasNotasDeRamo(S.ramos[0]).length`) === 1);

  console.log('\n=== Aceptar escribe la nota en SU evaluación ===');
  await a.ctx.aplicarPropuestaNotas('11111111-2222-3333-4444-555555555555');
  chk('Interrogación 2 queda en 5,5', nota(a.run, 'c2') === 5.5);
  chk('Interrogación 1 no se tocó', nota(a.run, 'c1') === 6.2);
  chk('la propuesta se marcó aplicada en el servidor', a.resueltas.some(x => x && x.p_accion === 'aplicada'));
  chk('y desaparece de las pendientes', a.run('propuestasNotasAgente.length') === 0);

  console.log('\n=== Una casilla concreta va a su casilla ===');
  a = app(fila([{ evaluacion: 'Controles', valor: 4.8, casilla: 2 }]));
  await a.ctx.aplicarPropuestaNotas('11111111-2222-3333-4444-555555555555');
  chk('Controles casilla 2 queda en 4,8', nota(a.run, 'c3', 2) === 4.8);
  chk('y no se llenó la casilla 1', nota(a.run, 'c3', 1) === undefined);

  console.log('\n=== Editar aplica lo editado, no lo propuesto ===');
  a = app(fila([{ evaluacion: 'Interrogación 2', valor: 5.5 }]));
  a.campos['prop-nota-0'] = { value: '4,0' };
  a.ctx.guardarPropuestaNotasEditada('11111111-2222-3333-4444-555555555555');
  await new Promise(r => setTimeout(r, 0));
  chk('queda el 4,0 que se escribió y no el 5,5 propuesto', nota(a.run, 'c2') === 4);

  console.log('\n=== Un campo vacío se omite en vez de inventarse ===');
  a = app(fila([{ evaluacion: 'Interrogación 2', valor: 5.5 }, { evaluacion: 'Controles', valor: 6, casilla: 1 }]));
  a.campos['prop-nota-0'] = { value: '' };
  a.campos['prop-nota-1'] = { value: '6,0' };
  a.ctx.guardarPropuestaNotasEditada('11111111-2222-3333-4444-555555555555');
  await new Promise(r => setTimeout(r, 0));
  chk('la vaciada no se escribió', nota(a.run, 'c2') === undefined);
  chk('la otra sí', nota(a.run, 'c3', 1) === 6);

  console.log('\n=== Rechazar no cambia ninguna nota ===');
  a = app(fila([{ evaluacion: 'Interrogación 1', valor: 2.0 }]));
  a.ctx.confirmarDescartarPropuestaNotas('11111111-2222-3333-4444-555555555555');
  await new Promise(r => setTimeout(r, 0));
  chk('Interrogación 1 sigue en 6,2', nota(a.run, 'c1') === 6.2);
  chk('se marcó descartada', a.resueltas.some(x => x && x.p_accion === 'descartada'));

  console.log('\n=== Lo que llega mal formado no se ofrece ===');
  a = app(fila([{ evaluacion: 'Interrogación 2', valor: 9 }]));
  chk('una nota fuera de escala descarta la propuesta entera', a.run('propuestasNotasAgente.filter(Boolean).length') === 0);

  console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
  process.exit(fail ? 1 : 0);
})();
