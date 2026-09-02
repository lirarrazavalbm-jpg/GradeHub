// Un ramo con pauta oficial no se toca solo, pero tampoco se calla.
//
// aplicarConsensoAuto() salta a propósito los ramos que ya tienen pauta: el
// programa manda sobre lo que reporten tres desconocidos. El costo es que el
// consenso se volvía invisible justo donde están casi todos los reportes —los
// 12 ramos CON pauta—, y ahí puede haber información que no tenemos: en
// Métodos Matemáticos I, cinco estudiantes reportaron la pauta de primavera
// mientras el catálogo sirve la de otoño.
//
// Así que se ofrece: se muestra entera, dice cuántos son, y decide el
// estudiante. Nunca se aplica sin que apriete.
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

// La pauta de primavera que reportaron los cinco de Métodos Matemáticos I.
const REPORTADA = [
  { nombre: 'Examen', peso: 40, min: 3, cap: 3.9 },
  { nombre: 'Solemne 1', peso: 20 },
  { nombre: 'Solemne 2', peso: 20 },
  { nombre: 'Solemne 3', peso: 20 },
];
const hit = { ramo: 'Métodos Matemáticos I', ramo_key: 'metodos matematicos i', estructura: REPORTADA, huella: 'x', respaldos: 5 };

// La pauta de partida va escrita acá y NO se saca del catálogo. Este test es
// sobre el mecanismo de adoptar un consenso, no sobre un ramo: cuando el
// catálogo cambió —#275 dejó Métodos Matemáticos I en cuatro evaluaciones— este
// archivo se cayó por indexar la quinta, con los dos PR verdes por separado y
// main rojo al juntarlos. Un test de mecanismo que depende de datos editables
// falla el día que alguien edita los datos, que es justo cuando más molesta.
const oficial = { categorias: [
  { id: 'c1', nombre: 'Control 1', peso: 15, notas: [], ponderaNotas: false, directNota: true },
  { id: 'c2', nombre: 'Control 2', peso: 15, notas: [], ponderaNotas: false, directNota: true },
  { id: 'c3', nombre: 'Control 3', peso: 15, notas: [], ponderaNotas: false, directNota: true },
  { id: 'so', nombre: 'Solemne', peso: 25, notas: [], ponderaNotas: false, directNota: true },
  { id: 'ex', nombre: 'Examen', peso: 30, notas: [], ponderaNotas: false, directNota: true },
], gates: [{ type: 'min_grade_required', catId: 'ex', min: 3, cap: 3.9, nombre: 'Examen' }] };

const nota = (id, valor) => ({ id, nombre: 'Nota', valor, peso: 1, fecha: null, hora: null, fechaQuitada: false });
const armar = () => {
  const r = {
    id: 'r1', nombre: 'Métodos Matemáticos I', origen: { tenant: 'fen', carrera: 'IC' },
    categorias: JSON.parse(JSON.stringify(oficial.categorias)), gates: oficial.gates, ausenciasJustificadas: [],
  };
  // Ya tiene notas puestas: una en un Control que la pauta reportada no
  // conserva, y otra en el Examen, que sí está en las dos.
  r.categorias.find(c => c.nombre === 'Control 1').notas = [nota('n1', 5.0)];
  r.categorias.find(c => c.nombre === 'Examen').notas = [nota('n2', 4.2)];
  r.pautaHuella = val(`huellaPauta(${J(val(`catsDePauta(${J(r.categorias)})`))})`);
  return r;
};

console.log('\n=== Adoptar la reportada ===');
{
  const r = armar();
  chk('la oficial y la reportada son distintas de verdad', oficial.categorias.length !== REPORTADA.length);
  chk('adoptar devuelve true', val('adoptarConsensoEnRamo')(r, hit) === true);
  chk('la pauta pasa a ser la reportada',
    J(r.categorias.filter(c => !c.fueraDePauta).map(c => [c.nombre, c.peso]).sort()) ===
    J(REPORTADA.map(c => [c.nombre, c.peso]).sort()));
  chk('trae su compuerta', r.gates.length === 1 && r.gates[0].min === 3 && r.gates[0].cap === 3.9);
  chk('queda marcada como reportada por estudiantes', r.consensoRespaldos === 5);

  const examen = r.categorias.find(c => c.nombre === 'Examen');
  chk('la nota de una evaluación que está en las dos se conserva',
    examen && examen.notas.length === 1 && examen.notas[0].valor === 4.2);

  const huerfana = r.categorias.find(c => c.fueraDePauta);
  chk('la nota de una que la nueva no tiene NO se borra',
    !!huerfana && huerfana.notas[0].valor === 5.0 && huerfana.peso === 0);
  chk('la huella sigue apuntando a la pauta que le dimos nosotros',
    r.pautaHuella === val(`huellaPauta(${J(oficial.categorias)})`));
  chk('así que cuenta como pauta corregida por él y se le pide compartirla',
    val(`pautaEditada(${J(r)})`) === true);
}

console.log('\n=== Nunca se aplica sola ===');
{
  const app = fs.readFileSync(raiz + 'app.js', 'utf8');
  const render = fs.readFileSync(raiz + 'render-main.js', 'utf8');
  chk('aplicarConsensoAuto sigue saltando los ramos con pauta oficial', /if\(pautaPendiente\(r\)\)return;/.test(app));
  chk('la ficha solo pinta el aviso', /pintarConsensoDisponible\(r\)/.test(render));
  chk('adoptar cuelga de un botón, no del render', /onclick="adoptarConsenso\(/.test(app));
  chk('el aviso dice que no sale del programa oficial', /No sale del programa oficial|No la sacamos del programa oficial/.test(app));
  chk('y dice cuántos son', /respaldos\} estudiantes/.test(app));
}

console.log('\n=== No se le pinta el aviso de un ramo sobre otro ===');
{
  const app = fs.readFileSync(raiz + 'app.js', 'utf8');
  chk('se comprueba que siga en el mismo ramo después del await', /currentRamoId!==r\.id\)return;/.test(app));
}

console.log('\n=== La pauta oficial sigue mandando cuando cambia ===');
{
  const r = armar();
  val('adoptarConsensoEnRamo')(r, hit);
  vm.runInContext(`S = ${J({ ...val('S'), tenant: 'fen', carrera: 'IC', ramos: [r] })}`, ctx);
  // Con la pauta reportada puesta, la huella ya no es la oficial: cambioDePauta
  // lo lee como "la editó" y no le ofrece nada sin preguntar. Su versión manda.
  chk('no se le pisa la pauta adoptada con la oficial', val(`cambioDePauta(S.ramos[0])`) === null);
}

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
if (fail) process.exit(1);
