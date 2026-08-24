// GARANTÍA: si el onboarding deja avanzar, tiene que dejar terminar.
//
// El 2026-08-24 se descubrió que 69 de las 71 carreras de la UC completaban los
// cinco pasos y no podían crear su cuenta: el botón quedaba habilitado, se
// apretaba y no pasaba nada. `completeOnboarding` exigía el código de la malla
// mientras el paso 3 se conformaba con la carrera declarada por nombre. Dos
// condiciones distintas para la misma pregunta, y nadie se enteró porque el
// `return` no decía nada.
//
// Este test no comprueba ese caso: comprueba la PROPIEDAD que se violó, contra
// la lista real de carreras. Si mañana alguien agrega una condición nueva al
// final del embudo, o una carrera nueva sin malla, esto falla acá y no en
// producción.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const src = ['data.js', 'engine.js', 'app.js', 'render-agenda.js']
  .map(f => fs.readFileSync(raiz + f, 'utf8')).join('\n');

const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, clientHeight: 400, scrollTop: 0, dataset: {}, click() {}, closest() { return stub }, insertBefore() {}, removeChild() {}, remove() {}, getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 } }, children: [], firstElementChild: null, contains() { return false } };
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => stub, createElement: () => stub, addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '/', search: '', hash: '' },
  history: { replaceState() {} }, setTimeout, clearTimeout, console, gtag() {},
  requestAnimationFrame() { return 0 }, cancelAnimationFrame() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const run = n => vm.runInContext(n, ctx);

let ok = 0, fail = 0;
function chk(nombre, cond) { if (cond) { ok++; console.log('  ok   ' + nombre); } else { fail++; console.log('  FAIL ' + nombre); } }

// Elige la carrera EXACTAMENTE como lo hace initCarreraGrid: el código de malla
// si lo hay, y siempre el nombre declarado. Copiar ese par es el punto — si el
// grid cambia cómo lo guarda, este test tiene que cambiar con él.
function intentar(tenant, malla, nombreCarrera, sem) {
  stub.value = 'Estudiante de prueba';
  run('S=freshState()');
  run(`selectedTenant=${JSON.stringify(tenant)}`);
  run(`selectedCarrera=${JSON.stringify(malla || null)}`);
  run(`selectedCarreraNombre=${JSON.stringify(nombreCarrera)}`);
  run(`selectedSem=${sem || 1}`);
  run('obRamos=[]'); run('obStep=5');
  // La propiedad se calcula con obStepValid, que es lo que habilita cada botón.
  // A propósito NO se usa el ayudante nuevo: así este test también corre contra
  // un árbol que todavía no lo tiene, y ahí reporta las carreras atrapadas en
  // vez de reventar.
  let faltaAntes = 0;
  for (let paso = 1; paso <= run('OB_TOTAL'); paso++) if (!run(`obStepValid(${paso})`)) { faltaAntes = paso; break; }
  run('completeOnboarding()');
  return { faltaAntes, entro: run('S.onboardingDone') === true };
}

const tenants = run('Object.keys(TENANTS)');
console.log(`=== Toda carrera declarable puede terminar (tenants: ${tenants.join(', ')}) ===`);
let total = 0, atrapadas = [];
for (const t of tenants) {
  const carreras = run(`carrerasDeclarables(${JSON.stringify(t)})`);
  for (const c of carreras) {
    total++;
    const r = intentar(t, c.malla, c.n, 1);
    if (!r.entro) atrapadas.push(`${t}/${c.n}`);
    // La propiedad, dicha directo: si no falta ningún paso, tiene que entrar.
    if (r.faltaAntes === 0 && !r.entro) atrapadas.push(`${t}/${c.n} (los 5 pasos válidos y NO entró)`);
  }
}
chk(`las ${total} carreras declarables terminan el onboarding`, atrapadas.length === 0);
if (atrapadas.length) console.log('       atrapadas: ' + atrapadas.slice(0, 8).join(', ') + (atrapadas.length > 8 ? ` … y ${atrapadas.length - 8} más` : ''));

console.log('\n=== También quien escribe una carrera que no está en la lista ===');
chk('una carrera declarada a mano entra', intentar('uc', null, 'Programa nuevo que no existe en la lista', 3).entro);

console.log('\n=== En cualquier semestre ===');
const semestres = [1, 5, 11].map(s => intentar('uc', 'ING-PC', 'Ingeniería', s).entro);
chk('1°, 5° y 11° terminan igual', semestres.every(Boolean));

console.log('\n=== Y lo obligatorio sigue siendo obligatorio ===');
stub.value = '   ';
run('S=freshState()'); run('selectedCarrera=null'); run('selectedCarreraNombre="Enfermería"'); run('obRamos=[]');
chk('sin nombre, el paso 1 queda inválido', run('obStepValid(1)') === false);
run('completeOnboarding()');
chk('y no crea la cuenta', run('S.onboardingDone') !== true);
stub.value = 'Estudiante';
run('S=freshState()'); run('selectedCarrera=null'); run('selectedCarreraNombre="  "');
chk('sin carrera, el paso 3 queda inválido', run('obStepValid(3)') === false);

console.log('\n=== Y si algo falta, se dice: nunca un botón muerto ===');
// Esta es la mitad que convirtió el bug en invisible. Apretar el botón final con
// un paso sin responder tiene que DEVOLVER a ese paso, no quedarse callado.
stub.value = '';
run('S=freshState()'); run('selectedTenant="uc"'); run('selectedCarrera=null');
run('selectedCarreraNombre="Enfermería"'); run('selectedSem=1'); run('obRamos=[]');
run('obStep=5');
run('completeOnboarding()');
chk('devuelve al paso que falta en vez de no hacer nada', run('obStep') === 1);
chk('y no crea la cuenta a medias', run('S.onboardingDone') !== true);

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
