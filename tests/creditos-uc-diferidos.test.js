// El catálogo UC llega después de normalize(): la carga debe volver a mirar los
// ramos ya creados, sin pisar créditos escritos por alguien ni inventar los de
// otras universidades. Los datos del archivo diferido son un fixture sintético.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const source = ['data.js', 'engine.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n')
  + '\n' + fs.readFileSync(process.env.GRADEHUB_APP || path.join(root, 'app.js'), 'utf8');
const scripts = [], writes = [];
const stub = {
  style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {},
  classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '',
  textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {},
  getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub },
  clientWidth: 400, dataset: {}, click() {},
};
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
  document: {
    getElementById: () => stub, createElement: () => ({ ...stub }), addEventListener() {},
    documentElement: stub, querySelector: () => Object.assign(stub, { src: 'app.js?v=prueba' }),
    querySelectorAll: () => [], body: stub, head: { appendChild: s => scripts.push(s) },
  },
  localStorage: { getItem() { return null }, setItem(k, v) { writes.push([k, v]) }, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '/', search: '', hash: '' },
  history: { replaceState() {} }, setTimeout, clearTimeout, console,
};
vm.createContext(ctx); vm.runInContext(source, ctx);
vm.runInContext('renderHome=()=>{};renderStats=()=>{};renderAgenda=()=>{};showTab=()=>{};applyTheme=()=>{};syncToCloud=()=>{};', ctx);
const run = code => vm.runInContext(code, ctx);
const categoria = valor => [{ id: 'cat', nombre: 'Prueba', peso: 100, notas: [{ id: 'nota', nombre: 'Prueba', valor }] }];
const uc = { id: 'uc1', nombre: 'Principios Ecológicos y Medio Ambiente', creditos: null,
  origen: { tenant: 'uc', carrera: 'ING-PC', ramoKey: 'BIO143M' }, categorias: categoria(6) };
const conocido = { id: 'uc2', nombre: 'Otro ramo', creditos: 5,
  origen: { tenant: 'uc', carrera: 'ING-PC', ramoKey: 'OTR1000' }, categorias: categoria(4) };
const manual = { id: 'uc3', nombre: 'Principios Ecológicos y Medio Ambiente', creditos: 3,
  origen: null, categorias: [] };
const manualSinCreditos = { id: 'uc4', nombre: 'Principios Ecológicos y Medio Ambiente', creditos: null,
  origen: null, categorias: [] };
const uai = { id: 'uai1', nombre: 'Ramo UAI', creditos: null,
  origen: { tenant: 'uai', carrera: 'ING', ramoKey: 'BIO143M' }, categorias: [] };
const uandes = { id: 'uandes1', nombre: 'Ramo UAndes', creditos: null,
  origen: { tenant: 'uandes', carrera: 'ING', ramoKey: 'BIO143M' }, categorias: [] };
ctx.fixtures = [uc, conocido, manual, manualSinCreditos, uai, uandes];
run('S=normalize({ramos:[fixtures[4]],tenant:"uai",onboardingDone:true})');
run('showMainApp()');
run('S=normalize({ramos:[fixtures[5]],tenant:"uandes",onboardingDone:true})');
run('showMainApp()');
run('S=normalize({ramos:[fixtures[3]],tenant:"uc",onboardingDone:true})');
run('showMainApp()');
assert.strictEqual(scripts.length, 0, 'UAI, UAndes y un ramo UC manual no piden el catálogo completo');
run('S=normalize({ramos:fixtures,tenant:"uc",onboardingDone:true})');
assert.strictEqual(run('creditosDe("Principios Ecológicos y Medio Ambiente","uc")'), null,
  'el catálogo pequeño no tiene el crédito del caso reportado');
assert.strictEqual(run('S.ramos[0].creditos'), null, 'antes de cargar, el crédito sigue pendiente');
assert.strictEqual(run('gpaMode(S.ramos)'), 'simple');
assert.strictEqual(run('gpa(S.ramos)'), 5);

run('showMainApp()');
assert.strictEqual(scripts.length, 1, 'la app carga el catálogo al entrar si hay créditos UC pendientes');
assert.strictEqual(scripts[0].src, 'cursos-uc.js?v=prueba', 'conserva el sello del asset');
scripts[0].onerror();
assert.strictEqual(run('S.ramos[0].creditos'), null, 'un error de red no inventa créditos');
assert.strictEqual(writes.filter(([k]) => k === 'gradehub_v1').length, 0, 'el error de carga no guarda el estado');
run('showMainApp()');
assert.strictEqual(scripts.length, 2, 'una carga fallida se puede reintentar');
run('var CURSOS_UC_FULL=[["BIO143M","Principios Ecológicos y Medio Ambiente",10,0]]');
scripts[1].onload();
assert.strictEqual(run('creditosDe("Principios Ecológicos y Medio Ambiente","uc")'), 10,
  'el archivo diferido trae el crédito oficial');
assert.strictEqual(run('S.ramos[0].creditos'), 10, 'rellena el ramo UC ya normalizado');
assert.strictEqual(run('gpaMode(S.ramos)'), 'creditos', 'el promedio vuelve a ponderarse');
assert.ok(Math.abs(run('gpa(S.ramos)') - (6 * 10 + 4 * 5) / 15) < 1e-9);
assert.strictEqual(run('S.ramos[1].creditos'), 5, 'no altera un crédito existente');
assert.strictEqual(run('S.ramos[2].creditos'), 3, 'no toca ramos manuales');
assert.strictEqual(run('S.ramos[3].creditos'), null, 'no completa un ramo creado a mano');
assert.strictEqual(run('S.ramos[4].creditos'), null, 'no inventa créditos UAI');
assert.strictEqual(run('S.ramos[5].creditos'), null, 'no inventa créditos UAndes');
assert.strictEqual(writes.filter(([k]) => k === 'gradehub_v1').length, 1, 'persiste solo si encontró un crédito nuevo');
assert.strictEqual(JSON.parse(writes.find(([k]) => k === 'gradehub_v1')[1]).ramos[0].creditos, 10,
  'la próxima visita recupera el crédito sin depender del tiempo de carga');
ctx.otroUc = { ...uc, id: 'uc5', creditos: null, categorias: [] };
run('S.ramos.push(otroUc)');
run('showMainApp()');
assert.strictEqual(scripts.length, 2, 'no vuelve a pedir un catálogo ya cargado');
assert.strictEqual(run('S.ramos.at(-1).creditos'), 10, 'también completa al entrar si el archivo ya estaba cargado');
console.log('OK: créditos UC tardíos, promedio ponderado y datos anteriores intactos');
