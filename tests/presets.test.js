// Los presets son ponderaciones oficiales transcritas de programas. Un error
// acá no lanza excepción: entrega un promedio equivocado que el estudiante
// cree y usa para decidir si da un examen.
const fs = require('fs'), vm = require('vm');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../data.js', 'utf8'), ctx);
const FEN = vm.runInContext('PRESETS_FEN', ctx);
const UC  = vm.runInContext('PRESETS_UC', ctx);

let ok = 0, fail = 0;
const chk = (n, cond) => { if (cond) ok++; else { fail++; console.log('  FAIL ' + n); } };

console.log('\n=== Las ponderaciones suman 100% ===');
// Si no suman 100, el promedio queda mal escalado y nadie lo nota a simple vista.
Object.entries(FEN).forEach(([nombre, def]) => {
  const suma = def.evals.reduce((a, [, peso]) => a + peso, 0);
  chk(nombre + ' suma 100 (da ' + suma + ')', Math.abs(suma - 100) < 0.01);
});
Object.entries(UC).forEach(([nombre, evals]) => {
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

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
