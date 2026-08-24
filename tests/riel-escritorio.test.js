// En escritorio (≥1024px) la barra de navegación se convierte en un riel
// vertical y `body` le reserva el ancho con `padding-left:var(--rail)`. Antes de
// entrar esa barra no existe —`showAuthScreen` y `showResetScreen` la esconden,
// y ni el onboarding ni la pantalla de error de arranque la muestran—, así que
// el login salía con una franja vacía a la izquierda y todo corrido.
//
// Este test nace de haberlo arreglado mal una vez. #217 invirtió el defecto:
// `--rail` pasó a nacer en 0 y a encenderse con `body:has(#screen-home.active)`.
// Dos errores, y el segundo no lo habría visto ningún test de CSS solo:
//
//   1. Al mover el defecto, el camino de respaldo dejó de ser el estado
//      anterior. Cuando el selector no calzaba no quedaba el riel de siempre:
//      quedaba `body` sin padding Y el riel con ancho cero, con sus etiquetas
//      encima del contenido. La app quedó inusable en pantalla grande.
//   2. `#screen-home` NUNCA recibe `.active`. Home, stats y agenda son un
//      carrusel que se mueve con `translate3d` y marca el botón del riel, no la
//      pantalla. La regla estaba muerta en la app, y solo pareció funcionar
//      porque se verificó poniéndole `.active` a mano a una pantalla que la app
//      no marca nunca.
//
// Por eso este test cruza los dos archivos: comprueba contra `app.js` que cada
// pantalla nombrada en el CSS de verdad recibe `.active`. Una regla que espera
// un estado que el código no produce no falla, no avisa y no hace nada.
const fs = require('fs');
const raiz = __dirname + '/../';
const css = fs.readFileSync(raiz + 'styles.css', 'utf8');
const app = fs.readFileSync(raiz + 'app.js', 'utf8');

let ok = 0, fail = 0;
function chk(nombre, cond) { if (cond) { ok++; console.log('  ok   ' + nombre); } else { fail++; console.log('  FAIL ' + nombre); } }

const inicio = css.indexOf('@media(min-width:1024px){');
let prof = 0, fin = css.indexOf('{', inicio);
for (; fin < css.length; fin++) {
  if (css[fin] === '{') prof++;
  else if (css[fin] === '}') { prof--; if (prof === 0) break; }
}
const bloque = css.slice(inicio, fin + 1).replace(/\s+/g, '');

console.log('=== El riel se queda encendido por defecto ===');
chk('--rail vale 224px por defecto en escritorio', /--rail:224px/.test(bloque));
chk('body reserva el espacio con padding-left:var(--rail)',
  /body\{[^}]*padding-left:var\(--rail\)/.test(bloque));
// Lo que hizo inusable la app en #217: apagarlo por defecto.
chk('NO se apaga por defecto (:root o body a secas)',
  !/(:root|body)\{[^}]*--rail:0px/.test(bloque));

console.log('\n=== Y se apaga solo antes de entrar ===');
const apagado = (bloque.match(/((?:body:has\([^)]*\),?)+)\{--rail:0px;?\}/) || [])[1] || '';
const usadas = [...apagado.matchAll(/#screen-([\w-]+)\.active/g)].map(m => m[1]);
['auth', 'onboard', 'reset', 'app-error'].forEach(s =>
  chk('lo apaga en #screen-' + s, usadas.includes(s)));
chk('NO lo apaga en #screen-ramo: ahí ya estás dentro y el riel se queda',
  !usadas.includes('ramo'));

console.log('\n=== Y cada pantalla que nombra existe y se marca de verdad ===');
// Las que reciben `.active` explícitamente en app.js, más las del camino
// overlay de `showTab`, que es por donde entra `app-error`.
const marcadas = new Set([...app.matchAll(/getElementById\('screen-([\w-]+)'\)\.classList\.add\('active'\)/g)].map(m => m[1]));
const overlay = /getElementById\('screen-'\+tab\)[\s\S]{0,60}?classList\.add\('active'\)/.test(app);
const navTabs = (app.match(/NAV_TABS=\[([^\]]*)\]/) || [])[1] || '';
usadas.forEach(s => chk('#screen-' + s + ' recibe .active en app.js',
  marcadas.has(s) || (overlay && !navTabs.includes("'" + s + "'"))));
usadas.forEach(s => chk('#screen-' + s + ' no es una tab del carrusel (nunca llevaría .active)',
  !navTabs.includes("'" + s + "'")));

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
