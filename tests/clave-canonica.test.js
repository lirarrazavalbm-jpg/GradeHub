// Un sinónimo declarado después no puede dejar los reportes viejos contando aparte.
//
// La clave de consenso se guarda en `origen.ramoKey` al crear el ramo, y
// claveReporte() la prefiere: así el ramo conserva su identidad aunque el
// estudiante le cambie el nombre. El costo es que un sinónimo agregado más
// tarde —como el de Métodos Cuantitativos— deja dos claves vivas para el mismo
// ramo, y sus reportes no suman entre sí. El consenso pide tres personas: dos
// grupos de dos no llegan nunca.
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

const normalizar = ramos => val(`normalize(${J({ ramos })})`).ramos;
const fen = (nombre, ramoKey, carrera) => ({
  id: 'a', nombre, categorias: [], gates: [],
  origen: { tenant: 'fen', carrera: carrera || 'IICG', ...(ramoKey ? { ramoKey } : {}) },
});

console.log('\n=== El ramo guardado antes del sinónimo se reagrupa ===');
{
  // Como quedó guardado en el teléfono de un estudiante de IICG antes de #262.
  const viejo = normalizar([fen('Métodos Cuantitativos', 'metodos cuantitativos')])[0];
  const nuevo = normalizar([fen('Métodos Cuantitativos I', null, 'IC')])[0];
  chk('la clave guardada se canoniza al cargar',
    viejo.origen.ramoKey === val(`ramoKey('Métodos Cuantitativos I','fen','IC')`));
  chk('y coincide con la del que lo cursa en IC', viejo.origen.ramoKey === nuevo.origen.ramoKey);
  chk('así los dos reportes caen en el mismo grupo',
    val(`claveReporte(${J(viejo)})`) === val(`claveReporte(${J(nuevo)})`));
}

console.log('\n=== Lo que la clave guardada protege sigue protegido ===');
{
  // Se guarda justamente para que el ramo conserve su identidad si el
  // estudiante le cambia el nombre. Canonizar no puede ser recalcular.
  const renombrado = normalizar([{ ...fen('Mate Cuanti (el del profe Pérez)'), origen: { tenant: 'fen', carrera: 'IICG', ramoKey: 'contabilidad' } }])[0];
  chk('un nombre editado por el estudiante no le cambia la clave',
    renombrado.origen.ramoKey === 'contabilidad');

  const sinSinonimo = normalizar([fen('Gestión de Personas I', 'gestion de personas i', 'IC')])[0];
  chk('una clave que no es sinónimo declarado no se toca',
    sinSinonimo.origen.ramoKey === 'gestion de personas i');
  chk('y sigue sin confundirse con la de Gestión de Personas',
    sinSinonimo.origen.ramoKey !== val(`ramoKey('Gestión de Personas','fen','IC')`));
}

console.log('\n=== Lo que ya funcionaba no se movió ===');
{
  const sinClave = normalizar([fen('Contabilidad', null)])[0];
  chk('un ramo sin clave guardada la sigue recibiendo',
    sinClave.origen.ramoKey === val(`ramoKey('Contabilidad','fen','IICG')`));
  chk('un ramo a mano sigue sin origen',
    normalizar([{ id: 'b', nombre: 'Electivo de cine', origen: null, categorias: [], gates: [] }])[0].origen === null);

  const MALLA_UC = val('MALLA_UC');
  const malas = [];
  for (const car in MALLA_UC) for (const s in MALLA_UC[car]) MALLA_UC[car][s].forEach(nombre => {
    const r = normalizar([{ id: 'u', nombre, categorias: [], gates: [], origen: { tenant: 'uc', carrera: car } }])[0];
    if (r.origen.ramoKey !== val(`ramoKey(${J(nombre)},'uc',${J(car)})`)) malas.push(`${car}/${nombre}`);
  });
  chk('ningún ramo UC cambió de clave', malas.length === 0 || !console.log('       ' + malas.join(', ')));
}

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
if (fail) process.exit(1);
