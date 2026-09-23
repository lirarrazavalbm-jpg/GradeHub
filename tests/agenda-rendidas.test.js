// El historial de Agenda incluye todas las notas, aunque nunca tuvieron fecha,
// y nace colapsado mostrando una sola referencia.
const fs=require('fs'),vm=require('vm'),path=require('path');
const raiz=process.env.GRADEHUB_ROOT||path.join(__dirname,'..');
const src=['data.js','engine.js','app.js','render-agenda.js'].map(f=>fs.readFileSync(path.join(raiz,f),'utf8')).join('\n');
const stub={style:{setProperty(){},removeProperty(){}},addEventListener(){},appendChild(){},classList:{add(){},remove(){},contains(){return false},toggle(){}},value:'',innerHTML:'',textContent:'',focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null},querySelectorAll(){return[]},querySelector(){return null},clientWidth:400,dataset:{},contains(){return true}};
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}}),scrollBy(){}},document:{getElementById:()=>stub,createElement:()=>stub,addEventListener(){},documentElement:stub,querySelector:()=>stub,querySelectorAll:()=>[],body:stub},localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',search:'',hash:''},history:{replaceState(){}},requestAnimationFrame:f=>f(),setTimeout,clearTimeout,console,getComputedStyle:()=>({getPropertyValue:()=> '0ms'})};
vm.createContext(ctx);vm.runInContext(src,ctx);
const run=s=>vm.runInContext(s,ctx);let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

const estado={ramos:[{id:'r1',nombre:'Cálculo',color:'#123456',gates:[],categorias:[
  {id:'c1',nombre:'Prueba',peso:50,directNota:true,fecha:'2026-09-01',notas:[{id:'n1',nombre:'Prueba',valor:5.5,peso:1}]},
  {id:'c2',nombre:'Controles',peso:50,directNota:true,slots:2,notas:[{id:'n2',nombre:'Control 1',valor:4.8,peso:1,slot:0},{id:'n3',nombre:'Control 2',valor:6.1,peso:1,slot:1}]},
]}]};
run(`S=normalize(${JSON.stringify(estado)})`);

console.log('\n=== Todas las notas llegan al fondo de Agenda ===');
const rendidas=JSON.parse(run('JSON.stringify(agendaRendidas().map(e=>({nombre:e.nota.nombre,fecha:e.fecha})))'));
chk('incluye las tres evaluaciones con nota',rendidas.length===3);
chk('incluye las dos que nunca tuvieron fecha',rendidas.filter(e=>e.fecha===null).length===2);
chk('la fechada más reciente queda como referencia inicial',rendidas[0].nombre==='Prueba');

console.log('\n=== La sección nace colapsada ===');
let html=run('agendaRendidasHTML(agendaRendidas(),[])');
chk('cerrada anuncia el total',/Ya rendidas/.test(html)&&/>3</.test(html));
chk('cerrada muestra solo la última',/Prueba/.test(html)&&!/Control 1/.test(html)&&!/Control 2/.test(html));
chk('la evaluación directa conserva su peso',/50%/.test(html)&&!/Peso variable/.test(html));
chk('la nota sin fecha se rotula sin inventar una',/Sin fecha/.test(run("agendaRendidaHTML(agendaRendidas().find(e=>e.nota.id==='n2'))")));

console.log('\n=== Se puede desplegar y volver a cerrar ===');
run('toggleRendidasAgenda()');
html=run('agendaRendidasHTML(agendaRendidas(),[])');
chk('abierta muestra las tres',/Prueba/.test(html)&&/Control 1/.test(html)&&/Control 2/.test(html));
chk('el control explica cómo volver a la última',/Ver última/.test(html));
run('toggleRendidasAgenda()');
chk('al cerrar vuelve a una sola',!(/Control 1/.test(run('agendaRendidasHTML(agendaRendidas(),[])'))));

console.log('\n=== Funciona aunque ninguna rendida tenga fecha ===');
run("delete S.ramos[0].categorias[0].fecha;agendaRendidasAbiertas=false;renderAgenda()");
chk('no cae en la pantalla vacía',/Ya rendidas/.test(stub.innerHTML)&&/Control 2/.test(stub.innerHTML));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);process.exit(fail?1:0);
