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

import { HERRAMIENTAS, NOMBRES, validarPropuestaPauta, validarPropuestaNotas } from './herramientas.js';
import motorCompartido from '../../engine.js';

const SUPABASE_URL = 'https://lsulsnswzesyekpsvlql.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_JwBMAOR7iHW-gcRdLMGrYw_eCOISwqA';

// Las versiones que este servidor sabe hablar, de la más nueva a la más vieja.
// Importa para los conectores de ChatGPT, Claude y Gemini: piden una versión de
// 2025 y, si el servidor contesta otra, algunos cortan ahí. Las tres se
// sostienen con lo que hay acá —el POST responde JSON, que Streamable HTTP
// permite— y ninguna obliga a SSE ni a sesiones, que son opcionales.
const PROTOCOLOS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const PROTOCOLO = PROTOCOLOS[PROTOCOLOS.length - 1];

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
  for (const [k, v] of Object.entries(h.args || {})) {
    properties[k] = typeof v === 'string' ? { type: 'string', description: v } : v;
  }
  return {
    name: h.nombre,
    description: h.resumen,
    inputSchema: { type: 'object', properties },
  };
}

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

function copiarRecuperativo(regla) {
  if (!regla || !Number.isFinite(regla.min) || !Number.isFinite(regla.max) || !Number.isFinite(regla.nota) || regla.min > regla.max) return null;
  return { min: regla.min, max: regla.max, nota: regla.nota };
}

function buscarRamo(ramos, consulta) {
  const q = norm(consulta);
  if (!q) return null;
  return ramos.find(r => norm(r.nombre) === q)
    || ramos.find(r => norm(r.origen && r.origen.ramoKey) === q)
    || ramos.find(r => norm(r.nombre).includes(q));
}

// Cada llamada arma el adaptador con los ramos entregados por `agente_datos`.
// No se guarda identidad ni estado académico en el isolate: otro request nunca
// puede heredar la cuenta anterior. El catálogo no viaja al servidor, por eso
// las reglas que el ramo persiste se usan tal cual y no se infieren por nombre.
function calculoPara(ramos) {
  return motorCompartido.gh_crearCalculoRamo({
    normName: norm,
    copiarRecuperativo,
    definicionPresetDelRamo: ramo => ramo && ramo.eximicion ? { eximicion: ramo.eximicion } : null,
    ramos: () => ramos,
  });
}

function queNecesitoParaAprobar(ramos, args) {
  const ramo = buscarRamo(ramos, args.ramo);
  if (!ramo) return { error: 'No encontré ese ramo', ramos: ramos.map(r => r.nombre) };
  const meta = args.meta == null ? 4 : Number(args.meta);
  if (!Number.isFinite(meta) || meta < 1 || meta > 7) return { error: 'La meta debe ser una nota entre 1,0 y 7,0.' };

  const calculo = calculoPara(ramos);
  const promedioNecesario = calculo.notaNecesaria(ramo, meta);
  const promedioActual = calculo.ramoAvg(ramo);
  const compuertasIncumplidas = calculo.gatesActivas(ramo).map(g => ({
    nombre: g.nombre,
    actual: g.actual,
    minimo: g.min,
    tope: g.cap,
  }));

  let estado = 'alcanzable';
  if (promedioNecesario === null) estado = promedioActual === null ? 'sin_notas' : (promedioActual >= meta ? 'meta_alcanzada' : 'sin_evaluaciones_pendientes');
  else if (promedioNecesario > 7) estado = 'fuera_de_escala';
  else if (promedioNecesario < 1) estado = 'con_cualquier_nota';

  return {
    ramo: ramo.nombre,
    meta,
    promedioActual,
    promedioNecesario,
    factibleEnEscala: promedioNecesario === null ? promedioActual !== null && promedioActual >= meta : promedioNecesario <= 7,
    estado,
    // No se esconden detrás del promedio: una compuerta puede impedir aprobar
    // aunque la exigencia ponderada sí quepa dentro de la escala.
    compuertasIncumplidas,
  };
}

// La propuesta solo puede caer sobre un ramo que ya está en el semestre. Así
// nunca crea un ramo a espaldas de la persona ni queda una pauta huérfana que
// la app no pueda revisar y aplicar con sus notas a la vista.
function ramoParaPropuesta(estado, consulta) {
  const ramos = Array.isArray(estado.ramos) ? estado.ramos : [];
  return buscarRamo(ramos, consulta);
}

function errorPropuesta(valor) {
  if (!valor || typeof valor !== 'object') return 'No se pudo guardar la propuesta.';
  const mensaje = String(valor.message || valor.details || '');
  // La RPC devuelve errores pensados para que el agente los corrija. No se
  // reenvía el resto de la respuesta de PostgREST: puede incluir detalles de
  // infraestructura que no ayudan a arreglar una pauta.
  return mensaje.startsWith('Propuesta inválida:') || mensaje.startsWith('No se encontró') || mensaje.startsWith('La conexión')
    ? mensaje
    : 'No se pudo guardar la propuesta.';
}

