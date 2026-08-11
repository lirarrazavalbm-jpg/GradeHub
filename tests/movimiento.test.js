// El movimiento de la app. Nada de esto rompe la pantalla si falla: la app se
// ve igual, solo se siente peor o se comporta mal en un teléfono. Por eso se
// revisa acá y no a ojo.
const fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(raiz, 'styles.css'), 'utf8');

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

// Rangos de líneas que están dentro de un @media(hover:hover).
const lineas = css.split('\n');
const gateadas = new Set();
lineas.forEach((l, i) => {
  if (!l.includes('hover:hover')) return;
  let prof = 0;
  for (let j = i; j < lineas.length; j++) {
    prof += (lineas[j].match(/\{/g) || []).length - (lineas[j].match(/\}/g) || []).length;
    gateadas.add(j);
    if (prof <= 0 && j > i) break;
  }
});

console.log('\n=== Ningún hover mueve nada en táctil ===');
// En un teléfono, tocar un elemento dispara :hover y el transform queda pegado
// hasta que toques otra cosa. `.ramo-row` es el elemento más tocado de la app y
// estuvo así hasta que alguien lo midió.
const sueltas = lineas
  .map((l, i) => ({ n: i + 1, l }))
  .filter(({ n, l }) => /:hover[^{]*\{[^}]*transform:/.test(l) && !gateadas.has(n - 1))
  .map(({ n, l }) => `${n}: ${l.split('{')[0].trim().slice(0, 40)}`);
chk('todo :hover con transform está detrás de @media(hover:hover)', sueltas.length === 0);
if (sueltas.length) sueltas.forEach(s => console.log('     suelta → ' + s));

console.log('\n=== Una sola animación por superficie ===');
// Convivían dos reglas para `.screen.active`: la de más abajo ganaba y la otra
// —340ms y su keyframe— no corría nunca. Dos reglas con el mismo selector y
// ambas con `animation` significa que alguien agregó un sistema paralelo.
// `animation:none` dentro del bloque de movimiento reducido no cuenta: es la
// forma correcta de apagarla, no un sistema paralelo.
const conAnimacion = lineas.filter(l => /^\s*\.screen\.active\{[^}]*animation:(?!none)/.test(l));
chk(`.screen.active declara animación una sola vez (${conAnimacion.length})`, conAnimacion.length === 1);
chk('el keyframe muerto screenIn ya no existe', !/@keyframes\s+screenIn\b/.test(css));

console.log('\n=== Los keyframes que existen se usan ===');
// Un keyframe sin uso es peso muerto que el próximo lector cree vivo.
const definidos = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1]);
const huerfanos = definidos.filter(k => !new RegExp(`animation:[^;}]*\\b${k}\\b`).test(css));
chk(`ningún @keyframes huérfano (${definidos.length} definidos)`, huerfanos.length === 0);
if (huerfanos.length) console.log('     huérfanos → ' + huerfanos.join(', '));

console.log('\n=== Las reglas duras del playbook ===');
// ease-in arranca lento y retrasa justo el instante que el usuario está mirando.
chk('ningún ease-in en transiciones ni animaciones',
  !/(transition|animation)[^;}]*\bease-in\b(?!-out)/.test(css));
// transition:all anima propiedades no buscadas fuera de la GPU.
chk('ningún transition:all', !/transition:\s*all\b/.test(css));
// Nada en el mundo real aparece de la nada.
chk('ningún scale(0) exacto', !/scale\(0\)/.test(css));

console.log('\n=== El modal entra y sale ===');
// Sin comentarios: estos chequeos buscan código, y los comentarios que EXPLICAN
// un arreglo mencionan justo las palabras que el arreglo eliminó. La primera
// versión de este test falló contra su propia documentación.
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const app = sinComentarios(fs.readFileSync(path.join(raiz, 'app.js'), 'utf8'));
const cssCodigo = sinComentarios(css);
// Antes `.open` solo hacía display:flex — el sheet aparecía y desaparecía de
// golpe, y por acá pasa todo flujo de la app.
chk('el sheet parte fuera de pantalla', /\.modal-sheet\{transform:translateY\(100%\)/.test(css));
// translateY(100%) es la altura del propio elemento: sirve igual con un sheet
// corto y con uno de 92vh. Un offset en píxeles se rompe con el contenido.
chk('la salida usa la altura propia, no píxeles', !/\.modal-sheet[^}]*translateY\(\d+px\)/.test(css));
// Sin @starting-style el navegador no anima la entrada: el elemento pasa de
// display:none a display:flex y cambia el transform en el mismo fotograma, así
// que salta al final de una. Lo comprobé en el navegador antes de arreglarlo.
chk('la entrada declara su estado inicial con @starting-style',
  /@starting-style\s*\{[\s\S]*?\.modal-overlay\.open \.modal-sheet\s*\{\s*transform:\s*translateY\(100%\)/.test(cssCodigo));
// Sin allow-discrete, display:none se aplica al empezar y el sheet desaparece
// antes de bajar: la salida no se ve nunca.
chk('la salida deja participar a display', /transition:[^;]*display[^;]*allow-discrete/.test(cssCodigo));
// Y con eso el cierre no necesita JS: ni clase extra ni transitionend.
chk('closeModal no necesita maquinaria', !/transitionend/.test(app) && !/cerrando/.test(app));

console.log('\n=== El arrastre cierra por velocidad ===');
// Antes exigía 90px fijos: un flick rápido y corto —que es como se cierra un
// sheet en serio— rebotaba en vez de cerrar.
chk('descarta por velocidad, no solo por distancia', /dy\/ms>0\.11/.test(app));
chk('mide el tiempo del gesto', /startT=Date\.now\(\)/.test(app));

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
