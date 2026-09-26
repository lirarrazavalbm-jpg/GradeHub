// Un ramo escrito a mano que es exactamente un ramo del catálogo recupera sus
// créditos cuando llegan los ~660 KB.
//
// El camino que lo produce es el normal, no uno raro: durante el onboarding el
// catálogo completo todavía no bajó, así que buscar un electivo no encuentra
// nada y la persona escribe el nombre. Ese ramo nace con `origen:null` y
// `creditos:null`, y antes se quedaba así para siempre — la función que
// completa créditos exigía procedencia y lo saltaba en cada carga posterior.
//
// Por qué no es cosmético: el promedio general se pondera por créditos SOLO si
// todos los ramos con nota los tienen. Un electivo sin créditos arrastra la
// cuenta entera a promedio simple, que es otro número, sin que falle nada ni
// aparezca ningún error. El Reglamento del Estudiante UC define el promedio
// ponderado acumulado justamente como notas finales × créditos.
//
// El catálogo de acá es INVENTADO a propósito. Lo que se prueba es el
// mecanismo, y `cursos-uc.js` es justo lo que se edita todo el tiempo: atarle
// este test convertiría una corrección de contenido en un fallo lejano.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';

const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => stub, createElement: () => stub, addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '', hash: '' }, setTimeout, clearTimeout, console,
  // Viven en app-session.js y render-main.js, que no hacen falta para esto: lo
  // que se prueba es qué queda en el modelo, no qué se dibuja ni qué se sube.
  syncToCloud() {}, renderHome() {}, renderStats() {},
};
vm.createContext(ctx);
['data.js', 'engine.js', 'app.js', 'render-agenda.js'].forEach(f => vm.runInContext(fs.readFileSync(raiz + f, 'utf8'), ctx));

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

const S = vm.runInContext('S', ctx);
const completar = vm.runInContext('completarCreditosUCTrasCarga', ctx);
const creditosPorNombre = vm.runInContext('creditosUCPorNombreUnico', ctx);
const unRamo = (extra) => Object.assign({ id: 'r1', nombre: 'Taller de Cometas', creditos: null, origen: null, categorias: [], gates: [] }, extra);

S.tenant = 'uc'; S.onboardingDone = true;

// Antes de que lleguen los 660 KB no hay nada que completar, y eso está bien:
// no se inventa un número que todavía no tenemos.
S.ramos = [unRamo()];
chk('sin el catálogo cargado no completa nada', completar() === false && S.ramos[0].creditos === null);

// Llega el archivo grande. Catálogo inventado, con las tres formas que importan.
vm.runInContext(`var CURSOS_UC_FULL = [
  ['XXX100','Taller de Cometas',10],
  ['YYY200','Nombre Repetido',10],
  ['ZZZ300','Nombre Repetido',5],
  ['WWW400','Nombre Repetido Que Concuerda',8],
  ['VVV500','Nombre Repetido Que Concuerda',8]
];`, ctx);

// El caso del reporte: ramo manual, nombre exacto de un ramo del catálogo.
S.ramos = [unRamo()];
const cambio = completar();
chk('un ramo manual recupera sus créditos al llegar el catálogo', cambio === true && S.ramos[0].creditos === 10);
chk('pero NO se le inventa procedencia ni sigla', S.ramos[0].origen === null && !S.ramos[0].sigla);

// Un valor ya guardado no se corrige nunca, ni aunque difiera del catálogo:
// puede ser un convalidado, y es dato de la persona.
S.ramos = [unRamo({ creditos: 4 })];
completar();
chk('no pisa un valor que la persona ya tenía', S.ramos[0].creditos === 4);

// Dos siglas, mismo nombre, créditos distintos: no se adivina.
chk('un nombre repetido con créditos distintos devuelve null', creditosPorNombre('Nombre Repetido') === null);
S.ramos = [unRamo({ nombre: 'Nombre Repetido' })];
completar();
chk('y ese ramo se queda sin créditos en vez de recibir uno inventado', S.ramos[0].creditos === null);

// Repetido pero coincidente: ahí sí hay una respuesta, y es esa.
chk('un nombre repetido que concuerda sí resuelve', creditosPorNombre('Nombre Repetido Que Concuerda') === 8);

// Un nombre que no está en el catálogo se queda como está.
chk('un ramo que de verdad es propio no recibe nada', creditosPorNombre('Mi Ramo Inventado') === null);

// Un ramo de otra universidad no lo toca el catálogo UC.
S.ramos = [unRamo({ origen: { tenant: 'fen', carrera: 'ICO' } })];
completar();
chk('no completa ramos con procedencia de otra universidad', S.ramos[0].creditos === null);

// Y el camino que ya funcionaba sigue funcionando.
S.ramos = [unRamo({ origen: { tenant: 'uc', carrera: 'ING-PC' } })];
completar();
chk('el ramo con procedencia UC sigue completándose como antes', S.ramos[0].creditos === 10);

console.log(`\n${ok} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
