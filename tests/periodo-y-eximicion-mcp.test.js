// Dos puntos del issue #579 (revisión de Lucas, 2026-10-02). Datos sintéticos.
//   14. El período de una pauta vencía a la medianoche UTC, no a la de Chile.
//    7. Un examen eximido y confirmado seguía pendiente para el conector MCP,
//       porque la regla vive en el catálogo y el servidor no lo tiene.
const fs = require('fs'), path = require('path'), vm = require('vm');
const raiz = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(raiz, f), 'utf8');
let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

function el() { return { style: { setProperty() {} }, classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} }, dataset: {}, value: '', innerHTML: '', textContent: '',
  addEventListener() {}, appendChild() {}, setAttribute() {}, removeAttribute() {}, querySelector() { return null; }, querySelectorAll() { return []; }, focus() {} }; }
const app = { console, window: { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }) },
  document: { getElementById: el, querySelector: () => el(), querySelectorAll: () => [], createElement: el, addEventListener() {}, documentElement: el(), body: el(), head: { appendChild() {} } },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} }, navigator: {}, location: { origin: '', pathname: '/', search: '', hash: '' },
  history: { replaceState() {} }, setTimeout, clearTimeout, requestAnimationFrame() { return 1; } };
vm.createContext(app);
for (const f of ['data.js', 'engine.js', 'app.js']) vm.runInContext(leer(f), app, { filename: f });
const run = c => vm.runInContext(c, app);

console.log('\n=== 14. El período cierra a la medianoche de Chile ===');
const periodo = (p, iso) => run('estadoPeriodoPauta')(p, new Date(iso));
chk('31 de julio a las 23:59 de Chile, 2026-1 sigue vigente', periodo('2026-1', '2026-08-01T03:59:00Z') === 'vigente');
chk('desde la medianoche chilena del 1 de agosto vence', periodo('2026-1', '2026-08-01T04:00:00Z') === 'vencido');
chk('31 de diciembre a las 23:59 (horario de verano), 2026-2 sigue vigente', periodo('2026-2', '2027-01-01T02:59:00Z') === 'vigente');
chk('desde la medianoche chilena del 1 de enero vence', periodo('2026-2', '2027-01-01T03:00:00Z') === 'vencido');

console.log('\n=== 7. La eximición viaja con el ramo hasta el MCP ===');
// Pauta sintética: no se ata a un ramo real del catálogo.
run(`PRESETS_FEN['Ramo Sintético de Eximición']={evals:[['Parcial',60],['Examen',40]],
  eximicion:{evaluacion:'Examen',segun:['Parcial'],min:5,ignoraDescartes:true,requiereConfirmacion:true}};`);
const ramo = JSON.parse(run(`JSON.stringify(normalize({tenant:'fen',ramos:[{id:'r1',nombre:'Ramo Sintético de Eximición',gates:[],creditos:6,
  origen:{tenant:'fen',carrera:null,ramoKey:'ramo sintetico de eximicion'},eximicionConfirmada:true,
  categorias:[{id:'p',nombre:'Parcial',peso:60,notas:[{id:'n1',nombre:'Parcial',valor:6,peso:1}]},{id:'e',nombre:'Examen',peso:40,notas:[]}]}]}).ramos[0])`));
chk('normalize guarda una copia de la regla en el ramo', ramo.eximicion && ramo.eximicion.evaluacion === 'Examen' && ramo.eximicion.min === 5);
const sinRegla = JSON.parse(run(`JSON.stringify(normalize({tenant:'fen',ramos:[{id:'r2',nombre:'Ramo manual',eximicion:{evaluacion:'X',segun:['Y'],min:1,ignoraDescartes:true},categorias:[]}]}).ramos[0])`));
chk('un ramo sin regla en el catálogo no conserva una copia vieja', !('eximicion' in sinRegla));
const enApp = run(`(()=>{const r=normalize({tenant:'fen',ramos:[${JSON.stringify(ramo)}]}).ramos[0];S.ramos=[r];return {avance:1-estadoParaNotaNecesaria(r).pendiente,necesita:notaNecesaria(r)};})()`);

const mcp = { console, Response, structuredClone, Intl, HERRAMIENTAS: [], NOMBRES: ['listar_ramos', 'que_necesito_para_aprobar'],
  fetch: async () => ({ ok: true, json: async () => ({ ramos: [structuredClone(ramo)] }) }), module: { exports: {} }, exports: {} };
vm.createContext(mcp);
vm.runInContext(leer('engine.js'), mcp);
mcp.motorCompartido = { gh_crearCalculoRamo: mcp.module.exports.gh_crearCalculoRamo };
vm.runInContext(leer('functions/mcp/[[ruta]].js').replace(/^import .*;\s*$/gm, '').replace(/^export /gm, '') + ';globalThis.__mcp={onRequestPost};', mcp);
const tool = async (name, args) => {
  const r = await mcp.__mcp.onRequestPost({ params: { ruta: ['f'.repeat(64)] },
    request: { json: async () => ({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args || {} } }) } });
  return JSON.parse((await r.json()).result.content[0].text);
};
(async () => {
  const lista = await tool('listar_ramos');
  chk('la app da el ramo por evaluado completo', Math.round(enApp.avance * 100) === 100 && enApp.necesita === null);
  chk('y el MCP dice lo mismo: 100% evaluado', lista[0].avanceEvaluado === 100);
  const necesita = await tool('que_necesito_para_aprobar', { ramo: 'Ramo Sintético de Eximición' });
  chk('sin examen pendiente que rendir', necesita.promedioNecesario === null && necesita.estado === 'meta_alcanzada');
  console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
