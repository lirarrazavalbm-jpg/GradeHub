// Todo dominio que el service worker intercepta tiene que estar en connect-src.
//
// El SW hace `fetch()` de la hoja de Google Fonts para cachearla. Una petición
// nacida de `fetch` se rige por `connect-src`, no por `style-src` — daba igual
// que el dominio estuviera permitido como estilo: el navegador la bloqueaba, el
// `respondWith` respondía con un error de red y las fuentes no cargaban para
// NADIE, ni siquiera para quien nunca estuvo sin conexión.
//
// Falla en silencio: no revienta ninguna función, no rompe ningún cálculo. La
// app simplemente se ve con la fuente del sistema y hay que abrir la consola
// del sitio desplegado para enterarse.
//
// Por eso el test no fija los dos dominios de hoy a mano: saca del propio
// `sw.js` los hostnames que intercepta y exige que estén todos permitidos. Si
// mañana alguien agrega otro dominio al SW, este test cae solo.
const fs = require('fs');
const raiz = __dirname + '/../';
const sw = fs.readFileSync(raiz + 'sw.js', 'utf8');
const headers = fs.readFileSync(raiz + '_headers', 'utf8');
const css = fs.readFileSync(raiz + 'styles.css', 'utf8');
const app = fs.readFileSync(raiz + 'app.js', 'utf8');

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

// Los hostnames que el SW compara para decidir si intercepta.
const interceptados = [...sw.matchAll(/url\.hostname\s*===\s*['"]([^'"]+)['"]/g)].map(m => m[1]);

// La directiva connect-src de la CSP.
const csp = (headers.match(/Content-Security-Policy:\s*(.+)/) || [])[1] || '';
const connectSrc = (csp.match(/connect-src([^;]*)/) || [])[1] || '';

console.log('\n=== El SW intercepta dominios y la CSP los conoce ===');
chk('la CSP declara connect-src', connectSrc.trim().length > 0);
// Desde el 2026-09-23 el service worker no intercepta NINGÚN dominio externo:
// las fuentes de Google salieron de la CSP y con ellas el tramo que las
// cacheaba. La regla se conserva igual, porque es la que hay que cumplir el día
// que alguien vuelva a interceptar algo: lo que el SW pida por `fetch` se rige
// por connect-src, y sin permiso falla en silencio.
chk('ningún dominio interceptado queda fuera de connect-src',
  interceptados.every(h => connectSrc.includes(h)));
interceptados.forEach(h => {
  chk(`connect-src permite ${h}`, connectSrc.includes(h));
});
chk('el SW ya no pide nada a un tercero al abrir la app',
  !/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(sw));

console.log('\n=== Editorial usa la fuente del sistema sin descargas ===');
const paginas = ['index.html', 'preguntas.html', 'privacidad.html', 'terminos.html', '404.html'];
paginas.forEach(archivo => {
  const html = fs.readFileSync(raiz + archivo, 'utf8');
  chk(`${archivo} no descarga fuentes ni abre conexiones innecesarias`,
    !/<link[^>]*(?:fonts\.googleapis\.com|fonts\.gstatic\.com)/.test(html));
});
chk('styles.css declara la pila del sistema y no deja una segunda identidad escondida',
  /--font-ui:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif/.test(css) &&
  !/font(?:-family)?:[^;}]*(?:Onest|Inter|Sora)/.test(css));
chk('los estilos que app.js genera en runtime usan la misma familia',
  /font(?:-family)?:[^;"}]*var\(--font-ui\)/.test(app) &&
  !/font(?:-family)?:[^;"}]*(?:Onest|Inter|Sora)/.test(app));
['gpa-num', 'ramo-num', 'ramo-nota', 'ag-day', 'ag-priority-weight', 'ag-row-peso'].forEach(clase => {
  chk(`${clase} conserva cifras tabulares`,
    new RegExp(`\\.${clase}\\{[^}]*font-variant-numeric:tabular-nums`).test(css));
});

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
