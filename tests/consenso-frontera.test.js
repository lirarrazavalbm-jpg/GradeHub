// El consenso es la única puerta por la que entra texto escrito por otra
// persona a la ficha de un estudiante.
//
// El render escapa, así que no se ejecuta nada. Este archivo cubre lo otro: lo
// que se puede hacer SIN ejecutar nada. Un carácter de anulación bidireccional
// da vuelta el resto de la línea, los de ancho cero no se ven pero cuentan, y
// un `min` fuera de escala toparía la nota final de alguien que nunca pidió esa
// pauta. La validación del SQL ya cubre parte de esto; se repite acá porque
// vive en otro archivo y se puede cambiar sin que nadie mire este.
//
// Los caracteres invisibles van como escapes \uXXXX a propósito: pegados de
// verdad, este archivo sería imposible de revisar en un diff.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const src = ['data.js', 'engine.js', 'app.js', 'render-main.js', 'render-agenda.js']
  .map(f => fs.readFileSync(raiz + f, 'utf8')).join('\n');

const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => stub, createElement: () => stub, addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '', hash: '' }, setTimeout, clearTimeout, console,
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const val = n => vm.runInContext(n, ctx);
const limpiar = val('limpiarNombreAjeno'), pauta = val('pautaDeConsenso'), esc = val('esc');
const NOMBRE_MAX = val('NOMBRE_MAX');

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

console.log('\n=== Caracteres que no se ven pero hacen daño ===');
chk('el override bidireccional se va', limpiar('Solemne\u202E1 etnemeloS') === 'Solemne1 etnemeloS');
chk('los aislantes bidi también', limpiar('\u2066Solemne\u2069 1') === 'Solemne 1');
chk('las marcas de dirección igual', limpiar('Sol\u200Femne') === 'Solemne');
chk('el ancho cero se va', limpiar('Sol\u200Bem\u200Dne') === 'Solemne');
chk('el BOM se va', limpiar('\uFEFFSolemne') === 'Solemne');
chk('los de control se van', limpiar('Solemne\u0007\u001B 1') === 'Solemne 1');
chk('los saltos de línea no rompen la ficha en dos', limpiar('Solemne\n\n1\r\n2') === 'Solemne 1 2');
chk('el espacio duro se normaliza', limpiar('Solemne\u00A0\u00A0 1') === 'Solemne 1');

console.log('\n=== Largo ===');
chk('un nombre normal no se toca', limpiar('Solemne 1') === 'Solemne 1');
chk(`se corta en NOMBRE_MAX (${NOMBRE_MAX})`, limpiar('a'.repeat(300)).length === NOMBRE_MAX);
chk('el SQL deja pasar 120 y acá se acotan al límite propio de la app',
  limpiar('b'.repeat(120)).length === NOMBRE_MAX);
chk('cortar no parte un emoji en dos',
  !/\uFFFD/.test(limpiar('x'.repeat(NOMBRE_MAX - 1) + '\u{1F600}\u{1F600}')) &&
  [...limpiar('x'.repeat(NOMBRE_MAX - 1) + '\u{1F600}\u{1F600}')].length === NOMBRE_MAX);
chk('un nombre que era solo basura invisible queda vacío', limpiar('\u200B\u202E   ') === '');

console.log('\n=== Una evaluación sin nombre real no entra ===');
{
  const p = pauta([{ nombre: '\u200B\u200B', peso: 40 }, { nombre: 'Examen', peso: 60 }]);
  chk('se descarta la vacía y entra la buena', p.categorias.length === 1 && p.categorias[0].nombre === 'Examen');
  chk('sin nombre tampoco', pauta([{ peso: 40 }]).categorias.length === 0);
  chk('null no explota', pauta([null, undefined]).categorias.length === 0);
}

console.log('\n=== Números fuera de rango no llegan al motor ===');
{
  const p = pauta([
    { nombre: 'A', peso: -50 }, { nombre: 'B', peso: 9999 }, { nombre: 'C', peso: 'hola' },
  ]);
  chk('un peso negativo queda en 0', p.categorias[0].peso === 0);
  chk('un peso enorme se topa en 100', p.categorias[1].peso === 100);
  chk('un peso que no es número queda en 0', p.categorias[2].peso === 0);

  chk('una compuerta fuera de la escala 1-7 no se crea',
    pauta([{ nombre: 'Examen', peso: 40, min: 99, cap: 3.9 }]).gates.length === 0);

  const g2 = pauta([{ nombre: 'Examen', peso: 40, min: 3, cap: 99 }]);
  chk('un tope fuera de escala no topa la nota en cualquier cosa',
    g2.gates.length === 1 && g2.gates[0].cap === val('SIM_MIN'));

  const g3 = pauta([{ nombre: 'Examen', peso: 40, min: 3.5, cap: 3.9 }]);
  chk('una compuerta legítima sí entra', g3.gates.length === 1 && g3.gates[0].min === 3.5 && g3.gates[0].cap === 3.9);
  chk('y su nombre también viene limpio', g3.gates[0].nombre === 'Examen');

  const s = pauta([{ nombre: 'A', peso: 10, slots: 1.5 }, { nombre: 'B', peso: 10, slots: 1e9 }, { nombre: 'C', peso: 10, slots: '3' }, { nombre: 'D', peso: 10, slots: 4 }]);
  chk('slots no entero se ignora', !s.categorias[0].slots);
  chk('slots gigante se ignora', !s.categorias[1].slots);
  chk('slots como texto se ignora', !s.categorias[2].slots);
  chk('slots legítimo entra', s.categorias[3].slots === 4);
}

console.log('\n=== Lo que NO se toca, a propósito ===');
{
  // Los signos de HTML no se filtran acá: el render escapa, y un ramo podría
  // llamarse "Economía < Política". Filtrar dos veces esconde cuál de las dos
  // capas está funcionando.
  const p = pauta([{ nombre: '<img src=x onerror=alert(1)>', peso: 100 }]);
  chk('un intento de XSS se guarda como texto', p.categorias[0].nombre === '<img src=x onerror=alert(1)>');
  chk('y el render lo deja inofensivo', !/<img/.test(esc(p.categorias[0].nombre)));
  chk('un nombre con acentos y signos legítimos sobrevive',
    limpiar('Economía & Política \u2014 Solemne N\u00B01') === 'Economía & Política \u2014 Solemne N\u00B01');
}

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
if (fail) process.exit(1);
