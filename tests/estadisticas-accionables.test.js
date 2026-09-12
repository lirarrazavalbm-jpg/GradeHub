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
chk('la situación parte por el avance y deja el promedio general en Inicio',
  /stats-situation-card[^>]*aria-label="\$\{avance\.pct\}% de las evaluaciones evaluado"/.test(stats)&&
  /section-hd-title">Avance del semestre<\/span>[\s\S]{0,500}stats-situation-top[\s\S]{0,300}\$\{avance\.pct\}%/.test(stats)&&
  !/class="stat-label">Avance del semestre<\/div>/.test(stats)&&
  !/stats-situation-top[\s\S]{0,700}Promedio actual/.test(stats));
chk('la prioridad usa la misma cuenta de nota necesaria',
  stats.includes('const falta=loQueFaltaPorRamo(S.ramos);')&&stats.includes('Tus prioridades hoy')&&
  /falta\.slice\(0,3\)/.test(stats));
// El "Mapa de tus ramos" listaba los ramos otra vez, con su color, su avance y
// su promedio: lo mismo que "Mis ramos" en Inicio, en la pantalla de al lado.
// Se retiró para dejarle el espacio a algo que Inicio no puede mostrar.
//
// Lo que sí era propio del mapa —el estado por ramo, "Necesitas 5,2 en lo que
// queda"— se conserva en "Tus prioridades hoy", que lo muestra para los tres que
// más exigen. Para el resto deja de estar a la vista en Estadísticas; se ve
// entrando al ramo.
chk('el mapa ya no duplica la lista de ramos de Inicio',
  !stats.includes('Mapa de tus ramos')&&!stats.includes('stats-ramo-row'));
chk('y el estado por ramo sigue disponible en las prioridades',
  stats.includes('stats-priority-row')&&stats.includes('en lo pendiente'));
chk('se elimina el resumen genérico de cuatro tarjetas',
  !stats.includes('<span class="section-hd-title">Resumen</span>')&&!stats.includes('<div class="stats-grid">'));

console.log('\n=== Las prioridades siguen siendo legibles en teléfono ===');
chk('las filas truncan nombres largos y alinean los números',
  /\.ag-row-name\{[^}]*text-overflow:ellipsis/.test(css)||/\.ag-row-main\{[^}]*min-width:0/.test(css));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
