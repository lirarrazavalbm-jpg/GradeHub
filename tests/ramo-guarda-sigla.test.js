// El ramo guarda su sigla y sus créditos, en vez de depender de las tablas.
//
// Las dos cosas se derivaban en cada render desde `data.js`, y eso falla en dos
// lugares distintos sin lanzar nada:
//
// - El catálogo completo de la UC se baja aparte, solo cuando alguien busca un
//   ramo. En la pantalla de inicio no está cargado, así que la sigla y los
//   créditos salían vacíos aunque los supiéramos. Reportado por Lucas el
//   2026-09-12 con "Principios Ecológicos y Medio Ambiente".
// - El servidor MCP no tiene `data.js`. Con el dato solo en las tablas, la app
//   mostraba "BIO143M" y el agente contestaba `sigla: null` para el mismo ramo,
//   verificado contra producción.
//
// Y la parte que NO puede cambiar: un ramo escrito a mano no recibe nada. Si
// alguien teclea "Dinámica", afirmar que es FIS1514 y no ICE1514 es inventar un
// dato, y hay dos Dinámicas reales en la UC.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const src = ['data.js', 'engine.js', 'app.js', 'render-agenda.js'].map(f => fs.readFileSync(raiz + f, 'utf8')).join('\n');

const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
const guardado = {};
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => stub, createElement: () => stub, addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
  localStorage: { getItem() { return null }, setItem(k, v) { guardado[k] = v; }, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '/', search: '', hash: '' }, history: { replaceState() {} },
  setTimeout, clearTimeout, console,
  // save() sincroniza con la nube, que vive en app-session.js y no es lo que
  // se prueba acá.
  syncToCloud() {}, renderAll() {},
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const run = n => vm.runInContext(n, ctx);

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

const normalize = run('normalize');
const delCatalogo = (nombre, extra = {}) => ({ id: 'r1', nombre, categorias: [], origen: { tenant: 'uc', carrera: 'ING-PC' }, ...extra });

console.log('=== Un ramo del catálogo recibe su sigla al cargar ===');
let r = normalize({ tenant: 'uc', ramos: [delCatalogo('Dinámica')] }).ramos[0];
chk('la sigla queda guardada en el ramo', r.sigla === 'FIS1514');
chk('y los créditos también', r.creditos === 10);

console.log('\n=== También los que solo existen como preset, que era el caso reportado ===');
r = normalize({ tenant: 'uc', ramos: [delCatalogo('Principios Ecológicos y Medio Ambiente')] }).ramos[0];
chk('Principios Ecológicos y Medio Ambiente → BIO143M', r.sigla === 'BIO143M');
r = normalize({ tenant: 'uc', ramos: [delCatalogo('Revelación y Fe')] }).ramos[0];
chk('Revelación y Fe → TTF012', r.sigla === 'TTF012');

console.log('\n=== Sin el catálogo completo cargado, que es como está el home ===');
chk('no hace falta cursos-uc.js para las dos de arriba', run('typeof CURSOS_UC_FULL') === 'undefined');

console.log('\n=== Lo escrito a mano no se toca ===');
r = normalize({ tenant: 'uc', ramos: [{ id: 'r2', nombre: 'Dinámica', categorias: [], origen: null }] }).ramos[0];
chk('un ramo sin origen de catálogo no recibe sigla', r.sigla === undefined || r.sigla === null);
chk('ni créditos', r.creditos == null);
r = normalize({ tenant: 'uc', ramos: [delCatalogo('Dinámica', { sigla: 'ICE1514' })] }).ramos[0];
chk('una sigla ya guardada manda sobre la tabla', r.sigla === 'ICE1514');
r = normalize({ tenant: 'uc', ramos: [delCatalogo('Dinámica', { creditos: 4 })] }).ramos[0];
chk('y un crédito escrito a mano también', r.creditos === 4);

console.log('\n=== Guardar sella lo que recién se pudo saber ===');
// El catálogo completo aparece a mitad de sesión —se baja al buscar—, así que
// el dato tiene que quedar escrito en ese momento y no en la próxima visita.
run(`S={...S,tenant:'uc',ramos:[{id:'r3',nombre:'Botánica',categorias:[],origen:{tenant:'uc',carrera:'ING-PC'}}]}`);
run('save()');
chk('sin catálogo, Botánica sigue sin sigla', run('S.ramos[0].sigla') == null);
run(`var CURSOS_UC_FULL=[['AAC101','Botánica',10]];`);
run('save()');
chk('cuando el catálogo llega, save() la guarda', run('S.ramos[0].sigla') === 'AAC101');
chk('y sus créditos', run('S.ramos[0].creditos') === 10);
chk('el estado guardado en disco la lleva', /AAC101/.test(guardado['gradehub_v1'] || ''));

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
