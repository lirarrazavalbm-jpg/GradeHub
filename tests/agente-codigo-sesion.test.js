// Generar el código del agente falla y la persona no puede saber por qué.
//
// El 2026-09-12 Lucas no pudo generar el código y lo único que dijo la app fue
// "No pudimos generar el código. Intenta de nuevo." Las dos RPC estaban vivas y
// respondían bien desde afuera, así que el motivo estaba del lado del cliente y
// el catch lo tapaba: "intenta de nuevo" sobre un error que se repite siempre
// manda a repetir lo que ya falló.
//
// Dos garantías, las dos invisibles si se rompen:
//
// 1. El motivo se dice. Un mensaje genérico deja sin distinguir la sesión, la
//    red y un error nuestro.
// 2. Un JWT vencido se reintenta UNA vez. Estas RPC resuelven todo con
//    auth.uid(); una app que quedó abierta días llega con el token vencido y la
//    base contesta "sin sesión", que es correcto y parece un error nuestro.
const fs = require('fs'), path = require('path'), vm = require('vm');
const raiz = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(raiz, 'app.js'), 'utf8');

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

// Solo las piezas de esta pantalla: cargar la app entera arrastraría el DOM y
// no es lo que se prueba.
function montar(respuestas) {
  const toasts = [], llamadas = [];
  let refrescos = 0;
  const ctx = {
    console: { warn() {}, log() {} },
    showToast: (m, esError) => toasts.push({ m, esError }),
    document: { getElementById: () => ({ disabled: false, textContent: '' }) },
    currentUser: { id: 'u1' },
    pintarCodigoAgente() {},
    AGENTE_CODIGO_MS: 3e5,
    agenteCodigoActual: '', agenteCodigoVence: 0,
    Date,
    supabaseClient: {
      rpc: async (nombre, args) => { llamadas.push(nombre); return respuestas.shift(); },
      auth: { refreshSession: async () => { refrescos++; return {}; } },
    },
  };
  vm.createContext(ctx);
  for (const re of [/\nfunction sesionCaducada\([\s\S]*?\n\}/, /\nasync function rpcAgente\([\s\S]*?\n\}/,
                    /\nasync function crearCodigoAgente\([\s\S]*?\n\}/]) {
    const m = app.match(re);
    if (!m) { console.log('  FAIL falta la función ' + re); fail++; return null; }
    vm.runInContext(m[0], ctx);
  }
  vm.runInContext(';globalThis.__crear=crearCodigoAgente;', ctx);
  return { ctx, toasts, llamadas, refrescos: () => refrescos };
}

(async () => {
  console.log('=== El motivo del fallo se dice ===');
  let m = montar([{ data: null, error: { message: 'permission denied for table agent_link_codes' } }]);
  if (m) {
    await m.ctx.__crear();
    const t = m.toasts[m.toasts.length - 1] || {};
    chk('el toast lleva el mensaje del servidor', /permission denied/.test(t.m || ''));
    chk('y se marca como error', t.esError === true);
  }

  console.log('\n=== Una sesión vencida se refresca y se reintenta una vez ===');
  m = montar([{ data: null, error: { message: 'sin sesión' } }, { data: 'AB2C3D', error: null }]);
  if (m) {
    await m.ctx.__crear();
    chk('refrescó la sesión', m.refrescos() === 1);
    chk('reintentó la RPC', m.llamadas.filter(x => x === 'crear_codigo_agente').length === 2);
    chk('el código quedó guardado y no hubo error visible',
      m.ctx.agenteCodigoActual === 'AB2C3D' && !m.toasts.some(t => t.esError));
  }

  console.log('\n=== Si sigue sin sesión, se dice qué hacer y no se reintenta para siempre ===');
  m = montar([{ data: null, error: { message: 'sin sesión' } }, { data: null, error: { message: 'sin sesión' } }]);
  if (m) {
    await m.ctx.__crear();
    chk('solo dos intentos', m.llamadas.length === 2);
    chk('el toast manda a entrar de nuevo', /sesión expiró/i.test((m.toasts[m.toasts.length - 1] || {}).m || ''));
  }

  console.log('\n=== Un error que no es de sesión no gasta un refresco ===');
  m = montar([{ data: null, error: { message: 'network error' } }]);
  if (m) {
    await m.ctx.__crear();
    chk('no refrescó', m.refrescos() === 0);
    chk('una sola llamada', m.llamadas.length === 1);
  }

  console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
  process.exit(fail ? 1 : 0);
})();
