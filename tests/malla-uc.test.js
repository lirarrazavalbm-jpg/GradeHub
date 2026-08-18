// El plan común de Ingeniería UC entra a la malla SIN pautas: son 18 ramos que
// el estudiante carga solos y a los que después le pone sus evaluaciones.
//
// Lo que se verifica acá no es que los nombres sean lindos, sino las dos cosas
// que se rompen en silencio: que un ramo de la malla no traiga una pauta
// inventada, y que quien abra uno sin pauta oficial vea que la deuda es nuestra
// y no que a él le falta hacer algo.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const src = ['data.js', 'engine.js', 'app.js', 'render-agenda.js']
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

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

const MALLA_UC = val('MALLA_UC'), PRESETS_UC = val('PRESETS_UC'), presetRamo = val('presetRamo'), findPresetName = val('findPresetName'), reglasNoCalculadas = val('reglasNoCalculadas'), reglasDelCurso = val('reglasDelCurso'), claveUc = val('claveUc');
const pc = MALLA_UC['ING-PC'];
const todos = Object.values(pc).flat();

console.log('\n=== Plan común de Ingeniería UC ===');
chk('cubre los cuatro semestres del plan común', [1, 2, 3, 4].every(s => Array.isArray(pc[s]) && pc[s].length));
chk('son 18 ramos', todos.length === 18);
chk('ningún nombre repetido', new Set(todos).size === todos.length);
chk('ningún nombre vacío ni con espacios sueltos', todos.every(n => typeof n === 'string' && n === n.trim() && n.length > 2));

// Los del catálogo oficial C2022, verificados contra la API de la Escuela.
[['Cálculo I', 1], ['Álgebra Lineal', 1], ['Química para Ingeniería', 1], ['Desafíos de la Ingeniería', 1],
 ['Cálculo II', 2], ['Dinámica', 2], ['Introducción a la Programación', 2],
 ['Cálculo III', 3], ['Ecuaciones Diferenciales', 3], ['Termodinámica', 3], ['Introducción a la Economía', 3],
 ['Probabilidades y Estadística', 4], ['Electricidad y Magnetismo', 4],
].forEach(([nombre, sem]) => chk(`${nombre} está en ${sem}°`, (pc[sem] || []).includes(nombre)));

// Los laboratorios valen 0 créditos pero llevan nota: si se caen, al estudiante
// le falta un ramo que sí está cursando.
chk('los tres laboratorios están', todos.filter(n => /^Laboratorio de /.test(n)).length === 3);

console.log('\n=== Ingeniería Comercial UC: los ocho semestres comunes ===');
// La mención (Economía o Administración) recién separa la malla en IX y X, así
// que hasta 8° todos cursan lo mismo y todo eso es plan común.
const com = MALLA_UC['COM'];
const todosCom = Object.values(com).flat();
chk('cubre los ocho semestres comunes', [1,2,3,4,5,6,7,8].every(s => Array.isArray(com[s]) && com[s].length));
chk('no llega a 9° ni 10°: ahí la mención los separa', !com[9] && !com[10]);
chk('ningún nombre repetido', new Set(todosCom).size === todosCom.length);
[['Cálculo I',1],['Contabilidad',1],['Comportamiento Organizacional',1],
 ['Filosofía: ¿Para Qué?',2],['Introducción a la Macroeconomía',2],
 ['Econometría',4],['Microeconomía I',4],
 ['Empresas y Legislación',7],['Práctica Social',8],
].forEach(([n,s]) => chk(`${n} está en ${s}°`, (com[s]||[]).includes(n)));
// Lo que es una ELECCIÓN no es un ramo. El curso Filosófico sí entra porque el
// plan fija FIL2001; el Teológico es un área con muchos cursos posibles.
chk('no entran los optativos de profundización ni los electivos',
  !todosCom.some(n => /^OPR|Electivo|Teológico|Optativo/i.test(n)));
// La entrada anterior tenía un solo semestre y con dos ramos mal ubicados.
chk('Empresas y Legislación ya no está en 1°', !(com[1]||[]).includes('Empresas y Legislación'));

