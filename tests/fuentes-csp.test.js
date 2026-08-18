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

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

// Los hostnames que el SW compara para decidir si intercepta.
const interceptados = [...sw.matchAll(/url\.hostname\s*===\s*['"]([^'"]+)['"]/g)].map(m => m[1]);

// La directiva connect-src de la CSP.
const csp = (headers.match(/Content-Security-Policy:\s*(.+)/) || [])[1] || '';
const connectSrc = (csp.match(/connect-src([^;]*)/) || [])[1] || '';

console.log('\n=== El SW intercepta dominios y la CSP los conoce ===');
chk('la CSP declara connect-src', connectSrc.trim().length > 0);
chk('el SW intercepta al menos un dominio externo', interceptados.length > 0);
interceptados.forEach(h => {
  chk(`connect-src permite ${h}`, connectSrc.includes(h));
});

// La otra mitad del mismo bug: si la red falla y no hay copia en caché, el
// handler tiene que devolver una Response igual. Una promesa rechazada dentro
// de respondWith es un error de red para la página.
console.log('\n=== Un fetch caído no deja la petición muerta ===');
const ramaFuentes = sw.slice(sw.indexOf('fonts.googleapis.com'), sw.indexOf('Resto de externos'));
chk('la rama de fuentes captura el fallo de red', /\.catch\(/.test(ramaFuentes));
chk('y devuelve una Response, no undefined', /new Response\(/.test(ramaFuentes));

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
