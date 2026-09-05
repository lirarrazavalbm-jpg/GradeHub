// Servidor MCP de GradeHub — Cloudflare Pages Function.
//
// Un agente conectado consulta acá en vez de recibir un archivo: el estudiante
// vincula una vez y desde entonces las respuestas salen del estado del momento.
//
// Vive junto al feed de calendario y por la misma razón: Pages trae Functions
// en el plan gratis, así que viaja en el mismo deploy y no agrega proveedor. Se
// llama con la publishable, igual que el navegador; la clave secreta no entra
// acá ni haría falta, porque toda la autorización la resuelve una RPC
// `security definer` a partir del token.
//
// EL TOKEN NO LO ESCRIBE NADIE A MANO. Se canjea por un código de un solo uso
// que la app muestra durante cinco minutos, y el que queda guardado lo emite el
// servidor. Así el estudiante nunca tiene en la mano un secreto permanente que
// pueda pegar en el lugar equivocado, y desconectar desde Ajustes lo corta de
// verdad.

import { HERRAMIENTAS, NOMBRES } from './herramientas.js';

const SUPABASE_URL = 'https://lsulsnswzesyekpsvlql.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_JwBMAOR7iHW-gcRdLMGrYw_eCOISwqA';

const PROTOCOLO = '2024-11-05';

// Formato fijo: descarta basura antes de tocar la base.
const tokenValido = t => /^[0-9a-f]{64}$/.test(t);

function rpc(nombre, cuerpo) {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(cuerpo),
  });
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const respuesta = (id, result) => json({ jsonrpc: '2.0', id, result });
const error = (id, code, message) => json({ jsonrpc: '2.0', id, error: { code, message } });

// El esquema que MCP espera para cada herramienta. Se arma desde la misma lista
// que usa el despacho, para que no puedan divergir: una herramienta anunciada y
// no implementada es una promesa rota, y una implementada sin anunciar es una
// puerta que nadie revisó.
function comoMcp(h) {
  const properties = {};
  for (const [k, v] of Object.entries(h.args || {})) properties[k] = { type: 'string', description: v };
  return {
    name: h.nombre,
    description: h.resumen,
    inputSchema: { type: 'object', properties },
  };
}

// Da forma a cada herramienta sobre el estado. Solo lectura por ahora: las dos
// que escriben —proponer_pauta y agregar_ramo— necesitan su propia RPC y la
// pantalla donde el estudiante confirma, y van en el PR siguiente. Anunciar una
// herramienta que todavía no responde sería peor que no tenerla, así que el
// despacho devuelve `undefined` y el endpoint lo dice con todas sus letras.
function despachar(nombre, estado, args) {
  const ramos = Array.isArray(estado.ramos) ? estado.ramos : [];
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const buscar = q => ramos.find(r => norm(r.nombre) === norm(q))
    || ramos.find(r => norm(r.nombre).includes(norm(q)));

  if (nombre === 'listar_ramos') {
    return ramos.map(r => ({
      nombre: r.nombre,
      creditos: r.creditos ?? null,
      evaluaciones: (r.categorias || []).length,
    }));
  }

  if (nombre === 'ver_ramo') {
    const r = buscar(args.ramo);
    if (!r) return { error: 'No encontré ese ramo', ramos: ramos.map(x => x.nombre) };
    return {
      nombre: r.nombre,
      evaluaciones: (r.categorias || []).map(c => ({
        nombre: c.nombre,
        peso: c.peso,
        casillas: c.slots || 1,
        notas: (c.notas || []).filter(n => typeof n.valor === 'number').map(n => ({ nombre: n.nombre, valor: n.valor })),
      })),
    };
  }

  if (nombre === 'evaluaciones_proximas') {
    const dias = Number(args.dias) > 0 ? Number(args.dias) : 30;
    const hoy = new Date().toISOString().slice(0, 10);
    const hasta = new Date(Date.now() + dias * 864e5).toISOString().slice(0, 10);
    const out = [];
    ramos.forEach(r => (r.categorias || []).forEach(c => {
      const f = c.fecha;
      if (f && f >= hoy && f <= hasta) out.push({ ramo: r.nombre, evaluacion: c.nombre, fecha: f, hora: c.hora || null, peso: c.peso });
    }));
    return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  return undefined;
}

export async function onRequestPost({ request, params }) {
  const token = String((params.ruta && params.ruta[0]) || '');
  if (!tokenValido(token)) return json({ error: 'Not found' }, 404);

  let peticion;
  try {
    peticion = await request.json();
  } catch {
    return error(null, -32700, 'JSON inválido');
  }

  const { id = null, method, params: args = {} } = peticion || {};

  if (method === 'initialize') {
    return respuesta(id, {
      protocolVersion: PROTOCOLO,
      capabilities: { tools: {} },
      serverInfo: { name: 'GradeHub', version: '1' },
    });
  }

  if (method === 'tools/list') {
    return respuesta(id, { tools: HERRAMIENTAS.map(comoMcp) });
  }

  if (method === 'tools/call') {
    const nombre = String(args.name || '');
    // Lista blanca: solo lo declarado. Sin esto, cualquier nombre que la RPC
    // llegue a entender mañana quedaría accesible sin haber pasado por la
    // revisión de qué puede hacer un agente.
    if (!NOMBRES.includes(nombre)) return error(id, -32601, `Herramienta desconocida: ${nombre}`);

    // La base entrega el estado y el despacho se arma acá. Es a propósito: dar
    // forma a cada herramienta en SQL obligaría a reescribir en plpgsql reglas
    // que ya existen en JS —casillas declaradas, descartes, compuertas, el ramo
    // vinculado— y una segunda copia de esas cuentas es exactamente como este
    // proyecto se ha equivocado antes.
    let estado;
    try {
      const r = await rpc('agente_datos', { p_token: token });
      if (!r.ok) return error(id, -32000, 'No se pudo consultar GradeHub');
      estado = await r.json();
    } catch {
      return error(id, -32000, 'GradeHub no está disponible');
    }
    // Token vencido o revocado: la RPC devuelve null y acá se corta.
    if (!estado) return error(id, -32001, 'Esta conexión ya no es válida. Vuelve a vincular desde Ajustes.');

    const datos = despachar(nombre, estado, args.arguments || {});
    if (datos === undefined) return error(id, -32601, `Herramienta aún no disponible: ${nombre}`);

    return respuesta(id, {
      content: [{ type: 'text', text: JSON.stringify(datos) }],
    });
  }

  return error(id, -32601, `Método no soportado: ${method}`);
}

// Un GET sirve para comprobar que la vinculación quedó viva sin ejecutar nada.
export async function onRequestGet({ params }) {
  const token = String((params.ruta && params.ruta[0]) || '');
  if (!tokenValido(token)) return json({ error: 'Not found' }, 404);
  return json({ servidor: 'GradeHub', protocolo: PROTOCOLO, herramientas: NOMBRES });
}
