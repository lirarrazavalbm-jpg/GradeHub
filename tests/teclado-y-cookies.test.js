// Dos cosas que se pierden en silencio: un div clickeable que el teclado no
// alcanza, y una cookie de analítica que nadie consintió.
//
// Teclado: todo `<div ... onclick>` que actúe como botón lleva role="button" y
// tabindex="0", y un solo handler global en app.js convierte Enter/Espacio en
// click. Los overlays y backdrops quedan fuera: se cierran con Escape.
//
// Cookies: GA va con client_storage:'none'. Mientras eso siga ahí no hay banner
// que mostrar y la política de privacidad puede decir "sin cookies" sin mentir.
const fs = require('fs');
const leer = f => fs.readFileSync(__dirname + '/../' + f, 'utf8');
const html = leer('index.html'), app = leer('app.js'), priv = leer('privacidad.html');
const render = leer('render-main.js') + leer('render-agenda.js');

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

const EXENTOS = /overlay|backdrop/;
const divs = [...(html + render).matchAll(/<div\b[^>]*\bonclick=[^>]*>/g)].map(m => m[0]).filter(t => !EXENTOS.test(t));
const sinTeclado = divs.filter(t => !/role="button"/.test(t) || !/tabindex="0"/.test(t));
chk('todo div clickeable tiene role="button" y tabindex="0" (' + divs.length + ' revisados)', sinTeclado.length === 0);
sinTeclado.forEach(t => console.log('       ' + t.slice(0, 110)));
chk('un handler global convierte Enter/Espacio en click sobre role="button"',
  /e\.key!=='Enter'&&e\.key!==' '/.test(app) && /closest\('\[role="button"\]'\)/.test(app));
chk('ningún onkeydown suelto duplica al handler global', !/onkeydown="/.test(render));

chk('GA configurado sin cookies', /gtag\('config',\s*'G-[A-Z0-9]+',\s*\{\s*client_storage:\s*'none'\s*\}\)/.test(html));
chk('la política ya no dice que GA usa cookies', !/usa cookies/.test(priv) && /sin cookies/.test(priv));

console.log(`\n${ok} ok, ${fail} fail`);
if (fail) process.exit(1);
