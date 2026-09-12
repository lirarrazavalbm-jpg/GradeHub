// Conectar un agente tiene que poder hacerse, y el handshake tiene que
// sobrevivir al primer mensaje de un cliente real.
//
// Dos cosas que no fallan ruidosamente y dejan el MCP inservible igual:
//
// 1. `notifications/initialized` es lo PRIMERO que manda un cliente MCP
//    después de conectar. Es una notificación —no lleva `id`— y el protocolo
//    prohíbe contestarla. El servidor la trataba como un método más y
//    devolvía un objeto de error con id null, que un cliente estricto lee como
//    servidor roto: el handshake se cortaba ahí, con las seis herramientas
//    funcionando perfectamente.
//
// 2. Un GET con Accept: text/event-stream es un cliente abriendo el canal de
//    eventos. Acá todo va en la respuesta del POST, y devolverle un 200 con
//    otro JSON lo deja esperando un flujo que no llega.
//
// Y la parte que no es protocolo: el paso del medio —canjear el código por el
// token— no lo puede hacer el estudiante, porque un cliente MCP solo acepta
// una URL y el token a propósito no se muestra. Si la pantalla no le entrega
// las instrucciones armadas, la vinculación es imposible de completar aunque
// todo lo demás funcione.
const fs = require('fs'), path = require('path'), vm = require('vm');
const raiz = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(raiz, f), 'utf8');

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

// ---------- El endpoint MCP ----------
function cargarEndpoint() {
  const ctx = {
    console, Response, structuredClone,
    HERRAMIENTAS: [], NOMBRES: ['listar_ramos'],
    validarPropuestaPauta: () => null,
    fetch: async () => ({ ok: true, json: async () => ({ ramos: [] }) }),
    module: { exports: {} }, exports: {},
  };
  vm.createContext(ctx);
  vm.runInContext(leer('engine.js'), ctx, { filename: 'engine.js' });
  ctx.motorCompartido = { gh_crearCalculoRamo: ctx.module.exports.gh_crearCalculoRamo };
  const src = leer('functions/mcp/[[ruta]].js')
    .replace(/^import .*;\s*$/gm, '')
    .replace(/^export /gm, '');
  vm.runInContext(src + '\n;globalThis.__mcp={onRequestPost,onRequestGet};', ctx, { filename: 'mcp.js' });
  return ctx.__mcp;
}
const TOKEN = 'a'.repeat(64);
const mcp = cargarEndpoint();

(async () => {
  console.log('=== Una notificación no se contesta ===');
  for (const cuerpo of [
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1 } },
  ]) {
    const r = await mcp.onRequestPost({ params: { ruta: [TOKEN] }, request: { json: async () => cuerpo } });
    const texto = await r.text();
    chk(`${cuerpo.method} → 202 y sin cuerpo`, r.status === 202 && texto === '');
  }

  console.log('\n=== Una petición de verdad sigue contestándose ===');
  const init = await mcp.onRequestPost({
    params: { ruta: [TOKEN] },
    request: { json: async () => ({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) },
  });
  const cuerpoInit = await init.json();
  chk('initialize responde con su id y su protocolo',
    init.status === 200 && cuerpoInit.id === 1 && !!cuerpoInit.result.protocolVersion);
  // id 0 es un id válido y cae justo donde un `if(!id)` se equivocaría.
  const cero = await mcp.onRequestPost({
    params: { ruta: [TOKEN] },
    request: { json: async () => ({ jsonrpc: '2.0', id: 0, method: 'initialize', params: {} }) },
  });
  chk('y con id 0 también, que es un id válido', cero.status === 200 && (await cero.json()).id === 0);

  console.log('\n=== El canal de eventos se declara ausente, no se finge ===');
  const sse = await mcp.onRequestGet({
    params: { ruta: [TOKEN] },
    request: { headers: { get: k => (k === 'accept' ? 'text/event-stream' : null) } },
  });
  chk('GET con Accept: text/event-stream → 405', sse.status === 405);
  const diag = await mcp.onRequestGet({
    params: { ruta: [TOKEN] },
    request: { headers: { get: () => 'application/json' } },
  });
  chk('GET normal sigue sirviendo para diagnóstico', diag.status === 200);

  console.log('\n=== Sin token no se admite ni que el servicio exista ===');
  const sinToken = await mcp.onRequestPost({
    params: { ruta: [] },
    request: { json: async () => ({ jsonrpc: '2.0', method: 'notifications/initialized' }) },
  });
  chk('una notificación sin token tampoco pasa', sinToken.status === 404);

  // ---------- Las instrucciones de la pantalla ----------
  console.log('\n=== La pantalla entrega las instrucciones armadas ===');
  const app = leer('app.js');
  const sesion = leer('app-session.js');
  const ctx = { console };
  vm.createContext(ctx);
  // Solo se necesitan las dos constantes y la función: cargar la app entera
  // acá arrastraría el DOM y no es lo que se está probando.
  const fn = app.slice(app.indexOf('function instruccionesAgente'));
  vm.runInContext(
    sesion.match(/const SUPABASE_URL\s*=.*/)[0] + '\n' +
    sesion.match(/const SUPABASE_ANON_KEY\s*=.*/)[0] + '\n' +
    app.match(/const MCP_URL_BASE\s*=.*/)[0] + '\n' +
    fn.slice(0, fn.indexOf('\n}\n') + 3) + '\n;globalThis.__i=instruccionesAgente;', ctx);
  const texto = ctx.__i('AB2C3D');
  chk('llevan el código que está en pantalla', texto.includes('AB2C3D'));
  chk('llevan la RPC que canjea el código', texto.includes('canjear_codigo_agente'));
  chk('llevan la URL del MCP', texto.includes('https://gradehub.cl/mcp/'));
  chk('llevan la llave pública, no una secreta',
    texto.includes('sb_publishable_') && !texto.includes('sb_secret'));
  chk('dicen que el agente no escribe notas', /no puedes escribir mis notas/i.test(texto));

  console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
  process.exit(fail ? 1 : 0);
})();
