// Los presets son ponderaciones oficiales transcritas de programas. Un error
// acá no lanza excepción: entrega un promedio equivocado que el estudiante
// cree y usa para decidir si da un examen.
const fs = require('fs'), vm = require('vm');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../data.js', 'utf8'), ctx);
const FEN = vm.runInContext('PRESETS_FEN', ctx);
const UC  = vm.runInContext('PRESETS_UC', ctx);
const evalsUC = def => Array.isArray(def) ? def : (def.evals || []);

let ok = 0, fail = 0;
const chk = (n, cond) => { if (cond) ok++; else { fail++; console.log('  FAIL ' + n); } };

console.log('\n=== Las ponderaciones suman 100% ===');
// Si no suman 100, el promedio queda mal escalado y nadie lo nota a simple vista.
Object.entries(FEN).forEach(([nombre, def]) => {
  const suma = def.evals.reduce((a, [, peso]) => a + peso, 0);
  chk(nombre + ' suma 100 (da ' + suma + ')', Math.abs(suma - 100) < 0.01);
});
Object.entries(UC).forEach(([nombre, def]) => {
  const evals=evalsUC(def);
  // Cálculo II tiene programa, pero no ponderaciones publicadas: no se completa
  // una suma plausible solo para que este test se vea verde.
  if(!evals.length)return;
  const suma = evals.reduce((a, [, peso]) => a + peso, 0);
  chk(nombre + ' suma 100 (da ' + suma + ')', Math.abs(suma - 100) < 0.01);
});
console.log('  ' + (Object.keys(FEN).length + Object.keys(UC).length) + ' ramos verificados');

console.log('\n=== Las compuertas son coherentes ===');
Object.entries(FEN).forEach(([nombre, def]) => {
  def.evals.forEach(([nom, , extra]) => {
    if (!extra) return;
    // Un mínimo sin tope no topa nada: la compuerta sería decorativa.
    if (typeof extra.min === 'number') chk(nombre + ' · ' + nom + ' tiene cap junto al min', typeof extra.cap === 'number');
    // Un tope por sobre el mínimo de aprobación no penalizaría nada.
    if (typeof extra.cap === 'number') chk(nombre + ' · ' + nom + ' topa bajo 4.0', extra.cap < 4.0);
    if (typeof extra.slots === 'number') chk(nombre + ' · ' + nom + ' slots > 1', extra.slots > 1);
  });
  (def.grupos || []).forEach(g => {
    chk(nombre + ' · grupo ' + g.nombre + ' apunta a evaluaciones reales',
      g.evals.every(e => def.evals.some(([n]) => n === e)));
  });
});

console.log('\n=== Reglas que el motor no calcula ===');
// No es documentación interna: se le muestra al estudiante, porque su promedio
// real puede diferir del que ve en la app.
let conAviso = 0;
Object.entries(FEN).forEach(([nombre, def]) => {
  if (Array.isArray(def.reglasDelCurso)) {
    chk(nombre + ' · reglasDelCurso es una lista de textos',
      def.reglasDelCurso.every(r => typeof r === 'string' && r.length > 10));
    // Una regla no puede estar en las dos listas: o es deuda nuestra o es del
    // curso. Si está en ambas, el estudiante ve el mismo texto dos veces con dos
    // promesas distintas.
    chk(nombre + ' · ninguna regla está en las dos listas',
      !(def.noCalcula || []).some(r => def.reglasDelCurso.includes(r)));
  }
  if (!def.noCalcula) return;
  conAviso++;
  chk(nombre + ' · noCalcula es una lista de textos',
    Array.isArray(def.noCalcula) && def.noCalcula.every(r => typeof r === 'string' && r.length > 10));
});
console.log('  ' + conAviso + ' de ' + Object.keys(FEN).length + ' ramos FEN declaran reglas no calculadas');

console.log('\n=== Programas UC transcritos ===');
const pautaUC=(nombre,esperada)=>chk(nombre+' conserva sus ponderaciones oficiales',
  evalsUC(UC[nombre]).map(([n,p])=>n+':'+p).join('|')===esperada);
