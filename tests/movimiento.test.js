// El movimiento de la app. Nada de esto rompe la pantalla si falla: la app se
// ve igual, solo se siente peor o se comporta mal en un teléfono. Por eso se
// revisa acá y no a ojo.
const fs = require('fs'), path = require('path'), vm = require('vm');
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
// Cuenta las dos formas de usarlo. Buscar solo `animation:` daba por muerto
// todo lo que se asigna con `animation-name:` — que es como el bloque de
// movimiento reducido cambia una entrada por su versión sin desplazamiento.
const definidos = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1]);
const huerfanos = definidos.filter(k => !new RegExp(`animation(-name)?:[^;}]*\\b${k}\\b`).test(css));
chk(`ningún @keyframes huérfano (${definidos.length} definidos)`, huerfanos.length === 0);
if (huerfanos.length) console.log('     huérfanos → ' + huerfanos.join(', '));

console.log('\n=== Las reglas duras del playbook ===');
// ease-in arranca lento y retrasa justo el instante que el usuario está mirando.
chk('ningún ease-in en transiciones ni animaciones',
  !/(transition|animation)[^;}]*\bease-in\b(?!-out)/.test(css));
// transition:all anima propiedades no buscadas fuera de la GPU.
chk('ningún transition:all', !/transition:\s*all\b/.test(css));
// Animar width o height obliga al navegador a recalcular el layout en CADA
// fotograma; transform y opacity los resuelve el compositor. Una barra de
// progreso se hace con scaleX() y transform-origin:left, no estirando el ancho.
// No falla de forma visible: solo va a tirones en un teléfono lento.
// Se compara el NOMBRE de cada propiedad, no el texto completo: `border-left-color`
// contiene "left" y es pintura, no layout.
const LAYOUT = ['width', 'height', 'top', 'left', 'right', 'bottom', 'margin', 'padding'];
const layoutAnimado = [...css.matchAll(/transition:([^;}]*)/g)]
  .flatMap(m => m[1].split(',').map(p => p.trim().split(/\s+/)[0]))
  .filter(prop => LAYOUT.includes(prop));
chk(`ninguna transición sobre propiedades de layout (${layoutAnimado.length})`, layoutAnimado.length === 0);
if (layoutAnimado.length) console.log('     anima: ' + [...new Set(layoutAnimado)].join(', '));
// Nada en el mundo real aparece de la nada.
chk('ningún scale(0) exacto', !/scale\(0\)/.test(css));

console.log('\n=== El ritmo sale de la escala, no de la memoria ===');
// La escala es --motion-press/fast/base (120/160/220ms). El problema no era que
// alguien eligiera mal: era que había 12 duraciones distintas para tres pasos,
// porque escribir `.15s` es más rápido que buscar cuál token corresponde.
// Nadie lo iba a notar mirando la pantalla — 150 y 160ms se ven igual — así que
// se revisa acá.
//
// El límite es 220ms, el token más largo. Arriba de eso la escala no opina:
// el toast y el borde del eval-group duran .3s a propósito y quedan a mano.
// Abajo de eso, un número escrito a mano es una decisión que ya estaba tomada.
const duras = [];
[...css.matchAll(/\b(transition|animation)\s*:\s*([^;{}]+)/g)].forEach(([, prop, valor]) => {
  [...valor.matchAll(/(?<![\w.-])(\d*\.?\d+)(ms|s)(?![\w-])/g)].forEach(([lit, num, unidad]) => {
    const ms = unidad === 's' ? parseFloat(num) * 1000 : parseFloat(num);
    if (ms > 0 && ms <= 220) duras.push(`${prop}: ${lit}`);
  });
});
chk(`ninguna duración a mano dentro de la escala (${duras.length} encontradas)`, duras.length === 0);
if (duras.length) {
  console.log('     usa var(--motion-press|fast|base) en vez de:');
  [...new Set(duras)].forEach(d => console.log('       ' + d));
}
// Las dos curvas ya tienen nombre en :root. Copiar el cubic-bezier funciona
// igual, pero la próxima vez que se ajuste la curva quedan dos verdades.
const curvasSueltas = [...css.matchAll(/\b(transition|animation)\s*:\s*([^;{}]+)/g)]
  .flatMap(([, , v]) => v.match(/cubic-bezier\([^)]*\)/g) || []);
chk(`ninguna curva copiada a mano (${curvasSueltas.length} encontradas)`, curvasSueltas.length === 0);
if (curvasSueltas.length) [...new Set(curvasSueltas)].forEach(c => console.log('       ' + c));

