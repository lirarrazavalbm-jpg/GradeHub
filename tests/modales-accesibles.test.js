// Las etiquetas de los modales tienen que apuntar a su propio campo.
//
// Un `<label>` sin `for` es decorativo: el lector de pantalla anuncia el campo
// como "editar texto, en blanco" y el usuario no sabe qué le están pidiendo.
// Como los 33 modales siguen el mismo patrón —una `.modal-label` y después el
// campo—, la asociación se hace una vez al abrir y no plantilla por plantilla.
//
// Lo que se prueba acá es esa función, porque tiene la única decisión con
// filo: cuándo NO tocar una etiqueta. El resto del arreglo —que el modal se
// anuncie con su título y que el foco vuelva a quien lo abrió— son tres líneas
// cada uno y se verificaron en el navegador.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const src = ['data.js', 'engine.js', 'app.js', 'render-agenda.js']
  .map(f => fs.readFileSync(raiz + f, 'utf8')).join('\n');

const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => stub, createElement: () => stub, addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '', hash: '' }, setTimeout, clearTimeout, console,
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const etiquetar = vm.runInContext('etiquetarCamposDelModal', ctx);

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

// Nodos con lo justo que la función toca: atributos, hermano siguiente y
// búsqueda de un campo adentro.
const campo = id => ({ tagName: 'INPUT', id, esCampo: true, matches: s => s.includes('input'), querySelector: () => null });
const envoltorio = hijo => ({ tagName: 'DIV', matches: () => false, querySelector: () => hijo });
const etiqueta = (dentro) => {
  const l = { attrs: {}, dentro: dentro || null,
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    setAttribute(k, v) { this.attrs[k] = v; },
    querySelector() { return this.dentro; } };
  return l;
};
function modal(secuencia) {
  // `secuencia` es la lista de nodos tal como salen en el modal, en orden.
  secuencia.forEach((n, i) => { n.nextElementSibling = secuencia[i + 1] || null; });
  return { querySelectorAll: () => secuencia.filter(n => n.attrs && !n.getAttribute('for')) };
}

console.log('\n=== La etiqueta toma el campo que le sigue ===');
const nombre = campo('m-cat-name'), fecha = campo('m-cat-fecha');
const lNombre = etiqueta(), lFecha = etiqueta();
etiquetar(modal([lNombre, envoltorio(nombre), lFecha, envoltorio(fecha)]));
chk('Nombre apunta al campo de nombre', lNombre.getAttribute('for') === 'm-cat-name');
chk('Fecha apunta al campo de fecha', lFecha.getAttribute('for') === 'm-cat-fecha');

console.log('\n=== La que ya envuelve su campo se deja en paz ===');
// Ésta es la que importa: la etiqueta del checkbox "Son varias notas" contiene
// su input, así que ya está asociada por anidamiento. Sin la guarda se llevaba
// un `for` al campo SIGUIENTE —la fecha—, y eso es peor que no etiquetar: el
// lector anuncia el campo equivocado con toda seguridad. Fue un bug real de
// este mismo arreglo, visto en el navegador antes de mergear.
const checkbox = campo('');
const lCheck = etiqueta(checkbox), lFecha2 = etiqueta(), fecha2 = campo('m-fecha-2');
etiquetar(modal([lCheck, lFecha2, envoltorio(fecha2)]));
chk('la etiqueta anidada no recibe for', lCheck.getAttribute('for') === null);
chk('y la de al lado sigue tomando el suyo', lFecha2.getAttribute('for') === 'm-fecha-2');

console.log('\n=== Casos en que no hay nada que hacer ===');
const lSola = etiqueta();
etiquetar(modal([lSola]));
chk('una etiqueta sin campo detrás no revienta ni inventa un for', lSola.getAttribute('for') === null);
// El arnés de otros tests pasa un contenedor sin querySelectorAll: el modal se
// abre igual y no puede caerse por eso.
let explota = false;
try { etiquetar({}); etiquetar(null); } catch (e) { explota = true; }
chk('un contenedor incompleto no tumba la apertura del modal', !explota);

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
