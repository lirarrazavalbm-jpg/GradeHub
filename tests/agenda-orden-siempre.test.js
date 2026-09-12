// El control de ordenar la Agenda vivía dentro del encabezado "Próximos 7 días".
// Ese encabezado es condicional: `resumenSemanaAgenda` devuelve null cuando no
// hay nada en la semana, y `resumenSemanaHTML` entonces devuelve string vacío —
// llevándose el control con él. Quien tenía su próxima prueba en dos semanas se
// quedaba sin poder ordenar dieciséis evaluaciones. No hay error, no hay consola
// roja: el control simplemente no está.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const render=fs.readFileSync(process.env.GRADEHUB_AGENDA||raiz+'render-agenda.js','utf8');
const css=fs.readFileSync(raiz+'styles.css','utf8');
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

const saca=n=>(render.match(new RegExp('\\nfunction '+n+'\\([\\s\\S]*?\\n\\}'))||[''])[0];
const ctx={r2:v=>Math.round(v*100)/100,esc:v=>String(v),agendaOrdenActual:'recomendado',
  pesoEventoAgenda:()=>10};
vm.createContext(ctx);
['resumenSemanaAgenda','resumenSemanaHTML','agendaOrdenHTML'].forEach(n=>{
  const src=saca(n);
  if(!src){console.log('  FAIL falta '+n);fail++;return;}
  vm.runInContext(src,ctx);
});
const corre=e=>{try{return vm.runInContext(e,ctx);}catch(err){console.log('  (error) '+err.message);return undefined;}};

console.log('=== El encabezado semanal desaparece, y con razón ===');
// Nada dentro de siete días: es el caso normal a comienzo de semestre.
const lejanas=JSON.stringify([{dias:14},{dias:21},{dias:30}]);
chk('sin nada esta semana no hay resumen semanal', corre(`resumenSemanaAgenda(${lejanas})`)===null);
chk('y su encabezado se pinta vacío', corre(`resumenSemanaHTML(${lejanas})`)==='');
chk('con algo esta semana sí aparece', /Próximos 7 días/.test(corre('resumenSemanaHTML([{dias:3}])')||''));

console.log('\n=== Pero el control de orden no se va con él ===');
// Es el punto: el control no puede colgar de un encabezado condicional.
chk('el encabezado semanal ya no lo lleva adentro',
  !/agendaOrdenHTML/.test(saca('resumenSemanaHTML')));
// Va donde sí existe siempre que haya algo por venir, que es cuando ordenar
// significa algo. Y es el mismo lugar donde el orden decide qué se destaca.
chk('lo lleva el encabezado de prioridades, que se pinta con cualquier pendiente',
  /ag-priority-heading[\s\S]{0,220}\$\{agendaOrdenHTML\(agendaOrdenActual\)\}/.test(render));
chk('y ese encabezado solo depende de que haya algo por venir',
  /if\(porVenir\.length>0\)\{[\s\S]{0,900}ag-priority-heading/.test(render));

console.log('\n=== El control sigue siendo el mismo ===');
const html=corre('agendaOrdenHTML("peso")')||'';
chk('ofrece las tres formas de ordenar',
  /Recomendado/.test(html)&&/Fecha/.test(html)&&/Peso/.test(html));
chk('y marca la elegida', /class="ag-order-option active"[^>]*>Peso</.test(html)||/active[\s\S]{0,120}>Peso</.test(html));

console.log('\n=== Y el botón Calendario se ve clickeable ===');
// Sin borde ni fondo se leía como un título más de la barra. Es el único
// `.topbar-link` de la app, así que la regla no arrastra nada más.
const regla=(css.match(/\.topbar-link\{[^}]*\}/)||[''])[0];
chk('tiene borde propio, no `border:none`', /--border2/.test(regla)&&!/border:none/.test(regla));
chk('y un fondo que lo despega de la barra', /background:var\(--card\)/.test(regla));
chk('y reacciona al apuntar', /\.topbar-link:hover\{[^}]*border-color/.test(css));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
