// Verifica la identidad única: el tenant cambia datos académicos, nunca color.
const fs = require('fs'), vm = require('vm');
const h = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const DATA = fs.readFileSync(__dirname + '/../data.js', 'utf8');
const ENGINE = fs.readFileSync(__dirname + '/../engine.js', 'utf8');
const APP = fs.readFileSync(__dirname + '/../app.js', 'utf8');
const AGENDA = fs.readFileSync(__dirname + '/../render-agenda.js', 'utf8');
const src = DATA + '\n' + ENGINE + '\n' + APP + '\n' + AGENDA;
new vm.Script(src);
const css = fs.readFileSync(__dirname + '/../styles.css', 'utf8');
const o = (css.match(/\{/g) || []).length, c = (css.match(/\}/g) || []).length;
console.log('JS OK · CSS ' + o + '/' + c + (o === c ? ' OK' : ' MISMATCH'));

let ok = 0, fail = 0;
const chk = (n, cond) => { if (cond) ok++; else { fail++; console.log('  FAIL ' + n); } };

function lum(hex) {
  const cc = hex.replace('#', '');
  const v = [0, 2, 4].map(i => {
    let x = parseInt(cc.substr(i, 2), 16) / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
const ratio = (a, b) => {
  const L1 = lum(a), L2 = lum(b);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
};
function hue(hex) {
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.substr(i + 1, 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
function saturation(hex) {
  const rgb = [0, 2, 4].map(i => parseInt(hex.substr(i + 1, 2), 16) / 255);
  return Math.max(...rgb) === 0 ? 0 : (Math.max(...rgb) - Math.min(...rgb)) / Math.max(...rgb);
}
function ctxFor(dark) {
  const props = {};
  const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false; } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null; }, querySelectorAll() { return []; }, querySelector() { return stub; }, clientWidth: 400, dataset: {}, click() {} };
  const ctx = {
    window: { addEventListener() {}, matchMedia: () => ({ matches: dark, addEventListener() {}, addListener() {} }) },
    document: {
      getElementById: () => stub, createElement: () => stub, addEventListener() {},
      documentElement: { style: { setProperty(k, v) { props[k] = v; }, removeProperty(k) { delete props[k]; } }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null; } },
      querySelector: () => stub, querySelectorAll: () => [], body: stub
    },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    navigator: {}, location: { origin: '', pathname: '', hash: '' }, setTimeout, clearTimeout, console,
    __props: props
  };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  return ctx;
}
const TENANT_CODES = ['fen', 'uc', 'uai', 'uandes'];
const dark = ctxFor(true), P = dark.__props;
const reset = () => Object.keys(P).forEach(k => delete P[k]);
const snapshot = () => ['--primary', '--primary-fg', '--primary-light', '--accent', '--secondary', '--green', '--yellow', '--red', '--bg', '--bg2', '--card', '--border', '--border2', '--muted', '--fg', '--fg2', '--fg3'].map(k => P[k]).join('|');

console.log('\n=== Una identidad, sin importar la universidad ===');
const theme = vm.runInContext('GRADEHUB_THEME', dark);
chk('no queda registro THEMES por universidad', vm.runInContext('typeof THEMES', dark) === 'undefined');
chk('tiene todos los tokens de identidad', ['primary', 'primaryFg', 'primaryLight', 'darkPrimary', 'darkPrimaryFg', 'darkPrimaryLight', 'accent', 'secondary', 'darkSecondary'].every(k => k in theme));
chk('la identidad ya no contiene superficies', !('dark' in theme));

console.log('\n=== Fondos separados de la identidad ===');
const tieneFondos = vm.runInContext('typeof FONDOS !== "undefined"', dark);
chk('existe un registro de fondos independiente de ACENTOS', tieneFondos);
chk('las cuentas anteriores reciben el fondo neutro al normalizar',
  tieneFondos && vm.runInContext('normalize({ramos:[]}).fondo', dark) === 'neutro');
const fondos = vm.runInContext('FONDOS', dark);
const fondoKeys = ['bg','bg2','card','border','border2','muted','fg','fg2','fg3'];
chk('el fondo neutro declara claro y oscuro completos', ['claro','oscuro'].every(m =>
  fondoKeys.every(k => typeof fondos.neutro[m][k] === 'string')));
chk('normalize descarta fondos desconocidos sin perder los datos',
  vm.runInContext('normalize({ramos:[],fondo:"inventado"}).fondo', dark) === 'neutro');

console.log('\n=== El CSS parte con la identidad correcta ===');
// applyTheme() reemplaza estos tokens en cuanto corre app.js, pero antes de eso
// el navegador pinta los defaults de styles.css. Si se desincronizan, cada carga
// fría parte con otra identidad y después salta de color. La 404 ya tenía esta
// misma guarda: acá cubrimos los tres bloques que pinta la app principal.
const tokensCss = bloque => Object.fromEntries([...bloque.matchAll(/(--[a-z0-9-]+):([^;]+)/g)].map(([, k, v]) => [k, v.trim()]));
const bloqueCss = selector => (css.match(selector) || [])[1] || '';
const defaultsCss = [
  ['claro', bloqueCss(/:root\{([^}]*)\}/), {
    '--primary': theme.primary, '--primary-fg': theme.primaryFg,
    '--primary-light': theme.primaryLight, '--accent': theme.accent,
    '--secondary': theme.secondary,
  }],
  ['oscuro del sistema', bloqueCss(/:root:not\(\[data-modo="claro"\]\)\{([^}]*)\}/), {
    '--primary': theme.darkPrimary, '--primary-fg': theme.darkPrimaryFg,
    '--primary-light': theme.darkPrimaryLight, '--accent': theme.accent,
    '--secondary': theme.darkSecondary,
  }],
  ['oscuro forzado', bloqueCss(/:root\[data-modo="oscuro"\]\{([^}]*)\}/), {
    '--primary': theme.darkPrimary, '--primary-fg': theme.darkPrimaryFg,
    '--primary-light': theme.darkPrimaryLight, '--accent': theme.accent,
    '--secondary': theme.darkSecondary,
  }],
];
defaultsCss.forEach(([modo, bloque, esperado]) => {
  const actuales = tokensCss(bloque);
  chk(`${modo}: los cinco tokens iniciales calzan con GRADEHUB_THEME`,
    Object.entries(esperado).every(([k, v]) => actuales[k] === v));
});
[
  ['claro', bloqueCss(/:root\{([^}]*)\}/), fondos.neutro.claro],
  ['oscuro del sistema', bloqueCss(/:root:not\(\[data-modo="claro"\]\)\{([^}]*)\}/), fondos.neutro.oscuro],
  ['oscuro forzado', bloqueCss(/:root\[data-modo="oscuro"\]\{([^}]*)\}/), fondos.neutro.oscuro],
].forEach(([modo, bloque, esperado]) => {
  const actuales=tokensCss(bloque);
  chk(`${modo}: la carga fría calza con el fondo neutro`,
    fondoKeys.every(k=>actuales['--'+k]===esperado[k]));
});
chk('styles.css no conserva el cian de la identidad anterior',
  ['#087f98','#e2f6f8','#22d3ee','#05252b','#0b2930','#65e6f4'].every(c => !css.includes(c)));
