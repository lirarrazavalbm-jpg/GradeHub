// Al entrar a una cuenta UC, los SCT pendientes se consultan por las filas
// exactas que hacen falta. El archivo completo queda como respaldo de red: no
// es el camino normal para recuperar dos o tres créditos conocidos.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const source = ['data.js', 'engine.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n')
  + '\n' + fs.readFileSync(process.env.GRADEHUB_APP || path.join(root, 'app.js'), 'utf8');

function elemento(){
  const stub = {
    style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {},
    classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '',
    textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {},
    getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub },
    clientWidth: 400, dataset: {}, click() {},
  };
  return stub;
}

function nuevaApp(responder){
  const scripts = [], consultas = [], writes = [], stub = elemento();
  const ctx = {
    window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
    document: {
      getElementById: () => stub, createElement: elemento, addEventListener() {}, documentElement: stub,
      querySelector: () => Object.assign(elemento(), { src: 'app.js?v=prueba' }), querySelectorAll: () => [],
      body: stub, head: { appendChild: s => scripts.push(s) },
    },
    localStorage: { getItem() { return null }, setItem(k, v) { writes.push([k, v]) }, removeItem() {} },
    navigator: {}, location: { origin: '', pathname: '/', search: '', hash: '' }, history: { replaceState() {} },
    setTimeout, clearTimeout, console,
  };
  vm.createContext(ctx); vm.runInContext(source, ctx);
  const run = code => vm.runInContext(code, ctx);
  run('renderHome=()=>{};renderStats=()=>{};renderAgenda=()=>{};showTab=()=>{};applyTheme=()=>{};syncToCloud=()=>{};');
  ctx.__responder = responder; ctx.__consultas = consultas;
  run(`var supabaseClient={from(tabla){return {select(columnas){return {in(campo,valores){
    __consultas.push({tabla,columnas,campo,valores:Array.from(valores)});
    return Promise.resolve(__responder(campo,Array.from(valores)));
  }}}}}};`);
  return { run, scripts, consultas, writes };
}

const categoria = valor => [{ id: 'cat', nombre: 'Prueba', peso: 100, notas: [{ id: 'nota', nombre: 'Prueba', valor }] }];
const ramo = (id, nombre, extra = {}) => ({ id, nombre, creditos: null, origen: null, categorias: categoria(5), ...extra });
const filas = [
  { sigla: 'ZZZ100', nombre: 'Curso Sintético con Sigla', creditos: 10, busqueda: 'curso sintetico con sigla' },
  { sigla: 'XXX100', nombre: 'Taller Manual Único', creditos: 5, busqueda: 'taller manual unico' },
  { sigla: 'DUP100', nombre: 'Nombre Manual Repetido', creditos: 10, busqueda: 'nombre manual repetido' },
  { sigla: 'DUP200', nombre: 'Nombre Manual Repetido', creditos: 5, busqueda: 'nombre manual repetido' },
];

(async()=>{
  console.log('=== Créditos UC por filas exactas del servidor ===');
  let app = nuevaApp((campo, valores) => ({ data: filas.filter(f => valores.includes(f[campo])), error: null }));
  app.run(`S={tenant:'uc',onboardingDone:true,carrera:'ING-PC',ramos:[
    ${JSON.stringify(ramo('catalogo', 'Curso Sintético con Sigla', { sigla: 'ZZZ100', origen: { tenant: 'uc', carrera: 'ING-PC', ramoKey: 'ZZZ100' } }))},
    ${JSON.stringify(ramo('manual', 'Taller Manual Único'))},
    ${JSON.stringify(ramo('repetido', 'Nombre Manual Repetido'))}
  ],historial:[],sortMode:'manual'};`);
  app.run('showMainApp()');
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.deepStrictEqual(app.consultas.map(c => c.campo).sort(), ['busqueda', 'sigla']);
  assert.deepStrictEqual(Array.from(app.consultas.find(c => c.campo === 'sigla').valores), ['ZZZ100']);
  assert.deepStrictEqual(Array.from(app.consultas.find(c => c.campo === 'busqueda').valores).sort(), ['nombre manual repetido', 'taller manual unico']);
  assert.strictEqual(app.run("S.ramos.find(r=>r.id==='catalogo').creditos"), 10, 'completa por sigla');
  assert.strictEqual(app.run("S.ramos.find(r=>r.id==='manual').creditos"), 5, 'completa un nombre manual único');
  assert.strictEqual(app.run("S.ramos.find(r=>r.id==='repetido').creditos"), null, 'un nombre repetido queda pendiente');
  assert.strictEqual(app.scripts.length, 0, 'el camino exitoso no pide cursos-uc.js');

  console.log('=== El archivo queda como respaldo ===');
  app = nuevaApp(() => ({ data: null, error: { message: 'sin red' } }));
  app.run(`S={tenant:'uc',onboardingDone:true,carrera:'ING-PC',ramos:[
    ${JSON.stringify(ramo('catalogo', 'Curso Sintético con Sigla', { sigla: 'ZZZ100', origen: { tenant: 'uc', carrera: 'ING-PC', ramoKey: 'ZZZ100' } }))}
  ],historial:[],sortMode:'manual'};`);
  app.run('showMainApp()');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.strictEqual(app.scripts.length, 1, 'si falla el servidor pide el archivo');
  assert.strictEqual(app.scripts[0].src, 'cursos-uc.js?v=prueba');

  console.log('OK: créditos pendientes consultan solo sus filas y conservan el fallback');
})().catch(e=>{console.error(e);process.exit(1)});
