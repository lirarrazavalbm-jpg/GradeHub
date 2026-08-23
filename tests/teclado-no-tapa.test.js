// El teclado del teléfono no puede tapar la casilla que estás llenando.
//
// Salió de revisar los desplegables ramo por ramo (#177). Participación de
// "Programación como Herramienta para la Ingeniería" abre diez casillas —618px
// de alto—, así que casi cualquiera de ellas cae en la mitad de abajo de la
// pantalla, que es justo lo que el teclado ocupa. Se escribía a ciegas: sin ver
// la nota que estabas tecleando ni de qué evaluación era.
//
// Lo que hace falta comprobar acá son las dos mitades del arreglo:
//   1. que se le preste al contenedor el alto que el teclado tapó, porque un
//      campo que ya está al final del contenido no se puede subir con scroll:
//      no hay nada abajo contra lo que empujar, y ese es EL caso —la última
//      casilla es la que más se toca al ponerse al día;
//   2. que no se toque nada cuando el campo ya se ve, para no mover la pantalla
//      debajo de quien está escribiendo tranquilo.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const src = ['data.js', 'engine.js', 'app.js', 'render-agenda.js']
  .map(f => fs.readFileSync(raiz + f, 'utf8')).join('\n');

const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
const ctx = {
  window: { innerHeight: 812, addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => stub, createElement: () => stub, addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '', hash: '' }, setTimeout, clearTimeout, console,
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const val = n => vm.runInContext(n, ctx);

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

// Un campo a `bottom` px del borde de arriba, dentro de un contenedor con scroll.
function campo(bottom) {
  const cont = { className: 'scroll', style: {} };
  let subido = false;
  return {
    cont, subio: () => subido,
    el: {
      isConnected: true,
      getBoundingClientRect: () => ({ top: bottom - 44, bottom }),
      closest: sel => (sel.includes('scroll') ? cont : null),
      scrollIntoView: () => { subido = true; },
    },
  };
}
const conTeclado = alto => { ctx.window.visualViewport = { height: alto, offsetTop: 0, addEventListener() {} }; };

console.log('\n=== Con el teclado abierto ===');
conTeclado(512);                      // 812 de pantalla, 300 los tapa el teclado
chk('el alto tapado se calcula desde visualViewport', val('espacioTeclado')() === 300);

const tapado = campo(604);            // cae 92px dentro de la zona del teclado
val('asegurarVisibleSobreTeclado')(tapado.el);
chk('al contenedor se le presta el alto que el teclado tapó', tapado.cont.style.paddingBottom === '300px');
chk('y el campo se sube', tapado.subio());

// Sin el préstamo, un campo al final del contenido no tiene a dónde subir: el
// scroll ya está al máximo. Por eso el orden importa y se comprueba junto.
const visible = campo(300);           // bien arriba del teclado
val('asegurarVisibleSobreTeclado')(visible.el);
chk('un campo que ya se ve no se mueve', !visible.subio());

console.log('\n=== Sin teclado ===');
conTeclado(812);                      // el teclado se cerró: nada tapado
chk('no hay alto que prestar', val('espacioTeclado')() === 0);
const abajo = campo(790);             // cerca del borde, pero visible
val('asegurarVisibleSobreTeclado')(abajo.el);
chk('no se presta padding cuando no hace falta', !abajo.cont.style.paddingBottom);

console.log('\n=== Y el préstamo se devuelve ===');
// Si no, queda un hueco en blanco al final de la pantalla que nadie explica.
const cont1 = { style: { paddingBottom: '300px' } }, cont2 = { style: { paddingBottom: '300px' } };
ctx.document.querySelectorAll = sel => (sel.includes('scroll') ? [cont1, cont2] : []);
val('soltarEspacioTeclado')();
chk('todos los contenedores quedan como estaban', !cont1.style.paddingBottom && !cont2.style.paddingBottom);

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
