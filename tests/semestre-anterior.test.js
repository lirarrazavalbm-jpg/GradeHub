// Alguien que llega a GradeHub en cuarto semestre tiene tres años de notas que la
// app no vio. Sin poder cargarlos, su promedio de carrera empieza en blanco y la
// app le sirve la mitad: lleva el semestre en curso, pero no sabe cómo va.
//
// No se le piden las evaluaciones de cada ramo —nadie recuerda las ponderaciones
// de algo que cursó hace dos años— sino la nota final, que es lo único que sí
// tiene a mano. Se guarda como `avgOverride`, el mismo mecanismo con el que ya se
// corrige a mano el promedio de un ramo archivado.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const app=fs.readFileSync(process.env.GRADEHUB_APP||raiz+'app.js','utf8');
const render=fs.readFileSync(raiz+'render-main.js','utf8');
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

// La validación de escala se prueba de verdad, no por su texto: es lo único que
// separa un promedio correcto de uno con un 9,5 adentro.
const ctx={r2:v=>Math.round(v*100)/100};vm.createContext(ctx);
vm.runInContext((app.match(/function notaSemestreAnterior\(txt\)\{[\s\S]*?\n\}/)||[''])[0],ctx);
const nota=v=>vm.runInContext('notaSemestreAnterior('+JSON.stringify(v)+')',ctx);

console.log('=== La nota final se valida contra la escala ===');
chk('acepta una nota normal', nota('5.5')===5.5);
chk('acepta coma decimal, que es como se escribe acá', nota('5,5')===5.5);
chk('acepta los extremos', nota('1')===1 && nota('7')===7);
chk('rechaza sobre 7', nota('9.5')===null);
chk('rechaza bajo 1', nota('0.5')===null);
chk('rechaza lo que no es número', nota('abc')===null && nota('')===null);

console.log('\n=== El semestre se guarda como historial de verdad ===');
chk('se guarda el promedio final por ramo, no evaluaciones inventadas',
  /avgOverride:r\.valor/.test(app) && /categorias:\[\]/.test(app));
chk('entra al historial con su gpa', /S\.historial\.unshift\(\{[\s\S]{0,200}gpa:gpa\(ramos\)/.test(app));
// Un ramo sin nota no aporta al promedio: guardarlo lo dejaría en el historial
// como si estuviera pendiente de algo.
chk('solo se guardan los ramos con nota', /const conNota=notasValidasSemestreAnterior\(\)/.test(app));

console.log('\n=== Se puede llegar a la pantalla ===');
// Si el botón solo apareciera con historial existente, quien más lo necesita
// —el que llega sin ninguno— no lo vería nunca.
chk('el botón está en el historial y no depende de que ya haya semestres',
  /openSemestreAnteriorModal\(\)/.test(render) && /stats-hist-vacio/.test(render));
// Y también en Ajustes, que es donde alguien va a buscar "cómo registro lo que ya
// cursé" cuando no está mirando sus estadísticas.
chk('y también se llega desde Ajustes', /openSemestreAnteriorModal\(\)/.test(app));

console.log('\n=== Los botones de acción se ven clickeables ===');
// `--border` sobre `--muted` los dejaba fundidos con el fondo: se leían como un
// recuadro informativo. Es el borde más tenue de la paleta sobre el fondo casi
// igual al de la tarjeta.
const css=fs.readFileSync(raiz+'styles.css','utf8');
const regla=(css.match(/\.settings-data-actions button\{[^}]*\}/)||[''])[0];
chk('usan el borde marcado, no el tenue', /--border2/.test(regla) && !/1px solid var\(--border\)/.test(regla));
chk('y reaccionan al apuntar', /\.settings-data-actions button:hover/.test(css));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
