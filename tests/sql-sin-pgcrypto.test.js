// Ninguna función con search_path fijo puede usar pgcrypto.
//
// El 2026-09-12 conectar un agente era imposible: `crear_codigo_agente` y
// `canjear_codigo_agente` generaban sus secretos con `gen_random_bytes()`, que
// es de pgcrypto. Las dos declaran `set search_path = public` —una medida de
// seguridad para funciones `security definer`, no un descuido— y pgcrypto no
// vive en ese esquema, así que la llamada moría con
// "42883: function gen_random_bytes(integer) does not exist".
//
// Lo que lo hizo durar: NO falla al aplicar el SQL. La función se crea
// perfectamente y revienta recién cuando alguien la llama, autenticado, y con
// suerte detrás de otra guarda que responde algo sensato antes. Probarla sin
// sesión devuelve "sin sesión" y parece sana.
//
// `gen_random_uuid()` sí es de Postgres y no de una extensión. Es lo que usa
// calendar_feed.sql desde que existe y el default de varias columnas `id` del
// esquema, o sea que ya está probado en producción.
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'supabase');

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

// Funciones de pgcrypto que se ven seguras y no están en `public`.
const PGCRYPTO = ['gen_random_bytes', 'crypt', 'gen_salt', 'digest', 'hmac', 'pgp_sym_encrypt', 'pgp_sym_decrypt'];

const archivos = fs.readdirSync(dir).filter(f => f.endsWith('.sql'));
chk('hay SQL que revisar', archivos.length > 0);

const culpables = [];
for (const f of archivos) {
  // Sin comentarios: lo que importa es el código que corre. Este mismo test
  // nombra `gen_random_bytes` en su explicación, y el archivo del arreglo
  // también; prohibir la palabra en cualquier parte haría imposible documentar
  // por qué no se usa.
  const sql = fs.readFileSync(path.join(dir, f), 'utf8')
    .split('\n').map(l => l.replace(/--.*$/, '')).join('\n');
  for (const fn of PGCRYPTO) {
    // Calificada con su esquema es legítima: `extensions.gen_random_bytes(...)`.
    const re = new RegExp('(^|[^.\\w])' + fn + '\\s*\\(', 'g');
    let m;
    while ((m = re.exec(sql))) culpables.push(`${f} → ${fn}()`);
  }
}
chk('ninguna función usa pgcrypto sin calificar su esquema', culpables.length === 0);
culpables.forEach(c => console.log('       ' + c));
if (culpables.length) console.log('       Usa gen_random_uuid(), como calendar_feed.sql, o califícalo: extensions.' + PGCRYPTO[0] + '()');

console.log('\n=== Y los secretos siguen teniendo el formato que valida el código ===');
const mcp = fs.readFileSync(path.join(dir, 'agente_mcp.sql'), 'utf8');
// El endpoint exige /^[0-9a-f]{64}$/: dos uuid sin guiones dan exactamente eso.
chk('el token del agente son dos uuid concatenados',
  /replace\(gen_random_uuid\(\)::text,\s*'-',\s*''\)\s*\|\|/.test(mcp));
// La app valida /^[-A-Z2-9]{6}$/i y el alfabeto no puede traer I, O, L ni S,
// que son las que se confunden al dictar el código en voz alta.
const alfabeto = (mcp.match(/'0123456789abcdef'\s*,\s*'([A-Z]{16})'/) || [])[1];
chk('el código usa 16 letras para los 16 dígitos hex', !!alfabeto);
if (alfabeto) {
  chk('y ninguna se confunde al dictarla', !/[IOLS]/.test(alfabeto));
  chk('la app aceptaría ese alfabeto', /^[-A-Z2-9]+$/.test(alfabeto));
}

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
