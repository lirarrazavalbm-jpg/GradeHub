// Feed .ics suscribible — Cloudflare Pages Function.
//
// Vive acá y no en Supabase porque el proyecto ya se despliega con
// `wrangler pages deploy`: Pages trae Functions incluidas en el plan gratis, así
// que esto viaja en el mismo deploy y no agrega proveedor ni cuenta nueva.
//
// Google consulta esta URL desde sus servidores, sin sesión: el secreto va en la
// ruta. `calendar_feed_data` es una función `security definer` que solo devuelve
// ramo, evaluación, peso y fecha del dueño de ese token. Las notas no salen de
// la base — no las filtramos acá, nunca llegan.
//
// No hay clave secreta en juego: se llama con la publishable, la misma que ya es
// pública por diseño en el navegador.

const SUPABASE_URL = 'https://lsulsnswzesyekpsvlql.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_JwBMAOR7iHW-gcRdLMGrYw_eCOISwqA';

function icsEscape(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// El RFC 5545 pide máximo 75 octetos por línea; se pliega con CRLF + espacio.
function icsFold(line) {
  if (line.length <= 73) return line;
  const out = [line.slice(0, 73)];
  let rest = line.slice(73);
  while (rest.length > 72) { out.push(' ' + rest.slice(0, 72)); rest = rest.slice(72); }
  if (rest.length) out.push(' ' + rest);
  return out.join('\r\n');
}

const soloFecha = iso => /^\d{4}-\d{2}-\d{2}$/.test(iso || '');
const compacta = iso => iso.replace(/-/g, '');

// Un evento de día completo termina el día siguiente: DTEND es exclusivo.
function diaSiguiente(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function buildICS(filas) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GradeHub//Evaluaciones//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:GradeHub — Evaluaciones',
    'X-WR-TIMEZONE:America/Santiago',
    // Cuánto espera Google antes de volver a consultar. Es una sugerencia: en la
    // práctica pasa entre 8 y 24 horas igual.
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ];
  filas.forEach((f, i) => {
    if (!soloFecha(f.fecha)) return;
    const titulo = `${f.evaluacion} — ${f.ramo}`;
    // El UID tiene que ser estable entre consultas: si cambia, Google borra el
    // evento viejo y crea uno nuevo, y el estudiante pierde lo que le haya
    // agregado encima. Sale del contenido, no de un azar ni de la posición.
    const uid = `${compacta(f.fecha)}-${i}-${encodeURIComponent(titulo).replace(/%/g, '')}@gradehub.cl`;
    lines.push('BEGIN:VEVENT');
    lines.push(icsFold(`UID:${uid}`));
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART;VALUE=DATE:${compacta(f.fecha)}`);
    lines.push(`DTEND;VALUE=DATE:${diaSiguiente(f.fecha)}`);
    lines.push(icsFold(`SUMMARY:${icsEscape(titulo)}`));
    lines.push(icsFold(`DESCRIPTION:${icsEscape(`Vale ${f.peso}% de ${f.ramo}.`)}`));
    lines.push('TRANSP:TRANSPARENT');
    lines.push('BEGIN:VALARM');
    lines.push('TRIGGER:-P1DT9H');
    lines.push('ACTION:DISPLAY');
    lines.push(icsFold(`DESCRIPTION:${icsEscape('Mañana: ' + titulo)}`));
    lines.push('END:VALARM');
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export async function onRequestGet({ params }) {
  const token = String(params.token || '');
  // Formato fijo: dos UUID sin guiones. Descarta basura antes de tocar la base.
  if (!/^[0-9a-f]{64}$/.test(token)) {
    return new Response('Not found', { status: 404 });
  }

  let filas;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/calendar_feed_data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ p_token: token }),
    });
    if (!r.ok) return new Response('Not found', { status: 404 });
    filas = await r.json();
  } catch (e) {
    return new Response('Service unavailable', { status: 503 });
  }

  // Un token válido sin evaluaciones fechadas devuelve un calendario vacío, no
  // un error: Google deja de sincronizar una suscripción que responde 404, y
  // agendar la primera prueba tiene que bastar para que vuelva sola.
  if (!Array.isArray(filas)) filas = [];

  return new Response(buildICS(filas), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="gradehub.ics"',
      'Cache-Control': 'public, max-age=3600',
      // Es un secreto en la URL: que no quede en índices ni en cachés ajenas.
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