// El acento tiene que ser vivo y más claro que el primario, sea cual sea la
// familia de color. La versión anterior de este chequeo se llamaba "el acento
// luminoso acompaña al cian profundo" — el nombre daba por hecho una paleta que
// ya no existe, y un test que describe mal lo que prueba envejece peor que uno
// que falla.
chk('el acento es vivo y más claro que el primario', saturation(theme.accent) >= .5 && lum(theme.accent)>lum(theme.primary));
// El acento de identidad no puede confundirse con el color de un ramo. La
// versión anterior de este chequeo exigía que difirieran en LUMINOSIDAD, y era
// una regla mal planteada: dos colores de matiz distinto se distinguen perfecto
// con la misma luminosidad, y con nueve colores de ramo repartidos por la rueda
// es casi imposible de cumplir. Pasaba por casualidad.
//
// El criterio correcto es el mismo que se aplica más abajo a los ramos y al
// semáforo: separación por matiz o por contraste. Tener dos reglas distintas
// para la misma pregunta era el error real.
//
// Se revisan los DOS primarios. La app se ve casi siempre en oscuro, así que un
// chequeo que solo mira el de modo claro deja fuera el que de verdad se usa.
const separaDe = (a, b) => {
  const d = Math.min(Math.abs(hue(a) - hue(b)), 360 - Math.abs(hue(a) - hue(b)));
  return d >= 21 || ratio(a, b) >= 1.7;
};
[['claro', theme.primary], ['oscuro', theme.darkPrimary]].forEach(([modo, color]) => {
  chk(`la identidad en ${modo} (${color}) no se confunde con ningún ramo`,
    vm.runInContext('COLORS', dark).every(c => separaDe(color, c)));
});

