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
const snapshot = () => ['--primary', '--primary-fg', '--primary-light', '--accent', '--secondary', '--green', '--yellow', '--red', '--bg', '--bg2', '--card', '--border', '--border2', '--muted'].map(k => P[k]).join('|');

console.log('\n=== Una identidad, sin importar la universidad ===');
const theme = vm.runInContext('GRADEHUB_THEME', dark);
chk('no queda registro THEMES por universidad', vm.runInContext('typeof THEMES', dark) === 'undefined');
chk('tiene todos los tokens de identidad', ['primary', 'primaryFg', 'primaryLight', 'darkPrimaryLight', 'accent', 'secondary', 'dark'].every(k => k in theme));
chk('el acento secundario es neutro y no compite con ramos', saturation(theme.accent) <= .15);
const firmas = TENANT_CODES.map(code => { reset(); dark.applyTheme(code); return snapshot(); });
chk('los cuatro tenants reciben exactamente los mismos tokens', new Set(firmas).size === 1);
chk('los cuatro tenants siguen existiendo como datos', TENANT_CODES.every(code => vm.runInContext('Boolean(TENANTS[' + JSON.stringify(code) + '])', dark)));
TENANT_CODES.forEach(code => {
  const badge = vm.runInContext('tenantBadge(' + JSON.stringify(code) + ')', dark);
  chk(code + ' conserva su monograma con el acento común', badge.includes('--tb:#3f7a30'));
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

console.log('\n=== Modo claro y oscuro siguen siendo decisiones separadas ===');
const light = ctxFor(false), PL = light.__props;
TENANT_CODES.forEach(code => {
  Object.keys(PL).forEach(k => delete PL[k]);
  light.applyTheme(code);
  chk(code + ' conserva la superficie clara del CSS', ['--bg', '--card', '--border'].every(k => !(k in PL)));
  chk(code + ' usa el tinte claro', PL['--primary-light'] === theme.primaryLight);
});
reset(); dark.applyTheme('uc');
chk('oscuro usa el tinte oscuro', P['--primary-light'] === theme.darkPrimaryLight);

console.log('\n=== Semáforo fijo y separado de la identidad ===');
const sem = TENANT_CODES.map(code => { reset(); dark.applyTheme(code); return [P['--green'], P['--yellow'], P['--red']].join('|'); });
chk('semáforo idéntico en todos los tenants', new Set(sem).size === 1);
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
chk('1.0 usa el rojo urgente, no el rojo regular', vm.runInContext('notaUrgente(1.0)&&getColor(1.0)==="hsl(352 100% var(--grade-urgent-light))"&&!notaUrgente(1.1)', dark));
chk('7.0 reserva un dorado para la nota perfecta', vm.runInContext('notaPerfecta(7.0)&&getColor(7.0)==="hsl(43 100% var(--grade-perfect-light))"&&!notaPerfecta(6.9)', dark));
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
const SEM = ['#2ee6c8', '#ffc94d', '#ff5f7a'];
chk('el acento no se confunde con un ramo', pal.every(c => Math.min(Math.abs(hue(c) - hue(theme.primary)), 360 - Math.abs(hue(c) - hue(theme.primary))) >= 21));
chk('el acento no se confunde con el semáforo', SEM.every(s => Math.min(Math.abs(hue(s) - hue(theme.primary)), 360 - Math.abs(hue(s) - hue(theme.primary))) >= 21));
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
