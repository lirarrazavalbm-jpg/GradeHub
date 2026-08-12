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
pautaUC('Principios de Ecología y Medio Ambiente','Prueba 1:25|Prueba 2:40|Prueba 3:35');
pautaUC('Laboratorio de Dinámica','Nota controles:10|Notas informes:70|Nota evaluación de pares:20');
pautaUC('Revelación y Fe','Evaluación 1:20|Evaluación 2:20|Evaluación 3:30|Examen final:30');
chk('Programación conserva sus tres fechas oficiales',
  evalsUC(UC['Introducción a la Programación']).slice(0,3).map(([, ,x])=>x.fecha).join('|')==='2026-09-24|2026-10-22|2026-12-10');
chk('Revelación y Fe conserva sus tres fechas oficiales',
  evalsUC(UC['Revelación y Fe']).slice(0,3).map(([, ,x])=>x.fecha).join('|')==='2026-09-07|2026-10-14|2026-11-16');
chk('Programación conserva la compuerta de evaluaciones principales',
  UC['Introducción a la Programación'].grupos[0].min===4&&UC['Introducción a la Programación'].grupos[0].cap===3.9);
chk('Laboratorio conserva el mínimo de evaluación de pares',
  evalsUC(UC['Laboratorio de Dinámica'])[2][2].min===4&&evalsUC(UC['Laboratorio de Dinámica'])[2][2].cap===3.9);
chk('Cálculo II conserva reglas sin inventar ponderaciones',
  evalsUC(UC['Cálculo II']).length===0&&UC['Cálculo II'].noCalcula.length===4&&UC['Cálculo II'].reglasDelCurso.length===4);
Object.entries(UC).forEach(([nombre, def]) => {
  if(Array.isArray(def))return;
  ['noCalcula','reglasDelCurso'].forEach(campo=>{
    if(!def[campo])return;
    chk(nombre+' · '+campo+' es una lista de textos',def[campo].every(r=>typeof r==='string'&&r.length>10));
  });
  if(def.noCalcula&&def.reglasDelCurso)chk(nombre+' · no repite reglas entre listas',!def.noCalcula.some(r=>def.reglasDelCurso.includes(r)));
  (def.grupos||[]).forEach(g=>chk(nombre+' · grupo '+g.nombre+' apunta a evaluaciones reales',g.evals.every(n=>evalsUC(def).some(([e])=>e===n))));
});

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
