// El feed .ics es el único código de servidor del proyecto y no tenía tests.
//
// Es también el único punto donde salen datos de una persona SIN sesión: Google
// consulta desde sus servidores, así que el secreto viaja en la URL. Lo que se
// vigila acá es eso: que la respuesta no se pueda guardar en cachés ajenas, que
// un token con mala pinta no llegue nunca a la base, y que por el .ics no se
// escape una nota aunque la base algún día devuelva una.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const archivo = raiz + 'functions/cal/[token].js';
const src = fs.readFileSync(archivo, 'utf8');

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };
const octetos = s => Buffer.byteLength(s, 'utf8');

// La Function es un módulo ESM y el proyecto es commonjs: se carga en un vm,
// con las mismas APIs que le da el runtime de Cloudflare.
let ultimaPeticion = null, respuestaRPC = { ok: true, filas: [] };
const contexto = {
  TextEncoder, console, Date, URL,
  fetch: async (url, init) => {
    ultimaPeticion = { url, init };
    if (!respuestaRPC.ok) return { ok: false, json: async () => null };
    return { ok: true, json: async () => respuestaRPC.filas };
  },
  Response: class { constructor(body, init) { this.body = body; this.status = (init && init.status) || 200; this.headers = (init && init.headers) || {}; } },
};
const api = vm.runInNewContext(src.replace(/export async function/, 'async function') + ';({icsFold,buildICS,onRequestGet})', contexto);
const TOKEN = 'a'.repeat(64).replace(/a/g, '0');

(async () => {

console.log('\n=== La respuesta no se guarda en cachés ajenas ===');
{
  respuestaRPC = { ok: true, filas: [] };
  const r = await api.onRequestGet({ params: { token: TOKEN } });
  const cc = r.headers['Cache-Control'] || '';
  chk('el feed se cachea como privado', /(^|,|\s)private(\s|,|$)/.test(cc));
  chk('y no como público', !/public/.test(cc));
  chk('sigue fuera de los buscadores', /noindex/.test(r.headers['X-Robots-Tag'] || ''));
  chk('se sirve como calendario', /text\/calendar/.test(r.headers['Content-Type'] || ''));
}

console.log('\n=== Un token con mala pinta no llega a la base ===');
{
  for (const malo of ['', 'corto', TOKEN + '0', TOKEN.replace('0', 'Z'), '../../etc/passwd', TOKEN.slice(0, 63)]) {
    ultimaPeticion = null;
    const r = await api.onRequestGet({ params: { token: malo } });
    chk(`"${malo.slice(0, 18)}" se rechaza sin consultar`, r.status === 404 && ultimaPeticion === null);
  }
  ultimaPeticion = null;
  await api.onRequestGet({ params: { token: TOKEN } });
  chk('un token bien formado sí consulta', ultimaPeticion !== null);
  chk('y el token viaja en el cuerpo, no en la URL de la RPC',
    !ultimaPeticion.url.includes(TOKEN) && ultimaPeticion.init.body.includes(TOKEN));
}

console.log('\n=== Por el .ics no se escapa una nota ===');
{
  // Aunque la base algún día devolviera más columnas de las que hoy devuelve.
  respuestaRPC = { ok: true, filas: [{ ramo: 'Contabilidad', evaluacion: 'Solemne 1', peso: 30, fecha: '2026-10-16', nota: 6.4, promedio: 5.9 }] };
  const r = await api.onRequestGet({ params: { token: TOKEN } });
  chk('la evaluación sale', /Solemne 1/.test(r.body));
  chk('la nota no', !/6[.,]4/.test(r.body));
  chk('el promedio tampoco', !/5[.,]9/.test(r.body));
}

console.log('\n=== El plegado respeta el límite del RFC 5545 ===');
{
  // 75 OCTETOS, no caracteres: con acentos no es lo mismo, y los ramos de la
  // FEN tienen tildes en el nombre.
  const conTildes = 'SUMMARY:Introducción a la Microeconomía — Solemne 1 · áéíóúñ y más texto para pasarse';
  const partes = api.icsFold(conTildes).split('\r\n');
  chk('una línea larga se pliega', partes.length > 1);
  chk('ninguna línea pasa de 75 octetos', partes.every(p => octetos(p) <= 75));
  chk('las continuaciones empiezan con un espacio', partes.slice(1).every(p => p.startsWith(' ')));
  chk('el texto se reconstruye exacto',
    partes.map((p, i) => (i ? p.slice(1) : p)).join('') === conTildes);
  chk('ningún carácter quedó partido en dos', partes.every(p => !/�/.test(p)));
  chk('una línea corta no se toca', api.icsFold('UID:x@gradehub.cl') === 'UID:x@gradehub.cl');
  chk('el límite se mide en octetos y no en caracteres',
    octetos(partes[0]) > partes[0].length);

  const soloAscii = 'SUMMARY:' + 'a'.repeat(200);
  chk('también pliega ASCII puro', api.icsFold(soloAscii).split('\r\n').every(p => octetos(p) <= 75));
}

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
if (fail) process.exit(1);

})();
