// Cada universidad habla su idioma.
//
// En FEN las pruebas grandes se llaman Solemnes; en la UC son Interrogaciones,
// Pruebas o Controles. Un estudiante de Ingeniería UC que abre su ramo y ve
// "Solemne 1" sabe al tiro que la app no es para él — y deja de creerle también
// al número, que es lo único que la app tiene que comunicar sin error.
//
// No es paranoia: el editor de pauta ofrecía "3 solemnes + examen" a los
// estudiantes de la UC hasta que alguien lo notó. El vocabulario se filtra
// solo, porque quien escribe el código conoce una universidad y no la otra.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const app = fs.readFileSync(raiz + 'app.js', 'utf8');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(raiz + 'data.js', 'utf8'), ctx);
const val = n => vm.runInContext(n, ctx);

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

// Palabras que pertenecen a UNA universidad y no deben cruzarse.
// "Controles de lectura" dejó de pertenecer a una sola universidad: el
// programa UC LET202G-1 lo usa literalmente. Prohibirlo haría que el test
// fuerce a cambiar un nombre oficial; Solemne y Casos y ensayos sí siguen
// siendo vocabulario propio de FEN en los datos que conocemos.
const SOLO_FEN = /solemne|casos y ensayos/i;
const SOLO_UC = /interrogaci[oó]n/i;

const textoDe = x => JSON.stringify(x);

console.log('\n=== Los datos de la UC no usan palabras de FEN ===');
const UC = val('PRESETS_UC'), MALLA_UC = val('MALLA_UC'), CREDITOS_UC = val('CREDITOS_UC');
Object.entries(UC).forEach(([nombre, def]) => {
  const evals = (Array.isArray(def) ? def : def.evals || []).map(e => e[0]).join(' | ');
  chk(`preset UC "${nombre}" — ${evals.slice(0, 60)}`, !SOLO_FEN.test(evals));
});
const ramosUC = Object.values(MALLA_UC).flatMap(s => Object.values(s).flat());
chk(`los ${ramosUC.length} ramos de las mallas UC`, !ramosUC.some(r => SOLO_FEN.test(r)));
chk(`los ${Object.keys(CREDITOS_UC).length} ramos de la tabla de créditos UC`,
  !Object.keys(CREDITOS_UC).some(r => SOLO_FEN.test(r)));
// Las reglas declaradas también se le muestran al estudiante.
Object.entries(UC).forEach(([nombre, def]) => {
  if (Array.isArray(def)) return;
  const reglas = [...(def.noCalcula || []), ...(def.reglasDelCurso || [])].join(' ');
  if (reglas) chk(`reglas declaradas de "${nombre}"`, !SOLO_FEN.test(reglas));
});

console.log('\n=== Y los de FEN no usan palabras de la UC ===');
const FEN = val('PRESETS_FEN'), MALLA = val('MALLA');
Object.entries(FEN).forEach(([nombre, def]) => {
  const evals = (def.evals || []).map(e => e[0]).join(' | ');
  chk(`preset FEN "${nombre}"`, !SOLO_UC.test(evals));
});
const ramosFEN = Object.values(MALLA).flatMap(s => Object.values(s).flat());
chk(`los ${ramosFEN.length} ramos de las mallas FEN`, !ramosFEN.some(r => SOLO_UC.test(r)));

console.log('\n=== La interfaz separa los dos vocabularios ===');
// Se EJECUTAN las funciones en vez de leer su texto: son las que le ofrecen
// nombres al estudiante, y lo que importa es lo que devuelven. Un test que
// trocea el fuente se rompe cuando alguien renombra la función —pasó con
// `plantillaPrincipalPauta`, que hoy se llama `plantillasPauta`— y entonces
// deja de proteger justo cuando el código cambió.
const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
const appCtx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => stub, createElement: () => stub, addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '', hash: '' }, setTimeout, clearTimeout, console,
};
vm.createContext(appCtx);
vm.runInContext(['data.js', 'engine.js', 'app.js', 'render-agenda.js'].map(f => fs.readFileSync(raiz + f, 'utf8')).join('\n'), appCtx);
const llamar = (fn, arg) => vm.runInContext(fn, appCtx)(arg);

const sugUC = llamar('sugerenciasEvaluacion', 'uc');
const sugFEN = llamar('sugerenciasEvaluacion', 'fen');
chk(`a un estudiante UC no se le ofrece Solemne  (${sugUC.slice(0, 3).join(', ')}…)`,
  !sugUC.some(n => SOLO_FEN.test(n)));
chk(`a uno de FEN no se le ofrece Interrogación  (${sugFEN.slice(0, 3).join(', ')}…)`,
  !sugFEN.some(n => SOLO_UC.test(n)));
chk('las dos listas son distintas', JSON.stringify(sugUC) !== JSON.stringify(sugFEN));

const plUC = llamar('plantillasPauta', 'uc');
const plFEN = llamar('plantillasPauta', 'fen');
chk(`las plantillas de UC no dicen solemnes  (${plUC.map(p => p.label).join(' · ') || 'ninguna'})`,
  !plUC.some(p => SOLO_FEN.test(p.label)));
chk('las plantillas de FEN no dicen interrogaciones',
  !plFEN.some(p => SOLO_UC.test(p.label)));

console.log('\n=== Una universidad que no conocemos no hereda el idioma de otra ===');
// El default de sugerenciasEvaluacion era la lista de FEN, así que a cualquier
// universidad nueva le habrían aparecido "Solemne 1, Solemne 2". Con dos
// tenants visibles no se notaba; al agregar el tercero, sí — y es la señal más
// rápida de que la app no es para ti.
const neutro = llamar('sugerenciasEvaluacion', 'usach');
chk('no le ofrece el vocabulario de FEN', !neutro.some(s => /solemne/i.test(s)));
chk('ni el de la UC', !neutro.some(s => /interrogaci/i.test(s)));
chk('pero sí le ofrece algo utilizable', neutro.length > 3);
// mallaFor devolvía la malla de la FEN por defecto: un estudiante de otra
// universidad habría visto los ramos de Economía y Negocios de la Chile.
chk('tampoco hereda la malla de FEN', Object.keys(llamar('mallaFor', 'usach')).length === 0);
chk('y las dos que sí tenemos siguen intactas',
  Object.keys(llamar('mallaFor', 'fen')).length > 0 && Object.keys(llamar('mallaFor', 'uc')).length > 0);

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
