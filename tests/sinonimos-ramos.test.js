// El mismo ramo con dos nombres.
//
// IC cursa 'Métodos Cuantitativos I' y 'II'; IICG y CA cursan solo el primero
// y lo dejan sin número. Es el mismo MEC3005, y hasta acá el de IICG se
// quedaba sin créditos —lo que además apaga la ponderación por créditos del
// promedio general, que solo se aplica si TODOS los ramos los tienen—.
//
// Esto NO se deduce con una regla: la de "quítale el romano" vive en
// claveCatalogo() y se niega justamente acá, porque 'Gestión de Personas I' sí
// es otro ramo. Los pares se confirman uno por uno contra el código oficial.
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
const J = v => JSON.stringify(v);

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

const SIN = 'Métodos Cuantitativos', CON = 'Métodos Cuantitativos I';

console.log('\n=== Los dos nombres son el mismo ramo ===');
chk('el sin número ahora tiene créditos', val(`creditosDe(${J(SIN)},'fen')`) === 6);
chk('los mismos que el numerado', val(`creditosDe(${J(SIN)},'fen')`) === val(`creditosDe(${J(CON)},'fen')`));
chk('y el mismo código oficial',
  val(`CREDITOS_FEN[${J(SIN)}][1]`) === 'MEC3005' && val(`CREDITOS_FEN[${J(CON)}][1]`) === 'MEC3005');
chk('los dos dan la misma clave de consenso',
  val(`ramoKey(${J(SIN)},'fen','IICG')`) === val(`ramoKey(${J(CON)},'fen','IC')`));
chk('el canónico es el numerado, que es el que lleva el código',
  val(`sinonimoDe(${J(SIN)},'fen')`) === CON && val(`sinonimoDe(${J(CON)},'fen')`) === null);

console.log('\n=== Cada carrera sigue nombrándolo como su programa ===');
chk('IC lo tiene numerado en 5º', val(`MALLA.IC[5]`).includes(CON));
chk('IICG lo tiene sin número en 5º', val(`MALLA.IICG[5]`).includes(SIN));
chk('CA lo tiene sin número en 5º', val(`MALLA.CA[5]`).includes(SIN));

console.log('\n=== El sinónimo no abre la puerta a fusionar lo que no se debe ===');
chk('"Métodos Cuantitativos II" sigue siendo otro ramo',
  val(`sinonimoDe('Métodos Cuantitativos II','fen')`) === null &&
  val(`ramoKey('Métodos Cuantitativos II','fen','IC')`) !== val(`ramoKey(${J(CON)},'fen','IC')`));
['Gestión de Personas', 'Marketing', 'Finanzas', 'Comunicación'].forEach(base => {
  chk(`"${base}" y "${base} I/II" siguen con claves distintas`,
    val(`ramoKey(${J(base)},'fen','IC')`) !== val(`ramoKey(${J(base + ' I')},'fen','IC')`) &&
    val(`ramoKey(${J(base)},'fen','IC')`) !== val(`ramoKey(${J(base + ' II')},'fen','IC')`));
  chk(`y "${base}" no tiene sinónimo declarado`, val(`sinonimoDe(${J(base)},'fen')`) === null);
});

console.log('\n=== La tabla es de pares verificados, no de reglas ===');
{
  const SINONIMOS = val('SINONIMOS');
  const MALLA = val('MALLA');
  const normName = val('normName');
  const enMalla = new Set();
  for (const c in MALLA) for (const s in MALLA[c]) MALLA[c][s].forEach(n => enMalla.add(normName(n)));
  const malos = Object.entries(SINONIMOS.fen || {}).filter(([alias, canon]) =>
    !enMalla.has(normName(alias)) || !enMalla.has(normName(canon)));
  chk('los dos lados de cada par existen en alguna malla FEN', malos.length === 0 || !console.log('       ' + J(malos)));

  const CRED = val('CREDITOS_FEN');
  const sinCodigo = Object.entries(SINONIMOS.fen || {}).filter(([alias, canon]) => {
    const a = Object.keys(CRED).find(k => normName(k) === normName(alias));
    const b = Object.keys(CRED).find(k => normName(k) === normName(canon));
    return !a || !b || CRED[a][1] !== CRED[b][1];
  });
  chk('y comparten el código oficial del ramo', sinCodigo.length === 0 || !console.log('       ' + J(sinCodigo)));
}

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
if (fail) process.exit(1);