console.log('\n=== Ningún ramo de la malla trae una pauta inventada ===');
// La malla dice qué cursa el estudiante; la pauta dice cómo se calcula su nota.
// Meter una pauta sin el programa oficial sería inventar ponderaciones.
const conPauta = [...todos, ...Object.values(MALLA_UC['COM']).flat()].filter(n => presetRamo(n, 'uc', 'ING-PC'));
// Se resuelve por nombre normalizado, no por igualdad exacta: la malla escribe
// "Filosofía: ¿Para Qué?" y el registro 'Filosofía: ¿para qué?'. Exigir la
// clave idéntica acá fijaba justamente el bug que hacía que ese ramo se
// cargara vacío. Lo que importa sigue igual de firme: toda pauta que llegue a
// un ramo tiene que salir de PRESETS_UC y no de ninguna otra parte.
chk('los ramos sin programa oficial no traen pauta',
  conPauta.every(n => !!PRESETS_UC[claveUc(n)]));
chk('las pautas UC que existen siguen saliendo de PRESETS_UC',
  Object.keys(PRESETS_UC).length > 0);

console.log('\n=== Programas UC con reglas y fechas ===');
const programacion=presetRamo('Introducción a la Programación','uc','ING-PC');
chk('Programación carga fechas oficiales en la Agenda',
  programacion.categorias.slice(0,3).map(c=>c.fecha).join('|')==='2026-09-24|2026-10-22|2026-12-10');
chk('Programación carga la compuerta de evaluaciones principales',
  programacion.gates.some(g=>g.type==='group_min'&&g.min===4&&g.cap===3.9&&g.catIds.length===3));
// Dinámica y su laboratorio son dos ramos, y el vínculo viaja con la pauta.
const dinamica=presetRamo('Dinámica','uc','ING-PC');
const labDin=presetRamo('Laboratorio de Dinámica','uc','ING-PC');
chk('Dinámica carga el vínculo con su laboratorio',
  dinamica.aporta&&dinamica.aporta.ramo==='Laboratorio de Dinámica'&&dinamica.aporta.peso===30);
chk('el laboratorio carga el mínimo de la evaluación de pares',
  labDin.gates.some(g=>g.type==='min_grade_required'&&g.min===4&&g.cap===3.9));
const calculoOrigen={nombre:'Cálculo II',origen:{tenant:'uc',carrera:'ING-PC'}};
const calc2=presetRamo('Cálculo II','uc','ING-PC');
chk('Cálculo II carga su pauta del programa clase a clase',calc2&&calc2.categorias.length===5);
chk('y sus cuatro fechas van a la Agenda',
  calc2.categorias.slice(0,4).map(c=>c.fecha).join('|')==='2026-08-31|2026-10-05|2026-11-02|2026-11-30');
// Sigue sin declarar reglas: las de su normativa son sustituciones automáticas
// por inasistencia justificada y sanciones de disciplina, y ninguna pasa el
// filtro de "puedes hacer algo con esto".
chk('Cálculo II no declara reglas: ninguna pasaba el filtro',
  reglasNoCalculadas(calculoOrigen).length===0&&reglasDelCurso(calculoOrigen).length===0);

console.log('\n=== Ingeniería Comercial UC · segundo semestre ===');
[
  ['Introducción al Álgebra Lineal',4],
  ['Introducción a la Macroeconomía',5],
  ['Probabilidad y Estadística',9],
  ['Cálculo II',5],
].forEach(([nombre,cantidad])=>{
  const ramo=presetRamo(nombre,'uc','COM');
  chk(nombre+' carga su pauta',ramo&&ramo.categorias.length===cantidad);
});

console.log('\n=== El ramo sin pauta lo dice, y la deuda es nuestra ===');
const render = src.slice(src.indexOf('function renderRamo()'), src.indexOf('function renderRamo()') + 12000);
chk('distingue el ramo del catálogo del creado a mano', /const delCatalogo=/.test(render));
chk('al del catálogo le pide disculpas en vez de decirle "Sin evaluaciones"',
  /Todavía no tenemos la pauta de este ramo/.test(render) && /Disculpa/.test(render));
chk('al ramo manual le sigue diciendo Sin evaluaciones', /'Sin evaluaciones'/.test(render));
// El mensaje vive dentro del bloque de categorías vacías: en cuanto el
// estudiante agrega su primera evaluación, deja de renderizarse solo.
chk('el aviso desaparece con la primera evaluación',
  src.indexOf('if(r.categorias.length===0){') < src.indexOf('Todavía no tenemos la pauta de este ramo'));

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
