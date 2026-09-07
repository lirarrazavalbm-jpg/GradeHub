// Estadísticas no es una vitrina de contadores. Con pocas notas —el estado
// normal al empezar el semestre— tiene que explicar qué ya sabe, y cuando hay
// notas debe poner arriba el ramo que más exige antes que el conteo de aprobados.
const fs=require('fs'),path=require('path');
const raiz=path.join(__dirname,'..');
const render=fs.readFileSync(process.env.GRADEHUB_RENDER||path.join(raiz,'render-main.js'),'utf8');
const css=fs.readFileSync(process.env.GRADEHUB_CSS||path.join(raiz,'styles.css'),'utf8');
let ok=0,fail=0;
const chk=(n,c)=>{console.log(`  ${c?'OK  ':'FAIL'} ${n}`);if(c)ok++;else fail++;};
const inicio=render.indexOf('function renderStats()');
const fin=render.indexOf('\n// Historial de semestres',inicio);
const stats=render.slice(inicio,fin);

console.log('\n=== Estadísticas guía decisiones, no cuenta tarjetas ===');
chk('el estado temprano reconoce el semestre sin notas y lo que ya está configurado',
  stats.includes('Tu semestre todavía está empezando.')&&stats.includes('evaluaciones configuradas'));
chk('la situación junta promedio actual y avance real en una lectura',
  /stats-situation-card[^>]*aria-label="\$\{avance\.pct\}% de las evaluaciones evaluado"/.test(stats)&&
  stats.includes('Promedio actual')&&stats.includes('stats-situation-progress'));
chk('la prioridad usa la misma cuenta de nota necesaria y aparece antes del mapa',
  stats.includes('const falta=loQueFaltaPorRamo(S.ramos);')&&stats.includes('Qué mirar primero')&&
  stats.indexOf('Qué mirar primero')<stats.indexOf('Mapa de tus ramos')&&/falta\.slice\(0,3\)/.test(stats));
chk('cada ramo conserva promedio, avance y estado entendible',
  stats.includes('stats-ramo-row')&&stats.includes('Aún sin notas')&&stats.includes('Todo evaluado')&&stats.includes('en lo que queda'));
chk('se elimina el resumen genérico de cuatro tarjetas',
  !stats.includes('<span class="section-hd-title">Resumen</span>')&&!stats.includes('<div class="stats-grid">'));

console.log('\n=== El mapa sigue siendo legible en teléfono ===');
chk('las filas permiten truncar nombres largos y alinean números',
  /\.stats-ramo-main\{[^}]*min-width:0/.test(css)&&/\.stats-ramo-main strong\{[^}]*text-overflow:ellipsis/.test(css)&&
  /\.stats-ramo-avg\{[^}]*font-variant-numeric:tabular-nums/.test(css));
chk('la versión angosta simplifica el mapa sin ocultar promedio ni estado',
  css.includes('@media(max-width:380px){.stats-ramo-row{gap:9px;padding-right:11px;}.stats-ramo-progress{display:none;}')&&
  !/\.stats-ramo-avg\{display:none/.test(css));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
