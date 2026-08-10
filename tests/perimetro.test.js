// El perímetro: qué código de terceros puede correr y a dónde puede hablar la
// app. Nada de esto falla de forma visible si se rompe — la app sigue andando
// igual, solo deja de estar protegida. Por eso se revisa acá.
const fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
const headers = fs.readFileSync(path.join(raiz, '_headers'), 'utf8');
const sw = fs.readFileSync(path.join(raiz, 'sw.js'), 'utf8');
const app = fs.readFileSync(path.join(raiz, 'app.js'), 'utf8');

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

console.log('\n=== Scripts de terceros: versión fija y hash ===');
// Con `@2` cualquier release nueva entraba sola. Con la sesión de Supabase en
// localStorage, eso es acceso a las notas de todos los usuarios.
const scripts = [...html.matchAll(/<script[^>]*src="(https:\/\/[^"]+)"[^>]*>/g)];
chk('hay scripts externos que revisar', scripts.length > 0);
const jsdelivr = scripts.find(s => s[1].includes('cdn.jsdelivr.net'));
chk('supabase-js viene de jsDelivr', !!jsdelivr);
chk('con versión exacta, no flotante', /supabase-js@\d+\.\d+\.\d+/.test(jsdelivr[1]));
chk('con integrity sha384', /integrity="sha384-[A-Za-z0-9+/=]{60,}"/.test(jsdelivr[0]));
chk('con crossorigin, sin el cual el navegador ignora el integrity',
  /crossorigin="anonymous"/.test(jsdelivr[0]));
// Al subir de versión hay que recalcular el hash: si alguien cambia una y no la
// otra, el navegador bloquea el script y la app se queda sin sesión.
const version = (jsdelivr[1].match(/supabase-js@([\d.]+)/) || [])[1];
chk('la versión fijada aparece una sola vez en el HTML',
  (html.match(new RegExp('supabase-js@' + version.replace(/\./g, '\\.'), 'g')) || []).length === 1);

console.log('\n=== La CSP existe y cubre lo que importa ===');
const csp = (headers.match(/Content-Security-Policy:\s*(.+)/) || [])[1] || '';
chk('hay Content-Security-Policy', csp.length > 40);
// connect-src es la directiva que vale acá: la app usa onclick inline por todas
// partes, así que 'unsafe-inline' es inevitable sin un refactor grande. Lo que
// sí se puede cortar es la salida de los datos.
chk('connect-src limita a dónde puede hablar la app', /connect-src [^;]+/.test(csp));
chk('connect-src NO es un comodín', !/connect-src[^;]*\*[^;]*;/.test(csp) && !/connect-src[^;]*'unsafe/.test(csp));
chk('Supabase está permitido o la app no podría guardar nada', /connect-src[^;]*supabase\.co/.test(csp));
chk('frame-ancestors none corta el clickjacking', /frame-ancestors 'none'/.test(csp));
chk('object-src none', /object-src 'none'/.test(csp));
chk('base-uri self impide reescribir las rutas relativas', /base-uri 'self'/.test(csp));
chk('default-src self', /default-src 'self'/.test(csp));

console.log('\n=== Todo origen que la app usa está declarado ===');
// Si se agrega un servicio y no se suma a la CSP, deja de funcionar en silencio.
const origenes = [...html.matchAll(/(?:src|href)="(https:\/\/[^"/]+)/g)].map(m => m[1].replace('https://', ''));
const supabaseUrl = (app.match(/https:\/\/([a-z0-9]+\.supabase\.co)/) || [])[1];
[...new Set(origenes)].filter(o => o !== 'gradehub.cl').forEach(o =>
  chk(`${o} está en la CSP`, csp.includes(o)));
chk(`el proyecto de Supabase (${supabaseUrl}) está en la CSP`, csp.includes(supabaseUrl));

// Cloudflare Pages inyecta su beacon en el edge: no está en index.html, así que
// ningún test que lea el repo lo encuentra. La primera versión de esta CSP lo
// bloqueó y solo se vio abriendo el sitio desplegado con la consola.
chk('Cloudflare Insights está permitido (Pages lo inyecta en el edge)',
  /script-src[^;]*static\.cloudflareinsights\.com/.test(csp) && /connect-src[^;]*cloudflareinsights\.com/.test(csp));

console.log('\n=== Las otras cabeceras ===');
chk('X-Content-Type-Options nosniff', /X-Content-Type-Options:\s*nosniff/.test(headers));
chk('Referrer-Policy', /Referrer-Policy:\s*strict-origin/.test(headers));
chk('Permissions-Policy cierra cámara, micrófono y pago', /Permissions-Policy:[^\n]*camera=\(\)/.test(headers));
chk('aplican a todo el sitio, no a un archivo suelto', /\/\*\n\s*Content-Security-Policy/.test(headers));

console.log('\n=== El service worker no cachea cualquier dominio ===');
// `hostname.includes('fonts.googleapis.com')` también calza con
// fonts.googleapis.com.malo.cl, y su respuesta quedaba en la caché de la app.
chk('compara el hostname exacto, no por subcadena',
  /url\.hostname === 'fonts\.googleapis\.com'/.test(sw) && !/hostname\.includes\(/.test(sw));
chk('sigue ignorando lo que no sea GET', /request\.method !== 'GET'/.test(sw));

console.log('\n=== Nada de secretos en el cliente ===');
// Busca una clave DE VERDAD, no la palabra: app.js tiene un comentario que
// advierte «nunca poner la sb_secret_... acá», y ese comentario debe poder
// existir. Una clave real trae al menos 8 caracteres de cuerpo.
chk('no hay clave de servicio de Supabase',
  !/sb_secret_[A-Za-z0-9_-]{8,}/.test(app) && !/["']service_role["']\s*:/.test(app));
chk('y el comentario que advierte sobre ella sigue ahí', /sb_secret_/.test(app));
chk('la clave publicable sigue siendo la publicable', /sb_publishable_/.test(app));

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
