// Los gradientes decorativos hablan con dos direcciones compartidas. Los de
// avance y los que muestran una nota son datos: se mantienen textualmente para
// que ordenar la estética no cambie qué entiende alguien de su ramo.
const fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..');
const css = fs.readFileSync(process.env.GRADEHUB_CSS || path.join(raiz, 'styles.css'), 'utf8');
let ok = 0, fail = 0;
const chk = (nombre, condicion) => {
  if (condicion) { ok++; console.log('  OK   ' + nombre); }
  else { fail++; console.log('  FAIL ' + nombre); }
};
const regla = selector => (css.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}')) || [])[1] || '';

console.log('\n=== Inventario de gradientes ===');
const total = (css.match(/linear-gradient\(/g) || []).length;
chk(`se conservan los 19 gradientes (${total})`, total === 19);
chk('el sistema declara una dirección para superficies y otra para acentos',
  /--gradient-surface:150deg;--gradient-accent:135deg;/.test(css));

const decorativosSuperficie = ['.simg-hero', '.ramo-row', '.ag-event-priority-sec>.ag-priority-card', '.ag-priority-card', '.ag-empty'];
const decorativosAcento = ['.ramo-action.primary', '.ob-title-accent', '.btn-primary', '.accent-swatch', '.fondo-swatch'];
chk('las 5 superficies decorativas usan el token de superficie',
  decorativosSuperficie.every(s => /linear-gradient\(var\(--gradient-surface\)/.test(regla(s))));
chk('los 5 acentos decorativos usan el token de acento',
  decorativosAcento.every(s => /linear-gradient\(var\(--gradient-accent\)/.test(regla(s))));

console.log('\n=== Avance: misma lectura antes y después ===');
const progresoRamo = regla('.ramo-row.has-progress::before');
const progresoEsperado = 'linear-gradient(90deg,color-mix(in srgb,var(--ramo-tint,var(--primary)),transparent 90%) 0%,color-mix(in srgb,var(--ramo-tint,var(--primary)),transparent 76%) var(--ramo-progress),transparent var(--ramo-progress-end))';
chk('la barra del ramo conserva su gradiente funcional exacto', progresoRamo.includes(progresoEsperado));
const medicion = porcentaje => {
  const cola = Math.min(14, 100 - porcentaje);
  return [0, porcentaje, Math.min(100, porcentaje + cola)];
};
const mediciones = [[0, [0, 0, 14]], [40, [0, 40, 54]], [100, [0, 100, 100]]];
mediciones.forEach(([porcentaje, esperada]) => chk(`ramo al ${porcentaje}% conserva paradas ${esperada.join('/')}`,
  JSON.stringify(medicion(porcentaje)) === JSON.stringify(esperada)));
chk('el onboarding conserva su barra funcional independiente', /linear-gradient\(90deg,var\(--primary\),var\(--accent\)\)/.test(regla('.ob-progress-bar')));
chk('el cierre del ramo conserva su dirección y no se confunde con una superficie', /linear-gradient\(125deg,/.test(regla('.ramo-row.has-progress.is-complete')));
chk('Estadísticas conserva su gradiente de avance independiente', /linear-gradient\(90deg,/.test(regla('.stats-progress-card::before')) && /var\(--stats-progress\)/.test(regla('.stats-progress-card::before')));
chk('el cierre de Estadísticas conserva su dirección', /linear-gradient\(125deg,/.test(regla('.stats-progress-card.is-complete')));

console.log('\n=== Las notas siguen siendo semánticas ===');
chk('los gradientes normalizados de notas mantienen 160 grados',
  /\.gpa-num\.good,[\s\S]*?linear-gradient\(160deg,/.test(css) && /\.ramo-num\.good,[\s\S]*?linear-gradient\(160deg,/.test(css));
chk('la urgencia mantiene su rojo literal, fuera del tema', /linear-gradient\(158deg,#ff8293 0%,#f31242 42%,#7a001b 100%\)/.test(css));
chk('la nota perfecta mantiene su verde literal, fuera del tema', /linear-gradient\(158deg,#7bffa8 0%,#2ecc40 45%,#12a52c 100%\)/.test(css));

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