console.log('\n=== El rebote al soltar tiene con qué volver ===');
// `button:active{transform:scale(.97)}` sin transición en `button` hunde el
// botón y lo devuelve de un salto. No falla nada ni se ve un error: solo se
// siente barato, y por eso estuvo así tanto tiempo.
const reglaButton = (css.match(/^button\{([^}]*)\}/m) || [])[1] || '';
chk('`button` declara la transición del transform', /transition:[^;]*transform/.test(reglaButton));
// Y las clases que declaran su propio `transition` lo pisan entero: si una es
// un <button> y omite transform, ese botón se queda sin rebote aunque el de
// arriba esté puesto.
const cssCodigoSel = css.replace(/\/\*[\s\S]*?\*\//g, '');
const fuentes = ['app.js', 'index.html'].map(f => fs.readFileSync(path.join(raiz, f), 'utf8')).join('\n');
const clasesBoton = new Set([...fuentes.matchAll(/<button[^>]*class="([^"]+)"/g)]
  .flatMap(m => m[1].split(/\s+/)).filter(Boolean));
// El bloque de ritmo da transform a una lista larga de superficies tocables.
// Quien esté ahí ya tiene rebote aunque su propia regla no lo mencione: el
// bloque va después en el archivo y gana.
// Sin quitar el comentario que lo precede, el primer "selector" de la lista es
// el comentario y `.icon-btn` se pierde: el chequeo lo acusaba sin rebote
// teniéndolo.
const listaRitmo = new Set(((cssCodigoSel.match(/([^{}]*)\{\s*transition:transform var\(--motion-press\)/) || [])[1] || '')
  .split(',').map(s => s.trim().replace(/^\./, '')).filter(Boolean));
const sinRebote = [];
[...css.matchAll(/(^|[},])\s*(\.[\w-]+)\{([^}]*transition:[^;}]*)/gm)].forEach(([, , sel, cuerpo]) => {
  const clase = sel.slice(1);
  if (!clasesBoton.has(clase) || listaRitmo.has(clase)) return;
  const decl = (cuerpo.match(/transition:([^;}]*)/) || [])[1] || '';
  if (!/transform/.test(decl)) sinRebote.push(clase);
});
chk(`ningún <button> pierde el rebote por declarar su propio transition (${sinRebote.length})`, sinRebote.length === 0);
if (sinRebote.length) console.log('     sin transform → ' + [...new Set(sinRebote)].join(', '));