const firmas = TENANT_CODES.map(code => { reset(); dark.applyTheme(code); return snapshot(); });
chk('los cuatro tenants reciben exactamente los mismos tokens', new Set(firmas).size === 1);
chk('los cuatro tenants siguen existiendo como datos', TENANT_CODES.every(code => vm.runInContext('Boolean(TENANTS[' + JSON.stringify(code) + '])', dark)));
TENANT_CODES.forEach(code => {
  const badge = vm.runInContext('tenantBadge(' + JSON.stringify(code) + ')', dark);
  chk(code + ' conserva su monograma con el acento común', badge.includes('--tb:var(--primary)'));
});
console.log('  ' + TENANT_CODES.map((t, i) => t.toUpperCase() + '=' + firmas[i].split('|')[0]).join('  '));

console.log('\n=== Contraste de la identidad única ===');
reset(); dark.applyTheme('fen');
const rBg = ratio(P['--primary'], P['--bg']);
const rCard = ratio(P['--primary'], P['--card']);
const rFg = ratio(P['--primary-fg'], P['--primary']);
const rText = ratio('#eef3f8', P['--card']);
chk('acento vs fondo oscuro ≥3', rBg >= 3);
chk('acento vs card oscura ≥3', rCard >= 3);
chk('texto sobre acento ≥4.5', rFg >= 4.5);
chk('texto principal sobre card ≥7', rText >= 7);
console.log('  acento/fondo ' + rBg.toFixed(2) + '  acento/card ' + rCard.toFixed(2) + '  texto/acento ' + rFg.toFixed(2) + '  texto/card ' + rText.toFixed(2));

console.log('\n=== El botón primario se lee en TODO su degradado ===');
// El botón no es de un color: es un degradado, y el contraste hay que medirlo
// en los dos extremos. Medido solo en el arranque daba 5.23 y parecía sano
// mientras la mitad derecha estaba en 2.03 — blanco sobre turquesa claro.
// Como la interpolación es monótona, con los extremos basta.
// Los dos modos necesitan lo contrario (claro: texto blanco, degradado que se
// oscurece; oscuro: texto oscuro, degradado que se aclara), así que se revisan
// por separado o uno tapa al otro.
const mezcla = (a, b, pct) => {          // color-mix(in srgb, a, b pct)
  const h = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const [ar, ag, ab] = h(a), [br, bg, bb] = h(b), p = pct / 100;
  return '#' + [ar * (1 - p) + br * p, ag * (1 - p) + bg * p, ab * (1 - p) + bb * p]
    .map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
};
// El valor se LEE del CSS, no se recalcula acá: si se copia la fórmula, el
// chequeo se aprueba a sí mismo y pasa igual con el degradado roto.
const gradDe = bloque => {
  // El segundo color puede ser var(--x), que trae paréntesis propios: acotarlo
  // con [^)] lo cortaba a la mitad y solo funcionaba con el #000 del modo claro.
  const m = bloque.match(/--primary-grad:\s*color-mix\(in srgb,\s*([^,]+),\s*(.+?)\s+(\d+)%\)/);
  if (!m) return null;
  const tok = t => ({
    'var(--primary)': [theme.primary, theme.darkPrimary],
    'var(--accent)': [theme.accent, theme.accent],
    '#000': ['#000000', '#000000'], '#000000': ['#000000', '#000000'],
  })[t.trim()] || null;
  return { a: tok(m[1]), b: tok(m[2]), pct: +m[3] };
};
[
  ['claro', 0, theme.primary, theme.primaryFg, bloqueCss(/:root\{([^}]*)\}/)],
  ['oscuro', 1, theme.darkPrimary, theme.darkPrimaryFg, bloqueCss(/:root\[data-modo="oscuro"\]\{([^}]*)\}/)],
].forEach(([modo, i, ini, fg, bloque]) => {
  const g = gradDe(bloque);
  if (!g || !g.a || !g.b) { chk(`${modo}: se pudo leer el fin del degradado del CSS`, false); return; }
  const fin = mezcla(g.a[i], g.b[i], g.pct);
  const a = ratio(fg, ini), b = ratio(fg, fin);
  chk(`${modo}: el texto se lee en los dos extremos (${a.toFixed(2)} / ${b.toFixed(2)})`,
    Math.min(a, b) >= 4.5);
});
// Y que el degradado siga saliendo de un token por modo: con un valor único
// escrito a mano, arreglar un modo rompe el otro. Fue exactamente lo que pasó.
// `[^)]*` no sirve acá: el propio degradado lleva var(--primary), que cierra
// paréntesis antes de tiempo. Se busca dentro del bloque de la regla.
chk('el fin del degradado es un token, no un valor fijo',
  /var\(--primary-grad\)/.test((css.match(/\.btn-primary\{([^}]*)\}/) || [])[1] || ''));
