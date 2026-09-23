// El buscador tiene que encontrar el ramo con las palabras que usa la persona,
// no con las que usa el catálogo.
//
// Salió de un caso real: un estudiante de Comercial UAI, segundo semestre, dijo
// que tenía "matemática avanzada 2" y "razonamiento cuantitativo de datos 2".
// El catálogo los escribe "Matemáticas Avanzadas II" y "Razonamiento
// Cuantitativo con Datos II", y el buscador devolvía CERO resultados para los
// dos — estando ambos en su propia malla. De sus seis ramos encontraba dos.
//
// Dos defectos, independientes:
//   1. El nivel va en romano en el catálogo y en número cuando alguien lo
//      escribe. Nadie teclea romanos en el teléfono.
//   2. El calce por tokens exige que estén TODOS, así que una preposición
//      distinta —"de datos" contra "con datos"— borraba el ramo entero.
//
// El catálogo de acá es inventado: lo que se prueba es el mecanismo, y atarlo a
// `cursos-uc.js` o a las mallas convertiría una edición de contenido en un
// fallo lejano.
const fs = require('fs'), vm = require('vm'), path = require('path');
const raiz = path.join(__dirname, '..');
const appPath = process.env.GRADEHUB_APP || path.join(raiz, 'app.js');

const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => stub, createElement: () => stub, addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '', hash: '' }, setTimeout, clearTimeout, console,
};
vm.createContext(ctx);
for (const archivo of ['data.js', 'engine.js']) vm.runInContext(fs.readFileSync(path.join(raiz, archivo), 'utf8'), ctx, { filename: archivo });
vm.runInContext(fs.readFileSync(appPath, 'utf8'), ctx, { filename: 'app.js' });
const run = s => vm.runInContext(s, ctx);

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

run(`catalogRamosUniversidad=()=>[
  {nombre:'Matemáticas Avanzadas I',  sigla:'',semestre:1,propio:true,tienePreset:false},
  {nombre:'Matemáticas Avanzadas II', sigla:'',semestre:2,propio:true,tienePreset:false},
  {nombre:'Razonamiento Cuantitativo con Datos II',sigla:'',semestre:2,propio:true,tienePreset:false},
  {nombre:'Taller de Introducción a los Negocios', sigla:'',semestre:3,propio:true,tienePreset:false},
  {nombre:'Microeconomía I',          sigla:'',semestre:3,propio:true,tienePreset:false},
  {nombre:'Ética',                    sigla:'',semestre:4,propio:true,tienePreset:false}
];`);
const buscar = q => run(`searchCatalog(${JSON.stringify(q)},'uai','X',2)`).map(r => r.nombre);
const primero = q => buscar(q)[0] || null;

console.log('\n=== El nivel, en número o en romano ===');
chk('«matematicas avanzadas 2» encuentra el II', primero('matematicas avanzadas 2') === 'Matemáticas Avanzadas II');
chk('«matematicas avanzadas II» sigue encontrando el II', primero('matematicas avanzadas II') === 'Matemáticas Avanzadas II');
chk('«matematica avanzada 2», en singular, también', primero('matematica avanzada 2') === 'Matemáticas Avanzadas II');
chk('«micro 1» sigue encontrando Microeconomía I', primero('micro 1') === 'Microeconomía I');

console.log('\n=== Una preposición distinta no borra el ramo ===');
chk('«razonamiento cuantitativo de datos 2» encuentra el que dice «con»',
  primero('razonamiento cuantitativo de datos 2') === 'Razonamiento Cuantitativo con Datos II');
chk('«taller introduccion a los negocios», sin el «de»',
  primero('taller introduccion a los negocios') === 'Taller de Introducción a los Negocios');

console.log('\n=== Lo que NO debe pasar ===');
// Sin número, los dos niveles siguen apareciendo: la persona elige. Nunca se
// eligió uno en silencio, y no queremos empezar a hacerlo.
chk('sin número aparecen los dos niveles', (() => {
  const r = buscar('matematicas avanzadas');
  return r.includes('Matemáticas Avanzadas I') && r.includes('Matemáticas Avanzadas II');
})());
// Los enlaces se sacan de la CONSULTA, no del nombre del ramo. Si alguien
// escribe solo palabras de enlace no puede calzar con el catálogo entero.
chk('una consulta de puros enlaces no devuelve todo', buscar('de la').length < 6);
// Un token suelto no puede calzar por partes con cualquier cosa.
chk('«2» solo no arrastra todos los niveles', (() => {
  const r = buscar('2');
  return !r.includes('Microeconomía I') && !r.includes('Ética');
})());

console.log(`\n${ok} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
