// El color identifica el ramo; la interacción solo corresponde a tarjetas que
// abren detalle. Un brillo del color del texto o una fila estática que reacciona
// se confunden con el gesto de Inicio.
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const css = fs.readFileSync(process.env.GRADEHUB_CSS || path.join(root, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const app = fs.readFileSync(process.env.GRADEHUB_APP || path.join(root, 'app.js'), 'utf8');
const agenda = fs.readFileSync(process.env.GRADEHUB_AGENDA || path.join(root, 'render-agenda.js'), 'utf8');
const shared = (css.match(/\.ag-priority-bar,\.ag-row>\.ag-row-bar\{([^}]*)\}/) || [])[1] || '';
assert.match(shared, /transform:scaleY\(\.6\)/, 'las dos líneas deben partir acortadas');
assert.match(shared, /transform-origin:center/, 'las dos líneas deben crecer hacia ambos extremos');
assert.match(shared, /transition:transform var\(--motion-fast\)/, 'las dos líneas usan la escala de movimiento');
assert.match(css, /\.ag-priority-bar\{inset:0 auto 0 0/, 'la prioridad dispone de toda la altura');
assert.match(css, /\.ag-row>\.ag-row-bar\{top:0;bottom:0/, 'la fila dispone de toda la altura');
for (const card of ['.ag-priority-card', '.ag-row']) {
  const hover = new RegExp(card.replace('.', '\\.') + ':hover>\\.ag-(?:priority|row)-bar');
  assert.match(css, hover, `${card} responde al cursor`);
  assert.match(css, /transform:scaleX\(1\.65\) scaleY\(1\)/);
  assert.match(css, /box-shadow:0 0 6px color-mix\(in srgb,var\(--ag-course\) 35%,transparent\)/,
    'el brillo toma el color del ramo, no el del texto');
  assert.match(css, new RegExp(card.replace('.', '\\.') + ':focus-visible>\\.ag-(?:priority|row)-bar'),
    `${card} responde también al foco de teclado`);
}
assert.doesNotMatch(css, /\.stats-curso-row:hover \.stats-curso-color/,
  'la comparación informativa no debe prometer una acción');
assert.match(css, /prefers-reduced-motion:reduce[\s\S]*?\.ag-priority-bar,\.ag-row>\.ag-row-bar\{[^}]*transition:filter/,
  'movimiento reducido conserva la transición luminosa');
assert.match(css, /prefers-reduced-motion:reduce[\s\S]*?\.ag-row:focus-visible>\.ag-row-bar[^}]*transform:scaleY\(\.6\)/,
  'movimiento reducido no alarga la línea');
assert.match(app, /class="ag-row \$\{e\.nivel\}"[^>]*style="--ag-course:\$\{esc\(e\.ramo\.color\)\}"/,
  'la evaluación pendiente lleva el color al elemento interactivo');
assert.match(agenda, /class="ag-row done"[^>]*style="--ag-course:\$\{esc\(e\.ramo\.color\)\}"/,
  'la evaluación rendida conserva el mismo gesto');
console.log('OK: líneas de Agenda interactivas, con color del ramo y movimiento reducido');