async function guardarPropuestaNotas(token, estado, args) {
  const ramo = ramoParaPropuesta(estado, args.ramo);
  if (!ramo) return { error: 'No se encontró ese ramo en el semestre. Pídele a la persona que lo agregue primero.' };
  const invalida = validarPropuestaNotas(args);
  if (invalida) return { error: invalida };
  // Se avisa cuando una evaluación propuesta no existe en el ramo, en vez de
  // guardarla y que aparezca como una fila que no calza con nada. El agente
  // puede corregir el nombre y reintentar; la lista de las que sí hay es lo que
  // se lo permite.
  const declaradas = (ramo.categorias || []).map(c => String(c.nombre || ''));
  const sinCalce = args.notas
    .map(n => String(n.evaluacion || '').trim())
    .filter(nombre => !declaradas.some(d => norm(d) === norm(nombre)));
  if (sinCalce.length) {
    return { error: `No encontré estas evaluaciones en ${ramo.nombre}: ${sinCalce.join(', ')}. Las que tiene son: ${declaradas.join(', ')}.` };
  }
  const clave = String((ramo.origen && ramo.origen.ramoKey) || norm(ramo.nombre));
  try {
    const r = await rpc('proponer_notas_agente', {
      p_token: token,
      p_ramo: String(ramo.nombre || '').trim(),
      p_ramo_key: clave,
      p_notas: args.notas,
      p_fuente: String(args.fuente || '').trim(),
    });
    if (!r.ok) return { error: errorPropuesta(await r.json().catch(() => null)) };
    const data = await r.json();
    return {
      id: data, ramo: ramo.nombre, notas: args.notas.length,
      mensaje: 'Notas propuestas. NO están guardadas: la persona las acepta, edita o rechaza en la ficha del ramo.',
    };
  } catch {
    return { error: 'No se pudo conectar con GradeHub para guardar la propuesta.' };
  }
}

async function guardarPropuestaPauta(token, estado, args) {
  const ramo = ramoParaPropuesta(estado, args.ramo);
  if (!ramo) return { error: 'No se encontró ese ramo en el semestre. Pídele a la persona que lo agregue primero.' };
  const evaluaciones = args.evaluaciones;
  const invalida = validarPropuestaPauta(args);
  if (invalida) return { error: invalida };
  const clave = String((ramo.origen && ramo.origen.ramoKey) || norm(ramo.nombre));
  try {
    const r = await rpc('proponer_pauta_agente', {
      p_token: token,
      p_ramo: String(ramo.nombre || '').trim(),
      p_ramo_key: clave,
      p_evaluaciones: evaluaciones,
      p_fuente: String(args.fuente || '').trim(),
    });
    if (!r.ok) return { error: errorPropuesta(await r.json().catch(() => null)) };
    const data = await r.json();
    return { id: data, ramo: ramo.nombre, mensaje: 'Propuesta guardada. La persona la revisará en GradeHub antes de aplicarla.' };
  } catch {
    return { error: 'No se pudo conectar con GradeHub para guardar la propuesta.' };
  }
}

// Da forma a las herramientas que responden directamente desde el estado
// autorizado. `proponer_pauta` se despacha aparte porque usa su propia RPC;
// cualquier herramienta todavía pendiente devuelve `undefined` y el endpoint
// lo dice con todas sus letras.
// La sigla NO está guardada en el ramo: la app la deriva de sus tablas de
// catálogo, que no viven acá. Lo único disponible del lado del servidor es la
// clave de origen, y solo sirve cuando tiene forma de código oficial —los ramos
// UC antiguos guardaron ahí el nombre normalizado—. Se devuelve null cuando no
// se puede saber, que es distinto de inventarla: mismo criterio que usa
// `siglaDeRamo` en app.js para ese caso.
const FORMA_SIGLA = /^[A-Z]{2,5}\d{3,4}[A-Z]?$/i;
function siglaDeRamo(r) {
  if (r && typeof r.sigla === 'string' && FORMA_SIGLA.test(r.sigla)) return r.sigla.toUpperCase();
  const clave = r && r.origen && r.origen.ramoKey;
  return typeof clave === 'string' && FORMA_SIGLA.test(clave) ? clave.toUpperCase() : null;
}

// Los umbrales son los de app.js: bajo 5,0 es riesgo, y sobre 7,05 de exigencia
// ya no alcanza. Si acá dijeran otra cosa, la app y el agente contestarían
// distinto sobre el mismo ramo.
function riesgoDeRamo(promedio, necesario) {
  if (promedio === null) return 'sin_notas';
  if (necesario !== null && necesario > 7.05) return 'ya_no_alcanza';
  if (Math.round(promedio * 100) / 100 < 5) return 'en_riesgo';
  return 'bien';
}

