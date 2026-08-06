// Verifica el sistema de temas: tokens completos, contraste WCAG, superficies
// distintas por universidad y semáforo constante.
const fs = require('fs'), vm = require('vm');
const h = fs.readFileSync(__dirname+'/../index.html', 'utf8');
const DATA = fs.readFileSync(__dirname+'/../data.js', 'utf8');
const APP = fs.readFileSync(__dirname+'/../app.js', 'utf8');
// Mismo orden que index.html: data.js define los const que app.js consume.
const src = DATA + '\n' + APP;
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
      documentElement: { style: { setProperty(k, v) { props[k] = v; }, removeProperty(k) { delete props[k]; } } },
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
  chk(t + ' acento vs bg ≥4.5', rP >= 4.5);
  chk(t + ' acento vs card ≥4.5', rC >= 4.5);
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
  chk(t + ' texto sobre acento en claro ≥4.5', ratio(PL['--primary-fg'], PL['--primary']) >= 4.5);
});
console.log('  los 4 dejan la base clara intacta y solo tiñen el acento');

console.log('\n=== Paletas de gráficos distintas entre temas ===');
const pals = {};
TEMAS.forEach(t => {
  const pal = vm.runInContext('THEMES["' + t + '"].chart', dark);
  chk(t + ' 8 colores únicos', pal.length === 8 && new Set(pal).size === 8);
  pals[t] = pal.join('|');
});
chk('las 4 paletas son distintas', new Set(Object.values(pals)).size === 4);
console.log('  4 paletas, 8 colores cada una, sin repetir');

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