console.log('\n=== Movimiento reducido: menos, no cero ===');
// El bloque nuclear `*{animation-duration:.01ms!important}` apagaba también lo
// que EXPLICA la pantalla: la nota cambiaba sin ninguna señal de haber
// cambiado. Con la preferencia activada la app quedaba menos clara que sin
// ella, que es exactamente al revés de lo que la preferencia pide.
const bloquesReduce = [];
[...css.matchAll(/@media[^{]*prefers-reduced-motion[^{]*\{/g)].forEach(m => {
  let prof = 1, j = m.index + m[0].length;
  while (j < css.length && prof > 0) { if (css[j] === '{') prof++; else if (css[j] === '}') prof--; j++; }
  bloquesReduce.push(css.slice(m.index, j));
});
chk(`hay tratamiento de movimiento reducido (${bloquesReduce.length} bloques)`, bloquesReduce.length > 0);
const nuclear = bloquesReduce.filter(b => /\*[^{]*\{[^}]*(animation|transition)-duration:[^;}]*!important/.test(b));
chk('no se apaga todo con un * y !important', nuclear.length === 0);
// Cada entrada que se reemplaza bajo la preferencia tiene que seguir diciendo
// algo: si el reemplazo tampoco cambia la opacidad, da igual que apagarla.
const reemplazos = bloquesReduce.flatMap(b => [...b.matchAll(/animation-name:\s*([\w-]+)/g)].map(m => m[1]));
// El cuerpo de un @keyframes tiene llaves adentro, así que se recorta contando
// llaves. Con una expresión perezosa se cortaba en `from{...}` y el chequeo
// leía un cuerpo vacío — o sea, pasaba o fallaba por la razón equivocada.
const cuerpoKeyframe = nombre => {
  const i = css.search(new RegExp(`@keyframes\\s+${nombre}\\s*\\{`));
  if (i < 0) return null;
  let prof = 0, j = css.indexOf('{', i);
  const ini = j;
  do { if (css[j] === '{') prof++; else if (css[j] === '}') prof--; j++; } while (j < css.length && prof > 0);
  return css.slice(ini + 1, j - 1);
};
const mudos = reemplazos.filter(k => {
  const kf = cuerpoKeyframe(k);
  return kf === null || !/opacity/.test(kf) || /transform/.test(kf);
});
chk(`las entradas reducidas conservan el fundido y sueltan el recorrido (${reemplazos.length} reemplazos)`,
  reemplazos.length > 0 && mudos.length === 0);
if (mudos.length) console.log('     revisar → ' + mudos.join(', '));

console.log('\n=== El modal entra y sale ===');
// Sin comentarios: estos chequeos buscan código, y los comentarios que EXPLICAN
// un arreglo mencionan justo las palabras que el arreglo eliminó. La primera
// versión de este test falló contra su propia documentación.
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const app = sinComentarios(fs.readFileSync(path.join(raiz, 'app.js'), 'utf8') + '\n' + fs.readFileSync(path.join(raiz, 'render-main.js'), 'utf8'));
const cssCodigo = sinComentarios(css);

console.log('\n=== Cerrar un ramo no significa aprobarlo ===');
const reglaProgreso = (cssCodigo.match(/\.ramo-progress\{([^}]*)\}/) || [])[1] || '';
const altoProgreso = parseFloat((reglaProgreso.match(/height:\s*([\d.]+)px/) || [])[1] || 0);
const anchoProgreso = parseFloat((reglaProgreso.match(/max-width:\s*([\d.]+)px/) || [])[1] || 0);
chk(`la barra se puede percibir (${altoProgreso}px por hasta ${anchoProgreso}px)`,
  altoProgreso >= 6 && anchoProgreso >= 140);
const fnCierre = (app.match(/function ramoRecienCerrado\([^)]*\)\{[^}]*\}/) || [])[0] || '';
const ramoRecienCerrado = fnCierre ? vm.runInNewContext(`(${fnCierre})`) : null;
chk('el efecto ocurre solo al cruzar desde menos de 100 a 100',
  !!ramoRecienCerrado && ramoRecienCerrado(99, 100) &&
  !ramoRecienCerrado(undefined, 100) && !ramoRecienCerrado(100, 100) && !ramoRecienCerrado(80, 90));
chk('Home conserva el avance anterior en el DOM para no repetir el efecto al volver a renderizar',
  /querySelectorAll\(['"]\.ramo-row\[data-progress\]/.test(app) &&
  /dataset\.progress\s*=\s*String\(prog\.pct\)/.test(app));
chk('el 100% se nombra como cierre y no como aprobación',
  /100%\s*·\s*cerrado/.test(app) && !/prog\.pct===100[^;\n]*(aprob|éxito|logro)/i.test(app));
const reglaCierre = (cssCodigo.match(/\.ramo-progress\.is-complete\{([^}]*)\}/) || [])[1] || '';
chk('el cierre usa la identidad del ramo y no el semáforo académico',
  /var\(--ramo-tint/.test(reglaCierre) && !/var\(--(?:green|yellow|red)/.test(reglaCierre));
chk('la llegada al cierre tiene una versión reducida que conserva opacidad sin recorrido',
  /\.ramo-progress\.just-completed[^}]*animation-name:\s*ramo-progress-close-reduce/.test(cssCodigo) &&
  /@keyframes\s+ramo-progress-close-reduce\{[^}]*opacity:[^}]*\}[^}]*\}/.test(cssCodigo) &&
  !/@keyframes\s+ramo-progress-close-reduce\{[^}]*transform/.test(cssCodigo));
const reglaAvanceStats=(cssCodigo.match(/\.stats-progress-fill\{([^}]*)\}/)||[])[1]||'';
chk('la barra del semestre usa scaleX y la identidad, no el semáforo',
  /transform-origin:left/.test(reglaAvanceStats) && /transition:transform/.test(reglaAvanceStats) &&
  /var\(--primary\)/.test(reglaAvanceStats) && !/var\(--(?:green|yellow|red)/.test(reglaAvanceStats));
chk('Estadísticas llena su barra con el avance real calculado',
  /stats-progress-fill[^>]*transform:scaleX\(\$\{avance\.pct\/100\}\)/.test(app));
chk('reduced motion conserva el color final sin recorrer la barra del semestre',
  /@media\(prefers-reduced-motion:reduce\)[\s\S]*?\.stats-progress-fill\{transition:opacity/.test(cssCodigo));
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