chk('cada modo define su propio --primary-grad',
  (css.match(/--primary-grad:/g) || []).length >= 3);

console.log('\n=== Cada acento se lee completo en claro y oscuro ===');
const acentos=vm.runInContext('ACENTOS',dark);
chk('turquesa conserva exactamente la identidad histórica',
  ['primary','primaryFg','primaryLight','darkPrimary','darkPrimaryFg','darkPrimaryLight','accent','secondary','darkSecondary']
    .every(k=>acentos.turquesa[k]===theme[k]));
chk('hay varias opciones además del default',Object.keys(acentos).length>=6);
const acentosCalidos=Object.entries(acentos).filter(([,a])=>{
  const h=hue(a.primary);return h<60||h>=320;
});
chk('hay al menos dos acentos cálidos',acentosCalidos.length>=2);
acentosCalidos.forEach(([key,a])=>{
  chk(`${key}: todos sus colores visibles se distinguen de ramos y semáforo`,
    [a.primary,a.darkPrimary,a.accent,a.secondary,a.darkSecondary]
      .every(color=>[...vm.runInContext('COLORS',dark),'#2ecc40','#ffc94d','#ff5f7a']
        .every(c=>separaDe(color,c))));
});
Object.entries(acentos).forEach(([key,a])=>{
  const finClaro=mezcla(a.primary,'#000000',18);
  const finOscuro=mezcla(a.accent,a.darkPrimary,25);
  chk(`${key}: contraste claro en ambos extremos`,
    Math.min(ratio(a.primaryFg,a.primary),ratio(a.primaryFg,finClaro))>=4.5);
  chk(`${key}: contraste oscuro en ambos extremos`,
    Math.min(ratio(a.darkPrimaryFg,a.darkPrimary),ratio(a.darkPrimaryFg,finOscuro))>=4.5);
  chk(`${key}: no se confunde con ramos ni semáforo`,
    [a.primary,a.darkPrimary].every(color=>[...vm.runInContext('COLORS',dark),'#2ecc40','#ffc94d','#ff5f7a'].every(c=>separaDe(color,c))));
});
vm.runInContext('S.acento="violeta";applyTheme()',dark);
chk('applyTheme aplica la elección guardada',
  P['--primary']===acentos.violeta.darkPrimary&&P['--primary-fg']===acentos.violeta.darkPrimaryFg);
chk('normalize vuelve al default ante una clave desconocida',
  vm.runInContext('normalize({ramos:[],acento:"inventado"}).acento',dark)==='turquesa');
vm.runInContext('S.acento="turquesa"',dark);