function despachar(nombre, estado, args) {
  const ramos = Array.isArray(estado.ramos) ? estado.ramos : [];
  const buscar = q => buscarRamo(ramos, q);

  if (nombre === 'listar_ramos') {
    // Prometía "promedio actual, cuánto llevan evaluado y si están en riesgo" y
    // devolvía el nombre, los créditos y un conteo. Un agente que lee la
    // descripción pide esto y recibe otra cosa, así que se arregla la
    // implementación y no la promesa: son los tres datos que hacen útil la
    // herramienta, y el motor ya los calcula.
    //
    // `cantidadEvaluaciones` en vez de `evaluaciones`: la clave `evaluaciones`
    // en `ver_ramo` es el ARRAY de evaluaciones, y tenerla acá como número
    // hacía que la misma palabra significara dos cosas distintas.
    const calculo = calculoPara(ramos);
    return ramos.map(r => {
      const promedio = calculo.ramoAvg(r);
      const necesario = calculo.notaNecesaria(r);
      const avance = calculo.estadoParaNotaNecesaria(r);
      return {
        nombre: r.nombre,
        sigla: siglaDeRamo(r),
        creditos: r.creditos ?? null,
        promedio,
        // Fracción del peso del ramo que ya tiene nota, en porcentaje entero.
        avanceEvaluado: avance && avance.total > 0 ? Math.round((1 - avance.pendiente) * 100) : 0,
        cantidadEvaluaciones: (r.categorias || []).length,
        // Los mismos umbrales que usa la app para su tarjeta de riesgo (5,0 de
        // promedio y 7,05 de exigencia). Tenerlos escritos de nuevo con otros
        // números diría que un ramo está en riesgo en la app y bien acá.
        riesgo: riesgoDeRamo(promedio, necesario),
      };
    });
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

  if (nombre === 'que_necesito_para_aprobar') {
    return queNecesitoParaAprobar(ramos, args);
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

  // Una notificación es una petición SIN `id`, y el protocolo prohíbe
  // contestarla: corresponde un 202 vacío. Importa porque `notifications/
  // initialized` es lo PRIMERO que manda un cliente después de conectar, y
  // antes caía en "Método no soportado" —un objeto de error con id null—, que
  // es justo lo que un cliente estricto trata como servidor roto. El handshake
  // se cortaba ahí, con las seis herramientas funcionando perfectamente.
  if (!peticion || !('id' in peticion) || peticion.id === undefined) {
    return new Response(null, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  }

  if (method === 'initialize') {
    // Se devuelve la que pidió el cliente cuando la sabemos hablar, y la más
    // vieja cuando no: es lo que dice el protocolo y lo que evita que un
    // conector nuevo se vaya sin explicar por qué.
    const pedida = String(args.protocolVersion || '');
    return respuesta(id, {
      protocolVersion: PROTOCOLOS.includes(pedida) ? pedida : PROTOCOLO,
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

    const argumentos = args.arguments || {};
    if (nombre === 'proponer_notas') {
      const propuesta = await guardarPropuestaNotas(token, estado, argumentos);
      if (propuesta.error) return error(id, -32602, propuesta.error);
      return respuesta(id, { content: [{ type: 'text', text: JSON.stringify(propuesta) }] });
    }

    if (nombre === 'proponer_pauta') {
      const propuesta = await guardarPropuestaPauta(token, estado, argumentos);
      if (propuesta.error) return error(id, -32602, propuesta.error);
      return respuesta(id, { content: [{ type: 'text', text: JSON.stringify(propuesta) }] });
    }

    const datos = despachar(nombre, estado, argumentos);
    if (datos === undefined) return error(id, -32601, `Herramienta aún no disponible: ${nombre}`);

    // Un ramo que no existe o una meta fuera de escala salían dentro de un
    // resultado EXITOSO, con una clave `error` adentro. Un agente no tiene cómo
    // distinguir eso de un dato, así que lo leía como respuesta válida. MCP
    // tiene `isError` justamente para esto, y el texto sigue viajando —incluye
    // la lista de ramos que sí existen, que es lo que deja reintentar bien.
    const esFallo = !!(datos && typeof datos === 'object' && !Array.isArray(datos) && datos.error);
    return respuesta(id, {
      content: [{ type: 'text', text: JSON.stringify(datos) }],
      ...(esFallo ? { isError: true } : {}),
    });
  }

  return error(id, -32601, `Método no soportado: ${method}`);
}

// Un GET sirve para comprobar que la vinculación quedó viva sin ejecutar nada.
export async function onRequestGet({ params, request }) {
  const token = String((params.ruta && params.ruta[0]) || '');
  if (!tokenValido(token)) return json({ error: 'Not found' }, 404);
  // Un cliente que abre el canal de eventos pide text/event-stream. No lo
  // servimos —acá todo va en la respuesta del POST— y decirlo con un 405 es
  // distinto de devolverle un 200 con un JSON que no esperaba: lo segundo lo
  // deja esperando un flujo que nunca llega.
  const acepta = String((request && request.headers && request.headers.get('accept')) || '');
  if (acepta.includes('text/event-stream')) {
    return json({ error: 'Este servidor responde en el POST; no abre un canal de eventos.' }, 405);
  }
  return json({ servidor: 'GradeHub', protocolo: PROTOCOLO, herramientas: NOMBRES });
}