pautaUC('Introducción a la Programación','Interrogación 1:15|Interrogación 2:20|Examen:30|Tarea 1:5|Tarea 2:5|Tarea 3:5|Nota de participación:16|Talleres de Inteligencia Artificial:4');
pautaUC('Principios Ecológicos y Medio Ambiente','Prueba 1:25|Prueba 2:40|Prueba 3:35');
pautaUC('Introducción al Álgebra Lineal','Interrogación 1:20|Interrogación 2:25|Interrogación 3:25|Examen:30');
pautaUC('Introducción a la Macroeconomía','C1:16|P1:22|P2:22|PP:10|Examen:30');
pautaUC('Probabilidad y Estadística','C1:8|P1:20|C2:8|P2:20|C3:8|Examen:30|Control sorpresa 1:2|Control sorpresa 2:2|Control sorpresa 3:2');
// Dinámica y su laboratorio son dos cursos con dos actas. Las evaluaciones de
// acá son la NFC del programa y suman 100 entre ellas: el 30% del laboratorio
// NO está en esta lista, entra por `aporta`. La equivalencia con la fórmula
// completa se comprueba en compuertas.test.js, contra ramoAvg.
pautaUC('Dinámica','Interrogación 1:25|Interrogación 2:25|Controles:20|Examen:30');
pautaUC('Laboratorio de Dinámica','Controles:10|Informes:70|Evaluación de pares:20');
// El vínculo es un dato, no un `if` de ramo en el código.
chk('Dinámica declara de dónde sale el 30% que le falta',
  UC['Dinámica'].aporta.ramo==='Laboratorio de Dinámica'&&UC['Dinámica'].aporta.peso===30&&UC['Dinámica'].aporta.min===4);
chk('el ramo que aporta existe en el registro', !!UC[UC['Dinámica'].aporta.ramo]);
pautaUC('Revelación y Fe','Evaluación 1:20|Evaluación 2:20|Evaluación 3:30|Examen final:30');
chk('Programación conserva sus tres fechas oficiales',
  evalsUC(UC['Introducción a la Programación']).slice(0,3).map(([, ,x])=>x.fecha).join('|')==='2026-09-24|2026-10-22|2026-12-10');
// El calendario 2026-2 publica el cierre de cada tarea, no su apertura: Agenda
// debe avisar la fecha límite, sin convertir tres hitos de inicio en pruebas.
chk('Programación conserva los cierres oficiales de sus tres tareas',
  evalsUC(UC['Introducción a la Programación']).slice(3,6).map(([, ,x])=>x&&x.fecha).join('|')==='2026-10-02|2026-10-27|2026-11-27');
chk('Revelación y Fe conserva sus tres fechas oficiales',
  evalsUC(UC['Revelación y Fe']).slice(0,3).map(([, ,x])=>x.fecha).join('|')==='2026-09-07|2026-10-14|2026-11-16');
chk('Principios Ecológicos conserva las tres evaluaciones de Biología 2026-2',
  UC['Principios Ecológicos y Medio Ambiente'].periodo==='2026-2' &&
  evalsUC(UC['Principios Ecológicos y Medio Ambiente']).map(([, ,x])=>x&&x.fecha).join('|')==='2026-09-01|2026-11-03|2026-12-01');
chk('Programación conserva la compuerta de evaluaciones principales',
  UC['Introducción a la Programación'].grupos[0].min===4&&UC['Introducción a la Programación'].grupos[0].cap===3.9);
// "La evaluación de pares es reprobatoria: si el promedio es menor a 4, serán
// reprobados con nota 3,9, independiente de su nota final en el curso."
const pares=evalsUC(UC['Laboratorio de Dinámica']).find(([n])=>n==='Evaluación de pares');
chk('la evaluación de pares conserva su mínimo reprobatorio', pares[2].min===4&&pares[2].cap===3.9);
// Las casillas salen de los programas: 3 controles de cátedra, y en el lab 5
// experimentos presenciales más un Lab 0 online (6 informes y 6 pares).
chk('la cátedra declara sus 3 controles',
  evalsUC(UC['Dinámica']).filter(([, ,x])=>x&&x.slots).map(([, ,x])=>x.slots).join('|')==='3');
chk('el laboratorio declara sus casillas',
  evalsUC(UC['Laboratorio de Dinámica']).filter(([, ,x])=>x&&x.slots).map(([, ,x])=>x.slots).join('|')==='5|6|6');