console.log('\n=== Modo claro y oscuro siguen siendo decisiones separadas ===');
const light = ctxFor(false), PL = light.__props;
TENANT_CODES.forEach(code => {
  Object.keys(PL).forEach(k => delete PL[k]);
  light.applyTheme(code);
  chk(code + ' aplica el fondo claro elegido', fondoKeys.every(k => PL['--'+k] === fondos.neutro.claro[k]));
  chk(code + ' conserva el cian profundo en claro', PL['--primary'] === theme.primary && PL['--primary-fg'] === theme.primaryFg);
  chk(code + ' usa el tinte claro', PL['--primary-light'] === theme.primaryLight);
});
reset(); dark.applyTheme('uc');
chk('oscuro aplica el fondo oscuro elegido', fondoKeys.every(k => P['--'+k] === fondos.neutro.oscuro[k]));
chk('oscuro usa el cian luminoso', P['--primary'] === theme.darkPrimary && P['--primary-fg'] === theme.darkPrimaryFg);
chk('oscuro usa el tinte oscuro', P['--primary-light'] === theme.darkPrimaryLight);

console.log('\n=== Texto y semáforo legibles en ambos modos ===');
const semaforo=vm.runInContext('SEMAFORO',dark);
[['claro',fondos.neutro.claro,semaforo.claro],['oscuro',fondos.neutro.oscuro,semaforo.oscuro]].forEach(([modo,f,s])=>{
  ['bg','bg2','card'].forEach(superficie=>{
    chk(`${modo}: texto principal sobre ${superficie} ≥7`,ratio(f.fg,f[superficie])>=7);
    chk(`${modo}: texto secundario sobre ${superficie} ≥4.5`,ratio(f.fg2,f[superficie])>=4.5);
    chk(`${modo}: texto terciario sobre ${superficie} ≥4.5`,ratio(f.fg3,f[superficie])>=4.5);
    ['green','yellow','red'].forEach(color=>
      chk(`${modo}: ${color} sobre ${superficie} ≥4.5`,ratio(s[color],f[superficie])>=4.5));
  });
});
Object.keys(PL).forEach(k=>delete PL[k]);light.applyTheme('fen');
chk('claro usa su propio semáforo', ['green','yellow','red'].every(k=>PL['--'+k]===semaforo.claro[k]));
reset();dark.applyTheme('fen');
chk('oscuro usa su propio semáforo', ['green','yellow','red'].every(k=>P['--'+k]===semaforo.oscuro[k]));

console.log('\n=== Semáforo fijo y separado del acento ===');
const sem = TENANT_CODES.map(code => { reset(); dark.applyTheme(code); return [P['--green'], P['--yellow'], P['--red']].join('|'); });
chk('semáforo idéntico en todos los tenants', new Set(sem).size === 1);
vm.runInContext('S.acento="cobre"',dark);reset();dark.applyTheme('fen');
chk('cambiar el acento no tiñe el semáforo', [P['--green'],P['--yellow'],P['--red']].join('|')===sem[0]);
vm.runInContext('S.acento="turquesa"',dark);
console.log('  ' + sem[0]);

