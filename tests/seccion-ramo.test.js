// La sección del ramo es opcional y la escribe el estudiante al editarlo.
// Lo que no se puede romper: un ramo guardado antes no cambia, vaciar el campo
// quita la sección, y algo mal escrito se avisa en vez de borrarse en silencio.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const appPath = process.env.GRADEHUB_APP || raiz + 'app.js';

function elemento() {
  const atributos = {};
  return {
    style: { setProperty() {}, removeProperty() {} }, textContent: '', innerHTML: '', value: '', className: '', hidden: true,
    classList: { add() {}, remove() {}, contains() { return false } },
    addEventListener() {}, focus() { this.focused = true; }, select() {},
    setAttribute(k, v) { atributos[k] = String(v); }, removeAttribute(k) { delete atributos[k]; }, getAttribute(k) { return atributos[k] || null; },
    querySelector() { return null; }, querySelectorAll() { return []; }, appendChild() {}, remove() {}, dataset: {}, clientWidth: 400,
  };
}
function arnes() {
  const src = ['data.js', 'engine.js'].map(f => fs.readFileSync(raiz + f, 'utf8'))
    .concat(fs.readFileSync(appPath, 'utf8'), fs.readFileSync(raiz + 'app-session.js', 'utf8'), fs.readFileSync(raiz + 'render-agenda.js', 'utf8')).join('\n');
  const ids = {}; const get = id => ids[id] || (ids[id] = elemento());
  const stub = elemento();
  const ctx = {
    window: { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }) },
    document: { getElementById: get, createElement: elemento, addEventListener() {}, documentElement: { ...elemento(), style: { setProperty() {}, removeProperty() {} } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
    localStorage: { getItem() { return null }, setItem() {}, removeItem() {} }, navigator: {}, location: { origin: '', pathname: '', hash: '' },
    setTimeout: fn => fn(), clearTimeout() {}, requestAnimationFrame: fn => fn(), cancelAnimationFrame() {}, console,
  };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  // La ficha no se dibuja en este arnés: solo interesa qué quedó guardado.
  vm.runInContext('renderRamo=()=>{};closeModal=()=>{};track=()=>{};', ctx);
  return { ctx, el: get, val: c => vm.runInContext(c, ctx) };
}

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

const RAMO = { id: 'r1', nombre: 'Cálculo de prueba', color: '#2563eb', creditos: 10, categorias: [{ id: 'c1', nombre: 'Examen', peso: 100, notas: [{ id: 'n1', nombre: 'Examen', valor: 5.5 }] }], gates: [] };

console.log('\n=== Cuentas que ya existen ===');
{
  const { val } = arnes();
  const antes = val(`normalize({ramos:[${JSON.stringify(RAMO)}]}).ramos[0]`);
  chk('un ramo guardado sin sección carga con sección vacía', antes.seccion === null);
  chk('y conserva nombre, créditos y notas', antes.nombre === RAMO.nombre && antes.creditos === 10 && antes.categorias[0].notas[0].valor === 5.5);
  chk('su promedio no cambia', val(`ramoAvg(normalize({ramos:[${JSON.stringify(RAMO)}]}).ramos[0])`) ===
    val(`ramoAvg(normalize({ramos:[${JSON.stringify({ ...RAMO, seccion: 4 })}]}).ramos[0])`));
  chk('una sección guardada se conserva al recargar', val(`normalize({ramos:[${JSON.stringify({ ...RAMO, seccion: 4 })}]}).ramos[0].seccion`) === 4);
  chk('un valor que no es sección se descarta al cargar',
    [0, 1000, 3.5, '3', -1, null].every(v => val(`normalize({ramos:[${JSON.stringify({ ...RAMO, seccion: v })}]}).ramos[0].seccion`) === null));
}

console.log('\n=== Lo que se escribe ===');
{
  const { val } = arnes();
  chk('vacío es sin sección', val(`parseSeccion('')`) === null && val(`parseSeccion('   ')`) === null);
  chk('un número con espacios alrededor sirve', val(`parseSeccion(' 12 ')`) === 12 && val(`parseSeccion('999')`) === 999);
  chk('letras, cero o decimales no son una sección', ['3A', '0', '2.5', 'uno', '-1'].every(t => val(`parseSeccion(${JSON.stringify(t)})`) === undefined));
}

function editar(valor, seccionPrevia) {
  const k = arnes();
  k.val(`S=normalize({ramos:[${JSON.stringify({ ...RAMO, seccion: seccionPrevia })}]});currentRamoId='r1';modalColor='#2563eb';`);
  k.el('m-ramo-name').value = 'Nombre nuevo';
  k.el('m-ramo-creditos').value = '10';
  k.el('m-ramo-seccion').value = valor;
  const resultado = k.val('confirmEditRamo()');
  return { k, r: k.val('S.ramos[0]'), resultado };
}

console.log('\n=== Editar el ramo ===');
{
  const { r } = editar('3', null);
  chk('escribir la sección la guarda como número', r.seccion === 3 && r.nombre === 'Nombre nuevo');
}
{
  const { r } = editar('', 7);
  chk('vaciar el campo quita la sección', r.seccion === null && r.nombre === 'Nombre nuevo');
}
{
  const { k, r, resultado } = editar('3A', 7);
  chk('una sección mal escrita no guarda nada', resultado === false && r.seccion === 7 && r.nombre === RAMO.nombre);
  chk('y avisa en el campo', k.el('m-ramo-seccion').getAttribute('aria-invalid') === 'true' &&
    k.el('m-ramo-seccion').focused && k.el('m-ramo-seccion-error').hidden === false && /número/.test(k.el('m-ramo-seccion-error').textContent));
}
{
  const k = arnes();
  k.val(`S=normalize({ramos:[${JSON.stringify({ ...RAMO, seccion: 5 })}]});currentRamoId='r1';openModal=()=>{};renderModalColors=()=>{};openEditRamoModal();`);
  const html = k.el('modal-content').innerHTML;
  chk('el modal muestra la sección guardada y dice que es opcional',
    /id="m-ramo-seccion" value="5"/.test(html) && /Sección <span[^>]*>\(opcional\)/.test(html));
}

console.log('\n=== Ficha ===');
const render = fs.readFileSync(raiz + 'render-main.js', 'utf8');
chk('la ficha muestra la sección solo si hay una', /r\.seccion\?` · Sección \$\{r\.seccion\}`:''/.test(render));

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
