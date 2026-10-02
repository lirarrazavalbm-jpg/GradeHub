// Fechas del conector MCP y del feed .ics (barrido del 2026-10-02). Datos sintéticos.
//   · El servidor corre en UTC: desde las 21:00 de Chile ya es mañana allá.
//   · estado_semestre y resumen_para_hoy no veían las fechas por casilla.
//   · El UID del .ics llevaba la posición: una fecha nueva corría las demás.
const fs = require('fs'), path = require('path'), vm = require('vm');
const raiz = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(raiz, f), 'utf8');
let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

// 2026-10-02 01:30 UTC = 1 de octubre, 22:30 en Santiago.
const AHORA = Date.parse('2026-10-02T01:30:00Z');
class Reloj extends Date { constructor(...a) { super(...(a.length ? a : [AHORA])); } static now() { return AHORA; } }

function servidor(estado) {
  const llamadas = [];
  const ctx = {
    console, Response, structuredClone, Date: Reloj, Intl,
    HERRAMIENTAS: [], NOMBRES: ['estado_semestre', 'resumen_para_hoy', 'evaluaciones_proximas', 'proponer_ramos'],
    validarPropuestaRamos: () => null,
    fetch: async (url, options) => { llamadas.push({ url, cuerpo: JSON.parse(options.body) }); return { ok: true, json: async () => /agente_datos/.test(url) ? structuredClone(estado) : 'id-sintetico' }; },
    module: { exports: {} }, exports: {},
  };
  vm.createContext(ctx);
  vm.runInContext(leer('engine.js'), ctx);
  ctx.motorCompartido = { gh_crearCalculoRamo: ctx.module.exports.gh_crearCalculoRamo };
  vm.runInContext(leer('functions/mcp/[[ruta]].js').replace(/^import .*;\s*$/gm, '').replace(/^export /gm, '') + ';globalThis.__mcp={onRequestPost};', ctx);
  return { llamadas, llamar: ctx.__mcp.onRequestPost };
}
async function tool(estado, name, args) {
  const s = servidor(estado);
  const r = await s.llamar({ params: { ruta: ['d'.repeat(64)] },
    request: { json: async () => ({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args || {} } }) } });
  const cuerpo = await r.json();
  return { cuerpo, datos: cuerpo.result ? JSON.parse(cuerpo.result.content[0].text) : null, llamadas: s.llamadas };
}

(async () => {
  console.log('\n=== "Hoy" es el día de Chile ===');
  const estado = { ramos: [{ id: 'r1', nombre: 'Ramo sintético', gates: [], creditos: 10, categorias: [
    { id: 'c1', nombre: 'Prueba esta noche', peso: 40, fecha: '2026-10-01', hora: '19:00', notas: [] },
    { id: 'c2', nombre: 'Controles', peso: 30, slots: 3, notas: [
      { id: 'n1', nombre: 'Control 1', valor: null, slot: 0, fecha: '2026-09-20' },
      { id: 'n2', nombre: 'Control 2', valor: null, slot: 1, fecha: '2026-10-02' },
    ] },
    { id: 'c3', nombre: 'Examen', peso: 30, fecha: '2026-10-02', notas: [] },
  ] }] };
  let { datos } = await tool(estado, 'resumen_para_hoy');
  chk('la fecha del resumen es la de Santiago', datos.fecha === '2026-10-01');
  chk('lo de mañana no sale como de hoy', datos.hoy.map(p => p.evaluacion).join() === 'Prueba esta noche');
  chk('la casilla con fecha propia aparece en las próximas', datos.proximas.some(p => p.evaluacion === 'Control 2' && p.grupo === 'Controles'));
  chk('la casilla vencida sin nota queda por registrar', datos.porRegistrar.some(p => p.evaluacion === 'Control 1' && p.casillasSinNota === 1));

  ({ datos } = await tool(estado, 'estado_semestre'));
  chk('estado_semestre también ve la casilla', datos.proximas.some(p => p.evaluacion === 'Control 2'));
  chk('y la próxima del ramo es la de esta noche', datos.ramos[0].proximaEvaluacion.evaluacion === 'Prueba esta noche');

  const { cuerpo } = await tool(estado, 'evaluaciones_proximas', { dias: 1e12 });
  chk('una ventana absurda no revienta', !!cuerpo.result && !cuerpo.error);

  console.log('\n=== proponer_ramos distingue homónimos por sigla ===');
  const conTeb = { ramos: [{ id: 'r9', nombre: 'Revelación y Fe', sigla: 'TEB110', categorias: [] }] };
  const { llamadas } = await tool(conTeb, 'proponer_ramos', { ramos: [{ nombre: 'Revelación y Fe', sigla: 'TTF012' }], fuente: 'horario sintético' });
  const propuesta = llamadas.find(l => /proponer_ramos_agente/.test(l.url));
  chk('TTF012 se propone aunque ya tenga TEB110', !!propuesta && propuesta.cuerpo.p_ramos[0].sigla === 'TTF012');

  console.log('\n=== El .ics no rehace eventos al agregar una fecha ===');
  const api = vm.runInNewContext(leer('functions/cal/[token].js').replace(/export async function/, 'async function') + ';({buildICS})',
    { TextEncoder, console, Date, URL, fetch: async () => null, Response: class {} });
  const uids = ics => (ics.match(/^UID:.*$/gm) || []).join('|');
  const despues = { ramo: 'Ramo sintético', evaluacion: 'Examen', fecha: '2026-11-30', hora: null, peso: 30 };
  const antes = { ramo: 'Ramo sintético', evaluacion: 'Prueba nueva', fecha: '2026-10-15', hora: null, peso: 20 };
  const uidExamen = ics => (ics.match(/^UID:.*Examen.*$/m) || [''])[0];
  chk('el UID del examen no cambia al sumar una fecha anterior', uidExamen(api.buildICS([despues])) === uidExamen(api.buildICS([antes, despues])));
  const dos = api.buildICS([despues, { ...despues }]);
  chk('dos eventos iguales siguen teniendo UID distintos', new Set(uids(dos).split('|')).size === 2);
  const noche = api.buildICS([{ ramo: 'Ramo sintético', evaluacion: 'Tarde', fecha: '2026-10-31', hora: '23:30', peso: 10 }]);
  chk('a las 23:30 el evento termina al día siguiente', /DTSTART:20261031T233000/.test(noche) && /DTEND:20261101T003000/.test(noche));

  console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