console.log('\n=== Semáforo gradual dentro de cada categoría ===');
const gradeHue = n => Number(vm.runInContext('notaHue(' + n + ')', dark).toFixed(1));
const gradeHues = [1, 2, 3, 4, 5, 6, 7].map(gradeHue);
chk('1.0 es rojo urgente', gradeHues[0] === 0);
chk('4.0 cae en ámbar', gradeHues[3] === 48);
chk('6.0 ya es el verde más alto', gradeHues[5] === 142);
chk('un 7 no se ve menos verde que un 6', gradeHues[6] === gradeHues[5]);
chk('hasta el 6.0 cada nota sube de color', gradeHues.slice(0, 6).every((h, i) => i === 0 || h > gradeHues[i - 1]));
chk('el color nunca retrocede al subir la nota', gradeHues.every((h, i) => i === 0 || h >= gradeHues[i - 1]));
chk('las etiquetas siguen siendo semánticas', vm.runInContext('colorClass(3.9)+"|"+colorClass(4.0)+"|"+colorClass(5.0)', dark) === 'bad|warn|good');
const saltoAprobacion=gradeHue(4.0)-gradeHue(3.9);
const variacionReprobado=gradeHue(3.9)-gradeHue(1.0);
chk('3.9 → 4.0 cambia más que todo el rojo reprobado', saltoAprobacion>variacionReprobado);
chk('el número usa un color calculado, no tres valores fijos', vm.runInContext('getColor(1.0)!==getColor(3.0)&&getColor(3.0)!==getColor(5.0)&&getColor(5.0)!==getColor(7.0)', dark));
// `.ramo-nota` pinta el número leyendo --grade-color de su style inline. Si un
// sitio lo emite sin esa variable, el número sale del color del texto y un 2,5
// se ve igual que un 5,5: el semáforo desaparece sin que nada falle. Pasó en
// render-agenda.js, que quedó fuera cuando el color pasó a ser calculado.
[['app.js', APP], ['render-agenda.js', AGENDA]].forEach(([archivo, src]) => {
  const sinColor = (src.match(/class="ramo-nota[^"]*"(?![^>]*--grade-color)[^>]*>/g) || []);
  chk(`${archivo}: toda .ramo-nota lleva su --grade-color (${sinColor.length} sin él)`, sinColor.length === 0);
});
chk('1.0 usa el rojo urgente, no el rojo regular', vm.runInContext('notaUrgente(1.0)&&getColor(1.0)==="hsl(352 100% var(--grade-urgent-light))"&&!notaUrgente(1.1)', dark));
// El 7,0 se queda en el verde de aprobado, más vivo, y el oro va en un anillo
// alrededor del número (styles.css). El dorado anterior era hsl(43…), el mismo
// matiz que el ámbar de "al borde": la nota perfecta se pintaba del color del
// peligro. Este test fija que el número NUNCA vuelva a un matiz que no sea verde.
chk('7.0 usa el verde más vivo, no un dorado', vm.runInContext('notaPerfecta(7.0)&&getColor(7.0)==="hsl(142 92% var(--grade-perfect-light))"&&!notaPerfecta(6.9)', dark));
chk('ningún matiz del número de nota cae en la familia del ámbar',
  [1,2,3,3.9,4,5,6,6.5,7].every(n => {
    const c = vm.runInContext(`getColor(${n})`, dark);
    const m = c.match(/hsl\((\d+(?:\.\d+)?)/);
    if (!m) return true;
    const h = Number(m[1]);
    // El ámbar del semáforo está en 42°. Se exige distancia salvo en la banda
    // que de verdad significa "al borde" (4,0–5,0), donde el ámbar es correcto.
    return (n >= 4 && n < 5) || Math.abs(h - 42) >= 12;
  }));
// El oro va en el CONTORNO del número, no en un aro alrededor ni en el relleno.
// El relleno tiene que seguir siendo verde: ahí el color significa aprobado.
const cssPerfecto = require('fs').readFileSync(__dirname + '/../styles.css', 'utf8');
chk('el oro del 7,0 es el contorno del número', /grade-perfect\{[^}]*-webkit-text-stroke:[^;]*#e8b53c/.test(cssPerfecto.replace(/\s+/g, '')) || /-webkit-text-stroke:1\.4px #e8b53c/.test(cssPerfecto));
chk('el relleno del 7,0 sigue siendo verde', /grade-perfect[^}]*linear-gradient\(158deg,#7bffa8/.test(cssPerfecto));
chk('ya no hay anillo alrededor del número', !/\.grade-perfect::after/.test(cssPerfecto));
chk('los extremos grandes reciben su acabado propio', vm.runInContext('claseNotaEspecial(1.0)+"|"+claseNotaEspecial(7.0)', dark) === ' grade-urgent| grade-perfect');
console.log('  ' + gradeHues.map((h, i) => (i + 1) + '.0=' + h + '°').join('  '));

console.log('\n=== Colores de ramo: identificadores, no decoración ===');
const pal = vm.runInContext('COLORS', dark);
chk('al menos 8 colores', pal.length >= 8);
chk('sin repetidos', new Set(pal).size === pal.length);
let minSep = 360, par = '';
const hues = pal.map(hue).sort((a, b) => a - b);
hues.forEach((h, i) => {
  const sig = hues[(i + 1) % hues.length];
  const sep = Math.min(Math.abs(sig - h), 360 - Math.abs(sig - h));
  if (sep < minSep) { minSep = sep; par = h.toFixed(0) + '° / ' + sig.toFixed(0) + '°'; }
});
chk('ningún par de colores a menos de 18° de matiz', minSep >= 18);
const SEM = ['#2ecc40', '#ffc94d', '#ff5f7a'];
const separaIdentidad = color => {
  const distancia=Math.min(Math.abs(hue(color)-hue(theme.primary)),360-Math.abs(hue(color)-hue(theme.primary)));
  // El acento de la app y un ramo pueden compartir familia cian, pero no el
  // mismo rol visual: cuando el matiz coincide, exigimos contraste propio.
  return distancia>=21||ratio(color,theme.primary)>=1.7;
};
chk('el acento se distingue de cada ramo por matiz o contraste', pal.every(separaIdentidad));
chk('el acento se distingue del semáforo por matiz o contraste', SEM.every(separaIdentidad));
chk('ningún color de ramo choca con el semáforo', pal.every(c => SEM.every(s => Math.min(Math.abs(hue(c) - hue(s)), 360 - Math.abs(hue(c) - hue(s))) >= 10)));
console.log('  ' + pal.length + ' colores, separación mínima ' + minSep.toFixed(0) + '° (' + par + ')');

console.log('\n=== Color por familia de ramo ===');
const fams = vm.runInContext('FAMILIAS_COLOR', dark);
chk('toda familia usa un color de la paleta', fams.every(([, c]) => pal.includes(c)));
[['Métodos Matemáticos II', 'Métodos Matemáticos IV'], ['Inglés I', 'Inglés V'], ['Contabilidad', 'Contabilidad Financiera']].forEach(([a, b]) => {
  const ca = vm.runInContext('colorDeFamilia(' + JSON.stringify(a) + ')', dark);
  const cb = vm.runInContext('colorDeFamilia(' + JSON.stringify(b) + ')', dark);
  chk(a + ' y ' + b + ' comparten color', ca !== null && ca === cb);
});
chk('matemáticas e idiomas se distinguen', vm.runInContext('colorDeFamilia("Métodos Matemáticos I")', dark) !== vm.runInContext('colorDeFamilia("Inglés II")', dark));
const inv = vm.runInContext('colorEstable("Ramo Que No Existe")', dark);
chk('un ramo desconocido recibe un color de la paleta', pal.includes(inv));
chk('un ramo desconocido recibe un color estable', inv === vm.runInContext('colorEstable("Ramo Que No Existe")', dark));

console.log('\n=== La malla no pierde legibilidad por la identidad ===');
const MALLAS = [vm.runInContext('MALLA', dark), vm.runInContext('MALLA_UC', dark)];
let choques = 0, sinFamilia = 0, totalRamos = 0;
const vistos = new Set();
MALLAS.forEach(m => Object.values(m).forEach(sems => Object.values(sems).forEach(ramos => {
  if (ramos.length <= pal.length) {
    vm.runInContext('S={ramos:[]}', dark);
    const usados = ramos.map(r => {
      const color = vm.runInContext('nextRamoColor(' + JSON.stringify(r) + ')', dark);
      vm.runInContext('S.ramos.push({color:' + JSON.stringify(color) + '})', dark);
      return color;
    });
    if (new Set(usados).size !== usados.length) choques++;
  }
  ramos.forEach(r => {
    if (vistos.has(r)) return;
    vistos.add(r); totalRamos++;
    if (!vm.runInContext('colorDeFamilia(' + JSON.stringify(r) + ')', dark)) sinFamilia++;
  });
})));
chk('ningún semestre con hasta nueve ramos repite color', choques === 0);
chk('todos los ramos del catálogo tienen una familia', sinFamilia === 0);
console.log('  ' + (totalRamos - sinFamilia) + '/' + totalRamos + ' con familia; ' + choques + ' semestres con repetidos');

console.log('\n=== Monogramas: universidad sin tema propio ===');
const glyphs = vm.runInContext('TENANT_GLYPHS', dark);
chk('registro de glifos vacío (no hay símbolos inventados)', Object.keys(glyphs).length === 0);
TENANT_CODES.forEach(code => {
  const mark = vm.runInContext('tenantMark(' + JSON.stringify(code) + ')', dark);
  chk(code + ' renderiza su sigla', mark.includes('tenant-mono') && !mark.includes('<svg'));
});

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
