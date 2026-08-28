// El nombre de un preset NO es texto: es el vínculo entre un ramo YA GUARDADO y
// su pauta. `findPresetName` compara `normName(clave) === normName(r.nombre)` y
// nada más — no hay alias ni migración. Renombrar una clave deja huérfano a todo
// el que ya tenía ese ramo: se queda sin fechas oficiales, sin reglas y sin la
// estrella, y **nada falla**. El ramo simplemente deja de encontrar su programa.
//
// Ya pasó. "Principios de Ecología y Medio Ambiente" se renombró a "Principios
// Ecológicos y Medio Ambiente" al verificarlo contra BuscaCursos, que era lo
// correcto — el nombre oficial es ese. Lo que faltó fue mirar quién tenía el
// nombre viejo guardado. Esa vez era una cuenta; el próximo renombre puede ser
// cualquier número, y nadie se va a enterar.
//
// Por eso este test no juzga si un nombre está bien: solo obliga a que cambiarlo
// sea una decisión consciente. Si falla, no lo "arregles" pegando la clave nueva
// acá. Primero cuenta cuántas cuentas tienen la vieja:
//
//   select ramo->>'nombre', count(*)
//   from public.user_ramos r, jsonb_array_elements(r.data->'ramos') ramo
//   where ramo->>'nombre' = 'EL NOMBRE VIEJO'
//   group by 1;
//
// Con ese número se decide: si es cero, actualiza la lista y sigue. Si no, hace
// falta un alias o avisarles, porque renombrar es una migración de contenido y
// no una corrección de texto.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(raiz + 'data.js', 'utf8'), ctx);

let ok = 0, fail = 0;
function chk(nombre, cond) { if (cond) { ok++; console.log('  ok   ' + nombre); } else { fail++; console.log('  FAIL ' + nombre); } }

const ESPERADAS = {
  uc: [
  "Cálculo I",
  "Cálculo II",
  "Dinámica",
  "Econometría Aplicada",
  "Filosofía: ¿para qué?",
  "Ingeniería de Sistemas de Transporte",
  "Introducción a la Macroeconomía",
  "Introducción a la Programación",
  "Introducción al Álgebra Lineal",
  "Laboratorio de Dinámica",
  "Métodos de Optimización",
  "Principios Ecológicos y Medio Ambiente",
  "Probabilidad y Estadística",
  "Programación como Herramienta para la Ingeniería",
  "Química para Ingeniería",
  "Revelación y Fe",
  "Álgebra Lineal",
  ],
  fen: [
  "Comunicación",
  "Contabilidad",
  "Gestión de Personas",
  "Gestión y Empresas",
  "Inglés IV",
  "Introducción a la Economía",
  "Introducción a la Microeconomía",
  "Marketing",
  "Métodos Matemáticos I",
  "Métodos Matemáticos II",
  "Programación para Analítica de Datos",
  "Tecnología y Sistemas de Información",
  ],
};

['uc', 'fen'].forEach(tenant => {
  const reales = Object.keys(vm.runInContext(tenant === 'uc' ? 'PRESETS_UC' : 'PRESETS_FEN', ctx)).sort();
  const esperadas = ESPERADAS[tenant].slice().sort();
  const desaparecidas = esperadas.filter(k => !reales.includes(k));
  const nuevas = reales.filter(k => !esperadas.includes(k));
  console.log('=== ' + tenant.toUpperCase() + ' ===');
  chk('ninguna clave desapareci\u00f3 (renombrar deja ramos hu\u00e9rfanos)', desaparecidas.length === 0);
  if (desaparecidas.length) console.log('       ya no est\u00e1n: ' + desaparecidas.join(', '));
  // Agregar presets es lo normal y no rompe a nadie: solo se informa.
  if (nuevas.length) console.log('       nuevas (agr\u00e9galas a ESPERADAS): ' + nuevas.join(', '));
});

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
