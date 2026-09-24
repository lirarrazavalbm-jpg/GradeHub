// La ficha del ramo y Estadísticas tienen que responder lo mismo.
//
// Reportado por Lucas: "en estadísticas me dice que necesito algo para aprobar
// y cuando me meto al ramo me dice otra cosa". Y en el mismo rato: "en Lab de
// Dinámica me dice que voy aprobando y me queda 20% cuando en verdad llevo solo
// dos evaluaciones, lo está calculando como si llevara todos los informes y
// todos los controles".
//
// Las dos salían de lo mismo: la ficha tenía su propia fórmula escrita a mano
// que repartía POR CATEGORÍA. Una categoría con 6 casillas y una nota contaba
// como cerrada, así que:
//
//   · el porcentaje pendiente mentía — 20% cuando faltaban 15 de 17 casillas;
//   · la nota necesaria usaba el peso equivocado, y además apuntaba al 4,00
//     bruto en vez del 3,95 que redondea a 4,0 (#447), así que pedía una décima
//     más que Estadísticas para el mismo ramo;
//   · con todas las categorías tocadas, `pesoSinNotas` daba 0 y la ficha
//     dictaba "✕ Reprobado" a alguien que todavía podía aprobar.
//
// El comentario de `mostRiskyRamo` ya advertía de esta copia: se sacó una y
// quedó la otra. Este test renderiza la ficha DE VERDAD y lee su chip, porque
// comprobar una reimplementación del cálculo pasaría igual con el código viejo.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const src = ['data.js', 'engine.js', 'app.js', 'app-session.js', 'render-main.js', 'render-agenda.js']
  .map(f => fs.readFileSync(raiz + f, 'utf8')).join('\n');

function classList() { const c = new Set(); return { add(...x) { x.forEach(v => c.add(v)); }, remove(...x) { x.forEach(v => c.delete(v)); }, contains(v) { return c.has(v); } }; }
function el() {
  let html = ''; const attrs = {};
  const nodo = { style: { setProperty() {}, removeProperty() {} }, classList: classList(), children: [], textContent: '', value: '', dataset: {},
    addEventListener() {}, appendChild(h) { this.children.push(h); return h; }, setAttribute(k, v) { attrs[k] = String(v); }, removeAttribute(k) { delete attrs[k]; }, getAttribute(k) { return attrs[k] || null; },
    querySelector() { return nodo; }, querySelectorAll() { return []; }, focus() {}, select() {}, click() {}, remove() {}, clientWidth: 400 };
  Object.defineProperty(nodo, 'innerHTML', { get() { return html; }, set(v) { html = String(v); this.children = []; } });
  return nodo;
}
const ids = {}; const byId = id => ids[id] || (ids[id] = el());
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
  document: { getElementById: byId, createElement: el, addEventListener() {}, documentElement: el(), querySelector() { return el(); }, querySelectorAll() { return []; }, body: el() },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '/', hash: '' }, history: { replaceState() {} }, setTimeout, clearTimeout, console,
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const val = n => vm.runInContext(n, ctx);
let ok = 0, fail = 0;
const chk = (n, c) => { console.log(`  ${c ? 'OK  ' : 'FAIL'} ${n}`); if (c) ok++; else fail++; };

// Las pautas van escritas acá y no salen de presetRamo(): es un test de
// mecanismo, y el catálogo se edita a propósito todo el tiempo.
const pintar = cats => {
  ctx.__cats = cats;
  vm.runInContext(`
    S={...freshState(),tenant:'uc',onboardingDone:true,ramos:[{
      id:'r1',nombre:'Ramo',color:'#6d5dd3',creditos:10,origen:null,gates:[],categorias:__cats
    }]};
    currentRamoId='r1';
    renderRamo();
  `, ctx);
  return byId('ramo-min-chip').textContent;
};
const necesariaDeEstadisticas = () => (val('loQueFaltaPorRamo(S.ramos)')[0] || {}).necesita;

// La forma del laboratorio reportado: 17 casillas en tres categorías.
const laboratorio = () => ([
  { id: 'c1', nombre: 'Controles', peso: 10, slots: 5, notas: [{ id: 'n1', slot: 0, valor: 5.0, peso: 1 }] },
  { id: 'c2', nombre: 'Informes', peso: 70, slots: 6, notas: [{ id: 'n2', slot: 0, valor: 5.5, peso: 1 }] },
  { id: 'c3', nombre: 'Evaluación de pares', peso: 20, slots: 6, notas: [] },
]);

console.log('\n=== Cuánto falta se cuenta por casillas, no por categorías ===');
const chipLab = pintar(laboratorio());
chk(`el chip del laboratorio dice: "${chipLab}"`, !!chipLab);
chk('ya no anuncia el 20% de la única categoría intacta', !/falta 20%/.test(chipLab));
const pct = Number((chipLab.match(/falta (\d+)%/) || [])[1]);
chk('el porcentaje pendiente es la mayor parte del ramo', !Number.isNaN(pct) ? pct > 70 : true);

console.log('\n=== La ficha y Estadísticas dan el mismo número ===');
const casos = [
  ['3 pruebas de 20% con una nota + examen 40%', [
    { id: 'a', nombre: 'Pruebas', peso: 60, slots: 3, notas: [{ id: 'n1', slot: 0, valor: 4.0, peso: 1 }] },
    { id: 'b', nombre: 'Examen', peso: 40, notas: [] }]],
  ['1 prueba 30% con 5,0 + examen 70%', [
    { id: 'a', nombre: 'Prueba', peso: 30, notas: [{ id: 'n1', valor: 5.0, peso: 1 }] },
    { id: 'b', nombre: 'Examen', peso: 70, notas: [] }]],
];
casos.forEach(([nombre, cats]) => {
  const chip = pintar(cats);
  const enLaFicha = Number((chip.match(/Necesitas ([\d.,]+)/) || [])[1].replace(',', '.'));
  const crudo = necesariaDeEstadisticas();
  // Las dos pantallas muestran el MISMO número, y ese número se redondea hacia
  // arriba. Antes esto comparaba lo que dibuja la ficha contra el valor crudo
  // del motor —peras con manzanas— y pasaba de casualidad mientras los dos
  // redondeaban al más cercano.
  const enStats = Number(val('nfNecesaria')(crudo));
  chk(`${nombre} → ficha ${enLaFicha} · estadísticas ${enStats}`, enLaFicha === enStats);
  // Con el mismo margen que usa `nfNecesaria` para no inflar por ruido: el
  // motor devuelve cosas como 3.5000000000001 y eso no es una décima más.
  chk(`${nombre}: lo que muestra alcanza para el ${crudo.toFixed(3)} que pide el motor`,
    enLaFicha >= crudo - 1e-9);
});

console.log('\n=== Un ramo a medio llenar no está reprobado ===');
// Con todas las categorías tocadas, la fórmula vieja daba pesoSinNotas 0 y
// dictaba "✕ Reprobado". Todavía se puede aprobar, y hay un número que lo dice.
const chipMedias = pintar([
  { id: 'a', nombre: 'Controles', peso: 100, slots: 4, notas: [
    { id: 'n1', slot: 0, valor: 3.0, peso: 1 }, { id: 'n2', slot: 1, valor: 3.5, peso: 1 }] }]);
chk(`con 2 de 4 controles dice: "${chipMedias}"`, !/Reprobado/.test(chipMedias));
chk('y le dice qué nota necesita', /Necesitas/.test(chipMedias));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail ? 1 : 0);
