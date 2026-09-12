// Conectar ChatGPT, Claude o Gemini "normales" tiene que ser posible.
//
// Los tres aceptan un conector remoto como UNA URL pegada en su configuración:
// no corren comandos, así que no pueden canjear el código de un solo uso. El
// diseño original escondía el token a propósito y por eso la conexión solo
// funcionaba con agentes que tuvieran terminal.
//
// Mostrar el token cambia lo que está en juego, así que este test fija las tres
// cosas que lo hacen aceptable, y las tres se rompen en silencio:
//
// 1. La URL NO se guarda en el dispositivo. Guardarla la volvería permanente
//    sin que nadie lo pidiera.
// 2. Se olvida al salir de la pantalla.
// 3. El aviso de que vale como una contraseña va ANTES del valor: leído
//    después de copiar no sirve de nada.
//
// Y una de protocolo: los conectores de 2025 piden su versión en initialize.
// Contestar otra hace que algunos corten la conexión sin explicar por qué.
const fs = require('fs'), path = require('path'), vm = require('vm');
const raiz = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(raiz, f), 'utf8');
const app = leer('app.js');

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

console.log('=== La URL se crea en el servidor y se muestra completa ===');
function montar(respuesta) {
  const toasts = [];
  let pintados = 0, listaRecargada = 0;
  const ctx = {
    console: { warn() {}, log() {} },
    showToast: m => toasts.push(m),
    document: { getElementById: id => (id === 's-agent-url-nombre' ? { value: 'ChatGPT' } : { disabled: false, textContent: '', innerHTML: '' }) },
    currentUser: { id: 'u1' }, supabaseClient: {},
    esc: x => String(x),
    MCP_URL_BASE: 'https://gradehub.cl/mcp/',
    cargarAgentesConectados() { listaRecargada++; },
    sesionCaducada: () => false,
    rpcAgente: async () => respuesta,
    agenteUrlActual: '',
    pintarUrlAgente() { pintados++; },
  };
  vm.createContext(ctx);
  vm.runInContext(app.match(/\nasync function crearUrlAgente\([\s\S]*?\n\}/)[0], ctx);
  vm.runInContext(';globalThis.__crear=crearUrlAgente;', ctx);
  return { ctx, toasts, pintados: () => pintados, listaRecargada: () => listaRecargada };
}
const token = 'b'.repeat(64);
let m = montar({ data: [{ token, expira: '2026-12-11T00:00:00Z' }], error: null });
(async () => {
  await m.ctx.__crear();
  chk('la URL queda armada con el token de la RPC', m.ctx.agenteUrlActual === 'https://gradehub.cl/mcp/' + token);
  chk('y la lista de agentes se actualiza sola', m.listaRecargada() === 1);

  console.log('\n=== Un token con forma rara no se muestra ===');
  m = montar({ data: [{ token: 'no-es-un-token' }], error: null });
  await m.ctx.__crear();
  chk('no arma ninguna URL', m.ctx.agenteUrlActual === '');
  chk('y lo dice', m.toasts.some(t => /no pudimos crear la url/i.test(t)));

  console.log('\n=== La llave no se guarda ni sobrevive a la pantalla ===');
  chk('la URL no se escribe en localStorage ni en el estado guardado',
    !/localStorage[^\n]*agenteUrl|S\.agenteUrl/.test(app));
  chk('existe olvidarUrlAgente y la limpia', /function olvidarUrlAgente\(\)\{agenteUrlActual='';\}/.test(app));
  chk('se llama al salir de la sección de agentes',
    /if\(activeSection!=='agentes'\)olvidarUrlAgente\(\);/.test(app));

  console.log('\n=== El aviso va antes del valor ===');
  const pintar = app.match(/function pintarUrlAgente\([\s\S]*?\n\}/)[0];
  const iAviso = pintar.indexOf('agent-url-warn'), iValor = pintar.indexOf('agent-url-value');
  chk('el aviso aparece en el cuadro', iAviso > -1 && iValor > -1);
  chk('y va antes de la URL, no después', iAviso < iValor);
  chk('dice que vale como una contraseña', /como una contraseña/i.test(pintar));

  console.log('\n=== El SQL exige sesión y pone un techo ===');
  const sql = leer('supabase/agente_url_directa.sql');
  chk('sin sesión no entrega token', /if auth\.uid\(\) is null then raise exception/.test(sql));
  chk('hay un máximo de vínculos por persona', />=\s*10 then\s*\n?\s*raise exception/.test(sql));
  chk('el token sale de gen_random_uuid, no de pgcrypto',
    /gen_random_uuid\(\)/.test(sql) && !/[^.\w]gen_random_bytes\s*\(/.test(sql.split('\n').map(l => l.replace(/--.*$/, '')).join('\n')));
  chk('solo authenticated puede ejecutarla',
    /revoke all on function public\.crear_vinculo_agente/.test(sql) &&
    /grant execute on function public\.crear_vinculo_agente\(text\) to authenticated/.test(sql));

  console.log('\n=== El servidor negocia la versión que pide el conector ===');
  const ep = leer('functions/mcp/[[ruta]].js');
  chk('declara las versiones de 2025', /'2025-06-18'/.test(ep) && /'2025-03-26'/.test(ep));
  chk('responde la pedida cuando la conoce', /PROTOCOLOS\.includes\(pedida\)\s*\?\s*pedida/.test(ep));

  console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
  process.exit(fail ? 1 : 0);
})();