// Los pesos de Cálculo II salen del programa clase a clase, no del documento de
// normativa —ese es solo reglamento y no publica ninguna ponderación—.
pautaUC('Cálculo II','Interrogación 1:20|Interrogación 2:20|Interrogación 3:20|Examen:30|Laboratorio:10');
chk('Cálculo II conserva sus cuatro fechas oficiales',
  evalsUC(UC['Cálculo II']).slice(0,4).map(([, ,x])=>x.fecha).join('|')==='2026-08-31|2026-10-05|2026-11-02|2026-11-30');
// Son 3, igual que en Cálculo I. No sale del programa clase a clase —ahí dice
// "Laboratorio (10%)" y nada más—: lo confirmó Lucas.
chk('el Laboratorio de Cálculo II tiene sus 3 casillas',
  (evalsUC(UC['Cálculo II']).find(([n])=>n==='Laboratorio')||[])[2].slots===3);
// Ninguna regla visible puede ser de disciplina o formato: eso es reglamento de
// la universidad, es igual en todos los ramos y no cambia cómo se calcula nada.
const DISCIPLINA=/copia|torpedo|turnitin|plagio|lápiz pasta|legible|dispositivo|apunte no permitido|registras correctamente tu asistencia|comité de ética/i;
Object.entries(UC).forEach(([nombre,def])=>{
  if(Array.isArray(def))return;
  [...(def.noCalcula||[]),...(def.reglasDelCurso||[])].forEach(r=>
    chk(nombre+' · no muestra reglamento de disciplina',!DISCIPLINA.test(r)));
});
Object.entries(UC).forEach(([nombre, def]) => {
  if(Array.isArray(def))return;
  ['noCalcula','reglasDelCurso'].forEach(campo=>{
    if(!def[campo])return;
    chk(nombre+' · '+campo+' es una lista de textos',def[campo].every(r=>typeof r==='string'&&r.length>10));
  });
  if(def.noCalcula&&def.reglasDelCurso)chk(nombre+' · no repite reglas entre listas',!def.noCalcula.some(r=>def.reglasDelCurso.includes(r)));
  (def.grupos||[]).forEach(g=>chk(nombre+' · grupo '+g.nombre+' apunta a evaluaciones reales',g.evals.every(n=>evalsUC(def).some(([e])=>e===n))));
});

console.log('\n=== El período de la pauta ===');
// `periodo` es lo que le permite a la app saber que un semestre terminó: con él
// deja de precargar fechas viejas y le dice al estudiante de cuándo es la pauta.
// Sin él, la ficha dice "período sin confirmar", que es feo pero honesto.
//
// Por eso solo se declara cuando el programa transcrito lo dice. Lo que se fija
// acá es el formato: un período mal escrito no falla, se lee como
// "desconocido" y la pauta se comporta como si nadie hubiera puesto nada.
const PERIODO = /^\d{4}-[12]$/;
Object.entries(FEN).forEach(([nombre, def]) => {
  if (!def.periodo) return;
  chk(nombre + ' declara un período con forma AAAA-S (dice "' + def.periodo + '")', PERIODO.test(def.periodo));
});
Object.entries(UC).forEach(([nombre, def]) => {
  if (Array.isArray(def) || !def.periodo) return;
  chk(nombre + ' declara un período con forma AAAA-S', PERIODO.test(def.periodo));
});
// Una pauta con fechas fijas y sin período es la combinación que la cola quería
// evitar: en marzo de 2027 esas fechas siguen precargándose como si fueran de
// ahora, con la misma estrella de "pauta oficial" que todo lo demás.
const conFechasSinPeriodo = [];
[['FEN', FEN], ['UC', UC]].forEach(([t, P]) => {
  Object.entries(P).forEach(([nombre, def]) => {
    const evals = Array.isArray(def) ? def : (def.evals || []);
    const tieneFechas = evals.some(([, , extra]) => extra && extra.fecha);
    if (tieneFechas && !(!Array.isArray(def) && def.periodo)) conFechasSinPeriodo.push(t + ' · ' + nombre);
  });
});
chk('ninguna pauta trae fechas fijas sin decir de qué semestre son' +
  (conFechasSinPeriodo.length ? ' (' + conFechasSinPeriodo.join(', ') + ')' : ''),
  conFechasSinPeriodo.length === 0);

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
