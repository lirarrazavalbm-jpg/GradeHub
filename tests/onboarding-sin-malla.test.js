// Terminar el onboarding no puede depender de tener malla.
//
// `completeOnboarding` exigía `selectedCarrera`, que es el CÓDIGO de la malla.
// Pero `initCarreraGrid` lo deja en null para toda carrera que no tenemos, y el
// paso 3 se da por válido con el nombre declarado (`selectedCarreraNombre`).
// Resultado: 69 de las 71 carreras de la UC —y Contador Auditor en FEN—
// completaban los cinco pasos, veían el botón "Continuar con N ramos"
// habilitado, lo apretaban y no pasaba absolutamente nada. Ese `return` sin
// mensaje es el bug entero: no fallaba, no avisaba, no dejaba entrar.
//
// El comentario de `initCarreraGrid` ya decía la intención — "una carrera nueva
// no puede dejar a alguien sin poder declararse en un paso obligatorio"—; la
// guarda de completeOnboarding la contradecía.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const src = ['data.js', 'engine.js', 'app.js', 'render-agenda.js']
  .map(f => fs.readFileSync(raiz + f, 'utf8')).join('\n');

const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, clientHeight: 400, scrollTop: 0, dataset: {}, click() {}, closest() { return stub }, insertBefore() {}, removeChild() {}, remove() {}, getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 } }, children: [], firstElementChild: null, contains() { return false } };
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => stub, createElement: () => stub, addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '/', search: '', hash: '' },
  history: { replaceState() {} }, setTimeout, clearTimeout, console, gtag(){},
  requestAnimationFrame(f){ return 0 }, cancelAnimationFrame(){}, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const run = n => vm.runInContext(n, ctx);

let ok = 0, fail = 0;
function chk(nombre, cond) { if (cond) { ok++; console.log('  ok   ' + nombre); } else { fail++; console.log('  FAIL ' + nombre); } }

function intentar({ tenant, carrera, nombreCarrera, ramos }) {
  stub.value = 'Lucas';
  run('S=freshState()');
  run(`selectedTenant=${JSON.stringify(tenant)}`);
  run(`selectedCarrera=${JSON.stringify(carrera)}`);
  run(`selectedCarreraNombre=${JSON.stringify(nombreCarrera)}`);
  run('selectedSem=1');
  run(`obRamos=${JSON.stringify((ramos || []).map(n => ({ nombre: n, manual: true })))}`);
  run('completeOnboarding()');
  return { entro: run('S.onboardingDone') === true, S: run('JSON.parse(JSON.stringify(S))') };
}

console.log('=== Una carrera sin malla puede terminar el onboarding ===');
const sinMalla = intentar({ tenant: 'uc', carrera: null, nombreCarrera: 'Enfermería', ramos: ['Anatomía'] });
chk('entra a la app declarando su carrera por nombre', sinMalla.entro);
chk('guarda el nombre declarado', sinMalla.S.carreraNombre === 'Enfermería');
chk('deja carrera en null: no le inventamos una malla', sinMalla.S.carrera === null);
chk('conserva el ramo que agregó a mano', sinMalla.S.ramos.length === 1);
chk('ese ramo queda sin pauta oficial, que es lo correcto sin malla',
  sinMalla.S.ramos[0].categorias.length === 0 && sinMalla.S.ramos[0].origen === null);

console.log('\n=== Contador Auditor, el caso de FEN ===');
chk('también entra', intentar({ tenant: 'fen', carrera: null, nombreCarrera: 'Contador Auditor' }).entro);

console.log('\n=== Y no se rompió el camino que ya funcionaba ===');
const conMalla = intentar({ tenant: 'uc', carrera: 'ING-PC', nombreCarrera: 'Ingeniería', ramos: [] });
chk('una carrera con malla sigue entrando', conMalla.entro);
chk('conserva su código de malla', conMalla.S.carrera === 'ING-PC');

console.log('\n=== Lo que sigue siendo obligatorio ===');
stub.value = '';
run('S=freshState()'); run('selectedCarrera=null'); run('selectedCarreraNombre="Enfermería"');
run('obRamos=[]'); run('completeOnboarding()');
chk('sin nombre no entra: el paso 1 sigue siendo obligatorio', run('S.onboardingDone') !== true);
stub.value = 'Lucas';
run('S=freshState()'); run('selectedCarrera=null'); run('selectedCarreraNombre="   "');
run('obRamos=[]'); run('completeOnboarding()');
chk('sin carrera declarada tampoco entra', run('S.onboardingDone') !== true);

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
