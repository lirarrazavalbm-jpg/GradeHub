// Verifica el sistema de temas: tokens completos, contraste WCAG, superficies
// distintas por universidad y semáforo constante.
const fs = require('fs'), vm = require('vm');
const h = fs.readFileSync(__dirname+'/../index.html', 'utf8');
const DATA = fs.readFileSync(__dirname+'/../data.js', 'utf8');
const ENGINE = fs.readFileSync(__dirname+'/../engine.js', 'utf8');
const APP = fs.readFileSync(__dirname+'/../app.js', 'utf8');
const AGENDA = fs.readFileSync(__dirname+'/../render-agenda.js', 'utf8');
// Mismo orden que index.html: datos, motor, interfaz y su render separado.
const src = DATA + '\n' + ENGINE + '\n' + APP + '\n' + AGENDA;
new vm.Script(src);
const css = fs.readFileSync(__dirname+'/../styles.css','utf8');
const o = (css.match(/\{/g) || []).length, c = (css.match(/\}/g) || []).length;
console.log('JS OK · CSS ' + o + '/' + c + (o === c ? ' OK' : ' MISMATCH'));

let ok = 0, fail = 0;
const chk = (n, cond) => { if (cond) ok++; else { fail++; console.log('  FAIL ' + n); } };

function lum(hex) {
  const cc = hex.replace('#', '');
  const v = [0, 2, 4].map(i => { let x = parseInt(cc.substr(i, 2), 16) / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
const ratio = (a, b) => { const L1 = lum(a), L2 = lum(b); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };

function ctxFor(dark) {
  const props = {};
  const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
  const ctx = {
    window: { addEventListener() {}, matchMedia: () => ({ matches: dark, addEventListener() {}, addListener() {} }) },
    document: {
      getElementById: () => stub, createElement: () => stub, addEventListener() {},
      documentElement: { style: { setProperty(k, v) { props[k] = v; }, removeProperty(k) { delete props[k]; } }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } },
      querySelector: () => stub, querySelectorAll: () => [], body: stub
    },
    localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
    navigator: {}, location: { origin: '', pathname: '', hash: '' }, setTimeout, clearTimeout, console,
    __props: props
  };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  return ctx;
}

const TEMAS = ['fen', 'uc', 'uai', 'uandes'];
const dark = ctxFor(true);
const P = dark.__props;
const reset = () => Object.keys(P).forEach(k => delete P[k]);

console.log('\n=== Tokens de acento (los 4 temas) ===');
TEMAS.forEach(t => {
  reset(); dark.applyTheme(t);
  ['--primary', '--primary-fg', '--primary-light', '--accent', '--secondary', '--green', '--yellow', '--red']
    .forEach(k => chk(t + ' define ' + k, /^#[0-9a-f]{6}$/i.test(P[k] || '')));
  console.log('  ' + t.toUpperCase().padEnd(7) + 'primary=' + P['--primary'] + '  secondary=' + P['--secondary']);
});

console.log('\n=== Superficies: cada tema tiene su propio matiz ===');
const firmas = {};
TEMAS.forEach(t => {
  reset(); dark.applyTheme(t);
  ['bg', 'bg2', 'card', 'border', 'border2', 'muted'].forEach(k => chk(t + ' define --' + k, /^#[0-9a-f]{6}$/i.test(P['--' + k] || '')));
  firmas[t] = ['bg', 'card', 'border'].map(k => P['--' + k]).join('|');
  console.log('  ' + t.toUpperCase().padEnd(7) + 'bg=' + P['--bg'] + ' card=' + P['--card'] + ' border=' + P['--border']);
});
const unicas = new Set(Object.values(firmas));
chk('los 4 temas tienen superficies distintas', unicas.size === 4);
console.log('  firmas únicas: ' + unicas.size + '/4');

console.log('\n=== Contraste sobre la card propia de cada tema ===');
TEMAS.forEach(t => {
  reset(); dark.applyTheme(t);
  const card = P['--card'], bg = P['--bg'];
  const rP = ratio(P['--primary'], bg), rC = ratio(P['--primary'], card);
  const rFg = ratio(P['--primary-fg'], P['--primary']);
  chk(t + ' acento vs bg ≥3', rP >= 3);
  chk(t + ' acento vs card ≥3', rC >= 3);
  chk(t + ' texto sobre acento ≥4.5', rFg >= 4.5);
  // Texto principal legible sobre la card del tema
  const rTxt = ratio('#eef3f8', card);
  chk(t + ' texto sobre card ≥7', rTxt >= 7);
  console.log('  ' + t.toUpperCase().padEnd(7) + 'acento/bg ' + rP.toFixed(2) + '  acento/card ' + rC.toFixed(2) + '  fg/acento ' + rFg.toFixed(2) + '  texto/card ' + rTxt.toFixed(1));
});

console.log('\n=== Semáforo idéntico en los 4 (es semántico) ===');
const sem = TEMAS.map(t => { reset(); dark.applyTheme(t); return [P['--green'], P['--yellow'], P['--red']].join('|'); });
chk('semáforo constante', new Set(sem).size === 1);
console.log('  ' + sem[0]);

console.log('\n=== En modo claro NO se aplican superficies oscuras ===');
const light = ctxFor(false);
const PL = light.__props;
TEMAS.forEach(t => {
  Object.keys(PL).forEach(k => delete PL[k]);
  light.applyTheme(t);
  const sinSuperficies = ['--bg', '--card', '--border'].every(k => !(k in PL));
  chk(t + ' no fuerza superficies en claro', sinSuperficies);
  chk(t + ' sí aplica acento en claro', /^#[0-9a-f]{6}$/i.test(PL['--primary'] || ''));
});
console.log('  los 4 dejan la base clara intacta y solo tiñen el acento');

console.log('\n=== Colores de ramo: identificadores, no decoración ===');
// La paleta anterior estaba teñida por tema (FEN: cuatro azules y tres dorados)
// y con seis ramos en pantalla ninguno se distinguía del de al lado. Esto
// verifica lo que aquella no cumplía: matices realmente separados.
function hue(hex) {
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.substr(i + 1, 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
const pal = vm.runInContext('COLORS', dark);
chk('la paleta es una sola, compartida por los 4 temas',
  TEMAS.every(t => vm.runInContext('THEMES["' + t + '"].chart', dark) === undefined));
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
console.log('  ' + pal.length + ' colores, separación mínima ' + minSep.toFixed(0) + '° (' + par + ')');

console.log('\n=== Color por familia de ramo ===');
// Un ramo nuevo arranca con el color de su familia: todos los Métodos
// Matemáticos comparten matiz, todos los Inglés otro. Si una familia devolviera
// un color fuera de la paleta, el ramo se vería distinto a todo lo demás.
const fams = vm.runInContext('FAMILIAS_COLOR', dark);
chk('toda familia usa un color de la paleta', fams.every(([, c]) => pal.includes(c)));
const ejemplos = [
  ['Métodos Matemáticos II', 'Métodos Matemáticos IV'],
  ['Inglés I', 'Inglés V'],
  ['Contabilidad', 'Contabilidad Financiera'],
];
ejemplos.forEach(([a, b]) => {
  const ca = vm.runInContext('colorDeFamilia(' + JSON.stringify(a) + ')', dark);
  const cb = vm.runInContext('colorDeFamilia(' + JSON.stringify(b) + ')', dark);
  chk(a + ' y ' + b + ' comparten color', ca !== null && ca === cb);
});
// Familias distintas no deberían confundirse entre sí
chk('matemáticas e idiomas se distinguen',
  vm.runInContext('colorDeFamilia("Métodos Matemáticos I")', dark) !==
  vm.runInContext('colorDeFamilia("Inglés II")', dark));
// Un ramo inventado igual recibe un color estable de la paleta
const inv = vm.runInContext('colorEstable("Ramo Que No Existe")', dark);
chk('un ramo desconocido recibe color de la paleta', pal.includes(inv));
chk('y siempre el mismo', inv === vm.runInContext('colorEstable("Ramo Que No Existe")', dark));
console.log('  ' + fams.length + ' familias, todas dentro de la paleta');

// El semáforo es semántico: un ramo no debe teñirse de un color que se lea
// como "aprobado" o "reprobado".
const SEM = ['#2ee6c8', '#ffc94d', '#ff5f7a'];
chk('ningún color de ramo choca con el semáforo',
  pal.every(c => SEM.every(s => Math.min(Math.abs(hue(c) - hue(s)), 360 - Math.abs(hue(c) - hue(s))) >= 10)));

console.log('\n=== Glifos: sin SVG registrado cae a la sigla ===');
const glyphs = vm.runInContext('TENANT_GLYPHS', dark);
chk('registro de glifos vacío (no hay símbolos inventados)', Object.keys(glyphs).length === 0);
TEMAS.forEach(t => {
  const mark = vm.runInContext('tenantMark("' + t + '")', dark);
  chk(t + ' renderiza sigla', mark.includes('tenant-mono') && !mark.includes('<svg'));
});
console.log('  los 4 muestran su sigla');

console.log('\n=== Tenant desconocido no rompe ===');
reset(); dark.applyTheme('no-existe');
chk('fallback con acento válido', /^#[0-9a-f]{6}$/i.test(P['--primary'] || ''));

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
